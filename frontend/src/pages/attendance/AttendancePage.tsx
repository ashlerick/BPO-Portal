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
import { LateReport } from './Shifts'
import { BreakSlotCell } from '../../components/ui/BreaksCell'

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

// Manila wall-clock text for a <input type="datetime-local"> ("2026-09-08T19:31"), and back to a real moment.
function toManilaLocal(iso: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    })
      .formatToParts(new Date(iso))
      .map((p) => [p.type, p.value]),
  )
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`
}
const fromManilaLocal = (value: string) => new Date(`${value}:00+08:00`).toISOString()

function worked(a: string, b: string): { text: string; ok: boolean; problem?: string } {
  const mins = Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000)
  if (mins <= 0) return { text: '', ok: false, problem: 'Time out has to be after time in. For a night shift, the time out is on the next day.' }
  if (mins > 20 * 60) return { text: '', ok: false, problem: 'More than 20 hours. Check the dates.' }
  return { text: `${Math.floor(mins / 60)}h ${mins % 60}m worked`, ok: true }
}

// A check-in or check-out time HR can fix right where it is shown. A missing time out (someone forgot to clock out) is
// flagged, with one button to add it. The editor shows how long the shift comes to before saving, and refuses times that
// cannot be right (time out before time in, a shift past 20 hours).
function EditableTime({
  record,
  field,
  onSaved,
}: {
  record: AttendanceRecord
  field: 'checkInAt' | 'checkOutAt'
  onSaved: () => void
}) {
  const { guardedAction } = useAuth()
  const value = record[field]
  const other = field === 'checkInAt' ? record.checkOutAt : record.checkInAt
  const label = field === 'checkInAt' ? 'time in' : 'time out'
  const [editing, setEditing] = useState(false)
  const [input, setInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function open() {
    // Start from the current time; for a missing time out, from the time in (which is not valid until it is changed).
    setInput(toManilaLocal(value ?? record.checkInAt ?? new Date().toISOString()))
    setError(null)
    setEditing(true)
  }

  const next = input ? fromManilaLocal(input) : null
  const span = next && other ? (field === 'checkInAt' ? worked(next, other) : worked(other, next)) : null
  const unchanged = next === value
  const canSave = !!next && !unchanged && (span ? span.ok : true) && !saving

  function save() {
    if (!next) return
    guardedAction(['hr', 'admin'], async () => {
      setSaving(true)
      setError(null)
      try {
        await api.post('/leave/attendance/correct', {
          employeeId: record.employeeId,
          date: record.date.slice(0, 10),
          [field]: next,
        })
        setEditing(false)
        onSaved()
      } catch (err) {
        setError(err instanceof ApiError ? err.message : `Could not save the ${label}`)
      } finally {
        setSaving(false)
      }
    })
  }

  if (!editing) {
    const missing = !value && field === 'checkOutAt'
    return (
      <span className="inline-flex flex-wrap items-center gap-1.5">
        {missing ? (
          <button
            type="button"
            onClick={open}
            className="rounded-full border border-amber-500/60 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-700 hover:bg-amber-500/20 dark:text-amber-400"
          >
            No time out · Add
          </button>
        ) : (
          <>
            <span>{timeFmt(value)}</span>
            {value && (
              <button
                type="button"
                onClick={open}
                aria-label={`Edit ${label} for ${record.employeeName}`}
                title={`Edit ${label}`}
                className="rounded p-0.5 text-gray-400 hover:bg-black/5 hover:text-gray-700 dark:hover:bg-white/10 dark:hover:text-gray-200"
              >
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
                </svg>
              </button>
            )}
          </>
        )}
      </span>
    )
  }

  return (
    <div className="space-y-1.5">
      <input
        type="datetime-local"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        aria-label={`New ${label} (Manila time)`}
        className="field w-full min-w-[12rem] px-2 py-1 text-sm"
      />
      <p className="text-xs text-gray-500 dark:text-gray-400">Manila time. A night shift's time out is on the next day.</p>
      {span && (span.ok ? <p className="text-xs text-brand-700 dark:text-brand-400">{span.text}</p> : <p className="text-xs text-red-600 dark:text-red-400">{span.problem}</p>)}
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      <div className="flex gap-2">
        <Button size="sm" variant="primary" disabled={!canSave} onClick={save}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
        <Button size="sm" onClick={() => setEditing(false)} disabled={saving}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

// One break slot (Break 1, Lunch or Break 2) in its own column, with a pencil. HR can change when it started and ended, mark it
// not taken, or remove the record. The portal checks the times before saving (the end after the start, inside the shift, no
// overlap with another break) and works out "over" itself by the grace rule; every change is traced in the audit log.
function EditableBreak({
  record,
  slot,
  onSaved,
}: {
  record: AttendanceRecord
  slot: 'morning' | 'lunch' | 'afternoon'
  onSaved: () => void
}) {
  const { guardedAction } = useAuth()
  const label = { morning: 'Break 1', lunch: 'Lunch', afternoon: 'Break 2' }[slot]
  const entry = record.breaks?.find((b) => b.slot === slot)
  const [editing, setEditing] = useState(false)
  const [mode, setMode] = useState<'taken' | 'not_taken' | 'none'>('taken')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function open() {
    setMode(entry ? entry.status : 'taken')
    const base = record.checkInAt ?? new Date().toISOString()
    setStart(toManilaLocal(entry?.startedAt ?? base))
    setEnd(toManilaLocal(entry?.endedAt ?? entry?.startedAt ?? base))
    setError(null)
    setEditing(true)
  }

  const secs = start && end ? Math.round((new Date(fromManilaLocal(end)).getTime() - new Date(fromManilaLocal(start)).getTime()) / 1000) : null
  const timesOk = mode !== 'taken' || (secs !== null && secs > 0 && secs <= 3 * 3600)
  const mmss = (n: number) => `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`

  function save() {
    guardedAction(['hr', 'admin'], async () => {
      setSaving(true)
      setError(null)
      try {
        const others = (record.breaks ?? [])
          .filter((b) => b.slot !== slot)
          .map(({ slot: sl, status, startedAt, endedAt }) => ({ slot: sl, status, startedAt, endedAt }))
        const mine =
          mode === 'none'
            ? []
            : [{ slot, status: mode, startedAt: mode === 'taken' ? fromManilaLocal(start) : null, endedAt: mode === 'taken' ? fromManilaLocal(end) : null }]
        await api.post('/leave/attendance/correct', {
          employeeId: record.employeeId,
          date: record.date.slice(0, 10),
          breaks: [...others, ...mine],
        })
        setEditing(false)
        onSaved()
      } catch (err) {
        setError(err instanceof ApiError ? err.message : `Could not save ${label}`)
      } finally {
        setSaving(false)
      }
    })
  }

  if (!editing) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <BreakSlotCell breaks={record.breaks} slot={slot} />
        <button
          type="button"
          onClick={open}
          aria-label={`${entry ? 'Edit' : 'Add'} ${label} for ${record.employeeName}`}
          title={entry ? `Edit ${label}` : `Add ${label}`}
          className="rounded p-0.5 text-gray-400 hover:bg-black/5 hover:text-gray-700 dark:hover:bg-white/10 dark:hover:text-gray-200"
        >
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
          </svg>
        </button>
      </span>
    )
  }

  return (
    <div className="min-w-[13rem] space-y-1.5 text-xs">
      <div className="flex flex-wrap gap-x-3 gap-y-1" role="radiogroup" aria-label={`${label} status`}>
        {([['taken', 'Taken'], ['not_taken', 'Not taken'], ['none', 'No record']] as const).map(([v, text]) => (
          <label key={v} className="flex items-center gap-1">
            <input type="radio" name={`brk-${record.id}-${slot}`} checked={mode === v} onChange={() => setMode(v)} />
            {text}
          </label>
        ))}
      </div>
      {mode === 'taken' && (
        <>
          <label className="block">
            <span className="text-gray-500 dark:text-gray-400">Started (Manila time)</span>
            <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} className="field mt-0.5 w-full px-2 py-1 text-sm" />
          </label>
          <label className="block">
            <span className="text-gray-500 dark:text-gray-400">Ended</span>
            <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} className="field mt-0.5 w-full px-2 py-1 text-sm" />
          </label>
          {secs !== null &&
            (timesOk ? (
              <p className="text-brand-700 dark:text-brand-400">{mmss(secs)} long</p>
            ) : (
              <p className="text-red-600 dark:text-red-400">The end has to be after the start, and within 3 hours.</p>
            ))}
        </>
      )}
      {error && <p className="text-red-600 dark:text-red-400">{error}</p>}
      <div className="flex gap-2">
        <Button size="sm" variant="primary" disabled={!timesOk || saving} onClick={save}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
        <Button size="sm" onClick={() => setEditing(false)} disabled={saving}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

function CorrectionForm({ onCorrected }: { onCorrected: () => void }) {
  const { guardedAction } = useAuth()
  const { data: employees } = useApiData<EmployeeRecord[]>('/employees')
  const [employeeId, setEmployeeId] = useState('')
  const [date, setDate] = useState(todayInManilaIso())
  const [overtime, setOvertime] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (overtime === '') {
      setMessage({ ok: false, text: 'Enter the overtime hours.' })
      return
    }
    guardedAction(['hr', 'admin'], async () => {
      setSubmitting(true)
      setMessage(null)
      try {
        await api.post('/leave/attendance/correct', { employeeId, date, overtimeHours: Number(overtime) })
        setMessage({ ok: true, text: 'Overtime saved.' })
        setOvertime('')
        onCorrected()
      } catch (err) {
        setMessage({ ok: false, text: err instanceof ApiError ? err.message : 'Could not save the overtime' })
      } finally {
        setSubmitting(false)
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <p className="text-sm text-gray-600 dark:text-gray-400">
        Overtime hours for one person on one day. To fix a time in or time out, edit it right in the Records tab.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
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
          Overtime hours
          <input type="number" min="0" max="24" step="0.25" value={overtime} onChange={(e) => setOvertime(e.target.value)} className="field mt-1" />
        </label>
      </div>
      {message && (
        <p className={`text-sm ${message.ok ? 'text-brand-700 dark:text-brand-400' : 'text-red-600 dark:text-red-400'}`}>
          {message.text}
        </p>
      )}
      <Button type="submit" variant="primary" size="sm" disabled={submitting}>
        {submitting ? 'Saving…' : 'Save overtime'}
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
  const { effectiveRoles } = useAuth()
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
  // One block per person (the same grouping the Excel export uses for its sheets), people A to Z, days in order.
  // With everyone shown, each person's block starts closed (a header line with the counts and what needs a look); with one
  // person chosen it starts open. Opening or closing is remembered per person until the list changes.
  const [toggled, setToggled] = useState<Record<string, boolean>>({})
  const byPerson = [...records]
    .sort((a, b) => a.employeeName.localeCompare(b.employeeName) || a.date.localeCompare(b.date))
    .reduce<{ name: string; rows: AttendanceRecord[] }[]>((groups, r) => {
      const last = groups[groups.length - 1]
      if (last && last.rows[0].employeeName === r.employeeName) last.rows.push(r)
      else groups.push({ name: r.employeeName, rows: [r] })
      return groups
    }, [])
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
      <PageHeader title="Attendance" description="Everyone's records, by person. Your own time is under My Time." />
      <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
        Set up and assign shifts in <Link to="/hris?tab=shifts" className="text-brand-700 underline dark:text-brand-400">Employee Management, Shifts</Link>.
      </p>

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
          {isReviewer && (
            <Button
              variant="primary"
              onClick={handleExport}
              disabled={exporting || rangeInvalid}
              className="col-span-full w-full md:col-auto md:w-auto"
            >
              {exporting ? 'Exporting…' : 'Export to Excel'}
            </Button>
          )}
        </div>
      </Card>
      {rangeInvalid && <p className="mb-2 text-sm text-red-600 dark:text-red-400">"To" can't be before "From".</p>}
      {exportError && <p className="mb-2 text-sm text-red-600 dark:text-red-400">{exportError}</p>}

      {loading && <LoadingState />}
      {error && <ErrorState message={error} />}

      <Tabs
        tabs={[
          {
            id: 'history',
            label: 'Records',
            content: (
        <SectionStack tabs={false}>
        <Section id="attendance.history" title="Attendance history" hint={`${from} to ${to}`} defaultOpen>
          {data && data.length === 0 && <EmptyState label="No attendance records in this range." />}
          {data && data.length > 1 && byPerson.length > 1 && (
            <div className="mb-2 flex gap-2">
              <Button size="sm" onClick={() => setToggled(Object.fromEntries(byPerson.map((g) => [g.rows[0].employeeId ?? g.name, true])))}>
                Open all
              </Button>
              <Button size="sm" onClick={() => setToggled(Object.fromEntries(byPerson.map((g) => [g.rows[0].employeeId ?? g.name, false])))}>
                Close all
              </Button>
            </div>
          )}
          {data && data.length > 0 && (
            <Card className="overflow-x-auto !p-0">
              <table className="stack-table w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-black/5 text-xs uppercase tracking-wide text-gray-500 dark:border-white/10 dark:text-gray-400">
                    <th className="py-3 pr-4 pl-4 font-medium first:pl-4">Date</th>
                    <th className="py-3 pr-4 font-medium">Check In</th>
                    <th className="py-3 pr-4 font-medium">Check Out</th>
                    <th className="py-3 pr-4 font-medium">Break 1</th>
                    <th className="py-3 pr-4 font-medium">Lunch</th>
                    <th className="py-3 pr-4 font-medium">Break 2</th>
                    {isReviewer && <th className="py-3 pr-4 font-medium">Check-in IP</th>}
                    {isReviewer && <th className="py-3 pr-4 font-medium">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {byPerson.flatMap(({ name, rows }) => {
                    const key = rows[0].employeeId ?? name
                    const isOpen = toggled[key] ?? byPerson.length === 1
                    const presentDays = rows.filter((x) => x.status === 'present').length
                    const absentDays = rows.filter((x) => x.status === 'absent').length
                    const missingOut = rows.filter((x) => x.status === 'present' && x.checkInAt && !x.checkOutAt).length
                    const overBreaks = rows.reduce((n, x) => n + (x.breaks ?? []).filter((b) => b.overSeconds > 0).length, 0)
                    return [
                    <tr key={`h-${key}`} className="bg-black/[0.04] dark:bg-white/[0.05]">
                      <td colSpan={8} data-primary className="p-0">
                        <button
                          type="button"
                          onClick={() => setToggled((t) => ({ ...t, [key]: !isOpen }))}
                          aria-expanded={isOpen}
                          className="flex w-full flex-wrap items-center gap-x-2 gap-y-1 px-4 py-2 text-left font-medium text-gray-900 hover:bg-black/[0.03] dark:text-gray-100 dark:hover:bg-white/[0.04]"
                        >
                          <span aria-hidden className={`inline-block text-xs text-gray-500 transition-transform ${isOpen ? 'rotate-90' : ''}`}>
                            ▶
                          </span>
                          {name}
                          <span className="text-xs font-normal text-gray-500 dark:text-gray-400">
                            {presentDays} present{absentDays ? `, ${absentDays} absent` : ''}
                          </span>
                          {missingOut > 0 && (
                            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-normal text-amber-700 dark:text-amber-400">
                              {missingOut} no time out
                            </span>
                          )}
                          {overBreaks > 0 && (
                            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-normal text-amber-700 dark:text-amber-400">
                              {overBreaks} break{overBreaks === 1 ? '' : 's'} over
                            </span>
                          )}
                        </button>
                      </td>
                    </tr>,
                    ...(!isOpen ? [] : rows.map((r) => (
                    <tr
                      key={r.id}
                      className="border-b border-black/5 transition-colors last:border-0 hover:bg-black/[0.02] dark:border-white/5 dark:hover:bg-white/[0.03]"
                    >
                      <td data-primary className="py-2.5 pl-4 pr-4 text-gray-700 dark:text-gray-300">
                        {formatDateOnly(r.date)}
                      </td>
                      {r.status === 'absent' ? (
                        <>
                          <td
                            data-label="Status"
                            colSpan={isReviewer ? 6 : 5}
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
                            <EditableTime record={r} field="checkInAt" onSaved={() => setReloadToken((t) => t + 1)} />
                          </td>
                          <td data-label="Check Out" className="py-2.5 pr-4 text-gray-700 dark:text-gray-300">
                            <EditableTime record={r} field="checkOutAt" onSaved={() => setReloadToken((t) => t + 1)} />
                          </td>
                          <td data-label="Break 1" className="py-2.5 pr-4 text-gray-700 dark:text-gray-300">
                            <EditableBreak record={r} slot="morning" onSaved={() => setReloadToken((t) => t + 1)} />
                          </td>
                          <td data-label="Lunch" className="py-2.5 pr-4 text-gray-700 dark:text-gray-300">
                            <EditableBreak record={r} slot="lunch" onSaved={() => setReloadToken((t) => t + 1)} />
                          </td>
                          <td data-label="Break 2" className="py-2.5 pr-4 text-gray-700 dark:text-gray-300">
                            <EditableBreak record={r} slot="afternoon" onSaved={() => setReloadToken((t) => t + 1)} />
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
                    ))),
                    ]
                  })}
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

        </SectionStack>
            ),
          },
          {
            id: 'weekly',
            label: 'Weekly tracker',
            content: (
        <SectionStack tabs={false}>
        <Section id="attendance.weekly" title="Weekly tracker" hint="Regular hours, overtime, working holiday" defaultOpen>
          {employeeId ? (
            <WeeklyTracker employeeId={employeeId} reloadToken={reloadToken} />
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400">Pick an employee above to see their week.</p>
          )}
        </Section>
        </SectionStack>
            ),
          },
          {
            id: 'late',
            label: 'Late and absences',
            badge: absences.length > 0 ? absences.length : undefined,
            content: (
        <SectionStack tabs={false}>
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
          ...(isReviewer
            ? [
                {
                  id: 'corrections',
                  label: 'Overtime',
                  content: (
        <SectionStack tabs={false}>
        <Section id="attendance.corrections" title="Overtime" hint="HR / Admin" roles={['hr', 'admin']}>
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
