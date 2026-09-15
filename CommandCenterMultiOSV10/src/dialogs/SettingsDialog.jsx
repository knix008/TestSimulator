// Settings (⚙ on the toolbar) — two tabs: general and terminal. Values live in
// the session file; App applies them when the dialog is confirmed.
import React, { useState } from 'react';
import { t, useLanguage } from '../lib/i18n';
import { THEMES } from '../themes';
import { DialogFrame } from './Dialogs';
import { SETTINGS_DEFAULTS } from '../lib/settings';
import { isElectron } from '../lib/backend';

export function SettingsDialog({ spec, done }) {
  const lang = useLanguage();
  const [tab, setTab] = useState('general');
  const [v, setV] = useState({ ...SETTINGS_DEFAULTS, ...(spec.values || {}) });
  const shells = spec.shells || [];
  const set = (k, val) => setV((s) => ({ ...s, [k]: val }));
  const submit = (e) => { if (e) e.preventDefault(); done(v); };
  const tabs = [['general', t('set_general')], ['terminal', t('set_terminal')]];
  // The folder picker is a native dialog on the desktop; in the browser the path is typed.
  const browse = async () => {
    try { const p = await spec.pickFolder(v.termCwd || undefined); if (p) set('termCwd', p); } catch { /* cancelled */ }
  };
  return (
    <DialogFrame title={t('settings_title')} onClose={() => done(null)} icon="settings" width={540}
      footer={<>
        <button className="btn" onClick={() => done(null)}>{t('cancel')}</button>
        <button className="btn primary" onClick={submit}>{t('ok')}</button>
      </>}>
      <div className="settings-tabs">
        {tabs.map(([id, label]) => <button key={id} type="button" className={`settings-tab ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>{label}</button>)}
      </div>
      <form onSubmit={submit} className="settings-pane">
        {tab === 'general' && (
          <div className="form-grid settings-grid">
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
          </div>
        )}
        {tab === 'terminal' && (
          <div className="form-grid settings-grid">
            <label>{t('set_term_shell')}</label>
            <select value={v.termShell || ''} onChange={(e) => set('termShell', e.target.value)}>
              <option value="">{t('set_term_shell_default', { name: shells.length ? shells[0].label : '' })}</option>
              {shells.map((sh) => <option key={sh.id} value={sh.id}>{sh.label}</option>)}
            </select>

            <label>{t('set_term_cwd')}</label>
            <div className="row">
              <input type="text" className="mono" value={v.termCwd || ''} placeholder={t('set_term_cwd_default')} spellCheck={false}
                onChange={(e) => set('termCwd', e.target.value)} style={{ flex: 1, minWidth: 0 }} />
              {isElectron && spec.pickFolder && <button type="button" className="btn" onClick={browse}>{t('set_browse')}</button>}
            </div>
            <span />
            <span className="muted small">{t('set_term_cwd_hint')}</span>
          </div>
        )}
        <button type="submit" hidden />
      </form>
    </DialogFrame>
  );
}

export default SettingsDialog;
