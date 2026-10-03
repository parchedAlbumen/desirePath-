import { Route } from 'lucide-react'
import { APP_NAME, APP_TAGLINE } from '../config.ts'

export function Logo() {
  return (
    <div className="logo">
      <div className="logo__mark" aria-hidden="true">
        <Route strokeWidth={2.4} />
      </div>
      <div>
        <div className="logo__name">{APP_NAME}</div>
        <div className="logo__tagline">{APP_TAGLINE}</div>
      </div>
    </div>
  )
}
