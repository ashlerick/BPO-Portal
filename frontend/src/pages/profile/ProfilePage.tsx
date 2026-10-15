import { useCallback, useEffect, useState } from 'react'
import { EmptyState, ErrorState } from '../../components/AsyncState'
import { api, ApiError } from '../../services/api'
import { PageHeader } from '../../components/ui/PageHeader'
import { Section, SectionStack } from '../../components/ui/Section'
import { useApiData } from '../../hooks/useApiData'
import { payslipPeriodLabel } from '../../utils/payslips'
import { MyProfile } from '../hris/HrisPage'
import { ConditionSelect } from '../inventory/ConditionSelect'
import type { InventoryItem } from '../inventory/types'

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
    <SectionStack tabs={false}>
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

// Company items currently assigned to the signed-in employee, with the
// monthly condition check they are asked to do.
function MyItems() {
  const [data, setData] = useState<InventoryItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(() => {
    api
      .get<InventoryItem[]>('/hr/inventory?mine=1')
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load your items'))
  }, [])
  useEffect(load, [load])

  const due = data?.filter((i) => !i.checkedThisMonth).length ?? 0
  return (
    <SectionStack tabs={false}>
      <Section id="profile.items" title="Company items" hint={data ? `${data.length} assigned` : undefined} defaultOpen>
        {error && <ErrorState message={error} />}
        {data && data.length === 0 && <EmptyState label="No company items assigned to you." />}
        {due > 0 && (
          <p className="mb-3 rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
            Please check the condition of your items this month ({due} left).
          </p>
        )}
        {data && data.length > 0 && (
          <ul className="divide-y divide-black/5 text-sm dark:divide-white/10">
            {data.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="text-gray-900 dark:text-gray-100">
                  {i.name}
                  {i.category && <span className="text-gray-500 dark:text-gray-400"> · {i.category}</span>}
                  <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">{i.assetTag}</span>
                </span>
                <ConditionSelect item={i} onChanged={load} />
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
      <MyProfile
        extraTabs={[
          { id: 'payslips', label: 'Payslips', content: <MyPayslips /> },
          { id: 'items', label: 'Company items', content: <MyItems /> },
        ]}
      />
    </div>
  )
}
