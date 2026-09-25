import type { VercelResponse } from '@vercel/node'
import { z } from 'zod'
import { prisma } from '../prisma.js'
import type { AuthedRequest } from '../middleware.js'
import { logAudit } from '../audit.js'
import { forbid, isHrOrAdmin, notFound, parseBody, queryString } from './util.js'

// Recruitment, HR/Admin only. One handler, three collections chosen by
// ?kind= : openings | applicants | interviews.

const OPENING_STATUSES = ['open', 'on_hold', 'closed'] as const
const APPLICANT_STATUSES = ['applied', 'screening', 'interview', 'offer', 'hired', 'rejected', 'withdrawn'] as const
const FINAL_APPLICANT = ['hired', 'rejected', 'withdrawn']

const openingSchema = z.object({
  title: z.string().trim().min(1).max(160),
  department: z.string().trim().max(120).nullable().optional(),
  description: z.string().trim().max(3000).nullable().optional(),
  status: z.enum(OPENING_STATUSES).optional(),
})

const applicantSchema = z.object({
  jobOpeningId: z.string().uuid(),
  name: z.string().trim().min(1).max(160),
  email: z.string().trim().email().nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  information: z.string().trim().max(3000).nullable().optional(),
  status: z.enum(APPLICANT_STATUSES).optional(),
  decisionNote: z.string().trim().max(1000).nullable().optional(),
})

const interviewSchema = z.object({
  applicantId: z.string().uuid(),
  scheduledAt: z.string().datetime(),
  interviewer: z.string().trim().max(120).nullable().optional(),
  notes: z.string().trim().max(3000).nullable().optional(),
})

export async function handler(req: AuthedRequest, res: VercelResponse) {
  if (!isHrOrAdmin(req)) return forbid(res)
  const kind = queryString(req, 'kind')
  const sub = queryString(req, 'sub')

  // ---- job openings
  if (kind === 'openings') {
    if (req.method === 'GET') {
      const rows = await prisma.jobOpening.findMany({
        include: { _count: { select: { applicants: true } } },
        orderBy: { openedAt: 'desc' },
      })
      return res.status(200).json(rows.map(({ _count, ...o }) => ({ ...o, applicantCount: _count.applicants })))
    }
    if (req.method === 'POST') {
      const data = parseBody(openingSchema, req.body, res)
      if (!data) return
      const created = await prisma.jobOpening.create({ data })
      logAudit(req.auth.sub, 'create', 'job_opening', created.id)
      return res.status(201).json({ ...created, applicantCount: 0 })
    }
    if (req.method === 'PUT' && sub) {
      const data = parseBody(openingSchema.partial(), req.body, res)
      if (!data) return
      const existing = await prisma.jobOpening.findUnique({ where: { id: sub } })
      if (!existing) return notFound(res, 'Job opening not found')
      const updated = await prisma.jobOpening.update({
        where: { id: sub },
        data: {
          ...data,
          ...(data.status !== undefined && { closedAt: data.status === 'closed' ? new Date() : null }),
        },
        include: { _count: { select: { applicants: true } } },
      })
      logAudit(req.auth.sub, 'update', 'job_opening', sub)
      const { _count, ...rest } = updated
      return res.status(200).json({ ...rest, applicantCount: _count.applicants })
    }
    if (req.method === 'DELETE' && sub) {
      await prisma.jobOpening.deleteMany({ where: { id: sub } })
      logAudit(req.auth.sub, 'delete', 'job_opening', sub)
      return res.status(204).end()
    }
  }

  // ---- applicants
  if (kind === 'applicants') {
    if (req.method === 'GET') {
      const jobOpeningId = queryString(req, 'jobOpeningId')
      const rows = await prisma.applicant.findMany({
        where: jobOpeningId ? { jobOpeningId } : {},
        include: { jobOpening: { select: { title: true } }, interviews: { orderBy: { scheduledAt: 'asc' } } },
        orderBy: { createdAt: 'desc' },
      })
      await logAudit(req.auth.sub, 'view', 'applicants', null)
      return res.status(200).json(rows.map(({ jobOpening, ...a }) => ({ ...a, jobTitle: jobOpening.title })))
    }
    if (req.method === 'POST') {
      const data = parseBody(applicantSchema, req.body, res)
      if (!data) return
      const created = await prisma.applicant.create({
        data: { ...data, ...(data.status && FINAL_APPLICANT.includes(data.status) ? { decidedAt: new Date() } : {}) },
        include: { jobOpening: { select: { title: true } }, interviews: true },
      })
      logAudit(req.auth.sub, 'create', 'applicant', created.id)
      const { jobOpening, ...rest } = created
      return res.status(201).json({ ...rest, jobTitle: jobOpening.title })
    }
    if (req.method === 'PUT' && sub) {
      const data = parseBody(applicantSchema.omit({ jobOpeningId: true }).partial(), req.body, res)
      if (!data) return
      if (!(await prisma.applicant.findUnique({ where: { id: sub } }))) return notFound(res, 'Applicant not found')
      const updated = await prisma.applicant.update({
        where: { id: sub },
        data: {
          ...data,
          ...(data.status !== undefined && { decidedAt: FINAL_APPLICANT.includes(data.status) ? new Date() : null }),
        },
        include: { jobOpening: { select: { title: true } }, interviews: { orderBy: { scheduledAt: 'asc' } } },
      })
      logAudit(req.auth.sub, 'update', 'applicant', sub)
      const { jobOpening, ...rest } = updated
      return res.status(200).json({ ...rest, jobTitle: jobOpening.title })
    }
    if (req.method === 'DELETE' && sub) {
      await prisma.applicant.deleteMany({ where: { id: sub } })
      logAudit(req.auth.sub, 'delete', 'applicant', sub)
      return res.status(204).end()
    }
  }

  // ---- interviews
  if (kind === 'interviews') {
    if (req.method === 'POST') {
      const data = parseBody(interviewSchema, req.body, res)
      if (!data) return
      const created = await prisma.interview.create({
        data: {
          applicantId: data.applicantId,
          scheduledAt: new Date(data.scheduledAt),
          interviewer: data.interviewer ?? null,
          notes: data.notes ?? null,
        },
      })
      logAudit(req.auth.sub, 'create', 'interview', created.id)
      return res.status(201).json(created)
    }
    if (req.method === 'PUT' && sub) {
      const data = parseBody(interviewSchema.omit({ applicantId: true }).partial(), req.body, res)
      if (!data) return
      if (!(await prisma.interview.findUnique({ where: { id: sub } }))) return notFound(res, 'Interview not found')
      const updated = await prisma.interview.update({
        where: { id: sub },
        data: {
          ...(data.scheduledAt !== undefined && { scheduledAt: new Date(data.scheduledAt) }),
          ...(data.interviewer !== undefined && { interviewer: data.interviewer }),
          ...(data.notes !== undefined && { notes: data.notes }),
        },
      })
      logAudit(req.auth.sub, 'update', 'interview', sub)
      return res.status(200).json(updated)
    }
    if (req.method === 'DELETE' && sub) {
      await prisma.interview.deleteMany({ where: { id: sub } })
      logAudit(req.auth.sub, 'delete', 'interview', sub)
      return res.status(204).end()
    }
  }

  notFound(res)
}
