import { useState } from 'react'
import { Link } from 'react-router-dom'
import { formatDateOnly } from '../../utils/dates'
import { api, ApiError } from '../../services/api'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { useToast } from '../../components/ui/Toast'
import type { Announcement } from './types'

const REACTIONS = ['👍', '❤️', '🎉'] as const
// Names listed in the hover tooltip before "and N more".
const NAMES_SHOWN = 10

interface AckList {
  acknowledged: { name: string; at: string }[]
  pending: string[]
}

interface ActionList {
  done: { name: string; at: string | null }[]
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
  const [actions, setActions] = useState<ActionList | null>(null)
  const [showActions, setShowActions] = useState(false)
  const [changingDue, setChangingDue] = useState(false)
  const [newDue, setNewDue] = useState('')
  const [busy, setBusy] = useState(false)

  const reactions = announcement.reactions ?? {}
  const reactors = announcement.reactors ?? {}
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

  async function toggleActions() {
    if (showActions) return setShowActions(false)
    setShowActions(true)
    try {
      setActions(await api.get<ActionList>(`/announcements/${announcement.id}?action=actions`))
    } catch (err) {
      setShowActions(false)
      toast.error(err instanceof ApiError ? err.message : 'Could not load the list')
    }
  }

  async function saveDue() {
    setBusy(true)
    try {
      const fresh = await api.put<Announcement>(`/announcements/${announcement.id}`, { actionDueOn: newDue })
      onChange({ ...announcement, ...fresh })
      setChangingDue(false)
      toast.success('Due date changed. Open to-dos follow it.')
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not change the due date')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="React to this announcement">
        {REACTIONS.map((emoji) => {
          const count = reactions[emoji] ?? 0
          const selected = mine === emoji
          const names = reactors[emoji] ?? []
          const more = count - Math.min(names.length, NAMES_SHOWN)
          return (
            <button
              key={emoji}
              type="button"
              onClick={() => react(selected ? null : emoji)}
              aria-pressed={selected}
              aria-label={`${emoji} ${count}${names.length ? `: ${names.slice(0, NAMES_SHOWN).join(', ')}${more > 0 ? ` and ${more} more` : ''}` : ''}`}
              className={`group relative flex items-center gap-1 rounded-full border px-2.5 py-1 text-sm transition active:scale-95 ${
                selected
                  ? 'border-brand-500 bg-brand-500/15 font-semibold text-gray-900 dark:text-gray-100'
                  : 'border-black/10 bg-black/5 text-gray-700 hover:bg-black/10 dark:border-white/15 dark:bg-white/5 dark:text-gray-300 dark:hover:bg-white/10'
              }`}
            >
              <span>{emoji}</span>
              {count > 0 && <span className="text-xs tabular-nums">{count}</span>}
              {/* Who reacted: shown on hover or keyboard focus, so the card stays clean. */}
              {names.length > 0 && (
                <span
                  role="tooltip"
                  className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 hidden w-max max-w-[16rem] -translate-x-1/2 rounded-lg border border-white/15 bg-gray-950 px-3 py-2 text-left text-xs font-medium leading-snug text-gray-100 shadow-xl group-hover:block group-focus-visible:block"
                >
                  {names.slice(0, NAMES_SHOWN).map((n) => (
                    <span key={n} className="block">
                      {n}
                    </span>
                  ))}
                  {more > 0 && <span className="block text-gray-400">and {more} more</span>}
                </span>
              )}
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

      {/* Devices without hover (phones) cannot show the tooltip, so they get the names as a small line instead. */}
      {REACTIONS.some((e) => (reactions[e] ?? 0) > 0) && (
        <div className="hidden space-y-0.5 text-xs text-gray-600 dark:text-gray-400 [@media(hover:none)]:block">
          {REACTIONS.filter((e) => (reactions[e] ?? 0) > 0).map((e) => {
            const names = reactors[e] ?? []
            const hidden = (reactions[e] ?? names.length) - Math.min(names.length, NAMES_SHOWN)
            return (
              <p key={e} className="break-words">
                <span>{e}</span> {names.slice(0, NAMES_SHOWN).join(', ')}
                {hidden > 0 && ` and ${hidden} more`}
              </p>
            )
          })}
        </div>
      )}

      {/* An announcement that asks for action: your to-do, and for HR how many have done it. */}
      {announcement.needsAction && announcement.actionDueAt && announcement.myAction && (
        <p className="flex flex-wrap items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
          <Badge tone={announcement.myAction.status === 'done' ? 'green' : 'amber'}>
            {announcement.myAction.status === 'done' ? '✓ Action done' : `Action needed by ${formatDateOnly(announcement.actionDueAt)}`}
          </Badge>
          {announcement.myAction.status !== 'done' && (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              It is in your to-dos. <Link to="/" className="underline decoration-dotted underline-offset-2">Open my to-dos</Link>
            </span>
          )}
        </p>
      )}

      {canManage && announcement.needsAction && announcement.actionTotal !== undefined && (
        <div className="text-xs text-gray-600 dark:text-gray-400">
          <button type="button" onClick={toggleActions} className="underline decoration-dotted underline-offset-2 hover:text-gray-900 dark:hover:text-gray-200">
            Action: {announcement.actionDone ?? 0} of {announcement.actionTotal} done
            {announcement.actionDueAt ? `, due ${formatDateOnly(announcement.actionDueAt)}` : ''}
            {showActions ? ' (hide)' : ' (who?)'}
          </button>
          {announcement.actionTargeted && <span> · chosen people only</span>}
          {' · '}
          {changingDue ? (
            <span className="inline-flex flex-wrap items-center gap-1.5">
              <input type="date" value={newDue} onChange={(e) => setNewDue(e.target.value)} className="field !w-auto px-2 py-0.5 text-xs" />
              <Button size="sm" variant="primary" disabled={!newDue || busy} onClick={saveDue}>
                Save
              </Button>
              <Button size="sm" onClick={() => setChangingDue(false)} disabled={busy}>
                Cancel
              </Button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => {
                setNewDue(announcement.actionDueAt ? announcement.actionDueAt.slice(0, 10) : '')
                setChangingDue(true)
              }}
              className="underline decoration-dotted underline-offset-2 hover:text-gray-900 dark:hover:text-gray-200"
            >
              change due date
            </button>
          )}
          {showActions && actions && (
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <div>
                <p className="font-medium text-gray-800 dark:text-gray-200">Done ({actions.done.length})</p>
                <p className="mt-1 break-words">{actions.done.map((a) => a.name).join(', ') || 'No one yet.'}</p>
              </div>
              <div>
                <p className="font-medium text-gray-800 dark:text-gray-200">Still to do ({actions.pending.length})</p>
                <p className="mt-1 break-words">{actions.pending.join(', ') || 'Everyone has.'}</p>
              </div>
            </div>
          )}
        </div>
      )}

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
