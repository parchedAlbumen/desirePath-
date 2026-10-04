import type { LatLng } from '../types/route.ts'
import { cumulativeKm } from './geo.ts'

export interface RouteManeuver {
  distanceKm: number
  direction: 'left' | 'right'
}

const BEARING_WINDOW_KM = 0.08
const MIN_TURN_DEGREES = 35
const MAX_TURN_DEGREES = 150
const TURN_CLUSTER_KM = 0.18

function pointAtDistance(points: LatLng[], distances: number[], targetKm: number): LatLng {
  let index = 1
  while (index < distances.length - 1 && distances[index] < targetKm) index++
  const segmentKm = distances[index] - distances[index - 1] || 1
  const fraction = (targetKm - distances[index - 1]) / segmentKm
  return {
    lat: points[index - 1].lat + (points[index].lat - points[index - 1].lat) * fraction,
    lng: points[index - 1].lng + (points[index].lng - points[index - 1].lng) * fraction,
  }
}

function bearingDegrees(from: LatLng, to: LatLng): number {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180
  const lat1 = toRadians(from.lat)
  const lat2 = toRadians(to.lat)
  const lngDelta = toRadians(to.lng - from.lng)
  const y = Math.sin(lngDelta) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(lngDelta)
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}

function signedAngle(degrees: number): number {
  return ((degrees + 540) % 360) - 180
}

export function getRouteManeuvers(points: LatLng[], routeDistanceKm: number): RouteManeuver[] {
  if (points.length < 3 || routeDistanceKm <= 0) return []

  const distances = cumulativeKm(points)
  const geometryDistanceKm = distances[distances.length - 1]
  if (geometryDistanceKm <= 0) return []

  const candidates: { distanceKm: number; direction: 'left' | 'right'; strength: number }[] = []
  for (let i = 1; i < points.length - 1; i++) {
    const pointDistance = distances[i]
    if (pointDistance < BEARING_WINDOW_KM || pointDistance > geometryDistanceKm - BEARING_WINDOW_KM) continue

    const before = pointAtDistance(points, distances, pointDistance - BEARING_WINDOW_KM)
    const after = pointAtDistance(points, distances, pointDistance + BEARING_WINDOW_KM)
    const incoming = bearingDegrees(before, points[i])
    const outgoing = bearingDegrees(points[i], after)
    const change = signedAngle(outgoing - incoming)
    const strength = Math.abs(change)
    if (strength < MIN_TURN_DEGREES || strength > MAX_TURN_DEGREES) continue

    candidates.push({
      distanceKm: (pointDistance / geometryDistanceKm) * routeDistanceKm,
      direction: change > 0 ? 'right' : 'left',
      strength,
    })
  }

  const maneuvers: RouteManeuver[] = []
  for (let i = 0; i < candidates.length; ) {
    const clusterStart = candidates[i].distanceKm
    let strongest = candidates[i]
    i++
    while (i < candidates.length && candidates[i].distanceKm - clusterStart <= TURN_CLUSTER_KM) {
      if (candidates[i].strength > strongest.strength) strongest = candidates[i]
      i++
    }
    maneuvers.push({ distanceKm: strongest.distanceKm, direction: strongest.direction })
  }

  return maneuvers
}
