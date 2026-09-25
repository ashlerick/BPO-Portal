import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import { ErrorState, LoadingState } from '../../components/AsyncState'
import { useApiData } from '../../hooks/useApiData'
import { api } from '../../services/api'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Section, SectionStack } from '../../components/ui/Section'
import { ROLE_LABELS } from '../../auth/types'
import { formatDateOnly, todayInManilaIso } from '../../utils/dates'
import { isExpired, type Announcement } from '../announcements/types'
import type { CalendarEventRecord } from '../calendar/types'
import type { EmployeeRecord, MyEmployeeProfile } from '../hris/types'
import type { LeaveRequest } from '../leave/types'
import type { NotificationsResponse } from '../notifications/types'
import type { WeeklyReport } from '../reports/types'
import { AdminWidgets } from './AdminWidgets'
import { CheckInPrompt } from './CheckInPrompt'

const quickLinks = [
  { to: '/announcements', label: 'Announcements' },
  { to: '/attendance', label: 'Attendance' },
  { to: '/leave', label: 'Leave Requests' },
  { to: '/documents', label: 'Documents' },
  { to: '/reports', label: 'Weekly Reports', roles: ['team_leader', 'manager', 'hr', 'admin'] as const },
  { to: '/benefits', label: 'Benefits' },
  { to: '/calendar', label: 'Calendar' },
  { to: '/profile', label: 'My Profile' },
]

const timeFmt = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' })

interface PendingTask {
  key: string
  label: string
  to: string
}

// Everything the sections below need, loaded once. Each source is
// best-effort: a role that can't read one (e.g. reports for a plain
// employee) just contributes nothing rather than failing the page.
function useDashboardData(isReviewer: boolean, isElevated: boolean) {
  const [leave, setLeave] = useState<LeaveRequest[]>([])
  const [reports, setReports] = useState<WeeklyReport[]>([])
  const [events, setEvents] = useState<CalendarEventRecord[]>([])
  const [notifications, setNotifications] = useState<NotificationsResponse | null>(null)
  const [profile, setProfile] = useState<MyEmployeeProfile | null>(null)
  const [employees, setEmployees] = useState<EmployeeRecord[]>([])

  useEffect(() => {
    api.get<LeaveRequest[]>('/leave/requests').then(setLeave).catch(() => undefined)
    api.get<CalendarEventRecord[]>('/calendar').then(setEvents).catch(() => undefined)
    api.get<NotificationsResponse>('/notifications').then(setNotifications).catch(() => undefined)
    api.get<MyEmployeeProfile>('/employees/me').then(setProfile).catch(() => undefined)
    api.get<WeeklyReport[]>('/reports').then(setReports).catch(() => undefined)
    if (isReviewer) api.get<EmployeeRecord[]>('/employees').then(setEmployees).catch(() => undefined)
  }, [isReviewer, isElevated])

  return { leave, reports, events, notifications, profile, employees }
}

export function DashboardPage() {
  const { user, effectiveRoles, attendanceStatus } = useAuth()
  const isReviewer = effectiveRoles.some((r) => r === 'hr' || r === 'admin')
  const isElevated = effectiveRoles.some((r) => r === 'team_leader' || r === 'manager' || r === 'hr' || r === 'admin')
  const { data, loading, error } = useApiData<Announcement[]>('/announcements')
  const { leave, reports, events, notifications, profile, employees } = useDashboardData(isReviewer, isElevated)

  const latest = data?.filter((a) => a.published && !isExpired(a)).slice(0, 3) ?? []

  // Pending tasks: things waiting on *this* person.
  const tasks: PendingTask[] = []
  const pendingLeave = leave.filter((r) => r.status === 'pending')
  if (isReviewer && pendingLeave.length > 0) {
    tasks.push({
      key: 'leave-review',
      label: `${pendingLeave.length} leave request${pendingLeave.length === 1 ? '' : 's'} waiting for your review`,
      to: '/leave',
    })
  }
  const submittedReports = reports.filter((r) => r.status === 'submitted' || r.status === 'reviewed')
  if (effectiveRoles.some((r) => r === 'manager' || r === 'hr' || r === 'admin') && submittedReports.length > 0) {
    tasks.push({
      key: 'report-review',
      label: `${submittedReports.length} weekly report${submittedReports.length === 1 ? '' : 's'} to review`,
      to: '/reports',
    })
  }
  const myOpenReports = reports.filter((r) => r.status === 'draft' || r.status === 'rejected')
  if (myOpenReports.length > 0) {
    tasks.push({
      key: 'report-open',
      label: `${myOpenReports.length} weekly report${myOpenReports.length === 1 ? '' : 's'} still to submit`,
      to: '/reports',
    })
  }
  if (attendanceStatus && !attendanceStatus.checkedIn && attendanceStatus.status !== 'absent') {
    tasks.push({ key: 'check-in', label: "You haven't checked in today", to: '/attendance' })
  }

  // Reminders: calendar items in the next 14 days.
  const today = todayInManilaIso()
  const horizon = new Date(`${today}T00:00:00Z`)
  horizon.setUTCDate(horizon.getUTCDate() + 14)
  const horizonIso = horizon.toISOString().slice(0, 10)
  const reminders = events.filter((e) => {
    const start = e.startDate.slice(0, 10)
    const end = (e.endDate ?? e.startDate).slice(0, 10)
    return end >= today && start <= horizonIso
  })

  const recentNotifications = notifications?.items.slice(0, 5) ?? []
  const pendingSelf = leave.filter((r) => r.status === 'pending')

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

      <div className="mt-6">
        <CheckInPrompt />
      </div>

      <SectionStack>
        <Section
          id="dashboard.tasks"
          title="Pending tasks"
          hint={tasks.length === 0 ? 'Nothing waiting' : `${tasks.length} waiting`}
          aside={tasks.length > 0 ? <Badge tone="amber">{tasks.length}</Badge> : undefined}
          defaultOpen
        >
          {tasks.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">You're all caught up.</p>
          ) : (
            <ul className="divide-y divide-black/5 text-sm dark:divide-white/10">
              {tasks.map((t) => (
                <li key={t.key}>
                  <Link
                    to={t.to}
                    className="flex items-center justify-between gap-3 py-2 text-gray-800 hover:text-brand-700 dark:text-gray-200 dark:hover:text-brand-400"
                  >
                    {t.label}
                    <span aria-hidden="true">→</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section
          id="dashboard.announcements"
          title="Company announcements"
          hint="Latest"
          defaultOpen
        >
          {loading && <LoadingState />}
          {error && <ErrorState message={error} />}
          {data && latest.length === 0 && (
            <p className="text-sm text-gray-500 dark:text-gray-400">Nothing posted yet.</p>
          )}
          {latest.length > 0 && (
            <ul className="space-y-3">
              {latest.map((announcement) => (
                <li key={announcement.id}>
                  <Card>
                    <div className="text-xs text-gray-500 dark:text-gray-400">{announcement.category}</div>
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
        </Section>

        <Section
          id="dashboard.notifications"
          title="Notifications"
          hint={notifications ? `${notifications.unread} unread` : undefined}
          aside={notifications && notifications.unread > 0 ? <Badge tone="blue">{notifications.unread}</Badge> : undefined}
        >
          {recentNotifications.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">No notifications yet.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {recentNotifications.map((n) => (
                <li key={n.id} className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className={n.readAt ? 'text-gray-500 dark:text-gray-400' : 'font-medium text-gray-900 dark:text-gray-100'}>
                    {n.title}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">{timeFmt.format(new Date(n.createdAt))}</span>
                </li>
              ))}
            </ul>
          )}
          <Link
            to="/notifications"
            className="mt-3 inline-block text-sm font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400"
          >
            See all notifications →
          </Link>
        </Section>

        <Section
          id="dashboard.reminders"
          title="Important reminders"
          hint="Next 14 days"
          aside={reminders.length > 0 ? <Badge tone="amber">{reminders.length}</Badge> : undefined}
        >
          {reminders.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">No holidays, events or deadlines coming up.</p>
          ) : (
            <ul className="divide-y divide-black/5 text-sm dark:divide-white/10">
              {reminders.map((e) => (
                <li key={e.id} className="flex flex-wrap justify-between gap-2 py-2">
                  <span className="text-gray-900 dark:text-gray-100">{e.title}</span>
                  <span className="text-gray-500 dark:text-gray-400">{formatDateOnly(e.startDate)}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section id="dashboard.links" title="Quick links">
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {quickLinks
              .filter((l) => !l.roles || l.roles.some((r) => effectiveRoles.includes(r)))
              .map((link) => (
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
        </Section>

        <Section
          id="dashboard.overview"
          title={isReviewer ? 'Employee / team overview' : isElevated ? 'Team overview' : 'My overview'}
          defaultOpen
        >
          <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            {profile && (
              <>
                <div>
                  <dt className="text-gray-500 dark:text-gray-400">Position</dt>
                  <dd className="font-medium text-gray-900 dark:text-gray-100">{profile.position ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-gray-500 dark:text-gray-400">Team</dt>
                  <dd className="font-medium text-gray-900 dark:text-gray-100">{profile.team ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-gray-500 dark:text-gray-400">SIL balance</dt>
                  <dd className="font-medium text-gray-900 dark:text-gray-100">{profile.silBalance} days</dd>
                </div>
              </>
            )}
            <div>
              <dt className="text-gray-500 dark:text-gray-400">{isReviewer ? 'Pending leave (all)' : 'My pending leave'}</dt>
              <dd className="font-medium text-gray-900 dark:text-gray-100">{pendingSelf.length}</dd>
            </div>
            {isReviewer && (
              <div>
                <dt className="text-gray-500 dark:text-gray-400">Employees on record</dt>
                <dd className="font-medium text-gray-900 dark:text-gray-100">{employees.length}</dd>
              </div>
            )}
          </dl>
          {user?.roles.includes('admin') && <AdminWidgets />}
        </Section>
      </SectionStack>
    </div>
  )
}
