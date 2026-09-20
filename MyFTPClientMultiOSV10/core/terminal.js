// Interactive terminal sessions for the bottom dock.
//
//   local   — MyTerminal-style shell: we own prompt/echo/line editing and
//             run each line in a fresh cmd / powershell / bash (-c).
//   remote  — an SSH PTY (ssh2 shell()) when the browse connection is SFTP
'use strict';

const { EventEmitter } = require('events');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Client } = require('ssh2');
const { listShells, resolveShell, buildShellSpawn } = require('./shells');
const { formatShellPrompt, fromPosixLike, toPosixPromptPath, promptPathStyle } = require('./prompts');
const { ConsoleDecoder, utf8LocaleEnv, ClixmlFilter } = require('./encoding');
const {
  colorEnv,
  colorizePrompt,
  colorizeBanner,
  wrapCommandForColor,
  colorizeCommandOutput,
  listingRequest,
  renderListing,
} = require('./term-color');
const { suggestCompletion, printCompletionColumns } = require('./complete');

const MAX_SESSIONS = 8;
const MAX_CHUNKS = 10000;

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

function cellWidth(ch) {
  const code = ch.codePointAt(0) || 0;
  if (code >= 0x1100 && code <= 0x115f) return 2;
  if (code >= 0x2e80 && code <= 0xa4cf) return 2;
  if (code >= 0xac00 && code <= 0xd7a3) return 2;
  if (code >= 0xf900 && code <= 0xfaff) return 2;
  if (code >= 0xff01 && code <= 0xff60) return 2;
  if (code >= 0x1f300 && code <= 0x1faff) return 2;
  return 1;
}

function popLastChar(str) {
  const chars = Array.from(str);
  const last = chars.pop() || '';
  return { rest: chars.join(''), last };
}

function parseExitLine(line) {
  const m = String(line || '').trim().match(/^(exit|quit|logout|bye)(?:\s+\/b)?(?:\s+(-?\d+))?\s*;?\s*$/i);
  if (!m) return null;
  const n = m[2] != null ? Number(m[2]) : 0;
  return { command: m[1].toLowerCase(), code: Number.isFinite(n) ? n : 0 };
}

function childEnv(extra) {
  const env = { ...process.env, ...utf8LocaleEnv(), ...colorEnv(), ...(extra || {}) };
  delete env.ELECTRON_FORCE_LOCALE;
  delete env.LANGUAGE;
  delete env.NO_COLOR;
  return env;
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
    this.clixml = meta.clixml || null;
    this.alive = true;
    this.exitCode = null;
    this.chunks = [];
    this.nextSeq = 1;
    this.maxChunks = Math.max(500, Number(meta.maxChunks) || MAX_CHUNKS);
  }

  push(data) {
    let text = this.decoder
      ? this.decoder.push(data)
      : (Buffer.isBuffer(data) ? data.toString('utf8') : String(data));
    if (this.clixml) text = this.clixml.push(text);
    if (!text) return;
    this.echo(text);
  }

  echo(text) {
    if (!text) return;
    const seq = this.nextSeq++;
    this.chunks.push({ seq, data: text });
    if (this.chunks.length > this.maxChunks) this.chunks.splice(0, this.chunks.length - this.maxChunks);
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
  constructor(id, { cwd, shellId, prompts, prompt, maxChunks }) {
    const sh = resolveShell(shellId);
    const dir = resolveCwd(cwd);
    super(id, {
      kind: 'local',
      title: sh.labelKo || sh.label,
      cwd: dir,
      shellId: sh.id,
      maxChunks,
    });
    this.shell = sh;
    this.prompts = prompts && typeof prompts === 'object' ? { ...prompts } : {};
    if (prompt && !this.prompts.powershell && !this.prompts.pwsh) {
      this.prompts.powershell = prompt;
      this.prompts.pwsh = prompt;
    }
    this.env = childEnv(sh.env);
    this._line = '';
    this._esc = '';
    this._busy = false;
    this._atLineStart = true;
    this._history = [];
    this._histIdx = -1;
    this._queued = '';
    this._completionKey = '';
    this.child = null;
    this.echo(`${colorizeBanner(sh.labelKo || sh.label)}\r\n`);
    this._prompt();
  }

  echo(text) {
    super.echo(text);
    if (text) this._atLineStart = /(?:\r\n|\n|\r)$/.test(text);
  }

  _ensureNl() {
    if (!this._atLineStart) this.echo('\r\n');
  }

  _promptText() {
    return colorizePrompt(this.shell, formatShellPrompt(this.shell, this.cwd, this.prompts));
  }

  _prompt() {
    this._ensureNl();
    this.echo(this._promptText());
    this._atLineStart = false;
    if (this._queued) {
      this._line = this._queued;
      this.echo(this._queued);
      this._queued = '';
    }
  }

  resize(cols, rows) {
    if (cols > 0) this.cols = cols;
    if (rows > 0) this.rows = rows;
  }

  _killChild() {
    const child = this.child;
    if (!child) return;
    this.child = null;
    this._busy = false;
    try {
      if (process.platform === 'win32' && child.pid) {
        spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
      } else {
        child.kill('SIGTERM');
      }
    } catch { /* gone */ }
  }

  _backspace() {
    if (!this._line) return;
    const { rest, last } = popLastChar(this._line);
    this._line = rest;
    const n = cellWidth(last) || 1;
    this.echo('\b \b'.repeat(n));
  }

  _replaceLine(next) {
    const width = Array.from(this._line).reduce((w, ch) => w + (cellWidth(ch) || 1), 0);
    if (width) this.echo('\b \b'.repeat(width));
    this._line = next || '';
    this._completionKey = '';
    if (this._line) this.echo(this._line);
  }

  _applyCompletion(tokenStart, completion) {
    const oldToken = this._line.slice(tokenStart);
    const width = Array.from(oldToken).reduce((w, ch) => w + (cellWidth(ch) || 1), 0);
    if (width) this.echo('\b \b'.repeat(width));
    this._line = this._line.slice(0, tokenStart) + completion;
    if (completion) this.echo(completion);
    this._atLineStart = false;
  }

  _tabComplete() {
    const result = suggestCompletion({
      line: this._line,
      cwd: this.cwd,
      shell: this.shell,
      completionKey: this._completionKey,
      cols: this.cols,
    });
    if (result.type === 'none') {
      this.echo('\x07');
      this._completionKey = '';
      return;
    }
    if (result.type === 'bell') {
      this.echo('\x07');
      this._completionKey = result.key || this._line;
      return;
    }
    if (result.type === 'apply') {
      this._applyCompletion(result.tokenStart, result.completion);
      this._completionKey = result.pending ? this._line : '';
      return;
    }
    if (result.type === 'list') {
      this.echo('\r\n');
      const lines = printCompletionColumns(result.items, this.cols);
      if (lines.length) this.echo(`${lines.join('\r\n')}\r\n`);
      this.echo(this._promptText());
      if (this._line) this.echo(this._line);
      this._atLineStart = false;
      this._completionKey = '';
    }
  }

  write(data) {
    if (!this.alive) return;
    const input = String(data ?? '').replace(/\x1b\[200~/g, '').replace(/\x1b\[201~/g, '');
    const chars = Array.from(input);
    for (let i = 0; i < chars.length; i++) {
      const ch = chars[i];
      if (this._esc) {
        this._esc += ch;
        if (this._esc === '\x1b' || this._esc === '\x1b[') continue;
        if (this._esc === '\x1b[A') { this._esc = ''; if (!this._busy) this._hist(-1); continue; }
        if (this._esc === '\x1b[B') { this._esc = ''; if (!this._busy) this._hist(1); continue; }
        if (/^\x1b\[[0-9;?]*[A-Za-z~]$/.test(this._esc) || this._esc.length > 16) this._esc = '';
        continue;
      }
      if (ch === '\x1b') { this._esc = '\x1b'; continue; }
      if (ch === '\r' || ch === '\n') {
        if (ch === '\r' && chars[i + 1] === '\n') i += 1;
        if (this._busy) continue;
        this.echo('\r\n');
        const line = this._line;
        this._line = '';
        this._histIdx = -1;
        this._runLine(line);
        continue;
      }
      if (ch === '\u007f' || ch === '\b') {
        if (this._busy) {
          if (this._queued) {
            const { rest } = popLastChar(this._queued);
            this._queued = rest;
          }
          continue;
        }
        this._completionKey = '';
        this._backspace();
        continue;
      }
      if (ch === '\u0003') {
        this.echo('^C\r\n');
        this._line = '';
        this._queued = '';
        this._histIdx = -1;
        this._completionKey = '';
        this._killChild();
        this._prompt();
        continue;
      }
      if (ch === '\u000c') {
        if (this._busy) continue;
        this.echo('\x1b[3J\x1b[2J\x1b[H');
        this._atLineStart = true;
        this._line = '';
        this._completionKey = '';
        this._prompt();
        continue;
      }
      if (ch === '\u0004') {
        if (this._busy) continue;
        if (this._line) continue;
        this.echo('exit\r\n');
        this.finish(0);
        continue;
      }
      if (ch === '\t') {
        if (!this._busy) this._tabComplete();
        continue;
      }
      if (ch < ' ') continue;
      if (this._busy) {
        this._queued += ch;
        continue;
      }
      this._completionKey = '';
      this._line += ch;
      this.echo(ch);
    }
  }

  _hist(dir) {
    if (!this._history.length) return;
    if (dir < 0) {
      if (this._histIdx < 0) this._histIdx = this._history.length;
      if (this._histIdx <= 0) return;
      this._histIdx -= 1;
      this._replaceLine(this._history[this._histIdx]);
      return;
    }
    if (this._histIdx < 0) return;
    this._histIdx += 1;
    if (this._histIdx >= this._history.length) {
      this._histIdx = -1;
      this._replaceLine('');
      return;
    }
    this._replaceLine(this._history[this._histIdx]);
  }

  _cd(target) {
    if (!target || !String(target).trim()) {
      if (this.shell.kind === 'cmd') this.echo(`${this.cwd}\r\n`);
      else if (this.shell.kind === 'powershell') this.cwd = resolveCwd(os.homedir());
      else this.echo(`${toPosixPromptPath(this.cwd, promptPathStyle(this.shell))}\r\n`);
      return;
    }
    const raw = String(target).trim().replace(/^["']|["']$/g, '');
    let next;
    if (raw === '~') next = os.homedir();
    else if (raw.startsWith('~/') || raw.startsWith('~\\')) next = path.join(os.homedir(), raw.slice(2));
    else if (raw.startsWith('/')) next = fromPosixLike(raw, this.shell.kind);
    else if (path.isAbsolute(raw)) next = path.normalize(raw);
    else next = path.resolve(this.cwd, raw);
    if (!fs.existsSync(next) || !fs.statSync(next).isDirectory()) {
      this.echo('The system cannot find the path specified.\r\n');
      return;
    }
    this.cwd = next;
  }

  async _runLine(line) {
    const trimmed = line.trim();
    if (!trimmed) {
      this._prompt();
      return;
    }
    if (!this._history.length || this._history[this._history.length - 1] !== trimmed) {
      this._history.push(trimmed);
      if (this._history.length > 200) this._history.shift();
    }
    const m = trimmed.match(/^(\S+)(?:\s+([\s\S]*))?$/);
    const cmd = ((m && m[1]) || '').toLowerCase();
    const rest = (m && m[2]) || '';
    const leaving = parseExitLine(trimmed);
    if (leaving) {
      this.echo('Bye.\r\n');
      this._killChild();
      this.finish(leaving.code);
      return;
    }
    if (cmd === 'cd' || cmd === 'chdir') {
      this._cd(rest.replace(/^\/d\s+/i, ''));
      if (this.alive) this._prompt();
      return;
    }
    if (cmd === 'cls' || cmd === 'clear') {
      this.echo('\x1b[3J\x1b[2J\x1b[H');
      this._atLineStart = true;
      this._line = '';
      this._prompt();
      return;
    }
    if (listingRequest(this.shell, cmd, rest)) {
      const text = renderListing({
        cwd: this.cwd,
        shell: this.shell,
        cmd,
        rest,
        cols: this.cols,
      });
      if (text) this.echo(text);
      if (this.alive) this._prompt();
      return;
    }
    await this._runExternal(trimmed);
    if (this.alive) this._prompt();
  }

  _runExternal(line) {
    return new Promise((resolve) => {
      this._busy = true;
      const { file, args, options } = buildShellSpawn(this.shell, wrapCommandForColor(this.shell, line));
      let child;
      try {
        child = spawn(file, args, {
          ...(options || {}),
          cwd: this.cwd,
          env: this.env,
          windowsHide: true,
        });
      } catch (err) {
        this.echo(`${err.message}\r\n`);
        this._busy = false;
        resolve();
        return;
      }
      this.child = child;
      const dec = new ConsoleDecoder();
      const clixml = this.shell.kind === 'powershell' ? new ClixmlFilter() : null;
      const flush = (d, stream) => {
        let text = dec.push(d);
        if (clixml) text = clixml.push(text);
        if (text) this.echo(colorizeCommandOutput(this.shell, text, stream));
      };
      child.stdout.on('data', (d) => flush(d, 'stdout'));
      child.stderr.on('data', (d) => flush(d, 'stderr'));
      child.on('error', (err) => {
        this.echo(`${err.message}\r\n`);
        this._busy = false;
        this.child = null;
        resolve();
      });
      child.on('close', () => {
        this._busy = false;
        this.child = null;
        this._ensureNl();
        resolve();
      });
    });
  }

  destroy() {
    this._killChild();
    return Promise.resolve();
  }
}

class RemoteSession extends TerminalSession {
  constructor(id, opts, { remotePath, maxChunks }) {
    const user = opts.user || '';
    const host = opts.host || '';
    super(id, { kind: 'remote', title: user ? `${user}@${host}` : host, cwd: remotePath || '/', maxChunks });
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

  async open({ kind = 'local', cwd, connId, remotePath, cols, rows, shellId, prompts, prompt, maxChunks } = {}) {
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
      session = new RemoteSession(id, opts, { remotePath, maxChunks });
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
      session = new LocalSession(id, { cwd, shellId, prompts, prompt, maxChunks });
      this._bind(session);
      this.map.set(id, session);
    }
    return session.snapshot();
  }

  _bind(session) {
    session.on('data', (id, data, seq) => this.emit('data', id, data, seq));
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

module.exports = { TerminalRegistry, MAX_SESSIONS, parseExitLine };
