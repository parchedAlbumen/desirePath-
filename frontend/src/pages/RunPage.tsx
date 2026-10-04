import { Activity, Pause, Play, Square, Volume2, VolumeX } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ElevationProfile } from '../components/ElevationChart.tsx'
import { RouteMap } from '../components/RouteMap.tsx'
import { useAppState } from '../hooks/useAppState.ts'
import { pickCoachLine, speak, stopSpeaking } from '../services/coach.ts'
import type { RunSession } from '../state/context.ts'
import { LIME } from '../utils/difficulty.ts'
import { formatDuration, formatPace } from '../utils/format.ts'
import { gradeAt, sampleRoute } from '../utils/geo.ts'
import './RunPage.css'

// New coaching line every half kilometre.
const COACH_EVERY_KM = 0.5

export function RunPage() {
  const { run } = useAppState()
  return run ? <LiveRun run={run} /> : <NoRun />
}

function NoRun() {
  return (
    <main className="page run-empty">
      <div className="run-empty__icon" aria-hidden="true">
        <Activity />
      </div>
      <h1 className="page-title">No run in progress</h1>
      <p>Pick one of your three routes and hit Start Run.</p>
      <Link to="/" className="btn btn--primary">
        Plan a route
      </Link>
    </main>
  )
}

function LiveRun({ run }: { run: RunSession }) {
  const { pauseRun, resumeRun, endRun, coachOn, setCoachOn, gps } = useAppState()
  const navigate = useNavigate()
  const [confirmEnd, setConfirmEnd] = useState(false)
  const [resumeAfterPrompt, setResumeAfterPrompt] = useState(false)
  const { route } = run

  const progress = run.distanceKm / route.distanceKm
  const here = sampleRoute(route.points, progress)
  const remainingKm = Math.max(0, route.distanceKm - run.distanceKm)
  const finished = run.status === 'finished'
  const elapsedSec = run.elapsedMs / 1000

  const mapRoutes = useMemo(() => [{ id: route.id, points: route.points, color: LIME, selected: true }], [route])
  const elevations = useMemo(() => route.points.map((p) => p.elevation), [route])

  const step = Math.floor(run.distanceKm / COACH_EVERY_KM)
  const line = finished
    ? 'Route complete. That one was all you.'
    : pickCoachLine(step, gradeAt(route.points, run.distanceKm, route.distanceKm), remainingKm)

  useEffect(() => {
    if (coachOn) speak(line)
  }, [line, coachOn])

  const toggleCoach = () => {
    if (coachOn) stopSpeaking()
    setCoachOn(!coachOn)
  }

  const onEnd = () => {
    if (!finished) {
      setResumeAfterPrompt(run.status === 'running')
      pauseRun()
      setConfirmEnd(true)
      return
    }
    endRun()
    navigate('/history')
  }

  const finishEarly = (save: boolean) => {
    endRun(save)
    navigate('/history')
  }

  const statusLabel = finished ? 'Finished' : run.status === 'paused' ? 'Paused' : 'Running'
  const gpsLabel =
    run.mode === 'demo' ? 'Demo mode'
    : gps.error ? 'GPS unavailable'
    : gps.accuracy === null ? 'Finding GPS…'
    : gps.accuracy <= 30 ? `GPS ±${Math.round(gps.accuracy)} m`
    : `Weak GPS ±${Math.round(gps.accuracy)} m`

  return (
    <main className="run">
      <header className="page-head">
        <div>
          <p className="crumb">Live run / {run.areaName}</p>
          <h1 className="page-title">{finished ? 'Nice work.' : 'Keep moving.'}</h1>
        </div>
      </header>

      <RouteMap routes={mapRoutes} height={290} marker={run.position ?? here}>
        <span className="map-chip run__gps" style={{ left: 16, top: 16 }} title={gps.error ?? undefined}>
          <i aria-hidden="true" />
          {gpsLabel}
        </span>
        <span className="map-label" style={{ right: 22, top: 22, textAlign: 'right' }}>
          {run.areaName}
        </span>
        <div className="run__route-card">
          <strong>{route.name}</strong>
          <span>
            {remainingKm.toFixed(2)} km to go · {route.distanceKm} km route
          </span>
        </div>
      </RouteMap>

      <section className="run__stats">
        <div className="run__clock-row">
          <div>
            <p className="stat-label">Elapsed time</p>
            <p className="run__clock" aria-live="off">
              {formatDuration(elapsedSec)}
            </p>
          </div>
          <span className={`status-pill status-pill--${run.status}`}>
            <i aria-hidden="true" />
            {statusLabel}
          </span>
        </div>

        <dl className="run__grid">
          <div>
            <dt className="stat-label">Distance</dt>
            <dd>
              {run.distanceKm.toFixed(2)}
              <small>km</small>
            </dd>
          </div>
          <div>
            <dt className="stat-label">Avg pace</dt>
            <dd>
              {formatPace(elapsedSec, run.distanceKm)}
              <small>min / km</small>
            </dd>
          </div>
          <div>
            <dt className="stat-label">Elevation</dt>
            <dd>
              {Math.round(here.elevation)}
              <small>m · current</small>
            </dd>
          </div>
        </dl>

        <ElevationProfile
          values={elevations}
          progress={progress}
          currentKm={run.distanceKm}
          totalKm={route.distanceKm}
          plannedGain={route.elevationGain}
        />

        <div className="coach">
          <button
            type="button"
            className={`coach__toggle${coachOn ? ' is-on' : ''}`}
            aria-pressed={coachOn}
            aria-label={coachOn ? 'Mute audio coach' : 'Unmute audio coach'}
            onClick={toggleCoach}
          >
            {coachOn ? <Volume2 /> : <VolumeX />}
          </button>
          <div className="coach__bubble">
            <p className="eyebrow">Audio coach · {coachOn ? 'On' : 'Off'}</p>
            <p className="coach__line" aria-live="polite">
              “{line}”
            </p>
          </div>
        </div>

        <div className="run__actions">
          {!finished &&
            (run.status === 'paused' ? (
              <button type="button" className="btn btn--primary btn--lg" onClick={resumeRun}>
                <Play aria-hidden="true" />
                Resume
              </button>
            ) : (
              <button type="button" className="btn btn--primary btn--lg" onClick={pauseRun}>
                <Pause aria-hidden="true" />
                Pause
              </button>
            ))}
          <button type="button" className={`btn btn--lg ${finished ? 'btn--primary' : 'btn--secondary'}`} onClick={onEnd}>
            <Square aria-hidden="true" />
            {finished ? 'Save run' : 'End'}
          </button>
        </div>
      </section>
      {confirmEnd && (
        <div className="run__dialog-backdrop">
          <section
            className="run__dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="end-run-title"
            aria-describedby="end-run-description"
          >
            <h2 id="end-run-title">Save this run?</h2>
            <p id="end-run-description">
              You ended your run early. Save the distance and route to your history?
            </p>
            <div className="run__dialog-actions">
              <button type="button" className="btn btn--primary" onClick={() => finishEarly(true)}>
                Save run
              </button>
              <button type="button" className="btn btn--secondary" onClick={() => finishEarly(false)}>
                Discard
              </button>
              <button
                type="button"
                className="text-btn"
                onClick={() => {
                  setConfirmEnd(false)
                  if (resumeAfterPrompt) resumeRun()
                }}
              >
                {resumeAfterPrompt ? 'Keep running' : 'Keep paused'}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  )
}
