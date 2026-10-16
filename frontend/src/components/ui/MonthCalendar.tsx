import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Button } from './Button'

// A plain month grid with events dropped onto days. Dates are ISO
// "YYYY-MM-DD" strings throughout (no timezone math), matching how the
// rest of the app treats calendar days.

export interface CalendarEvent {
  id: string
  date: string
  label: string
  tone?: 'brand' | 'amber' | 'red' | 'blue' | 'purple'
}

const toneClasses: Record<NonNullable<CalendarEvent['tone']>, string> = {
  brand: 'bg-brand-600/15 text-brand-800 dark:text-brand-300',
  amber: 'bg-amber-500/15 text-amber-800 dark:text-amber-300',
  red: 'bg-red-500/15 text-red-800 dark:text-red-300',
  blue: 'bg-blue-500/15 text-blue-800 dark:text-blue-300',
  purple: 'bg-purple-500/15 text-purple-800 dark:text-purple-300',
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const dayFmt = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })

// Where the hover card goes: just above (or below, near the top of the screen) the event that was pointed at.
interface Tip {
  label: string
  date: string
  x: number
  top: number
  bottom: number
}
const monthFmt = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })

function iso(year: number, month: number, day: number): string {
  return new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10)
}

export function MonthCalendar({ events, todayIso }: { events: CalendarEvent[]; todayIso?: string }) {
  const start = todayIso ? new Date(todayIso) : new Date()
  const [year, setYear] = useState(start.getUTCFullYear())
  const [month, setMonth] = useState(start.getUTCMonth())
  const [tip, setTip] = useState<Tip | null>(null)

  const firstWeekday = new Date(Date.UTC(year, month, 1)).getUTCDay()
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  const cells: (string | null)[] = [
    ...Array<null>(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => iso(year, month, i + 1)),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  const byDate = new Map<string, CalendarEvent[]>()
  for (const e of events) {
    const list = byDate.get(e.date) ?? []
    list.push(e)
    byDate.set(e.date, list)
  }

  function shift(delta: number) {
    const d = new Date(Date.UTC(year, month + delta, 1))
    setYear(d.getUTCFullYear())
    setMonth(d.getUTCMonth())
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <Button size="sm" onClick={() => shift(-1)} aria-label="Previous month">
          ←
        </Button>
        <span className="font-medium text-gray-900 dark:text-gray-100">
          {monthFmt.format(new Date(Date.UTC(year, month, 1)))}
        </span>
        <Button size="sm" onClick={() => shift(1)} aria-label="Next month">
          →
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-black/5 bg-black/5 text-xs dark:border-white/10 dark:bg-white/10">
        {WEEKDAYS.map((d) => (
          <div key={d} className="bg-gray-50 px-1 py-1.5 text-center font-medium text-gray-500 dark:bg-[#0d2016] dark:text-gray-400">
            {d}
          </div>
        ))}
        {cells.map((date, i) => {
          const dayEvents = date ? (byDate.get(date) ?? []) : []
          const isToday = date !== null && date === todayIso
          return (
            <div key={date ?? `pad-${i}`} className="min-h-14 bg-white p-1 dark:bg-[#0b1a12] sm:min-h-20">
              {date && (
                <>
                  <div
                    className={`mb-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] ${isToday ? 'bg-brand-600 font-semibold text-white' : 'text-gray-500 dark:text-gray-400'}`}
                  >
                    {Number(date.slice(8))}
                  </div>
                  <div className="space-y-0.5">
                    {dayEvents.slice(0, 3).map((e) => {
                      const show = (el: HTMLElement) => {
                        const r = el.getBoundingClientRect()
                        setTip({ label: e.label, date: e.date, x: r.left + r.width / 2, top: r.top, bottom: r.bottom })
                      }
                      return (
                        // Up to two lines, so a name is readable; the full text and date show in the hover card.
                        <div
                          key={e.id}
                          tabIndex={0}
                          aria-label={`${e.label}, ${dayFmt.format(new Date(`${e.date}T00:00:00Z`))}`}
                          onMouseEnter={(ev) => show(ev.currentTarget)}
                          onFocus={(ev) => show(ev.currentTarget)}
                          onMouseLeave={() => setTip(null)}
                          onBlur={() => setTip(null)}
                          className={`line-clamp-2 break-words rounded px-1 py-0.5 text-[10px] leading-tight outline-none focus-visible:ring-2 focus-visible:ring-brand-500 sm:text-xs ${toneClasses[e.tone ?? 'brand']}`}
                        >
                          {e.label}
                        </div>
                      )
                    })}
                    {dayEvents.length > 3 && (
                      <div className="px-1 text-[10px] text-gray-500 dark:text-gray-400">+{dayEvents.length - 3} more</div>
                    )}
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>
      {tip &&
        // Rendered at the page root and positioned by the screen, so the calendar's clipped edges cannot cut it off.
        createPortal(
          <div
            role="tooltip"
            style={{
              position: 'fixed',
              left: Math.min(Math.max(tip.x, 140), window.innerWidth - 140),
              top: tip.top < 90 ? tip.bottom + 8 : tip.top - 8,
              transform: tip.top < 90 ? 'translateX(-50%)' : 'translate(-50%, -100%)',
            }}
            className="pointer-events-none z-[60] w-max max-w-[17rem] rounded-lg border border-white/15 bg-gray-950 px-3 py-2 text-xs leading-snug text-gray-100 shadow-xl"
          >
            <div className="font-semibold">{tip.label}</div>
            <div className="mt-0.5 text-gray-400">{dayFmt.format(new Date(`${tip.date}T00:00:00Z`))}</div>
          </div>,
          document.body,
        )}
    </div>
  )
}

// Expands an inclusive ISO date range into one ISO date per day.
export function eachDay(startIso: string, endIso: string): string[] {
  const out: string[] = []
  const end = new Date(endIso.slice(0, 10))
  for (let d = new Date(startIso.slice(0, 10)); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10))
  }
  return out
}
