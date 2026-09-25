import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { ROLE_LABELS, type Role } from '../auth/types'
import { api, ApiError } from '../services/api'
import { Button } from '../components/ui/Button'
import { useTheme } from '../theme/ThemeContext'
import { NOTIFICATIONS_CHANGED, type NotificationsResponse } from '../pages/notifications/types'

interface NavItem {
  to: string
  label: string
  roles?: readonly Role[]
}

interface NavGroup {
  label: string
  roles?: readonly Role[]
  items: NavItem[]
}

// Mirrors HR's document (new_plan.md): what the whole company uses,
// what only HR/Admin see, and admin tooling. A group (or item) with
// `roles` is hidden from everyone who has none of them.
const navGroups: NavGroup[] = [
  {
    label: 'General',
    items: [
      { to: '/', label: 'Dashboard' },
      { to: '/announcements', label: 'Announcements' },
      { to: '/attendance', label: 'Attendance' },
      { to: '/leave', label: 'Leave Requests' },
      { to: '/documents', label: 'Documents' },
      { to: '/reports', label: 'Weekly Reports', roles: ['team_leader', 'manager', 'hr', 'admin'] },
      { to: '/benefits', label: 'Benefits' },
      { to: '/hr-requests', label: 'HR Requests' },
      { to: '/performance', label: 'Performance' },
      { to: '/notifications', label: 'Notifications' },
      { to: '/calendar', label: 'Calendar' },
      { to: '/profile', label: 'My Profile' },
      { to: '/settings', label: 'Settings' },
    ],
  },
  {
    label: 'HR',
    roles: ['hr', 'admin'],
    items: [
      { to: '/hris', label: 'Employee Management' },
      { to: '/recruitment', label: 'Recruitment' },
      { to: '/onboarding', label: 'Onboarding' },
      { to: '/offboarding', label: 'Offboarding' },
      { to: '/benefits-admin', label: 'Benefits Administration' },
      { to: '/employee-relations', label: 'Employee Relations' },
      { to: '/payroll', label: 'Payroll' },
    ],
  },
  {
    label: 'Admin',
    roles: ['admin'],
    items: [
      { to: '/users', label: 'Users' },
      { to: '/audit-logs', label: 'Audit Logs' },
    ],
  },
]

// Unread count for the header bell: fetched on load, on navigation, every
// minute, and whenever a page reports it changed something.
function useUnreadCount(): number {
  const location = useLocation()
  const [unread, setUnread] = useState(0)

  useEffect(() => {
    let cancelled = false
    const load = () =>
      api
        .get<NotificationsResponse>('/notifications')
        .then((r) => !cancelled && setUnread(r.unread))
        .catch(() => undefined)
    load()
    const timer = window.setInterval(load, 60_000)
    window.addEventListener(NOTIFICATIONS_CHANGED, load)
    return () => {
      cancelled = true
      window.clearInterval(timer)
      window.removeEventListener(NOTIFICATIONS_CHANGED, load)
    }
  }, [location.pathname])

  return unread
}

function NotificationBell({ unread, className = '' }: { unread: number; className?: string }) {
  return (
    <Link
      to="/notifications"
      aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
      className={`relative inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-black/10 text-gray-600 transition hover:bg-black/5 dark:border-white/15 dark:text-gray-300 dark:hover:bg-white/10 ${className}`}
    >
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 8a5 5 0 0110 0c0 4 1.5 5.5 1.5 5.5h-13S5 12 5 8zM8.5 16.5a1.6 1.6 0 003 0" />
      </svg>
      {unread > 0 && (
        <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold leading-none text-white">
          {unread > 9 ? '9+' : unread}
        </span>
      )}
    </Link>
  )
}

const roleOptions = (Object.entries(ROLE_LABELS) as [Role, string][]).map(([value, label]) => ({ value, label }))

function RoleSwitcher() {
  const { user, viewAsRole, setViewAsRole } = useAuth()
  if (!user?.roles.includes('admin')) return null

  return (
    <label className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400">
      View as:
      <select
        value={viewAsRole ?? ''}
        onChange={(e) => setViewAsRole(e.target.value ? (e.target.value as Role) : null)}
        className="min-w-0 flex-1 rounded-md border border-gray-300 bg-white/70 px-1.5 py-1 text-base sm:text-sm dark:border-white/15 dark:bg-white/5"
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
    // md and up only — on phones the switch lives in the burger menu
    // (ThemeSwitchRow) so it isn't a permanent fixture in the header.
    <Button
      size="sm"
      onClick={toggleTheme}
      className="shrink-0 max-md:hidden"
      title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {theme === 'dark' ? '☀️ Light' : '🌙 Dark'}
    </Button>
  )
}

// Phone version: a full-width row with an on/off switch, the standard
// Android settings pattern. The whole row is the tap target.
function ThemeSwitchRow() {
  const { theme, toggleTheme } = useTheme()
  const dark = theme === 'dark'

  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      onClick={toggleTheme}
      className="flex w-full items-center justify-between gap-3 py-1.5 text-left text-gray-700 dark:text-gray-300"
    >
      Dark mode
      <span
        className={`relative h-7 w-12 shrink-0 rounded-full border transition-colors ${
          dark ? 'border-brand-500 bg-brand-600' : 'border-gray-300 bg-gray-200'
        }`}
      >
        <span
          // Positioned inside the track's 1px border: 3px in from the left,
          // vertically centered by half-height, and (when on) shifted by
          // exactly track-inner-width - knob - 2*3px = 20px so both ends
          // have an equal 3px gap.
          className={`absolute left-[3px] top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-white shadow transition-transform ${
            dark ? 'translate-x-5' : ''
          }`}
        />
      </span>
    </button>
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

function BurgerButton({ open, onClick }: { open: boolean; onClick: () => void }) {
  return (
    <Button
      onClick={onClick}
      className="shrink-0 !px-2.5 md:hidden"
      aria-label={open ? 'Close menu' : 'Open menu'}
      aria-expanded={open}
      aria-controls="mobile-menu"
    >
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        {open ? <path d="M4 4l12 12M16 4L4 16" /> : <path d="M3 5h14M3 10h14M3 15h14" />}
      </svg>
    </Button>
  )
}

function readGroupOpen(label: string): boolean | null {
  try {
    const v = localStorage.getItem(`navgroup:${label}`)
    return v === null ? null : v === '1'
  } catch {
    return null
  }
}

// A sidebar group: a header with a chevron that expands to the pages under
// it. Open/closed is remembered per browser; a group that contains the
// current page is always open on arrival.
function NavGroupBlock({
  group,
  mobile,
  unread,
  pathname,
  onNavigate,
}: {
  group: NavGroup
  mobile: boolean
  unread: number
  pathname: string
  onNavigate: () => void
}) {
  const containsCurrent = group.items.some((i) => (i.to === '/' ? pathname === '/' : pathname.startsWith(i.to)))
  const [open, setOpen] = useState(() => readGroupOpen(group.label) ?? true)

  useEffect(() => {
    if (containsCurrent) setOpen(true)
  }, [containsCurrent])

  function toggle() {
    setOpen((prev) => {
      try {
        localStorage.setItem(`navgroup:${group.label}`, prev ? '0' : '1')
      } catch {
        // storage blocked: the group just won't remember its state
      }
      return !prev
    })
  }

  return (
    <div>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 transition hover:bg-black/5 dark:text-gray-400 dark:hover:bg-white/5"
      >
        {group.label}
        <svg
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
          className={`h-4 w-4 transition-transform ${open ? 'rotate-90' : ''}`}
        >
          <path
            fillRule="evenodd"
            d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
            clipRule="evenodd"
          />
        </svg>
      </button>
      {open && (
        <div className="mt-0.5 space-y-0.5 border-l border-black/10 pl-2 ml-3 dark:border-white/10">
          {group.items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              onClick={onNavigate}
              className={({ isActive }) =>
                'flex items-center justify-between gap-2 rounded-md px-3 text-sm font-medium transition ' +
                (mobile ? 'py-2.5 ' : 'py-1.5 ') +
                (isActive
                  ? 'bg-brand-600/10 text-brand-700 dark:bg-brand-400/10 dark:text-brand-400'
                  : 'text-gray-600 hover:bg-black/5 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-white')
              }
            >
              {item.label}
              {item.to === '/notifications' && unread > 0 && (
                <span className="rounded-full bg-red-600 px-1.5 text-[10px] font-semibold leading-4 text-white">
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  )
}

export function PortalLayout() {
  const { user, logout, effectiveRoles } = useAuth()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const unread = useUnreadCount()
  const allowed = (roles?: readonly Role[]) => roles?.some((r) => effectiveRoles.includes(r)) ?? true
  const visibleGroups = navGroups
    .filter((g) => allowed(g.roles))
    .map((g) => ({ ...g, items: g.items.filter((item) => allowed(item.roles)) }))
    .filter((g) => g.items.length > 0)

  useEffect(() => {
    if (!menuOpen) return
    const onKeyDown = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false)
    window.addEventListener('keydown', onKeyDown)

    // While the menu is open the page behind it must not scroll — only
    // the menu itself. Also close it if the window grows to the desktop
    // layout (e.g. rotating a tablet), so the lock can't get stuck on.
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const desktop = window.matchMedia('(min-width: 768px)')
    const onBreakpoint = () => desktop.matches && setMenuOpen(false)
    desktop.addEventListener('change', onBreakpoint)

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      desktop.removeEventListener('change', onBreakpoint)
      document.body.style.overflow = previousOverflow
    }
  }, [menuOpen])

  // One set of groups, rendered twice: a fixed sidebar from md up, a
  // vertical list inside the burger menu below it. Each group (General,
  // HR, Admin) is a dropdown holding its pages; picking a link closes the
  // burger menu.
  function navLinks(mobile: boolean) {
    return visibleGroups.map((group) => (
      <NavGroupBlock
        key={group.label}
        group={group}
        mobile={mobile}
        unread={unread}
        pathname={location.pathname}
        onNavigate={() => setMenuOpen(false)}
      />
    ))
  }

  return (
    <div className="min-h-svh flex flex-col">
      <header className="sticky top-0 z-40 border-b border-black/5 bg-white/75 backdrop-blur-md dark:border-white/10 dark:bg-brand-950/75">
        <div className="flex w-full items-center justify-between gap-x-4 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <img src={`${import.meta.env.BASE_URL}favicon.png`} alt="" className="h-7 w-7 shrink-0" />
            <span className="min-w-0 truncate text-lg font-bold tracking-tight text-gold-600 dark:text-gold-400">
              BPO Portal
            </span>
            <ThemeToggle />
          </div>
          <div className="hidden min-w-0 flex-wrap items-center gap-4 text-sm md:flex">
            <RoleSwitcher />
            <span className="truncate text-gray-500 dark:text-gray-400">{user?.email}</span>
            <NotificationBell unread={unread} />
            <CheckOutButton />
            <Button size="sm" onClick={logout} className="shrink-0">
              Log out
            </Button>
          </div>
          <div className="flex items-center gap-2 md:hidden">
            <NotificationBell unread={unread} />
            <BurgerButton open={menuOpen} onClick={() => setMenuOpen((o) => !o)} />
          </div>
        </div>
        {menuOpen && (
          <div
            id="mobile-menu"
            className="max-h-[calc(100svh-4.5rem)] overflow-y-auto overscroll-contain border-t border-black/5 px-4 pb-4 md:hidden dark:border-white/10"
          >
            <nav className="mx-auto flex max-w-6xl flex-col gap-1 pt-2 text-sm">{navLinks(true)}</nav>
            <div className="mx-auto mt-3 flex max-w-6xl flex-col gap-3 border-t border-black/5 pt-3 text-sm dark:border-white/10">
              <ThemeSwitchRow />
              <RoleSwitcher />
              <span className="truncate text-gray-500 dark:text-gray-400">{user?.email}</span>
              <div className="flex gap-2">
                <CheckOutButton />
                <Button size="sm" onClick={logout} className="shrink-0">
                  Log out
                </Button>
              </div>
            </div>
          </div>
        )}
      </header>
      {/* Dims the page behind the open menu; tapping it closes the menu.
          A sibling of the header, not a child — the header's backdrop-blur
          would otherwise become the containing block for this fixed layer. */}
      {menuOpen && (
        <div aria-hidden="true" onClick={() => setMenuOpen(false)} className="fixed inset-0 z-30 bg-black/40 md:hidden" />
      )}
      <div className="flex w-full flex-1">
        <aside className="hidden w-64 shrink-0 border-r border-black/5 bg-white/40 md:block dark:border-white/10 dark:bg-black/10">
          <nav className="sticky top-[57px] max-h-[calc(100svh-57px)] space-y-1 overflow-y-auto p-3">
            {navLinks(false)}
          </nav>
        </aside>
        <main className="min-w-0 flex-1 px-4 py-6 md:px-8">
          <div className="mx-auto w-full max-w-6xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
