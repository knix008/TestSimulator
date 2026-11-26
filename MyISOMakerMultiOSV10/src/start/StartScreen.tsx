/**
 * Start screen (MyImageViewer / MySketchBook style): a board of movable,
 * resizable cards over the app background. The program-name card (hero) is
 * locked: it has no move handle and no resize corner, and the board keeps it
 * full width on the first row (startboard.ts pinHero), so it can be neither
 * moved nor resized. No sample images — this program has none.
 *
 * The cards are rendered by React with the markup startboard.ts expects
 * (section.start-card[data-card] › h2 › [data-card-handle], .card-body,
 * [data-card-resize]); StartBoard.start() then places them on the grid.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { EngineInfo } from '../platform/engine-types'
import type { MessageKey } from '../i18n/messages'
import { Icons } from '../Toolbar'
import { APP_VERSION, APP_YEAR } from '../version'
import type { RecentImage } from './recent'
import { StartBoard } from './startboard'
import { AnimatedBackground, themeColors } from './background'
import { BackgroundPanel } from './BackgroundPanel'
import type { BgPrefs } from './bgPrefs'
import './background.css'

type Go = 'extract' | 'create' | 'bootable' | 'mount'

type Props = {
  t: (key: MessageKey, ...args: string[]) => string
  theme: 'light' | 'dark'
  locale: 'ko' | 'en'
  engine: EngineInfo | null
  recent: RecentImage[]
  showOnStart: boolean
  busy: boolean
  onShowOnStart: (on: boolean) => void
  onOpenImage: () => void
  onOpenRecent: (path: string) => void
  onRecentMenu?: (x: number, y: number, path: string) => void
  onRemoveRecent: (path: string) => void
  onClearRecent: () => void
  onGo: (tab: Go) => void
  onAbout: () => void
  onRecheckEngine: () => void
  bg: BgPrefs
  onBg: (next: BgPrefs) => void
}

const TIP_COUNT = 4

export function StartScreen(props: Props) {
  const { t, engine, recent, busy } = props
  const boardRef = useRef<HTMLDivElement>(null)
  const boardApi = useRef<{ arrange: () => void; destroy: () => void } | null>(null)
  const [tipOpen, setTipOpen] = useState(false)
  const tipIndex = Math.floor(Date.now() / 86400000) % TIP_COUNT
  const tipKey = `homeTip${tipIndex}` as MessageKey
  const tipMoreKey = `homeTip${tipIndex}More` as MessageKey

  useEffect(() => {
    const host = boardRef.current
    if (!host) return
    const reduced = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    boardApi.current = StartBoard.start(host, { reduced })
    return () => {
      boardApi.current?.destroy()
      boardApi.current = null
    }
  }, [])

  // The moving background behind the board (canvas under the scroll area).
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<AnimatedBackground | null>(null)
  const bgRef = useRef(props.bg)
  bgRef.current = props.bg
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    // background.ts is untyped JS (ported); its inferred option types are too narrow.
    const options: any = {
      colors: themeColors,
      speed: () => bgRef.current.speed,
      kind: bgRef.current.kind,
      vivid: true,
    }
    const engine = new AnimatedBackground(canvas, options)
    engineRef.current = engine
    engine.start()
    return () => {
      engine.destroy()
      engineRef.current = null
    }
  }, [])
  useEffect(() => {
    engineRef.current?.setKind(props.bg.kind)
  }, [props.bg.kind])
  useEffect(() => {
    if (!props.bg.auto) return
    const timer = window.setInterval(() => {
      const kind = engineRef.current?.shuffle()
      if (kind) props.onBg({ ...bgRef.current, kind })
    }, props.bg.autoSec * 1000)
    return () => window.clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.bg.auto, props.bg.autoSec])

  const moveTip = t('homeMoveCard')
  const resizeTip = t('homeResizeCard')

  const tile = (
    id: string,
    icon: ReactNode,
    title: string,
    sub: string,
    color: string,
    onClick: () => void,
    disabled = false,
  ) => (
    <button
      key={id}
      type="button"
      className="start-tile"
      data-start-action={id}
      style={{ ['--tile-color' as string]: color }}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      <span className="start-tile-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="start-tile-text">
        <b>{title}</b>
        <small>{sub}</small>
      </span>
    </button>
  )

  return (
    <>
    <canvas className="start-bg-canvas" ref={canvasRef} style={{ opacity: props.bg.opacity }} aria-hidden="true" />
    <div className="start-scroll" data-start-screen="">
      <div className="start-inner">
        <div className="start-tools">
          <label className="start-btn start-show">
            <input
              type="checkbox"
              checked={props.showOnStart}
              onChange={(e) => props.onShowOnStart(e.target.checked)}
            />
            <span>{t('homeShowOnStart')}</span>
          </label>
          <button
            type="button"
            className="start-btn"
            title={t('homeArrangeTip')}
            onClick={() => boardApi.current?.arrange()}
          >
            {Icons.grid}
            <span>{t('homeArrange')}</span>
          </button>
        </div>

        <div className="start-tip start-banner">
          <button type="button" className="start-tip-toggle" onClick={() => setTipOpen((v) => !v)}>
            <span className="start-tip-icon" aria-hidden="true">
              {Icons.bulb}
            </span>
            <span className="start-tip-text">
              {t('homeTip')} · {t(tipKey)}
            </span>
            <span className="start-tip-more-label">{tipOpen ? t('homeTipLess') : t('homeTipMore')}</span>
          </button>
          {tipOpen ? <p className="start-tip-more">{t(tipMoreKey)}</p> : null}
        </div>

        <div className="start-board" ref={boardRef}>
          {/* Program name: locked — no handle, no resize corner, pinned to the first row. */}
          <section className="start-card start-card-hero bare locked" data-card="hero" aria-label={t('brand')}>
            <div className="card-body">
              <div className="start-hero">
                <img src="/icon-256.png" alt="" className="start-icon" draggable={false} />
                <div className="start-hero-text">
                  <h1>
                    <span>{t('brand')}</span> <small className="start-version">V{APP_VERSION}</small>
                  </h1>
                  <p>{t('homeLead')}</p>
                </div>
                <div className="start-hero-actions">
                  <div className="start-docs" role="group">
                    <button type="button" className="start-hero-btn" onClick={props.onAbout} title={t('tipAbout')}>
                      {Icons.info}
                      <span>{t('menuAbout')}</span>
                    </button>
                  </div>
                  <button
                    type="button"
                    className="start-hero-btn primary"
                    onClick={props.onOpenImage}
                    disabled={busy}
                    title={t('tipOpenIso')}
                  >
                    {Icons.openIso}
                    <span>{t('openIso')}</span>
                  </button>
                </div>
              </div>
            </div>
          </section>

          <Card id="begin" icon={Icons.home} title={t('homeBegin')} moveTip={moveTip} resizeTip={resizeTip}>
            <div className="start-actions">
              {tile('open', Icons.openIso, t('homeActOpen'), t('homeActOpenSub'), '#3db8a0', props.onOpenImage, busy)}
              {tile('contents', Icons.extract, t('homeActContents'), t('homeActContentsSub'), '#4f8cff', () => props.onGo('extract'))}
              {tile('create', Icons.create, t('homeActCreate'), t('homeActCreateSub'), '#f0b429', () => props.onGo('create'))}
              {tile('bootable', Icons.bootable, t('homeActBootable'), t('homeActBootableSub'), '#e0457b', () => props.onGo('bootable'))}
              {tile('mount', Icons.mount, t('homeActMount'), t('homeActMountSub'), '#9b6bff', () => props.onGo('mount'))}
              {tile('about', Icons.info, t('homeActAbout'), t('homeActAboutSub'), '#22a6c9', props.onAbout)}
            </div>
          </Card>

          <Card
            id="recent"
            icon={Icons.recent}
            title={t('homeRecent')}
            moveTip={moveTip}
            resizeTip={resizeTip}
            extra={
              <>
                <span className="start-card-note">{recent.length}</span>
                <button
                  type="button"
                  className="start-sub-clear"
                  title={t('homeRecentClear')}
                  aria-label={t('homeRecentClear')}
                  disabled={!recent.length}
                  onClick={props.onClearRecent}
                >
                  {Icons.trash}
                </button>
              </>
            }
          >
            {recent.length ? (
              <div className="start-list">
                {recent.map((r) => (
                  <div className="start-row" key={r.path}>
                    <button
                      type="button"
                      className="start-link"
                      title={r.path}
                      disabled={busy}
                      onClick={() => props.onOpenRecent(r.path)}
                      onContextMenu={(e) => {
                        e.preventDefault()
                        props.onRecentMenu?.(e.clientX, e.clientY, r.path)
                      }}
                    >
                      <span className="start-link-icon" aria-hidden="true">
                        {Icons.disc}
                      </span>
                      <span className="name">{baseName(r.path)}</span>
                      <span className="path">{parentOf(r.path)}</span>
                    </button>
                    <button
                      type="button"
                      className="recent-remove"
                      title={t('homeRecentRemove')}
                      aria-label={t('homeRecentRemove')}
                      onClick={() => props.onRemoveRecent(r.path)}
                    >
                      {Icons.close}
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="start-empty">
                {Icons.info}
                <span>{t('homeRecentEmpty')}</span>
              </p>
            )}
          </Card>

          <Card id="tasks" icon={Icons.grid} title={t('homeTasks')} moveTip={moveTip} resizeTip={resizeTip} extra={<span className="start-card-note">6</span>}>
            <div className="task-grid">
              {tile('t-edit', Icons.rename, t('homeTaskEdit'), t('homeTaskEditSub'), '#4f8cff', () => props.onGo('extract'))}
              {tile('t-drag', Icons.exportFile, t('homeTaskDrag'), t('homeTaskDragSub'), '#3db8a0', () => props.onGo('extract'))}
              {tile('t-save', Icons.save, t('homeTaskSave'), t('homeTaskSaveSub'), '#22a6c9', () => props.onGo('extract'))}
              {tile('t-create', Icons.create, t('homeTaskCreate'), t('homeTaskCreateSub'), '#f0b429', () => props.onGo('create'))}
              {tile('t-boot', Icons.bootable, t('homeTaskBoot'), t('homeTaskBootSub'), '#e0457b', () => props.onGo('bootable'))}
              {tile('t-mount', Icons.mount, t('homeTaskMount'), t('homeTaskMountSub'), '#9b6bff', () => props.onGo('mount'))}
            </div>
          </Card>

          <Card id="engine" icon={Icons.engine} title={t('homeEngine')} moveTip={moveTip} resizeTip={resizeTip}>
            <div className="start-engine">
              <p className={`start-engine-state ${engine?.available ? 'ok' : engine ? 'warn' : ''}`}>
                {engine ? (engine.available ? Icons.check : Icons.warning) : Icons.refresh}
                <span>
                  {engine ? (engine.available ? t('homeEngineOk') : t('homeEngineMissing')) : t('engineChecking')}
                </span>
              </p>
              {engine?.available ? (
                <dl className="start-engine-facts">
                  <dt>{t('homeEngineVersion')}</dt>
                  <dd>{engine.version || '—'}</dd>
                  <dt>{t('homeEnginePath')}</dt>
                  <dd title={engine.binaryPath ?? ''}>{engine.binaryPath || '—'}</dd>
                </dl>
              ) : engine?.hint ? (
                <p className="start-engine-hint">{engine.hint}</p>
              ) : null}
              <button type="button" className="start-btn" onClick={props.onRecheckEngine}>
                {Icons.refresh}
                <span>{t('homeEngineRecheck')}</span>
              </button>
            </div>
          </Card>

          <Card
            id="scenes"
            icon={Icons.image}
            title={t('homeBackground')}
            moveTip={moveTip}
            resizeTip={resizeTip}
            extra={<span className="start-card-note">24</span>}
          >
            <BackgroundPanel bg={props.bg} onChange={props.onBg} locale={props.locale} t={t} />
          </Card>
        </div>

        <footer className="start-foot">
          {Icons.info}
          <span className="grow">
            {t('brand')} <span className="start-version">V{APP_VERSION}</span>
          </span>
          <span className="start-foot-copy">{t('aboutCopyright', APP_YEAR)}</span>
        </footer>
      </div>
    </div>
    </>
  )
}

function Card({
  id,
  icon,
  title,
  extra,
  moveTip,
  resizeTip,
  children,
}: {
  id: string
  icon: ReactNode
  title: string
  extra?: ReactNode
  moveTip: string
  resizeTip: string
  children: ReactNode
}) {
  return (
    <section className={`start-card start-card-${id}`} data-card={id} aria-label={title}>
      <h2>
        <button
          type="button"
          className="card-handle"
          data-card-handle={id}
          title={moveTip}
          aria-label={moveTip}
          dangerouslySetInnerHTML={{ __html: StartBoard.HANDLE_SVG }}
        />
        <span className="start-card-icon" aria-hidden="true">
          {icon}
        </span>
        <span className="start-card-title">{title}</span>
        <span className="grow" />
        {extra}
      </h2>
      <div className="card-body">
        <div className="card-content">{children}</div>
      </div>
      <span className="card-resize" data-card-resize={id} title={resizeTip}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="20" cy="20" r="2" />
          <circle cx="14" cy="20" r="2" />
          <circle cx="20" cy="14" r="2" />
          <circle cx="8" cy="20" r="2" />
          <circle cx="14" cy="14" r="2" />
          <circle cx="20" cy="8" r="2" />
        </svg>
      </span>
    </section>
  )
}

function baseName(p: string): string {
  const n = p.replace(/\\/g, '/')
  return n.slice(n.lastIndexOf('/') + 1)
}

function parentOf(p: string): string {
  const i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'))
  return i > 0 ? p.slice(0, i) : ''
}
