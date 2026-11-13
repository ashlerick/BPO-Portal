import { useState, type ReactNode } from 'react'
import {
  ACCOUNTING_OTHER_LISTS,
  countOf,
  draftHighlights,
  money,
  parseEntries,
  totalOf,
  type AccountingReportData,
  type ByState,
  type Counted,
  type Entry,
} from './accounting'
import { input, label } from './foaUi'
import { MaskedInput } from './MaskedInput'

const card = 'scroll-mt-4 rounded-2xl border border-gray-300 bg-white p-4 shadow-sm dark:border-white/15 dark:bg-[#0a1f16] sm:p-5'
const link = 'text-xs font-semibold text-brand-700 hover:underline dark:text-brand-300'
const addBtn =
  'inline-flex h-9 items-center rounded-lg border border-dashed border-gray-400 px-3 text-xs font-semibold text-gray-800 hover:border-brand-600 hover:bg-gray-100 dark:border-white/40 dark:text-gray-100 dark:hover:border-brand-400 dark:hover:bg-white/10'

// Every list sits on the same columns, so the inputs, the remove buttons, the Add buttons and the totals line up down the page:
// the text (flexible), an optional number column, and the remove button. On a phone the name takes a row of its own and the number
// goes under it, so neither is squeezed.
// (Class names are written out in full: Tailwind only generates classes it can read as whole strings in the source.)
const trailing = 'pr-[2.625rem]' // the width of the × column and its gap, so a total ends under the number column, not under the ×
const entryCols = 'grid grid-cols-[minmax(0,1fr)_2.25rem] gap-x-1.5 gap-y-1.5 sm:grid-cols-[minmax(0,1fr)_10rem_2.25rem]'
const invoiceCols = 'grid grid-cols-[minmax(0,1fr)_7.5rem_2.25rem] gap-x-1.5'
const columnLabel = 'text-[11px] font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300'

type Patch = (p: Partial<AccountingReportData>) => void

function Remove({ onClick, what }: { onClick: () => void; what: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Remove ${what}`}
      className="flex h-[38px] w-9 items-center justify-center rounded-lg text-gray-500 transition hover:bg-red-50 hover:text-red-700 dark:text-gray-400 dark:hover:bg-red-950/50 dark:hover:text-red-300"
    >
      <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
        <path d="M4 4l8 8M12 4l-8 8" />
      </svg>
    </button>
  )
}

function Section({ id, title, hint, aside, children }: { id: string; title: string; hint?: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className={card}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div>
          <h3 className="text-base font-bold text-gray-900 dark:text-white">{title}</h3>
          {hint && <p className="text-xs text-gray-600 dark:text-gray-300">{hint}</p>}
        </div>
        {aside}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  )
}

// Rows of "who" and "how much", with the total worked out underneath. Lines pasted from a spreadsheet or the old report become rows.
function EntryList({ rows, nameLabel, onChange, what }: { rows: Entry[]; nameLabel: string; onChange: (next: Entry[]) => void; what: string }) {
  const [pasting, setPasting] = useState(false)
  const [pasted, setPasted] = useState('')
  const [added, setAdded] = useState(false)
  const set = (i: number, patch: Partial<Entry>) => onChange(rows.map((r, n) => (n === i ? { ...r, ...patch } : r)))

  function addPasted() {
    const parsed = parseEntries(pasted)
    if (parsed.length) onChange([...rows, ...parsed])
    setPasted('')
    setPasting(false)
  }

  return (
    <div>
      {rows.length > 0 && (
        <>
          <div className={`mb-1.5 hidden gap-x-1.5 sm:grid sm:grid-cols-[minmax(0,1fr)_10rem_2.25rem] ${columnLabel}`}>
            <span>{nameLabel}</span>
            <span className="text-right">Amount</span>
            <span />
          </div>
          <ul className="space-y-2 sm:space-y-1.5">
            {rows.map((r, i) => (
              <li key={i} className={`${entryCols} items-center border-b border-gray-200 pb-2 last:border-0 last:pb-0 dark:border-white/10 sm:border-0 sm:pb-0`}>
                <input
                  value={r.name}
                  onChange={(e) => set(i, { name: e.target.value })}
                  placeholder={nameLabel}
                  aria-label={`${what} ${i + 1}: ${nameLabel}`}
                  autoFocus={added && i === rows.length - 1}
                  className={`${input} col-span-2 sm:col-span-1`}
                />
                <MaskedInput kind="money" value={r.amount} onChange={(amount) => set(i, { amount })} label={`${what} ${i + 1}: amount`} />
                <Remove what={`${what} ${i + 1}`} onClick={() => onChange(rows.filter((_, n) => n !== i))} />
              </li>
            ))}
          </ul>
        </>
      )}
      <div className={`${rows.length ? 'mt-3' : ''} flex flex-wrap items-center gap-2`}>
        <button
          type="button"
          className={addBtn}
          onClick={() => {
            setAdded(true)
            onChange([...rows, { name: '' }])
          }}
        >
          + Add row
        </button>
        <button type="button" className={addBtn} onClick={() => setPasting((v) => !v)} aria-expanded={pasting}>
          Paste a list
        </button>
        <span className="flex-1" />
        <p className={`text-sm text-gray-700 dark:text-gray-200 ${trailing}`}>
          {rows.length} {rows.length === 1 ? 'row' : 'rows'} · Total <b className="text-base text-gray-900 dark:text-white">{money(totalOf(rows))}</b>
        </p>
      </div>
      {pasting && (
        <div className="mt-3 rounded-xl bg-gray-50 p-3 dark:bg-white/[0.05]">
          <label htmlFor={`paste-${what}`} className={`${label} mb-1 block`}>
            One per line, like “Lockbox - $163,706.13”
          </label>
          <textarea id={`paste-${what}`} value={pasted} onChange={(e) => setPasted(e.target.value)} rows={5} className={input} />
          <div className="mt-2 flex items-center gap-3">
            <button type="button" className={addBtn} onClick={addPasted} disabled={!pasted.trim()}>
              Add these rows
            </button>
            <button type="button" className="text-xs font-semibold text-gray-700 hover:underline dark:text-gray-300" onClick={() => setPasting(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// A numbered list of names. An empty list means "none this week", which is a real answer. The Add button lines up with the inputs, not
// with the numbers beside them.
function NameList({ items, onChange, placeholder, what }: { items: string[]; onChange: (next: string[]) => void; placeholder: string; what: string }) {
  const [added, setAdded] = useState(false)
  const indent = 'pl-[1.625rem]'
  return (
    <div>
      {items.length === 0 && <p className={`mb-2 text-xs text-gray-600 dark:text-gray-300 ${indent}`}>None this week.</p>}
      <ol className="space-y-1.5">
        {items.map((v, i) => (
          <li key={i} className="grid grid-cols-[1.25rem_minmax(0,1fr)_2.25rem] items-center gap-x-1.5">
            <span className="text-right text-xs text-gray-600 dark:text-gray-300">{i + 1}.</span>
            <input
              value={v}
              onChange={(e) => onChange(items.map((x, n) => (n === i ? e.target.value : x)))}
              placeholder={placeholder}
              aria-label={`${what} ${i + 1}`}
              autoFocus={added && i === items.length - 1}
              className={input}
            />
            <Remove what={`${what} ${i + 1}`} onClick={() => onChange(items.filter((_, n) => n !== i))} />
          </li>
        ))}
      </ol>
      <div className={`${items.length ? 'mt-2' : ''} ${indent}`}>
        <button
          type="button"
          className={addBtn}
          onClick={() => {
            setAdded(true)
            onChange([...items, ''])
          }}
        >
          + Add
        </button>
      </div>
    </div>
  )
}

function StateLists({ value, onChange, what, placeholder }: { value: ByState | undefined; onChange: (next: ByState) => void; what: string; placeholder: string }) {
  return (
    <div className="grid gap-6 sm:grid-cols-2">
      {(['CA', 'WA'] as const).map((state) => (
        <div key={state}>
          <p className={`${label} mb-2`}>{state}</p>
          <NameList items={value?.[state] ?? []} onChange={(next) => onChange({ ...value, [state]: next })} placeholder={placeholder} what={`${what} ${state}`} />
        </div>
      ))}
    </div>
  )
}

function InvoiceList({ rows, onChange }: { rows: Counted[]; onChange: (next: Counted[]) => void }) {
  const [added, setAdded] = useState(false)
  const set = (i: number, patch: Partial<Counted>) => onChange(rows.map((r, n) => (n === i ? { ...r, ...patch } : r)))
  return (
    <div>
      {rows.length > 0 && (
        <>
          <div className={`${invoiceCols} mb-1.5 ${columnLabel}`}>
            <span>Client</span>
            <span className="text-right">Invoices</span>
            <span />
          </div>
          <ul className="space-y-1.5">
            {rows.map((r, i) => (
              <li key={i} className={`${invoiceCols} items-center`}>
                <input
                  value={r.name}
                  onChange={(e) => set(i, { name: e.target.value })}
                  placeholder="Client"
                  aria-label={`Invoice ${i + 1}: client`}
                  autoFocus={added && i === rows.length - 1}
                  className={input}
                />
                <MaskedInput kind="whole" value={r.count} onChange={(count) => set(i, { count })} label={`Invoice ${i + 1}: how many`} />
                <Remove what={`invoice ${i + 1}`} onClick={() => onChange(rows.filter((_, n) => n !== i))} />
              </li>
            ))}
          </ul>
        </>
      )}
      <div className={`${rows.length ? 'mt-3' : ''} flex flex-wrap items-center gap-2`}>
        <button
          type="button"
          className={addBtn}
          onClick={() => {
            setAdded(true)
            onChange([...rows, { name: '' }])
          }}
        >
          + Add client
        </button>
        <span className="flex-1" />
        <p className={`text-sm text-gray-700 dark:text-gray-200 ${trailing}`}>
          Total invoices <b className="text-base text-gray-900 dark:text-white">{countOf(rows).toLocaleString('en-US')}</b>
        </p>
      </div>
    </div>
  )
}

// The Accounting weekly report as one sheet of lists, in the order of the report it replaces. Every total is worked out from the rows.
export function AccountingSheet({ data, onChange }: { data: AccountingReportData; onChange: Patch }) {
  const draft = () => {
    if (!data.highlights?.trim() || window.confirm('Replace the highlights you wrote with a fresh draft from the entries?')) onChange({ highlights: draftHighlights(data) })
  }
  return (
    <div className="space-y-4">
      <Section id="sec-ar" title="Accounts Receivable entered" hint="Payments recorded this week.">
        <EntryList rows={data.receivables ?? []} onChange={(next) => onChange({ receivables: next })} nameLabel="Payer or source" what="Receivable" />
      </Section>

      <Section id="sec-ap" title="Accounts Payable entered" hint="Vendor bills entered this week.">
        <EntryList rows={data.payables ?? []} onChange={(next) => onChange({ payables: next })} nameLabel="Vendor" what="Payable" />
      </Section>

      <Section id="sec-cases" title="AR cases and billing" hint="Properties by state. Leave a state empty if there were none.">
        <div className="space-y-6">
          <div>
            <p className="mb-3 text-sm font-bold text-gray-900 dark:text-white">AR case created</p>
            <StateLists value={data.arCases} onChange={(next) => onChange({ arCases: next })} what="AR case" placeholder="Property" />
          </div>
          <hr className="border-gray-200 dark:border-white/10" />
          <div>
            <p className="mb-3 text-sm font-bold text-gray-900 dark:text-white">Begin billing</p>
            <StateLists value={data.beginBilling} onChange={(next) => onChange({ beginBilling: next })} what="Begin billing" placeholder="Property" />
          </div>
        </div>
      </Section>

      <Section id="sec-invoices" title="Invoices created" hint="How many invoices for each client.">
        <InvoiceList rows={data.invoices ?? []} onChange={(next) => onChange({ invoices: next })} />
      </Section>

      <Section id="sec-other" title="Everything else" hint="Anything entered under these. An empty list means none this week.">
        <div className="space-y-6">
          {ACCOUNTING_OTHER_LISTS.map((o, i) => (
            <div key={o.key}>
              {i > 0 && <hr className="mb-6 border-gray-200 dark:border-white/10" />}
              <p className="mb-2 text-sm font-bold text-gray-900 dark:text-white">{o.title}</p>
              <NameList items={data[o.key] ?? []} onChange={(next) => onChange({ [o.key]: next })} placeholder="Name or property" what={o.title} />
            </div>
          ))}
          <hr className="border-gray-200 dark:border-white/10" />
          <div>
            <p className="mb-2 text-sm font-bold text-gray-900 dark:text-white">Reimbursement entered</p>
            <NameList items={data.reimbursements ?? []} onChange={(next) => onChange({ reimbursements: next })} placeholder="Employee" what="Reimbursement" />
          </div>
        </div>
      </Section>

      <Section id="sec-notes" title="Additional tasks and roadblocks" hint="Anything done outside the lists above, and what got in the way.">
        <div className="space-y-4">
          {(
            [
              ['additionalTasks', 'Additional tasks', 'Anything done outside the lists above.'],
              ['roadblocks', 'Roadblocks', 'What got in the way, and what you need.'],
            ] as const
          ).map(([key, title, hint]) => (
            <div key={key}>
              <label htmlFor={`acct-${key}`} className={`${label} mb-1 block`}>
                {title}
              </label>
              <textarea id={`acct-${key}`} value={data[key] ?? ''} onChange={(e) => onChange({ [key]: e.target.value })} rows={3} placeholder={hint} className={input} />
            </div>
          ))}
        </div>
      </Section>

      <Section
        id="sec-highlights"
        title="Highlights"
        hint="The week in a few lines."
        aside={
          <button type="button" className={link} onClick={draft}>
            Draft from my entries
          </button>
        }
      >
        <textarea
          aria-label="Highlights"
          value={data.highlights ?? ''}
          onChange={(e) => onChange({ highlights: e.target.value })}
          rows={9}
          placeholder="Tap “Draft from my entries” to start from what you entered, then edit it."
          className={input}
        />
      </Section>
    </div>
  )
}
