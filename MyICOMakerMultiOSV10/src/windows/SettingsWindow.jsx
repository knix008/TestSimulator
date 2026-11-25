// The settings window (desktop: a frameless window of its own; web: a frame in the main page).
// Tabs: General, Theme (20 dark, 20 light, the custom theme and its editor), Canvas.
// Every change is saved to the shared settings at once; the main window and the other windows
// follow through the storage event, so all windows always wear the same theme.
import React, { useCallback, useEffect, useState } from 'react';
import { setLanguage, t } from '../i18n.js';
import { loadSettings, saveSettings } from '../lib/settings.js';
import { applyTheme, CUSTOM_ID, customTheme, DARK_THEMES, LIGHT_THEMES, THEME_KEYS, themeById } from '../lib/themes.js';
import { invoke, isDesktop, windowControl } from '../lib/platform.js';
import { Btn, Card, ColorField, Icon, IconSelect, Segmented, Slider, Toggle } from '../components/controls.jsx';
import { APP_NAME, dragProps, languageOptions, useListen } from '../components/Chrome.jsx';

export const SETTINGS_TAB_KEY = 'myicomaker.settingsTab';
const TABS = [['general', 'settings'], ['theme', 'palette'], ['canvas', 'grid']];

export default function SettingsWindow({ framed = false, onClose }) {
  const [settings, setState] = useState(() => loadSettings());
  const [tab, setTab] = useState(() => localStorage.getItem(SETTINGS_TAB_KEY) || 'general');
  setLanguage(settings.language);
  const L = settings.language;

  useEffect(() => { applyTheme(settings.theme, undefined, settings.customTheme); }, [settings.theme, settings.customTheme]);
  useEffect(() => {
    document.title = `${t('action.settings')} — ${APP_NAME}`;
    if (isDesktop() && !framed) requestAnimationFrame(() => invoke('window_ready').catch(() => {}));
  }, [framed, L]);
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === 'myicomaker.settings') setState(loadSettings());
      if (e.key === SETTINGS_TAB_KEY && e.newValue) setTab(e.newValue);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);
  useListen('popup-refresh', () => { setState(loadSettings()); setTab(localStorage.getItem(SETTINGS_TAB_KEY) || 'general'); });

  const set = useCallback((patch) => {
    const next = { ...loadSettings(), ...patch };
    saveSettings(next);
    setState(next);
  }, []);
  const close = () => (framed ? onClose?.() : windowControl('close'));

  const current = themeById(settings.theme, settings.customTheme);
  const custom = customTheme(settings.customTheme);
  /** Changes one colour of the custom theme (and switches to it). */
  const setCustom = (key, value) => set({ theme: CUSTOM_ID, customTheme: { base: settings.customTheme?.base ?? current.id, dark: settings.customTheme?.dark, vars: { ...(settings.customTheme?.vars ?? {}), [key]: value } } });
  const startFrom = (id) => set({ theme: CUSTOM_ID, customTheme: { base: id, dark: themeById(id).dark, vars: {} } });

  const tile = (th) => (
    <button key={th.id} type="button" role="radio" aria-checked={settings.theme === th.id} className={`theme-tile ${settings.theme === th.id ? 'on' : ''}`} title={th.name[L]}
      onClick={() => set({ theme: th.id })} data-theme-id={th.id}>
      <span className="theme-chip" aria-hidden="true" style={{ background: th.swatch[0], borderColor: th.swatch[2] }}><i style={{ background: th.swatch[1] }} /><i style={{ background: th.swatch[2] }} /></span>
      <Icon name={th.id === CUSTOM_ID ? 'palette' : th.dark ? 'moon' : 'sun'} size={14} /><span>{th.name[L]}</span>
    </button>
  );

  return (
    <div className={`settings-window ${framed ? 'framed' : ''}`} data-testid="settings-window">
      {!framed && (
        <header className="titlebar" {...dragProps}>
          <Icon name="settings" size={18} />
          <span className="app-name">{t('action.settings')}</span>
          <span className="grow" />
          <div className="win-buttons">
            <button type="button" className="win-btn close" title={t('win.close')} aria-label={t('win.close')} onClick={close}><Icon name="close" size={16} /></button>
          </div>
        </header>
      )}
      <div className="settings-body">
        <nav className="settings-tabs" role="tablist">
          {TABS.map(([id, icon]) => (
            <Btn key={id} icon={icon} label={t(`settings.tab.${id}`)} active={tab === id} role="tab" aria-selected={tab === id} onClick={() => { setTab(id); localStorage.setItem(SETTINGS_TAB_KEY, id); }} data-tab={id} />
          ))}
        </nav>
        <main className="settings-page side-scroll">
          {tab === 'general' && (
            <>
              <Card icon="globe" title={t('action.language')}>
                <IconSelect label={t('action.language')} value={L} options={languageOptions()} onChange={(v) => set({ language: v })} />
              </Card>
              <Card icon="startup" title={t('settings.startScreen')}>
                <Toggle icon="startup" label={t('start.showAtStartup')} checked={settings.showStartScreen} onChange={(v) => set({ showStartScreen: v })} />
                <Slider icon="speed" label={t('start.speed')} value={settings.animationSpeed} min={0} max={300} step={10} unit="%" onChange={(v) => set({ animationSpeed: v })} />
                <Slider icon="opacity" label={t('start.cardOpacity')} value={settings.startCardOpacity} min={20} max={100} step={5} unit="%" onChange={(v) => set({ startCardOpacity: v })} />
                <div className="btn-grid two">
                  <Btn icon="arrange" label={t('start.arrange')} onClick={() => set({ startLayout: null })} />
                  <Btn icon="trash" label={t('start.clearRecent')} danger onClick={() => set({ recent: [] })} />
                </div>
              </Card>
            </>
          )}
          {tab === 'theme' && (
            <>
              <Card icon="moon" title={`${t('start.themeDark')} (${DARK_THEMES.length})`}><div className="theme-tiles five">{DARK_THEMES.map(tile)}</div></Card>
              <Card icon="sun" title={`${t('start.themeLight')} (${LIGHT_THEMES.length})`}><div className="theme-tiles five">{LIGHT_THEMES.map(tile)}</div></Card>
              <Card icon="palette" title={t('theme.custom')} testId="custom-theme-card">
                <p className="hint">{t('theme.customHint')}</p>
                <div className="custom-head">
                  {tile(custom)}
                  <IconSelect label={t('theme.startFrom')} value={settings.customTheme?.base ?? current.id}
                    options={[...DARK_THEMES, ...LIGHT_THEMES].map((th) => ({ value: th.id, label: `${t('theme.startFrom')}: ${th.name[L]}`, icon: th.dark ? 'moon' : 'sun' }))}
                    onChange={startFrom} testId="custom-base" />
                  <Segmented label={t('theme.kind')} value={custom.dark ? 'dark' : 'light'} onChange={(v) => set({ theme: CUSTOM_ID, customTheme: { ...(settings.customTheme ?? { base: current.id, vars: {} }), dark: v === 'dark' } })} options={[
                    { value: 'dark', icon: 'moon', label: t('theme.dark') },
                    { value: 'light', icon: 'sun', label: t('theme.light') },
                  ]} />
                  <Btn icon="refresh" label={t('theme.resetCustom')} onClick={() => startFrom(settings.customTheme?.base ?? current.id)} />
                </div>
                <div className="custom-grid">
                  {THEME_KEYS.filter((k) => k !== 'shadow').map((key) => (
                    <div key={key} className="custom-row" data-key={key}>
                      <span className="ctrl-label"><span>{t(`theme.key.${key}`)}</span></span>
                      <ColorField label={t(`theme.key.${key}`)} value={custom.vars[key]} onChange={(c) => setCustom(key, c)} swatches={false} />
                    </div>
                  ))}
                </div>
              </Card>
            </>
          )}
          {tab === 'canvas' && (
            <>
              <Card icon="grid" title={t('settings.canvasView')}>
                <div className="btn-grid two">
                  <Toggle icon="ruler" label={t('view.rulers')} checked={settings.rulers} onChange={(v) => set({ rulers: v })} />
                  <Toggle icon="grid" label={t('view.grid')} checked={settings.grid} onChange={(v) => set({ grid: v })} />
                  <Toggle icon="snap" label={t('view.snap')} checked={settings.snap} onChange={(v) => set({ snap: v })} />
                  <Toggle icon="guides" label={t('view.guides')} checked={settings.guides} onChange={(v) => set({ guides: v })} />
                  <Toggle icon="preview" label={t('view.preview')} checked={settings.preview} onChange={(v) => set({ preview: v })} />
                </div>
                <p className="hint">{t('settings.gridHint')}</p>
              </Card>
              <Card icon="fill" title={t('panel.newStyle')}>
                <div className="sub-label">{t('props.fill')}</div>
                <ColorField label={t('props.fill')} value={settings.fill} onChange={(c) => set({ fill: c })} />
                <div className="sub-label">{t('props.stroke')}</div>
                <ColorField label={t('props.stroke')} value={settings.stroke} onChange={(c) => set({ stroke: c })} swatches={false} />
                <Slider icon="line" label={t('props.strokeWidth')} value={settings.strokeWidth} min={1} max={80} unit="px" onChange={(v) => set({ strokeWidth: v })} />
              </Card>
            </>
          )}
        </main>
      </div>
      <footer className="settings-foot">
        <span className="muted"><Icon name="info" size={14} /> {t('settings.saved')}</span>
        <span className="grow" />
        <Btn icon="check" label={t('common.close')} primary onClick={close} data-testid="settings-close" />
      </footer>
    </div>
  );
}
