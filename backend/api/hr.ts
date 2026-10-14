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
import { handler as birthdays } from '../lib/handlers/birthdays.js'
import { handler as newHire } from '../lib/handlers/newHire.js'

// HR modules in one serverless function (Vercel Hobby caps at 12).
// vercel.json rewrites /api/hr/:resource[/:sub] here as ?resource=&sub=.
// Each handler does its own role checks; the very sensitive ones
// (disciplinary, payroll) live in api/restricted.ts instead.
export default requireAuth(async (req, res) => {
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
  if (resource === 'birthdays') return birthdays(req, res)
  if (resource === 'new-hire') return newHire(req, res)

  res.status(404).json({ message: 'Not found' })
})
