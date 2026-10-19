import { useEffect, useState } from 'react'
import { api } from '../services/api'

// Today's holiday (by name) or null. Asked once per page load and shared, so the layout (top strip) and the dashboard
// (banner) do not each ask. Opening any page with ?holidayPreview=Christmas%20Day shows that holiday without changing
// anything: a way to look at a theme, only on this screen.
let cached: string | null | undefined
let pending: Promise<string | null> | null = null

function preview(): string | null {
  try {
    return new URLSearchParams(window.location.search).get('holidayPreview')
  } catch {
    return null
  }
}

function load(): Promise<string | null> {
  if (cached !== undefined) return Promise.resolve(cached)
  pending ??= api
    .get<{ holiday: { name: string } | null }>('/calendar/today')
    .then((r) => (cached = r.holiday?.name ?? null))
    .catch(() => null) // no holiday look beats an error on every page
  return pending
}

export function useTodayHoliday(): string | null {
  const [name, setName] = useState<string | null>(() => preview() ?? (cached === undefined ? null : cached))
  useEffect(() => {
    const p = preview()
    if (p) {
      setName(p)
      return
    }
    let live = true
    load().then((n) => {
      if (live) setName(n)
    })
    return () => {
      live = false
    }
  }, [])
  return name
}
