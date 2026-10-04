import { ArrowUpRight, MapPin } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { NumberStepper } from '../components/NumberStepper.tsx'
import { WheelPicker } from '../components/WheelPicker.tsx'
import { TopoArt } from '../components/TopoArt.tsx'
import { useAppState } from '../hooks/useAppState.ts'
import { formatPostalCode, isValidPostalCode, lookupArea } from '../utils/areas.ts'
import './PlanPage.css'

const MAX_ELEVATION = 6000
const MIN_DISTANCE_KM = 1
const MAX_DISTANCE_KM = 42.2
const DISTANCE_PRESETS = [3, 5, 10, 21.1]
const MIN_TIME_MINUTES = 10
// Upper end of the hours wheel; enough for a marathon at an easy pace.
const MAX_TIME_HOURS = 6
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
  const showPostalError = submitted && !!postalError

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    if (postalError || distanceError || timeError || elevationError) return
    await findRoutes({
      postalCode: postal,
      targetDistanceKm: km,
      targetTime: { hours: h, minutes: m },
      minElevation: min,
      avgElevation: avg,
      maxElevation: max,
    })
    navigate('/routes')
  }

  return (
    <main className="page plan">
      <form onSubmit={onSubmit} noValidate>
        <div className="field">
          <label className="field__label" htmlFor="postal">
            Canadian postal code
          </label>
          <div className={`input-shell${showPostalError ? ' is-invalid' : ''}`}>
            <MapPin className="input-shell__icon" aria-hidden="true" />
            <input
              id="postal"
              placeholder="V5A 1S6"
              autoComplete="postal-code"
              autoCapitalize="characters"
              spellCheck={false}
              value={postal}
              aria-describedby={showPostalError ? 'postal-error' : undefined}
              aria-invalid={showPostalError || undefined}
              onChange={(e) => setPostal(formatPostalCode(e.target.value))}
            />
            <span className="input-shell__suffix">CA</span>
          </div>
          {/* Only errors appear under fields; no always-on helper text */}
          {showPostalError && (
            <p id="postal-error" className="field__hint is-error" role="alert">
              {postalError}
            </p>
          )}
        </div>

        <div className="plan__section-head">
          <h2>Set your distance</h2>
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
        </div>

        {/* iPhone Clock-style: hours and minutes side by side, scroll or flick to change */}
        <div className={`time-picker${submitted && timeError ? ' is-invalid' : ''}`} role="group" aria-label="Time">
          <WheelPicker label="Hours" unit="hours" min={0} max={MAX_TIME_HOURS} value={h} onChange={(v) => setHours(String(v))} />
          <WheelPicker label="Minutes" unit="min" min={0} max={59} value={m} onChange={(v) => setMinutes(String(v))} />
        </div>

        {submitted && timeError && (
          <p className="field__hint is-error" role="alert">
            {timeError}
          </p>
        )}

        <div className="plan__section-head">
          <h2>Set your elevation</h2>
          <span>Meters above sea level</span>
        </div>

        <NumberStepper id="min" label="Min Elevation" value={minE} onChange={setMinE} invalid={submitted && !!elevationError} />
        <NumberStepper id="avg" label="Average Elevation" value={avgE} onChange={setAvgE} invalid={submitted && !!elevationError} />
        <NumberStepper id="max" label="Max Elevation" value={maxE} onChange={setMaxE} invalid={submitted && !!elevationError} />

        {submitted && elevationError && (
          <p className="field__hint is-error" role="alert">
            {elevationError}
          </p>
        )}

        <button type="submit" className="btn btn--primary btn--block plan__submit" disabled={loading}>
          <ArrowUpRight aria-hidden="true" />
          {loading ? 'Finding routes…' : 'Find My Routes'}
        </button>
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
