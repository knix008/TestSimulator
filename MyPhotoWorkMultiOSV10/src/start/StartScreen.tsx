import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import {
  Aperture, BookOpen, Brush, ChartColumnBig, ChartSpline, CircleDot, Clapperboard, ClipboardList, Contrast, Dices, Eye, File, FilePlus, FolderOpen,
  Gauge, GalleryVertical, GraduationCap, Grid2x2, Grid3x3, GripVertical, Hexagon, History, Image as ImageIcon, Info, Keyboard, Layers, LayoutGrid, Lightbulb, Minus, MonitorPlay, Palette, Plus,
  Printer, RectangleHorizontal, Rainbow, Settings2, Smartphone, Sparkles, SquareDashed, Sun, Trash, X, Zap, type LucideIcon,
} from 'lucide-react'
import { t } from '../i18n'
import { AnimatedBackground, themeColors } from '../lib/startBackground'
import { COLS, GAP, ROW, autoArrange, cardsOf, compact, layoutKey, layoutValue, place, rowsFor, swapVertical, type Card } from '../lib/startLayout'
import { ANIMATION_KINDS, SHUFFLE_RANGE, SPEED_RANGE, TRANSPARENCY_RANGE, normalizeStartBackground, type AnimationKind, type StartBackground } from '../lib/startSettings'
import { SAMPLE_IMAGES, renderSample, type SampleImage } from '../lib/sampleImages'
import type { Language } from '../lib/types'
import buildInfo from '../build-info.json' with { type: 'json' }

const CARD_IDS = ['hero', 'create', 'recent', 'side', 'help', 'samples']
const DEFAULT_SPAN: Record<string, number> = { hero: 3, create: 2, recent: 1, side: 1, help: 2, samples: 3 }

const ANIMATION_ICONS: Record<AnimationKind, LucideIcon> = {
  bokeh: CircleDot, aperture: Aperture, filmStrip: Clapperboard, histogram: ChartColumnBig, toneCurve: ChartSpline, colorWheel: Palette,
  layerStack: Layers, halftone: Grid3x3, mosaic: Grid2x2, lightLeak: Sun, lensFlare: Sparkles, brushStrokes: Brush,
  rgbChannels: Contrast, filmGrain: Zap, contactSheet: GalleryVertical, marchingAnts: SquareDashed, gradientMesh: Rainbow, kaleidoscope: Hexagon,
}

/** New-document presets: [name key, width, height, icon]. */
const PRESET_GROUPS: { title: string; presets: [string, number, number, LucideIcon][] }[] = [
  { title: 'startGroupPhoto', presets: [['startPresetPhoto', 1600, 1067, ImageIcon], ['startPresetSquare', 1080, 1080, RectangleHorizontal], ['startPresetPortrait', 1080, 1350, Smartphone]] },
  { title: 'startGroupScreen', presets: [['startPresetHd', 1920, 1080, MonitorPlay], ['startPreset4k', 3840, 2160, MonitorPlay], ['startPresetIcon', 512, 512, Lightbulb]] },
  { title: 'startGroupPrint', presets: [['startPresetA4', 2480, 3508, Printer], ['startPresetA3', 3508, 4961, Printer], ['startPresetPostcard', 1748, 1240, ClipboardList]] },
]

export type StartAction = 'new' | 'open' | 'guide' | 'tutorial' | 'shortcuts' | 'settings' | 'about' | 'close'

type StartScreenProps = {
  language: Language
  theme: string
  background: StartBackground
  showOnLaunch: boolean
  recentFiles: string[]
  /** False in a browser, which cannot read a path it was not handed. */
  canOpenPaths: boolean
  onAction: (action: StartAction) => void
  onPreset: (width: number, height: number) => void
  onSample: (sample: SampleImage) => void
  onRecentOpen: (path: string) => void
  onRecentRemove: (path: string) => void
  onRecentClear: () => void
  onBackground: (background: StartBackground) => void
  onShowOnLaunch: (show: boolean) => void
}

const baseName = (path: string) => path.split(/[\\/]/).pop() ?? path

/** A slider with − and + on either side and the value to the right: what the settings use too. */
export function RangeStepper({ value, min, max, step, unit, label, onChange }: { value: number; min: number; max: number; step: number; unit?: string; label: string; onChange: (next: number) => void }) {
  const set = (next: number) => onChange(Math.max(min, Math.min(max, next)))
  return (
    <div className="range-stepper">
      <button type="button" aria-label={`${label} −`} disabled={value <= min} onClick={() => set(value - step)}><Minus size={13} /></button>
      <input type="range" aria-label={label} min={min} max={max} step={step} value={value} onChange={(event) => set(Number(event.target.value))} />
      <button type="button" aria-label={`${label} +`} disabled={value >= max} onClick={() => set(value + step)}><Plus size={13} /></button>
      <output>{value}{unit ?? ''}</output>
    </div>
  )
}

/** Every background as a toggle (icon and name), and Shuffle at the end. */
export function BackgroundKinds({ language, background, onChange }: { language: Language; background: StartBackground; onChange: (patch: Partial<StartBackground>) => void }) {
  const tr = (key: string) => t(language, key)
  const shuffling = background.shuffleSec > 0
  return (
    <div className="bg-kinds" role="radiogroup" aria-label={tr('startBackground')}>
      {ANIMATION_KINDS.map((kind) => {
        const Icon = ANIMATION_ICONS[kind]
        return (
          <button key={kind} type="button" role="radio" aria-checked={background.kind === kind} data-kind={kind} className={`bg-kind${background.kind === kind ? ' on' : ''}`} title={tr(`anim_${kind}_d`)} onClick={() => onChange({ kind })}>
            <Icon size={14} /><span>{tr(`anim_${kind}`)}</span>
          </button>
        )
      })}
      <button type="button" role="switch" aria-checked={shuffling} className={`bg-kind shuffle${shuffling ? ' on' : ''}`} title={tr('startShuffleTip')} onClick={() => onChange({ shuffleSec: shuffling ? 0 : 20 })}>
        <Dices size={14} /><span>{tr('startShuffle')}</span>
      </button>
    </div>
  )
}

/** Speed, transparency, shuffle interval and random start: the same rows on the card and in the settings. */
export function BackgroundControls({ language, background, onChange }: { language: Language; background: StartBackground; onChange: (patch: Partial<StartBackground>) => void }) {
  const tr = (key: string) => t(language, key)
  return (
    <>
      <div className="start-speed"><Gauge size={14} /><span>{tr('startSpeed')}</span></div>
      <RangeStepper value={background.speed} {...SPEED_RANGE} unit="%" label={tr('startSpeed')} onChange={(speed) => onChange({ speed })} />
      <div className="start-speed"><Eye size={14} /><span>{tr('startTransparency')}</span></div>
      <RangeStepper value={background.transparency} {...TRANSPARENCY_RANGE} unit="%" label={tr('startTransparency')} onChange={(transparency) => onChange({ transparency })} />
      <div className="start-speed"><Dices size={14} /><span>{tr('startShuffleEvery')}</span></div>
      <RangeStepper value={background.shuffleSec} {...SHUFFLE_RANGE} unit={tr('startSeconds')} label={tr('startShuffleEvery')} onChange={(shuffleSec) => onChange({ shuffleSec })} />
      <label className="start-check"><input type="checkbox" checked={background.random} onChange={(event) => onChange({ random: event.target.checked })} /><span>{tr('startRandom')}</span></label>
    </>
  )
}

function SampleThumb({ sample }: { sample: SampleImage }) {
  const ref = useRef<HTMLCanvasElement | null>(null)
  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    ctx.drawImage(renderSample(sample, 480, 320), 0, 0, canvas.width, canvas.height)
  }, [sample])
  return <canvas ref={ref} className="sample-thumb" width={240} height={160} aria-hidden="true" />
}

/**
 * The start screen: a moving background behind a board of movable, resizable cards.
 * The hero (icon, name, the main buttons), new-document presets, recent files, the
 * background's own controls, help and sample pictures. Everything about it is kept
 * in settings.startBackground, and Settings > Start Screen changes the same values.
 */
export default function StartScreen(props: StartScreenProps) {
  const { language, theme, showOnLaunch, recentFiles, canOpenPaths, onAction, onPreset, onSample, onRecentOpen, onRecentRemove, onRecentClear, onBackground, onShowOnLaunch } = props
  const tr = (key: string) => t(language, key)
  const background = normalizeStartBackground(props.background)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const animation = useRef<AnimatedBackground | null>(null)
  const speed = useRef(background.speed)
  speed.current = background.speed
  const board = useRef<HTMLDivElement | null>(null)
  const [drag, setDrag] = useState<{ id: string; mode: 'move' | 'resize'; target: Partial<Card> } | null>(null)
  const [measured, setMeasured] = useState<Record<string, number>>({})
  const burst = useRef({ at: 0, count: 0 })

  /* ------------------------------------------------------------ background */

  useEffect(() => {
    const first = background.random ? ANIMATION_KINDS[Math.floor(Math.random() * ANIMATION_KINDS.length)] : background.kind
    const engine = new AnimatedBackground(canvasRef.current as HTMLCanvasElement, { kind: first, speed: () => speed.current / 100, colors: themeColors })
    animation.current = engine
    engine.start()
    return () => engine.destroy()
    // Made once: the effects below keep the running engine up to date.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const firstKind = useRef(true)
  useEffect(() => {
    // The random first kind is not undone by the effect's first run.
    if (firstKind.current) { firstKind.current = false; return }
    animation.current?.setKind(background.kind)
  }, [background.kind])
  useEffect(() => {
    if (!background.shuffleSec) return undefined
    const timer = window.setInterval(() => animation.current?.shuffle(), background.shuffleSec * 1000)
    return () => window.clearInterval(timer)
  }, [background.shuffleSec])
  // The theme is applied to the root element in an effect of the parent, after this one.
  useEffect(() => {
    const frame = requestAnimationFrame(() => animation.current?.refreshColors())
    return () => cancelAnimationFrame(frame)
  }, [theme])

  const patch = (next: Partial<StartBackground>) => onBackground({ ...background, ...next })

  /* ---------------------------------------------------------------- layout */

  const saved = cardsOf(background.layout, CARD_IDS, DEFAULT_SPAN, measured)
  const pending = drag ? place(saved, drag.id, drag.target) : null
  const shown = pending ?? saved
  const saveLayout = (cards: Record<string, Card>) => patch({ layout: layoutValue(compact(cards)) })
  const arrange = () => saveLayout(autoArrange(CARD_IDS, DEFAULT_SPAN, measured))

  // Fit cards take the height of their content, measured in rows.
  const measure = useCallback(() => {
    if (!board.current) return
    const next: Record<string, number> = {}
    for (const element of board.current.querySelectorAll<HTMLElement>(':scope > .start-card.fit')) {
      next[element.dataset.card as string] = rowsFor(element.offsetHeight)
    }
    // Growing always applies; shrinking by one row is ignored, so it cannot flip-flop.
    const now = performance.now()
    if (now - burst.current.at > 1000) burst.current = { at: now, count: 0 }
    if (burst.current.count > 12) return
    setMeasured((current) => {
      const changed = Object.keys(next).filter((key) => current[key] === undefined || next[key] > current[key] || current[key] - next[key] > 1)
      if (!changed.length) return current
      burst.current.count += 1
      return { ...current, ...Object.fromEntries(changed.map((key) => [key, next[key]])) }
    })
  }, [])
  useLayoutEffect(() => { measure() })
  useEffect(() => {
    if (!board.current || typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(() => measure())
    for (const element of board.current.querySelectorAll(':scope > .start-card')) observer.observe(element)
    return () => observer.disconnect()
  }, [measure])

  // The other cards slide to their new places.
  const rects = useRef(new Map<string, DOMRect>())
  const shownKey = layoutKey(shown)
  useLayoutEffect(() => {
    if (!board.current) return
    const now = new Map<string, DOMRect>()
    for (const element of board.current.querySelectorAll<HTMLElement>(':scope > .start-card')) {
      const rect = element.getBoundingClientRect()
      const id = element.dataset.card as string
      now.set(id, rect)
      const old = rects.current.get(id)
      if (!old || element.classList.contains('drag-origin')) continue
      const dx = old.left - rect.left
      const dy = old.top - rect.top
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) element.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }], { duration: 180, easing: 'ease-out' })
    }
    rects.current = now
  }, [shownKey])

  const cellAt = (x: number, y: number, w: number) => {
    const box = (board.current as HTMLDivElement).getBoundingClientRect()
    const columnWidth = (box.width - GAP * (COLS - 1)) / COLS
    return { col: Math.max(0, Math.min(COLS - w, Math.round((x - box.left) / (columnWidth + GAP)))), row: Math.max(0, Math.round((y - box.top) / ROW)) }
  }
  const autoScroll = (event: PointerEvent) => {
    const scroller = board.current?.closest('.start-scroll')
    if (!scroller) return
    const box = scroller.getBoundingClientRect()
    if (event.clientY > box.bottom - 36) scroller.scrollTop += 14
    else if (event.clientY < box.top + 36) scroller.scrollTop -= 14
  }

  /** Follows the pointer until it is released; what was dropped is passed to `done`. */
  const track = (onMove: (event: PointerEvent) => void, done: (dropped: boolean) => void) => {
    const up = (event: PointerEvent) => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      done(event.type === 'pointerup')
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }

  const startMove = (event: ReactPointerEvent<HTMLElement>, id: string) => {
    if (event.button !== 0) return
    event.preventDefault()
    const element = event.currentTarget.closest('.start-card') as HTMLElement
    const box = element.getBoundingClientRect()
    const offset = { x: event.clientX - box.left, y: event.clientY - box.top }
    // What is dragged is a picture of the card: the card itself stays in the grid.
    const ghost = element.cloneNode(true) as HTMLElement
    ghost.classList.add('start-ghost')
    ghost.removeAttribute('data-card')
    Object.assign(ghost.style, { position: 'fixed', left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px`, margin: 0, zIndex: 100, pointerEvents: 'none' })
    document.body.appendChild(ghost)
    const card = saved[id]
    let target = { col: card.col, row: card.row }
    setDrag({ id, mode: 'move', target })
    track((move) => {
      const x = move.clientX - offset.x
      const y = move.clientY - offset.y
      ghost.style.left = `${x}px`
      ghost.style.top = `${y}px`
      autoScroll(move)
      const next = cellAt(x, y, card.w)
      if (next.col !== target.col || next.row !== target.row) {
        target = next
        setDrag({ id, mode: 'move', target })
      }
    }, (dropped) => {
      ghost.remove()
      setDrag(null)
      if (dropped && (target.col !== card.col || target.row !== card.row)) saveLayout(place(saved, id, target))
    })
  }

  const startResize = (event: ReactPointerEvent<HTMLElement>, id: string) => {
    event.preventDefault()
    event.stopPropagation()
    const rect = (event.currentTarget.parentElement as HTMLElement).getBoundingClientRect()
    const box = (board.current as HTMLDivElement).getBoundingClientRect()
    const columnWidth = (box.width - GAP * (COLS - 1)) / COLS
    const card = saved[id]
    const from = { x: event.clientX, y: event.clientY }
    let target = { w: card.w, h: card.h }
    setDrag({ id, mode: 'resize', target })
    track((move) => {
      autoScroll(move)
      const w = Math.max(1, Math.min(COLS - card.col, Math.round((rect.width + move.clientX - from.x + GAP) / (columnWidth + GAP))))
      const h = Math.max(4, Math.round((rect.height + move.clientY - from.y + GAP) / ROW))
      if (w !== target.w || h !== target.h) {
        target = { w, h }
        setDrag({ id, mode: 'resize', target: { ...target, fit: false } })
      }
    }, (dropped) => {
      setDrag(null)
      if (dropped && (target.w !== card.w || target.h !== card.h)) saveLayout(place(saved, id, { ...target, fit: false }))
    })
  }

  const keyMove = (event: ReactKeyboardEvent, id: string) => {
    if (!event.altKey || !event.key.startsWith('Arrow')) return
    event.preventDefault()
    const card = { ...saved[id] }
    const dx = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0
    const dy = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0
    if (event.shiftKey) {
      card.w = Math.max(1, Math.min(COLS - card.col, card.w + dx))
      if (dy) { card.h = Math.max(4, card.h + dy); card.fit = false }
    } else if (dy) {
      saveLayout(swapVertical(saved, id, dy))
      return
    } else {
      card.col = Math.max(0, Math.min(COLS - card.w, card.col + dx))
    }
    saveLayout(place(saved, id, card))
  }

  const cellStyle = (card: Card): CSSProperties => ({ gridColumn: `${card.col + 1} / span ${card.w}`, gridRow: `${card.row + 1} / span ${card.h}` })
  const handle = (id: string) => (
    <button type="button" className="card-handle" title={`${tr('startMoveCard')} (Alt+←↑↓→ · Alt+Shift: ${tr('startResizeCard')})`} aria-label={tr('startMoveCard')} onPointerDown={(event) => startMove(event, id)} onKeyDown={(event) => keyMove(event, id)}>
      <GripVertical size={14} />
    </button>
  )
  const card = (id: string, className: string, Icon: LucideIcon | null, title: string, body: ReactNode, extra?: ReactNode) => {
    const mine = drag?.id === id
    const position = mine ? saved[id] : shown[id]
    const origin = mine && drag?.mode === 'move'
    return (
      <section key={id} data-card={id} className={`start-card ${className} ${position.fit ? 'fit' : 'fixed-height'}${origin ? ' drag-origin' : ''}${mine && drag?.mode === 'resize' ? ' resizing' : ''}`}
        style={{ ...cellStyle(position), height: position.fit ? undefined : `${position.h * ROW - GAP}px` }}>
        {Icon ? (
          <h2>{handle(id)}<Icon size={15} className="card-icon" /><span>{title}</span><span className="grow" />{extra}</h2>
        ) : <span className="card-handle-float">{handle(id)}</span>}
        <div className="card-body">{body}</div>
        <span className="card-resize" title={`${tr('startResizeCard')} (Alt+Shift+←↑↓→)`} onPointerDown={(event) => startResize(event, id)} onDoubleClick={() => saveLayout(place(saved, id, { fit: true }))} />
      </section>
    )
  }

  const button = (Icon: LucideIcon, label: string, onClick: () => void, primary = false) => (
    <button type="button" className={`start-button${primary ? ' primary' : ''}`} onClick={onClick}><Icon size={15} /><span>{label}</span></button>
  )

  const cards: Record<string, ReactNode> = {
    hero: card('hero', 'start-hero', null, '', (
      <>
        <img src="./app-icon.svg" alt="" className="start-icon" />
        <div className="start-title">
          <h1>{tr('appName')} <small>v{buildInfo.version}</small></h1>
          <p>{tr('startTagline')}</p>
        </div>
        <div className="start-hero-actions">
          {button(GraduationCap, tr('tutorial'), () => onAction('tutorial'))}
          {button(BookOpen, tr('userGuide'), () => onAction('guide'))}
          {button(FolderOpen, tr('open'), () => onAction('open'))}
          {button(FilePlus, tr('new'), () => onAction('new'), true)}
        </div>
      </>
    )),
    create: card('create', 'start-create', FilePlus, tr('startNewDocument'), (
      <div className="preset-groups">
        {PRESET_GROUPS.map((group) => (
          <div key={group.title} className="preset-group">
            <p className="preset-group-title">{tr(group.title)}</p>
            {group.presets.map(([name, width, height, Icon]) => (
              <button key={name} type="button" className="preset-tile" data-preset={name} onClick={() => onPreset(width, height)}>
                <Icon size={18} /><b>{tr(name)}</b><small>{width} × {height}</small>
              </button>
            ))}
          </div>
        ))}
      </div>
    )),
    recent: card('recent', 'start-recent', History, tr('startRecent'), (
      <div className="start-list">
        {recentFiles.length === 0 && <div className="start-empty"><Info size={13} /><span>{tr('noRecent')}</span></div>}
        {recentFiles.slice(0, 10).map((path) => (
          <div key={path} className="start-row">
            <button type="button" className="start-link" title={path} disabled={!canOpenPaths} onClick={() => onRecentOpen(path)}>
              <File size={15} /><span className="name">{baseName(path)}</span><span className="path">{path}</span>
            </button>
            <button type="button" className="icon-only" title={tr('forgetRecent')} aria-label={tr('forgetRecent')} onClick={() => onRecentRemove(path)}><X size={12} /></button>
          </div>
        ))}
      </div>
    ), recentFiles.length ? <button type="button" className="small-button" onClick={onRecentClear}><Trash size={12} /><span>{tr('clearRecent')}</span></button> : null),
    side: card('side', 'start-side', Sparkles, tr('startBackground'), (
      <>
        <BackgroundKinds language={language} background={background} onChange={patch} />
        <BackgroundControls language={language} background={background} onChange={patch} />
      </>
    )),
    help: card('help', 'start-help-card', BookOpen, tr('helpMenu'), (
      <div className="start-help">
        {([['guide', BookOpen, 'userGuide'], ['tutorial', GraduationCap, 'tutorial'], ['shortcuts', Keyboard, 'keyboardShortcuts'], ['settings', Settings2, 'settings'], ['about', Info, 'about']] as [StartAction, LucideIcon, string][]).map(([action, Icon, label]) => (
          <button key={action} type="button" className="start-link compact" data-action={action} onClick={() => onAction(action)}><Icon size={15} /><span className="name">{tr(label)}</span></button>
        ))}
      </div>
    )),
    samples: card('samples', 'start-samples', ImageIcon, `${tr('startSamples')} (${SAMPLE_IMAGES.length})`, (
      <div className="sample-grid">
        {SAMPLE_IMAGES.map((sample) => (
          <button key={sample.id} type="button" className="sample-tile" data-sample={sample.id} onClick={() => onSample(sample)}>
            <SampleThumb sample={sample} />
            <b>{sample.name[language]}</b>
            <small>{sample.note[language]}</small>
          </button>
        ))}
      </div>
    )),
  }

  const outline = drag ? <div key="drop-outline" className="card-drop-outline" aria-hidden="true" style={{ ...cellStyle(shown[drag.id]), height: `${shown[drag.id].h * ROW - GAP}px` }} /> : null

  return (
    <div className="start-screen">
      <canvas ref={canvasRef} className="start-bg" aria-hidden="true" style={{ opacity: 1 - background.transparency / 100 }} />
      <div className="start-scroll">
        <div className="start-inner">
          <div className="start-tools">
            {button(LayoutGrid, tr('startArrange'), arrange)}
            {button(X, tr('startClose'), () => onAction('close'))}
          </div>
          <div className="start-board" ref={board}>{CARD_IDS.map((id) => cards[id])}{outline}</div>
          <footer className="start-foot">
            <label className="start-check"><input type="checkbox" checked={showOnLaunch} onChange={(event) => onShowOnLaunch(event.target.checked)} /><span>{tr('startShowOnLaunch')}</span></label>
            <span className="grow" />
            <span className="muted">© SHKWON (knix008@naver.com)</span>
          </footer>
        </div>
      </div>
    </div>
  )
}
