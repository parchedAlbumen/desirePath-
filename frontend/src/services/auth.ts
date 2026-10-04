export interface Credentials {
  email: string
  password: string
}

export type AuthMode = 'login' | 'signup'

export async function submitCredentials(mode: AuthMode, credentials: Credentials): Promise<void> {
  const response = await fetch(`/api/auth/${mode}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials),
  })

  if (!response.ok) {
    throw new Error(`${mode === 'signup' ? 'Sign up' : 'Login'} failed: ${response.status}`)
  }
}
