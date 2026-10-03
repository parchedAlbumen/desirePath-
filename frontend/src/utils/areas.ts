import type { LatLng } from '../types/route.ts'

export interface AreaInfo {
  name: string
  region: string
  tagline: string
  startLabel: string
  start: LatLng
  routeNames: [string, string, string]
}

// Canadian postal codes: letter-digit-letter digit-letter-digit, no D F I O Q U (and no W/Z first).
const POSTAL_RE = /^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z] ?\d[ABCEGHJ-NPRSTV-Z]\d$/i

export const isValidPostalCode = (value: string) => POSTAL_RE.test(value.trim())

/** Uppercase and insert the space as the user types: "v5a1s6" → "V5A 1S6". */
export function formatPostalCode(raw: string): string {
  const clean = raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
  return clean.length > 3 ? `${clean.slice(0, 3)} ${clean.slice(3)}` : clean
}

// Demo lookup by forward sortation area (first 3 chars) until the backend geocodes for real.
const AREAS: Record<string, AreaInfo> = {
  V5A: {
    name: 'Burnaby Mountain',
    region: 'Burnaby, BC',
    tagline: 'Forest trails. Campus loops.',
    startLabel: 'SFU',
    start: { lat: 49.2781, lng: -122.9199 },
    routeNames: ['Campus Loop', 'Mountain Connector', 'Conservation Loop'],
  },
  V6G: {
    name: 'Stanley Park',
    region: 'Vancouver, BC',
    tagline: 'Seawall loops. Old-growth paths.',
    startLabel: 'Lost Lagoon',
    start: { lat: 49.2945, lng: -123.1395 },
    routeNames: ['Lagoon Loop', 'Prospect Point Climb', 'Seawall Circuit'],
  },
  V6T: {
    name: 'UBC',
    region: 'Vancouver, BC',
    tagline: 'Pacific Spirit trails. Ocean views.',
    startLabel: 'UBC',
    start: { lat: 49.2606, lng: -123.246 },
    routeNames: ['Main Mall Loop', 'Pacific Spirit Connector', 'Wreck Beach Stairs'],
  },
}

const FALLBACK: AreaInfo = {
  name: 'Your neighbourhood',
  region: 'Canada',
  tagline: 'Local streets. New loops.',
  startLabel: 'your start',
  start: { lat: 49.2781, lng: -122.9199 },
  routeNames: ['Neighbourhood Loop', 'Hill Connector', 'Summit Loop'],
}

const fsa = (postalCode: string) => postalCode.trim().slice(0, 3).toUpperCase()

export const lookupArea = (postalCode: string): AreaInfo => AREAS[fsa(postalCode)] ?? FALLBACK

/** True when we have a named area for this code (used for the helper text). */
export const isKnownArea = (postalCode: string) => fsa(postalCode) in AREAS
