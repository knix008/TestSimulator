import test from 'node:test';
import assert from 'node:assert/strict';
import { SAMPLES } from '../../src/domain/capture/samples.js';
import { CaptureDoc } from '../../src/domain/capture/doc.js';
import { buildTopology } from '../../src/domain/analysis/topology.js';

async function map(id, options = {}) {
  const doc = new CaptureDoc({ name: id, file: SAMPLES.find((s) => s.id === id).build() });
  await doc.firstPass();
  return { doc, topo: buildTopology(doc.frames, doc.summaries, (i) => doc.dissectOnce(i), options) };
}
const isolated = (topo) => { const linked = new Set(topo.links.flatMap((l) => [l.source, l.target])); return topo.nodes.filter((n) => !linked.has(n.id)).map((n) => n.label); };

test('network map: hosts seen only in ARP are linked to the hosts they asked or answered', async () => {
  const { doc, topo } = await map('arp-storm');
  assert.deepEqual(isolated(topo), []);
  for (const item of [...topo.nodes, ...topo.links]) {
    const r = await doc.applyFilter(item.filter);
    assert.ok(r.ok && r.count > 0, `${item.id}: ${item.filter} → ${r.error ?? r.count}`);
  }
});

test('network map: a host that only sends multicast is alone while multicast is hidden, linked when shown', async () => {
  assert.ok(isolated((await map('lan-name-services')).topo).length > 0, 'mDNS-only hosts have no unicast peer');
  assert.deepEqual(isolated((await map('lan-name-services', { showMulticast: true })).topo), []);
});
