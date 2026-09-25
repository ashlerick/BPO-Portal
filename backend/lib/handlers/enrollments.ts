import type { VercelResponse } from '@vercel/node'
import { z } from 'zod'
import { prisma } from '../prisma.js'
import type { AuthedRequest } from '../middleware.js'
import { logAudit } from '../audit.js'
import { formatDisplayName } from '../names.js'
import { appendHistory, dateOnlyPattern, forbid, isHrOrAdmin, notFound, parseBody, queryString, toDate } from './util.js'

// GET /hr/enrollments — HR/Admin: everyone's (filter ?employeeId / ?benefitId);
// an employee: only their own. POST / PUT / DELETE — HR/Admin only.
// Every change is appended to the enrollment's history.

const STATUSES = ['pending', 'enrolled', 'waived', 'terminated'] as const

const dateField = z.string().regex(dateOnlyPattern, 'Dates must be YYYY-MM-DD').nullable().optional()

const upsertSchema = z.object({
  employeeId: z.string().uuid(),
  benefitId: z.string().uuid(),
  status: z.enum(STATUSES).default('pending'),
  effectiveDate: dateField,
  endDate: dateField,
  dependentIds: z.array(z.string().uuid()).max(20).default([]),
  notes: z.string().trim().max(1000).nullable().optional(),
})

const updateSchema = upsertSchema.omit({ employeeId: true, benefitId: true }).partial()

const include = {
  employee: { include: { user: true } },
  benefit: true,
} as const

function serialize(e: {
  id: string
  employeeId: string
  benefitId: string
  status: string
  effectiveDate: Date | null
  endDate: Date | null
  dependentIds: string[]
  notes: string | null
  history: unknown
  employee: { user: { firstName: string; middleName: string | null; lastName: string } }
  benefit: { title: string; category: string; provider: string | null; providerContact: string | null }
}) {
  return {
    id: e.id,
    employeeId: e.employeeId,
    employeeName: formatDisplayName(e.employee.user.firstName, e.employee.user.middleName, e.employee.user.lastName),
    benefitId: e.benefitId,
    benefitTitle: e.benefit.title,
    benefitCategory: e.benefit.category,
    provider: e.benefit.provider,
    providerContact: e.benefit.providerContact,
    status: e.status,
    effectiveDate: e.effectiveDate,
    endDate: e.endDate,
    dependentIds: e.dependentIds,
    notes: e.notes,
    history: e.history,
  }
}

export async function handler(req: AuthedRequest, res: VercelResponse) {
  const sub = typeof req.query.sub === 'string' ? req.query.sub : undefined

  if (!sub && req.method === 'GET') {
    const manager = isHrOrAdmin(req)
    const employeeId = queryString(req, 'employeeId')
    const benefitId = queryString(req, 'benefitId')
    const rows = await prisma.benefitEnrollment.findMany({
      where: {
        ...(manager ? {} : { employee: { userId: req.auth.sub } }),
        ...(manager && employeeId ? { employeeId } : {}),
        ...(benefitId ? { benefitId } : {}),
      },
      include,
      orderBy: { updatedAt: 'desc' },
    })
    // Employees don't need the internal change log or HR notes.
    res.status(200).json(manager ? rows.map(serialize) : rows.map((r) => ({ ...serialize(r), history: [], notes: null })))
    return
  }

  if (!isHrOrAdmin(req)) return forbid(res)

  if (!sub && req.method === 'POST') {
    const data = parseBody(upsertSchema, req.body, res)
    if (!data) return
    const existing = await prisma.benefitEnrollment.findUnique({
      where: { employeeId_benefitId: { employeeId: data.employeeId, benefitId: data.benefitId } },
    })
    const fields = {
      status: data.status,
      effectiveDate: data.effectiveDate ? toDate(data.effectiveDate) : null,
      endDate: data.endDate ? toDate(data.endDate) : null,
      dependentIds: data.dependentIds,
      notes: data.notes ?? null,
    }
    const row = existing
      ? await prisma.benefitEnrollment.update({
          where: { id: existing.id },
          data: { ...fields, history: appendHistory(existing.history, req.auth.sub, 'changed', `status: ${data.status}`) },
          include,
        })
      : await prisma.benefitEnrollment.create({
          data: {
            employeeId: data.employeeId,
            benefitId: data.benefitId,
            ...fields,
            history: appendHistory([], req.auth.sub, 'created', `status: ${data.status}`),
          },
          include,
        })
    logAudit(req.auth.sub, existing ? 'update' : 'create', 'benefit_enrollment', row.id)
    res.status(existing ? 200 : 201).json(serialize(row))
    return
  }

  if (sub && req.method === 'PUT') {
    const data = parseBody(updateSchema, req.body, res)
    if (!data) return
    const existing = await prisma.benefitEnrollment.findUnique({ where: { id: sub } })
    if (!existing) return notFound(res, 'Enrollment not found')
    const changed = Object.keys(data).join(', ')
    const row = await prisma.benefitEnrollment.update({
      where: { id: sub },
      data: {
        ...(data.status !== undefined && { status: data.status }),
        ...(data.effectiveDate !== undefined && { effectiveDate: data.effectiveDate ? toDate(data.effectiveDate) : null }),
        ...(data.endDate !== undefined && { endDate: data.endDate ? toDate(data.endDate) : null }),
        ...(data.dependentIds !== undefined && { dependentIds: data.dependentIds }),
        ...(data.notes !== undefined && { notes: data.notes }),
        history: appendHistory(existing.history, req.auth.sub, 'changed', changed),
      },
      include,
    })
    logAudit(req.auth.sub, 'update', 'benefit_enrollment', sub)
    res.status(200).json(serialize(row))
    return
  }

  if (sub && req.method === 'DELETE') {
    await prisma.benefitEnrollment.deleteMany({ where: { id: sub } })
    logAudit(req.auth.sub, 'delete', 'benefit_enrollment', sub)
    res.status(204).end()
    return
  }

  notFound(res)
}
