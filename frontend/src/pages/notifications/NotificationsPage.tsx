import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { EmptyState, ErrorState, LoadingState } from '../../components/AsyncState'
import { api, ApiError } from '../../services/api'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { PageHeader } from '../../components/ui/PageHeader'
import { Section, SectionStack } from '../../components/ui/Section'
import { NOTIFICATIONS_CHANGED, type AppNotification, type NotificationsResponse } from './types'

const timeFmt = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Manila',
})

export function NotificationsPage() {
  const navigate = useNavigate()
  const [items, setItems] = useState<AppNotification[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .get<NotificationsResponse>('/notifications')
      .then((r) => setItems(r.items))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Something went wrong'))
      .finally(() => setLoading(false))
  }, [])

  const unread = items?.filter((n) => !n.readAt) ?? []
  const read = items?.filter((n) => n.readAt) ?? []

  async function markRead(n: AppNotification) {
    if (n.readAt) return
    setItems((prev) => prev?.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)) ?? null)
    try {
      await api.put(`/notifications/${n.id}`, {})
    } finally {
      window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED))
    }
  }

  async function markAllRead() {
    const now = new Date().toISOString()
    setItems((prev) => prev?.map((x) => (x.readAt ? x : { ...x, readAt: now })) ?? null)
    try {
      await api.put('/notifications/read-all', {})
    } finally {
      window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED))
    }
  }

  function open(n: AppNotification) {
    void markRead(n)
    if (n.link) navigate(n.link)
  }

  function renderItem(n: AppNotification) {
    return (
      <li key={n.id}>
        <Card className={`!py-3 ${n.readAt ? 'opacity-70' : ''}`}>
          <button type="button" onClick={() => open(n)} className="block w-full text-left">
            <div className="flex items-start justify-between gap-3">
              <span className="min-w-0 font-medium text-gray-900 dark:text-gray-100">
                {!n.readAt && <span className="mr-2 inline-block h-2 w-2 rounded-full bg-brand-500" aria-label="Unread" />}
                {n.title}
              </span>
              <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400">
                {timeFmt.format(new Date(n.createdAt))}
              </span>
            </div>
            {n.body && <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{n.body}</p>}
          </button>
        </Card>
      </li>
    )
  }

  return (
    <div>
      <PageHeader title="Notifications" />

      {loading && <LoadingState />}
      {error && <ErrorState message={error} />}
      {items && items.length === 0 && <EmptyState label="You're all caught up." />}

      {items && items.length > 0 && (
        <SectionStack>
          <Section
            id="notifications.unread"
            title="New"
            hint={`${unread.length} unread`}
            defaultOpen
            aside={
              unread.length > 0 ? (
                <Button size="sm" onClick={markAllRead}>
                  Mark all read
                </Button>
              ) : undefined
            }
          >
            {unread.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">Nothing new.</p>
            ) : (
              <ul className="space-y-2">{unread.map(renderItem)}</ul>
            )}
          </Section>
          <Section id="notifications.earlier" title="Earlier" hint={`${read.length} read`}>
            {read.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">No earlier notifications.</p>
            ) : (
              <ul className="space-y-2">{read.map(renderItem)}</ul>
            )}
          </Section>
        </SectionStack>
      )}
    </div>
  )
}
