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
