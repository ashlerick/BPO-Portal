import { FoaCounts, type CountField } from './FoaCounts'
import type { FoaReportData } from './foa'
import { input, label } from './foaUi'
import type { ReportData } from './types'

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

const card = 'scroll-mt-4 rounded-2xl border border-gray-300 bg-white p-4 shadow-sm dark:border-white/15 dark:bg-[#0a1f16] sm:p-5'

type Patch = (p: Record<string, unknown>) => void

function Notes({ fields, data, onChange }: { fields: { key: string; title: string; hint: string; rows: number }[]; data: Record<string, unknown>; onChange: Patch }) {
  return (
    <div className="space-y-4">
      {fields.map((f) => (
        <div key={f.key}>
          <label htmlFor={`n-${f.key}`} className={`${label} mb-1 block`}>
            {f.title}
          </label>
          <textarea
            id={`n-${f.key}`}
            value={typeof data[f.key] === 'string' ? (data[f.key] as string) : ''}
            onChange={(e) => onChange({ [f.key]: e.target.value })}
            rows={f.rows}
            placeholder={f.hint}
            className={input}
          />
        </div>
      ))}
    </div>
  )
}

// What belongs to the week as a whole rather than a day: the counts, then the notes that explain them.
export function WeekTotals({ data, onChange }: { data: FoaReportData; onChange: Patch }) {
  const variance = data.varianceInvestigations ?? {}
  const safety = data.motiveSafetyEvents ?? {}
  return (
    <section id="sec-totals" className={card}>
      <h3 className="text-base font-bold text-gray-900 dark:text-white">Week totals</h3>
      <p className="text-xs text-gray-600 dark:text-gray-300">Counts for the whole week, then what stood out. Leave a count empty if it does not apply.</p>
      <div className="mt-4 space-y-5">
        <FoaCounts title="Variance investigations" fields={VARIANCE} values={variance} onChange={(key, v) => onChange({ varianceInvestigations: { ...variance, [key]: v } })} />
        <FoaCounts title="Motive safety events" fields={SAFETY} values={safety} onChange={(key, v) => onChange({ motiveSafetyEvents: { ...safety, [key]: v } })} />
        <hr className="border-gray-200 dark:border-white/10" />
        <Notes
          data={data as Record<string, unknown>}
          onChange={onChange}
          fields={[
            { key: 'additionalTasks', title: 'Additional tasks', rows: 3, hint: 'Anything done outside the daily tasks.' },
            { key: 'highlights', title: 'Highlights', rows: 4, hint: 'What went well this week.' },
            { key: 'roadblocks', title: 'Roadblocks', rows: 4, hint: 'What got in the way, and what you need.' },
          ]}
        />
      </div>
    </section>
  )
}

const GENERIC_FIELDS: { key: keyof ReportData; label: string }[] = [
  { key: 'client', label: 'Client / Account' },
  { key: 'headcount', label: 'Headcount' },
  { key: 'attendance', label: 'Attendance' },
  { key: 'productivity', label: 'Productivity' },
  { key: 'qa', label: 'Quality / QA' },
  { key: 'sla', label: 'SLA' },
]

// The sheet for every department that is not FOA: the six headline metrics, then the notes.
export function GenericSheet({ data, onChange }: { data: ReportData; onChange: Patch }) {
  return (
    <div className="space-y-4">
      <section id="sec-metrics" className={card}>
        <h3 className="text-base font-bold text-gray-900 dark:text-white">Account and metrics</h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {GENERIC_FIELDS.map(({ key, label: title }) => {
            const value = data[key]
            return (
              <div key={key}>
                <label htmlFor={`m-${key}`} className={`${label} mb-1 block`}>
                  {title}
                </label>
                <input
                  id={`m-${key}`}
                  type={key === 'headcount' ? 'number' : 'text'}
                  value={value == null ? '' : String(value)}
                  onChange={(e) => onChange({ [key]: key === 'headcount' ? (e.target.value ? Number(e.target.value) : undefined) : e.target.value })}
                  className={input}
                />
              </div>
            )
          })}
        </div>
      </section>
      <section id="sec-notes" className={card}>
        <h3 className="text-base font-bold text-gray-900 dark:text-white">Notes</h3>
        <div className="mt-4">
          <Notes
            data={data as Record<string, unknown>}
            onChange={onChange}
            fields={[
              { key: 'performanceMetrics', title: 'Performance metrics', rows: 4, hint: 'Targets against actuals, trends, anything notable.' },
              { key: 'issues', title: 'Issues', rows: 4, hint: 'What got in the way.' },
              { key: 'achievements', title: 'Achievements', rows: 4, hint: 'What went well.' },
              { key: 'actionItems', title: 'Action items', rows: 4, hint: 'What happens next, and who owns it.' },
            ]}
          />
        </div>
      </section>
    </div>
  )
}
