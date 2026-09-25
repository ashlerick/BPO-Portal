import type { VercelResponse } from '@vercel/node'
import { prisma } from '../prisma.js'
import type { AuthedRequest } from '../middleware.js'
import { formatDisplayName } from '../names.js'

export async function handler(req: AuthedRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ message: 'Method not allowed' })
    return
  }

  const limit = Math.min(Number(req.query.limit) || 50, 200)

  const logs = await prisma.auditLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
  })

  const userIds = [...new Set(logs.map((l) => l.userId))]
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, firstName: true, middleName: true, lastName: true, email: true },
  })
  const userById = new Map(users.map((u) => [u.id, u]))

  res.status(200).json(
    logs.map((l) => {
      const actor = userById.get(l.userId)
      return {
        id: l.id,
        user: actor ? formatDisplayName(actor.firstName, actor.middleName, actor.lastName) : 'Unknown',
        action: l.action,
        resource: l.resource,
        resourceId: l.resourceId,
        result: l.result,
        createdAt: l.createdAt,
      }
    }),
  )
}

