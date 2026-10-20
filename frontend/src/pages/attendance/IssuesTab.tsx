import { useState } from 'react'
import { EmptyState } from '../../components/AsyncState'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { formatDateOnly, formatManilaTime } from '../../utils/dates'
import { zoneLabel } from '../../utils/shiftTime'
import { ISSUE_FILTERS, type IssueKind, type IssueRow } from './attendanceIssues'

// Everything that needs a look in the range, one line per day: late, undertime, absent, no time out, breaks over, off-site logins.
// The same flags show as badges on the Records rows.
export function IssuesTab({ rows, range }: { rows: IssueRow[]; range: string }) {
  const [filter, setFilter] = useState<IssueKind | 'all'>('all')
  const shown = filter === 'all' ? rows : rows.filter((r) => r.issues.some((i) => i.kind === filter))
  const count = (kind: IssueKind | 'all') => (kind === 'all' ? rows.length : rows.filter((r) => r.issues.some((i) => i.kind === kind)).length)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          Issues <span className="font-normal text-gray-500 dark:text-gray-400">{range}</span>
        </h2>
        <div className="flex flex-wrap gap-2">
          {ISSUE_FILTERS.filter((f) => f.kind === 'all' || count(f.kind) > 0 || f.kind === filter).map((f) => (
            <Button
              key={f.kind}
              size="sm"
              aria-pressed={filter === f.kind}
              className={filter === f.kind ? '!border-brand-500 !bg-brand-600/15 !text-brand-700 dark:!text-brand-300' : ''}
              onClick={() => setFilter(f.kind)}
            >
              {f.label} {count(f.kind) > 0 && <span className="opacity-70">{count(f.kind)}</span>}
            </Button>
          ))}
        </div>
      </div>
      {shown.length === 0 ? (
        <EmptyState label={rows.length === 0 ? 'No issues in this range.' : 'Nothing of that kind in this range.'} />
      ) : (
        <Card className="overflow-x-auto !p-0">
          <table className="stack-table w-full text-left text-sm">
            <thead>
              <tr className="border-b border-black/10 text-xs uppercase tracking-wide text-gray-500 dark:border-white/10 dark:text-gray-400">
                <th className="px-4 py-3 font-medium">Day</th>
                <th className="px-4 py-3 font-medium">Person</th>
                <th className="px-4 py-3 font-medium">Shift</th>
                <th className="px-4 py-3 font-medium">In / Out</th>
                <th className="px-4 py-3 font-medium">What</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5 dark:divide-white/10">
              {shown.map(({ record: r, report: rep, issues }) => (
                <tr key={r.id}>
                  <td data-primary className="px-4 py-2.5 text-gray-800 dark:text-gray-200">{formatDateOnly(r.date)}</td>
                  <td data-label="Person" className="px-4 py-2.5 font-medium text-gray-900 dark:text-gray-100">{r.employeeName}</td>
                  <td data-label="Shift" className="px-4 py-2.5 text-gray-500 dark:text-gray-400">
                    {rep ? `${rep.shiftName} ${rep.scheduledStart}–${rep.scheduledEnd} ${zoneLabel(rep.timezone)}` : '—'}
                  </td>
                  <td data-label="In / Out" className="px-4 py-2.5">
                    {r.status === 'absent' ? '—' : `${formatManilaTime(r.checkInAt)} / ${formatManilaTime(r.checkOutAt)}`}
                  </td>
                  <td data-label="What" className="px-4 py-2.5">
                    <span className="flex flex-wrap justify-end gap-1.5 md:justify-start">
                      {issues.map((i) => (
                        <Badge key={i.kind} tone={i.tone}>{i.label}</Badge>
                      ))}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      <p className="text-xs text-gray-500 dark:text-gray-400">
        Late and undertime are measured against each person's assigned shift (people with no shift are not measured). A day with no time out only counts once it has passed.
      </p>
    </div>
  )
}
