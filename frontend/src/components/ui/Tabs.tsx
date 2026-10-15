import { isValidElement, useState, type ReactNode } from 'react'

// A row of tabs over one panel, for pages that would otherwise be a long
// stack of cards. Only the active tab's content is rendered. `id` makes the
// chosen tab stick per browser, like Section's open/closed state.

const STORAGE_PREFIX = 'tabs:'

export interface TabItem {
  id: string
  label: string
  // Small count or marker next to the label, e.g. "3".
  badge?: ReactNode
  content: ReactNode
}

function readTab(id: string | undefined, valid: string[], fallback: string): string {
  if (!id) return fallback
  try {
    const stored = localStorage.getItem(STORAGE_PREFIX + id)
    return stored && valid.includes(stored) ? stored : fallback
  } catch {
    return fallback
  }
}

export function Tabs({ id, tabs, defaultId }: { id?: string; tabs: TabItem[]; defaultId?: string }) {
  const ids = tabs.map((t) => t.id)
  const [active, setActive] = useState(() => readTab(id, ids, defaultId && ids.includes(defaultId) ? defaultId : (ids[0] ?? '')))
  const current = tabs.find((t) => t.id === active) ?? tabs[0]
  if (!current) return null

  function pick(tabId: string) {
    setActive(tabId)
    if (!id) return
    try {
      localStorage.setItem(STORAGE_PREFIX + id, tabId)
    } catch {
      // storage blocked, the tab just won't be remembered
    }
  }

  return (
    <div>
      <div
        role="tablist"
        className="mb-4 flex gap-1 overflow-x-auto overflow-y-hidden border-b border-black/10 dark:border-white/10"
      >
        {tabs.map((t) => {
          const selected = t.id === current.id
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => pick(t.id)}
              className={`flex shrink-0 items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                selected
                  ? 'border-brand-500 text-gray-900 dark:text-gray-100'
                  : 'border-transparent text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'
              }`}
            >
              {t.label}
              {t.badge !== undefined && t.badge !== null && t.badge !== false && t.badge !== 0 && t.badge !== '' && (
                isValidElement(t.badge) ? t.badge : <span className="rounded-full bg-amber-500/20 px-1.5 text-xs text-amber-600 dark:text-amber-400">{t.badge}</span>
              )}
            </button>
          )
        })}
      </div>
      <div role="tabpanel">{current.content}</div>
    </div>
  )
}
