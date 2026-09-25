import { useApiData } from '../hooks/useApiData'
import type { EmployeeRecord } from '../pages/hris/types'

// Dropdown of every employee (HR/Admin only — /employees is HR/Admin).
export function EmployeeSelect({
  value,
  onChange,
  label = 'Employee',
  allowNone,
  required = true,
}: {
  value: string
  onChange: (id: string) => void
  label?: string
  allowNone?: string
  required?: boolean
}) {
  const { data: employees } = useApiData<EmployeeRecord[]>('/employees')

  return (
    <label className="flex min-w-0 flex-col gap-1 text-sm text-gray-600 dark:text-gray-400">
      {label}
      <select required={required && !allowNone} value={value} onChange={(e) => onChange(e.target.value)} className="field">
        <option value="">{allowNone ?? 'Select…'}</option>
        {employees?.map((emp) => (
          <option key={emp.id} value={emp.id}>
            {emp.name}
          </option>
        ))}
      </select>
    </label>
  )
}
