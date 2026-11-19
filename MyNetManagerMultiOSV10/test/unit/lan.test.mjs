// LAN, tunnel, routing and Wi-Fi dissectors (icmpv6, igmp, tunnel, l2, routing, wlan) and their samples.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSession, dissect } from '../../src/domain/dissect/index.js';
import { writePcapng, readCapture } from '../../src/domain/capture/pcap.js';
import * as S from '../../src/domain/capture/synth.js';
import * as L from '../../src/domain/capture/build/lan.js';

const A = '00:11:22:33:44:55', B = '00:1a:a0:01:02:03';

/** Dissect a list of raw frames (or a CaptureFile) and return the dissections. */
function run(input, linktype = 1) {
  let file = input;
  if (Array.isArray(input)) {
    const cap = new S.Capture(1763452800, { linktype });
    for (const f of input) cap.add(f, { dt: 0.01 });
    file = cap.file();
  }
  file = readCapture(writePcapng(file)); // also exercises the pcapng round trip
  const s = createSession(file, { resolve: { mac: false, transport: false } });
  for (const fr of file.frames) s.firstPass(fr);
  const out = file.frames.map((fr) => dissect(s, fr));
  assert.deepEqual(s.bugs, [], 'no dissector exceptions');
  return out;
}
const v = (d, f, i = 0) => d.fields.get(f)?.[i]?.value;
const has = (d, f) => d.fields.has(f);
const protos = (d) => d.layers.slice(1).join(':');

// ---- ICMPv6 ----------------------------------------------------------------------------------
const f6 = (srcMac, dstMac, src, dst, type, code, body, hlim = 255) =>
  S.pad60(S.ether(srcMac, dstMac, 0x86dd, S.ipv6({ src, dst, nxt: 58, hlim }, S.icmpv6(src, dst, type, code, body))));
const lla = (t, m) => S.bytes(Uint8Array.of(t, 1), S.macBytes(m));

test('ICMPv6 neighbor discovery', () => {
  const pio = S.bytes(Uint8Array.of(3, 4, 64, 0xc0), S.be32(2592000), S.be32(604800), S.be32(0), S.ip6Bytes('2001:db8:1::'));
  const rdnss = S.bytes(Uint8Array.of(25, 3, 0, 0), S.be32(600), S.ip6Bytes('2001:db8:1::53'));
  const [rs, ra, ns, na, dad] = run([
    f6(A, '33:33:00:00:00:02', 'fe80::1:2', 'ff02::2', 133, 0, S.bytes(S.be32(0), lla(1, A))),
    f6(B, '33:33:00:00:00:01', 'fe80::1', 'ff02::1', 134, 0, S.bytes(Uint8Array.of(64, 0x40), S.be16(1800), S.be32(0), S.be32(0), lla(1, B), pio, rdnss)),
    f6(A, '33:33:ff:00:00:01', 'fe80::1:2', 'ff02::1:ff00:1', 135, 0, S.bytes(S.be32(0), S.ip6Bytes('fe80::1'), lla(1, A))),
    f6(B, A, 'fe80::1', 'fe80::1:2', 136, 0, S.bytes(S.be32(0xe0000000), S.ip6Bytes('fe80::1'), lla(2, B))),
    f6(A, '33:33:ff:00:01:02', '::', 'ff02::1:ff00:102', 135, 0, S.bytes(S.be32(0), S.ip6Bytes('fe80::1:2'))),
  ]);
  assert.equal(rs.columns.info, `Router Solicitation from ${A}`);
  assert.equal(ra.columns.info, `Router Advertisement from ${B}`);
  assert.equal(v(ra, 'icmpv6.opt.prefix'), '2001:db8:1::');
  assert.equal(v(ra, 'icmpv6.opt.rdnss'), '2001:db8:1::53');
  assert.equal(v(ra, 'icmpv6.nd.ra.flag.o'), true);
  assert.equal(ns.columns.info, `Neighbor Solicitation for fe80::1 from ${A}`);
  assert.equal(na.columns.info, `Neighbor Advertisement fe80::1 (rtr, sol, ovr) is at ${B}`);
  assert.equal(v(na, 'icmpv6.checksum.status'), 1);
  assert.equal(dad.columns.info, 'Neighbor Solicitation for fe80::1:2');
  assert.equal(protos(ra), 'eth:ethertype:ipv6:icmpv6');
});

test('ICMPv6 echo matching, MLDv2, errors and bad checksum', () => {
  const echo = (t, src, dst, seq, h) => f6(A, B, src, dst, t, 0, S.bytes(S.be16(0x1234), S.be16(seq), S.te('abcdefgh')), h);
  const rec = S.bytes(Uint8Array.of(4, 0), S.be16(0), S.ip6Bytes('ff02::fb'));
  const inner = S.ipv6({ src: '2001:db8::1', dst: '2001:db8::2', nxt: 17 }, S.udp({ src: '2001:db8::1', dst: '2001:db8::2', sport: 40000, dport: 33434 }, new Uint8Array(8)));
  const bad = f6(A, B, '2001:db8::1', '2001:db8::2', 128, 0, S.bytes(S.be16(1), S.be16(1)));
  bad[54 + 2] ^= 0xff; // corrupt the ICMPv6 checksum
  const [req, rep, lost, mld, unr, ck] = run([
    echo(128, '2001:db8::1', '2001:db8::2', 1, 64), echo(129, '2001:db8::2', '2001:db8::1', 1, 60), echo(128, '2001:db8::1', '2001:db8::2', 2, 64),
    f6(A, '33:33:00:00:00:16', 'fe80::1:2', 'ff02::16', 143, 0, S.bytes(S.be16(0), S.be16(1), rec), 1),
    f6(B, A, '2001:db8::2', '2001:db8::1', 1, 4, S.bytes(S.be32(0), inner), 64),
    bad,
  ]);
  assert.equal(req.columns.info, 'Echo (ping) request id=0x1234, seq=1, hop limit=64 (reply in 2)');
  assert.equal(rep.columns.info, 'Echo (ping) reply id=0x1234, seq=1, hop limit=60 (request in 1)');
  assert.equal(v(rep, 'icmpv6.resp_to'), 1);
  assert.match(lost.columns.info, /\(no response found!\)$/);
  assert.equal(mld.columns.info, 'Multicast Listener Report Message v2');
  assert.equal(v(mld, 'icmpv6.mldr.mar.multicast_address'), 'ff02::fb');
  assert.equal(unr.columns.info, 'Destination Unreachable (Port unreachable)');
  assert.equal(protos(unr), 'eth:ethertype:ipv6:icmpv6:ipv6:udp:data');
  assert.equal(unr.columns.netSrc, '2001:db8::2', 'columns keep the outer addresses');
  assert.equal(v(ck, 'icmpv6.checksum.status'), 0);
  assert.ok(ck.expert.some((e) => e.abbrev === 'icmpv6.checksum_bad'));
});

// ---- IGMP ------------------------------------------------------------------------------------
test('IGMP v2 and v3', () => {
  const RA = Uint8Array.of(0x94, 4, 0, 0);
  const ig = (dst, body) => { const m = S.bytes(body); const c = S.checksum(m); m[2] = c >> 8; m[3] = c & 255; return S.pad60(S.ether(A, '01:00:5e:00:00:01', 0x800, S.ipv4({ src: '192.168.0.10', dst, proto: 2, ttl: 1, ipOptions: RA }, m))); };
  const rec = (t, g, srcs) => S.bytes(Uint8Array.of(t, 0), S.be16(srcs.length), S.ip4Bytes(g), ...srcs.map(S.ip4Bytes));
  const [q, rep, leave, v3] = run([
    ig('224.0.0.1', S.bytes(Uint8Array.of(0x11, 100, 0, 0), S.ip4Bytes('0.0.0.0'))),
    ig('239.1.1.1', S.bytes(Uint8Array.of(0x16, 0, 0, 0), S.ip4Bytes('239.1.1.1'))),
    ig('224.0.0.2', S.bytes(Uint8Array.of(0x17, 0, 0, 0), S.ip4Bytes('239.1.1.1'))),
    ig('224.0.0.22', S.bytes(Uint8Array.of(0x22, 0, 0, 0), S.be16(0), S.be16(2), rec(4, '239.255.255.250', []), rec(5, '232.1.1.1', ['10.0.0.1']))),
  ]);
  assert.equal(q.columns.protocol, 'IGMPv2');
  assert.equal(q.columns.info, 'Membership Query, general');
  assert.equal(rep.columns.info, 'Membership Report group 239.1.1.1');
  assert.equal(leave.columns.info, 'Leave Group 239.1.1.1');
  assert.equal(v3.columns.info, 'Membership Report / Join group 239.255.255.250 for any sources / Group 232.1.1.1, new source {10.0.0.1}');
  assert.equal(protos(v3), 'eth:ethertype:ip:igmp:igmp');
  assert.equal(v(v3, 'igmp.saddr'), '10.0.0.1');
});

// ---- tunnels ---------------------------------------------------------------------------------
test('GRE, VXLAN, GENEVE and MPLS', () => {
  const ping = S.ipv4({ src: '10.0.0.1', dst: '10.0.0.2', proto: 1 }, S.icmp(8, 0, S.bytes(S.be16(7), S.be16(1)), new Uint8Array(8)));
  const inner = S.ether('02:00:00:00:00:01', '02:00:00:00:00:02', 0x800, ping);
  const outer = (proto, p) => S.pad60(S.ether(A, B, 0x800, S.ipv4({ src: '203.0.113.1', dst: '198.51.100.1', proto }, p)));
  const [g, ge, vx, gn, mp, mp6] = run([
    outer(47, L.gre({ proto: 0x0800, key: 1001, seq: 5 }, ping)),
    outer(47, L.gre({ proto: 0x6558 }, inner)),
    S.udpFrame({ srcMac: A, dstMac: B, src: '192.168.0.11', dst: '192.168.0.12', sport: 49152, dport: 4789 }, L.vxlan(100, inner)),
    S.udpFrame({ srcMac: A, dstMac: B, src: '192.168.0.11', dst: '192.168.0.12', sport: 49153, dport: 6081 }, L.geneve(200, 0x6558, inner, [[0x0102, 0x80, Uint8Array.of(1, 2, 3, 4)]])),
    S.pad60(S.ether(A, B, 0x8847, L.mpls([{ label: 16 }, { label: 1001, exp: 5, ttl: 63 }], ping))),
    S.pad60(S.ether(A, B, 0x8847, L.mpls([{ label: 17 }], inner))),
  ]);
  assert.equal(protos(g), 'eth:ethertype:ip:gre:ip:icmp:data');
  assert.equal(v(g, 'gre.key'), 1001);
  assert.equal(v(g, 'gre.sequence_number'), 5);
  assert.equal(protos(ge), 'eth:ethertype:ip:gre:eth:ethertype:ip:icmp:data');
  assert.equal(protos(vx), 'eth:ethertype:ip:udp:vxlan:eth:ethertype:ip:icmp:data');
  assert.equal(v(vx, 'vxlan.vni'), 100);
  assert.equal(protos(gn), 'eth:ethertype:ip:udp:geneve:eth:ethertype:ip:icmp:data');
  assert.equal(v(gn, 'geneve.vni'), 200);
  assert.deepEqual(mp.fields.get('mpls.label').map((n) => n.value), [16, 1001]);
  assert.equal(protos(mp), 'eth:ethertype:mpls:icmp:data', 'Wireshark does not list IP carried directly over MPLS');
  assert.equal(protos(mp6), 'eth:ethertype:mpls:pwethnocw:eth:ethertype:ip:icmp:data');
});

test('PPPoE discovery/session, LCP, PAP, IPCP', () => {
  const hu = [0x0103, Uint8Array.of(1, 2, 3, 4)];
  const [padi, pado, lcp, pap, ipcp, ip] = run([
    L.pppoeDiscovery(A, 'ff:ff:ff:ff:ff:ff', 0x09, 0, [[0x0101, new Uint8Array(0)], hu]),
    L.pppoeDiscovery(B, A, 0x07, 0, [[0x0102, S.te('BRAS-1')], hu]),
    L.pppoeSession(A, B, 0x1234, 0xc021, L.pppControl(1, 1, [[1, S.be16(1492)], [5, S.be32(0x12345678)]])),
    L.pppoeSession(A, B, 0x1234, 0xc023, S.bytes(Uint8Array.of(1, 1), S.be16(16), Uint8Array.of(4), S.te('user'), Uint8Array.of(6), S.te('secret'))),
    L.pppoeSession(A, B, 0x1234, 0x8021, L.pppControl(1, 2, [[3, S.ip4Bytes('0.0.0.0')]])),
    L.pppoeSession(A, B, 0x1234, 0x0021, S.ipv4({ src: '100.64.0.2', dst: '8.8.8.8', proto: 1 }, S.icmp(8, 0, S.bytes(S.be16(1), S.be16(1))))),
  ]);
  assert.equal(padi.columns.info, 'Active Discovery Initiation (PADI)');
  assert.equal(pado.columns.info, "Active Discovery Offer (PADO) AC-Name='BRAS-1'");
  assert.equal(v(pado, 'pppoed.tags.ac_name'), 'BRAS-1');
  assert.equal(protos(lcp), 'eth:ethertype:pppoes:ppp:lcp');
  assert.equal(lcp.columns.protocol, 'PPP LCP');
  assert.equal(v(lcp, 'lcp.opt.mru'), 1492);
  assert.equal(pap.columns.info, "Authenticate-Request (Peer-ID='user', Password='secret')");
  assert.equal(ipcp.columns.protocol, 'PPP IPCP');
  assert.equal(protos(ip), 'eth:ethertype:pppoes:ppp:ip:icmp');
  assert.equal(v(ip, 'pppoe.session_id'), 0x1234);
});

test('IPsec ESP/AH and SCTP', () => {
  const outer = (proto, p, src = '192.168.0.1', dst = '192.168.0.2', rev = false) => S.pad60(S.ether(rev ? B : A, rev ? A : B, 0x800, S.ipv4({ src, dst, proto }, p)));
  const init = (tag) => S.bytes(S.be32(tag), S.be32(65536), S.be16(10), S.be16(10), S.be32(1000));
  const [e, ah, i1, i2, data, sack] = run([
    outer(50, L.esp(0xc0ffee01, 7, 32)),
    outer(51, L.ah(1, 0xabc, 3, S.icmp(8, 0, S.bytes(S.be16(9), S.be16(1)), new Uint8Array(8)))),
    outer(132, L.sctp(40000, 9999, 0, [L.sctpChunk(1, 0, init(0x1111))])),
    outer(132, L.sctp(9999, 40000, 0x1111, [L.sctpChunk(2, 0, init(0x2222))]), '192.168.0.2', '192.168.0.1', true),
    outer(132, L.sctp(40000, 9999, 0x2222, [L.sctpChunk(0, 3, S.bytes(S.be32(1000), S.be16(0), S.be16(0), S.be32(0), S.te('hello sctp!')))])),
    outer(132, L.sctp(9999, 40000, 0x1111, [L.sctpChunk(3, 0, S.bytes(S.be32(1000), S.be32(65536), S.be16(0), S.be16(0)))]), '192.168.0.2', '192.168.0.1', true),
  ]);
  assert.equal(e.columns.info, 'ESP (SPI=0xc0ffee01)');
  assert.equal(v(e, 'esp.sequence'), 7);
  assert.equal(protos(ah), 'eth:ethertype:ip:ah:icmp:data');
  assert.equal(v(ah, 'ah.spi'), 0xabc);
  assert.equal(i1.columns.info, 'INIT ');
  assert.equal(i2.columns.info, 'INIT_ACK ');
  assert.equal(data.columns.info, 'DATA (TSN=0) ');
  assert.equal(protos(data), 'eth:ethertype:ip:sctp:data');
  assert.equal(v(data, 'sctp.data_tsn_raw'), 1000);
  assert.equal(sack.columns.info, 'SACK (Ack=0, Arwnd=65536) ');
  assert.equal(data.columns.srcport, 40000);
});

// ---- L2 control ----------------------------------------------------------------------------------
test('LLDP, STP, CDP, LACP, EAPOL', () => {
  const SW = '00:1b:21:aa:bb:01';
  const T = L.lldpTlv;
  const cdpBody = L.cdp([[1, S.te('sw1')], [3, S.te('Gi1/0/1')], [6, S.te('cisco WS-C2960X')]]);
  const badCdp = cdpBody.slice(); badCdp[3] ^= 1;
  const [lldp, stp, rstp, tcn, cdp, cdpBad, lacp, eapReq, key] = run([
    L.lldpFrame(SW, [T(1, S.bytes(Uint8Array.of(4), S.macBytes(SW))), T(2, S.bytes(Uint8Array.of(5), S.te('Gi1/0/1'))), T(3, S.be16(120)), T(5, S.te('sw1'))]),
    L.llcFrame(SW, '01:80:c2:00:00:00', 0x42, 0x42, 3, L.bpdu({ rootMac: SW, bridgeMac: SW })),
    L.llcFrame(SW, '01:80:c2:00:00:00', 0x42, 0x42, 3, L.bpdu({ version: 2, flags: 0x3c, rootPrio: 4096, rootMac: SW, bridgeMac: SW, cost: 20000, portId: 0x8002 })),
    L.llcFrame(SW, '01:80:c2:00:00:00', 0x42, 0x42, 3, Uint8Array.of(0, 0, 0, 0x80)),
    L.snapFrame(SW, '01:00:0c:cc:cc:cc', 0x00000c, 0x2000, cdpBody),
    L.snapFrame(SW, '01:00:0c:cc:cc:cc', 0x00000c, 0x2000, badCdp),
    S.pad60(S.ether(SW, '01:80:c2:00:00:02', 0x8809, L.lacp({ sys: SW, key: 13, port: 1 }, { sys: B, key: 13, port: 5, state: 0x3f }))),
    S.pad60(S.ether(SW, A, 0x888e, L.eapol(0, L.eap(1, 1, 1)))),
    S.pad60(S.ether(SW, A, 0x888e, L.eapol(3, S.bytes(Uint8Array.of(2), S.be16(0x008a), S.be16(16), new Uint8Array(8), new Uint8Array(32), new Uint8Array(16), new Uint8Array(8), new Uint8Array(8), new Uint8Array(16), S.be16(0))))),
  ]);
  assert.equal(lldp.columns.info, `MA/${SW} IN/Gi1/0/1 120 SysN=sw1 `);
  assert.equal(v(lldp, 'lldp.chassis.id.mac'), SW);
  assert.equal(protos(stp), 'eth:llc:stp');
  assert.equal(stp.columns.info, `Conf. Root = 32768/0/${SW}  Cost = 0  Port = 0x8001`);
  assert.equal(rstp.columns.info, `RST. Root = 4096/0/${SW}  Cost = 20000  Port = 0x8002`);
  assert.equal(v(rstp, 'stp.flags.port_role'), 3);
  assert.equal(tcn.columns.info, 'Topology Change Notification');
  assert.equal(protos(cdp), 'eth:llc:cdp');
  assert.equal(cdp.columns.info, 'Device ID: sw1  Port ID: Gi1/0/1  ');
  assert.equal(v(cdp, 'cdp.checksum.status'), 1);
  assert.equal(v(cdpBad, 'cdp.checksum.status'), 0);
  assert.equal(protos(lacp), 'eth:ethertype:slow:lacp');
  assert.equal(v(lacp, 'lacp.partner.state_str'), '**DCSGSA');
  assert.equal(eapReq.columns.info, 'Request, Identity');
  assert.equal(key.columns.info, 'Key (Message 1 of 4)');
});

// ---- routing ----------------------------------------------------------------------------------
test('OSPF, RIP, VRRP, HSRP', () => {
  const R = { mac: '00:1b:21:00:00:01', ip: '192.168.0.1' };
  const ipf = (dst, proto, p) => S.pad60(S.ether(R.mac, '01:00:5e:00:00:05', 0x800, S.ipv4({ src: R.ip, dst, proto, ttl: 1 }, p)));
  const lsa = L.routerLsa(1, '1.1.1.1', '1.1.1.1', 0x80000001, [['10.0.0.0', '255.255.255.0', 3, 10]]);
  const vr = L.vrrp(1, 100, ['192.168.0.254']); const c = S.checksum(vr); vr[6] = c >> 8; vr[7] = c & 255;
  const [hello, lsu, rip, vrrp, hsrp] = run([
    ipf('224.0.0.5', 89, L.ospf(1, '1.1.1.1', '0.0.0.0', L.ospfHello('255.255.255.0', 10, 1, 40, '192.168.0.1', '0.0.0.0', ['2.2.2.2']))),
    ipf('224.0.0.5', 89, L.ospf(4, '1.1.1.1', '0.0.0.0', S.bytes(S.be32(1), lsa))),
    S.udpFrame({ srcMac: R.mac, dstMac: '01:00:5e:00:00:09', src: R.ip, dst: '224.0.0.9', sport: 520, dport: 520 }, L.rip(2, [{ ip: '10.1.0.0', mask: '255.255.0.0', metric: 1 }])),
    ipf('224.0.0.18', 112, vr),
    S.udpFrame({ srcMac: R.mac, dstMac: '01:00:5e:00:00:02', src: R.ip, dst: '224.0.0.2', sport: 1985, dport: 1985 }, L.hsrp(0, 16, 1, 110, '192.168.0.253')),
  ]);
  assert.equal(hello.columns.info, 'Hello Packet');
  assert.equal(v(hello, 'ospf.hello.active_neighbor'), '2.2.2.2');
  assert.equal(v(lsu, 'ospf.lsa.router.linkid'), '10.0.0.0');
  assert.equal(lsu.columns.info, 'LS Update');
  assert.equal(rip.columns.protocol, 'RIPv2');
  assert.equal(v(rip, 'rip.ip'), '10.1.0.0');
  assert.equal(vrrp.columns.info, 'Announcement (v3)');
  assert.equal(v(vrrp, 'vrrp.checksum.status'), 1);
  assert.equal(hsrp.columns.info, 'Hello (state Active)');
  assert.equal(v(hsrp, 'hsrp.virt_ip'), '192.168.0.253');
});

test('BGP over TCP: OPEN, UPDATE, two KEEPALIVEs in one segment, NOTIFICATION', () => {
  const cap = new S.Capture();
  const tc = new S.TcpConversation(cap, { mac: A, ip: '192.168.0.1', port: 50179 }, { mac: B, ip: '192.168.0.2', port: 179 });
  tc.handshake();
  tc.send('c', L.bgpOpen(65001, 180, '1.1.1.1', [[65, S.be32(65001)]]));
  tc.send('c', S.bytes(L.bgp(4, new Uint8Array(0)), L.bgp(4, new Uint8Array(0))));
  tc.send('c', L.bgpUpdate(['10.9.0.0/16'], [[0x40, 1, Uint8Array.of(0)], [0x40, 2, S.bytes(Uint8Array.of(2, 1), S.be32(65001))], [0x40, 3, S.ip4Bytes('192.168.0.1')]], ['10.10.0.0/16']));
  tc.send('s', L.bgp(3, Uint8Array.of(6, 2)));
  const ds = run(cap.file()).filter((d) => d.layers.includes('bgp'));
  assert.equal(ds.length, 4);
  assert.equal(ds[0].columns.info, 'OPEN Message');
  assert.equal(v(ds[0], 'bgp.cap.4as'), 65001);
  assert.equal(ds[1].columns.info, 'KEEPALIVE Message, KEEPALIVE Message');
  assert.equal(v(ds[2], 'bgp.nlri_prefix'), '10.10.0.0');
  assert.equal(v(ds[2], 'bgp.withdrawn_prefix'), '10.9.0.0');
  assert.equal(v(ds[2], 'bgp.update.path_attribute.as_path_segment.as4'), 65001);
  assert.equal(v(ds[3], 'bgp.notify.minor_error_cease'), 2);
});

// ---- Wi-Fi -------------------------------------------------------------------------------------
test('802.11 with radiotap: beacon, data to DS, protected, control frames', () => {
  const AP = '00:24:d4:11:22:33', STA = 'a4:83:e7:12:34:56';
  const llc = S.bytes(Uint8Array.of(0xaa, 0xaa, 3, 0, 0, 0), S.be16(0x0800), S.ipv4({ src: '192.168.0.10', dst: '192.168.0.1', proto: 17 }, S.udp({ src: '192.168.0.10', dst: '192.168.0.1', sport: 40000, dport: 33000 }, S.te('wifi'))));
  const rt = L.radiotap({ signal: -42 });
  const [beacon, data, prot, ack, wild] = run([
    S.bytes(rt, L.wlanHeader(0x80, 0, 'ff:ff:ff:ff:ff:ff', AP, AP, 100), L.beaconBody('HomeNet', 6, 1n, 100, 0x0431, [L.RSN_PSK])),
    S.bytes(rt, L.wlanHeader(0x88, 0x01, AP, STA, '00:11:32:aa:bb:cc', 101), S.le16(0), llc),
    S.bytes(rt, L.wlanHeader(0x88, 0x41, AP, STA, '00:11:32:aa:bb:cc', 102), S.le16(0), Uint8Array.of(1, 0, 0, 0x20, 0, 0, 0, 0), new Uint8Array(20)),
    S.bytes(rt, L.wlanHeader(0xd4, 0, AP)),
    S.bytes(rt, L.wlanHeader(0x40, 0, 'ff:ff:ff:ff:ff:ff', STA, 'ff:ff:ff:ff:ff:ff', 103), L.ie(0, new Uint8Array(0))),
  ], 127);
  assert.equal(protos(beacon), 'radiotap:wlan_radio:wlan');
  assert.equal(beacon.columns.info, 'Beacon frame, SN=100, FN=0, Flags=........, BI=100, SSID="HomeNet"');
  assert.equal(new TextDecoder().decode(v(beacon, 'wlan.ssid')), 'HomeNet');
  assert.equal(v(beacon, 'wlan.ds.current_channel'), 6);
  assert.equal(v(beacon, 'radiotap.dbm_antsignal'), -42);
  assert.equal(v(beacon, 'wlan_radio.channel'), 6);
  assert.equal(protos(data), 'radiotap:wlan_radio:wlan:llc:ip:udp:data');
  assert.equal(v(data, 'wlan.bssid'), AP);
  assert.equal(v(data, 'wlan.da'), '00:11:32:aa:bb:cc');
  assert.equal(prot.columns.info, 'QoS Data, SN=102, FN=0, Flags=.p.....T');
  assert.equal(protos(prot), 'radiotap:wlan_radio:wlan:data');
  assert.equal(ack.columns.info, 'Acknowledgement, Flags=........');
  assert.equal(wild.columns.info, 'Probe Request, SN=103, FN=0, Flags=........, SSID=Wildcard (Broadcast)');
});

// ---- malformed input ------------------------------------------------------------------------------
test('truncated and corrupt frames become [Malformed Packet] without exceptions', () => {
  const ospfHello = S.pad60(S.ether(A, B, 0x800, S.ipv4({ src: '192.168.0.1', dst: '224.0.0.5', proto: 89 }, L.ospf(1, '1.1.1.1', '0.0.0.0', L.ospfHello('255.255.255.0', 10, 1, 40, '0.0.0.0', '0.0.0.0', [])).subarray(0, 30))));
  const shortNs = f6(A, B, 'fe80::1', 'fe80::2', 135, 0, S.be32(0));
  const lldpBad = L.lldpFrame(A, [S.bytes(S.be16((5 << 9) | 200), S.te('short'))]);
  const sctpBad = S.pad60(S.ether(A, B, 0x800, S.ipv4({ src: '192.168.0.1', dst: '192.168.0.2', proto: 132 }, S.bytes(L.sctp(1, 2, 0, []), Uint8Array.of(0, 3, 0, 40)))));
  for (const d of run([ospfHello, shortNs, lldpBad, sctpBad])) {
    assert.ok(d.fields.has('_ws.malformed'), `malformed: ${d.layers.join(':')}`);
    assert.ok(d.expert.some((e) => e.severity === 'error'));
  }
});

test('fuzzed LAN samples never throw', () => {
  const r = S.rng(99);
  for (const s of L.samples) {
    const f = s.build();
    const frames = f.frames.map((fr, i) => {
      let data = fr.data.slice();
      if (r() < 0.5) data = data.slice(0, Math.floor(r() * data.length));
      else for (let k = 0; k < 4; k++) data[Math.floor(r() * data.length)] = Math.floor(r() * 256);
      return { ...fr, no: i + 1, data, caplen: data.length, len: data.length };
    });
    run({ ...f, frames });
  }
});

// ---- samples ------------------------------------------------------------------------------------
test('LAN samples: metadata and expected protocols', () => {
  const want = {
    'vlan-tagged': ['vlan', 'ieee8021ad', 'arp', 'icmp'],
    'ipv6-neighbor-discovery': ['icmpv6'],
    'arp-storm': ['arp'],
    'ping-traceroute': ['icmp', 'udp'],
    'routing-protocols': ['ospf', 'bgp', 'rip', 'vrrp', 'hsrp'],
    'lan-control': ['stp', 'lldp', 'cdp', 'lacp', 'eapol'],
    'wifi-80211': ['radiotap', 'wlan', 'eapol'],
    tunnels: ['gre', 'vxlan', 'geneve', 'mpls', 'pppoed', 'pppoes', 'lcp', 'pap', 'ipcp', 'esp'],
  };
  assert.deepEqual(L.samples.map((s) => s.id).sort(), Object.keys(want).sort());
  for (const s of L.samples) {
    assert.ok(s.ko[0] && s.ko[1] && s.en[0] && s.en[1] && s.group && s.icon, s.id);
    const ds = run(s.build());
    const seen = new Set(ds.flatMap((d) => d.layers));
    for (const d of ds) if (d.fields.has('_ws.malformed')) seen.add('_ws.malformed');
    for (const p of want[s.id]) assert.ok(seen.has(p), `${s.id} contains ${p}`);
    assert.ok(!seen.has('_ws.malformed'), `${s.id} has no malformed frames`);
  }
  // deterministic: building twice gives identical bytes
  for (const s of L.samples) assert.deepEqual(writePcapng(s.build()), writePcapng(s.build()), s.id);
});

test('LAN samples: request/response and analysis details', () => {
  const by = Object.fromEntries(L.samples.map((s) => [s.id, run(s.build())]));
  const ping = by['ping-traceroute'];
  assert.match(ping[4].columns.info, /seq=3\/768, ttl=64 \(no response found!\)/);
  assert.ok(ping.some((d) => d.columns.info === 'Time-to-live exceeded (Time to live exceeded in transit)'));
  assert.ok(ping.some((d) => d.columns.info === 'Destination unreachable (Port unreachable)'));
  const storm = by['arp-storm'];
  assert.ok(storm.some((d) => /duplicate use of 192\.168\.0\.20 detected!/.test(d.columns.info)));
  assert.ok(storm.some((d) => d.columns.info === 'Who has 192.168.0.50? (ARP Probe)'));
  const wifi = by['wifi-80211'];
  assert.deepEqual(wifi.filter((d) => d.layers.includes('eapol')).map((d) => d.columns.info), ['Key (Message 1 of 4)', 'Key (Message 2 of 4)', 'Key (Message 3 of 4)', 'Key (Message 4 of 4)']);
});
