import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { generateRoutes } from '../services/api.ts'
import { stopSpeaking } from '../services/coach.ts'
import { loadGuestRuns, mostRecentRuns, saveGuestRuns } from '../services/history.ts'
import { createRun, fetchRuns, hasAuthToken, isServerRunId, setRunFavorite } from '../services/runs.ts'
import type { GeneratedRoute, RouteRequest, RouteResponse, RunRecord } from '../types/route.ts'
import { AppStateContext, type AppState, type RunSession } from './context.ts'
import { DEMO_MODE, MIN_SAVE_KM, SIM_SPEED } from '../config.ts'
import { useGeolocation, type GpsFix } from '../hooks/useGeolocation.ts'
import { gradeAt, haversineKm, sampleRoute } from '../utils/geo.ts'

// Demo-mode runner: 6:05 min/km on the flat, slower uphill.
const BASE_PACE_MIN_PER_KM = 6.08
const TICK_MS = 500
// Readings vaguer than this (in metres) are too rough to measure a run with.
const MAX_ACCURACY_M = 30
// Ignore moves under 5 m: GPS drifts a few metres even when you stand still.
const MIN_STEP_KM = 0.005

// One pace sample per ~100 m: fine enough for a graph, small enough to store with every run.
const SAMPLE_EVERY_KM = 0.1

function withSample(run: RunSession): RunSession {
  const last = run.samples[run.samples.length - 1]
  if (run.distanceKm - last.km < SAMPLE_EVERY_KM) return run
  return { ...run, samples: [...run.samples, { t: run.elapsedMs / 1000, km: run.distanceKm }] }
}

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

const describe = (error: unknown) => (error instanceof Error ? error.message : '')

const makeId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<RouteRequest | null>(null)
  const [result, setResult] = useState<RouteResponse | null>(null)
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [run, setRun] = useState<RunSession | null>(null)
  // Signed in (has a login token): runs and favorites live on the backend. Signed out: runs are kept only
  // for this tab (sessionStorage) and can't be starred; saving them for good is a sign-in perk.
  const [useBackend] = useState(hasAuthToken)
  const [runs, setRuns] = useState<RunRecord[]>(() => (useBackend ? [] : loadGuestRuns()))
  const [syncError, setSyncError] = useState<string | null>(null)
  const [coachOn, setCoachOn] = useState(true)

  const history = useMemo(() => mostRecentRuns(runs), [runs])
  const favorites = useMemo(() => (useBackend ? runs.filter((r) => r.isFavorite) : []), [useBackend, runs])

  useEffect(() => {
    if (!useBackend) saveGuestRuns(runs)
  }, [useBackend, runs])

  useEffect(() => {
    if (!useBackend) return
    let cancelled = false
    fetchRuns()
      .then((serverRuns) => {
        if (cancelled) return
        setRuns(serverRuns)
        setSyncError(null)
      })
      .catch((error) => {
        console.warn('[history] Could not load runs from the backend:', error)
        if (!cancelled) setSyncError(`Couldn't load your runs from the server. ${describe(error)}`)
      })
    return () => {
      cancelled = true
    }
  }, [useBackend])

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
        return withSample(r.mode === 'demo' ? advance(r, dt * SIM_SPEED) : { ...r, elapsedMs: r.elapsedMs + dt })
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
        samples: [{ t: 0, km: 0 }],
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

  const endRun = useCallback((save = true) => {
    stopSpeaking()
    if (!run) return
    if (save && run.distanceKm > MIN_SAVE_KM) {
      const { route } = run
      const fraction = run.distanceKm / route.distanceKm
      const done = route.points.slice(0, Math.max(1, Math.floor(fraction * (route.points.length - 1)) + 1))
      // Close the graph at the exact finish, since the last 100 m sample can be a little behind.
      const last = run.samples[run.samples.length - 1]
      const samples = run.distanceKm > last.km ? [...run.samples, { t: run.elapsedMs / 1000, km: run.distanceKm }] : run.samples
      const record: RunRecord = {
        id: makeId(),
        routeId: route.id,
        routeName: route.name,
        startedAt: run.startedAt,
        durationSec: Math.round(run.elapsedMs / 1000),
        distanceKm: Math.round(run.distanceKm * 100) / 100,
        elevationGain: Math.round(route.elevationGain * fraction),
        points: [...done, sampleRoute(route.points, fraction)].map(({ lat, lng }) => ({ lat, lng })),
        paceSamples: samples.map((s) => ({ t: Math.round(s.t * 10) / 10, km: Math.round(s.km * 1000) / 1000 })),
        plannedRoute: route,
      }
      setRuns((rs) => [record, ...rs])
      if (useBackend) {
        // Show it straight away, then swap in the backend's copy (which has the real id).
        createRun(record)
          .then((saved) => {
            setRuns((rs) => rs.map((r) => (r.id === record.id ? saved : r)))
            setSyncError(null)
          })
          .catch((error) => {
            console.warn('[history] Could not save the run to the backend:', error)
            setSyncError(`Your run wasn't saved to the server. ${describe(error)}`)
          })
      }
    }
    setRun(null)
  }, [run, useBackend])

  const toggleFavorite = useCallback(
    async (target: RunRecord) => {
      const makeFavorite = !favorites.some((f) => f.id === target.id)
      if (!useBackend) throw new Error('Sign in to save favorites.') // the page asks guests to sign in first
      const replace = (id: string, run: RunRecord) => setRuns((rs) => rs.map((r) => (r.id === id ? run : r)))
      replace(target.id, { ...target, isFavorite: makeFavorite }) // optimistic
      try {
        // A run that never reached the backend (it was down when the run ended) is saved now.
        const saved = isServerRunId(target.id)
          ? await setRunFavorite(target.id, makeFavorite)
          : await createRun({ ...target, isFavorite: makeFavorite })
        replace(target.id, saved)
        return makeFavorite
      } catch (error) {
        replace(target.id, target)
        throw error
      }
    },
    [favorites, useBackend],
  )

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
      allRuns: runs,
      favorites,
      signedIn: useBackend,
      syncError,
      toggleFavorite,
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
      runs,
      favorites,
      useBackend,
      syncError,
      toggleFavorite,
      coachOn,
    ],
  )

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>
}
