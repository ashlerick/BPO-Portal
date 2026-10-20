import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
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

// The comment thread under a to-do: read, and add a line.
function Comments({ todo, onChanged }: { todo: Todo; onChanged: () => void }) {
  const [open, setOpen] = useState(false)
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  const count = todo.comments.length

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
    <div className="mt-1 pl-6">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
      >
        {open ? 'Hide comments' : count > 0 ? `Comments (${count})` : 'Add a comment'}
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          {todo.comments.map((c) => (
            <p key={c.id} className="rounded-md bg-black/[0.04] px-3 py-1.5 text-xs text-gray-700 dark:bg-white/[0.06] dark:text-gray-300">
              <span className="font-semibold text-gray-900 dark:text-gray-100">{c.authorName}</span>
              <span className="text-gray-500 dark:text-gray-400"> · {whenFmt.format(new Date(c.createdAt))}</span>
              <span className="block whitespace-pre-line">{c.body}</span>
            </p>
          ))}
          <form onSubmit={send} className="flex gap-2">
            <input
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={1000}
              placeholder="Write an update…"
              className="field !py-1.5 text-xs"
            />
            <Button type="submit" size="sm" disabled={busy || !body.trim()}>
              Send
            </Button>
          </form>
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
  onChanged,
}: {
  todo: Todo
  today: string
  canDelete: boolean
  showAssignee: boolean
  onChanged: () => void
}) {
  const toast = useToast()
  const done = todo.status === 'done'
  const overdue = !done && todo.dueDate !== null && todo.dueDate.slice(0, 10) < today

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

  return (
    <li className="py-2.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          {done ? (
            <button
              type="button"
              onClick={() => setStatus('open')}
              className="mt-0.5 shrink-0 rounded border border-black/15 px-1.5 py-0.5 text-[11px] font-medium text-gray-600 hover:bg-black/5 dark:border-white/20 dark:text-gray-300 dark:hover:bg-white/10"
            >
              Reopen
            </button>
          ) : (
            <input
              type="checkbox"
              aria-label={`Mark "${todo.title}" as done`}
              checked={false}
              onChange={() => setStatus('done')}
              className="mt-1"
            />
          )}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className={done ? 'text-gray-400 line-through' : 'font-medium text-gray-900 dark:text-gray-100'}>{todo.title}</span>
              <PriorityBadge priority={todo.priority} />
              {showAssignee && <Badge tone="blue">{todo.employeeName}</Badge>}
            </div>
            {todo.description && (
              <p className={`mt-0.5 whitespace-pre-line text-xs ${done ? 'text-gray-400' : 'text-gray-600 dark:text-gray-400'}`}>
                {todo.description}
              </p>
            )}
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              {todo.assignedByName && !showAssignee && <>Assigned by {todo.assignedByName} · </>}
              {done && todo.completedAt && (
                <>
                  Done {whenFmt.format(new Date(todo.completedAt))}
                  {todo.completedByName ? ` by ${todo.completedByName}` : ''}
                </>
              )}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
          {todo.dueDate && (
            <span className={overdue ? 'font-semibold text-red-600 dark:text-red-400' : undefined}>
              {overdue ? 'Overdue · ' : 'Due '}
              {formatDateOnly(todo.dueDate)}
            </span>
          )}
          {todo.link && (
            <a href={todo.link} target="_blank" rel="noopener noreferrer" className="font-medium text-brand-600 dark:text-brand-400">
              Open ↗
            </a>
          )}
          {canDelete && (
            <button
              type="button"
              onClick={remove}
              className="font-medium text-red-600 hover:underline dark:text-red-400"
              aria-label={`Delete ${todo.title}`}
            >
              Delete
            </button>
          )}
        </div>
      </div>
      <Comments todo={todo} onChanged={onChanged} />
    </li>
  )
}

type Filter = 'open' | 'overdue' | 'done'

// The signed-in employee's own to-dos: open ones by urgency, overdue
// called out, finished ones tucked under "Completed".
function MyTodosBody() {
  const { user } = useAuth()
  const [todos, setTodos] = useState<Todo[]>([])
  const [filter, setFilter] = useState<Filter>('open')

  const load = useCallback(() => {
    api
      .get<Todo[]>('/hr/todos')
      .then(setTodos)
      .catch(() => setTodos([]))
  }, [])
  useEffect(load, [load])

  const today = todayInManilaIso()
  const open = useMemo(() => todos.filter((t) => t.status === 'open').sort(byUrgency), [todos])
  const overdue = open.filter((t) => t.dueDate !== null && t.dueDate.slice(0, 10) < today)
  const completed = useMemo(
    () => todos.filter((t) => t.status === 'done').sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? '')),
    [todos],
  )
  const shown = filter === 'open' ? open : filter === 'overdue' ? overdue : completed

  const chip = (key: Filter, label: string, count: number) => (
    <button
      key={key}
      type="button"
      onClick={() => setFilter(key)}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
        filter === key
          ? 'border-brand-500 bg-brand-500/15 text-gray-900 dark:text-gray-100'
          : 'border-black/10 text-gray-600 hover:bg-black/5 dark:border-white/15 dark:text-gray-400 dark:hover:bg-white/10'
      }`}
    >
      {label} <span className={key === 'overdue' && count > 0 ? 'text-red-600 dark:text-red-400' : undefined}>({count})</span>
    </button>
  )

  return (
    <>
      <div className="mb-2 flex flex-wrap gap-2">
        {chip('open', 'Open', open.length)}
        {chip('overdue', 'Overdue', overdue.length)}
        {chip('done', 'Completed', completed.length)}
      </div>
      {shown.length === 0 ? (
        <p className="py-2 text-sm text-gray-500 dark:text-gray-400">
          {filter === 'open' ? 'No open to-dos. You are all caught up.' : filter === 'overdue' ? 'Nothing overdue.' : 'Nothing completed yet.'}
        </p>
      ) : (
        <ul className="divide-y divide-black/5 text-sm dark:divide-white/10">
          {shown.map((t) => (
            <TodoRow
              key={t.id}
              todo={t}
              today={today}
              canDelete={t.assignedById === user?.id}
              showAssignee={false}
              onChanged={load}
            />
          ))}
        </ul>
      )}
    </>
  )
}

// To-dos I assigned to other people: who has done them and who has not.
// HR/Admin can switch to everyone's, to clear out entries made in error.
function AssignedBody({ isHr, reloadKey }: { isHr: boolean; reloadKey: number }) {
  const [todos, setTodos] = useState<Todo[]>([])
  const [scope, setScope] = useState<'mine' | 'all'>('mine')
  const [filter, setFilter] = useState<'open' | 'done'>('open')

  const load = useCallback(() => {
    api
      .get<Todo[]>(`/hr/todos?assigned=${scope === 'all' ? 'all' : '1'}`)
      .then(setTodos)
      .catch(() => setTodos([]))
  }, [scope])
  useEffect(load, [load, reloadKey])

  const today = todayInManilaIso()
  const open = todos.filter((t) => t.status === 'open').sort(byUrgency)
  const done = todos.filter((t) => t.status === 'done')
  const shown = filter === 'open' ? open : done

  return (
    <>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          {(['open', 'done'] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setFilter(k)}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${
                filter === k
                  ? 'border-brand-500 bg-brand-500/15 text-gray-900 dark:text-gray-100'
                  : 'border-black/10 text-gray-600 dark:border-white/15 dark:text-gray-400'
              }`}
            >
              {k === 'open' ? `Open (${open.length})` : `Done (${done.length})`}
            </button>
          ))}
        </div>
        {isHr && (
          <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
            <input type="checkbox" checked={scope === 'all'} onChange={(e) => setScope(e.target.checked ? 'all' : 'mine')} />
            Show everyone's to-dos
          </label>
        )}
      </div>
      {shown.length === 0 ? (
        <p className="py-2 text-sm text-gray-500 dark:text-gray-400">
          {filter === 'open' ? 'Nothing you assigned is waiting.' : 'Nothing you assigned has been completed yet.'}
        </p>
      ) : (
        <ul className="divide-y divide-black/5 text-sm dark:divide-white/10">
          {shown.map((t) => (
            <TodoRow key={t.id} todo={t} today={today} canDelete showAssignee onChanged={load} />
          ))}
        </ul>
      )}
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
            + Assign a to-do
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
