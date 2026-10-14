// FEM: 2D frames of beam elements checked against textbook results.
import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeFrame, autoScale, deformedShape, frameFrom, momentDiagram, normalizeFem, sectionProps } from '../../src/domain/fem.js';

const near = (a, b, rel = 1e-9) => assert.ok(Math.abs(a - b) <= Math.abs(b) * rel + 1e-9, `${a} ≠ ${b}`);
const line = (x1, y1, x2, y2) => ({ type: 'line', id: `l${x1},${y1},${x2},${y2}`, x1, y1, x2, y2 });
const E = 210000;
const section = { type: 'rect', b: 50, h: 100 };
const { A, I } = sectionProps(section);

test('sections: rectangle, circle, tube, I-beam', () => {
  near(A, 5000); near(I, (50 * 100 ** 3) / 12);
  near(sectionProps({ type: 'circle', d: 20 }).I, (Math.PI * 20 ** 4) / 64);
  near(sectionProps({ type: 'tube', d: 20, t: 2 }).A, (Math.PI * (400 - 256)) / 4);
  // IPE 200: h 200, b 100, tw 5.6, tf 8.5 → I ≈ 1943 cm⁴ (catalogue, without root fillets ≈ 1846).
  const ipe = sectionProps({ type: 'ibeam', h: 200, b: 100, tw: 5.6, tf: 8.5 });
  assert.ok(ipe.I > 1.8e7 && ipe.I < 1.95e7, String(ipe.I));
});

test('cantilever with a tip load: δ = PL³/3EI, M = PL at the wall', () => {
  const frame = frameFrom([line(0, 0, 1000, 0), line(1000, 0, 2000, 0)]);
  assert.equal(frame.nodes.length, 3, 'shared ends are one node');
  const r = analyzeFrame(frame, { section, supports: { '0,0': 'fixed' }, loads: { '2000,0': { fy: -1000 } } });
  assert.ok(r.ok);
  near(r.displacements[2].uy, (-1000 * 2000 ** 3) / (3 * E * I));
  near(r.displacements[2].rz, (-1000 * 2000 ** 2) / (2 * E * I));
  near(r.max.moment, -1000 * 2000);
  near(r.reactions[0].fy, 1000);
  near(r.reactions[0].m, 1000 * 2000);
});

test('simply supported beam under a uniform load: δ = 5qL⁴/384EI, M = qL²/8, σ = M/W', () => {
  const r = analyzeFrame(frameFrom([line(0, 0, 4000, 0)]), { section, supports: { '0,0': 'pinned', '4000,0': 'rollerX' }, q: 2 });
  near(r.max.moment, (2 * 4000 ** 2) / 8);
  near(r.max.sigma, ((2 * 4000 ** 2) / 8) / (I / 50));
  // One element only: the sag between the ends comes from the member's own load.
  near(r.max.displacement, (5 * 2 * 4000 ** 4) / (384 * E * I), 1e-6);
  const [shape] = deformedShape(frameFrom([line(0, 0, 4000, 0)]), r, 1);
  near(shape[8].y, (-5 * 2 * 4000 ** 4) / (384 * E * I), 1e-6);
  assert.deepEqual(r.reactions.map((x) => Math.round(x.fy * 1e6) / 1e6), [4000, 4000]);
  const split = analyzeFrame(frameFrom([line(0, 0, 2000, 0), line(2000, 0, 4000, 0)]), { section, supports: { '0,0': 'pinned', '4000,0': 'rollerX' }, q: 2 });
  near(split.displacements[1].uy, (-5 * 2 * 4000 ** 4) / (384 * E * I));
  // Self weight: ρ·A·g = 7.85e-6 · 5000 · 9.81 N/mm.
  const heavy = analyzeFrame(frameFrom([line(0, 0, 4000, 0)]), { section, supports: { '0,0': 'pinned', '4000,0': 'rollerX' }, selfWeight: true });
  near(heavy.w, 7.85e-6 * 5000 * 9.81);
});

test('axial bar and a portal frame (equilibrium of reactions)', () => {
  const bar = analyzeFrame(frameFrom([line(0, 0, 0, 1000)]), { section, supports: { '0,0': 'fixed' }, loads: { '0,1000': { fy: 10000 } } });
  near(bar.displacements[1].uy, (10000 * 1000) / (E * A));
  near(bar.members[0].N, 10000);
  const portal = frameFrom([line(0, 0, 0, 3000), line(0, 3000, 5000, 3000), line(5000, 3000, 5000, 0)]);
  const r = analyzeFrame(portal, { section, supports: { '0,0': 'fixed', '5000,0': 'fixed' }, q: 3, loads: { '0,3000': { fx: 2000 } } });
  assert.ok(r.ok);
  const sum = r.reactions.reduce((s, x) => ({ fx: s.fx + x.fx, fy: s.fy + x.fy }), { fx: 0, fy: 0 });
  near(sum.fx, -2000, 1e-6);
  near(sum.fy, 3 * 5000, 1e-6);
  assert.ok(r.displacements[1].ux > 0 && r.displacements[2].ux > 0, 'the frame sways with the side load');
});

test('mechanisms and missing supports are errors; the drawn shapes start at the nodes', () => {
  assert.equal(analyzeFrame(frameFrom([line(0, 0, 1000, 0)]), {}).error, 'noSupports');
  assert.equal(analyzeFrame(frameFrom([line(0, 0, 1000, 0)]), { supports: { '0,0': 'pinned' }, loads: { '1000,0': { fy: -10 } } }).error, 'mechanism');
  const frame = frameFrom([line(0, 0, 2000, 0)]);
  const r = analyzeFrame(frame, { section, supports: { '0,0': 'fixed' }, loads: { '2000,0': { fy: -1000 } } });
  const scale = autoScale(frame, r);
  const [shape] = deformedShape(frame, r, scale);
  near(shape.at(-1).y, r.displacements[1].uy * scale, 1e-9);
  near(Math.abs(shape.at(-1).y), 200, 1e-9, 'a tenth of the frame size');
  const [moments] = momentDiagram(frame, r, 1e-4);
  assert.equal(moments[0].x, 0);
  assert.deepEqual(normalizeFem({ supports: { a: 'free', b: 'bogus', c: 'fixed' } }).supports, { c: 'fixed' });
});
