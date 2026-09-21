import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../../auth/AuthContext'
import { EmptyState, ErrorState, LoadingState } from '../../components/AsyncState'
import { api, ApiError } from '../../services/api'
import { Card, CardForm } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { PageHeader } from '../../components/ui/PageHeader'
import type { Announcement } from './types'

const dateFormatter = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'Asia/Manila' })

function CreateForm({ onCreated }: { onCreated: (a: Announcement) => void }) {
  const { guardedAction } = useAuth()
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [published, setPublished] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    guardedAction(['hr', 'admin'], async () => {
      setError(null)
      setSubmitting(true)
      try {
        const created = await api.post<Announcement>('/announcements', { title, content, published })
        onCreated(created)
        setTitle('')
        setContent('')
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Could not create announcement')
      } finally {
        setSubmitting(false)
      }
    })
  }

  return (
    <CardForm onSubmit={handleSubmit} className="space-y-3">
      <div className="space-y-1">
        <label htmlFor="ann-title" className="text-sm text-gray-600 dark:text-gray-400">
          Title
        </label>
        <input id="ann-title" required value={title} onChange={(e) => setTitle(e.target.value)} className="field" />
      </div>
      <div className="space-y-1">
        <label htmlFor="ann-content" className="text-sm text-gray-600 dark:text-gray-400">
          Content
        </label>
        <textarea
          id="ann-content"
          required
          rows={3}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="field"
        />
      </div>
      <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
        <input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} />
        Publish immediately
      </label>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <Button type="submit" variant="primary" disabled={submitting}>
        {submitting ? 'Posting…' : 'Post announcement'}
      </Button>
    </CardForm>
  )
}

function AnnouncementItem({
  announcement,
  canManage,
  onUpdated,
  onDeleted,
}: {
  announcement: Announcement
  canManage: boolean
  onUpdated: (a: Announcement) => void
  onDeleted: (id: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(announcement.title)
  const [content, setContent] = useState(announcement.content)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { guardedAction } = useAuth()

  function save() {
    guardedAction(['hr', 'admin'], async () => {
      setSaving(true)
      setError(null)
      try {
        const updated = await api.put<Announcement>(`/announcements/${announcement.id}`, { title, content })
        onUpdated(updated)
        setEditing(false)
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Could not save')
      } finally {
        setSaving(false)
      }
    })
  }

  function remove() {
    guardedAction(['hr', 'admin'], async () => {
      setSaving(true)
      setError(null)
      try {
        await api.delete(`/announcements/${announcement.id}`)
        onDeleted(announcement.id)
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Could not delete')
        setSaving(false)
      }
    })
  }

  if (editing) {
    return (
      <li>
        <Card>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="field font-medium"
          />
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={3}
            className="field mt-2"
          />
          {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="primary" onClick={save} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
            <Button size="sm" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </Card>
      </li>
    )
  }

  return (
    <li>
      <Card>
        <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
          <h2 className="min-w-0 break-words font-medium text-gray-900 dark:text-gray-100">{announcement.title}</h2>
          {announcement.publishAt && (
            <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400">
              {dateFormatter.format(new Date(announcement.publishAt))}
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{announcement.content}</p>
        {!announcement.published && (
          <Badge tone="amber" className="mt-2">
            Draft
          </Badge>
        )}
        {canManage && (
          <div className="mt-3 flex gap-2">
            <Button size="sm" onClick={() => setEditing(true)}>
              Edit
            </Button>
            <Button size="sm" variant="danger" onClick={remove} disabled={saving}>
              Delete
            </Button>
          </div>
        )}
      </Card>
    </li>
  )
}

export function AnnouncementsPage() {
  const { effectiveRoles } = useAuth()
  const canManage = effectiveRoles.some((r) => r === 'hr' || r === 'admin')
  const [data, setData] = useState<Announcement[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .get<Announcement[]>('/announcements')
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Something went wrong'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div>
      <PageHeader title="Announcements" />

      {canManage && (
        <div className="mb-4">
          <CreateForm onCreated={(a) => setData((prev) => (prev ? [a, ...prev] : [a]))} />
        </div>
      )}

      {loading && <LoadingState />}
      {error && <ErrorState message={error} />}
      {data && data.length === 0 && <EmptyState label="No announcements yet." />}

      {data && data.length > 0 && (
        <ul className="space-y-3">
          {data.map((announcement) => (
            <AnnouncementItem
              key={announcement.id}
              announcement={announcement}
              canManage={canManage}
              onUpdated={(updated) =>
                setData((prev) => prev?.map((a) => (a.id === updated.id ? updated : a)) ?? null)
              }
              onDeleted={(id) => setData((prev) => prev?.filter((a) => a.id !== id) ?? null)}
            />
          ))}
        </ul>
      )}
    </div>
  )
}
