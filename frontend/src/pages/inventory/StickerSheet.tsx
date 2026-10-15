import QRCode from 'qrcode'
import { useEffect, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { Field } from '../../components/ui/Field'
import { itemPayload, portalBase } from './qr'
import type { InventoryItem } from './types'

// Printable property stickers, laid out like the company's label: logo and
// "Company property, do not remove" across the top, then Asset ID / Item
// description, Brand / model / Serial number / Date of purchase, a
// "Property of" bar at the bottom, and the QR code. The QR holds the item's
// fields as JSON plus the portal address. The base address is editable
// because the production domain may not be final when stickers are made.

const COMPANY = 'JAE PHILUS OPC'
const COMPANY_SUB = 'PHILUS BPO SERVICES'

// 10/05/2026, as printed on the label.
function labelDate(iso: string | null): string {
  if (!iso) return ''
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${m}/${d}/${y}`
}

function Cell({ label, value, className = '' }: { label: string; value: string; className?: string }) {
  return (
    <div className={`min-w-0 px-2.5 py-1.5 ${className}`}>
      <div className="text-[9px] font-medium uppercase tracking-wide text-gray-600">{label}</div>
      <div className="break-words text-sm font-extrabold leading-tight text-black">{value || ' '}</div>
    </div>
  )
}

function Sticker({ item, qr }: { item: InventoryItem; qr: string | undefined }) {
  return (
    <div className="break-inside-avoid overflow-hidden rounded-md border border-gray-400 bg-white text-black">
      {/* top: logo + property notice */}
      <div className="flex items-stretch border-b border-gray-400">
        <div className="flex min-w-0 flex-1 items-center gap-2 px-2.5 py-2">
          <img src={`${import.meta.env.BASE_URL}favicon.png`} alt="" className="h-9 w-9 shrink-0" />
          <div className="min-w-0 leading-tight">
            <div className="truncate text-sm font-extrabold tracking-wide text-amber-900">{COMPANY}</div>
            <div className="truncate text-[8px] font-semibold tracking-[0.25em] text-amber-900/80">{COMPANY_SUB}</div>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-center justify-center rounded-bl-2xl bg-[#b83c28] px-3 text-center text-white">
          <span className="text-[11px] font-extrabold uppercase leading-tight">Company property</span>
          <span className="text-[9px] uppercase tracking-widest">Do not remove</span>
        </div>
      </div>

      {/* fields + QR */}
      <div className="flex">
        <div className="min-w-0 flex-1">
          <div className="grid grid-cols-[minmax(0,5.5rem)_minmax(0,1fr)] border-b border-gray-400">
            <Cell label="Asset ID" value={item.assetTag} className="border-r border-gray-400" />
            <Cell label="Item description" value={item.name} />
          </div>
          <div className="grid grid-cols-3 border-b border-gray-400">
            <Cell label="Brand / model" value={item.brandModel ?? ''} className="border-r border-gray-400" />
            <Cell label="Serial number" value={item.serialNumber ?? ''} className="border-r border-gray-400" />
            <Cell label="Date of purchase" value={labelDate(item.purchaseDate)} />
          </div>
        </div>
        <div className="flex w-24 shrink-0 items-center justify-center border-l border-gray-400 p-1.5">
          {qr ? <img src={qr} alt={`QR code for ${item.assetTag}`} className="h-full w-full" /> : <div className="h-20 w-20" />}
        </div>
      </div>

      {/* bottom bar */}
      <div className="bg-[#b83c28] px-2 py-1 text-center text-[10px] font-bold uppercase tracking-[0.3em] text-white">
        Property of {COMPANY}
      </div>
    </div>
  )
}

export function StickerSheet({ items, onClose }: { items: InventoryItem[]; onClose: () => void }) {
  const [base, setBase] = useState(portalBase)
  const [codes, setCodes] = useState<Record<string, string>>({})

  useEffect(() => {
    let cancelled = false
    Promise.all(
      items.map(
        async (i) => [i.id, await QRCode.toDataURL(itemPayload(i, base), { margin: 1, width: 260 })] as const,
      ),
    ).then((pairs) => {
      if (!cancelled) setCodes(Object.fromEntries(pairs))
    })
    return () => {
      cancelled = true
    }
  }, [items, base])

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-3 print:hidden">
        <div className="min-w-[14rem] flex-1">
          <Field label="Portal address the QR codes open">
            <input value={base} onChange={(e) => setBase(e.target.value.trim())} className="field" />
          </Field>
        </div>
        <Button variant="primary" onClick={() => window.print()}>
          Print {items.length} sticker{items.length === 1 ? '' : 's'}
        </Button>
        <Button onClick={onClose}>Back</Button>
      </div>
      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 print:grid-cols-2">
        {items.map((i) => (
          <li key={i.id}>
            <Sticker item={i} qr={codes[i.id]} />
          </li>
        ))}
      </ul>
    </div>
  )
}
