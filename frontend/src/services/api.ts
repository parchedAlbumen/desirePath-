import type { RouteRequest, RouteResponse } from '../types/route.ts'
import { errorFromNetwork, errorFromResponse } from './httpError.ts'
import { mockGenerateRoutes } from './mockRoutes.ts'

// Relative URL: Vite proxies /api to the Python backend on :8000 in dev.
const BASE = '/api'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const what = `${init?.method ?? 'GET'} ${path}`
  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...init,
    })
  } catch (cause) {
    throw errorFromNetwork(what, cause)
  }
  if (!res.ok) throw await errorFromResponse(res, what)
  return res.json() as Promise<T>
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export async function generateRoutes(body: RouteRequest): Promise<RouteResponse> {
  try {
    return await request<RouteResponse>('/routes/generate', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  } catch (err) {
    // Backend not running or endpoint not built yet: keep the UI demoable.
    console.warn('[api] Using mock routes because the backend failed:', err instanceof Error ? err.message : err)
    await delay(600)
    return mockGenerateRoutes(body)
  }
}
