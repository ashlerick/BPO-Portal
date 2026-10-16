import type { VercelResponse } from '@vercel/node'
import { z } from 'zod'
import { prisma } from '../prisma.js'
import type { AuthedRequest } from '../middleware.js'
import { logAudit } from '../audit.js'
import { isNotFoundError } from '../errors.js'
import { notifyUsers } from '../notify.js'
import { formatDisplayName } from '../names.js'
import type { Announcement } from '@prisma/client'

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

// Reactions people can leave (one each), and the categories that ask for a "Got it" acknowledgement.
const REACTIONS = ['👍', '❤️', '🎉'] as const
export const ACK_CATEGORIES: readonly string[] = ['Policy updates', 'Important notices', 'Emergency announcements']
const reactSchema = z.object({ emoji: z.enum(REACTIONS).nullable() })
export const EMERGENCY_CATEGORY = 'Emergency announcements'
// Names sent per reaction; the count is always exact, the page says "and N more" past this.
const MAX_REACTOR_NAMES = 30

const upsertSchema = z.object({
  title: z.string().min(1),
  category: z.enum(ANNOUNCEMENT_CATEGORIES).optional(),
  content: z.string().min(1),
  published: z.boolean().optional(),
  publishAt: z.string().datetime().optional(),
  expireAt: z.string().datetime().nullable().optional(),
  highlighted: z.boolean().optional(),
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

// Adds the engagement fields: reaction counts and the caller's own, whether it needs a "Got it" and whether the
// caller gave one. HR/Admin also get how many have acknowledged out of how many active accounts.
async function decorate(rows: Announcement[], userId: string, manager: boolean) {
  if (rows.length === 0) return []
  const ids = rows.map((r) => r.id)
  const [reacted, ackCounts, myAcks, total] = await Promise.all([
    prisma.announcementReaction.findMany({
      where: { announcementId: { in: ids } },
      orderBy: { createdAt: 'asc' },
      select: { announcementId: true, userId: true, emoji: true, user: { select: { firstName: true, middleName: true, lastName: true } } },
    }),
    manager
      ? prisma.announcementAck.groupBy({ by: ['announcementId'], where: { announcementId: { in: ids } }, _count: { _all: true } })
      : Promise.resolve([]),
    prisma.announcementAck.findMany({ where: { announcementId: { in: ids }, userId }, select: { announcementId: true } }),
    manager ? prisma.user.count({ where: { active: true } }) : Promise.resolve(0),
  ])
  return rows.map((a) => {
    // Counts, the caller's own, and who reacted. Announcements are not anonymous, so everyone sees the names.
    const reactions: Record<string, number> = {}
    const reactors: Record<string, string[]> = {}
    let myReaction: string | null = null
    for (const r of reacted) {
      if (r.announcementId !== a.id) continue
      reactions[r.emoji] = (reactions[r.emoji] ?? 0) + 1
      if ((reactors[r.emoji] ??= []).length < MAX_REACTOR_NAMES) reactors[r.emoji].push(formatDisplayName(r.user.firstName, r.user.middleName, r.user.lastName))
      if (r.userId === userId) myReaction = r.emoji
    }
    const needsAck = ACK_CATEGORIES.includes(a.category)
    return {
      ...a,
      // Pinned by HR, or an emergency (those are always highlighted). Shown first on the portal and on the app.
      featured: a.highlighted || a.category === EMERGENCY_CATEGORY,
      reactions,
      reactors,
      myReaction,
      needsAck,
      acknowledged: myAcks.some((m) => m.announcementId === a.id),
      ...(manager && needsAck && { ackCount: ackCounts.find((c) => c.announcementId === a.id)?._count._all ?? 0, ackTotal: total }),
    }
  })
}

async function findVisible(req: AuthedRequest, id: string) {
  return prisma.announcement.findFirst({ where: { id, ...(isManager(req) ? {} : { published: true }) } })
}

async function handleReact(req: AuthedRequest, res: VercelResponse, id: string) {
  const parsed = reactSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ message: 'Pick one of the reactions' })
    return
  }
  const announcement = await findVisible(req, id)
  if (!announcement) {
    res.status(404).json({ message: 'Announcement not found' })
    return
  }
  const { emoji } = parsed.data
  if (emoji === null) {
    await prisma.announcementReaction.deleteMany({ where: { announcementId: id, userId: req.auth.sub } })
  } else {
    await prisma.announcementReaction.upsert({
      where: { announcementId_userId: { announcementId: id, userId: req.auth.sub } },
      create: { announcementId: id, userId: req.auth.sub, emoji },
      update: { emoji },
    })
  }
  res.status(200).json((await decorate([announcement], req.auth.sub, isManager(req)))[0])
}

// "Got it": the caller confirms they have read it. Only for the categories that ask for it; doing it twice is fine.
async function handleAck(req: AuthedRequest, res: VercelResponse, id: string) {
  const announcement = await findVisible(req, id)
  if (!announcement) {
    res.status(404).json({ message: 'Announcement not found' })
    return
  }
  if (!ACK_CATEGORIES.includes(announcement.category)) {
    res.status(400).json({ message: "This announcement doesn't need an acknowledgement" })
    return
  }
  await prisma.announcementAck.createMany({ data: [{ announcementId: id, userId: req.auth.sub }], skipDuplicates: true })
  res.status(200).json((await decorate([announcement], req.auth.sub, isManager(req)))[0])
}

// HR/Admin: who has acknowledged, and which active accounts still have not.
async function handleAckList(req: AuthedRequest, res: VercelResponse, id: string) {
  if (!isManager(req)) {
    res.status(403).json({ message: 'Insufficient permissions' })
    return
  }
  const announcement = await prisma.announcement.findUnique({ where: { id } })
  if (!announcement) {
    res.status(404).json({ message: 'Announcement not found' })
    return
  }
  const acks = await prisma.announcementAck.findMany({
    where: { announcementId: id },
    orderBy: { ackedAt: 'asc' },
    include: { user: { select: { firstName: true, middleName: true, lastName: true } } },
  })
  const pending = await prisma.user.findMany({
    where: { active: true, id: { notIn: acks.map((a) => a.userId) } },
    select: { firstName: true, middleName: true, lastName: true },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  })
  res.status(200).json({
    acknowledged: acks.map((a) => ({ name: formatDisplayName(a.user.firstName, a.user.middleName, a.user.lastName), at: a.ackedAt })),
    pending: pending.map((u) => formatDisplayName(u.firstName, u.middleName, u.lastName)),
  })
}

async function handleList(req: AuthedRequest, res: VercelResponse) {
  // Expired announcements are still returned to everyone (they make up
  // the "Announcement history" section); the client splits active from
  // expired using expireAt. Drafts stay hidden from non-managers.
  const where = isManager(req) ? {} : { published: true }

  const announcements = await prisma.announcement.findMany({ where, orderBy: { publishAt: 'desc' } })
  res.status(200).json(await decorate(announcements, req.auth.sub, isManager(req)))
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

  const { title, category, content, published, publishAt, expireAt, highlighted } = parsed.data
  const announcement = await prisma.announcement.create({
    data: {
      title,
      highlighted: highlighted ?? false,
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
  res.status(201).json((await decorate([announcement], req.auth.sub, true))[0])
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

  const { title, category, content, published, publishAt, expireAt, highlighted } = parsed.data
  let announcement
  try {
    announcement = await prisma.announcement.update({
      where: { id },
      data: {
        ...(title !== undefined && { title }),
        ...(highlighted !== undefined && { highlighted }),
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
  res.status(200).json((await decorate([announcement], req.auth.sub, true))[0])
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
  const action = typeof req.query.action === 'string' ? req.query.action : undefined

  if (sub && req.method === 'POST' && action === 'react') return handleReact(req, res, sub)
  if (sub && req.method === 'POST' && action === 'ack') return handleAck(req, res, sub)
  if (sub && req.method === 'GET' && action === 'acks') return handleAckList(req, res, sub)
  if (!sub && req.method === 'GET') return handleList(req, res)
  if (!sub && req.method === 'POST') return handleCreate(req, res)
  if (sub && req.method === 'PUT') return handleUpdate(req, res, sub)
  if (sub && req.method === 'DELETE') return handleDelete(req, res, sub)

  res.status(404).json({ message: 'Not found' })
}

