// App settings (⚙ on the toolbar): language, theme, font size and the
// behaviour switches. Values live in the session file; App applies them
// when the dialog is confirmed.
import React, { useState } from 'react';
import { t, useLanguage } from '../lib/i18n';
import { THEMES } from '../themes';
import { DialogFrame } from './Dialogs';
import { SETTINGS_DEFAULTS } from '../lib/settings';
import { isElectron } from '../lib/backend';

export function SettingsDialog({ spec, done }) {
  const lang = useLanguage();
  const [v, setV] = useState({ ...SETTINGS_DEFAULTS, ...(spec.values || {}) });
  const set = (k, val) => setV((s) => ({ ...s, [k]: val }));
  const submit = (e) => { if (e) e.preventDefault(); done(v); };
  return (
    <DialogFrame title={t('settings_title')} onClose={() => done(null)} icon="settings" width={520}
      footer={<>
        <button className="btn" onClick={() => done(null)}>{t('cancel')}</button>
        <button className="btn primary" onClick={submit}>{t('ok')}</button>
      </>}>
      <form onSubmit={submit} className="form-grid settings-grid">
        <label>{t('set_language')}</label>
        <select value={v.language} onChange={(e) => set('language', e.target.value)}>
          <option value="ko">한국어</option>
          <option value="en">English</option>
        </select>

        <label>{t('set_theme')}</label>
        <select value={v.theme} onChange={(e) => set('theme', e.target.value)}>
          {THEMES.map((th) => <option key={th.id} value={th.id}>{lang === 'ko' ? th.label : th.labelEn}</option>)}
        </select>

        <label>{t('set_font_size')}</label>
        <select value={v.fontSize} onChange={(e) => set('fontSize', Number(e.target.value))}>
          {[11, 12, 13, 14, 15, 16, 18].map((n) => <option key={n} value={n}>{n} px</option>)}
        </select>

        <span />
        <label className="check"><input type="checkbox" checked={!!v.confirmStop} onChange={(e) => set('confirmStop', e.target.checked)} /> {t('set_confirm_stop')}</label>
        <span />
        <label className="check"><input type="checkbox" checked={!!v.autoStart} onChange={(e) => set('autoStart', e.target.checked)} /> {t('set_auto_start')}</label>
        {isElectron && <>
          <span />
          <label className="check"><input type="checkbox" checked={!!v.minimizeToTray} onChange={(e) => set('minimizeToTray', e.target.checked)} /> {t('set_tray')}</label>
        </>}
        <span />
        <label className="check"><input type="checkbox" checked={!!v.sounds} onChange={(e) => set('sounds', e.target.checked)} /> {t('set_sounds')}</label>
      </form>
    </DialogFrame>
  );
}
