import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../../auth/AuthContext'
import { EmptyState, ErrorState, LoadingState } from '../../components/AsyncState'
import { api, ApiError } from '../../services/api'
import { Card, CardForm } from '../../components/ui/Card'
import { Section, SectionStack } from '../../components/ui/Section'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { PageHeader } from '../../components/ui/PageHeader'
import { humanize } from '../../utils/text'
import type { ReportData, ReportStatus, WeeklyReport } from './types'
import {
  FOA_ATTENDANCE_COLUMNS,
  FOA_ATTENDANCE_TOKENS,
  FOA_CHECKLIST_DAYS,
  FOA_CHECKLIST_TASKS,
  FOA_TERRITORIES,
  foaAttendanceDates,
  isFoaDepartment,
  type FoaReportData,
} from './foa'
import type { MyEmployeeProfile } from '../hris/types'

interface Team {
  id: string
  name: string
  department: string
}

const statusTones: Record<ReportStatus, 'gray' | 'blue' | 'purple' | 'green' | 'red'> = {
  draft: 'gray',
  submitted: 'blue',
  reviewed: 'purple',
  approved: 'green',
  rejected: 'red',
}

const dataFields: { key: keyof ReportData; label: string; multiline?: boolean }[] = [
  { key: 'client', label: 'Client/Account' },
  { key: 'headcount', label: 'Headcount' },
  { key: 'attendance', label: 'Attendance' },
  { key: 'productivity', label: 'Productivity' },
  { key: 'qa', label: 'Quality/QA' },
  { key: 'sla', label: 'SLA' },
  { key: 'performanceMetrics', label: 'Performance Metrics', multiline: true },
  { key: 'issues', label: 'Issues', multiline: true },
  { key: 'achievements', label: 'Achievements', multiline: true },
  { key: 'actionItems', label: 'Action Items', multiline: true },
]

function ReportDataFields({
  data,
  onChange,
}: {
  data: ReportData
  onChange: (data: ReportData) => void
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {dataFields.map(({ key, label, multiline }) => {
        const value = data[key]
        const stringValue = value == null ? '' : String(value)
        const update = (v: string) =>
          onChange({ ...data, [key]: key === 'headcount' ? (v ? Number(v) : undefined) : v })
        return (
          <div key={key} className={multiline ? 'sm:col-span-2 space-y-1' : 'space-y-1'}>
            <label className="text-sm text-gray-600 dark:text-gray-400">{label}</label>
            {multiline ? (
              <textarea value={stringValue} onChange={(e) => update(e.target.value)} rows={2} className="field" />
            ) : (
              <input
                type={key === 'headcount' ? 'number' : 'text'}
                value={stringValue}
                onChange={(e) => update(e.target.value)}
                className="field"
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

const weekdayFmt = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })

function FoaReportFields({
  data,
  periodStart,
  periodEnd,
  onChange,
}: {
  data: FoaReportData
  periodStart: string
  periodEnd: string
  onChange: (data: FoaReportData) => void
}) {
  const dates = foaAttendanceDates(periodStart, periodEnd)
  const territories = data.territories ?? []
  const attendance = data.attendance ?? {}
  const checklist = data.taskChecklist ?? {}
  const variance = data.varianceInvestigations ?? {}
  const safety = data.motiveSafetyEvents ?? {}

  function toggleTerritory(t: string) {
    onChange({
      ...data,
      territories: territories.includes(t) ? territories.filter((x) => x !== t) : [...territories, t],
    })
  }

  function setCell(date: string, column: string, tokens: string[]) {
    onChange({
      ...data,
      attendance: { ...attendance, [date]: { ...attendance[date], [column]: tokens } },
    })
  }

  function fillDown(column: string) {
    const first = dates[0]
    const value = attendance[first]?.[column as (typeof FOA_ATTENDANCE_COLUMNS)[number]] ?? []
    const next = { ...attendance }
    for (const date of dates) next[date] = { ...next[date], [column]: value }
    onChange({ ...data, attendance: next })
  }

  function setChecked(task: string, day: string, checked: boolean) {
    onChange({
      ...data,
      taskChecklist: { ...checklist, [task]: { ...checklist[task as keyof typeof checklist], [day]: checked } },
    })
  }

  function checkAllDays(task: string) {
    const allChecked = Object.fromEntries(FOA_CHECKLIST_DAYS.map((d) => [d, true]))
    onChange({ ...data, taskChecklist: { ...checklist, [task]: allChecked } })
  }

  function setVariance(key: keyof NonNullable<FoaReportData['varianceInvestigations']>, v: string) {
    onChange({ ...data, varianceInvestigations: { ...variance, [key]: v ? Number(v) : undefined } })
  }

  function setSafety(key: keyof NonNullable<FoaReportData['motiveSafetyEvents']>, v: string) {
    onChange({ ...data, motiveSafetyEvents: { ...safety, [key]: v ? Number(v) : undefined } })
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="mb-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">Assigned Territory</p>
        <div className="flex flex-wrap gap-2">
          {FOA_TERRITORIES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => toggleTerritory(t)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                territories.includes(t)
                  ? 'border-orange-500 bg-orange-500 text-white'
                  : 'border-gray-300 text-gray-600 hover:border-gray-400 dark:border-gray-700 dark:text-gray-400'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">Attendance Task Sheet</p>
        <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th className="px-2 py-1.5 text-left font-medium text-gray-500 dark:text-gray-400">Day</th>
                {FOA_ATTENDANCE_COLUMNS.map((col) => (
                  <th key={col} className="px-2 py-1.5 text-left font-medium text-gray-500 dark:text-gray-400">
                    <div className="flex items-center gap-1.5">
                      {col}
                      <button
                        type="button"
                        onClick={() => fillDown(col)}
                        className="rounded border border-gray-300 px-1 text-[10px] font-normal text-gray-500 hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-800"
                        title={`Copy ${dates[0] ? weekdayFmt(dates[0]) : 'first day'}'s value to every day`}
                      >
                        fill ↓
                      </button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dates.map((date) => (
                <tr key={date} className="border-t border-gray-100 dark:border-gray-800">
                  <td className="whitespace-nowrap px-2 py-1.5 text-gray-600 dark:text-gray-400">
                    {weekdayFmt(date)}
                  </td>
                  {FOA_ATTENDANCE_COLUMNS.map((col) => (
                    <td key={col} className="px-2 py-1.5">
                      <select
                        multiple
                        size={3}
                        value={attendance[date]?.[col] ?? []}
                        onChange={(e) =>
                          setCell(
                            date,
                            col,
                            Array.from(e.target.selectedOptions).map((o) => o.value),
                          )
                        }
                        className="field min-w-[9rem] text-xs"
                      >
                        {FOA_ATTENDANCE_TOKENS.map((token) => (
                          <option key={token} value={token}>
                            {token}
                          </option>
                        ))}
                      </select>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-500">Ctrl/Cmd-click to select more than one.</p>
      </div>

      <div>
        <p className="mb-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">Task Checklist</p>
        <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th className="px-2 py-1.5 text-left font-medium text-gray-500 dark:text-gray-400">Task</th>
                {FOA_CHECKLIST_DAYS.map((d) => (
                  <th key={d} className="px-2 py-1.5 text-center font-medium text-gray-500 dark:text-gray-400">
                    {d.slice(0, 3)}
                  </th>
                ))}
                <th />
              </tr>
            </thead>
            <tbody>
              {FOA_CHECKLIST_TASKS.map((task) => (
                <tr key={task} className="border-t border-gray-100 dark:border-gray-800">
                  <td className="px-2 py-1.5 text-gray-700 dark:text-gray-300">{task}</td>
                  {FOA_CHECKLIST_DAYS.map((day) => (
                    <td key={day} className="px-2 py-1.5 text-center">
                      <input
                        type="checkbox"
                        checked={checklist[task as keyof typeof checklist]?.[day] ?? false}
                        onChange={(e) => setChecked(task, day, e.target.checked)}
                      />
                    </td>
                  ))}
                  <td className="px-2 py-1.5">
                    <button
                      type="button"
                      onClick={() => checkAllDays(task)}
                      className="whitespace-nowrap rounded border border-gray-300 px-1.5 py-0.5 text-[10px] text-gray-500 hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-800"
                    >
                      all done
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="mb-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">Variance Investigations</p>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                ['extendedBreaks', 'Extended Breaks'],
                ['backToBackBreaks', 'Back-to-Back Breaks'],
                ['otherInvestigations', 'Other Investigations'],
              ] as const
            ).map(([key, label]) => (
              <div key={key} className="space-y-1">
                <label className="text-xs text-gray-500 dark:text-gray-400">{label}</label>
                <input
                  type="number"
                  min={0}
                  value={variance[key] ?? ''}
                  onChange={(e) => setVariance(key, e.target.value)}
                  className="field"
                />
              </div>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">Motive Safety Events</p>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                ['cellphone', 'Cellphone'],
                ['seatbelts', 'Seatbelts'],
                ['incidents', 'Incidents'],
                ['trackerDascam', 'Tracker/Dascam'],
                ['speeding', 'Speeding'],
              ] as const
            ).map(([key, label]) => (
              <div key={key} className="space-y-1">
                <label className="text-xs text-gray-500 dark:text-gray-400">{label}</label>
                <input
                  type="number"
                  min={0}
                  value={safety[key] ?? ''}
                  onChange={(e) => setSafety(key, e.target.value)}
                  className="field"
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {(
          [
            ['additionalTasks', 'Additional Tasks'],
            ['highlights', 'Highlights'],
            ['roadblocks', 'Roadblocks'],
          ] as const
        ).map(([key, label]) => (
          <div key={key} className="space-y-1">
            <label className="text-sm text-gray-600 dark:text-gray-400">{label}</label>
            <textarea
              value={data[key] ?? ''}
              onChange={(e) => onChange({ ...data, [key]: e.target.value })}
              rows={2}
              className="field"
            />
          </div>
        ))}
      </div>
    </div>
  )
}

function CreateReportForm({ teams, onCreated }: { teams: Team[]; onCreated: (r: WeeklyReport) => void }) {
  const { guardedAction } = useAuth()
  const [teamId, setTeamId] = useState('')
  const [periodStart, setPeriodStart] = useState('')
  const [periodEnd, setPeriodEnd] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    guardedAction(['team_leader', 'hr', 'admin'], async () => {
      setError(null)
      setSubmitting(true)
      try {
        const created = await api.post<WeeklyReport>('/reports', {
          teamId,
          periodStart: new Date(periodStart).toISOString(),
          periodEnd: new Date(periodEnd).toISOString(),
        })
        onCreated(created)
        setPeriodStart('')
        setPeriodEnd('')
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Could not create report')
      } finally {
        setSubmitting(false)
      }
    })
  }

  return (
    <CardForm onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
      <div className="w-full space-y-1 md:w-auto">
        <label className="text-sm text-gray-600 dark:text-gray-400">Team</label>
        <select required value={teamId} onChange={(e) => setTeamId(e.target.value)} className="field">
          <option value="">Select…</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>
      <div className="grid w-full grid-cols-2 gap-3 max-[359px]:grid-cols-1 md:contents">
        <div className="min-w-0 space-y-1">
          <label className="text-sm text-gray-600 dark:text-gray-400">Period start</label>
          <input
            type="date"
            required
            value={periodStart}
            onChange={(e) => setPeriodStart(e.target.value)}
            className="field px-2.5 md:px-3"
          />
        </div>
        <div className="min-w-0 space-y-1">
          <label className="text-sm text-gray-600 dark:text-gray-400">Period end</label>
          <input
            type="date"
            required
            value={periodEnd}
            onChange={(e) => setPeriodEnd(e.target.value)}
            className="field px-2.5 md:px-3"
          />
        </div>
      </div>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <Button type="submit" variant="primary" disabled={submitting} className="w-full md:w-auto">
        {submitting ? 'Creating…' : 'New report'}
      </Button>
    </CardForm>
  )
}

// FOA reports are individually authored (no team dropdown — always your
// own team) and default to the most recently completed Friday-to-Friday
// week, matching how the department's Jotform frames its reporting period.
function defaultFoaPeriod(): { start: string; end: string } {
  const today = new Date()
  const lastFriday = new Date(today)
  const daysSinceFriday = (today.getUTCDay() + 2) % 7
  lastFriday.setUTCDate(today.getUTCDate() - daysSinceFriday)
  const priorFriday = new Date(lastFriday)
  priorFriday.setUTCDate(lastFriday.getUTCDate() - 7)
  return { start: priorFriday.toISOString().slice(0, 10), end: lastFriday.toISOString().slice(0, 10) }
}

function CreateFoaReportForm({ teamId, onCreated }: { teamId: string; onCreated: (r: WeeklyReport) => void }) {
  const { guardedAction } = useAuth()
  const defaults = defaultFoaPeriod()
  const [periodStart, setPeriodStart] = useState(defaults.start)
  const [periodEnd, setPeriodEnd] = useState(defaults.end)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    guardedAction(['employee'], async () => {
      setError(null)
      setSubmitting(true)
      try {
        const created = await api.post<WeeklyReport>('/reports', {
          teamId,
          periodStart: new Date(periodStart).toISOString(),
          periodEnd: new Date(periodEnd).toISOString(),
        })
        onCreated(created)
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Could not create report')
      } finally {
        setSubmitting(false)
      }
    })
  }

  return (
    <CardForm onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
      <div className="grid w-full grid-cols-2 gap-3 max-[359px]:grid-cols-1 md:contents">
        <div className="min-w-0 space-y-1">
          <label className="text-sm text-gray-600 dark:text-gray-400">Week starting (Friday)</label>
          <input
            type="date"
            required
            value={periodStart}
            onChange={(e) => setPeriodStart(e.target.value)}
            className="field px-2.5 md:px-3"
          />
        </div>
        <div className="min-w-0 space-y-1">
          <label className="text-sm text-gray-600 dark:text-gray-400">Week ending (Friday)</label>
          <input
            type="date"
            required
            value={periodEnd}
            onChange={(e) => setPeriodEnd(e.target.value)}
            className="field px-2.5 md:px-3"
          />
        </div>
      </div>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <Button type="submit" variant="primary" disabled={submitting} className="w-full md:w-auto">
        {submitting ? 'Creating…' : 'New FOA weekly report'}
      </Button>
    </CardForm>
  )
}

function ReportCard({ report, onUpdated }: { report: WeeklyReport; onUpdated: (r: WeeklyReport) => void }) {
  const { user, effectiveRoles, guardedAction } = useAuth()
  const isFoa = report.schemaKey === 'foa'
  const [editing, setEditing] = useState(false)
  const [data, setData] = useState<ReportData | FoaReportData>(report.data)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [exporting, setExporting] = useState<string | null>(null)

  const isReviewer = effectiveRoles.some((r) => r === 'manager' || r === 'hr' || r === 'admin')
  const isOwnReport = report.authorId != null && report.authorId === user?.id
  const canEdit = report.status === 'draft' || report.status === 'rejected'
  const canExport = isOwnReport || isReviewer || effectiveRoles.includes('team_leader')
  const hasActions = canEdit || (isReviewer && (report.status === 'submitted' || report.status === 'reviewed'))

  function transition(action: string, extra?: Record<string, unknown>) {
    const requiredRoles =
      action === 'review' || action === 'approve' || action === 'reject'
        ? (['manager', 'hr', 'admin'] as const)
        : (['team_leader', 'hr', 'admin'] as const)

    guardedAction([...requiredRoles], async () => {
      setBusy(true)
      setError(null)
      try {
        const updated = await api.put<WeeklyReport>(`/reports/${report.id}`, { action, ...extra })
        onUpdated(updated)
        setEditing(false)
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Could not update report')
      } finally {
        setBusy(false)
      }
    })
  }

  async function handleExport(format: 'csv' | 'xlsx' | 'pdf') {
    setExporting(format)
    setError(null)
    try {
      const { url } = await api.get<{ url: string }>(`/reports/${report.id}/export?format=${format}`)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not export report')
    } finally {
      setExporting(null)
    }
  }

  const dateFmt = (d: string) =>
    new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="font-medium text-gray-900 dark:text-gray-100">
            {isFoa ? (report.authorName ?? report.team) : report.team}
          </span>
          {isFoa && report.authorName && (
            <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">{report.team}</span>
          )}
          <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">
            {dateFmt(report.periodStart)} – {dateFmt(report.periodEnd)}
          </span>
        </div>
        <Badge tone={statusTones[report.status]}>{humanize(report.status)}</Badge>
      </div>

      {report.data.managerComments && (
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          <span className="font-medium">Manager comments:</span> {report.data.managerComments}
        </p>
      )}

      {editing ? (
        <div className="mt-3 space-y-3">
          {isFoa ? (
            <FoaReportFields
              data={data as FoaReportData}
              periodStart={report.periodStart}
              periodEnd={report.periodEnd}
              onChange={setData}
            />
          ) : (
            <ReportDataFields data={data as ReportData} onChange={setData} />
          )}
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => transition('save', { data })} disabled={busy}>
              Save draft
            </Button>
            <Button size="sm" variant="primary" onClick={() => transition('submit', { data })} disabled={busy}>
              Submit
            </Button>
            <Button size="sm" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {canEdit && (
            <Button size="sm" onClick={() => setEditing(true)}>
              Edit
            </Button>
          )}
          {report.status === 'rejected' && (
            <Button size="sm" onClick={() => transition('reopen')} disabled={busy}>
              Reopen as draft
            </Button>
          )}
          {isReviewer && report.status === 'submitted' && (
            <Button
              size="sm"
              onClick={() => transition('review')}
              disabled={busy}
              className="!border-purple-300 !bg-purple-600 !text-white hover:!bg-purple-700 dark:!border-purple-800"
            >
              Mark reviewed
            </Button>
          )}
          {isReviewer && report.status === 'reviewed' && (
            <Button size="sm" variant="primary" onClick={() => transition('approve')} disabled={busy}>
              Approve
            </Button>
          )}
          {isReviewer && (report.status === 'submitted' || report.status === 'reviewed') && (
            <Button
              size="sm"
              variant="danger"
              onClick={() => {
                const reason = window.prompt('Reason for rejecting this report:')
                if (reason === null) return // cancelled
                transition('reject', reason ? { comment: reason } : undefined)
              }}
              disabled={busy}
            >
              Reject
            </Button>
          )}
          {/* Export gets its own row on phones (a full-width empty item
              forces the wrap); the "|" divider only makes sense inline. */}
          {canExport && hasActions && <span aria-hidden="true" className="basis-full sm:hidden" />}
          {canExport && hasActions && (
            <span aria-hidden="true" className="mx-1 hidden self-center text-gray-300 dark:text-gray-700 sm:inline">
              |
            </span>
          )}
          {canExport &&
            (['csv', 'xlsx', 'pdf'] as const).map((format) => (
              <Button
                key={format}
                size="sm"
                onClick={() => handleExport(format)}
                disabled={exporting === format}
                className="uppercase"
              >
                {exporting === format ? '…' : format}
              </Button>
            ))}
        </div>
      )}
      {!editing && error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
    </Card>
  )
}

export function ReportsPage() {
  const { effectiveRoles } = useAuth()
  const canCreateGeneric = effectiveRoles.some((r) => r === 'team_leader' || r === 'hr' || r === 'admin')
  const [reports, setReports] = useState<WeeklyReport[] | null>(null)
  const [teams, setTeams] = useState<Team[]>([])
  const [departmentNames, setDepartmentNames] = useState<string[]>([])
  const [myTeamId, setMyTeamId] = useState<string | null>(null)
  const [department, setDepartment] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      api.get<WeeklyReport[]>('/reports'),
      api.get<{ departments: { id: string; name: string }[]; teams: Team[] }>('/directory'),
      api.get<MyEmployeeProfile>('/employees/me').catch(() => null),
    ])
      .then(([r, dir, profile]) => {
        setReports(r)
        setTeams(dir.teams)
        setDepartmentNames(dir.departments.map((d) => d.name).sort())
        setMyTeamId(profile?.teamId ?? null)
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Something went wrong'))
      .finally(() => setLoading(false))
  }, [])

  const departments = departmentNames
  const genericTeams = teams.filter(
    (t) => !isFoaDepartment(t.department) && (!department || t.department === department),
  )
  const visibleReports = reports?.filter((r) => !department || r.department === department) ?? null
  const myFoaTeam = teams.find((t) => t.id === myTeamId && isFoaDepartment(t.department))

  // Approved reports are "history"; everything still moving through the
  // draft -> submitted -> reviewed flow is split by kind (individually
  // authored FOA reports vs. generic team-wide ones).
  const activeReports = visibleReports?.filter((r) => r.status !== 'approved') ?? []
  const employeeReports = activeReports.filter((r) => r.schemaKey === 'foa')
  const teamReports = activeReports.filter((r) => r.schemaKey !== 'foa')
  const historyReports = visibleReports?.filter((r) => r.status === 'approved') ?? []

  function renderReport(r: WeeklyReport) {
    return (
      <ReportCard
        key={r.id}
        report={r}
        onUpdated={(updated) => setReports((prev) => prev?.map((x) => (x.id === updated.id ? updated : x)) ?? null)}
      />
    )
  }

  return (
    <div>
      <PageHeader title="Weekly Reports" />

      {departments.length > 1 && (
        <div className="mb-4 max-w-xs space-y-1">
          <label className="text-sm text-gray-600 dark:text-gray-400">Department</label>
          <select value={department} onChange={(e) => setDepartment(e.target.value)} className="field">
            <option value="">All departments</option>
            {departments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
      )}

      {myFoaTeam && (
        <div className="mb-4">
          <CreateFoaReportForm
            teamId={myFoaTeam.id}
            onCreated={(r) => setReports((prev) => (prev ? [r, ...prev] : [r]))}
          />
        </div>
      )}

      {canCreateGeneric && !(department && isFoaDepartment(department)) && (
        <div className="mb-4">
          <CreateReportForm
            teams={genericTeams}
            onCreated={(r) => setReports((prev) => (prev ? [r, ...prev] : [r]))}
          />
        </div>
      )}

      {loading && <LoadingState />}
      {error && <ErrorState message={error} />}
      {visibleReports && visibleReports.length === 0 && <EmptyState label="No reports yet." />}

      {visibleReports && visibleReports.length > 0 && (
        <SectionStack>
          <Section
            id="reports.employee"
            title="Employee weekly reports"
            hint={`${employeeReports.length} in progress`}
            defaultOpen={employeeReports.length > 0}
          >
            {employeeReports.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">No individual reports in progress.</p>
            ) : (
              <div className="space-y-3">{employeeReports.map(renderReport)}</div>
            )}
          </Section>

          <Section
            id="reports.team"
            title="Team reports"
            hint={`${teamReports.length} in progress`}
            defaultOpen={teamReports.length > 0}
          >
            {teamReports.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">No team reports in progress.</p>
            ) : (
              <div className="space-y-3">{teamReports.map(renderReport)}</div>
            )}
          </Section>

          <Section id="reports.history" title="Report history" hint={`${historyReports.length} approved`}>
            {historyReports.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">No approved reports yet.</p>
            ) : (
              <div className="space-y-3">{historyReports.map(renderReport)}</div>
            )}
          </Section>
        </SectionStack>
      )}
    </div>
  )
}
