import type { LatLng, RoutePoint } from '../types/route.ts'

const EARTH_RADIUS_KM = 6371
const KM_PER_DEG_LAT = 111.32

const toRad = (deg: number) => (deg * Math.PI) / 180

export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h))
}

/** Cumulative distance (km) at each point, starting at 0. */
export function cumulativeKm(points: LatLng[]): number[] {
  const out = [0]
  for (let i = 1; i < points.length; i++) out.push(out[i - 1] + haversineKm(points[i - 1], points[i]))
  return out
}

/** Interpolated point at a fraction (0–1) of the way along the route. */
export function sampleRoute(points: RoutePoint[], fraction: number): RoutePoint {
  const cum = cumulativeKm(points)
  const target = Math.min(1, Math.max(0, fraction)) * cum[cum.length - 1]
  let i = 1
  while (i < cum.length - 1 && cum[i] < target) i++
  const a = points[i - 1]
  const b = points[i]
  const span = cum[i] - cum[i - 1] || 1
  const t = (target - cum[i - 1]) / span
  return {
    lat: a.lat + (b.lat - a.lat) * t,
    lng: a.lng + (b.lng - a.lng) * t,
    elevation: a.elevation + (b.elevation - a.elevation) * t,
  }
}

/** Grade (%) over the next 100 m when `km` into a route that is `totalKm` long. */
export function gradeAt(points: RoutePoint[], km: number, totalKm: number): number {
  const here = sampleRoute(points, km / totalKm)
  const ahead = sampleRoute(points, (km + 0.1) / totalKm)
  return ahead.elevation - here.elevation // metres per 100 m == percent
}

export function elevationGain(elevations: number[]): number {
  let gain = 0
  for (let i = 1; i < elevations.length; i++) gain += Math.max(0, elevations[i] - elevations[i - 1])
  return gain
}

/** Offset a point by km east/north. Good enough at running distances. */
export function offsetKm(origin: LatLng, eastKm: number, northKm: number): LatLng {
  return {
    lat: origin.lat + northKm / KM_PER_DEG_LAT,
    lng: origin.lng + eastKm / (KM_PER_DEG_LAT * Math.cos(toRad(origin.lat))),
  }
}

export interface Projection {
  project: (p: LatLng) => [number, number]
  /** Kilometres represented by one SVG unit. */
  kmPerUnit: number
}

/** Fit a set of points into a width×height box (equirectangular, aspect-correct). */
export function fitProjection(points: LatLng[], width: number, height: number, padding: number): Projection {
  const lats = points.map((p) => p.lat)
  const lngs = points.map((p) => p.lng)
  const minLat = Math.min(...lats)
  const maxLat = Math.max(...lats)
  const minLng = Math.min(...lngs)
  const maxLng = Math.max(...lngs)
  const kx = Math.cos(toRad((minLat + maxLat) / 2))
  const spanX = Math.max((maxLng - minLng) * kx, 1e-6)
  const spanY = Math.max(maxLat - minLat, 1e-6)
  const scale = Math.min((width - 2 * padding) / spanX, (height - 2 * padding) / spanY)
  const offX = (width - spanX * scale) / 2
  const offY = (height - spanY * scale) / 2
  return {
    project: (p) => [offX + (p.lng - minLng) * kx * scale, offY + (maxLat - p.lat) * scale],
    kmPerUnit: KM_PER_DEG_LAT / scale,
  }
}
