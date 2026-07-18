import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react'

export type ContextMenuItem = {
  id: string
  label: string
  icon?: ReactNode
  disabled?: boolean
  danger?: boolean
  separator?: boolean
  onClick?: () => void
}

type ContextMenuProps = {
  open: boolean
  x: number
  y: number
  items: ContextMenuItem[]
  onClose: () => void
}

export function ContextMenu({ open, x, y, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!open || !ref.current) return
    const el = ref.current
    const rect = el.getBoundingClientRect()
    let left = x
    let top = y
    if (left + rect.width > window.innerWidth - 8) left = window.innerWidth - rect.width - 8
    if (top + rect.height > window.innerHeight - 8) top = window.innerHeight - rect.height - 8
    if (left < 8) left = 8
    if (top < 8) top = 8
    el.style.left = `${left}px`
    el.style.top = `${top}px`
  }, [open, x, y, items])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const onScroll = () => onClose()
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onDown)
    window.addEventListener('wheel', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('wheel', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      ref={ref}
      className="ctx-menu"
      role="menu"
      style={{ left: x, top: y }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item) =>
        item.separator ? (
          <div key={item.id} className="ctx-menu-sep" role="separator" />
        ) : (
          <button
            key={item.id}
            type="button"
            role="menuitem"
            className={['ctx-menu-item', item.danger ? 'danger' : ''].filter(Boolean).join(' ')}
            disabled={item.disabled}
            onClick={() => {
              if (item.disabled) return
              onClose()
              item.onClick?.()
            }}
          >
            <span className="ctx-menu-icon" aria-hidden="true">
              {item.icon}
            </span>
            <span className="ctx-menu-label">{item.label}</span>
          </button>
        ),
      )}
    </div>
  )
}
