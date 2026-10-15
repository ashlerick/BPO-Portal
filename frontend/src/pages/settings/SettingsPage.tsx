import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import { ROLE_LABELS } from '../../auth/types'
import { ErrorState, LoadingState } from '../../components/AsyncState'
import { api, ApiError } from '../../services/api'
import { Button } from '../../components/ui/Button'
import { PageHeader } from '../../components/ui/PageHeader'
import { Section, SectionStack } from '../../components/ui/Section'
import { useToast } from '../../components/ui/Toast'
import { useTheme } from '../../theme/ThemeContext'
import { ChangePasswordCard } from '../hris/HrisPage'

interface SettingsResponse {
  disabledNotifications: string[]
  notificationTypes: { key: string; label: string }[]
}

function NotificationPreferences() {
  const [settings, setSettings] = useState<SettingsResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api
      .get<SettingsResponse>('/settings')
      .then(setSettings)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Something went wrong'))
  }, [])

  async function toggle(key: string) {
    if (!settings) return
    const disabled = settings.disabledNotifications.includes(key)
      ? settings.disabledNotifications.filter((k) => k !== key)
      : [...settings.disabledNotifications, key]
    setSaving(true)
    setError(null)
    try {
      setSettings(await api.put<SettingsResponse>('/settings', { disabledNotifications: disabled }))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save your preferences')
    } finally {
      setSaving(false)
    }
  }

  if (error && !settings) return <ErrorState message={error} />
  if (!settings) return <LoadingState />

  return (
    <div>
      <p className="mb-3 text-sm text-gray-600 dark:text-gray-400">Choose which in-app notifications you get.</p>
      <ul className="space-y-1">
        {settings.notificationTypes.map((t) => {
          const on = !settings.disabledNotifications.includes(t.key)
          return (
            <li key={t.key}>
              <button
                type="button"
                role="switch"
                aria-checked={on}
                disabled={saving}
                onClick={() => toggle(t.key)}
                className="flex w-full items-center justify-between gap-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300"
              >
                {t.label}
                <span
                  className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors ${
                    on ? 'border-brand-500 bg-brand-600' : 'border-gray-300 bg-gray-200'
                  }`}
                >
                  <span
                    className={`absolute left-[3px] top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-white shadow transition-transform ${
                      on ? 'translate-x-5' : ''
                    }`}
                  />
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  )
}

interface ConnectedDevice {
  id: string
  name: string
  createdAt: string
  lastSeenAt: string | null
}

const deviceWhen = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' })

// PCs where the BPO Time desktop app is signed in as you. Disconnecting one
// signs the app out there at once.
function ConnectedDevices() {
  const toast = useToast()
  const [devices, setDevices] = useState<ConnectedDevice[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .get<ConnectedDevice[]>('/hr/devices')
      .then(setDevices)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load your devices'))
  }, [])

  async function disconnect(d: ConnectedDevice) {
    if (!window.confirm(`Disconnect ${d.name}? The desktop app on that PC will be signed out.`)) return
    try {
      await api.delete(`/hr/devices/${d.id}`)
      setDevices((prev) => prev?.filter((x) => x.id !== d.id) ?? prev)
      toast.success(`${d.name} disconnected`)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not disconnect that PC')
    }
  }

  if (error) return <ErrorState message={error} />
  if (!devices) return <LoadingState />

  return (
    <div>
      <p className="mb-3 text-sm text-gray-600 dark:text-gray-400">
        PCs where the BPO Time desktop app is signed in as you. Press <strong>Launch App (BETA)</strong> at the
        top of the portal to connect one.
      </p>
      {devices.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">No PC is connected yet.</p>
      ) : (
        <ul className="divide-y divide-black/5 text-sm dark:divide-white/10">
          {devices.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <span>
                <span className="font-medium text-gray-900 dark:text-gray-100">{d.name}</span>
                <span className="block text-xs text-gray-500 dark:text-gray-400">
                  Connected {deviceWhen.format(new Date(d.createdAt))}
                  {d.lastSeenAt ? ` · last seen ${deviceWhen.format(new Date(d.lastSeenAt))}` : ''}
                </span>
              </span>
              <Button size="sm" onClick={() => disconnect(d)}>
                Disconnect
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function SettingsPage() {
  const { user } = useAuth()
  const { theme, toggleTheme } = useTheme()

  return (
    <div>
      <PageHeader title="Settings" />

      <SectionStack>
        <Section id="settings.account" title="Account settings" defaultOpen>
          <dl className="grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs text-gray-500 dark:text-gray-400">Name</dt>
              <dd className="text-gray-900 dark:text-gray-100">{user?.name ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500 dark:text-gray-400">Email</dt>
              <dd className="break-words text-gray-900 dark:text-gray-100">{user?.email}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500 dark:text-gray-400">Roles</dt>
              <dd className="text-gray-900 dark:text-gray-100">
                {user?.roles.map((r) => ROLE_LABELS[r]).join(', ')}
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
            Name, email and roles are managed by an administrator.
          </p>
        </Section>

        <Section id="settings.security" title="Password / security">
          <ChangePasswordCard />
        </Section>

        <Section id="settings.notifications" title="Notification preferences">
          <NotificationPreferences />
        </Section>

        <Section id="settings.devices" title="Desktop app" hint="Connected PCs">
          <ConnectedDevices />
        </Section>

        <Section id="settings.appearance" title="Dark / light mode" hint={theme === 'dark' ? 'Dark' : 'Light'}>
          <Button onClick={toggleTheme}>{theme === 'dark' ? '☀️ Switch to light mode' : '🌙 Switch to dark mode'}</Button>
        </Section>

        <Section id="settings.profile" title="Profile settings">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Update your contact details and emergency contact on{' '}
            <Link to="/profile" className="font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400">
              My Profile
            </Link>
            .
          </p>
        </Section>
      </SectionStack>
    </div>
  )
}
