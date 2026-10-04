import { ArrowLeft, ArrowRight, LockKeyhole, Mail } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Logo } from '../components/Logo.tsx'
import { submitCredentials, type AuthMode } from '../services/auth.ts'
import './AuthPage.css'

export function AuthPage({ onAuthenticated }: { onAuthenticated: (email: string, message: string) => void }) {
  const { pathname } = useLocation()
  const mode: AuthMode = pathname === '/signup' ? 'signup' : 'login'
  const isSignup = mode === 'signup'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [feedback, setFeedback] = useState<{ kind: 'error' | 'success'; message: string } | null>(null)

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsSubmitting(true)
    setFeedback(null)

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
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </div>
          </div>

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
