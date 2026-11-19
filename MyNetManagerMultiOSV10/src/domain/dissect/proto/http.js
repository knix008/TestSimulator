// HTTP/1.x (requests, responses, chunked bodies, request/response matching, TCP framing),
// body media types (data-text-lines, json, png, urlencoded-form, media), SSDP and WebSocket.
import { registerProtocol, addToTable, getProtocol, u16, u32, hexStr, utf8, ascii, printable, NULLNODE } from '../core.js';

// ------------------------------------------------------------------------------------------
// byte-level helpers (no regexes per packet)

/** Offset just past the blank line that ends the header block, or -1. */
export function headerEnd(d, o, end) {
  for (let i = o; i < end; i++) {
    if (d[i] !== 10) continue;
    if (i + 1 < end && d[i + 1] === 10) return i + 2;
    if (i + 2 < end && d[i + 1] === 13 && d[i + 2] === 10) return i + 3;
  }
  return -1;
}
/** Next line: { s: start, e: end of text (before CR/LF), n: start of next line } or null. */
function line(d, o, end) {
  for (let i = o; i < end; i++) {
    if (d[i] === 10) return { s: o, e: i > o && d[i - 1] === 13 ? i - 1 : i, n: i + 1 };
  }
  return null;
}
const lower = (c) => (c >= 65 && c <= 90 ? c + 32 : c);
function startsWithCI(d, o, end, word) {
  if (o + word.length > end) return false;
  for (let i = 0; i < word.length; i++) if (lower(d[o + i]) !== word.charCodeAt(i)) return false;
  return true;
}
function startsWith(d, o, end, word) {
  if (o + word.length > end) return false;
  for (let i = 0; i < word.length; i++) if (d[o + i] !== word.charCodeAt(i)) return false;
  return true;
}
const METHODS = ['GET', 'POST', 'HEAD', 'PUT', 'DELETE', 'OPTIONS', 'PATCH', 'CONNECT', 'TRACE', 'PROPFIND', 'PROPPATCH', 'MKCOL', 'COPY', 'MOVE', 'LOCK', 'UNLOCK', 'NOTIFY', 'M-SEARCH', 'SUBSCRIBE', 'UNSUBSCRIBE', 'REPORT', 'SEARCH', 'PRI'];
/** 'request' | 'response' | null for the first line at o. */
export function httpKind(d, o, end) {
  if (startsWith(d, o, end, 'HTTP/1.') || startsWith(d, o, end, 'HTTP/2')) return 'response';
  for (const m of METHODS) if (startsWith(d, o, end, m) && o + m.length < end && d[o + m.length] === 32) return 'request';
  return null;
}
function str(d, s, e) { return utf8(d, s, e - s); }

/** Parse header lines in [o, hend). Returns [{ name, lname, value, s, e }]. */
function parseHeaders(d, o, hend) {
  const out = [];
  while (o < hend) {
    const l = line(d, o, hend);
    if (!l) break;
    if (l.e === l.s) break; // blank line
    let c = l.s;
    while (c < l.e && d[c] !== 58) c++;
    if (c < l.e) {
      const name = ascii(d, l.s, c - l.s);
      let v = c + 1;
      while (v < l.e && (d[v] === 32 || d[v] === 9)) v++;
      out.push({ name, lname: name.toLowerCase(), value: str(d, v, l.e), s: l.s, e: l.n, ve: l.e });
    }
    o = l.n;
  }
  return out;
}
function hval(hs, lname) { for (const h of hs) if (h.lname === lname) return h.value; return null; }

/** Body framing from headers. Returns { kind: 'length'|'chunked'|'none'|'close', len }. */
function bodyKind(hs, isResp, code, reqMethod) {
  if (isResp && ((code >= 100 && code < 200) || code === 204 || code === 304 || reqMethod === 'HEAD')) return { kind: 'none', len: 0 };
  const te = hval(hs, 'transfer-encoding');
  if (te && te.toLowerCase().includes('chunked')) return { kind: 'chunked', len: 0 };
  const cl = hval(hs, 'content-length');
  if (cl !== null) { const n = parseInt(cl, 10); return { kind: 'length', len: isNaN(n) || n < 0 ? 0 : n }; }
  return isResp ? { kind: 'close', len: 0 } : { kind: 'none', len: 0 };
}
/** Walk chunked encoding from o. Returns { end, chunks: [{ s, sizeEnd, ds, de, ce }], trailerEnd } or null if incomplete. */
function walkChunks(d, o, end) {
  const chunks = [];
  for (;;) {
    const l = line(d, o, end);
    if (!l) return null;
    let size = 0, i = l.s, any = false;
    for (; i < l.e; i++) {
      const c = d[i];
      const v = c >= 48 && c <= 57 ? c - 48 : c >= 97 && c <= 102 ? c - 87 : c >= 65 && c <= 70 ? c - 55 : -1;
      if (v < 0) break;
      size = size * 16 + v; any = true;
    }
    if (!any) return { bad: true, end: o, chunks };
    if (size === 0) {
      // trailer section ends with an empty line
      let t = l.n;
      for (;;) {
        const tl = line(d, t, end);
        if (!tl) return null;
        t = tl.n;
        if (tl.e === tl.s) break;
      }
      chunks.push({ s: l.s, sizeEnd: l.n, size: 0, ds: l.n, de: l.n, ce: l.n, last: true, te: t });
      return { end: t, chunks };
    }
    const ds = l.n, de = ds + size;
    if (de + 2 > end) return null;
    const ce = d[de] === 13 && d[de + 1] === 10 ? de + 2 : d[de] === 10 ? de + 1 : de;
    chunks.push({ s: l.s, sizeEnd: l.n, size, ds, de, ce });
    o = ce;
  }
}

// ------------------------------------------------------------------------------------------
// per TCP stream state: upgrades (WebSocket / HTTP/2) and pending requests for matching

function streamState(ctx) {
  const st = ctx.session.st('http', () => ({ streams: new Map() }));
  const k = ctx.tcpStream !== undefined ? 't' + ctx.tcpStream : (ctx.net ? ctx.net.src + ctx.net.dst : '') + ctx.srcport + '-' + ctx.dstport;
  let s = st.streams.get(k);
  if (!s) st.streams.set(k, s = { pending: [], upgrade: null, upgradeFrom: 0, reqCount: 0 });
  return s;
}
/** Protocol the stream switched to (after '101 Switching Protocols' or an HTTP/2 preface), else null. */
function upgradedTo(ctx, s, d, o, end) {
  if (s.upgrade && ctx.no > s.upgradeFrom) return s.upgrade;
  if (startsWith(d, o, end, 'PRI * HTTP/2.0')) return 'http2';
  if (s.upgrade && ctx.no === s.upgradeFrom && !startsWith(d, o, end, 'HTTP/')) return s.upgrade;
  return null;
}

function tcpPdu(ctx, off, end) {
  const d = ctx.d;
  const s = streamState(ctx);
  const up = upgradedTo(ctx, s, d, off, end);
  if (up) {
    // the switch happens while framing, so later PDUs of this very segment are framed correctly
    if (ctx.first && !s.upgrade && up === 'http2') { s.upgrade = 'http2'; s.upgradeFrom = ctx.no; }
    const p = getProtocol(up);
    return p && p.tcpPdu ? p.tcpPdu(ctx, off, end) : 0;
  }
  const kind = httpKind(d, off, end);
  if (!kind) {
    // A prefix of a start line: wait for more instead of calling it a continuation.
    return end - off < 8 && couldStart(d, off, end) ? -1 : 0;
  }
  const he = headerEnd(d, off, end);
  if (he < 0) return -1;
  const first = line(d, off, he);
  const hs = parseHeaders(d, first.n, he);
  let code = 0, reqMethod = null;
  if (kind === 'response') {
    code = parseInt(ascii(d, first.s + 9, 3), 10) || 0;
    const tl = s.pending[s.pending.length - 1];
    reqMethod = tl && !tl.respIn ? tl.method : null;
    if (code === 101 && ctx.first) {
      const upg = (hval(hs, 'upgrade') || '').toLowerCase();
      if (upg.includes('websocket')) { s.upgrade = 'websocket'; s.upgradeFrom = ctx.no; }
      else if (upg.includes('h2c')) { s.upgrade = 'http2'; s.upgradeFrom = ctx.no; }
    }
  }
  const b = bodyKind(hs, kind === 'response', code, reqMethod);
  if (b.kind === 'none') return he - off;
  if (b.kind === 'length') return he + b.len - off;
  if (b.kind === 'chunked') {
    const w = walkChunks(d, he, end);
    if (!w) return -1;
    return w.end - off;
  }
  return 0; // body until connection close: take what this segment has
}
function couldStart(d, off, end) {
  const n = end - off;
  const cands = ['HTTP/', ...METHODS];
  for (const w of cands) {
    let ok = true;
    for (let i = 0; i < Math.min(n, w.length); i++) if (d[off + i] !== w.charCodeAt(i)) { ok = false; break; }
    if (ok) return true;
  }
  return false;
}

// ------------------------------------------------------------------------------------------
const HDR_FIELDS = {
  host: 'http.host', 'user-agent': 'http.user_agent', accept: 'http.accept', 'accept-language': 'http.accept_language',
  'accept-encoding': 'http.accept_encoding', 'content-type': 'http.content_type', 'content-length': 'http.content_length_header',
  'content-encoding': 'http.content_encoding', 'transfer-encoding': 'http.transfer_encoding', connection: 'http.connection',
  cookie: 'http.cookie', 'set-cookie': 'http.set_cookie', location: 'http.location', server: 'http.server', referer: 'http.referer',
  date: 'http.date', 'last-modified': 'http.last_modified', authorization: 'http.authorization', 'www-authenticate': 'http.www_authenticate',
  'proxy-authorization': 'http.proxy_authorization', 'proxy-authenticate': 'http.proxy_authenticate', upgrade: 'http.upgrade',
  'cache-control': 'http.cache_control', range: 'http.range', 'content-range': 'http.content_range',
  'sec-websocket-accept': 'http.sec_websocket_accept', 'sec-websocket-extensions': 'http.sec_websocket_extensions',
  'sec-websocket-key': 'http.sec_websocket_key', 'sec-websocket-protocol': 'http.sec_websocket_protocol',
  'sec-websocket-version': 'http.sec_websocket_version', 'x-forwarded-for': 'http.x_forwarded_for', 'http2-settings': 'http.http2_settings',
  'if-modified-since': 'http.if_modified_since', 'if-none-match': 'http.if_none_match', etag: 'http.etag', 'keep-alive': 'http.keep_alive',
};
const STATUS = { 100: 'Continue', 101: 'Switching Protocols', 102: 'Processing', 103: 'Early Hints', 200: 'OK', 201: 'Created', 202: 'Accepted', 203: 'Non-authoritative Information', 204: 'No Content', 205: 'Reset Content', 206: 'Partial Content', 207: 'Multi-Status', 300: 'Multiple Choices', 301: 'Moved Permanently', 302: 'Found', 303: 'See Other', 304: 'Not Modified', 305: 'Use Proxy', 307: 'Temporary Redirect', 308: 'Permanent Redirect', 400: 'Bad Request', 401: 'Unauthorized', 402: 'Payment Required', 403: 'Forbidden', 404: 'Not Found', 405: 'Method Not Allowed', 406: 'Not Acceptable', 407: 'Proxy Authentication Required', 408: 'Request Time-out', 409: 'Conflict', 410: 'Gone', 411: 'Length Required', 412: 'Precondition Failed', 413: 'Request Entity Too Large', 414: 'Request-URI Too Long', 415: 'Unsupported Media Type', 416: 'Requested Range Not Satisfiable', 417: 'Expectation Failed', 418: 'I\'m a teapot', 421: 'Misdirected Request', 422: 'Unprocessable Entity', 423: 'Locked', 424: 'Failed Dependency', 425: 'Too Early', 426: 'Upgrade Required', 428: 'Precondition Required', 429: 'Too Many Requests', 431: 'Request Header Fields Too Large', 451: 'Unavailable For Legal Reasons', 500: 'Internal Server Error', 501: 'Not Implemented', 502: 'Bad Gateway', 503: 'Service Unavailable', 504: 'Gateway Time-out', 505: 'HTTP Version not supported', 507: 'Insufficient Storage', 511: 'Network Authentication Required' };

const HTTP_FIELDS = [
  ['http.request', 'Request', 'bool'],
  ['http.response', 'Response', 'bool'],
  ['http.request.line', 'Request line', 'string'],
  ['http.response.line', 'Response line', 'string'],
  ['http.request.method', 'Request Method', 'string'],
  ['http.request.uri', 'Request URI', 'string'],
  ['http.request.uri.path', 'Request URI Path', 'string'],
  ['http.request.uri.query', 'Request URI Query', 'string'],
  ['http.request.uri.query.parameter', 'Request URI Query Parameter', 'string'],
  ['http.request.version', 'Request Version', 'string'],
  ['http.response.version', 'Response Version', 'string'],
  ['http.request.full_uri', 'Full request URI', 'string'],
  ['http.response.code', 'Status Code', 'uint24'],
  ['http.response.code.desc', 'Status Code Description', 'string'],
  ['http.response.phrase', 'Response Phrase', 'string'],
  ['http.content_length', 'Content length', 'uint64'],
  ['http.request_in', 'Request in frame', 'framenum'],
  ['http.response_in', 'Response in frame', 'framenum'],
  ['http.time', 'Time since request', 'rel_time'],
  ['http.file_data', 'File Data', 'bytes'],
  ['http.unknown_header', 'Unknown header', 'string'],
  ['http.chunk_size', 'Chunk size', 'uint32'],
  ['http.chunk_data', 'Chunk data', 'bytes'],
  ['http.chunk_boundary', 'Chunk boundary', 'bytes'],
  ['http.chunked_trailer_part', 'trailer-part', 'string'],
  ['http.cookie_pair', 'Cookie pair', 'string'],
  ['http.proxy_authenticate', 'Proxy-Authenticate', 'string'],
  ['http.if_modified_since', 'If-Modified-Since', 'string'],
  ['http.if_none_match', 'If-None-Match', 'string'],
  ['http.etag', 'ETag', 'string'],
  ['http.keep_alive', 'Keep-Alive', 'string'],
];
const seen = new Set();
for (const a of Object.values(HDR_FIELDS)) {
  if (seen.has(a) || a === 'http.content_length_header') continue;
  seen.add(a);
  if (!HTTP_FIELDS.some((f) => f[0] === a)) {
    const nm = Object.entries(HDR_FIELDS).find(([, v]) => v === a)[0].split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join('-');
    HTTP_FIELDS.push([a, nm === 'Accept-Encoding' ? 'Accept Encoding' : nm === 'Www-Authenticate' ? 'WWW-Authenticate' : nm === 'Http2-Settings' ? 'HTTP2-Settings' : nm.replace('Websocket', 'WebSocket'), 'string']);
  }
}
HTTP_FIELDS.push(['http.content_length_header', 'Content-Length', 'string']);

registerProtocol({
  abbrev: 'http', name: 'Hypertext Transfer Protocol', short: 'HTTP',
  fields: HTTP_FIELDS,
  experts: [
    ['http.excess_data', 'warn', 'Protocol', 'Excess data after a body (not a new request/response), previous Content-Length bogus?'],
    ['http.te_and_length', 'warn', 'Malformed', 'The Content-Length and Transfer-Encoding header must not be set together'],
  ],
  tables: { 'tcp.port': [80, 3128, 3132, 5985, 8080, 8088, 11371, 1900, 2869, 2710] },
  tcpPdu,
  dissect: dissectHttp,
});

function dissectHttp(ctx, off, end) {
  const d = ctx.d;
  const s = streamState(ctx);
  const up = upgradedTo(ctx, s, d, off, end);
  if (up) {
    // Wireshark keeps 'http' in the layer list in front of the upgraded protocol.
    ctx.layers.push('http');
    if (up === 'http2' && ctx.first && !s.upgrade && startsWith(d, off, end, 'PRI * HTTP/2.0')) { s.upgrade = 'http2'; s.upgradeFrom = ctx.no; }
    const p = getProtocol(up);
    let o = off;
    while (o < end) {
      const r = ctx.call(p, o, end);
      if (r === false) { ctx.data(o, end); break; }
      if (typeof r !== 'number' || r <= 0) break;
      o += r;
    }
    return end - off;
  }
  const kind = httpKind(d, off, end);
  if (!kind) {
    ctx.setProtocol('HTTP');
    const t = ctx.proto('http', off, end - off);
    if (ctx.tree) ctx.add(t, 'http.file_data', off, end - off, d.subarray(off, end), `File Data: ${end - off} bytes`);
    ctx.pduInfo('http', 'Continuation');
    return end - off;
  }
  message(ctx, s, kind, off, end, 'http', 'HTTP');
  return end - off;
}

/**
 * Dissect one HTTP message (shared by HTTP over TCP and SSDP over UDP).
 * Returns the parsed message { kind, method, uri, code, headers }.
 */
function message(ctx, s, kind, off, end, abbrev, short) {
  const d = ctx.d;
  ctx.setProtocol(short);
  let he = headerEnd(d, off, end);
  const complete = he >= 0;
  if (!complete) he = end;
  const first = line(d, off, he) || { s: off, e: he, n: he };
  const t = ctx.proto(abbrev, off, end - off);
  const firstText = str(d, first.s, first.e);
  const hs = parseHeaders(d, first.n, he);
  let method = null, uri = null, version = null, code = 0, phrase = '';
  // first line
  const sp1 = firstText.indexOf(' ');
  const sp2 = sp1 >= 0 ? firstText.indexOf(' ', sp1 + 1) : -1;
  if (kind === 'request') {
    method = firstText.slice(0, sp1);
    uri = sp2 > 0 ? firstText.slice(sp1 + 1, sp2) : firstText.slice(sp1 + 1);
    version = sp2 > 0 ? firstText.slice(sp2 + 1) : '';
  } else {
    version = firstText.slice(0, sp1);
    code = parseInt(firstText.slice(sp1 + 1, sp1 + 4), 10) || 0;
    phrase = sp2 > 0 ? firstText.slice(sp2 + 1) : '';
  }
  const host = hval(hs, 'host');
  // request/response matching (first pass), results kept per PDU of the frame
  const idx = ctx.vars.httpIdx = (ctx.vars.httpIdx || 0) + 1;
  const store = ctx.fd.http || (ctx.fd.http = []);
  let m = store[idx - 1];
  if (ctx.first && !m) {
    const scheme = ctx.vars.tls ? 'https' : 'http';
    if (kind === 'request') {
      m = { kind, method, uri, full: host && (abbrev === 'http' || ctx.srcport !== 1900) ?`${scheme}://${host}${uri}` : null, no: ctx.no, rel: ctx.fd.rel, respIn: 0 };
      // Wireshark keys request data by frame: pipelined requests of one frame share one entry (the last wins)
      const last = abbrev === 'http' ? s.pending[s.pending.length - 1] : null;
      if (last && last.no === ctx.no) { last.method = method; last.uri = uri; last.full = m.full; m = last; }
      else if (abbrev === 'http') s.pending.push(m);
    } else {
      // Like Wireshark, a response answers the most recent request if that one is still open,
      // and the match is kept per frame (a second unmatched response in the frame clears it).
      const tail = s ? s.pending[s.pending.length - 1] : null;
      const rq = abbrev === 'http' && !(code >= 100 && code < 200 && code !== 101) && tail && !tail.respIn ? tail : null;
      m = { kind, reqIn: rq ? rq.no : 0, time: rq ? ctx.fd.rel - rq.rel : 0, uri: rq ? rq.uri : null, full: rq ? rq.full : null };
      if (rq) { rq.respIn = ctx.no; s.pending.length = 0; s.pending.push(rq); }
      else if (abbrev === 'http') for (const x of store) if (x && x.kind === 'response') { x.reqIn = 0; x.uri = null; x.full = null; }
      if (code === 101 && rq) {
        const upg = (hval(hs, 'upgrade') || '').toLowerCase();
        if (upg.includes('websocket')) { s.upgrade = 'websocket'; s.upgradeFrom = ctx.no; }
        else if (upg.includes('h2c')) { s.upgrade = 'http2'; s.upgradeFrom = ctx.no; }
      }
    }
    store[idx - 1] = m;
  }
  if (!m) m = { kind, respIn: 0, reqIn: 0 };
  // body
  let body = null, bodySrc = null, chunkInfo = null;
  if (complete) {
    const b = bodyKind(hs, kind === 'response', code, kind === 'response' && m.reqIn ? null : null);
    if (b.kind === 'length') body = [he, Math.min(end, he + b.len)];
    else if (b.kind === 'chunked') {
      const w = walkChunks(d, he, end);
      if (w && !w.bad) {
        chunkInfo = w;
        let total = 0;
        for (const c of w.chunks) total += c.size;
        const out = new Uint8Array(total);
        let o = 0;
        for (const c of w.chunks) { out.set(d.subarray(c.ds, c.de), o); o += c.size; }
        bodySrc = out;
      } else body = [he, end];
    } else if (b.kind === 'close') body = [he, end];
  }
  // tree
  if (ctx.tree) {
    if (chunkInfo) t.label = `${FIELDS_NAME[abbrev]}, has ${chunkInfo.chunks.length} chunks (including last chunk)`;
    const fl = ctx.text(t, printable(firstText) + '\\r\\n', first.s, first.n - first.s);
    if (kind === 'request') {
      ctx.hidden(t, 'http.request', first.s, 0, true);
      const ms = first.s, us = ms + utf8len(method) + 1;
      ctx.add(fl, 'http.request.method', ms, utf8len(method), method);
      const un = ctx.add(fl, 'http.request.uri', us, utf8len(uri), uri);
      const q = uri.indexOf('?');
      if (q >= 0) {
        ctx.add(un, 'http.request.uri.path', us, q, uri.slice(0, q));
        const qs = uri.slice(q + 1);
        ctx.add(un, 'http.request.uri.query', us + q + 1, utf8len(qs), qs);
        let p = us + q + 1;
        for (const part of qs.split('&')) { ctx.add(un, 'http.request.uri.query.parameter', p, utf8len(part), part); p += utf8len(part) + 1; }
      }
      ctx.add(fl, 'http.request.version', first.e - version.length, version.length, version);
    } else {
      ctx.hidden(t, 'http.response', first.s, 0, true);
      ctx.add(fl, 'http.response.version', first.s, version.length, version);
      ctx.add(fl, 'http.response.code', first.s + sp1 + 1, 3, code, `Status Code: ${code}`);
      ctx.gen(fl, 'http.response.code.desc', STATUS[code] || 'Unknown', `Status Code Description: ${STATUS[code] || 'Unknown'}`);
      ctx.add(fl, 'http.response.phrase', first.e - utf8len(phrase), utf8len(phrase), phrase);
    }
    const lineField = kind === 'request' ? 'http.request.line' : 'http.response.line';
    for (const h of hs) {
      const ltext = str(d, h.s, h.ve);
      const a = HDR_FIELDS[h.lname];
      const lbl = printable(ltext) + '\\r\\n';
      let n;
      if (a) n = ctx.add(t, a, h.s, h.e - h.s, h.value, lbl);
      else n = ctx.add(t, 'http.unknown_header', h.s, h.e - h.s, ltext, lbl);
      ctx.hidden(t, lineField, h.s, h.e - h.s, ltext + '\r\n');
      if (h.lname === 'content-length') {
        const v = parseInt(h.value, 10);
        if (!isNaN(v)) ctx.gen(n, 'http.content_length', BigInt(v), `Content length: ${v}`);
      } else if (h.lname === 'cookie') {
        for (const pair of h.value.split(';')) { const p = pair.trim(); if (p) ctx.add(n, 'http.cookie_pair', h.s, h.e - h.s, p); }
      }
    }
    if (complete) ctx.text(t, '\\r\\n', he - (d[he - 2] === 13 ? 2 : 1), d[he - 2] === 13 ? 2 : 1);
    if (kind === 'request') {
      if (m.respIn) ctx.gen(t, 'http.response_in', m.respIn, `Response in frame: ${m.respIn}`);
      if (m.full) ctx.gen(t, 'http.request.full_uri', m.full);
    } else if (m.reqIn) {
      ctx.gen(t, 'http.request_in', m.reqIn, `Request in frame: ${m.reqIn}`);
      ctx.gen(t, 'http.time', m.time);
      if (m.uri != null) ctx.gen(t, 'http.request.uri', m.uri, `Request URI: ${m.uri}`);
      if (m.full) ctx.gen(t, 'http.request.full_uri', m.full);
    }
    if (chunkInfo) {
      const ct = ctx.text(t, `HTTP chunked response`, he, chunkInfo.end - he);
      for (const c of chunkInfo.chunks) {
        if (c.last) {
          const cn = ctx.text(ct, 'End of chunked encoding', c.s, c.te - c.s);
          ctx.add(cn, 'http.chunk_size', c.s, c.sizeEnd - c.s, 0, 'Chunk size: 0 octets');
          ctx.text(ct, '\\r\\n', c.te - 2, 2);
          continue;
        }
        const cn = ctx.text(ct, `Data chunk (${c.size} octets)`, c.s, c.ce - c.s);
        ctx.add(cn, 'http.chunk_size', c.s, c.sizeEnd - c.s, c.size, `Chunk size: ${c.size} octets`);
        ctx.add(cn, 'http.chunk_data', c.ds, c.size, d.subarray(c.ds, c.de));
        if (c.ce > c.de) ctx.add(cn, 'http.chunk_boundary', c.de, c.ce - c.de, d.subarray(c.de, c.ce));
      }
    }
  }
  // Info
  let info = printable(firstText) + ' ';
  ctx.pduInfo(abbrev, info, '');
  // body content
  const ctype = hval(hs, 'content-type');
  const mime = ctype ? ctype.split(';')[0].trim().toLowerCase() : null;
  if (bodySrc) {
    if (bodySrc.length) {
      ctx.withSource(`De-chunked entity body (${bodySrc.length} bytes)`, bodySrc, () => {
        if (ctx.tree) ctx.add(t, 'http.file_data', 0, bodySrc.length, bodySrc, `File Data: ${bodySrc.length} bytes`);
        media(ctx, mime, 0, bodySrc.length, short);
      });
    }
  } else if (body && body[1] > body[0]) {
    if (ctx.tree) ctx.add(t, 'http.file_data', body[0], body[1] - body[0], d.subarray(body[0], body[1]), `File Data: ${body[1] - body[0]} bytes`);
    media(ctx, mime, body[0], body[1], short);
  }
  return { kind, method, uri, code, headers: hs };
}
const FIELDS_NAME = { http: 'Hypertext Transfer Protocol', ssdp: 'Simple Service Discovery Protocol' };
function utf8len(s) { let n = 0; for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); n += c < 0x80 ? 1 : c < 0x800 ? 2 : c >= 0xd800 && c < 0xdc00 ? (i++, 4) : 3; } return n; }

// ------------------------------------------------------------------------------------------
// Media types (Wireshark's "media_type" table)

const TEXT_TYPES = new Set(['text/html', 'text/plain', 'text/css', 'text/xml', 'text/javascript', 'text/csv', 'text/markdown', 'text/x-component',
  'application/javascript', 'application/x-javascript', 'application/xml', 'application/xhtml+xml', 'application/rss+xml', 'application/atom+xml',
  'application/soap+xml', 'application/x-www-form-urlencoded-NOT', 'message/http', 'text/vnd.wap.wml', 'application/ecmascript', 'text/ecmascript']);

/**
 * Dissect a message body by MIME type. Adds the media layer and appends the Info suffix.
 * Other modules (SIP, SMTP, WebSocket) can reuse it.
 */
export function media(ctx, mime, off, end, short = 'HTTP') {
  if (end <= off) return;
  const p = mime ? ctx.lookup('media_type', mime) : null;
  if (p) { const r = ctx.call(p, off, end, { mime, short }); if (r !== false) return; }
  if (mime === 'application/octet-stream') { ctx.data(off, end); return; }
  if (mime && (TEXT_TYPES.has(mime) || mime.startsWith('text/'))) { textLines(ctx, off, end, mime); ctx.info += ` (${mime})`; return; }
  const n = ctx.proto('media', off, end - off, `Media Type${mime ? ': ' + mime : ''} (${end - off} bytes)`);
  ctx.add(n, 'media.type', off, end - off, ctx.d.subarray(off, end), `Media type: ${mime || 'application/octet-stream'} (${end - off} bytes)`);
  if (mime) ctx.info += ` (${mime})`;
}

/** 'data-text-lines': one item per line. */
export function textLines(ctx, off, end, mime) {
  const d = ctx.d;
  let n = 0;
  for (let i = off; i < end; i++) if (d[i] === 10) n++;
  if (end > off && d[end - 1] !== 10) n++;
  const t = ctx.proto('data-text-lines', off, end - off, `Line-based text data${mime ? ': ' + mime : ''} (${n} lines)`);
  if (!ctx.tree) return;
  let o = off;
  while (o < end) {
    let e = o;
    while (e < end && d[e] !== 10) e++;
    const ln = e < end ? e + 1 : e;
    const l = utf8(d, o, (e > o && d[e - 1] === 13 ? e - 1 : e) - o);
    ctx.text(t, printable(l) + (e < end ? (d[e - 1] === 13 ? '\\r\\n' : '\\n') : ''), o, ln - o);
    o = ln;
  }
}

registerProtocol({ abbrev: 'data-text-lines', name: 'Line-based text data', short: 'Line-based text data' });
registerProtocol({ abbrev: 'media', name: 'Media Type', short: 'Media', fields: [['media.type', 'Media type', 'bytes']] });

// --- JSON -------------------------------------------------------------------------------------
registerProtocol({
  abbrev: 'json', name: 'JavaScript Object Notation', short: 'JSON',
  fields: [
    ['json.object', 'Object', 'string'], ['json.array', 'Array', 'none'], ['json.member', 'Member', 'string'],
    ['json.key', 'Key', 'string'], ['json.path', 'Path', 'string'], ['json.path_with_value', 'Path with value', 'string'],
    ['json.member_with_value', 'Member with value', 'string'], ['json.value.string', 'String value', 'string'],
    ['json.value.number', 'Number value', 'double'], ['json.value.true', 'True value', 'none'], ['json.value.false', 'False value', 'none'],
    ['json.value.null', 'Null value', 'none'],
  ],
  dissect(ctx, off, end, arg) {
    const mime = arg && arg.mime ? arg.mime : 'application/json';
    const t = ctx.proto('json', off, end - off, `JavaScript Object Notation: ${mime}`);
    ctx.setProtocol((arg && arg.short ? arg.short : 'HTTP') + '/JSON');
    ctx.info += `, JSON (${mime})`;
    if (ctx.tree) {
      const p = { d: ctx.d, o: off, end };
      try { jsonValue(ctx, t, p, '', null, 0); } catch { /* partial tree is fine */ }
    }
  },
});
addToTable('media_type', 'application/json', 'json');
addToTable('media_type', 'application/problem+json', 'json');
addToTable('media_type', 'application/vnd.api+json', 'json');

function ws(p) { while (p.o < p.end && (p.d[p.o] === 32 || p.d[p.o] === 9 || p.d[p.o] === 10 || p.d[p.o] === 13)) p.o++; }
function jsonString(p) {
  const d = p.d;
  p.o++; // opening quote
  let s = '';
  const start = p.o;
  let simple = true;
  while (p.o < p.end && d[p.o] !== 34) {
    if (d[p.o] === 92) { simple = false; p.o += 2; } else p.o++;
  }
  const raw = utf8(d, start, p.o - start);
  p.o++;
  if (simple) return raw;
  try { s = JSON.parse('"' + raw + '"'); } catch { s = raw; }
  return s;
}
/** Adds the value at p.o under parent. key/path give Member context. */
function jsonValue(ctx, parent, p, path, member, depth) {
  ws(p);
  if (p.o >= p.end || depth > 64) return;
  const d = p.d, s = p.o, c = d[s];
  if (c === 123) { // {
    const n = ctx.add(parent, 'json.object', s, 0, '', 'Object');
    p.o++;
    for (;;) {
      ws(p);
      if (d[p.o] === 125) { p.o++; break; }
      if (d[p.o] !== 34) return;
      const ms = p.o;
      const key = jsonString(p);
      ws(p);
      if (d[p.o] !== 58) return;
      p.o++;
      const mn = ctx.add(n, 'json.member', ms, 0, key, `Member: ${key}`);
      const mpath = path + '/' + key;
      jsonValue(ctx, mn, p, mpath, key, depth + 1);
      ctx.add(mn, 'json.key', ms, utf8len(key) + 2, key);
      ctx.gen(mn, 'json.path', mpath, `Path: ${mpath}`);
      mn.length = p.o - ms;
      ws(p);
      if (d[p.o] === 44) { p.o++; continue; }
      if (d[p.o] === 125) { p.o++; break; }
      return;
    }
    n.length = p.o - s;
    return;
  }
  if (c === 91) { // [
    const n = ctx.add(parent, 'json.array', s, 0, null, 'Array');
    p.o++;
    for (;;) {
      ws(p);
      if (d[p.o] === 93) { p.o++; break; }
      jsonValue(ctx, n, p, path + '/[]', null, depth + 1);
      ws(p);
      if (d[p.o] === 44) { p.o++; continue; }
      if (d[p.o] === 93) { p.o++; break; }
      return;
    }
    n.length = p.o - s;
    return;
  }
  let abbrev, val, text;
  if (c === 34) { val = jsonString(p); abbrev = 'json.value.string'; text = val; }
  else if (c === 116 || c === 102 || c === 110) {
    const w = c === 116 ? 'true' : c === 102 ? 'false' : 'null';
    p.o += w.length; abbrev = 'json.value.' + w; val = null; text = w;
  } else {
    while (p.o < p.end && ((d[p.o] >= 48 && d[p.o] <= 57) || d[p.o] === 45 || d[p.o] === 43 || d[p.o] === 46 || d[p.o] === 101 || d[p.o] === 69)) p.o++;
    text = ascii(d, s, p.o - s); val = Number(text); abbrev = 'json.value.number';
    if (p.o === s) { p.o = p.end; return; }
  }
  if (member !== null) {
    ctx.gen(parent, 'json.path_with_value', `${path}:${text}`, `Path with value: ${path}:${text}`);
    ctx.gen(parent, 'json.member_with_value', `${member}:${text}`, `Member with value: ${member}:${text}`);
  }
  const lbl = abbrev === 'json.value.string' ? `String value: ${printable(val)}` : abbrev === 'json.value.number' ? `Number value: ${text}`
    : abbrev === 'json.value.true' ? 'True value' : abbrev === 'json.value.false' ? 'False value' : 'Null value';
  ctx.add(parent, abbrev, s, p.o - s, val, lbl);
}

// --- urlencoded form ---------------------------------------------------------------------------
registerProtocol({
  abbrev: 'urlencoded-form', name: 'HTML Form URL Encoded', short: 'URLENCODED-FORM',
  fields: [['urlencoded-form.key', 'Key', 'string'], ['urlencoded-form.value', 'Value', 'string']],
  dissect(ctx, off, end, arg) {
    const mime = arg && arg.mime ? arg.mime : 'application/x-www-form-urlencoded';
    const t = ctx.proto('urlencoded-form', off, end - off, `HTML Form URL Encoded: ${mime}`);
    ctx.info += ` (${mime})`;
    if (!ctx.tree) return;
    const d = ctx.d;
    let o = off;
    while (o < end) {
      let e = o;
      while (e < end && d[e] !== 38) e++;
      let eq = o;
      while (eq < e && d[eq] !== 61) eq++;
      const k = urlDecode(ascii(d, o, eq - o)), v = eq < e ? urlDecode(ascii(d, eq + 1, e - eq - 1)) : '';
      const n = ctx.text(t, `Form item: "${k}" = "${v}"`, o, e - o);
      ctx.add(n, 'urlencoded-form.key', o, eq - o, k);
      if (eq < e) ctx.add(n, 'urlencoded-form.value', eq + 1, e - eq - 1, v);
      o = e + 1;
    }
  },
});
addToTable('media_type', 'application/x-www-form-urlencoded', 'urlencoded-form');
function urlDecode(s) { try { return decodeURIComponent(s.replace(/\+/g, ' ')); } catch { return s; } }

// --- images --------------------------------------------------------------------------------------
const PNG_CHUNKS = { IHDR: 'Image Header', IDAT: 'Image data chunk', IEND: 'Image Trailer', PLTE: 'Palette', tEXt: 'Textual data', zTXt: 'Compressed textual data', iTXt: 'International textual data', pHYs: 'Physical pixel dimensions', gAMA: 'Image gamma', cHRM: 'Primary chromaticities', sRGB: 'Standard RGB colour space', bKGD: 'Background colour', tIME: 'Image last-modification time', iCCP: 'Embedded ICC profile', tRNS: 'Transparency', sBIT: 'Significant bits', acTL: 'Animation Control Chunk', fcTL: 'Frame Control Chunk', fdAT: 'Frame Data Chunk', eXIf: 'Exchangeable Image File (Exif) Profile' };
const COLOUR = { 0: 'Greyscale', 2: 'Truecolour', 3: 'Indexed-colour', 4: 'Greyscale with alpha', 6: 'Truecolour with alpha' };
registerProtocol({
  abbrev: 'png', name: 'Portable Network Graphics', short: 'PNG',
  fields: [
    ['png.signature', 'PNG Signature', 'bytes'], ['png.chunk.len', 'Len', 'uint32'], ['png.chunk.type', 'Type', 'string'],
    ['png.chunk.data', 'Data', 'none'], ['png.chunk.crc', 'CRC', 'uint32', { base: 'hex' }],
    ['png.chunk.flag.ancillary', 'Ancillary', 'bool', { mask: 0x20000000, bits: 32, tfs: ['This is an ANCILLARY chunk', 'This is a CRITICAL chunk'] }],
    ['png.chunk.flag.private', 'Private', 'bool', { mask: 0x00200000, bits: 32, tfs: ['This is a PRIVATE chunk', 'This is a PUBLIC chunk'] }],
    ['png.chunk.flag.stc', 'Safe To Copy', 'bool', { mask: 0x00000020, bits: 32, tfs: ['This chunk is SAFE to copy', 'This chunk is NOT safe to copy'] }],
    ['png.ihdr.width', 'Width', 'uint32'], ['png.ihdr.height', 'Height', 'uint32'], ['png.ihdr.bitdepth', 'Bit Depth', 'uint8'],
    ['png.ihdr.colour_type', 'Colour Type', 'uint8', { strings: COLOUR }], ['png.ihdr.compression_method', 'Compression Method', 'uint8', { strings: { 0: 'Deflate' } }],
    ['png.ihdr.filter_method', 'Filter Method', 'uint8', { strings: { 0: 'Adaptive' } }], ['png.ihdr.interlace_method', 'Interlace Method', 'uint8', { strings: { 0: 'No interlace', 1: 'Adam7' } }],
  ],
  dissect(ctx, off, end) {
    const d = ctx.d;
    if (end - off < 8 || d[off] !== 0x89 || d[off + 1] !== 0x50) return false;
    const t = ctx.proto('png', off, end - off);
    ctx.info += ' (PNG)';
    if (!ctx.tree) return end - off;
    ctx.add(t, 'png.signature', off, 8, d.subarray(off, off + 8));
    let o = off + 8;
    while (o + 12 <= end) {
      const len = u32(d, o), type = ascii(d, o + 4, 4);
      const ce = o + 12 + len;
      const n = ctx.text(t, `${PNG_CHUNKS[type] || 'Unknown'} (${type})`, o, Math.min(ce, end) - o);
      ctx.add(n, 'png.chunk.len', o, 4, len);
      ctx.add(n, 'png.chunk.type', o + 4, 4, type);
      ctx.bits(n, o + 4, 4, u32(d, o + 4), ['png.chunk.flag.ancillary', 'png.chunk.flag.private', 'png.chunk.flag.stc']);
      if (ce > end) break;
      if (type === 'IHDR' && len >= 13) {
        ctx.add(n, 'png.ihdr.width', o + 8, 4, u32(d, o + 8));
        ctx.add(n, 'png.ihdr.height', o + 12, 4, u32(d, o + 12));
        ctx.add(n, 'png.ihdr.bitdepth', o + 16, 1, d[o + 16]);
        ctx.add(n, 'png.ihdr.colour_type', o + 17, 1, d[o + 17]);
        ctx.add(n, 'png.ihdr.compression_method', o + 18, 1, d[o + 18]);
        ctx.add(n, 'png.ihdr.filter_method', o + 19, 1, d[o + 19]);
        ctx.add(n, 'png.ihdr.interlace_method', o + 20, 1, d[o + 20]);
      } else if (len) ctx.add(n, 'png.chunk.data', o + 8, len, null, 'Data');
      ctx.add(n, 'png.chunk.crc', o + 8 + len, 4, u32(d, o + 8 + len));
      o = ce;
    }
    return end - off;
  },
});
addToTable('media_type', 'image/png', 'png');
registerProtocol({
  abbrev: 'image-gif', name: 'Compuserve GIF', short: 'GIF',
  fields: [['image-gif.version', 'Version', 'string'], ['image-gif.screen.width', 'Screen width', 'uint16'], ['image-gif.screen.height', 'Screen height', 'uint16']],
  dissect(ctx, off, end) {
    const d = ctx.d;
    if (end - off < 10 || d[off] !== 0x47) return false;
    const ver = ascii(d, off, 6);
    const t = ctx.proto('image-gif', off, end - off, `Compuserve GIF, Version: ${ver}`);
    ctx.info += ` (${ver})`;
    ctx.add(t, 'image-gif.version', off, 6, ver);
    ctx.add(t, 'image-gif.screen.width', off + 6, 2, d[off + 6] | (d[off + 7] << 8));
    ctx.add(t, 'image-gif.screen.height', off + 8, 2, d[off + 8] | (d[off + 9] << 8));
    return end - off;
  },
});
addToTable('media_type', 'image/gif', 'image-gif');
registerProtocol({
  abbrev: 'image-jfif', name: 'JPEG File Interchange Format', short: 'JFIF',
  fields: [['image-jfif.marker', 'Marker', 'uint8', { base: 'hex' }]],
  dissect(ctx, off, end) {
    const d = ctx.d;
    if (end - off < 4 || d[off] !== 0xff || d[off + 1] !== 0xd8) return false;
    const t = ctx.proto('image-jfif', off, end - off);
    ctx.info += ' (JPEG JFIF image)';
    ctx.text(t, 'Start of Image (SOI) marker', off, 2);
    return end - off;
  },
});
addToTable('media_type', 'image/jpeg', 'image-jfif');
addToTable('media_type', 'image/jpg', 'image-jfif');

// ------------------------------------------------------------------------------------------
// SSDP: HTTP over UDP 1900 (uses the http.* fields like Wireshark)
registerProtocol({
  abbrev: 'ssdp', name: 'Simple Service Discovery Protocol', short: 'SSDP',
  tables: { 'udp.port': [1900] },
  dissect(ctx, off, end) {
    const kind = httpKind(ctx.d, off, end);
    if (!kind) return false;
    message(ctx, null, kind, off, end, 'ssdp', 'SSDP');
    return end - off;
  },
});

// ------------------------------------------------------------------------------------------
// WebSocket (RFC 6455)
const WS_OP = { 0: 'Continuation', 1: 'Text', 2: 'Binary', 8: 'Connection Close', 9: 'Ping', 10: 'Pong' };
const WS_CLOSE = { 1000: 'Normal Closure', 1001: 'Going Away', 1002: 'Protocol error', 1003: 'Unsupported Data', 1005: 'No Status Rcvd', 1006: 'Abnormal Closure', 1007: 'Invalid frame payload data', 1008: 'Policy Violation', 1009: 'Message Too Big', 1010: 'Mandatory Ext.', 1011: 'Internal Server', 1015: 'TLS handshake' };
registerProtocol({
  abbrev: 'websocket', name: 'WebSocket', short: 'WebSocket',
  fields: [
    ['websocket.fin', 'Fin', 'bool', { mask: 0x80, bits: 8 }],
    ['websocket.rsv', 'Reserved', 'uint8', { base: 'hex', mask: 0x70 }],
    ['websocket.opcode', 'Opcode', 'uint8', { mask: 0x0f, strings: WS_OP }],
    ['websocket.mask', 'Mask', 'bool', { mask: 0x80, bits: 8 }],
    ['websocket.payload_length', 'Payload length', 'uint8', { mask: 0x7f }],
    ['websocket.payload_length_ext_16', 'Extended Payload length (16 bits)', 'uint16'],
    ['websocket.payload_length_ext_64', 'Extended Payload length (64 bits)', 'uint64'],
    ['websocket.masking_key', 'Masking-Key', 'bytes'],
    ['websocket.masked_payload', 'Masked payload', 'bytes'],
    ['websocket.payload', 'Payload', 'bytes'],
    ['websocket.payload.text', 'Text', 'string'],
    ['websocket.payload.continue', 'Continue', 'bytes'],
    ['websocket.payload.close', 'Close', 'bytes'],
    ['websocket.payload.close.status_code', 'Status code', 'uint16', { strings: WS_CLOSE }],
    ['websocket.payload.close.reason', 'Reason', 'string'],
    ['websocket.payload.ping', 'Ping', 'bytes'],
    ['websocket.payload.pong', 'Pong', 'bytes'],
    ['websocket.payload.unknown', 'Unknown', 'bytes'],
  ],
  tcpPdu(ctx, off, end) {
    const d = ctx.d;
    if (end - off < 2) return -1;
    let len = d[off + 1] & 0x7f, h = 2;
    if (len === 126) { if (end - off < 4) return -1; len = u16(d, off + 2); h = 4; }
    else if (len === 127) { if (end - off < 10) return -1; len = u32(d, off + 6) + u32(d, off + 2) * 4294967296; h = 10; }
    if (d[off + 1] & 0x80) h += 4;
    return h + len;
  },
  dissect(ctx, off, end) {
    const d = ctx.d;
    ctx.need(off, 2, end);
    const b0 = d[off], b1 = d[off + 1];
    const op = b0 & 15, masked = (b1 & 0x80) !== 0;
    let len = b1 & 0x7f, o = off + 2;
    ctx.setProtocol('WebSocket');
    const t = ctx.proto('websocket', off, end - off);
    ctx.bits(t, off, 1, b0, ['websocket.fin', 'websocket.rsv', 'websocket.opcode']);
    ctx.bits(t, off + 1, 1, b1, ['websocket.mask', 'websocket.payload_length']);
    if (len === 126) { ctx.need(o, 2, end); len = u16(d, o); ctx.add(t, 'websocket.payload_length_ext_16', o, 2, len); o += 2; }
    else if (len === 127) { ctx.need(o, 8, end); const v = u32(d, o) * 4294967296 + u32(d, o + 4); ctx.add(t, 'websocket.payload_length_ext_64', o, 8, BigInt(v)); len = v; o += 8; }
    let key = null;
    if (masked) { ctx.need(o, 4, end); key = d.subarray(o, o + 4); ctx.add(t, 'websocket.masking_key', o, 4, key); o += 4; }
    const pe = Math.min(end, o + len);
    ctx.pduInfo('websocket', `WebSocket ${WS_OP[op] || 'Unknown'} ${b0 & 0x80 ? '[FIN] ' : ''}${masked ? '[MASKED]' : ''}`);
    let pd = d, po = o, pend = pe;
    if (masked) {
      if (ctx.tree) ctx.add(t, 'websocket.masked_payload', o, pe - o, d.subarray(o, pe), 'Masked payload');
      const un = new Uint8Array(pe - o);
      for (let i = 0; i < un.length; i++) un[i] = d[o + i] ^ key[i & 3];
      pd = un; po = 0; pend = un.length;
    }
    const body = () => {
      const pn = ctx.add(t, 'websocket.payload', po, pend - po, ctx.d.subarray(po, pend), 'Payload');
      if (op === 1) {
        const txt = utf8(ctx.d, po, pend - po);
        ctx.add(pn, 'websocket.payload.text', po, pend - po, txt);
        if (pend > po) textLines(ctx, po, pend, null);
      } else if (op === 8) {
        const c = ctx.add(pn, 'websocket.payload.close', po, pend - po, ctx.d.subarray(po, pend));
        if (pend - po >= 2) ctx.add(c, 'websocket.payload.close.status_code', po, 2, u16(ctx.d, po));
        if (pend - po > 2) ctx.add(c, 'websocket.payload.close.reason', po + 2, pend - po - 2, utf8(ctx.d, po + 2, pend - po - 2));
      } else if (op === 9) ctx.add(pn, 'websocket.payload.ping', po, pend - po, ctx.d.subarray(po, pend));
      else if (op === 10) ctx.add(pn, 'websocket.payload.pong', po, pend - po, ctx.d.subarray(po, pend));
      else if (op === 0) ctx.add(pn, 'websocket.payload.continue', po, pend - po, ctx.d.subarray(po, pend));
      else if (op === 2 && pend > po) ctx.data(po, pend);
      else ctx.add(pn, 'websocket.payload.unknown', po, pend - po, ctx.d.subarray(po, pend));
    };
    if (masked) ctx.withSource(`Unmasked data (${pend} bytes)`, pd, body);
    else body();
    return pe - off;
  },
});

export { message as httpMessage };
void hexStr; void NULLNODE;
