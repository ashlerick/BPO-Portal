import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { api, ApiError } from '../../services/api'
import { useTheme } from '../../theme/ThemeContext'

// Public careers page: no sign-in. Lists open positions (with banner image)
// and takes applications, which land in HR's Recruitment page.

interface PublicOpening {
  id: string
  title: string
  department: string | null
  description: string | null
  bannerUrl: string | null
}

function ApplyForm({ opening, onDone }: { opening: PublicOpening; onDone: () => void }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [information, setInformation] = useState('')
  const [resumeLink, setResumeLink] = useState('')
  const [website, setWebsite] = useState('') // honeypot, hidden from people
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api.post('/hr/careers', {
        jobOpeningId: opening.id,
        name,
        email,
        phone,
        information,
        resumeLink,
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
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm text-gray-600 dark:text-gray-400">
          Full name
          <input required value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" className="field" />
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
          Resume link (optional)
          <input type="url" value={resumeLink} onChange={(e) => setResumeLink(e.target.value)} placeholder="https://…" className="field" />
        </label>
      </div>
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
      <Button type="submit" variant="primary" disabled={busy}>
        {busy ? 'Sending…' : 'Submit application'}
      </Button>
    </form>
  )
}

export function CareersPage() {
  const { theme, toggleTheme } = useTheme()
  const [openings, setOpenings] = useState<PublicOpening[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [applying, setApplying] = useState<string | null>(null)
  const [sent, setSent] = useState<string[]>([])

  useEffect(() => {
    api
      .get<PublicOpening[]>('/hr/careers')
      .then(setOpenings)
      .catch(() => setError('We could not load the open positions. Please try again later.'))
  }, [])

  return (
    <div className="mx-auto min-h-svh max-w-3xl px-4 py-8">
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

      <ul className="space-y-4">
        {openings?.map((o) => (
          <li key={o.id}>
            <Card className="overflow-hidden !p-0">
              {o.bannerUrl && <img src={o.bannerUrl} alt="" className="h-40 w-full object-cover sm:h-52" />}
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

      <p className="mt-8 text-center text-xs text-gray-500 dark:text-gray-400">
        Employee?{' '}
        <Link to="/login" className="text-brand-600 dark:text-brand-400">
          Sign in to the portal
        </Link>
      </p>
    </div>
  )
}
