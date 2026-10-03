import { Activity, ChartNoAxesColumn, Route, type LucideIcon } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { useAppState } from '../hooks/useAppState.ts'

interface Tab {
  to: string
  label: string
  icon: LucideIcon
  active: (path: string) => boolean
}

export function BottomNav() {
  const { pathname } = useLocation()
  const { result, run } = useAppState()

  const tabs: Tab[] = [
    // Plan returns to the route results if we already have some; the form is one tap away from there.
    { to: result ? '/routes' : '/', label: 'Plan', icon: Route, active: (p) => p === '/' || p === '/routes' },
    { to: '/run', label: 'Run', icon: Activity, active: (p) => p === '/run' },
    { to: '/history', label: 'History', icon: ChartNoAxesColumn, active: (p) => p === '/history' },
  ]

  return (
    <nav className="bottom-nav" aria-label="Main">
      {tabs.map(({ to, label, icon: Icon, active }) => {
        const isActive = active(pathname)
        return (
          <Link key={label} to={to} className={`bottom-nav__tab${isActive ? ' is-active' : ''}`} aria-current={isActive ? 'page' : undefined}>
            <span className="bottom-nav__icon">
              <Icon strokeWidth={1.8} />
              {label === 'Run' && run && run.status !== 'finished' && <i className="bottom-nav__live" aria-label="Run in progress" />}
            </span>
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
