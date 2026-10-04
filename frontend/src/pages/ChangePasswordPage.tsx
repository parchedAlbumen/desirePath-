import { ArrowLeft, ArrowRight, KeyRound, LockKeyhole, ShieldCheck } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Logo } from '../components/Logo.tsx'
import { changePassword } from '../services/auth.ts'
import './AuthPage.css'

// Matches the backend's ChangePasswordRequest (backend/app/schemas/auth.py).
const MIN_PASSWORD_LENGTH = 8

// Reuses the sign-in page's look (AuthPage.css).
export function ChangePasswordPage() {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [feedback, setFeedback] = useState<{ kind: 'error' | 'success'; message: string } | null>(null)

  const confirmTouched = confirmPassword.length > 0
  const passwordsMatch = newPassword === confirmPassword

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFeedback(null)
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setFeedback({ kind: 'error', message: `New password must be at least ${MIN_PASSWORD_LENGTH} characters.` })
      return
    }
    if (!passwordsMatch) {
      setFeedback({ kind: 'error', message: 'New passwords don’t match. Please re-enter them.' })
      return
    }
    setIsSubmitting(true)
    try {
      await changePassword(currentPassword, newPassword)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setFeedback({ kind: 'success', message: 'Password changed. Use the new one next time you sign in.' })
    } catch (error) {
      setFeedback({
        kind: 'error',
        message: error instanceof Error ? error.message : 'Something went wrong. Please try again.',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const clearFeedback = () => setFeedback(null) // an old message is stale once you edit

  return (
    <main className="auth page">
      <header className="auth__header">
        <Logo />
        <Link to="/" className="auth__back">
          <ArrowLeft aria-hidden="true" />
          Back to routes
        </Link>
      </header>

      <section className="auth__content" aria-labelledby="change-password-title">
        <p className="eyebrow">Your account</p>
        <h1 className="auth__title" id="change-password-title">
          Change your password.
        </h1>
        <p className="auth__lede">Enter your current password, then pick a new one.</p>

        <form className="auth__form" onSubmit={onSubmit}>
          <div className="field">
            <label className="field__label" htmlFor="current-password">
              Current password
            </label>
            <div className="auth__input">
              <KeyRound aria-hidden="true" />
              <input
                id="current-password"
                name="current-password"
                type="password"
                autoComplete="current-password"
                placeholder="Your current password"
                value={currentPassword}
                onChange={(event) => {
                  setCurrentPassword(event.target.value)
                  clearFeedback()
                }}
                required
              />
            </div>
          </div>

          <div className="field">
            <label className="field__label" htmlFor="new-password">
              New password
            </label>
            <div className="auth__input">
              <LockKeyhole aria-hidden="true" />
              <input
                id="new-password"
                name="new-password"
                type="password"
                autoComplete="new-password"
                placeholder="Enter a new password"
                value={newPassword}
                onChange={(event) => {
                  setNewPassword(event.target.value)
                  clearFeedback()
                }}
                aria-describedby="new-password-hint"
                required
              />
            </div>
            <p className="auth__hint" id="new-password-hint">
              At least {MIN_PASSWORD_LENGTH} characters.
            </p>
          </div>

          <div className="field">
            <label className="field__label" htmlFor="confirm-new-password">
              Confirm new password
            </label>
            <div className={`auth__input${confirmTouched && !passwordsMatch ? ' is-invalid' : ''}`}>
              <ShieldCheck aria-hidden="true" />
              <input
                id="confirm-new-password"
                name="confirm-new-password"
                type="password"
                autoComplete="new-password"
                placeholder="Re-enter the new password"
                value={confirmPassword}
                onChange={(event) => {
                  setConfirmPassword(event.target.value)
                  clearFeedback()
                }}
                aria-invalid={(confirmTouched && !passwordsMatch) || undefined}
                aria-describedby="confirm-new-hint"
                required
              />
            </div>
            {confirmTouched && (
              <p
                id="confirm-new-hint"
                className={`auth__hint ${passwordsMatch ? 'auth__hint--ok' : 'auth__hint--error'}`}
                aria-live="polite"
              >
                {passwordsMatch ? 'Passwords match.' : 'Passwords don’t match.'}
              </p>
            )}
          </div>

          {feedback && (
            <p className={`auth__feedback auth__feedback--${feedback.kind}`} role={feedback.kind === 'error' ? 'alert' : 'status'}>
              {feedback.message}
            </p>
          )}

          <button type="submit" className="btn btn--primary btn--block auth__submit" disabled={isSubmitting}>
            {isSubmitting ? 'Please wait…' : 'Change password'}
            {!isSubmitting && <ArrowRight aria-hidden="true" />}
          </button>
        </form>
      </section>
    </main>
  )
}
