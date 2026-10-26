// The seating plan as the portal saves it (mirrors backend/lib/handlers/seating.ts). Seats are keyed "row-column", both from 0, and
// are kept when the grid is made smaller so growing it again brings the names back.

export interface Seat {
  name: string
  sw: string
  port: string
  jack: string
  note: string
}

export interface Plan {
  title: string
  rows: number
  cols: number
  seats: Record<string, Seat>
}

export const MAX_SIDE = 12

export const EMPTY_SEAT: Seat = { name: '', sw: '', port: '', jack: '', note: '' }

export const DEFAULT_PLAN: Plan = { title: 'Floor plan', rows: 4, cols: 5, seats: {} }

export const seatKey = (row: number, col: number) => `${row}-${col}`

export const seatAt = (plan: Plan, row: number, col: number): Seat => plan.seats[seatKey(row, col)] ?? EMPTY_SEAT

// Rows are lettered, then numbered along the row: A1, A2 ... B1.
export const rowLetter = (row: number) => String.fromCharCode(65 + row)
export const seatLabel = (row: number, col: number) => `${rowLetter(row)}${col + 1}`

export const portText = (seat: Seat) => (seat.port.trim() ? `P${seat.port.trim()}` : 'No port')

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
  const total = plan.rows * plan.cols
  return { total, filled, open: total - filled, noPort }
}
