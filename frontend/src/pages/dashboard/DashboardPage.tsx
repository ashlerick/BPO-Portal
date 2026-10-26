import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import { ErrorState, LoadingState } from '../../components/AsyncState'
import { useApiData } from '../../hooks/useApiData'
import { api } from '../../services/api'
import { Badge } from '../../components/ui/Badge'
import { Modal } from '../../components/ui/Modal'
import { ROLE_LABELS } from '../../auth/types'
import { addDaysIso, formatDateOnly, todayInManilaIso } from '../../utils/dates'
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
import { Card as DashCard, TeamToday, TodayCard, WeekChart, WeekStrip, mondayOf, targetHours, type GivenOvertime, type ShiftInfo } from './DashboardWidgets'
import { AssignTodo, TodosPanel } from './Todos'

const timeFmt = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' })

interface PendingTask {
  key: string
  label: string
  to: string
}

interface TodoSummary {
  open: number
  done: number
  // Finished in the last 7 days; the card counts these, not every to-do ever finished.
  doneRecent: number
  dueDates: string[]
}

interface ScheduleResponse {
  current: { shift: ShiftInfo } | null
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
  const [todayRecords, setTodayRecords] = useState<AttendanceRecord[]>([])
  const [weekRecords, setWeekRecords] = useState<AttendanceRecord[]>([])
  const [givenWeek, setGivenWeek] = useState<GivenOvertime[]>([])
  const [todos, setTodos] = useState<TodoSummary>({ open: 0, done: 0, doneRecent: 0, dueDates: [] })
  const [shift, setShift] = useState<ShiftInfo | null>(null)

  useEffect(() => {
    const today = todayInManilaIso()
    api.get<LeaveRequest[]>('/leave/requests').then(setLeave).catch(() => undefined)
    api.get<CalendarEventRecord[]>('/calendar').then(setEvents).catch(() => undefined)
    api.get<NotificationsResponse>('/notifications').then(setNotifications).catch(() => undefined)
    api.get<MyEmployeeProfile>('/employees/me').then(setProfile).catch(() => undefined)
    api.get<WeeklyReport[]>('/reports').then(setReports).catch(() => undefined)
    api.get<TodoSummary>('/hr/todos?summary=1').then(setTodos).catch(() => undefined)
    api.get<ScheduleResponse>('/hr/shifts?kind=schedule').then((s) => setShift(s.current?.shift ?? null)).catch(() => undefined)
    if (isReviewer) {
      api.get<EmployeeRecord[]>('/employees').then(setEmployees).catch(() => undefined)
      api.get<{ teams: { id: string }[] }>('/directory').then((d) => setTeamCount(d.teams.length)).catch(() => undefined)
      api.get<AttendanceRecord[]>(`/leave/attendance?from=${today}&to=${today}`).then(setTodayRecords).catch(() => undefined)
    }
  }, [isReviewer, isElevated])

  // This person's own week (for the ring and the chart): HR is asked for their own rows only, not everyone's.
  const profileId = profile?.id
  // Bumped every minute and when the tab is looked at again, so the week chart follows a clock-in made elsewhere.
  const [liveTick, setLiveTick] = useState(0)
  useEffect(() => {
    const bump = () => {
      if (document.visibilityState === 'visible') setLiveTick((n) => n + 1)
    }
    const timer = setInterval(bump, 60_000)
    document.addEventListener('visibilitychange', bump)
    window.addEventListener('focus', bump)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', bump)
      window.removeEventListener('focus', bump)
    }
  }, [])
  useEffect(() => {
    if (!profileId) return
    const monday = mondayOf(todayInManilaIso())
    api
      .get<AttendanceRecord[]>(`/leave/attendance?from=${monday}&to=${addDaysIso(monday, 6)}&employeeId=${profileId}`)
      .then(setWeekRecords)
      .catch(() => undefined)
    // The overtime HR gave this person this week (HR is sent everyone's, so keep only this person's).
    api
      .get<(GivenOvertime & { employeeId: string })[]>(`/hr/overtime?from=${monday}&to=${addDaysIso(monday, 6)}`)
      .then((rows) => setGivenWeek(rows.filter((r) => r.employeeId === profileId)))
      .catch(() => undefined)
  }, [profileId, liveTick])

  return { leave, reports, events, notifications, profile, employees, teamCount, todayRecords, weekRecords, givenWeek, todos, shift }
}

function Tile({
  label,
  value,
  sub,
  tone,
  to,
  onClick,
  bar,
  dot,
}: {
  label: string
  value: ReactNode
  sub: string
  tone?: 'red'
  to?: string
  onClick?: () => void
  bar?: number // 0 to 1: a progress bar under the number
  dot?: boolean // an unread marker next to the label
}) {
  const className =
    'block min-w-0 rounded-xl border border-black/5 bg-white/80 px-2.5 py-3 text-left shadow-sm transition hover:border-brand-500 dark:border-white/10 dark:bg-white/[0.035] sm:px-3.5'
  const body = (
    <>
      <span className="flex items-center gap-1.5 truncate text-[10px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400 sm:text-[11px]">
        {label}
        {dot && <span aria-label="has unread" className="h-1.5 w-1.5 rounded-full bg-brand-500" />}
      </span>
      <span className={`block text-2xl font-semibold tabular-nums ${tone === 'red' ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-gray-100'}`}>{value}</span>
      {bar !== undefined && (
        <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-black/10 dark:bg-white/15">
          <span className="block h-full rounded-full bg-[#0f9d63] dark:bg-[#1fa763]" style={{ width: `${Math.round(bar * 100)}%` }} />
        </span>
      )}
      <span className="mt-1 block truncate text-xs text-gray-500 dark:text-gray-400">{sub}</span>
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

const rowClass = 'flex items-start gap-3 border-b border-black/5 px-4 py-2.5 last:border-0 dark:border-white/10'
const linkClass = 'text-xs font-semibold text-brand-600 hover:underline dark:text-brand-400'

export function DashboardPage() {
  const { user, effectiveRoles, attendanceStatus } = useAuth()
  const isReviewer = effectiveRoles.some((r) => r === 'hr' || r === 'admin')
  const isElevated = effectiveRoles.some((r) => r === 'team_leader' || r === 'manager' || r === 'hr' || r === 'admin')
  const { data, loading, error } = useApiData<Announcement[]>('/announcements')
  const { leave, reports, events, notifications, profile, employees, teamCount, todayRecords, weekRecords, givenWeek, todos, shift } = useDashboardData(isReviewer, isElevated)
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
  const horizonIso = addDaysIso(today, 14)
  const reminders = events
    .filter((e) => !e.disabled)
    .filter((e) => {
      const start = e.startDate.slice(0, 10)
      const end = (e.endDate ?? e.startDate).slice(0, 10)
      return end >= today && start <= horizonIso
    })

  const recentNotifications = notifications?.items.slice(0, 5) ?? []
  const dueDates = todos.dueDates.map((d) => d.slice(0, 10))
  const overdueCount = dueDates.filter((d) => d < today).length
  const totalTodos = todos.open + todos.doneRecent
  const unread = notifications?.unread ?? 0
  const subtitle = [user?.roles.map((role) => ROLE_LABELS[role]).join(', '), profile?.position, profile?.team].filter(Boolean).join(' · ')
  const todayRecord = weekRecords.find((r) => r.date.slice(0, 10) === today)

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gold-600 dark:text-gold-400">Welcome{user?.firstName ? `, ${user.firstName}` : ''}</h1>
        {subtitle && <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>}
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

      {/* One grid for the whole page: three columns on a wide screen, so every row's edges line up; two on a laptop; one on a phone. */}
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <div className="lg:col-span-2 xl:col-span-1">
          <TodayCard
            today={today}
            record={todayRecord}
            shift={shift}
            checkedIn={!!attendanceStatus?.checkedIn}
            checkedOut={!!attendanceStatus?.checkedOut}
            checkInAt={attendanceStatus?.checkInAt ?? null}
            checkOutAt={attendanceStatus?.checkOutAt ?? null}
          />
        </div>
        <div className="lg:col-span-2">
          <WeekChart records={weekRecords} given={givenWeek} today={today} target={targetHours(shift)} footer={<WeekStrip today={today} events={events} dueDates={dueDates} />} />
        </div>

        <div className="grid grid-cols-3 gap-2.5 sm:gap-4 lg:col-span-2 xl:col-span-3">
          <Tile
            label="Open to-dos"
            value={todos.open}
            sub={overdueCount > 0 ? `${overdueCount} overdue` : totalTodos === 0 ? 'nothing open' : todos.open === 0 ? 'All caught up' : `${todos.doneRecent} of ${totalTodos} done`}
            tone={overdueCount > 0 ? 'red' : undefined}
            bar={totalTodos > 0 ? todos.doneRecent / totalTodos : undefined}
            onClick={() => document.getElementById('my-todos')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          />
          <Tile label="Notifications" value={unread} sub="unread" dot={unread > 0} to="/notifications" />
          <Tile label="Leave" value={profile ? profile.silBalance : '—'} sub={pendingLeave.length > 0 ? `${pendingLeave.length} ${isReviewer ? 'to review' : 'pending'}` : 'SIL days'} to="/leave" />
        </div>

        <TodosPanel canAssign={isElevated} isHr={isReviewer} reloadKey={todoReload} onAssign={() => setAssigning(true)} />

        <DashCard
          title="Notifications"
          scroll
          aside={
            <Link to="/notifications" className={linkClass}>
              All notifications →
            </Link>
          }
        >
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
        </DashCard>

        <div className="lg:col-span-2 xl:col-span-1">
          <DashCard
            title="Announcements"
            scroll
            aside={
              <Link to="/announcements" className={linkClass}>
                All announcements →
              </Link>
            }
          >
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
                  <p className="line-clamp-1 text-sm text-gray-600 dark:text-gray-400">{a.content}</p>
                </div>
              </div>
            ))}
            <div className="flex items-center justify-between border-y border-black/5 bg-black/[0.03] px-4 py-2 dark:border-white/10 dark:bg-white/[0.04]">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Coming up</h3>
              <Link to="/calendar" className={linkClass}>
                Calendar →
              </Link>
            </div>
            {reminders.length === 0 ? (
              <p className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">No holidays, events or deadlines in the next 14 days.</p>
            ) : (
              reminders.slice(0, 4).map((e) => (
                <div key={e.id} className={`${rowClass} justify-between`}>
                  <span className="text-gray-900 dark:text-gray-100">{e.title}</span>
                  <span className="whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{formatDateOnly(e.startDate)}</span>
                </div>
              ))
            )}
          </DashCard>
        </div>

        {isReviewer && (
          <div className="lg:col-span-2 xl:col-span-3">
            <DashCard
              title="Team today"
              aside={
                <Link to="/attendance" className={linkClass}>
                  Attendance →
                </Link>
              }
            >
              <div className="grid lg:grid-cols-[2fr_1fr]">
                <TeamToday employees={employees} records={todayRecords} />
                <div className="grid grid-cols-3 gap-2.5 border-t border-black/5 p-4 dark:border-white/10 lg:border-l lg:border-t-0">
                  {[
                    ['Employees', employees.length],
                    ['Active teams', teamCount ?? '—'],
                    ['Leave to review', pendingLeave.length],
                  ].map(([label, value]) => (
                    <div key={label as string} className="rounded-lg bg-black/[0.04] px-3 py-2.5 dark:bg-white/[0.06]">
                      <span className="block text-xl font-semibold tabular-nums text-gray-900 dark:text-gray-100">{value}</span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
                    </div>
                  ))}
                </div>
              </div>
              {user?.roles.includes('admin') && (
                <div className="border-t border-black/5 px-4 pb-4 dark:border-white/10">
                  <AdminWidgets />
                </div>
              )}
            </DashCard>
          </div>
        )}
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
