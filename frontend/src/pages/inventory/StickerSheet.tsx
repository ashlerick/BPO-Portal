import QRCode from 'qrcode'
import { useEffect, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { Field } from '../../components/ui/Field'
import type { InventoryItem } from './types'

// Printable QR stickers. Each code opens /inventory/<assetTag> on the
// portal. The base address is editable because the production domain may
// not be final when stickers are designed: set it before printing.
export function StickerSheet({ items, onClose }: { items: InventoryItem[]; onClose: () => void }) {
  const [base, setBase] = useState(() => `${window.location.origin}${import.meta.env.BASE_URL}`.replace(/\/+$/, ''))
  const [codes, setCodes] = useState<Record<string, string>>({})

  useEffect(() => {
    let cancelled = false
    Promise.all(
      items.map(
        async (i) =>
          [i.id, await QRCode.toDataURL(`${base}/inventory/${encodeURIComponent(i.assetTag)}`, { margin: 1, width: 220 })] as const,
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
        <div className="min-w-[18rem] flex-1">
          <Field label="Portal address the QR codes open">
            <input value={base} onChange={(e) => setBase(e.target.value.trim())} className="field" />
          </Field>
        </div>
        <Button variant="primary" onClick={() => window.print()}>
          Print {items.length} sticker{items.length === 1 ? '' : 's'}
        </Button>
        <Button onClick={onClose}>Back</Button>
      </div>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 print:grid-cols-4">
        {items.map((i) => (
          <li key={i.id} className="break-inside-avoid rounded-md border border-black/20 bg-white p-2 text-center text-black">
            {codes[i.id] ? (
              <img src={codes[i.id]} alt={`QR code for ${i.assetTag}`} className="mx-auto h-32 w-32" />
            ) : (
              <div className="mx-auto h-32 w-32" />
            )}
            <p className="mt-1 text-sm font-bold tracking-wide">{i.assetTag}</p>
            <p className="truncate text-xs">{i.name}</p>
          </li>
        ))}
      </ul>
    </div>
  )
}
