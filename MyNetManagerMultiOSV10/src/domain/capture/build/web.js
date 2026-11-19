// Payload builders for web/text protocols (HTTP, SSDP, WebSocket, HTTP/2, FTP, SMTP, SSH)
// and the sample captures that use them.
import { Capture, TcpConversation, udpFrame, bytes, te, be16, be24, be32, rng } from '../packet.js';

const CRLF = '\r\n';

/** HTTP/1.x request bytes. headers: [[name, value]...] or { name: value }. */
export function httpRequest({ method = 'GET', host = 'example.com', path = '/', version = 'HTTP/1.1', headers = [], body = null } = {}) {
  const h = [['Host', host], ...hdrList(headers)];
  if (body && !h.some(([n]) => /^content-length$/i.test(n))) h.push(['Content-Length', String(toBytes(body).length)]);
  return bytes(te(`${method} ${path} ${version}${CRLF}${h.map(([n, v]) => `${n}: ${v}${CRLF}`).join('')}${CRLF}`), body ? toBytes(body) : null);
}
/** HTTP/1.x response bytes. chunked: chunk size (bytes) to use Transfer-Encoding: chunked. */
export function httpResponse({ code = 200, reason, version = 'HTTP/1.1', headers = [], body = null, chunked = 0 } = {}) {
  const b = body ? toBytes(body) : new Uint8Array(0);
  const h = hdrList(headers);
  let payload = b;
  if (chunked) {
    h.push(['Transfer-Encoding', 'chunked']);
    const parts = [];
    for (let o = 0; o < b.length; o += chunked) {
      const c = b.subarray(o, Math.min(o + chunked, b.length));
      parts.push(te(c.length.toString(16) + CRLF), c, te(CRLF));
    }
    parts.push(te('0' + CRLF + CRLF));
    payload = bytes(...parts);
  } else if (code !== 304 && code !== 204 && !(code >= 100 && code < 200)) {
    h.push(['Content-Length', String(b.length)]);
  }
  return bytes(te(`${version} ${code} ${reason ?? REASONS[code] ?? 'OK'}${CRLF}${h.map(([n, v]) => `${n}: ${v}${CRLF}`).join('')}${CRLF}`), payload);
}
const REASONS = { 101: 'Switching Protocols', 200: 'OK', 204: 'No Content', 301: 'Moved Permanently', 302: 'Found', 304: 'Not Modified', 400: 'Bad Request', 403: 'Forbidden', 404: 'Not Found', 500: 'Internal Server Error' };
function hdrList(h) { return Array.isArray(h) ? h : Object.entries(h); }
function toBytes(b) { return typeof b === 'string' ? te(b) : b; }

export function ssdpSearch({ st = 'ssdp:all', mx = 2 } = {}) {
  return te(`M-SEARCH * HTTP/1.1${CRLF}HOST: 239.255.255.250:1900${CRLF}MAN: "ssdp:discover"${CRLF}MX: ${mx}${CRLF}ST: ${st}${CRLF}${CRLF}`);
}
export function ssdpNotify({ location = 'http://192.168.0.1:49152/rootDesc.xml', nt = 'upnp:rootdevice', usn = 'uuid:2f402f80-da50-11e1-9b23-001788000001::upnp:rootdevice', server = 'Linux/5.10 UPnP/1.0 MiniUPnPd/2.2' } = {}) {
  return te(`NOTIFY * HTTP/1.1${CRLF}HOST: 239.255.255.250:1900${CRLF}CACHE-CONTROL: max-age=1800${CRLF}LOCATION: ${location}${CRLF}NT: ${nt}${CRLF}NTS: ssdp:alive${CRLF}SERVER: ${server}${CRLF}USN: ${usn}${CRLF}${CRLF}`);
}
export function ssdpResponse({ location = 'http://192.168.0.1:49152/rootDesc.xml', st = 'upnp:rootdevice', usn = 'uuid:2f402f80-da50-11e1-9b23-001788000001::upnp:rootdevice' } = {}) {
  return te(`HTTP/1.1 200 OK${CRLF}CACHE-CONTROL: max-age=1800${CRLF}EXT:${CRLF}LOCATION: ${location}${CRLF}SERVER: Linux/5.10 UPnP/1.0 MiniUPnPd/2.2${CRLF}ST: ${st}${CRLF}USN: ${usn}${CRLF}${CRLF}`);
}

/** WebSocket frame. mask: 4-byte array (client frames must be masked). */
export function wsFrame({ fin = true, opcode = 1, payload = '', mask = null } = {}) {
  const p = toBytes(payload);
  const hdr = [(fin ? 0x80 : 0) | opcode];
  const m = mask ? 0x80 : 0;
  if (p.length < 126) hdr.push(m | p.length);
  else if (p.length < 65536) hdr.push(m | 126, p.length >> 8, p.length & 255);
  else hdr.push(m | 127, 0, 0, 0, 0, (p.length >>> 24) & 255, (p.length >> 16) & 255, (p.length >> 8) & 255, p.length & 255);
  let body = p;
  if (mask) { body = p.slice(); for (let i = 0; i < body.length; i++) body[i] ^= mask[i & 3]; hdr.push(...mask); }
  return bytes(Uint8Array.from(hdr), body);
}

// --- HTTP/2 ------------------------------------------------------------------------------------
export const H2_PREFACE = te('PRI * HTTP/2.0\r\n\r\nSM\r\n\r\n');
export function h2Frame(type, flags, stream, payload = new Uint8Array(0)) {
  return bytes(be24(payload.length), Uint8Array.of(type, flags), be32(stream & 0x7fffffff), payload);
}
const H2_STATIC = { ':method GET': 2, ':method POST': 3, ':path /': 4, ':scheme http': 6, ':scheme https': 7, ':status 200': 8, ':status 404': 13 };
const H2_STATIC_NAMES = { ':authority': 1, ':path': 4, 'content-type': 31, 'content-length': 28, 'user-agent': 58, server: 54, accept: 19, date: 33 };
function hpackInt(v, prefixBits, first) {
  const max = (1 << prefixBits) - 1;
  if (v < max) return [first | v];
  const out = [first | max];
  v -= max;
  while (v >= 128) { out.push((v & 127) | 128); v >>= 7; }
  out.push(v);
  return out;
}
function hpackStr(s) { const b = te(s); return bytes(Uint8Array.from(hpackInt(b.length, 7, 0)), b); }
/** HPACK block (no Huffman): static-indexed when possible, else literal without indexing. */
export function hpack(headers) {
  const parts = [];
  for (const [n, v] of headers) {
    const full = H2_STATIC[n + ' ' + v];
    if (full) { parts.push(Uint8Array.of(0x80 | full)); continue; }
    const ni = H2_STATIC_NAMES[n];
    if (ni) parts.push(Uint8Array.from(hpackInt(ni, 4, 0)), hpackStr(v));
    else parts.push(Uint8Array.of(0), hpackStr(n), hpackStr(v));
  }
  return bytes(...parts);
}
export function h2Settings(pairs = [[3, 100], [4, 65535]], ack = false) {
  return h2Frame(4, ack ? 1 : 0, 0, ack ? new Uint8Array(0) : bytes(...pairs.map(([id, v]) => bytes(be16(id), be32(v)))));
}

// --- SSH --------------------------------------------------------------------------------------
function sshString(s) { const b = toBytes(s); return bytes(be32(b.length), b); }
/** Unencrypted SSH binary packet with block-size padding. */
export function sshPacket(payload, r = rng(7)) {
  let pad = 8 - ((5 + payload.length) % 8);
  if (pad < 4) pad += 8;
  return bytes(be32(1 + payload.length + pad), Uint8Array.of(pad), payload, r.bytes(pad));
}
export function sshKexInit(r, server = false) {
  const lists = [
    'curve25519-sha256,curve25519-sha256@libssh.org,ecdh-sha2-nistp256,diffie-hellman-group14-sha256' + (server ? '' : ',ext-info-c'),
    'ssh-ed25519,ecdsa-sha2-nistp256,rsa-sha2-512,rsa-sha2-256',
    'chacha20-poly1305@openssh.com,aes128-ctr,aes256-ctr,aes128-gcm@openssh.com,aes256-gcm@openssh.com',
    'chacha20-poly1305@openssh.com,aes128-ctr,aes256-ctr,aes128-gcm@openssh.com,aes256-gcm@openssh.com',
    'umac-64-etm@openssh.com,hmac-sha2-256-etm@openssh.com,hmac-sha2-256',
    'umac-64-etm@openssh.com,hmac-sha2-256-etm@openssh.com,hmac-sha2-256',
    'none,zlib@openssh.com', 'none,zlib@openssh.com', '', '',
  ];
  return sshPacket(bytes(Uint8Array.of(20), r.bytes(16), ...lists.map(sshString), Uint8Array.of(0), be32(0)), r);
}

// --- samples ------------------------------------------------------------------------------------
const T0 = 1763452800; // 2025-11-18 08:00:00 UTC
const PC = { mac: 'a4:83:e7:12:34:56', ip: '192.168.0.10' };
const GW = { mac: '00:11:32:aa:bb:cc' };
const SRV = { mac: '00:1a:a0:01:02:03', ip: '192.168.0.20' };

function filler(r, n, alphabet = 'abcdefghijklmnopqrstuvwxyz     ') {
  let s = '';
  for (let i = 0; i < n; i++) s += alphabet[Math.floor(r() * alphabet.length)];
  return s;
}
function pngBytes(r, n) {
  // PNG signature + IHDR + IDAT (random) + IEND; CRCs are not checked by the dissector tree but keep it plausible.
  const ihdr = bytes(be32(13), te('IHDR'), be32(64), be32(64), Uint8Array.of(8, 6, 0, 0, 0), be32(0x5b6e2d1f));
  const data = r.bytes(n);
  return bytes(Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a), ihdr, be32(n), te('IDAT'), data, be32(0x1234abcd), be32(0), te('IEND'), be32(0xae426082));
}

function httpPageLoad() {
  const r = rng(101);
  const cap = new Capture(T0);
  const c = new TcpConversation(cap, { ...PC, port: 52344 }, { ...SRV, port: 80 }, { rtt: 0.004 });
  c.handshake();
  const html = `<!DOCTYPE html>\n<html>\n<head>\n<title>Intranet</title>\n<link rel="stylesheet" href="/style.css">\n</head>\n<body>\n<h1>Welcome</h1>\n` +
    Array.from({ length: 60 }, (_, i) => `<p id="p${i}">${filler(r, 50)}</p>\n`).join('') + '<img src="/logo.png">\n<script src="/app.js"></script>\n</body>\n</html>\n';
  const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';
  const common = [['User-Agent', ua], ['Accept-Encoding', 'gzip, deflate'], ['Accept-Language', 'ko-KR,ko;q=0.9,en;q=0.8'], ['Connection', 'keep-alive']];
  const srvh = (type) => [['Date', 'Tue, 18 Nov 2025 08:00:00 GMT'], ['Server', 'nginx/1.24.0'], ['Content-Type', type], ['Connection', 'keep-alive']];
  c.send('c', httpRequest({ path: '/', host: 'intranet.local', headers: [['Accept', 'text/html,application/xhtml+xml'], ...common] }));
  c.send('s', httpResponse({ headers: srvh('text/html; charset=utf-8'), body: html }));
  cap.wait(0.03);
  c.send('c', httpRequest({ path: '/style.css', host: 'intranet.local', headers: [['Accept', 'text/css,*/*;q=0.1'], ['Referer', 'http://intranet.local/'], ...common] }));
  c.send('s', httpResponse({ headers: srvh('text/css'), body: 'body { font-family: sans-serif; margin: 0 }\nh1 { color: #2a6; }\np { line-height: 1.5 }\n' }));
  cap.wait(0.01);
  c.send('c', httpRequest({ path: '/logo.png', host: 'intranet.local', headers: [['Accept', 'image/avif,image/webp,image/png,*/*'], ['Referer', 'http://intranet.local/'], ...common] }));
  c.send('s', httpResponse({ headers: srvh('image/png'), body: pngBytes(r, 2600) }));
  cap.wait(0.01);
  c.send('c', httpRequest({ path: '/app.js', host: 'intranet.local', headers: [['Accept', '*/*'], ...common] }));
  c.send('s', httpResponse({ code: 404, headers: srvh('text/html'), body: '<html><body><h1>404 Not Found</h1></body></html>\n' }));
  cap.wait(0.2);
  c.send('c', httpRequest({ path: '/api/status?full=1', host: 'intranet.local', headers: [['Accept', 'application/json'], ['Cookie', 'session=7f3a9c2e; theme=dark'], ...common] }));
  const json = JSON.stringify({ status: 'ok', uptime: 123456, users: [{ name: 'kim', online: true }, { name: 'lee', online: false }], load: [0.12, 0.3, 0.25] });
  c.send('s', httpResponse({ headers: srvh('application/json'), body: json, chunked: 64 }));
  cap.wait(0.1);
  c.send('c', httpRequest({ method: 'POST', path: '/login', host: 'intranet.local', headers: [['Content-Type', 'application/x-www-form-urlencoded'], ...common], body: 'user=kim&pass=secret' }));
  c.send('s', httpResponse({ code: 302, headers: [['Location', '/home'], ['Set-Cookie', 'session=9b1d; HttpOnly'], ['Server', 'nginx/1.24.0']], body: '' }));
  cap.wait(1);
  c.close('c');
  return cap.file('http-page-load.pcapng');
}

function ftpSession() {
  const cap = new Capture(T0 + 60);
  const r = rng(202);
  const ctl = new TcpConversation(cap, { ...PC, port: 50122 }, { ...SRV, port: 21 }, { rtt: 0.002 });
  ctl.handshake();
  const S = (s) => ctl.send('s', s + CRLF);
  const C = (s) => { cap.wait(0.3); ctl.send('c', s + CRLF); };
  S('220 (vsFTPd 3.0.5)');
  C('USER alice'); S('331 Please specify the password.');
  C('PASS wonderland'); S('230 Login successful.');
  C('SYST'); S('215 UNIX Type: L8');
  C('PWD'); S('257 "/home/alice" is the current directory');
  C('TYPE I'); S('200 Switching to Binary mode.');
  C('PASV'); S('227 Entering Passive Mode (192,168,0,20,156,64).');
  C('RETR report.txt'); S('150 Opening BINARY mode data connection for report.txt (3000 bytes).');
  const data = new TcpConversation(cap, { ...PC, port: 50124 }, { ...SRV, port: 40000 }, { rtt: 0.002 });
  data.handshake();
  data.send('s', filler(r, 3000, 'abcdefghij klmnop\n'));
  data.close('s');
  S('226 Transfer complete.');
  C('QUIT'); S('221 Goodbye.');
  ctl.close('s');
  return cap.file('ftp-session.pcapng');
}

function smtpMail() {
  const cap = new Capture(T0 + 120);
  const MX = { mac: '00:1a:a0:01:02:04', ip: '192.168.0.25' };
  const c = new TcpConversation(cap, { ...PC, port: 50200 }, { ...MX, port: 25 }, { rtt: 0.003 });
  c.handshake();
  const S = (s) => c.send('s', s);
  const C = (s) => { cap.wait(0.05); c.send('c', s); };
  S('220 mail.example.local ESMTP Postfix\r\n');
  C('EHLO pc10.example.local\r\n');
  S('250-mail.example.local\r\n250-PIPELINING\r\n250-SIZE 10240000\r\n250-8BITMIME\r\n250 SMTPUTF8\r\n');
  C('MAIL FROM:<kim@example.local>\r\n'); S('250 2.1.0 Ok\r\n');
  C('RCPT TO:<lee@example.local>\r\n'); S('250 2.1.5 Ok\r\n');
  C('DATA\r\n'); S('354 End data with <CR><LF>.<CR><LF>\r\n');
  C('From: Kim <kim@example.local>\r\nTo: Lee <lee@example.local>\r\nSubject: Weekly report\r\nDate: Tue, 18 Nov 2025 17:02:00 +0900\r\nMessage-ID: <20251118.1@example.local>\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nHi Lee,\r\n\r\nThe weekly report is attached to the shared folder.\r\n\r\nKim\r\n.\r\n');
  S('250 2.0.0 Ok: queued as 4F2A11C0E3\r\n');
  C('QUIT\r\n'); S('221 2.0.0 Bye\r\n');
  c.close('s');
  return cap.file('smtp-mail.pcapng');
}

function wsHttp2() {
  const cap = new Capture(T0 + 180);
  const ws = new TcpConversation(cap, { ...PC, port: 50300 }, { ...SRV, port: 8080 }, { rtt: 0.003 });
  ws.handshake();
  ws.send('c', httpRequest({ path: '/chat', host: 'intranet.local:8080', headers: [['Upgrade', 'websocket'], ['Connection', 'Upgrade'], ['Sec-WebSocket-Key', 'dGhlIHNhbXBsZSBub25jZQ=='], ['Sec-WebSocket-Version', '13'], ['Origin', 'http://intranet.local']] }));
  ws.send('s', httpResponse({ code: 101, headers: [['Upgrade', 'websocket'], ['Connection', 'Upgrade'], ['Sec-WebSocket-Accept', 's3pPLMBiTxaQ9kYGzzhZRbK+xOo=']] }));
  ws.send('c', wsFrame({ payload: '{"type":"join","room":"general"}', mask: [0x37, 0xfa, 0x21, 0x3d] }));
  ws.send('s', wsFrame({ payload: '{"type":"welcome","users":3}' }));
  cap.wait(0.5);
  ws.send('c', wsFrame({ opcode: 9, payload: 'ping', mask: [1, 2, 3, 4] }));
  ws.send('s', wsFrame({ opcode: 10, payload: 'ping' }));
  ws.send('c', wsFrame({ opcode: 8, payload: bytes(be16(1000), te('bye')), mask: [9, 8, 7, 6] }));
  ws.send('s', wsFrame({ opcode: 8, payload: be16(1000) }));
  ws.close('s');
  // h2c with prior knowledge
  const h2 = new TcpConversation(cap, { ...PC, port: 50302 }, { ...SRV, port: 8080 }, { rtt: 0.003 });
  h2.handshake();
  h2.send('c', bytes(H2_PREFACE, h2Settings([[3, 100], [4, 6291456]]), h2Frame(8, 0, 0, be32(15663105))));
  h2.send('s', bytes(h2Settings([[3, 128], [4, 65536], [5, 16384]]), h2Settings([], true)));
  h2.send('c', bytes(h2Settings([], true), h2Frame(1, 0x05, 1, hpack([[':method', 'GET'], [':scheme', 'http'], [':path', '/'], [':authority', 'intranet.local:8080'], ['user-agent', 'curl/8.5.0'], ['accept', '*/*']]))));
  const body = te('<html><body>Hello over HTTP/2</body></html>\n');
  h2.send('s', bytes(h2Frame(1, 0x04, 1, hpack([[':status', '200'], ['content-type', 'text/html'], ['content-length', String(body.length)], ['server', 'h2o/2.2']])), h2Frame(0, 0x01, 1, body)));
  h2.send('c', h2Frame(7, 0, 0, bytes(be32(0), be32(0))));
  h2.close('c');
  return cap.file('websocket-http2.pcapng');
}

function sshSession() {
  const cap = new Capture(T0 + 240);
  const r = rng(303);
  const c = new TcpConversation(cap, { ...PC, port: 50400 }, { ...SRV, port: 22 }, { rtt: 0.002 });
  c.handshake();
  c.send('c', 'SSH-2.0-OpenSSH_9.6\r\n');
  c.send('s', 'SSH-2.0-OpenSSH_8.9p1 Ubuntu-3ubuntu0.10\r\n');
  c.send('c', sshKexInit(r, false));
  c.send('s', sshKexInit(r, true));
  c.send('c', sshPacket(bytes(Uint8Array.of(30), be32(32), r.bytes(32)), r));
  const hostKey = bytes(sshString('ssh-ed25519'), be32(32), r.bytes(32));
  const sig = bytes(sshString('ssh-ed25519'), be32(64), r.bytes(64));
  c.send('s', bytes(sshPacket(bytes(Uint8Array.of(31), be32(hostKey.length), hostKey, be32(32), r.bytes(32), be32(sig.length), sig), r), sshPacket(Uint8Array.of(21), r)));
  c.send('c', sshPacket(Uint8Array.of(21), r));
  for (let i = 0; i < 6; i++) {
    cap.wait(0.2);
    c.send(i % 2 ? 's' : 'c', bytes(be32(r.int(40, 120) & ~7), r.bytes(r.int(60, 140))));
  }
  c.close('c');
  return cap.file('ssh-session.pcapng');
}

/** Browser-like SSDP chatter for name-service style samples. */
export function ssdpFrames(cap, host = PC) {
  cap.add(udpFrame({ srcMac: host.mac, dstMac: '01:00:5e:7f:ff:fa', src: host.ip, dst: '239.255.255.250', sport: 54012, dport: 1900, ttl: 4 }, ssdpSearch()));
  cap.add(udpFrame({ srcMac: GW.mac, dstMac: host.mac, src: '192.168.0.1', dst: host.ip, sport: 1900, dport: 54012 }, ssdpResponse()), { dt: 0.02 });
  cap.add(udpFrame({ srcMac: GW.mac, dstMac: '01:00:5e:7f:ff:fa', src: '192.168.0.1', dst: '239.255.255.250', sport: 1900, dport: 1900, ttl: 4 }, ssdpNotify()), { dt: 0.5 });
}

export const samples = [
  { id: 'http-page-load', group: 'web', icon: 'globe', ko: ['HTTP 페이지 로드', 'HTML·CSS·PNG·JSON을 keep-alive 연결 하나로 받는 웹 페이지 (여러 세그먼트 응답, chunked 응답 포함)'], en: ['HTTP page load', 'A web page with HTML, CSS, PNG and JSON over one keep-alive connection (multi-segment and chunked responses)'], build: httpPageLoad },
  { id: 'ftp-session', group: 'basics', icon: 'folder', ko: ['FTP 세션', '로그인, 패시브 모드, 파일 다운로드가 있는 FTP 제어·데이터 연결'], en: ['FTP session', 'FTP control and data connections: login, passive mode and a file download'], build: ftpSession },
  { id: 'smtp-mail', group: 'web', icon: 'mail', ko: ['SMTP 메일 전송', 'EHLO부터 QUIT까지 한 통의 메일을 보내는 SMTP 대화'], en: ['SMTP mail', 'An SMTP dialogue sending one message, from EHLO to QUIT'], build: smtpMail },
  { id: 'websocket-http2', group: 'web', icon: 'plug', ko: ['WebSocket과 HTTP/2', 'WebSocket 업그레이드와 메시지, 평문 HTTP/2(h2c) 요청'], en: ['WebSocket and HTTP/2', 'A WebSocket upgrade with messages and a cleartext HTTP/2 (h2c) request'], build: wsHttp2 },
  { id: 'ssh-session', group: 'basics', icon: 'terminal', ko: ['SSH 로그인', 'SSH 버전 교환, 키 교환(KEXINIT, ECDH) 후 암호화된 세션'], en: ['SSH login', 'SSH version exchange, key exchange (KEXINIT, ECDH) and the encrypted session'], build: sshSession },
];
