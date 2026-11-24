// The start screen: shown over the editor when the app starts (unless turned
// off) and whenever the Home button is pressed.
//
// A moving background (twenty animations in the theme's colours, ported from
// MyUMLMaker) runs behind see-through cards. The title card at the top is fixed:
// it never moves or changes size. The cards below it form a board — drag a card
// by its handle to move it, drag its bottom-right corner to change its width
// (1–3 columns) and height, double click that corner to fit it again, and
// "Arrange" puts everything back. The arrangement and the background settings
// are saved with the settings.
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { t as translate, useT, type Language } from '../i18n';
import { APP_TITLE, APP_VERSION } from '../appInfo';
import { getDbDisplayName } from '../types';
import { createSample, SAMPLES, sampleDescription, sampleName, type SampleInfo } from '../core/samples';
import { renderDiagramDataUrl } from '../core/export/diagramImage';
import {
  DEFAULT_START_LAYOUT,
  randomAnimation,
  START_INTERVALS,
  type StartBackgroundPrefs,
  type StartLayoutPrefs,
} from '../core/settings';
import { getHeaderColor, getTheme, type ThemeId } from '../render/theme';
import { baseName } from '../platform';
import { AnimatedBackground, ANIMATIONS } from './startBackground';
import { Icons } from './Icons';
import { AnimationIcon } from './AnimationIcons';
import appIcon from '../../assets/icons/256x256.png';

interface Props {
  language: Language;
  theme: ThemeId;
  recentFiles: string[];
  showOnStart: boolean;
  background: StartBackgroundPrefs;
  layout: StartLayoutPrefs;
  onBackgroundChange: (next: StartBackgroundPrefs) => void;
  onLayoutChange: (next: StartLayoutPrefs) => void;
  onShowOnStartChange: (on: boolean) => void;
  onNew: () => void;
  onOpenProject: () => void;
  onOpenDatabase: () => void;
  onOpenWorkspace: () => void;
  onOpenRecent: (path: string) => void;
  onOpenSample: (id: string) => void;
  onUserGuide: () => void;
  onTutorial: () => void;
  onThemes: () => void;
  onClose: () => void;
}

const COLUMNS = 3;
const GAP = 14;

/** `rgb(r, g, b)` to `#rrggbb` — the background module mixes hex colours. */
function toHex(css: string): string {
  const m = /rgba?\(([^)]+)\)/.exec(css);
  if (!m) return css;
  return '#' + m[1].split(',').slice(0, 3).map((v) => Math.round(Number.parseFloat(v)).toString(16).padStart(2, '0')).join('');
}

// ── Thumbnails ─────────────────────────────────────────────────────────────

/** Thumbnails by theme and sample: drawing all 20 takes a moment, once. */
const thumbnails = new Map<string, string>();

function useThumbnail(sample: SampleInfo, theme: ThemeId, index: number): string | null {
  const key = `${theme}/${sample.id}`;
  const [url, setUrl] = useState<string | null>(() => thumbnails.get(key) ?? null);
  useEffect(() => {
    const cached = thumbnails.get(key);
    if (cached) return setUrl(cached);
    setUrl(null);
    // Staggered so the screen paints first and the pictures arrive one by one.
    const timer = window.setTimeout(() => {
      try {
        const made = renderDiagramDataUrl(createSample(sample.id), { theme, scale: 0.6, transparent: false });
        thumbnails.set(key, made);
        setUrl(made);
      } catch {
        /* the card keeps its placeholder */
      }
    }, 40 + index * 30);
    return () => window.clearTimeout(timer);
  }, [key, sample.id, theme, index]);
  return url;
}

function SampleCard({ sample, index, language, theme, onOpen }: {
  sample: SampleInfo;
  index: number;
  language: Language;
  theme: ThemeId;
  onOpen: () => void;
}) {
  const t = useT();
  const picture = useThumbnail(sample, theme, index);
  const tables = useMemo(() => createSample(sample.id).Tables.length, [sample.id]);
  return (
    <button
      type="button"
      className="sample-card"
      data-sample={sample.id}
      title={`${sampleName(sample, language)} — ${sampleDescription(sample, language)}`}
      onClick={onOpen}
    >
      <span className="sample-thumb">
        {picture ? <img src={picture} alt="" draggable={false} /> : <Icons.Database />}
      </span>
      <span className="sample-text">
        <span className="sample-name">{sampleName(sample, language)}</span>
        <span className="sample-desc">{sampleDescription(sample, language)}</span>
        <span className="sample-meta">
          <span className="sample-db" style={{ background: getHeaderColor(sample.db) }}>
            {getDbDisplayName(sample.db)}
          </span>
          <span>{t('StartTables', tables)}</span>
        </span>
      </span>
    </button>
  );
}

// ── The moving background ──────────────────────────────────────────────────

function useAnimatedBackground(
  canvas: HTMLCanvasElement | null,
  theme: ThemeId,
  background: StartBackgroundPrefs,
): AnimatedBackground | null {
  const [instance, setInstance] = useState<AnimatedBackground | null>(null);
  const settings = useRef(background);
  settings.current = background;
  const themeRef = useRef(theme);
  themeRef.current = theme;

  useEffect(() => {
    if (!canvas) return;
    const bg = new AnimatedBackground(canvas, {
      vivid: true,
      kind: settings.current.Kind,
      speed: () => settings.current.Speed / 100,
      colors: () => {
        const def = getTheme(themeRef.current);
        const p = def.palette;
        return {
          bg: toHex(p.appBackground),
          accent: toHex(p.accent),
          accent2: toHex(p.canvasFkText),
          text: toHex(p.textSecondary),
          dark: def.kind === 'dark',
        };
      },
    });
    setInstance(bg);
    return () => {
      bg.destroy();
      setInstance(null);
    };
  }, [canvas]);

  useEffect(() => {
    if (!instance) return;
    instance.setKind(background.Kind);
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (background.On && !reduced) instance.start();
    else {
      instance.stop();
      instance.draw();
    }
  }, [instance, background.Kind, background.On]);

  // A theme change repaints a still background at once.
  useEffect(() => {
    instance?.draw();
  }, [instance, theme]);

  return instance;
}

// ── Cards ──────────────────────────────────────────────────────────────────

interface CardProps {
  id: string;
  icon: ReactNode;
  title: string;
  extra?: ReactNode;
  children: ReactNode;
  span: number;
  height: number | undefined;
  dragging: boolean;
  dropTarget: boolean;
  onGrab: (id: string, e: React.PointerEvent) => void;
  onResizeStart: (id: string, e: React.PointerEvent) => void;
  onFit: (id: string) => void;
}

function BoardCard(p: CardProps) {
  const t = useT();
  const style: CSSProperties = { gridColumn: `span ${p.span}`, height: p.height ? `${p.height}px` : undefined };
  return (
    <section
      className={`start-card board-card${p.height ? ' fixed-height' : ''}${p.dragging ? ' drag-origin' : ''}${p.dropTarget ? ' drop-target' : ''}`}
      data-card={p.id}
      style={style}
    >
      <h2 className="board-card-head">
        <button
          type="button"
          className="card-handle"
          title={t('StartMoveCard')}
          aria-label={t('StartMoveCard')}
          onPointerDown={(e) => p.onGrab(p.id, e)}
        >
          <Icons.Grip />
        </button>
        {p.icon}
        <span className="board-card-title">{p.title}</span>
        {p.extra}
      </h2>
      <div className="board-card-body">{p.children}</div>
      <span
        className="card-resize"
        title={t('StartResizeCard')}
        onPointerDown={(e) => p.onResizeStart(p.id, e)}
        onDoubleClick={() => p.onFit(p.id)}
      />
    </section>
  );
}

const ANIMATION_LABELS: Record<string, [string, string]> = {
  aurora: ['오로라', 'Aurora'],
  waves: ['물결', 'Waves'],
  particles: ['입자', 'Particles'],
  constellation: ['별자리', 'Constellation'],
  bubbles: ['거품', 'Bubbles'],
  gridflow: ['흐르는 격자', 'Flowing grid'],
  flowchart: ['순서도', 'Flowchart'],
  starfield: ['별빛', 'Star field'],
  rain: ['비', 'Rain'],
  snow: ['눈', 'Snow'],
  fireflies: ['반딧불', 'Fireflies'],
  ripples: ['파문', 'Ripples'],
  coderain: ['코드 비', 'Code rain'],
  hexagons: ['육각 격자', 'Hexagons'],
  orbits: ['궤도', 'Orbits'],
  lava: ['라바 램프', 'Lava lamp'],
  spiral: ['은하 나선', 'Spiral galaxy'],
  confetti: ['색종이', 'Confetti'],
  nodes: ['노드 네트워크', 'Node network'],
  ribbons: ['리본', 'Ribbons'],
};

export function animationLabel(kind: string, language: Language): string {
  const pair = ANIMATION_LABELS[kind];
  return pair ? pair[language === 'en' ? 1 : 0] : kind;
}

function intervalLabel(seconds: number): string {
  if (!seconds) return translate('StartIntervalOff');
  return seconds < 60 ? translate('StartIntervalSeconds', seconds) : translate('StartIntervalMinutes', seconds / 60);
}

function Stepper({ label, field, value, min, max, step, onChange }: {
  label: string;
  field: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="start-slider" title={label}>
      <span>{label}</span>
      <button type="button" className="step" aria-label="−" onClick={() => onChange(Math.max(min, value - step))}>
        <Icons.Minus />
      </button>
      <input type="range" min={min} max={max} step={step} data-field={field} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <button type="button" className="step" aria-label="+" onClick={() => onChange(Math.min(max, value + step))}>
        <Icons.Plus />
      </button>
      <output>{value}%</output>
    </label>
  );
}

// ── The screen ─────────────────────────────────────────────────────────────

export function StartScreen(props: Props) {
  const t = useT();
  const { language, theme, recentFiles, background, layout } = props;
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const animation = useAnimatedBackground(canvas, theme, background);
  const boardRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ id: string; over: string | null } | null>(null);
  const [preview, setPreview] = useState<StartLayoutPrefs | null>(null);
  const shown = preview ?? layout;

  const { onBackgroundChange, onLayoutChange, onClose } = props;
  const setBackground = useCallback(
    (patch: Partial<StartBackgroundPrefs>) => onBackgroundChange({ ...background, ...patch }),
    [onBackgroundChange, background],
  );

  // Escape returns to the editor, as the Home button does.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // The automatic change, at the chosen interval, while the start screen is open.
  const latest = useRef(background);
  latest.current = background;
  useEffect(() => {
    if (!background.On || !background.Interval) return;
    const timer = window.setInterval(() => {
      onBackgroundChange({ ...latest.current, Kind: randomAnimation(latest.current.Kind) });
    }, background.Interval * 1000);
    return () => window.clearInterval(timer);
  }, [background.On, background.Interval, onBackgroundChange]);

  // ── moving a card: a see-through copy follows the pointer ──
  const grab = useCallback(
    (id: string, e: React.PointerEvent) => {
      e.preventDefault();
      const card = boardRef.current?.querySelector<HTMLElement>(`[data-card="${id}"]`);
      if (!card) return;
      const ghost = card.cloneNode(true) as HTMLElement;
      const rect = card.getBoundingClientRect();
      ghost.classList.add('card-ghost');
      Object.assign(ghost.style, { width: `${rect.width}px`, height: `${rect.height}px`, left: `${rect.left}px`, top: `${rect.top}px` });
      document.body.appendChild(ghost);
      const dx = e.clientX - rect.left;
      const dy = e.clientY - rect.top;
      let over: string | null = null;
      setDrag({ id, over: null });
      const move = (ev: PointerEvent) => {
        ghost.style.left = `${ev.clientX - dx}px`;
        ghost.style.top = `${ev.clientY - dy}px`;
        ghost.style.display = 'none';
        const under = (document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null)?.closest<HTMLElement>('.board-card');
        ghost.style.display = '';
        const next = under && under.dataset.card !== id ? (under.dataset.card ?? null) : null;
        if (next !== over) {
          over = next;
          setDrag({ id, over });
        }
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        ghost.remove();
        setDrag(null);
        if (over) {
          const from = layout.Order.indexOf(id);
          const to = layout.Order.indexOf(over);
          const order = layout.Order.filter((x) => x !== id);
          const at = order.indexOf(over);
          // Dropped on a card further down: it goes after it; further up: before it.
          order.splice(from < to ? at + 1 : at, 0, id);
          onLayoutChange({ ...layout, Order: order });
        }
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    },
    [layout, onLayoutChange],
  );

  // ── resizing a card from its corner ──
  const resizeStart = useCallback(
    (id: string, e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const board = boardRef.current;
      const card = board?.querySelector<HTMLElement>(`[data-card="${id}"]`);
      if (!board || !card) return;
      const rect = card.getBoundingClientRect();
      const column = (board.clientWidth - GAP * (COLUMNS - 1)) / COLUMNS;
      // Sized from where the drag began, never from per-event deltas.
      const startX = e.clientX;
      const startY = e.clientY;
      let next = layout;
      const move = (ev: PointerEvent) => {
        const width = rect.width + (ev.clientX - startX);
        const span = Math.max(1, Math.min(COLUMNS, Math.round((width + GAP) / (column + GAP))));
        const height = Math.max(120, Math.round(rect.height + (ev.clientY - startY)));
        next = { ...layout, Span: { ...layout.Span, [id]: span }, Height: { ...layout.Height, [id]: height } };
        setPreview(next);
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        setPreview(null);
        if (next !== layout) onLayoutChange(next);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    },
    [layout, onLayoutChange],
  );

  const fit = useCallback(
    (id: string) => {
      const height = { ...layout.Height };
      delete height[id];
      onLayoutChange({ ...layout, Span: { ...layout.Span, [id]: DEFAULT_START_LAYOUT.Span[id] }, Height: height });
    },
    [layout, onLayoutChange],
  );

  const action = (id: string, icon: ReactNode, label: string, hint: string, onClick: () => void) => (
    <button type="button" className="start-action" data-start-action={id} title={`${label} — ${hint}`} onClick={onClick}>
      <span className="start-action-icon">{icon}</span>
      <span className="start-action-text">
        <span className="start-action-label">{label}</span>
        <span className="start-action-hint">{hint}</span>
      </span>
    </button>
  );

  const bodies: Record<string, { icon: ReactNode; title: string; extra?: ReactNode; body: ReactNode }> = {
    create: {
      icon: <Icons.New />,
      title: t('StartCreate'),
      body: (
        <div className="start-actions">
          {action('new', <Icons.New />, t('MenuNew'), t('StartNewHint'), props.onNew)}
          {action('open', <Icons.Open />, t('MenuOpen'), t('StartOpenHint'), props.onOpenProject)}
          {action('open-db', <Icons.Database />, t('MenuOpenDatabase'), t('StartOpenDbHint'), props.onOpenDatabase)}
          {action('open-ws', <Icons.Open />, t('MenuOpenWorkspace'), t('StartOpenWsHint'), props.onOpenWorkspace)}
        </div>
      ),
    },
    recent: {
      icon: <Icons.Recent />,
      title: t('MenuRecentFiles'),
      body:
        recentFiles.length === 0 ? (
          <p className="start-empty">{t('StartNoRecent')}</p>
        ) : (
          <ul className="start-recent-list">
            {recentFiles.slice(0, 10).map((path) => (
              <li key={path}>
                <button type="button" title={path} onClick={() => props.onOpenRecent(path)}>
                  <Icons.Doc />
                  <span className="start-recent-name">{baseName(path)}</span>
                  <span className="start-recent-path">{path}</span>
                </button>
              </li>
            ))}
          </ul>
        ),
    },
    help: {
      icon: <Icons.Help />,
      title: t('StartHelp'),
      body: (
        <div className="start-actions">
          {action('guide', <Icons.Book />, t('MenuUserGuide'), t('StartGuideHint'), props.onUserGuide)}
          {action('tutorial', <Icons.Tutorial />, t('MenuTutorial'), t('StartTutorialHint'), props.onTutorial)}
          {action('themes', <Icons.Palette />, t('ThemeSettingsTitle'), t('StartThemesHint'), props.onThemes)}
        </div>
      ),
    },
    samples: {
      icon: <Icons.Examples />,
      title: t('StartExamples', SAMPLES.length),
      body: (
        <div className="sample-grid">
          {SAMPLES.map((sample, index) => (
            <SampleCard
              key={sample.id}
              sample={sample}
              index={index}
              language={language}
              theme={theme}
              onOpen={() => props.onOpenSample(sample.id)}
            />
          ))}
        </div>
      ),
    },
    background: {
      icon: <Icons.Palette />,
      title: t('StartBackground'),
      extra: (
        <label className="start-switch" title={t('StartBackgroundOnTip')}>
          <input type="checkbox" data-field="start-bg-on" checked={background.On} onChange={(e) => setBackground({ On: e.target.checked })} />
          <span>{t('StartBackgroundOn')}</span>
        </label>
      ),
      body: (
        <>
          <div className="anim-chips" role="radiogroup" aria-label={t('StartBackground')}>
            {ANIMATIONS.map((kind) => (
              <button
                key={kind}
                type="button"
                role="radio"
                aria-checked={background.Kind === kind}
                data-animation={kind}
                className={`anim-chip ${background.Kind === kind ? 'active' : ''}`}
                onClick={() => setBackground({ Kind: kind, On: true })}
              >
                <AnimationIcon kind={kind} />
                <span>{animationLabel(kind, language)}</span>
              </button>
            ))}
          </div>
          <div className="start-bg-controls">
            <button
              type="button"
              className="btn"
              data-action="shuffle-bg"
              title={t('StartShuffleTip')}
              onClick={() => setBackground({ Kind: animation?.shuffle() ?? randomAnimation(background.Kind), On: true })}
            >
              <Icons.Reset />
              <span>{t('StartShuffle')}</span>
            </button>
            <Stepper label={t('StartSpeed')} field="start-speed" value={background.Speed} min={0} max={300} step={10} onChange={(v) => setBackground({ Speed: v })} />
            <Stepper label={t('StartCardOpacity')} field="start-opacity" value={background.CardOpacity} min={20} max={100} step={5} onChange={(v) => setBackground({ CardOpacity: v })} />
            <label className="start-check" title={t('StartRandomTip')}>
              <input type="checkbox" data-field="start-random" checked={background.RandomOnStart} onChange={(e) => setBackground({ RandomOnStart: e.target.checked })} />
              <span>{t('StartRandom')}</span>
            </label>
            <label className="start-interval" title={t('StartIntervalTip')}>
              <Icons.Recent />
              <span>{t('StartInterval')}</span>
              <select data-field="start-interval" value={background.Interval} onChange={(e) => setBackground({ Interval: Number(e.target.value) })}>
                {START_INTERVALS.map((n) => (
                  <option key={n} value={n}>
                    {intervalLabel(n)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </>
      ),
    },
  };

  return (
    <div
      className="start-screen"
      role="region"
      aria-label={t('StartTitle')}
      style={{ '--start-card-alpha': `${background.CardOpacity}%` } as CSSProperties}
    >
      <canvas className="start-bg" ref={setCanvas} aria-hidden="true" />
      <div className="start-scroll">
        <div className="start-inner">
          {/* The title card stays where it is: it is not part of the board. */}
          <section className="start-card start-hero" data-card="hero">
            <img src={appIcon} alt="" className="start-hero-icon" draggable={false} />
            <div className="start-hero-text">
              <h1>{APP_TITLE}</h1>
              <p>{t('StartTagline')}</p>
              <span className="start-version">v{APP_VERSION}</span>
            </div>
            <span className="spacer" />
            <div className="start-hero-actions">
              <button
                type="button"
                className="btn"
                data-action="start-arrange"
                title={t('StartArrangeTip')}
                onClick={() => onLayoutChange({ Order: [...DEFAULT_START_LAYOUT.Order], Span: { ...DEFAULT_START_LAYOUT.Span }, Height: {} })}
              >
                <Icons.Arrange />
                <span>{t('StartArrange')}</span>
              </button>
              <button type="button" className="btn btn-primary" data-action="start-close" onClick={onClose}>
                <Icons.Edit />
                <span>{t('StartToEditor')}</span>
              </button>
            </div>
          </section>

          <div className="start-board" ref={boardRef}>
            {shown.Order.map((id) => {
              const card = bodies[id];
              if (!card) return null;
              return (
                <BoardCard
                  key={id}
                  id={id}
                  icon={card.icon}
                  title={card.title}
                  extra={card.extra}
                  span={shown.Span[id] ?? 1}
                  height={shown.Height[id]}
                  dragging={drag?.id === id}
                  dropTarget={drag?.over === id}
                  onGrab={grab}
                  onResizeStart={resizeStart}
                  onFit={fit}
                >
                  {card.body}
                </BoardCard>
              );
            })}
          </div>

          <footer className="start-footer">
            <label className="form-check">
              <input type="checkbox" checked={props.showOnStart} data-field="show-start" onChange={(e) => props.onShowOnStartChange(e.target.checked)} />
              {t('SettingsShowStartScreen')}
            </label>
            <span className="spacer" />
            <span className="start-foot-note">
              {APP_TITLE} · © SHKWON · {animationLabel(background.Kind, language)}
            </span>
          </footer>
        </div>
      </div>
    </div>
  );
}
