import { requireAuth } from '../lib/middleware.js'
import { handler as hrRequests } from '../lib/handlers/hrRequests.js'
import { handler as employeeRecords } from '../lib/handlers/employeeRecords.js'
import { handler as enrollments } from '../lib/handlers/enrollments.js'
import { handler as checklists } from '../lib/handlers/checklists.js'
import { handler as recruitment } from '../lib/handlers/recruitment.js'
import { handler as performance } from '../lib/handlers/performance.js'

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

  res.status(404).json({ message: 'Not found' })
})
