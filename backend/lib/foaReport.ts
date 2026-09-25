import { z } from 'zod'

// Field Operations Admin department's weekly report — a much richer shape
// than the generic report, modeled on the team's existing Jotform. Fixed
// lists (territories, checklist tasks) are hard-coded for now rather than
// admin-configurable; revisit if they turn out to change often.

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

// Extra tokens a coverage cell can hold besides a territory name.
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

const territoryEnum = z.enum(FOA_TERRITORIES)
const attendanceTokenEnum = z.enum(FOA_ATTENDANCE_TOKENS)
const attendanceColumnEnum = z.enum(FOA_ATTENDANCE_COLUMNS)
const checklistTaskEnum = z.enum(FOA_CHECKLIST_TASKS)
const checklistDayEnum = z.enum(FOA_CHECKLIST_DAYS)

// attendance[isoDate][column] = tokens selected for that cell
const attendanceSchema = z.record(z.string(), z.record(attendanceColumnEnum, z.array(attendanceTokenEnum)))

// taskChecklist[task][day] = done
const taskChecklistSchema = z.record(checklistTaskEnum, z.record(checklistDayEnum, z.boolean()))

export const foaReportDataSchema = z.object({
  territories: z.array(territoryEnum).optional(),
  attendance: attendanceSchema.optional(),
  taskChecklist: taskChecklistSchema.optional(),
  varianceInvestigations: z
    .object({
      extendedBreaks: z.number().int().min(0).optional(),
      backToBackBreaks: z.number().int().min(0).optional(),
      otherInvestigations: z.number().int().min(0).optional(),
    })
    .optional(),
  motiveSafetyEvents: z
    .object({
      cellphone: z.number().int().min(0).optional(),
      seatbelts: z.number().int().min(0).optional(),
      incidents: z.number().int().min(0).optional(),
      trackerDascam: z.number().int().min(0).optional(),
      speeding: z.number().int().min(0).optional(),
    })
    .optional(),
  additionalTasks: z.string().optional(),
  highlights: z.string().optional(),
  roadblocks: z.string().optional(),
  // Reused from the generic shape so a reviewer's rejection comment has
  // somewhere to live regardless of report schema (see handleTransition).
  managerComments: z.string().optional(),
})

export type FoaReportData = z.infer<typeof foaReportDataSchema>

export function isFoaDepartment(departmentName: string): boolean {
  return departmentName.trim().toUpperCase() === 'FOA'
}

export function resolveSchemaKey(departmentName: string): 'foa' | 'generic' {
  return isFoaDepartment(departmentName) ? 'foa' : 'generic'
}
