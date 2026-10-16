import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth } from '../lib/middleware.js'
import { handler as hrRequests } from '../lib/handlers/hrRequests.js'
import { handler as employeeRecords } from '../lib/handlers/employeeRecords.js'
import { handler as enrollments } from '../lib/handlers/enrollments.js'
import { handler as checklists } from '../lib/handlers/checklists.js'
import { handler as recruitment } from '../lib/handlers/recruitment.js'
import { handler as performance } from '../lib/handlers/performance.js'
import { handler as todos } from '../lib/handlers/todos.js'
import { handler as kpi } from '../lib/handlers/kpi.js'
import { handler as freedomWall } from '../lib/handlers/freedomWall.js'
import { handler as inventory } from '../lib/handlers/inventory.js'
import { handler as shifts } from '../lib/handlers/shifts.js'
import { handler as newHire } from '../lib/handlers/newHire.js'
import { handler as careers } from '../lib/handlers/careers.js'
import { handler as inventoryReminders } from '../lib/handlers/inventoryReminders.js'
import { createCode, deviceBreakEnd, deviceBreakStart, deviceClockIn, deviceClockOut, deviceCounts, deviceFeed, deviceMe, deviceToday, exchangeCode, listDevices, revokeDevice } from '../lib/handlers/device.js'

// HR modules in one serverless function (Vercel Hobby caps at 12).
// vercel.json rewrites /api/hr/:resource[/:sub] here as ?resource=&sub=.
// Each handler does its own role checks; the very sensitive ones
// (disciplinary, payroll) live in api/restricted.ts instead.
const authed = requireAuth(async (req, res) => {
  const resource = typeof req.query.resource === 'string' ? req.query.resource : undefined

  if (resource === 'hr-requests') return hrRequests(req, res)
  if (resource === 'employee-records') return employeeRecords(req, res)
  if (resource === 'enrollments') return enrollments(req, res)
  if (resource === 'checklists') return checklists(req, res)
  if (resource === 'recruitment') return recruitment(req, res)
  if (resource === 'performance') return performance(req, res)
  if (resource === 'todos') return todos(req, res)
  if (resource === 'kpi') return kpi(req, res)
  if (resource === 'freedom-wall') return freedomWall(req, res)
  if (resource === 'inventory') return inventory(req, res)
  if (resource === 'shifts') return shifts(req, res)
  if (resource === 'new-hire') return newHire(req, res)
  if (resource === 'device-code' && req.method === 'POST') return createCode(req, res)
  if (resource === 'devices' && req.method === 'GET') return listDevices(req, res)
  if (resource === 'devices' && req.method === 'DELETE') return revokeDevice(req, res)

  res.status(404).json({ message: 'Not found' })
})

// /api/hr/careers is public (the careers page); everything else needs a login
// (except the cron endpoint, which has its own secret).
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.query.resource === 'careers') return careers(req, res)
  // Called by the monthly Vercel cron; checks its own CRON_SECRET.
  if (req.query.resource === 'inventory-reminders') return inventoryReminders(req, res)
  // The desktop app signs in with a one-time code, then a device token (not the portal login).
  if (req.query.resource === 'device-token') return exchangeCode(req, res)
  if (req.query.resource === 'device-me') return deviceMe(req, res)
  if (req.query.resource === 'device-today') return deviceToday(req, res)
  if (req.query.resource === 'device-clock-in') return deviceClockIn(req, res)
  if (req.query.resource === 'device-clock-out') return deviceClockOut(req, res)
  if (req.query.resource === 'device-counts') return deviceCounts(req, res)
  if (req.query.resource === 'device-break-start') return deviceBreakStart(req, res)
  if (req.query.resource === 'device-break-end') return deviceBreakEnd(req, res)
  if (req.query.resource === 'device-feed') return deviceFeed(req, res)
  // An unknown device-* route must say so. Falling through to the login check would
  // answer "Invalid or expired token", which an app reads as "my token was revoked".
  if (typeof req.query.resource === 'string' && req.query.resource.startsWith('device-') && req.query.resource !== 'device-code') {
    return res.status(404).json({ message: `The portal has no endpoint named ${req.query.resource} yet.` })
  }
  return authed(req, res)
}
