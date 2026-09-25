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
import type { Checklist } from './types'

// One page for both onboarding and offboarding: they share a checklist
// shape (employee + ticked tasks + notes); offboarding also records the
// separation type and last working day.

const COPY = {
  onboarding: {
    title: 'Onboarding',
    description: 'Checklist for each new hire: contract, government requirements, orientation and more.',
    start: 'Start onboarding',
  },
  offboarding: {
    title: 'Offboarding / Separation',
    description: 'Resignation, termination and clearance: everything to close out when someone leaves.',
    start: 'Start offboarding',
  },
} as const

function StartForm({ kind, onCreated }: { kind: Checklist['kind']; onCreated: (c: Checklist) => void }) {
  const [employeeId, setEmployeeId] = useState('')
  const [separationType, setSeparationType] = useState<'resignation' | 'termination'>('resignation')
  const [effectiveDate, setEffectiveDate] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const created = await api.post<Checklist>('/hr/checklists', {
        employeeId,
        kind,
        ...(kind === 'offboarding' && { separationType }),
        ...(effectiveDate && { effectiveDate }),
      })
      onCreated(created)
      setEmployeeId('')
      setEffectiveDate('')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not start the checklist')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <CardForm onSubmit={submit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <EmployeeSelect value={employeeId} onChange={setEmployeeId} />
        {kind === 'offboarding' && (
          <Field label="Type">
            <select value={separationType} onChange={(e) => setSeparationType(e.target.value as 'resignation' | 'termination')} className="field">
              <option value="resignation">Resignation</option>
              <option value="termination">Termination</option>
            </select>
          </Field>
        )}
        <Field label={kind === 'offboarding' ? 'Last working day' : 'Start date'}>
          <input type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} className="field" />
        </Field>
      </div>
      <FormError message={error} />
      <Button type="submit" variant="primary" size="sm" disabled={submitting}>
        {submitting ? 'Starting…' : COPY[kind].start}
      </Button>
    </CardForm>
  )
}

function ChecklistCard({ checklist, onUpdated, onDeleted }: { checklist: Checklist; onUpdated: (c: Checklist) => void; onDeleted: (id: string) => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notes, setNotes] = useState(checklist.notes ?? '')
  const { done, total } = checklist.progress

  async function run(fn: () => Promise<Checklist | void>) {
    setBusy(true)
    setError(null)
    try {
      const result = await fn()
      if (result) onUpdated(result)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  return (
    <li>
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-medium text-gray-900 dark:text-gray-100">{checklist.employeeName}</div>
            <div className="text-sm text-gray-500 dark:text-gray-400">
              Started {formatDateOnly(checklist.createdAt)}
              {checklist.separationType && ` · ${checklist.separationType}`}
              {checklist.effectiveDate && ` · ${checklist.kind === 'offboarding' ? 'last day' : 'starts'} ${formatDateOnly(checklist.effectiveDate)}`}
            </div>
          </div>
          <Badge tone={checklist.status === 'completed' ? 'green' : 'amber'}>
            {checklist.status === 'completed' ? 'Completed' : `${done}/${total} done`}
          </Badge>
        </div>

        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-black/5 dark:bg-white/10">
          <div className="h-full bg-brand-500 transition-all" style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
        </div>

        <ul className="mt-3 space-y-1">
          {checklist.tasks.map((t) => (
            <li key={t.id}>
              <label className="flex cursor-pointer items-center gap-2 py-1 text-sm text-gray-800 dark:text-gray-200">
                <input
                  type="checkbox"
                  checked={t.done}
                  disabled={busy || checklist.status === 'completed'}
                  onChange={(e) => run(() => api.put<Checklist>(`/hr/checklists/${checklist.id}?task=${t.id}`, { done: e.target.checked }))}
                />
                <span className={t.done ? 'text-gray-500 line-through dark:text-gray-500' : ''}>{t.label}</span>
                {t.done && t.doneAt && <span className="text-xs text-gray-400">{formatDateOnly(t.doneAt)}</span>}
              </label>
            </li>
          ))}
        </ul>

        <div className="mt-3 space-y-2">
          <Field label="Notes">
            <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className="field" />
          </Field>
          <FormError message={error} />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={busy || notes === (checklist.notes ?? '')} onClick={() => run(() => api.put<Checklist>(`/hr/checklists/${checklist.id}`, { notes: notes || null }))}>
              Save notes
            </Button>
            {checklist.status === 'open' ? (
              <Button size="sm" variant="primary" disabled={busy} onClick={() => run(() => api.put<Checklist>(`/hr/checklists/${checklist.id}`, { status: 'completed' }))}>
                Mark complete
              </Button>
            ) : (
              <Button size="sm" disabled={busy} onClick={() => run(() => api.put<Checklist>(`/hr/checklists/${checklist.id}`, { status: 'open' }))}>
                Reopen
              </Button>
            )}
            <Button
              size="sm"
              variant="danger"
              disabled={busy}
              onClick={() => {
                if (!window.confirm('Delete this checklist?')) return
                void run(async () => {
                  await api.delete(`/hr/checklists/${checklist.id}`)
                  onDeleted(checklist.id)
                })
              }}
            >
              Delete
            </Button>
          </div>
        </div>
      </Card>
    </li>
  )
}

export function ChecklistPage({ kind }: { kind: Checklist['kind'] }) {
  const [items, setItems] = useState<Checklist[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setItems(null)
    api
      .get<Checklist[]>(`/hr/checklists?kind=${kind}`)
      .then(setItems)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Something went wrong'))
  }, [kind])

  const open = items?.filter((c) => c.status === 'open') ?? []
  const completed = items?.filter((c) => c.status === 'completed') ?? []
  const replace = (c: Checklist) => setItems((prev) => prev?.map((x) => (x.id === c.id ? c : x)) ?? null)
  const remove = (id: string) => setItems((prev) => prev?.filter((x) => x.id !== id) ?? null)

  return (
    <div>
      <PageHeader title={COPY[kind].title} description={COPY[kind].description} />
      {error && <ErrorState message={error} />}
      {!items && !error && <LoadingState />}

      {items && (
        <SectionStack>
          <Section id={`${kind}.start`} title={COPY[kind].start} defaultOpen={items.length === 0}>
            <StartForm kind={kind} onCreated={(c) => setItems((prev) => (prev ? [c, ...prev] : [c]))} />
          </Section>
          <Section id={`${kind}.open`} title="In progress" hint={`${open.length} open`} defaultOpen>
            {open.length === 0 ? (
              <EmptyState label="Nothing in progress." />
            ) : (
              <ul className="space-y-3">
                {open.map((c) => (
                  <ChecklistCard key={c.id} checklist={c} onUpdated={replace} onDeleted={remove} />
                ))}
              </ul>
            )}
          </Section>
          <Section id={`${kind}.done`} title="Completed" hint={`${completed.length} completed`}>
            {completed.length === 0 ? (
              <EmptyState label="Nothing completed yet." />
            ) : (
              <ul className="space-y-3">
                {completed.map((c) => (
                  <ChecklistCard key={c.id} checklist={c} onUpdated={replace} onDeleted={remove} />
                ))}
              </ul>
            )}
          </Section>
        </SectionStack>
      )}
    </div>
  )
}
