import { useState } from 'react'
import { useAuth } from '../../auth/AuthContext'
import { EmptyState, ErrorState, LoadingState } from '../../components/AsyncState'
import { useApiData } from '../../hooks/useApiData'
import { api, ApiError } from '../../services/api'
import type { EmployeeRecord } from '../hris/types'
import { addDaysIso, formatDateOnly, formatManilaTime, startOfMonthIso, todayInManilaIso } from '../../utils/dates'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { PageHeader } from '../../components/ui/PageHeader'
import type { AttendanceRecord } from './types'

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
        {/* Quick ranges — the handful people actually want — scroll
            sideways on a narrow screen rather than wrapping. */}
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {rangePresets().map((p) => {
            const active = p.from === from && p.to === to
            return (
              <Button
                key={p.label}
                size="sm"
                aria-pressed={active}
                className={`shrink-0 whitespace-nowrap ${active ? '!border-brand-500 !bg-brand-600/15 !text-brand-700 dark:!text-brand-300' : ''}`}
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
    </div>
  )
}
