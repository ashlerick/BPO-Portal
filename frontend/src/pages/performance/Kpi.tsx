import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { EmptyState, ErrorState } from '../../components/AsyncState'
import { EmployeeSelect } from '../../components/EmployeeSelect'
import { Button } from '../../components/ui/Button'
import { Field, FormError } from '../../components/ui/Field'
import { api, ApiError } from '../../services/api'
import { todayInManilaIso } from '../../utils/dates'

// KPI scorecard (the old sheet's "KPI Metrics"). The scale and how totals
// are computed are HR settings; the server computes every total.

interface KpiConfig {
  scaleMin: number
  scaleMax: number
  method: 'average' | 'weighted' | 'sum' | 'percent'
  missing: 'ignore' | 'zero'
  rollup: 'average' | 'latest'
  bands: { min: number; label: string }[]
}
interface Criterion {
  id: string
  coreValue: string
  name: string
  weight: number
  active: boolean
}
interface ScoresResponse {
  employeeId: string
  year: number
  config: KpiConfig
  criteria: Criterion[]
  scores: { criterionId: string; month: number; score: number }[]
  monthly: { month: number; total: number | null; band: string | null }[]
  yearly: { total: number | null; band: string | null }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const METHOD_LABEL: Record<KpiConfig['method'], string> = {
  average: 'Average of the scores',
  weighted: 'Weighted average',
  sum: 'Sum of the scores',
  percent: 'Percent of the maximum',
}

function describe(c: KpiConfig) {
  return `Scored ${c.scaleMin}–${c.scaleMax}. Total: ${METHOD_LABEL[c.method].toLowerCase()}; ${
    c.missing === 'zero' ? 'unscored KPIs count as zero' : 'unscored KPIs are ignored'
  }.`
}

const thisYear = () => Number(todayInManilaIso().slice(0, 4))

function YearSelect({ year, onChange }: { year: number; onChange: (y: number) => void }) {
  return (
    <select value={year} onChange={(e) => onChange(Number(e.target.value))} className="field w-28" aria-label="Year">
      {[thisYear() + 1, thisYear(), thisYear() - 1, thisYear() - 2].map((y) => (
        <option key={y} value={y}>
          {y}
        </option>
      ))}
    </select>
  )
}

// Read-only grid: criteria down, months across. `employeeId` omitted = me.
export function KpiScorecard({ employeeId }: { employeeId?: string }) {
  const [year, setYear] = useState(thisYear())
  const [data, setData] = useState<ScoresResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setError(null)
    const q = `year=${year}${employeeId ? `&employeeId=${employeeId}` : ''}`
    api
      .get<ScoresResponse | null>(`/hr/kpi?kind=scores&${q}`)
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load the scorecard'))
  }, [year, employeeId])

  if (error) return <ErrorState message={error} />
  if (!data) return <EmptyState label="No scorecard available." />

  const scoreOf = (criterionId: string, month: number) => data.scores.find((s) => s.criterionId === criterionId && s.month === month)?.score
  let lastValue = ''

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-gray-500 dark:text-gray-400">{describe(data.config)}</p>
        <YearSelect year={year} onChange={setYear} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead>
            <tr className="border-b border-black/10 text-gray-500 dark:border-white/10 dark:text-gray-400">
              <th className="py-2 pr-3 font-medium">Core value</th>
              <th className="py-2 pr-3 font-medium">KPI / criteria</th>
              {MONTHS.map((m) => (
                <th key={m} className="px-1 py-2 text-center font-medium">
                  {m}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.criteria.map((c) => {
              const showValue = c.coreValue !== lastValue
              lastValue = c.coreValue
              return (
                <tr key={c.id} className="border-b border-black/5 dark:border-white/5">
                  <td className="py-1.5 pr-3 font-medium text-gray-900 dark:text-gray-100">{showValue ? c.coreValue : ''}</td>
                  <td className={`py-1.5 pr-3 ${c.active ? 'text-gray-700 dark:text-gray-300' : 'text-gray-400 line-through'}`}>{c.name}</td>
                  {MONTHS.map((_, i) => (
                    <td key={i} className="px-1 py-1.5 text-center text-gray-700 dark:text-gray-300">
                      {scoreOf(c.id, i + 1) ?? ''}
                    </td>
                  ))}
                </tr>
              )
            })}
            <tr className="font-medium text-gray-900 dark:text-gray-100">
              <td className="py-2 pr-3" colSpan={2}>
                Total{data.yearly.total !== null && ` · ${data.yearly.total}${data.yearly.band ? ` (${data.yearly.band})` : ''}`}
              </td>
              {data.monthly.map((m) => (
                <td key={m.month} className="px-1 py-2 text-center">
                  {m.total ?? ''}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

// HR: enter one employee's scores for one month.
export function KpiEntry() {
  const [employeeId, setEmployeeId] = useState('')
  const [year, setYear] = useState(thisYear())
  const [month, setMonth] = useState(Number(todayInManilaIso().slice(5, 7)))
  const [data, setData] = useState<ScoresResponse | null>(null)
  const [values, setValues] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const load = useCallback(() => {
    if (!employeeId) return setData(null)
    api
      .get<ScoresResponse | null>(`/hr/kpi?kind=scores&employeeId=${employeeId}&year=${year}`)
      .then((d) => {
        setData(d)
        const next: Record<string, string> = {}
        d?.scores.filter((s) => s.month === month).forEach((s) => (next[s.criterionId] = String(s.score)))
        setValues(next)
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load scores'))
  }, [employeeId, year, month])
  useEffect(load, [load])

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!data) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      await api.put('/hr/kpi?kind=scores', {
        employeeId,
        year,
        month,
        scores: data.criteria
          .filter((c) => c.active)
          .map((c) => ({ criterionId: c.id, score: values[c.id]?.trim() ? Number(values[c.id]) : null })),
      })
      setMessage('Scores saved.')
      load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the scores')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <EmployeeSelect value={employeeId} onChange={setEmployeeId} />
        <Field label="Month">
          <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="field">
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Year">
          <YearSelect year={year} onChange={setYear} />
        </Field>
      </div>
      {data && (
        <form onSubmit={save} className="space-y-2">
          <p className="text-xs text-gray-500 dark:text-gray-400">{describe(data.config)} Leave a box empty for "not scored".</p>
          <ul className="divide-y divide-black/5 dark:divide-white/10">
            {data.criteria
              .filter((c) => c.active)
              .map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 py-1.5 text-sm">
                  <span className="text-gray-800 dark:text-gray-200">
                    <span className="text-gray-500 dark:text-gray-400">{c.coreValue} · </span>
                    {c.name}
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min={data.config.scaleMin}
                    max={data.config.scaleMax}
                    value={values[c.id] ?? ''}
                    onChange={(e) => setValues((prev) => ({ ...prev, [c.id]: e.target.value }))}
                    className="field w-24"
                    aria-label={c.name}
                  />
                </li>
              ))}
          </ul>
          <FormError message={error} />
          {message && <p className="text-sm text-green-700 dark:text-green-400">{message}</p>}
          <Button type="submit" variant="primary" size="sm" disabled={busy}>
            {busy ? 'Saving…' : 'Save scores'}
          </Button>
        </form>
      )}
      {!data && error && <ErrorState message={error} />}
    </div>
  )
}

// HR: the scale, the formula and the list of criteria.
export function KpiSettings() {
  const [config, setConfig] = useState<KpiConfig | null>(null)
  const [criteria, setCriteria] = useState<Criterion[]>([])
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [newValue, setNewValue] = useState('')
  const [newName, setNewName] = useState('')

  const load = useCallback(() => {
    api
      .get<{ config: KpiConfig; criteria: Criterion[] }>('/hr/kpi?kind=config')
      .then((d) => {
        setConfig(d.config)
        setCriteria(d.criteria)
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load the settings'))
  }, [])
  useEffect(load, [load])

  if (!config) return error ? <ErrorState message={error} /> : null

  const patch = (p: Partial<KpiConfig>) => setConfig({ ...config, ...p })

  async function saveConfig() {
    setError(null)
    setMessage(null)
    try {
      await api.put('/hr/kpi?kind=config', config)
      setMessage('Settings saved. Totals everywhere now use them.')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the settings')
    }
  }

  async function addCriterion(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      await api.post('/hr/kpi?kind=criteria', { coreValue: newValue, name: newName })
      setNewName('')
      load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not add the KPI')
    }
  }

  async function updateCriterion(id: string, body: Partial<Criterion>) {
    setError(null)
    try {
      await api.put(`/hr/kpi/${id}?kind=criteria`, body)
      load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update the KPI')
    }
  }

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Lowest score">
            <input type="number" value={config.scaleMin} onChange={(e) => patch({ scaleMin: Number(e.target.value) })} className="field" />
          </Field>
          <Field label="Highest score">
            <input type="number" value={config.scaleMax} onChange={(e) => patch({ scaleMax: Number(e.target.value) })} className="field" />
          </Field>
          <Field label="Monthly total">
            <select value={config.method} onChange={(e) => patch({ method: e.target.value as KpiConfig['method'] })} className="field">
              {Object.entries(METHOD_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Unscored KPIs">
            <select value={config.missing} onChange={(e) => patch({ missing: e.target.value as KpiConfig['missing'] })} className="field">
              <option value="ignore">Ignore them</option>
              <option value="zero">Count as zero</option>
            </select>
          </Field>
          <Field label="Year figure">
            <select value={config.rollup} onChange={(e) => patch({ rollup: e.target.value as KpiConfig['rollup'] })} className="field">
              <option value="average">Average of the months</option>
              <option value="latest">Latest month</option>
            </select>
          </Field>
        </div>
        <div>
          <p className="mb-1 text-sm text-gray-600 dark:text-gray-400">Rating labels (optional): a total at or above the number gets the label.</p>
          {config.bands.map((b, i) => (
            <div key={i} className="mb-1 flex gap-2">
              <input
                type="number"
                step="0.01"
                value={b.min}
                onChange={(e) => patch({ bands: config.bands.map((x, j) => (j === i ? { ...x, min: Number(e.target.value) } : x)) })}
                className="field w-28"
                aria-label="Minimum total"
              />
              <input
                value={b.label}
                onChange={(e) => patch({ bands: config.bands.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })}
                className="field"
                placeholder="Label, e.g. Outstanding"
                aria-label="Label"
              />
              <Button size="sm" variant="danger" onClick={() => patch({ bands: config.bands.filter((_, j) => j !== i) })}>
                Remove
              </Button>
            </div>
          ))}
          <Button size="sm" onClick={() => patch({ bands: [...config.bands, { min: 0, label: '' }] })}>
            Add label
          </Button>
        </div>
        <Button variant="primary" size="sm" onClick={saveConfig}>
          Save settings
        </Button>
        {message && <p className="text-sm text-green-700 dark:text-green-400">{message}</p>}
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-gray-900 dark:text-gray-100">KPI list</h3>
        <ul className="divide-y divide-black/5 text-sm dark:divide-white/10">
          {criteria.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-2 py-1.5">
              <span className="w-44 text-gray-500 dark:text-gray-400">{c.coreValue}</span>
              <span className={`flex-1 ${c.active ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400 line-through'}`}>{c.name}</span>
              {config.method === 'weighted' && (
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  defaultValue={c.weight}
                  onBlur={(e) => Number(e.target.value) !== c.weight && updateCriterion(c.id, { weight: Number(e.target.value) })}
                  className="field w-20"
                  aria-label={`Weight for ${c.name}`}
                />
              )}
              <Button size="sm" onClick={() => updateCriterion(c.id, { active: !c.active })}>
                {c.active ? 'Turn off' : 'Turn on'}
              </Button>
              <Button
                size="sm"
                variant="danger"
                onClick={async () => {
                  if (!window.confirm('Remove this KPI? If it already has scores it is only turned off.')) return
                  await api.delete(`/hr/kpi/${c.id}?kind=criteria`)
                  load()
                }}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
        <form onSubmit={addCriterion} className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <input required value={newValue} onChange={(e) => setNewValue(e.target.value)} placeholder="Core value" className="field" list="kpi-values" />
          <datalist id="kpi-values">
            {[...new Set(criteria.map((c) => c.coreValue))].map((v) => (
              <option key={v} value={v} />
            ))}
          </datalist>
          <input required value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New KPI / criteria" className="field" />
          <Button type="submit" size="sm" variant="primary">
            Add KPI
          </Button>
        </form>
      </div>
      <FormError message={error} />
    </div>
  )
}
