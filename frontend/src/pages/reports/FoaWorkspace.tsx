import { useMemo, useState, type ReactNode } from 'react'
import { useAuth } from '../../auth/AuthContext'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { ApiError } from '../../services/api'
import type { FoaReportData } from './foa'
import { addDays, foaWeekEnding, foaWeeksOfYear, lastFriday, startFromPrevious, weekKeyOf } from './foaWeeks.ts'
import { FoaSummary } from './FoaSummary'
import type { ReportStatus, WeeklyReport } from './types'
import { WeekStrip } from './WeekStrip'

interface Team {
  id: string
  name: string
}

const long = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

// Which state a week's dot shows when it holds several reports: what still needs someone's attention comes first.
const ORDER: ReportStatus[] = ['rejected', 'draft', 'submitted', 'reviewed', 'approved']

// The FOA weekly reports as a workspace: the year's weeks in a strip with a Summary at the far left, and the picked week's report (or
// reports, for a reviewer) below. A week with no report of your own offers to start one, optionally from last week's.
export function FoaWorkspace({
  reports,
  createTeams,
  startOnSummary,
  renderReport,
  create,
}: {
  /** Every FOA report the person may see, any status. */
  reports: WeeklyReport[]
  /** The FOA teams the person can start a report for. */
  createTeams: Team[]
  startOnSummary: boolean
  renderReport: (report: WeeklyReport, previous: FoaReportData | undefined) => ReactNode
  create: (teamId: string, start: string, end: string, data: FoaReportData | undefined) => Promise<void>
}) {
  const { user, guardedAction } = useAuth()
  const today = new Date().toISOString().slice(0, 10)
  const currentEnd = addDays(lastFriday(today), 7)
  // The report people file is for the week that just ended; the one ending next Friday is listed so it can be started early.
  const defaultEnd = lastFriday(today)
  const [selected, setSelected] = useState<string>(startOnSummary ? 'summary' : defaultEnd)
  const [year, setYear] = useState(() => foaWeekEnding(defaultEnd).year)
  const [teamId, setTeamId] = useState(createTeams[0]?.id ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const weeks = useMemo(() => foaWeeksOfYear(year), [year])
  const byWeek = useMemo(() => {
    const map: Record<string, WeeklyReport[]> = {}
    for (const r of reports) (map[weekKeyOf(r.periodEnd)] ??= []).push(r)
    return map
  }, [reports])
  const years = reports.map((r) => foaWeekEnding(weekKeyOf(r.periodEnd)).year)
  const minYear = Math.min(foaWeekEnding(defaultEnd).year, ...years)
  const maxYear = foaWeekEnding(currentEnd).year

  const statusOf = (end: string): ReportStatus | undefined => {
    const list = byWeek[end]
    if (!list?.length) return undefined
    return ORDER.find((s) => list.some((r) => r.status === s))
  }

  const week = selected === 'summary' ? null : foaWeekEnding(selected)
  const here = week ? (byWeek[week.end] ?? []) : []
  const mine = here.filter((r) => r.authorId === user?.id)
  // Last week's report by the same author, the source for "same as last week".
  const previousOf = (r: { authorId: string | null; teamId: string; periodEnd: string }): FoaReportData | undefined =>
    (byWeek[addDays(weekKeyOf(r.periodEnd), -7)] ?? []).find((p) => p.authorId === r.authorId && p.teamId === r.teamId)?.data as FoaReportData | undefined
  const myPrevious = week ? (byWeek[addDays(week.end, -7)] ?? []).find((p) => p.authorId === user?.id)?.data as FoaReportData | undefined : undefined

  function start(fromPrevious: boolean) {
    if (!week) return
    guardedAction(['employee'], async () => {
      setBusy(true)
      setError(null)
      try {
        const data = fromPrevious ? startFromPrevious(myPrevious, addDays(week.start, -7), week.start) : undefined
        await create(teamId, week.start, week.end, data)
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Could not create the report')
      } finally {
        setBusy(false)
      }
    })
  }

  return (
    <div className="space-y-3">
      <WeekStrip
        year={year}
        weeks={weeks.filter((w) => w.end <= currentEnd)}
        selected={selected}
        statusOf={statusOf}
        minYear={minYear}
        maxYear={maxYear}
        onYear={(d) => setYear((y) => y + d)}
        onWeek={setSelected}
        onSummary={() => setSelected('summary')}
      />

      {selected === 'summary' || !week ? (
        <FoaSummary year={year} weeks={weeks} reportsByWeek={byWeek} currentEnd={currentEnd} onOpen={setSelected} />
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Week {week.num}</h2>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {long(week.start)} to {long(week.end)}
            </span>
          </div>

          {here.map((r) => (
            <div key={r.id}>{renderReport(r, previousOf(r))}</div>
          ))}

          {mine.length === 0 && createTeams.length > 0 && (
            <Card>
              <p className="text-sm text-gray-600 dark:text-gray-400">{here.length ? 'You have not started a report for this week.' : 'No report for this week yet.'}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {createTeams.length > 1 && (
                  <select value={teamId} onChange={(e) => setTeamId(e.target.value)} className="field !w-auto" aria-label="FOA team">
                    {createTeams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                )}
                <Button variant="primary" onClick={() => start(false)} disabled={busy}>
                  {busy ? 'Creating…' : 'Start this week’s report'}
                </Button>
                {myPrevious && (
                  <Button onClick={() => start(true)} disabled={busy} title="Brings in last week's territories, attendance sheet and checklist">
                    Start from last week
                  </Button>
                )}
              </div>
              {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
            </Card>
          )}

          {here.length === 0 && createTeams.length === 0 && (
            <p className="text-sm text-gray-500 dark:text-gray-400">No reports for this week.</p>
          )}
        </div>
      )}
    </div>
  )
}
