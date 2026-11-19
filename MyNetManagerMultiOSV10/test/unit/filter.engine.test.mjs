// Display filter language semantics (Wireshark 4.6 behaviour) over hand-built dissections.
import test from 'node:test';
import assert from 'node:assert/strict';
import { compileFilter } from '../../src/domain/filter/index.js';
import { FIELDS, tcpPacket, udpDnsPacket, arpPacket, tunnelPacket, httpGet, httpResp, n, dissection } from './filter.fixtures.mjs';

const syn = tcpPacket({ no: 1, flags: 0x002, dport: 80 });
const synack = tcpPacket({ no: 2, flags: 0x012, src: '93.184.216.34', dst: '192.168.0.10', sport: 80, dport: 50000 });
const tls = tcpPacket({ no: 7, dport: 443, payload: 'hello world', stream: 1, extraTcp: [n('tcp.analysis.flags', null)] });
const dns = udpDnsPacket({ no: 8, qtype: 28, name: 'www.Example.com' });
const dnsResp = udpDnsPacket({ no: 9, response: true, answers: ['93.184.216.34', '93.184.216.35'] });
const arp = arpPacket({ no: 10 });
const tun = tunnelPacket();
const get = httpGet();
const resp = httpResp();
const ALL = [syn, synack, tls, dns, dnsResp, arp, tun, get, resp];
const NO = new Map(ALL.map((d) => [d, d.fields.get('frame.number')[0].value]));

function match(filter, set = ALL) {
  const c = compileFilter(filter, { fields: FIELDS });
  assert.ok(c.ok, `${filter}: ${c.error}`);
  return set.filter((d) => c.test(d)).map((d) => NO.get(d));
}
const eq = (filter, expect) => assert.deepEqual(match(filter), expect, filter);

test('protocol presence and field existence', () => {
  eq('tcp', [1, 2, 7, 5, 6]);
  eq('udp', [8, 9]);
  eq('!tcp', [8, 9, 10, 4]);
  eq('arp', [10]);
  eq('http', [5, 6]);
  eq('dns.a', [9]);
  // like Wireshark, a boolean field exists whether it is set or not
  eq('tcp.flags.syn', [1, 2, 7, 5, 6]);
  eq('tcp.analysis.flags', [7]);
});

test('comparison operators, symbolic and word forms', () => {
  eq('tcp.port == 80', [1, 2, 5, 6]);
  eq('tcp.port eq 80', [1, 2, 5, 6]);
  eq('tcp.dstport > 1000', [2, 6]);
  eq('tcp.dstport gt 1000', [2, 6]);
  eq('tcp.dstport >= 443', [2, 7, 6]);
  eq('tcp.dstport ge 443', [2, 7, 6]);
  eq('tcp.dstport < 443', [1, 5]);
  eq('tcp.dstport lt 443', [1, 5]);
  eq('tcp.dstport <= 443', [1, 7, 5]);
  eq('tcp.dstport le 443', [1, 7, 5]);
  eq('ip.ttl ne 64', [8, 9]); // the tunnel packet also has a TTL of 64
});

test('!= is "all not equal", !== / ~= is "any not equal", === is "all equal"; missing fields never match', () => {
  eq('tcp.port != 80', [7]);            // UDP/ARP packets have no tcp.port → false
  eq('!(tcp.port == 80)', [7, 8, 9, 10, 4]);
  eq('tcp.port !== 80', [1, 2, 7, 5, 6]);
  eq('tcp.port ~= 80', [1, 2, 7, 5, 6]);
  eq('tcp.port === 80', []);
  eq('ip.addr === 192.168.0.10', []);
  eq('all ip.addr == 192.168.0.10', []);
  eq('any ip.addr != 192.168.0.10', [1, 2, 7, 8, 9, 4, 5, 6]);
  eq('all tcp.port > 1', [1, 2, 7, 5, 6]);
  eq('ip.ttl === 64', [1, 2, 7, 5, 6]); // the tunnel packet has ttl 64 and 3
  eq('ip.ttl == 3', [4]);
});

test('logical operators, word forms, xor and precedence', () => {
  eq('tcp && ip.ttl == 64', [1, 2, 7, 5, 6]);
  eq('tcp and http', [5, 6]);
  eq('udp || arp', [8, 9, 10]);
  eq('udp or arp', [8, 9, 10]);
  eq('tcp xor http', [1, 2, 7]);
  eq('tcp ^^ http', [1, 2, 7]);
  eq('not tcp and not udp', [10, 4]);
  // ! binds tighter than relations' surroundings: !a == b is !(a == b)
  eq('!tcp.port == 80', [7, 8, 9, 10, 4]);
  eq('udp || tcp && tcp.port == 443', [7, 8, 9]);
  eq('(udp || tcp) && ip.ttl == 128', [8, 9]);
  eq('!(tcp || udp || arp)', [4]);
});

test('membership: sets, ranges, commas and spaces, "not in"', () => {
  eq('tcp.port in {443, 8080}', [7]);
  eq('tcp.port in {443 8080}', [7]);
  eq('tcp.dstport in {1..100, 443}', [1, 7, 5]);
  eq('tcp.dstport in {440..450}', [7]);
  eq('tcp.port not in {80, 443}', []);
  eq('tcp.dstport not in {80, 443}', [2, 6]);
  eq('ip.addr in {192.168.0.0/24}', [1, 2, 7, 8, 9, 5, 6]);
  eq('dns.qry.type in {A, AAAA}', [8, 9]);
  eq('http.request.method in {"GET", "POST"}', [5]);
  eq('all ip.addr in {192.168.0.0/16}', [8, 9]);
});

test('contains and matches (with (?i)), strings vs bytes', () => {
  eq('frame contains "hello"', [7]);
  eq('tcp contains "hello"', [7]);           // a protocol's value runs to the end of the packet
  eq('frame contains 68:65:6c', [7]);
  eq('frame contains "\\x68\\x65"', [7]);
  eq("frame contains 'h'", [7, 5]);
  eq('http.host contains "Example"', [5]);
  eq('http.host contains "example"', []);
  eq('http.host matches "(?i)^example\\\\.com$"', [5]);
  eq('http.host matches "^Example"', [5]);
  eq('http.host ~ "ample"', [5]);
  eq('dns.qry.name matches r"\\.com$"', [8, 9]);
  eq('frame matches "(?i)HTTP/1\\\\.1 404"', [6]);
  eq('tcp.payload == "hello world"', [7]);
  eq('tcp.payload[0:5] == "hello"', [7]);
  eq('all http.request.method contains "G"', [5]);
});

test('addresses: IPv4/IPv6 with CIDR, MAC separators, ordering', () => {
  eq('ip.addr == 192.168.0.0/24', [1, 2, 7, 8, 9, 5, 6]);
  eq('ip.src == 10.0.0.0/8', [4]);
  eq('ip.dst > 93.184.216.0', [1, 2, 7, 8, 9, 4, 5, 6]);
  eq('ip.dst < 93.184.216.34', [4]);
  eq('ipv6.addr == fe80::/10', [4]);
  eq('ipv6.dst == ff02::1:ff00:2', [4]);
  eq('ipv6.dst == ff02:0:0:0:0:1:ff00:2', [4]);
  eq('eth.dst == ff:ff:ff:ff:ff:ff', [10]);
  eq('eth.dst == ff-ff-ff-ff-ff-ff', [10]);
  eq('eth.dst == ffff.ffff.ffff', [10]);
  eq('eth.src == a4:83:e7:12:34:56', [1, 2, 7, 8, 9, 10, 5, 6]);
  eq('eth.addr == 00:11:32:aa:bb:cc', [1, 2, 7, 5, 6]);
  eq('dns.a == 93.184.216.35', [9]);
});

test('value strings, booleans, numbers in all bases, 64-bit, char constants', () => {
  eq('dns.qry.type == AAAA', [8]);
  eq('dns.qry.type == "AAAA"', [8]);
  eq('dns.qry.type == 28', [8]);
  eq('dns.qry.type == 0x1c', [8]);
  eq('dns.qry.type == 034', [8]);
  eq('dns.qry.type == 0b11100', [8]);
  eq('arp.opcode == request', [10]);
  eq('ip.checksum.status == "Unverified"', [1, 2, 7, 5, 6]);
  eq('tcp.flags.syn == 1', [1, 2]);
  eq('tcp.flags.syn == True', [1, 2]);
  eq('tcp.flags.syn == true', [1, 2]);
  eq('tcp.flags.syn == 0', [7, 5, 6]);
  eq('tcp.flags.syn == false', [7, 5, 6]);
  eq('ip.flags.df == Set', [1, 2, 7, 5, 6]);
  eq('dns.flags.response == 1', [9]);
  eq('tcp.flags == 0x012', [2]);
  eq('tcp.flags & 0x02', [1, 2]);
  eq('tcp.flags bitwise_and 0x02', [1, 2]);
  eq('tcp.flags & 0x12 == 0x12', [2]);
  eq('dns.id == 0x1234', [8, 9]);
  eq('dns.id > 4000', [8, 9]);
  eq('ip.ttl == \'@\'', [1, 2, 7, 4, 5, 6]); // '@' = 64
});

test('slices of every form', () => {
  eq('eth.src[0:3] == a4:83:e7', [1, 2, 7, 8, 9, 10, 5, 6]);
  eq('eth.dst[1-2] == 11:32', [1, 2, 7, 8, 9, 5, 6]);
  eq('eth.dst[:2] == ff:ff', [10]);
  eq('eth.dst[4:] == bb:cc', [1, 2, 7, 8, 9, 5, 6]);
  eq('eth.dst[-1] == 0xcc', [1, 2, 7, 8, 9, 5, 6]);
  eq('eth.dst[-2:] == bb:cc', [1, 2, 7, 8, 9, 5, 6]);
  eq('frame[12:2] == 08:06', [10]);
  eq('frame[12:2] == 0806', [10]);
  eq('frame[12] == 8', [1, 2, 7, 8, 9, 10, 5, 6]);
  eq('frame[0,6] == 00:a4', [1, 2, 7, 8, 9, 5, 6]);
  eq('eth.dst[0] & 1', [10]);
  eq('ip.src[0] == 192', [1, 7, 8, 9, 5]);
  eq('http.host[0:7] == "Example"', [5]);
  eq('frame[100:10] == 00', []); // past the end: no value
});

test('layer operator #', () => {
  eq('ip.src#1 == 10.0.0.1', [4]);
  eq('ip.src#2 == 172.16.0.1', [4]);
  eq('ip.src#2 == 10.0.0.1', []);
  eq('ip.ttl#2 < 5', [4]);
  eq('ip.ttl#1 < 5', []);
  eq('ip#2', [4]);
  eq('ip.addr#[1-2] == 172.16.0.2', [4]);
  eq('ip.addr#[2:] == 10.0.0.2', []);
  eq('ip.src#-1 == 172.16.0.1', [4]);
});

test('functions len count lower upper string abs max min', () => {
  eq('len(http.host) == 11', [5]);
  eq('len(tcp.payload) > 20', [5, 6]);
  eq('len(tcp) == 31', [7]);
  eq('len(eth.src) == 6', [1, 2, 7, 8, 9, 10, 5, 6]);
  eq('count(ip.addr) == 4', [4]);
  eq('count(ip) == 2', [4]);
  eq('count(tcp.port) == 0', [8, 9, 10, 4]);
  eq('lower(http.host) == "example.com"', [5]);
  eq('upper(dns.qry.name) contains "EXAMPLE"', [8, 9]);
  eq('string(tcp.srcport) == "80"', [2, 6]);
  eq('string(ip.src) matches "^10\\\\."', [4]);
  eq('string(eth.dst) == "ff:ff:ff:ff:ff:ff"', [10]);
  eq('abs(-tcp.srcport) == 80', [2, 6]);
  eq('max(tcp.srcport, tcp.dstport) == 50000', [1, 2, 7, 5, 6]);
  eq('min(tcp.srcport, tcp.dstport) == 443', [7]);
  eq('max(ip.ttl, 100) == 128', [8, 9]);
});

test('arithmetic', () => {
  eq('tcp.srcport + 1 == 81', [2, 6]);
  eq('tcp.srcport - 1 == 79', [2, 6]);
  eq('tcp.dstport * 2 == 886', [7]);
  eq('tcp.dstport / 2 == 221', [7]);
  eq('tcp.dstport % 100 == 43', [7]);
  eq('-tcp.dstport == -443', [7]);
  eq('tcp.srcport + tcp.dstport == 50080', [1, 2, 5, 6]);
  eq('ip.ttl == 60 + 4', [1, 2, 7, 4, 5, 6]);
  eq('tcp.dstport == 400 + 40 + 3', [7]);
});

test('field-to-field comparisons and field references', () => {
  eq('tcp.srcport < tcp.dstport', [2, 6]);
  eq('ip.src == ip.dst', []);
  eq('eth.src == eth.dst', []);
  const c = compileFilter('ip.dst == ${ip.src}', { fields: FIELDS });
  assert.ok(c.ok, c.error);
  assert.equal(c.test(synack, syn), true);  // reference: syn's ip.src = 192.168.0.10 = synack's ip.dst
  assert.equal(c.test(synack, resp), false);
  assert.equal(c.test(synack, tcpPacket({ src: '192.168.0.10' })), true);
  assert.equal(c.test(synack), false); // no reference packet → no value
  const c2 = compileFilter('tcp.port == $tcp.srcport', { fields: FIELDS, reference: syn });
  assert.ok(c2.ok, c2.error);
  assert.equal(c2.test(synack), true);  // 50000
  assert.equal(c2.test(tls), true);     // tls srcport 50000 too
  assert.equal(c2.test(dns), false);
});

test('times: absolute with several formats, relative', () => {
  const local = new Date((1700000001 + 0.5) * 1000);
  const p = (x) => String(x).padStart(2, '0');
  const iso = `${local.getFullYear()}-${p(local.getMonth() + 1)}-${p(local.getDate())} ${p(local.getHours())}:${p(local.getMinutes())}:${p(local.getSeconds())}.5`;
  eq(`frame.time == "${iso}"`, [1]);
  eq('frame.time >= "2023-11-14T22:13:23Z"', [7, 5, 6]);
  eq('frame.time < "Nov 14, 2023 22:13:22.6 UTC"', [1, 2]);
  eq('frame.time_relative > 4', [7, 6]);
  eq('http.time < 0.1', [6]);
});

test('guid and oid fields', () => {
  const d = dissection([n('smb2.fid', '0011aabb-ccdd-eeff-0011-223344556677'), n('snmp.name', '1.3.6.1.2.1.1.1.0')]);
  const ok = (f) => { const c = compileFilter(f, { fields: FIELDS }); assert.ok(c.ok, c.error); return c.test(d); };
  assert.equal(ok('smb2.fid == 0011AABB-CCDD-EEFF-0011-223344556677'), true);
  assert.equal(ok('snmp.name == 1.3.6.1.2.1.1.1.0'), true);
  assert.equal(ok('snmp.name contains "1.3.6"'), true);
});

test('empty filter accepts everything; compiled filters are cached', () => {
  const c = compileFilter('   ', { fields: FIELDS });
  assert.ok(c.ok && c.empty && c.test(arp));
  assert.equal(compileFilter('tcp.port == 80', { fields: FIELDS }), compileFilter('tcp.port == 80', { fields: FIELDS }));
  assert.deepEqual(compileFilter('tcp.port == 80 && ip.src == 1.2.3.4', { fields: FIELDS }).fieldsUsed.sort(), ['ip.src', 'tcp.port']);
});

test('no registry: lenient mode resolves names at run time', () => {
  const c = compileFilter('tcp.port == 80 && ip.addr == 192.168.0.0/16', { fields: new Map() });
  assert.equal(c.ok, false); // an empty registry knows no fields
  const lenient = compileFilter('tcp.port == 80 && ip.addr == 192.168.0.0/16', { fields: null });
  assert.ok(lenient.ok, lenient.error);
  assert.equal(lenient.test(syn), true);
  assert.equal(lenient.test(dns), false);
});
