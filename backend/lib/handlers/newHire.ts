import type { VercelResponse } from '@vercel/node'
import { randomBytes } from 'node:crypto'
import { z } from 'zod'
import { prisma } from '../prisma.js'
import type { AuthedRequest } from '../middleware.js'
import { logAudit } from '../audit.js'
import { hashPassword } from '../auth.js'
import { activateAccount } from '../accounts.js'
import { formatDisplayName } from '../names.js'
import { isUniqueConstraintError } from '../errors.js'
import { DEFAULT_TASKS } from './checklists.js'
import { dateOnlyPattern, forbid, hasRole, isHrOrAdmin, notFound, parseBody, queryString, toDate } from './util.js'

// New hires under /hr/new-hire, used by Onboarding (HR/Admin):
//   GET                  accounts created here that are still inactive
//   POST                 create the account (INACTIVE: no login, no email),
//                        the employee record, the onboarding checklist and
//                        optionally a shift
//   POST /:userId?action=activate   switch the account on + send the setup link
// HR may only grant the employee / team_leader roles; Admin may grant any.

const HR_GRANTABLE = ['employee', 'team_leader'] as const
const ALL_ROLES = ['employee', 'team_leader', 'manager', 'hr', 'admin'] as const

const dateField = z.string().regex(dateOnlyPattern, 'Dates must be YYYY-MM-DD')

const createSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  firstName: z.string().trim().min(1).max(60),
  middleName: z.string().trim().max(60).nullable().optional(),
  lastName: z.string().trim().min(1).max(60),
  roles: z.array(z.enum(ALL_ROLES)).min(1).optional(),
  position: z.string().trim().min(1).max(100).nullable().optional(),
  departmentId: z.string().uuid().nullable().optional(),
  teamId: z.string().uuid().nullable().optional(),
  managerId: z.string().uuid().nullable().optional(),
  employeeCode: z.string().trim().min(1).max(40).nullable().optional(),
  legalEntity: z.string().trim().min(1).max(120).nullable().optional(),
  level: z.string().trim().min(1).max(60).nullable().optional(),
  dateHired: dateField.nullable().optional(),
  birthDate: dateField
    .refine((v) => v >= '1900-01-01' && v <= new Date().toISOString().slice(0, 10), 'Enter a valid birthday')
    .nullable()
    .optional(),
  gender: z.enum(['male', 'female', 'other', 'prefer_not_to_say']).nullable().optional(),
  shiftId: z.string().uuid().nullable().optional(),
})

export async function handler(req: AuthedRequest, res: VercelResponse) {
  if (!isHrOrAdmin(req)) return forbid(res)
  const sub = queryString(req, 'sub')
  const action = queryString(req, 'action')

  // ---- accounts waiting for activation
  if (!sub && req.method === 'GET') {
    const rows = await prisma.user.findMany({
      where: { active: false },
      include: { employee: true },
      orderBy: { createdAt: 'desc' },
    })
    return res.status(200).json(
      rows.map((u) => ({
        userId: u.id,
        name: formatDisplayName(u.firstName, u.middleName, u.lastName),
        email: u.email,
        position: u.employee?.position ?? null,
        dateHired: u.employee?.dateHired ?? null,
        createdAt: u.createdAt,
      })),
    )
  }

  // ---- create
  if (!sub && req.method === 'POST') {
    const data = parseBody(createSchema, req.body, res)
    if (!data) return
    const roles = data.roles ?? ['employee']
    if (!hasRole(req, 'admin') && roles.some((r) => !(HR_GRANTABLE as readonly string[]).includes(r))) {
      return res.status(403).json({ message: 'HR can only create Employee or Team Leader accounts. Ask an Admin for other roles.' })
    }
    if (await prisma.user.findUnique({ where: { email: data.email } })) {
      return res.status(409).json({ message: 'A user with that email already exists' })
    }
    if (data.shiftId) {
      const shift = await prisma.shift.findUnique({ where: { id: data.shiftId } })
      if (!shift || !shift.active) return notFound(res, 'Shift not found')
    }

    // A random hash nobody knows; the real password is set through the
    // activation link, which does not exist until the account is activated.
    const placeholderHash = await hashPassword(randomBytes(32).toString('hex'))

    let created
    try {
      created = await prisma.user.create({
        data: {
          email: data.email,
          firstName: data.firstName,
          middleName: data.middleName || null,
          lastName: data.lastName,
          roles,
          passwordHash: placeholderHash,
          passwordSet: false,
          active: false,
          employee: {
            create: {
              position: data.position ?? null,
              departmentId: data.departmentId ?? null,
              teamId: data.teamId ?? null,
              managerId: data.managerId ?? null,
              employeeCode: data.employeeCode ?? null,
              legalEntity: data.legalEntity ?? null,
              level: data.level ?? null,
              dateHired: data.dateHired ? toDate(data.dateHired) : null,
              birthDate: data.birthDate ? toDate(data.birthDate) : null,
              gender: data.gender ?? null,
              checklists: {
                create: {
                  kind: 'onboarding',
                  effectiveDate: data.dateHired ? toDate(data.dateHired) : null,
                  createdBy: req.auth.sub,
                  tasks: { create: DEFAULT_TASKS.onboarding.map((label, position) => ({ label, position })) },
                },
              },
              ...(data.shiftId && {
                shiftAssignments: {
                  create: {
                    shiftId: data.shiftId,
                    effectiveFrom: data.dateHired ? toDate(data.dateHired) : toDate(new Date().toISOString().slice(0, 10)),
                    assignedBy: req.auth.sub,
                  },
                },
              }),
            },
          },
        },
        include: { employee: true },
      })
    } catch (err) {
      if (isUniqueConstraintError(err)) {
        return res.status(409).json({ message: 'That email or employee ID is already in use' })
      }
      throw err
    }

    await logAudit(req.auth.sub, 'create_new_hire', 'user', created.id)
    return res.status(201).json({
      userId: created.id,
      employeeId: created.employee?.id ?? null,
      name: formatDisplayName(created.firstName, created.middleName, created.lastName),
      email: created.email,
    })
  }

  // ---- activate
  if (sub && action === 'activate' && req.method === 'POST') {
    const user = await prisma.user.findUnique({ where: { id: sub } })
    if (!user) return notFound(res, 'Account not found')
    if (user.active) return res.status(409).json({ message: 'This account is already active' })
    await activateAccount(sub)
    await logAudit(req.auth.sub, 'activate', 'user', sub)
    return res.status(200).json({ activated: true, email: user.email })
  }

  notFound(res)
}
