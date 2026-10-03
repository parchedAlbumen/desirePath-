// Shared shapes for the route generator. Keep in sync with the FastAPI models in backend/app.

export type Difficulty = 'easy' | 'medium' | 'hard'

export type RouteLimit =
  | { type: 'distance'; maxDistanceKm: number }
  | { type: 'time'; maxDurationMinutes: number }

/** What the user submits on the planner form. Elevations are metres above sea level. */
export interface RouteRequest {
  postalCode: string
  minElevation: number
  avgElevation: number
  maxElevation: number
  limit: RouteLimit
}

export interface LatLng {
  lat: number
  lng: number
}

/** One point along a route, with elevation for the profile chart. */
export interface RoutePoint extends LatLng {
  elevation: number
}

export interface GeneratedRoute {
  id: string
  name: string
  difficulty: Difficulty
  terrain: string
  distanceKm: number
  elevationGain: number
  minElevation: number
  avgElevation: number
  maxElevation: number
  estimatedMinutes: number
  points: RoutePoint[]
}

/** Where the routes are, resolved from the postal code. */
export interface RouteArea {
  name: string
  region: string
  startLabel: string
  start: LatLng
}

/** The backend returns one route per difficulty level. */
export interface RouteResponse {
  area: RouteArea
  routes: GeneratedRoute[]
}

export interface RunRecord {
  id: string
  routeId: string
  routeName: string
  startedAt: string // ISO 8601
  durationSec: number
  distanceKm: number
  elevationGain: number
  points: LatLng[]
}
