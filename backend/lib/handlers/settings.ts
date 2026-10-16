import type { VercelResponse } from '@vercel/node'
import { z } from 'zod'
import { prisma } from '../prisma.js'
import type { AuthedRequest } from '../middleware.js'
import { NOTIFICATION_TYPES } from '../notify.js'

// GET /settings — the caller's own settings + the notification kinds they
// can toggle. PUT /settings — update their own notification preferences and/or
// their light/dark theme (kept here so the portal and the desktop app share one choice).
// Always keyed on the token's user id, never a client-supplied one.

const updateSchema = z
  .object({
    disabledNotifications: z.array(z.enum(Object.keys(NOTIFICATION_TYPES) as [string, ...string[]])).optional(),
    theme: z.enum(['light', 'dark']).optional(),
  })
  .refine((v) => v.disabledNotifications !== undefined || v.theme !== undefined)

function disabledOf(settings: unknown): string[] {
  if (settings && typeof settings === 'object' && 'disabledNotifications' in settings) {
    const list = (settings as { disabledNotifications?: unknown }).disabledNotifications
    if (Array.isArray(list)) return list.filter((t): t is string => typeof t === 'string')
  }
  return []
}

export function themeOf(settings: unknown): 'light' | 'dark' | null {
  const t = settings && typeof settings === 'object' ? (settings as { theme?: unknown }).theme : undefined
  return t === 'light' || t === 'dark' ? t : null
}

function payload(settings: unknown) {
  return {
    disabledNotifications: disabledOf(settings),
    theme: themeOf(settings),
    notificationTypes: Object.entries(NOTIFICATION_TYPES).map(([key, label]) => ({ key, label })),
  }
}

export async function handler(req: AuthedRequest, res: VercelResponse) {
  if (req.method === 'GET') {
    const user = await prisma.user.findUnique({ where: { id: req.auth.sub }, select: { settings: true } })
    if (!user) {
      res.status(404).json({ message: 'User not found' })
      return
    }
    res.status(200).json(payload(user.settings))
    return
  }

  if (req.method === 'PUT') {
    const parsed = updateSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ message: 'Invalid settings' })
      return
    }
    const user = await prisma.user.findUnique({ where: { id: req.auth.sub }, select: { settings: true } })
    if (!user) {
      res.status(404).json({ message: 'User not found' })
      return
    }
    const existing = user.settings && typeof user.settings === 'object' ? (user.settings as Record<string, unknown>) : {}
    // Merge: saving one setting must never wipe the others.
    const next = {
      ...existing,
      ...(parsed.data.disabledNotifications !== undefined && { disabledNotifications: [...new Set(parsed.data.disabledNotifications)] }),
      ...(parsed.data.theme !== undefined && { theme: parsed.data.theme }),
    }
    await prisma.user.update({ where: { id: req.auth.sub }, data: { settings: next } })
    res.status(200).json(payload(next))
    return
  }

  res.status(404).json({ message: 'Not found' })
}
