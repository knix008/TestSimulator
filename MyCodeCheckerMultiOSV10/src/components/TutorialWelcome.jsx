// The start guide shown when the app starts (settings.tutorial.showAtStart):
// a short introduction of the program and what to do first — the tutorial,
// the user's guide, a sample project, or straight to work — with
// "시작할 때마다 이 안내 보기". Shown once per launch; the same switch is in
// Settings › 일반 and Settings › 튜토리얼.
//
// App: <TutorialWelcome settings={ws.settings} onPatch={patchSettings} />
// (render it after the workspace is in, not on the login screen).
import React, { useEffect, useState } from 'react';
import { getLanguage, useLanguage, t } from '../lib/i18n';
import { IconSelect } from '../views/common';
import { allThemes } from '../themes';
import { Icon, CloseButton } from './Chrome';
import { broadcast } from '../lib/popups';
import { shouldShowWelcome, tutorialOf, laterPatch } from '../lib/tutorialSettings';
import { STEPS, CHAPTERS } from '../lib/tutorialSteps';
import '../tutorial.css';

const L = {
  ko: {
    head: '시작 안내',
    title: 'MyCodeChecker에 오신 것을 환영합니다',
    body: 'MyCodeChecker는 내 컴퓨터에서 소스 코드의 품질과 보안을 점검하는 도구입니다. 폴더나 Git 저장소를 분석해 결과를 한 화면에 모아 보여 줍니다.',
    features: [
      ['bug', '버그·취약점·코드 스멜·보안 핫스폿을 찾아 등급으로 보여 줍니다'],
      ['gate', '품질 게이트와 품질 프로필, 중복 코드와 커버리지'],
      ['sparkle', 'AI 코드 수정과 정밀 결함 분석'],
      ['report', '보안·규정 보고서, 포트폴리오, CI 스캐너'],
    ],
    choose: '무엇부터 할까요?',
    tour: '튜토리얼', tourSub: '{chapters}개 장 {steps}단계로 실제 화면을 움직이며 설명합니다',
    resume: '튜토리얼 이어서 보기', resumeSub: '지난번에 {n}단계까지 보았습니다',
    guide: '사용 설명서', guideSub: '모든 메뉴와 기능을 문서로 찾아봅니다',
    sample: '예제로 시작', sampleSub: '예제 프로젝트를 열고 바로 분석해 봅니다',
    skip: '바로 시작', skipSub: '안내를 닫고 작업을 시작합니다',
    hint: '이 안내는 도움말 메뉴와 설정 › 일반에서 다시 켤 수 있습니다.',
    show: '시작할 때마다 이 안내 보기',
    close: '닫기',
  },
  en: {
    head: 'Getting started',
    title: 'Welcome to MyCodeChecker',
    body: 'MyCodeChecker checks the quality and security of source code on your own computer. It analyses a folder or Git repository and brings the results together on one screen.',
    features: [
      ['bug', 'Finds bugs, vulnerabilities, code smells and security hotspots, with ratings'],
      ['gate', 'Quality gates and profiles, duplications and coverage'],
      ['sparkle', 'AI code fix and in-depth defect analysis'],
      ['report', 'Security and compliance reports, portfolios, a CI scanner'],
    ],
    choose: 'What would you like to do first?',
    tour: 'Tutorial', tourSub: '{chapters} chapters, {steps} steps on the real screen',
    resume: 'Continue the tutorial', resumeSub: 'Last time you reached step {n}',
    guide: "User's guide", guideSub: 'Look up every menu and feature',
    sample: 'Try a sample', sampleSub: 'Open a sample project and analyse it',
    skip: 'Just start', skipSub: 'Close this guide and get to work',
    hint: 'You can turn this guide back on in Settings › General.',
    show: 'Show this guide every time the program starts',
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

function openGuide() {
  const guide = window.__mcc && window.__mcc.openGuide;
  if (typeof guide === 'function') guide('guide');
  else broadcast('mcc-open-guide', 'guide').catch(() => {});
}

function runAction(id) {
  const act = window.__mcc && window.__mcc.action;
  if (typeof act === 'function') act(id);
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
  const canResume = tut.lastIndex > 0 && tut.lastIndex < STEPS.length - 1 && !tut.done;
  // Every choice closes the guide and keeps the check box as it was left.
  const finish = (then) => {
    setOpen(false);
    if (onPatch && keep !== tut.showAtStart) onPatch(laterPatch(settings, keep));
    if (onClose) onClose();
    if (then) setTimeout(then, 50);
  };
  function later() { finish(null); }
  const choices = [
    canResume
      ? { id: 'resume', icon: 'history', label: s.resume, sub: fill(s.resumeSub, { n: tut.lastIndex + 1 }), run: () => startTour({ index: tut.lastIndex }) }
      : { id: 'start', icon: 'graduation', label: s.tour, sub: fill(s.tourSub, { chapters: CHAPTERS.length, steps: STEPS.length }), run: () => startTour({ index: 0 }) },
    { id: 'guide', icon: 'book', label: s.guide, sub: s.guideSub, run: openGuide },
    { id: 'sample', icon: 'play', label: s.sample, sub: s.sampleSub, run: () => runAction('openSample') },
    { id: 'later', icon: 'home', label: s.skip, sub: s.skipSub, run: null },
  ];

  return (
    <div className="mcc-welcome-back" data-testid="tutorial-welcome">
      <div className="mcc-welcome" role="dialog" aria-label={s.title} data-tour="tutorial-welcome">
        <div className="mcc-welcome-head">
          <Icon name="info" size={16} /><b>{s.head}</b>
          <CloseButton className="mcc-guide-x" title={s.close} aria-label={s.close} onClick={later} size={14} />
        </div>
        <div className="mcc-welcome-body">
          <div className="mcc-welcome-icon"><Icon name="shieldCheck" size={30} /></div>
          <div className="mcc-welcome-main">
            <h3>{s.title}</h3>
            <p>{s.body}</p>
            <ul className="mcc-welcome-features">
              {s.features.map(([icon, text]) => <li key={icon}><Icon name={icon} size={14} />{text}</li>)}
            </ul>
            <div className="mcc-welcome-choose">{s.choose}</div>
            <div className="mcc-welcome-choices">
              {choices.map((c) => (
                <button key={c.id} type="button" className={`mcc-welcome-choice ${c.id === 'start' || c.id === 'resume' ? 'lead' : ''}`}
                  onClick={() => finish(c.run)} data-testid={`tutorial-welcome-${c.id}`}>
                  <Icon name={c.icon} size={20} />
                  <span><b>{c.label}</b><small>{c.sub}</small></span>
                </button>
              ))}
            </div>
            <div className="mcc-welcome-prefs" data-tour="welcome-prefs">
              <IconSelect value={getLanguage()} width={150} ariaLabel={t('tip_language')} title={t('tip_language')} icon="globe" onChange={(v) => onPatch && onPatch({ language: v })}
                options={[{ value: 'ko', label: '한국어', icon: 'globe' }, { value: 'en', label: 'English', icon: 'globe' }]} />
              <IconSelect value={(settings && settings.theme) || 'midnight'} width={210} ariaLabel={t('tip_theme')} title={t('tip_theme')} icon="palette" onChange={(v) => onPatch && onPatch({ theme: v })}
                options={allThemes().map((th) => ({ value: th.id, label: getLanguage() === 'ko' ? th.label : th.labelEn || th.label, icon: 'palette' }))} />
            </div>
          </div>
        </div>
        <div className="mcc-welcome-foot">
          <label className="mcc-check" title={s.hint}><input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} data-testid="tutorial-welcome-show" />{s.show}</label>
          <span className="mcc-tour-grow" />
          <button type="button" className="mcc-btn" onClick={later}>{s.close}</button>
        </div>
      </div>
    </div>
  );
}

export default TutorialWelcome;
