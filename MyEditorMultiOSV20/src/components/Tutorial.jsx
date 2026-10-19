// A short tour of the editor. A card at the bottom right names the step;
// the part of the window it is about is outlined. Chapters jump from the
// list. Next walks one step, Auto play walks them all, and the start page
// is shown for the steps that live there.
import React, { useEffect, useState } from 'react';
import { t, useLanguage } from '../lib/i18n';
import { Icon } from './Icons';

export const TUTORIAL_CHAPTERS = ['start', 'files', 'edit', 'view', 'tools'];

// `place` is 'start' while the step is about the start page, otherwise the editor.
export const TUTORIAL_STEPS = [
  { id: 'welcome', chapter: 'start', target: '.start-head', place: 'start' },
  { id: 'begin', chapter: 'start', target: '.start-actions', place: 'start' },
  { id: 'tasks', chapter: 'start', target: '.task-grid', place: 'start' },
  { id: 'background', chapter: 'start', target: '.start-scenes', place: 'start' },
  { id: 'newFile', chapter: 'files', target: '.icon-toolbar [data-cmd="new"]', place: 'editor' },
  { id: 'open', chapter: 'files', target: '.icon-toolbar [data-cmd="open"]', place: 'editor' },
  { id: 'folder', chapter: 'files', target: '.icon-toolbar [data-cmd="openFolder"]', place: 'editor' },
  { id: 'recent', chapter: 'files', target: '.start-group[data-group="recent"]', place: 'start' },
  { id: 'find', chapter: 'edit', target: '.icon-toolbar [data-cmd="find"]', place: 'editor' },
  { id: 'replace', chapter: 'edit', target: '.icon-toolbar [data-cmd="replace"]', place: 'editor' },
  { id: 'format', chapter: 'edit', target: '.icon-toolbar [data-cmd="formatDoc"]', place: 'editor' },
  { id: 'preview', chapter: 'view', target: '.icon-toolbar [data-cmd="togglePreview"]', place: 'editor' },
  { id: 'wysiwyg', chapter: 'view', target: '.mdbar [data-cmd="toggle:mdWysiwyg"]', place: 'editor' },
  { id: 'run', chapter: 'view', target: '.icon-toolbar [data-cmd="html:browser"]', place: 'editor' },
  { id: 'structure', chapter: 'view', target: '.mdbar [data-cmd="toggleStructure"]', place: 'editor' },
  { id: 'terminal', chapter: 'tools', target: '.icon-toolbar [data-cmd="toggleTerminal"]', place: 'editor' },
  { id: 'log', chapter: 'tools', target: '.icon-toolbar [data-cmd="toggleLog"]', place: 'editor' },
  { id: 'settings', chapter: 'tools', target: '.app-controls [data-cmd="settings"]', place: 'editor' },
  { id: 'done', chapter: 'tools', target: '.start-head', place: 'start' },
];

const DWELL = 4500;

function spotOf(selector) {
  const el = selector ? document.querySelector(selector) : null;
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width < 2 && r.height < 2) return null;
  return { left: r.left - 4, top: r.top - 4, width: r.width + 8, height: r.height + 8 };
}

export function Tutorial({ onPlace, onClose }) {
  useLanguage();
  const [index, setIndex] = useState(0);
  const [auto, setAuto] = useState(false);
  const [box, setBox] = useState(null);
  const step = TUTORIAL_STEPS[index];
  const chapterSteps = TUTORIAL_STEPS.filter((s) => s.chapter === step.chapter);

  useEffect(() => { onPlace(step.place); }, [step.place, onPlace]);
  useEffect(() => {
    document.body.classList.add('tutorial-on');
    return () => document.body.classList.remove('tutorial-on');
  }, []);
  useEffect(() => {
    const place = () => setBox(spotOf(step.target));
    place();
    const id = setInterval(place, 400);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { clearInterval(id); window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [step.target, index]);
  useEffect(() => {
    if (!auto) return undefined;
    const id = setTimeout(() => {
      if (index >= TUTORIAL_STEPS.length - 1) setAuto(false);
      else setIndex(index + 1);
    }, DWELL);
    return () => clearTimeout(id);
  }, [auto, index]);

  const go = (n) => setIndex(Math.max(0, Math.min(TUTORIAL_STEPS.length - 1, n)));

  return (
    <>
      {box && <div className="tutorial-spot" style={box} />}
      <div className="tutorial-card" role="dialog" aria-live="polite">
        <div className="tutorial-top">
          <span className="tutorial-badge"><Icon name="help" size={16} /></span>
          <select className="tutorial-chapter" title={t('tut_chapter')} aria-label={t('tut_chapter')} value={step.chapter} onChange={(e) => go(TUTORIAL_STEPS.findIndex((s) => s.chapter === e.target.value))}>
            {TUTORIAL_CHAPTERS.map((id) => <option key={id} value={id}>{t(`tut_ch_${id}`)}</option>)}
          </select>
          <span className="tutorial-count">{t('tut_count', { n: index + 1, total: TUTORIAL_STEPS.length })}</span>
          <button type="button" className="icon-btn" title={t('tut_exit')} onClick={onClose}><Icon name="close" size={14} /></button>
        </div>
        <div className="tutorial-progress"><span style={{ width: `${((index + 1) / TUTORIAL_STEPS.length) * 100}%` }} /></div>
        <h3 className="tutorial-title">{t(`tut_${step.id}_title`)}</h3>
        <p className="tutorial-text">{t(`tut_${step.id}_text`)}</p>
        <div className="tutorial-sub">{t('tut_in_chapter', { n: chapterSteps.indexOf(step) + 1, total: chapterSteps.length })}</div>
        <div className="tutorial-buttons">
          <button type="button" className="btn" disabled={index === 0} onClick={() => go(index - 1)}>{t('tut_prev')}</button>
          <button type="button" className={`btn${auto ? ' on' : ''}`} onClick={() => setAuto((v) => !v)}>{t(auto ? 'tut_pause' : 'tut_auto')}</button>
          {index === TUTORIAL_STEPS.length - 1
            ? <button type="button" className="btn primary" onClick={onClose}>{t('tut_finish')}</button>
            : <button type="button" className="btn primary" onClick={() => go(index + 1)}>{t('tut_next')}</button>}
        </div>
      </div>
    </>
  );
}

export default Tutorial;
