// Launch question, only while the Start screen is showing: run the tutorial
// or not, and whether to keep asking. The same switch is Settings › 일반 and
// Settings › 시작 화면 (settings.tutorial.showAtStart). One question per launch;
// leaving the Start screen closes it for the rest of this launch.
import React, { useEffect, useState } from 'react';
import { t, useLanguage } from '../lib/i18n';
import { Icon, CloseButton } from './Chrome';
import { startTour } from './TutorialWelcome';
import { laterPatch, nextAskSession, tutorialOf } from '../lib/tutorialSettings';
import { STEPS } from '../lib/tutorialSteps';
import '../tutorial.css';

function tourRunning() {
  try { return !!(window.__mcc && window.__mcc.tutorial && window.__mcc.tutorial.state().active); } catch { return false; }
}

export function TutorialAsk({ settings, active, onPatch, onOpenChange }) {
  useLanguage();
  const [session, setSession] = useState('pending');
  const tut = tutorialOf(settings);
  const enabled = tut.showAtStart && !tourRunning();
  const [keep, setKeep] = useState(tut.showAtStart);
  const canResume = tut.lastIndex > 0 && tut.lastIndex < STEPS.length - 1 && !tut.done;

  useEffect(() => {
    const next = nextAskSession(session, { onStart: !!active, enabled });
    if (next !== session) setSession(next);
  }, [session, active, enabled]);

  useEffect(() => {
    if (!onOpenChange || session === 'pending') return;
    onOpenChange(session === 'open');
  }, [session, onOpenChange]);

  useEffect(() => {
    const on = () => setSession('closed');
    window.addEventListener('mcc-tour-start', on);
    return () => window.removeEventListener('mcc-tour-start', on);
  }, []);

  const choose = (run) => {
    if (onPatch) onPatch(laterPatch(settings, keep));
    setSession('closed');
    if (run) setTimeout(() => startTour(canResume ? { index: tut.lastIndex } : { index: 0 }), 50);
  };

  const open = session === 'open';
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape' && e.isTrusted) { e.preventDefault(); e.stopPropagation(); choose(false); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  if (!open) return null;
  return (
    <div className="mcc-welcome-back" data-testid="tutorial-ask">
      <div className="mcc-ask" role="dialog" aria-modal="true" aria-label={t('tut_ask_title')}>
        <div className="mcc-welcome-head">
          <Icon name="graduation" size={16} />
          <b>{t('tut_ask_title')}</b>
          <CloseButton className="mcc-guide-x" onClick={() => choose(false)} size={14} />
        </div>
        <div className="mcc-ask-body">
          <p>{canResume ? t('tut_ask_resume', { n: tut.lastIndex + 1 }) : t('tut_ask_body')}</p>
        </div>
        <div className="mcc-welcome-foot">
          <label className="mcc-check">
            <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} data-testid="tutorial-ask-keep" />
            {t('tut_ask_keep')}
          </label>
          <button type="button" className="mcc-btn" onClick={() => choose(false)} data-testid="tutorial-welcome-later"><Icon name="clock" size={14} />{t('tut_ask_no')}</button>
          <button type="button" className="mcc-btn primary" onClick={() => choose(true)} data-testid="tutorial-ask-yes"><Icon name={canResume ? 'history' : 'play'} size={14} />{canResume ? t('tut_ask_resume_yes') : t('tut_ask_yes')}</button>
        </div>
      </div>
    </div>
  );
}
