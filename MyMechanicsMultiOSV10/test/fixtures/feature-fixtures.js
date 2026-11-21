// Feature fixtures: for every feature type a small base part and the feature on it, plus what each of its
// settings is expected to do to the model. Shared by the kernel test (test/unit/feature-params.test.js) and
// the PropertyManager test in the browser (test/e2e/controls.steps.json, imported through Vite) — the kernel
// must be loaded before make() is called.
import { rep } from '../../src/cad/kernel.js';
import { createFeature, regenerate, faceRef, FEATURE_DEFAULTS, STD_PLANES, frame } from '../../src/cad/features.js';
import { addCircle, addLine, addRectangle, createSketchGeometry } from '../../src/cad/sketch.js';
import { edgeSignature, faceSignature } from '../../src/cad/refs.js';


export const front = { kind: 'std', name: 'front' }; export const top = { kind: 'std', name: 'top' }; export const right = { kind: 'std', name: 'right' };
export const newPart = (id = 'p') => ({ id, name: 'Part', features: [] });

// ── plane-local coordinates: (u, v, n) = along the plane's x, its y and its normal. The fixtures never
// assume which world axis is up; they place and find things in the frame of the plane they sketched on.
const frameOf = (name) => frame(STD_PLANES[name]);
const P3 = (q) => (Array.isArray(q) ? q : [q.x, q.y, q.z]);
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
/** A world point in the local coordinates of a standard plane. */
export function loc(name, q) { const fr = frameOf(name); const p = P3(q); const d = [p[0] - fr.origin[0], p[1] - fr.origin[1], p[2] - fr.origin[2]]; return [dot3(d, fr.xDir), dot3(d, fr.yDir), dot3(d, fr.normal)]; }
/** Local (u, v, n) of a standard plane → a world point. */
export function W(name, u, v, n = 0) { const fr = frameOf(name); return [0, 1, 2].map((i) => fr.origin[i] + u * fr.xDir[i] + v * fr.yDir[i] + n * fr.normal[i]); }
/** The world axis ('x' | 'y' | 'z') a direction runs along, and its sign. */
export function axisOf(vec) { const i = [0, 1, 2].reduce((a, b) => (Math.abs(vec[b]) > Math.abs(vec[a]) ? b : a), 0); return { name: 'xyz'[i], index: i, sign: Math.sign(vec[i]) }; }
const UP = axisOf(frameOf('top').normal);
const FRONT_V = axisOf(frameOf('front').yDir);
const FRONT_N = axisOf(frameOf('front').normal);
const near = (a, b, tol = 1e-6) => Math.abs(a - b) < tol;
export function sketchOn(part, plane, draw) {
  const s = createFeature(part, 'sketch', { plane, ...createSketchGeometry() });
  draw(s);
  part.features.push(s);
  return s;
}
function extrudeRect(part, plane, x0, y0, x1, y1, depth, extra = {}) {
  const s = sketchOn(part, plane, (k) => addRectangle(k, x0, y0, x1, y1));
  const e = createFeature(part, 'extrude', { sketch: s.id, depth, ...extra });
  part.features.push(e);
  return e;
}
function extrudeCircle(part, plane, cx, cy, r, depth, extra = {}) {
  const s = sketchOn(part, plane, (k) => addCircle(k, cx, cy, r));
  const e = createFeature(part, 'extrude', { sketch: s.id, depth, ...extra });
  part.features.push(e);
  return e;
}
const built = (part) => regenerate(part).body;
/** A sheet-metal plate 100 × 50 × 2 on the top plane, and its top edge at u = 100. */
export function sheet(part) {
  const s = sketchOn(part, top, (k) => addRectangle(k, 0, 0, 100, 50));
  part.features.push(createFeature(part, 'baseFlange', { sketch: s.id, thickness: 2, radius: 2, kFactor: 0.4 }));
  const body = built(part);
  return body.edges.find((e) => e.geomType === 'LINE' && [e.startPoint, e.endPoint].every((q) => { const l = loc('top', q); return l[0] > 99.9 && l[2] > 1.9; }));
}

// ───────────────────────── the fixtures: a base part per type and what each setting is expected to do
//
// make(part, over): builds the base into `part` and returns the new feature (not pushed) with `over` on top.
// num / bool: per setting { m: metric, dir: '+' | '-' | '~', to: the changed value, with: other settings for
// both builds } or 'dirMetric' shorthand ('+V', '-V', '~'), or { skip: reason }. Settings not listed are
// changed generically (numbers ×1.3 or +5, booleans flipped) and only "something changed" is required.
// opt: string settings → values to try, each must change the model.

export const FIXTURES = {
  import: { make: (p, o) => createFeature(p, 'import', { brep: rep().makeBox([0, 0, 0], [10, 20, 30]).serialize(), source: 'box.step', ...o }) },
  sketch: {
    make: (p, o) => { const s = createFeature(p, 'sketch', { plane: top, ...createSketchGeometry(), ...o }); addRectangle(s, 0, 0, 10, 10); return s; },
  },
  plane: { make: (p, o) => createFeature(p, 'plane', { base: top, ...o }), num: { offset: '+PN' } },
  extrude: {
    make: (p, o) => { const s = sketchOn(p, front, (k) => addRectangle(k, 0, 0, 20, 10)); return createFeature(p, 'extrude', { sketch: s.id, ...o }); },
    num: {
      depth: '+V',
      depth2: { with: { end2: 'blind' }, m: 'V', dir: '+' },
      draftAngle: { with: { draft: true, draftAngle: 3 }, to: 6, m: 'V', dir: '-' },
    },
    bool: { reverse: { m: 'C:front.n', dir: '-' } },
    opt: { end: ['midplane'], end2: ['blind'] },
  },
  revolve: {
    make: (p, o) => {
      const s = sketchOn(p, front, (k) => { addRectangle(k, 10, 0, 20, 30); addLine(k, 0, 0, 0, 50, { construction: true }); });
      return createFeature(p, 'revolve', { sketch: s.id, ...o });
    },
    num: { angle: { to: 180, m: 'V', dir: '-' } },
    bool: { reverse: { with: { angle: 90 } } },
  },
  fillet: {
    make: (p, o) => {
      extrudeRect(p, front, 0, 0, 40, 30, 10);
      const edges = built(p).edges.filter((e) => near(Math.abs(dot3(edgeSignature(e).dir, frameOf('front').normal)), 1)).map(edgeSignature);
      return createFeature(p, 'fillet', { edges, ...o });
    },
    num: { radius: { to: 4, m: 'V', dir: '-' } },
  },
  chamfer: {
    make: (p, o) => {
      extrudeRect(p, front, 0, 0, 40, 30, 10);
      const edges = built(p).edges.filter((e) => near(Math.abs(dot3(edgeSignature(e).dir, frameOf('front').normal)), 1)).map(edgeSignature);
      return createFeature(p, 'chamfer', { edges, ...o });
    },
    num: { distance: { to: 3, m: 'V', dir: '-' } },
  },
  shell: {
    make: (p, o) => {
      extrudeRect(p, front, 0, 0, 50, 40, 30);
      const face = built(p).faces.find((f) => near(loc('front', faceSignature(f).center)[2], 30));
      return createFeature(p, 'shell', { faces: [faceSignature(face)], ...o });
    },
    num: { thickness: { to: 3, m: 'V', dir: '+' } },
  },
  hole: {
    make: (p, o) => {
      extrudeRect(p, front, 0, 0, 60, 40, 20);
      const face = built(p).faces.find((f) => near(loc('front', faceSignature(f).center)[2], 20));
      const hs = createFeature(p, 'sketch', { plane: faceRef(face), ...createSketchGeometry() });
      hs.entities.push({ id: 'h1', type: 'point', x: 0, y: 0 });
      p.features.push(hs);
      return createFeature(p, 'hole', { sketch: hs.id, ...o });
    },
    num: {
      diameter: { to: 8, m: 'V', dir: '-' },
      depth: { with: { through: false, depth: 8 }, to: 12, m: 'V', dir: '-' },
      cbDiameter: { with: { kind: 'counterbore' }, to: 14, m: 'V', dir: '-' },
      cbDepth: { with: { kind: 'counterbore' }, to: 9, m: 'V', dir: '-' },
      csDiameter: { with: { kind: 'countersink' }, to: 15, m: 'V', dir: '-' },
      csAngle: { with: { kind: 'countersink' }, to: 60, m: 'V', dir: '-' },
    },
    bool: { through: { with: { depth: 8 }, m: 'V', dir: '+' } },
    opt: { kind: ['counterbore', 'countersink'] },
  },
  linearPattern: {
    make: (p, o) => {
      extrudeRect(p, front, 0, 0, 100, 60, 10);
      const seed = extrudeCircle(p, front, 10, 10, 3, 15);
      // Direction 1 along the plate's u (world x), direction 2 along its v — reversed when v runs against that world axis.
      return createFeature(p, 'linearPattern', { seeds: [seed.id], direction: { kind: 'axis', axis: 'x' }, direction2: { kind: 'axis', axis: FRONT_V.name }, reverse2: FRONT_V.sign < 0, ...o });
    },
    num: {
      count: { to: 4, m: 'V', dir: '+' },
      spacing: { to: 25, m: 'C:front.u', dir: '+' },
      count2: { to: 3, m: 'V', dir: '+' },
      spacing2: { to: 25, m: 'C:front.v', dir: '+' },
    },
    bool: { reverse: { m: 'C:front.u', dir: '-' }, reverse2: { m: 'C:front.v', dir: '-' } },
  },
  circularPattern: {
    make: (p, o) => {
      extrudeCircle(p, front, 0, 0, 50, 8);
      const seed = extrudeCircle(p, front, 35, 0, 4, 12);
      return createFeature(p, 'circularPattern', { seeds: [seed.id], axis: { kind: 'axis', axis: FRONT_N.name }, ...o });
    },
    num: {
      count: { to: 8, m: 'V', dir: '+' },
      angle: { with: { equal: false, count: 3, angle: 30 }, to: 60 },
    },
    bool: { equal: { with: { angle: 90 } }, reverse: { with: { equal: false, count: 3, angle: 30 } } },
  },
  mirror: {
    make: (p, o) => {
      extrudeRect(p, front, -20, -20, 50, 20, 10);
      const seed = extrudeCircle(p, front, 30, 0, 4, 15);
      return createFeature(p, 'mirror', { seeds: [seed.id], plane: right, ...o });
    },
    bool: { body: { m: 'V', dir: '+' } },
  },

  sweep: {
    make: (p, o) => {
      const prof = sketchOn(p, top, (k) => addCircle(k, 0, 0, 2));
      const path = sketchOn(p, front, (k) => { const l = addLine(k, 0, 0, 0, 30); addLine(k, 0, 0, 20, 30, { from: l.p2 }); });
      return createFeature(p, 'sweep', { sketch: prof.id, path: path.id, ...o });
    },
    bool: { frenet: { skip: 'Frenet framing only matters on a curved (3D) path; this L path twists nothing — checked on the helix spring in advanced.test.js' } },
    opt: { transition: ['round'] },
  },
  loft: {
    make: (p, o) => {
      const a = sketchOn(p, top, (k) => addRectangle(k, -10, -10, 10, 10));
      p.features.push(createFeature(p, 'plane', { base: top, offset: 30 }));
      const b = sketchOn(p, { kind: 'ref', id: p.features.at(-1).id }, (k) => addCircle(k, 0, 0, 5));
      p.features.push(createFeature(p, 'plane', { base: top, offset: 60 }));
      const c = sketchOn(p, { kind: 'ref', id: p.features.at(-1).id }, (k) => addRectangle(k, -15, -15, 15, 15));
      // Three sections: a ruled loft runs straight between them, a smooth one curves through the middle one.
      return createFeature(p, 'loft', { sketches: [a.id, b.id, c.id], ...o });
    },
  },
  draft: {
    make: (p, o) => {
      extrudeRect(p, top, -10, -10, 10, 10, 10);
      const sides = built(p).faces.filter((f) => f.geomType === 'PLANE' && Math.abs(dot3(faceSignature(f).normal, frameOf('top').normal)) < 0.5).map(faceSignature);
      return createFeature(p, 'draft', { faces: sides, neutral: top, ...o });
    },
    num: { angle: { to: 6, m: 'V', dir: '-' } },
    bool: { reverse: { m: 'V', dir: '+' } },
  },
  rib: {
    make: (p, o) => {
      const s = sketchOn(p, front, (k) => { const pts = [[0, 0], [50, 0], [50, 5], [5, 5], [5, 50], [0, 50]]; pts.forEach((q, i) => addLine(k, ...q, ...pts[(i + 1) % pts.length])); });
      p.features.push(createFeature(p, 'extrude', { sketch: s.id, end: 'midplane', depth: 40 }));
      const rib = sketchOn(p, front, (k) => addLine(k, 5, 40, 40, 5));
      return createFeature(p, 'rib', { sketch: rib.id, ...o });
    },
    num: { thickness: { to: 5, m: 'V', dir: '+' } },
  },
  dome: {
    make: (p, o) => {
      extrudeCircle(p, top, 0, 0, 10, 10);
      const face = built(p).faces.find((f) => f.geomType === 'PLANE' && loc('top', faceSignature(f).center)[2] > 9);
      return createFeature(p, 'dome', { faces: [faceSignature(face)], ...o });
    },
    num: { height: { to: 7, m: 'V', dir: '+' } },
    bool: { reverse: { m: 'V', dir: '-' } },
  },
  helix: {
    make: (p, o) => createFeature(p, 'helix', { plane: top, ...o }),
    num: { radius: { to: 15, m: 'L', dir: '+' }, pitch: { to: 8, m: 'L', dir: '+' }, turns: { to: 6, m: 'L', dir: '+' } },
  },
  thread: {
    make: (p, o) => {
      extrudeCircle(p, top, 0, 0, 4, 12);
      const edge = built(p).edges.find((e) => e.geomType === 'CIRCLE' && loc('top', e.pointAt(0))[2] > 11);
      // A short thread (the faceted groove is the slowest build here).
      return createFeature(p, 'thread', { edge: edgeSignature(edge), length: 4, ...o });
    },
    num: { length: { to: 7, m: 'V', dir: '-' }, pitch: { to: 2 } },
    bool: { cosmetic: { m: 'V', dir: '+' } },
    opt: { internal: { skip: 'only overrides the automatic side detection: on a shaft "auto" already is external, and forcing "internal" cuts nothing (thread-failed, by design)' } },
  },
  wrap: {
    make: (p, o) => {
      extrudeCircle(p, top, 0, 0, 20, 40);
      const cyl = built(p).faces.find((f) => f.geomType !== 'PLANE');
      p.features.push(createFeature(p, 'plane', { base: front, offset: 25 }));
      const s = sketchOn(p, { kind: 'ref', id: p.features.at(-1).id }, (k) => addRectangle(k, -15, 15, 15, 25));
      return createFeature(p, 'wrap', { sketch: s.id, face: faceSignature(cyl), ...o });
    },
    num: { depth: { to: 2, m: 'V', dir: '+' } },
    opt: { op: ['deboss'] },
  },
  thicken: {
    make: (p, o) => {
      const s = sketchOn(p, top, (k) => addRectangle(k, 0, 0, 20, 10));
      const pl = createFeature(p, 'surfacePlanar', { sketch: s.id });
      p.features.push(pl);
      return createFeature(p, 'thicken', { surface: pl.id, ...o });
    },
    num: { thickness: { to: 4, m: 'V', dir: '+' } },
    opt: { side: ['in', 'both'] },
  },
  surfaceExtrude: {
    make: (p, o) => { const s = sketchOn(p, front, (k) => addLine(k, 0, 0, 30, 0)); return createFeature(p, 'surfaceExtrude', { sketch: s.id, ...o }); },
    num: { depth: { to: 30, m: 'SA', dir: '+' } },
  },
  surfaceRevolve: {
    make: (p, o) => {
      const s = sketchOn(p, front, (k) => { addLine(k, 10, 0, 10, 30); addLine(k, 0, 0, 0, 50, { construction: true }); });
      return createFeature(p, 'surfaceRevolve', { sketch: s.id, ...o });
    },
    num: { angle: { to: 180, m: 'SA', dir: '-' } },
  },
  surfacePlanar: { make: (p, o) => { const s = sketchOn(p, top, (k) => addRectangle(k, 0, 0, 20, 10)); return createFeature(p, 'surfacePlanar', { sketch: s.id, ...o }); } },
  surfaceLoft: {
    make: (p, o) => {
      const a = sketchOn(p, top, (k) => addRectangle(k, -10, -10, 10, 10));
      p.features.push(createFeature(p, 'plane', { base: top, offset: 30 }));
      const b = sketchOn(p, { kind: 'ref', id: p.features.at(-1).id }, (k) => addCircle(k, 0, 0, 5));
      p.features.push(createFeature(p, 'plane', { base: top, offset: 60 }));
      const c = sketchOn(p, { kind: 'ref', id: p.features.at(-1).id }, (k) => addRectangle(k, -15, -15, 15, 15));
      // Three sections: a ruled loft runs straight between them, a smooth one curves through the middle one.
      return createFeature(p, 'surfaceLoft', { sketches: [a.id, b.id, c.id], ...o });
    },
  },
  surfaceOffset: {
    make: (p, o) => {
      extrudeRect(p, front, 0, 0, 20, 10, 10);
      const face = built(p).faces.find((f) => near(loc('front', faceSignature(f).center)[2], 10));
      return createFeature(p, 'surfaceOffset', { faces: [faceSignature(face)], ...o });
    },
    num: { distance: { to: 5 } },
  },
  knit: {
    make: (p, o) => {
      // A closed box from a 4-sided surface extrude and two planar caps.
      const s = sketchOn(p, top, (k) => addRectangle(k, 0, 0, 20, 10));
      const tube = createFeature(p, 'surfaceExtrude', { sketch: s.id, depth: 20 });
      const capA = createFeature(p, 'surfacePlanar', { sketch: s.id });
      p.features.push(tube, capA, createFeature(p, 'plane', { base: top, offset: 20 }));
      const s2 = sketchOn(p, { kind: 'ref', id: p.features.at(-1).id }, (k) => addRectangle(k, 0, 0, 20, 10));
      const capB = createFeature(p, 'surfacePlanar', { sketch: s2.id });
      p.features.push(capB);
      return createFeature(p, 'knit', { surfaces: [tube.id, capA.id, capB.id], ...o });
    },
  },
  moveBody: {
    make: (p, o) => { extrudeRect(p, front, 0, 0, 10, 10, 10); return createFeature(p, 'moveBody', o); },
    num: { dx: { to: 20, m: 'CX', dir: '+' }, dy: { to: 20, m: 'CY', dir: '+' }, dz: { to: 20, m: 'CZ', dir: '+' }, angle: { to: 45 } },
    bool: { copy: { with: { dx: 20 }, m: 'V', dir: '+' } },
    opt: { axis: { with: { angle: 45 }, values: ['x', 'y', 'z'] } },
  },
  scaleBody: {
    make: (p, o) => { extrudeRect(p, front, 10, 10, 20, 20, 10); return createFeature(p, 'scaleBody', o); },
    num: { factor: { to: 2, m: 'V', dir: '+' } },
    opt: { about: ['centroid'] },
  },
  split: {
    make: (p, o) => { extrudeRect(p, front, -10, -10, 10, 20, 10); return createFeature(p, 'split', { plane: top, ...o }); },
    opt: { keep: ['below'] },
  },
  insertPart: {
    project: () => {
      const pin = newPart('pin');
      extrudeCircle(pin, front, 0, 0, 3, 30);
      return { parts: [pin] };
    },
    make: (p, o) => { extrudeRect(p, front, -10, -10, 10, 10, 20); return createFeature(p, 'insertPart', { part: 'pin', ...o }); },
    num: { dx: { to: 20, m: 'CX', dir: '+' }, dy: { to: 20, m: 'CY', dir: '+' }, dz: { to: 20, m: 'CZ', dir: '+' }, angle: { with: { axis: 'x' }, to: 90 }, scale: { to: 2, m: 'V', dir: '+' } },
    opt: { op: ['cut'], axis: { with: { angle: 90 }, values: ['x'] } },
  },
  baseFlange: {
    make: (p, o) => { const s = sketchOn(p, top, (k) => addRectangle(k, 0, 0, 100, 50)); return createFeature(p, 'baseFlange', { sketch: s.id, ...o }); },
    num: {
      thickness: { to: 3, m: 'V', dir: '+' },
      radius: { skip: 'the sheet\'s default bend radius: a flat base flange has no bend — checked by "sheet defaults reach the bends" below' },
      kFactor: { skip: 'used only in the flat pattern of bends — checked by "sheet defaults reach the bends" below' },
    },
    bool: { reverse: { m: 'C:top.n', dir: '-' } },
  },
  edgeFlange: {
    make: (p, o) => { const edge = sheet(p); return createFeature(p, 'edgeFlange', { edge: edgeSignature(edge), ...o }); },
    num: { length: { to: 30, m: 'V', dir: '+' }, angle: { to: 45, m: 'B:top.n', dir: '-' }, radius: { from: 2, to: 6, m: 'B:top.u', dir: '+' } },
  },
  structural: {
    make: (p, o) => {
      const s = sketchOn(p, front, (k) => { const l = addLine(k, 0, 0, 500, 0); addLine(k, 0, 0, 0, 300, { from: l.p1 }); });
      return createFeature(p, 'structural', { sketch: s.id, profile: 'rectTube', w: 60, h: 40, ...o });
    },
    num: { w: { to: 80, m: 'V', dir: '+' }, h: { to: 50, m: 'V', dir: '+' }, t: { to: 4, m: 'V', dir: '+' }, rotate: { to: 90 } },
    opt: { profile: ['pipe', 'ibeam', 'angle'] },
  },
  fillSurface: {
    make: (p, o) => {
      const s3 = createFeature(p, 'sketch3d', { points: [[0, 0, 0], [20, 0, 4], [20, 20, 0], [0, 20, 4]], closed: true });
      p.features.push(s3);
      return createFeature(p, 'fillSurface', { curve: s3.id, ...o });
    },
  },
  boundary: {
    make: (p, o) => {
      const a = sketchOn(p, top, (k) => addCircle(k, 0, 0, 10));
      p.features.push(createFeature(p, 'plane', { base: top, offset: 30 }));
      const b = sketchOn(p, { kind: 'ref', id: p.features.at(-1).id }, (k) => addRectangle(k, -8, -8, 8, 8));
      return createFeature(p, 'boundary', { curves: [a.id, b.id], ...o });
    },
  },
  trimSurface: {
    make: (p, o) => {
      const s = sketchOn(p, top, (k) => addRectangle(k, -10, -10, 30, 10));
      const pl = createFeature(p, 'surfacePlanar', { sketch: s.id });
      p.features.push(pl);
      return createFeature(p, 'trimSurface', { surface: pl.id, plane: right, ...o });
    },
    opt: { keep: ['below'] },
  },
  hem: {
    make: (p, o) => { const edge = sheet(p); return createFeature(p, 'hem', { edge: edgeSignature(edge), ...o }); },
    num: { length: { to: 15, m: 'V', dir: '+' }, gap: { with: { kind: 'open' }, to: 3, m: 'B:top.n', dir: '+' } },
    opt: { kind: ['open'] },
  },
  sketchedBend: {
    make: (p, o) => { sheet(p); const line = sketchOn(p, top, (k) => addLine(k, 60, -10, 60, 60)); return createFeature(p, 'sketchedBend', { sketch: line.id, ...o }); },
    num: { angle: { to: 45, m: 'B:top.n', dir: '-' }, radius: { from: 2, to: 6, m: 'V', dir: '+' } },
  },
  jog: {
    make: (p, o) => { sheet(p); const line = sketchOn(p, top, (k) => addLine(k, 50, -10, 50, 60)); return createFeature(p, 'jog', { sketch: line.id, ...o }); },
    num: { height: { to: 15, m: 'B:top.n', dir: '+' } },
  },
  partingLine: {
    make: (p, o) => { extrudeRect(p, top, 0, 0, 20, 10, 20); return createFeature(p, 'partingLine', o); },
    opt: { dir: ['x'] },
  },
  toolingSplit: {
    make: (p, o) => { extrudeCircle(p, top, 0, 0, 20, 20); return createFeature(p, 'toolingSplit', { dir: UP.name, ...o }); },
    num: { margin: { to: 15, m: 'V', dir: '+' }, gap: { to: 40, m: 'B:top.n', dir: '+' }, height: { with: { auto: false, height: 5 }, to: 12 } },
    bool: { keepPart: { m: 'V', dir: '+' }, auto: { with: { height: 5 } } },
    opt: { show: ['core', 'cavity'] },
  },
  sketch3d: { make: (p, o) => createFeature(p, 'sketch3d', o) },

  // ── bodies, reference geometry, more fillets and patterns, curves
  combine: {
    make: (p, o) => { twoBodies(p, rep().makeBox([0, 0, 0], [20, 10, 20]), rep().makeBox([10, 0, 10], [30, 20, 30])); return createFeature(p, 'combine', { op: 'add', ...o }); },
    num: { main: { with: { op: 'subtract' }, to: 1 } },
    opt: { op: ['subtract', 'common'] },
  },
  deleteBody: {
    make: (p, o) => {
      block(p, 0, 0, 40, 20, 10);
      p.features.push({ id: `pl${p.features.length}`, type: 'plane', name: 'PlaneX', base: { kind: 'std', name: 'right' }, offset: 10, flip: false });
      p.features.push(createFeature(p, 'split', { plane: { kind: 'ref', id: p.features.at(-1).id }, keep: 'both' }));
      return createFeature(p, 'deleteBody', { mode: 'delete', bodies: [0], ...o });
    },
    opt: { mode: ['keep'] },
  },
  indent: {
    make: (p, o) => { twoBodies(p, rep().makeBox([-50, 0, -50], [50, 2, 50]), rep().makeBox([-10, -5, -10], [10, 15, 10])); return createFeature(p, 'indent', { target: 0, toolBody: 1, ...o }); },
    num: {
      target: { skip: 'a body index (which of the two bodies is pressed into): any other value names no body' },
      toolBody: { skip: 'a body index (which body presses): any other value names no body' },
      thickness: { to: 2, m: 'BY', dir: '+' },
      clearance: { to: 1 },
    },
  },
  flex: {
    make: (p, o) => { block(p, 0, 0, 40, 4, 4); return createFeature(p, 'flex', { mode: 'bend', axis: 'x', toward: 'y', ...o }); },
    num: { angle: { to: 45, m: 'BY', dir: '-' }, factor: { with: { mode: 'taper' }, to: 0.7, m: 'V', dir: '+' }, stretch: { with: { mode: 'stretch' }, to: 40, m: 'BX', dir: '+' } },
    opt: { mode: ['twist', 'taper', 'stretch'], toward: ['z'] },
  },
  deform: {
    make: (p, o) => { block(p, -50, -50, 100, 100, 10); const [x, y, z] = W('top', 0, 0, 10); return createFeature(p, 'deform', { x, y, z, dir: UP.sign < 0 ? `-${UP.name}` : UP.name, ...o }); },
    num: { amount: { to: 8, m: 'B:top.n', dir: '+' }, radius: { to: 40, m: 'V', dir: '+' }, x: { to: 10 }, y: { to: 10 }, z: { to: 10 }, [UP.name]: { skip: 'the point is on the top face: moving it along the push direction (the plane normal) moves nothing' } },
    opt: { dir: [UP.name === 'x' ? 'y' : 'x'] },
  },
  refAxis: {
    make: (p, o) => createFeature(p, 'refAxis', { kind: 'twoPoints', x1: 20, y1: 0, z1: 0, x2: 20, y2: 10, z2: 0, ...o }),
    num: { y2: { skip: 'slides the second point along the axis itself (x = 20, z = 0): the axis line stays the same' } },
    opt: { kind: ['twoPlanes'] },
  },
  refPoint: {
    make: (p, o) => createFeature(p, 'refPoint', { kind: 'coords', x: 5, y: 5, z: 5, ...o }),
    num: { at: { skip: 'the position along an edge: only used by the "on edge" kind, which needs an edge pick (covered in part-more.test.js)' } },
  },
  coordSys: { make: (p, o) => createFeature(p, 'coordSys', o) },
  variableFillet: {
    make: (p, o) => {
      block(p, 0, 0, 40, 20, 20);
      const edge = built(p).edges.find((e) => e.geomType === 'LINE' && [e.startPoint, e.endPoint].every((q) => { const l = loc('top', q); return near(l[2], 20) && near(l[1], 0); }));
      return createFeature(p, 'variableFillet', { edges: [edgeSignature(edge)], ...o });
    },
    num: { r1: { to: 3, m: 'V', dir: '-' }, r2: { to: 7, m: 'V', dir: '-' } },
  },
  faceFillet: {
    make: (p, o) => {
      block(p, 0, 0, 40, 10, 20);
      const b = built(p);
      return createFeature(p, 'faceFillet', { faces: [faceWhere(b, (c) => near(c[2], 20)), faceWhere(b, (c) => near(c[1], 0))], ...o });
    },
    num: { radius: { to: 4, m: 'V', dir: '-' } },
  },
  fullRoundFillet: {
    make: (p, o) => {
      block(p, 0, 0, 40, 10, 20);
      const b = built(p);
      return createFeature(p, 'fullRoundFillet', { faces: [faceWhere(b, (c) => near(c[1], 0)), faceWhere(b, (c) => near(c[2], 20)), faceWhere(b, (c) => near(c[1], 10))], ...o });
    },
  },
  curvePattern: {
    make: (p, o) => {
      block(p, -10, -10, 100, 20, 5);
      const cut = holeCut(p, 0, 0, 2);
      const path = createFeature(p, 'sketch3d', { points: [W('top', 0, 0, 5), W('top', 60, 0, 5)] });
      p.features.push(path);
      return createFeature(p, 'curvePattern', { seeds: [cut.id], curve: path.id, ...o });
    },
    num: { count: { to: 5, m: 'V', dir: '-' }, spacing: { with: { equal: false, spacing: 10 }, to: 15, m: 'CX', dir: '-' } },
    bool: { equal: { with: { spacing: 10 } }, align: { skip: 'turns each copy with the curve: a round hole on a straight path looks the same either way' } },
  },
  sketchPattern: {
    make: (p, o) => {
      block(p, -50, -50, 100, 100, 5);
      const cut = holeCut(p, 0, 0, 2);
      const pts = sketchOn(p, top, (k) => { for (const [x, y] of [[0, 0], [30, 0], [0, 30], [-30, -30]]) k.entities.push({ id: `pt${x}_${y}`, type: 'point', x, y }); });
      return createFeature(p, 'sketchPattern', { seeds: [cut.id], sketch: pts.id, ...o });
    },
  },
  tablePattern: {
    make: (p, o) => {
      block(p, -50, -50, 100, 100, 5);
      const cut = holeCut(p, 0, 0, 2);
      return createFeature(p, 'tablePattern', { seeds: [cut.id], points: [W('top', 20, 0), W('top', 0, -20), W('top', -20, 20)], ...o });
    },
    // PropertyManager number fields (point i, coordinate j) that rightly leave the model alone.
    pmSkip: [[new RegExp(`^pt3:\\d+:${UP.index}$`), 'the offset along the plane normal runs along the through cut: the hole does not move']],
  },
  fillPattern: {
    make: (p, o) => { block(p, -25, -25, 50, 50, 4); return createFeature(p, 'fillPattern', { face: faceWhere(built(p), (c) => near(c[2], 4)), spacing: 10, diameter: 4, margin: 4.5, ...o }); },
    num: { spacing: { to: 12.5, m: 'V', dir: '+' }, margin: { to: 6, m: 'V', dir: '+' }, diameter: { from: 4, to: 3, m: 'V', dir: '+' }, angle: { to: 30 } },
    opt: { layout: ['hex'] },
  },
  variablePattern: {
    make: (p, o) => {
      block(p, 0, 0, 100, 20, 5);
      const bump = block(p, 5, 5, 10, 10, 5);
      bump.depth = 10;
      return createFeature(p, 'variablePattern', { seeds: [bump.id], param: 'depth', count: 3, axis: 'x', spacing: 30, ...o });
    },
    num: { delta: { to: 8, m: 'V', dir: '+' }, count: { to: 4, m: 'V', dir: '+' }, spacing: { to: 25, m: 'CX', dir: '-' } },
  },
  projectedCurve: {
    make: (p, o) => { block(p, -20, -20, 40, 40, 10); const b = built(p); const s = sketchOn(p, top, (k) => addCircle(k, 0, 0, 8)); return createFeature(p, 'projectedCurve', { sketch: s.id, faces: [faceWhere(b, (c) => near(c[2], 10))], ...o }); },
  },
  splitLine: {
    make: (p, o) => { block(p, -20, -20, 40, 40, 10); const b = built(p); const s = sketchOn(p, top, (k) => addCircle(k, 0, 0, 8)); return createFeature(p, 'splitLine', { sketch: s.id, faces: [faceWhere(b, (c) => near(c[2], 10))], ...o }); },
  },
  compositeCurve: {
    make: (p, o) => {
      const a = createFeature(p, 'sketch3d', { points: [[0, 0, 0], [10, 0, 0]] });
      p.features.push(a);
      const b = createFeature(p, 'sketch3d', { points: [[10, 0, 0], [10, 20, 0], [10, 20, 5]] });
      p.features.push(b);
      return createFeature(p, 'compositeCurve', { curves: [a.id, b.id], ...o });
    },
  },
  curveXYZ: { make: (p, o) => createFeature(p, 'curveXYZ', o) },

  // ── more surfaces, sheet metal and weldments
  ruledSurface: {
    make: (p, o) => { cube(p); const f = faceWhere(built(p), (c) => c[2] > 19.99, true); return createFeature(p, 'ruledSurface', { edges: f.edges.map(edgeSignature), ...o }); },
    num: { distance: { to: 15, m: 'SA', dir: '+' } },
    // Tangent to the side faces runs straight up, as a vector along y does: the mode is checked with the x axis.
    opt: { mode: { with: { axis: 'x' }, values: ['vector'] }, axis: { with: { mode: 'vector' }, values: ['x'] } },
  },
  deleteFace: {
    make: (p, o) => {
      cube(p);
      holeCut(p, 0, 0, 4, 'throughBoth');
      const hole = built(p).faces.find((f) => f.geomType === 'CYLINDRE');
      return createFeature(p, 'deleteFace', { faces: [faceSignature(hole)], mode: 'patch', ...o });
    },
    opt: { mode: ['delete'] },
  },
  replaceFace: {
    make: (p, o) => {
      cube(p);
      const topSig = faceWhere(built(p), (c) => c[2] > 19.99);
      const pl = createFeature(p, 'plane', { base: top, offset: 30 });
      p.features.push(pl);
      const sk = sketchOn(p, { kind: 'ref', id: pl.id }, (k) => addRectangle(k, -20, -20, 20, 20));
      const surf = createFeature(p, 'surfacePlanar', { sketch: sk.id });
      p.features.push(surf);
      return createFeature(p, 'replaceFace', { faces: [topSig], surface: surf.id, ...o });
    },
  },
  extendSurface: {
    make: (p, o) => { const sk = sketchOn(p, top, (k) => addRectangle(k, -10, -10, 10, 10)); const pl = createFeature(p, 'surfacePlanar', { sketch: sk.id }); p.features.push(pl); return createFeature(p, 'extendSurface', { surface: pl.id, ...o }); },
    num: { distance: { to: 8, m: 'SA', dir: '+' } },
  },
  miterFlange: {
    make: (p, o) => { const [e1, e2] = sheetCorner(p); return createFeature(p, 'miterFlange', { edges: [edgeSignature(e1), edgeSignature(e2)], ...o }); },
    num: { length: { to: 30, m: 'V', dir: '+' }, angle: { to: 60, m: 'B:top.n', dir: '-' }, radius: { from: 2, to: 5, m: 'B:top.u', dir: '+' }, gap: { to: 2, m: 'V', dir: '-' } },
  },
  loftedBend: {
    make: (p, o) => {
      const a = sketchOn(p, top, (k) => addCircle(k, 0, 0, 30));
      const pl = createFeature(p, 'plane', { base: top, offset: 40 });
      p.features.push(pl);
      const b = sketchOn(p, { kind: 'ref', id: pl.id }, (k) => addCircle(k, 0, 0, 15));
      return createFeature(p, 'loftedBend', { sketches: [a.id, b.id], segments: 24, ...o });
    },
    num: {
      thickness: { to: 3, m: 'V', dir: '+' },
      radius: { skip: 'the bend radius of a lofted bend is the cone itself (it has no sharp bends to round)' },
      kFactor: { skip: 'a lofted bend is developed by its mid surface; the K-factor applies to sharp bends' },
      // The strips of the developed blank: only the flat pattern uses them.
      segments: { with: { __flat: true }, to: 36 },
    },
  },
  tab: {
    make: (p, o) => { sheet(p); const tb = sketchOn(p, top, (k) => addRectangle(k, 100, 10, 120, 40)); return createFeature(p, 'tab', { sketch: tb.id, ...o }); },
  },
  closedCorner: {
    make: (p, o) => { const ids = twoFlanges(p); return createFeature(p, 'closedCorner', { flanges: ids, ...o }); },
    num: { gap: { to: 2, m: 'V', dir: '-' } },
  },
  cornerRelief: {
    // The relief is cut in the flat pattern: the part is shown flat.
    make: (p, o) => { twoFlanges(p); p.flat = true; return createFeature(p, 'cornerRelief', { kind: 'rect', size: 3, ...o }); },
    num: { size: { to: 5, m: 'V', dir: '-' } },
    opt: { kind: ['round'] },
  },
  formTool: {
    make: (p, o) => { sheet(p); const f = faceWhere(built(p), (c, x) => x.geomType === 'PLANE' && c[2] > 1.99); return createFeature(p, 'formTool', { face: f, tool: 'dimple', size: 20, width: 8, height: 4, ...o }); },
    num: { dx: { to: 10 }, dy: { to: 10 }, angle: { with: { tool: 'louver' }, to: 45 }, size: { to: 25 }, width: { with: { tool: 'louver' }, to: 10 }, height: { to: 6, m: 'B:top.n', dir: '+' } },
    bool: { down: { m: 'C:top.n', dir: '-' } },
    opt: { tool: ['emboss', 'louver', 'lance'] },
  },
  endCap: {
    make: (p, o) => { member(p, 'squareTube', 40, 200); const end = faceWhere(built(p), (c, f) => f.geomType === 'PLANE' && c[0] > 199.99); return createFeature(p, 'endCap', { face: end, ...o }); },
    num: { thickness: { to: 8, m: 'V', dir: '+' }, inset: { to: 4, m: 'V', dir: '-' } },
  },
  gusset: {
    make: (p, o) => {
      const b = lCorner(p);
      const f1 = faceWhere(b, (c, f) => f.geomType === 'PLANE' && near(c[1], 10) && c[0] > 10, false, 'front');
      const f2 = faceWhere(b, (c, f) => f.geomType === 'PLANE' && near(c[0], 10) && c[1] > 10, false, 'front');
      return createFeature(p, 'gusset', { faces: [f1, f2], ...o });
    },
    num: { d1: { to: 40, m: 'V', dir: '+' }, d2: { to: 40, m: 'V', dir: '+' }, thickness: { to: 8, m: 'V', dir: '+' }, chamfer: { to: 5, m: 'V', dir: '-' }, offset: { to: 5 } },
  },
  weldBead: {
    make: (p, o) => {
      const b = lCorner(p);
      const e = b.edges.find((x) => x.geomType === 'LINE' && [x.startPoint, x.endPoint].every((q) => { const l = loc('front', q); return near(l[0], 10) && near(l[1], 10); }));
      return createFeature(p, 'weldBead', { edges: [edgeSignature(e)], ...o });
    },
    num: { size: { to: 7, m: 'V', dir: '+' } },
    bool: { cosmetic: { m: 'V', dir: '-' } },
  },
  trimExtend: {
    make: (p, o) => {
      const m = member(p, 'squareBar', 10, 100);
      const pl = createFeature(p, 'plane', { base: right, offset: 60 });
      p.features.push(pl);
      return createFeature(p, 'trimExtend', { member: m.id, plane: { kind: 'ref', id: pl.id }, ...o });
    },
  },

  // ── mold tools by surfaces, standard parts, routing (bodies given in world coordinates: an imported plate
  // with a through hole, pulled along world z)
  shutOff: {
    make: (p, o) => { moldPlate(p); return createFeature(p, 'shutOff', o); },
    opt: { at: { skip: 'where the shut-off patch sits in the opening: with one straight hole every choice gives the same patch' } },
  },
  partingSurface: {
    make: (p, o) => { moldPlate(p); return createFeature(p, 'partingSurface', o); },
    num: { distance: { to: 40, m: 'SA', dir: '+' } },
  },
  stdPart: {
    make: (p, o) => createFeature(p, 'stdPart', { kind: 'hexBolt', size: 'M8', ...o }),
    num: {
      length: { to: 40, m: 'V', dir: '+' },
      module: { with: { kind: 'spurGear', size: '2' }, to: 2.5, m: 'V', dir: '+' },
      teeth: { with: { kind: 'spurGear', size: '2' }, to: 30, m: 'V', dir: '+' },
      width: { with: { kind: 'spurGear', size: '2' }, to: 25, m: 'V', dir: '+' },
      bore: { with: { kind: 'spurGear', size: '2' }, to: 12, m: 'V', dir: '-' },
      x: { to: 20, m: 'CX', dir: '+' }, y: { to: 20, m: 'CY', dir: '+' }, z: { to: 20, m: 'CZ', dir: '+' },
      angle: { with: { axis: 'x' }, to: 90 },
    },
    bool: { merge: { skip: 'joins the part to the body before it: there is no body in this fixture (an empty part gets the part either way)' } },
    opt: { kind: ['socketCap', 'hexNut', 'flatWasher', 'springWasher'], size: ['M10'], axis: ['x'] },
  },
  route: {
    make: (p, o) => createFeature(p, 'route', { kind: 'tube', bendRadius: 10, ...o }),
    num: {
      od: { with: { kind: 'tube' }, to: 16, m: 'V', dir: '+' },
      wall: { with: { kind: 'tube' }, to: 1.5, m: 'V', dir: '+' },
      bendRadius: { to: 30 },
      diameter: { with: { kind: 'cable' }, to: 8, m: 'V', dir: '+' },
    },
    opt: { kind: ['pipe', 'cable'], dn: { with: { kind: 'pipe' }, values: ['DN40'] }, fittings: { with: { kind: 'pipe' }, values: ['elbows'] }, flanges: { with: { kind: 'pipe' }, values: ['both'] } },
  },
};

/** An imported 40 × 20 × 10 plate (world coordinates) with a through hole, and its parting line along world z. */
function moldPlate(part) {
  const R = rep();
  const plate = R.makeBox([0, 0, 0], [40, 20, 10]).cut(R.makeCylinder(4, 30, [20, 10, -10], [0, 0, 1]));
  part.features.push({ id: `im${part.features.length}`, type: 'import', name: 'Imported1', brep: plate.serialize() });
  part.features.push(createFeature(part, 'partingLine', { dir: 'z' }));
}

// ───────────────────────── base parts of the fixtures above

/** A face of `body` whose centre, in the local (u, v, n) of `plane`, passes `test` (as a signature, or the face itself with `raw`). */
function faceWhere(body, test, raw = false, plane = 'top') {
  const f = body.faces.find((x) => test(loc(plane, x.center), x));
  if (!f) throw new Error('fixture: face not found');
  return raw ? f : faceSignature(f);
}
/** A box on the top plane: u ∈ [u0, u0+w], v ∈ [v0, v0+d], n ∈ [0, h]. */
function block(part, u0, v0, w, d, h, op = 'boss') {
  const s = sketchOn(part, top, (k) => addRectangle(k, u0, v0, u0 + w, v0 + d));
  const e = createFeature(part, 'extrude', { sketch: s.id, depth: h, op });
  part.features.push(e);
  return e;
}
/** A 20 mm cube on the top plane (u, v −10…10, n 0…20). */
function cube(part) { return block(part, -10, -10, 20, 20, 20); }
/** A round cut through everything at (x, y) of the top plane. */
function holeCut(part, x, y, r, end = 'throughBoth') {
  const s = sketchOn(part, top, (k) => addCircle(k, x, y, r));
  const cut = createFeature(part, 'extrude', { sketch: s.id, op: 'cut', end });
  part.features.push(cut);
  return cut;
}
/** Two separate solid bodies (an imported compound). */
function twoBodies(part, a, b) {
  part.features.push({ id: `imp${part.features.length}`, type: 'import', name: 'Imported1', brep: rep().makeCompound([a, b]).serialize() });
}
/** The straight top edges of the 100 × 50 × 2 sheet along u = 100 and along v = 50. */
function sheetCorner(part) {
  sheet(part);
  const body = built(part);
  const at = (e) => [e.startPoint, e.endPoint].map((q) => loc('top', q));
  const e1 = body.edges.find((e) => e.geomType === 'LINE' && at(e).every((q) => near(q[0], 100) && near(q[2], 2)));
  const e2 = body.edges.find((e) => e.geomType === 'LINE' && at(e).every((q) => near(q[1], 50) && near(q[2], 2)));
  return [e1, e2];
}
/** Two edge flanges meeting at a corner of the sheet (their ids). */
function twoFlanges(part) {
  const [e1, e2] = sheetCorner(part);
  const f1 = createFeature(part, 'edgeFlange', { edge: edgeSignature(e1), length: 20 });
  part.features.push(f1);
  const f2 = createFeature(part, 'edgeFlange', { edge: edgeSignature(e2), length: 20 });
  part.features.push(f2);
  return [f1.id, f2.id];
}
/** A weldment member along a line of the top plane. */
function member(part, profile, w, x1) {
  const s = sketchOn(part, top, (k) => addLine(k, 0, 0, x1, 0));
  const f = createFeature(part, 'structural', { sketch: s.id, profile, w, h: w, t: 2 });
  part.features.push(f);
  return f;
}
/** An L of two blocks on the front plane: a base (u 0…100, v 0…10) and an upright (u 0…10, v 0…100), n 0…40. Returns the body. */
function lCorner(part) {
  extrudeRect(part, front, 0, 0, 100, 10, 40);
  extrudeRect(part, front, 0, 0, 10, 100, 40);
  return built(part);
}

/** A type without a fixture: try it on a plate with a fresh sketch, its edges, faces and a surface. */
export function genericFixture(type) {
  return {
    make: (p, o) => {
      extrudeRect(p, front, 0, 0, 40, 30, 10);
      const body = built(p);
      const topFace = body.faces.find((f) => near(loc('front', faceSignature(f).center)[2], 10));
      const edge = body.edges.find((e) => e.geomType === 'LINE' && near(loc('front', edgeSignature(e).mid)[2], 10));
      const s = sketchOn(p, faceRef(topFace), (k) => addRectangle(k, 5, 5, 15, 15));
      const surf = createFeature(p, 'surfacePlanar', { sketch: s.id });
      p.features.push(surf);
      const fill = {};
      for (const [k, v] of Object.entries(FEATURE_DEFAULTS[type]())) {
        if (v !== null && !(Array.isArray(v) && !v.length)) continue;
        if (/sketch|path|curve/i.test(k)) fill[k] = Array.isArray(v) ? [s.id] : s.id;
        else if (/edge/i.test(k)) fill[k] = Array.isArray(v) ? [edgeSignature(edge)] : edgeSignature(edge);
        else if (/face/i.test(k)) fill[k] = Array.isArray(v) ? [faceSignature(topFace)] : faceSignature(topFace);
        else if (/surf/i.test(k)) fill[k] = Array.isArray(v) ? [surf.id] : surf.id;
        else if (/seed/i.test(k)) fill[k] = [p.features[1].id];
      }
      return createFeature(p, type, { ...fill, ...o });
    },
    generic: true,
  };
}

export const fixtureOf = (type) => FIXTURES[type] ?? genericFixture(type);
export const specOf = (s) => (typeof s === 'string' ? (s === '~' ? {} : { dir: s[0], m: s.slice(1) }) : s ?? {});
