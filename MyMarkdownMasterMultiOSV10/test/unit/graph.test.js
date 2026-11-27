// Graph view model (src/views/graph-model.js): filters, local graph, groups, the fallback matcher, the
// Barnes-Hut repulsion and the force layout.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TestIndex as VaultIndex } from './helpers/core.mjs';
import {
  DEFAULT_OPTIONS, normalizeOptions, buildGraph, defaultMatch, nodeId, nodeRadius, labelAlpha, labelThreshold,
  animationOrder, carryPositions, Simulation, applyRepulsion, bruteRepulsion, buildQuadtree, graphBounds, fitView,
} from '../../src/views/graph-model.js';

function vault() {
  const index = new VaultIndex();
  index.setFiles([
    { path: 'A.md', mtime: 30 }, { path: 'B.md', mtime: 10 }, { path: 'C.md', mtime: 20 }, { path: 'D.md', mtime: 40 },
    { path: 'Lonely.md', mtime: 50 }, { path: 'work/E.md', mtime: 60 }, { path: 'img/pic.png', mtime: 5 }, { path: 'img/unused.png', mtime: 6 },
  ]);
  index.setText('A.md', '# A\nSee [[B]] and [[C]] and [[Missing]]. #project\n![[pic.png]]');
  index.setText('B.md', 'Back to [[A]] #project/sub');
  index.setText('C.md', 'Goes to [[D]] #other');
  index.setText('D.md', 'End.');
  index.setText('Lonely.md', 'No links here.');
  index.setText('work/E.md', '---\ntags: [todo]\n---\nLinks [[D]]');
  return index;
}
const ids = (g) => g.nodes.map((n) => n.id).sort();
const pairs = (g) => g.links.map((l) => `${g.nodes[l.source].id}>${g.nodes[l.target].id}`).sort();

test('options: defaults, clamping and unknown keys', () => {
  assert.deepEqual(normalizeOptions(null), normalizeOptions({}));
  const o = normalizeOptions({ nodeSize: 99, depth: 2.6, repelStrength: 'x', showTags: 1, groups: [{ query: 'tag:#a', color: '#AABBCC' }, { color: 'red' }, null], sections: { groups: true, bogus: true }, junk: 1 });
  assert.equal(o.nodeSize, 5);
  assert.equal(o.depth, 3);
  assert.equal(o.repelStrength, DEFAULT_OPTIONS.repelStrength);
  assert.equal(o.showTags, true);
  assert.deepEqual(o.groups, [{ query: 'tag:#a', color: '#aabbcc' }, { query: '', color: '#7c8ea8' }]);
  assert.equal(o.sections.groups, true);
  assert.equal('bogus' in o.sections, false);
  assert.equal('junk' in o, false);
});

test('global graph: notes, resolved links, unresolved names; no tags or attachments by default', () => {
  const g = buildGraph(vault(), {});
  assert.deepEqual(ids(g), ['A.md', 'B.md', 'C.md', 'D.md', 'Lonely.md', nodeId.unresolved('Missing'), 'work/E.md'].sort());
  assert.deepEqual(pairs(g), ['A.md>B.md', 'A.md>C.md', `A.md>${nodeId.unresolved('missing')}`, 'B.md>A.md', 'C.md>D.md', 'work/E.md>D.md'].sort());
  const a = g.nodes.find((n) => n.id === 'A.md');
  assert.equal(a.degree, 4);
  assert.equal(a.label, 'A');
  assert.equal(g.nodes.find((n) => n.kind === 'unresolved').name, 'Missing');
});

test('filters: existing files only, orphans, tags, attachments', () => {
  const index = vault();
  assert.ok(!ids(buildGraph(index, { existingOnly: true })).some((id) => id.startsWith('unresolved:')));
  assert.ok(!ids(buildGraph(index, { showOrphans: false })).includes('Lonely.md'));
  const tags = buildGraph(index, { showTags: true });
  assert.ok(ids(tags).includes('tag:#project') && ids(tags).includes('tag:#project/sub') && ids(tags).includes('tag:#todo'));
  assert.ok(pairs(tags).includes('work/E.md>tag:#todo'));
  assert.equal(tags.nodes.find((n) => n.id === 'tag:#project').kind, 'tag');
  const att = buildGraph(index, { showAttachments: true });
  assert.ok(pairs(att).includes('A.md>img/pic.png'));
  assert.equal(att.nodes.find((n) => n.id === 'img/pic.png').kind, 'attachment');
  assert.ok(ids(att).includes('img/unused.png'));
  assert.ok(!ids(buildGraph(index, { showAttachments: true, showOrphans: false })).includes('img/unused.png'));
  // Without attachments the embed of pic.png draws no line.
  assert.ok(!pairs(buildGraph(index, {})).some((p) => p.includes('pic.png')));
});

test('search keeps matching files and the tags / unresolved names they link to', () => {
  const index = vault();
  const g = buildGraph(index, { search: 'A', showTags: true });
  assert.ok(ids(g).includes('A.md'));
  assert.ok(!ids(g).includes('B.md'));
  assert.ok(ids(g).includes('tag:#project'));
  assert.ok(ids(g).includes(nodeId.unresolved('missing')));
  assert.ok(!ids(g).includes('tag:#other'));
  assert.deepEqual(ids(buildGraph(index, { search: 'path:work' })), ['work/E.md']);
  // The app's matcher wins over the fallback.
  assert.deepEqual(ids(buildGraph(index, { search: 'anything', existingOnly: true }, { matchQuery: (q, p) => p === 'D.md' })), ['D.md']);
});

test('fallback matcher: plain terms, path:, file:, tag: (nested), negation, quotes', () => {
  const tags = (p) => ({ 'a.md': ['#project/sub'], 'b.md': ['#todo'] })[p] ?? [];
  assert.equal(defaultMatch('', 'x.md'), true);
  assert.equal(defaultMatch('WORK', 'work/E.md'), true);
  assert.equal(defaultMatch('path:work e', 'work/E.md'), true);
  assert.equal(defaultMatch('path:work zzz', 'work/E.md'), false);
  assert.equal(defaultMatch('file:e.md', 'work/E.md'), true);
  assert.equal(defaultMatch('file:work', 'work/E.md'), false);
  assert.equal(defaultMatch('tag:#project', 'a.md', tags), true);
  assert.equal(defaultMatch('tag:project/sub', 'a.md', tags), true);
  assert.equal(defaultMatch('tag:#proj', 'a.md', tags), false);
  assert.equal(defaultMatch('-tag:#todo', 'b.md', tags), false);
  assert.equal(defaultMatch('-tag:#todo', 'a.md', tags), true);
  assert.equal(defaultMatch('"my note"', 'dir/My Note.md'), true);
});

test('groups colour the first matching group; tag: and path: queries work', () => {
  const g = buildGraph(vault(), { groups: [{ query: 'tag:#project', color: '#ff0000' }, { query: 'path:work', color: '#00ff00' }, { query: 'A', color: '#0000ff' }] });
  const col = (id) => g.nodes.find((n) => n.id === id).color;
  assert.equal(col('A.md'), '#ff0000');
  assert.equal(col('B.md'), '#ff0000');
  assert.equal(col('work/E.md'), '#00ff00');
  assert.equal(col('C.md'), null);
  assert.equal(col(nodeId.unresolved('missing')), null);
});

test('local graph: depth, incoming / outgoing, neighbour links', () => {
  const index = vault();
  const d1 = buildGraph(index, { depth: 1 }, { local: 'C.md' });
  assert.deepEqual(ids(d1), ['A.md', 'C.md', 'D.md']);
  assert.equal(d1.nodes[d1.centre].id, 'C.md');
  const d2 = buildGraph(index, { depth: 2 }, { local: 'C.md' });
  assert.deepEqual(ids(d2), ['A.md', 'B.md', 'C.md', 'D.md', nodeId.unresolved('missing'), 'work/E.md'].sort());
  assert.deepEqual(ids(buildGraph(index, { depth: 3, incoming: false }, { local: 'C.md' })), ['C.md', 'D.md']);
  assert.deepEqual(ids(buildGraph(index, { depth: 1, outgoing: false }, { local: 'C.md' })), ['A.md', 'C.md']);
  const noNb = buildGraph(index, { depth: 1 }, { local: 'D.md' });
  assert.deepEqual(ids(noNb), ['C.md', 'D.md', 'work/E.md']);
  // Neighbour links: between two nodes at the same depth.
  const index2 = vault();
  index2.setText('C.md', 'Goes to [[D]] and [[E]]');
  assert.ok(!pairs(buildGraph(index2, { depth: 1 }, { local: 'D.md' })).includes('C.md>work/E.md'));
  assert.ok(pairs(buildGraph(index2, { depth: 1, neighbors: true }, { local: 'D.md' })).includes('C.md>work/E.md'));
  // The centre stays even when the search would hide it or it has no links.
  assert.deepEqual(ids(buildGraph(index, { search: 'zzz', showOrphans: false }, { local: 'Lonely.md' })), ['Lonely.md']);
  assert.deepEqual(buildGraph(index, {}, { local: 'nope.md' }).nodes, []);
});

test('radius grows with links; labels fade in past the threshold', () => {
  assert.ok(nodeRadius({ degree: 9 }) > nodeRadius({ degree: 1 }));
  assert.ok(nodeRadius({ degree: 1 }, 2) > nodeRadius({ degree: 1 }, 1));
  assert.equal(labelAlpha(labelThreshold(0) * 0.9, 0), 0);
  assert.equal(labelAlpha(labelThreshold(0) * 2, 0), 1);
  assert.ok(labelThreshold(2) > labelThreshold(0));
});

test('animation order is by modification time; tags appear with their first note', () => {
  const g = buildGraph(vault(), { showTags: true, existingOnly: true });
  const order = animationOrder(g.nodes).map((i) => g.nodes[i].id);
  assert.equal(order[0], 'B.md');
  assert.ok(order.indexOf('C.md') < order.indexOf('A.md'));
  assert.equal(g.nodes.find((n) => n.id === 'tag:#project').mtime, 30); // only A (mtime 30) has #project
});

test('positions carry over by id; new nodes start next to a placed neighbour', () => {
  const index = vault();
  const g1 = buildGraph(index, {});
  assert.equal(carryPositions([], g1), g1.nodes.length);
  for (const n of g1.nodes) assert.ok(Number.isFinite(n.x) && Number.isFinite(n.y));
  const a = g1.nodes.find((n) => n.id === 'A.md');
  a.x = 1000; a.y = -500;
  index.setText('Lonely.md', 'Now [[A]]');
  const g2 = buildGraph(index, { showTags: true });
  const fresh = carryPositions(g1.nodes, g2);
  assert.equal(fresh, g2.nodes.filter((n) => n.kind === 'tag').length);
  const a2 = g2.nodes.find((n) => n.id === 'A.md');
  assert.deepEqual([a2.x, a2.y], [1000, -500]);
  const tag = g2.nodes.find((n) => n.id === 'tag:#project');
  assert.ok(Math.hypot(tag.x - 1000, tag.y + 500) < 60);
});

function randomNodes(n, seed = 1) {
  let s = seed;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  return Array.from({ length: n }, () => ({ x: (rnd() - 0.5) * 1000, y: (rnd() - 0.5) * 1000, vx: 0, vy: 0 }));
}

test('Barnes-Hut repulsion is close to brute force and counts every node', () => {
  const a = randomNodes(400);
  const b = a.map((n) => ({ ...n }));
  const tree = applyRepulsion(a, -300, 1, 0.5);
  assert.equal(tree.mass[0], 400);
  bruteRepulsion(b, -300, 1);
  let err = 0; let mag = 0;
  for (let i = 0; i < a.length; i += 1) { err += Math.hypot(a[i].vx - b[i].vx, a[i].vy - b[i].vy); mag += Math.hypot(b[i].vx, b[i].vy); }
  assert.ok(err / mag < 0.05, `relative error ${err / mag}`);
  // Coincident points and hidden nodes.
  const same = [{ x: 0, y: 0, vx: 0, vy: 0 }, { x: 0, y: 0, vx: 0, vy: 0 }, { x: 5, y: 5, vx: 0, vy: 0, hidden: true }];
  const t = buildQuadtree(same);
  assert.equal(t.mass[0], 2);
  applyRepulsion(same, -30, 1);
  for (const n of same) assert.ok(Number.isFinite(n.vx) && Number.isFinite(n.vy));
  assert.equal(same[2].vx, 0);
});

test('simulation separates overlapping nodes, pulls linked ones together and cools down', () => {
  const nodes = Array.from({ length: 30 }, (_, i) => ({ id: String(i), x: i * 0.01, y: 0, vx: 0, vy: 0 }));
  const links = [{ source: 0, target: 1 }];
  nodes[29].x = 5000;
  const sim = new Simulation({ nodes, links }, {});
  let ticks = 0;
  while (sim.active && ticks < 2000) { sim.tick(); ticks += 1; }
  assert.ok(!sim.active, 'cooled');
  assert.ok(ticks < 400, `ticks ${ticks}`);
  let minD = Infinity;
  for (let i = 0; i < nodes.length; i += 1) for (let j = i + 1; j < nodes.length; j += 1) minD = Math.min(minD, Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y));
  assert.ok(minD > 5, `min distance ${minD}`);
  assert.ok(Math.abs(nodes[29].x) < 2000, 'centre force pulled the far node in');
  const linked = Math.hypot(nodes[0].x - nodes[1].x, nodes[0].y - nodes[1].y);
  const avg = nodes.slice(2, 29).reduce((s, n) => s + Math.hypot(n.x - nodes[0].x, n.y - nodes[0].y), 0) / 27;
  assert.ok(linked < avg, `linked ${linked} < average ${avg}`);
  // A pinned node stays put; reheat wakes the simulation.
  nodes[3].fx = 123; nodes[3].fy = 45;
  sim.reheat(0.5);
  assert.ok(sim.active);
  for (let i = 0; i < 10; i += 1) sim.tick();
  assert.deepEqual([nodes[3].x, nodes[3].y], [123, 45]);
});

test('2000 nodes: one tick stays fast', () => {
  const nodes = randomNodes(2000, 7).map((n, i) => ({ ...n, id: String(i) }));
  const links = Array.from({ length: 3000 }, (_, i) => ({ source: i % 2000, target: (i * 7 + 13) % 2000 })).filter((l) => l.source !== l.target);
  const sim = new Simulation({ nodes, links }, {});
  sim.tick();
  const t0 = performance.now();
  for (let i = 0; i < 10; i += 1) sim.tick();
  const per = (performance.now() - t0) / 10;
  assert.ok(per < 25, `${per.toFixed(1)} ms per tick`);
  for (const n of nodes) assert.ok(Number.isFinite(n.x) && Number.isFinite(n.y));
});

test('fit view centres the bounds and respects the scale limits', () => {
  const nodes = [{ x: -100, y: -50, degree: 0 }, { x: 100, y: 50, degree: 0 }];
  const b = graphBounds(nodes);
  assert.ok(b.minX < -100 && b.maxX > 100);
  const v = fitView(b, 800, 600, { padding: 0 });
  assert.ok(Math.abs(v.tx + v.scale * (b.minX + b.maxX) / 2 - 400) < 1e-9);
  assert.ok(Math.abs(v.ty + v.scale * (b.minY + b.maxY) / 2 - 300) < 1e-9);
  assert.equal(fitView({ minX: 0, minY: 0, maxX: 1, maxY: 1 }, 800, 600, { maxScale: 2 }).scale, 2);
  assert.equal(graphBounds([{ x: 0, y: 0, hidden: true }]), null);
});
