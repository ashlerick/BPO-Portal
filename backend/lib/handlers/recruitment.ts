import type { VercelResponse } from '@vercel/node'
import { z } from 'zod'
import { prisma } from '../prisma.js'
import type { AuthedRequest } from '../middleware.js'
import { logAudit } from '../audit.js'
import { deleteObject, getDownloadUrl, putObject } from '../s3.js'
import { formatDisplayName } from '../names.js'
import { forbid, isHrOrAdmin, notFound, parseBody, queryString } from './util.js'

// Recruitment, HR/Admin only. One handler, three collections chosen by
// ?kind= : openings | applicants | interviews.

const OPENING_STATUSES = ['open', 'on_hold', 'closed'] as const
const APPLICANT_STATUSES = ['applied', 'screening', 'interview', 'offer', 'hired', 'rejected', 'withdrawn'] as const
const FINAL_APPLICANT = ['hired', 'rejected', 'withdrawn']

const IMAGE_TYPES: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }
const MAX_BANNER_BYTES = 2 * 1024 * 1024

const openingSchema = z.object({
  title: z.string().trim().min(1).max(160),
  department: z.string().trim().max(120).nullable().optional(),
  description: z.string().trim().max(3000).nullable().optional(),
  status: z.enum(OPENING_STATUSES).optional(),
  // A new banner image, or null to remove the current one.
  banner: z
    .object({ contentType: z.string().min(1), base64: z.string().min(1) })
    .nullable()
    .optional(),
})

// Stores/clears the banner. Returns the object key to save, null to clear,
// undefined for "unchanged", or { error } when the image is not acceptable.
async function applyBanner(
  openingId: string,
  banner: { contentType: string; base64: string } | null | undefined,
  oldKey: string | null,
): Promise<string | null | undefined | { error: string }> {
  if (banner === undefined) return undefined
  if (banner === null) {
    if (oldKey) await deleteObject(oldKey).catch(() => undefined)
    return null
  }
  const ext = IMAGE_TYPES[banner.contentType]
  if (!ext) return { error: 'The banner must be a PNG, JPG or WebP image' }
  const buffer = Buffer.from(banner.base64, 'base64')
  if (buffer.length === 0 || buffer.length > MAX_BANNER_BYTES) return { error: 'The banner must be an image under 2MB' }
  const key = `banners/${openingId}-${Date.now()}.${ext}`
  await putObject(key, buffer, banner.contentType)
  if (oldKey) await deleteObject(oldKey).catch(() => undefined)
  return key
}

// Never expose the storage key; give HR a short-lived image URL instead.
// Never expose the bucket key: HR gets a short-lived download link instead.
async function referrerNames(ids: (string | null)[]) {
  const wanted = [...new Set(ids.filter((x): x is string => !!x))]
  if (wanted.length === 0) return new Map<string, string>()
  const people = await prisma.employee.findMany({ where: { id: { in: wanted } }, include: { user: true } })
  return new Map(people.map((p) => [p.id, formatDisplayName(p.user.firstName, p.user.middleName, p.user.lastName)]))
}

async function applicantView<T extends { resumeKey: string | null; referredById: string | null }>(
  a: T,
  names?: Map<string, string>,
) {
  const { resumeKey, ...rest } = a
  const map = names ?? (await referrerNames([a.referredById]))
  return {
    ...rest,
    referredByName: a.referredById ? (map.get(a.referredById) ?? null) : null,
    resumeUrl: resumeKey ? await getDownloadUrl(resumeKey, 3600).catch(() => null) : null,
  }
}

async function openingView<T extends { bannerKey: string | null }>(o: T) {
  const { bannerKey, ...rest } = o
  return { ...rest, bannerUrl: bannerKey ? await getDownloadUrl(bannerKey, 3600).catch(() => null) : null }
}

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
      return res.status(200).json(
        await Promise.all(rows.map(async ({ _count, ...o }) => ({ ...(await openingView(o)), applicantCount: _count.applicants }))),
      )
    }
    if (req.method === 'POST') {
      const data = parseBody(openingSchema, req.body, res)
      if (!data) return
      const { banner, ...fields } = data
      let created = await prisma.jobOpening.create({ data: fields })
      if (banner) {
        const key = await applyBanner(created.id, banner, null)
        if (typeof key === 'object' && key !== null) {
          await prisma.jobOpening.delete({ where: { id: created.id } })
          return res.status(400).json({ message: key.error })
        }
        created = await prisma.jobOpening.update({ where: { id: created.id }, data: { bannerKey: key as string } })
      }
      logAudit(req.auth.sub, 'create', 'job_opening', created.id)
      return res.status(201).json({ ...(await openingView(created)), applicantCount: 0 })
    }
    if (req.method === 'PUT' && sub) {
      const data = parseBody(openingSchema.partial(), req.body, res)
      if (!data) return
      const existing = await prisma.jobOpening.findUnique({ where: { id: sub } })
      if (!existing) return notFound(res, 'Job opening not found')
      const { banner, ...fields } = data
      const key = await applyBanner(sub, banner, existing.bannerKey)
      if (typeof key === 'object' && key !== null) return res.status(400).json({ message: key.error })
      const updated = await prisma.jobOpening.update({
        where: { id: sub },
        data: {
          ...fields,
          ...(key !== undefined && { bannerKey: key as string | null }),
          ...(data.status !== undefined && { closedAt: data.status === 'closed' ? new Date() : null }),
        },
        include: { _count: { select: { applicants: true } } },
      })
      logAudit(req.auth.sub, 'update', 'job_opening', sub)
      const { _count, ...rest } = updated
      return res.status(200).json({ ...(await openingView(rest)), applicantCount: _count.applicants })
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
        include: { jobOpening: { select: { title: true, department: true } }, interviews: { orderBy: { scheduledAt: 'asc' } } },
        orderBy: { createdAt: 'desc' },
      })
      await logAudit(req.auth.sub, 'view', 'applicants', null)
      const names = await referrerNames(rows.map((r) => r.referredById))
      return res.status(200).json(
        await Promise.all(
          rows.map(async ({ jobOpening, ...a }) => ({
            ...(await applicantView(a, names)),
            jobTitle: jobOpening.title,
            jobDepartment: jobOpening.department,
          })),
        ),
      )
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
      return res.status(201).json({ ...(await applicantView(rest)), jobTitle: jobOpening.title })
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
      return res.status(200).json({ ...(await applicantView(rest)), jobTitle: jobOpening.title })
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
