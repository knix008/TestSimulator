// FTP / FTPS server on node:net + node:tls — a port of the original's
// FtpServerManager / FtpSession, one class for both protocols:
//
//   proto 'FTP'   plain control connection; with a certificate, AUTH TLS
//                 (explicit FTPS, RFC 4217) upgrades it and PROT P encrypts
//                 the data connections
//   proto 'FTPS'  implicit TLS — the socket is TLS from the first byte
//                 (the original's port-990 mode)
//
// Commands: USER PASS SYST FEAT OPTS TYPE MODE STRU NOOP QUIT PWD CWD CDUP
//   PASV EPSV PORT EPRT LIST NLST MLSD MLST RETR STOR APPE REST SIZE MDTM
//   DELE MKD RMD RNFR RNTO ABOR STAT HELP ALLO AUTH PBSZ PROT
// Paths are virtual (core/vfs.js); read/write rights come from core/auth.js.
'use strict';

const net = require('net');
const tls = require('tls');
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const { pipeline, Transform } = require('stream');
const { normalizePath, posixJoin, posixParent } = require('./vfs');
const { authenticate, permissionSummary } = require('./auth');
const { render } = require('./messages');

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const IDLE_TIMEOUT = 10 * 60 * 1000;
const DATA_TIMEOUT = 15 * 1000;

const p2 = (n) => String(n).padStart(2, '0');
function listTime(ms) {
  const d = new Date(ms);
  const old = Date.now() - ms > 180 * 24 * 3600 * 1000;
  return `${MONTHS[d.getMonth()]} ${p2(d.getDate())} ${old ? ` ${d.getFullYear()}` : `${p2(d.getHours())}:${p2(d.getMinutes())}`}`;
}
function mlsdTime(ms) {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}${p2(d.getUTCMonth() + 1)}${p2(d.getUTCDate())}${p2(d.getUTCHours())}${p2(d.getUTCMinutes())}${p2(d.getUTCSeconds())}`;
}
function listLine(e) {
  return `${e.isDir ? 'drwxr-xr-x' : '-rw-r--r--'} 1 ftp ftp ${String(e.size).padStart(12)} ${listTime(e.mtime)} ${e.name}`;
}
function mlsxLine(e) {
  return e.isDir ? `type=dir;modify=${mlsdTime(e.mtime)};perm=el; ${e.name}` : `type=file;size=${e.size};modify=${mlsdTime(e.mtime)};perm=r; ${e.name}`;
}
function formatBytes(n) {
  if (n >= 1 << 30) return `${(n / (1 << 30)).toFixed(2)} GB`;
  if (n >= 1 << 20) return `${(n / (1 << 20)).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
}
function unquote(s) {
  s = String(s || '').trim();
  return s.length >= 2 && s.startsWith('"') && s.endsWith('"') ? s.slice(1, -1).trim() : s;
}
function stripListOptions(arg) {
  arg = String(arg || '').trim();
  while (arg.startsWith('-')) { const sp = arg.indexOf(' '); if (sp < 0) return ''; arg = arg.slice(sp + 1).trim(); }
  return arg;
}
function peerOf(sock) {
  const a = (sock.remoteAddress || '').replace(/^::ffff:/, '');
  return `${a}:${sock.remotePort || 0}`;
}
function counter(onBytes) {
  return new Transform({ transform(chunk, _enc, cb) { onBytes(chunk.length); cb(null, chunk); } });
}

class FtpServer extends EventEmitter {
  constructor(opts) {
    super();
    this.proto = opts.proto || 'FTP';
    this.port = opts.port;
    this.host = opts.host || '';
    this.vfs = opts.vfs;
    this.auth = opts.auth || { allowAnonymous: false, users: [] };
    // tls: { cert, key, passphrase } | { pfx, passphrase } — the raw options
    // (tls.createServer builds its own context from them) and a shared
    // SecureContext for AUTH TLS upgrades and PROT P data connections.
    this.tlsOptions = opts.tls || null;
    this.secureContext = this.tlsOptions ? tls.createSecureContext(this.tlsOptions) : null;
    this.implicit = !!opts.implicit;
    this.explicit = !!opts.explicit && !!this.secureContext && !this.implicit;
    this.bufferSize = Math.max(4, Number(opts.bufferSizeKb) || 64) * 1024;
    this.maxConnections = Number(opts.maxConnections) || 0;
    this.pasvRange = [Number(opts.pasvPortMin) || 0, Number(opts.pasvPortMax) || 0];
    this.pasvAddress = String(opts.pasvAddress || '').trim();
    this.log = opts.log;
    this.lang = opts.lang || 'ko';
    this.sessions = new Set();
    this.server = null;
    this.totalConnections = 0;
  }

  get clientCount() { return this.sessions.size; }

  start() {
    return new Promise((resolve, reject) => {
      const onConn = (sock) => this.accept(sock);
      this.server = this.implicit
        ? tls.createServer({ ...this.tlsOptions }, onConn)
        : net.createServer(onConn);
      if (this.implicit) this.server.on('tlsClientError', (err, sock) => { this.log.warn('tls_error', { proto: this.proto, peer: peerOf(sock), msg: err.message }); });
      this.server.on('error', (err) => {
        const e = new Error(this.listenMessage(err));
        e.code = err.code; e.port = this.port;
        this.server = null;
        reject(e);
      });
      this.server.listen({ port: this.port, host: this.host || undefined }, () => {
        this.port = this.server.address().port;
        this.log.ok('ftp_started', { proto: this.proto, port: this.port, mounts: this.vfs.virtualNames.join(', ') });
        if (this.explicit) this.log.info('ftp_explicit', { proto: this.proto, cert: 'OK' });
        this.server.on('error', (err) => this.log.error('listen_error', { proto: this.proto, port: this.port, msg: err.message }));
        resolve();
      });
    });
  }

  listenMessage(err) {
    const params = { proto: this.proto, port: this.port, msg: err.message };
    if (err.code === 'EADDRINUSE') return render(this.lang, 'listen_in_use', params);
    if (err.code === 'EACCES') return render(this.lang, 'listen_denied', params);
    return render(this.lang, 'listen_error', params);
  }

  stop() {
    return new Promise((resolve) => {
      const server = this.server;
      this.server = null;
      for (const s of Array.from(this.sessions)) s.close();
      if (!server) return resolve();
      server.close(() => { this.log.info('ftp_stopped', { proto: this.proto }); resolve(); });
      setTimeout(resolve, 1500).unref();
    });
  }

  accept(sock) {
    const peer = peerOf(sock);
    if (this.maxConnections > 0 && this.sessions.size >= this.maxConnections) {
      this.log.warn('client_limit', { proto: this.proto, max: this.maxConnections, peer });
      sock.write('421 Too many connections, try again later\r\n');
      sock.end();
      return;
    }
    const session = new FtpSession(this, sock, peer);
    this.sessions.add(session);
    this.totalConnections++;
    this.emit('clients', this.sessions.size);
    this.log.info('client_connected', { proto: this.proto, peer });
    session.once('closed', () => {
      this.sessions.delete(session);
      this.emit('clients', this.sessions.size);
      this.log.info('client_closed', { proto: this.proto, peer });
    });
  }
}

// ── one control connection ──
class FtpSession extends EventEmitter {
  constructor(server, sock, peer) {
    super();
    this.server = server;
    this.peer = peer;
    this.vfs = server.vfs;
    this.log = server.log;
    this.cwd = '/';
    this.perm = null;         // permissions after PASS
    this.pendingUser = null;
    this.secure = server.implicit;
    this.prot = server.implicit ? 'P' : 'C';
    this.pasv = null;         // { server, promise }
    this.port = null;         // { host, port } for active mode
    this.restOffset = 0;
    this.renameFrom = null;
    this.buf = '';
    this.closed = false;
    this.busy = Promise.resolve();
    this.attach(sock);
    this.reply(220, 'My FTP Server ready');
  }

  get user() { return this.perm ? this.perm.user : '-'; }

  attach(sock) {
    this.sock = sock;
    sock.setEncoding('utf8');
    sock.setTimeout(IDLE_TIMEOUT);
    sock.on('timeout', () => { this.reply(421, 'Idle timeout, closing control connection'); this.close(); });
    sock.on('data', (d) => this.onData(d));
    sock.on('error', (err) => { if (!this.closed) this.log.warn('client_error', { proto: this.server.proto, peer: this.peer, msg: err.message }); });
    sock.on('close', () => this.close());
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.closePasv();
    try { this.sock.destroy(); } catch { /* ignore */ }
    this.emit('closed');
  }

  reply(code, text) {
    if (this.closed || this.sock.destroyed) return;
    this.log.trace(`${this.server.proto} ${this.peer} < ${code} ${text}`);
    this.sock.write(`${code} ${text}\r\n`);
  }

  replyLines(code, lines, last) {
    if (this.closed || this.sock.destroyed) return;
    this.sock.write(`${code}-${lines[0]}\r\n${lines.slice(1).map((l) => ` ${l}\r\n`).join('')}${code} ${last}\r\n`);
  }

  onData(d) {
    this.buf += d;
    let i;
    while ((i = this.buf.indexOf('\n')) >= 0) {
      const line = this.buf.slice(0, i).replace(/\r$/, '');
      this.buf = this.buf.slice(i + 1);
      // Commands run one after another; a transfer in progress delays the next.
      this.busy = this.busy.then(() => this.command(line)).catch((err) => { this.reply(550, err.message || 'Failed'); });
    }
  }

  // ── paths ──
  absolute(arg) {
    arg = unquote(arg).replace(/\\/g, '/');
    if (!arg || arg === '.') return this.cwd;
    return arg.startsWith('/') ? normalizePath(arg) : normalizePath(`${this.cwd}/${arg}`);
  }

  physical(arg) { return this.vfs.resolve(this.absolute(arg)); }

  needRead(what) {
    if (this.perm && this.perm.canRead) return true;
    this.log.warn('denied_read', { path: what, user: this.user });
    this.reply(550, 'Permission denied (read not allowed)');
    return false;
  }

  needWrite(what) {
    if (this.perm && this.perm.canWrite) return true;
    this.log.warn('denied_write', { path: what, user: this.user });
    this.reply(550, 'Permission denied (write not allowed)');
    return false;
  }

  // ── data connections ──
  closePasv() {
    if (this.pasv) { try { this.pasv.server.close(); } catch { /* ignore */ } this.pasv = null; }
  }

  pickPasvPort() {
    const [min, max] = this.server.pasvRange;
    if (!min || !max || max < min) return 0;
    return min + Math.floor(Math.random() * (max - min + 1));
  }

  async openPasv() {
    this.closePasv();
    this.port = null;
    const srv = net.createServer();
    srv.maxConnections = 1;
    let port = 0;
    for (let attempt = 0; attempt < 20; attempt++) {
      port = this.pickPasvPort();
      try {
        await new Promise((resolve, reject) => {
          srv.once('error', reject);
          srv.listen({ port, host: this.server.host || undefined }, () => { srv.removeListener('error', reject); resolve(); });
        });
        break;
      } catch (err) {
        if (err.code !== 'EADDRINUSE' || port === 0) throw err;
      }
    }
    const promise = new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(Object.assign(new Error('Data connection timeout'), { code: 'ETIMEDOUT' })), DATA_TIMEOUT);
      srv.once('connection', (s) => { clearTimeout(t); resolve(s); });
      srv.once('close', () => { clearTimeout(t); reject(new Error('Passive listener closed')); });
    });
    promise.catch(() => {});
    this.pasv = { server: srv, promise };
    return srv.address().port;
  }

  pasvHost() {
    const local = (this.sock.localAddress || '').replace(/^::ffff:/, '');
    const peer = (this.sock.remoteAddress || '').replace(/^::ffff:/, '');
    const isPrivate = (ip) => /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.)/.test(ip) || ip === '::1';
    if (this.server.pasvAddress && net.isIPv4(this.server.pasvAddress) && !isPrivate(peer)) return this.server.pasvAddress;
    return net.isIPv4(local) ? local : null;
  }

  // The data socket for the next transfer: accepted (PASV/EPSV) or dialled
  // (PORT/EPRT); wrapped in TLS when PROT P is active.
  async dataSocket() {
    let raw;
    if (this.pasv) {
      const p = this.pasv;
      raw = await p.promise;
      this.closePasv();
    } else if (this.port) {
      const { host, port } = this.port;
      this.port = null;
      raw = await new Promise((resolve, reject) => {
        const s = net.connect({ host, port }, () => resolve(s));
        s.once('error', reject);
        s.setTimeout(DATA_TIMEOUT, () => { s.destroy(); reject(new Error('Data connection timeout')); });
      });
      raw.setTimeout(0);
    } else {
      const e = new Error('Use PASV, EPSV, PORT or EPRT first'); e.code = 'ENODATA'; throw e;
    }
    raw.setNoDelay(true);
    if (this.prot !== 'P') return raw;
    const s = new tls.TLSSocket(raw, { isServer: true, secureContext: this.server.secureContext });
    s.on('error', () => {});
    return s;
  }

  // Sends the 150, runs the transfer, sends 226 / 425 / 451.
  async transfer(fn) {
    let sock;
    this.reply(150, 'Opening data connection');
    try { sock = await this.dataSocket(); }
    catch (err) { this.reply(425, `Can't open data connection: ${err.message}`); return false; }
    try {
      await fn(sock);
      this.reply(226, 'Transfer complete');
      return true;
    } catch (err) {
      this.reply(451, `Transfer aborted: ${err.message}`);
      return false;
    } finally {
      try { sock.destroy(); } catch { /* ignore */ }
    }
  }

  sendText(sock, text) {
    return new Promise((resolve, reject) => {
      sock.once('error', reject);
      sock.end(text, 'utf8', () => { sock.removeListener('error', reject); resolve(); });
    });
  }

  // ── commands ──
  async command(line) {
    if (this.closed) return;
    const sp = line.indexOf(' ');
    const cmd = (sp < 0 ? line : line.slice(0, sp)).toUpperCase();
    const arg = sp < 0 ? '' : line.slice(sp + 1).trim();
    this.log.trace(`${this.server.proto} ${this.peer} > ${cmd === 'PASS' ? 'PASS ****' : line}`);

    const open = ['USER', 'PASS', 'QUIT', 'FEAT', 'SYST', 'OPTS', 'NOOP', 'AUTH', 'PBSZ', 'PROT', 'HELP', 'TYPE'];
    if (!this.perm && !open.includes(cmd)) return this.reply(530, 'Please log in with USER and PASS');

    switch (cmd) {
      case 'USER': this.pendingUser = arg; return this.reply(331, `Password required for ${arg}`);
      case 'PASS': return this.login(arg);
      case 'QUIT': this.reply(221, 'Goodbye'); return this.close();
      case 'SYST': return this.reply(215, 'UNIX Type: L8');
      case 'FEAT': {
        const feats = ['MLST type*;size*;modify*;perm*;', 'MLSD', 'SIZE', 'MDTM', 'REST STREAM', 'UTF8', 'EPSV', 'EPRT', 'PASV', 'TVFS'];
        if (this.server.explicit || this.server.implicit) feats.push('AUTH TLS', 'PBSZ', 'PROT');
        return this.replyLines(211, ['Features:', ...feats], 'End');
      }
      case 'OPTS': return this.reply(200, /^UTF8/i.test(arg) ? 'UTF8 mode enabled' : 'OK');
      case 'NOOP': return this.reply(200, 'OK');
      case 'HELP': return this.reply(214, 'My FTP Server — RFC 959 / 2428 / 3659 / 4217 subset');
      case 'TYPE': return this.reply(200, `Type set to ${(arg[0] || 'I').toUpperCase()}`);
      case 'MODE': return /^S$/i.test(arg) ? this.reply(200, 'Mode S') : this.reply(504, 'Only stream mode');
      case 'STRU': return /^F$/i.test(arg) ? this.reply(200, 'Structure F') : this.reply(504, 'Only file structure');
      case 'ALLO': return this.reply(202, 'No storage allocation necessary');
      case 'ABOR': this.closePasv(); return this.reply(226, 'Abort OK');
      case 'STAT': return this.replyLines(211, ['My FTP Server status:', `Logged in as ${this.user}`, `Working directory ${this.cwd}`, `TLS ${this.secure ? 'on' : 'off'}, PROT ${this.prot}`], 'End');

      // ── TLS (explicit) ──
      case 'AUTH': {
        if (this.server.implicit || this.secure) return this.reply(this.secure ? 503 : 502, this.secure ? 'Already secured' : 'AUTH not available');
        if (!this.server.explicit) return this.reply(502, 'AUTH TLS not available (no certificate configured on this listener)');
        if (!/^(TLS|TLS-C|SSL|TLS-P)$/i.test(arg)) return this.reply(504, 'Only AUTH TLS');
        this.reply(234, 'AUTH TLS OK — starting handshake');
        const plain = this.sock;
        plain.removeAllListeners('data');
        plain.removeAllListeners('timeout');
        plain.removeAllListeners('close');
        plain.setEncoding(null);
        const secure = new tls.TLSSocket(plain, { isServer: true, secureContext: this.server.secureContext });
        secure.once('secure', () => this.log.info('tls_secured', { proto: this.server.proto, peer: this.peer }));
        this.secure = true;
        this.attach(secure);
        return undefined;
      }
      case 'PBSZ': return this.secure ? this.reply(200, 'PBSZ=0') : this.reply(503, 'AUTH TLS first');
      case 'PROT': {
        if (!this.secure) return this.reply(503, 'AUTH TLS first');
        const v = arg.toUpperCase();
        if (v !== 'C' && v !== 'P') return this.reply(504, 'Only PROT C or PROT P');
        this.prot = v;
        return this.reply(200, `PROT ${v} OK`);
      }

      // ── navigation ──
      case 'PWD': case 'XPWD': return this.reply(257, `"${this.cwd.replace(/"/g, '""')}" is the current directory`);
      case 'CWD': case 'XCWD': {
        if (!this.needRead(arg)) return undefined;
        const target = this.absolute(arg);
        if (!this.vfs.directoryExists(target)) return this.reply(550, 'Directory not found');
        this.cwd = target;
        return this.reply(250, `Directory changed to ${this.cwd}`);
      }
      case 'CDUP': case 'XCUP': this.cwd = posixParent(this.cwd); return this.reply(250, `Directory changed to ${this.cwd}`);

      // ── data connection setup ──
      case 'PASV': {
        const host = this.pasvHost();
        if (!host) return this.reply(425, 'Use EPSV on IPv6 connections');
        const port = await this.openPasv();
        return this.reply(227, `Entering Passive Mode (${host.split('.').join(',')},${port >> 8},${port & 255})`);
      }
      case 'EPSV': {
        const port = await this.openPasv();
        return this.reply(229, `Entering Extended Passive Mode (|||${port}|)`);
      }
      case 'PORT': {
        const m = arg.match(/^(\d+),(\d+),(\d+),(\d+),(\d+),(\d+)$/);
        if (!m) return this.reply(501, 'Bad PORT argument');
        this.closePasv();
        this.port = { host: `${m[1]}.${m[2]}.${m[3]}.${m[4]}`, port: Number(m[5]) * 256 + Number(m[6]) };
        return this.reply(200, 'PORT OK');
      }
      case 'EPRT': {
        const parts = arg.split(arg[0] || '|');
        if (parts.length < 5 || !net.isIP(parts[2]) || !Number(parts[3])) return this.reply(501, 'Bad EPRT argument');
        this.closePasv();
        this.port = { host: parts[2], port: Number(parts[3]) };
        return this.reply(200, 'EPRT OK');
      }
      case 'REST': this.restOffset = Math.max(0, Number(arg) || 0); return this.reply(350, `Restarting at ${this.restOffset}`);

      // ── listings ──
      case 'LIST': case 'NLST': case 'MLSD': {
        const target = stripListOptions(unquote(arg));
        const vpath = target ? this.absolute(target) : this.cwd;
        if (!this.needRead(vpath)) return undefined;
        let entries;
        try { entries = this.vfs.list(vpath); } catch (err) { return this.reply(550, err.code === 'ENOENT' ? 'No such file or directory' : err.message); }
        const text = entries.map((e) => (cmd === 'NLST' ? e.name : cmd === 'MLSD' ? mlsxLine(e) : listLine(e))).join('\r\n');
        return this.transfer((sock) => this.sendText(sock, text ? `${text}\r\n` : ''));
      }
      case 'MLST': {
        const vpath = arg ? this.absolute(arg) : this.cwd;
        if (!this.needRead(vpath)) return undefined;
        const st = this.vfs.stat(vpath);
        if (!st) return this.reply(550, 'No such file or directory');
        return this.replyLines(250, ['Listing', mlsxLine({ ...st, name: vpath })], 'End');
      }
      case 'SIZE': {
        if (!this.needRead(arg)) return undefined;
        const st = this.vfs.stat(this.absolute(arg));
        return st && !st.isDir ? this.reply(213, String(st.size)) : this.reply(550, 'Could not get file size');
      }
      case 'MDTM': {
        if (!this.needRead(arg)) return undefined;
        const st = this.vfs.stat(this.absolute(arg));
        return st ? this.reply(213, mlsdTime(st.mtime)) : this.reply(550, 'No such file');
      }

      // ── transfers ──
      case 'RETR': {
        if (!this.needRead(arg)) return undefined;
        const vpath = this.absolute(arg);
        const file = this.vfs.resolve(vpath);
        let st;
        try { st = file && fs.statSync(file); } catch { st = null; }
        if (!st || st.isDirectory()) return this.reply(550, 'File not found');
        const start = Math.min(this.restOffset, st.size);
        this.restOffset = 0;
        let bytes = 0;
        const ok = await this.transfer((sock) => new Promise((resolve, reject) => {
          const rs = fs.createReadStream(file, { start, highWaterMark: this.server.bufferSize });
          pipeline(rs, counter((n) => { bytes += n; }), sock, (err) => (err ? reject(err) : resolve()));
        }));
        if (ok) {
          this.log.ok('download_done', { name: vpath, size: formatBytes(bytes), user: this.user, peer: this.peer });
          this.server.emit('transfer', { dir: 'down', name: vpath, bytes, user: this.user, peer: this.peer });
        }
        return undefined;
      }
      case 'STOR': case 'APPE': {
        if (!this.needWrite(arg)) return undefined;
        const vpath = this.absolute(arg);
        const file = this.vfs.resolve(vpath);
        if (!file || this.vfs.isRoot(vpath) || !fs.existsSync(path.dirname(file))) return this.reply(553, 'Cannot create file here');
        const append = cmd === 'APPE';
        const start = append ? undefined : this.restOffset;
        this.restOffset = 0;
        let bytes = 0;
        const ok = await this.transfer((sock) => new Promise((resolve, reject) => {
          const ws = fs.createWriteStream(file, append ? { flags: 'a' } : start > 0 ? { flags: 'r+', start } : {});
          pipeline(sock, counter((n) => { bytes += n; }), ws, (err) => (err ? reject(err) : resolve()));
        }));
        if (ok) {
          this.log.ok('upload_done', { name: vpath, size: formatBytes(bytes), user: this.user, peer: this.peer });
          this.server.emit('transfer', { dir: 'up', name: vpath, bytes, user: this.user, peer: this.peer });
        }
        return undefined;
      }

      // ── file management ──
      case 'DELE': {
        if (!this.needWrite(arg)) return undefined;
        const vpath = this.absolute(arg);
        const file = this.vfs.resolve(vpath);
        try {
          if (!file || !fs.statSync(file).isFile()) return this.reply(550, 'File not found');
          fs.unlinkSync(file);
        } catch { return this.reply(550, 'File not found'); }
        this.log.info('file_deleted', { path: vpath, user: this.user });
        return this.reply(250, 'File deleted');
      }
      case 'MKD': case 'XMKD': {
        if (!this.needWrite(arg)) return undefined;
        const vpath = this.absolute(arg);
        const dir = this.vfs.resolve(vpath);
        if (!dir || this.vfs.isRoot(vpath)) return this.reply(553, 'Cannot create a folder here');
        if (fs.existsSync(dir)) return this.reply(550, 'Already exists');
        try { fs.mkdirSync(dir); } catch (err) { return this.reply(550, err.message); }
        this.log.info('dir_created', { path: vpath, user: this.user });
        return this.reply(257, `"${vpath.replace(/"/g, '""')}" created`);
      }
      case 'RMD': case 'XRMD': {
        if (!this.needWrite(arg)) return undefined;
        const vpath = this.absolute(arg);
        const dir = this.vfs.resolve(vpath);
        const hit = this.vfs.mountOf(vpath);
        if (!dir || !hit || !hit.rest || hit.rest === '/') return this.reply(550, 'Cannot remove a share root');
        try { if (!fs.statSync(dir).isDirectory()) return this.reply(550, 'Not a directory'); fs.rmdirSync(dir); }
        catch (err) { return this.reply(550, err.code === 'ENOTEMPTY' ? 'Directory not empty' : 'Directory not found'); }
        this.log.info('dir_deleted', { path: vpath, user: this.user });
        return this.reply(250, 'Directory removed');
      }
      case 'RNFR': {
        if (!this.needWrite(arg)) return undefined;
        const vpath = this.absolute(arg);
        const p = this.vfs.resolve(vpath);
        if (!p || !fs.existsSync(p)) return this.reply(550, 'No such file or directory');
        this.renameFrom = { vpath, p };
        return this.reply(350, 'Ready for RNTO');
      }
      case 'RNTO': {
        if (!this.needWrite(arg)) return undefined;
        if (!this.renameFrom) return this.reply(503, 'RNFR first');
        const from = this.renameFrom;
        this.renameFrom = null;
        const vpath = this.absolute(arg);
        const to = this.vfs.resolve(vpath);
        if (!to || this.vfs.isRoot(vpath)) return this.reply(553, 'Cannot rename to that path');
        try { fs.renameSync(from.p, to); } catch (err) { return this.reply(550, err.message); }
        this.log.info('renamed', { from: from.vpath, to: vpath, user: this.user });
        return this.reply(250, 'Renamed');
      }
      case 'SITE': return this.reply(500, 'SITE commands are not supported');
      default: return this.reply(502, `Command not implemented: ${cmd}`);
    }
  }

  login(password) {
    const name = this.pendingUser || '';
    const perm = authenticate(name, password, this.server.auth);
    if (!perm) {
      this.log.warn('login_failed', { proto: this.server.proto, user: name || '?', peer: this.peer });
      return this.reply(530, 'Login incorrect');
    }
    this.perm = perm;
    this.cwd = '/';
    const summary = permissionSummary(perm, this.server.lang);
    this.log.ok('login_ok', { proto: this.server.proto, user: perm.user, perm: summary, peer: this.peer });
    return this.reply(230, `${perm.anonymous ? 'Anonymous' : 'User'} logged in (${summary})`);
  }
}

module.exports = { FtpServer, listLine, mlsxLine, mlsdTime, formatBytes };
