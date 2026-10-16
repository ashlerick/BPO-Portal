// Shift hours in the zone they are written in, and in the other one, for a given date. A California shift follows
// California's daylight saving, so the Philippines hours for 5:00 AM to 1:30 PM in California are 8:00 PM to 4:30 AM
// until the clocks change and 9:00 PM to 5:30 AM after. The browser's time zone database knows the dates; nothing
// here is hard-coded. (The server does the same conversion, see backend/lib/dates.ts.)
import { addDaysIso } from './dates'

export const SHIFT_ZONES = [
  { value: 'America/Los_Angeles', label: 'California time' },
  { value: 'Asia/Manila', label: 'Manila time' },
] as const

const LABEL: Record<string, string> = { 'Asia/Manila': 'PH', 'America/Los_Angeles': 'CA' }
export const zoneLabel = (timeZone: string | undefined) => LABEL[timeZone ?? 'Asia/Manila'] ?? timeZone ?? 'PH'

// Formatters are slow to build, and the change-finder below asks for hundreds of dates, so they are built once.
const partsFormatters = new Map<string, Intl.DateTimeFormat>()
const clockFormatters = new Map<string, Intl.DateTimeFormat>()

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let f = partsFormatters.get(timeZone)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    partsFormatters.set(timeZone, f)
  }
  return f
}

function clock(timeZone: string): Intl.DateTimeFormat {
  let f = clockFormatters.get(timeZone)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone })
    clockFormatters.set(timeZone, f)
  }
  return f
}

function offsetMs(utcMs: number, timeZone: string): number {
  const parts = partsFormatter(timeZone).formatToParts(new Date(utcMs))
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second')) - Math.floor(utcMs / 1000) * 1000
}

export function zonedInstant(isoDate: string, hm: string, timeZone: string): Date {
  const [y, m, d] = isoDate.split('-').map(Number)
  const [hh, mm] = hm.split(':').map(Number)
  const wanted = Date.UTC(y, m - 1, d, hh, mm)
  let guess = wanted
  for (let i = 0; i < 3; i++) {
    const next = wanted - offsetMs(guess, timeZone)
    if (next === guess) break
    guess = next
  }
  return new Date(guess)
}

type ShiftLike = { startTime: string; endTime: string; timezone?: string }

const ownZone = (shift: ShiftLike) => shift.timezone || 'Asia/Manila'
const otherZone = (shift: ShiftLike) => (ownZone(shift) === 'Asia/Manila' ? 'America/Los_Angeles' : 'Asia/Manila')

/** One shift's hours in one zone on one day, for example "5:00 AM – 1:30 PM CA". */
export function shiftRange(shift: ShiftLike, isoDate: string, timeZone: string = ownZone(shift)): string {
  const start = zonedInstant(isoDate, shift.startTime, ownZone(shift))
  let end = zonedInstant(isoDate, shift.endTime, ownZone(shift))
  if (end <= start) end = new Date(end.getTime() + 24 * 60 * 60 * 1000) // crosses midnight
  return `${clock(timeZone).format(start)} – ${clock(timeZone).format(end)} ${zoneLabel(timeZone)}`
}

/** For example "5:00 AM – 1:30 PM CA (8:00 PM – 4:30 AM PH)", for the given day. */
export function shiftHours(shift: ShiftLike, isoDate: string): string {
  return `${shiftRange(shift, isoDate)} (${shiftRange(shift, isoDate, otherZone(shift))})`
}

const dayLabel = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

/**
 * When the other zone's hours next change (California moving its clocks), for example
 * "from Nov 1: 9:00 PM – 5:30 AM PH". Null when they do not change within the next year.
 */
export function shiftChangeNote(shift: ShiftLike, isoDate: string): string | null {
  const other = otherZone(shift)
  const now = shiftRange(shift, isoDate, other)
  let day = isoDate
  for (let i = 0; i < 370; i++) {
    day = addDaysIso(day, 1)
    const next = shiftRange(shift, day, other)
    if (next !== now) return `from ${dayLabel.format(new Date(`${day}T00:00:00Z`))}: ${next}`
  }
  return null
}

/** The hours with any coming change appended, for lists and tooltips. */
export function shiftHoursWithChange(shift: ShiftLike, isoDate: string): string {
  const change = shiftChangeNote(shift, isoDate)
  return change ? `${shiftHours(shift, isoDate)}, ${change}` : shiftHours(shift, isoDate)
}
