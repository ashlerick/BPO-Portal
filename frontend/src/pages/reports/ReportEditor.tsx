import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../../auth/AuthContext'
import { api, ApiError } from '../../services/api'
import { isAccountingDepartment, type AccountingReportData } from './accounting'
import { AccountingSheet } from './AccountingSheet'
import { DaySheet } from './DaySheet'
import { foaReportDates, isFoaDepartment, type FoaReportData } from './foa'
import { addDays, foaWeekEnding, foaWeeksOfYear, lastFriday, startFromPrevious, weekKeyOf } from './foaWeeks.ts'
import { input, label } from './foaUi'
import { ReviewPanel } from './ReviewPanel'
import type { ReportData, ReportStatus, WeeklyReport } from './types'
import { GenericSheet, WeekTotals } from './WeekTotals'
import { checksOf, type WizardData } from './wizardModel'

export interface EditorTeam {
  id: string
  name: string
  department: string
}

// Departments with a report form today. The rest get one quiet line instead of cards nobody can use.
const LIVE = [
  { name: 'Field Operations Admin', match: ['foa', 'field operations admin'] },
  { name: 'Customer Service', match: ['customer service'] },
  { name: 'Sales', match: ['sales'] },
  { name: 'Accounting', match: ['accounting'] },
]
const COMING_SOON = ['Sustainability', 'HR']

type Kind = 'foa' | 'accounting' | 'generic'
const kindOf = (department: string): Kind => (isFoaDepartment(department) ? 'foa' : isAccountingDepartment(department) ? 'accounting' : 'generic')

const long = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
const short = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

const tagTone: Record<ReportStatus | 'none', string> = {
  none: 'border border-amber-500 text-amber-700 dark:text-amber-300',
  draft: 'bg-gray-200 text-gray-800 dark:bg-white/15 dark:text-gray-100',
  rejected: 'bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-200',
  submitted: 'bg-brand-100 text-brand-800 dark:bg-brand-500/25 dark:text-brand-100',
  reviewed: 'bg-brand-100 text-brand-800 dark:bg-brand-500/25 dark:text-brand-100',
  approved: 'bg-brand-600 text-white dark:bg-brand-500',
}
const tagText: Record<ReportStatus | 'none', string> = {
  none: 'Not filed',
  draft: 'Draft',
  rejected: 'Rejected',
  submitted: 'Submitted',
  reviewed: 'Reviewed',
  approved: 'Approved',
}

const primaryBtn =
  'inline-flex items-center justify-center rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-brand-500 dark:hover:bg-brand-400'
const quietBtn =
  'inline-flex items-center justify-center rounded-lg bg-gray-100 px-4 py-2.5 text-sm font-semibold text-gray-800 transition hover:bg-gray-200 disabled:opacity-50 dark:bg-white/10 dark:text-gray-100 dark:hover:bg-white/20'
const panel = 'rounded-2xl border border-gray-300 bg-white p-4 shadow-sm dark:border-white/15 dark:bg-[#0a1f16] sm:p-6'

type SaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error'

// A weekly report as one sheet. Before it exists you pick the team and week; after that the sheet is the whole page: your territories, the
// days one by one, the week's totals, and a review panel. It saves by itself as you type.
export function ReportEditor({
  teams,
  reports,
  myTeamId,
  resume,
  onSaved,
  onClose,
}: {
  teams: EditorTeam[]
  /** Reports already loaded: used to tag weeks as filed or not, and for "start from last week". */
  reports: WeeklyReport[]
  myTeamId: string | null
  /** An existing draft to carry on with. */
  resume?: WeeklyReport
  /** Called each time the report is created, saved or submitted. */
  onSaved: (r: WeeklyReport) => void
  onClose: () => void
}) {
  const { user, effectiveRoles, guardedAction } = useAuth()
  const isHrAdmin = effectiveRoles.some((r) => r === 'hr' || r === 'admin')
  const canFileGeneric = effectiveRoles.some((r) => r === 'team_leader' || r === 'hr' || r === 'admin')
  const today = new Date().toISOString().slice(0, 10)

  // Which departments this person can file for, each with the teams they may file as.
  const options = useMemo(() => {
    const teamsFor = (dept: string) => {
      const inDept = teams.filter((t) => t.department === dept)
      // FOA and Accounting file one report per person, so anyone can file for their own team; the rest are team leaders' reports.
      if (kindOf(dept) !== 'generic') return isHrAdmin ? inDept : inDept.filter((t) => t.id === myTeamId)
      return canFileGeneric ? inDept : []
    }
    return LIVE.map((d) => {
      const dept = teams.find((t) => d.match.includes(t.department.toLowerCase()))?.department ?? ''
      return { label: d.name, dept, teams: dept ? teamsFor(dept) : [] }
    }).filter((o) => o.teams.length > 0)
  }, [teams, isHrAdmin, canFileGeneric, myTeamId])

  const [report, setReport] = useState<WeeklyReport | null>(resume ?? null)
  const [pickedDept, setPickedDept] = useState(resume?.department ?? '')
  // Derived, so it is right even when the team list arrives after the editor opens.
  const department = options.some((o) => o.dept === pickedDept)
    ? pickedDept
    : (resume?.department ?? options.find((o) => o.teams.some((t) => t.id === myTeamId))?.dept ?? options[0]?.dept ?? '')
  const [pickedTeam, setPickedTeam] = useState(resume?.teamId ?? '')
  const [weekEnd, setWeekEnd] = useState(resume ? weekKeyOf(resume.periodEnd) : lastFriday(today))
  const [periodStart, setPeriodStart] = useState('')
  const [periodEnd, setPeriodEnd] = useState('')
  const [fromLast, setFromLast] = useState(false)
  const [data, setData] = useState<WizardData>((resume?.data as WizardData) ?? {})
  const [reviewing, setReviewing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [save, setSave] = useState<SaveState>(resume ? 'saved' : 'idle')
  const [savedAt, setSavedAt] = useState<Date | null>(resume ? new Date(resume.updatedAt) : null)

  const kind: Kind = report ? report.schemaKey : kindOf(department)
  const foa = kind === 'foa'
  /** FOA and Accounting pick a week from a list; the general report takes two dates. */
  const individual = kind !== 'generic'
  const teamList = options.find((o) => o.dept === department)?.teams ?? []
  const teamId = report
    ? report.teamId
    : pickedTeam && teamList.some((t) => t.id === pickedTeam)
      ? pickedTeam
      : (teamList.find((t) => t.id === myTeamId)?.id ?? (teamList.length === 1 ? teamList[0].id : ''))
  const team = teams.find((t) => t.id === teamId)

  const weeks = useMemo(() => {
    const end = lastFriday(today)
    const y = foaWeekEnding(end).year
    return [...foaWeeksOfYear(y), ...foaWeeksOfYear(y - 1)]
      .filter((w) => w.end <= end)
      .sort((a, b) => (a.end < b.end ? 1 : -1))
      .slice(0, 6)
  }, [today])

  const mineFor = (end: string) => reports.find((r) => r.schemaKey === kind && r.teamId === teamId && r.authorId === user?.id && weekKeyOf(r.periodEnd) === end)
  const existing = individual && !report ? mineFor(weekEnd) : undefined
  const existingEditable = !existing || existing.status === 'draft' || existing.status === 'rejected'
  const previous = foa
    ? ((report ? reports.find((r) => r.schemaKey === 'foa' && r.teamId === report.teamId && r.authorId === report.authorId && weekKeyOf(r.periodEnd) === addDays(weekKeyOf(report.periodEnd), -7)) : mineFor(addDays(weekEnd, -7)))?.data as FoaReportData | undefined)
    : undefined

  const dateCount = report && foa ? foaReportDates(report.periodStart, report.periodEnd, data as FoaReportData).length : 0
  const checks = useMemo(() => checksOf(kind, data, dateCount), [kind, data, dateCount])
  const filled = checks.filter((c) => c.ok).length
  const startValid = !!teamId && (individual ? !!weekEnd : !!periodStart && !!periodEnd && periodStart <= periodEnd)

  // --- saving -------------------------------------------------------------------------------------------------------------------------
  const reportRef = useRef(report)
  useEffect(() => {
    reportRef.current = report
  }, [report])
  const dataRef = useRef(data)
  const dirty = useRef(false)
  const timer = useRef<number | undefined>(undefined)

  async function saveNow() {
    window.clearTimeout(timer.current)
    const current = reportRef.current
    if (!current || !dirty.current) return
    dirty.current = false
    setSave('saving')
    try {
      const updated = await api.put<WeeklyReport>(`/reports/${current.id}`, { action: 'save', data: dataRef.current })
      setReport(updated)
      onSaved(updated)
      setSave(dirty.current ? 'pending' : 'saved')
      setSavedAt(new Date())
    } catch {
      dirty.current = true
      setSave('error')
    }
  }

  function edit(patch: WizardData) {
    const next = { ...dataRef.current, ...patch }
    dataRef.current = next
    setData(next)
    dirty.current = true
    setSave('pending')
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => void saveNow(), 1500)
  }

  useEffect(() => () => window.clearTimeout(timer.current), [])

  function adopt(r: WeeklyReport) {
    dirty.current = false
    dataRef.current = (r.data as WizardData) ?? {}
    reportRef.current = r
    setReport(r)
    setData(dataRef.current)
    setSave('saved')
    setSavedAt(new Date())
  }

  function run(work: () => Promise<void>) {
    guardedAction([], async () => {
      setBusy(true)
      setError(null)
      try {
        await work()
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again.')
      } finally {
        setBusy(false)
      }
    })
  }

  const start = () =>
    run(async () => {
      if (existing) return adopt(existing)
      // A week for FOA and Accounting is Monday to the Friday it is named after.
      const from = individual ? addDays(weekEnd, -4) : periodStart
      const to = individual ? weekEnd : periodEnd
      const seed = foa && fromLast ? startFromPrevious(previous, addDays(from, -7), from, to) : undefined
      const created = await api.post<WeeklyReport>('/reports', {
        teamId,
        periodStart: new Date(from).toISOString(),
        periodEnd: new Date(to).toISOString(),
        ...(seed && Object.keys(seed).length ? { data: seed } : {}),
      })
      adopt(created)
      onSaved(created)
    })

  // Leaving (or submitting) waits for the save. If it did not go through, stay: the changes are only on this screen.
  const unsaved = 'Your latest changes have not been saved yet. Check your connection and try again.'

  const close = () =>
    run(async () => {
      await saveNow()
      if (dirty.current) {
        setError(unsaved)
        return
      }
      onClose()
    })

  const submit = () =>
    run(async () => {
      await saveNow()
      if (dirty.current) {
        setError(unsaved)
        return
      }
      const updated = await api.put<WeeklyReport>(`/reports/${report!.id}`, { action: 'submit', data: dataRef.current })
      onSaved(updated)
      onClose()
    })

  function jump(anchor: string) {
    document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const title = report
    ? individual
      ? `Week ${foaWeekEnding(weekKeyOf(report.periodEnd)).num} · ${short(report.periodStart.slice(0, 10))} to ${long(weekKeyOf(report.periodEnd))}`
      : `${short(report.periodStart.slice(0, 10))} to ${long(weekKeyOf(report.periodEnd))}`
    : 'New weekly report'

  const saveLabel =
    save === 'saving'
      ? 'Saving…'
      : save === 'pending'
        ? 'Unsaved changes'
        : save === 'error'
          ? 'Could not save. It retries on your next change.'
          : save === 'saved' && savedAt
            ? `Saved at ${savedAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
            : ''

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={report ? close : onClose}
        disabled={busy}
        className="-mb-1 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:underline disabled:opacity-60 dark:text-brand-300"
      >
        <span aria-hidden="true">←</span> Back to reports
      </button>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-extrabold text-gray-900 dark:text-white sm:text-3xl">{title}</h2>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
            {team?.name ?? 'Choose a team'} · {user?.name ?? user?.email}
          </p>
        </div>
        {saveLabel && (
          <span
            role="status"
            className={`rounded-full px-3 py-1.5 text-xs font-bold ${
              save === 'error' ? 'bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-200' : 'bg-brand-100 text-brand-800 dark:bg-brand-500/20 dark:text-brand-200'
            }`}
          >
            {saveLabel}
          </span>
        )}
      </div>

      {!report ? (
        <section className={`${panel} space-y-6`}>
          {options.length === 0 ? (
            <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-950/40 dark:text-amber-100">
              You are not set up to file a weekly report yet. Ask HR to add you to a team.
            </p>
          ) : (
            <>
              {(options.length > 1 || teamList.length > 1) && (
                <div className="grid gap-4 sm:grid-cols-2">
                  {options.length > 1 && (
                    <div>
                      <p className={`${label} mb-1.5`}>Department</p>
                      <div className="flex flex-wrap gap-2">
                        {options.map((o) => (
                          <button
                            key={o.dept}
                            type="button"
                            aria-pressed={o.dept === department}
                            onClick={() => {
                              setPickedDept(o.dept)
                              setPickedTeam('')
                            }}
                            className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold transition ${
                              o.dept === department
                                ? 'border-brand-600 bg-brand-600 text-white dark:border-brand-400 dark:bg-brand-500'
                                : 'border-gray-400 text-gray-800 hover:bg-gray-100 dark:border-white/30 dark:text-gray-100 dark:hover:bg-white/10'
                            }`}
                          >
                            {o.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {teamList.length > 1 && (
                    <div>
                      <label htmlFor="ed-team" className={`${label} mb-1.5 block`}>
                        Team
                      </label>
                      <select id="ed-team" value={teamId} onChange={(e) => setPickedTeam(e.target.value)} className={input}>
                        <option value="">Select a team…</option>
                        {teamList.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )}

              {individual ? (
                <div>
                  <p className={`${label} mb-1.5`}>Which week?</p>
                  <ul className="divide-y divide-gray-200 overflow-hidden rounded-xl border border-gray-200 dark:divide-white/10 dark:border-white/10">
                    {weeks.map((w) => {
                      const status = mineFor(w.end)?.status ?? 'none'
                      const selected = w.end === weekEnd
                      return (
                        <li key={w.end}>
                          <button
                            type="button"
                            disabled={!teamId}
                            onClick={() => setWeekEnd(w.end)}
                            aria-pressed={selected}
                            className={`flex w-full items-center gap-3 px-4 py-3 text-left transition ${selected ? 'bg-brand-50 dark:bg-brand-500/15' : 'hover:bg-gray-50 dark:hover:bg-white/5'}`}
                          >
                            <span
                              aria-hidden="true"
                              className={`h-4 w-4 shrink-0 rounded-full border-2 ${selected ? 'border-brand-600 bg-brand-600 ring-2 ring-inset ring-white dark:border-brand-400 dark:bg-brand-400 dark:ring-[#0a1f16]' : 'border-gray-400 dark:border-white/40'}`}
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-semibold text-gray-900 dark:text-white">Week {w.num}</span>
                              <span className="block text-xs text-gray-600 dark:text-gray-300">
                                {short(w.start)} to {long(w.end)}
                              </span>
                            </span>
                            <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${tagTone[status]}`}>{tagText[status]}</span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                  <p className="mt-2 text-xs text-gray-600 dark:text-gray-300">{foa ? 'Weeks run Monday to Friday. You can add a Saturday while filling it in, if you worked one to make up for a day off.' : 'Weeks run Monday to Friday.'}</p>
                  {foa && previous && !existing && (
                    <label className="mt-3 flex items-start gap-2 text-sm text-gray-800 dark:text-gray-100">
                      <input type="checkbox" checked={fromLast} onChange={(e) => setFromLast(e.target.checked)} className="mt-0.5 h-4 w-4 accent-brand-600" />
                      <span>Start from last week’s report (territories and the daily coverage and tasks)</span>
                    </label>
                  )}
                  {existing && !existingEditable && (
                    <p className="mt-3 text-sm text-gray-700 dark:text-gray-200">This week is already {tagText[existing.status].toLowerCase()}. Open it from the list to read it.</p>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 max-[359px]:grid-cols-1">
                  <div className="min-w-0">
                    <label htmlFor="ed-start" className={`${label} mb-1.5 block`}>
                      Period start
                    </label>
                    <input id="ed-start" type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} className={input} />
                  </div>
                  <div className="min-w-0">
                    <label htmlFor="ed-end" className={`${label} mb-1.5 block`}>
                      Period end
                    </label>
                    <input id="ed-end" type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} className={input} />
                  </div>
                </div>
              )}

              <p className="text-xs text-gray-600 dark:text-gray-300">{COMING_SOON.join(', ')} reports are coming soon.</p>
            </>
          )}
          {error && <p className="text-sm font-medium text-red-700 dark:text-red-300">{error}</p>}
          <div className="flex flex-wrap justify-between gap-3 border-t border-gray-200 pt-4 dark:border-white/10">
            <button type="button" className={quietBtn} onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="button" className={primaryBtn} onClick={start} disabled={busy || !startValid || !existingEditable}>
              {busy ? 'Starting…' : existing ? 'Continue draft →' : 'Start report →'}
            </button>
          </div>
        </section>
      ) : (
        <>
          {kind === 'foa' ? (
            <>
              <DaySheet report={report} data={data as FoaReportData} onChange={edit} previous={previous} />
              <WeekTotals data={data as FoaReportData} onChange={edit} />
            </>
          ) : kind === 'accounting' ? (
            <AccountingSheet data={data as AccountingReportData} onChange={edit} />
          ) : (
            <GenericSheet data={data as ReportData} onChange={edit} />
          )}

          {reviewing && <ReviewPanel checks={checks} busy={busy} onSubmit={submit} onFix={jump} />}
          {error && <p className="text-sm font-medium text-red-700 dark:text-red-300">{error}</p>}

          <div className="sticky bottom-0 z-20 -mx-1 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-300 bg-white/95 px-4 py-3 shadow-lg backdrop-blur dark:border-white/20 dark:bg-[#081a12]/95">
            <button type="button" className={quietBtn} onClick={close} disabled={busy} title="Your changes are saved automatically">
              ← Back to reports
            </button>
            <div className="hidden min-w-0 flex-1 items-center gap-3 sm:flex">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-200 dark:bg-white/15">
                <div className="h-full rounded-full bg-brand-600 transition-all dark:bg-brand-400" style={{ width: `${(filled / checks.length) * 100}%` }} />
              </div>
              <span className="shrink-0 text-xs font-semibold text-gray-700 dark:text-gray-200">
                {filled} of {checks.length} parts filled
              </span>
            </div>
            <button
              type="button"
              className={primaryBtn}
              onClick={() => {
                setReviewing(true)
                window.setTimeout(() => jump('sec-review'), 50)
              }}
              disabled={busy}
            >
              Review & submit
            </button>
          </div>
        </>
      )}
    </div>
  )
}
