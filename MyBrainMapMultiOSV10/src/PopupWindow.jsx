// A separate desktop window: settings, info, shortcuts or help, opened by
// the main window and loaded with ?popup=<kind>. It shows the same dialog
// content, embedded (no backdrop, the title bar is the window's drag
// region), reads the session itself and keeps the main window in sync: every
// settings change is saved and sent to the other windows (settings:patch),
// and patches from them — a theme or language change made in the main
// window — are applied here too. The window closes with the main window.
import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { call, windowControl, sendSettingsPatch, onSettingsPatch, onHelpOpen } from './lib/backend';
import { setLanguage, useLanguage, t } from './lib/i18n';
import { applyTheme, setCustomThemes } from './themes';
import { pickSettings } from './lib/settings';
import { SettingsDialog } from './dialogs/SettingsDialog';
import { AboutDialog, ShortcutsDialog } from './dialogs/Dialogs';

// The help text (every chapter, both languages) is only fetched by the Help window.
const HelpWindow = lazy(() => import('./components/HelpWindow'));

export function PopupWindow({ kind, tab = '' }) {
  useLanguage();
  const [settings, setSettingsState] = useState(null);
  const settingsRef = useRef(null); settingsRef.current = settings;
  const [showTab, setShowTab] = useState(tab);
  const [info, setInfo] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [session, appInfo] = await Promise.all([call('session.get'), call('app.info').catch(() => null)]);
      if (!alive) return;
      const s = pickSettings(session);
      setLanguage(s.language);
      setCustomThemes(s.customThemes);
      applyTheme(s.theme);
      setSettingsState(s);
      setInfo(appInfo);
      document.title = t(kind === 'settings' ? 'settings_title' : kind === 'about' ? 'about_title' : kind === 'help' ? 'help_menu' : 'shortcuts_title');
    })();
    const off = onSettingsPatch((patch) => {
      if (patch.settingsTab) { setShowTab(`${patch.settingsTab}:${Date.now()}`); return; }
      setSettingsState((prev) => (prev ? { ...prev, ...patch } : prev));
      if (patch.customThemes !== undefined) setCustomThemes(patch.customThemes);
      if (patch.theme !== undefined || patch.customThemes !== undefined) { const cur = { ...(settingsRef.current || {}), ...patch }; if (cur.theme) applyTheme(cur.theme); }
      if (patch.language !== undefined) setLanguage(patch.language);
    });
    const offHelp = kind === 'help' ? onHelpOpen((chapter) => setShowTab(chapter)) : () => {};
    // The settings window is kept loaded and only hidden when closed, so it
    // reads the session again whenever it comes back.
    const onFocus = () => {
      call('session.get').then((session) => { if (!alive || !session) return; const s = pickSettings(session); setLanguage(s.language); setCustomThemes(s.customThemes); applyTheme(s.theme); setSettingsState(s); }).catch(() => {});
    };
    window.addEventListener('focus', onFocus);
    return () => { alive = false; off(); offHelp(); window.removeEventListener('focus', onFocus); };
  }, [kind]);

  const change = (patch) => {
    setSettingsState((prev) => ({ ...prev, ...patch }));
    if (patch.customThemes !== undefined) setCustomThemes(patch.customThemes);
    if (patch.theme !== undefined || patch.customThemes !== undefined) { const th = applyTheme({ ...(settingsRef.current || {}), ...patch }.theme); call('session.save', { themeBg: th.tokens['--bg'] }).catch(() => {}); }
    if (patch.language !== undefined) setLanguage(patch.language);
    call('session.save', patch).catch(() => {});
    sendSettingsPatch(patch);
  };
  const close = () => windowControl('close');

  if (!settings) return <div className="popup-loading" />;
  if (kind === 'about') return <AboutDialog embedded info={info} onClose={close} />;
  if (kind === 'shortcuts') return <ShortcutsDialog embedded onClose={close} />;
  if (kind === 'help') return <Suspense fallback={<div className="popup-loading" />}><HelpWindow initialId={showTab} onClose={close} /></Suspense>;
  return <SettingsDialog embedded initialTab={showTab} settings={settings} onChange={change} onClose={close} />;
}

export default PopupWindow;
