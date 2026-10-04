import { CircleCheck, KeyRound, LogOut, Route as RouteIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { BottomNav } from './components/BottomNav.tsx'
import { AuthPage } from './pages/AuthPage.tsx'
import { AUTH_TOKEN_KEY } from './services/auth.ts'
import { ChangePasswordPage } from './pages/ChangePasswordPage.tsx'
import { HistoryPage } from './pages/HistoryPage.tsx'
import { PlanPage } from './pages/PlanPage.tsx'
import { RoutesPage } from './pages/RoutesPage.tsx'
import { RunPage } from './pages/RunPage.tsx'
import { AppStateProvider } from './state/AppStateProvider.tsx'

const AUTH_SESSION_KEY = 'desirepath-authenticated'
const AUTH_EMAIL_KEY = 'desirepath-user-email'
const WELCOME_TOAST_MS = 3500

/** Title shown top-left in the header bar. Plan + Routes both live under the Plan tab. */
function pageTitle(pathname: string): string {
  if (pathname.startsWith('/run')) return 'Run'
  if (pathname.startsWith('/history')) return 'History'
  return 'Desire Path'
}

function App() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const isAuthPage = pathname === '/login' || pathname === '/signup'
  const title = pageTitle(pathname)

  // Each page should open at the top, not wherever the previous page was scrolled to.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  const [isAuthenticated, setIsAuthenticated] = useState(
    () => sessionStorage.getItem(AUTH_SESSION_KEY) === 'true',
  )
  const accountEmail = isAuthenticated ? sessionStorage.getItem(AUTH_EMAIL_KEY) : null
  // One-off message shown as a toast right after signing in or up.
  const [welcome, setWelcome] = useState<string | null>(null)

  useEffect(() => {
    if (!welcome) return
    const id = setTimeout(() => setWelcome(null), WELCOME_TOAST_MS)
    return () => clearTimeout(id)
  }, [welcome])

  // Flipping isAuthenticated is enough to leave the login page: its route redirects home when signed in.
  const onAuthenticated = (email: string, message: string) => {
    sessionStorage.setItem(AUTH_SESSION_KEY, 'true')
    sessionStorage.setItem(AUTH_EMAIL_KEY, email.trim().toLowerCase())
    setIsAuthenticated(true)
    setWelcome(message)
  }

  const onLogout = () => {
    sessionStorage.removeItem(AUTH_SESSION_KEY)
    sessionStorage.removeItem(AUTH_EMAIL_KEY)
    sessionStorage.removeItem(AUTH_TOKEN_KEY)
    setIsAuthenticated(false)
    navigate('/')
  }

  return (
    <AppStateProvider key={accountEmail ?? 'anonymous'}>
      <div className="app">
        <header className="account-bar">
          {/* The page's own heading now lives here, so pages start straight with their content. */}
          <h1 className="account-bar__title">
            {title === 'Desire Path' && (
              <span className="account-bar__mark" aria-hidden="true">
                <RouteIcon strokeWidth={2.4} />
              </span>
            )}
            {title}
          </h1>

          {isAuthenticated ? (
            <>
              <div className="account-chip" title={accountEmail ?? undefined}>
                <span className="account-chip__avatar" aria-hidden="true">
                  {(accountEmail?.[0] ?? '?').toUpperCase()}
                </span>
                <span className="account-chip__text">
                  <span className="account-chip__status">
                    <i aria-hidden="true" />
                    Signed in
                  </span>
                  <span className="account-chip__email">{accountEmail}</span>
                </span>
              </div>
              <div className="account-bar__actions">
                <Link className="account-bar__button" to="/account/password">
                  <KeyRound aria-hidden="true" />
                  Password
                </Link>
                <button type="button" className="account-bar__button" onClick={onLogout}>
                  <LogOut aria-hidden="true" />
                  Log out
                </button>
              </div>
            </>
          ) : isAuthPage ? (
            <Link className="account-bar__button" to={pathname === '/login' ? '/signup' : '/login'}>
              {pathname === '/login' ? 'Create account' : 'Sign in'}
            </Link>
          ) : (
            <div className="account-bar__actions">
              <Link className="account-bar__button" to="/login">
                Sign in
              </Link>
              <Link className="account-bar__button account-bar__button--primary" to="/signup">
                Create account
              </Link>
            </div>
          )}
        </header>
        {welcome && (
          <p className="toast" role="status">
            <CircleCheck aria-hidden="true" />
            {welcome}
          </p>
        )}
        <Routes>
          {/* Signed in (just now, or already)? The login and sign-up pages send you home.
              replace: Back won't return to the form. */}
          <Route
            path="/login"
            element={isAuthenticated ? <Navigate to="/" replace /> : <AuthPage onAuthenticated={onAuthenticated} />}
          />
          <Route
            path="/signup"
            element={isAuthenticated ? <Navigate to="/" replace /> : <AuthPage onAuthenticated={onAuthenticated} />}
          />
          <Route
            path="/account/password"
            element={isAuthenticated ? <ChangePasswordPage /> : <Navigate to="/login" replace />}
          />
          <Route path="/" element={<PlanPage />} />
          <Route path="/routes" element={<RoutesPage />} />
          <Route path="/run" element={<RunPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        {!isAuthPage && <BottomNav />}
      </div>
    </AppStateProvider>
  )
}

export default App
