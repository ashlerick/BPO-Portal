import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../../auth/AuthContext'
import { Button } from '../../components/ui/Button'
import { CardForm } from '../../components/ui/Card'
import { Field, FormError } from '../../components/ui/Field'
import { api, ApiError } from '../../services/api'
import { formatDateOnly } from '../../utils/dates'
import type { Department, EmployeeRecord, Team } from '../hris/types'

// New hire: one form that creates the (inactive) account, the employee
// record and the onboarding checklist. Nothing is emailed and the person
// cannot log in until HR presses Activate.

interface Shift {
  id: string
  name: string
  startTime: string
  endTime: string
  active: boolean
}

interface ApplicantOption {
  id: string
  name: string
  firstName: string | null
  middleName: string | null
  lastName: string | null
  birthDate: string | null
  gender: string | null
  email: string | null
  phone: string | null
  status: string
  jobTitle: string
  jobDepartment: string | null
  hiredUserId: string | null
  information: string | null
}

interface Pending {
  userId: string
  name: string
  email: string
  position: string | null
  dateHired: string | null
}

const blank = {
  firstName: '',
  middleName: '',
  lastName: '',
  email: '',
  position: '',
  departmentId: '',
  teamId: '',
  managerId: '',
  employeeCode: '',
  legalEntity: '',
  level: '',
  dateHired: '',
  birthDate: '',
  gender: '',
  shiftId: '',
  phone: '',
  teamLeader: false,
}

export function NewHireForm({ onCreated }: { onCreated: () => void }) {
  const { effectiveRoles } = useAuth()
  const isAdmin = effectiveRoles.includes('admin')
  const [f, setF] = useState(blank)
  const [departments, setDepartments] = useState<Department[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [people, setPeople] = useState<EmployeeRecord[]>([])
  const [shifts, setShifts] = useState<Shift[]>([])
  const [applicants, setApplicants] = useState<ApplicantOption[]>([])
  const [applicantId, setApplicantId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    api.get<{ departments: Department[]; teams: Team[] }>('/directory').then((d) => {
      setDepartments(d.departments)
      setTeams(d.teams)
    }).catch(() => undefined)
    api.get<EmployeeRecord[]>('/employees').then(setPeople).catch(() => undefined)
    api.get<Shift[]>('/hr/shifts?kind=templates').then((s) => setShifts(s.filter((x) => x.active))).catch(() => undefined)
    api
      .get<ApplicantOption[]>('/hr/recruitment?kind=applicants')
      .then((rows) => setApplicants(rows.filter((a) => !a.hiredUserId && a.status !== 'rejected' && a.status !== 'withdrawn')))
      .catch(() => undefined)
  }, [])

  // Choosing an applicant fills what the portal already knows; every field stays editable.
  function pickApplicant(id: string) {
    setApplicantId(id)
    const a = applicants.find((x) => x.id === id)
    if (!a) return
    // Older applicants only have a full name: split it as a fallback.
    const parts = a.name.trim().split(/\s+/)
    const lastName = a.lastName ?? (parts.length > 1 ? parts[parts.length - 1] : '')
    const firstName = a.firstName ?? (parts.length > 1 ? parts.slice(0, -1).join(' ') : parts[0])
    const dept = departments.find((d) => a.jobDepartment && d.name.toLowerCase() === a.jobDepartment.toLowerCase())
    setF((prev) => ({
      ...prev,
      firstName,
      middleName: a.middleName ?? prev.middleName,
      lastName,
      birthDate: a.birthDate ? a.birthDate.slice(0, 10) : prev.birthDate,
      gender: a.gender ?? prev.gender,
      email: a.email ?? prev.email,
      phone: a.phone ?? prev.phone,
      position: a.jobTitle,
      departmentId: dept?.id ?? prev.departmentId,
      teamId: dept ? '' : prev.teamId,
    }))
  }

  const set = (k: keyof typeof blank) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }))
  const nullable = (v: string) => (v.trim() === '' ? null : v.trim())

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      await api.post('/hr/new-hire', {
        email: f.email,
        firstName: f.firstName,
        middleName: nullable(f.middleName),
        lastName: f.lastName,
        roles: f.teamLeader ? ['employee', 'team_leader'] : ['employee'],
        position: nullable(f.position),
        departmentId: f.departmentId || null,
        teamId: f.teamId || null,
        managerId: f.managerId || null,
        employeeCode: nullable(f.employeeCode),
        legalEntity: nullable(f.legalEntity),
        level: nullable(f.level),
        dateHired: f.dateHired || null,
        birthDate: f.birthDate || null,
        gender: f.gender || null,
        shiftId: f.shiftId || null,
        phone: nullable(f.phone),
        applicantId: applicantId || null,
      })
      setMessage(`${f.firstName} ${f.lastName} was added. Their account stays inactive until you activate it.`)
      setF(blank)
      setApplicantId('')
      setApplicants((prev) => prev.filter((a) => a.id !== applicantId))
      onCreated()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create the new hire')
    } finally {
      setBusy(false)
    }
  }

  const teamOptions = teams.filter((t) => !f.departmentId || t.departmentId === f.departmentId)

  return (
    <CardForm onSubmit={submit} className="space-y-4">
      <p className="text-sm text-gray-600 dark:text-gray-400">
        Creates the account (inactive), the employee record and the onboarding checklist in one go. No email is sent and they cannot log
        in until you press <span className="font-medium">Activate</span>.
      </p>
      <Field label="Start from an applicant (optional)">
        <select value={applicantId} onChange={(e) => pickApplicant(e.target.value)} className="field">
          <option value="">Enter a new hire manually</option>
          {applicants.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} · {a.jobTitle} ({a.status})
            </option>
          ))}
        </select>
      </Field>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="First name">
          <input required value={f.firstName} onChange={set('firstName')} className="field" />
        </Field>
        <Field label="Middle name (optional)">
          <input value={f.middleName} onChange={set('middleName')} className="field" />
        </Field>
        <Field label="Last name">
          <input required value={f.lastName} onChange={set('lastName')} className="field" />
        </Field>
        <Field label="Email">
          <input required type="email" value={f.email} onChange={set('email')} className="field" />
        </Field>
        <Field label="Phone (optional)">
          <input type="tel" value={f.phone} onChange={set('phone')} className="field" />
        </Field>
        <Field label="Employee ID (optional)">
          <input value={f.employeeCode} onChange={set('employeeCode')} className="field" />
        </Field>
        <Field label="Date hired">
          <input type="date" value={f.dateHired} onChange={set('dateHired')} className="field" />
        </Field>
        <Field label="Position">
          <input value={f.position} onChange={set('position')} className="field" />
        </Field>
        <Field label="Department">
          <select value={f.departmentId} onChange={(e) => setF((p) => ({ ...p, departmentId: e.target.value, teamId: '' }))} className="field">
            <option value="">None</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Team">
          <select value={f.teamId} onChange={set('teamId')} className="field">
            <option value="">None</option>
            {teamOptions.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Supervisor">
          <select value={f.managerId} onChange={set('managerId')} className="field">
            <option value="">None</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Legal entity">
          <input value={f.legalEntity} onChange={set('legalEntity')} className="field" />
        </Field>
        <Field label="Level / tier">
          <input value={f.level} onChange={set('level')} placeholder="e.g. Tier 01" className="field" />
        </Field>
        <Field label="Birthday">
          <input type="date" value={f.birthDate} max={new Date().toISOString().slice(0, 10)} onChange={set('birthDate')} className="field" />
        </Field>
        <Field label="Gender (optional)">
          <select value={f.gender} onChange={set('gender')} className="field">
            <option value="">Not set</option>
            <option value="female">Female</option>
            <option value="male">Male</option>
            <option value="other">Other</option>
            <option value="prefer_not_to_say">Prefer not to say</option>
          </select>
        </Field>
        <Field label="Shift (optional)">
          <select value={f.shiftId} onChange={set('shiftId')} className="field">
            <option value="">None yet</option>
            {shifts.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.startTime}–{s.endTime})
              </option>
            ))}
          </select>
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
        <input type="checkbox" checked={f.teamLeader} onChange={(e) => setF((p) => ({ ...p, teamLeader: e.target.checked }))} />
        Also a Team Leader
        {!isAdmin && <span className="text-xs text-gray-500 dark:text-gray-400">(HR can only create Employee or Team Leader accounts)</span>}
      </label>
      <FormError message={error} />
      {message && <p className="text-sm text-green-700 dark:text-green-400">{message}</p>}
      <Button type="submit" variant="primary" size="sm" disabled={busy}>
        {busy ? 'Creating…' : 'Create new hire'}
      </Button>
    </CardForm>
  )
}

// Accounts created through onboarding that are still switched off.
export function PendingActivation({ refreshToken, onActivated }: { refreshToken: number; onActivated: () => void }) {
  const [rows, setRows] = useState<Pending[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(() => {
    api
      .get<Pending[]>('/hr/new-hire')
      .then(setRows)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load the list'))
  }, [])
  useEffect(load, [load, refreshToken])

  async function activate(p: Pending) {
    if (!window.confirm(`Activate ${p.name}'s account? A setup link will be emailed to ${p.email}.`)) return
    setBusyId(p.userId)
    setError(null)
    try {
      await api.post(`/hr/new-hire/${p.userId}?action=activate`, {})
      load()
      onActivated()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not activate the account')
    } finally {
      setBusyId(null)
    }
  }

  if (!rows) return null
  return (
    <div className="space-y-2">
      {rows.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">No accounts are waiting for activation.</p>
      ) : (
        <ul className="divide-y divide-black/5 text-sm dark:divide-white/10">
          {rows.map((p) => (
            <li key={p.userId} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="text-gray-900 dark:text-gray-100">
                <span className="font-medium">{p.name}</span>
                <span className="text-gray-500 dark:text-gray-400">
                  {' '}
                  · {p.email}
                  {p.position && ` · ${p.position}`}
                  {p.dateHired && ` · starts ${formatDateOnly(p.dateHired)}`}
                </span>
              </span>
              <Button size="sm" variant="primary" disabled={busyId === p.userId} onClick={() => activate(p)}>
                {busyId === p.userId ? 'Activating…' : 'Activate'}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <FormError message={error} />
    </div>
  )
}
