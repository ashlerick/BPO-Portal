import { EmptyState, ErrorState, LoadingState } from '../../components/AsyncState'
import { useApiData } from '../../hooks/useApiData'
import { Card } from '../../components/ui/Card'
import { PageHeader } from '../../components/ui/PageHeader'
import { humanize } from '../../utils/text'
import type { AuditLogEntry } from './types'

const dateFormatter = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' })

export function AuditLogsPage() {
  const { data, loading, error } = useApiData<AuditLogEntry[]>('/audit-logs?limit=100')

  return (
    <div>
      <PageHeader title="Audit Logs" />

      {loading && <LoadingState />}
      {error && <ErrorState message={error} />}
      {data && data.length === 0 && <EmptyState label="No administrative actions recorded yet." />}

      {data && data.length > 0 && (
        <Card className="overflow-x-auto !p-0">
          <table className="stack-table w-full text-left text-sm">
            <thead>
              <tr className="border-b border-black/5 text-xs uppercase tracking-wide text-gray-500 dark:border-white/10 dark:text-gray-400">
                <th className="py-3 pl-4 pr-4 font-medium">When</th>
                <th className="py-3 pr-4 font-medium">User</th>
                <th className="py-3 pr-4 font-medium">Action</th>
                <th className="py-3 pr-4 font-medium">Resource</th>
                <th className="py-3 pr-4 font-medium">Result</th>
              </tr>
            </thead>
            <tbody>
              {data.map((log) => (
                <tr
                  key={log.id}
                  className="border-b border-black/5 transition-colors last:border-0 hover:bg-black/[0.02] dark:border-white/5 dark:hover:bg-white/[0.03]"
                >
                  <td data-primary className="py-2.5 pl-4 pr-4 text-gray-500 dark:text-gray-400">
                    {dateFormatter.format(new Date(log.createdAt))}
                  </td>
                  <td data-label="User" className="py-2.5 pr-4 text-gray-900 dark:text-gray-200">{log.user}</td>
                  <td data-label="Action" className="py-2.5 pr-4 text-gray-700 dark:text-gray-300">{humanize(log.action)}</td>
                  <td data-label="Resource" className="py-2.5 pr-4 text-gray-700 dark:text-gray-300">
                    <span>
                      {humanize(log.resource)}
                      {log.resourceId && (
                        <span className="text-gray-400 dark:text-gray-500"> #{log.resourceId.slice(0, 8)}</span>
                      )}
                    </span>
                  </td>
                  <td data-label="Result" className="py-2.5 pr-4">
                    <span
                      className={
                        log.result === 'success'
                          ? 'font-medium text-brand-700 dark:text-brand-400'
                          : 'font-medium text-red-600 dark:text-red-400'
                      }
                    >
                      {humanize(log.result)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}
