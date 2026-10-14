// Payslips are semi-monthly: 1H = 1st-15th, 2H = 16th-end of month.

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export const MONTH_NAMES = MONTHS

// "January 1H" from a payslip's periodStart ("2026-01-01T00:00:00.000Z").
export function payslipPeriodLabel(periodStart: string): string {
  const d = new Date(periodStart)
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate() <= 15 ? '1H' : '2H'} ${d.getUTCFullYear()}`
}

// The cut-off we're most likely entering links for: the half that just ended.
export function currentPeriod(todayIso: string): { year: number; month: number; half: 1 | 2 } {
  const [y, m, d] = todayIso.split('-').map(Number)
  if (d > 15) return { year: y, month: m, half: 1 }
  const prev = m === 1 ? { year: y - 1, month: 12 } : { year: y, month: m - 1 }
  return { ...prev, half: 2 }
}

const HOSTS = ['drive.google.com', 'docs.google.com']

// Same rule as the backend: an https Google Drive / Docs link.
export function isDriveLink(value: string): boolean {
  try {
    const u = new URL(value.trim())
    return u.protocol === 'https:' && HOSTS.includes(u.hostname)
  } catch {
    return false
  }
}

const MONTH_PREFIXES = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

// "January 1H", "Feb 2H '26", "March 2H 2026" -> a period, or null.
export function parsePeriodLabel(label: string, defaultYear: number): { year: number; month: number; half: 1 | 2 } | null {
  const m = label.trim().toLowerCase().match(/^([a-z]{3,9})\.?\s*(1h|2h)(?:\s*'?\s*(\d{2}|\d{4}))?$/)
  if (!m) return null
  const month = MONTH_PREFIXES.indexOf(m[1].slice(0, 3)) + 1
  if (month === 0) return null
  const rawYear = m[3] ? Number(m[3]) : defaultYear
  return { year: rawYear < 100 ? 2000 + rawYear : rawYear, month, half: m[2] === '1h' ? 1 : 2 }
}

// Pasted or CSV text -> rows of cells. Tab-separated wins (a paste from a
// spreadsheet); otherwise commas, with simple "quoted" fields.
export function parseTable(text: string): string[][] {
  const lines = text.replace(/\r/g, '').split('\n').filter((l) => l.trim() !== '')
  return lines.map((line) => {
    if (line.includes('\t')) return line.split('\t').map((c) => c.trim())
    const cells: string[] = []
    let cur = ''
    let quoted = false
    for (const ch of line) {
      if (ch === '"') quoted = !quoted
      else if (ch === ',' && !quoted) {
        cells.push(cur.trim())
        cur = ''
      } else cur += ch
    }
    cells.push(cur.trim())
    return cells
  })
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()

export interface MatchableEmployee {
  employeeId: string
  employeeCode: string | null
  email: string
  name: string // "Last, First"
}

// Finds an employee by ID, email, or name ("Last, First" or "First Last").
export function matchEmployee(ident: string, employees: MatchableEmployee[]): MatchableEmployee | null {
  const key = norm(ident)
  if (!key) return null
  return (
    employees.find((e) => e.employeeCode && norm(e.employeeCode) === key) ??
    employees.find((e) => norm(e.email) === key) ??
    employees.find((e) => norm(e.name) === key) ??
    employees.find((e) => {
      const [last, first] = e.name.split(',').map((p) => p.trim())
      return first !== undefined && norm(`${first} ${last}`) === key
    }) ??
    null
  )
}
