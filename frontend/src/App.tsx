import { LogOut } from 'lucide-react'
import { useState } from 'react'
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { BottomNav } from './components/BottomNav.tsx'
import { AuthPage } from './pages/AuthPage.tsx'
import { HistoryPage } from './pages/HistoryPage.tsx'
import { PlanPage } from './pages/PlanPage.tsx'
import { RoutesPage } from './pages/RoutesPage.tsx'
import { RunPage } from './pages/RunPage.tsx'
import { AppStateProvider } from './state/AppStateProvider.tsx'

const AUTH_SESSION_KEY = 'desirepath-authenticated'
const AUTH_EMAIL_KEY = 'desirepath-user-email'

function App() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const isAuthPage = pathname === '/login' || pathname === '/signup'
  const [isAuthenticated, setIsAuthenticated] = useState(
    () => sessionStorage.getItem(AUTH_SESSION_KEY) === 'true',
  )

  const onAuthenticated = (email: string) => {
    sessionStorage.setItem(AUTH_SESSION_KEY, 'true')
    sessionStorage.setItem(AUTH_EMAIL_KEY, email.trim().toLowerCase())
    setIsAuthenticated(true)
  }

  const onLogout = () => {
    sessionStorage.removeItem(AUTH_SESSION_KEY)
    sessionStorage.removeItem(AUTH_EMAIL_KEY)
    setIsAuthenticated(false)
    navigate('/')
  }

  return (
    <AppStateProvider>
      <div className="app">
        <header className="account-bar">
          {isAuthenticated ? (
            <button type="button" className="account-bar__button" onClick={onLogout}>
              <LogOut aria-hidden="true" />
              Log out
            </button>
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
        <Routes>
          <Route path="/login" element={<AuthPage onAuthenticated={onAuthenticated} />} />
          <Route path="/signup" element={<AuthPage onAuthenticated={onAuthenticated} />} />
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
