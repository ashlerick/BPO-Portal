import ExcelJS from 'exceljs'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { FOA_ATTENDANCE_COLUMNS, FOA_CHECKLIST_DAYS, type FoaReportData } from './foaReport.js'

export interface ReportData {
  client?: string
  headcount?: number
  attendance?: string
  productivity?: string
  qa?: string
  sla?: string
  performanceMetrics?: string
  issues?: string
  achievements?: string
  actionItems?: string
  managerComments?: string
}

export interface ReportExportInput {
  teamName: string
  periodStart: Date
  periodEnd: Date
  status: string
  schemaKey?: string
  authorName?: string
  data: ReportData | FoaReportData
}

const dateFmt = (d: Date) => d.toISOString().slice(0, 10)

function genericRows(input: ReportExportInput): [string, string][] {
  const data = input.data as ReportData
  return [
    ['Client/Account', data.client ?? ''],
    ['Headcount', data.headcount != null ? String(data.headcount) : ''],
    ['Attendance', data.attendance ?? ''],
    ['Productivity', data.productivity ?? ''],
    ['Quality/QA', data.qa ?? ''],
    ['SLA', data.sla ?? ''],
    ['Performance Metrics', data.performanceMetrics ?? ''],
    ['Issues', data.issues ?? ''],
    ['Achievements', data.achievements ?? ''],
    ['Action Items', data.actionItems ?? ''],
    ['Manager Comments', data.managerComments ?? ''],
  ]
}

// Flattens the FOA grid/matrix fields into label/value pairs so the same
// buildCsv/buildXlsx/buildPdf below can render either report shape.
function foaRows(input: ReportExportInput): [string, string][] {
  const data = input.data as FoaReportData
  const out: [string, string][] = [
    ['Reported by', input.authorName ?? ''],
    ['Territories', (data.territories ?? []).join(', ')],
    ['Extended Breaks', String(data.varianceInvestigations?.extendedBreaks ?? 0)],
    ['Back-to-Back Breaks', String(data.varianceInvestigations?.backToBackBreaks ?? 0)],
    ['Other Investigations', String(data.varianceInvestigations?.otherInvestigations ?? 0)],
    ['Cellphone', String(data.motiveSafetyEvents?.cellphone ?? 0)],
    ['Seatbelts', String(data.motiveSafetyEvents?.seatbelts ?? 0)],
    ['Incidents', String(data.motiveSafetyEvents?.incidents ?? 0)],
    ['Tracker/Dascam', String(data.motiveSafetyEvents?.trackerDascam ?? 0)],
    ['Speeding', String(data.motiveSafetyEvents?.speeding ?? 0)],
  ]

  const attendance = data.attendance ?? {}
  for (const date of Object.keys(attendance).sort()) {
    for (const column of FOA_ATTENDANCE_COLUMNS) {
      const tokens = attendance[date]?.[column] ?? []
      out.push([`${date} – ${column}`, tokens.join(', ') || '—'])
    }
  }

  const checklist = data.taskChecklist ?? {}
  for (const task of Object.keys(checklist) as (keyof typeof checklist)[]) {
    const doneDays = FOA_CHECKLIST_DAYS.filter((day) => checklist[task]?.[day])
    out.push([task, doneDays.length > 0 ? doneDays.join(', ') : 'Not done'])
  }

  out.push(
    ['Additional Tasks', data.additionalTasks ?? ''],
    ['Highlights', data.highlights ?? ''],
    ['Roadblocks', data.roadblocks ?? ''],
    ['Manager Comments', data.managerComments ?? ''],
  )

  return out
}

function rows(input: ReportExportInput): [string, string][] {
  return [
    ['Team', input.teamName],
    ['Period', `${dateFmt(input.periodStart)} to ${dateFmt(input.periodEnd)}`],
    ['Status', input.status],
    ...(input.schemaKey === 'foa' ? foaRows(input) : genericRows(input)),
  ]
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

export function buildCsv(input: ReportExportInput): Buffer {
  const lines = rows(input).map(([field, value]) => `${csvEscape(field)},${csvEscape(value)}`)
  return Buffer.from(['Field,Value', ...lines].join('\r\n'), 'utf-8')
}

export async function buildXlsx(input: ReportExportInput): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Weekly Report')
  sheet.columns = [
    { header: 'Field', key: 'field', width: 24 },
    { header: 'Value', key: 'value', width: 60 },
  ]
  for (const [field, value] of rows(input)) {
    sheet.addRow({ field, value })
  }
  sheet.getRow(1).font = { bold: true }
  const buffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(buffer)
}

export async function buildPdf(input: ReportExportInput): Promise<Buffer> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold)
  let page = doc.addPage([612, 792]) // Letter size
  const marginX = 50
  let y = 742

  page.drawText('Weekly Report', { x: marginX, y, size: 18, font: boldFont })
  y -= 30

  for (const [field, value] of rows(input)) {
    if (y < 60) {
      page = doc.addPage([612, 792])
      y = 742
    }
    page.drawText(`${field}:`, { x: marginX, y, size: 11, font: boldFont, color: rgb(0.2, 0.2, 0.2) })
    y -= 16

    const text = value || '—'
    const maxCharsPerLine = 95
    for (let i = 0; i < text.length; i += maxCharsPerLine) {
      if (y < 60) {
        page = doc.addPage([612, 792])
        y = 742
      }
      page.drawText(text.slice(i, i + maxCharsPerLine), { x: marginX + 10, y, size: 10, font })
      y -= 14
    }
    y -= 6
  }

  const bytes = await doc.save()
  return Buffer.from(bytes)
}
