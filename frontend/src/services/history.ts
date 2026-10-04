// Run history lives in browser storage for now. Scope it to the signed-in email until
// the backend stores authenticated runs.
import type { RunRecord } from '../types/route.ts'
import { lookupArea } from '../utils/areas.ts'
import { buildLoop } from './mockRoutes.ts'

const KEY = 'desirepath.runs.v1'
const FAVORITES_KEY = 'desirepath.favorite-runs.v1'
export const MAX_SAVED_RUNS = 2

function runsKey(email: string | null): string {
  const user = email?.trim().toLowerCase()
  return user ? `${KEY}.${encodeURIComponent(user)}` : KEY
}

function favoritesKey(email: string | null): string {
  const user = email?.trim().toLowerCase()
  return `${FAVORITES_KEY}.${user ? encodeURIComponent(user) : 'anonymous'}`
}

export function loadFavoriteRunIds(email: string | null): string[] {
  try {
    const raw = localStorage.getItem(favoritesKey(email))
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (Array.isArray(parsed) && parsed.every((id): id is string => typeof id === 'string')) return parsed
    throw new Error('Saved favorite runs are not a list of run IDs.')
  } catch (error) {
    console.warn('[history] Could not load favorite runs:', error)
    return []
  }
}

export function saveFavoriteRunIds(email: string | null, ids: string[]): void {
  localStorage.setItem(favoritesKey(email), JSON.stringify(ids))
}

export function mostRecentRuns(runs: RunRecord[]): RunRecord[] {
  return [...runs].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, MAX_SAVED_RUNS)
}

export function loadRuns(email: string | null): RunRecord[] {
  try {
    const raw = localStorage.getItem(runsKey(email))
    if (raw) {
      const parsed: unknown = JSON.parse(raw)
      if (Array.isArray(parsed)) return mostRecentRuns(parsed as RunRecord[])
      throw new Error('Saved run history is not a list.')
    }
  } catch (error) {
    console.warn('[history] Could not load run history:', error)
  }
  return email ? [] : demoRuns()
}

export function saveRuns(email: string | null, runs: RunRecord[]): void {
  try {
    localStorage.setItem(runsKey(email), JSON.stringify(mostRecentRuns(runs)))
  } catch (error) {
    console.warn('[history] Could not save run history:', error)
  }
}

/** Sample history so the screen isn't empty on first launch. */
function demoRuns(): RunRecord[] {
  const start = lookupArea('V5A').start
  const seeds: [string, string, number, number, number, number, number][] = [
    ['2026-10-02T07:12', 'Mountain Connector', 6.4, 2344, 185, 7, -5],
    ['2026-09-30T06:48', 'Campus Loop', 4.2, 1538, 65, 3, 15],
    ['2026-09-28T08:05', 'Conservation Loop', 8.1, 3159, 310, 11, -15],
    ['2026-09-25T17:32', 'Mountain Out & Back', 5.8, 2175, 185, 19, 30],
    ['2026-09-22T07:04', 'Campus Loop', 4.2, 1572, 65, 3, 15],
  ]
  return seeds.map(([startedAt, routeName, distanceKm, durationSec, elevationGain, seed, heading], i) => ({
    id: `demo-${i}`,
    routeId: `demo-${routeName}`,
    routeName,
    startedAt: new Date(startedAt).toISOString(),
    durationSec,
    distanceKm,
    elevationGain,
    points: buildLoop(start, distanceKm, seed, heading, 48),
  }))
}
