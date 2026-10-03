import type { Difficulty } from '../types/route.ts'
import { DIFFICULTY_LABEL } from '../utils/difficulty.ts'

export function DifficultyBadge({ difficulty }: { difficulty: Difficulty }) {
  return (
    <span className={`badge badge--${difficulty}`}>
      <i aria-hidden="true" />
      {DIFFICULTY_LABEL[difficulty]}
    </span>
  )
}
