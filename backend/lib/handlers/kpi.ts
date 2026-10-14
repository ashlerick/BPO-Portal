import type { VercelResponse } from '@vercel/node'
import { z } from 'zod'
import { prisma } from '../prisma.js'
import type { AuthedRequest } from '../middleware.js'
import { logAudit } from '../audit.js'
import { forbid, isHrOrAdmin, isSupervisorOf, myEmployee, notFound, parseBody, queryString } from './util.js'

// KPI scorecard under /hr/kpi (the old sheet's "KPI Metrics"):
//   ?kind=config    GET  scale / formula settings + criteria; PUT (HR/Admin)
//   ?kind=criteria  POST / PUT /:id / DELETE /:id (HR/Admin)
//   ?kind=scores    GET  ?employeeId=&year= scores + computed totals
//                        (the employee, their supervisor, or HR/Admin)
//                   PUT  one employee's scores for one month (HR/Admin)
// How totals are computed is HR's setting, not code: see KpiConfig. Totals
// are computed when read and never stored, so changing the setting
// re-states history without touching the raw scores.

const KEY = 'kpi'

const configSchema = z
  .object({
    scaleMin: z.number().min(0).max(1000),
    scaleMax: z.number().min(1).max(1000),
    // average | weighted (uses each criterion's weight) | sum | percent of max
    method: z.enum(['average', 'weighted', 'sum', 'percent']),
    // How a criterion with no score counts toward a month's total.
    missing: z.enum(['ignore', 'zero']),
    // How the months combine into the year's figure.
    rollup: z.enum(['average', 'latest']),
    // Optional labels, e.g. { min: 4.5, label: 'Outstanding' }; highest min the total reaches wins.
    bands: z.array(z.object({ min: z.number(), label: z.string().trim().min(1).max(60) })).max(10),
  })
  .refine((c) => c.scaleMax > c.scaleMin, { message: 'The maximum score must be higher than the minimum' })

type KpiConfig = z.infer<typeof configSchema>

const DEFAULT_CONFIG: KpiConfig = { scaleMin: 1, scaleMax: 5, method: 'average', missing: 'ignore', rollup: 'average', bands: [] }

async function loadConfig(): Promise<KpiConfig> {
  const row = await prisma.portalSetting.findUnique({ where: { key: KEY } })
  const parsed = configSchema.safeParse(row?.value)
  return parsed.success ? parsed.data : DEFAULT_CONFIG
}

const criterionSchema = z.object({
  coreValue: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(120),
  weight: z.number().min(0).max(100).optional(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
})
const criterionUpdateSchema = criterionSchema.partial().extend({ active: z.boolean().optional() })

const scoresSchema = z.object({
  employeeId: z.string().uuid(),
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  scores: z.array(z.object({ criterionId: z.string().uuid(), score: z.number().nullable() })).max(200),
})

const round2 = (n: number) => Math.round(n * 100) / 100

interface Crit {
  id: string
  weight: number
}

// One month's total from {criterionId: score} for the active criteria.
function monthTotal(criteria: Crit[], scores: Map<string, number>, c: KpiConfig): number | null {
  const entries = criteria
    .map((k) => ({ weight: k.weight, score: scores.get(k.id) ?? (c.missing === 'zero' ? 0 : null) }))
    .filter((e): e is { weight: number; score: number } => e.score !== null)
  if (entries.length === 0) return null
  const sum = entries.reduce((a, e) => a + e.score, 0)
  switch (c.method) {
    case 'sum':
      return round2(sum)
    case 'percent':
      return round2((sum / (entries.length * c.scaleMax)) * 100)
    case 'weighted': {
      const w = entries.reduce((a, e) => a + e.weight, 0)
      return w === 0 ? null : round2(entries.reduce((a, e) => a + e.weight * e.score, 0) / w)
    }
    default:
      return round2(sum / entries.length)
  }
}

function bandFor(total: number | null, c: KpiConfig): string | null {
  if (total === null) return null
  const hit = [...c.bands].sort((a, b) => b.min - a.min).find((b) => total >= b.min)
  return hit?.label ?? null
}

export async function handler(req: AuthedRequest, res: VercelResponse) {
  const kind = queryString(req, 'kind')
  const sub = queryString(req, 'sub')
  const hr = isHrOrAdmin(req)

  // ---- settings + criteria
  if (kind === 'config') {
    if (req.method === 'GET') {
      const [config, criteria] = await Promise.all([
        loadConfig(),
        prisma.kpiCriterion.findMany({ where: hr ? {} : { active: true }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }),
      ])
      return res.status(200).json({ config, criteria })
    }
    if (req.method === 'PUT') {
      if (!hr) return forbid(res)
      const data = parseBody(configSchema, req.body, res)
      if (!data) return
      await prisma.portalSetting.upsert({ where: { key: KEY }, update: { value: data }, create: { key: KEY, value: data } })
      await logAudit(req.auth.sub, 'update', 'kpi_config', null)
      return res.status(200).json(data)
    }
  }

  if (kind === 'criteria') {
    if (!hr) return forbid(res)
    if (req.method === 'POST') {
      const data = parseBody(criterionSchema, req.body, res)
      if (!data) return
      const last = await prisma.kpiCriterion.aggregate({ _max: { sortOrder: true } })
      const created = await prisma.kpiCriterion.create({
        data: { ...data, sortOrder: data.sortOrder ?? (last._max.sortOrder ?? 0) + 1 },
      })
      await logAudit(req.auth.sub, 'create', 'kpi_criterion', created.id)
      return res.status(201).json(created)
    }
    if (req.method === 'PUT' && sub) {
      const data = parseBody(criterionUpdateSchema, req.body, res)
      if (!data) return
      const existing = await prisma.kpiCriterion.findUnique({ where: { id: sub } })
      if (!existing) return notFound(res, 'Criterion not found')
      const updated = await prisma.kpiCriterion.update({ where: { id: sub }, data })
      await logAudit(req.auth.sub, 'update', 'kpi_criterion', sub)
      return res.status(200).json(updated)
    }
    if (req.method === 'DELETE' && sub) {
      // Keep history: a criterion that already has scores is only switched off.
      const used = await prisma.kpiScore.count({ where: { criterionId: sub } })
      if (used > 0) await prisma.kpiCriterion.updateMany({ where: { id: sub }, data: { active: false } })
      else await prisma.kpiCriterion.deleteMany({ where: { id: sub } })
      await logAudit(req.auth.sub, used > 0 ? 'deactivate' : 'delete', 'kpi_criterion', sub)
      return res.status(204).end()
    }
  }

  // ---- scores
  if (kind === 'scores') {
    if (req.method === 'GET') {
      const me = await myEmployee(req)
      const employeeId = queryString(req, 'employeeId') ?? me?.id
      if (!employeeId) return res.status(200).json(null)
      if (employeeId !== me?.id && !hr && !(await isSupervisorOf(req, employeeId))) return forbid(res)
      const year = Number(queryString(req, 'year') ?? new Date().getUTCFullYear())
      if (!Number.isInteger(year)) return res.status(400).json({ message: 'year must be a number' })

      const [config, rows] = await Promise.all([
        loadConfig(),
        prisma.kpiScore.findMany({ where: { employeeId, year } }),
      ])
      const scoredIds = new Set(rows.map((r) => r.criterionId))
      const criteria = await prisma.kpiCriterion.findMany({
        where: { OR: [{ active: true }, { id: { in: [...scoredIds] } }] },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      })
      const active = criteria.filter((c) => c.active)

      const byMonth = new Map<number, Map<string, number>>()
      for (const r of rows) {
        if (!byMonth.has(r.month)) byMonth.set(r.month, new Map())
        byMonth.get(r.month)!.set(r.criterionId, r.score)
      }
      const monthly = Array.from({ length: 12 }, (_, i) => {
        const scores = byMonth.get(i + 1)
        const total = scores ? monthTotal(active, scores, config) : null
        return { month: i + 1, total, band: bandFor(total, config) }
      })
      const entered = monthly.filter((m) => m.total !== null)
      const yearTotal =
        entered.length === 0
          ? null
          : config.rollup === 'latest'
            ? entered[entered.length - 1].total
            : round2(entered.reduce((a, m) => a + (m.total as number), 0) / entered.length)

      await logAudit(req.auth.sub, 'view', 'kpi_scores', employeeId)
      return res.status(200).json({
        employeeId,
        year,
        config,
        criteria: criteria.map((c) => ({ id: c.id, coreValue: c.coreValue, name: c.name, weight: c.weight, active: c.active })),
        scores: rows.map((r) => ({ criterionId: r.criterionId, month: r.month, score: r.score })),
        monthly,
        yearly: { total: yearTotal, band: bandFor(yearTotal, config) },
      })
    }

    if (req.method === 'PUT') {
      if (!hr) return forbid(res)
      const data = parseBody(scoresSchema, req.body, res)
      if (!data) return
      const config = await loadConfig()
      const bad = data.scores.find((s) => s.score !== null && (s.score < config.scaleMin || s.score > config.scaleMax))
      if (bad) {
        return res.status(400).json({ message: `Scores must be between ${config.scaleMin} and ${config.scaleMax}` })
      }
      for (const s of data.scores) {
        const key = { employeeId_criterionId_year_month: { employeeId: data.employeeId, criterionId: s.criterionId, year: data.year, month: data.month } }
        if (s.score === null) {
          await prisma.kpiScore.deleteMany({
            where: { employeeId: data.employeeId, criterionId: s.criterionId, year: data.year, month: data.month },
          })
        } else {
          await prisma.kpiScore.upsert({
            where: key,
            update: { score: s.score, scoredBy: req.auth.sub },
            create: { employeeId: data.employeeId, criterionId: s.criterionId, year: data.year, month: data.month, score: s.score, scoredBy: req.auth.sub },
          })
        }
      }
      await logAudit(req.auth.sub, 'update', 'kpi_scores', `${data.employeeId} ${data.year}-${data.month}`)
      return res.status(200).json({ saved: data.scores.length })
    }
  }

  notFound(res)
}
