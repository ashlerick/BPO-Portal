import { useEffect, useState, type FormEvent } from 'react'
import { EmptyState, ErrorState, LoadingState } from '../../components/AsyncState'
import { api, ApiError } from '../../services/api'
import { Card, CardForm } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { Field, FormError } from '../../components/ui/Field'
import { PageHeader } from '../../components/ui/PageHeader'
import { Section, SectionStack } from '../../components/ui/Section'
import { formatDateOnly } from '../../utils/dates'
import { humanize } from '../../utils/text'

type OpeningStatus = 'open' | 'on_hold' | 'closed'
type ApplicantStatus = 'applied' | 'screening' | 'interview' | 'offer' | 'hired' | 'rejected' | 'withdrawn'

interface Interview {
  id: string
  applicantId: string
  scheduledAt: string
  interviewer: string | null
  notes: string | null
}

interface Opening {
  id: string
  title: string
  department: string | null
  description: string | null
  status: OpeningStatus
  openedAt: string
  closedAt: string | null
  applicantCount: number
}

interface Applicant {
  id: string
  jobOpeningId: string
  jobTitle: string
  name: string
  email: string | null
  phone: string | null
  information: string | null
  status: ApplicantStatus
  decisionNote: string | null
  decidedAt: string | null
  createdAt: string
  interviews: Interview[]
}

const APPLICANT_STATUSES: ApplicantStatus[] = ['applied', 'screening', 'interview', 'offer', 'hired', 'rejected', 'withdrawn']
const ACTIVE: ApplicantStatus[] = ['applied', 'screening', 'interview', 'offer']
const DECIDED: ApplicantStatus[] = ['hired', 'rejected', 'withdrawn']

const statusTone = (s: ApplicantStatus): 'gray' | 'blue' | 'amber' | 'green' | 'red' =>
  s === 'hired' ? 'green' : s === 'rejected' ? 'red' : s === 'withdrawn' ? 'gray' : s === 'offer' ? 'amber' : 'blue'

const dateTimeFmt = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' })

function OpeningForm({ onCreated }: { onCreated: (o: Opening) => void }) {
  const [title, setTitle] = useState('')
  const [department, setDepartment] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      onCreated(await api.post<Opening>('/hr/recruitment?kind=openings', { title, department: department || null, description: description || null }))
      setTitle('')
      setDepartment('')
      setDescription('')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create the opening')
    } finally {
      setBusy(false)
    }
  }

  return (
    <CardForm onSubmit={submit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Job title">
          <input required value={title} onChange={(e) => setTitle(e.target.value)} className="field" />
        </Field>
        <Field label="Department (optional)">
          <input value={department} onChange={(e) => setDepartment(e.target.value)} className="field" />
        </Field>
      </div>
      <Field label="Description (optional)">
        <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} className="field" />
      </Field>
      <FormError message={error} />
      <Button type="submit" variant="primary" size="sm" disabled={busy}>
        {busy ? 'Adding…' : 'Add job opening'}
      </Button>
    </CardForm>
  )
}

function ApplicantForm({ openings, onCreated }: { openings: Opening[]; onCreated: (a: Applicant) => void }) {
  const [jobOpeningId, setJobOpeningId] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [information, setInformation] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      onCreated(
        await api.post<Applicant>('/hr/recruitment?kind=applicants', {
          jobOpeningId,
          name,
          email: email || null,
          phone: phone || null,
          information: information || null,
        }),
      )
      setName('')
      setEmail('')
      setPhone('')
      setInformation('')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not add the applicant')
    } finally {
      setBusy(false)
    }
  }

  return (
    <CardForm onSubmit={submit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Job opening">
          <select required value={jobOpeningId} onChange={(e) => setJobOpeningId(e.target.value)} className="field">
            <option value="">Select…</option>
            {openings.filter((o) => o.status !== 'closed').map((o) => (
              <option key={o.id} value={o.id}>
                {o.title}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Name">
          <input required value={name} onChange={(e) => setName(e.target.value)} className="field" />
        </Field>
        <Field label="Email (optional)">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="field" />
        </Field>
        <Field label="Phone (optional)">
          <input value={phone} onChange={(e) => setPhone(e.target.value)} className="field" />
        </Field>
      </div>
      <Field label="Applicant information (background, source, expected salary…)">
        <textarea rows={2} value={information} onChange={(e) => setInformation(e.target.value)} className="field" />
      </Field>
      <FormError message={error} />
      <Button type="submit" variant="primary" size="sm" disabled={busy}>
        {busy ? 'Adding…' : 'Add applicant'}
      </Button>
    </CardForm>
  )
}

function ApplicantCard({ applicant, onUpdated, onDeleted }: { applicant: Applicant; onUpdated: (a: Applicant) => void; onDeleted: (id: string) => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState(applicant.decisionNote ?? '')
  const [when, setWhen] = useState('')
  const [who, setWho] = useState('')

  async function update(body: Partial<Pick<Applicant, 'status' | 'decisionNote' | 'information'>>) {
    setBusy(true)
    setError(null)
    try {
      onUpdated(await api.put<Applicant>(`/hr/recruitment?kind=applicants&sub=${applicant.id}`, body))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update the applicant')
    } finally {
      setBusy(false)
    }
  }

  async function schedule(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const created = await api.post<Interview>('/hr/recruitment?kind=interviews', {
        applicantId: applicant.id,
        scheduledAt: new Date(`${when}:00+08:00`).toISOString(),
        interviewer: who || null,
      })
      onUpdated({ ...applicant, interviews: [...applicant.interviews, created] })
      setWhen('')
      setWho('')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not schedule the interview')
    } finally {
      setBusy(false)
    }
  }

  return (
    <li>
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-medium text-gray-900 dark:text-gray-100">{applicant.name}</div>
            <div className="text-sm text-gray-500 dark:text-gray-400">
              {applicant.jobTitle}
              {applicant.email && ` · ${applicant.email}`}
              {applicant.phone && ` · ${applicant.phone}`}
            </div>
          </div>
          <Badge tone={statusTone(applicant.status)}>{humanize(applicant.status)}</Badge>
        </div>
        {applicant.information && <p className="mt-2 whitespace-pre-line text-sm text-gray-600 dark:text-gray-400">{applicant.information}</p>}

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Applicant status">
            <select value={applicant.status} disabled={busy} onChange={(e) => update({ status: e.target.value as ApplicantStatus })} className="field">
              {APPLICANT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {humanize(s)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Hiring decision note">
            <div className="flex gap-2">
              <input value={note} onChange={(e) => setNote(e.target.value)} className="field" />
              <Button size="sm" disabled={busy || note === (applicant.decisionNote ?? '')} onClick={() => update({ decisionNote: note || null })}>
                Save
              </Button>
            </div>
          </Field>
        </div>

        {applicant.interviews.length > 0 && (
          <ul className="mt-3 space-y-1 text-sm text-gray-700 dark:text-gray-300">
            {applicant.interviews.map((i) => (
              <li key={i.id}>
                Interview {dateTimeFmt.format(new Date(i.scheduledAt))}
                {i.interviewer && ` with ${i.interviewer}`}
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={schedule} className="mt-3 flex flex-wrap items-end gap-2">
          <Field label="Schedule interview">
            <input type="datetime-local" required value={when} onChange={(e) => setWhen(e.target.value)} className="field" />
          </Field>
          <Field label="Interviewer">
            <input value={who} onChange={(e) => setWho(e.target.value)} className="field" />
          </Field>
          <Button type="submit" size="sm" disabled={busy}>
            Schedule
          </Button>
        </form>

        <FormError message={error} />
        <Button
          size="sm"
          variant="danger"
          className="mt-3"
          disabled={busy}
          onClick={async () => {
            if (!window.confirm(`Delete ${applicant.name} and their interviews?`)) return
            await api.delete(`/hr/recruitment?kind=applicants&sub=${applicant.id}`)
            onDeleted(applicant.id)
          }}
        >
          Delete applicant
        </Button>
      </Card>
    </li>
  )
}

function InterviewNotes({ interview, applicantName, onSaved }: { interview: Interview; applicantName: string; onSaved: (i: Interview) => void }) {
  const [notes, setNotes] = useState(interview.notes ?? '')
  const [busy, setBusy] = useState(false)

  async function save() {
    setBusy(true)
    try {
      onSaved(await api.put<Interview>(`/hr/recruitment?kind=interviews&sub=${interview.id}`, { notes: notes || null }))
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Could not save notes')
    } finally {
      setBusy(false)
    }
  }

  return (
    <li>
      <Card className="!py-3">
        <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
          {applicantName} · {dateTimeFmt.format(new Date(interview.scheduledAt))}
          {interview.interviewer && <span className="font-normal text-gray-500 dark:text-gray-400"> · {interview.interviewer}</span>}
        </div>
        <Field label="Interview notes" className="mt-2">
          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className="field" />
        </Field>
        <Button size="sm" className="mt-2" disabled={busy || notes === (interview.notes ?? '')} onClick={save}>
          Save notes
        </Button>
      </Card>
    </li>
  )
}

export function RecruitmentPage() {
  const [openings, setOpenings] = useState<Opening[] | null>(null)
  const [applicants, setApplicants] = useState<Applicant[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([api.get<Opening[]>('/hr/recruitment?kind=openings'), api.get<Applicant[]>('/hr/recruitment?kind=applicants')])
      .then(([o, a]) => {
        setOpenings(o)
        setApplicants(a)
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Something went wrong'))
  }, [])

  if (error) return <ErrorState message={error} />
  if (!openings || !applicants) return <LoadingState />

  const replaceApplicant = (a: Applicant) => setApplicants((prev) => prev?.map((x) => (x.id === a.id ? a : x)) ?? null)
  const deleteApplicant = (id: string) => setApplicants((prev) => prev?.filter((x) => x.id !== id) ?? null)
  const active = applicants.filter((a) => ACTIVE.includes(a.status))
  const decided = applicants.filter((a) => DECIDED.includes(a.status))
  const upcoming = applicants
    .flatMap((a) => a.interviews.map((i) => ({ i, a })))
    .sort((x, y) => x.i.scheduledAt.localeCompare(y.i.scheduledAt))

  async function setOpeningStatus(o: Opening, status: OpeningStatus) {
    try {
      const updated = await api.put<Opening>(`/hr/recruitment?kind=openings&sub=${o.id}`, { status })
      setOpenings((prev) => prev?.map((x) => (x.id === o.id ? updated : x)) ?? null)
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Could not update the opening')
    }
  }

  return (
    <div>
      <PageHeader title="Recruitment" description="Job openings, applicants, interviews and hiring decisions." />
      <SectionStack>
        <Section id="recruit.openings" title="Job openings" hint={`${openings.filter((o) => o.status === 'open').length} open`} defaultOpen>
          <div className="space-y-3">
            <OpeningForm onCreated={(o) => setOpenings((prev) => (prev ? [o, ...prev] : [o]))} />
            {openings.filter((o) => o.status !== 'closed').length === 0 ? (
              <EmptyState label="No open job openings." />
            ) : (
              <ul className="space-y-2">
                {openings
                  .filter((o) => o.status !== 'closed')
                  .map((o) => (
                    <li key={o.id}>
                      <Card className="flex flex-wrap items-center justify-between gap-2 !py-3">
                        <div className="min-w-0">
                          <div className="font-medium text-gray-900 dark:text-gray-100">{o.title}</div>
                          <div className="text-sm text-gray-500 dark:text-gray-400">
                            {o.department ?? 'Any department'} · {o.applicantCount} applicant{o.applicantCount === 1 ? '' : 's'} · opened {formatDateOnly(o.openedAt)}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => setOpeningStatus(o, o.status === 'open' ? 'on_hold' : 'open')}>
                            {o.status === 'open' ? 'Put on hold' : 'Reopen'}
                          </Button>
                          <Button size="sm" onClick={() => setOpeningStatus(o, 'closed')}>
                            Close
                          </Button>
                        </div>
                      </Card>
                    </li>
                  ))}
              </ul>
            )}
          </div>
        </Section>

        <Section id="recruit.applicants" title="Applicants" hint={`${active.length} in progress`} defaultOpen>
          <div className="space-y-3">
            <ApplicantForm openings={openings} onCreated={(a) => setApplicants((prev) => (prev ? [a, ...prev] : [a]))} />
            {active.length === 0 ? (
              <EmptyState label="No applicants in progress." />
            ) : (
              <ul className="space-y-3">
                {active.map((a) => (
                  <ApplicantCard key={a.id} applicant={a} onUpdated={replaceApplicant} onDeleted={deleteApplicant} />
                ))}
              </ul>
            )}
          </div>
        </Section>

        <Section id="recruit.interviews" title="Interview schedule and notes" hint={`${upcoming.length} interview${upcoming.length === 1 ? '' : 's'}`}>
          {upcoming.length === 0 ? (
            <EmptyState label="No interviews scheduled." />
          ) : (
            <ul className="space-y-2">
              {upcoming.map(({ i, a }) => (
                <InterviewNotes
                  key={i.id}
                  interview={i}
                  applicantName={a.name}
                  onSaved={(saved) => replaceApplicant({ ...a, interviews: a.interviews.map((x) => (x.id === saved.id ? saved : x)) })}
                />
              ))}
            </ul>
          )}
        </Section>

        <Section id="recruit.decisions" title="Hiring decisions" hint={`${decided.length} decided`}>
          {decided.length === 0 ? (
            <EmptyState label="No decisions yet." />
          ) : (
            <ul className="space-y-3">
              {decided.map((a) => (
                <ApplicantCard key={a.id} applicant={a} onUpdated={replaceApplicant} onDeleted={deleteApplicant} />
              ))}
            </ul>
          )}
        </Section>

        <Section id="recruit.history" title="Recruitment history" hint="Closed openings">
          {openings.filter((o) => o.status === 'closed').length === 0 ? (
            <EmptyState label="No closed openings." />
          ) : (
            <ul className="space-y-2 text-sm">
              {openings
                .filter((o) => o.status === 'closed')
                .map((o) => (
                  <li key={o.id} className="flex flex-wrap justify-between gap-2 border-b border-black/5 py-2 last:border-0 dark:border-white/10">
                    <span className="text-gray-900 dark:text-gray-100">
                      {o.title}
                      <span className="text-gray-500 dark:text-gray-400"> · {o.applicantCount} applicant{o.applicantCount === 1 ? '' : 's'}</span>
                    </span>
                    <span className="text-gray-500 dark:text-gray-400">
                      {formatDateOnly(o.openedAt)} – {o.closedAt ? formatDateOnly(o.closedAt) : ''}
                    </span>
                  </li>
                ))}
            </ul>
          )}
        </Section>
      </SectionStack>
    </div>
  )
}
