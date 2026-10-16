import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { api } from '../services/api'

type Theme = 'light' | 'dark'

interface ThemeContextValue {
  theme: Theme
  toggleTheme: () => void
  // Applies the theme saved on the account (so the desktop app and the portal agree). Does not save it back.
  applyTheme: (theme: Theme) => void
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined)

function currentTheme(): Theme {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

// The inline script in index.html already applies the class before
// first paint (reading the same bpo_theme key) so there's no flash —
// this just keeps React's state in sync and handles switching it.
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(currentTheme)
  const lastToggleAt = useRef(0)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    localStorage.setItem('bpo_theme', theme)
    // Keeps the mobile browser's address-bar/status-bar color matched
    // to the page (same values as the body background in index.css).
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0b241a' : '#d5e0d8')
  }, [theme])

  // Switching saves the choice on the account (when signed in) so the BPO Time app follows it.
  // Best effort: a failed save never blocks the switch.
  function toggleTheme() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    lastToggleAt.current = Date.now()
    setTheme(next)
    if (localStorage.getItem('bpo_token')) api.put('/settings', { theme: next }).catch(() => undefined)
  }

  // A value fetched just after a local switch may be the old one (the save is still in flight): ignore it.
  function applyTheme(next: Theme) {
    if (Date.now() - lastToggleAt.current < 10_000) return
    setTheme(next)
  }

  return <ThemeContext.Provider value={{ theme, toggleTheme, applyTheme }}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
