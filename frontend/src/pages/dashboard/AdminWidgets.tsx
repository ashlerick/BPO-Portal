import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, ApiError } from '../../services/api'
import { ErrorState, LoadingState } from '../../components/AsyncState'
import { Card } from '../../components/ui/Card'
import { humanize } from '../../utils/text'
import type { AuditLogEntry } from '../audit-logs/types'

interface Stats {
  employeeCount: number
  teamCount: number
}

const dateFormatter = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' })

function StatCard({ value, label }: { value: number; label: string }) {
  return (
    <Card className="relative overflow-hidden pl-5">
      <div className="absolute inset-y-0 left-0 w-1 bg-brand-500" />
      <div className="text-3xl font-extrabold tracking-tight text-gray-900 dark:text-gray-100">{value}</div>
      <div className="text-sm text-gray-500 dark:text-gray-400">{label}</div>
    </Card>
  )
}

export function AdminWidgets() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [recentActions, setRecentActions] = useState<AuditLogEntry[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      api.get<{ id: string }[]>('/employees'),
      api.get<{ teams: { id: string }[] }>('/directory'),
      api.get<AuditLogEntry[]>('/audit-logs?limit=5'),
    ])
      .then(([employees, dir, logs]) => {
        setStats({ employeeCount: employees.length, teamCount: dir.teams.length })
        setRecentActions(logs)
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Something went wrong'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <LoadingState label="Loading admin overview…" />
  if (error) return <ErrorState message={error} />
  if (!stats) return null

  return (
    <section className="mt-6">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
        Admin Overview
      </h2>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        <StatCard value={stats.employeeCount} label="Total Employees" />
        <StatCard value={stats.teamCount} label="Active Teams" />
      </div>

      {recentActions && recentActions.length > 0 && (
        <Card className="mt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            Recent Administrative Actions
          </h3>
          <ul className="mt-2 divide-y divide-black/5 text-sm dark:divide-white/10">
            {recentActions.map((log) => (
              <li key={log.id} className="py-2 text-gray-600 first:pt-0 last:pb-0 dark:text-gray-400 sm:py-1.5">
                {/* Own line on phones so the sentence below reads cleanly
                    instead of running on from the timestamp. */}
                <span className="block text-xs text-gray-400 dark:text-gray-500 sm:inline sm:text-sm">
                  {dateFormatter.format(new Date(log.createdAt))}
                </span>{' '}
                <span className="text-gray-900 dark:text-gray-200">{log.user}</span> — {humanize(log.action)}{' '}
                {humanize(log.resource)}
              </li>
            ))}
          </ul>
          <Link
            to="/audit-logs"
            className="mt-3 inline-block text-sm font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400"
          >
            View all audit logs →
          </Link>
        </Card>
      )}
    </section>
  )
}
