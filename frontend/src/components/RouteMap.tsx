import { useMemo, type ReactNode, type Ref } from 'react'
import type { LatLng } from '../types/route.ts'
import { fitProjection } from '../utils/geo.ts'
import { blobRing, smoothPath, type Pt } from '../utils/svgPath.ts'
import './RouteMap.css'

export interface MapRoute {
  id: string
  points: LatLng[]
  color: string
  selected?: boolean
}

interface RouteMapProps {
  routes: MapRoute[]
  /** viewBox height; width is always 400. Sets the map's aspect ratio. */
  height?: number
  /** Live position marker (run screen). */
  marker?: LatLng
  /** Label pinned above the top of one route. */
  callout?: { routeId: string; title: string; subtitle: string; color: string }
  showScale?: boolean
  variant?: 'full' | 'thumb'
  className?: string
  svgRef?: Ref<SVGSVGElement>
  /** HTML overlays (chips, buttons) positioned by the caller. */
  children?: ReactNode
}

const W = 400
const SCALE_STEPS_M = [100, 200, 250, 500, 1000, 2000, 5000]

const pct = (v: number, of: number) => `${(v / of) * 100}%`

/**
 * Stylised topo map: decorative contours and roads behind real route geometry.
 * Swap the background for Mapbox/Leaflet tiles later; the route projection stays the same.
 */
export function RouteMap({
  routes,
  height = 400,
  marker,
  callout,
  showScale,
  variant = 'full',
  className = '',
  svgRef,
  children,
}: RouteMapProps) {
  const thumb = variant === 'thumb'
  // Thumbnails render ~4× smaller, so everything is drawn thicker.
  const k = thumb ? 2.6 : 1

  const geo = useMemo(() => {
    const all = routes.flatMap((r) => r.points)
    if (all.length === 0) return null
    const { project, kmPerUnit } = fitProjection(all, W, height, thumb ? 120 : 52)
    const paths = routes.map((r) => ({ ...r, d: smoothPath(r.points.map(project)), xy: r.points.map(project) }))
    const start = project(routes[0].points[0])
    const xs = paths.flatMap((p) => p.xy.map((q) => q[0]))
    const ys = paths.flatMap((p) => p.xy.map((q) => q[1]))
    const center: Pt = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2]
    return { project, kmPerUnit, paths, start, center }
  }, [routes, height, thumb])

  const decor = useMemo(() => {
    const [cx, cy] = geo?.center ?? [W / 2, height / 2]
    const [sx, sy] = geo?.start ?? [W / 2, height * 0.7]
    const contours = Array.from({ length: 12 }, (_, i) => smoothPath(blobRing(cx, cy, 22 + i * 26, i + 1, 0.1), true))
    const roadA = smoothPath([
      [-20, height * 0.9],
      [W * 0.3, height * 0.8],
      [W * 0.65, height * 0.68],
      [W + 20, height * 0.62],
    ])
    const roadB = smoothPath([
      [sx + 20, height + 20],
      [sx + 12, sy + (height - sy) * 0.55],
      [sx + 26, sy + 14],
      [sx - 18, sy - 12],
      [sx - 26, sy - 50],
      [sx + 6, sy - 78],
      [sx + 52, sy - 84],
      [sx + 64, sy - 116],
    ])
    return { contours, roads: [roadA, roadB] }
  }, [geo, height])

  const ordered = geo ? [...geo.paths].sort((a, b) => Number(!!a.selected) - Number(!!b.selected)) : []

  const calloutPos = (() => {
    if (!geo || !callout) return null
    const target = geo.paths.find((p) => p.id === callout.routeId)
    if (!target) return null
    return target.xy.reduce((top, p) => (p[1] < top[1] ? p : top))
  })()

  const markerPos = geo && marker ? geo.project(marker) : null

  const scale = (() => {
    if (!geo || !showScale) return null
    const targetM = W * 0.18 * geo.kmPerUnit * 1000
    const m = SCALE_STEPS_M.reduce((best, s) => (Math.abs(s - targetM) < Math.abs(best - targetM) ? s : best))
    return { label: m >= 1000 ? `${m / 1000} km` : `${m} m`, width: pct(m / 1000 / geo.kmPerUnit, W) }
  })()

  return (
    <div className={`route-map route-map--${variant} ${className}`} style={{ aspectRatio: `${W} / ${height}` }}>
      <svg ref={svgRef} viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <rect width={W} height={height} className="route-map__ground" />
        <path d={smoothPath(blobRing(W * 0.85, height * 1.05, 260, 99, 0.08), true)} className="route-map__shade" />
        {decor.contours.map((d, i) => (
          <path key={i} d={d} className="route-map__contour" strokeWidth={1.1 * k} />
        ))}
        {decor.roads.map((d, i) => (
          <g key={i}>
            <path d={d} className="route-map__road-edge" strokeWidth={10 * k} />
            <path d={d} className="route-map__road" strokeWidth={6.5 * k} />
          </g>
        ))}
        {ordered.map((r) => (
          <path
            key={r.id}
            d={r.d}
            fill="none"
            stroke={r.color}
            strokeWidth={(r.selected ? 4.5 : 3) * k}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={r.selected || routes.length === 1 ? 1 : 0.85}
          />
        ))}
        {geo && !thumb && (
          <g>
            <circle cx={geo.start[0]} cy={geo.start[1]} r={10} className="route-map__start-ring" />
            <circle cx={geo.start[0]} cy={geo.start[1]} r={5} className="route-map__start-dot" />
          </g>
        )}
        {markerPos && (
          <g>
            <circle cx={markerPos[0]} cy={markerPos[1]} r={20} className="route-map__halo" />
            <circle cx={markerPos[0]} cy={markerPos[1]} r={8} fill="#fff" />
            <circle cx={markerPos[0]} cy={markerPos[1]} r={4.5} className="route-map__start-dot" />
          </g>
        )}
      </svg>

      {callout && calloutPos && (
        <div
          className="route-map__callout"
          style={{ left: pct(calloutPos[0], W), top: pct(calloutPos[1], height), borderColor: callout.color }}
        >
          <span className="route-map__callout-title">{callout.title}</span>
          <span style={{ color: callout.color }}>{callout.subtitle}</span>
        </div>
      )}

      {scale && (
        <div className="route-map__scale">
          <span>{scale.label}</span>
          <i style={{ width: scale.width }} />
        </div>
      )}

      {children}
    </div>
  )
}
