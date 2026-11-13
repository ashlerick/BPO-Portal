import { z } from 'zod'

// Accounting department's weekly report. Unlike FOA it is a set of lists (what was entered, for whom, for how much) with totals that
// are worked out from the rows, never typed in, so they cannot disagree with them.

const name = z.string().max(200)
const names = z.array(name).max(300)

// A line like "Lockbox - $163,706.13". The amount is optional so a half-typed row can still be saved as a draft.
const entry = z.object({ name, amount: z.number().finite().optional() })
const counted = z.object({ name, count: z.number().int().min(0).optional() })
const byState = z.object({ CA: names.optional(), WA: names.optional() })

export const accountingReportDataSchema = z.object({
  receivables: z.array(entry).max(300).optional(),
  payables: z.array(entry).max(300).optional(),
  arCases: byState.optional(),
  beginBilling: byState.optional(),
  invoices: z.array(counted).max(300).optional(),
  coupa: names.optional(),
  crFee: names.optional(),
  changeManagement: names.optional(),
  thirtyDayNotice: names.optional(),
  parentAccountChange: names.optional(),
  reimbursements: names.optional(),
  // Free text, as on the FOA report: anything done outside the usual lists, and what got in the way.
  additionalTasks: z.string().max(5000).optional(),
  roadblocks: z.string().max(5000).optional(),
  highlights: z.string().max(5000).optional(),
  // A reviewer's rejection comment lives here, as in every other report shape (see handleTransition).
  managerComments: z.string().optional(),
})

export type AccountingReportData = z.infer<typeof accountingReportDataSchema>

export function isAccountingDepartment(departmentName: string): boolean {
  return departmentName.trim().toLowerCase() === 'accounting'
}
