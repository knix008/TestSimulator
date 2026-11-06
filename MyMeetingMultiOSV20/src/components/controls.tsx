// Shared inputs: the icon drop-down (native <select> cannot show icons), the −/+ number
// stepper, colour field and on/off switch.
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { Icon } from './Icons'

const LIST_MAX_HEIGHT = 240

/** The list opens below its button, or above when the window has more room there. */
function listPlacement(button: HTMLElement, count: number): CSSProperties {
  const rect = button.getBoundingClientRect()
  // The window it is drawn in: a dialog may have its own.
  const innerHeight = button.ownerDocument.defaultView?.innerHeight ?? window.innerHeight
  const wanted = Math.min(LIST_MAX_HEIGHT, count * 30 + 10)
  const below = innerHeight - rect.bottom - 6
  const above = rect.top - 6
  const style: CSSProperties = { position: 'fixed', left: rect.left, minWidth: rect.width, width: 'max-content', maxWidth: Math.max(rect.width, 320), right: 'auto' }
  if (below >= wanted || below >= above) return { ...style, top: rect.bottom + 2, bottom: 'auto', maxHeight: Math.min(LIST_MAX_HEIGHT, below) }
  return { ...style, top: 'auto', bottom: innerHeight - rect.top + 2, maxHeight: Math.min(LIST_MAX_HEIGHT, above) }
}

export type SelectOption<T> = { value: T; label: string; icon?: string }

export function IconSelect<T extends string>({ value, options, onChange, title, id }: { value: T; options: SelectOption<T>[]; onChange: (value: T) => void; title?: string; id?: string }) {
  const [open, setOpen] = useState(false)
  const host = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open) return undefined
    const close = (event: Event) => {
      if (!host.current?.contains(event.target as Node)) setOpen(false)
    }
    const closeNow = () => setOpen(false)
    const win = host.current?.ownerDocument.defaultView ?? window
    win.addEventListener('pointerdown', close, true)
    // Its place was worked out from the button, so it cannot follow a scrolling panel. Only a scroll
    // that moved the button counts: panels also report one when their content changes height.
    const at = button.current?.getBoundingClientRect()
    const moved = (event: Event) => {
      const now = button.current?.getBoundingClientRect()
      if (!host.current?.contains(event.target as Node) && (!now || !at || now.top !== at.top || now.left !== at.left)) setOpen(false)
    }
    win.addEventListener('scroll', moved, true)
    win.addEventListener('resize', closeNow)
    return () => {
      win.removeEventListener('pointerdown', close, true)
      win.removeEventListener('scroll', moved, true)
      win.removeEventListener('resize', closeNow)
    }
  }, [open])
  const selected = options.find((option) => option.value === value)
  return (
    <div className="icon-select" ref={host} data-select={id}>
      <button type="button" ref={button} className="icon-select-button" title={title} aria-expanded={open} onClick={() => setOpen((state) => !state)}>
        <Icon name={selected?.icon ?? 'caretRight'} />
        <span className="icon-select-text">{selected?.label ?? String(value ?? '')}</span>
        <Icon name="caret" size={12} />
      </button>
      {open && button.current && (
        <div className="menu-pop icon-select-list" role="listbox" style={listPlacement(button.current, options.length)}>
          {options.map((option) => (
            <button
              type="button"
              key={String(option.value)}
              role="option"
              aria-selected={option.value === value}
              data-value={String(option.value)}
              className={option.value === value ? 'selected' : undefined}
              onClick={() => {
                setOpen(false)
                onChange(option.value)
              }}
            >
              <Icon name={option.icon ?? 'caretRight'} />
              <span className="menu-label">{option.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** A text box exactly as wide as what it holds, so the value and its unit centre together. */
const fitWidth = (text: unknown) => ({ width: `${Math.max(1, String(text ?? '').length) + 1}ch` })

/** − [value unit] +, the value and its unit centred. */
export function Stepper({ value, onChange, min, max, step = 1, id, unit, disabled, labels }: { value: number; onChange: (value: number) => void; min?: number; max?: number; step?: number; id?: string; unit?: string; disabled?: boolean; labels?: { minus: string; plus: string } }) {
  const clamp = (number: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, number))
  const [typing, setTyping] = useState<string | null>(null)
  const nudge = (direction: number) => {
    setTyping(null)
    onChange(clamp(value + direction * step))
  }
  const shown = typing ?? value
  return (
    <div className="stepper" data-field={id}>
      <button type="button" tabIndex={-1} aria-label={labels?.minus ?? '-'} disabled={disabled} onClick={() => nudge(-1)}>−</button>
      <span className="stepper-value">
        <input
          value={shown}
          disabled={disabled}
          inputMode="numeric"
          style={fitWidth(shown)}
          onChange={(event) => {
            const text = event.target.value.trim()
            setTyping(text)
            const number = Number.parseInt(text, 10)
            if (Number.isFinite(number) && number === clamp(number)) onChange(number)
          }}
          onBlur={() => {
            const number = Number.parseInt(typing ?? '', 10)
            if (typing !== null && Number.isFinite(number) && number !== clamp(number)) onChange(clamp(number))
            setTyping(null)
          }}
        />
        {unit && <span className="stepper-unit" data-unit="">{unit}</span>}
      </span>
      <button type="button" tabIndex={-1} aria-label={labels?.plus ?? '+'} disabled={disabled} onClick={() => nudge(1)}>+</button>
    </div>
  )
}

export function ColorField({ value, onChange, id }: { value: string; onChange: (value: string) => void; id?: string }) {
  return (
    <div className="color-field" data-field={id}>
      <label className="swatch" style={{ background: value }}>
        <input type="color" value={value} onChange={(event) => onChange(event.target.value)} />
      </label>
      <input
        className="color-text"
        key={value}
        defaultValue={value}
        onChange={(event) => {
          const text = event.target.value.trim()
          if (/^#[0-9a-fA-F]{6}$/.test(text)) onChange(text.toLowerCase())
        }}
      />
    </div>
  )
}

export function Toggle({ checked, onChange, id, label }: { checked: boolean; onChange: (value: boolean) => void; id?: string; label?: string }) {
  return (
    <button type="button" role="switch" data-field={id} aria-label={label} aria-checked={!!checked} className={checked ? 'toggle on' : 'toggle'} onClick={() => onChange(!checked)}>
      <i />
    </button>
  )
}

/** The resize marker of every corner: dots in a triangle. */
export function GripDots() {
  return (
    <svg viewBox="0 0 12 12" data-grip="">
      {[[10, 2], [6, 6], [10, 6], [2, 10], [6, 10], [10, 10]].map(([x, y]) => <circle key={`${x},${y}`} cx={x} cy={y} r="1.15" />)}
    </svg>
  )
}

/** [−] [slider bar] [value, centred] [+]. */
export function RangeStepper({ name, label, value, min, max, step, suffix, onChange }: { name: string; label: string; value: number; min: number; max: number; step: number; suffix?: string; onChange: (value: number) => void }) {
  const clamp = (next: number) => Math.max(min, Math.min(max, Math.round(next / step) * step))
  const [draft, setDraft] = useState(String(value))
  useEffect(() => setDraft(String(value)), [value])
  const bar = useRef<HTMLDivElement>(null)
  const fraction = Math.max(0, Math.min(1, (value - min) / (max - min || 1)))
  const fromPointer = (clientX: number) => {
    const rect = bar.current!.getBoundingClientRect()
    return clamp(min + ((clientX - rect.left) / (rect.width || 1)) * (max - min))
  }
  const beginDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.focus()
    let last = fromPointer(event.clientX)
    if (last !== value) onChange(last)
    const move = (moved: PointerEvent) => {
      const next = fromPointer(moved.clientX)
      if (next !== last) {
        last = next
        onChange(next)
      }
    }
    // The settings window draws this too, and a dialog has a window of its own.
    const win = event.currentTarget.ownerDocument.defaultView ?? window
    const up = () => {
      win.removeEventListener('pointermove', move)
      win.removeEventListener('pointerup', up)
      win.removeEventListener('pointercancel', up)
    }
    win.addEventListener('pointermove', move)
    win.addEventListener('pointerup', up)
    win.addEventListener('pointercancel', up)
  }
  const onBarKey = (event: React.KeyboardEvent) => {
    const delta = event.key === 'ArrowRight' || event.key === 'ArrowUp' ? step : event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? -step : 0
    if (!delta) return
    event.preventDefault()
    onChange(clamp(value + delta))
  }
  const commit = () => {
    const parsed = Number(draft)
    if (draft.trim() !== '' && Number.isFinite(parsed)) {
      const next = clamp(parsed)
      setDraft(String(next))
      if (next !== value) onChange(next)
    } else {
      setDraft(String(value))
    }
  }
  return (
    <span className="range-stepper" data-range={name}>
      <button type="button" className="range-step" data-step={`${name}:down`} title={`${label} −`} aria-label={`${label} −`} disabled={value <= min} onClick={() => onChange(clamp(value - step))}>−</button>
      <div ref={bar} className="range-bar" data-range-bar={name} role="slider" tabIndex={0} aria-label={label} aria-valuemin={min} aria-valuemax={max} aria-valuenow={value} title={`${label}: ${value}${suffix ?? ''}`} onPointerDown={beginDrag} onKeyDown={onBarKey}>
        <span className="range-fill" style={{ width: `${fraction * 100}%` }} />
        <span className="range-thumb" style={{ left: `${fraction * 100}%` }} />
      </div>
      <span className="range-value">
        <input type="number" data-field={name} min={min} max={max} step={step} value={draft} aria-label={label} onChange={(event) => setDraft(event.target.value)} onBlur={commit} onKeyDown={(event) => event.key === 'Enter' && commit()} />
        {suffix && <span className="range-suffix">{suffix}</span>}
      </span>
      <button type="button" className="range-step" data-step={`${name}:up`} title={`${label} +`} aria-label={`${label} +`} disabled={value >= max} onClick={() => onChange(clamp(value + step))}>+</button>
    </span>
  )
}
