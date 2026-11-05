// The start screen: a moving background behind a board of translucent cards that can be moved and
// resized, with launcher tiles and one-line pickers.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import appIcon from '../../assets/icons/128x128.png'
import { host, type SampleItem, type SamplesList } from '../host'
import { OPACITY_MAX, OPACITY_MIN, OPACITY_STEP, SHUFFLE_SECONDS, SPEED_MAX, SPEED_MIN, SPEED_STEP, START_CARDS, effectiveSpeed, type StartSettings } from '../settings'
import { BACKGROUND_KINDS, chipPalette, drawBackground, themePalette } from '../start/backgrounds'
import { COLS, GAP, ROW, autoArrange, cardsOf, compact, layoutKey, layoutValue, place, rowsFor, type Cards, type Cell } from '../start/layout'
import { THEMES, themeById, type CustomTheme, type Theme } from '../themes'
import type { DiagramMode, Locale } from '../types'
import { GripDots, RangeStepper } from './controls'
import { Flag, Icon } from './Icons'

const FRAME_MS = 1000 / 30
// From the top: what to do, then what to start from, and how it all looks last.
const DEFAULT_SPAN: Record<string, number> = { hero: 3, actions: 2, recent: 1, samples: 3, theme: 3, background: 3 }

function useReducedMotion() {
  const query = '(prefers-reduced-motion: reduce)'
  const [reduced, setReduced] = useState(() => !!window.matchMedia?.(query).matches)
  useEffect(() => {
    const list = window.matchMedia?.(query)
    if (!list) return undefined
    const on = () => setReduced(list.matches)
    list.addEventListener('change', on)
    return () => list.removeEventListener('change', on)
  }, [])
  return reduced
}

/** A see-through copy of the dragged card that follows the pointer. */
function dragGhost(element: HTMLElement, event: React.PointerEvent, container: HTMLElement) {
  const rect = element.getBoundingClientRect()
  const offX = event.clientX - rect.left
  const offY = event.clientY - rect.top
  const ghost = element.cloneNode(true) as HTMLElement
  ghost.classList.add('start-ghost')
  ghost.removeAttribute('data-card')
  ghost.setAttribute('aria-hidden', 'true')
  const marks = ['data-recent', 'data-start', 'data-background', 'data-start-theme', 'data-card-handle', 'data-sample']
  for (const node of ghost.querySelectorAll(marks.map((name) => `[${name}]`).join(','))) {
    for (const name of marks) node.removeAttribute(name)
  }
  Object.assign(ghost.style, { width: `${rect.width}px`, height: `${rect.height}px`, transformOrigin: `${offX}px ${offY}px`, gridColumn: 'auto', gridRow: 'auto' })
  let last = { x: event.clientX, y: event.clientY }
  const put = () => {
    const c = container.getBoundingClientRect()
    ghost.style.left = `${last.x - offX - c.left}px`
    ghost.style.top = `${last.y - offY - c.top}px`
  }
  put()
  container.appendChild(ghost)
  return {
    topLeft: () => ({ x: last.x - offX, y: last.y - offY }),
    move(next: PointerEvent) {
      last = { x: next.clientX, y: next.clientY }
      put()
    },
    destroy: () => ghost.remove(),
  }
}

/** A small live-coloured still of a background: its icon on the picker tile. */
function BackgroundChip({ kind, themeId }: { kind: string; themeId: string }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const element = canvas.current
    const ctx = element?.getContext('2d')
    if (element && ctx) drawBackground(kind, ctx, element.width, element.height, 12.5, chipPalette(kind, themePalette()))
  }, [kind, themeId])
  return <canvas className="bg-chip" ref={canvas} width={56} height={40} aria-hidden="true" />
}

export function BackgroundGrid({ value, themeId, onChange, shuffle }: { value: string; themeId: string; onChange: (kind: string) => void; shuffle?: { on: boolean; onToggle: () => void } }) {
  const { t } = useTranslation()
  return (
    <div className="bg-grid" role="radiogroup" aria-label={t('start.background')}>
      {BACKGROUND_KINDS.map((kind) => (
        <button type="button" role="radio" key={kind} aria-checked={value === kind} className={value === kind ? 'bg-tile on' : 'bg-tile'} data-background={kind} title={t(`bg.${kind}`)} onClick={() => onChange(kind)}>
          <BackgroundChip kind={kind} themeId={themeId} />
          <span>{t(`bg.${kind}`)}</span>
        </button>
      ))}
      {shuffle && (
        <button type="button" role="switch" aria-checked={shuffle.on} className={shuffle.on ? 'bg-tile shuffle on' : 'bg-tile shuffle'} data-background-shuffle="" title={t('start.shuffle', { seconds: SHUFFLE_SECONDS })} onClick={shuffle.onToggle}>
          <Icon name="sync" />
          <span>{t('start.shuffleShort')}</span>
        </button>
      )}
    </div>
  )
}

/** Speed and card opacity on one line, used by the card and the settings window. */
export function StartRanges({ start, speed, onChange }: { start: StartSettings; speed: number; onChange: (patch: Partial<StartSettings>) => void }) {
  const { t } = useTranslation()
  return (
    <div className="start-ranges inline">
      <div className="start-range inline">
        <span className="start-range-label"><Icon name="clock" size={14} />{t('start.speed')}</span>
        <RangeStepper name="startSpeed" label={t('start.speed')} min={SPEED_MIN} max={SPEED_MAX} step={SPEED_STEP} suffix="%" value={speed} onChange={(next) => onChange({ speed: next })} />
      </div>
      <div className="start-range inline">
        <span className="start-range-label"><Icon name="eye" size={14} />{t('start.opacity')}</span>
        <RangeStepper name="startOpacity" label={t('start.opacity')} min={OPACITY_MIN} max={OPACITY_MAX} step={OPACITY_STEP} suffix="%" value={start.cardOpacity} onChange={(next) => onChange({ cardOpacity: next })} />
      </div>
    </div>
  )
}

const nameOf = (file: string) => file.split(/[\\/]/).pop()!.replace(/\.[^.]+$/, '')
const parentOf = (file: string) => file.split(/[\\/]/).slice(0, -1).join('/')

type Drag = { id: string; mode: 'move' | 'resize'; target: Partial<Cell> | null }

export type StartScreenProps = {
  language: Locale
  themeId: string
  customThemes: CustomTheme[]
  start: StartSettings
  recent: string[]
  onStart: (patch: Partial<StartSettings>) => void
  onNew: (mode: DiagramMode) => void
  onOpen: () => void
  onTutorial: () => void
  onContinue: () => void
  onOpenRecent: (file: string) => void
  onOpenSample: (sample: SampleItem, dir: string) => void
  onRemoveRecent: (file: string) => void
  onClearRecent: () => void
  onTheme: (id: string) => void
  onPreferences: (tab?: string) => void
  onLanguage: () => void
  onGuide: () => void
  onAbout: () => void
  onExit: () => void
}

export function StartScreen({ language, themeId, customThemes, start, recent, onStart, onNew, onOpen, onTutorial, onContinue, onOpenRecent, onOpenSample, onRemoveRecent, onClearRecent, onTheme, onPreferences, onLanguage, onGuide, onAbout, onExit }: StartScreenProps) {
  const { t } = useTranslation()
  const en = language === 'en'
  const reduced = useReducedMotion()
  const speed = effectiveSpeed(start.speed, reduced)

  /* ------------------------------------------------------- background */

  const canvas = useRef<HTMLCanvasElement>(null)
  // The clock lives outside React: a frame must not depend on a render.
  const motion = useRef({ t: Math.random() * 1000, speed, kind: start.background })
  motion.current.speed = speed
  motion.current.kind = start.background

  useEffect(() => {
    const element = canvas.current
    if (!element) return undefined
    let frame = 0
    let last = performance.now()
    let palette = themePalette()
    let width = 0
    let height = 0
    const refresh = () => {
      palette = themePalette()
    }
    const observer = new MutationObserver(refresh)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-mode'] })
    document.documentElement.addEventListener('mymind-theme', refresh)
    const loop = (now: number) => {
      frame = requestAnimationFrame(loop)
      const elapsed = now - last
      if (elapsed < FRAME_MS - 1) return
      last = now
      motion.current.t += (Math.min(elapsed, 100) / 1000) * (motion.current.speed / 100)
      if (element.clientWidth !== width || element.clientHeight !== height) {
        width = element.clientWidth
        height = element.clientHeight
        element.width = width
        element.height = height
      }
      const ctx = element.getContext('2d')
      if (ctx && width && height) drawBackground(motion.current.kind, ctx, width, height, motion.current.t, palette)
    }
    frame = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      document.documentElement.removeEventListener('mymind-theme', refresh)
    }
  }, [])

  useEffect(() => {
    if (!start.shuffle) return undefined
    const timer = setInterval(() => {
      const index = BACKGROUND_KINDS.indexOf(motion.current.kind)
      onStart({ background: BACKGROUND_KINDS[(index + 1) % BACKGROUND_KINDS.length] })
    }, SHUFFLE_SECONDS * 1000)
    return () => clearInterval(timer)
  }, [start.shuffle, onStart])

  /* ------------------------------------------------------- card board */

  const board = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  const [measured, setMeasured] = useState<Record<string, number>>({})
  const burst = useRef({ at: 0, n: 0 })
  const saved = useMemo(() => cardsOf(start.layout, START_CARDS, DEFAULT_SPAN, measured), [start.layout, measured])
  const pending: Cards | null = drag?.target ? place(saved, drag.id, drag.target) : null
  const shown = pending ?? saved
  const saveLayout = useCallback((cards: Cards) => onStart({ layout: layoutValue(compact(cards)) }), [onStart])
  const arrange = () => saveLayout(autoArrange(START_CARDS, DEFAULT_SPAN, measured))

  // Fit cards take the height of their content, measured in rows.
  const measure = useCallback(() => {
    const element = board.current
    if (!element) return
    const next: Record<string, number> = {}
    for (const card of element.querySelectorAll<HTMLElement>(':scope > .start-card.fit')) next[card.dataset.card ?? ''] = rowsFor(card.offsetHeight)
    // Growing always applies; shrinking by a single row does not, so a card whose height
    // depends on where compaction put it cannot flip between two heights.
    const now = performance.now()
    if (now - burst.current.at > 1000) burst.current = { at: now, n: 0 }
    if (burst.current.n > 12) return
    setMeasured((current) => {
      const changed = Object.keys(next).filter((key) => current[key] === undefined || next[key] > current[key] || current[key] - next[key] > 1)
      if (!changed.length) return current
      burst.current.n += 1
      return { ...current, ...Object.fromEntries(changed.map((key) => [key, next[key]])) }
    })
  }, [])
  useLayoutEffect(() => {
    measure()
  })
  useEffect(() => {
    const element = board.current
    if (!element) return undefined
    const observer = new ResizeObserver(() => measure())
    for (const card of element.querySelectorAll(':scope > .start-card')) observer.observe(card)
    observer.observe(element)
    return () => observer.disconnect()
  }, [measure])

  // The other cards slide to their new places rather than jumping.
  const rects = useRef(new Map<string, DOMRect>())
  const shownKey = layoutKey(shown)
  useLayoutEffect(() => {
    const element = board.current
    if (!element) return
    const now = new Map<string, DOMRect>()
    for (const card of element.querySelectorAll<HTMLElement>(':scope > .start-card')) {
      const id = card.dataset.card ?? ''
      const rect = card.getBoundingClientRect()
      now.set(id, rect)
      const old = rects.current.get(id)
      if (!old || reduced || card.classList.contains('drag-origin') || !card.animate) continue
      const dx = old.left - rect.left
      const dy = old.top - rect.top
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) card.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }], { duration: 180, easing: 'ease-out' })
    }
    rects.current = now
  }, [shownKey, reduced])

  const columnWidth = () => (board.current!.getBoundingClientRect().width - GAP * (COLS - 1)) / COLS
  const cellAt = (x: number, y: number, w: number) => {
    const rect = board.current!.getBoundingClientRect()
    const size = columnWidth()
    return { col: Math.max(0, Math.min(COLS - w, Math.round((x - rect.left) / (size + GAP)))), row: Math.max(0, Math.round((y - rect.top) / ROW)) }
  }
  const autoScroll = (event: PointerEvent) => {
    const scroller = board.current?.closest('.start-scroll')
    if (!scroller) return
    const rect = scroller.getBoundingClientRect()
    if (event.clientY > rect.bottom - 36) scroller.scrollTop += 14
    else if (event.clientY < rect.top + 36) scroller.scrollTop -= 14
  }
  const follow = (move: (event: PointerEvent) => void, done: (event: PointerEvent) => void) => {
    const up = (event: PointerEvent) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      done(event)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }

  const startMove = (event: React.PointerEvent<HTMLElement>, id: string) => {
    if (event.button !== 0 || !board.current) return
    event.preventDefault()
    const element = event.currentTarget.closest<HTMLElement>('.start-card')
    if (!element) return
    const ghost = dragGhost(element, event, board.current)
    const cell = saved[id]
    let target = { col: cell.col, row: cell.row }
    setDrag({ id, mode: 'move', target })
    follow((moved) => {
      // Scroll first: the ghost is placed against the board, which scrolling moves.
      autoScroll(moved)
      ghost.move(moved)
      const point = ghost.topLeft()
      const next = cellAt(point.x, point.y, cell.w)
      if (next.col !== target.col || next.row !== target.row) {
        target = next
        setDrag({ id, mode: 'move', target })
      }
    }, (ended) => {
      ghost.destroy()
      setDrag(null)
      if (ended.type === 'pointerup' && (target.col !== cell.col || target.row !== cell.row)) saveLayout(place(saved, id, target))
    })
  }

  const startResize = (event: React.PointerEvent<HTMLElement>, id: string) => {
    if (event.button !== 0 || !board.current) return
    event.preventDefault()
    event.stopPropagation()
    const rect = event.currentTarget.parentElement!.getBoundingClientRect()
    const size = columnWidth()
    const cell = saved[id]
    const startX = event.clientX
    const startY = event.clientY
    let target = { w: cell.w, h: cell.h }
    setDrag({ id, mode: 'resize', target: null })
    follow((moved) => {
      autoScroll(moved)
      const w = Math.max(1, Math.min(COLS - cell.col, Math.round((rect.width + moved.clientX - startX + GAP) / (size + GAP))))
      const h = Math.max(4, Math.round((rect.height + moved.clientY - startY + GAP) / ROW))
      if (w !== target.w || h !== target.h) {
        target = { w, h }
        setDrag({ id, mode: 'resize', target: { ...target, fit: false } })
      }
    }, (ended) => {
      setDrag(null)
      if (ended.type === 'pointerup' && (target.w !== cell.w || target.h !== cell.h)) saveLayout(place(saved, id, { ...target, fit: false }))
    })
  }

  const cellStyle = (cell: Cell): CSSProperties => ({ gridColumn: `${cell.col + 1} / span ${cell.w}`, gridRow: `${cell.row + 1} / span ${cell.h}` })
  const handle = (id: string) => (
    <button type="button" className="card-handle" data-card-handle={id} title={t('start.moveCard')} aria-label={t('start.moveCard')} onPointerDown={(event) => startMove(event, id)}>
      <Icon name="drag" size={14} />
    </button>
  )

  const card = (id: string, icon: string, title: string, body: ReactNode, extra: ReactNode = null, bare = false) => {
    const mine = drag?.id === id
    const cell = mine ? saved[id] : shown[id]
    const classes = ['start-card', `start-card-${id}`, bare ? 'bare' : '', cell.fit ? 'fit' : 'fixed-height', mine && drag.mode === 'move' ? 'drag-origin' : '', mine && drag.mode === 'resize' ? 'resizing' : ''].filter(Boolean).join(' ')
    return (
      <section key={id} data-card={id} className={classes} style={{ ...cellStyle(cell), height: cell.fit ? undefined : `${cell.h * ROW - GAP}px` }} aria-label={title || undefined}>
        {bare ? <span className="card-handle-float">{handle(id)}</span> : (
          <h2>
            {handle(id)}
            <Icon name={icon} />
            <span className="start-card-title">{title}</span>
            <span className="grow" />
            {extra}
          </h2>
        )}
        <div className="card-body">{body}</div>
        <span className="card-resize" data-card-resize={id} title={t('start.resizeCard')} onPointerDown={(event) => startResize(event, id)} onDoubleClick={() => saveLayout(place(saved, id, { fit: true }))}><GripDots /></span>
      </section>
    )
  }

  const dropOutline = drag?.target ? <div key="drop-outline" className="card-drop-outline" aria-hidden="true" style={{ ...cellStyle(shown[drag.id]), height: `${shown[drag.id].h * ROW - GAP}px` }} /> : null

  /* ------------------------------------------------------------ pickers */

  const themeName = (item: Theme) => (en ? item.nameEn : item.nameKo)
  const themeTile = (item: Theme, label = themeName(item)) => (
    <button type="button" role="radio" key={item.id} aria-checked={themeId === item.id} className={themeId === item.id ? 'bg-tile st-theme-tile on' : 'bg-tile st-theme-tile'} data-start-theme={item.id} title={label} onClick={() => onTheme(item.id)}>
      <span className="st-theme-chip" aria-hidden="true" style={{ background: item.swatch[0], borderColor: item.vars['--accent-line'] }}>
        <i style={{ background: item.swatch[1] }} />
        <i style={{ background: item.swatch[2] }} />
      </span>
      <span>{label}</span>
    </button>
  )

  const actions: { id: string; icon: string; flag?: 'gb' | 'kr'; label: string; tip: string; run: () => void }[] = [
    { id: 'new-mindmap', icon: 'mind', label: t('start.newMindmap'), tip: t('start.tipMindmap'), run: () => onNew('mindmap') },
    { id: 'new-fishbone', icon: 'fish', label: t('start.newFishbone'), tip: t('start.tipFishbone'), run: () => onNew('fishbone') },
    { id: 'open', icon: 'open', label: t('toolbar.open'), tip: t('start.tipOpen'), run: onOpen },
    { id: 'tutorial', icon: 'tutorial', label: t('start.tutorial'), tip: t('start.tipTutorial'), run: onTutorial },
    { id: 'continue', icon: 'design', label: t('start.continue'), tip: t('start.tipContinue'), run: onContinue },
    { id: 'theme', icon: 'theme', label: t('start.themeSettings'), tip: t('start.tipTheme'), run: () => onPreferences('theme') },
    { id: 'language', icon: 'language', flag: en ? 'kr' : 'gb', label: en ? '한국어' : 'English', tip: t('start.tipLanguage'), run: onLanguage },
    { id: 'preferences', icon: 'settings', label: t('toolbar.settings'), tip: t('start.tipPreferences'), run: () => onPreferences() },
    { id: 'start-settings', icon: 'home', label: t('start.settings'), tip: t('start.tipStart'), run: () => onPreferences('start') },
    { id: 'guide', icon: 'guide', label: t('guide.title'), tip: t('start.tipGuide'), run: onGuide },
    { id: 'about', icon: 'about', label: t('toolbar.about'), tip: t('start.tipAbout'), run: onAbout },
    { id: 'exit', icon: 'power', label: t('start.exit'), tip: t('start.tipExit'), run: onExit },
  ]

  /* -------------------------------------------------------------- cards */

  const [samples, setSamples] = useState<SamplesList>({ dir: '', items: [] })
  useEffect(() => {
    void host.samplesList().then(setSamples).catch(() => {})
  }, [])

  const cards: Record<string, ReactNode> = {
    hero: card('hero', 'home', '', (
      <>
        <img className="start-icon" src={appIcon} width={76} height={76} alt="" />
        <div className="start-hero-text">
          <h1><span>MyMind</span><small>v{__APP_VERSION__}</small></h1>
          <p>{t('about.description')}</p>
        </div>
        <div className="start-hero-actions">
          <button type="button" className="start-btn primary" data-start="hero-mindmap" onClick={() => onNew('mindmap')}><Icon name="mind" /><span>{t('start.newMindmap')}</span></button>
          <button type="button" className="start-btn" data-start="hero-fishbone" onClick={() => onNew('fishbone')}><Icon name="fish" /><span>{t('start.newFishbone')}</span></button>
          <button type="button" className="start-btn" data-start="hero-open" onClick={onOpen}><Icon name="open" /><span>{t('toolbar.open')}</span></button>
          <button type="button" className="start-btn" data-start="hero-tutorial" title={t('start.tipTutorial')} onClick={onTutorial}><Icon name="tutorial" /><span>{t('start.tutorial')}</span></button>
        </div>
      </>
    ), null, true),

    actions: card('actions', 'gridIcon', t('start.actions'), (
      <div className="start-actions">
        {actions.map((action) => (
          <button type="button" key={action.id} className="start-tile" data-start={action.id} title={action.tip} onClick={action.run}>
            {action.flag ? <Flag country={action.flag} /> : <Icon name={action.icon} size={20} />}
            <b>{action.label}</b>
            <small>{action.tip}</small>
          </button>
        ))}
      </div>
    )),

    recent: card('recent', 'clock', t('start.recent'), (
      <div className="start-list">
        {recent.length === 0 && <div className="start-empty"><Icon name="about" size={14} /><span>{t('start.noRecent')}</span></div>}
        {recent.map((file) => (
          <div className="start-row" key={file}>
            <button type="button" className="start-link" data-recent={file} title={file} onClick={() => onOpenRecent(file)}>
              <Icon name="file" />
              <span className="name">{nameOf(file)}</span>
              <span className="path">{parentOf(file)}</span>
            </button>
            <button type="button" className="icon-button" data-recent-remove={file} title={t('start.removeRecent')} aria-label={t('start.removeRecent')} onClick={() => onRemoveRecent(file)}><Icon name="delete" size={14} /></button>
          </div>
        ))}
      </div>
    ), recent.length ? <button type="button" className="start-btn small" data-start="clear-recent" onClick={onClearRecent}><Icon name="delete" size={14} /><span>{t('start.clearRecent')}</span></button> : null),

    samples: card('samples', 'samples', t('start.samples'), (
      <div className="sample-groups">
        {samples.items.length === 0 && <div className="start-empty"><Icon name="about" size={14} /><span>{t('start.noSamples')}</span></div>}
        {(['mindmap', 'fishbone'] as const).map((mode) => {
          const items = samples.items.filter((sample) => sample.mode === mode)
          if (!items.length) return null
          return (
            <section key={mode} className="st-theme-group" data-sample-group={mode}>
              <h3><Icon name={mode === 'fishbone' ? 'fish' : 'mind'} size={14} /><span>{t(`toolbar.${mode}`)}</span><span className="sample-count">{items.length}</span></h3>
              <div className="sample-tiles">
                {items.map((sample) => (
                  <button type="button" key={sample.id} className="start-tile" data-sample={sample.id} title={sample[language]?.[1]} onClick={() => onOpenSample(sample, samples.dir)}>
                    <Icon name={mode === 'fishbone' ? 'fish' : 'mind'} size={20} />
                    <b>{sample[language]?.[0] ?? sample.id}</b>
                    <small>{sample[language]?.[1]}</small>
                  </button>
                ))}
              </div>
            </section>
          )
        })}
      </div>
    )),

    theme: card('theme', 'theme', t('toolbar.theme'), (
      <div className="st-theme-groups">
        <div className="st-theme-custom-row">
          {customThemes.map((item) => themeTile(themeById(item.id), item.name))}
          <button type="button" className="start-btn" data-start="theme-settings" onClick={() => onPreferences('theme')}><Icon name="settings" /><span>{t('start.themeSettings')}</span></button>
        </div>
        <div className="st-theme-columns">
          {(['dark', 'light'] as const).map((mode) => (
            <section key={mode} className="st-theme-group" data-theme-kind={mode}>
              <h3><Icon name={mode === 'light' ? 'sun' : 'moon'} size={14} /><span>{t(`theme.${mode}`)}</span></h3>
              <div className="bg-grid st-theme-tiles">{THEMES.filter((item) => item.mode === mode).map((item) => themeTile(item))}</div>
            </section>
          ))}
        </div>
      </div>
    ), <span className="start-card-note">{themeName(themeById(themeId))}</span>),

    background: card('background', 'image', t('start.background'), (
      <>
        <BackgroundGrid value={start.background} themeId={themeId} onChange={(background) => onStart({ background })} shuffle={{ on: start.shuffle, onToggle: () => onStart({ shuffle: !start.shuffle }) }} />
        <StartRanges start={start} speed={speed} onChange={onStart} />
      </>
    )),
  }

  return (
    <div className="start-page" data-start-screen="" style={{ '--start-card-alpha': `${start.cardOpacity}%` } as CSSProperties}>
      <canvas ref={canvas} className="start-bg" data-start-canvas="" aria-hidden="true" />
      <div className="start-scroll">
        <div className="start-inner">
          <div className="start-tools">
            <label className="start-btn start-startup" title={t('start.showOnStartup')}>
              <input type="checkbox" data-field="startShow" checked={start.showOnStartup} onChange={(event) => onStart({ showOnStartup: event.target.checked })} />
              <span>{t('start.showOnStartup')}</span>
            </label>
            <button type="button" className="start-btn" data-start="tools-settings" onClick={() => onPreferences('start')}><Icon name="settings" /><span>{t('start.settings')}</span></button>
            <button type="button" className="start-btn" data-start="arrange" title={t('start.arrangeTip')} onClick={arrange}><Icon name="gridIcon" /><span>{t('start.arrange')}</span></button>
          </div>
          <div className="start-board" ref={board}>
            {START_CARDS.map((id) => cards[id])}
            {dropOutline}
          </div>
          <footer className="start-foot">
            <Icon name="about" size={14} />
            <span className="grow">MyMind v{__APP_VERSION__}</span>
            <span className="muted">© SHKWON (knix008@naver.com)</span>
          </footer>
        </div>
      </div>
    </div>
  )
}
