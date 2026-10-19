import type { VercelRequest, VercelResponse } from '@vercel/node'
import { timingSafeEqual } from 'node:crypto'
import { prisma } from '../prisma.js'
import { OTHER_DAYS, ROUTINE_DAYS, routineWhere } from '../auditPolicy.js'

// Monthly clean-up of the audit log, called by a Vercel cron (see vercel.json). Vercel sends "Authorization: Bearer $CRON_SECRET";
// with no CRON_SECRET configured the endpoint refuses everything. Routine entries older than ROUTINE_DAYS and all other entries
// older than OTHER_DAYS are deleted (lib/auditPolicy.ts). Safe to run twice.

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
  const day = 24 * 3_600_000
  const routineCutoff = new Date(Date.now() - ROUTINE_DAYS * day)
  const otherCutoff = new Date(Date.now() - OTHER_DAYS * day)
  const routine = await prisma.auditLog.deleteMany({ where: { AND: [routineWhere, { createdAt: { lt: routineCutoff } }] } })
  const other = await prisma.auditLog.deleteMany({ where: { AND: [{ NOT: routineWhere }, { createdAt: { lt: otherCutoff } }] } })
  res.status(200).json({ deletedRoutine: routine.count, deletedOther: other.count })
}
