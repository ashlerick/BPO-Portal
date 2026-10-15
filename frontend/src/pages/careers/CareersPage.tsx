import { useEffect, useState, type FormEvent } from 'react'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { api, ApiError } from '../../services/api'
import { useTheme } from '../../theme/ThemeContext'
import { readFileAsBase64 } from '../../utils/files'
import { FilePicker } from '../../components/ui/FilePicker'
import { useToast } from '../../components/ui/Toast'

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

function ApplyForm({
  opening,
  onDone,
  onCancel,
}: {
  opening: PublicOpening
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
  const [referrerName, setReferrerName] = useState('')
  const toast = useToast()
  const [resumeFile, setResumeFile] = useState<File | undefined>()
  const [website, setWebsite] = useState('') // honeypot, hidden from people
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    if (resumeFile && resumeFile.size > MAX_RESUME_BYTES) {
      const message = `Your resume file is ${(resumeFile.size / (1024 * 1024)).toFixed(1)}MB; it must be under 3MB. Please attach a smaller file or paste a link instead.`
      setBusy(false)
      setError(message)
      toast.error(message)
      return
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
        referrerName: referrerName.trim() || null,
        website,
      })
      onDone()
      toast.success('Application sent. Thank you, we will be in touch.')
    } catch (err) {
      const message =
        err instanceof ApiError && err.message
          ? err.message
          : 'We could not send your application. Please check your internet connection and try again.'
      setError(message)
      toast.error(message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-2.5">
      <div className="grid gap-2.5 sm:grid-cols-3">
        <label className="flex flex-col gap-0.5 text-xs text-gray-600 dark:text-gray-400">
          First name
          <input required value={firstName} onChange={(e) => setFirstName(e.target.value)} autoComplete="given-name" className="field !py-1.5" />
        </label>
        <label className="flex flex-col gap-0.5 text-xs text-gray-600 dark:text-gray-400">
          Middle name
          <input value={middleName} onChange={(e) => setMiddleName(e.target.value)} autoComplete="additional-name" className="field !py-1.5" />
        </label>
        <label className="flex flex-col gap-0.5 text-xs text-gray-600 dark:text-gray-400">
          Last name
          <input required value={lastName} onChange={(e) => setLastName(e.target.value)} autoComplete="family-name" className="field !py-1.5" />
        </label>
      </div>
      <div className="grid gap-2.5 sm:grid-cols-2">
        <label className="flex flex-col gap-0.5 text-xs text-gray-600 dark:text-gray-400">
          Email
          <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" className="field !py-1.5" />
        </label>
        <label className="flex flex-col gap-0.5 text-xs text-gray-600 dark:text-gray-400">
          Phone
          <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" className="field !py-1.5" />
        </label>
        <label className="flex flex-col gap-0.5 text-xs text-gray-600 dark:text-gray-400">
          Birthday
          <input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} autoComplete="bday" className="field !py-1.5" />
        </label>
        <label className="flex flex-col gap-0.5 text-xs text-gray-600 dark:text-gray-400">
          Gender
          <select value={gender} onChange={(e) => setGender(e.target.value)} className="field !py-1.5">
            <option value="">Not set</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
            <option value="prefer_not_to_say">Prefer not to say</option>
          </select>
        </label>
      </div>
      <div className="space-y-1.5">
        <p className="text-xs text-gray-600 dark:text-gray-400">Resume (PDF or Word, under 3MB), or paste a link</p>
        <FilePicker file={resumeFile} onChange={setResumeFile} accept={RESUME_ACCEPT} label="Choose resume" />
        <input
          type="url"
          value={resumeLink}
          onChange={(e) => setResumeLink(e.target.value)}
          placeholder="…or paste a link to your resume (https://)"
          aria-label="Resume link"
          className="field !py-1.5"
        />
      </div>
      <label className="flex flex-col gap-0.5 text-xs text-gray-600 dark:text-gray-400">
        Referred by (optional)
        <input
          value={referrerName}
          onChange={(e) => setReferrerName(e.target.value)}
          maxLength={120}
          placeholder="Type the name of the employee who referred you"
          className="field !py-1.5"
        />
      </label>
      <label className="flex flex-col gap-0.5 text-xs text-gray-600 dark:text-gray-400">
        About you (optional)
        <textarea rows={2} maxLength={2000} value={information} onChange={(e) => setInformation(e.target.value)} className="field !py-1.5" />
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
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [sent, setSent] = useState<string[]>([])
  const [zoom, setZoom] = useState<{ url: string; title: string } | null>(null)

  useEffect(() => {
    api
      .get<PublicOpening[]>('/hr/careers')
      .then(setOpenings)
      .catch(() => setError('We could not load the open positions. Please try again later.'))
  }, [])

  const selected = openings?.find((o) => o.id === selectedId) ?? null

  return (
    <div className="mx-auto min-h-svh max-w-6xl px-4 py-4">
      <div className="mb-3 flex items-center justify-between">
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

      {selected ? (
        // Focus view: only the chosen position. Poster and form sit side by
        // side and fit the window, so both are visible without scrolling.
        <div>
          <button
            type="button"
            onClick={() => setSelectedId(null)}
            className="mb-2 text-sm font-medium text-brand-600 hover:underline dark:text-brand-400"
          >
            ← All positions
          </button>
          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(25rem,28rem)]">
            <div className="space-y-3">
              {selected.bannerUrl && (
                <button
                  type="button"
                  onClick={() => setZoom({ url: selected.bannerUrl as string, title: selected.title })}
                  className="block w-full cursor-zoom-in overflow-hidden rounded-xl border border-black/10 bg-black/20 dark:border-white/10"
                  aria-label={`View the ${selected.title} poster full size`}
                >
                  <img
                    src={selected.bannerUrl}
                    alt={`${selected.title} poster`}
                    className="block h-auto max-h-[calc(100svh-15rem)] w-full object-contain"
                  />
                </button>
              )}
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{selected.title}</h2>
                {selected.department && <p className="text-sm text-gray-500 dark:text-gray-400">{selected.department}</p>}
                {selected.description && (
                  <p className="mt-1 whitespace-pre-line text-sm text-gray-700 dark:text-gray-300">{selected.description}</p>
                )}
              </div>
            </div>
            <Card className="!p-4">
              {sent.includes(selected.id) ? (
                <div>
                  <p className="rounded-md bg-green-500/10 px-3 py-2 text-sm text-green-700 dark:text-green-400">
                    Thank you! Your application was received. We will be in touch.
                  </p>
                  <Button className="mt-3" onClick={() => setSelectedId(null)}>
                    ← Back to all positions
                  </Button>
                </div>
              ) : (
                <>
                  <h3 className="mb-2 text-sm font-semibold text-gray-900 dark:text-gray-100">Apply for this position</h3>
                  <ApplyForm
                    opening={selected}
                      onCancel={() => setSelectedId(null)}
                    onDone={() => setSent((prev) => [...prev, selected.id])}
                  />
                </>
              )}
            </Card>
          </div>
        </div>
      ) : (
        <>
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        {!openings && !error && <p className="text-sm text-gray-500 dark:text-gray-400">Loading positions…</p>}
        {openings && openings.length === 0 && (
          <Card>
            <p className="text-sm text-gray-600 dark:text-gray-400">There are no open positions right now. Please check back soon.</p>
          </Card>
        )}


          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {openings?.map((o) => (
              <li key={o.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(o.id)}
                  className="flex h-full w-full flex-col overflow-hidden rounded-xl border border-black/10 bg-white/70 text-left transition hover:border-brand-500/60 hover:shadow-md dark:border-white/10 dark:bg-white/[0.04]"
                >
                  {o.bannerUrl && (
                    <span className="block aspect-[3/2] w-full bg-black/20">
                      <img src={o.bannerUrl} alt="" className="h-full w-full object-contain" />
                    </span>
                  )}
                  <span className="flex flex-1 flex-col gap-0.5 p-3">
                    <span className="font-semibold text-gray-900 dark:text-gray-100">{o.title}</span>
                    {o.department && <span className="text-xs text-gray-500 dark:text-gray-400">{o.department}</span>}
                    <span className="mt-2 text-xs font-medium text-brand-600 dark:text-brand-400">
                      {sent.includes(o.id) ? 'Application sent ✓' : 'View and apply →'}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
