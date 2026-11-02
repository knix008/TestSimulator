// Wiring in the graphical editor: a dragged line snaps to an input near the pointer or on a block's
// body (no need to hit the small port), and a line's shape is 곡선 / 직선 / 꺾은선.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  emptyFlow, makeNode, connect, snapInput, wirePath, wireStyleOf, setWireStyle, WIRE_STYLES,
  copyItems, pasteItems, serializeFlow, parseFlow, generateCode,
} from '../src/flow/flow.js';

const W = 190, HEAD = 26, ROW = 24;
// the editor's geometry for blocks with no body row (op): inputs follow the header
const GEO = { rect: (n) => ({ x: n.x, y: n.y, w: W, h: HEAD + 3 * ROW + 6 }), inY: (n, i) => n.y + HEAD + i * ROW + ROW / 2 };

function twoBlocks() {
  let f = emptyFlow();
  const c = makeNode(f, 'const', 0, 0); f = { ...f, nodes: [c] };
  const o = makeNode(f, 'op', 400, 100); f = { ...f, nodes: [c, o] };
  return { f, c, o, from: { node: c.id, port: 0 } };
}

test('a line end near an input snaps to it', () => {
  const { f, o, from } = twoBlocks();
  const in0 = { x: o.x, y: GEO.inY(o, 0) }, in1 = { x: o.x, y: GEO.inY(o, 1) };
  assert.deepEqual(snapInput(f, from, { x: in0.x - 20, y: in0.y + 5 }, 28, GEO), { node: o.id, port: 0 }, '20 px left of the port');
  assert.deepEqual(snapInput(f, from, { x: in1.x + 6, y: in1.y - 4 }, 28, GEO), { node: o.id, port: 1 });
  assert.equal(snapInput(f, from, { x: in0.x - 60, y: in0.y }, 28, GEO), null, 'too far, off the block');
});

test('a line dropped on a block body joins its nearest free input', () => {
  let { f, c, o, from } = twoBlocks();
  const body = { x: o.x + 120, y: GEO.inY(o, 1) + 2 };
  assert.deepEqual(snapInput(f, from, body, 28, GEO), { node: o.id, port: 1 }, 'the input at that height');
  // input 1 taken: a drop at its height goes to the free input 0
  const c2 = makeNode(f, 'const', 0, 200); f = { ...f, nodes: [...f.nodes, c2] };
  f = connect(f, { node: c2.id, port: 0 }, { node: o.id, port: 1 });
  assert.deepEqual(snapInput(f, from, body, 28, GEO), { node: o.id, port: 0 });
  // the line's own block is never a target, and a block without inputs takes none
  assert.equal(snapInput(f, from, { x: c.x + 50, y: c.y + 20 }, 28, GEO), null);
});

test('line shapes: curve (default), straight and elbow paths', () => {
  assert.deepEqual(WIRE_STYLES, ['curve', 'straight', 'elbow']);
  assert.match(wirePath(0, 0, 200, 100), /^M0,0 C/);
  assert.equal(wirePath(0, 0, 200, 100, 'straight'), 'M0,0 L200,100');
  assert.equal(wirePath(0, 0, 200, 100, 'elbow'), 'M0,0 H100 V100 H200');
  assert.equal(wirePath(300, 0, 100, 100, 'elbow'), 'M300,0 H320 V50 H80 V100 H100', 'backward: around');
  assert.equal(wireStyleOf({}), 'curve');
  assert.equal(wireStyleOf({ style: 'bogus' }), 'curve');
});

test('a line keeps its shape through save, copy and paste; code is unchanged', () => {
  let { f, o, from } = twoBlocks();
  f = connect(f, from, { node: o.id, port: 0 });
  const id = f.links[0].id;
  const code = generateCode(f).code;
  f = setWireStyle(f, [id], 'elbow');
  assert.equal(f.links[0].style, 'elbow');
  assert.equal(generateCode(f).code, code, 'the shape is only drawing');
  const back = parseFlow(serializeFlow(f));
  assert.equal(wireStyleOf(back.links[0]), 'elbow', 'saved in the .mflow file');
  const pasted = pasteItems(f, copyItems(f, f.nodes.map((n) => n.id)), 30);
  assert.equal(wireStyleOf(pasted.flow.links[1]), 'elbow');
  assert.equal(setWireStyle(f, [id], 'curve').links[0].style, undefined, 'curve is the default: no field');
});

test('the editor snaps, previews and styles lines', () => {
  const fe = fs.readFileSync(new URL('../src/flow/FlowEditor.jsx', import.meta.url), 'utf8');
  assert.match(fe, /const target = snapInput\(flowRef\.current, g\.from, w, SNAP_PX \/ flowRef\.current\.view\.zoom, GEO\);/, 'while dragging');
  assert.match(fe, /const target = snapInput\(flowRef\.current, g\.from, toWorld\(e\.clientX, e\.clientY\)/, 'on release');
  assert.match(fe, /outRow && outRow\.querySelector\('\[data-out\]'\)/, 'the whole output row starts a line');
  assert.match(fe, /data-wire-props=""/);
  assert.match(fe, /pick\.startsWith\('style:'\)/, 'right-click on a line');
  assert.match(fe, /wireStyleOf\(l\)\)/);
});

test('a press near an output port starts a line from it', async () => {
  const { snapOutput } = await import('../src/flow/flow.js');
  const { f, c } = twoBlocks();
  const geo = { ...GEO, outY: (n, j) => n.y + HEAD + ROW + j * ROW + ROW / 2 };
  const port = { x: c.x + W, y: geo.outY(c, 0) };
  assert.deepEqual(snapOutput(f, { x: port.x - 10, y: port.y + 6 }, 17, geo), { node: c.id, port: 0 });
  assert.equal(snapOutput(f, { x: port.x - 40, y: port.y }, 17, geo), null, 'the block body still moves the block');
});
