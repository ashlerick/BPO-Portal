import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../../auth/AuthContext'
import { ErrorState, LoadingState } from '../../components/AsyncState'
import { api, ApiError } from '../../services/api'
import { Card, CardForm } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { PageHeader } from '../../components/ui/PageHeader'
import { PasswordInput } from '../../components/ui/PasswordInput'
import { humanize } from '../../utils/text'
import type { Department, EmployeeRecord, MyEmployeeProfile, Team } from './types'

// dateHired is a date-only value with no meaningful time-of-day, so
// force UTC display — otherwise a viewer west of UTC sees it shifted
// back a day (new Date('2026-09-07') is midnight UTC, which is still
// Sep 6 evening in e.g. US timezones).
const dateFormatter = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' })
const statusOptions = ['active', 'on_leave', 'terminated'] as const

// Label/value pairs for the four self-service contact fields, in display
// order. Callers decide how to show an empty one ('—' on your own profile,
// omitted in HR's compact view).
function contactFields(c: {
  phone: string | null
  address: string | null
  emergencyContactName: string | null
  emergencyContactPhone: string | null
}): [string, string | null][] {
  return [
    ['Phone', c.phone],
    ['Address', c.address],
    ['Emergency contact', c.emergencyContactName],
    ['Emergency contact phone', c.emergencyContactPhone],
  ]
}

// Phones: one label/value row per field (a long email or address has the
// full width to itself). sm and up: a multi-column grid.
function DetailList({ rows, wide = false }: { rows: [string, string][]; wide?: boolean }) {
  return (
    <dl
      className={`mt-2 divide-y divide-black/5 text-sm dark:divide-white/10 sm:mt-3 sm:grid sm:gap-x-4 sm:gap-y-3 sm:divide-y-0 ${
        wide ? 'sm:grid-cols-3' : 'sm:grid-cols-2'
      }`}
    >
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-baseline justify-between gap-4 py-2 sm:block sm:py-0">
          <dt className="shrink-0 text-xs text-gray-500 dark:text-gray-400">{label}</dt>
          <dd className="min-w-0 whitespace-pre-line break-words text-right text-gray-900 dark:text-gray-200 sm:mt-0.5 sm:text-left">
            {value}
          </dd>
        </div>
      ))}
    </dl>
  )
}

function ContactDetailsCard({
  profile,
  onSaved,
}: {
  profile: MyEmployeeProfile
  onSaved: (updated: MyEmployeeProfile) => void
}) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [emergencyContactName, setEmergencyContactName] = useState('')
  const [emergencyContactPhone, setEmergencyContactPhone] = useState('')

  function startEditing() {
    setPhone(profile.phone ?? '')
    setAddress(profile.address ?? '')
    setEmergencyContactName(profile.emergencyContactName ?? '')
    setEmergencyContactPhone(profile.emergencyContactPhone ?? '')
    setError(null)
    setSaved(false)
    setEditing(true)
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const updated = await api.put<MyEmployeeProfile>('/employees/me', {
        phone,
        address,
        emergencyContactName,
        emergencyContactPhone,
      })
      onSaved(updated)
      setEditing(false)
      setSaved(true)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save your contact details')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-medium text-gray-900 dark:text-gray-100">Contact details</h3>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">Only you and HR/Admin can see these.</p>
        </div>
        {!editing && (
          <Button size="sm" className="shrink-0" onClick={startEditing}>
            Edit
          </Button>
        )}
      </div>

      {editing ? (
        <form onSubmit={save} className="mt-3 space-y-3 sm:max-w-md">
          <div className="space-y-1">
            <label htmlFor="contact-phone" className="text-sm text-gray-600 dark:text-gray-400">
              Phone
            </label>
            <input
              id="contact-phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="field"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="contact-address" className="text-sm text-gray-600 dark:text-gray-400">
              Address
            </label>
            <textarea
              id="contact-address"
              rows={2}
              maxLength={300}
              autoComplete="street-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="field"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="contact-emergency-name" className="text-sm text-gray-600 dark:text-gray-400">
              Emergency contact name
            </label>
            <input
              id="contact-emergency-name"
              maxLength={100}
              autoComplete="off"
              value={emergencyContactName}
              onChange={(e) => setEmergencyContactName(e.target.value)}
              className="field"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="contact-emergency-phone" className="text-sm text-gray-600 dark:text-gray-400">
              Emergency contact phone
            </label>
            <input
              id="contact-emergency-phone"
              type="tel"
              inputMode="tel"
              autoComplete="off"
              value={emergencyContactPhone}
              onChange={(e) => setEmergencyContactPhone(e.target.value)}
              className="field"
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <Button type="submit" variant="primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
            <Button type="button" onClick={() => setEditing(false)} disabled={saving}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <>
          <DetailList rows={contactFields(profile).map(([label, value]) => [label, value ?? '—'])} />
          {saved && (
            <p role="status" className="mt-2 text-sm text-brand-700 dark:text-brand-400">
              Contact details saved.
            </p>
          )}
        </>
      )}
    </Card>
  )
}

function ChangePasswordCard() {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)
  const [changed, setChanged] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setChanged(false)

    if (next.length < 8) return setError('New password must be at least 8 characters')
    if (next !== confirm) return setError('New passwords do not match')
    if (next === current) return setError('New password must be different from your current password')

    setSaving(true)
    try {
      await api.post('/auth/change-password', { currentPassword: current, newPassword: next })
      setCurrent('')
      setNext('')
      setConfirm('')
      setChanged(true)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not change your password')
    } finally {
      setSaving(false)
    }
  }

  return (
    <CardForm onSubmit={submit}>
      <h3 className="font-medium text-gray-900 dark:text-gray-100">Change password</h3>
      <div className="mt-3 space-y-3 sm:max-w-sm">
        <div className="space-y-1">
          <label htmlFor="current-password" className="text-sm text-gray-600 dark:text-gray-400">
            Current password
          </label>
          <PasswordInput
            id="current-password"
            required
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="new-password" className="text-sm text-gray-600 dark:text-gray-400">
            New password
          </label>
          <PasswordInput
            id="new-password"
            required
            minLength={8}
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="confirm-new-password" className="text-sm text-gray-600 dark:text-gray-400">
            Confirm new password
          </label>
          <PasswordInput
            id="confirm-new-password"
            required
            minLength={8}
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </div>
        {error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
        {changed && (
          <p role="status" className="text-sm text-brand-700 dark:text-brand-400">
            Password changed.
          </p>
        )}
        <Button type="submit" variant="primary" disabled={saving} className="w-full sm:w-auto">
          {saving ? 'Changing…' : 'Change password'}
        </Button>
      </div>
    </CardForm>
  )
}

function MyProfile() {
  const [profile, setProfile] = useState<MyEmployeeProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .get<MyEmployeeProfile>('/employees/me')
      .then(setProfile)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) {
          setNotFound(true)
        } else {
          setError(err instanceof ApiError ? err.message : 'Something went wrong')
        }
      })
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <LoadingState />
  if (error) return <ErrorState message={error} />

  const fields: [string, string][] = profile
    ? [
        ['Position', profile.position ?? '—'],
        ['Department', profile.department ?? '—'],
        ['Team', profile.team ?? '—'],
        ['Status', humanize(profile.status)],
        ['Date Hired', profile.dateHired ? dateFormatter.format(new Date(profile.dateHired)) : '—'],
        ['Work Email', profile.email],
        ['SIL Balance', `${profile.silBalance} day${profile.silBalance === 1 ? '' : 's'}`],
      ]
    : []

  // Changing your own password doesn't depend on having an employee
  // record, so it's shown either way.
  return (
    <div className="space-y-4">
      {notFound && (
        <p className="text-sm text-gray-500 dark:text-gray-400">No employee profile on file for your account yet.</p>
      )}
      {profile && (
        <>
          <Card>
            <h3 className="font-medium text-gray-900 dark:text-gray-100">{profile.name}</h3>
            <DetailList rows={fields} wide />
          </Card>
          <ContactDetailsCard profile={profile} onSaved={setProfile} />
        </>
      )}
      <ChangePasswordCard />
    </div>
  )
}

function EmployeeRow({
  employee,
  departments,
  teams,
  onSaved,
}: {
  employee: EmployeeRecord
  departments: Department[]
  teams: Team[]
  onSaved: (updated: EmployeeRecord) => void
}) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [position, setPosition] = useState(employee.position ?? '')
  const [status, setStatus] = useState(employee.status)
  const [departmentId, setDepartmentId] = useState(employee.departmentId ?? '')
  const [teamId, setTeamId] = useState(employee.teamId ?? '')
  const [dateHired, setDateHired] = useState(employee.dateHired ? employee.dateHired.slice(0, 10) : '')
  const [silBalance, setSilBalance] = useState(String(employee.silBalance))
  const { guardedAction } = useAuth()

  const teamsInDepartment = teams.filter((t) => t.departmentId === departmentId)

  function save() {
    const parsedSil = Number(silBalance)
    if (!Number.isInteger(parsedSil) || parsedSil < 0) {
      setError('SIL balance must be a whole number, 0 or more')
      return
    }

    guardedAction(['hr', 'admin'], async () => {
      setSaving(true)
      setError(null)
      try {
        const updated = await api.put<EmployeeRecord>(`/employees/${employee.id}`, {
          position: position || null,
          status,
          departmentId: departmentId || null,
          teamId: teamId || null,
          dateHired: dateHired || null,
          silBalance: parsedSil,
        })
        onSaved(updated)
        setEditing(false)
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Could not save changes')
      } finally {
        setSaving(false)
      }
    })
  }

  if (!editing) {
    return (
      <tr className="border-b border-black/5 transition-colors last:border-0 hover:bg-black/[0.02] dark:border-white/5 dark:hover:bg-white/[0.03]">
        <td data-primary className="py-2.5 pl-4 pr-4">
          <div className="font-medium text-gray-900 dark:text-gray-100">{employee.name}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400">{employee.email}</div>
          {contactFields(employee).some(([, v]) => v) && (
            <details className="mt-1 text-xs">
              <summary className="cursor-pointer select-none text-brand-700 dark:text-brand-400">Contact details</summary>
              <dl className="mt-1 space-y-0.5 whitespace-pre-line break-words text-gray-600 dark:text-gray-400">
                {contactFields(employee)
                  .filter(([, v]) => v)
                  .map(([label, v]) => (
                    <div key={label}>
                      <dt className="inline text-gray-500 dark:text-gray-500">{label}: </dt>
                      <dd className="inline">{v}</dd>
                    </div>
                  ))}
              </dl>
            </details>
          )}
        </td>
        <td data-label="Position" className="py-2.5 pr-4 text-gray-700 dark:text-gray-300">{employee.position ?? '—'}</td>
        <td data-label="Department" className="py-2.5 pr-4 text-gray-700 dark:text-gray-300">{employee.department ?? '—'}</td>
        <td data-label="Team" className="py-2.5 pr-4 text-gray-700 dark:text-gray-300">{employee.team ?? '—'}</td>
        <td data-label="Status" className="py-2.5 pr-4 text-gray-700 dark:text-gray-300">{humanize(employee.status)}</td>
        <td data-label="Date Hired" className="py-2.5 pr-4 text-gray-700 dark:text-gray-300">
          {employee.dateHired ? dateFormatter.format(new Date(employee.dateHired)) : '—'}
        </td>
        <td data-label="SIL Balance" className="py-2.5 pr-4 text-gray-700 dark:text-gray-300">
          {employee.silBalance} day{employee.silBalance === 1 ? '' : 's'}
        </td>
        <td data-actions className="py-2.5 pr-4">
          <Button size="sm" onClick={() => setEditing(true)}>
            Edit
          </Button>
        </td>
      </tr>
    )
  }

  return (
    <tr className="border-b border-black/5 dark:border-white/5">
      <td data-primary className="py-2.5 pl-4 pr-4 align-top">
        <div className="font-medium text-gray-900 dark:text-gray-100">{employee.name}</div>
        <div className="text-xs text-gray-500 dark:text-gray-400">{employee.email}</div>
      </td>
      <td data-label="Position" className="py-2.5 pr-4 align-top">
        <input value={position} onChange={(e) => setPosition(e.target.value)} className="field w-32 py-1" />
      </td>
      <td data-label="Department" className="py-2.5 pr-4 align-top">
        <select
          value={departmentId}
          onChange={(e) => {
            setDepartmentId(e.target.value)
            setTeamId('')
          }}
          className="field py-1"
        >
          <option value="">—</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </td>
      <td data-label="Team" className="py-2.5 pr-4 align-top">
        <select value={teamId} onChange={(e) => setTeamId(e.target.value)} className="field py-1">
          <option value="">—</option>
          {teamsInDepartment.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </td>
      <td data-label="Status" className="py-2.5 pr-4 align-top">
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="field py-1">
          {statusOptions.map((s) => (
            <option key={s} value={s}>
              {humanize(s)}
            </option>
          ))}
        </select>
      </td>
      <td data-label="Date Hired" className="py-2.5 pr-4 align-top">
        <input
          type="date"
          value={dateHired}
          onChange={(e) => setDateHired(e.target.value)}
          className="field py-1"
        />
      </td>
      <td data-label="SIL Balance" className="py-2.5 pr-4 align-top">
        <input
          type="number"
          min={0}
          step={1}
          value={silBalance}
          onChange={(e) => setSilBalance(e.target.value)}
          className="field w-20 py-1"
        />
      </td>
      <td data-actions className="py-2.5 pr-4 align-top">
        <div className="flex flex-wrap gap-1 md:flex-col">
          <Button size="sm" variant="primary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
          <Button size="sm" onClick={() => setEditing(false)}>
            Cancel
          </Button>
          {error && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
        </div>
      </td>
    </tr>
  )
}

function CreateTeamOrDepartment({
  departments,
  onCreated,
}: {
  departments: Department[]
  onCreated: (result: { department?: Department; team?: Team }) => void
}) {
  const [kind, setKind] = useState<'department' | 'team'>('department')
  const [name, setName] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { guardedAction } = useAuth()

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (kind === 'team' && !departmentId) {
      setError('Choose a department for the new team')
      return
    }
    guardedAction(['admin'], async () => {
      setSubmitting(true)
      try {
        if (kind === 'department') {
          const dept = await api.post<Department>('/directory', { kind: 'department', name })
          onCreated({ department: dept })
        } else {
          const team = await api.post<Team>('/directory', { kind: 'team', name, departmentId })
          onCreated({ team })
        }
        setName('')
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Could not create')
      } finally {
        setSubmitting(false)
      }
    })
  }

  return (
    <CardForm onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
      <div className="w-full space-y-1 md:w-auto">
        <label className="text-sm text-gray-600 dark:text-gray-400">Type</label>
        <select value={kind} onChange={(e) => setKind(e.target.value as 'department' | 'team')} className="field">
          <option value="department">Department</option>
          <option value="team">Team</option>
        </select>
      </div>
      <div className="w-full space-y-1 md:w-auto">
        <label className="text-sm text-gray-600 dark:text-gray-400">Name</label>
        <input required value={name} onChange={(e) => setName(e.target.value)} className="field" />
      </div>
      {kind === 'team' && (
        <div className="w-full space-y-1 md:w-auto">
          <label className="text-sm text-gray-600 dark:text-gray-400">Department</label>
          <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} className="field">
            <option value="">Select…</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
      )}
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <Button type="submit" variant="primary" disabled={submitting} className="w-full md:w-auto">
        {submitting ? 'Creating…' : 'Create'}
      </Button>
    </CardForm>
  )
}

function DepartmentRow({
  department,
  onUpdated,
  onDeleted,
}: {
  department: Department
  onUpdated: (d: Department) => void
  onDeleted: (id: string) => void
}) {
  const { guardedAction } = useAuth()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(department.name)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function save() {
    guardedAction(['admin'], async () => {
      setBusy(true)
      setError(null)
      try {
        const updated = await api.put<Department>(`/directory/departments/${department.id}`, { name })
        onUpdated(updated)
        setEditing(false)
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Could not rename')
      } finally {
        setBusy(false)
      }
    })
  }

  function remove() {
    if (!window.confirm(`Delete the "${department.name}" department?`)) return
    guardedAction(['admin'], async () => {
      setBusy(true)
      setError(null)
      try {
        await api.delete(`/directory/departments/${department.id}`)
        onDeleted(department.id)
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Could not delete')
        setBusy(false)
      }
    })
  }

  return (
    <li className="flex flex-wrap items-center gap-2 py-1.5">
      {editing ? (
        <>
          <input value={name} onChange={(e) => setName(e.target.value)} className="field w-full py-1 md:w-40" />
          <Button size="sm" variant="primary" onClick={save} disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setName(department.name)
              setEditing(false)
            }}
          >
            Cancel
          </Button>
        </>
      ) : (
        <>
          <span className="min-w-0 flex-1 break-words text-gray-900 dark:text-gray-100">{department.name}</span>
          <Button size="sm" onClick={() => setEditing(true)}>
            Rename
          </Button>
          <Button size="sm" variant="danger" onClick={remove} disabled={busy}>
            Delete
          </Button>
        </>
      )}
      {error && <span className="w-full text-xs text-red-600 dark:text-red-400">{error}</span>}
    </li>
  )
}

function TeamRow({
  team,
  onUpdated,
  onDeleted,
}: {
  team: Team
  onUpdated: (t: Team) => void
  onDeleted: (id: string) => void
}) {
  const { guardedAction } = useAuth()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(team.name)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function save() {
    guardedAction(['admin'], async () => {
      setBusy(true)
      setError(null)
      try {
        const updated = await api.put<Team>(`/directory/teams/${team.id}`, { name })
        onUpdated(updated)
        setEditing(false)
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Could not rename')
      } finally {
        setBusy(false)
      }
    })
  }

  function remove() {
    if (!window.confirm(`Delete the "${team.name}" team?`)) return
    guardedAction(['admin'], async () => {
      setBusy(true)
      setError(null)
      try {
        await api.delete(`/directory/teams/${team.id}`)
        onDeleted(team.id)
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Could not delete')
        setBusy(false)
      }
    })
  }

  return (
    <li className="flex flex-wrap items-center gap-2 py-1.5">
      {editing ? (
        <>
          <input value={name} onChange={(e) => setName(e.target.value)} className="field w-full py-1 md:w-40" />
          <Button size="sm" variant="primary" onClick={save} disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setName(team.name)
              setEditing(false)
            }}
          >
            Cancel
          </Button>
        </>
      ) : (
        <>
          <span className="min-w-0 flex-1 break-words text-gray-900 dark:text-gray-100">{team.name}</span>
          <Button size="sm" onClick={() => setEditing(true)}>
            Rename
          </Button>
          <Button size="sm" variant="danger" onClick={remove} disabled={busy}>
            Delete
          </Button>
        </>
      )}
      {error && <span className="w-full text-xs text-red-600 dark:text-red-400">{error}</span>}
    </li>
  )
}

function DirectoryMaintenance({
  departments,
  teams,
  onDepartmentUpdated,
  onDepartmentDeleted,
  onTeamUpdated,
  onTeamDeleted,
}: {
  departments: Department[]
  teams: Team[]
  onDepartmentUpdated: (d: Department) => void
  onDepartmentDeleted: (id: string) => void
  onTeamUpdated: (t: Team) => void
  onTeamDeleted: (id: string) => void
}) {
  if (departments.length === 0 && teams.length === 0) return null

  return (
    <Card className="mb-4">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
        Departments &amp; Teams
      </h3>
      {/* Nested by department, not two side-by-side flat lists — a team
          belongs to exactly one department, and a layout that shows
          them as two independent lists hides that relationship. */}
      <ul className="mt-2 divide-y divide-black/5 dark:divide-white/10">
        {departments.map((d) => {
          const teamsInDepartment = teams.filter((t) => t.departmentId === d.id)
          return (
            <li key={d.id} className="py-2">
              <ul className="text-sm">
                <DepartmentRow department={d} onUpdated={onDepartmentUpdated} onDeleted={onDepartmentDeleted} />
              </ul>
              <ul className="ml-5 mt-1 space-y-0.5 border-l border-black/10 pl-3 text-sm dark:border-white/10">
                {teamsInDepartment.length === 0 ? (
                  <li className="py-1 text-xs text-gray-400 dark:text-gray-500">No teams yet</li>
                ) : (
                  teamsInDepartment.map((t) => (
                    <TeamRow key={t.id} team={t} onUpdated={onTeamUpdated} onDeleted={onTeamDeleted} />
                  ))
                )}
              </ul>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

function EmployeeDirectory() {
  const [employees, setEmployees] = useState<EmployeeRecord[] | null>(null)
  const [departments, setDepartments] = useState<Department[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      api.get<EmployeeRecord[]>('/employees'),
      api.get<{ departments: Department[]; teams: Team[] }>('/directory'),
    ])
      .then(([e, dir]) => {
        setEmployees(e)
        setDepartments(dir.departments)
        setTeams(dir.teams)
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Something went wrong'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <LoadingState />
  if (error) return <ErrorState message={error} />
  if (!employees || employees.length === 0) {
    return <p className="text-sm text-gray-500 dark:text-gray-400">No employee records yet.</p>
  }

  return (
    <Card className="overflow-x-auto !p-0">
      <table className="stack-table w-full text-left text-sm">
        <thead>
          <tr className="border-b border-black/5 text-xs uppercase tracking-wide text-gray-500 dark:border-white/10 dark:text-gray-400">
            <th className="py-3 pl-4 pr-4 font-medium">Employee</th>
            <th className="py-3 pr-4 font-medium">Position</th>
            <th className="py-3 pr-4 font-medium">Department</th>
            <th className="py-3 pr-4 font-medium">Team</th>
            <th className="py-3 pr-4 font-medium">Status</th>
            <th className="py-3 pr-4 font-medium">Date Hired</th>
            <th className="py-3 pr-4 font-medium">SIL Balance</th>
            <th className="py-3 pr-4 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {employees.map((employee) => (
            <EmployeeRow
              key={employee.id}
              employee={employee}
              departments={departments}
              teams={teams}
              onSaved={(updated) =>
                setEmployees((prev) => prev?.map((e) => (e.id === updated.id ? updated : e)) ?? null)
              }
            />
          ))}
        </tbody>
      </table>
    </Card>
  )
}

function DirectoryManagement() {
  const [departments, setDepartments] = useState<Department[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .get<{ departments: Department[]; teams: Team[] }>('/directory')
      .then((dir) => {
        setDepartments(dir.departments)
        setTeams(dir.teams)
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Something went wrong'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <LoadingState />
  if (error) return <ErrorState message={error} />

  return (
    <div>
      <div className="mb-4">
        <CreateTeamOrDepartment
          departments={departments}
          onCreated={(result) => {
            if (result.department) setDepartments((prev) => [...prev, result.department!])
            if (result.team) setTeams((prev) => [...prev, result.team!])
          }}
        />
      </div>

      <DirectoryMaintenance
        departments={departments}
        teams={teams}
        onDepartmentUpdated={(updated) =>
          setDepartments((prev) => prev.map((d) => (d.id === updated.id ? updated : d)))
        }
        onDepartmentDeleted={(id) => setDepartments((prev) => prev.filter((d) => d.id !== id))}
        onTeamUpdated={(updated) => setTeams((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))}
        onTeamDeleted={(id) => setTeams((prev) => prev.filter((t) => t.id !== id))}
      />
    </div>
  )
}

type HrisTab = 'profile' | 'employees' | 'directory'

export function HrisPage() {
  const { effectiveRoles } = useAuth()
  const canManage = effectiveRoles.some((r) => r === 'hr' || r === 'admin')
  const isAdmin = effectiveRoles.includes('admin')
  const [tab, setTab] = useState<HrisTab>('profile')

  const tabs: { key: HrisTab; label: string }[] = [
    { key: 'profile', label: 'My Profile' },
    ...(canManage ? [{ key: 'employees' as const, label: 'Employees' }] : []),
    ...(isAdmin ? [{ key: 'directory' as const, label: 'Departments & Teams' }] : []),
  ]

  return (
    <div>
      <PageHeader title="HRIS" />

      {tabs.length > 1 && (
        // Phones: equal-width tabs that share the row (a long label wraps
        // to two lines instead of the bar scrolling). md and up: compact
        // tabs at their natural width, as before.
        <div className="mb-4 grid auto-cols-fr grid-flow-col gap-1 border-b border-black/5 dark:border-white/10 md:flex">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center justify-center border-b-2 px-1.5 py-2 text-center text-sm font-medium leading-tight transition md:px-3 ${
                tab === t.key
                  ? 'border-brand-600 text-brand-700 dark:border-brand-400 dark:text-brand-400'
                  : 'border-transparent text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {tab === 'profile' && <MyProfile />}
      {tab === 'employees' && canManage && <EmployeeDirectory />}
      {tab === 'directory' && isAdmin && <DirectoryManagement />}
    </div>
  )
}
