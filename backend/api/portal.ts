import { requireAuth } from '../lib/middleware.js'
import { handler as me } from '../lib/handlers/me.js'
import { handler as auditLogs } from '../lib/handlers/auditLogs.js'
import { handler as notifications } from '../lib/handlers/notifications.js'
import { handler as calendar } from '../lib/handlers/calendar.js'
import { handler as settings } from '../lib/handlers/settings.js'

// Cross-cutting portal endpoints in one serverless function (Vercel
// Hobby caps at 12): the signed-in user (/me), the admin audit log,
// notifications, the company calendar, and user settings. vercel.json
// rewrites each public path here with ?resource= (and ?sub= for an id).
export default requireAuth(async (req, res) => {
  const resource = typeof req.query.resource === 'string' ? req.query.resource : undefined

  if (resource === 'me') return me(req, res)
  if (resource === 'notifications') return notifications(req, res)
  if (resource === 'calendar') return calendar(req, res)
  if (resource === 'settings') return settings(req, res)
  if (resource === 'audit-logs') {
    if (!req.auth.roles.includes('admin')) {
      res.status(403).json({ message: 'Insufficient permissions' })
      return
    }
    return auditLogs(req, res)
  }

  res.status(404).json({ message: 'Not found' })
})
