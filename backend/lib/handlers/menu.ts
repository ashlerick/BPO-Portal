import type { VercelResponse } from '@vercel/node'
import { z } from 'zod'
import { prisma } from '../prisma.js'
import type { AuthedRequest } from '../middleware.js'
import { logAudit } from '../audit.js'

// The sidebar menu's admin-editable overrides, stored as one JSON value.
//   GET /menu  — everyone (the layout needs it to draw the sidebar).
//   PUT /menu  — Admin only; replaces the whole config.
//   DELETE /menu — Admin only; back to the built-in menu.
// This only changes what is *shown*. Access to a page is still enforced by
// the page's own route guard and by the API, so hiding or exposing an item
// here never grants or removes real permission.

const ROLES = ['employee', 'team_leader', 'manager', 'hr', 'admin'] as const

const entry = z.object({
  label: z.string().trim().min(1).max(40).optional(),
  order: z.number().int().min(0).max(10_000).optional(),
  hidden: z.boolean().optional(),
})

const configSchema = z.object({
  groups: z.record(z.string().max(40), entry).default({}),
  items: z
    .record(
      z.string().max(80),
      entry.extend({
        roles: z.array(z.enum(ROLES)).max(5).optional(),
        group: z.string().max(40).optional(),
      }),
    )
    .default({}),
})

const KEY = 'menu'

export async function handler(req: AuthedRequest, res: VercelResponse) {
  if (req.method === 'GET') {
    const row = await prisma.portalSetting.findUnique({ where: { key: KEY } })
    res.status(200).json(row?.value ?? null)
    return
  }

  if (!req.auth.roles.includes('admin')) {
    res.status(403).json({ message: 'Insufficient permissions' })
    return
  }

  if (req.method === 'PUT') {
    const parsed = configSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ message: parsed.error.issues[0]?.message ?? 'Invalid menu configuration' })
      return
    }
    await prisma.portalSetting.upsert({
      where: { key: KEY },
      update: { value: parsed.data },
      create: { key: KEY, value: parsed.data },
    })
    await logAudit(req.auth.sub, 'update', 'menu', null)
    res.status(200).json(parsed.data)
    return
  }

  if (req.method === 'DELETE') {
    await prisma.portalSetting.deleteMany({ where: { key: KEY } })
    await logAudit(req.auth.sub, 'reset', 'menu', null)
    res.status(204).end()
    return
  }

  res.status(404).json({ message: 'Not found' })
}
