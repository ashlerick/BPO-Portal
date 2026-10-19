import { useState } from 'react'
import { api, ApiError } from '../../services/api'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { useToast } from '../../components/ui/Toast'
import { inBothZones } from '../../components/ui/zones'
import { formatDateOnly } from '../../utils/dates'
import type { Announcement } from './types'

interface RsvpList {
  joining: { name: string }[]
  notJoining: { name: string; note: string | null }[]
  noAnswer: string[]
  mandatory: boolean
}

// An event announcement: when (in both zones) and where, and joining.
//   Mandatory: everyone is expected. Pressing "Got it" (or reacting) counts as joining; the person can change it to "can't make it".
//   Optional: an open question, Yes or No, with no default.
// HR also sees how many are joining and can open the lists.
export function AnnouncementEvent({
  announcement,
  canManage,
  onChange,
}: {
  announcement: Announcement
  canManage: boolean
  onChange: (a: Announcement) => void
}) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [declining, setDeclining] = useState(false)
  const [note, setNote] = useState('')
  const [list, setList] = useState<RsvpList | null>(null)
  const [showList, setShowList] = useState(false)

  if (!announcement.isEvent) return null
  const mandatory = !!announcement.eventMandatory
  const my = announcement.myRsvp ?? null
  const when = announcement.eventStartAt
    ? inBothZones(announcement.eventStartAt)
    : announcement.eventDate
      ? formatDateOnly(announcement.eventDate)
      : null

  async function answer(joining: boolean | null, reason?: string) {
    setBusy(true)
    try {
      const fresh = await api.post<Announcement>(`/announcements/${announcement.id}?action=rsvp`, { joining, note: reason || null })
      onChange({ ...announcement, ...fresh })
      setDeclining(false)
      setNote('')
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not save your answer')
    } finally {
      setBusy(false)
    }
  }

  async function toggleList() {
    if (showList) return setShowList(false)
    setShowList(true)
    try {
      setList(await api.get<RsvpList>(`/announcements/${announcement.id}?action=rsvps`))
    } catch (err) {
      setShowList(false)
      toast.error(err instanceof ApiError ? err.message : 'Could not load the list')
    }
  }

  // What this person is, for the line shown to them.
  const declined = my?.joining === false
  const joiningNow = my?.joining === true || (mandatory && !!announcement.acknowledged && !declined)

  return (
    <div className="mt-3 space-y-2 rounded-lg border border-black/10 bg-black/[0.03] p-3 text-sm dark:border-white/10 dark:bg-white/[0.04]">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="blue">Event</Badge>
        {mandatory && <Badge tone="amber">Mandatory</Badge>}
        {when && <span className="font-medium text-gray-900 dark:text-gray-100">{when}</span>}
      </div>
      {announcement.eventPlace && <p className="text-gray-700 dark:text-gray-300">Where: {announcement.eventPlace}</p>}

      {/* the person's own answer */}
      {declined ? (
        <p className="flex flex-wrap items-center gap-2 text-gray-700 dark:text-gray-300">
          <span>You said you can't make it{my?.note ? ` (${my.note})` : ''}.</span>
          <Button size="sm" onClick={() => answer(true)} disabled={busy}>
            I can join after all
          </Button>
        </p>
      ) : mandatory ? (
        joiningNow ? (
          <div className="space-y-1.5">
            <p className="flex flex-wrap items-center gap-2 text-gray-700 dark:text-gray-300">
              <span className="font-medium text-brand-700 dark:text-brand-400">✓ You're counted as joining.</span>
              {!declining && (
                <Button size="sm" onClick={() => setDeclining(true)} disabled={busy}>
                  I can't make it
                </Button>
              )}
            </p>
            {declining && (
              <div className="flex flex-wrap items-center gap-2">
                <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason (optional)" maxLength={300} className="field min-w-0 flex-1 md:max-w-xs" />
                <Button size="sm" variant="primary" onClick={() => answer(false, note)} disabled={busy}>
                  Confirm
                </Button>
                <Button size="sm" onClick={() => setDeclining(false)} disabled={busy}>
                  Cancel
                </Button>
              </div>
            )}
          </div>
        ) : (
          <p className="text-gray-600 dark:text-gray-400">Everyone is expected. Press <b>Got it</b> below to confirm; you'll be counted as joining unless you say you can't.</p>
        )
      ) : my?.joining === true ? (
        <p className="flex flex-wrap items-center gap-2 text-gray-700 dark:text-gray-300">
          <span className="font-medium text-brand-700 dark:text-brand-400">✓ You're joining.</span>
          <Button size="sm" onClick={() => answer(false)} disabled={busy}>
            Change to no
          </Button>
        </p>
      ) : (
        <p className="flex flex-wrap items-center gap-2 text-gray-700 dark:text-gray-300">
          <span className="font-medium">Are you joining?</span>
          <Button size="sm" variant="primary" onClick={() => answer(true)} disabled={busy}>
            Yes
          </Button>
          <Button size="sm" onClick={() => answer(false)} disabled={busy}>
            No
          </Button>
        </p>
      )}

      {canManage && announcement.eventJoining !== undefined && (
        <div className="text-xs text-gray-600 dark:text-gray-400">
          <button type="button" onClick={toggleList} className="underline decoration-dotted underline-offset-2 hover:text-gray-900 dark:hover:text-gray-200">
            Joining: {announcement.eventJoining} · can't make it: {announcement.eventNotJoining ?? 0} · of {announcement.eventTotal}
            {showList ? ' (hide)' : ' (who?)'}
          </button>
          {showList && list && (
            <div className="mt-2 grid gap-3 sm:grid-cols-3">
              <div>
                <p className="font-medium text-gray-800 dark:text-gray-200">Joining ({list.joining.length})</p>
                <p className="mt-1 break-words">{list.joining.map((p) => p.name).join(', ') || 'No one yet.'}</p>
              </div>
              <div>
                <p className="font-medium text-gray-800 dark:text-gray-200">Can't make it ({list.notJoining.length})</p>
                <p className="mt-1 break-words">
                  {list.notJoining.map((p) => (p.note ? `${p.name} (${p.note})` : p.name)).join(', ') || 'No one.'}
                </p>
              </div>
              <div>
                <p className="font-medium text-gray-800 dark:text-gray-200">No answer ({list.noAnswer.length})</p>
                <p className="mt-1 break-words">{list.noAnswer.join(', ') || 'Everyone has answered.'}</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
