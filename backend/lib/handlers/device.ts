import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createHash, randomBytes } from 'node:crypto'
import { z } from 'zod'
import { prisma } from '../prisma.js'
import { withCors, type AuthedRequest } from '../middleware.js'
import { logAudit } from '../audit.js'
import { todayInManila } from '../dates.js'
import { getClientIp } from '../request.js'
import { formatDisplayName } from '../names.js'
import { notFound, parseBody, queryString } from './util.js'
import { birthdaysToday } from './birthdays.js'
import { themeOf } from './settings.js'
import { BREAK_ALLOWANCE_SECONDS, BREAK_SLOTS, endBreak, finalizeBreaks, readBreaks, startBreak } from '../breaks.js'

// Desktop app (BPO Time) sign-in, v1. See desktop_app_plan.md section 5.3.
//
//   POST   /hr/device-code     (portal login)   -> { code }   one-time, 60 seconds
//   POST   /hr/device-token    (no login; the code is the credential)
//                              {code, deviceName} -> { token, user }
//   GET    /hr/device-me       (Bearer device token) -> who this PC is signed in as
//   GET    /hr/device-today    (Bearer device token) -> today's attendance for this person
//   POST   /hr/device-clock-in, /hr/device-clock-out (Bearer device token) -> same records as the Attendance page
//   GET    /hr/device-counts   (Bearer device token) -> { notifications: unread, todos: open and due today or overdue }
//   GET    /hr/device-feed     (Bearer device token) -> { announcements: latest 3 live, birthdays: today }
//   GET/POST /hr/device-theme (Bearer device token) -> { theme: 'light' | 'dark' | null }; POST {theme} saves it (shared with the portal)
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
  // One PC, one row: reconnecting the same PC replaces its earlier connection instead of
  // piling up duplicates. A different PC (different name) keeps its own connection.
  await prisma.device.updateMany({
    where: { userId: row.userId, name: device.name, id: { not: device.id }, revokedAt: null },
    data: { revokedAt: now },
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

  const device = await authDevice(req, res)
  if (!device) return

  return res.status(200).json({
    user: {
      id: device.user.id,
      name: formatDisplayName(device.user.firstName, device.user.middleName, device.user.lastName),
      firstName: device.user.firstName,
    },
    device: { id: device.id, name: device.name },
  })
}

// ---- time tracking: attendance through the device token ----
// These read and write the same AttendanceRecord rows as the portal's own Attendance page
// (api/leave.ts), so late/undertime reports and the weekly tracker keep working. Same rule:
// one record per shift day. There is no time-of-day limit on clocking in.

type DeviceWithUser = NonNullable<Awaited<ReturnType<typeof findDevice>>>

async function findDevice(req: VercelRequest) {
  const header = req.headers.authorization
  const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined
  if (!token) return null
  const device = await prisma.device.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } })
  if (!device || device.revokedAt || !device.user.active) return null
  return device
}

// Returns the device, or has already answered 401 (the app drops its token and asks to reconnect).
async function authDevice(req: VercelRequest, res: VercelResponse): Promise<DeviceWithUser | null> {
  const device = await findDevice(req)
  if (!device) {
    const hasToken = req.headers.authorization?.startsWith('Bearer ')
    res.status(401).json({
      message: hasToken
        ? 'This PC is no longer connected. Press Launch App in the portal to connect again.'
        : 'Missing device token',
    })
    return null
  }
  // note when this PC was last seen, at most once a minute
  if (!device.lastSeenAt || Date.now() - device.lastSeenAt.getTime() > 60_000) {
    await prisma.device.update({ where: { id: device.id }, data: { lastSeenAt: new Date() } })
  }
  return device
}

// The two numbers on the app's panel: unread notifications, and open to-dos due today or overdue.
export async function deviceCounts(req: VercelRequest, res: VercelResponse) {
  withCors(res)
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'GET') return res.status(405).json({ message: 'Method not allowed' })
  const device = await authDevice(req, res)
  if (!device) return

  const employee = await prisma.employee.findUnique({ where: { userId: device.userId }, select: { id: true } })
  const [notifications, todos] = await Promise.all([
    prisma.notification.count({ where: { userId: device.userId, readAt: null } }),
    employee
      ? prisma.todo.count({
          where: { employeeId: employee.id, deletedAt: null, status: 'open', dueDate: { not: null, lte: todayInManila() } },
        })
      : Promise.resolve(0),
  ])
  return res.status(200).json({ notifications, todos })
}

// What the panel shows besides the clock: the latest live announcements and today's birthdays.
// Announcements are the same ones every employee sees on the portal (published, already live,
// not expired), cut to a short preview; the full text stays on the portal.
export async function deviceFeed(req: VercelRequest, res: VercelResponse) {
  withCors(res)
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'GET') return res.status(405).json({ message: 'Method not allowed' })
  const device = await authDevice(req, res)
  if (!device) return

  const now = new Date()
  const [rows, employee] = await Promise.all([
    prisma.announcement.findMany({
      where: { published: true, publishAt: { lte: now }, OR: [{ expireAt: null }, { expireAt: { gt: now } }] },
      orderBy: { publishAt: 'desc' },
      take: 3,
    }),
    prisma.employee.findUnique({ where: { userId: device.userId }, select: { id: true } }),
  ])
  const birthdays = await birthdaysToday(employee?.id)
  return res.status(200).json({
    announcements: rows.map((a) => ({
      id: a.id,
      title: a.title,
      category: a.category,
      preview: a.content.length > 140 ? `${a.content.slice(0, 140).trimEnd()}…` : a.content,
      publishAt: a.publishAt,
    })),
    birthdays,
  })
}

// Light/dark theme, stored in the same per-user settings the portal uses, so the two stay in step.
export async function deviceTheme(req: VercelRequest, res: VercelResponse) {
  withCors(res)
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' })
  const device = await authDevice(req, res)
  if (!device) return

  const user = await prisma.user.findUnique({ where: { id: device.userId }, select: { settings: true } })
  const existing = user?.settings && typeof user.settings === 'object' ? (user.settings as Record<string, unknown>) : {}
  if (req.method === 'GET') return res.status(200).json({ theme: themeOf(existing) })

  const data = parseBody(z.object({ theme: z.enum(['light', 'dark']) }), req.body, res)
  if (!data) return
  await prisma.user.update({ where: { id: device.userId }, data: { settings: { ...existing, theme: data.theme } } })
  return res.status(200).json({ theme: data.theme })
}

function attendanceBody(record: { status: string; checkInAt: Date | null; checkOutAt: Date | null; breaks?: unknown } | null) {
  return {
    checkedIn: !!record?.checkInAt,
    checkedOut: !!record?.checkOutAt,
    status: record?.status ?? null,
    checkInAt: record?.checkInAt ?? null,
    checkOutAt: record?.checkOutAt ?? null,
    // Breaks and lunch (see lib/breaks.ts), and the seconds allowed per slot so the app never hard-codes them.
    breaks: readBreaks(record?.breaks),
    breakAllowances: BREAK_ALLOWANCE_SECONDS,
    // The server's clock is the reference; the app must not trust the PC clock for hours.
    serverNow: new Date(),
  }
}

async function deviceAttendance(
  req: VercelRequest,
  res: VercelResponse,
  method: 'GET' | 'POST',
  act: (employeeId: string, device: DeviceWithUser) => Promise<void>,
) {
  withCors(res)
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== method) return res.status(405).json({ message: 'Method not allowed' })
  const device = await authDevice(req, res)
  if (!device) return
  const employee = await prisma.employee.findUnique({ where: { userId: device.userId } })
  if (!employee) return res.status(404).json({ message: 'No employee profile on file yet. Ask HR to set one up.' })
  await act(employee.id, device)
}

export async function deviceToday(req: VercelRequest, res: VercelResponse) {
  return deviceAttendance(req, res, 'GET', async (employeeId) => {
    const record = await prisma.attendanceRecord.findUnique({
      where: { employeeId_date: { employeeId, date: todayInManila() } },
    })
    res.status(200).json(attendanceBody(record))
  })
}

export async function deviceClockIn(req: VercelRequest, res: VercelResponse) {
  return deviceAttendance(req, res, 'POST', async (employeeId, device) => {
    const date = todayInManila()
    const existing = await prisma.attendanceRecord.findUnique({ where: { employeeId_date: { employeeId, date } } })
    // Already clocked in today (for instance from the portal's own page) is a normal answer, not an error.
    if (existing?.checkInAt) return void res.status(200).json(attendanceBody(existing))

    const data = { checkInAt: new Date(), checkInIp: getClientIp(req) }
    const record = existing
      ? await prisma.attendanceRecord.update({ where: { id: existing.id }, data })
      : await prisma.attendanceRecord.create({ data: { employeeId, date, ...data } })
    logAudit(device.userId, 'check_in', 'attendance', record.id)
    res.status(201).json(attendanceBody(record))
  })
}

export async function deviceClockOut(req: VercelRequest, res: VercelResponse) {
  return deviceAttendance(req, res, 'POST', async (employeeId, device) => {
    const existing = await prisma.attendanceRecord.findUnique({
      where: { employeeId_date: { employeeId, date: todayInManila() } },
    })
    if (!existing?.checkInAt) return void res.status(400).json({ message: "You haven't clocked in today yet." })
    if (existing.checkOutAt) return void res.status(200).json(attendanceBody(existing))
    const record = await prisma.attendanceRecord.update({
      where: { id: existing.id },
      // Clocking out settles the breaks: a running one ends (counts as taken), unused slots become "not_taken".
      data: { checkOutAt: new Date(), checkOutIp: getClientIp(req), breaks: finalizeBreaks(readBreaks(existing.breaks), new Date()) },
    })
    logAudit(device.userId, 'check_out', 'attendance', record.id)
    res.status(200).json(attendanceBody(record))
  })
}

const breakSchema = z.object({ slot: z.enum(BREAK_SLOTS) })

// POST /hr/device-break-start {slot}: start the morning break, lunch or afternoon break. Earlier unused slots are
// closed as "not_taken" (the app asks the person first). Only while clocked in and not yet clocked out.
export async function deviceBreakStart(req: VercelRequest, res: VercelResponse) {
  return deviceAttendance(req, res, 'POST', async (employeeId, device) => {
    const data = parseBody(breakSchema, req.body, res)
    if (!data) return
    const existing = await prisma.attendanceRecord.findUnique({ where: { employeeId_date: { employeeId, date: todayInManila() } } })
    if (!existing?.checkInAt) return void res.status(400).json({ message: "Clock in first, then you can take a break." })
    if (existing.checkOutAt) return void res.status(400).json({ message: "You've already clocked out today." })
    const result = startBreak(readBreaks(existing.breaks), data.slot, new Date())
    if ('error' in result) return void res.status(400).json({ message: result.error })
    const record = await prisma.attendanceRecord.update({ where: { id: existing.id }, data: { breaks: result.entries } })
    logAudit(device.userId, 'break_start', 'attendance', record.id)
    res.status(200).json(attendanceBody(record))
  })
}

// POST /hr/device-break-end: end the running break; records how far over its allowance it went.
export async function deviceBreakEnd(req: VercelRequest, res: VercelResponse) {
  return deviceAttendance(req, res, 'POST', async (employeeId, device) => {
    const existing = await prisma.attendanceRecord.findUnique({ where: { employeeId_date: { employeeId, date: todayInManila() } } })
    if (!existing?.checkInAt) return void res.status(400).json({ message: "You haven't clocked in today yet." })
    const result = endBreak(readBreaks(existing.breaks), new Date())
    if ('error' in result) return void res.status(400).json({ message: result.error })
    const record = await prisma.attendanceRecord.update({ where: { id: existing.id }, data: { breaks: result.entries } })
    logAudit(device.userId, 'break_end', 'attendance', record.id)
    res.status(200).json(attendanceBody(record))
  })
}
