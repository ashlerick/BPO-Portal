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

// `floating` sits over the page's top-right corner (desktop). `strip` is a
// normal full-width row under the mobile header, so it never covers content.
export function WorldClock({ variant = 'floating' }: { variant?: 'floating' | 'strip' }) {
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

  // Desktop: the corner holds the download button (when there is one) and the clocks.
  if (variant === 'floating') {
    return (
      <div className="fixed right-3 top-3 z-40 hidden items-center gap-2 md:flex">
        <DesktopAppButton />
      <button
        type="button"
        onClick={toggle}
        title={hidden ? 'Show the clocks' : 'Hide the clocks'}
        aria-label={hidden ? 'Show the clocks' : 'Hide the clocks'}
        className={
          variant === 'floating'
            ? 'rounded-xl border border-white/15 bg-brand-950/85 px-3 py-1.5 text-left text-gray-100 shadow-lg backdrop-blur transition hover:bg-brand-950'
            : 'block w-full border-b border-white/10 bg-brand-950 px-4 py-1.5 text-left text-gray-100 md:hidden'
        }
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
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={toggle}
      title={hidden ? 'Show the clocks' : 'Hide the clocks'}
      aria-label={hidden ? 'Show the clocks' : 'Hide the clocks'}
      className="block w-full border-b border-white/10 bg-brand-950 px-4 py-1.5 text-left text-gray-100 md:hidden"
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
  )
}
