import { PRIMARY } from '../utils/difficulty.ts'
import { blobRing, smoothPath } from '../utils/svgPath.ts'

const W = 220
const H = 170

const contours = Array.from({ length: 9 }, (_, i) => smoothPath(blobRing(150, 70, 16 + i * 17, i + 40, 0.14), true))
const road = smoothPath([
  [-10, 150],
  [70, 128],
  [120, 104],
  [150, 96],
  [230, 108],
])
const loop = smoothPath(
  [
    [104, 96],
    [86, 70],
    [104, 46],
    [150, 40],
    [178, 54],
    [168, 76],
    [134, 84],
  ],
  true,
)

/** Decorative topo snippet for the "local running ground" card on the planner. */
export function TopoArt() {
  return (
    <svg className="topo-art" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <rect width={W} height={H} fill="#e9eef5" />
      {contours.map((d, i) => (
        <path key={i} d={d} fill="none" stroke="rgba(15,23,42,0.1)" strokeWidth={1} />
      ))}
      <path d={road} fill="none" stroke="#cbd5e1" strokeWidth={6} strokeLinecap="round" />
      <path d={loop} fill="none" stroke={PRIMARY} strokeWidth={3} strokeLinejoin="round" />
    </svg>
  )
}
