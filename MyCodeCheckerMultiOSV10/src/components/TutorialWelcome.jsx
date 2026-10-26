// The welcome card shown when the app starts (settings.tutorial.showAtStart,
// until the tour has been played to the end): [튜토리얼 시작] / [나중에] and
// "시작할 때 튜토리얼 안내 보기". Shown once per launch.
//
// App: <TutorialWelcome settings={ws.settings} onPatch={patchSettings} />
// (render it after the workspace is in, not on the login screen).
import React, { useEffect, useState } from 'react';
import { getLanguage, useLanguage, t } from '../lib/i18n';
import { IconSelect } from '../views/common';
import { allThemes } from '../themes';
import { Icon, CloseButton } from './Chrome';
import { broadcast } from '../lib/popups';
import { shouldShowWelcome, tutorialOf, startPatch, laterPatch } from '../lib/tutorialSettings';
import { STEPS, CHAPTERS } from '../lib/tutorialSteps';
import '../tutorial.css';

const L = {
  ko: {
    head: '튜토리얼',
    title: 'MyCodeChecker에 오신 것을 환영합니다',
    body: '튜토리얼로 기능을 차례로 익혀 보세요. 실제 화면을 움직이며 시작 화면, 분석 실행, 이슈 처리, AI 코드 수정, 정밀 결함 분석, 보안·규정 보고서, 관리와 설정까지 {chapters}개 장 {steps}단계로 하나씩 설명합니다.',
    hint: '언제든 도움말 › 튜토리얼 시작에서 다시 볼 수 있습니다.',
    resume: '지난번에 {n}단계까지 보았습니다.',
    show: '시작할 때 튜토리얼 안내 보기',
    start: '튜토리얼 시작',
    resumeBtn: '이어서 보기',
    later: '나중에',
    close: '닫기',
  },
  en: {
    head: 'Tutorial',
    title: 'Welcome to MyCodeChecker',
    body: 'Learn the features one by one with the tutorial. It moves the real screen through the start page, running an analysis, handling issues, AI code fix, defects from defect analysis, security and compliance reports, administration and settings — {chapters} chapters, {steps} steps.',
    hint: 'You can run it again any time from Help › Start tutorial.',
    resume: 'Last time you reached step {n}.',
    show: 'Show the tutorial welcome at start',
    start: 'Start tutorial',
    resumeBtn: 'Continue',
    later: 'Later',
    close: 'Close',
  },
};
const fill = (s, vars) => s.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? vars[k] : `{${k}}`));

let shownThisLaunch = false;
const tourRunning = () => { try { return !!(window.__mcc && window.__mcc.tutorial && window.__mcc.tutorial.state().active); } catch { return false; } };

export function startTour(opts = {}) {
  const tour = window.__mcc && window.__mcc.tutorial;
  if (tour) tour.start(opts);
  else broadcast('mcc-tutorial-start', opts).catch(() => {});
}

export function TutorialWelcome({ settings, onPatch, force = false, onClose }) {
  useLanguage();
  const [open, setOpen] = useState(() => force || (!shownThisLaunch && shouldShowWelcome(settings) && !tourRunning()));
  const [keep, setKeep] = useState(() => tutorialOf(settings).showAtStart);
  useEffect(() => { if (open) shownThisLaunch = true; }, [open]);
  // Not shown at all: whatever waits for the welcome (the software offer) may go on.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (!open && onClose) onClose(); }, []);
  // The tour started some other way (menu, start page): the welcome closes.
  useEffect(() => {
    if (!open) return undefined;
    const on = () => { setOpen(false); if (onClose) onClose(); };
    window.addEventListener('mcc-tour-start', on);
    return () => window.removeEventListener('mcc-tour-start', on);
  }, [open, onClose]);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape' && e.isTrusted) { e.stopPropagation(); later(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });
  if (!open) return null;

  const s = L[getLanguage() === 'en' ? 'en' : 'ko'];
  const tut = tutorialOf(settings);
  const canResume = tut.lastIndex > 0 && tut.lastIndex < STEPS.length - 1;
  const finish = (patch) => {
    setOpen(false);
    if (onPatch && patch) onPatch(patch);
    if (onClose) onClose();
  };
  function later() { finish(keep !== tut.showAtStart ? laterPatch(settings, keep) : null); }
  const start = (index) => {
    finish(keep !== tut.showAtStart ? startPatch(settings, keep) : null);
    setTimeout(() => startTour({ index }), 50);
  };

  return (
    <div className="mcc-welcome-back" data-testid="tutorial-welcome">
      <div className="mcc-welcome" role="dialog" aria-label={s.title} data-tour="tutorial-welcome">
        <div className="mcc-welcome-head">
          <Icon name="graduation" size={16} /><b>{s.head}</b>
          <CloseButton className="mcc-guide-x" title={s.close} aria-label={s.close} onClick={later} size={14} />
        </div>
        <div className="mcc-welcome-body">
          <div className="mcc-welcome-icon"><Icon name="graduation" size={30} /></div>
          <div>
            <h3>{s.title}</h3>
            <p>{fill(s.body, { chapters: CHAPTERS.length, steps: STEPS.length })}</p>
            <p>{canResume ? fill(s.resume, { n: tut.lastIndex + 1 }) : s.hint}</p>
            <div className="mcc-welcome-prefs" data-tour="welcome-prefs">
              <IconSelect value={getLanguage()} width={150} ariaLabel={t('tip_language')} title={t('tip_language')} icon="globe" onChange={(v) => onPatch && onPatch({ language: v })}
                options={[{ value: 'ko', label: '한국어', icon: 'globe' }, { value: 'en', label: 'English', icon: 'globe' }]} />
              <IconSelect value={(settings && settings.theme) || 'midnight'} width={210} ariaLabel={t('tip_theme')} title={t('tip_theme')} icon="palette" onChange={(v) => onPatch && onPatch({ theme: v })}
                options={allThemes().map((th) => ({ value: th.id, label: getLanguage() === 'ko' ? th.label : th.labelEn || th.label, icon: 'palette' }))} />
            </div>
          </div>
        </div>
        <div className="mcc-welcome-foot">
          <label className="mcc-check"><input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} data-testid="tutorial-welcome-show" />{s.show}</label>
          <span className="mcc-tour-grow" />
          <button type="button" className="mcc-btn" onClick={later} data-testid="tutorial-welcome-later">{s.later}</button>
          {canResume && <button type="button" className="mcc-btn" onClick={() => start(tut.lastIndex)}><Icon name="history" size={14} />{s.resumeBtn}</button>}
          <button type="button" className="mcc-btn primary" onClick={() => start(0)} data-testid="tutorial-welcome-start"><Icon name="play" size={14} />{s.start}</button>
        </div>
      </div>
    </div>
  );
}

export default TutorialWelcome;
