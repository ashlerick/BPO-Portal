import { requireAuth } from '../lib/middleware.js'
import { handler as disciplinary } from '../lib/handlers/disciplinary.js'
import { handler as payroll } from '../lib/handlers/payroll.js'

// Highest-sensitivity HR data, kept in its own function so the access
// rules are easy to audit: employee relations / disciplinary cases and
// payroll. Each handler enforces RESTRICTED_ROLES (lib/handlers/util.ts)
// and audit-logs every read. vercel.json rewrites /api/restricted/:resource.
export default requireAuth(async (req, res) => {
  const resource = typeof req.query.resource === 'string' ? req.query.resource : undefined

  if (resource === 'disciplinary') return disciplinary(req, res)
  if (resource === 'payroll') return payroll(req, res)

  res.status(404).json({ message: 'Not found' })
})
