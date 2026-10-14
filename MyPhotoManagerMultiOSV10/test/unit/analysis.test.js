// Image analysis categories (src/analysis/taxonomy.js): colour statistics of
// synthetic pictures → scenes, ImageNet / COCO classes → categories, people
// counts, the whole classify() step, counting by category and filing.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import LABELS from '../../src/analysis/labels.json' with { type: 'json' };
import { categoryCounts, categoryIds, categoryKey, classify, cocoIds, colorStats, imagenetIds, inCategory, primaryCategory, scenesFromStats } from '../../src/analysis/taxonomy.js';

/** RGBA picture w × h painted by fn(x, y) → [r, g, b]. */
function picture(w, h, fn) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const [r, g, b] = fn(x, y); data.set([r, g, b, 255], (y * w + x) * 4); }
  return data;
}
const scenes = (w, h, fn) => scenesFromStats(colorStats(picture(w, h, fn), w, h));
const noise = (x, y, k = 18) => (((x * 73856093) ^ (y * 19349663)) % k) - k / 2; // fixed grain so nothing is perfectly flat

test('colour statistics: sky over sand is a beach with sky', () => {
  const s = scenes(96, 64, (x, y) => (y < 32 ? [90 + noise(x, y), 160 + noise(x, y), 230] : [225 + noise(x, y, 10), 200 + noise(x, y, 10), 150]));
  assert.ok(s.has('sky'));
  assert.ok(s.has('beach'));
  assert.ok(!s.has('document'));
});

test('colour statistics: a page of text is a document, not snow', () => {
  const s = scenes(80, 100, (x, y) => (y % 10 < 2 && x > 8 && x < 72 && (x * 7) % 9 > 2 ? [20, 20, 20] : [250, 250, 250]));
  assert.ok(s.has('document'));
  assert.ok(!s.has('snow'));
  assert.ok(!s.has('bw'));
});

test('colour statistics: grey pictures are black and white, dark ones night, green ones nature', () => {
  assert.ok(scenes(64, 64, (x, y) => { const v = 60 + ((x * 3 + y * 2) % 150); return [v, v, v]; }).has('bw'));
  assert.ok(scenes(64, 64, (x, y) => [10 + (x % 12), 12 + (y % 9), 30]).has('night'));
  const green = scenes(64, 64, (x, y) => [40 + noise(x, y), 140 + noise(x, y), 50]);
  assert.ok(green.has('nature'));
  assert.ok(!green.has('bw'));
});

test('colour statistics: a glowing orange sky over dark land is a sunset; autumn leaves are not', () => {
  assert.ok(scenes(64, 64, (x, y) => (y < 22 ? [250, 150 + noise(x, y), 60] : [25 + noise(x, y, 6), 18, 20])).has('sunset'));
  assert.ok(!scenes(64, 64, (x, y) => [150 + noise(x, y), 70, 20]).has('sunset'));
});

test('ImageNet classes map to scenes and objects', () => {
  const at = (name) => LABELS.imagenet.findIndex((l) => l.split(',')[0].trim().toLowerCase() === name);
  assert.equal(LABELS.imagenet.length, 1000);
  assert.deepEqual(imagenetIds(at('seashore'), LABELS.imagenet[at('seashore')]), ['scene/beach']);
  assert.deepEqual(imagenetIds(at('alp'), LABELS.imagenet[at('alp')]), ['scene/mountain']);
  assert.deepEqual(imagenetIds(at('golden retriever'), LABELS.imagenet[at('golden retriever')]), ['object/animal/dog']);
  assert.deepEqual(imagenetIds(at('tabby'), LABELS.imagenet[at('tabby')]), ['object/animal/cat']);
  assert.ok(imagenetIds(at('pizza'), LABELS.imagenet[at('pizza')]).includes('scene/food'));
  assert.ok(imagenetIds(at('sports car'), LABELS.imagenet[at('sports car')]).includes('object/vehicle/car'));
  assert.ok(imagenetIds(at('laptop'), LABELS.imagenet[at('laptop')]).includes('object/electronics'));
  assert.ok(imagenetIds(at('church'), LABELS.imagenet[at('church')]).includes('scene/city'));
  assert.ok(imagenetIds(at('daisy'), LABELS.imagenet[at('daisy')]).includes('scene/flower'));
  // Every category an ImageNet class can give is one the pane knows (and so is translated).
  const known = new Set(categoryIds());
  LABELS.imagenet.forEach((name, i) => { for (const id of imagenetIds(i, name)) assert.ok(known.has(id), `${name} → ${id}`); });
});

test('COCO objects map to categories; a person is counted, not filed', () => {
  assert.deepEqual(cocoIds('dog'), ['object/animal/dog']);
  assert.deepEqual(cocoIds('bus'), ['object/vehicle/bus']);
  assert.deepEqual(cocoIds('person'), []);
  const known = new Set(categoryIds());
  for (const label of Object.values(LABELS.coco)) for (const id of cocoIds(label)) assert.ok(known.has(id), `${label} → ${id}`);
});

test('people: none, portrait, one, two, group, crowd', () => {
  const person = (w, h) => ({ label: 'person', score: 0.9, box: { x: 0.1, y: 0.1, w, h } });
  const people = (detections, faces = null) => classify({ detections, faces }).cats.find((c) => c.startsWith('people/'));
  assert.equal(people([]), 'people/none');
  assert.equal(people([person(0.5, 0.8)]), 'people/portrait');
  assert.equal(people([person(0.1, 0.3)]), 'people/one');
  assert.equal(people([person(0.1, 0.3), person(0.1, 0.3)]), 'people/two');
  assert.equal(people(Array.from({ length: 4 }, () => person(0.1, 0.2))), 'people/group');
  assert.equal(people(Array.from({ length: 8 }, () => person(0.05, 0.1))), 'people/crowd');
  // Faces found earlier count too (a face close up without a body).
  assert.equal(people([], 1), 'people/portrait');
  assert.equal(people([person(0.1, 0.3)], 3), 'people/group');
  // Unsure detections are ignored.
  assert.equal(people([{ label: 'person', score: 0.3, box: { x: 0, y: 0, w: 0.5, h: 0.5 } }]), 'people/none');
});

test('classify: objects, scene hints and contradictions', () => {
  const r = classify({
    predictions: [{ index: 978, name: LABELS.imagenet[978], p: 0.55 }],
    detections: [{ label: 'dog', score: 0.8, box: { x: 0, y: 0, w: 0.2, h: 0.2 } }, { label: 'surfboard', score: 0.7, box: { x: 0, y: 0, w: 0.1, h: 0.1 } }],
  });
  assert.ok(r.cats.includes('scene/beach'));
  assert.ok(r.cats.includes('scene/sea'));
  assert.ok(r.cats.includes('object/animal/dog'));
  assert.ok(r.cats.includes('object/sports'));
  assert.ok(r.labels.includes('seashore'));
  // Indoors: colour-only sky / sunset guesses are dropped.
  const indoor = classify({ detections: [{ label: 'couch', score: 0.9, box: { x: 0, y: 0, w: 0.5, h: 0.3 } }], stats: colorStats(picture(32, 32, (x, y) => (y < 11 ? [250, 160, 70] : [90 + noise(x, y), 160, 230])), 32, 32) });
  assert.ok(indoor.cats.includes('scene/indoor'));
  assert.ok(!indoor.cats.includes('scene/sky'));
  assert.ok(!indoor.cats.includes('scene/sunset'));
  // Weak guesses do not count.
  assert.ok(!classify({ predictions: [{ index: 978, name: LABELS.imagenet[978], p: 0.05 }] }).cats.includes('scene/beach'));
});

test('counting and filtering by category: a parent covers its children', () => {
  const a = [{ cats: ['object/animal/dog', 'people/none'] }, { cats: ['object/animal/cat', 'object/vehicle/car', 'people/one'] }, { cats: ['people/one'] }];
  const counts = categoryCounts(a);
  assert.equal(counts.object, 2);
  assert.equal(counts['object/animal'], 2);
  assert.equal(counts['object/animal/dog'], 1);
  assert.equal(counts.people, 3);
  assert.equal(counts['people/one'], 2);
  assert.ok(inCategory(a[0], 'object/animal'));
  assert.ok(!inCategory(a[0], 'object/vehicle'));
  assert.ok(!inCategory(null, 'people'));
  assert.equal(categoryKey('object/animal/dog'), 'analysis.object.animal.dog');
});

test('filing: one folder category per kind, objects by their group', () => {
  const analysis = { cats: ['object/animal/dog', 'object/vehicle/car', 'people/two', 'scene/city', 'scene/beach'] };
  assert.equal(primaryCategory(analysis, 'people'), 'people/two');
  assert.equal(primaryCategory(analysis, 'scene'), 'scene/beach'); // the pane's order: beach before city
  assert.equal(primaryCategory(analysis, 'object'), 'object/animal');
  assert.equal(primaryCategory({ cats: ['people/none'] }, 'object'), null);
});
