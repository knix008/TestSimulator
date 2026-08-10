import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'

type Offset = { x: number; y: number }

type DragState = {
  pointerId: number
  startX: number
  startY: number
  originX: number
  originY: number
}

export function useDialogDrag(open: boolean) {
  const [offset, setOffset] = useState<Offset>({ x: 0, y: 0 })
  const offsetRef = useRef(offset)
  const dragRef = useRef<DragState | null>(null)

  offsetRef.current = offset

  // Reset before paint so reopening always starts at the flex-centered origin.
  useLayoutEffect(() => {
    setOffset({ x: 0, y: 0 })
    offsetRef.current = { x: 0, y: 0 }
    dragRef.current = null
  }, [open])

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      const drag = dragRef.current
      if (!drag || event.pointerId !== drag.pointerId) {
        return
      }

      setOffset({
        x: drag.originX + event.clientX - drag.startX,
        y: drag.originY + event.clientY - drag.startY,
      })
    }

    const endDrag = (event: PointerEvent) => {
      const drag = dragRef.current
      if (!drag || event.pointerId !== drag.pointerId) {
        return
      }

      dragRef.current = null
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', endDrag)
    window.addEventListener('pointercancel', endDrag)

    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', endDrag)
      window.removeEventListener('pointercancel', endDrag)
    }
  }, [])

  const onHeaderPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) {
      return
    }

    const target = event.target as HTMLElement
    if (target.closest('button, input, select, textarea, a, label')) {
      return
    }

    event.preventDefault()
    event.stopPropagation()

    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: offsetRef.current.x,
      originY: offsetRef.current.y,
    }
  }

  return {
    style: {
      transform: `translate(${offset.x}px, ${offset.y}px)`,
    } as CSSProperties,
    onHeaderPointerDown,
  }
}
