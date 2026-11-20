// Filters on field names only ("tcp or udp", "not arp and not dns") run on the names CaptureDoc remembers
// per packet instead of dissecting it again; the map matches on remembered addresses. Both must give
// exactly what the full dissection gives, on every sample.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SAMPLES } from '../../src/domain/capture/samples.js';
import { CaptureDoc } from '../../src/domain/capture/doc.js';
import { DISPLAY_PRESETS } from '../../src/domain/filter/presets.js';
import { compileFilter } from '../../src/domain/filter/index.js';
import { FIELDS } from '../../src/domain/dissect/index.js';
import { buildTopology, matchTopology } from '../../src/domain/analysis/topology.js';

const PRESENCE = [
  ...DISPLAY_PRESETS.map((p) => p[1]).filter((f) => compileFilter(f, { fields: FIELDS }).presence),
  'tcp or udp', 'tcp and (not arp and not dns)', '(tcp or udp or dns) and (not arp and not dns)', '!(udp)', 'ip xor ipv6',
  'tcp.analysis.retransmission', 'tcp.analysis.flags && !tcp.analysis.window_update', 'frame.comment', 'eth and not ip', 'http or tls or quic',
];

test('presence-only filters are recognised, everything else is not', () => {
  const yes = ['tcp', 'not arp and not dns', '(dhcp || dhcpv6) or tcp', '!(udp)', 'tcp.analysis.retransmission'];
  const no = ['ip.addr == 10.0.0.1', 'tcp.port in {80, 443}', 'eth[0] == 1', '_ws.col.protocol == "TLSv1.3"', 'frame.len > 60', 'ip.src == ${ip.src}', 'tcp contains "GET"'];
  for (const f of yes) assert.equal(compileFilter(f, { fields: FIELDS }).presence, true, f);
  for (const f of no) {
    const c = compileFilter(f, { fields: FIELDS });
    if (c.ok) assert.equal(c.presence, false, f);
  }
  assert.ok(PRESENCE.length >= 18, `presets on names: ${PRESENCE.length}`);
});

test('a filter on field names gives the same packets from remembered names as from full dissection (every sample)', async () => {
  for (const sample of SAMPLES) {
    const doc = new CaptureDoc({ name: sample.id, file: sample.build() });
    await doc.firstPass();
    for (let i = 0; i < doc.passed; i++) doc.dissectOnce(i);
    for (const text of PRESENCE) {
      const c = compileFilter(text, { fields: FIELDS });
      assert.ok(c.ok && c.presence, `${text}: ${c.error}`);
      const full = [];
      const fast = [];
      for (let i = 0; i < doc.passed; i++) {
        if (c.test(doc.dissectOnce(i))) full.push(i);
        assert.ok(doc.facts[i], `${sample.id}: frame ${i + 1} has no remembered names`);
        if (doc.testFrame(c, i)) fast.push(i);
      }
      assert.deepEqual(fast, full, `${sample.id}: ${text}`);
    }
  }
});

test('the map matches the same nodes and links from remembered addresses as from dissections (every sample)', async () => {
  for (const sample of SAMPLES) {
    const doc = new CaptureDoc({ name: sample.id, file: sample.build() });
    await doc.firstPass();
    const topo = buildTopology(doc.frames, doc.summaries, (i) => doc.dissectOnce(i), { showExternal: true, showMulticast: true });
    for (const text of ['tcp', 'udp', 'arp', 'dns', '']) {
      await doc.applyFilter(text);
      const slow = matchTopology(topo, doc.displayed, (i) => doc.dissectOnce(i));
      const fast = matchTopology(topo, doc.displayed, () => { throw new Error('dissected'); }, (i) => doc.endsOf(i));
      assert.deepEqual([...fast.nodes].sort(), [...slow.nodes].sort(), `${sample.id} ${text}: nodes`);
      assert.deepEqual([...fast.links].sort(), [...slow.links].sort(), `${sample.id} ${text}: links`);
      assert.equal(fast.packets, slow.packets);
    }
  }
});

test('a changed comment or a new dissection forgets the remembered names', async () => {
  const doc = new CaptureDoc({ name: 'x', file: SAMPLES.find((s) => s.id === 'dns-queries').build() });
  await doc.firstPass();
  await doc.applyFilter('frame.comment');
  assert.equal(doc.displayed.length, 0);
  doc.setComment(0, 'hello');
  await doc.applyFilter('frame.comment');
  assert.deepEqual(doc.displayed, [0], 'the commented frame is found by name');
  await doc.redissect(doc.prefs);
  assert.equal(doc.facts.filter(Boolean).length, doc.passed, 'the filter pass after redissect remembered every frame again');
});
