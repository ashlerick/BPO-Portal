import { useEffect, useState } from 'react'
import { DesktopAppButton } from './DesktopAppButton'

// A small always-on-top clock for the two places the team works across:
// the Philippines and California. It uses each place's real time zone, so
// California's daylight-saving changes are handled by the browser.
// Click it to shrink it out of the way; the choice is remembered.

const ZONES = [
  { label: 'PH', name: 'Philippines', timeZone: 'Asia/Manila' },
  { label: 'CA', name: 'California', timeZone: 'America/Los_Angeles' },
] as const

const STORAGE_KEY = 'clock:hidden'

function readHidden(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

const timeFmt = (timeZone: string) =>
  new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true, timeZone })

const dayFmt = (timeZone: string) =>
  new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone })

const FORMATTERS = ZONES.map((z) => ({ ...z, time: timeFmt(z.timeZone), day: dayFmt(z.timeZone) }))

// A slim row at the top of the page: the clocks, and the Launch App button on a PC. It sits in the layout (sticky on
// desktop, so it stays in view while you scroll) instead of floating over the page, so it can never cover content.
export function WorldClock() {
  const [now, setNow] = useState(() => new Date())
  const [hidden, setHidden] = useState(readHidden)

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  function toggle() {
    setHidden((prev) => {
      try {
        localStorage.setItem(STORAGE_KEY, prev ? '0' : '1')
      } catch {
        // storage blocked, the choice just won't be remembered
      }
      return !prev
    })
  }

  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-brand-950/95 px-4 py-1.5 text-gray-100 backdrop-blur md:sticky md:top-0 md:z-30 md:justify-end md:px-8">
    <button
      type="button"
      onClick={toggle}
      title={hidden ? 'Show the clocks' : 'Hide the clocks'}
      aria-label={hidden ? 'Show the clocks' : 'Hide the clocks'}
      className="min-w-0 text-left"
    >
      {hidden ? (
        <span className="text-xs font-semibold tabular-nums">
          {FORMATTERS[0].label} {FORMATTERS[0].time.format(now).replace(/:\d\d /, ' ')}
        </span>
      ) : (
        <span className="flex items-center gap-4">
          {FORMATTERS.map((z) => (
            <span key={z.label} className="flex flex-col leading-tight">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                {z.label} · {z.day.format(now)}
              </span>
              <span className="text-sm font-semibold tabular-nums">{z.time.format(now)}</span>
            </span>
          ))}
        </span>
      )}
    </button>
    <div className="md:order-first">
      <DesktopAppButton compact />
    </div>
    </div>
  )
}
