import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { ApiError, useAuth } from '../../auth/AuthContext'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { PasswordInput } from '../../components/ui/PasswordInput'
import { useTheme } from '../../theme/ThemeContext'

export function LoginPage() {
  const { user, login } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (user) {
    const from = (location.state as { from?: string })?.from ?? '/'
    return <Navigate to={from} replace />
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await login(email, password)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to log in')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="relative flex min-h-svh items-center justify-center px-4">
      <button
        onClick={toggleTheme}
        className="absolute right-4 top-4 rounded-lg border border-black/10 bg-white/70 px-2.5 py-1.5 text-xs text-gray-700 backdrop-blur-sm dark:border-white/15 dark:bg-white/5 dark:text-gray-300"
      >
        {theme === 'dark' ? '☀️ Light' : '🌙 Dark'}
      </button>
      <Card className="w-full max-w-sm !p-8 shadow-xl">
        <div className="mb-6 flex flex-col items-center text-center">
          <img src={`${import.meta.env.BASE_URL}favicon.png`} alt="" className="h-12 w-12" />
          <h1 className="mt-3 text-xl font-bold tracking-tight text-gold-600 dark:text-gold-400">BPO Portal</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Sign in to continue</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="email" className="text-sm text-gray-600 dark:text-gray-400">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="field"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="password" className="text-sm text-gray-600 dark:text-gray-400">
              Password
            </label>
            <PasswordInput
              id="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <div className="text-right">
              <Link to="/forgot-password" className="text-sm text-brand-600 hover:underline dark:text-brand-400">
                Forgot password?
              </Link>
            </div>
          </div>
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <Button type="submit" variant="primary" disabled={submitting} className="w-full">
            {submitting ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      </Card>
    </div>
  )
}
