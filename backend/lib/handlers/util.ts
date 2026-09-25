import type { VercelResponse } from '@vercel/node'
import type { ZodType } from 'zod'
import type { Role } from '@prisma/client'
import { prisma } from '../prisma.js'
import type { AuthedRequest } from '../middleware.js'

// Small helpers shared by the HR handlers (api/hr.ts, api/restricted.ts).

export const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/

// "YYYY-MM-DD" -> a Date at midnight UTC, the app-wide convention for
// calendar days (see attendance/leave).
export const toDate = (v: string) => new Date(`${v}T00:00:00.000Z`)

export function hasRole(req: AuthedRequest, ...roles: Role[]): boolean {
  return roles.some((r) => req.auth.roles.includes(r))
}

export const isHrOrAdmin = (req: AuthedRequest) => hasRole(req, 'hr', 'admin')

// Who may open the highest-sensitivity records (disciplinary cases,
// payroll). Kept in one place: to make these HR-only, drop 'admin' here.
export const RESTRICTED_ROLES: Role[] = ['hr', 'admin']
export const canAccessRestricted = (req: AuthedRequest) => hasRole(req, ...RESTRICTED_ROLES)

export function forbid(res: VercelResponse) {
  res.status(403).json({ message: 'Insufficient permissions' })
}

export function notFound(res: VercelResponse, what = 'Not found') {
  res.status(404).json({ message: what })
}

// Validates a request body; on failure it has already answered 400 and
// returns null.
export function parseBody<T>(schema: ZodType<T>, body: unknown, res: VercelResponse): T | null {
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.issues[0]?.message ?? 'Invalid request' })
    return null
  }
  return parsed.data
}

export function queryString(req: AuthedRequest, key: string): string | undefined {
  const v = req.query[key]
  return typeof v === 'string' && v !== '' ? v : undefined
}

// The signed-in user's Employee row, if they have one.
export function myEmployee(req: AuthedRequest) {
  return prisma.employee.findUnique({ where: { userId: req.auth.sub } })
}

// True when `employeeId`'s supervisor is the signed-in user.
export async function isSupervisorOf(req: AuthedRequest, employeeId: string): Promise<boolean> {
  const me = await myEmployee(req)
  if (!me) return false
  const target = await prisma.employee.findUnique({ where: { id: employeeId }, select: { managerId: true } })
  return target?.managerId === me.id
}

export const money = (d: { toString(): string } | null | undefined): number | null =>
  d === null || d === undefined ? null : Number(d.toString())

export function appendHistory(existing: unknown, by: string, action: string, detail?: string) {
  const list = Array.isArray(existing) ? existing : []
  return [...list, { at: new Date().toISOString(), by, action, ...(detail ? { detail } : {}) }]
}
