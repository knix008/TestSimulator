/**
 * A collapsible dock panel (left / right / bottom). Open: a header with its
 * title, extra buttons and a collapse chevron, a resize splitter on the inner
 * edge. Collapsed: a thin rail with an expand chevron and the title.
 */
import { useRef, type ReactNode } from 'react'

export type Side = 'left' | 'right' | 'bottom'

export function DockPanel({
  side,
  title,
  icon,
  collapsed,
  onToggle,
  size,
  minSize,
  maxSize,
  onResize,
  actions,
  collapseTip,
  expandTip,
  children,
  onContextMenu,
  toggleIcon,
}: {
  side: Side
  title: string
  icon: ReactNode
  collapsed: boolean
  onToggle: () => void
  size: number
  minSize: number
  maxSize: number
  onResize: (size: number, done: boolean) => void
  actions?: ReactNode
  collapseTip: string
  expandTip: string
  children: ReactNode
  onContextMenu?: (e: React.MouseEvent) => void
  /** Same icon as the toolbar's toggle for this panel. */
  toggleIcon: ReactNode
}) {
  const dragging = useRef<{ start: number; size: number } | null>(null)

  if (collapsed) {
    return (
      <div className={`dock-rail dock-rail-${side}`} data-dock={side} data-collapsed="1">
        <button type="button" className="toolbar-btn icon-only dock-toggle" title={expandTip} aria-label={expandTip} data-dock-toggle={side} onClick={onToggle}>
          <span className="toolbar-icon" aria-hidden="true">
            {toggleIcon}
          </span>
        </button>
        <button type="button" className="dock-rail-label" onClick={onToggle} title={expandTip}>
          <span className="dock-rail-icon" aria-hidden="true">
            {icon}
          </span>
          <span>{title}</span>
        </button>
      </div>
    )
  }

  const begin = (e: React.PointerEvent) => {
    e.preventDefault()
    const el = e.currentTarget as HTMLElement
    el.setPointerCapture(e.pointerId)
    dragging.current = { start: side === 'bottom' ? e.clientY : e.clientX, size }
    document.body.classList.add(side === 'bottom' ? 'resizing-row' : 'resizing-col')
  }
  const move = (e: React.PointerEvent) => {
    const d = dragging.current
    if (!d) return
    const pos = side === 'bottom' ? e.clientY : e.clientX
    const delta = side === 'left' ? pos - d.start : d.start - pos
    onResize(Math.max(minSize, Math.min(maxSize, d.size + delta)), false)
  }
  const end = (e: React.PointerEvent) => {
    if (!dragging.current) return
    dragging.current = null
    document.body.classList.remove('resizing-row', 'resizing-col')
    ;(e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId)
    onResize(size, true)
  }

  const style = side === 'bottom' ? { height: size } : { width: size }
  return (
    <section className={`dock dock-${side}`} style={style} data-dock={side} aria-label={title} onContextMenu={onContextMenu}>
      <div
        className={`dock-splitter dock-splitter-${side}`}
        role="separator"
        aria-orientation={side === 'bottom' ? 'horizontal' : 'vertical'}
        onPointerDown={begin}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
      />
      <header className="dock-head">
        <span className="dock-icon" aria-hidden="true">
          {icon}
        </span>
        <h2 className="dock-title">{title}</h2>
        <span className="dock-grow" />
        {actions}
        <button type="button" className="toolbar-btn icon-only dock-toggle active" title={collapseTip} aria-label={collapseTip} data-dock-toggle={side} onClick={onToggle}>
          <span className="toolbar-icon" aria-hidden="true">
            {toggleIcon}
          </span>
        </button>
      </header>
      <div className="dock-body">{children}</div>
    </section>
  )
}

export type DockState = {
  left: boolean
  right: boolean
  bottom: boolean
  leftSize: number
  rightSize: number
  bottomSize: number
}

const KEY = 'isomaker.dock'
export const DOCK_DEFAULTS: DockState = { left: false, right: false, bottom: false, leftSize: 280, rightSize: 300, bottomSize: 170 }

export function loadDock(): DockState {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}') || {}
    const n = (v: unknown, d: number, lo: number, hi: number) => {
      const x = Number(v)
      return Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d
    }
    return {
      left: raw.left === true,
      right: raw.right === true,
      bottom: raw.bottom === true,
      leftSize: n(raw.leftSize, DOCK_DEFAULTS.leftSize, 200, 520),
      rightSize: n(raw.rightSize, DOCK_DEFAULTS.rightSize, 220, 520),
      bottomSize: n(raw.bottomSize, DOCK_DEFAULTS.bottomSize, 90, 420),
    }
  } catch {
    return { ...DOCK_DEFAULTS }
  }
}

export function saveDock(s: DockState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* no storage */
  }
}
