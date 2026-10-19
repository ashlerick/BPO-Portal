import { FormattedText } from '../../components/ui/FormattedText'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ErrorState, LoadingState } from '../../components/AsyncState'
import { api, ApiError } from '../../services/api'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { useAuth } from '../../auth/AuthContext'
import { AnnouncementEngagement } from './AnnouncementEngagement'
import { isExpired, type Announcement } from './types'

const dateFormatter = new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeZone: 'Asia/Manila' })

const backLink = (
  <Link to="/announcements" className="text-sm text-brand-600 hover:underline dark:text-brand-400">
    ← All announcements
  </Link>
)

// One announcement on its own, like a notice on a board: the title as the header, the text beneath it.
// This is where the desktop app's announcement cards open. There is no single-announcement endpoint, so it
// reads the same list the Announcements page uses and picks the one by id.
export function AnnouncementView() {
  const { id } = useParams()
  const { effectiveRoles } = useAuth()
  const canManage = effectiveRoles.some((r) => r === 'hr' || r === 'admin')
  const [announcement, setAnnouncement] = useState<Announcement | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .get<Announcement[]>('/announcements')
      .then((all) => setAnnouncement(all.find((a) => a.id === id) ?? null))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Something went wrong'))
  }, [id])

  if (error) return <ErrorState message={error} />
  if (announcement === undefined) return <LoadingState />

  if (announcement === null) {
    return (
      <div className="space-y-3">
        {backLink}
        <Card>
          <h1 className="font-medium text-gray-900 dark:text-gray-100">This announcement isn't available.</h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">It may have been removed. The full list is under All announcements.</p>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {backLink}
      <Card>
        <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
          <Badge tone="blue">{announcement.category}</Badge>
          {announcement.featured && <Badge tone="amber">★ Highlighted</Badge>}
          {announcement.publishAt && <span>{dateFormatter.format(new Date(announcement.publishAt))}</span>}
          {!announcement.published && <Badge tone="amber">Draft</Badge>}
          {isExpired(announcement) && <Badge tone="gray">Expired</Badge>}
        </div>
        <h1 className="mt-3 break-words text-2xl font-bold tracking-tight text-gold-600 dark:text-gold-400">{announcement.title}</h1>
        <FormattedText text={announcement.content} className="mt-4 text-base leading-relaxed text-gray-700 dark:text-gray-300" />
        <AnnouncementEngagement announcement={announcement} canManage={canManage} onChange={setAnnouncement} />
      </Card>
    </div>
  )
}
