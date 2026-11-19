// Typed values for display filters: canonical forms of node values, literal parsing per field
// type, and the comparison primitives.
//
// Canonical forms (what comparisons see):
//   uint/int/framenum/char/float/double/rel_time → number    uint64/int64 → bigint
//   bool → 0|1    string/oid → string    guid → lowercase string
//   bytes/ether/ipv6/protocol/none → Uint8Array    ipv4 → uint32 number    abs_time → seconds (number)
// Literal-only forms: { cidr: 4|6, net, mask|bits }  (address with prefix length)
import { FILTER_ERRORS as E, FilterError, typeDescription } from './errors.js';

export const NUMERIC = new Set(['uint', 'int', 'uint64', 'int64', 'float', 'double', 'rel_time', 'framenum', 'char', 'bool', 'abs_time']);
export const INTEGER = new Set(['uint', 'int', 'uint64', 'int64', 'framenum', 'char', 'bool']);
export const BYTESLIKE = new Set(['bytes', 'ether', 'ipv6', 'protocol', 'none', 'guid', 'ipv4']);
export const STRINGLIKE = new Set(['string', 'oid']);

const UTF8E = new TextEncoder();
const UTF8D = new TextDecoder();
export const utf8 = (s) => UTF8E.encode(s);
export const fromUtf8 = (b) => UTF8D.decode(b);
export function latin1(b) {
  let s = '';
  for (let i = 0; i < b.length; i += 4096) s += String.fromCharCode.apply(null, b.subarray(i, i + 4096));
  return s;
}

// ------------------------------------------------------------------------------------------------
// Node → canonical value

/** Bytes covered by a node in its data source (protocol fields, '@field', slices of protocols). */
export function nodeBytes(d, node) {
  const src = d.sources && d.sources[node.source || 0];
  if (!src || !src.data) return new Uint8Array(0);
  const s = node.start || 0;
  const len = node.length || 0;
  return src.data.subarray(s, Math.min(src.data.length, s + len));
}

export function protoBytes(d, node) {
  const src = d.sources && d.sources[node.source || 0];
  if (!src || !src.data) return new Uint8Array(0);
  return src.data.subarray(Math.min(node.start || 0, src.data.length));
}

export const nsRound = (x) => Math.round(x * 1e9) / 1e9;

export function ip4ToNum(s) {
  if (typeof s === 'number') return s >>> 0;
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(String(s));
  if (!m) return null;
  const a = +m[1], b = +m[2], c = +m[3], e = +m[4];
  if (a > 255 || b > 255 || c > 255 || e > 255) return null;
  return ((a << 24) | (b << 16) | (c << 8) | e) >>> 0;
}
export const numToIp4 = (n) => `${n >>> 24}.${(n >>> 16) & 255}.${(n >>> 8) & 255}.${n & 255}`;

export function ip6ToBytes(s) {
  if (s instanceof Uint8Array) return s;
  s = String(s);
  const pct = s.indexOf('%');
  if (pct >= 0) s = s.slice(0, pct);
  if (!/^[0-9a-fA-F:.]+$/.test(s) || !s.includes(':')) return null;
  let tail4 = null;
  const lastColon = s.lastIndexOf(':');
  if (s.indexOf('.', lastColon) >= 0) {
    const v4 = ip4ToNum(s.slice(lastColon + 1));
    if (v4 === null) return null;
    tail4 = v4;
    s = s.slice(0, lastColon + 1) + '0:0';
  }
  const dbl = s.split('::');
  if (dbl.length > 2) return null;
  const parseGroups = (x) => (x === '' ? [] : x.split(':'));
  const head = parseGroups(dbl[0]);
  const tail = dbl.length === 2 ? parseGroups(dbl[1]) : [];
  if (dbl.length === 1 && head.length !== 8) return null;
  if (head.length + tail.length > (dbl.length === 2 ? 7 : 8)) return null;
  const groups = [...head, ...new Array(8 - head.length - tail.length).fill('0'), ...tail];
  const out = new Uint8Array(16);
  for (let i = 0; i < 8; i++) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(groups[i])) return null;
    const v = parseInt(groups[i], 16);
    out[i * 2] = v >> 8; out[i * 2 + 1] = v & 255;
  }
  if (tail4 !== null) { out[12] = tail4 >>> 24; out[13] = (tail4 >>> 16) & 255; out[14] = (tail4 >>> 8) & 255; out[15] = tail4 & 255; }
  return out;
}

export function bytesToIp6(b) {
  const g = [];
  for (let i = 0; i < 16; i += 2) g.push(((b[i] << 8) | b[i + 1]).toString(16));
  // longest run of zero groups → '::'
  let best = -1, bestLen = 0;
  for (let i = 0; i < 8;) {
    if (g[i] !== '0') { i++; continue; }
    let j = i;
    while (j < 8 && g[j] === '0') j++;
    if (j - i > bestLen && j - i > 1) { best = i; bestLen = j - i; }
    i = j;
  }
  if (best < 0) return g.join(':');
  return g.slice(0, best).join(':') + '::' + g.slice(best + bestLen).join(':');
}

/** Parse a byte string: "aa:bb:cc", "aa-bb", "aabb.ccdd", "aa bb"? (no), "aabbcc" (even length). */
export function parseByteString(s) {
  s = String(s);
  if (/^[0-9a-fA-F]{1,2}([:\-.][0-9a-fA-F]{1,2})+$/.test(s) && !/^[0-9a-fA-F]{4}(\.[0-9a-fA-F]{4})+$/.test(s)) {
    const sep = s.match(/[:\-.]/)[0];
    const parts = s.split(sep);
    if (parts.some((p) => p.length === 0 || /[:\-.]/.test(p))) return null;
    return Uint8Array.from(parts.map((p) => parseInt(p, 16)));
  }
  if (/^[0-9a-fA-F]{4}(\.[0-9a-fA-F]{4})+$/.test(s)) return parseByteString(s.replace(/\./g, ''));
  if (/^([0-9a-fA-F]{2})+$/.test(s)) {
    const out = new Uint8Array(s.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(s.substr(i * 2, 2), 16);
    return out;
  }
  if (/^[0-9a-fA-F]{2}$/.test(s)) return Uint8Array.of(parseInt(s, 16));
  return null;
}

export function etherBytes(v) {
  if (v instanceof Uint8Array) return v;
  return parseByteString(v) || new Uint8Array(0);
}

function guidString(v) {
  if (v instanceof Uint8Array) {
    const h = Array.from(v, (b) => b.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }
  return String(v).toLowerCase();
}

/** Canonical value of a node for comparisons. */
export function canon(node, d) {
  const v = node.value;
  switch (node.type) {
    // relative times are nanosecond counts in Wireshark; round so 0.006 == computed 0.0060000000002
    case 'rel_time': return nsRound(Number(v));
    case 'uint': case 'int': case 'framenum': case 'float': case 'double':
      return typeof v === 'bigint' ? Number(v) : typeof v === 'boolean' ? (v ? 1 : 0) : v;
    case 'char': return typeof v === 'string' ? v.charCodeAt(0) : v;
    case 'uint64': case 'int64': return typeof v === 'bigint' ? v : BigInt(Math.trunc(Number(v)));
    case 'bool': return v ? 1 : 0;
    case 'string': case 'oid': return v == null ? '' : String(v);
    case 'guid': return guidString(v);
    case 'bytes': return v instanceof Uint8Array ? v : v == null ? nodeBytes(d, node) : Array.isArray(v) ? Uint8Array.from(v) : (parseByteString(v) || utf8(String(v)));
    case 'ether': return etherBytes(v);
    case 'ipv4': return ip4ToNum(v);
    case 'ipv6': return ip6ToBytes(v) || new Uint8Array(16);
    case 'abs_time': return v && typeof v === 'object' ? v.sec + (v.nsec || 0) / 1e9 : Number(v);
    // A protocol's value is its tvb: from its first byte to the end of the data source (Wireshark),
    // so 'udp contains "x"' searches the payload too while len(udp) is the header length.
    case 'protocol': return protoBytes(d, node);
    case 'none': return nodeBytes(d, node);
    default: return v;
  }
}

/** Bytes view of a canonical value (slicing, len(), contains on byte-like types). */
export function asBytes(v, ft) {
  if (v instanceof Uint8Array) return v;
  if (typeof v === 'string') return utf8(v);
  if (ft === 'ipv4' && typeof v === 'number') return Uint8Array.of(v >>> 24, (v >>> 16) & 255, (v >>> 8) & 255, v & 255);
  if (ft === 'guid' && typeof v === 'string') return parseByteString(v.replace(/-/g, '')) || utf8(v);
  return null;
}

/** Display string of a canonical value (string() function, error messages). */
export function asString(v, ft) {
  if (typeof v === 'string') return v;
  if (typeof v === 'bigint') return v.toString();
  if (typeof v === 'number') {
    if (ft === 'ipv4') return numToIp4(v);
    if (ft === 'bool') return v ? 'True' : 'False';
    if (ft === 'char') return String.fromCharCode(v);
    return String(v);
  }
  if (v instanceof Uint8Array) {
    if (ft === 'ipv6' && v.length === 16) return bytesToIp6(v);
    if (ft === 'string') return fromUtf8(v);
    return Array.from(v, (b) => b.toString(16).padStart(2, '0')).join(':');
  }
  return String(v);
}

// ------------------------------------------------------------------------------------------------
// Literals

/** Parse an integer literal: decimal, 0x hex, 0 octal, 0b binary, with optional sign. */
export function parseInteger(s) {
  s = String(s).trim();
  let neg = false;
  if (s[0] === '-' || s[0] === '+') { neg = s[0] === '-'; s = s.slice(1); }
  let v;
  if (/^0[xX][0-9a-fA-F]+$/.test(s)) v = BigInt(s);
  else if (/^0[bB][01]+$/.test(s)) v = BigInt(s);
  else if (/^0[0-7]+$/.test(s)) v = BigInt('0o' + s.slice(1));
  else if (/^\d+$/.test(s)) v = BigInt(s);
  else return null;
  return neg ? -v : v;
}

export function parseFloatLit(s) {
  s = String(s).trim();
  if (/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(s)) return Number(s);
  const i = parseInteger(s);
  return i === null ? null : Number(i);
}

const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

/** Absolute time literal → seconds since the epoch (float). Local time unless 'Z'/'UTC'/offset given. */
export function parseAbsTime(s) {
  s = String(s).trim();
  let m;
  const frac = (f) => (f ? Number('0.' + f) : 0);
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s); // epoch seconds
  if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?)?\s*(Z|UTC|[+-]\d{2}:?\d{2})?$/i.exec(s))) {
    const [, Y, Mo, D, h = '0', mi = '0', se = '0', f, tz] = m;
    return dateSeconds(+Y, +Mo - 1, +D, +h, +mi, +se, tz) + frac(f);
  }
  if ((m = /^([A-Za-z]{3})[a-z]*\s+(\d{1,2}),?\s+(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?)?\s*(Z|UTC|[+-]\d{2}:?\d{2}|[A-Z]{2,5})?$/.exec(s))) {
    const mon = MONTHS[m[1].toLowerCase()];
    if (mon === undefined) return null;
    const [, , D, Y, h = '0', mi = '0', se = '0', f, tz] = m;
    return dateSeconds(+Y, mon, +D, +h, +mi, +se, tz && /^(Z|UTC|[+-]\d)/i.test(tz) ? tz : null) + frac(f);
  }
  return null;
}

function dateSeconds(Y, Mo, D, h, mi, se, tz) {
  if (!tz) return new Date(Y, Mo, D, h, mi, se).getTime() / 1000;
  const utc = Date.UTC(Y, Mo, D, h, mi, se) / 1000;
  if (/^(Z|UTC)$/i.test(tz)) return utc;
  const m = /^([+-])(\d{2}):?(\d{2})$/.exec(tz);
  const off = (+m[2] * 60 + +m[3]) * 60 * (m[1] === '-' ? -1 : 1);
  return utc - off;
}

function lookupStrings(info, text) {
  if (!info || !info.strings) return undefined;
  const want = text.toLowerCase();
  for (const [k, label] of Object.entries(info.strings)) {
    if (String(label).toLowerCase() === want) {
      const n = Number(k);
      return Number.isNaN(n) ? k : n;
    }
  }
  return undefined;
}

/**
 * Convert a literal AST node ('word' | 'str' | 'char') to the canonical form for field type `ft`.
 * Throws FilterError with Wireshark-like messages. `info` = FIELDS entry (value strings, bits).
 */
export function parseLiteral(lit, ft, info) {
  const at = lit.at, end = lit.end;
  const desc = typeDescription(ft, info);
  const text = lit.k === 'word' ? lit.text.replace(/^:(?!:)/, '') : lit.k === 'str' ? lit.str : String.fromCodePoint(lit.code);
  const cannot = () => new FilterError(E.INVALID_VALUE, `"${text}" cannot be converted to ${desc}.`, at, end, { value: text, type: desc });
  const noString = () => new FilterError(E.STRING_NOT_ALLOWED, `${desc} cannot be converted from a string ("${text}").`, at, end, { value: text, type: desc });

  switch (ft) {
    case 'uint': case 'int': case 'framenum': case 'char': case 'uint64': case 'int64': {
      if (lit.k === 'char') return ft === 'uint64' || ft === 'int64' ? BigInt(lit.code) : lit.code;
      let v = lit.k === 'word' ? parseInteger(text) : null;
      if (v === null) {
        const vs = lookupStrings(info, text);
        if (vs !== undefined) return ft === 'uint64' || ft === 'int64' ? BigInt(vs) : vs;
        if (lit.k === 'str') throw noString();
        const f = parseFloatLit(text);
        if (f !== null) throw new FilterError(E.INVALID_VALUE, `Double ${text} cannot be converted to ${desc}.`, at, end, { value: text, type: desc });
        throw cannot();
      }
      if ((ft === 'uint' || ft === 'uint64' || ft === 'framenum') && v < 0n) throw cannot();
      const bits = info && info.bits;
      if (bits && bits < 64 && (ft === 'uint' || ft === 'framenum') && v >= (1n << BigInt(bits)) && !(info && info.bitmask)) {
        throw new FilterError(E.INVALID_VALUE, `${text} too big for this field, maximum ${(1n << BigInt(bits)) - 1n}.`, at, end, { value: text, type: desc });
      }
      return ft === 'uint64' || ft === 'int64' ? v : Number(v);
    }
    case 'bool': {
      const t = text.toLowerCase();
      if (lit.k !== 'str') {
        if (t === 'true') return 1;
        if (t === 'false') return 0;
        const v = parseInteger(text);
        if (v !== null) return v === 0n ? 0 : 1;
      }
      if (info && info.tfs) {
        if (t === String(info.tfs[0]).toLowerCase()) return 1;
        if (t === String(info.tfs[1]).toLowerCase()) return 0;
      }
      if (t === 'set') return 1;
      if (t === 'not set') return 0;
      if (lit.k === 'str') throw noString();
      throw cannot();
    }
    case 'float': case 'double': case 'rel_time': {
      if (lit.k === 'char') return lit.code;
      const v = parseFloatLit(text);
      if (v === null) { if (lit.k === 'str') throw noString(); throw cannot(); }
      return ft === 'rel_time' ? nsRound(v) : v;
    }
    case 'abs_time': {
      const v = parseAbsTime(text);
      if (v === null) throw new FilterError(E.INVALID_VALUE, `"${text}" is not a valid absolute time. Example: "Nov 12, 1999 08:55:44.123" or "2011-07-04 12:34:56"`, at, end, { value: text, type: desc });
      return v;
    }
    case 'string': case 'oid':
      return text;
    case 'guid':
      return text.toLowerCase();
    case 'ipv4': {
      const m = /^([^/]+)(?:\/(\d+))?$/.exec(text);
      const n = m ? ip4ToNum(m[1]) : null;
      if (n === null) throw new FilterError(E.INVALID_ADDRESS, `"${text}" is not a valid hostname or IPv4 address.`, at, end, { value: text, type: desc });
      if (m[2] !== undefined) {
        const bits = +m[2];
        if (bits > 32) throw new FilterError(E.INVALID_ADDRESS, `Netmask bits in a CIDR IPv4 address should be <= 32, not ${bits}`, at, end, { value: text });
        const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
        return { cidr: 4, net: (n & mask) >>> 0, mask, bits };
      }
      return n;
    }
    case 'ipv6': {
      const m = /^([^/]+)(?:\/(\d+))?$/.exec(text);
      const b = m ? ip6ToBytes(m[1]) : null;
      if (!b) throw new FilterError(E.INVALID_ADDRESS, `"${text}" is not a valid hostname or IPv6 address.`, at, end, { value: text, type: desc });
      if (m[2] !== undefined) {
        const bits = +m[2];
        if (bits > 128) throw new FilterError(E.INVALID_ADDRESS, `Prefix in a IPv6 address should be <= 128, not ${bits}`, at, end, { value: text });
        return { cidr: 6, net: b, bits };
      }
      return b;
    }
    case 'ether': {
      if (lit.k === 'char') throw cannot();
      const b = parseByteString(text);
      if (!b) throw new FilterError(E.INVALID_ADDRESS, `"${text}" is not a valid hostname or Ethernet address.`, at, end, { value: text, type: desc });
      if (b.length > 6) throw new FilterError(E.TOO_MANY_BYTES, `"${text}" contains too many bytes to be a valid Ethernet address.`, at, end, { value: text });
      if (b.length < 6) throw new FilterError(E.INVALID_ADDRESS, `"${text}" contains too few bytes to be a valid Ethernet address.`, at, end, { value: text });
      return b;
    }
    case 'bytes': case 'protocol': case 'none': default: {
      if (lit.k === 'str') return lit.bytes;
      if (lit.k === 'char') return Uint8Array.of(lit.code & 255);
      // A single integer is one byte ("frame[12] == 8", "== 0x08"); otherwise a byte string.
      const iv = parseInteger(text);
      if (iv !== null && iv >= 0n && iv <= 255n && !/^[0-9a-fA-F]{4,}$/.test(text)) return Uint8Array.of(Number(iv));
      const b = parseByteString(text);
      if (!b) throw new FilterError(E.INVALID_VALUE, `"${text}" is not a valid byte string.`, at, end, { value: text, type: desc });
      return b;
    }
  }
}

// ------------------------------------------------------------------------------------------------
// Comparison primitives

export function cmpBytes(a, b) {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  return a.length === b.length ? 0 : a.length < b.length ? -1 : 1;
}

/** Order two canonical values; NaN when not comparable. */
export function order(a, b) {
  const ta = typeof a, tb = typeof b;
  if (ta === 'number') {
    if (tb === 'number') return a < b ? -1 : a > b ? 1 : a === b ? 0 : NaN;
    if (tb === 'bigint') return Number.isInteger(a) ? cmpBig(BigInt(a), b) : (a < Number(b) ? -1 : a > Number(b) ? 1 : 0);
    if (b && b.cidr === 4) return order(a, b.net);
    return NaN;
  }
  if (ta === 'bigint') {
    if (tb === 'bigint') return cmpBig(a, b);
    if (tb === 'number') return -order(b, a);
    return NaN;
  }
  if (ta === 'string') {
    if (tb === 'string') return a < b ? -1 : a > b ? 1 : 0;
    if (b instanceof Uint8Array) return cmpBytes(utf8(a), b);
    return NaN;
  }
  if (a instanceof Uint8Array) {
    if (b instanceof Uint8Array) return cmpBytes(a, b);
    if (tb === 'string') return cmpBytes(a, utf8(b));
    if (b && b.cidr === 6) return cmpBytes(a, b.net);
    return NaN;
  }
  if (a && a.cidr) return -order(b, a);
  return NaN;
}
const cmpBig = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

function inCidr(v, c) {
  if (c.cidr === 4) return typeof v === 'number' && ((v & c.mask) >>> 0) === c.net;
  if (!(v instanceof Uint8Array) || v.length !== 16) return false;
  let bits = c.bits;
  for (let i = 0; i < 16 && bits > 0; i++, bits -= 8) {
    const m = bits >= 8 ? 0xff : (0xff << (8 - bits)) & 0xff;
    if ((v[i] & m) !== (c.net[i] & m)) return false;
  }
  return true;
}

export function equal(a, b) {
  if (b !== null && typeof b === 'object' && b.cidr) return inCidr(a, b);
  if (a !== null && typeof a === 'object' && a.cidr) return inCidr(b, a);
  if (typeof a === 'number' && typeof b === 'number') return a === b;
  return order(a, b) === 0;
}

export function contains(a, b) {
  if (typeof a === 'string') {
    if (typeof b === 'string') return a.includes(b);
    if (b instanceof Uint8Array) return indexOfBytes(utf8(a), b) >= 0;
    return false;
  }
  if (a instanceof Uint8Array) {
    const bb = typeof b === 'string' ? utf8(b) : b;
    return bb instanceof Uint8Array && indexOfBytes(a, bb) >= 0;
  }
  return false;
}

export function indexOfBytes(hay, needle) {
  const n = needle.length;
  if (n === 0) return 0;
  const first = needle[0];
  const last = hay.length - n;
  outer: for (let i = 0; i <= last; i++) {
    if (hay[i] !== first) continue;
    for (let j = 1; j < n; j++) if (hay[i + j] !== needle[j]) continue outer;
    return i;
  }
  return -1;
}
