import { ArrowDown, ArrowUp, Download, Mountain, Play, Share2, Star } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { RouteMap } from '../components/RouteMap.tsx'
import { useAppState } from '../hooks/useAppState.ts'
import type { GeneratedRoute, LatLng, RunRecord } from '../types/route.ts'
import { LIME } from '../utils/difficulty.ts'
import { formatDuration, formatKm, formatRunDate } from '../utils/format.ts'
import './HistoryPage.css'

export function HistoryPage() {
  const { history, favorites: savedFavorites, signedIn, syncError, toggleFavorite: setFavorite, startRun } = useAppState()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [newestFirst, setNewestFirst] = useState(true)
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const sharedRun = useMemo(() => parseSharedRun(searchParams.get('run')), [searchParams])
  const invalidShare = searchParams.has('run') && !sharedRun

  const runs = useMemo(
    () => [...history].sort((a, b) => (newestFirst ? -1 : 1) * a.startedAt.localeCompare(b.startedAt)),
    [history, newestFirst],
  )
  const favoriteRuns = useMemo(
    () =>
      [...savedFavorites].sort(
        (a, b) => (newestFirst ? -1 : 1) * a.startedAt.localeCompare(b.startedAt),
      ),
    [savedFavorites, newestFirst],
  )
  const totalKm = history.reduce((sum, run) => sum + run.distanceKm, 0)
  const totalGain = history.reduce((sum, run) => sum + run.elevationGain, 0)

  const toggleFavorite = async (run: RunRecord) => {
    if (!signedIn) {
      setMessage('Sign in to star runs and keep them.')
      return
    }
    try {
      const added = await setFavorite(run)
      setMessage(added ? `${run.routeName} added to favorites.` : `${run.routeName} removed from favorites.`)
    } catch (error) {
      setMessage(error instanceof Error ? `Could not save favorite: ${error.message}` : 'Could not save favorite.')
    }
  }

  const renderRun = (run: RunRecord) => (
    <RunItem
      key={run.id}
      run={run}
      isFavorite={savedFavorites.some((favorite) => favorite.id === run.id)}
      selected={sharedRun !== null || selectedRunId === run.id}
      onSelect={() => setSelectedRunId((current) => (current === run.id ? null : run.id))}
      onToggleFavorite={() => toggleFavorite(run)}
      onRun={() => {
        startRun(toGeneratedRoute(run))
        navigate('/run')
      }}
      onShare={() => shareRun(run, setMessage)}
      onDownload={(svg) => downloadRunImage(run, svg, setMessage)}
    />
  )

  return (
    <main className="page history">
      <p className="crumb">Your running record</p>
      <h1 className="page-title">Every run counts.</h1>

      <section className="big-picture" aria-label="Saved run totals">
        <header>
          <p className="eyebrow">The big picture</p>
          <span>Latest {history.length} of 2</span>
        </header>
        <dl>
          <div>
            <dt>Saved km</dt>
            <dd>{formatKm(totalKm)}</dd>
          </div>
          <div>
            <dt>Saved runs</dt>
            <dd>{history.length}</dd>
          </div>
          <div>
            <dt>Saved elevation · m</dt>
            <dd>{totalGain}</dd>
          </div>
        </dl>
      </section>

      {!sharedRun && (
        <section className="history__favorites" aria-labelledby="favorite-routes-title">
          <div className="history__list-head">
            <h2 id="favorite-routes-title">Favorite routes</h2>
            <span className="history__favorite-count">{favoriteRuns.length} saved</span>
          </div>
          {favoriteRuns.length > 0 ? (
            <ul className="history__list">{favoriteRuns.map(renderRun)}</ul>
          ) : (
            <div className="card history__favorites-empty">
              <Star aria-hidden="true" />
              <p>
                {signedIn ? (
                  'Star a run to keep it saved here for your next outing.'
                ) : (
                  <>
                    <Link to="/login">Sign in</Link> to star runs and keep them for your next outing.
                  </>
                )}
              </p>
            </div>
          )}
        </section>
      )}

      <div className="history__list-head">
        <h2>{sharedRun ? 'Shared route' : 'Recent runs'}</h2>
        {!sharedRun && (
          <button type="button" className="text-btn" onClick={() => setNewestFirst(!newestFirst)}>
            {newestFirst ? 'Newest first' : 'Oldest first'}
            {newestFirst ? <ArrowDown aria-hidden="true" /> : <ArrowUp aria-hidden="true" />}
          </button>
        )}
      </div>

      {!signedIn && !sharedRun && (
        <p className="history__message" role="note">
          You're not signed in, so these runs disappear when you close this tab. <Link to="/login">Sign in</Link> to
          keep them.
        </p>
      )}
      {syncError && <p className="history__message" role="alert">{syncError}</p>}
      {invalidShare && <p className="history__message" role="alert">This shared route link is invalid or incomplete.</p>}
      {sharedRun ? (
        <section className="history__shared card" aria-label="Shared route">
          <ul className="history__list">{renderRun(sharedRun)}</ul>
          <button type="button" className="text-btn" onClick={() => setSearchParams({})}>
            View my recent runs
          </button>
        </section>
      ) : runs.length === 0 ? (
        <div className="card history__empty">
          <p>No runs yet. Your first one is waiting.</p>
          <Link to="/" className="btn btn--primary">
            Plan a route
          </Link>
        </div>
      ) : (
        <ul className="history__list">{runs.map(renderRun)}</ul>
      )}

      {message && <p className="history__message" role="status">{message}</p>}

      {!sharedRun && history.length > 0 && (
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

function RunItem({
  run,
  isFavorite,
  selected,
  onSelect,
  onToggleFavorite,
  onRun,
  onShare,
  onDownload,
}: {
  run: RunRecord
  isFavorite: boolean
  selected: boolean
  onSelect: () => void
  onToggleFavorite: () => void
  onRun: () => void
  onShare: () => void
  onDownload: (svg: SVGSVGElement | null) => void
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const points = run.plannedRoute?.points ?? run.points
  const mapRoutes = useMemo(() => [{ id: run.id, points, color: LIME, selected: true }], [run.id, points])

  return (
    <li className={`run-item card${selected ? ' is-selected' : ''}`}>
      <RouteMap svgRef={svgRef} routes={mapRoutes} variant="thumb" className="run-item__map" />
      <div className="run-item__body">
        <p className="run-item__date">{formatRunDate(run.startedAt)}</p>
        <div className="run-item__title">
          <h3>
            <button type="button" className="run-item__select" aria-pressed={selected} onClick={onSelect}>
              <span className="history__sr-only">{selected ? 'Deselect route: ' : 'Select route: '}</span>
              {run.routeName}
            </button>
          </h3>
          <button
            type="button"
            className={`run-item__favorite${isFavorite ? ' is-favorite' : ''}`}
            aria-label={`${isFavorite ? 'Remove' : 'Add'} ${run.routeName} ${isFavorite ? 'from' : 'to'} favorites`}
            aria-pressed={isFavorite}
            onClick={onToggleFavorite}
          >
            <Star aria-hidden="true" fill={isFavorite ? 'currentColor' : 'none'} />
          </button>
        </div>
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
        {selected && (
          <div className="run-item__actions">
            <button type="button" className="btn btn--primary" onClick={onRun}>
              <Play aria-hidden="true" /> Run again
            </button>
            <button type="button" className="btn btn--secondary" onClick={onShare}>
              <Share2 aria-hidden="true" /> Share link
            </button>
            <button type="button" className="btn btn--secondary" onClick={() => onDownload(svgRef.current)}>
              <Download aria-hidden="true" /> Save picture
            </button>
          </div>
        )}
      </div>
    </li>
  )
}

function toGeneratedRoute(run: RunRecord): GeneratedRoute {
  if (run.plannedRoute) return run.plannedRoute
  return {
    id: run.routeId,
    name: run.routeName,
    difficulty: 'medium',
    terrain: 'Previously completed route',
    distanceKm: run.distanceKm,
    elevationGain: run.elevationGain,
    minElevation: 0,
    avgElevation: 0,
    maxElevation: 0,
    estimatedMinutes: Math.round(run.durationSec / 60),
    points: run.points.map((point) => ({ ...point, elevation: 0 })),
  }
}

function parseSharedRun(value: string | null): RunRecord | null {
  if (!value) return null
  try {
    const parsed: unknown = JSON.parse(value)
    return isRunRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isRunRecord(value: unknown): value is RunRecord {
  return (
    isObject(value) &&
    typeof value.id === 'string' &&
    typeof value.routeId === 'string' &&
    typeof value.routeName === 'string' &&
    typeof value.startedAt === 'string' &&
    !Number.isNaN(Date.parse(value.startedAt)) &&
    isFiniteNumber(value.distanceKm) &&
    isFiniteNumber(value.durationSec) &&
    isFiniteNumber(value.elevationGain) &&
    Array.isArray(value.points) &&
    value.points.length >= 2 &&
    value.points.every(isLatLng) &&
    (!('plannedRoute' in value) || isGeneratedRoute(value.plannedRoute))
  )
}

function isLatLng(value: unknown): value is LatLng {
  return isObject(value) && isFiniteNumber(value.lat) && isFiniteNumber(value.lng)
}

function isGeneratedRoute(value: unknown): value is GeneratedRoute {
  if (!isObject(value)) return false
  return (
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.terrain === 'string' &&
    (value.difficulty === 'easy' || value.difficulty === 'medium' || value.difficulty === 'hard') &&
    ['distanceKm', 'elevationGain', 'minElevation', 'avgElevation', 'maxElevation', 'estimatedMinutes'].every(
      (field) => isFiniteNumber(value[field]),
    ) &&
    Array.isArray(value.points) &&
    value.points.length >= 2 &&
    value.points.every(isRoutePoint)
  )
}

function isRoutePoint(value: unknown): value is LatLng & { elevation: number } {
  return isLatLng(value) && isObject(value) && isFiniteNumber(value.elevation)
}

async function shareRun(run: RunRecord, setMessage: (message: string) => void) {
  const url = new URL('/history', window.location.origin)
  url.searchParams.set('run', JSON.stringify(run))
  const text = `${run.routeName} · ${formatKm(run.distanceKm)} km`
  try {
    if (navigator.share) {
      await navigator.share({ title: run.routeName, text, url: url.toString() })
      setMessage('Route shared.')
    } else if (navigator.clipboard) {
      await navigator.clipboard.writeText(url.toString())
      setMessage('Share link copied to clipboard.')
    } else {
      setMessage(`Copy this link to share your route: ${url}`)
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return
    setMessage('Could not share the route. Try saving the picture instead.')
  }
}

async function downloadRunImage(run: RunRecord, svg: SVGSVGElement | null, setMessage: (message: string) => void) {
  if (!svg) {
    setMessage('The route picture could not be created.')
    return
  }
  try {
    const image = await svgToImage(svg)
    const canvas = document.createElement('canvas')
    canvas.width = 1200
    canvas.height = 630
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Canvas is unavailable')

    context.fillStyle = '#171c18'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(image, 48, 48, 560, 534)
    context.fillStyle = '#f3f5f4'
    context.font = '600 46px sans-serif'
    context.fillText(run.routeName, 660, 205, 490)
    context.fillStyle = '#aab2ab'
    context.font = '28px sans-serif'
    context.fillText(`${formatKm(run.distanceKm)} km · ${formatDuration(run.durationSec)}`, 660, 265)
    context.fillText(`${run.elevationGain} m elevation · DesirePath`, 660, 315)

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => (result ? resolve(result) : reject(new Error('PNG creation failed'))), 'image/png')
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${run.routeName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-route.png`
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    setMessage('Route picture saved.')
  } catch {
    setMessage('Could not create the route picture. Try sharing the link instead.')
  }
}

function svgToImage(svg: SVGSVGElement): Promise<HTMLImageElement> {
  const clone = svg.cloneNode(true) as SVGSVGElement
  const sourceNodes = [svg, ...svg.querySelectorAll('*')]
  const cloneNodes = [clone, ...clone.querySelectorAll('*')]
  const properties = ['fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'opacity']
  sourceNodes.forEach((source, index) => {
    const target = cloneNodes[index]
    if (!(source instanceof SVGElement) || !(target instanceof SVGElement)) return
    const computed = window.getComputedStyle(source)
    properties.forEach((property) => target.style.setProperty(property, computed.getPropertyValue(property)))
  })
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clone.setAttribute('width', '800')
  clone.setAttribute('height', '800')
  const blob = new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Map image rendering failed'))
    }
    image.src = url
  })
}
