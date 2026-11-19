// Packet builder re-exports and DemoTraffic: realistic mixed traffic of a small office LAN
// (192.168.0.0/24), deterministic from a seed. Low-level builders live in packet.js so the
// payload builders in build/*.js can use them without an import cycle.
export * from './packet.js';
import {
  Capture, TcpConversation, udpFrame, icmpFrame, arp, bytes, be16, be32, le32, te, rng, seedIpId,
} from './packet.js';
import { dnsQuery, dnsResponse, mdnsMessage, dhcpMessage, DHCP, dhcpOpt, ntpPacket } from './build/names.js';
import { httpRequest, httpResponse, ssdpSearch, ssdpNotify } from './build/web.js';
import {
  tlsClientHello, tlsServerHello, tlsChangeCipherSpec, tlsEncryptedHandshake, tlsAppData, quicInitial, quicLong, quicShort,
} from './build/tls.js';

const ROUTER = { mac: '00:1a:a0:01:02:03', ip: '192.168.0.1', name: 'router' };
const HOSTS = [
  { mac: 'a4:83:e7:12:34:56', ip: '192.168.0.23', name: 'macbook' },
  { mac: '3c:22:fb:4e:91:07', ip: '192.168.0.31', name: 'imac' },
  { mac: '00:1b:21:3a:4f:10', ip: '192.168.0.42', name: 'desktop-pc' },
  { mac: 'f4:f5:d8:21:7e:9a', ip: '192.168.0.57', name: 'chromecast' },
  { mac: 'b8:27:eb:44:12:0c', ip: '192.168.0.64', name: 'raspberrypi' },
  { mac: '00:11:32:5a:0c:21', ip: '192.168.0.10', name: 'nas' },
];
const SITES = [
  ['www.example.com', '93.184.215.14'], ['api.github.com', '140.82.112.6'], ['www.wikipedia.org', '185.15.59.224'],
  ['news.ycombinator.com', '209.216.230.207'], ['cdn.jsdelivr.net', '151.101.1.229'], ['www.google.com', '142.250.196.100'],
  ['update.microsoft.com', '20.72.235.82'], ['www.naver.com', '223.130.200.104'], ['fonts.gstatic.com', '142.250.207.99'],
];
const PLAIN = [['neverssl.com', '34.223.124.45'], ['example.org', '93.184.215.15'], ['httpforever.com', '146.190.62.39']];
const DNS_SERVER = ROUTER.ip;

/**
 * Live demo traffic. next(now) returns the packets whose time fell into (last call, now].
 * Packets are built ahead in small scenarios (DNS + TLS session, ping, ARP, DHCP ...) and merged in time order.
 */
export class DemoTraffic {
  constructor({ seed = 1, rate = 40 } = {}) {
    this.r = rng(seed >>> 0 || 1);
    this.rate = Math.max(1, rate);
    this.queue = [];          // [{ t, data }], kept sorted by t
    this.t = null;            // time of the last next() call
    this.nextStart = 0;       // time the next scenario starts
    this.port = 49152 + this.r.int(0, 8000);
    this.ipId = this.r.int(1, 0xfff0);
    this.dnsId = this.r.int(1, 0xfff0);
  }

  next(now) {
    if (this.t === null) {
      this.t = now;
      this.nextStart = now + 0.05;
      return [];
    }
    if (now < this.t) now = this.t;
    // Do not try to catch up on long pauses (e.g. a suspended tab): keep at most 10 s.
    if (now - this.t > 10) { this.t = now - 10; this.nextStart = Math.max(this.nextStart, this.t); }
    while (this.nextStart <= now) {
      const n = this.scenario(this.nextStart);
      // inter-arrival so that the average packet rate is about `rate`
      const mean = n / this.rate;
      this.nextStart += -Math.log(1 - this.r()) * mean;
    }
    const out = [];
    let i = 0;
    while (i < this.queue.length && this.queue[i].t <= now) {
      const { t, data } = this.queue[i++];
      if (t <= this.t) continue;
      let sec = Math.floor(t), nsec = Math.round((t - sec) * 1e6) * 1000;
      if (nsec >= 1e9) { sec++; nsec -= 1e9; }
      out.push({ sec, nsec, caplen: data.length, len: data.length, data, linktype: 1 });
    }
    this.queue.splice(0, i);
    this.t = now;
    return out;
  }

  /** Builds one scenario starting at t; returns how many packets it queued. */
  scenario(t) {
    const r = this.r;
    const x = r();
    const before = this.queue.length;
    if (x < 0.36) this.httpsSession(t);
    else if (x < 0.46) this.httpSession(t);
    else if (x < 0.56) this.quicSession(t);
    else if (x < 0.66) this.dnsOnly(t);
    else if (x < 0.73) this.arpExchange(t);
    else if (x < 0.80) this.ping(t);
    else if (x < 0.86) this.mdns(t);
    else if (x < 0.91) this.ssdp(t);
    else if (x < 0.96) this.ntp(t);
    else this.dhcp(t);
    return Math.max(1, this.queue.length - before);
  }

  // ---- helpers
  host() { return this.r.pick(HOSTS.slice(0, 5)); }
  ephemeral() { this.port = this.port >= 65000 ? 49152 : this.port + 1 + this.r.int(0, 3); return this.port; }
  push(t, data) {
    const q = this.queue;
    let i = q.length;
    while (i > 0 && q[i - 1].t > t) i--;
    q.splice(i, 0, { t, data });
  }
  /** Move a Capture's frames into the queue. */
  merge(cap) { for (const f of cap.frames) this.push(f.sec + f.nsec / 1e9, f.data); }
  cap(t) {
    const c = new Capture(t);
    this.ipId = (this.ipId + this.r.int(1, 40)) & 0xffff;
    seedIpId(this.ipId);
    return c;
  }
  udp(cap, a, b, sport, dport, payload, o = {}) {
    cap.add(udpFrame({ srcMac: o.srcMac || a.mac, dstMac: o.dstMac || b.mac, src: a.ip, dst: b.ip, sport, dport, ttl: o.ttl }, payload), { dt: o.dt });
  }
  dns(cap, h, name, ip, opts = {}) {
    const id = this.dnsId = (this.dnsId + this.r.int(1, 900)) & 0xffff;
    const sp = this.ephemeral();
    const gw = { ...ROUTER, ip: DNS_SERVER };
    this.udp(cap, h, gw, sp, 53, dnsQuery({ id, name, type: 'A' }));
    const rtt = 0.004 + this.r() * 0.03;
    const answers = opts.cname ? [{ type: 'CNAME', ttl: 300, data: opts.cname }, { name: opts.cname, type: 'A', ttl: 60, data: ip }] : [{ type: 'A', ttl: 60 + this.r.int(0, 3000), data: ip }];
    this.udp(cap, gw, h, 53, sp, dnsResponse({ id, name, type: 'A', answers }), { dt: rtt });
    if (this.r() < 0.5) {
      const id6 = (id + 1) & 0xffff;
      this.udp(cap, h, gw, sp, 53, dnsQuery({ id: id6, name, type: 'AAAA' }), { dt: 0.0003 });
      this.udp(cap, gw, h, 53, sp, dnsResponse({ id: id6, name, type: 'AAAA', answers: [] }), { dt: rtt });
    }
  }

  // ---- scenarios
  httpsSession(t) {
    const r = this.r;
    const h = this.host();
    const [name, ip] = r.pick(SITES);
    const cap = this.cap(t);
    this.dns(cap, h, name, ip);
    cap.wait(0.001);
    const rtt = 0.008 + r() * 0.06;
    const c = new TcpConversation(cap, { mac: h.mac, ip: h.ip, port: this.ephemeral(), isn: r.int(0, 0x7fffffff) },
      { mac: ROUTER.mac, ip, port: 443, isn: r.int(0, 0x7fffffff) }, { rtt });
    c.handshake();
    cap.wait(0.0005);
    const rnd = rng(r.int(1, 1e9));
    const tls13 = r() < 0.75;
    c.send('c', tlsClientHello({ sni: name, alpn: ['h2', 'http/1.1'], rnd }));
    cap.wait(0.002);
    const sh = tlsServerHello({ version: tls13 ? 0x0304 : 0x0303, cipher: tls13 ? 0x1301 : 0xc02f, keyShareGroup: 29, rnd });
    c.send('s', bytes(sh, tlsChangeCipherSpec(), tlsEncryptedHandshake(2800 + r.int(0, 1500), rnd)));
    cap.wait(0.003);
    c.send('c', bytes(tlsChangeCipherSpec(), tlsEncryptedHandshake(53, rnd), tlsAppData(200 + r.int(0, 300), rnd)));
    const rounds = r.int(1, 4);
    for (let i = 0; i < rounds; i++) {
      cap.wait(0.002 + r() * 0.02);
      const big = r.int(300, 30000);
      const lose = big > 6000 && r() < 0.15 ? [1] : [];
      c.send('s', appData(big, rnd), { lose, dupAcks: lose.length ? 3 : 0 });
      if (i + 1 < rounds) { cap.wait(0.05 + r() * 0.3); c.send('c', tlsAppData(r.int(100, 600), rnd)); }
    }
    cap.wait(0.2 + r() * 2);
    if (r() < 0.8) { c.send('c', bytes(tlsAppData(19, rnd))); cap.wait(0.001); c.close('c'); }
    this.merge(cap);
  }

  httpSession(t) {
    const r = this.r;
    const h = this.host();
    const [name, ip] = r.pick(PLAIN);
    const cap = this.cap(t);
    this.dns(cap, h, name, ip);
    cap.wait(0.001);
    const c = new TcpConversation(cap, { mac: h.mac, ip: h.ip, port: this.ephemeral(), isn: r.int(0, 0x7fffffff) },
      { mac: ROUTER.mac, ip, port: 80, isn: r.int(0, 0x7fffffff) }, { rtt: 0.02 + r() * 0.05 });
    c.handshake();
    const pages = [['/', 'text/html'], ['/style.css', 'text/css'], ['/logo.png', 'image/png'], ['/api/status', 'application/json']];
    const n = r.int(1, 3);
    for (let i = 0; i < n; i++) {
      const [path, type] = pages[i % pages.length];
      cap.wait(0.002);
      c.send('c', httpRequest({ method: 'GET', host: name, path, headers: [['User-Agent', 'Mozilla/5.0 (X11; Linux x86_64)'], ['Accept', '*/*'], ['Connection', 'keep-alive']] }));
      cap.wait(0.01);
      let body;
      if (type === 'application/json') body = te(JSON.stringify({ status: 'ok', uptime: r.int(1000, 99999), host: name }));
      else if (type === 'image/png') body = png(rng(r.int(1, 1e9)), r.int(200, 2000));
      else body = te(`<!doctype html>\n<html><head><title>${name}</title></head><body>${'<p>Lorem ipsum dolor sit amet.</p>\n'.repeat(r.int(5, 120))}</body></html>\n`);
      c.send('s', httpResponse({ code: 200, headers: [['Content-Type', type], ['Server', 'nginx']], body }));
    }
    cap.wait(1 + r() * 3);
    c.close('s');
    this.merge(cap);
  }

  quicSession(t) {
    const r = this.r;
    const h = this.host();
    const [name, ip] = r.pick(SITES.filter((s) => /google|gstatic|naver/.test(s[0])));
    const cap = this.cap(t);
    this.dns(cap, h, name, ip);
    const rnd = rng(r.int(1, 1e9));
    const dcid = rnd.bytes(8), scid = rnd.bytes(8), sdcid = rnd.bytes(8);
    const sp = this.ephemeral();
    const srv = { mac: ROUTER.mac, ip };
    this.udp(cap, h, srv, sp, 443, quicInitial({ dcid, scid, pn: 0 }), { dstMac: ROUTER.mac, dt: 0.001 });
    const rtt = 0.01 + r() * 0.04;
    this.udp(cap, srv, h, 443, sp, bytes(quicLong({ type: 0, dcid: scid, scid: sdcid, payloadLen: 180, rnd }), quicLong({ type: 2, dcid: scid, scid: sdcid, payloadLen: 900, rnd })), { srcMac: ROUTER.mac, dt: rtt });
    this.udp(cap, h, srv, sp, 443, quicLong({ type: 2, dcid: sdcid, scid, payloadLen: 80, rnd }), { dstMac: ROUTER.mac, dt: 0.001 });
    const n = r.int(4, 16);
    for (let i = 0; i < n; i++) {
      if (r() < 0.6) this.udp(cap, srv, h, 443, sp, quicShort({ dcid: scid, len: r.int(40, 1200), rnd }), { srcMac: ROUTER.mac, dt: 0.001 + r() * 0.02 });
      else this.udp(cap, h, srv, sp, 443, quicShort({ dcid: sdcid, len: r.int(30, 120), rnd }), { dstMac: ROUTER.mac, dt: 0.001 + r() * 0.02 });
    }
    this.merge(cap);
  }

  dnsOnly(t) {
    const cap = this.cap(t);
    const [name, ip] = this.r.pick(SITES);
    this.dns(cap, this.host(), name, ip, this.r() < 0.3 ? { cname: 'edge-' + name } : {});
    this.merge(cap);
  }

  arpExchange(t) {
    const cap = this.cap(t);
    const r = this.r;
    const a = this.host();
    const b = r() < 0.6 ? ROUTER : r.pick(HOSTS);
    if (a === b) return;
    cap.add(arp({ op: 1, srcMac: a.mac, srcIp: a.ip, dstIp: b.ip }));
    cap.add(arp({ op: 2, srcMac: b.mac, srcIp: b.ip, dstMac: a.mac, dstIp: a.ip }), { dt: 0.0004 + r() * 0.002 });
    this.merge(cap);
  }

  ping(t) {
    const cap = this.cap(t);
    const r = this.r;
    const h = this.host();
    const dst = r() < 0.5 ? { ip: '8.8.8.8', ttl: 117 } : { ip: ROUTER.ip, ttl: 64 };
    const id = r.int(1, 0xffff);
    const count = r.int(2, 5);
    for (let s = 1; s <= count; s++) {
      if (s > 1) cap.wait(1);
      const sec = Math.floor(cap.t), usec = Math.floor((cap.t - sec) * 1e6);
      const payload = bytes(le32(sec), le32(0), le32(usec), le32(0), te('0123456789abcdefghijklmnopqrstuvwxyz!"#$%&\'()*+,-./0123456'.slice(0, 40)));
      cap.add(icmpFrame({ srcMac: h.mac, dstMac: ROUTER.mac, src: h.ip, dst: dst.ip }, 8, 0, bytes(be16(id), be16(s)), payload));
      if (r() < 0.95) {
        cap.wait(dst.ip === ROUTER.ip ? 0.0008 : 0.02 + r() * 0.01);
        cap.add(icmpFrame({ srcMac: ROUTER.mac, dstMac: h.mac, src: dst.ip, dst: h.ip, ttl: dst.ttl }, 0, 0, bytes(be16(id), be16(s)), payload));
      }
    }
    this.merge(cap);
  }

  mdns(t) {
    const cap = this.cap(t);
    const r = this.r;
    const h = r.pick(HOSTS);
    const grp = { mac: '01:00:5e:00:00:fb', ip: '224.0.0.251' };
    const svc = r.pick(['_googlecast._tcp.local', '_airplay._tcp.local', '_ipp._tcp.local', '_smb._tcp.local', '_raop._tcp.local']);
    this.udp(cap, h, grp, 5353, 5353, mdnsMessage({ qd: [{ name: svc, type: 'PTR' }] }), { ttl: 255 });
    const dev = HOSTS[3];
    const inst = `Living Room.${svc}`;
    this.udp(cap, dev, grp, 5353, 5353, mdnsMessage({
      response: true,
      an: [{ name: svc, type: 'PTR', ttl: 120, data: inst }],
      ar: [{ name: `${dev.name}.local`, type: 'A', ttl: 120, data: dev.ip, flush: true }],
    }), { ttl: 255, dt: 0.003 + r() * 0.05 });
    this.merge(cap);
  }

  ssdp(t) {
    const cap = this.cap(t);
    const r = this.r;
    const grp = { mac: '01:00:5e:7f:ff:fa', ip: '239.255.255.250' };
    if (r() < 0.5) this.udp(cap, this.host(), grp, this.ephemeral(), 1900, ssdpSearch({ st: 'urn:dial-multiscreen-org:service:dial:1' }), { ttl: 4 });
    else for (const nt of ['upnp:rootdevice', 'urn:schemas-upnp-org:device:InternetGatewayDevice:1']) {
      this.udp(cap, ROUTER, grp, 1900, 1900, ssdpNotify({ nt, usn: `uuid:2f402f80-da50-11e1-9b23-001788000001::${nt}` }), { ttl: 4, dt: 0.0005 });
    }
    this.merge(cap);
  }

  ntp(t) {
    const cap = this.cap(t);
    const h = this.host();
    const srv = { mac: ROUTER.mac, ip: this.r.pick(['216.239.35.0', '162.159.200.1', '203.248.240.140']) };
    const sp = this.ephemeral();
    this.udp(cap, h, srv, sp, 123, ntpPacket({ mode: 3, xmt: t }), { dstMac: ROUTER.mac });
    const rtt = 0.02 + this.r() * 0.02;
    this.udp(cap, srv, h, 123, sp, ntpPacket({ mode: 4, stratum: 1, refid: 'GOOG', ref: t - 20, org: t, rec: t + rtt / 2, xmt: t + rtt / 2 + 0.00001, precision: -23 }), { srcMac: ROUTER.mac, dt: rtt });
    this.merge(cap);
  }

  dhcp(t) {
    const cap = this.cap(t);
    const r = this.r;
    const h = HOSTS[r.int(0, 4)];
    const xid = r.int(1, 0x7fffffff);
    const bc = { mac: 'ff:ff:ff:ff:ff:ff', ip: '255.255.255.255' };
    const zero = { mac: h.mac, ip: '0.0.0.0' };
    const common = [dhcpOpt.ip(1, '255.255.255.0'), dhcpOpt.ip(3, ROUTER.ip), dhcpOpt.ip(6, ROUTER.ip), dhcpOpt.u32(51, 86400), dhcpOpt.ip(54, ROUTER.ip)];
    const req = [dhcpOpt.raw(55, Uint8Array.of(1, 3, 6, 15, 119, 252)), dhcpOpt.str(12, h.name)];
    this.udp(cap, zero, bc, 68, 67, dhcpMessage({ msgType: DHCP.DISCOVER, xid, mac: h.mac, options: req }));
    this.udp(cap, ROUTER, { mac: h.mac, ip: h.ip }, 67, 68, dhcpMessage({ msgType: DHCP.OFFER, xid, mac: h.mac, yiaddr: h.ip, siaddr: ROUTER.ip, options: common }), { dt: 0.002 });
    this.udp(cap, zero, bc, 68, 67, dhcpMessage({ msgType: DHCP.REQUEST, xid, mac: h.mac, options: [dhcpOpt.ip(50, h.ip), dhcpOpt.ip(54, ROUTER.ip), ...req] }), { dt: 0.001 });
    this.udp(cap, ROUTER, { mac: h.mac, ip: h.ip }, 67, 68, dhcpMessage({ msgType: DHCP.ACK, xid, mac: h.mac, yiaddr: h.ip, siaddr: ROUTER.ip, options: common }), { dt: 0.002 });
    // The new address is announced with a gratuitous ARP.
    cap.add(arp({ op: 1, srcMac: h.mac, srcIp: h.ip, dstIp: h.ip }), { dt: 0.01 });
    this.merge(cap);
  }
}

/** Structurally valid PNG: signature, IHDR, one IDAT of random bytes, IEND. */
function png(r, n) {
  const chunk = (type, data) => bytes(be32(data.length), te(type), data, be32(0));
  return bytes(Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a), chunk('IHDR', bytes(be32(32), be32(32), Uint8Array.of(8, 6, 0, 0, 0))), chunk('IDAT', r.bytes(n)), chunk('IEND', new Uint8Array(0)));
}

/** Application data split into records of at most 16 KiB, as TLS stacks send it. */
function appData(n, rnd) {
  const parts = [];
  for (; n > 0; n -= 16384) parts.push(tlsAppData(Math.min(n, 16384), rnd));
  return bytes(...parts);
}

/** Run DemoTraffic for `seconds` and return a CaptureFile (used by the "Mixed office LAN" sample). */
export function demoCapture({ seed = 7, rate = 40, seconds = 30, start = 1763454000 } = {}) {
  const demo = new DemoTraffic({ seed, rate });
  demo.next(start);
  const frames = [];
  for (let t = start + 0.1; t <= start + seconds + 1e-9; t += 0.1) {
    for (const f of demo.next(t)) frames.push({ no: frames.length + 1, ...f, iface: 0, comment: null });
  }
  return {
    format: 'pcapng', name: 'mixed-office-lan.pcapng', size: 0,
    interfaces: [{ name: 'eth0', description: 'Office LAN', linktype: 1, snaplen: 262144, tsresol: 6 }],
    frames, section: { application: 'MyNetManager sample generator' }, truncated: false, error: null,
  };
}
