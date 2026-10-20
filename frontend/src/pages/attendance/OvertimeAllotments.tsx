import { useMemo, useState, type FormEvent } from 'react'
import { useAuth } from '../../auth/AuthContext'
import { EmptyState, ErrorState, LoadingState } from '../../components/AsyncState'
import { useApiData } from '../../hooks/useApiData'
import { api, ApiError } from '../../services/api'
import type { EmployeeRecord } from '../hris/types'
import { addDaysIso, formatDateOnly, formatManilaTime, todayInManilaIso } from '../../utils/dates'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'

// HR allots overtime to people for a shift day; the person clocks in for it on BPO Time after their shift. What counts is the
// allotted amount if the session ran its full length, the time worked if it ended early, or whatever HR types. See
// .samples/plan/overtime.md.

export interface OvertimeAllotment {
  id: string
  employeeId: string
  employeeName: string
  date: string
  allottedMinutes: number
  note: string | null
  status: 'not_started' | 'running' | 'done' | 'not_used' | 'cancelled'
  startedAt: string | null
  endedAt: string | null
  countedMinutes: number
  countedByHr: boolean
}

const STATUS: Record<OvertimeAllotment['status'], { label: string; tone: 'gray' | 'green' | 'amber' | 'red' | 'blue' }> = {
  not_started: { label: 'Not started', tone: 'gray' },
  running: { label: 'Running', tone: 'blue' },
  done: { label: 'Done', tone: 'green' },
  not_used: { label: 'Not used', tone: 'amber' },
  cancelled: { label: 'Cancelled', tone: 'red' },
}

// 90 -> "1 h 30 min"
export function formatMinutes(m: number): string {
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  return m % 60 === 0 ? `${h} h` : `${h} h ${m % 60} min`
}

const toMinutes = (hours: string) => Math.round(Number(hours) * 60)
const msg = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback)

function AllotForm({ onAllotted }: { onAllotted: () => void }) {
  const { guardedAction } = useAuth()
  const { data: employees } = useApiData<EmployeeRecord[]>('/employees')
  const [picked, setPicked] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [date, setDate] = useState(todayInManilaIso())
  const [hours, setHours] = useState('1')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const shown = (employees ?? []).filter((e) => e.name.toLowerCase().includes(search.trim().toLowerCase()))
  const minutes = toMinutes(hours)
  const valid = picked.length > 0 && minutes >= 1 && minutes <= 720 && !!date

  function toggle(id: string) {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!valid) return
    guardedAction(['hr', 'admin'], async () => {
      setSaving(true)
      setMessage(null)
      try {
        await api.post('/hr/overtime', { employeeIds: picked, date, minutes, note: note.trim() || undefined })
        setMessage({ ok: true, text: `Allotted ${formatMinutes(minutes)} to ${picked.length} ${picked.length === 1 ? 'person' : 'people'}. They can clock in for it in BPO Time after their shift.` })
        setPicked([])
        setNote('')
        onAllotted()
      } catch (err) {
        setMessage({ ok: false, text: msg(err, 'Could not allot the overtime') })
      } finally {
        setSaving(false)
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <p className="text-sm text-gray-600 dark:text-gray-400">
        Pick the people, the shift day and how long. They clock in for it in BPO Time after clocking out of their shift, and the time counts as set here.
      </p>
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Find a person"
            aria-label="Find a person"
            className="field min-w-0 flex-1 sm:max-w-xs"
          />
          <Button type="button" size="sm" onClick={() => setPicked((p) => [...new Set([...p, ...shown.map((e) => e.id)])])} disabled={shown.length === 0}>
            Select all shown
          </Button>
          <Button type="button" size="sm" onClick={() => setPicked([])} disabled={picked.length === 0}>
            Clear
          </Button>
          <span className="text-sm text-gray-500 dark:text-gray-400">{picked.length} selected</span>
        </div>
        <ul className="max-h-48 divide-y divide-black/5 overflow-y-auto rounded-lg border border-black/10 text-sm dark:divide-white/10 dark:border-white/10">
          {shown.map((emp) => (
            <li key={emp.id}>
              <label className="flex cursor-pointer items-center gap-3 px-3 py-2">
                <input type="checkbox" checked={picked.includes(emp.id)} onChange={() => toggle(emp.id)} className="h-4 w-4" />
                <span className="text-gray-900 dark:text-gray-100">{emp.name}</span>
              </label>
            </li>
          ))}
          {employees && shown.length === 0 && <li className="px-3 py-2 text-gray-500 dark:text-gray-400">No one matches.</li>}
        </ul>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col text-sm text-gray-600 dark:text-gray-400">
          Shift day
          <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} className="field mt-1" />
        </label>
        <label className="flex flex-col text-sm text-gray-600 dark:text-gray-400">
          Hours
          <input type="number" min="0.25" max="12" step="0.25" required value={hours} onChange={(e) => setHours(e.target.value)} className="field mt-1" />
        </label>
        <label className="flex flex-col text-sm text-gray-600 dark:text-gray-400">
          Note (optional)
          <input type="text" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} className="field mt-1" />
        </label>
      </div>
      {message && <p className={`text-sm ${message.ok ? 'text-brand-700 dark:text-brand-400' : 'text-red-600 dark:text-red-400'}`}>{message.text}</p>}
      <Button type="submit" variant="primary" size="sm" disabled={!valid || saving}>
        {saving ? 'Allotting…' : 'Allot overtime'}
      </Button>
    </form>
  )
}

function BulkBar({ rows, onClear, onChanged }: { rows: OvertimeAllotment[]; onClear: () => void; onChanged: () => void }) {
  const { guardedAction } = useAuth()
  const [hours, setHours] = useState('')
  const [counted, setCounted] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const ids = rows.map((r) => r.id)
  const hasChange = hours !== '' || counted !== '' || note.trim() !== ''

  function run(body: Record<string, unknown>, done: string) {
    guardedAction(['hr', 'admin'], async () => {
      setSaving(true)
      setMessage(null)
      try {
        await api.put('/hr/overtime', { ids, ...body })
        setMessage({ ok: true, text: done })
        setHours('')
        setCounted('')
        setNote('')
        onChanged()
      } catch (err) {
        setMessage({ ok: false, text: msg(err, 'Could not save the changes') })
      } finally {
        setSaving(false)
      }
    })
  }

  function save() {
    run(
      {
        ...(hours !== '' && { minutes: toMinutes(hours) }),
        ...(counted !== '' && { countedMinutes: toMinutes(counted) }),
        ...(note.trim() !== '' && { note: note.trim() }),
      },
      `Saved for ${ids.length} ${ids.length === 1 ? 'row' : 'rows'}.`,
    )
  }

  function cancelRows() {
    if (!window.confirm(`Cancel the overtime for ${ids.length} ${ids.length === 1 ? 'row' : 'rows'}? A cancelled row counts nothing and the people are told.`)) return
    run({ cancel: true }, `Cancelled ${ids.length} ${ids.length === 1 ? 'row' : 'rows'}.`)
  }

  return (
    <Card className="mb-3 space-y-3 !border-brand-500/40">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
          {ids.length} {ids.length === 1 ? 'row' : 'rows'} selected
        </p>
        <Button size="sm" onClick={onClear}>
          Clear selection
        </Button>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400">Fill only what you want to change. A row can be changed at any time, before, during or after the session.</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col text-sm text-gray-600 dark:text-gray-400">
          Allotted hours
          <input type="number" min="0.25" max="12" step="0.25" value={hours} onChange={(e) => setHours(e.target.value)} placeholder="Keep as is" className="field mt-1" />
        </label>
        <label className="flex flex-col text-sm text-gray-600 dark:text-gray-400">
          Counted hours
          <input type="number" min="0" max="12" step="0.25" value={counted} onChange={(e) => setCounted(e.target.value)} placeholder="Keep as is" className="field mt-1" />
        </label>
        <label className="flex flex-col text-sm text-gray-600 dark:text-gray-400">
          Note
          <input type="text" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Keep as is" className="field mt-1" />
        </label>
      </div>
      {message && <p className={`text-sm ${message.ok ? 'text-brand-700 dark:text-brand-400' : 'text-red-600 dark:text-red-400'}`}>{message.text}</p>}
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" size="sm" onClick={save} disabled={!hasChange || saving}>
          {saving ? 'Saving…' : 'Save changes'}
        </Button>
        <Button size="sm" onClick={cancelRows} disabled={saving}>
          Cancel selected overtime
        </Button>
      </div>
    </Card>
  )
}

export function OvertimeAllotments({ from, to, employeeId, reloadToken, onChanged }: { from: string; to: string; employeeId: string; reloadToken: number; onChanged: () => void }) {
  const [selected, setSelected] = useState<string[]>([])
  const [localReload, setLocalReload] = useState(0)

  // The page's range, stretched to two weeks ahead so a day allotted in advance shows up before it happens.
  const end = to > addDaysIso(todayInManilaIso(), 14) ? to : addDaysIso(todayInManilaIso(), 14)
  const params = new URLSearchParams({ from, to: end })
  if (employeeId) params.set('employeeId', employeeId)
  params.set('_r', `${reloadToken}-${localReload}`)
  const { data, loading, error } = useApiData<OvertimeAllotment[]>(from > end ? '/hr/overtime?from=invalid' : `/hr/overtime?${params.toString()}`)

  const rows = data ?? []
  const chosen = useMemo(() => rows.filter((r) => selected.includes(r.id)), [rows, selected])
  const reload = () => {
    setLocalReload((n) => n + 1)
    onChanged()
  }
  const allSelected = rows.length > 0 && rows.every((r) => selected.includes(r.id))

  return (
    <div className="space-y-4">
      <AllotForm onAllotted={reload} />

      <div>
        <h3 className="mb-2 text-sm font-medium text-gray-900 dark:text-gray-100">
          Allotted overtime <span className="font-normal text-gray-500 dark:text-gray-400">{formatDateOnly(from)} to {formatDateOnly(end)}</span>
        </h3>
        {loading && <LoadingState />}
        {error && <ErrorState message={error} />}
        {chosen.length > 0 && (
          <BulkBar
            key={chosen.map((r) => r.id).join()}
            rows={chosen}
            onClear={() => setSelected([])}
            onChanged={() => {
              setSelected([])
              reload()
            }}
          />
        )}
        {data && rows.length === 0 && <EmptyState label="No overtime allotted in this range." />}
        {rows.length > 0 && (
          <Card className="overflow-x-auto !p-0">
            <table className="stack-table w-full text-left text-sm">
              <thead>
                <tr className="border-b border-black/10 text-gray-500 dark:border-white/10 dark:text-gray-400">
                  <th className="px-4 py-2 font-medium">
                    <label className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={() => setSelected(allSelected ? [] : rows.map((r) => r.id))}
                        aria-label="Select all rows"
                        className="h-4 w-4"
                      />
                      Person
                    </label>
                  </th>
                  <th className="px-4 py-2 font-medium">Shift day</th>
                  <th className="px-4 py-2 font-medium">Allotted</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Clocked</th>
                  <th className="px-4 py-2 font-medium">Counted</th>
                  <th className="px-4 py-2 font-medium">Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5 dark:divide-white/10">
                {rows.map((r) => (
                  <tr key={r.id} className={r.status === 'cancelled' ? 'opacity-60' : undefined}>
                    <td data-primary className="px-4 py-2">
                      <label className="flex items-center gap-3 font-medium text-gray-900 dark:text-gray-100">
                        <input
                          type="checkbox"
                          checked={selected.includes(r.id)}
                          onChange={() => setSelected((s) => (s.includes(r.id) ? s.filter((x) => x !== r.id) : [...s, r.id]))}
                          aria-label={`Select ${r.employeeName}, ${formatDateOnly(r.date)}`}
                          className="h-4 w-4"
                        />
                        {r.employeeName}
                      </label>
                    </td>
                    <td data-label="Shift day" className="px-4 py-2">{formatDateOnly(r.date)}</td>
                    <td data-label="Allotted" className="px-4 py-2">{formatMinutes(r.allottedMinutes)}</td>
                    <td data-label="Status" className="px-4 py-2">
                      <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge>
                    </td>
                    <td data-label="Clocked" className="px-4 py-2">
                      {r.startedAt ? `${formatManilaTime(r.startedAt)} to ${r.endedAt ? formatManilaTime(r.endedAt) : 'now'}` : '—'}
                    </td>
                    <td data-label="Counted" className="px-4 py-2">
                      {formatMinutes(r.countedMinutes)}
                      {r.countedByHr && <span className="ml-1 text-xs text-gray-500 dark:text-gray-400">(set by HR)</span>}
                    </td>
                    <td data-label="Note" className="px-4 py-2">{r.note ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          Counted is what goes into totals: the allotted time if the person ran the whole countdown, the time worked if they ended early, or what HR set. Times are Philippine time.
        </p>
      </div>
    </div>
  )
}
