import ExcelJS from 'exceljs'
import { buildReportPdf } from './reportPdf.js'
import { FOA_ATTENDANCE_COLUMNS, FOA_CHECKLIST_DAYS, FOA_MAKE_UP_DAY, type FoaReportData } from './foaReport.js'
import type { AccountingReportData } from './accountingReport.js'

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
  data: ReportData | FoaReportData | AccountingReportData
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
    const days = [...FOA_CHECKLIST_DAYS, FOA_MAKE_UP_DAY] as const
    const doneDays = days.filter((day) => checklist[task]?.[day])
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

const money = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

// One line per row ("Lockbox - $163,706.13"), joined with "; " rather than line breaks: the PDF font cannot draw a newline.
function entryRows(label: string, list: { name: string; amount?: number }[] | undefined): [string, string][] {
  const items = list ?? []
  const total = items.reduce((sum, e) => sum + (e.amount ?? 0), 0)
  return [
    [label, items.map((e) => (e.amount != null ? `${e.name} - ${money(e.amount)}` : e.name)).join('; ')],
    [`${label} total`, money(total)],
  ]
}

const names = (list: string[] | undefined) => (list ?? []).filter((n) => n.trim()).join('; ')

function accountingRows(input: ReportExportInput): [string, string][] {
  const data = input.data as AccountingReportData
  const invoices = data.invoices ?? []
  return [
    ['Reported by', input.authorName ?? ''],
    ...entryRows('Accounts Receivable Entered', data.receivables),
    ...entryRows('Accounts Payable Entered', data.payables),
    ['AR Case Created - CA', names(data.arCases?.CA)],
    ['AR Case Created - WA', names(data.arCases?.WA)],
    ['Begin Billing - CA', names(data.beginBilling?.CA)],
    ['Begin Billing - WA', names(data.beginBilling?.WA)],
    ['Invoice Created', invoices.map((i) => `${i.name} - ${i.count ?? 0}`).join('; ')],
    ['Invoices created total', String(invoices.reduce((sum, i) => sum + (i.count ?? 0), 0))],
    ['Coupa Entered/Ops Merchant/Vendor Cafe', names(data.coupa)],
    ['CR Fee Increase/Decrease', names(data.crFee)],
    ['Change Management', names(data.changeManagement)],
    ['30 Day Notice', names(data.thirtyDayNotice)],
    ['Parent Account Change', names(data.parentAccountChange)],
    ['Reimbursement Entered', names(data.reimbursements)],
    ['Additional Tasks', data.additionalTasks ?? ''],
    ['Roadblocks', data.roadblocks ?? ''],
    ['Highlights', data.highlights ?? ''],
    ['Manager Comments', data.managerComments ?? ''],
  ]
}

function rows(input: ReportExportInput): [string, string][] {
  return [
    ['Team', input.teamName],
    ['Period', `${dateFmt(input.periodStart)} to ${dateFmt(input.periodEnd)}`],
    ['Status', input.status],
    ...(input.schemaKey === 'foa' ? foaRows(input) : input.schemaKey === 'accounting' ? accountingRows(input) : genericRows(input)),
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

// The PDF is laid out per report type in reportPdf.ts, in the style of the Accounting weekly summary report.
export const buildPdf = buildReportPdf
