import { useEffect, useRef, useState, type ReactNode } from 'react'
import { addDaysIso, formatManilaTime } from '../../utils/dates'
import { breakSlotText, netHours } from '../../utils/breaks'
import { shiftHours, zonedInstant } from '../../utils/shiftTime'
import type { AttendanceRecord } from '../attendance/types'
import type { CalendarEventRecord } from '../calendar/types'

// The dashboard's pictures: today's shift as a ring, the week's hours as bars, the week as a strip of days, and who is in today.
// Colours: regular hours are green and overtime is blue (checked for colour-blind readers: 20+ apart in lightness-matched steps for
// dark and light). Text is always in the normal text colours, never in a series colour; a legend and the table view carry the meaning.

export const GREEN = 'fill-[#0f9d63] dark:fill-[#1fa763]'
export const BLUE = 'fill-[#2563eb] dark:fill-[#4a8fe0]'
const GREEN_BG = 'bg-[#0f9d63] dark:bg-[#1fa763]'
const BLUE_BG = 'bg-[#2563eb] dark:bg-[#4a8fe0]'

export interface ShiftInfo {
  name: string
  startTime: string
  endTime: string
  timezone: string
}

const BREAK_HOURS = 50 / 60 // the fixed break and lunch deduction (10 + 30 + 10 minutes)
const round1 = (n: number) => Math.round(n * 10) / 10
const hm = (hours: number) => `${Math.floor(hours)}:${String(Math.floor((hours % 1) * 60)).padStart(2, '0')}`

export function mondayOf(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  return addDaysIso(iso, -((d.getUTCDay() + 6) % 7))
}

// Hours a person is expected to work in one shift: the shift's length less the fixed breaks. 8 hours when no shift is set.
export function targetHours(shift: ShiftInfo | null): number {
  if (!shift) return 8
  const [sh, sm] = shift.startTime.split(':').map(Number)
  const [eh, em] = shift.endTime.split(':').map(Number)
  const minutes = (eh * 60 + em - (sh * 60 + sm) + 1440) % 1440 || 1440
  return Math.max(1, round1(minutes / 60 - BREAK_HOURS))
}

const grossHours = (r: AttendanceRecord, now: number) =>
  r.checkInAt ? Math.max(0, ((r.checkOutAt ? new Date(r.checkOutAt).getTime() : now) - new Date(r.checkInAt).getTime()) / 3_600_000) : 0
const workedOf = (r: AttendanceRecord | undefined, now: number) => (r && r.status === 'present' ? netHours(grossHours(r, now), r.breaks) : 0)
// Overtime for one shift day: the hours HR typed in on the attendance row, plus the overtime HR gave (from the overtime list itself,
// so a day with overtime counts even if there is no clock-in that day).
export interface GivenOvertime {
  date: string
  minutes: number
}
const overtimeOf = (r: AttendanceRecord | undefined, given: GivenOvertime[], date: string) =>
  (r && r.status === 'present' ? (r.overtimeHours ?? 0) : 0) + given.filter((g) => g.date.slice(0, 10) === date).reduce((n, g) => n + g.minutes, 0) / 60

// The size of an element, kept up to date, so a chart is drawn at its real size instead of being scaled (scaled text gets huge).
function useSize<T extends HTMLElement>(fallback: { w: number; h: number }): [React.RefObject<T | null>, { w: number; h: number }] {
  const ref = useRef<T | null>(null)
  const [size, setSize] = useState(fallback)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => {
      const r = el.getBoundingClientRect()
      setSize({ w: Math.max(280, Math.round(r.width)), h: Math.max(150, Math.round(r.height)) })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return [ref, size]
}

// A clock that moves while the page is open, so the ring and the timeline are never stale.
export function useNow(everyMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), everyMs)
    return () => clearInterval(t)
  }, [everyMs])
  return now
}

export function Card({ title, aside, children, className = '', scroll = false }: { title: string; aside?: ReactNode; children: ReactNode; className?: string; scroll?: boolean }) {
  return (
    <section className={`flex h-full flex-col rounded-xl border border-black/5 bg-white/80 shadow-sm dark:border-white/10 dark:bg-white/[0.035] ${className}`}>
      <header className="flex items-center justify-between gap-3 border-b border-black/5 px-4 py-3 dark:border-white/10">
        <h2 className="text-[15px] font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
        {aside}
      </header>
      <div className={scroll ? 'max-h-[26rem] min-h-0 flex-1 overflow-y-auto' : 'flex min-h-0 flex-1 flex-col'}>{children}</div>
    </section>
  )
}

// ---- Today: a ring of the shift, and where "now" is within it

export function TodayCard({
  today,
  record,
  shift,
  checkedIn,
  checkedOut,
  checkInAt,
  checkOutAt,
}: {
  today: string
  record: AttendanceRecord | undefined
  shift: ShiftInfo | null
  checkedIn: boolean
  checkedOut: boolean
  checkInAt: string | null
  checkOutAt: string | null
}) {
  const now = useNow()
  const target = targetHours(shift)
  const worked = workedOf(record, now)
  const share = Math.min(1, worked / target)
  const R = 54
  const C = 2 * Math.PI * R

  let start = 0
  let end = 0
  let along = 0
  if (shift) {
    start = zonedInstant(today, shift.startTime, shift.timezone).getTime()
    end = zonedInstant(today, shift.endTime, shift.timezone).getTime()
    if (end <= start) end += 24 * 3_600_000
    along = Math.min(1, Math.max(0, (now - start) / (end - start)))
  }
  const leftHours = Math.max(0, (end - now) / 3_600_000)
  const live = checkedIn && !checkOutAt
  const state = live ? 'Clocked in' : checkedOut ? 'Clocked out' : 'Not clocked in'
  const dot = live ? 'bg-emerald-500' : 'bg-gray-400'

  return (
    <Card title="Today" aside={<span className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400"><span className={`h-2 w-2 rounded-full ${dot}`} />{state}</span>}>
      <div className="flex flex-1 flex-wrap items-center justify-center gap-x-8 gap-y-5 p-5">
        <figure className="m-0 flex-none" aria-label={`Worked ${hm(worked)} of ${target} hours`}>
          <svg viewBox="0 0 140 140" width="140" height="140" role="img">
            <circle cx="70" cy="70" r={R} fill="none" strokeWidth="12" className="stroke-black/10 dark:stroke-white/15" />
            {share > 0 && (
              <circle
                cx="70"
                cy="70"
                r={R}
                fill="none"
                strokeWidth="12"
                strokeLinecap="round"
                strokeDasharray={`${C * share} ${C}`}
                transform="rotate(-90 70 70)"
                className="stroke-[#0f9d63] dark:stroke-[#1fa763]"
              />
            )}
            <text x="70" y="70" textAnchor="middle" className="fill-gray-900 text-[26px] font-semibold tabular-nums dark:fill-gray-100">
              {hm(worked)}
            </text>
            <text x="70" y="90" textAnchor="middle" className="fill-gray-500 text-[10px] dark:fill-gray-400">
              of {target} h
            </text>
          </svg>
        </figure>
        <div className="w-full min-w-[13rem] max-w-sm flex-1 space-y-3 text-sm">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
            <div>
              <dt className="text-xs text-gray-500 dark:text-gray-400">{checkedOut ? 'In / out' : 'Clocked in since'}</dt>
              <dd className="font-medium text-gray-900 dark:text-gray-100">
                {checkInAt ? formatManilaTime(checkInAt) : '—'}
                {checkOutAt ? ` – ${formatManilaTime(checkOutAt)}` : ''}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500 dark:text-gray-400">{checkedOut ? 'Hours worked' : checkedIn ? 'Still to go' : 'Shift target'}</dt>
              <dd className="font-medium tabular-nums text-gray-900 dark:text-gray-100">
                {checkedOut ? `${round1(worked)} h` : !checkedIn ? `${target} h` : worked >= target ? 'Shift complete' : `${hm(Math.max(0, target - worked))} h`}
              </dd>
            </div>
          </dl>
          {shift && (
            <div>
              <div className="mb-1 flex justify-between text-xs text-gray-500 dark:text-gray-400">
                <span>Shift</span>
                <span>{leftHours > 0 && now >= start ? `${hm(leftHours)} h left` : now < start ? 'not started' : 'ended'}</span>
              </div>
              <div className="relative h-2 rounded-full bg-black/10 dark:bg-white/15" role="img" aria-label="Where now is in the shift">
                <div className={`absolute inset-y-0 left-0 rounded-full ${GREEN_BG}`} style={{ width: `${along * 100}%` }} />
                <div className="absolute top-1/2 h-4 w-0.5 -translate-y-1/2 rounded bg-gray-900 dark:bg-gray-100" style={{ left: `calc(${along * 100}% - 1px)` }} />
              </div>
              <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">{shiftHours(shift, today)}</p>
            </div>
          )}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 border-t border-black/5 p-4 dark:border-white/10" aria-label="Breaks today">
        {(['morning', 'lunch', 'afternoon'] as const).map((slot) => {
          const b = breakSlotText(record?.breaks, slot)
          return (
            <div key={slot} className="rounded-lg bg-black/[0.04] px-3 py-2 dark:bg-white/[0.06]">
              <span className="block text-[11px] text-gray-500 dark:text-gray-400">{{ morning: 'Break 1', lunch: 'Lunch', afternoon: 'Break 2' }[slot]}</span>
              <span className={`block text-sm font-medium tabular-nums ${b?.over ? 'text-amber-700 dark:text-amber-400' : 'text-gray-900 dark:text-gray-100'}`}>{b ? b.text : '—'}</span>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

// ---- This week: regular hours and overtime for each day, against the shift target

export function WeekChart({ records, given, today, target, footer }: { records: AttendanceRecord[]; given: GivenOvertime[]; today: string; target: number; footer?: ReactNode }) {
  const now = useNow()
  const [boxRef, size] = useSize<HTMLDivElement>({ w: 560, h: 220 })
  const W = size.w
  const weekStart = mondayOf(today)
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = addDaysIso(weekStart, i)
    const rec = records.find((r) => r.date.slice(0, 10) === date)
    return { date, name: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i], regular: round1(workedOf(rec, now)), overtime: round1(overtimeOf(rec, given, date)) }
  })
  const totalRegular = round1(days.reduce((n, d) => n + d.regular, 0))
  const totalOvertime = round1(days.reduce((n, d) => n + d.overtime, 0))
  // The green bar stops at the shift target: time past it is not drawn as a claim of overtime. Only overtime HR gave (blue) goes above
  // the line. The real hours are still in the ring above and on My Time.
  const shown = (d: { regular: number }) => Math.min(d.regular, target)
  const top = Math.max(target * 1.25, ...days.map((d) => shown(d) + d.overtime))
  const H = Math.min(360, size.h)
  const L = 8
  const B = 28 // room for the day labels
  const plotH = H - B - 8
  const slot = (W - L) / 7
  const barW = Math.max(14, Math.min(40, Math.round(slot * 0.42)))
  const y = (v: number) => 8 + plotH - (v / top) * plotH

  // A bar with a rounded top, anchored on the baseline.
  const bar = (x: number, v0: number, v1: number, roundTop: boolean) => {
    const yTop = y(v1)
    const yBot = y(v0)
    const h = Math.max(0, yBot - yTop - (v0 > 0 ? 2 : 0)) // a 2px gap between stacked parts
    if (h <= 0) return ''
    const r = roundTop ? Math.min(4, h) : 0
    return `M${x},${yBot - (v0 > 0 ? 2 : 0)} V${yTop + r} Q${x},${yTop} ${x + r},${yTop} H${x + barW - r} Q${x + barW},${yTop} ${x + barW},${yTop + r} V${yBot - (v0 > 0 ? 2 : 0)} Z`
  }

  return (
    <Card
      title="This week"
      aside={
        <span className="text-xs text-gray-500 dark:text-gray-400">
          <b className="font-semibold tabular-nums text-gray-900 dark:text-gray-100">{totalRegular} h</b>
          {totalOvertime > 0 && <> + {totalOvertime} h overtime</>}
        </span>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col p-4 pb-3">
        <div ref={boxRef} className="relative min-h-[13rem] flex-1">
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="absolute left-0 top-0 block" role="img" aria-label={`Hours worked each day this week: ${totalRegular} hours and ${totalOvertime} hours of overtime`}>
          <line x1={L} x2={W} y1={y(0)} y2={y(0)} strokeWidth="1" className="stroke-black/15 dark:stroke-white/20" />
          <line x1={L} x2={W} y1={y(target)} y2={y(target)} strokeWidth="1" strokeDasharray="4 4" className="stroke-black/30 dark:stroke-white/35" />
          <text x={W} y={y(target) - 4} textAnchor="end" className="fill-gray-500 text-[10px] dark:fill-gray-400">
            target {target} h
          </text>
          {days.map((d, i) => {
            const x = L + i * slot + (slot - barW) / 2
            const isToday = d.date === today
            return (
              <g key={d.date}>
                {isToday && <rect x={L + i * slot + 2} y={4} width={slot - 4} height={H - 8} rx="8" className="fill-black/[0.04] dark:fill-white/[0.06]" />}
                <path d={bar(x, 0, shown(d), d.overtime === 0)} className={GREEN} />
                <path d={bar(x, shown(d), shown(d) + d.overtime, true)} className={BLUE} />
                <title>
                  {`${d.name} ${d.date.slice(5)}: ${d.regular} h${d.overtime ? ` + ${d.overtime} h overtime` : ''}`}
                </title>
                {isToday && d.regular + d.overtime > 0 && (
                  <text x={x + barW / 2} y={y(shown(d) + d.overtime) - 5} textAnchor="middle" className="fill-gray-900 text-[11px] font-semibold tabular-nums dark:fill-gray-100">
                    {round1(d.regular + d.overtime)}
                  </text>
                )}
                <text x={x + barW / 2} y={H - 10} textAnchor="middle" className={`text-[11px] ${isToday ? 'fill-gray-900 font-semibold dark:fill-gray-100' : 'fill-gray-500 dark:fill-gray-400'}`}>
                  {d.name}
                </text>
              </g>
            )
          })}
        </svg>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-600 dark:text-gray-400">
          <span className="flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-sm ${GREEN_BG}`} /> Regular hours
          </span>
          <span className="flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-sm ${BLUE_BG}`} /> Overtime
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-0 w-4 border-t border-dashed border-black/40 dark:border-white/40" /> Shift target
          </span>
        </div>
        <table className="sr-only">
          <caption>Hours worked this week</caption>
          <thead>
            <tr>
              <th>Day</th>
              <th>Regular hours</th>
              <th>Overtime hours</th>
            </tr>
          </thead>
          <tbody>
            {days.map((d) => (
              <tr key={d.date}>
                <td>{d.name}</td>
                <td>{d.regular}</td>
                <td>{d.overtime}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {footer && <div className="border-t border-black/5 dark:border-white/10">{footer}</div>}
    </Card>
  )
}

// ---- The week as a strip of days, with dots for what is on each day

export function WeekStrip({ today, events, dueDates }: { today: string; events: CalendarEventRecord[]; dueDates: string[] }) {
  const weekStart = mondayOf(today)
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = addDaysIso(weekStart, i)
    const happening = events.filter((e) => !e.disabled && e.startDate.slice(0, 10) <= date && (e.endDate ?? e.startDate).slice(0, 10) >= date)
    const due = dueDates.filter((d) => d === date).length
    return { date, name: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i], day: Number(date.slice(8)), happening, due }
  })
  return (
    <div className="grid grid-cols-7 gap-1.5 p-3" role="list" aria-label="This week">
      {days.map((d) => {
        const isToday = d.date === today
        const label = [d.happening.map((e) => e.title).join(', '), d.due ? `${d.due} to-do${d.due === 1 ? '' : 's'} due` : ''].filter(Boolean).join('. ')
        return (
          <div
            key={d.date}
            role="listitem"
            title={label || undefined}
            className={`rounded-lg px-1 py-2 text-center ${isToday ? 'bg-brand-600 text-white' : 'bg-black/[0.04] text-gray-800 dark:bg-white/[0.06] dark:text-gray-200'}`}
          >
            <span className={`block text-[10px] uppercase tracking-wide ${isToday ? 'text-white/80' : 'text-gray-500 dark:text-gray-400'}`}>{d.name}</span>
            <span className="block text-base font-semibold tabular-nums">{d.day}</span>
            <span className="mt-1 flex h-2 items-center justify-center gap-1" aria-hidden="true">
              {d.happening.length > 0 && <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />}
              {d.due > 0 && <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ---- Team today (HR and Admin): who is in, who has finished, who has not come in, who is absent

export function TeamToday({ employees, records }: { employees: { id: string; name: string }[]; records: AttendanceRecord[] }) {
  const present = records.filter((r) => r.status === 'present' && r.checkInAt)
  const inNow = present.filter((r) => !r.checkOutAt)
  const done = present.filter((r) => r.checkOutAt)
  const absent = records.filter((r) => r.status === 'absent')
  const total = Math.max(employees.length, present.length + absent.length)
  const notIn = Math.max(0, total - present.length - absent.length)
  const parts = [
    { label: 'In now', n: inNow.length, cls: GREEN_BG },
    { label: 'Clocked out', n: done.length, cls: BLUE_BG },
    { label: 'Not in yet', n: notIn, cls: 'bg-gray-300 dark:bg-gray-600' },
    { label: 'Absent', n: absent.length, cls: 'bg-red-500 dark:bg-red-400' },
  ]
  const names = inNow.map((r) => r.employeeName).sort()
  return (
    <div className="space-y-3 p-4">
      <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full" role="img" aria-label={parts.map((p) => `${p.n} ${p.label}`).join(', ')}>
        {total === 0 ? (
          <div className="h-full w-full bg-gray-300 dark:bg-gray-600" />
        ) : (
          parts.filter((p) => p.n > 0).map((p) => <div key={p.label} className={`h-full ${p.cls}`} style={{ width: `${(p.n / total) * 100}%` }} title={`${p.n} ${p.label}`} />)
        )}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600 dark:text-gray-400">
        {parts.map((p) => (
          <li key={p.label} className="flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-sm ${p.cls}`} />
            <b className="font-semibold tabular-nums text-gray-900 dark:text-gray-100">{p.n}</b> {p.label}
          </li>
        ))}
      </ul>
      {names.length > 0 && (
        <p className="text-sm text-gray-600 dark:text-gray-400">
          <span className="text-xs text-gray-500 dark:text-gray-400">In now: </span>
          {names.slice(0, 6).join(', ')}
          {names.length > 6 ? ` and ${names.length - 6} more` : ''}
        </p>
      )}
    </div>
  )
}
