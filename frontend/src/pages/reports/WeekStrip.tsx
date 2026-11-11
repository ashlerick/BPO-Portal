import { useEffect, useRef } from 'react'
import type { ReportStatus } from './types'
import type { FoaWeek } from './foaWeeks.ts'

const dotTone: Record<ReportStatus, string> = {
  draft: 'bg-gray-400',
  submitted: 'bg-blue-500',
  reviewed: 'bg-purple-500',
  approved: 'bg-green-500',
  rejected: 'bg-red-500',
}

const shortDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

// The year's weeks in one scrollable row, like the tabs of the yearly time sheet: Summary first, then Week 01 and on. The mouse wheel
// moves it sideways. A dot on a week is the state of its report.
export function WeekStrip({
  year,
  weeks,
  selected,
  statusOf,
  minYear,
  maxYear,
  onYear,
  onWeek,
  onSummary,
}: {
  year: number
  weeks: FoaWeek[]
  /** A week's end date, or 'summary'. */
  selected: string
  statusOf: (end: string) => ReportStatus | undefined
  minYear: number
  maxYear: number
  onYear: (delta: number) => void
  onWeek: (end: string) => void
  onSummary: () => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const selectedRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    selectedRef.current?.scrollIntoView({ inline: 'center', block: 'nearest' })
  }, [selected, year])

  // A wheel turns vertically; here it moves the strip sideways. Added by hand because React's wheel handler cannot cancel the page scroll.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return undefined
    const onWheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth) return
      const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
      if (!d) return
      el.scrollLeft += d
      e.preventDefault()
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const chip = 'relative shrink-0 whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium transition'
  const idle = 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/10'
  const on = 'bg-brand-600 text-white shadow-sm'

  return (
    <div className="flex min-w-0 items-center gap-1 rounded-xl border border-black/5 bg-white/80 px-2 py-1.5 dark:border-white/10 dark:bg-white/[0.035]">
      <button
        type="button"
        onClick={() => onYear(-1)}
        disabled={year <= minYear}
        aria-label="Previous year"
        className="h-6 w-6 shrink-0 rounded text-gray-500 hover:bg-gray-100 disabled:opacity-30 dark:hover:bg-white/10"
      >
        ‹
      </button>
      <span className="w-10 shrink-0 text-center text-sm font-semibold text-gray-800 dark:text-gray-100">{year}</span>
      <button
        type="button"
        onClick={() => onYear(1)}
        disabled={year >= maxYear}
        aria-label="Next year"
        className="h-6 w-6 shrink-0 rounded text-gray-500 hover:bg-gray-100 disabled:opacity-30 dark:hover:bg-white/10"
      >
        ›
      </button>
      <span className="mx-1 h-4 w-px shrink-0 bg-gray-200 dark:bg-white/15" />
      <div ref={scrollRef} role="tablist" aria-label={`Weeks of ${year}`} className="flex min-w-0 gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <button
          type="button"
          role="tab"
          aria-selected={selected === 'summary'}
          ref={selected === 'summary' ? selectedRef : undefined}
          onClick={onSummary}
          className={`${chip} ${selected === 'summary' ? on : 'text-brand-700 hover:bg-brand-50 dark:text-brand-300 dark:hover:bg-white/10'}`}
        >
          Summary
        </button>
        {weeks.map((w) => {
          const status = statusOf(w.end)
          const active = selected === w.end
          return (
            <button
              key={w.end}
              type="button"
              role="tab"
              aria-selected={active}
              ref={active ? selectedRef : undefined}
              onClick={() => onWeek(w.end)}
              title={`Week ${w.num}: ${shortDate(w.start)} to ${shortDate(w.end)}`}
              className={`${chip} ${active ? on : idle}`}
            >
              Week {String(w.num).padStart(2, '0')}
              {status && <span className={`absolute right-1 top-1 h-1.5 w-1.5 rounded-full ${active ? 'bg-white' : dotTone[status]}`} />}
            </button>
          )
        })}
      </div>
    </div>
  )
}

