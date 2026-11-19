// TLS / DTLS / X.509 dissection. Expected strings were checked against Wireshark 4.6 (tshark -2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSession, dissect } from '../../src/domain/dissect/index.js';
import { md5hex } from '../../src/domain/dissect/proto/tls.js';
import * as B from '../../src/domain/capture/build/tls.js';
import { Capture, TcpConversation, udpFrame, rng, bytes, hex } from '../../src/domain/capture/synth.js';

const C = { mac: 'a4:83:e7:12:34:56', ip: '192.168.0.10' };
const S = { mac: '00:11:32:aa:bb:cc', ip: '203.0.113.9' };

function run(file) {
  const s = createSession(file, { resolve: { mac: false, transport: false } });
  const sums = file.frames.map((f) => s.firstPass(f));
  const ds = file.frames.map((f) => dissect(s, f));
  assert.deepEqual(s.bugs, [], 'no dissector exceptions');
  return { s, sums, ds };
}
const vals = (d, a) => (d.fields.get(a) || []).map((n) => n.value);
const proto = (d) => d.layers.slice(1).join(':');

test('md5 for JA3', () => {
  assert.equal(md5hex(''), 'd41d8cd98f00b204e9800998ecf8427e');
  assert.equal(md5hex('abc'), '900150983cd24fb0d6963f7d28e17f72');
});

test('HTTPS sample: columns, layers and fingerprints match Wireshark', () => {
  const sample = B.samples.find((x) => x.id === 'https-tls-handshake');
  const { sums, ds } = run(sample.build());
  const ch = ds[3];
  assert.equal(proto(ch), 'eth:ethertype:ip:tcp:tls');
  assert.equal(ch.columns.protocol, 'TLSv1.2');
  assert.equal(ch.columns.info, 'Client Hello (SNI=www.example.com)');
  assert.deepEqual(vals(ch, 'tls.handshake.extensions_server_name'), ['www.example.com']);
  assert.equal(vals(ch, 'tls.handshake.ciphersuite').length, 15);
  // Server flight spans two segments: the first is a bare TCP segment, the second carries the PDU.
  assert.equal(ds[5].columns.protocol, 'TCP');
  assert.match(ds[5].columns.info, /\[TCP PDU reassembled in 7\]$/);
  const sh = ds[6];
  assert.equal(sh.columns.info, 'Server Hello, Certificate, Server Key Exchange, Server Hello Done');
  assert.equal(proto(sh), 'eth:ethertype:ip:tcp:tls:x509sat:x509sat:x509sat:x509sat:x509sat:x509sat:x509ce:x509ce:x509sat:x509sat:x509sat:x509sat:x509sat:x509sat:x509ce');
  assert.equal(sums[6].layers, proto(sh), 'first pass computes the same layers');
  assert.deepEqual(vals(sh, 'x509ce.dNSName'), ['www.example.com', 'example.com']);
  assert.deepEqual(vals(sh, 'x509af.utcTime').slice(0, 2), ['2025-01-01 00:00:00 (UTC)', '2026-12-31 00:00:00 (UTC)']);
  assert.ok(sh.sources.length >= 2, 'reassembled data source');
  assert.equal(ds[8].columns.info, 'Client Key Exchange, Change Cipher Spec, Encrypted Handshake Message');
  assert.equal(ds[12].columns.info, 'Application Data');
  assert.deepEqual(vals(ds[12], 'tls.app_data_proto'), ['Hypertext Transfer Protocol']);
  assert.equal(ds[18].columns.info, 'Alert (Level: Warning, Description: Close Notify)');
  // TLS 1.3 connection: the ClientHello is shown with the negotiated version (two-pass view)
  const ch13 = ds[26];
  assert.equal(ch13.columns.protocol, 'TLSv1.3');
  assert.equal(sums[26].protocol, 'TLSv1.2', 'first pass cannot know the server will pick 1.3');
  assert.deepEqual(vals(ch13, 'tls.handshake.ja3'), ['f2cd15bd82dc47b4d7797e6a92f65733']);
  assert.deepEqual(vals(ch13, 'tls.handshake.ja4'), ['t13d1513h2_8daaf6152771_1eb89897b454']);
  assert.ok(ch13.expert.some((e) => e.abbrev === 'tls.handshake.legacy_version'));
  // Server Hello + CCS + start of an application-data record that ends in the next segment
  assert.equal(ds[28].columns.info, 'Server Hello, Change Cipher Spec');
  assert.ok(ds[28].fields.has('tls.segment.data'));
  assert.equal(ds[30].columns.info, 'Application Data');
  assert.deepEqual(vals(ds[28], 'tls.handshake.ja3s'), ['eb1d94daa7e0344597e756a1fb6e7054']);
  assert.equal(ds[54].columns.info, 'Alert (Level: Fatal, Description: Handshake Failure)');
});

function tcpCapture(build, port = 443) {
  const cap = new Capture();
  const t = new TcpConversation(cap, { ...C, port: 50000 }, { ...S, port });
  t.handshake();
  build(t, rng(1));
  return cap.file();
}

test('TLS on a non-standard port is found heuristically', () => {
  const f = tcpCapture((t, r) => t.send('c', B.tlsClientHello({ sni: 'odd.example', rnd: r })), 9443);
  const { ds } = run(f);
  assert.equal(ds[3].columns.info, 'Client Hello (SNI=odd.example)');
});

test('record split over three segments is reassembled once', () => {
  const san = Array.from({ length: 150 }, (_, i) => `host${i}.example`);
  const f = tcpCapture((t, r) => {
    t.send('c', B.tlsClientHello({ sni: 'big.example', rnd: r }));
    t.send('s', bytes(B.tlsServerHello({ rnd: r }), B.tlsCertificate([B.makeCertificate({ seed: 3, san, ec: true })])));
  });
  const { ds } = run(f);
  const tlsFrames = ds.filter((d) => d.layers.includes('tls'));
  const cert = tlsFrames.find((d) => d.columns.info === 'Certificate');
  assert.ok(cert, 'certificate frame');
  assert.equal(vals(cert, 'x509ce.dNSName').length, 150);
  assert.ok(cert.layers.includes('pkixalgs'), 'EC parameters layer');
  assert.ok(vals(cert, 'tcp.segment').length >= 3);
});

test('handshake longer than its record and garbage records', () => {
  const f = tcpCapture((t, r) => {
    t.send('c', B.tlsRecord(22, 0x0303, bytes(Uint8Array.of(16, 0, 1, 0), r.bytes(10))));
    t.send('c', bytes(hex('deadbeef'), r.bytes(20)));
    t.send('c', B.tlsRecord(23, 0x0303, new Uint8Array(0)).subarray(0, 3)); // truncated header only
  });
  const { ds } = run(f);
  const tls = ds.filter((d) => d.layers.includes('tls'));
  assert.equal(tls[0].columns.info, '[Client Key Exchange Fragment]');
  assert.equal(tls[1].columns.info, 'Ignored Unknown Record');
  assert.ok(tls[1].expert.some((e) => e.abbrev === 'tls.ignored_unknown_record'));
});

test('impossible record length is not TLS; truncated ClientHello is malformed', () => {
  const cap = new Capture();
  const t = new TcpConversation(cap, { ...C, port: 50001 }, { ...S, port: 443 });
  t.handshake();
  t.send('c', bytes(Uint8Array.of(22, 3, 3, 0x50, 0x00), new Uint8Array(20)));         // length 20480
  const ch = B.tlsClientHello({ sni: 'x.example', rnd: rng(2) });
  ch[5 + 4 + 34 + 1] = 0xff;                                                           // cipher suites length beyond end
  t.send('c', ch);
  const { ds } = run(cap.file());
  assert.equal(proto(ds[3]), 'eth:ethertype:ip:tcp:data');
  const tls = ds.filter((d) => d.layers.includes('tls'));
  assert.equal(tls.length, 1);
  assert.ok(tls[0].fields.has('_ws.malformed'));
  assert.ok(tls[0].expert.some((e) => e.severity === 'error'));
});

test('DTLS 1.2 handshake over UDP', () => {
  const cap = new Capture();
  const r = rng(9);
  const cl = { srcMac: C.mac, dstMac: S.mac, src: C.ip, dst: S.ip, sport: 50000, dport: 4433 };
  const sv = { srcMac: S.mac, dstMac: C.mac, src: S.ip, dst: C.ip, sport: 4433, dport: 50000 };
  cap.add(udpFrame(cl, B.dtlsRecord(22, 0xfeff, 0, 0, B.dtlsHandshake(B.dtlsClientHelloBody({ sni: 'dtls.example', rnd: r }), 0))));
  cap.add(udpFrame(sv, B.dtlsRecord(22, 0xfeff, 0, 0, B.dtlsHandshake(B.dtlsHelloVerifyRequestBody(r.bytes(20)), 0))));
  cap.add(udpFrame(cl, B.dtlsRecord(23, 0xfefd, 1, 1, r.bytes(100))));
  const { ds } = run(cap.file());
  assert.equal(proto(ds[0]), 'eth:ethertype:ip:udp:dtls');
  assert.equal(ds[0].columns.protocol, 'DTLSv1.0'); // first record version until a ServerHello
  assert.equal(ds[0].columns.info, 'Client Hello (SNI=dtls.example)');
  assert.match(vals(ds[0], 'dtls.handshake.ja4')[0], /^dd2d15/);
  assert.equal(ds[1].columns.info, 'Hello Verify Request');
  assert.equal(vals(ds[1], 'dtls.handshake.cookie_length')[0], 20);
  assert.equal(ds[2].columns.info, 'Application Data');
});

test('HelloRetryRequest is named', () => {
  const f = tcpCapture((t, r) => {
    t.send('c', B.tlsClientHello({ sni: 'h.example', versions: [0x0304], rnd: r }));
    t.send('s', B.tlsRecord(22, 0x0303, B.tlsServerHelloBody({ version: 0x0304, hrr: true, rnd: r })));
  });
  const { ds } = run(f);
  const hrr = ds.find((d) => d.columns.info === 'Hello Retry Request');
  assert.ok(hrr);
  assert.equal(vals(hrr, 'tls.handshake.extensions_key_share_selected_group')[0], 0x001d);
});
