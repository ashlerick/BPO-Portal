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
import { MAX_UPLOAD_BYTES, readFileAsBase64 } from '../../utils/files'
import { humanize } from '../../utils/text'

type CaseStatus = 'open' | 'under_review' | 'resolved' | 'closed'
type Warning = 'none' | 'written' | 'final'

interface Case {
  id: string
  employeeId: string
  employeeName: string
  title: string
  incidentDate: string
  incidentReport: string
  employeeExplanation: string | null
  warningLevel: Warning
  correctiveAction: string | null
  status: CaseStatus
  documents: { index: number; name: string }[]
  history: { at: string; by: string; action: string; detail?: string }[]
}

const STATUSES: CaseStatus[] = ['open', 'under_review', 'resolved', 'closed']
const warningTone = (w: Warning): 'gray' | 'amber' | 'red' => (w === 'final' ? 'red' : w === 'written' ? 'amber' : 'gray')

function NewCaseForm({ onCreated }: { onCreated: (c: Case) => void }) {
  const [employeeId, setEmployeeId] = useState('')
  const [title, setTitle] = useState('')
  const [incidentDate, setIncidentDate] = useState('')
  const [report, setReport] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      onCreated(await api.post<Case>('/restricted/disciplinary', { employeeId, title, incidentDate, incidentReport: report }))
      setTitle('')
      setReport('')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not open the case')
    } finally {
      setBusy(false)
    }
  }

  return (
    <CardForm onSubmit={submit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <EmployeeSelect value={employeeId} onChange={setEmployeeId} />
        <Field label="Case title">
          <input required value={title} onChange={(e) => setTitle(e.target.value)} className="field" />
        </Field>
        <Field label="Incident date">
          <input type="date" required value={incidentDate} onChange={(e) => setIncidentDate(e.target.value)} className="field" />
        </Field>
      </div>
      <Field label="Incident report">
        <textarea required rows={3} value={report} onChange={(e) => setReport(e.target.value)} className="field" />
      </Field>
      <FormError message={error} />
      <Button type="submit" variant="primary" size="sm" disabled={busy}>
        {busy ? 'Opening…' : 'Open case'}
      </Button>
    </CardForm>
  )
}

function CaseCard({ item, onUpdated }: { item: Case; onUpdated: (c: Case) => void }) {
  const [explanation, setExplanation] = useState(item.employeeExplanation ?? '')
  const [action, setAction] = useState(item.correctiveAction ?? '')
  const [warning, setWarning] = useState<Warning>(item.warningLevel)
  const [status, setStatus] = useState<CaseStatus>(item.status)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showHistory, setShowHistory] = useState(false)

  async function save() {
    setBusy(true)
    setError(null)
    try {
      onUpdated(
        await api.put<Case>(`/restricted/disciplinary/${item.id}`, {
          employeeExplanation: explanation || null,
          correctiveAction: action || null,
          warningLevel: warning,
          status,
          ...(note && { note }),
        }),
      )
      setNote('')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the case')
    } finally {
      setBusy(false)
    }
  }

  async function upload(file: File | undefined) {
    if (!file) return
    if (file.size > MAX_UPLOAD_BYTES) return setError('File must be under 4MB')
    setBusy(true)
    setError(null)
    try {
      onUpdated(
        await api.post<Case>(`/restricted/disciplinary/${item.id}?doc=upload`, {
          name: file.name,
          fileName: file.name,
          contentType: file.type || 'application/octet-stream',
          fileBase64: await readFileAsBase64(file),
        }),
      )
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not upload the document')
    } finally {
      setBusy(false)
    }
  }

  async function download(index: number) {
    try {
      const { url } = await api.get<{ url: string }>(`/restricted/disciplinary/${item.id}?doc=${index}`)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not open the document')
    }
  }

  return (
    <li>
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-medium text-gray-900 dark:text-gray-100">{item.title}</div>
            <div className="text-sm text-gray-500 dark:text-gray-400">
              {item.employeeName} · incident {formatDateOnly(item.incidentDate)}
            </div>
          </div>
          <div className="flex gap-1.5">
            {item.warningLevel !== 'none' && <Badge tone={warningTone(item.warningLevel)}>{item.warningLevel} warning</Badge>}
            <Badge tone={item.status === 'closed' || item.status === 'resolved' ? 'green' : 'amber'}>{humanize(item.status)}</Badge>
          </div>
        </div>
        <p className="mt-2 whitespace-pre-line text-sm text-gray-700 dark:text-gray-300">
          <span className="font-medium">Incident report:</span> {item.incidentReport}
        </p>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Employee explanation">
            <textarea rows={2} value={explanation} onChange={(e) => setExplanation(e.target.value)} className="field" />
          </Field>
          <Field label="Corrective action">
            <textarea rows={2} value={action} onChange={(e) => setAction(e.target.value)} className="field" />
          </Field>
          <Field label="Warning level">
            <select value={warning} onChange={(e) => setWarning(e.target.value as Warning)} className="field">
              <option value="none">No warning</option>
              <option value="written">Written warning</option>
              <option value="final">Final warning</option>
            </select>
          </Field>
          <Field label="Case status">
            <select value={status} onChange={(e) => setStatus(e.target.value as CaseStatus)} className="field">
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {humanize(s)}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Note for the case history (optional)" className="mt-3">
          <input value={note} onChange={(e) => setNote(e.target.value)} className="field" />
        </Field>

        <div className="mt-3">
          <div className="text-sm text-gray-600 dark:text-gray-400">Supporting documents</div>
          {item.documents.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-500">None attached.</p>
          ) : (
            <ul className="mt-1 space-y-1 text-sm">
              {item.documents.map((d) => (
                <li key={d.index}>
                  <button type="button" onClick={() => download(d.index)} className="text-brand-700 underline dark:text-brand-400">
                    {d.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <input type="file" disabled={busy} onChange={(e) => upload(e.target.files?.[0])} className="mt-2 text-sm text-gray-600 dark:text-gray-400" />
        </div>

        <FormError message={error} />
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" variant="primary" disabled={busy} onClick={save}>
            Save changes
          </Button>
          <Button size="sm" onClick={() => setShowHistory((v) => !v)}>
            {showHistory ? 'Hide case history' : 'Case history'}
          </Button>
        </div>
        {showHistory && (
          <ul className="mt-3 space-y-0.5 border-t border-black/5 pt-2 text-xs text-gray-600 dark:border-white/10 dark:text-gray-400">
            {item.history.map((h, i) => (
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

export function EmployeeRelationsPage() {
  const [cases, setCases] = useState<Case[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .get<Case[]>('/restricted/disciplinary')
      .then(setCases)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Something went wrong'))
  }, [])

  if (error) return <ErrorState message={error} />
  if (!cases) return <LoadingState />

  const replace = (c: Case) => setCases((prev) => prev?.map((x) => (x.id === c.id ? c : x)) ?? null)
  const list = (filter: (c: Case) => boolean) => cases.filter(filter)
  const render = (items: Case[]) =>
    items.length === 0 ? (
      <EmptyState label="No cases." />
    ) : (
      <ul className="space-y-3">
        {items.map((c) => (
          <CaseCard key={c.id} item={c} onUpdated={replace} />
        ))}
      </ul>
    )
  const active = list((c) => c.status === 'open' || c.status === 'under_review')
  const warnings = list((c) => c.warningLevel !== 'none')

  return (
    <div>
      <PageHeader title="Employee Relations / Disciplinary" description="Restricted. Every view and change here is recorded in the audit log, and nothing on this page is visible to the employee." />
      <SectionStack>
        <Section id="er.new" title="Incident reports" hint="Open a new case">
          <NewCaseForm onCreated={(c) => setCases((prev) => (prev ? [c, ...prev] : [c]))} />
        </Section>
        <Section id="er.active" title="Case status: open and under review" hint={`${active.length} active`} defaultOpen>
          {render(active)}
        </Section>
        <Section id="er.warnings" title="Written and final warnings" hint={`${warnings.length}`}>
          {render(warnings)}
        </Section>
        <Section id="er.history" title="Case history" hint="Resolved and closed">
          {render(list((c) => c.status === 'resolved' || c.status === 'closed'))}
        </Section>
      </SectionStack>
    </div>
  )
}
