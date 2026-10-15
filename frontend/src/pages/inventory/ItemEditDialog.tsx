import { useState, type FormEvent } from 'react'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { Field, FormError } from '../../components/ui/Field'
import { api, ApiError } from '../../services/api'
import { STATUS_LABEL, type InventoryItem } from './types'

// Admin only: change an item's details or delete it (a soft delete: it
// disappears from the portal, the record stays in the database).
// The asset tag is shown but not editable, because it is what the printed
// QR sticker points to.
const EDITABLE_STATUSES: InventoryItem['status'][] = ['available', 'repair', 'lost', 'retired']

export function ItemEditDialog({
  item,
  onClose,
  onSaved,
  onDeleted,
}: {
  item: InventoryItem
  onClose: () => void
  onSaved: () => void
  onDeleted: () => void
}) {
  const [name, setName] = useState(item.name)
  const [category, setCategory] = useState(item.category ?? '')
  const [serial, setSerial] = useState(item.serialNumber ?? '')
  const [brandModel, setBrandModel] = useState(item.brandModel ?? '')
  const [purchaseDate, setPurchaseDate] = useState(item.purchaseDate ? item.purchaseDate.slice(0, 10) : '')
  const [notes, setNotes] = useState(item.notes ?? '')
  const [status, setStatus] = useState(item.status)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const assigned = !!item.assignedToId

  async function save(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api.put(`/hr/inventory/${item.id}`, {
        name,
        category: category.trim() || null,
        serialNumber: serial.trim() || null,
        brandModel: brandModel.trim() || null,
        purchaseDate: purchaseDate || null,
        notes: notes.trim() || null,
        // Status can't change while someone holds the item (it is "assigned").
        ...(!assigned && status !== item.status && { status }),
      })
      onSaved()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the item')
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!window.confirm(`Delete ${item.assetTag} (${item.name})? It will be hidden from the portal.`)) return
    setBusy(true)
    setError(null)
    try {
      await api.delete(`/hr/inventory/${item.id}`)
      onDeleted()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not delete the item')
      setBusy(false)
    }
  }

  return (
    <Modal label={`Edit ${item.assetTag}`} onClose={onClose} className="max-w-2xl">
      <form onSubmit={save} className="space-y-3">
        <h2 className="text-lg font-semibold">Edit item</h2>
        <div className="grid gap-3 sm:grid-cols-6">
          <div className="sm:col-span-2">
            <Field label="Asset ID">
              <p className="field flex items-center font-semibold text-gray-800 dark:text-gray-200" title="The printed sticker points to this, so it can't be changed">
                {item.assetTag}
              </p>
            </Field>
          </div>
          <div className="sm:col-span-4">
            <Field label="Item description">
              <input required value={name} onChange={(e) => setName(e.target.value)} className="field" />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Brand / model">
              <input value={brandModel} onChange={(e) => setBrandModel(e.target.value)} className="field" />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Serial number">
              <input value={serial} onChange={(e) => setSerial(e.target.value)} className="field" />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Date of purchase">
              <input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} className="field" />
            </Field>
          </div>
          <div className="sm:col-span-3">
            <Field label="Category (optional)">
              <input value={category} onChange={(e) => setCategory(e.target.value)} className="field" />
            </Field>
          </div>
          <div className="sm:col-span-3">
            <Field label="Status">
              {assigned ? (
                <p className="field flex items-center text-sm text-gray-500">{STATUS_LABEL.assigned} (return it first to change)</p>
              ) : (
                <select value={status} onChange={(e) => setStatus(e.target.value as InventoryItem['status'])} className="field">
                  {EDITABLE_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          </div>
        </div>
        <Field label="Notes">
          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className="field" />
        </Field>
        <FormError message={error} />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button type="button" onClick={remove} disabled={busy} className="!border-red-500/50 !text-red-600 dark:!text-red-400">
            Delete item
          </Button>
          <div className="flex gap-2">
            <Button type="button" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  )
}
