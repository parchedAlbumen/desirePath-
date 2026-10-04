import { CircleCheck, Play, SlidersHorizontal } from 'lucide-react'
import { useMemo } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { DifficultyBadge } from '../components/DifficultyBadge.tsx'
import { Sparkline } from '../components/ElevationChart.tsx'
import type { MapRoute } from '../components/RouteMap.tsx'
import { useAppState } from '../hooks/useAppState.ts'
import type { GeneratedRoute } from '../types/route.ts'
import { DIFFICULTY_COLOR } from '../utils/difficulty.ts'
import { formatTime } from '../utils/format.ts'
import './RoutesPage.css'
import { LiveMap } from '../components/LiveMap.tsx'

export function RoutesPage() {
  const { request, result, selectedRouteId, selectRoute, startRun } = useAppState()
  const navigate = useNavigate()

  const mapRoutes = useMemo<MapRoute[]>(
    () =>
      (result?.routes ?? []).map((r) => ({
        id: r.id,
        points: r.points,
        color: DIFFICULTY_COLOR[r.difficulty],
        selected: r.id === selectedRouteId,
      })),
    [result, selectedRouteId],
  )

  if (!result || !request) return <Navigate to="/" replace />

  const onStart = (route: GeneratedRoute) => {
    startRun(route)
    navigate('/run')
  }

  return (
    <main className="routes">
      <LiveMap routes={mapRoutes} height={360} />

      <section className="routes__list">
        <div className="routes__list-head">
          <h2>{result.routes.length} routes for you</h2>
          {/* Back to the planner to change postal code, distance, time or elevation */}
          <button type="button" className="text-btn" onClick={() => navigate('/')}>
            <SlidersHorizontal aria-hidden="true" />
            Edit search
          </button>
        </div>

        {result.routes.map((route) => {
          const isSelected = route.id === selectedRouteId
          return (
            <article
              key={route.id}
              className={`route-card card${isSelected ? ' is-selected' : ''}`}
              onClick={() => selectRoute(route.id)}
            >
              <header className="route-card__head">
                <h3>
                  <button type="button" className="route-card__select" aria-pressed={isSelected} onClick={() => selectRoute(route.id)}>
                    {isSelected && <CircleCheck className="route-card__check" aria-hidden="true" />}
                    {route.name}
                  </button>
                </h3>
                <DifficultyBadge difficulty={route.difficulty} />
              </header>

              <div className="route-card__body">
                <div className="route-card__stats">
                  <span className="stat-big">
                    {route.distanceKm}
                    <small>km</small>
                  </span>
                  <span className="stat-mid">
                    {route.elevationGain}
                    <small>m ↗</small>
                  </span>
                </div>
                <Sparkline values={route.points.map((p) => p.elevation)} color={DIFFICULTY_COLOR[route.difficulty]} />
              </div>

              <footer className="route-card__foot">
                <span>
                  {route.terrain} · ~{route.estimatedMinutes} min
                </span>
                <button
                  type="button"
                  className={`btn ${isSelected ? 'btn--primary' : 'btn--secondary'}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    onStart(route)
                  }}
                >
                  <Play aria-hidden="true" />
                  Start Run
                </button>
              </footer>
            </article>
          )
        })}

        <p className="routes__target">
          Target: {request.targetDistanceKm} km in {formatTime(request.targetTime)}
          <br />
          Elevation: {request.minElevation} m min · {request.avgElevation} m avg · {request.maxElevation} m max
        </p>
      </section>
    </main>
  )
}
