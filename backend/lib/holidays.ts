import { prisma } from './prisma.js'

// Holidays. A day is a holiday when an enabled calendar event of kind "holiday" covers it. Two ways one gets there:
//   - Prefilled: the Philippines list from Nager.Date (free, no key) is imported the first time a year is needed. HR can
//     switch any of those off ("not a holiday"); the row is kept, disabled, so the import never brings it back.
//   - Typed in by HR on the Calendar: any date, with the holiday's name. This is how local holidays are added (a free
//     list cannot know them), and how a day the list missed becomes a holiday.
// Nager marks every day just "Public": it does not say regular or special, so no type is stored yet.

const SOURCE = 'nager'
const URL_FOR = (year: number) => `https://date.nager.at/api/v3/PublicHolidays/${year}/PH`
const RETRY_AFTER_MS = 10 * 60 * 1000
const lastTried = new Map<number, number>()

interface NagerDay {
  date: string
  name: string
  localName?: string
  types?: string[]
}

/** Import one year's national list if it has not been imported yet. Never throws: no internet just means no prefill. */
export async function ensureHolidaysImported(year: number): Promise<void> {
  const already = await prisma.calendarEvent.findFirst({
    where: { source: SOURCE, externalKey: { startsWith: `${SOURCE}:${year}-` } },
    select: { id: true },
  })
  if (already) return
  const tried = lastTried.get(year)
  if (tried && Date.now() - tried < RETRY_AFTER_MS) return
  lastTried.set(year, Date.now())
  try {
    const res = await fetch(URL_FOR(year), { signal: AbortSignal.timeout(4000) })
    if (!res.ok) return
    const days = (await res.json()) as NagerDay[]
    const rows = days
      .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.date) && (!d.types || d.types.includes('Public')))
      .map((d) => ({
        title: d.name,
        kind: 'holiday',
        startDate: new Date(`${d.date}T00:00:00.000Z`),
        description: 'Prefilled from the national list (Nager.Date). HR: check it against the proclamation.',
        createdBy: 'system',
        source: SOURCE,
        externalKey: `${SOURCE}:${d.date}`,
      }))
    if (rows.length) await prisma.calendarEvent.createMany({ data: rows, skipDuplicates: true })
  } catch {
    // offline or the service is down: try again after RETRY_AFTER_MS
  }
}

/** The holiday covering this date-only day (midnight UTC, like attendance dates), or null. */
export async function holidayOn(date: Date): Promise<{ id: string; name: string } | null> {
  await ensureHolidaysImported(date.getUTCFullYear())
  const hit = await prisma.calendarEvent.findFirst({
    where: {
      kind: 'holiday',
      disabled: false,
      startDate: { lte: date },
      OR: [{ endDate: null, startDate: date }, { endDate: { gte: date } }],
    },
    orderBy: { startDate: 'desc' },
    select: { id: true, title: true },
  })
  return hit ? { id: hit.id, name: hit.title } : null
}

/**
 * After HR adds, switches off or removes a holiday: whoever already clocked in on those days is marked (or unmarked)
 * as having worked a holiday. Capped so a mistyped range cannot touch a year of records.
 */
export async function syncWorkingHoliday(from: Date, to: Date): Promise<void> {
  const DAY = 24 * 60 * 60 * 1000
  for (let t = from.getTime(), n = 0; t <= to.getTime() && n < 31; t += DAY, n++) {
    const day = new Date(t)
    const isHoliday = !!(await holidayOn(day))
    await prisma.attendanceRecord.updateMany({
      where: { date: day, checkInAt: { not: null }, workingHoliday: !isHoliday },
      data: { workingHoliday: isHoliday },
    })
  }
}
