import { ArrowDown, ArrowUp, Mountain } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { RouteMap } from '../components/RouteMap.tsx'
import { useAppState } from '../hooks/useAppState.ts'
import type { RunRecord } from '../types/route.ts'
import { LIME } from '../utils/difficulty.ts'
import { formatDuration, formatKm, formatRunDate } from '../utils/format.ts'
import './HistoryPage.css'

export function HistoryPage() {
  const { history } = useAppState()
  const [newestFirst, setNewestFirst] = useState(true)

  const runs = useMemo(
    () => [...history].sort((a, b) => (newestFirst ? -1 : 1) * a.startedAt.localeCompare(b.startedAt)),
    [history, newestFirst],
  )
  const totalKm = history.reduce((sum, r) => sum + r.distanceKm, 0)
  const totalGain = history.reduce((sum, r) => sum + r.elevationGain, 0)

  return (
    <main className="page history">
      <p className="crumb">Your running record</p>
      <h1 className="page-title">Every run counts.</h1>

      <section className="big-picture" aria-label="All-time totals">
        <header>
          <p className="eyebrow">The big picture</p>
          <span>All time</span>
        </header>
        <dl>
          <div>
            <dt>Total km</dt>
            <dd>{formatKm(totalKm)}</dd>
          </div>
          <div>
            <dt>Total runs</dt>
            <dd>{history.length}</dd>
          </div>
          <div>
            <dt>Elevation · m</dt>
            <dd>{totalGain}</dd>
          </div>
        </dl>
      </section>

      <div className="history__list-head">
        <h2>Recent runs</h2>
        <button type="button" className="text-btn" onClick={() => setNewestFirst(!newestFirst)}>
          {newestFirst ? 'Newest first' : 'Oldest first'}
          {newestFirst ? <ArrowDown aria-hidden="true" /> : <ArrowUp aria-hidden="true" />}
        </button>
      </div>

      {runs.length === 0 ? (
        <div className="card history__empty">
          <p>No runs yet. Your first one is waiting.</p>
          <Link to="/" className="btn btn--primary">
            Plan a route
          </Link>
        </div>
      ) : (
        <ul className="history__list">
          {runs.map((run) => (
            <RunItem key={run.id} run={run} />
          ))}
        </ul>
      )}

      {history.length > 0 && (
        <aside className="history__footer">
          <Mountain aria-hidden="true" />
          <div>
            <strong>A little higher. A little further.</strong>
            <p>{totalGain} meters climbed. All earned, one step at a time.</p>
          </div>
        </aside>
      )}
    </main>
  )
}

function RunItem({ run }: { run: RunRecord }) {
  const mapRoutes = useMemo(() => [{ id: run.id, points: run.points, color: LIME, selected: true }], [run])

  return (
    <li className="run-item card">
      <RouteMap routes={mapRoutes} variant="thumb" className="run-item__map" />
      <div className="run-item__body">
        <p className="run-item__date">{formatRunDate(run.startedAt)}</p>
        <h3>{run.routeName}</h3>
        <dl className="run-item__stats">
          <div>
            <dt>km</dt>
            <dd>{formatKm(run.distanceKm)}</dd>
          </div>
          <div>
            <dt>time</dt>
            <dd>{formatDuration(run.durationSec)}</dd>
          </div>
          <div>
            <dt>m gain</dt>
            <dd>{run.elevationGain}</dd>
          </div>
        </dl>
      </div>
    </li>
  )
}
