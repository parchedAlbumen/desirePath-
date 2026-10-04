import { CircleUserRound, KeyRound, LogOut } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

interface AccountMenuProps {
  email: string | null
  onLogout: () => void
}

/** Account icon in the header. Tapping it opens a small menu: who's signed in, change password, log out. */
export function AccountMenu({ email, onLogout }: AccountMenuProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  // Close when tapping anywhere outside the menu, or pressing Escape.
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div className="account-menu" ref={rootRef}>
      <button
        type="button"
        className="account-avatar"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account menu, signed in as ${email ?? ''}`}
        title={email ?? undefined}
        onClick={() => setOpen((v) => !v)}
      >
        <CircleUserRound strokeWidth={2} />
        <i aria-hidden="true" />
      </button>

      {open && (
        <div className="account-menu__panel" role="menu">
          <p className="account-menu__who">
            Signed in as
            <strong>{email}</strong>
          </p>
          <Link role="menuitem" className="account-menu__item" to="/account/password" onClick={() => setOpen(false)}>
            <KeyRound aria-hidden="true" />
            Change password
          </Link>
          <button
            type="button"
            role="menuitem"
            className="account-menu__item"
            onClick={() => {
              setOpen(false)
              onLogout()
            }}
          >
            <LogOut aria-hidden="true" />
            Log out
          </button>
        </div>
      )}
    </div>
  )
}
