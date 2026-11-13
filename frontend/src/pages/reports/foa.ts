// Mirrors backend/lib/foaReport.ts — the Field Operations Admin
// department's report shape. Kept as a separate small duplication rather
// than a shared package, consistent with how the rest of this app keeps
// frontend/backend independent (bpo_plan.md Rule 6).

export const FOA_TERRITORIES = [
  'CONCORD',
  'NORTH PARK',
  'SAN JOSE',
  'WA & WA Porter',
  'PENINSULA',
  'OR & PORTLAND',
  'SANTA ROSA',
  'WOODLAND PARK',
  'CA Porter',
  'SACRAMENTO',
  'SOUTH LA COUNTY',
] as const

export const FOA_ATTENDANCE_FLAGS = ['N/A', 'WEEKEND', 'D2D'] as const

export const FOA_ATTENDANCE_TOKENS = [...FOA_TERRITORIES, ...FOA_ATTENDANCE_FLAGS] as const

export const FOA_ATTENDANCE_COLUMNS = ['Routeboard', 'Variance Report', 'TOP', 'STOP'] as const

export const FOA_CHECKLIST_TASKS = [
  'ADP/Rippling Arrival and Clock in/Clock out',
  'ADP/Rippling Departure and Clock in',
  'Recurring Services Update',
  'Scheduling Spot checks',
  'Driver Vehicle Inspection Report',
  'Fleet Repairs Update',
  'Employee Hours',
  'WEX Report',
] as const

export const FOA_CHECKLIST_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] as const

export type FoaAttendanceColumn = (typeof FOA_ATTENDANCE_COLUMNS)[number]
export type FoaChecklistTask = (typeof FOA_CHECKLIST_TASKS)[number]
/** A Saturday worked to make up for a weekday off (a holiday, say). It is optional, so it is not one of the five counted days. */
export const FOA_MAKE_UP_DAY = 'Saturday'

export type FoaChecklistDay = (typeof FOA_CHECKLIST_DAYS)[number] | typeof FOA_MAKE_UP_DAY

export interface FoaReportData {
  territories?: string[]
  // attendance[isoDate][column] = tokens selected for that cell
  attendance?: Record<string, Partial<Record<FoaAttendanceColumn, string[]>>>
  // taskChecklist[task][day] = done
  taskChecklist?: Partial<Record<FoaChecklistTask, Partial<Record<FoaChecklistDay, boolean>>>>
  varianceInvestigations?: {
    extendedBreaks?: number
    backToBackBreaks?: number
    otherInvestigations?: number
  }
  motiveSafetyEvents?: {
    cellphone?: number
    seatbelts?: number
    incidents?: number
    trackerDascam?: number
    speeding?: number
  }
  additionalTasks?: string
  highlights?: string
  roadblocks?: string
  managerComments?: string
}

export function isFoaDepartment(departmentName: string): boolean {
  return departmentName.trim().toUpperCase() === 'FOA'
}

// Every calendar date from periodStart to periodEnd, as ISO date strings: the five days of a Monday-to-Friday week, or the eight of a
// report filed before the change to Monday-to-Friday (Friday to Friday). The attendance sheet keys on these dates rather than weekday
// names, so a weekday that appears twice in an older report isn't ambiguous.
export function foaAttendanceDates(periodStart: string, periodEnd: string): string[] {
  const start = new Date(periodStart)
  const end = new Date(periodEnd)
  const dates: string[] = []
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    dates.push(d.toISOString().slice(0, 10))
  }
  return dates
}

/**
 * The Saturday after a Monday-to-Friday week, which can be worked to make up for a weekday off; null for an older Friday-to-Friday
 * report, whose own Saturday is already one of its eight days.
 */
export function foaMakeUpSaturday(periodStart: string, periodEnd: string): string | null {
  if (foaAttendanceDates(periodStart, periodEnd).length !== 5) return null
  const end = new Date(periodEnd)
  if (end.getUTCDay() !== 5) return null
  end.setUTCDate(end.getUTCDate() + 1)
  return end.toISOString().slice(0, 10)
}

/** The period's dates, plus its make-up Saturday when that day has anything entered (for showing a filed report). */
export function foaReportDates(periodStart: string, periodEnd: string, data: FoaReportData): string[] {
  const dates = foaAttendanceDates(periodStart, periodEnd)
  const saturday = foaMakeUpSaturday(periodStart, periodEnd)
  if (saturday && foaMakeUpUsed(data, saturday)) dates.push(saturday)
  return dates
}

/** Whether anything was entered for the make-up Saturday: coverage on that date, or a task ticked for it. */
export function foaMakeUpUsed(data: FoaReportData, saturday: string): boolean {
  const cells = data.attendance?.[saturday]
  if (cells && Object.values(cells).some((tokens) => tokens && tokens.length > 0)) return true
  return Object.values(data.taskChecklist ?? {}).some((days) => days?.[FOA_MAKE_UP_DAY])
}
