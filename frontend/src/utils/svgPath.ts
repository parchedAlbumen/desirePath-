export type Pt = [number, number]

const fmt = (p: Pt) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`

/** Smooth a polyline into cubic Béziers (Catmull-Rom). */
export function smoothPath(pts: Pt[], closed = false): string {
  const n = pts.length
  if (n < 2) return ''
  const get = (i: number) => (closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))])
  let d = `M${fmt(pts[0])}`
  const segments = closed ? n : n - 1
  for (let i = 0; i < segments; i++) {
    const [p0, p1, p2, p3] = [get(i - 1), get(i), get(i + 1), get(i + 2)]
    const c1: Pt = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]
    const c2: Pt = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]
    d += ` C${fmt(c1)} ${fmt(c2)} ${fmt(p2)}`
  }
  return closed ? `${d} Z` : d
}

/** Deterministic PRNG so decorative shapes don't jump between renders. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A wobbly closed ring, used for topo contour lines. */
export function blobRing(cx: number, cy: number, r: number, seed: number, wobble = 0.12, steps = 28): Pt[] {
  const rand = seededRandom(seed)
  const p2 = rand() * Math.PI * 2
  const p3 = rand() * Math.PI * 2
  const out: Pt[] = []
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2
    const rr = r * (1 + wobble * Math.sin(2 * a + p2) + wobble * 0.6 * Math.sin(3 * a + p3))
    out.push([cx + rr * Math.cos(a), cy + rr * 0.78 * Math.sin(a)])
  }
  return out
}
