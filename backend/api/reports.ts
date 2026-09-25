import type { VercelResponse } from '@vercel/node'
import { z } from 'zod'
import type { Prisma, ReportStatus } from '@prisma/client'
import { prisma } from '../lib/prisma.js'
import { requireAuth, type AuthedRequest } from '../lib/middleware.js'
import { logAudit } from '../lib/audit.js'
import { getDownloadUrl, putObject } from '../lib/s3.js'
import { buildCsv, buildPdf, buildXlsx, type ReportData } from '../lib/reports.js'
import { foaReportDataSchema, resolveSchemaKey, type FoaReportData } from '../lib/foaReport.js'
import { formatDisplayName } from '../lib/names.js'
import { notifyUsers } from '../lib/notify.js'

// GET /reports (list, role-scoped), POST /reports (create draft),
// PUT /reports/:id (lifecycle transitions, via a vercel.json rewrite
// arriving as ?sub=<id>), GET /reports/:id/export?format=csv|xlsx|pdf
// (also via a rewrite, arriving as ?sub=<id> with format still in the
// query string).

const reportDataSchema = z.object({
  client: z.string().optional(),
  headcount: z.number().optional(),
  attendance: z.string().optional(),
  productivity: z.string().optional(),
  qa: z.string().optional(),
  sla: z.string().optional(),
  performanceMetrics: z.string().optional(),
  issues: z.string().optional(),
  achievements: z.string().optional(),
  actionItems: z.string().optional(),
  managerComments: z.string().optional(),
})

const createSchema = z.object({
  teamId: z.string().uuid(),
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime(),
  // Validated against the right shape (generic vs. FOA) once the team's
  // department is known server-side — see handleCreate.
  data: z.unknown().optional(),
})

const transitionSchema = z.object({
  action: z.enum(['save', 'submit', 'review', 'approve', 'reject', 'reopen']),
  data: z.unknown().optional(),
  comment: z.string().optional(),
})

function parseReportData(
  schemaKey: string,
  data: unknown,
): { success: true; data: (ReportData | FoaReportData) | undefined } | { success: false } {
  if (data === undefined) return { success: true, data: undefined }
  const schema = schemaKey === 'foa' ? foaReportDataSchema : reportDataSchema
  const parsed = schema.safeParse(data)
  return parsed.success ? { success: true, data: parsed.data } : { success: false }
}

function isReviewer(req: AuthedRequest): boolean {
  return req.auth.roles.some((r) => r === 'manager' || r === 'hr' || r === 'admin')
}

function isPrivileged(req: AuthedRequest): boolean {
  return req.auth.roles.some((r) => r === 'hr' || r === 'admin')
}

async function myTeamId(req: AuthedRequest): Promise<string | null> {
  const employee = await prisma.employee.findUnique({ where: { userId: req.auth.sub } })
  return employee?.teamId ?? null
}

async function canEditTeam(req: AuthedRequest, teamId: string): Promise<boolean> {
  if (isPrivileged(req)) return true
  if (!req.auth.roles.includes('team_leader')) return false
  return (await myTeamId(req)) === teamId
}

// Extends canEditTeam for the FOA-style case: a plain employee can create
// or edit only the individually-authored report they own, never a team
// leader/HR/Admin-only action.
async function canEditReport(
  req: AuthedRequest,
  teamId: string,
  schemaKey: string,
  authorId: string | null,
): Promise<boolean> {
  if (await canEditTeam(req, teamId)) return true
  if (schemaKey !== 'foa' || authorId !== req.auth.sub) return false
  return (await myTeamId(req)) === teamId
}

function isElevated(req: AuthedRequest): boolean {
  return req.auth.roles.some((r) => r === 'team_leader' || r === 'manager' || r === 'hr' || r === 'admin')
}

async function resolveAuthorNames(userIds: (string | null)[]): Promise<Map<string, string>> {
  const ids = [...new Set(userIds.filter((id): id is string => id != null))]
  if (ids.length === 0) return new Map()
  const users = await prisma.user.findMany({ where: { id: { in: ids } } })
  return new Map(users.map((u) => [u.id, formatDisplayName(u.firstName, u.middleName, u.lastName)]))
}

async function handleList(req: AuthedRequest, res: VercelResponse) {
  // A plain employee only ever sees the individually-authored reports they
  // wrote themselves (the FOA case); everyone else keeps the existing
  // team-leader/manager/hr/admin scoping.
  const where = isElevated(req)
    ? req.auth.roles.includes('team_leader') && !isReviewer(req)
      ? { teamId: (await myTeamId(req)) ?? '__none__' }
      : {}
    : { authorId: req.auth.sub }

  const reports = await prisma.weeklyReport.findMany({
    where,
    include: { team: { include: { department: true } } },
    orderBy: { periodStart: 'desc' },
  })

  const authorNames = await resolveAuthorNames(reports.map((r) => r.authorId))

  res.status(200).json(
    reports.map((r) => ({
      id: r.id,
      teamId: r.teamId,
      team: r.team.name,
      department: r.team.department.name,
      periodStart: r.periodStart,
      periodEnd: r.periodEnd,
      status: r.status,
      submittedBy: r.submittedBy,
      schemaKey: r.schemaKey,
      authorId: r.authorId,
      authorName: r.authorId ? (authorNames.get(r.authorId) ?? null) : null,
      data: r.data,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    })),
  )
}

async function handleCreate(req: AuthedRequest, res: VercelResponse) {
  const parsed = createSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ message: 'Invalid report payload' })
    return
  }

  const { teamId, periodStart, periodEnd, data } = parsed.data

  const team = await prisma.team.findUnique({ where: { id: teamId }, include: { department: true } })
  if (!team) {
    res.status(404).json({ message: 'Team not found' })
    return
  }
  const schemaKey = resolveSchemaKey(team.department.name)

  // Not created yet, so there's no existing authorId to check against —
  // pass the requester's own id, since they'd be the author of what
  // they're about to create.
  if (!(await canEditReport(req, teamId, schemaKey, req.auth.sub))) {
    res.status(403).json({ message: 'You can only create reports for your own team' })
    return
  }

  const parsedData = parseReportData(schemaKey, data)
  if (!parsedData.success) {
    res.status(400).json({ message: 'Invalid report payload' })
    return
  }

  const report = await prisma.weeklyReport.create({
    data: {
      teamId,
      periodStart: new Date(periodStart),
      periodEnd: new Date(periodEnd),
      schemaKey,
      // Individually-authored reports (FOA) are owned by whoever created
      // them; generic team-wide reports have no single author.
      authorId: schemaKey === 'foa' ? req.auth.sub : null,
      data: (parsedData.data ?? {}) as Prisma.InputJsonValue,
    },
  })

  logAudit(req.auth.sub, 'create', 'weekly_report', report.id)
  res.status(201).json(report)
}

async function handleTransition(req: AuthedRequest, res: VercelResponse, id: string) {
  const parsed = transitionSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ message: 'Invalid request' })
    return
  }

  const report = await prisma.weeklyReport.findUnique({ where: { id } })
  if (!report) {
    res.status(404).json({ message: 'Report not found' })
    return
  }
  if (report.status === 'approved') {
    res.status(400).json({ message: 'Approved reports cannot be changed' })
    return
  }

  const { action, data, comment } = parsed.data
  const editableStatuses: ReportStatus[] = ['draft', 'rejected']

  let nextStatus: ReportStatus = report.status
  // Kept as a loose record rather than the ReportData | FoaReportData
  // union: it's merged from whichever schema this report actually uses
  // (validated against that schema in parseReportData) and stored as
  // opaque JSON either way.
  let nextData = report.data as Record<string, unknown>
  let submittedBy = report.submittedBy

  if (action === 'save' || action === 'submit') {
    if (!editableStatuses.includes(report.status)) {
      res.status(400).json({ message: `Cannot edit a report with status "${report.status}"` })
      return
    }
    if (!(await canEditReport(req, report.teamId, report.schemaKey, report.authorId))) {
      res.status(403).json({ message: 'Insufficient permissions' })
      return
    }
    if (data !== undefined) {
      const parsedData = parseReportData(report.schemaKey, data)
      if (!parsedData.success) {
        res.status(400).json({ message: 'Invalid report payload' })
        return
      }
      nextData = { ...nextData, ...parsedData.data }
    }
    if (action === 'submit') {
      nextStatus = 'submitted'
      submittedBy = req.auth.sub
    }
  } else if (action === 'review') {
    if (report.status !== 'submitted') {
      res.status(400).json({ message: 'Only submitted reports can be reviewed' })
      return
    }
    if (!isReviewer(req)) {
      res.status(403).json({ message: 'Insufficient permissions' })
      return
    }
    nextStatus = 'reviewed'
  } else if (action === 'approve') {
    if (report.status !== 'reviewed') {
      res.status(400).json({ message: 'Only reviewed reports can be approved' })
      return
    }
    if (!isReviewer(req)) {
      res.status(403).json({ message: 'Insufficient permissions' })
      return
    }
    nextStatus = 'approved'
  } else if (action === 'reject') {
    if (report.status !== 'submitted' && report.status !== 'reviewed') {
      res.status(400).json({ message: 'Only submitted or reviewed reports can be rejected' })
      return
    }
    if (!isReviewer(req)) {
      res.status(403).json({ message: 'Insufficient permissions' })
      return
    }
    nextStatus = 'rejected'
    if (comment) nextData = { ...nextData, managerComments: comment }
  } else if (action === 'reopen') {
    if (report.status !== 'rejected') {
      res.status(400).json({ message: 'Only rejected reports can be reopened' })
      return
    }
    if (!(await canEditReport(req, report.teamId, report.schemaKey, report.authorId))) {
      res.status(403).json({ message: 'Insufficient permissions' })
      return
    }
    nextStatus = 'draft'
  }

  const updated = await prisma.weeklyReport.update({
    where: { id },
    data: { status: nextStatus, data: nextData as Prisma.InputJsonValue, submittedBy },
  })

  logAudit(req.auth.sub, action, 'weekly_report', id)

  if (action === 'approve' || action === 'reject') {
    const owner = report.submittedBy ?? report.authorId
    if (owner && owner !== req.auth.sub) {
      await notifyUsers([owner], {
        type: 'report_decision',
        title: `Weekly report ${nextStatus}`,
        body: action === 'reject' && comment ? `Comment: ${comment}` : undefined,
        link: '/reports',
      })
    }
  }

  res.status(200).json(updated)
}

async function handleExport(req: AuthedRequest, res: VercelResponse, id: string) {
  const format = typeof req.query.format === 'string' ? req.query.format : 'csv'
  if (!['csv', 'xlsx', 'pdf'].includes(format)) {
    res.status(400).json({ message: 'format must be csv, xlsx, or pdf' })
    return
  }

  const report = await prisma.weeklyReport.findUnique({ where: { id }, include: { team: true } })
  if (!report) {
    res.status(404).json({ message: 'Report not found' })
    return
  }

  // The report's own author can always export it (mirrors the original
  // Jotform, which generated each submitter a PDF of their own report),
  // on top of the usual reviewer/team-leader-of-that-team access.
  const isOwnReport = report.authorId === req.auth.sub
  if (!isOwnReport && !isReviewer(req) && !req.auth.roles.includes('team_leader')) {
    res.status(403).json({ message: 'Insufficient permissions' })
    return
  }

  if (!isOwnReport && req.auth.roles.includes('team_leader') && !isReviewer(req)) {
    if ((await myTeamId(req)) !== report.teamId) {
      res.status(403).json({ message: 'Insufficient permissions' })
      return
    }
  }

  let authorName: string | undefined
  if (report.authorId) {
    const author = await prisma.user.findUnique({ where: { id: report.authorId } })
    if (author) authorName = formatDisplayName(author.firstName, author.middleName, author.lastName)
  }

  const input = {
    teamName: report.team.name,
    periodStart: report.periodStart,
    periodEnd: report.periodEnd,
    status: report.status,
    schemaKey: report.schemaKey,
    authorName,
    data: report.data as ReportData | FoaReportData,
  }

  let buffer: Buffer
  let contentType: string
  if (format === 'csv') {
    buffer = buildCsv(input)
    contentType = 'text/csv'
  } else if (format === 'xlsx') {
    buffer = await buildXlsx(input)
    contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  } else {
    buffer = await buildPdf(input)
    contentType = 'application/pdf'
  }

  const storageKey = `reports/${format}/${report.id}-${Date.now()}.${format}`
  await putObject(storageKey, buffer, contentType)
  const url = await getDownloadUrl(storageKey)

  logAudit(req.auth.sub, 'export', 'weekly_report', id)
  res.status(200).json({ url })
}

async function handler(req: AuthedRequest, res: VercelResponse) {
  const sub = typeof req.query.sub === 'string' ? req.query.sub : undefined

  if (!sub && req.method === 'GET') return handleList(req, res)
  if (!sub && req.method === 'POST') return handleCreate(req, res)
  if (sub && req.method === 'PUT') return handleTransition(req, res, sub)
  if (sub && req.method === 'GET') return handleExport(req, res, sub)

  res.status(404).json({ message: 'Not found' })
}

export default requireAuth(handler)
