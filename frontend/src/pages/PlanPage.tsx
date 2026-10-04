import { ArrowUpRight, MapPin } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Logo } from '../components/Logo.tsx'
import { NumberStepper } from '../components/NumberStepper.tsx'
import { TopoArt } from '../components/TopoArt.tsx'
import { useAppState } from '../hooks/useAppState.ts'
import { formatPostalCode, isKnownArea, isValidPostalCode, lookupArea } from '../utils/areas.ts'
import './PlanPage.css'

const MAX_ELEVATION = 6000
const MIN_DISTANCE_KM = 1
const MAX_DISTANCE_KM = 42.2
const DISTANCE_PRESETS = [3, 5, 10, 21.1]
const MIN_TIME_MINUTES = 10
// Faster than ~3 min/km is elite territory; flag it rather than generate impossible routes.
const FASTEST_PACE_MIN_PER_KM = 3

export function PlanPage() {
  const { request, findRoutes, loading } = useAppState()
  const navigate = useNavigate()

  const [postal, setPostal] = useState(request?.postalCode ?? '')
  const [minE, setMinE] = useState(String(request?.minElevation ?? 260))
  const [avgE, setAvgE] = useState(String(request?.avgElevation ?? 310))
  const [maxE, setMaxE] = useState(String(request?.maxElevation ?? 370))
  const [distance, setDistance] = useState(String(request?.targetDistanceKm ?? 5))
  const [hours, setHours] = useState(String(request?.targetTime.hours ?? 0))
  const [minutes, setMinutes] = useState(String(request?.targetTime.minutes ?? 45))
  const [submitted, setSubmitted] = useState(false)
  const [generateError, setGenerateError] = useState<string | null>(null)

  const [min, avg, max] = [minE, avgE, maxE].map((v) => parseInt(v, 10))
  const km = parseFloat(distance)
  const [h, m] = [hours, minutes].map((v) => parseInt(v, 10))
  const totalMinutes = h * 60 + m

  const postalError = isValidPostalCode(postal) ? null : 'Enter a Canadian postal code like V5A 1S6.'
  const distanceError =
    Number.isNaN(km) ? 'Enter how far you want to run.'
    : km < MIN_DISTANCE_KM || km > MAX_DISTANCE_KM ? `Pick a distance between ${MIN_DISTANCE_KM} and ${MAX_DISTANCE_KM} km.`
    : null
  const timeError =
    Number.isNaN(h) || Number.isNaN(m) ? 'Enter how long you want to run.'
    : m > 59 ? 'Minutes should be 0–59.'
    : totalMinutes < MIN_TIME_MINUTES ? `Give yourself at least ${MIN_TIME_MINUTES} minutes.`
    : !distanceError && totalMinutes / km < FASTEST_PACE_MIN_PER_KM
      ? `${km} km in ${totalMinutes} min is under ${FASTEST_PACE_MIN_PER_KM} min/km. Add time or shorten the distance.`
    : null
  const elevationError =
    [min, avg, max].some(Number.isNaN) ? 'Fill in all three elevations.'
    : max > MAX_ELEVATION ? `Keep elevations under ${MAX_ELEVATION} m.`
    : !(min <= avg && avg <= max) ? 'Keep min ≤ average ≤ max.'
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
    if (postalError || distanceError || timeError || elevationError) return
    setGenerateError(null)
    try {
      await findRoutes({
        postalCode: postal,
        targetDistanceKm: km,
        targetTime: { hours: h, minutes: m },
        minElevation: min,
        avgElevation: avg,
        maxElevation: max,
      })
    } catch (error) {
      setGenerateError(error instanceof Error ? error.message : 'Could not find routes. Try again.')
      return
    }
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
          <h2>Set your distance</h2>
          <span>Kilometers</span>
        </div>

        <div className="chips" role="group" aria-label="Quick distance picks">
          {DISTANCE_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              className={`chip${km === preset ? ' is-active' : ''}`}
              aria-pressed={km === preset}
              onClick={() => setDistance(String(preset))}
            >
              {preset} km
            </button>
          ))}
        </div>

        <NumberStepper
          id="distance"
          label="Distance"
          hint="All three routes will be about this long."
          value={distance}
          onChange={setDistance}
          step={0.5}
          unit="km"
          decimal
          invalid={submitted && !!distanceError}
        />

        {submitted && distanceError && (
          <p className="field__hint is-error" role="alert">
            {distanceError}
          </p>
        )}

        <div className="plan__section-head">
          <h2>Set your time</h2>
          <span>How long you have</span>
        </div>

        <NumberStepper
          id="hours"
          label="Hours"
          hint="0 if you're out for less than an hour."
          value={hours}
          onChange={setHours}
          step={1}
          unit="h"
          invalid={submitted && !!timeError}
        />
        <NumberStepper
          id="minutes"
          label="Minutes"
          hint="Routes won't take longer than your total time."
          value={minutes}
          onChange={setMinutes}
          step={5}
          unit="min"
          invalid={submitted && !!timeError}
        />

        {submitted && timeError && (
          <p className="field__hint is-error" role="alert">
            {timeError}
          </p>
        )}

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

        {generateError && (
          <p className="field__hint is-error" role="alert">
            {generateError}
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
