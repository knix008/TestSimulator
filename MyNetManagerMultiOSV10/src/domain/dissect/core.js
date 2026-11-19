// Dissection engine: field/protocol registry, dissector tables, per-packet context, session.
// Pure ES module (no DOM). See ARCHITECTURE.md "Dissection" for the public contract.

import { resolveMac, serviceName } from './names.js';

export const FIELDS = new Map();
export const PROTOCOLS = [];
const PROTO_BY_ABBREV = new Map();
export const TABLES = new Map();      // table name -> Map(key -> proto record)
export const HEURISTICS = new Map();  // list name -> [{ proto, fn, enabled }]
const EXPERTS = new Map();            // expert abbrev -> { severity, group, message }

export const SEVERITY_RANK = { chat: 1, note: 2, warn: 3, error: 4 };
const SEVERITY_LABEL = { chat: 'Chat', note: 'Note', warn: 'Warning', error: 'Error' };
// Wireshark's numeric expert severities/groups, so `_ws.expert.severity == warning` style filters have values.
const SEVERITY_NUM = { chat: 0x200000, note: 0x400000, warn: 0x600000, error: 0x800000 };
export const EXPERT_GROUPS = {
  Checksum: 0x01000000, Sequence: 0x02000000, 'Response Code': 0x03000000, 'Request Code': 0x04000000,
  Undecoded: 0x05000000, Reassemble: 0x06000000, Malformed: 0x07000000, Debug: 0x08000000,
  Protocol: 0x09000000, Security: 0x0a000000, Comment: 0x0b000000, Decryption: 0x0c000000,
  Assumption: 0x0d000000, Deprecated: 0x0e000000, Receive: 0x0f000000, Interface: 0x10000000,
};

// ---------------------------------------------------------------------------------------------
// Field types. Modules declare Wireshark-like widths ('uint16'); FIELDS stores the contract FT
// ('uint') plus `ftype` (the declared one) and `bits` for bitmask rendering.
const FT_MAP = {
  none: ['none', 0], protocol: ['protocol', 0], bool: ['bool', 0],
  uint8: ['uint', 8], uint16: ['uint', 16], uint24: ['uint', 24], uint32: ['uint', 32], uint: ['uint', 32],
  int8: ['int', 8], int16: ['int', 16], int24: ['int', 24], int32: ['int', 32], int: ['int', 32],
  uint64: ['uint64', 64], int64: ['int64', 64], float: ['float', 0], double: ['double', 0],
  string: ['string', 0], bytes: ['bytes', 0], ether: ['ether', 0], ipv4: ['ipv4', 0], ipv6: ['ipv6', 0],
  abs_time: ['abs_time', 0], rel_time: ['rel_time', 0], framenum: ['framenum', 0], guid: ['guid', 0],
  oid: ['oid', 0], char: ['char', 8],
};

function addField(protocol, abbrev, name, decl, opts) {
  const ft = FT_MAP[decl];
  if (!ft) throw new Error(`field ${abbrev}: unknown type ${decl}`);
  const o = opts || {};
  const f = {
    abbrev, name, type: ft[0], protocol,
    ftype: decl,
    bits: o.bits || ft[1],
    base: o.base || (ft[0] === 'uint' || ft[0] === 'int' || ft[0] === 'uint64' || ft[0] === 'int64' ? 'dec' : 'none'),
  };
  if (o.strings) f.strings = o.strings;
  if (o.mask) { f.bitmask = o.mask; f.shift = ctz(o.mask); }
  if (o.tfs) f.tfs = o.tfs;
  if (o.unit) f.unit = o.unit;   // appended to the value in labels: ' bytes', ' seconds'
  if (o.desc) f.desc = o.desc;
  FIELDS.set(abbrev, f);
  return f;
}

function ctz(m) { let s = 0; while (s < 32 && !((m >>> s) & 1)) s++; return s; }

/**
 * Register a protocol.
 * p = { abbrev, name, short, fields: [[abbrev, name, type, opts?]...], experts: [[abbrev, severity, group, message]...],
 *       dissect(ctx, off, end, arg) → number|false|undefined,  // false = "not mine" (nothing added)
 *       tables: { 'tcp.port': [80, 8080], ... }, heuristics: { tcp: fn(ctx, off, end) → bool },
 *       tcpPdu?(ctx, off, end) → pduLength | -1 (need more data, unknown) | 0 (cannot tell / not framed),
 *       enabled?: false }
 */
export function registerProtocol(p) {
  if (PROTO_BY_ABBREV.has(p.abbrev)) throw new Error(`protocol ${p.abbrev} registered twice`);
  const rec = {
    abbrev: p.abbrev, name: p.name, short: p.short || p.abbrev.toUpperCase(), enabled: p.enabled !== false,
    dissect: p.dissect || null, tcpPdu: p.tcpPdu || null, heurEnabled: p.heurEnabled,
  };
  PROTOCOLS.push(rec);
  PROTO_BY_ABBREV.set(p.abbrev, rec);
  if (!FIELDS.has(p.abbrev)) FIELDS.set(p.abbrev, { abbrev: p.abbrev, name: p.name, type: 'protocol', protocol: p.abbrev, ftype: 'protocol', bits: 0, base: 'none' });
  for (const fd of p.fields || []) addField(p.abbrev, fd[0], fd[1], fd[2], fd[3]);
  for (const e of p.experts || []) {
    EXPERTS.set(e[0], { severity: e[1], group: e[2], message: e[3] });
    if (!FIELDS.has(e[0])) addField(p.abbrev, e[0], e[3], 'none');
  }
  for (const [t, keys] of Object.entries(p.tables || {})) for (const k of keys) addToTable(t, k, rec);
  for (const [t, fn] of Object.entries(p.heuristics || {})) {
    let list = HEURISTICS.get(t);
    if (!list) HEURISTICS.set(t, list = []);
    list.push({ proto: rec, fn, enabled: p.heurEnabled?.[t] !== false });
  }
  return rec;
}

/** Add more fields to an already registered protocol (used by modules that extend another). */
export function registerFields(protocol, fields) {
  for (const fd of fields) addField(protocol, fd[0], fd[1], fd[2], fd[3]);
}

export function addToTable(table, key, proto) {
  let t = TABLES.get(table);
  if (!t) TABLES.set(table, t = new Map());
  t.set(key, typeof proto === 'string' ? PROTO_BY_ABBREV.get(proto) : proto);
}

export function getProtocol(abbrev) { return PROTO_BY_ABBREV.get(abbrev) || null; }
export function fieldInfo(abbrev) { return FIELDS.get(abbrev) || null; }
export function setHeuristicEnabled(list, abbrev, on) {
  for (const h of HEURISTICS.get(list) || []) if (h.proto.abbrev === abbrev) h.enabled = on;
}

// ---------------------------------------------------------------------------------------------
// Byte readers (big endian unless suffixed). Out-of-range reads are guarded by ctx.need().
export const u8 = (d, o) => d[o];
export const u16 = (d, o) => (d[o] << 8) | d[o + 1];
export const u24 = (d, o) => (d[o] << 16) | (d[o + 1] << 8) | d[o + 2];
export const u32 = (d, o) => ((d[o] << 24) | (d[o + 1] << 16) | (d[o + 2] << 8) | d[o + 3]) >>> 0;
export const u16le = (d, o) => d[o] | (d[o + 1] << 8);
export const u32le = (d, o) => (d[o] | (d[o + 1] << 8) | (d[o + 2] << 16) | (d[o + 3] << 24)) >>> 0;
export const u64 = (d, o) => (BigInt(u32(d, o)) << 32n) | BigInt(u32(d, o + 4));
export const u64le = (d, o) => (BigInt(u32le(d, o + 4)) << 32n) | BigInt(u32le(d, o));
export const i8 = (d, o) => (d[o] << 24) >> 24;
export const i16 = (d, o) => (u16(d, o) << 16) >> 16;
export const i32 = (d, o) => u32(d, o) | 0;

const HEX = [];
for (let i = 0; i < 256; i++) HEX.push((i < 16 ? '0' : '') + i.toString(16));
export const hex8 = (v) => HEX[v & 255];

export function mac(d, o) {
  return HEX[d[o]] + ':' + HEX[d[o + 1]] + ':' + HEX[d[o + 2]] + ':' + HEX[d[o + 3]] + ':' + HEX[d[o + 4]] + ':' + HEX[d[o + 5]];
}
export function ip4(d, o) { return d[o] + '.' + d[o + 1] + '.' + d[o + 2] + '.' + d[o + 3]; }
export function ip6(d, o) {
  // RFC 5952: compress the longest run (>=2) of zero groups, lowercase, no leading zeros.
  const g = new Array(8);
  for (let i = 0; i < 8; i++) g[i] = (d[o + 2 * i] << 8) | d[o + 2 * i + 1];
  let bs = -1, bl = 0;
  for (let i = 0; i < 8;) {
    if (g[i] !== 0) { i++; continue; }
    let j = i; while (j < 8 && g[j] === 0) j++;
    if (j - i > bl && j - i >= 2) { bs = i; bl = j - i; }
    i = j;
  }
  // IPv4-mapped / compatible forms as Wireshark prints them
  if (bs === 0 && bl === 5 && g[5] === 0xffff) return '::ffff:' + ip4(d, o + 12);
  let s = '';
  for (let i = 0; i < 8; i++) {
    if (i === bs) { s += '::'; i += bl - 1; continue; }
    if (s && !s.endsWith(':')) s += ':';
    s += g[i].toString(16);
  }
  return s;
}
export function hexStr(d, o, n, sep = '') {
  let s = '';
  for (let i = 0; i < n; i++) s += (i && sep ? sep : '') + HEX[d[o + i]];
  return s;
}
export function ascii(d, o, n) {
  let s = '';
  for (let i = 0; i < n; i++) s += String.fromCharCode(d[o + i]);
  return s;
}
const UTF8 = new TextDecoder('utf-8', { fatal: false });
export function utf8(d, o, n) { return UTF8.decode(d.subarray(o, o + n)); }
/** Printable string like Wireshark's format_text: control chars escaped. */
export function printable(s) {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0x20 && c !== 0x7f) out += s[i];
    else if (c === 10) out += '\\n';
    else if (c === 13) out += '\\r';
    else if (c === 9) out += '\\t';
    else out += '\\x' + HEX[c & 255];
  }
  return out;
}
/** Find CRLF/LF line end from o (bounded by end). Returns { next, eol } or null. */
export function findLineEnd(d, o, end) {
  for (let i = o; i < end; i++) {
    if (d[i] === 10) return { eol: i > o && d[i - 1] === 13 ? i - 1 : i, next: i + 1 };
  }
  return null;
}
export function hexPad(v, digits) {
  let s = (typeof v === 'bigint' ? v : v >>> 0).toString(16);
  while (s.length < digits) s = '0' + s;
  return '0x' + s;
}

// ---------------------------------------------------------------------------------------------
// Value formatting for labels.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const p2 = (n) => (n < 10 ? '0' : '') + n;
const p9 = (n) => String(n).padStart(9, '0');
export function formatAbsTime(t, utc = false) {
  const dt = new Date(t.sec * 1000);
  const Y = utc ? dt.getUTCFullYear() : dt.getFullYear();
  const M = utc ? dt.getUTCMonth() : dt.getMonth();
  const D = utc ? dt.getUTCDate() : dt.getDate();
  const h = utc ? dt.getUTCHours() : dt.getHours();
  const m = utc ? dt.getUTCMinutes() : dt.getMinutes();
  const s = utc ? dt.getUTCSeconds() : dt.getSeconds();
  return `${MONTHS[M]} ${p2(D)}, ${Y} ${p2(h)}:${p2(m)}:${p2(s)}.${p9(t.nsec)}${utc ? ' UTC' : ''}`;
}
/** Wireshark 4.6 style: seconds, milliseconds, microseconds or nanoseconds depending on magnitude. */
export function formatRelTime(v) {
  const a = Math.abs(v);
  if (a === 0) return '0.000000000 seconds';
  if (a >= 1) return v.toFixed(9) + ' seconds';
  if (a >= 1e-3) return (v * 1e3).toFixed(6) + ' milliseconds';
  if (a >= 1e-6) return (v * 1e6).toFixed(3) + ' microseconds';
  return (v * 1e9).toFixed(0) + ' nanoseconds';
}

function bitString(f, raw) {
  // raw: value positioned at the mask (unshifted). Width = declared bits.
  const w = f.bits || 8;
  const mask = f.bitmask;
  let s = '';
  for (let i = w - 1; i >= 0; i--) {
    const bit = 2 ** i;
    const inMask = Math.floor(mask / bit) % 2 === 1;
    s += inMask ? (Math.floor(raw / bit) % 2 === 1 ? '1' : '0') : '.';
    if (i % 4 === 0 && i) s += ' ';
  }
  return s;
}

function numStr(f, v) {
  switch (f.base) {
    case 'hex': return hexPad(v, (f.bits || 8) / 4);
    case 'dec_hex': return `${v} (${hexPad(v, (f.bits || 8) / 4)})`;
    case 'hex_dec': return `${hexPad(v, (f.bits || 8) / 4)} (${v})`;
    case 'oct': return '0' + v.toString(8);
    default: return String(v);
  }
}

/** Format a typed value as the details pane does (without the field name). */
export function formatValue(f, v, resolve) {
  if (typeof f === 'string') f = FIELDS.get(f);
  switch (f.type) {
    case 'uint': case 'int': case 'uint64': case 'int64': {
      const s = f.strings ? f.strings[v] : undefined;
      if (s !== undefined) {
        if (f.base === 'none') return s;
        return `${s} (${f.base === 'hex' || f.base === 'hex_dec' ? hexPad(v, (f.bits || 8) / 4) : v})`;
      }
      if (f.strings && f.base !== 'none') return `Unknown (${f.base === 'hex' || f.base === 'hex_dec' ? hexPad(v, (f.bits || 8) / 4) : v})`;
      return numStr(f, v) + (f.unit || '');
    }
    case 'bool': {
      const t = f.tfs || BOOL_DEFAULT;
      return v ? t[0] : t[1];
    }
    case 'string': return printable(String(v));
    case 'bytes': return v.length > 0 ? bytesShort(v, 120) : '<MISSING>';
    case 'ether': return resolve?.mac ? `${resolveMac(v)} (${v})` : v;
    case 'ipv4': case 'ipv6': return v;
    case 'abs_time': return formatAbsTime(v, f.abbrev.endsWith('_utc'));
    case 'rel_time': return formatRelTime(v);
    case 'framenum': return String(v);
    case 'float': case 'double': return String(v) + (f.unit || '');
    case 'char': return printable(String.fromCharCode(v));
    default: return v == null ? '' : String(v);
  }
}
const BOOL_DEFAULT = ['True', 'False'];
const BOOL_SET = ['Set', 'Not set'];
export { BOOL_SET };
function bytesShort(v, max) {
  const n = Math.min(v.length, max);
  let s = '';
  for (let i = 0; i < n; i++) s += HEX[v[i]];
  return n < v.length ? s + '…' : s;
}

/** Full label `Name: value`, with bitmask prefix for masked fields. */
export function formatLabel(f, v, resolve) {
  if (f.type === 'none' || f.type === 'protocol') return f.name;
  if (f.type === 'bytes' && v && v.length * 2 + f.name.length + 2 > 239) {
    // Wireshark caps labels at 240 bytes and marks the cut in the name: 'Data […]: 0000…'
    const keep = Math.max(0, 239 - (f.name.length + 7));
    return f.name + ' […]: ' + bytesShort(v, keep >> 1).replace('…', '') + (keep & 1 ? HEX[v[keep >> 1]][0] : '');
  }
  let body = f.name + ': ' + formatValue(f, v, resolve);
  if (f.bitmask) {
    let raw;
    if (f.type === 'bool') raw = v ? f.bitmask : 0;
    else raw = Number(v) * 2 ** f.shift;
    body = bitString(f, raw) + ' = ' + body;
  }
  return body;
}

// ---------------------------------------------------------------------------------------------
// Nodes
export class Node {
  constructor(abbrev, label, value, type, start, length, source) {
    this.abbrev = abbrev; this.label = label; this.value = value; this.type = type;
    this.start = start; this.length = length; this.source = source;
    this.children = null; this.generated = false; this.hidden = false; this.expert = null;
  }
}
// Returned when no tree is being built; adding to it is a no-op.
export const NULLNODE = Object.freeze(new Node(null, '', null, 'none', 0, 0, 0));

export class Truncated extends Error {
  constructor(at) { super('Packet is truncated'); this.at = at; }
}
export class Malformed extends Error {}

// ---------------------------------------------------------------------------------------------
// Per-dissection context (Wireshark's pinfo + tvb + tree in one object).
export class Ctx {
  constructor(session, frame, tree, first) {
    this.session = session;
    this.frame = frame;
    this.no = frame.no;
    this.tree = tree;
    this.first = first;                 // first pass: may update session state, must store results in fd
    this.fd = session._fd(frame.no);    // per-frame data stored on the first pass: { [proto]: any }
    this.d = frame.data;
    this.source = 0;
    this.sources = [{ name: `Frame (${frame.caplen ?? frame.data.length} bytes)`, data: frame.data }];
    this.roots = [];
    this.layers = [];
    this.experts = [];
    this.maxSev = 0;
    this.protocol = '';
    this.info = '';
    this.infoOwner = null;
    this.infoFenced = false;
    this.hwSrc = ''; this.hwDst = ''; this.netSrc = ''; this.netDst = '';
    this.srcport = null; this.dstport = null;
    this.ptype = '';                    // 'tcp' | 'udp' | 'sctp' once known
    this.net = null;                    // { type: 'ipv4'|'ipv6', src, dst, ttl } of the innermost IP header
    this.tcpStream = undefined; this.udpStream = undefined;
    this.depth = 0;
    this.resolve = session.prefs.resolve;
    this.vars = Object.create(null);    // scratch shared between layers of this packet
  }

  // --- tree building -------------------------------------------------------------------------
  /** Top-level protocol item; records the layer. */
  proto(abbrev, start, length, label) {
    this.layers.push(abbrev);
    if (!this.tree) return NULLNODE;
    const f = FIELDS.get(abbrev);
    const n = new Node(abbrev, label || f.name, null, 'protocol', start, length < 0 ? 0 : length, this.source);
    this.roots.push(n);
    return n;
  }
  /** Protocol item nested under a parent (e.g. reassembled payload inside another tree). */
  subProto(parent, abbrev, start, length, label) {
    this.layers.push(abbrev);
    if (!this.tree) return NULLNODE;
    const n = new Node(abbrev, label || FIELDS.get(abbrev).name, null, 'protocol', start, length, this.source);
    (parent === null ? this.roots : (parent.children || (parent.children = []))).push(n);
    return n;
  }
  add(parent, abbrev, start, length, value, label) {
    if (!this.tree || parent === NULLNODE) return NULLNODE;
    const f = FIELDS.get(abbrev);
    if (f === undefined) throw new Error('unregistered field ' + abbrev);
    const n = new Node(abbrev, label === undefined ? formatLabel(f, value, this.resolve) : label, value, f.type, start, length, this.source);
    (parent === null ? this.roots : (parent.children || (parent.children = []))).push(n);
    return n;
  }
  /** Generated (computed) field: shown in brackets, no bytes. */
  gen(parent, abbrev, value, label, start = 0, length = 0) {
    const n = this.add(parent, abbrev, start, length, value, label);
    if (n !== NULLNODE) n.generated = true;
    return n;
  }
  hidden(parent, abbrev, start, length, value) {
    if (!this.tree || parent === NULLNODE) return NULLNODE;
    const f = FIELDS.get(abbrev);
    if (f === undefined) throw new Error('unregistered field ' + abbrev);
    const n = new Node(abbrev, f.name, value, f.type, start, length, this.source);
    n.hidden = true;
    (parent === null ? this.roots : (parent.children || (parent.children = []))).push(n);
    return n;
  }
  text(parent, label, start = 0, length = 0) {
    if (!this.tree || parent === NULLNODE) return NULLNODE;
    const n = new Node(null, label, null, 'none', start, length, this.source);
    (parent === null ? this.roots : (parent.children || (parent.children = []))).push(n);
    return n;
  }
  /** Bitmask helper: adds one child per mask field of a parent integer. */
  bits(parent, start, length, raw, abbrevs) {
    if (!this.tree || parent === NULLNODE) return;
    for (const a of abbrevs) {
      const f = FIELDS.get(a);
      if (f === undefined) throw new Error('unregistered field ' + a);
      const m = f.bitmask;
      const v = f.type === 'bool' ? (raw & m) !== 0 : ((raw & m) >>> f.shift);
      this.add(parent, a, start, length, v);
    }
  }

  // --- expert info --------------------------------------------------------------------------
  /** Expert item; recorded even without a tree (summary severity). */
  ei(parent, abbrev, start = 0, length = 0, message) {
    const def = EXPERTS.get(abbrev);
    if (!def) throw new Error('unregistered expert ' + abbrev);
    const msg = message || def.message;
    const sev = def.severity;
    const r = SEVERITY_RANK[sev];
    if (r > this.maxSev) this.maxSev = r;
    const ex = { severity: sev, group: def.group, message: msg, abbrev, node: null };
    this.experts.push(ex);
    if (!this.tree || parent === NULLNODE) return NULLNODE;
    const box = this.text(parent, `Expert Info (${SEVERITY_LABEL[sev]}/${def.group}): ${msg}`, start, length);
    box.abbrev = '_ws.expert';
    box.type = 'none';
    box.generated = true;
    box.expert = ex;
    const n = this.add(box, abbrev, start, length, null, msg);
    n.generated = true;
    n.expert = ex;
    ex.node = n;
    this.gen(box, '_ws.expert.message', msg, 'Message: ' + msg).hidden = true;
    this.gen(box, '_ws.expert.severity', SEVERITY_NUM[sev], 'Severity level: ' + SEVERITY_LABEL[sev]);
    this.gen(box, '_ws.expert.group', EXPERT_GROUPS[def.group] || 0, 'Group: ' + def.group);
    return n;
  }

  // --- columns --------------------------------------------------------------------------------
  setProtocol(s) { this.protocol = s; }
  setInfo(s) { this.info = s; }
  appendInfo(s) { this.info = this.info ? this.info + s : s.replace(/^[ ,]+/, ''); }
  /** Set Info for this protocol's PDU; repeated PDUs of the same protocol in one frame are joined. */
  pduInfo(abbrev, s, sep = ', ') {
    if (this.infoOwner === abbrev && this.info) this.info += sep + s;
    else { this.info = s; this.infoOwner = abbrev; }
  }

  // --- bounds / errors ------------------------------------------------------------------------
  need(off, n, end) {
    const lim = end === undefined ? this.d.length : end;
    if (off + n > lim || n < 0) throw new Truncated(off + n);
  }

  // --- sources ----------------------------------------------------------------------------------
  /** Run fn with a new data source (reassembled/decrypted bytes). Returns fn's result. */
  withSource(name, data, fn) {
    let idx = this.sources.findIndex((s) => s.data === data);
    if (idx < 0) { idx = this.sources.length; this.sources.push({ name, data }); }
    const pd = this.d, ps = this.source;
    this.d = data; this.source = idx;
    try { return fn(); } finally { this.d = pd; this.source = ps; }
  }

  // --- dispatch -----------------------------------------------------------------------------------
  /** Look up a dissector-table entry honouring "Decode As". */
  lookup(table, key) {
    const da = this.session.decodeAs;
    if (da.size) {
      const o = da.get(table + ':' + key);
      if (o !== undefined) return o === null ? null : PROTO_BY_ABBREV.get(o) || null;
    }
    const t = TABLES.get(table);
    const p = t && t.get(key);
    if (!p || !p.enabled) return null;
    return this.session.disabled.size && this.session.disabled.has(p.abbrev) ? null : p;
  }
  /** Dispatch through a table. Returns the protocol record that took the data, or null. */
  dispatch(table, key, off, end, arg) {
    const p = this.lookup(table, key);
    if (!p) return null;
    return this.call(p, off, end, arg) === false ? null : p;
  }
  /** Call a protocol (record or abbrev). Exceptions become [Malformed Packet] / [Packet size limited]. */
  call(p, off, end, arg) {
    if (typeof p === 'string') p = PROTO_BY_ABBREV.get(p);
    if (!p || !p.dissect) return false;
    if (this.session.disabled.size && this.session.disabled.has(p.abbrev)) return false;
    this.depth++;
    if (this.depth > 40) { this.depth--; return false; }
    const nLayers = this.layers.length;
    try {
      return p.dissect(this, off, end, arg);
    } catch (e) {
      if (this.layers.length === nLayers) this.layers.push(p.abbrev);
      this.exception(e, p);
      return undefined;
    } finally { this.depth--; }
  }
  /** First heuristic protocol of a list whose check accepts the data (checks must not add items). */
  heuristic(list, off, end) {
    const hs = HEURISTICS.get(list);
    if (!hs) return null;
    for (const h of hs) {
      if (!h.enabled || !h.proto.enabled || this.session.disabled.has(h.proto.abbrev)) continue;
      let ok = false;
      try { ok = h.fn(this, off, end); } catch { ok = false; }
      if (ok) return h.proto;
    }
    return null;
  }
  exception(e, p) {
    const short = p ? p.short : 'Unknown';
    const truncatedCapture = e instanceof Truncated && this.source === 0 && this.frame.len > this.d.length && e.at > this.d.length;
    if (truncatedCapture) {
      this.layers.push('_ws.short');
      const n = this.proto('_ws.short', 0, 0, `[Packet size limited during capture: ${short} truncated]`);
      this.ei(n, '_ws.short.expert');
      this.appendInfo('[Packet size limited during capture]');
      this.layers.pop(); // Wireshark does not list _ws.short in frame.protocols
      return;
    }
    if (!(e instanceof Truncated) && !(e instanceof Malformed)) {
      if (this.session.prefs.debug) throw e;
      this.session.bugs.push({ frame: this.no, proto: p && p.abbrev, error: String(e && e.stack || e) });
    }
    this.malformed(short, e instanceof Malformed && e.message ? e.message : undefined);
  }
  /** Mark the rest of a PDU as malformed without an exception. */
  malformed(short, message) {
    // Wireshark adds the item without a layer (not in frame.protocols) and appends the text unseparated.
    const n = this.proto('_ws.malformed', 0, 0, `[Malformed Packet: ${short}]`);
    this.layers.pop();
    this.ei(n, '_ws.malformed.expert', 0, 0, message);
    this.info += '[Malformed Packet]';
  }

  /** Remaining payload as 'data'. */
  data(off, end) {
    if (end <= off) return;
    const n = this.proto('data', off, end - off);
    if (this.tree) {
      const v = this.d.subarray(off, end);
      this.add(n, 'data.data', off, end - off, v);
      this.gen(n, 'data.len', end - off);
    }
  }

  // --- addresses ----------------------------------------------------------------------------------
  setHw(src, dst) { this.hwSrc = src; this.hwDst = dst; }
  setNet(src, dst) { this.netSrc = src; this.netDst = dst; }
}

// ---------------------------------------------------------------------------------------------
// Session

const DEFAULT_PREFS = {
  resolve: { mac: true, transport: true, network: false },
  tcp: { analyze: true, relativeSeq: true, reassemble: true, checksum: false, calcWindowSize: true },
  udp: { checksum: false },
  ip: { checksum: false, reassemble: true },
  debug: false,
};

class Session {
  constructor(file, prefs) {
    this.file = file || null;
    const p = prefs || {};
    this.prefs = {
      ...DEFAULT_PREFS, ...p,
      resolve: { ...DEFAULT_PREFS.resolve, ...(p.resolve || {}) },
      tcp: { ...DEFAULT_PREFS.tcp, ...(p.tcp || {}) },
      udp: { ...DEFAULT_PREFS.udp, ...(p.udp || {}) },
      ip: { ...DEFAULT_PREFS.ip, ...(p.ip || {}) },
    };
    // "Decode As": Map('tcp.port:8080' -> 'http' | null to disable)
    this.decodeAs = new Map();
    // entries: { table, key | value, proto } (proto null = do not dissect)
    for (const e of p.decodeAs || []) {
      let k = e.key ?? e.value;
      if (typeof k === 'string' && /^(0x[0-9a-f]+|\d+)$/i.test(k)) k = Number(k);
      this.decodeAs.set(e.table + ':' + k, e.proto ?? null);
    }
    this.disabled = new Set(p.disabled || []);
    this.frameData = [];         // index = frame number
    this.summaries = [];         // index = frame number
    this.state = Object.create(null); // per-protocol session state
    this.firstTime = null;
    this.prevTime = null;
    this.lastNo = 0;
    this.bugs = [];              // dissector exceptions that were not truncation (for tests/diagnostics)
    this.convProtos = new Map(); // 'udp|addr|port' -> [{ proto, from }]
  }
  _fd(no) {
    let fd = this.frameData[no];
    if (!fd) this.frameData[no] = fd = Object.create(null);
    return fd;
  }
  /** Session-wide state object for a protocol (created on demand). */
  st(name, init) {
    let s = this.state[name];
    if (!s) this.state[name] = s = init ? init() : Object.create(null);
    return s;
  }
  /** Set a decode-as entry. Changing it requires a new session (first pass) to take full effect. */
  setDecodeAs(table, key, proto) {
    if (proto === undefined) this.decodeAs.delete(table + ':' + key);
    else this.decodeAs.set(table + ':' + key, proto);
  }
  /** Bind a protocol to (ptype, addr, port) from a frame onwards (FTP PASV, SDP media, TFTP...). */
  setConversationProto(ptype, addr, port, proto, fromFrame) {
    const k = ptype + '|' + addr + '|' + port;
    let l = this.convProtos.get(k);
    if (!l) this.convProtos.set(k, l = []);
    l.push({ proto, from: fromFrame });
  }
  conversationProto(ptype, addr, port, no) {
    const l = this.convProtos.get(ptype + '|' + addr + '|' + port);
    if (!l) return null;
    let best = null;
    for (const e of l) if (e.from <= no) best = e.proto;
    return best;
  }
  /**
   * Summary seen with knowledge of the whole file (like Wireshark's columns after the first pass):
   * forward references such as '(reply in 5)' or '[TCP PDU reassembled in 9]' are filled in.
   * Runs a tree-less dissection; call it for the rows on screen after the first pass.
   */
  summarize(frame) {
    if (!this.summaries[frame.no]) return this.firstPass(frame);
    return summarize(run(this, frame, false, false), frame);
  }
  firstPass(frame) {
    if (this.summaries[frame.no]) return this.summaries[frame.no];
    const ctx = run(this, frame, false, true);
    const s = summarize(ctx, frame);
    this.summaries[frame.no] = s;
    return s;
  }
}

export function createSession(file, prefs) { return new Session(file, prefs); }

function summarize(ctx, frame) {
  const s = {
    no: frame.no, protocol: ctx.protocol, info: ctx.info,
    src: colAddr(ctx, true), dst: colAddr(ctx, false),
    length: frame.len, layers: protocolsString(ctx.layers),
    // Tree-less passes skip much of the expert work, so 'none seen' is not 'none': undefined = unknown.
    expert: ctx.maxSev ? SEV_BY_RANK[ctx.maxSev] : ctx.tree ? null : undefined,
  };
  if (ctx.tcpStream !== undefined) s.tcpStream = ctx.tcpStream;
  if (ctx.udpStream !== undefined) s.udpStream = ctx.udpStream;
  if (ctx.srcport != null) { s.srcport = ctx.srcport; s.dstport = ctx.dstport; }
  return s;
}
/** frame.protocols text: layers without the leading frame. */
export function protocolsString(layers) { return (layers[0] === 'frame' ? layers.slice(1) : layers).join(':'); }
const SEV_BY_RANK = [null, 'chat', 'note', 'warn', 'error'];

function colAddr(ctx, src) {
  const net = src ? ctx.netSrc : ctx.netDst;
  if (net) return net;
  const hw = src ? ctx.hwSrc : ctx.hwDst;
  if (hw && ctx.resolve.mac && hw.length === 17) return resolveMac(hw);
  return hw;
}

// ---------------------------------------------------------------------------------------------
// Running a dissection

let frameProto = null;
export function setFrameDissector(fn) { frameProto = fn; }

function run(session, frame, tree, first) {
  const ctx = new Ctx(session, frame, tree, first);
  frameProto(ctx);
  return ctx;
}

/** Full dissection of one frame. Runs the first pass first if the frame was never seen. */
export function dissect(session, frame, opts) {
  if (!session.summaries[frame.no]) {
    // Frames must be visited in order; catch up any skipped ones that the caller can provide.
    session.firstPass(frame);
  }
  const tree = !opts || opts.tree !== false;
  const ctx = run(session, frame, tree, false);
  const fields = new Map();
  if (tree) collect(ctx.roots, fields);
  return {
    tree: ctx.roots,
    columns: {
      protocol: ctx.protocol, info: ctx.info,
      src: colAddr(ctx, true), dst: colAddr(ctx, false),
      hwSrc: ctx.hwSrc, hwDst: ctx.hwDst, netSrc: ctx.netSrc, netDst: ctx.netDst,
      srcport: ctx.srcport, dstport: ctx.dstport,
    },
    fields,
    layers: ctx.layers,
    expert: ctx.experts,
    sources: ctx.sources,
  };
}

function collect(nodes, map) {
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (n.abbrev !== null) {
      const a = map.get(n.abbrev);
      if (a) a.push(n); else map.set(n.abbrev, [n]);
    }
    if (n.children) collect(n.children, map);
  }
}

// Fields every capture has, registered here so core does not depend on proto modules.
registerProtocol({
  abbrev: '_ws.expert', name: 'Expert Info', short: 'Expert',
  fields: [
    ['_ws.expert.message', 'Message', 'string'],
    ['_ws.expert.group', 'Group', 'uint32', { base: 'hex' }],
    ['_ws.expert.severity', 'Severity level', 'uint32', { base: 'hex' }],
  ],
});
registerProtocol({
  abbrev: '_ws.malformed', name: 'Malformed Packet', short: 'Malformed',
  experts: [['_ws.malformed.expert', 'error', 'Malformed', 'Malformed Packet (Exception occurred)']],
});
registerProtocol({
  abbrev: '_ws.short', name: 'Short Frame', short: 'Short',
  experts: [['_ws.short.expert', 'error', 'Malformed', 'Packet size limited during capture']],
});
registerProtocol({
  abbrev: 'data', name: 'Data', short: 'DATA',
  fields: [['data.data', 'Data', 'bytes'], ['data.len', 'Length', 'uint32'], ['data.text', 'Text', 'string']],
});

export { serviceName };
