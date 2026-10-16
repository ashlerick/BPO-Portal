import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { EmptyState, ErrorState } from '../../components/AsyncState'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Field, FormError } from '../../components/ui/Field'
import { api, ApiError } from '../../services/api'
import { formatDateOnly, todayInManilaIso } from '../../utils/dates'
import { SHIFT_ZONES, shiftHours, shiftHoursWithChange, zoneLabel } from '../../utils/shiftTime'
import type { EmployeeRecord } from '../hris/types'

// Shift schedules (HR-managed) and the late / undertime / overtime report
// that is measured against them.

export interface Shift {
  id: string
  name: string
  startTime: string
  endTime: string
  workDays: number[]
  breakMinutes: number
  graceMinutes: number
  timezone: string
  isDefault: boolean
  active: boolean
}

interface ScheduleResponse {
  current: { id: string; effectiveFrom: string; shift: Omit<Shift, 'active'> } | null
  history: { id: string; effectiveFrom: string; shift: Omit<Shift, 'active'> }[]
}

interface ReportRow {
  employeeId: string
  employeeName: string
  date: string
  shiftName: string
  scheduledStart: string
  scheduledEnd: string
  timezone?: string
  checkInAt: string | null
  checkOutAt: string | null
  lateMinutes: number
  undertimeMinutes: number
  overtimeMinutes: number
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const dayList = (days: number[]) => [...days].sort((a, b) => a - b).map((d) => DAYS[d]).join(', ')
const timeFmt = new Intl.DateTimeFormat('en-US', { timeStyle: 'short', timeZone: 'Asia/Manila' })
const mins = (n: number) => (n === 0 ? '' : n >= 60 ? `${Math.floor(n / 60)}h ${n % 60}m` : `${n}m`)

// The hours for a given day, in the shift's own zone and the other one (they differ by an hour after California's clocks change).
function describeShift(s: Pick<Shift, 'name' | 'startTime' | 'endTime' | 'workDays' | 'timezone'>, isoDate = todayInManilaIso()) {
  return `${s.name}: ${shiftHoursWithChange(s, isoDate)}, ${dayList(s.workDays)}`
}

// The signed-in employee's current shift.
export function MySchedule() {
  const [data, setData] = useState<ScheduleResponse | null>(null)

  useEffect(() => {
    api
      .get<ScheduleResponse>('/hr/shifts?kind=schedule')
      .then(setData)
      .catch(() => setData(null))
  }, [])

  if (!data) return null
  return data.current ? (
    <div className="text-sm text-gray-700 dark:text-gray-300">
      <p className="font-medium text-gray-900 dark:text-gray-100">{describeShift(data.current.shift)}</p>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        Since {formatDateOnly(data.current.effectiveFrom)}
        {data.current.shift.graceMinutes > 0 && ` · ${data.current.shift.graceMinutes} min grace before you count as late`}
      </p>
    </div>
  ) : (
    <p className="text-sm text-gray-500 dark:text-gray-400">No shift schedule assigned to you yet. HR sets this.</p>
  )
}

// HR: define shift templates.
export function ShiftTemplates({ onChanged }: { onChanged?: () => void }) {
  const [shifts, setShifts] = useState<Shift[]>([])
  const [name, setName] = useState('')
  const [start, setStart] = useState('09:00')
  const [end, setEnd] = useState('18:00')
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5])
  const [breakMin, setBreakMin] = useState('60')
  const [grace, setGrace] = useState('10')
  const [zone, setZone] = useState('America/Los_Angeles')
  const [makeDefault, setMakeDefault] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    api
      .get<Shift[]>('/hr/shifts?kind=templates')
      .then(setShifts)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load shifts'))
  }, [])
  useEffect(load, [load])

  async function add(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      await api.post('/hr/shifts?kind=templates', {
        name,
        startTime: start,
        endTime: end,
        workDays: days,
        breakMinutes: Number(breakMin) || 0,
        graceMinutes: Number(grace) || 0,
        timezone: zone,
        isDefault: makeDefault,
      })
      setName('')
      setMakeDefault(false)
      load()
      onChanged?.()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not add the shift')
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={add} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-6">
          <Field label="Name">
            <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Day shift" className="field" />
          </Field>
          <Field label="Times are in">
            <select value={zone} onChange={(e) => setZone(e.target.value)} className="field">
              {SHIFT_ZONES.map((z) => (
                <option key={z.value} value={z.value}>
                  {z.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Start">
            <input type="time" required value={start} onChange={(e) => setStart(e.target.value)} className="field" />
          </Field>
          <Field label="End">
            <input type="time" required value={end} onChange={(e) => setEnd(e.target.value)} className="field" />
          </Field>
          <Field label="Break (min)">
            <input type="number" min="0" max="240" value={breakMin} onChange={(e) => setBreakMin(e.target.value)} className="field" />
          </Field>
          <Field label="Grace (min)">
            <input type="number" min="0" max="120" value={grace} onChange={(e) => setGrace(e.target.value)} className="field" />
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm text-gray-700 dark:text-gray-300">
          <span>Working days:</span>
          {DAYS.map((d, i) => (
            <label key={d} className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={days.includes(i)}
                onChange={(e) => setDays((prev) => (e.target.checked ? [...prev, i] : prev.filter((x) => x !== i)))}
              />
              {d}
            </label>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
          <input type="checkbox" checked={makeDefault} onChange={(e) => setMakeDefault(e.target.checked)} />
          Default shift: new employees start on it (only one shift can be the default)
        </label>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          An end time earlier than the start (e.g. 22:00 to 06:00) is a night shift that ends the next morning. Enter the times in the zone you pick.
          A California shift follows California's daylight saving by itself, so its Philippines hours move by an hour when the clocks change.
          The list shows both zones for today.
        </p>
        <Button type="submit" variant="primary" size="sm">
          Add shift
        </Button>
      </form>
      <FormError message={error} />

      {shifts.length === 0 ? (
        <EmptyState label="No shifts defined yet." />
      ) : (
        <ul className="divide-y divide-black/5 text-sm dark:divide-white/10">
          {shifts.map((sh) => (
            <ShiftRow key={sh.id} shift={sh} reload={load} />
          ))}
        </ul>
      )}
    </div>
  )
}

// One shift in the list: its hours in both zones, and Edit / Make default / Turn off / Remove. Editing happens in place.
function ShiftRow({ shift: s, reload }: { shift: Shift; reload: () => void }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(s.name)
  const [start, setStart] = useState(s.startTime)
  const [end, setEnd] = useState(s.endTime)
  const [zone, setZone] = useState(s.timezone || 'Asia/Manila')
  const [breakMin, setBreakMin] = useState(String(s.breakMinutes))
  const [grace, setGrace] = useState(String(s.graceMinutes))
  const [days, setDays] = useState<number[]>(s.workDays)
  const [error, setError] = useState<string | null>(null)

  async function save(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      await api.put(`/hr/shifts/${s.id}?kind=templates`, {
        name,
        startTime: start,
        endTime: end,
        timezone: zone,
        breakMinutes: Number(breakMin) || 0,
        graceMinutes: Number(grace) || 0,
        workDays: days,
      })
      setEditing(false)
      reload()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the shift')
    }
  }

  if (editing) {
    return (
      <li className="py-3">
        <form onSubmit={save} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-6">
            <Field label="Name">
              <input required value={name} onChange={(e) => setName(e.target.value)} className="field" />
            </Field>
            <Field label="Times are in">
              <select value={zone} onChange={(e) => setZone(e.target.value)} className="field">
                {SHIFT_ZONES.map((z) => (
                  <option key={z.value} value={z.value}>
                    {z.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Start">
              <input type="time" required value={start} onChange={(e) => setStart(e.target.value)} className="field" />
            </Field>
            <Field label="End">
              <input type="time" required value={end} onChange={(e) => setEnd(e.target.value)} className="field" />
            </Field>
            <Field label="Break (min)">
              <input type="number" min="0" max="240" value={breakMin} onChange={(e) => setBreakMin(e.target.value)} className="field" />
            </Field>
            <Field label="Grace (min)">
              <input type="number" min="0" max="120" value={grace} onChange={(e) => setGrace(e.target.value)} className="field" />
            </Field>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm text-gray-700 dark:text-gray-300">
            <span>Working days:</span>
            {DAYS.map((d, i) => (
              <label key={d} className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={days.includes(i)}
                  onChange={(e) => setDays((prev) => (e.target.checked ? [...prev, i] : prev.filter((x) => x !== i)))}
                />
                {d}
              </label>
            ))}
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Changing a shift changes it for everyone on it, from the day they are measured onward. Days already measured are re-read against the new hours.
          </p>
          <FormError message={error} />
          <div className="flex gap-2">
            <Button type="submit" variant="primary" size="sm" disabled={days.length === 0}>
              Save
            </Button>
            <Button type="button" size="sm" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </li>
    )
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-2">
      <span className={s.active ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400 line-through'}>
        {describeShift(s)}
        <span className="text-gray-500 dark:text-gray-400">
          {' '}
          · break {s.breakMinutes}m · grace {s.graceMinutes}m
        </span>
        {s.isDefault && (
          <Badge tone="green" className="ml-2">
            Default
          </Badge>
        )}
      </span>
      <span className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => setEditing(true)}>
          Edit
        </Button>
        {s.active && !s.isDefault && (
          <Button
            size="sm"
            onClick={async () => {
              await api.put(`/hr/shifts/${s.id}?kind=templates`, { isDefault: true })
              reload()
            }}
          >
            Make default
          </Button>
        )}
        <Button
          size="sm"
          onClick={async () => {
            await api.put(`/hr/shifts/${s.id}?kind=templates`, { active: !s.active })
            reload()
          }}
        >
          {s.active ? 'Turn off' : 'Turn on'}
        </Button>
        <Button
          size="sm"
          variant="danger"
          onClick={async () => {
            if (!window.confirm('Remove this shift? If it was ever assigned it is only turned off, so history stays.')) return
            await api.delete(`/hr/shifts/${s.id}?kind=templates`)
            reload()
          }}
        >
          Remove
        </Button>
      </span>
    </li>
  )
}

export interface EmployeeShift {
  id: string
  name: string
  startTime: string
  endTime: string
  timezone: string
}

// The Shift column in Employee Management: the person's current shift (hours in both zones for today) and a quick
// way to put them on another one from a date. It uses the same assign call as the bulk "Assign shifts" section.
export function EmployeeShiftCell({
  employeeId,
  shift,
  shifts,
  onChanged,
}: {
  employeeId: string
  shift: EmployeeShift | null
  shifts: Shift[]
  onChanged: (next: EmployeeShift) => void
}) {
  const [changing, setChanging] = useState(false)
  const [pick, setPick] = useState('')
  const [from, setFrom] = useState(todayInManilaIso())
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function save() {
    setBusy(true)
    setError(null)
    try {
      await api.post('/hr/shifts?kind=assign', { employeeIds: [employeeId], shiftId: pick, effectiveFrom: from })
      const chosen = shifts.find((x) => x.id === pick)
      // Only a shift that has already started shows as "current"; a future date shows after it begins.
      if (chosen && from <= todayInManilaIso()) onChanged({ id: chosen.id, name: chosen.name, startTime: chosen.startTime, endTime: chosen.endTime, timezone: chosen.timezone })
      setChanging(false)
      setPick('')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not change the shift')
    } finally {
      setBusy(false)
    }
  }

  if (!changing) {
    return (
      <div className="text-sm">
        {shift ? (
          <>
            <div className="text-gray-800 dark:text-gray-200">{shift.name}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">{shiftHoursWithChange(shift, todayInManilaIso())}</div>
          </>
        ) : (
          <span className="text-gray-500 dark:text-gray-400">No shift</span>
        )}
        <button type="button" onClick={() => setChanging(true)} className="mt-0.5 text-xs text-brand-700 underline decoration-dotted underline-offset-2 dark:text-brand-400">
          {shift ? 'Change' : 'Set shift'}
        </button>
      </div>
    )
  }

  return (
    <div className="w-56 space-y-1.5 text-sm">
      <select value={pick} onChange={(e) => setPick(e.target.value)} className="field py-1">
        <option value="">Choose a shift…</option>
        {shifts.map((sh) => (
          <option key={sh.id} value={sh.id}>
            {sh.name} ({shiftHours(sh, from)})
          </option>
        ))}
      </select>
      <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="field py-1" aria-label="Effective from" />
      <FormError message={error} />
      <div className="flex gap-2">
        <Button size="sm" variant="primary" onClick={save} disabled={!pick || busy}>
          {busy ? 'Saving…' : 'Save'}
        </Button>
        <Button size="sm" onClick={() => setChanging(false)}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

// HR: put one or many employees on a shift from a date.
export function AssignShift() {
  const [shifts, setShifts] = useState<Shift[]>([])
  const [people, setPeople] = useState<EmployeeRecord[]>([])
  const [shiftId, setShiftId] = useState('')
  const [from, setFrom] = useState(todayInManilaIso())
  const [selected, setSelected] = useState<string[]>([])
  const [filter, setFilter] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    api.get<Shift[]>('/hr/shifts?kind=templates').then((s) => setShifts(s.filter((x) => x.active))).catch(() => undefined)
    api.get<EmployeeRecord[]>('/employees').then(setPeople).catch(() => undefined)
  }, [])

  const shown = people.filter((p) => p.name.toLowerCase().includes(filter.trim().toLowerCase()))

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setMessage(null)
    try {
      const { assigned } = await api.post<{ assigned: number }>('/hr/shifts?kind=assign', {
        employeeIds: selected,
        shiftId,
        effectiveFrom: from,
      })
      setMessage(`Assigned ${assigned} ${assigned === 1 ? 'person' : 'people'}.`)
      setSelected([])
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not assign the shift')
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Shift">
          <select required value={shiftId} onChange={(e) => setShiftId(e.target.value)} className="field">
            <option value="">Select…</option>
            {shifts.map((s) => (
              <option key={s.id} value={s.id}>
                {describeShift(s, from)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Effective from">
          <input type="date" required value={from} onChange={(e) => setFrom(e.target.value)} className="field" />
        </Field>
      </div>
      <div>
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-sm text-gray-600 dark:text-gray-400">
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search employees…" className="field max-w-xs" />
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={shown.length > 0 && shown.every((p) => selected.includes(p.id))}
              onChange={(e) =>
                setSelected((prev) =>
                  e.target.checked ? [...new Set([...prev, ...shown.map((p) => p.id)])] : prev.filter((id) => !shown.some((p) => p.id === id)),
                )
              }
            />
            Select all shown ({shown.length})
          </label>
        </div>
        <ul className="max-h-56 space-y-1 overflow-y-auto rounded-md border border-black/10 p-2 text-sm dark:border-white/10">
          {shown.map((p) => (
            <li key={p.id}>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={selected.includes(p.id)}
                  onChange={(e) => setSelected((prev) => (e.target.checked ? [...prev, p.id] : prev.filter((id) => id !== p.id)))}
                />
                {p.name}
                {p.team && <span className="text-gray-500 dark:text-gray-400"> · {p.team}</span>}
              </label>
            </li>
          ))}
        </ul>
      </div>
      <FormError message={error} />
      {message && <p className="text-sm text-green-700 dark:text-green-400">{message}</p>}
      <Button type="submit" variant="primary" size="sm" disabled={selected.length === 0 || !shiftId}>
        Assign to {selected.length} {selected.length === 1 ? 'person' : 'people'}
      </Button>
    </form>
  )
}

// Late / undertime / overtime for the page's date range.
export function LateReport({ from, to, employeeId }: { from: string; to: string; employeeId: string }) {
  const [rows, setRows] = useState<ReportRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (to < from) return
    setError(null)
    const q = new URLSearchParams({ kind: 'report', from, to })
    if (employeeId) q.set('employeeId', employeeId)
    api
      .get<ReportRow[]>(`/hr/shifts?${q.toString()}`)
      .then(setRows)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load the report'))
  }, [from, to, employeeId])

  if (error) return <ErrorState message={error} />
  if (!rows) return null

  const flagged = rows.filter((r) => r.lateMinutes > 0 || r.undertimeMinutes > 0)
  const totalLate = rows.reduce((a, r) => a + r.lateMinutes, 0)
  const totalUnder = rows.reduce((a, r) => a + r.undertimeMinutes, 0)

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-600 dark:text-gray-400">
        Measured against each employee's assigned shift. Employees with no shift are not measured.
        {rows.length > 0 && (
          <>
            {' '}
            <span className="font-medium text-gray-900 dark:text-gray-100">
              {flagged.length} of {rows.length} days flagged · {mins(totalLate) || '0m'} late · {mins(totalUnder) || '0m'} undertime
            </span>
          </>
        )}
      </p>
      {rows.length === 0 ? (
        <EmptyState label="Nothing to measure in this range (no attendance on a scheduled shift)." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead>
              <tr className="border-b border-black/10 text-gray-500 dark:border-white/10 dark:text-gray-400">
                <th className="py-2 pr-3 font-medium">Date</th>
                <th className="py-2 pr-3 font-medium">Employee</th>
                <th className="py-2 pr-3 font-medium">Shift</th>
                <th className="py-2 pr-3 font-medium">In / Out</th>
                <th className="py-2 pr-3 text-right font-medium">Late</th>
                <th className="py-2 pr-3 text-right font-medium">Undertime</th>
                <th className="py-2 text-right font-medium">Overtime</th>
              </tr>
            </thead>
            <tbody className="text-gray-800 dark:text-gray-200">
              {rows.map((r) => (
                <tr key={`${r.employeeId}-${r.date}`} className="border-b border-black/5 dark:border-white/5">
                  <td className="py-2 pr-3">{formatDateOnly(r.date)}</td>
                  <td className="py-2 pr-3">{r.employeeName}</td>
                  <td className="py-2 pr-3 text-gray-500 dark:text-gray-400">
                    {r.shiftName} {r.scheduledStart}–{r.scheduledEnd} {zoneLabel(r.timezone)}
                  </td>
                  <td className="py-2 pr-3">
                    {r.checkInAt ? timeFmt.format(new Date(r.checkInAt)) : '—'} / {r.checkOutAt ? timeFmt.format(new Date(r.checkOutAt)) : '—'}
                  </td>
                  <td className="py-2 pr-3 text-right">{r.lateMinutes > 0 ? <Badge tone="amber">{mins(r.lateMinutes)}</Badge> : ''}</td>
                  <td className="py-2 pr-3 text-right">{r.undertimeMinutes > 0 ? <Badge tone="red">{mins(r.undertimeMinutes)}</Badge> : ''}</td>
                  <td className="py-2 text-right">{mins(r.overtimeMinutes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
