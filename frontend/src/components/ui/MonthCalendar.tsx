import { useState } from 'react'
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
const monthFmt = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })

function iso(year: number, month: number, day: number): string {
  return new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10)
}

export function MonthCalendar({ events, todayIso }: { events: CalendarEvent[]; todayIso?: string }) {
  const start = todayIso ? new Date(todayIso) : new Date()
  const [year, setYear] = useState(start.getUTCFullYear())
  const [month, setMonth] = useState(start.getUTCMonth())

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
                    {dayEvents.slice(0, 3).map((e) => (
                      <div
                        key={e.id}
                        title={e.label}
                        className={`truncate rounded px-1 py-0.5 text-[10px] leading-tight sm:text-xs ${toneClasses[e.tone ?? 'brand']}`}
                      >
                        {e.label}
                      </div>
                    ))}
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
