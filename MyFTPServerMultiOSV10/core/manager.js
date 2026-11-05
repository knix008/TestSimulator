// Runs the enabled protocol servers together (the original's MainForm
// StartServer / StopServer) and keeps the numbers the UI shows:
//
//   state   { running, startedAt, protocols: [{ proto, port, clients, total }], bind }
//   stats   { clients, totalClients, uploads, uploadBytes, downloads, downloadBytes }
//
// Every change is announced with 'update' → { state, stats } so the Electron
// host can push it, and the web host can hand it out on request.
'use strict';

const fs = require('fs');
const { EventEmitter } = require('events');
const { VirtualFileSystem } = require('./vfs');
const { FtpServer } = require('./ftp-server');
const { SftpServer } = require('./sftp-server');
const { loadCertificate } = require('./x509');
const hostkey = require('./hostkey');
const { render } = require('./messages');

class ServerManager extends EventEmitter {
  constructor({ log, configDir, lang = 'ko' }) {
    super();
    this.log = log;
    this.configDir = configDir;
    this.lang = lang;
    this.servers = [];
    this.running = false;
    this.starting = false;
    this.startedAt = 0;
    this.settingsInUse = null;
    this.resetStats();
    this.notify = throttle(() => this.emit('update', this.snapshot()), 40);
  }

  setLanguage(lang) { this.lang = lang === 'en' ? 'en' : 'ko'; }

  resetStats() {
    this.stats = { clients: 0, totalClients: 0, uploads: 0, uploadBytes: 0, downloads: 0, downloadBytes: 0 };
  }

  snapshot() {
    const protocols = this.servers.map((s) => ({ proto: s.proto, port: s.port, clients: s.clientCount, total: s.totalConnections }));
    this.stats.clients = protocols.reduce((n, p) => n + p.clients, 0);
    this.stats.totalClients = protocols.reduce((n, p) => n + p.total, 0);
    return {
      state: { running: this.running, starting: this.starting, startedAt: this.startedAt, protocols, bind: this.settingsInUse ? this.settingsInUse.bindAddress : '' },
      stats: { ...this.stats },
    };
  }

  // Validation the UI shows as a "설정 오류" dialog before anything listens.
  // Returns { ok: false, message, detail } or { ok: true }.
  validate(s) {
    const t = (k, p) => render(this.lang, k, p);
    if (!s.sharedFolders.length) return { ok: false, code: 'no_shares', message: t('no_shares') };
    const missing = s.sharedFolders.filter((f) => !isDir(f.physicalPath));
    if (missing.length === s.sharedFolders.length) return { ok: false, code: 'no_shares', message: t('no_shares'), detail: missing.map((f) => `/${f.virtualName} → ${f.physicalPath}`).join('\n') };
    const p = s.protocols;
    if (!p.enableFtp && !p.enableFtps && !p.enableSftp) return { ok: false, code: 'no_protocol', message: t('no_protocol') };
    if (p.enableFtps) {
      if (!s.certPath) return { ok: false, code: 'cert_missing', message: t('cert_missing') };
      if (!fs.existsSync(s.certPath)) return { ok: false, code: 'cert_not_found', message: t('cert_not_found', { path: s.certPath }), detail: s.certPath };
    }
    const ports = [p.enableFtp && p.ftpPort, p.enableFtps && p.ftpsPort, p.enableSftp && p.sftpPort].filter(Boolean);
    if (new Set(ports).size !== ports.length) return { ok: false, code: 'port_clash', message: this.lang === 'en' ? 'Two protocols use the same port.' : '두 프로토콜이 같은 포트를 사용합니다.', detail: ports.join(', ') };
    return { ok: true };
  }

  async start(settings) {
    if (this.running || this.starting) return this.snapshot();
    const s = settings;
    const v = this.validate(s);
    if (!v.ok) { const e = new Error(v.message); e.code = v.code; e.detail = v.detail; throw e; }

    this.starting = true;
    this.notify();
    this.log.info('server_starting');
    const vfs = new VirtualFileSystem(s.sharedFolders);
    for (const sk of vfs.skipped) this.log.warn('share_skipped', { name: sk.virtualName, path: sk.physicalPath });
    const auth = { allowAnonymous: s.allowAnonymous, users: s.users };
    const common = { vfs, auth, host: s.bindAddress, log: this.log, lang: this.lang, maxConnections: s.maxConnections };
    const servers = [];
    try {
      let tlsOptions = null;
      if (s.protocols.enableFtps || (s.protocols.enableFtp && s.protocols.explicitTls && s.certPath)) {
        try {
          const loaded = loadCertificate({ certPath: s.certPath, keyPath: s.certKeyPath, password: s.certPassword });
          tlsOptions = loaded.options;
          this.log.info('cert_loaded', { subject: loaded.summary.subject, expires: loaded.summary.expires || '-' });
        } catch (err) {
          // FTPS needs it; plain FTP just loses AUTH TLS.
          if (s.protocols.enableFtps) { const e = new Error(render(this.lang, 'cert_load_failed', { msg: err.message })); e.code = err.code || 'ECERT'; e.detail = `${s.certPath}\n${err.stack || ''}`; throw e; }
          this.log.warn('cert_load_failed', { msg: err.message });
        }
      }
      if (s.protocols.enableFtp) {
        servers.push(new FtpServer({ ...common, proto: 'FTP', port: s.protocols.ftpPort, tls: tlsOptions, implicit: false, explicit: s.protocols.explicitTls, bufferSizeKb: s.bufferSizeKb, pasvPortMin: s.pasvPortMin, pasvPortMax: s.pasvPortMax, pasvAddress: s.pasvAddress }));
      }
      if (s.protocols.enableFtps) {
        servers.push(new FtpServer({ ...common, proto: 'FTPS', port: s.protocols.ftpsPort, tls: tlsOptions, implicit: true, bufferSizeKb: s.bufferSizeKb, pasvPortMin: s.pasvPortMin, pasvPortMax: s.pasvPortMax, pasvAddress: s.pasvAddress }));
      }
      if (s.protocols.enableSftp) {
        const keyPath = hostkey.resolveKeyPath(this.configDir, s.sftpHostKeyPath);
        const existed = fs.existsSync(keyPath);
        const pem = await hostkey.ensureKey(keyPath);
        this.log.info(existed ? 'hostkey_loaded' : 'hostkey_generated', { path: keyPath });
        const info = hostkey.inspectKey(keyPath);
        if (info.fingerprint) this.log.info('hostkey_fingerprint', { fp: info.fingerprint });
        servers.push(new SftpServer({ ...common, port: s.protocols.sftpPort, hostKey: pem }));
      }
      for (const srv of servers) {
        srv.on('clients', () => this.notify());
        srv.on('transfer', (t) => {
          if (t.dir === 'up') { this.stats.uploads++; this.stats.uploadBytes += t.bytes; } else { this.stats.downloads++; this.stats.downloadBytes += t.bytes; }
          this.notify();
        });
        await srv.start();
        this.servers.push(srv);
      }
      this.running = true;
      this.starting = false;
      this.startedAt = Date.now();
      this.settingsInUse = s;
      this.log.ok('server_started', { list: this.servers.map((x) => `${x.proto}:${x.port}`).join(', ') });
      this.notify();
      return this.snapshot();
    } catch (err) {
      this.starting = false;
      for (const srv of this.servers.concat(servers)) { try { await srv.stop(); } catch { /* ignore */ } }
      this.servers = [];
      this.log.error('server_start_failed', { msg: err.message });
      this.notify();
      throw err;
    }
  }

  async stop() {
    if (!this.running && !this.servers.length) return this.snapshot();
    for (const srv of this.servers) { try { await srv.stop(); } catch { /* ignore */ } }
    this.servers = [];
    this.running = false;
    this.starting = false;
    this.startedAt = 0;
    this.settingsInUse = null;
    this.resetStats();
    this.log.info('server_stopped');
    this.notify();
    return this.snapshot();
  }
}

function isDir(p) { try { return fs.statSync(p).isDirectory(); } catch { return false; } }

function throttle(fn, ms) {
  let timer = null;
  let pending = false;
  return () => {
    if (timer) { pending = true; return; }
    fn();
    timer = setTimeout(() => { timer = null; if (pending) { pending = false; fn(); } }, ms);
  };
}

module.exports = { ServerManager };
