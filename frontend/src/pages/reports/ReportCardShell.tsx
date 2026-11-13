import type { ReactNode } from 'react'
import { Button } from '../../components/ui/Button'
import { humanize } from '../../utils/text'
import { panel, softButton } from './foaUi'
import type { ReportStatus, WeeklyReport } from './types'
import { useReportActions } from './useReportActions'

const STEPS: ReportStatus[] = ['draft', 'submitted', 'reviewed', 'approved']

const dateLabel = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })

// Where the report is in its life, as four steps. A rejected report shows as rejected with the first step open again.
function Steps({ status }: { status: ReportStatus }) {
  const at = status === 'rejected' ? 0 : STEPS.indexOf(status)
  return (
    <ol className="flex flex-wrap items-center gap-1.5" aria-label={`Status: ${humanize(status)}`}>
      {STEPS.map((s, i) => {
        const done = i < at || (status === 'approved' && i === at)
        const current = i === at && !done
        return (
          <li key={s} className="flex items-center gap-1.5">
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                done
                  ? 'bg-brand-600 text-white dark:bg-brand-500'
                  : current
                    ? status === 'rejected'
                      ? 'bg-red-600 text-white'
                      : 'bg-amber-400 text-gray-900'
                    : 'border border-gray-400 text-gray-600 dark:border-white/30 dark:text-gray-300'
              }`}
            >
              {done ? '✓ ' : ''}
              {current && status === 'rejected' ? 'Rejected' : humanize(s)}
            </span>
            {i < STEPS.length - 1 && <span className="h-px w-3 bg-gray-400 dark:bg-white/30" />}
          </li>
        )
      })}
    </ol>
  )
}

// The top of a filed report, the same for every individually-authored kind: who and which week, where it is in review, and what you can do
// with it (edit, reopen, review, approve, reject, export). The report's own content goes in as children.
export function ReportCardShell({
  report,
  onUpdated,
  onEdit,
  children,
}: {
  report: WeeklyReport
  onUpdated: (r: WeeklyReport) => void
  /** Open the report in the editor. */
  onEdit: (r: WeeklyReport) => void
  children: ReactNode
}) {
  const { busy, error, exporting, canEdit, canExport, canReview, transition, handleExport } = useReportActions(report, onUpdated)
  return (
    <div className="space-y-3">
      <section className={panel}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-lg font-semibold text-gray-900 dark:text-white">{report.authorName ?? report.team}</p>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              {report.team} · {dateLabel(report.periodStart)} to {dateLabel(report.periodEnd)}
            </p>
          </div>
          <Steps status={report.status} />
        </div>

        {report.data.managerComments && (
          <p className="mt-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-500/40 dark:bg-red-950/50 dark:text-red-100">
            <b>Manager comments:</b> {report.data.managerComments}
          </p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {canEdit && (
            <Button variant="primary" size="sm" onClick={() => onEdit(report)}>
              {report.status === 'rejected' ? 'Edit and resubmit' : 'Edit report'}
            </Button>
          )}
          {report.status === 'rejected' && (
            <button type="button" className={softButton} onClick={() => transition('reopen')} disabled={busy}>
              Reopen as draft
            </button>
          )}
          {canReview && report.status === 'submitted' && (
            <button type="button" className={softButton} onClick={() => transition('review')} disabled={busy}>
              Mark reviewed
            </button>
          )}
          {canReview && report.status === 'reviewed' && (
            <Button variant="primary" size="sm" onClick={() => transition('approve')} disabled={busy}>
              Approve
            </Button>
          )}
          {canReview && (
            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                const reason = window.prompt('Reason for rejecting this report:')
                if (reason === null) return
                transition('reject', reason ? { comment: reason } : undefined)
              }}
              disabled={busy}
            >
              Reject
            </Button>
          )}
          <span className="flex-1" />
          {canExport && (
            <span className="flex items-center gap-1.5">
              <span className="text-xs text-gray-600 dark:text-gray-300">Export</span>
              {(['pdf', 'xlsx', 'csv'] as const).map((f) => (
                <button key={f} type="button" className={`${softButton} uppercase`} onClick={() => handleExport(f)} disabled={exporting === f}>
                  {exporting === f ? '…' : f}
                </button>
              ))}
            </span>
          )}
        </div>
        {error && <p className="mt-2 text-sm font-medium text-red-700 dark:text-red-300">{error}</p>}
      </section>
      {children}
    </div>
  )
}
