import { requireAuth } from '../lib/middleware.js'
import { handler as announcements } from '../lib/handlers/announcements.js'
import { handler as benefits } from '../lib/handlers/benefits.js'

// Announcements + Benefits in one serverless function (Vercel Hobby caps
// at 12). vercel.json rewrites /api/announcements[/:id] and
// /api/benefits[/:id] here with ?resource= (and ?sub= for an id).
export default requireAuth(async (req, res) => {
  const resource = typeof req.query.resource === 'string' ? req.query.resource : undefined

  if (resource === 'announcements') return announcements(req, res)
  if (resource === 'benefits') return benefits(req, res)

  res.status(404).json({ message: 'Not found' })
})
