import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, ApiError } from '../../services/api'
import { ErrorState, LoadingState } from '../../components/AsyncState'
import { humanize } from '../../utils/text'
import type { AuditLogEntry, AuditLogPage } from '../audit-logs/types'
import { addDaysIso, todayInManilaIso } from '../../utils/dates'

const dateFormatter = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' })

export function AdminWidgets() {
  const [recentActions, setRecentActions] = useState<AuditLogEntry[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      // the latest few that are not routine, from the last 30 days
      .get<AuditLogPage>(`/audit-logs?from=${addDaysIso(todayInManilaIso(), -29)}&to=${todayInManilaIso()}&limit=5`)
      .then((logs) => setRecentActions(logs.entries))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Something went wrong'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <LoadingState label="Loading admin overview…" />
  if (error) return <ErrorState message={error} />
  if (!recentActions || recentActions.length === 0) return null

  return (
    <section className="mt-4">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Recent administrative actions</h3>
      <ul className="mt-2 divide-y divide-black/5 text-sm dark:divide-white/10">
        {recentActions.map((log) => (
          <li key={log.id} className="py-2 text-gray-600 first:pt-0 last:pb-0 dark:text-gray-400 sm:py-1.5">
            {/* Own line on phones so the sentence below reads cleanly instead of running on from the timestamp. */}
            <span className="block text-xs text-gray-400 dark:text-gray-500 sm:inline sm:text-sm">{dateFormatter.format(new Date(log.createdAt))}</span>{' '}
            <span className="text-gray-900 dark:text-gray-200">{log.user}</span> — {humanize(log.action)} {humanize(log.resource)}
          </li>
        ))}
      </ul>
      <Link to="/audit-logs" className="mt-3 inline-block text-sm font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400">
        View all audit logs →
      </Link>
    </section>
  )
}
