import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import type { AuthUser } from '../../auth/types'
import { api, ApiError } from '../../services/api'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { PasswordInput } from '../../components/ui/PasswordInput'

export function SetPasswordPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const navigate = useNavigate()
  const { user, setSession } = useAuth()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (user) return <Navigate to="/" replace />

  if (!token) {
    return (
      <div className="flex min-h-svh items-center justify-center px-4 text-center">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          This setup link is missing a token. Ask your administrator for a new one.
        </p>
      </div>
    )
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }

    setSubmitting(true)
    try {
      const { token: jwt, user: loggedInUser } = await api.post<{ token: string; user: AuthUser }>(
        '/auth/set-password',
        { token, password },
      )
      setSession(jwt, loggedInUser)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not set your password')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center px-4">
      <Card className="w-full max-w-sm !p-8 shadow-xl">
        <div className="mb-6 flex flex-col items-center text-center">
          <img src={`${import.meta.env.BASE_URL}favicon.png`} alt="" className="h-12 w-12" />
          <h1 className="mt-3 text-xl font-bold tracking-tight text-gold-600 dark:text-gold-400">Set your password</h1>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="password" className="text-sm text-gray-600 dark:text-gray-400">
              New password
            </label>
            <PasswordInput
              id="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="confirm" className="text-sm text-gray-600 dark:text-gray-400">
              Confirm password
            </label>
            <PasswordInput
              id="confirm"
              required
              minLength={8}
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <Button type="submit" variant="primary" disabled={submitting} className="w-full">
            {submitting ? 'Setting password…' : 'Set password and log in'}
          </Button>
        </form>
      </Card>
    </div>
  )
}
