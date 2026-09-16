// Command Center — application shell.
//
// Two FilePanels side by side, the menu bar / toolbar / status bar, the
// bottom dock (operation log + terminal tabs) and every action that needs a
// dialog, a job with progress, or the other panel.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { call, runJob, cancelJob, resolveConflict, readClipboardText, writeClipboardText, quitApp, hostName, pickFolder, pickFile, openWindow, onAppMessage, postToApp, canOpenWindows, canResizeWindow, windowSize, resizeWindow } from './lib/backend';
import { t, setLanguage, getLanguage, useLanguage } from './lib/i18n';
import { setSeparator, joinPath, baseName, dirName, getSeparator } from './lib/format';
import { FilePanel } from './components/FilePanel';
import { MenuBar, Toolbar, FnBar } from './components/Chrome';
import { DialogHost, useDialogs } from './dialogs/Dialogs';
import { BottomDock } from './components/BottomDock';
import { SearchDialog } from './dialogs/SearchDialog';
import { applyTheme, themeById, nextThemeId, DEFAULT_THEME } from './themes';
import { SETTINGS_DEFAULTS, SETTINGS_KEYS, isTextFile } from './lib/settings';
import { History } from './lib/history';

function applyFontSize(px) {
  document.documentElement.style.setProperty('--fs', `${Math.max(9, Number(px) || 13)}px`);
}

// Sessions written by an early build stored 'dark' / 'light'.
function themeIdOf(s) {
  const id = s && s.theme;
  if (id === 'dark' || !id) return DEFAULT_THEME;
  if (id === 'light') return 'daylight';
  return themeById(id).id;
}

const ARCHIVE_SUFFIXES = ['.tar.gz', '.tgz', '.tar.bz2', '.tbz2', '.tar.xz', '.txz', '.tar', '.zip', '.gz', '.bz2'];
function stripArchiveExt(name) {
  const lower = name.toLowerCase();
  for (const s of ARCHIVE_SUFFIXES) if (lower.endsWith(s)) return name.slice(0, name.length - s.length);
  return name;
}

const MAX_LOG = 2000;
let logSeq = 0;

// Text of an error for the log tab (the dialog shows the full details).
function errorText(err, extra) {
  const msg = err && err.message ? err.message : (typeof err === 'string' ? err : String(err));
  return typeof extra === 'string' && extra && extra !== msg ? `${extra}: ${msg}` : msg;
}

// The resize marker at the bottom-right corner of the main window: dragging it
// resizes the window through the host (the native frame still works as well).
function ResizeGrip() {
  const onDown = async (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const start = await windowSize();
    const x0 = e.screenX, y0 = e.screenY;
    let raf = 0, last = null;
    const move = (ev) => { last = ev; if (!raf) raf = requestAnimationFrame(() => { raf = 0; resizeWindow(start.width + (last.screenX - x0), start.height + (last.screenY - y0)); }); };
    const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };
  return (
    <svg className="resize-grip" viewBox="0 0 16 16" onMouseDown={onDown} aria-hidden="true">
      <path d="M15 1L1 15M15 6L6 15M15 11l-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
    </svg>
  );
}

// One line describing a history entry, for the undo / redo tooltips and the status bar.
function describeHistory(entry) {
  if (!entry) return '';
  switch (entry.kind) {
    case 'create': return t(entry.isDir ? 'hist_new_folder' : 'hist_new_file', { name: baseName(entry.path) });
    case 'rename': return t('hist_rename', { from: entry.from, to: entry.to });
    case 'copy': return t('hist_copy', { n: entry.items.length, dest: entry.destDir });
    case 'move': return t('hist_move', { n: entry.items.length, dest: entry.destDir });
    case 'compress': return t('hist_compress', { name: baseName(entry.parts[0] || '') });
    case 'extract': return t('hist_extract', { name: baseName(entry.destDir) });
    case 'renameMany': return t('hist_rename_many', { n: entry.pairs.length });
    default: return entry.kind;
  }
}

function toFileUri(p) {
  const norm = p.replace(/\\/g, '/');
  return 'file://' + (norm.startsWith('/') ? '' : '/') + norm.split('/').map((seg, i) => (i === 0 && /^[a-zA-Z]:$/.test(seg) ? seg : encodeURIComponent(seg))).join('/');
}

function fromFileUri(line) {
  const s = line.trim();
  if (!s) return null;
  if (!s.startsWith('file://')) return s;
  let p = s.slice('file://'.length).replace(/^localhost/, '');
  try { p = decodeURIComponent(p); } catch { /* keep */ }
  if (/^\/[a-zA-Z]:/.test(p)) p = p.slice(1).replace(/\//g, '\\');
  return p;
}

export default function App() {
  useLanguage();
  const baseDialogs = useDialogs();
  const [info, setInfo] = useState(null);
  const [session, setSession] = useState(null);
  const [active, setActive] = useState('left');
  const [status, setStatusText] = useState('');
  // Bottom dock: the log collects every status message and error; terminal
  // sessions live in the host (core/terminal.js), here only their tabs.
  const [log, setLog] = useState([]);
  const [dockTab, setDockTab] = useState('log');
  const [terms, setTerms] = useState([]);
  const [shells, setShells] = useState([]);
  const termNo = useRef(1);
  const [busy, setBusy] = useState(0);
  const [selCount, setSelCount] = useState({ left: 0, right: 0 });
  const [extractable, setExtractable] = useState({ left: false, right: false });
  const [selIsDir, setSelIsDir] = useState({ left: false, right: false });
  const [search, setSearch] = useState(null);   // { root } while the search window is open
  const panels = { left: useRef(null), right: useRef(null) };
  const inAppClipboard = useRef([]);
  const splitRef = useRef(null);
  // Undo / redo of file operations (src/lib/history.js); the tick re-renders the toolbar state.
  const history = useRef(new History()).current;
  const [, setHistTick] = useState(0);
  useEffect(() => history.subscribe(() => setHistTick((n) => n + 1)), [history]);
  useEffect(() => { if (session) history.max = Math.max(1, Number(session.historyMax) || 50); }, [session && session.historyMax]); // eslint-disable-line react-hooks/exhaustive-deps
  // Folders each panel visited (Alt+↓), newest first.
  const [dirHistory, setDirHistory] = useState({ left: [], right: [] });
  useEffect(() => {
    if (!session) return;
    setDirHistory((h) => {
      let next = h;
      for (const side of ['left', 'right']) {
        const p = session[side];
        if (!p || (next[side][0] === p)) continue;
        next = { ...next, [side]: [p, ...next[side].filter((x) => x !== p)].slice(0, 30) };
      }
      return next;
    });
  }, [session && session.left, session && session.right]); // eslint-disable-line react-hooks/exhaustive-deps

  const addLog = useCallback((level, text) => {
    if (!text) return;
    setLog((l) => { const next = [...l, { id: ++logSeq, ts: Date.now(), level, text: String(text) }]; return next.length > MAX_LOG ? next.slice(-MAX_LOG) : next; });
  }, []);
  // Status bar messages are also kept in the log tab.
  const setStatus = useCallback((msg) => { setStatusText(msg); addLog('info', msg); }, [addLog]);
  // Every error dialog leaves a line in the log too.
  const dialogs = useMemo(() => ({
    ...baseDialogs,
    error: (err, extra) => { addLog('error', errorText(err, extra)); return baseDialogs.error(err, extra); },
  }), [baseDialogs, addLog]);

  // ── Boot ──
  // StrictMode (dev) mounts twice; without this guard the boot ran twice and
  // the log opened with two "ready" lines.
  const booted = useRef(false);
  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    (async () => {
      const i = await call('app.info');
      call('term.shells').then(setShells).catch(() => {});
      setSeparator(i.sep);
      setInfo(i);
      const s = { ...SETTINGS_DEFAULTS, ...(await call('session.load')) };
      setLanguage(s.language || 'ko');
      applyFontSize(s.fontSize);
      if (s.restoreFolders === false) { s.left = i.home; s.right = i.home; s.leftTabs = [{ path: i.home }]; s.rightTabs = [{ path: i.home }]; s.leftTab = 0; s.rightTab = 0; }
      const theme = applyTheme(themeIdOf(s));
      s.theme = theme.id;
      if (s.themeBg !== theme.tokens['--bg']) call('session.save', { patch: { theme: theme.id, themeBg: theme.tokens['--bg'] } }).catch(() => {});
      setSession(s);
      if (s.activeSide === 'right') setActive('right');
      setStatus(t('ready', { app: t('appName') }));
    })().catch((err) => setStatus(String(err && err.message ? err.message : err)));
  }, []);

  useEffect(() => { document.title = t('appName'); }, [session && session.language]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveSession = useCallback((patch) => {
    setSession((s) => (s ? { ...s, ...patch } : s));
    call('session.save', { patch }).catch(() => {});
    // Tool windows follow theme / language / font changes.
    if (patch.theme || patch.language || patch.fontSize) postToApp({ type: 'session', patch });
  }, []);

  // What the prompt's session / os segments show (from app.info).
  const termEnv = useMemo(() => ({ user: info ? info.user || '' : '', host: info ? info.hostname || '' : '', platform: info ? info.platform : '', home: info ? info.home : '' }), [info]);
  const panel = (side = active) => panels[side].current;
  const other = (side) => (side === 'left' ? 'right' : 'left');
  const pathOf = (side) => (session ? session[side] : '');
  // ── Panel tabs (Total Commander Ctrl+T) ──
  // Each side keeps `<side>Tabs` [{ path }] and `<side>Tab` (active index) in the
  // session; `session[side]` is always the active tab's folder, so everything
  // else keeps reading pathOf(side).
  const tabsOf = (side) => { const t = session && session[`${side}Tabs`]; return Array.isArray(t) && t.length ? t : [{ path: pathOf(side) }]; };
  const tabIndexOf = (side) => { const i = session ? Number(session[`${side}Tab`]) : 0; const n = tabsOf(side).length; return Number.isFinite(i) && i >= 0 && i < n ? i : 0; };
  const setTabs = (side, tabs, index, extra) => saveSession({ [`${side}Tabs`]: tabs, [`${side}Tab`]: index, [side]: tabs[index].path, ...(extra || {}) });
  const newTab = (side, p) => { const tabs = [...tabsOf(side), { path: p || pathOf(side) }]; setTabs(side, tabs, tabs.length - 1); setStatus(t('tab_opened', { n: tabs.length })); };
  const closeTab = (side, i = tabIndexOf(side)) => {
    const tabs = tabsOf(side);
    if (tabs.length <= 1) { setStatus(t('tab_last')); return; }
    const next = tabs.filter((_, k) => k !== i);
    const cur = tabIndexOf(side);
    setTabs(side, next, Math.min(cur > i ? cur - 1 : cur === i ? Math.max(0, i - 1) : cur, next.length - 1));
  };
  const closeOtherTabs = (side, i = tabIndexOf(side)) => { const tabs = tabsOf(side); setTabs(side, [tabs[i]], 0); };
  const selectTab = (side, i) => { const tabs = tabsOf(side); if (i >= 0 && i < tabs.length) setTabs(side, tabs, i); };
  const cycleTab = (side, delta) => { const n = tabsOf(side).length; selectTab(side, (tabIndexOf(side) + delta + n) % n); };

  // Only folders that exist are entered (and remembered for the next start).
  const navigate = async (side, p) => {
    try {
      const r = await call('fs.exists', { path: p });
      if (!r.isDir) throw new Error(p);
    } catch (err) {
      await dialogs.error(t('cannot_open_dir', { msg: err.message }));
      return;
    }
    const tabs = tabsOf(side).map((tb, k) => (k === tabIndexOf(side) ? { ...tb, path: p } : tb));
    saveSession({ [side]: p, [`${side}Tabs`]: tabs });
  };

  const activatePanel = (side) => {
    if (side !== active) {
      setActive(side);
      call('session.save', { patch: { activeSide: side } }).catch(() => {});
      setStatusText(t(side === 'left' ? 'left_active' : 'right_active', { path: pathOf(side) }));
    }
  };

  // ── Bottom dock: log + terminals ──
  const showDock = (on) => saveSession({ dockVisible: on });
  // New terminals start in the configured directory (settings › terminal), else the active panel's folder.
  const newTerminal = async (shell) => {
    try {
      let cwd = session.termCwd || '';
      if (cwd) {
        const ok = await call('fs.exists', { path: cwd }).then((r) => r.isDir).catch(() => false);
        if (!ok) { addLog('error', t('set_term_cwd_missing', { path: cwd })); cwd = ''; }
      }
      const r = await call('term.create', { cwd: cwd || pathOf(active), shell: shell || session.termShell || undefined });
      const tm = { id: r.id, title: `${r.label} ${termNo.current++}`, shell: r.shell, cwd: r.cwd, exited: false, idle: true, buffer: [], seq: 0, git: undefined, gitCwd: null };
      setTerms((ts) => [...ts, tm]);
      setDockTab(r.id);
      if (!session.dockVisible) showDock(true);
      setStatus(t('term_opened', { name: tm.title, cwd: r.cwd }));
    } catch (err) {
      await dialogs.error(err);
    }
  };
  const closeTerminal = (id) => {
    call('term.kill', { id }).catch(() => {});
    const gone = terms.find((x) => x.id === id);
    const next = terms.filter((x) => x.id !== id);
    setTerms(next);
    if (dockTab === id) setDockTab(next.length ? next[next.length - 1].id : 'log');
    if (gone) setStatus(t('term_closed', { name: gone.title }));
  };
  const onTermExit = (id) => setTerms((ts) => ts.map((x) => (x.id === id ? { ...x, exited: true } : x)));
  const copyLog = async () => {
    const text = log.map((e) => `${new Date(e.ts).toISOString()} ${e.level.toUpperCase().padEnd(5)} ${e.text}`).join('\n') + '\n';
    await writeClipboardText(text);
    setStatusText(t('log_copied'));
  };
  const onDockResizeStart = (e) => {
    e.preventDefault();
    const y0 = e.clientY, h0 = session.dockHeight || 220;
    const clamp = (h) => Math.max(120, Math.min(window.innerHeight - 240, h));
    let h = h0;
    const move = (ev) => { h = clamp(h0 + (y0 - ev.clientY)); setSession((s) => ({ ...s, dockHeight: h })); };
    const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); saveSession({ dockHeight: h }); };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  // ── Jobs with a progress dialog ──
  const runWithProgress = useCallback(async (verb, method, args) => {
    let jobId = null;
    let handledConflict = '';
    const dlg = dialogs.open({ type: 'progress', verb, job: null, cancelled: false, onCancel: () => { if (jobId) { cancelJob(jobId).catch(() => {}); dlg.update({ cancelled: true }); } } });
    setBusy((b) => b + 1);
    try {
      return await runJob(method, args, async (snap) => {
        jobId = snap.id;
        dlg.update({ job: snap });
        if (snap.conflict) {
          const key = `${snap.conflict.destPath}|${snap.current}`;
          if (handledConflict === key) return;
          handledConflict = key;
          const { answer, applyAll } = await dialogs.conflict(snap.conflict);
          await resolveConflict(snap.id, answer, applyAll).catch(() => {});
        }
      });
    } finally {
      dlg.close();
      setBusy((b) => Math.max(0, b - 1));
    }
  }, [dialogs]);

  // Every failure — from the renderer or from either backend — ends in the
  // same dialog: message, details (code / path / stack) and a copy button.
  const showError = useCallback((err, extra) => dialogs.error(err, extra), [dialogs]);
  useEffect(() => {
    const onError = (e) => { showError(e.error || e.message); };
    const onRejection = (e) => { showError(e.reason); };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => { window.removeEventListener('error', onError); window.removeEventListener('unhandledrejection', onRejection); };
  }, [showError]);

  const refreshBoth = () => { panels.left.current && panels.left.current.refresh(); panels.right.current && panels.right.current.refresh(); };

  // Records a finished transfer; only entries that landed on a fresh path are
  // reversible (a merge or overwrite has nothing to go back to).
  const recordTransfer = (final, destDir, move) => {
    const items = ((final.result && final.result.items) || []).filter((it) => !it.existed).map(({ src, dest }) => ({ src, dest }));
    if (items.length) history.push({ kind: move ? 'move' : 'copy', items, destDir });
  };

  // ── Actions ──
  const transfer = async (side, move) => {
    const p = panel(side);
    if (!p) return;
    const sources = p.getSelectedPaths();
    if (!sources.length) { setStatus(t(move ? 'select_move' : 'select_copy')); return; }
    const dest = pathOf(other(side));
    const verb = t(move ? 'move_verb' : 'copy_verb');
    const final = await runWithProgress(t(move ? 'moving' : 'copying'), 'ops.transfer', { sources, dest, move });
    refreshBoth();
    if (final.status === 'done') {
      recordTransfer(final, dest, move);
      const st = final.result || { copied: 0, skipped: 0 };
      if (st.copied + st.skipped === 0) setStatus(t(move ? 'nothing_move' : 'nothing_copy'));
      else if (st.skipped > 0) setStatus(t('transfer_skipped', { n: st.copied, verb, skipped: st.skipped, dest }));
      else setStatus(t('transfer_done', { n: st.copied, dest, verb }));
    } else if (final.status === 'cancelled') {
      setStatus(t(move ? 'move_cancelled' : 'copy_cancelled'));
    } else {
      setStatus(final.error || t(move ? 'move_failed' : 'copy_failed'));
      await dialogs.error(final.error || t(move ? 'move_failed' : 'copy_failed'), final.errorDetail);
    }
  };

  // Copies `sources` into a panel's folder (the search window's "→ left / right panel").
  const copyPathsTo = async (side, sources) => {
    if (!sources.length) return;
    const dest = pathOf(side);
    const final = await runWithProgress(t('copying'), 'ops.transfer', { sources, dest, move: false });
    refreshBoth();
    if (final.status === 'done') {
      recordTransfer(final, dest, false);
      const st = final.result || { copied: 0, skipped: 0 };
      setStatus(st.skipped ? t('transfer_skipped', { n: st.copied, verb: t('copy_verb'), skipped: st.skipped, dest }) : t('transfer_done', { n: st.copied, dest, verb: t('copy_verb') }));
    } else if (final.status === 'cancelled') setStatus(t('copy_cancelled'));
    else await dialogs.error(final.error || t('copy_failed'), final.errorDetail);
  };

  const newEntry = async (side, kind) => {
    const dir = pathOf(side);
    const name = await dialogs.prompt(kind === 'folder'
      ? { title: t('dlg_new_folder'), label: t('lbl_folder_name'), value: t('default_folder'), icon: 'folderNew' }
      : { title: t('dlg_new_file'), label: t('lbl_file_name'), value: t('default_file'), icon: 'fileNew', selectStem: true });
    if (!name) return;
    try {
      const r = await call(kind === 'folder' ? 'fs.mkdir' : 'fs.createFile', { dir, name });
      history.push({ kind: 'create', path: r.path, isDir: kind === 'folder' });
      await panel(side).refresh();
      panel(side).selectPaths([r.path]);
      setStatus(t(kind === 'folder' ? 'made_folder' : 'made_file', { name }));
    } catch (err) {
      await dialogs.error(err.code === 'EEXIST' ? t('exists', { name }) : err);
    }
  };

  const rename = async (side) => {
    const p = panel(side);
    const [entry] = p ? p.getSelectedEntries() : [];
    if (!entry) return;
    const name = await dialogs.prompt({ title: t('dlg_rename'), label: t('lbl_new_name'), value: entry.name, icon: 'rename', selectStem: !entry.isDir });
    if (!name || name === entry.name) return;
    try {
      const r = await call('fs.rename', { path: entry.path, newName: name });
      history.push({ kind: 'rename', dir: dirName(entry.path), from: entry.name, to: name });
      await p.refresh();
      p.selectPaths([r.path]);
      setStatus(t('renamed', { name }));
    } catch (err) {
      await dialogs.error(err.code === 'EEXIST' ? t('exists', { name }) : err, t('rename_failed'));
    }
  };

  const remove = async (side) => {
    const p = panel(side);
    const paths = p ? p.getSelectedPaths() : [];
    if (!paths.length) { setStatus(t('delete_none')); return; }
    const ok = session.confirmDelete === false || await dialogs.confirm({
      title: t('ctx_delete'), danger: true,
      message: paths.length === 1 ? t('delete_confirm_one', { name: baseName(paths[0]) }) : t('delete_confirm_many', { n: paths.length }),
    });
    if (!ok) return;
    const final = await runWithProgress(t('deleting'), 'ops.delete', { paths });
    await p.refresh();
    history.mark();
    if (final.status === 'done') setStatus(t('deleted', { n: paths.length }));
    else if (final.status === 'cancelled') setStatus(t('delete_cancelled'));
    else await dialogs.error(final.error || t('delete_failed'), final.errorDetail);
  };

  const trash = async (side) => {
    const p = panel(side);
    const paths = p ? p.getSelectedPaths() : [];
    if (!paths.length) { setStatus(t('trash_none')); return; }
    const final = await runWithProgress(t('trashing'), 'ops.trash', { paths });
    await p.refresh();
    history.mark();
    if (final.status === 'done') setStatus(t('trashed', { n: paths.length }));
    else if (final.status === 'cancelled') setStatus(t('trash_cancelled'));
    else await dialogs.error(/TRASH_UNSUPPORTED/.test(final.error || '') ? t('trash_unsupported') : (final.error || t('trash_failed')), final.errorDetail);
  };

  const clipCopy = async (side) => {
    const paths = panel(side) ? panel(side).getSelectedPaths() : [];
    if (!paths.length) return;
    inAppClipboard.current = paths;
    await writeClipboardText(paths.map(toFileUri).join('\n') + '\n');
    setStatus(t('clip_copied', { n: paths.length }));
  };

  const clipPaste = async (side) => {
    const text = await readClipboardText();
    let paths = text.split(/\r?\n/).map(fromFileUri).filter(Boolean);
    const existing = [];
    for (const p of paths) {
      try { if ((await call('fs.exists', { path: p })).exists) existing.push(p); } catch { /* skip */ }
    }
    paths = existing.length ? existing : inAppClipboard.current;
    if (!paths.length) { setStatus(t('clip_empty')); return; }
    const dest = pathOf(side);
    const final = await runWithProgress(t('pasting'), 'ops.transfer', { sources: paths, dest, move: false });
    refreshBoth();
    if (final.status === 'done') {
      recordTransfer(final, dest, false);
      const st = final.result || { copied: 0, skipped: 0 };
      setStatus(st.skipped ? t('pasted_skipped', { n: st.copied, skipped: st.skipped }) : t('pasted', { n: st.copied }));
    } else if (final.status === 'cancelled') setStatus(t('paste_cancelled'));
    else await dialogs.error(final.error || t('paste_failed'), final.errorDetail);
  };

  const compress = async (side) => {
    const p = panel(side);
    const sources = p ? p.getSelectedPaths() : [];
    if (!sources.length) { setStatus(t('compress_none')); return; }
    const opts = await dialogs.compress({ name: stripArchiveExt(baseName(sources[0])), splitSizeMB: session.splitSizeMB || 10 });
    if (!opts) return;
    const destBase = joinPath(pathOf(side), stripArchiveExt(opts.name));
    const args = { sources, destBase, format: opts.format, split: opts.split, splitSize: opts.splitSize };
    const final = await runWithProgress(t('compressing'), 'archive.create', args);
    await p.refresh();
    if (final.status === 'done') {
      setStatus(t(opts.split ? 'compressed_split' : 'compressed', { n: sources.length }));
      if (final.result && final.result.parts) {
        history.push({ kind: 'compress', parts: final.result.parts, args });
        p.selectPaths(final.result.parts);
      }
    } else if (final.status === 'cancelled') setStatus(t('compress_cancelled'));
    else await dialogs.error(final.error || t('compress_failed'), final.errorDetail);
  };

  const extract = async (side, archivePath) => {
    const p = panel(side);
    if (!archivePath) {
      const paths = p ? p.getSelectedPaths() : [];
      if (paths.length !== 1) return;
      archivePath = paths[0];
    }
    let suggested = baseName(archivePath);
    try {
      const d = await call('archive.describe', { path: archivePath });
      if (d.isSplit && d.base) suggested = baseName(d.base);
    } catch { /* keep */ }
    suggested = stripArchiveExt(suggested);
    const name = await dialogs.prompt({ title: t('extract_title'), label: t('lbl_extract_dir'), value: suggested, icon: 'extract' });
    if (!name) return;
    const destDir = joinPath(pathOf(side), name);
    // Undo removes the target folder, so only an extraction that created it is recorded.
    const fresh = !(await call('fs.exists', { path: destDir }).then((r) => r.exists).catch(() => true));
    const final = await runWithProgress(t('extracting'), 'archive.extract', { archivePath, destDir });
    await p.refresh();
    if (final.status === 'done') {
      if (fresh) history.push({ kind: 'extract', destDir, args: { archivePath, destDir } });
      setStatus(t('extracted', { name }));
      p.selectPaths([destDir]);
    }
    else if (final.status === 'cancelled') setStatus(t('extract_cancelled'));
    else {
      const e = final.error || '';
      const msg = e.startsWith('UNSUPPORTED_FORMAT:') ? t('unsupported_format', { name: e.slice(19) })
        : e.startsWith('SPLIT_PARTS_MISSING:') ? t('split_missing', { name: e.slice(20) })
          : (e || t('extract_failed'));
      await dialogs.error(msg, final.errorDetail);
    }
  };

  const openEntry = async (side, entry) => {
    if (entry.isDir) { navigate(side, entry.path); return; }
    try {
      const d = await call('archive.describe', { path: entry.path });
      if (d.isSplit) { await extract(side, entry.path); return; }
    } catch { /* fall through */ }
    // Text files go where the settings say (system app / viewer / editor / a chosen program).
    const how = isTextFile(entry.name, session.textExts) ? (session.textOpen || 'app') : 'app';
    if (how === 'viewer') { await viewFile(side, entry); return; }
    if (how === 'editor') { await editFile(side, entry); return; }
    if (!(info && info.capabilities.open)) { setStatus(t('open_unsupported')); return; }
    try {
      if (how === 'custom' && session.textApp) await call('fs.openWith', { path: entry.path, app: session.textApp });
      else await call('fs.open', { path: entry.path });
    } catch (err) {
      await dialogs.error(err, `${t('open_failed')} (${entry.path})`);
    }
  };

  const openSelected = async (side) => {
    const p = panel(side);
    const entries = p ? p.getSelectedEntries() : [];
    let firstDir = null;
    for (const e of entries) {
      if (e.isDir) { if (!firstDir) firstDir = e; }
      else await openEntry(side, e);
    }
    if (firstDir) navigate(side, firstDir.path);
  };

  const properties = async (side) => {
    const [entry] = panel(side) ? panel(side).getSelectedEntries() : [];
    if (!entry) return;
    try {
      const st = await call('fs.stat', { path: entry.path });
      await dialogs.properties(st);
    } catch (err) {
      await dialogs.error(err);
    }
  };

  // ── Undo / redo ──
  // Undoing a copy / compress / extract deletes what it produced (permanently,
  // as the delete command does), so it asks first unless "confirm before
  // deleting" is off in the settings.
  const removeProduced = async (paths, what) => {
    if (session.confirmDelete !== false) {
      const ok = await dialogs.confirm({ title: t('undo'), danger: true, message: t('undo_delete_confirm', { n: paths.length, what }) });
      if (!ok) return { status: 'cancelled' };
    }
    return runWithProgress(t('deleting'), 'ops.delete', { paths });
  };

  // Reverses (undo) or replays (redo) one history entry; returns a job-like
  // { status } — 'done', 'cancelled' or 'error' — and throws on a plain failure.
  const applyHistory = async (entry, undo) => {
    const done = { status: 'done' };
    switch (entry.kind) {
      case 'create': {
        if (!undo) { await call(entry.isDir ? 'fs.mkdir' : 'fs.createFile', { dir: dirName(entry.path), name: baseName(entry.path) }); return done; }
        if (!(await call('fs.exists', { path: entry.path })).exists) return done;
        // An empty folder / file goes quietly; one that gained content is confirmed.
        const st = await call('fs.stat', { path: entry.path });
        if (st.isDir ? st.files + st.dirs > 0 : st.size > 0) {
          const ok = await dialogs.confirm({ title: t('undo'), danger: true, message: t('undo_not_empty', { name: baseName(entry.path) }) });
          if (!ok) return { status: 'cancelled' };
        }
        return runWithProgress(t('deleting'), 'ops.delete', { paths: [entry.path] });
      }
      case 'rename': {
        const [from, to] = undo ? [entry.to, entry.from] : [entry.from, entry.to];
        await call('fs.rename', { path: joinPath(entry.dir, from), newName: to });
        return done;
      }
      case 'copy':
        if (!undo) return runWithProgress(t('copying'), 'ops.transfer', { sources: entry.items.map((it) => it.src), dest: entry.destDir, move: false });
        return removeProduced(entry.items.map((it) => it.dest), describeHistory(entry));
      case 'move': {
        if (!undo) return runWithProgress(t('moving'), 'ops.transfer', { sources: entry.items.map((it) => it.src), dest: entry.destDir, move: true });
        // Back to where each item came from — one job per source folder.
        const groups = new Map();
        for (const it of entry.items) { const d = dirName(it.src); if (!groups.has(d)) groups.set(d, []); groups.get(d).push(it.dest); }
        for (const [dir, sources] of groups) {
          const r = await runWithProgress(t('moving'), 'ops.transfer', { sources, dest: dir, move: true });
          if (r.status !== 'done') return r;
        }
        return done;
      }
      case 'compress': {
        if (undo) return removeProduced(entry.parts, describeHistory(entry));
        const r = await runWithProgress(t('compressing'), 'archive.create', entry.args);
        if (r.status === 'done' && r.result && r.result.parts) entry.parts = r.result.parts;
        return r;
      }
      case 'extract':
        if (undo) return removeProduced([entry.destDir], describeHistory(entry));
        return runWithProgress(t('extracting'), 'archive.extract', entry.args);
      case 'renameMany':
        await call('fs.renameMany', { items: entry.pairs.map((p) => (undo ? { path: p.to, newName: baseName(p.from) } : { path: p.from, newName: baseName(p.to) })) });
        return done;
      default: return done;
    }
  };

  const undoRedo = async (undo) => {
    const entry = undo ? history.peekUndo() : history.peekRedo();
    if (!entry) { setStatus(t(undo ? 'undo_nothing' : 'redo_nothing')); return; }
    const what = describeHistory(entry);
    let r;
    try {
      r = await applyHistory(entry, undo);
    } catch (err) {
      // The file system no longer matches the entry — it is dropped, not retried.
      history.drop(entry);
      refreshBoth();
      await dialogs.error(err, t(undo ? 'undo_failed' : 'redo_failed', { what }));
      return;
    }
    refreshBoth();
    if (r.status === 'done') {
      if (undo) history.commitUndo(entry); else history.commitRedo(entry);
      setStatus(t(undo ? 'undone' : 'redone', { what }));
    } else if (r.status === 'cancelled') {
      setStatus(t(undo ? 'undo_cancelled' : 'redo_cancelled', { what }));
    } else {
      history.drop(entry);
      await dialogs.error(r.error || t(undo ? 'undo_failed' : 'redo_failed', { what }), r.errorDetail);
    }
  };

  // ── Total Commander style tools ──
  // F3: the built-in viewer (text / image / hex). 'edit' from the viewer's footer opens the editor.
  // Tools open as separate windows (settings › windows) when the host can; otherwise as in-app dialogs.
  const useWindows = () => session.separateWindows !== false && canOpenWindows;
  const openTool = async (kind, args, opts) => {
    try { await openWindow(kind, args, opts); return true; }
    catch (err) { if (err.message !== 'POPUP_BLOCKED') await dialogs.error(err); return false; }
  };
  const prefsOf = () => ({ viewerWrap: session.viewerWrap, viewerFontSize: session.viewerFontSize, editorFontSize: session.editorFontSize, editorTabSize: session.editorTabSize, editorWrap: session.editorWrap });
  const viewFile = async (side, entry) => {
    const p = panel(side);
    const e = entry || (p && p.getCursorEntry());
    if (!e || e.isDir) { setStatus(t('view_none')); return; }
    if (useWindows() && await openTool('viewer', { path: e.path }, { title: `${t('viewer_title')} — ${e.name}` })) return;
    setBusy((b) => b + 1);
    let data;
    try { data = await call('fs.readFile', { path: e.path }); } finally { setBusy((b) => Math.max(0, b - 1)); }
    const r = await dialogs.viewer({ path: e.path, data, prefs: prefsOf(), canOpen: !!(info && info.capabilities.open), onOpen: () => call('fs.open', { path: e.path }).catch((err) => dialogs.error(err)) });
    if (r === 'edit') await editFile(side, e, data);
  };
  // F4: a plain text editor; the file is written back as UTF-8.
  const editFile = async (side, entry, data) => {
    const p = panel(side);
    const e = entry || (p && p.getCursorEntry());
    if (!e || e.isDir) { setStatus(t('edit_none')); return; }
    if (!data) data = await call('fs.readFile', { path: e.path });
    if (data.kind !== 'text') { await dialogs.error(t('edit_not_text', { name: e.name })); return; }
    if (data.truncated) { await dialogs.error(t('edit_too_large', { name: e.name })); return; }
    if (useWindows() && await openTool('editor', { path: e.path }, { title: `${t('editor_title')} — ${e.name}` })) return;
    await dialogs.editor({
      path: e.path, text: data.text, encoding: data.encoding, prefs: prefsOf(),
      onSave: async (text) => {
        try { await call('fs.writeText', { path: e.path, text }); setStatus(t('saved_file', { name: e.name })); p && p.refresh(); }
        catch (err) { await dialogs.error(err, t('save_failed')); throw err; }
      },
      confirmDiscard: () => dialogs.confirm({ title: t('editor_title'), message: t('editor_discard', { name: e.name }), danger: true, yesLabel: t('editor_discard_yes'), noLabel: t('cancel') }),
    });
  };
  // Ctrl+M: rename every selected entry through masks / search-replace / counter; one undo step.
  const multiRename = async (side) => {
    const p = panel(side);
    const entries = p ? p.getSelectedEntries() : [];
    if (!entries.length) { setStatus(t('mrn_none')); return; }
    const plain = entries.map(({ name, path, isDir }) => ({ name, path, isDir }));
    if (useWindows() && await openTool('multiRename', { entries: plain, parent: baseName(pathOf(side)), side }, { title: t('multi_rename') })) return;
    const items = await dialogs.multiRename({ entries, parent: baseName(pathOf(side)) });
    if (!items || !items.length) return;
    try {
      const r = await call('fs.renameMany', { items });
      afterRenameMany(r.renamed, side);
    } catch (err) {
      await dialogs.error(err.code === 'EEXIST' ? t('exists', { name: baseName(err.path || '') }) : err, t('rename_failed'));
    }
  };
  const afterRenameMany = (pairs, side) => {
    if (!pairs || !pairs.length) return;
    history.push({ kind: 'renameMany', pairs });
    const p = panel(side || active);
    if (p) p.refresh().then(() => p.selectPaths(pairs.map((x) => x.to)));
    setStatus(t('mrn_done', { n: pairs.length }));
  };

  // Settings (from the in-app dialog or the settings window): apply what changed and save.
  // Called on every change while the dialog is open (live), then once more with
  // the final values (OK) or the original ones (Cancel).
  const applySettings = (v, { quiet = false } = {}) => {
    if (!v) return;
    if (v.language !== getLanguage()) setLanguage(v.language);
    const theme = applyTheme(v.theme);
    applyFontSize(v.fontSize);
    const patch = {};
    for (const k of SETTINGS_KEYS) if (k in v) patch[k] = v[k];
    patch.theme = theme.id; patch.themeBg = theme.tokens['--bg'];
    patch.termCwd = (v.termCwd || '').trim();
    saveSession(patch);
    if (!quiet) setStatus(t('settings_applied'));
  };

  // Shift+F2: mark what differs between the panels — entries missing on the
  // other side, and files whose size differs or that are newer than their twin.
  const compareDirs = () => {
    const L = panels.left.current, Rp = panels.right.current;
    if (!L || !Rp) return;
    const ci = info && info.platform === 'win32';
    const key = (e) => (ci ? e.name.toLowerCase() : e.name);
    const le = L.getEntries(), re = Rp.getEntries();
    const lm = new Map(le.map((e) => [key(e), e])), rm = new Map(re.map((e) => [key(e), e]));
    const tol = Math.max(0, Number(session.compareToleranceSec) || 0) * 1000;
    const differs = (a, b) => !a.isDir && !b.isDir && (a.size !== b.size || a.mtime > b.mtime + tol);
    const ls = le.filter((e) => { const o = rm.get(key(e)); return !o || (e.isDir !== o.isDir) || differs(e, o); }).map((e) => e.path);
    const rs = re.filter((e) => { const o = lm.get(key(e)); return !o || (e.isDir !== o.isDir) || differs(e, o); }).map((e) => e.path);
    L.selectPaths(ls); Rp.selectPaths(rs);
    setStatus(ls.length + rs.length ? t('compare_done', { left: ls.length, right: rs.length }) : t('compare_same'));
  };
  // Ctrl+U: the panels trade folders (sort orders travel with them).
  const swapPanels = () => {
    saveSession({ left: session.right, right: session.left, leftSort: session.rightSort, rightSort: session.leftSort, leftTabs: tabsOf('right'), rightTabs: tabsOf('left'), leftTab: tabIndexOf('right'), rightTab: tabIndexOf('left') });
    setStatus(t('panels_swapped'));
  };
  // Ctrl+← / Ctrl+→: open the folder under the cursor (else the current one) in that panel.
  const targetFrom = (side, target) => {
    const p = panel(side);
    const e = p && p.getCursorEntry();
    const dir = e && e.isDir ? e.path : pathOf(side);
    navigate(target, dir);
  };
  const selectPattern = async (side, add) => {
    const p = panel(side);
    if (!p) return;
    const pattern = await dialogs.prompt({ title: t(add ? 'sel_pattern_title' : 'unsel_pattern_title'), label: t('sel_pattern_label'), value: session.lastPattern || '*.*', icon: 'select', okLabel: t('ok') });
    if (!pattern) return;
    saveSession({ lastPattern: pattern });
    const n = p.selectByPattern(pattern, add, true);
    setStatus(t('sel_count', { n }));
  };
  const rootOf = (p) => { const m = /^[a-zA-Z]:/.exec(p); return m ? m[0] + getSeparator() : getSeparator(); };

  const setTheme = (id) => {
    const theme = applyTheme(id);
    saveSession({ theme: theme.id, themeBg: theme.tokens['--bg'] });
  };

  const onAction = async (id, side = active) => {
    if (!session) return;
    if (id.startsWith('theme:')) { setTheme(id.slice(6)); return; }
    try {
      await runAction(id, side);
    } catch (err) {
      await dialogs.error(err);
    }
  };

  const runAction = async (id, side) => {
    switch (id) {
      case 'home': navigate(side, info ? info.home : session[side]); break;
      case 'newFolder': await newEntry(side, 'folder'); break;
      case 'newFile': await newEntry(side, 'file'); break;
      case 'rename': await rename(side); break;
      case 'undo': await undoRedo(true); break;
      case 'redo': await undoRedo(false); break;
      case 'view': await viewFile(side); break;
      case 'edit': await editFile(side); break;
      case 'multiRename': await multiRename(side); break;
      case 'compareDirs': compareDirs(); break;
      case 'swapPanels': swapPanels(); break;
      case 'targetLeft': targetFrom(side, 'left'); break;
      case 'targetRight': targetFrom(side, 'right'); break;
      case 'selectPattern': await selectPattern(side, true); break;
      case 'unselectPattern': await selectPattern(side, false); break;
      case 'selectAll': panel(side) && panel(side).selectAll(); break;
      case 'unselectAll': panel(side) && panel(side).clearSelection(); break;
      case 'invertSelection': panel(side) && panel(side).invertSelection(); break;
      case 'selectSameExt': panel(side) && panel(side).selectSameExt(true); break;
      case 'dirHistory': panel(side) && panel(side).openHistory(); break;
      case 'hotlist': panel(side) && panel(side).openHotlist(); break;
      case 'drives': panel(side) && panel(side).openDrives(); break;
      case 'parent': panel(side) && panel(side).goUp(); break;
      case 'root': navigate(side, rootOf(pathOf(side))); break;
      case 'toggleFnBar': saveSession({ fnBar: session.fnBar === false }); break;
      case 'newTab': newTab(side); break;
      case 'closeTab': closeTab(side); break;
      case 'closeOtherTabs': closeOtherTabs(side); break;
      case 'nextTab': cycleTab(side, 1); break;
      case 'prevTab': cycleTab(side, -1); break;
      case 'tabToOther': newTab(other(side), pathOf(side)); break;
      case 'toggleToolbar': saveSession({ showToolbar: session.showToolbar === false }); break;
      case 'delete': await remove(side); break;
      case 'trash': await trash(side); break;
      case 'copyOther': await transfer(side, false); break;
      case 'moveOther': await transfer(side, true); break;
      case 'clipCopy': await clipCopy(side); break;
      case 'clipPaste': await clipPaste(side); break;
      case 'compress': await compress(side); break;
      case 'extract': await extract(side); break;
      case 'open': await openSelected(side); break;
      case 'properties': await properties(side); break;
      case 'refresh': refreshBoth(); setStatus(t('refreshed')); break;
      case 'search': if (!(useWindows() && await openTool('search', { root: pathOf(side) }, { title: t('search_title', { root: pathOf(side) }) }))) setSearch({ root: pathOf(side) }); break;
      case 'about': await dialogs.about({ ...(info || {}), host: hostName }); break;
      case 'settings': {
        const values = {};
        for (const k of SETTINGS_KEYS) values[k] = session[k] !== undefined ? session[k] : SETTINGS_DEFAULTS[k];
        values.language = getLanguage();
        if (useWindows() && await openTool('settings', { values, shells }, { title: t('settings_title') })) break;
        const result = await dialogs.settings(values, { shells, pickFolder, pickFile, platform: info && info.platform, onChange: (live) => applySettings(live, { quiet: true }) });
        applySettings(result || values);
        break;
      }
      case 'quit': quitApp(); break;
      case 'toggleHidden': saveSession({ showHidden: !session.showHidden }); break;
      case 'toggleDock': showDock(!session.dockVisible); break;
      case 'showLog': setDockTab('log'); showDock(true); break;
      case 'newTerminal': await newTerminal(); break;
      case 'terminal': {
        // Toolbar button: show the dock on a terminal (starting one if there is none); hide it when a terminal is already showing.
        if (session.dockVisible && dockTab !== 'log') { showDock(false); break; }
        const live = terms.filter((x) => !x.exited);
        if (!live.length) await newTerminal();
        else { setDockTab(live[live.length - 1].id); showDock(true); }
        break;
      }
      case 'nextTheme': setTheme(nextThemeId(session.theme)); break;
      case 'toggleLanguage': {
        const language = getLanguage() === 'ko' ? 'en' : 'ko';
        setLanguage(language);
        saveSession({ language });
        break;
      }
      default: break;
    }
  };

  // Test hook (smoke scripts drive the UI through it; harmless otherwise).
  useEffect(() => {
    window.__cc = { action: onAction, setActive, dialogs, panels, session, call, navigate, log, terms, setDockTab, closeTerminal, history, dirHistory };
  });

  // ── Messages from the tool windows ──
  const busRef = useRef(null);
  busRef.current = async (msg) => {
    if (!msg || !session) return;
    switch (msg.type) {
      case 'refresh': refreshBoth(); if (msg.status) setStatus(msg.status); break;
      case 'renamed': afterRenameMany(msg.pairs, msg.side); break;
      case 'navigate': setActive(msg.side || 'left'); navigate(msg.side || 'left', msg.path); setStatus(t('search_opened_left', { path: msg.path })); break;
      case 'openFile': await openEntry('left', { name: baseName(msg.path), path: msg.path, isDir: false }); break;
      case 'clipCopy': inAppClipboard.current = msg.paths || []; setStatus(t('clip_copied', { n: (msg.paths || []).length })); break;
      case 'copyTo': await copyPathsTo(msg.side, msg.paths || []); break;
      case 'settings': applySettings(msg.values, { quiet: !!msg.live }); break;
      default: break;
    }
  };
  useEffect(() => onAppMessage((msg) => { busRef.current && busRef.current(msg).catch((err) => dialogs.error(err)); }), []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Global shortcuts (F-keys as in the GTK version) ──
  useEffect(() => {
    const handler = (e) => {
      if (dialogs.stack.length) return;
      // Ctrl+` toggles the dock, Ctrl+Shift+` opens a terminal — also from inside the terminal's input.
      if (e.key === '`' && (e.ctrlKey || e.metaKey) && !e.altKey) { e.preventDefault(); onAction(e.shiftKey ? 'newTerminal' : 'toggleDock'); return; }
      const tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      // Ctrl+Z undoes the last file operation, Ctrl+Y (or Ctrl+Shift+Z) redoes it.
      if ((e.ctrlKey || e.metaKey) && !e.altKey && /^[zy]$/i.test(e.key)) {
        e.preventDefault();
        onAction(e.key.toLowerCase() === 'y' || e.shiftKey ? 'redo' : 'undo');
        return;
      }
      const ctrl = e.ctrlKey || e.metaKey;
      // Total Commander keys: F3 view, F4 edit, Shift+F2 compare, Alt+F1/F2 drives, Alt+F5/F9 pack/unpack,
      // Ctrl+U swap, Ctrl+←/→ target = source, Ctrl+D hotlist, Alt+↓ history, Ctrl+M multi-rename,
      // Ctrl+PgUp / Ctrl+\ parent / root, Ctrl+R refresh, Ctrl+H hidden files.
      let id = null;
      if (e.altKey && !ctrl) {
        id = { F1: 'drives:left', F2: 'drives:right', F4: 'quit', F5: 'compress', F9: 'extract', ArrowDown: 'dirHistory' }[e.key] || null;
      } else if (ctrl && !e.altKey) {
        id = { u: 'swapPanels', U: 'swapPanels', ArrowLeft: 'targetLeft', ArrowRight: 'targetRight', d: 'hotlist', D: 'hotlist', m: 'multiRename', M: 'multiRename',
          PageUp: 'parent', PageDown: 'open', '\\': 'root', r: 'refresh', R: 'refresh', h: 'toggleHidden', H: 'toggleHidden',
          t: 'newTab', T: 'newTab', w: 'closeTab', W: 'closeTab', Tab: e.shiftKey ? 'prevTab' : 'nextTab' }[e.key] || null;
      } else if (!ctrl && !e.altKey) {
        id = e.shiftKey
          ? { F2: 'compareDirs', F4: 'newFile', F6: 'rename' }[e.key] || null
          : { F2: 'rename', F3: 'view', F4: 'edit', F5: 'copyOther', F6: 'moveOther', F7: 'newFolder', F8: 'delete', F9: 'search' }[e.key] || null;
      }
      if (id) {
        e.preventDefault();
        if (id.startsWith('drives:')) onAction('drives', id.slice(7));
        else onAction(id);
      } else if (e.key === 'Tab' && !ctrl && !e.altKey) { e.preventDefault(); const next = other(active); setActive(next); panel(next) && panel(next).focus(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  // ── Splitter ──
  const onSplitDown = (e) => {
    e.preventDefault();
    const box = splitRef.current.getBoundingClientRect();
    const move = (ev) => {
      const frac = Math.min(0.8, Math.max(0.2, (ev.clientX - box.left) / box.width));
      setSession((s) => ({ ...s, splitter: frac }));
    };
    const up = (ev) => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      const frac = Math.min(0.8, Math.max(0.2, (ev.clientX - box.left) / box.width));
      saveSession({ splitter: frac });
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  const menuState = useMemo(() => ({
    showHidden: !!(session && session.showHidden),
    theme: session ? session.theme : 'dark',
    hasSelection: selCount[active] > 0,
    selCount: selCount[active],
    oneFile: selCount[active] === 1 && !selIsDir[active],
    canExtract: selCount[active] === 1 && extractable[active],
    canTrash: !!(info && info.capabilities.trash),
    dockVisible: !!(session && session.dockVisible),
    fnBar: !(session && session.fnBar === false),
    showToolbar: !(session && session.showToolbar === false),
    tabCount: session ? tabsOf(active).length : 1,
    canUndo: history.canUndo,
    canRedo: history.canRedo,
    undoWhat: describeHistory(history.peekUndo()),
    redoWhat: describeHistory(history.peekRedo()),
  }), [session, selCount, selIsDir, extractable, active, info, history.version]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!session) return <div className="boot">{status || '…'}</div>;

  const panelProps = (side) => ({
    side,
    path: session[side],
    active: active === side,
    sort: session[`${side}Sort`] || { column: 'name', asc: true },
    showHidden: !!session.showHidden,
    suspendWatch: busy > 0 || session.autoRefresh === false,
    capabilities: info ? info.capabilities : {},
    onNavigate: (p) => { activatePanel(side); navigate(side, p); },
    onActivate: () => activatePanel(side),
    onSortChange: (sort) => saveSession({ [`${side}Sort`]: sort }),
    onSelectionChange: (entries) => {
      setSelCount((c) => (c[side] === entries.length ? c : { ...c, [side]: entries.length }));
      const dir = entries.length === 1 && entries[0].isDir;
      setSelIsDir((d) => (d[side] === dir ? d : { ...d, [side]: dir }));
      const p = panels[side].current;
      setTimeout(() => setExtractable((x) => ({ ...x, [side]: !!(p && p.isExtractable()) })), 60);
    },
    onOpenEntry: (entry) => openEntry(side, entry),
    onAction: (id) => onAction(id, side),
    history: dirHistory[side],
    hotlist: session.hotlist || [],
    columns: { perm: session.showPerm !== false, date: session.showDate !== false, type: session.showType !== false, size: session.showSize !== false },
    tabs: tabsOf(side),
    tabIndex: tabIndexOf(side),
    onTabSelect: (i) => { activatePanel(side); selectTab(side, i); },
    onTabNew: () => { activatePanel(side); newTab(side); },
    onTabClose: (i) => closeTab(side, i),
    onTabCloseOthers: (i) => closeOtherTabs(side, i),
    onTabToOther: (i) => newTab(other(side), tabsOf(side)[i].path),
    quickSearch: session.quickSearch !== false,
    spaceMeasures: session.spaceMeasures !== false,
    onHotlistChange: (hotlist) => { saveSession({ hotlist }); setStatus(t(hotlist.length > (session.hotlist || []).length ? 'hot_added' : 'hot_removed')); },
  });

  return (
    <div className="app">
      <MenuBar onAction={(id) => onAction(id)} state={menuState} />
      {session.showToolbar !== false && <Toolbar onAction={(id) => onAction(id)} theme={session.theme} dockVisible={!!session.dockVisible} state={menuState} />}
      <div className="panels" ref={splitRef}>
        <div className="panel-slot" style={{ flexBasis: `${(session.splitter || 0.5) * 100}%` }}>
          <FilePanel ref={panels.left} {...panelProps('left')} />
        </div>
        <div className="splitter" onMouseDown={onSplitDown} title="⇔" />
        <div className="panel-slot" style={{ flex: 1 }}>
          <FilePanel ref={panels.right} {...panelProps('right')} />
        </div>
      </div>
      {session.dockVisible && (
        <BottomDock tab={dockTab} onTab={setDockTab} log={log} onClearLog={() => setLog([])} onCopyLog={copyLog}
          terms={terms} shells={shells} onNewTerm={(shell) => newTerminal(shell)} onCloseTerm={closeTerminal} onTermExit={onTermExit}
          onHide={() => showDock(false)} height={session.dockHeight || 220} onResizeStart={onDockResizeStart}
          prompt={session.prompt || SETTINGS_DEFAULTS.prompt} env={termEnv} themeId={session.theme} />
      )}
      {session.fnBar !== false && <FnBar onAction={(id) => onAction(id)} state={menuState} />}
      <div className="statusbar ellipsis" title={status}>
        {status}
        {canResizeWindow && <ResizeGrip />}
      </div>
      {search && (
        <SearchDialog root={search.root} onClose={() => setSearch(null)}
          onOpenDir={(p) => { setActive('left'); navigate('left', p); setStatus(t('search_opened_left', { path: p })); }}
          onOpenFile={(p) => openEntry('left', { name: baseName(p), path: p, isDir: false })}
          onClipCopy={async (paths) => { inAppClipboard.current = paths; await writeClipboardText(paths.map(toFileUri).join('\n') + '\n'); setStatus(t('clip_copied', { n: paths.length })); }}
          onCopyTo={(side, paths) => copyPathsTo(side, paths)} />
      )}
      <DialogHost stack={dialogs.stack} resolve={dialogs.resolve} />
    </div>
  );
}
