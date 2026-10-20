import { prisma } from './prisma.js'
import { formatDisplayName } from './names.js'

// "What was it about?" for audit entries that carry no written detail (most of them, and every older one). The entry points at a
// record by its resource and id; the record is looked up when the log is read, so the page can say "Maria Santos" or "Night shift"
// instead of "#6613ef3a". A record that has been deleted since has no name left, and its entry shows a dash.

// Which kind of record an entry's resource id points at. Views of an employee's payroll or discipline and the like store the
// employee's id, so they look up the employee.
const LOOKUP: Record<string, string> = {
  user: 'user',
  employee: 'employee',
  payslips: 'employee',
  payroll_summary: 'employee',
  salary_history: 'employee',
  pay_items: 'employee',
  disciplinary_cases: 'employee',
  kpi_scores: 'employee',
  department: 'department',
  team: 'team',
  benefit: 'benefit',
  shift: 'shift',
  job_opening: 'jobOpening',
  applicant: 'applicant',
  inventory_item: 'inventoryItem',
  hr_request: 'hrRequest',
  todo: 'todo',
  leave_request: 'leaveRequest',
  device: 'device',
  document: 'document',
  disciplinary_case: 'disciplinaryCase',
  payslip: 'payslip',
  pay_item: 'payItem',
  benefit_enrollment: 'benefitEnrollment',
  interview: 'interview',
  checklist: 'checklist',
  kpi_criterion: 'kpiCriterion',
  performance_review: 'performanceReview',
  performance_note: 'performanceNote',
  weekly_report: 'weeklyReport',
  dependent: 'dependent',
  employment_history: 'employmentHistory',
  calendar_event: 'calendarEvent',
  announcement: 'announcement',
  attendance: 'attendanceRecord',
  overtime: 'overtimeAllotment',
}

const U = { select: { firstName: true, middleName: true, lastName: true } } as const
const EMP = { include: { user: U } } as const
type Named = { firstName: string; middleName: string | null; lastName: string }
const person = (u: Named) => formatDisplayName(u.firstName, u.middleName, u.lastName)
const day = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
const span = (a: Date, b: Date) => (a.getTime() === b.getTime() ? day(a) : `${day(a)} to ${day(b)}`)

type Row = { id: string; resource: string; resourceId: string | null; detail: string | null }
type Resolver = (ids: string[]) => Promise<Map<string, string>>
const toMap = <T extends { id: string }>(rows: T[], label: (r: T) => string) => new Map(rows.map((r) => [r.id, label(r)]))
const inIds = (ids: string[]) => ({ id: { in: ids } })

const RESOLVERS: Record<string, Resolver> = {
  user: async (ids) => toMap(await prisma.user.findMany({ where: inIds(ids), select: { id: true, firstName: true, middleName: true, lastName: true } }), person),
  employee: async (ids) => toMap(await prisma.employee.findMany({ where: inIds(ids), ...EMP }), (e) => person(e.user)),
  department: async (ids) => toMap(await prisma.department.findMany({ where: inIds(ids) }), (r) => r.name),
  team: async (ids) => toMap(await prisma.team.findMany({ where: inIds(ids) }), (r) => r.name),
  benefit: async (ids) => toMap(await prisma.benefit.findMany({ where: inIds(ids) }), (r) => r.title),
  shift: async (ids) => toMap(await prisma.shift.findMany({ where: inIds(ids) }), (r) => r.name),
  jobOpening: async (ids) => toMap(await prisma.jobOpening.findMany({ where: inIds(ids) }), (r) => r.title),
  applicant: async (ids) => toMap(await prisma.applicant.findMany({ where: inIds(ids) }), (r) => r.name),
  inventoryItem: async (ids) => toMap(await prisma.inventoryItem.findMany({ where: inIds(ids) }), (r) => `${r.name} (${r.assetTag})`),
  hrRequest: async (ids) =>
    toMap(await prisma.hrRequest.findMany({ where: inIds(ids), include: { employee: EMP } }), (r) => `${person(r.employee.user)}: ${r.subject}`),
  todo: async (ids) => toMap(await prisma.todo.findMany({ where: inIds(ids), include: { employee: EMP } }), (r) => `${person(r.employee.user)}: ${r.title}`),
  leaveRequest: async (ids) =>
    toMap(await prisma.leaveRequest.findMany({ where: inIds(ids), include: { employee: EMP } }), (r) => `${person(r.employee.user)}, ${span(r.startDate, r.endDate)}`),
  device: async (ids) => toMap(await prisma.device.findMany({ where: inIds(ids) }), (r) => r.name),
  document: async (ids) => toMap(await prisma.document.findMany({ where: inIds(ids) }), (r) => r.title),
  disciplinaryCase: async (ids) =>
    toMap(await prisma.disciplinaryCase.findMany({ where: inIds(ids), include: { employee: EMP } }), (r) => `${person(r.employee.user)}: ${r.title}`),
  payslip: async (ids) =>
    toMap(await prisma.payslip.findMany({ where: inIds(ids), include: { employee: EMP } }), (r) => `${person(r.employee.user)}, ${span(r.periodStart, r.periodEnd)}`),
  payItem: async (ids) =>
    toMap(await prisma.payItem.findMany({ where: inIds(ids), include: { employee: EMP } }), (r) => `${person(r.employee.user)}: ${r.label}`),
  benefitEnrollment: async (ids) =>
    toMap(await prisma.benefitEnrollment.findMany({ where: inIds(ids), include: { employee: EMP, benefit: true } }), (r) => `${person(r.employee.user)}: ${r.benefit.title}`),
  interview: async (ids) =>
    toMap(await prisma.interview.findMany({ where: inIds(ids), include: { applicant: true } }), (r) => r.applicant.name),
  checklist: async (ids) =>
    toMap(await prisma.checklist.findMany({ where: inIds(ids), include: { employee: EMP } }), (r) => `${person(r.employee.user)} (${r.kind})`),
  kpiCriterion: async (ids) => toMap(await prisma.kpiCriterion.findMany({ where: inIds(ids) }), (r) => r.name),
  performanceReview: async (ids) =>
    toMap(await prisma.performanceReview.findMany({ where: inIds(ids), include: { employee: EMP } }), (r) => `${person(r.employee.user)}, ${r.period}`),
  performanceNote: async (ids) =>
    toMap(await prisma.performanceNote.findMany({ where: inIds(ids), include: { employee: EMP } }), (r) => `${person(r.employee.user)}: ${r.title}`),
  weeklyReport: async (ids) =>
    toMap(await prisma.weeklyReport.findMany({ where: inIds(ids), include: { team: true } }), (r) => `${r.team.name}, ${span(r.periodStart, r.periodEnd)}`),
  dependent: async (ids) => toMap(await prisma.dependent.findMany({ where: inIds(ids) }), (r) => r.name),
  employmentHistory: async (ids) => toMap(await prisma.employmentHistory.findMany({ where: inIds(ids) }), (r) => r.title),
  calendarEvent: async (ids) => toMap(await prisma.calendarEvent.findMany({ where: inIds(ids) }), (r) => `${r.title}, ${day(r.startDate)}`),
  announcement: async (ids) => toMap(await prisma.announcement.findMany({ where: inIds(ids) }), (r) => r.title),
  attendanceRecord: async (ids) =>
    toMap(await prisma.attendanceRecord.findMany({ where: inIds(ids), include: { employee: EMP } }), (r) => `${person(r.employee.user)}, ${day(r.date)}`),
  overtimeAllotment: async (ids) =>
    toMap(await prisma.overtimeAllotment.findMany({ where: inIds(ids), include: { employee: EMP } }), (r) => `${person(r.employee.user)}, ${day(r.date)}`),
}

/** A short "about" text per entry id, for entries that have no written detail and whose record still exists. */
export async function targetLabels(rows: Row[]): Promise<Map<string, string>> {
  const idsByKind = new Map<string, Set<string>>()
  const kindOfRow = new Map<string, { kind: string; id: string }>()
  for (const r of rows) {
    if (r.detail) continue
    const kind = LOOKUP[r.resource]
    const id = r.resourceId?.split(' ')[0] // some ids carry extra words ("<employeeId> 2026-10")
    if (!kind || !id) continue
    kindOfRow.set(r.id, { kind, id })
    idsByKind.set(kind, (idsByKind.get(kind) ?? new Set()).add(id))
  }
  const names = new Map<string, Map<string, string>>()
  await Promise.all(
    [...idsByKind].map(async ([kind, ids]) => {
      try {
        names.set(kind, await RESOLVERS[kind]([...ids]))
      } catch {
        // a lookup that fails just leaves those entries without an "about" text
      }
    }),
  )
  const out = new Map<string, string>()
  for (const [rowId, { kind, id }] of kindOfRow) {
    const label = names.get(kind)?.get(id)
    if (label) out.set(rowId, label)
  }
  return out
}
