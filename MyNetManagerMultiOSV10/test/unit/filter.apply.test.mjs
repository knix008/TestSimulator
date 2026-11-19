// Apply/Prepare as Filter, conversation filters, autocomplete.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compileFilter, filterForNode, conversationFilter, combineFilters, suggestFields, suggestValues, completionContext,
} from '../../src/domain/filter/index.js';
import { FIELDS, n, tcpPacket, udpDnsPacket, text } from './filter.fixtures.mjs';

const opts = { fields: FIELDS };
const node = (abbrev, value, type) => n(abbrev, value, 0, 0, null, type);

test('filterForNode writes every field type the way Wireshark does', () => {
  const cases = [
    [node('tcp.srcport', 443), 'tcp.srcport == 443'],
    [node('eth.type', 0x0800), 'eth.type == 0x0800'],                       // hex base, width from bits
    [node('tcp.flags', 0x012), 'tcp.flags == 0x012'],
    [node('tcp.flags.syn', true), 'tcp.flags.syn == 1'],
    [node('tcp.flags.syn', false), 'tcp.flags.syn == 0'],
    [node('ip.src', '10.0.0.1'), 'ip.src == 10.0.0.1'],
    [node('ipv6.src', 'fe80::1'), 'ipv6.src == fe80::1'],
    [node('eth.src', 'a4:83:e7:12:34:56'), 'eth.src == a4:83:e7:12:34:56'],
    [node('http.host', 'say "hi"\\x'), 'http.host == "say \\"hi\\"\\\\x"'],
    [node('tcp.payload', Uint8Array.of(0x47, 0x45, 0x54)), 'tcp.payload == 47:45:54'],
    [node('dns.id', 0x1234n), 'dns.id == 4660'],
    [node('tcp.time_delta', 0.5), 'tcp.time_delta == 0.500000000'],
    [node('frame.number', 7), 'frame.number == 7'],
    [node('frame.time', { sec: 1700000000, nsec: 123 }), 'frame.time == "2023-11-14 22:13:20.000000123Z"'],
    [node('tcp', null), 'tcp'],
    [node('tcp.analysis.flags', null), 'tcp.analysis.flags'],
    [node('smb2.fid', '0011aabb-ccdd-eeff-0011-223344556677'), 'smb2.fid == 0011aabb-ccdd-eeff-0011-223344556677'],
  ];
  for (const [nd, want] of cases) {
    const f = filterForNode(nd, opts);
    assert.equal(f, want);
    assert.ok(compileFilter(f, opts).ok, `${f}: ${compileFilter(f, opts).error}`);
  }
  assert.equal(filterForNode(text('Expert Info'), opts), null);
  assert.equal(filterForNode(null, opts), null);
});

test('filters made from a node match the packet it came from', () => {
  const d = tcpPacket({ payload: 'abc', flags: 0x012 });
  for (const [abbrev, nodes] of d.fields) {
    for (const nd of nodes) {
      const f = filterForNode(nd, opts);
      if (!f) continue;
      const c = compileFilter(f, opts);
      assert.ok(c.ok, `${f}: ${c.error}`);
      assert.equal(c.test(d), true, `${abbrev}: ${f}`);
    }
  }
});

test('Apply/Prepare as Filter combinations', () => {
  const nd = node('tcp.port', 80);
  assert.equal(filterForNode(nd, { ...opts, mode: 'selected', current: 'udp' }), 'tcp.port == 80');
  assert.equal(filterForNode(nd, { ...opts, mode: 'not' }), '!(tcp.port == 80)');
  assert.equal(filterForNode(nd, { ...opts, mode: 'and', current: 'ip' }), '(ip) && (tcp.port == 80)');
  assert.equal(filterForNode(nd, { ...opts, mode: 'or', current: 'ip' }), '(ip) || (tcp.port == 80)');
  assert.equal(filterForNode(nd, { ...opts, mode: 'andNot', current: 'ip' }), '(ip) && !(tcp.port == 80)');
  assert.equal(filterForNode(nd, { ...opts, mode: 'orNot', current: 'ip' }), '(ip) || !(tcp.port == 80)');
  assert.equal(filterForNode(nd, { ...opts, mode: 'and', current: '' }), 'tcp.port == 80');
  assert.equal(filterForNode(nd, { ...opts, mode: 'andNot', current: ' ' }), '!(tcp.port == 80)');
  assert.equal(combineFilters('a', 'b', 'or'), '(a) || (b)');
  assert.throws(() => combineFilters('a', 'b', 'bogus'));
});

test('conversation filters from dissections and summaries', () => {
  const d = tcpPacket({ src: '10.0.0.1', dst: '10.0.0.2', sport: 1234, dport: 80 });
  assert.equal(conversationFilter('eth', d), 'eth.addr==a4:83:e7:12:34:56 && eth.addr==00:11:32:aa:bb:cc');
  assert.equal(conversationFilter('ip', d), 'ip.addr==10.0.0.1 && ip.addr==10.0.0.2');
  assert.equal(conversationFilter('ipv4', d), 'ip.addr==10.0.0.1 && ip.addr==10.0.0.2');
  assert.equal(conversationFilter('tcp', d), 'ip.addr==10.0.0.1 && tcp.port==1234 && ip.addr==10.0.0.2 && tcp.port==80');
  assert.equal(conversationFilter('udp', d), null);
  assert.equal(conversationFilter('ipv6', d), null);
  const dns = udpDnsPacket();
  assert.equal(conversationFilter('udp', dns), 'ip.addr==192.168.0.10 && udp.port==53000 && ip.addr==192.168.0.1 && udp.port==53');
  const s6 = { no: 1, src: 'fe80::1', dst: 'fe80::2', srcport: 546, dstport: 547, layers: 'eth:ethertype:ipv6:udp:dhcpv6' };
  assert.equal(conversationFilter('ipv6', s6), 'ipv6.addr==fe80::1 && ipv6.addr==fe80::2');
  assert.equal(conversationFilter('udp', s6), 'ipv6.addr==fe80::1 && udp.port==546 && ipv6.addr==fe80::2 && udp.port==547');
  assert.equal(conversationFilter('tcp', s6), null);
  // every produced filter selects the packet
  for (const k of ['eth', 'ip', 'tcp']) assert.equal(compileFilter(conversationFilter(k, d), opts).test(d), true, k);
});

test('suggestFields ranks protocols and shallow names first', () => {
  const s = suggestFields('tc', 10, opts);
  assert.equal(s[0].abbrev, 'tcp');
  const t = suggestFields('tcp.', 100, opts).map((x) => x.abbrev);
  assert.ok(t.indexOf('tcp.port') < t.indexOf('tcp.flags.syn'));
  assert.ok(t.every((a) => a.startsWith('tcp.')));
  assert.deepEqual(suggestFields('ip.src', 5, opts).map((x) => x.abbrev), ['ip.src']);
  assert.equal(suggestFields('', 3, opts).length, 3);
  assert.ok(suggestFields('TCP.P', 10, opts).some((x) => x.abbrev === 'tcp.port'));
});

test('suggestValues gives value-string names and booleans', () => {
  const v = suggestValues('dns.qry.type', opts);
  assert.ok(v.some((x) => x.value === 28 && x.label === 'AAAA' && x.text === 'AAAA'));
  assert.deepEqual(suggestValues('tcp.flags.syn', opts).map((x) => x.text), ['1', '0']);
  assert.deepEqual(suggestValues('tcp.port', opts), []);
  assert.deepEqual(suggestValues('nope', opts), []);
});

test('completionContext tells the UI what is being typed', () => {
  assert.deepEqual(completionContext('tcp.po'), { kind: 'field', token: 'tcp.po', start: 0, end: 6 });
  const v = completionContext('dns.qry.type == AA');
  assert.equal(v.kind, 'value');
  assert.equal(v.field, 'dns.qry.type');
  assert.equal(v.start, 16);
  assert.equal(completionContext('tcp.port ').kind, 'operator');
  assert.equal(completionContext('tcp && ud').kind, 'field');
  assert.equal(completionContext('dns.qry.type in {A, AA').field, 'dns.qry.type');
});
