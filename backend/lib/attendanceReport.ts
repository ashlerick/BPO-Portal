import ExcelJS from 'exceljs'
import { BREAK_ALLOWANCE_SECONDS, OVER_GRACE_SECONDS, type BreakEntry, type BreakSlot } from './breaks.js'

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

// What the workbook holds. The sheets carry RAW data only: the date, time in and time out as real date-times, each break as a
// real duration, the status, overtime hours and a "Yes" for a holiday worked. Everything computed is an Excel formula, so HR
// can correct a value in the file and every figure follows: Hours, Worked, breaks over the limit, the weekly and period
// totals, and the Summary. The break rules (allowances, grace, the fixed deduction) sit once on the Rules sheet.
//
// Columns of a person's sheet:
//   A Date | B Time in | C Time out | D Break 1 | E Lunch | F Break 2 | G Hours* | H Worked* | I Breaks over* |
//   J Status | K Overtime | L Holiday worked | M Notes        (* = formula)

const DAY_MS = 24 * 3_600_000
const MANILA_MS = 8 * 3_600_000
const RULES = 'Rules' // sheet name
const R = { b1: `${RULES}!$B$2`, lunch: `${RULES}!$B$3`, b2: `${RULES}!$B$4`, grace: `${RULES}!$B$5`, deduct: `${RULES}!$B$6` }
const HEADS = ['Date', 'Time in', 'Time out', 'Break 1', 'Lunch', 'Break 2', 'In to out (h)', 'Hours worked', 'Breaks over', 'Status', 'Overtime', 'Holiday worked', 'Notes']
const LAST_COL = HEADS.length

const rangeDateFmt = (d: Date) =>
  d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' })
const shortDate = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

// Excel stores a time without a time zone. To show Philippine wall-clock time, the moment is moved by +8 hours and written as
// if it were UTC: the cell then displays 7:31 PM for 19:31 in Manila, and keeps the real date so a night shift's time out (the
// next morning) still subtracts correctly.
const manilaCell = (d: Date | null): Date | null => (d ? new Date(d.getTime() + MANILA_MS) : null)

const round2 = (n: number) => Math.round(n * 100) / 100
const hoursBetween = (a: Date | null, b: Date | null) => (a && b ? Math.max(0, round2((b.getTime() - a.getTime()) / 3_600_000)) : null)

const ALLOWANCE: Record<BreakSlot, number> = BREAK_ALLOWANCE_SECONDS
const DEDUCTION_HOURS = Object.values(ALLOWANCE).reduce((a, b) => a + b, 0) / 3600

/** A break slot's raw cell: its duration (a number of days, shown as m:ss), or text when it was not taken / has no end. */
function breakValue(entries: BreakEntry[], slot: BreakSlot): { value: number | string | null; seconds: number | null } {
  const e = entries.find((x) => x.slot === slot)
  if (!e) return { value: null, seconds: null }
  if (e.status === 'not_taken') return { value: 'Not taken', seconds: null }
  if (!e.startedAt || !e.endedAt) return { value: 'No end recorded', seconds: null }
  const seconds = Math.max(0, Math.round((new Date(e.endedAt).getTime() - new Date(e.startedAt).getTime()) / 1000))
  return { value: seconds / 86400, seconds }
}

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
const quoted = (name: string) => `'${name.replace(/'/g, "''")}'`

// Monday (UTC midnight) of the week a date-only value falls in. Weeks run Monday to Sunday, as everywhere in the portal.
function mondayOf(d: Date): Date {
  const back = (d.getUTCDay() + 6) % 7
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - back))
}

const fill = (argb: string) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } }) as const
const HEADER_FILL = fill('FFE5E7EB')

function bandRow(sheet: ExcelJS.Worksheet, text: string, argb: string) {
  const row = sheet.addRow([text])
  sheet.mergeCells(row.number, 1, row.number, LAST_COL)
  row.font = { bold: true }
  row.getCell(1).fill = fill(argb)
}

interface Totals {
  present: number
  absent: number
  hours: number
  worked: number
  over: number
  overtime: number
  holidays: number
}
const emptyTotals = (): Totals => ({ present: 0, absent: 0, hours: 0, worked: 0, over: 0, overtime: 0, holidays: 0 })

const daysText = (present: number, absent: number) =>
  `${present} day${present === 1 ? '' : 's'} present${absent ? `, ${absent} absent` : ''}`

// A footer made of formulas over a block of rows (a week, or the whole period). `first` and `last` are the first and last day
// rows of the block; for the period total, `sums` lists the week-footer rows to add up instead.
function footerRow(
  sheet: ExcelJS.Worksheet,
  label: string,
  first: number,
  last: number,
  t: Totals,
  argb: string,
  sums?: number[],
): number {
  const J = `J${first}:J${last}`
  const row = sheet.addRow([])
  sheet.mergeCells(row.number, 1, row.number, 6)
  row.getCell(1).value = {
    formula: `"${label}: "&COUNTIF(${J},"Present")&IF(COUNTIF(${J},"Present")=1," day"," days")&" present"&IF(COUNTIF(${J},"Absent")>0,", "&COUNTIF(${J},"Absent")&" absent","")`,
    result: `${label}: ${daysText(t.present, t.absent)}`,
  }
  const sum = (col: string, result: number) => ({
    formula: sums ? `SUM(${sums.map((r) => `${col}${r}`).join(',')})` : `SUM(${col}${first}:${col}${last})`,
    result,
  })
  row.getCell(7).value = sum('G', round2(t.hours))
  row.getCell(8).value = sum('H', round2(t.worked))
  row.getCell(9).value = sum('I', t.over)
  row.getCell(11).value = sum('K', round2(t.overtime))
  row.getCell(12).value = { formula: `COUNTIF(L${first}:L${last},"Yes")`, result: t.holidays }
  for (const c of [7, 8, 11]) row.getCell(c).numFmt = '0.00'
  row.font = { bold: true }
  for (let c = 1; c <= LAST_COL; c++) {
    const cell = row.getCell(c)
    cell.fill = fill(argb)
    cell.border = { top: { style: 'thin' } }
  }
  return row.number
}

export async function buildAttendanceXlsx(rows: AttendanceReportRow[], from: Date, to: Date): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  // Excel works every formula out again when the file is opened (a zero result is not stored by the writer).
  workbook.calcProperties.fullCalcOnLoad = true
  const rangeText = `${rangeDateFmt(from)} to ${rangeDateFmt(to)}`

  const byPerson = new Map<string, AttendanceReportRow[]>()
  for (const row of rows) byPerson.set(row.employeeId, [...(byPerson.get(row.employeeId) ?? []), row])

  const used = new Set<string>(['summary', RULES.toLowerCase()])

  // ---- Summary: every figure is a formula that reads the person's own sheet
  const summary = workbook.addWorksheet('Summary')
  summary.columns = [30, 14, 14, 14, 20, 14, 18, 18].map((width) => ({ width }))
  summary.addRow(['Attendance summary']).font = { bold: true, size: 14 }
  summary.addRow([rangeText])
  summary.addRow([])
  const summaryHead = summary.addRow([
    'Employee', 'Days present', 'Days absent', 'In to out (h)', 'Hours worked', 'Overtime hours', 'Working holidays', 'Breaks over limit',
  ])
  summaryHead.font = { bold: true }
  summaryHead.eachCell((c) => (c.fill = HEADER_FILL))
  summary.views = [{ state: 'frozen', ySplit: summaryHead.number }]

  // ---- Rules: the break rules, once. Change a value and every sheet follows. (Rows 2 to 6, as R expects.)
  const rules = workbook.addWorksheet(RULES)
  rules.columns = [{ width: 44 }, { width: 14 }, { width: 70 }]
  rules.addRow(['Break rules (agreed 2026-10-16). Breaks are not counted in the hours. Change a value and every sheet follows.']).font = { bold: true }
  for (const [label, seconds] of [
    ['Break 1 allowed', ALLOWANCE.morning],
    ['Lunch allowed', ALLOWANCE.lunch],
    ['Break 2 allowed', ALLOWANCE.afternoon],
    ['Grace before a break counts as over', OVER_GRACE_SECONDS],
  ] as const) {
    const row = rules.addRow([label, seconds / 86400])
    row.getCell(2).numFmt = 'h:mm:ss'
  }
  const deductRow = rules.addRow(['Fixed deduction from the day (hours)'])
  deductRow.getCell(2).value = { formula: '(B2+B3+B4)*24', result: DEDUCTION_HOURS }
  deductRow.getCell(2).numFmt = '0.00'
  rules.getCell('C5').value = 'A break only counts as over once it runs past its allowance plus this grace.'
  rules.getCell('C6').value = 'Hours less this is "Worked". The deduction is the same whether or not the breaks were taken.'

  for (const [, list] of byPerson) {
    const name = list[0].employeeName
    const sheetName = sheetNameFor(name, used)
    const sheet = workbook.addWorksheet(sheetName)
    sheet.columns = [16, 12, 12, 11, 11, 11, 9, 9, 12, 10, 10, 15, 28].map((width) => ({ width }))
    sheet.addRow([name]).font = { bold: true, size: 14 }
    sheet.addRow([rangeText])
    sheet.addRow(['Raw data from the portal. Hours worked = time in to out less the fixed 50 minutes for breaks and lunch. The hours, the over counts and every total are formulas (break rules on the Rules sheet).']).font = {
      italic: true,
      size: 9,
    }

    // Split into Monday to Sunday weeks, each with its own heading, column titles and footer.
    const weeks = new Map<string, AttendanceReportRow[]>()
    for (const r of list) {
      const key = mondayOf(r.date).toISOString().slice(0, 10)
      weeks.set(key, [...(weeks.get(key) ?? []), r])
    }

    const totals = emptyTotals()
    const weekFooters: number[] = []
    let firstDay = 0
    let lastDay = 0
    for (const [key, weekRows] of [...weeks].sort(([a], [b]) => a.localeCompare(b))) {
      const monday = new Date(`${key}T00:00:00.000Z`)
      const sunday = new Date(monday.getTime() + 6 * DAY_MS)
      sheet.addRow([])
      bandRow(sheet, `Week of ${shortDate(monday)} to ${rangeDateFmt(sunday)}`, 'FFD1D5DB')
      const head = sheet.addRow(HEADS)
      head.font = { bold: true, size: 10 }
      head.eachCell((c) => (c.fill = HEADER_FILL))

      const w = emptyTotals()
      let weekFirst = 0
      let weekLast = 0
      for (const r of weekRows) {
        const absent = r.status === 'absent'
        const b = {
          morning: breakValue(r.breaks, 'morning'),
          lunch: breakValue(r.breaks, 'lunch'),
          afternoon: breakValue(r.breaks, 'afternoon'),
        }
        const row = sheet.addRow([
          r.date, // a real date (midnight UTC)
          absent ? null : manilaCell(r.checkInAt),
          absent ? null : manilaCell(r.checkOutAt),
          absent ? null : b.morning.value,
          absent ? null : b.lunch.value,
          absent ? null : b.afternoon.value,
          null,
          null,
          null,
          absent ? 'Absent' : 'Present',
          r.overtimeHours || null,
          r.workingHoliday ? 'Yes' : null,
          !absent && r.checkInAt && !r.checkOutAt ? 'No time out recorded' : null,
        ])
        const n = row.number
        weekFirst ||= n
        weekLast = n
        row.getCell(1).numFmt = 'ddd, mmm d'
        row.getCell(2).numFmt = 'h:mm AM/PM'
        row.getCell(3).numFmt = 'h:mm AM/PM'
        for (const c of [4, 5, 6]) row.getCell(c).numFmt = '[m]:ss'
        for (const c of [7, 8, 11]) row.getCell(c).numFmt = '0.00'

        // Formulas, each with its result stored too so the numbers also show in Protected View.
        const h = absent ? null : hoursBetween(r.checkInAt, r.checkOutAt)
        const worked = h === null ? null : Math.max(0, round2(h - DEDUCTION_HOURS))
        row.getCell(7).value = { formula: `IF(AND(ISNUMBER(B${n}),ISNUMBER(C${n})),ROUND((C${n}-B${n})*24,2),"")`, result: h ?? '' }
        row.getCell(8).value = { formula: `IF(ISNUMBER(G${n}),MAX(0,ROUND(G${n}-${R.deduct},2)),"")`, result: worked ?? '' }
        const over = (cell: string, allowed: string) => `IF(AND(ISNUMBER(${cell}),${cell}>${allowed}+${R.grace}),1,0)`
        const overCount = absent
          ? 0
          : (['morning', 'lunch', 'afternoon'] as const).reduce((acc, slot) => {
              const secs = b[slot].seconds
              return acc + (secs !== null && secs > ALLOWANCE[slot] + OVER_GRACE_SECONDS ? 1 : 0)
            }, 0)
        row.getCell(9).value = {
          formula: `${over(`D${n}`, R.b1)}+${over(`E${n}`, R.lunch)}+${over(`F${n}`, R.b2)}`,
          result: overCount,
        }

        if (absent) w.absent++
        else w.present++
        if (h) w.hours += h
        if (worked) w.worked += worked
        w.over += overCount
        if (r.overtimeHours) w.overtime += r.overtimeHours
        if (r.workingHoliday) w.holidays++
      }
      firstDay ||= weekFirst
      lastDay = weekLast
      weekFooters.push(footerRow(sheet, 'Week total', weekFirst, weekLast, w, 'FFF3F4F6'))
      for (const k of Object.keys(totals) as (keyof Totals)[]) totals[k] += w[k]
    }

    sheet.addRow([])
    const totalRow = footerRow(sheet, 'Total for the period', firstDay, lastDay, totals, 'FFD1D5DB', weekFooters)

    // This person's line on the Summary: formulas into their sheet
    const sn = quoted(sheetName)
    const line = summary.addRow([name])
    line.getCell(2).value = { formula: `COUNTIF(${sn}!J:J,"Present")`, result: totals.present }
    line.getCell(3).value = { formula: `COUNTIF(${sn}!J:J,"Absent")`, result: totals.absent }
    line.getCell(4).value = { formula: `${sn}!G${totalRow}`, result: round2(totals.hours) }
    line.getCell(5).value = { formula: `${sn}!H${totalRow}`, result: round2(totals.worked) }
    line.getCell(6).value = { formula: `${sn}!K${totalRow}`, result: round2(totals.overtime) }
    line.getCell(7).value = { formula: `${sn}!L${totalRow}`, result: totals.holidays }
    line.getCell(8).value = { formula: `${sn}!I${totalRow}`, result: totals.over }
    for (const c of [4, 5, 6]) line.getCell(c).numFmt = '0.00'
  }

  if (rows.length === 0) summary.addRow(['No attendance records in this range.'])

  const buffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(buffer)
}
