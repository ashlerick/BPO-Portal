import { useEffect, useRef, useState } from 'react'
import { FOA_ATTENDANCE_COLUMNS, FOA_ATTENDANCE_FLAGS, FOA_TERRITORIES, type FoaReportData } from './foa'
import { chipOff, chipOn, softButton } from './foaUi'

type Cells = NonNullable<FoaReportData['attendance']>

const dayLabel = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })

interface Open {
  date: string
  column: string
  top: number
  left: number
}

// The attendance sheet: a day by column table where each cell shows its territories as chips and opens a picker on click. "Fill down"
// copies the first day's cell to every day; "Same as last week" brings last week's whole sheet in. Read-only, it is a plain table.
export function AttendanceGrid({
  dates,
  attendance,
  readOnly,
  onCell,
  onFillDown,
  onSameAsLastWeek,
}: {
  dates: string[]
  attendance: Cells
  readOnly?: boolean
  onCell: (date: string, column: string, tokens: string[]) => void
  onFillDown: (column: string) => void
  /** Present only when there is a report from last week to copy from. */
  onSameAsLastWeek?: () => void
}) {
  const [open, setOpen] = useState<Open | null>(null)
  const popRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return undefined
    const close = () => setOpen(null)
    const onDown = (e: MouseEvent) => {
      if (popRef.current?.contains(e.target as Node)) return
      if ((e.target as HTMLElement).closest('[data-attendance-cell]')) return
      close()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [open])

  function openCell(e: React.MouseEvent<HTMLButtonElement>, date: string, column: string) {
    if (open && open.date === date && open.column === column) {
      setOpen(null)
      return
    }
    const r = e.currentTarget.getBoundingClientRect()
    const width = 280
    setOpen({ date, column, top: Math.min(r.bottom + 4, window.innerHeight - 340), left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)) })
  }

  const current = open ? (attendance[open.date]?.[open.column as keyof Cells[string]] ?? []) : []

  function toggle(token: string) {
    if (!open) return
    onCell(open.date, open.column, current.includes(token) ? current.filter((t) => t !== token) : [...current, token])
  }

  const chip = 'rounded-md px-1.5 py-0.5 text-[11px] font-semibold leading-tight'

  return (
    <div>
      {!readOnly && onSameAsLastWeek && (
        <div className="mb-2">
          <button type="button" onClick={onSameAsLastWeek} className={softButton}>
            Same as last week
          </button>
        </div>
      )}
      <div className="overflow-x-auto rounded-xl border border-gray-300 dark:border-white/15">
        <table className="w-full min-w-[640px] table-fixed text-sm">
          <thead className="bg-gray-100 dark:bg-white/[0.08]">
            <tr>
              <th className="w-28 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-200">Day</th>
              {FOA_ATTENDANCE_COLUMNS.map((col) => (
                <th key={col} className="px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-200">
                  <span className="inline-flex items-center gap-2">
                    {col}
                    {!readOnly && (
                      <button
                        type="button"
                        onClick={() => onFillDown(col)}
                        className="rounded-md border border-gray-400 px-1.5 py-0.5 text-[10px] font-semibold normal-case tracking-normal text-gray-800 hover:bg-gray-200 dark:border-white/30 dark:text-gray-100 dark:hover:bg-white/10"
                        title={`Copy ${dates[0] ? dayLabel(dates[0]) : 'the first day'}'s value to every day`}
                      >
                        Fill down
                      </button>
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dates.map((date) => {
              const weekend = [0, 6].includes(new Date(`${date}T00:00:00Z`).getUTCDay())
              return (
                <tr key={date} className={`border-t border-gray-200 dark:border-white/10 ${weekend ? 'bg-gray-50 dark:bg-white/[0.03]' : ''}`}>
                  <td className="whitespace-nowrap px-3 py-1.5 text-sm font-medium text-gray-900 dark:text-gray-100">{dayLabel(date)}</td>
                  {FOA_ATTENDANCE_COLUMNS.map((col) => {
                    const tokens = attendance[date]?.[col] ?? []
                    const isOpen = open?.date === date && open.column === col
                    const chips =
                      tokens.length === 0 ? (
                        <span className="text-xs text-gray-500 dark:text-gray-400">{readOnly ? '—' : 'Select'}</span>
                      ) : (
                        tokens.map((t) => (
                          <span
                            key={t}
                            className={`${chip} ${
                              (FOA_ATTENDANCE_FLAGS as readonly string[]).includes(t)
                                ? 'bg-gray-300 text-gray-900 dark:bg-white/20 dark:text-white'
                                : 'bg-brand-600 text-white dark:bg-brand-500'
                            }`}
                          >
                            {t}
                          </span>
                        ))
                      )
                    return (
                      <td key={col} className="px-1.5 py-1.5">
                        {readOnly ? (
                          <div className="flex min-h-[2rem] flex-wrap items-center gap-1 px-1">{chips}</div>
                        ) : (
                          <button
                            type="button"
                            data-attendance-cell
                            onClick={(e) => openCell(e, date, col)}
                            aria-label={`${col}, ${dayLabel(date)}: ${tokens.length ? tokens.join(', ') : 'empty'}`}
                            className={`flex min-h-[2.25rem] w-full flex-wrap items-center gap-1 rounded-lg border px-2 py-1 text-left transition ${
                              isOpen
                                ? 'border-brand-600 bg-brand-50 ring-2 ring-brand-500/40 dark:border-brand-400 dark:bg-white/10'
                                : 'border-gray-300 bg-white hover:border-brand-600 dark:border-white/20 dark:bg-black/25 dark:hover:border-brand-400'
                            }`}
                          >
                            {chips}
                          </button>
                        )}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {open && (
        <div
          ref={popRef}
          role="dialog"
          aria-label={`${open.column}, ${dayLabel(open.date)}`}
          style={{ position: 'fixed', top: open.top, left: open.left, width: 280 }}
          className="z-50 rounded-xl border border-gray-400 bg-white p-3 shadow-2xl dark:border-white/25 dark:bg-[#0d2a1d]"
        >
          <p className="mb-2 text-xs font-semibold text-gray-700 dark:text-gray-200">
            {open.column} · {dayLabel(open.date)}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {FOA_TERRITORIES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => toggle(t)}
                className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition ${current.includes(t) ? chipOn : chipOff}`}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-gray-200 pt-2.5 dark:border-white/15">
            {FOA_ATTENDANCE_FLAGS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => toggle(t)}
                className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition ${current.includes(t) ? 'border-gray-800 bg-gray-800 text-white dark:border-white dark:bg-white dark:text-gray-900' : chipOff}`}
              >
                {t}
              </button>
            ))}
            <span className="flex-1" />
            <button type="button" onClick={() => onCell(open.date, open.column, [])} className="text-xs font-medium text-gray-700 hover:underline dark:text-gray-200">
              Clear
            </button>
            <button type="button" onClick={() => setOpen(null)} className="rounded-lg bg-brand-600 px-3 py-1 text-xs font-semibold text-white hover:bg-brand-700 dark:bg-brand-500">
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
