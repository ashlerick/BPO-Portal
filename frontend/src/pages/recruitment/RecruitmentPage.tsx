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
import { readFileAsBase64 } from '../../utils/files'
import { FilePicker } from '../../components/ui/FilePicker'
import { useAuth } from '../../auth/AuthContext'
import { Modal } from '../../components/ui/Modal'
import { useToast } from '../../components/ui/Toast'

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
  bannerUrl: string | null
  applicantCount: number
}

// Another applicant who looks like the same person (shared email or phone, or a very similar name), and how that application went.
interface Similar {
  id: string
  name: string
  jobTitle: string
  status: string
  decisionNote: string | null
  decidedAt: string | null
  createdAt: string
  why: ('email' | 'phone' | 'name' | 'birthday' | 'resume')[]
}

const WHY: Record<Similar['why'][number], string> = {
  email: 'same email',
  phone: 'same phone number',
  name: 'similar name',
  birthday: 'same birth date',
  resume: 'same resume file name',
}

interface Applicant {
  id: string
  jobOpeningId: string
  jobTitle: string
  name: string
  firstName: string | null
  middleName: string | null
  lastName: string | null
  birthDate: string | null
  gender: string | null
  email: string | null
  phone: string | null
  information: string | null
  status: ApplicantStatus
  decisionNote: string | null
  decidedAt: string | null
  source: 'internal' | 'careers'
  resumeLink: string | null
  resumeUrl: string | null
  resumeName: string | null
  referredByName: string | null
  hiredUserId: string | null
  createdAt: string
  interviews: Interview[]
  // Possible duplicates (HR only); empty when there are none.
  similar?: Similar[]
}

const APPLICANT_STATUSES: ApplicantStatus[] = ['applied', 'screening', 'interview', 'offer', 'hired', 'rejected', 'withdrawn']
const ACTIVE: ApplicantStatus[] = ['applied', 'screening', 'interview', 'offer']
const DECIDED: ApplicantStatus[] = ['hired', 'rejected', 'withdrawn']

const statusTone = (s: ApplicantStatus): 'gray' | 'blue' | 'amber' | 'green' | 'red' =>
  s === 'hired' ? 'green' : s === 'rejected' ? 'red' : s === 'withdrawn' ? 'gray' : s === 'offer' ? 'amber' : 'blue'

const dateTimeFmt = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' })

function OpeningForm({ onCreated }: { onCreated: (o: Opening) => void }) {
  const toast = useToast()
  const [title, setTitle] = useState('')
  const [department, setDepartment] = useState('')
  const [description, setDescription] = useState('')
  const [banner, setBanner] = useState<File | undefined>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (banner && banner.size > 2 * 1024 * 1024) return setError('The poster image must be under 2MB')
    setBusy(true)
    setError(null)
    try {
      onCreated(
        await api.post<Opening>('/hr/recruitment?kind=openings', {
          title,
          department: department || null,
          description: description || null,
          ...(banner && { banner: { contentType: banner.type, base64: await readFileAsBase64(banner) } }),
        }),
      )
      setTitle('')
      setDepartment('')
      setDescription('')
      setBanner(undefined)
      toast.success(`Job opening "${title}" added`)
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not create the opening'
      setError(message)
      toast.error(message)
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
      <Field label="Job poster (optional, shown in full on the careers page; PNG/JPG/WebP, under 2MB)">
        <FilePicker file={banner} onChange={setBanner} accept="image/png,image/jpeg,image/webp" label="Choose poster" />
      </Field>
      <FormError message={error} />
      <Button type="submit" variant="primary" size="sm" disabled={busy}>
        {busy ? 'Adding…' : 'Add job opening'}
      </Button>
    </CardForm>
  )
}

function ApplicantForm({ openings, onCreated }: { openings: Opening[]; onCreated: (a: Applicant) => void }) {
  const toast = useToast()
  const [jobOpeningId, setJobOpeningId] = useState('')
  const [firstName, setFirstName] = useState('')
  const [middleName, setMiddleName] = useState('')
  const [lastName, setLastName] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [gender, setGender] = useState('')
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
          firstName,
          middleName: middleName || null,
          lastName,
          birthDate: birthDate || null,
          gender: gender || null,
          email: email || null,
          phone: phone || null,
          information: information || null,
        }),
      )
      setFirstName('')
      setMiddleName('')
      setLastName('')
      setBirthDate('')
      setGender('')
      setEmail('')
      setPhone('')
      setInformation('')
      toast.success(`Applicant ${firstName} ${lastName} added`)
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not add the applicant'
      setError(message)
      toast.error(message)
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
        <Field label="First name">
          <input required value={firstName} onChange={(e) => setFirstName(e.target.value)} className="field" />
        </Field>
        <Field label="Middle name (optional)">
          <input value={middleName} onChange={(e) => setMiddleName(e.target.value)} className="field" />
        </Field>
        <Field label="Last name">
          <input required value={lastName} onChange={(e) => setLastName(e.target.value)} className="field" />
        </Field>
        <Field label="Birthday (optional)">
          <input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} className="field" />
        </Field>
        <Field label="Gender (optional)">
          <select value={gender} onChange={(e) => setGender(e.target.value)} className="field">
            <option value="">Not set</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
            <option value="prefer_not_to_say">Prefer not to say</option>
          </select>
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

function ApplicantCard({
  applicant,
  onUpdated,
  onDeleted,
  onNotSame,
}: {
  applicant: Applicant
  onUpdated: (a: Applicant) => void
  onDeleted: (id: string) => void
  onNotSame: (a: string, b: string) => void
}) {
  const [showSimilar, setShowSimilar] = useState(false)
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

  // HR says this is a different person: the flag goes away for both applicants.
  async function notSame(otherId: string) {
    setBusy(true)
    setError(null)
    try {
      await api.post(`/hr/recruitment?kind=applicants&sub=${applicant.id}&action=not-same`, { otherId })
      onNotSame(applicant.id, otherId)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save that')
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
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              {applicant.source === 'careers' && <Badge tone="purple">Applied online</Badge>}
              {applicant.hiredUserId && <Badge tone="green">Now an employee</Badge>}
              {applicant.referredByName && <Badge tone="blue">Referred by {applicant.referredByName}</Badge>}
              {applicant.similar && applicant.similar.length > 0 && (
                <button type="button" onClick={() => setShowSimilar((v) => !v)} aria-expanded={showSimilar} title="Another applicant looks like the same person">
                  <Badge tone="amber">Possible duplicate ({applicant.similar.length}) {showSimilar ? '▲' : '▼'}</Badge>
                </button>
              )}
              {applicant.resumeUrl && (
                <a href={applicant.resumeUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-brand-600 dark:text-brand-400">
                  Resume file{applicant.resumeName ? ` (${applicant.resumeName})` : ''} ↗
                </a>
              )}
              {applicant.resumeLink && (
                <a href={applicant.resumeLink} target="_blank" rel="noopener noreferrer" className="font-medium text-brand-600 dark:text-brand-400">
                  Resume ↗
                </a>
              )}
            </div>
            {showSimilar && applicant.similar && applicant.similar.length > 0 && (
              <ul className="mt-2 space-y-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
                {applicant.similar.map((m) => (
                  <li key={m.id} className="space-y-0.5">
                    <div className="font-medium text-gray-900 dark:text-gray-100">
                      {m.name} <span className="font-normal text-gray-500 dark:text-gray-400">· {m.jobTitle}</span>
                    </div>
                    <div className="text-xs text-gray-600 dark:text-gray-400">
                      Applied {formatDateOnly(m.createdAt)} · {humanize(m.status)}
                      {m.decidedAt ? ` (${formatDateOnly(m.decidedAt)})` : ''}
                      {m.decisionNote ? ` · Note: ${m.decisionNote}` : ''}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">Looks the same: {m.why.map((w) => WHY[w]).join(', ')}</div>
                    <Button size="sm" onClick={() => notSame(m.id)} disabled={busy}>
                      Not the same person
                    </Button>
                  </li>
                ))}
              </ul>
            )}
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

// The shareable public address of the careers page.
function CareersLink() {
  const url = `${window.location.origin}${import.meta.env.BASE_URL}careers`.replace(/([^:])\/{2,}/g, '$1/')
  const [copied, setCopied] = useState(false)
  return (
    <Card className="mb-4 flex flex-wrap items-center justify-between gap-2 !py-3 text-sm">
      <span className="min-w-0 text-gray-700 dark:text-gray-300">
        Public careers page (anyone can apply, no login):{' '}
        <a href={url} target="_blank" rel="noopener noreferrer" className="break-all font-medium text-brand-600 dark:text-brand-400">
          {url}
        </a>
      </span>
      <Button
        size="sm"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
          } catch {
            window.prompt('Copy this link', url)
          }
        }}
      >
        {copied ? 'Copied' : 'Copy link'}
      </Button>
    </Card>
  )
}

// Add, replace or remove a position's banner image.
function BannerControl({ opening, onChanged }: { opening: Opening; onChanged: (o: Opening) => void }) {
  const [busy, setBusy] = useState(false)

  async function send(banner: { contentType: string; base64: string } | null) {
    setBusy(true)
    try {
      onChanged(await api.put<Opening>(`/hr/recruitment?kind=openings&sub=${opening.id}`, { banner }))
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Could not update the poster')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <label className="inline-flex cursor-pointer items-center rounded-md border border-black/15 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-black/5 dark:border-white/20 dark:text-gray-200 dark:hover:bg-white/10">
        {busy ? 'Uploading…' : opening.bannerUrl ? 'Change poster' : 'Add poster'}
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          disabled={busy}
          onChange={async (e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (!f) return
            if (f.size > 2 * 1024 * 1024) return alert('The poster image must be under 2MB')
            await send({ contentType: f.type, base64: await readFileAsBase64(f) })
          }}
        />
      </label>
      {opening.bannerUrl && (
        <Button size="sm" disabled={busy} onClick={() => send(null)}>
          Remove poster
        </Button>
      )}
    </>
  )
}

// The poster thumbnail on an opening: click it to see the whole poster.
function PosterThumb({ url, title }: { url: string; title: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`View the ${title} poster`}
        title="Click to view the poster"
        className="shrink-0 cursor-zoom-in rounded"
      >
        <img src={url} alt="" className="h-20 w-32 rounded bg-black/20 object-contain" />
      </button>
      {open && (
        // Nothing to lose here, so a click outside closes it as well as Close.
        <Modal label={`${title} poster`} onClose={() => setOpen(false)} closeOnBackdrop className="max-w-4xl">
          <h2 className="mb-3 text-lg font-semibold">{title}</h2>
          <img src={url} alt={`${title} poster`} className="mx-auto block max-h-[75svh] w-full rounded object-contain" />
          <div className="mt-4 flex justify-end gap-2">
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center rounded-lg border border-black/15 px-3 py-1.5 text-sm font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
            >
              Open in a new tab
            </a>
            <Button variant="primary" onClick={() => setOpen(false)}>
              Close
            </Button>
          </div>
        </Modal>
      )}
    </>
  )
}

// Admin only: reword an opening, or delete it (a soft delete: it leaves the
// portal and the careers page, the record stays in the database).
function OpeningAdminControls({
  opening,
  onChanged,
  onDeleted,
}: {
  opening: Opening
  onChanged: (o: Opening) => void
  onDeleted: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState(opening.title)
  const [department, setDepartment] = useState(opening.department ?? '')
  const [description, setDescription] = useState(opening.description ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const toast = useToast()

  async function save(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      onChanged(
        await api.put<Opening>(`/hr/recruitment?kind=openings&sub=${opening.id}`, {
          title,
          department: department.trim() || null,
          description: description.trim() || null,
        }),
      )
      setOpen(false)
      toast.success('Job opening updated')
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not save the opening'
      setError(message)
      toast.error(message)
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    const n = opening.applicantCount
    const warn = n > 0 ? ` It has ${n} applicant${n === 1 ? '' : 's'}; they stay on record.` : ''
    if (!window.confirm(`Delete the "${opening.title}" opening? It will be hidden from the portal and the careers page.${warn}`)) return
    setBusy(true)
    try {
      await api.delete(`/hr/recruitment?kind=openings&sub=${opening.id}`)
      onDeleted(opening.id)
      toast.success(`Job opening "${opening.title}" deleted`)
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not delete the opening'
      setError(message)
      toast.error(message)
      setBusy(false)
    }
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        Edit
      </Button>
      <Button size="sm" onClick={remove} disabled={busy} className="!border-red-500/50 !text-red-600 dark:!text-red-400">
        Delete
      </Button>
      {open && (
        <Modal label={`Edit ${opening.title}`} onClose={() => setOpen(false)}>
          <form onSubmit={save} className="space-y-3">
            <h2 className="text-lg font-semibold">Edit job opening</h2>
            <Field label="Job title">
              <input required value={title} onChange={(e) => setTitle(e.target.value)} className="field" />
            </Field>
            <Field label="Department (optional)">
              <input value={department} onChange={(e) => setDepartment(e.target.value)} className="field" />
            </Field>
            <Field label="Description (optional)">
              <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} className="field" />
            </Field>
            <FormError message={error} />
            <div className="flex justify-end gap-2">
              <Button type="button" onClick={() => setOpen(false)} disabled={busy}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={busy}>
                {busy ? 'Saving…' : 'Save changes'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  )
}

export function RecruitmentPage() {
  const { effectiveRoles } = useAuth()
  const isAdmin = effectiveRoles.includes('admin')
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

  const dismissPair = (a: string, b: string) =>
    setApplicants((prev) =>
      prev?.map((x) =>
        x.id === a ? { ...x, similar: x.similar?.filter((m) => m.id !== b) } : x.id === b ? { ...x, similar: x.similar?.filter((m) => m.id !== a) } : x,
      ) ?? null,
    )
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
      <CareersLink />
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
                        {o.bannerUrl && <PosterThumb url={o.bannerUrl} title={o.title} />}
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-gray-900 dark:text-gray-100">{o.title}</div>
                          <div className="text-sm text-gray-500 dark:text-gray-400">
                            {o.department ?? 'Any department'} · {o.applicantCount} applicant{o.applicantCount === 1 ? '' : 's'} · opened {formatDateOnly(o.openedAt)}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <BannerControl opening={o} onChanged={(u) => setOpenings((prev) => prev?.map((x) => (x.id === u.id ? u : x)) ?? null)} />
                          <Button size="sm" onClick={() => setOpeningStatus(o, o.status === 'open' ? 'on_hold' : 'open')}>
                            {o.status === 'open' ? 'Put on hold' : 'Reopen'}
                          </Button>
                          <Button size="sm" onClick={() => setOpeningStatus(o, 'closed')}>
                            Close
                          </Button>
                          {isAdmin && (
                            <OpeningAdminControls
                              opening={o}
                              onChanged={(u) => setOpenings((prev) => prev?.map((x) => (x.id === u.id ? u : x)) ?? null)}
                              onDeleted={(id) => setOpenings((prev) => prev?.filter((x) => x.id !== id) ?? null)}
                            />
                          )}
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
                  <ApplicantCard key={a.id} applicant={a} onUpdated={replaceApplicant} onDeleted={deleteApplicant} onNotSame={dismissPair} />
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
                <ApplicantCard key={a.id} applicant={a} onUpdated={replaceApplicant} onDeleted={deleteApplicant} onNotSame={dismissPair} />
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
