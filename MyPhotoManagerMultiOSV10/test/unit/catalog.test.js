// Catalog, search, sorting/grouping, batch rename, duplicates.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { autoCategoryCounts, baseName, Catalog, joinPath, parentOf, photoDate } from '../../src/catalog/catalog.js';
import { bestOf, dHash, grayGrid, groupBy, groupSimilar, hamming } from '../../src/catalog/dupes.js';
import { groupItems, sortItems } from '../../src/catalog/listing.js';
import { dateRange, matchFilters, matchSearch, parseSearch, passesListFilter } from '../../src/catalog/query.js';
import { formatDate, planRename, renameOne, renameSteps } from '../../src/catalog/rename.js';

test('paths: parent, base name, join (Windows, POSIX, web)', () => {
  assert.equal(parentOf('C:\\Photos\\a.jpg'), 'C:\\Photos');
  assert.equal(parentOf('C:\\a.jpg'), 'C:\\');
  assert.equal(parentOf('/home/u/a.jpg'), '/home/u');
  assert.equal(parentOf('/a.jpg'), '/');
  assert.equal(parentOf('@3:Photos/2024/a.jpg'), '@3:Photos/2024');
  assert.equal(parentOf('@3:Photos'), '');
  assert.equal(baseName('C:\\Photos\\a.jpg'), 'a.jpg');
  assert.equal(joinPath('C:\\Photos', 'b.jpg'), 'C:\\Photos\\b.jpg');
  assert.equal(joinPath('C:\\', 'b.jpg'), 'C:\\b.jpg');
  assert.equal(joinPath('/home', 'b.jpg'), '/home/b.jpg');
  assert.equal(joinPath('@1:Root', 'b.jpg'), '@1:Root/b.jpg');
});

// features: ORG-RATING ORG-LABEL ORG-TAG ORG-KEYWORDS ORG-CATEGORIES META-IPTC
test('catalog: rating, label, tag, keywords, categories, fields', () => {
  const c = new Catalog();
  const events = [];
  c.onChange((e) => events.push(e.what));
  c.setRating(['/a.jpg', '/b.jpg'], 4);
  c.setRating(['/b.jpg'], 0);
  assert.equal(c.get('/a.jpg').rating, 4);
  assert.equal(c.get('/b.jpg').rating, undefined);
  c.setLabel(['/a.jpg'], 'red');
  c.setLabel(['/a.jpg'], 'pink');
  assert.equal(c.get('/a.jpg').label, undefined, 'unknown label clears');
  assert.equal(c.toggleTagged(['/a.jpg', '/b.jpg']), true);
  c.setTagged(['/a.jpg'], false);
  assert.equal(c.toggleTagged(['/a.jpg', '/b.jpg']), true, 'any untagged → tag all');
  assert.equal(c.toggleTagged(['/a.jpg', '/b.jpg']), false);
  c.addKeywords(['/a.jpg'], ['Sea', ' beach ', 'Sea']);
  assert.deepEqual(c.get('/a.jpg').keywords, ['beach', 'Sea']);
  c.removeKeywords(['/a.jpg'], ['sea']);
  assert.deepEqual(c.get('/a.jpg').keywords, ['beach']);
  c.assignCategory(['/a.jpg'], 'Trips/Japan');
  assert.ok(c.categories.includes('Trips') && c.categories.includes('Trips/Japan'));
  assert.equal(c.renameCategory('Trips', 'Travel'), 'Travel');
  assert.deepEqual(c.get('/a.jpg').categories, ['Travel/Japan']);
  c.removeCategory('Travel');
  assert.equal(c.get('/a.jpg').categories, undefined);
  c.setFields(['/a.jpg'], { caption: ' Hi ', title: '' });
  assert.equal(c.get('/a.jpg').caption, 'Hi');
  assert.ok(events.includes('rating') && events.includes('categories') && c.dirty);
  const counts = c.counts();
  assert.equal(counts.ratings[4], 1);
  assert.equal(counts.keywords.beach, 1);
});

// features: ORG-BACKUP META-SIDECAR
test('catalog: learned info, embedded XMP values, renames and moves, JSON round trip', () => {
  const c = new Catalog();
  c.setInfo('/p/a.jpg', { size: 10, modified: 1000, meta: { taken: 5, xmpRating: 3, xmpLabel: 'Green', keywords: ['k'] }, width: 40, height: 30 });
  const a = c.get('/p/a.jpg');
  assert.equal(a.rating, 3);
  assert.equal(a.label, 'green');
  assert.deepEqual(a.keywords, ['k']);
  assert.ok(c.isCurrent('/p/a.jpg', 10, 1500));
  assert.ok(!c.isCurrent('/p/a.jpg', 11, 1000));
  c.setRating(['/p/a.jpg'], 1);
  c.setInfo('/p/a.jpg', { size: 10, modified: 1000, meta: { xmpRating: 5 } });
  assert.equal(c.get('/p/a.jpg').rating, 1, 'the user\'s choice wins');
  c.movePath('/p', '/q');
  assert.ok(c.get('/q/a.jpg') && !c.get('/p/a.jpg'));
  c.copyPath('/q/a.jpg', '/r/a.jpg');
  c.get('/r/a.jpg').rating = 2;
  assert.equal(c.get('/q/a.jpg').rating, 1, 'copies are independent');
  c.addToBasket(['/q/a.jpg']);
  c.movePath('/q/a.jpg', '/q/b.jpg');
  assert.deepEqual(c.basket, ['/q/b.jpg']);
  c.saveSearch('s', 'rating:>=3');
  const back = Catalog.fromJSON(JSON.stringify(c.toJSON()));
  assert.equal(back.get('/q/b.jpg').rating, 1);
  assert.deepEqual(back.basket, ['/q/b.jpg']);
  assert.equal(back.savedSearches[0].query, 'rating:>=3');
  back.removePaths(['/q']);
  assert.equal(back.get('/q/b.jpg'), null);
  back.setInfo('/z.jpg', { size: 1, modified: 1 });
  back.forgetMissing(['/z.jpg', '/r/a.jpg']);
  assert.equal(back.get('/z.jpg'), null, 'learned-only records are dropped');
  assert.ok(back.get('/r/a.jpg'), 'organized records are kept');
  assert.throws(() => Catalog.fromJSON({ format: 99 }), /newer/);
});

// features: ORG-AUTOCAT
test('automatic categories', () => {
  const records = [
    { indexed: 1, meta: { camera: 'Canon EOS R5', iso: 100, focal: 24, taken: new Date(2023, 1, 1).getTime(), lat: 1, lon: 2, flash: false }, width: 6000, height: 4000 },
    { indexed: 1, meta: { camera: 'Canon EOS R5', iso: 6400, focal: 200 }, width: 4000, height: 6000 },
    { indexed: 1, meta: {} },
  ];
  const counts = autoCategoryCounts(records);
  assert.equal(counts.camera['Canon EOS R5'], 2);
  assert.equal(counts.iso['< 200'], 1);
  assert.equal(counts.iso['≥ 6400'], 1);
  assert.equal(counts.year['2023'], 1);
  assert.equal(counts.orientation.landscape, 1);
  assert.equal(counts.orientation.portrait, 1);
  assert.equal(counts.gps.yes, 1);
  assert.equal(counts.gps.no, 2);
  assert.equal(counts.flash.off, 1);
  assert.equal(photoDate({ modified: 9 }), 9);
});

// features: BROWSE-SEARCH
test('search syntax', () => {
  const terms = parseSearch('beach "red car" -night rating:>=3 label:red tagged kw:sea date:2024-05 foo:bar');
  assert.deepEqual(terms.map((x) => [x.neg, x.field, x.op, x.value]), [
    [false, null, '=', 'beach'], [false, null, '=', 'red car'], [true, null, '=', 'night'], [false, 'rating', '>=', '3'],
    [false, 'label', '=', 'red'], [false, 'is', '=', 'tagged'], [false, 'kw', '=', 'sea'], [false, 'date', '=', '2024-05'], [false, null, '=', 'foo:bar'],
  ]);
  const item = { name: 'IMG_0001.JPG', path: '/trip/IMG_0001.JPG', modified: new Date(2020, 0, 1).getTime() };
  const record = { rating: 4, label: 'red', tagged: true, keywords: ['Sea', 'Beach'], categories: ['People/Family'], caption: 'Red car by the sea', meta: { camera: 'Canon EOS R5', iso: 1600, taken: new Date(2024, 4, 10).getTime(), lat: 1, lon: 1 } };
  const match = (q) => matchSearch(parseSearch(q), item, record);
  assert.ok(match('beach "red car" rating:>=3 label:red tagged kw:sea date:2024-05'));
  assert.ok(!match('-beach'));
  assert.ok(match('rating:4') && !match('rating:5') && match('rating:<5'));
  assert.ok(match('cat:People') && match('cat:family') && !match('cat:Places'));
  assert.ok(match('camera:canon') && match('iso:>=800') && !match('iso:>3200'));
  assert.ok(match('ext:jpg') && match('is:image') && !match('is:raw') && match('has:gps') && match('has:keywords'));
  assert.ok(match('date:2024-01..2024-06') && !match('date:2023'));
  assert.ok(match('folder:trip') && match('name:0001'));
  assert.deepEqual(dateRange('2024-02').map((v) => new Date(v).getMonth()), [1, 2]);
});

// features: ORG-CATALOGPANE
test('catalog pane filters: alternatives within a kind, all kinds must match', () => {
  const item = { name: 'a.jpg', path: '/a.jpg', modified: 0 };
  const record = { rating: 3, label: 'green', categories: ['Places/Seoul'], keywords: ['Night'], meta: { camera: 'X' } };
  assert.ok(matchFilters([{ type: 'rating', value: 3 }, { type: 'rating', value: 5 }], item, record));
  assert.ok(!matchFilters([{ type: 'rating', value: 3 }, { type: 'label', value: 'red' }], item, record));
  assert.ok(matchFilters([{ type: 'rating', value: 3 }, { type: 'label', value: 'red' }], item, record, 'any'));
  assert.ok(matchFilters([{ type: 'category', value: 'Places' }, { type: 'keyword', value: 'night' }, { type: 'auto', key: 'camera', value: 'X' }], item, record));
  assert.ok(matchFilters([{ type: 'rating', value: 0 }], item, {}));
  assert.ok(matchFilters([], item, record));
  const filter = { rating: 2, label: 'green', tagged: false, kinds: new Set(['native']), text: '' };
  assert.ok(passesListFilter(filter, item, record));
  assert.ok(!passesListFilter({ ...filter, rating: 4 }, item, record));
  assert.ok(passesListFilter({ ...filter, rating: 4 }, { ...item, isDir: true }, null), 'folders always pass');
  assert.ok(!passesListFilter({ ...filter, kinds: new Set(['raw']) }, item, record));
});

// features: BROWSE-SORT
test('sorting (natural, folders first) and grouping', () => {
  const items = [
    { name: 'img10.jpg', path: '/img10.jpg', size: 5, modified: 3 },
    { name: 'img2.jpg', path: '/img2.jpg', size: 9, modified: 1 },
    { name: 'Zeta', path: '/Zeta', isDir: true },
    { name: 'alpha', path: '/alpha', isDir: true },
    { name: 'img1.png', path: '/img1.png', size: 9, modified: 2 },
  ];
  const records = { '/img10.jpg': { rating: 5, meta: { taken: new Date(2024, 0, 2).getTime() } }, '/img2.jpg': { rating: 1, meta: { taken: new Date(2024, 0, 1).getTime() } } };
  const recordOf = (p) => records[p] ?? null;
  assert.deepEqual(sortItems(items, { key: 'name' }, recordOf).map((i) => i.name), ['alpha', 'Zeta', 'img1.png', 'img2.jpg', 'img10.jpg']);
  assert.deepEqual(sortItems(items, { key: 'size', desc: true }, recordOf).filter((i) => !i.isDir).map((i) => i.name), ['img1.png', 'img2.jpg', 'img10.jpg']);
  assert.deepEqual(sortItems(items, { key: 'rating', desc: true }, recordOf).filter((i) => !i.isDir).map((i) => i.name), ['img10.jpg', 'img2.jpg', 'img1.png']);
  const groups = groupItems(sortItems(items, { key: 'name' }, recordOf), 'type', recordOf);
  assert.deepEqual(groups.map((g) => g.key), ['\0folders', 'jpg', 'png']);
  const days = groupItems(items.filter((i) => !i.isDir), 'day', recordOf);
  assert.equal(days[0].key, '2024-01-02', 'newest day first');
  assert.equal(groupItems(items, 'none').length, 1);
});

// features: BATCH-RENAME
test('batch rename templates, conflicts and safe ordering', () => {
  const file = { name: 'IMG_0042.JPG', path: '/trip/IMG_0042.JPG', record: { meta: { taken: new Date(2024, 4, 3, 9, 8, 7).getTime(), camera: 'Canon EOS R5' }, width: 10, height: 20, rating: 4 } };
  assert.equal(renameOne(file, 0, { template: '{date:YYYYMMDD_HHmmss}_###' }), '20240503_090807_001.JPG');
  assert.equal(renameOne(file, 4, { template: '*_{n}', start: 10, step: 2, extCase: 'lower' }), 'IMG_0042_18.jpg');
  assert.equal(renameOne(file, 0, { template: '{folder}-{camera}-{w}x{h}-r{rating}.{ext}' }), 'trip-Canon EOS R5-10x20-r4.JPG');
  assert.equal(renameOne(file, 0, { template: '*', find: 'IMG_', replace: 'photo-', caseMode: 'upper' }), 'PHOTO-0042.JPG');
  assert.equal(renameOne(file, 0, { template: '*', find: '\\d+', replace: 'N', regex: true }), 'IMG_N.JPG');
  assert.equal(renameOne(file, 0, { template: 'a/b:c' }), 'a_b_c.JPG');
  assert.equal(formatDate(new Date(2024, 0, 5).getTime(), 'YY-MM-DD'), '24-01-05');
  const files = [{ name: 'a.jpg', path: '/a.jpg' }, { name: 'b.jpg', path: '/b.jpg' }];
  assert.deepEqual(planRename(files, { template: 'same' }).map((p) => p.problem), ['duplicate', 'duplicate']);
  assert.equal(planRename([files[0]], { template: 'taken' }, new Set(['taken.jpg']))[0].problem, 'exists');
  // Swapping names needs temporary names.
  const swap = planRename(files, { template: 'x' }).map((p, i) => ({ ...p, to: i ? 'a.jpg' : 'b.jpg', problem: null }));
  const steps = renameSteps(swap);
  assert.ok(steps.every((s) => s.temp));
});

// features: FILE-DUPLICATES
test('duplicates: dHash, hamming, grouping', () => {
  const w = 18;
  const h = 16;
  const gradient = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; gradient[i] = gradient[i + 1] = gradient[i + 2] = x * 14; gradient[i + 3] = 255; }
  const hash = dHash(grayGrid(gradient, w, h));
  assert.equal(hash, 'ffffffffffffffff');
  assert.equal(hamming(hash, '0000000000000000'), 64);
  assert.equal(hamming('0f00000000000000', '0000000000000000'), 4);
  const items = [{ path: 'a', hash: 'ffffffffffffffff' }, { path: 'b', hash: 'fffffffffffffff0' }, { path: 'c', hash: '0000000000000000' }];
  assert.deepEqual(groupSimilar(items, 6).map((g) => g.map((i) => i.path)), [['a', 'b']]);
  assert.deepEqual(groupBy([{ k: 1 }, { k: 2 }, { k: 1 }], (x) => x.k).length, 1);
  assert.equal(bestOf([{ path: 'small', pixels: 10, size: 1 }, { path: 'big', pixels: 100, size: 1 }]).path, 'big');
});
