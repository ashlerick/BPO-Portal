import type { VercelRequest, VercelResponse } from '@vercel/node'
import type { Role } from '@prisma/client'
import { verifyToken, type AuthTokenPayload } from './auth.js'

export type AuthedRequest = VercelRequest & { auth: AuthTokenPayload }

const ALLOWED_ORIGIN = process.env.CORS_ORIGIN ?? '*'

export function withCors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN)
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
}

export function requireAuth(
  // Handlers often `return res.status(..).json(..)`, so any return value is fine.
  handler: (req: AuthedRequest, res: VercelResponse) => Promise<unknown> | unknown,
  options?: { roles?: Role[] },
) {
  return async (req: VercelRequest, res: VercelResponse) => {
    withCors(res)

    if (req.method === 'OPTIONS') {
      res.status(204).end()
      return
    }

    const header = req.headers.authorization
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined

    if (!token) {
      res.status(401).json({ message: 'Missing authorization token' })
      return
    }

    let auth: AuthTokenPayload
    try {
      auth = verifyToken(token)
    } catch {
      res.status(401).json({ message: 'Invalid or expired token' })
      return
    }

    if (options?.roles && !options.roles.some((role) => auth.roles.includes(role))) {
      res.status(403).json({ message: 'Insufficient permissions' })
      return
    }

    ;(req as AuthedRequest).auth = auth
    return handler(req as AuthedRequest, res)
  }
}
