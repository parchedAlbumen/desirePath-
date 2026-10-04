import { ArrowLeft, ArrowRight, LockKeyhole, Mail, ShieldCheck } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Logo } from '../components/Logo.tsx'
import { submitCredentials, type AuthMode } from '../services/auth.ts'
import './AuthPage.css'

// Matches the backend's RegisterRequest (backend/app/schemas/auth.py).
const MIN_PASSWORD_LENGTH = 8

export function AuthPage({ onAuthenticated }: { onAuthenticated: (email: string, message: string) => void }) {
  const { pathname } = useLocation()
  const mode: AuthMode = pathname === '/signup' ? 'signup' : 'login'
  const isSignup = mode === 'signup'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [feedback, setFeedback] = useState<{ kind: 'error' | 'success'; message: string } | null>(null)

  // Only judge the confirmation once something has been typed in it.
  const confirmTouched = confirmPassword.length > 0
  const passwordsMatch = password === confirmPassword

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFeedback(null)

    // Catch sign-up mistakes here instead of sending them to the backend.
    if (isSignup) {
      if (password.length < MIN_PASSWORD_LENGTH) {
        setFeedback({ kind: 'error', message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` })
        return
      }
      if (!passwordsMatch) {
        setFeedback({ kind: 'error', message: 'Passwords don’t match. Please re-enter them.' })
        return
      }
    }

    setIsSubmitting(true)

    try {
      const accountEmail = await submitCredentials(mode, { email, password })
      // App takes it from here: it sends you home and shows this as a welcome toast.
      onAuthenticated(
        accountEmail,
        isSignup ? 'Account created. Welcome to desirePath!' : 'Welcome back! You’re signed in.',
      )
    } catch (error) {
      setFeedback({
        kind: 'error',
        message: error instanceof Error ? error.message : 'Something went wrong. Please try again.',
      })
      setIsSubmitting(false)
    }
  }

  return (
    <main className="auth page">
      <header className="auth__header">
        <Logo />
        <Link to="/" className="auth__back">
          <ArrowLeft aria-hidden="true" />
          Back to routes
        </Link>
      </header>

      <section className="auth__content" aria-labelledby="auth-title">
        <p className="eyebrow">{isSignup ? 'Start your journey' : 'Welcome back'}</p>
        <h1 className="auth__title" id="auth-title">
          {isSignup ? 'Make space for more.' : 'Ready for another run?'}
        </h1>
        <p className="auth__lede">
          {isSignup
            ? 'Create an account and find your next favorite route.'
            : 'Sign in to pick up where your next run begins.'}
        </p>

        <form className="auth__form" onSubmit={onSubmit}>
          <div className="field">
            <label className="field__label" htmlFor="email">
              Email address
            </label>
            <div className="auth__input">
              <Mail aria-hidden="true" />
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>
          </div>

          <div className="field">
            <label className="field__label" htmlFor="password">
              Password
            </label>
            <div className="auth__input">
              <LockKeyhole aria-hidden="true" />
              <input
                id="password"
                name="password"
                type="password"
                autoComplete={isSignup ? 'new-password' : 'current-password'}
                placeholder="Enter your password"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value)
                  setFeedback(null) // an old "too short"/"don't match" error is stale once you edit
                }}
                aria-describedby={isSignup ? 'password-hint' : undefined}
                required
              />
            </div>
            {isSignup && (
              <p className="auth__hint" id="password-hint">
                At least {MIN_PASSWORD_LENGTH} characters.
              </p>
            )}
          </div>

          {isSignup && (
            <div className="field">
              <label className="field__label" htmlFor="confirm-password">
                Confirm password
              </label>
              <div className={`auth__input${confirmTouched && !passwordsMatch ? ' is-invalid' : ''}`}>
                <ShieldCheck aria-hidden="true" />
                <input
                  id="confirm-password"
                  name="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Re-enter your password"
                  value={confirmPassword}
                  onChange={(event) => {
                    setConfirmPassword(event.target.value)
                    setFeedback(null)
                  }}
                  aria-invalid={(confirmTouched && !passwordsMatch) || undefined}
                  aria-describedby="confirm-hint"
                  required
                />
              </div>
              {confirmTouched && (
                <p
                  id="confirm-hint"
                  className={`auth__hint ${passwordsMatch ? 'auth__hint--ok' : 'auth__hint--error'}`}
                  aria-live="polite"
                >
                  {passwordsMatch ? 'Passwords match.' : 'Passwords don’t match.'}
                </p>
              )}
            </div>
          )}

          {feedback && (
            <p className={`auth__feedback auth__feedback--${feedback.kind}`} role={feedback.kind === 'error' ? 'alert' : 'status'}>
              {feedback.message}
            </p>
          )}

          <button type="submit" className="btn btn--primary btn--block auth__submit" disabled={isSubmitting}>
            {isSubmitting ? 'Please wait…' : isSignup ? 'Create account' : 'Sign in'}
            {!isSubmitting && <ArrowRight aria-hidden="true" />}
          </button>
        </form>

        <p className="auth__switch">
          {isSignup ? 'Already have an account?' : 'New to desirePath?'}{' '}
          <Link to={isSignup ? '/login' : '/signup'}>{isSignup ? 'Sign in' : 'Create an account'}</Link>
        </p>
      </section>
    </main>
  )
}
