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
import { MAX_UPLOAD_BYTES, readFileAsBase64 } from '../../utils/files'

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
  gross: number
  deductions: number
  net: number
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

function PayslipForm({ employeeId, onSaved }: { employeeId: string; onSaved: () => void }) {
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [gross, setGross] = useState('')
  const [deductions, setDeductions] = useState('0')
  const [file, setFile] = useState<File | undefined>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (file && file.size > MAX_UPLOAD_BYTES) return setError('File must be under 4MB')
    setBusy(true)
    setError(null)
    try {
      await api.post('/restricted/payroll?kind=payslips', {
        employeeId,
        periodStart: start,
        periodEnd: end,
        gross: Number(gross),
        deductions: Number(deductions),
        ...(file && { file: { fileName: file.name, contentType: file.type || 'application/pdf', base64: await readFileAsBase64(file) } }),
      })
      setGross('')
      setDeductions('0')
      setFile(undefined)
      onSaved()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the payslip')
    } finally {
      setBusy(false)
    }
  }

  return (
    <CardForm onSubmit={submit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="Period start">
          <input type="date" required value={start} onChange={(e) => setStart(e.target.value)} className="field" />
        </Field>
        <Field label="Period end">
          <input type="date" required value={end} onChange={(e) => setEnd(e.target.value)} className="field" />
        </Field>
        <Field label="Gross pay">
          <input type="number" min="0" step="0.01" required value={gross} onChange={(e) => setGross(e.target.value)} className="field" />
        </Field>
        <Field label="Deductions">
          <input type="number" min="0" step="0.01" required value={deductions} onChange={(e) => setDeductions(e.target.value)} className="field" />
        </Field>
      </div>
      <Field label="Payslip PDF (optional)">
        <input type="file" accept="application/pdf,image/*" onChange={(e) => setFile(e.target.files?.[0])} className="text-sm" />
      </Field>
      <FormError message={error} />
      <Button type="submit" variant="primary" size="sm" disabled={busy}>
        {busy ? 'Saving…' : 'Add payslip'}
      </Button>
    </CardForm>
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
          <Section id="payroll.payslips" title="Payslips" hint="Add a payslip and attach the PDF">
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
                        {formatDateOnly(s.periodStart)} – {formatDateOnly(s.periodEnd)}
                      </span>
                      <span className="flex flex-wrap items-center gap-3 text-gray-700 dark:text-gray-300">
                        <span>Gross {money.format(s.gross)}</span>
                        <span>Deductions {money.format(s.deductions)}</span>
                        <span className="font-medium text-gray-900 dark:text-gray-100">Net {money.format(s.net)}</span>
                        {s.hasFile && (
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
