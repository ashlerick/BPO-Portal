import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { ROLE_LABELS, type Role } from '../auth/types'
import { api, ApiError } from '../services/api'
import { Button } from '../components/ui/Button'
import { useTheme } from '../theme/ThemeContext'

const navItems = [
  { to: '/', label: 'Dashboard' },
  { to: '/announcements', label: 'Announcements' },
  { to: '/benefits', label: 'Benefits' },
  { to: '/hris', label: 'HRIS' },
  { to: '/reports', label: 'Weekly Reports', roles: ['team_leader', 'manager', 'hr', 'admin'] as const },
  { to: '/leave', label: 'Leave Requests' },
  { to: '/attendance', label: 'Attendance' },
  { to: '/documents', label: 'Documents' },
  { to: '/users', label: 'Users', roles: ['admin'] as const },
  { to: '/audit-logs', label: 'Audit Logs', roles: ['admin'] as const },
]

const roleOptions = (Object.entries(ROLE_LABELS) as [Role, string][]).map(([value, label]) => ({ value, label }))

function RoleSwitcher() {
  const { user, viewAsRole, setViewAsRole } = useAuth()
  if (!user?.roles.includes('admin')) return null

  return (
    <label className="flex shrink-0 items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400">
      View as:
      <select
        value={viewAsRole ?? ''}
        onChange={(e) => setViewAsRole(e.target.value ? (e.target.value as Role) : null)}
        className="rounded-md border border-gray-300 bg-white/70 px-1.5 py-1 text-base sm:text-sm dark:border-white/15 dark:bg-white/5"
      >
        <option value="">My role (Admin)</option>
        {roleOptions.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </select>
    </label>
  )
}

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()

  return (
    <Button
      size="sm"
      onClick={toggleTheme}
      className="shrink-0"
      title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {theme === 'dark' ? '☀️ Light' : '🌙 Dark'}
    </Button>
  )
}

function CheckOutButton() {
  const { attendanceStatus, refreshAttendance } = useAuth()
  const [checkingOut, setCheckingOut] = useState(false)

  async function handleCheckOut() {
    if (!window.confirm("Check out for today? You won't be able to undo this.")) return

    setCheckingOut(true)
    try {
      await api.post('/leave/attendance/checkout')
      refreshAttendance()
    } catch (err) {
      if (err instanceof ApiError) alert(err.message)
    } finally {
      setCheckingOut(false)
    }
  }

  if (!attendanceStatus?.checkedIn || attendanceStatus.checkedOut || attendanceStatus.status === 'absent') return null

  return (
    <Button size="sm" onClick={handleCheckOut} disabled={checkingOut} className="shrink-0">
      {checkingOut ? 'Checking out…' : 'Check Out'}
    </Button>
  )
}

export function PortalLayout() {
  const { user, logout, effectiveRoles } = useAuth()
  const visibleNavItems = navItems.filter(
    (item) => item.roles?.some((r) => effectiveRoles.includes(r)) ?? true,
  )

  return (
    <div className="min-h-svh flex flex-col">
      <header className="sticky top-0 z-40 border-b border-black/5 bg-white/75 backdrop-blur-md dark:border-white/10 dark:bg-brand-950/75">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
          <div className="flex min-w-0 shrink-0 items-center gap-3">
            <img src={`${import.meta.env.BASE_URL}favicon.png`} alt="" className="h-7 w-7 shrink-0" />
            <span className="min-w-0 truncate text-lg font-bold tracking-tight text-gold-600 dark:text-gold-400">
              BPO Portal
            </span>
            <ThemeToggle />
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-3 text-sm sm:gap-4">
            <RoleSwitcher />
            <span className="max-w-[40vw] truncate text-gray-500 dark:text-gray-400 sm:max-w-none">
              {user?.email}
            </span>
            <CheckOutButton />
            <Button size="sm" onClick={logout} className="shrink-0">
              Log out
            </Button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 pb-2 text-sm">
          {visibleNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                'shrink-0 rounded-md px-3 py-1.5 font-medium transition ' +
                (isActive
                  ? 'bg-brand-600/10 text-brand-700 dark:bg-brand-400/10 dark:text-brand-400'
                  : 'text-gray-600 hover:bg-black/5 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-white')
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}
