import type { VercelResponse } from '@vercel/node'
import { z } from 'zod'
import { prisma } from '../prisma.js'
import type { AuthedRequest } from '../middleware.js'
import { logAudit } from '../audit.js'
import { getDownloadUrl } from '../s3.js'
import { canAccessRestricted, dateOnlyPattern, forbid, money, myEmployee, notFound, parseBody, queryString, toDate } from './util.js'

// Payroll / Compensation. Very restricted: only RESTRICTED_ROLES (util.ts)
// may use any of it, and every read is audit-logged (awaited). ?kind= picks:
//   summary   GET  ?employeeId=          current salary + last change
//   salary    GET  ?employeeId=          salary history; POST records a change
//   items     GET  ?employeeId=[&kind2=] allowances / bonuses / deductions; POST; DELETE /:id
//   payslips  GET  ?employeeId=          payroll history; POST (period + Drive link, upserts); DELETE /:id
//   payslips-year   GET ?year=           the grid: active employees, their links for the 24 cut-offs, release dates
//   payslips-bulk   POST                 {entries:[{employeeId, year, month, half, link|null}]}
//                                        saves a cell, a paste or an import; link null clears it
//   mine      GET                        the signed-in employee's own payslip links (any role)

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

// Payslips live in Google Drive; the portal only stores the link. Who can
// open a file is decided by its Drive sharing, not by the portal.
const driveLink = z
  .string()
  .trim()
  .max(500)
  .refine((v) => {
    try {
      const u = new URL(v)
      return u.protocol === 'https:' && ['drive.google.com', 'docs.google.com'].includes(u.hostname)
    } catch {
      return false
    }
  }, 'Paste a Google Drive link (https://drive.google.com/...)')

const periodFields = {
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  half: z.union([z.literal(1), z.literal(2)]),
}

const payslipSchema = z.object({
  employeeId: z.string().uuid(),
  ...periodFields,
  link: driveLink,
})

const bulkSchema = z.object({
  entries: z
    .array(z.object({ employeeId: z.string().uuid(), ...periodFields, link: driveLink.nullable() }))
    .min(1)
    .max(2000),
})

// 1H = 1st-15th, 2H = 16th-end of month (the company's semi-monthly cut-offs).
function periodRange(year: number, month: number, half: 1 | 2) {
  const mm = String(month).padStart(2, '0')
  const lastDay = String(new Date(Date.UTC(year, month, 0)).getUTCDate()).padStart(2, '0')
  return half === 1
    ? { start: toDate(`${year}-${mm}-01`), end: toDate(`${year}-${mm}-15`) }
    : { start: toDate(`${year}-${mm}-16`), end: toDate(`${year}-${mm}-${lastDay}`) }
}

async function savePayslip(employeeId: string, range: { start: Date; end: Date }, link: string, by: string) {
  const existing = await prisma.payslip.findFirst({ where: { employeeId, periodStart: range.start, periodEnd: range.end } })
  if (existing) return prisma.payslip.update({ where: { id: existing.id }, data: { link, createdBy: by } })
  return prisma.payslip.create({
    data: { employeeId, periodStart: range.start, periodEnd: range.end, link, createdBy: by },
  })
}

// Payslips go live on the 25th (that month's 1H) and the 10th of the next
// month (the previous month's 2H). A weekend date moves back to the Friday
// before. Returned as YYYY-MM-DD, effective from 00:00 Manila time.
function releaseDate(periodStart: Date): string {
  const y = periodStart.getUTCFullYear()
  const m = periodStart.getUTCMonth()
  const firstHalf = periodStart.getUTCDate() <= 15
  const d = firstHalf ? new Date(Date.UTC(y, m, 25)) : new Date(Date.UTC(y, m + 1, 10))
  const dow = d.getUTCDay()
  if (dow === 6) d.setUTCDate(d.getUTCDate() - 1)
  if (dow === 0) d.setUTCDate(d.getUTCDate() - 2)
  return d.toISOString().slice(0, 10)
}

const isReleased = (periodStart: Date, now = new Date()) => now >= new Date(`${releaseDate(periodStart)}T00:00:00+08:00`)

type Money = { toString(): string } | null
const slipView = (r: { id: string; periodStart: Date; periodEnd: Date; gross: Money; deductions: Money; net: Money; link: string | null; fileKey: string | null }) => ({
  id: r.id,
  periodStart: r.periodStart,
  periodEnd: r.periodEnd,
  gross: money(r.gross),
  deductions: money(r.deductions),
  net: money(r.net),
  link: r.link,
  releaseDate: releaseDate(r.periodStart),
  hasFile: r.fileKey !== null,
})

export async function handler(req: AuthedRequest, res: VercelResponse) {
  const kind = queryString(req, 'kind')

  // An employee's own payslip links: open to any signed-in user, but only
  // ever their own rows (the employee comes from the session, not the query).
  if (kind === 'mine' && req.method === 'GET') {
    const me = await myEmployee(req)
    if (!me) return res.status(200).json([])
    const rows = await prisma.payslip.findMany({
      where: { employeeId: me.id, link: { not: null } },
      orderBy: { periodEnd: 'desc' },
    })
    await logAudit(req.auth.sub, 'view', 'payslips', me.id)
    // Not visible to the employee until the period's release date.
    const now = new Date()
    return res.status(200).json(
      rows
        .filter((r) => isReleased(r.periodStart, now))
        .map((r) => ({ id: r.id, periodStart: r.periodStart, periodEnd: r.periodEnd, link: r.link })),
    )
  }

  if (!canAccessRestricted(req)) return forbid(res)
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
  // The grid: every active employee and their link for each of the year's 24 cut-offs.
  if (kind === 'payslips-year' && req.method === 'GET') {
    const year = Number(queryString(req, 'year'))
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      return res.status(400).json({ message: 'year is required' })
    }
    const [employees, slips] = await Promise.all([
      prisma.employee.findMany({
        where: { status: 'active' },
        select: { id: true, employeeCode: true, user: { select: { firstName: true, lastName: true, email: true } } },
      }),
      prisma.payslip.findMany({
        where: { link: { not: null }, periodStart: { gte: toDate(`${year}-01-01`), lte: toDate(`${year}-12-31`) } },
        select: { employeeId: true, periodStart: true, link: true },
      }),
    ])
    await logAudit(req.auth.sub, 'view', 'payslips', null)
    const periods = Array.from({ length: 24 }, (_, i) => {
      const month = Math.floor(i / 2) + 1
      const half = ((i % 2) + 1) as 1 | 2
      return { month, half, releaseDate: releaseDate(periodRange(year, month, half).start) }
    })
    return res.status(200).json({
      year,
      periods,
      employees: employees
        .map((e) => ({
          employeeId: e.id,
          employeeCode: e.employeeCode,
          email: e.user.email,
          name: `${e.user.lastName}, ${e.user.firstName}`,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      links: slips.map((l) => ({
        employeeId: l.employeeId,
        month: l.periodStart.getUTCMonth() + 1,
        half: l.periodStart.getUTCDate() <= 15 ? 1 : 2,
        link: l.link,
      })),
    })
  }

  // Saves cells: one (autosave), a pasted block, or an import. link null clears.
  if (kind === 'payslips-bulk' && req.method === 'POST') {
    const data = parseBody(bulkSchema, req.body, res)
    if (!data) return
    const ids = [...new Set(data.entries.map((e) => e.employeeId))]
    const known = await prisma.employee.count({ where: { id: { in: ids } } })
    if (known !== ids.length) return notFound(res, 'Employee not found')
    for (const entry of data.entries) {
      const range = periodRange(entry.year, entry.month, entry.half)
      if (entry.link !== null) {
        await savePayslip(entry.employeeId, range, entry.link, req.auth.sub)
        continue
      }
      const existing = await prisma.payslip.findFirst({
        where: { employeeId: entry.employeeId, periodStart: range.start, periodEnd: range.end },
      })
      if (!existing) continue
      // A row that still has a legacy uploaded file only loses its link.
      if (existing.fileKey) await prisma.payslip.update({ where: { id: existing.id }, data: { link: null } })
      else await prisma.payslip.delete({ where: { id: existing.id } })
    }
    await logAudit(req.auth.sub, 'update', 'payslips-bulk', `${data.entries.length} cell(s)`)
    return res.status(200).json({ saved: data.entries.length })
  }

  if (kind === 'payslips') {
    if (req.method === 'GET' && !sub) {
      if (!employeeId) return res.status(400).json({ message: 'employeeId is required' })
      const rows = await prisma.payslip.findMany({ where: { employeeId }, orderBy: { periodEnd: 'desc' } })
      await logAudit(req.auth.sub, 'view', 'payslips', employeeId)
      return res.status(200).json(rows.map(slipView))
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
      const saved = await savePayslip(data.employeeId, periodRange(data.year, data.month, data.half), data.link, req.auth.sub)
      await logAudit(req.auth.sub, 'create', 'payslip', saved.id)
      return res.status(201).json(slipView(saved))
    }
    if (req.method === 'DELETE' && sub) {
      await prisma.payslip.deleteMany({ where: { id: sub } })
      await logAudit(req.auth.sub, 'delete', 'payslip', sub)
      return res.status(204).end()
    }
  }

  notFound(res)
}
