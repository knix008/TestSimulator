// Payload builders and sample captures for VoIP (SIP/SDP/RTP/RTCP), IoT (MQTT, Modbus/TCP, CoAP) and SMB2.
import {
  Capture, TcpConversation, udpFrame, bytes, be16, be32, te, le16, le32, rng,
} from '../packet.js';

const GW = '00:11:32:aa:bb:cc';

// ---------------------------------------------------------------------------------------------
// SIP / SDP / RTP / RTCP
export function sipMessage(startLine, headers, body = '') {
  let s = startLine + '\r\n';
  for (const [k, v] of headers) s += `${k}: ${v}\r\n`;
  s += `Content-Length: ${te(body).length}\r\n\r\n` + body;
  return te(s);
}
export function sdpBody({ user = 'alice', sessId = 1234, ip, port, codecs = [[0, 'PCMU/8000'], [8, 'PCMA/8000'], [101, 'telephone-event/8000']] }) {
  const pts = codecs.map((c) => c[0]).join(' ');
  return 'v=0\r\n' +
    `o=${user} ${sessId} ${sessId} IN IP4 ${ip}\r\n` +
    's=Talk\r\n' +
    `c=IN IP4 ${ip}\r\n` +
    't=0 0\r\n' +
    `m=audio ${port} RTP/AVP ${pts}\r\n` +
    codecs.map(([pt, n]) => `a=rtpmap:${pt} ${n}\r\n`).join('') +
    'a=ptime:20\r\na=sendrecv\r\n';
}
export function rtpPacket({ pt = 0, seq, ts, ssrc, marker = false, payload }) {
  return bytes(Uint8Array.of(0x80, (marker ? 0x80 : 0) | pt), be16(seq & 0xffff), be32(ts >>> 0), be32(ssrc >>> 0), payload);
}
/** RTCP compound: Sender Report + SDES(CNAME). */
export function rtcpSrSdes({ ssrc, ntpSec, ntpFrac = 0, rtpTs, packets, octets, cname }) {
  const sr = bytes(Uint8Array.of(0x80, 200), be16(6), be32(ssrc), be32(ntpSec), be32(ntpFrac), be32(rtpTs), be32(packets), be32(octets));
  const nm = te(cname);
  let item = bytes(be32(ssrc), Uint8Array.of(1, nm.length), nm, Uint8Array.of(0));
  while (item.length % 4) item = bytes(item, Uint8Array.of(0));
  const sdes = bytes(Uint8Array.of(0x81, 202), be16(item.length / 4), item);
  return bytes(sr, sdes);
}
export function rtcpBye(ssrc) { return bytes(Uint8Array.of(0x81, 203), be16(1), be32(ssrc)); }

// ---------------------------------------------------------------------------------------------
// MQTT
function mqttLen(n) {
  const out = [];
  do { let b = n % 128; n = Math.floor(n / 128); if (n) b |= 128; out.push(b); } while (n);
  return Uint8Array.from(out);
}
const mstr = (s) => { const b = te(s); return bytes(be16(b.length), b); };
export function mqttPacket(type, flags, body) { return bytes(Uint8Array.of((type << 4) | flags), mqttLen(body.length), body); }
export const mqtt = {
  connect: (clientId, keepAlive = 60) => mqttPacket(1, 0, bytes(mstr('MQTT'), Uint8Array.of(4, 0x02), be16(keepAlive), mstr(clientId))),
  connack: (rc = 0) => mqttPacket(2, 0, Uint8Array.of(0, rc)),
  publish: (topic, msg, qos = 0, id = 1, retain = false) => mqttPacket(3, (qos << 1) | (retain ? 1 : 0), bytes(mstr(topic), qos ? be16(id) : null, te(msg))),
  puback: (id) => mqttPacket(4, 0, be16(id)),
  subscribe: (id, topic, qos = 1) => mqttPacket(8, 2, bytes(be16(id), mstr(topic), Uint8Array.of(qos))),
  suback: (id, qos = 1) => mqttPacket(9, 0, bytes(be16(id), Uint8Array.of(qos))),
  pingreq: () => mqttPacket(12, 0, new Uint8Array(0)),
  pingresp: () => mqttPacket(13, 0, new Uint8Array(0)),
  disconnect: () => mqttPacket(14, 0, new Uint8Array(0)),
};

// ---------------------------------------------------------------------------------------------
// Modbus/TCP
export function mbap(tid, unit, pdu) { return bytes(be16(tid), be16(0), be16(pdu.length + 1), Uint8Array.of(unit), pdu); }

// ---------------------------------------------------------------------------------------------
// CoAP
export function coapMessage({ type = 0, code, mid, token = new Uint8Array(0), options = [], payload = null }) {
  const parts = [Uint8Array.of(0x40 | (type << 4) | token.length, code), be16(mid), token];
  let last = 0;
  const ext = (v) => (v < 13 ? [v, null] : v < 269 ? [13, Uint8Array.of(v - 13)] : [14, be16(v - 269)]);
  for (const [num, val] of [...options].sort((a, b) => a[0] - b[0])) {
    const v = typeof val === 'string' ? te(val) : val;
    const [dn, de] = ext(num - last), [ln, le] = ext(v.length);
    parts.push(Uint8Array.of((dn << 4) | ln), de, le, v);
    last = num;
  }
  if (payload) parts.push(Uint8Array.of(0xff), typeof payload === 'string' ? te(payload) : payload);
  return bytes(...parts);
}

// ---------------------------------------------------------------------------------------------
// SMB2 over NetBIOS session service
function smb2Header({ cmd, response = false, status = 0, msgId, sessId = 0n, treeId = 0, credit = 1 }) {
  const h = new Uint8Array(64);
  h.set([0xfe, 0x53, 0x4d, 0x42]);
  h.set(le16(64), 4);
  h.set(le16(credit ? 1 : 0), 6);
  h.set(le32(status), 8);
  h.set(le16(cmd), 12);
  h.set(le16(credit), 14);
  h.set(le32(response ? 1 : 0), 16);
  const dv = new DataView(h.buffer);
  dv.setBigUint64(24, BigInt(msgId), true);
  dv.setUint32(36, treeId, true);
  dv.setBigUint64(40, BigInt(sessId), true);
  return h;
}
const utf16 = (s) => { const b = new Uint8Array(s.length * 2); for (let i = 0; i < s.length; i++) { b[2 * i] = s.charCodeAt(i) & 255; b[2 * i + 1] = s.charCodeAt(i) >> 8; } return b; };
export function nbss(payload) { return bytes(Uint8Array.of(0, 0), be16(payload.length), payload); }
export function smb2(hdr, body) { return nbss(bytes(smb2Header(hdr), body)); }
export const smb2Body = {
  negotiateReq: () => bytes(le16(36), le16(2), le16(1), le16(0), le32(0x7f), new Uint8Array(16), le32(0), le16(0), le16(0), le16(0x0202), le16(0x0210)),
  negotiateResp: (guidSeed = 7) => {
    const guid = Uint8Array.from({ length: 16 }, (_, i) => (i * 17 + guidSeed) & 255);
    return bytes(le16(65), le16(1), le16(0x0210), le16(0), guid, le32(0x7), le32(8388608), le32(8388608), le32(8388608),
      new Uint8Array(8), new Uint8Array(8), le16(128), le16(0), le32(0));
  },
  sessionSetupReq: () => bytes(le16(25), Uint8Array.of(0, 1), le32(1), le32(0), le16(88), le16(0), new Uint8Array(8)),
  sessionSetupResp: () => bytes(le16(9), le16(0), le16(72), le16(0)),
  treeConnectReq: (path) => { const p = utf16(path); return bytes(le16(9), le16(0), le16(72), le16(p.length), p); },
  treeConnectResp: () => bytes(le16(16), Uint8Array.of(1, 0), le32(0), le32(0), le32(0x001f01ff)),
  createReq: (name) => {
    const n = utf16(name);
    return bytes(le16(57), Uint8Array.of(0, 0), le32(2), new Uint8Array(8), new Uint8Array(8), le32(0x00120089), le32(0x80),
      le32(7), le32(1), le32(0x40), le16(120), le16(n.length), le32(0), le32(0), n);
  },
  createResp: (fid) => bytes(le16(89), Uint8Array.of(0, 0), le32(1), new Uint8Array(32), new Uint8Array(8), new Uint8Array(8), le32(0x80), le32(0), fid, le32(0), le32(0)),
  readReq: (fid, len) => bytes(le16(49), Uint8Array.of(0x50, 0), le32(len), new Uint8Array(8), fid, le32(1), le32(0), le32(0), le16(0), le16(0), Uint8Array.of(0)),
  readResp: (data) => bytes(le16(17), Uint8Array.of(80, 0), le32(data.length), le32(0), le32(0), data),
  writeReq: (fid, data) => bytes(le16(49), le16(112), le32(data.length), new Uint8Array(8), fid, le32(0), le32(0), le16(0), le16(0), le32(0), data),
  writeResp: (n) => bytes(le16(17), le16(0), le32(n), le32(0), le16(0), le16(0)),
  closeReq: (fid) => bytes(le16(24), le16(0), le32(0), fid),
  closeResp: () => bytes(le16(60), le16(0), le32(0), new Uint8Array(32), new Uint8Array(8), new Uint8Array(8), le32(0)),
  error: () => bytes(le16(9), Uint8Array.of(0, 0), le32(0), Uint8Array.of(0)),
};

// ---------------------------------------------------------------------------------------------
// Samples
const T0 = 1763452800;

function sipCall() {
  const cap = new Capture(T0 + 3600);
  const A = { mac: 'a4:83:e7:12:34:56', ip: '192.168.0.21' }, P = { mac: '00:15:65:0a:0b:0c', ip: '192.168.0.5' }, B = { mac: '00:04:f2:33:44:55', ip: '192.168.0.22' };
  const r = rng(11);
  const udp = (s, d, sp, dp, payload) => udpFrame({ srcMac: s.mac, dstMac: d.mac, src: s.ip, dst: d.ip, sport: sp, dport: dp }, payload);
  const callId = '3c26700b8d6e-l2xk0h7t@192.168.0.21';
  const via = (h, br) => [`Via`, `SIP/2.0/UDP ${h.ip}:5060;branch=z9hG4bK${br};rport`];
  const from = ['From', '"Alice" <sip:alice@example.com>;tag=1928301774'];
  const to = ['To', '<sip:bob@example.com>'];
  const toT = ['To', '<sip:bob@example.com>;tag=a6c85cf'];
  const ua = ['User-Agent', 'MyPhone/2.1'];
  // REGISTER
  cap.add(udp(A, P, 5060, 5060, sipMessage('REGISTER sip:example.com SIP/2.0', [via(A, 'reg1'), ['Max-Forwards', '70'],
    ['From', '"Alice" <sip:alice@example.com>;tag=reg77'], ['To', '"Alice" <sip:alice@example.com>'], ['Call-ID', 'reg-8842@192.168.0.21'],
    ['CSeq', '1 REGISTER'], ['Contact', '<sip:alice@192.168.0.21:5060>'], ['Expires', '3600'], ua])));
  cap.add(udp(P, A, 5060, 5060, sipMessage('SIP/2.0 200 OK', [via(A, 'reg1'), ['From', '"Alice" <sip:alice@example.com>;tag=reg77'],
    ['To', '"Alice" <sip:alice@example.com>;tag=srv1'], ['Call-ID', 'reg-8842@192.168.0.21'], ['CSeq', '1 REGISTER'],
    ['Contact', '<sip:alice@192.168.0.21:5060>;expires=3600'], ['Server', 'MyProxy/1.0']])), { dt: 0.012 });
  // INVITE with SDP offer
  const offer = sdpBody({ user: 'alice', sessId: 2890844526, ip: A.ip, port: 49170 });
  cap.add(udp(A, P, 5060, 5060, sipMessage('INVITE sip:bob@example.com SIP/2.0', [via(A, 'inv1'), ['Max-Forwards', '70'], from, to,
    ['Call-ID', callId], ['CSeq', '314159 INVITE'], ['Contact', '<sip:alice@192.168.0.21:5060>'], ua,
    ['Allow', 'INVITE, ACK, CANCEL, BYE, OPTIONS'], ['Content-Type', 'application/sdp']], offer)), { dt: 1.5 });
  cap.add(udp(P, A, 5060, 5060, sipMessage('SIP/2.0 100 Trying', [via(A, 'inv1'), from, to, ['Call-ID', callId], ['CSeq', '314159 INVITE']])), { dt: 0.004 });
  cap.add(udp(P, B, 5060, 5060, sipMessage('INVITE sip:bob@192.168.0.22:5060 SIP/2.0', [via(P, 'prx1'), via(A, 'inv1'), ['Max-Forwards', '69'], from, to,
    ['Call-ID', callId], ['CSeq', '314159 INVITE'], ['Contact', '<sip:alice@192.168.0.21:5060>'], ua, ['Content-Type', 'application/sdp']], offer)), { dt: 0.002 });
  cap.add(udp(B, P, 5060, 5060, sipMessage('SIP/2.0 180 Ringing', [via(P, 'prx1'), via(A, 'inv1'), from, toT, ['Call-ID', callId], ['CSeq', '314159 INVITE'], ['Contact', '<sip:bob@192.168.0.22:5060>']])), { dt: 0.03 });
  cap.add(udp(P, A, 5060, 5060, sipMessage('SIP/2.0 180 Ringing', [via(A, 'inv1'), from, toT, ['Call-ID', callId], ['CSeq', '314159 INVITE'], ['Contact', '<sip:bob@192.168.0.22:5060>']])), { dt: 0.002 });
  const answer = sdpBody({ user: 'bob', sessId: 2890844527, ip: B.ip, port: 3456, codecs: [[0, 'PCMU/8000'], [101, 'telephone-event/8000']] });
  cap.add(udp(B, P, 5060, 5060, sipMessage('SIP/2.0 200 OK', [via(P, 'prx1'), via(A, 'inv1'), from, toT, ['Call-ID', callId], ['CSeq', '314159 INVITE'],
    ['Contact', '<sip:bob@192.168.0.22:5060>'], ['Content-Type', 'application/sdp']], answer)), { dt: 2.4 });
  cap.add(udp(P, A, 5060, 5060, sipMessage('SIP/2.0 200 OK', [via(A, 'inv1'), from, toT, ['Call-ID', callId], ['CSeq', '314159 INVITE'],
    ['Contact', '<sip:bob@192.168.0.22:5060>'], ['Content-Type', 'application/sdp']], answer)), { dt: 0.002 });
  cap.add(udp(A, B, 5060, 5060, sipMessage('ACK sip:bob@192.168.0.22:5060 SIP/2.0', [via(A, 'ack1'), ['Max-Forwards', '70'], from, toT, ['Call-ID', callId], ['CSeq', '314159 ACK']])), { dt: 0.01 });
  // RTP both ways for ~2 s, 20 ms packets of G.711 PCMU (160 bytes)
  const ssrcA = 0x5a1c3e01, ssrcB = 0x1b2c3d4e;
  let seqA = 23041, seqB = 9001, tsA = 160000, tsB = 480000;
  for (let i = 0; i < 100; i++) {
    const pa = r.bytes(160), pb = r.bytes(160);
    cap.add(udp(A, B, 49170, 3456, rtpPacket({ pt: 0, seq: seqA++, ts: tsA, ssrc: ssrcA, marker: i === 0, payload: pa })), { dt: i === 0 ? 0.02 : 0.0101 });
    cap.add(udp(B, A, 3456, 49170, rtpPacket({ pt: 0, seq: seqB++, ts: tsB, ssrc: ssrcB, marker: i === 0, payload: pb })), { dt: 0.0099 });
    tsA += 160; tsB += 160;
    if (i === 50) {
      cap.add(udp(A, B, 49171, 3457, rtcpSrSdes({ ssrc: ssrcA, ntpSec: 3972441600 + 3605, ntpFrac: 0x80000000, rtpTs: tsA, packets: 51, octets: 51 * 160, cname: 'alice@192.168.0.21' })), { dt: 0.001 });
      cap.add(udp(B, A, 3457, 49171, rtcpSrSdes({ ssrc: ssrcB, ntpSec: 3972441600 + 3605, ntpFrac: 0x90000000, rtpTs: tsB, packets: 51, octets: 51 * 160, cname: 'bob@192.168.0.22' })), { dt: 0.001 });
    }
  }
  cap.add(udp(A, B, 5060, 5060, sipMessage('BYE sip:bob@192.168.0.22:5060 SIP/2.0', [via(A, 'bye1'), ['Max-Forwards', '70'], from, toT, ['Call-ID', callId], ['CSeq', '314160 BYE'], ua])), { dt: 0.05 });
  cap.add(udp(B, A, 5060, 5060, sipMessage('SIP/2.0 200 OK', [via(A, 'bye1'), from, toT, ['Call-ID', callId], ['CSeq', '314160 BYE']])), { dt: 0.008 });
  cap.add(udp(A, B, 49171, 3457, rtcpBye(ssrcA)), { dt: 0.001 });
  return cap.file('sip-call-rtp.pcapng');
}

function mqttIot() {
  const cap = new Capture(T0 + 7200);
  const S = { mac: 'b8:27:eb:4d:5e:6f', ip: '192.168.0.40', port: 49152 }, BR = { mac: 'dc:a6:32:01:02:03', ip: '192.168.0.10', port: 1883 };
  const D = { mac: '24:0a:c4:11:22:33', ip: '192.168.0.41', port: 51000 };
  const c1 = new TcpConversation(cap, S, BR, { rtt: 0.004 });
  c1.handshake();
  c1.send('c', mqtt.connect('sensor-livingroom'));
  c1.send('s', mqtt.connack(0));
  const c2 = new TcpConversation(cap, D, BR, { rtt: 0.004 });
  c2.handshake();
  c2.send('c', mqtt.connect('dashboard-01', 30));
  c2.send('s', mqtt.connack(0));
  c2.send('c', mqtt.subscribe(1, 'home/+/temperature', 1));
  c2.send('s', mqtt.suback(1, 1));
  const r = rng(21);
  for (let i = 0; i < 6; i++) {
    cap.wait(1);
    const temp = (21 + r() * 2).toFixed(1);
    if (i % 2) {
      c1.send('c', mqtt.publish('home/livingroom/temperature', `{"t":${temp}}`, 1, 10 + i));
      c1.send('s', mqtt.puback(10 + i));
    } else c1.send('c', mqtt.publish('home/livingroom/temperature', `{"t":${temp}}`, 0));
    c2.send('s', mqtt.publish('home/livingroom/temperature', `{"t":${temp}}`, 0));
  }
  c1.send('c', mqtt.publish('home/livingroom/status', 'online', 0, 0, true));
  cap.wait(2);
  c2.send('c', mqtt.pingreq());
  c2.send('s', mqtt.pingresp());
  c1.send('c', mqtt.disconnect());
  c1.close('c');
  return cap.file('mqtt-iot.pcapng');
}

function modbusTcp() {
  const cap = new Capture(T0 + 10800);
  const H = { mac: '00:0c:29:aa:10:20', ip: '192.168.0.50', port: 50320 }, PLC = { mac: '00:80:f4:12:34:56', ip: '192.168.0.60', port: 502 };
  const c = new TcpConversation(cap, H, PLC, { rtt: 0.002 });
  c.handshake();
  let tid = 1;
  const req = (pdu, resp) => { const t = tid++; c.send('c', mbap(t, 1, pdu)); cap.wait(0.003); c.send('s', mbap(t, 1, resp)); cap.wait(0.1); };
  req(Uint8Array.of(0x01, 0, 0, 0, 16), Uint8Array.of(0x01, 2, 0xa5, 0x0f));                  // read coils
  req(Uint8Array.of(0x02, 0, 0, 0, 8), Uint8Array.of(0x02, 1, 0x81));                         // read discrete inputs
  req(Uint8Array.of(0x03, 0, 100, 0, 4), Uint8Array.of(0x03, 8, 0, 215, 0, 220, 3, 232, 0, 1)); // read holding registers
  req(Uint8Array.of(0x04, 0, 0, 0, 2), Uint8Array.of(0x04, 4, 0x01, 0x2c, 0x00, 0x64));         // read input registers
  req(Uint8Array.of(0x05, 0, 3, 0xff, 0), Uint8Array.of(0x05, 0, 3, 0xff, 0));                 // write single coil
  req(Uint8Array.of(0x06, 0, 101, 0, 230), Uint8Array.of(0x06, 0, 101, 0, 230));               // write single register
  req(Uint8Array.of(0x10, 0, 110, 0, 2, 4, 0, 10, 0, 20), Uint8Array.of(0x10, 0, 110, 0, 2));  // write multiple registers
  req(Uint8Array.of(0x0f, 0, 20, 0, 10, 2, 0xcd, 0x01), Uint8Array.of(0x0f, 0, 20, 0, 10));     // write multiple coils
  req(Uint8Array.of(0x03, 0x27, 0x10, 0, 2), Uint8Array.of(0x83, 0x02));                        // exception: illegal address
  c.close('c');
  return cap.file('modbus-tcp.pcapng');
}

function coapSensors() {
  const cap = new Capture(T0 + 14400);
  const C = { mac: 'a4:83:e7:12:34:56', ip: '192.168.0.10' }, N = { mac: '24:0a:c4:aa:bb:01', ip: '192.168.0.42' };
  const udp = (s, d, sp, dp, p) => udpFrame({ srcMac: s.mac, dstMac: d.mac, src: s.ip, dst: d.ip, sport: sp, dport: dp }, p);
  let mid = 0x7d34;
  const tok = (n) => Uint8Array.of(0x71, 0x2a, n);
  cap.add(udp(C, N, 54321, 5683, coapMessage({ type: 0, code: 1, mid, token: tok(1), options: [[11, '.well-known'], [11, 'core']] })));
  cap.add(udp(N, C, 5683, 54321, coapMessage({ type: 2, code: 69, mid: mid++, token: tok(1), options: [[12, Uint8Array.of(40)]], payload: '</sensors/temp>;rt="temperature";obs,</sensors/hum>;rt="humidity",</actuators/led>' })), { dt: 0.008 });
  cap.add(udp(C, N, 54321, 5683, coapMessage({ type: 0, code: 1, mid, token: tok(2), options: [[11, 'sensors'], [11, 'temp']] })), { dt: 0.5 });
  cap.add(udp(N, C, 5683, 54321, coapMessage({ type: 2, code: 69, mid: mid++, token: tok(2), options: [[12, Uint8Array.of(0)]], payload: '22.4' })), { dt: 0.006 });
  cap.add(udp(C, N, 54321, 5683, coapMessage({ type: 0, code: 3, mid, token: tok(3), options: [[11, 'actuators'], [11, 'led'], [12, Uint8Array.of(0)]], payload: 'on' })), { dt: 0.5 });
  cap.add(udp(N, C, 5683, 54321, coapMessage({ type: 2, code: 68, mid: mid++, token: tok(3) })), { dt: 0.007 });
  // observe
  cap.add(udp(C, N, 54322, 5683, coapMessage({ type: 0, code: 1, mid, token: tok(4), options: [[6, new Uint8Array(0)], [11, 'sensors'], [11, 'hum']] })), { dt: 0.5 });
  cap.add(udp(N, C, 5683, 54322, coapMessage({ type: 2, code: 69, mid: mid++, token: tok(4), options: [[6, Uint8Array.of(1)], [12, Uint8Array.of(0)]], payload: '41' })), { dt: 0.006 });
  for (let i = 2; i < 5; i++) {
    cap.add(udp(N, C, 5683, 54322, coapMessage({ type: 1, code: 69, mid: 0x1200 + i, token: tok(4), options: [[6, Uint8Array.of(i)], [12, Uint8Array.of(0)]], payload: String(40 + i) })), { dt: 5 });
    cap.add(udp(C, N, 54322, 5683, coapMessage({ type: 2, code: 0, mid: 0x1200 + i })), { dt: 0.004 });
  }
  cap.add(udp(C, N, 54321, 5683, coapMessage({ type: 0, code: 1, mid, token: tok(5), options: [[11, 'missing']] })), { dt: 1 });
  cap.add(udp(N, C, 5683, 54321, coapMessage({ type: 2, code: 132, mid: mid++, token: tok(5) })), { dt: 0.005 });
  return cap.file('coap.pcapng');
}

function smb2Share() {
  const cap = new Capture(T0 + 18000);
  const C = { mac: '3c:22:fb:01:02:03', ip: '192.168.0.30', port: 50110 }, S = { mac: '00:11:32:0a:0b:0c', ip: '192.168.0.8', port: 445 };
  const c = new TcpConversation(cap, C, S, { rtt: 0.001 });
  c.handshake();
  let mid = 0;
  const sess = 0x0000100000000021n;
  const fid = Uint8Array.from({ length: 16 }, (_, i) => (0x30 + i * 7) & 255);
  const x = (cmd, reqBody, respBody, o = {}) => {
    const m = mid++;
    c.send('c', smb2({ cmd, msgId: m, sessId: o.sess ?? sess, treeId: o.tree ?? 1 }, reqBody));
    cap.wait(0.0008);
    c.send('s', smb2({ cmd, response: true, status: o.status ?? 0, msgId: m, sessId: o.sess ?? sess, treeId: o.tree ?? 1 }, respBody));
    cap.wait(0.01);
  };
  x(0, smb2Body.negotiateReq(), smb2Body.negotiateResp(), { sess: 0n, tree: 0 });
  x(1, smb2Body.sessionSetupReq(), smb2Body.sessionSetupResp(), { tree: 0 });
  x(3, smb2Body.treeConnectReq('\\\\192.168.0.8\\share'), smb2Body.treeConnectResp(), { tree: 0 });
  x(5, smb2Body.createReq('docs\\report.txt'), smb2Body.createResp(fid));
  const text = te('Quarterly report\r\nRevenue up 12%.\r\n');
  x(8, smb2Body.readReq(fid, 4096), smb2Body.readResp(text));
  x(9, smb2Body.writeReq(fid, te('Appended line.\r\n')), smb2Body.writeResp(16));
  x(6, smb2Body.closeReq(fid), smb2Body.closeResp());
  x(5, smb2Body.createReq('docs\\missing.txt'), smb2Body.error(), { status: 0xc0000034 });
  c.close('c');
  return cap.file('smb2-file-share.pcapng');
}

export const samples = [
  { id: 'sip-call-rtp', group: 'iot', icon: 'phone', ko: ['SIP 통화와 RTP', 'REGISTER, INVITE부터 BYE까지 SIP 신호와 SDP로 협상한 G.711 RTP 음성 스트림'], en: ['SIP call with RTP', 'SIP signalling from REGISTER and INVITE to BYE, with SDP-negotiated G.711 RTP audio'], build: sipCall },
  { id: 'mqtt-iot', group: 'iot', icon: 'sensor', ko: ['MQTT IoT', '센서가 브로커에 온도를 발행하고 대시보드가 구독하는 MQTT 세션'], en: ['MQTT IoT', 'A sensor publishing temperatures to a broker and a dashboard subscribing to them'], build: mqttIot },
  { id: 'modbus-tcp', group: 'iot', icon: 'factory', ko: ['Modbus/TCP', 'HMI가 PLC의 코일과 레지스터를 읽고 쓰며 예외 응답도 하나 포함'], en: ['Modbus/TCP', 'An HMI reading and writing PLC coils and registers, including one exception response'], build: modbusTcp },
  { id: 'coap', group: 'iot', icon: 'sensor', ko: ['CoAP 센서', '리소스 탐색, GET/PUT, Observe 알림과 4.04 오류가 있는 CoAP 교환'], en: ['CoAP sensors', 'CoAP resource discovery, GET/PUT, Observe notifications and a 4.04 error'], build: coapSensors },
  { id: 'smb2-file-share', group: 'lan', icon: 'folder', ko: ['SMB2 파일 공유', '협상, 세션 설정, 공유 연결 후 파일 열기/읽기/쓰기/닫기'], en: ['SMB2 file share', 'Negotiate, session setup and tree connect, then open, read, write and close a file'], build: smb2Share },
];
