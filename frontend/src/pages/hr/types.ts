export const HR_REQUEST_TYPES = [
  { key: 'certificate_of_employment', label: 'Certificate of Employment' },
  { key: 'salary_certificate', label: 'Salary certificate' },
  { key: 'employment_verification', label: 'Employment verification' },
  { key: 'document_request', label: 'Document request' },
  { key: 'benefit_concern', label: 'Benefit concern' },
  { key: 'hr_concern', label: 'HR concern' },
  { key: 'other', label: 'Other HR request' },
] as const

export const HR_REQUEST_STATUSES = ['pending', 'processing', 'completed', 'closed'] as const
export type HrRequestStatus = (typeof HR_REQUEST_STATUSES)[number]

export interface HrRequest {
  id: string
  type: string
  subject: string
  details: string | null
  status: HrRequestStatus
  resolution: string | null
  employeeName: string
  createdAt: string
  updatedAt: string
}

export interface ChecklistTask {
  id: string
  label: string
  done: boolean
  doneAt: string | null
  note: string | null
}

export interface Checklist {
  id: string
  employeeId: string
  employeeName: string
  kind: 'onboarding' | 'offboarding'
  status: 'open' | 'completed'
  separationType: 'resignation' | 'termination' | null
  effectiveDate: string | null
  notes: string | null
  completedAt: string | null
  createdAt: string
  progress: { done: number; total: number }
  tasks: ChecklistTask[]
}

export interface Enrollment {
  id: string
  employeeId: string
  employeeName: string
  benefitId: string
  benefitTitle: string
  benefitCategory: string
  provider: string | null
  providerContact: string | null
  status: 'pending' | 'enrolled' | 'waived' | 'terminated'
  effectiveDate: string | null
  endDate: string | null
  dependentIds: string[]
  notes: string | null
  history: { at: string; by: string; action: string; detail?: string }[]
}

export interface Dependent {
  id: string
  employeeId: string
  name: string
  relationship: string
  birthDate: string | null
}
