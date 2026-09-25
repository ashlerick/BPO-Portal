import type { VercelResponse } from '@vercel/node'
import { z } from 'zod'
import { prisma } from '../prisma.js'
import type { AuthedRequest } from '../middleware.js'
import { logAudit } from '../audit.js'
import { isNotFoundError } from '../errors.js'
import { notifyUsers } from '../notify.js'

// GET /announcements, POST /announcements (create), PUT/DELETE
// /announcements/:id (via a vercel.json rewrite arriving as ?sub=<id>).
// Create/update/delete are HR/Admin only ("Publish HR announcements" /
// "Manage portal content" in bpo_plan.md's role definitions).

const ANNOUNCEMENT_CATEGORIES = [
  'Company announcements',
  'Policy updates',
  'Holidays',
  'Important notices',
  'Emergency announcements',
] as const

const upsertSchema = z.object({
  title: z.string().min(1),
  category: z.enum(ANNOUNCEMENT_CATEGORIES).optional(),
  content: z.string().min(1),
  published: z.boolean().optional(),
  publishAt: z.string().datetime().optional(),
  expireAt: z.string().datetime().nullable().optional(),
})

// Tells every other account about a newly published announcement.
async function notifyAllOfAnnouncement(title: string, category: string, authorId: string) {
  const users = await prisma.user.findMany({ where: { id: { not: authorId } }, select: { id: true } })
  await notifyUsers(
    users.map((u) => u.id),
    { type: 'announcement', title: `New announcement: ${title}`, body: category, link: '/announcements' },
  )
}

function isManager(req: AuthedRequest): boolean {
  return req.auth.roles.includes('hr') || req.auth.roles.includes('admin')
}

async function handleList(req: AuthedRequest, res: VercelResponse) {
  // Expired announcements are still returned to everyone (they make up
  // the "Announcement history" section); the client splits active from
  // expired using expireAt. Drafts stay hidden from non-managers.
  const where = isManager(req) ? {} : { published: true }

  const announcements = await prisma.announcement.findMany({ where, orderBy: { publishAt: 'desc' } })
  res.status(200).json(announcements)
}

async function handleCreate(req: AuthedRequest, res: VercelResponse) {
  if (!isManager(req)) {
    res.status(403).json({ message: 'Insufficient permissions' })
    return
  }
  const parsed = upsertSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ message: 'Invalid announcement payload' })
    return
  }

  const { title, category, content, published, publishAt, expireAt } = parsed.data
  const announcement = await prisma.announcement.create({
    data: {
      title,
      ...(category !== undefined && { category }),
      content,
      authorId: req.auth.sub,
      published: published ?? false,
      publishAt: publishAt ? new Date(publishAt) : new Date(),
      expireAt: expireAt ? new Date(expireAt) : null,
    },
  })

  logAudit(req.auth.sub, 'create', 'announcement', announcement.id)
  if (announcement.published) await notifyAllOfAnnouncement(announcement.title, announcement.category, req.auth.sub)
  res.status(201).json(announcement)
}

async function handleUpdate(req: AuthedRequest, res: VercelResponse, id: string) {
  if (!isManager(req)) {
    res.status(403).json({ message: 'Insufficient permissions' })
    return
  }
  const parsed = upsertSchema.partial().safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ message: 'Invalid announcement payload' })
    return
  }

  const { title, category, content, published, publishAt, expireAt } = parsed.data
  let announcement
  try {
    announcement = await prisma.announcement.update({
      where: { id },
      data: {
        ...(title !== undefined && { title }),
        ...(category !== undefined && { category }),
        ...(content !== undefined && { content }),
        ...(published !== undefined && { published }),
        ...(publishAt !== undefined && { publishAt: new Date(publishAt) }),
        ...(expireAt !== undefined && { expireAt: expireAt ? new Date(expireAt) : null }),
      },
    })
  } catch (err) {
    if (isNotFoundError(err)) {
      res.status(404).json({ message: 'Announcement not found' })
      return
    }
    throw err
  }

  logAudit(req.auth.sub, 'update', 'announcement', id)
  res.status(200).json(announcement)
}

async function handleDelete(req: AuthedRequest, res: VercelResponse, id: string) {
  if (!isManager(req)) {
    res.status(403).json({ message: 'Insufficient permissions' })
    return
  }
  try {
    await prisma.announcement.delete({ where: { id } })
  } catch (err) {
    if (isNotFoundError(err)) {
      res.status(404).json({ message: 'Announcement not found' })
      return
    }
    throw err
  }
  logAudit(req.auth.sub, 'delete', 'announcement', id)
  res.status(204).end()
}

export async function handler(req: AuthedRequest, res: VercelResponse) {
  const sub = typeof req.query.sub === 'string' ? req.query.sub : undefined

  if (!sub && req.method === 'GET') return handleList(req, res)
  if (!sub && req.method === 'POST') return handleCreate(req, res)
  if (sub && req.method === 'PUT') return handleUpdate(req, res, sub)
  if (sub && req.method === 'DELETE') return handleDelete(req, res, sub)

  res.status(404).json({ message: 'Not found' })
}

