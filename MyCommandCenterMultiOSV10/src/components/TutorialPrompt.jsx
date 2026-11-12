// Asked once when the program starts: run the tutorial now? The "show next time" box is
// the tutorialPrompt setting (also on the Start screen tab of Settings) and is saved the
// moment it changes, so it sticks even when the popup goes away on its own (App closes it
// as soon as the start screen gives way to the file panels).
import React from 'react';
import { t, useLanguage } from '../lib/i18n';
import { DialogFrame } from '../dialogs/Dialogs';

export function TutorialPrompt({ showNext = true, onShowNext, onRun, onClose }) {
  useLanguage();
  return (
    <DialogFrame title={t('tut_prompt_title')} icon="play" width={440} className="tutorial-prompt" onClose={onClose}
      footer={<>
        <label className="check tut-prompt-again">
          <input type="checkbox" checked={showNext !== false} onChange={(e) => onShowNext(e.target.checked)} />
          <span>{t('tut_prompt_again')}</span>
        </label>
        <span className="spacer" />
        <button type="button" className="btn" onClick={onClose}>{t('tut_prompt_later')}</button>
        <button type="button" className="btn primary" onClick={onRun}>{t('tut_prompt_run')}</button>
      </>}>
      <p className="pre">{t('tut_prompt_text')}</p>
    </DialogFrame>
  );
}
