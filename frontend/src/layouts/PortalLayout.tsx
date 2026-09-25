import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { ROLE_LABELS, type Role } from '../auth/types'
import { api, ApiError } from '../services/api'
import { useTheme } from '../theme/ThemeContext'
import { NOTIFICATIONS_CHANGED, type NotificationsResponse } from '../pages/notifications/types'
import { Icon, type IconName } from './icons'
import { MENU_CHANGED, resolveNav, type MenuConfig, type VisibleGroup } from './nav'

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

// The admin's saved menu overrides (null = built-in menu). Refetched
// whenever Menu Management saves.
function useMenuConfig(): MenuConfig | null {
  const [config, setConfig] = useState<MenuConfig | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = () =>
      api
        .get<MenuConfig | null>('/menu')
        .then((c) => !cancelled && setConfig(c))
        .catch(() => undefined)
    load()
    window.addEventListener(MENU_CHANGED, load)
    return () => {
      cancelled = true
      window.removeEventListener(MENU_CHANGED, load)
    }
  }, [])

  return config
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

function initials(name: string | undefined, email: string | undefined): string {
  const source = (name ?? email ?? '?').trim()
  const parts = source.split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '?') + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '')).toUpperCase()
}

function MenuRow({ icon, children, onClick }: { icon: IconName; children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium text-gray-200 transition hover:bg-white/10 hover:text-white"
    >
      <Icon name={icon} />
      {children}
    </button>
  )
}

// What the user card opens: everything personal that used to be crammed
// into the sidebar footer, one item per row.
function UserActions({ onDone }: { onDone: () => void }) {
  const { logout, user, viewAsRole, setViewAsRole, attendanceStatus, refreshAttendance } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const [checkingOut, setCheckingOut] = useState(false)
  const canCheckOut = attendanceStatus?.checkedIn && !attendanceStatus.checkedOut && attendanceStatus.status !== 'absent'

  async function checkOut() {
    if (!window.confirm("Check out for today? You won't be able to undo this.")) return
    setCheckingOut(true)
    try {
      await api.post('/leave/attendance/checkout')
      refreshAttendance()
      onDone()
    } catch (err) {
      if (err instanceof ApiError) alert(err.message)
    } finally {
      setCheckingOut(false)
    }
  }

  return (
    <div className="space-y-0.5">
      {user?.roles.includes('admin') && (
        <label className="block px-3 pb-2 pt-1 text-xs text-gray-400">
          View the portal as
          <select
            value={viewAsRole ?? ''}
            onChange={(e) => setViewAsRole(e.target.value ? (e.target.value as Role) : null)}
            className="mt-1 w-full rounded-lg border border-white/15 bg-white/5 px-2 py-1.5 text-base text-gray-100 sm:text-sm"
          >
            <option value="">My role (Admin)</option>
            {roleOptions.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
      )}
      <MenuRow icon={theme === 'dark' ? 'sun' : 'moon'} onClick={toggleTheme}>
        {theme === 'dark' ? 'Light mode' : 'Dark mode'}
      </MenuRow>
      {canCheckOut && (
        <MenuRow icon="clock" onClick={checkOut}>
          {checkingOut ? 'Checking out…' : 'Check out for today'}
        </MenuRow>
      )}
      <MenuRow icon="logout" onClick={logout}>
        Log out
      </MenuRow>
    </div>
  )
}

// The bottom-of-sidebar user card. Click it for the menu above (desktop);
// on phones the same actions are listed inline in the burger menu.
function UserCard({ collapsed }: { collapsed: boolean }) {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={ref} className="relative">
      {open && (
        <div
          className={`absolute z-50 w-64 rounded-xl border border-white/10 bg-[#0b2418] p-2 shadow-2xl shadow-black/40 ${
            collapsed ? 'bottom-0 left-full ml-3' : 'bottom-full left-0 mb-2 w-full'
          }`}
        >
          <UserActions onDone={() => setOpen(false)} />
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        title={collapsed ? (user?.name ?? user?.email) : undefined}
        className={`flex w-full items-center gap-3 rounded-xl text-left transition hover:bg-white/10 ${collapsed ? 'justify-center p-1.5' : 'p-2'}`}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-semibold text-white">
          {initials(user?.name, user?.email)}
        </span>
        {!collapsed && (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-white">{user?.name ?? user?.email}</span>
              <span className="block truncate text-xs text-gray-400">{user?.email}</span>
            </span>
            <Icon name="chevron" className={`h-4 w-4 text-gray-400 transition-transform ${open ? 'rotate-90' : '-rotate-90'}`} />
          </>
        )}
      </button>
    </div>
  )
}

function readGroupOpen(key: string): boolean | null {
  try {
    const v = localStorage.getItem(`navgroup:${key}`)
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
  group: VisibleGroup
  collapsed: boolean
  large: boolean
  unread: number
  pathname: string
  onNavigate: () => void
}) {
  const containsCurrent = group.items.some((i) => (i.to === '/' ? pathname === '/' : pathname.startsWith(i.to)))
  const [open, setOpen] = useState(() => readGroupOpen(group.key) ?? true)

  useEffect(() => {
    if (containsCurrent) setOpen(true)
  }, [containsCurrent])

  function toggle() {
    setOpen((prev) => {
      try {
        localStorage.setItem(`navgroup:${group.key}`, prev ? '0' : '1')
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
                (isActive ? 'bg-brand-600 text-white shadow-sm' : 'text-gray-300 hover:bg-white/10 hover:text-white')
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
  const { user, effectiveRoles } = useAuth()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const unread = useUnreadCount()
  const menuConfig = useMenuConfig()
  const visibleGroups = resolveNav(menuConfig, effectiveRoles)

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
        key={group.key}
        group={group}
        collapsed={isCollapsed}
        large={large}
        unread={unread}
        pathname={location.pathname}
        onNavigate={() => setMenuOpen(false)}
      />
    ))
  }

  const logo = <img src={`${import.meta.env.BASE_URL}favicon.png`} alt="" className="h-8 w-8 shrink-0" />

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

        <nav className="sidebar-scroll min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-3">{groups(collapsed, false)}</nav>

        <div className="border-t border-white/10 p-3">
          <UserCard collapsed={collapsed} />
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
              className="sidebar-scroll max-h-[calc(100svh-4.5rem)] overflow-y-auto overscroll-contain border-t border-white/10 px-3 pb-4"
            >
              <nav className="space-y-1 pt-2">{groups(false, true)}</nav>
              <div className="mt-3 border-t border-white/10 pt-3">
                <div className="mb-2 flex items-center gap-3 px-2">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-semibold text-white">
                    {initials(user?.name, user?.email)}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-white">{user?.name ?? user?.email}</span>
                    <span className="block truncate text-xs text-gray-400">{user?.email}</span>
                  </span>
                </div>
                <UserActions onDone={() => setMenuOpen(false)} />
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
