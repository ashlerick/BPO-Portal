import QRCode from 'qrcode'
import { useEffect, useState, type ReactNode } from 'react'
import { Modal } from '../../components/ui/Modal'

// Where a sticker's QR code points: the portal's own address.
export function portalBase(): string {
  return `${window.location.origin}${import.meta.env.BASE_URL}`.replace(/\/+$/, '')
}

export function itemUrl(assetTag: string, base = portalBase()): string {
  return `${base}/inventory/${encodeURIComponent(assetTag)}`
}

interface QrFields {
  assetTag: string
  name?: string | null
  category?: string | null
  serialNumber?: string | null
}

// What a sticker's QR code holds: the item's fields as JSON (empty ones left
// out), plus the portal address of its page.
export function itemPayload(item: QrFields, base = portalBase()): string {
  if (!item.assetTag) return ''
  return JSON.stringify({
    assetTag: item.assetTag,
    ...(item.name && { name: item.name }),
    ...(item.category && { category: item.category }),
    ...(item.serialNumber && { serialNumber: item.serialNumber }),
    url: itemUrl(item.assetTag, base),
  })
}

// A QR code that redraws whenever its content changes.
export function QrImage({ value, label, size, className }: { value: string; label: string; size: number; className?: string }) {
  const [src, setSrc] = useState('')
  useEffect(() => {
    let cancelled = false
    if (!value) {
      setSrc('')
      return
    }
    QRCode.toDataURL(value, { margin: 1, width: size * 2 })
      .then((url) => !cancelled && setSrc(url))
      .catch(() => !cancelled && setSrc(''))
    return () => {
      cancelled = true
    }
  }, [value, size])
  return (
    <span
      className={`inline-block shrink-0 overflow-hidden rounded bg-white ${className ?? ''}`}
      style={{ width: size, height: size }}
    >
      {src && <img src={src} alt={`QR code for ${label}`} width={size} height={size} />}
    </span>
  )
}

// A large QR code in a pop-up over the page. Nothing to lose here, so a
// click outside closes it as well as Escape and the Close button.
export function QrPopup({
  item,
  onClose,
  children,
}: {
  item: QrFields
  onClose: () => void
  children?: ReactNode
}) {
  return (
    <Modal label={`QR code for ${item.assetTag}`} onClose={onClose} closeOnBackdrop className="max-w-sm text-center">
      <QrImage value={itemPayload(item)} label={item.assetTag} size={280} className="mx-auto !block max-w-full" />
      <p className="mt-3 text-lg font-bold tracking-wide">{item.assetTag}</p>
      {item.name && <p className="text-sm text-gray-600 dark:text-gray-400">{item.name}</p>}
      <div className="mt-4 flex justify-center gap-2">
        {children}
        <button
          type="button"
          onClick={onClose}
          autoFocus
          className="rounded-lg border border-black/15 px-3 py-1.5 text-sm font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
        >
          Close
        </button>
      </div>
    </Modal>
  )
}
