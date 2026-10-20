import type { OvertimeAllotment, Prisma } from '@prisma/client'
import { prisma } from './prisma.js'

// Overtime HR gives a person for a shift day (see .samples/plan/overtime.md): a number of minutes, and that is what counts.

export const MAX_OVERTIME_MINUTES = 12 * 60

export function overtimeView(row: OvertimeAllotment) {
  return { id: row.id, employeeId: row.employeeId, date: row.date, minutes: row.minutes, note: row.note }
}

// Hours of overtime HR gave, per person and shift day ("employeeId|YYYY-MM-DD"), for the attendance list and the Excel export.
// `where` is the same filter the caller uses for attendance (a date range, a person, or the signed-in employee).
export async function givenHoursByDay(where: Prisma.OvertimeAllotmentWhereInput): Promise<Map<string, number>> {
  const rows = await prisma.overtimeAllotment.findMany({ where, take: 5000 })
  const hours = new Map<string, number>()
  for (const r of rows) {
    const key = overtimeKey(r.employeeId, r.date)
    hours.set(key, (hours.get(key) ?? 0) + r.minutes / 60)
  }
  return hours
}

export const overtimeKey = (employeeId: string, date: Date) => `${employeeId}|${date.toISOString().slice(0, 10)}`
export const roundHours = (h: number) => Math.round(h * 100) / 100
