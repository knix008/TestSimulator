import { useEffect, useId, useRef, useState, type ReactNode } from 'react'

export type DropdownOption<T extends string> = {
  value: T
  label: string
  icon?: ReactNode
}

type Props<T extends string> = {
  label: string
  icon?: ReactNode
  value: T
  options: DropdownOption<T>[]
  disabled?: boolean
  onChange: (value: T) => void
}

export function ToolbarDropdown<T extends string>({
  label,
  icon,
  value,
  options,
  disabled,
  onChange,
}: Props<T>) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const menuId = useId()
  const selected = options.find((o) => o.value === value)

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
        {icon ? <span className="icon">{icon}</span> : null}
        <span className="tb-dropdown-text">
          <span className="tb-dropdown-label">{label}</span>
          <span className="tb-dropdown-value">{selected?.label ?? ''}</span>
        </span>
        <span className="tb-caret" aria-hidden>
          ▾
        </span>
      </button>

      {open && !disabled ? (
        <ul className="tb-menu" id={menuId} role="listbox">
          {options.map((opt) => (
            <li key={opt.value} role="option" aria-selected={opt.value === value}>
              <button
                type="button"
                className={`tb-menu-item ${opt.value === value ? 'selected' : ''}`}
                onClick={() => {
                  onChange(opt.value)
                  setOpen(false)
                }}
              >
                {opt.icon ? <span className="icon">{opt.icon}</span> : null}
                <span>{opt.label}</span>
                {opt.value === value ? <span className="tb-check">✓</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
