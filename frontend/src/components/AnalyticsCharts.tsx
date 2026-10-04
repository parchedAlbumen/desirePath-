// Charts for the Stats page: weekly distance (columns), pace over time (line) and the hill model (scatter + fit).
// Plain SVG in a fixed viewBox that scales to the card width; colours come from CSS variables (AnalyticsCharts.css).
import { useState, type KeyboardEvent, type ReactNode } from 'react'
import type { HillModel, PacePoint, WeekBucket } from '../utils/analytics.ts'
import { formatPaceSec } from '../utils/analytics.ts'
import './AnalyticsCharts.css'

const W = 340
const H = 190
const M = { top: 14, right: 10, bottom: 26, left: 42 }
const PLOT_W = W - M.left - M.right
const PLOT_H = H - M.top - M.bottom

const shortDate = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

/** Round up to a clean axis maximum: 1, 2, 2.5, 5 × 10ⁿ. */
function niceMax(value: number): number {
  if (value <= 0) return 1
  const exp = 10 ** Math.floor(Math.log10(value))
  const f = value / exp
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * exp
}

/** Round up to a clean axis maximum in steps of 10 (or 5 below 20), e.g. 47 → 50, 13 → 15. */
function niceCeil(value: number): number {
  const step = value <= 20 ? 5 : 10
  return Math.max(step, Math.ceil(value / step) * step)
}

/**
 * Pace axis: a clean step (15 s, 30 s, 1 min…) chosen so there are at most 3 gaps, with the range snapped to it
 * and a little padding so dots don't sit on the edge. Returns [low, high, ticks].
 */
function paceAxis(paces: number[]): [number, number, number[]] {
  const lo = Math.min(...paces)
  const hi = Math.max(...paces)
  const pad = Math.max(8, (hi - lo) * 0.1)
  const steps = [15, 30, 60, 90, 120, 180, 300, 600]
  const step = steps.find((s) => (Math.ceil((hi + pad) / s) - Math.floor((lo - pad) / s)) <= 3) ?? 600
  const min = Math.floor((lo - pad) / step) * step
  const max = Math.ceil((hi + pad) / step) * step
  const ticks: number[] = []
  for (let t = min; t <= max; t += step) ticks.push(t)
  return [min, max, ticks]
}

/** HTML tooltip positioned over the SVG (in viewBox units → %), flipped near the edges so it stays inside. */
function Tooltip({ x, y, children }: { x: number; y: number; children: ReactNode }) {
  const align = x < W * 0.25 ? 'start' : x > W * 0.75 ? 'end' : 'center'
  return (
    <div className={`chart-tip chart-tip--${align}`} style={{ left: `${(x / W) * 100}%`, top: `${(y / H) * 100}%` }} role="status">
      {children}
    </div>
  )
}

function YGrid({ ticks, toY, format }: { ticks: number[]; toY: (v: number) => number; format: (v: number) => string }) {
  return (
    <g>
      {ticks.map((t) => (
        <g key={t}>
          <line className="chart__grid" x1={M.left} x2={W - M.right} y1={toY(t)} y2={toY(t)} />
          <text className="chart__tick" x={M.left - 6} y={toY(t)} dy="0.32em" textAnchor="end">
            {format(t)}
          </text>
        </g>
      ))}
    </g>
  )
}

/** Column path with a 4px rounded top and a square base on the baseline. */
function columnPath(x: number, y: number, w: number, base: number): string {
  const r = Math.min(4, w / 2, base - y)
  return `M${x},${base} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${base} Z`
}

/* ---------------- Weekly distance ---------------- */

export function WeeklyDistanceChart({ weeks }: { weeks: WeekBucket[] }) {
  const [active, setActive] = useState<number | null>(null)
  const max = niceMax(Math.max(...weeks.map((w) => w.distanceKm)))
  const ticks = [0, max / 2, max]
  const base = M.top + PLOT_H
  const toY = (v: number) => base - (v / max) * PLOT_H
  const band = PLOT_W / weeks.length
  const barW = Math.min(24, band * 0.6)
  const peak = weeks.reduce((best, w, i) => (w.distanceKm > weeks[best].distanceKm ? i : best), 0)
  const a = active !== null ? weeks[active] : null

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Distance per week for the last 8 weeks">
        <YGrid ticks={ticks} toY={toY} format={(v) => `${+v.toFixed(1)}`} />
        {weeks.map((w, i) => {
          const cx = M.left + band * i + band / 2
          const y = toY(w.distanceKm)
          const showLabel = w.distanceKm > 0 && (i === peak || i === weeks.length - 1)
          return (
            <g key={w.start.toISOString()}>
              {w.distanceKm > 0 && (
                <path className={`chart__bar${active === i ? ' is-active' : ''}`} d={columnPath(cx - barW / 2, y, barW, base)} />
              )}
              {showLabel && (
                <text className="chart__value" x={cx} y={y - 5} textAnchor="middle">
                  {w.distanceKm.toFixed(1)}
                </text>
              )}
              {(weeks.length - 1 - i) % 2 === 0 && (
                <text className="chart__tick" x={cx} y={H - 8} textAnchor="middle">
                  {i === weeks.length - 1 ? 'This wk' : shortDate(w.start)}
                </text>
              )}
              {/* The hit target is the whole column slot, not just the painted bar */}
              <rect
                className="chart__hit"
                x={M.left + band * i}
                y={M.top}
                width={band}
                height={PLOT_H}
                tabIndex={0}
                aria-label={`Week of ${shortDate(w.start)}: ${w.distanceKm.toFixed(1)} km, ${w.runCount} runs, ${Math.round(w.elevationGain)} m climb`}
                onPointerEnter={() => setActive(i)}
                onPointerLeave={() => setActive(null)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
              />
            </g>
          )
        })}
        <line className="chart__axis" x1={M.left} x2={W - M.right} y1={base} y2={base} />
      </svg>
      {a && active !== null && (
        <Tooltip x={M.left + band * active + band / 2} y={toY(a.distanceKm)}>
          <strong>{a.distanceKm.toFixed(1)} km</strong>
          <span>
            Week of {shortDate(a.start)} · {a.runCount} {a.runCount === 1 ? 'run' : 'runs'} · {Math.round(a.elevationGain)} m climb
          </span>
        </Tooltip>
      )}
    </div>
  )
}

/* ---------------- Pace over time ---------------- */

export function PaceTrendChart({ points }: { points: PacePoint[] }) {
  const [active, setActive] = useState<number | null>(null)
  const [lo, hi, ticks] = paceAxis(points.map((p) => p.paceSecPerKm))
  // Faster is higher: the fastest pace (smallest number) sits at the top of the chart.
  const toY = (pace: number) => M.top + ((pace - lo) / (hi - lo)) * PLOT_H
  const t0 = points[0].date.getTime()
  const t1 = points[points.length - 1].date.getTime()
  const toX = (d: Date) => (t1 === t0 ? M.left + PLOT_W / 2 : M.left + ((d.getTime() - t0) / (t1 - t0)) * PLOT_W)
  const xy = points.map((p) => [toX(p.date), toY(p.paceSecPerKm)] as const)
  const line = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const last = points.length - 1

  // Crosshair: snap to the run nearest the pointer's x.
  const nearest = (clientX: number, rect: DOMRect) => {
    const x = ((clientX - rect.left) / rect.width) * W
    return xy.reduce((best, p, i) => (Math.abs(p[0] - x) < Math.abs(xy[best][0] - x) ? i : best), 0)
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    setActive((i) => Math.max(0, Math.min(last, (i ?? last) + (e.key === 'ArrowRight' ? 1 : -1))))
  }
  const a = active !== null ? points[active] : null

  return (
    <div className="chart">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Average pace per run over time. Use the left and right arrow keys to step through runs."
        tabIndex={0}
        onKeyDown={onKey}
        onBlur={() => setActive(null)}
      >
        <YGrid ticks={ticks} toY={toY} format={formatPaceSec} />
        {active !== null && <line className="chart__crosshair" x1={xy[active][0]} x2={xy[active][0]} y1={M.top} y2={M.top + PLOT_H} />}
        <path className="chart__line" d={line} />
        {xy.map(([x, y], i) => (
          <circle key={points[i].run.id} className={`chart__dot${active === i ? ' is-active' : ''}`} cx={x} cy={y} r={4} />
        ))}
        <text className="chart__value" x={xy[last][0]} y={xy[last][1] - 9} textAnchor={xy.length > 1 ? 'end' : 'middle'}>
          {formatPaceSec(points[last].paceSecPerKm)}
        </text>
        <text className="chart__tick" x={M.left} y={H - 8} textAnchor="start">
          {shortDate(points[0].date)}
        </text>
        {points.length > 1 && (
          <text className="chart__tick" x={W - M.right} y={H - 8} textAnchor="end">
            {shortDate(points[last].date)}
          </text>
        )}
        <rect
          className="chart__hit"
          x={M.left - 10}
          y={M.top}
          width={PLOT_W + 20}
          height={PLOT_H}
          onPointerMove={(e) => setActive(nearest(e.clientX, (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect()))}
          onPointerLeave={() => setActive(null)}
        />
      </svg>
      {a && active !== null && (
        <Tooltip x={xy[active][0]} y={xy[active][1]}>
          <strong>{formatPaceSec(a.paceSecPerKm)} /km</strong>
          <span>
            {a.run.routeName} · {shortDate(a.date)} · {a.run.distanceKm.toFixed(1)} km
          </span>
        </Tooltip>
      )}
    </div>
  )
}

/* ---------------- Hill model ---------------- */

export function HillModelChart({ model }: { model: HillModel }) {
  const [active, setActive] = useState<number | null>(null)
  const { points } = model
  const xMax = niceCeil(Math.max(...points.map((p) => p.climbPerKm)) * 1.05)
  // Include the fitted line's ends in the pace range so the whole line fits on the chart.
  const fitY0 = model.intercept
  const fitY1 = model.intercept + model.slope * xMax
  const [lo, hi, yTicks] = paceAxis([...points.map((p) => p.paceSecPerKm), fitY0, fitY1])
  const toX = (v: number) => M.left + (v / xMax) * PLOT_W
  const toY = (pace: number) => M.top + ((pace - lo) / (hi - lo)) * PLOT_H // faster is higher, as in the pace chart
  const xTicks = [0, xMax / 2, xMax]
  const a = active !== null ? points[active] : null

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Each run's pace against how hilly it was, with a fitted trend line">
        <YGrid ticks={yTicks} toY={toY} format={formatPaceSec} />
        {xTicks.map((t) => (
          <text key={t} className="chart__tick" x={toX(t)} y={H - 8} textAnchor={t === 0 ? 'start' : t === xMax ? 'end' : 'middle'}>
            {`${+t.toFixed(1)}${t === xMax ? ' m/km' : ''}`}
          </text>
        ))}
        <line className="chart__fit" x1={toX(0)} y1={toY(fitY0)} x2={toX(xMax)} y2={toY(fitY1)} />
        {points.map((p, i) => (
          <g key={p.run.id}>
            <circle className={`chart__dot${active === i ? ' is-active' : ''}`} cx={toX(p.climbPerKm)} cy={toY(p.paceSecPerKm)} r={5} />
            {/* 24px-wide transparent hit area, so dots are easy to hover and tap */}
            <circle
              className="chart__hit"
              cx={toX(p.climbPerKm)}
              cy={toY(p.paceSecPerKm)}
              r={12}
              tabIndex={0}
              aria-label={`${p.run.routeName}: ${formatPaceSec(p.paceSecPerKm)} per km, ${p.climbPerKm.toFixed(0)} m climb per km`}
              onPointerEnter={() => setActive(i)}
              onPointerLeave={() => setActive(null)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
            />
          </g>
        ))}
      </svg>
      {a && (
        <Tooltip x={toX(a.climbPerKm)} y={toY(a.paceSecPerKm)}>
          <strong>{formatPaceSec(a.paceSecPerKm)} /km</strong>
          <span>
            {a.run.routeName} · {a.climbPerKm.toFixed(0)} m climb/km
          </span>
        </Tooltip>
      )}
    </div>
  )
}
