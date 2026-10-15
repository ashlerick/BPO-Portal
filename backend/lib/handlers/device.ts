import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createHash, randomBytes } from 'node:crypto'
import { z } from 'zod'
import { prisma } from '../prisma.js'
import { withCors, type AuthedRequest } from '../middleware.js'
import { logAudit } from '../audit.js'
import { formatDisplayName } from '../names.js'
import { notFound, parseBody, queryString } from './util.js'

// Desktop app (BPO Time) sign-in, v1. See desktop_app_plan.md section 5.3.
//
//   POST   /hr/device-code     (portal login)   -> { code }   one-time, 60 seconds
//   POST   /hr/device-token    (no login; the code is the credential)
//                              {code, deviceName} -> { token, user }
//   GET    /hr/device-me       (Bearer device token) -> who this PC is signed in as
//   GET    /hr/devices         (portal login)   -> my connected PCs
//   DELETE /hr/devices/:id     (portal login)   -> disconnect one
//
// The portal's own login token is never put in a link. The app receives a
// short-lived single-use code, and swaps it for its own device token, which:
//   - is a different, opaque token (only its hash is stored),
//   - can be revoked per PC, and stops working if the account is deactivated,
//   - is accepted ONLY by device-me (and later the time-tracking endpoints),
//     never by the rest of the portal API.

const CODE_TTL_MS = 60_000
const MAX_LIVE_CODES = 5

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')
const newSecret = () => randomBytes(32).toString('base64url')

const exchangeSchema = z.object({
  code: z.string().trim().min(20).max(100),
  deviceName: z.string().trim().min(1).max(80).optional(),
})

// ---- portal login required

export async function createCode(req: AuthedRequest, res: VercelResponse) {
  const now = new Date()
  // housekeeping: forget codes that are spent or long expired
  await prisma.deviceCode.deleteMany({
    where: { userId: req.auth.sub, OR: [{ usedAt: { not: null } }, { expiresAt: { lt: new Date(now.getTime() - 3600_000) } }] },
  })
  const live = await prisma.deviceCode.count({ where: { userId: req.auth.sub, usedAt: null, expiresAt: { gt: now } } })
  if (live >= MAX_LIVE_CODES) {
    return res.status(429).json({ message: 'Too many sign-in requests at once. Wait a minute and press Launch App again.' })
  }
  const code = newSecret()
  await prisma.deviceCode.create({
    data: { userId: req.auth.sub, codeHash: sha256(code), expiresAt: new Date(now.getTime() + CODE_TTL_MS) },
  })
  return res.status(201).json({ code, expiresInSeconds: CODE_TTL_MS / 1000 })
}

export async function listDevices(req: AuthedRequest, res: VercelResponse) {
  const rows = await prisma.device.findMany({
    where: { userId: req.auth.sub, revokedAt: null },
    orderBy: { createdAt: 'desc' },
  })
  return res.status(200).json(
    rows.map((d) => ({ id: d.id, name: d.name, createdAt: d.createdAt, lastSeenAt: d.lastSeenAt })),
  )
}

export async function revokeDevice(req: AuthedRequest, res: VercelResponse) {
  const id = queryString(req, 'sub')
  if (!id) return notFound(res)
  const done = await prisma.device.updateMany({
    where: { id, userId: req.auth.sub, revokedAt: null },
    data: { revokedAt: new Date() },
  })
  if (done.count === 0) return notFound(res, 'Device not found')
  await logAudit(req.auth.sub, 'revoke', 'device', id)
  return res.status(204).end()
}

// ---- no portal login: authenticated by the code, or by the device token

export async function exchangeCode(req: VercelRequest, res: VercelResponse) {
  withCors(res)
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' })

  const data = parseBody(exchangeSchema, req.body, res)
  if (!data) return

  // Spend the code atomically: two requests with the same code cannot both win.
  const now = new Date()
  const spent = await prisma.deviceCode.updateMany({
    where: { codeHash: sha256(data.code), usedAt: null, expiresAt: { gt: now } },
    data: { usedAt: now },
  })
  if (spent.count === 0) {
    return res.status(400).json({ message: 'This sign-in link has expired or was already used. Press Launch App in the portal again.' })
  }
  const row = await prisma.deviceCode.findUnique({ where: { codeHash: sha256(data.code) }, include: { user: true } })
  if (!row || !row.user.active) {
    return res.status(403).json({ message: 'This account is not active.' })
  }

  const token = newSecret()
  const device = await prisma.device.create({
    data: { userId: row.userId, name: data.deviceName ?? 'Windows PC', tokenHash: sha256(token), lastSeenAt: now },
  })
  await logAudit(row.userId, 'connect', 'device', device.id)

  return res.status(201).json({
    token,
    deviceId: device.id,
    user: {
      id: row.user.id,
      name: formatDisplayName(row.user.firstName, row.user.middleName, row.user.lastName),
      firstName: row.user.firstName,
    },
  })
}

export async function deviceMe(req: VercelRequest, res: VercelResponse) {
  withCors(res)
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'GET') return res.status(405).json({ message: 'Method not allowed' })

  const header = req.headers.authorization
  const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined
  if (!token) return res.status(401).json({ message: 'Missing device token' })

  const device = await prisma.device.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } })
  if (!device || device.revokedAt || !device.user.active) {
    // The app should drop its token and show the sign-in screen again.
    return res.status(401).json({ message: 'This PC is no longer connected. Press Launch App in the portal to connect again.' })
  }

  // note when this PC was last seen, at most once a minute
  if (!device.lastSeenAt || Date.now() - device.lastSeenAt.getTime() > 60_000) {
    await prisma.device.update({ where: { id: device.id }, data: { lastSeenAt: new Date() } })
  }

  return res.status(200).json({
    user: {
      id: device.user.id,
      name: formatDisplayName(device.user.firstName, device.user.middleName, device.user.lastName),
      firstName: device.user.firstName,
    },
    device: { id: device.id, name: device.name },
  })
}
