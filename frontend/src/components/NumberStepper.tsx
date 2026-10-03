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
}

/** Labelled numeric field with up/down buttons, as in the elevation section of the planner. */
export function NumberStepper({ id, label, hint, value, onChange, step = 5, unit = 'm', invalid }: NumberStepperProps) {
  const bump = (delta: number) => onChange(String(Math.max(0, (parseInt(value, 10) || 0) + delta)))

  return (
    <div className="field">
      <div className={`stepper${invalid ? ' is-invalid' : ''}`}>
        <label htmlFor={id}>{label}</label>
        <input
          id={id}
          inputMode="numeric"
          autoComplete="off"
          value={value}
          aria-describedby={`${id}-hint`}
          aria-invalid={invalid || undefined}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 4))}
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
