// The guided tour: a spotlight on one part of the window at a time and a card
// that explains it, step by step (src/lib/tourSteps.js). "Show me" runs the
// feature on the tutorial map so it can be seen working; → / Enter next,
// ← back, Esc ends. Opened by 도움말 › 튜토리얼, the start page's 튜토리얼 card
// and, once, on the very first launch.
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { t, useLanguage, getLanguage } from '../lib/i18n';
import { renderMarkdown } from '../lib/markdown';
import { TOUR_STEPS } from '../lib/tourSteps';
import { Icon } from './Icons';

const PAD = 8;       // room around the spotlighted element
const GAP = 14;      // between the spotlight and the card
const CARD_W = 400;

function targetOf(step) {
  if (!step.target) return null;
  let el = document.querySelector(step.target);
  if (el && step.group) el = el.closest('.tb-group') || el;
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (!r.width || !r.height) return null;
  return { x: r.left - PAD, y: r.top - PAD, w: r.width + PAD * 2, h: r.height + PAD * 2 };
}

// Where the card goes: below the spotlight, else above, right, left; kept inside the window.
function placeCard(hole, cw, ch) {
  const W = window.innerWidth, H = window.innerHeight;
  if (!hole) return { left: (W - cw) / 2, top: Math.max(16, (H - ch) / 2) };
  const fits = { below: hole.y + hole.h + GAP + ch < H - 8, above: hole.y - GAP - ch > 8, right: hole.x + hole.w + GAP + cw < W - 8, left: hole.x - GAP - cw > 8 };
  let left, top;
  if (fits.below) { top = hole.y + hole.h + GAP; left = hole.x + hole.w / 2 - cw / 2; }
  else if (fits.above) { top = hole.y - GAP - ch; left = hole.x + hole.w / 2 - cw / 2; }
  else if (fits.right) { left = hole.x + hole.w + GAP; top = hole.y + hole.h / 2 - ch / 2; }
  else if (fits.left) { left = hole.x - GAP - cw; top = hole.y + hole.h / 2 - ch / 2; }
  else { left = W - cw - 24; top = H - ch - 24; }   // a spotlight as big as the window: the card in a corner
  return { left: Math.max(8, Math.min(W - cw - 8, left)), top: Math.max(8, Math.min(H - ch - 8, top)) };
}

export function GuidedTour({ onAction, onClose, startAt = 0 }) {
  useLanguage();
  const lang = getLanguage() === 'ko' ? 0 : 1;
  const [i, setI] = useState(startAt);
  const [hole, setHole] = useState(null);
  const [pos, setPos] = useState(null);           // null until measured: the card is hidden, not slid in from afar
  const [shown, setShown] = useState(false);   // "show me" was pressed on this step
  const card = useRef(null);
  const step = TOUR_STEPS[i];
  const last = i === TOUR_STEPS.length - 1;

  // entering a step runs its `enter` action, leaving it its `leave` action
  useEffect(() => {
    setShown(false);
    if (step.enter) onAction(step.enter);
    return () => { if (step.leave) onAction(step.leave); };
  }, [i]);   // eslint-disable-line react-hooks/exhaustive-deps

  // the spotlight follows its element (it may appear a moment after `enter`, or move on resize)
  const measure = useCallback(() => {
    const h = targetOf(step);
    setHole((old) => (old && h && Math.abs(old.x - h.x) < 0.5 && Math.abs(old.y - h.y) < 0.5 && Math.abs(old.w - h.w) < 0.5 && Math.abs(old.h - h.h) < 0.5 ? old : h));
  }, [step]);
  useEffect(() => {
    measure();
    const id = setInterval(measure, 250);
    window.addEventListener('resize', measure);
    return () => { clearInterval(id); window.removeEventListener('resize', measure); };
  }, [measure]);
  useLayoutEffect(() => {
    const el = card.current;
    if (!el) return;
    setPos(placeCard(hole, el.offsetWidth, el.offsetHeight));
  }, [hole, i, shown, lang]);

  const go = useCallback((d) => {
    const n = i + d;
    if (n < 0) return;
    if (n >= TOUR_STEPS.length) { onClose(true); return; }
    setI(n);
  }, [i, onClose]);

  useEffect(() => {
    const key = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(false); }
      else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); go(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); go(-1); }
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [go, onClose]);

  const demo = step.demo;
  return (
    <div className="tour" role="dialog" aria-modal="true" aria-label={t('tour_title')} data-step={step.id}>
      {/* four shades around the spotlight: clicks outside the card do nothing */}
      {hole ? (
        <>
          <div className="tour-shade" style={{ left: 0, top: 0, width: '100%', height: Math.max(0, hole.y) }} />
          <div className="tour-shade" style={{ left: 0, top: hole.y + hole.h, width: '100%', bottom: 0 }} />
          <div className="tour-shade" style={{ left: 0, top: hole.y, width: Math.max(0, hole.x), height: hole.h }} />
          <div className="tour-shade" style={{ left: hole.x + hole.w, top: hole.y, right: 0, height: hole.h }} />
          <div className="tour-ring" style={{ left: hole.x, top: hole.y, width: hole.w, height: hole.h }} />
        </>
      ) : <div className="tour-shade" style={{ inset: 0 }} />}
      <div className={`tour-card ${pos ? 'placed' : ''}`} ref={card} style={{ ...(pos || { left: 0, top: 0, visibility: 'hidden' }), width: CARD_W }}>
        <div className="tour-head">
          <Icon name="bookOpen" size={16} />
          <span className="tour-count">{t('tour_step', { n: i + 1, total: TOUR_STEPS.length })}</span>
          <button type="button" className="icon-btn" title={t('tour_end')} onClick={() => onClose(false)}><Icon name="close" size={14} /></button>
        </div>
        <h3>{step.title[lang]}</h3>
        <div className="tour-text" dangerouslySetInnerHTML={{ __html: renderMarkdown(step.text[lang]) }} />
        <div className="tour-progress"><span style={{ width: `${((i + 1) / TOUR_STEPS.length) * 100}%` }} /></div>
        <div className="tour-foot">
          {demo && (
            <button type="button" className="btn small" data-tour="demo" onClick={() => { onAction(demo); setShown(true); }}>
              <Icon name="play" size={12} /> {shown ? t('tour_show_again') : t('tour_show')}
            </button>
          )}
          <span className="spacer" />
          {i > 0 && <button type="button" className="btn small" data-tour="back" onClick={() => go(-1)}><Icon name="chevronLeft" size={12} /> {t('tour_back')}</button>}
          <button type="button" className="btn small primary" data-tour="next" onClick={() => go(1)}>
            {last ? t('tour_finish') : <>{t('tour_next')} <Icon name="chevronRight" size={12} /></>}
          </button>
        </div>
      </div>
    </div>
  );
}

export default GuidedTour;
