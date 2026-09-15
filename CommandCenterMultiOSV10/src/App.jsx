// Command Center — application shell.
//
// Two FilePanels side by side, the menu bar / toolbar / status bar, the
// bottom dock (operation log + terminal tabs) and every action that needs a
// dialog, a job with progress, or the other panel.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { call, runJob, cancelJob, resolveConflict, readClipboardText, writeClipboardText, quitApp, hostName, pickFolder } from './lib/backend';
import { t, setLanguage, getLanguage, useLanguage } from './lib/i18n';
import { setSeparator, joinPath, baseName, dirName } from './lib/format';
import { FilePanel } from './components/FilePanel';
import { MenuBar, Toolbar } from './components/Chrome';
import { DialogHost, useDialogs } from './dialogs/Dialogs';
import { BottomDock } from './components/BottomDock';
import { SearchDialog } from './dialogs/SearchDialog';
import { applyTheme, themeById, nextThemeId, DEFAULT_THEME } from './themes';
import { SETTINGS_DEFAULTS } from './lib/settings';

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
  const [search, setSearch] = useState(null);   // { root } while the search window is open
  const panels = { left: useRef(null), right: useRef(null) };
  const inAppClipboard = useRef([]);
  const splitRef = useRef(null);

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
  useEffect(() => {
    (async () => {
      const i = await call('app.info');
      call('term.shells').then(setShells).catch(() => {});
      setSeparator(i.sep);
      setInfo(i);
      const s = { ...SETTINGS_DEFAULTS, ...(await call('session.load')) };
      setLanguage(s.language || 'ko');
      applyFontSize(s.fontSize);
      if (s.restoreFolders === false) { s.left = i.home; s.right = i.home; }
      const theme = applyTheme(themeIdOf(s));
      s.theme = theme.id;
      if (s.themeBg !== theme.tokens['--bg']) call('session.save', { patch: { theme: theme.id, themeBg: theme.tokens['--bg'] } }).catch(() => {});
      setSession(s);
      setStatus(t('ready', { app: t('appName') }));
    })().catch((err) => setStatus(String(err && err.message ? err.message : err)));
  }, []);

  useEffect(() => { document.title = t('appName'); }, [session && session.language]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveSession = useCallback((patch) => {
    setSession((s) => (s ? { ...s, ...patch } : s));
    call('session.save', { patch }).catch(() => {});
  }, []);

  const panel = (side = active) => panels[side].current;
  const other = (side) => (side === 'left' ? 'right' : 'left');
  const pathOf = (side) => (session ? session[side] : '');

  // Only folders that exist are entered (and remembered for the next start).
  const navigate = async (side, p) => {
    try {
      const r = await call('fs.exists', { path: p });
      if (!r.isDir) throw new Error(p);
    } catch (err) {
      await dialogs.error(t('cannot_open_dir', { msg: err.message }));
      return;
    }
    saveSession({ [side]: p });
  };

  const activatePanel = (side) => {
    if (side !== active) {
      setActive(side);
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
    const final = await runWithProgress(t('compressing'), 'archive.create', { sources, destBase, format: opts.format, split: opts.split, splitSize: opts.splitSize });
    await p.refresh();
    if (final.status === 'done') {
      setStatus(t(opts.split ? 'compressed_split' : 'compressed', { n: sources.length }));
      if (final.result && final.result.parts) p.selectPaths(final.result.parts);
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
    const final = await runWithProgress(t('extracting'), 'archive.extract', { archivePath, destDir });
    await p.refresh();
    if (final.status === 'done') { setStatus(t('extracted', { name })); p.selectPaths([destDir]); }
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
    if (!(info && info.capabilities.open)) { setStatus(t('open_unsupported')); return; }
    try {
      await call('fs.open', { path: entry.path });
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
      case 'search': setSearch({ root: pathOf(side) }); break;
      case 'about': await dialogs.about({ ...(info || {}), host: hostName }); break;
      case 'settings': {
        const v = await dialogs.settings({
          language: getLanguage(), theme: session.theme, showHidden: !!session.showHidden, fontSize: session.fontSize || 13,
          confirmDelete: session.confirmDelete !== false, splitSizeMB: session.splitSizeMB || 10,
          restoreFolders: session.restoreFolders !== false, autoRefresh: session.autoRefresh !== false,
          termShell: session.termShell || '', termCwd: session.termCwd || '',
        }, { shells, pickFolder });
        if (!v) break;
        if (v.language !== getLanguage()) setLanguage(v.language);
        const theme = applyTheme(v.theme);
        applyFontSize(v.fontSize);
        saveSession({ language: v.language, theme: theme.id, themeBg: theme.tokens['--bg'], showHidden: v.showHidden, fontSize: v.fontSize, confirmDelete: v.confirmDelete, splitSizeMB: v.splitSizeMB, restoreFolders: v.restoreFolders, autoRefresh: v.autoRefresh, termShell: v.termShell || '', termCwd: (v.termCwd || '').trim() });
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
    window.__cc = { action: onAction, setActive, dialogs, panels, session, call, navigate, log, terms, setDockTab, closeTerminal };
  });

  // ── Global shortcuts (F-keys as in the GTK version) ──
  useEffect(() => {
    const handler = (e) => {
      if (dialogs.stack.length) return;
      // Ctrl+` toggles the dock, Ctrl+Shift+` opens a terminal — also from inside the terminal's input.
      if (e.key === '`' && (e.ctrlKey || e.metaKey) && !e.altKey) { e.preventDefault(); onAction(e.shiftKey ? 'newTerminal' : 'toggleDock'); return; }
      const tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const map = { F2: 'rename', F5: 'copyOther', F6: 'moveOther', F7: 'newFolder', F8: 'delete', F9: 'search' };
      if (map[e.key]) { e.preventDefault(); onAction(map[e.key]); }
      else if (e.key === 'Tab' && !e.ctrlKey && !e.altKey) { e.preventDefault(); const next = other(active); setActive(next); panel(next) && panel(next).focus(); }
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
    canExtract: selCount[active] === 1 && extractable[active],
    dockVisible: !!(session && session.dockVisible),
  }), [session, selCount, extractable, active]);

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
      const p = panels[side].current;
      setTimeout(() => setExtractable((x) => ({ ...x, [side]: !!(p && p.isExtractable()) })), 60);
    },
    onOpenEntry: (entry) => openEntry(side, entry),
    onAction: (id) => onAction(id, side),
  });

  return (
    <div className="app">
      <MenuBar onAction={(id) => onAction(id)} state={menuState} />
      <Toolbar onAction={(id) => onAction(id)} theme={session.theme} dockVisible={!!session.dockVisible} />
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
          onHide={() => showDock(false)} height={session.dockHeight || 220} onResizeStart={onDockResizeStart} />
      )}
      <div className="statusbar ellipsis" title={status}>{status}</div>
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
