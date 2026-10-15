import jsQR from 'jsqr'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { useToast } from '../../components/ui/Toast'
import { api, ApiError } from '../../services/api'
import {
  CONDITION_LABEL,
  CONDITION_TONE,
  STATUS_LABEL,
  STATUS_TONE,
  type InventoryItem,
} from './types'

// Scan an item's QR sticker with the camera (or from a photo) and see what
// it holds as a table. The sticker carries {assetTag, name, category,
// serialNumber, url}; the live record is looked up by tag so the table
// also shows its current status, holder and condition.

interface Payload {
  assetTag?: string
  name?: string
  category?: string
  serialNumber?: string
  brandModel?: string
  purchaseDate?: string
  url?: string
}

interface ScanRow {
  key: number
  at: Date
  raw: string
  payload: Payload | null
  // The live record, if the tag matches an item this person may see.
  item: InventoryItem | null
  lookup: 'found' | 'not_found' | 'not_inventory'
}

const timeFmt = new Intl.DateTimeFormat('en-US', { timeStyle: 'medium', timeZone: 'Asia/Manila' })

// What a sticker's text means: our JSON, or a bare link to an item page.
function parsePayload(text: string): Payload | null {
  try {
    const value: unknown = JSON.parse(text)
    if (value && typeof value === 'object' && 'assetTag' in value) return value as Payload
  } catch {
    // not JSON, try a link
  }
  const m = text.match(/\/inventory\/([^/?#\s]+)/)
  if (m) return { assetTag: decodeURIComponent(m[1]), url: text }
  return null
}

export function ScanTab({ autoStart = false }: { autoStart?: boolean }) {
  const toast = useToast()
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const lastRef = useRef<{ text: string; at: number }>({ text: '', at: 0 })
  const nextKey = useRef(1)
  const [active, setActive] = useState(autoStart)
  const [cameraError, setCameraError] = useState<string | null>(null)
  // One scan at a time: the camera stops once it reads a code.
  const [result, setResult] = useState<ScanRow | null>(null)
  const [pasted, setPasted] = useState('')

  const handleText = useCallback(
    async (raw: string) => {
      // The camera loop can fire again before it has stopped: take only one.
      const now = Date.now()
      if (now - lastRef.current.at < 1500) return
      lastRef.current = { text: raw, at: now }
      setActive(false)

      const payload = parsePayload(raw)
      const key = nextKey.current++
      if (!payload?.assetTag) {
        setResult({ key, at: new Date(), raw, payload: null, item: null, lookup: 'not_inventory' })
        toast.info('That QR code is not an inventory sticker')
        return
      }
      let item: InventoryItem | null = null
      let lookup: ScanRow['lookup'] = 'found'
      try {
        item = await api.get<InventoryItem>(`/hr/inventory/${encodeURIComponent(payload.assetTag)}`)
      } catch (err) {
        lookup = 'not_found'
        if (!(err instanceof ApiError && (err.status === 404 || err.status === 403))) {
          toast.error('Could not look the item up. Showing what the sticker holds.')
        }
      }
      setResult({ key, at: new Date(), raw, payload, item, lookup })
    },
    [toast],
  )

  const handleRef = useRef(handleText)
  useEffect(() => {
    handleRef.current = handleText
  }, [handleText])

  // The camera loop: draw a frame, look for a QR code, repeat.
  useEffect(() => {
    if (!active) return
    let stopped = false
    let timer = 0

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
        if (stopped) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        const video = videoRef.current
        if (!video) return
        video.srcObject = stream
        await video.play()
        setCameraError(null)
        const tick = () => {
          if (stopped) return
          const v = videoRef.current
          const c = canvasRef.current
          if (v && c && v.readyState === v.HAVE_ENOUGH_DATA && v.videoWidth > 0) {
            const scale = Math.min(1, 720 / v.videoWidth)
            c.width = Math.round(v.videoWidth * scale)
            c.height = Math.round(v.videoHeight * scale)
            const ctx = c.getContext('2d', { willReadFrequently: true })
            if (ctx) {
              ctx.drawImage(v, 0, 0, c.width, c.height)
              const img = ctx.getImageData(0, 0, c.width, c.height)
              const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'attemptBoth' })
              if (code?.data) void handleRef.current(code.data)
            }
          }
          timer = window.setTimeout(tick, 150)
        }
        tick()
      } catch (err) {
        const name = err instanceof DOMException ? err.name : ''
        setCameraError(
          name === 'NotAllowedError'
            ? 'Camera access was blocked. Allow the camera for this site in your browser settings, then press Start again.'
            : name === 'NotFoundError'
              ? 'No camera was found on this device. You can scan from a photo below instead.'
              : 'The camera could not be started. You can scan from a photo below instead.',
        )
        setActive(false)
      }
    }
    void start()

    return () => {
      stopped = true
      window.clearTimeout(timer)
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }, [active])

  // Scan a saved photo or screenshot of a sticker.
  async function scanFile(file: File | undefined) {
    if (!file) return
    const url = URL.createObjectURL(file)
    try {
      const img = new Image()
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = () => reject(new Error('load'))
        img.src = url
      })
      const c = document.createElement('canvas')
      const scale = Math.min(1, 1600 / Math.max(img.width, img.height))
      c.width = Math.round(img.width * scale)
      c.height = Math.round(img.height * scale)
      const ctx = c.getContext('2d', { willReadFrequently: true })
      if (!ctx) throw new Error('canvas')
      ctx.drawImage(img, 0, 0, c.width, c.height)
      const data = ctx.getImageData(0, 0, c.width, c.height)
      const code = jsQR(data.data, data.width, data.height, { inversionAttempts: 'attemptBoth' })
      if (code?.data) await handleText(code.data)
      else toast.error('No QR code was found in that image. Try a closer, sharper photo.')
    } catch {
      toast.error('That file could not be read as an image')
    } finally {
      URL.revokeObjectURL(url)
    }
  }

  const latest = result

  function scanAnother() {
    setResult(null)
    lastRef.current = { text: '', at: 0 }
    setActive(true)
  }

  // The live record wins over what the sticker says, so a corrected item
  // shows its current details even if the printed sticker is older.
  const live = latest?.item ?? null
  const p = latest?.payload ?? null
  const shown = {
    assetTag: live?.assetTag ?? p?.assetTag,
    name: live?.name ?? p?.name,
    brandModel: live?.brandModel ?? p?.brandModel,
    serialNumber: live?.serialNumber ?? p?.serialNumber,
    purchaseDate: live?.purchaseDate ? live.purchaseDate.slice(0, 10) : p?.purchaseDate,
    category: live?.category ?? p?.category,
  }

  return (
    <div className="mx-auto max-w-md space-y-3">
      <div className="relative aspect-square w-full overflow-hidden rounded-xl border border-black/10 bg-black/60 dark:border-white/10">
        <video ref={videoRef} playsInline muted className={`h-full w-full object-cover ${active ? '' : 'hidden'}`} />
        {!active && (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-4 text-center text-sm text-gray-300">
            <span>Point the camera at an item's QR sticker. The details open in a pop-up.</span>
            <Button variant="primary" onClick={scanAnother}>
              Start camera
            </Button>
          </div>
        )}
        {active && <span className="pointer-events-none absolute inset-8 rounded-lg border-2 border-emerald-400/80" aria-hidden="true" />}
      </div>
      <canvas ref={canvasRef} className="hidden" />
      {active && (
        <Button onClick={() => setActive(false)} className="w-full">
          Stop camera
        </Button>
      )}
      {cameraError && <p className="text-sm text-red-600 dark:text-red-400">{cameraError}</p>}

      <div className="space-y-2 rounded-lg border border-dashed border-black/20 p-3 dark:border-white/20">
        <p className="text-xs text-gray-600 dark:text-gray-400">No camera? Scan from a photo or paste the code's text.</p>
        <input
          type="file"
          accept="image/*"
          onChange={(e) => {
            void scanFile(e.target.files?.[0])
            e.target.value = ''
          }}
          className="block w-full text-xs text-gray-600 file:mr-2 file:rounded-md file:border file:border-brand-600/40 file:bg-brand-600/10 file:px-2 file:py-1 file:text-xs file:font-medium file:text-brand-700 dark:text-gray-300 dark:file:text-brand-300"
          aria-label="Scan from a photo"
        />
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (pasted.trim()) void handleText(pasted.trim())
            setPasted('')
          }}
        >
          <input
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            placeholder='{"assetTag":"EQ-0001", …}'
            className="field !py-1.5 text-xs"
            aria-label="Paste QR text"
          />
          <Button type="submit" size="sm" disabled={!pasted.trim()}>
            Read
          </Button>
        </form>
      </div>

      {latest && (
        <Modal label="Scanned item" onClose={() => setResult(null)}>
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Scanned item</h2>
            <span className="text-xs text-gray-500 dark:text-gray-400">{timeFmt.format(latest.at)}</span>
          </div>
          <div className="overflow-hidden rounded-lg border border-black/10 dark:border-white/10">
            <table className="w-full text-left text-sm">
              <tbody className="divide-y divide-black/5 dark:divide-white/10">
                {latest.payload ? (
                  <>
                    <DetailRow label="Asset ID" value={shown.assetTag} strong />
                    <DetailRow label="Item description" value={shown.name} />
                    <DetailRow label="Brand / model" value={shown.brandModel ?? undefined} />
                    <DetailRow label="Serial number" value={shown.serialNumber ?? undefined} />
                    <DetailRow label="Date of purchase" value={shown.purchaseDate ?? undefined} />
                    <DetailRow label="Category" value={shown.category ?? undefined} />
                    <tr>
                      <th className="w-36 bg-black/[0.03] px-3 py-2 text-xs font-medium uppercase tracking-wide text-gray-500 dark:bg-white/[0.04] dark:text-gray-400">
                        Right now
                      </th>
                      <td className="px-3 py-2">
                        {live ? (
                          <span className="flex flex-wrap items-center gap-2">
                            <Badge tone={STATUS_TONE[live.status]}>{STATUS_LABEL[live.status]}</Badge>
                            <span>{live.assignedToName ? `Held by ${live.assignedToName}` : 'In storage'}</span>
                            {live.condition && <Badge tone={CONDITION_TONE[live.condition]}>{CONDITION_LABEL[live.condition]}</Badge>}
                          </span>
                        ) : (
                          <span className="text-amber-600 dark:text-amber-400">
                            Not found in the inventory (it may be deleted, or not yours to see).
                          </span>
                        )}
                      </td>
                    </tr>
                  </>
                ) : (
                  <DetailRow label="Not an inventory sticker" value={latest.raw} />
                )}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <Button onClick={() => setResult(null)}>Close</Button>
            {live && (
              <Link
                to={`/inventory/${encodeURIComponent(live.assetTag)}`}
                className="inline-flex items-center rounded-lg border border-black/15 px-3 py-1.5 text-sm font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
              >
                Open item
              </Link>
            )}
            <Button variant="primary" onClick={scanAnother}>
              Scan another
            </Button>
          </div>
        </Modal>
      )}
    </div>
  )
}

function DetailRow({ label, value, strong }: { label: string; value?: string; strong?: boolean }) {
  return (
    <tr>
      <th className="w-40 bg-black/[0.03] px-3 py-2 text-xs font-medium uppercase tracking-wide text-gray-500 dark:bg-white/[0.04] dark:text-gray-400">
        {label}
      </th>
      <td className={`break-all px-3 py-2 ${strong ? 'font-semibold' : ''}`}>{value || '—'}</td>
    </tr>
  )
}
