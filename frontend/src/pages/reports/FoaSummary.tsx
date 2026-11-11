import { Badge } from '../../components/ui/Badge'
import { humanize } from '../../utils/text'
import { FOA_ATTENDANCE_COLUMNS, FOA_CHECKLIST_DAYS, FOA_CHECKLIST_TASKS, foaAttendanceDates, type FoaReportData } from './foa'
import { totalsOf, type FoaWeek } from './foaWeeks.ts'
import type { ReportStatus, WeeklyReport } from './types'

const tone: Record<ReportStatus, 'gray' | 'blue' | 'purple' | 'green' | 'red'> = {
  draft: 'gray',
  submitted: 'blue',
  reviewed: 'purple',
  approved: 'green',
  rejected: 'red',
}

const shortDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

interface Row {
  week: FoaWeek
  reports: WeeklyReport[]
  variance: number
  safety: number
  checklist: number // percent, over the reports that week
  attendance: number
}

function rowOf(week: FoaWeek, reports: WeeklyReport[]): Row {
  let variance = 0
  let safety = 0
  let done = 0
  let doneOf = 0
  let filled = 0
  let filledOf = 0
  for (const r of reports) {
    const t = totalsOf(r.data as FoaReportData, FOA_ATTENDANCE_COLUMNS, FOA_CHECKLIST_TASKS, FOA_CHECKLIST_DAYS, foaAttendanceDates(r.periodStart, r.periodEnd).length)
    variance += t.variance
    safety += t.safety
    done += t.checklistDone
    doneOf += t.checklistTotal
    filled += t.attendanceFilled
    filledOf += t.attendanceTotal
  }
  return {
    week,
    reports,
    variance,
    safety,
    checklist: doneOf ? Math.round((done / doneOf) * 100) : 0,
    attendance: filledOf ? Math.round((filled / filledOf) * 100) : 0,
  }
}

// The year at a glance: one row per week with who filed, the state of each report, and the numbers the reports carry. Rows run newest
// first; a week with no report is shown dim so a gap stands out. Clicking a row opens that week.
export function FoaSummary({
  year,
  weeks,
  reportsByWeek,
  currentEnd,
  onOpen,
}: {
  year: number
  weeks: FoaWeek[]
  reportsByWeek: Record<string, WeeklyReport[]>
  /** The Friday the current week ends on; later weeks are not listed. */
  currentEnd: string
  onOpen: (end: string) => void
}) {
  const rows = weeks.filter((w) => w.end <= currentEnd).map((w) => rowOf(w, reportsByWeek[w.end] ?? [])).reverse()
  const filed = rows.reduce((a, r) => a + r.reports.length, 0)
  const variance = rows.reduce((a, r) => a + r.variance, 0)
  const safety = rows.reduce((a, r) => a + r.safety, 0)
  const peak = Math.max(1, ...rows.map((r) => r.variance + r.safety))

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        {[
          ['Reports filed', filed],
          ['Variance investigations', variance],
          ['Motive safety events', safety],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-black/5 bg-white/80 px-3 py-2 dark:border-white/10 dark:bg-white/[0.035]">
            <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
            <p className="text-xl font-semibold text-gray-900 dark:text-gray-100">{value}</p>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border border-black/5 bg-white/80 dark:border-white/10 dark:bg-white/[0.035]">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
            <tr className="border-b border-gray-100 dark:border-white/10">
              <th className="px-3 py-2 font-medium">Week</th>
              <th className="px-3 py-2 font-medium">Reports</th>
              <th className="px-3 py-2 text-center font-medium">Variance</th>
              <th className="px-3 py-2 text-center font-medium">Motive</th>
              <th className="px-3 py-2 font-medium">Investigations and events</th>
              <th className="px-3 py-2 text-center font-medium">Checklist</th>
              <th className="px-3 py-2 text-center font-medium">Attendance</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                  No weeks of {year} yet.
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const empty = r.reports.length === 0
              const byStatus = r.reports.reduce<Record<string, number>>((acc, x) => ({ ...acc, [x.status]: (acc[x.status] ?? 0) + 1 }), {})
              return (
                <tr
                  key={r.week.end}
                  onClick={() => onOpen(r.week.end)}
                  className={`cursor-pointer border-t border-gray-100 hover:bg-brand-50/60 dark:border-white/5 dark:hover:bg-white/5 ${empty ? 'text-gray-400 dark:text-gray-600' : 'text-gray-800 dark:text-gray-200'}`}
                >
                  <td className="whitespace-nowrap px-3 py-2">
                    <span className="font-medium">Week {String(r.week.num).padStart(2, '0')}</span>
                    <span className="ml-2 text-xs text-gray-400">
                      {shortDate(r.week.start)} to {shortDate(r.week.end)}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {empty ? (
                      <span className="text-xs">No report</span>
                    ) : (
                      <span className="flex flex-wrap gap-1">
                        {Object.entries(byStatus).map(([status, n]) => (
                          <Badge key={status} tone={tone[status as ReportStatus]}>
                            {n > 1 ? `${n} ` : ''}
                            {humanize(status)}
                          </Badge>
                        ))}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center tabular-nums">{empty ? '' : r.variance}</td>
                  <td className="px-3 py-2 text-center tabular-nums">{empty ? '' : r.safety}</td>
                  <td className="px-3 py-2">
                    {!empty && (
                      <span className="flex h-2 w-full min-w-[6rem] overflow-hidden rounded-full bg-gray-100 dark:bg-white/10" title={`${r.variance} variance, ${r.safety} Motive`}>
                        <span className="h-full bg-brand-500" style={{ width: `${(r.variance / peak) * 100}%` }} />
                        <span className="h-full bg-amber-400" style={{ width: `${(r.safety / peak) * 100}%` }} />
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center tabular-nums">{empty ? '' : `${r.checklist}%`}</td>
                  <td className="px-3 py-2 text-center tabular-nums">{empty ? '' : `${r.attendance}%`}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        Green is variance investigations, amber is Motive safety events. Checklist and Attendance are how much of each sheet is filled in.
      </p>
    </div>
  )
}
