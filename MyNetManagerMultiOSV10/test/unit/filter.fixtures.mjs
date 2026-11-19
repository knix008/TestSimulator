// Hand-built Dissections and a small field registry for the display-filter tests
// (independent of the real dissectors). Not a test file itself.

export const FIELDS = new Map();
const reg = (abbrev, name, type, extra = {}) => FIELDS.set(abbrev, { abbrev, name, type, protocol: abbrev.split('.')[0], ...extra });
for (const p of ['frame', 'eth', 'ip', 'ipv6', 'tcp', 'udp', 'dns', 'http', 'arp', 'icmp', 'data']) reg(p, p.toUpperCase(), 'protocol');
reg('frame.number', 'Frame Number', 'framenum');
reg('frame.len', 'Frame Length', 'uint', { bits: 32 });
reg('frame.time', 'Arrival Time', 'abs_time');
reg('frame.time_relative', 'Time since reference', 'rel_time');
reg('frame.protocols', 'Protocols in frame', 'string');
reg('frame.marked', 'Frame is marked', 'bool');
reg('eth.src', 'Source', 'ether');
reg('eth.dst', 'Destination', 'ether');
reg('eth.addr', 'Address', 'ether');
reg('eth.type', 'Type', 'uint', { bits: 16, base: 'hex', strings: { 0x0800: 'IPv4', 0x86dd: 'IPv6', 0x0806: 'ARP' } });
reg('ip.src', 'Source Address', 'ipv4');
reg('ip.dst', 'Destination Address', 'ipv4');
reg('ip.addr', 'Source or Destination Address', 'ipv4');
reg('ip.ttl', 'Time to Live', 'uint', { bits: 8 });
reg('ip.proto', 'Protocol', 'uint', { bits: 8, strings: { 6: 'TCP', 17: 'UDP', 1: 'ICMP' } });
reg('ip.flags', 'Flags', 'uint', { bits: 8, base: 'hex' });
reg('ip.flags.df', "Don't fragment", 'bool', { bitmask: 0x40, tfs: ['Set', 'Not set'] });
reg('ip.checksum.status', 'Header checksum status', 'uint', { bits: 8, strings: { 0: 'Bad', 1: 'Good', 2: 'Unverified' } });
reg('ipv6.src', 'Source Address', 'ipv6');
reg('ipv6.dst', 'Destination Address', 'ipv6');
reg('ipv6.addr', 'Source or Destination Address', 'ipv6');
reg('tcp.srcport', 'Source Port', 'uint', { bits: 16 });
reg('tcp.dstport', 'Destination Port', 'uint', { bits: 16 });
reg('tcp.port', 'Source or Destination Port', 'uint', { bits: 16 });
reg('tcp.flags', 'Flags', 'uint', { bits: 12, base: 'hex', bitmask: 0xfff });
reg('tcp.flags.syn', 'Syn', 'bool', { bitmask: 0x002 });
reg('tcp.flags.ack', 'Acknowledgment', 'bool', { bitmask: 0x010 });
reg('tcp.flags.reset', 'Reset', 'bool', { bitmask: 0x004 });
reg('tcp.flags.fin', 'Fin', 'bool', { bitmask: 0x001 });
reg('tcp.seq', 'Sequence Number', 'uint', { bits: 32 });
reg('tcp.len', 'TCP Segment Len', 'uint', { bits: 32 });
reg('tcp.stream', 'Stream index', 'uint', { bits: 32 });
reg('tcp.payload', 'TCP payload', 'bytes');
reg('tcp.analysis.flags', 'TCP Analysis Flags', 'none');
reg('tcp.time_delta', 'Time since previous frame in this TCP stream', 'rel_time');
reg('udp.srcport', 'Source Port', 'uint', { bits: 16 });
reg('udp.dstport', 'Destination Port', 'uint', { bits: 16 });
reg('udp.port', 'Source or Destination Port', 'uint', { bits: 16 });
reg('udp.length', 'Length', 'uint', { bits: 16 });
reg('udp.payload', 'Payload', 'bytes');
reg('dns.qry.name', 'Name', 'string');
reg('dns.qry.type', 'Type', 'uint', { bits: 16, strings: { 1: 'A', 28: 'AAAA', 5: 'CNAME', 15: 'MX' } });
reg('dns.flags.response', 'Response', 'bool', { tfs: ['Message is a response', 'Message is a query'] });
reg('dns.a', 'Address', 'ipv4');
reg('dns.id', 'Transaction ID', 'uint64');
reg('http.request.method', 'Request Method', 'string');
reg('http.request.uri', 'Request URI', 'string');
reg('http.host', 'Host', 'string');
reg('http.response.code', 'Status Code', 'uint', { bits: 16 });
reg('http.time', 'Time since request', 'rel_time');
reg('http.request', 'Request', 'bool');
reg('arp.opcode', 'Opcode', 'uint', { bits: 16, strings: { 1: 'request', 2: 'reply' } });
reg('icmp.type', 'Type', 'uint', { bits: 8 });
reg('data.data', 'Data', 'bytes');
reg('smb2.fid', 'File Id', 'guid');
reg('snmp.name', 'Object Name', 'oid');
reg('tcp.checksum.status', 'Checksum Status', 'uint', { bits: 8, strings: { 0: 'Bad', 1: 'Good', 2: 'Unverified' } });

const te = new TextEncoder();
const hexb = (h) => Uint8Array.from(h.replace(/[^0-9a-f]/gi, '').match(/../g).map((x) => parseInt(x, 16)));

/** n(abbrev, value, type?, start, length, children) → Node */
export function n(abbrev, value, start = 0, length = 0, children = null, type) {
  const t = type || (FIELDS.get(abbrev) || { type: 'none' }).type;
  return { abbrev, label: `${abbrev}: ${value}`, value: t === 'protocol' ? null : value, type: t, start, length, source: 0, children, generated: false, hidden: false };
}
export const text = (label) => ({ abbrev: null, label, value: null, type: 'none', start: 0, length: 0, source: 0, children: null });

export function dissection(tree, data = new Uint8Array(0), extra = {}) {
  const fields = new Map();
  const layers = [];
  const walk = (nodes) => {
    for (const x of nodes) {
      if (x.abbrev) { if (!fields.has(x.abbrev)) fields.set(x.abbrev, []); fields.get(x.abbrev).push(x); }
      if (x.type === 'protocol') layers.push(x.abbrev);
      if (x.children) walk(x.children);
    }
  };
  walk(tree);
  return { tree, columns: {}, fields, layers, expert: [], sources: [{ name: 'Frame', data }], ...extra };
}

/**
 * A TCP/IPv4 packet: ether a4:83:e7:12:34:56 → 00:11:32:aa:bb:cc, ip src → dst, ports, flags, payload.
 * Builds real bytes so slices, 'frame contains' and protocol bytes work.
 */
export function tcpPacket({ no = 1, src = '192.168.0.10', dst = '93.184.216.34', sport = 50000, dport = 80, flags = 0x018, payload = '', ttl = 64, ethDst = '00:11:32:aa:bb:cc', stream = 0, http = null, extraTcp = [] } = {}) {
  const pl = typeof payload === 'string' ? te.encode(payload) : payload;
  const ipb = (s) => s.split('.').map(Number);
  const data = new Uint8Array(54 + pl.length);
  data.set(hexb(ethDst), 0); data.set(hexb('a4:83:e7:12:34:56'), 6); data.set([8, 0], 12);
  data.set([0x45, 0, (40 + pl.length) >> 8, (40 + pl.length) & 255, 0, 1, 0x40, 0, ttl, 6, 0, 0], 14);
  data.set(ipb(src), 26); data.set(ipb(dst), 30);
  data.set([sport >> 8, sport & 255, dport >> 8, dport & 255, 0, 0, 0, 1, 0, 0, 0, 0, 0x50, flags & 255, 0xff, 0xff, 0, 0, 0, 0], 34);
  data.set(pl, 54);
  const tcpKids = [
    n('tcp.srcport', sport, 34, 2), n('tcp.dstport', dport, 36, 2),
    n('tcp.port', sport, 34, 2), n('tcp.port', dport, 36, 2),
    n('tcp.stream', stream), n('tcp.seq', 1, 38, 4), n('tcp.len', pl.length),
    n('tcp.flags', flags, 46, 2, [n('tcp.flags.syn', !!(flags & 2), 46, 2), n('tcp.flags.ack', !!(flags & 16), 46, 2), n('tcp.flags.reset', !!(flags & 4), 46, 2), n('tcp.flags.fin', !!(flags & 1), 46, 2)]),
    ...extraTcp,
  ];
  if (pl.length) tcpKids.push(n('tcp.payload', pl, 54, pl.length));
  const tree = [
    n('frame', null, 0, data.length, [n('frame.number', no), n('frame.len', data.length), n('frame.protocols', 'eth:ethertype:ip:tcp' + (http ? ':http' : '')), n('frame.time', { sec: 1700000000 + no, nsec: 500000000 }), n('frame.time_relative', no - 1)]),
    n('eth', null, 0, 14, [n('eth.dst', ethDst, 0, 6, [n('eth.addr', ethDst, 0, 6)]), n('eth.src', 'a4:83:e7:12:34:56', 6, 6, [n('eth.addr', 'a4:83:e7:12:34:56', 6, 6)]), n('eth.type', 0x0800, 12, 2)]),
    n('ip', null, 14, 20, [n('ip.ttl', ttl, 22, 1), n('ip.proto', 6, 23, 1), n('ip.flags', 0x40, 20, 1, [n('ip.flags.df', true, 20, 1)]), n('ip.checksum.status', 2), n('ip.src', src, 26, 4), n('ip.addr', src, 26, 4), n('ip.dst', dst, 30, 4), n('ip.addr', dst, 30, 4)]),
    n('tcp', null, 34, 20 + pl.length, tcpKids),
  ];
  if (http) tree.push(n('http', null, 54, pl.length, http));
  return dissection(tree, data);
}

export function udpDnsPacket({ no = 2, src = '192.168.0.10', dst = '192.168.0.1', name = 'www.example.com', qtype = 1, response = false, answers = [] } = {}) {
  const data = new Uint8Array(42 + 30);
  data.set(hexb('00:11:32:aa:bb:cc'), 0); data.set(hexb('a4:83:e7:12:34:56'), 6); data.set([8, 0], 12);
  data.set(te.encode(name).subarray(0, 30), 42);
  const tree = [
    n('frame', null, 0, data.length, [n('frame.number', no), n('frame.len', data.length)]),
    n('eth', null, 0, 14, [n('eth.dst', '00:11:32:aa:bb:cc', 0, 6), n('eth.src', 'a4:83:e7:12:34:56', 6, 6), n('eth.type', 0x0800, 12, 2)]),
    n('ip', null, 14, 20, [n('ip.ttl', 128), n('ip.proto', 17), n('ip.src', src), n('ip.addr', src), n('ip.dst', dst), n('ip.addr', dst)]),
    n('udp', null, 34, 8, [n('udp.srcport', 53000), n('udp.dstport', 53), n('udp.port', 53000), n('udp.port', 53), n('udp.length', 38), n('udp.payload', data.subarray(42), 42, 30)]),
    n('dns', null, 42, 30, [n('dns.flags.response', response), n('dns.qry.name', name), n('dns.qry.type', qtype), n('dns.id', 0x1234n), ...answers.map((a) => n('dns.a', a))]),
  ];
  return dissection(tree, data);
}

export function arpPacket({ no = 3 } = {}) {
  const data = new Uint8Array(42);
  data.fill(0xff, 0, 6); data.set(hexb('a4:83:e7:12:34:56'), 6); data.set([8, 6], 12);
  const tree = [
    n('frame', null, 0, 42, [n('frame.number', no), n('frame.len', 42)]),
    n('eth', null, 0, 14, [n('eth.dst', 'ff:ff:ff:ff:ff:ff', 0, 6), n('eth.src', 'a4:83:e7:12:34:56', 6, 6), n('eth.type', 0x0806, 12, 2)]),
    n('arp', null, 14, 28, [n('arp.opcode', 1, 20, 2)]),
  ];
  return dissection(tree, data);
}

/** IPv6 + a tunnelled (second) IPv4 layer for layer-operator tests. */
export function tunnelPacket() {
  const tree = [
    n('frame', null, 0, 0, [n('frame.number', 4)]),
    n('ipv6', null, 0, 40, [n('ipv6.src', 'fe80::1'), n('ipv6.addr', 'fe80::1'), n('ipv6.dst', 'ff02::1:ff00:2'), n('ipv6.addr', 'ff02::1:ff00:2')]),
    n('ip', null, 40, 20, [n('ip.src', '10.0.0.1'), n('ip.addr', '10.0.0.1'), n('ip.dst', '10.0.0.2'), n('ip.addr', '10.0.0.2'), n('ip.ttl', 64)]),
    n('ip', null, 60, 20, [n('ip.src', '172.16.0.1'), n('ip.addr', '172.16.0.1'), n('ip.dst', '172.16.0.2'), n('ip.addr', '172.16.0.2'), n('ip.ttl', 3)]),
    n('icmp', null, 80, 8, [n('icmp.type', 8)]),
  ];
  return dissection(tree, new Uint8Array(88));
}

export const httpGet = () => tcpPacket({
  no: 5, payload: 'GET /index.html HTTP/1.1\r\nHost: Example.com\r\n\r\n',
  http: [n('http.request', true), n('http.request.method', 'GET'), n('http.request.uri', '/index.html'), n('http.host', 'Example.com')],
});
export const httpResp = () => tcpPacket({
  no: 6, src: '93.184.216.34', dst: '192.168.0.10', sport: 80, dport: 50000, payload: 'HTTP/1.1 404 Not Found\r\n\r\n',
  http: [n('http.response.code', 404), n('http.time', 0.0123)],
});
