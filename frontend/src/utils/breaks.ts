// Breaks and lunch taken in the BPO Time app, as the portal's attendance records carry them (see backend/lib/breaks.ts).
export interface BreakEntry {
  slot: 'morning' | 'lunch' | 'afternoon'
  status: 'taken' | 'not_taken'
  startedAt: string | null
  endedAt: string | null // null while it is running
  overSeconds: number // seconds past the allowance (after the grace); 0 when within it
}

// 10 + 30 + 10 minutes come off the day's worked time whatever was taken (backend/lib/breaks.ts). Breaks are not counted in the hours.
export const BREAK_DEDUCTION_HOURS = 50 / 60

/** Hours worked: time in to time out less the fixed break time. 0 for a day with no time out yet. */
export const netHours = (gross: number | null): number => (gross && gross > 0 ? Math.max(0, gross - BREAK_DEDUCTION_HOURS) : 0)

const LABEL = { morning: 'Break 1', lunch: 'Lunch', afternoon: 'Break 2' } as const
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

/** One slot as text for its own column: how long it ran and how far over, "not taken", or null when nothing is recorded. */
export function breakSlotText(breaks: BreakEntry[] | undefined, slot: BreakEntry['slot']): { text: string; over: boolean } | null {
  const b = breaks?.find((x) => x.slot === slot)
  if (!b) return null
  if (b.status === 'not_taken') return { text: 'not taken', over: false }
  if (!b.endedAt || !b.startedAt) return { text: 'no end recorded', over: false }
  const secs = Math.max(0, Math.round((new Date(b.endedAt).getTime() - new Date(b.startedAt).getTime()) / 1000))
  return { text: mmss(secs) + (b.overSeconds > 0 ? ` (${mmss(b.overSeconds)} over)` : ''), over: b.overSeconds > 0 }
}

export interface BreakLine {
  label: string
  text: string
  over: boolean
}

/** One line per recorded slot: how long it ran, how far over (if it did), or that it was not taken. */
export function breakLines(breaks?: BreakEntry[]): BreakLine[] {
  return (breaks ?? []).map((b) => {
    const label = LABEL[b.slot]
    if (b.status === 'not_taken') return { label, text: 'not taken', over: false }
    if (!b.endedAt || !b.startedAt) return { label, text: 'no end recorded', over: false }
    const secs = Math.max(0, Math.round((new Date(b.endedAt).getTime() - new Date(b.startedAt).getTime()) / 1000))
    return { label, text: mmss(secs) + (b.overSeconds > 0 ? ` (${mmss(b.overSeconds)} over)` : ''), over: b.overSeconds > 0 }
  })
}
