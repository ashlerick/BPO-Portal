import QRCode from 'qrcode'
import { useEffect, useState, type ReactNode } from 'react'

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

// A large QR code in a pop-up over the page. Closes on Escape, a click
// outside the card, or the Close button.
export function QrPopup({
  item,
  onClose,
  children,
}: {
  item: QrFields
  onClose: () => void
  children?: ReactNode
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`QR code for ${item.assetTag}`}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl border border-black/10 bg-white p-5 text-center text-gray-900 shadow-2xl dark:border-white/10 dark:bg-gray-900 dark:text-gray-100"
      >
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
      </div>
    </div>
  )
}
