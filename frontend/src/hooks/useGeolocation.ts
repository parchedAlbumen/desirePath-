import { useEffect, useRef, useState } from 'react'

/** One GPS reading. */
export interface GpsFix {
  lat: number
  lng: number
  /** How sure the phone is, in metres: "you're within this many metres of here". */
  accuracy: number
  timestamp: number
}

/** Watches the device's location while `enabled` is true. */
export function useGeolocation(enabled: boolean, onFix?: (fix: GpsFix) => void) {
  const [fix, setFix] = useState<GpsFix | null>(null)
  const [error, setError] = useState<string | null>(null)
  const supported = 'geolocation' in navigator

  const onFixRef = useRef(onFix)
  useEffect(() => {
    onFixRef.current = onFix
  })

  useEffect(() => {
    if (!enabled || !supported) return


    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const next: GpsFix = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          timestamp: pos.timestamp,
        }
        setError(null)
        setFix(next)
        onFixRef.current?.(next)
      },
      (err) => setError(err.message),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
    )

    // Stop watching when the run ends or the component goes away; otherwise GPS keeps draining the battery.
    return () => navigator.geolocation.clearWatch(watchId)
  }, [enabled, supported])

    return { fix, error: supported ? error : 'This browser has no GPS support.' }

}
