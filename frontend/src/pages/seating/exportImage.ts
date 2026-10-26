import { portText, rowLetter, seatAt, seatLabel, type Plan } from './plan'

// Draws the plan onto a canvas so it can be shown as a preview and saved as a PNG. Done by hand (no screenshot library): the image
// is always the same light, printable look whatever theme the portal is in.

const CELL_W = 156
const CELL_H = 76
const GAP = 12
const PAD = 28
const LABEL_W = 78
const HEADER_H = 64
const SCALE = 2
const FONT = 'Inter, system-ui, -apple-system, Segoe UI, sans-serif'

function fit(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text
  let t = text
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1)
  return `${t}…`
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

export function drawPlan(canvas: HTMLCanvasElement, plan: Plan, showPorts: boolean) {
  const width = PAD * 2 + LABEL_W + plan.cols * CELL_W + (plan.cols - 1) * GAP
  const height = PAD * 2 + HEADER_H + plan.rows * CELL_H + (plan.rows - 1) * GAP
  canvas.width = width * SCALE
  canvas.height = height * SCALE
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.scale(SCALE, SCALE)

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)

  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = '#12281c'
  ctx.font = `700 22px ${FONT}`
  ctx.fillText(fit(ctx, plan.title || 'Seating plan', width - PAD * 2 - 200), PAD, PAD + 22)
  ctx.fillStyle = '#4d6a59'
  ctx.font = `400 13px ${FONT}`
  const date = new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
  ctx.textAlign = 'right'
  ctx.fillText(date, width - PAD, PAD + 22)
  ctx.textAlign = 'left'

  for (let r = 0; r < plan.rows; r++) {
    const y = PAD + HEADER_H + r * (CELL_H + GAP)
    ctx.fillStyle = '#4d6a59'
    ctx.font = `700 13px ${FONT}`
    ctx.fillText(`ROW ${rowLetter(r)}`, PAD, y + CELL_H / 2 + 5)

    for (let c = 0; c < plan.cols; c++) {
      const x = PAD + LABEL_W + c * (CELL_W + GAP)
      const seat = seatAt(plan, r, c)
      const name = seat.name.trim()
      const hasPort = seat.port.trim() !== ''

      roundRect(ctx, x, y, CELL_W, CELL_H, 10)
      ctx.fillStyle = name ? '#d9f0e2' : '#ffffff'
      ctx.fill()
      ctx.lineWidth = 1.5
      ctx.strokeStyle = name ? '#6bb98d' : '#9bb8a6'
      ctx.setLineDash(name ? [] : [5, 4])
      ctx.stroke()
      ctx.setLineDash([])

      ctx.fillStyle = '#12281c'
      ctx.font = `700 13px ${FONT}`
      ctx.fillText(seatLabel(r, c), x + 12, y + 24)

      if (showPorts) {
        const label = portText(seat)
        ctx.font = `700 11px ${FONT}`
        const w = ctx.measureText(label).width + 14
        roundRect(ctx, x + CELL_W - w - 10, y + 10, w, 20, 10)
        ctx.fillStyle = hasPort ? '#ffffff' : '#fde7cc'
        ctx.fill()
        ctx.strokeStyle = hasPort ? '#9bb8a6' : '#fde7cc'
        ctx.lineWidth = 1
        ctx.stroke()
        ctx.fillStyle = hasPort ? '#2b4a39' : '#8a4b06'
        ctx.fillText(label, x + CELL_W - w - 3, y + 24)
      }

      ctx.font = name ? `600 15px ${FONT}` : `italic 400 14px ${FONT}`
      ctx.fillStyle = name ? '#12281c' : '#4d6a59'
      ctx.fillText(fit(ctx, name || 'Open', CELL_W - 24), x + 12, y + 56)
    }
  }
}

export function downloadPng(canvas: HTMLCanvasElement, fileName: string) {
  canvas.toBlob((blob) => {
    if (!blob) return
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    a.click()
    URL.revokeObjectURL(url)
  }, 'image/png')
}
