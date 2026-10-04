import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import './WheelPicker.css'

// Keep in sync with --wheel-item-h / --wheel-visible in WheelPicker.css.
const ITEM_HEIGHT = 40
const SETTLE_MS = 90

interface WheelPickerProps {
  /** Accessible name, e.g. "Hours". */
  label: string
  /** Shown beside the selected number, like the iPhone Clock app ("hours", "min"). */
  unit: string
  min: number
  max: number
  value: number
  onChange: (value: number) => void
}

/**
 * iOS-style scroll wheel. Built on CSS scroll snapping, so flicking on a phone gets
 * native momentum and always settles on a number. Mouse wheel, click and arrow keys work too.
 */
export function WheelPicker({ label, unit, min, max, value, onChange }: WheelPickerProps) {
  const listRef = useRef<HTMLDivElement>(null)
  const settleTimer = useRef<number | undefined>(undefined)
  const values = Array.from({ length: max - min + 1 }, (_, i) => min + i)
  // Which number sits in the highlight band right now (updates live while scrolling).
  const [centered, setCentered] = useState(value)

  const scrollToValue = (v: number, smooth: boolean) => {
    listRef.current?.scrollTo({ top: (v - min) * ITEM_HEIGHT, behavior: smooth ? 'smooth' : 'auto' })
  }

  // Start on the current value without an animation.
  useLayoutEffect(() => {
    scrollToValue(value, false)
    // Only on mount; later outside changes are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // If the value changes from outside (not from scrolling this wheel), roll the wheel to it.
  useEffect(() => {
    const list = listRef.current
    if (!list) return
    const shown = min + Math.round(list.scrollTop / ITEM_HEIGHT)
    if (shown !== value) list.scrollTo({ top: (value - min) * ITEM_HEIGHT, behavior: 'smooth' })
  }, [value, min])

  useEffect(() => () => window.clearTimeout(settleTimer.current), [])

  const onScroll = () => {
    const list = listRef.current
    if (!list) return
    const index = Math.min(values.length - 1, Math.max(0, Math.round(list.scrollTop / ITEM_HEIGHT)))
    const next = min + index
    setCentered(next)
    // Report the value once the wheel stops, rather than on every frame of the flick.
    window.clearTimeout(settleTimer.current)
    settleTimer.current = window.setTimeout(() => {
      if (next !== value) onChange(next)
    }, SETTLE_MS)
  }

  const step = (delta: number) => {
    const next = Math.min(max, Math.max(min, value + delta))
    if (next !== value) {
      onChange(next)
      scrollToValue(next, true)
    }
  }

  const onKeyDown = (event: KeyboardEvent) => {
    const moves: Record<string, number> = { ArrowUp: -1, ArrowDown: 1, PageUp: -5, PageDown: 5 }
    if (event.key in moves) step(moves[event.key])
    else if (event.key === 'Home') step(min - value)
    else if (event.key === 'End') step(max - value)
    else return
    event.preventDefault()
  }

  return (
    <div className="wheel">
      <div
        ref={listRef}
        className="wheel__list"
        role="spinbutton"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={`${value} ${unit}`}
        onScroll={onScroll}
        onKeyDown={onKeyDown}
      >
        {values.map((v) => (
          <div
            key={v}
            className={`wheel__item${v === centered ? ' is-centered' : ''}`}
            aria-hidden="true"
            onClick={() => {
              onChange(v)
              scrollToValue(v, true)
            }}
          >
            {v}
          </div>
        ))}
      </div>
      <span className="wheel__unit" aria-hidden="true">
        {unit}
      </span>
    </div>
  )
}
