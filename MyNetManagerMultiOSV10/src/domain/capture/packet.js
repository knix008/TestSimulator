// Low-level packet builder: Ethernet/ARP/IPv4/IPv6/ICMP/TCP/UDP with correct checksums, a TCP
// conversation helper with injectable faults and a capture assembler. synth.js re-exports all of it.

// ---------------------------------------------------------------------------------------------
// byte helpers
export function bytes(...parts) {
  let n = 0;
  const arrs = parts.map((p) => (p instanceof Uint8Array ? p : typeof p === 'string' ? te(p) : Array.isArray(p) ? Uint8Array.from(p) : p == null ? new Uint8Array(0) : Uint8Array.of(p)));
  for (const a of arrs) n += a.length;
  const out = new Uint8Array(n);
  let o = 0;
  for (const a of arrs) { out.set(a, o); o += a.length; }
  return out;
}
const TE = new TextEncoder();
export const te = (s) => TE.encode(s);
export const be16 = (v) => Uint8Array.of((v >> 8) & 255, v & 255);
export const be24 = (v) => Uint8Array.of((v >> 16) & 255, (v >> 8) & 255, v & 255);
export const be32 = (v) => Uint8Array.of((v >>> 24) & 255, (v >> 16) & 255, (v >> 8) & 255, v & 255);
export const le16 = (v) => Uint8Array.of(v & 255, (v >> 8) & 255);
export const le32 = (v) => Uint8Array.of(v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255);
export function hex(s) {
  s = s.replace(/[^0-9a-fA-F]/g, '');
  const out = new Uint8Array(s.length >> 1);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.substr(i * 2, 2), 16);
  return out;
}
export function macBytes(m) { return Uint8Array.from(m.split(/[:-]/).map((x) => parseInt(x, 16))); }
export function ip4Bytes(a) { return Uint8Array.from(a.split('.').map(Number)); }
export function ip6Bytes(a) {
  let [head, tail] = a.includes('::') ? a.split('::') : [a, null];
  const conv = (s) => (s ? s.split(':') : []).flatMap((g) => (g.includes('.') ? [...ip4Bytes(g)].reduce((acc, b, i) => { if (i % 2 === 0) acc.push((b << 8) | 0); else acc[acc.length - 1] |= b; return acc; }, []).map((x) => x.toString(16)) : [g]));
  const h = conv(head), t = tail === null ? [] : conv(tail);
  const groups = tail === null ? h : [...h, ...Array(8 - h.length - t.length).fill('0'), ...t];
  const out = new Uint8Array(16);
  groups.forEach((g, i) => { const v = parseInt(g || '0', 16); out[2 * i] = v >> 8; out[2 * i + 1] = v & 255; });
  return out;
}
export const isV6 = (a) => a.includes(':');

/** Internet checksum (one's complement) over byte arrays. */
export function checksum(...parts) {
  let s = 0, odd = false, carry = 0;
  for (const p of parts) {
    for (let i = 0; i < p.length; i++) {
      if (!odd) carry = p[i] << 8; else s += carry | p[i];
      odd = !odd;
    }
  }
  if (odd) s += carry;
  while (s > 0xffff) s = (s & 0xffff) + Math.floor(s / 65536);
  return (~s) & 0xffff;
}

// ---------------------------------------------------------------------------------------------
// layers
export function ether(src, dst, type, payload) {
  return bytes(macBytes(dst), macBytes(src), be16(type), payload);
}
/** Pad an Ethernet frame to the 60-byte minimum like a NIC does. */
export function pad60(frame) {
  if (frame.length >= 60) return frame;
  const out = new Uint8Array(60); out.set(frame); return out;
}
export function vlanTag(id, type, pri = 0) { return bytes(be16((pri << 13) | (id & 0xfff)), be16(type)); }

let ipId = 0x1c46;
/** Set the next IPv4 identification (DemoTraffic keeps its own sequence per seed). */
export function seedIpId(v) { ipId = v & 0xffff; }
export function ipv4(o, payload) {
  const opts = o.ipOptions ? o.ipOptions : new Uint8Array(0);
  const hl = 20 + opts.length;
  const h = new Uint8Array(hl);
  h[0] = 0x40 | (hl / 4);
  h[1] = o.tos || 0;
  const tl = hl + payload.length;
  h[2] = tl >> 8; h[3] = tl & 255;
  const id = o.id != null ? o.id : (ipId = (ipId + 1) & 0xffff);
  h[4] = id >> 8; h[5] = id & 255;
  const fl = ((o.df === false ? 0 : o.mf ? 0 : 2) << 13) | (o.mf ? 0x2000 : 0) | ((o.fragOffset || 0) >> 3);
  h[6] = fl >> 8; h[7] = fl & 255;
  h[8] = o.ttl != null ? o.ttl : 64;
  h[9] = o.proto;
  h.set(ip4Bytes(o.src), 12); h.set(ip4Bytes(o.dst), 16);
  h.set(opts, 20);
  const c = o.badChecksum ? 0xdead : checksum(h);
  h[10] = c >> 8; h[11] = c & 255;
  return bytes(h, payload);
}
export function ipv6(o, payload) {
  const h = new Uint8Array(40);
  const tc = o.tc || 0, fl = o.flow || 0;
  h[0] = 0x60 | (tc >> 4); h[1] = ((tc & 15) << 4) | ((fl >> 16) & 15); h[2] = (fl >> 8) & 255; h[3] = fl & 255;
  h[4] = payload.length >> 8; h[5] = payload.length & 255;
  h[6] = o.nxt; h[7] = o.hlim != null ? o.hlim : 64;
  h.set(ip6Bytes(o.src), 8); h.set(ip6Bytes(o.dst), 24);
  return bytes(h, payload);
}
function pseudo(src, dst, proto, len) {
  if (isV6(src)) return bytes(ip6Bytes(src), ip6Bytes(dst), be32(len), Uint8Array.of(0, 0, 0, proto));
  return bytes(ip4Bytes(src), ip4Bytes(dst), Uint8Array.of(0, proto), be16(len));
}
export function udp(o, payload) {
  if (!payload) payload = new Uint8Array(0);
  const len = 8 + payload.length;
  const h = bytes(be16(o.sport), be16(o.dport), be16(len), be16(0));
  let c = o.noChecksum ? 0 : checksum(pseudo(o.src, o.dst, 17, len), h, payload);
  if (c === 0 && !o.noChecksum) c = 0xffff;
  h[6] = c >> 8; h[7] = c & 255;
  return bytes(h, payload);
}
export const TCP = { FIN: 1, SYN: 2, RST: 4, PSH: 8, ACK: 16, URG: 32, ECE: 64, CWR: 128 };
/** TCP options: { mss, ws, sackPerm, ts: [val, ecr], sack: [[l, r]...], nops } -> padded bytes. */
export function tcpOptions(o) {
  const parts = [];
  if (o.mss != null) parts.push(Uint8Array.of(2, 4, o.mss >> 8, o.mss & 255));
  if (o.sackPerm && o.ts) parts.push(Uint8Array.of(4, 2, 8, 10), be32(o.ts[0]), be32(o.ts[1]));
  else {
    if (o.sackPerm) parts.push(Uint8Array.of(1, 1, 4, 2));
    if (o.ts) parts.push(Uint8Array.of(1, 1, 8, 10), be32(o.ts[0]), be32(o.ts[1]));
  }
  if (o.sack) { parts.push(Uint8Array.of(1, 1, 5, 2 + 8 * o.sack.length)); for (const [l, r] of o.sack) parts.push(be32(l), be32(r)); }
  if (o.ws != null) parts.push(Uint8Array.of(1, 3, 3, o.ws));
  let b = bytes(...parts);
  while (b.length % 4) b = bytes(b, Uint8Array.of(1));
  return b;
}
export function tcp(o, payload) {
  if (!payload) payload = new Uint8Array(0);
  const opts = o.options ? (o.options instanceof Uint8Array ? o.options : tcpOptions(o.options)) : new Uint8Array(0);
  const hl = 20 + opts.length;
  const h = new Uint8Array(hl);
  h.set(be16(o.sport), 0); h.set(be16(o.dport), 2);
  h.set(be32(o.seq >>> 0), 4); h.set(be32((o.ack || 0) >>> 0), 8);
  h[12] = (hl / 4) << 4; h[13] = o.flags & 255;
  h.set(be16(o.win != null ? o.win : 65535), 14);
  h.set(be16(o.urg || 0), 18);
  h.set(opts, 20);
  const c = checksum(pseudo(o.src, o.dst, 6, hl + payload.length), h, payload);
  h[16] = c >> 8; h[17] = c & 255;
  return bytes(h, payload);
}
export function icmp(type, code, rest, payload = new Uint8Array(0)) {
  const h = bytes(Uint8Array.of(type, code, 0, 0), rest, payload);
  const c = checksum(h);
  h[2] = c >> 8; h[3] = c & 255;
  return h;
}
export function icmpv6(src, dst, type, code, body) {
  const m = bytes(Uint8Array.of(type, code, 0, 0), body);
  const c = checksum(pseudo(src, dst, 58, m.length), m);
  m[2] = c >> 8; m[3] = c & 255;
  return m;
}

/** IP layer for either family. */
export function ip(o, payload) {
  return isV6(o.src) ? ipv6({ ...o, nxt: o.proto, hlim: o.ttl }, payload) : ipv4(o, payload);
}
/** Ethernet + IP + UDP frame. o: { srcMac, dstMac, src, dst, sport, dport, ttl, vlan } */
export function udpFrame(o, payload) {
  const u = udp(o, payload);
  return l2(o, ip({ ...o, proto: 17 }, u));
}
export function tcpFrame(o, payload) {
  const t = tcp(o, payload);
  return l2(o, ip({ ...o, proto: 6 }, t));
}
export function icmpFrame(o, type, code, rest, payload) {
  return l2(o, ipv4({ ...o, proto: 1 }, icmp(type, code, rest, payload)));
}
export function l2(o, ipPacket) {
  const type = ipPacket[0] >> 4 === 6 ? 0x86dd : 0x0800;
  if (o.vlan != null) return pad60(ether(o.srcMac, o.dstMac, 0x8100, bytes(vlanTag(o.vlan, type, o.pri || 0), ipPacket)));
  return pad60(ether(o.srcMac, o.dstMac, type, ipPacket));
}
export function arp(o) {
  const body = bytes(be16(1), be16(0x0800), Uint8Array.of(6, 4), be16(o.op), macBytes(o.srcMac), ip4Bytes(o.srcIp),
    macBytes(o.dstMac || '00:00:00:00:00:00'), ip4Bytes(o.dstIp));
  return pad60(ether(o.srcMac, o.ethDst || (o.op === 1 ? 'ff:ff:ff:ff:ff:ff' : o.dstMac), 0x0806, body));
}

// ---------------------------------------------------------------------------------------------
// Deterministic PRNG (mulberry32) so samples and demo traffic are reproducible from a seed.
export function rng(seed) {
  let a = seed >>> 0;
  const f = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.int = (lo, hi) => lo + Math.floor(f() * (hi - lo + 1));
  f.pick = (arr) => arr[Math.floor(f() * arr.length)];
  f.bytes = (n) => { const b = new Uint8Array(n); for (let i = 0; i < n; i++) b[i] = Math.floor(f() * 256); return b; };
  return f;
}

// ---------------------------------------------------------------------------------------------
/** Collects frames with timestamps and produces a CaptureFile. Time is float seconds (absolute). */
export class Capture {
  constructor(start = 1763452800, opts = {}) {
    ipId = 0x1c46; // every capture starts the IP ID sequence afresh, so builds are reproducible
    this.t = start;
    this.frames = [];
    this.linktype = opts.linktype ?? 1;
    this.ifname = opts.ifname ?? 'eth0';
    this.comment = opts.comment ?? null;
  }
  /** Advance the clock by dt seconds. */
  wait(dt) { this.t += dt; return this; }
  add(data, opts = {}) {
    if (opts.dt) this.t += opts.dt;
    const t = opts.t != null ? opts.t : this.t;
    let sec = Math.floor(t), nsec = Math.round((t - sec) * 1e6) * 1000;
    if (nsec >= 1e9) { sec++; nsec -= 1e9; }
    const len = data.length;
    const caplen = opts.snaplen ? Math.min(opts.snaplen, len) : len;
    this.frames.push({
      no: this.frames.length + 1, sec, nsec, caplen, len, data: caplen < len ? data.slice(0, caplen) : data,
      linktype: opts.linktype ?? this.linktype, iface: 0, comment: opts.comment ?? null,
    });
    return this;
  }
  file(name = 'synthetic.pcapng') {
    const section = { application: 'MyNetManager sample generator' };
    if (this.comment) section.comment = this.comment;
    return {
      format: 'pcapng', name, size: 0,
      interfaces: [{ name: this.ifname, description: '', linktype: this.linktype, snaplen: 262144, tsresol: 6 }],
      frames: this.frames, section, truncated: false, error: null,
    };
  }
}

// ---------------------------------------------------------------------------------------------
/**
 * A TCP connection between two endpoints, emitting correctly sequenced frames into a Capture.
 * ep = { mac, ip, port, isn, win, ws, mss, ts }
 * Fault injection per send(): { lose: true } (not captured), { retransmitAfter: s }, { outOfOrder: true }.
 */
export class TcpConversation {
  constructor(cap, client, server, opts = {}) {
    this.cap = cap;
    this.rtt = opts.rtt ?? 0.02;
    this.mss = opts.mss ?? 1460;
    this.vlan = opts.vlan;
    this.c = { win: 64240, ws: 8, mss: 1460, tsBase: 1000, ...client, seq: client.isn ?? 0x1a2b3c4d, ack: 0 };
    this.s = { win: 65160, ws: 7, mss: 1460, tsBase: 5000, ...server, seq: server.isn ?? 0x5e6f7081, ack: 0 };
    this.useTs = opts.timestamps ?? false;
    this.t0 = cap.t;
  }
  ep(dir) { return dir === 'c' ? [this.c, this.s] : [this.s, this.c]; }
  frame(dir, flags, payload = new Uint8Array(0), extra = {}) {
    const [a, b] = this.ep(dir);
    const o = {
      srcMac: a.mac, dstMac: b.mac, src: a.ip, dst: b.ip, sport: a.port, dport: b.port,
      seq: extra.seq ?? a.seq, ack: flags & TCP.ACK ? (extra.ack ?? a.ack) : 0, flags,
      win: extra.win ?? (flags & TCP.SYN ? a.win : Math.min(65535, Math.floor(a.win / 2 ** (this.scaled ? a.ws : 0)))),
      vlan: this.vlan, ttl: a.ttl,
    };
    let opts = extra.options;
    if (!opts && this.useTs) opts = { ts: [a.tsBase + Math.round((this.cap.t - this.t0) * 1000), b.lastTs || 0] };
    if (opts) o.options = opts;
    if (this.useTs) a.lastTs = a.tsBase + Math.round((this.cap.t - this.t0) * 1000);
    return tcpFrame(o, payload);
  }
  emit(dir, flags, payload, extra = {}) {
    if (extra.dt != null) this.cap.wait(extra.dt);
    if (!extra.lose) this.cap.add(this.frame(dir, flags, payload, extra), { comment: extra.comment });
  }
  handshake() {
    const c = this.c, s = this.s;
    const synOpts = { mss: c.mss, sackPerm: true, ws: c.ws };
    if (this.useTs) synOpts.ts = [c.tsBase, 0];
    this.emit('c', TCP.SYN, null, { options: synOpts });
    c.seq = (c.seq + 1) >>> 0; s.ack = c.seq;
    this.cap.wait(this.rtt / 2);
    const saOpts = { mss: s.mss, sackPerm: true, ws: s.ws };
    if (this.useTs) saOpts.ts = [s.tsBase, c.tsBase];
    this.emit('s', TCP.SYN | TCP.ACK, null, { options: saOpts });
    s.seq = (s.seq + 1) >>> 0; c.ack = s.seq;
    this.cap.wait(this.rtt / 2);
    this.scaled = true;
    this.emit('c', TCP.ACK);
    return this;
  }
  /**
   * Send application bytes from dir ('c'|'s'), segmented by MSS; the peer ACKs (unless noAck).
   * opts: { push, lose: [segmentIndex...], retransmit: true, dupAcks: n, gap, noAck, ackEvery, outOfOrder: [i] }
   */
  send(dir, data, opts = {}) {
    if (typeof data === 'string') data = te(data);
    const [a, b] = this.ep(dir);
    const segs = [];
    for (let o = 0; o < data.length; o += this.mss) segs.push(data.subarray(o, Math.min(o + this.mss, data.length)));
    if (!segs.length) segs.push(new Uint8Array(0));
    const lose = new Set(opts.lose || []);
    const ooo = new Set(opts.outOfOrder || []);
    const sent = [];
    const gap = opts.gap ?? 0.0005;
    let held = null;
    for (let i = 0; i < segs.length; i++) {
      const last = i === segs.length - 1;
      const flags = TCP.ACK | (last && opts.push !== false ? TCP.PSH : 0);
      const seg = { seq: a.seq, data: segs[i], flags };
      sent.push(seg);
      a.seq = (a.seq + segs[i].length) >>> 0;
      if (i) this.cap.wait(gap);
      if (lose.has(i)) continue;
      if (ooo.has(i)) { held = seg; continue; }
      this.emit(dir, flags, seg.data, { seq: seg.seq });
      if (held) { this.cap.wait(0.0002); this.emit(dir, held.flags, held.data, { seq: held.seq }); held = null; }
    }
    if (opts.noAck) return sent;
    this.cap.wait(this.rtt / 2);
    if (lose.size) {
      // Receiver ACKs up to the first hole, repeated for every later segment (dup ACKs), then the sender retransmits.
      const first = Math.min(...lose);
      const holeSeq = sent[first].seq;
      const dups = opts.dupAcks ?? (segs.length - first - 1);
      this.emit(dir === 'c' ? 's' : 'c', TCP.ACK, null, { ack: holeSeq });
      for (let k = 0; k < dups; k++) { this.cap.wait(0.0002); this.emit(dir === 'c' ? 's' : 'c', TCP.ACK, null, { ack: holeSeq, options: { sack: [[sent[first + 1]?.seq ?? holeSeq, a.seq]] } }); }
      this.cap.wait(opts.retransmitDelay ?? (dups >= 2 ? 0.001 : 0.3));
      for (const i of [...lose].sort((x, y) => x - y)) this.emit(dir, sent[i].flags, sent[i].data, { seq: sent[i].seq });
      this.cap.wait(this.rtt / 2);
    }
    b.ack = a.seq;
    this.emit(dir === 'c' ? 's' : 'c', TCP.ACK);
    if (opts.retransmit) {
      // spurious: resend the last segment after it was already acknowledged
      this.cap.wait(0.2);
      const s = sent[sent.length - 1];
      this.emit(dir, s.flags, s.data, { seq: s.seq });
    }
    return sent;
  }
  /** Send without waiting for an ACK (the caller ACKs later with ack()). */
  push(dir, data, opts = {}) { return this.send(dir, data, { ...opts, noAck: true }); }
  ack(dir, extra = {}) {
    const [a, b] = this.ep(dir);
    a.ack = b.seq;
    this.emit(dir, TCP.ACK, null, extra);
  }
  /** Retransmit an earlier segment (as returned by send/push). */
  resend(dir, seg, extra = {}) { this.emit(dir, seg.flags, seg.data, { seq: seg.seq, ...extra }); }
  close(initiator = 'c') {
    const [a, b] = this.ep(initiator);
    const other = initiator === 'c' ? 's' : 'c';
    a.ack = b.seq;
    this.emit(initiator, TCP.FIN | TCP.ACK);
    a.seq = (a.seq + 1) >>> 0; b.ack = a.seq;
    this.cap.wait(this.rtt / 2);
    this.emit(other, TCP.FIN | TCP.ACK);
    b.seq = (b.seq + 1) >>> 0; a.ack = b.seq;
    this.cap.wait(this.rtt / 2);
    this.emit(initiator, TCP.ACK);
    return this;
  }
  reset(dir = 's') {
    const [a, b] = this.ep(dir);
    a.ack = b.seq;
    this.emit(dir, TCP.RST | TCP.ACK);
  }
  /** Set the advertised window of an endpoint (bytes, before scaling). */
  setWindow(dir, win) { this.ep(dir)[0].win = win; }
}
