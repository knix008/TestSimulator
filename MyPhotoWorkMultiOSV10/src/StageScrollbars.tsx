import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { panForStart, scrollAxis } from './lib/scrollAxis'

/** Scrollbars for the canvas stage; the arithmetic is in lib/scrollAxis.ts. */
type Props = {
  /** The picture's size on screen (document size × zoom). */
  contentWidth: number
  contentHeight: number
  pan: { x: number; y: number }
  onPan: (next: { x: number; y: number }) => void
  label: { horizontal: string; vertical: string }
}

export function StageScrollbars({ contentWidth, contentHeight, pan, onPan, label }: Props) {
  const host = useRef<HTMLDivElement | null>(null)
  const [view, setView] = useState({ width: 0, height: 0 })
  useEffect(() => {
    const stage = host.current?.parentElement
    if (!stage) return undefined
    const measure = () => setView({ width: stage.clientWidth, height: stage.clientHeight })
    measure()
    if (typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(measure)
    observer.observe(stage)
    return () => observer.disconnect()
  }, [])

  const axis = (name: 'x' | 'y') => {
    const horizontal = name === 'x'
    const viewSize = horizontal ? view.width : view.height
    const content = horizontal ? contentWidth : contentHeight
    const model = scrollAxis(viewSize, content, horizontal ? pan.x : pan.y)
    const set = (value: number) => onPan(horizontal ? { x: value, y: pan.y } : { x: pan.x, y: value })

    const dragThumb = (event: ReactPointerEvent<HTMLDivElement>) => {
      event.preventDefault()
      event.stopPropagation()
      const track = (event.currentTarget.parentElement as HTMLElement).getBoundingClientRect()
      const length = horizontal ? track.width : track.height
      const from = horizontal ? event.clientX : event.clientY
      const startAt = model.start
      const move = (ev: PointerEvent) => {
        const delta = ((horizontal ? ev.clientX : ev.clientY) - from) / Math.max(1, length)
        set(panForStart(viewSize, content, startAt + delta))
      }
      const up = () => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
    }
    // A press on the track moves a page towards the pointer.
    const pageTrack = (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.target !== event.currentTarget) return
      event.preventDefault()
      const track = event.currentTarget.getBoundingClientRect()
      const at = horizontal ? (event.clientX - track.left) / track.width : (event.clientY - track.top) / track.height
      const page = viewSize * 0.9
      const current = horizontal ? pan.x : pan.y
      set(Math.min(model.max, Math.max(model.min, at < model.start ? current + page : current - page)))
    }
    return (
      <div
        className={`stage-scroll stage-scroll-${horizontal ? 'h' : 'v'}`}
        role="scrollbar"
        aria-orientation={horizontal ? 'horizontal' : 'vertical'}
        aria-label={horizontal ? label.horizontal : label.vertical}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round((model.start / Math.max(0.0001, 1 - model.size)) * 100) || 0}
        onPointerDown={pageTrack}
      >
        <div
          className="stage-scroll-thumb"
          style={horizontal
            ? { left: `${model.start * 100}%`, width: `${model.size * 100}%` }
            : { top: `${model.start * 100}%`, height: `${model.size * 100}%` }}
          onPointerDown={dragThumb}
        />
      </div>
    )
  }

  return (
    <div ref={host} className="stage-scrollbars">
      {view.width > 0 && axis('x')}
      {view.height > 0 && axis('y')}
    </div>
  )
}
