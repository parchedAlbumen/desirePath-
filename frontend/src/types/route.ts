// Shared shapes for the route generator. Keep in sync with the FastAPI models in backend/app.

export type Difficulty = 'easy' | 'medium' | 'hard'

/** A length of time, e.g. { hours: 0, minutes: 45 }. */
export interface Duration {
  hours: number
  minutes: number
}

/**
 * What the user submits on the planner form (the agreed request JSON).
 * Elevation values are metres of change from the route's starting elevation.
 */
export interface RouteRequest {
  /** Postal code is omitted when the runner shares their current location. */
  postalCode?: string
  /** GPS origin; both coordinates must be supplied together. */
  startLat?: number
  startLng?: number
  /** How far the runner wants to go. All three routes aim for this length. */
  targetDistanceKm?: number
  /** How long the runner has in duration-and-pace mode. */
  targetTime?: Duration
  /** Desired pace in minutes per kilometre; paired with targetTime instead of distance. */
  targetPaceMinPerKm?: number
  minElevation: number
  avgElevation: number
  maxElevation: number
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
  plannedRoute?: GeneratedRoute
  /** Set when the run comes from the backend; signed-out users keep favorites in browser storage instead. */
  isFavorite?: boolean
}
