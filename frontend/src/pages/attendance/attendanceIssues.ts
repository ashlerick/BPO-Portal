import type { AttendanceRecord } from './types'
import type { ReportRow } from './Shifts'
import { mins } from './Shifts'

// What needs a look on an attendance day: shown as badges on the Records rows and as the list on the Issues tab, so both always
// agree. Late and undertime come from the shift report (measured against the person's shift); the rest from the record itself.
export type IssueKind = 'late' | 'undertime' | 'absent' | 'noOut' | 'breakOver' | 'offSite'

export interface Issue {
  kind: IssueKind
  label: string
  tone: 'amber' | 'red' | 'blue'
}

export const ISSUE_FILTERS: { kind: IssueKind | 'all'; label: string }[] = [
  { kind: 'all', label: 'All' },
  { kind: 'late', label: 'Late' },
  { kind: 'undertime', label: 'Undertime' },
  { kind: 'absent', label: 'Absent' },
  { kind: 'noOut', label: 'No time out' },
  { kind: 'breakOver', label: 'Break over' },
  { kind: 'offSite', label: 'Off-site login' },
]

const SLOT = { morning: 'Break 1', lunch: 'Lunch', afternoon: 'Break 2' } as const

// `today` is the current shift day (YYYY-MM-DD). A day without a time out is only an issue once it has passed: while the shift
// is on, it is normal.
export function issuesFor(r: AttendanceRecord, rep: ReportRow | undefined, today: string): Issue[] {
  if (r.status === 'absent') return [{ kind: 'absent', label: 'Absent', tone: 'red' }]
  const out: Issue[] = []
  if (rep && rep.lateMinutes > 0) out.push({ kind: 'late', label: `Late ${mins(rep.lateMinutes)}`, tone: 'amber' })
  if (rep && rep.undertimeMinutes > 0) out.push({ kind: 'undertime', label: `Undertime ${mins(rep.undertimeMinutes)}`, tone: 'red' })
  if (r.checkInAt && !r.checkOutAt && r.date.slice(0, 10) < today) out.push({ kind: 'noOut', label: 'No time out', tone: 'amber' })
  const over = (r.breaks ?? []).filter((b) => b.overSeconds > 0).map((b) => SLOT[b.slot])
  if (over.length > 0) out.push({ kind: 'breakOver', label: `${over.join(', ')} over`, tone: 'red' })
  if (r.checkInOffSite) out.push({ kind: 'offSite', label: `Off-site login${r.checkInIp ? ` ${r.checkInIp}` : ''}`, tone: 'blue' })
  return out
}

export const reportKey = (employeeId: string | undefined, date: string) => `${employeeId ?? ''}|${date.slice(0, 10)}`

export interface IssueRow {
  record: AttendanceRecord
  report: ReportRow | undefined
  issues: Issue[]
}

// The days that have at least one issue, newest first, then by name.
export function issueRows(records: AttendanceRecord[], reports: Map<string, ReportRow>, today: string): IssueRow[] {
  return records
    .map((record) => {
      const report = reports.get(reportKey(record.employeeId, record.date))
      return { record, report, issues: issuesFor(record, report, today) }
    })
    .filter((x) => x.issues.length > 0)
    .sort((a, b) => b.record.date.localeCompare(a.record.date) || a.record.employeeName.localeCompare(b.record.employeeName))
}
