import { useEffect, useRef, useState } from 'react'
import { Minus, Plus } from 'lucide-react'
import { beginAdjust, endAdjust } from './adjusting'
import { t } from './i18n'
import { formatUnitNumber, numberLength, parseUnitNumber, stepUnitNumber } from './lib/numberFormat'
import type { Language } from './lib/types'

/*
 * The numeric controls, and the one fact the rest of the editor needs about
 * them: whether the user is in the middle of an adjustment.
 *
 * `<input type="range">` fires a change for every pixel of a drag. The values
 * themselves are cheap to keep up with — the thumb and the number beside it
 * must move with the mouse, or the control feels broken — but redrawing a
 * preview of the whole picture on each of them is not: the drag then runs at
 * the speed of the filter, and every frame of that work is thrown away by the
 * next one. Only the value the user stops on matters.
 *
 * So the value stays live and the expensive reaction waits: a slider reports a
 * drag through `adjusting.ts`, and `useLivePreview` redraws once, at the end. A
 * typed number is the same story — "120" would otherwise redraw at 1, then 12,
 * then 120 — so it commits on Enter or when the field is left.
 */

type SliderProps = {
  value: number
  min: number
  max: number
  step?: number
  disabled?: boolean
  className?: string
  title?: string
  'aria-label'?: string
  'data-tooltip'?: string
  onChange: (next: number) => void
}

export function Slider({ value, min, max, step, disabled, className, title, onChange, ...rest }: SliderProps) {
  // One at a time: a second pointerdown without a release would leave the count
  // raised for good, and the preview would never come back.
  const held = useRef(false)

  const begin = () => {
    if (held.current) return
    held.current = true
    beginAdjust()
  }
  const end = () => {
    if (!held.current) return
    held.current = false
    endAdjust()
  }

  useEffect(() => {
    // A drag usually ends with the pointer off the track, and a release there
    // still ends it. The same listener covers a pointer lost to another window.
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
    return () => {
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
      // Unmounting mid-drag must not leave the count raised either.
      end()
    }
  }, [])

  return (
    <input
      {...rest}
      type="range"
      className={className}
      title={title}
      disabled={disabled}
      min={min}
      max={max}
      step={step}
      value={value}
      onPointerDown={begin}
      onKeyDown={begin}
      onKeyUp={end}
      onBlur={end}
      onChange={(event) => onChange(Number(event.target.value))}
    />
  )
}

type NumberStepperProps = {
  value: number
  min?: number
  max?: number
  step?: number
  /** Shown after the value: "px", "%", "°", "ms". A plain count has none. */
  unit?: string
  language: Language
  /** For a field that has no <label> around it. */
  label?: string
  disabled?: boolean
  'data-region'?: string
  onChange: (next: number) => void
}

/**
 * Every number in the app: a decrease button, the value and its unit centred, and an
 * increase button. The buttons and the arrow keys answer at once (Shift+arrow goes ten
 * steps). Typing is held back until Enter or until the field is left.
 */
export function NumberStepper({ value, min = -Infinity, max = Infinity, step = 1, unit, language, label, disabled, onChange, ...rest }: NumberStepperProps) {
  const [typed, setTyped] = useState<string | null>(null)
  const send = (next: number) => {
    setTyped(null)
    const clamped = Math.min(max, Math.max(min, next))
    if (clamped !== value) onChange(clamped)
  }
  const nudge = (count: number) => send(stepUnitNumber(typed === null ? value : parseUnitNumber(typed, unit) ?? value, count, step, min, max))
  const commit = () => {
    if (typed === null) return
    const next = parseUnitNumber(typed, unit)
    if (next === null) setTyped(null)
    else send(next)
  }
  const named = (key: string) => (label ? `${label} ${t(language, key)}` : t(language, key))
  return (
    <span className="number-stepper">
      <button type="button" data-tooltip={t(language, 'decrease')} aria-label={named('decrease')} disabled={disabled || value <= min} onClick={() => nudge(-1)}>
        <Minus size={14} />
      </button>
      <input
        {...rest}
        type="text"
        inputMode="decimal"
        spellCheck={false}
        disabled={disabled}
        aria-label={label}
        value={typed ?? formatUnitNumber(value, unit, step)}
        onChange={(event) => setTyped(event.target.value)}
        // Just the digits are selected, so typing replaces the number and the unit stays.
        onFocus={(event) => {
          const field = event.currentTarget
          requestAnimationFrame(() => field.setSelectionRange(0, numberLength(field.value)))
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            commit()
          } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            event.preventDefault()
            nudge((event.key === 'ArrowUp' ? 1 : -1) * (event.shiftKey ? 10 : 1))
          }
        }}
        onBlur={commit}
      />
      <button type="button" data-tooltip={t(language, 'increase')} aria-label={named('increase')} disabled={disabled || value >= max} onClick={() => nudge(1)}>
        <Plus size={14} />
      </button>
    </span>
  )
}
