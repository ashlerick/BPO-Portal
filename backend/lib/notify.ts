import { prisma } from './prisma.js'

// Notification kinds a user can switch off in Settings. Anything not
// listed here is always delivered (e.g. security-relevant messages).
export const NOTIFICATION_TYPES = {
  leave_decision: 'Leave requests approved or rejected',
  leave_request: 'New leave requests waiting for review',
  announcement: 'New announcements',
  report_decision: 'Weekly reports approved or rejected',
  hr_request: 'HR request updates',
} as const

export type NotificationType = keyof typeof NOTIFICATION_TYPES

interface NotificationInput {
  type: NotificationType
  title: string
  body?: string
  link?: string
}

function disabledTypes(settings: unknown): string[] {
  if (settings && typeof settings === 'object' && 'disabledNotifications' in settings) {
    const list = (settings as { disabledNotifications?: unknown }).disabledNotifications
    if (Array.isArray(list)) return list.filter((t): t is string => typeof t === 'string')
  }
  return []
}

// Creates one in-app notification per recipient, skipping anyone who has
// turned that kind off. Never throws — a failed notification must not fail
// the action that triggered it. Callers should await it: serverless
// functions can be frozen before an un-awaited write finishes.
export async function notifyUsers(userIds: string[], input: NotificationInput): Promise<void> {
  try {
    const unique = [...new Set(userIds)]
    if (unique.length === 0) return
    const users = await prisma.user.findMany({
      where: { id: { in: unique } },
      select: { id: true, settings: true },
    })
    const recipients = users.filter((u) => !disabledTypes(u.settings).includes(input.type))
    if (recipients.length === 0) return
    await prisma.notification.createMany({
      data: recipients.map((u) => ({
        userId: u.id,
        type: input.type,
        title: input.title,
        body: input.body ?? null,
        link: input.link ?? null,
      })),
    })
  } catch (err) {
    console.error('Failed to create notifications', err)
  }
}

export async function notifyRole(roles: ('hr' | 'admin')[], input: NotificationInput, excludeUserId?: string) {
  try {
    const users = await prisma.user.findMany({
      where: { roles: { hasSome: roles }, ...(excludeUserId && { id: { not: excludeUserId } }) },
      select: { id: true },
    })
    await notifyUsers(users.map((u) => u.id), input)
  } catch (err) {
    console.error('Failed to notify role', err)
  }
}
