// My FTP Client — application shell.
//
// Layout (the WinForms original, top to bottom): toolbar · connection bar ·
// [ server listing | ←/→ transfer bar | local tree ] · log · status bar.
// Every action that needs a dialog, a job with progress, or both panels
// lives here; the panels only render and report selections. Copy / cut /
// paste and drag & drop between the panels, Explorer and the desktop end up in
// transferInto(): upload, download, or a copy / move on one side.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { call, runJob, cancelJob, resolveConflict, writeClipboardText, broadcastAppearance, onAppearance, openManual,
  isTauri, startNativeDrag, dragKeys, writeFileClipboard, readFileClipboard, clearFileClipboard, onOsDragDrop } from './lib/backend';
import { setDragHandler, dropTargetAt } from './lib/filedrag';
import { setAppearance, getAppearance } from './lib/appearance';
import { t, setLanguage, getLanguage, useLanguage } from './lib/i18n';
import { setSeparator, baseName, dirName, joinLocal, posixParent, formatSpeed, formatSize, formatDate, timeStamp, samePath, isUnder, parseHostInput } from './lib/format';
import { playSuccess, playError, setSoundsEnabled } from './lib/sound';
import { SETTINGS_DEFAULTS } from './lib/settings';
import { applyTheme, themeById, nextThemeId, DEFAULT_THEME } from './themes';
import { Toolbar } from './components/Toolbar';
import { ConnectionBar, defaultPort } from './components/ConnectionBar';
import { RemotePanel } from './components/RemotePanel';
import { LocalTree, setLocalHeadPath } from './components/LocalTree';
import { TransferBar } from './components/TransferBar';
import { LogPanel } from './components/LogPanel';
import { StatusBar } from './components/StatusBar';
import { ContextMenu } from './components/ContextMenu';
import { DialogHost, useDialogs } from './dialogs/Dialogs';

function applyFontSize(px) {
  document.documentElement.style.setProperty('--fs', `${Math.max(9, Number(px) || 13)}px`);
}

function themeIdOf(s) {
  const id = s && s.theme;
  return id ? themeById(id).id : DEFAULT_THEME;
}

const EMPTY_FORM = { protocol: 'FTP', host: '', port: '21', user: '', password: '' };

// Path rules per side: server paths are POSIX and case-sensitive.
const sidePaths = {
  server: { parent: posixParent, same: (a, b) => a === b, under: (c, p) => c === p || c.startsWith(p.endsWith('/') ? p : `${p}/`) },
  local: { parent: dirName, same: samePath, under: isUnder },
};

const sameHover = (a, b) => (!a && !b) || (a && b && a.side === b.side && a.dir === b.dir && a.row === b.row);
const MAX_LOG = 2000;

export default function App() {
  useLanguage();
  const dialogs = useDialogs();
  const [info, setInfo] = useState(null);
  const [session, setSession] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [profiles, setProfiles] = useState([]);
  const [profileName, setProfileName] = useState('');
  const [history, setHistory] = useState([]);
  const [historyMenu, setHistoryMenu] = useState(null);   // anchor element
  const [conn, setConn] = useState(null);          // { id, protocol, host, port, user }
  const [connecting, setConnecting] = useState(false);
  const [server, setServer] = useState({ path: '/', parent: null, entries: [], loading: false, error: '' });
  const [serverSel, setServerSel] = useState(new Set());
  const [localSel, setLocalSel] = useState(new Set());
  const [localSelEntries, setLocalSelEntries] = useState([]);
  const [localDir, setLocalDir] = useState('');
  const [log, setLog] = useState([]);
  const [status, setStatus] = useState('');
  const [progress, setProgress] = useState(null);  // { done, total, speed, cancelling }
  const [active, setActive] = useState('local');
  const [serverWidth, setServerWidth] = useState(0.5);
  const [logHeight, setLogHeight] = useState(170);
  const [terminalView, setTerminalView] = useState(false);
  const [bootError, setBootError] = useState('');
  const [ctxMenu, setCtxMenu] = useState(null);
  const [clip, setClip] = useState(null);          // { side, items, move, connId } — the app's copy / cut
  const [dropHover, setDropHover] = useState(null); // { side, dir, row } under a drag
  const nativeDragRef = useRef(null);              // our drag that went out to the OS (it may come back)
  const osEnterPaths = useRef([]);
  const osDropRef = useRef(null);
  const localTree = useRef(null);
  const filesRef = useRef(null);
  const logPanelRef = useRef(null);
  const jobRef = useRef(null);                     // the running job id (for Cancel)
  const connRef = useRef(null);
  connRef.current = conn;

  // ── Log / status ──
  const appendLog = useCallback((text, level = '') => {
    setLog((l) => {
      const next = [...l, { time: timeStamp(), text, level }];
      return next.length > MAX_LOG ? next.slice(next.length - MAX_LOG) : next;
    });
  }, []);

  const showError = useCallback((title, err, extra) => {
    playError();
    return dialogs.error(err, extra, title);
  }, [dialogs]);

  const errMsg = (err) => (err && err.message) || String(err);

  // ── Boot ──
  useEffect(() => {
    (async () => {
      const i = await call('app.info');
      setSeparator(i.sep);
      setInfo(i);
      window.__mfcDetachedDialogs = !!(i.capabilities && i.capabilities.detachedDialogs);
      const s = { ...SETTINGS_DEFAULTS, ...(await call('session.load')) };
      setLanguage(s.language || 'ko');
      applyFontSize(s.fontSize);
      setSoundsEnabled(s.sounds !== false);
      const theme = applyTheme(themeIdOf(s));
      s.theme = theme.id;
      setAppearance({ theme: theme.id, language: s.language || 'ko', fontSize: s.fontSize });
      if (s.themeBg !== theme.tokens['--bg']) call('session.save', { patch: { theme: theme.id, themeBg: theme.tokens['--bg'] } }).catch(() => {});
      setServerWidth(Number(s.serverWidth) > 0.1 && Number(s.serverWidth) < 0.9 ? Number(s.serverWidth) : 0.5);
      setLogHeight(Number(s.logHeight) >= 60 ? Number(s.logHeight) : 170);
      setSession(s);
      const { profiles: list } = await call('profiles.list');
      setProfiles(list);
      call('history.list').then((r) => setHistory(r.history)).catch(() => {});
      const start = s.restoreLocalPath === false ? i.home : (s.lastLocalPath || i.home);
      setLocalDir(start);
      setLocalHeadPath(start);
      if (s.lastProfile && list.some((p) => p.name === s.lastProfile)) loadProfile(list.find((p) => p.name === s.lastProfile), false);
      setStatus(t('ready'));
      appendLog(t('ready_log'));
      // The tree is mounted by now; open the remembered folder.
      setTimeout(() => localTree.current && localTree.current.expandTo(start), 0);
    })().catch((err) => {
      setBootError(errMsg(err));
      setStatus(errMsg(err));
      appendLog(errMsg(err), 'error');
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { document.title = t('appName'); }, [session && session.language]); // eslint-disable-line react-hooks/exhaustive-deps

  // A theme previewed in the settings window shows here too.
  useEffect(() => onAppearance((appearance) => {
    if (!appearance || !appearance.theme) return;
    const theme = applyTheme(appearance.theme);
    setSession((s) => (s ? { ...s, theme: theme.id, themeBg: theme.tokens['--bg'] } : s));
  }), []);

  const saveSession = useCallback((patch) => {
    setSession((s) => (s ? { ...s, ...patch } : s));
    call('session.save', { patch }).catch(() => {});
    if ('theme' in patch || 'language' in patch || 'fontSize' in patch) {
      const next = { ...(session || {}), ...patch };
      broadcastAppearance(setAppearance({ theme: next.theme, language: next.language, fontSize: next.fontSize }));
    }
  }, [session]);

  // ── Profiles ──
  const loadProfile = (p, announce = true) => {
    setForm({ protocol: p.protocol, host: p.host, port: p.port || defaultPort(p.protocol), user: p.user, password: p.password });
    setProfileName(p.name);
    if (announce) appendLog(t('log_profile_loaded', { name: p.name }));
  };

  const pickProfile = (name) => {
    setProfileName(name);
    const p = profiles.find((x) => x.name === name);
    if (p) { loadProfile(p); saveSession({ lastProfile: name }); }
  };

  const saveProfile = async () => {
    const def = profileName || `${form.protocol}_${form.host}`;
    const name = await dialogs.prompt({ title: t('dlg_profile_save'), label: t('lbl_profile_name'), value: def, icon: 'save' });
    if (!name) return;
    try {
      const r = await call('profiles.save', { profile: { name, ...form } });
      setProfiles(r.profiles);
      setProfileName(name);
      saveSession({ lastProfile: name });
      appendLog(t(r.replaced ? 'log_profile_updated' : 'log_profile_added', { name }));
    } catch (err) { showError(t('dlg_error'), err); }
  };

  const deleteProfiles = async () => {
    if (!profiles.length) { await dialogs.message({ kind: 'info', title: t('notice'), message: t('no_profiles') }); return; }
    const names = await dialogs.profileDelete(profiles);
    if (!names || !names.length) return;
    const ok = await dialogs.confirm({ title: t('dlg_profile_delete_confirm'), message: t('profile_delete_confirm', { n: names.length, list: names.map((n) => `  • ${n}`).join('\n') }), danger: true });
    if (!ok) return;
    try {
      const r = await call('profiles.delete', { names });
      setProfiles(r.profiles);
      if (names.includes(profileName)) { setProfileName(''); saveSession({ lastProfile: '' }); }
      appendLog(t('log_profile_deleted', { names: names.join(', ') }));
    } catch (err) { showError(t('dlg_error'), err); }
  };

  // ── Connection history (every successful connection, profile or not) ──
  const historyItems = () => {
    const items = history.map((h, i) => ({
      id: `h:${i}`,
      label: `${h.protocol.toLowerCase()}://${h.user ? `${h.user}@` : ''}${h.host}:${h.port}`,
      icon: h.protocol === 'SFTP' ? 'server' : 'plug',
      meta: `${formatDate(h.lastAt)} · ${t('history_times', { n: h.count })}`,
    }));
    if (!items.length) items.push({ id: 'none', label: t('history_empty'), disabled: true });
    else items.push({ sep: true }, { id: 'clear', label: t('history_clear'), icon: 'eraser' });
    return items;
  };

  const pickHistory = async (id) => {
    if (id === 'clear') {
      const r = await call('history.clear').catch(() => null);
      if (r) setHistory(r.history);
      return;
    }
    const h = history[Number(id.slice(2))];
    if (!h) return;
    // A profile for the same server supplies the password; the profile combo follows it.
    const p = profiles.find((x) => x.protocol === h.protocol && x.host.toLowerCase() === h.host.toLowerCase() && (Number(x.port) || Number(defaultPort(x.protocol))) === h.port && x.user === h.user);
    setForm({ protocol: h.protocol, host: h.host, port: String(h.port), user: h.user, password: p ? p.password : '' });
    setProfileName(p ? p.name : '');
    appendLog(t('log_history_loaded', { url: `${h.protocol.toLowerCase()}://${h.host}:${h.port}` }));
  };

  // ── Connect / disconnect ──
  const connect = async () => {
    // "ftp://user:pw@host:2121/pub" pasted into Host → the form's fields.
    const parsed = parseHostInput(form.host);
    const host = parsed.host;
    if (!host) { showError(t('dlg_connect_error'), t('host_required')); return; }
    const protocol = parsed.protocol || form.protocol;
    const port = Number(parsed.port) || Number(form.port) || Number(defaultPort(protocol));
    if (host !== form.host || parsed.protocol || parsed.port || parsed.user !== undefined) {
      setForm((f) => ({ ...f, host, protocol, port: String(port), user: parsed.user !== undefined ? parsed.user : f.user, password: parsed.password !== undefined ? parsed.password : f.password }));
    }
    const user = parsed.user !== undefined ? parsed.user : form.user;
    const password = parsed.password !== undefined ? parsed.password : form.password;
    const url = `${protocol.toLowerCase()}://${host}:${port}`;
    setConnecting(true);
    setStatus(t('status_connecting', { url }));
    appendLog(t('log_connecting', { protocol, host, port, user }));
    setProgress({ done: 0, total: 0, speed: 0 });
    let snap;
    try {
      snap = await runJob('remote.connect', { protocol, host, port, user, password }, (s) => { jobRef.current = s.id; setProgress((p) => ({ done: 0, total: 0, speed: 0, jobId: s.id, cancelling: p && p.cancelling })); });
    } catch (err) {
      snap = { status: 'error', error: errMsg(err), errorDetail: err.stack || '' };
    }
    jobRef.current = null;
    setProgress(null);
    setConnecting(false);
    if (snap.status === 'done') {
      const c = snap.result;
      setConn(c);
      call('history.list').then((r) => setHistory(r.history)).catch(() => {});
      playSuccess();
      setStatus(t('status_connected', { url }));
      appendLog(t('log_connected', { url }), 'ok');
      saveSession({ lastProfile: profileName });
      if (session && session.showConnectedDialog !== false) {
        dialogs.message({ kind: 'info', title: t('dlg_connected'), message: t('connected_msg', { protocol, host, port, user }) });
      }
      loadServer('/', c);
    } else if (snap.status === 'cancelled') {
      setStatus(t('status_connect_cancelled'));
      appendLog(t('log_connect_cancelled'));
    } else if (/timed out|ETIMEDOUT|Timeout/i.test(snap.error || '')) {
      setStatus(t('status_timeout'));
      appendLog(t('log_timeout'), 'error');
      showError(t('dlg_timeout'), snap.error, snap.errorDetail);
    } else {
      setStatus(t('status_connect_failed'));
      appendLog(t('log_connect_failed', { msg: snap.error }), 'error');
      showError(t('dlg_connect_error'), snap.error, snap.errorDetail);
    }
  };

  const disconnect = async () => {
    const c = connRef.current;
    if (!c) return;
    try { await call('remote.disconnect', { id: c.id }); } catch { /* already gone */ }
    setConn(null);
    setServer({ path: '/', parent: null, entries: [], loading: false, error: '' });
    setServerSel(new Set());
    setStatus(t('status_disconnected'));
    appendLog(t('log_disconnected'));
  };

  // ── Server listing ──
  const loadServer = async (p, c = connRef.current) => {
    if (!c) return;
    setServer((s) => ({ ...s, loading: true }));
    setStatus(t('status_server_loading', { path: p }));
    appendLog(t('log_server_dir', { path: p }));
    try {
      const r = await call('remote.list', { id: c.id, path: p });
      setServer({ path: r.path, parent: r.parent, entries: r.entries, loading: false, error: '' });
      setServerSel(new Set());
      setStatus(t('status_server', { path: r.path, n: r.entries.length }));
    } catch (err) {
      setServer((s) => ({ ...s, loading: false }));
      setStatus(t('status_server_failed'));
      appendLog(t('log_server_failed', { msg: errMsg(err) }), 'error');
      if (err.code === 'NOT_CONNECTED') { setConn(null); setServer({ path: '/', parent: null, entries: [], loading: false, error: '' }); }
      showError(t('dlg_list_error'), err);
    }
  };

  const refreshServer = () => loadServer(server.path);

  // ── Transfers ──
  const transferProgress = (verb) => (snap) => {
    jobRef.current = snap.id;
    setProgress((p) => ({ done: snap.bytes, total: snap.bytesTotal, speed: snap.speed, jobId: snap.id, cancelling: p && p.cancelling }));
    const pct = snap.bytesTotal > 0 ? Math.min(100, Math.round((snap.bytes * 100) / snap.bytesTotal)) : 0;
    if (snap.status === 'running') setStatus(t('status_transfer', { verb, name: snap.detail || '', pct, speed: formatSpeed(snap.speed), done: snap.current, total: snap.total }));
  };

  // One log line per transferred file: "  ↓ /pub/a.txt  →  C:\\dl\\a.txt   1.2 MB  0.8s (1.5 MB/s)".
  const logFileNote = (n) => {
    const arrow = n.dir === 'upload' ? '↑' : '↓';
    if (n.skipped) { appendLog(t('log_file_skipped', { arrow, src: n.src }), 'file'); return; }
    const secs = n.ms / 1000;
    const speed = n.ms > 0 && n.size > 0 ? formatSpeed(n.size / secs) : '';
    const time = `${secs < 10 ? secs.toFixed(1) : Math.round(secs)}s${speed ? ` (${speed})` : ''}`;
    appendLog(t('log_file_done', { arrow, src: n.src, dest: n.dest, size: formatSize(n.size), time }), 'file');
  };

  // Runs a transfer job: conflicts open the dialog, the status bar shows progress.
  const runTransfer = async (method, args, verb) => {
    let handled = '';
    let seenNote = 0;
    setProgress({ done: 0, total: 0, speed: 0 });
    const onUpdate = transferProgress(verb);
    try {
      return await runJob(method, args, async (snap) => {
        onUpdate(snap);
        for (const n of snap.notes || []) { if (n.seq > seenNote) { seenNote = n.seq; if (n.type === 'file') logFileNote(n); } }
        if (snap.conflict) {
          const key = `${snap.conflict.destPath}|${snap.current}`;
          if (handled === key) return;
          handled = key;
          const { answer, applyAll } = await dialogs.conflict(snap.conflict);
          await resolveConflict(snap.id, answer, applyAll).catch(() => {});
        }
      });
    } finally {
      jobRef.current = null;
      setProgress(null);
    }
  };

  const cancelCurrent = () => {
    if (!jobRef.current) return;
    setProgress((p) => (p ? { ...p, cancelling: true } : p));
    cancelJob(jobRef.current).catch(() => {});
  };

  const summary = (r) => t('transfer_summary', { n: r.done }) + (r.skipped ? t('transfer_skipped', { n: r.skipped }) : '');

  // `dir` is the target folder (the current one by default); `move` removes
  // the sources afterwards (cut & paste, Shift-drag).
  const download = async (items, { dir, move } = {}) => {
    const c = connRef.current;
    if (!c) { showError(t('dlg_error'), t('not_connected')); return null; }
    if (!items.length) { setStatus(t('nothing_selected')); return null; }
    const dest = dir || localDir;
    if (!dest) return null;
    const name = items.length === 1 ? baseName(items[0].path) : `${items.length} items`;
    appendLog(t('log_download_start', { src: items.map((i) => i.path).join(', '), dest }) + (move ? t('log_move_tag') : ''));
    let snap;
    try {
      snap = await runTransfer('transfer.download', { id: c.id, items: items.map((i) => ({ path: i.path, isDir: i.isDir, size: i.size, mtime: i.mtime })), localDir: dest, move: !!move }, t('verb_download'));
    } catch (err) { snap = { status: 'error', error: errMsg(err), errorDetail: err.stack || '' }; }
    if (snap.status === 'done') {
      playSuccess();
      appendLog(`${t('log_download_done', { name })}  (${summary(snap.result)})`, 'ok');
      setStatus(t('status_download_done', { name }));
    } else if (snap.status === 'cancelled') {
      appendLog(t('log_download_cancelled', { name }));
      setStatus(t('status_download_cancelled'));
    } else {
      appendLog(t('log_download_failed', { msg: snap.error }), 'error');
      setStatus(t('status_download_failed'));
      showError(t('dlg_download_error'), snap.error, snap.errorDetail);
    }
    if (localTree.current) localTree.current.refresh(dest);
    if (move && connRef.current) loadServer(server.path);
    return snap;
  };

  const upload = async (items, { dir, move } = {}) => {
    const c = connRef.current;
    if (!c) { showError(t('dlg_error'), t('not_connected')); return null; }
    if (!items.length) { setStatus(t('nothing_selected')); return null; }
    const name = items.length === 1 ? baseName(items[0].path) : `${items.length} items`;
    const remoteDir = dir || server.path;
    appendLog(t('log_upload_start', { src: items.map((i) => i.path).join(', '), dest: remoteDir }) + (move ? t('log_move_tag') : ''));
    let snap;
    try {
      snap = await runTransfer('transfer.upload', { id: c.id, items: items.map((i) => ({ path: i.path, isDir: i.isDir })), remoteDir, move: !!move }, t('verb_upload'));
    } catch (err) { snap = { status: 'error', error: errMsg(err), errorDetail: err.stack || '' }; }
    if (snap.status === 'done') {
      playSuccess();
      appendLog(`${t('log_upload_done', { name })}  (${summary(snap.result)})`, 'ok');
      setStatus(t('status_upload_done', { name }));
    } else if (snap.status === 'cancelled') {
      appendLog(t('log_upload_cancelled', { name }));
      setStatus(t('status_upload_cancelled'));
    } else {
      appendLog(t('log_upload_failed', { msg: snap.error }), 'error');
      setStatus(t('status_upload_failed'));
      showError(t('dlg_upload_error'), snap.error, snap.errorDetail);
    }
    if (connRef.current) loadServer(server.path);
    if (move) refreshLocalParents(items);
    return snap;
  };

  const refreshLocalParents = (items) => {
    if (!localTree.current) return;
    for (const p of new Set(items.map((i) => dirName(i.path)))) localTree.current.refresh(p);
  };

  // Copy or move on one side: server → server (rename, or copy through a
  // temporary folder) and local → local.
  const copyMove = async (side, items, dir, move) => {
    const c = connRef.current;
    if (side === 'server' && !c) { showError(t('dlg_error'), t('not_connected')); return null; }
    const name = items.length === 1 ? baseName(items[0].path) : `${items.length} items`;
    const verb = t(move ? 'verb_move' : 'verb_copy');
    appendLog(t('log_copy_start', { verb, src: items.map((i) => i.path).join(', '), dest: dir }));
    const list = items.map((i) => ({ path: i.path, isDir: i.isDir, size: i.size, mtime: i.mtime }));
    let snap;
    try {
      snap = side === 'server'
        ? await runTransfer(move ? 'remote.move' : 'remote.copy', { id: c.id, items: list, destDir: dir }, verb)
        : await runTransfer('local.copy', { items: list, destDir: dir, move: !!move }, verb);
    } catch (err) { snap = { status: 'error', error: errMsg(err), errorDetail: err.stack || '' }; }
    if (snap.status === 'done') {
      playSuccess();
      appendLog(`${t('log_copy_done', { verb, name })}  (${summary(snap.result)})`, 'ok');
      setStatus(t('status_copy_done', { verb, name }));
    } else if (snap.status === 'cancelled') {
      appendLog(t('log_copy_cancelled', { verb, name }));
      setStatus(t('status_copy_cancelled', { verb }));
    } else {
      appendLog(t('log_copy_failed', { verb, msg: snap.error }), 'error');
      setStatus(t('status_copy_failed', { verb }));
      showError(t('dlg_copy_error'), snap.error, snap.errorDetail);
    }
    if (side === 'server') { if (connRef.current) loadServer(server.path); }
    else if (localTree.current) {
      await localTree.current.refresh(dir);
      if (move) refreshLocalParents(items);
    }
    return snap;
  };

  // src: { side, items, external? } — what travels; side / dir: where it lands.
  const transferInto = async (src, side, dir, move) => {
    if (!src || !src.items.length || !dir) return null;
    if (progress) { setStatus(t('busy')); return null; }
    if (src.side === 'server' && side === 'local') return download(src.items, { dir, move });
    if (src.side === 'local' && side === 'server') return upload(src.items, { dir, move });
    return copyMove(side, src.items, dir, move);
  };

  // Explorer-style defaults: on the same side (same drive) a drag moves and
  // Ctrl copies; across sides, or from outside the app, it copies and Shift
  // moves. Null when the drop would do nothing (onto itself, into itself, a
  // move into the folder it is already in).
  const dropPlan = (src, target, keys) => {
    if (!src || !target || !src.items.length) return null;
    if (target.side === 'server' && !connRef.current) return null;
    const P = sidePaths[target.side];
    if (src.side === target.side) {
      for (const it of src.items) if (P.same(it.path, target.dir) || (it.isDir && P.under(target.dir, it.path))) return null;
    }
    let move;
    if (src.side === target.side && !src.external) {
      const sameDrive = src.side === 'server' || !info || info.sep !== '\\' || src.items[0].path.slice(0, 2).toLowerCase() === target.dir.slice(0, 2).toLowerCase();
      move = sameDrive ? !keys.ctrl : (keys.shift && !keys.ctrl);
    } else move = keys.shift && !keys.ctrl;
    if (move && src.side === target.side && src.items.every((it) => P.same(P.parent(it.path), target.dir))) return null;
    return { move };
  };

  const showDropHover = (next) => setDropHover((h) => (sameHover(h, next) ? h : next));
  const targetAt = (x, y) => dropTargetAt(x, y, (side) => (side === 'server' ? (connRef.current ? server.path : '') : localDir), dirName);
  const dropLabel = (plan, target) => t(plan.move ? 'drop_move' : 'drop_copy', { dir: (target.side === 'server' ? target.dir.split('/').pop() : baseName(target.dir)) || target.dir });

  const statLocal = async (paths) => (await Promise.all(paths.map((p) => call('local.stat', { path: p }).catch(() => null)))).filter(Boolean);

  // A drag that left the window: the OS takes it over (Explorer, the desktop).
  // Server rows are fetched to a temporary folder first; if the button was
  // let go meanwhile there is nothing to drag any more.
  const dragOut = async (src, keys) => {
    if (!isTauri) { setStatus(t('drag_out_unsupported')); return; }
    let paths;
    let move = false;
    if (src.side === 'local') {
      paths = src.items.map((i) => i.path);
      move = keys.shift && !keys.ctrl;
    } else {
      const c = connRef.current;
      if (!c) return;
      if (!info || info.platform !== 'win32') { setStatus(t('drag_out_unsupported')); return; }
      if (progress) { setStatus(t('busy')); return; }
      setStatus(t('drag_out_preparing'));
      let snap;
      try {
        const tmp = (await call('local.dragTemp')).path;
        paths = src.items.map((i) => joinLocal(tmp, i.name || baseName(i.path)));
        snap = await runTransfer('transfer.download', { id: c.id, items: src.items.map((i) => ({ path: i.path, isDir: i.isDir, size: i.size, mtime: i.mtime })), localDir: tmp }, t('verb_download'));
      } catch (err) { snap = { status: 'error', error: errMsg(err), errorDetail: err.stack || '' }; }
      if (snap.status === 'cancelled') { setStatus(t('status_download_cancelled')); return; }
      if (snap.status !== 'done') { setStatus(t('status_download_failed')); showError(t('dlg_download_error'), snap.error, snap.errorDetail); return; }
      if (!(await dragKeys()).left) { setStatus(t('drag_out_released')); appendLog(t('drag_out_released')); return; }
      setStatus(t('ready'));
    }
    nativeDragRef.current = src;
    appendLog(t('log_drag_out', { n: paths.length }));
    try { await startNativeDrag(paths, move); } catch (err) { appendLog(errMsg(err), 'error'); }
    setTimeout(() => { if (nativeDragRef.current === src) nativeDragRef.current = null; }, 500);
    if (src.side === 'local') refreshLocalParents(src.items);   // a move into Explorer took them away
  };

  // Files from outside (Explorer, the desktop) or our own drag coming back.
  osDropRef.current = async (ev) => {
    if (ev.type === 'leave') { showDropHover(null); return; }
    if (ev.type === 'enter') osEnterPaths.current = ev.paths;
    const own = nativeDragRef.current;
    const paths = ev.paths && ev.paths.length ? ev.paths : osEnterPaths.current;
    const src = own || { side: 'local', external: true, items: paths.map((p) => ({ path: p, name: baseName(p), isDir: false })) };
    const target = targetAt(ev.x, ev.y);
    if (ev.type !== 'drop') { showDropHover(dropPlan(src, target, { shift: false, ctrl: false }) ? target : null); return; }
    showDropHover(null);
    nativeDragRef.current = null;
    let real = src;
    if (!own) {
      const items = await statLocal(paths);
      if (!items.length) return;
      real = { side: 'local', external: true, items };
    }
    const plan = dropPlan(real, target, await dragKeys());
    if (plan) transferInto(real, target.side, target.dir, plan.move);
  };

  // ── Copy / cut / paste ──
  // Local items also go on the system clipboard as a file list (Explorer can
  // paste them); server items put their paths there as text, which replaces
  // a file list copied in Explorer, so Ctrl+V pastes what was copied last.
  const clipboardOp = async (side, op) => {
    if (op === 'paste') { paste(side); return; }
    const items = side === 'server' ? serverSelected() : localSelEntries.filter((e) => !e.kind);
    if (!items.length) { setStatus(t('nothing_selected')); return; }
    const move = op === 'cut';
    const paths = items.map((i) => i.path);
    setClip({ side, items, move, connId: side === 'server' && conn ? conn.id : null });
    if (side !== 'local' || !(await writeFileClipboard(paths, move, paths.join('\n')))) writeClipboardText(paths.join('\n'));
    setStatus(t(move ? 'status_clip_cut' : 'status_clip_copy', { n: items.length }));
  };

  const paste = async (side) => {
    if (side === 'server' && !connRef.current) return;
    let src = clip;
    const shell = await readFileClipboard();
    const mine = src && src.side === 'local' && shell && shell.paths.length === src.items.length && src.items.every((it, i) => samePath(it.path, shell.paths[i]));
    if (shell && shell.paths.length && !mine) {
      const items = await statLocal(shell.paths);
      if (items.length) src = { side: 'local', items, move: shell.cut, external: true };
    }
    if (!src) { setStatus(t('clipboard_empty')); return; }
    if (src.side === 'server' && (!connRef.current || src.connId !== connRef.current.id)) { setStatus(t('clip_other_connection')); return; }
    const dir = side === 'server' ? server.path : localDir;
    const P = sidePaths[side];
    if (src.move && src.side === side && src.items.every((it) => P.same(P.parent(it.path), dir))) return;
    const snap = await transferInto(src, side, dir, src.move);
    if (src.move && snap && snap.status === 'done') {
      setClip(null);
      if (src.side === 'local') clearFileClipboard();
    }
  };

  const deleteSelected = (side) => {
    if (side === 'server') { remove('server', serverSelected()); return; }
    if (localSelEntries.length && !localSelEntries.some((e) => e.kind)) remove('local', localSelEntries);
  };

  const renameSelected = (side) => {
    if (side === 'server') { const sel = serverSelected(); if (sel.length === 1) rename('server', sel[0]); return; }
    if (localSelEntries.length === 1 && !localSelEntries[0].kind) rename('local', localSelEntries[0]);
  };

  const serverSelected = () => server.entries.filter((e) => serverSel.has(e.path));
  const downloadSelected = () => download(serverSelected());
  const uploadSelected = () => upload(localSelEntries);

  // ── Local navigation ──
  const onLocalDir = useCallback((p) => {
    setLocalDir((cur) => {
      if (samePath(cur, p)) return cur;
      setLocalHeadPath(p);
      setStatus(t('status_local', { path: p }));
      call('session.save', { patch: { lastLocalPath: p } }).catch(() => {});
      return p;
    });
  }, []);

  const onLocalSelection = useCallback((set, entries) => { setLocalSel(set); setLocalSelEntries(entries || []); }, []);

  // ── Folder operations (both sides) ──
  const newFolder = async (side) => {
    const name = await dialogs.prompt({ title: t('dlg_new_folder'), label: t('lbl_folder_name'), value: t('default_folder'), icon: 'folderNew' });
    if (!name) return;
    try {
      if (side === 'server') {
        const r = await call('remote.mkdir', { id: conn.id, dir: server.path, name });
        appendLog(t('log_mkdir', { path: r.path }));
        loadServer(server.path);
      } else {
        const r = await call('local.mkdir', { dir: localDir, name });
        appendLog(t('log_mkdir', { path: r.path }));
        if (localTree.current) { await localTree.current.expand(localDir); await localTree.current.refresh(localDir); }
      }
    } catch (err) { showError(t('dlg_error'), err); }
  };

  const rename = async (side, entry) => {
    if (!entry) return;
    const name = await dialogs.prompt({ title: t('dlg_rename'), label: t('lbl_new_name'), value: entry.name, selectStem: !entry.isDir, icon: 'rename' });
    if (!name || name === entry.name) return;
    try {
      if (side === 'server') {
        const r = await call('remote.rename', { id: conn.id, path: entry.path, newName: name });
        appendLog(t('log_renamed', { from: entry.path, to: r.path }));
        loadServer(server.path);
      } else {
        const r = await call('local.rename', { path: entry.path, newName: name });
        appendLog(t('log_renamed', { from: entry.path, to: r.path }));
        const parent = dirName(entry.path);
        if (localTree.current) await localTree.current.refresh(parent);
        if (entry.isDir && isUnder(localDir, entry.path)) onLocalDir(parent);
      }
    } catch (err) { showError(t('dlg_error'), err); }
  };

  const remove = async (side, items) => {
    if (!items.length) return;
    if (session && session.confirmDelete !== false) {
      const msg = (items.length === 1 ? t('delete_confirm_one', { name: items[0].name }) : t('delete_confirm_many', { n: items.length }))
        + (side === 'server' ? t('delete_confirm_remote') : t('delete_confirm_local'));
      const ok = await dialogs.confirm({ title: t('dlg_delete'), message: msg, danger: true, yesLabel: t('ctx_delete') });
      if (!ok) return;
    }
    try {
      if (side === 'server') {
        setProgress({ done: 0, total: 0, speed: 0 });
        let snap;
        try {
          snap = await runJob('remote.delete', { id: conn.id, items: items.map((i) => ({ path: i.path, isDir: i.isDir })) }, (s) => { jobRef.current = s.id; setProgress((p) => ({ done: 0, total: 0, speed: 0, jobId: s.id, cancelling: p && p.cancelling })); if (s.detail) setStatus(t('status_deleting', { name: s.detail })); });
        } finally { jobRef.current = null; setProgress(null); }
        if (snap.status === 'error') throw Object.assign(new Error(snap.error), { stack: snap.errorDetail });
        appendLog(t('log_deleted', { n: snap.result ? snap.result.count : items.length }));
        loadServer(server.path);
      } else {
        const r = await call('local.delete', { paths: items.map((i) => i.path) });
        appendLog(t('log_deleted', { n: r.count }));
        const parents = new Set(items.map((i) => dirName(i.path)));
        for (const p of parents) if (localTree.current) await localTree.current.refresh(p);
        const gone = items.find((i) => i.isDir && isUnder(localDir, i.path));
        if (gone) onLocalDir(dirName(gone.path));
        setLocalSel(new Set()); setLocalSelEntries([]);
      }
    } catch (err) {
      appendLog(t('log_delete_failed', { msg: errMsg(err) }), 'error');
      showError(t('dlg_delete_error'), err);
    }
  };

  const reveal = async (p) => {
    if (!info || !info.capabilities.reveal) { await dialogs.message({ kind: 'info', title: t('notice'), message: t('reveal_unsupported') }); return; }
    try { await call('local.reveal', { path: p }); } catch (err) { showError(t('dlg_error'), err); }
  };

  // ── Context menus ──
  const serverContext = (x, y, entry) => {
    // A right-click on a row outside the selection selects it in the same event; this render does not know yet.
    const sel = entry && !serverSel.has(entry.path) ? [entry] : serverSelected();
    const items = [
      { id: 'download', label: t('ctx_download'), icon: 'download', disabled: !sel.length },
      { sep: true },
      { id: 'refresh', label: t('ctx_refresh'), icon: 'refresh' },
      { id: 'parent', label: t('ctx_go_parent'), icon: 'folderUp', disabled: server.parent === null },
      { sep: true },
      { id: 'newFolder', label: t('ctx_new_folder'), icon: 'folderNew' },
      { id: 'rename', label: t('ctx_rename'), icon: 'rename', disabled: sel.length !== 1, shortcut: 'F2' },
      { id: 'delete', label: t('ctx_delete'), icon: 'trash', disabled: !sel.length, shortcut: 'Del' },
      { sep: true },
      { id: 'cut', label: t('ctx_cut'), icon: 'cut', disabled: !sel.length, shortcut: 'Ctrl+X' },
      { id: 'copy', label: t('ctx_copy'), icon: 'copy', disabled: !sel.length, shortcut: 'Ctrl+C' },
      { id: 'paste', label: t('ctx_paste'), icon: 'paste', disabled: !clip && !isTauri, shortcut: 'Ctrl+V' },
      { sep: true },
      { id: 'copyPath', label: t('ctx_copy_path'), icon: 'copy', disabled: !entry },
    ];
    setCtxMenu({ x, y, items, onPick: (id) => {
      if (id === 'cut' || id === 'copy' || id === 'paste') clipboardOp('server', id);
      else if (id === 'download') download(sel);
      else if (id === 'refresh') refreshServer();
      else if (id === 'parent') loadServer(server.parent);
      else if (id === 'newFolder') newFolder('server');
      else if (id === 'rename') rename('server', sel[0]);
      else if (id === 'delete') remove('server', sel);
      else if (id === 'copyPath') writeClipboardText(entry.path);
    } });
  };

  const localContext = (x, y, entry) => {
    const sel = entry && !localSel.has(entry.path) ? [entry] : localSelEntries;
    const items = [
      { id: 'upload', label: t('ctx_upload'), icon: 'upload', disabled: !sel.length || !conn },
      { sep: true },
      { id: 'refresh', label: t('ctx_refresh'), icon: 'refresh' },
      { id: 'reveal', label: t('ctx_reveal'), icon: 'explorer', disabled: !(info && info.capabilities.reveal) },
      { id: 'open', label: t('ctx_open'), icon: 'open', disabled: !(info && info.capabilities.open) || !entry || entry.isDir },
      { sep: true },
      { id: 'newFolder', label: t('ctx_new_folder'), icon: 'folderNew' },
      { id: 'rename', label: t('ctx_rename'), icon: 'rename', disabled: sel.length !== 1 || (entry && entry.kind), shortcut: 'F2' },
      { id: 'delete', label: t('ctx_delete'), icon: 'trash', disabled: !sel.length || sel.some((e) => e.kind), shortcut: 'Del' },
      { sep: true },
      { id: 'cut', label: t('ctx_cut'), icon: 'cut', disabled: !sel.length || sel.some((e) => e.kind), shortcut: 'Ctrl+X' },
      { id: 'copy', label: t('ctx_copy'), icon: 'copy', disabled: !sel.length || sel.some((e) => e.kind), shortcut: 'Ctrl+C' },
      { id: 'paste', label: t('ctx_paste'), icon: 'paste', disabled: !clip && !isTauri, shortcut: 'Ctrl+V' },
      { sep: true },
      { id: 'copyPath', label: t('ctx_copy_path'), icon: 'copy', disabled: !entry },
    ];
    setCtxMenu({ x, y, items, onPick: (id) => {
      if (id === 'cut' || id === 'copy' || id === 'paste') clipboardOp('local', id);
      else if (id === 'upload') upload(sel);
      else if (id === 'refresh') { if (localTree.current) localTree.current.refresh(localDir); }
      else if (id === 'reveal') reveal(entry ? entry.path : localDir);
      else if (id === 'open') call('local.open', { path: entry.path }).catch((err) => showError(t('dlg_error'), err));
      else if (id === 'newFolder') newFolder('local');
      else if (id === 'rename') rename('local', sel[0]);
      else if (id === 'delete') remove('local', sel);
      else if (id === 'copyPath') writeClipboardText(entry.path);
    } });
  };

  // ── Toolbar actions ──
  const setTheme = (id) => {
    const theme = applyTheme(id);
    saveSession({ theme: theme.id, themeBg: theme.tokens['--bg'] });
  };

  const applySettings = (v) => {
    setLanguage(v.language);
    applyFontSize(v.fontSize);
    setSoundsEnabled(v.sounds !== false);
    const theme = applyTheme(v.theme);
    const localPath = String(v.lastLocalPath || '').trim();
    saveSession({ ...v, theme: theme.id, themeBg: theme.tokens['--bg'], lastLocalPath: localPath || undefined });
    if (localPath && localTree.current) {
      setLocalHeadPath(localPath);
      setLocalDir(localPath);
      localTree.current.expandTo(localPath);
    }
    setStatus(t('ready'));
  };

  const action = async (id) => {
    if (id === 'nextTheme') setTheme(nextThemeId(session ? session.theme : DEFAULT_THEME));
    else if (id.startsWith('theme:')) setTheme(id.slice(6));
    else if (id === 'toggleLanguage') { const lang = getLanguage() === 'ko' ? 'en' : 'ko'; setLanguage(lang); saveSession({ language: lang }); setStatus(t('ready')); }
    else if (id === 'settings') {
      const v = await dialogs.settings(session, {
        localDir,
        canPickFolder: !!(info.capabilities && info.capabilities.pickFolder),
      });
      if (v) applySettings(v);
    }
    else if (id === 'about') dialogs.about(info);
    else if (id === 'manual') openManual(getAppearance()).catch((err) => dialogs.error(err));
    else if (id === 'fontDec' || id === 'fontInc') {
      const cur = Math.max(8, Math.min(32, Number(session && session.terminalFontSize) || 13));
      const next = Math.max(8, Math.min(32, cur + (id === 'fontInc' ? 1 : -1)));
      if (next !== cur) {
        applyFontSize(Math.max(11, Math.min(18, next)));
        saveSession({ terminalFontSize: next, fontSize: Math.max(11, Math.min(18, next)) });
      }
    }
    else if (id === 'terminal') {
      if (terminalView) { if (logPanelRef.current && logPanelRef.current.hideTerminal) logPanelRef.current.hideTerminal(); }
      else if (logPanelRef.current && logPanelRef.current.showTerminal) logPanelRef.current.showTerminal();
    }
    else if (id === 'connect') connect();
    else if (id === 'disconnect') disconnect();
    else if (id === 'download') downloadSelected();
    else if (id === 'upload') uploadSelected();
  };

  // ── Splitters ──
  const startVSplit = (e) => {
    e.preventDefault();
    const el = filesRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const move = (ev) => {
      const frac = (ev.clientX - rect.left - 22) / Math.max(1, rect.width - 44);
      setServerWidth(Math.min(0.85, Math.max(0.15, frac)));
    };
    const up = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      setServerWidth((w) => { call('session.save', { patch: { serverWidth: w } }).catch(() => {}); return w; });
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  };

  const startHSplit = (e) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = logHeight;
    const move = (ev) => setLogHeight(Math.min(window.innerHeight * 0.7, Math.max(60, startH - (ev.clientY - startY))));
    const up = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      setLogHeight((h) => { call('session.save', { patch: { logHeight: h } }).catch(() => {}); return h; });
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  };

  // ── Drag & drop wiring (handlers see this render's state) ──
  useEffect(() => {
    setDragHandler({
      hover: (pt, src, keys) => {
        const target = targetAt(pt.x, pt.y);
        const plan = dropPlan(src, target, keys);
        showDropHover(plan ? target : null);
        return plan ? dropLabel(plan, target) : '';
      },
      drop: (pt, src, keys) => {
        const target = targetAt(pt.x, pt.y);
        const plan = dropPlan(src, target, keys);
        showDropHover(null);
        if (plan) transferInto(src, target.side, target.dir, plan.move);
      },
      out: (src, keys) => { showDropHover(null); dragOut(src, keys); },
      end: () => showDropHover(null),
    });
  });

  useEffect(() => onOsDragDrop((ev) => { if (osDropRef.current) osDropRef.current(ev); }), []);

  // The browser would open a file dropped on the page; the web version has no path to it.
  useEffect(() => {
    if (isTauri) return undefined;
    const hasFiles = (e) => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
    const over = (e) => { if (hasFiles(e)) e.preventDefault(); };
    const drop = (e) => { if (hasFiles(e)) { e.preventDefault(); setStatus(t('drop_web_unsupported')); } };
    document.addEventListener('dragover', over);
    document.addEventListener('drop', drop);
    return () => { document.removeEventListener('dragover', over); document.removeEventListener('drop', drop); };
  }, []);

  // ── Smoke-test / automation hook ──
  useEffect(() => {
    window.__mfc = {
      action, call, dialogs,
      connect, disconnect, download, upload, loadServer,
      clipboardOp, paste, transferInto, deleteSelected, dropPlan, osDrop: (ev) => osDropRef.current(ev),
      get state() { return { conn, server, localDir, serverSel: Array.from(serverSel), localSel: Array.from(localSel), log, status, progress, profiles, history, form, clip, dropHover }; },
      setForm, setLocalDir: (p) => localTree.current && localTree.current.expandTo(p),
    };
  });

  if (!session || !info) return <div className="boot">{bootError || t('loading')}</div>;

  const cutSet = clip && clip.move ? new Set(clip.items.map((i) => i.path)) : null;
  const canDownload = !!conn && serverSel.size > 0 && !progress;
  const canUpload = !!conn && localSelEntries.length > 0 && !progress;

  return (
    <div className="app">
      <Toolbar onAction={action} theme={session.theme} connection={conn} busy={connecting}
        profiles={profiles} profileName={profileName} onPickProfile={pickProfile} onSaveProfile={saveProfile} onDeleteProfile={deleteProfiles}
        terminalView={terminalView} fontSize={session.terminalFontSize} />
      <ConnectionBar form={form} onChange={setForm} connected={!!conn} connecting={connecting} onConnect={connect} onDisconnect={disconnect}
        onHistory={(el) => setHistoryMenu(historyMenu ? null : el)} />
      {historyMenu && <ContextMenu anchorEl={historyMenu} x={0} y={0} className="history" items={historyItems()} onClose={() => setHistoryMenu(null)} onPick={(id) => { setHistoryMenu(null); pickHistory(id); }} />}
      <div className="files" ref={filesRef}>
        <div className="panel-slot" style={{ flex: `${serverWidth} 1 0` }}>
          <RemotePanel connected={!!conn} path={server.path} parent={server.parent} entries={server.entries} loading={server.loading} error={server.error}
            selection={serverSel} onSelection={setServerSel} onNavigate={(p) => loadServer(p)} onOpenFile={(e) => download([e])}
            onContextMenu={serverContext} onRefresh={refreshServer} active={active === 'server'} onActivate={() => setActive('server')}
            onDelete={() => deleteSelected('server')} onRename={() => renameSelected('server')} onClipboard={(op) => clipboardOp('server', op)}
            dropOver={!!dropHover && dropHover.side === 'server'} dropRow={dropHover && dropHover.side === 'server' ? dropHover.row : null}
            cutPaths={clip && clip.move && clip.side === 'server' ? cutSet : null} />
        </div>
        <TransferBar onUpload={uploadSelected} onDownload={downloadSelected} canUpload={canUpload} canDownload={canDownload} onResizeStart={startVSplit} />
        <div className="panel-slot" style={{ flex: `${1 - serverWidth} 1 0` }}>
          <LocalTree ref={localTree} selection={localSel} onSelection={onLocalSelection} onCurrentDir={onLocalDir}
            onOpenFile={(e) => upload([e])} onContextMenu={localContext} onError={(err) => showError(t('dlg_error'), err)}
            active={active === 'local'} onActivate={() => setActive('local')}
            onDelete={() => deleteSelected('local')} onRename={() => renameSelected('local')} onClipboard={(op) => clipboardOp('local', op)}
            dropOver={!!dropHover && dropHover.side === 'local'} dropRow={dropHover && dropHover.side === 'local' ? dropHover.row : null}
            cutPaths={clip && clip.move && clip.side === 'local' ? cutSet : null} />
        </div>
      </div>
      <LogPanel ref={logPanelRef} lines={log} height={logHeight} onResizeStart={startHSplit}
        onClear={() => setLog([])}
        onCopy={() => { writeClipboardText(log.map((l) => `[${l.time}]  ${l.text}`).join('\n')); setStatus(t('log_copied')); }}
        localDir={localDir} terminalStartDir={session.terminalStartDir} connection={conn} remotePath={server.path}
        theme={session.theme} fontSize={session.terminalFontSize} fontFamily={session.terminalFont} scrollback={session.terminalMaxLines}
        lastShell={session.lastTerminalShell}
        onLastShell={(id) => saveSession({ lastTerminalShell: id })}
        onEnsureHeight={(h) => setLogHeight((cur) => Math.max(cur, h))}
        onTerminalView={setTerminalView}
        onError={(err) => showError(t('term_failed'), err)} />
      <StatusBar status={status} progress={progress} onCancel={progress && progress.jobId ? cancelCurrent : null} />
      {ctxMenu && <ContextMenu x={ctxMenu.x} y={ctxMenu.y} items={ctxMenu.items} onClose={() => setCtxMenu(null)} onPick={(id) => { setCtxMenu(null); ctxMenu.onPick(id); }} />}
      <DialogHost stack={dialogs.stack} resolve={dialogs.resolve} />
    </div>
  );
}
