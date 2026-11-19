// SIP / SDP / RTP / RTCP dissection tests (crafted bytes + the sample generator).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSession, dissect } from '../../src/domain/dissect/index.js';
import { Capture, udpFrame, TcpConversation, bytes, be16, be32, te } from '../../src/domain/capture/synth.js';
import { samples, sipMessage, sdpBody, rtpPacket, rtcpSrSdes, rtcpBye } from '../../src/domain/capture/build/voip.js';

const A = { mac: 'a4:83:e7:12:34:56', ip: '192.168.0.21' };
const B = { mac: '00:04:f2:33:44:55', ip: '192.168.0.22' };
const udp = (s, d, sp, dp, p) => udpFrame({ srcMac: s.mac, dstMac: d.mac, src: s.ip, dst: d.ip, sport: sp, dport: dp }, p);

function run(file, prefs) {
  const s = createSession(file, { resolve: { mac: false, transport: false }, ...prefs });
  const sums = file.frames.map((f) => s.firstPass(f));
  return { s, sums, d: (n) => dissect(s, file.frames[n - 1]) };
}
const val = (d, f) => (d.fields.get(f) || []).map((n) => n.value);
const one = (d, f) => val(d, f)[0];

test('SIP request line, headers and Info', () => {
  const cap = new Capture();
  cap.add(udp(A, B, 5060, 5060, sipMessage('INVITE sip:bob@example.com SIP/2.0', [
    ['Via', 'SIP/2.0/UDP 192.168.0.21:5060;branch=z9hG4bK776;rport'], ['Max-Forwards', '70'],
    ['From', '"Alice" <sip:alice@example.com>;tag=1928'], ['To', '<sip:bob@example.com>'], ['Call-ID', 'c1@h'],
    ['CSeq', '314159 INVITE'], ['Contact', '<sip:alice@192.168.0.21:5060>'], ['User-Agent', 'X/1']])));
  const { d, sums } = run(cap.file());
  const x = d(1);
  assert.equal(sums[0].protocol, 'SIP');
  assert.equal(sums[0].info, 'Request: INVITE sip:bob@example.com | ');
  assert.equal(sums[0].layers, 'eth:ethertype:ip:udp:sip');
  assert.equal(one(x, 'sip.Method'), 'INVITE');
  assert.equal(one(x, 'sip.r-uri'), 'sip:bob@example.com');
  assert.equal(one(x, 'sip.r-uri.user'), 'bob');
  assert.equal(one(x, 'sip.Call-ID'), 'c1@h');
  assert.equal(one(x, 'sip.CSeq.seq'), 314159);
  assert.equal(one(x, 'sip.CSeq.method'), 'INVITE');
  assert.equal(one(x, 'sip.Max-Forwards'), 70);
  assert.equal(one(x, 'sip.from.display.info'), '"Alice"');
  assert.equal(one(x, 'sip.from.tag'), '1928');
  assert.equal(one(x, 'sip.Via.branch'), 'z9hG4bK776');
  assert.equal(one(x, 'sip.Via.sent-by.port'), 5060);
  assert.equal(one(x, 'sip.contact.host'), '192.168.0.21');
  assert.equal(one(x, 'sip.User-Agent'), 'X/1');
  assert.equal(one(x, 'sip.resend'), false);
});

test('SIP response pairs with its request; REGISTER bindings in Info', () => {
  const cap = new Capture();
  const h = [['Via', 'SIP/2.0/UDP 192.168.0.21:5060;branch=z9hG4bKr'], ['From', '<sip:a@x>;tag=1'], ['To', '<sip:a@x>'], ['Call-ID', 'r@h'], ['CSeq', '1 REGISTER'], ['Contact', '<sip:a@192.168.0.21>']];
  cap.add(udp(A, B, 5060, 5060, sipMessage('REGISTER sip:x SIP/2.0', h)));
  cap.add(udp(B, A, 5060, 5060, sipMessage('SIP/2.0 200 OK', h)), { dt: 0.025 });
  const { d, sums } = run(cap.file());
  assert.equal(sums[0].info, 'Request: REGISTER sip:x  (1 binding) | ');
  assert.equal(sums[1].info, 'Status: 200 OK (REGISTER)  (1 binding) | ');
  const r = d(2);
  assert.equal(one(r, 'sip.Status-Code'), 200);
  assert.equal(one(r, 'sip.response-request'), 1);
  assert.equal(one(r, 'sip.response-time'), 25);
});

test('SIP compact headers and resend detection', () => {
  const cap = new Capture();
  const m = te('OPTIONS sip:p@x SIP/2.0\r\nv: SIP/2.0/UDP 1.2.3.4:5060;branch=z9hG4bK1\r\nf: <sip:a@x>;tag=9\r\nt: <sip:p@x>\r\ni: o1@h\r\nCSeq: 7 OPTIONS\r\nl: 0\r\n\r\n');
  cap.add(udp(A, B, 5060, 5060, m));
  cap.add(udp(A, B, 5060, 5060, m), { dt: 0.5 });
  const { d } = run(cap.file());
  assert.equal(one(d(1), 'sip.Call-ID'), 'o1@h');
  assert.equal(one(d(1), 'sip.from.tag'), '9');
  assert.equal(one(d(1), 'sip.Content-Length'), 0);
  assert.equal(one(d(2), 'sip.resend'), true);
  assert.equal(one(d(2), 'sip.resend-original'), 1);
});

test('SIP over TCP is framed by Content-Length, also across segments', () => {
  const cap = new Capture();
  const c = new TcpConversation(cap, { ...A, port: 40000 }, { ...B, port: 5060 }, { rtt: 0.002, mss: 60 });
  c.handshake();
  c.send('c', sipMessage('MESSAGE sip:bob@x SIP/2.0', [['Via', 'SIP/2.0/TCP 192.168.0.21:40000;branch=z9hG4bKt'], ['From', '<sip:a@x>;tag=2'], ['To', '<sip:bob@x>'], ['Call-ID', 't@h'], ['CSeq', '1 MESSAGE'], ['Content-Type', 'text/plain']], 'hello over tcp'));
  const { s, sums } = run(cap.file());
  const sipFrames = sums.filter((x) => x.layers.includes('sip'));
  assert.equal(sipFrames.length, 1);
  assert.ok(sipFrames[0].layers.endsWith('sip:data-text-lines'));
  assert.ok(sipFrames[0].info.startsWith('Request: MESSAGE sip:bob@x | '));
  assert.equal(s.bugs.length, 0);
});

test('SIP heuristic finds SIP on a non-standard UDP port', () => {
  const cap = new Capture();
  cap.add(udp(A, B, 5070, 5080, sipMessage('BYE sip:b@x SIP/2.0', [['Call-ID', 'h@h'], ['CSeq', '3 BYE']])));
  const { sums } = run(cap.file());
  assert.equal(sums[0].protocol, 'SIP');
});

test('SDP fields and RTP set up by SDP (offer frame is the setup frame)', () => {
  const cap = new Capture();
  const hdr = (cseq) => [['Via', 'SIP/2.0/UDP 192.168.0.21:5060;branch=z9hG4bKi'], ['From', '<sip:a@x>;tag=1'], ['To', '<sip:b@x>'], ['Call-ID', 'call@h'], ['CSeq', cseq], ['Content-Type', 'application/sdp']];
  cap.add(udp(A, B, 5060, 5060, sipMessage('INVITE sip:b@x SIP/2.0', hdr('1 INVITE'), sdpBody({ ip: A.ip, port: 40000 }))));
  cap.add(udp(B, A, 5060, 5060, sipMessage('SIP/2.0 200 OK', hdr('1 INVITE'), sdpBody({ user: 'b', ip: B.ip, port: 50000 }))), { dt: 0.1 });
  cap.add(udp(A, B, 40000, 50000, rtpPacket({ pt: 0, seq: 100, ts: 8000, ssrc: 0x11223344, marker: true, payload: new Uint8Array(160) })), { dt: 0.02 });
  cap.add(udp(B, A, 50000, 40000, rtpPacket({ pt: 8, seq: 7, ts: 1600, ssrc: 0xaabbccdd, payload: new Uint8Array(160) })), { dt: 0.02 });
  cap.add(udp(A, B, 40001, 50001, rtcpSrSdes({ ssrc: 0x11223344, ntpSec: 3972441600, rtpTs: 8160, packets: 1, octets: 160, cname: 'a@h' })), { dt: 0.02 });
  cap.add(udp(A, B, 40001, 50001, rtcpBye(0x11223344)), { dt: 0.02 });
  const { d, sums } = run(cap.file());
  assert.equal(sums[0].protocol, 'SIP/SDP');
  assert.equal(sums[0].layers, 'eth:ethertype:ip:udp:sip:sdp');
  const inv = d(1);
  assert.equal(one(inv, 'sdp.media.port'), 40000);
  assert.deepEqual(val(inv, 'sdp.media.format').slice(0, 3), ['ITU-T G.711 PCMU', 'ITU-T G.711 PCMA', 'DynamicRTP-Type-101']);
  assert.equal(one(inv, 'sdp.connection_info.address'), A.ip);
  assert.equal(one(inv, 'sdp.owner.username'), 'alice');
  assert.ok(val(inv, 'sdp.mime.type').includes('PCMU'));
  // RTP both ways
  assert.equal(sums[2].protocol, 'RTP');
  assert.equal(sums[2].info, 'PT=ITU-T G.711 PCMU, SSRC=0x11223344, Seq=100, Time=8000, Mark');
  assert.equal(sums[3].info, 'PT=ITU-T G.711 PCMA, SSRC=0xAABBCCDD, Seq=7, Time=1600');
  const r = d(3);
  assert.equal(one(r, 'rtp.setup-frame'), 1);
  assert.equal(one(r, 'rtp.setup-method'), 'SDP');
  assert.equal(one(r, 'rtp.marker'), true);
  assert.equal(one(r, 'rtp.extseq'), 65536 + 100);
  assert.equal(one(r, 'rtp.timestamp_ext'), 4294967296n + 8000n);
  assert.equal(one(d(4), 'rtp.setup-frame'), 1);
  // RTCP compound: one 'rtcp' layer, two packets
  assert.equal(sums[4].layers, 'eth:ethertype:ip:udp:rtcp');
  assert.equal(sums[4].info, 'Sender Report   Source description   ');
  const rc = d(5);
  assert.deepEqual(val(rc, 'rtcp.pt'), [200, 202]);
  assert.equal(one(rc, 'rtcp.sdes.text'), 'a@h');
  assert.equal(one(rc, 'rtcp.length_check'), true);
  assert.equal(sums[5].info, 'Goodbye   ');
});

test('RTP heuristic is off by default; Decode As enables it', () => {
  const cap = new Capture();
  cap.add(udp(A, B, 30000, 30002, rtpPacket({ pt: 0, seq: 1, ts: 1, ssrc: 1, payload: new Uint8Array(20) })));
  assert.equal(run(cap.file()).sums[0].protocol, 'UDP');
  const r = run(cap.file(), { decodeAs: [{ table: 'udp.port', key: 30002, proto: 'rtp' }] });
  assert.equal(r.sums[0].protocol, 'RTP');
});

test('RTP with CSRC, header extension and padding', () => {
  const cap = new Capture();
  const pkt = bytes(Uint8Array.of(0xb1, 0x60), be16(5), be32(99), be32(0xdeadbeef), be32(0x01020304),
    be16(0xbede), be16(1), be32(0x10203040), new Uint8Array([1, 2, 3, 4, 0, 0, 3]));
  cap.add(udp(A, B, 30000, 30002, pkt));
  const { d } = run(cap.file(), { decodeAs: [{ table: 'udp.port', key: 30002, proto: 'rtp' }] });
  const x = d(1);
  assert.equal(one(x, 'rtp.cc'), 1);
  assert.equal(one(x, 'rtp.csrc.item'), 0x01020304);
  assert.equal(one(x, 'rtp.ext.profile'), 0xbede);
  assert.equal(one(x, 'rtp.padding.count'), 3);
  assert.equal(one(x, 'rtp.payload').length, 4);
  assert.equal(one(x, 'rtp.p_type'), 96);
});

test('truncated SIP / RTP do not throw', () => {
  const cap = new Capture();
  cap.add(udp(A, B, 5060, 5060, te('INVITE sip:x SIP/2.0\r\nCall-ID: q')));
  cap.add(udp(A, B, 30000, 30002, Uint8Array.of(0x80, 0, 0, 1)));
  const { s, sums } = run(cap.file(), { decodeAs: [{ table: 'udp.port', key: 30002, proto: 'rtp' }] });
  assert.equal(sums[0].protocol, 'SIP');
  assert.ok(sums[1].info.includes('[Malformed Packet]'));
  assert.equal(s.bugs.length, 0);
});

test('SIP call sample decodes completely', () => {
  const file = samples.find((x) => x.id === 'sip-call-rtp').build();
  const { s, sums } = run(file);
  assert.equal(s.bugs.length, 0);
  const protos = new Set(sums.map((x) => x.protocol));
  for (const p of ['SIP', 'SIP/SDP', 'RTP', 'RTCP']) assert.ok(protos.has(p), p);
  assert.ok(sums.filter((x) => x.protocol === 'RTP').length >= 200);
  assert.ok(!sums.some((x) => x.info.includes('[Malformed Packet]')));
});
