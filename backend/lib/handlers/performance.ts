import type { VercelResponse } from '@vercel/node'
import { z } from 'zod'
import { prisma } from '../prisma.js'
import type { AuthedRequest } from '../middleware.js'
import { logAudit } from '../audit.js'
import { notifyUsers } from '../notify.js'
import { formatDisplayName } from '../names.js'
import {
  dateOnlyPattern,
  forbid,
  isHrOrAdmin,
  isSupervisorOf,
  myEmployee,
  notFound,
  parseBody,
  queryString,
  toDate,
} from './util.js'

// Performance management under /hr/performance:
//   ?kind=reviews  — evaluation cycles: self assessment -> supervisor
//                    evaluation -> HR review -> completed.
//   ?kind=notes    — coaching notes and improvement plans.
// HR/Admin create reviews and see everything. An employee sees and fills
// in their own; a supervisor sees and evaluates their direct reports.
// ("Goals" was struck from HR's list, so there is no goals feature.)

const rating = z.number().int().min(1).max(5)

const createReviewSchema = z.object({
  employeeId: z.string().uuid(),
  period: z.string().trim().min(1).max(60),
})

const reviewActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('submit_self'), selfAssessment: z.string().trim().min(1).max(4000) }),
  z.object({
    action: z.literal('submit_supervisor'),
    supervisorEvaluation: z.string().trim().min(1).max(4000),
    supervisorRating: rating,
  }),
  z.object({
    action: z.literal('complete'),
    hrReview: z.string().trim().min(1).max(4000),
    finalRating: rating,
  }),
])

const noteSchema = z.object({
  employeeId: z.string().uuid(),
  kind: z.enum(['coaching', 'improvement_plan']),
  title: z.string().trim().min(1).max(160),
  details: z.string().trim().max(3000).nullable().optional(),
  dueDate: z.string().regex(dateOnlyPattern, 'dueDate must be YYYY-MM-DD').nullable().optional(),
})

const noteUpdateSchema = z.object({ status: z.enum(['active', 'completed']) })

const reviewInclude = { employee: { include: { user: true, manager: true } } } as const

function serializeReview(r: {
  id: string
  employeeId: string
  period: string
  status: string
  selfAssessment: string | null
  supervisorEvaluation: string | null
  supervisorRating: number | null
  hrReview: string | null
  finalRating: number | null
  createdAt: Date
  updatedAt: Date
  employee: { user: { firstName: string; middleName: string | null; lastName: string } }
}) {
  return {
    id: r.id,
    employeeId: r.employeeId,
    employeeName: formatDisplayName(r.employee.user.firstName, r.employee.user.middleName, r.employee.user.lastName),
    period: r.period,
    status: r.status,
    selfAssessment: r.selfAssessment,
    supervisorEvaluation: r.supervisorEvaluation,
    supervisorRating: r.supervisorRating,
    hrReview: r.hrReview,
    finalRating: r.finalRating,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }
}

export async function handler(req: AuthedRequest, res: VercelResponse) {
  const kind = queryString(req, 'kind')
  const sub = queryString(req, 'sub')
  const me = await myEmployee(req)

  // ---- the caller's direct reports (for the coaching / improvement forms)
  if (kind === 'supervisees' && req.method === 'GET') {
    const rows = me
      ? await prisma.employee.findMany({ where: { managerId: me.id }, include: { user: true } })
      : []
    return res.status(200).json(
      rows.map((e) => ({ id: e.id, name: formatDisplayName(e.user.firstName, e.user.middleName, e.user.lastName) })),
    )
  }

  // ---- reviews
  if (kind === 'reviews') {
    if (req.method === 'GET') {
      const rows = await prisma.performanceReview.findMany({
        where: isHrOrAdmin(req)
          ? {}
          : { OR: [...(me ? [{ employeeId: me.id }, { employee: { managerId: me.id } }] : [{ id: '__none__' }])] },
        include: reviewInclude,
        orderBy: { createdAt: 'desc' },
      })
      return res.status(200).json(rows.map(serializeReview))
    }

    if (req.method === 'POST') {
      if (!isHrOrAdmin(req)) return forbid(res)
      const data = parseBody(createReviewSchema, req.body, res)
      if (!data) return
      const created = await prisma.performanceReview.create({
        data: { ...data, createdBy: req.auth.sub },
        include: reviewInclude,
      })
      logAudit(req.auth.sub, 'create', 'performance_review', created.id)
      const owner = await prisma.employee.findUnique({ where: { id: data.employeeId }, select: { userId: true } })
      if (owner) {
        await notifyUsers([owner.userId], {
          type: 'hr_request',
          title: `Performance review: ${data.period}`,
          body: 'Your self assessment is due.',
          link: '/performance',
        })
      }
      return res.status(201).json(serializeReview(created))
    }

    if (req.method === 'PUT' && sub) {
      const data = parseBody(reviewActionSchema, req.body, res)
      if (!data) return
      const review = await prisma.performanceReview.findUnique({ where: { id: sub }, include: reviewInclude })
      if (!review) return notFound(res, 'Review not found')

      let update: Record<string, unknown>
      if (data.action === 'submit_self') {
        if (review.employeeId !== me?.id) return forbid(res)
        if (review.status !== 'self_assessment') {
          res.status(400).json({ message: 'The self assessment has already been submitted' })
          return
        }
        update = { selfAssessment: data.selfAssessment, status: 'supervisor_evaluation' }
      } else if (data.action === 'submit_supervisor') {
        if (!isHrOrAdmin(req) && !(await isSupervisorOf(req, review.employeeId))) return forbid(res)
        if (review.status !== 'supervisor_evaluation') {
          res.status(400).json({ message: 'This review is not waiting for a supervisor evaluation' })
          return
        }
        update = {
          supervisorEvaluation: data.supervisorEvaluation,
          supervisorRating: data.supervisorRating,
          status: 'hr_review',
        }
      } else {
        if (!isHrOrAdmin(req)) return forbid(res)
        if (review.status !== 'hr_review') {
          res.status(400).json({ message: 'This review is not waiting for HR review' })
          return
        }
        update = { hrReview: data.hrReview, finalRating: data.finalRating, status: 'completed' }
      }

      const updated = await prisma.performanceReview.update({ where: { id: sub }, data: update, include: reviewInclude })
      logAudit(req.auth.sub, data.action, 'performance_review', sub)
      if (data.action === 'complete') {
        const owner = await prisma.employee.findUnique({ where: { id: review.employeeId }, select: { userId: true } })
        if (owner) {
          await notifyUsers([owner.userId], {
            type: 'hr_request',
            title: `Your ${review.period} performance review is complete`,
            link: '/performance',
          })
        }
      }
      return res.status(200).json(serializeReview(updated))
    }

    if (req.method === 'DELETE' && sub) {
      if (!isHrOrAdmin(req)) return forbid(res)
      await prisma.performanceReview.deleteMany({ where: { id: sub } })
      logAudit(req.auth.sub, 'delete', 'performance_review', sub)
      return res.status(204).end()
    }
  }

  // ---- coaching / improvement plans
  if (kind === 'notes') {
    if (req.method === 'GET') {
      const rows = await prisma.performanceNote.findMany({
        where: isHrOrAdmin(req)
          ? {}
          : { OR: [...(me ? [{ employeeId: me.id }, { employee: { managerId: me.id } }] : [{ id: '__none__' }])] },
        include: { employee: { include: { user: true } } },
        orderBy: { createdAt: 'desc' },
      })
      return res.status(200).json(
        rows.map((n) => ({
          id: n.id,
          employeeId: n.employeeId,
          employeeName: formatDisplayName(n.employee.user.firstName, n.employee.user.middleName, n.employee.user.lastName),
          kind: n.kind,
          title: n.title,
          details: n.details,
          status: n.status,
          dueDate: n.dueDate,
          createdAt: n.createdAt,
        })),
      )
    }
    if (req.method === 'POST') {
      const data = parseBody(noteSchema, req.body, res)
      if (!data) return
      if (!isHrOrAdmin(req) && !(await isSupervisorOf(req, data.employeeId))) return forbid(res)
      const created = await prisma.performanceNote.create({
        data: {
          employeeId: data.employeeId,
          kind: data.kind,
          title: data.title,
          details: data.details ?? null,
          dueDate: data.dueDate ? toDate(data.dueDate) : null,
          createdBy: req.auth.sub,
        },
      })
      logAudit(req.auth.sub, 'create', 'performance_note', created.id)
      return res.status(201).json(created)
    }
    if (req.method === 'PUT' && sub) {
      const data = parseBody(noteUpdateSchema, req.body, res)
      if (!data) return
      const note = await prisma.performanceNote.findUnique({ where: { id: sub } })
      if (!note) return notFound(res)
      if (!isHrOrAdmin(req) && !(await isSupervisorOf(req, note.employeeId))) return forbid(res)
      const updated = await prisma.performanceNote.update({ where: { id: sub }, data })
      logAudit(req.auth.sub, 'update', 'performance_note', sub)
      return res.status(200).json(updated)
    }
    if (req.method === 'DELETE' && sub) {
      if (!isHrOrAdmin(req)) return forbid(res)
      await prisma.performanceNote.deleteMany({ where: { id: sub } })
      logAudit(req.auth.sub, 'delete', 'performance_note', sub)
      return res.status(204).end()
    }
  }

  notFound(res)
}
