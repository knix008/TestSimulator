// The page of a dialog window (desktop: Settings and About are windows of
// their own — src-tauri dialog_open). It takes the main window's look
// (language, font size, theme, custom themes), renders the one dialog filling
// the window, moves the window by the dialog's title bar, and sends the
// result back (closing the window). About fits its window to its content.
import React, { useEffect, useLayoutEffect, useState } from 'react';
import { setLanguage } from '../lib/i18n';
import { setCustomThemes, applyTheme } from '../themes';
import { submitDialog, previewDialog, dialogReady, startDialogDrag } from '../lib/backend';
import { SettingsDialog } from './SettingsDialog';
import { AboutDialog } from './Dialogs';

const KINDS = { settings: SettingsDialog, about: AboutDialog };

export function DialogWindow({ data }) {
  const { kind, payload = {} } = data;
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    const a = payload.appearance || {};
    setLanguage(a.language === 'en' ? 'en' : 'ko');
    setCustomThemes(a.customThemes);
    applyTheme(a.theme);
    document.documentElement.style.setProperty('--fs', `${Math.max(9, Number(a.fontSize) || 13)}px`);
    document.documentElement.classList.add('dialog-window', `dialog-${kind}`);
    if (payload.title) document.title = payload.title;
    setReady(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Painted: size (About) and show the window.
  useEffect(() => {
    if (!ready) return;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const el = document.querySelector('.dlg');
      dialogReady(kind === 'about' && el ? { width: el.offsetWidth, height: el.offsetHeight } : null);
    }));
  }, [ready, kind]);

  // The title bar moves the window (it has no frame of its own). Windows: the
  // CSS drag region (styles.css) is the system's caption — move, snap. Elsewhere
  // the page asks for the move. Capture phase: DialogFrame's backdrop stops
  // mousedown from bubbling.
  useEffect(() => {
    const down = (e) => {
      window.__mfsPresses = (window.__mfsPresses || 0) + 1;    // smoke: did the press reach the page?
      if (e.button !== 0 || !e.target.closest('.dlg-title') || e.target.closest('button')) return;
      e.preventDefault();
      startDialogDrag();
    };
    document.addEventListener('mousedown', down, true);
    return () => document.removeEventListener('mousedown', down, true);
  }, []);

  const R = KINDS[kind];
  if (!ready || !R) return null;
  const spec = kind === 'settings'
    ? { type: 'settings', values: payload.values, tab: payload.tab, newCustom: payload.newCustom, onPreview: (theme, customThemes) => previewDialog({ theme, customThemes }) }
    : { type: 'about', info: payload.info };
  return <R spec={spec} done={(v) => submitDialog(v === undefined ? null : v)} />;
}

export default DialogWindow;
