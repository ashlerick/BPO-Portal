import type { VercelResponse } from '@vercel/node'
import { z } from 'zod'
import { prisma } from '../prisma.js'
import type { AuthedRequest } from '../middleware.js'
import { logAudit } from '../audit.js'
import { notifyUsers } from '../notify.js'
import { formatDisplayName } from '../names.js'
import { forbid, hasRole, isHrOrAdmin, myEmployee, notFound, parseBody, queryString } from './util.js'

// Inventory under /hr/inventory. One item has at most ONE current holder;
// one employee can hold many. HR/Admin manage everything.
//   GET                  all items (HR/Admin); ?employeeId= filters one holder
//   GET ?mine=1          the signed-in employee's own items (anyone)
//   GET /:idOrTag        one item + history (HR/Admin); its holder sees it too
//   POST                 create an item (asset tag generated if not given)
//   PUT /:id             edit details / status (Admin only)
//   DELETE /:id          soft delete (Admin only; return the item first)
//   POST /:id?action=assign   {employeeId} — refused while someone holds it
//   POST /:id?action=return   {note?}
//   POST /:id?action=check    {condition, note?} — the monthly condition check
//                             (HR/Admin on any item, a holder on their own)
//   GET ?nexttag=1            the asset tag the next new item would get
// Assigning and returning are audit-logged and kept as history rows.

const createSchema = z.object({
  assetTag: z.string().trim().min(1).max(40).regex(/^[A-Za-z0-9._-]+$/, 'Use letters, numbers, . _ - only').optional(),
  name: z.string().trim().min(1).max(120),
  category: z.string().trim().max(60).nullable().optional(),
  serialNumber: z.string().trim().max(80).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
})
const updateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  category: z.string().trim().max(60).nullable().optional(),
  serialNumber: z.string().trim().max(80).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
  // 'assigned' is only ever set by assigning.
  status: z.enum(['available', 'repair', 'lost', 'retired']).optional(),
})
const CONDITIONS = ['good', 'fair', 'poor', 'damaged'] as const
const checkSchema = z.object({
  condition: z.enum(CONDITIONS),
  note: z.string().trim().max(500).nullable().optional(),
})
const assignSchema = z.object({ employeeId: z.string().uuid() })
const returnSchema = z.object({ note: z.string().trim().max(500).nullable().optional() })

const include = { assignedTo: { include: { user: true } } } as const

type ItemRow = Awaited<ReturnType<typeof prisma.inventoryItem.findMany<{ include: typeof include }>>>[number]

// "YYYY-MM" in Manila time, so a check made late on the 31st counts for that month.
function currentMonth(): string {
  return new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 7)
}

export function inventoryMonthStart(): number {
  return monthStart()
}

function monthStart(): number {
  const [y, m] = currentMonth().split('-').map(Number)
  return Date.UTC(y, m - 1, 1) - 8 * 3600_000
}

function serialize(i: ItemRow) {
  return {
    id: i.id,
    assetTag: i.assetTag,
    name: i.name,
    category: i.category,
    serialNumber: i.serialNumber,
    status: i.status,
    notes: i.notes,
    condition: i.condition,
    conditionCheckedAt: i.conditionCheckedAt,
    checkedThisMonth: !!i.conditionCheckedAt && i.conditionCheckedAt.getTime() >= monthStart(),
    assignedToId: i.assignedToId,
    assignedToName: i.assignedTo
      ? formatDisplayName(i.assignedTo.user.firstName, i.assignedTo.user.middleName, i.assignedTo.user.lastName)
      : null,
    updatedAt: i.updatedAt,
  }
}

async function nextTag(): Promise<string> {
  const count = await prisma.inventoryItem.count()
  for (let n = count + 1; n < count + 50; n++) {
    const tag = `AST-${String(n).padStart(5, '0')}`
    if (!(await prisma.inventoryItem.findUnique({ where: { assetTag: tag } }))) return tag
  }
  return `AST-${Date.now()}`
}

export async function handler(req: AuthedRequest, res: VercelResponse) {
  const sub = queryString(req, 'sub')
  const action = queryString(req, 'action')
  const hr = isHrOrAdmin(req)

  // ---- reads
  if (!sub && req.method === 'GET') {
    if (queryString(req, 'mine')) {
      const me = await myEmployee(req)
      if (!me) return res.status(200).json([])
      const rows = await prisma.inventoryItem.findMany({ where: { assignedToId: me.id, deletedAt: null }, include, orderBy: { name: 'asc' } })
      return res.status(200).json(rows.map(serialize))
    }
    if (!hr) return forbid(res)
    if (queryString(req, 'nexttag')) return res.status(200).json({ assetTag: await nextTag() })
    const employeeId = queryString(req, 'employeeId')
    const rows = await prisma.inventoryItem.findMany({
      where: { deletedAt: null, ...(employeeId && { assignedToId: employeeId }) },
      include,
      orderBy: [{ assetTag: 'asc' }],
    })
    return res.status(200).json(rows.map(serialize))
  }

  if (sub && req.method === 'GET') {
    // The id in the URL may be the asset tag a QR sticker carries.
    const item = await prisma.inventoryItem.findFirst({
      where: { OR: [{ id: sub }, { assetTag: sub }], deletedAt: null },
      include,
    })
    if (!item) return notFound(res, 'Item not found')
    const me = await myEmployee(req)
    if (!hr && item.assignedToId !== me?.id) return forbid(res)
    const history = hr
      ? await prisma.inventoryAssignment.findMany({ where: { itemId: item.id }, orderBy: { assignedAt: 'desc' } })
      : []
    const people = await prisma.employee.findMany({
      where: { id: { in: [...new Set(history.map((h) => h.employeeId))] } },
      include: { user: true },
    })
    const nameOf = new Map(people.map((p) => [p.id, formatDisplayName(p.user.firstName, p.user.middleName, p.user.lastName)]))
    const checks = hr
      ? await prisma.inventoryCheck.findMany({ where: { itemId: item.id }, orderBy: { checkedAt: 'desc' }, take: 24 })
      : []
    return res.status(200).json({
      ...serialize(item),
      checks: checks.map((c) => ({ id: c.id, month: c.month, condition: c.condition, note: c.note, checkedAt: c.checkedAt })),
      history: history.map((h) => ({
        id: h.id,
        employeeName: nameOf.get(h.employeeId) ?? 'Former employee',
        assignedAt: h.assignedAt,
        returnedAt: h.returnedAt,
        returnNote: h.returnNote,
      })),
    })
  }

  // ---- the monthly check: HR/Admin on any item, a holder on their own
  if (sub && action === 'check' && req.method === 'POST') {
    const item = await prisma.inventoryItem.findFirst({ where: { id: sub, deletedAt: null } })
    if (!item) return notFound(res, 'Item not found')
    if (!hr) {
      const me = await myEmployee(req)
      if (!me || item.assignedToId !== me.id) return forbid(res)
    }
    const data = parseBody(checkSchema, req.body, res)
    if (!data) return
    // Re-checking in the same month replaces that month's result.
    const month = currentMonth()
    const now = new Date()
    await prisma.inventoryCheck.upsert({
      where: { itemId_month: { itemId: sub, month } },
      create: { itemId: sub, month, condition: data.condition, note: data.note ?? null, checkedBy: req.auth.sub },
      update: { condition: data.condition, note: data.note ?? null, checkedBy: req.auth.sub, checkedAt: now },
    })
    const updated = await prisma.inventoryItem.update({
      where: { id: sub },
      data: { condition: data.condition, conditionCheckedAt: now },
      include,
    })
    await logAudit(req.auth.sub, 'check', 'inventory_item', sub)
    return res.status(200).json(serialize(updated))
  }

  // ---- writes: HR/Admin only
  if (!hr) return forbid(res)

  if (!sub && req.method === 'POST') {
    const data = parseBody(createSchema, req.body, res)
    if (!data) return
    const assetTag = data.assetTag ?? (await nextTag())
    if (await prisma.inventoryItem.findUnique({ where: { assetTag } })) {
      return res.status(409).json({ message: `Asset tag ${assetTag} is already used` })
    }
    const created = await prisma.inventoryItem.create({
      data: { ...data, assetTag, createdBy: req.auth.sub },
      include,
    })
    await logAudit(req.auth.sub, 'create', 'inventory_item', created.id)
    return res.status(201).json(serialize(created))
  }

  if (sub && !action && req.method === 'DELETE') {
    if (!hasRole(req, 'admin')) return forbid(res)
    const existing = await prisma.inventoryItem.findFirst({ where: { id: sub, deletedAt: null } })
    if (!existing) return notFound(res, 'Item not found')
    // Deleting an assigned item closes its open assignment first, so the
    // history stays consistent and the holder no longer sees it.
    if (existing.assignedToId) {
      await prisma.inventoryAssignment.updateMany({
        where: { itemId: sub, returnedAt: null },
        data: { returnedAt: new Date(), returnNote: 'Item deleted by admin' },
      })
    }
    await prisma.inventoryItem.update({
      where: { id: sub },
      data: { deletedAt: new Date(), assignedToId: null, ...(existing.assignedToId && { status: 'available' }) },
    })
    await logAudit(req.auth.sub, 'delete', 'inventory_item', sub)
    return res.status(204).end()
  }

  if (sub && !action && req.method === 'PUT') {
    if (!hasRole(req, 'admin')) return forbid(res)
    const data = parseBody(updateSchema, req.body, res)
    if (!data) return
    const existing = await prisma.inventoryItem.findFirst({ where: { id: sub, deletedAt: null } })
    if (!existing) return notFound(res, 'Item not found')
    if (data.status && existing.assignedToId) {
      return res.status(409).json({ message: 'Return the item from its holder before changing its status' })
    }
    const updated = await prisma.inventoryItem.update({ where: { id: sub }, data, include })
    await logAudit(req.auth.sub, 'update', 'inventory_item', sub)
    return res.status(200).json(serialize(updated))
  }

  if (sub && action === 'assign' && req.method === 'POST') {
    const data = parseBody(assignSchema, req.body, res)
    if (!data) return
    const item = await prisma.inventoryItem.findFirst({ where: { id: sub, deletedAt: null } })
    if (!item) return notFound(res, 'Item not found')
    if (item.assignedToId) {
      return res.status(409).json({ message: 'This item is already assigned. Return it first.' })
    }
    if (item.status !== 'available') {
      return res.status(409).json({ message: `This item is ${item.status} and can't be assigned` })
    }
    const employee = await prisma.employee.findUnique({ where: { id: data.employeeId } })
    if (!employee) return notFound(res, 'Employee not found')
    // The conditional update is the guard against two people assigning at once.
    const claimed = await prisma.inventoryItem.updateMany({
      where: { id: sub, assignedToId: null },
      data: { assignedToId: data.employeeId, status: 'assigned' },
    })
    if (claimed.count === 0) return res.status(409).json({ message: 'This item was just assigned. Reload and check.' })
    await prisma.inventoryAssignment.create({ data: { itemId: sub, employeeId: data.employeeId, assignedBy: req.auth.sub } })
    await logAudit(req.auth.sub, 'assign', 'inventory_item', sub)
    await notifyUsers([employee.userId], { type: 'inventory', title: 'A company item was assigned to you', body: item.name, link: '/profile' })
    const fresh = await prisma.inventoryItem.findUnique({ where: { id: sub }, include })
    return res.status(200).json(serialize(fresh!))
  }

  if (sub && action === 'return' && req.method === 'POST') {
    const data = parseBody(returnSchema, req.body ?? {}, res)
    if (!data) return
    const item = await prisma.inventoryItem.findFirst({ where: { id: sub, deletedAt: null } })
    if (!item) return notFound(res, 'Item not found')
    if (!item.assignedToId) return res.status(409).json({ message: 'This item is not assigned to anyone' })
    await prisma.inventoryAssignment.updateMany({
      where: { itemId: sub, returnedAt: null },
      data: { returnedAt: new Date(), returnNote: data.note ?? null },
    })
    const updated = await prisma.inventoryItem.update({
      where: { id: sub },
      data: { assignedToId: null, status: 'available' },
      include,
    })
    await logAudit(req.auth.sub, 'return', 'inventory_item', sub)
    return res.status(200).json(serialize(updated))
  }

  notFound(res)
}
