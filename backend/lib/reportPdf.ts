import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib'
import type { AccountingReportData } from './accountingReport.js'
import {
  FOA_ATTENDANCE_COLUMNS,
  FOA_ATTENDANCE_FLAGS,
  FOA_CHECKLIST_DAYS,
  FOA_CHECKLIST_TASKS,
  FOA_MAKE_UP_DAY,
  type FoaReportData,
} from './foaReport.js'
import { LOGO_ASPECT, LOGO_PNG_BASE64 } from './reportLogo.js'
import type { ReportData, ReportExportInput } from './reports.js'

// The report PDFs. They follow the Accounting weekly summary this replaces: the logo, the title with who reported and the period, a
// heading and rule for each section, money lists with the amounts on the right and bold totals, and the highlights in a box. The look is
// deliberately plain: black text on white, hairlines, and one green accent (see the palette below).
// One small layout engine (Sheet) draws all three report types, so a new type only has to say what its sections are.

const W = 612
const H = 792
const M = 42
const CW = W - 2 * M
const LEAD = 13

// One accent, green, used for the section headings, the rule under each, and the ticks. Everything else is black, grays and white, so the
// numbers and names are what stand out and the page stays easy to read and to print in black and white. Nothing is filled with a color.
const GREEN = rgb(0.078, 0.325, 0.176)
const INK = rgb(0.07, 0.07, 0.07)
const MUTED = rgb(0.32, 0.32, 0.32) // labels and small captions
const FAINT = rgb(0.45, 0.45, 0.45) // empty cells and "none this week"
const LINE = rgb(0.84, 0.84, 0.84) // hairlines between rows
const RULE = rgb(0.2, 0.2, 0.2) // heavier lines: under a table header, above a total
const BOX_EDGE = rgb(0.55, 0.55, 0.55)
const ZEBRA = rgb(0.965, 0.965, 0.965) // every other row, so the eye can follow a long row from name to amount
const CHIP = rgb(0.92, 0.92, 0.92) // the fill behind a territory name
const WHITE = rgb(1, 1, 1)
const FLAGS: readonly string[] = FOA_ATTENDANCE_FLAGS

const monthDay = (d: Date) => d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
const shortDay = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
const iso = (d: Date) => d.toISOString().slice(0, 10)
const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
const clean = (list: string[] | undefined) => (list ?? []).map((n) => n.trim()).filter((n) => n && n !== '0')

class Sheet {
  y = 0
  private page!: PDFPage
  private readonly cache = new Map<string, boolean>()
  private rowIndex = 0

  private constructor(
    readonly doc: PDFDocument,
    readonly font: PDFFont,
    readonly bold: PDFFont,
    readonly italic: PDFFont,
    private readonly logo: PDFImage,
    private readonly runningTitle: string,
  ) {
    this.newPage()
  }

  static async create(runningTitle = ''): Promise<Sheet> {
    const doc = await PDFDocument.create()
    const [font, bold, italic] = await Promise.all([doc.embedFont(StandardFonts.Helvetica), doc.embedFont(StandardFonts.HelveticaBold), doc.embedFont(StandardFonts.HelveticaOblique)])
    const logo = await doc.embedPng(Buffer.from(LOGO_PNG_BASE64, 'base64'))
    return new Sheet(doc, font, bold, italic, logo, runningTitle)
  }

  // Text the standard PDF fonts cannot draw (emoji, most symbols) becomes "?" rather than failing the whole export.
  private safe(text: string): string {
    let out = ''
    for (const ch of text.replace(/\t/g, ' ').replace(/\r/g, '')) {
      if (ch === '\n') {
        out += ch
        continue
      }
      let ok = this.cache.get(ch)
      if (ok === undefined) {
        try {
          this.font.widthOfTextAtSize(ch, 10)
          ok = true
        } catch {
          ok = false
        }
        this.cache.set(ch, ok)
      }
      out += ok ? ch : '?'
    }
    return out
  }

  // Every page opens with the logo and the company name on the left, the report's name on the right, and a hairline under them.
  private newPage() {
    this.page = this.doc.addPage([W, H])
    const h = 26
    this.page.drawImage(this.logo, { x: M, y: H - M - h + 4, width: h * LOGO_ASPECT, height: h })
    this.page.drawText('Philus BPO Services', { x: M + h * LOGO_ASPECT + 8, y: H - M - 12, size: 11.5, font: this.bold, color: INK })
    if (this.runningTitle) {
      const t = this.safe(this.runningTitle)
      this.page.drawText(t, { x: W - M - this.font.widthOfTextAtSize(t, 8.5), y: H - M - 11, size: 8.5, font: this.font, color: MUTED })
    }
    this.page.drawLine({ start: { x: M, y: H - M - 36 }, end: { x: W - M, y: H - M - 36 }, thickness: 0.6, color: LINE })
    this.y = H - M - 54
  }

  /** A rounded rectangle whose top-left corner is at (x, top). */
  private round(x: number, top: number, w: number, h: number, r: number, style: { color?: ReturnType<typeof rgb>; border?: ReturnType<typeof rgb>; borderWidth?: number }) {
    const rr = Math.min(r, w / 2, h / 2)
    const path = `M ${rr} 0 H ${w - rr} A ${rr} ${rr} 0 0 1 ${w} ${rr} V ${h - rr} A ${rr} ${rr} 0 0 1 ${w - rr} ${h} H ${rr} A ${rr} ${rr} 0 0 1 0 ${h - rr} V ${rr} A ${rr} ${rr} 0 0 1 ${rr} 0 Z`
    this.page.drawSvgPath(path, { x, y: top, color: style.color, borderColor: style.border, borderWidth: style.borderWidth })
  }

  /** Breaks a text into lines no wider than `width`, keeping its own line breaks. */
  wrap(text: string, width: number, size: number, font: PDFFont = this.font): string[] {
    const lines: string[] = []
    for (const para of this.safe(text).split('\n')) {
      let line = ''
      for (const word of para.split(' ')) {
        const next = line ? `${line} ${word}` : word
        if (font.widthOfTextAtSize(next, size) <= width) {
          line = next
          continue
        }
        if (line) lines.push(line)
        // a single word longer than the line is cut where it no longer fits
        let rest = word
        while (font.widthOfTextAtSize(rest, size) > width && rest.length > 1) {
          let n = rest.length - 1
          while (n > 1 && font.widthOfTextAtSize(rest.slice(0, n), size) > width) n -= 1
          lines.push(rest.slice(0, n))
          rest = rest.slice(n)
        }
        line = rest
      }
      lines.push(line)
    }
    return lines
  }

  width(text: string, size: number, font: PDFFont = this.font) {
    return font.widthOfTextAtSize(this.safe(text), size)
  }

  private ensure(h: number) {
    if (this.y - h < M + 26) this.newPage()
  }

  text(text: string, x: number, top: number, size: number, opts: { font?: PDFFont; color?: ReturnType<typeof rgb>; align?: 'left' | 'right' | 'center'; width?: number } = {}) {
    const font = opts.font ?? this.font
    const t = this.safe(text)
    const w = font.widthOfTextAtSize(t, size)
    const at = opts.align === 'right' ? x + (opts.width ?? 0) - w : opts.align === 'center' ? x + ((opts.width ?? 0) - w) / 2 : x
    this.page.drawText(t, { x: at, y: top - size * 0.8, size, font, color: opts.color ?? INK })
  }

  gap(h: number) {
    this.y -= h
  }

  /** The title block at the top of the first page: the title, then who reported, the period, the team and the status in one row. */
  titleBlock(title: string, meta: { label: string; value: string }[], status?: string) {
    this.text(title, M, this.y, 21, { font: this.bold, color: INK })
    this.y -= 32
    let x = M
    for (const m of meta) {
      this.text(m.label.toUpperCase(), x, this.y, 7.5, { font: this.bold, color: MUTED })
      this.text(m.value, x, this.y - 11, 10.5, { font: this.bold, color: INK })
      x += Math.max(this.width(m.value, 10.5, this.bold), this.width(m.label.toUpperCase(), 7.5, this.bold)) + 34
    }
    if (status) {
      const label = status.toUpperCase()
      const w = this.width(label, 8, this.bold) + 18
      const sx = M + CW - w
      this.text('STATUS', sx, this.y, 7.5, { font: this.bold, color: MUTED })
      this.round(sx, this.y - 11, w, 16, 8, { border: BOX_EDGE, borderWidth: 0.8 })
      this.text(label, sx, this.y - 14.5, 8, { font: this.bold, color: INK, align: 'center', width: w })
    }
    this.y -= 36
    this.page.drawLine({ start: { x: M, y: this.y }, end: { x: W - M, y: this.y }, thickness: 0.6, color: LINE })
    this.y -= 18
  }

  /** The title block of a section: small green capitals over a green rule, with an optional note on the right. It never ends a page by itself. */
  banner(title: string, keepWith = 30, aside?: string) {
    const h = 20
    this.ensure(h + keepWith)
    this.text(title.toUpperCase(), M, this.y, 10, { font: this.bold, color: GREEN })
    if (aside) this.text(aside, M, this.y - 0.5, 9, { color: MUTED, align: 'right', width: CW })
    this.page.drawLine({ start: { x: M, y: this.y - 16 }, end: { x: M + CW, y: this.y - 16 }, thickness: 1.4, color: GREEN })
    this.y -= h
    this.rowIndex = 0
  }

  /** One row of a section. Plain rows alternate between white and a very light gray with a hairline under each; `prose` rows are plain white
   *  with a thin green bar down the left edge. `draw` gets the row's top edge. */
  row(h: number, draw: (top: number) => void, edges: 'grid' | 'sides' = 'grid') {
    this.ensure(h)
    const top = this.y
    if (edges === 'sides') {
      this.page.drawRectangle({ x: M, y: top - h - 0.3, width: 2.5, height: h + 0.6, color: GREEN })
    } else {
      if (this.rowIndex % 2 === 1) this.page.drawRectangle({ x: M, y: top - h, width: CW, height: h, color: ZEBRA })
      this.page.drawLine({ start: { x: M, y: top - h }, end: { x: M + CW, y: top - h }, thickness: 0.5, color: LINE })
    }
    draw(top)
    this.y -= h
    this.rowIndex += 1
  }

  /** Closes a box whose rows had only side edges. */
  closeBox() {
    this.page.drawLine({ start: { x: M, y: this.y }, end: { x: M + CW, y: this.y }, thickness: 0.5, color: LINE })
  }

  /** A quiet one-line row, for a section with nothing in it. */
  empty(text = 'None this week.') {
    this.row(22, (top) => this.text(text, M + 6, top - 6, 10, { font: this.italic, color: FAINT }))
  }

  /** "name ........ $amount" rows, the left text wrapped when long. */
  entries(rows: { name: string; value?: string }[], valueWidth = 112) {
    if (rows.length === 0) return this.empty()
    for (const r of rows) {
      const lines = this.wrap(r.name, CW - 16 - (r.value ? valueWidth + 8 : 0), 10.5)
      this.row(lines.length * LEAD + 9, (top) => {
        lines.forEach((l, i) => this.text(l, M + 6, top - 5 - i * LEAD, 10.5))
        if (r.value) this.text(r.value, M + CW - 6 - valueWidth, top - 5, 10.5, { align: 'right', width: valueWidth })
      })
    }
  }

  /** The same list in two columns, for a long list of short names (like the payables). */
  entriesTwoColumn(rows: { name: string; value?: string }[]) {
    const colW = CW / 2
    this.rowIndex = 0
    for (let i = 0; i < rows.length; i += 2) {
      const pair = [rows[i], rows[i + 1]]
      const cellLines = pair.map((r) => (r ? this.wrap(r.name, colW - 16 - (r.value ? 78 : 0), 10) : []))
      const h = Math.max(1, ...cellLines.map((l) => l.length)) * LEAD + 8
      this.ensure(h)
      const top = this.y
      if (this.rowIndex % 2 === 1) this.page.drawRectangle({ x: M, y: top - h, width: CW, height: h, color: ZEBRA })
      this.page.drawLine({ start: { x: M, y: top - h }, end: { x: M + CW, y: top - h }, thickness: 0.5, color: LINE })
      this.page.drawLine({ start: { x: M + colW, y: top - 3 }, end: { x: M + colW, y: top - h + 3 }, thickness: 0.5, color: LINE })
      pair.forEach((r, c) => {
        const x = M + c * colW
        if (!r) return
        cellLines[c].forEach((l, n) => this.text(l, x + 6, top - 4.5 - n * LEAD, 10))
        if (r.value) this.text(r.value, x + colW - 8 - 70, top - 4.5, 10, { align: 'right', width: 70 })
      })
      this.y -= h
      this.rowIndex += 1
    }
  }

  /** A bold total row: "Total Accounts Payable: $53,662.95". */
  total(label: string, value: string) {
    this.ensure(28)
    const top = this.y
    // a total is a bold line under a dark rule, not a colored bar
    this.page.drawLine({ start: { x: M, y: top }, end: { x: M + CW, y: top }, thickness: 1.2, color: RULE })
    this.text(label, M + 6, top - 9, 11, { font: this.bold })
    this.text(value, M + 6, top - 7.5, 14, { font: this.bold, align: 'right', width: CW - 12 })
    this.y -= 28
    this.rowIndex = 0
  }

  /** A numbered list. */
  numbered(items: string[], emptyText?: string) {
    if (items.length === 0) return this.empty(emptyText)
    items.forEach((name, i) => {
      const lines = this.wrap(name, CW - 52, 10.5)
      this.row(lines.length * LEAD + 8, (top) => {
        this.text(`${i + 1}.`, M + 20, top - 4.5, 10.5, { color: MUTED })
        lines.forEach((l, n) => this.text(l, M + 40, top - 4.5 - n * LEAD, 10.5))
      })
    })
  }

  /** Lists side by side under small headings (CA and WA): a heading row, then the items in columns. An empty list reads "None this week." */
  sideBySide(columns: { title: string; items: string[] }[]) {
    const n = columns.length
    const colW = CW / n
    const heading = () => this.row(22, (top) => columns.forEach((c, i) => this.text(c.title, M + i * colW + 6, top - 5.5, 10.5, { font: this.bold })))
    heading()
    const count = Math.max(1, ...columns.map((c) => c.items.length))
    for (let r = 0; r < count; r += 1) {
      // null marks the one place an empty list says "none"; undefined is blank space under a shorter list
      const cells = columns.map((c) => (c.items.length === 0 ? (r === 0 ? null : undefined) : c.items[r]))
      const wrapped = cells.map((cell) => (typeof cell === 'string' ? this.wrap(cell, colW - 34, 10.5) : []))
      const h = Math.max(1, ...wrapped.map((l) => l.length)) * LEAD + 8
      // a list that runs onto the next page starts that page with its CA / WA heading again, so the numbers are not left unlabelled
      if (this.y - h < M + 26) {
        this.newPage()
        heading()
      }
      this.row(h, (top) => {
        cells.forEach((cell, i) => {
          const x = M + i * colW
          if (cell === null) this.text('None this week.', x + 6, top - 4.5, 10.5, { font: this.italic, color: FAINT })
          else if (typeof cell === 'string') {
            this.text(`${r + 1}.`, x + 6, top - 4.5, 10.5, { color: MUTED })
            wrapped[i].forEach((l, k) => this.text(l, x + 26, top - 4.5 - k * LEAD, 10.5))
          }
        })
        for (let i = 1; i < n; i += 1) this.page.drawLine({ start: { x: M + i * colW, y: top - 2 }, end: { x: M + i * colW, y: top - h + 2 }, thickness: 0.5, color: LINE })
      })
    }
  }

  /** "Label  |  entries" rows for a set of small lists. A row with nothing in it reads "None this week." in gray. */
  keyValues(rows: { label: string; items: string[] }[]) {
    const labelW = 232
    for (const r of rows) {
      const labelLines = this.wrap(r.label, labelW - 12, 10.5, this.bold)
      const lines = r.items.length ? this.wrap(r.items.join(', '), CW - labelW - 8, 10.5) : []
      const h = Math.max(1, lines.length, labelLines.length) * LEAD + 8
      this.row(h, (top) => {
        labelLines.forEach((l, k) => this.text(l, M + 6, top - 4.5 - k * LEAD, 10.5, { font: this.bold }))
        if (r.items.length === 0) this.text('None this week.', M + labelW, top - 4.5, 10.5, { font: this.italic, color: FAINT })
        else lines.forEach((l, k) => this.text(l, M + labelW, top - 4.5 - k * LEAD, 10.5))
      })
    }
  }

  /** A small heading row inside a section (for CA / WA). */
  subhead(text: string) {
    this.row(22, (top) => this.text(text, M + 6, top - 5.5, 10.5, { font: this.bold }))
  }

  /** Free text on white with a thin green bar at the left. Lines starting with "-" become bullets, indented lines become sub-bullets. */
  prose(text: string, emptyText = 'Nothing written.') {
    const body = text.trim()
    if (!body) return this.empty(emptyText)
    let first = true
    const rawLines = body.split('\n')
    for (const [at, raw] of rawLines.entries()) {
      const m = raw.match(/^(\s*)[-•●○*]\s+(.*)$/)
      const level = m && m[1].length >= 2 ? 1 : 0
      const indent = m ? 14 + level * 16 : 0
      const lines = this.wrap(m ? m[2] : raw, CW - 28 - indent, 10.5)
      const h = lines.length * LEAD + 4 + (first ? 6 : 0) + (at === rawLines.length - 1 ? 6 : 0)
      const topPad = first ? 6 : 0
      this.row(
        h,
        (top) => {
          if (m) {
            const cy = top - topPad - 4 - 5.4
            if (level === 0) this.page.drawCircle({ x: M + 18 + 3, y: cy, size: 2, color: INK })
            else this.page.drawCircle({ x: M + 18 + 3 + 16, y: cy, size: 1.8, borderColor: INK, borderWidth: 0.8 })
          }
          lines.forEach((l, n) => this.text(l, M + 16 + indent, top - topPad - 4 - n * LEAD, 10.5))
        },
        'sides',
      )
      first = false
    }
  }

  /** A row of cards, each a small label over a big number. A zero is drawn quietly so the counts that matter stand out. */
  tiles(items: { label: string; value: string }[]) {
    const n = items.length
    const gap = 8
    const w = (CW - gap * (n - 1)) / n
    const h = 54
    this.ensure(h + 6)
    const top = this.y - 2
    items.forEach((t, i) => {
      const x = M + i * (w + gap)
      const zero = t.value === '0'
      // a count above zero gets a darker border and black type; a zero is faint, so the counts that matter stand out without any color
      this.round(x, top, w, h, 6, { color: WHITE, border: zero ? LINE : RULE, borderWidth: zero ? 0.6 : 1.2 })
      const lines = this.wrap(t.label.toUpperCase(), w - 16, 7.5, this.bold).slice(0, 2)
      lines.forEach((l, k) => this.text(l, x + 9, top - 8 - k * 9, 7.5, { font: this.bold, color: MUTED }))
      this.text(t.value, x + 9, top - 30, 20, { font: this.bold, color: zero ? FAINT : INK })
    })
    this.y = top - h - 8
    this.rowIndex = 0
  }

  /** Rounded pills that flow across lines. */
  pills(items: string[]) {
    if (items.length === 0) return this.empty('None picked.')
    const size = 9
    const lines: { text: string; w: number }[][] = [[]]
    let used = 0
    for (const t of items) {
      const w = this.width(t, size, this.bold) + 18
      if (used + w > CW - 8 && lines[lines.length - 1].length) {
        lines.push([])
        used = 0
      }
      lines[lines.length - 1].push({ text: t, w })
      used += w + 6
    }
    this.ensure(lines.length * 24 + 8)
    const top = this.y
    lines.forEach((line, r) => {
      let x = M
      for (const p of line) {
        const y = top - 4 - r * 24
        this.round(x, y, p.w, 18, 9, { color: CHIP })
        this.text(p.text, x, y - 4.2, size, { font: this.bold, color: INK, align: 'center', width: p.w })
        x += p.w + 6
      }
    })
    this.y = top - lines.length * 24 - 6
    this.rowIndex = 0
  }

  /** Lays small badges out in lines no wider than `width`. */
  private flowBadges(items: string[], width: number): { text: string; w: number }[][] {
    const lines: { text: string; w: number }[][] = [[]]
    let used = 0
    for (const text of items) {
      const w = this.width(text, 7.5, this.bold) + 12
      if (used + w > width && lines[lines.length - 1].length) {
        lines.push([])
        used = 0
      }
      lines[lines.length - 1].push({ text, w })
      used += w + 4
    }
    return lines
  }

  /** A table: a header row, then body rows whose cells are text, a list of badges, a tick box or a blank. Empty text cells show a faint dash. */
  table(columns: { title: string; width: number; align?: 'left' | 'center' }[], rows: (string | boolean | string[])[][], opts: { firstColumnBold?: boolean } = {}) {
    const head = 20
    this.ensure(head + 26)
    let x = M
    for (const c of columns) {
      this.text(c.title, x + 6, this.y - 6, 8, { font: this.bold, color: MUTED, align: c.align ?? 'left', width: c.width - 12 })
      x += c.width
    }
    this.page.drawLine({ start: { x: M, y: this.y - head }, end: { x: M + CW, y: this.y - head }, thickness: 0.9, color: RULE })
    this.y -= head
    this.rowIndex = 0
    for (const cells of rows) {
      const wrapped = cells.map((cell, i) => (typeof cell === 'string' ? this.wrap(cell, columns[i].width - 12, 9) : []))
      const badgeRows = cells.map((cell, i) => (Array.isArray(cell) ? this.flowBadges(cell, columns[i].width - 12) : []))
      const h = Math.max(1.5 * 11.5 + 4, ...wrapped.map((l) => l.length * 11.5 + 4), ...badgeRows.map((r) => (r.length ? r.length * 17 + 5 : 0)))
      this.ensure(h)
      const top = this.y
      if (this.rowIndex % 2 === 1) this.page.drawRectangle({ x: M, y: top - h, width: CW, height: h, color: ZEBRA })
      this.page.drawLine({ start: { x: M, y: top - h }, end: { x: M + CW, y: top - h }, thickness: 0.5, color: LINE })
      let cx = M
      cells.forEach((cell, i) => {
        const col = columns[i]
        if (Array.isArray(cell)) {
          if (cell.length === 0) {
            this.text('-', cx + 6, top - 4.5, 9, { color: FAINT })
          } else {
            badgeRows[i].forEach((line, r) => {
              let bx = cx + 6
              for (const b of line) {
                const flag = FLAGS.includes(b.text)
                const y = top - 4 - r * 17
                // a territory is a gray chip; a flag (N/A, WEEKEND, D2D) is the same shape, outlined and not filled
                this.round(bx, y, b.w, 14, 7, flag ? { color: WHITE, border: BOX_EDGE, borderWidth: 0.7 } : { color: CHIP })
                this.text(b.text, bx, y - 3.4, 7.5, { font: this.bold, color: flag ? MUTED : INK, align: 'center', width: b.w })
                bx += b.w + 4
              }
            })
          }
        } else if (typeof cell === 'string') {
          const empty = cell === '-' || cell.trim() === ''
          wrapped[i].forEach((l, n) =>
            this.text(l, cx + 6, top - 4.5 - n * 11.5, 9.5, {
              font: i === 0 && opts.firstColumnBold ? this.bold : this.font,
              color: empty ? FAINT : INK,
              align: col.align ?? 'left',
              width: col.width - 12,
            }),
          )
        } else {
          const s = 11
          const bx = cx + col.width / 2 - s / 2
          const by = top - h / 2 - s / 2
          if (cell) {
            this.round(bx, by + s, s, s, 2.5, { color: GREEN })
            this.page.drawLine({ start: { x: bx + 2.4, y: by + 5.6 }, end: { x: bx + 4.6, y: by + 3 }, thickness: 1.4, color: WHITE })
            this.page.drawLine({ start: { x: bx + 4.6, y: by + 3 }, end: { x: bx + 8.8, y: by + 8.2 }, thickness: 1.4, color: WHITE })
          } else {
            this.round(bx, by + s, s, s, 2.5, { color: WHITE, border: BOX_EDGE, borderWidth: 0.8 })
          }
        }
        cx += col.width
      })
      this.y -= h
      this.rowIndex += 1
    }
  }

  async finish(footer: string): Promise<Buffer> {
    const pages = this.doc.getPages()
    pages.forEach((p, i) => {
      p.drawLine({ start: { x: M, y: M - 4 }, end: { x: W - M, y: M - 4 }, thickness: 0.5, color: LINE })
      p.drawText(this.safe(footer), { x: M, y: M - 16, size: 8, font: this.font, color: MUTED })
      const label = `Page ${i + 1} of ${pages.length}`
      p.drawText(label, { x: W - M - this.font.widthOfTextAtSize(label, 8), y: M - 16, size: 8, font: this.font, color: MUTED })
    })
    return Buffer.from(await this.doc.save())
  }
}

function titleBlock(sheet: Sheet, input: ReportExportInput, title: string) {
  const period = `${monthDay(input.periodStart)} to ${monthDay(input.periodEnd)}`
  sheet.titleBlock(
    title,
    [
      ...(input.authorName ? [{ label: 'Reported by', value: input.authorName }] : []),
      { label: 'Period', value: period },
      { label: 'Team', value: input.teamName },
    ],
    input.status.charAt(0).toUpperCase() + input.status.slice(1),
  )
}

function managerComments(sheet: Sheet, text: string | undefined) {
  if (!text?.trim()) return
  sheet.gap(10)
  sheet.banner('Manager comments')
  sheet.prose(text)
}

async function accountingPdf(input: ReportExportInput): Promise<Buffer> {
  const d = input.data as AccountingReportData
  const sheet = await Sheet.create('Accounting Weekly Summary Report')
  titleBlock(sheet, input, 'Accounting Weekly Summary Report')

  const entryList = (rows: AccountingReportData['receivables']) =>
    (rows ?? []).filter((r) => r.name.trim() || r.amount != null).map((r) => ({ name: r.name.trim() || '(no name)', amount: r.amount }))
  const sum = (rows: { amount?: number }[]) => rows.reduce((s, r) => s + (r.amount ?? 0), 0)
  const asRows = (rows: { name: string; amount?: number }[]) => rows.map((r) => ({ name: r.name, value: r.amount != null ? money(r.amount) : undefined }))

  const ar = entryList(d.receivables)
  sheet.banner('Accounts Receivable Entered')
  sheet.entries(asRows(ar))
  sheet.total('TOTAL:', money(sum(ar)))

  const ap = entryList(d.payables)
  sheet.gap(14)
  sheet.banner('Accounts Payable Entered')
  if (ap.length > 5) sheet.entriesTwoColumn(asRows(ap))
  else sheet.entries(asRows(ap))
  sheet.total('Total Accounts Payable:', money(sum(ap)))

  // CA and WA sit side by side, so a section is as tall as its longer list, not both lists end to end.
  const states = (title: string, value: { CA?: string[]; WA?: string[] } | undefined) => {
    sheet.gap(14)
    sheet.banner(title, 70)
    sheet.sideBySide([
      { title: 'CA', items: clean(value?.CA) },
      { title: 'WA', items: clean(value?.WA) },
    ])
  }
  states('AR Case Created', d.arCases)
  states('Begin Billing', d.beginBilling)

  const invoices = (d.invoices ?? []).filter((i) => i.name.trim())
  sheet.gap(14)
  sheet.banner('Invoice Created', Math.min(110, Math.max(1, invoices.length) * 24 + 30))
  sheet.entries(invoices.map((i) => ({ name: i.name.trim(), value: String(i.count ?? 0) })), 60)
  if (invoices.length) sheet.total('Total invoices:', String(invoices.reduce((s, i) => s + (i.count ?? 0), 0)))

  // The small lists, which are mostly empty in a normal week, share one table instead of one section each.
  sheet.gap(14)
  sheet.banner('Other Entries', 90)
  sheet.keyValues([
    { label: 'Coupa Entered/Ops Merchant/Vendor Cafe', items: clean(d.coupa) },
    { label: 'CR Fee Increase/Decrease', items: clean(d.crFee) },
    { label: 'Change Management', items: clean(d.changeManagement) },
    { label: '30 Day Notice', items: clean(d.thirtyDayNotice) },
    { label: 'Parent Account Change', items: clean(d.parentAccountChange) },
    { label: 'Reimbursement Entered', items: clean(d.reimbursements) },
  ])

  for (const [title, text] of [
    ['Additional Tasks', d.additionalTasks],
    ['Roadblocks', d.roadblocks],
    ['Highlights', d.highlights],
  ] as const) {
    sheet.gap(14)
    sheet.banner(title)
    sheet.prose(text ?? '')
  }
  managerComments(sheet, d.managerComments)
  return sheet.finish('Accounting weekly summary report')
}

// The dates a FOA report covers: its period, plus the Saturday make-up day when that day has anything entered.
function foaDates(input: ReportExportInput, d: FoaReportData): string[] {
  const dates: string[] = []
  for (let day = new Date(input.periodStart); day <= input.periodEnd; day.setUTCDate(day.getUTCDate() + 1)) dates.push(iso(day))
  if (dates.length === 5) {
    const sat = new Date(input.periodEnd)
    sat.setUTCDate(sat.getUTCDate() + 1)
    const key = iso(sat)
    const cells = d.attendance?.[key]
    const used = (cells && Object.values(cells).some((t) => t && t.length > 0)) || Object.values(d.taskChecklist ?? {}).some((days) => days?.[FOA_MAKE_UP_DAY])
    if (used) dates.push(key)
  }
  return dates
}

async function foaPdf(input: ReportExportInput): Promise<Buffer> {
  const d = input.data as FoaReportData
  const sheet = await Sheet.create('Field Operations Admin Weekly Report')
  titleBlock(sheet, input, 'Field Operations Admin Weekly Report')

  sheet.banner('Assigned Territory')
  sheet.pills(d.territories ?? [])

  const dates = foaDates(input, d)
  sheet.gap(14)
  sheet.banner('Attendance Task Sheet', 70)
  // The Routeboard column is the one that carries the most badges, so it gets the room; the day column only holds a short date.
  const dayW = 82
  const routeW = 178
  const otherW = (CW - dayW - routeW) / (FOA_ATTENDANCE_COLUMNS.length - 1)
  sheet.table(
    [{ title: 'DAY', width: dayW }, ...FOA_ATTENDANCE_COLUMNS.map((c, i) => ({ title: c.toUpperCase(), width: i === 0 ? routeW : otherW }))],
    dates.map((date, i) => [
      // a sixth day after a Monday-to-Friday week is the Saturday worked to make up for a day off
      dates.length === 6 && i === 5 ? `${shortDay(date)} (make-up)` : shortDay(date),
      ...FOA_ATTENDANCE_COLUMNS.map((c) => [...(d.attendance?.[date]?.[c] ?? [])]),
    ]),
    { firstColumnBold: true },
  )

  const withSaturday = dates.includes(iso(new Date(input.periodEnd.getTime() + 86_400_000)))
  const days: ((typeof FOA_CHECKLIST_DAYS)[number] | typeof FOA_MAKE_UP_DAY)[] = withSaturday ? [...FOA_CHECKLIST_DAYS, FOA_MAKE_UP_DAY] : [...FOA_CHECKLIST_DAYS]
  const checklist = d.taskChecklist ?? {}
  const done = FOA_CHECKLIST_TASKS.reduce((n, t) => n + FOA_CHECKLIST_DAYS.filter((day) => checklist[t]?.[day]).length, 0)
  sheet.gap(14)
  // the checklist is kept whole: it moves to the next page together rather than leaving one row behind
  sheet.banner('Task Checklist', FOA_CHECKLIST_TASKS.length * 22 + 30, `${done} of ${FOA_CHECKLIST_TASKS.length * FOA_CHECKLIST_DAYS.length} done`)
  const taskW = 250
  const dayCol = (CW - taskW) / days.length
  sheet.table(
    [{ title: 'TASK', width: taskW }, ...days.map((day) => ({ title: day.slice(0, 3).toUpperCase(), width: dayCol, align: 'center' as const }))],
    FOA_CHECKLIST_TASKS.map((task) => [task, ...days.map((day) => !!checklist[task]?.[day])]),
  )

  const v = d.varianceInvestigations ?? {}
  const s = d.motiveSafetyEvents ?? {}
  sheet.gap(14)
  sheet.banner('Investigations and Safety Events', 90)
  sheet.tiles([
    { label: 'Extended breaks', value: String(v.extendedBreaks ?? 0) },
    { label: 'Back-to-back breaks', value: String(v.backToBackBreaks ?? 0) },
    { label: 'Other investigations', value: String(v.otherInvestigations ?? 0) },
  ])
  sheet.tiles([
    { label: 'Cellphone', value: String(s.cellphone ?? 0) },
    { label: 'Seatbelts', value: String(s.seatbelts ?? 0) },
    { label: 'Incidents', value: String(s.incidents ?? 0) },
    { label: 'Tracker/Dascam', value: String(s.trackerDascam ?? 0) },
    { label: 'Speeding', value: String(s.speeding ?? 0) },
  ])

  for (const [title, text] of [
    ['Additional Tasks', d.additionalTasks],
    ['Highlights', d.highlights],
    ['Roadblocks', d.roadblocks],
  ] as const) {
    sheet.gap(14)
    sheet.banner(title)
    sheet.prose(text ?? '')
  }
  managerComments(sheet, d.managerComments)
  return sheet.finish('Field Operations Admin weekly report')
}

async function genericPdf(input: ReportExportInput): Promise<Buffer> {
  const d = input.data as ReportData
  const sheet = await Sheet.create('Weekly Summary Report')
  titleBlock(sheet, input, 'Weekly Summary Report')

  sheet.banner('Account and Metrics')
  sheet.entries(
    [
      ['Client / Account', d.client],
      ['Headcount', d.headcount != null ? String(d.headcount) : undefined],
      ['Attendance', d.attendance],
      ['Productivity', d.productivity],
      ['Quality / QA', d.qa],
      ['SLA', d.sla],
    ].map(([name, value]) => ({ name: name as string, value: value || '-' })),
    230,
  )
  for (const [title, text] of [
    ['Performance Metrics', d.performanceMetrics],
    ['Issues', d.issues],
    ['Achievements', d.achievements],
    ['Action Items', d.actionItems],
  ] as const) {
    sheet.gap(14)
    sheet.banner(title)
    sheet.prose(text ?? '')
  }
  managerComments(sheet, d.managerComments)
  return sheet.finish('Weekly summary report')
}

export function buildReportPdf(input: ReportExportInput): Promise<Buffer> {
  if (input.schemaKey === 'accounting') return accountingPdf(input)
  if (input.schemaKey === 'foa') return foaPdf(input)
  return genericPdf(input)
}
