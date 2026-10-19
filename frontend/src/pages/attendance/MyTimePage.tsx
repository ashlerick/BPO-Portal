import { useState } from 'react'
import { useAuth } from '../../auth/AuthContext'
import { EmptyState, ErrorState, LoadingState } from '../../components/AsyncState'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { PageHeader } from '../../components/ui/PageHeader'
import { useApiData } from '../../hooks/useApiData'
import { useTodayHoliday } from '../../hooks/useTodayHoliday'
import { addDaysIso, formatDateOnly, formatManilaTime, todayInManilaIso } from '../../utils/dates'
import type { AttendanceRecord } from './types'
import { MySchedule } from './Shifts'

// The employee's own page: today, then one table of their days (a week at a time, or a month), then their shift. It
// replaces the old all-in-one Attendance page for everyone who is not HR, so nothing here lists other people or exports.

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function mondayOf(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  return addDaysIso(iso, -((d.getUTCDay() + 6) % 7))
}

function monthBounds(anchor: string): { from: string; to: string } {
  const [y, m] = anchor.split('-').map(Number)
  return {
    from: new Date(Date.UTC(y, m - 1, 1)).toISOString().slice(0, 10),
    to: new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10),
  }
}

function shiftMonth(anchor: string, by: number): string {
  const [y, m] = anchor.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1 + by, 1)).toISOString().slice(0, 10)
}

function hoursBetween(a: string | null, b: string | null): number | null {
  if (!a || !b) return null
  return Math.round((Math.max(0, new Date(b).getTime() - new Date(a).getTime()) / 3_600_000) * 100) / 100
}

export function MyTimePage() {
  const { attendanceStatus } = useAuth()
  const holiday = useTodayHoliday()
  const today = todayInManilaIso()
  const [mode, setMode] = useState<'week' | 'month'>('week')
  const [anchor, setAnchor] = useState(today)

  const range = mode === 'week' ? { from: mondayOf(anchor), to: addDaysIso(mondayOf(anchor), 6) } : monthBounds(anchor)
  const { data, loading, error } = useApiData<AttendanceRecord[]>(`/leave/attendance?from=${range.from}&to=${range.to}`)

  const byDate = new Map((data ?? []).map((r) => [r.date.slice(0, 10), r]))
  // A week shows all seven days (empty ones too); a month shows only the days that have a record.
  const days =
    mode === 'week'
      ? DAY_NAMES.map((_, i) => addDaysIso(range.from, i))
      : [...byDate.keys()].sort()

  const records = data ?? []
  const present = records.filter((r) => r.status === 'present')
  const absent = records.filter((r) => r.status === 'absent').length
  const totalHours = present.reduce((sum, r) => sum + (hoursBetween(r.checkInAt, r.checkOutAt) ?? 0), 0)
  const overtime = records.reduce((sum, r) => sum + (r.overtimeHours ?? 0), 0)

  function step(by: number) {
    setAnchor(mode === 'week' ? addDaysIso(anchor, 7 * by) : shiftMonth(anchor, by))
  }

  const label =
    mode === 'week'
      ? `${formatDateOnly(range.from)} – ${formatDateOnly(range.to)}`
      : new Date(`${range.from}T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })

  return (
    <div className="space-y-4">
      <PageHeader title="My Time" description="Your own clock-in and clock-out history." />

      <Card className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Today</h2>
          {attendanceStatus?.checkedIn ? (
            <Badge tone={attendanceStatus.checkOutAt ? 'gray' : 'green'}>
              {attendanceStatus.checkOutAt ? 'Clocked out' : 'Clocked in'}
            </Badge>
          ) : (
            <Badge tone="gray">Not clocked in</Badge>
          )}
        </div>
        {holiday && (
          <p className="text-sm text-gray-700 dark:text-gray-300">
            <span className="font-medium">{holiday}</span> is on the company holiday list today.
          </p>
        )}
        {attendanceStatus?.checkedIn ? (
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-gray-500 dark:text-gray-400">Time in</dt>
              <dd className="font-medium text-gray-900 dark:text-gray-100">{formatManilaTime(attendanceStatus.checkInAt)}</dd>
            </div>
            <div>
              <dt className="text-gray-500 dark:text-gray-400">Time out</dt>
              <dd className="font-medium text-gray-900 dark:text-gray-100">{formatManilaTime(attendanceStatus.checkOutAt)}</dd>
            </div>
          </dl>
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-400">You haven't clocked in today.</p>
        )}
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Clock in and out with the BPO Time app (Launch App, top right). Logging in to the portal does not clock you in.
        </p>
      </Card>

      <Card className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-2">
            {(['week', 'month'] as const).map((m) => (
              <Button
                key={m}
                size="sm"
                aria-pressed={mode === m}
                className={mode === m ? '!border-brand-500 !bg-brand-600/15 !text-brand-700 dark:!text-brand-300' : ''}
                onClick={() => {
                  setMode(m)
                  setAnchor(today)
                }}
              >
                {m === 'week' ? 'Week' : 'Month'}
              </Button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => step(-1)} aria-label="Previous">
              ←
            </Button>
            <span className="min-w-[9rem] text-center text-sm text-gray-600 dark:text-gray-400">{label}</span>
            <Button size="sm" onClick={() => step(1)} aria-label="Next">
              →
            </Button>
          </div>
        </div>

        {loading && <LoadingState />}
        {error && <ErrorState message={error} />}
        {data && days.length === 0 && <EmptyState label="No records in this month." />}
        {data && days.length > 0 && (
          <div className="overflow-x-auto">
            <table className="stack-table w-full text-left text-sm">
              <thead>
                <tr className="border-b border-black/5 text-xs uppercase tracking-wide text-gray-500 dark:border-white/10 dark:text-gray-400">
                  <th className="py-2 pr-4 font-medium">Date</th>
                  <th className="py-2 pr-4 font-medium">Time in</th>
                  <th className="py-2 pr-4 font-medium">Time out</th>
                  <th className="py-2 pr-4 font-medium">Hours</th>
                  <th className="py-2 font-medium">Notes</th>
                </tr>
              </thead>
              <tbody>
                {days.map((date) => {
                  const r = byDate.get(date)
                  const dayName = DAY_NAMES[(new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7]
                  const isToday = date === today
                  const notes: string[] = []
                  if (r?.workingHoliday) notes.push('Worked on a holiday')
                  if (r?.overtimeHours) notes.push(`Overtime ${r.overtimeHours} h`)
                  if (r && r.status === 'present' && r.checkInAt && !r.checkOutAt) notes.push(isToday ? 'In progress' : 'No time out recorded')
                  const hours = r && r.status === 'present' ? hoursBetween(r.checkInAt, r.checkOutAt) : null
                  return (
                    <tr
                      key={date}
                      className={`border-b border-black/5 last:border-0 dark:border-white/5 ${isToday ? 'bg-brand-600/5' : ''}`}
                    >
                      <td data-primary className="py-2 pr-4 text-gray-800 dark:text-gray-200">
                        {dayName}, {formatDateOnly(date)}
                        {isToday && <span className="ml-2 text-xs text-brand-700 dark:text-brand-400">Today</span>}
                      </td>
                      {r?.status === 'absent' ? (
                        <td data-label="Status" colSpan={4} className="py-2 text-amber-700 dark:text-amber-500">
                          Absent
                        </td>
                      ) : (
                        <>
                          <td data-label="Time in" className="py-2 pr-4 text-gray-700 dark:text-gray-300">
                            {r ? formatManilaTime(r.checkInAt) : '—'}
                          </td>
                          <td data-label="Time out" className="py-2 pr-4 text-gray-700 dark:text-gray-300">
                            {r ? formatManilaTime(r.checkOutAt) : '—'}
                          </td>
                          <td data-label="Hours" className="py-2 pr-4 text-gray-700 dark:text-gray-300">
                            {hours === null ? '—' : hours.toFixed(2)}
                          </td>
                          <td data-label="Notes" className="py-2 text-gray-500 dark:text-gray-400">
                            {notes.join(' · ') || (r ? '' : '')}
                          </td>
                        </>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {data && (
          <dl className="grid grid-cols-2 gap-4 border-t border-black/5 pt-3 text-sm dark:border-white/10 sm:grid-cols-4">
            <div>
              <dt className="text-gray-500 dark:text-gray-400">Days present</dt>
              <dd className="text-xl font-semibold text-gray-900 dark:text-gray-100">{present.length}</dd>
            </div>
            <div>
              <dt className="text-gray-500 dark:text-gray-400">Days absent</dt>
              <dd className="text-xl font-semibold text-gray-900 dark:text-gray-100">{absent}</dd>
            </div>
            <div>
              <dt className="text-gray-500 dark:text-gray-400">Hours</dt>
              <dd className="text-xl font-semibold text-gray-900 dark:text-gray-100">{totalHours.toFixed(1)}</dd>
            </div>
            <div>
              <dt className="text-gray-500 dark:text-gray-400">Overtime</dt>
              <dd className="text-xl font-semibold text-gray-900 dark:text-gray-100">{overtime ? `${overtime} h` : '—'}</dd>
            </div>
          </dl>
        )}
      </Card>

      <Card className="space-y-2">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">My shift</h2>
        <MySchedule />
        <p className="text-xs text-gray-500 dark:text-gray-400">Your shift is set by HR.</p>
      </Card>
    </div>
  )
}
