// Feature fixtures: for every feature type a small base part and the feature on it, plus what each of its
// settings is expected to do to the model. Shared by the kernel test (test/unit/feature-params.test.js) and
// the PropertyManager test in the browser (test/e2e/controls.steps.json, imported through Vite) — the kernel
// must be loaded before make() is called.
import { rep } from '../../src/cad/kernel.js';
import { createFeature, regenerate, faceRef, FEATURE_DEFAULTS } from '../../src/cad/features.js';
import { addCircle, addLine, addRectangle, createSketchGeometry } from '../../src/cad/sketch.js';
import { edgeSignature, faceSignature } from '../../src/cad/refs.js';


export const front = { kind: 'std', name: 'front' }; export const top = { kind: 'std', name: 'top' }; export const right = { kind: 'std', name: 'right' };
export const newPart = (id = 'p') => ({ id, name: 'Part', features: [] });
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
/** A sheet-metal plate 100 × 50 × 2 on the top plane, and its top edge at x = 100. */
function sheet(part) {
  const s = sketchOn(part, top, (k) => addRectangle(k, 0, 0, 100, 50));
  part.features.push(createFeature(part, 'baseFlange', { sketch: s.id, thickness: 2, radius: 2, kFactor: 0.4 }));
  const body = built(part);
  return body.edges.find((e) => e.geomType === 'LINE' && e.startPoint.x > 99.9 && e.endPoint.x > 99.9 && e.startPoint.y > 1.9 && e.endPoint.y > 1.9);
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
  plane: { make: (p, o) => createFeature(p, 'plane', { base: top, ...o }), num: { offset: '+PY' } },
  extrude: {
    make: (p, o) => { const s = sketchOn(p, front, (k) => addRectangle(k, 0, 0, 20, 10)); return createFeature(p, 'extrude', { sketch: s.id, ...o }); },
    num: {
      depth: '+V',
      depth2: { with: { end2: 'blind' }, m: 'V', dir: '+' },
      draftAngle: { with: { draft: true, draftAngle: 3 }, to: 6, m: 'V', dir: '-' },
    },
    bool: { reverse: { m: 'CZ', dir: '-' } },
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
      const edges = built(p).edges.filter((e) => Math.abs(Math.abs(edgeSignature(e).dir[2]) - 1) < 1e-6).map(edgeSignature);
      return createFeature(p, 'fillet', { edges, ...o });
    },
    num: { radius: { to: 4, m: 'V', dir: '-' } },
  },
  chamfer: {
    make: (p, o) => {
      extrudeRect(p, front, 0, 0, 40, 30, 10);
      const edges = built(p).edges.filter((e) => Math.abs(Math.abs(edgeSignature(e).dir[2]) - 1) < 1e-6).map(edgeSignature);
      return createFeature(p, 'chamfer', { edges, ...o });
    },
    num: { distance: { to: 3, m: 'V', dir: '-' } },
  },
  shell: {
    make: (p, o) => {
      extrudeRect(p, front, 0, 0, 50, 40, 30);
      const face = built(p).faces.find((f) => Math.abs(faceSignature(f).center[2] - 30) < 1e-6);
      return createFeature(p, 'shell', { faces: [faceSignature(face)], ...o });
    },
    num: { thickness: { to: 3, m: 'V', dir: '+' } },
  },
  hole: {
    make: (p, o) => {
      extrudeRect(p, front, 0, 0, 60, 40, 20);
      const face = built(p).faces.find((f) => Math.abs(faceSignature(f).center[2] - 20) < 1e-6);
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
      return createFeature(p, 'linearPattern', { seeds: [seed.id], direction: { kind: 'axis', axis: 'x' }, direction2: { kind: 'axis', axis: 'y' }, ...o });
    },
    num: {
      count: { to: 4, m: 'V', dir: '+' },
      spacing: { to: 25, m: 'CX', dir: '+' },
      count2: { to: 3, m: 'V', dir: '+' },
      spacing2: { to: 25, m: 'CY', dir: '+' },
    },
    bool: { reverse: { m: 'CX', dir: '-' }, reverse2: { m: 'CY', dir: '-' } },
  },
  circularPattern: {
    make: (p, o) => {
      extrudeCircle(p, front, 0, 0, 50, 8);
      const seed = extrudeCircle(p, front, 35, 0, 4, 12);
      return createFeature(p, 'circularPattern', { seeds: [seed.id], axis: { kind: 'axis', axis: 'z' }, ...o });
    },
    num: {
      count: { to: 8, m: 'V', dir: '+' },
      angle: { with: { equal: false, count: 3, angle: 30 }, to: 60, m: 'CY', dir: '+' },
    },
    bool: { equal: { with: { angle: 90 } }, reverse: { with: { equal: false, count: 3, angle: 30 }, m: 'CY', dir: '-' } },
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
      const sides = built(p).faces.filter((f) => f.geomType === 'PLANE' && Math.abs(faceSignature(f).normal[1]) < 0.5).map(faceSignature);
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
      const face = built(p).faces.find((f) => f.geomType === 'PLANE' && faceSignature(f).center[1] > 9);
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
      const edge = built(p).edges.find((e) => e.geomType === 'CIRCLE' && e.pointAt(0).y > 11);
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
      const face = built(p).faces.find((f) => Math.abs(faceSignature(f).center[2] - 10) < 1e-6);
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
    opt: { axis: { with: { angle: 45 }, values: ['x', 'z'] } },
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
    num: { dx: { to: 20, m: 'CX', dir: '+' }, dy: { to: 20, m: 'CY', dir: '+' }, dz: { to: 20, m: 'CZ', dir: '+' }, angle: { to: 90 }, scale: { to: 2, m: 'V', dir: '+' } },
    opt: { op: ['cut'], axis: { with: { angle: 90 }, values: ['x'] } },
  },
  baseFlange: {
    make: (p, o) => { const s = sketchOn(p, top, (k) => addRectangle(k, 0, 0, 100, 50)); return createFeature(p, 'baseFlange', { sketch: s.id, ...o }); },
    num: {
      thickness: { to: 3, m: 'V', dir: '+' },
      radius: { skip: 'the sheet\'s default bend radius: a flat base flange has no bend — checked by "sheet defaults reach the bends" below' },
      kFactor: { skip: 'used only in the flat pattern of bends — checked by "sheet defaults reach the bends" below' },
    },
    bool: { reverse: { m: 'CY', dir: '-' } },
  },
  edgeFlange: {
    make: (p, o) => { const edge = sheet(p); return createFeature(p, 'edgeFlange', { edge: edgeSignature(edge), ...o }); },
    num: { length: { to: 30, m: 'V', dir: '+' }, angle: { to: 45, m: 'BY', dir: '-' }, radius: { from: 2, to: 6, m: 'BX', dir: '+' } },
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
    num: { length: { to: 15, m: 'V', dir: '+' }, gap: { with: { kind: 'open' }, to: 3, m: 'BY', dir: '+' } },
    opt: { kind: ['open'] },
  },
  sketchedBend: {
    make: (p, o) => { sheet(p); const line = sketchOn(p, top, (k) => addLine(k, 60, -10, 60, 60)); return createFeature(p, 'sketchedBend', { sketch: line.id, ...o }); },
    num: { angle: { to: 45, m: 'BY', dir: '-' }, radius: { from: 2, to: 6, m: 'V', dir: '+' } },
  },
  jog: {
    make: (p, o) => { sheet(p); const line = sketchOn(p, top, (k) => addLine(k, 50, -10, 50, 60)); return createFeature(p, 'jog', { sketch: line.id, ...o }); },
    num: { height: { to: 15, m: 'BY', dir: '+' } },
  },
  partingLine: {
    make: (p, o) => { extrudeRect(p, top, 0, 0, 20, 10, 20); return createFeature(p, 'partingLine', o); },
    opt: { dir: ['x'] },
  },
  toolingSplit: {
    make: (p, o) => { extrudeCircle(p, top, 0, 0, 20, 20); return createFeature(p, 'toolingSplit', o); },
    num: { margin: { to: 15, m: 'V', dir: '+' }, gap: { to: 40, m: 'BY', dir: '+' }, height: { with: { auto: false, height: 5 }, to: 12 } },
    bool: { keepPart: { m: 'V', dir: '+' } },
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
    make: (p, o) => { block(p, -50, -50, 100, 100, 10); return createFeature(p, 'deform', { x: 0, y: 10, z: 0, dir: 'y', ...o }); },
    num: { amount: { to: 8, m: 'BY', dir: '+' }, radius: { to: 40, m: 'V', dir: '+' }, x: { to: 10 }, y: { skip: 'the point is on the top face (y = 10): moving it along the push direction moves nothing' }, z: { to: 10 } },
    opt: { dir: ['x'] },
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
      const edge = built(p).edges.find((e) => e.geomType === 'LINE' && Math.abs(e.startPoint.y - 20) < 1e-6 && Math.abs(e.endPoint.y - 20) < 1e-6 && Math.abs(e.startPoint.z) < 1e-6 && Math.abs(e.endPoint.z) < 1e-6);
      return createFeature(p, 'variableFillet', { edges: [edgeSignature(edge)], ...o });
    },
    num: { r1: { to: 3, m: 'V', dir: '-' }, r2: { to: 7, m: 'V', dir: '-' } },
  },
  faceFillet: {
    make: (p, o) => {
      block(p, 0, 0, 40, 10, 20);
      const b = built(p);
      return createFeature(p, 'faceFillet', { faces: [faceWhere(b, (c) => Math.abs(c[1] - 20) < 1e-6), faceWhere(b, (c) => Math.abs(c[2]) < 1e-6)], ...o });
    },
    num: { radius: { to: 4, m: 'V', dir: '-' } },
  },
  fullRoundFillet: {
    make: (p, o) => {
      block(p, 0, 0, 40, 10, 20);
      const b = built(p);
      return createFeature(p, 'fullRoundFillet', { faces: [faceWhere(b, (c) => Math.abs(c[2]) < 1e-6), faceWhere(b, (c) => Math.abs(c[1] - 20) < 1e-6), faceWhere(b, (c) => Math.abs(c[2] - 10) < 1e-6)], ...o });
    },
  },
  curvePattern: {
    make: (p, o) => {
      block(p, -10, -10, 100, 20, 5);
      const cut = holeCut(p, 0, 0, 2);
      const path = createFeature(p, 'sketch3d', { points: [[0, 5, 0], [60, 5, 0]] });
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
      return createFeature(p, 'tablePattern', { seeds: [cut.id], points: [[20, 0, 0], [0, 0, 20], [-20, 0, -20]], ...o });
    },
    // PropertyManager number fields (point i, coordinate j) that rightly leave the model alone.
    pmSkip: [[/^pt3:\d+:1$/, 'the y offset runs along the through cut: the hole does not move']],
  },
  fillPattern: {
    make: (p, o) => { block(p, -25, -25, 50, 50, 4); return createFeature(p, 'fillPattern', { face: faceWhere(built(p), (c) => Math.abs(c[1] - 4) < 1e-6), spacing: 10, diameter: 4, ...o }); },
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
    make: (p, o) => { block(p, -20, -20, 40, 40, 10); const b = built(p); const s = sketchOn(p, top, (k) => addCircle(k, 0, 0, 8)); return createFeature(p, 'projectedCurve', { sketch: s.id, faces: [faceWhere(b, (c) => Math.abs(c[1] - 10) < 1e-6)], ...o }); },
  },
  splitLine: {
    make: (p, o) => { block(p, -20, -20, 40, 40, 10); const b = built(p); const s = sketchOn(p, top, (k) => addCircle(k, 0, 0, 8)); return createFeature(p, 'splitLine', { sketch: s.id, faces: [faceWhere(b, (c) => Math.abs(c[1] - 10) < 1e-6)], ...o }); },
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
    make: (p, o) => { cube(p); const f = faceWhere(built(p), (c) => c[1] > 19.99, true); return createFeature(p, 'ruledSurface', { edges: f.edges.map(edgeSignature), ...o }); },
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
      const topSig = faceWhere(built(p), (c) => c[1] > 19.99);
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
    num: { length: { to: 30, m: 'V', dir: '+' }, angle: { to: 60, m: 'BY', dir: '-' }, radius: { from: 2, to: 5, m: 'BX', dir: '+' }, gap: { to: 2, m: 'V', dir: '-' } },
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
    make: (p, o) => { sheet(p); const f = faceWhere(built(p), (c, x) => x.geomType === 'PLANE' && c[1] > 1.99); return createFeature(p, 'formTool', { face: f, tool: 'dimple', size: 20, width: 8, height: 4, ...o }); },
    num: { dx: { to: 10 }, dy: { to: 10 }, angle: { with: { tool: 'louver' }, to: 45 }, size: { to: 25 }, width: { with: { tool: 'louver' }, to: 10 }, height: { to: 6, m: 'BY', dir: '+' } },
    bool: { down: { m: 'CY', dir: '-' } },
    opt: { tool: ['emboss', 'louver', 'lance'] },
  },
  endCap: {
    make: (p, o) => { member(p, 'squareTube', 40, 200); const end = faceWhere(built(p), (c, f) => f.geomType === 'PLANE' && c[0] > 199.99); return createFeature(p, 'endCap', { face: end, ...o }); },
    num: { thickness: { to: 8, m: 'V', dir: '+' }, inset: { to: 4, m: 'V', dir: '-' } },
  },
  gusset: {
    make: (p, o) => {
      const b = lCorner(p);
      const f1 = faceWhere(b, (c, f) => f.geomType === 'PLANE' && Math.abs(c[1] - 10) < 1e-6 && c[0] > 10);
      const f2 = faceWhere(b, (c, f) => f.geomType === 'PLANE' && Math.abs(c[0] - 10) < 1e-6 && c[1] > 10);
      return createFeature(p, 'gusset', { faces: [f1, f2], ...o });
    },
    num: { d1: { to: 40, m: 'V', dir: '+' }, d2: { to: 40, m: 'V', dir: '+' }, thickness: { to: 8, m: 'V', dir: '+' }, chamfer: { to: 5, m: 'V', dir: '-' }, offset: { to: 5 } },
  },
  weldBead: {
    make: (p, o) => {
      const b = lCorner(p);
      const e = b.edges.find((x) => x.geomType === 'LINE' && [x.startPoint, x.endPoint].every((q) => Math.abs(q.x - 10) < 1e-6 && Math.abs(q.y - 10) < 1e-6));
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
};

// ───────────────────────── base parts of the fixtures above

/** A face of `body` whose centre passes `test` (as a signature, or the face itself with `raw`). */
function faceWhere(body, test, raw = false) {
  const f = body.faces.find((x) => { const c = x.center; return test([c.x, c.y, c.z], x); });
  if (!f) throw new Error('fixture: face not found');
  return raw ? f : faceSignature(f);
}
/** A box w × h × d on the top plane (x ∈ [x0, x0+w], z ∈ [z0, z0+d], y ∈ [0, h]). */
function block(part, x0, z0, w, d, h, op = 'boss') {
  const s = sketchOn(part, top, (k) => addRectangle(k, x0, -z0 - d, x0 + w, -z0));
  const e = createFeature(part, 'extrude', { sketch: s.id, depth: h, op });
  part.features.push(e);
  return e;
}
/** A 20 mm cube on the top plane (x −10…10, y 0…20, z −10…10). */
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
/** The straight top edges of the 100 × 50 × 2 sheet along x = 100 and along z = −50. */
function sheetCorner(part) {
  sheet(part);
  const body = built(part);
  const at = (e) => [e.startPoint, e.endPoint].map((q) => [q.x, q.y, q.z]);
  const e1 = body.edges.find((e) => e.geomType === 'LINE' && at(e).every((q) => Math.abs(q[0] - 100) < 1e-6 && Math.abs(q[1] - 2) < 1e-6));
  const e2 = body.edges.find((e) => e.geomType === 'LINE' && at(e).every((q) => Math.abs(q[2] + 50) < 1e-6 && Math.abs(q[1] - 2) < 1e-6));
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
/** An L of two blocks: a base (x 0…100, y 0…10) and an upright (x 0…10, y 0…100), z 0…40. Returns the body. */
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
      const topFace = body.faces.find((f) => Math.abs(faceSignature(f).center[2] - 10) < 1e-6);
      const edge = body.edges.find((e) => e.geomType === 'LINE' && Math.abs(edgeSignature(e).mid[2] - 10) < 1e-6);
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
