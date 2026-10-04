import { ChevronDown, ChevronUp } from 'lucide-react'

interface NumberStepperProps {
  id: string
  label: string
  /** Optional helper text under the field. */
  hint?: string
  value: string
  onChange: (value: string) => void
  step?: number
  unit?: string
  invalid?: boolean
  /** Allow one decimal place (e.g. 5.5 km). Whole numbers only otherwise. */
  decimal?: boolean
  /** Allow values below zero (for elevation relative to a route's start). */
  allowNegative?: boolean
}

/** Keep only what the field accepts: "12.34" → "12.3" when decimal, "1234" otherwise. */
function sanitize(raw: string, decimal: boolean, allowNegative: boolean): string {
  if (!decimal) {
    const digits = raw.replace(/\D/g, '').slice(0, 4)
    return allowNegative && raw.trimStart().startsWith('-') ? `-${digits}` : digits
  }
  const value = raw.replace(/[^\d.-]/g, '')
  const negative = allowNegative && value.startsWith('-')
  const number = value.replace(/-/g, '').match(/^\d{0,4}(\.\d?)?/)?.[0] ?? ''
  return `${negative ? '-' : ''}${number}`
}

/** Labelled numeric field with up/down buttons, as in the elevation section of the planner. */
export function NumberStepper({
  id,
  label,
  hint,
  value,
  onChange,
  step = 5,
  unit = 'm',
  invalid,
  decimal = false,
  allowNegative = false,
}: NumberStepperProps) {
  // Round to one decimal so repeated 0.5 steps don't drift (0.1 + 0.2 !== 0.3).
  const bump = (delta: number) => {
    const next = Math.round(((parseFloat(value) || 0) + delta) * 10) / 10
    onChange(String(allowNegative ? next : Math.max(0, next)))
  }

  return (
    <div className="field">
      <div className={`stepper${invalid ? ' is-invalid' : ''}`}>
        <label htmlFor={id}>{label}</label>
        <input
          id={id}
          inputMode={decimal ? 'decimal' : 'numeric'}
          autoComplete="off"
          value={value}
          aria-describedby={hint ? `${id}-hint` : undefined}
          aria-invalid={invalid || undefined}
          onChange={(e) => onChange(sanitize(e.target.value, decimal, allowNegative))}
        />
        <span className="stepper__unit">{unit}</span>
        <div className="stepper__buttons">
          <button type="button" aria-label={`Increase ${label}`} onClick={() => bump(step)}>
            <ChevronUp />
          </button>
          <button type="button" aria-label={`Decrease ${label}`} onClick={() => bump(-step)}>
            <ChevronDown />
          </button>
        </div>
      </div>
      {hint && (
        <p className="field__hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
    </div>
  )
}
