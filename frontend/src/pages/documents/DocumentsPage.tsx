import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../../auth/AuthContext'
import { api, ApiError } from '../../services/api'
import { EmptyState, ErrorState, LoadingState } from '../../components/AsyncState'
import { Card, CardForm } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { PageHeader } from '../../components/ui/PageHeader'
import { ROLE_LABELS, type Role } from '../../auth/types'
import type { Document } from './types'

function groupByCategory(documents: Document[]): Map<string, Document[]> {
  const groups = new Map<string, Document[]>()
  for (const doc of documents) {
    const group = groups.get(doc.category) ?? []
    group.push(doc)
    groups.set(doc.category, group)
  }
  return groups
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      resolve(result.slice(result.indexOf(',') + 1))
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

const ROLES: Role[] = ['employee', 'team_leader', 'manager', 'hr', 'admin']

function UploadForm({ onUploaded }: { onUploaded: (d: Document) => void }) {
  const { guardedAction } = useAuth()
  const [title, setTitle] = useState('')
  const [categoryName, setCategoryName] = useState('')
  const [accessLevel, setAccessLevel] = useState('employee')
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!file) {
      setError('Choose a file')
      return
    }
    if (file.size > 4 * 1024 * 1024) {
      setError('File must be under 4MB')
      return
    }

    guardedAction(['hr', 'admin'], async () => {
      setUploading(true)
      try {
        const fileBase64 = await readFileAsBase64(file)
        const uploaded = await api.post<Document>('/documents', {
          title,
          categoryName,
          accessLevel,
          contentType: file.type || 'application/octet-stream',
          fileName: file.name,
          fileBase64,
        })
        onUploaded(uploaded)
        setTitle('')
        setCategoryName('')
        setFile(null)
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Could not upload document')
      } finally {
        setUploading(false)
      }
    })
  }

  return (
    <CardForm onSubmit={handleSubmit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor="doc-title" className="text-sm text-gray-600 dark:text-gray-400">
            Title
          </label>
          <input id="doc-title" required value={title} onChange={(e) => setTitle(e.target.value)} className="field" />
        </div>
        <div className="space-y-1">
          <label htmlFor="doc-category" className="text-sm text-gray-600 dark:text-gray-400">
            Category
          </label>
          <input
            id="doc-category"
            required
            value={categoryName}
            onChange={(e) => setCategoryName(e.target.value)}
            className="field"
          />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor="doc-access" className="text-sm text-gray-600 dark:text-gray-400">
            Visible to
          </label>
          <select id="doc-access" value={accessLevel} onChange={(e) => setAccessLevel(e.target.value)} className="field">
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r === 'employee' ? 'Everyone' : ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="doc-file" className="text-sm text-gray-600 dark:text-gray-400">
            File (max 4MB)
          </label>
          <input
            id="doc-file"
            type="file"
            required
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="w-full text-sm text-gray-700 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-600 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-brand-700 dark:text-gray-300"
          />
        </div>
      </div>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <Button type="submit" variant="primary" disabled={uploading}>
        {uploading ? 'Uploading…' : 'Upload'}
      </Button>
    </CardForm>
  )
}

export function DocumentsPage() {
  const { effectiveRoles } = useAuth()
  const canManage = effectiveRoles.some((r) => r === 'hr' || r === 'admin')
  const [data, setData] = useState<Document[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [downloadError, setDownloadError] = useState<string | null>(null)

  useEffect(() => {
    api
      .get<Document[]>('/documents')
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Something went wrong'))
      .finally(() => setLoading(false))
  }, [])

  async function handleDownload(id: string) {
    setDownloadError(null)
    setDownloadingId(id)
    try {
      const { url } = await api.get<{ url: string }>(`/documents/${id}/download`)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (err) {
      setDownloadError(err instanceof ApiError ? err.message : 'Could not generate download link')
    } finally {
      setDownloadingId(null)
    }
  }

  return (
    <div>
      <PageHeader title="Documents" />

      {canManage && (
        <div className="mb-4">
          <UploadForm onUploaded={(d) => setData((prev) => (prev ? [d, ...prev] : [d]))} />
        </div>
      )}

      {loading && <LoadingState />}
      {error && <ErrorState message={error} />}
      {data && data.length === 0 && <EmptyState label="No documents available yet." />}
      {downloadError && (
        <div className="mb-3">
          <ErrorState message={downloadError} />
        </div>
      )}

      {data && data.length > 0 && (
        <div className="space-y-6">
          {Array.from(groupByCategory(data)).map(([category, docs]) => (
            <section key={category}>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                {category}
              </h2>
              <ul className="mt-2 space-y-2">
                {docs.map((doc) => (
                  <li key={doc.id}>
                    <Card className="flex flex-wrap items-center justify-between gap-2 !py-3">
                      <span className="min-w-0 break-words font-medium text-gray-900 dark:text-gray-100">
                        {doc.title}
                      </span>
                      <Button
                        size="sm"
                        className="shrink-0"
                        onClick={() => handleDownload(doc.id)}
                        disabled={downloadingId === doc.id}
                      >
                        {downloadingId === doc.id ? 'Preparing…' : 'Download'}
                      </Button>
                    </Card>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
