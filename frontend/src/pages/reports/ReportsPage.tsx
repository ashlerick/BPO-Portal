import { useEffect, useState } from 'react'
import { useAuth } from '../../auth/AuthContext'
import { EmptyState, ErrorState, LoadingState } from '../../components/AsyncState'
import { api, ApiError } from '../../services/api'
import { Card } from '../../components/ui/Card'
import { Section, SectionStack } from '../../components/ui/Section'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { PageHeader } from '../../components/ui/PageHeader'
import { humanize } from '../../utils/text'
import type { ReportData, ReportStatus, WeeklyReport } from './types'
import { isFoaDepartment, type FoaReportData } from './foa'
import type { MyEmployeeProfile } from '../hris/types'
import { FoaReportCard } from './FoaReportCard'
import { AccountingReportCard } from './AccountingReportCard'
import { isAccountingDepartment } from './accounting'
import { FoaWorkspace } from './FoaWorkspace'
import { ReportEditor } from './ReportEditor'
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
  const [editor, setEditor] = useState<{ resume?: WeeklyReport } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // A load that was replaced (React runs effects twice in development) must not report its result: a failure from the first run
    // would otherwise leave an error banner on top of the second run's good data.
    let cancelled = false
    Promise.all([
      api.get<WeeklyReport[]>('/reports'),
      api.get<{ departments: { id: string; name: string }[]; teams: Team[] }>('/directory'),
      api.get<MyEmployeeProfile>('/employees/me').catch(() => null),
    ])
      .then(([r, dir, profile]) => {
        if (cancelled) return
        setError(null)
        setReports(r)
        setTeams(dir.teams)
        setDepartmentNames(dir.departments.map((d) => d.name).sort())
        setMyTeamId(profile?.teamId ?? null)
      })
      .catch((err) => !cancelled && setError(err instanceof ApiError ? err.message : 'Something went wrong'))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [])

  const departments = departmentNames
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
  // Anyone who can file a report (an FOA or Accounting author, a team leader, HR or Admin) gets the button that opens the editor.
  const isAuthorOfOwnTeam = teams.some((t) => t.id === myTeamId && (isFoaDepartment(t.department) || isAccountingDepartment(t.department)))
  const canStartReport = !loading && (canCreateAnyFoa || canCreateGeneric || isAuthorOfOwnTeam)

  const upsertReport = (r: WeeklyReport) =>
    setReports((prev) => (prev ? (prev.some((x) => x.id === r.id) ? prev.map((x) => (x.id === r.id ? r : x)) : [r, ...prev]) : [r]))

  function renderReport(r: WeeklyReport) {
    const onUpdated = (updated: WeeklyReport) => setReports((prev) => prev?.map((x) => (x.id === updated.id ? updated : x)) ?? null)
    const onEdit = (rep: WeeklyReport) => setEditor({ resume: rep })
    if (r.schemaKey === 'foa') return <FoaReportCard key={r.id} report={r} onUpdated={onUpdated} onEdit={onEdit} />
    if (r.schemaKey === 'accounting') return <AccountingReportCard key={r.id} report={r} onUpdated={onUpdated} onEdit={onEdit} />
    return <ReportCard key={r.id} report={r} onUpdated={onUpdated} />
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
      {!editor && <PageHeader title="Weekly Reports" />}

      {!editor && (departments.length > 1 || canStartReport) && (
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
          {canStartReport && (
            <button
              type="button"
              onClick={() => setEditor({})}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 dark:bg-brand-500 dark:hover:bg-brand-400"
            >
              + New weekly report
            </button>
          )}
        </div>
      )}

      {editor && (
        <ReportEditor
          teams={teams}
          reports={reports ?? []}
          myTeamId={myTeamId}
          resume={editor.resume}
          onSaved={upsertReport}
          onClose={() => setEditor(null)}
        />
      )}

      {/* These belong to the list; with the editor open they would only sit under it. */}
      {!editor && loading && <LoadingState />}
      {!editor && error && <ErrorState message={error} />}
      {!editor && visibleReports && visibleReports.length === 0 && !showWorkspace && <EmptyState label="No reports yet." />}

      {!editor && visibleReports && showWorkspace && (
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

      {!editor && visibleReports && visibleReports.length > 0 && (
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
