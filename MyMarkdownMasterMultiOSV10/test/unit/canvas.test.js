// Unit tests for the canvas model (JSON Canvas 1.0): parse, repair, write, geometry, Undo.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const m = await import('../../src/views/canvas-model.js');

const SAMPLE = `{
	"nodes":[
		{"id":"8132d4d894c80022","type":"group","x":-300,"y":-300,"width":900,"height":600,"label":"Ideas","color":"4","background":"img/bg.png","backgroundStyle":"cover"},
		{"id":"a1b2c3d4e5f60718","type":"text","text":"# Hello\\n\\nA **card**","x":-240,"y":-220,"width":260,"height":120,"color":"1"},
		{"id":"b1b2c3d4e5f60718","type":"file","file":"Notes/Plan.md","subpath":"#Goals","x":120,"y":-220,"width":400,"height":300},
		{"id":"c1b2c3d4e5f60718","type":"link","url":"https://obsidian.md","x":-240,"y":0,"width":400,"height":140,"color":"#ff8800","custom":{"kept":true}}
	],
	"edges":[
		{"id":"e1e2e3e4e5e6e7e8","fromNode":"a1b2c3d4e5f60718","fromSide":"right","toNode":"b1b2c3d4e5f60718","toSide":"left","label":"leads to"},
		{"id":"f1e2e3e4e5e6e7e8","fromNode":"a1b2c3d4e5f60718","fromSide":"bottom","fromEnd":"arrow","toNode":"c1b2c3d4e5f60718","toSide":"top","toEnd":"none","color":"5"}
	],
	"metadata":{"version":"1.0"}
}
`;

test('ids are 16 hex characters and differ', () => {
  const ids = new Set(Array.from({ length: 200 }, () => m.newId()));
  assert.equal(ids.size, 200);
  for (const id of ids) assert.match(id, /^[0-9a-f]{16}$/);
});

test('the sample file round-trips: parse → write gives back the same text and data', () => {
  const doc = m.parseCanvas(SAMPLE);
  assert.equal(doc.nodes.length, 4);
  assert.equal(doc.edges.length, 2);
  assert.equal(m.serializeCanvas(doc), SAMPLE);
  assert.deepEqual(m.parseCanvas(m.serializeCanvas(doc)), doc);
  assert.deepEqual(doc.nodes[3].custom, { kept: true });
  assert.deepEqual(doc.metadata, { version: '1.0' });
  assert.equal(doc.nodes[1].text, '# Hello\n\nA **card**');
});

test('empty text is an empty canvas; bad JSON throws; a BOM is fine', () => {
  assert.deepEqual(m.parseCanvas(''), { nodes: [], edges: [] });
  assert.deepEqual(m.parseCanvas('  \n'), { nodes: [], edges: [] });
  assert.throws(() => m.parseCanvas('{nodes:'));
  assert.throws(() => m.parseCanvas('[]'));
  assert.equal(m.parseCanvas('﻿{"nodes":[]}').nodes.length, 0);
  assert.equal(m.serializeCanvas(m.emptyCanvas()), '{\n\t"nodes":[],\n\t"edges":[]\n}\n');
});

test('repair: missing / duplicate ids, sizes, bad colours and sides, edges without nodes named', () => {
  const doc = m.normalizeCanvas({
    nodes: [
      { type: 'text', text: 'a', x: '10', y: 5.6 },
      { id: 'x', type: 'file', file: 'a.png', x: 0, y: 0, width: 100, height: 100, color: 'blue' },
      { id: 'x', type: 'link', x: 0, y: 0 },
      'junk',
    ],
    edges: [
      { id: 'e', fromNode: 'x', toNode: 'x', fromSide: 'middle', toEnd: 'circle', color: '7' },
      { id: 'bad' },
    ],
  });
  assert.equal(doc.nodes.length, 3);
  assert.match(doc.nodes[0].id, /^[0-9a-f]{16}$/);
  assert.equal(doc.nodes[0].x, 10);
  assert.equal(doc.nodes[0].y, 6);
  assert.equal(doc.nodes[0].width, m.DEFAULT_SIZE.text.width);
  assert.equal(doc.nodes[1].color, undefined);
  assert.notEqual(doc.nodes[2].id, 'x');
  assert.equal(doc.nodes[2].url, '');
  assert.equal(doc.edges.length, 1);
  assert.equal(doc.edges[0].fromSide, undefined);
  assert.equal(doc.edges[0].toEnd, undefined);
  assert.equal(doc.edges[0].color, undefined);
});

test('colours: presets 1–6 and hex', () => {
  assert.deepEqual(m.colorInfo('1'), { preset: 'red' });
  assert.deepEqual(m.colorInfo('6'), { preset: 'purple' });
  assert.deepEqual(m.colorInfo('#ABC'), { hex: '#aabbcc' });
  assert.deepEqual(m.colorInfo('#123456'), { hex: '#123456' });
  assert.equal(m.colorInfo('0'), null);
  assert.equal(m.isValidColor('#12345'), false);
});

test('edge ends default to an arrow at the target only; directions write only what differs', () => {
  const e = m.makeEdge('a', 'right', 'b', 'left');
  assert.equal(m.edgeDirection(e), 'to');
  m.setEdgeDirection(e, 'both');
  assert.equal(e.fromEnd, 'arrow');
  assert.equal('toEnd' in e, false);
  assert.equal(m.edgeDirection(e), 'both');
  m.setEdgeDirection(e, 'none');
  assert.equal(e.toEnd, 'none');
  assert.equal('fromEnd' in e, false);
  assert.equal(m.edgeDirection(e), 'none');
  m.setEdgeDirection(e, 'to');
  assert.deepEqual(Object.keys(e), ['id', 'fromNode', 'fromSide', 'toNode', 'toSide']);
});

test('geometry: bounds, anchors, nearest and automatic sides, hit tests', () => {
  const a = m.makeNode('text', { x: 0, y: 0, width: 100, height: 50 });
  const b = m.makeNode('text', { x: 300, y: 10, width: 100, height: 50 });
  const c = m.makeNode('text', { x: 0, y: 400, width: 100, height: 50 });
  const g = m.makeNode('group', { x: -50, y: -50, width: 500, height: 200 });
  assert.deepEqual(m.boundsOf([a, b, c]), { x: 0, y: 0, width: 400, height: 450 });
  assert.equal(m.boundsOf([]), null);
  assert.deepEqual(m.anchorPoint(a, 'top'), { x: 50, y: 0 });
  assert.deepEqual(m.anchorPoint(a, 'right'), { x: 100, y: 25 });
  assert.deepEqual(m.anchorPoint(a, 'bottom'), { x: 50, y: 50 });
  assert.deepEqual(m.anchorPoint(a, 'left'), { x: 0, y: 25 });
  assert.equal(m.nearestSide(a, { x: 140, y: 30 }), 'right');
  assert.equal(m.nearestSide(a, { x: 50, y: -40 }), 'top');
  assert.deepEqual(m.autoSides(a, b), ['right', 'left']);
  assert.deepEqual(m.autoSides(a, c), ['bottom', 'top']);
  assert.deepEqual(m.autoSides(b, a), ['left', 'right']);
  const nodes = [g, a, b, c];
  assert.equal(m.hitNode(nodes, { x: 10, y: 10 }), a);
  assert.equal(m.hitNode(nodes, { x: 200, y: 10 }), g);
  assert.equal(m.hitNode(nodes, { x: 2000, y: 10 }), null);
  assert.equal(m.hitNode(nodes, { x: 10, y: 10 }, a.id), g);
  assert.deepEqual(m.nodesInGroup(nodes, g).map((n) => n.id), [a.id, b.id]);
  assert.deepEqual(m.nodesInRect(nodes, { x: 90, y: 0, width: 220, height: 20 }).map((n) => n.id), [a.id, b.id]);
  assert.deepEqual(m.nodesInRect(nodes, { x: -100, y: -100, width: 1000, height: 1000 }).length, 4);
  assert.deepEqual(m.rectFromPoints({ x: 5, y: 9 }, { x: 1, y: 2 }), { x: 1, y: 2, width: 4, height: 7 });
});

test('edge curves start and end on the named sides and leave along their normals', () => {
  const a = m.makeNode('text', { x: 0, y: 0, width: 100, height: 50 });
  const b = m.makeNode('text', { x: 300, y: 0, width: 100, height: 50 });
  const c = m.edgeCurve(a, 'right', b, 'left');
  assert.deepEqual(c.p0, { x: 100, y: 25 });
  assert.deepEqual(c.p3, { x: 300, y: 25 });
  assert.ok(c.c1.x > c.p0.x && c.c2.x < c.p3.x);
  assert.deepEqual(m.curvePoint(c, 0), c.p0);
  assert.deepEqual(m.curvePoint(c, 1), c.p3);
  assert.deepEqual(m.curvePoint(c, 0.5), { x: 200, y: 25 });
  assert.match(m.curvePath(c), /^M100,25 C/);
  const tip = m.arrowHead(c, 'to', 10);
  assert.deepEqual(tip[0], c.p3);
  assert.ok(tip[1].x < 300 && tip[2].x < 300);
  assert.ok(m.distanceToCurve(c, { x: 200, y: 30 }) < 6);
  assert.ok(m.distanceToCurve(c, { x: 200, y: 200 }) > 100);
  const auto = m.edgeCurve(a, undefined, b, undefined);
  assert.equal(auto.fromSide, 'right');
  assert.equal(auto.toSide, 'left');
  const live = m.edgeCurve(a, 'bottom', { x: 50, y: 300 }, null);
  assert.deepEqual(live.p3, { x: 50, y: 300 });
  assert.equal(live.toSide, null);
});

test('view: fit, zoom around a point, resize with snapping and minimum size', () => {
  const v = m.fitView({ x: 0, y: 0, width: 1000, height: 500 }, 1120, 620);
  assert.equal(v.scale, 1);
  assert.equal(v.x, 60);
  assert.equal(v.y, 60);
  const small = m.fitView({ x: 0, y: 0, width: 4000, height: 500 }, 1120, 620);
  assert.ok(Math.abs(small.scale - 0.25) < 1e-9);
  const z = m.zoomViewAt({ x: 0, y: 0, scale: 1 }, 2, 100, 100);
  assert.deepEqual(z, { x: -100, y: -100, scale: 2 });
  assert.equal(m.zoomViewAt({ x: 0, y: 0, scale: 1 }, 100, 0, 0).scale, 4);
  const start = { x: 0, y: 0, width: 200, height: 100 };
  assert.deepEqual(m.resizeRect(start, 'se', 33, 47, { grid: 10 }), { x: 0, y: 0, width: 230, height: 150 });
  assert.deepEqual(m.resizeRect(start, 'nw', 500, 500), { x: 140, y: 60, width: 60, height: 40 });
  assert.deepEqual(m.resizeRect(start, 'w', -21, 0), { x: -21, y: 0, width: 221, height: 100 });
  assert.equal(m.snap(14), 10);
  assert.equal(m.snap(15), 20);
});

test('copy, duplicate and delete keep edges between the copied nodes only', () => {
  const doc = m.parseCanvas(SAMPLE);
  const ids = ['a1b2c3d4e5f60718', 'b1b2c3d4e5f60718'];
  const { nodes, edges } = m.cloneSubset(doc, ids, 30, 30);
  assert.equal(nodes.length, 2);
  assert.equal(edges.length, 1);
  assert.equal(nodes[0].x, doc.nodes[1].x + 30);
  assert.notEqual(nodes[0].id, doc.nodes[1].id);
  assert.equal(edges[0].fromNode, nodes[0].id);
  assert.equal(edges[0].toNode, nodes[1].id);
  assert.equal(edges[0].label, 'leads to');
  m.removeItems(doc, ['a1b2c3d4e5f60718']);
  assert.equal(doc.nodes.length, 3);
  assert.equal(doc.edges.length, 0);
});

test('file subpaths: headings (nested) and block ids', () => {
  const text = '# Plan\nintro\n## Goals\none\n### Detail\ndeep\n## Risks\nr\n\npara line\nlast ^blk1\n\nafter';
  assert.equal(m.extractSection(text, '#Goals'), '## Goals\none\n### Detail\ndeep');
  assert.equal(m.extractSection(text, '#Plan#Risks'), '## Risks\nr\n\npara line\nlast ^blk1\n\nafter');
  assert.equal(m.extractSection(text, '#^blk1'), 'para line\nlast');
  assert.equal(m.extractSection(text, '#Nope'), text);
  assert.equal(m.extractSection(text, ''), text);
  assert.equal(m.baseName('a/b/Plan.md'), 'Plan.md');
});

test('history: push, undo, redo, a new change drops the redo branch, equal states are not stored', () => {
  const h = new m.CanvasHistory(3);
  h.reset({ nodes: [], edges: [] });
  assert.equal(h.canUndo, false);
  assert.equal(h.push({ nodes: [], edges: [] }), false);
  h.push({ nodes: [{ id: 'a' }], edges: [] });
  h.push({ nodes: [{ id: 'b' }], edges: [] });
  assert.deepEqual(h.undo().nodes, [{ id: 'a' }]);
  assert.deepEqual(h.redo().nodes, [{ id: 'b' }]);
  assert.equal(h.redo(), null);
  h.undo();
  h.push({ nodes: [{ id: 'c' }], edges: [] });
  assert.equal(h.canRedo, false);
  h.push({ nodes: [{ id: 'd' }], edges: [] });
  assert.equal(h.stack.length, 3);
  assert.deepEqual(h.undo().nodes, [{ id: 'c' }]);
  assert.deepEqual(h.undo().nodes, [{ id: 'a' }]);
  assert.equal(h.undo(), null);
});
