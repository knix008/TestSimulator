import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import SettingsForm from './SettingsForm';
import { THEMES } from '../lib/themes';
import { IconSettings, IconX } from './Icons';
import { DEFAULT_EXPORT_SETTINGS } from '../lib/markdown';
import { saveSettingsToDisk } from '../lib/platform';

const THEME_IDS = THEMES.map((t) => t.id);

function loadSettings() {
  try {
    const raw = localStorage.getItem('mmm-export');
    if (raw) return { ...DEFAULT_EXPORT_SETTINGS, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...DEFAULT_EXPORT_SETTINGS };
}

// Rendered as the whole document in the separate settings window
// (Electron BrowserWindow or web popup). State is synced to the main window
// through localStorage + the `storage` event.
export default function SettingsPage() {
  const { t } = useTranslation();
  const [settings, setSettings] = useState(loadSettings);
  const [theme, setTheme] = useState(() => {
    const s = localStorage.getItem('mmm-theme');
    return THEME_IDS.includes(s) ? s : 'dark';
  });
  const [lang, setLang] = useState(i18n.language);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('mmm-theme', theme);
    saveSettingsToDisk();
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('mmm-export', JSON.stringify(settings));
    saveSettingsToDisk();
  }, [settings]);

  // Reflect changes made in the main window.
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === 'mmm-export' && e.newValue) {
        try { setSettings({ ...DEFAULT_EXPORT_SETTINGS, ...JSON.parse(e.newValue) }); } catch { /* ignore */ }
      } else if (e.key === 'mmm-theme' && e.newValue && THEME_IDS.includes(e.newValue)) {
        setTheme(e.newValue);
      } else if (e.key === 'mmm-lang' && e.newValue) {
        i18n.changeLanguage(e.newValue); setLang(e.newValue);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const patch = (p) => setSettings((s) => ({ ...s, ...p }));
  const resetAll = () => {
    if (typeof window !== 'undefined' && window.confirm && !window.confirm(t('settings.resetConfirm'))) return;
    setSettings({ ...DEFAULT_EXPORT_SETTINGS });
  };
  const changeLang = (l) => { i18n.changeLanguage(l); localStorage.setItem('mmm-lang', l); setLang(l); saveSettingsToDisk(); };

  return (
    <div className="settings-page">
      <div className="settings-page-head">
        <div className="modal-title">
          <span className="mh-icon"><IconSettings size={18} /></span>
          <h2>{t('settings.title')}</h2>
        </div>
        <button className="iconbtn" onClick={() => window.close()} title={t('about.close')}><IconX /></button>
      </div>
      <div className="settings-page-body">
        <SettingsForm
          settings={settings}
          onChange={patch}
          theme={theme}
          onTheme={setTheme}
          lang={lang}
          onLang={changeLang}
        />
      </div>
      <div className="settings-page-foot">
        <button className="btn" onClick={resetAll}>{t('settings.resetAll')}</button>
        <span style={{ flex: 1 }} />
        <button className="btn primary" onClick={() => window.close()}>{t('settings.ok')}</button>
      </div>
    </div>
  );
}
