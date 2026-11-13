import type { AccountingReportData } from './accounting'
import { AccountingSummary } from './AccountingSummary'
import { ReportCardShell } from './ReportCardShell'
import type { WeeklyReport } from './types'

// A filed Accounting weekly report, read-only. Editing happens in the report editor, opened from the Edit button.
export function AccountingReportCard({
  report,
  onUpdated,
  onEdit,
}: {
  report: WeeklyReport
  onUpdated: (r: WeeklyReport) => void
  onEdit: (r: WeeklyReport) => void
}) {
  return (
    <ReportCardShell report={report} onUpdated={onUpdated} onEdit={onEdit}>
      <AccountingSummary data={report.data as AccountingReportData} />
    </ReportCardShell>
  )
}
