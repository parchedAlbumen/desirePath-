// Stand-in for the backend's route generator so the UI is usable before /api/routes/generate exists.
import type { Difficulty, GeneratedRoute, LatLng, RouteRequest, RouteResponse } from '../types/route.ts'
import { lookupArea } from '../utils/areas.ts'
import { elevationGain, offsetKm } from '../utils/geo.ts'
import { seededRandom } from '../utils/svgPath.ts'

const TAU = Math.PI * 2

// Rough running-time model: flat pace plus a minute per 100 m of climbing.
const MIN_PER_KM = 5.8
const minutesFor = (km: number, gain: number) => km * MIN_PER_KM + gain / 100

interface Template {
  difficulty: Difficulty
  terrain: string
  /** Multiplier on the requested distance, so the three routes land close to it. */
  distanceFactor: number
  /** Share of the requested min→max range this route climbs through. */
  band: number
  /** Number of climbs along the way. */
  humps: number
  heading: number
  seed: number
}

const TEMPLATES: Template[] = [
  // Difficulty comes from climbing (band/humps), not length: all three are about the requested distance.
  { difficulty: 'easy', terrain: 'Paved paths', distanceFactor: 0.95, band: 0.45, humps: 2, heading: 15, seed: 3 },
  { difficulty: 'medium', terrain: 'Mixed terrain', distanceFactor: 1, band: 0.8, humps: 3, heading: -5, seed: 7 },
  { difficulty: 'hard', terrain: 'Forest trails', distanceFactor: 1.05, band: 1, humps: 5, heading: -15, seed: 11 },
]

/** A wobbly closed loop that starts and ends at `start`, roughly `km` long. */
export function buildLoop(start: LatLng, km: number, seed: number, headingDeg: number, steps = 96): LatLng[] {
  const rand = seededRandom(seed)
  const r0 = km / TAU
  const a2 = 0.1 + rand() * 0.1
  const a3 = (rand() < 0.5 ? -1 : 1) * (0.05 + rand() * 0.07)
  const h = (headingDeg * Math.PI) / 180
  const hx = Math.sin(h)
  const hy = Math.cos(h)
  // Loop centre sits r0 away from the start along the heading; theta0 points back at the start.
  const theta0 = Math.atan2(-hy, -hx)
  const out: LatLng[] = []
  for (let i = 0; i <= steps; i++) {
    const d = (TAU * i) / steps
    const r = r0 * (1 + a2 * Math.sin(2 * d) + a3 * Math.sin(3 * d))
    out.push(offsetKm(start, hx * r0 + r * Math.cos(theta0 + d), hy * r0 + r * Math.sin(theta0 + d)))
  }
  return out
}

function elevationProfile(count: number, t: Template, lo: number, hi: number, targetAvg: number): number[] {
  const phase = seededRandom(t.seed * 31)() * TAU
  const raw = Array.from({ length: count }, (_, i) => {
    const x = i / (count - 1)
    return Math.sin(Math.PI * x) ** 0.8 * (0.55 + 0.45 * Math.sin(TAU * t.humps * x + phase))
  })
  const min = Math.min(...raw)
  const max = Math.max(...raw)
  const norm = raw.map((v) => (v - min) / (max - min || 1))
  // Bend the curve so the route's average lands near the requested average.
  const mean = norm.reduce((a, b) => a + b, 0) / norm.length
  const want = Math.min(0.85, Math.max(0.15, (targetAvg - lo) / (hi - lo || 1)))
  const gamma = Math.log(want) / Math.log(mean)
  return norm.map((v) => lo + (hi - lo) * v ** gamma)
}

export function mockGenerateRoutes(req: RouteRequest): RouteResponse {
  const gpsStart =
    req.startLat != null && req.startLng != null
      ? { lat: req.startLat, lng: req.startLng }
      : null
  const area = gpsStart
    ? {
        ...lookupArea(''),
        name: 'Your location',
        region: 'Canada',
        startLabel: 'Your location',
        start: gpsStart,
        routeNames: ['Nearby Easy Loop', 'Nearby Steady Loop', 'Nearby Hill Loop'] as [string, string, string],
      }
    : lookupArea(req.postalCode ?? '')
  const code = gpsStart ? 'gps' : (req.postalCode ?? '').replace(/\s/g, '')

  const timeBudget = req.targetTime.hours * 60 + req.targetTime.minutes

  const routes: GeneratedRoute[] = TEMPLATES.flatMap((t, idx): GeneratedRoute[] => {
    const hi = req.minElevation + t.band * (req.maxElevation - req.minElevation)
    const build = (km: number) => {
      const path = buildLoop(area.start, km, t.seed, t.heading)
      // Longer routes get more climbs (templates are tuned for ~6 km).
      const shape = { ...t, humps: Math.max(1, Math.round((t.humps * km) / 6)) }
      const elevations = elevationProfile(path.length, shape, req.minElevation, hi, req.avgElevation)
      return { km, path, elevations, gain: Math.round(elevationGain(elevations)) }
    }

    let r = build(Math.round(req.targetDistanceKm * t.distanceFactor * 10) / 10)
    // Too slow for the runner's time? Shorten the route to fit.
    if (minutesFor(r.km, r.gain) > timeBudget) {
      const fitKm = Math.floor(((timeBudget - r.gain / 100) / MIN_PER_KM) * 10) / 10
      if (fitKm < 0.5) return []
      r = build(fitKm)
    }

    return [{
      id: `${code}-${t.difficulty}`,
      name: area.routeNames[idx],
      difficulty: t.difficulty,
      terrain: t.terrain,
      distanceKm: r.km,
      elevationGain: r.gain,
      minElevation: Math.round(Math.min(...r.elevations)),
      avgElevation: Math.round(r.elevations.reduce((a, b) => a + b, 0) / r.elevations.length),
      maxElevation: Math.round(Math.max(...r.elevations)),
      estimatedMinutes: Math.round(minutesFor(r.km, r.gain)),
      points: r.path.map((p, i) => ({ ...p, elevation: Math.round(r.elevations[i] * 10) / 10 })),
    }]
  })

  return {
    area: { name: area.name, region: area.region, startLabel: area.startLabel, start: area.start },
    routes,
  }
}
