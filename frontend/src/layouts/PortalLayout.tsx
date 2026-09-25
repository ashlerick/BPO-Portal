import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { ROLE_LABELS, type Role } from '../auth/types'
import { api, ApiError } from '../services/api'
import { Button } from '../components/ui/Button'
import { useTheme } from '../theme/ThemeContext'
import { NOTIFICATIONS_CHANGED, type NotificationsResponse } from '../pages/notifications/types'

type IconName =
  | 'dashboard'
  | 'announcements'
  | 'attendance'
  | 'leave'
  | 'documents'
  | 'reports'
  | 'benefits'
  | 'requests'
  | 'performance'
  | 'notifications'
  | 'calendar'
  | 'profile'
  | 'settings'
  | 'people'
  | 'recruitment'
  | 'onboarding'
  | 'offboarding'
  | 'shield'
  | 'alert'
  | 'payroll'
  | 'audit'
  | 'logout'
  | 'chevron'

// Outline icons on a 24px grid, drawn as plain strokes.
const ICONS: Record<IconName, string> = {
  dashboard: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  announcements: 'M3 11v2a1 1 0 001 1h2l5 4V6L6 10H4a1 1 0 00-1 1zM15 9a4 4 0 010 6M18 6.5a8 8 0 010 11',
  attendance: 'M12 7v5l3 2M12 21a9 9 0 100-18 9 9 0 000 18z',
  leave: 'M5 5h14v15H5zM5 9h14M9 3v4M15 3v4M9 14l2 2 4-4',
  documents: 'M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6',
  reports: 'M5 20V10M12 20V4M19 20v-7',
  benefits: 'M4 10h16v10H4zM3 7h18v3H3zM12 7v13M12 7C10 3 7 4 8 6s4 1 4 1zM12 7c2-4 5-3 4-1s-4 1-4 1z',
  requests: 'M9 4h6l1 2h3v15H5V6h3zM9 12h6M9 16h4',
  performance: 'M4 17l5-5 4 4 7-8M15 8h5v5',
  notifications: 'M6 9a6 6 0 0112 0c0 5 2 6 2 6H4s2-1 2-6zM10 19a2 2 0 004 0',
  calendar: 'M5 5h14v15H5zM5 9h14M9 3v4M15 3v4',
  profile: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0',
  settings: 'M4 7h9M17 7h3M4 17h3M11 17h9M15 5v4M9 15v4',
  people: 'M9 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM2 20a7 7 0 0114 0M16 4.5a3.5 3.5 0 010 6.5M18 14c2 .8 4 2.6 4 6',
  recruitment: 'M10 11a4 4 0 100-8 4 4 0 000 8zM3 21a7 7 0 0114 0M19 8v6M16 11h6',
  onboarding: 'M15 4h4v16h-4M10 8l4 4-4 4M14 12H4',
  offboarding: 'M9 4H5v16h4M15 8l4 4-4 4M19 12H9',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  alert: 'M12 4l9 16H3zM12 10v4M12 17v.5',
  payroll: 'M3 7h18v10H3zM12 14a2 2 0 100-4 2 2 0 000 4zM6 10v.01M18 14v.01',
  audit: 'M5 5h14M5 10h14M5 15h9M5 20h6',
  logout: 'M9 4H5v16h4M15 8l4 4-4 4M19 12H9',
  chevron: 'M9 6l6 6-6 6',
}

function Icon({ name, className = 'h-[18px] w-[18px]' }: { name: IconName; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`shrink-0 ${className}`}
    >
      <path d={ICONS[name]} />
    </svg>
  )
}

interface NavItem {
  to: string
  label: string
  icon: IconName
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
      { to: '/', label: 'Dashboard', icon: 'dashboard' },
      { to: '/announcements', label: 'Announcements', icon: 'announcements' },
      { to: '/attendance', label: 'Attendance', icon: 'attendance' },
      { to: '/leave', label: 'Leave Requests', icon: 'leave' },
      { to: '/documents', label: 'Documents', icon: 'documents' },
      { to: '/reports', label: 'Weekly Reports', icon: 'reports', roles: ['team_leader', 'manager', 'hr', 'admin'] },
      { to: '/benefits', label: 'Benefits', icon: 'benefits' },
      { to: '/hr-requests', label: 'HR Requests', icon: 'requests' },
      { to: '/performance', label: 'Performance', icon: 'performance' },
      { to: '/notifications', label: 'Notifications', icon: 'notifications' },
      { to: '/calendar', label: 'Calendar', icon: 'calendar' },
      { to: '/profile', label: 'My Profile', icon: 'profile' },
      { to: '/settings', label: 'Settings', icon: 'settings' },
    ],
  },
  {
    label: 'HR',
    roles: ['hr', 'admin'],
    items: [
      { to: '/hris', label: 'Employee Management', icon: 'people' },
      { to: '/recruitment', label: 'Recruitment', icon: 'recruitment' },
      { to: '/onboarding', label: 'Onboarding', icon: 'onboarding' },
      { to: '/offboarding', label: 'Offboarding', icon: 'offboarding' },
      { to: '/benefits-admin', label: 'Benefits Administration', icon: 'shield' },
      { to: '/employee-relations', label: 'Employee Relations', icon: 'alert' },
      { to: '/payroll', label: 'Payroll', icon: 'payroll' },
    ],
  },
  {
    label: 'Admin',
    roles: ['admin'],
    items: [
      { to: '/users', label: 'Users', icon: 'people' },
      { to: '/audit-logs', label: 'Audit Logs', icon: 'audit' },
    ],
  },
]

// Unread count for the bell: fetched on load, on navigation, every
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

function UnreadBadge({ count, className = '' }: { count: number; className?: string }) {
  if (count <= 0) return null
  return (
    <span
      className={`flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold leading-none text-white ${className}`}
    >
      {count > 9 ? '9+' : count}
    </span>
  )
}

const roleOptions = (Object.entries(ROLE_LABELS) as [Role, string][]).map(([value, label]) => ({ value, label }))

// The admin "view as" switcher, styled for the dark sidebar.
function RoleSwitcher() {
  const { user, viewAsRole, setViewAsRole } = useAuth()
  if (!user?.roles.includes('admin')) return null

  return (
    <label className="flex flex-col gap-1 text-xs text-gray-400">
      View as
      <select
        value={viewAsRole ?? ''}
        onChange={(e) => setViewAsRole(e.target.value ? (e.target.value as Role) : null)}
        className="w-full rounded-lg border border-white/15 bg-white/5 px-2 py-1.5 text-base text-gray-100 sm:text-sm"
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

// Buttons that sit on the dark sidebar surface.
const sidebarButton =
  '!border-white/15 !bg-white/5 !text-gray-100 hover:!bg-white/10 dark:!border-white/15 dark:!bg-white/5 dark:!text-gray-100'

function CheckOutButton({ className = '' }: { className?: string }) {
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
    <Button size="sm" onClick={handleCheckOut} disabled={checkingOut} className={`${sidebarButton} ${className}`}>
      {checkingOut ? 'Checking out…' : 'Check Out'}
    </Button>
  )
}

function ThemeButton({ className = '' }: { className?: string }) {
  const { theme, toggleTheme } = useTheme()
  return (
    <Button
      size="sm"
      onClick={toggleTheme}
      className={`${sidebarButton} ${className}`}
      title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {theme === 'dark' ? '☀️' : '🌙'}
    </Button>
  )
}

function initials(name: string | undefined, email: string | undefined): string {
  const source = (name ?? email ?? '?').trim()
  const parts = source.split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '?') + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '')).toUpperCase()
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
// current page is always open on arrival. When the sidebar is collapsed to
// icons the groups flatten into one icon column.
function NavGroupBlock({
  group,
  collapsed,
  large,
  unread,
  pathname,
  onNavigate,
}: {
  group: NavGroup
  collapsed: boolean
  large: boolean
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

  const showItems = collapsed || open

  return (
    <div className={collapsed ? 'border-t border-white/10 pt-2 first:border-0 first:pt-0' : ''}>
      {!collapsed && (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400 transition hover:text-gray-200"
        >
          {group.label}
          <Icon name="chevron" className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-90' : ''}`} />
        </button>
      )}
      {showItems && (
        <div className="space-y-0.5">
          {group.items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              onClick={onNavigate}
              title={collapsed ? item.label : undefined}
              className={({ isActive }) =>
                'relative flex items-center gap-3 rounded-lg text-sm font-medium transition ' +
                (collapsed ? 'justify-center px-0 py-2.5 ' : `px-3 ${large ? 'py-2.5' : 'py-2'} `) +
                (isActive
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'text-gray-300 hover:bg-white/10 hover:text-white')
              }
            >
              <Icon name={item.icon} />
              {!collapsed && <span className="min-w-0 flex-1 truncate">{item.label}</span>}
              {item.to === '/notifications' && (
                <UnreadBadge count={unread} className={collapsed ? 'absolute right-1.5 top-1' : ''} />
              )}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  )
}

function readCollapsed(): boolean {
  try {
    return localStorage.getItem('sidebar:collapsed') === '1'
  } catch {
    return false
  }
}

export function PortalLayout() {
  const { user, logout, effectiveRoles } = useAuth()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const unread = useUnreadCount()
  const allowed = (roles?: readonly Role[]) => roles?.some((r) => effectiveRoles.includes(r)) ?? true
  const visibleGroups = navGroups
    .filter((g) => allowed(g.roles))
    .map((g) => ({ ...g, items: g.items.filter((item) => allowed(item.roles)) }))
    .filter((g) => g.items.length > 0)

  function toggleCollapsed() {
    setCollapsed((prev) => {
      try {
        localStorage.setItem('sidebar:collapsed', prev ? '0' : '1')
      } catch {
        // storage blocked: the choice just won't stick
      }
      return !prev
    })
  }

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

  function groups(isCollapsed: boolean, large: boolean) {
    return visibleGroups.map((group) => (
      <NavGroupBlock
        key={group.label}
        group={group}
        collapsed={isCollapsed}
        large={large}
        unread={unread}
        pathname={location.pathname}
        onNavigate={() => setMenuOpen(false)}
      />
    ))
  }

  const logo = (
    <img src={`${import.meta.env.BASE_URL}favicon.png`} alt="" className="h-8 w-8 shrink-0" />
  )

  return (
    <div className="min-h-svh md:flex">
      {/* ---- Desktop sidebar: fixed to the left edge, full height ---- */}
      <aside
        className={`sticky top-0 hidden h-svh shrink-0 flex-col border-r border-white/10 bg-brand-950 text-gray-200 transition-[width] duration-200 md:flex ${
          collapsed ? 'w-[72px]' : 'w-64'
        }`}
      >
        <div className={`flex items-center gap-3 border-b border-white/10 px-4 py-4 ${collapsed ? 'flex-col px-0' : ''}`}>
          {logo}
          {!collapsed && (
            <span className="min-w-0 flex-1 truncate text-lg font-bold tracking-tight text-gold-400">BPO Portal</span>
          )}
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-gray-400 transition hover:bg-white/10 hover:text-white"
          >
            <Icon name="chevron" className={`h-4 w-4 transition-transform ${collapsed ? '' : 'rotate-180'}`} />
          </button>
        </div>

        <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-3">{groups(collapsed, false)}</nav>

        <div className="space-y-3 border-t border-white/10 p-3">
          {collapsed ? (
            <div className="flex flex-col items-center gap-2">
              <span
                title={user?.email}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-700 text-xs font-semibold text-white"
              >
                {initials(user?.name, user?.email)}
              </span>
              <ThemeButton className="!px-2" />
              <button
                type="button"
                onClick={logout}
                title="Log out"
                aria-label="Log out"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-300 transition hover:bg-white/10 hover:text-white"
              >
                <Icon name="logout" />
              </button>
            </div>
          ) : (
            <>
              <RoleSwitcher />
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-700 text-xs font-semibold text-white">
                  {initials(user?.name, user?.email)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-white">{user?.name ?? user?.email}</div>
                  <div className="truncate text-xs text-gray-400">{user?.email}</div>
                </div>
                <ThemeButton />
              </div>
              <CheckOutButton className="w-full" />
              <button
                type="button"
                onClick={logout}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-gray-300 transition hover:bg-white/10 hover:text-white"
              >
                <Icon name="logout" />
                Log out
              </button>
            </>
          )}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* ---- Phone header + burger menu ---- */}
        <header className="sticky top-0 z-40 border-b border-white/10 bg-brand-950 text-gray-200 md:hidden">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              {logo}
              <span className="min-w-0 truncate text-lg font-bold tracking-tight text-gold-400">BPO Portal</span>
            </div>
            <div className="flex items-center gap-2">
              <Link
                to="/notifications"
                aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
                className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 text-gray-200"
              >
                <Icon name="notifications" />
                <UnreadBadge count={unread} className="absolute -right-1 -top-1" />
              </Link>
              <button
                type="button"
                onClick={() => setMenuOpen((o) => !o)}
                aria-label={menuOpen ? 'Close menu' : 'Open menu'}
                aria-expanded={menuOpen}
                aria-controls="mobile-menu"
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 text-gray-200"
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  {menuOpen ? <path d="M4 4l12 12M16 4L4 16" /> : <path d="M3 5h14M3 10h14M3 15h14" />}
                </svg>
              </button>
            </div>
          </div>
          {menuOpen && (
            <div
              id="mobile-menu"
              className="max-h-[calc(100svh-4.5rem)] overflow-y-auto overscroll-contain border-t border-white/10 px-3 pb-4"
            >
              <nav className="space-y-1 pt-2">{groups(false, true)}</nav>
              <div className="mt-3 space-y-3 border-t border-white/10 pt-3">
                <RoleSwitcher />
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-700 text-xs font-semibold text-white">
                    {initials(user?.name, user?.email)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-white">{user?.name ?? user?.email}</div>
                    <div className="truncate text-xs text-gray-400">{user?.email}</div>
                  </div>
                  <ThemeButton />
                </div>
                <CheckOutButton className="w-full" />
                <button
                  type="button"
                  onClick={logout}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-300 transition hover:bg-white/10 hover:text-white"
                >
                  <Icon name="logout" />
                  Log out
                </button>
              </div>
            </div>
          )}
        </header>
        {/* Dims the page behind the open menu; tapping it closes the menu.
            A sibling of the header, not a child. */}
        {menuOpen && (
          <div aria-hidden="true" onClick={() => setMenuOpen(false)} className="fixed inset-0 z-30 bg-black/40 md:hidden" />
        )}

        <main className="min-w-0 flex-1 px-4 py-6 md:px-8">
          <div className="mx-auto w-full max-w-6xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
