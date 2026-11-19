// Dissection engine, link/IP/ICMP/ARP/TCP/UDP, TCP sequence analysis and performance.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../../src/domain/capture/synth.js';
import { createSession, dissect, FIELDS, PROTOCOLS, fieldInfo } from '../../src/domain/dissect/index.js';

const A = { mac: 'a4:83:e7:12:34:56', ip: '192.168.0.23' };
const B = { mac: '00:11:32:5a:0c:21', ip: '192.168.0.10' };

function frames(datas, linktype = 1, t0 = 1700000000) {
  return datas.map((data, i) => ({ no: i + 1, sec: t0 + i, nsec: 0, caplen: data.length, len: data.length, data, linktype, iface: 0, comment: null }));
}
function run(fs, prefs) {
  const s = createSession({ format: 'pcapng', interfaces: [{ name: 'eth0', linktype: fs[0].linktype }], frames: fs, section: {} }, prefs);
  const early = fs.map((f) => s.firstPass(f));
  // columns as the packet list shows them once the whole file has been read
  const sums = fs.map((f) => s.summarize(f));
  sums.early = early;
  const ds = fs.map((f) => dissect(s, f));
  return { s, sums, ds };
}
const v = (d, f, i = 0) => d.fields.get(f)?.[i]?.value;
const all = (d, f) => (d.fields.get(f) || []).map((n) => n.value);
const proto = (d) => d.layers.slice(1).join(':');

test('registry: FIELDS and PROTOCOLS follow the contract', () => {
  assert.ok(FIELDS.size > 2000, `fields: ${FIELDS.size}`);
  for (const [k, f] of FIELDS) {
    assert.equal(k, f.abbrev);
    assert.ok(['none', 'protocol', 'bool', 'uint', 'int', 'uint64', 'int64', 'float', 'double', 'string', 'bytes', 'ether', 'ipv4', 'ipv6', 'abs_time', 'rel_time', 'framenum', 'guid', 'oid', 'char'].includes(f.type), `${k}: ${f.type}`);
  }
  for (const p of PROTOCOLS) assert.equal(FIELDS.get(p.abbrev).type, 'protocol');
  for (const a of ['tcp.flags.syn', 'ip.addr', 'tcp.port', 'udp.port', 'eth.addr', 'ip.src_host', 'tcp.analysis.retransmission', 'tcp.stream',
    'http.request.method', 'dns.qry.name', 'tls.handshake.extensions_server_name', 'ipv6.addr', 'frame.time_delta', 'frame.protocols']) {
    assert.ok(fieldInfo(a), a);
  }
});

test('frame, Ethernet, IPv4, UDP: tree, hidden both-direction fields, columns, summary', () => {
  const data = S.udpFrame({ srcMac: A.mac, dstMac: B.mac, src: A.ip, dst: B.ip, sport: 40000, dport: 9999 }, new Uint8Array(10));
  const { sums, ds } = run(frames([data, data]));
  const d = ds[0];
  assert.equal(d.tree[0].abbrev, 'frame');
  assert.equal(proto(d), 'eth:ethertype:ip:udp:data');
  assert.equal(v(d, 'frame.protocols'), 'eth:ethertype:ip:udp:data');
  assert.deepEqual(all(d, 'ip.addr'), [A.ip, B.ip]);
  assert.deepEqual(all(d, 'udp.port'), [40000, 9999]);
  assert.deepEqual(all(d, 'eth.addr'), [B.mac, A.mac]);
  assert.ok(d.fields.get('ip.addr')[0].hidden);
  assert.equal(d.columns.src, A.ip);
  assert.equal(d.columns.hwSrc, A.mac);
  assert.equal(d.columns.info, '40000 → 9999 Len=10');
  assert.equal(sums[0].layers, 'eth:ethertype:ip:udp:data');
  assert.equal(sums[0].udpStream, 0);
  assert.equal(sums[0].srcport, 40000);
  assert.equal(v(ds[1], 'frame.time_delta'), 1);
  assert.equal(v(ds[1], 'frame.time_relative'), 1);
  assert.equal(v(ds[1], 'udp.stream.pnum'), 2);
  assert.match(d.tree[1].label, /^Ethernet II, Src: Apple_12:34:56 \(a4:83:e7:12:34:56\), Dst: /);
  assert.equal(d.sources[0].data, data);
});

test('name resolution preferences change labels and columns, not values', () => {
  const data = S.arp({ op: 1, srcMac: A.mac, srcIp: A.ip, dstIp: B.ip });
  const on = run(frames([data])).ds[0];
  const off = run(frames([data]), { resolve: { mac: false, transport: false } }).ds[0];
  assert.equal(on.columns.src, 'Apple_12:34:56');
  assert.equal(on.columns.dst, 'Broadcast');
  assert.equal(off.columns.src, A.mac);
  assert.equal(v(on, 'eth.src'), A.mac);
  assert.equal(v(on, 'eth.src_resolved'), 'Apple_12:34:56');
  const tcp = S.tcpFrame({ srcMac: A.mac, dstMac: B.mac, src: A.ip, dst: B.ip, sport: 50000, dport: 443, seq: 1, flags: S.TCP.SYN });
  const t1 = run(frames([tcp])).ds[0], t2 = run(frames([tcp]), { resolve: { transport: false } }).ds[0];
  assert.equal(t1.fields.get('tcp.dstport')[0].label, 'Destination Port: https (443)');
  assert.equal(t2.fields.get('tcp.dstport')[0].label, 'Destination Port: 443');
  assert.equal(t1.columns.info, t2.columns.info);
});

test('ARP: request, reply, gratuitous, probe, announcement, duplicate address', () => {
  const fs = frames([
    S.arp({ op: 1, srcMac: A.mac, srcIp: A.ip, dstIp: '192.168.0.1' }),
    S.arp({ op: 2, srcMac: B.mac, srcIp: '192.168.0.1', dstMac: A.mac, dstIp: A.ip }),
    S.arp({ op: 1, srcMac: A.mac, srcIp: '0.0.0.0', dstIp: '192.168.0.99' }),
    S.arp({ op: 1, srcMac: A.mac, srcIp: '192.168.0.99', dstIp: '192.168.0.99' }),
    S.arp({ op: 2, srcMac: '00:00:5e:00:01:01', srcIp: '192.168.0.1', dstMac: A.mac, dstIp: A.ip }),
  ]);
  const { ds, sums } = run(fs);
  assert.equal(sums[0].info, 'Who has 192.168.0.1? Tell 192.168.0.23');
  assert.equal(sums[1].info, '192.168.0.1 is at 00:11:32:5a:0c:21');
  assert.equal(sums[2].info, 'Who has 192.168.0.99? (ARP Probe)');
  assert.equal(sums[3].info, 'ARP Announcement for 192.168.0.99');
  assert.equal(v(ds[3], 'arp.isannouncement'), true);
  // a plain reply from a second MAC: flagged in the tree and expert info (Wireshark adds no Info note here)
  assert.equal(v(ds[4], 'arp.duplicate-address-frame'), 2);
  assert.equal(sums[4].expert, 'warn');
});

test('ICMP: echo request/response matching, response time, unreachable with the quoted datagram', () => {
  const ping = (type, from, to, ttl) => S.icmpFrame({ srcMac: from.mac, dstMac: to.mac, src: from.ip, dst: to.ip, ttl }, type, 0, S.bytes(S.be16(1), S.be16(1)), new Uint8Array(32));
  const probe = S.udpFrame({ srcMac: A.mac, dstMac: B.mac, src: A.ip, dst: B.ip, sport: 33434, dport: 33435 }, new Uint8Array(12));
  const ipPart = probe.subarray(14, 14 + 28);
  const unreach = S.icmpFrame({ srcMac: B.mac, dstMac: A.mac, src: B.ip, dst: A.ip }, 3, 3, new Uint8Array(4), ipPart);
  const { ds, sums } = run(frames([ping(8, A, B), ping(0, B, A, 63), probe, unreach]));
  assert.equal(sums[0].info, 'Echo (ping) request  id=0x0001, seq=1/256, ttl=64 (reply in 2)');
  assert.equal(sums.early[0].info, 'Echo (ping) request  id=0x0001, seq=1/256, ttl=64 (no response found!)');
  assert.equal(sums[1].info, 'Echo (ping) reply    id=0x0001, seq=1/256, ttl=63 (request in 1)');
  assert.equal(v(ds[1], 'icmp.resp_to'), 1);
  assert.equal(v(ds[1], 'icmp.resptime'), 1000);
  assert.equal(sums[3].info, 'Destination unreachable (Port unreachable)');
  assert.equal(proto(ds[3]), 'eth:ethertype:ip:icmp:ip:udp');
  assert.equal(ds[3].columns.src, B.ip);                   // the quoted header does not change columns
  assert.deepEqual(all(ds[3], 'udp.stream'), [0]);          // ...but belongs to the probe's conversation
  assert.equal(sums[3].udpStream, undefined);
  assert.equal(v(ds[3], 'icmp.checksum.status'), 1);
});

test('IPv4 options and fragment reassembly; IPv6 extension headers and fragments', () => {
  const payload = S.udp({ sport: 5000, dport: 5001, src: A.ip, dst: B.ip }, new Uint8Array(2000).fill(7));
  const f1 = S.ipv4({ src: A.ip, dst: B.ip, proto: 17, id: 0x4242, mf: true, fragOffset: 0 }, payload.subarray(0, 1480));
  const f2 = S.ipv4({ src: A.ip, dst: B.ip, proto: 17, id: 0x4242, fragOffset: 1480 }, payload.subarray(1480));
  const ra = S.ipv4({ src: A.ip, dst: '224.0.0.22', proto: 2, ipOptions: Uint8Array.of(148, 4, 0, 0) }, Uint8Array.of(0x16, 0, 0xfa, 0xfd, 239, 1, 1, 1));
  const eth = (p, type = 0x0800) => S.pad60(S.ether(A.mac, B.mac, type, p));
  const v6a = 'fe80::1', v6b = 'fe80::2';
  const u6 = S.udp({ sport: 6000, dport: 6001, src: v6a, dst: v6b }, new Uint8Array(1500).fill(9));
  const frag6 = (off, more, data) => S.bytes(Uint8Array.of(17, 0), S.be16(off | (more ? 1 : 0)), S.be32(0xabcdef), data);
  const g1 = S.ipv6({ src: v6a, dst: v6b, nxt: 44 }, frag6(0, true, u6.subarray(0, 1232)));
  const g2 = S.ipv6({ src: v6a, dst: v6b, nxt: 44 }, frag6(1232, false, u6.subarray(1232)));
  const hop = S.ipv6({ src: v6a, dst: 'ff02::16', nxt: 0 }, S.bytes(Uint8Array.of(58, 0, 5, 2, 0, 0, 1, 0), S.icmpv6(v6a, 'ff02::16', 143, 0, new Uint8Array(4))));
  const { ds, sums } = run(frames([eth(f1), eth(f2), eth(ra), eth(g1, 0x86dd), eth(g2, 0x86dd), eth(hop, 0x86dd)]));
  assert.equal(sums[0].info, 'Fragmented IP protocol (proto=UDP 17, off=0, ID=4242) [Reassembled in #2]');
  assert.equal(proto(ds[0]), 'eth:ethertype:ip:data');
  assert.equal(proto(ds[1]), 'eth:ethertype:ip:udp:data');
  assert.equal(v(ds[1], 'ip.reassembled.length'), payload.length);
  assert.equal(ds[1].sources.length, 2);
  assert.equal(v(ds[1], 'udp.length'), payload.length);
  assert.equal(v(ds[2], 'ip.opt.ra'), 0);
  assert.equal(proto(ds[2]), 'eth:ethertype:ip:igmp:igmp');   // Wireshark lists IGMP twice (version sub-dissector)
  assert.match(sums[3].info, /^IPv6 fragment \(off=0 more=y ident=0x00abcdef nxt=17\) \[Reassembled in #5\]$/);
  assert.equal(proto(ds[4]), 'eth:ethertype:ipv6:ipv6.fraghdr:udp:data');
  assert.equal(proto(ds[5]), 'eth:ethertype:ipv6:ipv6.hopopts:icmpv6');
  assert.equal(v(ds[5], 'ipv6.opt.router_alert'), 0);
});

test('link types: Linux SLL / SLL2, NULL, raw IP, 802.1Q / QinQ, 802.3 + LLC', () => {
  const ipPkt = S.ipv4({ src: A.ip, dst: B.ip, proto: 17 }, S.udp({ sport: 1, dport: 2, src: A.ip, dst: B.ip }, new Uint8Array(4)));
  const sll = S.bytes(S.be16(0), S.be16(1), S.be16(6), S.macBytes(A.mac), Uint8Array.of(0, 0), S.be16(0x0800), ipPkt);
  const sll2 = S.bytes(S.be16(0x0800), S.be16(0), S.be32(2), S.be16(1), Uint8Array.of(4, 6), S.macBytes(A.mac), Uint8Array.of(0, 0), ipPkt);
  const nul = S.bytes(S.le32(2), ipPkt);
  const r1 = run(frames([sll], 113)).ds[0];
  const r2 = run(frames([sll2], 276)).ds[0];
  const r3 = run(frames([nul], 0)).ds[0];
  const r4 = run(frames([ipPkt], 101)).ds[0];
  const r5 = run(frames([ipPkt], 228)).ds[0];
  assert.equal(proto(r1), 'sll:ethertype:ip:udp:data');
  assert.equal(v(r1, 'sll.src.eth'), A.mac);
  assert.equal(proto(r2), 'sll:ethertype:ip:udp:data');
  assert.equal(v(r2, 'sll.ifindex'), 2);
  assert.equal(proto(r3), 'null:ip:udp:data');
  assert.equal(proto(r4), 'raw:ip:udp:data');
  assert.equal(proto(r5), 'ip:udp:data');
  const q = S.ether(A.mac, B.mac, 0x88a8, S.bytes(S.vlanTag(100, 0x8100), S.vlanTag(20, 0x0800, 5), ipPkt));
  const dq = run(frames([q])).ds[0];
  assert.equal(proto(dq), 'eth:ethertype:ieee8021ad:ethertype:vlan:ethertype:ip:udp:data');
  assert.equal(v(dq, 'vlan.id'), 20);
  assert.equal(v(dq, 'vlan.priority'), 5);
  const llc = S.pad60(S.ether(A.mac, '01:80:c2:00:00:00', 38, S.bytes(Uint8Array.of(0x42, 0x42, 0x03), new Uint8Array(35))));
  const dl = run(frames([llc])).ds[0];
  assert.equal(dl.layers[2], 'llc');
  assert.equal(v(dl, 'eth.len'), 38);
});

test('decode as, disabled protocols, malformed and short frames', () => {
  const dnsLike = S.udpFrame({ srcMac: A.mac, dstMac: B.mac, src: A.ip, dst: B.ip, sport: 40000, dport: 5300 }, S.hex('1a2b01000001000000000000076578616d706c6503636f6d0000010001'));
  assert.equal(proto(run(frames([dnsLike])).ds[0]), 'eth:ethertype:ip:udp:data');
  const da = run(frames([dnsLike]), { decodeAs: [{ table: 'udp.port', value: '5300', proto: 'dns' }] });
  assert.equal(proto(da.ds[0]), 'eth:ethertype:ip:udp:dns');
  assert.equal(da.sums[0].info, 'Standard query 0x1a2b A example.com');
  const real = S.udpFrame({ srcMac: A.mac, dstMac: B.mac, src: A.ip, dst: B.ip, sport: 40000, dport: 53 }, S.hex('1a2b01000001000000000000076578616d706c6503636f6d0000010001'));
  assert.equal(proto(run(frames([real]), { disabled: ['dns'] }).ds[0]), 'eth:ethertype:ip:udp:data');
  assert.equal(proto(run(frames([real]), { decodeAs: [{ table: 'udp.port', key: 53, proto: null }] }).ds[0]), 'eth:ethertype:ip:udp:data');
  // malformed: DNS question cut inside the name
  const bad = S.udpFrame({ srcMac: A.mac, dstMac: B.mac, src: A.ip, dst: B.ip, sport: 40000, dport: 53 }, S.hex('1a2b0100000100000000000007657861'));
  const m = run(frames([bad]));
  assert.ok(m.ds[0].fields.has('_ws.malformed'));
  assert.ok(m.sums[0].info.endsWith('[Malformed Packet]'));
  assert.equal(m.sums[0].expert, 'error');
  assert.equal(m.ds[0].layers.at(-1), 'dns');
  // short frame: captured 40 of 74 bytes
  const full = S.tcpFrame({ srcMac: A.mac, dstMac: B.mac, src: A.ip, dst: B.ip, sport: 1, dport: 2, seq: 0, flags: S.TCP.SYN, options: { mss: 1460, sackPerm: true, ts: [1, 0], ws: 7 } });
  const fr = { no: 1, sec: 0, nsec: 0, caplen: 40, len: full.length, data: full.subarray(0, 40), linktype: 1, iface: 0, comment: null };
  const sh = run([fr]);
  assert.ok(sh.ds[0].fields.has('_ws.short'));
  assert.match(sh.sums[0].info, /\[Packet size limited during capture\]$/);
  assert.deepEqual(sh.s.bugs, []);
});

test('packet comments become frame.comment and comment expert items', () => {
  const data = S.arp({ op: 1, srcMac: A.mac, srcIp: A.ip, dstIp: B.ip });
  const fs = frames([data]);
  fs[0].comment = 'check this';
  const { ds } = run(fs);
  assert.equal(v(ds[0], 'frame.comment'), 'check this');
  assert.ok(ds[0].expert.some((e) => e.abbrev === 'frame.comment.expert'));
  assert.equal(ds[0].tree[0].label, 'Packet comments');
});

// --- TCP analysis ----------------------------------------------------------------------------
function conv(opts = {}) {
  const cap = new S.Capture(1700000000);
  const c = new S.TcpConversation(cap, { ...A, port: 50000, isn: 1000 }, { ...B, port: 9000, isn: 5000 }, { rtt: 0.002, ...opts });
  return { cap, c };
}
function analyse(cap) {
  const { sums, ds } = run(cap.frames);
  return { sums, ds, info: sums.map((s) => s.info) };
}

test('TCP: handshake, relative numbers, stream, iRTT, window scaling, flags, completeness', () => {
  const { cap, c } = conv();
  c.handshake();
  c.send('c', 'hello');
  c.close();
  const { ds, info, sums } = analyse(cap);
  assert.equal(info[0], '50000 → 9000 [SYN] Seq=0 Win=64240 Len=0 MSS=1460 SACK_PERM WS=256');
  assert.equal(info[1], '9000 → 50000 [SYN, ACK] Seq=0 Ack=1 Win=65160 Len=0 MSS=1460 SACK_PERM WS=128');
  assert.equal(info[3], '50000 → 9000 [PSH, ACK] Seq=1 Ack=1 Win=64000 Len=5');
  assert.equal(v(ds[3], 'tcp.nxtseq'), 6);
  assert.equal(v(ds[3], 'tcp.seq_raw'), 1001);
  assert.equal(v(ds[3], 'tcp.window_size_scalefactor'), 256);
  assert.equal(v(ds[3], 'tcp.flags.push'), true);
  assert.equal(v(ds[3], 'tcp.flags.str'), '·······AP···');
  assert.equal(v(ds[4], 'tcp.analysis.acks_frame'), 4);
  assert.ok(Math.abs(v(ds[4], 'tcp.analysis.ack_rtt') - 0.001) < 1e-9);
  assert.ok(Math.abs(v(ds[1], 'tcp.analysis.initial_rtt') - 0.002) < 1e-9);    // two-pass view
  assert.equal(v(ds[0], 'tcp.completeness'), 31);
  assert.ok(sums.every((s) => s.tcpStream === 0));
  assert.ok(ds[0].expert.some((e) => e.abbrev === 'tcp.connection.syn' && e.message === 'Connection establish request (SYN): server port 9000'));
  assert.ok(ds[5].expert.some((e) => e.abbrev === 'tcp.connection.fin_active'));
  assert.ok(ds[6].expert.some((e) => e.abbrev === 'tcp.connection.fin_passive'));
});

test('TCP: lost segment, duplicate ACKs, fast retransmission, out-of-order, spurious retransmission, bytes in flight', () => {
  const { cap, c } = conv();
  c.handshake();
  c.send('s', new Uint8Array(1460 * 5), { lose: [1], dupAcks: 3 });
  c.send('s', new Uint8Array(1460 * 3), { outOfOrder: [1] });
  c.send('s', new Uint8Array(500), { retransmit: true });
  const { info, ds } = analyse(cap);
  const has = (re) => info.findIndex((i) => re.test(i));
  const lost = has(/^\[TCP Previous segment not captured\]/);
  assert.ok(lost > 0);
  assert.ok(has(/^\[TCP Dup ACK \d+#3\]/) > lost);
  const fast = has(/^\[TCP Fast Retransmission\]/);
  assert.ok(fast > lost);
  assert.ok(ds[fast].fields.has('tcp.analysis.retransmission'));
  assert.ok(ds[fast].fields.has('tcp.analysis.fast_retransmission'));
  assert.ok(has(/^\[TCP Out-Of-Order\]/) > fast);
  assert.ok(has(/^\[TCP Spurious Retransmission\]/) > fast);
  assert.equal(v(ds[3], 'tcp.analysis.bytes_in_flight'), 1460);
  assert.equal(v(ds[4], 'tcp.analysis.bytes_in_flight'), undefined);   // after a gap: not known
});

test('TCP: zero window, probes, window update, window full, keep-alive, RTO retransmission, ACKed unseen, reused ports', () => {
  const { cap, c } = conv();
  c.c.ws = 0; c.s.ws = 0; c.c.win = 3000;
  c.handshake();
  const s = c.s;
  const seg = (n) => { c.emit('s', S.TCP.ACK, new Uint8Array(n), { seq: s.seq, win: 65535 }); s.seq += n; };
  seg(1500); seg(1500);                                         // fills the 3000-byte window
  c.c.ack = s.seq; c.emit('c', S.TCP.ACK, null, { win: 0 }); // zero window
  cap.wait(0.2); c.emit('s', S.TCP.ACK, new Uint8Array(1), { seq: s.seq, win: 65535 });   // probe
  c.emit('c', S.TCP.ACK, null, { win: 0 });                  // probe ACK
  cap.wait(0.2); c.emit('c', S.TCP.ACK, null, { win: 3000 });   // window update
  cap.wait(10); c.emit('c', S.TCP.ACK, null, { seq: (c.c.seq - 1) >>> 0, win: 3000 });   // keep-alive
  c.emit('s', S.TCP.ACK, null, { win: 65535 });              // keep-alive ACK
  seg(100);
  cap.wait(0.5); c.emit('s', S.TCP.ACK | S.TCP.PSH, new Uint8Array(100), { seq: s.seq - 100, win: 65535 });   // RTO retransmission
  c.c.ack = s.seq + 5000; c.emit('c', S.TCP.ACK, null, { win: 3000 });   // ACKs data never seen
  c.reset('c');
  cap.wait(1);
  const again = new S.TcpConversation(cap, { ...A, port: 50000, isn: 99999 }, { ...B, port: 9000, isn: 7 }, { rtt: 0.002 });
  again.handshake();
  const { info, ds } = analyse(cap);
  const starts = (n, p) => assert.ok(info[n - 1].startsWith(p), `#${n}: ${info[n - 1]}`);
  starts(5, '[TCP Window Full] ');
  starts(6, '[TCP ZeroWindow] ');
  starts(7, '[TCP ZeroWindowProbe] ');
  starts(8, '[TCP ZeroWindowProbeAck] [TCP ZeroWindow] ');
  starts(9, '[TCP Window Update] ');
  starts(10, '[TCP Keep-Alive] ');
  starts(11, '[TCP Keep-Alive ACK] ');
  starts(13, '[TCP Retransmission] ');
  assert.ok(v(ds[12], 'tcp.analysis.rto') > 0.49);
  starts(14, '[TCP ACKed unseen segment] ');
  starts(16, '[TCP Port numbers reused] ');
  assert.equal(v(ds[15], 'tcp.stream'), 1);
});

test('TCP payload reassembly: a PDU across segments is dissected in the last one', () => {
  const { cap, c } = conv();
  c.c.port = 50001; c.s.port = 80;
  c.handshake();
  const body = 'x'.repeat(3000);
  c.send('s', `HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nContent-Length: ${body.length}\r\n\r\n${body}`);
  const { ds, info } = analyse(cap);
  assert.match(info[3], /\[TCP PDU reassembled in 6\]$/);
  assert.equal(v(ds[3], 'tcp.reassembled_in'), 6);
  assert.equal(proto(ds[5]), 'eth:ethertype:ip:tcp:http:data-text-lines');
  assert.equal(ds[5].sources.length, 2);
  assert.deepEqual(all(ds[5], 'tcp.segment'), [4, 5, 6]);
});

test('performance: first pass and full re-dissection of 100k frames', () => {
  const file = S.demoCapture({ seed: 3, seconds: 60, rate: 60 });
  const base = file.frames;
  const N = 100000;
  const fs = [];
  for (let i = 0; i < N; i++) {
    const f = base[i % base.length];
    fs.push({ ...f, no: i + 1, sec: f.sec + Math.floor(i / base.length) * 61 });
  }
  const s = createSession({ ...file, frames: fs });
  let t = performance.now();
  for (const f of fs) s.firstPass(f);
  const first = (performance.now() - t) / 1000;
  t = performance.now();
  let n = 0;
  for (const f of fs) n += dissect(s, f).fields.size;
  const full = (performance.now() - t) / 1000;
  console.log(`# 100k frames: first pass ${first.toFixed(2)} s, full dissection ${full.toFixed(2)} s`);
  assert.ok(n > 0);
  assert.ok(first < 8, `first pass ${first} s`);
  assert.ok(full < 30, `dissect ${full} s`);
});
