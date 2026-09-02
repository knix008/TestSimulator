import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

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
  /** Fired when the menu is opened (e.g. to lazily load options). */
  onOpen?: () => void
}

export function ToolbarDropdown<T extends string>({
  label,
  icon,
  value,
  options,
  disabled,
  onChange,
  onOpen,
}: Props<T>) {
  const [open, setOpen] = useState(false)
  // Fixed-position anchor for the menu so it escapes clipping containers
  // (e.g. the toolbar's `overflow: hidden`).
  const [pos, setPos] = useState<{ top: number; left: number; minWidth: number } | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLUListElement>(null)
  const menuId = useId()
  const selected = options.find((o) => o.value === value)

  const openMenu = () => {
    const rect = triggerRef.current?.getBoundingClientRect()
    if (rect) setPos({ top: rect.bottom + 6, left: rect.left, minWidth: rect.width })
    onOpen?.()
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    // The fixed menu would detach from the trigger on scroll/resize, so close it.
    const onReflow = () => setOpen(false)
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', onReflow)
    window.addEventListener('scroll', onReflow, true)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onReflow)
      window.removeEventListener('scroll', onReflow, true)
    }
  }, [open])

  return (
    <div className={`tb-dropdown ${open ? 'open' : ''} ${disabled ? 'disabled' : ''}`} ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={`tb-btn tb-dropdown-trigger ${open ? 'active' : ''}`}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => (open ? setOpen(false) : openMenu())}
      >
        {selected?.icon ?? icon ? <span className="icon">{selected?.icon ?? icon}</span> : null}
        <span className="tb-dropdown-text">
          <span className="tb-dropdown-label">{label}</span>
          <span className="tb-dropdown-value">{selected?.label ?? ''}</span>
        </span>
        <span className="tb-caret" aria-hidden>
          ▾
        </span>
      </button>

      {open && !disabled && pos
        ? createPortal(
            <ul
              ref={menuRef}
              className="tb-menu tb-menu-floating"
              id={menuId}
              role="listbox"
              style={{ position: 'fixed', top: pos.top, left: pos.left, minWidth: pos.minWidth }}
            >
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
            </ul>,
            document.body,
          )
        : null}
    </div>
  )
}
