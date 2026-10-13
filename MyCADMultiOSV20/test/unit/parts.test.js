import assert from 'node:assert/strict';
import test from 'node:test';
import { bboxOf, dist } from '../../src/domain/geometry.js';
import { BEARINGS, boreOutline, categoryOf, defaultParams, gearProfile, generatePart, METRIC, normalizeParams, parseSegments, PART_CATEGORIES, PART_KINDS, PARTS, partInfo, WASHER } from '../../src/domain/parts.js';
import '../../src/view/partIcons.js';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} ≈ ${b}`);
const points = (prims) => prims.flatMap((prim) => prim.points ?? (prim.kind === 'line' ? [prim.a, prim.b] : [{ x: prim.c.x - prim.r, y: prim.c.y - prim.r }, { x: prim.c.x + prim.r, y: prim.c.y + prim.r }]));

test('36 part kinds in six categories, each with a standard, an icon and valid defaults in every view', () => {
  assert.equal(PART_KINDS.length, 36);
  assert.deepEqual(Object.keys(PART_CATEGORIES), ['fasteners', 'pins', 'gears', 'bearings', 'springs', 'profiles']);
  assert.deepEqual(Object.values(PART_CATEGORIES).flat().sort(), PART_KINDS.slice().sort(), 'every kind in exactly one category');
  for (const kind of PART_KINDS) {
    assert.equal(PARTS[kind].icon, `part-${kind}`);
    assert.equal(typeof PARTS[kind].standard, 'string', kind);
    assert.ok(categoryOf(kind), kind);
    const params = defaultParams(kind);
    assert.deepEqual(normalizeParams(kind, params), params, `${kind}: defaults are already normal`);
    const views = PARTS[kind].params.find((param) => param.key === 'view')?.options ?? [undefined];
    for (const view of views) {
      const prims = generatePart(kind, view ? { ...params, view } : params);
      assert.ok(prims.length > 0, `${kind} ${view ?? ''}`);
      for (const prim of prims) assert.ok(['line', 'poly', 'circle', 'arc'].includes(prim.kind), `${kind}: ${prim.kind}`);
      const box = bboxOf(points(prims.filter((prim) => prim.kind !== 'arc')));
      if (box) assert.ok(Number.isFinite(box.minX + box.maxX + box.minY + box.maxY), `${kind}: finite geometry`);
    }
  }
});

test('every select option of every part generates geometry', () => {
  for (const kind of PART_KINDS) {
    for (const param of PARTS[kind].params.filter((p) => p.type === 'select')) {
      for (const option of param.options) {
        const prims = generatePart(kind, { ...defaultParams(kind), [param.key]: option });
        assert.ok(prims.length > 0, `${kind}.${param.key}=${option}`);
      }
    }
  }
});

test('parameters are clamped, rounded and defaulted', () => {
  const gear = normalizeParams('gear', { module: 999, teeth: 3.6, keyway: 'yes' });
  assert.equal(gear.module, 20);
  assert.equal(gear.teeth, 6, 'teeth: integer, at least 6');
  assert.equal(gear.keyway, true, 'bad boolean → default');
  assert.equal(normalizeParams('nut', { size: 7 }).size, 10, 'unknown size → default');
  assert.equal(normalizeParams('nut', { size: '16' }).size, 16);
  assert.equal(normalizeParams('nut', { type: 'bogus' }).type, 'regular');
  assert.throws(() => normalizeParams('flux-capacitor', {}));
});

test('involute gear: outside, pitch and root diameters follow the module', () => {
  const m = 2;
  const z = 20;
  const { points: outline, rp, ra, rf } = gearProfile({ module: m, teeth: z, pressureAngle: 20 });
  near(rp, 20);
  near(ra, 22);
  near(rf, 17.5);
  const radii = outline.map((p) => Math.hypot(p.x, p.y));
  near(Math.max(...radii), ra, 1e-6);
  near(Math.min(...radii), rf, 1e-6);
  assert.deepEqual(partInfo('gear', { module: 2, teeth: 20 }), { pitch: 40, outside: 44, root: 35 });
  // The outline is symmetric under one tooth pitch of rotation: z teeth.
  const tips = outline.filter((p) => Math.abs(Math.hypot(p.x, p.y) - ra) < 1e-6).length;
  assert.ok(tips >= z * 3, `${tips} tip points`);
});

test('keyway bore: a notch above the bore circle', () => {
  const [plain] = boreOutline(8, false);
  assert.equal(plain.kind, 'circle');
  const [keyed] = boreOutline(20, true);
  assert.equal(keyed.kind, 'poly');
  const top = Math.max(...keyed.points.map((p) => p.y));
  assert.ok(top > 10, 'the keyway goes above the bore');
});

test('hex nut: across flats from the ISO table', () => {
  const prims = generatePart('nut', { size: 10 });
  const hex = prims.find((prim) => prim.kind === 'poly');
  const box = bboxOf(hex.points);
  near(box.maxY - box.minY, METRIC[10].s, 1e-6);
});

test('bolt: head, shank length and thread lines', () => {
  const prims = generatePart('bolt', { size: 8, length: 30 });
  const box = bboxOf(points(prims.filter((prim) => !prim.lineType)));
  near(box.maxX, 30);
  near(box.minX, -METRIC[8].k);
  assert.ok(prims.filter((prim) => prim.thin).length === 2, 'two thread lines');
});

test('flange: bolt holes on the pitch circle', () => {
  const prims = generatePart('flange', { outer: 120, bore: 40, pcd: 90, holes: 6, holeDia: 11 });
  const holes = prims.filter((prim) => prim.kind === 'circle' && Math.abs(prim.r - 5.5) < 1e-9);
  assert.equal(holes.length, 6);
  for (const hole of holes) near(dist(hole.c, { x: 0, y: 0 }), 45);
});

test('stepped shaft: segments set the outline', () => {
  assert.deepEqual(parseSegments('20x30, 30×50; 25*20, bad, 0x5'), [[20, 30], [30, 50], [25, 20]]);
  assert.deepEqual(parseSegments(''), [[20, 50]]);
  const prims = generatePart('shaft', { segments: '20x30, 30x50', chamfer: 1 });
  const outline = prims.find((prim) => prim.kind === 'poly');
  const box = bboxOf(outline.points);
  near(box.maxX - box.minX, 80);
  near(box.maxY - box.minY, 30);
});

test('bearing, washer, spring, rack and slot sizes', () => {
  const [, D] = BEARINGS[6204];
  const bearing = bboxOf(points(generatePart('bearing', { series: 6204, balls: 8 }).filter((prim) => !prim.lineType)));
  near(bearing.maxX - bearing.minX, D);
  assert.equal(generatePart('bearing', { series: 6204, balls: 9 }).filter((prim) => prim.kind === 'circle' && prim.r < D / 8).length, 9, 'nine balls');
  const washer = generatePart('washer', { size: 10, type: 'plain', view: 'top' }).filter((prim) => prim.kind === 'circle').map((prim) => prim.r * 2).sort((a, b) => a - b);
  assert.deepEqual(washer, [WASHER[10][0], WASHER[10][1]]);
  const spring = bboxOf(points(generatePart('spring', { wire: 2, diameter: 20, length: 50, coils: 6 }).filter((prim) => !prim.lineType)));
  near(spring.maxX - spring.minX, 50);
  const rack = generatePart('rack', { module: 2, teeth: 10, pressureAngle: 20, height: 15 }).find((prim) => prim.kind === 'poly');
  near(Math.max(...rack.points.map((p) => p.x)), Math.PI * 2 * 10);
  near(Math.max(...rack.points.map((p) => p.y)), 2);
  const slot = bboxOf(generatePart('slot', { length: 40, width: 12 })[0].points);
  near(slot.maxX - slot.minX, 52, 1e-6);
});
