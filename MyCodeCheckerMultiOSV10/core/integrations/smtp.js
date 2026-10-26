'use strict';

// SMTP client on net / tls (RFC 5321): EHLO (HELO fallback), STARTTLS
// (RFC 3207, the plain socket is upgraded with tls.connect({ socket })),
// implicit TLS (port 465), AUTH PLAIN / LOGIN (RFC 4954), MAIL FROM /
// RCPT TO / DATA with dot-stuffing, and a MIME builder: multipart/alternative
// text + html, multipart/mixed for attachments, RFC 2047 B-encoded UTF-8
// headers, base64 bodies wrapped at 76 columns.

const net = require('net');
const tls = require('tls');
const os = require('os');
const crypto = require('crypto');

const DEFAULT_TIMEOUT = 20000;

class SmtpError extends Error {
  /** @param {string} message @param {{code?:string, smtpCode?:number|null, response?:string, command?:string, text?:{en:string,ko:string}}} info */
  constructor(message, info = {}) {
    super(message);
    this.name = 'SmtpError';
    this.code = info.code || 'SMTP';
    this.smtpCode = info.smtpCode == null ? null : info.smtpCode;
    this.response = info.response || '';
    this.command = info.command || '';
    this.text = info.text || { en: message, ko: message };
  }
}

// ---------------------------------------------------------------------------
// MIME helpers

const ASCII_SAFE = /^[\x20-\x7e]*$/;

/** RFC 2047 B-encoding of a header value when it is not plain ASCII. Words stay ≤ 75 chars and never split a character. */
function encodeWord(value) {
  const s = String(value == null ? '' : value);
  if (ASCII_SAFE.test(s)) return s;
  const words = [];
  let cur = [];
  let bytes = 0;
  for (const ch of s) {
    const b = Buffer.byteLength(ch, 'utf8');
    if (bytes + b > 45 && cur.length) { words.push(cur.join('')); cur = []; bytes = 0; }
    cur.push(ch);
    bytes += b;
  }
  if (cur.length) words.push(cur.join(''));
  return words.map((w) => `=?UTF-8?B?${Buffer.from(w, 'utf8').toString('base64')}?=`).join('\r\n ');
}

/** Decode RFC 2047 words (B and Q), for tests and for logs. */
function decodeWords(value) {
  return String(value || '').replace(/\?=\s+=\?/g, '?==?').replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_, cs, enc, data) => {
    if (enc.toUpperCase() === 'B') return Buffer.from(data, 'base64').toString('utf8');
    return Buffer.from(data.replace(/_/g, ' ').replace(/=([0-9A-Fa-f]{2})/g, (m, h) => String.fromCharCode(parseInt(h, 16))), 'latin1').toString('utf8');
  });
}

/** Parse 'Name <a@b>', 'a@b' or {name, address} into {name, address}. */
function parseAddress(input) {
  if (!input) return null;
  if (typeof input === 'object') return input.address ? { name: input.name || '', address: String(input.address).trim() } : null;
  const s = String(input).trim();
  const m = /^(.*)<([^<>]+)>\s*$/.exec(s);
  if (m) return { name: m[1].trim().replace(/^"(.*)"$/, '$1'), address: m[2].trim() };
  return { name: '', address: s };
}

function addressList(input) {
  if (!input) return [];
  const list = Array.isArray(input) ? input : typeof input === 'object' ? [input] : String(input).split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/);
  return list.map(parseAddress).filter((a) => a && a.address);
}

function validAddress(a) {
  return /^[^\s<>@]+@[^\s<>@]+$/.test(a) && !/[\r\n]/.test(a);
}

/** Format an address for a header, encoding a non-ASCII display name. */
function formatAddress(a) {
  if (!a.name) return a.address;
  const name = ASCII_SAFE.test(a.name) ? `"${a.name.replace(/["\\]/g, '\\$&')}"` : encodeWord(a.name);
  return `${name} <${a.address}>`;
}

function base64Lines(buf) {
  const b64 = (Buffer.isBuffer(buf) ? buf : Buffer.from(String(buf), 'utf8')).toString('base64');
  const out = [];
  for (let i = 0; i < b64.length; i += 76) out.push(b64.slice(i, i + 76));
  return out.join('\r\n');
}

function boundary(tag) {
  return `----=_mcc_${tag}_${crypto.randomBytes(12).toString('hex')}`;
}

function noCrlf(v) {
  return String(v == null ? '' : v).replace(/[\r\n]+/g, ' ');
}

function textPart(type, content) {
  return [`Content-Type: ${type}; charset=UTF-8`, 'Content-Transfer-Encoding: base64', '', base64Lines(String(content).replace(/\r?\n/g, '\r\n'))].join('\r\n');
}

function attachmentPart(att) {
  const filename = noCrlf(att.filename || 'attachment');
  const type = noCrlf(att.contentType || 'application/octet-stream');
  const enc = ASCII_SAFE.test(filename) ? `"${filename.replace(/["\\]/g, '\\$&')}"` : `"${encodeWord(filename).replace(/\r\n /g, ' ')}"`;
  const star = ASCII_SAFE.test(filename) ? '' : `; filename*=UTF-8''${encodeURIComponent(filename)}`;
  const content = Buffer.isBuffer(att.content) ? att.content : Buffer.from(String(att.content == null ? '' : att.content), att.encoding === 'base64' ? 'base64' : 'utf8');
  return [
    `Content-Type: ${type}; name=${enc}`,
    'Content-Transfer-Encoding: base64',
    `Content-Disposition: ${att.inline ? 'inline' : 'attachment'}; filename=${enc}${star}`,
    ...(att.cid ? [`Content-ID: <${noCrlf(att.cid)}>`] : []),
    '',
    base64Lines(content),
  ].join('\r\n');
}

function multipart(type, parts, tag) {
  const b = boundary(tag);
  return { head: `Content-Type: multipart/${type}; boundary="${b}"`, body: `${parts.map((p) => `--${b}\r\n${p}\r\n`).join('')}--${b}--` };
}

/**
 * Build an RFC 5322 message.
 * @param {{from?:any, to?:any, cc?:any, replyTo?:any, subject?:string, text?:string, html?:string,
 *   attachments?:{filename:string, content:Buffer|string, contentType?:string, encoding?:string, inline?:boolean, cid?:string}[],
 *   headers?:object, date?:Date, messageId?:string}} message
 * @returns {{data:string, messageId:string}}
 */
function buildMessage(message = {}) {
  const from = parseAddress(message.from);
  const domain = from && from.address.includes('@') ? from.address.split('@')[1] : 'localhost';
  const messageId = message.messageId || `<${Date.now().toString(36)}.${crypto.randomBytes(8).toString('hex')}@${domain}>`;
  const headers = [];
  if (from) headers.push(`From: ${formatAddress(from)}`);
  const to = addressList(message.to);
  const cc = addressList(message.cc);
  if (to.length) headers.push(`To: ${to.map(formatAddress).join(', ')}`);
  if (cc.length) headers.push(`Cc: ${cc.map(formatAddress).join(', ')}`);
  const reply = addressList(message.replyTo);
  if (reply.length) headers.push(`Reply-To: ${reply.map(formatAddress).join(', ')}`);
  headers.push(`Subject: ${encodeWord(noCrlf(message.subject || ''))}`);
  headers.push(`Date: ${(message.date || new Date()).toUTCString().replace('GMT', '+0000')}`);
  headers.push(`Message-ID: ${messageId}`);
  headers.push('MIME-Version: 1.0');
  for (const [k, v] of Object.entries(message.headers || {})) {
    if (!/^[A-Za-z0-9-]+$/.test(k)) continue;
    headers.push(`${k}: ${encodeWord(noCrlf(v))}`);
  }
  const hasText = message.text != null && message.text !== '';
  const hasHtml = message.html != null && message.html !== '';
  let content;
  if (hasText && hasHtml) {
    const alt = multipart('alternative', [textPart('text/plain', message.text), textPart('text/html', message.html)], 'alt');
    content = `${alt.head}\r\n\r\n${alt.body}`;
  } else if (hasHtml) content = textPart('text/html', message.html);
  else content = textPart('text/plain', message.text || '');
  const atts = message.attachments || [];
  let body;
  if (atts.length) {
    const mixed = multipart('mixed', [content, ...atts.map(attachmentPart)], 'mix');
    body = `${mixed.head}\r\n\r\n${mixed.body}`;
  } else body = content;
  return { data: `${headers.join('\r\n')}\r\n${body}\r\n`, messageId };
}

/** Normalize to CRLF and double every leading dot (RFC 5321 4.5.2). */
function dotStuff(data) {
  return String(data).replace(/\r?\n/g, '\r\n').split('\r\n').map((l) => (l.startsWith('.') ? `.${l}` : l)).join('\r\n');
}

// ---------------------------------------------------------------------------
// Connection

class Session {
  constructor(socket, timeoutMs) {
    this.timeoutMs = timeoutMs;
    this.buf = '';
    this.cur = [];
    this.queue = [];
    this.waiters = [];
    this.error = null;
    this.onData = (chunk) => this.feed(chunk);
    this.onError = (err) => this.fail(new SmtpError(`Connection error: ${err.message}`, { code: err.code === 'ECONNREFUSED' ? 'ECONNREFUSED' : 'CONNECTION', text: { en: `The mail server connection failed: ${err.message}`, ko: `메일 서버 연결에 실패했습니다: ${err.message}` } }));
    this.onClose = () => this.fail(new SmtpError('The server closed the connection', { code: 'CLOSED', text: { en: 'The mail server closed the connection.', ko: '메일 서버가 연결을 닫았습니다.' } }));
    this.attach(socket);
  }

  attach(socket) {
    this.socket = socket;
    socket.on('data', this.onData);
    socket.on('error', this.onError);
    socket.on('close', this.onClose);
  }

  detach() {
    const s = this.socket;
    s.removeListener('data', this.onData);
    s.removeListener('error', this.onError);
    s.removeListener('close', this.onClose);
    return s;
  }

  feed(chunk) {
    this.buf += chunk.toString('utf8');
    let i;
    while ((i = this.buf.indexOf('\n')) >= 0) {
      const line = this.buf.slice(0, i).replace(/\r$/, '');
      this.buf = this.buf.slice(i + 1);
      const code = parseInt(line.slice(0, 3), 10);
      this.cur.push(line.slice(4));
      if (line[3] !== '-') {
        const res = { code: Number.isFinite(code) ? code : 0, lines: this.cur, text: `${line.slice(0, 3)} ${this.cur.join(' | ')}` };
        this.cur = [];
        const w = this.waiters.shift();
        if (w) w.resolve(res); else this.queue.push(res);
      }
    }
  }

  fail(err) {
    if (!this.error) this.error = err;
    while (this.waiters.length) this.waiters.shift().reject(this.error);
  }

  read(command) {
    if (this.queue.length) return Promise.resolve(this.queue.shift());
    if (this.error) return Promise.reject(this.error);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.waiters.indexOf(w);
        if (idx >= 0) this.waiters.splice(idx, 1);
        reject(new SmtpError(`Timed out waiting for the server${command ? ` after ${command}` : ''}`, { code: 'TIMEOUT', command, text: { en: `The mail server did not answer within ${this.timeoutMs} ms.`, ko: `메일 서버가 ${this.timeoutMs} ms 안에 응답하지 않았습니다.` } }));
      }, this.timeoutMs);
      const w = { resolve: (r) => { clearTimeout(timer); resolve(r); }, reject: (e) => { clearTimeout(timer); reject(e); } };
      this.waiters.push(w);
    });
  }

  write(line) {
    if (this.error) throw this.error;
    this.socket.write(line);
  }

  /** Send a command and require one of the expected reply codes. `shown` replaces the command in errors (AUTH data). */
  async cmd(line, expect, shown) {
    const label = shown || line.split(' ')[0];
    if (line != null) this.write(`${line}\r\n`);
    const res = await this.read(label);
    if (!expect.includes(res.code)) throw replyError(label, res);
    return res;
  }

  close() {
    try { this.detach(); } catch { /* already gone */ }
    this.socket.on('error', () => {});
    try { this.socket.end(); } catch { /* ignore */ }
    try { this.socket.destroy(); } catch { /* ignore */ }
  }
}

function replyError(command, res) {
  const auth = /^AUTH/.test(command) || res.code === 535 || res.code === 534;
  const text = auth
    ? { en: `The mail server rejected the login (${res.code}).`, ko: `메일 서버가 로그인을 거부했습니다 (${res.code}).` }
    : { en: `The mail server rejected ${command}: ${res.text}`, ko: `메일 서버가 ${command} 명령을 거부했습니다: ${res.text}` };
  return new SmtpError(`${command} failed: ${res.text}`, { code: auth ? 'EAUTH' : 'EREPLY', smtpCode: res.code, response: res.text, command, text });
}

function connectSocket(config, timeoutMs) {
  return new Promise((resolve, reject) => {
    const host = config.host || 'localhost';
    const secure = config.secure || (Number(config.port) === 465 ? 'tls' : 'none');
    const port = Number(config.port) || (secure === 'tls' ? 465 : secure === 'starttls' ? 587 : 25);
    let sock;
    const timer = setTimeout(() => {
      if (sock) sock.destroy();
      reject(new SmtpError(`Connection to ${host}:${port} timed out`, { code: 'TIMEOUT', text: { en: `Could not connect to ${host}:${port} within ${timeoutMs} ms.`, ko: `${timeoutMs} ms 안에 ${host}:${port}에 연결하지 못했습니다.` } }));
    }, timeoutMs);
    const onErr = (err) => {
      clearTimeout(timer);
      reject(new SmtpError(`Cannot connect to ${host}:${port}: ${err.message}`, { code: err.code || 'CONNECTION', text: { en: `Cannot connect to the mail server ${host}:${port}: ${err.message}`, ko: `메일 서버 ${host}:${port}에 연결할 수 없습니다: ${err.message}` } }));
    };
    if (secure === 'tls') {
      sock = tls.connect({ host, port, servername: net.isIP(host) ? undefined : host, rejectUnauthorized: config.rejectUnauthorized !== false, ca: config.ca }, () => { clearTimeout(timer); sock.removeListener('error', onErr); resolve(sock); });
    } else {
      sock = net.connect({ host, port }, () => { clearTimeout(timer); sock.removeListener('error', onErr); resolve(sock); });
    }
    sock.once('error', onErr);
  });
}

function upgrade(session, config, timeoutMs) {
  const plain = session.detach();
  plain.on('error', () => {});
  return new Promise((resolve, reject) => {
    const host = config.host || 'localhost';
    const timer = setTimeout(() => { secure.destroy(); reject(new SmtpError('TLS handshake timed out', { code: 'TIMEOUT', text: { en: 'The TLS handshake timed out.', ko: 'TLS 핸드셰이크 시간이 초과되었습니다.' } })); }, timeoutMs);
    const secure = tls.connect({ socket: plain, servername: net.isIP(host) ? undefined : host, rejectUnauthorized: config.rejectUnauthorized !== false, ca: config.ca }, () => {
      clearTimeout(timer);
      secure.removeListener('error', onErr);
      session.attach(secure);
      resolve();
    });
    const onErr = (err) => { clearTimeout(timer); reject(new SmtpError(`TLS failed: ${err.message}`, { code: 'ETLS', text: { en: `The secure connection failed: ${err.message}`, ko: `보안 연결에 실패했습니다: ${err.message}` } })); };
    secure.once('error', onErr);
  });
}

function parseEhlo(res) {
  const ext = {};
  for (const l of res.lines.slice(1)) {
    const [k, ...rest] = l.trim().split(/\s+/);
    if (k) ext[k.toUpperCase()] = rest.join(' ');
  }
  return ext;
}

async function greet(session, name) {
  try {
    const res = await session.cmd(`EHLO ${name}`, [250]);
    return parseEhlo(res);
  } catch (err) {
    if (err.smtpCode == null || err.smtpCode < 500) throw err;
    await session.cmd(`HELO ${name}`, [250]);
    return {};
  }
}

async function authenticate(session, ext, config) {
  if (!config.user) return null;
  if (config.pass == null || config.pass === '') throw new SmtpError('A user is set but the password is empty', { code: 'EAUTH', text: { en: 'The SMTP password is empty.', ko: 'SMTP 비밀번호가 비어 있습니다.' } });
  const offered = String(ext.AUTH || '').toUpperCase().split(/\s+/).filter(Boolean);
  let method = config.authMethod ? String(config.authMethod).toUpperCase() : offered.includes('PLAIN') ? 'PLAIN' : offered.includes('LOGIN') ? 'LOGIN' : offered.length ? null : 'PLAIN';
  if (!method || (offered.length && !offered.includes(method))) {
    throw new SmtpError(`No supported AUTH method (server offers: ${offered.join(' ') || 'none'})`, { code: 'EAUTH', text: { en: `The mail server offers no supported login method (${offered.join(' ') || 'none'}).`, ko: `메일 서버가 지원하는 로그인 방식을 제공하지 않습니다 (${offered.join(' ') || '없음'}).` } });
  }
  const b64 = (s) => Buffer.from(String(s), 'utf8').toString('base64');
  if (method === 'PLAIN') {
    await session.cmd(`AUTH PLAIN ${b64(`\0${config.user}\0${config.pass}`)}`, [235], 'AUTH PLAIN');
  } else if (method === 'LOGIN') {
    await session.cmd('AUTH LOGIN', [334], 'AUTH LOGIN');
    await session.cmd(b64(config.user), [334], 'AUTH LOGIN (user)');
    await session.cmd(b64(config.pass), [235], 'AUTH LOGIN (password)');
  } else {
    throw new SmtpError(`Unsupported AUTH method ${method}`, { code: 'EAUTH', text: { en: `The login method ${method} is not supported.`, ko: `${method} 로그인 방식은 지원하지 않습니다.` } });
  }
  return method;
}

/** Open, greet, STARTTLS when asked, and log in. */
async function open(config) {
  const timeoutMs = Number(config.timeoutMs) || DEFAULT_TIMEOUT;
  const secure = config.secure || (Number(config.port) === 465 ? 'tls' : 'none');
  if (!['tls', 'starttls', 'none'].includes(secure)) throw new SmtpError(`Unknown secure mode ${secure}`, { code: 'ECONFIG', text: { en: `Unknown security mode: ${secure}`, ko: `알 수 없는 보안 방식입니다: ${secure}` } });
  const socket = await connectSocket({ ...config, secure }, timeoutMs);
  const session = new Session(socket, timeoutMs);
  try {
    await session.cmd(null, [220], 'greeting');
    const name = config.name || os.hostname() || 'localhost';
    let ext = await greet(session, name);
    let tlsActive = secure === 'tls';
    if (secure === 'starttls') {
      if (!('STARTTLS' in ext)) throw new SmtpError('The server does not offer STARTTLS', { code: 'ETLS', text: { en: 'The mail server does not support STARTTLS.', ko: '메일 서버가 STARTTLS를 지원하지 않습니다.' } });
      await session.cmd('STARTTLS', [220]);
      await upgrade(session, config, timeoutMs);
      tlsActive = true;
      ext = await greet(session, name);
    }
    if (config.user && config.requireTLS && !tlsActive) throw new SmtpError('Refusing to send the password without TLS', { code: 'ETLS', text: { en: 'The password is not sent over an unencrypted connection.', ko: '암호화되지 않은 연결로는 비밀번호를 보내지 않습니다.' } });
    const auth = await authenticate(session, ext, config);
    return { session, ext, tls: tlsActive, auth };
  } catch (err) {
    session.close();
    throw err;
  }
}

async function quit(session) {
  try { await session.cmd('QUIT', [221]); } catch { /* the server may just close */ }
  session.close();
}

/**
 * Send one message.
 * @param {{host:string, port?:number, secure?:'tls'|'starttls'|'none', user?:string, pass?:string, from?:string,
 *   rejectUnauthorized?:boolean, ca?:string|Buffer, name?:string, timeoutMs?:number, authMethod?:'PLAIN'|'LOGIN', requireTLS?:boolean}} config
 * @param {{from?:any, to?:any, cc?:any, bcc?:any, replyTo?:any, subject?:string, text?:string, html?:string, attachments?:object[], headers?:object, raw?:string}} message
 *   `raw` sends a prebuilt RFC 5322 message as is (envelope from config/message, recipients from to/cc/bcc).
 * @returns {Promise<{messageId:string|null, accepted:string[], rejected:string[], response:string, tls:boolean, auth:string|null}>}
 */
async function sendMail(config = {}, message = {}) {
  const fromAddr = parseAddress(message.from || config.from);
  if (!fromAddr || !validAddress(fromAddr.address)) throw new SmtpError('A valid sender address is required', { code: 'EENVELOPE', text: { en: 'Set a valid sender (From) address.', ko: '올바른 보낸 사람(From) 주소를 설정하십시오.' } });
  const rcpts = [...addressList(message.to), ...addressList(message.cc), ...addressList(message.bcc)].map((a) => a.address);
  const unique = [...new Set(rcpts)];
  if (!unique.length) throw new SmtpError('No recipients', { code: 'EENVELOPE', text: { en: 'The message has no recipients.', ko: '받는 사람이 없습니다.' } });
  const bad = unique.find((a) => !validAddress(a));
  if (bad) throw new SmtpError(`Invalid recipient address: ${bad}`, { code: 'EENVELOPE', text: { en: `The recipient address is not valid: ${bad}`, ko: `받는 사람 주소가 올바르지 않습니다: ${bad}` } });
  let built;
  if (message.raw != null) built = { data: String(message.raw), messageId: null };
  else built = buildMessage({ ...message, from: message.from || config.from });
  const { session, tls: tlsActive, auth } = await open(config);
  try {
    await session.cmd(`MAIL FROM:<${fromAddr.address}>`, [250], 'MAIL FROM');
    const accepted = [];
    const rejected = [];
    for (const r of unique) {
      try { await session.cmd(`RCPT TO:<${r}>`, [250, 251], 'RCPT TO'); accepted.push(r); } catch (err) {
        if (err.smtpCode == null) throw err;
        rejected.push(r);
      }
    }
    if (!accepted.length) throw new SmtpError(`All recipients were rejected: ${rejected.join(', ')}`, { code: 'EENVELOPE', text: { en: `The mail server rejected every recipient: ${rejected.join(', ')}`, ko: `메일 서버가 모든 받는 사람을 거부했습니다: ${rejected.join(', ')}` } });
    await session.cmd('DATA', [354]);
    let data = dotStuff(built.data);
    if (!data.endsWith('\r\n')) data += '\r\n';
    session.write(`${data}.\r\n`);
    const res = await session.cmd(null, [250], 'DATA (message)');
    await quit(session);
    return { messageId: built.messageId, accepted, rejected, response: res.text, tls: tlsActive, auth };
  } catch (err) {
    session.close();
    throw err;
  }
}

/** Connect, greet, TLS and log in, then QUIT: the "test connection" button. */
async function verify(config = {}) {
  const { session, ext, tls: tlsActive, auth } = await open(config);
  await quit(session);
  return { ok: true, tls: tlsActive, auth, extensions: Object.keys(ext) };
}

module.exports = { sendMail, verify, buildMessage, dotStuff, encodeWord, decodeWords, parseAddress, addressList, formatAddress, SmtpError };
