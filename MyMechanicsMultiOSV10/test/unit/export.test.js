// Model and drawing export, one behaviour per test: STEP (one part as the app writes it with blobSTEP, several
// components with exportSTEP), binary and ASCII STL (the app's 0.02 / 0.2 mesh), the STL reader the app imports
// with (src/cad/stl.js), STEP / STL re-import, a part holding an imported body, and the drawing files (DXF, SVG)
// of the active sheet. Assertions use volumes, counts and boxes, not which world axis is up.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadKernel, rep } from '../../src/cad/kernel.js';
import { createFeature, regenerate } from '../../src/cad/features.js';
import { addCircle, addRectangle, createSketchGeometry } from '../../src/cad/sketch.js';
import { placeShape, quatFromAxisAngle } from '../../src/cad/assembly.js';
import { buildSample } from '../../src/cad/samples.js';
import { createDrawing, projectDrawing, drawingSvg, drawingDxf, SHEETS } from '../../src/cad/drawing.js';
import { sheetSvg, sheetDxf, addSheet, adjustProjections } from '../../src/cad/drawing-more.js';
import { parseStl, isBinaryStl, importStlSolid } from '../../src/cad/stl.js';

await loadKernel();
const R = rep();
// STEP writing prints transfer statistics on stdout; the test reporter reads stdout, so keep it quiet.
const quiet = (fn) => { const w = process.stdout.write; process.stdout.write = () => true; try { return fn(); } finally { process.stdout.write = w; } };
const V = (s) => R.measureVolume(s);
const near = (a, b, rel = 1e-6, what = '') => assert.ok(Math.abs(a - b) <= rel * Math.max(1, Math.abs(b)), `${what} ${a} ≉ ${b}`);
const STL_OPTS = { tolerance: 0.02, angularTolerance: 0.2, binary: true }; // as app.js exportModel

// ───────────────────────── shapes

const front = { kind: 'std', name: 'front' };
function featurePart() {
  const part = { id: 'p', name: 'Plate', features: [] };
  const s = createFeature(part, 'sketch', { plane: front, ...createSketchGeometry() });
  addRectangle(s, -30, -20, 30, 20); addCircle(s, 0, 0, 8);
  part.features.push(s);
  part.features.push(createFeature(part, 'extrude', { sketch: s.id, depth: 10 }));
  return part;
}
const SHAPES = {
  box: { make: () => R.makeBox([0, 0, 0], [10, 20, 30]), volume: 6000, curved: false },
  cylinder: { make: () => R.makeCylinder(10, 20, [0, 0, 0], [0, 0, 1]), volume: Math.PI * 100 * 20, curved: true },
  holedBlock: { make: () => R.makeBox([-50, -25, 0], [50, 25, 20]).cut(R.makeCylinder(10, 40, [0, 0, -10], [0, 0, 1])), volume: 100 * 50 * 20 - Math.PI * 100 * 20, curved: true },
  sphere: { make: () => R.makeSphere(12), volume: (4 / 3) * Math.PI * 12 ** 3, curved: true },
  featurePart: { make: () => regenerate(featurePart()).body, volume: 60 * 40 * 10 - Math.PI * 64 * 10, curved: true },
};
const shapes = Object.fromEntries(Object.entries(SHAPES).map(([k, s]) => [k, s.make()]));
const bounds = (s) => s.boundingBox.bounds;

// ───────────────────────── STEP helpers

const stepOf = (shape) => quiet(() => shape.blobSTEP());
const stepText = async (shape) => (await stepOf(shape)).text();
const dataSection = (text) => text.slice(text.indexOf('DATA;') + 5, text.lastIndexOf('ENDSEC;'));
const entityIds = (text) => [...dataSection(text).matchAll(/^\s*#(\d+)\s*=/gm)].map((m) => Number(m[1]));
const entityCount = (text, kind) => (dataSection(text).match(new RegExp(`=\\s*${kind}\\(`, 'g')) ?? []).length;

const stepTexts = {};
for (const k of Object.keys(SHAPES)) stepTexts[k] = await stepText(shapes[k]);

for (const [name, spec] of Object.entries(SHAPES)) {
  test(`STEP ${name}: ISO-10303-21 header and END-ISO-10303-21 trailer`, () => {
    const t = stepTexts[name];
    assert.ok(t.startsWith('ISO-10303-21;'), t.slice(0, 40));
    assert.ok(t.trim().endsWith('END-ISO-10303-21;'));
  });
  test(`STEP ${name}: HEADER, then DATA, each closed by ENDSEC`, () => {
    const t = stepTexts[name];
    const h = t.indexOf('HEADER;'); const d = t.indexOf('DATA;');
    assert.ok(h > 0 && d > h, 'HEADER before DATA');
    assert.equal((t.match(/^ENDSEC;/gm) ?? []).length, 2);
    for (const k of ['FILE_DESCRIPTION', 'FILE_NAME', 'FILE_SCHEMA']) assert.ok(t.slice(h, d).includes(k), k);
  });
  test(`STEP ${name}: entities are numbered #1…#N without gaps or repeats`, () => {
    const ids = entityIds(stepTexts[name]);
    assert.ok(ids.length > 20, `${ids.length} entities`);
    assert.equal(new Set(ids).size, ids.length, 'unique');
    assert.deepEqual([...ids].sort((a, b) => a - b), ids.map((_, i) => i + 1));
  });
  test(`STEP ${name}: every #reference names a defined entity`, () => {
    const t = dataSection(stepTexts[name]);
    const defined = new Set(entityIds(stepTexts[name]));
    const body = t.replace(/^\s*#\d+\s*=/gm, '=');
    const missing = [...body.matchAll(/#(\d+)/g)].map((m) => Number(m[1])).filter((n) => !defined.has(n));
    assert.deepEqual([...new Set(missing)], []);
  });
  test(`STEP ${name}: one MANIFOLD_SOLID_BREP in millimetres`, () => {
    assert.equal(entityCount(stepTexts[name], 'MANIFOLD_SOLID_BREP'), 1);
    assert.match(stepTexts[name], /SI_UNIT\(\.MILLI\.,\.METRE\.\)/);
  });
  test(`STEP ${name}: as many ADVANCED_FACE entities as the solid has faces`, () => {
    assert.equal(entityCount(stepTexts[name], 'ADVANCED_FACE'), shapes[name].faces.length);
  });
  test(`STEP ${name}: re-import keeps the volume`, async () => {
    const back = await R.importSTEP(new Blob([stepTexts[name]]));
    near(V(back), spec.volume, 1e-6, 'volume');
  });
  test(`STEP ${name}: re-import keeps the bounding box`, async () => {
    const back = await R.importSTEP(new Blob([stepTexts[name]]));
    const [a0, a1] = bounds(back); const [b0, b1] = bounds(shapes[name]);
    for (let i = 0; i < 3; i++) { near(a0[i], b0[i], 1e-5, `min ${i}`); near(a1[i], b1[i], 1e-5, `max ${i}`); }
  });
  test(`STEP ${name}: re-import keeps the face count`, async () => {
    const back = await R.importSTEP(new Blob([stepTexts[name]]));
    assert.equal(back.faces.length, shapes[name].faces.length);
  });
}

test('STEP of a feature part: written from the regenerated body like the app (blobSTEP of the part body)', async () => {
  const body = regenerate(featurePart()).body;
  const back = await R.importSTEP(new Blob([await stepText(body)]));
  near(V(back), V(body), 1e-6);
});

// ───────────────────────── STEP of several components (assemblies)

const placedComponents = () => {
  const a = R.makeBox([0, 0, 0], [10, 10, 10]);
  const b = R.makeCylinder(4, 30, [0, 0, 0], [0, 0, 1]);
  return [
    { shape: placeShape(a, { position: [0, 0, 0], rotation: [0, 0, 0, 1] }), name: 'Base', color: '#8899aa' },
    { shape: placeShape(b, { position: [50, 0, 0], rotation: quatFromAxisAngle([1, 0, 0], 90) }), name: 'Pin', color: '#cc5522' },
    { shape: placeShape(a, { position: [0, 40, 0], rotation: [0, 0, 0, 1] }), name: 'Base', color: '#8899aa' },
  ];
};
const multiStep = async () => (await quiet(() => R.exportSTEP(placedComponents()))).text();

test('STEP assembly: one MANIFOLD_SOLID_BREP per component', async () => {
  assert.equal(entityCount(await multiStep(), 'MANIFOLD_SOLID_BREP'), 3);
});
test('STEP assembly: the component names are written as products', async () => {
  const t = await multiStep();
  assert.ok(t.includes("PRODUCT('Base'"), 'Base'); assert.ok(t.includes("PRODUCT('Pin'"), 'Pin');
});
test('STEP assembly: each component gets a surface colour style', async () => {
  const t = await multiStep();
  assert.equal(entityCount(t, 'STYLED_ITEM'), 3);
  assert.ok(entityCount(t, 'COLOUR_RGB') + entityCount(t, 'DRAUGHTING_PRE_DEFINED_COLOUR') >= 2, 'colours');
});
test('STEP assembly: entities numbered without gaps and every reference defined', async () => {
  const t = await multiStep();
  const ids = entityIds(t);
  assert.deepEqual([...ids].sort((a, b) => a - b), ids.map((_, i) => i + 1));
  const defined = new Set(ids);
  const refs = [...dataSection(t).replace(/^\s*#\d+\s*=/gm, '=').matchAll(/#(\d+)/g)].map((m) => Number(m[1]));
  assert.ok(refs.every((n) => defined.has(n)));
});
test('STEP assembly: re-import gives the total volume of the placed components', async () => {
  const back = await R.importSTEP(new Blob([await multiStep()]));
  near(V(back), 1000 * 2 + Math.PI * 16 * 30, 1e-6);
});
test('STEP assembly: re-import keeps each component where it was placed (overall box)', async () => {
  const back = await R.importSTEP(new Blob([await multiStep()]));
  const comp = R.makeCompound(placedComponents().map((c) => c.shape));
  const [a0, a1] = bounds(back); const [b0, b1] = bounds(comp);
  for (let i = 0; i < 3; i++) { near(a0[i], b0[i], 1e-5); near(a1[i], b1[i], 1e-5); }
});
test('STEP import of a file that is not STEP is refused', async () => {
  await assert.rejects(() => R.importSTEP(new Blob(['not a step file'])));
});

// ───────────────────────── binary STL

async function stlBytes(shape, opts = STL_OPTS) { return new Uint8Array(await shape.blobSTL(opts).arrayBuffer()); }
function readBinaryStl(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const n = dv.getUint32(80, true);
  const tris = [];
  for (let t = 0; t < n; t++) {
    const o = 84 + t * 50;
    const f = (k) => dv.getFloat32(o + k * 4, true);
    tris.push({ normal: [f(0), f(1), f(2)], v: [[f(3), f(4), f(5)], [f(6), f(7), f(8)], [f(9), f(10), f(11)]], attr: dv.getUint16(o + 48, true) });
  }
  return { n, tris };
}
const signedVolume = (tris) => tris.reduce((s, { v: [a, b, c] }) => s + (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6, 0);
const vkey = (p) => p.map((x) => Math.round(x * 1e4)).join(',');
/** Triangles with three distinct corners (a pole of a sphere can give a sliver whose corners coincide). */
const proper = (tris) => tris.filter(({ v }) => new Set(v.map(vkey)).size === 3);

const stl = {};
for (const k of Object.keys(SHAPES)) stl[k] = await stlBytes(shapes[k]);

for (const [name, spec] of Object.entries(SHAPES)) {
  test(`STL ${name}: 80-byte header + count, 50 bytes per triangle`, () => {
    const { n } = readBinaryStl(stl[name]);
    assert.ok(n >= 4);
    assert.equal(stl[name].length, 84 + 50 * n);
    assert.equal(isBinaryStl(stl[name]), true);
  });
  test(`STL ${name}: the mesh is closed — every edge is shared by exactly two triangles`, () => {
    const count = new Map();
    for (const { v } of proper(readBinaryStl(stl[name]).tris)) for (let i = 0; i < 3; i++) {
      const a = vkey(v[i]); const b = vkey(v[(i + 1) % 3]);
      const k = a < b ? `${a}|${b}` : `${b}|${a}`;
      count.set(k, (count.get(k) ?? 0) + 1);
    }
    const open = [...count].filter(([, c]) => c !== 2);
    assert.deepEqual(open.slice(0, 5), [], `${open.length} edges not shared by two triangles`);
  });
  test(`STL ${name}: triangles are wound consistently (each directed edge once)`, () => {
    const seen = new Set();
    for (const { v } of proper(readBinaryStl(stl[name]).tris)) for (let i = 0; i < 3; i++) {
      const k = `${vkey(v[i])}>${vkey(v[(i + 1) % 3])}`;
      assert.ok(!seen.has(k), `edge ${k} twice in the same direction`);
      seen.add(k);
    }
  });
  test(`STL ${name}: signed mesh volume matches the solid (outward normals)`, () => {
    near(signedVolume(readBinaryStl(stl[name]).tris), spec.volume, spec.curved ? 0.01 : 1e-5, 'volume');
  });
  test(`STL ${name}: facet normals are unit vectors agreeing with the winding`, () => {
    for (const { normal, v: [a, b, c] } of readBinaryStl(stl[name]).tris) {
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]; const w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const x = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
      const l = Math.hypot(...x);
      if (l < 1e-9) continue;
      near(Math.hypot(...normal), 1, 1e-3, 'unit');
      assert.ok((x[0] * normal[0] + x[1] * normal[1] + x[2] * normal[2]) / l > 0.9, 'normal agrees with the winding');
    }
  });
  test(`STL ${name}: the vertices span the solid's bounding box`, () => {
    const pts = readBinaryStl(stl[name]).tris.flatMap((t) => t.v);
    const [b0, b1] = bounds(shapes[name]);
    for (let i = 0; i < 3; i++) {
      near(Math.min(...pts.map((p) => p[i])), b0[i], spec.curved ? 0.05 : 1e-5, `min ${i}`);
      near(Math.max(...pts.map((p) => p[i])), b1[i], spec.curved ? 0.05 : 1e-5, `max ${i}`);
    }
  });
  test(`STL ${name}: ASCII export has the same facets as the binary one`, async () => {
    const text = await shapes[name].blobSTL({ ...STL_OPTS, binary: false }).text();
    assert.match(text, /^solid/); assert.match(text.trim(), /endsolid.*$/);
    assert.equal((text.match(/facet normal/g) ?? []).length, readBinaryStl(stl[name]).n);
    assert.equal((text.match(/outer loop/g) ?? []).length, (text.match(/endloop/g) ?? []).length);
    assert.equal((text.match(/vertex /g) ?? []).length, 3 * readBinaryStl(stl[name]).n);
  });
  test(`STL ${name}: read back (app import) as a solid of the mesh volume`, () => {
    const solid = importStlSolid(stl[name]);
    near(V(solid), signedVolume(readBinaryStl(stl[name]).tris), 1e-4, 'volume');
  });
}

test('STL box: exactly 12 triangles (two per face)', () => { assert.equal(readBinaryStl(stl.box).n, 12); });
test('STL: a finer tolerance meshes a cylinder with more triangles', async () => {
  const coarse = readBinaryStl(await stlBytes(shapes.cylinder, { tolerance: 0.5, angularTolerance: 0.5, binary: true })).n;
  const fine = readBinaryStl(await stlBytes(shapes.cylinder, { tolerance: 0.005, angularTolerance: 0.05, binary: true })).n;
  assert.ok(fine > coarse, `${fine} > ${coarse}`);
});
test('STL: a finer mesh gets closer to the true cylinder volume', async () => {
  const err = async (o) => Math.abs(signedVolume(readBinaryStl(await stlBytes(shapes.cylinder, { ...o, binary: true })).tris) - SHAPES.cylinder.volume);
  assert.ok(await err({ tolerance: 0.005, angularTolerance: 0.05 }) < await err({ tolerance: 0.5, angularTolerance: 0.5 }));
});
test('STL of an assembly compound (as exportModel does for several components) holds every component', async () => {
  const comp = R.makeCompound(placedComponents().map((c) => c.shape));
  const { tris } = readBinaryStl(await stlBytes(comp));
  near(signedVolume(tris), 2000 + Math.PI * 16 * 30, 0.01);
});

// ───────────────────────── the STL reader (src/cad/stl.js)

test('parseStl: binary box → 8 shared vertices, 12 triangles', () => {
  const m = parseStl(stl.box);
  assert.equal(m.verts.length, 8); assert.equal(m.tris.length, 12);
});
test('parseStl: ASCII box → the same mesh as the binary file', async () => {
  const text = new TextEncoder().encode(await shapes.box.blobSTL({ ...STL_OPTS, binary: false }).text());
  assert.equal(isBinaryStl(text), false);
  const m = parseStl(text);
  assert.equal(m.verts.length, 8); assert.equal(m.tris.length, 12);
});
test('parseStl: degenerate triangles are dropped', () => {
  const ascii = 'solid t\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 0 0 0\nvertex 1 0 0\nendloop\nendfacet\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid t\n';
  assert.equal(parseStl(new TextEncoder().encode(ascii)).tris.length, 1);
});
test('isBinaryStl: an ASCII file starting with "solid" is not binary', () => {
  assert.equal(isBinaryStl(new TextEncoder().encode('solid x\n facet normal 0 0 1\n outer loop\n vertex 0 0 0\n'.padEnd(200, ' '))), false);
});
test('importStlSolid: the box comes back with its six flat faces merged', () => {
  const s = importStlSolid(stl.box);
  near(V(s), 6000, 1e-6); assert.equal(s.faces.length, 6);
});
test('importStlSolid: a file without a closed mesh is refused', () => {
  assert.throws(() => importStlSolid(new TextEncoder().encode('solid empty\nendsolid empty\n')), (e) => e.code === 'bad-file');
});

// ───────────────────────── a part with an imported body (the app's import feature)

const importPart = (brep) => { const part = { id: 'imp', name: 'Imported', features: [] }; part.features.push(createFeature(part, 'import', { brep, source: 'x.step', name: 'x' })); return part; };

test('import feature: a serialized body regenerates with the same volume', () => {
  const r = regenerate(importPart(shapes.holedBlock.serialize()));
  near(V(r.body), SHAPES.holedBlock.volume, 1e-6);
});
test('import feature: a STEP file read back and stored regenerates with the same volume', async () => {
  const back = await R.importSTEP(new Blob([stepTexts.featurePart]));
  near(V(regenerate(importPart(back.serialize())).body), SHAPES.featurePart.volume, 1e-6);
});
test('import feature: an STL file read back and stored regenerates as a solid', () => {
  const back = importStlSolid(stl.cylinder);
  near(V(regenerate(importPart(back.serialize())).body), V(back), 1e-6);
});
test('import feature: a later cut works on the imported body', () => {
  const part = importPart(R.makeBox([-20, -20, -20], [20, 20, 20]).serialize());
  const s = createFeature(part, 'sketch', { plane: front, ...createSketchGeometry() });
  addCircle(s, 0, 0, 5);
  part.features.push(s, createFeature(part, 'extrude', { sketch: s.id, op: 'cut', end: 'through', end2: 'through' }));
  const r = regenerate(part);
  assert.ok(V(r.body) < 64000 - 1, `cut removed material (${V(r.body)})`);
});
test('import feature without a body reports import-empty', () => {
  const r = regenerate(importPart(null));
  const res = [...r.results.values()][0];
  assert.equal(res.ok, false); assert.equal(res.error, 'import-empty');
});

// ───────────────────────── drawing files (DXF / SVG of the active sheet)

function assertWellFormed(xml) {
  const stack = [];
  const re = /<(\/?)([A-Za-z][\w:-]*)((?:\s+[\w:-]+="[^"<]*")*)\s*(\/?)>/g;
  let last = 0; let m;
  while ((m = re.exec(xml))) {
    const between = xml.slice(last, m.index);
    assert.ok(!between.includes('<'), `stray '<' near …${between.slice(-60)}`);
    assert.ok(!/&(?!amp;|lt;|gt;|quot;|#\d+;)/.test(between), `bare '&' near …${between.slice(-60)}`);
    last = re.lastIndex;
    const [, close, name, , self] = m;
    if (self) continue;
    if (close) assert.equal(stack.pop(), name, `</${name}> closes the wrong tag`);
    else stack.push(name);
  }
  assert.deepEqual(stack, [], 'unclosed tags');
}
/** DXF as [code, value] pairs; throws when the file is not pairs of an integer code and a value. */
function dxfPairs(dxf) {
  const lines = dxf.replace(/\n$/, '').split('\n');
  assert.equal(lines.length % 2, 0, 'an even number of lines');
  const pairs = [];
  for (let i = 0; i < lines.length; i += 2) { assert.match(lines[i], /^-?\d+$/, `group code at line ${i + 1}: ${lines[i]}`); pairs.push([Number(lines[i]), lines[i + 1]]); }
  return pairs;
}
const sections = (pairs) => pairs.filter(([c, v], i) => c === 2 && pairs[i - 1]?.[0] === 0 && pairs[i - 1]?.[1] === 'SECTION').map(([, v]) => v);

const sampleDrawing = (() => {
  const project = buildSample('asmShaftDrawing', 'en');
  const d = project.drawings[0];
  const part = project.parts.find((p) => p.id === d.source.id);
  const body = regenerate(part, { project }).body;
  const projections = adjustProjections(d, projectDrawing(body, d), { shape: body, key: 'k', cache: new Map() });
  return { project, d, part, body, projections };
})();
const sampleDxf = sheetDxf(sampleDrawing.d, sampleDrawing.projections, {});
const sampleSvg = sheetSvg(sampleDrawing.d, sampleDrawing.projections, { info: { name: sampleDrawing.part.name } });

test('DXF of a sample drawing: group-code / value pairs throughout', () => { assert.ok(dxfPairs(sampleDxf).length > 100); });
test('DXF of a sample drawing: sections HEADER, TABLES, ENTITIES in order, then EOF', () => {
  const pairs = dxfPairs(sampleDxf);
  assert.deepEqual(sections(pairs), ['HEADER', 'TABLES', 'ENTITIES']);
  assert.deepEqual(pairs.at(-1), [0, 'EOF']);
  assert.equal(pairs.filter(([c, v]) => c === 0 && v === 'ENDSEC').length, 3);
});
test('DXF of a sample drawing: units are millimetres ($INSUNITS 4)', () => { assert.match(sampleDxf, /\$INSUNITS\n70\n4\n/); });
test('DXF of a sample drawing: the layer table count matches its layers', () => {
  const pairs = dxfPairs(sampleDxf);
  const at = pairs.findIndex(([c, v]) => c === 2 && v === 'LAYER');
  const declared = Number(pairs[at + 1][1]);
  const layers = pairs.filter(([c, v], i) => c === 0 && v === 'LAYER' && i > at);
  assert.equal(layers.length, declared);
});
test('DXF of a sample drawing: every entity is on a declared layer', () => {
  const pairs = dxfPairs(sampleDxf);
  const declared = new Set(pairs.filter(([c], i) => c === 2 && pairs[i - 1]?.[1] === 'LAYER' && pairs[i - 1]?.[0] === 0).map(([, v]) => v));
  const start = pairs.findIndex(([c, v]) => c === 2 && v === 'ENTITIES');
  const used = new Set(pairs.slice(start).filter(([c]) => c === 8).map(([, v]) => v));
  for (const l of used) assert.ok(declared.has(l), `layer ${l}`);
  for (const l of ['VISIBLE', 'BORDER', 'HATCH', 'NOTES']) assert.ok(used.has(l), `uses ${l}`);
});
test('DXF of a sample drawing: LINE end points lie on the sheet', () => {
  const [W, H] = SHEETS[sampleDrawing.d.sheet] ?? SHEETS.A3;
  const pairs = dxfPairs(sampleDxf);
  let n = 0;
  for (const [c, v] of pairs) {
    if (c === 10 || c === 11) { const x = Number(v); assert.ok(x > -1 && x < W + 1, `x ${x}`); n++; }
    if (c === 20 || c === 21) { const y = Number(v); assert.ok(y > -1 && y < H + 1, `y ${y}`); }
  }
  assert.ok(n > 100);
});
test('DXF of a sample drawing: four BORDER lines make the sheet frame', () => {
  const pairs = dxfPairs(sampleDxf);
  assert.equal(pairs.filter(([c, v]) => c === 8 && v === 'BORDER').length, 4);
});
test('SVG of a sample drawing: well-formed XML', () => { assertWellFormed(sampleSvg); });
test('SVG of a sample drawing: svg root with namespace, viewBox and size of the sheet in mm', () => {
  const [W, H] = SHEETS[sampleDrawing.d.sheet] ?? SHEETS.A3;
  assert.match(sampleSvg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.ok(sampleSvg.includes(`viewBox="0 0 ${W} ${H}"`)); assert.ok(sampleSvg.includes(`width="${W}mm" height="${H}mm"`));
});
test('SVG of a sample drawing: one group per view, with visible lines', () => {
  const views = sampleSvg.match(/data-view="/g) ?? [];
  assert.equal(views.length, sampleDrawing.d.views.length);
  assert.ok((sampleSvg.match(/class="visible-line"/g) ?? []).length > 10);
});
test('SVG of a sample drawing: every annotation is drawn', () => {
  for (const a of sampleDrawing.d.annotations) assert.ok(sampleSvg.includes(`data-annotation="${a.id}"`), a.id);
});
test('SVG of a sample drawing: the title block names the part', () => {
  assert.match(sampleSvg, /class="title-block"/);
  assert.ok(sampleSvg.includes(`>${sampleDrawing.part.name.replace(/&/g, '&amp;')}<`));
});
test('SVG / DXF of an empty second sheet: still a complete file with frame and title block', () => {
  const d = structuredClone(createDrawing({ id: 'e', name: 'E', source: { kind: 'part', id: 'p' } }));
  addSheet(d, 'Two', 'sh2');
  const svg = sheetSvg(d, new Map(), {});
  assertWellFormed(svg); assert.match(svg, /class="title-block"/); assert.doesNotMatch(svg, /data-view=/);
  const pairs = dxfPairs(sheetDxf(d, new Map(), {}));
  assert.deepEqual(pairs.at(-1), [0, 'EOF']);
  assert.equal(pairs.filter(([c, v]) => c === 8 && v === 'BORDER').length, 4);
});
for (const sheet of Object.keys(SHEETS)) {
  test(`SVG / DXF on ${sheet}: viewBox and border are the sheet size`, () => {
    const d = createDrawing({ id: 's', name: 'S', source: { kind: 'part', id: 'p' }, sheet });
    d.views = [];
    const [W, H] = SHEETS[sheet];
    const svg = drawingSvg(d, new Map());
    assert.ok(svg.includes(`viewBox="0 0 ${W} ${H}"`));
    const xs = dxfPairs(drawingDxf(d, new Map())).filter(([c]) => c === 10 || c === 11).map(([, v]) => Number(v));
    near(Math.max(...xs), W - 10, 1e-6); near(Math.min(...xs), 10, 1e-6);
  });
}
