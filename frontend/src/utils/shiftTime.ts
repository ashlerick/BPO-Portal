// Shift hours in the zone they are written in, and in the other one, for a given date. A California shift follows
// California's daylight saving, so the Philippines hours for 5:00 AM to 1:30 PM in California are 8:00 PM to 4:30 AM
// until the clocks change and 9:00 PM to 5:30 AM after. The browser's time zone database knows the dates; nothing
// here is hard-coded. (The server does the same conversion, see backend/lib/dates.ts.)

export const SHIFT_ZONES = [
  { value: 'America/Los_Angeles', label: 'California time' },
  { value: 'Asia/Manila', label: 'Manila time' },
] as const

const LABEL: Record<string, string> = { 'Asia/Manila': 'PH', 'America/Los_Angeles': 'CA' }
export const zoneLabel = (timeZone: string | undefined) => LABEL[timeZone ?? 'Asia/Manila'] ?? timeZone ?? 'PH'

function offsetMs(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(utcMs))
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

const clock = (timeZone: string) => new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone })

/** For example "5:00 AM – 1:30 PM CA (8:00 PM – 4:30 AM PH)", for the given day. */
export function shiftHours(shift: { startTime: string; endTime: string; timezone?: string }, isoDate: string): string {
  const own = shift.timezone || 'Asia/Manila'
  const other = own === 'Asia/Manila' ? 'America/Los_Angeles' : 'Asia/Manila'
  const start = zonedInstant(isoDate, shift.startTime, own)
  let end = zonedInstant(isoDate, shift.endTime, own)
  if (end <= start) end = new Date(end.getTime() + 24 * 60 * 60 * 1000) // crosses midnight
  const range = (tz: string) => `${clock(tz).format(start)} – ${clock(tz).format(end)} ${zoneLabel(tz)}`
  return `${range(own)} (${range(other)})`
}
