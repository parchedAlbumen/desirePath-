import type { PaceSample } from '../types/route.ts'

export interface PacePoint {
  km: number
  secPerKm: number
}

// Pace over a single 100 m step jumps around with GPS noise, so each point looks back about this far.
const WINDOW_KM = 0.3
const MIN_WINDOW_KM = 0.05
// Standing at a crossing shouldn't flatten the rest of the graph.
const MAX_SEC_PER_KM = 20 * 60

/** Smoothed pace along the run, one point per sample after the first. */
export function paceSeries(samples: PaceSample[]): PacePoint[] {
  const out: PacePoint[] = []
  for (let i = 1; i < samples.length; i++) {
    let j = i - 1
    while (j > 0 && samples[i].km - samples[j].km < WINDOW_KM) j--
    const km = samples[i].km - samples[j].km
    const sec = samples[i].t - samples[j].t
    if (km < MIN_WINDOW_KM || sec <= 0) continue
    out.push({ km: samples[i].km, secPerKm: Math.min(MAX_SEC_PER_KM, sec / km) })
  }
  return out
}
