import type { ReactNode } from 'react'
import { Minus, Plus } from 'lucide-react'

/** A labelled row: the label on the left, the control on the right. */
export function Field({ label, children, hint, wide }: { label: string; children: ReactNode; hint?: string; wide?: boolean }) {
  return (
    <label className={wide ? 'field field-wide' : 'field'}>
      <span className="field-label">{label}</span>
      <span className="field-control">{children}</span>
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  )
}

export function Check({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  )
}

export function Select<T extends string>({ value, options, onChange, disabled, ariaLabel }: { value: T; options: { value: T; label: string; disabled?: boolean }[]; onChange: (value: T) => void; disabled?: boolean; ariaLabel?: string }) {
  return (
    <select value={value} disabled={disabled} aria-label={ariaLabel} onChange={(event) => onChange(event.target.value as T)}>
      {options.map((option) => (
        <option key={option.value} value={option.value} disabled={option.disabled}>{option.label}</option>
      ))}
    </select>
  )
}

/** A select whose options are grouped under <optgroup> headings. */
export function GroupedSelect<T extends string>({ value, groups, onChange, disabled, ariaLabel }: { value: T; groups: { label: string; options: { value: T; label: string; disabled?: boolean }[] }[]; onChange: (value: T) => void; disabled?: boolean; ariaLabel?: string }) {
  return (
    <select value={value} disabled={disabled} aria-label={ariaLabel} onChange={(event) => onChange(event.target.value as T)}>
      {groups.map((group) => (
        <optgroup key={group.label} label={group.label}>
          {group.options.map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>{option.label}</option>
          ))}
        </optgroup>
      ))}
    </select>
  )
}

/** A number field with a step button either side, so a value can be nudged without aiming at hairline spinners. */
export function NumberField({ value, min, max, step = 1, onChange, suffix, ariaLabel }: { value: number; min: number; max: number; step?: number; onChange: (value: number) => void; suffix?: string; ariaLabel?: string }) {
  const clamp = (next: number) => Math.min(max, Math.max(min, Number.isFinite(next) ? next : min))
  return (
    <span className="number-field">
      <button type="button" aria-label="-" onClick={() => onChange(clamp(Math.round((value - step) / step) * step))}><Minus size={12} /></button>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        aria-label={ariaLabel}
        onChange={(event) => onChange(clamp(Number(event.target.value)))}
      />
      <button type="button" aria-label="+" onClick={() => onChange(clamp(Math.round((value + step) / step) * step))}><Plus size={12} /></button>
      {suffix && <span className="number-suffix">{suffix}</span>}
    </span>
  )
}

export function Slider({ value, min, max, step = 1, onChange, suffix = '', ariaLabel, width }: { value: number; min: number; max: number; step?: number; onChange: (value: number) => void; suffix?: string; ariaLabel?: string; width?: number }) {
  return (
    <span className="slider" style={width ? { width } : undefined}>
      <input type="range" min={min} max={max} step={step} value={value} aria-label={ariaLabel} onChange={(event) => onChange(Number(event.target.value))} />
      <output>{value}{suffix}</output>
    </span>
  )
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string; icon?: ReactNode; tooltip?: string }[]; onChange: (value: T) => void }) {
  return (
    <span className="segmented" role="radiogroup">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          className={option.value === value ? 'active' : ''}
          data-tooltip={option.tooltip}
          onClick={() => onChange(option.value)}
        >
          {option.icon}
          {option.label && <span>{option.label}</span>}
        </button>
      ))}
    </span>
  )
}
