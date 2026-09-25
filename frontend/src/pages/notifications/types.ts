export interface AppNotification {
  id: string
  type: string
  title: string
  body: string | null
  link: string | null
  readAt: string | null
  createdAt: string
}

export interface NotificationsResponse {
  unread: number
  items: AppNotification[]
}

// Fired whenever notifications are read so the header bell can refetch.
export const NOTIFICATIONS_CHANGED = 'notifications:changed'
