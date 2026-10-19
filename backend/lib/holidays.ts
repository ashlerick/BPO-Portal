import { prisma } from './prisma.js'

// Holidays. A day is a holiday when an enabled calendar event of kind "holiday" covers it. Two ways one gets there:
//   - Prefilled: the Philippines list from Nager.Date (free, no key) is imported the first time a year is needed. HR can
//     switch any of those off ("not a holiday"); the row is kept, disabled, so the import never brings it back.
//   - Typed in by HR on the Calendar: any date, with the holiday's name. This is how local holidays are added (a free
//     list cannot know them), and how a day the list missed becomes a holiday.
// Nager marks every day just "Public": it does not say regular or special, so no type is stored yet.

const SOURCE = 'nager'
const LOCAL = 'local'
const URL_FOR = (year: number) => `https://date.nager.at/api/v3/PublicHolidays/${year}/PH`
const RETRY_AFTER_MS = 10 * 60 * 1000
const lastTried = new Map<number, number>()

interface NagerDay {
  date: string
  name: string
  localName?: string
  types?: string[]
}

// Local holidays for the office's place (Iloilo City, confirmed 2026-10-20) that a national list cannot know. They are added switched OFF: a local day
// like Javier Day is observed some years and not others, so HR decides, and presses "Count as holiday" on the Calendar in the
// years it is observed. Add new proclamations here, or on the Calendar by hand (those count at once).
// Sources: Republic Act 7601 (Feb 11, every year, Antique, Capiz, Aklan and Iloilo) and Proclamation No. 1388 (Lawphil).
// Other Panay towns (Passi, Mambusao, Dingle and so on) are left out: they do not apply to an Iloilo City office.
interface LocalHoliday {
  /** 'MM-DD' for a holiday that repeats every year, or 'YYYY-MM-DD' for one proclamation */
  date: string
  title: string
  place: string
  basis: string
}
const LOCAL_HOLIDAYS: LocalHoliday[] = [
  { date: '02-11', title: 'Governor Evelio B. Javier Day', place: 'Iloilo', basis: 'Republic Act 7601' },
  { date: '2026-08-25', title: 'Iloilo City Charter Day', place: 'Iloilo City', basis: 'Proclamation No. 1388' },
]
const localDone = new Set<number>()

async function ensureLocalHolidays(year: number): Promise<void> {
  if (localDone.has(year)) return
  const rows = LOCAL_HOLIDAYS.map((h) => ({ ...h, full: h.date.length === 5 ? `${year}-${h.date}` : h.date }))
    .filter((h) => h.full.startsWith(`${year}-`))
    .map((h) => ({
      title: `${h.title} (${h.place})`,
      kind: 'holiday',
      startDate: new Date(`${h.full}T00:00:00.000Z`),
      description: `Local holiday in ${h.place} (${h.basis}). Not counted unless HR presses "Count as holiday", because it is observed some years and not others.`,
      createdBy: 'system',
      source: LOCAL,
      disabled: true,
      externalKey: `${LOCAL}:${h.full}`,
    }))
  try {
    if (rows.length) await prisma.calendarEvent.createMany({ data: rows, skipDuplicates: true })
    localDone.add(year)
  } catch {
    // try again on the next call
  }
}

/** Import one year's national list if it has not been imported yet. Never throws: no internet just means no prefill. */
export async function ensureHolidaysImported(year: number): Promise<void> {
  await ensureLocalHolidays(year)
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
