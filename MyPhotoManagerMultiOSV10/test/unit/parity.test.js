// Catalog people, presets and saved edits; person / hierarchical-keyword /
// "all media" filters; edit presets and normalisation; shortcut settings.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Catalog } from '../../src/catalog/catalog.js';
import { filterMatches, matchFilters, matchSearch, parseSearch } from '../../src/catalog/query.js';
import { applyPreset, defaultEdit, isEmptyEdit, normalizeEdit, presetOf } from '../../src/edit/pipeline.js';
import { distance, knownFaces, SAME_PERSON, suggestPerson } from '../../src/people/faces.js';
import { normalize } from '../../src/settings.js';

const item = (path) => ({ path, name: path.split('/').pop(), size: 1, modified: 0 });
const vector = (seed) => Array.from({ length: 128 }, (_, i) => Math.sin(seed * 31 + i) * 0.1);

test('ORG-PEOPLE-NAME / ORG-PEOPLE-BROWSE: faces, names, counts, rename, remove — kept through JSON', () => {
  const c = new Catalog();
  c.setFaces('/a.jpg', [{ box: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 }, descriptor: vector(1) }, { box: { x: 0.6, y: 0.1, w: 0.2, h: 0.2 }, descriptor: vector(2) }]);
  c.setFaces('/b.jpg', [{ box: { x: 0.3, y: 0.3, w: 0.2, h: 0.2 }, descriptor: vector(1) }]);
  assert.equal(c.get('/a.jpg').facesScanned, true);
  assert.deepEqual(c.peopleCounts(), { counts: {}, unnamed: 3 });
  c.nameFace('/a.jpg', 0, ' Alice ');
  c.nameFace('/b.jpg', 0, 'Alice');
  c.nameFace('/a.jpg', 1, 'Bob');
  assert.deepEqual(c.people, ['Alice', 'Bob']);
  assert.deepEqual(c.peopleCounts(), { counts: { Alice: 2, Bob: 1 }, unnamed: 0 });
  // A rescan keeps names of faces at the same place.
  c.setFaces('/a.jpg', [{ box: { x: 0.11, y: 0.1, w: 0.2, h: 0.2 }, descriptor: vector(1) }]);
  assert.equal(c.get('/a.jpg').faces[0].person, 'Alice');
  const manual = c.addFace('/a.jpg', { x: 0.5, y: 0.5, w: 0.1, h: 0.1 });
  assert.equal(c.get('/a.jpg').faces[manual].manual, true);
  c.removeFace('/a.jpg', manual);
  assert.equal(c.get('/a.jpg').faces.length, 1);
  c.renamePerson('Alice', 'Alicia');
  assert.equal(c.get('/b.jpg').faces[0].person, 'Alicia');
  assert.ok(c.people.includes('Alicia') && !c.people.includes('Alice'));
  const copy = new Catalog(JSON.parse(JSON.stringify(c.toJSON())));
  assert.deepEqual(copy.people, c.people);
  assert.equal(copy.get('/b.jpg').faces[0].person, 'Alicia');
  c.removePerson('Alicia');
  assert.equal(c.get('/b.jpg').faces[0].person, null);
  assert.ok(!c.people.includes('Alicia'));
});

test('ORG-PEOPLE-SUGGEST: the nearest named face under the threshold is suggested', () => {
  const c = new Catalog();
  c.setFaces('/a.jpg', [{ box: { x: 0, y: 0, w: 0.1, h: 0.1 }, descriptor: vector(1) }, { box: { x: 0.5, y: 0, w: 0.1, h: 0.1 }, descriptor: vector(5) }]);
  c.nameFace('/a.jpg', 0, 'Alice');
  c.nameFace('/a.jpg', 1, 'Bob');
  const known = knownFaces(c);
  assert.equal(known.length, 2);
  const nearAlice = vector(1).map((v, i) => v + (i % 2 ? 0.005 : -0.005));
  assert.ok(distance(nearAlice, vector(1)) < SAME_PERSON);
  assert.equal(suggestPerson(nearAlice, known).person, 'Alice');
  const stranger = vector(1).map((v) => -v + 0.2);
  assert.equal(suggestPerson(stranger, known), null);
  assert.equal(suggestPerson(null, known), null);
});

test('BROWSE-ALLMEDIA / ORG-HIERKEY: "all", person and hierarchical keyword filters; keyword: search', () => {
  const c = new Catalog();
  c.addKeywords(['/busan.jpg'], ['Places|Korea|Busan']);
  c.addKeywords(['/seoul.jpg'], ['Places|Korea|Seoul']);
  c.addKeywords(['/paris.jpg'], ['Places|France']);
  c.setFaces('/busan.jpg', [{ box: { x: 0, y: 0, w: 0.1, h: 0.1 }, descriptor: null }]);
  c.nameFace('/busan.jpg', 0, 'Alice');
  c.setFaces('/seoul.jpg', [{ box: { x: 0, y: 0, w: 0.1, h: 0.1 }, descriptor: null }]);
  const pick = (filters, mode) => ['/busan.jpg', '/seoul.jpg', '/paris.jpg'].filter((p) => matchFilters(filters, item(p), c.get(p), mode));
  assert.deepEqual(pick([{ type: 'all' }]), ['/busan.jpg', '/seoul.jpg', '/paris.jpg']);
  assert.deepEqual(pick([{ type: 'keyword', value: 'Places|Korea' }]), ['/busan.jpg', '/seoul.jpg']);
  assert.deepEqual(pick([{ type: 'keyword', value: 'Places' }]), ['/busan.jpg', '/seoul.jpg', '/paris.jpg']);
  assert.deepEqual(pick([{ type: 'keyword', value: 'Korea' }]), [], 'only from the top of the tree');
  assert.deepEqual(pick([{ type: 'person', value: 'Alice' }]), ['/busan.jpg']);
  assert.deepEqual(pick([{ type: 'person', value: null }]), ['/seoul.jpg'], 'photos with unnamed faces');
  assert.ok(filterMatches({ type: 'keyword', value: 'places|korea|busan' }, item('/busan.jpg'), c.get('/busan.jpg')));
  const search = (text) => ['/busan.jpg', '/seoul.jpg', '/paris.jpg'].filter((p) => matchSearch(parseSearch(text), item(p), c.get(p)));
  assert.deepEqual(search('keyword:places|korea'), ['/busan.jpg', '/seoul.jpg']);
  assert.deepEqual(search('person:ali'), ['/busan.jpg']);
});

test('EDIT-PRESETS / EDIT-NONDESTRUCTIVE: presets and saved edit states in the catalog', () => {
  const c = new Catalog();
  const edit = normalizeEdit({ adjust: { exposure: 0.7 }, effects: [{ id: 'lomo', params: {} }] });
  c.savePreset('Warm', presetOf(edit));
  c.savePreset('Alpha', presetOf(defaultEdit()));
  c.savePreset('Warm', presetOf(normalizeEdit({ adjust: { exposure: 0.9 } })));
  assert.deepEqual(c.presets.map((p) => p.name), ['Alpha', 'Warm']);
  assert.equal(c.presets[1].edit.adjust.exposure, 0.9, 'same name replaces');
  c.setEditState('/a.jpg', edit);
  const copy = new Catalog(JSON.parse(JSON.stringify(c.toJSON())));
  assert.deepEqual(copy.presets.map((p) => p.name), ['Alpha', 'Warm']);
  assert.equal(copy.get('/a.jpg').editState.adjust.exposure, 0.7);
  c.deletePreset('Alpha');
  assert.deepEqual(c.presets.map((p) => p.name), ['Warm']);
  c.setEditState('/a.jpg', null);
  assert.equal(c.get('/a.jpg').editState, undefined);
});

test('EDIT-COPYPASTE / BATCH-PRESET: presetOf carries looks, applyPreset keeps the photo\'s own crop, spots, masks, layers', () => {
  const source = normalizeEdit({
    adjust: { exposure: 1, saturation: 20 }, tone: { dehaze: 30, splitTone: { highlightHue: 40, highlightSat: 50, shadowHue: 200, shadowSat: 20, balance: 0 } },
    lens: { distortion: 10 }, effects: [{ id: 'cartoon', params: {} }], tilt: { position: 0.5, width: 0.2, blur: 50, angle: 0, feather: 0.2 },
    geometry: { crop: { x: 0.1, y: 0.1, w: 0.5, h: 0.5 }, rotate: 90 }, spots: [{ type: 'heal', x: 1, y: 1, r: 4 }], local: [{ kind: 'radial', shape: {}, adjust: { exposure: 1 } }],
  });
  const preset = presetOf(source);
  for (const key of ['geometry', 'spots', 'local', 'layers', 'drawings', 'canvas']) assert.equal(preset[key], undefined, `${key} not in a preset`);
  const target = normalizeEdit({ geometry: { crop: { x: 0, y: 0, w: 0.3, h: 0.3 } }, spots: [{ type: 'redeye', x: 5, y: 5, r: 2 }] });
  const out = applyPreset(target, preset);
  assert.equal(out.adjust.exposure, 1);
  assert.equal(out.tone.dehaze, 30);
  assert.equal(out.lens.distortion, 10);
  assert.deepEqual(out.effects.map((e) => e.id), ['cartoon']);
  assert.deepEqual(out.geometry.crop, { x: 0, y: 0, w: 0.3, h: 0.3 }, 'own crop kept');
  assert.equal(out.spots[0].type, 'redeye');
  assert.ok(!isEmptyEdit(out));
  preset.adjust.exposure = 5;
  assert.equal(out.adjust.exposure, 1, 'deep copy');
});

test('EDIT-LAYERS / EDIT-DRAW / EDIT-CANVAS: normalizeEdit fills new fields; each makes an edit non-empty', () => {
  const old = normalizeEdit({ adjust: { exposure: 0 }, overlay: { border: 0 } });
  for (const key of ['tone', 'lens', 'canvas', 'effects', 'local', 'layers', 'drawings', 'spots']) assert.ok(key in old, key);
  assert.deepEqual(old.overlay.texts, []);
  assert.ok(isEmptyEdit(old));
  const nonEmpty = [
    { tone: { colorEq: { red: { hue: 10 } } } }, { tone: { lightEq: [0, 10, 0, 0, 0, 0, 0, 0, 0] } }, { tone: { skin: 20 } }, { tone: { dehaze: -10 } },
    { tone: { splitTone: { highlightSat: 10 } } }, { lens: { vertical: 5 } }, { effects: [{ id: 'glow' }] }, { tilt: { position: 0.5 } },
    { local: [{ kind: 'gradient' }] }, { canvas: { width: 100 } }, { layers: [{ path: '/x.png' }] }, { drawings: [{ type: 'line', points: [[0, 0], [1, 1]] }] },
  ];
  for (const edit of nonEmpty) assert.ok(!isEmptyEdit(edit), JSON.stringify(edit));
  assert.ok(isEmptyEdit({ tone: { lightEq: [0, 0, 0, 0, 0, 0, 0, 0, 0], splitTone: { highlightSat: 0, shadowSat: 0 } } }));
});

test('FILE-KEYS / VIEW-ZOOMLOCK / META-EMBED: settings keep shortcuts, viewer options, importer and XMP choices', () => {
  const s = normalize({ keys: { basket: 'Ctrl+K', bad: 3, rename: '' }, viewer: { navigator: true, zoomLock: true, faces: true, loupe: 4 }, xmpEmbed: true, importer: { pattern: 'YYYY/MM', rename: 'trip_###', skipDuplicates: false, destination: null } });
  assert.deepEqual(s.keys, { basket: 'Ctrl+K', rename: '' });
  assert.equal(s.viewer.zoomLock, true);
  assert.equal(s.viewer.navigator, true);
  assert.equal(s.viewer.loupe, 4);
  assert.equal(s.xmpEmbed, true);
  assert.equal(s.importer.pattern, 'YYYY/MM');
  assert.equal(s.importer.rename, 'trip_###');
  assert.equal(s.importer.skipDuplicates, false);
  assert.equal(s.importer.destination, null);
  assert.deepEqual(normalize({ keys: 'x' }).keys, {});
});
