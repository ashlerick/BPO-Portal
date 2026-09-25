import type { VercelResponse } from '@vercel/node'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { prisma } from '../prisma.js'
import type { AuthedRequest } from '../middleware.js'
import { logAudit } from '../audit.js'
import { getDownloadUrl, putObject } from '../s3.js'
import { canAccessRestricted, dateOnlyPattern, forbid, money, notFound, parseBody, queryString, toDate } from './util.js'

// Payroll / Compensation. Very restricted: only RESTRICTED_ROLES (util.ts)
// may use any of it, and every read is audit-logged (awaited). ?kind= picks:
//   summary   GET  ?employeeId=          current salary + last change
//   salary    GET  ?employeeId=          salary history; POST records a change
//   items     GET  ?employeeId=[&kind2=] allowances / bonuses / deductions; POST; DELETE /:id
//   payslips  GET  ?employeeId=          payroll history; POST; DELETE /:id; GET /:id?download=1

const amount = z.number().min(0).max(100_000_000)
const dateField = z.string().regex(dateOnlyPattern, 'Dates must be YYYY-MM-DD')

const salarySchema = z.object({
  employeeId: z.string().uuid(),
  effectiveDate: dateField,
  newSalary: amount,
  reason: z.string().trim().max(500).nullable().optional(),
})

const itemSchema = z.object({
  employeeId: z.string().uuid(),
  kind: z.enum(['allowance', 'bonus', 'deduction']),
  label: z.string().trim().min(1).max(120),
  amount,
  date: dateField,
  recurring: z.boolean().default(false),
})

const payslipSchema = z.object({
  employeeId: z.string().uuid(),
  periodStart: dateField,
  periodEnd: dateField,
  gross: amount,
  deductions: amount,
  file: z.object({ contentType: z.string().min(1), fileName: z.string().min(1), base64: z.string().min(1) }).optional(),
})

export async function handler(req: AuthedRequest, res: VercelResponse) {
  if (!canAccessRestricted(req)) return forbid(res)
  const kind = queryString(req, 'kind')
  const sub = queryString(req, 'sub')
  const employeeId = queryString(req, 'employeeId')

  // ---- summary (current salary)
  if (kind === 'summary' && req.method === 'GET') {
    if (!employeeId) return res.status(400).json({ message: 'employeeId is required' })
    const [emp, last] = await Promise.all([
      prisma.employee.findUnique({ where: { id: employeeId }, select: { salary: true } }),
      prisma.salaryChange.findFirst({ where: { employeeId }, orderBy: { effectiveDate: 'desc' } }),
    ])
    if (!emp) return notFound(res, 'Employee not found')
    await logAudit(req.auth.sub, 'view', 'payroll_summary', employeeId)
    return res.status(200).json({ salary: money(emp.salary), lastChangeDate: last?.effectiveDate ?? null })
  }

  // ---- salary history / changes
  if (kind === 'salary') {
    if (req.method === 'GET') {
      if (!employeeId) return res.status(400).json({ message: 'employeeId is required' })
      const rows = await prisma.salaryChange.findMany({ where: { employeeId }, orderBy: { effectiveDate: 'desc' } })
      await logAudit(req.auth.sub, 'view', 'salary_history', employeeId)
      return res.status(200).json(
        rows.map((r) => ({
          id: r.id,
          effectiveDate: r.effectiveDate,
          previousSalary: money(r.previousSalary),
          newSalary: money(r.newSalary),
          reason: r.reason,
        })),
      )
    }
    if (req.method === 'POST') {
      const data = parseBody(salarySchema, req.body, res)
      if (!data) return
      const emp = await prisma.employee.findUnique({ where: { id: data.employeeId }, select: { salary: true } })
      if (!emp) return notFound(res, 'Employee not found')
      const [change] = await prisma.$transaction([
        prisma.salaryChange.create({
          data: {
            employeeId: data.employeeId,
            effectiveDate: toDate(data.effectiveDate),
            previousSalary: emp.salary,
            newSalary: data.newSalary,
            reason: data.reason ?? null,
            createdBy: req.auth.sub,
          },
        }),
        prisma.employee.update({ where: { id: data.employeeId }, data: { salary: data.newSalary } }),
      ])
      await logAudit(req.auth.sub, 'salary_change', 'employee', data.employeeId)
      return res.status(201).json({
        id: change.id,
        effectiveDate: change.effectiveDate,
        previousSalary: money(change.previousSalary),
        newSalary: money(change.newSalary),
        reason: change.reason,
      })
    }
  }

  // ---- allowances / bonuses / deductions
  if (kind === 'items') {
    if (req.method === 'GET') {
      if (!employeeId) return res.status(400).json({ message: 'employeeId is required' })
      const itemKind = queryString(req, 'kind2')
      const rows = await prisma.payItem.findMany({
        where: { employeeId, ...(itemKind ? { kind: itemKind } : {}) },
        orderBy: { date: 'desc' },
      })
      await logAudit(req.auth.sub, 'view', 'pay_items', employeeId)
      return res.status(200).json(rows.map((r) => ({ ...r, amount: money(r.amount) })))
    }
    if (req.method === 'POST') {
      const data = parseBody(itemSchema, req.body, res)
      if (!data) return
      const created = await prisma.payItem.create({
        data: { ...data, date: toDate(data.date), createdBy: req.auth.sub },
      })
      await logAudit(req.auth.sub, 'create', 'pay_item', created.id)
      return res.status(201).json({ ...created, amount: money(created.amount) })
    }
    if (req.method === 'DELETE' && sub) {
      await prisma.payItem.deleteMany({ where: { id: sub } })
      await logAudit(req.auth.sub, 'delete', 'pay_item', sub)
      return res.status(204).end()
    }
  }

  // ---- payslips / payroll history
  if (kind === 'payslips') {
    if (req.method === 'GET' && !sub) {
      if (!employeeId) return res.status(400).json({ message: 'employeeId is required' })
      const rows = await prisma.payslip.findMany({ where: { employeeId }, orderBy: { periodEnd: 'desc' } })
      await logAudit(req.auth.sub, 'view', 'payslips', employeeId)
      return res.status(200).json(
        rows.map((r) => ({
          id: r.id,
          periodStart: r.periodStart,
          periodEnd: r.periodEnd,
          gross: money(r.gross),
          deductions: money(r.deductions),
          net: money(r.net),
          hasFile: r.fileKey !== null,
        })),
      )
    }
    if (req.method === 'GET' && sub) {
      const slip = await prisma.payslip.findUnique({ where: { id: sub } })
      if (!slip || !slip.fileKey) return notFound(res, 'Payslip file not found')
      await logAudit(req.auth.sub, 'download', 'payslip', sub)
      return res.status(200).json({ url: await getDownloadUrl(slip.fileKey) })
    }
    if (req.method === 'POST') {
      const data = parseBody(payslipSchema, req.body, res)
      if (!data) return
      if (data.periodEnd < data.periodStart) {
        res.status(400).json({ message: 'Period end can\'t be before the period start' })
        return
      }
      let fileKey: string | null = null
      if (data.file) {
        const buffer = Buffer.from(data.file.base64, 'base64')
        if (buffer.length === 0 || buffer.length > 4 * 1024 * 1024) {
          res.status(400).json({ message: 'File must be non-empty and under 4MB' })
          return
        }
        fileKey = `payslips/${data.employeeId}/${randomUUID()}-${data.file.fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`
        await putObject(fileKey, buffer, data.file.contentType)
      }
      const created = await prisma.payslip.create({
        data: {
          employeeId: data.employeeId,
          periodStart: toDate(data.periodStart),
          periodEnd: toDate(data.periodEnd),
          gross: data.gross,
          deductions: data.deductions,
          net: Math.round((data.gross - data.deductions) * 100) / 100,
          fileKey,
          createdBy: req.auth.sub,
        },
      })
      await logAudit(req.auth.sub, 'create', 'payslip', created.id)
      return res.status(201).json({
        id: created.id,
        periodStart: created.periodStart,
        periodEnd: created.periodEnd,
        gross: money(created.gross),
        deductions: money(created.deductions),
        net: money(created.net),
        hasFile: fileKey !== null,
      })
    }
    if (req.method === 'DELETE' && sub) {
      await prisma.payslip.deleteMany({ where: { id: sub } })
      await logAudit(req.auth.sub, 'delete', 'payslip', sub)
      return res.status(204).end()
    }
  }

  notFound(res)
}
