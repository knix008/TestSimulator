// Architectural material presets (src/engine/materials-arch.js) and the procedural patterns they draw
// (src/engine/patterns.js): every preset valid, ≥ 110 per category, and the pattern geometry tiles exactly.
// Run: node --test test/unit/materials-arch.test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { MATERIAL_CATEGORIES, MATERIAL_PRESETS, getMaterial } from '../../src/engine/materials.js';
import { ARCH_MATERIAL_PRESETS } from '../../src/engine/materials-arch.js';
import { PATTERN_KINDS, TILING_KINDS, insetPolygon, patternLayout, patternShapes, pointInPolygon, polygonArea, random, renderPattern, validatePattern } from '../../src/engine/patterns.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const HEX = /^#[0-9a-f]{6}$/i;
const CATEGORY_IDS = new Set(MATERIAL_CATEGORIES.map((c) => c.id));
const MINE = ['floor', 'tile', 'stone', 'wall', 'carpet'];
const indexFile = path.join(root, 'library', 'textures', 'index.json');
const textureIndex = fs.existsSync(indexFile) ? JSON.parse(fs.readFileSync(indexFile, 'utf8')) : null;

test('arch presets are merged into MATERIAL_PRESETS', () => {
  const ids = new Set(MATERIAL_PRESETS.map((p) => p.id));
  for (const p of ARCH_MATERIAL_PRESETS) assert.ok(ids.has(p.id), p.id);
});

test('every preset id is unique', () => {
  const seen = new Set();
  for (const p of MATERIAL_PRESETS) { assert.ok(!seen.has(p.id), `duplicate ${p.id}`); seen.add(p.id); }
});

test('my categories have at least 110 materials each', () => {
  for (const cat of MINE) {
    const n = MATERIAL_PRESETS.filter((p) => p.category === cat).length;
    assert.ok(n >= 110, `${cat}: ${n}`);
  }
});

test('every arch preset is well formed', () => {
  for (const p of ARCH_MATERIAL_PRESETS) {
    const where = p.id;
    assert.match(p.id, /^[a-z0-9-]+$/, where);
    assert.ok(CATEGORY_IDS.has(p.category) && MINE.includes(p.category), `${where} category ${p.category}`);
    assert.ok(typeof p.ko === 'string' && p.ko.trim() && /[가-힣]/.test(p.ko), `${where} ko`);
    assert.ok(typeof p.en === 'string' && p.en.trim() && /^[\x20-\x7e×é]+$/.test(p.en), `${where} en "${p.en}"`);
    assert.match(p.color, HEX, `${where} colour`);
    assert.ok(Number.isFinite(p.roughness) && p.roughness >= 0 && p.roughness <= 1, `${where} roughness`);
    assert.ok(Number.isFinite(p.metalness) && p.metalness >= 0 && p.metalness <= 1, `${where} metalness`);
    assert.ok(Number.isFinite(p.repeat) && p.repeat > 0, `${where} repeat`);
    for (const k of ['sheen', 'clearcoat', 'clearcoatRoughness', 'transmission']) if (k in p) assert.ok(Number.isFinite(p[k]) && p[k] >= 0 && p[k] <= 1, `${where} ${k}`);
    assert.ok(p.textures || p.pattern || p.roughness >= 0, where);
    if (p.pattern) assert.deepEqual(validatePattern(p.pattern), [], `${where} pattern`);
  }
});

test('names are distinct within a category', () => {
  for (const cat of MINE) {
    const list = MATERIAL_PRESETS.filter((p) => p.category === cat);
    for (const key of ['ko', 'en']) {
      const seen = new Map();
      for (const p of list) { assert.ok(!seen.has(p[key]), `${cat}: "${p[key]}" for ${p.id} and ${seen.get(p[key])}`); seen.set(p[key], p.id); }
    }
  }
});

test('texture sets named by arch presets are fetched (library/textures/index.json)', { skip: textureIndex ? false : 'library not fetched (npm run assets)' }, () => {
  for (const p of ARCH_MATERIAL_PRESETS) if (p.textures) {
    const info = textureIndex[p.textures];
    assert.ok(info, `${p.id}: set ${p.textures} missing — run npm run assets -- --only textures`);
    // WebP after scripts/optimize-assets.mjs (index.json `ext`), JPEG before.
    const file = `diff.${info.ext ?? 'jpg'}`;
    assert.ok(fs.existsSync(path.join(root, 'library', 'textures', p.textures, file)), `${p.textures}/${file}`);
  }
});

test('materials load in Node without a canvas (pattern skipped, flat colour kept)', () => {
  const p = ARCH_MATERIAL_PRESETS.find((x) => x.pattern);
  assert.equal(renderPattern(p.pattern), null);
  const m = getMaterial(p.id);
  assert.equal(m.map, null);
  assert.equal(`#${m.color.getHexString()}`, p.color.toLowerCase());
});

// ───────────────────────── pattern geometry

const SAMPLE = {
  grid: { kind: 'grid', w: 0.3, h: 0.2 },
  brick: { kind: 'brick', w: 0.215, h: 0.065, offset: 0.5 },
  herringbone: { kind: 'herringbone', w: 0.42, h: 0.07 },
  chevron: { kind: 'chevron', w: 0.3, h: 0.1, angle: 45 },
  basketweave: { kind: 'basketweave', w: 0.07, n: 3 },
  hexagon: { kind: 'hexagon', size: 0.2 },
  diamond: { kind: 'diamond', w: 0.3, h: 0.2 },
};

/** How many shapes (with the ±cover copies the renderer draws) cover a point. */
function coverCount(shapes, [cx, cy], x, y) {
  let n = 0;
  for (const s of shapes) for (const ox of [-cx, 0, cx]) for (const oy of [-cy, 0, cy]) if (pointInPolygon(s.p, x - ox, y - oy)) n++;
  return n;
}

for (const kind of TILING_KINDS) {
  test(`${kind} tiles the plane exactly once (wrapped)`, () => {
    const spec = SAMPLE[kind];
    assert.deepEqual(validatePattern(spec), []);
    const layout = patternLayout(spec);
    const shapes = patternShapes(spec, layout).filter((s) => s.t === 'poly');
    // Area of one cover = sum of tile areas.
    const area = shapes.reduce((a, s) => a + Math.abs(polygonArea(s.p)), 0);
    assert.ok(Math.abs(area - layout.cover[0] * layout.cover[1]) < 1e-9 * Math.max(1, area) + 1e-9, `${kind} area ${area} vs ${layout.cover[0] * layout.cover[1]}`);
    const rnd = random(5);
    for (let i = 0; i < 400; i++) {
      const x = rnd() * layout.cover[0], y = rnd() * layout.cover[1];
      assert.equal(coverCount(shapes, layout.cover, x, y), 1, `${kind} at ${x.toFixed(4)},${y.toFixed(4)}`);
    }
  });
}

test('herringbone period is (L√2, W√2)', () => {
  const l = patternLayout({ kind: 'herringbone', w: 0.6, h: 0.1 });
  assert.ok(Math.abs(l.period[0] - 0.6 * Math.SQRT2) < 1e-12 && Math.abs(l.period[1] - 0.1 * Math.SQRT2) < 1e-12);
  assert.ok(validatePattern({ kind: 'herringbone', w: 0.55, h: 0.1 }).length > 0, 'non-integer ratio rejected');
});

test('brick bond period follows the offset', () => {
  assert.deepEqual(patternLayout({ kind: 'brick', w: 0.2, h: 0.1, offset: 0.5 }).period, [0.2, 0.2]);
  const third = patternLayout({ kind: 'brick', w: 0.2, h: 0.1, offset: 1 / 3 }).period;
  assert.ok(Math.abs(third[1] - 0.3) < 1e-9);
  assert.deepEqual(patternLayout({ kind: 'brick', w: 0.2, h: 0.1, offset: 'random' }).period, [0.2, 0.1]);
});

test('layout: cover is whole periods, canvas within limits, grout gets pixels', () => {
  for (const p of ARCH_MATERIAL_PRESETS.filter((x) => x.pattern)) {
    const l = patternLayout(p.pattern);
    for (const a of [0, 1]) {
      assert.ok(Math.abs(l.cover[a] - l.n[a] * l.period[a]) < 1e-9, `${p.id} cover`);
      assert.ok(l.px[a] >= 8 && l.px[a] <= 1024, `${p.id} px ${l.px}`);
    }
    // Joints thinner than ~1 px are widened by the renderer; only big slabs (≥ 1.2 m) may need that.
    if (p.pattern.groutWidth > 0.0015 && Math.max(...l.period) < 1.2) assert.ok(p.pattern.groutWidth * l.ppm >= 1, `${p.id}: grout ${(p.pattern.groutWidth * l.ppm).toFixed(2)} px`);
  }
});

test('chequer repeats hold an even number of tiles', () => {
  const l = patternLayout({ kind: 'grid', w: 0.25, checker: true, colors: ['#ffffff', '#000000'] });
  assert.equal(l.n[0] % 2, 0);
  assert.equal(l.n[1] % 2, 0);
});

test('insetPolygon shrinks a square evenly and collapses slivers', () => {
  const sq = [0, 0, 1, 0, 1, 1, 0, 1];
  const inner = insetPolygon(sq, 0.1);
  assert.ok(Math.abs(Math.abs(polygonArea(inner)) - 0.64) < 1e-12);
  const cw = [0, 0, 0, 1, 1, 1, 1, 0];
  assert.ok(Math.abs(Math.abs(polygonArea(insetPolygon(cw, 0.1))) - 0.64) < 1e-12, 'orientation independent');
  assert.equal(Math.abs(polygonArea(insetPolygon([0, 0, 1, 0, 1, 0.05, 0, 0.05], 0.1))), 0);
});

test('shapes are deterministic per seed', () => {
  const spec = { kind: 'terrazzo', base: '#eeeeee', chips: [['#333333', 0.004, 0.01, 2000]] };
  assert.deepEqual(patternShapes(spec), patternShapes(spec));
  assert.notDeepEqual(patternShapes({ ...spec, seed: 2 }), patternShapes(spec));
});

test('validatePattern rejects bad specs', () => {
  assert.ok(validatePattern({ kind: 'nope' }).length);
  assert.ok(validatePattern({ kind: 'grid' }).length);
  assert.ok(validatePattern({ kind: 'grid', w: 0.1, colors: ['red'] }).length);
  assert.ok(validatePattern({ kind: 'grid', w: 0.01, groutWidth: 0.006 }).length);
  assert.ok(validatePattern({ kind: 'plain' }).length, 'base required');
  for (const kind of PATTERN_KINDS) assert.ok(Array.isArray(validatePattern({ kind })));
});
