// Breaks and lunch on the desktop app (BPO Time). Rules agreed 2026-10-16 and confirmed 2026-10-20: breaks are not counted in the hours; this file
// is the one place that holds them, so a number or a rule can change here and nowhere else.
//
//  - Three slots a day, in order: morning break, lunch, afternoon break. Each is used at most once.
//  - A FIXED 50 minutes (10 + 30 + 10) come off the day's worked time, whether a break was taken, skipped or cut short.
//  - Every slot is recorded as "taken" or "not_taken". For a taken break, how far it ran over is recorded too.
//    Going over is a flag only: it takes nothing extra off the worked time. A grace period (below) is allowed first.
//  - Starting a later slot closes any earlier unused slot as "not_taken". Clocking out ends a running break
//    (it counts as taken) and records every unused slot as "not_taken".
//
// The entries live in AttendanceRecord.breaks (JSON): only start and end times, nothing else about the person.

export const BREAK_SLOTS = ['morning', 'lunch', 'afternoon'] as const
export type BreakSlot = (typeof BREAK_SLOTS)[number]

// Seconds allowed per slot. The fixed deduction is the sum of these.
export const BREAK_ALLOWANCE_SECONDS: Record<BreakSlot, number> = { morning: 10 * 60, lunch: 30 * 60, afternoon: 10 * 60 }

// Grace past the allowance before a break counts as over. Inside it the break is recorded as not over; past it the
// full time over the allowance is recorded (not just the part past the grace). An early return needs no grace: it is
// never flagged, and the deduction is fixed.
export const OVER_GRACE_SECONDS = 60

// A type alias (not an interface) so it can be stored straight into the JSON column.
export type BreakEntry = {
  slot: BreakSlot
  status: 'taken' | 'not_taken'
  startedAt: string | null
  endedAt: string | null // null while the break is running
  overSeconds: number // seconds past the allowance; 0 when within it, or not taken
}

const isSlot = (v: unknown): v is BreakSlot => typeof v === 'string' && (BREAK_SLOTS as readonly string[]).includes(v)

/** Entries as stored, with anything malformed dropped, in slot order. */
export function readBreaks(json: unknown): BreakEntry[] {
  if (!Array.isArray(json)) return []
  const out: BreakEntry[] = []
  for (const raw of json) {
    if (!raw || typeof raw !== 'object') continue
    const e = raw as Record<string, unknown>
    if (!isSlot(e.slot) || (e.status !== 'taken' && e.status !== 'not_taken')) continue
    if (out.some((x) => x.slot === e.slot)) continue
    out.push({
      slot: e.slot,
      status: e.status,
      startedAt: typeof e.startedAt === 'string' ? e.startedAt : null,
      endedAt: typeof e.endedAt === 'string' ? e.endedAt : null,
      // Entries saved before the grace period existed may say "4 seconds over". Inside the grace it is not over, so it is
      // read as 0 here (the stored value is left alone).
      overSeconds: typeof e.overSeconds === 'number' && e.overSeconds > OVER_GRACE_SECONDS ? Math.floor(e.overSeconds) : 0,
    })
  }
  return out.sort((a, b) => BREAK_SLOTS.indexOf(a.slot) - BREAK_SLOTS.indexOf(b.slot))
}

const SLOT_LABEL: Record<BreakSlot, string> = { morning: 'Break 1', lunch: 'Lunch', afternoon: 'Break 2' }
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

/** A day's breaks as short text for the audit log, for example "Break 1 10:04, Lunch 30:43, Break 2 not taken". */
export function summarizeBreaks(entries: BreakEntry[]): string {
  if (entries.length === 0) return 'none'
  return entries
    .map((e) => {
      if (e.status === 'not_taken') return `${SLOT_LABEL[e.slot]} not taken`
      if (!e.startedAt || !e.endedAt) return `${SLOT_LABEL[e.slot]} no end`
      return `${SLOT_LABEL[e.slot]} ${mmss(Math.round((new Date(e.endedAt).getTime() - new Date(e.startedAt).getTime()) / 1000))}`
    })
    .join(', ')
}

export type EditedBreak = { slot: BreakSlot; status: 'taken' | 'not_taken'; startedAt: string | null; endedAt: string | null }

/**
 * HR's edit of a day's breaks. Each slot at most once; a taken break needs a start and an end, in that order, no longer than
 * three hours; two breaks cannot overlap. How far a break ran over is worked out here, from the times, by the same grace rule
 * the app uses, so an edit can never store a different answer than the rules give.
 */
export function editedBreaks(input: EditedBreak[]): BreakResult {
  const out: BreakEntry[] = []
  for (const e of input) {
    const label = SLOT_LABEL[e.slot]
    if (out.some((x) => x.slot === e.slot)) return { error: `${label} is listed twice.` }
    if (e.status === 'not_taken') {
      out.push({ slot: e.slot, status: 'not_taken', startedAt: null, endedAt: null, overSeconds: 0 })
      continue
    }
    if (!e.startedAt || !e.endedAt) return { error: `${label} needs a start and an end time.` }
    const start = new Date(e.startedAt)
    const end = new Date(e.endedAt)
    if (end.getTime() <= start.getTime()) return { error: `${label}: the end has to be after the start.` }
    if (end.getTime() - start.getTime() > 3 * 3_600_000) return { error: `${label} is longer than 3 hours. Check the times.` }
    out.push({ slot: e.slot, status: 'taken', startedAt: e.startedAt, endedAt: e.endedAt, overSeconds: overSecondsFor(e.slot, e.startedAt, end) })
  }
  const taken = out.filter((e) => e.status === 'taken').sort((a, b) => new Date(a.startedAt!).getTime() - new Date(b.startedAt!).getTime())
  for (let i = 1; i < taken.length; i++) {
    if (new Date(taken[i].startedAt!).getTime() < new Date(taken[i - 1].endedAt!).getTime()) return { error: 'Two breaks overlap. Check the times.' }
  }
  return { entries: out.sort((a, b) => BREAK_SLOTS.indexOf(a.slot) - BREAK_SLOTS.indexOf(b.slot)) }
}

export function runningBreak(entries: BreakEntry[]): BreakEntry | undefined {
  return entries.find((e) => e.status === 'taken' && e.startedAt && !e.endedAt)
}

const overSecondsFor = (slot: BreakSlot, startedAt: string, endedAt: Date) => {
  const over = Math.floor((endedAt.getTime() - new Date(startedAt).getTime()) / 1000) - BREAK_ALLOWANCE_SECONDS[slot]
  return over > OVER_GRACE_SECONDS ? over : 0
}

export type BreakResult = { entries: BreakEntry[] } | { error: string }

/** Start a slot. Earlier slots that were never used are closed as "not_taken". */
export function startBreak(entries: BreakEntry[], slot: BreakSlot, now: Date): BreakResult {
  if (runningBreak(entries)) return { error: 'End your current break first.' }
  if (entries.some((e) => e.slot === slot)) return { error: 'That break is already used or closed for today.' }
  const next = [...entries]
  for (const earlier of BREAK_SLOTS.slice(0, BREAK_SLOTS.indexOf(slot))) {
    if (!next.some((e) => e.slot === earlier)) next.push({ slot: earlier, status: 'not_taken', startedAt: null, endedAt: null, overSeconds: 0 })
  }
  next.push({ slot, status: 'taken', startedAt: now.toISOString(), endedAt: null, overSeconds: 0 })
  return { entries: readBreaks(next) }
}

/** End the running break and record how far over it went. */
export function endBreak(entries: BreakEntry[], now: Date): BreakResult {
  const running = runningBreak(entries)
  if (!running || !running.startedAt) return { error: "You aren't on a break." }
  return {
    entries: entries.map((e) =>
      e === running ? { ...e, endedAt: now.toISOString(), overSeconds: overSecondsFor(e.slot, running.startedAt!, now) } : e,
    ),
  }
}

/** At clock-out: end a running break (counts as taken) and record every unused slot as "not_taken". */
export function finalizeBreaks(entries: BreakEntry[], now: Date): BreakEntry[] {
  let next = entries
  if (runningBreak(next)) {
    const ended = endBreak(next, now)
    if ('entries' in ended) next = ended.entries
  }
  const out = [...next]
  for (const slot of BREAK_SLOTS) {
    if (!out.some((e) => e.slot === slot)) out.push({ slot, status: 'not_taken', startedAt: null, endedAt: null, overSeconds: 0 })
  }
  return readBreaks(out)
}

/** The fixed deduction in seconds: every slot's allowance, once the day's breaks have all been settled. */
export const FIXED_DEDUCTION_SECONDS = BREAK_SLOTS.reduce((sum, s) => sum + BREAK_ALLOWANCE_SECONDS[s], 0)
