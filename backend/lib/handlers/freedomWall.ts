import type { VercelResponse } from '@vercel/node'
import { z } from 'zod'
import { prisma } from '../prisma.js'
import type { AuthedRequest } from '../middleware.js'
import { aliasForOldPost, emojiFor, freshAlias } from '../aliases.js'
import { forbid, isHrOrAdmin, notFound, parseBody, queryString } from './util.js'

// Freedom Wall under /hr/freedom-wall: an anonymous board everyone can read.
//   GET          posts, newest first (HR/Admin also see hidden ones)
//   POST         {body} — anyone signed in; the author is NOT recorded
//   PUT /:id     {hidden} — HR/Admin moderate
//   DELETE /:id  HR/Admin
// Anonymity is the point: nothing here stores or audit-logs who posted. Each
// post gets a random "Anonymous <adjective> <animal>" name (lib/aliases.ts).

const postSchema = z.object({ body: z.string().trim().min(1, 'Write something first').max(1000) })
const hideSchema = z.object({ hidden: z.boolean() })

const serialize = (p: { id: string; body: string; alias: string | null; hidden: boolean; createdAt: Date }) => {
  const alias = p.alias ?? aliasForOldPost(p.id)
  return { id: p.id, body: p.body, alias, emoji: emojiFor(alias), hidden: p.hidden, createdAt: p.createdAt }
}

export async function handler(req: AuthedRequest, res: VercelResponse) {
  const sub = queryString(req, 'sub')
  const hr = isHrOrAdmin(req)

  if (!sub && req.method === 'GET') {
    const rows = await prisma.freedomPost.findMany({
      where: hr ? {} : { hidden: false },
      orderBy: { createdAt: 'desc' },
      take: 200,
    })
    return res.status(200).json(rows.map(serialize))
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
