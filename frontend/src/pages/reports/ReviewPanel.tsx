import type { Check } from './wizardModel'

// Every part of the report with how far along it is. An empty part links back to where it is filled in. Nothing here blocks submitting,
// because "nothing to report" is a real answer.
export function ReviewPanel({ checks, onFix, onSubmit, busy }: { checks: Check[]; onFix: (anchor: string) => void; onSubmit: () => void; busy: boolean }) {
  const missing = checks.filter((c) => !c.ok).length
  return (
    <section id="sec-review" className="scroll-mt-4 rounded-2xl border border-brand-600 bg-white p-4 shadow-sm dark:border-brand-400 dark:bg-[#0a1f16] sm:p-5">
      <h3 className="text-base font-bold text-gray-900 dark:text-white">Ready to submit?</h3>
      <p className={`mt-1 text-sm font-medium ${missing === 0 ? 'text-brand-800 dark:text-brand-200' : 'text-amber-800 dark:text-amber-200'}`}>
        {missing === 0
          ? 'Every part is filled in.'
          : `${missing} of ${checks.length} parts ${missing === 1 ? 'is' : 'are'} empty. You can still submit, or fill them in first.`}
      </p>
      <ul className="mt-3 divide-y divide-gray-200 overflow-hidden rounded-xl border border-gray-200 dark:divide-white/10 dark:border-white/10">
        {checks.map((c) => (
          <li key={c.id} className="flex items-center gap-3 px-4 py-2.5">
            <span
              aria-hidden="true"
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                c.ok ? 'bg-brand-600 text-white dark:bg-brand-500' : 'border-2 border-amber-500 text-amber-600 dark:text-amber-400'
              }`}
            >
              {c.ok ? '✓' : '!'}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-gray-900 dark:text-white">{c.label}</span>
              <span className="block text-xs text-gray-600 dark:text-gray-300">{c.detail}</span>
            </span>
            {!c.ok && (
              <button type="button" onClick={() => onFix(c.anchor)} className="shrink-0 text-xs font-semibold text-brand-700 hover:underline dark:text-brand-300">
                Fill in
              </button>
            )}
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-gray-600 dark:text-gray-300">Submitting sends it to your reviewer. Changes are saved as you go.</p>
        <button
          type="button"
          onClick={onSubmit}
          disabled={busy}
          className="inline-flex items-center justify-center rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:opacity-50 dark:bg-brand-500 dark:hover:bg-brand-400"
        >
          {busy ? 'Submitting…' : 'Submit report'}
        </button>
      </div>
    </section>
  )
}
