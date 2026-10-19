export const ANNOUNCEMENT_CATEGORIES = [
  'Company announcements',
  'Policy updates',
  'Holidays',
  'Important notices',
  'Emergency announcements',
] as const

export type AnnouncementCategory = (typeof ANNOUNCEMENT_CATEGORIES)[number]

export function isExpired(a: Announcement, now = new Date()): boolean {
  return a.expireAt !== null && new Date(a.expireAt) <= now
}

export interface Announcement {
  id: string
  title: string
  category: AnnouncementCategory
  content: string
  published: boolean
  publishAt: string | null
  expireAt: string | null
  // Pinned by HR (highlighted), and "featured" = pinned or an emergency (those are always highlighted).
  highlighted?: boolean
  // When the highlight ends by itself; null with highlighted = until HR removes it.
  highlightUntil?: string | null
  featured?: boolean
  // Engagement (added by the server; optional so older responses still fit).
  reactions?: Record<string, number>
  // Names of who reacted, per emoji, oldest first (capped; the count above is exact).
  reactors?: Record<string, string[]>
  myReaction?: string | null
  needsAck?: boolean
  // Asks people to do something by this date (a to-do for each person).
  needsAction?: boolean
  actionDueAt?: string | null
  // The caller's own to-do for it.
  myAction?: { id: string; status: 'open' | 'done' } | null
  // HR/Admin: how many of the to-dos are done.
  actionDone?: number
  actionTotal?: number
  // HR/Admin: the action went to chosen teams or people, not everyone.
  actionTargeted?: boolean
  acknowledged?: boolean
  // HR/Admin only, for announcements that need a "Got it".
  ackCount?: number
  ackTotal?: number
}
