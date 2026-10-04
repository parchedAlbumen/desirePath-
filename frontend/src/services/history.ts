// Runs for people who aren't signed in. They live in sessionStorage, so they last only as long as the tab
// (close it and they're gone). Signed-in users' runs live on the backend instead (services/runs.ts).
import type { RunRecord } from '../types/route.ts'

const GUEST_RUNS_KEY = 'desirepath.guest-runs.v1'
export const MAX_SAVED_RUNS = 2

export function mostRecentRuns(runs: RunRecord[]): RunRecord[] {
  return [...runs].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, MAX_SAVED_RUNS)
}

export function loadGuestRuns(): RunRecord[] {
  try {
    const raw = sessionStorage.getItem(GUEST_RUNS_KEY)
    if (raw) {
      const parsed: unknown = JSON.parse(raw)
      if (Array.isArray(parsed)) return mostRecentRuns(parsed as RunRecord[])
      throw new Error('Saved run history is not a list.')
    }
  } catch (error) {
    console.warn('[history] Could not load this tab\'s runs:', error)
  }
  return []
}

export function saveGuestRuns(runs: RunRecord[]): void {
  try {
    sessionStorage.setItem(GUEST_RUNS_KEY, JSON.stringify(mostRecentRuns(runs)))
  } catch (error) {
    console.warn('[history] Could not keep this tab\'s runs:', error)
  }
}
