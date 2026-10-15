import { useState } from 'react'
import { api, ApiError } from '../../services/api'
import { CONDITIONS, CONDITION_LABEL, type Condition, type InventoryItem } from './types'

// The monthly check: pick the item's condition and it is saved for this month.
export function ConditionSelect({ item, onChanged }: { item: InventoryItem; onChanged: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save(condition: Condition) {
    setBusy(true)
    setError(null)
    try {
      await api.post(`/hr/inventory/${item.id}?action=check`, { condition })
      onChanged()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save')
    } finally {
      setBusy(false)
    }
  }

  return (
    <span className="inline-flex flex-col gap-0.5">
      <span className="inline-flex items-center gap-1.5">
        <select
          aria-label={`Condition of ${item.assetTag}`}
          value={item.checkedThisMonth ? (item.condition ?? '') : ''}
          disabled={busy}
          onChange={(e) => e.target.value && void save(e.target.value as Condition)}
          className="field !w-auto !py-1 text-xs"
        >
          <option value="" disabled>
            {item.condition ? `Check (was ${CONDITION_LABEL[item.condition].toLowerCase()})` : 'Check…'}
          </option>
          {CONDITIONS.map((c) => (
            <option key={c} value={c}>
              {CONDITION_LABEL[c]}
            </option>
          ))}
        </select>
        {item.checkedThisMonth ? (
          <span className="text-emerald-500" title="Checked this month" aria-label="Checked this month">
            ✓
          </span>
        ) : (
          <span className="text-xs text-amber-500">Due</span>
        )}
      </span>
      {error && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
    </span>
  )
}
