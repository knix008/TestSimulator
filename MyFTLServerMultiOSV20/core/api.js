// The one API surface both hosts expose to the UI.
//
//   electron/ipc.js     → ipcMain.handle('api', (e, name, args) => api.call(name, args))
//   server/server.js    → POST /api/<name> with a JSON body
//
// Every method takes one plain-object argument and returns JSON-able data.
// Live updates (log lines, client counts, transfer statistics) are events
// of `api.log` ('line') and `api.manager` ('update'): Electron pushes them
// over IPC, the web UI polls `server.poll` instead.
'use strict';

const os = require('os');
const path = require('path');
const fs = require('fs');
const { Settings, normalize, DEFAULT_PORTS } = require('./settings');
const { Session } = require('./session');
const { Log } = require('./log');
const { ServerManager } = require('./manager');
const x509 = require('./x509');
const hostkey = require('./hostkey');
const local = require('./local');

function createApi(host = {}) {
  const session = new Session(host.configDir);
  session.load();
  const configDir = session.configDir;
  const settings = new Settings(configDir);
  settings.load();
  const log = new Log(path.join(configDir, 'ftpserver.log'));
  log.setLanguage(session.get().language);
  const manager = new ServerManager({ log, configDir, lang: session.get().language });
  log.info('app_ready', { file: log.file });

  const unsupported = (what) => { const e = new Error(`${what} is not available in the web version`); e.code = 'UNSUPPORTED'; throw e; };

  function localAddresses() {
    const out = [];
    for (const [name, list] of Object.entries(os.networkInterfaces())) {
      for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push({ name, address: a.address });
    }
    return out;
  }

  function profileSummary(s) {
    const p = s.protocols;
    const protocols = [p.enableFtp && `FTP:${p.ftpPort}`, p.enableFtps && `FTPS:${p.ftpsPort}`, p.enableSftp && `SFTP:${p.sftpPort}`].filter(Boolean).join(', ');
    return { shares: s.sharedFolders.length, users: s.users.length, anon: require('./messages').render(log.language, s.allowAnonymous ? 'allow' : 'deny'), protocols };
  }

  const methods = {
    // ── app ──
    'app.info': async () => ({
      platform: process.platform,
      hostname: os.hostname(),
      home: os.homedir(),
      sep: path.sep,
      host: host.name || 'node',
      version: host.version || '',
      buildInfo: host.buildInfo || null,
      configDir,
      logFile: log.file,
      defaultHostKeyPath: hostkey.defaultKeyPath(configDir),
      defaultCertPath: path.join(configDir, 'server_cert.pem'),
      defaultPorts: DEFAULT_PORTS,
      addresses: localAddresses(),
      capabilities: {
        pickFolder: !!host.pickFolder, pickFile: !!host.pickFile, saveFile: !!host.saveFile,
        reveal: !!host.revealPath, open: !!host.openPath, clipboard: !!host.clipboard,
      },
    }),
    'app.setLanguage': async ({ lang }) => { log.setLanguage(lang); manager.setLanguage(lang); return { lang: log.language }; },
    'app.addresses': async () => ({ addresses: localAddresses() }),

    // ── settings ──
    'settings.get': async () => settings.get(),
    'settings.save': async ({ settings: s, quiet }) => { const saved = settings.save(s || {}); if (!quiet) log.info('settings_saved'); return saved; },
    'settings.reload': async () => { const s = settings.load(); log.info('settings_loaded'); return s; },
    'settings.validate': async ({ settings: s }) => manager.validate(normalize(s || {})),

    // ── profiles ──
    'profiles.list': async () => ({ profiles: settings.profileNames() }),
    'profiles.save': async ({ name, settings: s }) => {
      const norm = normalize(s || {});
      const profiles = settings.saveProfile(name, norm);
      settings.save(norm);
      log.ok('profile_saved', { name, ...profileSummary(norm) });
      return { profiles, settings: norm };
    },
    'profiles.load': async ({ name }) => {
      const s = settings.loadProfile(name);
      settings.save(s);
      log.ok('profile_loaded', { name, ...profileSummary(s) });
      return s;
    },
    'profiles.delete': async ({ name }) => { const profiles = settings.deleteProfile(name); log.info('profile_deleted', { name }); return { profiles }; },

    // ── server ──
    'server.state': async () => manager.snapshot(),
    'server.start': async ({ settings: s }) => {
      const use = s ? settings.save(s) : settings.get();
      return manager.start(use);
    },
    'server.stop': async () => manager.stop(),
    // Web polling: everything since `seq` plus the current state.
    'server.poll': async ({ seq }) => ({ ...manager.snapshot(), lines: log.after(Number(seq) || 0), seq: log.seq }),

    // ── log ──
    'log.lines': async ({ seq }) => ({ lines: log.after(Number(seq) || 0), seq: log.seq }),
    'log.clear': async () => { log.clear(); return { ok: true }; },
    'log.text': async () => ({ text: log.text(), file: log.file }),
    'log.save': async ({ path: p }) => {
      if (!p) throw Object.assign(new Error('Path required'), { code: 'EINVAL' });
      fs.writeFileSync(p, log.text() + '\n', 'utf-8');
      log.info('log_saved', { path: p });
      return { path: p };
    },

    // ── FTPS certificate ──
    'cert.generate': async ({ commonName, validityYears, path: certFile, bits }) => {
      const file = String(certFile || '').trim() || path.join(configDir, 'server_cert.pem');
      const r = x509.writeSelfSigned(file, { commonName: commonName || os.hostname(), validityYears, bits });
      log.ok('cert_generated', { path: r.certPath });
      return r;
    },
    'cert.inspect': async ({ path: p }) => x509.inspectCertificate(String(p || '')),

    // ── SFTP host key ──
    'hostkey.info': async ({ path: p }) => { const file = hostkey.resolveKeyPath(configDir, p); return { path: file, ...hostkey.inspectKey(file) }; },
    'hostkey.generate': async ({ path: p, bits }) => {
      const file = hostkey.resolveKeyPath(configDir, p);
      await hostkey.generateKey(file, bits);
      log.ok('hostkey_generated', { path: file });
      return { path: file, ...hostkey.inspectKey(file) };
    },

    // ── local file system (folder / file picker of the web UI) ──
    'local.roots': async () => ({ roots: await local.listRoots() }),
    'local.list': async ({ path: p, filesToo, extensions }) => local.listDirectory(p, { filesToo: !!filesToo, extensions: extensions || null }),
    'local.mkdir': async ({ dir, name }) => ({ path: await local.makeDirectory(dir, name) }),
    'local.stat': async ({ path: p }) => local.statPath(String(p || '')),

    // ── host-native (desktop only) ──
    'host.pickFolder': async ({ title, defaultPath }) => (host.pickFolder ? { path: await host.pickFolder({ title, defaultPath }) } : unsupported('Folder dialog')),
    'host.pickFile': async ({ title, defaultPath, filters }) => (host.pickFile ? { path: await host.pickFile({ title, defaultPath, filters }) } : unsupported('File dialog')),
    'host.saveFile': async ({ title, defaultPath, filters }) => (host.saveFile ? { path: await host.saveFile({ title, defaultPath, filters }) } : unsupported('Save dialog')),
    'host.reveal': async ({ path: p }) => { if (!host.revealPath) unsupported('File manager'); await host.revealPath(p); return { ok: true }; },
    'host.open': async ({ path: p }) => { if (!host.openPath) unsupported('Open'); const r = await host.openPath(p); if (r) throw new Error(r); return { ok: true }; },
    'clipboard.write': async ({ text }) => { if (host.clipboard) host.clipboard.writeText(text || ''); return { ok: true }; },

    // ── session (UI preferences) ──
    'session.load': async () => session.get(),
    'session.save': async ({ patch }) => session.save(patch),
  };

  async function call(name, args) {
    const fn = methods[name];
    if (!fn) throw new Error(`Unknown API method: ${name}`);
    return fn(args || {});
  }

  async function shutdown() {
    try { await manager.stop(); } catch { /* ignore */ }
    log.flush();
  }

  return { call, log, manager, settings, session, configDir, shutdown, methods: Object.keys(methods) };
}

// Turns an Error into the { code, message, … } shape the UI shows.
function serializeError(err) {
  if (!err) return { code: 'UNKNOWN', message: 'Unknown error' };
  return {
    code: err.code || 'ERROR',
    message: err.message || String(err),
    path: err.path || undefined,
    detail: err.detail || undefined,
    stack: err.stack || undefined,
  };
}

module.exports = { createApi, serializeError };
