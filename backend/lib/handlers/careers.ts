import type { VercelRequest, VercelResponse } from '@vercel/node'
import { z } from 'zod'
import { prisma } from '../prisma.js'
import { withCors } from '../middleware.js'
import { getDownloadUrl } from '../s3.js'
import { notifyRole } from '../notify.js'

// PUBLIC careers endpoint, no sign-in: /api/hr/careers.
//   GET   open job openings (title, department, description, banner)
//   POST  {jobOpeningId, name, email, phone?, information?, resumeLink?}
//         creates an applicant (status "applied", source "careers")
// This is the only unauthenticated write in the API, so it is deliberately
// narrow: it can only create an applicant for an OPEN opening, nothing is
// returned about existing applicants, and abuse is bounded (honeypot,
// duplicate check, per-opening daily cap).

const DAILY_CAP_PER_OPENING = 200
const BANNER_URL_TTL = 60 * 60 // 1 hour

const applySchema = z.object({
  jobOpeningId: z.string().uuid(),
  name: z.string().trim().min(2, 'Please enter your full name').max(120),
  email: z.string().trim().toLowerCase().email('Enter a valid email address').max(160),
  phone: z.string().trim().max(40).optional().or(z.literal('')),
  information: z.string().trim().max(2000).optional().or(z.literal('')),
  resumeLink: z
    .string()
    .trim()
    .max(500)
    .refine((v) => v === '' || /^https:\/\//i.test(v), 'The resume link must start with https://')
    .optional(),
  // Honeypot: real people never see or fill this field.
  website: z.string().max(200).optional(),
})

export async function handler(req: VercelRequest, res: VercelResponse) {
  withCors(res)
  if (req.method === 'OPTIONS') return res.status(204).end()

  if (req.method === 'GET') {
    const rows = await prisma.jobOpening.findMany({
      where: { status: 'open' },
      orderBy: { openedAt: 'desc' },
      select: { id: true, title: true, department: true, description: true, bannerKey: true, openedAt: true },
    })
    const openings = await Promise.all(
      rows.map(async ({ bannerKey, ...o }) => ({
        ...o,
        bannerUrl: bannerKey ? await getDownloadUrl(bannerKey, BANNER_URL_TTL).catch(() => null) : null,
      })),
    )
    res.setHeader('Cache-Control', 'no-store')
    return res.status(200).json(openings)
  }

  if (req.method === 'POST') {
    const parsed = applySchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message ?? 'Please check the form and try again' })
    }
    const data = parsed.data

    // A bot filled the hidden field: pretend it worked, store nothing.
    if (data.website) return res.status(201).json({ ok: true })

    const opening = await prisma.jobOpening.findUnique({ where: { id: data.jobOpeningId } })
    if (!opening || opening.status !== 'open') {
      return res.status(404).json({ message: 'This position is no longer open' })
    }

    const duplicate = await prisma.applicant.findFirst({
      where: { jobOpeningId: opening.id, email: data.email },
      select: { id: true },
    })
    if (duplicate) {
      return res.status(409).json({ message: 'You have already applied for this position. We will be in touch.' })
    }

    const recent = await prisma.applicant.count({
      where: { jobOpeningId: opening.id, source: 'careers', createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    })
    if (recent >= DAILY_CAP_PER_OPENING) {
      return res.status(429).json({ message: 'We are receiving a lot of applications right now. Please try again tomorrow.' })
    }

    await prisma.applicant.create({
      data: {
        jobOpeningId: opening.id,
        name: data.name,
        email: data.email,
        phone: data.phone || null,
        information: data.information || null,
        resumeLink: data.resumeLink || null,
        source: 'careers',
      },
    })
    await notifyRole(['hr', 'admin'], {
      type: 'applicant',
      title: 'New job application',
      body: `${data.name} applied for ${opening.title}`,
      link: '/recruitment',
    })
    return res.status(201).json({ ok: true })
  }

  return res.status(405).json({ message: 'Method not allowed' })
}
