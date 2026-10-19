import ExcelJS from 'exceljs'
import type { BreakEntry, BreakSlot } from './breaks.js'

export interface AttendanceReportRow {
  employeeId: string
  date: Date
  employeeName: string
  status: 'present' | 'absent'
  checkInAt: Date | null
  checkOutAt: Date | null
  overtimeHours: number | null
  workingHoliday: boolean
  breaks: BreakEntry[]
}

// Attendance dates are date-only values (midnight UTC), so they are shown in UTC. Check-in and check-out are real
// moments, shown in Philippine time, the same as everywhere else in the portal.
const dateFmt = (d: Date) =>
  d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })

const rangeDateFmt = (d: Date) =>
  d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' })

const timeFmt = (d: Date | null) =>
  d ? d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' }) : ''

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

// One break slot as text: how long it ran (m:ss) and how far over its limit, "Not taken", or blank when nothing was recorded.
function breakCell(entries: BreakEntry[], slot: BreakSlot): string {
  const e = entries.find((x) => x.slot === slot)
  if (!e) return ''
  if (e.status === 'not_taken') return 'Not taken'
  if (!e.startedAt || !e.endedAt) return 'No end recorded'
  const secs = Math.max(0, Math.round((new Date(e.endedAt).getTime() - new Date(e.startedAt).getTime()) / 1000))
  return mmss(secs) + (e.overSeconds > 0 ? ` (${mmss(e.overSeconds)} over)` : '')
}

const hoursBetween = (a: Date | null, b: Date | null) =>
  a && b ? Math.max(0, Math.round(((b.getTime() - a.getTime()) / 3_600_000) * 100) / 100) : null

// Excel sheet names: at most 31 characters, none of [ ] : * ? / \ , and unique within the workbook.
function sheetNameFor(name: string, used: Set<string>): string {
  const base = name.replace(/[[\]:*?/\\]/g, '').trim().slice(0, 31) || 'Employee'
  let candidate = base
  for (let n = 2; used.has(candidate.toLowerCase()); n++) {
    const suffix = ` (${n})`
    candidate = base.slice(0, 31 - suffix.length) + suffix
  }
  used.add(candidate.toLowerCase())
  return candidate
}

// Monday (UTC midnight) of the week a date-only value falls in. Weeks run Monday to Sunday, as everywhere in the portal.
function mondayOf(d: Date): Date {
  const back = (d.getUTCDay() + 6) % 7
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - back))
}

const shortDate = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } } as const

// A full-width band across the six columns (the week heading).
function bandRow(sheet: ExcelJS.Worksheet, text: string, argb: string, bold: boolean) {
  const row = sheet.addRow([text])
  sheet.mergeCells(row.number, 1, row.number, 9)
  row.font = { bold }
  row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } }
}

// A footer: the label across the first three columns (so it is never cut off), then the hours and a note of the rest.
function footerRow(
  sheet: ExcelJS.Worksheet,
  label: string,
  t: { present: number; absent: number; hours: number; overtime: number; holidays: number; over: number },
  argb: string,
) {
  const days = `${t.present} day${t.present === 1 ? '' : 's'} present${t.absent ? `, ${t.absent} absent` : ''}`
  const extra = [
    t.overtime ? `Overtime ${t.overtime} h` : '',
    t.holidays ? `${t.holidays} holiday${t.holidays === 1 ? '' : 's'} worked` : '',
    t.over ? `${t.over} break${t.over === 1 ? '' : 's'} over the limit` : '',
  ]
    .filter(Boolean)
    .join(' \u00b7 ')
  const row = sheet.addRow([`${label}: ${days}`, '', '', '', '', '', t.hours, '', extra])
  sheet.mergeCells(row.number, 1, row.number, 6)
  row.font = { bold: true }
  for (let c = 1; c <= 9; c++) {
    const cell = row.getCell(c)
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } }
    cell.border = { top: { style: 'thin' } }
  }
}

// One worksheet per person (so each person's days read as one simple table), after a Summary sheet with one row per
// person. Rows arrive already grouped or sorted; they are grouped by employee here, in the order people first appear.
export async function buildAttendanceXlsx(rows: AttendanceReportRow[], from: Date, to: Date): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  const rangeText = `${rangeDateFmt(from)} to ${rangeDateFmt(to)}`

  const byPerson = new Map<string, AttendanceReportRow[]>()
  for (const row of rows) {
    const list = byPerson.get(row.employeeId) ?? []
    list.push(row)
    byPerson.set(row.employeeId, list)
  }

  const used = new Set<string>(['summary'])
  const summary = workbook.addWorksheet('Summary')
  summary.columns = [
    { key: 'name', width: 30 },
    { key: 'present', width: 14 },
    { key: 'absent', width: 14 },
    { key: 'hours', width: 14 },
    { key: 'overtime', width: 16 },
    { key: 'holiday', width: 18 },
    { key: 'over', width: 18 },
  ]
  summary.addRow(['Attendance summary']).font = { bold: true, size: 14 }
  summary.addRow([rangeText])
  summary.addRow([])
  const summaryHead = summary.addRow(['Employee', 'Days present', 'Days absent', 'Total hours', 'Overtime hours', 'Working holidays', 'Breaks over limit'])
  summaryHead.font = { bold: true }
  summaryHead.eachCell((c) => (c.fill = HEADER_FILL))
  summary.views = [{ state: 'frozen', ySplit: summaryHead.number }]

  for (const [, list] of byPerson) {
    const name = list[0].employeeName
    const sheet = workbook.addWorksheet(sheetNameFor(name, used))
    sheet.columns = [
      { key: 'date', width: 16 },
      { key: 'in', width: 14 },
      { key: 'out', width: 14 },
      { key: 'break1', width: 14 },
      { key: 'lunch', width: 18 },
      { key: 'break2', width: 14 },
      { key: 'hours', width: 10 },
      { key: 'status', width: 12 },
      { key: 'notes', width: 34 },
    ]
    sheet.addRow([name]).font = { bold: true, size: 14 }
    sheet.addRow([rangeText])

    // Split into Monday to Sunday weeks. Each week has its own heading, column titles and a footer with that week's totals.
    const weeks = new Map<string, AttendanceReportRow[]>()
    for (const r of list) {
      const key = mondayOf(r.date).toISOString().slice(0, 10)
      weeks.set(key, [...(weeks.get(key) ?? []), r])
    }

    const totals = { present: 0, absent: 0, hours: 0, overtime: 0, holidays: 0, over: 0 }
    for (const [key, weekRows] of [...weeks].sort(([a], [b]) => a.localeCompare(b))) {
      const monday = new Date(`${key}T00:00:00.000Z`)
      const sunday = new Date(monday.getTime() + 6 * 24 * 3_600_000)
      sheet.addRow([])
      bandRow(sheet, `Week of ${shortDate(monday)} to ${rangeDateFmt(sunday)}`, 'FFD1D5DB', true)
      const head = sheet.addRow(['Date', 'Time in', 'Time out', 'Break 1', 'Lunch', 'Break 2', 'Hours', 'Status', 'Notes'])
      head.font = { bold: true, size: 10 }
      head.eachCell((c) => (c.fill = HEADER_FILL))

      const w = { present: 0, absent: 0, hours: 0, overtime: 0, holidays: 0, over: 0 }
      for (const r of weekRows) {
        const h = r.status === 'absent' ? null : hoursBetween(r.checkInAt, r.checkOutAt)
        const notes: string[] = []
        if (r.workingHoliday) notes.push('Worked on a holiday')
        if (r.overtimeHours) notes.push(`Overtime ${r.overtimeHours} h`)
        if (r.status === 'present' && r.checkInAt && !r.checkOutAt) notes.push('No time out recorded')
        sheet.addRow([
          dateFmt(r.date),
          r.status === 'absent' ? '' : timeFmt(r.checkInAt),
          r.status === 'absent' ? '' : timeFmt(r.checkOutAt),
          r.status === 'absent' ? '' : breakCell(r.breaks, 'morning'),
          r.status === 'absent' ? '' : breakCell(r.breaks, 'lunch'),
          r.status === 'absent' ? '' : breakCell(r.breaks, 'afternoon'),
          h,
          r.status === 'absent' ? 'Absent' : 'Present',
          notes.join(' \u00b7 '),
        ])
        if (r.status === 'absent') w.absent++
        else w.present++
        if (h) w.hours += h
        if (r.overtimeHours) w.overtime += r.overtimeHours
        if (r.workingHoliday) w.holidays++
        w.over += r.breaks.filter((b) => b.overSeconds > 0).length
      }
      w.hours = Math.round(w.hours * 100) / 100
      footerRow(sheet, 'Week total', w, 'FFF3F4F6')
      for (const k of Object.keys(totals) as (keyof typeof totals)[]) totals[k] += w[k]
    }

    sheet.addRow([])
    totals.hours = Math.round(totals.hours * 100) / 100
    totals.overtime = Math.round(totals.overtime * 100) / 100
    footerRow(sheet, 'Total for the period', totals, 'FFD1D5DB')
    sheet.getColumn('hours').numFmt = '0.00'

    const { present, absent, hours, overtime, holidays, over } = totals
    summary.addRow([name, present, absent, hours, Math.round(overtime * 100) / 100, holidays, over])
  }
  summary.getColumn('hours').numFmt = '0.00'

  if (rows.length === 0) {
    summary.addRow(['No attendance records in this range.'])
  }

  const buffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(buffer)
}
