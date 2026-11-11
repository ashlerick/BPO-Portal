import { label } from './foaUi'

export interface CountField {
  key: string
  label: string
}

// A group of whole-number counts as tiles: the name, a large number, and minus and plus buttons, so a count is a tap, not typing. Used for
// the variance investigations and the Motive safety events.
export function FoaCounts({
  title,
  fields,
  values,
  readOnly,
  onChange,
}: {
  title: string
  fields: CountField[]
  values: Record<string, number | undefined>
  readOnly?: boolean
  onChange: (key: string, value: number | undefined) => void
}) {
  const total = fields.reduce((a, f) => a + (values[f.key] ?? 0), 0)
  const step = (key: string, d: number) => onChange(key, Math.max(0, (values[key] ?? 0) + d))

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <p className="text-sm font-semibold text-gray-900 dark:text-white">{title}</p>
        <p className="text-xs text-gray-600 dark:text-gray-300">
          Total <b className="text-sm text-gray-900 dark:text-white">{total}</b>
        </p>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(9.5rem,1fr))] gap-2">
        {fields.map((f) => {
          const v = values[f.key]
          return (
            <div key={f.key} className="rounded-xl border border-gray-300 bg-gray-50 p-2.5 dark:border-white/15 dark:bg-white/[0.06]">
              <p className={`${label} mb-1.5 normal-case tracking-normal`}>{f.label}</p>
              {readOnly ? (
                <p className="text-2xl font-bold tabular-nums text-gray-900 dark:text-white">{v ?? 0}</p>
              ) : (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => step(f.key, -1)}
                    disabled={(v ?? 0) <= 0}
                    aria-label={`One less ${f.label}`}
                    className="h-9 w-9 shrink-0 rounded-lg border border-gray-400 text-lg font-bold text-gray-800 hover:bg-gray-200 disabled:opacity-30 dark:border-white/30 dark:text-gray-100 dark:hover:bg-white/10"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={v ?? ''}
                    placeholder="0"
                    onChange={(e) => onChange(f.key, e.target.value === '' ? undefined : Math.max(0, Math.floor(Number(e.target.value))))}
                    aria-label={f.label}
                    className="h-9 min-w-0 flex-1 rounded-lg border border-gray-400 bg-white text-center text-lg font-bold tabular-nums text-gray-900 [appearance:textfield] focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40 dark:border-white/30 dark:bg-black/40 dark:text-white [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  />
                  <button
                    type="button"
                    onClick={() => step(f.key, 1)}
                    aria-label={`One more ${f.label}`}
                    className="h-9 w-9 shrink-0 rounded-lg border border-brand-600 bg-brand-600 text-lg font-bold text-white hover:bg-brand-700 dark:border-brand-400 dark:bg-brand-500"
                  >
                    +
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
