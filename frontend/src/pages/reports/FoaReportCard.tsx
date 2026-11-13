import type { ReactNode } from 'react'
import { AttendanceGrid } from './AttendanceGrid'
import { FoaChecklist } from './FoaChecklist'
import { FoaCounts, type CountField } from './FoaCounts'
import { FOA_ATTENDANCE_COLUMNS, FOA_CHECKLIST_DAYS, FOA_CHECKLIST_TASKS, foaReportDates, type FoaReportData } from './foa'
import { totalsOf } from './foaWeeks.ts'
import { label, panel, sectionHint, sectionTitle } from './foaUi'
import { ReportCardShell } from './ReportCardShell'
import type { WeeklyReport } from './types'

const VARIANCE: CountField[] = [
  { key: 'extendedBreaks', label: 'Extended Breaks' },
  { key: 'backToBackBreaks', label: 'Back-to-Back Breaks' },
  { key: 'otherInvestigations', label: 'Other Investigations' },
]

const SAFETY: CountField[] = [
  { key: 'cellphone', label: 'Cellphone' },
  { key: 'seatbelts', label: 'Seatbelts' },
  { key: 'incidents', label: 'Incidents' },
  { key: 'trackerDascam', label: 'Tracker/Dascam' },
  { key: 'speeding', label: 'Speeding' },
]

function Block({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className={panel}>
      <h3 className={sectionTitle}>{title}</h3>
      {hint && <p className={sectionHint}>{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  )
}

const Dash = <span className="text-gray-500 dark:text-gray-400">{'—'}</span>

// A filed FOA weekly report, read-only: what was filed, laid out as the review sheet (attendance and checklist as matrices). Editing happens
// in the report editor, opened from the Edit button.
export function FoaReportCard({
  report,
  onUpdated,
  onEdit,
}: {
  report: WeeklyReport
  onUpdated: (r: WeeklyReport) => void
  onEdit: (r: WeeklyReport) => void
}) {
  const data = report.data as FoaReportData
  const dates = foaReportDates(report.periodStart, report.periodEnd, data)
  const territories = data.territories ?? []
  const t = totalsOf(data, FOA_ATTENDANCE_COLUMNS, FOA_CHECKLIST_TASKS, FOA_CHECKLIST_DAYS, dates.length)

  const text = (key: 'additionalTasks' | 'highlights' | 'roadblocks', title: string) => (
    <div key={key}>
      <p className={`${label} mb-1`}>{title}</p>
      <p className="whitespace-pre-wrap text-sm text-gray-900 dark:text-gray-100">{data[key]?.trim() || Dash}</p>
    </div>
  )

  return (
    <ReportCardShell report={report} onUpdated={onUpdated} onEdit={onEdit}>
      <Block title="Assigned territory">
        {territories.length ? (
          <div className="flex flex-wrap gap-2">
            {territories.map((name) => (
              <span key={name} className="rounded-full bg-brand-600 px-3 py-1 text-xs font-semibold text-white dark:bg-brand-500">
                {name}
              </span>
            ))}
          </div>
        ) : (
          Dash
        )}
      </Block>

      <Block title="Attendance task sheet">
        <AttendanceGrid dates={dates} attendance={data.attendance ?? {}} readOnly onCell={() => {}} onFillDown={() => {}} />
      </Block>

      <Block title="Task checklist" hint={`${t.checklistDone} of ${t.checklistTotal} done`}>
        <FoaChecklist value={data.taskChecklist ?? {}} readOnly onChange={() => {}} />
      </Block>

      <Block title="Investigations and safety events">
        <div className="space-y-5">
          <FoaCounts title="Variance investigations" fields={VARIANCE} values={data.varianceInvestigations ?? {}} readOnly onChange={() => {}} />
          <FoaCounts title="Motive safety events" fields={SAFETY} values={data.motiveSafetyEvents ?? {}} readOnly onChange={() => {}} />
        </div>
      </Block>

      <Block title="Highlights and roadblocks">
        <div className="space-y-3">
          {text('additionalTasks', 'Additional tasks')}
          {text('highlights', 'Highlights')}
          {text('roadblocks', 'Roadblocks')}
        </div>
      </Block>
    </ReportCardShell>
  )
}
