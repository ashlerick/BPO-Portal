import type { Role } from '../auth/types'
import type { IconName } from './icons'

// The portal's sidebar: the built-in menu (mirroring HR's document, see
// new_plan.md) plus the admin's overrides from Menu Management. Overrides
// only change what is *shown* — page access is still enforced by each
// route guard and by the API.

export const ALL_ROLES: readonly Role[] = ['employee', 'team_leader', 'manager', 'hr', 'admin']

// Fired after the admin saves the menu so the sidebar refetches it.
export const MENU_CHANGED = 'menu:changed'

// Menu Management itself can never be hidden from an admin, so a bad
// configuration can't lock everyone out of fixing it.
export const PINNED_PATH = '/menu'

export interface NavItem {
  to: string
  label: string
  icon: IconName
  // Who sees it by default. Omitted means everyone.
  roles?: readonly Role[]
}

export interface NavGroup {
  label: string
  items: NavItem[]
}

export const defaultNavGroups: NavGroup[] = [
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
    items: [
      { to: '/hris', label: 'Employee Management', icon: 'people', roles: ['hr', 'admin'] },
      { to: '/recruitment', label: 'Recruitment', icon: 'recruitment', roles: ['hr', 'admin'] },
      { to: '/onboarding', label: 'Onboarding', icon: 'onboarding', roles: ['hr', 'admin'] },
      { to: '/offboarding', label: 'Offboarding', icon: 'offboarding', roles: ['hr', 'admin'] },
      { to: '/benefits-admin', label: 'Benefits Administration', icon: 'shield', roles: ['hr', 'admin'] },
      { to: '/employee-relations', label: 'Employee Relations', icon: 'alert', roles: ['hr', 'admin'] },
      { to: '/payroll', label: 'Payroll', icon: 'payroll', roles: ['hr', 'admin'] },
    ],
  },
  {
    label: 'Admin',
    items: [
      { to: '/users', label: 'Users', icon: 'people', roles: ['admin'] },
      { to: '/menu', label: 'Menu Management', icon: 'menu', roles: ['admin'] },
      { to: '/audit-logs', label: 'Audit Logs', icon: 'audit', roles: ['admin'] },
    ],
  },
]

// ---- the stored overrides (mirrors backend/lib/handlers/menu.ts)

interface Entry {
  label?: string
  order?: number
  hidden?: boolean
}

export interface MenuConfig {
  groups: Record<string, Entry>
  items: Record<string, Entry & { roles?: Role[]; group?: string }>
}

// ---- the editable / resolved form

export interface DraftItem {
  to: string
  icon: IconName
  defaultLabel: string
  label: string
  hidden: boolean
  roles: Role[]
  defaultRoles: Role[]
  // The group it ships in; `group` on the draft's parent is where it sits now.
  originGroup: string
}

export interface DraftGroup {
  key: string
  defaultLabel: string
  label: string
  items: DraftItem[]
}

const sameRoles = (a: readonly Role[], b: readonly Role[]) => a.length === b.length && a.every((r) => b.includes(r))

// Merges the built-in menu with the stored overrides. Groups and items are
// sorted by their `order`, falling back to their built-in position.
export function buildDraft(config: MenuConfig | null): DraftGroup[] {
  const groups = defaultNavGroups.map((g, gi) => ({
    key: g.label,
    defaultLabel: g.label,
    label: config?.groups[g.label]?.label ?? g.label,
    order: config?.groups[g.label]?.order ?? gi * 10,
    items: [] as (DraftItem & { order: number })[],
  }))

  defaultNavGroups.forEach((g) => {
    g.items.forEach((item, ii) => {
      const override = config?.items[item.to]
      const target = groups.find((x) => x.key === (override?.group ?? g.label)) ?? groups.find((x) => x.key === g.label)!
      const defaultRoles = [...(item.roles ?? ALL_ROLES)]
      target.items.push({
        to: item.to,
        icon: item.icon,
        defaultLabel: item.label,
        label: override?.label ?? item.label,
        hidden: override?.hidden ?? false,
        roles: override?.roles ? [...override.roles] : defaultRoles,
        defaultRoles,
        originGroup: g.label,
        order: override?.order ?? ii * 10,
      })
    })
  })

  return groups
    .sort((a, b) => a.order - b.order)
    .map(({ order: _order, items, ...g }) => ({
      ...g,
      items: items.sort((a, b) => a.order - b.order).map(({ order: _o, ...item }) => item),
    }))
}

// Turns an edited draft back into the minimal override set to store. Order
// is always written (it's what the arrows change); everything else only
// when it differs from the built-in menu.
export function draftToConfig(draft: DraftGroup[]): MenuConfig {
  const config: MenuConfig = { groups: {}, items: {} }
  draft.forEach((g, gi) => {
    config.groups[g.key] = { order: gi * 10, ...(g.label !== g.defaultLabel && { label: g.label }) }
    g.items.forEach((item, ii) => {
      config.items[item.to] = {
        order: ii * 10,
        ...(item.label !== item.defaultLabel && { label: item.label }),
        ...(item.hidden && { hidden: true }),
        ...(!sameRoles(item.roles, item.defaultRoles) && { roles: item.roles }),
        ...(g.key !== item.originGroup && { group: g.key }),
      }
    })
  })
  return config
}

export interface VisibleGroup {
  key: string
  label: string
  items: { to: string; label: string; icon: IconName }[]
}

// What the sidebar actually draws for someone acting as `roles`.
export function resolveNav(config: MenuConfig | null, roles: readonly Role[]): VisibleGroup[] {
  return buildDraft(config)
    .map((g) => ({
      key: g.key,
      label: g.label,
      items: g.items
        .filter((item) => {
          if (item.to === PINNED_PATH) return roles.includes('admin')
          return !item.hidden && item.roles.some((r) => roles.includes(r))
        })
        .map(({ to, label, icon }) => ({ to, label, icon })),
    }))
    .filter((g) => g.items.length > 0)
}
