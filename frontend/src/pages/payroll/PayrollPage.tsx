import { useEffect, useState, type FormEvent } from 'react'
import { EmptyState, ErrorState } from '../../components/AsyncState'
import { EmployeeSelect } from '../../components/EmployeeSelect'
import { api, ApiError } from '../../services/api'
import { Card, CardForm } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Field, FormError } from '../../components/ui/Field'
import { PageHeader } from '../../components/ui/PageHeader'
import { Section, SectionStack } from '../../components/ui/Section'
import { formatDateOnly, todayInManilaIso } from '../../utils/dates'
import { currentPeriod, MONTH_NAMES, payslipPeriodLabel } from '../../utils/payslips'

interface Summary {
  salary: number | null
  lastChangeDate: string | null
}
interface SalaryChange {
  id: string
  effectiveDate: string
  previousSalary: number | null
  newSalary: number
  reason: string | null
}
interface PayItem {
  id: string
  kind: 'allowance' | 'bonus' | 'deduction'
  label: string
  amount: number
  date: string
  recurring: boolean
}
interface Payslip {
  id: string
  periodStart: string
  periodEnd: string
  gross: number | null
  deductions: number | null
  net: number | null
  link: string | null
  hasFile: boolean
}

const money = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' })

function SalaryChangeForm({ employeeId, onSaved }: { employeeId: string; onSaved: () => void }) {
  const [salary, setSalary] = useState('')
  const [date, setDate] = useState(todayInManilaIso())
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api.post('/restricted/payroll?kind=salary', { employeeId, effectiveDate: date, newSalary: Number(salary), reason: reason || null })
      setSalary('')
      setReason('')
      onSaved()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not record the change')
    } finally {
      setBusy(false)
    }
  }

  return (
    <CardForm onSubmit={submit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="New salary">
          <input type="number" min="0" step="0.01" required value={salary} onChange={(e) => setSalary(e.target.value)} className="field" />
        </Field>
        <Field label="Effective date">
          <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} className="field" />
        </Field>
        <Field label="Reason (optional)">
          <input value={reason} onChange={(e) => setReason(e.target.value)} className="field" />
        </Field>
      </div>
      <FormError message={error} />
      <Button type="submit" variant="primary" size="sm" disabled={busy}>
        {busy ? 'Saving…' : 'Record salary change'}
      </Button>
    </CardForm>
  )
}

function PayItemSection({ employeeId, kind, title, items, reload }: { employeeId: string; kind: PayItem['kind']; title: string; items: PayItem[]; reload: () => void }) {
  const [label, setLabel] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayInManilaIso())
  const [recurring, setRecurring] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const list = items.filter((i) => i.kind === kind)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api.post('/restricted/payroll?kind=items', { employeeId, kind, label, amount: Number(amount), date, recurring })
      setLabel('')
      setAmount('')
      reload()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Section id={`payroll.${kind}`} title={title} hint={`${list.length} on record`}>
      <div className="space-y-3">
        <CardForm onSubmit={submit} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Label">
              <input required value={label} onChange={(e) => setLabel(e.target.value)} className="field" />
            </Field>
            <Field label="Amount">
              <input type="number" min="0" step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} className="field" />
            </Field>
            <Field label="Date">
              <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} className="field" />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input type="checkbox" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} />
            Recurring
          </label>
          <FormError message={error} />
          <Button type="submit" size="sm" variant="primary" disabled={busy}>
            Add
          </Button>
        </CardForm>
        {list.length === 0 ? (
          <EmptyState label="Nothing recorded." />
        ) : (
          <ul className="divide-y divide-black/5 text-sm dark:divide-white/10">
            {list.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="text-gray-900 dark:text-gray-100">
                  {i.label}
                  <span className="text-gray-500 dark:text-gray-400"> · {formatDateOnly(i.date)}{i.recurring ? ' · recurring' : ''}</span>
                </span>
                <span className="flex items-center gap-3">
                  <span className="font-medium text-gray-900 dark:text-gray-100">{money.format(i.amount)}</span>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={async () => {
                      if (!window.confirm('Remove this entry?')) return
                      await api.delete(`/restricted/payroll/${i.id}?kind=items`)
                      reload()
                    }}
                  >
                    Remove
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Section>
  )
}

// Period picker shared by the single and bulk payslip forms.
function PeriodFields({ value, onChange }: { value: PeriodValue; onChange: (v: PeriodValue) => void }) {
  const thisYear = Number(todayInManilaIso().slice(0, 4))
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Field label="Month">
        <select value={value.month} onChange={(e) => onChange({ ...value, month: Number(e.target.value) })} className="field">
          {MONTH_NAMES.map((name, i) => (
            <option key={name} value={i + 1}>
              {name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Cut-off">
        <select value={value.half} onChange={(e) => onChange({ ...value, half: Number(e.target.value) as 1 | 2 })} className="field">
          <option value={1}>1H (1st – 15th)</option>
          <option value={2}>2H (16th – end)</option>
        </select>
      </Field>
      <Field label="Year">
        <select value={value.year} onChange={(e) => onChange({ ...value, year: Number(e.target.value) })} className="field">
          {[thisYear + 1, thisYear, thisYear - 1, thisYear - 2].map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </Field>
    </div>
  )
}

interface PeriodValue {
  year: number
  month: number
  half: 1 | 2
}

function PayslipForm({ employeeId, onSaved }: { employeeId: string; onSaved: () => void }) {
  const [period, setPeriod] = useState<PeriodValue>(() => currentPeriod(todayInManilaIso()))
  const [link, setLink] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api.post('/restricted/payroll?kind=payslips', { employeeId, ...period, link: link.trim() })
      setLink('')
      onSaved()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the payslip')
    } finally {
      setBusy(false)
    }
  }

  return (
    <CardForm onSubmit={submit} className="space-y-3">
      <PeriodFields value={period} onChange={setPeriod} />
      <Field label="Payslip link (Google Drive)">
        <input
          type="url"
          required
          placeholder="https://drive.google.com/open?id=…"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          className="field"
        />
      </Field>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        Saving again for the same period replaces the link. Make sure the file is shared with the employee in Drive.
      </p>
      <FormError message={error} />
      <Button type="submit" variant="primary" size="sm" disabled={busy}>
        {busy ? 'Saving…' : 'Save payslip link'}
      </Button>
    </CardForm>
  )
}

interface PeriodRow {
  employeeId: string
  employeeCode: string | null
  name: string
  link: string | null
}

// One period, every active employee: paste a link per row, save them all.
function PayslipBulk() {
  const [period, setPeriod] = useState<PeriodValue>(() => currentPeriod(todayInManilaIso()))
  const [rows, setRows] = useState<PeriodRow[]>([])
  const [releaseDate, setReleaseDate] = useState<string | null>(null)
  const [links, setLinks] = useState<Record<string, string>>({})
  const [onlyMissing, setOnlyMissing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    setError(null)
    setMessage(null)
    api
      .get<{ releaseDate: string; rows: PeriodRow[] }>(
        `/restricted/payroll?kind=payslips-period&year=${period.year}&month=${period.month}&half=${period.half}`,
      )
      .then((data) => {
        setRows(data.rows)
        setReleaseDate(data.releaseDate)
        setLinks({})
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load employees'))
  }, [period, reloadToken])

  const entries = Object.entries(links)
    .map(([employeeId, link]) => ({ employeeId, link: link.trim() }))
    .filter((e) => e.link !== '')
  const missingCount = rows.filter((r) => !r.link && !links[r.employeeId]?.trim()).length
  const shown = onlyMissing ? rows.filter((r) => !r.link) : rows

  async function save() {
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const { saved } = await api.post<{ saved: number }>('/restricted/payroll?kind=payslips-bulk', { ...period, entries })
      setMessage(`Saved ${saved} payslip link${saved === 1 ? '' : 's'}.`)
      setReloadToken((t) => t + 1)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the links')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <PeriodFields value={period} onChange={setPeriod} />
      {releaseDate && (
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Employees can see this payslip from <span className="font-medium">{formatDateOnly(releaseDate)}</span> (the 10th / 25th, or the Friday before
          if it falls on a weekend). You can add links ahead of time.
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-gray-600 dark:text-gray-400">
        <span>
          {rows.length - rows.filter((r) => !r.link).length} of {rows.length} have a link · {missingCount} still missing
        </span>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} />
          Show only missing
        </label>
      </div>
      {shown.length === 0 ? (
        <EmptyState label={rows.length === 0 ? 'No active employees.' : 'Everyone has a link for this period.'} />
      ) : (
        <ul className="divide-y divide-black/5 dark:divide-white/10">
          {shown.map((r) => (
            <li key={r.employeeId} className="grid items-center gap-2 py-2 sm:grid-cols-[minmax(0,14rem)_1fr]">
              <span className="text-sm text-gray-900 dark:text-gray-100">
                {r.name}
                {r.employeeCode && <span className="text-gray-500 dark:text-gray-400"> · {r.employeeCode}</span>}
              </span>
              <input
                type="url"
                aria-label={`Payslip link for ${r.name}`}
                placeholder={r.link ? 'Replace link…' : 'Paste Drive link…'}
                value={links[r.employeeId] ?? ''}
                onChange={(e) => setLinks((prev) => ({ ...prev, [r.employeeId]: e.target.value }))}
                className="field"
              />
              {r.link && (
                <a
                  href={r.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-medium text-brand-600 dark:text-brand-400 sm:col-start-2"
                >
                  Current link ↗
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
      <FormError message={error} />
      {message && <p className="text-sm text-green-700 dark:text-green-400">{message}</p>}
      <Button variant="primary" size="sm" disabled={busy || entries.length === 0} onClick={save}>
        {busy ? 'Saving…' : `Save ${entries.length} link${entries.length === 1 ? '' : 's'}`}
      </Button>
    </div>
  )
}

export function PayrollPage() {
  const [employeeId, setEmployeeId] = useState('')
  const [summary, setSummary] = useState<Summary | null>(null)
  const [changes, setChanges] = useState<SalaryChange[]>([])
  const [items, setItems] = useState<PayItem[]>([])
  const [slips, setSlips] = useState<Payslip[]>([])
  const [error, setError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    if (!employeeId) return
    setError(null)
    const q = `employeeId=${employeeId}`
    Promise.all([
      api.get<Summary>(`/restricted/payroll?kind=summary&${q}`),
      api.get<SalaryChange[]>(`/restricted/payroll?kind=salary&${q}`),
      api.get<PayItem[]>(`/restricted/payroll?kind=items&${q}`),
      api.get<Payslip[]>(`/restricted/payroll?kind=payslips&${q}`),
    ])
      .then(([s, c, i, p]) => {
        setSummary(s)
        setChanges(c)
        setItems(i)
        setSlips(p)
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Something went wrong'))
  }, [employeeId, reloadToken])

  const reload = () => setReloadToken((t) => t + 1)

  async function downloadSlip(id: string) {
    try {
      const { url } = await api.get<{ url: string }>(`/restricted/payroll/${id}?kind=payslips`)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Could not open the payslip')
    }
  }

  return (
    <div>
      <PageHeader title="Payroll / Compensation" description="Restricted. Every view and change here is recorded in the audit log." />
      <div className="mb-4">
        <SectionStack>
          <Section id="payroll.bulk" title="Payslip links — all employees" hint="Pick a cut-off, paste each employee's Drive link, save once">
            <PayslipBulk />
          </Section>
        </SectionStack>
      </div>
      <div className="mb-4 max-w-sm">
        <EmployeeSelect value={employeeId} onChange={setEmployeeId} />
      </div>
      {error && <ErrorState message={error} />}
      {!employeeId && <EmptyState label="Choose an employee to see their compensation." />}

      {employeeId && summary && (
        <SectionStack>
          <Section id="payroll.salary" title="Salary history" hint={summary.salary !== null ? `Current: ${money.format(summary.salary)}` : 'No salary on record'} defaultOpen>
            {changes.length === 0 ? (
              <EmptyState label="No salary changes recorded." />
            ) : (
              <ul className="divide-y divide-black/5 text-sm dark:divide-white/10">
                {changes.map((c) => (
                  <li key={c.id} className="flex flex-wrap justify-between gap-2 py-2">
                    <span className="text-gray-900 dark:text-gray-100">
                      {formatDateOnly(c.effectiveDate)}
                      {c.reason && <span className="text-gray-500 dark:text-gray-400"> · {c.reason}</span>}
                    </span>
                    <span className="text-gray-700 dark:text-gray-300">
                      {c.previousSalary !== null && `${money.format(c.previousSalary)} → `}
                      <span className="font-medium">{money.format(c.newSalary)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
          <Section id="payroll.changes" title="Salary changes" hint="Record a raise or adjustment">
            <SalaryChangeForm employeeId={employeeId} onSaved={reload} />
          </Section>
          <PayItemSection employeeId={employeeId} kind="allowance" title="Allowances" items={items} reload={reload} />
          <PayItemSection employeeId={employeeId} kind="bonus" title="Bonuses" items={items} reload={reload} />
          <PayItemSection employeeId={employeeId} kind="deduction" title="Deductions" items={items} reload={reload} />
          <Section id="payroll.payslips" title="Payslips" hint="Add one payslip link for this employee">
            <PayslipForm employeeId={employeeId} onSaved={reload} />
          </Section>
          <Section id="payroll.history" title="Payroll history" hint={`${slips.length} payslip${slips.length === 1 ? '' : 's'}`}>
            {slips.length === 0 ? (
              <EmptyState label="No payslips yet." />
            ) : (
              <ul className="space-y-2">
                {slips.map((s) => (
                  <li key={s.id}>
                    <Card className="flex flex-wrap items-center justify-between gap-2 !py-3 text-sm">
                      <span className="text-gray-900 dark:text-gray-100">
                        {payslipPeriodLabel(s.periodStart)}
                        <span className="text-gray-500 dark:text-gray-400">
                          {' '}
                          · {formatDateOnly(s.periodStart)} – {formatDateOnly(s.periodEnd)}
                        </span>
                      </span>
                      <span className="flex flex-wrap items-center gap-3 text-gray-700 dark:text-gray-300">
                        {s.net !== null && <span className="font-medium text-gray-900 dark:text-gray-100">Net {money.format(s.net)}</span>}
                        {s.link && (
                          <a
                            href={s.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium text-brand-600 dark:text-brand-400"
                          >
                            Open ↗
                          </a>
                        )}
                        {!s.link && s.hasFile && (
                          <Button size="sm" onClick={() => downloadSlip(s.id)}>
                            PDF
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={async () => {
                            if (!window.confirm('Delete this payslip?')) return
                            await api.delete(`/restricted/payroll/${s.id}?kind=payslips`)
                            reload()
                          }}
                        >
                          Delete
                        </Button>
                      </span>
                    </Card>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </SectionStack>
      )}
    </div>
  )
}
