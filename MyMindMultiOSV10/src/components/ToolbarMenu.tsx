import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export type MenuAction = {
  icon?: ReactNode
  label: string
  onClick: () => void
  disabled?: boolean
}

type Props = {
  label: string
  icon?: ReactNode
  items: MenuAction[]
  title?: string
}

/** A toolbar button that opens a dropdown of action items (icon + label). */
export function ToolbarMenu({ label, icon, items, title }: Props) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number; minWidth: number } | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLUListElement>(null)
  const menuId = useId()

  const openMenu = () => {
    const rect = triggerRef.current?.getBoundingClientRect()
    if (rect) setPos({ top: rect.bottom + 6, left: rect.left, minWidth: rect.width })
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
    <div className={`tb-dropdown ${open ? 'open' : ''}`} ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={`tb-btn ${open ? 'active' : ''}`}
        title={title ?? label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => (open ? setOpen(false) : openMenu())}
      >
        {icon ? <span className="icon">{icon}</span> : null}
        {label}
        <span className="tb-caret" aria-hidden>
          ▾
        </span>
      </button>

      {open && pos
        ? createPortal(
            <ul
              ref={menuRef}
              className="tb-menu tb-menu-floating"
              id={menuId}
              role="menu"
              style={{ position: 'fixed', top: pos.top, left: pos.left, minWidth: pos.minWidth }}
            >
              {items.map((item) => (
                <li key={item.label} role="none">
                  <button
                    type="button"
                    role="menuitem"
                    className="tb-menu-item"
                    disabled={item.disabled}
                    onClick={() => {
                      setOpen(false)
                      item.onClick()
                    }}
                  >
                    {item.icon ? <span className="icon">{item.icon}</span> : null}
                    <span>{item.label}</span>
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
