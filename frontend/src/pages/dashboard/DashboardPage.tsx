import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import { ErrorState, LoadingState } from '../../components/AsyncState'
import { useApiData } from '../../hooks/useApiData'
import { api } from '../../services/api'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { ROLE_LABELS } from '../../auth/types'
import { formatDateOnly, formatManilaTime, todayInManilaIso } from '../../utils/dates'
import { shiftHours } from '../../utils/shiftTime'
import { isExpired, type Announcement } from '../announcements/types'
import type { AttendanceRecord } from '../attendance/types'
import type { CalendarEventRecord } from '../calendar/types'
import type { EmployeeRecord, MyEmployeeProfile } from '../hris/types'
import type { LeaveRequest } from '../leave/types'
import type { NotificationsResponse } from '../notifications/types'
import type { WeeklyReport } from '../reports/types'
import { HolidayBanner } from '../../components/ui/HolidayBanner'
import { useTodayHoliday } from '../../hooks/useTodayHoliday'
import { AdminWidgets } from './AdminWidgets'
import { AssignedByMe, AssignTodo, MyTodos } from './Todos'

const timeFmt = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' })

interface PendingTask {
  key: string
  label: string
  to: string
}

interface TodoCount {
  status: 'open' | 'done'
  dueDate: string | null
}

interface ScheduleResponse {
  current: { shift: { name: string; startTime: string; endTime: string; timezone: string } } | null
}

// Everything the page needs, loaded once. Each source is best-effort: a role that can't read one (reports for a plain employee,
// the employee list for anyone but HR) just contributes nothing rather than failing the page.
function useDashboardData(isReviewer: boolean, isElevated: boolean) {
  const [leave, setLeave] = useState<LeaveRequest[]>([])
  const [reports, setReports] = useState<WeeklyReport[]>([])
  const [events, setEvents] = useState<CalendarEventRecord[]>([])
  const [notifications, setNotifications] = useState<NotificationsResponse | null>(null)
  const [profile, setProfile] = useState<MyEmployeeProfile | null>(null)
  const [employees, setEmployees] = useState<EmployeeRecord[]>([])
  const [teamCount, setTeamCount] = useState<number | null>(null)
  const [clockedIn, setClockedIn] = useState<number | null>(null)
  const [todos, setTodos] = useState<TodoCount[]>([])
  const [shift, setShift] = useState<ScheduleResponse['current']>(null)

  useEffect(() => {
    const today = todayInManilaIso()
    api.get<LeaveRequest[]>('/leave/requests').then(setLeave).catch(() => undefined)
    api.get<CalendarEventRecord[]>('/calendar').then(setEvents).catch(() => undefined)
    api.get<NotificationsResponse>('/notifications').then(setNotifications).catch(() => undefined)
    api.get<MyEmployeeProfile>('/employees/me').then(setProfile).catch(() => undefined)
    api.get<WeeklyReport[]>('/reports').then(setReports).catch(() => undefined)
    api.get<TodoCount[]>('/hr/todos').then(setTodos).catch(() => undefined)
    api.get<ScheduleResponse>('/hr/shifts?kind=schedule').then((s) => setShift(s.current)).catch(() => undefined)
    if (isReviewer) {
      api.get<EmployeeRecord[]>('/employees').then(setEmployees).catch(() => undefined)
      api.get<{ teams: { id: string }[] }>('/directory').then((d) => setTeamCount(d.teams.length)).catch(() => undefined)
      api
        .get<AttendanceRecord[]>(`/leave/attendance?from=${today}&to=${today}`)
        .then((rows) => setClockedIn(rows.filter((r) => r.status === 'present' && r.checkInAt && !r.checkOutAt).length))
        .catch(() => undefined)
    }
  }, [isReviewer, isElevated])

  return { leave, reports, events, notifications, profile, employees, teamCount, clockedIn, todos, shift }
}

function Tile({ label, value, sub, tone, to, onClick }: { label: string; value: ReactNode; sub: string; tone?: 'red'; to?: string; onClick?: () => void }) {
  const className =
    'block rounded-xl border border-black/5 bg-white/80 px-3.5 py-3 text-left shadow-sm transition hover:border-brand-500 dark:border-white/10 dark:bg-white/[0.035]'
  const body = (
    <>
      <span className="block text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</span>
      <span className={`block text-2xl font-semibold tabular-nums ${tone === 'red' ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-gray-100'}`}>{value}</span>
      <span className="block text-xs text-gray-500 dark:text-gray-400">{sub}</span>
    </>
  )
  return to ? (
    <Link to={to} className={className}>
      {body}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={`${className} w-full`}>
      {body}
    </button>
  )
}

// A card with a title, an optional link to the full page, and rows underneath.
function Panel({ title, linkTo, linkLabel, children }: { title: string; linkTo?: string; linkLabel?: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-black/5 bg-white/80 shadow-sm dark:border-white/10 dark:bg-white/[0.035]">
      <header className="flex items-center justify-between gap-3 border-b border-black/5 px-4 py-3 dark:border-white/10">
        <h2 className="text-[15px] font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
        {linkTo && (
          <Link to={linkTo} className="text-xs font-semibold text-brand-600 hover:underline dark:text-brand-400">
            {linkLabel} →
          </Link>
        )}
      </header>
      <div>{children}</div>
    </section>
  )
}

const rowClass = 'flex items-start gap-3 border-b border-black/5 px-4 py-2.5 last:border-0 dark:border-white/10'

export function DashboardPage() {
  const { user, effectiveRoles, attendanceStatus } = useAuth()
  const isReviewer = effectiveRoles.some((r) => r === 'hr' || r === 'admin')
  const isElevated = effectiveRoles.some((r) => r === 'team_leader' || r === 'manager' || r === 'hr' || r === 'admin')
  const { data, loading, error } = useApiData<Announcement[]>('/announcements')
  const { leave, reports, events, notifications, profile, employees, teamCount, clockedIn, todos, shift } = useDashboardData(isReviewer, isElevated)
  const [todoReload, setTodoReload] = useState(0)
  const [assigning, setAssigning] = useState(false)
  const holiday = useTodayHoliday()
  const today = todayInManilaIso()

  // Highlighted announcements first, then the newest.
  const latest = (data?.filter((a) => a.published && !isExpired(a)) ?? []).sort((a, b) => Number(!!b.featured) - Number(!!a.featured)).slice(0, 3)

  // Things waiting on this person, shown as a bar each under the greeting. Nothing shows when nothing is waiting.
  const tasks: PendingTask[] = []
  const pendingLeave = leave.filter((r) => r.status === 'pending')
  if (isReviewer && pendingLeave.length > 0) {
    tasks.push({ key: 'leave-review', label: `${pendingLeave.length} leave request${pendingLeave.length === 1 ? '' : 's'} waiting for your review`, to: '/leave' })
  }
  const submittedReports = reports.filter((r) => r.status === 'submitted' || r.status === 'reviewed')
  if (effectiveRoles.some((r) => r === 'manager' || r === 'hr' || r === 'admin') && submittedReports.length > 0) {
    tasks.push({ key: 'report-review', label: `${submittedReports.length} weekly report${submittedReports.length === 1 ? '' : 's'} to review`, to: '/reports' })
  }
  const myOpenReports = reports.filter((r) => r.status === 'draft' || r.status === 'rejected')
  if (myOpenReports.length > 0) {
    tasks.push({ key: 'report-open', label: `${myOpenReports.length} weekly report${myOpenReports.length === 1 ? '' : 's'} still to submit`, to: '/reports' })
  }
  if (attendanceStatus && !attendanceStatus.checkedIn && attendanceStatus.status !== 'absent') {
    tasks.push({ key: 'check-in', label: "You haven't clocked in today. Use the BPO Time app.", to: '/my-time' })
  }

  // Coming up: calendar items in the next 14 days.
  const horizon = new Date(`${today}T00:00:00Z`)
  horizon.setUTCDate(horizon.getUTCDate() + 14)
  const horizonIso = horizon.toISOString().slice(0, 10)
  const reminders = events
    .filter((e) => !e.disabled)
    .filter((e) => {
      const start = e.startDate.slice(0, 10)
      const end = (e.endDate ?? e.startDate).slice(0, 10)
      return end >= today && start <= horizonIso
    })

  const recentNotifications = notifications?.items.slice(0, 5) ?? []
  const openTodos = todos.filter((t) => t.status === 'open')
  const overdueTodos = openTodos.filter((t) => t.dueDate !== null && t.dueDate.slice(0, 10) < today)

  const clock =
    attendanceStatus?.checkedIn && !attendanceStatus.checkOutAt
      ? { dot: 'bg-emerald-500', text: 'Clocked in', sub: `since ${formatManilaTime(attendanceStatus.checkInAt)}` }
      : attendanceStatus?.checkedOut
        ? { dot: 'bg-gray-400', text: 'Clocked out', sub: `at ${formatManilaTime(attendanceStatus.checkOutAt)}` }
        : { dot: 'bg-gray-400', text: 'Not clocked in', sub: 'today' }
  const subtitle = [user?.roles.map((role) => ROLE_LABELS[role]).join(', '), profile?.position, profile?.team].filter(Boolean).join(' · ')

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-gold-600 dark:text-gold-400">Welcome{user?.firstName ? `, ${user.firstName}` : ''}</h1>
          {subtitle && <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-black/5 bg-white/80 px-4 py-2.5 shadow-sm dark:border-white/10 dark:bg-white/[0.035]">
          <div>
            <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
              <span className={`h-2 w-2 rounded-full ${clock.dot}`} />
              {clock.text}
            </span>
            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{clock.sub}</span>
          </div>
          {shift && (
            <div>
              <span className="block text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">Shift</span>
              <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{shiftHours(shift.shift, today)}</span>
            </div>
          )}
          <Link to="/my-time" className="text-xs font-semibold text-brand-600 hover:underline dark:text-brand-400">
            My Time →
          </Link>
        </div>
      </div>

      {holiday && <HolidayBanner name={holiday} />}

      {tasks.length > 0 && (
        <ul className="space-y-2" aria-label="Waiting on you">
          {tasks.map((t) => (
            <li key={t.key}>
              <Link
                to={t.to}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-sm font-semibold text-amber-800 hover:bg-amber-500/15 dark:text-amber-300"
              >
                {t.label}
                <span aria-hidden="true">→</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <Tile
          label="Open to-dos"
          value={openTodos.length}
          sub={overdueTodos.length > 0 ? `${overdueTodos.length} overdue` : openTodos.length === 0 ? 'all done' : 'none overdue'}
          tone={overdueTodos.length > 0 ? 'red' : undefined}
          onClick={() => document.getElementById('my-todos')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
        />
        <Tile label="Notifications" value={notifications?.unread ?? 0} sub="unread" to="/notifications" />
        <Tile label="SIL balance" value={profile ? profile.silBalance : '—'} sub="days" to="/leave" />
        <Tile label={isReviewer ? 'Pending leave' : 'My pending leave'} value={pendingLeave.length} sub={isReviewer ? 'waiting for review' : 'waiting for approval'} to="/leave" />
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <div id="my-todos" className="scroll-mt-4 space-y-3">
            <MyTodos
              key={todoReload}
              action={
                isElevated ? (
                  <Button variant="primary" size="sm" onClick={() => setAssigning(true)}>
                    + Assign a to-do
                  </Button>
                ) : undefined
              }
            />
            {isElevated && <AssignedByMe isHr={isReviewer} reloadKey={todoReload} />}
          </div>

          {isReviewer && (
            <Panel title="Team">
              <div className="grid grid-cols-2 gap-2.5 p-4 sm:grid-cols-4">
                {[
                  ['Employees', employees.length],
                  ['Active teams', teamCount ?? '—'],
                  ['Clocked in now', clockedIn ?? '—'],
                  ['Leave to review', pendingLeave.length],
                ].map(([label, value]) => (
                  <div key={label as string} className="rounded-lg bg-black/[0.04] px-3 py-2.5 dark:bg-white/[0.06]">
                    <span className="block text-xl font-semibold tabular-nums text-gray-900 dark:text-gray-100">{value}</span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
                  </div>
                ))}
              </div>
              {user?.roles.includes('admin') && (
                <div className="border-t border-black/5 px-4 pb-4 dark:border-white/10">
                  <AdminWidgets />
                </div>
              )}
            </Panel>
          )}

          <Panel title="Coming up">
            {reminders.length === 0 ? (
              <p className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">No holidays, events or deadlines in the next 14 days.</p>
            ) : (
              reminders.map((e) => (
                <div key={e.id} className={`${rowClass} justify-between`}>
                  <span className="text-gray-900 dark:text-gray-100">{e.title}</span>
                  <span className="whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{formatDateOnly(e.startDate)}</span>
                </div>
              ))
            )}
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title="Announcements" linkTo="/announcements" linkLabel="All announcements">
            {loading && <LoadingState />}
            {error && <ErrorState message={error} />}
            {data && latest.length === 0 && <p className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">Nothing posted yet.</p>}
            {latest.map((a) => (
              <div key={a.id} className={rowClass}>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-gray-900 dark:text-gray-100">
                    {a.title}
                    {a.featured && (
                      <span className="ml-2 align-[1px]">
                        <Badge tone="amber">★ Highlighted</Badge>
                      </span>
                    )}
                  </p>
                  <p className="line-clamp-2 text-sm text-gray-600 dark:text-gray-400">{a.content}</p>
                </div>
              </div>
            ))}
          </Panel>

          <Panel title="Notifications" linkTo="/notifications" linkLabel="All notifications">
            {recentNotifications.length === 0 ? (
              <p className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">No notifications yet.</p>
            ) : (
              recentNotifications.map((n) => (
                <div key={n.id} className={`${rowClass} justify-between`}>
                  <span className={`flex items-start gap-2 ${n.readAt ? 'text-gray-500 dark:text-gray-400' : 'font-semibold text-gray-900 dark:text-gray-100'}`}>
                    {!n.readAt && <span aria-hidden className="mt-1.5 h-2 w-2 flex-none rounded-full bg-brand-500" />}
                    {n.title}
                  </span>
                  <span className="whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">{timeFmt.format(new Date(n.createdAt))}</span>
                </div>
              ))
            )}
          </Panel>
        </div>
      </div>

      {assigning && (
        <Modal label="Assign a to-do" onClose={() => setAssigning(false)} className="max-w-xl overflow-hidden !p-0">
          <AssignTodo
            isHr={isReviewer}
            onClose={() => setAssigning(false)}
            onAssigned={() => {
              setTodoReload((n) => n + 1)
              setAssigning(false)
            }}
          />
        </Modal>
      )}
    </div>
  )
}
