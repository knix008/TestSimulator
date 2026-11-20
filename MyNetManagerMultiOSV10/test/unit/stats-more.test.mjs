// Service response time, UDP multicast streams, DHCP / SIP statistics, RTP stream analysis, MAC address
// blocks and supported protocols (src/stats-more.js) on the sample captures.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SAMPLES } from '../../src/domain/capture/samples.js';
import { CaptureDoc } from '../../src/domain/capture/doc.js';
import { compileFilter } from '../../src/domain/filter/index.js';
import { FIELDS } from '../../src/domain/dissect/index.js';
import { dhcpStats, isMulticast, macBlocks, multicastStreams, rtpAnalysis, serviceResponseTime, sipStatistics, supportedProtocols } from '../../src/stats-more.js';

const t = (key, args) => (args ? `${key} ${JSON.stringify(args)}` : key);
async function source(id) {
  const doc = new CaptureDoc({ name: id, file: SAMPLES.find((s) => s.id === id).build() });
  await doc.firstPass();
  return { doc, frames: doc.frames, get: (frame) => doc.dissectOnce(frame.no - 1) };
}
/** Every row filter compiles and finds at least one packet. */
async function filtersWork(src, view) {
  for (const row of view.rows) {
    if (!row.filter) continue;
    const c = compileFilter(row.filter, { fields: FIELDS });
    assert.ok(c.ok, `${row.filter}: ${c.error}`);
    const r = await src.doc.applyFilter(row.filter);
    assert.ok(r.count > 0, `${row.filter} shows nothing`);
  }
}

test('service response time: DNS calls equal the answered queries, min ≤ avg ≤ max', async () => {
  const src = await source('dns-queries');
  const view = serviceResponseTime(src, t);
  const dns = view.rows.find((r) => r.id === 'DNS');
  assert.ok(dns, 'no DNS row');
  const answered = (await src.doc.applyFilter('dns.time')).count;
  assert.equal(dns.cells.calls, answered);
  assert.ok(dns.cells.min <= dns.cells.avg && dns.cells.avg <= dns.cells.max);
  const procs = view.rows.filter((r) => r.depth === 1 && r.id.startsWith('DNS/'));
  assert.equal(procs.reduce((n, r) => n + r.cells.calls, 0), dns.cells.calls, 'procedures add up');
  await filtersWork(src, view);
});

test('UDP multicast streams: only multicast groups, packets add up', async () => {
  assert.ok(isMulticast('224.0.0.251') && isMulticast('ff02::fb') && !isMulticast('192.168.0.1') && !isMulticast('fe80::1'));
  const src = await source('lan-name-services');
  const view = multicastStreams(src, t);
  assert.ok(view.rows.length > 0);
  for (const row of view.rows) assert.ok(isMulticast(row.cells.dst), row.cells.dst);
  const total = (await src.doc.applyFilter('udp && (ip.dst >= 224.0.0.0 && ip.dst <= 239.255.255.255 || ipv6.dst >= ff00::)')).count;
  assert.equal(view.rows.reduce((n, r) => n + r.cells.packets, 0), total);
  await filtersWork(src, view);
});

test('DHCP statistics: message types of a lease (Discover, Offer, Request, ACK)', async () => {
  const src = await source('dhcp-lease');
  const view = dhcpStats(src, t);
  const types = view.rows.map((r) => r.cells.type);
  for (const name of ['Discover', 'Offer', 'Request', 'ACK']) assert.ok(types.includes(name), `${name} in ${types}`);
  await filtersWork(src, view);
});

test('SIP statistics: requests by method, responses by class and code', async () => {
  const src = await source('sip-call-rtp');
  const view = sipStatistics(src, t);
  const names = view.rows.map((r) => r.cells.name);
  assert.ok(names.includes('INVITE') && names.includes('200'), names.join());
  const req = view.rows.find((r) => r.id === 'req');
  assert.equal(req.cells.count, view.rows.filter((r) => r.id.startsWith('req/')).reduce((n, r) => n + r.cells.count, 0));
  await filtersWork(src, { rows: view.rows.filter((r) => r.cells.count > 0) });
});

test('RTP stream analysis: expected = packets + lost, jitter is finite and ≥ 0', async () => {
  const src = await source('sip-call-rtp');
  const view = rtpAnalysis(src, t);
  assert.ok(view.rows.length >= 1);
  for (const { cells } of view.rows) {
    assert.equal(cells.expected, cells.packets + cells.lost);
    assert.ok(Number.isFinite(cells.maxJitter) && cells.maxJitter >= 0 && cells.meanJitter <= cells.maxJitter + 1e-9, JSON.stringify(cells));
  }
  await filtersWork(src, view);
});

test('MAC address blocks: vendors from the OUI table, broadcast and group bits', async () => {
  const src = await source('mixed-office-lan');
  const view = macBlocks(src, t);
  const bcast = view.rows.find((r) => r.cells.mac === 'ff:ff:ff:ff:ff:ff');
  assert.ok(bcast && bcast.cells.kind === 'macBlocks.group');
  assert.ok(view.rows.some((r) => !/^macBlocks\./.test(r.cells.vendor) && r.cells.vendor !== 'Broadcast'), 'no vendor resolved');
  await filtersWork(src, view);
});

test('supported protocols: every protocol once, with its fields', async () => {
  const src = await source('dns-queries');
  const view = supportedProtocols(src, t);
  const names = view.rows.map((r) => r.cells.abbrev);
  assert.equal(new Set(names).size, names.length);
  for (const p of ['eth', 'ip', 'tcp', 'udp', 'dns', 'http', 'tls', 'sip', 'rtp']) assert.ok(names.includes(p), p);
  assert.ok(view.rows.find((r) => r.cells.abbrev === 'tcp').cells.fields > 20);
});
