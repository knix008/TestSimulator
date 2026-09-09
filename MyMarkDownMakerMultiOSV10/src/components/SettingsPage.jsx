import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import SettingsForm from './SettingsForm';
import { THEMES } from '../lib/themes';
import { IconSettings, IconX } from './Icons';
import { isElectron, api } from '../lib/platform';
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

  // The window is pinned to one size, so that size has to be the one the form
  // actually needs — measured here rather than kept as a constant somebody has
  // to remember to raise. Language, font and any new section are all accounted
  // for, because this measures what was laid out.
  const bodyRef = useRef(null);
  useEffect(() => {
    if (!isElectron || !api.resizeSettings) return undefined;
    let cancelled = false;
    const fit = () => {
      const body = bodyRef.current;
      const form = body?.querySelector('.settings-form');
      if (cancelled || !body || !form) return;
      // The form is a three-column box, so its own height is the height of the
      // TALLEST column — measure the sections rather than trusting scrollHeight,
      // which says nothing useful once a column has been forced to overflow.
      const top = form.getBoundingClientRect().top;
      let needed = 0;
      for (const section of form.children) {
        needed = Math.max(needed, section.getBoundingClientRect().bottom - top);
      }
      const cs = getComputedStyle(body);
      const pad = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
      // Everything that is not the scrolling body: the title bar and the footer.
      const chrome = document.documentElement.clientHeight - body.clientHeight;
      api.resizeSettings({ height: Math.ceil(needed + pad + chrome) + 4 });
    };
    const id = requestAnimationFrame(fit);
    document.fonts?.ready?.then(fit).catch(() => {});
    return () => { cancelled = true; cancelAnimationFrame(id); };
    // Sections appear and disappear with the settings, and the labels change
    // with the language — so re-measure whenever either moves.
  }, [lang, settings]);

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
      <div className="settings-page-body" ref={bodyRef}>
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
