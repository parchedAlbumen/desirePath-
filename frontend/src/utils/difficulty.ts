import type { Difficulty } from '../types/route.ts'

// Hex rather than CSS vars because these are used as SVG stroke attributes.
export const PRIMARY = '#172554' // keep in sync with --primary in index.css

export const DIFFICULTY_COLOR: Record<Difficulty, string> = {
  easy: '#16a34a',
  medium: '#ca8a04',
  hard: '#dc2626',
}

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
}
