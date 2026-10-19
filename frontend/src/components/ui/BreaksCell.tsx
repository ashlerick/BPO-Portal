import { breakSlotText, type BreakEntry } from '../../utils/breaks'

// One break slot (Break 1, Lunch or Break 2) in its own table column: how long it ran, amber when it went over its limit,
// "not taken", or a dash when nothing was recorded.
export function BreakSlotCell({ breaks, slot }: { breaks?: BreakEntry[]; slot: BreakEntry['slot'] }) {
  const b = breakSlotText(breaks, slot)
  if (!b) return <span>—</span>
  return <span className={b.over ? 'text-amber-700 dark:text-amber-500' : b.text === 'not taken' ? 'text-gray-500 dark:text-gray-400' : ''}>{b.text}</span>
}
