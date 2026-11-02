// FTP client for the host API (POST /api/ftp/<op>, server/fs-api.js): the
// sockets behind the engine's ftp class (core/lib/io/ftp.js). node:net only.
//
//   open   { host, port, user, password }   → { session, path }
//   close  { session }                      → { ok: true }
//   pwd    { session }                      → { path }
//   cd     { session, path }                → { path }
//   list   { session, path }                → { entries: [{ name, isDir, size, mtimeMs }] }
//   get    { session, path, mode }          → { bodyBase64 }
//   put    { session, path, bodyBase64, mode } → { ok: true }
//   delete / mkdir / rmdir { session, path } → { ok: true }
//   rename { session, from, to }            → { ok: true }
//
// Passive mode only (EPSV first on IPv6, PASV first on IPv4, the other as the
// fallback); MLSD when the server lists MLST in FEAT, else LIST with Unix and
// Windows/IIS formats. Plain FTP only (no FTPS). Sessions close after an idle
// timeout; the operations of one session run one after the other.
import net from 'node:net';
import crypto from 'node:crypto';

export class FtpError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

/** One MLSD line ("type=file;size=12;modify=20240102030405; name") → entry or null. */
export function parseMlsdLine(line) {
  const sp = line.indexOf(' ');
  if (sp < 0) return null;
  const facts = {};
  for (const f of line.slice(0, sp).split(';')) {
    const eq = f.indexOf('=');
    if (eq > 0) facts[f.slice(0, eq).toLowerCase()] = f.slice(eq + 1);
  }
  const name = line.slice(sp + 1);
  const type = String(facts.type || '').toLowerCase();
  if (!name || type === 'cdir' || type === 'pdir') return null;
  let mtimeMs = NaN;
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:\.(\d+))?/.exec(facts.modify || '');
  if (m) mtimeMs = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6], m[7] ? Math.round(Number(`0.${m[7]}`) * 1000) : 0);
  const isDir = type === 'dir';
  return { name, isDir, size: isDir ? 0 : Number(facts.size || facts['x.size'] || 0) || 0, mtimeMs: Number.isFinite(mtimeMs) ? mtimeMs : null };
}

const UNIX_RE = /^([-dlbcps])\S{9}\S*\s+\d+\s+.*?(\d+)\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+(\d{1,2})\s+(\d{1,2}:\d{2}|\d{4})\s(.*)$/i;
const WIN_RE = /^(\d{2})-(\d{2})-(\d{2}|\d{4})\s+(\d{1,2}):(\d{2})\s*([AP]M)?\s+(<DIR>|\d+)\s+(.+)$/i;

/** One LIST line (Unix "ls -l" or Windows/IIS "DOS") → entry or null. */
export function parseListLine(line, now = new Date()) {
  const s = String(line).replace(/\r$/, '');
  if (!s.trim() || /^total\s+\d+/i.test(s)) return null;
  let m = UNIX_RE.exec(s);
  if (m) {
    const kind = m[1];
    let name = m[6].replace(/^ /, '');
    if (kind === 'l') { const arrow = name.indexOf(' -> '); if (arrow >= 0) name = name.slice(0, arrow); }
    if (!name || name === '.' || name === '..') return null;
    const mon = MONTHS[m[3].toLowerCase()];
    const day = +m[4];
    let mtimeMs;
    if (m[5].includes(':')) {
      const [hh, mm] = m[5].split(':').map(Number);
      let year = now.getFullYear();
      // "Mon dd hh:mm" is within the last six months: a date ahead of now is last year's.
      if (new Date(year, mon, day, hh, mm).getTime() > now.getTime() + 86400000) year -= 1;
      mtimeMs = new Date(year, mon, day, hh, mm).getTime();
    } else mtimeMs = new Date(+m[5], mon, day).getTime();
    const isDir = kind === 'd';
    return { name, isDir, size: isDir ? 0 : Number(m[2]) || 0, mtimeMs };
  }
  m = WIN_RE.exec(s);
  if (m) {
    let year = +m[3];
    if (m[3].length === 2) year += year < 70 ? 2000 : 1900;
    let hh = +m[4];
    if (m[6]) { const pm = m[6].toUpperCase() === 'PM'; if (hh === 12) hh = pm ? 12 : 0; else if (pm) hh += 12; }
    const isDir = m[7].toUpperCase() === '<DIR>';
    const name = m[8];
    if (name === '.' || name === '..') return null;
    return { name, isDir, size: isDir ? 0 : Number(m[7]) || 0, mtimeMs: new Date(year, +m[1] - 1, +m[2], hh, +m[5]).getTime() };
  }
  return null;
}

/** The path of a 257 reply: 257 "/a ""quoted"" dir" is current. */
export function parse257(text) {
  const m = /"((?:[^"]|"")*)"/.exec(text);
  return m ? m[1].replace(/""/g, '"') : null;
}

const isPrivateV4 = (ip) => /^(10\.|127\.|192\.168\.|169\.254\.|0\.)/.test(ip) || /^172\.(1[6-9]|2\d|3[01])\./.test(ip);

/** One control connection. */
export class FtpConnection {
  constructor({ timeoutMs = 30000 } = {}) {
    this.timeoutMs = timeoutMs;
    this.socket = null;
    this.buf = '';
    this.lines = [];         // lines of the reply being read
    this.replies = [];       // complete replies nobody waited for yet
    this.waiters = [];       // { resolve, reject, timer }
    this.closed = false;
    this.features = new Set();
    this.type = null;
    this.pasvFirst = true;
  }

  connect(host, port) {
    return new Promise((resolve, reject) => {
      const sock = net.connect({ host, port });
      this.socket = sock;
      this.host = host;
      sock.setEncoding('utf8');
      const fail = (e) => { cleanup(); reject(new FtpError('ECONNREFUSED', `Could not connect to ${host}:${port} (${e.message || e}).`)); };
      const timer = setTimeout(() => { sock.destroy(); fail(new Error('timed out')); }, this.timeoutMs);
      const cleanup = () => { clearTimeout(timer); sock.off('error', fail); };
      sock.once('error', fail);
      sock.once('connect', () => {
        cleanup();
        this.pasvFirst = !net.isIPv6(sock.remoteAddress || '');
        sock.on('data', (d) => this.onData(d));
        sock.on('error', (e) => this.onClose(e));
        sock.on('close', () => this.onClose(null));
        resolve();
      });
    });
  }

  onData(d) {
    this.buf += d;
    let nl;
    while ((nl = this.buf.indexOf('\n')) >= 0) {
      const line = this.buf.slice(0, nl).replace(/\r$/, '');
      this.buf = this.buf.slice(nl + 1);
      this.lines.push(line);
      const first = this.lines[0];
      const m = /^(\d{3})([ -])/.exec(first);
      if (!m) { this.lines = []; continue; }               // stray text: ignored
      const done = m[2] === ' ' ? this.lines.length === 1 : (this.lines.length > 1 && line.startsWith(`${m[1]} `));
      if (!done) continue;
      const reply = { code: Number(m[1]), text: this.lines.map((l) => l.replace(/^\d{3}[ -]?/, '')).join('\n'), raw: this.lines.join('\n') };
      this.lines = [];
      const w = this.waiters.shift();
      if (w) { clearTimeout(w.timer); w.resolve(reply); } else this.replies.push(reply);
    }
  }

  onClose(err) {
    if (this.closed) return;
    this.closed = true;
    for (const w of this.waiters.splice(0)) { clearTimeout(w.timer); w.reject(new FtpError('ECONNRESET', `The connection was closed${err ? ` (${err.message})` : ''}.`)); }
    if (this.onClosed) this.onClosed();
  }

  /** The next reply (one already received, or the next to arrive). */
  read() {
    if (this.replies.length) return Promise.resolve(this.replies.shift());
    if (this.closed) return Promise.reject(new FtpError('ECONNRESET', 'The connection is closed.'));
    return new Promise((resolve, reject) => {
      const w = { resolve, reject, timer: null };
      w.timer = setTimeout(() => {
        const i = this.waiters.indexOf(w);
        if (i >= 0) this.waiters.splice(i, 1);
        reject(new FtpError('ETIMEDOUT', 'The server did not answer in time.'));
        this.destroy();
      }, this.timeoutMs);
      this.waiters.push(w);
    });
  }

  /** Sends a command and reads its reply (no check of the code). */
  async send(line) {
    if (this.closed) throw new FtpError('ECONNRESET', 'The connection is closed.');
    if (/[\r\n]/.test(line)) throw new FtpError('EINVAL', 'Line breaks are not allowed in FTP names.');
    this.socket.write(`${line}\r\n`, 'utf8');
    return this.read();
  }

  /** Sends a command; a reply outside 2xx/3xx (or not in `ok`) is an error. */
  async cmd(line, ok = null) {
    const r = await this.send(line);
    const good = ok ? ok.includes(r.code) : r.code < 400;
    if (!good) throw replyError(line, r);
    return r;
  }

  destroy() { try { this.socket && this.socket.destroy(); } catch { /* gone */ } this.onClose(null); }

  async login(user, password) {
    const hello = await this.read();
    if (hello.code !== 220) throw replyError('connect', hello);
    let r = await this.send(`USER ${user || 'anonymous'}`);
    if (r.code === 331 || r.code === 332) r = await this.send(`PASS ${password || ''}`);
    if (r.code !== 230 && r.code !== 202) throw new FtpError('EACCES', `Login failed: ${r.code} ${r.text}`);
    try {
      const f = await this.send('FEAT');
      if (f.code === 211) for (const l of f.text.split('\n').slice(1)) { const k = l.trim().split(/\s+/)[0]; if (k) this.features.add(k.toUpperCase()); }
    } catch (e) { if (this.closed) throw e; }
    if (this.features.has('UTF8')) { try { await this.send('OPTS UTF8 ON'); } catch (e) { if (this.closed) throw e; } }
  }

  async setType(mode) {
    const t = mode === 'ascii' ? 'A' : 'I';
    if (this.type === t) return;
    await this.cmd(`TYPE ${t}`);
    this.type = t;
  }

  async pwd() {
    const r = await this.cmd('PWD', [257]);
    return parse257(r.text) || '/';
  }

  /** Opens a passive data connection: { host, port } from EPSV or PASV. */
  async passive() {
    const order = this.pasvFirst ? ['PASV', 'EPSV'] : ['EPSV', 'PASV'];
    let last = null;
    for (const how of order) {
      const r = await this.send(how);
      if (how === 'PASV' && r.code === 227) {
        const m = /(\d+),(\d+),(\d+),(\d+),(\d+),(\d+)/.exec(r.text);
        if (!m) { last = r; continue; }
        let ip = `${m[1]}.${m[2]}.${m[3]}.${m[4]}`;
        const peer = (this.socket.remoteAddress || '').replace(/^::ffff:/, '');
        // Servers behind NAT announce an address the client cannot reach: use the control peer's.
        if (ip === '0.0.0.0' || (isPrivateV4(ip) && net.isIPv4(peer) && !isPrivateV4(peer))) ip = peer || this.host;
        this.pasvFirst = true;
        return { host: ip, port: Number(m[5]) * 256 + Number(m[6]) };
      }
      if (how === 'EPSV' && r.code === 229) {
        const m = /\((.)\1\1(\d+)\1\)/.exec(r.text);
        if (!m) { last = r; continue; }
        this.pasvFirst = false;
        return { host: (this.socket.remoteAddress || this.host).replace(/^::ffff:/, ''), port: Number(m[2]) };
      }
      last = r;
    }
    throw replyError('PASV', last);
  }

  /** Opens the data socket, sends `command`; → { socket, done } where done resolves with the final reply. */
  async transfer(command, { upload = null } = {}) {
    const addr = await this.passive();
    const data = await new Promise((resolve, reject) => {
      const s = net.connect({ host: addr.host, port: addr.port });
      const timer = setTimeout(() => { s.destroy(); reject(new FtpError('ETIMEDOUT', 'The data connection timed out.')); }, this.timeoutMs);
      s.once('error', (e) => { clearTimeout(timer); reject(new FtpError('ECONNREFUSED', `Data connection failed (${e.message}).`)); });
      s.once('connect', () => { clearTimeout(timer); resolve(s); });
    });
    const chunks = [];
    let dataErr = null;
    const ended = new Promise((resolve) => {
      data.on('data', (c) => chunks.push(c));
      data.on('error', (e) => { dataErr = e; });
      data.on('close', resolve);
    });
    data.setTimeout(this.timeoutMs * 4, () => { dataErr = new Error('The data connection stalled.'); data.destroy(); });
    let first;
    try { first = await this.send(command); } catch (e) { data.destroy(); throw e; }
    if (first.code >= 400) { data.destroy(); throw replyError(command, first); }
    if (upload) data.end(upload); else if (first.code < 200) { /* wait for the data */ }
    await ended;
    const final = first.code >= 100 && first.code < 200 ? await this.read() : first;
    if (final.code >= 400) throw replyError(command, final);
    if (dataErr) throw new FtpError('EIO', `Transfer failed: ${dataErr.message}`);
    return Buffer.concat(chunks);
  }

  async list(path) {
    await this.setType('ascii');
    const arg = path ? ` ${path}` : '';
    if (this.features.has('MLST')) {
      const body = await this.transfer(`MLSD${arg}`);
      return body.toString('utf8').split(/\r?\n/).map((l) => parseMlsdLine(l)).filter(Boolean);
    }
    const body = await this.transfer(`LIST${arg}`);
    const now = new Date();
    return body.toString('utf8').split(/\r?\n/).map((l) => parseListLine(l, now)).filter(Boolean);
  }

  async quit() {
    if (this.closed) return;
    try { await Promise.race([this.send('QUIT'), new Promise((r) => setTimeout(r, 2000))]); } catch { /* closing anyway */ }
    this.destroy();
  }
}

function replyError(what, r) {
  if (!r) return new FtpError('EIO', `${what}: no reply.`);
  const code = r.code === 550 || r.code === 450 ? 'ENOENT' : r.code === 530 ? 'EACCES' : r.code === 553 ? 'EINVAL' : 'EFTP';
  return new FtpError(code, `${r.code} ${r.text.split('\n').pop() || r.text}`.trim());
}

const bodyOf = (b64) => Buffer.from(String(b64 || ''), 'base64');

/**
 * The session table and the operations. opts: { idleMs (default 10 min),
 * timeoutMs (per reply, default 30 s), maxSessions (default 32) }.
 */
export function createFtpClient({ idleMs = 10 * 60 * 1000, timeoutMs = 30000, maxSessions = 32 } = {}) {
  const sessions = new Map(); // id → { conn, timer, queue }

  const touch = (id, s) => {
    clearTimeout(s.timer);
    s.timer = setTimeout(() => { sessions.delete(id); s.conn.quit(); }, idleMs);
    if (s.timer.unref) s.timer.unref();
  };
  const get = (id) => {
    const s = sessions.get(String(id));
    if (!s) throw new FtpError('ENOENT', 'The FTP session is closed or timed out.');
    return s;
  };
  /** Runs fn(conn) after the session's earlier operations. */
  const run = (id, fn) => {
    let s;
    try { s = get(id); } catch (e) { return Promise.reject(e); }
    touch(String(id), s);
    const p = s.queue.then(() => fn(s.conn));
    s.queue = p.catch(() => {});
    return p;
  };
  const need = (v, what) => { if (v == null || v === '') throw new FtpError('EINVAL', `Missing "${what}".`); return String(v); };

  const ops = {
    async open({ host, port = 21, user = 'anonymous', password = '' } = {}) {
      need(host, 'host');
      if (sessions.size >= maxSessions) throw new FtpError('EMFILE', 'Too many open FTP sessions.');
      const conn = new FtpConnection({ timeoutMs });
      try {
        await conn.connect(String(host), Number(port) || 21);
        await conn.login(String(user ?? 'anonymous'), String(password ?? ''));
        await conn.setType('binary');
        const path = await conn.pwd().catch(() => '/');
        const id = crypto.randomUUID();
        const s = { conn, timer: null, queue: Promise.resolve() };
        sessions.set(id, s);
        conn.onClosed = () => { if (sessions.get(id) === s) { clearTimeout(s.timer); sessions.delete(id); } };
        touch(id, s);
        return { session: id, path };
      } catch (e) { conn.destroy(); throw e; }
    },
    async close({ session } = {}) {
      const s = sessions.get(String(session));
      if (s) { sessions.delete(String(session)); clearTimeout(s.timer); await s.queue; await s.conn.quit(); }
      return { ok: true };
    },
    pwd: ({ session } = {}) => run(session, async (c) => ({ path: await c.pwd() })),
    cd: ({ session, path } = {}) => run(session, async (c) => { await c.cmd(`CWD ${need(path, 'path')}`); return { path: await c.pwd() }; }),
    list: ({ session, path } = {}) => run(session, async (c) => ({ entries: await c.list(path ? String(path) : '') })),
    get: ({ session, path, mode } = {}) => run(session, async (c) => {
      await c.setType(mode);
      const body = await c.transfer(`RETR ${need(path, 'path')}`);
      return { bodyBase64: body.toString('base64') };
    }),
    put: ({ session, path, bodyBase64, mode } = {}) => run(session, async (c) => {
      await c.setType(mode);
      await c.transfer(`STOR ${need(path, 'path')}`, { upload: bodyOf(bodyBase64) });
      return { ok: true };
    }),
    delete: ({ session, path } = {}) => run(session, async (c) => { await c.cmd(`DELE ${need(path, 'path')}`); return { ok: true }; }),
    mkdir: ({ session, path } = {}) => run(session, async (c) => { await c.cmd(`MKD ${need(path, 'path')}`); return { ok: true }; }),
    rmdir: ({ session, path } = {}) => run(session, async (c) => { await c.cmd(`RMD ${need(path, 'path')}`); return { ok: true }; }),
    rename: ({ session, from, to } = {}) => run(session, async (c) => {
      await c.cmd(`RNFR ${need(from, 'from')}`, [350]);
      await c.cmd(`RNTO ${need(to, 'to')}`);
      return { ok: true };
    }),
  };

  /** Closes every session (server shutdown, tests). */
  async function closeAll() { await Promise.all([...sessions.keys()].map((id) => ops.close({ session: id }))); }

  return { ops, closeAll, get size() { return sessions.size; } };
}
