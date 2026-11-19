// Name services and UDP management protocols: DNS, mDNS, LLMNR, NBNS, DHCP, DHCPv6, NTP, SNMP, Syslog, TFTP.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSession, dissect } from '../../src/domain/dissect/index.js';
import { Capture, udpFrame, TcpConversation, bytes, be16, hex } from '../../src/domain/capture/synth.js';
import {
  dnsQuery, dnsResponse, dnsMessage, svc, mdnsMessage, llmnrQuery, llmnrResponse, nbnsQuery, nbnsResponse,
  dhcpMessage, dhcpOpt, DHCP, dhcpv6Message, duidLL, ntpPacket, snmpGet, snmpResponse, snmpTrapV1, snmpMessage,
  syslogMessage, tftp, samples,
} from '../../src/domain/capture/build/names.js';
import { writePcapng, readCapture } from '../../src/domain/capture/pcap.js';

const A = { mac: 'a4:83:e7:12:34:56', ip: '192.168.0.10' };
const B = { mac: '00:11:32:aa:bb:cc', ip: '192.168.0.1' };

/** Build frames from [from, to, sport, dport, payload] and dissect them all (first pass + tree). */
function run(list) {
  const cap = new Capture(1763452800);
  for (const [x, y, sp, dp, p] of list) cap.add(udpFrame({ srcMac: x.mac, dstMac: y.mac, src: x.ip, dst: y.ip, sport: sp, dport: dp }, p), { dt: 0.01 });
  return dissectAll(cap.file());
}
function dissectAll(file) {
  const s = createSession(file, { resolve: { mac: false, transport: false } });
  for (const f of file.frames) s.firstPass(f);
  const ds = file.frames.map((f) => dissect(s, f));
  return { s, ds };
}
const v = (d, f) => (d.fields.get(f) || []).map((n) => n.value);
const v1 = (d, f) => v(d, f)[0];

test('DNS query and response: fields, Info, matching', () => {
  const { s, ds } = run([
    [A, B, 50000, 53, dnsQuery({ id: 0x1a2b, name: 'example.com', type: 'A' })],
    [B, A, 53, 50000, dnsResponse({ id: 0x1a2b, name: 'example.com', answers: [{ type: 'A', ttl: 3600, data: '93.184.216.34' }] })],
  ]);
  assert.deepEqual(s.bugs, []);
  const [q, r] = ds;
  assert.equal(q.layers.slice(1).join(':'), 'eth:ethertype:ip:udp:dns');
  assert.equal(q.columns.protocol, 'DNS');
  assert.equal(q.columns.info, 'Standard query 0x1a2b A example.com');
  assert.equal(r.columns.info, 'Standard query response 0x1a2b A example.com A 93.184.216.34');
  assert.equal(v1(q, 'dns.qry.name'), 'example.com');
  assert.equal(v1(q, 'dns.qry.type'), 1);
  assert.equal(v1(q, 'dns.id'), 0x1a2b);
  assert.equal(v1(q, 'dns.flags.response'), false);
  assert.equal(v1(r, 'dns.flags.response'), true);
  assert.equal(v1(r, 'dns.a'), '93.184.216.34');
  assert.equal(v1(r, 'dns.resp.ttl'), 3600);
  assert.equal(v1(q, 'dns.response_in'), 2);
  assert.equal(v1(r, 'dns.response_to'), 1);
  assert.ok(Math.abs(v1(r, 'dns.time') - 0.01) < 1e-9);
  assert.equal(v1(r, 'dns.count.answers'), 1);
  const ttlNode = r.fields.get('dns.resp.ttl')[0];
  assert.equal(ttlNode.label, 'Time to live: 3600 (1 hour)');
  assert.equal(r.fields.get('dns.resp.type')[0].label, 'Type: A (1) (Host Address)');
});

test('DNS record types: AAAA, CNAME, MX, SRV, TXT, SOA, HTTPS, CAA, NXDOMAIN', () => {
  const { ds, s } = run([
    [B, A, 53, 50001, dnsResponse({ id: 1, name: 'v6.example', type: 'AAAA', answers: [{ type: 'AAAA', ttl: 60, data: '2001:db8::1' }] })],
    [B, A, 53, 50002, dnsResponse({ id: 2, name: 'www.example', answers: [{ type: 'CNAME', ttl: 60, data: 'cdn.example' }, { name: 'cdn.example', type: 'A', ttl: 60, data: '10.1.2.3' }] })],
    [B, A, 53, 50003, dnsResponse({ id: 3, name: 'example', type: 'MX', answers: [{ type: 'MX', ttl: 60, data: { preference: 10, exchange: 'mx.example' } }] })],
    [B, A, 53, 50004, dnsResponse({ id: 4, name: '_sip._udp.example', type: 'SRV', answers: [{ type: 'SRV', ttl: 60, data: { priority: 1, weight: 2, port: 5060, target: 'sip.example' } }] })],
    [B, A, 53, 50005, dnsResponse({ id: 5, name: 'example', type: 'TXT', answers: [{ type: 'TXT', ttl: 60, data: ['v=spf1 -all', 'x=y'] }] })],
    [B, A, 53, 50006, dnsResponse({ id: 6, name: 'nx.example', rcode: 3, authority: [{ name: 'example', type: 'SOA', ttl: 60, data: { mname: 'ns.example', rname: 'host.example', serial: 7 } }] })],
    [B, A, 53, 50007, dnsResponse({ id: 7, name: 'example', type: 'HTTPS', answers: [{ type: 'HTTPS', ttl: 60, data: { priority: 1, target: '.', params: [svc.alpn('h3', 'h2'), svc.port(443), svc.ipv4hint('1.2.3.4')] } }] })],
    [B, A, 53, 50008, dnsResponse({ id: 8, name: 'example', type: 'CAA', answers: [{ type: 'CAA', ttl: 60, data: { flags: 128, tag: 'issue', value: 'ca.example' } }] })],
  ]);
  assert.deepEqual(s.bugs, []);
  assert.equal(v1(ds[0], 'dns.aaaa'), '2001:db8::1');
  assert.deepEqual(v(ds[1], 'dns.cname'), ['cdn.example']);
  assert.equal(ds[1].columns.info, 'Standard query response 0x0002 A www.example CNAME cdn.example A 10.1.2.3');
  assert.equal(v1(ds[2], 'dns.mx.mail_exchange'), 'mx.example');
  assert.equal(v1(ds[2], 'dns.mx.preference'), 10);
  assert.equal(v1(ds[3], 'dns.srv.port'), 5060);
  assert.equal(v1(ds[3], 'dns.srv.service'), '_sip');
  assert.equal(v1(ds[3], 'dns.srv.target'), 'sip.example');
  assert.deepEqual(v(ds[4], 'dns.txt'), ['v=spf1 -all', 'x=y']);
  assert.equal(v1(ds[5], 'dns.flags.rcode'), 3);
  assert.match(ds[5].columns.info, /^Standard query response 0x0006 No such name A nx\.example SOA ns\.example$/);
  assert.equal(v1(ds[5], 'dns.soa.serial_number'), 7);
  assert.deepEqual(v(ds[6], 'dns.svcb.svcparam.alpn'), ['h3', 'h2']);
  assert.equal(v1(ds[6], 'dns.svcb.svcparam.port'), 443);
  assert.equal(v1(ds[6], 'dns.svcb.svcparam.ipv4hint.ip'), '1.2.3.4');
  assert.equal(v1(ds[7], 'dns.caa.issue'), 'ca.example');
  assert.equal(v1(ds[7], 'dns.caa.flags.issuer_critical'), true);
});

test('DNS EDNS0 options: client subnet and cookie', () => {
  const msg = dnsMessage({ id: 9, flags: 0x0100, qd: [{ name: 'a.example', type: 'A' }], edns: { size: 4096, do: true, options: [[8, hex('0001 18 00 c0a800')], [10, hex('0102030405060708')]] } });
  const { ds } = run([[A, B, 50010, 53, msg]]);
  const d = ds[0];
  assert.equal(v1(d, 'dns.rr.udp_payload_size'), 4096);
  assert.equal(v1(d, 'dns.resp.z.do'), true);
  assert.equal(v1(d, 'dns.opt.client.family'), 1);
  assert.equal(v1(d, 'dns.opt.client.netmask'), 24);
  assert.equal(v1(d, 'dns.opt.client.addr4'), '192.168.0.0');
  assert.equal(Buffer.from(v1(d, 'dns.opt.cookie.client')).toString('hex'), '0102030405060708');
  assert.equal(d.columns.info, 'Standard query 0x0009 A a.example OPT');
});

test('DNS compression loop is named like Wireshark; truncation becomes Malformed', () => {
  const loop = bytes(be16(1), be16(0x0100), be16(1), be16(0), be16(0), be16(0), hex('c00c'), be16(1), be16(1));
  const trunc = dnsQuery({ id: 2, name: 'example.com' }).subarray(0, 20);
  const { ds, s } = run([[A, B, 50020, 53, loop], [A, B, 50021, 53, trunc]]);
  assert.deepEqual(s.bugs, []);
  assert.equal(v1(ds[0], 'dns.qry.name'), '<Name contains a pointer that loops>');
  assert.equal(ds[1].columns.info.startsWith('Standard query 0x0002'), true);
  assert.ok(ds[1].expert.some((e) => e.severity === 'error' && e.abbrev === '_ws.malformed.expert'));
});

test('DNS over TCP with the 2-byte length prefix, reassembled across segments', () => {
  const cap = new Capture(1763452800);
  const tc = new TcpConversation(cap, { ...A, port: 50999 }, { ...B, port: 53 }, { mss: 100 });
  tc.handshake();
  const q = dnsQuery({ id: 0x77, name: 'example.org', type: 'TXT' });
  tc.send('c', bytes(be16(q.length), q));
  const big = dnsResponse({ id: 0x77, name: 'example.org', type: 'TXT', answers: [{ type: 'TXT', ttl: 60, data: ['x'.repeat(150)] }] });
  tc.send('s', bytes(be16(big.length), big));
  const { ds, s } = dissectAll(cap.file());
  assert.deepEqual(s.bugs, []);
  const dns = ds.filter((d) => d.layers.includes('dns'));
  assert.equal(dns.length, 2);
  assert.equal(v1(dns[0], 'dns.length'), q.length);
  assert.equal(dns[1].columns.info, 'Standard query response 0x0077 TXT example.org TXT');
  assert.ok(dns[1].sources.length > 1, 'reassembled source');
  assert.equal(v1(dns[0], 'dns.response_in'), cap.frames.indexOf(cap.frames.find((f, i) => ds[i] === dns[1])) + 1);
});

test('mDNS: QU question, cache flush, protocol column', () => {
  const { ds, s } = run([
    [A, { mac: '01:00:5e:00:00:fb', ip: '224.0.0.251' }, 5353, 5353, mdnsMessage({ qd: [{ name: '_ipp._tcp.local', type: 'PTR', qu: true }] })],
    [B, { mac: '01:00:5e:00:00:fb', ip: '224.0.0.251' }, 5353, 5353, mdnsMessage({ response: true, an: [{ name: 'printer.local', type: 'A', ttl: 120, flush: true, data: '192.168.0.40' }] })],
  ]);
  assert.deepEqual(s.bugs, []);
  assert.equal(ds[0].columns.protocol, 'MDNS');
  assert.equal(ds[0].layers.at(-1), 'mdns');
  assert.equal(ds[0].columns.info, 'Standard query 0x0000 PTR _ipp._tcp.local, "QU" question');
  assert.equal(v1(ds[0], 'dns.qry.qu'), true);
  assert.equal(v1(ds[1], 'dns.resp.cache_flush'), true);
  assert.equal(ds[1].columns.info, 'Standard query response 0x0000 A, cache flush 192.168.0.40');
});

test('LLMNR and NBNS', () => {
  const C = { mac: '00:15:5d:01:02:03', ip: '192.168.0.12' };
  const { ds, s } = run([
    [C, { mac: '01:00:5e:00:00:fc', ip: '224.0.0.252' }, 61000, 5355, llmnrQuery({ id: 0x1234, name: 'files' })],
    [B, C, 5355, 61000, llmnrResponse({ id: 0x1234, name: 'files', data: '192.168.0.50' })],
    [C, { mac: 'ff:ff:ff:ff:ff:ff', ip: '192.168.0.255' }, 137, 137, nbnsQuery({ id: 0x80f1, name: 'WORKGROUP', suffix: 0x1c })],
    [B, C, 137, 137, nbnsResponse({ id: 0x80f1, name: 'WORKGROUP', suffix: 0x1c, addr: '192.168.0.1', group: true })],
  ]);
  assert.deepEqual(s.bugs, []);
  assert.equal(ds[0].columns.protocol, 'LLMNR');
  assert.equal(v1(ds[0], 'dns.response_in'), 2);
  assert.equal(ds[2].columns.protocol, 'NBNS');
  assert.equal(ds[2].columns.info, 'Name query NB WORKGROUP<1c>');
  assert.equal(v1(ds[2], 'nbns.name'), 'WORKGROUP<1c>');
  assert.equal(ds[3].columns.info, 'Name query response NB 192.168.0.1');
  assert.equal(v1(ds[3], 'nbns.addr'), '192.168.0.1');
  assert.equal(v1(ds[3], 'nbns.nb_flags.group'), true);
});

test('DHCP: message type, Info, options, end option', () => {
  const mac = '3c:22:fb:4d:5e:6f';
  const disc = dhcpMessage({ msgType: DHCP.DISCOVER, xid: 0x3903f326, mac, options: [dhcpOpt.str(12, 'laptop'), dhcpOpt.raw(55, Uint8Array.of(1, 3, 6))] });
  const ack = dhcpMessage({ msgType: DHCP.ACK, xid: 0x3903f326, mac, yiaddr: '192.168.0.23', options: [dhcpOpt.ip(54, '192.168.0.1'), dhcpOpt.u32(51, 86400), dhcpOpt.ip(1, '255.255.255.0'), dhcpOpt.ip(6, '192.168.0.1', '8.8.8.8'), dhcpOpt.raw(121, hex('18 0a 0b 0c c0a80001'))] });
  const { ds, s } = run([
    [{ mac, ip: '0.0.0.0' }, { mac: 'ff:ff:ff:ff:ff:ff', ip: '255.255.255.255' }, 68, 67, disc],
    [B, { mac, ip: '192.168.0.23' }, 67, 68, ack],
  ]);
  assert.deepEqual(s.bugs, []);
  assert.equal(ds[0].columns.protocol, 'DHCP');
  assert.equal(ds[0].columns.info, 'DHCP Discover - Transaction ID 0x3903f326');
  assert.equal(ds[1].columns.info, 'DHCP ACK      - Transaction ID 0x3903f326');
  assert.equal(v1(ds[0], 'dhcp.option.dhcp'), 1);
  assert.equal(v1(ds[0], 'dhcp.option.hostname'), 'laptop');
  assert.deepEqual(v(ds[0], 'dhcp.option.request_list_item'), [1, 3, 6]);
  assert.equal(v1(ds[0], 'dhcp.hw.mac_addr'), mac);
  assert.equal(v1(ds[1], 'dhcp.ip.your'), '192.168.0.23');
  assert.equal(v1(ds[1], 'dhcp.option.ip_address_lease_time'), 86400);
  assert.equal(ds[1].fields.get('dhcp.option.ip_address_lease_time')[0].label, 'IP Address Lease Time: 1 day (86400)');
  assert.deepEqual(v(ds[1], 'dhcp.option.domain_name_server'), ['192.168.0.1', '8.8.8.8']);
  assert.match(ds[1].fields.get('dhcp.option.classless_static_route')[0].label, /10\.11\.12\.0\/24-192\.168\.0\.1/);
  // missing end option
  const noEnd = disc.slice(0, 240 + 3);
  const r2 = run([[A, B, 68, 67, noEnd]]);
  assert.ok(r2.ds[0].expert.some((e) => e.abbrev === 'dhcp.end_option_missing'));
});

test('DHCPv6 Solicit/Advertise Info and options', () => {
  const C6 = { mac: A.mac, ip: 'fe80::1' }, S6 = { mac: B.mac, ip: 'fe80::2' };
  const cid = [1, duidLL(A.mac)];
  const { ds, s } = run([
    [C6, { mac: '33:33:00:01:00:02', ip: 'ff02::1:2' }, 546, 547, dhcpv6Message({ msgType: 1, xid: 0xabcdef, options: [cid, [8, be16(0)]] })],
    [S6, C6, 547, 546, dhcpv6Message({ msgType: 2, xid: 0xabcdef, options: [cid, [3, bytes(hex('00000001 00000e10 00001518'), be16(5), be16(24), hex('fd000000000000000000000000000023'), hex('00001c20 00001d4c'))]] })],
  ]);
  assert.deepEqual(s.bugs, []);
  assert.equal(ds[0].columns.info, `Solicit XID: 0xabcdef CID: 00030001${A.mac.replace(/:/g, '')} `);
  assert.equal(v1(ds[1], 'dhcpv6.iaaddr.ip'), 'fd00::23');
  assert.match(ds[1].columns.info, /IAA: fd00::23 $/);
  assert.equal(v1(ds[0], 'dhcpv6.duidll.link_layer_addr_ether'), A.mac);
});

test('NTP client/server and timestamps', () => {
  const t = 1763452800.5;
  const { ds, s } = run([
    [A, B, 123, 123, ntpPacket({ mode: 3, xmt: t })],
    [B, A, 123, 123, ntpPacket({ mode: 4, stratum: 2, refid: '10.0.0.1', org: t, rec: t + 0.01, xmt: t + 0.011 })],
  ]);
  assert.deepEqual(s.bugs, []);
  assert.equal(ds[0].columns.info, 'NTP Version 4, client');
  assert.equal(ds[1].columns.info, 'NTP Version 4, server');
  assert.equal(v1(ds[0], 'ntp.flags.mode'), 3);
  assert.equal(v1(ds[1], 'ntp.stratum'), 2);
  assert.equal(v1(ds[0], 'ntp.response_in'), 2);
  assert.equal(v1(ds[1], 'ntp.request_in'), 1);
  assert.equal(v1(ds[1], 'ntp.org').sec, 1763452800);
  assert.match(ds[1].fields.get('ntp.refid')[0].label, /10\.0\.0\.1/);
});

test('SNMP: get/response, value types, OIDs, traps, bad BER', () => {
  const { ds, s } = run([
    [A, B, 52000, 161, snmpGet({ requestId: 7, oids: ['1.3.6.1.2.1.1.3.0', '1.3.6.1.2.1.2.2.1.10.1'] })],
    [B, A, 161, 52000, snmpResponse({ requestId: 7, varbinds: [{ oid: '1.3.6.1.2.1.1.3.0', value: { type: 'ticks', value: 4242 } }, { oid: '1.3.6.1.2.1.2.2.1.10.1', value: { type: 'counter64', value: 2n ** 40n } }] })],
    [B, A, 49152, 162, snmpTrapV1({ enterprise: '1.3.6.1.4.1.9', agent: '192.168.0.1', generic: 2, ticks: 5 })],
    [A, B, 52001, 161, snmpMessage({ pdu: 'set', requestId: 8, varbinds: [{ oid: '1.3.6.1.2.1.1.4.0', value: { type: 'str', value: 'noc' } }, { oid: '1.3.6.1.2.1.1.7.0', value: { type: 'int', value: -5 } }] })],
    [A, B, 52002, 161, hex('30 82 ff ff 02 01 01')],
    [A, B, 52003, 161, hex('30 0b 02 01 01 04 03 616263 a0 05 02')],
  ]);
  assert.deepEqual(s.bugs, []);
  assert.equal(ds[0].columns.info, 'get-request 1.3.6.1.2.1.1.3.0 1.3.6.1.2.1.2.2.1.10.1');
  assert.deepEqual(v(ds[0], 'snmp.name'), ['1.3.6.1.2.1.1.3.0', '1.3.6.1.2.1.2.2.1.10.1']);
  assert.equal(v1(ds[0], 'snmp.version'), 1);
  assert.equal(v1(ds[0], 'snmp.community'), 'public');
  assert.equal(v1(ds[0], 'snmp.response_in'), 2);
  assert.equal(v1(ds[1], 'snmp.response_to'), 1);
  assert.equal(v1(ds[1], 'snmp.value.timeticks'), 4242n);
  assert.equal(v1(ds[1], 'snmp.value.counter'), 2n ** 40n);
  assert.equal(ds[2].columns.info, 'trap iso.3.6.1.4.1.9');
  assert.equal(v1(ds[2], 'snmp.generic_trap'), 2);
  assert.equal(v1(ds[2], 'snmp.agent_addr'), '192.168.0.1');
  assert.equal(v1(ds[3], 'snmp.value.int'), -5n);
  assert.equal(Buffer.from(v1(ds[3], 'snmp.value.octets')).toString(), 'noc');
  // not BER at all: plain data, like Wireshark; BER that breaks inside: malformed
  assert.equal(ds[4].layers.at(-1), 'data');
  assert.ok(ds[5].fields.has('_ws.malformed'));
});

test('Syslog facility, level, tag', () => {
  const { ds, s } = run([[B, A, 514, 514, syslogMessage({ facility: 4, severity: 4, timestamp: 'Nov 18 13:00:20', host: 'gw', msg: 'sshd[812]: Failed password' })]]);
  assert.deepEqual(s.bugs, []);
  const d = ds[0];
  assert.equal(d.columns.protocol, 'Syslog');
  assert.equal(d.columns.info, 'AUTH.WARNING: Nov 18 13:00:20 gw sshd[812]: Failed password');
  assert.equal(v1(d, 'syslog.facility'), 4);
  assert.equal(v1(d, 'syslog.level'), 4);
  assert.equal(v1(d, 'syslog.hostname'), 'gw');
  assert.equal(v1(d, 'syslog.procid'), 'sshd');
});

test('TFTP: request, data on a new server port, error', () => {
  const { ds, s } = run([
    [A, B, 3000, 69, tftp.rrq('boot.bin', 'octet', { blksize: 512 })],
    [B, A, 4000, 3000, tftp.data(1, new Uint8Array(100))],
    [A, B, 3000, 4000, tftp.ack(1)],
    [B, A, 4001, 3000, tftp.error(1, 'File not found')],
  ]);
  assert.deepEqual(s.bugs, []);
  assert.equal(ds[0].columns.info, 'Read Request, File: boot.bin, Transfer type: octet, blksize=512');
  assert.equal(ds[1].columns.protocol, 'TFTP');
  assert.equal(ds[1].columns.info, 'Data Packet, Block: 1 (last)');
  assert.equal(v1(ds[1], 'tftp.destination_file'), 'boot.bin');
  assert.equal(ds[1].layers.at(-1), 'data');
  // Wireshark 4.6 decodes the client's ACKs to the server's new port as TFTP too (older versions left plain data)
  assert.equal(ds[2].layers.at(-1), 'tftp');
  assert.equal(ds[2].columns.info, 'Acknowledgement, Block: 1');
  assert.equal(ds[3].columns.info, 'Error Code, Code: File not found, Message: File not found');
  assert.ok(ds[3].expert.some((e) => e.abbrev === 'tftp.error'));
});

test('name-service samples build, round-trip through pcapng and dissect cleanly', () => {
  for (const smp of samples) {
    assert.ok(smp.id && smp.group && smp.icon && smp.ko.length === 2 && smp.en.length === 2);
    const file = smp.build();
    const back = readCapture(writePcapng(file), smp.id + '.pcapng');
    assert.equal(back.frames.length, file.frames.length);
    const { ds, s } = dissectAll(back);
    assert.deepEqual(s.bugs, [], smp.id);
    for (const d of ds) assert.ok(!d.fields.has('_ws.malformed'), `${smp.id}: malformed frame`);
    // determinism (IPv4 IDs come from synth's shared counter, so compare the decoded view)
    const again = dissectAll(smp.build()).ds.map((d) => d.columns.info);
    assert.deepEqual(again, ds.map((d) => d.columns.info));
  }
});
