import { CircleCheck, MapPin, Play, SlidersHorizontal } from 'lucide-react'
import { useMemo } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { DifficultyBadge } from '../components/DifficultyBadge.tsx'
import { Sparkline } from '../components/ElevationChart.tsx'
import { RouteMap, type MapRoute } from '../components/RouteMap.tsx'
import { useAppState } from '../hooks/useAppState.ts'
import type { GeneratedRoute } from '../types/route.ts'
import { DIFFICULTY_COLOR } from '../utils/difficulty.ts'
import { formatTime } from '../utils/format.ts'
import './RoutesPage.css'

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

  const selected = result.routes.find((r) => r.id === selectedRouteId)

  const onStart = (route: GeneratedRoute) => {
    startRun(route)
    navigate('/run')
  }

  return (
    <main className="routes">
      <header className="page-head">
        <div>
          <p className="crumb">
            {request.postalCode} / {result.area.region}
          </p>
          <h1 className="page-title">Your running ground</h1>
        </div>
        <button type="button" className="icon-btn" aria-label="Change postal code or elevation" onClick={() => navigate('/')}>
          <SlidersHorizontal />
        </button>
      </header>

      <RouteMap
        routes={mapRoutes}
        height={400}
        showScale
        callout={
          selected && {
            routeId: selected.id,
            title: selected.name,
            subtitle: `${selected.distanceKm} km · ${selected.elevationGain} m gain`,
            color: DIFFICULTY_COLOR[selected.difficulty],
          }
        }
      >
        <span className="map-label" style={{ left: 22, top: 22 }}>
          {result.area.name}
        </span>
        <span className="map-chip" style={{ left: 16, bottom: 16 }}>
          <MapPin aria-hidden="true" />
          Start at {result.area.startLabel}
        </span>
      </RouteMap>

      <section className="routes__list">
        <div className="routes__list-head">
          <h2>{result.routes.length} routes for you</h2>
          {selected && <span className="eyebrow">1 selected</span>}
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
