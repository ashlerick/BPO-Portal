import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import type { Role } from '@prisma/client'

// A sign-in lasts the whole working day: the shift is 8.5 hours, and someone who signs in a little before it starts and works some
// overtime must not be logged out in the middle of it.
const JWT_EXPIRES_IN = '16h'

export interface AuthTokenPayload {
  sub: string
  email: string
  roles: Role[]
}

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET is not configured')
  return secret
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12)
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

export function signToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: JWT_EXPIRES_IN })
}

export function verifyToken(token: string): AuthTokenPayload {
  return jwt.verify(token, getJwtSecret()) as AuthTokenPayload
}
