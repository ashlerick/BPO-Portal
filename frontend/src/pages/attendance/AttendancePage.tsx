import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import { EmptyState, ErrorState, LoadingState } from '../../components/AsyncState'
import { useApiData } from '../../hooks/useApiData'
import { api, ApiError } from '../../services/api'
import type { EmployeeRecord } from '../hris/types'
import { addDaysIso, formatDateOnly, formatManilaTime, startOfMonthIso, todayInManilaIso } from '../../utils/dates'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { PageHeader } from '../../components/ui/PageHeader'
import { Section, SectionStack } from '../../components/ui/Section'
import { Tabs } from '../../components/ui/Tabs'
import { Badge } from '../../components/ui/Badge'
import type { AttendanceRecord } from './types'
import { LateReport, MySchedule } from './Shifts'

const timeFmt = formatManilaTime

function MarkAbsentRowButton({ record, onMarked }: { record: AttendanceRecord; onMarked: () => void }) {
  const { guardedAction } = useAuth()
  const [submitting, setSubmitting] = useState(false)

  function handleClick() {
    if (!record.employeeId) return
    if (!window.confirm(`Mark ${record.employeeName} absent on ${formatDateOnly(record.date)}?`)) return

    guardedAction(['hr', 'admin'], async () => {
      setSubmitting(true)
      try {
        await api.post('/leave/attendance/mark-absent', {
          employeeId: record.employeeId,
          date: record.date.slice(0, 10),
        })
        onMarked()
      } catch (err) {
        alert(err instanceof ApiError ? err.message : 'Could not mark absent')
      } finally {
        setSubmitting(false)
      }
    })
  }

  return (
    <Button size="sm" onClick={handleClick} disabled={submitting || !record.employeeId}>
      {submitting ? 'Marking…' : 'Mark Absent'}
    </Button>
  )
}

function rangePresets() {
  const today = todayInManilaIso()
  const yesterday = addDaysIso(today, -1)
  return [
    { label: 'Today', from: today, to: today },
    { label: 'Yesterday', from: yesterday, to: yesterday },
    { label: 'Last 7 days', from: addDaysIso(today, -6), to: today },
    { label: 'This month', from: startOfMonthIso(today), to: today },
  ]
}

function EmployeeFilter({
  value,
  onChange,
  className = '',
}: {
  value: string
  onChange: (id: string) => void
  className?: string
}) {
  const { data: employees } = useApiData<EmployeeRecord[]>('/employees')

  return (
    <label className={`flex min-w-0 flex-col text-sm text-gray-600 dark:text-gray-400 ${className}`}>
      Employee
      <select value={value} onChange={(e) => onChange(e.target.value)} className="field mt-1">
        <option value="">All employees</option>
        {employees?.map((emp) => (
          <option key={emp.id} value={emp.id}>
            {emp.name}
          </option>
        ))}
      </select>
    </label>
  )
}

function CorrectionForm({ onCorrected }: { onCorrected: () => void }) {
  const { guardedAction } = useAuth()
  const { data: employees } = useApiData<EmployeeRecord[]>('/employees')
  const [employeeId, setEmployeeId] = useState('')
  const [date, setDate] = useState(todayInManilaIso())
  const [checkIn, setCheckIn] = useState('')
  const [checkOut, setCheckOut] = useState('')
  const [overtime, setOvertime] = useState('')
  const [workingHoliday, setWorkingHoliday] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  // <input type="time"> gives "HH:MM"; the app works in Manila time.
  const toIso = (time: string) => new Date(`${date}T${time}:00+08:00`).toISOString()

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!checkIn && !checkOut && overtime === '' && !workingHoliday) {
      setMessage({ ok: false, text: 'Enter a time, overtime hours, or mark a working holiday.' })
      return
    }
    guardedAction(['hr', 'admin'], async () => {
      setSubmitting(true)
      setMessage(null)
      try {
        await api.post('/leave/attendance/correct', {
          employeeId,
          date,
          status: 'present',
          ...(checkIn && { checkInAt: toIso(checkIn) }),
          ...(checkOut && { checkOutAt: toIso(checkOut) }),
          ...(overtime !== '' && { overtimeHours: Number(overtime) }),
          workingHoliday,
        })
        setMessage({ ok: true, text: 'Attendance corrected.' })
        setCheckIn('')
        setCheckOut('')
        setOvertime('')
        setWorkingHoliday(false)
        onCorrected()
      } catch (err) {
        setMessage({ ok: false, text: err instanceof ApiError ? err.message : 'Could not correct attendance' })
      } finally {
        setSubmitting(false)
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <p className="text-sm text-gray-600 dark:text-gray-400">
        Fix the times on an existing attendance record. Times are Manila time; leave a field empty to keep it as is.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col text-sm text-gray-600 dark:text-gray-400">
          Employee
          <select required value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className="field mt-1">
            <option value="">Select…</option>
            {employees?.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col text-sm text-gray-600 dark:text-gray-400">
          Date
          <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} className="field mt-1" />
        </label>
        <label className="flex flex-col text-sm text-gray-600 dark:text-gray-400">
          Check in
          <input type="time" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} className="field mt-1" />
        </label>
        <label className="flex flex-col text-sm text-gray-600 dark:text-gray-400">
          Check out
          <input type="time" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} className="field mt-1" />
        </label>
        <label className="flex flex-col text-sm text-gray-600 dark:text-gray-400">
          Overtime hours
          <input type="number" min="0" max="24" step="0.25" value={overtime} onChange={(e) => setOvertime(e.target.value)} className="field mt-1" />
        </label>
        <label className="flex items-center gap-2 self-end pb-2 text-sm text-gray-600 dark:text-gray-400">
          <input type="checkbox" checked={workingHoliday} onChange={(e) => setWorkingHoliday(e.target.checked)} />
          Worked on a holiday
        </label>
      </div>
      {message && (
        <p className={`text-sm ${message.ok ? 'text-brand-700 dark:text-brand-400' : 'text-red-600 dark:text-red-400'}`}>
          {message.text}
        </p>
      )}
      <Button type="submit" variant="primary" size="sm" disabled={submitting}>
        {submitting ? 'Saving…' : 'Apply correction'}
      </Button>
    </form>
  )
}

function hoursBetween(a: string | null, b: string | null): number {
  if (!a || !b) return 0
  return Math.max(0, (new Date(b).getTime() - new Date(a).getTime()) / 3_600_000)
}

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function mondayOf(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  const back = (d.getUTCDay() + 6) % 7
  return addDaysIso(iso, -back)
}

// The old sheet's weekly tracker: Regular Hours (from time in/out),
// OverTime and Working Holiday (entered by HR) for one Mon-Sun week.
function WeeklyTracker({ employeeId, reloadToken }: { employeeId: string; reloadToken: number }) {
  const [weekStart, setWeekStart] = useState(() => mondayOf(todayInManilaIso()))
  const weekEnd = addDaysIso(weekStart, 6)
  const q = new URLSearchParams({ from: weekStart, to: weekEnd })
  if (employeeId) q.set('employeeId', employeeId)
  q.set('_r', String(reloadToken))
  const { data, error } = useApiData<AttendanceRecord[]>(`/leave/attendance?${q.toString()}`)

  const days = DAY_NAMES.map((name, i) => {
    const date = addDaysIso(weekStart, i)
    const rec = data?.find((r) => r.date.slice(0, 10) === date && r.status === 'present')
    return { name, date, rec }
  })
  const hours = (r?: AttendanceRecord) => (r ? Math.round(hoursBetween(r.checkInAt, r.checkOutAt) * 100) / 100 : 0)
  const totalRegular = days.reduce((a, d) => a + hours(d.rec), 0)
  const totalOt = days.reduce((a, d) => a + (d.rec?.overtimeHours ?? 0), 0)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setWeekStart(addDaysIso(weekStart, -7))}>
            ← Previous
          </Button>
          <Button size="sm" onClick={() => setWeekStart(addDaysIso(weekStart, 7))}>
            Next →
          </Button>
        </div>
        <span className="text-sm text-gray-600 dark:text-gray-400">
          {formatDateOnly(weekStart)} – {formatDateOnly(weekEnd)}
        </span>
      </div>
      {error && <ErrorState message={error} />}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] text-center text-sm">
          <thead>
            <tr className="border-b border-black/10 text-gray-500 dark:border-white/10 dark:text-gray-400">
              <th className="py-2 pr-3 text-left font-medium" />
              {days.map((d) => (
                <th key={d.date} className="px-1 py-2 font-medium">
                  {d.name}
                  <div className="text-xs font-normal">{d.date.slice(5)}</div>
                </th>
              ))}
              <th className="px-1 py-2 font-medium">Total</th>
            </tr>
          </thead>
          <tbody className="text-gray-800 dark:text-gray-200">
            <tr className="border-b border-black/5 dark:border-white/5">
              <td className="py-2 pr-3 text-left font-medium">Regular hours</td>
              {days.map((d) => (
                <td key={d.date}>{d.rec ? hours(d.rec) : ''}</td>
              ))}
              <td className="font-medium">{Math.round(totalRegular * 100) / 100}</td>
            </tr>
            <tr className="border-b border-black/5 dark:border-white/5">
              <td className="py-2 pr-3 text-left font-medium">Overtime</td>
              {days.map((d) => (
                <td key={d.date}>{d.rec?.overtimeHours ?? ''}</td>
              ))}
              <td className="font-medium">{totalOt}</td>
            </tr>
            <tr>
              <td className="py-2 pr-3 text-left font-medium">Working holiday</td>
              {days.map((d) => (
                <td key={d.date}>{d.rec?.workingHoliday ? '✓' : ''}</td>
              ))}
              <td />
            </tr>
          </tbody>
        </table>
      </div>
      {employeeId === '' && (
        <p className="text-xs text-gray-500 dark:text-gray-400">Hours come from time in / time out. Overtime and working holiday are entered by HR.</p>
      )}
    </div>
  )
}

export function AttendancePage() {
  const { effectiveRoles, attendanceStatus } = useAuth()
  const isReviewer = effectiveRoles.some((r) => r === 'hr' || r === 'admin')

  const [from, setFrom] = useState(todayInManilaIso())
  const [to, setTo] = useState(todayInManilaIso())
  const [employeeId, setEmployeeId] = useState('')
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  const rangeInvalid = to < from
  const params = new URLSearchParams({ from, to })
  if (employeeId) params.set('employeeId', employeeId)
  if (reloadToken) params.set('_r', String(reloadToken))
  const path = rangeInvalid ? '/leave/attendance' : `/leave/attendance?${params.toString()}`
  const { data, loading, error } = useApiData<AttendanceRecord[]>(path)

  const records = data ?? []
  const absences = records.filter((r) => r.status === 'absent')
  const present = records.filter((r) => r.status === 'present')
  const totalHours = present.reduce((sum, r) => sum + hoursBetween(r.checkInAt, r.checkOutAt), 0)
  const completedDays = present.filter((r) => r.checkInAt && r.checkOutAt).length

  async function handleExport() {
    if (rangeInvalid) return
    setExporting(true)
    setExportError(null)
    try {
      const exportParams = new URLSearchParams({ from, to })
      if (employeeId) exportParams.set('employeeId', employeeId)
      const { url } = await api.get<{ url: string }>(`/leave/attendance/export?${exportParams.toString()}`)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (err) {
      setExportError(err instanceof ApiError ? err.message : 'Could not export attendance')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Attendance"
        description={isReviewer ? 'All employees.' : 'Your check-in/check-out history.'}
      />

      <Card className="mb-4 space-y-3">
        {/* Quick ranges — the handful people actually want. Equal-width
            2x2 on phones, one row of four from 480px, natural-width
            chips from md. Never scrolls. */}
        <div className="grid grid-cols-2 gap-2 min-[480px]:grid-cols-4 md:flex md:flex-wrap">
          {rangePresets().map((p) => {
            const active = p.from === from && p.to === to
            return (
              <Button
                key={p.label}
                size="sm"
                aria-pressed={active}
                className={`w-full whitespace-nowrap md:w-auto ${active ? '!border-brand-500 !bg-brand-600/15 !text-brand-700 dark:!text-brand-300' : ''}`}
                onClick={() => {
                  setFrom(p.from)
                  setTo(p.to)
                }}
              >
                {p.label}
              </Button>
            )
          })}
        </div>
        {/* Phones: From/To share a row (stacking below 360px), Employee
            and Export get full-width rows. md+: one wrapping row. */}
        <div className="grid grid-cols-2 gap-3 max-[359px]:grid-cols-1 md:flex md:flex-wrap md:items-end">
          <label className="flex min-w-0 flex-col text-sm text-gray-600 dark:text-gray-400">
            From
            <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="field mt-1 px-2.5 md:px-3" />
          </label>
          <label className="flex min-w-0 flex-col text-sm text-gray-600 dark:text-gray-400">
            To
            <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="field mt-1 px-2.5 md:px-3" />
          </label>
          {isReviewer && (
            <EmployeeFilter value={employeeId} onChange={setEmployeeId} className="col-span-full md:col-auto" />
          )}
          <Button
            variant="primary"
            onClick={handleExport}
            disabled={exporting || rangeInvalid}
            className="col-span-full w-full md:col-auto md:w-auto"
          >
            {exporting ? 'Exporting…' : 'Export to Excel'}
          </Button>
        </div>
      </Card>
      {rangeInvalid && <p className="mb-2 text-sm text-red-600 dark:text-red-400">"To" can't be before "From".</p>}
      {exportError && <p className="mb-2 text-sm text-red-600 dark:text-red-400">{exportError}</p>}

      {loading && <LoadingState />}
      {error && <ErrorState message={error} />}

      <Tabs
        tabs={[
          {
            id: 'today',
            label: 'Today',
            badge: attendanceStatus?.checkedIn && !attendanceStatus.checkOutAt ? 'In' : undefined,
            content: (
        <SectionStack tabs={false}>
        <Section
          id="attendance.today"
          title="Time in / Time out"
          hint="Today"
          defaultOpen
          aside={
            attendanceStatus?.checkedIn ? (
              <Badge tone={attendanceStatus.checkOutAt ? 'gray' : 'green'}>
                {attendanceStatus.checkOutAt ? 'Checked out' : 'Checked in'}
              </Badge>
            ) : undefined
          }
        >
          {attendanceStatus?.checkedIn ? (
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-gray-500 dark:text-gray-400">Time in</dt>
                <dd className="font-medium text-gray-900 dark:text-gray-100">{timeFmt(attendanceStatus.checkInAt)}</dd>
              </div>
              <div>
                <dt className="text-gray-500 dark:text-gray-400">Time out</dt>
                <dd className="font-medium text-gray-900 dark:text-gray-100">{timeFmt(attendanceStatus.checkOutAt)}</dd>
              </div>
            </dl>
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400">You haven't checked in today.</p>
          )}
          <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
            Clock in and out with the BPO Time app (Launch App, top right). Logging in to the portal does not clock you in.
          </p>
        </Section>

        {(!isReviewer || employeeId) && (
          <Section id="attendance.weekly" title="Weekly tracker" hint="Regular hours, overtime, working holiday" defaultOpen>
            <WeeklyTracker employeeId={employeeId} reloadToken={reloadToken} />
          </Section>
        )}
        </SectionStack>
            ),
          },
          {
            id: 'history',
            label: 'History and reports',
            badge: absences.length > 0 ? absences.length : undefined,
            content: (
        <SectionStack tabs={false}>
        <Section id="attendance.history" title="Attendance history" hint={`${from} to ${to}`} defaultOpen>
          {data && data.length === 0 && <EmptyState label="No attendance records in this range." />}
          {data && data.length > 0 && (
            <Card className="overflow-x-auto !p-0">
              <table className="stack-table w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-black/5 text-xs uppercase tracking-wide text-gray-500 dark:border-white/10 dark:text-gray-400">
                    {isReviewer && <th className="py-3 pl-4 pr-4 font-medium">Employee</th>}
                    <th className="py-3 pr-4 pl-4 font-medium first:pl-4">Date</th>
                    <th className="py-3 pr-4 font-medium">Check In</th>
                    <th className="py-3 pr-4 font-medium">Check Out</th>
                    {isReviewer && <th className="py-3 pr-4 font-medium">Check-in IP</th>}
                    {isReviewer && <th className="py-3 pr-4 font-medium">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {data.map((r) => (
                    <tr
                      key={r.id}
                      className="border-b border-black/5 transition-colors last:border-0 hover:bg-black/[0.02] dark:border-white/5 dark:hover:bg-white/[0.03]"
                    >
                      {isReviewer && (
                        <td data-primary className="py-2.5 pl-4 pr-4 text-gray-700 dark:text-gray-300">
                          {r.employeeName}
                        </td>
                      )}
                      <td
                        {...(isReviewer ? { 'data-label': 'Date' } : { 'data-primary': true })}
                        className="py-2.5 pl-4 pr-4 text-gray-700 dark:text-gray-300"
                      >
                        {formatDateOnly(r.date)}
                      </td>
                      {r.status === 'absent' ? (
                        <>
                          <td
                            data-label="Status"
                            colSpan={isReviewer ? 3 : 2}
                            className="py-2.5 pr-4 text-amber-700 dark:text-amber-500"
                          >
                            Absent
                          </td>
                          {isReviewer && (
                            <td data-hide-mobile className="py-2.5 pr-4 text-gray-700 dark:text-gray-300">
                              —
                            </td>
                          )}
                        </>
                      ) : (
                        <>
                          <td data-label="Check In" className="py-2.5 pr-4 text-gray-700 dark:text-gray-300">
                            {timeFmt(r.checkInAt)}
                          </td>
                          <td data-label="Check Out" className="py-2.5 pr-4 text-gray-700 dark:text-gray-300">
                            {timeFmt(r.checkOutAt)}
                          </td>
                          {isReviewer && (
                            <td
                              data-label="Check-in IP"
                              className={`py-2.5 pr-4 ${r.checkInOffSite ? 'text-amber-700 dark:text-amber-500' : 'text-gray-700 dark:text-gray-300'}`}
                            >
                              <span>
                                {r.checkInIp ?? '—'}
                                {r.checkInOffSite && <span className="ml-1 whitespace-nowrap text-xs">(off-site)</span>}
                              </span>
                            </td>
                          )}
                          {isReviewer && (
                            <td data-actions className="py-2.5 pr-4">
                              <MarkAbsentRowButton record={r} onMarked={() => setReloadToken((t) => t + 1)} />
                            </td>
                          )}
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </Section>

        <Section id="attendance.summary" title="Attendance summary" hint={`${from} to ${to}`}>
          <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-gray-500 dark:text-gray-400">Days present</dt>
              <dd className="text-xl font-semibold text-gray-900 dark:text-gray-100">{present.length}</dd>
            </div>
            <div>
              <dt className="text-gray-500 dark:text-gray-400">Days absent</dt>
              <dd className="text-xl font-semibold text-gray-900 dark:text-gray-100">{absences.length}</dd>
            </div>
            <div>
              <dt className="text-gray-500 dark:text-gray-400">Hours worked</dt>
              <dd className="text-xl font-semibold text-gray-900 dark:text-gray-100">{totalHours.toFixed(1)}</dd>
            </div>
            <div>
              <dt className="text-gray-500 dark:text-gray-400">Avg hours / day</dt>
              <dd className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                {completedDays > 0 ? (totalHours / completedDays).toFixed(1) : '—'}
              </dd>
            </div>
          </dl>
          {isReviewer && !employeeId && (
            <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
              Totals cover every employee in the range. Pick an employee above for an individual summary.
            </p>
          )}
        </Section>

        <Section id="attendance.late" title="Late / undertime records" hint={`${from} to ${to}`}>
          <LateReport from={from} to={to} employeeId={employeeId} />
        </Section>

        <Section
          id="attendance.absences"
          title="Absences"
          hint={`${absences.length} in this range`}
          aside={absences.length > 0 ? <Badge tone="amber">{absences.length}</Badge> : undefined}
        >
          {absences.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">No absences in this range.</p>
          ) : (
            <ul className="divide-y divide-black/5 text-sm dark:divide-white/10">
              {absences.map((r) => (
                <li key={r.id} className="flex flex-wrap justify-between gap-2 py-2">
                  <span className="text-gray-900 dark:text-gray-100">{isReviewer ? r.employeeName : 'Absent'}</span>
                  <span className="text-gray-500 dark:text-gray-400">{formatDateOnly(r.date)}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
        </SectionStack>
            ),
          },
          {
            id: 'shifts',
            label: 'Shifts',
            content: (
        <SectionStack tabs={false}>
        <Section id="attendance.schedule" title="My shift schedule" hint="Set by HR">
          <MySchedule />
          {isReviewer && (
            <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
              HR and Admin set up and assign shifts in <Link to="/hris?tab=shifts" className="text-brand-700 underline dark:text-brand-400">Employee Management, Shifts</Link>.
            </p>
          )}
        </Section>

        </SectionStack>
            ),
          },
          ...(isReviewer
            ? [
                {
                  id: 'corrections',
                  label: 'Corrections',
                  content: (
        <SectionStack tabs={false}>
        <Section id="attendance.corrections" title="Attendance corrections" hint="HR / Admin" roles={['hr', 'admin']}>
          <CorrectionForm onCorrected={() => setReloadToken((t) => t + 1)} />
        </Section>
        </SectionStack>
                  ),
                },
              ]
            : []),
        ]}
      />
    </div>
  )
}
