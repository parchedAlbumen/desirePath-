import { createContext } from 'react'
import type { GeneratedRoute, LatLng, RouteRequest, RouteResponse, RunRecord } from '../types/route.ts'

export type RunStatus = 'running' | 'paused' | 'finished'

/** gps: distance from real location. demo: simulated runner (open the app with ?demo). */
export type RunMode = 'gps' | 'demo'

export interface RunSession {
  route: GeneratedRoute
  areaName: string
  status: RunStatus
  startedAt: string
  elapsedMs: number
  distanceKm: number
  mode: RunMode
  /** Last trusted GPS position (GPS mode only). Distance is measured from here. */
  position: LatLng | null
}

export interface AppState {
  request: RouteRequest | null
  result: RouteResponse | null
  selectedRouteId: string | null
  loading: boolean
  findRoutes: (req: RouteRequest) => Promise<void>
  selectRoute: (id: string) => void

  run: RunSession | null
  startRun: (route: GeneratedRoute) => void
  pauseRun: () => void
  resumeRun: () => void
  endRun: (save?: boolean) => void
  /** GPS status for the live run screen. */
  gps: { accuracy: number | null; error: string | null }

  /** The most recent runs (what the history list shows). */
  history: RunRecord[]
  /** Starred runs. Signed in: stored on the backend. Signed out: browser storage. */
  favorites: RunRecord[]
  /** Set when saving or loading runs on the backend failed; null once something succeeds. */
  syncError: string | null
  /** Stars or unstars a run. Resolves with the new state; rejects if it couldn't be saved. */
  toggleFavorite: (run: RunRecord) => Promise<boolean>
  coachOn: boolean
  setCoachOn: (on: boolean) => void
}

export const AppStateContext = createContext<AppState | null>(null)
