// Run analytics computed from saved runs. Kept in sync with the backend's GET /api/runs/stats where they overlap.
import type { RunStats } from '../services/runs.ts'
import type { RunRecord } from '../types/route.ts'

/** Runs shorter than this are too short to give a meaningful pace (matches MIN_PACE_KM in backend runs.py). */
export const MIN_PACE_KM = 0.5
/** The hill model needs at least this many timed runs before its fit means anything. */
export const MIN_MODEL_RUNS = 3

const DAY_MS = 24 * 60 * 60 * 1000

const isTimed = (r: RunRecord) => r.distanceKm >= MIN_PACE_KM && r.durationSec > 0

/** Seconds per km, or null for runs too short to time. */
export function paceSecPerKm(run: RunRecord): number | null {
  return isTimed(run) ? run.durationSec / run.distanceKm : null
}

/** Metres climbed per km run: how hilly the run was. */
export function climbPerKm(run: RunRecord): number | null {
  return run.distanceKm > 0 ? run.elevationGain / run.distanceKm : null
}

/** Same numbers as GET /api/runs/stats, computed locally (for signed-out runs, or if the request fails). */
export function computeStats(runs: RunRecord[]): RunStats {
  const timed = runs.filter(isTimed)
  const timedKm = timed.reduce((s, r) => s + r.distanceKm, 0)
  const timedSec = timed.reduce((s, r) => s + r.durationSec, 0)
  const weekAgo = Date.now() - 7 * DAY_MS
  const week = runs.filter((r) => new Date(r.startedAt).getTime() >= weekAgo)
  return {
    runCount: runs.length,
    totalDistanceKm: runs.reduce((s, r) => s + r.distanceKm, 0),
    totalDurationSec: runs.reduce((s, r) => s + r.durationSec, 0),
    totalElevationGain: runs.reduce((s, r) => s + r.elevationGain, 0),
    // Total time ÷ total distance, so long runs count more than short ones (same as the backend)
    avgPaceSecPerKm: timedKm > 0 ? Math.round(timedSec / timedKm) : null,
    longestRunKm: Math.max(0, ...runs.map((r) => r.distanceKm)),
    fastestPaceSecPerKm: timed.length ? Math.round(Math.min(...timed.map((r) => r.durationSec / r.distanceKm))) : null,
    biggestClimb: Math.max(0, ...runs.map((r) => r.elevationGain)),
    thisWeek: { runCount: week.length, distanceKm: week.reduce((s, r) => s + r.distanceKm, 0) },
  }
}

export interface WeekBucket {
  /** Monday 00:00 local time. */
  start: Date
  distanceKm: number
  runCount: number
  elevationGain: number
}

/** Monday 00:00 of the week containing `date`, local time. */
function weekStart(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)) // getDay: Sun=0 … Sat=6 → days since Monday
  return d
}

/** Distance, runs and climbing per week for the last `weeks` weeks (oldest first, current week last). */
export function weeklyTotals(runs: RunRecord[], weeks = 8): WeekBucket[] {
  const thisWeek = weekStart(new Date())
  const buckets: WeekBucket[] = Array.from({ length: weeks }, (_, i) => {
    const start = new Date(thisWeek)
    start.setDate(start.getDate() - (weeks - 1 - i) * 7)
    return { start, distanceKm: 0, runCount: 0, elevationGain: 0 }
  })
  for (const run of runs) {
    const ws = weekStart(new Date(run.startedAt)).getTime()
    const bucket = buckets.find((b) => b.start.getTime() === ws)
    if (!bucket) continue
    bucket.distanceKm += run.distanceKm
    bucket.runCount += 1
    bucket.elevationGain += run.elevationGain
  }
  return buckets
}

export interface PacePoint {
  run: RunRecord
  date: Date
  paceSecPerKm: number
}

/** Timed runs as pace points, oldest first. */
export function paceTrend(runs: RunRecord[]): PacePoint[] {
  return runs
    .filter(isTimed)
    .map((run) => ({ run, date: new Date(run.startedAt), paceSecPerKm: run.durationSec / run.distanceKm }))
    .sort((a, b) => a.date.getTime() - b.date.getTime())
}

export interface HillPoint {
  run: RunRecord
  climbPerKm: number
  paceSecPerKm: number
}

export interface HillModel {
  points: HillPoint[]
  /** Seconds per km added for each extra metre of climbing per km. */
  slope: number
  /** Predicted pace on a flat route (seconds per km). */
  intercept: number
  /** How much of the pace variation hilliness explains, 0–1. */
  r2: number
}

/**
 * Personal hill model: a least-squares line through (hilliness, pace) over this runner's timed runs.
 * Returns null until there are enough runs with different hilliness to fit a line.
 */
export function hillModel(runs: RunRecord[]): HillModel | null {
  const points: HillPoint[] = runs.filter(isTimed).map((run) => ({
    run,
    climbPerKm: run.elevationGain / run.distanceKm,
    paceSecPerKm: run.durationSec / run.distanceKm,
  }))
  const n = points.length
  if (n < MIN_MODEL_RUNS) return null
  const meanX = points.reduce((s, p) => s + p.climbPerKm, 0) / n
  const meanY = points.reduce((s, p) => s + p.paceSecPerKm, 0) / n
  let sxx = 0
  let sxy = 0
  let syy = 0
  for (const p of points) {
    const dx = p.climbPerKm - meanX
    const dy = p.paceSecPerKm - meanY
    sxx += dx * dx
    sxy += dx * dy
    syy += dy * dy
  }
  if (sxx === 0) return null // every run equally hilly: no line to fit
  const slope = sxy / sxx
  const intercept = meanY - slope * meanX
  const r2 = syy === 0 ? 1 : (sxy * sxy) / (sxx * syy)
  return { points, slope, intercept, r2 }
}

/** Predicted time (seconds) for a route of this length and climb, from the runner's hill model. */
export function predictDurationSec(model: HillModel, distanceKm: number, elevationGain: number): number {
  const pace = model.intercept + model.slope * (distanceKm > 0 ? elevationGain / distanceKm : 0)
  return pace * distanceKm
}

/** 5:57 /km style pace. */
export function formatPaceSec(secPerKm: number | null): string {
  if (secPerKm === null || !Number.isFinite(secPerKm)) return '--:--'
  const s = Math.round(secPerKm)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** 4 h 48 m / 36 m style total time. */
export function formatTotalTime(totalSec: number): string {
  const h = Math.floor(totalSec / 3600)
  const m = Math.round((totalSec % 3600) / 60)
  return h > 0 ? `${h} h ${m} m` : `${m} m`
}
