import type { VercelResponse } from '@vercel/node'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { prisma } from '../prisma.js'
import type { AuthedRequest } from '../middleware.js'
import { logAudit } from '../audit.js'
import { getDownloadUrl, putObject } from '../s3.js'
import { formatDisplayName } from '../names.js'
import { appendHistory, canAccessRestricted, dateOnlyPattern, forbid, notFound, parseBody, queryString, toDate } from './util.js'

// Employee Relations / Disciplinary. Highest sensitivity: only
// RESTRICTED_ROLES (see util.ts) can touch it, nothing here is ever
// returned to the employee concerned, and every read is written to the
// audit log (awaited, so the entry exists before the data is returned).
//
//   GET  /restricted/disciplinary[?employeeId=]      list cases
//   POST /restricted/disciplinary                    open a case
//   PUT  /restricted/disciplinary/:id                update a case
//   POST /restricted/disciplinary/:id?doc=upload     attach a supporting document
//   GET  /restricted/disciplinary/:id?doc=<index>    presigned download link
// Cases are never deleted — they are closed, and the history stays.

const STATUSES = ['open', 'under_review', 'resolved', 'closed'] as const
const WARNINGS = ['none', 'written', 'final'] as const

const createSchema = z.object({
  employeeId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  incidentDate: z.string().regex(dateOnlyPattern, 'incidentDate must be YYYY-MM-DD'),
  incidentReport: z.string().trim().min(1).max(6000),
})

const updateSchema = z.object({
  employeeExplanation: z.string().trim().max(6000).nullable().optional(),
  warningLevel: z.enum(WARNINGS).optional(),
  correctiveAction: z.string().trim().max(3000).nullable().optional(),
  status: z.enum(STATUSES).optional(),
  note: z.string().trim().max(1000).optional(),
})

const uploadSchema = z.object({
  name: z.string().trim().min(1).max(160),
  contentType: z.string().min(1),
  fileName: z.string().min(1),
  fileBase64: z.string().min(1),
})

const include = { employee: { include: { user: true } } } as const

function serialize(c: {
  id: string
  employeeId: string
  title: string
  incidentDate: Date
  incidentReport: string
  employeeExplanation: string | null
  warningLevel: string
  correctiveAction: string | null
  status: string
  documents: unknown
  history: unknown
  createdAt: Date
  updatedAt: Date
  employee: { user: { firstName: string; middleName: string | null; lastName: string } }
}) {
  const docs = Array.isArray(c.documents) ? (c.documents as { name: string }[]) : []
  return {
    id: c.id,
    employeeId: c.employeeId,
    employeeName: formatDisplayName(c.employee.user.firstName, c.employee.user.middleName, c.employee.user.lastName),
    title: c.title,
    incidentDate: c.incidentDate,
    incidentReport: c.incidentReport,
    employeeExplanation: c.employeeExplanation,
    warningLevel: c.warningLevel,
    correctiveAction: c.correctiveAction,
    status: c.status,
    // Storage keys stay server-side; the client gets names + indexes.
    documents: docs.map((d, index) => ({ index, name: d.name })),
    history: c.history,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  }
}

export async function handler(req: AuthedRequest, res: VercelResponse) {
  if (!canAccessRestricted(req)) return forbid(res)
  const sub = queryString(req, 'sub')

  if (!sub && req.method === 'GET') {
    const employeeId = queryString(req, 'employeeId')
    const rows = await prisma.disciplinaryCase.findMany({
      where: employeeId ? { employeeId } : {},
      include,
      orderBy: { createdAt: 'desc' },
    })
    await logAudit(req.auth.sub, 'view', 'disciplinary_cases', employeeId ?? null)
    return res.status(200).json(rows.map(serialize))
  }

  if (!sub && req.method === 'POST') {
    const data = parseBody(createSchema, req.body, res)
    if (!data) return
    const created = await prisma.disciplinaryCase.create({
      data: {
        employeeId: data.employeeId,
        title: data.title,
        incidentDate: toDate(data.incidentDate),
        incidentReport: data.incidentReport,
        createdBy: req.auth.sub,
        history: appendHistory([], req.auth.sub, 'opened'),
      },
      include,
    })
    await logAudit(req.auth.sub, 'create', 'disciplinary_case', created.id)
    return res.status(201).json(serialize(created))
  }

  if (sub) {
    const existing = await prisma.disciplinaryCase.findUnique({ where: { id: sub } })
    if (!existing) return notFound(res, 'Case not found')

    // Download a supporting document
    const doc = queryString(req, 'doc')
    if (req.method === 'GET' && doc !== undefined) {
      const docs = Array.isArray(existing.documents) ? (existing.documents as { name: string; key: string }[]) : []
      const entry = docs[Number(doc)]
      if (!entry) return notFound(res, 'Document not found')
      await logAudit(req.auth.sub, 'download', 'disciplinary_document', sub)
      return res.status(200).json({ url: await getDownloadUrl(entry.key) })
    }

    // Upload a supporting document
    if (req.method === 'POST' && doc === 'upload') {
      const data = parseBody(uploadSchema, req.body, res)
      if (!data) return
      const buffer = Buffer.from(data.fileBase64, 'base64')
      if (buffer.length === 0 || buffer.length > 4 * 1024 * 1024) {
        res.status(400).json({ message: 'File must be non-empty and under 4MB' })
        return
      }
      const key = `disciplinary/${sub}/${randomUUID()}-${data.fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`
      await putObject(key, buffer, data.contentType)
      const docs = Array.isArray(existing.documents) ? (existing.documents as Prisma.InputJsonValue[]) : []
      const updated = await prisma.disciplinaryCase.update({
        where: { id: sub },
        data: {
          documents: [...docs, { name: data.name, key }],
          history: appendHistory(existing.history, req.auth.sub, 'document added', data.name),
        },
        include,
      })
      await logAudit(req.auth.sub, 'upload', 'disciplinary_document', sub)
      return res.status(200).json(serialize(updated))
    }

    if (req.method === 'PUT') {
      const data = parseBody(updateSchema, req.body, res)
      if (!data) return
      const { note, ...fields } = data
      const changes = Object.keys(fields).filter((k) => fields[k as keyof typeof fields] !== undefined)
      const updated = await prisma.disciplinaryCase.update({
        where: { id: sub },
        data: {
          ...fields,
          history: appendHistory(
            existing.history,
            req.auth.sub,
            fields.status && fields.status !== existing.status ? `status: ${fields.status}` : 'updated',
            [changes.length ? `changed ${changes.join(', ')}` : '', note ?? ''].filter(Boolean).join(' — ') || undefined,
          ),
        },
        include,
      })
      await logAudit(req.auth.sub, 'update', 'disciplinary_case', sub)
      return res.status(200).json(serialize(updated))
    }
  }

  notFound(res)
}
