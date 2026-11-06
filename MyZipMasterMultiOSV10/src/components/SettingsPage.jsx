import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import { ALL_THEME_IDS, applyCustomTheme, CUSTOM_ID, loadCustomTheme, rememberThemePref, saveCustomTheme, themesByMode } from '../lib/themes';
import { closeThisWindow, invoke, isDesktop } from '../lib/host';
import { IconFlagKR, IconFlagUK, IconSettings, IconX } from './Icons';
import { DEFAULT_SETTINGS, loadSettings, mirrorToDisk, saveSettings } from '../lib/settings';
import { FORMAT_NAMES, LEVELS, SIZE_UNITS, SPLIT_PRESETS } from '../lib/format';
import BackgroundCards from './BackgroundCards';
import Stepper, { SIZE_STEP, SliderStepper } from './Stepper';

const TABS = ['general', 'start', 'extract', 'compress', 'appearance'];

// The whole document of the separate settings window. Every change applies at once: the main
// window hears of it through localStorage and its `storage` event.
export default function SettingsPage() {
  const { t } = useTranslation();
  const [settings, setSettings] = useState(loadSettings);
  const [theme, setTheme] = useState(() => {
    const s = localStorage.getItem('zm-theme');
    return ALL_THEME_IDS.includes(s) ? s : 'dark';
  });
  const [lang, setLang] = useState(i18n.language);
  const [tab, setTab] = useState('general');

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === 'zm-settings' && e.newValue) setSettings(loadSettings());
      else if (e.key === 'zm-custom-theme') applyCustomTheme(loadCustomTheme());
      else if (e.key === 'zm-theme' && ALL_THEME_IDS.includes(e.newValue)) setTheme(e.newValue);
      else if (e.key === 'zm-lang' && e.newValue) {
        i18n.changeLanguage(e.newValue);
        setLang(e.newValue);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const patch = (p) => {
    setSettings((s) => {
      const next = { ...s, ...p };
      saveSettings(next);
      return next;
    });
  };
  const changeLang = (l) => {
    i18n.changeLanguage(l);
    localStorage.setItem('zm-lang', l);
    setLang(l);
    mirrorToDisk();
  };
  const changeTheme = (id) => {
    localStorage.setItem('zm-theme-auto', '0');
    localStorage.setItem('zm-theme', id);
    rememberThemePref(id);
    setTheme(id);
    mirrorToDisk();
  };
  const reset = () => {
    if (window.confirm(t('settings.resetConfirm'))) {
      const next = { ...DEFAULT_SETTINGS, recent: settings.recent };
      setSettings(next);
      saveSettings(next);
    }
  };

  const [shellMenu, setShellMenu] = useState(null);
  useEffect(() => {
    if (isDesktop) invoke('shell_menu_status').then(setShellMenu).catch(() => {});
  }, []);
  const toggleShellMenu = async (on) => {
    await invoke('set_shell_menu', { on, lang }).catch(() => {});
    setShellMenu(await invoke('shell_menu_status'));
  };
  // The custom theme is edited here too: every change shows at once, in every window.
  const [customColors, setCustomColors] = useState(() => loadCustomTheme());
  const editCustom = (key, value) => {
    const next = { ...customColors, [key]: value };
    setCustomColors(next);
    saveCustomTheme(next);
    applyCustomTheme(next);
    changeTheme(CUSTOM_ID);
  };
  const check = (key, label) => (
    <div className="field" key={key}>
      <label />
      <div className="control"><label className="field-check"><input type="checkbox" data-setting={key} checked={!!settings[key]} onChange={(e) => patch({ [key]: e.target.checked })} />{label}</label></div>
    </div>
  );
  const select = (key, label, options) => (
    <div className="field" key={key}>
      <label>{label}</label>
      <div className="control">
        <select data-setting={key} value={settings[key]} onChange={(e) => patch({ [key]: e.target.value })}>
          {options.map(([v, text]) => <option key={v} value={v}>{text}</option>)}
        </select>
      </div>
    </div>
  );

  return (
    <div className="settings-page" data-testid="settings-page">
      <div className="settings-page-head">
        <div className="modal-title">
          <span className="mh-icon"><IconSettings size={18} /></span>
          <h2>{t('settings.title')}</h2>
        </div>
        <button className="iconbtn" onClick={closeThisWindow} title={t('about.close')}><IconX /></button>
      </div>
      <div className="settings-page-body">
        <div className="settings-form">
          <div className="settings-tabs">
            {TABS.map((k) => (
              <button key={k} data-settings-tab={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
                {t(`settings.tab${k[0].toUpperCase()}${k.slice(1)}`)}
              </button>
            ))}
          </div>
          <div className="settings-panel" data-testid="settings-panel">
            {tab === 'general' && (
              <>
                <div className="field">
                  <label>{t('settings.language')}</label>
                  <div className="control">
                    <div className="segmented lang-seg">
                      <button data-lang="ko" className={lang === 'ko' ? 'on' : ''} onClick={() => changeLang('ko')}><IconFlagKR size={16} />한국어</button>
                      <button data-lang="en" className={lang === 'en' ? 'on' : ''} onClick={() => changeLang('en')}><IconFlagUK size={16} />English</button>
                    </div>
                  </div>
                </div>
                <div className="field">
                  <label>{t('settings.uiScale')}</label>
                  <div className="control"><Stepper id="set-scale" value={settings.uiScale} unit="%" step={5} min={80} max={150} onChange={(v) => patch({ uiScale: v })} /></div>
                </div>
                {check('confirmDelete', t('settings.confirmDelete'))}
                {check('showHidden', t('settings.hidden'))}
                {shellMenu && (
                  <div className="field">
                    <label />
                    <div className="control"><label className="field-check"><input type="checkbox" data-testid="shell-menu" checked={shellMenu.on} onChange={(e) => toggleShellMenu(e.target.checked)} />{t('settings.shellMenu')}</label></div>
                  </div>
                )}
                {shellMenu?.platform === 'windows' && (
                  <div className="field">
                    <label>{t('settings.defaultApp')}</label>
                    <div className="control"><button className="btn" data-testid="open-default-apps" onClick={() => invoke('open_default_apps').catch(() => {})}>{t('settings.openDefaultApps')}</button></div>
                  </div>
                )}
              </>
            )}
            {tab === 'start' && (
              <>
                {check('showStart', t('settings.showStart'))}
                <div className="field">
                  <label>{t('settings.startLayout')}</label>
                  <div className="control"><button className="btn" data-testid="reset-start-layout" onClick={() => patch({ startLayout: null })}>{t('settings.resetStartLayout')}</button></div>
                </div>
                <div className="settings-bg-title">{t('start.background')}</div>
                <BackgroundCards value={settings.startBg} onChange={(startBg) => patch({ startBg })} />
                <div className="settings-bg-sliders">
                  <SliderStepper id="set-transparency" label={t('start.transparency')} value={settings.startBgTransparency} unit="%" step={5} min={0} max={95} onChange={(v) => patch({ startBgTransparency: v })} />
                  <SliderStepper id="set-speed" label={t('start.speed')} value={settings.startBgSpeed} unit="%" step={10} min={0} max={300} onChange={(v) => patch({ startBgSpeed: v })} />
                </div>
              </>
            )}
            {tab === 'extract' && (
              <>
                {select('overwrite', t('settings.overwrite'), [
                  ['ask', t('extract.overAsk')],
                  ['overwrite', t('extract.overOverwrite')],
                  ['skip', t('extract.overSkip')],
                  ['rename', t('extract.overRename')],
                  ['update', t('extract.overUpdate')],
                ])}
                {select('encoding', t('settings.encoding'), ['auto', 'euc-kr', 'shift_jis', 'gbk', 'big5', 'utf-8', 'windows-1252'].map((e) => [e, t(`encoding.${e}`)]))}
                {check('extractSubfolder', t('settings.subfolder'))}
                {check('openAfterExtract', t('settings.openAfter'))}
                {check('keepBroken', t('extract.keepBroken'))}
              </>
            )}
            {tab === 'compress' && (
              <>
                {select('format', t('settings.defFormat'), FORMAT_NAMES.map((f) => [f, f.toUpperCase()]))}
                {select('level', t('settings.defLevel'), LEVELS.map((l) => [l, t(`level.${l}`)]))}
                {select('split', t('settings.defSplit'), SPLIT_PRESETS.map((p) => [p.id, p.id === 'none' ? t('create.splitNone') : p.id === 'custom' ? t('create.splitCustom') : p.label]))}
                {settings.split === 'custom' && (
                  <div className="field">
                    <label />
                    <div className="control">
                      <Stepper
                        id="set-split"
                        value={settings.splitText}
                        step={SIZE_STEP[settings.splitUnit] ?? 1}
                        min={1}
                        onChange={(v) => patch({ splitText: v })}
                        unitNode={<select className="stepper-unit-select" data-setting="splitUnit" value={settings.splitUnit} onChange={(e) => patch({ splitUnit: e.target.value })}>{SIZE_UNITS.map((u) => <option key={u}>{u}</option>)}</select>}
                      />
                    </div>
                  </div>
                )}
                {select('zipStyle', t('settings.defZipStyle'), [['span', t('create.zipSpan')], ['numbered', t('create.zipNumbered')]])}
                {select('cipher', t('settings.defCipher'), ['aes256', 'aes128', 'zipcrypto'].map((c) => [c, t(`cipher.${c}`)]))}
                {check('solid', t('settings.defSolid'))}
                {check('smartStore', t('settings.smartStore'))}
              </>
            )}
            {tab === 'appearance' && (
              <>
                <div className="field field-top">
                  <div className="control">
                    <div className="theme-groups">
                      <div className="settings-custom-row" data-testid="settings-custom">
                        <button data-theme-pick={CUSTOM_ID} className={`settings-custom${theme === CUSTOM_ID ? ' on' : ''}`} onClick={() => changeTheme(CUSTOM_ID)}>
                          <span className="theme-swatch-mini" aria-hidden="true">{['bg', 'panel', 'text', 'accent'].map((k) => <i key={k} style={{ background: customColors[k] }} />)}</span>
                          {t('theme.custom')}
                        </button>
                        {['bg', 'panel', 'text', 'accent'].map((key) => (
                          <label key={key} className="settings-custom-color" title={t(`theme.color_${key}`)}>
                            <input type="color" data-custom-color={key} value={customColors[key]} onChange={(e) => editCustom(key, e.target.value)} />
                            <span>{t(`theme.color_${key}`)}</span>
                          </label>
                        ))}
                      </div>
                      {['dark', 'light'].map((mode) => (
                        <div key={mode} className="settings-theme-group">
                          <div className="theme-group-name">{t(`settings.${mode}`)}</div>
                          <div className="theme-menu-grid settings-grid">
                            {themesByMode(mode).map((th) => (
                              <button key={th.id} data-theme-pick={th.id} className={`theme-chip${theme === th.id ? ' on' : ''}`} onClick={() => changeTheme(th.id)} title={t(`theme.${th.id}`)}>
                                <span className="theme-chip-bars">{th.bars.map((c, i) => <i key={i} style={{ background: c }} />)}</span>
                                <span className="theme-chip-name">{t(`theme.${th.id}`)}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
      <div className="settings-page-foot">
        <button className="btn" data-testid="settings-reset" onClick={reset}>{t('settings.resetAll')}</button>
        <span style={{ flex: 1 }} />
        <button className="btn primary" data-testid="settings-ok" onClick={closeThisWindow}>{t('settings.ok')}</button>
      </div>
    </div>
  );
}
