import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import { ErrorState, LoadingState } from '../../components/AsyncState'
import { Badge } from '../../components/ui/Badge'
import { Card } from '../../components/ui/Card'
import { PageHeader } from '../../components/ui/PageHeader'
import { api, ApiError } from '../../services/api'
import { formatDateOnly } from '../../utils/dates'
import { ConditionSelect } from './ConditionSelect'
import { itemPayload, QrImage } from './qr'
import { CONDITION_LABEL, CONDITION_TONE, STATUS_LABEL, STATUS_TONE, type InventoryDetail } from './types'

// What a QR sticker opens: /inventory/<assetTag>. HR/Admin see the item and
// its history; an employee sees it only if it is currently theirs.
export function InventoryItemPage() {
  const { tag = '' } = useParams()
  const { effectiveRoles } = useAuth()
  const isHr = effectiveRoles.some((r) => r === 'hr' || r === 'admin')
  const [item, setItem] = useState<InventoryDetail | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    api
      .get<InventoryDetail>(`/hr/inventory/${encodeURIComponent(tag)}`)
      .then(setItem)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 403) setError('This item is not assigned to you.')
        else setError(err instanceof ApiError ? err.message : 'Could not load the item')
      })
  }, [tag])
  useEffect(load, [load])

  if (error) return <ErrorState message={error} />
  if (!item) return <LoadingState />

  return (
    <div>
      <PageHeader title={item.name} description={item.assetTag} />
      <Card className="mb-4 space-y-1 text-sm">
        <p>
          <Badge tone={STATUS_TONE[item.status]}>{STATUS_LABEL[item.status]}</Badge>
        </p>
        {item.category && <p>Category: {item.category}</p>}
        {item.serialNumber && <p>Serial number: {item.serialNumber}</p>}
        <p>Held by: {item.assignedToName ?? 'Nobody (in storage)'}</p>
        {item.notes && <p className="text-gray-600 dark:text-gray-400">{item.notes}</p>}
        <div className="pt-2">
          <QrImage value={itemPayload(item)} label={item.assetTag} size={112} />
        </div>
      </Card>
      {isHr && (
        <Card className="mb-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Condition</h2>
            <ConditionSelect item={item} onChanged={load} />
          </div>
          {item.checks.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">Not checked yet.</p>
          ) : (
            <ul className="divide-y divide-black/5 text-sm dark:divide-white/10">
              {item.checks.map((c) => (
                <li key={c.id} className="flex items-center gap-3 py-2">
                  <span className="w-20 text-gray-500 dark:text-gray-400">{c.month}</span>
                  <Badge tone={CONDITION_TONE[c.condition]}>{CONDITION_LABEL[c.condition]}</Badge>
                  {c.note && <span className="text-gray-500 dark:text-gray-400">{c.note}</span>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
      {isHr && (
        <Card>
          <h2 className="mb-2 text-sm font-semibold text-gray-900 dark:text-gray-100">History</h2>
          {item.history.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">Never assigned.</p>
          ) : (
            <ul className="divide-y divide-black/5 text-sm dark:divide-white/10">
              {item.history.map((h) => (
                <li key={h.id} className="py-2">
                  <span className="font-medium text-gray-900 dark:text-gray-100">{h.employeeName}</span>
                  <span className="text-gray-500 dark:text-gray-400">
                    {' '}
                    · {formatDateOnly(h.assignedAt)} → {h.returnedAt ? formatDateOnly(h.returnedAt) : 'now'}
                    {h.returnNote && ` · ${h.returnNote}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  )
}
