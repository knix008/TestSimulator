// A separate desktop window (Electron only): settings, info, shortcuts or print,
// opened by the main window through popup:open and loaded with
// ?popup=<kind>. It shows the same dialog content, embedded (no backdrop, the
// title bar is the window's drag region), reads the session itself and
// keeps the main window in sync: every settings change is saved and sent to
// the other windows (settings:patch), and patches from them — a theme or
// language change made in the editor — are applied here too. The window
// closes with the main window (it is its child).
import React, { useEffect, useRef, useState } from 'react';
import { call, windowControl, sendSettingsPatch, onSettingsPatch, onPrintJob, takePrintJob } from './lib/backend';
import { setLanguage, useLanguage, t } from './lib/i18n';
import { applyTheme, setCustomThemes } from './themes';
import { pickSettings } from './lib/settings';
import { SettingsDialog } from './dialogs/SettingsDialog';
import { AboutDialog, ShortcutsDialog } from './dialogs/Dialogs';
import { PrintPreviewDialog } from './dialogs/PrintPreviewDialog';
import { ProgressHost } from './dialogs/ProgressDialog';

export function PopupWindow({ kind, tab = '' }) {
  useLanguage();
  const [settings, setSettingsState] = useState(null);
  const settingsRef = useRef(null); settingsRef.current = settings;
  const [showTab, setShowTab] = useState(tab);   // the settings tab asked for (URL, or a settingsTab patch from the main window)
  const [info, setInfo] = useState(null);
  const [shells, setShells] = useState([]);
  const [folder, setFolder] = useState('');
  const [tools, setTools] = useState(null);   // the formatters per language, from the backend's one-time lookup (the 정렬 tab shows it as it is)

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
      setFolder(session.folder || '');
      document.title = t(kind === 'settings' ? 'settings_title' : kind === 'about' ? 'about_title' : kind === 'print' ? 'print_title' : 'shortcuts_title');
      if (kind === 'settings') {
        call('term.shells', { refresh: true }).then((x) => { if (alive) setShells(x || []); }).catch(() => {});
        call('format.tools', { dir: session.folder || '' }).then((x) => { if (alive) setTools(x || {}); }).catch(() => {});
      }
    })();
    // Changes made in another window.
    const off = onSettingsPatch((patch) => {
      if (patch.formatToolsAt) return;   // a note for the main window only (see SettingsDialog onTools)
      if (patch.settingsTab) { setShowTab(patch.settingsTab + ':' + Date.now()); return; }   // the main window asks for a tab (⚙ in the terminal header)
      setSettingsState((prev) => (prev ? { ...prev, ...patch } : prev));
      if (patch.customThemes !== undefined) setCustomThemes(patch.customThemes);
      if (patch.theme !== undefined || patch.customThemes !== undefined) { const cur = { ...(settingsRef.current || {}), ...patch }; if (cur.theme) applyTheme(cur.theme); }
      if (patch.language !== undefined) setLanguage(patch.language);
    });
    // The window is kept loaded and only hidden when closed (electron/main.js POPUP_KEEP),
    // so it reads the session again whenever it comes back — it can have been away a while.
    const onFocus = () => {
      call('session.get').then((session) => { if (!alive || !session) return; const s = pickSettings(session); setLanguage(s.language); setCustomThemes(s.customThemes); applyTheme(s.theme); setSettingsState(s); setFolder(session.folder || ''); }).catch(() => {});
    };
    window.addEventListener('focus', onFocus);
    return () => { alive = false; off(); window.removeEventListener('focus', onFocus); };
  }, [kind]);

  const change = (patch) => {
    const rest = { ...patch };
    delete rest.formatToolsAt;
    delete rest.lintToolsAt;
    if (Object.keys(rest).length) {
      setSettingsState((prev) => ({ ...prev, ...rest }));
      if (rest.customThemes !== undefined) setCustomThemes(rest.customThemes);
      if (rest.theme !== undefined || rest.customThemes !== undefined) { const th = applyTheme({ ...(settingsRef.current || {}), ...rest }.theme); call('session.save', { themeBg: th.tokens['--bg'] }).catch(() => {}); }
      if (rest.language !== undefined) setLanguage(rest.language);
      call('session.save', rest).catch(() => {});
    }
    sendSettingsPatch(patch);
  };
  const close = () => windowControl('close');

  if (!settings) return <div className="popup-loading" />;
  if (kind === 'about') return <AboutDialog embedded info={info} onClose={close} />;
  if (kind === 'shortcuts') return <ShortcutsDialog embedded onClose={close} />;
  if (kind === 'print') return <PrintPopup settings={settings} onPrintOpts={change} onClose={close} />;
  // A rescan / install in this window: the main window's toolbar label follows (it re-reads the backend's list).
  return <SettingsDialog embedded initialTab={showTab} settings={settings} encodings={(info && info.encodings) || []} shells={shells} formatDir={folder} tools={tools} onTools={(x) => { setTools(x); sendSettingsPatch({ formatToolsAt: Date.now() }); }} onChange={change} onClose={close} />;
}

function PrintPopup({ settings, onPrintOpts, onClose }) {
  const [job, setJob] = useState(null);
  useEffect(() => {
    let alive = true;
    takePrintJob().then((j) => { if (alive && j) setJob(j); }).catch(() => {});
    const off = onPrintJob((j) => { if (alive && j) setJob(j); });
    return () => { alive = false; off(); };
  }, []);
  if (!job) return <div className="popup-loading" />;
  return (
    <>
      <PrintPreviewDialog embedded html={job.html} title={job.title} path={job.path} lang={job.lang} text={job.text} lineHtml={job.lineHtml} code={job.code} settings={settings} onPrintOpts={onPrintOpts} onResult={onClose} />
      <ProgressHost />
    </>
  );
}

export default PopupWindow;
