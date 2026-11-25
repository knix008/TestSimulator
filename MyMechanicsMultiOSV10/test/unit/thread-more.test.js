// Thread: several starts (the section repeated round the axis, on a lead of starts × P) and other forms
// (trapezoidal, buttress, 55° pipe) — exact screw solids like the ISO thread.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadKernel, rep } from '../../src/cad/kernel.js';
import { createFeature, regenerate } from '../../src/cad/features.js';
import { addCircle, createSketchGeometry } from '../../src/cad/sketch.js';
import { edgeSignature } from '../../src/cad/refs.js';
import { THREAD_SECTIONS } from '../../src/cad/advanced.js';
import { formThread, sectionArea } from '../../src/cad/threads.js';

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

test('V, trapezoidal, buttress and 55° pipe threads are exact screw solids: the fully threaded part has the section area × length', () => {
  for (const form of ['v', 'trapezoidal', 'buttress', 'pipe55']) {
    removed({ form });
    // The top 16 mm (the runout fades the thread over the last 2.5 P = 7.5 mm of the 24).
    const slab = R.makeCylinder(12, 16, [0, 0, 24], [0, 0, 1]);
    const got = V(removed.last.clone().intersect(slab));
    const want = sectionArea(formThread(form, 20, 3)) * 16;
    assert.ok(Math.abs(got - want) < 2e-4 * want, `${form}: ${got} vs ${want}`);
  }
});
void inside;
