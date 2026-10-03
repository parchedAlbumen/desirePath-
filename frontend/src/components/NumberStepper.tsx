import { ChevronDown, ChevronUp } from 'lucide-react'

interface NumberStepperProps {
  id: string
  label: string
  hint: string
  value: string
  onChange: (value: string) => void
  step?: number
  unit?: string
  invalid?: boolean
  /** Allow one decimal place (e.g. 5.5 km). Whole numbers only otherwise. */
  decimal?: boolean
}

/** Keep only what the field accepts: "12.34" → "12.3" when decimal, "1234" otherwise. */
function sanitize(raw: string, decimal: boolean): string {
  if (!decimal) return raw.replace(/\D/g, '').slice(0, 4)
  return raw.replace(/[^\d.]/g, '').match(/^\d{0,3}(\.\d?)?/)?.[0] ?? ''
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
}: NumberStepperProps) {
  // Round to one decimal so repeated 0.5 steps don't drift (0.1 + 0.2 !== 0.3).
  const bump = (delta: number) => onChange(String(Math.max(0, Math.round(((parseFloat(value) || 0) + delta) * 10) / 10)))

  return (
    <div className="field">
      <div className={`stepper${invalid ? ' is-invalid' : ''}`}>
        <label htmlFor={id}>{label}</label>
        <input
          id={id}
          inputMode={decimal ? 'decimal' : 'numeric'}
          autoComplete="off"
          value={value}
          aria-describedby={`${id}-hint`}
          aria-invalid={invalid || undefined}
          onChange={(e) => onChange(sanitize(e.target.value, decimal))}
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
      <p className="field__hint" id={`${id}-hint`}>
        {hint}
      </p>
    </div>
  )
}
