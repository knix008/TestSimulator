// TLS / QUIC payload builders (deterministic, no real keys) and the TLS/QUIC sample captures.
import {
  bytes, be16, be24, be32, te, rng, Capture, TcpConversation, udpFrame,
} from '../packet.js';
import { quicProtectInitial, isKnownVersion } from '../../dissect/proto/quic-crypto.js';

// ---------------------------------------------------------------------------------------------
// TLS records
export function tlsRecord(type, version, body) { return bytes(Uint8Array.of(type), be16(version), be16(body.length), body); }
export function tlsHandshake(type, body) { return bytes(Uint8Array.of(type), be24(body.length), body); }
function ext(type, body) { return bytes(be16(type), be16(body.length), body); }
const v8 = (b) => bytes(Uint8Array.of(b.length), b);
const v16 = (b) => bytes(be16(b.length), b);
const u16list = (arr) => v16(bytes(...arr.map(be16)));

const DEFAULT_CIPHERS = [0x1301, 0x1302, 0x1303, 0xc02b, 0xc02f, 0xc02c, 0xc030, 0xcca9, 0xcca8, 0xc013, 0xc014, 0x009c, 0x009d, 0x002f, 0x0035];
const DEFAULT_SIGALGS = [0x0403, 0x0804, 0x0401, 0x0503, 0x0805, 0x0501, 0x0806, 0x0601];

function randomBytes(r, n) { return r ? r.bytes(n) : new Uint8Array(n).map((_, i) => (i * 37 + 11) & 255); }

/**
 * ClientHello record. o: { sni, alpn: ['h2','http/1.1'], random (32 bytes), sessionId (bytes), ciphers, groups,
 * versions (supported_versions list; omit for TLS 1.2 only), keyShare: true, grease: true, rnd (rng), recordVersion,
 * padding: n, extra: [[type, body]] }
 */
export function tlsClientHelloBody(o = {}) {
  const r = o.rnd;
  const random = o.random || randomBytes(r, 32);
  const sid = o.sessionId || new Uint8Array(0);
  const ciphers = o.ciphers || DEFAULT_CIPHERS;
  const groups = o.groups || [0x001d, 0x0017, 0x0018];
  const exts = [];
  const g = o.grease ? 0x0a0a : null;
  if (g) exts.push(ext(g, new Uint8Array(0)));
  if (o.sni) exts.push(ext(0, v16(bytes(Uint8Array.of(0), v16(te(o.sni))))));
  exts.push(ext(23, new Uint8Array(0)));                       // extended_master_secret
  exts.push(ext(0xff01, Uint8Array.of(0)));                    // renegotiation_info
  exts.push(ext(10, u16list(g ? [0x1a1a, ...groups] : groups))); // supported_groups
  exts.push(ext(11, v8(Uint8Array.of(0))));                     // ec_point_formats
  exts.push(ext(35, new Uint8Array(0)));                        // session_ticket
  if (o.alpn) exts.push(ext(16, v16(bytes(...o.alpn.map((s) => v8(te(s)))))));
  exts.push(ext(5, Uint8Array.of(1, 0, 0, 0, 0)));              // status_request (OCSP)
  exts.push(ext(13, u16list(DEFAULT_SIGALGS)));
  exts.push(ext(18, new Uint8Array(0)));                        // signed_certificate_timestamp
  if (o.versions) {
    if (o.keyShare !== false) {
      const kg = groups[0];
      exts.push(ext(51, v16(bytes(be16(kg), v16(randomBytes(r, kg === 0x001d ? 32 : 65))))));
    }
    exts.push(ext(43, v8(bytes(...o.versions.map(be16)))));
    exts.push(ext(0x002d, v8(Uint8Array.of(1))));              // psk_key_exchange_modes: psk_dhe_ke
  }
  for (const [t, b] of o.extra || []) exts.push(ext(t, b));
  if (o.padding) exts.push(ext(21, new Uint8Array(o.padding)));
  const body = bytes(be16(0x0303), random, v8(sid), u16list(g ? [0x2a2a, ...ciphers] : ciphers), v8(Uint8Array.of(0)), v16(bytes(...exts)));
  return tlsHandshake(1, body);
}
export function tlsClientHello(o = {}) { return tlsRecord(22, o.recordVersion || 0x0301, tlsClientHelloBody(o)); }

/** ServerHello record. o: { random, sessionId, cipher, version: 0x0303|0x0304, keyShareGroup, alpn, rnd, hrr } */
export function tlsServerHelloBody(o = {}) {
  const r = o.rnd;
  const tls13 = o.version === 0x0304;
  const exts = [];
  if (tls13) {
    const kg = o.keyShareGroup || 0x001d;
    // HelloRetryRequest carries only the selected group in key_share.
    exts.push(ext(51, o.hrr ? be16(kg) : bytes(be16(kg), v16(randomBytes(r, kg === 0x001d ? 32 : 65)))));
    exts.push(ext(43, be16(0x0304)));
  } else {
    exts.push(ext(0xff01, Uint8Array.of(0)));
    exts.push(ext(23, new Uint8Array(0)));
    exts.push(ext(11, v8(Uint8Array.of(0))));
    if (o.alpn) exts.push(ext(16, v16(v8(te(o.alpn)))));
  }
  const random = o.hrr ? Uint8Array.from('cf21ad74e59a6111be1d8c021e65b891c2a211167abb8c5e079e09e2c8a8339c'.match(/../g), (h) => parseInt(h, 16)) : o.random;
  const body = bytes(be16(0x0303), random || randomBytes(r, 32), v8(o.sessionId || new Uint8Array(0)),
    be16(o.cipher || (tls13 ? 0x1301 : 0xc02f)), Uint8Array.of(0), v16(bytes(...exts)));
  return tlsHandshake(2, body);
}
export function tlsServerHello(o = {}) { return tlsRecord(22, 0x0303, tlsServerHelloBody(o)); }
export function tlsCertificateBody(ders) {
  const list = bytes(...ders.map((d) => bytes(be24(d.length), d)));
  return tlsHandshake(11, bytes(be24(list.length), list));
}
export function tlsCertificate(ders) { return tlsRecord(22, 0x0303, tlsCertificateBody(ders)); }
/** ECDHE ServerKeyExchange (named curve x25519) with a fake signature. */
export function tlsServerKeyExchangeBody(rnd) {
  return tlsHandshake(12, bytes(Uint8Array.of(3), be16(0x001d), v8(randomBytes(rnd, 32)), be16(0x0804), v16(randomBytes(rnd, 256))));
}
export const tlsServerHelloDoneBody = () => tlsHandshake(14, new Uint8Array(0));
export function tlsClientKeyExchangeBody(rnd) { return tlsHandshake(16, v8(randomBytes(rnd, 32))); }
export function tlsChangeCipherSpec(version = 0x0303) { return tlsRecord(20, version, Uint8Array.of(1)); }
/** Encrypted handshake message (e.g. Finished after CCS): opaque bytes in a handshake record. */
export function tlsEncryptedHandshake(len = 40, rnd) { return tlsRecord(22, 0x0303, randomBytes(rnd, len)); }
export function tlsAppData(len, rnd) { return tlsRecord(23, 0x0303, randomBytes(rnd, len)); }
export function tlsAlert(level, desc) { return tlsRecord(21, 0x0303, Uint8Array.of(level, desc)); }
export function tlsNewSessionTicketBody(rnd) {
  return tlsHandshake(4, bytes(be32(7200), v16(randomBytes(rnd, 160))));
}

// DTLS (records carry epoch + 48-bit sequence; handshake headers carry message_seq and fragment info)
export function dtlsRecord(type, version, epoch, seq, body) {
  return bytes(Uint8Array.of(type), be16(version), be16(epoch), be16(Math.floor(seq / 2 ** 32)), be32(seq >>> 0), be16(body.length), body);
}
/** Convert a TLS handshake message (4-byte header) into a DTLS one (12-byte header, unfragmented). */
export function dtlsHandshake(tlsMsg, messageSeq) {
  const len = tlsMsg.length - 4;
  return bytes(tlsMsg.subarray(0, 4), be16(messageSeq), be24(0), be24(len), tlsMsg.subarray(4));
}
/** DTLS ClientHello body: like TLS but with a cookie after the session id. */
export function dtlsClientHelloBody(o = {}) {
  const ch = tlsClientHelloBody(o);
  const sidLen = ch[4 + 34];
  const at = 4 + 35 + sidLen;
  const cookie = o.cookie || new Uint8Array(0);
  const body = bytes(ch.subarray(4, at), v8(cookie), ch.subarray(at));
  body.set(be16(o.version || 0xfefd), 0);
  return tlsHandshake(1, body);
}
export function dtlsHelloVerifyRequestBody(cookie) { return tlsHandshake(3, bytes(be16(0xfeff), v8(cookie))); }

// ---------------------------------------------------------------------------------------------
// Minimal DER encoder and a deterministic self-made certificate (not signed by anything real).
function derLen(n) {
  if (n < 128) return Uint8Array.of(n);
  if (n < 256) return Uint8Array.of(0x81, n);
  if (n < 65536) return Uint8Array.of(0x82, n >> 8, n & 255);
  return Uint8Array.of(0x83, n >> 16, (n >> 8) & 255, n & 255);
}
export function der(tag, ...content) { const c = bytes(...content); return bytes(Uint8Array.of(tag), derLen(c.length), c); }
export function derOid(s) {
  const p = s.split('.').map(Number);
  const out = [40 * p[0] + p[1]];
  for (const v of p.slice(2)) {
    const t = [];
    let x = v;
    do { t.unshift(x & 127); x = Math.floor(x / 128); } while (x);
    for (let i = 0; i < t.length - 1; i++) t[i] |= 128;
    out.push(...t);
  }
  return der(0x06, Uint8Array.from(out));
}
const seq = (...c) => der(0x30, ...c);
const set = (...c) => der(0x31, ...c);
const rdn = (oid, val, tag = 0x0c) => set(seq(derOid(oid), der(tag, te(val))));
function utc(d) {
  const p = (n) => String(n).padStart(2, '0');
  return der(0x17, te(`${p(d.getUTCFullYear() % 100)}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`));
}
function name(o) {
  const parts = [];
  if (o.c) parts.push(rdn('2.5.4.6', o.c, 0x13));
  if (o.st) parts.push(rdn('2.5.4.8', o.st));
  if (o.l) parts.push(rdn('2.5.4.7', o.l));
  if (o.o) parts.push(rdn('2.5.4.10', o.o));
  if (o.ou) parts.push(rdn('2.5.4.11', o.ou));
  if (o.cn) parts.push(rdn('2.5.4.3', o.cn));
  return seq(...parts);
}
/**
 * o: { subject: {c,o,cn}, issuer: {c,o,cn}, serial: bytes, notBefore: Date, notAfter: Date, san: [dns], seed, ec: bool }
 */
export function makeCertificate(o = {}) {
  const r = rng(o.seed || 7);
  const algo = seq(derOid('1.2.840.113549.1.1.11'), der(0x05));
  let spki;
  if (o.ec) {
    spki = seq(seq(derOid('1.2.840.10045.2.1'), derOid('1.2.840.10045.3.1.7')), der(0x03, Uint8Array.of(0), Uint8Array.of(4), r.bytes(64)));
  } else {
    const mod = r.bytes(256); mod[0] |= 0x80;
    spki = seq(seq(derOid('1.2.840.113549.1.1.1'), der(0x05)), der(0x03, Uint8Array.of(0), seq(der(0x02, Uint8Array.of(0), mod), der(0x02, Uint8Array.of(1, 0, 1)))));
  }
  const exts = [];
  if (o.san && o.san.length) {
    exts.push(seq(derOid('2.5.29.17'), der(0x04, seq(...o.san.map((n) => der(0x82, te(n)))))));
  }
  exts.push(seq(derOid('2.5.29.19'), der(0x01, Uint8Array.of(0xff)), der(0x04, seq(...(o.ca ? [der(0x01, Uint8Array.of(0xff))] : [])))));
  const tbs = seq(
    der(0xa0, der(0x02, Uint8Array.of(2))),
    der(0x02, o.serial || r.bytes(16).map((b, i) => (i === 0 ? b & 0x7f : b))),
    algo,
    name(o.issuer || { c: 'KR', o: 'MyNetManager Demo CA', cn: 'MyNetManager Demo Root' }),
    seq(utc(o.notBefore || new Date(Date.UTC(2025, 0, 1))), utc(o.notAfter || new Date(Date.UTC(2026, 11, 31)))),
    name(o.subject || { c: 'KR', o: 'Example', cn: 'example.com' }),
    spki,
    der(0xa3, seq(...exts)),
  );
  return seq(tbs, algo, der(0x03, Uint8Array.of(0), r.bytes(256)));
}

// ---------------------------------------------------------------------------------------------
// QUIC
function varint(v) {
  if (v < 64) return Uint8Array.of(v);
  if (v < 16384) return Uint8Array.of(0x40 | (v >> 8), v & 255);
  return bytes(be32((0x80000000 | v) >>> 0));
}
/** CRYPTO frame carrying a TLS handshake message, then PADDING to reach `size` bytes of plaintext. */
export function quicCryptoFrames(tlsHandshakeMsg, offset = 0) {
  return bytes(Uint8Array.of(0x06), varint(offset), varint(tlsHandshakeMsg.length), tlsHandshakeMsg);
}
/**
 * Protected QUIC Initial packet (RFC 9001 keys derived from the DCID, so Wireshark can decrypt it).
 * o: { dcid, scid, version = 1, pn = 0, frames (plaintext frames), token, fromServer, padTo }
 */
export function quicInitial(o = {}) {
  const version = o.version ?? 1;
  const dcid = o.dcid || Uint8Array.of(0x83, 0x94, 0xc8, 0xf0, 0x3e, 0x51, 0x57, 0x08);
  const scid = o.scid || new Uint8Array(0);
  let frames = o.frames || bytes(Uint8Array.of(0x01)); // PING
  const pnLen = 2;
  const pn = o.pn ?? 0;
  const token = o.token || new Uint8Array(0);
  const target = o.padTo ?? (o.fromServer ? 0 : 1200);
  // header without length, to size the padding
  // QUIC v2 renumbers the long packet types (Initial = 1).
  const typeBits = version === 0x6b3343cf ? 0x10 : 0x00;
  const hdr0 = bytes(Uint8Array.of(0xc0 | typeBits | (pnLen - 1)), be32(version), v8(dcid), v8(scid), o.fromServer ? Uint8Array.of(0) : bytes(varint(token.length), token));
  const lenFieldSize = 2;
  const minPayload = target ? target - hdr0.length - lenFieldSize - pnLen - 16 : 0;
  if (frames.length < minPayload) frames = bytes(frames, new Uint8Array(minPayload - frames.length));
  if (frames.length < 4) frames = bytes(frames, new Uint8Array(4 - frames.length)); // sample needs 4 bytes after pn
  const length = pnLen + frames.length + 16;
  const header = bytes(hdr0, Uint8Array.of(0x40 | (length >> 8), length & 255), be16(pn));
  if (!isKnownVersion(version)) return bytes(header, frames, new Uint8Array(16)); // no known salt: left unprotected
  return quicProtectInitial(header, pnLen, pn, frames, dcid, version, o.fromServer === true, o.keyDcid);
}
/** Unprotected-looking long header packet of another type (Handshake=2, 0-RTT=1) with opaque payload. */
export function quicLong(o = {}) {
  const r = o.rnd || rng(3);
  const type = o.type ?? 2;
  const len = o.payloadLen ?? 60;
  return bytes(Uint8Array.of(0xc0 | (type << 4) | 1), be32(o.version ?? 1), v8(o.dcid), v8(o.scid || new Uint8Array(0)),
    Uint8Array.of(0x40 | (len >> 8), len & 255), r.bytes(len));
}
/** Short header (1-RTT) packet with opaque protected payload. */
export function quicShort(o = {}) {
  const r = o.rnd || rng(5);
  return bytes(Uint8Array.of(0x40 | (r.int(0, 31) & 0x1f)), o.dcid, r.bytes(o.len ?? 80));
}
export function quicVersionNegotiation(o) {
  return bytes(Uint8Array.of(0x80 | 0x2a), be32(0), v8(o.dcid), v8(o.scid || new Uint8Array(0)), ...(o.versions || [1, 0x6b3343cf]).map(be32));
}

// ---------------------------------------------------------------------------------------------
// Samples
const CLIENT = { mac: 'a4:83:e7:12:34:56', ip: '192.168.0.10' };
const GW = '00:11:32:aa:bb:cc';

function tlsCapture() {
  const cap = new Capture(1763452800.5, { comment: 'TLS 1.2 and TLS 1.3 handshakes (synthetic, no keys)' });
  const r = rng(443);
  // --- TLS 1.2 with certificate chain
  const srv = { mac: GW, ip: '93.184.216.34', port: 443 };
  const c1 = new TcpConversation(cap, { ...CLIENT, port: 50311 }, srv, { rtt: 0.024 });
  c1.handshake();
  c1.send('c', tlsClientHello({ sni: 'www.example.com', alpn: ['http/1.1'], rnd: r, sessionId: r.bytes(32) }));
  const leaf = makeCertificate({ seed: 11, subject: { c: 'US', o: 'Example Inc.', cn: 'www.example.com' }, issuer: { c: 'KR', o: 'MyNetManager Demo CA', cn: 'MyNetManager Demo Intermediate' }, san: ['www.example.com', 'example.com'] });
  const inter = makeCertificate({ seed: 12, subject: { c: 'KR', o: 'MyNetManager Demo CA', cn: 'MyNetManager Demo Intermediate' }, ca: true });
  const flight = tlsRecord(22, 0x0303, bytes(tlsServerHelloBody({ rnd: r, cipher: 0xc02f, alpn: 'http/1.1' }), tlsCertificateBody([leaf, inter]),
    tlsServerKeyExchangeBody(r), tlsServerHelloDoneBody()));
  c1.send('s', flight); // spans several segments
  c1.send('c', bytes(tlsRecord(22, 0x0303, tlsClientKeyExchangeBody(r)), tlsChangeCipherSpec(), tlsEncryptedHandshake(40, r)));
  c1.send('s', bytes(tlsRecord(22, 0x0303, tlsNewSessionTicketBody(r)), tlsChangeCipherSpec(), tlsEncryptedHandshake(40, r)));
  c1.send('c', tlsAppData(420, r));
  c1.send('s', tlsAppData(3200, r));
  c1.send('c', tlsAlert(1, 0)); // close_notify (plaintext alert for demonstration)
  c1.close('c');
  cap.wait(0.4);
  // --- TLS 1.3 with h2 ALPN
  const srv2 = { mac: GW, ip: '142.250.196.100', port: 443 };
  const c2 = new TcpConversation(cap, { ...CLIENT, port: 50312 }, srv2, { rtt: 0.031, timestamps: true });
  c2.handshake();
  c2.send('c', tlsClientHello({ sni: 'www.google.com', alpn: ['h2', 'http/1.1'], rnd: r, sessionId: r.bytes(32), versions: [0x0304, 0x0303], grease: true, groups: [0x001d, 0x0017, 0x0018] }));
  c2.send('s', bytes(tlsServerHello({ rnd: r, version: 0x0304, cipher: 0x1301, sessionId: r.bytes(32) }), tlsChangeCipherSpec(), tlsAppData(2800, r)));
  c2.send('c', bytes(tlsChangeCipherSpec(), tlsAppData(53, r)));
  for (let i = 0; i < 3; i++) { c2.send('c', tlsAppData(90 + i * 40, r)); c2.send('s', tlsAppData(600 + i * 300, r)); }
  c2.close('s');
  cap.wait(0.2);
  // --- handshake failure alert from a server with a different policy
  const srv3 = { mac: GW, ip: '203.0.113.50', port: 8443 };
  const c3 = new TcpConversation(cap, { ...CLIENT, port: 50313 }, srv3, { rtt: 0.012 });
  c3.handshake();
  c3.send('c', tlsClientHello({ sni: 'legacy.example.net', rnd: r, ciphers: [0x002f, 0x0035, 0x000a] }));
  c3.send('s', tlsRecord(21, 0x0303, Uint8Array.of(2, 40)));
  c3.reset('s');
  return cap.file('https-tls-handshake.pcapng');
}

function quicCapture() {
  const cap = new Capture(1763452900.25, { comment: 'QUIC v1 connection setup (Initial packets are protected with the RFC 9001 initial keys)' });
  const r = rng(4433);
  const srvIp = '142.250.196.110';
  const cl = { srcMac: CLIENT.mac, dstMac: GW, src: CLIENT.ip, dst: srvIp, sport: 52811, dport: 443 };
  const sv = { srcMac: GW, dstMac: CLIENT.mac, src: srvIp, dst: CLIENT.ip, sport: 443, dport: 52811, ttl: 118 };
  const dcid = r.bytes(8), cscid = r.bytes(8), sscid = r.bytes(8);
  const ch = tlsClientHelloBody({ sni: 'www.youtube.com', alpn: ['h3'], rnd: r, versions: [0x0304], extra: [[57, Uint8Array.of(1, 2, 0x40, 0x64, 4, 4, 0x80, 0x10, 0, 0)]] });
  cap.add(udpFrame(cl, quicInitial({ dcid, scid: cscid, frames: quicCryptoFrames(ch), pn: 0 })));
  cap.wait(0.028);
  const sh = tlsServerHelloBody({ rnd: r, version: 0x0304, cipher: 0x1301 });
  const p1 = quicInitial({ dcid: cscid, scid: sscid, frames: bytes(Uint8Array.of(0x02, 0x00, 0x00, 0x00, 0x00), quicCryptoFrames(sh)), pn: 0, fromServer: true, keyDcid: dcid, padTo: 0 });
  const p2 = quicLong({ type: 2, dcid: cscid, scid: sscid, payloadLen: 1000, rnd: r });
  cap.add(udpFrame(sv, bytes(p1, p2)));
  cap.wait(0.0004);
  cap.add(udpFrame(sv, quicLong({ type: 2, dcid: cscid, scid: sscid, payloadLen: 900, rnd: r })));
  cap.wait(0.003);
  cap.add(udpFrame(cl, quicInitial({ dcid: sscid, scid: cscid, frames: Uint8Array.of(0x02, 0x00, 0x00, 0x00, 0x00), pn: 1, keyDcid: dcid })));
  cap.add(udpFrame(cl, quicLong({ type: 2, dcid: sscid, scid: cscid, payloadLen: 80, rnd: r })), { dt: 0.0002 });
  for (let i = 0; i < 12; i++) {
    cap.wait(0.004 + r() * 0.01);
    if (i % 3 === 0) cap.add(udpFrame(cl, quicShort({ dcid: sscid, len: 60 + r.int(0, 300), rnd: r })));
    else cap.add(udpFrame(sv, quicShort({ dcid: cscid, len: 1100 + r.int(0, 150), rnd: r })));
  }
  return cap.file('quic.pcapng');
}

export const samples = [
  {
    id: 'https-tls-handshake', group: 'web', icon: 'lock',
    ko: ['HTTPS/TLS 핸드셰이크', 'TLS 1.2 인증서 교환, TLS 1.3 핸드셰이크, 암호화된 데이터와 경고 메시지'],
    en: ['HTTPS/TLS handshake', 'TLS 1.2 with certificates, a TLS 1.3 handshake, encrypted data and an alert'],
    build: tlsCapture,
  },
  {
    id: 'quic', group: 'web', icon: 'bolt',
    ko: ['QUIC', 'HTTP/3용 QUIC 연결: Initial(복호화 가능), Handshake, 1-RTT 패킷'],
    en: ['QUIC', 'A QUIC connection for HTTP/3: Initial (decryptable), Handshake and 1-RTT packets'],
    build: quicCapture,
  },
];
