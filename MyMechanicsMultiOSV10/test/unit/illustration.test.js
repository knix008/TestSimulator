// Technical illustrations (src/cad/illustration.js): views, their interpolation, exploded placements, the line art
// with balloons and parts list, and the stepping HTML document.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadKernel, rep } from '../../src/cad/kernel.js';
import { buildSample } from '../../src/cad/samples.js';
import { regenerate } from '../../src/cad/features.js';
import { autoExplode, placeShape } from '../../src/cad/assembly.js';
import { normaliseView, interpolateViews, viewPlacements, itemNumbers, autoCallouts, anchorPoints, illustrationSvg, illustrationHtml } from '../../src/cad/illustration.js';

await loadKernel();
const R = rep();
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b}`);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

test('views: the camera is unit, its up square to it; interpolation turns on a great circle and fades hidden parts', () => {
  const v = normaliseView({ camera: { dir: [0, 0, -2], up: [0, 1, 1] } });
  near(Math.hypot(...v.camera.dir), 1, 1e-12, 'unit dir'); near(dot(v.camera.dir, v.camera.up), 0, 1e-12, 'up square to dir');
  const A = { camera: { dir: [1, 0, 0], up: [0, 0, 1], zoom: 1 }, explode: 0, hidden: ['a', 'c'] };
  const B = { camera: { dir: [0, 1, 0], up: [0, 0, 1], zoom: 4 }, explode: 1, hidden: ['b', 'c'] };
  const s0 = interpolateViews(A, B, 0); const s1 = interpolateViews(A, B, 1); const h = interpolateViews(A, B, 0.5);
  near(dot(s0.camera.dir, [1, 0, 0]), 1, 1e-12, 'start = A'); near(dot(s1.camera.dir, [0, 1, 0]), 1, 1e-12, 'end = B');
  near(dot(h.camera.dir, [Math.SQRT1_2, Math.SQRT1_2, 0]), 1, 1e-9, 'half way on the great circle');
  near(h.camera.zoom, 2, 1e-9, 'zoom blended logarithmically (geometric mean)');
  near(h.explode, 0.5, 1e-12, 'explode blended');
  assert.deepEqual([s0.opacity.a, s1.opacity.a, s0.opacity.b, s1.opacity.b, h.opacity.c], [0, 1, 1, 0, 0], 'a fades in, b fades out, c stays hidden');
});

const project = buildSample('asmVice', 'en');
const asm = project.assemblies[0];
const bodies = new Map(project.parts.map((p) => [p.id, regenerate(p, { project }).body]));
const shapeOf = (c) => bodies.get(c.part);
const nameOf = (id) => project.parts.find((p) => p.id === id)?.name ?? id;
const boxes = new Map(asm.components.map((c) => { const [lo, hi] = shapeOf(c).boundingBox.bounds; return [c.id, [lo.map((v, k) => v + c.position[k]), hi.map((v, k) => v + c.position[k])]]; }));
autoExplode(asm, boxes, 15);

test('placements: exploded positions follow the explode steps; hidden components are left out', () => {
  const still = viewPlacements(asm, { explode: 0 });
  const full = viewPlacements(asm, { explode: 1, hidden: [asm.components[0].id] });
  assert.equal(still.size, asm.components.length);
  assert.equal(full.has(asm.components[0].id), false, 'hidden');
  const moved = asm.components.slice(1).filter((c) => Math.hypot(...full.get(c.id).position.map((v, k) => v - c.position[k])) > 1);
  assert.ok(moved.length >= 1, `${moved.length} components moved apart`);
});

test('parts list: one item per distinct part with its quantity, in first-use order', () => {
  const { rows } = itemNumbers(asm);
  assert.equal(rows.reduce((s, r) => s + r.qty, 0), asm.components.filter((c) => !c.suppressed).length);
  assert.deepEqual(rows.map((r) => r.item), rows.map((_, i) => i + 1));
});

test('line art: hidden-line paths, a balloon per callout on its point, a parts list; exploding moves the balloons', () => {
  const callouts = autoCallouts(asm, anchorPoints(asm, shapeOf));
  const view = { camera: { dir: [-1, 1, -1], up: [0, 0, 1] }, explode: 0, callouts };
  const a = illustrationSvg(asm, view, { shapeOf, nameOf, title: 'Machine vice' });
  assert.ok((a.svg.match(/class="visible"/g) ?? []).length > 10, 'visible edges drawn');
  assert.equal(a.balloons.length, callouts.length, 'a balloon per callout');
  assert.equal((a.svg.match(/class="balloon"/g) ?? []).length, callouts.length);
  assert.equal((a.svg.match(/class="bom"/g) ?? []).length, 1);
  for (const r of a.rows) assert.ok(a.svg.includes(`>${nameOf(r.part).replace(/&/g, '&amp;')}<`), `parts list names ${nameOf(r.part)}`);
  const b = illustrationSvg(asm, { ...view, explode: 1 }, { shapeOf, nameOf });
  const shifted = b.balloons.filter((x, i) => Math.hypot(x.at[0] - a.balloons[i].at[0], x.at[1] - a.balloons[i].at[1]) > 1);
  assert.ok(shifted.length >= 1, 'balloons follow their exploded parts');
  // The hidden style adds dashed hidden edges.
  assert.ok(illustrationSvg(asm, { ...view, style: 'hidden' }, { shapeOf, nameOf }).svg.includes('class="hidden"'));
});

test('line art is exact: a balloon on a box corner lands on the corner the projection draws', () => {
  const box = R.makeBox([0, 0, 0], [40, 30, 20]);
  const one = { components: [{ id: 'k', part: 'p', position: [5, 5, 0], rotation: [0, 0, 0, 1] }] };
  const v = { camera: { dir: [-1, 1, -1], up: [0, 0, 1] }, callouts: [{ comp: 'k', at: [45, 5, 20] }] };
  const out = illustrationSvg(one, v, { shapeOf: () => box, nameOf: () => 'Box', bom: false });
  const pts = [...out.svg.matchAll(/class="visible" d="([^"]+)"/g)].flatMap((m) => [...m[1].matchAll(/(-?\d+(?:\.\d+)?(?:e-?\d+)?)[ ,](-?\d+(?:\.\d+)?(?:e-?\d+)?)/g)].map((q) => [Number(q[1]), Number(q[2])]));
  const at = out.balloons[0].at;
  const best = Math.min(...pts.map((p) => Math.hypot(p[0] - at[0], p[1] - at[1])));
  near(best, 0, 1e-6, 'the corner (45, 5, 20) is an end point of a drawn edge');
});

test('HTML: one step per view with its line art, a step list and keyboard / button navigation', () => {
  const callouts = autoCallouts(asm, anchorPoints(asm, shapeOf));
  const steps = [0, 0.5, 1].map((e, i) => ({ name: `Step ${i + 1}`, svg: illustrationSvg(asm, { camera: { dir: [-1, 1, -1] }, explode: e, callouts }, { shapeOf, nameOf }).svg }));
  const html = illustrationHtml('Vice', steps);
  assert.match(html, /^<!doctype html>/);
  assert.equal((html.match(/class="step"/g) ?? []).length, 3);
  assert.equal((html.match(/data-go="/g) ?? []).length, 3);
  assert.match(html, /ArrowRight/); assert.doesNotMatch(html, /<script src=|<link /, 'no outside files');
});

test('balloon anchors lie on their parts as placed — rotated components included', () => {
  const anchors = anchorPoints(asm, shapeOf);
  const rotated = asm.components.filter((c) => Math.abs(c.rotation[3]) < 0.9999);
  assert.ok(rotated.length >= 1, 'the vice has rotated components');
  for (const c of asm.components) {
    const placed = placeShape(shapeOf(c), c);
    const q = new R.DistanceQuery(placed);
    try { near(q.distanceTo(R.makeVertex(anchors.get(c.id))), 0, 0.05, `${c.id} anchor on its part`); } finally { q.delete(); }
  }
});
