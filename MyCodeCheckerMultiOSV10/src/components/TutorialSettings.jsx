// The 튜토리얼 section of the settings window: "시작할 때 튜토리얼 안내 보기",
// progress, [튜토리얼 시작 / 이어서 보기], [처음부터 다시] and the tutorial
// document. Self-contained: give it the (draft) settings and a patch callback.
//
//   <TutorialSettings settings={draft} onPatch={(p) => set(p)} onStarted={close} />
//
// onPatch gets { tutorial: {...} }. Starting the tour works from the main
// window (window.__mcc.tutorial) and from a settings child window (broadcast
// 'mcc-tutorial-start', which <Tutorial/> in the main window listens to);
// onStarted lets the settings window close itself first.
import React from 'react';
import { getLanguage, useLanguage } from '../lib/i18n';
import { Icon } from './Chrome';
import { broadcast } from '../lib/popups';
import { tutorialOf, showAtStartPatch, resetPatch } from '../lib/tutorialSettings';
import { STEPS, CHAPTERS } from '../lib/tutorialSteps';
import '../tutorial.css';

const L = {
  ko: {
    section: '튜토리얼', show: '시작할 때 튜토리얼 안내 보기', showHint: '프로그램을 시작하면 튜토리얼을 시작할지 묻는 안내 창을 보여 줍니다. 튜토리얼을 끝까지 보면 더 이상 나오지 않습니다.',
    progress: '진행', done: '끝까지 보았습니다', notYet: '아직 시작하지 않았습니다', at: '{n} / {total} 단계', start: '튜토리얼 시작', resume: '이어서 보기', restart: '처음부터 다시', doc: '튜토리얼 문서',
    about: '{chapters}개 장, {steps}단계로 모든 기능을 실제 화면에서 차례로 설명합니다. → / Space 다음, ← 이전, Esc 닫기.',
  },
  en: {
    section: 'Tutorial', show: 'Show the tutorial welcome at start', showHint: 'When the program starts, a small window offers to start the tutorial. It stops appearing once the tutorial has been played to the end.',
    progress: 'Progress', done: 'Played to the end', notYet: 'Not started yet', at: 'step {n} / {total}', start: 'Start tutorial', resume: 'Continue', restart: 'Start over', doc: 'Tutorial document',
    about: '{chapters} chapters and {steps} steps explain every feature on the real screen. → / Space next, ← previous, Esc closes.',
  },
};
const fill = (s, vars) => s.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? vars[k] : `{${k}}`));

function launch(opts) {
  const tour = window.__mcc && window.__mcc.tutorial;
  if (tour) { tour.start(opts); return; }
  broadcast('mcc-tutorial-start', opts).catch(() => {});
}

export function TutorialSettings({ settings, onPatch, onStarted }) {
  useLanguage();
  const s = L[getLanguage() === 'en' ? 'en' : 'ko'];
  const tut = tutorialOf(settings);
  const total = STEPS.length;
  const started = tut.done || tut.lastIndex > 0;
  const pct = tut.done ? 100 : Math.round(((tut.lastIndex + (started ? 1 : 0)) / total) * 100);
  const go = (index) => {
    if (onStarted) onStarted();
    setTimeout(() => launch({ index }), onStarted ? 120 : 0);
  };
  const openDoc = () => {
    if (window.__mcc && window.__mcc.openGuide) window.__mcc.openGuide('tutorial');
    else broadcast('mcc-open-guide', 'tutorial').catch(() => {});
  };
  return (
    <section className="mcc-tut-settings" data-tour="settings-tutorial" data-testid="settings-tutorial">
      <div className="mcc-tut-row">
        <label className="mcc-check">
          <input type="checkbox" checked={tut.showAtStart} onChange={(e) => onPatch && onPatch(showAtStartPatch(settings, e.target.checked))} data-testid="settings-tutorial-show" />
          {s.show}
        </label>
      </div>
      <p className="small muted" style={{ margin: 0 }}>{s.showHint}</p>
      <div className="mcc-tut-row">
        <span className="label"><Icon name="graduation" size={14} />{s.progress}</span>
        <span className="mcc-tut-bar" aria-hidden="true"><i style={{ width: `${pct}%` }} /></span>
        <span className="mcc-tut-status">{tut.done ? s.done : started ? fill(s.at, { n: tut.lastIndex + 1, total }) : s.notYet}</span>
      </div>
      <div className="mcc-tut-row">
        <button type="button" className="mcc-btn primary" onClick={() => go(started && !tut.done ? tut.lastIndex : 0)} data-testid="settings-tutorial-start">
          <Icon name="play" size={14} />{started && !tut.done ? s.resume : s.start}
        </button>
        <button type="button" className="mcc-btn" onClick={() => { if (onPatch) onPatch(resetPatch(settings)); go(0); }} data-testid="settings-tutorial-restart">
          <Icon name="refresh" size={14} />{s.restart}
        </button>
        <button type="button" className="mcc-btn" onClick={openDoc}><Icon name="book" size={14} />{s.doc}</button>
      </div>
      <p className="small muted" style={{ margin: 0 }}>{fill(s.about, { chapters: CHAPTERS.length, steps: total })}</p>
    </section>
  );
}

export default TutorialSettings;
