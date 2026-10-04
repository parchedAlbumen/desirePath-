import type { PaceSample } from '../types/route.ts'
import { paceSeries } from '../utils/pace.ts'
import { formatSecPerKm } from '../utils/format.ts'
import { smoothPath, type Pt } from '../utils/svgPath.ts'
import './ElevationChart.css'

interface Props {
  samples: PaceSample[]
  /** Whole-run average, drawn as a dashed line. Null while there isn't enough distance for one. */
  avgSecPerKm: number | null
}

/** Pace over distance: faster is higher. Shows nothing until the run has a couple hundred metres. */
export function PaceChart({ samples, avgSecPerKm }: Props) {
  const series = paceSeries(samples)
  if (series.length < 2) return null

  const w = 320
  const h = 84
  const paces = series.map((p) => p.secPerKm)
  const fastest = Math.min(...paces)
  const slowest = Math.max(...paces)
  // A little headroom so the line and the average don't touch the edges.
  const lo = Math.min(fastest, avgSecPerKm ?? fastest) * 0.95
  const hi = Math.max(slowest, avgSecPerKm ?? slowest) * 1.05
  const yOf = (secPerKm: number) => 4 + ((secPerKm - lo) / (hi - lo)) * (h - 8)
  const totalKm = series[series.length - 1].km
  const pts: Pt[] = series.map((p) => [(p.km / totalKm) * w, yOf(p.secPerKm)])
  const line = smoothPath(pts)

  return (
    <section className="profile card">
      <header className="profile__head">
        <h2>Pace</h2>
        <span>{avgSecPerKm ? `${formatSecPerKm(avgSecPerKm)} avg · ` : ''}{formatSecPerKm(fastest)} best (min/km)</span>
      </header>
      <div className="profile__body">
        <div className="profile__axis">
          <span>{formatSecPerKm(lo)}</span>
          <span>{formatSecPerKm(hi)}</span>
        </div>
        <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label="Pace over the run, faster is higher">
          {avgSecPerKm && (
            <line
              x1={0}
              x2={w}
              y1={yOf(avgSecPerKm)}
              y2={yOf(avgSecPerKm)}
              stroke="#69728a"
              strokeWidth={1}
              strokeDasharray="4 4"
              vectorEffect="non-scaling-stroke"
            />
          )}
          <path d={line} fill="none" stroke="var(--accent)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
        </svg>
      </div>
      <footer className="profile__foot">
        <span>0 km</span>
        <span>{totalKm.toFixed(2)} km</span>
      </footer>
    </section>
  )
}
