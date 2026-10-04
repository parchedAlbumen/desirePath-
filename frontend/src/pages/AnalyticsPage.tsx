import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { HillModelChart, PaceTrendChart, WeeklyDistanceChart } from '../components/AnalyticsCharts.tsx'
import { useAppState } from '../hooks/useAppState.ts'
import { fetchRunStats, type RunStats } from '../services/runs.ts'
import {
  MIN_MODEL_RUNS,
  climbPerKm,
  computeStats,
  formatPaceSec,
  formatTotalTime,
  hillModel,
  paceSecPerKm,
  paceTrend,
  weeklyTotals,
  type HillModel,
} from '../utils/analytics.ts'
import { formatDuration, formatRunDate } from '../utils/format.ts'
import './AnalyticsPage.css'

export function AnalyticsPage() {
  const { allRuns, signedIn } = useAppState()
  const [serverStats, setServerStats] = useState<RunStats | null>(null)

  // Signed in: headline numbers come from the backend (GET /api/runs/stats, one SQL query over every run).
  // Refetch when the run count changes, e.g. right after finishing a run.
  useEffect(() => {
    if (!signedIn) return
    let cancelled = false
    fetchRunStats()
      .then((stats) => !cancelled && setServerStats(stats))
      .catch((error) => console.warn('[stats] Falling back to stats computed in the browser:', error))
    return () => {
      cancelled = true
    }
  }, [signedIn, allRuns.length])

  const stats = serverStats ?? computeStats(allRuns)
  const weeks = useMemo(() => weeklyTotals(allRuns), [allRuns])
  const trend = useMemo(() => paceTrend(allRuns), [allRuns])
  const model = useMemo(() => hillModel(allRuns), [allRuns])
  const newestFirst = useMemo(() => [...allRuns].sort((a, b) => b.startedAt.localeCompare(a.startedAt)), [allRuns])

  if (allRuns.length === 0) {
    return (
      <main className="page stats">
        <div className="card stats__empty">
          <p>No runs yet. Finish a run and your stats, trends and hill model show up here.</p>
          <Link to="/" className="btn btn--primary">
            Plan a route
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="page stats">
      {!signedIn && (
        <p className="stats__notice">
          These stats only cover runs in this tab. <Link to="/login">Sign in</Link> to keep every run and see your all-time
          numbers.
        </p>
      )}

      {/* Headline numbers */}
      <section className="stats__hero card" aria-label="All-time totals">
        <p className="stats__label">Total distance</p>
        <p className="stats__hero-value">
          {stats.totalDistanceKm.toFixed(1)}
          <small>km</small>
        </p>
        <dl className="stats__tiles">
          <Tile label="Runs" value={String(stats.runCount)} />
          <Tile label="Time" value={formatTotalTime(stats.totalDurationSec)} />
          <Tile label="Climb" value={`${Math.round(stats.totalElevationGain)} m`} />
          <Tile label="Avg pace" value={`${formatPaceSec(stats.avgPaceSecPerKm)} /km`} />
        </dl>
        <p className="stats__week">
          <strong>Last 7 days:</strong> {stats.thisWeek.runCount} {stats.thisWeek.runCount === 1 ? 'run' : 'runs'} ·{' '}
          {stats.thisWeek.distanceKm.toFixed(1)} km
        </p>
      </section>

      <section aria-labelledby="pb-title">
        <h2 className="stats__h2" id="pb-title">
          Personal bests
        </h2>
        <dl className="stats__bests">
          <Tile label="Longest run" value={`${stats.longestRunKm.toFixed(1)} km`} card />
          <Tile label="Fastest pace" value={`${formatPaceSec(stats.fastestPaceSecPerKm)} /km`} card />
          <Tile label="Biggest climb" value={`${Math.round(stats.biggestClimb)} m`} card />
        </dl>
      </section>

      <section className="stats__chart card" aria-labelledby="weekly-title">
        <h2 className="stats__h2" id="weekly-title">
          Weekly distance
        </h2>
        <p className="stats__sub">Kilometres per week, last 8 weeks</p>
        <WeeklyDistanceChart weeks={weeks} />
      </section>

      <section className="stats__chart card" aria-labelledby="pace-title">
        <h2 className="stats__h2" id="pace-title">
          Pace over time
        </h2>
        <p className="stats__sub">Average pace per run (min/km, faster is higher)</p>
        {trend.length >= 2 ? (
          <PaceTrendChart points={trend} />
        ) : (
          <p className="stats__placeholder">Finish at least 2 runs of 0.5 km or more to see your pace trend.</p>
        )}
      </section>

      <section className="stats__chart card" aria-labelledby="hill-title">
        <h2 className="stats__h2" id="hill-title">
          Your hill model
        </h2>
        <p className="stats__sub">Pace against how hilly each run was, with a fitted trend line</p>
        {model ? (
          <>
            <HillInsight model={model} />
            <HillModelChart model={model} />
          </>
        ) : (
          <p className="stats__placeholder">
            Needs at least {MIN_MODEL_RUNS} runs of 0.5 km or more, on routes with different amounts of climbing. Mix in
            some easy and hard routes.
          </p>
        )}
      </section>

      {/* Every value on the page, readable without hovering */}
      <details className="stats__table card">
        <summary>All runs ({allRuns.length})</summary>
        <div className="stats__table-scroll">
          <table>
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Route</th>
                <th scope="col">km</th>
                <th scope="col">Time</th>
                <th scope="col">Pace</th>
                <th scope="col">Climb</th>
                <th scope="col">m/km</th>
              </tr>
            </thead>
            <tbody>
              {newestFirst.map((run) => (
                <tr key={run.id}>
                  <td>{formatRunDate(run.startedAt).split(' · ')[0]}</td>
                  <td>{run.routeName}</td>
                  <td>{run.distanceKm.toFixed(2)}</td>
                  <td>{formatDuration(run.durationSec)}</td>
                  <td>{formatPaceSec(paceSecPerKm(run))}</td>
                  <td>{run.elevationGain} m</td>
                  <td>{(climbPerKm(run) ?? 0).toFixed(0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </main>
  )
}

function Tile({ label, value, card }: { label: string; value: string; card?: boolean }) {
  return (
    <div className={`stats__tile${card ? ' card' : ''}`}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}

/** Plain-language reading of the hill model, so the chart's takeaway is in words too. */
function HillInsight({ model }: { model: HillModel }) {
  const per10 = model.slope * 10 // seconds per km for each extra 10 m of climbing per km
  const strength = model.r2 >= 0.7 ? 'strong' : model.r2 >= 0.3 ? 'moderate' : 'weak'
  return (
    <div className="stats__insight">
      {per10 > 1 ? (
        <p>
          Every extra <strong>10 m of climbing per km</strong> costs you about <strong>{Math.round(per10)} s/km</strong>.
          On a flat route you'd run around <strong>{formatPaceSec(model.intercept)} /km</strong>.
        </p>
      ) : (
        <p>
          Hills barely slow you down: your pace stays around <strong>{formatPaceSec(model.intercept)} /km</strong> whatever
          the climb.
        </p>
      )}
      <p className="stats__fine">
        Based on {model.points.length} runs · {strength} fit (R² = {model.r2.toFixed(2)}). More runs on varied routes make
        it more reliable.
      </p>
    </div>
  )
}
