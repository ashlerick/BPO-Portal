import type { VercelRequest, VercelResponse } from '@vercel/node'
import { randomBytes } from 'node:crypto'
import { z } from 'zod'
import type { User } from '@prisma/client'
import { prisma } from '../../lib/prisma.js'
import { hashPassword, signToken, verifyPassword, verifyToken, type AuthTokenPayload } from '../../lib/auth.js'
import { sendEmail } from '../../lib/email.js'
import { logAudit } from '../../lib/audit.js'
import { withCors } from '../../lib/middleware.js'
import { formatDisplayName } from '../../lib/names.js'

// Consolidated into one function (Vercel Hobby caps at 12 serverless
// functions per deployment): POST /auth/set-password (consume a token),
// POST /auth/forgot-password (self-service: request a reset link),
// POST /auth/admin-reset-password (admin-triggered, for a user who can't
// use the self-service flow) and POST /auth/change-password (a logged-in
// user changing their own password) share this file, the latter three
// routed here via vercel.json rewrites arriving as ?action=forgot /
// ?action=admin-reset / ?action=change.

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000 // 1 hour

const setPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

const forgotPasswordSchema = z.object({
  email: z.string().email(),
})

const adminResetSchema = z.object({
  userId: z.string().min(1),
})

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password'),
    newPassword: z.string().min(8, 'New password must be at least 8 characters'),
  })
  .refine((v) => v.newPassword !== v.currentPassword, {
    message: 'New password must be different from your current password',
    path: ['newPassword'],
  })

// Same bearer-token check handleAdminResetPassword needs; these handlers
// aren't wrapped in requireAuth because this file also serves the
// unauthenticated set/forgot flows.
function authenticate(req: VercelRequest, res: VercelResponse): AuthTokenPayload | null {
  const header = req.headers.authorization
  const bearer = header?.startsWith('Bearer ') ? header.slice(7) : undefined
  if (!bearer) {
    res.status(401).json({ message: 'Missing authorization token' })
    return null
  }

  try {
    return verifyToken(bearer)
  } catch {
    res.status(401).json({ message: 'Invalid or expired token' })
    return null
  }
}

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not configured`)
  return value
}

async function createAndSendResetLink(user: Pick<User, 'id' | 'email' | 'firstName'>) {
  const token = randomBytes(32).toString('base64url')
  await prisma.passwordResetToken.create({
    data: { userId: user.id, token, expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS) },
  })

  const resetUrl = `${requireEnv('FRONTEND_URL')}/set-password?token=${token}`

  await sendEmail(
    user.email,
    'Reset your BPO Portal password',
    `<p>Hi ${user.firstName},</p>
     <p>We received a request to reset your BPO Portal password.</p>
     <p><a href="${resetUrl}">Click here to choose a new password</a>. This link expires in 1 hour.</p>
     <p>If you didn't request this, you can ignore this email — your password won't change.</p>`,
  )
}

async function handleForgotPassword(req: VercelRequest, res: VercelResponse) {
  const parsed = forgotPasswordSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ message: 'Invalid email' })
    return
  }

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } })
  if (user) {
    await createAndSendResetLink(user)
  }

  // Same response whether or not the email is registered, so this
  // endpoint can't be used to enumerate accounts.
  res.status(200).json({ message: 'If that email is registered, a reset link is on its way.' })
}

async function handleAdminResetPassword(req: VercelRequest, res: VercelResponse) {
  const auth = authenticate(req, res)
  if (!auth) return

  if (!auth.roles.includes('admin')) {
    res.status(403).json({ message: 'Admin access required' })
    return
  }

  const parsed = adminResetSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ message: 'Invalid request' })
    return
  }

  const user = await prisma.user.findUnique({ where: { id: parsed.data.userId } })
  if (!user) {
    res.status(404).json({ message: 'User not found' })
    return
  }

  await createAndSendResetLink(user)
  await logAudit(auth.sub, 'reset-password', 'user', user.id)

  res.status(200).json({ message: `Reset link sent to ${user.email}` })
}

async function handleChangePassword(req: VercelRequest, res: VercelResponse) {
  const auth = authenticate(req, res)
  if (!auth) return

  const parsed = changePasswordSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.issues[0]?.message ?? 'Invalid request' })
    return
  }

  const user = await prisma.user.findUnique({ where: { id: auth.sub } })
  if (!user) {
    res.status(404).json({ message: 'User not found' })
    return
  }

  // A wrong current password is a 400, not a 401: the caller's session is
  // valid (they got past authenticate()), so this is a bad request, and a
  // 401 would wrongly tell any client the session itself has expired.
  if (!(await verifyPassword(parsed.data.currentPassword, user.passwordHash))) {
    res.status(400).json({ message: 'Current password is incorrect' })
    return
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(parsed.data.newPassword), passwordSet: true },
  })
  await logAudit(auth.sub, 'change-password', 'user', user.id)

  res.status(200).json({ message: 'Password changed' })
}

async function handleSetPassword(req: VercelRequest, res: VercelResponse) {
  const parsed = setPasswordSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.issues[0]?.message ?? 'Invalid request' })
    return
  }

  const { token, password } = parsed.data

  const resetToken = await prisma.passwordResetToken.findUnique({ where: { token } })
  if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
    res.status(400).json({ message: 'This link is invalid or has expired' })
    return
  }

  const passwordHash = await hashPassword(password)

  const user = await prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id: resetToken.userId },
      data: { passwordHash, passwordSet: true },
    })
    await tx.passwordResetToken.update({
      where: { id: resetToken.id },
      data: { usedAt: new Date() },
    })
    return updated
  })

  const jwt = signToken({ sub: user.id, email: user.email, roles: user.roles })

  res.status(200).json({
    token: jwt,
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      name: formatDisplayName(user.firstName, user.middleName, user.lastName),
      roles: user.roles,
    },
  })
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  withCors(res)

  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }

  if (req.method !== 'POST') {
    res.status(405).json({ message: 'Method not allowed' })
    return
  }

  if (req.query.action === 'forgot') {
    await handleForgotPassword(req, res)
  } else if (req.query.action === 'admin-reset') {
    await handleAdminResetPassword(req, res)
  } else if (req.query.action === 'change') {
    await handleChangePassword(req, res)
  } else {
    await handleSetPassword(req, res)
  }
}
