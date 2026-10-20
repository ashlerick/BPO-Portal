import { FormattedText } from '../../components/ui/FormattedText'
import { ZONE_OPTIONS } from '../../components/ui/zones'
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { useAuth } from '../../auth/AuthContext'
import { EmptyState, ErrorState, LoadingState } from '../../components/AsyncState'
import { api, ApiError } from '../../services/api'
import { Card } from '../../components/ui/Card'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { PageHeader } from '../../components/ui/PageHeader'
import { Section, SectionStack } from '../../components/ui/Section'
import { AnnouncementEngagement } from './AnnouncementEngagement'
import { ANNOUNCEMENT_CATEGORIES, isExpired, type Announcement, type AnnouncementCategory } from './types'

const EMERGENCY = 'Emergency announcements'
const dateFormatter = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'Asia/Manila' })

function CreateForm({ onCreated, onClose }: { onCreated: (a: Announcement) => void; onClose: () => void }) {
  const { guardedAction } = useAuth()
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [category, setCategory] = useState<AnnouncementCategory>(ANNOUNCEMENT_CATEGORIES[0])
  const [expireOn, setExpireOn] = useState('')
  const [published, setPublished] = useState(true)
  const [highlighted, setHighlighted] = useState(false)
  // How long a highlight lasts: 3 days unless HR picks another, so nobody has to remember to remove it. 0 = until removed.
  const [highlightDays, setHighlightDays] = useState(3)
  // Asks everyone to do something by a date (a to-do for each person).
  const [needsAction, setNeedsAction] = useState(false)
  const [actionDueOn, setActionDueOn] = useState('')
  const [audience, setAudience] = useState<AudiencePick>({ mode: 'all', teamIds: [], employeeIds: [] })
  // The deadline's time of day (optional) and the zone it is in.
  const [actionDueTime, setActionDueTime] = useState('')
  const [actionDueZone, setActionDueZone] = useState<string>('Asia/Manila')
  // An event: day, time (optional), zone, place, and whether it is mandatory.
  const [isEvent, setIsEvent] = useState(false)
  const [eventDate, setEventDate] = useState('')
  const [eventTime, setEventTime] = useState('')
  const [eventZone, setEventZone] = useState<string>('Asia/Manila')
  const [eventPlace, setEventPlace] = useState('')
  const [eventMandatory, setEventMandatory] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (needsAction && audience.mode === 'some' && audience.teamIds.length + audience.employeeIds.length === 0) {
      setError('Choose at least one team or person for the action, or pick Everyone.')
      return
    }
    guardedAction(['hr', 'admin'], async () => {
      setError(null)
      setSubmitting(true)
      try {
        const created = await api.post<Announcement>('/announcements', {
          title,
          content,
          category,
          published,
          highlighted,
          ...(highlighted && { highlightDays: highlightDays || null }),
          ...(needsAction && {
            needsAction: true,
            actionDueOn,
            ...(actionDueTime && { actionDueTime, actionDueZone }),
            ...(audience.mode === 'some' && { actionAudience: { teamIds: audience.teamIds, employeeIds: audience.employeeIds } }),
          }),
          ...(isEvent && { isEvent: true, eventDate, eventPlace: eventPlace.trim() || null, eventMandatory, ...(eventTime && { eventTime, eventZone }) }),
          ...(expireOn && { expireAt: new Date(`${expireOn}T23:59:59+08:00`).toISOString() }),
        })
        onCreated(created)
        onClose()
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Could not create announcement')
      } finally {
        setSubmitting(false)
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex max-h-[calc(100vh-2rem)] flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-black/10 px-5 py-3 dark:border-white/10">
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">New announcement</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="grid h-8 w-8 place-items-center rounded-lg border border-black/10 text-gray-500 hover:border-brand-500 hover:text-gray-900 dark:border-white/15 dark:text-gray-400 dark:hover:text-gray-100"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-5 pb-4 pt-1">
        <p className={sectionLabel}>Message</p>
        <div className="space-y-1">
          <label htmlFor="ann-title" className="text-sm text-gray-600 dark:text-gray-400">
            Title
          </label>
          <input id="ann-title" required autoFocus value={title} onChange={(e) => setTitle(e.target.value)} className="field" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label htmlFor="ann-category" className="text-sm text-gray-600 dark:text-gray-400">
              Category
            </label>
            <select id="ann-category" value={category} onChange={(e) => setCategory(e.target.value as AnnouncementCategory)} className="field">
              {ANNOUNCEMENT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label htmlFor="ann-expire" className="text-sm text-gray-600 dark:text-gray-400">
              Expires on (optional)
            </label>
            <input id="ann-expire" type="date" value={expireOn} onChange={(e) => setExpireOn(e.target.value)} className="field" />
          </div>
        </div>
        <div className="space-y-1">
          <label htmlFor="ann-content" className="text-sm text-gray-600 dark:text-gray-400">
            Content
          </label>
          <textarea id="ann-content" required rows={4} value={content} onChange={(e) => setContent(e.target.value)} className="field" />
          <p className="text-xs text-gray-500 dark:text-gray-400">Line breaks are kept. Use **bold**, _italic_, and start a line with - for a list. Web links become links.</p>
        </div>

        <p className={sectionLabel}>When</p>
        <div role="group" aria-label="When to post" className="inline-flex overflow-hidden rounded-lg border border-black/10 dark:border-white/15">
          {[
            [true, 'Post now'],
            [false, 'Save as a draft'],
          ].map(([value, label]) => (
            <button
              key={String(value)}
              type="button"
              aria-pressed={published === value}
              onClick={() => setPublished(value as boolean)}
              className={`px-3.5 py-2 text-sm font-medium ${published === value ? 'bg-brand-600 text-white' : 'text-gray-600 hover:bg-black/5 dark:text-gray-300 dark:hover:bg-white/10'}`}
            >
              {label as string}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {published ? 'Everyone can see it and is notified.' : 'Only HR and Admin can see it. Nobody is notified until you press Publish now on it.'}
        </p>

        <p className={sectionLabel}>Extras</p>
        <Extra
          title="Highlight"
          text="Shows it first on this page and on everyone's BPO Time panel. It leaves a person's panel once they react to it."
          on={highlighted}
          onChange={setHighlighted}
        >
          <label className="flex flex-col text-gray-600 dark:text-gray-400">
            Highlight for
            <select value={highlightDays} onChange={(e) => setHighlightDays(Number(e.target.value))} className="field mt-1 sm:max-w-xs">
              <option value={1}>1 day</option>
              <option value={3}>3 days</option>
              <option value={7}>1 week</option>
              <option value={0}>until I remove it</option>
            </select>
          </label>
        </Extra>
        <Extra title="This is an event" text="Puts it on the Calendar and lets people say whether they are joining." on={isEvent} onChange={setIsEvent}>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col text-gray-600 dark:text-gray-400">
              Day
              <input type="date" required value={eventDate} onChange={(e) => setEventDate(e.target.value)} className="field mt-1" />
            </label>
            <label className="flex flex-col text-gray-600 dark:text-gray-400">
              Time (optional)
              <span className="mt-1 flex gap-2">
                <input type="time" value={eventTime} onChange={(e) => setEventTime(e.target.value)} className="field min-w-0 flex-1" />
                <select value={eventZone} onChange={(e) => setEventZone(e.target.value)} className="field !w-auto" aria-label="Zone of the event time">
                  {ZONE_OPTIONS.map((z) => (
                    <option key={z.value} value={z.value}>
                      {z.label}
                    </option>
                  ))}
                </select>
              </span>
            </label>
            <label className="flex flex-col text-gray-600 dark:text-gray-400 sm:col-span-2">
              Where (optional)
              <input value={eventPlace} onChange={(e) => setEventPlace(e.target.value)} placeholder="For example, JAE Philus Office" className="field mt-1" />
            </label>
            <label className="flex items-start gap-2 text-gray-700 dark:text-gray-300 sm:col-span-2">
              <input type="checkbox" className="mt-1" checked={eventMandatory} onChange={(e) => setEventMandatory(e.target.checked)} />
              <span>
                Mandatory
                <span className="block text-xs text-gray-500 dark:text-gray-400">
                  Everyone is expected. Pressing Got it counts as joining, and they can change it to "can't make it". Leave this off to ask
                  "Are you joining?" instead, with no default.
                </span>
              </span>
            </label>
            <p className="text-xs text-gray-500 dark:text-gray-400 sm:col-span-2">The event goes on the Calendar when you post, with its time in both Manila and California time.</p>
          </div>
        </Extra>
        <Extra title="Needs action" text="Gives each person a to-do for it, due on the date you set, so you can see who has done it." on={needsAction} onChange={setNeedsAction}>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col text-gray-600 dark:text-gray-400">
              Due on
              <input type="date" required value={actionDueOn} onChange={(e) => setActionDueOn(e.target.value)} className="field mt-1 !w-auto" />
            </label>
            <label className="flex flex-col text-gray-600 dark:text-gray-400">
              Time (optional)
              <span className="mt-1 flex gap-2">
                <input type="time" value={actionDueTime} onChange={(e) => setActionDueTime(e.target.value)} className="field !w-auto" aria-label="Deadline time (optional)" />
                {actionDueTime && (
                  <select value={actionDueZone} onChange={(e) => setActionDueZone(e.target.value)} className="field !w-auto" aria-label="Zone of the deadline time">
                    {ZONE_OPTIONS.map((z) => (
                      <option key={z.value} value={z.value}>
                        {z.label}
                      </option>
                    ))}
                  </select>
                )}
              </span>
            </label>
          </div>
          <ActionAudience value={audience} onChange={setAudience} />
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Finishing the to-do also counts as their "Got it". You can see who is done on the announcement, and change the due date there.
          </p>
        </Extra>
        {category === 'Emergency announcements' && (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            An emergency stays on everyone's BPO Time panel until they react or press Got it. It ends 24 hours after it is posted unless you set an end date above.
          </p>
        )}
      </div>

      <div className="border-t border-black/10 px-5 py-3 dark:border-white/10">
        {error && <p className="mb-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={submitting}>
            {submitting ? (published ? 'Posting…' : 'Saving…') : published ? 'Post announcement' : 'Save draft'}
          </Button>
        </div>
      </div>
    </form>
  )
}

const sectionLabel = 'pt-3 text-[11px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400'

// One extra option: a title, what it does, and a switch. Its settings open underneath only while it is on.
function Extra({ title, text, on, onChange, children }: { title: string; text: string; on: boolean; onChange: (on: boolean) => void; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-black/10 bg-black/[0.03] dark:border-white/10 dark:bg-white/[0.04]">
      <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} className="flex w-full items-start gap-3 px-3.5 py-2.5 text-left">
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-gray-900 dark:text-gray-100">{title}</span>
          <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">{text}</span>
        </span>
        <span aria-hidden className={`relative mt-0.5 h-5 w-9 flex-none rounded-full transition-colors ${on ? 'bg-brand-600' : 'bg-gray-300 dark:bg-white/20'}`}>
          <span className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${on ? 'translate-x-4' : ''}`} />
        </span>
      </button>
      {on && children && <div className="space-y-3 border-t border-black/10 px-3.5 py-3 text-sm dark:border-white/10">{children}</div>}
    </div>
  )
}

interface AudiencePick {
  mode: 'all' | 'some'
  teamIds: string[]
  employeeIds: string[]
}

// Who a "needs action" announcement is for: everyone, or chosen teams and people. The number of people it reaches is shown,
// so a mistake is visible before posting.
function ActionAudience({ value, onChange }: { value: AudiencePick; onChange: (v: AudiencePick) => void }) {
  const [teams, setTeams] = useState<{ id: string; name: string }[]>([])
  const [people, setPeople] = useState<{ id: string; name: string; teamId: string | null; team: string | null }[]>([])
  const [filter, setFilter] = useState('')

  useEffect(() => {
    if (value.mode !== 'some' || teams.length + people.length > 0) return
    api.get<{ teams: { id: string; name: string }[] }>('/directory').then((d) => setTeams(d.teams)).catch(() => undefined)
    api.get<{ id: string; name: string; teamId: string | null; team: string | null }[]>('/employees').then(setPeople).catch(() => undefined)
  }, [value.mode, teams.length, people.length])

  const reach = new Set(people.filter((p) => value.teamIds.includes(p.teamId ?? '') || value.employeeIds.includes(p.id)).map((p) => p.id)).size
  const shown = people.filter((p) => p.name.toLowerCase().includes(filter.trim().toLowerCase()))
  const flip = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id])

  return (
    <div className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="text-gray-500 dark:text-gray-400">Who is it for?</span>
        <label className="flex items-center gap-1.5">
          <input type="radio" name="ann-audience" checked={value.mode === 'all'} onChange={() => onChange({ ...value, mode: 'all' })} />
          Everyone
        </label>
        <label className="flex items-center gap-1.5">
          <input type="radio" name="ann-audience" checked={value.mode === 'some'} onChange={() => onChange({ ...value, mode: 'some' })} />
          Chosen teams or people
        </label>
      </div>
      {value.mode === 'some' && (
        <div className="space-y-2 rounded-md border border-black/10 p-3 dark:border-white/10">
          {teams.length > 0 && (
            <div>
              <p className="mb-1 text-xs text-gray-500 dark:text-gray-400">Teams</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {teams.map((t) => (
                  <label key={t.id} className="flex items-center gap-1.5">
                    <input type="checkbox" checked={value.teamIds.includes(t.id)} onChange={() => onChange({ ...value, teamIds: flip(value.teamIds, t.id) })} />
                    {t.name}
                  </label>
                ))}
              </div>
            </div>
          )}
          <div>
            <p className="mb-1 text-xs text-gray-500 dark:text-gray-400">People</p>
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search people…" className="field mb-1 max-w-xs" />
            <ul className="max-h-40 space-y-1 overflow-y-auto">
              {shown.map((p) => (
                <li key={p.id}>
                  <label className="flex items-center gap-1.5">
                    <input type="checkbox" checked={value.employeeIds.includes(p.id)} onChange={() => onChange({ ...value, employeeIds: flip(value.employeeIds, p.id) })} />
                    {p.name}
                    {p.team && <span className="text-gray-500 dark:text-gray-400"> · {p.team}</span>}
                  </label>
                </li>
              ))}
            </ul>
          </div>
          <p className={`text-xs ${reach === 0 ? 'text-amber-700 dark:text-amber-500' : 'text-brand-700 dark:text-brand-400'}`}>
            {reach === 0 ? 'Choose at least one team or person.' : `This goes to ${reach} ${reach === 1 ? 'person' : 'people'}.`}
          </p>
        </div>
      )}
    </div>
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
  // The row of lengths (1 day, 3 days, ...) that opens under the Highlight button.
  const [choosing, setChoosing] = useState(false)
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

  // Highlight it for a chosen time (null = until HR removes it), or take the highlight off. Highlighted announcements show
  // first here and on the BPO Time app, and end by themselves.
  function setHighlight(days: number | null) {
    guardedAction(['hr', 'admin'], async () => {
      setSaving(true)
      setError(null)
      try {
        const updated = await api.put<Announcement>(`/announcements/${announcement.id}`, { highlighted: true, highlightDays: days })
        onUpdated({ ...announcement, ...updated })
        setChoosing(false)
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Could not change the highlight')
      } finally {
        setSaving(false)
      }
    })
  }

  // A draft goes live: visible to everyone, and everyone is notified.
  function publishNow() {
    guardedAction(['hr', 'admin'], async () => {
      setSaving(true)
      setError(null)
      try {
        const updated = await api.put<Announcement>(`/announcements/${announcement.id}`, { published: true })
        onUpdated({ ...announcement, ...updated })
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Could not publish the announcement')
      } finally {
        setSaving(false)
      }
    })
  }

  function removeHighlight() {
    guardedAction(['hr', 'admin'], async () => {
      setSaving(true)
      setError(null)
      try {
        const updated = await api.put<Announcement>(`/announcements/${announcement.id}`, { highlighted: false })
        onUpdated({ ...announcement, ...updated })
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Could not remove the highlight')
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
      <Card className={announcement.featured ? '!border-gold-500/60 ring-1 ring-gold-500/30' : ''}>
        <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
          <h2 className="min-w-0 break-words font-medium text-gray-900 dark:text-gray-100">
            {announcement.featured && (
              <span className="mr-2 inline-flex items-center gap-1 rounded-full bg-gold-500/15 px-2 py-0.5 align-middle text-xs font-semibold text-gold-600 dark:text-gold-400">
                ★ {announcement.category === EMERGENCY ? 'Always highlighted' : 'Highlighted'}
                {canManage && announcement.highlightUntil && announcement.category !== EMERGENCY
                  ? ` until ${dateFormatter.format(new Date(announcement.highlightUntil))}`
                  : ''}
              </span>
            )}
            {announcement.title}
          </h2>
          {announcement.publishAt && (
            <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400">
              {dateFormatter.format(new Date(announcement.publishAt))}
            </span>
          )}
        </div>
        <FormattedText text={announcement.content} clamp className="mt-1 text-sm text-gray-600 dark:text-gray-400" />
        <AnnouncementEngagement announcement={announcement} canManage={canManage} onChange={onUpdated} />
        {!announcement.published && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge tone="amber">Draft</Badge>
            <span className="text-xs text-gray-500 dark:text-gray-400">Only HR and Admin can see this. Nobody has been told about it yet.</span>
            {canManage && (
              <Button size="sm" variant="primary" onClick={publishNow} disabled={saving}>
                Publish now
              </Button>
            )}
          </div>
        )}
        {canManage && (
          <div className="mt-3 flex gap-2">
            <Button size="sm" onClick={() => setEditing(true)}>
              Edit
            </Button>
            {announcement.category !== EMERGENCY && (
              <>
                <Button size="sm" onClick={() => setChoosing((v) => !v)} disabled={saving} aria-expanded={choosing}>
                  {announcement.highlighted ? 'Change highlight' : 'Highlight'}
                </Button>
                {announcement.highlighted && (
                  <Button size="sm" onClick={removeHighlight} disabled={saving}>
                    Remove highlight
                  </Button>
                )}
              </>
            )}
            <Button size="sm" variant="danger" onClick={remove} disabled={saving}>
              Delete
            </Button>
          </div>
        )}
        {canManage && choosing && announcement.category !== EMERGENCY && (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <span>Highlight for</span>
            {[
              { label: '1 day', days: 1 },
              { label: '3 days', days: 3 },
              { label: '1 week', days: 7 },
              { label: 'Until I remove it', days: null },
            ].map((o) => (
              <Button key={o.label} size="sm" onClick={() => setHighlight(o.days)} disabled={saving}>
                {o.label}
              </Button>
            ))}
            <Button size="sm" onClick={() => setChoosing(false)} disabled={saving}>
              Cancel
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
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    api
      .get<Announcement[]>('/announcements')
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Something went wrong'))
      .finally(() => setLoading(false))
  }, [])

  const history = data?.filter((a) => isExpired(a)) ?? []

  function renderItem(announcement: Announcement) {
    return (
      <AnnouncementItem
        key={announcement.id}
        announcement={announcement}
        canManage={canManage}
        onUpdated={(updated) => setData((prev) => prev?.map((a) => (a.id === updated.id ? updated : a)) ?? null)}
        onDeleted={(id) => setData((prev) => prev?.filter((a) => a.id !== id) ?? null)}
      />
    )
  }

  return (
    <div>
      <PageHeader
        title="Announcements"
        actions={
          canManage ? (
            <Button variant="primary" onClick={() => setCreating(true)}>
              + New announcement
            </Button>
          ) : undefined
        }
      />

      {canManage && creating && (
        <Modal label="New announcement" onClose={() => setCreating(false)} className="max-w-2xl overflow-hidden !p-0">
          <CreateForm onCreated={(a) => setData((prev) => (prev ? [a, ...prev] : [a]))} onClose={() => setCreating(false)} />
        </Modal>
      )}

      {loading && <LoadingState />}
      {error && <ErrorState message={error} />}
      {data && data.length === 0 && <EmptyState label="No announcements yet." />}

      {data && data.length > 0 && (
        <SectionStack>
          {ANNOUNCEMENT_CATEGORIES.map((category) => {
            const items = data
              .filter((a) => a.category === category && !isExpired(a))
              .sort((a, b) => Number(!!b.featured) - Number(!!a.featured))
            return (
              <Section
                key={category}
                id={`announcements.${category.toLowerCase().replace(/\s+/g, '-')}`}
                title={category}
                hint={`${items.length} active`}
                defaultOpen={items.length > 0}
              >
                {items.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">Nothing posted here.</p>
                ) : (
                  <ul className="space-y-3">{items.map(renderItem)}</ul>
                )}
              </Section>
            )
          })}

          <Section
            id="announcements.history"
            title="Announcement history"
            hint={`${history.length} expired`}
          >
            {history.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">No expired announcements.</p>
            ) : (
              <ul className="space-y-3">{history.map(renderItem)}</ul>
            )}
          </Section>
        </SectionStack>
      )}
    </div>
  )
}
