import type { VercelResponse } from '@vercel/node'
import { z } from 'zod'
import { prisma } from '../prisma.js'
import type { AuthedRequest } from '../middleware.js'
import { logAudit } from '../audit.js'
import { notifyUsers } from '../notify.js'
import { formatDisplayName } from '../names.js'
import { dateOnlyPattern, forbid, isHrOrAdmin, isSupervisorOf, myEmployee, notFound, parseBody, queryString, toDate } from './util.js'

// To-dos under /hr/todos (the old sheet's "To Do's": task, description, due date, link).
//   GET            own to-dos; ?employeeId= for HR/Admin or that employee's supervisor
//   POST           assign to one or many employees (HR/Admin: anyone,
//                  supervisor: their direct reports only)
//   PUT /:id       {status: open|done} — the employee, or whoever may assign
//   DELETE /:id    soft delete: whoever assigned it, or HR/Admin
//   POST /:id?action=comment   {body}
//   GET ?assigned=1            to-dos I assigned (HR/Admin: =all for everyone's)

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

const PRIORITIES = ['low', 'normal', 'urgent'] as const

const createSchema = z.object({
  employeeIds: z.array(z.string().uuid()).min(1).max(300),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).nullable().optional(),
  dueDate: z.string().regex(dateOnlyPattern, 'Due date must be YYYY-MM-DD').nullable().optional(),
  link: link.nullable().optional(),
  priority: z.enum(PRIORITIES).optional(),
})

// One body for both: a status change (assignee, or whoever may assign) and
// edits to the task itself (HR/Admin, or the person who assigned it).
const updateSchema = z.object({
  status: z.enum(['open', 'done']).optional(),
  // Optional note left when completing; stored as a comment.
  note: z.string().trim().max(1000).nullable().optional(),
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  dueDate: z.string().regex(dateOnlyPattern, 'Due date must be YYYY-MM-DD').nullable().optional(),
  link: link.nullable().optional(),
  priority: z.enum(PRIORITIES).optional(),
})

const commentSchema = z.object({ body: z.string().trim().min(1, 'Write a comment first').max(1000) })

const include = {
  employee: { include: { user: true } },
  comments: { orderBy: { createdAt: 'asc' } },
} as const

type TodoRow = Awaited<ReturnType<typeof prisma.todo.findMany<{ include: typeof include }>>>[number]

// Names of everyone a set of to-dos mentions (assigner, completer, commenters).
async function nameMap(rows: TodoRow[]): Promise<Map<string, string>> {
  const ids = new Set<string>()
  for (const t of rows) {
    ids.add(t.createdBy)
    if (t.completedBy) ids.add(t.completedBy)
    t.comments.forEach((c) => ids.add(c.authorId))
  }
  const users = await prisma.user.findMany({ where: { id: { in: [...ids] } } })
  return new Map(users.map((u) => [u.id, formatDisplayName(u.firstName, u.middleName, u.lastName)]))
}

function serialize(t: TodoRow, names: Map<string, string>) {
  return {
    id: t.id,
    employeeId: t.employeeId,
    employeeName: formatDisplayName(t.employee.user.firstName, t.employee.user.middleName, t.employee.user.lastName),
    title: t.title,
    description: t.description,
    dueDate: t.dueDate,
    link: t.link,
    status: t.status,
    priority: t.priority,
    completedAt: t.completedAt,
    completedByName: t.completedBy ? (names.get(t.completedBy) ?? null) : null,
    assignedById: t.createdBy,
    assignedByName: names.get(t.createdBy) ?? null,
    createdAt: t.createdAt,
    comments: t.comments.map((c) => ({
      id: c.id,
      authorId: c.authorId,
      authorName: names.get(c.authorId) ?? 'Someone',
      body: c.body,
      createdAt: c.createdAt,
    })),
  }
}

async function present(rows: TodoRow[]) {
  const names = await nameMap(rows)
  return rows.map((t) => serialize(t, names))
}

async function canManage(req: AuthedRequest, employeeId: string) {
  return isHrOrAdmin(req) || (await isSupervisorOf(req, employeeId))
}

async function actorName(userId: string): Promise<string> {
  const u = await prisma.user.findUnique({ where: { id: userId } })
  return u ? formatDisplayName(u.firstName, u.middleName, u.lastName) : 'Someone'
}

export async function handler(req: AuthedRequest, res: VercelResponse) {
  const sub = queryString(req, 'sub')
  const action = queryString(req, 'action')

  if (!sub && req.method === 'GET') {
    // The to-dos I assigned to other people.
    if (queryString(req, 'assigned')) {
      const rows = await prisma.todo.findMany({
        // HR/Admin can ask for every to-do (?assigned=all) to clean up mistakes.
        where: {
          deletedAt: null,
          ...(queryString(req, 'assigned') === 'all' && isHrOrAdmin(req) ? {} : { createdBy: req.auth.sub }),
        },
        include,
        orderBy: [{ status: 'desc' }, { dueDate: 'asc' }, { createdAt: 'desc' }],
      })
      return res.status(200).json(await present(rows))
    }
    const requested = queryString(req, 'employeeId')
    const me = await myEmployee(req)
    let employeeId = me?.id
    if (requested && requested !== me?.id) {
      if (!(await canManage(req, requested))) return forbid(res)
      employeeId = requested
    }
    if (!employeeId) return res.status(200).json([])
    const rows = await prisma.todo.findMany({
      where: { employeeId, deletedAt: null },
      include,
      orderBy: [{ status: 'desc' }, { dueDate: 'asc' }, { createdAt: 'desc' }],
    })
    return res.status(200).json(await present(rows))
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
        description: data.description?.trim() || null,
        dueDate: data.dueDate ? toDate(data.dueDate) : null,
        link: data.link ?? null,
        priority: data.priority ?? 'normal',
        createdBy: req.auth.sub,
      })),
    })
    logAudit(req.auth.sub, 'create', 'todo', `${employees.length} employee(s)`)
    await notifyUsers(
      employees.map((e) => e.userId),
      {
        type: 'todo',
        title: data.priority === 'urgent' ? 'New urgent to-do' : 'New to-do',
        body: data.title,
        link: '/',
      },
    )
    return res.status(201).json({ assigned: employees.length })
  }

  // ---- a comment on a to-do
  if (sub && action === 'comment' && req.method === 'POST') {
    const data = parseBody(commentSchema, req.body, res)
    if (!data) return
    const todo = await prisma.todo.findFirst({ where: { id: sub, deletedAt: null }, include: { employee: true } })
    if (!todo) return notFound(res, 'To-do not found')
    const me = await myEmployee(req)
    const isAssignee = me?.id === todo.employeeId
    if (!isAssignee && todo.createdBy !== req.auth.sub && !(await canManage(req, todo.employeeId))) return forbid(res)
    await prisma.todoComment.create({ data: { todoId: sub, authorId: req.auth.sub, body: data.body } })
    // Tell the other side: the assigner when the assignee writes, and the reverse.
    const other = isAssignee ? todo.createdBy : todo.employee.userId
    if (other !== req.auth.sub) {
      await notifyUsers([other], {
        type: 'todo',
        title: `${await actorName(req.auth.sub)} commented on a to-do`,
        body: todo.title,
        link: '/',
      })
    }
    const fresh = await prisma.todo.findFirst({ where: { id: sub, deletedAt: null }, include })
    return res.status(201).json((await present([fresh!]))[0])
  }

  if (sub && req.method === 'PUT') {
    const data = parseBody(updateSchema, req.body, res)
    if (!data) return
    const todo = await prisma.todo.findFirst({ where: { id: sub, deletedAt: null } })
    if (!todo) return notFound(res, 'To-do not found')
    const me = await myEmployee(req)
    const isAssignee = me?.id === todo.employeeId
    const manager = await canManage(req, todo.employeeId)
    if (!isAssignee && !manager) return forbid(res)

    const editsTask =
      data.title !== undefined ||
      data.description !== undefined ||
      data.dueDate !== undefined ||
      data.link !== undefined ||
      data.priority !== undefined
    if (editsTask && !isHrOrAdmin(req) && todo.createdBy !== req.auth.sub) return forbid(res)

    const becameDone = data.status === 'done' && todo.status !== 'done'
    await prisma.todo.update({
      where: { id: sub },
      data: {
        ...(data.title !== undefined && { title: data.title }),
        ...(data.description !== undefined && { description: data.description?.trim() || null }),
        ...(data.dueDate !== undefined && { dueDate: data.dueDate ? toDate(data.dueDate) : null }),
        ...(data.link !== undefined && { link: data.link }),
        ...(data.priority !== undefined && { priority: data.priority }),
        ...(data.status !== undefined && {
          status: data.status,
          completedAt: data.status === 'done' ? new Date() : null,
          completedBy: data.status === 'done' ? req.auth.sub : null,
        }),
      },
    })
    if (data.note && data.status === 'done') {
      await prisma.todoComment.create({ data: { todoId: sub, authorId: req.auth.sub, body: data.note } })
    }
    // The person who assigned it hears when it is done.
    if (becameDone && todo.createdBy !== req.auth.sub) {
      await notifyUsers([todo.createdBy], {
        type: 'todo',
        title: `${await actorName(req.auth.sub)} completed a to-do`,
        body: todo.title,
        link: '/',
      })
    }
    const fresh = await prisma.todo.findFirst({ where: { id: sub, deletedAt: null }, include })
    return res.status(200).json((await present([fresh!]))[0])
  }

  if (sub && req.method === 'DELETE') {
    // Soft delete. Whoever assigned the to-do can remove it (an entry made in
    // error, a double submit), and so can HR/Admin. The assignee can't delete
    // a task given to them, only complete it.
    const todo = await prisma.todo.findFirst({ where: { id: sub, deletedAt: null } })
    if (!todo) return res.status(204).end()
    if (!isHrOrAdmin(req) && todo.createdBy !== req.auth.sub) return forbid(res)
    await prisma.todo.update({ where: { id: sub }, data: { deletedAt: new Date() } })
    logAudit(req.auth.sub, 'delete', 'todo', sub)
    return res.status(204).end()
  }

  notFound(res)
}
