import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import { ErrorState, LoadingState } from '../../components/AsyncState'
import { useApiData } from '../../hooks/useApiData'
import { Card } from '../../components/ui/Card'
import { ROLE_LABELS } from '../../auth/types'
import type { Announcement } from '../announcements/types'
import { AdminWidgets } from './AdminWidgets'
import { CheckInPrompt } from './CheckInPrompt'

const quickLinks = [
  { to: '/announcements', label: 'Announcements' },
  { to: '/benefits', label: 'Benefits' },
  { to: '/hris', label: 'HRIS' },
  { to: '/reports', label: 'Weekly Reports' },
  { to: '/leave', label: 'Leave Requests' },
  { to: '/documents', label: 'Documents' },
]

export function DashboardPage() {
  const { user } = useAuth()
  const { data, loading, error } = useApiData<Announcement[]>('/announcements')
  const latest = data?.slice(0, 3) ?? []

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-gold-600 dark:text-gold-400">
        Welcome{user?.firstName ? `, ${user.firstName}` : ''}
      </h1>
      {user && (
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {user.roles.map((role) => ROLE_LABELS[role]).join(', ')}
        </p>
      )}

      {user?.roles.includes('admin') && <AdminWidgets />}

      <div className="mt-6">
        <CheckInPrompt />
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-3">
        <section className="md:col-span-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            Latest Announcements
          </h2>

          {loading && <LoadingState />}
          {error && <ErrorState message={error} />}
          {data && latest.length === 0 && (
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Nothing posted yet.</p>
          )}

          {latest.length > 0 && (
            <ul className="mt-2 space-y-3">
              {latest.map((announcement) => (
                <li key={announcement.id}>
                  <Card>
                    <h3 className="font-medium text-gray-900 dark:text-gray-100">{announcement.title}</h3>
                    <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{announcement.content}</p>
                  </Card>
                </li>
              ))}
            </ul>
          )}

          {data && data.length > 0 && (
            <Link
              to="/announcements"
              className="mt-3 inline-block text-sm font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400"
            >
              View all announcements →
            </Link>
          )}
        </section>

        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            Quick Links
          </h2>
          <ul className="mt-2 grid grid-cols-2 gap-2 md:block md:space-y-2">
            {quickLinks.map((link) => (
              <li key={link.to}>
                <Link
                  to={link.to}
                  className="block rounded-lg border border-black/5 bg-white/70 px-4 py-2 text-sm font-medium text-gray-700 shadow-sm backdrop-blur-sm transition hover:border-brand-300 hover:bg-white hover:text-brand-700 dark:border-white/10 dark:bg-white/[0.035] dark:text-gray-300 dark:hover:border-brand-700 dark:hover:bg-white/[0.07] dark:hover:text-brand-400"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}
