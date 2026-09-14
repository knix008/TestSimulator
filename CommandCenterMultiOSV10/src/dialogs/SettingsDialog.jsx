// Settings (⚙ on the toolbar). Values live in the session file; App applies
// them when the dialog is confirmed.
import React, { useState } from 'react';
import { t, useLanguage } from '../lib/i18n';
import { THEMES } from '../themes';
import { DialogFrame } from './Dialogs';

export const SETTINGS_DEFAULTS = {
  language: 'ko',
  theme: 'midnight',
  showHidden: false,
  fontSize: 13,
  confirmDelete: true,
  splitSizeMB: 10,
  restoreFolders: true,
  autoRefresh: true,
};

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

        <label>{t('set_split_size')}</label>
        <div className="row">
          <input value={v.splitSizeMB} inputMode="numeric" style={{ width: 90 }}
            onChange={(e) => set('splitSizeMB', Math.max(1, parseInt(e.target.value.replace(/[^\d]/g, ''), 10) || 1))} />
          <span className="muted">MB</span>
        </div>

        <span />
        <label className="check"><input type="checkbox" checked={!!v.showHidden} onChange={(e) => set('showHidden', e.target.checked)} /> {t('show_hidden')}</label>
        <span />
        <label className="check"><input type="checkbox" checked={!!v.confirmDelete} onChange={(e) => set('confirmDelete', e.target.checked)} /> {t('set_confirm_delete')}</label>
        <span />
        <label className="check"><input type="checkbox" checked={!!v.restoreFolders} onChange={(e) => set('restoreFolders', e.target.checked)} /> {t('set_restore_folders')}</label>
        <span />
        <label className="check"><input type="checkbox" checked={!!v.autoRefresh} onChange={(e) => set('autoRefresh', e.target.checked)} /> {t('set_auto_refresh')}</label>
      </form>
    </DialogFrame>
  );
}
