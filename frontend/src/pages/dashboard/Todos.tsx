import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Field, FormError } from '../../components/ui/Field'
import { Section } from '../../components/ui/Section'
import { api, ApiError } from '../../services/api'
import { formatDateOnly, todayInManilaIso } from '../../utils/dates'

interface Todo {
  id: string
  title: string
  dueDate: string | null
  link: string | null
  status: 'open' | 'done'
}

interface Person {
  id: string
  name: string
}

// The signed-in employee's own to-dos (the old sheet's "To Do's"): task,
// due date, optional linked document, and a done toggle.
export function MyTodos() {
  const [todos, setTodos] = useState<Todo[]>([])
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    api
      .get<Todo[]>('/hr/todos')
      .then(setTodos)
      .catch(() => setTodos([]))
  }, [])
  useEffect(load, [load])

  async function toggle(t: Todo) {
    setError(null)
    try {
      await api.put(`/hr/todos/${t.id}`, { status: t.status === 'done' ? 'open' : 'done' })
      load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update the to-do')
    }
  }

  const open = todos.filter((t) => t.status === 'open')
  const today = todayInManilaIso()

  return (
    <Section
      id="dashboard.todos"
      title="To-do list"
      hint={open.length === 0 ? 'Nothing assigned' : `${open.length} open`}
      aside={open.length > 0 ? <Badge tone="amber">{open.length}</Badge> : undefined}
      defaultOpen
    >
      {todos.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">No to-dos assigned to you.</p>
      ) : (
        <ul className="divide-y divide-black/5 text-sm dark:divide-white/10">
          {todos.map((t) => {
            const overdue = t.status === 'open' && t.dueDate !== null && t.dueDate.slice(0, 10) < today
            return (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={t.status === 'done'} onChange={() => toggle(t)} />
                  <span className={t.status === 'done' ? 'text-gray-400 line-through' : 'text-gray-900 dark:text-gray-100'}>{t.title}</span>
                </label>
                <span className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                  {t.dueDate && (
                    <span className={overdue ? 'font-medium text-red-600 dark:text-red-400' : undefined}>
                      Due {formatDateOnly(t.dueDate)}
                    </span>
                  )}
                  {t.link && (
                    <a href={t.link} target="_blank" rel="noopener noreferrer" className="font-medium text-brand-600 dark:text-brand-400">
                      Open ↗
                    </a>
                  )}
                </span>
              </li>
            )
          })}
        </ul>
      )}
      {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
    </Section>
  )
}

// HR/Admin assign to anyone (or everyone); a supervisor assigns to their
// direct reports. The API enforces this — the form just offers who it can.
export function AssignTodo({ isHr }: { isHr: boolean }) {
  const [people, setPeople] = useState<Person[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [title, setTitle] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [link, setLink] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    const path = isHr ? '/employees' : '/hr/performance?kind=supervisees'
    api
      .get<Person[]>(path)
      .then((rows) => setPeople(rows.map((r) => ({ id: r.id, name: r.name }))))
      .catch(() => setPeople([]))
  }, [isHr])

  if (people.length === 0) return null

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const { assigned } = await api.post<{ assigned: number }>('/hr/todos', {
        employeeIds: selected,
        title,
        dueDate: dueDate || null,
        link: link.trim() || null,
      })
      setMessage(`Assigned to ${assigned} ${assigned === 1 ? 'person' : 'people'}.`)
      setTitle('')
      setDueDate('')
      setLink('')
      setSelected([])
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not assign the to-do')
    } finally {
      setBusy(false)
    }
  }

  const allSelected = selected.length === people.length

  return (
    <Section id="dashboard.assign-todo" title="Assign a to-do" hint={isHr ? 'To anyone' : 'To your direct reports'}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Task">
          <input required value={title} onChange={(e) => setTitle(e.target.value)} className="field" placeholder="e.g. Sign employee handbook" />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Due date (optional)">
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="field" />
          </Field>
          <Field label="Link (optional)">
            <input type="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…" className="field" />
          </Field>
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
            <span>Assign to</span>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={allSelected} onChange={(e) => setSelected(e.target.checked ? people.map((p) => p.id) : [])} />
              Everyone ({people.length})
            </label>
          </div>
          <ul className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-black/10 p-2 text-sm dark:border-white/10">
            {people.map((p) => (
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
        <FormError message={error} />
        {message && <p className="text-sm text-green-700 dark:text-green-400">{message}</p>}
        <Button type="submit" variant="primary" size="sm" disabled={busy || selected.length === 0}>
          {busy ? 'Assigning…' : 'Assign'}
        </Button>
      </form>
    </Section>
  )
}
