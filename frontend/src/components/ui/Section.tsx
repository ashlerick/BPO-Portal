import { useState, type ReactNode } from 'react'
import { useAuth } from '../../auth/AuthContext'
import type { Role } from '../../auth/types'
import { cardClass } from './Card'

// A collapsible section: a header row with a chevron, content underneath.
// Every page in the portal is a stack of these (see new_plan.md §1) — the
// header is the topic, the body is what HR listed under it.
//
// `roles`, when given, hides the whole section from anyone (by their
// *effective* role, so the admin "View as" switcher is honored) who has
// none of them. `id` makes the open/closed choice stick per browser;
// pages should give each section a stable `id` like "leave.balance".

const STORAGE_PREFIX = 'section:'

function readOpen(id: string | undefined, fallback: boolean): boolean {
  if (!id) return fallback
  try {
    const stored = localStorage.getItem(STORAGE_PREFIX + id)
    return stored === null ? fallback : stored === '1'
  } catch {
    return fallback
  }
}

function writeOpen(id: string | undefined, open: boolean) {
  if (!id) return
  try {
    localStorage.setItem(STORAGE_PREFIX + id, open ? '1' : '0')
  } catch {
    // storage blocked — the section just won't remember its state
  }
}

interface SectionProps {
  id?: string
  title: string
  // Small line under the title, e.g. a count or "HR only".
  hint?: string
  // Right-aligned header content (badge, count). Clicks here don't toggle.
  aside?: ReactNode
  defaultOpen?: boolean
  roles?: readonly Role[]
  children: ReactNode
}

export function Section({ id, title, hint, aside, defaultOpen = false, roles, children }: SectionProps) {
  const { effectiveRoles } = useAuth()
  const [open, setOpen] = useState(() => readOpen(id, defaultOpen))

  if (roles && !roles.some((r) => effectiveRoles.includes(r))) return null

  const bodyId = id ? `section-body-${id}` : undefined

  function toggle() {
    setOpen((prev) => {
      writeOpen(id, !prev)
      return !prev
    })
  }

  return (
    <section className={`${cardClass} p-0`}>
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-controls={bodyId}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <svg
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
            className={`h-4 w-4 shrink-0 text-gray-500 transition-transform dark:text-gray-400 ${open ? 'rotate-90' : ''}`}
          >
            <path
              fillRule="evenodd"
              d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
              clipRule="evenodd"
            />
          </svg>
          <span className="min-w-0">
            <span className="block font-medium text-gray-900 dark:text-gray-100">{title}</span>
            {hint && <span className="block text-xs text-gray-500 dark:text-gray-400">{hint}</span>}
          </span>
        </button>
        {aside}
      </div>
      {open && (
        <div id={bodyId} className="border-t border-black/5 px-4 py-4 dark:border-white/10">
          {children}
        </div>
      )}
    </section>
  )
}

// Vertical stack with consistent spacing, so pages don't repeat the wrapper.
export function SectionStack({ children }: { children: ReactNode }) {
  return <div className="space-y-3">{children}</div>
}
