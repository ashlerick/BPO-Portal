import type { VercelResponse } from '@vercel/node'
import { z } from 'zod'
import { prisma } from '../prisma.js'
import type { AuthedRequest } from '../middleware.js'
import { logAudit } from '../audit.js'
import { formatDisplayName } from '../names.js'
import { dateOnlyPattern, forbid, isHrOrAdmin, notFound, parseBody, queryString, toDate } from './util.js'

// Onboarding and offboarding checklists, HR/Admin only.
//   GET    /hr/checklists?kind=onboarding|offboarding[&employeeId=]
//   POST   /hr/checklists                 create one (with its default tasks)
//   PUT    /hr/checklists/:id             notes / separation details / mark complete
//   PUT    /hr/checklists/:id?task=:taskId   tick a task on or off (+ note)
//   DELETE /hr/checklists/:id

const KINDS = ['onboarding', 'offboarding'] as const

// HR dropped "Account creation" and "Equipment" from the onboarding list.
const DEFAULT_TASKS: Record<(typeof KINDS)[number], string[]> = {
  onboarding: [
    'Employment contract',
    'Government requirements',
    'IDs / documents',
    'Orientation',
    'Company policies acknowledgment',
    'Training',
    'HMO / benefits enrollment',
  ],
  offboarding: [
    'Resignation / termination notice',
    'Clearance',
    'Exit interview',
    'Final pay status',
    'Company property return',
    'Account deactivation',
    'Separation documents',
  ],
}

const createSchema = z.object({
  employeeId: z.string().uuid(),
  kind: z.enum(KINDS),
  separationType: z.enum(['resignation', 'termination']).optional(),
  effectiveDate: z.string().regex(dateOnlyPattern, 'effectiveDate must be YYYY-MM-DD').optional(),
  notes: z.string().trim().max(1000).optional(),
})

const updateSchema = z.object({
  notes: z.string().trim().max(1000).nullable().optional(),
  separationType: z.enum(['resignation', 'termination']).nullable().optional(),
  effectiveDate: z.string().regex(dateOnlyPattern, 'effectiveDate must be YYYY-MM-DD').nullable().optional(),
  status: z.enum(['open', 'completed']).optional(),
})

const taskSchema = z.object({
  done: z.boolean().optional(),
  note: z.string().trim().max(500).nullable().optional(),
})

const include = {
  employee: { include: { user: true } },
  tasks: { orderBy: { position: 'asc' } },
} as const

type ChecklistRow = Awaited<ReturnType<typeof loadOne>>

function loadOne(id: string) {
  return prisma.checklist.findUnique({ where: { id }, include })
}

function serialize(c: NonNullable<ChecklistRow>) {
  const done = c.tasks.filter((t) => t.done).length
  return {
    id: c.id,
    employeeId: c.employeeId,
    employeeName: formatDisplayName(c.employee.user.firstName, c.employee.user.middleName, c.employee.user.lastName),
    kind: c.kind,
    status: c.status,
    separationType: c.separationType,
    effectiveDate: c.effectiveDate,
    notes: c.notes,
    completedAt: c.completedAt,
    createdAt: c.createdAt,
    progress: { done, total: c.tasks.length },
    tasks: c.tasks.map((t) => ({ id: t.id, label: t.label, done: t.done, doneAt: t.doneAt, note: t.note })),
  }
}

export async function handler(req: AuthedRequest, res: VercelResponse) {
  if (!isHrOrAdmin(req)) return forbid(res)
  const sub = typeof req.query.sub === 'string' ? req.query.sub : undefined

  if (!sub && req.method === 'GET') {
    const kind = queryString(req, 'kind')
    const employeeId = queryString(req, 'employeeId')
    const rows = await prisma.checklist.findMany({
      where: { ...(kind ? { kind } : {}), ...(employeeId ? { employeeId } : {}) },
      include,
      orderBy: { createdAt: 'desc' },
    })
    res.status(200).json(rows.map(serialize))
    return
  }

  if (!sub && req.method === 'POST') {
    const data = parseBody(createSchema, req.body, res)
    if (!data) return
    const open = await prisma.checklist.findFirst({
      where: { employeeId: data.employeeId, kind: data.kind, status: 'open' },
    })
    if (open) {
      res.status(409).json({ message: `This employee already has an open ${data.kind} checklist` })
      return
    }
    const created = await prisma.checklist.create({
      data: {
        employeeId: data.employeeId,
        kind: data.kind,
        separationType: data.kind === 'offboarding' ? (data.separationType ?? null) : null,
        effectiveDate: data.effectiveDate ? toDate(data.effectiveDate) : null,
        notes: data.notes ?? null,
        createdBy: req.auth.sub,
        tasks: { create: DEFAULT_TASKS[data.kind].map((label, position) => ({ label, position })) },
      },
      include,
    })
    logAudit(req.auth.sub, 'create', data.kind, created.id)
    res.status(201).json(serialize(created))
    return
  }

  if (sub && req.method === 'PUT') {
    const taskId = queryString(req, 'task')
    if (taskId) {
      const data = parseBody(taskSchema, req.body, res)
      if (!data) return
      const task = await prisma.checklistTask.findFirst({ where: { id: taskId, checklistId: sub } })
      if (!task) return notFound(res, 'Task not found')
      await prisma.checklistTask.update({
        where: { id: taskId },
        data: {
          ...(data.done !== undefined && {
            done: data.done,
            doneAt: data.done ? new Date() : null,
            doneBy: data.done ? req.auth.sub : null,
          }),
          ...(data.note !== undefined && { note: data.note }),
        },
      })
      logAudit(req.auth.sub, 'update_task', 'checklist', sub)
    } else {
      const data = parseBody(updateSchema, req.body, res)
      if (!data) return
      if (!(await prisma.checklist.findUnique({ where: { id: sub } }))) return notFound(res, 'Checklist not found')
      await prisma.checklist.update({
        where: { id: sub },
        data: {
          ...(data.notes !== undefined && { notes: data.notes }),
          ...(data.separationType !== undefined && { separationType: data.separationType }),
          ...(data.effectiveDate !== undefined && { effectiveDate: data.effectiveDate ? toDate(data.effectiveDate) : null }),
          ...(data.status !== undefined && {
            status: data.status,
            completedAt: data.status === 'completed' ? new Date() : null,
          }),
        },
      })
      logAudit(req.auth.sub, 'update', 'checklist', sub)
    }
    const fresh = await loadOne(sub)
    if (!fresh) return notFound(res)
    res.status(200).json(serialize(fresh))
    return
  }

  if (sub && req.method === 'DELETE') {
    await prisma.checklist.deleteMany({ where: { id: sub } })
    logAudit(req.auth.sub, 'delete', 'checklist', sub)
    res.status(204).end()
    return
  }

  notFound(res)
}
