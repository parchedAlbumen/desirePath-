import { ArrowUpRight, MapPin } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Logo } from '../components/Logo.tsx'
import { NumberStepper } from '../components/NumberStepper.tsx'
import { TopoArt } from '../components/TopoArt.tsx'
import { useAppState } from '../hooks/useAppState.ts'
import type { RouteLimit } from '../types/route.ts'
import { formatPostalCode, isKnownArea, isValidPostalCode, lookupArea } from '../utils/areas.ts'
import './PlanPage.css'

const MAX_ELEVATION = 6000

export function PlanPage() {
  const { request, findRoutes, loading } = useAppState()
  const navigate = useNavigate()

  const [postal, setPostal] = useState(request?.postalCode ?? '')
  const [minE, setMinE] = useState(String(request?.minElevation ?? 260))
  const [avgE, setAvgE] = useState(String(request?.avgElevation ?? 310))
  const [maxE, setMaxE] = useState(String(request?.maxElevation ?? 370))
  const [limitType, setLimitType] = useState<RouteLimit['type']>(request?.limit.type ?? 'distance')
  const [maxDistanceKm, setMaxDistanceKm] = useState(
    String(request?.limit.type === 'distance' ? request.limit.maxDistanceKm : 8),
  )
  const [maxDurationMinutes, setMaxDurationMinutes] = useState(
    String(request?.limit.type === 'time' ? request.limit.maxDurationMinutes : 60),
  )
  const [submitted, setSubmitted] = useState(false)

  const [min, avg, max] = [minE, avgE, maxE].map((v) => parseInt(v, 10))
  const routeLimitValue = Number(limitType === 'distance' ? maxDistanceKm : maxDurationMinutes)
  const postalError = isValidPostalCode(postal) ? null : 'Enter a Canadian postal code like V5A 1S6.'
  const elevationError =
    [min, avg, max].some(Number.isNaN) ? 'Fill in all three elevations.'
    : max > MAX_ELEVATION ? `Keep elevations under ${MAX_ELEVATION} m.`
    : !(min <= avg && avg <= max) ? 'Keep min ≤ average ≤ max.'
    : null
  const routeLimitError =
    !Number.isFinite(routeLimitValue) || routeLimitValue <= 0
      ? `Enter a maximum ${limitType === 'distance' ? 'distance' : 'time'} greater than zero.`
      : null

  const area = lookupArea(postal)
  const province = area.region.split(', ').pop()
  const postalHint =
    submitted && postalError ? postalError
    : isKnownArea(postal) ? `Explore around ${area.name}, ${province}`
    : "We'll look for routes close to you."

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    if (postalError || elevationError || routeLimitError) return
    const limit: RouteLimit =
      limitType === 'distance'
        ? { type: 'distance', maxDistanceKm: routeLimitValue }
        : { type: 'time', maxDurationMinutes: routeLimitValue }
    await findRoutes({ postalCode: postal, minElevation: min, avgElevation: avg, maxElevation: max, limit })
    navigate('/routes')
  }

  return (
    <main className="page plan">
      <Logo />

      <p className="eyebrow plan__eyebrow">Built for your next run</p>
      <h1 className="plan__title">
        New ground.
        <br />
        Your pace.
      </h1>
      <p className="plan__lede">Start close to home. Find a route that fits your elevation goals.</p>

      <form onSubmit={onSubmit} noValidate>
        <div className="field">
          <label className="field__label" htmlFor="postal">
            Canadian postal code
          </label>
          <div className={`input-shell${submitted && postalError ? ' is-invalid' : ''}`}>
            <MapPin className="input-shell__icon" aria-hidden="true" />
            <input
              id="postal"
              placeholder="V5A 1S6"
              autoComplete="postal-code"
              autoCapitalize="characters"
              spellCheck={false}
              value={postal}
              aria-describedby="postal-hint"
              aria-invalid={(submitted && !!postalError) || undefined}
              onChange={(e) => setPostal(formatPostalCode(e.target.value))}
            />
            <span className="input-shell__suffix">CA</span>
          </div>
          <p id="postal-hint" className={`field__hint${submitted && postalError ? ' is-error' : ''}`}>
            {postalHint}
          </p>
        </div>

        <div className="plan__section-head">
          <h2>Set your route limit</h2>
          <span>Choose one</span>
        </div>
        <div className="plan__limit-toggle" role="group" aria-label="Maximum route limit">
          <button
            type="button"
            aria-pressed={limitType === 'distance'}
            onClick={() => setLimitType('distance')}
          >
            Maximum distance
          </button>
          <button
            type="button"
            aria-pressed={limitType === 'time'}
            onClick={() => setLimitType('time')}
          >
            Maximum time
          </button>
        </div>
        <div className="field">
          <label className="field__label" htmlFor="route-limit">
            {limitType === 'distance' ? 'Maximum distance' : 'Maximum time'}
          </label>
          <div className={`input-shell${submitted && routeLimitError ? ' is-invalid' : ''}`}>
            <input
              id="route-limit"
              type="number"
              min="0.1"
              step={limitType === 'distance' ? '0.1' : '1'}
              inputMode="decimal"
              value={limitType === 'distance' ? maxDistanceKm : maxDurationMinutes}
              aria-describedby="route-limit-hint"
              aria-invalid={(submitted && !!routeLimitError) || undefined}
              onChange={(e) =>
                limitType === 'distance'
                  ? setMaxDistanceKm(e.target.value)
                  : setMaxDurationMinutes(e.target.value)
              }
            />
            <span className="input-shell__suffix">{limitType === 'distance' ? 'km' : 'min'}</span>
          </div>
          <p
            id="route-limit-hint"
            className={`field__hint${submitted && routeLimitError ? ' is-error' : ''}`}
          >
            {submitted && routeLimitError
              ? routeLimitError
              : `We'll only suggest routes up to this ${limitType === 'distance' ? 'distance' : 'time'}.`}
          </p>
        </div>

        <div className="plan__section-head">
          <h2>Set your elevation</h2>
          <span>Meters above sea level</span>
        </div>

        <NumberStepper id="min" label="Min Elevation" hint="The lowest point on your route." value={minE} onChange={setMinE} invalid={submitted && !!elevationError} />
        <NumberStepper id="avg" label="Average Elevation" hint="Your preferred average altitude." value={avgE} onChange={setAvgE} invalid={submitted && !!elevationError} />
        <NumberStepper id="max" label="Max Elevation" hint="The highest point you want to reach." value={maxE} onChange={setMaxE} invalid={submitted && !!elevationError} />

        {submitted && elevationError && (
          <p className="field__hint is-error" role="alert">
            {elevationError}
          </p>
        )}

        <button type="submit" className="btn btn--primary btn--block plan__submit" disabled={loading}>
          <ArrowUpRight aria-hidden="true" />
          {loading ? 'Finding routes…' : 'Find My Routes'}
        </button>
        <p className="plan__submit-note">Three routes. One great place to start.</p>
      </form>

      <section className="ground-card">
        <div className="ground-card__text">
          <p className="eyebrow">Your local running ground</p>
          <h2>{area.name}</h2>
          <p>{area.tagline}</p>
        </div>
        <TopoArt />
      </section>
    </main>
  )
}
