import type { VercelResponse } from '@vercel/node'
import { describeIssue } from '../lib/handlers/util.js'
import { randomBytes } from 'node:crypto'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { hashPassword } from '../lib/auth.js'
import { sendEmail } from '../lib/email.js'
import { requireAuth, type AuthedRequest } from '../lib/middleware.js'
import { logAudit } from '../lib/audit.js'
import { isNotFoundError, isUniqueConstraintError } from '../lib/errors.js'
import { formatDisplayName } from '../lib/names.js'
import { activateAccount } from '../lib/accounts.js'

// Consolidated into one function (Vercel Hobby caps at 12 serverless
// functions per deployment): GET /users, POST /users, PUT /users/:id.
// The /:id sub-path is routed here via a vercel.json rewrite, arriving
// as ?sub=<id>. All admin-only.

const ROLES = ['employee', 'team_leader', 'manager', 'hr', 'admin'] as const
const SETUP_TOKEN_TTL_MS = 48 * 60 * 60 * 1000 // 48 hours

const createUserSchema = z.object({
  email: z.string().email(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  middleName: z.string().trim().optional(),
  roles: z.array(z.enum(ROLES)).min(1),
  position: z.string().trim().min(1).optional(),
  departmentId: z.string().uuid().optional(),
  teamId: z.string().uuid().optional(),
})

const updateUserSchema = z
  .object({
    roles: z.array(z.enum(ROLES)).min(1).optional(),
    email: z.string().email().optional(),
    firstName: z.string().min(1).optional(),
    lastName: z.string().min(1).optional(),
    middleName: z.string().trim().optional().nullable(),
    // Switch a new hire's inactive account on (and send the setup link).
    activate: z.literal(true).optional(),
  })
  .refine(
    (data) =>
      data.roles !== undefined ||
      data.email !== undefined ||
      data.firstName !== undefined ||
      data.lastName !== undefined ||
      data.middleName !== undefined ||
      data.activate !== undefined,
    { message: 'Nothing to update' },
  )

const userSelect = {
  id: true,
  email: true,
  firstName: true,
  middleName: true,
  lastName: true,
  roles: true,
  passwordSet: true,
  active: true,
  createdAt: true,
} as const

function serialize(u: {
  id: string
  email: string
  firstName: string
  middleName: string | null
  lastName: string
  roles: (typeof ROLES)[number][]
  passwordSet: boolean
  active: boolean
  createdAt: Date
}) {
  return {
    id: u.id,
    email: u.email,
    firstName: u.firstName,
    middleName: u.middleName,
    lastName: u.lastName,
    name: formatDisplayName(u.firstName, u.middleName, u.lastName),
    roles: u.roles,
    passwordSet: u.passwordSet,
    active: u.active,
    createdAt: u.createdAt,
  }
}

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not configured`)
  return value
}

async function handleList(res: VercelResponse) {
  const users = await prisma.user.findMany({
    select: userSelect,
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  })
  res.status(200).json(users.map(serialize))
}

async function handleCreate(req: AuthedRequest, res: VercelResponse) {
  const parsed = createUserSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ message: 'Invalid email, name, or roles' })
    return
  }

  const { email, firstName, lastName, middleName, roles, position, departmentId, teamId } = parsed.data

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    res.status(409).json({ message: 'A user with that email already exists' })
    return
  }

  // Placeholder hash: nobody can log in with a password until the setup
  // link below is used, since the random bytes are never revealed.
  const placeholderHash = await hashPassword(randomBytes(32).toString('hex'))

  const user = await prisma.user.create({
    data: {
      email,
      firstName,
      lastName,
      middleName: middleName || null,
      roles,
      passwordHash: placeholderHash,
      passwordSet: false,
    },
    select: userSelect,
  })

  // Every account needs a matching Employee row to show up in
  // HRIS/Attendance/Leave — created here so nobody ends up with a
  // login but no employee profile (see employees.ts POST for backfilling
  // accounts that predate this).
  await prisma.employee.create({
    data: { userId: user.id, position: position || null, departmentId: departmentId || null, teamId: teamId || null },
  })

  const token = randomBytes(32).toString('base64url')
  await prisma.passwordResetToken.create({
    data: { userId: user.id, token, expiresAt: new Date(Date.now() + SETUP_TOKEN_TTL_MS) },
  })

  const setupUrl = `${requireEnv('FRONTEND_URL')}/set-password?token=${token}`

  await sendEmail(
    email,
    'Set up your BPO Portal account',
    `<p>Hi ${firstName},</p>
     <p>An administrator created an account for you on the BPO Portal.</p>
     <p><a href="${setupUrl}">Click here to set your password</a> and log in. This link expires in 48 hours.</p>
     <p>If you weren't expecting this, you can ignore this email.</p>`,
  )

  await logAudit(req.auth.sub, 'create', 'user', user.id)
  res.status(201).json(serialize(user))
}

async function handleUpdate(req: AuthedRequest, res: VercelResponse, id: string) {
  const parsed = updateUserSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.issues[0] ? describeIssue(parsed.error.issues[0]) : 'Invalid update payload' })
    return
  }

  const { roles, email, firstName, lastName, middleName, activate } = parsed.data
  const nameChanged = firstName !== undefined || lastName !== undefined || middleName !== undefined

  let user
  try {
    user = await prisma.user.update({
      where: { id },
      data: {
        ...(roles !== undefined ? { roles } : {}),
        ...(email !== undefined ? { email } : {}),
        ...(firstName !== undefined ? { firstName } : {}),
        ...(lastName !== undefined ? { lastName } : {}),
        ...(middleName !== undefined ? { middleName: middleName || null } : {}),
      },
      select: userSelect,
    })
  } catch (err) {
    if (isNotFoundError(err)) {
      res.status(404).json({ message: 'User not found' })
      return
    }
    if (isUniqueConstraintError(err)) {
      res.status(409).json({ message: 'A user with that email already exists' })
      return
    }
    throw err
  }

  // Logged as separate audit entries per kind of change, matching the
  // rest of the app's convention of one action per thing that happened
  // rather than a single catch-all "update". Awaited (unlike most
  // logAudit call sites) so the write is guaranteed to land before the
  // response returns, rather than racing the function's teardown.
  if (activate) {
    if (await activateAccount(id)) await logAudit(req.auth.sub, 'activate', 'user', id)
    const fresh = await prisma.user.findUnique({ where: { id }, select: userSelect })
    if (fresh) user = fresh
  }
  if (roles !== undefined) await logAudit(req.auth.sub, 'update_roles', 'user', id)
  if (email !== undefined) await logAudit(req.auth.sub, 'update_email', 'user', id)
  if (nameChanged) await logAudit(req.auth.sub, 'update_name', 'user', id)

  res.status(200).json(serialize(user))
}

async function handleDelete(req: AuthedRequest, res: VercelResponse, id: string) {
  if (id === req.auth.sub) {
    res.status(400).json({ message: "You can't delete your own account" })
    return
  }

  // Every account gets a bare Employee row automatically now, so its
  // mere existence isn't a reason to block deletion — actual HR history
  // (attendance/leave records) is. Refuse only when that history exists,
  // rather than cascading it away.
  const employee = await prisma.employee.findUnique({
    where: { userId: id },
    select: { id: true, _count: { select: { attendanceRecords: true, leaveRequests: true } } },
  })
  if (employee && (employee._count.attendanceRecords > 0 || employee._count.leaveRequests > 0)) {
    res.status(409).json({
      message: 'This user has attendance/leave history and cannot be deleted.',
    })
    return
  }

  try {
    await prisma.$transaction([
      prisma.passwordResetToken.deleteMany({ where: { userId: id } }),
      ...(employee ? [prisma.employee.delete({ where: { id: employee.id } })] : []),
      prisma.user.delete({ where: { id } }),
    ])
  } catch (err) {
    if (isNotFoundError(err)) {
      res.status(404).json({ message: 'User not found' })
      return
    }
    throw err
  }

  logAudit(req.auth.sub, 'delete', 'user', id)
  res.status(204).end()
}

async function handler(req: AuthedRequest, res: VercelResponse) {
  const sub = typeof req.query.sub === 'string' ? req.query.sub : undefined

  if (!sub && req.method === 'GET') return handleList(res)
  if (!sub && req.method === 'POST') return handleCreate(req, res)
  if (sub && req.method === 'PUT') return handleUpdate(req, res, sub)
  if (sub && req.method === 'DELETE') return handleDelete(req, res, sub)

  res.status(404).json({ message: 'Not found' })
}

export default requireAuth(handler, { roles: ['admin'] })
