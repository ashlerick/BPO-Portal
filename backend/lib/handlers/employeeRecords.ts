import type { VercelResponse } from '@vercel/node'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { prisma } from '../prisma.js'
import type { AuthedRequest } from '../middleware.js'
import { logAudit } from '../audit.js'
import { getDownloadUrl, putObject } from '../s3.js'
import { dateOnlyPattern, forbid, isHrOrAdmin, myEmployee, notFound, parseBody, queryString, toDate } from './util.js'

// Per-employee record data, all under /hr/employee-records:
//   ?kind=dependents | history | requirements | documents  (+ ?employeeId=)
// Employees can read their own and manage their own dependents; every
// other write is HR/Admin only.

const dependentSchema = z.object({
  employeeId: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(120),
  relationship: z.string().trim().min(1).max(60),
  birthDate: z.string().regex(dateOnlyPattern, 'birthDate must be YYYY-MM-DD').nullable().optional(),
})

const historySchema = z.object({
  employeeId: z.string().uuid(),
  title: z.string().trim().min(1).max(160),
  department: z.string().trim().max(120).nullable().optional(),
  startDate: z.string().regex(dateOnlyPattern, 'startDate must be YYYY-MM-DD'),
  endDate: z.string().regex(dateOnlyPattern, 'endDate must be YYYY-MM-DD').nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
})

const requirementsSchema = z.object({
  employeeId: z.string().uuid(),
  requirements: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(80),
        number: z.string().trim().max(60).optional(),
        status: z.enum(['pending', 'submitted', 'verified']),
      }),
    )
    .max(30),
})

const uploadSchema = z.object({
  employeeId: z.string().uuid(),
  title: z.string().trim().min(1).max(160),
  contentType: z.string().min(1),
  fileName: z.string().min(1),
  fileBase64: z.string().min(1),
})

// Resolves which employee a request is about: HR/Admin may name anyone;
// everyone else only ever gets their own record.
async function resolveEmployeeId(req: AuthedRequest, requested: string | undefined): Promise<string | null> {
  if (isHrOrAdmin(req) && requested) return requested
  const me = await myEmployee(req)
  if (me && (!requested || requested === me.id)) return me.id
  return null
}

const EMPLOYEE_FILES_CATEGORY = 'Employee files'

export async function handler(req: AuthedRequest, res: VercelResponse) {
  const kind = queryString(req, 'kind')
  const sub = queryString(req, 'sub')

  // ---- dependents
  if (kind === 'dependents') {
    if (req.method === 'GET') {
      const employeeId = await resolveEmployeeId(req, queryString(req, 'employeeId'))
      if (!employeeId) return res.status(200).json([])
      const rows = await prisma.dependent.findMany({ where: { employeeId }, orderBy: { createdAt: 'asc' } })
      return res.status(200).json(rows)
    }
    if (req.method === 'POST') {
      const data = parseBody(dependentSchema, req.body, res)
      if (!data) return
      const employeeId = await resolveEmployeeId(req, data.employeeId)
      if (!employeeId) return forbid(res)
      const created = await prisma.dependent.create({
        data: {
          employeeId,
          name: data.name,
          relationship: data.relationship,
          birthDate: data.birthDate ? toDate(data.birthDate) : null,
        },
      })
      logAudit(req.auth.sub, 'create', 'dependent', created.id)
      return res.status(201).json(created)
    }
    if (req.method === 'DELETE' && sub) {
      const dep = await prisma.dependent.findUnique({ where: { id: sub }, include: { employee: true } })
      if (!dep) return notFound(res)
      if (!isHrOrAdmin(req) && dep.employee.userId !== req.auth.sub) return forbid(res)
      await prisma.dependent.delete({ where: { id: sub } })
      logAudit(req.auth.sub, 'delete', 'dependent', sub)
      return res.status(204).end()
    }
  }

  // ---- employment history (HR writes; employee reads own)
  if (kind === 'history') {
    if (req.method === 'GET') {
      const employeeId = await resolveEmployeeId(req, queryString(req, 'employeeId'))
      if (!employeeId) return res.status(200).json([])
      const rows = await prisma.employmentHistory.findMany({ where: { employeeId }, orderBy: { startDate: 'desc' } })
      return res.status(200).json(rows)
    }
    if (!isHrOrAdmin(req)) return forbid(res)
    if (req.method === 'POST') {
      const data = parseBody(historySchema, req.body, res)
      if (!data) return
      const created = await prisma.employmentHistory.create({
        data: {
          employeeId: data.employeeId,
          title: data.title,
          department: data.department ?? null,
          startDate: toDate(data.startDate),
          endDate: data.endDate ? toDate(data.endDate) : null,
          notes: data.notes ?? null,
        },
      })
      logAudit(req.auth.sub, 'create', 'employment_history', created.id)
      return res.status(201).json(created)
    }
    if (req.method === 'DELETE' && sub) {
      await prisma.employmentHistory.deleteMany({ where: { id: sub } })
      logAudit(req.auth.sub, 'delete', 'employment_history', sub)
      return res.status(204).end()
    }
  }

  // ---- government / HR requirements (a JSON checklist on the employee)
  if (kind === 'requirements') {
    if (req.method === 'GET') {
      const employeeId = await resolveEmployeeId(req, queryString(req, 'employeeId'))
      if (!employeeId) return res.status(200).json([])
      const emp = await prisma.employee.findUnique({ where: { id: employeeId }, select: { governmentRequirements: true } })
      return res.status(200).json(emp?.governmentRequirements ?? [])
    }
    if (!isHrOrAdmin(req)) return forbid(res)
    if (req.method === 'PUT') {
      const data = parseBody(requirementsSchema, req.body, res)
      if (!data) return
      await prisma.employee.update({ where: { id: data.employeeId }, data: { governmentRequirements: data.requirements } })
      logAudit(req.auth.sub, 'update_requirements', 'employee', data.employeeId)
      return res.status(200).json(data.requirements)
    }
  }

  // ---- employee documents (private files attached to one employee)
  if (kind === 'documents') {
    if (req.method === 'GET' && !sub) {
      const employeeId = await resolveEmployeeId(req, queryString(req, 'employeeId'))
      if (!employeeId) return res.status(200).json([])
      const rows = await prisma.document.findMany({ where: { employeeId }, orderBy: { createdAt: 'desc' } })
      return res.status(200).json(rows.map((d) => ({ id: d.id, title: d.title, createdAt: d.createdAt })))
    }
    if (req.method === 'GET' && sub) {
      const doc = await prisma.document.findUnique({ where: { id: sub }, include: { employee: true } })
      if (!doc || !doc.employee) return notFound(res)
      if (!isHrOrAdmin(req) && doc.employee.userId !== req.auth.sub) return forbid(res)
      logAudit(req.auth.sub, 'download', 'employee_document', doc.id)
      return res.status(200).json({ url: await getDownloadUrl(doc.storageKey) })
    }
    if (!isHrOrAdmin(req)) return forbid(res)
    if (req.method === 'POST') {
      const data = parseBody(uploadSchema, req.body, res)
      if (!data) return
      const buffer = Buffer.from(data.fileBase64, 'base64')
      if (buffer.length === 0 || buffer.length > 4 * 1024 * 1024) {
        res.status(400).json({ message: 'File must be non-empty and under 4MB' })
        return
      }
      const category = await prisma.documentCategory.upsert({
        where: { name: EMPLOYEE_FILES_CATEGORY },
        update: {},
        create: { name: EMPLOYEE_FILES_CATEGORY },
      })
      const storageKey = `employee-files/${data.employeeId}/${randomUUID()}-${data.fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`
      await putObject(storageKey, buffer, data.contentType)
      const doc = await prisma.document.create({
        data: {
          title: data.title,
          categoryId: category.id,
          storageKey,
          accessLevel: 'hr',
          uploadedBy: req.auth.sub,
          employeeId: data.employeeId,
        },
      })
      logAudit(req.auth.sub, 'upload', 'employee_document', doc.id)
      return res.status(201).json({ id: doc.id, title: doc.title, createdAt: doc.createdAt })
    }
    if (req.method === 'DELETE' && sub) {
      await prisma.document.deleteMany({ where: { id: sub, employeeId: { not: null } } })
      logAudit(req.auth.sub, 'delete', 'employee_document', sub)
      return res.status(204).end()
    }
  }

  notFound(res)
}
