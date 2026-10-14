import { EmptyState, ErrorState } from '../../components/AsyncState'
import { PageHeader } from '../../components/ui/PageHeader'
import { Section, SectionStack } from '../../components/ui/Section'
import { useApiData } from '../../hooks/useApiData'
import { payslipPeriodLabel } from '../../utils/payslips'
import { MyProfile } from '../hris/HrisPage'

interface MyPayslip {
  id: string
  periodStart: string
  periodEnd: string
  link: string | null
}

// The signed-in employee's own payslip links (kept in Google Drive; Drive
// sharing decides whether the file actually opens for them).
function MyPayslips() {
  const { data, loading, error } = useApiData<MyPayslip[]>('/restricted/payroll?kind=mine')

  return (
    <SectionStack>
      <Section id="profile.payslips" title="Payslips" hint={data ? `${data.length} available` : undefined}>
        {error && <ErrorState message={error} />}
        {loading && <p className="text-sm text-gray-500 dark:text-gray-400">Loading…</p>}
        {data && data.length === 0 && <EmptyState label="No payslips yet." />}
        {data && data.length > 0 && (
          <ul className="divide-y divide-black/5 text-sm dark:divide-white/10">
            {data.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 py-2">
                <span className="text-gray-900 dark:text-gray-100">{payslipPeriodLabel(s.periodStart)}</span>
                {s.link && (
                  <a href={s.link} target="_blank" rel="noopener noreferrer" className="font-medium text-brand-600 dark:text-brand-400">
                    Open ↗
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </SectionStack>
  )
}

interface MyItem {
  id: string
  assetTag: string
  name: string
  category: string | null
}

// Company items currently assigned to the signed-in employee.
function MyItems() {
  const { data, error } = useApiData<MyItem[]>('/hr/inventory?mine=1')
  return (
    <SectionStack>
      <Section id="profile.items" title="Company items" hint={data ? `${data.length} assigned` : undefined}>
        {error && <ErrorState message={error} />}
        {data && data.length === 0 && <EmptyState label="No company items assigned to you." />}
        {data && data.length > 0 && (
          <ul className="divide-y divide-black/5 text-sm dark:divide-white/10">
            {data.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-2 py-2">
                <span className="text-gray-900 dark:text-gray-100">
                  {i.name}
                  {i.category && <span className="text-gray-500 dark:text-gray-400"> · {i.category}</span>}
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400">{i.assetTag}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </SectionStack>
  )
}

export function ProfilePage() {
  return (
    <div>
      <PageHeader title="My Profile" />
      <MyProfile />
      <div className="mt-4 space-y-4">
        <MyPayslips />
        <MyItems />
      </div>
    </div>
  )
}
