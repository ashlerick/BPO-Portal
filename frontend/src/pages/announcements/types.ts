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
}
