import type { VercelResponse } from '@vercel/node'
import { z } from 'zod'
import { prisma } from '../prisma.js'
import type { AuthedRequest } from '../middleware.js'
import { logAudit } from '../audit.js'
import { describeIssue, forbid, hasRole } from './util.js'

// The seating plan under /hr/seating: a grid of rows and seats per row. Each seat holds a plain-text name (no user account needed),
// the switch and port it uses, its wall jack and a note. Admin only.
//   GET  /seating   the saved plan (null before anyone has saved one)
//   PUT  /seating   replaces the whole plan
// The plan is one JSON value in PortalSetting, so it needs no table of its own. Seats are keyed "row-column" (both from 0) and
// are kept even when the grid is made smaller, so growing it again brings the names back. "extras" are the ports that are not a
// cube (the boss's office, the balancer).

const KEY = 'seating'
const MAX_SIDE = 12

const text = (max: number) => z.string().trim().max(max)

const seatSchema = z.object({
  name: text(60),
  sw: text(40),
  port: text(20),
  jack: text(40),
  note: text(200),
})

// A port that is not a cube: the boss's office, the balancer.
const extraSchema = z.object({
  label: text(60),
  sw: text(40),
  port: text(20),
  note: text(200),
})

const planSchema = z.object({
  title: text(80),
  rows: z.number().int().min(1).max(MAX_SIDE),
  cols: z.number().int().min(1).max(MAX_SIDE),
  seats: z.record(z.string().regex(/^\d{1,2}-\d{1,2}$/), seatSchema),
  extras: z.array(extraSchema).max(24).default([]),
})

export async function handler(req: AuthedRequest, res: VercelResponse) {
  if (!hasRole(req, 'admin')) return forbid(res)

  if (req.method === 'GET') {
    const row = await prisma.portalSetting.findUnique({ where: { key: KEY } })
    return res.status(200).json(row ? { ...(row.value as object), updatedAt: row.updatedAt } : null)
  }

  if (req.method === 'PUT') {
    const parsed = planSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0] ? describeIssue(parsed.error.issues[0]) : 'The seating plan is not valid' })
    }
    const saved = await prisma.portalSetting.upsert({
      where: { key: KEY },
      update: { value: parsed.data },
      create: { key: KEY, value: parsed.data },
    })
    await logAudit(req.auth.sub, 'update', 'seating', null)
    return res.status(200).json({ ...parsed.data, updatedAt: saved.updatedAt })
  }

  res.status(404).json({ message: 'Not found' })
}
