import type { VercelResponse } from '@vercel/node'
import { z } from 'zod'
import { prisma } from '../prisma.js'
import type { AuthedRequest } from '../middleware.js'
import { logAudit } from '../audit.js'
import { notifyRole, notifyUsers } from '../notify.js'
import { formatDisplayName } from '../names.js'
import { forbid, isHrOrAdmin, myEmployee, notFound, parseBody } from './util.js'

// GET /hr/hr-requests — employees see their own; HR/Admin see all.
// POST — an employee files a request. PUT /:id — HR/Admin move it along
// Pending -> Processing -> Completed -> Closed (forward only).

const TYPES = [
  'certificate_of_employment',
  'salary_certificate',
  'employment_verification',
  'document_request',
  'benefit_concern',
  'hr_concern',
  'other',
] as const
const STATUSES = ['pending', 'processing', 'completed', 'closed'] as const

const createSchema = z.object({
  type: z.enum(TYPES),
  subject: z.string().trim().min(1).max(200),
  details: z.string().trim().max(2000).optional(),
})

const updateSchema = z.object({
  status: z.enum(STATUSES).optional(),
  resolution: z.string().trim().max(2000).nullable().optional(),
})

const include = { employee: { include: { user: true } } } as const

function serialize(r: {
  id: string
  type: string
  subject: string
  details: string | null
  status: string
  resolution: string | null
  createdAt: Date
  updatedAt: Date
  employee: { user: { firstName: string; middleName: string | null; lastName: string } }
}) {
  return {
    id: r.id,
    type: r.type,
    subject: r.subject,
    details: r.details,
    status: r.status,
    resolution: r.resolution,
    employeeName: formatDisplayName(r.employee.user.firstName, r.employee.user.middleName, r.employee.user.lastName),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }
}

export async function handler(req: AuthedRequest, res: VercelResponse) {
  const sub = typeof req.query.sub === 'string' ? req.query.sub : undefined

  if (!sub && req.method === 'GET') {
    const where = isHrOrAdmin(req) ? {} : { employee: { userId: req.auth.sub } }
    const rows = await prisma.hrRequest.findMany({ where, include, orderBy: { createdAt: 'desc' } })
    res.status(200).json(rows.map(serialize))
    return
  }

  if (!sub && req.method === 'POST') {
    const data = parseBody(createSchema, req.body, res)
    if (!data) return
    const employee = await myEmployee(req)
    if (!employee) {
      res.status(404).json({ message: 'No employee profile on file — ask HR to set one up first' })
      return
    }
    const created = await prisma.hrRequest.create({ data: { ...data, employeeId: employee.id }, include })
    logAudit(req.auth.sub, 'create', 'hr_request', created.id)
    await notifyRole(
      ['hr', 'admin'],
      { type: 'hr_request', title: 'New HR request', body: data.subject, link: '/hr-requests' },
      req.auth.sub,
    )
    res.status(201).json(serialize(created))
    return
  }

  if (sub && req.method === 'PUT') {
    if (!isHrOrAdmin(req)) return forbid(res)
    const data = parseBody(updateSchema, req.body, res)
    if (!data) return
    const existing = await prisma.hrRequest.findUnique({ where: { id: sub }, include })
    if (!existing) return notFound(res, 'Request not found')

    if (data.status && STATUSES.indexOf(data.status) < STATUSES.indexOf(existing.status as (typeof STATUSES)[number])) {
      res.status(400).json({ message: 'A request can only move forward: Pending, Processing, Completed, Closed' })
      return
    }

    const updated = await prisma.hrRequest.update({
      where: { id: sub },
      data: {
        ...(data.status !== undefined && { status: data.status }),
        ...(data.resolution !== undefined && { resolution: data.resolution }),
        handledBy: req.auth.sub,
      },
      include,
    })
    logAudit(req.auth.sub, 'update', 'hr_request', sub)

    if (data.status && data.status !== existing.status) {
      await notifyUsers([existing.employee.userId], {
        type: 'hr_request',
        title: `Your HR request is now ${data.status}`,
        body: existing.subject,
        link: '/hr-requests',
      })
    }
    res.status(200).json(serialize(updated))
    return
  }

  notFound(res)
}
