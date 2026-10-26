'use strict';

// Minimal LDAP v3 client (RFC 4511) on net / tls with its own BER codec:
// simple bind, search (RFC 4515 filters: & | ! = =* substrings >= <= ~=),
// unbind, StartTLS (extended operation 1.3.6.1.4.1.1466.20037) and LDAPS.
// authenticate() does what the reference LDAP plugin does: service-account bind,
// search the user, bind as the found DN with the password, read groups.
//
// An empty password is never sent: a simple bind with an empty password is an
// unauthenticated (anonymous) bind that many servers accept (RFC 4513 5.1.2).

const net = require('net');
const tls = require('tls');

const STARTTLS_OID = '1.3.6.1.4.1.1466.20037';
const DEFAULT_USER_FILTER = '(|(uid={login})(sAMAccountName={login})(mail={login}))';
const RESULT = { success: 0, operationsError: 1, protocolError: 2, sizeLimitExceeded: 4, noSuchObject: 32, invalidCredentials: 49, insufficientAccessRights: 50, unwillingToPerform: 53 };
const RESULT_NAMES = Object.fromEntries(Object.entries(RESULT).map(([k, v]) => [v, k]));

// Protocol op tags (APPLICATION class).
const OP = {
  bindRequest: 0x60, bindResponse: 0x61, unbindRequest: 0x42, searchRequest: 0x63, searchResultEntry: 0x64,
  searchResultDone: 0x65, searchResultReference: 0x73, extendedRequest: 0x77, extendedResponse: 0x78,
};

class LdapError extends Error {
  /** @param {string} message @param {{code?:string, resultCode?:number|null, diagnostic?:string, text?:{en:string,ko:string}}} info */
  constructor(message, info = {}) {
    super(message);
    this.name = 'LdapError';
    this.code = info.code || 'LDAP';
    this.resultCode = info.resultCode == null ? null : info.resultCode;
    this.diagnostic = info.diagnostic || '';
    this.text = info.text || { en: message, ko: message };
  }
}

// ---------------------------------------------------------------------------
// BER

function encLen(n) {
  if (n < 0x80) return Buffer.from([n]);
  const bytes = [];
  while (n > 0) { bytes.unshift(n & 0xff); n = Math.floor(n / 256); }
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}

function tlv(tag, content) {
  const body = Buffer.isBuffer(content) ? content : Buffer.concat(content);
  return Buffer.concat([Buffer.from([tag]), encLen(body.length), body]);
}

function int(n, tag = 0x02) {
  let v = Math.trunc(Number(n) || 0);
  const bytes = [];
  if (v >= 0) {
    do { bytes.unshift(v & 0xff); v = Math.floor(v / 256); } while (v > 0);
    if (bytes[0] & 0x80) bytes.unshift(0);
  } else {
    do { bytes.unshift(v & 0xff); v >>= 8; } while (v !== -1 || !(bytes[0] & 0x80));
  }
  return tlv(tag, Buffer.from(bytes));
}

function str(s, tag = 0x04) {
  return tlv(tag, Buffer.isBuffer(s) ? s : Buffer.from(String(s == null ? '' : s), 'utf8'));
}

function bool(b) {
  return tlv(0x01, Buffer.from([b ? 0xff : 0x00]));
}

/** Header of the TLV at `off`, or null when the buffer does not hold it entirely yet. */
function readHeader(buf, off = 0) {
  if (buf.length < off + 2) return null;
  const tag = buf[off];
  let len = buf[off + 1];
  let start = off + 2;
  if (len & 0x80) {
    const n = len & 0x7f;
    if (n === 0 || n > 4) throw new LdapError('Unsupported BER length', { code: 'EPROTO' });
    if (buf.length < start + n) return null;
    len = 0;
    for (let i = 0; i < n; i++) len = len * 256 + buf[start + i];
    start += n;
  }
  if (buf.length < start + len) return null;
  return { tag, start, end: start + len, constructed: !!(tag & 0x20) };
}

/** Decode one TLV (recursively for constructed types). */
function decode(buf, off = 0) {
  const h = readHeader(buf, off);
  if (!h) throw new LdapError('Truncated BER element', { code: 'EPROTO' });
  const node = { tag: h.tag, constructed: h.constructed, value: buf.subarray(h.start, h.end), end: h.end, children: null };
  if (h.constructed) {
    node.children = [];
    let p = h.start;
    while (p < h.end) { const c = decode(buf, p); node.children.push(c); p = c.end; }
  }
  return node;
}

function nodeStr(n) { return n ? n.value.toString('utf8') : ''; }

function nodeInt(n) {
  if (!n || !n.value.length) return 0;
  let v = n.value[0] & 0x80 ? -1 : 0;
  for (const b of n.value) v = v * 256 + b;
  return v;
}

const ber = { tlv, int, str, bool, encLen, readHeader, decode, nodeStr, nodeInt };

// ---------------------------------------------------------------------------
// Filters (RFC 4515)

/** Escape a value for use inside a filter: * ( ) \ NUL. */
function escapeFilterValue(v) {
  return String(v).replace(/[*()\\\0]/g, (c) => `\\${c.charCodeAt(0).toString(16).padStart(2, '0')}`);
}

function unescapeValue(s) {
  const parts = [];
  let lit = '';
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\' && /^[0-9a-fA-F]{2}$/.test(s.slice(i + 1, i + 3))) {
      if (lit) { parts.push(Buffer.from(lit, 'utf8')); lit = ''; }
      parts.push(Buffer.from([parseInt(s.slice(i + 1, i + 3), 16)]));
      i += 2;
    } else lit += s[i];
  }
  if (lit) parts.push(Buffer.from(lit, 'utf8'));
  return Buffer.concat(parts);
}

/** Parse a filter string into a tree: {type:'and'|'or'|'not'|'eq'|'ge'|'le'|'approx'|'present'|'substr', ...}. */
function parseFilter(input) {
  let s = String(input || '').trim();
  if (!s.startsWith('(')) s = `(${s})`;
  let pos = 0;
  const fail = (why) => { throw new LdapError(`Invalid LDAP filter at ${pos}: ${why}`, { code: 'EFILTER', text: { en: `The LDAP filter is not valid: ${input}`, ko: `LDAP 필터가 올바르지 않습니다: ${input}` } }); };
  function filter() {
    if (s[pos] !== '(') fail('expected (');
    pos++;
    let node;
    const c = s[pos];
    if (c === '&' || c === '|') {
      pos++;
      const list = [];
      while (s[pos] === '(') list.push(filter());
      if (!list.length) fail('empty list');
      node = { type: c === '&' ? 'and' : 'or', filters: list };
    } else if (c === '!') {
      pos++;
      node = { type: 'not', filter: filter() };
    } else {
      const close = findClose(pos);
      node = item(s.slice(pos, close));
      pos = close;
    }
    if (s[pos] !== ')') fail('expected )');
    pos++;
    return node;
  }
  function findClose(from) {
    for (let i = from; i < s.length; i++) {
      if (s[i] === '(') fail('unescaped (');
      if (s[i] === ')') return i;
    }
    return fail('missing )');
  }
  function item(t) {
    const m = /^([A-Za-z0-9][A-Za-z0-9.;-]*)(~=|>=|<=|=)(.*)$/s.exec(t);
    if (!m) fail(`bad item ${t}`);
    const [, attr, op, raw] = m;
    if (op === '=' && raw === '*') return { type: 'present', attr };
    if (op === '=' && raw.includes('*')) {
      const parts = raw.split('*');
      return { type: 'substr', attr, initial: parts[0] ? unescapeValue(parts[0]) : null, any: parts.slice(1, -1).filter(Boolean).map(unescapeValue), final: parts[parts.length - 1] ? unescapeValue(parts[parts.length - 1]) : null };
    }
    return { type: op === '=' ? 'eq' : op === '>=' ? 'ge' : op === '<=' ? 'le' : 'approx', attr, value: unescapeValue(raw) };
  }
  const tree = filter();
  if (pos !== s.length) fail('trailing characters');
  return tree;
}

/** BER-encode a filter (string or parsed tree). */
function encodeFilter(f) {
  const t = typeof f === 'string' ? parseFilter(f) : f;
  switch (t.type) {
    case 'and': return tlv(0xa0, t.filters.map(encodeFilter));
    case 'or': return tlv(0xa1, t.filters.map(encodeFilter));
    case 'not': return tlv(0xa2, [encodeFilter(t.filter)]);
    case 'eq': return tlv(0xa3, [str(t.attr), str(t.value)]);
    case 'ge': return tlv(0xa5, [str(t.attr), str(t.value)]);
    case 'le': return tlv(0xa6, [str(t.attr), str(t.value)]);
    case 'approx': return tlv(0xa8, [str(t.attr), str(t.value)]);
    case 'present': return str(t.attr, 0x87);
    case 'substr': {
      const parts = [];
      if (t.initial) parts.push(str(t.initial, 0x80));
      for (const a of t.any || []) parts.push(str(a, 0x81));
      if (t.final) parts.push(str(t.final, 0x82));
      return tlv(0xa4, [str(t.attr), tlv(0x30, parts)]);
    }
    default: throw new LdapError(`Unknown filter type ${t.type}`, { code: 'EFILTER' });
  }
}

/** Decode a BER filter node back into the tree form (values as strings). Used by servers and tests. */
function decodeFilter(n) {
  const kids = n.children || [];
  switch (n.tag) {
    case 0xa0: return { type: 'and', filters: kids.map(decodeFilter) };
    case 0xa1: return { type: 'or', filters: kids.map(decodeFilter) };
    case 0xa2: return { type: 'not', filter: decodeFilter(kids[0]) };
    case 0xa3: return { type: 'eq', attr: nodeStr(kids[0]), value: nodeStr(kids[1]) };
    case 0xa5: return { type: 'ge', attr: nodeStr(kids[0]), value: nodeStr(kids[1]) };
    case 0xa6: return { type: 'le', attr: nodeStr(kids[0]), value: nodeStr(kids[1]) };
    case 0xa8: return { type: 'approx', attr: nodeStr(kids[0]), value: nodeStr(kids[1]) };
    case 0x87: return { type: 'present', attr: nodeStr(n) };
    case 0xa4: {
      const out = { type: 'substr', attr: nodeStr(kids[0]), initial: null, any: [], final: null };
      for (const p of (kids[1] && kids[1].children) || []) {
        if (p.tag === 0x80) out.initial = nodeStr(p); else if (p.tag === 0x81) out.any.push(nodeStr(p)); else if (p.tag === 0x82) out.final = nodeStr(p);
      }
      return out;
    }
    default: return { type: 'unknown', tag: n.tag };
  }
}

// ---------------------------------------------------------------------------
// Client

function parseUrl(config) {
  if (config.url) {
    const u = new URL(config.url);
    const secure = u.protocol === 'ldaps:';
    if (!secure && u.protocol !== 'ldap:') throw new LdapError(`Unsupported LDAP URL ${config.url}`, { code: 'ECONFIG', text: { en: `The LDAP URL must start with ldap:// or ldaps://: ${config.url}`, ko: `LDAP URL은 ldap:// 또는 ldaps://로 시작해야 합니다: ${config.url}` } });
    return { host: u.hostname.replace(/^\[|\]$/g, ''), port: Number(u.port) || (secure ? 636 : 389), secure };
  }
  const secure = !!config.ldaps || config.secure === 'tls';
  return { host: config.host || 'localhost', port: Number(config.port) || (secure ? 636 : 389), secure };
}

class LdapClient {
  constructor(socket, opts) {
    this.timeoutMs = opts.timeoutMs;
    this.opts = opts;
    this.nextId = 1;
    this.pending = new Map();
    this.buf = Buffer.alloc(0);
    this.closed = false;
    this.onData = (c) => this.feed(c);
    this.onError = (err) => this.failAll(new LdapError(`LDAP connection error: ${err.message}`, { code: err.code || 'CONNECTION', text: { en: `The LDAP connection failed: ${err.message}`, ko: `LDAP 연결에 실패했습니다: ${err.message}` } }));
    this.onClose = () => { this.closed = true; this.failAll(new LdapError('The LDAP server closed the connection', { code: 'CLOSED', text: { en: 'The LDAP server closed the connection.', ko: 'LDAP 서버가 연결을 닫았습니다.' } })); };
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
    s.on('error', () => {});
    return s;
  }

  failAll(err) {
    for (const p of this.pending.values()) p.reject(err);
    this.pending.clear();
  }

  feed(chunk) {
    this.buf = this.buf.length ? Buffer.concat([this.buf, chunk]) : chunk;
    for (;;) {
      let h;
      try { h = readHeader(this.buf, 0); } catch (err) { this.failAll(err); this.socket.destroy(); return; }
      if (!h) return;
      const msgBuf = this.buf.subarray(0, h.end);
      this.buf = this.buf.subarray(h.end);
      let msg;
      try { msg = decode(msgBuf); } catch (err) { this.failAll(err); this.socket.destroy(); return; }
      this.dispatch(msg);
    }
  }

  dispatch(msg) {
    const kids = msg.children || [];
    const id = nodeInt(kids[0]);
    const op = kids[1];
    if (!op) return;
    if (id === 0) {
      // Notice of disconnection.
      const r = readResult(op);
      this.failAll(new LdapError(`The LDAP server disconnected: ${r.diagnostic || RESULT_NAMES[r.code] || r.code}`, { code: 'CLOSED', resultCode: r.code, diagnostic: r.diagnostic }));
      return;
    }
    const p = this.pending.get(id);
    if (!p) return;
    if (op.tag === OP.searchResultEntry) { p.entries.push(readEntry(op)); return; }
    if (op.tag === OP.searchResultReference) { p.references.push(...(op.children || []).map(nodeStr)); return; }
    this.pending.delete(id);
    p.resolve({ op, result: readResult(op), entries: p.entries, references: p.references });
  }

  send(op) {
    if (this.closed) return Promise.reject(new LdapError('The LDAP connection is closed', { code: 'CLOSED', text: { en: 'The LDAP connection is closed.', ko: 'LDAP 연결이 닫혔습니다.' } }));
    const id = this.nextId++;
    const message = tlv(0x30, [int(id), op]);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        this.broken = true;
        reject(new LdapError(`LDAP operation timed out after ${this.timeoutMs} ms`, { code: 'TIMEOUT', text: { en: `The LDAP server did not answer within ${this.timeoutMs} ms.`, ko: `LDAP 서버가 ${this.timeoutMs} ms 안에 응답하지 않았습니다.` } }));
      }, this.timeoutMs);
      this.pending.set(id, {
        entries: [], references: [],
        resolve: (v) => { clearTimeout(timer); resolve(v); },
        reject: (e) => { clearTimeout(timer); reject(e); },
      });
      this.socket.write(message);
    });
  }

  /**
   * Simple bind. Resolves { code, diagnostic }; result code 49 means wrong credentials.
   * Rejects an empty password without sending anything (that would be an anonymous bind).
   */
  async bind(dn, password) {
    if (typeof password !== 'string' || password === '') {
      throw new LdapError('Refusing an LDAP bind with an empty password', { code: 'EMPTY_PASSWORD', text: { en: 'An empty password is not allowed.', ko: '빈 비밀번호는 허용하지 않습니다.' } });
    }
    const op = tlv(OP.bindRequest, [int(3), str(dn || ''), str(password, 0x80)]);
    const { result } = await this.send(op);
    return result;
  }

  /**
   * Search.
   * @param {string} base
   * @param {{scope?:'base'|'one'|'sub', filter?:string, attributes?:string[], sizeLimit?:number, timeLimit?:number}} [o]
   * @returns {Promise<{code:number, diagnostic:string, entries:{dn:string, attributes:Object<string,string[]>}[], references:string[]}>}
   */
  async search(base, o = {}) {
    const scope = { base: 0, one: 1, sub: 2 }[o.scope || 'sub'];
    const op = tlv(OP.searchRequest, [
      str(base || ''), int(scope, 0x0a), int(0, 0x0a), int(o.sizeLimit || 0), int(o.timeLimit || 0), bool(false),
      encodeFilter(o.filter || '(objectClass=*)'),
      tlv(0x30, (o.attributes || []).map((a) => str(a))),
    ]);
    const { result, entries, references } = await this.send(op);
    return { code: result.code, diagnostic: result.diagnostic, entries, references };
  }

  /** StartTLS extended operation, then upgrade the socket. */
  async startTls() {
    const { result } = await this.send(tlv(OP.extendedRequest, [str(STARTTLS_OID, 0x80)]));
    if (result.code !== 0) throw new LdapError(`StartTLS refused: ${result.diagnostic || RESULT_NAMES[result.code] || result.code}`, { code: 'ETLS', resultCode: result.code, text: { en: 'The LDAP server refused StartTLS.', ko: 'LDAP 서버가 StartTLS를 거부했습니다.' } });
    const plain = this.detach();
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { secure.destroy(); reject(new LdapError('TLS handshake timed out', { code: 'TIMEOUT', text: { en: 'The TLS handshake timed out.', ko: 'TLS 핸드셰이크 시간이 초과되었습니다.' } })); }, this.timeoutMs);
      const secure = tls.connect({ socket: plain, servername: net.isIP(this.opts.host) ? undefined : this.opts.host, rejectUnauthorized: this.opts.rejectUnauthorized !== false, ca: this.opts.ca }, () => {
        clearTimeout(timer);
        secure.removeListener('error', onErr);
        this.attach(secure);
        resolve();
      });
      const onErr = (err) => { clearTimeout(timer); reject(new LdapError(`TLS failed: ${err.message}`, { code: 'ETLS', text: { en: `The secure LDAP connection failed: ${err.message}`, ko: `보안 LDAP 연결에 실패했습니다: ${err.message}` } })); };
      secure.once('error', onErr);
    });
  }

  /** Unbind and close. Never throws. */
  async unbind() {
    if (this.closed) return;
    if (this.broken) { this.close(); return; }
    this.closed = true;
    let s;
    try { s = this.detach(); } catch { return; }
    // Graceful: the UnbindRequest is flushed before the FIN; wait (briefly) for the close.
    await new Promise((resolve) => {
      const timer = setTimeout(() => { try { s.destroy(); } catch { /* ignore */ } resolve(); }, 1000);
      s.once('close', () => { clearTimeout(timer); resolve(); });
      try { s.end(tlv(0x30, [int(this.nextId++), Buffer.from([OP.unbindRequest, 0x00])])); } catch { clearTimeout(timer); resolve(); }
    });
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    try { this.detach(); } catch { /* ignore */ }
    try { this.socket.end(); } catch { /* ignore */ }
    try { this.socket.destroy(); } catch { /* ignore */ }
  }
}

function readResult(op) {
  const k = op.children || [];
  return { code: nodeInt(k[0]), matchedDn: nodeStr(k[1]), diagnostic: nodeStr(k[2]) };
}

function readEntry(op) {
  const k = op.children || [];
  const attributes = {};
  for (const a of (k[1] && k[1].children) || []) {
    const name = nodeStr(a.children[0]);
    attributes[name] = ((a.children[1] && a.children[1].children) || []).map(nodeStr);
  }
  return { dn: nodeStr(k[0]), attributes };
}

/**
 * Open a connection (LDAPS when the URL is ldaps:// or config.ldaps; StartTLS when config.startTls).
 * @param {{url?:string, host?:string, port?:number, ldaps?:boolean, startTls?:boolean, timeoutMs?:number, rejectUnauthorized?:boolean, ca?:string|Buffer}} config
 * @returns {Promise<LdapClient>}
 */
function connect(config = {}) {
  const { host, port, secure } = parseUrl(config);
  const timeoutMs = Number(config.timeoutMs) || 10000;
  return new Promise((resolve, reject) => {
    let sock;
    const timer = setTimeout(() => { if (sock) sock.destroy(); reject(new LdapError(`Connection to ${host}:${port} timed out`, { code: 'TIMEOUT', text: { en: `Could not connect to the LDAP server ${host}:${port} within ${timeoutMs} ms.`, ko: `${timeoutMs} ms 안에 LDAP 서버 ${host}:${port}에 연결하지 못했습니다.` } })); }, timeoutMs);
    const onErr = (err) => { clearTimeout(timer); reject(new LdapError(`Cannot connect to ${host}:${port}: ${err.message}`, { code: err.code || 'CONNECTION', text: { en: `Cannot connect to the LDAP server ${host}:${port}: ${err.message}`, ko: `LDAP 서버 ${host}:${port}에 연결할 수 없습니다: ${err.message}` } })); };
    const done = async () => {
      clearTimeout(timer);
      sock.removeListener('error', onErr);
      const client = new LdapClient(sock, { timeoutMs, host, rejectUnauthorized: config.rejectUnauthorized, ca: config.ca });
      if (config.startTls && !secure) {
        try { await client.startTls(); } catch (err) { client.close(); reject(err); return; }
      }
      resolve(client);
    };
    if (secure) sock = tls.connect({ host, port, servername: net.isIP(host) ? undefined : host, rejectUnauthorized: config.rejectUnauthorized !== false, ca: config.ca }, done);
    else sock = net.connect({ host, port }, done);
    sock.once('error', onErr);
  });
}

/** Case-insensitive attribute read. */
function attr(entry, name) {
  if (!entry || !name) return [];
  const key = Object.keys(entry.attributes || {}).find((k) => k.toLowerCase() === String(name).toLowerCase());
  return key ? entry.attributes[key] : [];
}

/** First RDN value of a DN: 'cn=Devs,ou=groups,dc=x' -> 'Devs'. */
function rdnValue(dn) {
  const m = /^\s*[^=]+=((?:\\.|[^,+])*)/.exec(String(dn || ''));
  if (!m) return String(dn || '');
  return m[1].replace(/\\([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16))).replace(/\\(.)/g, '$1').trim();
}

function serviceBind(client, config) {
  if (config.bindDn) {
    if (!config.bindPassword) throw new LdapError('The service account password is empty', { code: 'ECONFIG', text: { en: 'The LDAP service account password is empty.', ko: 'LDAP 서비스 계정 비밀번호가 비어 있습니다.' } });
    return client.bind(config.bindDn, config.bindPassword).then((r) => {
      if (r.code !== 0) throw new LdapError(`Service account bind failed: ${r.diagnostic || RESULT_NAMES[r.code] || r.code}`, { code: 'ESERVICEBIND', resultCode: r.code, diagnostic: r.diagnostic, text: { en: 'The LDAP service account could not log in. Check the bind DN and password.', ko: 'LDAP 서비스 계정으로 로그인하지 못했습니다. 바인드 DN과 비밀번호를 확인하십시오.' } });
      return r;
    });
  }
  if (!config.allowAnonymousSearch) throw new LdapError('A bind DN is required', { code: 'ECONFIG', text: { en: 'Set the LDAP bind DN (service account).', ko: 'LDAP 바인드 DN(서비스 계정)을 설정하십시오.' } });
  return Promise.resolve({ code: 0 });
}

function searchError(r, what) {
  return new LdapError(`LDAP ${what} search failed: ${r.diagnostic || RESULT_NAMES[r.code] || r.code}`, { code: 'ESEARCH', resultCode: r.code, diagnostic: r.diagnostic, text: { en: `The LDAP ${what} search failed (${RESULT_NAMES[r.code] || r.code}).`, ko: `LDAP ${what === 'user' ? '사용자' : '그룹'} 검색에 실패했습니다 (${RESULT_NAMES[r.code] || r.code}).` } });
}

/**
 * Log a user in against LDAP / Active Directory.
 * @param {{url?:string, host?:string, port?:number, ldaps?:boolean, startTls?:boolean, bindDn?:string, bindPassword?:string,
 *   allowAnonymousSearch?:boolean, baseDn:string, userFilter?:string, nameAttr?:string, mailAttr?:string, loginAttr?:string,
 *   groupAttr?:string, groupSearch?:{baseDn:string, filter?:string, nameAttr?:string}, groupMap?:Object<string,string>,
 *   timeoutMs?:number, rejectUnauthorized?:boolean, ca?:string|Buffer}} config
 *   userFilter placeholders: {login}. groupSearch.filter placeholders: {dn}, {login} (both escaped).
 * @param {string} login
 * @param {string} password
 * @returns {Promise<{dn:string, login:string, name:string, email:string, groups:string[], groupDns:string[], mappedGroups:string[]}|null>}
 *   null for an unknown user, an ambiguous match, a wrong password or an empty password.
 *   Throws LdapError for configuration and connection problems.
 */
async function authenticate(config = {}, login, password) {
  if (typeof login !== 'string' || !login.trim()) return null;
  if (typeof password !== 'string' || password === '') return null;
  if (!config.baseDn) throw new LdapError('The base DN is required', { code: 'ECONFIG', text: { en: 'Set the LDAP base DN.', ko: 'LDAP 기본 DN을 설정하십시오.' } });
  const client = await connect(config);
  try {
    await serviceBind(client, config);
    const nameAttr = config.nameAttr || 'cn';
    const mailAttr = config.mailAttr || 'mail';
    const groupAttr = config.groupAttr || 'memberOf';
    const loginAttr = config.loginAttr || '';
    const filter = (config.userFilter || DEFAULT_USER_FILTER).split('{login}').join(escapeFilterValue(login.trim()));
    const found = await client.search(config.baseDn, { scope: 'sub', filter, attributes: [nameAttr, 'displayName', mailAttr, groupAttr, ...(loginAttr ? [loginAttr] : [])], sizeLimit: 2 });
    if (found.code !== 0 && found.code !== RESULT.sizeLimitExceeded && found.code !== RESULT.noSuchObject) throw searchError(found, 'user');
    if (found.entries.length !== 1) return null;
    const entry = found.entries[0];
    const userBind = await client.bind(entry.dn, password);
    if (userBind.code === RESULT.invalidCredentials || userBind.code === RESULT.unwillingToPerform || userBind.code === RESULT.insufficientAccessRights) return null;
    if (userBind.code !== 0) throw new LdapError(`User bind failed: ${userBind.diagnostic || RESULT_NAMES[userBind.code] || userBind.code}`, { code: 'EBIND', resultCode: userBind.code, diagnostic: userBind.diagnostic, text: { en: `The LDAP login failed (${RESULT_NAMES[userBind.code] || userBind.code}).`, ko: `LDAP 로그인에 실패했습니다 (${RESULT_NAMES[userBind.code] || userBind.code}).` } });
    let groupDns = attr(entry, groupAttr).slice();
    let groups = groupDns.map(rdnValue);
    if (config.groupSearch && config.groupSearch.baseDn) {
      if (config.bindDn) await serviceBind(client, config);
      const gf = (config.groupSearch.filter || '(|(member={dn})(uniqueMember={dn})(memberUid={login}))').split('{dn}').join(escapeFilterValue(entry.dn)).split('{login}').join(escapeFilterValue(login.trim()));
      const gName = config.groupSearch.nameAttr || 'cn';
      const g = await client.search(config.groupSearch.baseDn, { scope: 'sub', filter: gf, attributes: [gName] });
      if (g.code !== 0 && g.code !== RESULT.noSuchObject && g.code !== RESULT.sizeLimitExceeded) throw searchError(g, 'group');
      for (const e of g.entries) {
        if (groupDns.some((d) => d.toLowerCase() === e.dn.toLowerCase())) continue;
        groupDns.push(e.dn);
        groups.push(attr(e, gName)[0] || rdnValue(e.dn));
      }
    }
    groups = [...new Set(groups)];
    groupDns = [...new Set(groupDns)];
    let mappedGroups = groups;
    if (config.groupMap && Object.keys(config.groupMap).length) {
      const map = new Map(Object.entries(config.groupMap).map(([k, v]) => [k.toLowerCase(), v]));
      mappedGroups = [...new Set(groups.map((gname) => map.get(gname.toLowerCase())).filter(Boolean))];
    }
    return {
      dn: entry.dn,
      login: (loginAttr && attr(entry, loginAttr)[0]) || login.trim(),
      name: attr(entry, 'displayName')[0] || attr(entry, nameAttr)[0] || login.trim(),
      email: attr(entry, mailAttr)[0] || '',
      groups, groupDns, mappedGroups,
    };
  } finally {
    await client.unbind();
  }
}

/** Connect and bind with the service account: the "test connection" button. */
async function testConnection(config = {}) {
  const client = await connect(config);
  try {
    await serviceBind(client, config);
    return { ok: true };
  } finally {
    await client.unbind();
  }
}

module.exports = {
  authenticate, testConnection, connect, LdapClient, LdapError, ber, parseFilter, encodeFilter, decodeFilter,
  escapeFilterValue, rdnValue, attr, RESULT, OP, STARTTLS_OID, DEFAULT_USER_FILTER,
};
