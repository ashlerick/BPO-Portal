import { useState, type ReactNode } from 'react'
import { Button } from '../../components/ui/Button'
import { humanize } from '../../utils/text'
import { AttendanceGrid } from './AttendanceGrid'
import { FoaChecklist } from './FoaChecklist'
import { FoaCounts, type CountField } from './FoaCounts'
import { FOA_ATTENDANCE_COLUMNS, FOA_CHECKLIST_DAYS, FOA_CHECKLIST_TASKS, FOA_TERRITORIES, foaAttendanceDates, type FoaReportData } from './foa'
import { addDays, startFromPrevious, totalsOf } from './foaWeeks.ts'
import { chipOff, chipOn, input, label, panel, sectionHint, sectionTitle, softButton } from './foaUi'
import type { ReportStatus, WeeklyReport } from './types'
import { useReportActions } from './useReportActions'

const VARIANCE: CountField[] = [
  { key: 'extendedBreaks', label: 'Extended Breaks' },
  { key: 'backToBackBreaks', label: 'Back-to-Back Breaks' },
  { key: 'otherInvestigations', label: 'Other Investigations' },
]

const SAFETY: CountField[] = [
  { key: 'cellphone', label: 'Cellphone' },
  { key: 'seatbelts', label: 'Seatbelts' },
  { key: 'incidents', label: 'Incidents' },
  { key: 'trackerDascam', label: 'Tracker/Dascam' },
  { key: 'speeding', label: 'Speeding' },
]

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

function Block({ n, title, hint, done, children }: { n: number; title: string; hint?: string; done: boolean; children: ReactNode }) {
  return (
    <section className={panel}>
      <div className="mb-3 flex items-start gap-3">
        <span
          className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
            done ? 'bg-brand-600 text-white dark:bg-brand-500' : 'border-2 border-gray-400 text-gray-700 dark:border-white/40 dark:text-gray-200'
          }`}
        >
          {done ? '✓' : n}
        </span>
        <div>
          <h3 className={sectionTitle}>{title}</h3>
          {hint && <p className={sectionHint}>{hint}</p>}
        </div>
      </div>
      {children}
    </section>
  )
}

const isBlank = (d: FoaReportData) => Object.keys(d).filter((k) => k !== 'managerComments').length === 0

// One FOA weekly report. Read mode shows what was filed, laid out the way it is filled in. Edit mode is the same page with controls, and a
// bar that stays at the bottom with the progress and the Save draft and Submit buttons. A new empty draft opens straight into editing.
export function FoaReportCard({
  report,
  previous,
  onUpdated,
}: {
  report: WeeklyReport
  previous?: FoaReportData
  onUpdated: (r: WeeklyReport) => void
}) {
  const [editing, setEditing] = useState(false)
  const [data, setData] = useState<FoaReportData>(report.data as FoaReportData)
  const { busy, error, exporting, isOwnReport, canEdit, canExport, canReview, transition, handleExport } = useReportActions(report, onUpdated, () => setEditing(false))
  const [autoOpened, setAutoOpened] = useState(false)
  if (!autoOpened) {
    setAutoOpened(true)
    if (canEdit && isOwnReport && isBlank(report.data as FoaReportData)) setEditing(true)
  }

  const shown = editing ? data : (report.data as FoaReportData)
  const start = report.periodStart.slice(0, 10)
  const dates = foaAttendanceDates(report.periodStart, report.periodEnd)
  const territories = shown.territories ?? []
  const attendance = shown.attendance ?? {}
  const checklist = shown.taskChecklist ?? {}
  const variance = shown.varianceInvestigations ?? {}
  const safety = shown.motiveSafetyEvents ?? {}

  const t = totalsOf(shown, FOA_ATTENDANCE_COLUMNS, FOA_CHECKLIST_TASKS, FOA_CHECKLIST_DAYS, dates.length)
  const done = {
    territory: territories.length > 0,
    attendance: t.attendanceFilled > 0,
    checklist: t.checklistDone > 0,
    numbers: [...Object.values(variance), ...Object.values(safety)].some((v) => v !== undefined),
    notes: !!(shown.highlights?.trim() || shown.roadblocks?.trim()),
  }
  const doneCount = Object.values(done).filter(Boolean).length

  const set = (patch: Partial<FoaReportData>) => setData((d) => ({ ...d, ...patch }))

  function toggleTerritory(name: string) {
    set({ territories: territories.includes(name) ? territories.filter((x) => x !== name) : [...territories, name] })
  }

  function fillDown(column: string) {
    const value = attendance[dates[0]]?.[column as (typeof FOA_ATTENDANCE_COLUMNS)[number]] ?? []
    const next = { ...attendance }
    for (const date of dates) next[date] = { ...next[date], [column]: value }
    set({ attendance: next })
  }

  const text = (key: 'additionalTasks' | 'highlights' | 'roadblocks', title: string) => (
    <div key={key}>
      <p className={`${label} mb-1`}>{title}</p>
      {editing ? (
        <textarea
          value={shown[key] ?? ''}
          onChange={(e) => set({ [key]: e.target.value })}
          rows={key === 'additionalTasks' ? 2 : 4}
          className={input}
        />
      ) : (
        <p className="whitespace-pre-wrap text-sm text-gray-900 dark:text-gray-100">{shown[key]?.trim() || <span className="text-gray-500 dark:text-gray-400">{'—'}</span>}</p>
      )}
    </div>
  )

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

        {!editing && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {canEdit && (
              <Button variant="primary" size="sm" onClick={() => setEditing(true)}>
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
        )}
        {error && <p className="mt-2 text-sm font-medium text-red-700 dark:text-red-300">{error}</p>}
      </section>

      <Block n={1} title="Assigned territory" hint={editing ? 'Pick every territory you covered this week.' : undefined} done={done.territory}>
        {editing ? (
          <>
            <div className="flex flex-wrap gap-2">
              {FOA_TERRITORIES.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => toggleTerritory(name)}
                  aria-pressed={territories.includes(name)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${territories.includes(name) ? chipOn : chipOff}`}
                >
                  {name}
                </button>
              ))}
            </div>
            <div className="mt-2 flex gap-3 text-xs">
              <button type="button" className="font-medium text-brand-700 hover:underline dark:text-brand-300" onClick={() => set({ territories: [...FOA_TERRITORIES] })}>
                Select all
              </button>
              <button type="button" className="font-medium text-gray-700 hover:underline dark:text-gray-300" onClick={() => set({ territories: [] })}>
                Clear
              </button>
            </div>
          </>
        ) : territories.length ? (
          <div className="flex flex-wrap gap-2">
            {territories.map((name) => (
              <span key={name} className="rounded-full bg-brand-600 px-3 py-1 text-xs font-semibold text-white dark:bg-brand-500">
                {name}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-400">{'—'}</p>
        )}
      </Block>

      <Block n={2} title="Attendance task sheet" hint={editing ? 'Who covered what each day. Click a cell to choose.' : undefined} done={done.attendance}>
        <AttendanceGrid
          dates={dates}
          attendance={attendance}
          readOnly={!editing}
          onCell={(date, column, tokens) => set({ attendance: { ...attendance, [date]: { ...attendance[date], [column]: tokens } } })}
          onFillDown={fillDown}
          onSameAsLastWeek={previous?.attendance ? () => set({ attendance: startFromPrevious(previous, addDays(start, -7), start).attendance }) : undefined}
        />
      </Block>

      <Block n={3} title="Task checklist" hint={editing ? 'Tap a day to mark it done, or use All week.' : `${t.checklistDone} of ${t.checklistTotal} done`} done={done.checklist}>
        <FoaChecklist value={checklist} readOnly={!editing} onChange={(next) => set({ taskChecklist: next })} />
      </Block>

      <Block n={4} title="Investigations and safety events" hint={editing ? 'Counts for the week. Use + and −, or type a number.' : undefined} done={done.numbers}>
        <div className="space-y-5">
          <FoaCounts
            title="Variance investigations"
            fields={VARIANCE}
            values={variance}
            readOnly={!editing}
            onChange={(key, v) => set({ varianceInvestigations: { ...variance, [key]: v } })}
          />
          <FoaCounts
            title="Motive safety events"
            fields={SAFETY}
            values={safety}
            readOnly={!editing}
            onChange={(key, v) => set({ motiveSafetyEvents: { ...safety, [key]: v } })}
          />
        </div>
      </Block>

      <Block n={5} title="Highlights and roadblocks" done={done.notes}>
        <div className="space-y-3">
          {text('additionalTasks', 'Additional tasks')}
          {text('highlights', 'Highlights')}
          {text('roadblocks', 'Roadblocks')}
        </div>
      </Block>

      {editing && (
        <div className="sticky bottom-3 z-30 flex flex-wrap items-center gap-3 rounded-2xl border border-gray-400 bg-white/95 px-4 py-3 shadow-2xl backdrop-blur dark:border-white/25 dark:bg-[#0d2a1d]/95">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">{doneCount} of 5 sections filled</p>
          <span className="hidden flex-1 gap-1.5 sm:flex">
            {Object.values(done).map((d, i) => (
              <span key={i} className={`h-2 w-8 rounded-full ${d ? 'bg-brand-600 dark:bg-brand-400' : 'bg-gray-300 dark:bg-white/20'}`} />
            ))}
          </span>
          <span className="flex-1 sm:hidden" />
          <button
            type="button"
            className={softButton}
            onClick={() => {
              setData(report.data as FoaReportData)
              setEditing(false)
            }}
            disabled={busy}
          >
            Cancel
          </button>
          <Button size="sm" onClick={() => transition('save', { data })} disabled={busy}>
            Save draft
          </Button>
          <Button variant="primary" size="sm" onClick={() => transition('submit', { data })} disabled={busy}>
            Submit report
          </Button>
        </div>
      )}
    </div>
  )
}
