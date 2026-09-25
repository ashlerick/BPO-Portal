import type { VercelResponse } from '@vercel/node'
import { z } from 'zod'
import { prisma } from '../prisma.js'
import type { AuthedRequest } from '../middleware.js'
import { logAudit } from '../audit.js'
import { isNotFoundError } from '../errors.js'

// GET /benefits, POST /benefits (create), PUT/DELETE /benefits/:id (via
// a vercel.json rewrite arriving as ?sub=<id>). Create/update/delete are
// HR/Admin only ("Manage benefits" in bpo_plan.md's role definitions).

const upsertSchema = z.object({
  title: z.string().min(1),
  category: z.string().min(1),
  description: z.string().min(1),
  eligibility: z.string().nullable().optional(),
  provider: z.string().trim().max(160).nullable().optional(),
  providerContact: z.string().trim().max(300).nullable().optional(),
})

function isManager(req: AuthedRequest): boolean {
  return req.auth.roles.includes('hr') || req.auth.roles.includes('admin')
}

async function handleList(res: VercelResponse) {
  const benefits = await prisma.benefit.findMany({ orderBy: { category: 'asc' } })
  res.status(200).json(benefits)
}

async function handleCreate(req: AuthedRequest, res: VercelResponse) {
  if (!isManager(req)) {
    res.status(403).json({ message: 'Insufficient permissions' })
    return
  }
  const parsed = upsertSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ message: 'Invalid benefit payload' })
    return
  }
  const benefit = await prisma.benefit.create({ data: parsed.data })
  logAudit(req.auth.sub, 'create', 'benefit', benefit.id)
  res.status(201).json(benefit)
}

async function handleUpdate(req: AuthedRequest, res: VercelResponse, id: string) {
  if (!isManager(req)) {
    res.status(403).json({ message: 'Insufficient permissions' })
    return
  }
  const parsed = upsertSchema.partial().safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ message: 'Invalid benefit payload' })
    return
  }
  let benefit
  try {
    benefit = await prisma.benefit.update({ where: { id }, data: parsed.data })
  } catch (err) {
    if (isNotFoundError(err)) {
      res.status(404).json({ message: 'Benefit not found' })
      return
    }
    throw err
  }
  logAudit(req.auth.sub, 'update', 'benefit', id)
  res.status(200).json(benefit)
}

async function handleDelete(req: AuthedRequest, res: VercelResponse, id: string) {
  if (!isManager(req)) {
    res.status(403).json({ message: 'Insufficient permissions' })
    return
  }
  try {
    await prisma.benefit.delete({ where: { id } })
  } catch (err) {
    if (isNotFoundError(err)) {
      res.status(404).json({ message: 'Benefit not found' })
      return
    }
    throw err
  }
  logAudit(req.auth.sub, 'delete', 'benefit', id)
  res.status(204).end()
}

export async function handler(req: AuthedRequest, res: VercelResponse) {
  const sub = typeof req.query.sub === 'string' ? req.query.sub : undefined

  if (!sub && req.method === 'GET') return handleList(res)
  if (!sub && req.method === 'POST') return handleCreate(req, res)
  if (sub && req.method === 'PUT') return handleUpdate(req, res, sub)
  if (sub && req.method === 'DELETE') return handleDelete(req, res, sub)

  res.status(404).json({ message: 'Not found' })
}

