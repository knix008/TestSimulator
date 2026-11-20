// The network map's lines in 'toSelf' mode (the program's default): only traffic whose destination is this PC
// draws a line, pointing at it; what this PC sends elsewhere and traffic between other machines draws none.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SAMPLES } from '../../src/domain/capture/samples.js';
import { CaptureDoc } from '../../src/domain/capture/doc.js';
import { buildTopology } from '../../src/domain/analysis/topology.js';

async function open(id) {
  const doc = new CaptureDoc({ name: id, file: SAMPLES.find((s) => s.id === id).build() });
  await doc.firstPass();
  return doc;
}
const map = (doc, options) => buildTopology(doc.frames, doc.summaries, (i) => doc.dissectOnce(i), options);

test('toSelf: this PC found from the traffic; every line points along the way to it and carries only traffic to it', async () => {
  const doc = await open('mixed-office-lan');
  const all = map(doc, {});
  const me = map(doc, { links: 'toSelf' });
  assert.deepEqual(me.self, ['192.168.0.42']);
  assert.equal(me.nodes.length, all.nodes.length, 'hosts without lines stay on the map');
  const self = me.nodes.find((n) => n.self);
  assert.equal(self.id, 'host:192.168.0.42');
  assert.ok(me.links.length > 0 && me.links.length < all.links.length);
  for (const link of me.links) {
    assert.ok(link.from && link.to, `${link.id} has a direction`);
    const into = me.links.filter((l) => l.from === link.to);
    assert.ok(link.to === self.id || into.length > 0, `${link.id} leads on toward this PC`);
    // Its filter shows only packets addressed to this PC (or ARP to it).
    const r = await doc.applyFilter(link.filter);
    assert.ok(r.ok && r.count > 0, link.filter);
    for (const i of doc.displayed) {
      const d = doc.dissectOnce(i);
      const dst = d.fields.get('ip.dst')?.[0]?.value ?? d.fields.get('arp.dst.proto_ipv4')?.[0]?.value;
      assert.equal(String(dst), '192.168.0.42', `${link.filter}: frame ${i + 1} goes to ${dst}`);
    }
  }
  // Another host's own conversations draw no line: it has none to this PC.
  assert.ok(!me.links.some((l) => l.source === 'host:192.168.0.31' || l.target === 'host:192.168.0.31'));
});

test('toSelf: "this PC" given explicitly, and ARP-only captures', async () => {
  const doc = await open('mixed-office-lan');
  const other = map(doc, { links: 'toSelf', self: ['192.168.0.23'] });
  assert.deepEqual(other.self, ['192.168.0.23']);
  assert.ok(other.selfGiven);
  assert.ok(other.links.some((l) => l.to === 'host:192.168.0.23'));
  assert.ok(!other.links.some((l) => l.to === 'host:192.168.0.42'), 'the old "this PC" gets no lines');
  const arp = map(await open('arp-storm'), { links: 'toSelf' });
  assert.equal(arp.self.length, 1);
  assert.ok(arp.links.length > 0 && arp.links.every((l) => l.filter.startsWith('arp.')));
});

test('all (the default): every source is joined to its destination, arrows at the receiving ends', async () => {
  const doc = await open('mixed-office-lan');
  const topo = map(doc, { links: 'all' });
  const byId = new Map(topo.nodes.map((n) => [n.id, n]));
  const nodeOf = (ip) => topo.nodes.find((n) => n.ip === ip || (n.ips ?? []).includes(ip) || (n.members ?? []).includes(ip));
  // Walk the lines from each source along arrows toward its destination (at most through the router).
  const adj = new Map();
  for (const l of topo.links) for (const end of l.into) { const other = end === l.target ? l.source : l.target; if (!adj.has(other)) adj.set(other, new Set()); adj.get(other).add(end); }
  let checked = 0;
  for (let i = 0; i < doc.count; i++) {
    const d = doc.dissectOnce(i);
    const src = d.fields.get('ip.src')?.[0]?.value, dst = d.fields.get('ip.dst')?.[0]?.value;
    if (!src || !dst) continue;
    const a = nodeOf(String(src)), b = nodeOf(String(dst));
    if (!a || !b || a === b || b.kind === 'multicast') continue;
    const reach = new Set([a.id]); let front = [a.id];
    for (let hop = 0; hop < 3 && !reach.has(b.id); hop++) front = front.flatMap((id) => [...(adj.get(id) ?? [])].filter((x) => !reach.has(x) && reach.add(x)));
    assert.ok(reach.has(b.id), `frame ${i + 1}: ${src} → ${dst} has a line along the arrows`);
    checked += 1;
  }
  assert.ok(checked > 100, `${checked} packets checked`);
  assert.ok(topo.links.every((l) => l.into.length > 0), 'every line has an arrow');
  const self = topo.nodes.find((n) => n.self);
  assert.ok(topo.links.some((l) => l.toSelf) && topo.links.some((l) => !l.toSelf));
  assert.ok(topo.links.filter((l) => l.toSelf).every((l) => l.into.length > 0) && byId.has(self.id));
});
