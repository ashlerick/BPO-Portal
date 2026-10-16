const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000

// Fixed-offset conversion (Asia/Manila has no DST) that works the same
// whether the server's local clock is UTC (Vercel) or something else
// (local dev) — Date.now() is always a true UTC epoch, so shifting it
// by the offset and reading the UTC fields back out gives the Manila
// wall-clock date without needing a timezone library.
// Attendance is keyed by "shift day", not literal Manila calendar day.
// The team works a night shift that crosses midnight, so a plain
// calendar-day split would give one shift two attendance records — the
// employee is still mid-shift when the clock rolls to a new calendar day,
// but a naive "today" would say no record exists yet and a second
// clock-in would be recorded. The shift-day
// boundary is noon instead of midnight: anything before noon still
// belongs to the previous calendar day's shift (safe for any shift
// starting in the evening and ending well before noon).
export function todayInManila(): Date {
  const manilaMs = Date.now() + MANILA_OFFSET_MS
  const manila = new Date(manilaMs)
  if (manila.getUTCHours() < 12) {
    manila.setUTCDate(manila.getUTCDate() - 1)
  }
  return new Date(Date.UTC(manila.getUTCFullYear(), manila.getUTCMonth(), manila.getUTCDate()))
}

export function inclusiveDayCount(start: Date, end: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000
  const startDay = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate())
  const endDay = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate())
  return Math.round((endDay - startDay) / msPerDay) + 1
}
