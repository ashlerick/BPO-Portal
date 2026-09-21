import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../../auth/AuthContext'
import { EmptyState, ErrorState, LoadingState } from '../../components/AsyncState'
import { api, ApiError } from '../../services/api'
import { Card, CardForm } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { PageHeader } from '../../components/ui/PageHeader'
import { humanize } from '../../utils/text'
import type { ReportData, ReportStatus, WeeklyReport } from './types'

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

function ReportCard({ report, onUpdated }: { report: WeeklyReport; onUpdated: (r: WeeklyReport) => void }) {
  const { effectiveRoles, guardedAction } = useAuth()
  const [editing, setEditing] = useState(false)
  const [data, setData] = useState<ReportData>(report.data)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [exporting, setExporting] = useState<string | null>(null)

  const isReviewer = effectiveRoles.some((r) => r === 'manager' || r === 'hr' || r === 'admin')
  const canEdit = report.status === 'draft' || report.status === 'rejected'

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
          <span className="mx-1 self-center text-gray-300 dark:text-gray-700">|</span>
          {(['csv', 'xlsx', 'pdf'] as const).map((format) => (
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
  const canCreate = effectiveRoles.some((r) => r === 'team_leader' || r === 'hr' || r === 'admin')
  const [reports, setReports] = useState<WeeklyReport[] | null>(null)
  const [teams, setTeams] = useState<Team[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([api.get<WeeklyReport[]>('/reports'), api.get<{ teams: Team[] }>('/directory')])
      .then(([r, dir]) => {
        setReports(r)
        setTeams(dir.teams)
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Something went wrong'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div>
      <PageHeader title="Weekly Reports" />

      {canCreate && (
        <div className="mb-4">
          <CreateReportForm teams={teams} onCreated={(r) => setReports((prev) => (prev ? [r, ...prev] : [r]))} />
        </div>
      )}

      {loading && <LoadingState />}
      {error && <ErrorState message={error} />}
      {reports && reports.length === 0 && <EmptyState label="No reports yet." />}

      {reports && reports.length > 0 && (
        <div className="mt-4 space-y-3">
          {reports.map((r) => (
            <ReportCard
              key={r.id}
              report={r}
              onUpdated={(updated) =>
                setReports((prev) => prev?.map((x) => (x.id === updated.id ? updated : x)) ?? null)
              }
            />
          ))}
        </div>
      )}
    </div>
  )
}
