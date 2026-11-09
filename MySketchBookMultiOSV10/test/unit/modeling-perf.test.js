// Modelling kernel performance: big line grids must stay interactive.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GeoMesh } from '../../src/modeling/mesh.js';

const N = 200, S = 0.1; // 200 × 200 cells, 10 cm apart → 80 400 edges, 40 000 faces

test(`a ${N}×${N} grid of lines builds and edits incrementally`, (t) => {
  const m = new GeoMesh();
  const t0 = performance.now();
  for (let i = 0; i <= N; i++) m.addEdge([0, 0, i * S], [N * S, 0, i * S]);
  for (let i = 0; i <= N; i++) m.addEdge([i * S, 0, 0], [i * S, 0, N * S]);
  const build = performance.now() - t0;
  assert.equal(m.edges.size, 2 * (N + 1) * N);
  assert.equal(m.faces.size, N * N);

  const t1 = performance.now();
  const tri = m.triangulate();
  const triFirst = performance.now() - t1;
  assert.equal(tri.indices.length / 3, 2 * N * N);

  // push/pull one cell: local work only
  const cell = [...m.faces.keys()].find((f) => m.classifyPoint(f, { x: 10.05, y: 0, z: 10.05 }) === 'in');
  const t2 = performance.now();
  const r = m.pushPull(cell, 0.3);
  const push = performance.now() - t2;
  assert.ok(r.face);
  assert.equal(m.faces.size, N * N + 4);

  // and keep stretching it (what dragging the mouse does)
  const t3 = performance.now();
  for (let k = 0; k < 10; k++) m.pushPull(r.face, 0.01);
  const drag = (performance.now() - t3) / 10;

  // a line across the grid splits 200 edges and 200 faces
  const t4 = performance.now();
  m.addEdge([0.05, 0, 0], [0.05, 0, N * S]);
  const cut = performance.now() - t4;
  assert.equal(m.faces.size, N * N + 4 + N);

  const t5 = performance.now();
  m.triangulate();
  const triAgain = performance.now() - t5;

  t.diagnostic(`build ${build.toFixed(0)} ms · triangulate ${triFirst.toFixed(0)} ms (again ${triAgain.toFixed(0)} ms) · push/pull ${push.toFixed(2)} ms · stretch ${drag.toFixed(2)} ms · cut line ${cut.toFixed(1)} ms`);
  console.log(`    perf: build ${build.toFixed(0)} ms, triangulate ${triFirst.toFixed(0)}/${triAgain.toFixed(0)} ms, push/pull ${push.toFixed(2)} ms, stretch ${drag.toFixed(2)} ms, cut ${cut.toFixed(1)} ms`);
  assert.ok(push < 50, `push/pull took ${push} ms`);
  assert.ok(drag < 50, `stretch took ${drag} ms`);
  assert.ok(build < 20000, `build took ${build} ms`);
});
