import type { VercelResponse } from '@vercel/node'
import { z } from 'zod'
import { prisma } from '../prisma.js'
import type { AuthedRequest } from '../middleware.js'
import { logAudit } from '../audit.js'
import { notifyUsers } from '../notify.js'
import { dateOnlyPattern, forbid, isHrOrAdmin, isSupervisorOf, myEmployee, notFound, parseBody, queryString, toDate } from './util.js'

// To-dos under /hr/todos (the old sheet's "To Do's": task, due date, link).
//   GET            own to-dos; ?employeeId= for HR/Admin or that employee's supervisor
//   POST           assign to one or many employees (HR/Admin: anyone,
//                  supervisor: their direct reports only)
//   PUT /:id       {status: open|done} — the employee, or whoever may assign
//   DELETE /:id    HR/Admin, or the supervisor who assigned it

const link = z
  .string()
  .trim()
  .max(500)
  .refine((v) => {
    try {
      return new URL(v).protocol === 'https:'
    } catch {
      return false
    }
  }, 'The link must start with https://')

const createSchema = z.object({
  employeeIds: z.array(z.string().uuid()).min(1).max(300),
  title: z.string().trim().min(1).max(200),
  dueDate: z.string().regex(dateOnlyPattern, 'Due date must be YYYY-MM-DD').nullable().optional(),
  link: link.nullable().optional(),
})

const statusSchema = z.object({ status: z.enum(['open', 'done']) })

function serialize(t: {
  id: string
  employeeId: string
  title: string
  dueDate: Date | null
  link: string | null
  status: string
  completedAt: Date | null
  createdAt: Date
}) {
  return {
    id: t.id,
    employeeId: t.employeeId,
    title: t.title,
    dueDate: t.dueDate,
    link: t.link,
    status: t.status,
    completedAt: t.completedAt,
    createdAt: t.createdAt,
  }
}

async function canManage(req: AuthedRequest, employeeId: string) {
  return isHrOrAdmin(req) || (await isSupervisorOf(req, employeeId))
}

export async function handler(req: AuthedRequest, res: VercelResponse) {
  const sub = queryString(req, 'sub')

  if (!sub && req.method === 'GET') {
    const requested = queryString(req, 'employeeId')
    const me = await myEmployee(req)
    let employeeId = me?.id
    if (requested && requested !== me?.id) {
      if (!(await canManage(req, requested))) return forbid(res)
      employeeId = requested
    }
    if (!employeeId) return res.status(200).json([])
    const rows = await prisma.todo.findMany({
      where: { employeeId },
      orderBy: [{ status: 'desc' }, { dueDate: 'asc' }, { createdAt: 'desc' }],
    })
    return res.status(200).json(rows.map(serialize))
  }

  if (!sub && req.method === 'POST') {
    const data = parseBody(createSchema, req.body, res)
    if (!data) return
    const employees = await prisma.employee.findMany({
      where: { id: { in: data.employeeIds } },
      select: { id: true, userId: true, managerId: true },
    })
    if (employees.length !== new Set(data.employeeIds).size) return notFound(res, 'Employee not found')
    if (!isHrOrAdmin(req)) {
      const me = await myEmployee(req)
      if (!me || employees.some((e) => e.managerId !== me.id)) return forbid(res)
    }
    await prisma.todo.createMany({
      data: employees.map((e) => ({
        employeeId: e.id,
        title: data.title,
        dueDate: data.dueDate ? toDate(data.dueDate) : null,
        link: data.link ?? null,
        createdBy: req.auth.sub,
      })),
    })
    logAudit(req.auth.sub, 'create', 'todo', `${employees.length} employee(s)`)
    await notifyUsers(
      employees.map((e) => e.userId),
      { type: 'todo', title: 'New to-do', body: data.title, link: '/' },
    )
    return res.status(201).json({ assigned: employees.length })
  }

  if (sub && req.method === 'PUT') {
    const data = parseBody(statusSchema, req.body, res)
    if (!data) return
    const todo = await prisma.todo.findUnique({ where: { id: sub } })
    if (!todo) return notFound(res, 'To-do not found')
    const me = await myEmployee(req)
    if (me?.id !== todo.employeeId && !(await canManage(req, todo.employeeId))) return forbid(res)
    const updated = await prisma.todo.update({
      where: { id: sub },
      data: { status: data.status, completedAt: data.status === 'done' ? new Date() : null },
    })
    return res.status(200).json(serialize(updated))
  }

  if (sub && req.method === 'DELETE') {
    const todo = await prisma.todo.findUnique({ where: { id: sub } })
    if (!todo) return res.status(204).end()
    if (!isHrOrAdmin(req) && !(todo.createdBy === req.auth.sub && (await canManage(req, todo.employeeId)))) {
      return forbid(res)
    }
    await prisma.todo.delete({ where: { id: sub } })
    logAudit(req.auth.sub, 'delete', 'todo', sub)
    return res.status(204).end()
  }

  notFound(res)
}
