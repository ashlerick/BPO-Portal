import { countOf, money, realEntries, realNames, totalOf, type AccountingReportData } from './accounting'
import { FOA_ATTENDANCE_COLUMNS, FOA_CHECKLIST_DAYS, FOA_CHECKLIST_TASKS, type FoaReportData } from './foa'
import { totalsOf } from './foaWeeks.ts'
import type { ReportData } from './types'

// The report is held loosely: the report kinds share some field names with different shapes (`attendance`), so each part casts it.
export type WizardData = Record<string, unknown>

/** One thing a finished report should have, where on the sheet it is filled in, and how far along it is. */
export interface Check {
  id: string
  /** The id of the sheet section to scroll to. */
  anchor: string
  label: string
  ok: boolean
  detail: string
}

const text = (v: unknown) => typeof v === 'string' && v.trim().length > 0

export function checksOf(kind: 'foa' | 'accounting' | 'generic', data: WizardData, dateCount: number): Check[] {
  if (kind === 'foa') {
    const d = data as FoaReportData
    const t = totalsOf(d, FOA_ATTENDANCE_COLUMNS, FOA_CHECKLIST_TASKS, FOA_CHECKLIST_DAYS, dateCount)
    const territories = d.territories?.length ?? 0
    const counted = [...Object.values(d.varianceInvestigations ?? {}), ...Object.values(d.motiveSafetyEvents ?? {})].some((v) => v !== undefined)
    const notes = [d.highlights, d.roadblocks].filter(text).length
    return [
      { id: 'territory', anchor: 'sec-territory', label: 'Assigned territories', ok: territories > 0, detail: territories ? `${territories} picked` : 'None picked' },
      { id: 'attendance', anchor: 'sec-days', label: 'Daily coverage', ok: t.attendanceFilled > 0, detail: `${t.attendanceFilled} of ${t.attendanceTotal} cells` },
      { id: 'checklist', anchor: 'sec-days', label: 'Daily tasks', ok: t.checklistDone > 0, detail: `${t.checklistDone} of ${t.checklistTotal} ticked` },
      { id: 'counts', anchor: 'sec-totals', label: 'Investigation and safety counts', ok: counted, detail: counted ? 'Entered' : 'Nothing entered' },
      { id: 'notes', anchor: 'sec-totals', label: 'Highlights and roadblocks', ok: notes > 0, detail: notes ? `${notes} of 2 written` : 'Nothing written' },
    ]
  }
  if (kind === 'accounting') {
    const d = data as AccountingReportData
    const ar = realEntries(d.receivables)
    const ap = realEntries(d.payables)
    const cases = (['CA', 'WA'] as const).reduce((n, k) => n + realNames(d.arCases?.[k]).length + realNames(d.beginBilling?.[k]).length, 0)
    const invoices = countOf(d.invoices)
    const others = [d.coupa, d.crFee, d.changeManagement, d.thirtyDayNotice, d.parentAccountChange, d.reimbursements].reduce((n, l) => n + realNames(l).length, 0)
    return [
      { id: 'ar', anchor: 'sec-ar', label: 'Accounts Receivable', ok: ar.length > 0, detail: ar.length ? `${ar.length} rows · ${money(totalOf(ar))}` : 'Nothing entered' },
      { id: 'ap', anchor: 'sec-ap', label: 'Accounts Payable', ok: ap.length > 0, detail: ap.length ? `${ap.length} rows · ${money(totalOf(ap))}` : 'Nothing entered' },
      { id: 'cases', anchor: 'sec-cases', label: 'AR cases and billing', ok: cases > 0, detail: cases ? `${cases} properties` : 'None this week' },
      { id: 'invoices', anchor: 'sec-invoices', label: 'Invoices created', ok: invoices > 0, detail: invoices ? `${invoices} invoices` : 'None this week' },
      { id: 'other', anchor: 'sec-other', label: 'Everything else', ok: others > 0, detail: others ? `${others} entries` : 'None this week' },
      {
        id: 'notes',
        anchor: 'sec-notes',
        label: 'Additional tasks and roadblocks',
        ok: text(d.additionalTasks) || text(d.roadblocks),
        detail: [d.additionalTasks, d.roadblocks].filter(text).length ? `${[d.additionalTasks, d.roadblocks].filter(text).length} of 2 written` : 'Nothing written',
      },
      { id: 'highlights', anchor: 'sec-highlights', label: 'Highlights', ok: text(d.highlights), detail: text(d.highlights) ? 'Written' : 'Nothing written' },
    ]
  }
  const d = data as ReportData
  const metrics = [d.client, d.headcount, d.attendance, d.productivity, d.qa, d.sla].filter((v) => v !== undefined && v !== '').length
  const notes = [d.performanceMetrics, d.issues, d.achievements, d.actionItems].filter(text).length
  return [
    { id: 'metrics', anchor: 'sec-metrics', label: 'Account and metrics', ok: metrics > 0, detail: `${metrics} of 6 filled` },
    { id: 'notes', anchor: 'sec-notes', label: 'Performance, issues and actions', ok: notes > 0, detail: notes ? `${notes} of 4 written` : 'Nothing written' },
  ]
}
