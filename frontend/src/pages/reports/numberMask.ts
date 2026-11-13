// Number masks for the report inputs: what you type becomes "1,230,033.50" as you type it. Kept free of React so it can be tested on its own.

const group = (digits: string) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',')

/** What was typed, as a money amount with thousands commas: digits, one dot, at most two decimals, an optional leading minus. */
export function maskMoney(raw: string): string {
  let s = raw.replace(/[^\d.-]/g, '')
  const negative = s.startsWith('-')
  s = s.replace(/-/g, '')
  const dot = s.indexOf('.')
  const whole = (dot === -1 ? s : s.slice(0, dot)).replace(/^0+(?=\d)/, '')
  const decimals = dot === -1 ? null : s.slice(dot + 1).replace(/\./g, '').slice(0, 2)
  return `${negative ? '-' : ''}${group(whole)}${decimals !== null ? `.${decimals}` : ''}`
}

/** What was typed, as a whole number with thousands commas. */
export function maskWhole(raw: string): string {
  return group(raw.replace(/\D/g, '').replace(/^0+(?=\d)/, ''))
}

/** The number in a masked text, or undefined while it is empty or only a sign or a dot. */
export function parseMasked(masked: string): number | undefined {
  const text = masked.replace(/,/g, '')
  if (text === '' || text === '-' || text === '.' || text === '-.') return undefined
  const n = Number(text)
  return Number.isFinite(n) ? n : undefined
}

/** A stored amount as shown when the field is not being edited: always two decimals. */
export const formatMoney = (n: number | undefined): string => (n == null ? '' : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))

/** A stored count as shown: with commas, or empty. */
export const formatWhole = (n: number | undefined): string => (n == null ? '' : n.toLocaleString('en-US'))

/**
 * Where the caret goes after masking, so typing in the middle of a number does not throw it to the end: it keeps the same number of digits
 * (and the dot) to its left that it had in the text as typed.
 */
export function caretAfterMask(raw: string, caretInRaw: number, masked: string): number {
  const significant = (s: string) => s.replace(/[^\d.]/g, '').length
  const target = significant(raw.slice(0, caretInRaw))
  if (target === 0) return masked.startsWith('-') ? 1 : 0
  let seen = 0
  for (let i = 0; i < masked.length; i += 1) {
    if (/[\d.]/.test(masked[i])) seen += 1
    if (seen === target) return i + 1
  }
  return masked.length
}
