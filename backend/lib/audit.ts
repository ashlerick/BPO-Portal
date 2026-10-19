import { prisma } from './prisma.js'

// Callers normally don't await this (fire-and-forget: an audit write
// failing should never block the actual operation it's recording) —
// but it returns the settled promise so a caller that specifically
// needs the write to have completed before responding (e.g. a
// dedicated "did this get audited" guarantee) can await it. Either
// way this never throws; a failure is logged and swallowed.
export function logAudit(
  userId: string,
  action: string,
  resource: string,
  resourceId: string | null,
  result: 'success' | 'failure' = 'success',
  detail?: string,
): Promise<void> {
  return prisma.auditLog
    .create({ data: { userId, action, resource, resourceId, result, ...(detail && { detail: detail.slice(0, 500) }) } })
    .then(() => undefined)
    .catch((err) => {
      console.error('Failed to write audit log', err)
    })
}
