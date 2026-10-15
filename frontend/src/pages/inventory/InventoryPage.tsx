import { useCallback, useEffect, useMemo, useState, type Dispatch, type FormEvent, type SetStateAction } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState, ErrorState } from '../../components/AsyncState'
import { EmployeeSelect } from '../../components/EmployeeSelect'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { useToast } from '../../components/ui/Toast'
import { CardForm } from '../../components/ui/Card'
import { Field, FormError } from '../../components/ui/Field'
import { PageHeader } from '../../components/ui/PageHeader'
import { Tabs } from '../../components/ui/Tabs'
import { api, ApiError } from '../../services/api'
import { useAuth } from '../../auth/AuthContext'
import { ConditionSelect } from './ConditionSelect'
import { ItemEditDialog } from './ItemEditDialog'
import { ScanTab } from './ScanTab'
import { itemPayload, QrImage, QrPopup } from './qr'
import { StickerSheet } from './StickerSheet'
import { STATUS_LABEL, STATUS_TONE, type InventoryItem } from './types'

// Every row, in every person's folder, shares these column widths so the
// tag, item, condition and status line up from one folder to the next.
// Phones: each item is its own card (stacked). md and up: one aligned row.
const ROW_GRID =
  'md:grid md:grid-cols-[1.25rem_3rem_6.5rem_minmax(9rem,1fr)_10rem_6.5rem_9rem] md:items-center md:gap-x-3 md:min-w-[52rem]'

function AddItemForm({ onAdded }: { onAdded: () => void }) {
  const [name, setName] = useState('')
  const [category, setCategory] = useState('')
  const [serial, setSerial] = useState('')
  const [tag, setTag] = useState('')
  const [nextTag, setNextTag] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const toast = useToast()

  const loadNext = useCallback(() => {
    api
      .get<{ assetTag: string }>('/hr/inventory?nexttag=1')
      .then((r) => setNextTag(r.assetTag))
      .catch(() => setNextTag(''))
  }, [])
  useEffect(loadNext, [loadNext])

  // The sticker is previewed live from every field: the typed tag, else the one the item will get.
  const previewTag = tag.trim() || nextTag

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const created = await api.post<InventoryItem>('/hr/inventory', {
        name,
        category: category || null,
        serialNumber: serial || null,
        ...(tag.trim() && { assetTag: tag.trim() }),
      })
      setName('')
      setCategory('')
      setSerial('')
      setTag('')
      loadNext()
      onAdded()
      toast.success(`Added ${created.name} (${created.assetTag})`)
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not add the item'
      setError(message)
      toast.error(message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <CardForm onSubmit={submit} className="space-y-3">
      <div className="flex flex-wrap items-start gap-4">
        <div className="grid min-w-[18rem] flex-1 gap-3 sm:grid-cols-2">
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
            <input value={tag} onChange={(e) => setTag(e.target.value)} className="field" placeholder={nextTag ? `Auto: ${nextTag}` : 'Auto'} />
          </Field>
        </div>
        <div className="flex flex-col items-center gap-1 text-center">
          <QrImage value={itemPayload({ assetTag: previewTag, name, category, serialNumber: serial })} label={previewTag} size={120} />
          <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{previewTag || '…'}</span>
          <span className="text-[11px] text-gray-500 dark:text-gray-400">Sticker preview</span>
        </div>
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
  const toast = useToast()

  async function run(fn: () => Promise<unknown>, done: string) {
    setError(null)
    try {
      await fn()
      setOpen(false)
      setEmployeeId('')
      onChanged()
      toast.success(done)
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Something went wrong'
      setError(message)
      toast.error(message)
    }
  }

  if (item.assignedToId) {
    return (
      <span className="inline-flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          onClick={() => {
            if (window.confirm(`Mark ${item.assetTag} as returned by ${item.assignedToName}?`)) {
              void run(() => api.post(`/hr/inventory/${item.id}?action=return`, {}), `${item.assetTag} marked as returned`)
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
    <span className="inline-flex flex-wrap items-center justify-end gap-2">
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
            onClick={() => run(() => api.post(`/hr/inventory/${item.id}?action=assign`, { employeeId }), `${item.assetTag} assigned`)}
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

type Group = { key: string; label: string; items: InventoryItem[] }

function ItemRow({
  item,
  checked,
  onToggle,
  onChanged,
}: {
  item: InventoryItem
  checked: boolean
  onToggle: (on: boolean) => void
  onChanged: () => void
}) {
  const to = `/inventory/${encodeURIComponent(item.assetTag)}`
  const [showQr, setShowQr] = useState(false)
  const [editing, setEditing] = useState(false)
  const toast = useToast()
  const { effectiveRoles } = useAuth()
  const isAdmin = effectiveRoles.includes('admin')
  return (
    <div
      className={`${ROW_GRID} flex flex-col gap-2.5 rounded-xl border border-black/10 bg-black/[0.02] p-3 dark:border-white/10 dark:bg-white/[0.03] md:rounded-none md:border-0 md:border-b md:border-black/5 md:bg-transparent md:p-0 md:py-2 md:last:border-0 md:dark:border-white/5 md:dark:bg-transparent`}
    >
      <div className="flex items-start gap-3 md:contents">
        <input
          type="checkbox"
          aria-label={`Select ${item.assetTag}`}
          checked={checked}
          onChange={(e) => onToggle(e.target.checked)}
          className="mt-1 h-5 w-5 md:mt-0 md:h-auto md:w-auto"
        />
        <button
          type="button"
          onClick={() => setShowQr(true)}
          aria-label={`Show the QR code for ${item.assetTag}`}
          className="shrink-0 cursor-zoom-in rounded"
        >
          <QrImage value={itemPayload(item)} label={item.assetTag} size={52} />
        </button>
        {showQr && (
          <QrPopup item={item} onClose={() => setShowQr(false)}>
            <Link to={to} className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700">
              Open item
            </Link>
          </QrPopup>
        )}
        <div className="flex min-w-0 flex-1 flex-col md:contents">
          <Link to={to} className="truncate font-semibold text-brand-600 dark:text-brand-400 md:font-medium">
            {item.assetTag}
          </Link>
          <span className="min-w-0 break-words text-sm md:truncate">
            {item.name}
            {item.category && <span className="text-gray-500 dark:text-gray-400"> · {item.category}</span>}
          </span>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 md:contents">
        <ConditionSelect item={item} onChanged={onChanged} />
        <span>
          <Badge tone={STATUS_TONE[item.status]}>{STATUS_LABEL[item.status]}</Badge>
        </span>
      </div>
      <span className="flex flex-wrap items-center gap-2 border-t border-black/5 pt-2.5 dark:border-white/10 md:justify-end md:gap-1.5 md:border-0 md:pt-0">
        {isAdmin && (
          <Button size="sm" onClick={() => setEditing(true)}>
            Edit
          </Button>
        )}
        <AssignControl item={item} onChanged={onChanged} />
      </span>
      {editing && (
        <ItemEditDialog
          item={item}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false)
            onChanged()
            toast.success(`${item.assetTag} updated`)
          }}
          onDeleted={() => {
            setEditing(false)
            onChanged()
            toast.success(`${item.assetTag} deleted`)
          }}
        />
      )}
    </div>
  )
}

function PersonFolder({
  group,
  selected,
  setSelected,
  onChanged,
  defaultOpen,
}: {
  group: Group
  selected: string[]
  setSelected: Dispatch<SetStateAction<string[]>>
  onChanged: () => void
  defaultOpen: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const ids = group.items.map((i) => i.id)
  const allSelected = ids.length > 0 && ids.every((id) => selected.includes(id))
  const unassigned = group.key === '__unassigned'
  const due = group.items.filter((i) => !i.checkedThisMonth && i.status !== 'retired' && i.status !== 'lost').length
  return (
    <div className="rounded-xl border border-black/10 bg-black/[0.02] dark:border-white/10 dark:bg-white/[0.03]">
      <div className="flex items-center gap-3 px-3 py-2.5">
        <input
          type="checkbox"
          aria-label={`Select all items for ${group.label}`}
          checked={allSelected}
          onChange={(e) =>
            setSelected((prev) => (e.target.checked ? [...new Set([...prev, ...ids])] : prev.filter((x) => !ids.includes(x))))
          }
        />
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex flex-1 items-center gap-3 text-left">
          <span
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
              unassigned ? 'bg-gray-500/20 text-gray-600 dark:text-gray-300' : 'bg-brand-500/20 text-brand-700 dark:text-brand-300'
            }`}
          >
            {unassigned ? '▣' : group.label.charAt(0).toUpperCase()}
          </span>
          <span className="flex-1 font-semibold text-gray-900 dark:text-gray-100">
            {group.label}
            <span className="ml-2 font-normal text-gray-500 dark:text-gray-400">
              {group.items.length} item{group.items.length === 1 ? '' : 's'}
            </span>
            {due > 0 && <span className="ml-2 text-xs font-normal text-amber-500">{due} to check</span>}
          </span>
          <span className={`text-gray-500 transition-transform ${open ? 'rotate-90' : ''}`} aria-hidden>
            ›
          </span>
        </button>
      </div>
      {open && (
        <div className="space-y-2 border-t border-black/10 p-2 text-sm text-gray-800 dark:border-white/10 dark:text-gray-200 md:space-y-0 md:overflow-x-auto md:px-3 md:py-0">
          {group.items.map((i) => (
            <ItemRow
              key={i.id}
              item={i}
              checked={selected.includes(i.id)}
              onToggle={(on) => setSelected((prev) => (on ? [...prev, i.id] : prev.filter((x) => x !== i.id)))}
              onChanged={onChanged}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [printing, setPrinting] = useState(false)
  const [filter, setFilter] = useState('')
  const [grouped, setGrouped] = useState(false)
  const [dueOnly, setDueOnly] = useState(false)
  const [tab, setTab] = useState('items')

  const load = useCallback(() => {
    api
      .get<InventoryItem[]>('/hr/inventory')
      .then(setItems)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load the inventory'))
  }, [])
  useEffect(load, [load])

  // Lost and retired items are not part of the monthly check.
  const checkable = useMemo(() => (items ?? []).filter((i) => i.status !== 'lost' && i.status !== 'retired'), [items])
  const checkedCount = checkable.filter((i) => i.checkedThisMonth).length

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase()
    return (items ?? []).filter((i) => {
      if (dueOnly && (i.checkedThisMonth || i.status === 'lost' || i.status === 'retired')) return false
      if (!q) return true
      return [i.assetTag, i.name, i.category, i.serialNumber, i.assignedToName].some((v) => v?.toLowerCase().includes(q))
    })
  }, [items, filter, dueOnly])

  // Unassigned first, then one folder per holder (A-Z).
  const groups = useMemo<Group[]>(() => {
    const byHolder = new Map<string, InventoryItem[]>()
    const unassigned: InventoryItem[] = []
    for (const i of shown) {
      if (i.assignedToName) byHolder.set(i.assignedToName, [...(byHolder.get(i.assignedToName) ?? []), i])
      else unassigned.push(i)
    }
    const people = [...byHolder.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, list]) => ({ key: name, label: name, items: list }))
    return unassigned.length > 0 ? [{ key: '__unassigned', label: 'Unassigned', items: unassigned }, ...people] : people
  }, [shown])

  if (error) return <ErrorState message={error} />

  if (printing && items) {
    return <StickerSheet items={items.filter((i) => selected.includes(i.id))} onClose={() => setPrinting(false)} />
  }

  const allShownSelected = shown.length > 0 && shown.every((i) => selected.includes(i.id))
  const monthName = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'Asia/Manila' })
  const pct = checkable.length ? Math.round((checkedCount / checkable.length) * 100) : 0

  return (
    <div>
      <PageHeader title="Inventory" description="Company items. Each item has one holder; one person can hold many." />
      <Tabs
        id="inventory"
        active={tab}
        onChange={setTab}
        tabs={[
          {
            id: 'items',
            label: 'Items',
            badge: checkable.length - checkedCount,
            content: (
              <>
          {items && checkable.length > 0 && (
            <div className="mb-4 rounded-xl border border-black/10 bg-black/[0.02] p-3 dark:border-white/10 dark:bg-white/[0.03]">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="font-medium text-gray-900 dark:text-gray-100">
                  {monthName} condition check
                  <span className="ml-2 font-normal text-gray-500 dark:text-gray-400">
                    {checkedCount} of {checkable.length} checked
                  </span>
                </span>
                <label className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                  <input type="checkbox" checked={dueOnly} onChange={(e) => setDueOnly(e.target.checked)} />
                  Only items still to check
                </label>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
              </div>
            </div>
          )}
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Search tag, name, holder…"
              className="field max-w-xs"
            />
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                <input type="checkbox" checked={grouped} onChange={(e) => setGrouped(e.target.checked)} />
                Group by person
              </label>
              <Button size="sm" onClick={() => setTab('scan')}>
                Scan QR
              </Button>
              <Button variant="primary" size="sm" disabled={selected.length === 0} onClick={() => setPrinting(true)}>
                Print QR stickers ({selected.length})
              </Button>
            </div>
          </div>
          {items && shown.length === 0 && <EmptyState label={dueOnly ? 'Everything is checked for this month.' : 'No items.'} />}
          {shown.length > 0 && (
            <div className={grouped ? '' : 'md:overflow-x-auto'}>
              <div
                className={`mb-2 flex items-center gap-3 rounded-lg bg-black/[0.04] px-3 py-2 text-xs font-medium uppercase tracking-wide text-gray-500 dark:bg-white/[0.05] dark:text-gray-400 ${
                  grouped ? '' : 'md:grid md:grid-cols-[1.25rem_3rem_6.5rem_minmax(9rem,1fr)_10rem_6.5rem_9rem] md:gap-x-3 md:min-w-[52rem]'
                }`}
              >
                <input
                  type="checkbox"
                  aria-label="Select all items"
                  checked={allShownSelected}
                  onChange={(e) => setSelected(e.target.checked ? shown.map((i) => i.id) : [])}
                  className="h-5 w-5 md:h-auto md:w-auto"
                />
                <span className="normal-case md:hidden">
                  {allShownSelected ? 'All selected' : `Select all (${shown.length})`}
                  {selected.length > 0 && !allShownSelected ? ` · ${selected.length} selected` : ''}
                </span>
                {grouped ? (
                  <span className="hidden normal-case md:inline">
                    {allShownSelected ? 'All selected' : `Select all (${shown.length})`}
                    {selected.length > 0 && !allShownSelected ? ` · ${selected.length} selected` : ''}
                  </span>
                ) : (
                  <>
                    <span className="hidden md:block">QR</span>
                    <span className="hidden md:block">Tag</span>
                    <span className="hidden md:block">Item</span>
                    <span className="hidden md:block">Condition</span>
                    <span className="hidden md:block">Status</span>
                    <span className="hidden md:block" />
                  </>
                )}
              </div>
          {grouped && (
            <div className="space-y-2">
              {groups.map((g) => (
                <PersonFolder
                  key={g.key}
                  group={g}
                  selected={selected}
                  setSelected={setSelected}
                  onChanged={load}
                  defaultOpen={g.key === '__unassigned' || groups.length <= 3 || filter.trim() !== ''}
                />
              ))}
            </div>
          )}
          {!grouped && (
            <div className="space-y-2 text-sm text-gray-800 dark:text-gray-200 md:space-y-0">
              {shown.map((i) => (
                <ItemRow
                  key={i.id}
                  item={i}
                  checked={selected.includes(i.id)}
                  onToggle={(on) => setSelected((prev) => (on ? [...prev, i.id] : prev.filter((x) => x !== i.id)))}
                  onChanged={load}
                />
              ))}
            </div>
          )}
            </div>
          )}
              </>
            ),
          },
          { id: 'add', label: 'Add an item', content: <AddItemForm onAdded={load} /> },
          { id: 'scan', label: 'Scan QR', content: <ScanTab /> },
        ]}
      />
    </div>
  )
}
