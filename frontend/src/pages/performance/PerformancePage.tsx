import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../../auth/AuthContext'
import { EmptyState, ErrorState, LoadingState } from '../../components/AsyncState'
import { EmployeeSelect } from '../../components/EmployeeSelect'
import { api, ApiError } from '../../services/api'
import { Card, CardForm } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { Field, FormError } from '../../components/ui/Field'
import { PageHeader } from '../../components/ui/PageHeader'
import { Section, SectionStack } from '../../components/ui/Section'
import { formatDateOnly } from '../../utils/dates'
import { humanize } from '../../utils/text'
import type { MyEmployeeProfile } from '../hris/types'

type ReviewStatus = 'self_assessment' | 'supervisor_evaluation' | 'hr_review' | 'completed'

interface Review {
  id: string
  employeeId: string
  employeeName: string
  period: string
  status: ReviewStatus
  selfAssessment: string | null
  supervisorEvaluation: string | null
  supervisorRating: number | null
  hrReview: string | null
  finalRating: number | null
}

interface Note {
  id: string
  employeeId: string
  employeeName: string
  kind: 'coaching' | 'improvement_plan'
  title: string
  details: string | null
  status: 'active' | 'completed'
  dueDate: string | null
}

const STEP_LABEL: Record<ReviewStatus, string> = {
  self_assessment: 'Self assessment',
  supervisor_evaluation: 'Supervisor evaluation',
  hr_review: 'HR review',
  completed: 'Completed',
}

function RatingSelect({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <Field label="Rating (1-5)">
      <select value={value} onChange={(e) => onChange(Number(e.target.value))} className="field">
        {[1, 2, 3, 4, 5].map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
    </Field>
  )
}

function ReviewCard({ review, myEmployeeId, isHr, onUpdated }: { review: Review; myEmployeeId: string | null; isHr: boolean; onUpdated: (r: Review) => void }) {
  const [text, setText] = useState('')
  const [rating, setRating] = useState(3)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mine = review.employeeId === myEmployeeId

  async function act(body: Record<string, unknown>) {
    setBusy(true)
    setError(null)
    try {
      onUpdated(await api.put<Review>(`/hr/performance?kind=reviews&sub=${review.id}`, body))
      setText('')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save')
    } finally {
      setBusy(false)
    }
  }

  const canSelf = review.status === 'self_assessment' && mine
  const canSupervisor = review.status === 'supervisor_evaluation' && (isHr || !mine)
  const canHr = review.status === 'hr_review' && isHr

  return (
    <li>
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-medium text-gray-900 dark:text-gray-100">{review.employeeName}</div>
            <div className="text-sm text-gray-500 dark:text-gray-400">{review.period}</div>
          </div>
          <Badge tone={review.status === 'completed' ? 'green' : 'amber'}>{STEP_LABEL[review.status]}</Badge>
        </div>

        <dl className="mt-3 space-y-2 text-sm">
          {review.selfAssessment && (
            <div>
              <dt className="text-xs text-gray-500 dark:text-gray-400">Self assessment</dt>
              <dd className="whitespace-pre-line text-gray-800 dark:text-gray-200">{review.selfAssessment}</dd>
            </div>
          )}
          {review.supervisorEvaluation && (
            <div>
              <dt className="text-xs text-gray-500 dark:text-gray-400">Supervisor evaluation (rating {review.supervisorRating})</dt>
              <dd className="whitespace-pre-line text-gray-800 dark:text-gray-200">{review.supervisorEvaluation}</dd>
            </div>
          )}
          {review.hrReview && (
            <div>
              <dt className="text-xs text-gray-500 dark:text-gray-400">HR review (final rating {review.finalRating})</dt>
              <dd className="whitespace-pre-line text-gray-800 dark:text-gray-200">{review.hrReview}</dd>
            </div>
          )}
        </dl>

        {(canSelf || canSupervisor || canHr) && (
          <div className="mt-3 space-y-2">
            <Field label={canSelf ? 'Your self assessment' : canSupervisor ? 'Your evaluation' : 'HR review'}>
              <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} className="field" />
            </Field>
            {(canSupervisor || canHr) && <RatingSelect value={rating} onChange={setRating} />}
            <FormError message={error} />
            <Button
              size="sm"
              variant="primary"
              disabled={busy || !text.trim()}
              onClick={() =>
                act(
                  canSelf
                    ? { action: 'submit_self', selfAssessment: text }
                    : canSupervisor
                      ? { action: 'submit_supervisor', supervisorEvaluation: text, supervisorRating: rating }
                      : { action: 'complete', hrReview: text, finalRating: rating },
                )
              }
            >
              {canSelf ? 'Submit self assessment' : canSupervisor ? 'Submit evaluation' : 'Complete review'}
            </Button>
          </div>
        )}
      </Card>
    </li>
  )
}

function StartReviewForm({ onCreated }: { onCreated: (r: Review) => void }) {
  const [employeeId, setEmployeeId] = useState('')
  const [period, setPeriod] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      onCreated(await api.post<Review>('/hr/performance?kind=reviews', { employeeId, period }))
      setPeriod('')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not start the review')
    } finally {
      setBusy(false)
    }
  }

  return (
    <CardForm onSubmit={submit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <EmployeeSelect value={employeeId} onChange={setEmployeeId} />
        <Field label="Review period (e.g. 2026 H1)">
          <input required value={period} onChange={(e) => setPeriod(e.target.value)} className="field" />
        </Field>
      </div>
      <FormError message={error} />
      <Button type="submit" variant="primary" size="sm" disabled={busy}>
        {busy ? 'Starting…' : 'Start review'}
      </Button>
    </CardForm>
  )
}

function NoteForm({ kind, canPickAnyone, onCreated }: { kind: Note['kind']; canPickAnyone: boolean; onCreated: (n: Note) => void }) {
  const [employeeId, setEmployeeId] = useState('')
  const [supervisees, setSupervisees] = useState<{ id: string; name: string }[]>([])

  // Non-HR supervisors can only write notes for their own direct reports.
  useEffect(() => {
    if (canPickAnyone) return
    api.get<{ id: string; name: string }[]>('/hr/performance?kind=supervisees').then(setSupervisees).catch(() => undefined)
  }, [canPickAnyone])
  const [title, setTitle] = useState('')
  const [details, setDetails] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      onCreated(await api.post<Note>('/hr/performance?kind=notes', { employeeId, kind, title, details: details || null, dueDate: dueDate || null }))
      setTitle('')
      setDetails('')
      setDueDate('')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save')
    } finally {
      setBusy(false)
    }
  }

  return (
    <CardForm onSubmit={submit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {canPickAnyone ? (
          <EmployeeSelect value={employeeId} onChange={setEmployeeId} />
        ) : (
          <Field label="Team member">
            <select required value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className="field">
              <option value="">Select…</option>
              {supervisees.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Title">
          <input required value={title} onChange={(e) => setTitle(e.target.value)} className="field" />
        </Field>
        <Field label="Due date (optional)">
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="field" />
        </Field>
      </div>
      <Field label="Details">
        <textarea rows={2} value={details} onChange={(e) => setDetails(e.target.value)} className="field" />
      </Field>
      <FormError message={error} />
      <Button type="submit" variant="primary" size="sm" disabled={busy}>
        {busy ? 'Saving…' : kind === 'coaching' ? 'Add coaching note' : 'Add improvement plan'}
      </Button>
    </CardForm>
  )
}

function NoteList({ notes, canManage, onUpdated }: { notes: Note[]; canManage: boolean; onUpdated: (n: Note) => void }) {
  if (notes.length === 0) return <EmptyState label="Nothing here yet." />
  return (
    <ul className="space-y-2">
      {notes.map((n) => (
        <li key={n.id}>
          <Card className="!py-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-medium text-gray-900 dark:text-gray-100">{n.title}</div>
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  {n.employeeName}
                  {n.dueDate && ` · due ${formatDateOnly(n.dueDate)}`}
                </div>
              </div>
              <Badge tone={n.status === 'completed' ? 'green' : 'amber'}>{humanize(n.status)}</Badge>
            </div>
            {n.details && <p className="mt-1 whitespace-pre-line text-sm text-gray-600 dark:text-gray-400">{n.details}</p>}
            {canManage && (
              <Button
                size="sm"
                className="mt-2"
                onClick={async () => onUpdated(await api.put<Note>(`/hr/performance?kind=notes&sub=${n.id}`, { status: n.status === 'active' ? 'completed' : 'active' }))}
              >
                {n.status === 'active' ? 'Mark completed' : 'Reopen'}
              </Button>
            )}
          </Card>
        </li>
      ))}
    </ul>
  )
}

export function PerformancePage() {
  const { effectiveRoles } = useAuth()
  const isHr = effectiveRoles.some((r) => r === 'hr' || r === 'admin')
  const [reviews, setReviews] = useState<Review[] | null>(null)
  const [notes, setNotes] = useState<Note[] | null>(null)
  const [me, setMe] = useState<MyEmployeeProfile | null>(null)
  const [superviseeCount, setSuperviseeCount] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      api.get<Review[]>('/hr/performance?kind=reviews'),
      api.get<Note[]>('/hr/performance?kind=notes'),
      api.get<MyEmployeeProfile>('/employees/me').catch(() => null),
      api.get<unknown[]>('/hr/performance?kind=supervisees').catch(() => []),
    ])
      .then(([r, n, p, reports]) => {
        setReviews(r)
        setNotes(n)
        setMe(p)
        setSuperviseeCount(reports.length)
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Something went wrong'))
  }, [])

  if (error) return <ErrorState message={error} />
  if (!reviews || !notes) return <LoadingState />

  const replaceReview = (r: Review) => setReviews((prev) => prev?.map((x) => (x.id === r.id ? r : x)) ?? null)
  const replaceNote = (n: Note) => setNotes((prev) => prev?.map((x) => (x.id === n.id ? n : x)) ?? null)
  const myEmployeeId = me?.id ?? null
  const mine = reviews.filter((r) => r.employeeId === myEmployeeId)
  const team = reviews.filter((r) => r.employeeId !== myEmployeeId)
  const awaitingHr = reviews.filter((r) => r.status === 'hr_review')

  const renderReviews = (list: Review[]) =>
    list.length === 0 ? (
      <EmptyState label="No reviews." />
    ) : (
      <ul className="space-y-3">
        {list.map((r) => (
          <ReviewCard key={r.id} review={r} myEmployeeId={myEmployeeId} isHr={isHr} onUpdated={replaceReview} />
        ))}
      </ul>
    )

  const isSupervisor = !isHr && superviseeCount > 0

  return (
    <div>
      <PageHeader title="Performance Management" description="Evaluations, coaching and improvement plans." />
      <SectionStack>
        <Section id="perf.start" title="Start a performance evaluation" roles={['hr', 'admin']}>
          <StartReviewForm onCreated={(r) => setReviews((prev) => (prev ? [r, ...prev] : [r]))} />
        </Section>

        <Section id="perf.mine" title="My evaluations" hint="Self assessment and results" defaultOpen>
          {renderReviews(mine)}
        </Section>

        {(isSupervisor || isHr) && (
          <Section id="perf.team" title={isHr ? 'Employee evaluations' : 'Supervisor evaluation: my team'} hint={`${team.length} evaluation${team.length === 1 ? '' : 's'}`} defaultOpen>
            {renderReviews(team)}
          </Section>
        )}

        <Section id="perf.hr" title="HR review" hint={`${awaitingHr.length} waiting`} roles={['hr', 'admin']} aside={awaitingHr.length > 0 ? <Badge tone="amber">{awaitingHr.length}</Badge> : undefined}>
          {renderReviews(awaitingHr)}
        </Section>

        <Section id="perf.history" title="Performance history" hint="Completed evaluations">
          {renderReviews(reviews.filter((r) => r.status === 'completed'))}
        </Section>

        <Section id="perf.coaching" title="Coaching" hint={`${notes.filter((n) => n.kind === 'coaching').length}`}>
          <div className="space-y-3">
            {(isHr || isSupervisor) && <NoteForm kind="coaching" canPickAnyone={isHr} onCreated={(n) => setNotes((prev) => (prev ? [n, ...prev] : [n]))} />}
            <NoteList notes={notes.filter((n) => n.kind === 'coaching')} canManage={isHr || isSupervisor} onUpdated={replaceNote} />
          </div>
        </Section>

        <Section id="perf.plans" title="Improvement plans" hint={`${notes.filter((n) => n.kind === 'improvement_plan').length}`}>
          <div className="space-y-3">
            {(isHr || isSupervisor) && <NoteForm kind="improvement_plan" canPickAnyone={isHr} onCreated={(n) => setNotes((prev) => (prev ? [n, ...prev] : [n]))} />}
            <NoteList notes={notes.filter((n) => n.kind === 'improvement_plan')} canManage={isHr || isSupervisor} onUpdated={replaceNote} />
          </div>
        </Section>
      </SectionStack>
    </div>
  )
}
