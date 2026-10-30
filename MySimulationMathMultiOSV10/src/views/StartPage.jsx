// The start page (MyCodeChecker's layout): a full-window animated background
// behind a hero card (icon, name, version, quick actions) and a board of
// movable / resizable cards — 새로 만들기 (tiles by category), 최근 파일,
// 배경 (kind, shuffle, speed, transparency), 도움말 and 샘플·예제. Background
// and card layout are kept in settings.startBackground.
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { COLS, ROW, GAP, cardsOf, rowsFor, layoutKey, layoutValue, place, compact, autoArrange, swapVertical } from '../lib/startLayout';
import { dragGhost } from '../lib/dragGhost';
import { hostInfo, baseName } from '../lib/backend';
import { t, useLanguage, getLanguage } from '../lib/i18n';
import { Icon } from '../components/Chrome';
import { useTabActive } from '../components/DocTabs';
import { Btn, Stepper, RangeStepper, Confirm } from './common';
import { SAMPLES, SAMPLE_CATEGORIES } from '../lib/samples';
import { MODEL_SAMPLES, MODEL_CATEGORIES } from '../lib/modelSamples';
import { AnimatedBackground, ANIMATION_KINDS, ANIMATION_ICONS, DEFAULT_START_BACKGROUND, themeColors } from '../lib/startBackground';

export function startBackgroundOf(settings) {
  return { ...DEFAULT_START_BACKGROUND, ...((settings && settings.startBackground) || {}) };
}

export const CARD_IDS = ['hero', 'templates', 'recent', 'side', 'help', 'models', 'samples'];
export const DEFAULT_SPAN = { hero: 3, templates: 2, recent: 1, side: 1, help: 2, models: 3, samples: 3 };

// 새로 만들기: [action, icon, name key, description key]
const GROUPS = [
  ['sp_g_code', [
    ['newScript', 'script', 'sp_t_script', 'sp_t_script_d'],
    ['newLive', 'runSection', 'sp_t_live', 'sp_t_live_d'],
    ['newFunction', 'code', 'sp_t_function', 'sp_t_function_d'],
    ['newClass', 'layers', 'sp_t_class', 'sp_t_class_d'],
  ]],
  ['sp_g_sim', [
    ['newModel', 'model', 'sp_t_model', 'sp_t_model_d'],
    ['openModel', 'folder', 'sp_t_open_model', 'sp_t_open_model_d'],
    ['library', 'library', 'sp_t_library', 'sp_t_library_d'],
  ]],
  ['sp_g_data', [
    ['import', 'import', 'sp_t_import', 'sp_t_import_d'],
    ['plots', 'chart', 'sp_t_plots', 'sp_t_plots_d'],
    ['figures', 'figure', 'sp_t_figures', 'sp_t_figures_d'],
    ['findFiles', 'search', 'sp_t_find', 'sp_t_find_d'],
  ]],
];

/** All background kinds as toggle buttons (icon + name) and 섞기 at the end. */
export function BgKindGrid({ bg, onChange, columns = 2 }) {
  useLanguage();
  const shuffling = (Number(bg.shuffleSec) || 0) > 0;
  return (
    <div className="bg-kinds" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }} role="radiogroup" aria-label={t('sp_background')}>
      {ANIMATION_KINDS.map((k) => (
        <button key={k} type="button" role="radio" aria-checked={bg.kind === k} className={`bg-kind ${bg.kind === k ? 'on' : ''}`} title={`${t(`anim_${k}`)} — ${t(`anim_${k}_d`)}`} onClick={() => onChange({ kind: k })}>
          <Icon name={ANIMATION_ICONS[k]} size={14} /><span>{t(`anim_${k}`)}</span>
        </button>
      ))}
      <button type="button" role="switch" aria-checked={shuffling} className={`bg-kind shuffle ${shuffling ? 'on' : ''}`} title={t('sp_shuffle_tip', { n: bg.shuffleSec || 20 })}
        onClick={() => onChange({ shuffleSec: shuffling ? 0 : 20 })}>
        <Icon name="dice" size={14} /><span>{t('sp_shuffle')}</span>
      </button>
    </div>
  );
}

/**
 * Sample thumbnail: the picture of the sample's real result,
 * public/samples/<id>.webp (npm run generate:samples), or the drawn curve
 * below when that file is missing.
 */
const SAMPLE_IMAGES = `${(import.meta.env && import.meta.env.BASE_URL) || './'}samples/`;
function SampleArt(props) {
  const [failed, setFailed] = useState(false);
  if (failed) return <SampleCurve {...props} />;
  return (
    <img className="sample-preview" src={`${SAMPLE_IMAGES}${props.id}.webp`} alt="" aria-hidden="true" loading="lazy" draggable={false}
      style={{ objectFit: 'contain' }} onError={() => setFailed(true)} />
  );
}

/** Fallback thumbnail: a curve typical of the sample drawn as an SVG path. */
function SampleCurve({ id, cat, color }) {
  const W = 160, H = 56;
  const pts = [];
  const f = {
    plot2d: (x) => Math.sin(x * 2.2) * 0.8,
    surface: (x) => Math.exp(-((x - 0.3) ** 2) * 1.5) * 1.6 - 0.8 + 0.25 * Math.sin(x * 4),
    ode: (x) => Math.tanh(4 * Math.sin(x * 1.6)) * 0.8,
    linalg: (x) => (Math.round(x * 2) / 2) * 0.25,
    signal: (x) => 0.5 * Math.sin(x * 9) + 0.3 * Math.sin(x * 23),
    control: (x) => 0.9 - Math.exp(-1.1 * (x + 3)) * Math.cos(3 * (x + 3)) * 1.6,
    stats: (x) => 1.6 * Math.exp(-(x * x) * 0.9) - 0.8,
    optim: (x) => 0.12 * x * x * x - 0.5 * x,
  }[id] || {
    basics: (x) => Math.round(Math.sin(x * 1.3) * 3) / 4,
    plot2d: (x) => Math.sin(x * 1.7) * Math.exp(-0.1 * x * x),
    plot3d: (x) => Math.cos(x * 2) * Math.exp(-0.15 * x * x),
    numerics: (x) => Math.exp(-0.3 * (x + 3)) * Math.cos(2.5 * x),
    linalg: (x) => 0.25 * x,
    signal: (x) => 0.6 * Math.sin(x * x * 1.5),
    stats: (x) => 1.6 * Math.exp(-(x * x) * 0.9) - 0.8,
    optim: (x) => 0.1 * x * x - 0.6,
    control: (x) => 0.9 - Math.exp(-0.8 * (x + 3)) * Math.cos(2 * (x + 3)) * 1.6,
    text: (x) => (Math.floor(x * 2) % 2 ? 0.5 : -0.5),
    program: (x) => Math.sign(Math.sin(x * 2)) * 0.6,
  }[cat] || ((x) => Math.sin(x));
  for (let i = 0; i <= 80; i++) {
    const x = -3 + (6 * i) / 80;
    const y = Math.max(-1, Math.min(1, f(x)));
    pts.push(`${((i / 80) * W).toFixed(1)},${(H / 2 - y * (H / 2 - 6)).toFixed(1)}`);
  }
  const grid = [];
  for (let k = 0; k <= 8; k++) grid.push(<line key={`v${k}`} x1={(k * W) / 8} y1={0} x2={(k * W) / 8} y2={H} />);
  for (let k = 0; k <= 3; k++) grid.push(<line key={`h${k}`} x1={0} y1={(k * H) / 3} x2={W} y2={(k * H) / 3} />);
  return (
    <svg className="sample-preview" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      <g stroke="currentColor" strokeOpacity="0.12" strokeWidth="0.6">{grid}</g>
      {cat === 'stats' ? pts.filter((_, i) => i % 4 === 0).map((p, i) => { const [x, y] = p.split(',').map(Number); return <rect key={i} x={x - 3} y={y} width={6} height={H - y} fill={color} fillOpacity="0.55" />; })
        : <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth="1.8" />}
    </svg>
  );
}

/**
 * The example model's real diagram: public/models/<id>.webp, drawn by the
 * model editor's renderer (npm run generate:models). Missing image: a sketch.
 */
const MODEL_IMAGES = `${(import.meta.env && import.meta.env.BASE_URL) || './'}models/`;
function ModelArt(props) {
  const [failed, setFailed] = useState(false);
  if (failed) return <ModelSketch {...props} />;
  return (
    <img className="sample-preview model-preview" src={`${MODEL_IMAGES}${props.id}.webp`} alt="" aria-hidden="true" loading="lazy" draggable={false}
      style={{ objectFit: 'contain' }} onError={() => setFailed(true)} />
  );
}

/** Fallback: blocks left to right, a feedback wire when the model has one. */
function ModelSketch({ color, n = 4, feedback }) {
  const W = 240, H = 64, bw = 34, bh = 22, y = 16;
  const xs = Array.from({ length: n }, (_, i) => 14 + (i * (W - 28 - bw)) / (n - 1));
  return (
    <svg className="sample-preview model-preview" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      {xs.slice(0, -1).map((x, i) => (
        <g key={`w${i}`} stroke={color} strokeWidth="1.4" fill="none"><path d={`M${x + bw},${y + bh / 2} H${xs[i + 1] - 4}`} /><path d={`M${xs[i + 1] - 7},${y + bh / 2 - 3} l4,3 l-4,3`} /></g>
      ))}
      {feedback && <path d={`M${xs[n - 2] + bw + 8},${y + bh / 2} V${H - 6} H${xs[1] - 10} V${y + bh / 2}`} stroke={color} strokeOpacity="0.7" strokeWidth="1.2" fill="none" strokeDasharray="3 2" />}
      {xs.map((x, i) => <rect key={i} x={x} y={y} width={bw} height={bh} rx="3" fill={color} fillOpacity={i === n - 1 ? 0.3 : 0.16} stroke={color} strokeWidth="1.2" />)}
    </svg>
  );
}

export function StartPage({ settings, recent = [], onAction, onRecentOpen, onRecentRemove, onRecentClear, onSample, onModelSample, showOnLaunch, onShowOnLaunch, onBackground }) {
  useLanguage();
  const [preview, setPreview] = useState(null);
  const bg = preview || startBackgroundOf(settings);
  const canvas = useRef(null);
  const anim = useRef(null);
  const speed = useRef(bg.speed);
  speed.current = bg.speed;
  const board = useRef(null);
  const [drag, setDrag] = useState(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [version, setVersion] = useState('');
  const [sampleCat, setSampleCat] = useState('all');
  const [modelCat, setModelCat] = useState('all');
  const shownModels = modelCat === 'all' ? MODEL_SAMPLES : MODEL_SAMPLES.filter((m) => m.cat === modelCat);
  const li = getLanguage() === 'ko' ? 0 : 1;
  const shownSamples = sampleCat === 'all' ? SAMPLES : SAMPLES.filter((s) => s.cat === sampleCat);
  useEffect(() => { hostInfo().then((i) => setVersion((i && i.version) || '')).catch(() => {}); }, []);
  // The start tab hidden behind another tab: the background pauses.
  const tabActive = useTabActive();
  useEffect(() => { if (!anim.current) return; if (tabActive) anim.current.start(); else anim.current.stop(); }, [tabActive]);

  useEffect(() => {
    const first = bg.random ? ANIMATION_KINDS[Math.floor(Math.random() * ANIMATION_KINDS.length)] : bg.kind;
    const a = new AnimatedBackground(canvas.current, { kind: first, speed: () => (speed.current || 0) / 100, colors: themeColors });
    anim.current = a;
    a.start();
    const observer = new MutationObserver(() => a.refreshColors());
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'class', 'data-theme'] });
    return () => { observer.disconnect(); a.destroy(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { if (anim.current) anim.current.setKind(bg.kind); }, [bg.kind]);
  // 섞기: a different kind every N seconds (0 = off); not saved, the chosen kind stays.
  useEffect(() => {
    const sec = Number(bg.shuffleSec) || 0;
    if (!sec) return undefined;
    const timer = setInterval(() => { if (anim.current) anim.current.shuffle(); }, sec * 1000);
    return () => clearInterval(timer);
  }, [bg.shuffleSec]);
  useEffect(() => { if (anim.current) anim.current.refreshColors(); }, [settings && settings.theme]);
  // Settings › 시작 화면 previews its draft here (null: back to the saved one).
  useEffect(() => {
    const on = (e) => setPreview(e.detail ? { ...DEFAULT_START_BACKGROUND, ...e.detail } : null);
    window.addEventListener('msm-start-bg-preview', on);
    const onArrange = () => arrangeRef.current();
    window.addEventListener('msm-start-arrange', onArrange);
    return () => { window.removeEventListener('msm-start-bg-preview', on); window.removeEventListener('msm-start-arrange', onArrange); };
  }, []);

  const save = (patch) => onBackground({ ...startBackgroundOf(settings), ...patch });
  // Card layout: explicit cells on a 3-column grid of 20 px rows (lib/startLayout).
  const [measured, setMeasured] = useState({});
  const arrangeRef = useRef(() => {});
  const burst = useRef({ at: 0, n: 0 });
  const visibleIds = CARD_IDS;
  const saved = cardsOf(bg.layout, visibleIds, DEFAULT_SPAN, measured);
  const pending = drag && drag.target ? place(saved, drag.id, drag.target) : null;
  const shown = pending || saved;
  const saveLayout = (cards) => save({ layout: layoutValue(compact(cards)) });
  const arrange = () => saveLayout(autoArrange(visibleIds, DEFAULT_SPAN, measured));
  arrangeRef.current = arrange;
  const ghost = useRef(null);
  useEffect(() => () => { if (ghost.current) ghost.current.destroy(); }, []);

  // Fit cards: the height follows the content (measured, in rows).
  const measure = useCallback(() => {
    if (!board.current) return;
    const next = {};
    for (const el of board.current.querySelectorAll(':scope > .start-card.fit')) next[el.dataset.card] = rowsFor(el.offsetHeight);
    // Growing always applies; shrinking by one row is ignored (no flip-flop), and a run-away stops after a burst.
    const now = performance.now();
    if (now - burst.current.at > 1000) burst.current = { at: now, n: 0 };
    if (burst.current.n > 12) return;
    setMeasured((m) => {
      const changed = Object.keys(next).filter((k) => m[k] === undefined || next[k] > m[k] || m[k] - next[k] > 1);
      if (!changed.length) return m;
      burst.current.n += 1;
      return { ...m, ...Object.fromEntries(changed.map((k) => [k, next[k]])) };
    });
  }, []);
  useLayoutEffect(() => { measure(); });
  useEffect(() => {
    if (!board.current || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => measure());
    for (const el of board.current.querySelectorAll(':scope > .start-card')) ro.observe(el);
    return () => ro.disconnect();
  }, [measure]);

  // Other cards slide to their new places (FLIP).
  const rects = useRef(new Map());
  const shownKey = layoutKey(shown);
  useLayoutEffect(() => {
    if (!board.current) return;
    const now = new Map();
    for (const el of board.current.querySelectorAll(':scope > .start-card')) {
      const r = el.getBoundingClientRect();
      now.set(el.dataset.card, r);
      const old = rects.current.get(el.dataset.card);
      if (!old || el.classList.contains('drag-origin') || !el.animate) continue;
      const dx = old.left - r.left;
      const dy = old.top - r.top;
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }], { duration: 180, easing: 'ease-out' });
    }
    rects.current = now;
  }, [shownKey]);

  const cellAt = (x, y, w) => {
    const r = board.current.getBoundingClientRect();
    const colW = (r.width - GAP * (COLS - 1)) / COLS;
    return { col: Math.max(0, Math.min(COLS - w, Math.round((x - r.left) / (colW + GAP)))), row: Math.max(0, Math.round((y - r.top) / ROW)) };
  };
  const autoScroll = (ev) => {
    const sc = board.current && board.current.closest('.start-scroll');
    if (!sc) return;
    const r = sc.getBoundingClientRect();
    if (ev.clientY > r.bottom - 36) sc.scrollTop += 14;
    else if (ev.clientY < r.top + 36) sc.scrollTop -= 14;
  };
  const focusHandle = (id) => setTimeout(() => { const h = board.current && board.current.querySelector(`[data-card="${id}"] .card-handle`); if (h) h.focus(); }, 30);
  // Keyboard on a card's ⠿ handle: Alt+arrows move one cell, Alt+Shift+arrows resize.
  const keyMove = (e, id) => {
    if (!e.altKey || !e.key.startsWith('Arrow')) return;
    e.preventDefault();
    const c = { ...saved[id] };
    const dx = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
    const dy = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
    if (e.shiftKey) {
      c.w = Math.max(1, Math.min(COLS - c.col, c.w + dx));
      if (dy) { c.h = Math.max(4, c.h + dy); c.fit = false; }
    } else if (dy) {
      saveLayout(swapVertical(saved, id, dy));
      focusHandle(id);
      return;
    } else {
      c.col = Math.max(0, Math.min(COLS - c.w, c.col + dx));
    }
    saveLayout(place(saved, id, c));
    focusHandle(id);
  };

  const startMove = (e, id) => {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    const el = e.currentTarget.closest('.start-card');
    const g = dragGhost(el, e, { container: board.current });
    ghost.current = g;
    const c = saved[id];
    setDrag({ id, mode: 'move', target: { col: c.col, row: c.row } });
    let target = { col: c.col, row: c.row };
    const move = (ev) => {
      g.move(ev);
      autoScroll(ev);
      const p = g.topLeft();
      const next = cellAt(p.x, p.y, c.w);
      if (next.col !== target.col || next.row !== target.row) { target = next; setDrag({ id, mode: 'move', target }); }
    };
    const up = (ev) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      g.destroy();
      ghost.current = null;
      setDrag(null);
      if (ev.type === 'pointerup' && (target.col !== c.col || target.row !== c.row)) saveLayout(place(saved, id, target));
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };
  const startResize = (e, id) => {
    e.preventDefault();
    e.stopPropagation();
    const card = e.currentTarget.parentElement;
    const rect = card.getBoundingClientRect();
    const b = board.current.getBoundingClientRect();
    const colW = (b.width - GAP * (COLS - 1)) / COLS;
    const c = saved[id];
    let target = { w: c.w, h: c.h };
    setDrag({ id, mode: 'resize', target });
    const move = (ev) => {
      autoScroll(ev);
      const w = Math.max(1, Math.min(COLS - c.col, Math.round((rect.width + ev.clientX - e.clientX + GAP) / (colW + GAP))));
      const h = Math.max(4, Math.round((rect.height + ev.clientY - e.clientY + GAP) / ROW));
      if (w !== target.w || h !== target.h) { target = { w, h }; setDrag({ id, mode: 'resize', target: { ...target, fit: false } }); }
    };
    const up = (ev) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      setDrag(null);
      if (ev.type === 'pointerup' && (target.w !== c.w || target.h !== c.h)) saveLayout(place(saved, id, { ...target, fit: false }));
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };
  const fitCard = (id) => saveLayout(place(saved, id, { fit: true }));

  const cell = (c) => ({ gridColumn: `${c.col + 1} / span ${c.w}`, gridRow: `${c.row + 1} / span ${c.h}` });
  const handle = (id) => (
    <button type="button" className="card-handle" title={`${t('sp_move_card')} (Alt+←↑↓→ · Alt+Shift: ${t('sp_resize_card')})`} aria-label={t('sp_move_card')} onPointerDown={(e) => startMove(e, id)}
      onKeyDown={(e) => keyMove(e, id)}>⠿</button>
  );
  const card = (id, cls, icon, title, body, extra, bare) => {
    const mine = drag && drag.id === id;
    const origin = mine && drag.mode === 'move';
    const c = mine ? saved[id] : shown[id];
    const fit = c.fit;
    return (
      <section key={id} data-card={id} className={`start-card ${cls} ${bare ? 'bare' : ''} ${fit ? 'fit' : 'fixed-height'} ${origin ? 'drag-origin' : ''} ${mine && drag.mode === 'resize' ? 'resizing' : ''}`}
        style={{ ...cell(c), height: fit ? undefined : `${c.h * ROW - GAP}px` }}>
        {bare ? <span className="card-handle-float">{handle(id)}</span> : (
          <h2>
            {handle(id)}
            <span className="icon"><Icon name={icon} size={15} /></span><span>{title}</span><span className="grow" />{extra}
          </h2>
        )}
        <div className="card-body">{body}</div>
        <span className="card-resize" title={`${t('sp_resize_card')} (Alt+Shift+←↑↓→)`} onPointerDown={(e) => startResize(e, id)} onDoubleClick={() => fitCard(id)} />
      </section>
    );
  };
  const dropOutline = drag && drag.target ? <div key="drop-outline" className="card-drop-outline" aria-hidden="true" style={{ ...cell(shown[drag.id]), height: `${shown[drag.id].h * ROW - GAP}px` }} /> : null;

  const cards = {
    hero: card('hero', 'start-hero', 'home', '', (
      <>
        <img src="./icon.svg" alt="" className="start-icon" />
        <div>
          <h1>MySimulationMath {version && <small>v{version}</small>}</h1>
          <p>{t('sp_tagline')}</p>
        </div>
        <div className="start-hero-actions" data-tour="start-hero-docs">
          <div className="start-docs">
            <Btn icon="graduation" label={t('sp_tutorial_run')} title={t('sp_tutorial_run_tip')} onClick={() => onAction('tutorial')} />
            <Btn icon="book" label={t('sp_guide')} title={t('sp_guide_tip')} onClick={() => onAction('guide')} />
            <Btn icon="file" label={t('sp_tutorial_doc')} title={t('sp_tutorial_doc_tip')} onClick={() => onAction('tutorialDoc')} />
          </div>
          <div className="start-docs">
            <Btn icon="folder" label={t('rb_open')} onClick={() => onAction('open')} />
            <Btn icon="model" label={t('sp_t_model')} onClick={() => onAction('newModel')} />
          </div>
          <Btn icon="script" label={t('sp_t_script')} primary onClick={() => onAction('newScript')} />
        </div>
      </>
    ), null, true),
    templates: card('templates', 'templates', 'plus', t('sp_new'), (
      <div className="template-groups">
        {GROUPS.map(([g, items]) => (
          <div key={g} className="template-group">
            <p className="template-group-title">{t(g)}</p>
            {items.map(([action, icon, name, desc]) => (
              <button key={name} type="button" className="template-tile" title={t(desc)} onClick={() => onAction(action)}>
                <span className="icon"><Icon name={icon} size={18} /></span><b>{t(name)}</b><small>{t(desc)}</small>
              </button>
            ))}
          </div>
        ))}
      </div>
    )),
    recent: card('recent', 'recent', 'history', t('sp_recent'), (
      <div className="start-list">
        {recent.length === 0 && <div className="start-empty"><Icon name="info" size={13} /><span>{t('sp_recent_empty')}</span></div>}
        {recent.slice(0, 12).map((r, i) => (
          <div key={r.path} className="start-row">
            <button type="button" className="start-link" title={r.path} onClick={() => onRecentOpen(r)}>
              <span className="icon"><img src={r.kind === 'model' ? './model-file.svg' : './m-file.svg'} alt="" width={16} height={16} /></span>
              <span className="name">{i + 1}. {baseName(r.path)}</span>
              <span className="path">{r.path}</span>
            </button>
            <button type="button" className="icon-btn close-x" title={t('sp_recent_remove')} aria-label={t('sp_recent_remove')} onClick={() => onRecentRemove(r.path)}><Icon name="close" size={12} /></button>
          </div>
        ))}
      </div>
    ), recent.length ? <button type="button" className="small-button danger" onClick={() => setConfirmClear(true)}><Icon name="trash" size={12} /> {t('sp_recent_clear')}</button> : null),
    help: card('help', 'help', 'book', t('sp_help'), (
      <div className="start-help">
        {[['guide', 'book', 'sp_guide'], ['tutorial', 'graduation', 'sp_tutorial_run'], ['tutorialDoc', 'file', 'sp_tutorial_doc'], ['helpCmd', 'info', 'sp_h_help'],['functions', 'list', 'sp_h_functions'], ['shortcuts', 'key', 'sp_h_shortcuts'], ['prefs', 'settings', 'rb_prefs'], ['about', 'star', 'about']].map(([action, icon, label]) => (
          <button key={label} type="button" className="start-link compact" title={t(label)} onClick={() => onAction(action)}><span className="icon"><Icon name={icon} size={15} /></span><span className="name">{t(label)}</span><span /></button>
        ))}
      </div>
    )),
    side: card('side', 'side', 'sparkle', t('sp_background'), (
      <>
        <BgKindGrid bg={bg} columns={2} onChange={save} />
        <div className="start-speed"><span className="icon"><Icon name="gauge" size={14} /></span><span>{t('sp_speed')}</span></div>
        <RangeStepper value={bg.speed} min={0} max={300} step={10} unit="%" ariaLabel={t('sp_speed')} onChange={(v) => save({ speed: v })} />
        <div className="start-speed"><span className="icon"><Icon name="eye" size={14} /></span><span>{t('sp_transparency')}</span></div>
        <RangeStepper value={bg.transparency} min={0} max={100} step={5} unit="%" ariaLabel={t('sp_transparency')} onChange={(v) => save({ transparency: v })} />
        <div className="start-speed"><span className="icon"><Icon name="dice" size={14} /></span><span>{t('sp_shuffle_every')}</span><Stepper value={bg.shuffleSec || 0} min={0} max={600} step={5} width={52} ariaLabel={t('sp_shuffle_every')} onChange={(v) => save({ shuffleSec: v })} /><span className="unit">{t('sp_seconds')}</span></div>
        <label className="start-check"><input type="checkbox" checked={!!bg.random} onChange={(e) => save({ random: e.target.checked })} /><span>{t('sp_random')}</span></label>
      </>
    )),
    models: card('models', 'start-models', 'model', `${t('sp_models')} (${shownModels.length}/${MODEL_SAMPLES.length})`, (
      <>
        <p className="start-models-note small">{t('sp_models_note')}</p>
        <div className="sample-cats" role="radiogroup" aria-label={t('sp_models')}>
          {[{ id: 'all', icon: 'apps', name: [t('sp_all'), t('sp_all')] }, ...MODEL_CATEGORIES].map((c) => (
            <button key={c.id} type="button" role="radio" aria-checked={modelCat === c.id} className={`bg-kind sample-cat ${modelCat === c.id ? 'on' : ''}`} onClick={() => setModelCat(c.id)}>
              <Icon name={c.icon} size={13} /><span>{c.name[li]}</span><small>{c.id === 'all' ? MODEL_SAMPLES.length : MODEL_SAMPLES.filter((m) => m.cat === c.id).length}</small>
            </button>
          ))}
        </div>
        <div className="start-sample-grid">
          {shownModels.map((m) => (
            <div key={m.id} className="start-sample start-model" role="button" tabIndex={0} data-model={m.id} title={m.desc[li]} onClick={() => onModelSample(m, false)} onKeyDown={(e) => { if (e.key === 'Enter') onModelSample(m, false); }}>
              <ModelArt id={m.id} color={m.color} n={Math.min(5, Math.max(2, m.blocks - 1))} feedback={m.feedback} />
              <b><Icon name="model" size={12} /> {m.name[li]}</b>
              <span className="tags">{m.tags.map((tag) => <span key={tag} className="tag">{tag}</span>)}
                <button type="button" className="sample-run" title={t('sp_model_code')} aria-label={t('sp_model_code')} onClick={(e) => { e.stopPropagation(); onModelSample(m, true); }}><Icon name="code" size={10} /></button>
              </span>
              <small>{m.desc[li]}</small>
            </div>
          ))}
        </div>
      </>
    )),
    samples: card('samples', 'start-samples', 'grid', `${t('sp_samples')} (${shownSamples.length}/${SAMPLES.length})`, (
      <>
        <div className="sample-cats" role="radiogroup" aria-label={t('sp_samples')}>
          {[{ id: 'all', icon: 'apps', name: [t('sp_all'), t('sp_all')] }, ...SAMPLE_CATEGORIES].map((c) => (
            <button key={c.id} type="button" role="radio" aria-checked={sampleCat === c.id} className={`bg-kind sample-cat ${sampleCat === c.id ? 'on' : ''}`} onClick={() => setSampleCat(c.id)}>
              <Icon name={c.icon} size={13} /><span>{c.name[li]}</span><small>{c.id === 'all' ? SAMPLES.length : SAMPLES.filter((s) => s.cat === c.id).length}</small>
            </button>
          ))}
        </div>
        <div className="start-sample-grid">
          {shownSamples.map((s) => (
            <div key={s.id} className="start-sample" role="button" tabIndex={0} title={s.desc[li]} onClick={() => onSample(s, false)} onKeyDown={(e) => { if (e.key === 'Enter') onSample(s, false); }}>
              <SampleArt id={s.id} cat={s.cat} color={s.color} />
              <b><Icon name={s.icon} size={12} /> {s.name[li]}</b>
              <span className="tags">{s.tags.map((tag) => <span key={tag} className="tag">{tag}</span>)}
                <button type="button" className="sample-run" title={t('sp_run_sample')} aria-label={t('sp_run_sample')} onClick={(e) => { e.stopPropagation(); onSample(s, true); }}><Icon name="play" size={10} /></button>
              </span>
              <small>{s.desc[li]}</small>
            </div>
          ))}
        </div>
      </>
    )),
  };

  return (
    <div className="start-page">
      <canvas ref={canvas} className="start-bg" aria-hidden="true" style={{ opacity: 1 - (bg.transparency || 0) / 100 }} />
      <div className="start-scroll">
        <div className="start-inner">
          <div className="start-tools"><Btn icon="grid" label={t('sp_auto_arrange')} title={t('sp_auto_arrange_tip')} onClick={arrange} /><Btn icon="close" label={t('sp_close')} title={t('sp_close_tip')} onClick={() => onAction('close')} /></div>
          <div className="start-grid start-board" ref={board}>{visibleIds.map((id) => cards[id]).filter(Boolean)}{dropOutline}</div>
          {confirmClear && <Confirm title={t('sp_recent_clear')} body={t('sp_recent_clear_confirm')} okLabel={t('sp_recent_clear')} danger onOk={() => { setConfirmClear(false); onRecentClear(); }} onCancel={() => setConfirmClear(false)} />}
          <footer className="start-foot">
            <label className="start-check"><input type="checkbox" checked={showOnLaunch} onChange={(e) => onShowOnLaunch(e.target.checked)} /><span>{t('sp_show')}</span></label>
            <span className="grow" />
            <span className="muted">© SHKWON (knix008@naver.com)</span>
          </footer>
        </div>
      </div>
    </div>
  );
}
