import { useState } from 'react'
import { useAuth } from '../../auth/AuthContext'
import { api, ApiError } from '../../services/api'
import type { WeeklyReport } from './types'

// What a report card can do to its report: move it through draft, submitted, reviewed and approved, and export it. Shared by the general
// report card and the FOA one so both follow the same rules.
export function useReportActions(report: WeeklyReport, onUpdated: (r: WeeklyReport) => void, onDone?: () => void) {
  const { user, effectiveRoles, guardedAction } = useAuth()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [exporting, setExporting] = useState<string | null>(null)

  const isReviewer = effectiveRoles.some((r) => r === 'manager' || r === 'hr' || r === 'admin')
  const isOwnReport = report.authorId != null && report.authorId === user?.id
  const canEdit = report.status === 'draft' || report.status === 'rejected'
  const canExport = isOwnReport || isReviewer || effectiveRoles.includes('team_leader')
  const canReview = isReviewer && (report.status === 'submitted' || report.status === 'reviewed')

  function transition(action: string, extra?: Record<string, unknown>) {
    const requiredRoles =
      action === 'review' || action === 'approve' || action === 'reject'
        ? (['manager', 'hr', 'admin'] as const)
        : (['team_leader', 'hr', 'admin'] as const)

    guardedAction([...requiredRoles], async () => {
      setBusy(true)
      setError(null)
      try {
        const updated = await api.put<WeeklyReport>(`/reports/${report.id}`, { action, ...extra })
        onUpdated(updated)
        onDone?.()
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Could not update report')
      } finally {
        setBusy(false)
      }
    })
  }

  async function handleExport(format: 'csv' | 'xlsx' | 'pdf') {
    setExporting(format)
    setError(null)
    try {
      const { url } = await api.get<{ url: string }>(`/reports/${report.id}/export?format=${format}`)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not export report')
    } finally {
      setExporting(null)
    }
  }

  return { busy, error, exporting, isReviewer, isOwnReport, canEdit, canExport, canReview, transition, handleExport }
}
