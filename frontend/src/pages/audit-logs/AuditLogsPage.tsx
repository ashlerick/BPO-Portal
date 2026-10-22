import { useCallback, useEffect, useMemo, useState } from 'react'
import { EmptyState, ErrorState, LoadingState } from '../../components/AsyncState'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { PageHeader } from '../../components/ui/PageHeader'
import { api, ApiError } from '../../services/api'
import { addDaysIso, endOfPrevMonthIso, mondayOfIso, startOfMonthIso, todayInManilaIso } from '../../utils/dates'
import { humanize } from '../../utils/text'
import type { AuditFacets, AuditLogEntry, AuditLogPage } from './types'

// The audit log: one date range at a time (today to begin with), newest first, 50 at a time. Routine activity (clock in and out,
// breaks, PCs connecting) is left out unless asked for. Entries are kept 12 months (routine) or 5 years (everything else).

const timeFmt = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' })
const dayFmt = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' })
const dayKey = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date(iso))

export function AuditLogsPage() {
  const today = todayInManilaIso()
  const [from, setFrom] = useState(today)
  const [to, setTo] = useState(today)
  const [userId, setUserId] = useState('')
  const [resource, setResource] = useState('')
  const [kind, setKind] = useState('')
  const [result, setResult] = useState('')
  const [routine, setRoutine] = useState(false)
  const [searchInput, setSearchInput] = useState('')
  const [q, setQ] = useState('')

  const [entries, setEntries] = useState<AuditLogEntry[]>([])
  const [next, setNext] = useState<string | null>(null)
  const [total, setTotal] = useState(0)
  const [facets, setFacets] = useState<AuditFacets | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)

  const invalid = to < from
  const params = useMemo(() => {
    const p = new URLSearchParams({ from, to })
    if (userId) p.set('userId', userId)
    if (resource) p.set('resource', resource)
    if (kind) p.set('kind', kind)
    if (result) p.set('result', result)
    if (q) p.set('q', q)
    if (routine) p.set('routine', '1')
    return p
  }, [from, to, userId, resource, kind, result, q, routine])

  // A new range or filter starts the list again from the top.
  useEffect(() => {
    if (invalid) return
    let live = true
    setLoading(true)
    setError(null)
    api
      .get<AuditLogPage>(`/audit-logs?${params.toString()}&limit=50`)
      .then((r) => {
        if (!live) return
        setEntries(r.entries)
        setNext(r.next)
        setTotal(r.total)
      })
      .catch((err) => live && setError(err instanceof ApiError ? err.message : 'Could not load the audit log'))
      .finally(() => live && setLoading(false))
    return () => {
      live = false
    }
  }, [params, invalid])

  // The people, areas and kinds that appear in this range, for the menus.
  useEffect(() => {
    if (invalid) return
    api.get<AuditFacets>(`/audit-logs?facets=1&from=${from}&to=${to}`).then(setFacets).catch(() => undefined)
  }, [from, to, invalid])

  const loadMore = useCallback(async () => {
    if (!next) return
    setLoadingMore(true)
    try {
      const r = await api.get<AuditLogPage>(`/audit-logs?${params.toString()}&limit=50&cursor=${next}`)
      setEntries((prev) => [...prev, ...r.entries])
      setNext(r.next)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load more')
    } finally {
      setLoadingMore(false)
    }
  }, [next, params])

  async function exportExcel() {
    setExporting(true)
    try {
      const { url } = await api.get<{ url: string }>(`/audit-logs?${params.toString()}&export=1`)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not export the audit log')
    } finally {
      setExporting(false)
    }
  }

  const presets = [
    { label: 'Today', from: today, to: today },
    { label: 'Yesterday', from: addDaysIso(today, -1), to: addDaysIso(today, -1) },
    { label: 'This week', from: mondayOfIso(today), to: today },
    { label: 'Last week', from: addDaysIso(mondayOfIso(today), -7), to: addDaysIso(mondayOfIso(today), -1) },
    { label: 'This month', from: startOfMonthIso(today), to: today },
    { label: 'Last month', from: startOfMonthIso(endOfPrevMonthIso(today)), to: endOfPrevMonthIso(today) },
  ]

  // Group the loaded entries by day (a heading per day, with how many are shown).
  const days: { key: string; items: AuditLogEntry[] }[] = []
  for (const e of entries) {
    const key = dayKey(e.createdAt)
    const last = days[days.length - 1]
    if (last && last.key === key) last.items.push(e)
    else days.push({ key, items: [e] })
  }

  const filtersOn = !!(userId || resource || kind || result || q)

  return (
    <div>
      <PageHeader title="Audit Logs" description="Who did what, one date range at a time. Routine activity is hidden unless you ask for it." />

      <Card className="mb-4 space-y-3">
        <div className="grid grid-cols-2 gap-2 min-[480px]:grid-cols-4 md:flex md:flex-wrap">
          {presets.map((p) => {
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
        <div className="grid grid-cols-2 gap-3 max-[359px]:grid-cols-1 md:flex md:flex-wrap md:items-end">
          <label className="flex min-w-0 flex-col text-sm text-gray-600 dark:text-gray-400">
            From
            <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="field mt-1 px-2.5 md:px-3" />
          </label>
          <label className="flex min-w-0 flex-col text-sm text-gray-600 dark:text-gray-400">
            To
            <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="field mt-1 px-2.5 md:px-3" />
          </label>
          <label className="flex min-w-0 flex-col text-sm text-gray-600 dark:text-gray-400">
            Who
            <select value={userId} onChange={(e) => setUserId(e.target.value)} className="field mt-1">
              <option value="">Everyone</option>
              {facets?.users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-0 flex-col text-sm text-gray-600 dark:text-gray-400">
            Area
            <select value={resource} onChange={(e) => setResource(e.target.value)} className="field mt-1">
              <option value="">All areas</option>
              {facets?.resources.map((r) => (
                <option key={r} value={r}>
                  {humanize(r)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-0 flex-col text-sm text-gray-600 dark:text-gray-400">
            Action
            <select value={kind} onChange={(e) => setKind(e.target.value)} className="field mt-1">
              <option value="">Any action</option>
              {facets?.kinds.map((k) => (
                <option key={k} value={k}>
                  {humanize(k)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-0 flex-col text-sm text-gray-600 dark:text-gray-400">
            Result
            <select value={result} onChange={(e) => setResult(e.target.value)} className="field mt-1">
              <option value="">Any</option>
              <option value="success">Success</option>
              <option value="failure">Failure</option>
            </select>
          </label>
        </div>
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            setQ(searchInput.trim())
          }}
        >
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search the details, for example a name or an announcement title"
            className="field min-w-0 flex-1 md:max-w-md"
          />
          <Button type="submit" size="sm">
            Search
          </Button>
          {(q || filtersOn) && (
            <Button
              size="sm"
              onClick={() => {
                setUserId('')
                setResource('')
                setKind('')
                setResult('')
                setSearchInput('')
                setQ('')
              }}
            >
              Clear filters
            </Button>
          )}
          <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <input type="checkbox" checked={routine} onChange={(e) => setRoutine(e.target.checked)} />
            Show routine activity
          </label>
          <Button variant="primary" size="sm" onClick={exportExcel} disabled={exporting || invalid} className="ml-auto">
            {exporting ? 'Exporting…' : 'Export to Excel'}
          </Button>
        </form>
      </Card>
      {invalid && <p className="mb-2 text-sm text-red-600 dark:text-red-400">"To" can't be before "From".</p>}

      {loading && <LoadingState />}
      {error && <ErrorState message={error} />}
      {!loading && !error && entries.length === 0 && (
        <EmptyState label={filtersOn ? 'Nothing matches these filters in this range.' : 'Nothing recorded in this range.'} />
      )}

      {!loading && entries.length > 0 && (
        <>
          <p className="mb-2 text-sm text-gray-500 dark:text-gray-400">
            Showing {entries.length} of {total}
            {routine ? '' : ' (routine activity hidden)'}
          </p>
          <Card className="overflow-x-auto !p-0">
            <table className="stack-table w-full text-left text-sm">
              <thead>
                <tr className="border-b border-black/5 text-xs uppercase tracking-wide text-gray-500 dark:border-white/10 dark:text-gray-400">
                  <th className="py-3 pl-4 pr-4 font-medium">Time</th>
                  <th className="py-3 pr-4 font-medium">Who</th>
                  <th className="py-3 pr-4 font-medium">Action</th>
                  <th className="py-3 pr-4 font-medium">Area</th>
                  <th className="py-3 pr-4 font-medium">Details</th>
                  <th className="py-3 pr-4 font-medium">Result</th>
                </tr>
              </thead>
              <tbody>
                {days.flatMap((day) => [
                  <tr key={`d-${day.key}`} className="bg-black/[0.04] dark:bg-white/[0.05]">
                    <td colSpan={6} data-primary className="px-4 py-2 font-medium text-gray-900 dark:text-gray-100">
                      {dayFmt.format(new Date(day.items[0].createdAt))}
                      <span className="ml-2 text-xs font-normal text-gray-500 dark:text-gray-400">{day.items.length} shown</span>
                    </td>
                  </tr>,
                  ...day.items.map((log) => (
                    <tr
                      key={log.id}
                      className="border-b border-black/5 transition-colors last:border-0 hover:bg-black/[0.02] dark:border-white/5 dark:hover:bg-white/[0.03]"
                    >
                      <td data-primary className="py-2.5 pl-4 pr-4 whitespace-nowrap text-gray-500 dark:text-gray-400">
                        {timeFmt.format(new Date(log.createdAt))}
                      </td>
                      <td data-label="Who" className="py-2.5 pr-4 text-gray-900 dark:text-gray-200">{log.user}</td>
                      <td data-label="Action" className="py-2.5 pr-4 text-gray-700 dark:text-gray-300">{humanize(log.action)}</td>
                      <td data-label="Area" className="py-2.5 pr-4 text-gray-700 dark:text-gray-300">{humanize(log.resource)}</td>
                      <td data-label="Details" className="py-2.5 pr-4 text-gray-700 dark:text-gray-300">{log.detail ?? '—'}</td>
                      <td data-label="Result" className="py-2.5 pr-4">
                        <span
                          className={
                            log.result === 'success'
                              ? 'font-medium text-brand-700 dark:text-brand-400'
                              : 'font-medium text-red-600 dark:text-red-400'
                          }
                        >
                          {humanize(log.result)}
                        </span>
                      </td>
                    </tr>
                  )),
                ])}
              </tbody>
            </table>
          </Card>
          {next && (
            <div className="mt-3 flex justify-center">
              <Button onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? 'Loading…' : `Load more (${total - entries.length} left)`}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
