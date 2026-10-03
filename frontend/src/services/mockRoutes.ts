// Stand-in for the backend's route generator so the UI is usable before /api/routes/generate exists.
import type { Difficulty, GeneratedRoute, LatLng, RouteRequest, RouteResponse } from '../types/route.ts'
import { lookupArea } from '../utils/areas.ts'
import { elevationGain, offsetKm } from '../utils/geo.ts'
import { seededRandom } from '../utils/svgPath.ts'

const TAU = Math.PI * 2

interface Template {
  difficulty: Difficulty
  terrain: string
  km: number
  /** Share of the requested min→max range this route climbs through. */
  band: number
  /** Number of climbs along the way. */
  humps: number
  heading: number
  seed: number
}

const TEMPLATES: Template[] = [
  { difficulty: 'easy', terrain: 'Paved paths', km: 4.2, band: 0.45, humps: 2, heading: 15, seed: 3 },
  { difficulty: 'medium', terrain: 'Mixed terrain', km: 6.4, band: 0.8, humps: 3, heading: -5, seed: 7 },
  { difficulty: 'hard', terrain: 'Forest trails', km: 8.1, band: 1, humps: 5, heading: -15, seed: 11 },
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
  const area = lookupArea(req.postalCode)
  const code = req.postalCode.replace(/\s/g, '')

  const routes: GeneratedRoute[] = TEMPLATES.flatMap((t, idx): GeneratedRoute[] => {
    const templatePath = buildLoop(area.start, t.km, t.seed, t.heading)
    const hi = req.minElevation + t.band * (req.maxElevation - req.minElevation)
    const elevations = elevationProfile(templatePath.length, t, req.minElevation, hi, req.avgElevation)
    const gain = Math.round(elevationGain(elevations))
    const maxKm =
      req.limit.type === 'distance'
        ? req.limit.maxDistanceKm
        : (req.limit.maxDurationMinutes - gain / 100) / 5.8
    const km = Math.min(t.km, maxKm)
    if (km <= 0) return []

    const path = buildLoop(area.start, km, t.seed, t.heading)
    return [{
      id: `${code}-${t.difficulty}`,
      name: area.routeNames[idx],
      difficulty: t.difficulty,
      terrain: t.terrain,
      distanceKm: Math.round(km * 10) / 10,
      elevationGain: gain,
      minElevation: Math.round(Math.min(...elevations)),
      avgElevation: Math.round(elevations.reduce((a, b) => a + b, 0) / elevations.length),
      maxElevation: Math.round(Math.max(...elevations)),
      estimatedMinutes: Math.round(km * 5.8 + gain / 100),
      points: path.map((p, i) => ({ ...p, elevation: Math.round(elevations[i] * 10) / 10 })),
    }]
  })

  return {
    area: { name: area.name, region: area.region, startLabel: area.startLabel, start: area.start },
    routes,
  }
}
