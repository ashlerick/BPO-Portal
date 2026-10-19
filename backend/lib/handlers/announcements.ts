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
  // How long a new highlight lasts, in days. Null (or left out) with highlighted = until HR removes it.
  highlightDays: z.number().int().min(1).max(30).nullable().optional(),
  // Asks everyone to do something: a to-do for each active employee, due on this date (YYYY-MM-DD).
  needsAction: z.boolean().optional(),
  actionDueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter the due date as a date').nullable().optional(),
})

const DAY_MS = 24 * 60 * 60 * 1000
// An emergency ends 24 hours after it is posted unless HR sets an end date, so one cannot linger for weeks.
const EMERGENCY_DEFAULT_MS = DAY_MS
const highlightActive = (a: { highlighted: boolean; highlightUntil: Date | null }, now = new Date()) =>
  a.highlighted && (!a.highlightUntil || a.highlightUntil > now)

// Tells every other account about a newly published announcement.
async function notifyAllOfAnnouncement(title: string, category: string, authorId: string, actionDue?: Date | null) {
  const users = await prisma.user.findMany({ where: { id: { not: authorId } }, select: { id: true } })
  await notifyUsers(
    users.map((u) => u.id),
    {
      type: 'announcement',
      title: `New announcement: ${title}`,
      body: actionDue ? `${category} · action needed by ${actionDue.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}` : category,
      link: '/announcements',
    },
  )
}

// "Needs action": an announcement that asks people to do something (submit a form, finish a training, sign a policy) gives
// each active employee a to-do for it, due on its date. Completing the to-do counts as their "Got it" (see todos.ts). Run
// when the announcement is published, and only once: a draft gets its to-dos when it is published.
async function createActionTodos(a: Announcement): Promise<void> {
  if (!a.needsAction || !a.published) return
  if ((await prisma.todo.count({ where: { announcementId: a.id } })) > 0) return
  const author = await prisma.employee.findUnique({ where: { userId: a.authorId }, select: { id: true } })
  const people = await prisma.employee.findMany({
    where: { status: 'active', user: { active: true }, ...(author && { id: { not: author.id } }) },
    select: { id: true },
  })
  if (people.length === 0) return
  const link = process.env.FRONTEND_URL ? `${process.env.FRONTEND_URL}/announcements/${a.id}` : null
  const preview = a.content.length > 200 ? `${a.content.slice(0, 200).trimEnd()}…` : a.content
  await prisma.todo.createMany({
    data: people.map((p) => ({
      employeeId: p.id,
      title: a.title,
      description: `Action needed (from an announcement). ${preview}`,
      dueDate: a.actionDueAt,
      link,
      priority: a.category === EMERGENCY_CATEGORY || a.category === 'Important notices' ? 'urgent' : 'normal',
      createdBy: a.authorId,
      announcementId: a.id,
    })),
  })
}

function isManager(req: AuthedRequest): boolean {
  return req.auth.roles.includes('hr') || req.auth.roles.includes('admin')
}

// Adds the engagement fields: reaction counts and the caller's own, whether it needs a "Got it" and whether the
// caller gave one. HR/Admin also get how many have acknowledged out of how many active accounts.
async function decorate(rows: Announcement[], userId: string, manager: boolean) {
  if (rows.length === 0) return []
  const ids = rows.map((r) => r.id)
  const [reacted, ackCounts, myAcks, total, actionCounts, myTodos] = await Promise.all([
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
    manager
      ? prisma.todo.groupBy({ by: ['announcementId', 'status'], where: { announcementId: { in: ids }, deletedAt: null }, _count: { _all: true } })
      : Promise.resolve([]),
    prisma.todo.findMany({
      where: { announcementId: { in: ids }, deletedAt: null, employee: { userId } },
      select: { id: true, announcementId: true, status: true },
    }),
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
      featured: highlightActive(a) || a.category === EMERGENCY_CATEGORY,
      reactions,
      reactors,
      myReaction,
      needsAck,
      acknowledged: myAcks.some((m) => m.announcementId === a.id),
      // The caller's own to-do for this announcement, when it asks for action.
      myAction: myTodos.find((t) => t.announcementId === a.id) ?? null,
      ...(manager && a.needsAction && {
        actionTotal: actionCounts.filter((c) => c.announcementId === a.id).reduce((n, c) => n + c._count._all, 0),
        actionDone: actionCounts.find((c) => c.announcementId === a.id && c.status === 'done')?._count._all ?? 0,
      }),
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
    // On a notice that asks for a "Got it" (policy, important, emergency), reacting IS the "Got it": one tap, and HR's
    // list of who has acknowledged counts it. Taking the reaction back does not undo the acknowledgement.
    if (ACK_CATEGORIES.includes(announcement.category)) {
      await prisma.announcementAck.createMany({ data: [{ announcementId: id, userId: req.auth.sub }], skipDuplicates: true })
    }
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

// HR/Admin: who has done the action and who still has it open.
async function handleActionList(req: AuthedRequest, res: VercelResponse, id: string) {
  if (!isManager(req)) {
    res.status(403).json({ message: 'Insufficient permissions' })
    return
  }
  const todos = await prisma.todo.findMany({
    where: { announcementId: id, deletedAt: null },
    include: { employee: { include: { user: { select: { firstName: true, middleName: true, lastName: true } } } } },
    orderBy: { employee: { user: { lastName: 'asc' } } },
  })
  const name = (t: (typeof todos)[number]) => formatDisplayName(t.employee.user.firstName, t.employee.user.middleName, t.employee.user.lastName)
  res.status(200).json({
    done: todos.filter((t) => t.status === 'done').map((t) => ({ name: name(t), at: t.completedAt })),
    pending: todos.filter((t) => t.status !== 'done').map(name),
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

  const { title, category, content, published, publishAt, expireAt, highlighted, highlightDays, needsAction, actionDueOn } = parsed.data
  if (needsAction && !actionDueOn) {
    res.status(400).json({ message: 'Pick the date the action is due.' })
    return
  }
  const startsAt = publishAt ? new Date(publishAt) : new Date()
  const announcement = await prisma.announcement.create({
    data: {
      title,
      highlighted: highlighted ?? false,
      highlightUntil: highlighted && highlightDays ? new Date(Date.now() + highlightDays * DAY_MS) : null,
      needsAction: !!needsAction,
      actionDueAt: needsAction && actionDueOn ? new Date(`${actionDueOn}T00:00:00.000Z`) : null,
      ...(category !== undefined && { category }),
      content,
      authorId: req.auth.sub,
      published: published ?? false,
      publishAt: startsAt,
      expireAt: expireAt ? new Date(expireAt) : category === EMERGENCY_CATEGORY ? new Date(startsAt.getTime() + EMERGENCY_DEFAULT_MS) : null,
    },
  })

  logAudit(req.auth.sub, 'create', 'announcement', announcement.id, 'success', announcement.title)
  if (announcement.published) await notifyAllOfAnnouncement(announcement.title, announcement.category, req.auth.sub, announcement.actionDueAt)
  await createActionTodos(announcement)
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

  const { title, category, content, published, publishAt, expireAt, highlighted, highlightDays } = parsed.data
  // Turning a highlight on starts its clock (3 days unless HR chose); turning it off clears it.
  const highlightUntil =
    highlighted === false ? null : highlighted === true || highlightDays !== undefined
      ? (highlightDays === null ? null : new Date(Date.now() + (highlightDays ?? 3) * DAY_MS))
      : undefined
  // An emergency that has no end gets one (24 hours after it started).
  const before = await prisma.announcement.findUnique({ where: { id }, select: { category: true, expireAt: true, publishAt: true, createdAt: true, published: true } })
  const becomesEmergency = (category ?? before?.category) === EMERGENCY_CATEGORY
  const noEnd = expireAt === undefined ? !before?.expireAt : !expireAt
  const emergencyEnd = becomesEmergency && noEnd ? new Date((before?.publishAt ?? before?.createdAt ?? new Date()).getTime() + EMERGENCY_DEFAULT_MS) : undefined
  let announcement
  try {
    announcement = await prisma.announcement.update({
      where: { id },
      data: {
        ...(title !== undefined && { title }),
        ...(highlighted !== undefined && { highlighted }),
        ...(highlightUntil !== undefined && { highlightUntil }),
        ...(category !== undefined && { category }),
        ...(content !== undefined && { content }),
        ...(published !== undefined && { published }),
        ...(publishAt !== undefined && { publishAt: new Date(publishAt) }),
        // Publishing a draft posts it as of now, not as of the day it was first saved.
        ...(publishAt === undefined && published === true && before && !before.published && { publishAt: new Date() }),
        ...(expireAt !== undefined && { expireAt: expireAt ? new Date(expireAt) : null }),
        ...(emergencyEnd && { expireAt: emergencyEnd }),
      },
    })
  } catch (err) {
    if (isNotFoundError(err)) {
      res.status(404).json({ message: 'Announcement not found' })
      return
    }
    throw err
  }

  logAudit(req.auth.sub, 'update', 'announcement', id, 'success', announcement.title)
  // A draft that has just been published tells everyone, the same as posting it straight away.
  if (published === true && before && !before.published) {
    await notifyAllOfAnnouncement(announcement.title, announcement.category, req.auth.sub, announcement.actionDueAt)
    await createActionTodos(announcement)
  }
  res.status(200).json((await decorate([announcement], req.auth.sub, true))[0])
}

async function handleDelete(req: AuthedRequest, res: VercelResponse, id: string) {
  if (!isManager(req)) {
    res.status(403).json({ message: 'Insufficient permissions' })
    return
  }
  const gone = await prisma.announcement.findUnique({ where: { id }, select: { title: true } })
  try {
    await prisma.announcement.delete({ where: { id } })
    // Its to-dos are hidden with it (soft delete, like every to-do removal).
    await prisma.todo.updateMany({ where: { announcementId: id, deletedAt: null }, data: { deletedAt: new Date() } })
  } catch (err) {
    if (isNotFoundError(err)) {
      res.status(404).json({ message: 'Announcement not found' })
      return
    }
    throw err
  }
  logAudit(req.auth.sub, 'delete', 'announcement', id, 'success', gone?.title)
  res.status(204).end()
}

export async function handler(req: AuthedRequest, res: VercelResponse) {
  const sub = typeof req.query.sub === 'string' ? req.query.sub : undefined
  const action = typeof req.query.action === 'string' ? req.query.action : undefined

  if (sub && req.method === 'POST' && action === 'react') return handleReact(req, res, sub)
  if (sub && req.method === 'POST' && action === 'ack') return handleAck(req, res, sub)
  if (sub && req.method === 'GET' && action === 'acks') return handleAckList(req, res, sub)
  if (sub && req.method === 'GET' && action === 'actions') return handleActionList(req, res, sub)
  if (!sub && req.method === 'GET') return handleList(req, res)
  if (!sub && req.method === 'POST') return handleCreate(req, res)
  if (sub && req.method === 'PUT') return handleUpdate(req, res, sub)
  if (sub && req.method === 'DELETE') return handleDelete(req, res, sub)

  res.status(404).json({ message: 'Not found' })
}

