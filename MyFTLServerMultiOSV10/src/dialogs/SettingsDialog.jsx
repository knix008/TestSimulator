// App settings (⚙ on the toolbar) — the same shape as the sibling apps'
// settings window: a fixed-size dialog with tabs along the top, so the form
// never scrolls; the theme picker previews live and Cancel puts the old
// theme back; "Defaults" resets the current tab. Values live in the session
// file; App applies them when the dialog is confirmed.
import React, { useState } from 'react';
import { t, useLanguage } from '../lib/i18n';
import { THEMES, themeById, applyTheme, DEFAULT_THEME } from '../themes';
import { DialogFrame } from './Dialogs';
import { ContextMenu } from '../components/ContextMenu';
import { Icon } from '../components/Icons';
import { SETTINGS_DEFAULTS } from '../lib/settings';
import { isElectron } from '../lib/backend';

const TABS = [
  { id: 'general', label: 'set_tab_general', icon: 'palette' },
  { id: 'behavior', label: 'set_tab_behavior', icon: 'settings' },
];
const FONT_SIZES = [11, 12, 13, 14, 15, 16, 18];

function Option({ checked, onChange, label, hint, disabled }) {
  return (
    <label className={`set-option ${disabled ? 'disabled' : ''}`}>
      <input type="checkbox" checked={!!checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="set-option-text">
        <span className="set-option-label">{label}</span>
        {hint && <span className="set-option-hint">{hint}</span>}
      </span>
    </label>
  );
}

export function SettingsDialog({ spec, done }) {
  const lang = useLanguage();
  const [tab, setTab] = useState('general');
  const [v, setV] = useState({ ...SETTINGS_DEFAULTS, ...(spec.values || {}) });
  const [themeEl, setThemeEl] = useState(null);
  const set = (k, val) => setV((s) => ({ ...s, [k]: val }));
  const initialTheme = (spec.values && spec.values.theme) || DEFAULT_THEME;
  const currentTheme = themeById(v.theme);
  const themeName = (th) => (lang === 'ko' ? th.label : th.labelEn);

  const pickTheme = (id) => { applyTheme(id); set('theme', id); setThemeEl(null); };
  const cancel = () => { applyTheme(initialTheme); done(null); };
  const submit = (e) => {
    if (e) e.preventDefault();
    done({ ...v, fontSize: FONT_SIZES.includes(Number(v.fontSize)) ? Number(v.fontSize) : SETTINGS_DEFAULTS.fontSize });
  };
  // "Defaults" only touches the fields of the visible tab.
  const reset = () => {
    const keys = tab === 'general' ? ['language', 'theme', 'fontSize'] : ['confirmStop', 'autoStart', 'minimizeToTray', 'sounds'];
    const patch = Object.fromEntries(keys.map((k) => [k, SETTINGS_DEFAULTS[k]]));
    if (patch.theme) applyTheme(patch.theme);
    setV((s) => ({ ...s, ...patch }));
  };

  return (
    <DialogFrame title={t('settings_title')} onClose={cancel} icon="settings" width={540} fill className="settings-dlg"
      footer={<>
        <button className="btn" onClick={reset} title={t('set_reset_hint')}>{t('set_reset')}</button>
        <span className="spacer" />
        <button className="btn" onClick={cancel}>{t('cancel')}</button>
        <button className="btn primary" onClick={submit}>{t('ok')}</button>
      </>}>
      <div className="settings-wrap">
        <div className="settings-tabs" role="tablist">
          {TABS.map((item) => (
            <button key={item.id} type="button" role="tab" className={`settings-tab ${tab === item.id ? 'active' : ''}`}
              aria-selected={tab === item.id} onClick={() => setTab(item.id)}>
              <Icon name={item.icon} size={14} />{t(item.label)}
            </button>
          ))}
        </div>
        <form onSubmit={submit} className="settings-pane">
          {tab === 'general' && (
            <div className="form-grid settings-grid">
              <label>{t('set_language')}</label>
              <div className="set-field">
                <select value={v.language} onChange={(e) => set('language', e.target.value)}>
                  <option value="ko">한국어</option>
                  <option value="en">English</option>
                </select>
                <span className="set-option-hint">{t('set_language_hint')}</span>
              </div>

              <label>{t('set_theme')}</label>
              <div className="set-field">
                <button type="button" className="theme-select-btn" title={t('tip_theme')}
                  onClick={(e) => setThemeEl((el) => (el ? null : e.currentTarget))}>
                  <span className="theme-swatch" style={{ background: `linear-gradient(135deg, ${currentTheme.tokens['--bg']} 50%, ${currentTheme.tokens['--accent']} 50%)` }} />
                  <span className="ellipsis">{themeName(currentTheme)}</span>
                  <span className="muted small">{currentTheme.mode === 'dark' ? t('set_theme_dark') : t('set_theme_light')}</span>
                  <Icon name="chevronDown" size={14} />
                </button>
                <span className="set-option-hint">{t('set_theme_hint')}</span>
              </div>

              <label>{t('set_font_size')}</label>
              <div className="set-field">
                <div className="set-font-row">
                  <select value={v.fontSize} onChange={(e) => set('fontSize', Number(e.target.value))}>
                    {FONT_SIZES.map((n) => <option key={n} value={n}>{n} px</option>)}
                  </select>
                  <span className="set-font-sample" style={{ fontSize: `${v.fontSize}px` }}>{t('set_font_sample')}</span>
                </div>
                <span className="set-option-hint">{t('set_font_size_hint')}</span>
              </div>
            </div>
          )}

          {tab === 'behavior' && (
            <div className="set-options">
              <Option checked={v.confirmStop} onChange={(x) => set('confirmStop', x)} label={t('set_confirm_stop')} hint={t('set_confirm_stop_hint')} />
              <Option checked={v.autoStart} onChange={(x) => set('autoStart', x)} label={t('set_auto_start')} hint={t('set_auto_start_hint')} />
              <Option checked={v.minimizeToTray} onChange={(x) => set('minimizeToTray', x)} label={t('set_tray')} hint={isElectron ? t('set_tray_hint') : t('set_desktop_only')} disabled={!isElectron} />
              <Option checked={v.sounds} onChange={(x) => set('sounds', x)} label={t('set_sounds')} hint={t('set_sounds_hint')} />
            </div>
          )}
        </form>
      </div>
      {themeEl && (
        <ContextMenu className="theme-pick" anchorEl={themeEl} x={0} y={0}
          items={THEMES.map((th) => ({ id: th.id, label: themeName(th), checked: th.id === currentTheme.id, swatch: th.tokens['--accent'], swatchBg: th.tokens['--bg'] }))}
          onClose={() => setThemeEl(null)} onPick={pickTheme} />
      )}
    </DialogFrame>
  );
}
