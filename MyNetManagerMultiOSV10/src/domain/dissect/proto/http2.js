// HTTP/2 (RFC 9113) framing and HPACK (RFC 7541) header decoding with per-direction dynamic tables.
import { registerProtocol, u16, u24, u32, utf8, printable, hexPad } from '../core.js';
import { media } from './http.js';

const TYPES = { 0: 'DATA', 1: 'HEADERS', 2: 'PRIORITY', 3: 'RST_STREAM', 4: 'SETTINGS', 5: 'PUSH_PROMISE', 6: 'PING', 7: 'GOAWAY', 8: 'WINDOW_UPDATE', 9: 'CONTINUATION', 10: 'ALTSVC', 12: 'ORIGIN', 16: 'PRIORITY_UPDATE' };
const SETTINGS = { 1: 'Header table size', 2: 'Enable PUSH', 3: 'Max concurrent streams', 4: 'Initial Windows size', 5: 'Max frame size', 6: 'Max header list size', 8: 'Extended CONNECT', 9: 'No RFC7540 Priorities' };
const SETTING_FIELD = { 1: ['http2.settings.header_table_size', 'Header table size'], 2: ['http2.settings.enable_push', 'Enable PUSH'], 3: ['http2.settings.max_concurrent_streams', 'Max concurrent streams'], 4: ['http2.settings.initial_window_size', 'Initial Window Size'], 5: ['http2.settings.max_frame_size', 'Max frame size'], 6: ['http2.settings.max_header_list_size', 'Max header list size'] };
const ERRORS = { 0: 'NO_ERROR', 1: 'PROTOCOL_ERROR', 2: 'INTERNAL_ERROR', 3: 'FLOW_CONTROL_ERROR', 4: 'SETTINGS_TIMEOUT', 5: 'STREAM_CLOSED', 6: 'FRAME_SIZE_ERROR', 7: 'REFUSED_STREAM', 8: 'CANCEL', 9: 'COMPRESSION_ERROR', 10: 'CONNECT_ERROR', 11: 'ENHANCE_YOUR_CALM', 12: 'INADEQUATE_SECURITY', 13: 'HTTP_1_1_REQUIRED' };
const STATUS_TEXT = { 100: 'Continue', 101: 'Switching Protocols', 200: 'OK', 201: 'Created', 204: 'No Content', 206: 'Partial Content', 301: 'Moved Permanently', 302: 'Found', 304: 'Not Modified', 307: 'Temporary Redirect', 308: 'Permanent Redirect', 400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found', 405: 'Method Not Allowed', 429: 'Too Many Requests', 500: 'Internal Server Error', 502: 'Bad Gateway', 503: 'Service Unavailable', 504: 'Gateway Time-out' };

const STATIC = [null,
  [':authority', ''], [':method', 'GET'], [':method', 'POST'], [':path', '/'], [':path', '/index.html'], [':scheme', 'http'], [':scheme', 'https'],
  [':status', '200'], [':status', '204'], [':status', '206'], [':status', '304'], [':status', '400'], [':status', '404'], [':status', '500'],
  ['accept-charset', ''], ['accept-encoding', 'gzip, deflate'], ['accept-language', ''], ['accept-ranges', ''], ['accept', ''],
  ['access-control-allow-origin', ''], ['age', ''], ['allow', ''], ['authorization', ''], ['cache-control', ''], ['content-disposition', ''],
  ['content-encoding', ''], ['content-language', ''], ['content-length', ''], ['content-location', ''], ['content-range', ''], ['content-type', ''],
  ['cookie', ''], ['date', ''], ['etag', ''], ['expect', ''], ['expires', ''], ['from', ''], ['host', ''], ['if-match', ''], ['if-modified-since', ''],
  ['if-none-match', ''], ['if-range', ''], ['if-unmodified-since', ''], ['last-modified', ''], ['link', ''], ['location', ''], ['max-forwards', ''],
  ['proxy-authenticate', ''], ['proxy-authorization', ''], ['range', ''], ['referer', ''], ['refresh', ''], ['retry-after', ''], ['server', ''],
  ['set-cookie', ''], ['strict-transport-security', ''], ['transfer-encoding', ''], ['user-agent', ''], ['vary', ''], ['via', ''], ['www-authenticate', '']];

// HPACK Huffman code lengths for symbols 0..256 (base-36 digits); the code is canonical.
const HUFF_LEN = 'dnsssssssoussussssssssusssssssss6aacd68baa8b8666555666666678f6cad67777777777777777777777878djde6f56565666577666567655677777fbedskmkkmmmnmnnnnnonoomnonnnnlmnmnnomlkmmnnlnmmolmnnllmlnmnnkmmmnmmnqqkjmnmpqqqrrqopjlqrrqrollqqsrrrkoklmllnmmppooqnqrqqrrrrrsrrrrrqu';
let HUFF = null; // Map(len -> Map(code -> sym))
function huffTable() {
  if (HUFF) return HUFF;
  const lens = Array.from(HUFF_LEN, (c) => parseInt(c, 36));
  const order = lens.map((l, s) => [l, s]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  HUFF = new Map();
  let code = 0, prev = order[0][0];
  order.forEach(([len, s], j) => {
    if (j) code = (code + 1) * 2 ** (len - prev);
    prev = len;
    let m = HUFF.get(len);
    if (!m) HUFF.set(len, m = new Map());
    m.set(code, s);
  });
  return HUFF;
}
export function huffmanDecode(d, o, n) {
  const t = huffTable();
  const out = [];
  let code = 0, len = 0;
  for (let i = 0; i < n; i++) {
    const byte = d[o + i];
    for (let b = 7; b >= 0; b--) {
      code = code * 2 + ((byte >> b) & 1);
      len++;
      const m = t.get(len);
      if (m) {
        const s = m.get(code);
        if (s !== undefined) {
          if (s === 256) return utf8bytes(out);
          out.push(s); code = 0; len = 0;
        }
      }
      if (len > 30) return utf8bytes(out);
    }
  }
  return utf8bytes(out); // remaining bits are EOS padding
}
const TD = new TextDecoder();
function utf8bytes(a) { return TD.decode(Uint8Array.from(a)); }

const HDR_FIELDS = new Set(['accept', 'accept-charset', 'accept-encoding', 'accept-language', 'accept-ranges', 'access-control-allow-origin', 'age', 'allow', 'authorization', 'cache-control', 'content-disposition', 'content-encoding', 'content-language', 'content-length', 'content-location', 'content-range', 'content-type', 'cookie', 'date', 'etag', 'expect', 'expires', 'from', 'if-match', 'if-modified-since', 'if-none-match', 'if-range', 'if-unmodified-since', 'last-modified', 'link', 'location', 'max-forwards', 'proxy-authenticate', 'proxy-authorization', 'range', 'referer', 'refresh', 'retry-after', 'server', 'set-cookie', 'strict-transport-security', 'user-agent', 'vary', 'via', 'www-authenticate']);
const U64_HDRS = new Set(['age', 'content-length', 'max-forwards']);
const hdrAbbrev = (name) => (name[0] === ':' ? 'http2.headers.' + name.slice(1) : 'http2.headers.' + name.replace(/-/g, '_'));

const FIELDS = [
  ['http2.stream', 'Stream', 'none'],
  ['http2.length', 'Length', 'uint24'],
  ['http2.type', 'Type', 'uint8', { strings: TYPES }],
  ['http2.flags', 'Flags', 'uint8', { base: 'hex' }],
  ['http2.flags.end_stream', 'End Stream', 'bool', { mask: 0x01, bits: 8 }],
  ['http2.flags.eh', 'End Headers', 'bool', { mask: 0x04, bits: 8 }],
  ['http2.flags.padded', 'Padded', 'bool', { mask: 0x08, bits: 8 }],
  ['http2.flags.priority', 'Priority', 'bool', { mask: 0x20, bits: 8 }],
  ['http2.flags.ack.settings', 'ACK', 'bool', { mask: 0x01, bits: 8 }],
  ['http2.flags.ack.ping', 'ACK', 'bool', { mask: 0x01, bits: 8 }],
  ['http2.r', 'Reserved', 'uint32', { base: 'hex', mask: 0x80000000, bits: 32 }],
  ['http2.streamid', 'Stream Identifier', 'uint32', { mask: 0x7fffffff, bits: 32 }],
  ['http2.magic', 'Magic', 'string'],
  ['http2.pad_length', 'Pad Length', 'uint16'],
  ['http2.exclusive', 'Exclusive', 'bool', { mask: 0x80000000, bits: 32 }],
  ['http2.stream_dependency', 'Stream Dependency', 'uint32', { mask: 0x7fffffff, bits: 32 }],
  ['http2.headers.weight', 'Weight', 'uint8'],
  ['http2.data.data', 'Data', 'bytes'],
  ['http2.data.padding', 'Padding', 'bytes'],
  ['http2.headers', 'Header Block Fragment', 'bytes'],
  ['http2.headers.padding', 'Padding', 'bytes'],
  ['http2.header', 'Header', 'none'],
  ['http2.header.length', 'Header Length', 'uint32'],
  ['http2.header.count', 'Header Count', 'uint32'],
  ['http2.header.name.length', 'Name Length', 'uint32'],
  ['http2.header.name', 'Name', 'string'],
  ['http2.header.value.length', 'Value Length', 'uint32'],
  ['http2.header.value', 'Value', 'string'],
  ['http2.header.unescaped', 'Unescaped', 'string'],
  ['http2.header.repr', 'Representation', 'string'],
  ['http2.header.index', 'Index', 'uint32'],
  ['http2.header_table_size_update', 'Header table size update', 'none'],
  ['http2.header_table_size_update.header_table_size', 'Header table size', 'uint32'],
  ['http2.request.full_uri', 'Full request URI', 'string'],
  ['http2.rst_stream.error', 'Error', 'uint32', { strings: ERRORS }],
  ['http2.settings', 'Settings', 'none'],
  ['http2.settings.id', 'Settings Identifier', 'uint16', { strings: SETTINGS }],
  ['http2.settings.header_table_size', 'Header table size', 'uint32'],
  ['http2.settings.enable_push', 'Enable PUSH', 'uint32'],
  ['http2.settings.max_concurrent_streams', 'Max concurrent streams', 'uint32'],
  ['http2.settings.initial_window_size', 'Initial Window Size', 'uint32'],
  ['http2.settings.max_frame_size', 'Max frame size', 'uint32'],
  ['http2.settings.max_header_list_size', 'Max header list size', 'uint32'],
  ['http2.settings.unknown', 'Unknown Settings', 'uint32'],
  ['http2.push_promise.promised_stream_id', 'Promised-Stream-ID', 'uint32', { mask: 0x7fffffff, bits: 32 }],
  ['http2.push_promise.header', 'Header Block Fragment', 'bytes'],
  ['http2.ping', 'Ping', 'bytes'],
  ['http2.pong', 'Pong', 'bytes'],
  ['http2.goaway.last_stream_id', 'Last-Stream-ID', 'uint32', { mask: 0x7fffffff, bits: 32 }],
  ['http2.goaway.error', 'Error', 'uint32', { strings: ERRORS }],
  ['http2.goaway.addata', 'Additional Debug Data', 'bytes'],
  ['http2.window_update.window_size_increment', 'Window Size Increment', 'uint32', { mask: 0x7fffffff, bits: 32 }],
  ['http2.continuation.header', 'Header Block Fragment', 'bytes'],
  ['http2.request_in', 'Request in frame', 'framenum'],
  ['http2.response_in', 'Response in frame', 'framenum'],
  ['http2.time', 'Time since request', 'rel_time'],
  ['http2.unknown', 'Unknown', 'bytes'],
];
for (let i = 1; i < STATIC.length; i++) {
  const n = STATIC[i][0];
  if (n === ':authority' || n === ':method' || n === ':path' || n === ':scheme' || n === ':status' || HDR_FIELDS.has(n)) {
    const a = hdrAbbrev(n);
    if (!FIELDS.some((f) => f[0] === a)) FIELDS.push([a, n, n === ':status' ? 'uint16' : U64_HDRS.has(n) ? 'uint64' : 'string']);
  }
}
FIELDS.push(['http2.headers.protocol', ':protocol', 'string']);

const PREFACE = 'PRI * HTTP/2.0\r\n\r\nSM\r\n\r\n';
function isPreface(d, o, end) {
  if (end - o < 24) return false;
  for (let i = 0; i < 24; i++) if (d[o + i] !== PREFACE.charCodeAt(i)) return false;
  return true;
}

registerProtocol({
  abbrev: 'http2', name: 'HyperText Transfer Protocol 2', short: 'HTTP2',
  fields: FIELDS,
  experts: [['http2.header_size_exceeded', 'warn', 'Undecoded', 'Decompression stopped.']],
  tcpPdu(ctx, off, end) {
    const d = ctx.d;
    if (end - off >= 3 && d[off] === 0x50 && d[off + 1] === 0x52 && d[off + 2] === 0x49) return end - off >= 24 ? 24 : -1;
    if (end - off < 9) return -1;
    return 9 + u24(d, off);
  },
  dissect: dissectHttp2,
});

/** Connection state: dynamic tables per direction and stream request info. */
function conn(ctx) {
  const st = ctx.session.st('http2', () => new Map());
  const k = ctx.tcpStream !== undefined ? 't' + ctx.tcpStream : 'x';
  let c = st.get(k);
  if (!c) st.set(k, c = { dyn: new Map(), streams: new Map(), client: null });
  return c;
}
function dirKey(ctx) { return (ctx.net ? ctx.net.src : '') + ':' + ctx.srcport; }

/** Dissect one HTTP/2 frame (or the connection preface) at off. Exported for TLS (ALPN h2). */
export function dissectHttp2(ctx, off, end) {
  const d = ctx.d;
  ctx.setProtocol('HTTP2');
  if (isPreface(d, off, end)) {
    const t = ctx.proto('http2', off, 24);
    const s = ctx.text(t, 'Stream: Magic', off, 24);
    ctx.add(s, 'http2.magic', off, 24, PREFACE, 'Magic: PRI * HTTP/2.0\\r\\n\\r\\nSM\\r\\n\\r\\n');
    if (ctx.first) conn(ctx).client = dirKey(ctx);
    ctx.pduInfo('http2', 'Magic');
    return 24;
  }
  ctx.need(off, 9, end);
  const len = u24(d, off), type = d[off + 3], flags = d[off + 4], sid = u32(d, off + 5) & 0x7fffffff;
  const pe = Math.min(end, off + 9 + len);
  const t = ctx.proto('http2', off, pe - off);
  const tn = TYPES[type] || 'Unknown';
  const sn = ctx.text(t, `Stream: ${tn}, Stream ID: ${sid}, Length ${len}`, off, pe - off);
  if (ctx.tree) {
    sn.abbrev = 'http2.stream';
    ctx.add(sn, 'http2.length', off, 3, len);
    ctx.add(sn, 'http2.type', off + 3, 1, type);
    const fn = ctx.add(sn, 'http2.flags', off + 4, 1, flags, `Flags: ${hexPad(flags, 2)}${flagDesc(type, flags)}`);
    if (type === 0) ctx.bits(fn, off + 4, 1, flags, ['http2.flags.padded', 'http2.flags.end_stream']);
    else if (type === 1) ctx.bits(fn, off + 4, 1, flags, ['http2.flags.priority', 'http2.flags.padded', 'http2.flags.eh', 'http2.flags.end_stream']);
    else if (type === 4) ctx.bits(fn, off + 4, 1, flags, ['http2.flags.ack.settings']);
    else if (type === 6) ctx.bits(fn, off + 4, 1, flags, ['http2.flags.ack.ping']);
    else if (type === 5 || type === 9) ctx.bits(fn, off + 4, 1, flags, ['http2.flags.padded', 'http2.flags.eh']);
    ctx.bits(sn, off + 5, 4, u32(d, off + 5), ['http2.r', 'http2.streamid']);
  }
  let o = off + 9;
  let info = `${tn}[${sid}]`;
  const c = conn(ctx);
  // per-frame stored results (dynamic HPACK state only valid on the first pass)
  const idx = ctx.vars.h2idx = (ctx.vars.h2idx || 0) + 1;
  const store = ctx.fd.http2 || (ctx.fd.http2 = []);
  switch (type) {
    case 0: { // DATA
      let pad = 0;
      if (flags & 8) { pad = d[o]; ctx.add(sn, 'http2.pad_length', o, 1, pad); o++; }
      const de = Math.max(o, pe - pad);
      if (ctx.tree) ctx.add(sn, 'http2.data.data', o, de - o, d.subarray(o, de));
      if (pad) ctx.add(sn, 'http2.data.padding', de, pad, d.subarray(de, pe));
      ctx.pduInfo('http2', info);
      const ss = c.streams.get(sid);
      const mime = ss && ss.ctype ? ss.ctype.split(';')[0].trim().toLowerCase() : null;
      if (de > o && (flags & 1) && mime) media(ctx, mime, o, de, 'HTTP2');
      return pe - off;
    }
    case 1: case 5: case 9: { // HEADERS, PUSH_PROMISE, CONTINUATION
      let pad = 0;
      if ((type === 1 || type === 5) && (flags & 8)) { pad = d[o]; o++; }
      if (ctx.tree && type === 1) ctx.gen(sn, 'http2.pad_length', pad, `Pad Length: ${pad}`);
      if (type === 1 && (flags & 0x20)) {
        const dep = u32(d, o);
        ctx.add(sn, 'http2.exclusive', o, 4, (dep & 0x80000000) !== 0);
        ctx.add(sn, 'http2.stream_dependency', o, 4, dep & 0x7fffffff);
        ctx.add(sn, 'http2.headers.weight', o + 4, 1, d[o + 4]);
        o += 5;
      }
      if (type === 5) { ctx.add(sn, 'http2.push_promise.promised_stream_id', o, 4, u32(d, o) & 0x7fffffff); o += 4; }
      const he = Math.max(o, pe - pad);
      ctx.add(sn, type === 1 ? 'http2.headers' : type === 5 ? 'http2.push_promise.header' : 'http2.continuation.header', o, he - o, d.subarray(o, he));
      let rec = store[idx - 1];
      if (ctx.first && !rec) {
        const dk = dirKey(ctx);
        let dyn = c.dyn.get(dk);
        if (!dyn) c.dyn.set(dk, dyn = { list: [], size: 0, max: 4096 });
        rec = { headers: hpackDecode(d, o, he, dyn) };
        store[idx - 1] = rec;
        matchRequest(ctx, c, sid, rec, type);
      }
      if (!rec) rec = { headers: [] };
      if (ctx.tree) headerTree(ctx, sn, rec);
      const hm = new Map(rec.headers.map((h) => [h.name, h.value]));
      if (hm.has(':method')) info += `: ${hm.get(':method')} ${hm.get(':path') || ''}`;
      else if (hm.has(':status')) { const s = +hm.get(':status'); info += `: ${s} ${STATUS_TEXT[s] || ''}`.trimEnd(); }
      if (ctx.tree) {
        if (rec.respIn) ctx.gen(sn, 'http2.response_in', rec.respIn, `Response in frame: ${rec.respIn}`);
        if (rec.full) ctx.gen(sn, 'http2.request.full_uri', rec.full);
        if (rec.reqIn) { ctx.gen(sn, 'http2.request_in', rec.reqIn, `Request in frame: ${rec.reqIn}`); ctx.gen(sn, 'http2.time', rec.time); }
      }
      if (ctx.tree && info.includes(': ')) sn.label += ', ' + info.slice(info.indexOf(': ') + 2);
      ctx.pduInfo('http2', info);
      return pe - off;
    }
    case 2:
      ctx.need(o, 5, pe);
      ctx.add(sn, 'http2.exclusive', o, 4, (d[o] & 0x80) !== 0);
      ctx.add(sn, 'http2.stream_dependency', o, 4, u32(d, o) & 0x7fffffff);
      ctx.add(sn, 'http2.headers.weight', o + 4, 1, d[o + 4]);
      break;
    case 3:
      ctx.need(o, 4, pe);
      ctx.add(sn, 'http2.rst_stream.error', o, 4, u32(d, o));
      break;
    case 4:
      for (; o + 6 <= pe; o += 6) {
        const id = u16(d, o), v = u32(d, o + 2);
        const f = SETTING_FIELD[id];
        const s = ctx.add(sn, 'http2.settings', o, 6, null, `Settings - ${SETTINGS[id] || 'Unknown'} : ${v}`);
        ctx.add(s, 'http2.settings.id', o, 2, id);
        ctx.add(s, f ? f[0] : 'http2.settings.unknown', o + 2, 4, v);
        if (id === 1 && ctx.first) {
          // the peer's decoder table limit; applied when the encoder signals a size update
        }
      }
      break;
    case 6:
      ctx.add(sn, flags & 1 ? 'http2.pong' : 'http2.ping', o, Math.min(8, pe - o), d.subarray(o, Math.min(o + 8, pe)));
      break;
    case 7:
      ctx.need(o, 8, pe);
      ctx.add(sn, 'http2.goaway.last_stream_id', o, 4, u32(d, o) & 0x7fffffff);
      ctx.add(sn, 'http2.goaway.error', o + 4, 4, u32(d, o + 4));
      if (pe > o + 8) ctx.add(sn, 'http2.goaway.addata', o + 8, pe - o - 8, d.subarray(o + 8, pe));
      break;
    case 8:
      ctx.need(o, 4, pe);
      ctx.add(sn, 'http2.window_update.window_size_increment', o, 4, u32(d, o) & 0x7fffffff);
      break;
    default:
      if (pe > o) ctx.add(sn, 'http2.unknown', o, pe - o, d.subarray(o, pe));
  }
  ctx.pduInfo('http2', info);
  return pe - off;
}

function flagDesc(type, f) {
  const p = [];
  if (type === 0) { if (f & 1) p.push('End Stream'); if (f & 8) p.push('Padded'); }
  else if (type === 1) { if (f & 0x20) p.push('Priority'); if (f & 8) p.push('Padded'); if (f & 4) p.push('End Headers'); if (f & 1) p.push('End Stream'); }
  else if (type === 4 || type === 6) { if (f & 1) p.push('ACK'); }
  else if (type === 5 || type === 9) { if (f & 4) p.push('End Headers'); if (f & 8) p.push('Padded'); }
  return p.length ? ', ' + p.join(', ') : '';
}

function matchRequest(ctx, c, sid, rec, type) {
  if (type === 9) return;
  const h = new Map(rec.headers.map((x) => [x.name, x.value]));
  if (h.has(':method')) {
    const auth = h.get(':authority') || h.get('host');
    rec.full = auth ? `${h.get(':scheme') || 'http'}://${auth}${h.get(':path') || ''}` : null;
    c.streams.set(sid, { req: rec, no: ctx.no, rel: ctx.fd.rel, ctype: null });
  } else if (h.has(':status')) {
    let s = c.streams.get(sid);
    if (!s) c.streams.set(sid, s = { req: null, no: 0, rel: 0, ctype: null });
    if (s.req && !s.req.respIn) { s.req.respIn = ctx.no; rec.reqIn = s.no; rec.time = ctx.fd.rel - s.rel; }
    s.ctype = h.get('content-type') || null;
  }
}

function headerTree(ctx, sn, rec) {
  let total = 0;
  for (const h of rec.headers) if (!h.update) total += h.name.length + h.value.length + 32;
  ctx.gen(sn, 'http2.header.length', total, `Header Length: ${total}`);
  ctx.gen(sn, 'http2.header.count', rec.headers.filter((h) => !h.update).length, `Header Count: ${rec.headers.filter((h) => !h.update).length}`);
  for (const h of rec.headers) {
    if (h.update) {
      const n = ctx.add(sn, 'http2.header_table_size_update', h.s, h.e - h.s, null, 'Header table size update');
      ctx.add(n, 'http2.header_table_size_update.header_table_size', h.s, h.e - h.s, h.size);
      continue;
    }
    let shown = h.value;
    if (h.name === ':status') { const s = +h.value; if (STATUS_TEXT[s]) shown += ' ' + STATUS_TEXT[s]; }
    const n = ctx.add(sn, 'http2.header', h.s, h.e - h.s, null, `Header: ${printable(h.name)}: ${printable(shown)}`);
    ctx.add(n, 'http2.header.name.length', h.s, 0, h.name.length);
    ctx.add(n, 'http2.header.name', h.s, 0, h.name);
    ctx.add(n, 'http2.header.value.length', h.s, 0, h.value.length);
    ctx.add(n, 'http2.header.value', h.s, 0, h.value);
    const a = hdrAbbrev(h.name);
    if ((h.name[0] === ':' || HDR_FIELDS.has(h.name)) && ctx.session && hasField(a)) {
      const v = h.name === ':status' ? (+h.value || 0) : U64_HDRS.has(h.name) ? BigInt(/^\d+$/.test(h.value) ? h.value : 0) : h.value;
      ctx.add(n, a, h.s, 0, v, `${h.name}: ${printable(h.value)}`);
    }
    ctx.gen(n, 'http2.header.unescaped', h.value, `Unescaped: ${printable(h.value)}`);
    ctx.add(n, 'http2.header.repr', h.s, 1, h.repr, `Representation: ${h.repr}`);
    if (h.index) ctx.add(n, 'http2.header.index', h.s, 1, h.index);
  }
}
const FIELD_SET = new Set(FIELDS.map((f) => f[0]));
function hasField(a) { return FIELD_SET.has(a); }

// ---- HPACK
function hint(d, p, end, prefix) {
  const max = (1 << prefix) - 1;
  let v = d[p.o] & max;
  p.o++;
  if (v < max) return v;
  let m = 0;
  while (p.o < end) {
    const b = d[p.o++];
    v += (b & 127) * 2 ** m;
    m += 7;
    if (!(b & 128)) break;
  }
  return v;
}
function hstr(d, p, end) {
  const huff = (d[p.o] & 0x80) !== 0;
  const n = hint(d, p, end, 7);
  const s = p.o;
  p.o = Math.min(end, p.o + n);
  return huff ? huffmanDecode(d, s, p.o - s) : utf8(d, s, p.o - s);
}
function dynGet(dyn, i) {
  if (i < STATIC.length) return STATIC[i];
  return dyn.list[i - STATIC.length] || ['<unknown>', ''];
}
function dynAdd(dyn, name, value) {
  const sz = name.length + value.length + 32;
  dyn.list.unshift([name, value]);
  dyn.size += sz;
  while (dyn.size > dyn.max && dyn.list.length) { const [n, v] = dyn.list.pop(); dyn.size -= n.length + v.length + 32; }
}
/** Decode a header block, updating the dynamic table. Returns [{ name, value, repr, index, s, e }]. */
export function hpackDecode(d, o, end, dyn) {
  const out = [];
  const p = { o };
  let guard = 0;
  while (p.o < end && guard++ < 500) {
    const s = p.o, b = d[s];
    if (b & 0x80) {
      const i = hint(d, p, end, 7);
      const [name, value] = dynGet(dyn, i);
      out.push({ name, value, repr: 'Indexed Header Field', index: i, s, e: p.o });
    } else if (b & 0x40) {
      const i = hint(d, p, end, 6);
      const name = i ? dynGet(dyn, i)[0] : hstr(d, p, end);
      const value = hstr(d, p, end);
      dynAdd(dyn, name, value);
      out.push({ name, value, repr: i ? 'Literal Header Field with Incremental Indexing - Indexed Name' : 'Literal Header Field with Incremental Indexing - New Name', index: i, s, e: p.o });
    } else if (b & 0x20) {
      const size = hint(d, p, end, 5);
      dyn.max = size;
      while (dyn.size > dyn.max && dyn.list.length) { const [n, v] = dyn.list.pop(); dyn.size -= n.length + v.length + 32; }
      out.push({ update: true, size, s, e: p.o });
    } else {
      const never = (b & 0x10) !== 0;
      const i = hint(d, p, end, 4);
      const name = i ? dynGet(dyn, i)[0] : hstr(d, p, end);
      const value = hstr(d, p, end);
      out.push({ name, value, repr: `Literal Header Field ${never ? 'Never Indexed' : 'without Indexing'} - ${i ? 'Indexed Name' : 'New Name'}`, index: i, s, e: p.o });
    }
  }
  return out;
}
