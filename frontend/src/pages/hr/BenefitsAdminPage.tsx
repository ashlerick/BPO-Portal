import { useEffect, useState, type FormEvent } from 'react'
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
import type { Benefit } from '../benefits/types'
import type { Dependent, Enrollment } from './types'

const STATUS_TONE: Record<Enrollment['status'], 'amber' | 'green' | 'gray' | 'red'> = {
  pending: 'amber',
  enrolled: 'green',
  waived: 'gray',
  terminated: 'red',
}

function EnrollForm({ benefits, onSaved }: { benefits: Benefit[]; onSaved: (e: Enrollment) => void }) {
  const [employeeId, setEmployeeId] = useState('')
  const [benefitId, setBenefitId] = useState('')
  const [status, setStatus] = useState<Enrollment['status']>('enrolled')
  const [effectiveDate, setEffectiveDate] = useState('')
  const [dependents, setDependents] = useState<Dependent[]>([])
  const [dependentIds, setDependentIds] = useState<string[]>([])
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setDependentIds([])
    if (!employeeId) return setDependents([])
    api
      .get<Dependent[]>(`/hr/employee-records?kind=dependents&employeeId=${employeeId}`)
      .then(setDependents)
      .catch(() => setDependents([]))
  }, [employeeId])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      onSaved(
        await api.post<Enrollment>('/hr/enrollments', {
          employeeId,
          benefitId,
          status,
          dependentIds,
          effectiveDate: effectiveDate || null,
          notes: notes || null,
        }),
      )
      setNotes('')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the enrollment')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <CardForm onSubmit={submit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <EmployeeSelect value={employeeId} onChange={setEmployeeId} />
        <Field label="Benefit / plan">
          <select required value={benefitId} onChange={(e) => setBenefitId(e.target.value)} className="field">
            <option value="">Select…</option>
            {benefits.map((b) => (
              <option key={b.id} value={b.id}>
                {b.title}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Status">
          <select value={status} onChange={(e) => setStatus(e.target.value as Enrollment['status'])} className="field">
            <option value="pending">Pending</option>
            <option value="enrolled">Enrolled</option>
            <option value="waived">Waived</option>
            <option value="terminated">Terminated</option>
          </select>
        </Field>
        <Field label="Effective date">
          <input type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} className="field" />
        </Field>
      </div>
      {dependents.length > 0 && (
        <fieldset className="text-sm text-gray-700 dark:text-gray-300">
          <legend className="mb-1 text-gray-600 dark:text-gray-400">Covered dependents</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {dependents.map((d) => (
              <label key={d.id} className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={dependentIds.includes(d.id)}
                  onChange={(e) => setDependentIds((prev) => (e.target.checked ? [...prev, d.id] : prev.filter((x) => x !== d.id)))}
                />
                {d.name} ({d.relationship})
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <Field label="Notes (optional)">
        <input value={notes} onChange={(e) => setNotes(e.target.value)} className="field" />
      </Field>
      <FormError message={error} />
      <Button type="submit" variant="primary" size="sm" disabled={submitting}>
        {submitting ? 'Saving…' : 'Save enrollment'}
      </Button>
    </CardForm>
  )
}

function EnrollmentRow({ enrollment, onUpdated, onDeleted }: { enrollment: Enrollment; onUpdated: (e: Enrollment) => void; onDeleted: (id: string) => void }) {
  const [busy, setBusy] = useState(false)
  const [showHistory, setShowHistory] = useState(false)

  async function setStatus(status: Enrollment['status']) {
    setBusy(true)
    try {
      onUpdated(await api.put<Enrollment>(`/hr/enrollments/${enrollment.id}`, { status }))
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Could not update the enrollment')
    } finally {
      setBusy(false)
    }
  }

  return (
    <li>
      <Card className="!py-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-medium text-gray-900 dark:text-gray-100">{enrollment.employeeName}</div>
            <div className="text-sm text-gray-500 dark:text-gray-400">
              {enrollment.benefitTitle}
              {enrollment.effectiveDate && ` · effective ${formatDateOnly(enrollment.effectiveDate)}`}
              {enrollment.dependentIds.length > 0 && ` · ${enrollment.dependentIds.length} dependent${enrollment.dependentIds.length === 1 ? '' : 's'}`}
            </div>
            {enrollment.notes && <div className="mt-1 text-sm text-gray-600 dark:text-gray-400">{enrollment.notes}</div>}
          </div>
          <Badge tone={STATUS_TONE[enrollment.status]}>{enrollment.status}</Badge>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {enrollment.status !== 'enrolled' && (
            <Button size="sm" disabled={busy} onClick={() => setStatus('enrolled')}>
              Enroll
            </Button>
          )}
          {enrollment.status !== 'terminated' && (
            <Button size="sm" disabled={busy} onClick={() => setStatus('terminated')}>
              Terminate
            </Button>
          )}
          <Button size="sm" onClick={() => setShowHistory((v) => !v)}>
            {showHistory ? 'Hide history' : 'History'}
          </Button>
          <Button
            size="sm"
            variant="danger"
            disabled={busy}
            onClick={async () => {
              if (!window.confirm('Remove this enrollment record?')) return
              await api.delete(`/hr/enrollments/${enrollment.id}`)
              onDeleted(enrollment.id)
            }}
          >
            Remove
          </Button>
        </div>
        {showHistory && (
          <ul className="mt-2 space-y-0.5 border-t border-black/5 pt-2 text-xs text-gray-600 dark:border-white/10 dark:text-gray-400">
            {enrollment.history.map((h, i) => (
              <li key={i}>
                {new Date(h.at).toLocaleString('en-US', { timeZone: 'Asia/Manila' })} — {h.action}
                {h.detail ? `: ${h.detail}` : ''}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </li>
  )
}

function ProviderForm({ benefit, onSaved }: { benefit: Benefit; onSaved: (b: Benefit) => void }) {
  const [provider, setProvider] = useState(benefit.provider ?? '')
  const [contact, setContact] = useState(benefit.providerContact ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setBusy(true)
    setError(null)
    try {
      onSaved(await api.put<Benefit>(`/benefits/${benefit.id}`, { provider: provider || null, providerContact: contact || null }))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save provider details')
    } finally {
      setBusy(false)
    }
  }

  return (
    <li>
      <Card className="!py-3">
        <div className="font-medium text-gray-900 dark:text-gray-100">{benefit.title}</div>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <Field label="Provider">
            <input value={provider} onChange={(e) => setProvider(e.target.value)} className="field" />
          </Field>
          <Field label="Provider contact">
            <input value={contact} onChange={(e) => setContact(e.target.value)} className="field" />
          </Field>
        </div>
        <FormError message={error} />
        <Button size="sm" className="mt-2" disabled={busy} onClick={save}>
          Save
        </Button>
      </Card>
    </li>
  )
}

export function BenefitsAdminPage() {
  const [benefits, setBenefits] = useState<Benefit[] | null>(null)
  const [enrollments, setEnrollments] = useState<Enrollment[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([api.get<Benefit[]>('/benefits'), api.get<Enrollment[]>('/hr/enrollments')])
      .then(([b, e]) => {
        setBenefits(b)
        setEnrollments(e)
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Something went wrong'))
  }, [])

  const upsert = (e: Enrollment) =>
    setEnrollments((prev) => {
      const list = prev ?? []
      return list.some((x) => x.id === e.id) ? list.map((x) => (x.id === e.id ? e : x)) : [e, ...list]
    })

  return (
    <div>
      <PageHeader title="Benefits Administration" description="Manage who is enrolled in what. Employees see the general Benefits page." />
      {error && <ErrorState message={error} />}
      {!benefits && !error && <LoadingState />}

      {benefits && enrollments && (
        <SectionStack>
          <Section id="benadmin.enroll" title="HMO / benefit enrollment" hint="Enroll an employee or change their status" defaultOpen>
            <EnrollForm benefits={benefits} onSaved={upsert} />
          </Section>

          {(['pending', 'enrolled', 'waived', 'terminated'] as const).map((status) => {
            const list = enrollments.filter((e) => e.status === status)
            return (
              <Section
                key={status}
                id={`benadmin.${status}`}
                title={status === 'enrolled' ? 'Enrollment status: enrolled' : `Enrollment status: ${status}`}
                hint={`${list.length} record${list.length === 1 ? '' : 's'}`}
                defaultOpen={status === 'enrolled' || status === 'pending'}
              >
                {list.length === 0 ? (
                  <EmptyState label="No records." />
                ) : (
                  <ul className="space-y-2">
                    {list.map((e) => (
                      <EnrollmentRow key={e.id} enrollment={e} onUpdated={upsert} onDeleted={(id) => setEnrollments((prev) => prev?.filter((x) => x.id !== id) ?? null)} />
                    ))}
                  </ul>
                )}
              </Section>
            )
          })}

          <Section id="benadmin.providers" title="Provider information" hint="Who administers each benefit">
            {benefits.length === 0 ? (
              <EmptyState label="No benefits published yet." />
            ) : (
              <ul className="space-y-2">
                {benefits.map((b) => (
                  <ProviderForm key={b.id} benefit={b} onSaved={(nb) => setBenefits((prev) => prev?.map((x) => (x.id === nb.id ? nb : x)) ?? null)} />
                ))}
              </ul>
            )}
          </Section>
        </SectionStack>
      )}
    </div>
  )
}
