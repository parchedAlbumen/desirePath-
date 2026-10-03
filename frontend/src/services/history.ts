// Run history lives in localStorage for now. Swap these for /api/runs calls once the
// backend stores runs in Tiger Data.
import type { RunRecord } from '../types/route.ts'
import { lookupArea } from '../utils/areas.ts'
import { buildLoop } from './mockRoutes.ts'

const KEY = 'desirepath.runs.v1'

export function loadRuns(): RunRecord[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as RunRecord[]
  } catch {
    // Private mode or corrupted data: fall through to the demo runs.
  }
  return demoRuns()
}

export function saveRuns(runs: RunRecord[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(runs))
  } catch {
    // Storage full or blocked; history just won't persist across reloads.
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
