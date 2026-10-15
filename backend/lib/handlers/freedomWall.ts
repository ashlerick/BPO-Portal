import type { VercelResponse } from '@vercel/node'
import { createHmac } from 'node:crypto'
import { z } from 'zod'
import { prisma } from '../prisma.js'
import type { AuthedRequest } from '../middleware.js'
import { aliasForOldPost, emojiFor, freshAlias } from '../aliases.js'
import { forbid, isHrOrAdmin, notFound, parseBody, queryString } from './util.js'

// Freedom Wall under /hr/freedom-wall: an anonymous board everyone can read.
//   GET          posts, newest first (HR/Admin also see hidden ones)
//   POST         {body} — anyone signed in; the author is NOT recorded
//   POST /:id?action=react   {emoji|null} — one reaction per person (stored as an HMAC, not a user id)
//   PUT /:id     {hidden} — HR/Admin moderate
//   DELETE /:id  HR/Admin
// Anonymity is the point: nothing here stores or audit-logs who posted. Each
// post gets a random "Anonymous <adjective> <animal>" name (lib/aliases.ts).

const postSchema = z.object({ body: z.string().trim().min(1, 'Write something first').max(1000) })
const hideSchema = z.object({ hidden: z.boolean() })

// The reactions on offer. Anything else is refused.
const REACTIONS = ['😂', '❤️', '👏', '🔥', '😮'] as const
const reactSchema = z.object({ emoji: z.enum(REACTIONS).nullable() })

// Identifies "this person on this post" without storing who they are.
function reactorKey(userId: string, postId: string): string {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET is not configured')
  return createHmac('sha256', secret).update(`${userId}:${postId}`).digest('hex')
}

type PostRow = { id: string; body: string; alias: string | null; hidden: boolean; createdAt: Date }

const serialize = (p: PostRow, reactions: Record<string, number> = {}, mine: string | null = null) => {
  const alias = p.alias ?? aliasForOldPost(p.id)
  return { id: p.id, body: p.body, alias, emoji: emojiFor(alias), hidden: p.hidden, createdAt: p.createdAt, reactions, mine }
}

// Adds each post's reaction counts and the signed-in person's own reaction.
async function withReactions(rows: PostRow[], userId: string) {
  if (rows.length === 0) return []
  const ids = rows.map((r) => r.id)
  const counts = await prisma.freedomReaction.groupBy({ by: ['postId', 'emoji'], where: { postId: { in: ids } }, _count: { _all: true } })
  const mineRows = await prisma.freedomReaction.findMany({
    where: { reactorKey: { in: ids.map((id) => reactorKey(userId, id)) } },
    select: { postId: true, emoji: true },
  })
  const mine = new Map(mineRows.map((m) => [m.postId, m.emoji]))
  const byPost = new Map<string, Record<string, number>>()
  for (const c of counts) byPost.set(c.postId, { ...(byPost.get(c.postId) ?? {}), [c.emoji]: c._count._all })
  return rows.map((r) => serialize(r, byPost.get(r.id) ?? {}, mine.get(r.id) ?? null))
}

export async function handler(req: AuthedRequest, res: VercelResponse) {
  const sub = queryString(req, 'sub')
  const hr = isHrOrAdmin(req)

  if (!sub && req.method === 'GET') {
    // ?limit=24&before=<createdAt of the last note you have> pages through
    // the wall. One extra row is returned so the page can tell whether there
    // are older notes. Without ?limit it behaves as before (newest 200).
    const limitParam = Number(queryString(req, 'limit'))
    const limit = Number.isInteger(limitParam) && limitParam > 0 ? Math.min(limitParam, 60) : null
    const beforeParam = queryString(req, 'before')
    const before = beforeParam && !Number.isNaN(Date.parse(beforeParam)) ? new Date(beforeParam) : null
    const rows = await prisma.freedomPost.findMany({
      where: { ...(hr ? {} : { hidden: false }), ...(before && { createdAt: { lt: before } }) },
      orderBy: { createdAt: 'desc' },
      take: limit ? limit + 1 : 200,
    })
    return res.status(200).json(await withReactions(rows, req.auth.sub))
  }

  if (!sub && req.method === 'POST') {
    const data = parseBody(postSchema, req.body, res)
    if (!data) return
    // A random name for this post, avoiding the ones on screen right now.
    const recent = await prisma.freedomPost.findMany({ orderBy: { createdAt: 'desc' }, take: 60, select: { alias: true } })
    const alias = freshAlias(new Set(recent.map((r) => r.alias).filter((a): a is string => !!a)))
    const created = await prisma.freedomPost.create({ data: { body: data.body, alias } })
    return res.status(201).json(serialize(created))
  }

  // React to a post: the emoji, or null to take your reaction back. One per person.
  if (sub && req.method === 'POST' && queryString(req, 'action') === 'react') {
    const data = parseBody(reactSchema, req.body, res)
    if (!data) return
    const post = await prisma.freedomPost.findFirst({ where: { id: sub, ...(hr ? {} : { hidden: false }) } })
    if (!post) return notFound(res, 'Post not found')
    const key = reactorKey(req.auth.sub, sub)
    if (data.emoji === null) {
      await prisma.freedomReaction.deleteMany({ where: { postId: sub, reactorKey: key } })
    } else {
      await prisma.freedomReaction.upsert({
        where: { postId_reactorKey: { postId: sub, reactorKey: key } },
        create: { postId: sub, reactorKey: key, emoji: data.emoji },
        update: { emoji: data.emoji },
      })
    }
    return res.status(200).json((await withReactions([post], req.auth.sub))[0])
  }

  if (sub && req.method === 'PUT') {
    if (!hr) return forbid(res)
    const data = parseBody(hideSchema, req.body, res)
    if (!data) return
    const existing = await prisma.freedomPost.findUnique({ where: { id: sub } })
    if (!existing) return notFound(res, 'Post not found')
    const updated = await prisma.freedomPost.update({ where: { id: sub }, data: { hidden: data.hidden } })
    return res.status(200).json(serialize(updated))
  }

  if (sub && req.method === 'DELETE') {
    if (!hr) return forbid(res)
    await prisma.freedomPost.deleteMany({ where: { id: sub } })
    return res.status(204).end()
  }

  notFound(res)
}
