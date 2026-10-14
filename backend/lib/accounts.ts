import { randomBytes } from 'node:crypto'
import { prisma } from './prisma.js'
import { sendEmail } from './email.js'

const SETUP_TOKEN_TTL_MS = 48 * 60 * 60 * 1000 // 48 hours

// Switches a new hire's account on and emails the set-password link.
// Returns false when the account was already active (nothing is sent).
export async function activateAccount(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user || user.active) return false

  const frontend = process.env.FRONTEND_URL
  if (!frontend) throw new Error('FRONTEND_URL is not configured')

  const token = randomBytes(32).toString('base64url')
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { active: true } }),
    prisma.passwordResetToken.create({
      data: { userId, token, expiresAt: new Date(Date.now() + SETUP_TOKEN_TTL_MS) },
    }),
  ])

  const setupUrl = `${frontend}/set-password?token=${token}`
  await sendEmail(
    user.email,
    'Set up your BPO Portal account',
    `<p>Hi ${user.firstName},</p>
     <p>Welcome! Your BPO Portal account is ready.</p>
     <p><a href="${setupUrl}">Click here to set your password</a> and log in. This link expires in 48 hours.</p>
     <p>If you weren't expecting this, you can ignore this email.</p>`,
  )
  return true
}
