// The model document: blocks and links, renaming through expressions, the
// model check, undo history, expressions and distributions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addLink, checkModel, cloneBlocks, createModel, History, linkProblem, makeBlock, normalizeModel, parseModel, referenceNames, removeBlocks, renameBlock, serializeModel } from '../../src/sim/model.js';
import { BLOCK_TYPES, blockBounds, pathLength, pathPoints, portsOf } from '../../src/sim/blocks.js';
import { compile, evaluate, isIdentifier } from '../../src/sim/expr.js';
import { createRandom, DIST_KINDS, defaultDist, distMean, formatDist, sample } from '../../src/sim/random.js';

test('every block type has an icon, a size, a category and default properties', () => {
  for (const [type, spec] of Object.entries(BLOCK_TYPES)) {
    assert.ok(spec.icon && spec.cat && spec.w > 0 && spec.h > 0, type);
    const m = createModel();
    const b = makeBlock(m, type, 0, 0);
    for (const p of spec.props) assert.ok(p.key in b.props, `${type}.${p.key}`);
    const box = blockBounds(b);
    assert.ok(box.x1 > box.x0 && box.y1 > box.y0, type);
  }
});

test('ports follow rotation: a block turned 90° has its output below', () => {
  const m = createModel();
  const b = makeBlock(m, 'process', 0, 0, { rot: 90 });
  const out = portsOf(b).outs[0];
  assert.ok(Math.abs(out.x) < 1e-9 && out.y > 0, JSON.stringify(out));
  const sel = makeBlock(m, 'select', 0, 0, { props: { outputs: 4 } });
  assert.equal(portsOf(sel).outs.length, 4);
});

test('paths: points, length', () => {
  const m = createModel();
  const c = makeBlock(m, 'conveyor', 10, 5, { points: [[0, 0], [3, 0], [3, 4]] });
  assert.deepEqual(pathPoints(c)[2], [13, 9]);
  assert.equal(pathLength(pathPoints(c)), 7);
});

test('names are unique and SD names are identifiers', () => {
  const m = createModel();
  m.blocks.push(makeBlock(m, 'queue', 0, 0));
  m.blocks.push(makeBlock(m, 'queue', 5, 0));
  assert.deepEqual(m.blocks.map((b) => b.name), ['Queue1', 'Queue2']);
  assert.ok(isIdentifier('Stock1'));
  assert.ok(!isIdentifier('my stock'));
});

test('renaming updates equations, pools and charts', () => {
  const m = createModel();
  const s = makeBlock(m, 'stock', 0, 0, { name: 'Inventory' }); m.blocks.push(s);
  const f = makeBlock(m, 'flow', 4, 0, { name: 'Out', props: { equation: 'Inventory * 0.1 + InventoryX' } }); m.blocks.push(f);
  const pool = makeBlock(m, 'resourcePool', 0, 5, { name: 'Crew' }); m.blocks.push(pool);
  const p = makeBlock(m, 'process', 5, 5, { props: { pool: 'Crew' } }); m.blocks.push(p);
  m.charts.push({ id: 'c', title: '', kind: 'line', series: ['Inventory'] });
  assert.ok(renameBlock(m, s.id, 'Stock'));
  assert.equal(f.props.equation, 'Stock * 0.1 + InventoryX');
  assert.deepEqual(m.charts[0].series, ['Stock']);
  assert.ok(renameBlock(m, pool.id, 'Team'));
  assert.equal(p.props.pool, 'Team');
  assert.ok(!renameBlock(m, s.id, 'Team'), 'taken names are refused');
  assert.ok(!renameBlock(m, s.id, 'two words'), 'SD names must be identifiers');
});

test('link rules', () => {
  const m = createModel();
  const src = makeBlock(m, 'source', 0, 0); const sink = makeBlock(m, 'sink', 5, 0); const st = makeBlock(m, 'stock', 0, 5); const fl = makeBlock(m, 'flow', 5, 5);
  m.blocks.push(src, sink, st, fl);
  assert.equal(linkProblem(m, { block: src.id, port: 0 }, { block: src.id, port: 0 }), 'link.self');
  assert.equal(linkProblem(m, { block: src.id, port: 0 }, { block: sink.id, port: 0 }), null);
  addLink(m, { block: src.id, port: 0 }, { block: sink.id, port: 0 });
  assert.equal(linkProblem(m, { block: src.id, port: 0 }, { block: sink.id, port: 0 }), 'link.duplicate');
  assert.equal(linkProblem(m, { block: st.id, port: -1 }, { block: fl.id, port: 0 }), null);
  assert.equal(linkProblem(m, { block: src.id, port: 0 }, { block: st.id, port: -1 }), 'link.sdMix');
});

test('model check: unconnected source is an error, unknown names are found', () => {
  const m = createModel();
  m.blocks.push(makeBlock(m, 'source', 0, 0));
  m.blocks.push(makeBlock(m, 'variable', 0, 5, { name: 'V', props: { equation: 'Nope * 2' } }));
  const problems = checkModel(m);
  assert.ok(problems.some((p) => p.key === 'noOutput' && p.severity === 'error'));
  assert.ok(problems.some((p) => p.key === 'unknownRef' && p.params.ref === 'Nope'));
  assert.ok(referenceNames(m).has('Source1.count'));
});

test('copying blocks keeps the links between them', () => {
  const m = createModel();
  const a = makeBlock(m, 'source', 0, 0); m.blocks.push(a);
  const b = makeBlock(m, 'sink', 5, 0); m.blocks.push(b);
  addLink(m, { block: a.id, port: 0 }, { block: b.id, port: 0 });
  const copies = cloneBlocks(m, [a, b], m.links, 0, 10);
  assert.equal(copies.length, 2);
  assert.equal(m.links.length, 2);
  assert.equal(copies[0].y, 10);
  removeBlocks(m, [a.id]);
  assert.equal(m.links.length, 1);
});

test('history: undo and redo whole-model snapshots', () => {
  const m = createModel();
  const h = new History(m);
  m.blocks.push(makeBlock(m, 'queue', 0, 0)); h.push(m, 'op.add');
  m.blocks.push(makeBlock(m, 'queue', 5, 0)); h.push(m, 'op.add');
  assert.equal(h.undo().blocks.length, 1);
  assert.equal(h.undo().blocks.length, 0);
  assert.equal(h.redo().blocks.length, 1);
});

test('files: serialize and parse, foreign files refused, junk repaired', () => {
  const m = createModel('x');
  m.blocks.push(makeBlock(m, 'process', 1, 2));
  const back = parseModel(serializeModel(m));
  assert.equal(back.blocks[0].x, 1);
  assert.throws(() => parseModel(JSON.stringify({ format: 'other' })));
  const fixed = normalizeModel({ blocks: [{ type: 'nope' }, { type: 'queue', x: 'a' }], links: [{ from: { block: 'zz' }, to: { block: 'yy' } }], settings: { duration: -5, timeUnit: 'weeks' } });
  assert.equal(fixed.blocks.length, 1);
  assert.equal(fixed.links.length, 0);
  assert.equal(fixed.settings.timeUnit, 'min');
  assert.ok(fixed.settings.duration > 0);
});

test('expressions: arithmetic, logic, functions, references', () => {
  assert.equal(evaluate('1 + 2 * 3 ^ 2'), 19);
  assert.equal(evaluate('a > 2 && b < 1 ? 10 : 20', { a: 3, b: 0 }), 10);
  assert.equal(evaluate('max(1, 5, 3) + min(2, 4)'), 7);
  assert.equal(evaluate('Queue1.length * 2', { 'Queue1.length': 4 }), 8);
  assert.equal(evaluate('step(5, 10, t)', { t: 12 }, { time: 12 }), 5);
  assert.equal(evaluate('step(5, 10)', {}, { time: 12 }), 5);
  assert.equal(evaluate('step(5, 10, t)', { t: 8 }, { time: 8 }), 0);
  assert.ok(!compile('1 +').ok);
  assert.ok(!compile('foo(1)').ok);
  assert.deepEqual([...compile('a + b.c').refs], ['a', 'b.c']);
});

test('distributions: samples are non-negative and means match', () => {
  const r = createRandom(5);
  for (const kind of DIST_KINDS) {
    if (kind === 'expression') continue;
    const d = defaultDist(kind, 10);
    let sum = 0; const n = 20000;
    for (let i = 0; i < n; i++) { const x = sample(d, r); assert.ok(x >= 0); sum += x; }
    const mean = distMean(d);
    assert.ok(Math.abs(sum / n - mean) / mean < 0.06, `${kind}: ${sum / n} vs ${mean}`);
    assert.ok(formatDist(d).length > 0);
  }
});
