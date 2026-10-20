import type { OvertimeAllotment, Prisma } from '@prisma/client'
import { prisma } from './prisma.js'
import { todayInManila } from './dates.js'

// Overtime HR allots, and the session the person runs on the BPO Time panel (see .samples/plan/overtime.md).
// One row is both: the allotment (allottedMinutes) and its session (startedAt, endedAt). The countdown is the allotment, so a
// running session that reaches zero is ended here, lazily, the next time anyone reads it.

const MINUTE = 60_000

export const MAX_OVERTIME_MINUTES = 12 * 60

// Whole minutes worked by `now`, never more than the allotment.
const worked = (row: OvertimeAllotment, now: Date) =>
  row.startedAt ? Math.min(row.allottedMinutes, Math.max(0, Math.floor(((row.endedAt ?? now).getTime() - row.startedAt.getTime()) / MINUTE))) : 0

// What a finished session counts when HR has not typed a number: the full allotment if the countdown ran out, else the time worked.
export const defaultCounted = (row: OvertimeAllotment) => (row.endedAt && row.startedAt ? worked(row, row.endedAt) : 0)

// The moment the countdown of a running session reaches zero.
const endsAt = (row: OvertimeAllotment) => (row.startedAt ? new Date(row.startedAt.getTime() + row.allottedMinutes * MINUTE) : null)

// Ends every running session whose countdown is over (or that HR lowered below the time already worked), at the moment it hit zero.
export async function settle(rows: OvertimeAllotment[], now = new Date()): Promise<OvertimeAllotment[]> {
  return Promise.all(
    rows.map(async (row) => {
      const end = endsAt(row)
      if (row.status !== 'running' || !end || end > now) return row
      const ended = { ...row, endedAt: end }
      return prisma.overtimeAllotment.update({
        where: { id: row.id },
        data: { status: 'done', endedAt: end, ...(row.countedByHr ? {} : { countedMinutes: defaultCounted(ended) }) },
      })
    }),
  )
}

// A person ends their own session before the countdown is over.
export async function endSession(row: OvertimeAllotment, now = new Date()): Promise<OvertimeAllotment> {
  const end = endsAt(row)
  const endedAt = end && end < now ? end : now
  return prisma.overtimeAllotment.update({
    where: { id: row.id },
    data: { status: 'done', endedAt, ...(row.countedByHr ? {} : { countedMinutes: defaultCounted({ ...row, endedAt }) }) },
  })
}

// What every screen shows. `status` adds "not_used" (never started and the shift day has passed); `countedMinutes` is what
// counts right now: nothing for a cancelled row or one that has not ended and HR has not typed a number for.
export function overtimeView(row: OvertimeAllotment) {
  const status = row.status === 'not_started' && row.date < todayInManila() ? 'not_used' : row.status
  return {
    id: row.id,
    employeeId: row.employeeId,
    date: row.date,
    allottedMinutes: row.allottedMinutes,
    note: row.note,
    status,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    // For the panel's countdown: when a running session ends by itself.
    endsAt: row.status === 'running' ? endsAt(row) : null,
    countedMinutes: row.status === 'cancelled' ? 0 : (row.countedMinutes ?? 0),
    countedByHr: row.countedByHr,
  }
}

// One person's allotments for a shift day, settled, oldest first: what the panel needs.
export async function overtimeForDay(employeeId: string, date: Date) {
  const rows = await prisma.overtimeAllotment.findMany({
    where: { employeeId, date, status: { not: 'cancelled' } },
    orderBy: { createdAt: 'asc' },
  })
  return (await settle(rows)).map(overtimeView)
}

// Hours of allotted overtime that count, per person and shift day ("employeeId|YYYY-MM-DD"), for the attendance list and the Excel
// export. `where` is the same filter the caller uses for attendance (a date range, a person, or the signed-in employee).
export async function countedHoursByDay(where: Prisma.OvertimeAllotmentWhereInput): Promise<Map<string, number>> {
  const rows = await settle(await prisma.overtimeAllotment.findMany({ where: { ...where, status: { not: 'cancelled' } }, take: 5000 }))
  const hours = new Map<string, number>()
  for (const r of rows) {
    const key = `${r.employeeId}|${r.date.toISOString().slice(0, 10)}`
    hours.set(key, (hours.get(key) ?? 0) + (r.countedMinutes ?? 0) / 60)
  }
  return hours
}

export const overtimeKey = (employeeId: string, date: Date) => `${employeeId}|${date.toISOString().slice(0, 10)}`
export const roundHours = (h: number) => Math.round(h * 100) / 100
