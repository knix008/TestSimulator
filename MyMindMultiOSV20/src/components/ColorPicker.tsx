import { useEffect, useId, useRef, useState } from 'react'
import { NODE_COLORS } from '../constants/colors'
import { IconColor } from './Icons'

type Props = {
  label: string
  value: string
  disabled?: boolean
  onChange: (color: string) => void
}

export function ColorPicker({ label, value, disabled, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const menuId = useId()

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className={`tb-dropdown ${open ? 'open' : ''} ${disabled ? 'disabled' : ''}`} ref={rootRef}>
      <button
        type="button"
        className={`tb-btn tb-dropdown-trigger ${open ? 'active' : ''}`}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="icon"><IconColor /></span>
        <span className="tb-dropdown-text">
          <span className="tb-dropdown-label">{label}</span>
          <span className="tb-dropdown-value" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span className="color-swatch" style={{ background: value }} />
          </span>
        </span>
        <span className="tb-caret" aria-hidden>
          ▾
        </span>
      </button>

      {open && !disabled ? (
        <div className="tb-menu color-menu" id={menuId} role="listbox">
          <div className="color-grid">
            {NODE_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                className={`color-chip ${color.toLowerCase() === value.toLowerCase() ? 'selected' : ''}`}
                style={{ background: color }}
                title={color}
                aria-label={color}
                onClick={() => {
                  onChange(color)
                  setOpen(false)
                }}
              />
            ))}
          </div>
          <label className="color-custom">
            <span>{label}</span>
            <input
              type="color"
              value={value.startsWith('#') && value.length === 7 ? value : '#3b82f6'}
              onChange={(e) => onChange(e.target.value)}
            />
          </label>
        </div>
      ) : null}
    </div>
  )
}
