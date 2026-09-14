// My FTP Server — application shell.
//
// Layout (top to bottom): toolbar · control bar (start/stop, protocols,
// counters) · [ shares + security | users + network ] · log · status bar.
// The settings shown in the panels are a draft that is saved to the config
// file shortly after every change; ▶ 시작 sends them to the server manager.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { call, subscribe, writeClipboardText, downloadText, isElectron } from './lib/backend';
import { t, setLanguage, getLanguage, useLanguage } from './lib/i18n';
import { fileStamp, timeStamp, baseName, dirName } from './lib/format';
import { playSuccess, playError, setSoundsEnabled } from './lib/sound';
import { SETTINGS_DEFAULTS } from './lib/settings';
import { applyTheme, themeById, nextThemeId, DEFAULT_THEME } from './themes';
import { Toolbar } from './components/Toolbar';
import { ControlBar } from './components/ControlBar';
import { SharesPanel } from './components/SharesPanel';
import { SecurityPanel } from './components/SecurityPanel';
import { UsersPanel } from './components/UsersPanel';
import { NetworkPanel } from './components/NetworkPanel';
import { LogPanel } from './components/LogPanel';
import { StatusBar } from './components/StatusBar';
import { DialogHost, useDialogs } from './dialogs/Dialogs';

const MAX_LOG = 3000;
const EMPTY_STATS = { clients: 0, totalClients: 0, uploads: 0, uploadBytes: 0, downloads: 0, downloadBytes: 0 };

function applyFontSize(px) {
  document.documentElement.style.setProperty('--fs', `${Math.max(9, Number(px) || 13)}px`);
}

export default function App() {
  useLanguage();
  const dialogs = useDialogs();
  const [info, setInfo] = useState(null);
  const [session, setSession] = useState(null);
  const [settings, setSettings] = useState(null);
  const [profiles, setProfiles] = useState([]);
  const [profileName, setProfileName] = useState('');
  const [server, setServer] = useState({ running: false, starting: false, startedAt: 0, protocols: [] });
  const [stats, setStats] = useState(EMPTY_STATS);
  const [log, setLog] = useState([]);
  const [showTrace, setShowTrace] = useState(true);
  const [certInfo, setCertInfo] = useState(null);
  const [hostKey, setHostKey] = useState(null);
  const [missing, setMissing] = useState(new Set());
  const [status, setStatus] = useState('');
  const [logHeight, setLogHeight] = useState(190);
  const saveTimer = useRef(null);
  const settingsRef = useRef(null);
  settingsRef.current = settings;
  const serverRef = useRef(server);
  serverRef.current = server;
  const statsRef = useRef(stats);
  statsRef.current = stats;

  const locked = server.running || server.starting;
  const errMsg = (err) => (err && err.message) || String(err);

  const showError = useCallback((title, err, extra) => { playError(); return dialogs.error(err, extra, title); }, [dialogs]);

  // ── Boot ──
  useEffect(() => {
    let unsub = null;
    (async () => {
      const i = await call('app.info');
      setInfo(i);
      const s = { ...SETTINGS_DEFAULTS, ...(await call('session.load')) };
      setLanguage(s.language || 'ko');
      applyFontSize(s.fontSize);
      setSoundsEnabled(s.sounds !== false);
      const theme = applyTheme(s.theme || DEFAULT_THEME);
      s.theme = theme.id;
      if (s.themeBg !== theme.tokens['--bg']) call('session.save', { patch: { theme: theme.id, themeBg: theme.tokens['--bg'] } }).catch(() => {});
      setLogHeight(Number(s.logHeight) >= 80 ? Number(s.logHeight) : 190);
      setSession(s);
      setSettings(await call('settings.get'));
      setProfiles((await call('profiles.list')).profiles);
      if (s.lastProfile) setProfileName(s.lastProfile);
      const snap = await call('server.state');
      setServer(snap.state); setStats(snap.stats);
      const first = await call('log.lines', { seq: 0 });
      setLog(first.lines);
      unsub = subscribe({
        onLog: (line) => setLog((l) => { if (l.length && l[l.length - 1].seq >= line.seq) return l; const next = [...l, line]; return next.length > MAX_LOG ? next.slice(next.length - MAX_LOG) : next; }),
        onUpdate: (u) => { setServer(u.state); setStats(u.stats); },
      }, first.seq);
      setStatus(snap.state.running ? t('status_running', { list: snap.state.protocols.map((p) => `${p.proto}:${p.port}`).join(', ') }) : t('status_ready'));
    })().catch((err) => { setStatus(errMsg(err)); });
    return () => { if (unsub) unsub(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { document.title = t('appName'); }, [session && session.language]); // eslint-disable-line react-hooks/exhaustive-deps

  // Status line follows the server state.
  useEffect(() => {
    if (!info) return;
    if (server.starting) setStatus(t('status_starting'));
    else if (server.running) setStatus(t('status_running', { list: server.protocols.map((p) => `${p.proto}:${p.port}`).join(', ') }));
    // The host key may have been created by the start.
    if (server.running && settingsRef.current) call('hostkey.info', { path: settingsRef.current.sftpHostKeyPath }).then(setHostKey).catch(() => {});
  }, [server.running, server.starting, server.protocols.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Certificate summary + host key info + missing folders follow the draft.
  useEffect(() => {
    if (!settings) return undefined;
    const id = setTimeout(async () => {
      if (settings.certPath) call('cert.inspect', { path: settings.certPath }).then(setCertInfo).catch(() => setCertInfo(null));
      else setCertInfo(null);
      call('hostkey.info', { path: settings.sftpHostKeyPath }).then(setHostKey).catch(() => setHostKey(null));
      const miss = new Set();
      await Promise.all(settings.sharedFolders.map(async (f, i) => { try { const st = await call('local.stat', { path: f.physicalPath }); if (!st.exists || !st.isDir) miss.add(i); } catch { miss.add(i); } }));
      setMissing(miss);
    }, 250);
    return () => clearTimeout(id);
  }, [settings]);

  const saveSession = useCallback((patch) => {
    setSession((s) => (s ? { ...s, ...patch } : s));
    call('session.save', { patch }).catch(() => {});
  }, []);

  // Draft → config file, 500 ms after the last change.
  const updateSettings = useCallback((patch) => {
    setSettings((s) => {
      const next = { ...s, ...patch };
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => { call('settings.save', { settings: next, quiet: true }).catch(() => {}); }, 500);
      return next;
    });
  }, []);

  const flushSettings = async () => {
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
    return call('settings.save', { settings: settingsRef.current, quiet: true });
  };

  // ── Keyboard: F5 save · F6 reload (the original's shortcuts) ──
  useEffect(() => {
    const onKey = async (e) => {
      if (e.key === 'F5') { e.preventDefault(); try { await call('settings.save', { settings: settingsRef.current }); } catch (err) { showError(t('dlg_error'), err); } }
      else if (e.key === 'F6') { e.preventDefault(); try { setSettings(await call('settings.reload')); } catch (err) { showError(t('dlg_error'), err); } }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showError]);

  // ── Pickers: OS dialogs on the desktop, the server-side browser on the web ──
  const pickFolder = async (start) => {
    if (info && info.capabilities.pickFolder) return (await call('host.pickFolder', { title: t('dlg_pick_folder'), defaultPath: start || undefined })).path;
    return dialogs.path({ mode: 'folder', start: start || info.home });
  };
  const pickFile = async (start, extensions, name) => {
    if (info && info.capabilities.pickFile) {
      const filters = [{ name, extensions: extensions.map((x) => x.replace(/^\./, '')) }, { name: '*', extensions: ['*'] }];
      return (await call('host.pickFile', { title: t('dlg_pick_file'), defaultPath: start || undefined, filters })).path;
    }
    return dialogs.path({ mode: 'file', start: start ? dirName(start) : info.configDir, extensions });
  };
  const pickSave = async (defaultPath, extensions, name) => {
    if (info && info.capabilities.saveFile) {
      const filters = [{ name, extensions: extensions.map((x) => x.replace(/^\./, '')) }, { name: '*', extensions: ['*'] }];
      return (await call('host.saveFile', { defaultPath, filters })).path;
    }
    return dialogs.path({ mode: 'save', start: dirName(defaultPath) || info.configDir, defaultName: baseName(defaultPath) });
  };
  const checkFolder = async (p) => { try { const st = await call('local.stat', { path: p }); return st.exists && st.isDir; } catch { return false; } };

  // ── Server ──
  const startDetails = (s) => {
    const p = s.protocols;
    const protocols = [p.enableFtp && `FTP  : ${p.ftpPort}${p.explicitTls && s.certPath ? ' (+AUTH TLS)' : ''}`, p.enableFtps && `FTPS : ${p.ftpsPort}, ${s.certPath}`, p.enableSftp && `SFTP : ${p.sftpPort}, ${s.sftpHostKeyPath || (info && info.defaultHostKeyPath) || ''}`].filter(Boolean).join('\n');
    return t('start_details', { protocols, anon: s.allowAnonymous ? t('yes') : t('no'), users: s.users.length, shares: s.sharedFolders.map((f) => `  /${f.virtualName} → ${f.physicalPath}`).join('\n') || '  -' });
  };

  const start = async () => {
    const s = settingsRef.current;
    try {
      await flushSettings();
      const v = await call('settings.validate', { settings: s });
      if (!v.ok) { playError(); await dialogs.message({ kind: 'error', title: t('dlg_settings_error'), message: v.message, detail: v.detail || '' }); return; }
      const snap = await call('server.start', { settings: s });
      setServer(snap.state); setStats(snap.stats);
      playSuccess();
    } catch (err) {
      setStatus(t('status_start_failed'));
      showError(t('dlg_start_error'), err, startDetails(s));
      call('server.state').then((snap) => { setServer(snap.state); setStats(snap.stats); }).catch(() => {});
    }
  };

  const stop = async () => {
    if (session && session.confirmStop !== false && statsRef.current.clients > 0) {
      const ok = await dialogs.confirm({ title: t('dlg_stop_confirm'), message: t('stop_confirm_msg', { n: statsRef.current.clients }), danger: true, icon: 'stop' });
      if (!ok) return;
    }
    try {
      const snap = await call('server.stop');
      setServer(snap.state); setStats(snap.stats);
      setStatus(t('status_stopped'));
    } catch (err) { showError(t('dlg_error'), err); }
  };

  // ── Shares ──
  const addShare = async () => {
    const r = await dialogs.share({ existing: settings.sharedFolders.map((f) => f.virtualName), pickFolder, checkFolder });
    if (r) updateSettings({ sharedFolders: [...settings.sharedFolders, r] });
  };
  const editShare = async (i) => {
    const cur = settings.sharedFolders[i];
    const r = await dialogs.share({ share: cur, existing: settings.sharedFolders.filter((_, k) => k !== i).map((f) => f.virtualName), pickFolder, checkFolder });
    if (r) updateSettings({ sharedFolders: settings.sharedFolders.map((f, k) => (k === i ? r : f)) });
  };
  const removeShare = async (i) => {
    const cur = settings.sharedFolders[i];
    if (!cur) return;
    const ok = await dialogs.confirm({ title: t('dlg_share_remove'), message: t('share_remove_msg', { name: cur.virtualName }), danger: true, icon: 'trash' });
    if (ok) updateSettings({ sharedFolders: settings.sharedFolders.filter((_, k) => k !== i) });
  };
  const reveal = async (p) => {
    try { await call('host.reveal', { path: p }); } catch (err) { dialogs.message({ kind: 'info', title: t('notice'), message: t('reveal_web', { path: p }) }); void err; }
  };

  // ── Users ──
  const addUser = async () => {
    const r = await dialogs.user({ existing: settings.users.map((u) => u.username) });
    if (r) updateSettings({ users: [...settings.users, r] });
  };
  const editUser = async (i) => {
    const r = await dialogs.user({ user: settings.users[i], existing: settings.users.map((u) => u.username) });
    if (r) updateSettings({ users: settings.users.map((u, k) => (k === i ? r : u)) });
  };
  const removeUser = async (i) => {
    const cur = settings.users[i];
    if (!cur) return;
    const ok = await dialogs.confirm({ title: t('dlg_user_remove'), message: t('user_remove_msg', { name: cur.username }), danger: true, icon: 'trash' });
    if (ok) updateSettings({ users: settings.users.filter((_, k) => k !== i) });
  };

  // ── Certificate / host key ──
  const generateCert = async () => {
    const r = await dialogs.cert({ hostname: info.hostname, defaultPath: settings.certPath && /\.(pem|crt)$/i.test(settings.certPath) ? settings.certPath : info.defaultCertPath, pickSavePath: (cur) => pickSave(cur || info.defaultCertPath, ['.pem'], 'PEM') });
    if (!r) return;
    try {
      const g = await call('cert.generate', r);
      updateSettings({ certPath: g.certPath, certKeyPath: '' });
      playSuccess();
      dialogs.message({ kind: 'info', title: t('dlg_cert_gen'), message: t('cert_done', { cert: g.certPath, key: g.keyPath, years: r.validityYears, fp: g.fingerprint }) });
    } catch (err) { showError(t('dlg_error'), err, `CN: ${r.commonName}\n${r.path}`); }
  };
  const generateHostKey = async () => {
    const path = settings.sftpHostKeyPath || (hostKey && hostKey.path) || info.defaultHostKeyPath;
    if (hostKey && hostKey.exists && !hostKey.error) {
      const ok = await dialogs.confirm({ title: t('dlg_hostkey_overwrite'), message: t('hostkey_overwrite_msg'), danger: true, icon: 'key' });
      if (!ok) return;
    }
    try {
      const r = await call('hostkey.generate', { path });
      setHostKey(r);
      playSuccess();
      dialogs.message({ kind: 'info', title: t('dlg_hostkey_overwrite'), message: t('hostkey_done', { path: r.path, fp: r.fingerprint }) });
    } catch (err) { showError(t('dlg_error'), err, path); }
  };
  const openKeyFolder = () => reveal(dirName((hostKey && hostKey.path) || info.defaultHostKeyPath));

  // ── Log ──
  const logText = () => log.filter((l) => showTrace || l.level !== 'trace').map((l) => `[${timeStamp(l.time)}] ${l.text}`).join('\n');
  const copyLog = async () => { await writeClipboardText(logText()); setStatus(t('log_copied')); };
  const saveLog = async () => {
    if (!log.length) { dialogs.message({ kind: 'info', title: t('log_save'), message: t('log_empty') }); return; }
    const name = `MyFTPServer_${fileStamp()}.log`;
    if (isElectron) {
      try {
        const p = await pickSave(`${info.home}${info.sep}${name}`, ['.log', '.txt'], 'Log');
        if (!p) return;
        await call('log.save', { path: p });
        setStatus(t('log_saved', { path: p }));
      } catch (err) { showError(t('dlg_error'), err); }
    } else {
      downloadText(name, logText());
      setStatus(t('log_saved', { path: name }));
    }
  };

  // ── Profiles ──
  const applyLoaded = (s, name) => { setSettings(s); setProfileName(name); saveSession({ lastProfile: name }); };
  const pickProfile = async (name) => {
    if (!name) { setProfileName(''); saveSession({ lastProfile: '' }); return; }
    try { applyLoaded(await call('profiles.load', { name }), name); } catch (err) { showError(t('dlg_error'), err); }
  };
  const saveProfile = async () => {
    const name = await dialogs.prompt({ title: t('dlg_profile_save'), label: t('lbl_profile_name'), value: profileName || '', icon: 'save' });
    if (!name) return;
    try {
      await flushSettings();
      const r = await call('profiles.save', { name, settings: settingsRef.current });
      setProfiles(r.profiles);
      applyLoaded(r.settings, name);
    } catch (err) { showError(t('dlg_error'), err); }
  };
  const deleteProfile = async () => {
    if (!profileName) return;
    const ok = await dialogs.confirm({ title: t('dlg_profile_delete'), message: t('profile_delete_msg', { name: profileName }), danger: true, icon: 'trash' });
    if (!ok) return;
    try {
      const r = await call('profiles.delete', { name: profileName });
      setProfiles(r.profiles);
      setProfileName(''); saveSession({ lastProfile: '' });
    } catch (err) { showError(t('dlg_error'), err); }
  };

  // ── Toolbar actions ──
  const setTheme = (id) => { const theme = applyTheme(id); saveSession({ theme: theme.id, themeBg: theme.tokens['--bg'] }); };
  const applyAppSettings = (v) => {
    setLanguage(v.language);
    call('app.setLanguage', { lang: v.language }).catch(() => {});
    applyFontSize(v.fontSize);
    setSoundsEnabled(v.sounds !== false);
    const theme = applyTheme(v.theme);
    saveSession({ ...v, theme: theme.id, themeBg: theme.tokens['--bg'] });
  };
  const action = async (id) => {
    if (id === 'nextTheme') setTheme(nextThemeId(session ? session.theme : DEFAULT_THEME));
    else if (id.startsWith('theme:')) setTheme(id.slice(6));
    else if (id === 'toggleLanguage') { const lang = getLanguage() === 'ko' ? 'en' : 'ko'; setLanguage(lang); call('app.setLanguage', { lang }).catch(() => {}); saveSession({ language: lang }); }
    else if (id === 'settings') { const v = await dialogs.settings(session); if (v) applyAppSettings(v); }
    else if (id === 'about') dialogs.about(info);
    else if (id === 'start') start();
    else if (id === 'stop') stop();
  };

  // ── Log splitter ──
  const startHSplit = (e) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = logHeight;
    const move = (ev) => setLogHeight(Math.min(window.innerHeight * 0.7, Math.max(80, startH - (ev.clientY - startY))));
    const up = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      setLogHeight((h) => { call('session.save', { patch: { logHeight: h } }).catch(() => {}); return h; });
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  };

  // ── Smoke-test / automation hook ──
  useEffect(() => {
    window.__mfs = {
      action, call, dialogs, start, stop, updateSettings, addShare, addUser, generateCert, generateHostKey,
      get state() { return { info, session, settings, profiles, profileName, server, stats, log, status, certInfo, hostKey }; },
    };
  });

  if (!session || !info || !settings) return <div className="boot">{t('loading')}</div>;

  return (
    <div className="app">
      <Toolbar onAction={action} theme={session.theme} running={server.running} starting={server.starting} busy={locked}
        profiles={profiles} profileName={profileName} onPickProfile={pickProfile} onSaveProfile={saveProfile} onDeleteProfile={deleteProfile} />
      <ControlBar settings={settings} onChange={updateSettings} running={server.running} starting={server.starting} locked={locked}
        stats={stats} state={server} onStart={start} onStop={stop} />
      {locked && <div className="locked-hint muted small" title={t('locked_hint')}>{t('locked_hint')}</div>}
      <div className="main">
        <div className="column">
          <SharesPanel shares={settings.sharedFolders} missing={missing} locked={locked} onAdd={addShare} onEdit={editShare} onRemove={removeShare}
            onReveal={reveal} canReveal={!!info.capabilities.reveal} />
          <SecurityPanel settings={settings} onChange={updateSettings} locked={locked} certInfo={certInfo} hostKey={hostKey}
            onPickCert={async () => { const p = await pickFile(settings.certPath, ['.pem', '.crt', '.cer', '.pfx', '.p12'], 'Certificate'); if (p) updateSettings({ certPath: p }); }}
            onPickKey={async () => { const p = await pickFile(settings.certKeyPath || settings.certPath, ['.pem', '.key'], 'Private key'); if (p) updateSettings({ certKeyPath: p }); }}
            onGenerateCert={generateCert} onGenerateHostKey={generateHostKey} onOpenKeyFolder={openKeyFolder}
            onCopyFingerprint={() => { if (hostKey && hostKey.fingerprint) { writeClipboardText(hostKey.fingerprint); setStatus(t('copied')); } }} />
        </div>
        <div className="column">
          <UsersPanel settings={settings} onChange={updateSettings} locked={locked} onAdd={addUser} onEdit={editUser} onRemove={removeUser} />
          <NetworkPanel settings={settings} onChange={updateSettings} locked={locked} addresses={info.addresses || []} onCopy={(u) => writeClipboardText(u)} />
        </div>
      </div>
      <LogPanel lines={log} showTrace={showTrace} onToggleTrace={setShowTrace} height={logHeight} onResizeStart={startHSplit} logFile={info.logFile}
        onClear={() => { setLog([]); call('log.clear').catch(() => {}); }} onCopy={copyLog} onSave={saveLog} />
      <StatusBar status={status} startedAt={server.running ? server.startedAt : 0} hostLabel={isElectron ? '' : t('host_web')} />
      <DialogHost stack={dialogs.stack} resolve={dialogs.resolve} />
    </div>
  );
}
