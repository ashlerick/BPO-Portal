import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import { EmptyState, ErrorState, LoadingState } from '../../components/AsyncState'
import { useApiData } from '../../hooks/useApiData'
import { api, ApiError } from '../../services/api'
import type { EmployeeRecord } from '../hris/types'
import { addDaysIso, formatDateOnly, formatManilaTime, startOfMonthIso, todayInManilaIso } from '../../utils/dates'
import { zoneLabel } from '../../utils/shiftTime'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { PageHeader } from '../../components/ui/PageHeader'
import { Tabs } from '../../components/ui/Tabs'
import { Badge } from '../../components/ui/Badge'
import type { AttendanceRecord } from './types'
import type { ReportRow } from './Shifts'
import { OvertimeAllotments } from './OvertimeAllotments'
import { WeeklyTab } from './WeeklyTab'
import { IssuesTab } from './IssuesTab'
import { issueRows, issuesFor, reportKey, type IssueKind } from './attendanceIssues'
import { BreakSlotCell } from '../../components/ui/BreaksCell'
import { netHours } from '../../utils/breaks'

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

// A day nobody clocked in for: HR picks the person and the day and enters the times. (Fixing a record that exists is done on the
// row itself; this creates one.) The times are checked before saving, the same as a correction.
function AddDayForm({ onAdded }: { onAdded: () => void }) {
  const { guardedAction } = useAuth()
  const { data: employees } = useApiData<EmployeeRecord[]>('/employees')
  const [employeeId, setEmployeeId] = useState('')
  const [date, setDate] = useState(todayInManilaIso())
  const [timeIn, setTimeIn] = useState('')
  const [timeOut, setTimeOut] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const span = timeIn && timeOut ? worked(fromManilaLocal(timeIn), fromManilaLocal(timeOut)) : null
  const canSave = !!employeeId && !!date && !!timeIn && (span ? span.ok : true) && !saving

  function submit(e: FormEvent) {
    e.preventDefault()
    guardedAction(['hr', 'admin'], async () => {
      setSaving(true)
      setMessage(null)
      try {
        await api.post('/leave/attendance/add', {
          employeeId,
          date,
          checkInAt: fromManilaLocal(timeIn),
          checkOutAt: timeOut ? fromManilaLocal(timeOut) : null,
        })
        setMessage({ ok: true, text: 'Day added. It is in the table now.' })
        setTimeIn('')
        setTimeOut('')
        onAdded()
      } catch (err) {
        setMessage({ ok: false, text: err instanceof ApiError ? err.message : 'Could not add the day' })
      } finally {
        setSaving(false)
      }
    })
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <p className="text-sm text-gray-600 dark:text-gray-400">
        For a day someone worked but never clocked in. A day that already has a time in is changed with the pencil in the table.
        Times are Manila time; a night shift's time out is on the next day.
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
          Day (the shift's day)
          <input type="date" required max={todayInManilaIso()} value={date} onChange={(e) => setDate(e.target.value)} className="field mt-1" />
        </label>
        <label className="flex flex-col text-sm text-gray-600 dark:text-gray-400">
          Time in
          <input type="datetime-local" required value={timeIn} onChange={(e) => setTimeIn(e.target.value)} className="field mt-1" />
        </label>
        <label className="flex flex-col text-sm text-gray-600 dark:text-gray-400">
          Time out (optional)
          <input type="datetime-local" value={timeOut} min={timeIn || undefined} onChange={(e) => setTimeOut(e.target.value)} className="field mt-1" />
        </label>
      </div>
      {span && (span.ok ? <p className="text-sm text-brand-700 dark:text-brand-400">{span.text}</p> : <p className="text-sm text-red-600 dark:text-red-400">{span.problem}</p>)}
      {message && (
        <p className={`text-sm ${message.ok ? 'text-brand-700 dark:text-brand-400' : 'text-red-600 dark:text-red-400'}`}>{message.text}</p>
      )}
      <Button type="submit" variant="primary" size="sm" disabled={!canSave}>
        {saving ? 'Adding…' : 'Add the day'}
      </Button>
    </form>
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

const RANGES = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: '7', label: 'Last 7 days' },
  { key: 'month', label: 'This month' },
  { key: 'custom', label: 'Custom range…' },
] as const
type RangeKey = (typeof RANGES)[number]['key']

function rangeFor(key: RangeKey, customFrom: string, customTo: string): { from: string; to: string } {
  const today = todayInManilaIso()
  if (key === 'today') return { from: today, to: today }
  if (key === 'yesterday') return { from: addDaysIso(today, -1), to: addDaysIso(today, -1) }
  if (key === '7') return { from: addDaysIso(today, -6), to: today }
  if (key === 'month') return { from: startOfMonthIso(today), to: today }
  return { from: customFrom, to: customTo }
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('')

function Tile({ label, value, sub, tone, onClick }: { label: string; value: string; sub: string; tone?: 'amber' | 'red'; onClick: () => void }) {
  const valueClass = tone === 'amber' ? 'text-amber-600 dark:text-amber-400' : tone === 'red' ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-gray-100'
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-xl border border-black/5 bg-white/80 px-3.5 py-3 text-left shadow-sm transition hover:border-brand-500 dark:border-white/10 dark:bg-white/[0.035]"
    >
      <span className="block text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</span>
      <span className={`block text-2xl font-semibold tabular-nums ${valueClass}`}>{value}</span>
      <span className="block text-xs text-gray-500 dark:text-gray-400">{sub}</span>
    </button>
  )
}

// One person's days: a card with their name, shift and what needs a look, then a row per day. The header opens and closes the days.
function PersonCard({
  name,
  rows,
  reports,
  today,
  isReviewer,
  open,
  onToggle,
  onChanged,
}: {
  name: string
  rows: AttendanceRecord[]
  reports: Map<string, ReportRow>
  today: string
  isReviewer: boolean
  open: boolean
  onToggle: () => void
  onChanged: () => void
}) {
  const withIssues = rows.map((r) => ({ r, rep: reports.get(reportKey(r.employeeId, r.date)) })).map((x) => ({ ...x, issues: issuesFor(x.r, x.rep, today) }))
  const days = (kind: IssueKind) => withIssues.filter((x) => x.issues.some((i) => i.kind === kind)).length
  const presentDays = rows.filter((r) => r.status === 'present').length
  const shift = withIssues.find((x) => x.rep)?.rep
  const chips: { label: string; tone: 'green' | 'amber' | 'red' }[] = [
    { label: `${presentDays} present`, tone: 'green' },
    ...([
      ['late', 'late', 'amber'],
      ['undertime', 'undertime', 'red'],
      ['absent', 'absent', 'red'],
      ['noOut', 'no time out', 'amber'],
      ['breakOver', 'break over', 'red'],
    ] as const).flatMap(([kind, text, tone]) => (days(kind) > 0 ? [{ label: `${days(kind)} ${text}`, tone }] : [])),
  ]

  return (
    <article className="overflow-hidden rounded-xl border border-black/5 bg-white/80 shadow-sm dark:border-white/10 dark:bg-white/[0.035]">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full flex-wrap items-center gap-x-3 gap-y-2 border-l-4 border-brand-500 bg-black/[0.03] px-4 py-3 text-left hover:bg-black/[0.05] dark:bg-white/[0.05] dark:hover:bg-white/[0.07]"
      >
        <span aria-hidden className="grid h-9 w-9 flex-none place-items-center rounded-full bg-brand-600 text-xs font-bold text-white">
          {initials(name)}
        </span>
        <span className="min-w-0 flex-1 basis-48">
          <span className="block truncate text-[15px] font-semibold text-gray-900 dark:text-gray-100">{name}</span>
          <span className="block truncate text-xs text-gray-500 dark:text-gray-400">
            {shift ? `${shift.shiftName} · ${shift.scheduledStart}–${shift.scheduledEnd} ${zoneLabel(shift.timezone)}` : 'No shift measured'}
          </span>
        </span>
        <span className="flex flex-wrap items-center gap-1.5">
          {chips.map((c) => (
            <Badge key={c.label} tone={c.tone}>
              {c.label}
            </Badge>
          ))}
          <span aria-hidden className={`ml-1 inline-block text-xs text-gray-500 transition-transform ${open ? 'rotate-90' : ''}`}>
            ▶
          </span>
        </span>
      </button>
      {open && (
        <div className="overflow-x-auto">
          <table className="stack-table w-full text-left text-sm">
            <thead>
              <tr className="border-b border-black/5 text-xs uppercase tracking-wide text-gray-500 dark:border-white/10 dark:text-gray-400">
                <th className="py-2.5 pl-4 pr-4 font-medium">Day</th>
                <th className="py-2.5 pr-4 font-medium">In</th>
                <th className="py-2.5 pr-4 font-medium">Out</th>
                <th className="py-2.5 pr-4 font-medium">Break 1</th>
                <th className="py-2.5 pr-4 font-medium">Lunch</th>
                <th className="py-2.5 pr-4 font-medium">Break 2</th>
                <th className="py-2.5 pr-4 font-medium">Worked</th>
                <th className="py-2.5 pr-4 font-medium">Flags</th>
                {isReviewer && <th className="py-2.5 pr-4 font-medium">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {withIssues.map(({ r, issues }) => {
                const gross = hoursBetween(r.checkInAt, r.checkOutAt)
                return (
                  <tr key={r.id} className="border-t border-black/5 first:border-0 dark:border-white/5">
                    <td data-primary className="py-2.5 pl-4 pr-4 text-gray-700 dark:text-gray-300">
                      {formatDateOnly(r.date)}
                    </td>
                    {r.status === 'absent' ? (
                      <>
                        <td data-label="Status" colSpan={isReviewer ? 7 : 6} className="py-2.5 pr-4 text-amber-700 dark:text-amber-500">
                          Absent
                        </td>
                      </>
                    ) : (
                      <>
                        <td data-label="In" className="py-2.5 pr-4 text-gray-700 dark:text-gray-300">
                          <EditableTime record={r} field="checkInAt" onSaved={onChanged} />
                        </td>
                        <td data-label="Out" className="py-2.5 pr-4 text-gray-700 dark:text-gray-300">
                          <EditableTime record={r} field="checkOutAt" onSaved={onChanged} />
                        </td>
                        <td data-label="Break 1" className="py-2.5 pr-4 text-gray-700 dark:text-gray-300">
                          <EditableBreak record={r} slot="morning" onSaved={onChanged} />
                        </td>
                        <td data-label="Lunch" className="py-2.5 pr-4 text-gray-700 dark:text-gray-300">
                          <EditableBreak record={r} slot="lunch" onSaved={onChanged} />
                        </td>
                        <td data-label="Break 2" className="py-2.5 pr-4 text-gray-700 dark:text-gray-300">
                          <EditableBreak record={r} slot="afternoon" onSaved={onChanged} />
                        </td>
                        <td data-label="Worked" className="py-2.5 pr-4 tabular-nums text-gray-700 dark:text-gray-300">
                          {gross > 0 ? `${netHours(gross, r.breaks).toFixed(1)} h` : '—'}
                        </td>
                        <td data-label="Flags" className="py-2.5 pr-4">
                          <span className="flex flex-wrap justify-end gap-1.5 md:justify-start">
                            {issues.length === 0 && r.checkOutAt ? <Badge tone="green">OK</Badge> : null}
                            {issues.map((i) => (
                              <Badge key={i.kind} tone={i.tone}>
                                {i.label}
                              </Badge>
                            ))}
                          </span>
                        </td>
                        {isReviewer && (
                          <td data-actions className="py-2.5 pr-4">
                            <MarkAbsentRowButton record={r} onMarked={onChanged} />
                          </td>
                        )}
                      </>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </article>
  )
}

export function AttendancePage() {
  const { effectiveRoles } = useAuth()
  const isReviewer = effectiveRoles.some((r) => r === 'hr' || r === 'admin')
  const today = todayInManilaIso()

  // What is shown (from, to, employeeId) changes only when the person presses Show records; the toolbar holds a draft until then,
  // so picking a date does not reload the page.
  const [from, setFrom] = useState(today)
  const [to, setTo] = useState(today)
  const [employeeId, setEmployeeId] = useState('')
  const [rangeKey, setRangeKey] = useState<RangeKey>('today')
  const [customFrom, setCustomFrom] = useState(today)
  const [customTo, setCustomTo] = useState(today)
  const [draftEmployee, setDraftEmployee] = useState('')
  const draft = rangeFor(rangeKey, customFrom, customTo)
  const draftInvalid = !draft.from || !draft.to || draft.to < draft.from
  const unapplied = draft.from !== from || draft.to !== to || draftEmployee !== employeeId
  function applyFilters() {
    if (draftInvalid) return
    setFrom(draft.from)
    setTo(draft.to)
    setEmployeeId(draftEmployee)
  }

  const [tab, setTab] = useState('records')
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const [adding, setAdding] = useState(false)
  const [byHand, setByHand] = useState(false)
  const reload = () => setReloadToken((t) => t + 1)

  const params = new URLSearchParams({ from, to })
  if (employeeId) params.set('employeeId', employeeId)
  if (reloadToken) params.set('_r', String(reloadToken))
  const { data, loading, error } = useApiData<AttendanceRecord[]>(`/leave/attendance?${params.toString()}`)
  const reportParams = new URLSearchParams({ kind: 'report', from, to })
  if (employeeId) reportParams.set('employeeId', employeeId)
  if (reloadToken) reportParams.set('_r', String(reloadToken))
  const { data: report } = useApiData<ReportRow[]>(`/hr/shifts?${reportParams.toString()}`)

  const records = data ?? []
  const reports = new Map((report ?? []).map((r) => [reportKey(r.employeeId, r.date), r]))
  const present = records.filter((r) => r.status === 'present')
  const absences = records.filter((r) => r.status === 'absent')
  const issues = issueRows(records, reports, today)
  const lateDays = (report ?? []).filter((r) => r.lateMinutes > 0)
  const shortDays = (report ?? []).filter((r) => r.undertimeMinutes > 0)
  const lateMinutes = lateDays.reduce((n, r) => n + r.lateMinutes, 0)
  const shortMinutes = shortDays.reduce((n, r) => n + r.undertimeMinutes, 0)
  const totalHours = present.reduce((sum, r) => sum + netHours(hoursBetween(r.checkInAt, r.checkOutAt), r.breaks), 0)
  const completedDays = present.filter((r) => r.checkInAt && r.checkOutAt).length
  const overtimeHours = records.reduce((n, r) => n + (r.overtimeHours ?? 0) + (r.overtimeGivenHours ?? 0), 0)
  const rangeText = from === to ? formatDateOnly(from) : `${formatDateOnly(from)} to ${formatDateOnly(to)}`

  // One card per person (the same grouping the Excel export uses for its sheets), people A to Z, days in order. With everyone shown,
  // each card starts closed; with one person chosen it starts open. Opening or closing is remembered until the list changes.
  const [toggled, setToggled] = useState<Record<string, boolean>>({})
  const byPerson = [...records]
    .sort((a, b) => a.employeeName.localeCompare(b.employeeName) || a.date.localeCompare(b.date))
    .reduce<{ name: string; rows: AttendanceRecord[] }[]>((groups, r) => {
      const last = groups[groups.length - 1]
      if (last && last.rows[0].employeeName === r.employeeName) last.rows.push(r)
      else groups.push({ name: r.employeeName, rows: [r] })
      return groups
    }, [])

  async function handleExport() {
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
    <div className="space-y-4">
      <PageHeader title="Attendance" description="Everyone's records, by person. Your own time is under My Time." />
      <p className="-mt-2 text-xs text-gray-500 dark:text-gray-400">
        Set up and assign shifts in <Link to="/hris?tab=shifts" className="text-brand-700 underline dark:text-brand-400">Employee Management, Shifts</Link>.
      </p>

      <Card>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            applyFilters()
          }}
          className="grid grid-cols-2 items-end gap-3 max-[359px]:grid-cols-1 md:flex md:flex-wrap"
        >
          <label className="col-span-full flex min-w-0 flex-col text-sm text-gray-600 dark:text-gray-400 md:col-auto md:w-52">
            Range
            <select value={rangeKey} onChange={(e) => setRangeKey(e.target.value as RangeKey)} className="field mt-1">
              {RANGES.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          {rangeKey === 'custom' && (
            <>
              <label className="flex min-w-0 flex-col text-sm text-gray-600 dark:text-gray-400">
                From
                <input type="date" value={customFrom} max={customTo} onChange={(e) => setCustomFrom(e.target.value)} className="field mt-1 px-2.5 md:px-3" />
              </label>
              <label className="flex min-w-0 flex-col text-sm text-gray-600 dark:text-gray-400">
                To
                <input type="date" value={customTo} min={customFrom} onChange={(e) => setCustomTo(e.target.value)} className="field mt-1 px-2.5 md:px-3" />
              </label>
            </>
          )}
          {isReviewer && <EmployeeFilter value={draftEmployee} onChange={setDraftEmployee} className="col-span-full md:col-auto md:w-64" />}
          <Button type="submit" variant="primary" disabled={draftInvalid || !unapplied} className="col-span-full w-full md:col-auto md:w-auto">
            Show records
          </Button>
          {isReviewer && (
            <Button type="button" onClick={handleExport} disabled={exporting} className="col-span-full w-full md:col-auto md:w-auto">
              {exporting ? 'Exporting…' : 'Export to Excel'}
            </Button>
          )}
        </form>
        {draftInvalid && <p className="mt-2 text-sm text-red-600 dark:text-red-400">"To" can't be before "From".</p>}
        {exportError && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{exportError}</p>}
      </Card>

      <div className="grid grid-cols-2 gap-2.5 min-[560px]:grid-cols-3 lg:grid-cols-6">
        <Tile label="Present" value={String(present.length)} sub={present.length === 1 ? 'day' : 'days'} onClick={() => setTab('records')} />
        <Tile label="Absent" value={String(absences.length)} sub={absences.length === 1 ? 'day' : 'days'} onClick={() => setTab('issues')} />
        <Tile label="Late" value={String(lateDays.length)} sub={lateMinutes ? `${lateMinutes} min in total` : 'none'} tone={lateDays.length ? 'amber' : undefined} onClick={() => setTab('issues')} />
        <Tile label="Undertime" value={String(shortDays.length)} sub={shortMinutes ? `${shortMinutes} min in total` : 'none'} tone={shortDays.length ? 'red' : undefined} onClick={() => setTab('issues')} />
        <Tile label="Hours worked" value={totalHours.toFixed(1)} sub={completedDays > 0 ? `avg ${(totalHours / completedDays).toFixed(1)} a day` : 'no finished days'} onClick={() => setTab('records')} />
        <Tile label="Overtime" value={`${Math.round(overtimeHours * 100) / 100} h`} sub="given and typed in" onClick={() => setTab('overtime')} />
      </div>

      {loading && <LoadingState />}
      {error && <ErrorState message={error} />}

      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          {
            id: 'records',
            label: 'Records',
            content: (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    Attendance records <span className="font-normal text-gray-500 dark:text-gray-400">{rangeText}</span>
                  </h2>
                  <div className="flex flex-wrap gap-2">
                    {byPerson.length > 1 && (
                      <>
                        <Button size="sm" onClick={() => setToggled(Object.fromEntries(byPerson.map((g) => [g.rows[0].employeeId ?? g.name, true])))}>
                          Open all
                        </Button>
                        <Button size="sm" onClick={() => setToggled(Object.fromEntries(byPerson.map((g) => [g.rows[0].employeeId ?? g.name, false])))}>
                          Close all
                        </Button>
                      </>
                    )}
                    {isReviewer && (
                      <Button size="sm" aria-expanded={adding} onClick={() => setAdding((a) => !a)}>
                        Add a missing day
                      </Button>
                    )}
                  </div>
                </div>
                {adding && isReviewer && (
                  <Card>
                    <AddDayForm
                      onAdded={() => {
                        reload()
                        setAdding(false)
                      }}
                    />
                  </Card>
                )}
                {data && data.length === 0 && <EmptyState label="No attendance records in this range." />}
                {byPerson.map(({ name, rows }) => {
                  const key = rows[0].employeeId ?? name
                  return (
                    <PersonCard
                      key={key}
                      name={name}
                      rows={rows}
                      reports={reports}
                      today={today}
                      isReviewer={isReviewer}
                      open={toggled[key] ?? byPerson.length === 1}
                      onToggle={() => setToggled((t) => ({ ...t, [key]: !(t[key] ?? byPerson.length === 1) }))}
                      onChanged={reload}
                    />
                  )
                })}
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Hours are time in to time out less the recorded breaks and lunch. The pencil changes a time; a login address shows only when it looks off-site.
                </p>
              </div>
            ),
          },
          { id: 'weekly', label: 'Weekly tracker', content: <WeeklyTab key={employeeId} employeeId={employeeId} reloadToken={reloadToken} /> },
          { id: 'issues', label: 'Issues', badge: issues.length > 0 ? issues.length : undefined, content: <IssuesTab rows={issues} range={rangeText} /> },
          ...(isReviewer
            ? [
                {
                  id: 'overtime',
                  label: 'Overtime',
                  content: (
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Overtime</h2>
                        <button type="button" onClick={() => setByHand((b) => !b)} aria-expanded={byHand} className="text-xs text-gray-500 underline underline-offset-2 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200">
                          {byHand ? 'Hide' : 'Enter'} hours by hand
                        </button>
                      </div>
                      {byHand && (
                        <Card>
                          <CorrectionForm onCorrected={reload} />
                        </Card>
                      )}
                      <Card>
                        <OvertimeAllotments from={from} to={to} employeeId={employeeId} reloadToken={reloadToken} onChanged={reload} />
                      </Card>
                    </div>
                  ),
                },
              ]
            : []),
        ]}
      />
    </div>
  )
}
