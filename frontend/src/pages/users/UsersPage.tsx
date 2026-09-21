import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../../auth/AuthContext'
import { ROLE_LABELS, type Role } from '../../auth/types'
import { ErrorState, LoadingState } from '../../components/AsyncState'
import { api, ApiError } from '../../services/api'
import { Card, CardForm } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { PageHeader } from '../../components/ui/PageHeader'
import type { ManagedUser } from './types'
import type { Department, Team } from '../hris/types'

const ALL_ROLES: Role[] = ['employee', 'team_leader', 'manager', 'hr', 'admin']

function RoleCheckboxes({
  selected,
  onChange,
}: {
  selected: Role[]
  onChange: (roles: Role[]) => void
}) {
  function toggle(role: Role) {
    onChange(selected.includes(role) ? selected.filter((r) => r !== role) : [...selected, role])
  }

  return (
    <div className="flex flex-wrap gap-3">
      {ALL_ROLES.map((role) => (
        <label key={role} className="flex items-center gap-1 text-sm text-gray-700 dark:text-gray-300">
          <input type="checkbox" checked={selected.includes(role)} onChange={() => toggle(role)} />
          {ROLE_LABELS[role]}
        </label>
      ))}
    </div>
  )
}

function CreateUserForm({ onCreated }: { onCreated: (user: ManagedUser) => void }) {
  const { guardedAction } = useAuth()
  const [email, setEmail] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [middleName, setMiddleName] = useState('')
  const [roles, setRoles] = useState<Role[]>(['employee'])
  const [position, setPosition] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [teamId, setTeamId] = useState('')
  const [departments, setDepartments] = useState<Department[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    api
      .get<{ departments: Department[]; teams: Team[] }>('/directory')
      .then(({ departments, teams }) => {
        setDepartments(departments)
        setTeams(teams)
      })
      .catch(() => {})
  }, [])

  const teamsInDepartment = teams.filter((t) => t.departmentId === departmentId)

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    if (roles.length === 0) {
      setError('Select at least one role')
      return
    }

    guardedAction(['admin'], async () => {
      setSubmitting(true)
      try {
        const created = await api.post<ManagedUser>('/users', {
          email,
          firstName,
          lastName,
          middleName: middleName || undefined,
          roles,
          position: position || undefined,
          departmentId: departmentId || undefined,
          teamId: teamId || undefined,
        })
        onCreated(created)
        setSuccess(`Account created — a setup link was emailed to ${created.email}.`)
        setEmail('')
        setFirstName('')
        setLastName('')
        setMiddleName('')
        setRoles(['employee'])
        setPosition('')
        setDepartmentId('')
        setTeamId('')
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Could not create the account')
      } finally {
        setSubmitting(false)
      }
    })
  }

  return (
    <CardForm onSubmit={handleSubmit} className="space-y-4" autoComplete="off">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor="new-email" className="text-sm text-gray-600 dark:text-gray-400">
            Email
          </label>
          <input
            id="new-email"
            type="email"
            required
            autoComplete="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="field"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="new-first-name" className="text-sm text-gray-600 dark:text-gray-400">
            First Name
          </label>
          <input
            id="new-first-name"
            required
            autoComplete="off"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            className="field"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="new-last-name" className="text-sm text-gray-600 dark:text-gray-400">
            Last Name
          </label>
          <input
            id="new-last-name"
            required
            autoComplete="off"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            className="field"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="new-middle-name" className="text-sm text-gray-600 dark:text-gray-400">
            Middle Name <span className="text-gray-400 dark:text-gray-500">(optional)</span>
          </label>
          <input
            id="new-middle-name"
            autoComplete="off"
            value={middleName}
            onChange={(e) => setMiddleName(e.target.value)}
            className="field"
          />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <label htmlFor="new-position" className="text-sm text-gray-600 dark:text-gray-400">
            Position <span className="text-gray-400 dark:text-gray-500">(optional)</span>
          </label>
          <input id="new-position" value={position} onChange={(e) => setPosition(e.target.value)} className="field" />
        </div>
        <div className="space-y-1">
          <label htmlFor="new-department" className="text-sm text-gray-600 dark:text-gray-400">
            Department <span className="text-gray-400 dark:text-gray-500">(optional)</span>
          </label>
          <select
            id="new-department"
            value={departmentId}
            onChange={(e) => {
              setDepartmentId(e.target.value)
              setTeamId('')
            }}
            className="field"
          >
            <option value="">—</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="new-team" className="text-sm text-gray-600 dark:text-gray-400">
            Team <span className="text-gray-400 dark:text-gray-500">(optional)</span>
          </label>
          <select
            id="new-team"
            value={teamId}
            onChange={(e) => setTeamId(e.target.value)}
            disabled={!departmentId}
            className="field disabled:opacity-50"
          >
            <option value="">—</option>
            {teamsInDepartment.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="space-y-1">
        <span className="text-sm text-gray-600 dark:text-gray-400">Roles</span>
        <RoleCheckboxes selected={roles} onChange={setRoles} />
      </div>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {success && <p className="text-sm text-brand-700 dark:text-brand-400">{success}</p>}
      <Button type="submit" variant="primary" disabled={submitting}>
        {submitting ? 'Creating…' : 'Create account'}
      </Button>
    </CardForm>
  )
}

function UserRow({
  user,
  onSaved,
  onDeleted,
}: {
  user: ManagedUser
  onSaved: (user: ManagedUser) => void
  onDeleted: (id: string) => void
}) {
  const { guardedAction, user: currentUser } = useAuth()
  const [editing, setEditing] = useState(false)
  const [email, setEmail] = useState(user.email)
  const [firstName, setFirstName] = useState(user.firstName)
  const [lastName, setLastName] = useState(user.lastName)
  const [middleName, setMiddleName] = useState(user.middleName ?? '')
  const [roles, setRoles] = useState<Role[]>(user.roles)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sendingReset, setSendingReset] = useState(false)
  const [resetMessage, setResetMessage] = useState<string | null>(null)
  const [resetError, setResetError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const isSelf = user.id === currentUser?.id

  function remove() {
    if (!window.confirm(`Delete ${user.name}'s account? This cannot be undone.`)) return
    setDeleteError(null)

    guardedAction(['admin'], async () => {
      setDeleting(true)
      try {
        await api.delete(`/users/${user.id}`)
        onDeleted(user.id)
      } catch (err) {
        setDeleteError(err instanceof ApiError ? err.message : 'Could not delete this account')
        setDeleting(false)
      }
    })
  }

  function sendResetLink() {
    setResetError(null)
    setResetMessage(null)

    guardedAction(['admin'], async () => {
      setSendingReset(true)
      try {
        const { message } = await api.post<{ message: string }>('/auth/admin-reset-password', {
          userId: user.id,
        })
        setResetMessage(message)
      } catch (err) {
        setResetError(err instanceof ApiError ? err.message : 'Could not send the reset link')
      } finally {
        setSendingReset(false)
      }
    })
  }

  const nameDirty =
    firstName !== user.firstName || lastName !== user.lastName || middleName !== (user.middleName ?? '')
  const emailDirty = email !== user.email
  const rolesDirty = JSON.stringify([...roles].sort()) !== JSON.stringify([...user.roles].sort())
  const dirty = nameDirty || emailDirty || rolesDirty

  function startEditing() {
    setEmail(user.email)
    setFirstName(user.firstName)
    setLastName(user.lastName)
    setMiddleName(user.middleName ?? '')
    setRoles(user.roles)
    setError(null)
    setEditing(true)
  }

  function cancel() {
    setError(null)
    setEditing(false)
  }

  function save() {
    if (roles.length === 0) {
      setError('Select at least one role')
      return
    }

    guardedAction(['admin'], async () => {
      setSaving(true)
      setError(null)
      try {
        // Only the fields that actually changed are sent, so the audit
        // trail records specifically what happened (a name edit and a
        // role change are logged as separate entries server-side).
        const payload: {
          roles?: Role[]
          email?: string
          firstName?: string
          lastName?: string
          middleName?: string | null
        } = {}
        if (rolesDirty) payload.roles = roles
        if (emailDirty) payload.email = email
        if (nameDirty) {
          payload.firstName = firstName
          payload.lastName = lastName
          payload.middleName = middleName || null
        }
        const updated = await api.put<ManagedUser>(`/users/${user.id}`, payload)
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
      <tr className="border-b border-black/5 align-top transition-colors last:border-0 hover:bg-black/[0.02] dark:border-white/5 dark:hover:bg-white/[0.03]">
        <td data-primary className="py-2.5 pl-4 pr-4">
          <div className="font-medium text-gray-900 dark:text-gray-100">{user.name}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400">{user.email}</div>
          {!user.passwordSet && (
            <Badge tone="amber" className="mt-1">
              Setup pending
            </Badge>
          )}
        </td>
        <td data-label="Roles" className="py-2.5 pr-4 text-sm text-gray-600 dark:text-gray-400">
          {user.roles.map((r) => ROLE_LABELS[r]).join(', ')}
        </td>
        <td data-actions className="py-2.5 pr-4">
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" onClick={startEditing}>
              Edit
            </Button>
            <Button size="sm" onClick={sendResetLink} disabled={sendingReset}>
              {sendingReset ? 'Sending…' : 'Send reset link'}
            </Button>
            {!isSelf && (
              <Button size="sm" variant="danger" onClick={remove} disabled={deleting}>
                {deleting ? 'Deleting…' : 'Delete'}
              </Button>
            )}
          </div>
          {resetMessage && <p className="mt-1 text-xs text-brand-700 dark:text-brand-400">{resetMessage}</p>}
          {resetError && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{resetError}</p>}
          {deleteError && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{deleteError}</p>}
        </td>
      </tr>
    )
  }

  return (
    <tr className="border-b border-black/5 align-top dark:border-white/5">
      <td data-primary className="py-2.5 pl-4 pr-4">
        {/* Visible labels on phones only: once a field is filled in its
            placeholder is gone, and in the stacked card layout there's no
            column header above it to say which field it is. */}
        <div className="space-y-1">
          <label className="block">
            <span className="text-xs text-gray-500 md:sr-only dark:text-gray-400">Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              autoComplete="off"
              className="field py-1"
            />
          </label>
          <label className="block">
            <span className="text-xs text-gray-500 md:sr-only dark:text-gray-400">First name</span>
            <input
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="First name"
              autoComplete="off"
              className="field py-1"
            />
          </label>
          <label className="block">
            <span className="text-xs text-gray-500 md:sr-only dark:text-gray-400">Last name</span>
            <input
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Last name"
              autoComplete="off"
              className="field py-1"
            />
          </label>
          <label className="block">
            <span className="text-xs text-gray-500 md:sr-only dark:text-gray-400">Middle name (optional)</span>
            <input
              autoComplete="off"
              value={middleName}
              onChange={(e) => setMiddleName(e.target.value)}
              placeholder="Middle name (optional)"
              className="field py-1"
            />
          </label>
        </div>
      </td>
      <td data-label="Roles" className="py-2.5 pr-4">
        <RoleCheckboxes selected={roles} onChange={setRoles} />
        {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
      </td>
      <td data-actions className="py-2.5 pr-4">
        <div className="flex gap-1.5">
          <Button size="sm" variant="primary" onClick={save} disabled={!dirty || saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
          <Button size="sm" onClick={cancel} disabled={saving}>
            Cancel
          </Button>
        </div>
      </td>
    </tr>
  )
}

export function UsersPage() {
  const [users, setUsers] = useState<ManagedUser[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .get<ManagedUser[]>('/users')
      .then(setUsers)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Something went wrong'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div>
      <PageHeader title="Users" />

      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          Create Account
        </h2>
        <div className="mt-2">
          <CreateUserForm onCreated={(u) => setUsers((prev) => (prev ? [...prev, u] : [u]))} />
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          All Users
        </h2>
        <div className="mt-2">
          {loading && <LoadingState />}
          {error && <ErrorState message={error} />}
          {users && (
            <Card className="overflow-x-auto !p-0">
              <table className="stack-table w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-black/5 text-xs uppercase tracking-wide text-gray-500 dark:border-white/10 dark:text-gray-400">
                    <th className="py-3 pl-4 pr-4 font-medium">User</th>
                    <th className="py-3 pr-4 font-medium">Roles</th>
                    <th className="py-3 pr-4 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <UserRow
                      key={u.id}
                      user={u}
                      onSaved={(updated) =>
                        setUsers((prev) => prev?.map((x) => (x.id === updated.id ? updated : x)) ?? null)
                      }
                      onDeleted={(id) => setUsers((prev) => prev?.filter((x) => x.id !== id) ?? null)}
                    />
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </div>
      </section>
    </div>
  )
}
