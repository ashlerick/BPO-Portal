import { useState } from 'react'
import { ErrorState, LoadingState } from '../../components/AsyncState'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { useApiData } from '../../hooks/useApiData'
import { addDaysIso, formatDateOnly, todayInManilaIso } from '../../utils/dates'
import { netHours } from '../../utils/breaks'
import type { EmployeeRecord } from '../hris/types'
import type { AttendanceRecord } from './types'

// The old sheet's weekly tracker for one Monday to Sunday week: regular hours (time in to time out, less the recorded breaks),
// overtime (what HR typed in plus what HR gave) and working holidays. "Everyone" is one table, a row per person; "One person"
// is that person's week in detail. The week arrows are this tab's own, not the page's date range.

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function mondayOf(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  return addDaysIso(iso, -((d.getUTCDay() + 6) % 7))
}

const round2 = (n: number) => Math.round(n * 100) / 100

function hoursBetween(a: string | null, b: string | null): number {
  if (!a || !b) return 0
  return Math.max(0, (new Date(b).getTime() - new Date(a).getTime()) / 3_600_000)
}

const regular = (r?: AttendanceRecord) => (r && r.status === 'present' ? round2(netHours(hoursBetween(r.checkInAt, r.checkOutAt), r.breaks)) : 0)
const overtime = (r?: AttendanceRecord) => (r && r.status === 'present' ? round2((r.overtimeHours ?? 0) + (r.overtimeGivenHours ?? 0)) : 0)

export function WeeklyTab({ employeeId, reloadToken }: { employeeId: string; reloadToken: number }) {
  const [weekStart, setWeekStart] = useState(() => mondayOf(todayInManilaIso()))
  const [view, setView] = useState<'everyone' | 'one'>(employeeId ? 'one' : 'everyone')
  const [personId, setPersonId] = useState(employeeId)
  const { data: employees } = useApiData<EmployeeRecord[]>('/employees')
  const weekEnd = addDaysIso(weekStart, 6)
  const dates = DAY_NAMES.map((_, i) => addDaysIso(weekStart, i))

  // One person with nobody picked yet: the first person A to Z.
  const sorted = [...(employees ?? [])].sort((a, b) => a.name.localeCompare(b.name))
  const person = personId || sorted[0]?.id || ''

  const q = new URLSearchParams({ from: weekStart, to: weekEnd })
  if (view === 'one' && person) q.set('employeeId', person)
  q.set('_r', String(reloadToken))
  const { data, loading, error } = useApiData<AttendanceRecord[]>(`/leave/attendance?${q.toString()}`)

  const records = (data ?? []).filter((r) => r.status === 'present')
  const byPerson = new Map<string, { name: string; days: Map<string, AttendanceRecord> }>()
  for (const r of records) {
    const key = r.employeeId ?? r.employeeName
    const entry = byPerson.get(key) ?? { name: r.employeeName, days: new Map<string, AttendanceRecord>() }
    entry.days.set(r.date.slice(0, 10), r)
    byPerson.set(key, entry)
  }
  const people = [...byPerson.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name))
  const totals = (days: Map<string, AttendanceRecord>) => ({
    regular: round2(dates.reduce((n, d) => n + regular(days.get(d)), 0)),
    overtime: round2(dates.reduce((n, d) => n + overtime(days.get(d)), 0)),
  })

  function openPerson(id: string) {
    setPersonId(id)
    setView('one')
  }

  const own = byPerson.get(person)?.days ?? new Map<string, AttendanceRecord>()
  const ownTotals = totals(own)
  const otClass = 'text-[11px] font-medium text-blue-700 dark:text-blue-300'

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          Weekly tracker{' '}
          <span className="font-normal text-gray-500 dark:text-gray-400">
            {formatDateOnly(weekStart)} – {formatDateOnly(weekEnd)}
          </span>
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="View" className="inline-flex overflow-hidden rounded-lg border border-black/10 dark:border-white/15">
            {(['everyone', 'one'] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => setView(v)}
                className={`px-3 py-1.5 text-xs font-medium ${view === v ? 'bg-brand-600 text-white' : 'text-gray-600 hover:bg-black/5 dark:text-gray-300 dark:hover:bg-white/10'}`}
              >
                {v === 'everyone' ? 'Everyone' : 'One person'}
              </button>
            ))}
          </div>
          <Button size="sm" onClick={() => setWeekStart(addDaysIso(weekStart, -7))}>
            ← Previous
          </Button>
          <Button size="sm" onClick={() => setWeekStart(addDaysIso(weekStart, 7))}>
            Next →
          </Button>
        </div>
      </div>

      {view === 'one' && (
        <label className="flex max-w-xs flex-col text-sm text-gray-600 dark:text-gray-400">
          Person
          <select value={person} onChange={(e) => setPersonId(e.target.value)} className="field mt-1">
            {sorted.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {error && <ErrorState message={error} />}
      {loading && <LoadingState />}

      {data && view === 'everyone' && (
        <Card className="overflow-x-auto !p-0">
          <table className="w-full min-w-[40rem] text-center text-sm">
            <thead>
              <tr className="border-b border-black/10 text-gray-500 dark:border-white/10 dark:text-gray-400">
                <th className="py-2 pl-4 pr-3 text-left font-medium">Person</th>
                {dates.map((d, i) => (
                  <th key={d} className="px-1 py-2 font-medium">
                    {DAY_NAMES[i]}
                    <div className="text-xs font-normal">{d.slice(5)}</div>
                  </th>
                ))}
                <th className="px-3 py-2 font-medium">Total</th>
              </tr>
            </thead>
            <tbody className="text-gray-800 dark:text-gray-200">
              {people.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-6 text-gray-500 dark:text-gray-400">
                    No one has time recorded this week.
                  </td>
                </tr>
              )}
              {people.map(([id, p]) => {
                const t = totals(p.days)
                return (
                  <tr key={id} className="border-b border-black/5 last:border-0 dark:border-white/5">
                    <td className="py-2 pl-4 pr-3 text-left">
                      <button type="button" onClick={() => openPerson(id)} className="font-medium underline decoration-black/20 underline-offset-2 hover:decoration-brand-500 dark:decoration-white/20">
                        {p.name}
                      </button>
                    </td>
                    {dates.map((d) => {
                      const r = p.days.get(d)
                      const ot = overtime(r)
                      return (
                        <td key={d}>
                          {regular(r) || ''}
                          {r?.workingHoliday && <span title="Worked on a holiday"> ✓</span>}
                          {ot > 0 && <div className={otClass}>+{ot} OT</div>}
                        </td>
                      )
                    })}
                    <td className="px-3 font-medium">
                      {t.regular}
                      {t.overtime > 0 && <div className={otClass}>+{t.overtime} OT</div>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Card>
      )}

      {data && view === 'one' && (
        <Card className="overflow-x-auto !p-0">
          <table className="w-full min-w-[34rem] text-center text-sm">
            <thead>
              <tr className="border-b border-black/10 text-gray-500 dark:border-white/10 dark:text-gray-400">
                <th className="py-2 pl-4 pr-3 text-left font-medium" />
                {dates.map((d, i) => (
                  <th key={d} className="px-1 py-2 font-medium">
                    {DAY_NAMES[i]}
                    <div className="text-xs font-normal">{d.slice(5)}</div>
                  </th>
                ))}
                <th className="px-3 py-2 font-medium">Total</th>
              </tr>
            </thead>
            <tbody className="text-gray-800 dark:text-gray-200">
              <tr className="border-b border-black/5 dark:border-white/5">
                <td className="py-2 pl-4 pr-3 text-left font-medium">Regular hours</td>
                {dates.map((d) => (
                  <td key={d}>{regular(own.get(d)) || ''}</td>
                ))}
                <td className="px-3 font-medium">{ownTotals.regular}</td>
              </tr>
              <tr className="border-b border-black/5 dark:border-white/5">
                <td className="py-2 pl-4 pr-3 text-left font-medium">Overtime</td>
                {dates.map((d) => (
                  <td key={d}>{overtime(own.get(d)) || ''}</td>
                ))}
                <td className="px-3 font-medium">{ownTotals.overtime}</td>
              </tr>
              <tr>
                <td className="py-2 pl-4 pr-3 text-left font-medium">Working holiday</td>
                {dates.map((d) => (
                  <td key={d}>{own.get(d)?.workingHoliday ? '✓' : ''}</td>
                ))}
                <td />
              </tr>
            </tbody>
          </table>
        </Card>
      )}
      <p className="text-xs text-gray-500 dark:text-gray-400">
        Hours are time in to time out less the recorded breaks and lunch. Overtime is what HR gave plus any hours HR typed in; working holiday is entered by HR.
        {view === 'everyone' && ' Only people with time recorded this week are listed.'}
      </p>
    </div>
  )
}
