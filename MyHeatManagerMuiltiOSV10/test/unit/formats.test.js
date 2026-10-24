// Unit tests of the file-format conversions (node --test test/unit/formats.test.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeModel, materialAt, cellSize, bodyBounds } from '../../src/core/model.js';
import { sampleModel } from '../../src/core/samples.js';
import { bodiesFromDxf } from '../../src/core/interop.js';
import { materialFromLibrary } from '../../src/core/materials.js';
import { decodeResult, MAGIC } from '../../src/core/result.js';
import {
  FORMATS, UNSUPPORTED, nastranBdf, ansysCdb, comsolMphtxt, gmshMsh, gmshToModel, resultVtu, modelStl, dxfFromModel,
  thermToModel, modelToTherm, triangulate,
} from '../../src/core/formats.js';

const SAMPLES = [['tutorial', sampleModel('tutorial', 'en')], ['pcb3d', sampleModel('pcb3d', 'en')]];

/** Material cells and the grid corners they use, counted independently of formats.js. */
function gridCounts(model) {
  const d = model.domain;
  const is3d = d.dim === 3;
  const { dx, dy, dz } = cellSize(d);
  const nz = is3d ? d.nz : 1;
  let cells = 0;
  const nodes = new Set();
  const mats = new Set();
  for (let k = 0; k < nz; k++) for (let j = 0; j < d.ny; j++) for (let i = 0; i < d.nx; i++) {
    const m = materialAt(model, (i + 0.5) * dx, (j + 0.5) * dy, is3d ? (k + 0.5) * dz : null);
    if (m == null) continue;
    cells++;
    mats.add(m);
    for (const [a, b, c] of is3d ? [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]] : [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0]]) {
      nodes.add(`${i + a},${j + b},${k + c}`);
    }
  }
  return { cells, nodes: nodes.size, materials: mats.size };
}

const clean = (text) => assert.ok(!/NaN|undefined|Infinity|\[object/.test(text), 'no NaN / undefined in the output');

test('format tables list every format with names in both languages', () => {
  const ids = FORMATS.map((f) => f.id);
  for (const id of ['myheat', 'calculix', 'vtk', 'csv', 'png', 'nastran', 'ansys', 'comsol', 'gmsh', 'vtu', 'stl', 'dxf', 'therm']) assert.ok(ids.includes(id), id);
  for (const f of FORMATS) {
    assert.ok(f.ext && f.name.ko && f.name.en && f.product);
    assert.equal(typeof f.open, 'boolean');
    assert.equal(typeof f.save, 'boolean');
  }
  assert.ok(FORMATS.find((f) => f.id === 'therm').open && FORMATS.find((f) => f.id === 'therm').save);
  for (const ext of ['mph', 'sldprt', 'sldasm', 'wbpj', 'wbpz', 'sim', 'fem', 'cas', 'db', 'x_t', 'step', 'iges']) assert.ok(UNSUPPORTED.some((u) => u.ext === ext), ext);
  for (const u of UNSUPPORTED) assert.ok(u.reason.ko && u.reason.en && u.product);
});

for (const [id, model] of SAMPLES) {
  const counts = gridCounts(model);
  const is3d = model.domain.dim === 3;

  test(`Nastran bulk data (${id})`, () => {
    const bdf = nastranBdf(model);
    clean(bdf);
    assert.match(bdf, /^SOL 153$/m);
    assert.match(bdf, /^BEGIN BULK$/m);
    assert.match(bdf, /^ENDDATA$/m);
    const lines = bdf.split('\n');
    assert.equal(lines.filter((l) => l.startsWith('GRID*')).length, counts.nodes);
    assert.equal(lines.filter((l) => l.startsWith(is3d ? 'CHEXA,' : 'CQUAD4,')).length, counts.cells);
    assert.equal(lines.filter((l) => l.startsWith('MAT4,') || l.startsWith('MAT5,')).length, counts.materials + lines.filter((l) => l.startsWith('PCONV,')).length);
    if (lines.some((l) => l.startsWith('PSHELL,') || l.startsWith('PSOLID,'))) assert.ok(lines.some((l) => l.startsWith('MAT5,')), 'anisotropic PCB board → MAT5');
    assert.ok(lines.some((l) => l.startsWith('CONV,')), 'convection written');
    assert.ok(lines.some((l) => l.startsWith('QVOL,')), 'body power written');
    // Free-field entries other than GRID* stay within 8 characters per field.
    for (const l of lines.slice(lines.indexOf('BEGIN BULK')).filter((x) => !x.startsWith('$') && x.includes(','))) for (const f of l.split(',')) assert.ok(f.length <= 8, `${l}: ${f}`);
    // Total QVOL power = body powers.
    const { dx, dy, dz } = cellSize(model.domain);
    const volume = (dx / 1000) * (dy / 1000) * ((is3d ? dz : model.domain.depth) / 1000);
    const power = lines.filter((l) => l.startsWith('QVOL,')).reduce((s, l) => s + Number(l.split(',')[2].replace(/([0-9.])([+-]\d+)$/, '$1e$2')) * volume, 0);
    const expected = model.bodies.reduce((s, b) => s + b.power, 0);
    assert.ok(Math.abs(power - expected) / expected < 1e-3, `QVOL power ${power} vs ${expected}`);
  });

  test(`Ansys MAPDL input (${id})`, () => {
    const cdb = ansysCdb(model);
    clean(cdb);
    const lines = cdb.split('\n');
    assert.ok(lines.includes(is3d ? 'ET,1,70' : 'ET,1,55'));
    const nb = lines.findIndex((l) => l.startsWith('NBLOCK'));
    const nEnd = lines.indexOf('N,R5.3,LOC,       -1,');
    assert.equal(nEnd - nb - 2, counts.nodes);
    assert.equal(lines[nb + 2].length, 27 + 63, 'NBLOCK row is 3i9 + 3e21');
    const eb = lines.findIndex((l) => l.startsWith('EBLOCK'));
    const eEnd = lines.indexOf('       -1', eb);
    assert.equal(eEnd - eb - 2, counts.cells);
    assert.equal(lines[eb + 2].length, 9 * (11 + (is3d ? 8 : 4)));
    assert.equal(lines.filter((l) => l.startsWith('MP,KXX,')).length, counts.materials);
    assert.ok(lines.some((l) => l.startsWith('MP,KYY,')), 'anisotropic PCB board');
    assert.ok(lines.some((l) => /^SFE,\d+,[1-6],CONV,1,/.test(l)));
    assert.ok(lines.some((l) => l.startsWith('BFE,')));
    assert.ok(lines.includes('SOLVE'));
  });

  test(`COMSOL text mesh (${id})`, () => {
    const text = comsolMphtxt(model);
    clean(text);
    assert.ok(text.startsWith('# Created by COMSOL Multiphysics'));
    const lines = text.split('\n');
    assert.ok(lines.includes(`${is3d ? 3 : 2} # sdim`));
    const vertices = Number(lines.find((l) => l.endsWith('# number of mesh vertices')).split(' ')[0]);
    assert.equal(vertices, counts.nodes);
    const typeAt = lines.indexOf(is3d ? '3 hex # type name' : '4 quad # type name');
    const countLine = lines.slice(typeAt).find((l) => l.endsWith('# number of elements'));
    assert.equal(Number(countLine.split(' ')[0]), counts.cells);
    const entities = lines.slice(typeAt).find((l) => l.endsWith('# number of geometric entity indices'));
    assert.equal(Number(entities.split(' ')[0]), counts.cells);
    // Connectivity is 0-based and inside the vertex list; first element is lexicographic.
    const first = lines[lines.indexOf('# Elements', typeAt) + 1].split(' ').map(Number);
    assert.equal(first.length, is3d ? 8 : 4);
    assert.ok(first.every((n) => n >= 0 && n < vertices));
    const coords = lines.slice(lines.indexOf('# Mesh vertex coordinates') + 1, lines.indexOf('# Mesh vertex coordinates') + 1 + vertices).map((l) => l.split(' ').map(Number));
    const [a, b, c, d] = first.map((n) => coords[n]);
    assert.ok(a[0] < b[0] && a[1] === b[1], 'v1 is +x of v0');
    assert.ok(c[0] === a[0] && c[1] > a[1], 'v2 is +y of v0');
    assert.ok(d[0] === b[0] && d[1] === c[1], 'v3 is the far corner');
  });

  test(`Gmsh MSH 2.2 (${id}) and its round trip`, () => {
    const msh = gmshMsh(model);
    clean(msh);
    const lines = msh.split('\n');
    assert.equal(lines[1], '2.2 0 8');
    const nodes = Number(lines[lines.indexOf('$Nodes') + 1]);
    assert.equal(nodes, counts.nodes);
    const elements = lines.slice(lines.indexOf('$Elements') + 2, lines.indexOf('$EndElements')).map((l) => l.split(' ').map(Number));
    assert.equal(elements.filter((e) => e[1] === (is3d ? 5 : 3) && e[3] <= counts.materials).length, counts.cells);
    assert.ok(elements.every((e) => e.slice(5).every((n) => n >= 1 && n <= nodes)));
    const { model: back, warnings } = gmshToModel(msh, { language: 'en' });
    assert.equal(back.domain.width, model.domain.width);
    assert.equal(back.domain.height, model.domain.height);
    assert.equal(back.domain.dim, model.domain.dim);
    assert.ok(!warnings.some((w) => /could not be traced|bounding/.test(w)), warnings.join('; '));
    const materials = new Set(model.bodies.map((b) => b.material));
    assert.deepEqual(new Set(back.bodies.map((b) => b.material)), materials, 'one material group per material');
    // Touching bodies of one material merge (tutorial: heat sink + fins); separate ones stay separate.
    assert.equal(back.bodies.length, 6);
    // The re-imported model rasterises to the same material cells.
    assert.equal(gridCounts(back).cells, counts.cells);
    assert.ok(back.boundaries.length >= 1 && back.boundaries.every((bc) => bc.type === 'convection'));
    // Without the domain section the bounding box of the mesh is used.
    const bare = gmshToModel(msh.replace(/\$MyHeatManager[\s\S]*?\$EndMyHeatManager\n/, '')).model;
    assert.ok(bare.domain.width > 0 && bare.domain.nx > 0);
    if (!is3d) assert.equal(bare.domain.nx, 160);
  });

  test(`STL and DXF (${id})`, () => {
    const stl = modelStl(model);
    clean(stl);
    assert.equal((stl.match(/^solid /gm) ?? []).length, model.bodies.length);
    for (const m of stl.matchAll(/facet normal (\S+) (\S+) (\S+)/g)) assert.ok(Math.abs(Math.hypot(+m[1], +m[2], +m[3]) - 1) < 1e-6);
    // Every body is a rect → 12 facets each.
    assert.equal((stl.match(/facet normal/g) ?? []).length, 12 * model.bodies.length);
    const dxf = dxfFromModel(model);
    clean(dxf);
    const { bodies } = bodiesFromDxf(dxf);
    assert.equal(bodies.length, model.bodies.length);
    bodies.forEach((b, i) => {
      const x = bodyBounds(b);
      const y = bodyBounds(model.bodies[i]);
      for (const k of ['x0', 'y0', 'x1', 'y1']) assert.ok(Math.abs(x[k] - y[k]) < 1e-6, `${k} ${x[k]} vs ${y[k]}`);
    });
  });
}

test('exports skip void cells and keep boundary priority', () => {
  const model = normalizeModel({
    domain: { dim: 2, width: 4, height: 2, nx: 4, ny: 2, background: null },
    materials: [{ id: 'a', k: 10, rho: 1000, cp: 500 }],
    bodies: [{ id: 'b', shape: 'rect', material: 'a', x: 0, y: 0, w: 3, h: 2, power: 2 }],
    boundaries: [
      { id: 'all', target: 'exterior', type: 'convection', h: 5, Tinf: 20 },
      { id: 'l', target: 'left', type: 'temperature', T: 50 },
    ],
  });
  const msh = gmshMsh(model);
  assert.match(msh, /\$Nodes\n12\n/);
  const bdf = nastranBdf(model);
  assert.equal(bdf.split('\n').filter((l) => l.startsWith('CQUAD4')).length, 6);
  // Left edge: 2 faces → 3 fixed nodes; the remaining outside faces (2 bottom, 2 top... 3+3+2 right) convect.
  assert.equal(bdf.split('\n').filter((l) => /^SPC,1,\d+,1,/.test(l)).length, 3);
  assert.equal(bdf.split('\n').filter((l) => l.startsWith('CONV,')).length, 3 + 3 + 2);
  const cdb = ansysCdb(model);
  assert.equal(cdb.split('\n').filter((l) => l.startsWith('D,')).length, 3);
  assert.equal(cdb.split('\n').filter((l) => l.includes(',CONV,1,')).length, 8);
  // QVOL: 2 W over 3×2 cells of 1 mm × 1 mm × 10 mm.
  const q = Number(cdb.split('\n').find((l) => l.startsWith('BFE,')).split(',')[4]);
  assert.ok(Math.abs(q - 2 / (6 * 1e-8)) / q < 1e-9);
});

/** Result bytes like the engine's: 2×2 grid, one void cell, two T frames, a heat flux. */
function fakeResult(dim = 2) {
  const grid = dim === 3 ? { dim: 3, nx: 2, ny: 2, nz: 2, dx: 1, dy: 1, dz: 0.5 } : { dim: 2, nx: 2, ny: 2, nz: 1, dx: 1, dy: 1, dz: 1 };
  const cells = grid.nx * grid.ny * (dim === 3 ? grid.nz : 1);
  const mat = Array.from({ length: cells }, (_, i) => (i === 1 ? 255 : 0));
  const T = Array.from({ length: 2 * cells }, (_, i) => 20 + i);
  const qx = Array.from({ length: cells }, () => 3);
  const qy = Array.from({ length: cells }, () => 4);
  const header = { ok: true, grid, materials: ['al'], times: [0, 1], fields: {
    mat: { offset: 0, length: cells, frames: 1 }, T: { offset: cells, length: cells, frames: 2 }, qx: { offset: 3 * cells, length: cells, frames: 1 }, qy: { offset: 4 * cells, length: cells, frames: 1 },
  } };
  let json = JSON.stringify(header);
  while (json.length % 4) json += ' ';
  const data = new Float32Array([...mat, ...T, ...qx, ...qy]);
  const bytes = new Uint8Array(8 + json.length + data.byteLength);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, MAGIC, true);
  view.setUint32(4, json.length, true);
  bytes.set(new TextEncoder().encode(json), 8);
  bytes.set(new Uint8Array(data.buffer), 8 + json.length);
  return decodeResult(bytes.buffer);
}

for (const dim of [2, 3]) {
  test(`VTK XML result (${dim}D)`, () => {
    const vtu = resultVtu(fakeResult(dim), 'test -- title');
    clean(vtu);
    const arr = (name) => vtu.match(new RegExp(`Name="${name}"[^>]*>([^<]*)<`))[1].trim().split(/\s+/).map(Number);
    const cells = Number(vtu.match(/NumberOfCells="(\d+)"/)[1]);
    const points = Number(vtu.match(/NumberOfPoints="(\d+)"/)[1]);
    const per = dim === 3 ? 8 : 4;
    assert.equal(cells, dim === 3 ? 7 : 3, 'void cell skipped');
    assert.equal(points, dim === 3 ? 26 : 8);
    const conn = arr('connectivity');
    const offsets = arr('offsets');
    const types = arr('types');
    assert.equal(conn.length, cells * per);
    assert.equal(offsets.length, cells);
    assert.equal(offsets[offsets.length - 1], conn.length);
    assert.equal(types.length, cells);
    assert.ok(types.every((t) => t === (dim === 3 ? 12 : 9)));
    assert.ok(conn.every((n) => n >= 0 && n < points));
    const T = arr('T');
    assert.equal(T.length, cells);
    assert.equal(T[0], 20 + (dim === 3 ? 8 : 4), 'last frame');
    assert.ok(arr('heatFluxMagnitude').every((v) => v === 5));
    assert.equal(arr('heatFlux').length, 3 * cells);
    assert.ok(!vtu.includes('test -- title'), 'comment-safe title');
  });
}

test('STL of one rectangle: 12 unit-normal facets, outward', () => {
  const model = normalizeModel({ domain: { dim: 2, width: 10, height: 10, depth: 5 }, materials: [{ id: 'a' }], bodies: [{ shape: 'rect', name: 'Box', material: 'a', x: 1, y: 2, w: 3, h: 4 }] });
  const stl = modelStl(model);
  const facets = [...stl.matchAll(/facet normal (\S+) (\S+) (\S+)\s+outer loop\s+vertex (\S+) (\S+) (\S+)\s+vertex (\S+) (\S+) (\S+)\s+vertex (\S+) (\S+) (\S+)/g)].map((m) => m.slice(1).map(Number));
  assert.equal(facets.length, 12);
  assert.match(stl, /^solid Box$/m);
  for (const f of facets) {
    assert.ok(Math.abs(Math.hypot(f[0], f[1], f[2]) - 1) < 1e-12);
    // The normal points away from the box centre (2.5, 4, 2.5).
    const cx = (f[3] + f[6] + f[9]) / 3 - 2.5;
    const cy = (f[4] + f[7] + f[10]) / 3 - 4;
    const cz = (f[5] + f[8] + f[11]) / 3 - 2.5;
    assert.ok(f[0] * cx + f[1] * cy + f[2] * cz > 0);
  }
  // A circle is a 48-sided prism: 2·46 cap triangles + 2·48 side triangles.
  const circle = modelStl({ ...model, bodies: [{ shape: 'circle', material: 'a', cx: 5, cy: 5, r: 2 }] });
  assert.equal((circle.match(/facet normal/g) ?? []).length, 2 * 46 + 2 * 48);
  // A concave polygon (L shape) caps with n − 2 triangles that cover its area.
  const L = [[0, 0], [4, 0], [4, 1], [1, 1], [1, 3], [0, 3]];
  const tris = triangulate(L);
  assert.equal(tris.length, 4);
  const area = tris.reduce((s, [a, b, c]) => s + ((L[b][0] - L[a][0]) * (L[c][1] - L[a][1]) - (L[b][1] - L[a][1]) * (L[c][0] - L[a][0])) / 2, 0);
  assert.ok(Math.abs(area - 6) < 1e-12);
});

test('DXF round trip of circles and polygons', () => {
  const model = normalizeModel({
    domain: { width: 50, height: 50 }, materials: [{ id: 'a' }],
    bodies: [{ shape: 'circle', name: 'Pipe', material: 'a', cx: 10.125, cy: 20.5, r: 3.3 }, { shape: 'polygon', name: '한글 이름', material: 'a', points: [[0, 0], [5, 0], [2.5, 4.123456789]] }],
  });
  const dxf = dxfFromModel(model);
  assert.match(dxf, /\$INSUNITS\n70\n4/);
  const { bodies } = bodiesFromDxf(dxf);
  assert.equal(bodies[0].shape, 'circle');
  assert.equal(bodies[0].r, 3.3);
  assert.equal(bodies[1].shape, 'polygon');
  assert.deepEqual(bodies[1].points, model.bodies[1].points);
});

const THERM_SNIPPET = `<?xml version="1.0" encoding="UTF-8"?>
<ThermModel>
  <Title>Wall &amp; frame</Title>
  <Units>SI</Units>
  <Materials>
    <Material Name="Aluminum (anodized)" Type="0" Conductivity="160" EmissivityFront="0.8" EmissivityBack="0.8" RGBColor="0x808080"/>
    <Material>
      <Name>Insulation</Name>
      <Conductivity>0.035</Conductivity>
    </Material>
  </Materials>
  <BoundaryConditions>
    <BoundaryCondition Name="Exterior" H="25" Temperature="-10" ConvectionFlag="1" RadiationFlag="0"/>
    <BoundaryCondition Name="Adiabatic" H="0" ConvectionFlag="0"/>
  </BoundaryConditions>
  <Polygons>
    <Polygon ID="1" Material="Aluminum (anodized)" units="mm">
      <Point index="0" x="100" y="50"/><Point index="1" x="110" y="50"/><Point index="2" x="110" y="90"/><Point index="3" x="100" y="90"/>
    </Polygon>
    <polygon id="2" material="Insulation">
      <point x="110" y="50"/><point x="150" y="50"/><point x="150" y="90"/><point x="110" y="90"/>
    </polygon>
  </Polygons>
  <Boundaries>
    <BCPolygon ID="1" BC="Exterior" units="mm"><Point index="0" x="100" y="50"/><Point index="1" x="100" y="90"/></BCPolygon>
    <BCPolygon ID="2" BC="Adiabatic"><Point x="110" y="90"/><Point x="150" y="90"/></BCPolygon>
  </Boundaries>
</ThermModel>`;

test('THERM 7 snippet parses into a solvable 2D model', () => {
  const model = thermToModel(THERM_SNIPPET, { language: 'en' });
  assert.equal(model.name, 'Wall & frame');
  assert.equal(model.domain.dim, 2);
  assert.equal(model.domain.width, 50);
  assert.equal(model.domain.height, 40);
  assert.equal(model.domain.background, null);
  assert.equal(model.domain.depth, 1000);
  assert.ok(model.domain.nx >= 10, 'the 10 mm wide polygon gets at least two cells');
  assert.equal(model.bodies.length, 2);
  assert.deepEqual(bodyBounds(model.bodies[0]), { x0: 0, y0: 0, x1: 10, y1: 40 });
  assert.equal(model.bodies[0].shape, 'rect');
  const k = Object.fromEntries(model.materials.map((m) => [m.name, m.k]));
  assert.deepEqual(k, { 'Aluminum (anodized)': 160, Insulation: 0.035 });
  assert.ok(model.materials.every((m) => m.rho > 0 && m.cp > 0));
  const ext = model.boundaries.find((bc) => bc.name === 'Exterior');
  assert.equal(ext.type, 'convection');
  assert.equal(ext.h, 25);
  assert.equal(ext.Tinf, -10);
  assert.equal(ext.target, 'left');
  const adi = model.boundaries.find((bc) => bc.name === 'Adiabatic');
  assert.equal(adi.type, 'adiabatic');
  assert.equal(adi.target, 'top');
  assert.deepEqual(adi.range, [10, 50]);
  assert.throws(() => thermToModel('<ThermModel/>'), /no polygons/);
});

test('THERM write → read round trip', () => {
  const model = normalizeModel({
    name: 'Section',
    domain: { dim: 2, width: 60, height: 40, nx: 60, ny: 40, background: null },
    materials: [{ id: 'al', name: 'Aluminium', k: 160, rho: 2700, cp: 900 }, { id: 'ins', name: 'Insulation', k: 0.04, rho: 30, cp: 1400 }, { id: 'gl', name: 'Glass', k: 1, rho: 2500, cp: 840 }],
    bodies: [
      { id: 'a', name: 'Frame', shape: 'rect', material: 'al', x: 0, y: 0, w: 20, h: 40 },
      { id: 'b', name: 'Core', shape: 'polygon', material: 'ins', points: [[20, 0], [60, 0], [60, 40], [20, 30]] },
      { id: 'c', name: 'Rod', shape: 'circle', material: 'gl', cx: 10, cy: 20, r: 4 },
    ],
    boundaries: [
      { id: 'in', name: 'Interior', target: 'left', type: 'convection', h: 7.7, Tinf: 21 },
      { id: 'out', name: 'Exterior', target: 'right', type: 'temperature', T: -18 },
      { id: 'sun', name: 'Sun', target: 'body:b', type: 'flux', q: 300, region: [20, 29, 60, 41] },
    ],
  });
  const xml = modelToTherm(model);
  clean(xml);
  const back = thermToModel(xml, { language: 'en' });
  assert.equal(back.bodies.length, 3);
  back.bodies.forEach((b, i) => {
    const x = bodyBounds(b);
    const y = bodyBounds(model.bodies[i]);
    for (const key of ['x0', 'y0', 'x1', 'y1']) assert.ok(Math.abs(x[key] - y[key]) < 1e-6, `${i} ${key}`);
  });
  assert.equal(back.bodies[0].shape, 'rect');
  assert.equal(back.bodies[1].points.length, 4);
  assert.equal(back.bodies[2].points.length, 48);
  for (const m of model.materials) {
    const again = back.materials.find((x) => x.name === m.name);
    assert.equal(again.k, m.k);
    assert.equal(again.rho, m.rho);
  }
  const byName = (name) => back.boundaries.filter((bc) => bc.name === name);
  assert.ok(byName('Interior').length && byName('Interior').every((bc) => bc.type === 'convection' && bc.h === 7.7 && bc.Tinf === 21 && bc.target === 'left'));
  assert.ok(byName('Exterior').length && byName('Exterior').every((bc) => bc.type === 'temperature' && bc.T === -18 && bc.target === 'right'));
  const sun = byName('Sun');
  assert.equal(sun.length, 1);
  assert.equal(sun[0].type, 'flux');
  assert.equal(sun[0].q, 300);
  assert.match(sun[0].target, /^body:/);
  assert.equal(back.bodies.find((b) => `body:${b.id}` === sun[0].target).material, back.materials.find((m) => m.name === 'Insulation').id);
  // Unassigned exterior edges (bottom, top of the frame) are adiabatic, as THERM requires.
  assert.ok(back.boundaries.some((bc) => bc.type === 'adiabatic' && bc.target === 'bottom'));
  // The tutorial sample (exterior BCs with regions) also survives with its types.
  const tut = sampleModel('tutorial', 'en');
  const again = thermToModel(modelToTherm(tut), { language: 'en' });
  assert.equal(again.bodies.length, tut.bodies.length);
  assert.ok(new Set(again.boundaries.map((bc) => bc.type)).has('convection'));
  assert.ok(again.boundaries.some((bc) => bc.name === 'Fan air') && again.boundaries.some((bc) => bc.name === 'Air round the board'));
});

test('Gmsh import of triangles, holes and a foreign mesh without physical names', () => {
  // A 2×2 square of four triangle pairs minus nothing, plus a separate square: elementary tags only.
  const msh = ['$MeshFormat', '2.2 0 8', '$EndMeshFormat', '$Nodes', '8',
    '1 10 10 0', '2 12 10 0', '3 12 12 0', '4 10 12 0', '5 13 10 0', '6 14 10 0', '7 14 11 0', '8 13 11 0', '$EndNodes',
    '$Elements', '4', '1 2 2 0 7 1 2 3', '2 2 2 0 7 1 3 4', '3 3 2 0 9 5 6 7 8', '4 1 2 0 3 1 2', '$EndElements', ''].join('\n');
  const { model, warnings } = gmshToModel(msh, { language: 'en' });
  assert.equal(model.domain.width, 4);
  assert.equal(model.domain.height, 2);
  assert.equal(model.bodies.length, 2);
  assert.deepEqual(bodyBounds(model.bodies[0]), { x0: 0, y0: 0, x1: 2, y1: 2 });
  assert.equal(model.bodies[0].shape, 'rect');
  assert.equal(model.boundaries.length, 1);
  assert.equal(model.boundaries[0].target, 'bottom');
  assert.ok(warnings.some((w) => /default values/.test(w)));
  // A ring: the hole is reported.
  const cells = [];
  const nodes = [];
  const id = (i, j) => 1 + i + 4 * j;
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) nodes.push(`${id(i, j)} ${i} ${j} 0`);
  for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) if (!(i === 1 && j === 1)) cells.push(`${id(i, j)} ${id(i + 1, j)} ${id(i + 1, j + 1)} ${id(i, j + 1)}`);
  const ring = ['$MeshFormat', '2.2 0 8', '$EndMeshFormat', '$PhysicalNames', '1', '2 1 "copper"', '$EndPhysicalNames', '$Nodes', String(nodes.length), ...nodes, '$EndNodes',
    '$Elements', String(cells.length), ...cells.map((c, n) => `${n + 1} 3 2 1 1 ${c}`), '$EndElements'].join('\n');
  const r = gmshToModel(ring, { language: 'en' });
  assert.equal(r.model.bodies.length, 1);
  assert.equal(r.model.materials[0].k, materialFromLibrary('copper').k, 'library material by id');
  assert.equal(r.model.materials[0].id, 'copper');
  assert.ok(r.warnings.some((w) => /hole/.test(w)));
  assert.throws(() => gmshToModel('$MeshFormat\n4.1 0 8\n$EndMeshFormat'), /MSH 4/);
  assert.throws(() => gmshToModel('hello'), /not a Gmsh/);
});
