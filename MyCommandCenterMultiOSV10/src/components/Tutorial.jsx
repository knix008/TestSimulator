// Step-by-step tour opened from the start page. A card explains the step and an
// outline marks the part of the window it is about. Nothing here deletes or moves files.
import React, { useEffect, useLayoutEffect, useState } from 'react';
import { t, useLanguage } from '../lib/i18n';
import { Icon } from './Icons';

export const TUTORIAL_STEPS = [
  { id: 'welcome', chapter: 'start', target: '.start-head', place: 'start' },
  { id: 'begin', chapter: 'start', target: '.start-actions', place: 'start' },
  { id: 'tasks', chapter: 'start', target: '.task-grid', place: 'start' },
  { id: 'recent', chapter: 'start', target: '[data-group="recent"]', place: 'start' },
  { id: 'background', chapter: 'start', target: '[data-group="scenes"]', place: 'start' },
  { id: 'panels', chapter: 'files', target: '[data-tut="panels"]', place: 'work' },
  { id: 'active', chapter: 'files', target: '.file-panel.active', place: 'work' },
  { id: 'open', chapter: 'files', target: '.file-panel.active', place: 'work' },
  { id: 'keys', chapter: 'files', target: '[data-tut="fnbar"]', place: 'work' },
  { id: 'menu', chapter: 'tools', target: '[data-tut="menubar"]', place: 'work' },
  { id: 'toolbar', chapter: 'tools', target: '[data-tut="toolbar"]', place: 'work' },
  { id: 'dock', chapter: 'tools', target: '[data-tut="dock"]', place: 'work', dock: true },
  { id: 'settings', chapter: 'tools', target: '[data-tut="settings"]', place: 'work' },
  { id: 'done', chapter: 'tools', target: '[data-tut="home"]', place: 'start' },
];

const CHAPTERS = ['start', 'files', 'tools'];

export function Tutorial({ onClose, onPrepare }) {
  useLanguage();
  const [index, setIndex] = useState(0);
  const [box, setBox] = useState(null);
  const indexRef = React.useRef(0);
  indexRef.current = index;
  const step = TUTORIAL_STEPS[index];
  const last = index === TUTORIAL_STEPS.length - 1;

  useEffect(() => { onPrepare(step); }, [index]); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    const measure = () => {
      const el = document.querySelector(step.target);
      if (!el || !el.getClientRects().length) { setBox(null); return; }
      const r0 = el.getBoundingClientRect();
      const outside = r0.top < 40 || r0.bottom > window.innerHeight - 8 || r0.width < 2;
      if (outside && typeof el.scrollIntoView === 'function') {
        try { el.scrollIntoView({ block: 'center', inline: 'nearest' }); } catch { /* the test DOM has no layout */ }
      }
      const r = el.getBoundingClientRect();
      setBox({ left: r.left - 4, top: r.top - 4, width: Math.max(8, r.width + 8), height: Math.max(8, r.height + 8) });
    };
    measure();
    const watched = document.querySelector(step.target);
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    if (observer) {
      if (watched) observer.observe(watched);
      observer.observe(document.documentElement);
    }
    window.addEventListener('resize', measure);
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure); };
  }, [step]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); }
      else if (e.key === 'ArrowRight' || e.key === 'Enter') {
        e.preventDefault(); e.stopPropagation();
        if (indexRef.current >= TUTORIAL_STEPS.length - 1) onClose();
        else setIndex((i) => i + 1);
      }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); setIndex((i) => Math.max(0, i - 1)); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const low = box && box.top + box.height > window.innerHeight - 280;
  const goChapter = (chapter) => {
    const i = TUTORIAL_STEPS.findIndex((s) => s.chapter === chapter);
    if (i >= 0) setIndex(i);
  };

  return (
    <>
      {box && <div className="tutorial-spot" style={{ left: box.left, top: box.top, width: box.width, height: box.height }} />}
      <div className={`tutorial-card ${low ? 'top' : ''}`} role="dialog" aria-labelledby="tut-title">
        <div className="tutorial-top">
          <Icon name="help" size={16} />
          <select className="tutorial-chapter" aria-label={t('tut_ch_start')} value={step.chapter} onChange={(e) => goChapter(e.target.value)}>
            {CHAPTERS.map((id) => <option key={id} value={id}>{t(`tut_ch_${id}`)}</option>)}
          </select>
          <span className="tutorial-count">{t('tut_count', { n: index + 1, total: TUTORIAL_STEPS.length })}</span>
        </div>
        <div className="tutorial-progress"><span style={{ width: `${((index + 1) / TUTORIAL_STEPS.length) * 100}%` }} /></div>
        <h2 id="tut-title" className="tutorial-title">{t(`tut_${step.id}_title`)}</h2>
        <p className="tutorial-text">{t(`tut_${step.id}_text`)}</p>
        <div className="tutorial-buttons">
          <button type="button" className="btn" onClick={onClose}>{t('tut_exit')}</button>
          <button type="button" className="btn" disabled={index === 0} onClick={() => setIndex((i) => i - 1)}>{t('tut_prev')}</button>
          {last
            ? <button type="button" className="btn primary" onClick={onClose}>{t('tut_finish')}</button>
            : <button type="button" className="btn primary" onClick={() => setIndex((i) => i + 1)}>{t('tut_next')}</button>}
        </div>
      </div>
    </>
  );
}
