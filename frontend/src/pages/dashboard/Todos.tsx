import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Field, FormError } from '../../components/ui/Field'
import { useToast } from '../../components/ui/Toast'
import { useAuth } from '../../auth/AuthContext'
import { api, ApiError } from '../../services/api'
import { formatDateOnly, todayInManilaIso } from '../../utils/dates'

type Priority = 'low' | 'normal' | 'urgent'

interface Comment {
  id: string
  authorId: string
  authorName: string
  body: string
  createdAt: string
}

interface Todo {
  id: string
  employeeId: string
  employeeName: string
  title: string
  description: string | null
  dueDate: string | null
  link: string | null
  status: 'open' | 'done'
  priority: Priority
  completedAt: string | null
  completedByName: string | null
  assignedById: string
  assignedByName: string | null
  createdAt: string
  comments: Comment[]
}

interface Person {
  id: string
  name: string
}

const PRIORITY_LABEL: Record<Priority, string> = { low: 'Low', normal: 'Normal', urgent: 'Urgent' }
const PRIORITY_RANK: Record<Priority, number> = { urgent: 0, normal: 1, low: 2 }

const whenFmt = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' })

// Open tasks first by priority, then soonest due date (undated last).
function byUrgency(a: Todo, b: Todo): number {
  const p = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
  if (p !== 0) return p
  if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate)
  if (a.dueDate) return -1
  if (b.dueDate) return 1
  return b.createdAt.localeCompare(a.createdAt)
}

function PriorityBadge({ priority }: { priority: Priority }) {
  if (priority === 'normal') return null
  return <Badge tone={priority === 'urgent' ? 'red' : 'gray'}>{PRIORITY_LABEL[priority]}</Badge>
}

function isOverdue(t: Todo, today: string): boolean {
  return t.status === 'open' && t.dueDate !== null && t.dueDate.slice(0, 10) < today
}

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86_400_000)
}

// Overdue ones first, then by priority and due date.
function byOverdueThenUrgency(today: string) {
  return (a: Todo, b: Todo) => Number(isOverdue(b, today)) - Number(isOverdue(a, today)) || byUrgency(a, b)
}

// The one filter both tabs share: what is still to do, or what is finished.
function StatusToggle({ value, onChange, openCount, doneCount }: { value: 'open' | 'done'; onChange: (v: 'open' | 'done') => void; openCount: number; doneCount: number }) {
  return (
    <div role="group" aria-label="Show" className="inline-flex overflow-hidden rounded-lg border border-black/10 text-xs font-medium dark:border-white/15">
      {([['open', `Open (${openCount})`], ['done', `Completed (${doneCount})`]] as const).map(([key, label]) => (
        <button
          key={key}
          type="button"
          aria-pressed={value === key}
          onClick={() => onChange(key)}
          className={`px-3 py-1.5 ${value === key ? 'bg-brand-500/15 text-gray-900 dark:text-gray-100' : 'text-gray-600 hover:bg-black/5 dark:text-gray-400 dark:hover:bg-white/10'}`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

// The comment thread under a to-do: read, and add a line. Whether it is open is up to the list, so only one thread is open at a time.
function CommentThread({ todo, onChanged }: { todo: Todo; onChanged: () => void }) {
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const toast = useToast()

  async function send(e: FormEvent) {
    e.preventDefault()
    if (!body.trim()) return
    setBusy(true)
    try {
      await api.post(`/hr/todos/${todo.id}?action=comment`, { body })
      setBody('')
      onChanged()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not add the comment')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-2 max-h-48 space-y-2 overflow-y-auto pl-8">
      {todo.comments.map((c) => (
        <p key={c.id} className="rounded-md bg-black/[0.04] px-3 py-1.5 text-xs text-gray-700 dark:bg-white/[0.06] dark:text-gray-300">
          <span className="font-semibold text-gray-900 dark:text-gray-100">{c.authorName}</span>
          <span className="text-gray-500 dark:text-gray-400"> · {whenFmt.format(new Date(c.createdAt))}</span>
          <span className="block whitespace-pre-line">{c.body}</span>
        </p>
      ))}
      <form onSubmit={send} className="flex gap-2">
        <input value={body} onChange={(e) => setBody(e.target.value)} maxLength={1000} placeholder="Write an update…" className="field !py-1.5 text-xs" />
        <Button type="submit" size="sm" disabled={busy || !body.trim()}>
          Send
        </Button>
      </form>
    </div>
  )
}

const iconBtn =
  'grid h-8 w-8 shrink-0 place-items-center rounded-lg text-gray-500 hover:bg-black/5 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-gray-100'

// The "⋯" menu: the things a row offers that you rarely need (open its link, delete it).
function RowMenu({ title, link, onDelete }: { title: string; link: string | null; onDelete: (() => void) | null }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', away)
    return () => document.removeEventListener('mousedown', away)
  }, [open])
  if (!link && !onDelete) return null
  const item = 'block w-full px-3 py-2 text-left text-xs font-medium hover:bg-black/5 dark:hover:bg-white/10'
  return (
    <div ref={ref} className="relative shrink-0">
      <button type="button" aria-label={`More for ${title}`} aria-expanded={open} onClick={() => setOpen((o) => !o)} className={iconBtn}>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
          <circle cx="5" cy="12" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="19" cy="12" r="1.8" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 z-10 mt-1 w-32 overflow-hidden rounded-lg border border-black/10 bg-white py-1 shadow-lg dark:border-white/15 dark:bg-[#10281c]">
          {link && (
            <a href={link} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)} className={`${item} text-brand-600 dark:text-brand-400`}>
              Open link ↗
            </a>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                onDelete()
              }}
              className={`${item} text-red-600 dark:text-red-400`}
            >
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function TodoRow({
  todo,
  today,
  canDelete,
  showAssignee,
  commentsOpen,
  onToggleComments,
  onChanged,
}: {
  todo: Todo
  today: string
  canDelete: boolean
  showAssignee: boolean
  commentsOpen: boolean
  onToggleComments: () => void
  onChanged: () => void
}) {
  const toast = useToast()
  const [expanded, setExpanded] = useState(false)
  const done = todo.status === 'done'
  const overdue = isOverdue(todo, today)
  const count = todo.comments.length

  async function setStatus(status: 'open' | 'done') {
    try {
      await api.put(`/hr/todos/${todo.id}`, { status })
      onChanged()
      if (status === 'done') {
        // Undo instead of a confirmation: faster, and forgiving of a misclick.
        toast.success(`Marked done: ${todo.title}`, {
          label: 'Undo',
          onClick: () => {
            void api
              .put(`/hr/todos/${todo.id}`, { status: 'open' })
              .then(onChanged)
              .catch(() => toast.error('Could not undo. Reopen it from the Completed list.'))
          },
        })
      } else {
        toast.info(`Reopened: ${todo.title}`)
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not update the to-do')
    }
  }

  async function remove() {
    if (!window.confirm(`Delete "${todo.title}"${showAssignee ? ` (for ${todo.employeeName})` : ''}? It will be hidden for everyone.`)) return
    try {
      await api.delete(`/hr/todos/${todo.id}`)
      onChanged()
      toast.success('To-do deleted')
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not delete the to-do')
    }
  }

  const lateDays = overdue && todo.dueDate ? daysBetween(todo.dueDate.slice(0, 10), today) : 0

  return (
    <li className="py-2.5">
      <div className="flex items-start gap-1">
        {/* A padded label so the checkbox is an easy target on a phone. */}
        <label className="-m-0.5 grid h-9 w-9 shrink-0 cursor-pointer place-items-center">
          <input
            type="checkbox"
            aria-label={done ? `Reopen "${todo.title}"` : `Mark "${todo.title}" as done`}
            checked={done}
            onChange={() => setStatus(done ? 'open' : 'done')}
            className="h-4 w-4"
          />
        </label>
        <div className="min-w-0 flex-1 pt-1.5">
          <div className="flex items-start justify-between gap-2">
            <span className={`min-w-0 break-words text-sm ${done ? 'text-gray-400 line-through' : 'font-medium text-gray-900 dark:text-gray-100'}`}>{todo.title}</span>
            <span className="flex shrink-0 items-center gap-1.5">
              {showAssignee && <Badge tone="blue">{todo.employeeName}</Badge>}
              <PriorityBadge priority={todo.priority} />
            </span>
          </div>
          {todo.description && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              className={`mt-0.5 block w-full text-left text-xs ${expanded ? 'whitespace-pre-line' : 'line-clamp-1'} ${done ? 'text-gray-400' : 'text-gray-600 dark:text-gray-400'}`}
            >
              {todo.description}
            </button>
          )}
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            {[
              !showAssignee && todo.assignedByName ? `from ${todo.assignedByName}` : null,
              done && todo.completedAt ? `Done ${whenFmt.format(new Date(todo.completedAt))}${todo.completedByName ? ` by ${todo.completedByName}` : ''}` : null,
              todo.dueDate && !overdue ? `Due ${formatDateOnly(todo.dueDate)}` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
            {overdue && todo.dueDate && (
              <span className="font-semibold text-red-600 dark:text-red-400">
                {todo.assignedByName && !showAssignee ? ' · ' : ''}
                {formatDateOnly(todo.dueDate)} · {lateDays === 1 ? '1 day late' : `${lateDays} days late`}
              </span>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={onToggleComments}
          aria-expanded={commentsOpen}
          aria-label={count > 0 ? `Comments (${count})` : 'Add a comment'}
          className={`${iconBtn} w-auto gap-1 px-1.5 text-xs ${commentsOpen ? 'bg-black/5 dark:bg-white/10' : ''}`}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />
          </svg>
          {count > 0 && <span className="tabular-nums">{count}</span>}
        </button>
        <RowMenu title={todo.title} link={todo.link} onDelete={canDelete ? remove : null} />
      </div>
      {commentsOpen && <CommentThread todo={todo} onChanged={onChanged} />}
    </li>
  )
}

function EmptyNote({ children }: { children: string }) {
  return <p className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">{children}</p>
}

interface TodoPage {
  items: Todo[]
  hasMore: boolean
}

interface TodoSummary {
  open: number
  done: number
}

const OPEN_PAGE = 100
const DONE_PAGE = 20

// One list of to-dos (mine, or the ones I assigned) as the server hands it over: the counts, plus one page of the chosen status.
// Finished ones come 20 at a time ("Show older") so a list that has grown over a year never has to be loaded whole.
function useTodoList(path: string, status: 'open' | 'done', reloadKey = 0) {
  const [items, setItems] = useState<Todo[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [counts, setCounts] = useState<TodoSummary>({ open: 0, done: 0 })
  const [loadingMore, setLoadingMore] = useState(false)
  const join = path.includes('?') ? '&' : '?'
  const pageSize = status === 'open' ? OPEN_PAGE : DONE_PAGE

  const load = useCallback(() => {
    api
      .get<TodoSummary>(`${path}${join}summary=1`)
      .then(setCounts)
      .catch(() => undefined)
    api
      .get<TodoPage>(`${path}${join}status=${status}&limit=${pageSize}`)
      .then((p) => {
        setItems(p.items)
        setHasMore(p.hasMore)
      })
      .catch(() => setItems([]))
  }, [path, join, status, pageSize])
  // Switching list or status starts from an empty page rather than showing the other one's rows while the new ones load.
  useEffect(() => {
    setItems([])
    setHasMore(false)
  }, [path, status])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [load, reloadKey])

  function loadMore() {
    setLoadingMore(true)
    api
      .get<TodoPage>(`${path}${join}status=${status}&limit=${pageSize}&offset=${items.length}`)
      .then((p) => {
        setItems((prev) => [...prev, ...p.items])
        setHasMore(p.hasMore)
      })
      .catch(() => undefined)
      .finally(() => setLoadingMore(false))
  }

  return { items, hasMore, counts, load, loadMore, loadingMore }
}

function ShowMore({ onClick, busy }: { onClick: () => void; busy: boolean }) {
  return (
    <div className="pt-2 text-center">
      <button type="button" onClick={onClick} disabled={busy} className="text-xs font-semibold text-brand-600 hover:underline disabled:opacity-60 dark:text-brand-400">
        {busy ? 'Loading…' : 'Show older'}
      </button>
    </div>
  )
}

// The signed-in employee's own to-dos: late ones first, then by urgency; finished ones under "Completed".
function MyTodosBody() {
  const { user } = useAuth()
  const [filter, setFilter] = useState<'open' | 'done'>('open')
  const [commentsOn, setCommentsOn] = useState<string | null>(null)
  const { items, hasMore, counts, load, loadMore, loadingMore } = useTodoList('/hr/todos', filter)

  const today = todayInManilaIso()
  const shown = useMemo(() => (filter === 'open' ? [...items].sort(byOverdueThenUrgency(today)) : items), [items, filter, today])

  return (
    <>
      <div className="mb-1">
        <StatusToggle value={filter} onChange={setFilter} openCount={counts.open} doneCount={counts.done} />
      </div>
      {shown.length === 0 ? (
        <EmptyNote>{filter === 'open' ? 'No open to-dos. You are all caught up.' : 'Nothing completed yet.'}</EmptyNote>
      ) : (
        <ul className="divide-y divide-black/5 dark:divide-white/10">
          {shown.map((t) => (
            <TodoRow
              key={t.id}
              todo={t}
              today={today}
              canDelete={t.assignedById === user?.id}
              showAssignee={false}
              commentsOpen={commentsOn === t.id}
              onToggleComments={() => setCommentsOn((c) => (c === t.id ? null : t.id))}
              onChanged={load}
            />
          ))}
        </ul>
      )}
      {hasMore && <ShowMore onClick={loadMore} busy={loadingMore} />}
    </>
  )
}

// To-dos I assigned to other people: who has done them and who has not.
// HR/Admin can switch to everyone's, to clear out entries made in error.
function AssignedBody({ isHr, reloadKey }: { isHr: boolean; reloadKey: number }) {
  const [scope, setScope] = useState<'mine' | 'all'>('mine')
  const [filter, setFilter] = useState<'open' | 'done'>('open')
  const [commentsOn, setCommentsOn] = useState<string | null>(null)
  const { items, hasMore, counts, load, loadMore, loadingMore } = useTodoList(`/hr/todos?assigned=${scope === 'all' ? 'all' : '1'}`, filter, reloadKey)

  const today = todayInManilaIso()
  const shown = useMemo(() => (filter === 'open' ? [...items].sort(byOverdueThenUrgency(today)) : items), [items, filter, today])

  return (
    <>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <StatusToggle value={filter} onChange={setFilter} openCount={counts.open} doneCount={counts.done} />
        {isHr && (
          <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
            <input type="checkbox" checked={scope === 'all'} onChange={(e) => setScope(e.target.checked ? 'all' : 'mine')} />
            Show everyone's
          </label>
        )}
      </div>
      {shown.length === 0 ? (
        <EmptyNote>{filter === 'open' ? 'Nothing you assigned is waiting.' : 'Nothing you assigned has been completed yet.'}</EmptyNote>
      ) : (
        <ul className="divide-y divide-black/5 dark:divide-white/10">
          {shown.map((t) => (
            <TodoRow
              key={t.id}
              todo={t}
              today={today}
              canDelete
              showAssignee
              commentsOpen={commentsOn === t.id}
              onToggleComments={() => setCommentsOn((c) => (c === t.id ? null : t.id))}
              onChanged={load}
            />
          ))}
        </ul>
      )}
      {hasMore && <ShowMore onClick={loadMore} busy={loadingMore} />}
    </>
  )
}

// The to-do panel on the dashboard: My to-dos, and (for people who assign work) Assigned by me, as two tabs of one card, so the
// panel is the same shape as its neighbours. The list scrolls inside the card.
export function TodosPanel({ canAssign, isHr, reloadKey, onAssign }: { canAssign: boolean; isHr: boolean; reloadKey: number; onAssign: () => void }) {
  const [tab, setTab] = useState<'mine' | 'assigned'>('mine')
  return (
    <section id="my-todos" className="flex h-full scroll-mt-4 flex-col rounded-xl border border-black/5 bg-white/80 shadow-sm dark:border-white/10 dark:bg-white/[0.035]">
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-black/5 px-4 py-3 dark:border-white/10">
        {canAssign ? (
          <div role="tablist" aria-label="To-dos" className="inline-flex overflow-hidden rounded-lg border border-black/10 dark:border-white/15">
            {([['mine', 'My to-dos'], ['assigned', 'Assigned by me']] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                onClick={() => setTab(key)}
                className={`px-3 py-1.5 text-xs font-medium ${tab === key ? 'bg-brand-600 text-white' : 'text-gray-600 hover:bg-black/5 dark:text-gray-300 dark:hover:bg-white/10'}`}
              >
                {label}
              </button>
            ))}
          </div>
        ) : (
          <h2 className="text-[15px] font-semibold text-gray-900 dark:text-gray-100">My to-dos</h2>
        )}
        {canAssign && (
          <Button variant="primary" size="sm" onClick={onAssign}>
            + Assign
          </Button>
        )}
      </header>
      <div className="max-h-[26rem] min-h-0 flex-1 overflow-y-auto px-4 py-3">{tab === 'mine' ? <MyTodosBody key={reloadKey} /> : <AssignedBody isHr={isHr} reloadKey={reloadKey} />}</div>
    </section>
  )
}

// HR/Admin assign to anyone (or everyone); a supervisor assigns to their
// direct reports. The API enforces this, the form just offers who it can.
export function AssignTodo({ isHr, onAssigned, onClose }: { isHr: boolean; onAssigned?: () => void; onClose: () => void }) {
  const [people, setPeople] = useState<Person[] | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [link, setLink] = useState('')
  const [priority, setPriority] = useState<Priority>('normal')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const toast = useToast()

  useEffect(() => {
    const path = isHr ? '/employees' : '/hr/performance?kind=supervisees'
    api
      .get<Person[]>(path)
      .then((rows) => setPeople(rows.map((r) => ({ id: r.id, name: r.name }))))
      .catch(() => setPeople([]))
  }, [isHr])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const { assigned } = await api.post<{ assigned: number }>('/hr/todos', {
        employeeIds: selected,
        title,
        description: description.trim() || null,
        dueDate: dueDate || null,
        link: link.trim() || null,
        priority,
      })
      toast.success(`Assigned "${title}" to ${assigned} ${assigned === 1 ? 'person' : 'people'}`)
      setTitle('')
      setDescription('')
      setDueDate('')
      setLink('')
      setPriority('normal')
      setSelected([])
      onAssigned?.()
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not assign the to-do'
      setError(message)
      toast.error(message)
    } finally {
      setBusy(false)
    }
  }

  const list = people ?? []
  const allSelected = list.length > 0 && selected.length === list.length

  return (
    <form onSubmit={submit} className="flex max-h-[calc(100vh-2rem)] flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-black/10 px-5 py-3 dark:border-white/10">
        <div>
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Assign a to-do</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">{isHr ? 'To anyone' : 'To your direct reports'}</p>
        </div>
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
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
        <Field label="Task">
          <input required autoFocus value={title} onChange={(e) => setTitle(e.target.value)} className="field" placeholder="e.g. Sign employee handbook" />
        </Field>
        <Field label="Description (optional)">
          <textarea
            rows={2}
            maxLength={2000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="field"
            placeholder="Add details, steps or context for the task"
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Due date (optional)">
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="field" />
          </Field>
          <Field label="Priority">
            <select value={priority} onChange={(e) => setPriority(e.target.value as Priority)} className="field">
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="urgent">Urgent</option>
            </select>
          </Field>
          <Field label="Link (optional)">
            <input type="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…" className="field" />
          </Field>
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
            <span>Assign to</span>
            <label className="flex items-center gap-2">
              <input type="checkbox" disabled={list.length === 0} checked={allSelected} onChange={(e) => setSelected(e.target.checked ? list.map((p) => p.id) : [])} />
              Everyone ({list.length})
            </label>
          </div>
          <ul className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-black/10 p-2 text-sm dark:border-white/10">
            {people === null && <li className="text-gray-500 dark:text-gray-400">Loading…</li>}
            {people !== null && list.length === 0 && <li className="text-gray-500 dark:text-gray-400">You have no one to assign to yet.</li>}
            {list.map((p) => (
              <li key={p.id}>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selected.includes(p.id)}
                    onChange={(e) => setSelected((prev) => (e.target.checked ? [...prev, p.id] : prev.filter((id) => id !== p.id)))}
                  />
                  {p.name}
                </label>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="border-t border-black/10 px-5 py-3 dark:border-white/10">
        <FormError message={error} />
        <div className="flex justify-end gap-2">
          <Button type="button" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={busy || selected.length === 0}>
            {busy ? 'Assigning…' : 'Assign'}
          </Button>
        </div>
      </div>
    </form>
  )
}
