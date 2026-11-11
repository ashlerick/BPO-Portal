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
import { isFoaDepartment, type FoaReportData } from './foa'
import type { MyEmployeeProfile } from '../hris/types'
import { FoaReportCard } from './FoaReportCard'
import { FoaWorkspace } from './FoaWorkspace'
import { useReportActions } from './useReportActions'

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
          teamId: teamId || teams[0]?.id,
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

// HR and Admin: create a report for ANY department. The department list comes
// from the directory, so a department added later shows up here by itself.
// The report type follows the department (FOA gets its own richer form; every
// other department gets the general weekly report).
function CreateAnyReportForm({
  departments,
  teams,
  initialDepartment,
  onCreated,
}: {
  departments: string[]
  teams: Team[]
  initialDepartment: string
  onCreated: (r: WeeklyReport) => void
}) {
  const { guardedAction } = useAuth()
  const [department, setDepartment] = useState(initialDepartment || departments[0] || '')
  const [teamId, setTeamId] = useState('')
  const foa = isFoaDepartment(department)
  const defaults = defaultFoaPeriod()
  const [periodStart, setPeriodStart] = useState('')
  const [periodEnd, setPeriodEnd] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // follow the page's department filter when it changes
  useEffect(() => {
    if (initialDepartment) setDepartment(initialDepartment)
  }, [initialDepartment])

  const deptTeams = teams.filter((t) => t.department === department)
  useEffect(() => {
    setTeamId(deptTeams.length === 1 ? deptTeams[0].id : '')
    // FOA reports default to the last Friday-to-Friday week; others start blank
    setPeriodStart(foa ? defaults.start : '')
    setPeriodEnd(foa ? defaults.end : '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [department])

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    guardedAction(['hr', 'admin'], async () => {
      setError(null)
      if (!teamId) {
        setError('Choose a team first.')
        return
      }
      setSubmitting(true)
      try {
        const created = await api.post<WeeklyReport>('/reports', {
          teamId,
          periodStart: new Date(periodStart).toISOString(),
          periodEnd: new Date(periodEnd).toISOString(),
        })
        onCreated(created)
        if (!foa) {
          setPeriodStart('')
          setPeriodEnd('')
        }
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Could not create report')
      } finally {
        setSubmitting(false)
      }
    })
  }

  return (
    <CardForm onSubmit={handleSubmit} className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-full space-y-1 md:w-auto">
          <label className="text-sm text-gray-600 dark:text-gray-400">Department</label>
          <select required value={department} onChange={(e) => setDepartment(e.target.value)} className="field">
            {departments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
        <div className="w-full space-y-1 md:w-auto">
          <label className="text-sm text-gray-600 dark:text-gray-400">Team</label>
          <select required value={teamId} onChange={(e) => setTeamId(e.target.value)} className="field" disabled={deptTeams.length === 0}>
            <option value="">{deptTeams.length === 0 ? 'No teams yet' : 'Select…'}</option>
            {deptTeams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid w-full grid-cols-2 gap-3 max-[359px]:grid-cols-1 md:contents">
          <div className="min-w-0 space-y-1">
            <label className="text-sm text-gray-600 dark:text-gray-400">{foa ? 'Week starting (Friday)' : 'Period start'}</label>
            <input type="date" required value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} className="field px-2.5 md:px-3" />
          </div>
          <div className="min-w-0 space-y-1">
            <label className="text-sm text-gray-600 dark:text-gray-400">{foa ? 'Week ending (Friday)' : 'Period end'}</label>
            <input type="date" required value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} className="field px-2.5 md:px-3" />
          </div>
        </div>
        <Button type="submit" variant="primary" disabled={submitting || !teamId} className="w-full md:w-auto">
          {submitting ? 'Creating…' : foa ? 'New FOA weekly report' : 'New report'}
        </Button>
      </div>
      {department && deptTeams.length === 0 && (
        <p className="text-sm text-amber-700 dark:text-amber-400">
          {department} has no teams yet. Add one under Employee Management → Departments & Teams, then come back.
        </p>
      )}
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </CardForm>
  )
}

function ReportCard({ report, onUpdated }: { report: WeeklyReport; onUpdated: (r: WeeklyReport) => void }) {
  const [editing, setEditing] = useState(false)
  const [data, setData] = useState<ReportData>(report.data as ReportData)
  const { busy, error, exporting, isReviewer, canEdit, canExport, transition, handleExport } = useReportActions(report, onUpdated, () => setEditing(false))
  const hasActions = canEdit || (isReviewer && (report.status === 'submitted' || report.status === 'reviewed'))

  const dateFmt = (d: string) =>
    new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="font-medium text-gray-900 dark:text-gray-100">{report.team}</span>
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
          <ReportDataFields data={data} onChange={setData} />
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
  const [showNew, setShowNew] = useState(false)
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
  // Anyone in an FOA team can write their own report. HR and Admin can create
  // one for any FOA team (to test, or on someone's behalf).
  const canCreateAnyFoa = effectiveRoles.some((r) => r === 'hr' || r === 'admin')
  const foaTeams = teams.filter((t) => isFoaDepartment(t.department))
  const foaCreateTeams = canCreateAnyFoa ? foaTeams : foaTeams.filter((t) => t.id === myTeamId)

  // Approved reports are "history"; everything still moving through the
  // draft -> submitted -> reviewed flow is split by kind (individually
  // authored FOA reports vs. generic team-wide ones).
  const activeReports = visibleReports?.filter((r) => r.status !== 'approved') ?? []
  const foaReports = visibleReports?.filter((r) => r.schemaKey === 'foa') ?? []
  const teamReports = activeReports.filter((r) => r.schemaKey !== 'foa')
  // FOA reports, approved ones included, live in the workspace; the history below keeps the rest.
  const historyReports = visibleReports?.filter((r) => r.status === 'approved' && r.schemaKey !== 'foa') ?? []
  const isReviewerRole = effectiveRoles.some((r) => r === 'manager' || r === 'hr' || r === 'admin')
  const showWorkspace = foaCreateTeams.length > 0 || foaReports.length > 0
  // Starting a report for a team that is not yours (HR and Admin, or a team leader's general report) is tucked behind one button; an FOA
  // author's own weekly report starts from the week strip.
  const hasNewForm = canCreateAnyFoa ? departments.length > 0 : canCreateGeneric && !(department && isFoaDepartment(department))

  function renderReport(r: WeeklyReport, previous?: FoaReportData) {
    const onUpdated = (updated: WeeklyReport) => setReports((prev) => prev?.map((x) => (x.id === updated.id ? updated : x)) ?? null)
    return r.schemaKey === 'foa' ? (
      <FoaReportCard key={r.id} report={r} previous={previous} onUpdated={onUpdated} />
    ) : (
      <ReportCard key={r.id} report={r} onUpdated={onUpdated} />
    )
  }

  // The workspace starts a week's report: the person's own team, the week's two Fridays, and last week's sheet when they ask for it.
  async function createFoaReport(teamId: string, start: string, end: string, data: FoaReportData | undefined) {
    const created = await api.post<WeeklyReport>('/reports', {
      teamId,
      periodStart: new Date(start).toISOString(),
      periodEnd: new Date(end).toISOString(),
      ...(data && Object.keys(data).length ? { data } : {}),
    })
    setReports((prev) => (prev ? [created, ...prev] : [created]))
  }

  return (
    <div>
      <PageHeader title="Weekly Reports" />

      {(departments.length > 1 || hasNewForm) && (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          {departments.length > 1 && (
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
              Department
              <select value={department} onChange={(e) => setDepartment(e.target.value)} className="field !w-auto">
                <option value="">All departments</option>
                {departments.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
          )}
          <span className="flex-1" />
          {hasNewForm && (
            <button
              type="button"
              onClick={() => setShowNew((v) => !v)}
              aria-expanded={showNew}
              className="rounded-lg border border-gray-400 px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-100 dark:border-white/30 dark:text-gray-100 dark:hover:bg-white/10"
            >
              {showNew ? 'Close' : '+ Report for another team'}
            </button>
          )}
        </div>
      )}

      {showNew && hasNewForm && (
        <div className="mb-4">
          {canCreateAnyFoa ? (
            <CreateAnyReportForm
              departments={departments}
              teams={teams}
              initialDepartment={department}
              onCreated={(r) => {
                setReports((prev) => (prev ? [r, ...prev] : [r]))
                setShowNew(false)
              }}
            />
          ) : (
            <CreateReportForm
              teams={genericTeams}
              onCreated={(r) => {
                setReports((prev) => (prev ? [r, ...prev] : [r]))
                setShowNew(false)
              }}
            />
          )}
        </div>
      )}

      {loading && <LoadingState />}
      {error && <ErrorState message={error} />}
      {visibleReports && visibleReports.length === 0 && !showWorkspace && <EmptyState label="No reports yet." />}

      {visibleReports && showWorkspace && (
        <div className="mb-6">
          <FoaWorkspace
            reports={foaReports}
            createTeams={foaCreateTeams}
            startOnSummary={isReviewerRole}
            renderReport={renderReport}
            create={createFoaReport}
          />
        </div>
      )}

      {visibleReports && visibleReports.length > 0 && (
        <SectionStack>
          <Section
            id="reports.team"
            title="Team reports"
            hint={`${teamReports.length} in progress`}
            defaultOpen={teamReports.length > 0}
          >
            {teamReports.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">No team reports in progress.</p>
            ) : (
              <div className="space-y-3">{teamReports.map((r) => renderReport(r))}</div>
            )}
          </Section>

          <Section id="reports.history" title="Report history" hint={`${historyReports.length} approved`}>
            {historyReports.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">No approved reports yet.</p>
            ) : (
              <div className="space-y-3">{historyReports.map((r) => renderReport(r))}</div>
            )}
          </Section>
        </SectionStack>
      )}
    </div>
  )
}
