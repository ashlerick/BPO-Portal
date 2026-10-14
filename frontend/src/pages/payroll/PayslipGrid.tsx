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

// Spreadsheet-style payslip links: employees down, the year's 24 cut-offs
// across. Every cell saves itself when you leave it, so nothing is lost.

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

export function PayslipGrid() {
  const thisYear = Number(todayInManilaIso().slice(0, 4))
  const [year, setYear] = useState(thisYear)
  const [data, setData] = useState<GridData | null>(null)
  const [values, setValues] = useState<Record<string, string>>({})
  const [states, setStates] = useState<Record<string, { state: CellState; message?: string }>>({})
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [onlyMissing, setOnlyMissing] = useState(false)
  const [importing, setImporting] = useState(false)
  const scroller = useRef<HTMLDivElement>(null)
  const saved = useRef<Record<string, string>>({}) // last value known to be on the server

  const focus = useMemo(() => currentPeriod(todayInManilaIso()), [])

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
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load the payslip grid'))
  }, [year])
  useEffect(load, [load])

  // Open scrolled to the cut-off HR is most likely entering.
  useEffect(() => {
    if (!data || !scroller.current || focus.year !== year) return
    const idx = (focus.month - 1) * 2 + (focus.half - 1)
    scroller.current.scrollLeft = Math.max(0, idx * 190 - 120)
  }, [data, focus, year])

  const setCell = useCallback((cells: { k: string; state: CellState; message?: string }[]) => {
    setStates((prev) => {
      const next = { ...prev }
      cells.forEach((c) => (next[c.k] = { state: c.state, message: c.message }))
      return next
    })
  }, [])

  // Persists entries and marks their cells. Resolves true when all saved.
  const persist = useCallback(
    async (entries: Entry[]): Promise<boolean> => {
      const keys = entries.map((e) => key(e.employeeId, e.month, e.half))
      setCell(keys.map((k) => ({ k, state: 'saving' as const })))
      try {
        await api.post('/restricted/payroll?kind=payslips-bulk', { entries })
        entries.forEach((e, i) => {
          if (e.link === null) delete saved.current[keys[i]]
          else saved.current[keys[i]] = e.link
        })
        setCell(keys.map((k) => ({ k, state: 'saved' as const })))
        return true
      } catch (err) {
        const message = err instanceof ApiError ? err.message : 'Could not save'
        setCell(keys.map((k) => ({ k, state: 'error' as const, message })))
        return false
      }
    },
    [setCell],
  )

  const commit = useCallback(
    (employeeId: string, month: number, half: 1 | 2) => {
      const k = key(employeeId, month, half)
      const value = (values[k] ?? '').trim()
      if (value === (saved.current[k] ?? '')) return
      if (value !== '' && !isDriveLink(value)) {
        setCell([{ k, state: 'error', message: 'Paste a Google Drive link (https://drive.google.com/...)' }])
        return
      }
      void persist([{ employeeId, year, month, half, link: value === '' ? null : value }])
    },
    [values, year, persist, setCell],
  )

  if (error) return <ErrorState message={error} />
  if (!data) return <p className="text-sm text-gray-500 dark:text-gray-400">Loading…</p>

  const today = todayInManilaIso()
  const q = search.trim().toLowerCase()
  const focusKey = (id: string) => key(id, focus.month, focus.half)
  const rows = data.employees.filter(
    (e) =>
      (!q || e.name.toLowerCase().includes(q) || (e.employeeCode ?? '').toLowerCase().includes(q)) &&
      (!onlyMissing || !(values[focusKey(e.employeeId)] ?? '').trim()),
  )
  const total = data.employees.length * 24
  const filled = Object.keys(saved.current).length
  const pending = Object.values(states).filter((s) => s.state === 'saving').length
  const failed = Object.values(states).filter((s) => s.state === 'error').length

  // Paste a block from a spreadsheet into the grid, starting at this cell.
  function onPaste(e: React.ClipboardEvent, rowIdx: number, colIdx: number) {
    const text = e.clipboardData.getData('text')
    if (!text.includes('\t') && !text.includes('\n')) return // a single value: normal paste
    e.preventDefault()
    const block = parseTable(text.replace(/\t/g, '\t'))
    const entries: Entry[] = []
    const nextValues: Record<string, string> = {}
    const bad: { k: string; state: CellState; message: string }[] = []
    block.forEach((cells, r) => {
      const emp = rows[rowIdx + r]
      if (!emp) return
      cells.forEach((cell, c) => {
        const p = data!.periods[colIdx + c]
        if (!p) return
        const k = key(emp.employeeId, p.month, p.half)
        nextValues[k] = cell
        if (cell !== '' && !isDriveLink(cell)) {
          bad.push({ k, state: 'error', message: 'Not a Google Drive link' })
        } else if (cell !== (saved.current[k] ?? '')) {
          entries.push({ employeeId: emp.employeeId, year, month: p.month, half: p.half, link: cell === '' ? null : cell })
        }
      })
    })
    setValues((prev) => ({ ...prev, ...nextValues }))
    if (bad.length) setCell(bad)
    if (entries.length) void persist(entries)
  }

  function move(e: React.KeyboardEvent<HTMLInputElement>, rowIdx: number, colIdx: number) {
    const delta = e.key === 'Enter' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0
    if (!delta) return
    e.preventDefault()
    const next = document.querySelector<HTMLInputElement>(`[data-cell="${rowIdx + delta}-${colIdx}"]`)
    if (next) next.focus()
    else (e.target as HTMLInputElement).blur()
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="field w-28" aria-label="Year">
          {[thisYear + 1, thisYear, thisYear - 1, thisYear - 2].map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search employee…" className="field max-w-[14rem]" />
        <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
          <input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} />
          Missing for {MONTH_NAMES[focus.month - 1]} {focus.half}H
        </label>
        <span className="ml-auto flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
          {pending > 0 && <span>Saving…</span>}
          {failed > 0 && <Badge tone="red">{failed} not saved</Badge>}
          {pending === 0 && failed === 0 && <span>All changes saved</span>}
          <span>
            · {filled} of {total} links
          </span>
        </span>
        <Button size="sm" onClick={() => setImporting(true)}>
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

      <p className="text-xs text-gray-500 dark:text-gray-400">
        Paste a link and press Enter or Tab: it saves itself. Paste several cells copied from a spreadsheet to fill down and across.
        Clear a cell to remove its link. Columns marked <span className="font-medium">live</span> are already visible to employees.
      </p>

      <div ref={scroller} className="max-h-[32rem] overflow-auto rounded-md border border-black/10 dark:border-white/10">
        <table className="border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 top-0 z-20 min-w-[12rem] border-b border-r border-black/10 bg-gray-100 px-3 py-2 text-left font-medium dark:border-white/10 dark:bg-[#12261d]">
                Employee
              </th>
              {data.periods.map((p) => {
                const live = p.releaseDate <= today
                return (
                  <th
                    key={`${p.month}-${p.half}`}
                    className="sticky top-0 z-10 min-w-[11.5rem] border-b border-black/10 bg-gray-100 px-2 py-2 text-left font-medium dark:border-white/10 dark:bg-[#12261d]"
                    title={`Visible to employees from ${formatDateOnly(p.releaseDate)}`}
                  >
                    {MONTH_NAMES[p.month - 1].slice(0, 3)} {p.half}H {live && <Badge tone="green">live</Badge>}
                    <div className="text-xs font-normal text-gray-500 dark:text-gray-400">from {formatDateOnly(p.releaseDate)}</div>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((emp, r) => (
              <tr key={emp.employeeId}>
                <td className="sticky left-0 z-10 border-b border-r border-black/5 bg-white px-3 py-1.5 font-medium text-gray-900 dark:border-white/5 dark:bg-[#0d1f17] dark:text-gray-100">
                  {emp.name}
                  {emp.employeeCode && <span className="font-normal text-gray-500 dark:text-gray-400"> · {emp.employeeCode}</span>}
                </td>
                {data.periods.map((p, c) => {
                  const k = key(emp.employeeId, p.month, p.half)
                  const st = states[k]
                  const value = values[k] ?? ''
                  return (
                    <td key={k} className="border-b border-black/5 p-0 dark:border-white/5">
                      <div className="relative">
                        <input
                          data-cell={`${r}-${c}`}
                          value={value}
                          title={st?.message ?? value}
                          onChange={(e) => {
                            const v = e.target.value
                            setValues((prev) => ({ ...prev, [k]: v }))
                          }}
                          onBlur={() => commit(emp.employeeId, p.month, p.half)}
                          onKeyDown={(e) => move(e, r, c)}
                          onPaste={(e) => onPaste(e, r, c)}
                          placeholder=""
                          aria-label={`${emp.name} ${MONTH_NAMES[p.month - 1]} ${p.half}H payslip link`}
                          className={`block h-9 w-full bg-transparent px-2 pr-6 text-xs text-gray-800 outline-none focus:bg-brand-500/10 dark:text-gray-200 ${
                            st?.state === 'error' ? 'bg-red-500/15 ring-1 ring-inset ring-red-500' : ''
                          }`}
                        />
                        <span className="pointer-events-none absolute right-1.5 top-2 text-xs">
                          {st?.state === 'saving' && <span className="text-gray-400">…</span>}
                          {st?.state === 'saved' && <span className="text-green-600 dark:text-green-400">✓</span>}
                          {st?.state === 'error' && <span className="text-red-600 dark:text-red-400">!</span>}
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
