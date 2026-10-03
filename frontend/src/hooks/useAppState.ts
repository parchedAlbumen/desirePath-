import { useContext } from 'react'
import { AppStateContext } from '../state/context.ts'

export function useAppState() {
  const ctx = useContext(AppStateContext)
  if (!ctx) throw new Error('useAppState must be used inside <AppStateProvider>')
  return ctx
}
