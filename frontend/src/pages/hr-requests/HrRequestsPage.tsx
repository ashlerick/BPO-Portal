import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../../auth/AuthContext'
import { EmptyState, ErrorState, LoadingState } from '../../components/AsyncState'
import { api, ApiError } from '../../services/api'
import { Card, CardForm } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { Field, FormError } from '../../components/ui/Field'
import { PageHeader } from '../../components/ui/PageHeader'
import { Section, SectionStack } from '../../components/ui/Section'
import { formatDateOnly } from '../../utils/dates'
import { HR_REQUEST_STATUSES, HR_REQUEST_TYPES, type HrRequest, type HrRequestStatus } from '../hr/types'

const tones: Record<HrRequestStatus, 'amber' | 'blue' | 'green' | 'gray'> = {
  pending: 'amber',
  processing: 'blue',
  completed: 'green',
  closed: 'gray',
}

const typeLabel = (key: string) => HR_REQUEST_TYPES.find((t) => t.key === key)?.label ?? key

function NewRequestForm({ onCreated }: { onCreated: (r: HrRequest) => void }) {
  const [type, setType] = useState<string>(HR_REQUEST_TYPES[0].key)
  const [subject, setSubject] = useState('')
  const [details, setDetails] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      onCreated(await api.post<HrRequest>('/hr/hr-requests', { type, subject, details: details || undefined }))
      setSubject('')
      setDetails('')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not submit your request')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <CardForm onSubmit={submit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="What do you need?">
          <select value={type} onChange={(e) => setType(e.target.value)} className="field">
            {HR_REQUEST_TYPES.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Subject">
          <input required value={subject} onChange={(e) => setSubject(e.target.value)} className="field" />
        </Field>
      </div>
      <Field label="Details (optional)">
        <textarea rows={3} value={details} onChange={(e) => setDetails(e.target.value)} className="field" />
      </Field>
      <FormError message={error} />
      <Button type="submit" variant="primary" size="sm" disabled={submitting}>
        {submitting ? 'Submitting…' : 'Submit request'}
      </Button>
    </CardForm>
  )
}

function RequestCard({
  request,
  canManage,
  onUpdated,
}: {
  request: HrRequest
  canManage: boolean
  onUpdated: (r: HrRequest) => void
}) {
  const [resolution, setResolution] = useState(request.resolution ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const next = HR_REQUEST_STATUSES[HR_REQUEST_STATUSES.indexOf(request.status) + 1]

  async function update(body: { status?: HrRequestStatus; resolution?: string }) {
    setBusy(true)
    setError(null)
    try {
      onUpdated(await api.put<HrRequest>(`/hr/hr-requests/${request.id}`, body))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update the request')
    } finally {
      setBusy(false)
    }
  }

  return (
    <li>
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-medium text-gray-900 dark:text-gray-100">{request.subject}</div>
            <div className="text-sm text-gray-500 dark:text-gray-400">
              {typeLabel(request.type)}
              {canManage && ` · ${request.employeeName}`} · {formatDateOnly(request.createdAt)}
            </div>
          </div>
          <Badge tone={tones[request.status]}>{request.status}</Badge>
        </div>
        {request.details && <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">{request.details}</p>}
        {!canManage && request.resolution && (
          <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">
            <span className="font-medium">HR response:</span> {request.resolution}
          </p>
        )}
        {canManage && (
          <div className="mt-3 space-y-2">
            <Field label="Response to the employee">
              <input value={resolution} onChange={(e) => setResolution(e.target.value)} className="field" />
            </Field>
            <FormError message={error} />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={busy} onClick={() => update({ resolution })}>
                Save response
              </Button>
              {next && (
                <Button size="sm" variant="primary" disabled={busy} onClick={() => update({ status: next, resolution })}>
                  Mark {next}
                </Button>
              )}
            </div>
          </div>
        )}
      </Card>
    </li>
  )
}

export function HrRequestsPage() {
  const { effectiveRoles } = useAuth()
  const isHr = effectiveRoles.some((r) => r === 'hr' || r === 'admin')
  const [requests, setRequests] = useState<HrRequest[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .get<HrRequest[]>('/hr/hr-requests')
      .then(setRequests)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Something went wrong'))
  }, [])

  const replace = (r: HrRequest) => setRequests((prev) => prev?.map((x) => (x.id === r.id ? r : x)) ?? null)

  return (
    <div>
      <PageHeader
        title="HR Requests"
        description={isHr ? 'Requests from employees. Move each one along as you work on it.' : 'Ask HR for a certificate, a document, or help with a concern.'}
      />

      {error && <ErrorState message={error} />}
      {!requests && !error && <LoadingState />}

      {requests && (
        <SectionStack>
          <Section id="hrreq.new" title="Submit a request" hint="Certificates, documents, concerns" defaultOpen={!isHr}>
            <NewRequestForm onCreated={(r) => setRequests((prev) => (prev ? [r, ...prev] : [r]))} />
          </Section>

          {HR_REQUEST_STATUSES.map((status) => {
            const list = requests.filter((r) => r.status === status)
            return (
              <Section
                key={status}
                id={`hrreq.${status}`}
                title={status.charAt(0).toUpperCase() + status.slice(1)}
                hint={`${list.length} request${list.length === 1 ? '' : 's'}`}
                defaultOpen={status === 'pending' || status === 'processing'}
                aside={list.length > 0 ? <Badge tone={tones[status]}>{list.length}</Badge> : undefined}
              >
                {list.length === 0 ? (
                  <EmptyState label={`Nothing ${status}.`} />
                ) : (
                  <ul className="space-y-3">
                    {list.map((r) => (
                      <RequestCard key={r.id} request={r} canManage={isHr} onUpdated={replace} />
                    ))}
                  </ul>
                )}
              </Section>
            )
          })}
        </SectionStack>
      )}
    </div>
  )
}
