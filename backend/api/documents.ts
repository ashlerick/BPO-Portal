import type { VercelResponse } from '@vercel/node'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { Role } from '@prisma/client'
import { prisma } from '../lib/prisma.js'
import { requireAuth, type AuthedRequest } from '../lib/middleware.js'
import { getDownloadUrl, putObject } from '../lib/s3.js'
import { logAudit } from '../lib/audit.js'

// Consolidated into one function (Vercel Hobby caps at 12 serverless
// functions per deployment): GET /documents, GET /documents/:id/download,
// POST /documents (upload). The /:id/download sub-path is routed here
// via a vercel.json rewrite, arriving as ?sub=<id>.
//
// Upload takes the file as base64 in the JSON body rather than a
// presigned direct-to-S3 PUT — simpler to implement correctly, and fine
// for the HR documents this app handles (policies, forms), but Vercel's
// ~4.5MB request body cap means this isn't suited to large attachments.

const ROLES = ['employee', 'team_leader', 'manager', 'hr', 'admin'] as const

const uploadSchema = z.object({
  title: z.string().min(1),
  categoryName: z.string().min(1),
  accessLevel: z.enum(ROLES).default('employee'),
  contentType: z.string().min(1),
  fileBase64: z.string().min(1),
  fileName: z.string().min(1),
})

function canAccess(req: AuthedRequest, accessLevel: Role): boolean {
  return accessLevel === 'employee' || req.auth.roles.includes(accessLevel)
}

function isManager(req: AuthedRequest): boolean {
  return req.auth.roles.includes('hr') || req.auth.roles.includes('admin')
}

async function handleList(req: AuthedRequest, res: VercelResponse) {
  // Files that belong to one employee (Employee Management -> Employee
  // documents) never appear in the company-wide list.
  const documents = await prisma.document.findMany({
    where: { employeeId: null },
    include: { category: true },
    orderBy: { createdAt: 'desc' },
  })

  const visible = documents.filter((doc) => canAccess(req, doc.accessLevel))

  res.status(200).json(
    visible.map((doc) => ({
      id: doc.id,
      title: doc.title,
      category: doc.category.name,
      accessLevel: doc.accessLevel,
      createdAt: doc.createdAt,
    })),
  )
}

async function handleDownload(req: AuthedRequest, res: VercelResponse, id: string) {
  const doc = await prisma.document.findUnique({ where: { id } })
  if (!doc) {
    res.status(404).json({ message: 'Document not found' })
    return
  }

  if (doc.employeeId) {
    // An employee's own file: HR/Admin, or the employee it belongs to.
    const owner = await prisma.employee.findUnique({ where: { id: doc.employeeId }, select: { userId: true } })
    if (!isManager(req) && owner?.userId !== req.auth.sub) {
      res.status(403).json({ message: 'Insufficient permissions' })
      return
    }
  } else if (!canAccess(req, doc.accessLevel)) {
    res.status(403).json({ message: 'Insufficient permissions' })
    return
  }

  const url = await getDownloadUrl(doc.storageKey)
  res.status(200).json({ url })
}

async function handleUpload(req: AuthedRequest, res: VercelResponse) {
  if (!isManager(req)) {
    res.status(403).json({ message: 'Insufficient permissions' })
    return
  }

  const parsed = uploadSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ message: 'Invalid upload payload' })
    return
  }

  const { title, categoryName, accessLevel, contentType, fileBase64, fileName } = parsed.data

  let buffer: Buffer
  try {
    buffer = Buffer.from(fileBase64, 'base64')
  } catch {
    res.status(400).json({ message: 'Invalid file data' })
    return
  }
  if (buffer.length === 0 || buffer.length > 4 * 1024 * 1024) {
    res.status(400).json({ message: 'File must be non-empty and under 4MB' })
    return
  }

  const category = await prisma.documentCategory.upsert({
    where: { name: categoryName },
    update: {},
    create: { name: categoryName },
  })

  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
  const storageKey = `documents/${category.id}/${randomUUID()}-${safeName}`

  await putObject(storageKey, buffer, contentType)

  const document = await prisma.document.create({
    data: {
      title,
      categoryId: category.id,
      storageKey,
      accessLevel,
      uploadedBy: req.auth.sub,
    },
    include: { category: true },
  })

  logAudit(req.auth.sub, 'upload', 'document', document.id)

  res.status(201).json({
    id: document.id,
    title: document.title,
    category: document.category.name,
    accessLevel: document.accessLevel,
    createdAt: document.createdAt,
  })
}

async function handler(req: AuthedRequest, res: VercelResponse) {
  const sub = typeof req.query.sub === 'string' ? req.query.sub : undefined

  if (!sub && req.method === 'GET') return handleList(req, res)
  if (sub && req.method === 'GET') return handleDownload(req, res, sub)
  if (!sub && req.method === 'POST') return handleUpload(req, res)

  res.status(404).json({ message: 'Not found' })
}

export default requireAuth(handler)
