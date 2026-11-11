import { useEffect, useRef, useState } from 'react'
import { FOA_ATTENDANCE_COLUMNS, FOA_ATTENDANCE_FLAGS, FOA_TERRITORIES, type FoaReportData } from './foa'

type Cells = NonNullable<FoaReportData['attendance']>

const dayLabel = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })

interface Open {
  date: string
  column: string
  top: number
  left: number
}

// The attendance sheet: a day by column table where each cell shows its territories as small chips and opens a picker on click. Replaces
// the tall multi-select boxes. "fill ↓" copies the first day's cell to every day; "Same as last week" brings last week's whole sheet in.
export function AttendanceGrid({
  dates,
  attendance,
  onCell,
  onFillDown,
  onSameAsLastWeek,
}: {
  dates: string[]
  attendance: Cells
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
    const width = 260
    setOpen({ date, column, top: Math.min(r.bottom + 4, window.innerHeight - 330), left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)) })
  }

  const current = open ? (attendance[open.date]?.[open.column as keyof Cells[string]] ?? []) : []

  function toggle(token: string) {
    if (!open) return
    const next = current.includes(token) ? current.filter((t) => t !== token) : [...current, token]
    onCell(open.date, open.column, next)
  }

  const chip = 'rounded px-1.5 py-0.5 text-[10.5px] font-medium leading-tight'

  return (
    <div>
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Attendance Task Sheet</p>
        {onSameAsLastWeek && (
          <button
            type="button"
            onClick={onSameAsLastWeek}
            className="rounded-md border border-brand-300 px-2 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50 dark:border-brand-700 dark:text-brand-300 dark:hover:bg-white/10"
          >
            Same as last week
          </button>
        )}
      </div>
      <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800">
        <table className="w-full table-fixed text-sm">
          <thead className="bg-gray-50 dark:bg-gray-900">
            <tr>
              <th className="w-24 px-2 py-1.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Day</th>
              {FOA_ATTENDANCE_COLUMNS.map((col) => (
                <th key={col} className="min-w-[8.5rem] px-2 py-1.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
                  <span className="inline-flex items-center gap-1.5">
                    {col}
                    <button
                      type="button"
                      onClick={() => onFillDown(col)}
                      className="rounded border border-gray-300 px-1 text-[10px] font-normal text-gray-500 hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-800"
                      title={`Copy ${dates[0] ? dayLabel(dates[0]) : 'the first day'}'s value to every day`}
                    >
                      fill ↓
                    </button>
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dates.map((date) => (
              <tr key={date} className="border-t border-gray-100 dark:border-gray-800">
                <td className="whitespace-nowrap px-2 py-1 text-xs text-gray-600 dark:text-gray-400">{dayLabel(date)}</td>
                {FOA_ATTENDANCE_COLUMNS.map((col) => {
                  const tokens = attendance[date]?.[col] ?? []
                  const isOpen = open?.date === date && open.column === col
                  return (
                    <td key={col} className="px-1 py-1">
                      <button
                        type="button"
                        data-attendance-cell
                        onClick={(e) => openCell(e, date, col)}
                        aria-label={`${col}, ${dayLabel(date)}: ${tokens.length ? tokens.join(', ') : 'empty'}`}
                        className={`flex min-h-[1.9rem] w-full flex-wrap items-center gap-1 rounded-md border px-1.5 py-1 text-left transition ${
                          isOpen
                            ? 'border-brand-500 bg-brand-50 dark:bg-white/10'
                            : 'border-transparent hover:border-gray-300 hover:bg-gray-50 dark:hover:border-white/20 dark:hover:bg-white/5'
                        }`}
                      >
                        {tokens.length === 0 ? (
                          <span className="text-xs text-gray-300 dark:text-gray-600">+</span>
                        ) : (
                          tokens.map((t) => (
                            <span
                              key={t}
                              className={`${chip} ${
                                (FOA_ATTENDANCE_FLAGS as readonly string[]).includes(t)
                                  ? 'bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300'
                                  : 'bg-brand-100 text-brand-800 dark:bg-brand-900/60 dark:text-brand-300'
                              }`}
                            >
                              {t}
                            </span>
                          ))
                        )}
                      </button>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {open && (
        <div
          ref={popRef}
          role="dialog"
          aria-label={`${open.column}, ${dayLabel(open.date)}`}
          style={{ position: 'fixed', top: open.top, left: open.left, width: 260 }}
          className="z-50 rounded-xl border border-black/10 bg-white p-3 shadow-xl dark:border-white/15 dark:bg-gray-900"
        >
          <p className="mb-2 text-xs font-medium text-gray-500 dark:text-gray-400">
            {open.column} · {dayLabel(open.date)}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {FOA_TERRITORIES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => toggle(t)}
                className={`rounded-full border px-2 py-0.5 text-[11px] font-medium transition ${
                  current.includes(t)
                    ? 'border-brand-600 bg-brand-600 text-white'
                    : 'border-gray-300 text-gray-600 hover:border-gray-400 dark:border-gray-700 dark:text-gray-300'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-gray-100 pt-2 dark:border-white/10">
            {FOA_ATTENDANCE_FLAGS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => toggle(t)}
                className={`rounded-full border px-2 py-0.5 text-[11px] font-medium transition ${
                  current.includes(t) ? 'border-gray-700 bg-gray-700 text-white' : 'border-gray-300 text-gray-600 dark:border-gray-700 dark:text-gray-300'
                }`}
              >
                {t}
              </button>
            ))}
            <span className="flex-1" />
            <button type="button" onClick={() => onCell(open.date, open.column, [])} className="text-[11px] text-gray-500 hover:underline">
              Clear
            </button>
            <button type="button" onClick={() => setOpen(null)} className="rounded-md bg-brand-600 px-2 py-0.5 text-[11px] font-medium text-white">
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
