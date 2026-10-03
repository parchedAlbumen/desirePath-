import type { RouteRequest, RouteResponse } from '../types/route.ts'
import { mockGenerateRoutes } from './mockRoutes.ts'

// Relative URL: Vite proxies /api to the Python backend on :8000 in dev.
const BASE = '/api'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!res.ok) {
    throw new Error(`${init?.method ?? 'GET'} ${path} failed: ${res.status}`)
  }
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
    console.info('[api] Using mock routes:', err)
    await delay(600)
    return mockGenerateRoutes(body)
  }
}
