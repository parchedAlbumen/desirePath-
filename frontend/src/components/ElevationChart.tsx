import { useId } from 'react'
import { LIME } from '../utils/difficulty.ts'
import { smoothPath, type Pt } from '../utils/svgPath.ts'
import './ElevationChart.css'

/** Average consecutive samples down to `n` points so small charts stay smooth. */
function downsample(values: number[], n: number): number[] {
  if (values.length <= n) return values
  const size = values.length / n
  return Array.from({ length: n }, (_, i) => {
    const slice = values.slice(Math.floor(i * size), Math.floor((i + 1) * size))
    return slice.reduce((a, b) => a + b, 0) / slice.length
  })
}

function toPoints(values: number[], w: number, h: number, lo: number, hi: number, padTop = 2): Pt[] {
  const span = hi - lo || 1
  return values.map((v, i) => [(i / (values.length - 1)) * w, padTop + (1 - (v - lo) / span) * (h - padTop)])
}

interface SparklineProps {
  values: number[]
  color: string
}

/** Compact elevation profile for route cards. */
export function Sparkline({ values, color }: SparklineProps) {
  const w = 110
  const h = 36
  const pts = toPoints(downsample(values, 18), w, h - 2, Math.min(...values), Math.max(...values), 3)
  const line = smoothPath(pts)
  return (
    <svg className="sparkline" viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <path d={`${line} L${w},${h} L0,${h} Z`} fill={color} opacity={0.14} />
      <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

interface ProfileProps {
  values: number[]
  /** 0–1 position of the runner along the route. */
  progress: number
  currentKm: number
  totalKm: number
  plannedGain: number
}

/** "Elevation ahead" chart on the live run screen. */
export function ElevationProfile({ values, progress, currentKm, totalKm, plannedGain }: ProfileProps) {
  const gradientId = useId()
  const w = 320
  const h = 84
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const pts = toPoints(downsample(values, 40), w, h, lo, hi, 4)
  const line = smoothPath(pts)
  const x = progress * w
  // Find the curve height under the marker.
  const idx = Math.min(pts.length - 2, Math.floor(progress * (pts.length - 1)))
  const t = progress * (pts.length - 1) - idx
  const y = pts[idx][1] + (pts[idx + 1][1] - pts[idx][1]) * t

  return (
    <section className="profile card">
      <header className="profile__head">
        <h2>Elevation ahead</h2>
        <span>{plannedGain} m planned gain</span>
      </header>
      <div className="profile__body">
        <div className="profile__axis">
          <span>{Math.round(hi)}</span>
          <span>{Math.round(lo)}</span>
        </div>
        <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="#ffffff" stopOpacity="0.1" />
              <stop offset="1" stopColor="#ffffff" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          <path d={`${line} L${w},${h} L0,${h} Z`} fill={`url(#${gradientId})`} />
          <path d={line} fill="none" stroke="#5d6561" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
          <line x1={x} x2={x} y1={0} y2={y} stroke={LIME} strokeWidth={2} vectorEffect="non-scaling-stroke" />
        </svg>
        <span className="profile__dot" style={{ left: `${progress * 100}%`, top: `${(y / h) * 100}%` }} />
      </div>
      <footer className="profile__foot">
        <span>0 km</span>
        <span className="profile__you">
          <i /> You · {currentKm.toFixed(2)} km
        </span>
        <span>{totalKm} km</span>
      </footer>
    </section>
  )
}
