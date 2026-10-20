import type { VercelResponse } from '@vercel/node'
import { z } from 'zod'
import type { OvertimeAllotment } from '@prisma/client'
import { prisma } from '../prisma.js'
import type { AuthedRequest } from '../middleware.js'
import { logAudit } from '../audit.js'
import { notifyUsers } from '../notify.js'
import { formatDisplayName } from '../names.js'
import { MAX_OVERTIME_MINUTES, defaultCounted, overtimeView, settle } from '../overtime.js'
import { dateOnlyPattern, forbid, isHrOrAdmin, myEmployee, notFound, parseBody, queryString, toDate } from './util.js'

// Overtime HR allots, under /hr/overtime (see .samples/plan/overtime.md):
//   GET    ?from=&to=[&employeeId=]   the allotments in a range of shift days. HR/Admin see everyone; anyone else sees their own.
//   POST   {employeeIds[], date, minutes, note?}   HR/Admin: allot the same amount to each person, one row each.
//   PUT    /:id {minutes?, countedMinutes?, note?, cancel?}   HR/Admin: change one row, at any time (before, during or after).
//   PUT    {ids[], ...same}           HR/Admin: change several rows at once.
//   DELETE /:id                       HR/Admin: cancel a row (it counts nothing).
// The person starts and ends their session on the BPO Time panel (device-overtime-start / device-overtime-end in device.ts).

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
  // A number is what counts from now on; null hands it back to the session (the time worked, or the allotment if it ran out).
  countedMinutes: z.number().int().min(0).max(MAX_OVERTIME_MINUTES).nullable().optional(),
  note: z.string().trim().max(300).nullable().optional(),
  cancel: z.literal(true).optional(),
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
  const settled = await settle(rows)
  return rows.map((r, i) => withName({ ...settled[i], employee: r.employee }))
}

// Applies one edit to the given rows (HR only; the caller has checked). Returns the changed rows as the screens show them.
async function applyEdit(req: AuthedRequest, ids: string[], data: z.infer<typeof editSchema>) {
  const found = (await prisma.overtimeAllotment.findMany({ where: { id: { in: ids } }, include: WITH_PERSON })) as WithPerson[]
  const now = new Date()
  for (const row of await settle(found, now)) {
    const before = found.find((f) => f.id === row.id)!
    const changes: string[] = []
    const patch: Record<string, unknown> = { updatedBy: req.auth.sub }
    if (data.cancel) {
      patch.status = 'cancelled'
      changes.push('cancelled')
    }
    if (data.minutes !== undefined && data.minutes !== row.allottedMinutes) {
      patch.allottedMinutes = data.minutes
      changes.push(`allotted ${hours(row.allottedMinutes)} -> ${hours(data.minutes)}`)
    }
    if (data.countedMinutes !== undefined) {
      const next = data.countedMinutes === null ? (row.status === 'done' ? defaultCounted(row) : null) : data.countedMinutes
      patch.countedMinutes = next
      patch.countedByHr = data.countedMinutes !== null
      changes.push(`counted ${row.countedMinutes ?? 'none'} -> ${next ?? 'none'}`)
    }
    if (data.note !== undefined && (data.note || null) !== row.note) {
      patch.note = data.note || null
      changes.push('note')
    }
    if (changes.length === 0) continue
    await prisma.overtimeAllotment.update({ where: { id: row.id }, data: patch })
    // Lowering the amount below the time already worked ends a running session at once.
    await settle([{ ...row, ...(patch as Partial<OvertimeAllotment>) }], now)
    await logAudit(req.auth.sub, data.cancel ? 'cancel' : 'update', 'overtime', row.id, 'success', changes.join('; '))
    if (data.cancel || patch.allottedMinutes) {
      await notifyUsers([before.employee.userId], {
        type: 'overtime',
        title: data.cancel ? 'Your overtime was cancelled' : 'Your overtime was changed',
        body: data.cancel ? dayLabel(row.date) : `${dayLabel(row.date)}: ${hours(data.minutes!)}`,
        link: '/my-time',
      })
    }
  }
  return loadViews(ids)
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
    const settled = await settle(rows)
    return res.status(200).json(rows.map((r, i) => withName({ ...settled[i], employee: r.employee })))
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
          data: { employeeId: p.id, date, allottedMinutes: data.minutes, note: data.note || null, createdBy: req.auth.sub, updatedBy: req.auth.sub },
        }),
      ),
    )
    for (const row of created) await logAudit(req.auth.sub, 'create', 'overtime', row.id, 'success', `${hours(row.allottedMinutes)} on ${data.date}`)
    await notifyUsers(people.map((p) => p.userId), {
      type: 'overtime',
      title: 'Overtime allotted to you',
      body: `${dayLabel(date)}: ${hours(data.minutes)}. Clock in for it in BPO Time after your shift.`,
      link: '/my-time',
    })
    return res.status(201).json(await loadViews(created.map((r) => r.id)))
  }

  if (req.method === 'PUT') {
    const data = parseBody(editSchema, req.body, res)
    if (!data) return
    const ids = sub ? [sub] : data.ids
    if (!ids) return res.status(400).json({ message: 'Pick at least one row' })
    if (sub && !(await prisma.overtimeAllotment.findUnique({ where: { id: sub }, select: { id: true } }))) return notFound(res, 'Overtime not found')
    return res.status(200).json(await applyEdit(req, ids, data))
  }

  if (req.method === 'DELETE' && sub) {
    if (!(await prisma.overtimeAllotment.findUnique({ where: { id: sub }, select: { id: true } }))) return notFound(res, 'Overtime not found')
    await applyEdit(req, [sub], { cancel: true })
    return res.status(204).end()
  }

  notFound(res)
}
