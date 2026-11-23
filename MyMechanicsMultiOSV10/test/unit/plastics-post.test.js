// The whole moulding study (src/cad/plastics-post.js) on a plate part: fill and pack, then fiber orientation of a
// glass-filled resin, cooling with automatic channels on both mould halves and the warpage split by cause — every
// extra result present, consistent and cloneable (it crosses from the worker).
import test from 'node:test';
import assert from 'node:assert/strict';
import { runMouldingStudy, vertexColours } from '../../src/cad/plastics-post.js';
import { rampColour } from '../../src/cad/plastics.js';
import { boxMesh } from './fem-shapes.js';

test('fill → fibers → cooling → warpage on a 100 × 40 × 3 plate of glass-filled PA66', () => {
  const mesh = boxMesh(100, 40, 3, 2);
  const phases = new Set(); let posted = null;
  const out = runMouldingStudy({
    mesh, gates: [[2, 20, 1.5]], domain: { cells: 40, mode: 'auto' },
    process: { resin: 'pa66', packPressure: 60, packTime: 3 },
    fiber: { fraction: 0.3, aspect: 20 },
    cooling: { auto: { diameter: 8, flow: 6, inlet: 30 }, cycleTime: 0 },
    warp: { on: true, size: 4 },
  }, (m) => { if (m.type === 'progress') phases.add(m.phase); if (m.type === 'result') posted = m; if (m.type === 'error') throw new Error(m.message); });
  assert.ok(out && posted, 'a result was posted');
  for (const p of ['fiber', 'cooling', 'warp']) assert.ok(phases.has(p), `phase ${p}`);
  const r = out.result;
  assert.equal(r.fiberAlign.length, out.domain.nodes.length);
  assert.ok(r.fibers.mean > 0.5, `mean alignment ${r.fibers.mean}`);
  assert.ok(r.fibers.skinMean >= r.fibers.coreMean, 'skin at least as aligned as the core');
  assert.equal(r.cooling.circuits.length, 2);
  assert.ok(r.mouldTemp.every((v) => v > 30 && v < 160), 'mould between the coolant and the ejection temperature');
  assert.ok(r.coolTime.every(Number.isFinite));
  assert.ok(r.cooling.summary.cycleWithCooling > 0);
  assert.ok(Math.abs(r.cooling.circuits.reduce((s, c) => s + c.heat, 0) - r.cooling.summary.heat) < 1e-6 * r.cooling.summary.heat, 'heat balance');
  const w = r.warp;
  assert.ok(!w.error, w.error);
  for (const c of ['shrinkage', 'cooling', 'orientation', 'total']) {
    assert.equal(w.cases[c].vertexWarp.length, mesh.vertices.length, `${c}: one vector per part vertex`);
    assert.ok(Number.isFinite(w.cases[c].warpMax));
  }
  assert.ok(w.cases.orientation.warpMax > 0, 'fibers following the flow from one end warp the plate');
  assert.ok(['shrinkage', 'cooling', 'orientation'].includes(w.dominant));
  assert.ok(w.cases.total.max > w.cases.total.warpMax, 'most of the motion is the even shrinkage');
  // Nothing in the result is a function (it has to cross from the worker).
  assert.doesNotThrow(() => structuredClone(out));
  const vc = vertexColours(w.cases.total.vertexWarp, 3, rampColour);
  assert.equal(vc.colors.length, mesh.vertices.length);
  assert.ok(vc.max >= vc.min);
});

test('without fibers, channels or warpage the study is the plain fill result', () => {
  const out = runMouldingStudy({ mesh: boxMesh(60, 30, 2, 2), gates: [], domain: { cells: 30 }, process: { resin: 'abs' } });
  assert.ok(out);
  assert.equal(out.result.fibers, undefined);
  assert.equal(out.result.cooling, undefined);
  assert.equal(out.result.warp, undefined);
});
