import { useEffect, useRef, useState } from 'react'
import { beginAdjust, endAdjust } from './adjusting'

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

type NumberFieldProps = {
  value: number
  min?: number
  max?: number
  step?: number
  disabled?: boolean
  className?: string
  'aria-label'?: string
  onChange: (next: number) => void
}

export function NumberField({ value, min, max, step, disabled, className, onChange, ...rest }: NumberFieldProps) {
  const [typed, setTyped] = useState<string | null>(null)

  const commit = () => {
    if (typed === null) return
    const next = Number(typed)
    setTyped(null)
    if (!Number.isFinite(next)) return
    const clamped = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, next))
    if (clamped !== value) onChange(clamped)
  }

  return (
    <input
      {...rest}
      type="number"
      className={className}
      disabled={disabled}
      min={min}
      max={max}
      step={step}
      value={typed ?? value}
      onChange={(event) => setTyped(event.target.value)}
      onKeyDown={(event) => {
        if (event.key !== 'Enter') return
        event.preventDefault()
        commit()
      }}
      onBlur={commit}
    />
  )
}
