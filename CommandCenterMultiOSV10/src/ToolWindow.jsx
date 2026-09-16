// A separate tool window: the same bundle started with ?win=<kind>&id=<id>
// (see backend.js openWindow). It boots the session (theme, language, font
// size), fetches its arguments from the host and renders one tool full-size:
//
//   viewer       { path }                       F3
//   editor       { path }                       F4
//   multiRename  { entries, parent }            Ctrl+M
//   search       { root }                       F9
//   settings     { values, shells, platform }   ⚙
//
// Anything that must happen in the main window (refresh a panel, record an
// undo step, navigate, apply settings) is posted over the window message bus
// and handled in App.jsx (onAppMessage).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { call, windowKind, windowId, windowArgs, closeWindow, postToApp, onAppMessage, pickFolder, pickFile, writeClipboardText } from './lib/backend';
import { t, setLanguage, useLanguage } from './lib/i18n';
import { setSeparator, baseName } from './lib/format';
import { applyTheme, themeById, DEFAULT_THEME } from './themes';
import { SETTINGS_DEFAULTS } from './lib/settings';
import { DialogHost, useDialogs } from './dialogs/Dialogs';
import { ViewerDialog, EditorDialog, MultiRenameDialog } from './dialogs/ToolDialogs';
import { SearchDialog } from './dialogs/SearchDialog';
import { SettingsDialog } from './dialogs/SettingsDialog';

function applyFontSize(px) {
  document.documentElement.style.setProperty('--fs', `${Math.max(9, Number(px) || 13)}px`);
}

export default function ToolWindow() {
  useLanguage();
  const dialogs = useDialogs();
  const [info, setInfo] = useState(null);
  const [session, setSession] = useState(null);
  const [args, setArgs] = useState(null);
  const [data, setData] = useState(null);       // viewer / editor: fs.readFile result
  const [mode, setMode] = useState(windowKind); // the viewer can turn into the editor (F4)
  const [error, setError] = useState('');
  const dirtyRef = useRef(false);        // the editor has unsaved changes
  const dialogsRef = useRef(dialogs); dialogsRef.current = dialogs;

  // Loads (or re-loads) this window's arguments and, for the viewer / editor, the file.
  const loadArgs = async () => {
    const a = await windowArgs();
    setArgs(a || {});
    setMode(windowKind);
    if ((windowKind === 'viewer' || windowKind === 'editor') && a && a.path) {
      setData(null);
      try { setData(await call('fs.readFile', { path: a.path })); }
      catch (err) { setError(err.message || String(err)); }
    }
  };

  useEffect(() => {
    (async () => {
      const i = await call('app.info');
      setSeparator(i.sep);
      setInfo(i);
      const s = { ...SETTINGS_DEFAULTS, ...(await call('session.load')) };
      setLanguage(s.language || 'ko');
      applyFontSize(s.fontSize);
      applyTheme(s.theme && s.theme !== 'dark' ? themeById(s.theme).id : DEFAULT_THEME);
      setSession(s);
      await loadArgs();
    })().catch((err) => setError(err.message || String(err)));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // The same tool was requested again (one window per tool): take the new
  // arguments — after asking, when the editor holds unsaved changes.
  useEffect(() => onAppMessage(async (msg) => {
    if (!msg || msg.type !== 'replaceArgs' || String(msg.id) !== String(windowId)) return;
    if (windowKind === 'settings') return;   // the settings window keeps what is being edited
    if (windowKind === 'editor' && dirtyRef.current) {
      const ok = await dialogsRef.current.confirm({ title: t('editor_title'), message: t('editor_discard', { name: baseName((args && args.path) || '') }), danger: true, yesLabel: t('editor_discard_yes'), noLabel: t('cancel') });
      if (!ok) return;
    }
    dirtyRef.current = false;
    setError('');
    loadArgs().catch((err) => setError(err.message || String(err)));
  }), [args]); // eslint-disable-line react-hooks/exhaustive-deps

  // Theme / language / font changes in the main window reach every tool window.
  useEffect(() => onAppMessage((msg) => {
    if (!msg || msg.type !== 'session') return;
    const p = msg.patch || {};
    if (p.theme) applyTheme(p.theme);
    if (p.language) setLanguage(p.language);
    if (p.fontSize) applyFontSize(p.fontSize);
    setSession((s) => (s ? { ...s, ...p } : s));
  }), []);

  const prefs = useMemo(() => session || SETTINGS_DEFAULTS, [session]);
  const path = args && args.path;

  if (error) return <div className="boot">{error}</div>;
  if (!session || !args || ((mode === 'viewer' || mode === 'editor') && !data)) return <div className="boot">…</div>;

  let body = null;
  if (mode === 'viewer') {
    body = (
      <ViewerDialog key={path} spec={{
        path, data, windowed: true, prefs,
        canOpen: !!(info && info.capabilities.open),
        onOpen: () => call('fs.open', { path }).catch((err) => dialogs.error(err)),
      }} done={(r) => {
        if (r === 'edit' && data.kind === 'text' && !data.truncated) setMode('editor');
        else closeWindow();
      }} />
    );
  } else if (mode === 'editor') {
    if (data.kind !== 'text') body = <div className="boot">{t('edit_not_text', { name: baseName(path) })}</div>;
    else if (data.truncated) body = <div className="boot">{t('edit_too_large', { name: baseName(path) })}</div>;
    else {
      body = (
        <EditorDialog key={path} spec={{
          path, text: data.text, encoding: data.encoding, windowed: true, prefs,
          onDirty: (d) => { dirtyRef.current = d; },
          onSave: async (text) => {
            try { await call('fs.writeText', { path, text }); postToApp({ type: 'refresh', status: t('saved_file', { name: baseName(path) }) }); }
            catch (err) { await dialogs.error(err, t('save_failed')); throw err; }
          },
          confirmDiscard: () => dialogs.confirm({ title: t('editor_title'), message: t('editor_discard', { name: baseName(path) }), danger: true, yesLabel: t('editor_discard_yes'), noLabel: t('cancel') }),
        }} done={() => closeWindow()} />
      );
    }
  } else if (mode === 'multiRename') {
    body = (
      <MultiRenameDialog key={(args.entries || []).map((e) => e.path).join('|')} spec={{ entries: args.entries || [], parent: args.parent || '', windowed: true }} done={async (items) => {
        if (!items || !items.length) { closeWindow(); return; }
        try {
          const r = await call('fs.renameMany', { items });
          postToApp({ type: 'renamed', pairs: r.renamed, side: args.side });
          closeWindow();
        } catch (err) {
          await dialogs.error(err.code === 'EEXIST' ? t('exists', { name: baseName(err.path || '') }) : err, t('rename_failed'));
        }
      }} />
    );
  } else if (mode === 'search') {
    body = (
      <SearchDialog key={args.root || ''} root={args.root || ''} windowed onClose={() => closeWindow()}
        onOpenDir={(p) => postToApp({ type: 'navigate', side: 'left', path: p })}
        onOpenFile={(p) => postToApp({ type: 'openFile', path: p })}
        onClipCopy={async (paths) => { await writeClipboardText(paths.map((p) => `file:///${p.replace(/\\/g, '/')}`).join('\n') + '\n'); postToApp({ type: 'clipCopy', paths }); }}
        onCopyTo={(side, paths) => postToApp({ type: 'copyTo', side, paths })} />
    );
  } else if (mode === 'settings') {
    body = (
      <SettingsDialog spec={{
        values: args.values || {}, shells: args.shells || [], platform: info && info.platform, pickFolder, pickFile, windowed: true,
        onChange: (live) => postToApp({ type: 'settings', values: live, live: true }),
      }} done={(v) => {
        // OK keeps the live values; Cancel puts the original ones back.
        postToApp({ type: 'settings', values: v || args.values || {} });
        closeWindow();
      }} />
    );
  } else {
    body = <div className="boot">?</div>;
  }

  return (
    <div className="tool-window">
      {body}
      <DialogHost stack={dialogs.stack} resolve={dialogs.resolve} />
    </div>
  );
}
