import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../../auth/AuthContext'
import { EmptyState, ErrorState, LoadingState } from '../../components/AsyncState'
import { api, ApiError } from '../../services/api'
import { formatDateOnly, todayInManilaIso } from '../../utils/dates'
import { Card, CardForm } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { PageHeader } from '../../components/ui/PageHeader'
import { Section, SectionStack } from '../../components/ui/Section'
import { MonthCalendar, eachDay, type CalendarEvent } from '../../components/ui/MonthCalendar'
import type { MyEmployeeProfile } from '../hris/types'
import type { LeaveRequest, LeaveRequestStatus } from './types'

const statusTones: Record<LeaveRequestStatus, 'amber' | 'green' | 'red'> = {
  pending: 'amber',
  approved: 'green',
  rejected: 'red',
}

const dateFmt = formatDateOnly

function CreateForm({ onCreated }: { onCreated: (r: LeaveRequest) => void }) {
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [reason, setReason] = useState('')
  const [useSil, setUseSil] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (new Date(endDate) < new Date(startDate)) {
      setError('End date cannot be before start date')
      return
    }
    setSubmitting(true)
    try {
      const created = await api.post<LeaveRequest>('/leave/requests', {
        startDate: new Date(startDate).toISOString(),
        endDate: new Date(endDate).toISOString(),
        reason: reason || undefined,
        useSil,
      })
      onCreated(created)
      setStartDate('')
      setEndDate('')
      setReason('')
      setUseSil(false)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not submit leave request')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <CardForm onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3 max-[359px]:grid-cols-1">
        <div className="min-w-0 space-y-1">
          <label className="text-sm text-gray-600 dark:text-gray-400">Start date</label>
          <input type="date" required value={startDate} onChange={(e) => setStartDate(e.target.value)} className="field px-2.5 md:px-3" />
        </div>
        <div className="min-w-0 space-y-1">
          <label className="text-sm text-gray-600 dark:text-gray-400">End date</label>
          <input type="date" required value={endDate} onChange={(e) => setEndDate(e.target.value)} className="field px-2.5 md:px-3" />
        </div>
      </div>
      <div className="space-y-1">
        <label className="text-sm text-gray-600 dark:text-gray-400">Reason (optional)</label>
        <input value={reason} onChange={(e) => setReason(e.target.value)} className="field" />
      </div>
      <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
        <input type="checkbox" checked={useSil} onChange={(e) => setUseSil(e.target.checked)} />
        Use my SIL balance for this leave (deducted only if HR approves)
      </label>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <Button type="submit" variant="primary" size="sm" disabled={submitting}>
        {submitting ? 'Submitting…' : 'Request leave'}
      </Button>
    </CardForm>
  )
}

function ReviewRow({ request, onReviewed }: { request: LeaveRequest; onReviewed: (r: LeaveRequest) => void }) {
  const { guardedAction } = useAuth()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function review(action: 'approve' | 'reject') {
    guardedAction(['hr', 'admin'], async () => {
      setBusy(true)
      setError(null)
      try {
        const comment = action === 'reject' ? (window.prompt('Reason for rejecting (optional):') ?? undefined) : undefined
        const updated = await api.put<LeaveRequest>(`/leave/requests/${request.id}`, { action, comment })
        onReviewed(updated)
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Could not update request')
      } finally {
        setBusy(false)
      }
    })
  }

  return (
    <li>
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <span className="font-medium text-gray-900 dark:text-gray-100">{request.employeeName}</span>
            <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">
              {dateFmt(request.startDate)} – {dateFmt(request.endDate)} ({request.days} day
              {request.days === 1 ? '' : 's'})
            </span>
          </div>
          <Badge tone={statusTones[request.status]}>{request.status}</Badge>
        </div>
        {request.reason && <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{request.reason}</p>}
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-500">
          {request.useSil ? 'Will use SIL balance if approved' : 'Not using SIL balance (unpaid/other)'}
        </p>
        {request.reviewComment && (
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            <span className="font-medium">Comment:</span> {request.reviewComment}
          </p>
        )}
        {error && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{error}</p>}
        {request.status === 'pending' && (
          <div className="mt-3 flex gap-2">
            <Button size="sm" variant="primary" onClick={() => review('approve')} disabled={busy}>
              Approve
            </Button>
            <Button size="sm" variant="danger" onClick={() => review('reject')} disabled={busy}>
              Reject
            </Button>
          </div>
        )}
      </Card>
    </li>
  )
}

export function LeaveRequestsPage() {
  const { effectiveRoles } = useAuth()
  const isReviewer = effectiveRoles.some((r) => r === 'hr' || r === 'admin')
  const [requests, setRequests] = useState<LeaveRequest[] | null>(null)
  const [profile, setProfile] = useState<MyEmployeeProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      api.get<LeaveRequest[]>('/leave/requests'),
      api.get<MyEmployeeProfile>('/employees/me').catch(() => null),
    ])
      .then(([r, p]) => {
        setRequests(r)
        setProfile(p)
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Something went wrong'))
      .finally(() => setLoading(false))
  }, [])

  function replaceRequest(updated: LeaveRequest) {
    setRequests((prev) => prev?.map((x) => (x.id === updated.id ? updated : x)) ?? null)
  }

  const pending = requests?.filter((r) => r.status === 'pending') ?? []
  const calendarEvents: CalendarEvent[] = (requests ?? [])
    .filter((r) => r.status === 'approved')
    .flatMap((r) =>
      eachDay(r.startDate, r.endDate).map((date) => ({
        id: `${r.id}-${date}`,
        date,
        label: isReviewer ? r.employeeName : 'Leave',
        tone: 'brand' as const,
      })),
    )

  return (
    <div>
      <PageHeader title="Leave Requests" />

      {loading && <LoadingState />}
      {error && <ErrorState message={error} />}

      {!loading && !error && (
        <SectionStack>
          <Section id="leave.file" title="File leave" hint="Request time off" defaultOpen>
            <CreateForm onCreated={(r) => setRequests((prev) => (prev ? [r, ...prev] : [r]))} />
          </Section>

          <Section id="leave.balance" title="Leave balance" hint="Service Incentive Leave (SIL)">
            {profile ? (
              <p className="text-sm text-gray-700 dark:text-gray-300">
                You have{' '}
                <span className="text-lg font-semibold text-gray-900 dark:text-gray-100">{profile.silBalance}</span>{' '}
                SIL day{profile.silBalance === 1 ? '' : 's'} remaining.
              </p>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400">No employee record is linked to your account.</p>
            )}
          </Section>

          <Section
            id="leave.approval"
            title="Approval / rejection"
            hint="Requests waiting on HR"
            roles={['hr', 'admin']}
            aside={pending.length > 0 ? <Badge tone="amber">{pending.length} pending</Badge> : undefined}
            defaultOpen
          >
            {pending.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">Nothing waiting for review.</p>
            ) : (
              <ul className="space-y-3">
                {pending.map((r) => (
                  <ReviewRow key={r.id} request={r} onReviewed={replaceRequest} />
                ))}
              </ul>
            )}
          </Section>

          <Section
            id="leave.history"
            title="Leave history"
            hint={isReviewer ? 'All requests' : 'Your requests'}
            defaultOpen
          >
            {requests && requests.length === 0 ? (
              <EmptyState label="No leave requests yet." />
            ) : (
              <ul className="space-y-3">
                {requests?.map((r) => (
                  <ReviewRow key={r.id} request={r} onReviewed={replaceRequest} />
                ))}
              </ul>
            )}
          </Section>

          <Section id="leave.calendar" title="Leave calendar" hint="Approved leave by day">
            <MonthCalendar events={calendarEvents} todayIso={todayInManilaIso()} />
          </Section>

          <Section id="leave.types" title="Leave types">
            <ul className="space-y-3 text-sm text-gray-700 dark:text-gray-300">
              <li>
                <span className="font-medium text-gray-900 dark:text-gray-100">Service Incentive Leave (SIL)</span> —
                paid leave drawn from your SIL balance. It is only deducted once HR approves the request.
              </li>
              <li>
                <span className="font-medium text-gray-900 dark:text-gray-100">Other / unpaid leave</span> — leave
                filed without using your SIL balance. It still needs HR approval.
              </li>
            </ul>
          </Section>
        </SectionStack>
      )}
    </div>
  )
}
