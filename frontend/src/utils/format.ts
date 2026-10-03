export function formatDuration(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = String(s % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${String(m).padStart(2, '0')}:${sec}`
}

/** min/km as m:ss, or "--:--" before there's enough distance to be meaningful. */
export function formatPace(elapsedSec: number, distanceKm: number): string {
  if (distanceKm < 0.05) return '--:--'
  const secPerKm = Math.round(elapsedSec / distanceKm)
  return `${Math.floor(secPerKm / 60)}:${String(secPerKm % 60).padStart(2, '0')}`
}

/** "OCT 02, 2026 · 7:12 AM" */
export function formatRunDate(iso: string): string {
  const d = new Date(iso)
  const date = d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  return `${date} · ${time}`.toUpperCase()
}

export const formatKm = (km: number) => km.toFixed(1)
