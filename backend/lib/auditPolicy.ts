// What the audit log keeps, and for how long.
//
// Routine activity (clocking in and out, breaks, a PC connecting, viewing attendance and the shift report) is kept for 12 months. Everything else
// (anything created, changed, deleted, exported or downloaded, views of sensitive records such as payroll and disciplinary cases,
// permission and account changes) is kept for 5 years. The monthly clean-up (auditRetention.ts) deletes only what is past its time.
// Change a number here and nowhere else.

export const ROUTINE_ACTIONS = ['check_in', 'check_out', 'break_start', 'break_end', 'connect'] as const
// 'shift_report' is what these views were called before they were logged as 'attendance'; older entries still carry it.
const ROUTINE_VIEW_RESOURCES = ['attendance', 'shift_report'] as const

export const ROUTINE_DAYS = 365
export const OTHER_DAYS = 365 * 5

/** Prisma filter: the routine entries. Use { NOT: routineWhere } for everything else. */
export const routineWhere = {
  OR: [{ action: { in: [...ROUTINE_ACTIONS] } }, { action: 'view', resource: { in: [...ROUTINE_VIEW_RESOURCES] } }],
}
