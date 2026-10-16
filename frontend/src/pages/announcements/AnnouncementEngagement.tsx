import { useState } from 'react'
import { api, ApiError } from '../../services/api'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { useToast } from '../../components/ui/Toast'
import type { Announcement } from './types'

const REACTIONS = ['👍', '❤️', '🎉'] as const

interface AckList {
  acknowledged: { name: string; at: string }[]
  pending: string[]
}

// Reactions (one each) and, for policies and notices, a "Got it" the person presses once they have read it.
// HR/Admin also see how many have acknowledged and can open the list of who has not.
export function AnnouncementEngagement({
  announcement,
  canManage,
  onChange,
}: {
  announcement: Announcement
  canManage: boolean
  onChange: (a: Announcement) => void
}) {
  const toast = useToast()
  const [acks, setAcks] = useState<AckList | null>(null)
  const [showAcks, setShowAcks] = useState(false)
  const [busy, setBusy] = useState(false)

  const reactions = announcement.reactions ?? {}
  const mine = announcement.myReaction ?? null

  // The count moves at once; it rolls back if the server says no.
  async function react(emoji: string | null) {
    const before = announcement
    const next = { ...reactions }
    if (mine) next[mine] = Math.max(0, (next[mine] ?? 1) - 1)
    if (emoji) next[emoji] = (next[emoji] ?? 0) + 1
    onChange({ ...announcement, reactions: next, myReaction: emoji })
    try {
      const fresh = await api.post<Announcement>(`/announcements/${announcement.id}?action=react`, { emoji })
      onChange({ ...announcement, ...fresh })
    } catch (err) {
      onChange(before)
      toast.error(err instanceof ApiError ? err.message : 'Could not save your reaction')
    }
  }

  async function acknowledge() {
    setBusy(true)
    try {
      const fresh = await api.post<Announcement>(`/announcements/${announcement.id}?action=ack`)
      onChange({ ...announcement, ...fresh })
      toast.success('Thanks, your acknowledgement is recorded.')
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not record that. Try again.')
    } finally {
      setBusy(false)
    }
  }

  async function toggleAcks() {
    if (showAcks) return setShowAcks(false)
    setShowAcks(true)
    try {
      setAcks(await api.get<AckList>(`/announcements/${announcement.id}?action=acks`))
    } catch (err) {
      setShowAcks(false)
      toast.error(err instanceof ApiError ? err.message : 'Could not load the list')
    }
  }

  return (
    <div className="mt-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="React to this announcement">
        {REACTIONS.map((emoji) => {
          const count = reactions[emoji] ?? 0
          const selected = mine === emoji
          return (
            <button
              key={emoji}
              type="button"
              onClick={() => react(selected ? null : emoji)}
              aria-pressed={selected}
              aria-label={`${emoji} ${count}`}
              className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-sm transition active:scale-95 ${
                selected
                  ? 'border-brand-500 bg-brand-500/15 font-semibold text-gray-900 dark:text-gray-100'
                  : 'border-black/10 bg-black/5 text-gray-700 hover:bg-black/10 dark:border-white/15 dark:bg-white/5 dark:text-gray-300 dark:hover:bg-white/10'
              }`}
            >
              <span>{emoji}</span>
              {count > 0 && <span className="text-xs tabular-nums">{count}</span>}
            </button>
          )
        })}

        {announcement.needsAck &&
          (announcement.acknowledged ? (
            <Badge tone="green" className="ml-1">
              ✓ You acknowledged this
            </Badge>
          ) : (
            <Button size="sm" variant="primary" onClick={acknowledge} disabled={busy} className="ml-1">
              {busy ? 'Saving…' : "Got it, I've read this"}
            </Button>
          ))}
      </div>

      {canManage && announcement.needsAck && announcement.ackTotal !== undefined && (
        <div className="text-xs text-gray-600 dark:text-gray-400">
          <button type="button" onClick={toggleAcks} className="underline decoration-dotted underline-offset-2 hover:text-gray-900 dark:hover:text-gray-200">
            Acknowledged by {announcement.ackCount ?? 0} of {announcement.ackTotal}
            {showAcks ? ' (hide)' : ' (who?)'}
          </button>
          {showAcks && acks && (
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <div>
                <p className="font-medium text-gray-800 dark:text-gray-200">Acknowledged ({acks.acknowledged.length})</p>
                <p className="mt-1 break-words">{acks.acknowledged.map((a) => a.name).join(', ') || 'No one yet.'}</p>
              </div>
              <div>
                <p className="font-medium text-gray-800 dark:text-gray-200">Still to acknowledge ({acks.pending.length})</p>
                <p className="mt-1 break-words">{acks.pending.join(', ') || 'Everyone has.'}</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
