// Thread: several starts (each a groove on the lead, turned 360°/starts) and other forms (trapezoidal,
// buttress, 55° pipe) — the material removed compared with the single-start V groove.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadKernel, rep } from '../../src/cad/kernel.js';
import { createFeature, regenerate } from '../../src/cad/features.js';
import { addCircle, createSketchGeometry } from '../../src/cad/sketch.js';
import { edgeSignature } from '../../src/cad/refs.js';
import { THREAD_SECTIONS } from '../../src/cad/advanced.js';

await loadKernel();
const R = rep();
const V = (s) => R.measureVolume(s);
const top = { kind: 'std', name: 'top' };

/** Material a thread removes from a Ø20 × 40 shaft (pitch 3, 24 long from its top edge). */
function removed(params) {
  const part = { id: 'p', name: 'P', features: [] };
  const s = createFeature(part, 'sketch', { plane: top, ...createSketchGeometry() }); addCircle(s, 0, 0, 10); part.features.push(s);
  const e = createFeature(part, 'extrude', { sketch: s.id, depth: 40 }); part.features.push(e);
  const base = regenerate(part).body;
  const rim = base.edges.find((x) => x.geomType === 'CIRCLE' && Math.abs(x.startPoint.z - 40) < 1e-6);
  const t = createFeature(part, 'thread', { edge: edgeSignature(rim), pitch: 3, length: 24, form: 'v', ...params }); part.features.push(t);
  const r = regenerate(part); assert.ok(r.results.get(t.id).ok, r.results.get(t.id).detail);
  const out = V(base) - V(r.body);
  removed.last = r.body;
  return out;
}
/** The part of a groove section inside the material (depth ≥ 0), by the shoelace formula on the clipped polygon. */
function inside(form) {
  const pts = THREAD_SECTIONS[form](3);
  let area = 0;
  for (let i = 0; i < pts.length; i++) { const [a, b] = pts[i]; const [c, d] = pts[(i + 1) % pts.length]; area += a * d - c * b; }
  return Math.abs(area) / 2;
}

test('a two-start thread: the same material as one start of that pitch (grooves P apart), on a lead of 2P', () => {
  const one = removed({}); const b1 = removed.last;
  const two = removed({ starts: 2 }); const b2 = removed.last;
  assert.ok(Math.abs(two / one - 1) < 0.03, String(two / one));
  // The grooves run differently: the two bodies differ by a good part of a groove.
  const diff = R.measureVolume(b1.clone().cut(b2.clone()));
  assert.ok(diff > 0.2 * one, String(diff));
});

test('trapezoidal, buttress and pipe forms remove material in proportion to their sections', () => {
  const v = removed({});
  for (const form of ['trapezoidal', 'buttress', 'pipe55']) {
    const ratio = removed({ form }) / v;
    // The sections all start at the surface: the removed volumes scale with their areas (within the faceting).
    assert.ok(Math.abs(ratio - inside(form) / inside('v')) < 0.08 * (inside(form) / inside('v')), `${form}: ${ratio} vs ${inside(form) / inside('v')}`);
  }
});
