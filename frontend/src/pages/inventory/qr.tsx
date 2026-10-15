import QRCode from 'qrcode'
import { useEffect, useState } from 'react'

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
