// The launch popup: "튜토리얼을 실행할까요?" with [실행] / [나중에] and the
// check box "다음에도 이 창 보이기" (settings.tutorial.askOnLaunch). Shown once
// per launch while askOnLaunch is on; the main window decides when (App.jsx).
import React, { useEffect, useState } from 'react';
import { getLanguage, useLanguage } from '../lib/i18n';
import { Icon, CloseButton } from './Chrome';
import { Btn } from '../views/common';
import { STEPS, CHAPTERS } from '../lib/tutorialSteps';
import '../tutorial.css';

const L = {
  ko: {
    head: '튜토리얼', title: '튜토리얼을 실행할까요?',
    body: '실제 화면을 움직이며 시작 화면, 명령 창과 작업 공간, 편집기, 그림 창(확대·2D/3D·격자), 블록 다이어그램, 설정까지 {chapters}개 장 {steps}단계로 차례로 보여 줍니다.',
    hint: '나중에 시작 화면의 [튜토리얼 실행] 이나 제목 표시줄의 학사모 단추로 언제든 다시 볼 수 있습니다.',
    show: '다음에도 이 창 보이기', run: '실행', later: '나중에', close: '닫기 (Esc)', guide: '사용 설명서',
  },
  en: {
    head: 'Tutorial', title: 'Run the tutorial?',
    body: 'It moves the real screen through the start screen, the Command Window and Workspace, the editor, the figure window (zoom, 2D/3D, grid), block diagrams and settings — {chapters} chapters, {steps} steps.',
    hint: 'You can run it any time later from [Run tutorial] on the start screen or the cap button in the title bar.',
    show: 'Show this window next time', run: 'Run', later: 'Later', close: 'Close (Esc)', guide: 'User manual',
  },
};
const fill = (s, vars) => s.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? vars[k] : `{${k}}`));

/** settings.tutorial with its defaults. */
export function tutorialOf(settings) {
  const t = (settings && settings.tutorial) || {};
  return { askOnLaunch: t.askOnLaunch !== false, done: !!t.done };
}

export function TutorialAsk({ settings, onRun, onLater, onGuide }) {
  useLanguage();
  const [keep, setKeep] = useState(() => tutorialOf(settings).askOnLaunch);
  const s = L[getLanguage() === 'en' ? 'en' : 'ko'];
  const later = () => onLater(keep);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); later(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });
  return (
    <div className="msm-ask-back" data-testid="tutorial-ask">
      <div className="msm-ask" role="dialog" aria-modal="true" aria-label={s.title}>
        <div className="msm-ask-head">
          <Icon name="graduation" size={16} /><b>{s.head}</b>
          <CloseButton className="msm-tour-x" title={s.close} aria-label={s.close} onClick={later} size={14} />
        </div>
        <div className="msm-ask-body">
          <div className="msm-ask-icon"><Icon name="graduation" size={30} /></div>
          <div>
            <h3>{s.title}</h3>
            <p>{fill(s.body, { chapters: CHAPTERS.length, steps: STEPS.length })}</p>
            <p>{s.hint}</p>
          </div>
        </div>
        <div className="msm-ask-foot">
          <label className="msm-check"><input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} data-testid="tutorial-ask-show" />{s.show}</label>
          <span className="msm-ask-grow" />
          {onGuide && <Btn icon="book" label={s.guide} onClick={() => onGuide(keep)} />}
          <Btn icon="close" label={s.later} onClick={later} />
          <Btn icon="play" label={s.run} primary onClick={() => onRun(keep)} />
        </div>
      </div>
    </div>
  );
}

export default TutorialAsk;
