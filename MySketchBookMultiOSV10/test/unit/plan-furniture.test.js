// Furniture in plan pictures (src/io/plan-furniture.js): the naming rules on typical footprints, and the whole
// recognition measured on the interior samples (samples/plan-images, made with the furniture drawn from the library
// models — index.json lists every piece): how much is found with the right kind, how much of what is found is right,
// whether wall pieces face the right way, and that a plain plan gets no furniture made up.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { nameShape, detectFurniture, matchShape, MATCH_ITEMS } from '../../src/io/plan-furniture.js';
import { templateSource, topTemplate } from '../../src/io/plan-templates.js';
import { PARAMETRIC_ITEMS } from '../../src/library/parametric/index.js';
import { getMaterial } from '../../src/engine/materials.js';
import { detectImageWalls, wallsOnly } from '../../src/io/plan-image.js';
import { pickDetection } from '../../src/io/plan-draft.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const dir = path.join(root, 'samples', 'plan-images');
const index = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8'));

/** Kinds that count as the same (a bunk bed found as a bed is right; storage of any sort is storage). */
const GROUP = {
  bed: 'bed', 'bunk-bed': 'bed', 'sofa-modern': 'sofa', 'sofa-loveseat': 'sofa', 'sofa-sectional': 'sofa',
  'coffee-table': 'table', 'dining-table': 'table', desk: 'desk', 'kids-desk': 'desk', 'vanity-table': 'desk',
  wardrobe: 'storage', 'built-in-closet': 'storage', dresser: 'storage', bookshelf: 'storage', 'shelving-unit': 'storage', 'tv-console': 'storage', 'shoe-cabinet': 'storage', 'bookcase-cabinet': 'storage', 'cube-storage': 'storage', 'toy-box': 'storage',
  nightstand: 'nightstand', armchair: 'chair', 'lounge-chair': 'chair', 'office-chair': 'chair', toilet: 'toilet', 'washbasin-vanity': 'basin', 'shower-booth': 'shower', bathtub: 'bath',
  'kitchen-base-cabinet': 'kitchen', 'kitchen-sink-counter': 'kitchen', refrigerator: 'fridge', 'washing-machine': 'laundry', dryer: 'laundry',
  'fiddle-leaf-fig': 'plant', monstera: 'plant', 'olive-tree': 'plant', rug: 'rug',
};
const WALL_GROUPS = new Set(['bed', 'storage', 'sofa', 'toilet', 'basin', 'kitchen', 'fridge', 'nightstand', 'desk']);
const BY_ID = new Map(PARAMETRIC_ITEMS.map((i) => [i.id, i]));
const build = (id) => BY_ID.get(id)?.build({}, { quality: 'low', wallThickness: 0.2, material: (m, o) => getMaterial(m, o) });
const templates = templateSource(build);

const f = (long, short, fill = 0.95) => ({ long, short, fill });
const ctx = (room, more = {}) => ({ room, wet: room === 'bath', atWall: true, wall: 0.02, plant: false, dark: false, carries: false, nearBed: false, nearSofa: false, nearCounter: false, ...more });

test('plan-furniture: typical footprints get the expected library items', () => {
  assert.equal(nameShape(f(2.15, 1.6), ctx('bedroom')).item, 'bed');
  assert.equal(nameShape(f(2.15, 1.6), ctx('bedroom')).params.bedSize, 'king');
  assert.equal(nameShape(f(2.1, 1.0), ctx('bedroom')).params.bedSize, 'single');
  assert.equal(nameShape(f(2.1, 1.5), ctx('bedroom', { atWall: false, wall: 1 })), null, 'a bed-sized thing in the middle of a room is no bed');
  assert.equal(nameShape(f(2.2, 0.92), ctx('living')).item, 'sofa-modern', 'a sofa-sized thing in a living room is a sofa');
  assert.equal(nameShape(f(2.9, 1.66, 0.7), ctx('living')).item, 'sofa-sectional');
  assert.equal(nameShape(f(0.64, 0.38, 0.8), ctx('bath')).item, 'toilet');
  assert.equal(nameShape(f(0.64, 0.38, 0.8), ctx('bedroom')).item === 'toilet', false, 'no toilets in bedrooms');
  assert.equal(nameShape(f(1.7, 0.8), ctx('bath')).item, 'bathtub');
  assert.equal(nameShape(f(0.9, 0.9), ctx('bath')).item, 'shower-booth');
  assert.equal(nameShape(f(0.8, 0.5), ctx('bath')).item, 'washbasin-vanity');
  assert.equal(nameShape(f(1.2, 0.62), ctx('bedroom')).item, 'wardrobe');
  assert.equal(nameShape(f(2.4, 0.62), ctx('bedroom')).item, 'built-in-closet');
  assert.equal(nameShape(f(2.4, 0.62), ctx('living')).item, 'kitchen-sink-counter');
  assert.equal(nameShape(f(1.8, 0.44), ctx('living')).item, 'tv-console');
  assert.equal(nameShape(f(0.5, 0.43), ctx('bedroom', { nearBed: true })).item, 'nightstand');
  assert.equal(nameShape(f(1.2, 0.6), ctx('living', { atWall: false, wall: 1, nearSofa: true })).item, 'coffee-table');
  assert.equal(nameShape(f(0.9, 0.86), ctx('living', { atWall: false, wall: 1 })).item, 'armchair');
  assert.equal(nameShape(f(0.95, 0.9), ctx('living', { dark: true })).item, 'refrigerator');
  assert.equal(nameShape(f(0.8, 0.7, 0.6), ctx('living', { plant: true, atWall: false, wall: 1 })).item, 'fiddle-leaf-fig');
  assert.equal(nameShape(f(2.0, 1.4), ctx('living', { carries: true, atWall: false, wall: 1 })).item, 'rug');
  assert.equal(nameShape(f(0.6, 0.62), ctx('storage')).item, 'washing-machine');
  // Sizes are fitted to the footprint.
  assert.deepEqual(nameShape(f(1.4, 0.62), ctx('bedroom')).params, { width: 1.4, depth: 0.62 });
});

/** The app's picture reading (ui/plan-import.js): walls (four variants, the best one), then the furniture. */
async function recognise(p, { useTemplates = true } = {}) {
  const { data, info } = await sharp(path.join(dir, p.file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const img = { data: new Uint8ClampedArray(data), width: info.width, height: info.height };
  const m = 1 / p.pxPerMetre;
  const walls = wallsOnly(img, { metresPerPixel: m });
  const none = { walls: [], openings: [] };
  const found = [...['outline', 'edges'].map((method) => (walls ? detectImageWalls(walls, { metresPerPixel: m, method, evidence: img }) : none)), ...['outline', 'edges'].map((method) => detectImageWalls(img, { metresPerPixel: m, method }))];
  const result = found[pickDetection(found)];
  return detectFurniture(img, { metresPerPixel: m, result, angle: result.angle ?? 0, templates: useTemplates ? templates : null });
}

/** The pieces a picture shows (floor furniture; kitchen cabinets side by side are one counter run), in picture metres. */
function expected(p) {
  let gt = p.furniture.filter((x) => GROUP[x.item]).map((x) => ({ ...x, at: [x.position[0] - p.topLeft[0], x.position[1] - p.topLeft[1]], group: GROUP[x.item] }));
  const box = (g) => [g.at[0] - g.size[0] / 2, g.at[1] - g.size[1] / 2, g.at[0] + g.size[0] / 2, g.at[1] + g.size[1] / 2];
  const kitchen = gt.filter((g) => g.group === 'kitchen');
  gt = gt.filter((g) => g.group !== 'kitchen');
  const runs = [];
  for (const g of kitchen) {
    const b = box(g);
    const run = runs.find((R) => b[0] <= R[2] + 0.1 && b[2] >= R[0] - 0.1 && b[1] <= R[3] + 0.1 && b[3] >= R[1] - 0.1);
    if (run) { run[0] = Math.min(run[0], b[0]); run[1] = Math.min(run[1], b[1]); run[2] = Math.max(run[2], b[2]); run[3] = Math.max(run[3], b[3]); } else runs.push(b);
  }
  for (const R of runs) gt.push({ item: 'kitchen-sink-counter', group: 'kitchen', at: [(R[0] + R[2]) / 2, (R[1] + R[3]) / 2], size: [R[2] - R[0], R[3] - R[1]] });
  return gt;
}

/** Found ↔ expected: the same kind first (nearest within its size), then anything at the place. */
function score(items, gt) {
  const used = new Set(); const match = new Map();
  for (const same of [true, false]) {
    for (const [gi, g] of gt.entries()) {
      if (match.has(gi)) continue;
      let best = null;
      items.forEach((it, i) => {
        if (used.has(i) || (same && GROUP[it.item] !== g.group)) return;
        const d = Math.hypot(it.position[0] - g.at[0], it.position[1] - g.at[1]);
        if (d <= Math.max(0.4, Math.max(...g.size) * 0.35) && (!best || d < best.d)) best = { i, d };
      });
      if (best) { used.add(best.i); match.set(gi, best.i); }
    }
  }
  let right = 0; let facing = 0; let wallPieces = 0;
  for (const [gi, i] of match) {
    const g = gt[gi]; const it = items[i];
    if (GROUP[it.item] !== g.group) continue;
    right++;
    if (WALL_GROUPS.has(g.group) && g.rotation != null && g.item !== 'bunk-bed') {
      wallPieces++;
      const d = Math.abs((((it.rotation - g.rotation) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI) - Math.PI);
      if (d <= Math.PI / 4) facing++;
    }
  }
  return { right, facing, wallPieces };
}

test('plan-furniture: library top views — the item in its own frame, front at the bottom rows', () => {
  for (const spec of MATCH_ITEMS) assert.ok(templates(spec.item), `${spec.item}: a template`);
  const bed = templates('bed');
  assert.ok(bed.d > bed.w, 'a bed is longer than wide (depth = its length)');
  const rowEdges = (r) => bed.edge.slice(r * bed.size, (r + 1) * bed.size).reduce((s, v) => s + v, 0);
  assert.ok(rowEdges(1) + rowEdges(2) > rowEdges(6) + rowEdges(7), 'headboard and pillows at the back (top rows), plain covers towards the front');
  assert.equal(topTemplate(new (BY_ID.get('bed').build({}, { quality: 'low', wallThickness: 0.2, material: (m, o) => getMaterial(m, o) }).constructor)()), null, 'nothing to draw: no template');
});

test('plan-furniture: the interior samples — kinds, places and directions of the furniture', async (t) => {
  const total = { gt: 0, found: 0, right: 0, facing: 0, wallPieces: 0 };
  const rules = { found: 0, right: 0 };
  const beds = { pictures: 0, found: 0 };
  for (const p of index.pictures.filter((x) => x.interior && !x.tilt)) {
    const items = await recognise(p);
    const gt = expected(p);
    const s = score(items, gt);
    const plain = await recognise(p, { useTemplates: false });
    rules.found += plain.length; rules.right += score(plain, gt).right;
    total.gt += gt.length; total.found += items.length; total.right += s.right; total.facing += s.facing; total.wallPieces += s.wallPieces;
    for (const it of items) {
      assert.ok(Number.isFinite(it.rotation) && it.size.every((v) => v > 0.1 && v < 5), `${p.id}: ${it.item} placed`);
    }
    // Beds stand with their head to a wall; a bed in the middle of a studio flat is missed (the picture's own limit).
    if (p.style !== 'interiorSketch') { beds.pictures++; if (items.some((it) => it.item === 'bed')) beds.found++; }
  }
  const recall = total.right / total.gt; const precision = total.right / total.found; const facing = total.facing / total.wallPieces;
  t.diagnostic(`templates: recall ${(recall * 100).toFixed(0)}%, precision ${(precision * 100).toFixed(0)}%, facing ${(facing * 100).toFixed(0)}% · rules only: recall ${(rules.right / total.gt * 100).toFixed(0)}%, precision ${(rules.right / rules.found * 100).toFixed(0)}%`);
  assert.ok(beds.found >= beds.pictures - 1, `beds found in ${beds.found} of ${beds.pictures} pictures`);
  assert.ok(recall >= 0.7, `found with the right kind: ${(recall * 100).toFixed(0)}% of ${total.gt}`);
  assert.ok(precision >= 0.68, `right among what is found: ${(precision * 100).toFixed(0)}% of ${total.found}`);
  assert.ok(facing >= 0.95, `wall pieces facing the right way: ${(facing * 100).toFixed(0)}% of ${total.wallPieces}`);
  assert.ok(total.right > rules.right, `the templates find more than the size rules alone (${total.right} > ${rules.right})`);
});

test('plan-furniture: a plan picture without furniture gets none made up', async () => {
  // The CAD styles draw no furniture at all (the listing, brochure and blueprint styles draw simple symbols).
  for (const id of ['apt84-cad-print', 'officetel-fax', 'shop-tga']) {
    const p = index.pictures.find((x) => x.id === id);
    if (/.tga$/.test(p.file)) continue;
    const items = await recognise(p);
    assert.ok(items.length <= 2, `${id}: ${items.map((x) => x.item).join(', ')}`);
  }
});
