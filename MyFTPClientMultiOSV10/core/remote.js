// One remote-client interface over three protocols:
//
//   FTP / FTPS  — basic-ftp   (FTPS = explicit TLS, any certificate accepted,
//                              like the WinForms original's ValidateAnyCertificate)
//   SFTP        — ssh2        (password auth, keyboard-interactive fallback)
//
// Every method takes absolute POSIX remote paths, returns plain JSON-able
// data, and reports transfer progress through `onBytes(delta)` so the
// transfer layer can add it to a job. Transfers can be aborted: FTP closes
// and silently reopens the control connection (basic-ftp has no ABOR),
// SFTP stops issuing reads/writes and closes the handle.
'use strict';

const fs = require('fs');
const fsp = fs.promises;
const { cancelledError } = require('./jobs');

const CONNECT_TIMEOUT_MS = 20_000;
const SOCKET_TIMEOUT_MS = 30_000;

// SFTP pipelining: 32 requests of 64 KB in flight ≈ 2 MB window — the same
// order of magnitude as the original's 1 MB SSH.NET buffer.
const SFTP_CHUNK = 64 * 1024;
const SFTP_CONCURRENCY = 32;

function posixJoin(dir, name) {
  if (!dir || dir === '/') return `/${name}`;
  return `${dir.replace(/\/+$/, '')}/${name}`;
}

function posixParent(p) {
  const t = p.replace(/\/+$/, '');
  const i = t.lastIndexOf('/');
  return i <= 0 ? '/' : t.slice(0, i);
}

function posixBase(p) {
  const t = p.replace(/\/+$/, '');
  return t.slice(t.lastIndexOf('/') + 1) || t;
}

function notConnected() {
  const e = new Error('Not connected'); e.code = 'NOT_CONNECTED'; return e;
}

function abortable(promise, signal) {
  if (!signal) return promise;
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(cancelledError());
    const onAbort = () => reject(cancelledError());
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then((v) => { signal.removeEventListener('abort', onAbort); resolve(v); },
      (e) => { signal.removeEventListener('abort', onAbort); reject(signal.aborted ? cancelledError() : e); });
  });
}

function withTimeout(promise, ms, message) {
  let timer;
  const t = new Promise((_, reject) => { timer = setTimeout(() => { const e = new Error(message); e.code = 'ETIMEDOUT'; reject(e); }, ms); });
  return Promise.race([promise, t]).finally(() => clearTimeout(timer));
}

// ── FTP / FTPS ────────────────────────────────────────────

class FtpClient {
  constructor(opts) {
    this.opts = opts;
    this.protocol = opts.protocol;
    this.client = null;
    this._queue = Promise.resolve();   // basic-ftp runs one command at a time
    this.features = null;
  }

  // Serialises commands: two overlapping operations on one FTP control
  // connection would corrupt each other.
  _run(fn) {
    const next = this._queue.then(fn, fn);
    this._queue = next.catch(() => {});
    return next;
  }

  async connect(signal) {
    const { Client } = require('basic-ftp');
    const client = new Client(SOCKET_TIMEOUT_MS);
    client.ftp.verbose = false;
    const access = client.access({
      host: this.opts.host,
      port: this.opts.port,
      user: this.opts.user || 'anonymous',
      password: this.opts.password || (this.opts.user ? '' : 'anonymous@'),
      secure: this.protocol === 'FTPS' ? true : false,
      secureOptions: { rejectUnauthorized: false },
    });
    try {
      await abortable(withTimeout(access, CONNECT_TIMEOUT_MS, `Connection to ${this.opts.host}:${this.opts.port} timed out`), signal);
    } catch (err) {
      try { client.close(); } catch { /* ignore */ }
      throw err;
    }
    this.client = client;
    try { this.features = await client.features(); } catch { this.features = new Map(); }
    return { welcome: '' };
  }

  async close() {
    const c = this.client;
    this.client = null;
    if (c) { try { c.close(); } catch { /* ignore */ } }
  }

  get connected() { return !!this.client && !this.client.closed; }

  _c() {
    if (!this.client || this.client.closed) throw notConnected();
    return this.client;
  }

  // After an abort the control connection is gone: reopen it so the session
  // carries on (same host, same credentials).
  async _reconnect() {
    await this.close();
    await this.connect();
  }

  list(dir) {
    return this._run(async () => {
      const raw = await this._c().list(dir);
      const entries = [];
      for (const f of raw) {
        if (f.name === '.' || f.name === '..') continue;
        let isDir = f.isDirectory;
        if (f.isSymbolicLink) {
          // Follow the link (a CWD that succeeds means it is a directory).
          const target = posixJoin(dir, f.name);
          try { await this._c().cd(target); isDir = true; await this._c().cd('/'); } catch { isDir = false; }
        }
        entries.push({
          name: f.name,
          path: posixJoin(dir, f.name),
          isDir,
          isLink: !!f.isSymbolicLink,
          size: isDir ? 0 : (f.size || 0),
          mtime: f.modifiedAt ? f.modifiedAt.getTime() : 0,
          rawDate: f.rawModifiedAt || '',
        });
      }
      return entries;
    });
  }

  async exists(p) {
    const parent = posixParent(p);
    const name = posixBase(p);
    let entries;
    try { entries = await this.list(parent); } catch { return { exists: false, isDir: false, size: 0 }; }
    const hit = entries.find((e) => e.name === name);
    return hit ? { exists: true, isDir: hit.isDir, size: hit.size } : { exists: false, isDir: false, size: 0 };
  }

  mkdir(p) {
    return this._run(async () => { await this._c().send(`MKD ${p}`); });
  }

  async ensureDir(p) {
    // MKD on an existing folder fails on most servers; that is fine.
    await this._run(async () => { await this._c().sendIgnoringError(`MKD ${p}`); });
  }

  rename(from, to) {
    return this._run(async () => { await this._c().rename(from, to); });
  }

  removeFile(p) {
    return this._run(async () => { await this._c().remove(p); });
  }

  removeEmptyDir(p) {
    return this._run(async () => { await this._c().removeEmptyDir(p); });
  }

  // Downloads one file; `onBytes(delta)` gets the bytes as they arrive.
  download(remotePath, localPath, onBytes, signal) {
    return this._run(async () => {
      if (signal && signal.aborted) throw cancelledError();
      const client = this._c();
      let last = 0;
      client.trackProgress((info) => { const d = info.bytes - last; last = info.bytes; if (d > 0) onBytes(d); });
      const onAbort = () => { try { client.close(); } catch { /* ignore */ } };
      if (signal) signal.addEventListener('abort', onAbort, { once: true });
      try {
        await client.downloadTo(localPath, remotePath);
      } catch (err) {
        if (signal && signal.aborted) { await this._reconnect().catch(() => {}); throw cancelledError(); }
        throw err;
      } finally {
        client.trackProgress();
        if (signal) signal.removeEventListener('abort', onAbort);
      }
    });
  }

  upload(localPath, remotePath, onBytes, signal) {
    return this._run(async () => {
      if (signal && signal.aborted) throw cancelledError();
      const client = this._c();
      let last = 0;
      client.trackProgress((info) => { const d = info.bytes - last; last = info.bytes; if (d > 0) onBytes(d); });
      const onAbort = () => { try { client.close(); } catch { /* ignore */ } };
      if (signal) signal.addEventListener('abort', onAbort, { once: true });
      try {
        await client.uploadFrom(localPath, remotePath);
      } catch (err) {
        if (signal && signal.aborted) { await this._reconnect().catch(() => {}); throw cancelledError(); }
        throw err;
      } finally {
        client.trackProgress();
        if (signal) signal.removeEventListener('abort', onAbort);
      }
    });
  }
}

// ── SFTP ──────────────────────────────────────────────────

class SftpClient {
  constructor(opts) {
    this.opts = opts;
    this.protocol = 'SFTP';
    this.conn = null;
    this.sftp = null;
  }

  connect(signal) {
    const { Client } = require('ssh2');
    return abortable(new Promise((resolve, reject) => {
      const conn = new Client();
      let settled = false;
      // destroy(), not end(): a half-open socket would keep the process (and a
      // cancelled connect attempt) alive until readyTimeout.
      const fail = (err) => { if (settled) return; settled = true; try { conn.destroy(); } catch { /* ignore */ } reject(err); };
      conn.on('ready', () => {
        conn.sftp((err, sftp) => {
          if (err) return fail(err);
          if (settled) return;
          settled = true;
          this.conn = conn;
          this.sftp = sftp;
          conn.on('close', () => { this.conn = null; this.sftp = null; });
          conn.on('error', () => { /* surfaced by the failing operation */ });
          resolve({ welcome: '' });
        });
      });
      conn.on('error', fail);
      conn.on('keyboard-interactive', (_name, _instr, _lang, prompts, finish) => finish(prompts.map(() => this.opts.password || '')));
      conn.connect({
        host: this.opts.host,
        port: this.opts.port,
        username: this.opts.user,
        password: this.opts.password,
        tryKeyboard: true,
        readyTimeout: CONNECT_TIMEOUT_MS,
        keepaliveInterval: 15_000,
        keepaliveCountMax: 3,
      });
      if (signal) signal.addEventListener('abort', () => fail(cancelledError()), { once: true });
    }), signal);
  }

  async close() {
    const c = this.conn;
    this.conn = null;
    this.sftp = null;
    if (c) { try { c.end(); } catch { /* ignore */ } }
  }

  get connected() { return !!this.sftp; }

  _s() {
    if (!this.sftp) throw notConnected();
    return this.sftp;
  }

  _call(method, ...args) {
    const sftp = this._s();
    return new Promise((resolve, reject) => sftp[method](...args, (err, res) => (err ? reject(err) : resolve(res))));
  }

  async list(dir) {
    const raw = await this._call('readdir', dir);
    const entries = [];
    for (const f of raw) {
      if (f.filename === '.' || f.filename === '..') continue;
      const p = posixJoin(dir, f.filename);
      let isDir = f.attrs.isDirectory();
      let size = f.attrs.size || 0;
      const isLink = f.attrs.isSymbolicLink();
      if (isLink) {
        try { const st = await this._call('stat', p); isDir = st.isDirectory(); size = st.size || 0; } catch { /* dangling link */ }
      }
      entries.push({
        name: f.filename,
        path: p,
        isDir,
        isLink,
        size: isDir ? 0 : size,
        mtime: f.attrs.mtime ? f.attrs.mtime * 1000 : 0,
        rawDate: '',
      });
    }
    return entries;
  }

  async exists(p) {
    try {
      const st = await this._call('stat', p);
      return { exists: true, isDir: st.isDirectory(), size: st.size || 0 };
    } catch {
      return { exists: false, isDir: false, size: 0 };
    }
  }

  mkdir(p) { return this._call('mkdir', p); }

  async ensureDir(p) {
    const r = await this.exists(p);
    if (!r.exists) await this._call('mkdir', p);
  }

  rename(from, to) { return this._call('rename', from, to); }

  removeFile(p) { return this._call('unlink', p); }

  removeEmptyDir(p) { return this._call('rmdir', p); }

  // Pipelined read: keep SFTP_CONCURRENCY READ requests in flight, write the
  // chunks to the local file at their own offsets. Stops at the first error
  // or on abort.
  async download(remotePath, localPath, onBytes, signal) {
    const sftp = this._s();
    const st = await this._call('stat', remotePath);
    const total = st.size || 0;
    const handle = await this._call('open', remotePath, 'r');
    const fh = await fsp.open(localPath, 'w');
    try {
      await this._pump(total, signal, async (position, length) => {
        const buf = Buffer.allocUnsafe(length);
        const n = await new Promise((resolve, reject) => sftp.read(handle, buf, 0, length, position, (err, bytesRead) => (err ? reject(err) : resolve(bytesRead))));
        if (n > 0) await fh.write(buf, 0, n, position);
        onBytes(n);
        return n;
      });
    } finally {
      await fh.close().catch(() => {});
      await new Promise((resolve) => sftp.close(handle, () => resolve()));
    }
  }

  async upload(localPath, remotePath, onBytes, signal) {
    const sftp = this._s();
    const st = await fsp.stat(localPath);
    const total = st.size;
    const fh = await fsp.open(localPath, 'r');
    const handle = await this._call('open', remotePath, 'w');
    try {
      await this._pump(total, signal, async (position, length) => {
        const buf = Buffer.allocUnsafe(length);
        const { bytesRead } = await fh.read(buf, 0, length, position);
        if (bytesRead > 0) {
          await new Promise((resolve, reject) => sftp.write(handle, buf, 0, bytesRead, position, (err) => (err ? reject(err) : resolve())));
        }
        onBytes(bytesRead);
        return bytesRead;
      });
    } finally {
      await fh.close().catch(() => {});
      await new Promise((resolve) => sftp.close(handle, () => resolve()));
    }
  }

  // Runs `step(position, length)` for every chunk of `total` bytes with a
  // bounded number of steps in flight.
  async _pump(total, signal, step) {
    let next = 0;
    let failed = null;
    const inFlight = new Set();
    const launch = () => {
      const position = next;
      const length = Math.min(SFTP_CHUNK, total - position);
      next += length;
      const p = step(position, length).catch((err) => { failed = failed || err; }).finally(() => inFlight.delete(p));
      inFlight.add(p);
    };
    while (next < total || inFlight.size) {
      if (signal && signal.aborted) failed = failed || cancelledError();
      if (failed) { await Promise.allSettled(Array.from(inFlight)); throw failed; }
      while (next < total && inFlight.size < SFTP_CONCURRENCY) launch();
      if (inFlight.size) await Promise.race(Array.from(inFlight));
    }
    // total === 0: the open() calls above already created the empty file.
  }
}

// The API may be called with a URL in `host` ("ftp://host:2121/pub");
// keep only the host name and honour an explicit scheme / port in it.
function normalizeHost(opts) {
  let host = String(opts.host || '').trim();
  let protocol = String(opts.protocol || 'FTP').toUpperCase();
  let port = opts.port;
  const m = /^([a-zA-Z][a-zA-Z0-9+.-]*):\/\/(.*)$/.exec(host);
  if (m) {
    const scheme = m[1].toUpperCase();
    if (scheme === 'FTP' || scheme === 'FTPS' || scheme === 'SFTP') protocol = scheme;
    host = m[2];
  }
  const slash = host.indexOf('/');
  if (slash >= 0) host = host.slice(0, slash);
  const at = host.lastIndexOf('@');
  if (at >= 0) host = host.slice(at + 1);
  const v6 = /^\[([^\]]+)\](?::(\d+))?$/.exec(host);
  if (v6) { host = v6[1]; if (v6[2]) port = v6[2]; }
  else {
    const colon = host.lastIndexOf(':');
    if (colon >= 0 && /^\d+$/.test(host.slice(colon + 1))) { port = host.slice(colon + 1); host = host.slice(0, colon); }
  }
  return { host: host.trim(), protocol, port };
}

function createClient(opts) {
  const n = normalizeHost(opts);
  const protocol = n.protocol;
  const port = Number(n.port) || (protocol === 'SFTP' ? 22 : 21);
  const o = { ...opts, host: n.host, protocol, port };
  return protocol === 'SFTP' ? new SftpClient(o) : new FtpClient(o);
}

module.exports = { createClient, normalizeHost, FtpClient, SftpClient, posixJoin, posixParent, posixBase, CONNECT_TIMEOUT_MS };
