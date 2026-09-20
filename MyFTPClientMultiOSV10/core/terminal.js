// Interactive terminal sessions for the bottom dock.
//
//   local   — a shell chosen from the ones installed on this machine
//   remote  — an SSH PTY (ssh2 shell()) when the browse connection is SFTP
//
// Each session keeps a rolling output buffer so the web host can poll, and
// emits 'data' / 'exit' so Electron can push chunks to the renderer.
'use strict';

const { EventEmitter } = require('events');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const { Client } = require('ssh2');
const { listShells, resolveShell } = require('./shells');
const { ConsoleDecoder, utf8LocaleEnv } = require('./encoding');

const MAX_SESSIONS = 8;
const MAX_CHUNKS = 2500;

function posixQuote(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}

function resolveCwd(cwd) {
  const p = cwd && typeof cwd === 'string' ? cwd : os.homedir();
  try {
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) return p;
  } catch { /* ignore */ }
  return os.homedir();
}

class TerminalSession extends EventEmitter {
  constructor(id, meta) {
    super();
    this.id = id;
    this.kind = meta.kind;
    this.title = meta.title;
    this.shellId = meta.shellId || '';
    this.cwd = meta.cwd || '';
    this.decoder = meta.decoder || null;
    this.alive = true;
    this.exitCode = null;
    this.chunks = [];
    this.nextSeq = 1;
  }

  push(data) {
    const text = this.decoder
      ? this.decoder.push(data)
      : (Buffer.isBuffer(data) ? data.toString('utf8') : String(data));
    if (!text) return;
    const seq = this.nextSeq++;
    this.chunks.push({ seq, data: text });
    if (this.chunks.length > MAX_CHUNKS) this.chunks.splice(0, this.chunks.length - MAX_CHUNKS);
    this.emit('data', this.id, text, seq);
  }

  read(after) {
    const from = Number(after) || 0;
    const chunks = this.chunks.filter((c) => c.seq > from);
    const last = chunks.length ? chunks[chunks.length - 1].seq : from;
    return { chunks, after: last, alive: this.alive, exitCode: this.exitCode };
  }

  snapshot() {
    return { id: this.id, kind: this.kind, title: this.title, shellId: this.shellId, cwd: this.cwd, alive: this.alive, exitCode: this.exitCode };
  }

  write(_data) { /* override */ }
  resize(_cols, _rows) { /* optional */ }
  destroy() { /* override */ }

  finish(code) {
    if (!this.alive) return;
    this.alive = false;
    this.exitCode = code == null ? 0 : code;
    this.emit('exit', this.id, this.exitCode);
  }
}

class LocalSession extends TerminalSession {
  constructor(id, { cwd, shellId }) {
    const sh = resolveShell(shellId);
    const dir = resolveCwd(cwd);
    super(id, { kind: 'local', title: sh.labelKo || sh.label, cwd: dir, shellId: sh.id, decoder: new ConsoleDecoder() });
    const env = {
      ...process.env,
      ...utf8LocaleEnv(),
      ...(sh.env || {}),
      MFC_TERM_CWD: dir,
    };
    if (sh.codepage || sh.id === 'powershell' || sh.id === 'pwsh') {
      delete env.TERM;
      delete env.COLORTERM;
    } else {
      if (!env.TERM) env.TERM = 'xterm-256color';
      env.COLORTERM = env.COLORTERM || 'truecolor';
    }
    this.codepage = sh.codepage || '';
    this.child = spawn(sh.file, sh.args, {
      cwd: dir,
      env,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this._ready = false;
    this._queue = [];
    const onReady = () => {
      if (this._ready) return;
      this._ready = true;
      for (const q of this._queue) this._write(q);
      this._queue = [];
    };
    this.child.stdout.on('data', (d) => { this.push(d); onReady(); });
    this.child.stderr.on('data', (d) => { this.push(d); onReady(); });
    this.child.on('error', (err) => {
      this.push(`\r\n${err.message}\r\n`);
      this.finish(1);
    });
    this.child.on('close', (code) => this.finish(code));
    setTimeout(onReady, 400);
  }

  _write(data) {
    if (!this.alive || !this.child || !this.child.stdin) return;
    try {
      const str = data == null ? '' : String(data);
      if (this.codepage) {
        const iconv = require('iconv-lite');
        this.child.stdin.write(iconv.encode(str, this.codepage));
      } else {
        this.child.stdin.write(str, 'utf8');
      }
    } catch { /* closed */ }
  }

  write(data) {
    if (!this._ready) { this._queue.push(data); return; }
    this._write(data);
  }

  destroy() {
    if (!this.child) return Promise.resolve();
    const child = this.child;
    this.child = null;
    return new Promise((resolve) => {
      let settled = false;
      const done = () => { if (settled) return; settled = true; resolve(); };
      setTimeout(done, 2000);
      child.once('close', done);
      try {
        if (process.platform === 'win32' && child.pid) {
          spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
        } else {
          child.kill('SIGTERM');
        }
      } catch { done(); }
    });
  }
}

class RemoteSession extends TerminalSession {
  constructor(id, opts, { remotePath }) {
    const user = opts.user || '';
    const host = opts.host || '';
    super(id, { kind: 'remote', title: user ? `${user}@${host}` : host, cwd: remotePath || '/' });
    this._opts = opts;
    this._remotePath = remotePath;
    this._conn = null;
    this._stream = null;
  }

  connect(cols, rows) {
    return new Promise((resolve, reject) => {
      const conn = new Client();
      this._conn = conn;
      let settled = false;
      const fail = (err) => {
        if (settled) return;
        settled = true;
        try { conn.destroy(); } catch { /* ignore */ }
        reject(err);
      };
      conn.on('ready', () => {
        conn.shell({ term: 'xterm-256color', cols: cols || 80, rows: rows || 24 }, (err, stream) => {
          if (err) return fail(err);
          if (settled) return;
          settled = true;
          this._stream = stream;
          stream.on('data', (d) => this.push(d));
          if (stream.stderr) stream.stderr.on('data', (d) => this.push(d));
          stream.on('close', () => {
            this.finish(stream.exitCode != null ? stream.exitCode : 0);
            try { conn.end(); } catch { /* ignore */ }
          });
          stream.on('error', (e) => this.push(`\r\n${e.message}\r\n`));
          if (this._remotePath && this._remotePath !== '/') {
            try { stream.write(`cd ${posixQuote(this._remotePath)}\n`); } catch { /* ignore */ }
          }
          resolve(this);
        });
      });
      conn.on('error', fail);
      conn.on('keyboard-interactive', (_n, _i, _l, prompts, finish) => finish((prompts || []).map(() => this._opts.password || '')));
      conn.connect({
        host: this._opts.host,
        port: Number(this._opts.port) || 22,
        username: this._opts.user,
        password: this._opts.password,
        tryKeyboard: true,
        readyTimeout: 20_000,
        keepaliveInterval: 15_000,
        keepaliveCountMax: 3,
      });
    });
  }

  write(data) {
    if (!this.alive || !this._stream) return;
    try { this._stream.write(data); } catch { /* closed */ }
  }

  resize(cols, rows) {
    if (!this.alive || !this._stream || typeof this._stream.setWindow !== 'function') return;
    try { this._stream.setWindow(rows || 24, cols || 80, 0, 0); } catch { /* ignore */ }
  }

  destroy() {
    const stream = this._stream;
    const conn = this._conn;
    this._stream = null;
    this._conn = null;
    try { if (stream) stream.close(); } catch { /* ignore */ }
    try { if (conn) conn.end(); } catch { /* ignore */ }
    return Promise.resolve();
  }
}

class TerminalRegistry extends EventEmitter {
  constructor({ connections } = {}) {
    super();
    this.connections = connections;
    this.map = new Map();
    this.nextId = 1;
  }

  list() {
    return Array.from(this.map.values()).map((s) => s.snapshot());
  }

  get(id) {
    const s = this.map.get(Number(id));
    if (!s) {
      const e = new Error('Terminal not found');
      e.code = 'ENOENT';
      throw e;
    }
    return s;
  }

  shells() {
    return listShells();
  }

  async open({ kind = 'local', cwd, connId, remotePath, cols, rows, shellId } = {}) {
    if (this.map.size >= MAX_SESSIONS) {
      const e = new Error(`At most ${MAX_SESSIONS} terminals can be open`);
      e.code = 'EMAX';
      throw e;
    }
    const id = this.nextId++;
    let session;
    if (kind === 'remote') {
      if (!this.connections) {
        const e = new Error('Remote terminals are not available');
        e.code = 'ENOSHELL';
        throw e;
      }
      const opts = this.connections.getOpts(connId);
      if (String(opts.protocol || '').toUpperCase() !== 'SFTP') {
        const e = new Error('Remote terminals require an SFTP connection');
        e.code = 'ENOSHELL';
        throw e;
      }
      session = new RemoteSession(id, opts, { remotePath });
      this._bind(session);
      this.map.set(id, session);
      try {
        await session.connect(cols, rows);
      } catch (err) {
        this.map.delete(id);
        try { session.destroy(); } catch { /* ignore */ }
        throw err;
      }
    } else {
      session = new LocalSession(id, { cwd, shellId });
      this._bind(session);
      this.map.set(id, session);
    }
    return session.snapshot();
  }

  _bind(session) {
    session.on('data', (id, data) => this.emit('data', id, data));
    session.on('exit', (id, code) => this.emit('exit', id, code));
  }

  write(id, data) {
    this.get(id).write(data == null ? '' : String(data));
    return { ok: true };
  }

  resize(id, cols, rows) {
    this.get(id).resize(Number(cols) || 80, Number(rows) || 24);
    return { ok: true };
  }

  read(id, after) {
    return this.get(id).read(after);
  }

  close(id) {
    const s = this.map.get(Number(id));
    if (!s) return { ok: false };
    this.map.delete(Number(id));
    const stopping = Promise.resolve().then(() => s.destroy()).catch(() => {});
    if (s.alive) s.finish(0);
    return { ok: true, stopping };
  }

  async closeAll() {
    const all = Array.from(this.map.values());
    this.map.clear();
    await Promise.all(all.map((s) => Promise.resolve().then(() => s.destroy()).catch(() => {})));
  }

  closeRemote(connId) {
    const n = Number(connId);
    for (const s of Array.from(this.map.values())) {
      if (s.kind === 'remote' && s._opts && Number(s._opts.id) === n) this.close(s.id);
    }
  }
}

module.exports = { TerminalRegistry, MAX_SESSIONS };
