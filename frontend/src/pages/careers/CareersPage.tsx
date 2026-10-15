import { useEffect, useState, type FormEvent } from 'react'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { api, ApiError } from '../../services/api'
import { useTheme } from '../../theme/ThemeContext'
import { readFileAsBase64 } from '../../utils/files'
import { FilePicker } from '../../components/ui/FilePicker'

const MAX_RESUME_BYTES = 3 * 1024 * 1024
const RESUME_ACCEPT = '.pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document'

// Public careers page: no sign-in. Lists open positions (with banner image)
// and takes applications, which land in HR's Recruitment page.

interface PublicOpening {
  id: string
  title: string
  department: string | null
  description: string | null
  bannerUrl: string | null
}

interface Referrer {
  id: string
  name: string
}

function ApplyForm({
  opening,
  referrers,
  onDone,
  onCancel,
}: {
  opening: PublicOpening
  referrers: Referrer[]
  onDone: () => void
  onCancel: () => void
}) {
  const [firstName, setFirstName] = useState('')
  const [middleName, setMiddleName] = useState('')
  const [lastName, setLastName] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [gender, setGender] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [information, setInformation] = useState('')
  const [resumeLink, setResumeLink] = useState('')
  const [referredById, setReferredById] = useState('')
  const [resumeFile, setResumeFile] = useState<File | undefined>()
  const [website, setWebsite] = useState('') // honeypot, hidden from people
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    if (resumeFile && resumeFile.size > MAX_RESUME_BYTES) {
      setBusy(false)
      return setError('Your resume must be under 3MB')
    }
    try {
      const resume = resumeFile
        ? { name: resumeFile.name, contentType: resumeFile.type, base64: await readFileAsBase64(resumeFile) }
        : undefined
      await api.post('/hr/careers', {
        jobOpeningId: opening.id,
        firstName,
        middleName,
        lastName,
        birthDate,
        gender,
        email,
        phone,
        information,
        resumeLink,
        resume,
        referredById: referredById || null,
        website,
      })
      onDone()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not send your application. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="mt-4 space-y-3 border-t border-black/10 pt-4 dark:border-white/10">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-sm text-gray-600 dark:text-gray-400">
          First name
          <input required value={firstName} onChange={(e) => setFirstName(e.target.value)} autoComplete="given-name" className="field" />
        </label>
        <label className="flex flex-col gap-1 text-sm text-gray-600 dark:text-gray-400">
          Middle name (optional)
          <input value={middleName} onChange={(e) => setMiddleName(e.target.value)} autoComplete="additional-name" className="field" />
        </label>
        <label className="flex flex-col gap-1 text-sm text-gray-600 dark:text-gray-400">
          Last name
          <input required value={lastName} onChange={(e) => setLastName(e.target.value)} autoComplete="family-name" className="field" />
        </label>
        <label className="flex flex-col gap-1 text-sm text-gray-600 dark:text-gray-400">
          Email
          <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" className="field" />
        </label>
        <label className="flex flex-col gap-1 text-sm text-gray-600 dark:text-gray-400">
          Phone (optional)
          <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" className="field" />
        </label>
        <label className="flex flex-col gap-1 text-sm text-gray-600 dark:text-gray-400">
          Birthday (optional)
          <input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} autoComplete="bday" className="field" />
        </label>
        <label className="flex flex-col gap-1 text-sm text-gray-600 dark:text-gray-400">
          Gender (optional)
          <select value={gender} onChange={(e) => setGender(e.target.value)} className="field">
            <option value="">Not set</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
            <option value="prefer_not_to_say">Prefer not to say</option>
          </select>
        </label>
      </div>
      <div className="rounded-lg border border-dashed border-black/20 p-3 dark:border-white/20">
        <label className="flex flex-col gap-2 text-sm text-gray-600 dark:text-gray-400">
          Attach your resume (optional, PDF or Word, under 3MB)
        </label>
        <div className="mt-2">
          <FilePicker file={resumeFile} onChange={setResumeFile} accept={RESUME_ACCEPT} label="Choose resume" />
        </div>
        <label className="mt-3 flex flex-col gap-1 text-sm text-gray-600 dark:text-gray-400">
          Or paste a link to it (optional)
          <input type="url" value={resumeLink} onChange={(e) => setResumeLink(e.target.value)} placeholder="https://…" className="field" />
        </label>
      </div>
      {referrers.length > 0 && (
        <label className="flex flex-col gap-1 text-sm text-gray-600 dark:text-gray-400">
          Referred by an employee? (optional)
          <select value={referredById} onChange={(e) => setReferredById(e.target.value)} className="field">
            <option value="">No, I found this myself</option>
            {referrers.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="flex flex-col gap-1 text-sm text-gray-600 dark:text-gray-400">
        Tell us about yourself (optional)
        <textarea rows={3} maxLength={2000} value={information} onChange={(e) => setInformation(e.target.value)} className="field" />
      </label>
      {/* Honeypot: off-screen, not focusable. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Website
          <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
        </label>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? 'Sending…' : 'Submit application'}
        </Button>
        <Button type="button" onClick={onCancel} disabled={busy}>
          ← Back
        </Button>
      </div>
    </form>
  )
}

export function CareersPage() {
  const { theme, toggleTheme } = useTheme()
  const [openings, setOpenings] = useState<PublicOpening[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [applying, setApplying] = useState<string | null>(null)
  const [sent, setSent] = useState<string[]>([])
  const [referrers, setReferrers] = useState<Referrer[]>([])
  const [zoom, setZoom] = useState<{ url: string; title: string } | null>(null)

  useEffect(() => {
    api
      .get<PublicOpening[]>('/hr/careers')
      .then(setOpenings)
      .catch(() => setError('We could not load the open positions. Please try again later.'))
    api
      .get<Referrer[]>('/hr/careers?referrers=1')
      .then(setReferrers)
      .catch(() => setReferrers([]))
  }, [])

  return (
    <div className="mx-auto min-h-svh max-w-5xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src={`${import.meta.env.BASE_URL}favicon.png`} alt="" className="h-10 w-10" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gold-600 dark:text-gold-400">Careers</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Join the team. Pick a position and apply below.</p>
          </div>
        </div>
        <button
          onClick={toggleTheme}
          className="rounded-lg border border-black/10 bg-white/70 px-2.5 py-1.5 text-xs text-gray-700 backdrop-blur-sm dark:border-white/15 dark:bg-white/5 dark:text-gray-300"
        >
          {theme === 'dark' ? '☀️ Light' : '🌙 Dark'}
        </button>
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {!openings && !error && <p className="text-sm text-gray-500 dark:text-gray-400">Loading positions…</p>}
      {openings && openings.length === 0 && (
        <Card>
          <p className="text-sm text-gray-600 dark:text-gray-400">There are no open positions right now. Please check back soon.</p>
        </Card>
      )}

      {zoom && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${zoom.title} poster`}
          onClick={() => setZoom(null)}
          className="fixed inset-0 z-50 flex cursor-zoom-out items-center justify-center overflow-auto bg-black/80 p-3"
        >
          <img src={zoom.url} alt={`${zoom.title} poster`} className="max-h-full max-w-full object-contain" />
          <button
            type="button"
            onClick={() => setZoom(null)}
            className="fixed right-4 top-4 rounded-lg bg-black/60 px-3 py-1.5 text-sm font-medium text-white"
          >
            Close
          </button>
        </div>
      )}

      <ul className="space-y-4">
        {openings?.map((o) => (
          <li key={o.id}>
            <Card className="overflow-hidden !p-0">
              {o.bannerUrl && (
                <button
                  type="button"
                  onClick={() => setZoom({ url: o.bannerUrl as string, title: o.title })}
                  className="block w-full cursor-zoom-in bg-black/20"
                  aria-label={`View the ${o.title} poster full size`}
                >
                  <img src={o.bannerUrl} alt={`${o.title} poster`} className="mx-auto block h-auto w-full" />
                  <span className="block bg-black/30 py-1 text-center text-xs text-gray-200">Click the poster to view it full size</span>
                </button>
              )}
              <div className="p-5">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{o.title}</h2>
                {o.department && <p className="text-sm text-gray-500 dark:text-gray-400">{o.department}</p>}
                {o.description && <p className="mt-3 whitespace-pre-line text-sm text-gray-700 dark:text-gray-300">{o.description}</p>}

                {sent.includes(o.id) ? (
                  <p className="mt-4 rounded-md bg-green-500/10 px-3 py-2 text-sm text-green-700 dark:text-green-400">
                    Thank you! Your application was received. We will be in touch.
                  </p>
                ) : applying === o.id ? (
                  <ApplyForm
                    opening={o}
                    referrers={referrers}
                    onCancel={() => setApplying(null)}
                    onDone={() => {
                      setSent((prev) => [...prev, o.id])
                      setApplying(null)
                    }}
                  />
                ) : (
                  <Button variant="primary" className="mt-4" onClick={() => setApplying(o.id)}>
                    Apply for this position
                  </Button>
                )}
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  )
}
