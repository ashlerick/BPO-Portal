import { useMemo, useState } from 'react'
import {
  FOA_ATTENDANCE_COLUMNS,
  FOA_ATTENDANCE_FLAGS,
  FOA_CHECKLIST_DAYS,
  FOA_CHECKLIST_TASKS,
  FOA_MAKE_UP_DAY,
  FOA_TERRITORIES,
  foaAttendanceDates,
  foaMakeUpSaturday,
  foaMakeUpUsed,
  type FoaAttendanceColumn,
  type FoaChecklistDay,
  type FoaReportData,
} from './foa'
import { addDays, startFromPrevious } from './foaWeeks.ts'
import { chipOff, chipOn, label } from './foaUi'
import type { WeeklyReport } from './types'

type Attendance = NonNullable<FoaReportData['attendance']>
type Checklist = NonNullable<FoaReportData['taskChecklist']>

const weekday = (iso: string, style: 'long' | 'short') => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { weekday: style, timeZone: 'UTC' })
const dayNum = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

const card = 'rounded-2xl border border-gray-300 bg-white p-4 shadow-sm dark:border-white/15 dark:bg-[#0a1f16] sm:p-5'
const link = 'text-xs font-semibold text-brand-700 hover:underline dark:text-brand-300'

// One cell's worth of territories: the picks as chips, and an Add button that opens the full list. The territories you were assigned come
// first, because that is nearly always what a day was spent on.
function TokenPicker({ value, assigned, onChange, name }: { value: string[]; assigned: string[]; onChange: (next: string[]) => void; name: string }) {
  const [open, setOpen] = useState(false)
  const toggle = (t: string) => onChange(value.includes(t) ? value.filter((x) => x !== t) : [...value, t])
  const mine = FOA_TERRITORIES.filter((t) => assigned.includes(t))
  const others = FOA_TERRITORIES.filter((t) => !assigned.includes(t))
  const chip = (t: string) => (
    <button
      key={t}
      type="button"
      onClick={() => toggle(t)}
      aria-pressed={value.includes(t)}
      className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition ${value.includes(t) ? chipOn : chipOff}`}
    >
      {t}
    </button>
  )
  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        {value.length === 0 && !open && <span className="text-xs text-gray-500 dark:text-gray-400">Nothing yet</span>}
        {value.map((t) => (
          <button key={t} type="button" onClick={() => toggle(t)} aria-label={`Remove ${t} from ${name}`} className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${chipOn}`}>
            {t} <span aria-hidden="true">×</span>
          </button>
        ))}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="rounded-full border border-dashed border-gray-400 px-2.5 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100 dark:border-white/40 dark:text-gray-200 dark:hover:bg-white/10"
        >
          {open ? 'Done' : '+ Add'}
        </button>
      </div>
      {open && (
        <div className="mt-2 space-y-2 rounded-xl bg-gray-50 p-3 dark:bg-white/[0.05]">
          {mine.length > 0 && (
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">Your territories</p>
              <div className="flex flex-wrap gap-1.5">{mine.map(chip)}</div>
            </div>
          )}
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">{mine.length ? 'Other territories' : 'Territories'}</p>
            <div className="flex flex-wrap gap-1.5">{others.map(chip)}</div>
          </div>
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">Other</p>
            <div className="flex flex-wrap gap-1.5">{FOA_ATTENDANCE_FLAGS.map(chip)}</div>
          </div>
        </div>
      )}
    </div>
  )
}

// The week as days. Pick a day, fill in what was covered and which tasks were done, move on. Your assigned territories sit above and feed
// the pickers. "Same as yesterday" carries a day forward, so a steady week is a few taps.
export function DaySheet({
  report,
  data,
  onChange,
  previous,
}: {
  report: WeeklyReport
  data: FoaReportData
  onChange: (patch: Partial<FoaReportData>) => void
  previous?: FoaReportData
}) {
  const baseDates = useMemo(() => foaAttendanceDates(report.periodStart, report.periodEnd), [report.periodStart, report.periodEnd])
  const start = report.periodStart.slice(0, 10)
  const end = report.periodEnd.slice(0, 10)
  const attendance: Attendance = data.attendance ?? {}
  const checklist: Checklist = data.taskChecklist ?? {}
  const territories = data.territories ?? []

  // The Saturday after a Monday-to-Friday week is a make-up day: it appears once it has entries or you add it.
  const saturday = foaMakeUpSaturday(report.periodStart, report.periodEnd)
  const [satAdded, setSatAdded] = useState(false)
  const showSaturday = !!saturday && (satAdded || foaMakeUpUsed(data, saturday))
  const dates = showSaturday && saturday ? [...baseDates, saturday] : baseDates

  const today = new Date().toISOString().slice(0, 10)
  const [picked, setSelected] = useState(today)
  // Today when it falls in this week, otherwise the last working day. Derived, so a different week never leaves a stale pick.
  const selected = dates.includes(picked) ? picked : baseDates[baseDates.length - 1]

  // Tasks are tracked on the working days, Monday to Friday, and on a make-up Saturday. An older Friday-to-Friday report also has the
  // Friday that opened it (last week's) and a weekend, which have coverage only.
  const taskDayOf = (date: string): FoaChecklistDay | null => {
    if (date === saturday) return FOA_MAKE_UP_DAY
    const name = weekday(date, 'long') as (typeof FOA_CHECKLIST_DAYS)[number]
    if (!FOA_CHECKLIST_DAYS.includes(name)) return null
    return name === 'Friday' && date === baseDates[0] && baseDates.length > 5 ? null : name
  }

  const tokens = (date: string, col: FoaAttendanceColumn) => attendance[date]?.[col] ?? []
  const filledCells = (date: string) => FOA_ATTENDANCE_COLUMNS.filter((c) => tokens(date, c).length > 0).length
  const doneTasks = (date: string) => {
    const day = taskDayOf(date)
    return day ? FOA_CHECKLIST_TASKS.filter((t) => checklist[t]?.[day]).length : 0
  }
  const touched = (date: string) => filledCells(date) > 0 || doneTasks(date) > 0

  const setCell = (date: string, col: FoaAttendanceColumn, next: string[]) => onChange({ attendance: { ...attendance, [date]: { ...attendance[date], [col]: next } } })
  const setTask = (task: (typeof FOA_CHECKLIST_TASKS)[number], day: FoaChecklistDay, done: boolean) =>
    onChange({ taskChecklist: { ...checklist, [task]: { ...checklist[task], [day]: done } } })

  const index = dates.indexOf(selected)
  const prevDate = index > 0 ? dates[index - 1] : null
  const day = taskDayOf(selected)

  // Copy the day before: its coverage, and (Monday to Friday) its ticks.
  function sameAsPrevious() {
    if (!prevDate) return
    const nextAttendance = { ...attendance, [selected]: JSON.parse(JSON.stringify(attendance[prevDate] ?? {})) }
    const prevDay = taskDayOf(prevDate)
    const patch: Partial<FoaReportData> = { attendance: nextAttendance }
    if (day && prevDay) {
      const nextList: Checklist = { ...checklist }
      for (const t of FOA_CHECKLIST_TASKS) nextList[t] = { ...nextList[t], [day]: !!checklist[t]?.[prevDay] }
      patch.taskChecklist = nextList
    }
    onChange(patch)
  }

  const allDone = day ? FOA_CHECKLIST_TASKS.every((t) => checklist[t]?.[day]) : false
  const setAll = (done: boolean) => {
    if (!day) return
    const nextList: Checklist = { ...checklist }
    for (const t of FOA_CHECKLIST_TASKS) nextList[t] = { ...nextList[t], [day]: done }
    onChange({ taskChecklist: nextList })
  }

  const toggleTerritory = (name: string) => onChange({ territories: territories.includes(name) ? territories.filter((x) => x !== name) : [...territories, name] })

  return (
    <div className="space-y-4">
      <section id="sec-territory" className={`${card} scroll-mt-4`}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h3 className="text-base font-bold text-gray-900 dark:text-white">Your territories this week</h3>
            <p className="text-xs text-gray-600 dark:text-gray-300">Pick them once. They are offered first when you fill in each day.</p>
          </div>
          <span className="flex gap-3">
            <button type="button" className={link} onClick={() => onChange({ territories: [...FOA_TERRITORIES] })}>
              Select all
            </button>
            <button type="button" className="text-xs font-semibold text-gray-700 hover:underline dark:text-gray-300" onClick={() => onChange({ territories: [] })}>
              Clear
            </button>
          </span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {FOA_TERRITORIES.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => toggleTerritory(name)}
              aria-pressed={territories.includes(name)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${territories.includes(name) ? chipOn : chipOff}`}
            >
              {name}
            </button>
          ))}
        </div>
      </section>

      <section id="sec-days" className={`${card} scroll-mt-4`}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h3 className="text-base font-bold text-gray-900 dark:text-white">Day by day</h3>
            <p className="text-xs text-gray-600 dark:text-gray-300">What you covered and which tasks you did, one day at a time.</p>
          </div>
          {previous?.attendance && (
            <button
              type="button"
              className={link}
              onClick={() => onChange({ attendance: startFromPrevious(previous, addDays(start, -7), start, end).attendance })}
              title="Replace the coverage with last week's, moved to this week's dates"
            >
              Copy last week’s coverage
            </button>
          )}
        </div>

        <div role="tablist" aria-label="Days of the week" className="-mx-1 mt-3 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {dates.map((d) => {
            const active = d === selected
            return (
              <button
                key={d}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setSelected(d)}
                className={`relative flex min-w-[3.6rem] shrink-0 flex-col items-center rounded-xl border px-2.5 py-2 transition ${
                  active
                    ? 'border-brand-600 bg-brand-600 text-white dark:border-brand-400 dark:bg-brand-500'
                    : 'border-gray-300 text-gray-800 hover:bg-gray-100 dark:border-white/20 dark:text-gray-100 dark:hover:bg-white/10'
                }`}
              >
                <span className="text-xs font-bold uppercase">{weekday(d, 'short')}</span>
                <span className={`text-[11px] ${active ? 'text-white/80' : 'text-gray-600 dark:text-gray-300'}`}>{dayNum(d)}</span>
                <span
                  aria-hidden="true"
                  className={`mt-1 h-1.5 w-1.5 rounded-full ${touched(d) ? (active ? 'bg-white' : 'bg-brand-600 dark:bg-brand-400') : active ? 'bg-white/40' : 'bg-gray-300 dark:bg-white/25'}`}
                />
                <span className="sr-only">{touched(d) ? 'has entries' : 'empty'}</span>
              </button>
            )
          })}
          {saturday && !showSaturday && (
            <button
              type="button"
              onClick={() => {
                setSatAdded(true)
                setSelected(saturday)
              }}
              title="Add a Saturday, for when you worked it to make up for a weekday off"
              className="flex min-w-[3.6rem] shrink-0 flex-col items-center justify-center rounded-xl border border-dashed border-gray-400 px-2.5 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100 dark:border-white/40 dark:text-gray-200 dark:hover:bg-white/10"
            >
              <span>+ Sat</span>
              <span className="text-[11px] font-normal">make-up</span>
            </button>
          )}
        </div>

        <div role="tabpanel" className="mt-4 rounded-xl border border-gray-200 p-4 dark:border-white/10">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h4 className="text-base font-bold text-gray-900 dark:text-white">
                {weekday(selected, 'long')}, {dayNum(selected)}
                {selected === saturday && <span className="ml-2 text-xs font-semibold text-brand-700 dark:text-brand-300">Make-up day</span>}
              </h4>
              <p className="text-xs text-gray-600 dark:text-gray-300">
                {filledCells(selected)} of {FOA_ATTENDANCE_COLUMNS.length} covered{day ? ` · ${doneTasks(selected)} of ${FOA_CHECKLIST_TASKS.length} tasks` : ''}
              </p>
            </div>
            {prevDate && (
              <button type="button" className={link} onClick={sameAsPrevious}>
                Same as {weekday(prevDate, 'long')}
              </button>
            )}
          </div>

          <div className="mt-4 space-y-3">
            <p className={label}>Coverage</p>
            {FOA_ATTENDANCE_COLUMNS.map((col) => (
              <div key={col} className="grid gap-1 sm:grid-cols-[8.5rem_minmax(0,1fr)] sm:gap-3">
                <p className="pt-1 text-sm font-semibold text-gray-900 dark:text-white">{col}</p>
                <TokenPicker name={`${col} on ${weekday(selected, 'long')}`} value={tokens(selected, col)} assigned={territories} onChange={(next) => setCell(selected, col, next)} />
              </div>
            ))}
          </div>

          {day ? (
            <div className="mt-5">
              <div className="flex items-baseline justify-between">
                <p className={label}>Tasks done</p>
                <button type="button" className={link} onClick={() => setAll(!allDone)}>
                  {allDone ? 'Clear all' : 'Tick all'}
                </button>
              </div>
              <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
                {FOA_CHECKLIST_TASKS.map((task) => {
                  const done = !!checklist[task]?.[day]
                  return (
                    <li key={task}>
                      <button
                        type="button"
                        onClick={() => setTask(task, day, !done)}
                        aria-pressed={done}
                        className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-sm font-medium transition ${
                          done
                            ? 'border-brand-600 bg-brand-50 text-gray-900 dark:border-brand-400 dark:bg-brand-500/15 dark:text-white'
                            : 'border-gray-300 text-gray-800 hover:bg-gray-50 dark:border-white/20 dark:text-gray-100 dark:hover:bg-white/5'
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 text-xs font-bold ${
                            done ? 'border-brand-600 bg-brand-600 text-white dark:border-brand-400 dark:bg-brand-500' : 'border-gray-400 dark:border-white/40'
                          }`}
                        >
                          {done ? '✓' : ''}
                        </span>
                        {task}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          ) : (
            <p className="mt-5 text-xs text-gray-600 dark:text-gray-300">Tasks are tracked on working days, so this day has coverage only.</p>
          )}

          <div className="mt-5 flex justify-between gap-2 border-t border-gray-200 pt-3 dark:border-white/10">
            <button
              type="button"
              disabled={index <= 0}
              onClick={() => setSelected(dates[index - 1])}
              className="rounded-lg bg-gray-100 px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-200 disabled:opacity-40 dark:bg-white/10 dark:text-gray-100 dark:hover:bg-white/20"
            >
              ← {prevDate ? weekday(prevDate, 'short') : 'Previous'}
            </button>
            <button
              type="button"
              disabled={index >= dates.length - 1}
              onClick={() => setSelected(dates[index + 1])}
              className="rounded-lg bg-gray-100 px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-200 disabled:opacity-40 dark:bg-white/10 dark:text-gray-100 dark:hover:bg-white/20"
            >
              {index < dates.length - 1 ? weekday(dates[index + 1], 'short') : 'Next'} →
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
