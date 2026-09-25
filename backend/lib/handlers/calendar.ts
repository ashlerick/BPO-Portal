import type { VercelResponse } from '@vercel/node'
import { z } from 'zod'
import { prisma } from '../prisma.js'
import type { AuthedRequest } from '../middleware.js'
import { logAudit } from '../audit.js'
import { isNotFoundError } from '../errors.js'

// GET /calendar — company calendar events (everyone).
// POST /calendar, PUT/DELETE /calendar/:id — HR/Admin only.

const KINDS = ['holiday', 'event', 'meeting', 'training', 'deadline'] as const
const dateOnly = /^\d{4}-\d{2}-\d{2}$/

const upsertSchema = z.object({
  title: z.string().trim().min(1).max(200),
  kind: z.enum(KINDS),
  startDate: z.string().regex(dateOnly, 'startDate must be YYYY-MM-DD'),
  endDate: z.string().regex(dateOnly, 'endDate must be YYYY-MM-DD').nullable().optional(),
  description: z.string().trim().max(1000).nullable().optional(),
})

function isManager(req: AuthedRequest): boolean {
  return req.auth.roles.includes('hr') || req.auth.roles.includes('admin')
}

const toDate = (v: string) => new Date(`${v}T00:00:00.000Z`)

export async function handler(req: AuthedRequest, res: VercelResponse) {
  const sub = typeof req.query.sub === 'string' ? req.query.sub : undefined

  if (!sub && req.method === 'GET') {
    const events = await prisma.calendarEvent.findMany({ orderBy: { startDate: 'asc' } })
    res.status(200).json(events)
    return
  }

  if (!isManager(req)) {
    res.status(403).json({ message: 'Insufficient permissions' })
    return
  }

  if (!sub && req.method === 'POST') {
    const parsed = upsertSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ message: parsed.error.issues[0]?.message ?? 'Invalid event' })
      return
    }
    const { startDate, endDate, ...rest } = parsed.data
    if (endDate && endDate < startDate) {
      res.status(400).json({ message: 'End date can\'t be before the start date' })
      return
    }
    const event = await prisma.calendarEvent.create({
      data: { ...rest, startDate: toDate(startDate), endDate: endDate ? toDate(endDate) : null, createdBy: req.auth.sub },
    })
    logAudit(req.auth.sub, 'create', 'calendar_event', event.id)
    res.status(201).json(event)
    return
  }

  if (sub && req.method === 'DELETE') {
    try {
      await prisma.calendarEvent.delete({ where: { id: sub } })
    } catch (err) {
      if (isNotFoundError(err)) {
        res.status(404).json({ message: 'Event not found' })
        return
      }
      throw err
    }
    logAudit(req.auth.sub, 'delete', 'calendar_event', sub)
    res.status(204).end()
    return
  }

  res.status(404).json({ message: 'Not found' })
}
