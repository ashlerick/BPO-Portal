import type { VercelResponse } from '@vercel/node'
import { z } from 'zod'
import { prisma } from '../prisma.js'
import type { AuthedRequest } from '../middleware.js'
import { logAudit } from '../audit.js'
import { zonedInstant } from '../dates.js'
import { formatDisplayName } from '../names.js'
import { dateOnlyPattern, forbid, isHrOrAdmin, isSupervisorOf, myEmployee, notFound, parseBody, queryString, toDate } from './util.js'

// Shift schedules under /hr/shifts (managed by HR/Admin):
//   ?kind=templates    GET all (HR/Admin); POST; PUT /:id; DELETE /:id
//   ?kind=assign       POST {employeeIds[], shiftId, effectiveFrom}
//   ?kind=schedule     GET ?employeeId= current shift + assignment history
//                      (the employee, their supervisor, or HR/Admin)
//   ?kind=report       GET ?from=&to=[&employeeId=] late / undertime / overtime
//                      per attendance record, measured against the shift that
//                      applied on that date. Without employeeId: HR/Admin see
//                      everyone, anyone else sees themselves.
// An employee with no shift assigned is simply not measured.

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM (24-hour)')

const templateSchema = z.object({
  name: z.string().trim().min(1).max(60),
  startTime: hhmm,
  endTime: hhmm,
  workDays: z.array(z.number().int().min(0).max(6)).min(1, 'Pick at least one working day').max(7),
  breakMinutes: z.number().int().min(0).max(240).default(0),
  graceMinutes: z.number().int().min(0).max(120).default(0),
  // The zone the start and end are written in. The team works across these two.
  timezone: z.enum(['Asia/Manila', 'America/Los_Angeles']).default('Asia/Manila'),
  isDefault: z.boolean().default(false),
})
const templateUpdateSchema = templateSchema.partial().extend({ active: z.boolean().optional() })

const assignSchema = z.object({
  employeeIds: z.array(z.string().uuid()).min(1).max(500),
  shiftId: z.string().uuid(),
  effectiveFrom: z.string().regex(dateOnlyPattern, 'Date must be YYYY-MM-DD'),
})

interface ShiftLike {
  id: string
  name: string
  startTime: string
  endTime: string
  workDays: number[]
  graceMinutes: number
  timezone: string
}

const MINUTE = 60_000

// Late / undertime / overtime minutes for one attendance record against a
// shift, or null when the date isn't a working day for that shift.
export function measure(
  isoDate: string,
  checkInAt: Date | null,
  checkOutAt: Date | null,
  shift: ShiftLike,
): { lateMinutes: number; undertimeMinutes: number; overtimeMinutes: number } | null {
  const weekday = new Date(`${isoDate}T00:00:00Z`).getUTCDay()
  if (!shift.workDays.includes(weekday)) return null

  // The shift's own time zone, so a California shift moves by itself when daylight saving changes.
  const zone = shift.timezone || 'Asia/Manila'
  const start = zonedInstant(isoDate, shift.startTime, zone)
  let end = zonedInstant(isoDate, shift.endTime, zone)
  if (end <= start) end = new Date(end.getTime() + 24 * 60 * MINUTE) // crosses midnight

  const late = checkInAt ? Math.max(0, Math.floor((checkInAt.getTime() - start.getTime()) / MINUTE)) : 0
  const lateMinutes = late > shift.graceMinutes ? late : 0
  const undertimeMinutes = checkOutAt ? Math.max(0, Math.floor((end.getTime() - checkOutAt.getTime()) / MINUTE)) : 0
  const overtimeMinutes = checkOutAt ? Math.max(0, Math.floor((checkOutAt.getTime() - end.getTime()) / MINUTE)) : 0
  return { lateMinutes, undertimeMinutes, overtimeMinutes }
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10)

export async function handler(req: AuthedRequest, res: VercelResponse) {
  const kind = queryString(req, 'kind')
  const sub = queryString(req, 'sub')
  const hr = isHrOrAdmin(req)

  // ---- templates (HR/Admin)
  if (kind === 'templates') {
    if (!hr) return forbid(res)
    if (req.method === 'GET') {
      const rows = await prisma.shift.findMany({ orderBy: { name: 'asc' } })
      return res.status(200).json(rows)
    }
    if (req.method === 'POST') {
      const data = parseBody(templateSchema, req.body, res)
      if (!data) return
      const created = await prisma.$transaction(async (tx) => {
        if (data.isDefault) await tx.shift.updateMany({ where: { isDefault: true }, data: { isDefault: false } })
        return tx.shift.create({ data })
      })
      await logAudit(req.auth.sub, 'create', 'shift', created.id)
      return res.status(201).json(created)
    }
    if (req.method === 'PUT' && sub) {
      const data = parseBody(templateUpdateSchema, req.body, res)
      if (!data) return
      if (!(await prisma.shift.findUnique({ where: { id: sub } }))) return notFound(res, 'Shift not found')
      // One default at a time, and a shift that is switched off cannot stay the default.
      const updated = await prisma.$transaction(async (tx) => {
        if (data.isDefault) await tx.shift.updateMany({ where: { isDefault: true, id: { not: sub } }, data: { isDefault: false } })
        return tx.shift.update({ where: { id: sub }, data: { ...data, ...(data.active === false && { isDefault: false }) } })
      })
      await logAudit(req.auth.sub, 'update', 'shift', sub)
      return res.status(200).json(updated)
    }
    if (req.method === 'DELETE' && sub) {
      // Assigned shifts are only switched off so history stays measurable.
      const used = await prisma.shiftAssignment.count({ where: { shiftId: sub } })
      if (used > 0) await prisma.shift.updateMany({ where: { id: sub }, data: { active: false, isDefault: false } })
      else await prisma.shift.deleteMany({ where: { id: sub } })
      await logAudit(req.auth.sub, used > 0 ? 'deactivate' : 'delete', 'shift', sub)
      return res.status(204).end()
    }
  }

  // ---- assign (HR/Admin)
  if (kind === 'assign' && req.method === 'POST') {
    if (!hr) return forbid(res)
    const data = parseBody(assignSchema, req.body, res)
    if (!data) return
    const shift = await prisma.shift.findUnique({ where: { id: data.shiftId } })
    if (!shift || !shift.active) return notFound(res, 'Shift not found')
    const employees = await prisma.employee.findMany({ where: { id: { in: data.employeeIds } }, select: { id: true } })
    if (employees.length !== new Set(data.employeeIds).size) return notFound(res, 'Employee not found')
    const effectiveFrom = toDate(data.effectiveFrom)
    // Re-assigning on the same date replaces that day's assignment.
    await prisma.shiftAssignment.deleteMany({ where: { employeeId: { in: data.employeeIds }, effectiveFrom } })
    await prisma.shiftAssignment.createMany({
      data: employees.map((e) => ({ employeeId: e.id, shiftId: data.shiftId, effectiveFrom, assignedBy: req.auth.sub })),
    })
    await logAudit(req.auth.sub, 'assign', 'shift', `${data.shiftId} x${employees.length}`)
    return res.status(200).json({ assigned: employees.length })
  }

  // ---- one employee's schedule
  if (kind === 'schedule' && req.method === 'GET') {
    const me = await myEmployee(req)
    const employeeId = queryString(req, 'employeeId') ?? me?.id
    if (!employeeId) return res.status(200).json({ current: null, history: [] })
    if (employeeId !== me?.id && !hr && !(await isSupervisorOf(req, employeeId))) return forbid(res)
    const rows = await prisma.shiftAssignment.findMany({
      where: { employeeId },
      include: { shift: true },
      orderBy: { effectiveFrom: 'desc' },
    })
    const today = isoDay(new Date(Date.now() + 8 * 60 * MINUTE)) // Manila date
    const current = rows.find((r) => isoDay(r.effectiveFrom) <= today) ?? null
    const view = (r: (typeof rows)[number]) => ({
      id: r.id,
      effectiveFrom: r.effectiveFrom,
      shift: { id: r.shift.id, name: r.shift.name, startTime: r.shift.startTime, endTime: r.shift.endTime, workDays: r.shift.workDays, breakMinutes: r.shift.breakMinutes, graceMinutes: r.shift.graceMinutes, timezone: r.shift.timezone, isDefault: r.shift.isDefault },
    })
    return res.status(200).json({ current: current ? view(current) : null, history: rows.map(view) })
  }

  // ---- late / undertime / overtime report
  if (kind === 'report' && req.method === 'GET') {
    const from = queryString(req, 'from')
    const to = queryString(req, 'to')
    if (!from || !to || !dateOnlyPattern.test(from) || !dateOnlyPattern.test(to) || to < from) {
      return res.status(400).json({ message: 'from and to (YYYY-MM-DD) are required' })
    }
    const me = await myEmployee(req)
    const requested = queryString(req, 'employeeId')
    let scope: { employeeId?: string } = {}
    if (requested) {
      if (requested !== me?.id && !hr && !(await isSupervisorOf(req, requested))) return forbid(res)
      scope = { employeeId: requested }
    } else if (!hr) {
      if (!me) return res.status(200).json([])
      scope = { employeeId: me.id }
    }

    const records = await prisma.attendanceRecord.findMany({
      where: { ...scope, status: 'present', checkInAt: { not: null }, date: { gte: toDate(from), lte: toDate(to) } },
      include: { employee: { include: { user: true } } },
      orderBy: [{ date: 'desc' }],
      take: 2000,
    })
    const ids = [...new Set(records.map((r) => r.employeeId))]
    const assignments = await prisma.shiftAssignment.findMany({
      where: { employeeId: { in: ids } },
      include: { shift: true },
      orderBy: { effectiveFrom: 'desc' },
    })
    const byEmployee = new Map<string, typeof assignments>()
    for (const a of assignments) byEmployee.set(a.employeeId, [...(byEmployee.get(a.employeeId) ?? []), a])

    const rows = records.flatMap((r) => {
      const day = isoDay(r.date)
      const assigned = byEmployee.get(r.employeeId)?.find((a) => isoDay(a.effectiveFrom) <= day)
      if (!assigned) return []
      const m = measure(day, r.checkInAt, r.checkOutAt, assigned.shift)
      if (!m) return []
      return [
        {
          employeeId: r.employeeId,
          employeeName: formatDisplayName(r.employee.user.firstName, r.employee.user.middleName, r.employee.user.lastName),
          date: r.date,
          shiftName: assigned.shift.name,
          scheduledStart: assigned.shift.startTime,
          scheduledEnd: assigned.shift.endTime,
          timezone: assigned.shift.timezone,
          checkInAt: r.checkInAt,
          checkOutAt: r.checkOutAt,
          ...m,
        },
      ]
    })
    // This is what the Attendance page loads, so it is logged as a view of attendance: which days, and whose.
    const whose = requested ? (requested === me?.id ? 'own time' : 'one employee') : hr ? 'all employees' : 'own time'
    await logAudit(req.auth.sub, 'view', 'attendance', requested ?? null, 'success', `${from === to ? from : `${from} to ${to}`}, ${whose}`)
    return res.status(200).json(rows)
  }

  notFound(res)
}
