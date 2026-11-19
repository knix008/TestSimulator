// Capture files (pcap / pcapng), the packet builder, DemoTraffic and SAMPLES.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readCapture, readCaptureAsync, writePcap, writePcapng, detectFormat } from '../../src/domain/capture/pcap.js';
import { Capture, TcpConversation, udpFrame, arp, checksum, ip6Bytes, DemoTraffic, demoCapture } from '../../src/domain/capture/synth.js';
import { SAMPLES, SAMPLE_GROUPS } from '../../src/domain/capture/samples.js';
import { createSession, dissect } from '../../src/domain/dissect/index.js';

function sampleFile() {
  const cap = new Capture(1700000000.5);
  cap.add(arp({ op: 1, srcMac: '00:11:22:33:44:55', srcIp: '10.0.0.1', dstIp: '10.0.0.2' }), { comment: 'first' });
  cap.add(udpFrame({ srcMac: '00:11:22:33:44:55', dstMac: '66:77:88:99:aa:bb', src: '10.0.0.1', dst: '10.0.0.2', sport: 1234, dport: 9999 }, new Uint8Array(100)), { dt: 0.000123 });
  return cap.file('t.pcapng');
}

/** Hand-written pcap header + records in the given byte order / resolution. */
function rawPcap({ le = true, ns = false, frames }) {
  const parts = [];
  const hdr = new DataView(new ArrayBuffer(24));
  hdr.setUint32(0, ns ? 0xa1b23c4d : 0xa1b2c3d4, le);
  hdr.setUint16(4, 2, le); hdr.setUint16(6, 4, le);
  hdr.setUint32(16, 65535, le); hdr.setUint32(20, 1, le);
  parts.push(new Uint8Array(hdr.buffer));
  for (const f of frames) {
    const r = new DataView(new ArrayBuffer(16));
    r.setUint32(0, f.sec, le); r.setUint32(4, f.frac, le); r.setUint32(8, f.data.length, le); r.setUint32(12, f.len ?? f.data.length, le);
    parts.push(new Uint8Array(r.buffer), f.data);
  }
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

test('pcap: all four magic variants are read with correct timestamps', () => {
  const data = new Uint8Array(60);
  for (const le of [true, false]) {
    for (const ns of [false, true]) {
      const f = readCapture(rawPcap({ le, ns, frames: [{ sec: 1700000000, frac: ns ? 123456789 : 123456, data }] }));
      assert.equal(f.format, 'pcap');
      assert.equal(f.frames.length, 1);
      assert.equal(f.frames[0].sec, 1700000000);
      assert.equal(f.frames[0].nsec, ns ? 123456789 : 123456000);
      assert.equal(f.interfaces[0].tsresol, ns ? 9 : 6);
      assert.equal(f.byteOrder, le ? 'little' : 'big');
    }
  }
});

test('pcap: round trip keeps frames and times; detectFormat', () => {
  const f = sampleFile();
  const b = writePcap(f);
  assert.equal(detectFormat(b), 'pcap');
  const g = readCapture(b);
  assert.equal(g.frames.length, 2);
  assert.deepEqual(Array.from(g.frames[1].data), Array.from(f.frames[1].data));
  assert.equal(g.frames[1].nsec, f.frames[1].nsec);
  assert.equal(detectFormat(new Uint8Array([1, 2, 3, 4])), null);
});

test('pcapng: round trip keeps comments, interfaces, section and flags', () => {
  const f = sampleFile();
  f.section.comment = 'section note';
  f.frames[1].flags = 2;
  f.interfaces[0].description = 'Office LAN';
  const b = writePcapng(f);
  assert.equal(detectFormat(b), 'pcapng');
  const g = readCapture(b, 'x.pcapng');
  assert.equal(g.format, 'pcapng');
  assert.equal(g.section.comment, 'section note');
  assert.equal(g.interfaces[0].name, 'eth0');
  assert.equal(g.interfaces[0].description, 'Office LAN');
  assert.equal(g.frames[0].comment, 'first');
  assert.equal(g.frames[1].flags, 2);
  assert.equal(g.frames[1].sec * 1e9 + g.frames[1].nsec, f.frames[1].sec * 1e9 + f.frames[1].nsec);
});

test('pcapng: big endian, power-of-two tsresol, SPB, obsolete PB, NRB, ISB, unknown blocks, second section', () => {
  // Build a big-endian file by hand.
  const blocks = [];
  const be = (n, v) => { const b = new Uint8Array(n); for (let i = 0; i < n; i++) b[n - 1 - i] = Number((BigInt(v) >> BigInt(8 * i)) & 255n); return b; };
  const pad = (b) => { const o = new Uint8Array((b.length + 3) & ~3); o.set(b); return o; };
  const opt = (code, data) => [be(2, code), be(2, data.length), pad(data)];
  const block = (type, ...body) => {
    const parts = body.flat();
    const len = 12 + parts.reduce((n, p) => n + p.length, 0);
    blocks.push(be(4, type), be(4, len), ...parts, be(4, len));
  };
  const te = (s) => new TextEncoder().encode(s);
  block(0x0a0d0d0a, be(4, 0x1a2b3c4d), be(2, 1), be(2, 0), be(8, -1n & 0xffffffffffffffffn), opt(4, te('handmade')), be(4, 0));
  // IDB: Ethernet, tsresol 2^-10, name, filter, os
  block(1, be(2, 1), be(2, 0), be(4, 1500), opt(2, te('en0')), opt(9, Uint8Array.of(0x8a)), opt(11, Uint8Array.of(0, ...te('tcp'))), opt(12, te('macOS')), be(4, 0));
  const pkt = new Uint8Array(42); pkt[12] = 0x08; pkt[13] = 0x06;
  // EPB at t = 1024 units = 1 s with comment
  block(6, be(4, 0), be(4, 0), be(4, 1024 * 5), be(4, 42), be(4, 42), pad(pkt), opt(1, te('hello')), be(4, 0));
  // unknown block type
  block(0x0bad, be(4, 7));
  // NRB
  block(4, be(2, 1), be(2, 4 + 9), pad(Uint8Array.of(10, 0, 0, 1, ...te('host.lan'), 0)), be(4, 0));
  // SPB
  block(3, be(4, 42), pad(pkt));
  // obsolete PB
  block(2, be(2, 0), be(2, 0), be(4, 0), be(4, 2048), be(4, 42), be(4, 42), pad(pkt));
  // ISB
  block(5, be(4, 0), be(4, 0), be(4, 0), opt(4, be(8, 10)), opt(5, be(8, 1)), be(4, 0));
  // second section (little endian) with its own interface
  const le4 = (v) => Uint8Array.of(v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255);
  const le2 = (v) => Uint8Array.of(v & 255, (v >> 8) & 255);
  blocks.push(be(4, 0x0a0d0d0a), le4(28), le4(0x1a2b3c4d), le2(1), le2(0), new Uint8Array(8).fill(255), le4(28));
  blocks.push(le4(1), le4(20), le2(101), le2(0), le4(0), le4(20));
  const ipPkt = new Uint8Array(20); ipPkt[0] = 0x45; ipPkt[3] = 20;
  blocks.push(le4(6), le4(32 + 20), le4(0), le4(0), le4(7), le4(20), le4(20), ipPkt, le4(32 + 20));
  const total = blocks.reduce((n, b) => n + b.length, 0);
  const all = new Uint8Array(total);
  let o = 0;
  for (const b of blocks) { all.set(b, o); o += b.length; }
  const f = readCapture(all);
  assert.equal(f.byteOrder, 'big');
  assert.equal(f.section.application, 'handmade');
  assert.equal(f.interfaces.length, 2);
  assert.equal(f.interfaces[0].name, 'en0');
  assert.equal(f.interfaces[0].filter, 'tcp');
  assert.equal(f.interfaces[0].os, 'macOS');
  assert.equal(f.frames.length, 4);
  assert.equal(f.frames[0].sec, 5);
  assert.equal(f.frames[0].comment, 'hello');
  assert.equal(f.frames[1].caplen, 42);           // SPB
  assert.equal(f.frames[2].nsec, 0);              // PB: 2048 / 1024 = 2 s
  assert.equal(f.frames[2].sec, 2);
  assert.equal(f.frames[3].linktype, 101);
  assert.equal(f.frames[3].iface, 1);
  assert.equal(f.frames[3].nsec, 7000);
  assert.deepEqual(f.names, [{ addr: '10.0.0.1', names: ['host.lan'] }]);
  assert.equal(f.interfaceStats[0].ifrecv, 10);
  assert.equal(f.truncated, false);
});

test('truncated and corrupt files keep frames read so far', () => {
  const b = writePcapng(sampleFile());
  const cut = readCapture(b.subarray(0, b.length - 10));
  assert.equal(cut.truncated, true);
  assert.equal(cut.frames.length, 1);
  assert.match(cut.error, /cut short|damaged/);
  const p = writePcap(sampleFile());
  const cutp = readCapture(p.subarray(0, p.length - 5));
  assert.equal(cutp.truncated, true);
  assert.equal(cutp.frames.length, 1);
  assert.throws(() => readCapture(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])), /isn't a capture file/);
  assert.throws(() => readCapture(new Uint8Array([0xd4, 0xc3, 0xb2, 0xa1, 2, 0])), /cut short/);
});

test('gzip-compressed capture through readCaptureAsync', async () => {
  const b = writePcapng(sampleFile());
  const gz = new Uint8Array(await new Response(new Blob([b]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
  assert.equal(detectFormat(gz), null);
  const f = await readCaptureAsync(gz, 'x.pcapng.gz');
  assert.equal(f.frames.length, 2);
  assert.equal(f.compressed, 'gzip');
  assert.throws(() => readCapture(gz), /gzip/);
});

test('builder checksums are valid (IPv4 header, UDP, TCP)', () => {
  const fr = udpFrame({ srcMac: '00:11:22:33:44:55', dstMac: '66:77:88:99:aa:bb', src: '10.0.0.1', dst: '10.0.0.2', sport: 1, dport: 2 }, new Uint8Array([1, 2, 3]));
  assert.equal(checksum(fr.subarray(14, 34)), 0);
  const s = createSession(null, { udp: { checksum: true }, ip: { checksum: true } });
  const d = dissect(s, { no: 1, sec: 0, nsec: 0, caplen: fr.length, len: fr.length, data: fr, linktype: 1, iface: 0, comment: null });
  assert.equal(d.fields.get('udp.checksum.status')[0].value, 1);
  assert.equal(d.fields.get('ip.checksum.status')[0].value, 1);
  assert.deepEqual(Array.from(ip6Bytes('2001:db8::1')), [0x20, 0x01, 0x0d, 0xb8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]);
});

test('DemoTraffic: deterministic from the seed, time ordered, about the requested rate', () => {
  const run = (seed) => {
    const demo = new DemoTraffic({ seed, rate: 40 });
    demo.next(1000);
    const out = [];
    for (let t = 1000.1; t <= 1060; t += 0.1) out.push(...demo.next(t));
    return out;
  };
  const a = run(5), b = run(5), c = run(6);
  assert.deepEqual(a.map((f) => f.data.length), b.map((f) => f.data.length));
  assert.notDeepEqual(a.map((f) => f.data.length), c.map((f) => f.data.length));
  for (let i = 1; i < a.length; i++) assert.ok(a[i].sec + a[i].nsec / 1e9 >= a[i - 1].sec + a[i - 1].nsec / 1e9);
  const rate = a.length / 60;
  assert.ok(rate > 15 && rate < 90, `rate ${rate}`);
  for (const f of a) assert.equal(f.linktype, 1);
  // dissects cleanly
  const file = demoCapture({ seed: 9, seconds: 20 });
  const s = createSession(file);
  const kinds = new Set();
  for (const fr of file.frames) for (const l of s.firstPass(fr).layers.split(':')) kinds.add(l);
  for (const p of ['dns', 'tls', 'arp', 'icmp']) assert.ok(kinds.has(p), p);
  assert.equal(s.bugs.length, 0);
});

test('SAMPLES: metadata, unique kebab-case ids, every sample dissects without dissector errors', () => {
  const ids = new Set();
  const groups = new Set(SAMPLE_GROUPS.map((g) => g.id));
  assert.ok(SAMPLES.length >= 20);
  for (const s of SAMPLES) {
    assert.match(s.id, /^[a-z0-9]+(-[a-z0-9]+)*$/);
    assert.ok(!ids.has(s.id), s.id);
    ids.add(s.id);
    assert.ok(groups.has(s.group), s.group);
    assert.ok(s.icon && s.ko[0] && s.ko[1] && s.en[0] && s.en[1], s.id);
    const f = s.build();
    assert.equal(f.name, `${s.id}.pcapng`);
    assert.ok(f.frames.length > 0);
    const back = readCapture(writePcapng(f));
    assert.equal(back.frames.length, f.frames.length);
    const sess = createSession(back);
    for (const fr of back.frames) {
      sess.firstPass(fr);
      const d = dissect(sess, fr);
      assert.ok(!d.fields.has('_ws.malformed'), `${s.id} #${fr.no} malformed: ${d.columns.info}`);
    }
    assert.deepEqual(sess.bugs, [], s.id);
  }
});

test('TcpConversation produces a consistent handshake', () => {
  const cap = new Capture(10);
  const c = new TcpConversation(cap, { mac: '00:00:00:00:00:01', ip: '10.0.0.1', port: 1000 }, { mac: '00:00:00:00:00:02', ip: '10.0.0.2', port: 80 });
  c.handshake();
  c.send('c', 'x');
  c.close();
  const s = createSession(cap.file());
  const infos = cap.frames.map((f) => s.firstPass(f).info);
  assert.match(infos[0], /^1000 → 80 \[SYN\] Seq=0 Win=64240 Len=0 MSS=1460 SACK_PERM WS=256$/);
  assert.match(infos[1], /\[SYN, ACK\] Seq=0 Ack=1/);
  assert.ok(infos.every((i) => !i.startsWith('[TCP')), infos.join('\n'));
});
