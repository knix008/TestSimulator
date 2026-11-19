// QUIC dissection and the pure-JS Initial packet protection. Expected Info strings were checked
// against Wireshark 4.6, which decrypts the Initial packets our builder produces.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createSession, dissect } from '../../src/domain/dissect/index.js';
import * as Q from '../../src/domain/dissect/proto/quic-crypto.js';
import * as B from '../../src/domain/capture/build/tls.js';
import { Capture, udpFrame, rng, hex } from '../../src/domain/capture/synth.js';

const toHex = (b) => Buffer.from(b).toString('hex');

function run(file) {
  const s = createSession(file, { resolve: { mac: false, transport: false } });
  const sums = file.frames.map((f) => s.firstPass(f));
  const ds = file.frames.map((f) => dissect(s, f));
  assert.deepEqual(s.bugs, []);
  return { sums, ds };
}
const vals = (d, a) => (d.fields.get(a) || []).map((n) => n.value);

test('AES-128 and SHA-256 known answers', () => {
  assert.equal(toHex(Q.aesEncrypt(Q.aesKey(hex('000102030405060708090a0b0c0d0e0f')), hex('00112233445566778899aabbccddeeff'))), '69c4e0d86a7b0430d8cdb78070b4c55a');
  assert.equal(toHex(Q.sha256(new TextEncoder().encode('abc'))), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

test('RFC 9001 Appendix A initial keys', () => {
  const dcid = hex('8394c8f03e515708');
  assert.equal(toHex(Q.initialKeys(dcid, 1, false).iv), 'fa044b2f42a3fd3b46fb255c');
  assert.equal(toHex(Q.initialKeys(dcid, 1, true).iv), '0ac1493ca1905853b0bba03e');
  // QUIC v2 uses its own salt and labels (decryption is checked end-to-end below; Wireshark 4.6 decrypts it).
  assert.notEqual(toHex(Q.initialKeys(dcid, 0x6b3343cf, false).iv), 'fa044b2f42a3fd3b46fb255c');
});

test('AES-GCM agrees with node:crypto and rejects a bad tag', () => {
  const r = rng(5);
  for (const n of [0, 1, 15, 16, 17, 100]) {
    const key = r.bytes(16), iv = r.bytes(12), aad = r.bytes(23), pt = r.bytes(n);
    const c = crypto.createCipheriv('aes-128-gcm', key, iv); c.setAAD(aad);
    const ref = Buffer.concat([c.update(pt), c.final(), c.getAuthTag()]);
    const mine = Q.gcmSeal(Q.aesKey(key), iv, aad, pt);
    assert.equal(toHex(mine), ref.toString('hex'));
    assert.equal(toHex(Q.gcmOpen(Q.aesKey(key), iv, aad, mine)), toHex(pt));
    mine[mine.length - 1] ^= 1;
    assert.equal(Q.gcmOpen(Q.aesKey(key), iv, aad, mine), null);
  }
});

test('QUIC sample: decrypted Initials, coalesced packets, short headers', () => {
  const { sums, ds } = run(B.samples.find((s) => s.id === 'quic').build());
  const i1 = ds[0];
  assert.equal(i1.layers.slice(1).join(':'), 'eth:ethertype:ip:udp:quic:tls');
  assert.match(i1.columns.info, /^Initial, DCID=[0-9a-f]{16}, SCID=[0-9a-f]{16}, PKN: 0, CRYPTO, PADDING$/);
  assert.equal(i1.columns.protocol, 'QUIC');
  assert.deepEqual(vals(i1, 'tls.handshake.extensions_server_name'), ['www.youtube.com']);
  assert.match(vals(i1, 'tls.handshake.ja4')[0], /^q13d/);
  assert.equal(vals(i1, 'quic.packet_number')[0], 0n);
  assert.equal(i1.sources.length, 2, 'decrypted payload source');
  assert.equal(sums[0].info, i1.columns.info, 'first pass and dissection agree');
  // server Initial + Handshake in one datagram: two QUIC trees, Info of the last packet
  const co = ds[1];
  assert.equal(co.tree.filter((n) => n.abbrev === 'quic').length, 2);
  assert.equal(co.layers.filter((l) => l === 'quic').length, 1);
  assert.match(co.columns.info, /^Handshake, DCID=/);
  assert.ok(co.fields.has('tls.handshake.ja3s'));
  assert.match(ds[3].columns.info, /PKN: 1, ACK, PADDING$/);
  const sh = ds[5];
  assert.match(sh.columns.info, /^Protected Payload \(KP0\), DCID=[0-9a-f]{16}$/);
  assert.deepEqual(vals(sh, 'quic.connection.number'), [0]);
  assert.ok(sh.expert.some((e) => e.abbrev === 'quic.decryption_failed'));
});

test('version negotiation, QUIC v2, reserved versions and truncation', () => {
  const cap = new Capture();
  const r = rng(4);
  const cl = { srcMac: 'a4:83:e7:12:34:56', dstMac: '00:11:32:aa:bb:cc', src: '192.168.0.10', dst: '203.0.113.9', sport: 50000, dport: 443 };
  const sv = { ...cl, srcMac: cl.dstMac, dstMac: cl.srcMac, src: cl.dst, dst: cl.src, sport: 443, dport: 50000 };
  const dcid = r.bytes(8), scid = r.bytes(5);
  cap.add(udpFrame(cl, B.quicInitial({ version: 0x1a2a3a4a, dcid, scid })));
  cap.add(udpFrame(sv, B.quicVersionNegotiation({ dcid: scid, scid: dcid, versions: [1, 0x6b3343cf] })));
  cap.add(udpFrame(cl, B.quicInitial({ version: 0x6b3343cf, dcid: r.bytes(8), scid: r.bytes(4), frames: B.quicCryptoFrames(B.tlsClientHelloBody({ sni: 'v2.example', versions: [0x0304], rnd: r })) })));
  cap.add(udpFrame(cl, B.quicInitial({ dcid, scid }).subarray(0, 12)));
  const { ds } = run(cap.file());
  assert.match(ds[0].columns.info, /^Forcing Version Negotiation, DCID=/);
  assert.match(ds[1].columns.info, /^Version Negotiation, DCID=/);
  assert.deepEqual(vals(ds[1], 'quic.supported_version'), [1, 0x6b3343cf]);
  assert.match(ds[2].columns.info, /^Initial, .*PKN: 0, CRYPTO, PADDING$/);
  assert.deepEqual(vals(ds[2], 'tls.handshake.extensions_server_name'), ['v2.example']);
  assert.ok(ds[3].expert.some((e) => e.severity === 'error'), 'truncated long header is malformed');
});
