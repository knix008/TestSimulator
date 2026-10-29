// The guided tour (ported from MyCodeChecker). Renders nothing until started;
// then, in a portal on document.body, an outline round the step's target and a
// card (draggable by its head) with the step text, a progress bar, a chapter
// list, ⏮ (from the beginning), ◀ previous, ▶ / ⏸ auto play, next ▶ and
// "n / N". Keys: → / Space next, ← previous, Esc closes.
//
// Each step's `action` ops (src/lib/tutorialSteps.js) drive the real app
// through window.__msm.action (App.jsx) and the figure controller
// (window.__msmFigures), so a step looks the same whatever state the window
// was in. The engine is exposed as window.__msm.tutorial = { start, stop,
// next, prev, go, state, steps, chapters }. onProgress({ index, done }) is
// called when the tour stops (App saves settings.tutorial.done).
import React, { useEffect, useReducer, useRef } from 'react';
import { createPortal } from 'react-dom';
import { getLanguage, useLanguage } from '../lib/i18n';
import { onBroadcast } from '../lib/popups';
import { Icon, CloseButton } from './Chrome';
import { dragGhost } from '../lib/dragGhost';
import { STEPS, CHAPTERS, chapterName, stepText, dwellOf } from '../lib/tutorialSteps';
import '../tutorial.css';

const STORE = 'msm.tutorial';
const L = {
  ko: { title: '튜토리얼', close: '튜토리얼 닫기 (Esc)', restart: '처음부터', prev: '이전', next: '다음', done: '완료', play: '자동 재생', pause: '일시 정지', chapters: '장 목록', drag: '끌어서 옮기기', missing: '이 단계가 가리키는 화면 요소가 지금 창에 없습니다. 설명만 읽고 다음으로 넘어가세요.' },
  en: { title: 'Tutorial', close: 'Close the tutorial (Esc)', restart: 'From the beginning', prev: 'Previous', next: 'Next', done: 'Done', play: 'Auto play', pause: 'Pause', chapters: 'Chapters', drag: 'Drag to move', missing: 'The part of the window this step is about is not on screen now. Read the text and go on.' },
};
const tr = () => L[getLanguage() === 'en' ? 'en' : 'ko'];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const msm = () => {
  if (!window.__msm) window.__msm = {};
  return window.__msm;
};
const ours = (el) => !!(el && el.closest && el.closest('.msm-tour-layer'));
const visible = (el) => {
  if (!el || ours(el)) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
};
/** The first selector of the list with an element on screen. */
export function findTarget(selectors) {
  for (const sel of selectors || []) {
    let list = [];
    try { list = Array.from(document.querySelectorAll(sel)); } catch { /* bad selector */ }
    const el = list.find(visible);
    if (el) return el;
  }
  return null;
}
function firstMatch(selector) {
  try { return Array.from(document.querySelectorAll(selector)).find(visible) || null; } catch { return null; }
}
async function waitFor(check, timeout = 10000, every = 120) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    try { if (await check()) return true; } catch { /* keep waiting */ }
    await sleep(every);
  }
  return false;
}
function loadProgress() {
  try { return JSON.parse(localStorage.getItem(STORE) || 'null'); } catch { return null; }
}
function saveProgress(p) {
  try { localStorage.setItem(STORE, JSON.stringify({ ...p, at: new Date().toISOString() })); } catch { /* storage blocked */ }
}

/** The tour engine (one per page). React only draws what it says. */
class Engine {
  constructor() {
    this.active = false;
    this.index = 0;
    this.busy = false;
    this.autoplay = false;
    this.missing = false;
    this.timer = null;
    this.run = 0;
    this.listeners = new Set();
    this.onProgress = null;
  }

  emit() { this.listeners.forEach((fn) => fn()); }

  state() {
    const step = STEPS[this.index];
    return { active: this.active, index: this.index, busy: this.busy, autoplay: this.autoplay, total: STEPS.length, chapter: step && step.chapter, id: step && step.id, missing: this.missing };
  }

  start({ index, autoplay = false, resume = false } = {}) {
    let at = index;
    if (at == null) {
      const saved = resume ? loadProgress() : null;
      at = saved && !saved.done && Number.isFinite(saved.index) ? saved.index : 0;
    }
    this.autoplay = !!autoplay;
    window.dispatchEvent(new CustomEvent('msm-tour-start'));
    this.active = true;
    return this.go(at);
  }

  async stop() {
    if (!this.active) return;
    clearTimeout(this.timer);
    this.run += 1;
    const done = this.index >= STEPS.length - 1;
    this.active = false;
    this.autoplay = false;
    this.busy = false;
    this.emit();
    saveProgress({ index: this.index, done });
    try { if (this.onProgress) this.onProgress({ index: this.index, done }); } catch { /* the app saves it */ }
  }

  next() { return this.index < STEPS.length - 1 ? this.go(this.index + 1) : this.stop(); }

  prev() { return this.index > 0 ? this.go(this.index - 1) : undefined; }

  toggleAutoplay() {
    this.autoplay = !this.autoplay;
    clearTimeout(this.timer);
    if (this.autoplay && !this.busy) this.schedule();
    this.emit();
  }

  schedule() {
    clearTimeout(this.timer);
    if (!this.autoplay || !this.active) return;
    if (this.index >= STEPS.length - 1) { this.autoplay = false; this.emit(); return; }
    this.timer = setTimeout(() => { if (this.active && this.autoplay && !this.busy) this.next(); }, dwellOf(STEPS[this.index], getLanguage()));
  }

  async go(index) {
    clearTimeout(this.timer);
    const run = ++this.run;
    this.index = Math.max(0, Math.min(STEPS.length - 1, Number(index) || 0));
    const step = STEPS[this.index];
    this.busy = true;
    this.missing = false;
    this.emit();
    saveProgress({ index: this.index, done: false });
    try {
      await this.closeMenus();
      for (const op of step.action || []) {
        if (run !== this.run) return;
        // eslint-disable-next-line no-await-in-loop
        await this.op(op);
      }
    } catch (err) {
      console.warn('tutorial step', step.id, err);
    }
    await sleep(250);
    if (run !== this.run || !this.active) return;
    const el = findTarget(step.target);
    if (el) {
      const r = el.getBoundingClientRect();
      if (r.bottom > window.innerHeight || r.top < 0) el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
    this.missing = !el;
    this.busy = false;
    this.emit();
    this.schedule();
  }

  // ── ops ────────────────────────────────────────────
  act(id) { const a = msm().action; if (typeof a === 'function') return a(id); window.dispatchEvent(new CustomEvent('msm-action', { detail: id })); return undefined; }

  onStart() { return !!firstMatch('.start-page'); }

  fig(op) {
    const ctl = window.__msmFigures;
    if (!ctl) return;
    try {
      if (op === '2d' && ctl.is3d()) ctl.toggle2d3d();
      else if (op === '3d' && !ctl.is3d()) ctl.toggle2d3d();
      else if (op === 'grid') ctl.setGrid(true);
      else if (op === 'rulers') ctl.setRulers(true);
      else if (op === 'nogrid') { ctl.setGrid(false); ctl.setRulers(false); }
      else if (op === 'reset') ctl.resetView();
      else if (op.startsWith('mode:')) ctl.setMode(op.slice(5));
    } catch { /* no figure yet */ }
  }

  async closeMenus() {
    // Menus and dropdowns close on a window mouse down / click.
    window.dispatchEvent(new MouseEvent('mousedown'));
    window.dispatchEvent(new MouseEvent('click'));
    await sleep(60);
  }

  async op(raw) {
    const op = String(raw);
    const i = op.indexOf(':');
    const name = i < 0 ? op : op.slice(0, i);
    const arg = i < 0 ? '' : op.slice(i + 1);
    switch (name) {
      case 'start':
        if (!this.onStart()) { this.act('showStart'); await waitFor(() => this.onStart(), 3000); }
        await sleep(200);
        break;
      case 'desk':
        if (this.onStart()) { this.act('hideStart'); await waitFor(() => !this.onStart(), 3000); await sleep(200); }
        break;
      case 'act': await this.act(arg); await sleep(250); break;
      case 'fig': this.fig(arg); await sleep(150); break;
      case 'idle':
        await sleep(200);
        await waitFor(() => !document.querySelector('.tb-busy') && !(window.__msmEngine && window.__msmEngine.state === 'busy'), 20000);
        break;
      case 'click': { const el = firstMatch(arg); if (el) { el.click(); await sleep(250); } break; }
      case 'scroll': { const el = firstMatch(arg); if (el) { el.scrollIntoView({ block: 'center' }); await sleep(300); } break; }
      case 'wait': await sleep(Number(arg) || 300); break;
      default: break;
    }
  }
}

let engine = null;
export function tutorialEngine() {
  if (!engine) engine = new Engine();
  return engine;
}

/** The step's target rectangle, followed while the layout moves. */
function useTargetRect(active, step, busy) {
  const [, tick] = useReducer((n) => n + 1, 0);
  const rect = useRef(null);
  useEffect(() => {
    if (!active || !step) return undefined;
    const measure = () => {
      const el = busy ? null : findTarget(step.target);
      const r = el ? el.getBoundingClientRect() : null;
      const prev = rect.current;
      const same = (!r && !prev) || (r && prev && Math.abs(r.left - prev.left) < 1 && Math.abs(r.top - prev.top) < 1 && Math.abs(r.width - prev.width) < 1 && Math.abs(r.height - prev.height) < 1);
      if (!same) { rect.current = r ? { left: r.left, top: r.top, width: r.width, height: r.height } : null; tick(); }
    };
    measure();
    const iv = setInterval(measure, 300);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => { clearInterval(iv); window.removeEventListener('resize', measure); window.removeEventListener('scroll', measure, true); };
  }, [active, step, busy]);
  return rect.current;
}

export function Tutorial({ onProgress }) {
  useLanguage();
  const eng = tutorialEngine();
  const [, render] = useReducer((n) => n + 1, 0);
  // A card the user dragged stays put until the next chapter: { chapter, right, bottom }.
  const [dragged, setDragged] = React.useState(null);
  const [cardDrag, setCardDrag] = React.useState(null);
  const cardRef = useRef(null);
  const [chaptersOpen, setChaptersOpen] = React.useState(false);
  const progressRef = useRef(onProgress);
  progressRef.current = onProgress;

  useEffect(() => {
    eng.listeners.add(render);
    eng.onProgress = (p) => progressRef.current && progressRef.current(p);
    const api = {
      start: (opts) => eng.start(opts || {}),
      stop: () => eng.stop(),
      next: () => eng.next(),
      prev: () => eng.prev(),
      go: (i) => eng.go(i),
      state: () => eng.state(),
      steps: STEPS,
      chapters: CHAPTERS,
    };
    msm().tutorial = api;
    let off = null;
    let gone = false;
    // The guide window (a child window on the desktop) asks for the tour.
    onBroadcast('msm-tutorial-start', (p) => eng.start(p || {})).then((fn) => { if (gone) fn(); else off = fn; }).catch(() => {});
    return () => {
      eng.listeners.delete(render);
      gone = true;
      if (off) off();
      if (msm().tutorial === api) delete msm().tutorial;
    };
  }, [eng]);

  // Keys while the tour is on (only real key presses).
  useEffect(() => {
    if (!eng.active) return undefined;
    const onKey = (e) => {
      if (!e.isTrusted) return;
      const typing = e.target && (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || (e.target.closest && e.target.closest('.cm-editor')));
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); eng.stop(); return; }
      if (typing) return;
      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); if (!eng.busy) eng.next(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); if (!eng.busy) eng.prev(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  const step = STEPS[eng.index];
  const rect = useTargetRect(eng.active, step, eng.busy);
  if (!eng.active || !step) return null;

  const lang = getLanguage() === 'en' ? 'en' : 'ko';
  const s = tr();
  const text = stepText(step, lang);
  const inChapter = STEPS.filter((x) => x.chapter === step.chapter);
  const last = eng.index === STEPS.length - 1;
  const centred = eng.missing && !eng.busy;

  let outline = null;
  if (rect) {
    const M = 3;
    const clamp = (v, max) => Math.min(Math.max(v, M), max - M);
    const left = clamp(rect.left - 4, window.innerWidth);
    const top = clamp(rect.top - 4, window.innerHeight);
    const right = clamp(rect.left + rect.width + 4, window.innerWidth);
    const bottom = clamp(rect.top + rect.height + 4, window.innerHeight);
    outline = <div className="msm-tour-outline" data-testid="tour-outline" style={{ left, top, width: Math.max(12, right - left), height: Math.max(12, bottom - top) }} />;
  }

  // The card goes to the first corner whose rectangle stays 16 px clear of the
  // target; when every corner would cover it: bottom-right, see-through until hovered.
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const cw = (cardRef.current && cardRef.current.offsetWidth) || Math.min(460, vw - 24);
  const ch = (cardRef.current && cardRef.current.offsetHeight) || 260;
  const corners = [
    { style: { right: 18, bottom: 34 }, box: { left: vw - 18 - cw, top: vh - 34 - ch } },
    { style: { left: 18, bottom: 34 }, box: { left: 18, top: vh - 34 - ch } },
    { style: { right: 18, top: 84 }, box: { left: vw - 18 - cw, top: 84 } },
    { style: { left: 18, top: 84 }, box: { left: 18, top: 84 } },
  ];
  const clear = (c) => {
    if (!rect) return true;
    const m = 16;
    return c.box.left + cw <= rect.left - m || c.box.left >= rect.left + rect.width + m || c.box.top + ch <= rect.top - m || c.box.top >= rect.top + rect.height + m;
  };
  const free = corners.find(clear);
  const manual = dragged && dragged.chapter === step.chapter ? dragged : null;
  const placed = manual ? { right: manual.right, bottom: manual.bottom } : (free || corners[0]).style;
  const seeThrough = !manual && !free && !!rect;
  const startDrag = (e) => {
    if (e.button !== 0 || e.target.closest('button')) return;
    e.preventDefault();
    const box = cardRef.current ? cardRef.current.getBoundingClientRect() : { right: vw - 18, bottom: vh - 40, width: 460, height: 300 };
    const from = { x: e.clientX, y: e.clientY, right: vw - box.right, bottom: vh - box.bottom };
    const g = cardRef.current ? dragGhost(cardRef.current, e) : null;
    let to = null;
    const at = (ev) => ({
      right: Math.max(0, Math.min(window.innerWidth - box.width, from.right - (ev.clientX - from.x))),
      bottom: Math.max(0, Math.min(window.innerHeight - box.height, from.bottom - (ev.clientY - from.y))),
    });
    const move = (ev) => {
      if (g) g.move(ev);
      to = at(ev);
      setCardDrag({ right: to.right, bottom: to.bottom, width: box.width, height: box.height });
    };
    const up = (ev) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      if (g) g.destroy();
      setCardDrag(null);
      if (to && ev.type === 'pointerup') setDragged({ chapter: step.chapter, ...to });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  const cardStyle = centred ? { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' } : placed;

  return createPortal(
    <div className="msm-tour-layer" onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
      {outline}
      {cardDrag && <div className="msm-tour-drop" aria-hidden="true" style={{ right: cardDrag.right, bottom: cardDrag.bottom, width: cardDrag.width, height: cardDrag.height }} />}
      <div ref={cardRef} className={`msm-tour-card ${centred ? 'centred' : ''} ${seeThrough ? 'see-through' : ''} ${cardDrag ? 'drag-origin' : ''}`} role="dialog" aria-label={s.title} data-testid="tour-card" style={cardStyle}>
        <div className="msm-tour-head" onPointerDown={startDrag} title={s.drag}>
          <Icon name="graduation" size={16} />
          <b>{s.title}</b>
          <span className="msm-tour-chapter">{chapterName(step.chapter, lang)} · {inChapter.indexOf(step) + 1}/{inChapter.length}</span>
          <span className="msm-tour-grow" />
          <CloseButton className="msm-tour-x" title={s.close} aria-label={s.close} data-testid="tour-stop" onClick={() => eng.stop()} size={14} />
        </div>
        <div className="msm-tour-progress"><i style={{ width: `${((eng.index + 1) / STEPS.length) * 100}%` }} /></div>
        <div className="msm-tour-body">
          <h3 data-testid="tour-title">{text.title}</h3>
          <p>{text.body}</p>
          {centred && <p className="msm-tour-missing"><Icon name="info" size={13} />{s.missing}</p>}
        </div>
        <div className="msm-tour-foot">
          <div className="msm-tour-chapters">
            <button type="button" className="msm-tour-select" title={s.chapters} aria-haspopup="listbox" aria-expanded={chaptersOpen} data-testid="tour-chapter"
              onClick={() => setChaptersOpen((v) => !v)}>
              <Icon name="list" size={13} /><span>{chapterName(step.chapter, lang)}</span><Icon name="chevronDown" size={12} />
            </button>
            {chaptersOpen && (
              <ul className="msm-tour-list" role="listbox" aria-label={s.chapters} onMouseLeave={() => setChaptersOpen(false)}>
                {CHAPTERS.map((c, n) => {
                  const first = STEPS.findIndex((x) => x.chapter === c.id);
                  const count = STEPS.filter((x) => x.chapter === c.id).length;
                  if (first < 0) return null;
                  return (
                    <li key={c.id} role="option" aria-selected={c.id === step.chapter} className={c.id === step.chapter ? 'on' : ''}
                      onClick={() => { setChaptersOpen(false); eng.go(first); }}>
                      <span className="n">{n + 1}</span><span className="name">{lang === 'en' ? c.en : c.ko}</span><span className="c">{count}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <span className="msm-tour-count" data-testid="tour-count">{eng.index + 1} / {STEPS.length}{eng.busy ? ' …' : ''}</span>
          <span className="msm-tour-grow" />
          <button type="button" className="msm-tour-btn" title={s.restart} aria-label={s.restart} data-testid="tour-restart" disabled={eng.index === 0} onClick={() => eng.go(0)}>⏮</button>
          <button type="button" className="msm-tour-btn" title={s.prev} aria-label={s.prev} data-testid="tour-prev" disabled={eng.index === 0} onClick={() => eng.prev()}>◀ {s.prev}</button>
          <button type="button" className={`msm-tour-btn ${eng.autoplay ? 'on' : ''}`} title={eng.autoplay ? s.pause : s.play} aria-label={eng.autoplay ? s.pause : s.play} aria-pressed={eng.autoplay} data-testid="tour-play" onClick={() => eng.toggleAutoplay()}>{eng.autoplay ? '⏸' : '▶'}</button>
          <button type="button" className="msm-tour-btn primary" data-testid="tour-next" disabled={eng.busy && !last} onClick={() => eng.next()}>{last ? `${s.done} ✓` : `${s.next} ▶`}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Starts the tour here, or asks the main window to (from a child window). */
export function startTour(opts = {}) {
  const tour = window.__msm && window.__msm.tutorial;
  if (tour) return tour.start(opts);
  import('../lib/popups').then((m) => m.broadcast('msm-tutorial-start', opts)).catch(() => {});
  return undefined;
}

export default Tutorial;
