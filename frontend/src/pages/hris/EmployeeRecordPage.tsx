import { useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import { EmptyState, ErrorState, LoadingState } from '../../components/AsyncState'
import { api, ApiError } from '../../services/api'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Field, FormError } from '../../components/ui/Field'
import { PageHeader } from '../../components/ui/PageHeader'
import { Section, SectionStack } from '../../components/ui/Section'
import { formatDateOnly } from '../../utils/dates'
import { MAX_UPLOAD_BYTES, readFileAsBase64 } from '../../utils/files'
import type { Dependent } from '../hr/types'
import type { Department, EmployeeRecord, Team } from './types'

// Everything HR keeps about one employee, as a stack of sections that
// mirror HR's "Employee Management" list.

interface HistoryEntry {
  id: string
  title: string
  department: string | null
  startDate: string
  endDate: string | null
  notes: string | null
}
interface Requirement {
  name: string
  number?: string
  status: 'pending' | 'submitted' | 'verified'
}
interface EmployeeFile {
  id: string
  title: string
  createdAt: string
}

const DEFAULT_REQUIREMENTS = ['SSS', 'PhilHealth', 'Pag-IBIG', 'TIN', 'NBI clearance', 'Birth certificate']
const STATUSES: EmployeeRecord['status'][] = ['active', 'on_leave', 'terminated']
const dateValue = (v: string | null) => (v ? v.slice(0, 10) : '')

function RecordForm({ employee, departments, teams, everyone, onSaved }: { employee: EmployeeRecord; departments: Department[]; teams: Team[]; everyone: EmployeeRecord[]; onSaved: (e: EmployeeRecord) => void }) {
  const [code, setCode] = useState(employee.employeeCode ?? '')
  const [position, setPosition] = useState(employee.position ?? '')
  const [departmentId, setDepartmentId] = useState(employee.departmentId ?? '')
  const [teamId, setTeamId] = useState(employee.teamId ?? '')
  const [managerId, setManagerId] = useState(employee.managerId ?? '')
  const [status, setStatus] = useState(employee.status)
  const [hired, setHired] = useState(dateValue(employee.dateHired))
  const [probation, setProbation] = useState(dateValue(employee.probationEndDate))
  const [regular, setRegular] = useState(dateValue(employee.regularizationDate))
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMessage(null)
    try {
      onSaved(
        await api.put<EmployeeRecord>(`/employees/${employee.id}`, {
          employeeCode: code || null,
          position: position || null,
          departmentId: departmentId || null,
          teamId: teamId || null,
          managerId: managerId || null,
          status,
          dateHired: hired || null,
          probationEndDate: probation || null,
          regularizationDate: regular || null,
        }),
      )
      setMessage({ ok: true, text: 'Saved.' })
    } catch (err) {
      setMessage({ ok: false, text: err instanceof ApiError ? err.message : 'Could not save the record' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Employee ID">
          <input value={code} onChange={(e) => setCode(e.target.value)} className="field" />
        </Field>
        <Field label="Position">
          <input value={position} onChange={(e) => setPosition(e.target.value)} className="field" />
        </Field>
        <Field label="Employment status">
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="field">
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replace('_', ' ')}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Department">
          <select
            value={departmentId}
            onChange={(e) => {
              setDepartmentId(e.target.value)
              setTeamId('')
            }}
            className="field"
          >
            <option value="">None</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Team">
          <select value={teamId} onChange={(e) => setTeamId(e.target.value)} className="field">
            <option value="">None</option>
            {teams
              .filter((t) => t.departmentId === departmentId)
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Supervisor">
          <select value={managerId} onChange={(e) => setManagerId(e.target.value)} className="field">
            <option value="">None</option>
            {everyone
              .filter((p) => p.id !== employee.id)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Date hired">
          <input type="date" value={hired} onChange={(e) => setHired(e.target.value)} className="field" />
        </Field>
        <Field label="Probation date">
          <input type="date" value={probation} onChange={(e) => setProbation(e.target.value)} className="field" />
        </Field>
        <Field label="Regularization date">
          <input type="date" value={regular} onChange={(e) => setRegular(e.target.value)} className="field" />
        </Field>
      </div>
      {message && <p className={`text-sm ${message.ok ? 'text-brand-700 dark:text-brand-400' : 'text-red-600 dark:text-red-400'}`}>{message.text}</p>}
      <Button type="submit" variant="primary" size="sm" disabled={busy}>
        {busy ? 'Saving…' : 'Save record'}
      </Button>
    </form>
  )
}

function SalarySection({ employeeId }: { employeeId: string }) {
  const [state, setState] = useState<{ salary: number | null; lastChangeDate: string | null } | 'denied' | null>(null)

  useEffect(() => {
    api
      .get<{ salary: number | null; lastChangeDate: string | null }>(`/restricted/payroll?kind=summary&employeeId=${employeeId}`)
      .then(setState)
      .catch(() => setState('denied'))
  }, [employeeId])

  if (state === 'denied') return <p className="text-sm text-gray-500 dark:text-gray-400">You don't have access to salary information.</p>
  if (!state) return <LoadingState />
  return (
    <div className="text-sm text-gray-700 dark:text-gray-300">
      <p>
        Current salary:{' '}
        <span className="font-medium text-gray-900 dark:text-gray-100">
          {state.salary !== null ? new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(state.salary) : 'Not set'}
        </span>
        {state.lastChangeDate && ` (last changed ${formatDateOnly(state.lastChangeDate)})`}
      </p>
      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
        Salary is managed on the{' '}
        <Link to="/payroll" className="font-medium text-brand-600 dark:text-brand-400">
          Payroll / Compensation
        </Link>{' '}
        page, where every change is recorded.
      </p>
    </div>
  )
}

function DependentsSection({ employeeId }: { employeeId: string }) {
  const [list, setList] = useState<Dependent[] | null>(null)
  const [name, setName] = useState('')
  const [relationship, setRelationship] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.get<Dependent[]>(`/hr/employee-records?kind=dependents&employeeId=${employeeId}`).then(setList).catch(() => setList([]))
  }, [employeeId])

  async function add(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      const created = await api.post<Dependent>('/hr/employee-records?kind=dependents', { employeeId, name, relationship, birthDate: birthDate || null })
      setList((prev) => [...(prev ?? []), created])
      setName('')
      setRelationship('')
      setBirthDate('')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not add the dependent')
    }
  }

  return (
    <div className="space-y-3">
      {!list ? (
        <LoadingState />
      ) : list.length === 0 ? (
        <EmptyState label="No dependents on file." />
      ) : (
        <ul className="divide-y divide-black/5 text-sm dark:divide-white/10">
          {list.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="text-gray-900 dark:text-gray-100">
                {d.name} <span className="text-gray-500 dark:text-gray-400">· {d.relationship}{d.birthDate ? ` · born ${formatDateOnly(d.birthDate)}` : ''}</span>
              </span>
              <Button
                size="sm"
                variant="danger"
                onClick={async () => {
                  await api.delete(`/hr/employee-records?kind=dependents&sub=${d.id}`)
                  setList((prev) => prev?.filter((x) => x.id !== d.id) ?? null)
                }}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={add} className="flex flex-wrap items-end gap-2">
        <Field label="Name">
          <input required value={name} onChange={(e) => setName(e.target.value)} className="field" />
        </Field>
        <Field label="Relationship">
          <input required value={relationship} onChange={(e) => setRelationship(e.target.value)} className="field" />
        </Field>
        <Field label="Birth date">
          <input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} className="field" />
        </Field>
        <Button type="submit" size="sm">
          Add dependent
        </Button>
      </form>
      <FormError message={error} />
    </div>
  )
}

function HistorySection({ employeeId }: { employeeId: string }) {
  const [list, setList] = useState<HistoryEntry[] | null>(null)
  const [title, setTitle] = useState('')
  const [department, setDepartment] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.get<HistoryEntry[]>(`/hr/employee-records?kind=history&employeeId=${employeeId}`).then(setList).catch(() => setList([]))
  }, [employeeId])

  async function add(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      const created = await api.post<HistoryEntry>('/hr/employee-records?kind=history', {
        employeeId,
        title,
        department: department || null,
        startDate: start,
        endDate: end || null,
      })
      setList((prev) => [created, ...(prev ?? [])])
      setTitle('')
      setDepartment('')
      setStart('')
      setEnd('')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not add the entry')
    }
  }

  return (
    <div className="space-y-3">
      {!list ? (
        <LoadingState />
      ) : list.length === 0 ? (
        <EmptyState label="No employment history recorded." />
      ) : (
        <ul className="divide-y divide-black/5 text-sm dark:divide-white/10">
          {list.map((h) => (
            <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="text-gray-900 dark:text-gray-100">
                {h.title}
                <span className="text-gray-500 dark:text-gray-400">
                  {h.department ? ` · ${h.department}` : ''} · {formatDateOnly(h.startDate)} – {h.endDate ? formatDateOnly(h.endDate) : 'present'}
                </span>
              </span>
              <Button
                size="sm"
                variant="danger"
                onClick={async () => {
                  await api.delete(`/hr/employee-records?kind=history&sub=${h.id}`)
                  setList((prev) => prev?.filter((x) => x.id !== h.id) ?? null)
                }}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={add} className="flex flex-wrap items-end gap-2">
        <Field label="Title / role">
          <input required value={title} onChange={(e) => setTitle(e.target.value)} className="field" />
        </Field>
        <Field label="Department">
          <input value={department} onChange={(e) => setDepartment(e.target.value)} className="field" />
        </Field>
        <Field label="From">
          <input type="date" required value={start} onChange={(e) => setStart(e.target.value)} className="field" />
        </Field>
        <Field label="To">
          <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="field" />
        </Field>
        <Button type="submit" size="sm">
          Add entry
        </Button>
      </form>
      <FormError message={error} />
    </div>
  )
}

function RequirementsSection({ employeeId }: { employeeId: string }) {
  const [list, setList] = useState<Requirement[] | null>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    api
      .get<Requirement[]>(`/hr/employee-records?kind=requirements&employeeId=${employeeId}`)
      .then((saved) => {
        const known = new Set(saved.map((r) => r.name))
        setList([...saved, ...DEFAULT_REQUIREMENTS.filter((n) => !known.has(n)).map((name) => ({ name, status: 'pending' as const }))])
      })
      .catch(() => setList([]))
  }, [employeeId])

  async function save() {
    if (!list) return
    setSaving(true)
    setMessage(null)
    try {
      await api.put('/hr/employee-records?kind=requirements', { employeeId, requirements: list.map((r) => ({ ...r, number: r.number || undefined })) })
      setMessage({ ok: true, text: 'Saved.' })
    } catch (err) {
      setMessage({ ok: false, text: err instanceof ApiError ? err.message : 'Could not save' })
    } finally {
      setSaving(false)
    }
  }

  if (!list) return <LoadingState />
  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {list.map((r, i) => (
          <li key={r.name} className="grid gap-2 sm:grid-cols-[1fr_1fr_10rem] sm:items-center">
            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{r.name}</span>
            <input
              placeholder="Number / reference"
              value={r.number ?? ''}
              onChange={(e) => setList((prev) => prev?.map((x, j) => (j === i ? { ...x, number: e.target.value } : x)) ?? null)}
              className="field"
            />
            <select
              value={r.status}
              onChange={(e) => setList((prev) => prev?.map((x, j) => (j === i ? { ...x, status: e.target.value as Requirement['status'] } : x)) ?? null)}
              className="field"
            >
              <option value="pending">Pending</option>
              <option value="submitted">Submitted</option>
              <option value="verified">Verified</option>
            </select>
          </li>
        ))}
      </ul>
      {message && <p className={`text-sm ${message.ok ? 'text-brand-700 dark:text-brand-400' : 'text-red-600 dark:text-red-400'}`}>{message.text}</p>}
      <Button size="sm" variant="primary" disabled={saving} onClick={save}>
        {saving ? 'Saving…' : 'Save requirements'}
      </Button>
    </div>
  )
}

function DocumentsSection({ employeeId }: { employeeId: string }) {
  const [list, setList] = useState<EmployeeFile[] | null>(null)
  const [title, setTitle] = useState('')
  const [file, setFile] = useState<File | undefined>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.get<EmployeeFile[]>(`/hr/employee-records?kind=documents&employeeId=${employeeId}`).then(setList).catch(() => setList([]))
  }, [employeeId])

  async function upload(e: FormEvent) {
    e.preventDefault()
    if (!file) return
    if (file.size > MAX_UPLOAD_BYTES) return setError('File must be under 4MB')
    setBusy(true)
    setError(null)
    try {
      const created = await api.post<EmployeeFile>('/hr/employee-records?kind=documents', {
        employeeId,
        title: title || file.name,
        fileName: file.name,
        contentType: file.type || 'application/octet-stream',
        fileBase64: await readFileAsBase64(file),
      })
      setList((prev) => [created, ...(prev ?? [])])
      setTitle('')
      setFile(undefined)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not upload the file')
    } finally {
      setBusy(false)
    }
  }

  async function open(id: string) {
    try {
      const { url } = await api.get<{ url: string }>(`/hr/employee-records?kind=documents&sub=${id}`)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not open the file')
    }
  }

  return (
    <div className="space-y-3">
      {!list ? (
        <LoadingState />
      ) : list.length === 0 ? (
        <EmptyState label="No files attached." />
      ) : (
        <ul className="space-y-2">
          {list.map((d) => (
            <li key={d.id}>
              <Card className="flex flex-wrap items-center justify-between gap-2 !py-2.5 text-sm">
                <span className="text-gray-900 dark:text-gray-100">
                  {d.title} <span className="text-gray-500 dark:text-gray-400">· {formatDateOnly(d.createdAt)}</span>
                </span>
                <span className="flex gap-2">
                  <Button size="sm" onClick={() => open(d.id)}>
                    Open
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={async () => {
                      if (!window.confirm('Delete this file?')) return
                      await api.delete(`/hr/employee-records?kind=documents&sub=${d.id}`)
                      setList((prev) => prev?.filter((x) => x.id !== d.id) ?? null)
                    }}
                  >
                    Delete
                  </Button>
                </span>
              </Card>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={upload} className="flex flex-wrap items-end gap-2">
        <Field label="Title (optional)">
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="field" />
        </Field>
        <Field label="File (max 4MB)">
          <input type="file" required onChange={(e) => setFile(e.target.files?.[0])} className="text-sm" />
        </Field>
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? 'Uploading…' : 'Upload'}
        </Button>
      </form>
      <FormError message={error} />
    </div>
  )
}

export function EmployeeRecordPage() {
  const { id = '' } = useParams()
  const { effectiveRoles } = useAuth()
  const isHr = effectiveRoles.some((r) => r === 'hr' || r === 'admin')
  const [everyone, setEveryone] = useState<EmployeeRecord[] | null>(null)
  const [departments, setDepartments] = useState<Department[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isHr) return
    Promise.all([api.get<EmployeeRecord[]>('/employees'), api.get<{ departments: Department[]; teams: Team[] }>('/directory')])
      .then(([e, d]) => {
        setEveryone(e)
        setDepartments(d.departments)
        setTeams(d.teams)
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Something went wrong'))
  }, [isHr])

  if (!isHr) return <ErrorState message="Insufficient permissions" />
  if (error) return <ErrorState message={error} />
  if (!everyone) return <LoadingState />

  const employee = everyone.find((e) => e.id === id)
  if (!employee) return <ErrorState message="Employee not found" />

  return (
    <div>
      <Link to="/hris" className="mb-2 inline-block text-sm text-brand-600 hover:text-brand-700 dark:text-brand-400">
        ← Employee Management
      </Link>
      <PageHeader title={employee.name} description={[employee.position, employee.department, employee.email].filter(Boolean).join(' · ')} />

      <SectionStack>
        <Section id="record.main" title="Complete employee record" hint="ID, position, department, supervisor, dates, status" defaultOpen>
          <RecordForm
            employee={employee}
            departments={departments}
            teams={teams}
            everyone={everyone}
            onSaved={(updated) => setEveryone((prev) => prev?.map((x) => (x.id === updated.id ? updated : x)) ?? null)}
          />
        </Section>
        <Section id="record.salary" title="Salary information" hint="Restricted" roles={['hr', 'admin']}>
          <SalarySection employeeId={employee.id} />
        </Section>
        <Section id="record.emergency" title="Emergency contacts">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-gray-500 dark:text-gray-400">Name</dt>
              <dd className="text-gray-900 dark:text-gray-100">{employee.emergencyContactName ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500 dark:text-gray-400">Phone</dt>
              <dd className="text-gray-900 dark:text-gray-100">{employee.emergencyContactPhone ?? '—'}</dd>
            </div>
          </dl>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">Employees keep this up to date themselves on My Profile.</p>
        </Section>
        <Section id="record.dependents" title="Dependents">
          <DependentsSection employeeId={employee.id} />
        </Section>
        <Section id="record.history" title="Employment history">
          <HistorySection employeeId={employee.id} />
        </Section>
        <Section id="record.requirements" title="Government / HR requirements">
          <RequirementsSection employeeId={employee.id} />
        </Section>
        <Section id="record.documents" title="Employee documents" hint="Visible only to this employee and HR">
          <DocumentsSection employeeId={employee.id} />
        </Section>
      </SectionStack>
    </div>
  )
}
