import type { Difficulty } from '../types/route.ts'

// Hex rather than CSS vars because these are used as SVG stroke attributes.
export const PRIMARY = '#f4a261' // keep in sync with --primary in index.css

export const DIFFICULTY_COLOR: Record<Difficulty, string> = {
  easy: '#4ade80',
  medium: '#facc15',
  hard: '#f87171',
}

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
}
