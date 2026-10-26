// The seating plan as the portal saves it (mirrors backend/lib/handlers/seating.ts). Seats are keyed "row-column", both from 0, and
// are kept when the grid is made smaller so growing it again brings the names back. "Other ports" are blocks outside the grid
// (the boss's office, the balancer): anything on a switch that is not a cube.

export interface Seat {
  name: string
  sw: string
  port: string
  jack: string
  note: string
}

export interface Extra {
  label: string
  sw: string
  port: string
  note: string
}

export interface Plan {
  title: string
  rows: number
  cols: number
  seats: Record<string, Seat>
  extras: Extra[]
}

export const MAX_SIDE = 12
export const MAX_EXTRAS = 24

export const EMPTY_SEAT: Seat = { name: '', sw: '', port: '', jack: '', note: '' }
export const EMPTY_EXTRA: Extra = { label: '', sw: '', port: '', note: '' }

export const DEFAULT_PLAN: Plan = { title: 'Floor plan', rows: 4, cols: 5, seats: {}, extras: [] }

export const seatKey = (row: number, col: number) => `${row}-${col}`

export const seatAt = (plan: Plan, row: number, col: number): Seat => plan.seats[seatKey(row, col)] ?? EMPTY_SEAT

// Rows are lettered, then numbered along the row: A1, A2 ... B1.
export const rowLetter = (row: number) => String.fromCharCode(65 + row)
export const seatLabel = (row: number, col: number) => `${rowLetter(row)}${col + 1}`

export const portText = (item: { port: string }) => (item.port.trim() ? `Port ${item.port.trim()}` : 'No port')

export function counts(plan: Plan) {
  let filled = 0
  let noPort = 0
  for (let r = 0; r < plan.rows; r++) {
    for (let c = 0; c < plan.cols; c++) {
      const s = seatAt(plan, r, c)
      if (s.name.trim()) filled++
      if (!s.port.trim()) noPort++
    }
  }
  for (const e of plan.extras) if (!e.port.trim()) noPort++
  const total = plan.rows * plan.cols
  return { total, filled, open: total - filled, noPort, extras: plan.extras.length }
}

export interface PortClash {
  sw: string
  port: string
  // What shares it, e.g. "C2", "E1", "Balancer".
  users: string[]
}

// The same port on the same switch typed twice. Only ports that are actually filled in count, and a switch left blank counts as
// one switch of its own, so a plan that never names its switch still catches a repeated number.
export function portClashes(plan: Plan): PortClash[] {
  const byPort = new Map<string, PortClash>()
  const add = (sw: string, port: string, who: string) => {
    const p = port.trim()
    if (!p) return
    const s = sw.trim()
    const key = `${s.toLowerCase()}|${p.toLowerCase()}`
    const found = byPort.get(key)
    if (found) found.users.push(who)
    else byPort.set(key, { sw: s, port: p, users: [who] })
  }
  for (let r = 0; r < plan.rows; r++) {
    for (let c = 0; c < plan.cols; c++) {
      const s = seatAt(plan, r, c)
      add(s.sw, s.port, seatLabel(r, c))
    }
  }
  plan.extras.forEach((e, i) => add(e.sw, e.port, e.label.trim() || `Other ${i + 1}`))
  return [...byPort.values()].filter((c) => c.users.length > 1)
}

// A key that says whether one port entry is in a clash, so its tile can be marked.
export const clashKey = (sw: string, port: string) => `${sw.trim().toLowerCase()}|${port.trim().toLowerCase()}`
