import { createContext } from 'react'
import type { GeneratedRoute, RouteRequest, RouteResponse, RunRecord } from '../types/route.ts'

export type RunStatus = 'running' | 'paused' | 'finished'

export interface RunSession {
  route: GeneratedRoute
  areaName: string
  status: RunStatus
  startedAt: string
  elapsedMs: number
  distanceKm: number
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
  endRun: () => void

  history: RunRecord[]
  coachOn: boolean
  setCoachOn: (on: boolean) => void
}

export const AppStateContext = createContext<AppState | null>(null)
