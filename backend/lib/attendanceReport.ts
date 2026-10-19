import ExcelJS from 'exceljs'

export interface AttendanceReportRow {
  employeeId: string
  date: Date
  employeeName: string
  status: 'present' | 'absent'
  checkInAt: Date | null
  checkOutAt: Date | null
  overtimeHours: number | null
  workingHoliday: boolean
}

// Attendance dates are date-only values (midnight UTC), so they are shown in UTC. Check-in and check-out are real
// moments, shown in Philippine time, the same as everywhere else in the portal.
const dateFmt = (d: Date) =>
  d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })

const rangeDateFmt = (d: Date) =>
  d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' })

const timeFmt = (d: Date | null) =>
  d ? d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' }) : ''

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

const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } } as const

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
  ]
  summary.addRow(['Attendance summary']).font = { bold: true, size: 14 }
  summary.addRow([rangeText])
  summary.addRow([])
  const summaryHead = summary.addRow(['Employee', 'Days present', 'Days absent', 'Total hours', 'Overtime hours', 'Working holidays'])
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
      { key: 'hours', width: 10 },
      { key: 'status', width: 12 },
      { key: 'notes', width: 34 },
    ]
    sheet.addRow([name]).font = { bold: true, size: 14 }
    sheet.addRow([rangeText])
    sheet.addRow([])
    const head = sheet.addRow(['Date', 'Time in', 'Time out', 'Hours', 'Status', 'Notes'])
    head.font = { bold: true }
    head.eachCell((c) => (c.fill = HEADER_FILL))
    sheet.views = [{ state: 'frozen', ySplit: head.number }]

    let present = 0
    let absent = 0
    let hours = 0
    let overtime = 0
    let holidays = 0
    for (const r of list) {
      const h = r.status === 'absent' ? null : hoursBetween(r.checkInAt, r.checkOutAt)
      const notes: string[] = []
      if (r.workingHoliday) notes.push('Worked on a holiday')
      if (r.overtimeHours) notes.push(`Overtime ${r.overtimeHours} h`)
      if (r.status === 'present' && r.checkInAt && !r.checkOutAt) notes.push('No time out recorded')
      sheet.addRow([
        dateFmt(r.date),
        r.status === 'absent' ? '' : timeFmt(r.checkInAt),
        r.status === 'absent' ? '' : timeFmt(r.checkOutAt),
        h,
        r.status === 'absent' ? 'Absent' : 'Present',
        notes.join(' · '),
      ])
      if (r.status === 'absent') absent++
      else present++
      if (h) hours += h
      if (r.overtimeHours) overtime += r.overtimeHours
      if (r.workingHoliday) holidays++
    }
    hours = Math.round(hours * 100) / 100
    sheet.addRow([])
    const total = sheet.addRow([`Total (${present} day${present === 1 ? '' : 's'} present${absent ? `, ${absent} absent` : ''})`, '', '', hours, '', ''])
    total.font = { bold: true }
    sheet.getColumn('hours').numFmt = '0.00'

    summary.addRow([name, present, absent, hours, Math.round(overtime * 100) / 100, holidays])
  }
  summary.getColumn('hours').numFmt = '0.00'

  if (rows.length === 0) {
    summary.addRow(['No attendance records in this range.'])
  }

  const buffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(buffer)
}
