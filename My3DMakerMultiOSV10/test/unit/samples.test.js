// Every example project builds a valid job and solves with the WebAssembly solver (the same Rust code
// the desktop runs natively). Quick runs (npm test -- --quick) take a fast subset.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SAMPLES, buildSample } from '../../src/sim/samples.js';
import { buildJob, outputsOf } from '../../src/sim/project.js';
import { resultItems, displayOf, chartsOf } from '../../src/sim/results.js';
import { solve } from './wasm-helper.mjs';

const QUICK = ['cantilever', 'plateHole', 'plasticBar', 'contactBlocks', 'modalBeam', 'harmonicBeam', 'heatSink', 'thermalStress', 'ductFlow', 'busbar', 'capacitor', 'roomModes'];
const list = process.env.MY3DMAKER_QUICK ? SAMPLES.filter((s) => QUICK.includes(s.id)) : SAMPLES;

for (const s of list) {
  test(`example ${s.id} solves`, () => {
    const p = buildSample(s.id, 'en');
    assert.ok(p.systems.length > 0, 'has a system');
    for (const sys of p.systems) {
      const job = buildJob(p, sys);
      const r = solve(job);
      assert.ok(r.mesh.elements > 0, 'meshed');
      // Every picked face of the example exists in the mesh (same body).
      for (const bc of sys.bcs) for (const f of bc.faces) assert.ok(r.mesh.faces.some((x) => x.body === f.body), `${bc.type}: face of ${f.body}`);
      const out = outputsOf(sys, r);
      assert.ok(Object.keys(out).length > 0, 'has outputs');
      for (const [k, v] of Object.entries(out)) assert.ok(Number.isFinite(v), `${k} = ${v}`);
      // Every result item can be shown.
      const items = resultItems(sys, r);
      assert.ok(items.length > 0, 'has result items');
      for (const item of items) {
        const d = displayOf(item, r, 100);
        assert.ok(d.values || d.slices || d.surface || d.streamlines, `${item.key} shows something`);
        if (d.values) assert.equal(d.values.length, r.mesh.corners, `${item.key}: one value per node`);
      }
      for (const c of chartsOf(sys, r)) assert.ok(c.series.every((x) => x.x.length === x.y.length), `${c.id}: series lengths`);
    }
  });
}
