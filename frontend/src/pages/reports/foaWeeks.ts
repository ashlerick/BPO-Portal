// The FOA weekly report's calendar and arithmetic, kept free of React so it can be tested on its own.
//
// An FOA week runs Monday to Friday, with an optional Saturday make-up day when a weekday was off (a holiday, say). It is named after the
// Friday it ends on: "Week 46" ends on the Friday of ISO week 46, so the numbers agree with the weekly time sheet's tabs. Reports filed
// before this change ran Friday to Friday (eight days); they are keyed by the same Friday, so they still line up.
// All dates are YYYY-MM-DD strings handled in UTC, so a timezone never moves a day.

import type { FoaReportData } from './foa.ts'

const DAY_MS = 86_400_000

const toDate = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`)
const toIso = (d: Date) => d.toISOString().slice(0, 10)

export function addDays(iso: string, days: number): string {
  const d = toDate(iso)
  d.setUTCDate(d.getUTCDate() + days)
  return toIso(d)
}

export const daysBetween = (fromIso: string, toIsoDate: string): number =>
  Math.round((toDate(toIsoDate).getTime() - toDate(fromIso).getTime()) / DAY_MS)

/** The ISO week number and ISO year of any date. */
export function isoWeekOf(iso: string): { year: number; num: number } {
  const d = toDate(iso)
  const thursday = new Date(d)
  thursday.setUTCDate(d.getUTCDate() + 3 - ((d.getUTCDay() + 6) % 7))
  const year = thursday.getUTCFullYear()
  const jan4 = new Date(Date.UTC(year, 0, 4))
  const firstThursday = new Date(jan4)
  firstThursday.setUTCDate(jan4.getUTCDate() + 3 - ((jan4.getUTCDay() + 6) % 7))
  return { year, num: 1 + Math.round((thursday.getTime() - firstThursday.getTime()) / (7 * DAY_MS)) }
}

export interface FoaWeek {
  /** The week's number: the ISO week of the Friday it ends on. */
  num: number
  /** The year of that number. */
  year: number
  /** The Monday it starts on (four days before `end`). */
  start: string
  /** The Friday it ends on; the report's period end. */
  end: string
}

/** The week that ends on this Friday. */
export function foaWeekEnding(endIso: string): FoaWeek {
  const end = endIso.slice(0, 10)
  const { year, num } = isoWeekOf(end)
  return { num, year, start: addDays(end, -4), end }
}

/** Every week of a year, in order: the Friday of each ISO week of that year, with that week's Monday as the start. */
export function foaWeeksOfYear(year: number): FoaWeek[] {
  const jan4 = new Date(Date.UTC(year, 0, 4))
  const monday = new Date(jan4)
  monday.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() + 6) % 7))
  const weeks: FoaWeek[] = []
  while (isoWeekOf(toIso(monday)).year === year) {
    weeks.push(foaWeekEnding(addDays(toIso(monday), 4)))
    monday.setUTCDate(monday.getUTCDate() + 7)
  }
  return weeks
}

/** The Friday a week that has just ended closed on: today when it is a Friday, else the one before. */
export function lastFriday(todayIso: string): string {
  return addDays(todayIso, -((toDate(todayIso).getUTCDay() + 2) % 7))
}

/** A report period's end as the date the strip is keyed on. */
export const weekKeyOf = (periodEnd: string): string => periodEnd.slice(0, 10)

/**
 * "Same as last week": what a new report starts with when the person says so. The territories, the attendance sheet (each day moved to
 * the same day of the new week) and the checklist carry over. The counts and the free text do not: they are never the same twice, and a
 * Saturday make-up day belongs to the week it made up for. With `newEnd`, days that would land outside the new Monday-to-Friday week (the
 * Friday that opened an older Friday-to-Friday report, its weekend) are left out.
 */
export function startFromPrevious(previous: FoaReportData | undefined, previousStart: string, newStart: string, newEnd?: string): FoaReportData {
  if (!previous) return {}
  const out: FoaReportData = {}
  if (previous.territories) out.territories = [...previous.territories]
  if (previous.taskChecklist) {
    out.taskChecklist = JSON.parse(JSON.stringify(previous.taskChecklist))
    if (newEnd) for (const days of Object.values(out.taskChecklist!)) if (days) delete days.Saturday
  }
  if (previous.attendance) {
    out.attendance = {}
    for (const [date, cells] of Object.entries(previous.attendance)) {
      const moved = addDays(newStart, daysBetween(previousStart, date))
      if (newEnd && (moved < newStart || moved > newEnd)) continue
      out.attendance[moved] = Object.fromEntries(Object.entries(cells).map(([col, tokens]) => [col, [...(tokens ?? [])]]))
    }
  }
  return out
}

export interface FoaTotals {
  variance: number
  safety: number
  checklistDone: number
  checklistTotal: number
  attendanceFilled: number
  attendanceTotal: number
}

const sum = (o: object | undefined) => Object.values(o ?? {}).reduce<number>((a, v) => a + (typeof v === 'number' ? v : 0), 0)

/** The numbers a report adds to the Summary. `columns`, `tasks` and `days` come from foa.ts, passed in so this file needs no values from it. */
export function totalsOf(data: FoaReportData | undefined, columns: readonly string[], tasks: readonly string[], days: readonly string[], dateCount: number): FoaTotals {
  const d = data ?? {}
  let done = 0
  for (const task of tasks) for (const day of days) if ((d.taskChecklist as Record<string, Record<string, boolean>> | undefined)?.[task]?.[day]) done += 1
  let filled = 0
  for (const cells of Object.values(d.attendance ?? {})) for (const col of columns) if ((cells as Record<string, string[] | undefined>)[col]?.length) filled += 1
  return {
    variance: sum(d.varianceInvestigations),
    safety: sum(d.motiveSafetyEvents),
    checklistDone: done,
    checklistTotal: tasks.length * days.length,
    attendanceFilled: filled,
    attendanceTotal: dateCount * columns.length,
  }
}
