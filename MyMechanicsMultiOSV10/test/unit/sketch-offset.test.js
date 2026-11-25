// Offset Entities with its options (sketch-offset.js) and the sketch chamfer's options: chains of lines and arcs
// stay joined (trimmed, extended, or rounded where they open apart), closed chains grow outward, both sides with
// arc or line caps make a closed outline round an open chain, the whole chain from one curve, construction
// toggles; chamfer distance-distance and angle-distance.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSketchGeometry, byId, addLine, addArc, addRectangle, arcGeometry, profiles, polygonArea } from '../../src/cad/sketch.js';
import { offsetChain, chainOf, chainRuns } from '../../src/cad/sketch-offset.js';
import { sketchChamferBy } from '../../src/cad/sketchtools.js';

const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} ≉ ${b}`);
const xy = (s, id) => { const p = byId(s, id); return [p.x, p.y]; };
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
/** Every end point of the made curves is shared by exactly two of them (a closed outline). */
const closedOutline = (made) => {
  const count = new Map();
  for (const e of made) for (const p of [e.p1, e.p2]) count.set(p, (count.get(p) ?? 0) + 1);
  return [...count.values()].every((n) => n === 2);
};
/** An open L: (0,0)–(20,0), arc tangent to it turning left (centre (20,5), r 5), then up (25,5)–(25,25). */
function lChain() {
  const s = createSketchGeometry();
  const l1 = addLine(s, 0, 0, 20, 0);
  const arc = addArc(s, 20, 5, 5, -Math.PI / 2, 0, { from: l1.p2 });
  const l2 = addLine(s, 0, 0, 25, 25, { from: arc.p2 });
  byId(s, l2.p2).x = 25; byId(s, l2.p2).y = 25;
  return { s, l1, arc, l2 };
}

test('a closed rectangle offsets outward as a closed rectangle (corners extended to meet)', () => {
  const s = createSketchGeometry();
  const rect = addRectangle(s, 0, 0, 40, 20);
  const ids = (rect.lines ?? rect).map((l) => l.id ?? l);
  const { made } = offsetChain(s, [ids[0]], { distance: 3, chain: true });
  assert.equal(made.length, 4);
  assert.ok(closedOutline(made));
  const xs = made.flatMap((l) => [xy(s, l.p1)[0], xy(s, l.p2)[0]]); const ys = made.flatMap((l) => [xy(s, l.p1)[1], xy(s, l.p2)[1]]);
  near(Math.min(...xs), -3); near(Math.max(...xs), 43); near(Math.min(...ys), -3); near(Math.max(...ys), 23);
  // Reverse: inward.
  const inner = offsetChain(s, ids, { distance: 3, reverse: true }).made;
  const xi = inner.flatMap((l) => [xy(s, l.p1)[0], xy(s, l.p2)[0]]);
  near(Math.min(...xi), 3); near(Math.max(...xi), 37);
});

test('a line–arc–line chain stays joined; the arc radius changes by the distance on the right side', () => {
  const { s, l1, arc } = lChain();
  assert.deepEqual(chainOf(s, [l1.id]).length, 3);
  const runs = chainRuns(s, [l1, arc, byId(s, chainOf(s, [l1.id])[2])]);
  assert.equal(runs.length, 1); assert.equal(runs[0].items.length, 3); assert.equal(runs[0].closed, false);
  // Left of the way it runs (it turns left): towards the arc's centre — the arc gets smaller.
  const { made } = offsetChain(s, [l1.id], { distance: 2, chain: true });
  assert.equal(made.length, 3);
  const a = made.find((e) => e.type === 'arc');
  near(arcGeometry(s, a).r, 3);
  // Consecutive pieces share their points.
  const [m1, , m3] = made;
  assert.ok([a.p1, a.p2].includes(m1.p2) && [a.p1, a.p2].includes(m3.p1));
  near(xy(s, m1.p1)[1], 2); near(xy(s, m3.p2)[0], 23);
});

test('both sides with arc caps close round an open chain (a slot-like outline of the right area)', () => {
  const s = createSketchGeometry();
  const l = addLine(s, 0, 0, 30, 0);
  const { made } = offsetChain(s, [l.id], { distance: 4, both: true, cap: 'arcs' });
  assert.equal(made.filter((e) => e.type === 'line').length, 2);
  assert.equal(made.filter((e) => e.type === 'arc').length, 2);
  assert.ok(closedOutline(made));
  // Area of the slot: 30 × 8 + π·4².
  // Walk the outline (lines and the caps' arcs sampled) for its area.
  const pts = [];
  let cur = made[0]; let at = cur.p1; const seen = new Set();
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    const fwd = cur.p1 === at;
    if (cur.type === 'line') pts.push(xy(s, at));
    else { const g = arcGeometry(s, cur); for (let i = 0; i < 32; i++) { const k = fwd ? i : 32 - i; const a = g.a0 + ((g.a1 - g.a0) * k) / 32; pts.push([g.cx + g.r * Math.cos(a), g.cy + g.r * Math.sin(a)]); } }
    at = fwd ? cur.p2 : cur.p1;
    cur = made.find((e) => !seen.has(e.id) && (e.p1 === at || e.p2 === at));
  }
  near(Math.abs(polygonArea(pts)), 30 * 8 + Math.PI * 16, 0.3);
  // The caps bulge outward (past the ends).
  const xs = made.filter((e) => e.type === 'arc').map((a) => { const g = arcGeometry(s, a); const m = (g.a0 + g.a1) / 2; return g.cx + g.r * Math.cos(m); });
  near(Math.min(...xs), -4); near(Math.max(...xs), 34);
  // Line caps instead.
  const s2 = createSketchGeometry(); const l2 = addLine(s2, 0, 0, 30, 0);
  const r2 = offsetChain(s2, [l2.id], { distance: 4, both: true, cap: 'lines' });
  assert.equal(r2.made.filter((e) => e.type === 'line').length, 4);
  assert.ok(closedOutline(r2.made));
});

test('pieces that open apart are joined by a round about the corner', () => {
  // A right-angle corner offset outward: the two offset lines do not reach each other forward — an arc joins them
  // only when the pieces are arcs; for two lines they meet by extension. Use an arc then a line leaving it at a corner.
  const s = createSketchGeometry();
  const l1 = addLine(s, 0, 0, 20, 0);
  const l2 = addLine(s, 0, 0, 20, 20, { from: l1.p2 });
  const { made } = offsetChain(s, [l1.id, l2.id], { distance: 2, reverse: true });
  // Right turn offset on the outside of a left turn: lines meet when extended (a sharp corner).
  assert.equal(made.length, 2);
  assert.equal(made[0].p2, made[1].p1);
  const corner = xy(s, made[0].p2);
  // The offset lines are 2 away from both originals at the shared corner.
  near(Math.abs(corner[1]), 2);
  // Arc then line at a sharp angle, offset to the outside: they open apart → a round.
  const t = createSketchGeometry();
  const arc = addArc(t, 0, 0, 10, 0, Math.PI / 2);
  const out = addLine(t, 0, 0, 10, 10, { from: arc.p2 });
  byId(t, out.p2).x = 10; byId(t, out.p2).y = 10;
  const r = offsetChain(t, [arc.id, out.id], { distance: 2, reverse: true });
  const rounds = r.made.filter((e) => e.type === 'arc' && !t.constraints.some((c) => c.type === 'concentric' && c.b === e.id));
  assert.equal(rounds.length, 1);
  near(arcGeometry(t, rounds[0]).r, 2);
  near(arcGeometry(t, rounds[0]).cx, 0); near(arcGeometry(t, rounds[0]).cy, 10);
});

test('construction options: the base becomes construction, or the offset is construction', () => {
  const s = createSketchGeometry();
  const l = addLine(s, 0, 0, 10, 0);
  const { made } = offsetChain(s, [l.id], { distance: 1, baseConstruction: true });
  assert.equal(byId(s, l.id).construction, true);
  assert.ok(!made[0].construction);
  const s2 = createSketchGeometry(); const l2 = addLine(s2, 0, 0, 10, 0);
  const r2 = offsetChain(s2, [l2.id], { distance: 1, construction: true });
  assert.equal(r2.made[0].construction, true);
  assert.ok(!byId(s2, l2.id).construction);
});

test('an arc offset past its centre vanishes and is counted', () => {
  const s = createSketchGeometry();
  const a = addArc(s, 0, 0, 3, 0, Math.PI);
  const r = offsetChain(s, [a.id], { distance: 5 });
  assert.equal(r.made.length, 0); assert.equal(r.failed, 1);
});

test('sketch chamfer: distance-distance and angle-distance', () => {
  const corner = () => { const s = createSketchGeometry(); const h = addLine(s, 0, 0, 20, 0); const v = addLine(s, 0, 0, 0, 20, { from: h.p1 }); return { s, h, v, id: h.p1 }; };
  const len = (s, l) => dist(xy(s, l.p1), xy(s, l.p2));
  let c = corner();
  sketchChamferBy(c.s, c.id, { mode: 'distDist', d: 3, d2: 5 });
  const got = [len(c.s, c.h), len(c.s, c.v)].sort((a, b) => a - b);
  near(got[0], 15); near(got[1], 17);
  // Flip swaps which line takes which distance.
  c = corner(); sketchChamferBy(c.s, c.id, { mode: 'distDist', d: 3, d2: 5 }); const h1 = len(c.s, c.h);
  c = corner(); sketchChamferBy(c.s, c.id, { mode: 'distDist', d: 3, d2: 5, flip: true }); near(len(c.s, c.h), h1 === 17 ? 15 : 17);
  // Angle-distance at a right angle: 4 along the first line, 30° → 4·tan 30° along the other.
  c = corner();
  const line = sketchChamferBy(c.s, c.id, { mode: 'angleDist', d: 4, angle: 30 });
  const cut = [20 - len(c.s, c.h), 20 - len(c.s, c.v)];
  const expectOther = 4 * Math.tan(Math.PI / 6);
  assert.ok(Math.abs(cut[0] - 4) < 1e-6 ? Math.abs(cut[1] - expectOther) < 1e-6 : Math.abs(cut[0] - expectOther) < 1e-6 && Math.abs(cut[1] - 4) < 1e-6, String(cut));
  near(len(c.s, line), Math.hypot(4, expectOther));
  // An angle that cannot close the triangle fails.
  c = corner(); assert.equal(sketchChamferBy(c.s, c.id, { mode: 'angleDist', d: 4, angle: 95 }), null);
});
