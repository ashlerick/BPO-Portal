// Mirrors backend/lib/accountingReport.ts — the Accounting department's report shape. Kept as a small duplication rather than a shared
// package, like foa.ts (bpo_plan.md Rule 6).

export interface Entry {
  name: string
  amount?: number
}

export interface Counted {
  name: string
  count?: number
}

export interface ByState {
  CA?: string[]
  WA?: string[]
}

export interface AccountingReportData {
  receivables?: Entry[]
  payables?: Entry[]
  arCases?: ByState
  beginBilling?: ByState
  invoices?: Counted[]
  coupa?: string[]
  crFee?: string[]
  changeManagement?: string[]
  thirtyDayNotice?: string[]
  parentAccountChange?: string[]
  reimbursements?: string[]
  additionalTasks?: string
  roadblocks?: string
  highlights?: string
  managerComments?: string
}

/** The small "name only" lists, in the order they appear on the report. */
export const ACCOUNTING_OTHER_LISTS = [
  { key: 'coupa', title: 'Coupa Entered / Ops Merchant / Vendor Cafe', quiet: 'Coupa, Ops Merchant or VendorCafe entries' },
  { key: 'crFee', title: 'CR Fee Increase / Decrease', quiet: 'CR fee changes' },
  { key: 'changeManagement', title: 'Change Management', quiet: 'change management' },
  { key: 'thirtyDayNotice', title: '30 Day Notice', quiet: '30-day notices' },
  { key: 'parentAccountChange', title: 'Parent Account Change', quiet: 'parent account changes' },
] as const

export type OtherListKey = (typeof ACCOUNTING_OTHER_LISTS)[number]['key']

export function isAccountingDepartment(departmentName: string): boolean {
  return departmentName.trim().toLowerCase() === 'accounting'
}

export const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })

export const totalOf = (rows: Entry[] | undefined) => (rows ?? []).reduce((sum, r) => sum + (r.amount ?? 0), 0)
export const countOf = (rows: Counted[] | undefined) => (rows ?? []).reduce((sum, r) => sum + (r.count ?? 0), 0)

/** A name list without the blanks and the "0" people type to mean "none this week" (the existing report writes it that way). */
export const realNames = (list: string[] | undefined) => (list ?? []).map((n) => n.trim()).filter((n) => n && n !== '0')
export const realEntries = (rows: Entry[] | undefined) => (rows ?? []).filter((r) => r.name.trim() || r.amount != null)

const AMOUNT_AT_END = /^(.*?)(?:\s+[-–—:]\s+|\s*\t\s*|\s+)(\(?-?\$?\s?-?\d[\d,]*(?:\.\d+)?\)?)\s*$/

/**
 * Turns pasted lines into rows. Handles "Lockbox - $163,706.13", "AT&T  $75.60" and tab-separated spreadsheet rows; numbering and bullets at the
 * start of a line are dropped; a line with no amount at the end becomes a name on its own.
 */
export function parseEntries(text: string): Entry[] {
  const out: Entry[] = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/^\s*(?:\d+[.)]|[-•●○*])\s+/, '').trim()
    if (!line) continue
    const m = line.match(AMOUNT_AT_END)
    if (!m) {
      out.push({ name: line })
      continue
    }
    const text = m[2]
    const negative = text.includes('-') || /^\(.*\)$/.test(text)
    const value = Number(text.replace(/[^\d.]/g, ''))
    out.push(Number.isFinite(value) ? { name: m[1].replace(/[\s\-–—:]+$/, '').trim(), amount: negative ? -value : value } : { name: line })
  }
  return out
}

const list = (items: string[]) => items.join(', ')
/** Ends a sentence once, even when the text already ends with a period (a name like "Copia Resources WA, Inc."). */
const sentence = (text: string) => `${text.replace(/[.\s]+$/, '')}.`

/** A first draft of the Highlights from the entries, worded like the existing report. The person edits it. */
export function draftHighlights(d: AccountingReportData): string {
  const lines: string[] = []
  const ar = realEntries(d.receivables)
  if (ar.length) {
    lines.push(`- Accounts Receivable (AR) Entered – ${money(totalOf(ar))}`)
    lines.push(`   - ${sentence(`Recorded payments from ${list(ar.map((r) => r.name).filter(Boolean))}`)}`)
  }
  const ap = realEntries(d.payables)
  if (ap.length) {
    lines.push(`- Accounts Payable (AP) Entered – ${money(totalOf(ap))}`)
    lines.push(`   - Processed and entered ${ap.length} vendor ${ap.length === 1 ? 'bill' : 'bills'}.`)
  }
  const states = (s: ByState | undefined) => (['CA', 'WA'] as const).map((k) => [k, realNames(s?.[k])] as const).filter(([, v]) => v.length)
  const cases = states(d.arCases)
  if (cases.length) {
    lines.push(`- AR Cases Created – ${cases.reduce((n, [, v]) => n + v.length, 0)}`)
    for (const [k, v] of cases) lines.push(`   - ${sentence(`${k}: ${list(v)}`)}`)
  }
  const billing = states(d.beginBilling)
  if (billing.length) {
    lines.push(`- Begin Billing – ${billing.reduce((n, [, v]) => n + v.length, 0)}`)
    for (const [k, v] of billing) lines.push(`   - ${sentence(`${k}: ${list(v)}`)}`)
  }
  const invoices = (d.invoices ?? []).filter((i) => i.name.trim() && (i.count ?? 0) > 0)
  if (invoices.length) {
    lines.push(`- Invoices Created – ${countOf(invoices)}`)
    lines.push(`   - ${sentence(invoices.map((i) => `${i.name}: ${i.count}`).join(' | '))}`)
  }
  const fee = realNames(d.crFee)
  if (fee.length) {
    lines.push('- CR Fee Adjustment')
    lines.push(`   - ${sentence(`Processed the CR Fee increase/decrease for ${list(fee)}`)}`)
  }
  const reimbursements = realNames(d.reimbursements)
  if (reimbursements.length) {
    lines.push(`- Reimbursements Entered – ${reimbursements.length}`)
    lines.push(`   - ${sentence(list(reimbursements))}`)
  }
  const none = ACCOUNTING_OTHER_LISTS.filter((o) => o.key !== 'crFee' && realNames(d[o.key]).length === 0).map((o) => o.quiet)
  const some = ACCOUNTING_OTHER_LISTS.filter((o) => o.key !== 'crFee' && realNames(d[o.key]).length > 0)
  for (const o of some) {
    lines.push(`- ${o.title}`)
    lines.push(`   - ${sentence(list(realNames(d[o.key])))}`)
  }
  if (none.length) {
    lines.push('- Other Activities')
    lines.push(`   - No ${none.length > 1 ? `${none.slice(0, -1).join(', ')}, or ${none[none.length - 1]}` : none[0]} this week.`)
  }
  return lines.join('\n')
}
