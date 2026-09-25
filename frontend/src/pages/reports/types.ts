import type { FoaReportData } from './foa'

export type ReportStatus = 'draft' | 'submitted' | 'reviewed' | 'approved' | 'rejected'

export interface ReportData {
  client?: string
  headcount?: number
  attendance?: string
  productivity?: string
  qa?: string
  sla?: string
  performanceMetrics?: string
  issues?: string
  achievements?: string
  actionItems?: string
  managerComments?: string
}

export interface WeeklyReport {
  id: string
  teamId: string
  team: string
  department: string
  periodStart: string
  periodEnd: string
  status: ReportStatus
  submittedBy: string | null
  schemaKey: 'generic' | 'foa'
  authorId: string | null
  authorName: string | null
  data: ReportData | FoaReportData
  createdAt: string
  updatedAt: string
}
