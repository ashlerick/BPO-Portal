import { useEffect, useRef, useState } from 'react'
import { api } from '../../services/api'

// "Open the desktop app" for the top-right corner of the portal on a PC. It
// starts the BPO Time app through its bpotime:// link; when nothing opens, it
// offers the download. See desktop_app_plan.md.
//
// A web page cannot ask the browser whether a program is installed, so this
// works by trying the link and watching whether the browser hands focus to
// another program. That is a good signal, not a guarantee, so a miss is
// presented as a question ("didn't open?"), never as an error.

// Shown to everyone on a Windows PC as a beta. To hide it again for everyone,
// set this to false; a single browser can still show it by opening the portal
// once with ?desktop=on (and hide it with ?desktop=off).
export const DESKTOP_APP_READY = true

// Plain launch (used when a sign-in code could not be fetched): bpotime://open
// Launch with sign-in: bpotime://connect?code=<one-time code>
const OPEN_LINK = 'bpotime://open'
// The newest installer on the app repo's GitHub Releases (the same file every time, so this link never changes).
const RELEASES_URL = 'https://github.com/ashlerick/BPO-Time/releases/latest/download/BPO-Time-Setup.exe'
const SEEN_KEY = 'bpotime:opened'
const FLAG_KEY = 'bpotime:enabled'
const CONNECT_KEY = 'bpotime:connect'
// How long to wait for the browser to hand focus to the app before asking.
const WAIT_MS = 6000

function readFlag(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeFlag(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // storage blocked: the choice just is not remembered
  }
}

// The first version is Windows only, and there is nothing to open or download
// when the portal is already running inside the app itself.
function canUseHere(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  return /Windows/i.test(ua) && !/Electron|BPOTime/i.test(ua)
}

function applyUrlSwitch() {
  try {
    const v = new URL(window.location.href).searchParams.get('desktop')
    if (v === 'on') writeFlag(FLAG_KEY, '1')
    if (v === 'off') writeFlag(FLAG_KEY, null)
  } catch {
    // ignore
  }
}

// `compact` (the narrow strip): icon only below 640px, so it never crowds the clocks.
export function DesktopAppButton({ compact = false }: { compact?: boolean }) {
  const [enabled] = useState(() => {
    applyUrlSwitch()
    return DESKTOP_APP_READY || readFlag(FLAG_KEY) === '1'
  })
  const [asking, setAsking] = useState(false)
  const [trying, setTrying] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const timer = useRef<number | undefined>(undefined)
  const left = useRef(false)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  // The app sent the person here to sign in (?connect=app, see main.tsx). Now that they are signed in, connect the app
  // without another click. If the browser holds the link back, the usual "didn't open?" question follows.
  useEffect(() => {
    if (!enabled || !canUseHere()) return
    let wanted = false
    try {
      wanted = sessionStorage.getItem(CONNECT_KEY) === '1'
      sessionStorage.removeItem(CONNECT_KEY)
    } catch {
      // storage blocked
    }
    if (wanted) void open()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // close the question on Escape or a click elsewhere
  useEffect(() => {
    if (!asking) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setAsking(false)
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setAsking(false)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onDown)
    }
  }, [asking])

  if (!enabled || !canUseHere()) return null

  async function open() {
    setAsking(false)
    setTrying(true)
    left.current = false
    // Already signed in here, so hand the app a one-time code: it signs itself in,
    // with no password and no second login. The code lasts 60 seconds and works once.
    let link = OPEN_LINK
    let known: Set<string> | null = null
    try {
      // PCs already connected, so a new one appearing proves the app took the code
      known = new Set((await api.get<{ id: string }[]>('/hr/devices')).map((d) => d.id))
      const { code } = await api.post<{ code: string }>('/hr/device-code', {})
      link = `bpotime://connect?code=${encodeURIComponent(code)}`
    } catch {
      // no code: the app still opens, and can ask the person to sign in itself
      if (link === OPEN_LINK) known = null
    }
    const away = () => {
      left.current = true
    }
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') away()
    }
    window.addEventListener('blur', away)
    document.addEventListener('visibilitychange', onVisibility)

    window.location.href = link

    // The app is often already running with its window on top, so the browser never loses
    // focus. Its sign-in is the reliable signal: it swaps the code for a new connected PC,
    // which shows up in the devices list. Check that every second until the wait runs out.
    const started = Date.now()
    window.clearTimeout(timer.current)
    const check = async () => {
      let opened = left.current
      if (!opened && known) {
        try {
          const now = await api.get<{ id: string }[]>('/hr/devices')
          opened = now.some((d) => !known!.has(d.id))
        } catch {
          // keep waiting
        }
      }
      if (opened || Date.now() - started >= WAIT_MS) {
        window.removeEventListener('blur', away)
        document.removeEventListener('visibilitychange', onVisibility)
        setTrying(false)
        if (opened) writeFlag(SEEN_KEY, '1')
        else setAsking(true)
        return
      }
      timer.current = window.setTimeout(check, 1000)
    }
    timer.current = window.setTimeout(check, 1000)
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={open}
        disabled={trying}
        title="Launch the BPO Time desktop app (beta). You are signed in to it automatically."
        aria-label="Launch App (beta)"
        className="flex items-center gap-2 rounded-xl border border-white/15 bg-brand-950/85 px-3 py-2 text-xs font-semibold text-gray-100 shadow-lg backdrop-blur transition hover:bg-brand-950 disabled:opacity-70"
      >
        {/* a wrench: this is a beta, still being built */}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden="true">
          <path
            d="M14.7 6.3a4 4 0 0 0-5.4 5.1L3.5 17.2a1.8 1.8 0 0 0 2.6 2.6l5.8-5.8a4 4 0 0 0 5.1-5.4l-2.6 2.6-2.2-.5-.5-2.2z"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span className={compact ? 'hidden sm:inline' : undefined}>{trying ? 'Opening…' : 'Launch App (BETA)'}</span>
      </button>

      {asking && (
        <div
          role="dialog"
          aria-label="BPO Time did not open"
          className="absolute right-0 top-full z-50 mt-2 w-72 rounded-xl border border-white/15 bg-brand-950 p-4 text-left text-xs text-gray-200 shadow-2xl"
        >
          <p className="text-sm font-semibold text-white">Didn't open?</p>
          <p className="mt-1 leading-relaxed text-gray-300">
            If BPO Time is installed, allow your browser to open it and try again. If it isn't installed yet, download it.
          </p>
          <p className="mt-1 leading-relaxed text-gray-400">
            Windows may say "protected your PC" because the app isn't signed yet: choose More info, then Run anyway.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a
              href={RELEASES_URL}
              rel="noopener noreferrer"
              className="rounded-lg bg-brand-600 px-3 py-1.5 font-semibold text-white hover:bg-brand-700"
            >
              Download
            </a>
            <button
              type="button"
              onClick={open}
              className="rounded-lg border border-white/20 px-3 py-1.5 font-semibold text-gray-100 hover:bg-white/10"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => setAsking(false)}
              className="rounded-lg px-3 py-1.5 font-semibold text-gray-400 hover:text-gray-200"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
