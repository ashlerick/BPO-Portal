import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState, ErrorState } from '../../components/AsyncState'
import { EmployeeSelect } from '../../components/EmployeeSelect'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { CardForm } from '../../components/ui/Card'
import { Field, FormError } from '../../components/ui/Field'
import { PageHeader } from '../../components/ui/PageHeader'
import { Section, SectionStack } from '../../components/ui/Section'
import { api, ApiError } from '../../services/api'
import { StickerSheet } from './StickerSheet'
import { STATUS_LABEL, STATUS_TONE, type InventoryItem } from './types'

function AddItemForm({ onAdded }: { onAdded: () => void }) {
  const [name, setName] = useState('')
  const [category, setCategory] = useState('')
  const [serial, setSerial] = useState('')
  const [tag, setTag] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api.post('/hr/inventory', {
        name,
        category: category || null,
        serialNumber: serial || null,
        ...(tag.trim() && { assetTag: tag.trim() }),
      })
      setName('')
      setCategory('')
      setSerial('')
      setTag('')
      onAdded()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not add the item')
    } finally {
      setBusy(false)
    }
  }

  return (
    <CardForm onSubmit={submit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="Item name">
          <input required value={name} onChange={(e) => setName(e.target.value)} className="field" placeholder="e.g. Dell Latitude 5420" />
        </Field>
        <Field label="Category">
          <input value={category} onChange={(e) => setCategory(e.target.value)} className="field" placeholder="Laptop, Phone…" />
        </Field>
        <Field label="Serial number">
          <input value={serial} onChange={(e) => setSerial(e.target.value)} className="field" />
        </Field>
        <Field label="Asset tag (optional)">
          <input value={tag} onChange={(e) => setTag(e.target.value)} className="field" placeholder="Auto: AST-00001" />
        </Field>
      </div>
      <FormError message={error} />
      <Button type="submit" variant="primary" size="sm" disabled={busy}>
        {busy ? 'Adding…' : 'Add item'}
      </Button>
    </CardForm>
  )
}

function AssignControl({ item, onChanged }: { item: InventoryItem; onChanged: () => void }) {
  const [open, setOpen] = useState(false)
  const [employeeId, setEmployeeId] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function run(fn: () => Promise<unknown>) {
    setError(null)
    try {
      await fn()
      setOpen(false)
      setEmployeeId('')
      onChanged()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong')
    }
  }

  if (item.assignedToId) {
    return (
      <span className="inline-flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          onClick={() => {
            if (window.confirm(`Mark ${item.assetTag} as returned by ${item.assignedToName}?`)) {
              void run(() => api.post(`/hr/inventory/${item.id}?action=return`, {}))
            }
          }}
        >
          Return
        </Button>
        {error && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
      </span>
    )
  }
  if (item.status !== 'available') return null
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {!open ? (
        <Button size="sm" onClick={() => setOpen(true)}>
          Assign
        </Button>
      ) : (
        <>
          <EmployeeSelect value={employeeId} onChange={setEmployeeId} label="" />
          <Button
            size="sm"
            variant="primary"
            disabled={!employeeId}
            onClick={() => run(() => api.post(`/hr/inventory/${item.id}?action=assign`, { employeeId }))}
          >
            Save
          </Button>
          <Button size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </>
      )}
      {error && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
    </span>
  )
}

export function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [printing, setPrinting] = useState(false)
  const [filter, setFilter] = useState('')

  const load = useCallback(() => {
    api
      .get<InventoryItem[]>('/hr/inventory')
      .then(setItems)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load the inventory'))
  }, [])
  useEffect(load, [load])

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return items ?? []
    return (items ?? []).filter((i) =>
      [i.assetTag, i.name, i.category, i.serialNumber, i.assignedToName].some((v) => v?.toLowerCase().includes(q)),
    )
  }, [items, filter])

  if (error) return <ErrorState message={error} />

  if (printing && items) {
    return <StickerSheet items={items.filter((i) => selected.includes(i.id))} onClose={() => setPrinting(false)} />
  }

  const allShownSelected = shown.length > 0 && shown.every((i) => selected.includes(i.id))

  return (
    <div>
      <PageHeader title="Inventory" description="Company items. Each item has one holder; one person can hold many." />
      <SectionStack>
        <Section id="inventory.add" title="Add an item">
          <AddItemForm onAdded={load} />
        </Section>

        <Section id="inventory.items" title="Items" hint={items ? `${items.length} total` : undefined} defaultOpen>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Search tag, name, holder…"
              className="field max-w-xs"
            />
            <Button variant="primary" size="sm" disabled={selected.length === 0} onClick={() => setPrinting(true)}>
              Print QR stickers ({selected.length})
            </Button>
          </div>
          {items && shown.length === 0 && <EmptyState label="No items." />}
          {shown.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[40rem] text-left text-sm">
                <thead>
                  <tr className="border-b border-black/10 text-gray-500 dark:border-white/10 dark:text-gray-400">
                    <th className="py-2 pr-2">
                      <input
                        type="checkbox"
                        aria-label="Select all"
                        checked={allShownSelected}
                        onChange={(e) => setSelected(e.target.checked ? shown.map((i) => i.id) : [])}
                      />
                    </th>
                    <th className="py-2 pr-3 font-medium">Tag</th>
                    <th className="py-2 pr-3 font-medium">Item</th>
                    <th className="py-2 pr-3 font-medium">Status</th>
                    <th className="py-2 pr-3 font-medium">Held by</th>
                    <th className="py-2 font-medium" />
                  </tr>
                </thead>
                <tbody className="text-gray-800 dark:text-gray-200">
                  {shown.map((i) => (
                    <tr key={i.id} className="border-b border-black/5 dark:border-white/5">
                      <td className="py-2 pr-2">
                        <input
                          type="checkbox"
                          aria-label={`Select ${i.assetTag}`}
                          checked={selected.includes(i.id)}
                          onChange={(e) =>
                            setSelected((prev) => (e.target.checked ? [...prev, i.id] : prev.filter((x) => x !== i.id)))
                          }
                        />
                      </td>
                      <td className="py-2 pr-3 font-medium">
                        <Link to={`/inventory/${encodeURIComponent(i.assetTag)}`} className="text-brand-600 dark:text-brand-400">
                          {i.assetTag}
                        </Link>
                      </td>
                      <td className="py-2 pr-3">
                        {i.name}
                        {i.category && <span className="text-gray-500 dark:text-gray-400"> · {i.category}</span>}
                      </td>
                      <td className="py-2 pr-3">
                        <Badge tone={STATUS_TONE[i.status]}>{STATUS_LABEL[i.status]}</Badge>
                      </td>
                      <td className="py-2 pr-3">{i.assignedToName ?? '—'}</td>
                      <td className="py-2">
                        <AssignControl item={i} onChanged={load} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      </SectionStack>
    </div>
  )
}
