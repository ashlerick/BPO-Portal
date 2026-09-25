import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import { ROLE_LABELS } from '../../auth/types'
import { ErrorState, LoadingState } from '../../components/AsyncState'
import { api, ApiError } from '../../services/api'
import { Button } from '../../components/ui/Button'
import { PageHeader } from '../../components/ui/PageHeader'
import { Section, SectionStack } from '../../components/ui/Section'
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
