import type { VercelResponse } from '@vercel/node'
import { prisma } from '../prisma.js'
import type { AuthedRequest } from '../middleware.js'

// GET /notifications — the caller's latest notifications + unread count.
// PUT /notifications/:id — mark one read. PUT /notifications/read-all —
// mark everything read. Always scoped to the caller's own rows.
export async function handler(req: AuthedRequest, res: VercelResponse) {
  const sub = typeof req.query.sub === 'string' ? req.query.sub : undefined

  if (!sub && req.method === 'GET') {
    const [items, unread] = await Promise.all([
      prisma.notification.findMany({
        where: { userId: req.auth.sub },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      prisma.notification.count({ where: { userId: req.auth.sub, readAt: null } }),
    ])
    res.status(200).json({ unread, items })
    return
  }

  if (sub === 'read-all' && req.method === 'PUT') {
    await prisma.notification.updateMany({
      where: { userId: req.auth.sub, readAt: null },
      data: { readAt: new Date() },
    })
    res.status(204).end()
    return
  }

  if (sub && req.method === 'PUT') {
    await prisma.notification.updateMany({
      where: { id: sub, userId: req.auth.sub, readAt: null },
      data: { readAt: new Date() },
    })
    res.status(204).end()
    return
  }

  res.status(404).json({ message: 'Not found' })
}
