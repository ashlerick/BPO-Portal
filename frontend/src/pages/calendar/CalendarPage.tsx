import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../../auth/AuthContext'
import { EmptyState, ErrorState, LoadingState } from '../../components/AsyncState'
import { api, ApiError } from '../../services/api'
import { formatDateOnly, todayInManilaIso } from '../../utils/dates'
import { Card, CardForm } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { PageHeader } from '../../components/ui/PageHeader'
import { Section, SectionStack } from '../../components/ui/Section'
import { MonthCalendar, eachDay, type CalendarEvent } from '../../components/ui/MonthCalendar'
import type { LeaveRequest } from '../leave/types'
import { CALENDAR_KINDS, type CalendarEventKind, type CalendarEventRecord } from './types'

const kindTones: Record<CalendarEventKind, NonNullable<CalendarEvent['tone']>> = {
  holiday: 'red',
  event: 'brand',
  meeting: 'blue',
  training: 'purple',
  deadline: 'amber',
}

function CreateEventForm({ onCreated }: { onCreated: (e: CalendarEventRecord) => void }) {
  const { guardedAction } = useAuth()
  const [title, setTitle] = useState('')
  const [kind, setKind] = useState<CalendarEventKind>('event')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    guardedAction(['hr', 'admin'], async () => {
      setSubmitting(true)
      setError(null)
      try {
        const created = await api.post<CalendarEventRecord>('/calendar', {
          title,
          kind,
          startDate,
          endDate: endDate || null,
          description: description || null,
        })
        onCreated(created)
        setTitle('')
        setStartDate('')
        setEndDate('')
        setDescription('')
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Could not add the event')
      } finally {
        setSubmitting(false)
      }
    })
  }

  return (
    <CardForm onSubmit={handleSubmit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor="cal-title" className="text-sm text-gray-600 dark:text-gray-400">
            Title
          </label>
          <input id="cal-title" required value={title} onChange={(e) => setTitle(e.target.value)} className="field" />
        </div>
        <div className="space-y-1">
          <label htmlFor="cal-kind" className="text-sm text-gray-600 dark:text-gray-400">
            Type
          </label>
          <select id="cal-kind" value={kind} onChange={(e) => setKind(e.target.value as CalendarEventKind)} className="field">
            {CALENDAR_KINDS.map((k) => (
              <option key={k.key} value={k.key}>
                {k.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="cal-start" className="text-sm text-gray-600 dark:text-gray-400">
            Date
          </label>
          <input id="cal-start" type="date" required value={startDate} onChange={(e) => setStartDate(e.target.value)} className="field" />
        </div>
        <div className="space-y-1">
          <label htmlFor="cal-end" className="text-sm text-gray-600 dark:text-gray-400">
            Until (optional)
          </label>
          <input id="cal-end" type="date" min={startDate} value={endDate} onChange={(e) => setEndDate(e.target.value)} className="field" />
        </div>
      </div>
      <div className="space-y-1">
        <label htmlFor="cal-desc" className="text-sm text-gray-600 dark:text-gray-400">
          Details (optional)
        </label>
        <input id="cal-desc" value={description} onChange={(e) => setDescription(e.target.value)} className="field" />
      </div>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <Button type="submit" variant="primary" size="sm" disabled={submitting}>
        {submitting ? 'Adding…' : 'Add to calendar'}
      </Button>
    </CardForm>
  )
}

export function CalendarPage() {
  const { effectiveRoles } = useAuth()
  const isManager = effectiveRoles.some((r) => r === 'hr' || r === 'admin')
  const [events, setEvents] = useState<CalendarEventRecord[] | null>(null)
  const [leave, setLeave] = useState<LeaveRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const today = todayInManilaIso()

  useEffect(() => {
    Promise.all([
      api.get<CalendarEventRecord[]>('/calendar'),
      api.get<LeaveRequest[]>('/leave/requests').catch(() => [] as LeaveRequest[]),
    ])
      .then(([e, l]) => {
        setEvents(e)
        setLeave(l)
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Something went wrong'))
      .finally(() => setLoading(false))
  }, [])

  async function remove(id: string) {
    if (!window.confirm('Remove this event from the calendar?')) return
    try {
      await api.delete(`/calendar/${id}`)
      setEvents((prev) => prev?.filter((e) => e.id !== id) ?? null)
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Could not remove the event')
    }
  }

  const calendarEvents: CalendarEvent[] = [
    ...(events ?? []).flatMap((e) =>
      eachDay(e.startDate, e.endDate ?? e.startDate).map((date) => ({
        id: `${e.id}-${date}`,
        date,
        label: e.title,
        tone: kindTones[e.kind],
      })),
    ),
    ...leave
      .filter((r) => r.status === 'approved')
      .flatMap((r) =>
        eachDay(r.startDate, r.endDate).map((date) => ({
          id: `leave-${r.id}-${date}`,
          date,
          label: `${r.employeeName} (leave)`,
          tone: 'amber' as const,
        })),
      ),
  ]

  const upcoming = (events ?? []).filter((e) => (e.endDate ?? e.startDate).slice(0, 10) >= today)

  return (
    <div>
      <PageHeader title="Calendar" description="Holidays, company events, meetings, training and deadlines." />

      {loading && <LoadingState />}
      {error && <ErrorState message={error} />}

      {events && (
        <SectionStack>
          <Section id="calendar.month" title="Month view" hint="Includes approved leave" defaultOpen>
            <MonthCalendar events={calendarEvents} todayIso={today} />
          </Section>

          {CALENDAR_KINDS.map((k) => {
            const list = upcoming.filter((e) => e.kind === k.key)
            return (
              <Section
                key={k.key}
                id={`calendar.${k.key}`}
                title={k.plural}
                hint={`${list.length} upcoming`}
                defaultOpen={list.length > 0}
              >
                {list.length === 0 ? (
                  <EmptyState label={`No upcoming ${k.plural.toLowerCase()}.`} />
                ) : (
                  <ul className="space-y-2">
                    {list.map((e) => (
                      <li key={e.id}>
                        <Card className="flex flex-wrap items-start justify-between gap-2 !py-3">
                          <div className="min-w-0">
                            <div className="font-medium text-gray-900 dark:text-gray-100">{e.title}</div>
                            <div className="text-sm text-gray-500 dark:text-gray-400">
                              {formatDateOnly(e.startDate)}
                              {e.endDate && e.endDate.slice(0, 10) !== e.startDate.slice(0, 10)
                                ? ` – ${formatDateOnly(e.endDate)}`
                                : ''}
                            </div>
                            {e.description && (
                              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{e.description}</p>
                            )}
                          </div>
                          {isManager && (
                            <Button size="sm" variant="danger" onClick={() => remove(e.id)}>
                              Remove
                            </Button>
                          )}
                        </Card>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>
            )
          })}

          <Section id="calendar.add" title="Add an event" hint="HR / Admin" roles={['hr', 'admin']}>
            <CreateEventForm onCreated={(e) => setEvents((prev) => (prev ? [...prev, e] : [e]))} />
          </Section>
        </SectionStack>
      )}
    </div>
  )
}
