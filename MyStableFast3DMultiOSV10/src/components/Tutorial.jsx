import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { IconClose, IconPrev, IconNext, IconFirst, IconSparkles } from './Icons.jsx';
import { STEPS, CHAPTERS, chapterName, stepText, dwellOf } from '../lib/tutorialSteps.js';

// The guided tour (MyCodeChecker's design): an outline round the step's
// target with the rest dimmed, and a card at the bottom right — draggable by
// its head — with the text, the chapter list, ⏮ from the start, ◀ previous,
// ▶ / ⏸ auto play, next ▶ and "n / N". Keys: → / Space next, ← previous,
// Esc closes. Before each step its `action` (lib/tutorialSteps.js) puts the
// window in the state the step talks about, through `app` (App's API).
//
// `index` and `onIndex` keep the place in settings, so the tour can continue
// where it was left. window.__mysf3dTutorial exposes it for tests.

const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

function findTarget(target, t) {
  const list = Array.isArray(target) ? target : [target];
  for (const sel of list) {
    if (!sel) continue;
    const css = typeof sel === 'object' && sel.label
      ? `.toolbar [aria-label="${t(sel.label).replace(/"/g, '\\"')}"]`
      : sel;
    let els = [];
    try { els = [...document.querySelectorAll(css)]; } catch { /* bad selector */ }
    const el = els.find((e) => !e.closest('.tour-layer') && e.getBoundingClientRect().width > 0);
    if (el) return el;
  }
  return null;
}

async function waitFor(check, timeout = 6000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    try { if (await check()) return true; } catch { /* keep waiting */ }
    await sleep(100);
  }
  return false;
}

export default function Tutorial({ active, index, onIndex, onStop, app }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language?.startsWith('en') ? 'en' : 'ko';
  const [rect, setRect] = useState(null);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [autoplay, setAutoplay] = useState(false);
  const [pos, setPos] = useState(null);       // the card, once dragged
  const run = useRef(0);
  const targetRef = useRef(null);
  const step = STEPS[Math.min(Math.max(0, index), STEPS.length - 1)];

  // Put the window in the step's state, then find what to outline.
  useEffect(() => {
    if (!active || !step) return undefined;
    const my = ++run.current;
    setBusy(true);
    setRect(null);
    (async () => {
      try {
        await app.closeTransient();
        for (const op of step.action || []) {
          if (my !== run.current) return;
          const [kind, ...rest] = op.split(':');
          const arg = rest.join(':');
          if (kind === 'start') app.showStart(true);
          else if (kind === 'work') app.showStart(false);
          else if (kind === 'image' || kind === 'model') await app.openSample(arg, kind);
          else if (kind === 'tab') app.selectTab(arg);
          else if (kind === 'panels') app.showPanels();
          else if (kind === 'settings') app.openSettings(arg);
          else if (kind === 'print') app.openPrint();
          else if (kind === 'light') app.selectLight(arg);
          else if (kind === 'menu') {
            await sleep(150);
            const sel = arg.startsWith('label:') ? { label: arg.slice(6) } : arg;
            const btn = findTarget(sel, t);
            const button = btn?.matches('button') ? btn : btn?.querySelector('button');
            button?.click();
          }
          await sleep(120);
        }
        if (step.target) await waitFor(() => findTarget(step.target, t), 2500);
      } catch { /* the step text still shows */ }
      if (my !== run.current) return;
      const el = step.target ? findTarget(step.target, t) : null;
      targetRef.current = el;
      setMissing(!!step.target && !el);
      setBusy(false);
    })();
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, index]);

  // Follow the target while it moves (layout, scrolling, resizing).
  useEffect(() => {
    if (!active) return undefined;
    let raf = 0;
    const tick = () => {
      const el = targetRef.current;
      if (el && el.isConnected) {
        const r = el.getBoundingClientRect();
        setRect((old) => (old && Math.abs(old.x - r.x) < 0.5 && Math.abs(old.y - r.y) < 0.5 && Math.abs(old.w - r.width) < 0.5 && Math.abs(old.h - r.height) < 0.5
          ? old : { x: r.x, y: r.y, w: r.width, h: r.height }));
      } else setRect(null);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active]);

  const go = useCallback((i) => onIndex(Math.min(STEPS.length - 1, Math.max(0, i))), [onIndex]);
  const last = index >= STEPS.length - 1;
  const next = useCallback(() => (last ? onStop(true) : go(index + 1)), [go, index, last, onStop]);
  const prev = useCallback(() => go(index - 1), [go, index]);

  // Auto play.
  useEffect(() => {
    if (!active || !autoplay || busy) return undefined;
    const id = setTimeout(() => { if (last) setAutoplay(false); else go(index + 1); }, dwellOf(step, lang));
    return () => clearTimeout(id);
  }, [active, autoplay, busy, go, index, lang, last, step]);

  // Keys, ahead of the app's own (Esc would otherwise close a dialog first).
  useEffect(() => {
    if (!active) return undefined;
    const onKey = (e) => {
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); next(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); prev(); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onStop(false); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [active, next, onStop, prev]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    window.__mysf3dTutorial = { active, index, total: STEPS.length, id: step?.id, busy, missing, next, prev, go, stop: onStop };
    return undefined;
  }, [active, busy, go, index, missing, next, onStop, prev, step]);

  // Dragging the card by its head.
  const cardRef = useRef(null);
  const onHeadDown = (e) => {
    if (e.button !== 0 || e.target.closest('button, select')) return;
    const card = cardRef.current;
    if (!card) return;
    const r = card.getBoundingClientRect();
    const dx = e.clientX - r.left;
    const dy = e.clientY - r.top;
    const move = (ev) => setPos({
      x: Math.max(4, Math.min(window.innerWidth - r.width - 4, ev.clientX - dx)),
      y: Math.max(4, Math.min(window.innerHeight - 60, ev.clientY - dy)),
    });
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  useLayoutEffect(() => { if (!active) setPos(null); }, [active]);

  if (!active || !step) return null;
  const { title, body } = stepText(step, lang);
  const chapterSteps = STEPS.filter((s) => s.chapter === step.chapter);
  const inChapter = chapterSteps.indexOf(step) + 1;
  const pad = 6;

  return createPortal(
    <div className="tour-layer">
      {rect ? (
        <div
          className="tour-outline"
          style={{ left: rect.x - pad, top: rect.y - pad, width: rect.w + pad * 2, height: rect.h + pad * 2 }}
        />
      ) : <div className="tour-dim" />}
      <section
        ref={cardRef}
        className="tour-card"
        style={pos ? { left: pos.x, top: pos.y, right: 'auto', bottom: 'auto' } : undefined}
        role="dialog"
        aria-label={t('tutorial.title')}
        data-tour-step={step.id}
      >
        <header className="tour-head" onPointerDown={onHeadDown} title={t('tutorial.drag')}>
          <IconSparkles size={15} />
          <select
            className="tour-chapter"
            value={step.chapter}
            onChange={(e) => go(STEPS.findIndex((s) => s.chapter === e.target.value))}
            aria-label={t('tutorial.chapters')}
          >
            {CHAPTERS.map((c, i) => <option key={c.id} value={c.id}>{`${i + 1}. ${chapterName(c.id, lang)}`}</option>)}
          </select>
          <span className="tour-sub">{inChapter} / {chapterSteps.length}</span>
          <button className="icon-btn" onClick={() => onStop(false)} title={t('tutorial.close')} aria-label={t('tutorial.close')}>
            <IconClose size={15} />
          </button>
        </header>
        <div className="tour-body">
          <h3>{title}</h3>
          <p>{body}</p>
          {missing ? <p className="tour-missing">{t('tutorial.missing')}</p> : null}
        </div>
        <footer className="tour-foot">
          <button className="icon-btn" onClick={() => go(0)} title={t('tutorial.restart')} aria-label={t('tutorial.restart')} disabled={index === 0}>
            <IconFirst size={15} />
          </button>
          <button className="icon-btn" onClick={prev} title={t('tutorial.prev')} aria-label={t('tutorial.prev')} disabled={index === 0}>
            <IconPrev size={15} />
          </button>
          <button
            className={`btn small${autoplay ? ' active' : ''}`}
            onClick={() => setAutoplay((v) => !v)}
            title={autoplay ? t('tutorial.pause') : t('tutorial.play')}
            aria-pressed={autoplay}
          >
            {autoplay ? '⏸' : '▶'} {autoplay ? t('tutorial.pause') : t('tutorial.play')}
          </button>
          <span className="tour-count">{index + 1} / {STEPS.length}</span>
          <div className="spacer" />
          <button className="btn small primary" onClick={next} disabled={busy} data-tour-next>
            {last ? t('tutorial.done') : t('tutorial.next')} {last ? null : <IconNext size={14} />}
          </button>
        </footer>
        <div className="tour-progress"><span style={{ width: `${((index + 1) / STEPS.length) * 100}%` }} /></div>
      </section>
    </div>,
    document.body,
  );
}

// The prompt at start-up: run the tutorial now, later, or not again.
export function TutorialAsk({ open, settings, onStart, onLater, onChange }) {
  const { t } = useTranslation();
  if (!open) return null;
  const resume = settings.tutorialIndex > 0 && !settings.tutorialDone;
  return createPortal(
    <div className="modal-backdrop tour-ask-backdrop">
      <div className="modal tour-ask" role="dialog" aria-label={t('tutorial.askTitle')} style={{ '--modal-width': '520px' }}>
        <div className="modal-head">
          <span className="modal-head-icon"><IconSparkles size={17} /></span>
          <h2 className="modal-title">{t('tutorial.askTitle')}</h2>
        </div>
        <div className="modal-body">
          <img src="./icon.svg" alt="" width="64" height="64" className="tour-ask-icon" />
          <p>{t('tutorial.askBody', { chapters: CHAPTERS.length, steps: STEPS.length })}</p>
          {resume ? <p className="panel-note">{t('tutorial.askResume', { n: settings.tutorialIndex + 1 })}</p> : null}
          <label className="check">
            <input type="checkbox" checked={settings.tutorialAsk} onChange={(e) => onChange(e.target.checked)} data-tour-ask-again />
            <span>{t('tutorial.askAgain')}</span>
          </label>
        </div>
        <div className="modal-foot">
          <button className="btn" onClick={onLater} data-tour-later>{t('tutorial.later')}</button>
          <div className="spacer" />
          {resume ? <button className="btn" onClick={() => onStart(false)}>{t('tutorial.fromStart')}</button> : null}
          <button className="btn primary" onClick={() => onStart(resume)} data-autofocus data-tour-start>
            <IconSparkles size={15} /> {resume ? t('tutorial.resume') : t('tutorial.start')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
