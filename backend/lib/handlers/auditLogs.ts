import type { VercelResponse } from '@vercel/node'
import ExcelJS from 'exceljs'
import { Prisma } from '@prisma/client'
import { prisma } from '../prisma.js'
import type { AuthedRequest } from '../middleware.js'
import { formatDisplayName } from '../names.js'
import { getDownloadUrl, putObject } from '../s3.js'
import { logAudit } from '../audit.js'
import { routineWhere } from '../auditPolicy.js'
import { targetLabels } from '../auditTargets.js'

// GET /audit-logs (admin): the log by date range, newest first, a page at a time.
//   from, to      YYYY-MM-DD in Philippine time (both ends included); the default is today
//   userId        who did it
//   resource      the area (attendance, announcement, ...)
//   kind          what kind of action: the first word of the action (create, update, delete, export, view, ...)
//   result        success | failure
//   q             text to look for in the action, the details and the area
//   routine=1     include routine activity (clock in/out, breaks, PC connects), which is left out by default
//   limit, cursor 50 at a time; `next` in the reply is the cursor for the following page
//   facets=1      the people, areas and kinds that appear in the range, for the filter menus
//   export=1      the same filtered list as an Excel file ({ url })
// Older entries wrote their details into the action text ("correct_attendance: out none -> ..."); they are split back apart here.

const datePattern = /^\d{4}-\d{2}-\d{2}$/
const q1 = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined)

function manilaRange(from?: string, to?: string) {
  const today = new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10)
  const f = from && datePattern.test(from) ? from : today
  const t = to && datePattern.test(to) ? to : f
  return { from: f, to: t, gte: new Date(`${f}T00:00:00+08:00`), lte: new Date(`${t}T23:59:59.999+08:00`) }
}

const kindOf = (action: string) => action.split(': ')[0].split('_')[0]

function split(action: string, detail: string | null) {
  const [name, ...rest] = action.split(': ')
  return { action: name, detail: detail ?? (rest.length ? rest.join(': ') : null) }
}

export async function handler(req: AuthedRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ message: 'Method not allowed' })
    return
  }

  const range = manilaRange(q1(req.query.from), q1(req.query.to))
  const dateWhere: Prisma.AuditLogWhereInput = { createdAt: { gte: range.gte, lte: range.lte } }

  // The people, areas and kinds in this range (before the other filters), for the menus.
  if (q1(req.query.facets)) {
    const [people, areas, actions] = await Promise.all([
      prisma.auditLog.groupBy({ by: ['userId'], where: dateWhere }),
      prisma.auditLog.groupBy({ by: ['resource'], where: dateWhere }),
      prisma.auditLog.findMany({ where: dateWhere, distinct: ['action'], select: { action: true } }),
    ])
    const users = await prisma.user.findMany({
      where: { id: { in: people.map((p) => p.userId) } },
      select: { id: true, firstName: true, middleName: true, lastName: true },
    })
    res.status(200).json({
      users: users
        .map((u) => ({ id: u.id, name: formatDisplayName(u.firstName, u.middleName, u.lastName) }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      resources: areas.map((a) => a.resource).sort(),
      kinds: [...new Set(actions.map((a) => kindOf(a.action)))].sort(),
    })
    return
  }

  const kind = q1(req.query.kind)
  const text = q1(req.query.q)
  const result = q1(req.query.result)
  const filters: Prisma.AuditLogWhereInput[] = [dateWhere]
  if (!q1(req.query.routine)) filters.push({ NOT: routineWhere })
  if (q1(req.query.userId)) filters.push({ userId: q1(req.query.userId) })
  if (q1(req.query.resource)) filters.push({ resource: q1(req.query.resource) })
  if (result === 'success' || result === 'failure') filters.push({ result })
  if (kind) filters.push({ action: { startsWith: kind } })
  if (text) {
    filters.push({
      OR: [
        { action: { contains: text, mode: 'insensitive' } },
        { detail: { contains: text, mode: 'insensitive' } },
        { resource: { contains: text, mode: 'insensitive' } },
      ],
    })
  }
  const where: Prisma.AuditLogWhereInput = { AND: filters }

  async function present(logs: Awaited<ReturnType<typeof prisma.auditLog.findMany>>) {
    const users = await prisma.user.findMany({
      where: { id: { in: [...new Set(logs.map((l) => l.userId))] } },
      select: { id: true, firstName: true, middleName: true, lastName: true },
    })
    const byId = new Map(users.map((u) => [u.id, u]))
    // Entries with no written detail say who or what they were about, looked up from the record they point at.
    const about = await targetLabels(logs)
    return logs.map((l) => {
      const actor = byId.get(l.userId)
      return {
        id: l.id,
        user: actor ? formatDisplayName(actor.firstName, actor.middleName, actor.lastName) : 'Unknown',
        ...(() => {
          const s = split(l.action, l.detail)
          return { action: s.action, detail: s.detail ?? about.get(l.id) ?? null }
        })(),
        resource: l.resource,
        result: l.result,
        createdAt: l.createdAt,
      }
    })
  }

  if (q1(req.query.export)) {
    const logs = await prisma.auditLog.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 20000 })
    const rows = await present(logs)
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Audit log')
    ws.columns = [24, 26, 24, 22, 70, 10].map((width) => ({ width }))
    const head = ws.addRow(['When (Philippine time)', 'Who', 'Action', 'Area', 'Details', 'Result'])
    head.font = { bold: true }
    ws.views = [{ state: 'frozen', ySplit: 1 }]
    for (const r of rows) {
      ws.addRow([
        new Date(r.createdAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' }),
        r.user,
        r.action.replace(/_/g, ' '),
        r.resource.replace(/_/g, ' '),
        r.detail ?? '',
        r.result,
      ])
    }
    const key = `audit-exports/${req.auth.sub}-${Date.now()}.xlsx`
    await putObject(key, Buffer.from(await wb.xlsx.writeBuffer()), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    const day = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
    const year = new Date(`${range.to}T00:00:00Z`).getUTCFullYear()
    const fileName = `Audit log - ${day(range.from)}${range.from === range.to ? '' : ` to ${day(range.to)}`} ${year}.xlsx`
    logAudit(req.auth.sub, 'export', 'audit_log', null, 'success', `${rows.length} entries, ${range.from} to ${range.to}`)
    res.status(200).json({ url: await getDownloadUrl(key, undefined, fileName), count: rows.length })
    return
  }

  const limit = Math.min(Number(req.query.limit) || 50, 200)
  const cursor = q1(req.query.cursor)
  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    }),
    prisma.auditLog.count({ where }),
  ])
  const more = logs.length > limit
  const page = more ? logs.slice(0, limit) : logs
  res.status(200).json({ entries: await present(page), next: more ? page[page.length - 1].id : null, total, from: range.from, to: range.to })
}
