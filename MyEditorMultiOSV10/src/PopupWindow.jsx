// A separate desktop window (Electron only): settings, info or shortcuts,
// opened by the main window through popup:open and loaded with
// ?popup=<kind>. It shows the same dialog content, embedded (no backdrop, the
// title bar is the window's drag region), reads the session itself and
// keeps the main window in sync: every settings change is saved and sent to
// the other windows (settings:patch), and patches from them — a theme or
// language change made in the editor — are applied here too. The window
// closes with the main window (it is its child).
import React, { useEffect, useState } from 'react';
import { call, windowControl, sendSettingsPatch, onSettingsPatch } from './lib/backend';
import { setLanguage, useLanguage, t } from './lib/i18n';
import { applyTheme } from './themes';
import { pickSettings } from './lib/settings';
import { SettingsDialog } from './dialogs/SettingsDialog';
import { AboutDialog, ShortcutsDialog } from './dialogs/Dialogs';

export function PopupWindow({ kind }) {
  useLanguage();
  const [settings, setSettingsState] = useState(null);
  const [info, setInfo] = useState(null);
  const [shells, setShells] = useState([]);
  const [folder, setFolder] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      const [session, appInfo] = await Promise.all([call('session.get'), call('app.info').catch(() => null)]);
      if (!alive) return;
      const s = pickSettings(session);
      setLanguage(s.language);
      applyTheme(s.theme);
      setSettingsState(s);
      setInfo(appInfo);
      setFolder(session.folder || '');
      document.title = t(kind === 'settings' ? 'settings_title' : kind === 'about' ? 'about_title' : 'shortcuts_title');
      if (kind === 'settings') call('term.shells').then((x) => { if (alive) setShells(x || []); }).catch(() => {});
    })();
    // Changes made in another window.
    const off = onSettingsPatch((patch) => {
      setSettingsState((prev) => (prev ? { ...prev, ...patch } : prev));
      if (patch.theme !== undefined) applyTheme(patch.theme);
      if (patch.language !== undefined) setLanguage(patch.language);
    });
    return () => { alive = false; off(); };
  }, [kind]);

  const change = (patch) => {
    setSettingsState((prev) => ({ ...prev, ...patch }));
    if (patch.theme !== undefined) { const th = applyTheme(patch.theme); call('session.save', { themeBg: th.tokens['--bg'] }).catch(() => {}); }
    if (patch.language !== undefined) setLanguage(patch.language);
    call('session.save', patch).catch(() => {});
    sendSettingsPatch(patch);
  };
  const close = () => windowControl('close');

  if (!settings) return <div className="popup-loading" />;
  if (kind === 'about') return <AboutDialog embedded info={info} onClose={close} />;
  if (kind === 'shortcuts') return <ShortcutsDialog embedded onClose={close} />;
  return <SettingsDialog embedded settings={settings} encodings={(info && info.encodings) || []} shells={shells} formatDir={folder} onChange={change} onClose={close} />;
}

export default PopupWindow;
