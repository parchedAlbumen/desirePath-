import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { generateRoutes } from '../services/api.ts'
import { stopSpeaking } from '../services/coach.ts'
import { loadRuns, saveRuns } from '../services/history.ts'
import type { GeneratedRoute, RouteRequest, RouteResponse, RunRecord } from '../types/route.ts'
import { AppStateContext, type AppState, type RunSession } from './context.ts'
import { DEMO_MODE, SIM_SPEED } from '../config.ts'
import { useGeolocation, type GpsFix } from '../hooks/useGeolocation.ts'
import { gradeAt, haversineKm, sampleRoute } from '../utils/geo.ts'

// Demo-mode runner: 6:05 min/km on the flat, slower uphill.
const BASE_PACE_MIN_PER_KM = 6.08
const TICK_MS = 500
// Readings vaguer than this (in metres) are too rough to measure a run with.
const MAX_ACCURACY_M = 30
// Ignore moves under 5 m: GPS drifts a few metres even when you stand still.
const MIN_STEP_KM = 0.005

function advance(run: RunSession, dtMs: number): RunSession {
  const total = run.route.distanceKm
  const grade = gradeAt(run.route.points, run.distanceKm, total)
  const pace = BASE_PACE_MIN_PER_KM * (1 + Math.max(-0.15, Math.min(0.5, grade * 0.04)))
  const distanceKm = Math.min(total, run.distanceKm + dtMs / 60000 / pace)
  return {
    ...run,
    elapsedMs: run.elapsedMs + dtMs,
    distanceKm,
    status: distanceKm >= total ? 'finished' : run.status,
  }
}

const makeId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<RouteRequest | null>(null)
  const [result, setResult] = useState<RouteResponse | null>(null)
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [run, setRun] = useState<RunSession | null>(null)
  const [history, setHistory] = useState<RunRecord[]>(loadRuns)
  const [coachOn, setCoachOn] = useState(true)

  useEffect(() => saveRuns(history), [history])

  // Every GPS reading comes through here; only trustworthy movement adds distance.
  const addGpsFix = useCallback((fix: GpsFix) => {
    setRun((r) => {
      if (!r || r.mode !== 'gps' || r.status !== 'running') return r
      if (fix.accuracy > MAX_ACCURACY_M) return r
      const point = { lat: fix.lat, lng: fix.lng }
      // First good reading: start measuring from here.
      if (!r.position) return { ...r, position: point }
      const stepKm = haversineKm(r.position, point)
      if (stepKm < MIN_STEP_KM) return r
      return { ...r, position: point, distanceKm: r.distanceKm + stepKm }
    })
  }, [])

  // Lives here (not on the Run page) so tracking continues if the runner switches tabs.
  const gpsWatch = useGeolocation(run?.mode === 'gps' && run.status === 'running', addGpsFix)

  const findRoutes = useCallback(async (req: RouteRequest) => {
    setLoading(true)
    try {
      const res = await generateRoutes(req)
      setRequest(req)
      setResult(res)
      // Medium is the sensible default pick, as in the design.
      setSelectedRouteId((res.routes.find((r) => r.difficulty === 'medium') ?? res.routes[0])?.id ?? null)
    } finally {
      setLoading(false)
    }
  }, [])

  const running = run?.status === 'running'
  useEffect(() => {
    if (!running) return
    let last = performance.now()
    const id = setInterval(() => {
      const now = performance.now()
      const dt = now - last
      last = now
      setRun((r) => {
        if (!r || r.status !== 'running') return r
        // Demo: the simulator moves the runner. GPS: only the clock ticks; distance comes from addGpsFix.
        return r.mode === 'demo' ? advance(r, dt * SIM_SPEED) : { ...r, elapsedMs: r.elapsedMs + dt }
      })
    }, TICK_MS)
    return () => clearInterval(id)
  }, [running])

  const startRun = useCallback(
    (route: GeneratedRoute) => {
      setSelectedRouteId(route.id)
      setRun({
        route,
        areaName: result?.area.name ?? '',
        status: 'running',
        startedAt: new Date().toISOString(),
        elapsedMs: 0,
        distanceKm: 0,
        mode: DEMO_MODE ? 'demo' : 'gps',
        position: null,
      })
    },
    [result],
  )

  const pauseRun = useCallback(() => setRun((r) => (r?.status === 'running' ? { ...r, status: 'paused' } : r)), [])
  // Clearing position on resume means walking around while paused doesn't count as distance.
  const resumeRun = useCallback(
    () => setRun((r) => (r?.status === 'paused' ? { ...r, status: 'running', position: null } : r)),
    [],
  )

  const endRun = useCallback(() => {
    stopSpeaking()
    if (!run) return
    if (run.distanceKm >= 0.05) {
      const { route } = run
      const fraction = run.distanceKm / route.distanceKm
      const done = route.points.slice(0, Math.max(1, Math.floor(fraction * (route.points.length - 1)) + 1))
      const record: RunRecord = {
        id: makeId(),
        routeId: route.id,
        routeName: route.name,
        startedAt: run.startedAt,
        durationSec: Math.round(run.elapsedMs / 1000),
        distanceKm: Math.round(run.distanceKm * 100) / 100,
        elevationGain: Math.round(route.elevationGain * fraction),
        points: [...done, sampleRoute(route.points, fraction)].map(({ lat, lng }) => ({ lat, lng })),
        plannedRoute: route,
      }
      setHistory((h) => [record, ...h])
    }
    setRun(null)
  }, [run])

  const value = useMemo<AppState>(
    () => ({
      request,
      result,
      selectedRouteId,
      loading,
      findRoutes,
      selectRoute: setSelectedRouteId,
      run,
      startRun,
      pauseRun,
      resumeRun,
      endRun,
      gps: { accuracy: gpsWatch.fix?.accuracy ?? null, error: gpsWatch.error },
      history,
      coachOn,
      setCoachOn,
    }),
    [
      request,
      result,
      selectedRouteId,
      loading,
      findRoutes,
      run,
      startRun,
      pauseRun,
      resumeRun,
      endRun,
      gpsWatch.fix,
      gpsWatch.error,
      history,
      coachOn,
    ],
  )

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>
}
