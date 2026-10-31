// App settings (⚙ on the toolbar) — the same shape as the sibling apps'
// settings window: a fixed-size dialog with tabs along the top, so the form
// never scrolls; "Defaults" resets the current tab. Values live in the
// session file; App applies them when the dialog is confirmed.
//
// 테마 tab: custom themes on top (★ cards, "+ new" = a copy of the current
// theme, delete, and the editor — name, dark/light, the 15 base colours),
// then the 20 dark and 20 light built-in themes. Everything previews live;
// Cancel puts the old theme and custom themes back.
import React, { useEffect, useRef, useState } from 'react';
import { t, useLanguage } from '../lib/i18n';
import { themeById, applyTheme, DEFAULT_THEME, setCustomThemes, buildCustomTheme, baseColorsOf, CUSTOM_COLOR_KEYS } from '../themes';
import { DialogFrame } from './Dialogs';
import { Icon, Flag } from '../components/Icons';
import { ThemeItem, ThemeColumns, themeName } from '../components/ThemeGrid';
import { SETTINGS_DEFAULTS } from '../lib/settings';
import { isDesktop } from '../lib/backend';

const TABS = [
  { id: 'general', label: 'set_tab_general', icon: 'settings' },
  { id: 'theme', label: 'set_tab_theme', icon: 'palette' },
  { id: 'behavior', label: 'set_tab_behavior', icon: 'play' },
];
const FONT_SIZES = [11, 12, 13, 14, 15, 16, 18];
const HEX = /^#[0-9a-fA-F]{6}$/;

/** A new custom theme: the base colours of `base` under a fresh id. */
export function customFrom(base, lang) {
  return {
    id: `custom-${Date.now().toString(36)}`,
    label: `${themeName(base, lang)} ${t('set_custom_copy')}`,
    mode: base.mode,
    colors: baseColorsOf(base),
  };
}

function CustomThemeEditor({ customs, current, onPick, onChange, lang }) {
  // Built from the list being edited (the registered one follows a render later).
  const cards = customs.filter((c) => c && c.id && c.colors).map(buildCustomTheme);
  const cur = customs.find((c) => c.id === current) || null;
  const curTheme = cards.find((th) => th.id === current) || themeById(current);
  const shown = cur ? cur.colors : baseColorsOf(curTheme);
  const edit = (patch) => onChange(customs.map((c) => (c.id === cur.id ? { ...c, ...patch } : c)), cur.id);
  const add = () => { const c = customFrom(curTheme, lang); onChange([...customs, c], c.id); };
  const remove = () => onChange(customs.filter((c) => c.id !== cur.id), DEFAULT_THEME);
  const setColor = (k, value) => edit({ colors: { ...cur.colors, [k]: value } });
  return (
    <section className="theme-group custom-theme">
      <div className="theme-group-title"><Icon name="star" size={13} />{t('set_custom_themes')} <span className="muted">({customs.length})</span></div>
      <div className="custom-theme-row">
        <div className="theme-list custom">
          {customs.length
            ? cards.map((th) => <ThemeItem key={th.id} theme={th} active={th.id === current} onPick={onPick} />)
            : <span className="muted small">{t('set_custom_hint')}</span>}
        </div>
        <button type="button" className="btn small" onClick={add} title={t('tip_theme_new_custom')}><Icon name="plus" size={13} />{t('set_custom_add', { name: themeName(curTheme, lang) })}</button>
        <button type="button" className="btn small" disabled={!cur} onClick={remove}><Icon name="trash" size={13} />{t('set_custom_remove')}</button>
      </div>
      <div className={`custom-theme-fields ${cur ? '' : 'disabled'}`}>
        <div className="custom-theme-head">
          <label>{t('set_custom_name')}</label>
          <input type="text" value={cur ? cur.label : ''} disabled={!cur} maxLength={40} onChange={(e) => edit({ label: e.target.value })} />
          <select value={cur ? cur.mode : curTheme.mode} disabled={!cur} onChange={(e) => edit({ mode: e.target.value })}>
            <option value="dark">{t('set_theme_dark')}</option>
            <option value="light">{t('set_theme_light')}</option>
          </select>
        </div>
        <div className="custom-colors">
          {CUSTOM_COLOR_KEYS.map((k) => {
            const value = shown[k] || '';
            return (
              <label key={k} className="custom-color" title={t(`set_color_${k}`)}>
                <span className="custom-color-name">{t(`set_color_${k}`)}</span>
                <input type="color" disabled={!cur} value={HEX.test(value) ? value : '#888888'} onChange={(e) => setColor(k, e.target.value)} />
                <input type="text" className="mono" disabled={!cur} value={value} spellCheck={false} onChange={(e) => setColor(k, e.target.value)} />
              </label>
            );
          })}
        </div>
      </div>
    </section>
  );
}

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
  const [tab, setTab] = useState(spec.tab || 'general');
  const initial = useRef({ theme: (spec.values && spec.values.theme) || DEFAULT_THEME, customs: (spec.values && spec.values.customThemes) || [] });
  const [v, setV] = useState(() => {
    const s = { ...SETTINGS_DEFAULTS, customThemes: [], ...(spec.values || {}) };
    // "+ 사용자 정의 테마" in the toolbar popup: start with a copy of the current theme.
    if (spec.newCustom) { const c = customFrom(themeById(s.theme), lang); s.customThemes = [...s.customThemes, c]; s.theme = c.id; }
    return s;
  });
  const set = (k, val) => setV((s) => ({ ...s, [k]: val }));

  // Live preview of the theme and the custom themes.
  // In its own window (desktop) the main window previews too (spec.onPreview).
  useEffect(() => {
    setCustomThemes(v.customThemes);
    applyTheme(v.theme);
    if (spec.onPreview) spec.onPreview(v.theme, v.customThemes);
  }, [v.theme, v.customThemes]); // eslint-disable-line react-hooks/exhaustive-deps
  const pickTheme = (id) => set('theme', id);
  const changeCustoms = (list, theme) => setV((s) => ({ ...s, customThemes: list, theme: theme || s.theme }));

  const cancel = () => { setCustomThemes(initial.current.customs); applyTheme(initial.current.theme); done(null); };
  const submit = (e) => {
    if (e) e.preventDefault();
    done({ ...v, fontSize: FONT_SIZES.includes(Number(v.fontSize)) ? Number(v.fontSize) : SETTINGS_DEFAULTS.fontSize });
  };
  // "Defaults" only touches the fields of the visible tab (custom themes are kept).
  const reset = () => {
    const keys = { general: ['language', 'fontSize'], theme: ['theme'], behavior: ['confirmStop', 'autoStart', 'minimizeToTray', 'sounds', 'showStartOnLaunch'] }[tab];
    setV((s) => ({ ...s, ...Object.fromEntries(keys.map((k) => [k, SETTINGS_DEFAULTS[k]])) }));
  };

  return (
    <DialogFrame title={t('settings_title')} onClose={cancel} icon="settings" width={700} fill className="settings-dlg"
      footer={<>
        <button className="btn" onClick={reset} title={t('set_reset_hint')}>{t('set_reset')}</button>
        <span className="spacer" />
        <button className="btn" onClick={cancel}>{t('cancel')}</button>
        <button className="btn primary" onClick={submit}>{t('ok')}</button>
      </>}>
      <div className="settings-wrap">
        <div className="settings-tabs" role="tablist">
          {TABS.map((item) => (
            <button key={item.id} type="button" role="tab" data-tab={item.id} className={`settings-tab ${tab === item.id ? 'active' : ''}`}
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
                <div className="set-lang" role="radiogroup" aria-label={t('set_language')}>
                  {[['ko', 'kr', '한국어'], ['en', 'gb', 'English']].map(([code, country, label]) => (
                    <button key={code} type="button" role="radio" aria-checked={v.language === code} data-lang={code}
                      className={`set-lang-btn ${v.language === code ? 'on' : ''}`} onClick={() => set('language', code)}>
                      <Flag country={country} width={22} /><span>{label}</span>
                    </button>
                  ))}
                </div>
                <span className="set-option-hint">{t('set_language_hint')}</span>
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

          {tab === 'theme' && (
            <div className="settings-themes">
              <CustomThemeEditor customs={v.customThemes} current={v.theme} onPick={pickTheme} onChange={changeCustoms} lang={lang} />
              <ThemeColumns current={v.theme} onPick={pickTheme} />
            </div>
          )}

          {tab === 'behavior' && (
            <div className="set-options">
              <Option checked={v.confirmStop} onChange={(x) => set('confirmStop', x)} label={t('set_confirm_stop')} hint={t('set_confirm_stop_hint')} />
              <Option checked={v.autoStart} onChange={(x) => set('autoStart', x)} label={t('set_auto_start')} hint={t('set_auto_start_hint')} />
              <Option checked={v.minimizeToTray} onChange={(x) => set('minimizeToTray', x)} label={t('set_tray')} hint={isDesktop ? t('set_tray_hint') : t('set_desktop_only')} disabled={!isDesktop} />
              <Option checked={v.sounds} onChange={(x) => set('sounds', x)} label={t('set_sounds')} hint={t('set_sounds_hint')} />
              <Option checked={v.showStartOnLaunch !== false} onChange={(x) => set('showStartOnLaunch', x)} label={t('set_show_start')} hint={t('set_show_start_hint')} />
            </div>
          )}
        </form>
      </div>
    </DialogFrame>
  );
}
