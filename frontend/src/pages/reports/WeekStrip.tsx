import { useEffect, useRef, useState } from 'react'
import type { ReportStatus } from './types'
import type { FoaWeek } from './foaWeeks.ts'

const dotTone: Record<ReportStatus, string> = {
  draft: 'bg-gray-400',
  submitted: 'bg-blue-500',
  reviewed: 'bg-purple-500',
  approved: 'bg-green-500',
  rejected: 'bg-red-500',
}

// What needs someone's attention comes first when a month holds several reports.
const ORDER: ReportStatus[] = ['rejected', 'draft', 'submitted', 'reviewed', 'approved']

const monthOf = (iso: string) => iso.slice(0, 7)
const monthName = (key: string) => new Date(`${key}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })
const shortDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
const dayOf = (iso: string) => Number(iso.slice(8, 10))

// The year's weeks as two short rows instead of one long one: Summary and the months, then only the selected month's weeks. A week
// belongs to the month its Friday falls in. A dot is the state of a report, and on a month it is the one needing the most attention.
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
  const months = [...new Set(weeks.map((w) => monthOf(w.end)))]
  // On Summary no week says which month to show, so it is the one last picked, or the latest month the year has.
  const [pickedMonth, setPickedMonth] = useState<string | null>(null)
  const active = selected !== 'summary' ? monthOf(selected) : months.includes(pickedMonth ?? '') ? (pickedMonth as string) : months[months.length - 1]
  const inMonth = weeks.filter((w) => monthOf(w.end) === active)

  const selectedRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    selectedRef.current?.scrollIntoView({ inline: 'center', block: 'nearest' })
  }, [selected, year])

  const worst = (list: FoaWeek[]): ReportStatus | undefined => {
    const found = list.map((w) => statusOf(w.end)).filter((s): s is ReportStatus => !!s)
    return ORDER.find((s) => found.includes(s))
  }

  const chip = 'relative shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-semibold transition'
  const idle = 'text-gray-800 hover:bg-gray-100 dark:text-gray-100 dark:hover:bg-white/10'
  const on = 'bg-brand-600 text-white shadow-sm'
  const noScrollbar = '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden'

  return (
    <div className="min-w-0 space-y-1.5 rounded-xl border border-gray-300 bg-white px-2 py-1.5 shadow-sm dark:border-white/15 dark:bg-[#0a1f16]">
      <div className="flex min-w-0 items-center gap-1">
        <button
          type="button"
          onClick={() => onYear(-1)}
          disabled={year <= minYear}
          aria-label="Previous year"
          className="h-7 w-7 shrink-0 rounded text-base font-bold text-gray-800 hover:bg-gray-100 disabled:opacity-30 dark:text-gray-100 dark:hover:bg-white/10"
        >
          ‹
        </button>
        <span className="w-11 shrink-0 text-center text-sm font-bold text-gray-900 dark:text-white">{year}</span>
        <button
          type="button"
          onClick={() => onYear(1)}
          disabled={year >= maxYear}
          aria-label="Next year"
          className="h-7 w-7 shrink-0 rounded text-base font-bold text-gray-800 hover:bg-gray-100 disabled:opacity-30 dark:text-gray-100 dark:hover:bg-white/10"
        >
          ›
        </button>
        <span className="mx-1 h-5 w-px shrink-0 bg-gray-300 dark:bg-white/25" />
        <div role="tablist" aria-label={`Months of ${year}`} className={`flex min-w-0 gap-1 overflow-x-auto ${noScrollbar}`}>
          <button
            type="button"
            role="tab"
            aria-selected={selected === 'summary'}
            ref={selected === 'summary' ? selectedRef : undefined}
            onClick={onSummary}
            className={`${chip} ${selected === 'summary' ? on : 'border border-brand-600 text-brand-700 hover:bg-brand-50 dark:border-brand-400 dark:text-brand-300 dark:hover:bg-white/10'}`}
          >
            Summary
          </button>
          {months.map((m) => {
            const isActive = selected !== 'summary' && m === active
            const status = worst(weeks.filter((w) => monthOf(w.end) === m))
            return (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => {
                  // A month is opened on its last week, the one usually still to do.
                  const last = weeks.filter((w) => monthOf(w.end) === m).at(-1)
                  setPickedMonth(m)
                  if (last) onWeek(last.end)
                }}
                className={`${chip} ${isActive ? on : idle}`}
              >
                {monthName(m)}
                {status && <span className={`absolute right-1 top-1 h-1.5 w-1.5 rounded-full ${isActive ? 'bg-white' : dotTone[status]}`} />}
              </button>
            )
          })}
        </div>
      </div>

      {selected !== 'summary' && inMonth.length > 0 && (
        <div role="tablist" aria-label={`Weeks of ${monthName(active)}`} className={`flex min-w-0 gap-1 overflow-x-auto border-t border-gray-200 pt-1.5 dark:border-white/10 ${noScrollbar}`}>
          {inMonth.map((w) => {
            const status = statusOf(w.end)
            const isActive = selected === w.end
            return (
              <button
                key={w.end}
                type="button"
                role="tab"
                aria-selected={isActive}
                ref={isActive ? selectedRef : undefined}
                onClick={() => onWeek(w.end)}
                title={`Week ${w.num}: ${shortDate(w.start)} to ${shortDate(w.end)}`}
                className={`${chip} flex flex-col items-start py-1 text-left leading-tight ${isActive ? on : idle}`}
              >
                <span>Week {String(w.num).padStart(2, '0')}</span>
                <span className={`text-[11px] font-normal ${isActive ? 'text-white/85' : 'text-gray-600 dark:text-gray-300'}`}>
                  {monthName(monthOf(w.start))} {dayOf(w.start)}–{monthOf(w.start) === monthOf(w.end) ? '' : `${monthName(monthOf(w.end))} `}
                  {dayOf(w.end)}
                </span>
                {status && <span className={`absolute right-1 top-1 h-1.5 w-1.5 rounded-full ${isActive ? 'bg-white' : dotTone[status]}`} />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
