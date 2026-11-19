// TCP-centred sample captures: handshake/teardown, retransmissions and dup ACKs, zero window.
import { Capture, TcpConversation, TCP, tcpFrame, te, rng } from '../packet.js';
import { httpRequest, httpResponse } from './web.js';

const CLIENT = { mac: 'a4:83:e7:12:34:56', ip: '192.168.0.23' };
const LAPTOP = { mac: '3c:22:fb:4e:91:07', ip: '192.168.0.31' };
const SERVER = { mac: '00:11:32:5a:0c:21', ip: '192.168.0.10' };          // NAS on the LAN
const GW = { mac: '00:1a:a0:01:02:03' };                                   // traffic to the internet leaves via the router
const WEB = { ip: '93.184.215.14' };

function filler(n, seed) {
  const r = rng(seed);
  const words = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel', 'india', 'juliet'];
  let s = '';
  while (s.length < n) s += r.pick(words) + (r() < 0.1 ? '\n' : ' ');
  return te(s.slice(0, n));
}

/** Handshake, a short request/response, orderly FIN close, a refused port and a reused port pair. */
function tcpHandshake() {
  const cap = new Capture(1763452800.120);
  const c = new TcpConversation(cap, { ...CLIENT, port: 51544, isn: 0x2f1c7a10 }, { mac: GW.mac, ip: WEB.ip, port: 80, isn: 0x9b51e2a3 }, { rtt: 0.024 });
  c.c.mac = CLIENT.mac; c.s.mac = GW.mac;
  c.handshake();
  cap.wait(0.002);
  c.send('c', httpRequest({ method: 'GET', host: 'example.com', path: '/', headers: [['User-Agent', 'Mozilla/5.0'], ['Accept', '*/*']] }));
  cap.wait(0.004);
  c.send('s', httpResponse({ code: 200, headers: [['Content-Type', 'text/html; charset=UTF-8'], ['Server', 'ECAcc']], body: te('<!doctype html><html><head><title>Example Domain</title></head><body><h1>Example Domain</h1></body></html>\n') }));
  cap.wait(0.05);
  c.close('c');
  // Connection refused: SYN answered by RST/ACK.
  cap.wait(0.3);
  const r = new TcpConversation(cap, { ...CLIENT, port: 51546, isn: 0x55aa0001 }, { ...SERVER, port: 8081 }, { rtt: 0.0008 });
  r.emit('c', TCP.SYN, null, { options: { mss: 1460, sackPerm: true, ws: 8 } });
  cap.wait(0.0004);
  cap.add(tcpFrame({ srcMac: SERVER.mac, dstMac: CLIENT.mac, src: SERVER.ip, dst: CLIENT.ip, sport: 8081, dport: 51546, seq: 0, ack: 0x55aa0002, flags: TCP.RST | TCP.ACK, win: 0 }));
  // The client reuses the same source port after the first connection closed.
  cap.wait(1.2);
  const again = new TcpConversation(cap, { ...CLIENT, port: 51544, isn: 0x7c0ffee1 }, { mac: GW.mac, ip: WEB.ip, port: 80, isn: 0x1f2e3d4c }, { rtt: 0.023 });
  again.c.mac = CLIENT.mac; again.s.mac = GW.mac;
  again.handshake();
  cap.wait(0.01);
  again.send('c', httpRequest({ method: 'GET', host: 'example.com', path: '/favicon.ico' }));
  cap.wait(0.004);
  again.send('s', httpResponse({ code: 404, reason: 'Not Found', headers: [['Content-Type', 'text/plain']], body: te('not found\n') }));
  cap.wait(0.02);
  again.reset('c');
  return cap.file('tcp-3-way-handshake.pcapng');
}

/** Bulk transfer with a lost segment (dup ACKs + fast retransmission), an RTO retransmission, out-of-order and a spurious retransmission. */
function tcpRetransmissions() {
  const cap = new Capture(1763453100.5);
  // The capture starts in the middle of a transfer: the first segment acknowledges data we never saw.
  const mid = new TcpConversation(cap, { ...LAPTOP, port: 50112, isn: 0x10000000 }, { ...SERVER, port: 9000, isn: 0x20000000 }, { rtt: 0.002 });
  mid.scaled = true;
  mid.c.ack = (mid.s.seq + 5000) >>> 0;
  mid.s.seq = (mid.s.seq + 5000) >>> 0;
  mid.c.seq = (mid.c.seq + 120000) >>> 0;
  mid.s.ack = mid.c.seq;
  mid.send('c', filler(2920, 1));
  cap.wait(0.01);
  // Fresh connection to the file server.
  const c = new TcpConversation(cap, { ...CLIENT, port: 50210, isn: 0x3a000000 }, { ...SERVER, port: 9000, isn: 0x4b000000 }, { rtt: 0.0012 });
  c.handshake();
  cap.wait(0.001);
  c.send('c', te('GET /backup/2025-11-17.tar HTTP-ish\r\n'), { push: true });
  cap.wait(0.002);
  // 1) Loss with three duplicate ACKs -> fast retransmission
  c.send('s', filler(1460 * 6, 2), { lose: [1], dupAcks: 3 });
  cap.wait(0.003);
  // 2) Loss without enough dup ACKs -> retransmission after the RTO
  c.send('s', filler(1460 * 3, 3), { lose: [0], dupAcks: 0, retransmitDelay: 0.21 });
  cap.wait(0.002);
  // 3) Out-of-order delivery: segment 2 arrives after segment 3
  c.send('s', filler(1460 * 4, 4), { outOfOrder: [1] });
  cap.wait(0.002);
  // 4) Spurious retransmission: data resent after it was already acknowledged
  c.send('s', filler(700, 5), { retransmit: true });
  cap.wait(0.01);
  c.close('s');
  return cap.file('tcp-retransmissions.pcapng');
}

/** A slow reader: window full, zero window, zero-window probes, window update; plus keep-alives. */
function zeroWindow() {
  const cap = new Capture(1763453400.25);
  const c = new TcpConversation(cap, { ...CLIENT, port: 50800, isn: 0x61000000, ws: 0, win: 8192 }, { ...SERVER, port: 9000, isn: 0x72000000, ws: 0, win: 65535 }, { rtt: 0.001 });
  c.handshake();
  cap.wait(0.001);
  c.send('c', te('READ /media/movie.mkv\r\n'));
  const s = c.s, cl = c.c;
  const seg = (len, extra = {}) => {
    const data = filler(len, s.seq & 0xffff);
    c.emit('s', TCP.ACK | (extra.push ? TCP.PSH : 0), data, { seq: s.seq, win: 65535 });
    s.seq = (s.seq + len) >>> 0;
  };
  const ack = (win) => { cl.ack = s.seq; c.emit('c', TCP.ACK, null, { win }); };
  // The client advertises 8192 bytes; the server fills it completely.
  cap.wait(0.002); seg(1460); cap.wait(0.0002); seg(1460); cap.wait(0.0002); seg(1460);
  cap.wait(0.0002); seg(1460); cap.wait(0.0002); seg(1460); cap.wait(0.0002); seg(892, { push: true });
  // Receiver application is not reading: ACK with a shrinking, then zero window.
  cap.wait(0.001); ack(0);
  // Zero window probes from the sender (1 byte at the next sequence number), answered with zero window.
  for (let i = 0; i < 3; i++) {
    cap.wait(0.2 * 2 ** i);
    c.emit('s', TCP.ACK, filler(1, 99), { seq: s.seq, win: 65535 });
    cap.wait(0.0005);
    c.emit('c', TCP.ACK, null, { win: 0 });
  }
  // The reader catches up: window update, then the transfer continues.
  cap.wait(0.4); c.emit('c', TCP.ACK, null, { win: 8192 });
  cap.wait(0.001); seg(1460); cap.wait(0.0002); seg(1460, { push: true });
  cap.wait(0.001); ack(8192);
  // Idle connection kept open with keep-alives.
  for (let i = 0; i < 2; i++) {
    cap.wait(45);
    c.emit('c', TCP.ACK, null, { seq: (cl.seq - 1) >>> 0, win: 8192 });
    cap.wait(0.0006);
    c.emit('s', TCP.ACK, null, { win: 65535 });
  }
  cap.wait(5);
  c.close('c');
  return cap.file('tcp-zero-window.pcapng');
}

export const samples = [
  { id: 'tcp-3-way-handshake', group: 'basics', icon: 'handshake',
    ko: ['TCP 3-way 핸드셰이크', 'SYN, SYN/ACK, ACK로 연결하고 FIN으로 닫는 과정, 거부된 연결(RST)과 포트 재사용'],
    en: ['TCP 3-way handshake', 'SYN, SYN/ACK, ACK to connect, FIN to close, a refused connection (RST) and a reused port pair'],
    build: tcpHandshake },
  { id: 'tcp-retransmissions', group: 'troubleshooting', icon: 'warning',
    ko: ['TCP 재전송과 중복 ACK', '손실된 세그먼트, 중복 ACK, 빠른 재전송, RTO 재전송, 순서 바뀜, 불필요한 재전송'],
    en: ['TCP retransmissions and dup ACKs', 'A lost segment, duplicate ACKs, fast and RTO retransmissions, out-of-order and spurious retransmissions'],
    build: tcpRetransmissions },
  { id: 'tcp-zero-window', group: 'troubleshooting', icon: 'pause',
    ko: ['제로 윈도', '받는 쪽이 느려 창이 가득 차고 0이 되는 상황, 제로 윈도 탐색, 창 갱신, Keep-Alive'],
    en: ['Zero window', 'A slow reader fills the window to zero: window full, zero-window probes, window update and keep-alives'],
    build: zeroWindow },
];
