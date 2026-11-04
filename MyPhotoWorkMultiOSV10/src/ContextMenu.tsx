import { Fragment, useLayoutEffect, useRef, useState } from 'react'
import { findCommand } from './commands'
import { contextRows, placeContextMenu, type ContextKind } from './contextRows'

/** The right-click menu: rows from contextMenu.ts, kept inside the window once it has been measured. */
export function ContextMenu({ x, y, kind, hasSelection, label, isDisabled, isActive, onChoose }: {
  x: number
  y: number
  kind: ContextKind
  hasSelection: boolean
  label: (id: string) => string
  isDisabled: (id: string) => boolean
  isActive: (id: string) => boolean
  onChoose: (id: string) => void
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [place, setPlace] = useState({ left: x, top: y })
  useLayoutEffect(() => {
    const box = ref.current?.getBoundingClientRect()
    if (box) setPlace(placeContextMenu(x, y, box.width, box.height, { width: window.innerWidth, height: window.innerHeight }))
  }, [x, y, kind, hasSelection])
  return (
    <div ref={ref} className="context-menu" role="menu" data-kind={kind} style={place} onPointerDown={(event) => event.stopPropagation()} onContextMenu={(event) => event.preventDefault()}>
      {contextRows(kind, hasSelection).map((id, index) => {
        if (id === null) return <div key={`separator-${index}`} className="context-separator" role="separator" />
        const command = findCommand(id)
        if (!command) return null
        const Icon = command.icon
        return (
          <Fragment key={id}>
            <button role="menuitem" data-command={id} className={isActive(id) ? 'active' : ''} disabled={isDisabled(id)} onClick={() => onChoose(id)}>
              <Icon size={15} />
              <span>{label(id)}</span>
              {command.accel && <kbd>{command.accel}</kbd>}
            </button>
          </Fragment>
        )
      })}
    </div>
  )
}
