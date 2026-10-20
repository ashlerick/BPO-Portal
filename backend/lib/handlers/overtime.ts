import type { VercelResponse } from '@vercel/node'
import { z } from 'zod'
import type { OvertimeAllotment } from '@prisma/client'
import { prisma } from '../prisma.js'
import type { AuthedRequest } from '../middleware.js'
import { logAudit } from '../audit.js'
import { notifyUsers } from '../notify.js'
import { formatDisplayName } from '../names.js'
import { MAX_OVERTIME_MINUTES, overtimeView } from '../overtime.js'
import { dateOnlyPattern, forbid, isHrOrAdmin, myEmployee, notFound, parseBody, queryString, toDate } from './util.js'

// Overtime HR gives, under /hr/overtime (see .samples/plan/overtime.md). A row is a number of minutes for a person and a shift
// day, and that is what counts.
//   GET    ?from=&to=[&employeeId=]   the rows in a range of shift days. HR/Admin see everyone; anyone else sees their own.
//   POST   {employeeIds[], date, minutes, note?}   HR/Admin: give the same amount to each person, one row each.
//   PUT    /:id {minutes?, note?}     HR/Admin: change one row.
//   PUT    {ids[], minutes?, note?}   HR/Admin: change several rows at once. {ids[], remove: true} takes several away.
//   DELETE /:id                       HR/Admin: take a row away (the person is told).

const minutes = z.number().int().min(1, 'Give at least 1 minute').max(MAX_OVERTIME_MINUTES, 'No more than 12 hours at a time')

const createSchema = z.object({
  employeeIds: z.array(z.string().uuid()).min(1, 'Pick at least one person').max(200),
  date: z.string().regex(dateOnlyPattern, 'Date must be YYYY-MM-DD'),
  minutes,
  note: z.string().trim().max(300).optional(),
})

const editSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(200).optional(),
  minutes: minutes.optional(),
  note: z.string().trim().max(300).nullable().optional(),
  // Take the rows away instead of changing them.
  remove: z.literal(true).optional(),
})

const WITH_PERSON = { employee: { include: { user: { select: { firstName: true, middleName: true, lastName: true } } } } } as const
type WithPerson = OvertimeAllotment & { employee: { userId: string; user: { firstName: string; middleName: string | null; lastName: string } } }

const hours = (m: number) => (m % 60 === 0 ? `${m / 60} h` : m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`)
const dayLabel = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })

const withName = (row: WithPerson) => ({
  ...overtimeView(row),
  employeeName: formatDisplayName(row.employee.user.firstName, row.employee.user.middleName, row.employee.user.lastName),
})

async function loadViews(ids: string[]) {
  const rows = (await prisma.overtimeAllotment.findMany({ where: { id: { in: ids } }, include: WITH_PERSON })) as WithPerson[]
  return rows.map(withName)
}

// Applies one edit to the given rows (HR only; the caller has checked).
async function applyEdit(req: AuthedRequest, ids: string[], data: z.infer<typeof editSchema>) {
  const found = (await prisma.overtimeAllotment.findMany({ where: { id: { in: ids } }, include: WITH_PERSON })) as WithPerson[]
  for (const row of found) {
    const changes: string[] = []
    const patch: { minutes?: number; note?: string | null; updatedBy: string } = { updatedBy: req.auth.sub }
    if (data.minutes !== undefined && data.minutes !== row.minutes) {
      patch.minutes = data.minutes
      changes.push(`${hours(row.minutes)} -> ${hours(data.minutes)}`)
    }
    if (data.note !== undefined && (data.note || null) !== row.note) {
      patch.note = data.note || null
      changes.push('note')
    }
    if (changes.length === 0) continue
    await prisma.overtimeAllotment.update({ where: { id: row.id }, data: patch })
    await logAudit(req.auth.sub, 'update', 'overtime', row.id, 'success', changes.join('; '))
    if (patch.minutes !== undefined) {
      await notifyUsers([row.employee.userId], {
        type: 'overtime',
        title: 'Your overtime was changed',
        body: `${dayLabel(row.date)}: ${hours(patch.minutes)}`,
        link: '/my-time',
      })
    }
  }
  return loadViews(ids)
}

// Takes rows away and tells each person. Returns how many were removed.
async function removeRows(req: AuthedRequest, ids: string[]) {
  const found = (await prisma.overtimeAllotment.findMany({ where: { id: { in: ids } }, include: WITH_PERSON })) as WithPerson[]
  for (const row of found) {
    await prisma.overtimeAllotment.delete({ where: { id: row.id } })
    await logAudit(req.auth.sub, 'delete', 'overtime', row.id, 'success', `${hours(row.minutes)} on ${row.date.toISOString().slice(0, 10)}`)
    await notifyUsers([row.employee.userId], { type: 'overtime', title: 'Your overtime was removed', body: dayLabel(row.date), link: '/my-time' })
  }
  return found.length
}

export async function handler(req: AuthedRequest, res: VercelResponse) {
  const sub = queryString(req, 'sub')
  const hr = isHrOrAdmin(req)

  if (req.method === 'GET') {
    const from = queryString(req, 'from')
    const to = queryString(req, 'to') ?? from
    if (!from || !to || !dateOnlyPattern.test(from) || !dateOnlyPattern.test(to) || to < from) {
      return res.status(400).json({ message: 'from (and optionally to) is required, as YYYY-MM-DD' })
    }
    const requested = queryString(req, 'employeeId')
    let employeeId: string | undefined
    if (hr) employeeId = requested
    else {
      const me = await myEmployee(req)
      if (!me || (requested && requested !== me.id)) return me ? forbid(res) : res.status(200).json([])
      employeeId = me.id
    }
    const rows = (await prisma.overtimeAllotment.findMany({
      where: { ...(employeeId && { employeeId }), date: { gte: toDate(from), lte: toDate(to) } },
      include: WITH_PERSON,
      orderBy: [{ date: 'desc' }, { createdAt: 'asc' }],
      take: 1000,
    })) as WithPerson[]
    return res.status(200).json(rows.map(withName))
  }

  if (!hr) return forbid(res)

  if (req.method === 'POST') {
    const data = parseBody(createSchema, req.body, res)
    if (!data) return
    const people = await prisma.employee.findMany({ where: { id: { in: data.employeeIds }, user: { active: true } }, select: { id: true, userId: true } })
    if (people.length !== new Set(data.employeeIds).size) return notFound(res, 'Employee not found')
    const date = toDate(data.date)
    const created = await prisma.$transaction(
      people.map((p) =>
        prisma.overtimeAllotment.create({
          data: { employeeId: p.id, date, minutes: data.minutes, note: data.note || null, createdBy: req.auth.sub, updatedBy: req.auth.sub },
        }),
      ),
    )
    for (const row of created) await logAudit(req.auth.sub, 'create', 'overtime', row.id, 'success', `${hours(row.minutes)} on ${data.date}`)
    await notifyUsers(people.map((p) => p.userId), {
      type: 'overtime',
      title: 'Overtime given to you',
      body: `${dayLabel(date)}: ${hours(data.minutes)}`,
      link: '/my-time',
    })
    return res.status(201).json(await loadViews(created.map((r) => r.id)))
  }

  if (req.method === 'PUT') {
    const data = parseBody(editSchema, req.body, res)
    if (!data) return
    const ids = sub ? [sub] : data.ids
    if (!ids) return res.status(400).json({ message: 'Pick at least one row' })
    if (data.remove) {
      await removeRows(req, ids)
      return res.status(200).json([])
    }
    if (sub && !(await prisma.overtimeAllotment.findUnique({ where: { id: sub }, select: { id: true } }))) return notFound(res, 'Overtime not found')
    return res.status(200).json(await applyEdit(req, ids, data))
  }

  if (req.method === 'DELETE' && sub) {
    if ((await removeRows(req, [sub])) === 0) return notFound(res, 'Overtime not found')
    return res.status(204).end()
  }

  notFound(res)
}
