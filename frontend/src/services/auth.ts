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

export async function submitCredentials(mode: AuthMode, credentials: Credentials): Promise<void> {
  const response = await fetch(ENDPOINTS[mode], {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials),
  })

  const body = await response.json().catch(() => null)

  if (!response.ok) {
    // FastAPI puts a string in "detail" for 401/409, and a list of field errors for 422
    const detail = body?.detail
    const message = typeof detail === 'string' ? detail : Array.isArray(detail) ? detail[0]?.msg : null
    throw new Error(message ?? `${mode === 'signup' ? 'Sign up' : 'Login'} failed: ${response.status}`)
  }

  // Keep the JWT so later API calls can send "Authorization: Bearer <token>"
  sessionStorage.setItem(AUTH_TOKEN_KEY, body.access_token)
}
