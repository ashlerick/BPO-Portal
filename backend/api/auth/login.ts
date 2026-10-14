import type { VercelRequest, VercelResponse } from '@vercel/node'
import { z } from 'zod'
import { prisma } from '../../lib/prisma.js'
import { signToken, verifyPassword } from '../../lib/auth.js'
import { withCors } from '../../lib/middleware.js'
import { formatDisplayName } from '../../lib/names.js'

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

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

  const parsed = loginSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ message: 'Invalid email or password format' })
    return
  }

  const { email, password } = parsed.data

  const user = await prisma.user.findUnique({ where: { email } })
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    res.status(401).json({ message: 'Invalid credentials' })
    return
  }

  if (!user.active) {
    res.status(403).json({ message: 'Your account has not been activated yet. Please contact HR.' })
    return
  }

  const token = signToken({ sub: user.id, email: user.email, roles: user.roles })

  res.status(200).json({
    token,
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      name: formatDisplayName(user.firstName, user.middleName, user.lastName),
      roles: user.roles,
    },
  })
}
