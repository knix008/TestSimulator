// "Apply as Filter" / "Prepare as Filter" and "Conversation Filter" text builders.
import { getDefaultFields } from './registry.js';

const HEX2 = (b) => b.toString(16).padStart(2, '0');

function quote(s) {
  let out = '"';
  for (const ch of String(s)) {
    const c = ch.codePointAt(0);
    if (ch === '"' || ch === '\\') out += '\\' + ch;
    else if (c === 10) out += '\\n';
    else if (c === 13) out += '\\r';
    else if (c === 9) out += '\\t';
    else if (c < 0x20 || c === 0x7f) out += '\\x' + HEX2(c);
    else out += ch;
  }
  return out + '"';
}

function pad9(n) { return String(n).padStart(9, '0'); }

/**
 * The literal Wireshark writes for a node value in "Apply as Filter" (per field type and display base).
 * Returns null when the value cannot be written (the caller then filters on presence).
 */
export function formatFilterValue(node, info) {
  const v = node.value;
  switch (node.type) {
    case 'uint': case 'uint64': case 'int': case 'int64': {
      if (v == null) return null;
      const base = info && info.base;
      if ((base === 'hex' || base === 'hex_dec') && (typeof v === 'bigint' ? v >= 0n : v >= 0)) {
        const digits = Math.max(1, Math.ceil(((info && info.bits) || 8) / 4));
        return '0x' + v.toString(16).padStart(digits, '0');
      }
      if (base === 'oct') return '0' + v.toString(8);
      return String(v);
    }
    case 'framenum': case 'float': case 'double': return v == null ? null : String(v);
    case 'char': return v == null ? null : '0x' + HEX2(typeof v === 'string' ? v.charCodeAt(0) : v);
    case 'bool': return v ? '1' : '0';
    case 'string': return v == null ? null : quote(v);
    case 'oid': case 'guid': case 'ipv4': case 'ipv6': case 'ether': return v == null ? null : String(v);
    case 'bytes': {
      if (!(v instanceof Uint8Array) || v.length === 0) return null;
      return Array.from(v, HEX2).join(':');
    }
    case 'abs_time': {
      if (!v || typeof v !== 'object') return null;
      const iso = new Date(v.sec * 1000).toISOString().slice(0, 19).replace('T', ' ');
      return `"${iso}.${pad9(v.nsec || 0)}Z"`;
    }
    case 'rel_time': return v == null ? null : Number(v).toFixed(9);
    default: return null;
  }
}

/** Combine a new expression with the current filter like Wireshark's Apply/Prepare as Filter sub-menu. */
export function combineFilters(current, expr, mode = 'selected') {
  const old = String(current || '').trim();
  switch (mode) {
    case 'selected': return expr;
    case 'not': return `!(${expr})`;
    case 'and': return old ? `(${old}) && (${expr})` : expr;
    case 'or': return old ? `(${old}) || (${expr})` : expr;
    case 'andNot': return old ? `(${old}) && !(${expr})` : `!(${expr})`;
    case 'orNot': return old ? `(${old}) || !(${expr})` : `!(${expr})`;
    default: throw new Error(`unknown filter mode "${mode}"`);
  }
}

/**
 * Filter text for a details-pane node. Text-only nodes (no abbrev) → null.
 * opts: { mode: 'selected'|'not'|'and'|'or'|'andNot'|'orNot', current: existing filter text, fields }
 */
export function filterForNode(node, opts = {}) {
  if (!node || !node.abbrev) return null;
  const fields = opts.fields || getDefaultFields();
  const info = fields ? fields.get(node.abbrev) : null;
  let expr;
  if (node.type === 'protocol' || node.type === 'none') expr = node.abbrev;
  else {
    const lit = formatFilterValue(node, info);
    expr = lit === null ? node.abbrev : `${node.abbrev} == ${lit}`;
  }
  return combineFilters(opts.current, expr, opts.mode || 'selected');
}

// ------------------------------------------------------------------------------------------------
// Conversation filters

const MAC = /^[0-9a-f]{2}(:[0-9a-f]{2}){5}$/i;
const IP4 = /^\d{1,3}(\.\d{1,3}){3}$/;
const isIp6 = (s) => typeof s === 'string' && s.includes(':') && !MAC.test(s) && /^[0-9a-f:.]+$/i.test(s);

function first(d, name) {
  const ns = d.fields && d.fields.get(name);
  return ns && ns.length ? ns[0].value : undefined;
}

/** Endpoints of a packet: { eth: [a, b], ip: [a, b], ipv6: [a, b], tcp: [p, q], udp: [p, q], sctp: [p, q] }. */
export function packetEndpoints(x) {
  const e = {};
  if (x && x.fields instanceof Map) {
    const pair = (a, b) => { const s = first(x, a), t = first(x, b); return s !== undefined && t !== undefined ? [String(s), String(t)] : null; };
    e.eth = pair('eth.src', 'eth.dst');
    e.ip = pair('ip.src', 'ip.dst');
    e.ipv6 = pair('ipv6.src', 'ipv6.dst');
    e.tcp = pair('tcp.srcport', 'tcp.dstport');
    e.udp = pair('udp.srcport', 'udp.dstport');
    e.sctp = pair('sctp.srcport', 'sctp.dstport');
    if (!e.eth && x.columns && MAC.test(x.columns.hwSrc || '') && MAC.test(x.columns.hwDst || '')) e.eth = [x.columns.hwSrc, x.columns.hwDst];
    return e;
  }
  if (!x) return e;
  const layers = String(x.layers || '').split(':');
  const src = x.src, dst = x.dst;
  if (MAC.test(src || '') && MAC.test(dst || '')) e.eth = [src, dst];
  if (IP4.test(src || '') && IP4.test(dst || '')) e.ip = [src, dst];
  if (isIp6(src) && isIp6(dst)) e.ipv6 = [src, dst];
  if (x.srcport != null && x.dstport != null) {
    const pp = [String(x.srcport), String(x.dstport)];
    if (layers.includes('tcp')) e.tcp = pp;
    else if (layers.includes('udp')) e.udp = pp;
    else if (layers.includes('sctp')) e.sctp = pp;
  }
  return e;
}

/**
 * Wireshark's "Conversation Filter" for a packet (Summary or Dissection).
 * kind: 'eth' | 'ip' | 'ipv4' | 'ipv6' | 'tcp' | 'udp' | 'sctp'. Returns null when the packet has no such conversation.
 */
export function conversationFilter(kind, x) {
  const e = packetEndpoints(x);
  const net = e.ip ? ['ip', e.ip] : e.ipv6 ? ['ipv6', e.ipv6] : null;
  switch (kind) {
    case 'eth': return e.eth ? `eth.addr==${e.eth[0]} && eth.addr==${e.eth[1]}` : null;
    case 'ip': case 'ipv4': return e.ip ? `ip.addr==${e.ip[0]} && ip.addr==${e.ip[1]}` : null;
    case 'ipv6': return e.ipv6 ? `ipv6.addr==${e.ipv6[0]} && ipv6.addr==${e.ipv6[1]}` : null;
    case 'tcp': case 'udp': case 'sctp': {
      const pp = e[kind];
      if (!pp) return null;
      if (!net) return `${kind}.port==${pp[0]} && ${kind}.port==${pp[1]}`;
      const [n, a] = net;
      return `${n}.addr==${a[0]} && ${kind}.port==${pp[0]} && ${n}.addr==${a[1]} && ${kind}.port==${pp[1]}`;
    }
    default: return null;
  }
}
