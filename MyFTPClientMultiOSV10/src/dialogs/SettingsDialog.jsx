// Settings (⚙ on the toolbar). Values live in the session file; App applies
// them when the dialog is confirmed.
import React, { useState } from 'react';
import { t, useLanguage } from '../lib/i18n';
import { call } from '../lib/backend';
import { THEMES, themeById, themeSwatchStyle } from '../themes';
import { DialogFrame } from './Dialogs';
import { ContextMenu } from '../components/ContextMenu';
import { Icon } from '../components/Icons';
import { SETTINGS_DEFAULTS } from '../lib/settings';

export function SettingsDialog({ spec, done }) {
  const lang = useLanguage();
  const localDir = spec.localDir || '';
  const [v, setV] = useState({
    ...SETTINGS_DEFAULTS,
    ...(spec.values || {}),
    lastLocalPath: localDir || (spec.values && spec.values.lastLocalPath) || '',
  });
  const [themeEl, setThemeEl] = useState(null);
  const set = (k, val) => setV((s) => ({ ...s, [k]: val }));
  const currentTheme = themeById(v.theme);
  const themeName = lang === 'ko' ? currentTheme.label : currentTheme.labelEn;
  const canPick = !!spec.canPickFolder;
  const submit = (e) => {
    if (e) e.preventDefault();
    done({
      ...v,
      terminalStartDir: String(v.terminalStartDir || '').trim(),
      lastLocalPath: String(v.lastLocalPath || '').trim(),
    });
  };

  const pickFolder = async (key) => {
    try {
      const r = await call('local.pickFolder', { start: v[key] || localDir });
      if (r && r.path) set(key, r.path);
    } catch { /* web host has no native picker */ }
  };
  return (
    <DialogFrame title={t('settings_title')} onClose={() => done(null)} icon="settings" width={500}
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
        <button type="button" className="theme-select-btn" title={t('set_theme')}
          onClick={(e) => setThemeEl((el) => (el ? null : e.currentTarget))}>
          <span className="theme-swatch" style={themeSwatchStyle(currentTheme)} />
          <span className="ellipsis">{themeName}</span>
          <Icon name="chevronDown" size={14} />
        </button>

        <label>{t('set_font_size')}</label>
        <select value={v.fontSize} onChange={(e) => set('fontSize', Number(e.target.value))}>
          {[11, 12, 13, 14, 15, 16, 18].map((n) => <option key={n} value={n}>{n} px</option>)}
        </select>

        <label>{t('set_local_cwd')}</label>
        <div className="path-pick">
          <input type="text" value={v.lastLocalPath || ''} placeholder={t('set_local_cwd_placeholder')}
            onChange={(e) => set('lastLocalPath', e.target.value)} title={t('set_local_cwd_hint')} />
          {canPick && (
            <button type="button" className="btn icon" title={t('set_local_cwd_browse')} onClick={() => pickFolder('lastLocalPath')}>
              <Icon name="folder" size={14} />
            </button>
          )}
        </div>

        <label>{t('set_term_cwd')}</label>
        <div className="path-pick">
          <input type="text" value={v.terminalStartDir || ''} placeholder={t('set_term_cwd_placeholder')}
            onChange={(e) => set('terminalStartDir', e.target.value)} title={t('set_term_cwd_hint')} />
          {canPick && (
            <button type="button" className="btn icon" title={t('set_term_cwd_browse')} onClick={() => pickFolder('terminalStartDir')}>
              <Icon name="folder" size={14} />
            </button>
          )}
        </div>

        <label>{t('set_transfer_concurrency')}</label>
        <select value={Number(v.transferConcurrency) || 3} onChange={(e) => set('transferConcurrency', Number(e.target.value))} title={t('set_transfer_concurrency_hint')}>
          {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
        </select>

        <span />
        <label className="check"><input type="checkbox" checked={!!v.confirmDelete} onChange={(e) => set('confirmDelete', e.target.checked)} /> {t('set_confirm_delete')}</label>
        <span />
        <label className="check"><input type="checkbox" checked={!!v.restoreLocalPath} onChange={(e) => set('restoreLocalPath', e.target.checked)} /> {t('set_restore_local')}</label>
        <span />
        <label className="check"><input type="checkbox" checked={!!v.sounds} onChange={(e) => set('sounds', e.target.checked)} /> {t('set_sounds')}</label>
        <span />
        <label className="check"><input type="checkbox" checked={!!v.showConnectedDialog} onChange={(e) => set('showConnectedDialog', e.target.checked)} /> {t('set_connected_dialog')}</label>
        <span />
        <label className="check"><input type="checkbox" checked={v.skipUnchanged !== false} onChange={(e) => set('skipUnchanged', e.target.checked)} /> {t('set_skip_unchanged')}</label>
      </form>
      {themeEl && (
        <ContextMenu className="theme-pick" anchorEl={themeEl} x={0} y={0}
          items={THEMES.map((th) => ({
            id: th.id,
            label: lang === 'ko' ? th.label : th.labelEn,
            checked: th.id === currentTheme.id,
            swatch: th.tokens['--accent'],
            swatchBg: th.tokens['--bg'],
          }))}
          onClose={() => setThemeEl(null)}
          onPick={(id) => { set('theme', id); setThemeEl(null); }} />
      )}
    </DialogFrame>
  );
}
