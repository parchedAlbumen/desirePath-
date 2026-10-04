// Run history stored on the backend (/api/runs). Every call needs the login token from services/auth.ts.
import type { GeneratedRoute, PaceSample, RunRecord } from '../types/route.ts'
import { AUTH_TOKEN_KEY } from './auth.ts'
import { ApiError, errorFromNetwork, errorFromResponse } from './httpError.ts'

const BASE = '/api/runs'
// A free-tier host can take a while to wake up, so don't give up too early.
const TIMEOUT_MS = 15_000

/** The shape the backend sends: camelCase like RunRecord, but id is a number and some fields can be null. */
interface ServerRun {
  id: number
  routeId: string | null
  routeName: string
  startedAt: string
  durationSec: number
  distanceKm: number
  elevationGain: number
  points: { lat: number; lng: number }[]
  plannedRoute: GeneratedRoute | null
  isFavorite: boolean
  paceSamples: PaceSample[]
}

export function hasAuthToken(): boolean {
  return sessionStorage.getItem(AUTH_TOKEN_KEY) !== null
}

/** Server ids are numbers; runs that haven't been saved to the backend yet have a local string id. */
export function isServerRunId(id: string): boolean {
  return /^\d+$/.test(id)
}

function fromServer(run: ServerRun): RunRecord {
  return {
    id: String(run.id),
    routeId: run.routeId ?? '',
    routeName: run.routeName,
    startedAt: run.startedAt,
    durationSec: run.durationSec,
    distanceKm: run.distanceKm,
    elevationGain: run.elevationGain,
    points: run.points,
    paceSamples: run.paceSamples,
    plannedRoute: run.plannedRoute ?? undefined,
    isFavorite: run.isFavorite,
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const what = `${init.method ?? 'GET'} ${BASE}${path}`
  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionStorage.getItem(AUTH_TOKEN_KEY) ?? ''}`,
      },
    })
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'TimeoutError') {
      console.error(`[api] ${what} timed out after ${TIMEOUT_MS / 1000}s`)
      throw new ApiError('The server took too long to respond.', null)
    }
    throw errorFromNetwork(what, cause)
  }
  if (!res.ok) throw await errorFromResponse(res, what)
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T)
}

/** All of this account's runs, newest first. */
export async function fetchRuns(): Promise<RunRecord[]> {
  return (await request<ServerRun[]>('?limit=200')).map(fromServer)
}

/** Saves a run. The local id is dropped; the backend assigns the real one. */
export async function createRun(run: RunRecord): Promise<RunRecord> {
  const { id: _localId, routeId, plannedRoute, ...rest } = run
  const saved = await request<ServerRun>('', {
    method: 'POST',
    body: JSON.stringify({ ...rest, routeId: routeId || null, plannedRoute: plannedRoute ?? null }),
  })
  return fromServer(saved)
}

export async function setRunFavorite(id: string, isFavorite: boolean): Promise<RunRecord> {
  return fromServer(await request<ServerRun>(`/${id}`, { method: 'PATCH', body: JSON.stringify({ isFavorite }) }))
}

export async function deleteRun(id: string): Promise<void> {
  await request<void>(`/${id}`, { method: 'DELETE' })
}

/** Totals and personal bests over all of this account's runs (GET /api/runs/stats). */
export interface RunStats {
  runCount: number
  totalDistanceKm: number
  totalDurationSec: number
  totalElevationGain: number
  /** Total time ÷ total distance; null until there's a run long enough to time. */
  avgPaceSecPerKm: number | null
  longestRunKm: number
  fastestPaceSecPerKm: number | null
  biggestClimb: number
  /** The last 7 days (not since Monday). */
  thisWeek: { runCount: number; distanceKm: number }
}

export async function fetchRunStats(): Promise<RunStats> {
  return request<RunStats>('/stats')
}
