// Modeling tools: bevel with segments, vertex bevel, region inset, the knife, quadric decimation, projection, symmetry and fonts.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { addObject, createDocument, createDefaultScene, evaluatedMesh } from '../../src/core/doc.js';
import { cubeMesh, edgeMap, faceNormal, gridMesh, icoSphereMesh, isManifold, selectAll, signedVolume, triangulateIndices, uvSphereMesh, v3 } from '../../src/core/mesh.js';
import * as ops from '../../src/core/meshops.js';
import { bevelVerts, decimatePlanar, decimateQuadric, insetRegion, knifeCut, projectOntoMesh } from '../../src/core/meshtools.js';
import { applyModifier, createModifier } from '../../src/core/modifiers.js';
import { run } from '../../src/core/ops.js';
import { sculptDab } from '../../src/core/sculpt.js';
import { setFallbackFont, setMissingFontHook, textToMesh } from '../../src/core/text3d.js';
import { getFont, parseFont, registerFont } from '../../src/core/ttf.js';
import { History } from '../../src/core/history.js';

const closed = (m) => [...edgeMap(m).values()].every((e) => e.faces.length === 2);
const allSelected = (m) => { m.selMode = 'vert'; selectAll(m); return m; };

describe('bevel', () => {
  test('segments round a cube: closed, outward, and smaller by what a round corner takes off', () => {
    const volumes = [];
    for (const segments of [1, 2, 4, 8]) {
      const m = allSelected(cubeMesh(2));
      ops.bevelEdges(m, 0.3, { segments, profile: 0.5 });
      assert.ok(closed(m), `${segments}: no open edges`);
      const v = signedVolume(m);
      assert.ok(v > 0 && v < 8, `${segments}: ${v}`);
      volumes.push(v);
    }
    // More segments keep more of the corner: from the flat chamfer towards the round.
    assert.ok(volumes[1] > volumes[0] && volumes[3] > volumes[1], volumes.join());
    const round = 8 - 12 * (0.3 * 0.3 - (Math.PI * 0.3 * 0.3) / 4) * 1;
    assert.ok(Math.abs(volumes[3] - round) < 0.15, `${volumes[3]} against ${round}`);
  });
  test('the number of faces grows with the segments', () => {
    const one = allSelected(cubeMesh(2));
    ops.bevelEdges(one, 0.2);
    assert.equal(one.faces.length, 6 + 12 + 8, 'six faces, twelve strips, eight corners');
    const three = allSelected(cubeMesh(2));
    ops.bevelEdges(three, 0.2, { segments: 3 });
    assert.ok(three.faces.length >= 6 + 36 + 8 * 9, `${three.faces.length}`);
  });
  test('profile 0 is flat, 0.5 bulges, and a single edge stays closed', () => {
    const flat = allSelected(cubeMesh(2));
    ops.bevelEdges(flat, 0.3, { segments: 4, profile: 0 });
    const round = allSelected(cubeMesh(2));
    ops.bevelEdges(round, 0.3, { segments: 4, profile: 0.5 });
    assert.ok(signedVolume(round) > signedVolume(flat));
    const single = cubeMesh(2);
    single.selMode = 'edge';
    const e = [...edgeMap(single).values()][0];
    single.selV = [e.a, e.b];
    ops.bevelEdges(single, 0.2, { segments: 3 });
    assert.ok(closed(single));
    assert.ok(signedVolume(single) > 7.9 && signedVolume(single) < 8);
  });
  test('vertex bevel cuts the corners off exactly', () => {
    const m = allSelected(cubeMesh(2));
    bevelVerts(m, 0.5);
    assert.ok(closed(m));
    assert.equal(m.faces.length, 6 + 8);
    // Each corner loses a pyramid with three legs of 0.5.
    assert.ok(Math.abs(signedVolume(m) - (8 - 8 * (0.5 ** 3 / 6))) < 1e-9);
  });
  test('the modifier passes segments and vertices on', () => {
    const edges = applyModifier(cubeMesh(2), { ...createModifier('BEVEL'), width: 0.2, segments: 3 });
    assert.ok(edges.faces.length > 30 && closed(edges));
    const verts = applyModifier(cubeMesh(2), { ...createModifier('BEVEL'), width: 0.2, affect: 'VERTICES' });
    assert.equal(verts.faces.length, 14);
  });
});

describe('region inset', () => {
  test('neighbouring faces inset as one: the shared edge stays inside, and the outline moves by the thickness', () => {
    const m = gridMesh(2, 1, 2);
    m.selMode = 'face';
    m.selF = [0, 1];
    m.selV = [...new Set(m.faces.flat())];
    const before = m.faces.length;
    insetRegion(m, 0.1);
    assert.equal(m.faces.length, before + 6, 'one wall per outline edge');
    const xs = m.faces[0].concat(m.faces[1]).map((v) => m.verts[v][0]);
    const width = Math.max(...xs) - Math.min(...xs);
    assert.ok(Math.abs(width - (2 - 0.2)) < 1e-9, String(width));
  });
  test('depth lifts the region and the mesh stays one piece', () => {
    const m = cubeMesh(2);
    m.selMode = 'face';
    m.selF = [0];
    m.selV = [...m.faces[0]];
    const n = faceNormal(m, m.faces[0]);
    insetRegion(m, 0.2, 0.5);
    assert.ok(closed(m));
    assert.ok(signedVolume(m) > 8, 'lifted outward');
    assert.ok(v3.len(n) > 0);
  });
});

describe('knife', () => {
  // Looking straight down at a plane: x and y are the screen, with y down so that a face seen from above runs clockwise.
  const top = (v) => [v[0], -v[1]];
  test('a line across a quad splits it, and its neighbour takes the new vertex without a crack', () => {
    const m = gridMesh(2, 1, 2);
    const faces = m.faces.length;
    const cut = knifeCut(m, [[-0.5, -2], [-0.5, 2]], top);
    assert.equal(cut, 1);
    assert.equal(m.faces.length, faces + 1);
    assert.equal(m.verts.length, 8);
    // No edge is used by faces that disagree: every inner edge has two faces, the outline one.
    const counts = [...edgeMap(m).values()].map((e) => e.faces.length);
    assert.ok(counts.every((n) => n === 1 || n === 2));
    assert.equal(counts.filter((n) => n === 2).length, 2);
  });
  test('a cut through a cube keeps it closed and its volume', () => {
    const m = cubeMesh(2);
    const cut = knifeCut(m, [[0.2, -3], [0.2, 3]], top, { through: true });
    assert.equal(cut, 4, 'the four faces it crosses');
    assert.ok(closed(m));
    assert.ok(Math.abs(signedVolume(m) - 8) < 1e-9);
  });
  test('without through, only the near side is cut', () => {
    const m = cubeMesh(2);
    const cut = knifeCut(m, [[0.2, -3], [0.2, 3]], top);
    assert.equal(cut, 1, 'only the top');
    assert.ok(closed(m), 'the sides take the vertices, so nothing opens');
  });
  test('a line that crosses nothing changes nothing', () => {
    const m = cubeMesh(2);
    assert.equal(knifeCut(m, [[5, 5], [6, 6]], top), 0);
    assert.equal(m.verts.length, 8);
  });
  test('UVs are carried to the new corners', () => {
    const m = gridMesh(1, 1, 2);
    m.uvs = m.faces.map((f) => f.map((v) => [(m.verts[v][0] + 1) / 2, (m.verts[v][1] + 1) / 2]));
    knifeCut(m, [[0, -2], [0, 2]], top);
    m.faces.forEach((f, i) => f.forEach((v, k) => {
      assert.ok(Math.abs(m.uvs[i][k][0] - (m.verts[v][0] + 1) / 2) < 1e-9);
    }));
  });
});

describe('decimate', () => {
  test('quadric error reaches the target and holds a sphere better than the shape needs', () => {
    const sphere = uvSphereMesh(48, 24, 1);
    const tris = triangulateIndices(sphere).length;
    const out = decimateQuadric(sphere, 0.2);
    assert.ok(out.faces.length <= tris * 0.2 + 2, `${out.faces.length} of ${tris}`);
    assert.ok(closed(out), 'still closed');
    for (const v of out.verts) assert.ok(Math.abs(v3.len(v) - 1) < 0.06, 'still near the surface');
    const before = signedVolume(sphere);
    assert.ok(Math.abs(signedVolume(out) - before) / before < 0.06, 'the volume holds');
  });
  test('flat parts go first: a subdivided cube keeps its corners', () => {
    let m = allSelected(cubeMesh(2));
    ops.subdivideFaces(m, 4);
    m = decimateQuadric(m, 0.05);
    for (const corner of [[1, 1, 1], [-1, -1, -1], [1, -1, 1]]) assert.ok(m.verts.some((v) => v3.dist(v, corner) < 1e-6), corner.join());
    assert.ok(Math.abs(signedVolume(m) - 8) < 1e-6);
  });
  test('an open border stays where it is', () => {
    const m = decimateQuadric(gridMesh(10, 10, 2), 0.2);
    const xs = m.verts.map((v) => v[0]);
    assert.ok(Math.abs(Math.min(...xs) + 1) < 1e-9 && Math.abs(Math.max(...xs) - 1) < 1e-9);
  });
  test('planar merges flat neighbours into one face and leaves bends alone', () => {
    let m = allSelected(cubeMesh(2));
    ops.subdivideFaces(m, 2);
    m = decimatePlanar(m, 5);
    assert.equal(m.faces.length, 6);
    assert.equal(m.verts.length, 8);
    assert.ok(Math.abs(signedVolume(m) - 8) < 1e-9);
  });
  test('the modifier chooses the mode', () => {
    assert.ok(applyModifier(icoSphereMesh(1, 1), { ...createModifier('DECIMATE'), ratio: 0.5 }).faces.length <= 41);
    let box = allSelected(cubeMesh(2));
    ops.subdivideFaces(box, 2);
    box = applyModifier(box, { ...createModifier('DECIMATE'), mode: 'PLANAR', angle: 5 });
    assert.equal(box.faces.length, 6);
  });
});

describe('shrinkwrap modes', () => {
  const plane = () => ({ ...gridMesh(4, 4, 8), verts: gridMesh(4, 4, 8).verts.map((v) => [v[0], v[1], v[2] + 2]) });
  test('project goes along the axis, and only the way it is told', () => {
    const [up] = projectOntoMesh([[0.1, 0.1, 0]], plane(), 'Z');
    assert.ok(Math.abs(up[2] - 2) < 1e-9 && up[0] === 0.1);
    const [kept] = projectOntoMesh([[0.1, 0.1, 0]], plane(), 'Z', { positive: false });
    assert.equal(kept[2], 0);
    const [miss] = projectOntoMesh([[50, 0, 0]], plane(), 'Z');
    assert.equal(miss[2], 0, 'a ray that hits nothing stays');
  });
  test('the modifier: project and nearest vertex', () => {
    const target = plane();
    const mesh = cubeMesh(1);
    const projected = applyModifier(mesh, { ...createModifier('SHRINKWRAP'), object: 'x', mode: 'PROJECT' }, { meshInLocal: () => target });
    for (const v of projected.verts) assert.ok(Math.abs(v[2] - 2) < 1e-9);
    const nearest = applyModifier(mesh, { ...createModifier('SHRINKWRAP'), object: 'x', mode: 'NEAREST_VERTEX' }, { meshInLocal: () => target });
    for (const v of nearest.verts) assert.ok(target.verts.some((u) => v3.dist(u, v) < 1e-9));
  });
});

describe('sculpt symmetry', () => {
  test('each axis mirrors the dab, and all three make eight', () => {
    const count = (opts) => {
      const m = uvSphereMesh(32, 16, 1);
      const before = m.verts.map((v) => [...v]);
      sculptDab(m, 'DRAW', [0.57, 0.57, 0.57], { radius: 0.3, strength: 0.5, ...opts });
      const moved = m.verts.filter((v, i) => v3.dist(v, before[i]) > 1e-6);
      const octants = new Set(moved.map((v) => v.map((c) => (c > 0 ? 1 : 0)).join('')));
      return octants.size;
    };
    assert.equal(count({}), 1);
    assert.equal(count({ symmetryY: true }), 2);
    assert.equal(count({ symmetryZ: true }), 2);
    assert.equal(count({ symmetryX: true, symmetryY: true, symmetryZ: true }), 8);
  });
});

describe('fonts', () => {
  // A small TrueType file written here: .notdef, a Hangul square, an A with curves, and a composite made of the square.
  function buildFont() {
    const u16 = (v) => [(v >> 8) & 255, v & 255];
    const i16 = (v) => u16(v & 0xffff);
    const u32 = (v) => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
    const simple = (points, ends) => {
      const flags = points.map((p) => (p.on ? 1 : 0));
      const out = [...i16(ends.length), ...i16(0), ...i16(0), ...i16(1000), ...i16(1000)];
      for (const e of ends) out.push(...u16(e));
      out.push(...u16(0), ...flags);
      let last = 0;
      for (const p of points) { out.push(...i16(p.x - last)); last = p.x; }
      last = 0;
      for (const p of points) { out.push(...i16(p.y - last)); last = p.y; }
      if (out.length % 2) out.push(0);
      return out;
    };
    // Clockwise, as TrueType has its outer contours.
    const square = simple([{ x: 100, y: 100, on: true }, { x: 100, y: 900, on: true }, { x: 900, y: 900, on: true }, { x: 900, y: 100, on: true }], [3]);
    const curve = simple([{ x: 100, y: 0, on: true }, { x: 500, y: 1000, on: false }, { x: 900, y: 0, on: true }], [2]);
    const composite = [...i16(-1), ...i16(0), ...i16(0), ...i16(0), ...i16(0), ...u16(0x0003), ...u16(1), ...i16(1000), ...i16(0)];
    const glyphs = [[], square, curve, composite];
    const glyf = glyphs.flat();
    const loca = [];
    let at = 0;
    for (const g of glyphs) { loca.push(...u32(at)); at += g.length; }
    loca.push(...u32(at));
    const head = new Array(54).fill(0);
    head.splice(18, 2, ...u16(1000));
    head.splice(50, 2, ...i16(1));
    const hhea = new Array(36).fill(0);
    hhea.splice(4, 2, ...i16(800));
    hhea.splice(6, 2, ...i16(-200));
    hhea.splice(34, 2, ...u16(4));
    const hmtx = [[500, 0], [1000, 0], [1000, 0], [2000, 0]].flatMap(([w, l]) => [...u16(w), ...i16(l)]);
    const maxp = [...u32(0x10000), ...u16(4)];
    // Format 4 with three runs: A and B, the Hangul syllable, and the end mark.
    const codes = [[0x41, 0x42, 2 - 0x41], [0xac00, 0xac00, 1 - 0xac00], [0xffff, 0xffff, 1]];
    const seg = codes.length;
    const sub = [...u16(4), ...u16(16 + seg * 8), ...u16(0), ...u16(seg * 2), ...u16(0), ...u16(0), ...u16(0), ...codes.flatMap((c) => u16(c[1])), ...u16(0), ...codes.flatMap((c) => u16(c[0])), ...codes.flatMap((c) => i16(c[2])), ...codes.flatMap(() => u16(0))];
    const cmap = [...u16(0), ...u16(1), ...u16(3), ...u16(1), ...u32(12), ...sub];
    const tables = { cmap, glyf, head, hhea, hmtx, loca, maxp };
    const names = Object.keys(tables);
    let offset = 12 + names.length * 16;
    const directory = [];
    const body = [];
    for (const name of names) {
      const data = tables[name];
      directory.push(...[...name].map((c) => c.charCodeAt(0)), ...u32(0), ...u32(offset), ...u32(data.length));
      body.push(...data);
      const pad = (4 - (data.length % 4)) % 4;
      for (let i = 0; i < pad; i++) body.push(0);
      offset += data.length + pad;
    }
    return Uint8Array.from([...u32(0x10000), ...u16(names.length), ...u16(0), ...u16(0), ...u16(0), ...directory, ...body]);
  }
  test('a TrueType file: character map, widths, lines, curves and composites', () => {
    const font = parseFont(buildFont());
    assert.equal(font.unitsPerEm, 1000);
    assert.equal(font.glyphIndex(0xac00), 1);
    assert.equal(font.glyphIndex(0x41), 2);
    assert.equal(font.glyphIndex(0x42), 3);
    assert.equal(font.glyphIndex(0x43), 0);
    assert.equal(font.advance(3), 2000);
    assert.deepEqual(font.outline(1).map((c) => c.t), ['M', 'L', 'L', 'L', 'L', 'Z']);
    assert.ok(font.outline(2).some((c) => c.t === 'Q'), 'a curve');
    assert.equal(font.outline(3)[0].x, 1100, 'the part moved by its offset');
  });
  test('a text object draws Hangul in the chosen font, and the bundled typeface cannot', () => {
    registerFont('Test Face', parseFont(buildFont()));
    assert.ok(getFont('Test Face'));
    const m = textToMesh({ body: '가', size: 1, extrude: 0, align: 'LEFT', font: 'Test Face' });
    assert.ok(m.faces.length >= 2);
    const area = m.faces.reduce((s, f) => { const [a, b, c] = f.map((i) => m.verts[i]); return s + v3.len(v3.cross(v3.sub(b, a), v3.sub(c, a))) / 2; }, 0);
    assert.ok(Math.abs(area - 0.64) < 1e-6, `the 0.8 square: ${area}`);
    // Solid, and facing the viewer.
    const solid = textToMesh({ body: '가', size: 1, extrude: 0.5, align: 'LEFT', font: 'Test Face' });
    assert.ok(Math.abs(signedVolume(solid) - 0.32) < 1e-6, String(signedVolume(solid)));
    // Without a font, characters the bundled typeface lacks ask for one, and the program can answer.
    let asked = 0;
    setMissingFontHook(() => { asked++; });
    textToMesh({ body: '가', size: 1, extrude: 0, align: 'LEFT' });
    assert.equal(asked, 1);
    textToMesh({ body: 'Latin', size: 1, extrude: 0, align: 'LEFT' });
    assert.equal(asked, 1, 'Latin text does not need one');
    setFallbackFont('Test Face');
    const fallback = textToMesh({ body: '가', size: 1, extrude: 0, align: 'LEFT' });
    assert.ok(Math.abs(Math.max(...fallback.verts.map((v) => v[0])) - 0.9) < 1e-6, 'the fallback draws it');
    setFallbackFont(null);
    setMissingFontHook(null);
  });
  test('alignment, lines, spacing', () => {
    registerFont('Test Face', parseFont(buildFont()));
    const xs = (o) => textToMesh({ body: '가', size: 1, extrude: 0, align: 'LEFT', font: 'Test Face', ...o }).verts.map((v) => v[0]);
    assert.ok(Math.abs(Math.min(...xs({ align: 'CENTER' })) + 0.4) < 1e-6);
    assert.ok(Math.abs(Math.max(...xs({ align: 'RIGHT' })) + 0.1) < 1e-6);
    const two = textToMesh({ body: '가\\n가', size: 1, extrude: 0, align: 'LEFT', font: 'Test Face', lineHeight: 2 });
    const ys = two.verts.map((v) => v[1]);
    assert.ok(Math.abs(Math.min(...ys) - (-2 + 0.1)) < 1e-6, 'a second line');
    const spaced = xs({ body: '가가', spacing: 1 });
    assert.ok(Math.abs(Math.max(...spaced) - 2.9) < 1e-6, 'one em apart and one more');
  });
  test('what is not a font is refused', () => {
    assert.throws(() => parseFont(new Uint8Array(64)), /not a TrueType/);
  });
});

describe('snapping setting', () => {
  test('on, off and its target are in the document', () => {
    const doc = createDocument();
    addObject(doc, { type: 'MESH', name: 'Cube', data: cubeMesh(2) });
    const ctx = { doc, history: new History(8), lastOp: null, notify: () => {}, undo: () => {} };
    ctx.history.reset(doc);
    assert.equal(doc.snap.enabled, false);
    run(ctx, 'view3d.toggle_snap', {});
    assert.equal(ctx.doc.snap.enabled, true);
    run(ctx, 'view3d.snap_target', { target: 'VERTEX' });
    assert.equal(ctx.doc.snap.target, 'VERTEX');
    void createDefaultScene; void evaluatedMesh; void isManifold;
  });
});
