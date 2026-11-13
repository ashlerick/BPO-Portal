import type { ReactNode } from 'react'
import { ACCOUNTING_OTHER_LISTS, countOf, money, realEntries, realNames, totalOf, type AccountingReportData } from './accounting'

const box = 'rounded-xl border border-gray-200 p-4 dark:border-white/10'
const none = <p className="text-sm text-gray-500 dark:text-gray-400">None this week.</p>

function Block({ title, total, children }: { title: string; total?: string; children: ReactNode }) {
  return (
    <section className={box}>
      <div className="flex items-baseline justify-between gap-3">
        <h4 className="text-sm font-bold text-gray-900 dark:text-white">{title}</h4>
        {total && <p className="text-sm font-bold tabular-nums text-gray-900 dark:text-white">{total}</p>}
      </div>
      <div className="mt-2">{children}</div>
    </section>
  )
}

function Names({ items }: { items: string[] }) {
  return items.length === 0 ? (
    none
  ) : (
    <ol className="list-decimal space-y-0.5 pl-5 text-sm text-gray-900 dark:text-gray-100">
      {items.map((n, i) => (
        <li key={i}>{n}</li>
      ))}
    </ol>
  )
}

function Money({ rows }: { rows: { name: string; amount?: number }[] }) {
  return rows.length === 0 ? (
    none
  ) : (
    <ul className="divide-y divide-gray-100 text-sm dark:divide-white/10">
      {rows.map((r, i) => (
        <li key={i} className="flex justify-between gap-3 py-1 text-gray-900 dark:text-gray-100">
          <span className="min-w-0">{r.name}</span>
          <span className="shrink-0 tabular-nums">{r.amount != null ? money(r.amount) : ''}</span>
        </li>
      ))}
    </ul>
  )
}

// The Accounting report as it reads once filed: the same lists, with the totals.
export function AccountingSummary({ data }: { data: AccountingReportData }) {
  const ar = realEntries(data.receivables)
  const ap = realEntries(data.payables)
  const invoices = (data.invoices ?? []).filter((i) => i.name.trim())
  const state = (s: typeof data.arCases) => (['CA', 'WA'] as const).map((k) => ({ k, v: realNames(s?.[k]) }))
  return (
    <div className="space-y-3">
      <div className="grid gap-3 lg:grid-cols-2">
        <Block title="Accounts Receivable entered" total={money(totalOf(ar))}>
          <Money rows={ar} />
        </Block>
        <Block title="Accounts Payable entered" total={money(totalOf(ap))}>
          <Money rows={ap} />
        </Block>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {([
          ['AR case created', data.arCases],
          ['Begin billing', data.beginBilling],
        ] as const).map(([title, value]) => (
          <Block key={title} title={title}>
            <div className="grid gap-3 sm:grid-cols-2">
              {state(value).map(({ k, v }) => (
                <div key={k}>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">{k}</p>
                  <Names items={v} />
                </div>
              ))}
            </div>
          </Block>
        ))}
      </div>
      <Block title="Invoices created" total={String(countOf(invoices))}>
        {invoices.length === 0 ? (
          none
        ) : (
          <ul className="divide-y divide-gray-100 text-sm dark:divide-white/10">
            {invoices.map((i, n) => (
              <li key={n} className="flex justify-between gap-3 py-1 text-gray-900 dark:text-gray-100">
                <span>{i.name}</span>
                <span className="tabular-nums">{i.count ?? 0}</span>
              </li>
            ))}
          </ul>
        )}
      </Block>
      <div className="grid gap-3 lg:grid-cols-2">
        {ACCOUNTING_OTHER_LISTS.map((o) => (
          <Block key={o.key} title={o.title}>
            <Names items={realNames(data[o.key])} />
          </Block>
        ))}
        <Block title="Reimbursement entered">
          <Names items={realNames(data.reimbursements)} />
        </Block>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {(
          [
            ['Additional tasks', data.additionalTasks],
            ['Roadblocks', data.roadblocks],
          ] as const
        ).map(([title, text]) => (
          <Block key={title} title={title}>
            {text?.trim() ? <p className="whitespace-pre-wrap text-sm text-gray-900 dark:text-gray-100">{text}</p> : none}
          </Block>
        ))}
      </div>
      <Block title="Highlights">
        {data.highlights?.trim() ? <p className="whitespace-pre-wrap text-sm text-gray-900 dark:text-gray-100">{data.highlights}</p> : none}
      </Block>
    </div>
  )
}
