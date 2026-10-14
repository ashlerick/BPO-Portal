import { Link } from 'react-router-dom'
import { Badge } from '../../components/ui/Badge'
import { Card } from '../../components/ui/Card'
import { PageHeader } from '../../components/ui/PageHeader'

// The old sheet's "Forms" list, as portal destinations.
const FORMS: { label: string; description: string; to?: string }[] = [
  { label: 'Attendance', description: 'Time in / time out and corrections', to: '/attendance' },
  { label: 'Leave Applications', description: 'File a leave request', to: '/leave' },
  { label: 'Freedom Wall', description: 'Post anonymously for everyone to read', to: '/freedom-wall' },
  { label: 'Employee Inquiries', description: 'Send a request or concern to HR', to: '/hr-requests' },
  { label: 'Petty Cash Liquidation', description: 'Liquidate petty cash expenses' },
]

export function FormsPage() {
  return (
    <div>
      <PageHeader title="Forms" description="Everyday forms in one place." />
      <ul className="grid gap-3 sm:grid-cols-2">
        {FORMS.map((f) => (
          <li key={f.label}>
            {f.to ? (
              <Link to={f.to} className="block">
                <Card className="h-full transition hover:border-brand-500">
                  <p className="font-medium text-gray-900 dark:text-gray-100">{f.label}</p>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{f.description}</p>
                </Card>
              </Link>
            ) : (
              <Card className="h-full opacity-75">
                <p className="flex items-center gap-2 font-medium text-gray-900 dark:text-gray-100">
                  {f.label} <Badge tone="amber">Under construction</Badge>
                </p>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{f.description}</p>
              </Card>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
