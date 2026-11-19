// Payload builders for name services and UDP management protocols (DNS, mDNS, LLMNR, NBNS, DHCP,
// DHCPv6, NTP, SNMP, syslog, TFTP) plus the sample captures that use them.
import {
  bytes, te, be16, be32, ip4Bytes, ip6Bytes, macBytes, Capture, udpFrame, l2, ipv4, udp, rng, TcpConversation, hex,
} from '../packet.js';

// ---------------------------------------------------------------------------------------------
// DNS
export const DNS_TYPE = { A: 1, NS: 2, CNAME: 5, SOA: 6, PTR: 12, HINFO: 13, MX: 15, TXT: 16, AAAA: 28, SRV: 33, NAPTR: 35, OPT: 41, DS: 43, RRSIG: 46, NSEC: 47, DNSKEY: 48, SVCB: 64, HTTPS: 65, ANY: 255, CAA: 257 };
const typeNum = (t) => (typeof t === 'number' ? t : DNS_TYPE[t]);

/** Name encoder with RFC 1035 compression against names already written in this message. */
class NameWriter {
  constructor() { this.parts = []; this.len = 0; this.dict = new Map(); }
  push(b) { this.parts.push(b); this.len += b.length; }
  name(n, compress = true) {
    if (!n || n === '.' || n === '<Root>') { this.push(Uint8Array.of(0)); return; }
    const labels = n.replace(/\.$/, '').split('.');
    for (let i = 0; i < labels.length; i++) {
      const suffix = labels.slice(i).join('.').toLowerCase();
      if (compress && this.dict.has(suffix)) { const p = this.dict.get(suffix); this.push(Uint8Array.of(0xc0 | (p >> 8), p & 255)); return; }
      if (this.len < 0x3fff) this.dict.set(suffix, this.len);
      const lb = te(labels[i]);
      this.push(Uint8Array.of(lb.length));
      this.push(lb);
    }
    this.push(Uint8Array.of(0));
  }
  out() { return bytes(...this.parts); }
}

function rdata(w, rr) {
  const t = typeNum(rr.type);
  const v = rr.data;
  switch (t) {
    case 1: return ip4Bytes(v);
    case 28: return ip6Bytes(v);
    case 2: case 5: case 12: case 39: { const sub = sublen(w, () => w.name(v)); return sub; }
    case 15: return sublen(w, () => { w.push(be16(v.preference)); w.name(v.exchange); });
    case 16: return bytes(...[].concat(v).map((s) => { const b = te(s); return bytes(Uint8Array.of(b.length), b); }));
    case 33: return sublen(w, () => { w.push(bytes(be16(v.priority || 0), be16(v.weight || 0), be16(v.port))); w.name(v.target, false); });
    case 6: return sublen(w, () => {
      w.name(v.mname); w.name(v.rname);
      w.push(bytes(be32(v.serial || 1), be32(v.refresh || 7200), be32(v.retry || 3600), be32(v.expire || 1209600), be32(v.minimum || 3600)));
    });
    case 64: case 65: return sublen(w, () => {
      w.push(be16(v.priority ?? 1)); w.name(v.target || '.', false);
      for (const [k, val] of v.params || []) w.push(bytes(be16(k), be16(val.length), val));
    });
    case 257: { const tag = te(v.tag); return bytes(Uint8Array.of(v.flags || 0, tag.length), tag, te(v.value)); }
    case 13: { const c = te(v.cpu), o = te(v.os); return bytes(Uint8Array.of(c.length), c, Uint8Array.of(o.length), o); }
    default: return v instanceof Uint8Array ? v : new Uint8Array(0);
  }
}
// rdata containing names must be written in place so compression offsets are correct; this runs fn
// with the writer positioned after the RR header and returns a marker telling the caller its length.
function sublen(w, fn) {
  const before = w.len;
  fn();
  return { inline: w.len - before };
}

/** SvcParams helpers for HTTPS/SVCB records. */
export const svc = {
  alpn: (...ids) => [1, bytes(...ids.map((s) => { const b = te(s); return bytes(Uint8Array.of(b.length), b); }))],
  port: (p) => [3, be16(p)],
  ipv4hint: (...a) => [4, bytes(...a.map(ip4Bytes))],
  ipv6hint: (...a) => [6, bytes(...a.map(ip6Bytes))],
};

/**
 * Full DNS message.
 * m = { id, flags, qd: [{ name, type, cls, qu }], an: [rr], ns: [rr], ar: [rr], edns: { size, do, options: [[code, bytes]] } }
 * rr = { name, type, cls?, ttl, data, flush? }
 */
export function dnsMessage(m) {
  const w = new NameWriter();
  const ar = (m.ar || []).slice();
  const head = bytes(be16(m.id || 0), be16(m.flags || 0), be16((m.qd || []).length), be16((m.an || []).length),
    be16((m.ns || []).length), be16(ar.length + (m.edns ? 1 : 0)));
  w.push(head);
  for (const q of m.qd || []) {
    w.name(q.name);
    w.push(bytes(be16(typeNum(q.type)), be16((q.cls || 1) | (q.qu ? 0x8000 : 0))));
  }
  const writeRR = (rr) => {
    w.name(rr.name);
    w.push(bytes(be16(typeNum(rr.type)), be16((rr.cls || 1) | (rr.flush ? 0x8000 : 0)), be32(rr.ttl ?? 300)));
    const lenAt = w.parts.length;
    w.push(be16(0));
    const r = rdata(w, rr);
    let len;
    if (r instanceof Uint8Array) { w.push(r); len = r.length; } else len = r.inline;
    w.parts[lenAt] = be16(len);
  };
  for (const rr of m.an || []) writeRR(rr);
  for (const rr of m.ns || []) writeRR(rr);
  for (const rr of ar) writeRR(rr);
  if (m.edns) {
    const opts = bytes(...(m.edns.options || []).map(([c, b]) => bytes(be16(c), be16(b.length), b)));
    w.push(bytes(Uint8Array.of(0), be16(41), be16(m.edns.size || 1232), Uint8Array.of(m.edns.rcode || 0, 0), be16(m.edns.do ? 0x8000 : 0), be16(opts.length), opts));
  }
  return w.out();
}
export const DNS_FLAGS = { QUERY: 0x0100, RESPONSE: 0x8180, NXDOMAIN: 0x8183, MDNS_RESPONSE: 0x8400 };

/** Recursive query for one name. */
export function dnsQuery({ id, name, type = 'A', edns, flags = 0x0100 }) {
  return dnsMessage({ id, flags, qd: [{ name, type }], edns });
}
/**
 * Response echoing the question. answers: [{ name?, type, ttl, data }] (name defaults to the query name).
 * rcode: 0 = no error, 3 = NXDOMAIN; authority: [rr].
 */
export function dnsResponse({ id, name, type = 'A', answers = [], authority = [], rcode = 0, edns, flags }) {
  return dnsMessage({
    id, flags: flags ?? (0x8180 | rcode), qd: [{ name, type }],
    an: answers.map((a) => ({ name, ...a })), ns: authority, edns,
  });
}
/** mDNS message (ID 0, no recursion): { qd, an, ns, ar, response } */
export function mdnsMessage({ qd = [], an = [], ns = [], ar = [], response = false, id = 0 }) {
  return dnsMessage({ id, flags: response ? 0x8400 : 0, qd, an, ns, ar });
}
export function llmnrQuery({ id, name, type = 'A' }) { return dnsMessage({ id, flags: 0, qd: [{ name, type }] }); }
export function llmnrResponse({ id, name, type = 'A', data }) {
  return dnsMessage({ id, flags: 0x8000, qd: [{ name, type }], an: [{ name, type, ttl: 30, data }] });
}

// ---------------------------------------------------------------------------------------------
// NBNS
function nbEncode(name, suffix) {
  const raw = name.toUpperCase().padEnd(15, ' ').slice(0, 15) + String.fromCharCode(suffix);
  const out = new Uint8Array(34);
  out[0] = 32;
  for (let i = 0; i < 16; i++) { const c = raw.charCodeAt(i); out[1 + 2 * i] = 0x41 + (c >> 4); out[2 + 2 * i] = 0x41 + (c & 15); }
  out[33] = 0;
  return out;
}
/** NetBIOS name query (broadcast by default). */
export function nbnsQuery({ id, name, suffix = 0x00, broadcast = true }) {
  return bytes(be16(id), be16(0x0100 | (broadcast ? 0x10 : 0)), be16(1), be16(0), be16(0), be16(0), nbEncode(name, suffix), be16(32), be16(1));
}
export function nbnsResponse({ id, name, suffix = 0x00, addr, ttl = 300000, group = false }) {
  return bytes(be16(id), be16(0x8500), be16(0), be16(1), be16(0), be16(0), nbEncode(name, suffix), be16(32), be16(1), be32(ttl),
    be16(6), be16(group ? 0x8000 : 0), ip4Bytes(addr));
}
/** Name registration (broadcast). */
export function nbnsRegistration({ id, name, suffix = 0x00, addr, group = false }) {
  return bytes(be16(id), be16(0x2910), be16(1), be16(0), be16(0), be16(1), nbEncode(name, suffix), be16(32), be16(1),
    Uint8Array.of(0xc0, 0x0c), be16(32), be16(1), be32(300000), be16(6), be16(group ? 0x8000 : 0), ip4Bytes(addr));
}

// ---------------------------------------------------------------------------------------------
// DHCP
export const DHCP = { DISCOVER: 1, OFFER: 2, REQUEST: 3, DECLINE: 4, ACK: 5, NAK: 6, RELEASE: 7, INFORM: 8 };
export const dhcpOpt = {
  u8: (c, v) => [c, Uint8Array.of(v)],
  u16: (c, v) => [c, be16(v)],
  u32: (c, v) => [c, be32(v)],
  ip: (c, ...a) => [c, bytes(...a.map(ip4Bytes))],
  str: (c, s) => [c, te(s)],
  raw: (c, b) => [c, b],
};
/**
 * BOOTP/DHCP message. options: array of [code, bytes] (53 message type is added from msgType).
 * { op (1 request / 2 reply), msgType, xid, mac, ciaddr, yiaddr, siaddr, giaddr, secs, broadcast, options }
 */
export function dhcpMessage(o) {
  const b = new Uint8Array(236);
  b[0] = o.op || (o.msgType === DHCP.OFFER || o.msgType === DHCP.ACK || o.msgType === DHCP.NAK ? 2 : 1);
  b[1] = 1; b[2] = 6; b[3] = o.hops || 0;
  b.set(be32(o.xid >>> 0), 4);
  b.set(be16(o.secs || 0), 8);
  b.set(be16(o.broadcast ? 0x8000 : 0), 10);
  b.set(ip4Bytes(o.ciaddr || '0.0.0.0'), 12);
  b.set(ip4Bytes(o.yiaddr || '0.0.0.0'), 16);
  b.set(ip4Bytes(o.siaddr || '0.0.0.0'), 20);
  b.set(ip4Bytes(o.giaddr || '0.0.0.0'), 24);
  b.set(macBytes(o.mac), 28);
  if (o.sname) b.set(te(o.sname).subarray(0, 63), 44);
  if (o.file) b.set(te(o.file).subarray(0, 127), 108);
  const opts = [];
  if (o.msgType) opts.push(bytes(Uint8Array.of(53, 1, o.msgType)));
  for (const [c, v] of o.options || []) opts.push(bytes(Uint8Array.of(c, v.length), v));
  opts.push(Uint8Array.of(255));
  let m = bytes(b, Uint8Array.of(99, 130, 83, 99), ...opts);
  if (m.length < 300) m = bytes(m, new Uint8Array(300 - m.length)); // BOOTP minimum size padding
  return m;
}

/** DHCPv6 message: { msgType, xid, options: [[code, bytes]] } */
export function dhcpv6Message({ msgType, xid, options = [] }) {
  return bytes(Uint8Array.of(msgType, (xid >> 16) & 255, (xid >> 8) & 255, xid & 255), ...options.map(([c, v]) => bytes(be16(c), be16(v.length), v)));
}
export function duidLL(mac) { return bytes(be16(3), be16(1), macBytes(mac)); }

// ---------------------------------------------------------------------------------------------
// NTP
const NTP_EPOCH = 2208988800;
export function ntpTime(t) {
  if (!t) return new Uint8Array(8);
  const s = Math.floor(t);
  const f = Math.floor((t - s) * 4294967296);
  return bytes(be32(s + NTP_EPOCH), be32(f));
}
/** NTP v4 packet. mode 3 client, 4 server. times are Unix seconds (float). */
export function ntpPacket({ mode = 3, version = 4, li = 0, stratum = 0, poll = 6, precision = -20, rootDelay = 0, rootDisp = 0, refid = '0.0.0.0', ref = 0, org = 0, rec = 0, xmt = 0 }) {
  const rid = typeof refid === 'string' && /^\d+\.\d+\.\d+\.\d+$/.test(refid) ? ip4Bytes(refid) : te(String(refid).padEnd(4, '\0').slice(0, 4));
  return bytes(Uint8Array.of((li << 6) | (version << 3) | mode, stratum, poll & 255, precision & 255),
    be32(Math.round(rootDelay * 65536)), be32(Math.round(rootDisp * 65536)), rid, ntpTime(ref), ntpTime(org), ntpTime(rec), ntpTime(xmt));
}

// ---------------------------------------------------------------------------------------------
// SNMP (BER)
function berLen(n) {
  if (n < 128) return Uint8Array.of(n);
  if (n < 256) return Uint8Array.of(0x81, n);
  return Uint8Array.of(0x82, n >> 8, n & 255);
}
export function tlv(tag, content) { return bytes(Uint8Array.of(tag), berLen(content.length), content); }
function berInt(v) {
  const out = [];
  let x = BigInt(v);
  do { out.unshift(Number(x & 0xffn)); x >>= 8n; } while (x !== 0n && x !== -1n);
  if (v >= 0 && out[0] & 0x80) out.unshift(0);
  if (v < 0 && !(out[0] & 0x80)) out.unshift(0xff);
  return Uint8Array.from(out);
}
function berUint(v) { const b = berInt(BigInt(v)); return b; }
export function berOid(oid) {
  const p = oid.split('.').map(Number);
  const out = [p[0] * 40 + p[1]];
  for (const n of p.slice(2)) {
    const tmp = [n & 0x7f];
    let x = Math.floor(n / 128);
    while (x) { tmp.unshift((x & 0x7f) | 0x80); x = Math.floor(x / 128); }
    out.push(...tmp);
  }
  return Uint8Array.from(out);
}
/** SNMP value: { type: 'int'|'str'|'oid'|'null'|'ip'|'counter'|'gauge'|'ticks'|'counter64', value } */
function snmpValue(v) {
  if (!v) return tlv(0x05, new Uint8Array(0));
  switch (v.type) {
    case 'int': return tlv(0x02, berInt(v.value));
    case 'str': return tlv(0x04, typeof v.value === 'string' ? te(v.value) : v.value);
    case 'oid': return tlv(0x06, berOid(v.value));
    case 'ip': return tlv(0x40, ip4Bytes(v.value));
    case 'counter': return tlv(0x41, berUint(v.value));
    case 'gauge': return tlv(0x42, berUint(v.value));
    case 'ticks': return tlv(0x43, berUint(v.value));
    case 'counter64': return tlv(0x46, berUint(v.value));
    case 'nosuchobject': return tlv(0x80, new Uint8Array(0));
    case 'nosuchinstance': return tlv(0x81, new Uint8Array(0));
    case 'endofmib': return tlv(0x82, new Uint8Array(0));
    default: return tlv(0x05, new Uint8Array(0));
  }
}
export const SNMP_PDU = { get: 0xa0, getnext: 0xa1, response: 0xa2, set: 0xa3, trap: 0xa4, getbulk: 0xa5, inform: 0xa6, trap2: 0xa7, report: 0xa8 };
/** { version: 0 (v1) | 1 (v2c), community, pdu: 'get'|..., requestId, errorStatus, errorIndex, varbinds: [{ oid, value }] } */
export function snmpMessage({ version = 1, community = 'public', pdu = 'get', requestId = 1, errorStatus = 0, errorIndex = 0, varbinds = [] }) {
  const vbl = tlv(0x30, bytes(...varbinds.map((vb) => tlv(0x30, bytes(tlv(0x06, berOid(vb.oid)), snmpValue(vb.value))))));
  const body = bytes(tlv(0x02, berInt(requestId)), tlv(0x02, berInt(errorStatus)), tlv(0x02, berInt(errorIndex)), vbl);
  return tlv(0x30, bytes(tlv(0x02, berInt(version)), tlv(0x04, te(community)), tlv(SNMP_PDU[pdu], body)));
}
export function snmpGet({ version = 1, community = 'public', requestId, oids, next = false }) {
  return snmpMessage({ version, community, pdu: next ? 'getnext' : 'get', requestId, varbinds: oids.map((oid) => ({ oid })) });
}
export function snmpResponse({ version = 1, community = 'public', requestId, varbinds, errorStatus = 0, errorIndex = 0 }) {
  return snmpMessage({ version, community, pdu: 'response', requestId, varbinds, errorStatus, errorIndex });
}
/** SNMPv1 Trap-PDU. */
export function snmpTrapV1({ community = 'public', enterprise, agent, generic = 6, specific = 0, ticks = 0, varbinds = [] }) {
  const vbl = tlv(0x30, bytes(...varbinds.map((vb) => tlv(0x30, bytes(tlv(0x06, berOid(vb.oid)), snmpValue(vb.value))))));
  const body = bytes(tlv(0x06, berOid(enterprise)), tlv(0x40, ip4Bytes(agent)), tlv(0x02, berInt(generic)), tlv(0x02, berInt(specific)), tlv(0x43, berUint(ticks)), vbl);
  return tlv(0x30, bytes(tlv(0x02, berInt(0)), tlv(0x04, te(community)), tlv(0xa4, body)));
}

// ---------------------------------------------------------------------------------------------
// Syslog / TFTP
/** BSD syslog line: <PRI>Mmm dd hh:mm:ss host tag: msg */
export function syslogMessage({ facility = 1, severity = 6, timestamp = 'Nov 18 09:00:00', host = 'router', msg = '' }) {
  return te(`<${facility * 8 + severity}>${timestamp} ${host} ${msg}`);
}
export const tftp = {
  rrq: (file, mode = 'octet', opts = {}) => bytes(be16(1), te(file), Uint8Array.of(0), te(mode), Uint8Array.of(0), ...Object.entries(opts).flatMap(([k, v]) => [te(k), Uint8Array.of(0), te(String(v)), Uint8Array.of(0)])),
  wrq: (file, mode = 'octet') => bytes(be16(2), te(file), Uint8Array.of(0), te(mode), Uint8Array.of(0)),
  data: (block, data) => bytes(be16(3), be16(block), data),
  ack: (block) => bytes(be16(4), be16(block)),
  error: (code, msg) => bytes(be16(5), be16(code), te(msg), Uint8Array.of(0)),
  oack: (opts) => bytes(be16(6), ...Object.entries(opts).flatMap(([k, v]) => [te(k), Uint8Array.of(0), te(String(v)), Uint8Array.of(0)])),
};

// ---------------------------------------------------------------------------------------------
// Samples
const LAN = {
  router: { mac: '00:11:32:aa:bb:cc', ip: '192.168.0.1' },
  pc: { mac: 'a4:83:e7:12:34:56', ip: '192.168.0.10' },
  laptop: { mac: '3c:22:fb:4d:5e:6f', ip: '192.168.0.23' },
  tv: { mac: 'f4:f5:d8:21:43:65', ip: '192.168.0.31' },
  printer: { mac: '00:80:f4:0a:0b:0c', ip: '192.168.0.40' },
  nas: { mac: '00:11:32:5a:5b:5c', ip: '192.168.0.50' },
  switch: { mac: '00:1b:21:3c:4d:5e', ip: '192.168.0.2' },
  win: { mac: '00:15:5d:01:02:03', ip: '192.168.0.12' },
};
const BCAST = 'ff:ff:ff:ff:ff:ff';
const MDNS4 = { mac: '01:00:5e:00:00:fb', ip: '224.0.0.251' };
const LLMNR4 = { mac: '01:00:5e:00:00:fc', ip: '224.0.0.252' };
const START = 1763452800; // 2025-11-18 08:00:00 UTC

function u(cap, a, b, sport, dport, payload, dt = 0, extra = {}) {
  cap.add(udpFrame({ srcMac: a.mac, dstMac: b.mac, src: a.ip, dst: b.ip, sport, dport, ttl: extra.ttl }, payload), { dt });
}

function buildDns() {
  const cap = new Capture(START + 3600, { comment: 'DNS lookups from a home PC: A, AAAA, HTTPS, MX, TXT, SRV, PTR, a CNAME chain, NXDOMAIN and DNS over TCP.' });
  const r = rng(53);
  const pc = LAN.pc, dnsSrv = LAN.router;
  let port = 50000;
  const lookups = [
    ['www.example.com', 'A', [{ type: 'A', ttl: 3600, data: '93.184.216.34' }]],
    ['www.example.com', 'AAAA', [{ type: 'AAAA', ttl: 3600, data: '2606:2800:220:1:248:1893:25c8:1946' }]],
    ['www.wikipedia.org', 'A', [{ type: 'CNAME', ttl: 300, data: 'dyna.wikimedia.org' }, { name: 'dyna.wikimedia.org', type: 'A', ttl: 600, data: '185.15.59.224' }]],
    ['cloudflare.com', 'HTTPS', [{ type: 'HTTPS', ttl: 300, data: { priority: 1, target: '.', params: [svc.alpn('h3', 'h2'), svc.ipv4hint('104.16.132.229', '104.16.133.229'), svc.ipv6hint('2606:4700::6810:84e5')] } }]],
    ['gmail.com', 'MX', [{ type: 'MX', ttl: 3600, data: { preference: 5, exchange: 'gmail-smtp-in.l.google.com' } }, { type: 'MX', ttl: 3600, data: { preference: 10, exchange: 'alt1.gmail-smtp-in.l.google.com' } }]],
    ['example.com', 'TXT', [{ type: 'TXT', ttl: 86400, data: ['v=spf1 -all'] }]],
    ['_sip._udp.example.net', 'SRV', [{ type: 'SRV', ttl: 600, data: { priority: 10, weight: 60, port: 5060, target: 'sip1.example.net' } }]],
    ['34.216.184.93.in-addr.arpa', 'PTR', [{ type: 'PTR', ttl: 3600, data: 'www.example.com' }]],
    ['example.com', 'CAA', [{ type: 'CAA', ttl: 3600, data: { flags: 0, tag: 'issue', value: 'letsencrypt.org' } }]],
  ];
  for (const [name, type, answers] of lookups) {
    const id = r.int(1, 0xffff);
    const sp = port++;
    u(cap, pc, dnsSrv, sp, 53, dnsQuery({ id, name, type, edns: { size: 1232 } }), 0.4 + r() * 0.6);
    u(cap, dnsSrv, pc, 53, sp, dnsResponse({ id, name, type, answers: answers.map((a) => ({ ...a, name: a.name || name })), edns: { size: 1232 } }), 0.008 + r() * 0.02);
  }
  // NXDOMAIN with SOA in the authority section
  const id = r.int(1, 0xffff);
  u(cap, pc, dnsSrv, port, 53, dnsQuery({ id, name: 'no-such-host.example.com' }), 0.5);
  u(cap, dnsSrv, pc, 53, port++, dnsResponse({ id, name: 'no-such-host.example.com', rcode: 3, authority: [{ name: 'example.com', type: 'SOA', ttl: 3600, data: { mname: 'ns.icann.org', rname: 'noc.dns.icann.org', serial: 2025111801 } }] }), 0.015);
  // retransmitted query (first one unanswered)
  const id2 = r.int(1, 0xffff);
  u(cap, pc, dnsSrv, port, 53, dnsQuery({ id: id2, name: 'slow.example.org' }), 0.6);
  u(cap, pc, dnsSrv, port, 53, dnsQuery({ id: id2, name: 'slow.example.org' }), 1.0);
  u(cap, dnsSrv, pc, 53, port++, dnsResponse({ id: id2, name: 'slow.example.org', answers: [{ type: 'A', ttl: 60, data: '203.0.113.7' }] }), 0.03);
  // DNS over TCP (large TXT response)
  const tc = new TcpConversation(cap, { ...pc, port: 50999 }, { ...dnsSrv, port: 53 }, { rtt: 0.004 });
  cap.wait(0.5);
  tc.handshake();
  const q = dnsQuery({ id: 0x4d2e, name: 'example.org', type: 'TXT' });
  tc.send('c', bytes(be16(q.length), q));
  const txts = [];
  for (let i = 0; i < 6; i++) txts.push({ type: 'TXT', ttl: 300, data: [`site-verification=${'k'.repeat(40)}${i}`] });
  const resp = dnsResponse({ id: 0x4d2e, name: 'example.org', type: 'TXT', answers: txts });
  tc.send('s', bytes(be16(resp.length), resp));
  tc.close();
  return cap.file('dns-queries.pcapng');
}

function buildDhcp() {
  const cap = new Capture(START + 7200, { comment: 'A laptop joins the LAN: DHCP Discover/Offer/Request/ACK, then renews and finally releases its lease; DHCPv6 solicit/advertise.' });
  const cl = LAN.laptop, srv = LAN.router;
  const xid = 0x3903f326;
  const common = [dhcpOpt.raw(61, bytes(Uint8Array.of(1), macBytes(cl.mac))), dhcpOpt.str(12, 'laptop-anna'),
    dhcpOpt.raw(55, Uint8Array.of(1, 3, 6, 15, 31, 33, 43, 44, 46, 47, 119, 121, 249, 252)), dhcpOpt.str(60, 'MSFT 5.0')];
  const offerOpts = [dhcpOpt.ip(54, srv.ip), dhcpOpt.u32(51, 86400), dhcpOpt.u32(58, 43200), dhcpOpt.u32(59, 75600),
    dhcpOpt.ip(1, '255.255.255.0'), dhcpOpt.ip(28, '192.168.0.255'), dhcpOpt.ip(3, srv.ip), dhcpOpt.ip(6, srv.ip, '8.8.8.8'), dhcpOpt.str(15, 'home.lan')];
  const bc = { mac: BCAST, ip: '255.255.255.255' };
  const zero = { mac: cl.mac, ip: '0.0.0.0' };
  const send = (a, b, sp, dp, p, dt) => cap.add(udpFrame({ srcMac: a.mac, dstMac: b.mac, src: a.ip, dst: b.ip, sport: sp, dport: dp, ttl: a === srv ? 64 : 128 }, p), { dt });
  send(zero, bc, 68, 67, dhcpMessage({ msgType: DHCP.DISCOVER, xid, mac: cl.mac, options: [dhcpOpt.ip(50, '192.168.0.23'), ...common] }), 0.1);
  send(srv, { mac: cl.mac, ip: '192.168.0.23' }, 67, 68, dhcpMessage({ msgType: DHCP.OFFER, xid, mac: cl.mac, yiaddr: '192.168.0.23', siaddr: srv.ip, options: offerOpts }), 0.004);
  send(zero, bc, 68, 67, dhcpMessage({ msgType: DHCP.REQUEST, xid, mac: cl.mac, secs: 1, options: [dhcpOpt.ip(50, '192.168.0.23'), dhcpOpt.ip(54, srv.ip), ...common] }), 0.02);
  send(srv, { mac: cl.mac, ip: '192.168.0.23' }, 67, 68, dhcpMessage({ msgType: DHCP.ACK, xid, mac: cl.mac, secs: 1, yiaddr: '192.168.0.23', siaddr: srv.ip, options: offerOpts }), 0.003);
  // gratuitous use / renew (unicast) half a lease later is compressed in time for the sample
  const xid2 = 0x7a11c0de;
  send(cl, srv, 68, 67, dhcpMessage({ msgType: DHCP.REQUEST, xid: xid2, mac: cl.mac, ciaddr: cl.ip, options: common }), 30);
  send(srv, cl, 67, 68, dhcpMessage({ msgType: DHCP.ACK, xid: xid2, mac: cl.mac, ciaddr: cl.ip, yiaddr: cl.ip, options: offerOpts }), 0.002);
  // INFORM from the printer and a NAK for a stale address request
  const xid3 = 0x00c0ffee;
  send(zero, bc, 68, 67, dhcpMessage({ msgType: DHCP.REQUEST, xid: xid3, mac: cl.mac, options: [dhcpOpt.ip(50, '10.0.0.77'), ...common] }), 5);
  send(srv, bc, 67, 68, dhcpMessage({ msgType: DHCP.NAK, xid: xid3, mac: cl.mac, options: [dhcpOpt.ip(54, srv.ip), dhcpOpt.str(56, 'requested address not available')] }), 0.002);
  send(cl, srv, 68, 67, dhcpMessage({ msgType: DHCP.RELEASE, xid: 0x11223344, mac: cl.mac, ciaddr: cl.ip, options: [dhcpOpt.ip(54, srv.ip), common[0]] }), 10);
  // DHCPv6 solicit / advertise (link-local multicast)
  const cl6 = 'fe80::3e22:fbff:fe4d:5e6f', srv6 = 'fe80::211:32ff:feaa:bbcc';
  const v6 = (srcMac, dstMac, src, dst, sp, dp, p, dt) => cap.add(l2({ srcMac, dstMac }, ipv6Packet(src, dst, sp, dp, p)), { dt });
  const cid = [1, duidLL(cl.mac)];
  v6(cl.mac, '33:33:00:01:00:02', cl6, 'ff02::1:2', 546, 547, dhcpv6Message({ msgType: 1, xid: 0x5a1b2c, options: [cid, [8, be16(0)], [3, bytes(be32(0x0e3c22fb), be32(0), be32(0))], [6, bytes(be16(23), be16(24))]] }), 2);
  v6(srv.mac, cl.mac, srv6, cl6, 547, 546, dhcpv6Message({ msgType: 2, xid: 0x5a1b2c, options: [cid, [2, duidLL(srv.mac)],
    [3, bytes(be32(0x0e3c22fb), be32(3600), be32(5400), be16(5), be16(24), ip6Bytes('fd00:1234::23'), be32(7200), be32(7500))], [23, ip6Bytes('fd00:1234::1')], [24, hex('04686f6d65036c616e00')]] }), 0.003);
  return cap.file('dhcp-lease.pcapng');
}

function ipv6Packet(src, dst, sport, dport, payload) {
  // IPv6 + UDP using the synth builders (synth's ip() chooses the family from the address)
  const seg = udp({ src, dst, sport, dport }, payload);
  const h = new Uint8Array(40);
  h[0] = 0x60; h[4] = seg.length >> 8; h[5] = seg.length & 255; h[6] = 17; h[7] = src.startsWith('fe80') ? 1 : 64;
  h.set(ip6Bytes(src), 8); h.set(ip6Bytes(dst), 24);
  return bytes(h, seg);
}

function buildLanNames() {
  const cap = new Capture(START + 10800, { comment: 'Name services on a home LAN: mDNS service discovery (Chromecast, printer), LLMNR and NetBIOS name queries from Windows.' });
  const tv = LAN.tv, pc = LAN.pc, pr = LAN.printer, win = LAN.win;
  const m = (src, p, dt) => u(cap, src, MDNS4, 5353, 5353, p, dt, { ttl: 255 });
  m(pc, mdnsMessage({ qd: [{ name: '_googlecast._tcp.local', type: 'PTR' }] }), 0.2);
  m(tv, mdnsMessage({
    response: true,
    an: [{ name: '_googlecast._tcp.local', type: 'PTR', ttl: 120, data: 'Living-Room-TV._googlecast._tcp.local' }],
    ar: [
      { name: 'Living-Room-TV._googlecast._tcp.local', type: 'TXT', ttl: 4500, flush: true, data: ['id=7f3c9e', 'md=Chromecast', 'fn=Living Room TV', 'ca=465413'] },
      { name: 'Living-Room-TV._googlecast._tcp.local', type: 'SRV', ttl: 120, flush: true, data: { priority: 0, weight: 0, port: 8009, target: '7f3c9e.local' } },
      { name: '7f3c9e.local', type: 'A', ttl: 120, flush: true, data: tv.ip },
    ],
  }), 0.05);
  m(pc, mdnsMessage({ qd: [{ name: '_ipp._tcp.local', type: 'PTR', qu: true }, { name: '_printer._tcp.local', type: 'PTR', qu: true }] }), 1.1);
  m(pr, mdnsMessage({
    response: true,
    an: [{ name: '_ipp._tcp.local', type: 'PTR', ttl: 4500, data: 'Office Printer._ipp._tcp.local' }],
    ar: [{ name: 'Office Printer._ipp._tcp.local', type: 'SRV', ttl: 120, flush: true, data: { priority: 0, weight: 0, port: 631, target: 'printer.local' } },
      { name: 'printer.local', type: 'A', ttl: 120, flush: true, data: pr.ip }],
  }), 0.08);
  // announcement / probe
  m(LAN.nas, mdnsMessage({ qd: [{ name: 'nas.local', type: 'ANY', qu: true }], ns: [{ name: 'nas.local', type: 'A', ttl: 120, data: LAN.nas.ip }] }), 2);
  m(LAN.nas, mdnsMessage({ response: true, an: [{ name: 'nas.local', type: 'A', ttl: 120, flush: true, data: LAN.nas.ip }] }), 0.25);
  // LLMNR from Windows
  const lid = 0x8a1f;
  u(cap, win, LLMNR4, 61022, 5355, llmnrQuery({ id: lid, name: 'fileserver' }), 1.5, { ttl: 1 });
  u(cap, LAN.nas, win, 5355, 61022, llmnrResponse({ id: lid, name: 'fileserver', data: LAN.nas.ip }), 0.002);
  // NetBIOS name service (broadcast)
  const bc = { mac: BCAST, ip: '192.168.0.255' };
  u(cap, win, bc, 137, 137, nbnsQuery({ id: 0x80f1, name: 'WORKGROUP', suffix: 0x1c }), 0.5);
  u(cap, win, bc, 137, 137, nbnsQuery({ id: 0x80f2, name: 'FILESERVER', suffix: 0x20 }), 0.4);
  u(cap, LAN.nas, win, 137, 137, nbnsResponse({ id: 0x80f2, name: 'FILESERVER', suffix: 0x20, addr: LAN.nas.ip }), 0.003);
  u(cap, win, bc, 137, 137, nbnsRegistration({ id: 0x80f3, name: 'DESKTOP-7Q2', suffix: 0x00, addr: win.ip }), 1.0);
  return cap.file('lan-name-services.pcapng');
}

function buildSnmp() {
  const cap = new Capture(START + 14400, { comment: 'An NMS polls a switch with SNMPv2c (sysDescr, sysUpTime, interface counters), walks a table with GetNext/GetBulk, sets sysContact and receives traps.' });
  const nms = LAN.pc, sw = LAN.switch;
  let rid = 1001;
  let sp = 52100;
  const ask = (pdu, vbsReq, vbsResp, extra = {}) => {
    const id = rid++;
    u(cap, nms, sw, sp, 161, snmpMessage({ version: 1, community: extra.community || 'public', pdu, requestId: id, varbinds: vbsReq, errorStatus: pdu === 'getbulk' ? 0 : 0, errorIndex: pdu === 'getbulk' ? 10 : 0 }), 1.0);
    if (vbsResp) u(cap, sw, nms, 161, sp, snmpResponse({ version: 1, community: extra.community || 'public', requestId: id, varbinds: vbsResp, errorStatus: extra.errorStatus || 0, errorIndex: extra.errorIndex || 0 }), 0.0025);
    sp++;
  };
  ask('get', [{ oid: '1.3.6.1.2.1.1.1.0' }, { oid: '1.3.6.1.2.1.1.3.0' }, { oid: '1.3.6.1.2.1.1.5.0' }], [
    { oid: '1.3.6.1.2.1.1.1.0', value: { type: 'str', value: 'Cisco IOS Software, C2960 Software (C2960-LANBASEK9-M), Version 15.0(2)SE11' } },
    { oid: '1.3.6.1.2.1.1.3.0', value: { type: 'ticks', value: 123456789 } },
    { oid: '1.3.6.1.2.1.1.5.0', value: { type: 'str', value: 'core-sw1' } }]);
  ask('get', [{ oid: '1.3.6.1.2.1.2.2.1.10.1' }, { oid: '1.3.6.1.2.1.2.2.1.16.1' }, { oid: '1.3.6.1.2.1.31.1.1.1.6.1' }], [
    { oid: '1.3.6.1.2.1.2.2.1.10.1', value: { type: 'counter', value: 3456789012 } },
    { oid: '1.3.6.1.2.1.2.2.1.16.1', value: { type: 'counter', value: 987654321 } },
    { oid: '1.3.6.1.2.1.31.1.1.1.6.1', value: { type: 'counter64', value: 98765432109876n } }]);
  ask('getnext', [{ oid: '1.3.6.1.2.1.2.2.1.2' }], [{ oid: '1.3.6.1.2.1.2.2.1.2.1', value: { type: 'str', value: 'GigabitEthernet0/1' } }]);
  ask('getbulk', [{ oid: '1.3.6.1.2.1.2.2.1.8' }], [1, 2, 3, 4].map((i) => ({ oid: `1.3.6.1.2.1.2.2.1.8.${i}`, value: { type: 'int', value: i === 3 ? 2 : 1 } })));
  ask('get', [{ oid: '1.3.6.1.2.1.4.20.1.1.192.168.0.2' }], [{ oid: '1.3.6.1.2.1.4.20.1.1.192.168.0.2', value: { type: 'ip', value: '192.168.0.2' } }]);
  ask('get', [{ oid: '1.3.6.1.4.1.9.9.999.0' }], [{ oid: '1.3.6.1.4.1.9.9.999.0', value: { type: 'nosuchobject' } }]);
  ask('set', [{ oid: '1.3.6.1.2.1.1.4.0', value: { type: 'str', value: 'noc@example.com' } }], [{ oid: '1.3.6.1.2.1.1.4.0', value: { type: 'str', value: 'noc@example.com' } }], { community: 'private' });
  ask('set', [{ oid: '1.3.6.1.2.1.1.5.0', value: { type: 'str', value: 'x' } }], [{ oid: '1.3.6.1.2.1.1.5.0', value: { type: 'str', value: 'x' } }], { errorStatus: 17, errorIndex: 1 });
  // v2c trap: linkDown, and a v1 trap
  u(cap, sw, nms, 49152, 162, snmpMessage({ version: 1, pdu: 'trap2', requestId: 5021, varbinds: [
    { oid: '1.3.6.1.2.1.1.3.0', value: { type: 'ticks', value: 123460000 } },
    { oid: '1.3.6.1.6.3.1.1.4.1.0', value: { type: 'oid', value: '1.3.6.1.6.3.1.1.5.3' } },
    { oid: '1.3.6.1.2.1.2.2.1.1.3', value: { type: 'int', value: 3 } }] }), 2);
  u(cap, sw, nms, 49153, 162, snmpTrapV1({ enterprise: '1.3.6.1.4.1.9.1.1208', agent: sw.ip, generic: 3, ticks: 123470000, varbinds: [{ oid: '1.3.6.1.2.1.2.2.1.1.3', value: { type: 'int', value: 3 } }] }), 1);
  return cap.file('snmp.pcapng');
}

function buildUdpServices() {
  const cap = new Capture(START + 18000, { comment: 'NTP time sync with a public server, syslog messages from a router, and a TFTP firmware download.' });
  const pc = LAN.pc, rt = LAN.router, ntpSrv = { mac: rt.mac, ip: '162.159.200.123' }, syslogSrv = LAN.nas;
  // NTP client/server (3 exchanges)
  let t = START + 18000;
  for (let i = 0; i < 3; i++) {
    cap.wait(i ? 16 : 0.1);
    t = cap.t;
    u(cap, pc, ntpSrv, 123, 123, ntpPacket({ mode: 3, xmt: t + 0.0002, poll: 6 }));
    u(cap, ntpSrv, pc, 123, 123, ntpPacket({ mode: 4, stratum: 3, poll: 6, precision: -25, rootDelay: 0.0153, rootDisp: 0.0007, refid: '10.30.8.4', ref: t - 120.3, org: t + 0.0002, rec: t + 0.0061, xmt: t + 0.0062 }), 0.0123, { ttl: 57 });
  }
  // syslog
  const msgs = [
    [23, 5, 'Nov 18 13:00:16', '%LINK-3-UPDOWN: Interface GigabitEthernet0/3, changed state to down'],
    [23, 5, 'Nov 18 13:00:17', '%LINEPROTO-5-UPDOWN: Line protocol on Interface GigabitEthernet0/3, changed state to down'],
    [4, 4, 'Nov 18 13:00:20', 'sshd[812]: Failed password for invalid user admin from 203.0.113.9 port 51522 ssh2'],
    [3, 6, 'Nov 18 13:00:22', 'dnsmasq-dhcp[455]: DHCPACK(br0) 192.168.0.23 3c:22:fb:4d:5e:6f laptop-anna'],
    [16, 3, 'Nov 18 13:00:40', 'kernel: nf_conntrack: table full, dropping packet'],
  ];
  for (const [fac, sev, ts, msg] of msgs) u(cap, rt, syslogSrv, 514, 514, syslogMessage({ facility: fac, severity: sev, timestamp: ts, host: 'gw', msg }), 1.7);
  // TFTP download: RRQ with options, OACK, data blocks, ACKs
  const cl = LAN.switch, srv = LAN.nas;
  const cport = 49170, sport = 51888;
  u(cap, cl, srv, cport, 69, tftp.rrq('c2960-lanbasek9-mz.bin', 'octet', { blksize: 512, tsize: 0 }), 3);
  u(cap, srv, cl, sport, cport, tftp.oack({ blksize: 512, tsize: 1300 }), 0.002);
  u(cap, cl, srv, cport, sport, tftp.ack(0), 0.001);
  const r = rng(69);
  const file = r.bytes(1300);
  for (let b = 1, o = 0; o <= file.length; b++, o += 512) {
    u(cap, srv, cl, sport, cport, tftp.data(b, file.subarray(o, Math.min(o + 512, file.length))), 0.002);
    u(cap, cl, srv, cport, sport, tftp.ack(b), 0.001);
    if (o + 512 > file.length) break;
  }
  u(cap, cl, srv, cport + 1, 69, tftp.rrq('missing.cfg', 'netascii'), 1);
  u(cap, srv, cl, sport + 1, cport + 1, tftp.error(1, 'File not found'), 0.002);
  return cap.file('udp-services.pcapng');
}

export const samples = [
  { id: 'dns-queries', group: 'names', icon: 'dns', ko: ['DNS 조회', 'A·AAAA·HTTPS·MX·TXT·SRV·PTR 조회와 CNAME, NXDOMAIN, 재전송, TCP 위 DNS'], en: ['DNS queries', 'A, AAAA, HTTPS, MX, TXT, SRV and PTR lookups with a CNAME chain, NXDOMAIN, a retry and DNS over TCP'], build: buildDns },
  { id: 'dhcp-lease', group: 'names', icon: 'lease', ko: ['DHCP 주소 할당', 'Discover·Offer·Request·ACK, 갱신, NAK, 반납과 DHCPv6'], en: ['DHCP lease', 'Discover, Offer, Request and ACK, then renew, NAK and release, plus DHCPv6'], build: buildDhcp },
  { id: 'lan-name-services', group: 'names', icon: 'search', ko: ['LAN 이름 서비스', 'mDNS 서비스 검색, LLMNR, NetBIOS 이름 조회'], en: ['Name services on the LAN', 'mDNS service discovery, LLMNR and NetBIOS name queries'], build: buildLanNames },
  { id: 'snmp', group: 'lan', icon: 'monitor', ko: ['SNMP', '스위치 상태 조회(Get/GetNext/GetBulk/Set)와 트랩'], en: ['SNMP', 'Polling a switch with Get, GetNext, GetBulk and Set, plus traps'], build: buildSnmp },
  { id: 'udp-services', group: 'lan', icon: 'clock', ko: ['NTP·syslog·TFTP', '시간 동기화, 라우터 로그, TFTP 펌웨어 내려받기'], en: ['NTP, syslog and TFTP', 'Time sync, router log messages and a TFTP firmware download'], build: buildUdpServices },
];

export { LAN as NAMES_LAN };
