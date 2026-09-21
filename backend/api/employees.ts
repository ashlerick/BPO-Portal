import type { VercelResponse } from '@vercel/node'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireAuth, type AuthedRequest } from '../lib/middleware.js'
import { logAudit } from '../lib/audit.js'
import { isNotFoundError } from '../lib/errors.js'
import { formatDisplayName } from '../lib/names.js'

// Consolidated into one function (Vercel Hobby caps at 12 serverless
// functions per deployment): GET /employees, GET /employees/me,
// PUT /employees/:id, plus the employee's own PUT /employees/me (contact
// details). The /me and /:id sub-paths are routed here via vercel.json
// rewrites, arriving as ?sub=me or ?sub=<id>.

const createSchema = z.object({
  userId: z.string().min(1),
  departmentId: z.string().uuid().nullable().optional(),
  teamId: z.string().uuid().nullable().optional(),
  position: z.string().min(1).nullable().optional(),
})

const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/

const updateSchema = z.object({
  position: z.string().min(1).nullable().optional(),
  status: z.enum(['active', 'on_leave', 'terminated']).optional(),
  departmentId: z.string().uuid().nullable().optional(),
  teamId: z.string().uuid().nullable().optional(),
  dateHired: z.string().regex(dateOnlyPattern, 'dateHired must be YYYY-MM-DD').nullable().optional(),
  silBalance: z.number().int().min(0).optional(),
})

// Empty/whitespace-only input means "clear it", stored as null.
const blankToNull = (v: string | null | undefined) => (v === undefined ? undefined : v === null || v === '' ? null : v)
const phonePattern = /^[0-9+()\-.\s]{5,30}$/
const optionalPhone = z
  .string()
  .trim()
  .refine((v) => v === '' || phonePattern.test(v), 'Enter a valid phone number')
  .nullable()
  .optional()
  .transform(blankToNull)
const optionalText = (max: number, label: string) =>
  z.string().trim().max(max, `${label} must be ${max} characters or fewer`).nullable().optional().transform(blankToNull)

// What an employee may change about themselves. Deliberately separate
// from updateSchema (HR/Admin fields like status, team, SIL balance) so
// there is no way to reach those through the self-service route.
const contactSchema = z.object({
  phone: optionalPhone,
  address: optionalText(300, 'Address'),
  emergencyContactName: optionalText(100, 'Emergency contact name'),
  emergencyContactPhone: optionalPhone,
})

const employeeSelect = {
  include: {
    department: true,
    team: true,
    user: { select: { firstName: true, middleName: true, lastName: true, email: true } },
  },
} as const

function serialize(e: {
  id: string
  user: { firstName: string; middleName: string | null; lastName: string; email: string }
  department: { name: string } | null
  departmentId: string | null
  team: { name: string } | null
  teamId: string | null
  position: string | null
  status: string
  dateHired: Date | null
  silBalance: number
  phone: string | null
  address: string | null
  emergencyContactName: string | null
  emergencyContactPhone: string | null
}) {
  return {
    id: e.id,
    name: formatDisplayName(e.user.firstName, e.user.middleName, e.user.lastName),
    email: e.user.email,
    departmentId: e.departmentId,
    department: e.department?.name ?? null,
    teamId: e.teamId,
    team: e.team?.name ?? null,
    position: e.position,
    status: e.status,
    dateHired: e.dateHired,
    silBalance: e.silBalance,
    phone: e.phone,
    address: e.address,
    emergencyContactName: e.emergencyContactName,
    emergencyContactPhone: e.emergencyContactPhone,
  }
}

function isManager(req: AuthedRequest): boolean {
  return req.auth.roles.includes('hr') || req.auth.roles.includes('admin')
}

async function handleList(req: AuthedRequest, res: VercelResponse) {
  if (!isManager(req)) {
    res.status(403).json({ message: 'Insufficient permissions' })
    return
  }
  const employees = await prisma.employee.findMany({
    ...employeeSelect,
    orderBy: [{ user: { lastName: 'asc' } }, { user: { firstName: 'asc' } }],
  })
  res.status(200).json(employees.map(serialize))
}

async function handleMe(req: AuthedRequest, res: VercelResponse) {
  const employee = await prisma.employee.findUnique({
    where: { userId: req.auth.sub },
    ...employeeSelect,
  })
  if (!employee) {
    res.status(404).json({ message: 'No employee profile on file yet' })
    return
  }
  res.status(200).json(serialize(employee))
}

// Self-service: an employee edits their own contact details. Looked up
// by the token's user id, never by a client-supplied id, so it can only
// ever touch the caller's own record.
async function handleUpdateMe(req: AuthedRequest, res: VercelResponse) {
  const parsed = contactSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.issues[0]?.message ?? 'Invalid contact details' })
    return
  }

  let employee
  try {
    employee = await prisma.employee.update({
      where: { userId: req.auth.sub },
      data: parsed.data,
      ...employeeSelect,
    })
  } catch (err) {
    if (isNotFoundError(err)) {
      res.status(404).json({ message: 'No employee profile on file yet' })
      return
    }
    throw err
  }

  // Audited without the values — phone/address are personal data and
  // don't belong in the log. Awaited (unlike most audit calls here): a
  // fire-and-forget write can be cut off when the serverless function
  // returns, and a change to personal data is one we want on record.
  await logAudit(req.auth.sub, 'update_contact', 'employee', employee.id)
  res.status(200).json(serialize(employee))
}

// Every User account needs a matching Employee row to show up anywhere
// in HRIS/Attendance/Leave — normally created automatically alongside
// the User (see users.ts handleCreate). This covers backfilling it for
// an account that predates that, or any other case where one's missing.
async function handleCreate(req: AuthedRequest, res: VercelResponse) {
  if (!isManager(req)) {
    res.status(403).json({ message: 'Insufficient permissions' })
    return
  }
  const parsed = createSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ message: 'Invalid employee payload' })
    return
  }

  const { userId, ...rest } = parsed.data
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) {
    res.status(404).json({ message: 'User not found' })
    return
  }

  const existing = await prisma.employee.findUnique({ where: { userId } })
  if (existing) {
    res.status(409).json({ message: 'This user already has an employee profile' })
    return
  }

  const employee = await prisma.employee.create({ data: { userId, ...rest }, ...employeeSelect })
  logAudit(req.auth.sub, 'create', 'employee', employee.id)
  res.status(201).json(serialize(employee))
}

async function handleUpdate(req: AuthedRequest, res: VercelResponse, id: string) {
  if (!isManager(req)) {
    res.status(403).json({ message: 'Insufficient permissions' })
    return
  }
  const parsed = updateSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.issues[0]?.message ?? 'Invalid update payload' })
    return
  }

  const { dateHired, silBalance, ...rest } = parsed.data
  const data = {
    ...rest,
    ...(dateHired !== undefined && { dateHired: dateHired === null ? null : new Date(`${dateHired}T00:00:00.000Z`) }),
    ...(silBalance !== undefined && { silBalance }),
  }

  let employee
  try {
    employee = await prisma.employee.update({ where: { id }, data, ...employeeSelect })
  } catch (err) {
    if (isNotFoundError(err)) {
      res.status(404).json({ message: 'Employee not found' })
      return
    }
    throw err
  }

  // SIL balance gets its own audit entry — a leave-day correction is a
  // more sensitive change than a position/status/team edit and is
  // worth being able to find in the log on its own.
  if (silBalance !== undefined) logAudit(req.auth.sub, 'update_sil_balance', 'employee', id)
  if (Object.keys(rest).length > 0 || dateHired !== undefined) logAudit(req.auth.sub, 'update', 'employee', id)

  res.status(200).json(serialize(employee))
}

async function handler(req: AuthedRequest, res: VercelResponse) {
  const sub = typeof req.query.sub === 'string' ? req.query.sub : undefined

  if (!sub && req.method === 'GET') return handleList(req, res)
  if (!sub && req.method === 'POST') return handleCreate(req, res)
  if (sub === 'me' && req.method === 'GET') return handleMe(req, res)
  if (sub === 'me' && req.method === 'PUT') return handleUpdateMe(req, res)
  if (sub && sub !== 'me' && req.method === 'PUT') return handleUpdate(req, res, sub)

  res.status(404).json({ message: 'Not found' })
}

export default requireAuth(handler)
