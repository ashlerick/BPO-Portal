import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../../auth/AuthContext'
import { EmptyState } from '../../components/AsyncState'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card, CardForm } from '../../components/ui/Card'
import { FormError } from '../../components/ui/Field'
import { PageHeader } from '../../components/ui/PageHeader'
import { api, ApiError } from '../../services/api'

interface Post {
  id: string
  body: string
  hidden: boolean
  createdAt: string
}

const fmt = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' })

export function FreedomWallPage() {
  const { effectiveRoles } = useAuth()
  const isHr = effectiveRoles.some((r) => r === 'hr' || r === 'admin')
  const [posts, setPosts] = useState<Post[] | null>(null)
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    api
      .get<Post[]>('/hr/freedom-wall')
      .then(setPosts)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load the wall'))
  }, [])
  useEffect(load, [load])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api.post('/hr/freedom-wall', { body })
      setBody('')
      load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not post')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <PageHeader title="Freedom Wall" description="Post anonymously. Nobody — including HR — can see who wrote a post." />
      <CardForm onSubmit={submit} className="mb-4 space-y-3">
        <textarea
          required
          maxLength={1000}
          rows={3}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Share a thought, idea or concern…"
          className="field w-full"
        />
        <FormError message={error} />
        <Button type="submit" variant="primary" size="sm" disabled={busy || body.trim() === ''}>
          {busy ? 'Posting…' : 'Post anonymously'}
        </Button>
      </CardForm>

      {!posts && !error && null}
      {posts && posts.length === 0 && <EmptyState label="No posts yet. Be the first." />}
      {posts && (
        <ul className="space-y-3">
          {posts.map((p) => (
            <li key={p.id}>
              <Card className="space-y-2">
                <p className={`whitespace-pre-wrap text-sm ${p.hidden ? 'text-gray-400' : 'text-gray-900 dark:text-gray-100'}`}>{p.body}</p>
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500 dark:text-gray-400">
                  <span>
                    {fmt.format(new Date(p.createdAt))} {p.hidden && <Badge tone="amber">Hidden</Badge>}
                  </span>
                  {isHr && (
                    <span className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={async () => {
                          await api.put(`/hr/freedom-wall/${p.id}`, { hidden: !p.hidden })
                          load()
                        }}
                      >
                        {p.hidden ? 'Unhide' : 'Hide'}
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={async () => {
                          if (!window.confirm('Delete this post?')) return
                          await api.delete(`/hr/freedom-wall/${p.id}`)
                          load()
                        }}
                      >
                        Delete
                      </Button>
                    </span>
                  )}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
