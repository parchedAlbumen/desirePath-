import { ArrowUpRight, CheckCircle2, MapPin, Navigation } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { NumberStepper } from '../components/NumberStepper.tsx'
import { WheelPicker } from '../components/WheelPicker.tsx'
import { TopoArt } from '../components/TopoArt.tsx'
import { useAppState } from '../hooks/useAppState.ts'
import { formatPostalCode, isValidPostalCode, lookupArea } from '../utils/areas.ts'
import type { LatLng } from '../types/route.ts'
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
const SLOWEST_PACE_MIN_PER_KM = 20
type GoalMode = 'distance' | 'duration'

export function PlanPage() {
  const { request, findRoutes, loading } = useAppState()
  const navigate = useNavigate()

  const [postal, setPostal] = useState(request?.postalCode ?? '')
  const [goalMode, setGoalMode] = useState<GoalMode>(request?.targetDistanceKm == null ? 'duration' : 'distance')
  const [minE, setMinE] = useState(String(request?.minElevation ?? -50))
  const [avgE, setAvgE] = useState(String(request?.avgElevation ?? 0))
  const [maxE, setMaxE] = useState(String(request?.maxElevation ?? 50))
  const [distance, setDistance] = useState(String(request?.targetDistanceKm ?? 5))
  const [hours, setHours] = useState(String(request?.targetTime?.hours ?? 0))
  const [minutes, setMinutes] = useState(String(request?.targetTime?.minutes ?? 45))
  const [pace, setPace] = useState(String(request?.targetPaceMinPerKm ?? 6))
  const [submitted, setSubmitted] = useState(false)
  const [generateError, setGenerateError] = useState<string | null>(null)
  const [currentLocation, setCurrentLocation] = useState<LatLng | null>(() =>
    request?.startLat != null && request.startLng != null
      ? { lat: request.startLat, lng: request.startLng }
      : null,
  )
  const [useCurrentLocation, setUseCurrentLocation] = useState(
    request?.startLat != null && request.startLng != null,
  )
  const [locating, setLocating] = useState(false)
  const [locationError, setLocationError] = useState<string | null>(null)

  const [min, avg, max] = [minE, avgE, maxE].map((v) => parseInt(v, 10))
  const km = parseFloat(distance)
  const [h, m] = [hours, minutes].map((v) => parseInt(v, 10))
  const totalMinutes = h * 60 + m
  const paceMinPerKm = parseFloat(pace)
  const targetKm = goalMode === 'distance' ? km : totalMinutes / paceMinPerKm

  const postalError =
    useCurrentLocation || isValidPostalCode(postal) ? null : 'Enter a Canadian postal code like V5A 1S6.'
  const distanceError =
    goalMode === 'duration' && (!Number.isFinite(paceMinPerKm) || paceMinPerKm < FASTEST_PACE_MIN_PER_KM || paceMinPerKm > SLOWEST_PACE_MIN_PER_KM)
      ? `Choose a pace between ${FASTEST_PACE_MIN_PER_KM} and ${SLOWEST_PACE_MIN_PER_KM} min/km.`
    : !Number.isFinite(targetKm) ? goalMode === 'distance' ? 'Enter how far you want to run.' : 'Enter a duration and pace.'
    : targetKm < MIN_DISTANCE_KM || targetKm > MAX_DISTANCE_KM ? `That duration and pace works out to ${targetKm.toFixed(1)} km. Choose settings between ${MIN_DISTANCE_KM} and ${MAX_DISTANCE_KM} km.`
    : null
  const timeError =
    goalMode === 'distance' ? null
    : Number.isNaN(h) || Number.isNaN(m) ? 'Enter how long you want to run.'
    : m > 59 ? 'Minutes should be 0–59.'
    : totalMinutes < MIN_TIME_MINUTES ? `Give yourself at least ${MIN_TIME_MINUTES} minutes.`
    : null
  const elevationError =
    [min, avg, max].some(Number.isNaN) ? 'Fill in all three elevations.'
    : [min, avg, max].some((value) => Math.abs(value) > MAX_ELEVATION) ? `Keep elevation changes between -${MAX_ELEVATION} m and ${MAX_ELEVATION} m.`
    : min > 0 || max < 0 ? 'A route starts at 0 m change, so minimum must be 0 or lower and maximum 0 or higher.'
    : !(min <= avg && avg <= max) ? 'Keep min ≤ average ≤ max.'
    : null

  const area = useCurrentLocation
    ? { name: 'Your current location', tagline: 'Routes will start from your GPS position.' }
    : lookupArea(postal)
  const showPostalError = submitted && !!postalError

  const onUseCurrentLocation = () => {
    setLocationError(null)
    if (!window.isSecureContext) {
      setLocationError('Current location requires a secure connection (HTTPS or localhost).')
      return
    }
    if (!('geolocation' in navigator)) {
      setLocationError('This browser does not support location services.')
      return
    }

    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setCurrentLocation({ lat: coords.latitude, lng: coords.longitude })
        setUseCurrentLocation(true)
        setLocationError(null)
        setLocating(false)
      },
      (error) => {
        const message =
          error.code === error.PERMISSION_DENIED ? 'Location permission was denied. Allow location access in your browser settings and try again.'
          : error.code === error.POSITION_UNAVAILABLE ? 'Your current location could not be determined. Try again or enter a postal code.'
          : 'Getting your location took too long. Try again or enter a postal code.'
        setLocationError(message)
        setLocating(false)
      },
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 15_000 },
    )
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    if (postalError || distanceError || timeError || elevationError || (useCurrentLocation && !currentLocation)) return
    setGenerateError(null)
    try {
      await findRoutes({
        ...(useCurrentLocation && currentLocation
          ? { startLat: currentLocation.lat, startLng: currentLocation.lng }
          : { postalCode: postal }),
        ...(goalMode === 'distance'
          ? { targetDistanceKm: km }
          : { targetTime: { hours: h, minutes: m }, targetPaceMinPerKm: paceMinPerKm }),
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
              onChange={(e) => {
                setPostal(formatPostalCode(e.target.value))
                setUseCurrentLocation(false)
                setLocationError(null)
              }}
            />
            <span className="input-shell__suffix">CA</span>
          </div>
          {/* Only errors appear under fields; no always-on helper text */}
          {showPostalError && (
            <p id="postal-error" className="field__hint is-error" role="alert">
              {postalError}
            </p>
          )}
          <button
            type="button"
            className={`btn btn--secondary plan__location${useCurrentLocation ? ' is-selected' : ''}`}
            onClick={onUseCurrentLocation}
            disabled={locating || loading}
            aria-pressed={useCurrentLocation}
          >
            <Navigation aria-hidden="true" />
            {locating ? 'Getting your location…' : useCurrentLocation ? 'Using your current location' : 'Use my current location'}
          </button>
          {useCurrentLocation && !locating && (
            <p className="plan__location-ready" role="status">
              <CheckCircle2 aria-hidden="true" />
              <span>
                <strong>Location ready.</strong> Scroll down and tap “Find Routes From My Location” to create your routes.
              </span>
            </p>
          )}
          {useCurrentLocation && !locating && (
            <button
              type="button"
              className="plan__postal-choice"
              onClick={() => {
                setUseCurrentLocation(false)
                setLocationError(null)
              }}
            >
              Use postal code instead
            </button>
          )}
          {locationError && (
            <p className="field__hint is-error" role="alert">
              {locationError}
            </p>
          )}
        </div>

        <div className="plan__section-head">
          <h2>Choose your route goal</h2>
        </div>
        <div className="plan__goal-toggle">
          <span className={goalMode === 'distance' ? 'is-active' : ''}>Distance</span>
          <button
            type="button"
            role="switch"
            aria-label="Route goal"
            aria-checked={goalMode === 'duration'}
            onClick={() => setGoalMode((mode) => mode === 'distance' ? 'duration' : 'distance')}
          >
            <span />
          </button>
          <span className={goalMode === 'duration' ? 'is-active' : ''}>Duration + pace</span>
        </div>

        {goalMode === 'distance' ? (
          <>
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
          </>
        ) : (
          <>
            <div className="plan__section-head">
              <h2>How long do you want to run?</h2>
            </div>
            <div className={`time-picker${submitted && timeError ? ' is-invalid' : ''}`} role="group" aria-label="Duration">
              <WheelPicker label="Hours" unit="hours" min={0} max={MAX_TIME_HOURS} value={h} onChange={(v) => setHours(String(v))} />
              <WheelPicker label="Minutes" unit="min" min={0} max={59} value={m} onChange={(v) => setMinutes(String(v))} />
            </div>
            <NumberStepper
              id="pace"
              label="Target pace"
              value={pace}
              onChange={setPace}
              step={0.1}
              unit="min/km"
              decimal
              invalid={submitted && !!distanceError}
            />
            <p className="field__hint">Estimated route distance: {Number.isFinite(targetKm) ? targetKm.toFixed(1) : '—'} km</p>
          </>
        )}

        {submitted && distanceError && (
          <p className="field__hint is-error" role="alert">
            {distanceError}
          </p>
        )}

        {submitted && timeError && (
          <p className="field__hint is-error" role="alert">
            {timeError}
          </p>
        )}

        <div className="plan__section-head">
          <h2>Set your elevation</h2>
          <span>Meters relative to start</span>
        </div>

        <NumberStepper id="min" label="Min Elevation" value={minE} onChange={setMinE} allowNegative invalid={submitted && !!elevationError} />
        <NumberStepper id="avg" label="Average Elevation" value={avgE} onChange={setAvgE} allowNegative invalid={submitted && !!elevationError} />
        <NumberStepper id="max" label="Max Elevation" value={maxE} onChange={setMaxE} allowNegative invalid={submitted && !!elevationError} />

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
          {loading ? 'Finding routes…' : useCurrentLocation ? 'Find Routes From My Location' : 'Find My Routes'}
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
