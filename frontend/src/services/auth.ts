import { errorFromNetwork, errorFromResponse } from './httpError.ts'

export interface Credentials {
  email: string
  password: string
}

export type AuthMode = 'login' | 'signup'

export const AUTH_TOKEN_KEY = 'desirepath-token'

// The backend calls sign-up "register" (see backend/app/routers/auth.py)
const ENDPOINTS: Record<AuthMode, string> = {
  login: '/api/auth/login',
  signup: '/api/auth/register',
}

/** Signs up or logs in, stores the JWT, and resolves with the account's email as the backend saved it. */
export async function submitCredentials(mode: AuthMode, credentials: Credentials): Promise<string> {
  const what = mode === 'signup' ? 'Sign up' : 'Login'
  let response: Response
  try {
    response = await fetch(ENDPOINTS[mode], {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
    })
  } catch (cause) {
    throw errorFromNetwork(what, cause)
  }

  // Shows the server's own message when it sent one (e.g. "Email already registered"),
  // otherwise says what the status code means. Details go to the console either way.
  if (!response.ok) throw await errorFromResponse(response, what)

  const body = await response.json()
  // Keep the JWT so later API calls can send "Authorization: Bearer <token>"
  sessionStorage.setItem(AUTH_TOKEN_KEY, body.access_token)
  return body.user?.email ?? credentials.email
}

/** Changes the logged-in user's password. Rejects with the backend's message, e.g. "Current password is wrong". */
export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  const what = 'Change password'
  let response: Response
  try {
    response = await fetch('/api/auth/password', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionStorage.getItem(AUTH_TOKEN_KEY) ?? ''}`,
      },
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
    })
  } catch (cause) {
    throw errorFromNetwork(what, cause)
  }
  if (!response.ok) throw await errorFromResponse(response, what)
}
