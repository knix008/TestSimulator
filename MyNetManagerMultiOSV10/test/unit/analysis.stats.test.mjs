// Statistics: hand-built packets first (exact numbers), then sanity checks over the real samples.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as st from '../../src/domain/analysis/stats.js';
import { FIELDS, tcpPacket, udpDnsPacket, arpPacket, httpGet, httpResp, n } from './filter.fixtures.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// frame i ↔ dissection i; times 0, 0.5, 1.0 … s after 1700000000; lengths from the packet bytes
function build(ds) {
  const frames = ds.map((d, i) => ({ no: i + 1, sec: 1700000000 + Math.floor(i / 2), nsec: (i % 2) * 500000000, len: d.sources[0].data.length || 60, caplen: d.sources[0].data.length, iface: 0, linktype: 1, comment: i === 1 ? 'look here' : null, data: d.sources[0].data }));
  const summaries = ds.map((d, i) => {
    const s = { no: i + 1, layers: d.layers.slice(1).join(':'), protocol: d.layers[d.layers.length - 1].toUpperCase(), info: `info ${i + 1}`, src: '', dst: '', length: frames[i].len, expert: d.expert.length ? 'warn' : null };
    const ip = d.fields.get('ip.src');
    if (ip) { s.src = ip[0].value; s.dst = d.fields.get('ip.dst')[0].value; }
    for (const p of ['tcp', 'udp']) if (d.fields.get(p + '.srcport')) { s.srcport = d.fields.get(p + '.srcport')[0].value; s.dstport = d.fields.get(p + '.dstport')[0].value; }
    if (d.fields.get('tcp.stream')) s.tcpStream = d.fields.get('tcp.stream')[0].value;
    return s;
  });
  const map = new Map(frames.map((f, i) => [f, ds[i]]));
  return { frames, summaries, getD: (f) => map.get(f) };
}

const pk = [
  tcpPacket({ flags: 0x002, dport: 80 }),                                                     // 1 client SYN
  tcpPacket({ flags: 0x012, src: '93.184.216.34', dst: '192.168.0.10', sport: 80, dport: 50000 }), // 2 SYN/ACK
  httpGet(),                                                                                    // 3 GET
  httpResp(),                                                                                   // 4 404
  udpDnsPacket({ qtype: 28 }),                                                                  // 5 DNS query
  udpDnsPacket({ response: true, answers: ['1.2.3.4'] }),                                       // 6 DNS response
  arpPacket(),                                                                                  // 7 ARP
  tcpPacket({ dport: 443, stream: 1, payload: 'x'.repeat(1300) }),                              // 8 big TLS-ish
];
pk[5].fields.set('dns.flags.rcode', [n('dns.flags.rcode', 3)]);
pk[3].expert.push({ severity: 'warn', group: 'Sequence', message: 'Previous segment not captured', abbrev: 'tcp.analysis.lost_segment' });
pk[7].expert.push({ severity: 'note', group: 'Sequence', message: 'Retransmission', abbrev: 'tcp.analysis.retransmission' });
pk[7].expert.push({ severity: 'warn', group: 'Sequence', message: 'Previous segment not captured', abbrev: 'tcp.analysis.lost_segment' });
const { frames, summaries, getD } = build(pk);
const opts = { fields: FIELDS };

test('captureProperties: counts, time span, averages, interfaces, comments', () => {
  const file = { name: 'x.pcapng', format: 'pcapng', size: 1234, interfaces: [{ name: 'eth0', description: 'LAN', linktype: 1, snaplen: 262144, tsresol: 6 }], section: { application: 'test' } };
  const p = st.captureProperties(frames, summaries, getD, { file, displayed: [1, 2, 3], marked: new Set([8]) });
  const row = (k) => p.statistics.find((r) => r.key === k);
  const bytes = frames.reduce((a, f) => a + f.len, 0);
  assert.equal(row('packets').captured, 8);
  assert.equal(row('packets').displayed, 3);
  assert.equal(row('packets').marked, 1);
  assert.equal(row('timeSpan').captured, 3.5);
  assert.equal(row('bytes').captured, bytes);
  assert.ok(Math.abs(row('avgPps').captured - 8 / 3.5) < 1e-9);
  assert.ok(Math.abs(row('avgBitsPerSec').captured - (bytes * 8) / 3.5) < 1e-6);
  assert.equal(row('packets').displayedPercent, 37.5);
  assert.equal(p.interfaces[0].packets, 8);
  assert.equal(p.interfaces[0].encapsulation, 'Ethernet');
  assert.equal(p.file.encapsulation, 'Ethernet');
  assert.deepEqual(p.comments, [{ frame: 2, comment: 'look here' }]);
  assert.equal(p.time.elapsed, 3.5);
  assert.equal(p.capture.application, 'test');
});

test('protocolHierarchy: tree of top-level protocols with counts, bytes, end packets', () => {
  const h = st.protocolHierarchy(frames, summaries, getD, opts);
  assert.equal(h.abbrev, 'frame');
  assert.equal(h.packets, 8);
  const eth = h.children[0];
  assert.equal(eth.abbrev, 'eth');
  const ip = eth.children.find((c) => c.abbrev === 'ip');
  const tcp = ip.children.find((c) => c.abbrev === 'tcp');
  assert.equal(tcp.packets, 5);
  assert.equal(tcp.endPackets, 3);
  assert.equal(tcp.children.find((c) => c.abbrev === 'http').packets, 2);
  assert.equal(eth.children.find((c) => c.abbrev === 'arp').endPackets, 1);
  assert.ok(Math.abs(tcp.percentPackets - 62.5) < 1e-9);
  const text = st.formatProtocolHierarchy(h);
  assert.match(text, /^ {6}tcp {32}frames:5 bytes:\d+$/m);
  // the summary-only path gives the same counts here
  const fast = st.protocolHierarchy(frames, summaries, null, opts);
  assert.equal(fast.children[0].children.find((c) => c.abbrev === 'ip').packets, ip.packets);
});

test('conversations: A is the first sender, directions, durations, bps, filters', () => {
  const c = st.conversations(frames, summaries, getD, { kind: 'tcp' });
  const r = c.rows.find((x) => x.portB === 80);
  assert.equal(r.addrA, '192.168.0.10');
  assert.equal(r.portA, 50000);
  assert.equal(r.packets, 4);
  assert.equal(r.packetsAB, 2);
  assert.equal(r.packetsBA, 2);
  assert.equal(r.relStart, 0);
  assert.equal(r.duration, 1.5);
  assert.ok(Math.abs(r.bpsAB - (r.bytesAB * 8) / 1.5) < 1e-9);
  assert.equal(r.filter, 'ip.addr==192.168.0.10 && tcp.port==50000 && ip.addr==93.184.216.34 && tcp.port==80');
  assert.ok(c.columns.includes('Stream ID'));
  const ip = st.conversations(frames, summaries, getD, 'ip');
  assert.equal(ip.kind, 'ipv4');
  assert.equal(ip.rows.length, 2);
  const eth = st.conversations(frames, summaries, getD, { kind: 'eth' });
  assert.ok(eth.rows.some((x) => x.addrB === 'ff:ff:ff:ff:ff:ff'));
  const one = st.conversations(frames, summaries, getD, { kind: 'udp' });
  assert.equal(one.rows[0].duration, 0.5);
  assert.equal(one.rows[0].bpsAB, (one.rows[0].bytesAB * 8) / 0.5);
  assert.throws(() => st.conversations(frames, summaries, getD, { kind: 'nope' }));
  // filter option limits the packets
  assert.equal(st.conversations(frames, summaries, getD, { kind: 'ipv4', filter: 'udp', fields: FIELDS }).rows.length, 1);
});

test('endpoints: tx/rx per address and per port', () => {
  const e = st.endpoints(frames, summaries, getD, { kind: 'ipv4' });
  const me = e.rows.find((r) => r.addr === '192.168.0.10');
  assert.equal(me.packets, 7);
  assert.equal(me.txPackets, 5);
  assert.equal(me.rxPackets, 2);
  assert.equal(me.filter, 'ip.addr==192.168.0.10');
  const tcp = st.endpoints(frames, summaries, getD, { kind: 'tcp' });
  assert.ok(tcp.rows.some((r) => r.addr === '93.184.216.34' && r.port === 80 && r.packets === 4));
});

test('ioGraph: intervals and every calculation', () => {
  const g = st.ioGraph(frames, summaries, getD, {
    interval: 1, fields: FIELDS, series: [
      { name: 'all', calc: 'packets' }, { name: 'bytes', calc: 'bytes' }, { name: 'bits', calc: 'bits' },
      { name: 'tcp', filter: 'tcp', calc: 'packets' }, { name: 'sumlen', calc: 'sum', field: 'frame.len' },
      { name: 'max', calc: 'max', field: 'frame.len' }, { name: 'min', calc: 'min', field: 'frame.len' }, { name: 'avg', calc: 'avg', field: 'frame.len' },
      { name: 'cnt', calc: 'count', field: 'ip.addr' }, { name: 'load', calc: 'load', field: 'http.time' },
    ],
  });
  assert.equal(g.buckets, 4);
  assert.deepEqual(g.times, [0, 1, 2, 3]);
  const v = (name) => g.series.find((s) => s.name === name).values;
  assert.deepEqual(v('all'), [2, 2, 2, 2]);
  assert.deepEqual(v('tcp'), [2, 2, 0, 1]);
  assert.deepEqual(v('bits'), v('bytes').map((b) => b * 8));
  assert.deepEqual(v('sumlen'), v('bytes'));
  assert.equal(v('max')[3], frames[7].len);
  assert.equal(v('min')[3], frames[6].len);
  assert.equal(v('avg')[0], (frames[0].len + frames[1].len) / 2);
  assert.deepEqual(v('cnt'), [4, 4, 4, 2]);
  assert.ok(Math.abs(v('load')[1] - 0.0123) < 1e-12);
  const half = st.ioGraph(frames, summaries, getD, { interval: 0.5 });
  assert.equal(half.buckets, 8);
  assert.throws(() => st.ioGraph(frames, summaries, getD, { series: [{ calc: 'sum' }] }), /needs a field/);
  assert.throws(() => st.ioGraph(frames, summaries, getD, { fields: FIELDS, series: [{ filter: 'tcp.port ==' }] }), /Unexpected end/);
});

test('packetLengths: Wireshark bins with counts, averages and percentages', () => {
  const t = st.packetLengths(frames, summaries, getD, {});
  assert.equal(t.name, 'Packet Lengths');
  assert.equal(t.count, 8);
  assert.deepEqual(t.children.map((c) => c.name), ['0-19', '20-39', '40-79', '80-159', '160-319', '320-639', '640-1279', '1280-2559', '2560-5119', '5120 and greater']);
  const big = t.children.find((c) => c.name === '1280-2559');
  assert.equal(big.count, 1);
  assert.equal(big.percent, 12.5);
  assert.equal(t.min, Math.min(...frames.map((f) => f.len)));
  assert.ok(t.burstRate > 0);
});

test('HTTP packet counter, requests and load distribution', () => {
  const c = st.httpPacketCounter(frames, summaries, getD, {});
  assert.equal(c.count, 2);
  const req = c.children.find((x) => x.name === 'HTTP Request Packets');
  assert.equal(req.children[0].name, 'GET');
  const resp = c.children.find((x) => x.name === 'HTTP Response Packets');
  assert.equal(resp.children[0].name, '4xx: Client Error');
  assert.equal(resp.children[0].children[0].name, '404');
  const r = st.httpRequests(frames, summaries, getD, {});
  assert.equal(r.children[0].name, 'Example.com');
  assert.equal(r.children[0].children[0].name, '/index.html');
  const l = st.httpLoad(frames, summaries, getD, {});
  assert.equal(l.count, 2);
});

test('dnsStats: rcodes, query/response, types, response stats', () => {
  const d = st.dnsStats(frames, summaries, getD, opts);
  assert.equal(d.count, 2);
  const kid = (t, name) => t.children.find((c) => c.name === name);
  assert.equal(kid(kid(d, 'Query/Response'), 'Query').count, 1);
  assert.equal(kid(kid(d, 'Query Type'), 'AAAA').count, 1);
  assert.equal(kid(kid(d, 'rcode'), 'No such name').count, 1);
});

test('ipStats and portTypes', () => {
  const s = st.ipStats(frames, summaries, getD, opts);
  assert.equal(s.allAddresses.count, 7);
  assert.equal(s.allAddresses.children[0].name, '192.168.0.10');
  assert.equal(s.protocolTypes.children.find((c) => c.name === 'TCP').count, 5);
  assert.ok(s.destinationsAndPorts.children.find((c) => c.name === '93.184.216.34').children[0].children.some((p) => p.name === '80'));
  assert.equal(s.ttl.max, 128);
  const p = st.portTypes(frames, summaries, getD, {});
  assert.equal(p.children.find((c) => c.name === 'TCP').count, 5);
  assert.equal(p.children.find((c) => c.name === 'None').count, 1);
});

test('expertInfo groups by severity, group, protocol and summary', () => {
  const e = st.expertInfo(frames, summaries, getD, opts);
  assert.equal(e.total, 3);
  assert.equal(e.items[0].severity, 'warn');
  assert.equal(e.items[0].count, 2);
  assert.deepEqual(e.items[0].frames, [4, 8]);
  assert.equal(e.items[0].protocol, 'TCP');
  assert.deepEqual(e.bySeverity, { error: 0, warn: 2, note: 1, chat: 0 });
});

test('flowGraph: general and TCP flows', () => {
  const g = st.flowGraph(frames, summaries, getD, {});
  assert.equal(g.rows.length, 8);
  assert.equal(g.rows[0].label, 'info 1');
  const t = st.flowGraph(frames, summaries, getD, { mode: 'tcp' });
  assert.equal(t.rows.length, 5);
  assert.equal(t.rows[0].label, 'SYN');
  assert.equal(t.rows[1].label, 'SYN, ACK');
  assert.match(t.rows[2].label, /^PSH, ACK - Len: \d+$/);
  assert.equal(t.rows[0].comment, 'Seq = 1');
  assert.deepEqual(t.nodes.slice(0, 2), ['192.168.0.10', '93.184.216.34']);
});

test('tcpStreamGraph: series for every graph type', () => {
  for (const type of ['stevens', 'tcptrace', 'throughput', 'rtt', 'window']) {
    const g = st.tcpStreamGraph(frames, summaries, getD, { stream: 0, type });
    assert.equal(g.type, type);
    assert.ok(Array.isArray(g.series) && g.series.length >= 1, type);
  }
  const s = st.tcpStreamGraph(frames, summaries, getD, { stream: 0, type: 'stevens', direction: 0 });
  assert.equal(s.direction.src, '192.168.0.10');
  assert.ok(s.series[0].points.length >= 2);
  assert.throws(() => st.tcpStreamGraph(frames, summaries, getD, { stream: 0, type: 'nope' }));
  assert.deepEqual(st.tcpStreamGraph(frames, summaries, getD, { stream: 9 }).series, []);
});

// ── real samples (skipped until the dissectors and samples exist)
async function loadReal() {
  try {
    const dis = await import('../../src/domain/dissect/index.js');
    const { readCapture } = await import('../../src/domain/capture/pcap.js');
    const dir = path.join(ROOT, 'samples');
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).filter((f) => /\.pcapng?$/.test(f)).sort().map((name) => {
      const cap = readCapture(new Uint8Array(fs.readFileSync(path.join(dir, name))), name);
      const s = dis.createSession(cap);
      const sums = cap.frames.map((f) => s.firstPass(f));
      const cache = new Map();
      return { name, cap, sums, getD: (f) => cache.get(f.no) || (cache.set(f.no, dis.dissect(s, f)), cache.get(f.no)), FIELDS: dis.FIELDS, PROTOCOLS: dis.PROTOCOLS };
    });
  } catch { return []; }
}
const real = await loadReal();

test('real samples: every statistic runs and totals agree', { skip: !real.length && 'no samples yet' }, () => {
  for (const r of real) {
    const o = { fields: r.FIELDS, protocols: r.PROTOCOLS };
    const h = st.protocolHierarchy(r.cap.frames, r.sums, r.getD, o);
    assert.equal(h.packets, r.cap.frames.length, r.name);
    const p = st.captureProperties(r.cap.frames, r.sums, r.getD, { file: r.cap });
    assert.equal(p.statistics[0].captured, r.cap.frames.length);
    for (const kind of st.CONVERSATION_KINDS) {
      const c = st.conversations(r.cap.frames, r.sums, r.getD, { kind });
      const e = st.endpoints(r.cap.frames, r.sums, r.getD, { kind });
      const cp = c.rows.reduce((a, x) => a + x.packets, 0);
      const tx = e.rows.reduce((a, x) => a + x.txPackets, 0);
      assert.equal(cp, tx, `${r.name} ${kind}: conversation packets = endpoint tx packets`);
      for (const x of c.rows) assert.equal(x.packets, x.packetsAB + x.packetsBA);
    }
    const io = st.ioGraph(r.cap.frames, r.sums, r.getD, { interval: 1 });
    assert.equal(io.series[0].values.reduce((a, b) => a + b, 0), r.cap.frames.length);
    assert.equal(st.packetLengths(r.cap.frames, r.sums, r.getD, {}).count, r.cap.frames.length);
    st.httpPacketCounter(r.cap.frames, r.sums, r.getD, o); st.httpRequests(r.cap.frames, r.sums, r.getD, o); st.httpLoad(r.cap.frames, r.sums, r.getD, o);
    st.dnsStats(r.cap.frames, r.sums, r.getD, o); st.ipStats(r.cap.frames, r.sums, r.getD, o); st.ipStats(r.cap.frames, r.sums, r.getD, { ...o, version: 6 });
    st.portTypes(r.cap.frames, r.sums, r.getD, o);
    const ex = st.expertInfo(r.cap.frames, r.sums, r.getD, o);
    assert.equal(ex.items.reduce((a, x) => a + x.count, 0), ex.total);
    assert.equal(st.flowGraph(r.cap.frames, r.sums, r.getD, {}).rows.length, r.cap.frames.length);
    const tcpStreams = new Set(r.sums.filter((s) => s.tcpStream !== undefined).map((s) => s.tcpStream));
    for (const sidx of [...tcpStreams].slice(0, 3)) {
      for (const type of ['stevens', 'tcptrace', 'throughput', 'rtt', 'window']) st.tcpStreamGraph(r.cap.frames, r.sums, r.getD, { stream: sidx, type });
    }
  }
});
