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
export type FoaChecklistDay = (typeof FOA_CHECKLIST_DAYS)[number]

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

// The 8 Friday-to-Friday calendar dates covered by a period (periodStart
// and periodEnd are both the same weekday, 7 days apart), as ISO date
// strings — the attendance grid keys on these rather than generic weekday
// labels so the same weekday appearing twice (the period's two Fridays)
// isn't ambiguous.
export function foaAttendanceDates(periodStart: string, periodEnd: string): string[] {
  const start = new Date(periodStart)
  const end = new Date(periodEnd)
  const dates: string[] = []
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    dates.push(d.toISOString().slice(0, 10))
  }
  return dates
}
