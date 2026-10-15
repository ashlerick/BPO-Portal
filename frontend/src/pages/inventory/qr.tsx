import QRCode from 'qrcode'
import { useEffect, useState } from 'react'

// Where a sticker's QR code points: the portal's own address.
export function portalBase(): string {
  return `${window.location.origin}${import.meta.env.BASE_URL}`.replace(/\/+$/, '')
}

export function itemUrl(assetTag: string, base = portalBase()): string {
  return `${base}/inventory/${encodeURIComponent(assetTag)}`
}

// A QR code for an asset tag that redraws whenever the tag changes.
export function QrImage({ assetTag, size, className }: { assetTag: string; size: number; className?: string }) {
  const [src, setSrc] = useState('')
  useEffect(() => {
    let cancelled = false
    if (!assetTag) {
      setSrc('')
      return
    }
    QRCode.toDataURL(itemUrl(assetTag), { margin: 1, width: size * 2 })
      .then((url) => !cancelled && setSrc(url))
      .catch(() => !cancelled && setSrc(''))
    return () => {
      cancelled = true
    }
  }, [assetTag, size])
  return (
    <span
      className={`inline-block shrink-0 overflow-hidden rounded bg-white ${className ?? ''}`}
      style={{ width: size, height: size }}
    >
      {src && <img src={src} alt={`QR code for ${assetTag}`} width={size} height={size} />}
    </span>
  )
}
