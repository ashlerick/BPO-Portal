import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ErrorState } from '../../components/AsyncState'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { api, ApiError } from '../../services/api'
import { formatDateOnly, todayInManilaIso } from '../../utils/dates'
import {
  currentPeriod,
  isDriveLink,
  matchEmployee,
  MONTH_NAMES,
  parsePeriodLabel,
  parseTable,
  type MatchableEmployee,
} from '../../utils/payslips'

// Payslip links for one month at a time: employees down, that month's 1H and
// 2H side by side. Every cell saves itself when you leave it.

interface GridData {
  year: number
  periods: { month: number; half: 1 | 2; releaseDate: string }[]
  employees: MatchableEmployee[]
  links: { employeeId: string; month: number; half: 1 | 2; link: string }[]
}

type CellState = 'saving' | 'saved' | 'error'
interface Entry {
  employeeId: string
  year: number
  month: number
  half: 1 | 2
  link: string | null
}

const key = (employeeId: string, month: number, half: number) => `${employeeId}|${month}|${half}`
const HALVES: (1 | 2)[] = [1, 2]
const border = 'border border-black/25 dark:border-white/30'
const headCell = `${border} bg-black/[0.06] px-3 py-2 text-left font-medium text-gray-700 dark:bg-white/[0.08] dark:text-gray-300`

export function PayslipGrid() {
  const thisYear = Number(todayInManilaIso().slice(0, 4))
  const initial = useMemo(() => currentPeriod(todayInManilaIso()), [])
  const [year, setYear] = useState(initial.year)
  const [month, setMonth] = useState(initial.month)
  const [data, setData] = useState<GridData | null>(null)
  const [values, setValues] = useState<Record<string, string>>({})
  const [states, setStates] = useState<Record<string, { state: CellState; message?: string }>>({})
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [onlyMissing, setOnlyMissing] = useState(false)
  const [importing, setImporting] = useState(false)
  const saved = useRef<Record<string, string>>({}) // last value known to be on the server

  const load = useCallback(() => {
    setError(null)
    api
      .get<GridData>(`/restricted/payroll?kind=payslips-year&year=${year}`)
      .then((d) => {
        const next: Record<string, string> = {}
        d.links.forEach((l) => (next[key(l.employeeId, l.month, l.half)] = l.link))
        saved.current = next
        setValues(next)
        setStates({})
        setData(d)
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load the payslip links'))
  }, [year])
  useEffect(load, [load])

  const setCell = useCallback((cells: { k: string; state: CellState; message?: string }[]) => {
    setStates((prev) => {
      const next = { ...prev }
      cells.forEach((c) => (next[c.k] = { state: c.state, message: c.message }))
      return next
    })
  }, [])

  const persist = useCallback(
    async (entries: Entry[]) => {
      const keys = entries.map((e) => key(e.employeeId, e.month, e.half))
      setCell(keys.map((k) => ({ k, state: 'saving' as const })))
      try {
        await api.post('/restricted/payroll?kind=payslips-bulk', { entries })
        entries.forEach((e, i) => {
          if (e.link === null) delete saved.current[keys[i]]
          else saved.current[keys[i]] = e.link
        })
        setCell(keys.map((k) => ({ k, state: 'saved' as const })))
      } catch (err) {
        const message = err instanceof ApiError ? err.message : 'Could not save'
        setCell(keys.map((k) => ({ k, state: 'error' as const, message })))
      }
    },
    [setCell],
  )

  if (error) return <ErrorState message={error} />
  if (!data) return <p className="text-sm text-gray-500 dark:text-gray-400">Loading…</p>

  const today = todayInManilaIso()
  const monthName = MONTH_NAMES[month - 1]
  const periodOf = (half: 1 | 2) => data.periods.find((p) => p.month === month && p.half === half)!
  const cellKey = (employeeId: string, half: 1 | 2) => key(employeeId, month, half)

  const commit = (employeeId: string, half: 1 | 2) => {
    const k = cellKey(employeeId, half)
    const value = (values[k] ?? '').trim()
    if (value === (saved.current[k] ?? '')) return
    if (value !== '' && !isDriveLink(value)) {
      setCell([{ k, state: 'error', message: 'Paste a Google Drive link (https://drive.google.com/...)' }])
      return
    }
    void persist([{ employeeId, year, month, half, link: value === '' ? null : value }])
  }

  const q = search.trim().toLowerCase()
  const rows = data.employees.filter(
    (e) =>
      (!q || e.name.toLowerCase().includes(q) || (e.employeeCode ?? '').toLowerCase().includes(q)) &&
      (!onlyMissing || HALVES.some((h) => !(values[cellKey(e.employeeId, h)] ?? '').trim())),
  )
  const haveCount = (half: 1 | 2) => data.employees.filter((e) => (saved.current[cellKey(e.employeeId, half)] ?? '') !== '').length
  const failures = Object.values(states).filter((s) => s.state === 'error')
  const pending = Object.values(states).some((s) => s.state === 'saving')

  // Paste cells copied from a spreadsheet: fills down (and across to 2H) from here.
  function onPaste(e: React.ClipboardEvent, rowIdx: number, half: 1 | 2) {
    const text = e.clipboardData.getData('text')
    if (!text.includes('\t') && !text.includes('\n')) return // one value: normal paste
    e.preventDefault()
    const entries: Entry[] = []
    const nextValues: Record<string, string> = {}
    const bad: { k: string; state: CellState; message: string }[] = []
    parseTable(text).forEach((cells, r) => {
      const emp = rows[rowIdx + r]
      if (!emp) return
      cells.forEach((cell, c) => {
        const h = half + c
        if (h !== 1 && h !== 2) return
        const k = cellKey(emp.employeeId, h)
        nextValues[k] = cell
        if (cell !== '' && !isDriveLink(cell)) bad.push({ k, state: 'error', message: 'Not a Google Drive link' })
        else if (cell !== (saved.current[k] ?? '')) {
          entries.push({ employeeId: emp.employeeId, year, month, half: h, link: cell === '' ? null : cell })
        }
      })
    })
    setValues((prev) => ({ ...prev, ...nextValues }))
    if (bad.length) setCell(bad)
    if (entries.length) void persist(entries)
  }

  function move(e: React.KeyboardEvent<HTMLInputElement>, rowIdx: number, half: 1 | 2) {
    const delta = e.key === 'Enter' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0
    if (!delta) return
    e.preventDefault()
    const next = document.querySelector<HTMLInputElement>(`[data-cell="${rowIdx + delta}-${half}"]`)
    if (next) next.focus()
    else (e.target as HTMLInputElement).blur()
  }

  const hopMonth = (delta: number) => {
    const m = month + delta
    if (m < 1) {
      setYear(year - 1)
      setMonth(12)
    } else if (m > 12) {
      setYear(year + 1)
      setMonth(1)
    } else setMonth(m)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col text-sm text-gray-600 dark:text-gray-400">
          Month
          <span className="mt-1 flex gap-2">
            <Button size="sm" onClick={() => hopMonth(-1)} aria-label="Previous month">
              ‹
            </Button>
            <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="field w-40">
              {MONTH_NAMES.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
            <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="field w-24" aria-label="Year">
              {[thisYear + 1, thisYear, thisYear - 1, thisYear - 2].map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <Button size="sm" onClick={() => hopMonth(1)} aria-label="Next month">
              ›
            </Button>
          </span>
        </label>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search employee…" className="field max-w-[14rem]" />
        <label className="flex items-center gap-2 pb-2 text-sm text-gray-600 dark:text-gray-400">
          <input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} />
          Show only missing
        </label>
        <Button size="sm" className="ml-auto" onClick={() => setImporting(true)}>
          Import…
        </Button>
      </div>

      {importing && (
        <ImportPanel
          data={data}
          year={year}
          onClose={() => setImporting(false)}
          onDone={() => {
            setImporting(false)
            load()
          }}
        />
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        {HALVES.map((h) => {
          const p = periodOf(h)
          const live = p.releaseDate <= today
          return (
            <div key={h} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-black/[0.04] px-3 py-2 text-sm dark:bg-white/[0.05]">
              <span className="font-medium text-gray-900 dark:text-gray-100">
                {monthName} {h}H
                <span className="ml-2 font-normal text-gray-600 dark:text-gray-400">
                  {haveCount(h)} of {data.employees.length} have a link
                </span>
              </span>
              <span className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                {live ? <Badge tone="green">Live</Badge> : <Badge tone="amber">Not live yet</Badge>}
                from {formatDateOnly(p.releaseDate)}
              </span>
            </div>
          )
        })}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] border-collapse text-sm">
          <thead>
            <tr>
              <th className={headCell}>Employee</th>
              {HALVES.map((h) => (
                <th key={h} className={headCell}>
                  {monthName} {h}H
                  <span className="ml-1 font-normal text-gray-500 dark:text-gray-400">({h === 1 ? '1st–15th' : '16th–end'})</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={3} className={`${border} px-3 py-6 text-center text-gray-500 dark:text-gray-400`}>
                  {onlyMissing ? 'Everyone has both links for this month.' : 'No employees match.'}
                </td>
              </tr>
            )}
            {rows.map((emp, r) => (
              <tr key={emp.employeeId} className="hover:bg-black/[0.03] dark:hover:bg-white/[0.04]">
                <td className={`${border} px-3 py-1.5 font-medium text-gray-900 dark:text-gray-100`}>
                  {emp.name}
                  {emp.employeeCode && <span className="font-normal text-gray-500 dark:text-gray-400"> · {emp.employeeCode}</span>}
                </td>
                {HALVES.map((h) => {
                  const k = cellKey(emp.employeeId, h)
                  const st = states[k]
                  const value = values[k] ?? ''
                  const missing = (saved.current[k] ?? '') === '' && value.trim() === ''
                  return (
                    <td key={h} className={`${border} p-0`}>
                      <div className="relative">
                        <input
                          data-cell={`${r}-${h}`}
                          value={value}
                          title={st?.message ?? value}
                          onChange={(e) => {
                            const v = e.target.value
                            setValues((prev) => ({ ...prev, [k]: v }))
                          }}
                          onBlur={() => commit(emp.employeeId, h)}
                          onKeyDown={(e) => move(e, r, h)}
                          onPaste={(e) => onPaste(e, r, h)}
                          placeholder="Paste Drive link…"
                          aria-label={`${emp.name} ${monthName} ${h}H payslip link`}
                          className={`block h-10 w-full bg-transparent pl-3 pr-16 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:bg-brand-500/10 focus:ring-2 focus:ring-inset focus:ring-brand-500 dark:text-gray-100 ${
                            st?.state === 'error' ? 'bg-red-500/15 ring-2 ring-inset ring-red-500' : ''
                          }`}
                        />
                        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs">
                          {st?.state === 'saving' && <span className="text-gray-500">Saving</span>}
                          {st?.state === 'error' && <span className="font-medium text-red-600 dark:text-red-400">Not saved</span>}
                          {st?.state !== 'saving' && st?.state !== 'error' &&
                            (missing ? (
                              <span className="text-amber-700 dark:text-amber-400">Missing</span>
                            ) : (
                              <span className="text-green-700 dark:text-green-400">✓ Saved</span>
                            ))}
                        </span>
                      </div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {failures.length > 0 && (
        <p className="text-sm text-red-600 dark:text-red-400">
          {failures.length} link(s) not saved: {failures[0].message}
        </p>
      )}
      <p className="text-xs text-gray-500 dark:text-gray-400">
        Each link saves itself when you press Enter or move away{pending ? ' (saving…)' : ''}. Paste a column (or two) copied from a
        spreadsheet to fill down. Clear a cell to remove its link.
      </p>
    </div>
  )
}

// Import: paste from a spreadsheet (or load a CSV), preview, then apply.
function ImportPanel({ data, year, onClose, onDone }: { data: GridData; year: number; onClose: () => void; onDone: () => void }) {
  const [text, setText] = useState('')
  const [period, setPeriod] = useState(() => currentPeriod(todayInManilaIso()))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const parsed = useMemo(() => {
    const table = parseTable(text)
    if (table.length === 0) return null
    // A header row of period labels ("January 1H", ...) means a multi-period import.
    const header = table[0].slice(1).map((h) => parsePeriodLabel(h, year))
    const multi = header.length > 0 && header.every((h) => h !== null)
    const body = multi ? table.slice(1) : table
    const entries: Entry[] = []
    const problems: string[] = []
    let skipped = 0
    for (const cells of body) {
      const emp = matchEmployee(cells[0] ?? '', data.employees)
      if (!emp) {
        problems.push(`No employee matches "${cells[0] ?? ''}"`)
        continue
      }
      const pairs: { p: { year: number; month: number; half: 1 | 2 }; link: string }[] = multi
        ? cells.slice(1).map((link, i) => ({ p: header[i]!, link }))
        : [{ p: { year: period.year, month: period.month, half: period.half }, link: cells[1] ?? '' }]
      for (const { p, link } of pairs) {
        if (link === '') {
          skipped += 1
          continue
        }
        if (!isDriveLink(link)) {
          problems.push(`${emp.name}: not a Google Drive link`)
          continue
        }
        entries.push({ employeeId: emp.employeeId, ...p, link })
      }
    }
    return { entries, problems, skipped, multi }
  }, [text, year, period, data.employees])

  async function apply() {
    if (!parsed || parsed.entries.length === 0) return
    setBusy(true)
    setError(null)
    try {
      await api.post('/restricted/payroll?kind=payslips-bulk', { entries: parsed.entries })
      onDone()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not import')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3 rounded-md border border-black/10 p-3 dark:border-white/10">
      <p className="text-sm text-gray-700 dark:text-gray-300">
        Paste two columns copied from a spreadsheet: <span className="font-medium">employee ID, email or name</span>, then the{' '}
        <span className="font-medium">Drive link</span>. Or paste a table whose first row is period labels
        (<span className="font-medium">January 1H, January 2H …</span>) to import many periods at once.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col text-sm text-gray-600 dark:text-gray-400">
          Period (for two-column imports)
          <span className="mt-1 flex gap-2">
            <select value={period.month} onChange={(e) => setPeriod({ ...period, month: Number(e.target.value) })} className="field">
              {MONTH_NAMES.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
            <select value={period.half} onChange={(e) => setPeriod({ ...period, half: Number(e.target.value) as 1 | 2 })} className="field">
              <option value={1}>1H</option>
              <option value={2}>2H</option>
            </select>
            <select value={period.year} onChange={(e) => setPeriod({ ...period, year: Number(e.target.value) })} className="field">
              {[year + 1, year, year - 1].map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </span>
        </label>
        <label className="text-sm text-gray-600 dark:text-gray-400">
          …or load a CSV file
          <input
            type="file"
            accept=".csv,text/csv,text/plain"
            className="mt-1 block text-sm"
            onChange={async (e) => {
              const f = e.target.files?.[0]
              if (f) setText(await f.text())
            }}
          />
        </label>
      </div>
      <textarea
        rows={6}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={'1017\thttps://drive.google.com/open?id=…\n1018\thttps://drive.google.com/open?id=…'}
        className="field w-full font-mono text-xs"
      />
      {parsed && (
        <div className="space-y-1 text-sm">
          <p className="text-gray-800 dark:text-gray-200">
            <span className="font-medium text-green-700 dark:text-green-400">{parsed.entries.length} link(s) ready to save</span>
            {parsed.skipped > 0 && ` · ${parsed.skipped} empty cell(s) skipped`}
            {parsed.problems.length > 0 && <span className="font-medium text-red-600 dark:text-red-400"> · {parsed.problems.length} problem(s)</span>}
          </p>
          {parsed.problems.length > 0 && (
            <ul className="max-h-28 list-disc overflow-y-auto pl-5 text-xs text-red-600 dark:text-red-400">
              {parsed.problems.slice(0, 20).map((p, i) => (
                <li key={i}>{p}</li>
              ))}
              {parsed.problems.length > 20 && <li>…and {parsed.problems.length - 20} more</li>}
            </ul>
          )}
        </div>
      )}
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <div className="flex gap-2">
        <Button variant="primary" size="sm" disabled={busy || !parsed || parsed.entries.length === 0} onClick={apply}>
          {busy ? 'Saving…' : `Import ${parsed?.entries.length ?? 0} link(s)`}
        </Button>
        <Button size="sm" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
