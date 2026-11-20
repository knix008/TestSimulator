// LAN / tunnel / routing / Wi-Fi packet builders and the sample captures that use them.
import { appendBluetooth } from './bluetooth.js';
import {
  bytes, te, be16, be24, be32, le16, le32, macBytes, ip4Bytes, ip6Bytes, checksum, ether, pad60, vlanTag,
  ipv4, ipv6, udp, icmp, icmpv6, udpFrame, tcpFrame, icmpFrame, arp, l2, Capture, TcpConversation, TCP, rng,
} from '../packet.js';

// ---------------------------------------------------------------------------------------------
// Tunnels
/** GRE header + payload. o: { proto, key, seq, csum } */
export function gre(o, payload) {
  let fl = 0;
  if (o.csum) fl |= 0x8000;
  if (o.key != null) fl |= 0x2000;
  if (o.seq != null) fl |= 0x1000;
  const parts = [be16(fl), be16(o.proto)];
  if (o.csum) parts.push(be32(0));
  if (o.key != null) parts.push(be32(o.key));
  if (o.seq != null) parts.push(be32(o.seq));
  const g = bytes(...parts, payload);
  if (o.csum) { const c = checksum(g); g[4] = c >> 8; g[5] = c & 255; }
  return g;
}
export function vxlan(vni, innerEth) { return bytes(Uint8Array.of(0x08, 0, 0, 0), be24(vni), Uint8Array.of(0), innerEth); }
/** GENEVE: options = [[class, type, dataBytes]] (data length multiple of 4). */
export function geneve(vni, proto, payload, options = []) {
  const opts = bytes(...options.map(([cls, type, data]) => bytes(be16(cls), Uint8Array.of(type, data.length / 4), data)));
  return bytes(Uint8Array.of(opts.length / 4, 0), be16(proto), be24(vni), Uint8Array.of(0), opts, payload);
}
/** MPLS label stack entries [{ label, exp, ttl }] then payload. */
export function mpls(labels, payload) {
  return bytes(...labels.map((l, i) => be32(((l.label << 12) | ((l.exp || 0) << 9) | (i === labels.length - 1 ? 0x100 : 0) | (l.ttl ?? 64)) >>> 0)), payload);
}
/** PPPoE discovery frame. tags: [[type, bytes]] */
export function pppoeDiscovery(srcMac, dstMac, code, sid, tags) {
  const body = bytes(...tags.map(([t, v]) => bytes(be16(t), be16(v.length), v)));
  return pad60(ether(srcMac, dstMac, 0x8863, bytes(Uint8Array.of(0x11, code), be16(sid), be16(body.length), body)));
}
export function pppoeSession(srcMac, dstMac, sid, pppProto, payload) {
  const ppp = bytes(be16(pppProto), payload);
  return pad60(ether(srcMac, dstMac, 0x8864, bytes(Uint8Array.of(0x11, 0), be16(sid), be16(ppp.length), ppp)));
}
/** LCP/IPCP style control packet. options: [[type, bytes]] */
export function pppControl(code, id, options = [], raw = null) {
  const body = raw || bytes(...options.map(([t, v]) => bytes(Uint8Array.of(t, v.length + 2), v)));
  return bytes(Uint8Array.of(code, id), be16(4 + body.length), body);
}
export function esp(spi, seq, encLen, r) { return bytes(be32(spi), be32(seq), r ? r.bytes(encLen) : new Uint8Array(encLen)); }
export function ah(nxt, spi, seq, payload) {
  return bytes(Uint8Array.of(nxt, 4, 0, 0), be32(spi), be32(seq), new Uint8Array(12), payload);
}

// CRC32c (Castagnoli) for SCTP
const CRC32C = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) { let c = i; for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0x82f63b78 : c >>> 1; t[i] = c >>> 0; }
  return t;
})();
export function crc32c(b) {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC32C[(c ^ b[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
export function sctpChunk(type, flags, value) {
  const len = 4 + value.length;
  const pad = (4 - (len % 4)) % 4;
  return bytes(Uint8Array.of(type, flags), be16(len), value, new Uint8Array(pad));
}
export function sctp(sport, dport, vtag, chunks) {
  const p = bytes(be16(sport), be16(dport), be32(vtag), be32(0), ...chunks);
  const c = crc32c(p);
  p.set(le32(c), 8); // CRC32c is stored little-endian
  return p;
}

// ---------------------------------------------------------------------------------------------
// LAN control protocols
/** LLDP TLV */
export function lldpTlv(type, value) { return bytes(be16((type << 9) | value.length), value); }
export function lldpFrame(srcMac, tlvs) { return pad60(ether(srcMac, '01:80:c2:00:00:0e', 0x88cc, bytes(...tlvs, be16(0)))); }
/** 802.3 frame with LLC header. */
export function llcFrame(srcMac, dstMac, dsap, ssap, ctl, payload) {
  const llc = bytes(Uint8Array.of(dsap, ssap, ctl), payload);
  return pad60(bytes(macBytes(dstMac), macBytes(srcMac), be16(llc.length), llc));
}
export function snapFrame(srcMac, dstMac, oui, pid, payload) {
  const llc = bytes(Uint8Array.of(0xaa, 0xaa, 0x03), be24(oui), be16(pid), payload);
  return pad60(bytes(macBytes(dstMac), macBytes(srcMac), be16(llc.length), llc));
}
/** STP/RSTP BPDU. o: { version (0|2), flags, rootPrio, rootMac, cost, bridgePrio, bridgeMac, portId, age, maxAge, hello, fwd } */
export function bpdu(o) {
  const id = (p, m) => bytes(be16(p), macBytes(m));
  const v = o.version ?? 0;
  const body = bytes(be16(0), Uint8Array.of(v, v === 0 ? 0 : 2, o.flags ?? 0), id(o.rootPrio ?? 32768, o.rootMac), be32(o.cost ?? 0),
    id(o.bridgePrio ?? 32768, o.bridgeMac), be16(o.portId ?? 0x8001), be16((o.age ?? 0) * 256), be16((o.maxAge ?? 20) * 256),
    be16((o.hello ?? 2) * 256), be16((o.fwd ?? 15) * 256), v >= 2 ? Uint8Array.of(0) : new Uint8Array(0));
  return body;
}
/** CDP packet body (version 2). tlvs: [[type, bytes]] */
export function cdp(tlvs, ttl = 180) {
  const body = bytes(Uint8Array.of(2, ttl), be16(0), ...tlvs.map(([t, v]) => bytes(be16(t), be16(v.length + 4), v)));
  // Cisco sign-extends an odd trailing byte into the last 16-bit word
  let s = 0, i = 0;
  for (; i + 1 < body.length; i += 2) s += (body[i] << 8) | body[i + 1];
  if (i < body.length) s += body[i] & 0x80 ? 0xff00 | body[i] : body[i];
  while (s > 0xffff) s = (s & 0xffff) + Math.floor(s / 65536);
  const c = (~s) & 0xffff;
  body[2] = c >> 8; body[3] = c & 255;
  return body;
}
/** LACPDU (slow protocols subtype 1). */
export function lacp(actor, partner) {
  const info = (t, x) => bytes(Uint8Array.of(t, 20), be16(x.sysPrio ?? 32768), macBytes(x.sys), be16(x.key ?? 1), be16(x.portPrio ?? 32768), be16(x.port ?? 1), Uint8Array.of(x.state ?? 0x3d), new Uint8Array(3));
  return bytes(Uint8Array.of(1, 1), info(1, actor), info(2, partner), Uint8Array.of(3, 16), be16(0), new Uint8Array(12), Uint8Array.of(0, 0), new Uint8Array(50));
}
/** EAPOL frame body: version 2, type, body */
export function eapol(type, body) { return bytes(Uint8Array.of(2, type), be16(body.length), body); }
export function eap(code, id, type, data = new Uint8Array(0)) {
  const tb = code <= 2 ? bytes(Uint8Array.of(type), data) : new Uint8Array(0);
  return bytes(Uint8Array.of(code, id), be16(4 + tb.length), tb);
}

// ---------------------------------------------------------------------------------------------
// Routing protocols
export function ospf(type, router, area, body) {
  const p = bytes(Uint8Array.of(2, type), be16(24 + body.length), ip4Bytes(router), ip4Bytes(area), be16(0), be16(0), new Uint8Array(8), body);
  const c = checksum(p); p[12] = c >> 8; p[13] = c & 255;
  return p;
}
export function ospfHello(mask, interval, prio, dead, dr, bdr, neighbors) {
  return bytes(ip4Bytes(mask), be16(interval), Uint8Array.of(0x02, prio), be32(dead), ip4Bytes(dr), ip4Bytes(bdr), ...neighbors.map(ip4Bytes));
}
/** Router LSA with point-to-point / stub links: links = [[id, data, type, metric]] */
export function routerLsa(age, lsid, adv, seq, links) {
  const body = bytes(Uint8Array.of(0, 0), be16(links.length), ...links.map(([id, data, type, metric]) => bytes(ip4Bytes(id), ip4Bytes(data), Uint8Array.of(type, 0), be16(metric))));
  const h = bytes(be16(age), Uint8Array.of(0x22, 1), ip4Bytes(lsid), ip4Bytes(adv), be32(seq), be16(0), be16(20 + body.length));
  const lsa = bytes(h, body);
  const ck = fletcher(lsa.subarray(2), 14);
  lsa[16] = ck >> 8; lsa[17] = ck & 255;
  return lsa;
}
/** ISO 8473 Fletcher checksum as used by OSPF LSAs (offset is the checksum position within buf). */
function fletcher(buf, offset) {
  let c0 = 0, c1 = 0;
  for (let i = 0; i < buf.length; i++) { c0 = (c0 + (i === offset || i === offset + 1 ? 0 : buf[i])) % 255; c1 = (c1 + c0) % 255; }
  // RFC 905 annex B: n is the 1-based position of the first checksum octet
  const k = buf.length - (offset + 1);
  let x = ((k * c0 - c1) % 255 + 255) % 255; if (x === 0) x = 255;
  let y = ((c1 - (k + 1) * c0) % 255 + 255) % 255; if (y === 0) y = 255;
  return (x << 8) | y;
}
export function bgp(type, body) { return bytes(new Uint8Array(16).fill(0xff), be16(19 + body.length), Uint8Array.of(type), body); }
export function bgpOpen(as, hold, id, caps) {
  const capb = bytes(...caps.map(([c, v]) => bytes(Uint8Array.of(c, v.length), v)));
  const opt = capb.length ? bytes(Uint8Array.of(2, capb.length), capb) : new Uint8Array(0);
  return bgp(1, bytes(Uint8Array.of(4), be16(as > 65535 ? 23456 : as), be16(hold), ip4Bytes(id), Uint8Array.of(opt.length), opt));
}
/** UPDATE: withdrawn/nlri as ['10.1.0.0/16'], attrs as [[flags, type, bytes]] */
export function bgpUpdate(withdrawn, attrs, nlri) {
  const pfx = (p) => { const [a, l] = p.split('/'); const n = +l; return bytes(Uint8Array.of(n), ip4Bytes(a).subarray(0, Math.ceil(n / 8))); };
  const w = bytes(...withdrawn.map(pfx));
  const a = bytes(...attrs.map(([f, t, v]) => (f & 0x10 ? bytes(Uint8Array.of(f, t), be16(v.length), v) : bytes(Uint8Array.of(f, t, v.length), v))));
  return bgp(2, bytes(be16(w.length), w, be16(a.length), a, ...nlri.map(pfx)));
}
export function rip(cmd, entries, version = 2) {
  return bytes(Uint8Array.of(cmd, version), be16(0), ...entries.map((e) => bytes(be16(e.afi ?? 2), be16(e.tag ?? 0), ip4Bytes(e.ip), ip4Bytes(e.mask ?? '0.0.0.0'), ip4Bytes(e.next ?? '0.0.0.0'), be32(e.metric))));
}
export function vrrp(vrid, prio, addrs, interval = 1) {
  const p = bytes(Uint8Array.of(0x31, vrid, prio, addrs.length), be16(interval * 100 & 0xfff), be16(0), ...addrs.map(ip4Bytes));
  return p;
}
export function hsrp(opcode, state, group, prio, vip, auth = 'cisco') {
  const a = new Uint8Array(8); a.set(te(auth).subarray(0, 8));
  return bytes(Uint8Array.of(0, opcode, state, 3, 10, prio, group, 0), a, ip4Bytes(vip));
}

// ---------------------------------------------------------------------------------------------
// 802.11 / radiotap
/** Minimal radiotap: flags, rate, channel, dBm signal, antenna. */
export function radiotap(o = {}) {
  const present = (1 << 1) | (1 << 2) | (1 << 3) | (1 << 5) | (1 << 11);
  const body = bytes(Uint8Array.of(o.flags ?? 0, o.rate ?? 2), le16(o.freq ?? 2437), le16(o.chflags ?? 0x00a0), Uint8Array.of((o.signal ?? -50) & 255, o.antenna ?? 0));
  return bytes(Uint8Array.of(0, 0), le16(8 + body.length), le32(present), body);
}
/** 802.11 header. fc: frame control (type/subtype byte, flags byte) */
export function wlanHeader(fc0, fc1, a1, a2, a3, seq = 0, duration = 0) {
  const h = bytes(Uint8Array.of(fc0, fc1), le16(duration), macBytes(a1));
  if (a2 == null) return h;
  if (a3 == null) return bytes(h, macBytes(a2));
  return bytes(h, macBytes(a2), macBytes(a3), le16(seq << 4));
}
export function ie(id, data) { return bytes(Uint8Array.of(id, data.length), data); }
export function beaconBody(ssid, channel, ts = 0n, interval = 100, cap = 0x0431, extra = []) {
  const tsb = new Uint8Array(8); new DataView(tsb.buffer).setBigUint64(0, BigInt(ts), true);
  return bytes(tsb, le16(interval), le16(cap), ie(0, te(ssid)), ie(1, Uint8Array.of(0x82, 0x84, 0x8b, 0x96, 0x0c, 0x12, 0x18, 0x24)), ie(3, Uint8Array.of(channel)), ...extra);
}
export const RSN_PSK = ie(48, bytes(le16(1), Uint8Array.of(0, 0x0f, 0xac, 4), le16(1), Uint8Array.of(0, 0x0f, 0xac, 4), le16(1), Uint8Array.of(0, 0x0f, 0xac, 2), le16(0)));

export { bytes, te, be16, be32, macBytes, ip4Bytes, ip6Bytes, ether, pad60, vlanTag, ipv4, ipv6, udp, icmp, icmpv6, udpFrame, tcpFrame, icmpFrame, arp, l2, Capture, TcpConversation, TCP, rng };

// ---------------------------------------------------------------------------------------------
// Sample captures
const T0 = 1763452800; // 2025-11-18 08:00:00 UTC
const LAN = {
  gw: { mac: '00:11:32:aa:bb:cc', ip: '192.168.0.1', ip6: 'fe80::211:32ff:feaa:bbcc' },
  pc: { mac: 'a4:83:e7:12:34:56', ip: '192.168.0.10', ip6: 'fe80::a683:e7ff:fe12:3456', g6: '2001:db8:1::10' },
  nas: { mac: '00:11:32:01:02:03', ip: '192.168.0.20' },
  printer: { mac: '00:00:48:11:22:33', ip: '192.168.0.30' },
  phone: { mac: 'f0:18:98:44:55:66', ip: '192.168.0.40' },
};
const f6 = (srcMac, dstMac, src, dst, type, code, body, hlim = 255) =>
  pad60(ether(srcMac, dstMac, 0x86dd, ipv6({ src, dst, nxt: 58, hlim }, icmpv6(src, dst, type, code, body))));
const lla = (t, m) => bytes(Uint8Array.of(t, 1), macBytes(m));
const hex2 = (x) => x.toString(16).padStart(2, '0');
const sol = (a) => { const b = ip6Bytes(a); return `ff02::1:ff${hex2(b[13])}:${((b[14] << 8) | b[15]).toString(16)}`; };
const solMac = (a) => { const b = ip6Bytes(a); return `33:33:ff:${hex2(b[13])}:${hex2(b[14])}:${hex2(b[15])}`; };
const ping = (seq, id = 1) => bytes(be16(id), be16(seq));
/** Linux ping payload: struct timeval (16 bytes, little endian) then a byte pattern. */
const pingData = (cap, n = 48) => {
  const sec = Math.floor(cap.t), us = Math.round((cap.t - sec) * 1e6);
  return bytes(le32(sec), le32(0), le32(us), le32(0), Uint8Array.from({ length: n - 16 }, (_, i) => 0x10 + i));
};

function vlanSample() {
  const cap = new Capture(T0, { comment: '802.1Q and 802.1ad (QinQ) tagged traffic on a trunk port' });
  const A = { mac: '00:1b:21:00:10:01', ip: '10.10.0.11' }, B = { mac: '00:1b:21:00:10:02', ip: '10.10.0.1' };
  const C = { mac: '00:1b:21:00:20:01', ip: '10.20.0.21' }, D = { mac: '00:1b:21:00:20:02', ip: '10.20.0.1' };
  for (let i = 0; i < 3; i++) {
    cap.wait(0.2);
    const pd = pingData(cap);
    cap.add(icmpFrame({ srcMac: A.mac, dstMac: B.mac, src: A.ip, dst: B.ip, vlan: 10 }, 8, 0, ping(i + 1, 0x10), pd));
    cap.add(icmpFrame({ srcMac: B.mac, dstMac: A.mac, src: B.ip, dst: A.ip, vlan: 10 }, 0, 0, ping(i + 1, 0x10), pd), { dt: 0.0004 });
  }
  cap.add(pad60(ether(C.mac, 'ff:ff:ff:ff:ff:ff', 0x8100, bytes(vlanTag(20, 0x0806, 0), arp({ op: 1, srcMac: C.mac, srcIp: C.ip, dstIp: D.ip }).subarray(14, 42)))), { dt: 0.1 });
  cap.add(pad60(ether(D.mac, C.mac, 0x8100, bytes(vlanTag(20, 0x0806, 0), arp({ op: 2, srcMac: D.mac, srcIp: D.ip, dstMac: C.mac, dstIp: C.ip }).subarray(14, 42)))), { dt: 0.001 });
  cap.add(udpFrame({ srcMac: C.mac, dstMac: D.mac, src: C.ip, dst: D.ip, sport: 40123, dport: 33000, vlan: 20, pri: 5 }, te('voice-priority test')), { dt: 0.05 });
  // QinQ: S-tag 100 + C-tag 10
  const inner = ipv4({ src: A.ip, dst: B.ip, proto: 17 }, udp({ src: A.ip, dst: B.ip, sport: 41000, dport: 33001 }, te('provider bridge')));
  cap.add(pad60(ether(A.mac, B.mac, 0x88a8, bytes(vlanTag(100, 0x8100), vlanTag(10, 0x0800), inner))), { dt: 0.05 });
  const back = ipv4({ src: B.ip, dst: A.ip, proto: 17 }, udp({ src: B.ip, dst: A.ip, sport: 33001, dport: 41000 }, te('reply')));
  cap.add(pad60(ether(B.mac, A.mac, 0x88a8, bytes(vlanTag(100, 0x8100), vlanTag(10, 0x0800), back))), { dt: 0.001 });
  return cap.file('vlan-tagged.pcapng');
}

function ndSample() {
  const cap = new Capture(T0, { comment: 'IPv6 stateless autoconfiguration: RS/RA, DAD, NS/NA, MLDv2 and ping6' });
  const { gw, pc } = LAN;
  // Duplicate address detection for the link-local address (source ::)
  cap.add(f6(pc.mac, '33:33:00:00:00:16', pc.ip6, 'ff02::16', 143, 0, bytes(be16(0), be16(1), Uint8Array.of(4, 0), be16(0), ip6Bytes(sol(pc.ip6))), 1));
  cap.add(f6(pc.mac, solMac(pc.ip6), '::', sol(pc.ip6), 135, 0, bytes(be32(0), ip6Bytes(pc.ip6))), { dt: 0.3 });
  cap.add(f6(pc.mac, '33:33:00:00:00:02', pc.ip6, 'ff02::2', 133, 0, bytes(be32(0), lla(1, pc.mac))), { dt: 1.0 });
  const pio = bytes(Uint8Array.of(3, 4, 64, 0xc0), be32(2592000), be32(604800), be32(0), ip6Bytes('2001:db8:1::'));
  const rdnss = bytes(Uint8Array.of(25, 3, 0, 0), be32(1800), ip6Bytes('2001:db8:1::1'));
  const dnssl = bytes(Uint8Array.of(31, 2, 0, 0), be32(1800), Uint8Array.of(4, 104, 111, 109, 101, 0, 0, 0));
  const mtu = bytes(Uint8Array.of(5, 1, 0, 0), be32(1500));
  cap.add(f6(gw.mac, '33:33:00:00:00:01', gw.ip6, 'ff02::1', 134, 0, bytes(Uint8Array.of(64, 0x00), be16(1800), be32(0), be32(0), lla(1, gw.mac), mtu, pio, rdnss, dnssl)), { dt: 0.004 });
  // DAD for the global address
  cap.add(f6(pc.mac, '33:33:00:00:00:16', pc.ip6, 'ff02::16', 143, 0, bytes(be16(0), be16(1), Uint8Array.of(4, 0), be16(0), ip6Bytes(sol(pc.g6))), 1), { dt: 0.01 });
  cap.add(f6(pc.mac, solMac(pc.g6), '::', sol(pc.g6), 135, 0, bytes(be32(0), ip6Bytes(pc.g6))), { dt: 0.2 });
  // address resolution of the router
  cap.add(f6(pc.mac, solMac(gw.ip6), pc.g6, sol(gw.ip6), 135, 0, bytes(be32(0), ip6Bytes(gw.ip6), lla(1, pc.mac))), { dt: 1.0 });
  cap.add(f6(gw.mac, pc.mac, gw.ip6, pc.g6, 136, 0, bytes(be32(0xe0000000), ip6Bytes(gw.ip6), lla(2, gw.mac))), { dt: 0.0006 });
  // ping6 to a global host via the router
  const H = '2001:db8::53';
  for (let i = 1; i <= 3; i++) {
    cap.wait(1.0);
    const pd = pingData(cap, 56);
    cap.add(f6(pc.mac, gw.mac, pc.g6, H, 128, 0, bytes(be16(0x2a), be16(i), pd), 64));
    cap.add(f6(gw.mac, pc.mac, H, pc.g6, 129, 0, bytes(be16(0x2a), be16(i), pd), 58), { dt: 0.012 });
  }
  // router's periodic MLD query and the host's report
  cap.add(f6(gw.mac, '33:33:00:00:00:01', gw.ip6, 'ff02::1', 130, 0, bytes(be16(10000), be16(0), ip6Bytes('::'), Uint8Array.of(2, 125), be16(0)), 1), { dt: 0.5 });
  cap.add(f6(pc.mac, '33:33:00:00:00:16', pc.ip6, 'ff02::16', 143, 0, bytes(be16(0), be16(2), Uint8Array.of(2, 0), be16(0), ip6Bytes(sol(pc.ip6)), Uint8Array.of(2, 0), be16(0), ip6Bytes('ff02::fb')), 1), { dt: 0.3 });
  // reachability confirmation (unicast NS / solicited NA)
  cap.add(f6(gw.mac, pc.mac, gw.ip6, pc.g6, 135, 0, bytes(be32(0), ip6Bytes(pc.g6), lla(1, gw.mac))), { dt: 5 });
  cap.add(f6(pc.mac, gw.mac, pc.g6, gw.ip6, 136, 0, bytes(be32(0x40000000), ip6Bytes(pc.g6))), { dt: 0.0003 });
  return cap.file('ipv6-neighbor-discovery.pcapng');
}

function arpStormSample() {
  const cap = new Capture(T0, { comment: 'A scanner floods ARP requests; a duplicate IP address and gratuitous ARP' });
  const r = rng(7);
  const scanner = { mac: '00:0c:29:5a:5b:5c', ip: '192.168.0.66' };
  cap.add(arp({ op: 1, srcMac: scanner.mac, srcIp: scanner.ip, dstIp: scanner.ip }));
  const hosts = new Map([[1, LAN.gw], [10, LAN.pc], [20, LAN.nas], [30, LAN.printer], [40, LAN.phone]]);
  for (let h = 1; h <= 120; h++) {
    cap.add(arp({ op: 1, srcMac: scanner.mac, srcIp: scanner.ip, dstIp: `192.168.0.${h}` }), { dt: 0.002 + r() * 0.002 });
    const host = hosts.get(h);
    if (host) cap.add(arp({ op: 2, srcMac: host.mac, srcIp: host.ip, dstMac: scanner.mac, dstIp: scanner.ip }), { dt: 0.0003 });
  }
  // ARP probe and announcement from a new device (RFC 5227)
  const cam = { mac: '44:19:b6:01:02:03', ip: '192.168.0.50' };
  cap.add(arp({ op: 1, srcMac: cam.mac, srcIp: '0.0.0.0', dstIp: cam.ip }), { dt: 0.5 });
  cap.add(arp({ op: 1, srcMac: cam.mac, srcIp: '0.0.0.0', dstIp: cam.ip }), { dt: 1.0 });
  cap.add(arp({ op: 1, srcMac: cam.mac, srcIp: cam.ip, dstIp: cam.ip }), { dt: 1.0 });
  // a misconfigured laptop claims the NAS address: duplicate IP
  const rogue = { mac: '3c:22:fb:99:88:77', ip: LAN.nas.ip };
  cap.add(arp({ op: 1, srcMac: LAN.pc.mac, srcIp: LAN.pc.ip, dstIp: LAN.nas.ip }), { dt: 2 });
  cap.add(arp({ op: 2, srcMac: LAN.nas.mac, srcIp: LAN.nas.ip, dstMac: LAN.pc.mac, dstIp: LAN.pc.ip }), { dt: 0.0004 });
  cap.add(arp({ op: 2, srcMac: rogue.mac, srcIp: rogue.ip, dstMac: LAN.pc.mac, dstIp: LAN.pc.ip }), { dt: 0.0006 });
  cap.add(arp({ op: 2, srcMac: rogue.mac, srcIp: rogue.ip, dstMac: 'ff:ff:ff:ff:ff:ff', dstIp: rogue.ip, ethDst: 'ff:ff:ff:ff:ff:ff' }), { dt: 0.5 });
  return cap.file('arp-storm.pcapng');
}

function pingTraceSample() {
  const cap = new Capture(T0, { comment: 'ping with one lost reply, then a UDP traceroute (TTL exceeded and port unreachable)' });
  const { gw, pc } = LAN;
  const DST = '93.184.216.34';
  for (let i = 1; i <= 5; i++) {
    if (i > 1) cap.wait(1.0);
    const pd = pingData(cap);
    cap.add(icmpFrame({ srcMac: pc.mac, dstMac: gw.mac, src: pc.ip, dst: DST, ttl: 64 }, 8, 0, ping(i, 0x1f2e), pd));
    if (i !== 3) cap.add(icmpFrame({ srcMac: gw.mac, dstMac: pc.mac, src: DST, dst: pc.ip, ttl: 54 }, 0, 0, ping(i, 0x1f2e), pd), { dt: 0.018 + i * 0.0007 });
  }
  const hops = ['192.168.0.1', '100.64.0.1', '203.0.113.9', '198.51.100.17'];
  let port = 33434;
  for (let ttl = 1; ttl <= 5; ttl++) {
    for (let k = 0; k < 2; k++) {
      const probe = ipv4({ src: pc.ip, dst: DST, proto: 17, ttl, df: false }, udp({ src: pc.ip, dst: DST, sport: 50443, dport: port }, new Uint8Array(32)));
      cap.add(l2({ srcMac: pc.mac, dstMac: gw.mac }, probe), { dt: 0.05 });
      if (ttl <= hops.length) {
        // routers quote the IP header + 8 bytes; the TTL they saw is 1 (header checksum fixed up)
        const quoted = probe.slice(0, 28);
        quoted[8] = 1; quoted[10] = 0; quoted[11] = 0;
        const c = checksum(quoted.subarray(0, 20)); quoted[10] = c >> 8; quoted[11] = c & 255;
        cap.add(l2({ srcMac: gw.mac, dstMac: pc.mac }, ipv4({ src: hops[ttl - 1], dst: pc.ip, proto: 1, ttl: 64 - ttl }, icmp(11, 0, be32(0), quoted))), { dt: 0.003 + ttl * 0.004 });
      } else {
        cap.add(l2({ srcMac: gw.mac, dstMac: pc.mac }, ipv4({ src: DST, dst: pc.ip, proto: 1, ttl: 54 }, icmp(3, 3, be32(0), probe))), { dt: 0.021 });
      }
      port++;
    }
  }
  return cap.file('ping-traceroute.pcapng');
}

function routingSample() {
  const cap = new Capture(T0, { comment: 'OSPF adjacency, BGP session, RIPv2 updates, VRRP and HSRP hellos' });
  const R1 = { mac: '00:1b:21:00:00:01', ip: '192.168.0.1' }, R2 = { mac: '00:1b:21:00:00:02', ip: '192.168.0.2' };
  const ipf = (a, dst, dmac, proto, payload, ttl = 1) => pad60(ether(a.mac, dmac, 0x800, ipv4({ src: a.ip, dst, proto, ttl, tos: 0xc0 }, payload)));
  const hello = (rid, dr, bdr, nbrs) => ospf(1, rid, '0.0.0.0', ospfHello('255.255.255.0', 10, 1, 40, dr, bdr, nbrs));
  cap.add(ipf(R1, '224.0.0.5', '01:00:5e:00:00:05', 89, hello('1.1.1.1', '0.0.0.0', '0.0.0.0', [])));
  cap.add(ipf(R2, '224.0.0.5', '01:00:5e:00:00:05', 89, hello('2.2.2.2', '0.0.0.0', '0.0.0.0', ['1.1.1.1'])), { dt: 2.1 });
  cap.add(ipf(R1, '224.0.0.5', '01:00:5e:00:00:05', 89, hello('1.1.1.1', '192.168.0.2', '192.168.0.1', ['2.2.2.2'])), { dt: 0.4 });
  cap.add(ipf(R2, '192.168.0.1', R1.mac, 89, ospf(2, '2.2.2.2', '0.0.0.0', bytes(be16(1500), Uint8Array.of(0x02, 0x07), be32(0x2000)))), { dt: 0.01 });
  cap.add(ipf(R1, '192.168.0.2', R2.mac, 89, ospf(2, '1.1.1.1', '0.0.0.0', bytes(be16(1500), Uint8Array.of(0x02, 0x02), be32(0x2000)))), { dt: 0.002 });
  const lsa1 = routerLsa(1, '1.1.1.1', '1.1.1.1', 0x80000003, [['192.168.0.2', '192.168.0.1', 2, 10], ['10.1.0.0', '255.255.0.0', 3, 1]]);
  const lsa2 = routerLsa(1, '2.2.2.2', '2.2.2.2', 0x80000002, [['192.168.0.2', '192.168.0.2', 2, 10], ['10.2.0.0', '255.255.0.0', 3, 1]]);
  cap.add(ipf(R2, '192.168.0.1', R1.mac, 89, ospf(3, '2.2.2.2', '0.0.0.0', bytes(be32(1), ip4Bytes('1.1.1.1'), ip4Bytes('1.1.1.1')))), { dt: 0.01 });
  cap.add(ipf(R1, '224.0.0.6', '01:00:5e:00:00:06', 89, ospf(4, '1.1.1.1', '0.0.0.0', bytes(be32(1), lsa1))), { dt: 0.003 });
  cap.add(ipf(R2, '224.0.0.5', '01:00:5e:00:00:05', 89, ospf(5, '2.2.2.2', '0.0.0.0', lsa1.subarray(0, 20))), { dt: 0.2 });
  cap.add(ipf(R2, '224.0.0.5', '01:00:5e:00:00:05', 89, ospf(4, '2.2.2.2', '0.0.0.0', bytes(be32(1), lsa2))), { dt: 0.05 });
  cap.add(ipf(R1, '224.0.0.5', '01:00:5e:00:00:05', 89, ospf(5, '1.1.1.1', '0.0.0.0', lsa2.subarray(0, 20))), { dt: 0.2 });
  // BGP between the two routers
  cap.wait(0.5);
  const tc = new TcpConversation(cap, { mac: R1.mac, ip: R1.ip, port: 50179, ttl: 1 }, { mac: R2.mac, ip: R2.ip, port: 179, ttl: 1 }, { rtt: 0.001 });
  tc.handshake();
  const mp = [1, bytes(be16(1), Uint8Array.of(0, 1))];
  tc.send('c', bgpOpen(65001, 180, '1.1.1.1', [mp, [2, new Uint8Array(0)], [65, be32(65001)]]));
  tc.send('s', bgpOpen(65002, 90, '2.2.2.2', [mp, [2, new Uint8Array(0)], [65, be32(65002)]]));
  tc.send('c', bgp(4, new Uint8Array(0)));
  tc.send('s', bgp(4, new Uint8Array(0)));
  tc.send('c', bgpUpdate([], [[0x40, 1, Uint8Array.of(0)], [0x40, 2, bytes(Uint8Array.of(2, 1), be32(65001))], [0x40, 3, ip4Bytes(R1.ip)], [0x80, 4, be32(0)]], ['10.1.0.0/16', '172.16.0.0/12']));
  tc.send('s', bgpUpdate([], [[0x40, 1, Uint8Array.of(0)], [0x40, 2, bytes(Uint8Array.of(2, 2), be32(65002), be32(64512))], [0x40, 3, ip4Bytes(R2.ip)], [0xc0, 8, bytes(be16(65002), be16(100))]], ['10.2.0.0/16']));
  cap.wait(30);
  tc.send('c', bgp(4, new Uint8Array(0)));
  tc.send('s', bgpUpdate(['172.16.0.0/12'], [], []));
  // RIPv2 and first-hop redundancy
  const R3 = { mac: '00:1b:21:00:00:03', ip: '192.168.0.3' };
  cap.add(udpFrame({ srcMac: R3.mac, dstMac: '01:00:5e:00:00:09', src: R3.ip, dst: '224.0.0.9', sport: 520, dport: 520, ttl: 1 }, rip(1, [{ afi: 0, ip: '0.0.0.0', metric: 16 }])), { dt: 0.5 });
  cap.add(udpFrame({ srcMac: R1.mac, dstMac: '01:00:5e:00:00:09', src: R1.ip, dst: '224.0.0.9', sport: 520, dport: 520, ttl: 1 }, rip(2, [{ ip: '10.1.0.0', mask: '255.255.0.0', metric: 1 }, { ip: '10.2.0.0', mask: '255.255.0.0', next: R2.ip, metric: 2 }])), { dt: 0.2 });
  for (let i = 0; i < 3; i++) {
    const v = vrrp(1, 120, ['192.168.0.254']);
    const ck = checksum(v); v[6] = ck >> 8; v[7] = ck & 255;
    cap.add(pad60(ether('00:00:5e:00:01:01', '01:00:5e:00:00:12', 0x800, ipv4({ src: R1.ip, dst: '224.0.0.18', proto: 112, ttl: 255 }, v))), { dt: 1 });
    cap.add(udpFrame({ srcMac: '00:00:0c:07:ac:01', dstMac: '01:00:5e:00:00:02', src: R2.ip, dst: '224.0.0.2', sport: 1985, dport: 1985, ttl: 1 }, hsrp(0, i === 0 ? 8 : 16, 1, 110, '192.168.0.253')), { dt: 0.3 });
  }
  return cap.file('routing-protocols.pcapng');
}

function lanControlSample() {
  const cap = new Capture(T0, { comment: 'Switch control plane: STP/RSTP, LLDP, CDP, LACP and 802.1X (EAPOL)' });
  const SW = '00:1b:21:aa:bb:01', SW2 = '00:1b:21:aa:bb:02';
  const T = lldpTlv;
  const lldp = () => lldpFrame(SW, [T(1, bytes(Uint8Array.of(4), macBytes(SW))), T(2, bytes(Uint8Array.of(5), te('Gi1/0/1'))), T(3, be16(120)), T(4, te('Uplink to core')),
    T(5, te('sw-access-01')), T(6, te('Example switch OS 1.0')), T(7, bytes(be16(0x0014), be16(0x0004))),
    T(8, bytes(Uint8Array.of(5, 1), ip4Bytes('192.168.0.2'), Uint8Array.of(2), be32(1), Uint8Array.of(0))),
    T(127, bytes(Uint8Array.of(0x00, 0x80, 0xc2, 1), be16(10))), T(127, bytes(Uint8Array.of(0x00, 0x12, 0x0f, 4), be16(9216)))]);
  const cdpBody = cdp([[1, te('sw-access-01')], [2, bytes(be32(1), Uint8Array.of(1, 1, 0xcc), be16(4), ip4Bytes('192.168.0.2'))], [3, te('GigabitEthernet1/0/1')], [4, be32(0x28)], [5, te('Cisco IOS Software, Version 15.2(7)E')], [6, te('cisco WS-C2960X-24TS')], [10, be16(10)], [11, Uint8Array.of(1)]]);
  for (let i = 0; i < 4; i++) {
    cap.add(llcFrame(SW, '01:80:c2:00:00:00', 0x42, 0x42, 3, bpdu({ version: 2, flags: 0x3c, rootPrio: 4096, rootMac: SW, bridgeMac: SW, cost: 0, portId: 0x8001 })), { dt: i ? 2 : 0 });
    if (i === 1) cap.add(lldp(), { dt: 0.3 });
    if (i === 2) cap.add(snapFrame(SW, '01:00:0c:cc:cc:cc', 0x00000c, 0x2000, cdpBody), { dt: 0.4 });
  }
  // a second switch joins: legacy STP config BPDU and topology change notification
  cap.add(llcFrame(SW2, '01:80:c2:00:00:00', 0x42, 0x42, 3, bpdu({ rootPrio: 4096, rootMac: SW, bridgeMac: SW2, cost: 4, portId: 0x8002, age: 1 })), { dt: 0.2 });
  cap.add(llcFrame(SW2, '01:80:c2:00:00:00', 0x42, 0x42, 3, Uint8Array.of(0, 0, 0, 0x80)), { dt: 0.1 });
  // LACP negotiation on a two-port bundle
  for (let i = 0; i < 2; i++) {
    cap.add(pad60(ether(SW, '01:80:c2:00:00:02', 0x8809, lacp({ sys: SW, key: 13, port: 25 + i, state: i ? 0x3d : 0x45 }, { sys: SW2, key: 13, port: 49 + i, state: i ? 0x3d : 0x00 }))), { dt: 0.5 });
    cap.add(pad60(ether(SW2, '01:80:c2:00:00:02', 0x8809, lacp({ sys: SW2, key: 13, port: 49 + i, state: 0x3d }, { sys: SW, key: 13, port: 25 + i, state: 0x3d }))), { dt: 0.01 });
  }
  // 802.1X: a laptop authenticates with PEAP
  const PC = LAN.pc.mac;
  cap.add(pad60(ether(PC, '01:80:c2:00:00:03', 0x888e, eapol(1, new Uint8Array(0)))), { dt: 1 });
  cap.add(pad60(ether(SW, PC, 0x888e, eapol(0, eap(1, 1, 1)))), { dt: 0.004 });
  cap.add(pad60(ether(PC, SW, 0x888e, eapol(0, eap(2, 1, 1, te('alice@example.com'))))), { dt: 0.01 });
  cap.add(pad60(ether(SW, PC, 0x888e, eapol(0, eap(1, 2, 25, Uint8Array.of(0x21))))), { dt: 0.02 });
  cap.add(pad60(ether(PC, SW, 0x888e, eapol(0, eap(2, 2, 25, Uint8Array.of(0x01))))), { dt: 0.01 });
  cap.add(pad60(ether(SW, PC, 0x888e, eapol(0, eap(3, 3, 0)))), { dt: 0.2 });
  cap.add(lldp(), { dt: 1 });
  return cap.file('lan-control.pcapng');
}

function wifiSample() {
  const cap = new Capture(T0, { linktype: 127, ifname: 'wlan0mon', comment: 'Monitor-mode Wi-Fi: beacons, probing, open authentication, association, WPA2 4-way handshake and data' });
  const AP = '00:24:d4:11:22:33', STA = LAN.phone.mac, BC = 'ff:ff:ff:ff:ff:ff', GW = LAN.gw.mac;
  let seq = 1000, sseq = 10;
  const rt = (sig) => radiotap({ signal: sig, rate: 2, freq: 2437 });
  const ap = (sub, da, body) => bytes(rt(-38), wlanHeader(sub << 4, 0, da, AP, AP, (seq = (seq + 1) & 0xfff)), body);
  const sta = (sub, da, bssid, body) => bytes(rt(-55), wlanHeader(sub << 4, 0, da, STA, bssid, (sseq = (sseq + 1) & 0xfff)), body);
  const ack = (ra) => bytes(rt(-40), wlanHeader(0xd4, 0, ra));
  const vend = ie(221, Uint8Array.of(0x00, 0x10, 0x18, 2, 0, 0, 0x1c, 0, 0));
  const rates = ie(1, Uint8Array.of(0x82, 0x84, 0x8b, 0x96));
  let tsf = 5000000000n;
  for (let i = 0; i < 3; i++) { cap.add(ap(8, BC, beaconBody('HomeNet', 6, tsf, 100, 0x0431, [RSN_PSK, vend])), { dt: 0.1024 }); tsf += 102400n; }
  cap.add(sta(4, BC, BC, bytes(ie(0, new Uint8Array(0)), rates)), { dt: 0.02 });
  cap.add(sta(4, BC, BC, bytes(ie(0, te('HomeNet')), rates)), { dt: 0.001 });
  cap.add(ap(5, STA, beaconBody('HomeNet', 6, tsf, 100, 0x0431, [RSN_PSK])), { dt: 0.002 });
  cap.add(ack(AP), { dt: 0.0001 });
  cap.add(sta(11, AP, AP, bytes(le16(0), le16(1), le16(0))), { dt: 0.01 });
  cap.add(ack(STA), { dt: 0.0001 });
  cap.add(ap(11, STA, bytes(le16(0), le16(2), le16(0))), { dt: 0.002 });
  cap.add(ack(AP), { dt: 0.0001 });
  cap.add(sta(0, AP, AP, bytes(le16(0x0431), le16(10), ie(0, te('HomeNet')), rates, RSN_PSK)), { dt: 0.003 });
  cap.add(ack(STA), { dt: 0.0001 });
  cap.add(ap(1, STA, bytes(le16(0x0431), le16(0), le16(0xc001), rates)), { dt: 0.002 });
  cap.add(ack(AP), { dt: 0.0001 });
  // WPA2 4-way handshake (EAPOL-Key frames as LLC/SNAP data)
  // key data: a number of encrypted bytes, or plaintext IEs (message 2 carries the RSN IE)
  const keyFrame = (ki, nonceByte, mic, data) => {
    const kd = typeof data === 'number' ? new Uint8Array(data).fill(0xdd) : data;
    return eapol(3, bytes(Uint8Array.of(2), be16(ki), be16(16), new Uint8Array(7), Uint8Array.of(1), new Uint8Array(32).fill(nonceByte), new Uint8Array(16), new Uint8Array(8), new Uint8Array(8), new Uint8Array(16).fill(mic), be16(kd.length), kd));
  };
  const dataFrame = (fromAp, payloadType, payload) => {
    const hdr = fromAp ? wlanHeader(0x88, 0x02, STA, AP, AP, (seq = (seq + 1) & 0xfff)) : wlanHeader(0x88, 0x01, AP, STA, AP, (sseq = (sseq + 1) & 0xfff));
    return bytes(rt(fromAp ? -38 : -55), hdr, le16(fromAp ? 6 : 0), Uint8Array.of(0xaa, 0xaa, 3, 0, 0, 0), be16(payloadType), payload);
  };
  cap.add(dataFrame(true, 0x888e, keyFrame(0x008a, 0x11, 0, 0)), { dt: 0.005 });
  cap.add(dataFrame(false, 0x888e, keyFrame(0x010a, 0x22, 0x5c, RSN_PSK)), { dt: 0.004 });
  cap.add(dataFrame(true, 0x888e, keyFrame(0x13ca, 0x11, 0x6d, 56)), { dt: 0.004 });
  cap.add(dataFrame(false, 0x888e, keyFrame(0x030a, 0x00, 0x7e, 0)), { dt: 0.004 });
  // protected data afterwards (CCMP)
  const r = rng(80211);
  for (let i = 0; i < 4; i++) {
    const fromAp = i % 2 === 1;
    const hdr = fromAp ? wlanHeader(0x88, 0x42, STA, AP, GW, (seq = (seq + 1) & 0xfff)) : wlanHeader(0x88, 0x41, AP, STA, GW, (sseq = (sseq + 1) & 0xfff));
    cap.add(bytes(rt(fromAp ? -38 : -55), hdr, le16(0), Uint8Array.of(i + 1, 0, 0, 0x20, 0, 0, 0, 0), r.bytes(60 + i * 40)), { dt: 0.03 });
  }
  cap.add(bytes(rt(-55), wlanHeader(0x48, 0x11, AP, STA, AP, (sseq = (sseq + 1) & 0xfff))), { dt: 0.2 });
  cap.add(sta(12, AP, AP, le16(3)), { dt: 2 });
  // A Bluetooth LE session on the same computer's HCI follows, as a second interface (build/bluetooth.js).
  return appendBluetooth(cap.file('wifi-80211.pcapng'));
}

function tunnelsSample() {
  const cap = new Capture(T0, { comment: 'Encapsulations: GRE, VXLAN, GENEVE, MPLS, PPPoE session setup and IPsec ESP' });
  const A = '00:1b:21:00:00:01', B = '00:1b:21:00:00:02';
  const pingPkt = (src, dst, type, seq) => ipv4({ src, dst, proto: 1 }, icmp(type, 0, bytes(be16(0x77), be16(seq)), new Uint8Array(32).fill(0x61)));
  const outer = (src, dst, proto, payload, from = A, to = B) => pad60(ether(from, to, 0x800, ipv4({ src, dst, proto }, payload)));
  // GRE tunnel between two sites carrying a ping
  cap.add(outer('203.0.113.1', '198.51.100.1', 47, gre({ proto: 0x0800, key: 1001 }, pingPkt('10.1.0.10', '10.2.0.10', 8, 1))));
  cap.add(outer('198.51.100.1', '203.0.113.1', 47, gre({ proto: 0x0800, key: 1001 }, pingPkt('10.2.0.10', '10.1.0.10', 0, 1)), B, A), { dt: 0.02 });
  // VXLAN and GENEVE overlays carrying Ethernet frames
  const vm1 = '02:00:0a:00:00:01', vm2 = '02:00:0a:00:00:02';
  const innerReq = ether(vm1, vm2, 0x800, pingPkt('172.16.0.1', '172.16.0.2', 8, 2));
  const innerRep = ether(vm2, vm1, 0x800, pingPkt('172.16.0.2', '172.16.0.1', 0, 2));
  cap.add(udpFrame({ srcMac: A, dstMac: B, src: '192.168.0.11', dst: '192.168.0.12', sport: 49152, dport: 4789 }, vxlan(5001, innerReq)), { dt: 0.2 });
  cap.add(udpFrame({ srcMac: B, dstMac: A, src: '192.168.0.12', dst: '192.168.0.11', sport: 51234, dport: 4789 }, vxlan(5001, innerRep)), { dt: 0.0005 });
  cap.add(udpFrame({ srcMac: A, dstMac: B, src: '192.168.0.11', dst: '192.168.0.12', sport: 49153, dport: 6081 }, geneve(7000, 0x6558, innerReq, [[0x0102, 0x80, Uint8Array.of(0, 0, 0, 7)]])), { dt: 0.2 });
  cap.add(udpFrame({ srcMac: B, dstMac: A, src: '192.168.0.12', dst: '192.168.0.11', sport: 49154, dport: 6081 }, geneve(7000, 0x6558, innerRep)), { dt: 0.0005 });
  // MPLS label stack in a provider core
  cap.add(pad60(ether(A, B, 0x8847, mpls([{ label: 16004, ttl: 254 }, { label: 24001, ttl: 254 }], pingPkt('10.1.0.10', '10.2.0.10', 8, 3)))), { dt: 0.2 });
  cap.add(pad60(ether(B, A, 0x8847, mpls([{ label: 24001, ttl: 254 }], pingPkt('10.2.0.10', '10.1.0.10', 0, 3)))), { dt: 0.002 });
  // PPPoE discovery, LCP/PAP/IPCP and session data
  const H = LAN.pc.mac, AC = '00:90:1a:a0:00:01', sid = 0x0d42;
  const hu = [0x0103, Uint8Array.of(0xde, 0xad, 0xbe, 0xef)];
  const cookie = [0x0104, Uint8Array.of(1, 2, 3, 4, 5, 6, 7, 8)];
  cap.add(pppoeDiscovery(H, 'ff:ff:ff:ff:ff:ff', 0x09, 0, [[0x0101, new Uint8Array(0)], hu]), { dt: 0.5 });
  cap.add(pppoeDiscovery(AC, H, 0x07, 0, [[0x0101, new Uint8Array(0)], [0x0102, te('BRAS-SEOUL-01')], hu, cookie]), { dt: 0.01 });
  cap.add(pppoeDiscovery(H, AC, 0x19, 0, [[0x0101, new Uint8Array(0)], hu, cookie]), { dt: 0.01 });
  cap.add(pppoeDiscovery(AC, H, 0x65, sid, [[0x0101, new Uint8Array(0)], hu]), { dt: 0.01 });
  cap.add(pppoeSession(H, AC, sid, 0xc021, pppControl(1, 1, [[1, be16(1492)], [5, be32(0x1a2b3c4d)]])), { dt: 0.01 });
  cap.add(pppoeSession(AC, H, sid, 0xc021, pppControl(1, 1, [[1, be16(1492)], [3, be16(0xc023)], [5, be32(0x55667788)]])), { dt: 0.001 });
  cap.add(pppoeSession(H, AC, sid, 0xc021, pppControl(2, 1, [[1, be16(1492)], [3, be16(0xc023)], [5, be32(0x55667788)]])), { dt: 0.001 });
  cap.add(pppoeSession(AC, H, sid, 0xc021, pppControl(2, 1, [[1, be16(1492)], [5, be32(0x1a2b3c4d)]])), { dt: 0.001 });
  cap.add(pppoeSession(H, AC, sid, 0xc023, bytes(Uint8Array.of(1, 1), be16(20), Uint8Array.of(8), te('customer'), Uint8Array.of(6), te('s3cret'))), { dt: 0.01 });
  cap.add(pppoeSession(AC, H, sid, 0xc023, bytes(Uint8Array.of(2, 1), be16(13), Uint8Array.of(8), te('Login ok'))), { dt: 0.05 });
  cap.add(pppoeSession(H, AC, sid, 0x8021, pppControl(1, 1, [[3, ip4Bytes('0.0.0.0')], [129, ip4Bytes('0.0.0.0')]])), { dt: 0.01 });
  cap.add(pppoeSession(AC, H, sid, 0x8021, pppControl(3, 1, [[3, ip4Bytes('100.64.12.34')], [129, ip4Bytes('8.8.8.8')]])), { dt: 0.002 });
  cap.add(pppoeSession(H, AC, sid, 0x0021, pingPkt('100.64.12.34', '8.8.8.8', 8, 4)), { dt: 0.05 });
  cap.add(pppoeSession(AC, H, sid, 0x0021, pingPkt('8.8.8.8', '100.64.12.34', 0, 4)), { dt: 0.03 });
  cap.add(pppoeSession(H, AC, sid, 0xc021, pppControl(9, 2, [], be32(0x1a2b3c4d))), { dt: 10 });
  cap.add(pppoeSession(AC, H, sid, 0xc021, pppControl(10, 2, [], be32(0x55667788))), { dt: 0.002 });
  // IPsec ESP site-to-site traffic
  const r = rng(50);
  for (let i = 1; i <= 4; i++) {
    cap.add(outer('203.0.113.1', '198.51.100.1', 50, esp(0x1c2d3e4f, i, 80 + (i % 2) * 48, r)), { dt: 0.1 });
    cap.add(outer('198.51.100.1', '203.0.113.1', 50, esp(0xa1b2c3d4, i, 80, r), B, A), { dt: 0.01 });
  }
  return cap.file('tunnels.pcapng');
}

export const samples = [
  { id: 'vlan-tagged', group: 'lan', icon: 'layers', ko: ['VLAN 태그', '802.1Q와 QinQ(802.1ad) 태그가 붙은 트렁크 포트 트래픽'], en: ['VLAN tagged', '802.1Q and QinQ (802.1ad) tagged traffic on a trunk port'], build: vlanSample },
  { id: 'ipv6-neighbor-discovery', group: 'lan', icon: 'network', ko: ['IPv6 이웃 탐색', 'RS/RA, 중복 주소 검사, NS/NA, MLDv2와 ping6로 보는 IPv6 자동 설정'], en: ['IPv6 neighbor discovery', 'IPv6 autoconfiguration: RS/RA, duplicate address detection, NS/NA, MLDv2 and ping6'], build: ndSample },
  { id: 'arp-storm', group: 'troubleshooting', icon: 'warning', ko: ['ARP 폭주', '스캐너의 ARP 요청 폭주, 중복 IP 주소와 그래튜이터스 ARP'], en: ['ARP storm', 'A scanner floods ARP requests, plus a duplicate IP address and gratuitous ARP'], build: arpStormSample },
  { id: 'ping-traceroute', group: 'basics', icon: 'route', ko: ['Ping과 traceroute', '응답 하나가 사라진 ping과 TTL 초과·포트 도달 불가로 경로를 찾는 UDP traceroute'], en: ['Ping and traceroute', 'Ping with a lost reply and a UDP traceroute using TTL exceeded and port unreachable'], build: pingTraceSample },
  { id: 'routing-protocols', group: 'lan', icon: 'router', ko: ['라우팅 프로토콜', 'OSPF 인접 관계, BGP 세션, RIPv2 갱신, VRRP와 HSRP 헬로'], en: ['Routing protocols', 'OSPF adjacency, a BGP session, RIPv2 updates, VRRP and HSRP hellos'], build: routingSample },
  { id: 'lan-control', group: 'lan', icon: 'switch', ko: ['LAN 제어 프로토콜', '스위치 제어 평면: STP/RSTP, LLDP, CDP, LACP, 802.1X'], en: ['LAN control protocols', 'Switch control plane: STP/RSTP, LLDP, CDP, LACP and 802.1X'], build: lanControlSample },
  { id: 'wifi-80211', group: 'lan', icon: 'wifi', ko: ['Wi-Fi와 Bluetooth', '모니터 모드 Wi-Fi(비콘, 프로브, 인증, 연결, WPA2 4-way 핸드셰이크)와 Bluetooth LE(스캔, 연결, GATT 탐색, 읽기·쓰기·알림)'], en: ['Wi-Fi and Bluetooth', 'Monitor-mode Wi-Fi (beacons, probing, association, WPA2 4-way handshake) and Bluetooth LE (scan, connection, GATT discovery, reads, writes, notifications)'], build: wifiSample },
  { id: 'tunnels', group: 'lan', icon: 'tunnel', ko: ['터널과 캡슐화', 'GRE, VXLAN, GENEVE, MPLS, PPPoE 세션 설정과 IPsec ESP'], en: ['Tunnels', 'GRE, VXLAN, GENEVE, MPLS, PPPoE session setup and IPsec ESP'], build: tunnelsSample },
];
