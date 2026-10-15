import type { VercelRequest, VercelResponse } from '@vercel/node'
import { timingSafeEqual } from 'node:crypto'
import { prisma } from '../prisma.js'
import { notifyRole, notifyUsers } from '../notify.js'
import { inventoryMonthStart } from './inventory.js'

// Monthly condition-check reminder, called by a Vercel cron on the 1st
// (see vercel.json). Vercel sends "Authorization: Bearer $CRON_SECRET";
// with no CRON_SECRET configured the endpoint refuses everything.
//   - each item holder is asked to check the condition of their items
//   - HR/Admin get one summary of everything still unchecked
// Safe to run twice: anyone already reminded this month is skipped.

function authorized(req: VercelRequest): boolean {
  const secret = process.env.CRON_SECRET
  const header = req.headers.authorization
  if (!secret || !header) return false
  const expected = Buffer.from(`Bearer ${secret}`)
  const given = Buffer.from(header)
  return expected.length === given.length && timingSafeEqual(expected, given)
}

export async function handler(req: VercelRequest, res: VercelResponse) {
  if (!authorized(req)) return res.status(401).json({ message: 'Unauthorized' })

  const since = new Date(inventoryMonthStart())
  const items = await prisma.inventoryItem.findMany({
    where: {
      deletedAt: null,
      status: { in: ['available', 'assigned', 'repair'] },
      OR: [{ conditionCheckedAt: null }, { conditionCheckedAt: { lt: since } }],
    },
    include: { assignedTo: { select: { id: true, userId: true } } },
  })

  const perHolder = new Map<string, number>()
  for (const i of items) {
    if (i.assignedTo) perHolder.set(i.assignedTo.userId, (perHolder.get(i.assignedTo.userId) ?? 0) + 1)
  }

  const alreadyReminded = new Set(
    (
      await prisma.notification.findMany({
        where: { type: 'inventory_check', createdAt: { gte: since }, userId: { in: [...perHolder.keys()] } },
        select: { userId: true },
      })
    ).map((n) => n.userId),
  )

  let reminded = 0
  for (const [userId, count] of perHolder) {
    if (alreadyReminded.has(userId)) continue
    await notifyUsers([userId], {
      type: 'inventory_check',
      title: 'Monthly check: please check your company items',
      body: `${count} item${count === 1 ? '' : 's'} to check. Mark each one's condition in My Profile.`,
      link: '/profile',
    })
    reminded++
  }

  if (items.length > 0) {
    const hrAlready = await prisma.notification.count({
      where: { type: 'inventory_check', createdAt: { gte: since }, link: '/inventory' },
    })
    if (hrAlready === 0) {
      await notifyRole(['hr', 'admin'], {
        type: 'inventory_check',
        title: 'Monthly inventory check',
        body: `${items.length} item${items.length === 1 ? '' : 's'} still to check this month.`,
        link: '/inventory',
      })
    }
  }

  return res.status(200).json({ holdersReminded: reminded, itemsDue: items.length })
}
