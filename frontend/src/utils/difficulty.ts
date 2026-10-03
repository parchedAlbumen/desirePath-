import type { Difficulty } from '../types/route.ts'

// Hex rather than CSS vars because these are used as SVG stroke attributes.
export const LIME = '#c8f250'

export const DIFFICULTY_COLOR: Record<Difficulty, string> = {
  easy: '#a6dd4c',
  medium: '#f3c35c',
  hard: '#e07a6b',
}

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
}
