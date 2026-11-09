// Import › Floor plan, the harder drawings: binary DXF, DWG (through a converter), curved walls, doors drawn
// without an arc (sliding / pocket / folding / double / blocks by name), tilted and scanned pictures, and
// names for the rooms found in a picture. Samples in samples/plans (scripts/make-plan-samples.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { readDxf, flattenDxf, dxfToPlan, layerStats, SKIP_LAYER, encodeBinaryDxf, isBinaryDxf, binaryValueType } from '../../src/io/plan-dxf.js';
import { recognizePlan, openingDefaults, blockKind, arcSpan } from '../../src/io/plan-recognize.js';
import { applyPlan, roomKindGuess, arcWallSegments } from '../../src/io/plan-build.js';
import { arcSegmentCount } from '../../src/io/plan-arc.js';
import { detectImageWalls, dominantAngle, rotateImage } from '../../src/io/plan-image.js';
import { dwgVersion, dwgToDxf, desktopDwgConverter, wasmDwgConverter, isDwgName } from '../../src/io/plan-dwg.js';
import { createProject, normalizeProject } from '../../src/engine/document.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const plans = path.join(root, 'samples', 'plans');
const near = (p, q, tol) => Math.hypot(p[0] - q[0], p[1] - q[1]) < tol;
const sameWall = (x, w, tol) => (near(x.a, w.a, tol) && near(x.b, w.b, tol)) || (near(x.a, w.b, tol) && near(x.b, w.a, tol));
const TAU = Math.PI * 2;
const norm = (a) => ((a % TAU) + TAU) % TAU;
const readPlan = (bytes) => {
  const doc = readDxf(bytes);
  const layers = new Set(layerStats(doc).filter((l) => !SKIP_LAYER.test(l.name)).map((l) => l.name));
  return dxfToPlan(flattenDxf(doc, { layers }), 0.001);
};
const centreOf = (r, op) => {
  const w = r.walls[op.wall]; const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
  return [w.a[0] + ((w.b[0] - w.a[0]) * op.offset) / L, w.a[1] + ((w.b[1] - w.a[1]) * op.offset) / L];
};

// ───────────────────────── 1. binary DXF

test('binary DXF: group codes (2 bytes, or 1 byte in R12) and typed values are read like ASCII DXF', () => {
  // Hand-made bytes: sentinel, then 0/SECTION 2/ENTITIES 0/LINE 8/A-WALL 10 20 11 21 (doubles) 62 (int16) 0/ENDSEC 0/EOF.
  const enc = new TextEncoder();
  const parts = [enc.encode('AutoCAD Binary DXF\r\n\x1a\0')];
  const code2 = (c) => { const b = new Uint8Array(2); new DataView(b.buffer).setInt16(0, c, true); return b; };
  const str = (s) => new Uint8Array([...enc.encode(s), 0]);
  const dbl = (v) => { const b = new Uint8Array(8); new DataView(b.buffer).setFloat64(0, v, true); return b; };
  const i16 = (v) => { const b = new Uint8Array(2); new DataView(b.buffer).setInt16(0, v, true); return b; };
  const pairs = [[0, str('SECTION')], [2, str('ENTITIES')], [0, str('LINE')], [8, str('벽')], [10, dbl(0)], [20, dbl(0)], [11, dbl(1500.5)], [21, dbl(-20)], [62, i16(3)], [0, str('ENDSEC')], [0, str('EOF')]];
  for (const [c, v] of pairs) parts.push(code2(c), v);
  const bytes = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let at = 0; for (const p of parts) { bytes.set(p, at); at += p.length; }
  assert.ok(isBinaryDxf(bytes));
  const doc = readDxf(bytes);
  assert.equal(doc.entities.length, 1);
  assert.deepEqual(doc.entities[0].b, [1500.5, -20]);
  assert.equal(doc.entities[0].layer, '벽');
  assert.equal(doc.entities[0].color, 3);
  // R12: one-byte codes (255 + two bytes for codes above 254).
  const r12 = [enc.encode('AutoCAD Binary DXF\r\n\x1a\0'), new Uint8Array([0]), str('SECTION'), new Uint8Array([2]), str('ENTITIES'), new Uint8Array([0]), str('LINE'), new Uint8Array([8]), str('0'),
    new Uint8Array([10]), dbl(1), new Uint8Array([20]), dbl(2), new Uint8Array([11]), dbl(3), new Uint8Array([21]), dbl(4), new Uint8Array([0]), str('ENDSEC'), new Uint8Array([0]), str('EOF')];
  const b12 = new Uint8Array(r12.reduce((s, p) => s + p.length, 0)); at = 0; for (const p of r12) { b12.set(p, at); at += p.length; }
  assert.deepEqual(readDxf(b12).entities[0].a, [1, 2]);
  // Value types of the group codes.
  assert.deepEqual([1, 10, 40, 62, 70, 90, 105, 160, 280, 290, 310, 330, 1004, 1040, 1071].map(binaryValueType), ['str', 'f64', 'f64', 'i16', 'i16', 'i32', 'str', 'i64', 'i16', 'bool', 'bin', 'str', 'bin', 'f64', 'i32']);
  // Cut off in the middle of a value: refused as damaged.
  assert.throws(() => readDxf(bytes.subarray(0, bytes.length - 30)), (e) => e.code === 'dxf-bad');
});

test('binary DXF: the 59 m² sample saved as binary gives the same plan as the ASCII one', () => {
  const ascii = fs.readFileSync(path.join(plans, 'apartment-59.dxf'));
  const binary = fs.readFileSync(path.join(plans, 'apartment-59-binary.dxf'));
  assert.ok(isBinaryDxf(binary) && !isBinaryDxf(ascii));
  const a = readPlan(ascii); const b = readPlan(binary);
  assert.equal(b.lines.length, a.lines.length);
  assert.equal(b.arcs.length, a.arcs.length);
  assert.deepEqual(b.texts.map((t) => t.text), a.texts.map((t) => t.text));
  const ra = recognizePlan(a); const rb = recognizePlan(b);
  assert.equal(rb.walls.length, 8);
  assert.deepEqual(rb.stats, ra.stats);
  for (const w of ra.walls) assert.ok(rb.walls.some((x) => sameWall(x, w, 1e-6)));
  // Round trip of the encoder used for the sample.
  assert.equal(readDxf(encodeBinaryDxf(ascii.toString('utf8'))).entities.length, readDxf(ascii).entities.length);
});

// ───────────────────────── 2. DWG through a converter

test('DWG: version mark, converters tried in order, advice when none is there', async () => {
  const dwg = new Uint8Array([...new TextEncoder().encode('AC1032'), 0, 0, 0, 0, 1, 2, 3]);
  assert.deepEqual(dwgVersion(dwg), { code: 'AC1032', release: '2018' });
  assert.equal(dwgVersion(new TextEncoder().encode('0\nSECTION')), null);
  assert.ok(isDwgName('plan.DWG') && !isDwgName('plan.dxf'));
  await assert.rejects(dwgToDxf(new TextEncoder().encode('not a dwg')), (e) => e.code === 'dwg-bad');
  const house = fs.readFileSync(path.join(plans, 'house-2room.dxf'));

  // Desktop backend: base64 both ways; "no-converter" means not installed (next one), other errors are kept.
  const calls = [];
  const desktop = desktopDwgConverter(async (cmd, args) => { calls.push([cmd, args]); return { dxf: Buffer.from(house).toString('base64'), converter: 'ODA File Converter' }; });
  const out = await dwgToDxf(dwg, { converters: [desktop] });
  assert.equal(calls[0][0], 'convert_dwg');
  assert.deepEqual([...Buffer.from(calls[0][1].data, 'base64')], [...dwg]);
  assert.equal(out.via, 'desktop');
  assert.equal(desktop.used, 'ODA File Converter');
  const r = recognizePlan(readPlan(out.dxf));
  assert.equal(r.walls.length, 8, 'the converted DXF goes through the DXF reader');

  // WebAssembly LibreDWG (optional): a stand-in Emscripten module with its file system.
  const files = new Map();
  let located = null;
  const factory = async ({ locateFile }) => {
    located = locateFile('libredwg-web.wasm');
    return {
      FS: { writeFile: (f, b) => files.set(f, b), readFile: (f) => files.get(f), unlink: (f) => files.delete(f), analyzePath: (f) => ({ exists: files.has(f) }) },
      dwg_write_dxf: (input, output) => { assert.deepEqual([...files.get(input)], [...dwg]); files.set(output, house); return 0; },
    };
  };
  const wasm = wasmDwgConverter({ load: async () => factory, locate: (f) => `library/dwg/${f}` });
  const noDesktop = desktopDwgConverter(async () => { throw 'no-converter'; });
  const viaWasm = await dwgToDxf(dwg, { converters: [noDesktop, wasm] });
  assert.equal(viaWasm.via, 'libredwg-wasm');
  assert.equal(located, 'library/dwg/libredwg-web.wasm');
  assert.equal(files.size, 0, 'temporary files removed');
  // A fatal LibreDWG error (≥ 128) is reported, warnings (< 128) are not.
  const failing = wasmDwgConverter({ load: async () => async () => ({ FS: { writeFile: (f, b) => files.set(f, b), readFile: () => null, unlink: (f) => files.delete(f), analyzePath: (f) => ({ exists: files.has(f) }) }, dwg_write_dxf: () => 128 }), locate: (f) => f });

  // Nothing installed: the error says what was tried.
  const missing = wasmDwgConverter({ load: async () => { throw new Error('404'); }, locate: (f) => f });
  await assert.rejects(dwgToDxf(dwg, { converters: [noDesktop, missing] }), (e) => e.code === 'dwg-unavailable' && e.tried.length === 2 && e.tried.every((x) => x.error === 'not available') && e.version.release === '2018');
  await assert.rejects(dwgToDxf(dwg, { converters: [failing] }), (e) => e.code === 'dwg-unavailable' && /error 128/.test(e.tried[0].error));
  const broken = desktopDwgConverter(async () => { throw 'ODAFileConverter.exe made no DXF'; });
  await assert.rejects(dwgToDxf(dwg, { converters: [broken] }), (e) => /made no DXF/.test(e.message));
});

// ───────────────────────── 3. curved walls

test('arc walls: pieces of at most 0.3 m with a chord error of at most 1 cm', () => {
  for (const r of [0.5, 1, 2.5, 8, 40]) {
    for (const sweep of [0.3, Math.PI / 2, Math.PI, 5]) {
      const segs = arcWallSegments([1, 2], r, 0.4, 0.4 + sweep);
      assert.equal(segs.length, arcSegmentCount(r, sweep));
      for (const s of segs) {
        const L = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]);
        assert.ok(L <= 0.3 + 1e-9, `piece ${L} (r ${r})`);
        const mid = [(s.a[0] + s.b[0]) / 2, (s.a[1] + s.b[1]) / 2];
        assert.ok(r - Math.hypot(mid[0] - 1, mid[1] - 2) <= 0.01 + 1e-9, 'chord error');
      }
      assert.ok(near(segs[0].a, [1 + r * Math.cos(0.4), 2 + r * Math.sin(0.4)], 1e-9));
      for (let i = 1; i < segs.length; i++) assert.deepEqual(segs[i].a, segs[i - 1].b, 'end to end');
    }
  }
  // Arcs in plan axes start where their sweep starts (DXF arcs are mirrored by z = −y).
  assert.deepEqual(arcSpan({ c: [0, 0], r: 1, p0: [0, 1], p1: [1, 0], sweep: Math.PI / 2 }), { start: 0, ext: Math.PI / 2 });
});

test('sample living-curved.dxf: concentric arcs (ARC and bulged polyline) become chains of straight walls', () => {
  const expected = JSON.parse(fs.readFileSync(path.join(plans, 'living-curved.expected.json'), 'utf8'));
  const plan = readPlan(fs.readFileSync(path.join(plans, 'living-curved.dxf')));
  const r = recognizePlan(plan);
  const straight = r.walls.filter((w) => !w.curve);
  assert.equal(straight.length, expected.walls.length, 'straight walls');
  for (const w of expected.walls) {
    const hit = straight.find((x) => sameWall(x, w, 0.005));
    assert.ok(hit, `wall ${JSON.stringify(w)}`);
    assert.ok(Math.abs(hit.thickness - w.thickness) < 0.002);
  }
  // One chain per arc, every piece carrying the whole arc.
  const chains = new Map();
  for (const w of r.walls) if (w.curve) chains.set(w.curve.id, [...(chains.get(w.curve.id) ?? []), w]);
  assert.equal(chains.size, expected.curves.length, 'curved walls');
  assert.equal(r.stats.curves, 2);
  for (const e of expected.curves) {
    const chain = [...chains.values()].find((c) => near([c[0].curve.cx, c[0].curve.cz], e.c, 0.005));
    assert.ok(chain, `curve around ${e.c}`);
    const { curve } = chain[0];
    assert.ok(Math.abs(curve.r - e.r) < 0.005 && Math.abs(chain[0].thickness - e.thickness) < 0.002);
    assert.ok(Math.abs(norm(curve.a0) - norm(e.a0)) < 0.01 && Math.abs((curve.a1 - curve.a0) - (e.a1 - e.a0)) < 0.01, `angles ${curve.a0}…${curve.a1}`);
    // Pieces end to end, on the circle; at most 0.3 m and 1 cm off the arc except the window's own piece.
    for (let i = 1; i < chain.length; i++) assert.ok(near(chain[i].a, chain[i - 1].b, 1e-9));
    for (const w of chain) {
      for (const p of [w.a, w.b]) assert.ok(Math.abs(Math.hypot(p[0] - curve.cx, p[1] - curve.cz) - curve.r) < 1e-6);
      const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
      const hasOpening = r.openings.some((op) => r.walls[op.wall] === w);
      if (!hasOpening) assert.ok(L <= 0.3 + 1e-9 && curve.r * (1 - Math.cos(L / (2 * curve.r))) <= 0.01 + 1e-9, `piece ${L}`);
    }
    // The chain ends exactly on the straight walls it runs into (rooms close).
    for (const end of [chain[0].a, chain.at(-1).b]) assert.ok(straight.some((w) => near(w.a, end, 1e-9) || near(w.b, end, 1e-9)), `chain end ${end}`);
  }
  // Openings, the window in the curve on a straight piece of its own (its centre lies on the chord).
  assert.equal(r.openings.length, expected.openings.length);
  for (const e of expected.openings) {
    const tol = e.curved ? 2.5 * (1 - Math.cos(e.width / 5)) + 0.01 : 0.03;
    const hit = r.openings.find((op) => near(centreOf(r, op), e.center, tol));
    assert.ok(hit, `opening ${JSON.stringify(e)}`);
    assert.equal(hit.kind, e.kind);
    assert.ok(Math.abs(hit.width - e.width) < 0.02, `width ${hit.width} ≠ ${e.width}`);
    if (e.kind === 'door') assert.deepEqual([hit.side, hit.hinge], [e.side, e.hinge]);
    if (e.curved) assert.ok(r.walls[hit.wall].curve, 'the curved window is on a piece of the arc');
  }
  // Into a project: both rooms close (one bounded by the half circle), the arc walls keep their curve.
  const p = createProject();
  const applied = applyPlan(p, { ...r, texts: plan.texts });
  assert.equal(applied.rooms, expected.rooms);
  assert.deepEqual(p.rooms.map((x) => x.name).sort(), ['거실', '침실']);
  const living = p.rooms.find((x) => x.name === '거실');
  assert.ok(living.points.length > 20, 'the living room follows the curve');
  const ids = new Set(p.walls.filter((w) => w.curve).map((w) => w.curve.id));
  assert.equal(ids.size, 2);
  assert.ok(p.walls.filter((w) => w.curve).every((w) => Math.abs(Math.hypot(w.a[0] - w.curve.cx, w.a[1] - w.curve.cz) - w.curve.r) < 1e-6), 'the curve moves with the plan');
  assert.equal(p.openings.filter((o) => o.item === 'door-entrance').length, 1);
  assert.ok(normalizeProject(JSON.parse(JSON.stringify(p))).walls.filter((w) => w.curve).length === p.walls.filter((w) => w.curve).length, 'curve survives a save/load');
  assert.equal(r.leftovers.length, 0, 'no arc left over as reference lines');
});

// ───────────────────────── 4. doors without arcs

test('door and window blocks by name, items for doors without a swing', () => {
  assert.deepEqual(blockKind('DOOR-900'), { kind: 'door' });
  assert.deepEqual(blockKind('D1'), { kind: 'door' });
  assert.deepEqual(blockKind('문-01'), { kind: 'door' });
  assert.deepEqual(blockKind('PLAN|SLIDING DOOR'), { kind: 'sliding' });
  assert.deepEqual(blockKind('포켓문'), { kind: 'pocket' });
  assert.deepEqual(blockKind('FOLDING_DOOR'), { kind: 'folding' });
  assert.deepEqual(blockKind('양개문'), { kind: 'double' });
  assert.deepEqual(blockKind('창-01'), { kind: 'window' });
  assert.deepEqual(blockKind('W-SLIDING'), { kind: 'window', item: 'window-sliding' });
  assert.deepEqual(blockKind('미서기창'), { kind: 'window', item: 'window-sliding' });
  for (const name of ['DESK-1', 'BED-Q', 'SOFA-3', '창고', 'WC-01', 'DINING']) assert.equal(blockKind(name), null, name);
  assert.equal(openingDefaults('sliding', 2.0).item, 'door-sliding');
  assert.equal(openingDefaults('sliding', 0.9).item, 'door-barn');
  assert.equal(openingDefaults('pocket', 0.8).item, 'door-pocket');
  assert.equal(openingDefaults('folding', 1.5).item, 'door-folding');
  assert.equal(openingDefaults('folding', 0.9).item, 'door-bifold');
});

test('sample doors-variety.dxf: each symbol becomes its library item, the leaves are no walls', () => {
  const plan = readPlan(fs.readFileSync(path.join(plans, 'doors-variety.dxf')));
  const r = recognizePlan(plan);
  const items = r.openings.map((o) => o.item).sort();
  assert.deepEqual(items, ['door-double', 'door-folding', 'door-pocket', 'door-single', 'door-single', 'door-sliding', 'window-casement', 'window-casement', 'window-casement', 'window-sliding']);
  assert.equal(r.stats.doors, 6);
  assert.equal(r.stats.windows, 4);
  assert.equal(r.stats.passages, 0);
  assert.equal(r.walls.length, 7, 'no wall made of leaf or zig-zag lines');
  const p = createProject();
  const applied = applyPlan(p, { ...r, texts: plan.texts });
  assert.equal(applied.doors, 6);
  assert.ok(p.openings.some((o) => o.item === 'door-entrance'));
});

// ───────────────────────── 5. tilted and scanned pictures

const loadPicture = async (file) => {
  const { data, info } = await sharp(path.join(plans, file)).toColourspace('srgb').ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
};
/** Turns a picture by `deg` (the test's own nearest-pixel turn): { image, toSource }. */
function turn(image, deg) {
  const t = (deg * Math.PI) / 180; const c = Math.cos(t); const s = Math.sin(t);
  const { width: w, height: h, data } = image;
  const W = Math.ceil(w * Math.abs(c) + h * Math.abs(s)) + 4; const H = Math.ceil(w * Math.abs(s) + h * Math.abs(c)) + 4;
  const toSource = ([x, y]) => [w / 2 + c * (x - W / 2) - s * (y - H / 2), h / 2 + s * (x - W / 2) + c * (y - H / 2)];
  const out = new Uint8ClampedArray(W * H * 4).fill(255);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const [px, py] = toSource([x + 0.5, y + 0.5]);
    const X = Math.floor(px); const Y = Math.floor(py);
    if (X < 0 || Y < 0 || X >= w || Y >= h) continue;
    for (let k = 0; k < 4; k++) out[(y * W + x) * 4 + k] = data[(Y * w + X) * 4 + k];
  }
  return { image: { data: out, width: W, height: H }, toSource };
}

test('picture apartment-59-scan.png (turned 7°, grainy, uneven light): the walls are found where they are drawn', async () => {
  const expected = JSON.parse(fs.readFileSync(path.join(plans, 'apartment-59.expected.json'), 'utf8'));
  const { scan, image: info } = expected;
  const image = await loadPicture(scan.file);
  assert.deepEqual([image.width, image.height], scan.size);
  const m = 1 / info.pxPerMetre;
  const r = detectImageWalls(image, { metresPerPixel: m });
  assert.ok(r.scanned, 'the scan threshold was used');
  assert.ok(Math.abs((r.angle * 180) / Math.PI + scan.angle) < 0.1, `tilt ${(r.angle * 180) / Math.PI}°`);
  // Scan pixels → original picture pixels (make-plan-samples.mjs scanOf) → plan.
  const t = (scan.angle * Math.PI) / 180; const c = Math.cos(t); const s = Math.sin(t);
  const back = (p) => { const qx = p[0] / m - scan.size[0] / 2; const qy = p[1] / m - scan.size[1] / 2; return [(scan.source[0] / 2 + c * qx - s * qy) * m + info.topLeft[0], (scan.source[1] / 2 + s * qx + c * qy) * m + info.topLeft[1]]; };
  const walls = r.walls.map((w) => ({ ...w, a: back(w.a), b: back(w.b) }));
  const found = expected.walls.filter((w) => walls.some((x) => sameWall(x, w, 0.1)));
  assert.equal(found.length, expected.walls.length, `walls found ${found.length}/${expected.walls.length}`);
  assert.ok(walls.length <= expected.walls.length + 2, `few extra walls (${walls.length})`);
  for (const w of found) assert.ok(Math.abs(walls.find((x) => sameWall(x, w, 0.1)).thickness - w.thickness) < 0.04);
  assert.ok(r.stats.doors >= 3, `doors ${r.stats.doors}`);
  // Rooms of the picture get names from size and shape (no OCR), to be renamed in the panel.
  const p = createProject();
  const applied = applyPlan(p, { ...r, leftovers: [], texts: [] }, { target: 'add', shift: [0, 0], keepLeftovers: false, roomNames: (key, n) => (n > 1 ? `${key} ${n}` : key), source: 'ul1' });
  assert.ok(applied.rooms >= 4, `rooms ${applied.rooms}`);
  assert.ok(p.rooms.every((x) => x.name && x.planSource === 'ul1' && x.nameGuessed));
  assert.equal(p.rooms.filter((x) => x.name === 'living').length, 1, 'one living room (the largest)');
});

for (const deg of [35, -40]) {
  test(`picture house-2room.png turned ${deg}°: the tilt is found and the walls come out turned back onto the picture`, async () => {
    const expected = JSON.parse(fs.readFileSync(path.join(plans, 'house-2room.expected.json'), 'utf8'));
    const m = 1 / expected.image.pxPerMetre;
    const { image, toSource } = turn(await loadPicture('house-2room.png'), deg);
    const angle = (dominantAngle(image) * 180) / Math.PI;
    assert.ok(Math.abs(angle + deg) < 0.15, `dominant angle ${angle}`);
    const r = detectImageWalls(image, { metresPerPixel: m });
    const back = (p) => { const q = toSource([p[0] / m, p[1] / m]); return [q[0] * m + expected.image.topLeft[0], q[1] * m + expected.image.topLeft[1]]; };
    const walls = r.walls.map((w) => ({ ...w, a: back(w.a), b: back(w.b) }));
    const found = expected.walls.filter((w) => walls.some((x) => sameWall(x, w, 0.1)));
    assert.ok(found.length >= expected.walls.length - 1, `walls found ${found.length}/${expected.walls.length}`);
    assert.ok(walls.length <= expected.walls.length + 3, `few extra walls (${walls.length})`);
  });
}

test('pictures: a square picture is left as it is; turning is exact both ways', async () => {
  const image = await loadPicture('house-2room.png');
  assert.ok(Math.abs(dominantAngle(image)) < 0.3 * Math.PI / 180);
  assert.equal(detectImageWalls(image, { metresPerPixel: 1 / 80 }).angle, 0);
  const { image: turned, toSource } = rotateImage(image, 0.3);
  assert.ok(turned.width > image.width && turned.height > image.height);
  // The centre stays the centre.
  assert.ok(near(toSource([turned.width / 2, turned.height / 2]), [image.width / 2, image.height / 2], 1e-9));
});

// ───────────────────────── 6. room names without labels

test('rooms without a label are named from size and shape', () => {
  const rect = (w, d) => [[0, 0], [w, 0], [w, d], [0, d]];
  assert.equal(roomKindGuess(rect(6, 4), { largest: 24 }), 'living');
  assert.equal(roomKindGuess(rect(6, 1.2), { largest: 24 }), 'hall');
  assert.equal(roomKindGuess(rect(2, 2), { largest: 24 }), 'bath');
  assert.equal(roomKindGuess(rect(1.2, 1.5), { largest: 24 }), 'storage');
  assert.equal(roomKindGuess(rect(3.3, 3), { largest: 24 }), 'bedroom');
  assert.equal(roomKindGuess(rect(2.5, 2.6), { largest: 24 }), 'room');
  // CAD plans keep the label texts; rooms with none stay unnamed when no namer is given.
  const lines = [[0, 0, 4.2, 0], [4.2, 0, 4.2, 3.2], [4.2, 3.2, 0, 3.2], [0, 3.2, 0, 0], [0.2, 0.2, 4, 0.2], [4, 0.2, 4, 3], [4, 3, 0.2, 3], [0.2, 3, 0.2, 0.2]].map(([a, b, c, d]) => ({ a: [a, b], b: [c, d] }));
  const r = recognizePlan({ lines });
  const p = createProject();
  applyPlan(p, r);
  assert.equal(p.rooms.length, 1);
  assert.equal(p.rooms[0].name, '');
  assert.equal(p.rooms[0].guess, undefined);
  const q = createProject();
  applyPlan(q, r, { roomNames: (key) => `[${key}]` });
  assert.equal(q.rooms[0].name, '[bedroom]');
});
