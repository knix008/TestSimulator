// The .mdg / .mdgt file format: saving and reading back, templates, refusals,
// the repairs made to damaged files, and the file-name helpers.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as Fm from '../../src/domain/format.js';
import * as D from '../../src/domain/diagram.js';
import { buildSample, buildTemplate, TEMPLATES } from '../../src/domain/templates.js';

const failsWith = (fn, code) => assert.throws(fn, (error) => error instanceof Fm.FormatError && error.code === code && error.message === code, code);
const raw = (document) => JSON.stringify({ format: 'mydiagram', version: 1, kind: 'drawing', document });
const repaired = (document) => Fm.parseDiagram(raw(document)).doc;

test('serialize / parseDiagram round trip keeps the drawing', () => {
  const doc = buildSample('ko');
  const text = Fm.serialize(doc);
  assert.ok(text.endsWith('\n'));
  const data = JSON.parse(text);
  assert.deepEqual([data.format, data.version, data.kind], ['mydiagram', 1, 'drawing']);
  assert.ok(!Number.isNaN(Date.parse(data.saved)));
  const { doc: back, template } = Fm.parseDiagram(text);
  assert.equal(template, false);
  assert.deepEqual(back, JSON.parse(JSON.stringify(doc)), 'nothing lost or changed');
});

test('every template and the English sample survive a round trip', () => {
  for (const { id } of TEMPLATES) {
    for (const language of ['ko', 'en']) {
      const doc = buildTemplate(id, { language });
      const { doc: back, template } = Fm.parseDiagram(Fm.serialize(doc, { template: true }), language);
      assert.equal(template, true, id);
      assert.deepEqual(back, JSON.parse(JSON.stringify(doc)), `${id} (${language})`);
    }
  }
  const en = buildSample('en');
  assert.deepEqual(Fm.parseDiagram(Fm.serialize(en)).doc, JSON.parse(JSON.stringify(en)));
});

test('parseDiagram refuses what is not a drawing, with a code', () => {
  failsWith(() => Fm.parseDiagram('not json'), 'format.notJson');
  failsWith(() => Fm.parseDiagram(''), 'format.notJson');
  failsWith(() => Fm.parseDiagram('42'), 'format.notDiagram');
  failsWith(() => Fm.parseDiagram('null'), 'format.notDiagram');
  failsWith(() => Fm.parseDiagram('{"format":"myworkplan","version":1,"project":{}}'), 'format.notDiagram');
  failsWith(() => Fm.parseDiagram('{"format":"mydiagram","version":1}'), 'format.notDiagram');
  failsWith(() => Fm.parseDiagram('{"format":"mydiagram","version":99,"document":{"pages":[]}}'), 'format.newer');
  failsWith(() => Fm.normalizeDocument({ title: 'x' }), 'format.notDiagram');
});

test('parseDiagram accepts a byte order mark and a bare document object', () => {
  const doc = D.createDocument({ title: 'Bare' });
  assert.equal(Fm.parseDiagram(`\uFEFF${Fm.serialize(doc)}`).doc.title, 'Bare');
  assert.equal(Fm.parseDiagram(JSON.stringify(doc)).doc.title, 'Bare');
});

test('a minimal document gets every field', () => {
  const doc = repaired({ pages: [] });
  assert.equal(doc.pages.length, 1, 'a drawing always has a page');
  assert.equal(doc.title, 'Drawing');
  assert.equal(doc.design, 'office');
  assert.equal(doc.options.connectorRoute, 'orthogonal');
  const en = Fm.parseDiagram(raw({ pages: [{}] }), 'en').doc;
  assert.equal(en.pages[0].name, 'Page-1');
  assert.equal(en.units, 'in');
});

test('documents, pages and options are repaired', () => {
  const doc = repaired({
    title: 42, design: 'nope', variant: 9, units: 'furlong', options: { lineJumps: 0, connectorRoute: 'zigzag', glue: true }, stencils: ['basic', 'gantt'],
    pages: [{ name: 'P', width: 10, height: 'x', orientation: 'up', color: 'blue?', layers: [{ name: 'L', id: 'l1' }, 'junk'], activeLayer: 'missing', guides: [{ orient: 'h', pos: 5 }, { orient: 'd' }], backgroundId: 'self' }],
  });
  assert.deepEqual([doc.title, doc.design, doc.variant, doc.units], ['42', 'office', 3, 'mm']);
  assert.deepEqual([doc.options.lineJumps, doc.options.glue, doc.options.connectorRoute], [false, true, 'orthogonal']);
  assert.deepEqual(doc.stencils, ['basic']);
  const page = doc.pages[0];
  assert.equal(page.width, 50, 'pages have a minimum size');
  assert.ok(page.height > 50);
  assert.deepEqual([page.orientation, page.color, page.activeLayer, page.backgroundId], ['landscape', '', null, null]);
  assert.deepEqual(page.layers.map((l) => [l.id, l.name, l.visible]), [['l1', 'L', true]]);
  assert.deepEqual(page.guides.map((g) => [g.orient, g.pos]), [['h', 5]]);
});

test('shapes are repaired: unknown masters, bad numbers, styles, layers, duplicate ids', () => {
  const doc = repaired({
    pages: [{
      layers: [{ id: 'l1', name: 'L' }],
      shapes: [
        { id: 's1', master: 'nonexistent', x: 'a', y: 5, w: -3, h: 'x', angle: 450, style: { fill: 'nope', line: '#123456', lineWidth: '2', bold: 1, junk: 1 }, layers: ['l1', 'l9'], data: [{ key: 'K', value: 3 }] },
        { id: 's1', master: 'ellipse' },
        { type: 'connector', id: 'c1', from: { id: 's1', pt: 2.4 }, to: { id: 'gone' }, route: 'zigzag', textPos: 4, waypoints: [{ x: 1, y: 2 }, { x: 'q' }] },
        { type: 'group', id: 'g1' },
        'junk',
      ],
    }],
  });
  const [s1, s2, c1, ...rest] = doc.pages[0].shapes;
  assert.equal(rest.length, 0, 'empty groups and junk go');
  assert.deepEqual([s1.master, s1.x, s1.y, s1.w, s1.h, s1.angle], ['rect', 0, 5, 1, 60, 90]);
  assert.deepEqual(s1.style, { line: '#123456', lineWidth: 2, bold: true });
  assert.deepEqual(s1.layers, ['l1']);
  assert.deepEqual(s1.data.map((f) => [f.key, f.value]), [['K', '3']]);
  assert.notEqual(s2.id, 's1', 'a duplicate id gets a new one');
  assert.deepEqual(c1.from, { id: 's1', pt: 2 });
  assert.deepEqual(c1.to, { x: 0, y: 0 }, 'glue to a missing shape becomes a free end');
  assert.deepEqual([c1.route, c1.textPos, c1.waypoints], ['orthogonal', 1, [{ x: 1, y: 2 }]]);
});

test('groups keep their members and boxes; members of missing groups are freed', () => {
  const doc = repaired({
    pages: [{
      shapes: [
        { id: 'a', master: 'rect', x: 0, y: 0, w: 10, h: 10, groupId: 'g' },
        { id: 'b', master: 'rect', x: 90, y: 40, w: 10, h: 10, groupId: 'g' },
        { id: 'c', master: 'rect', groupId: 'nope' },
        { id: 'g', type: 'group' },
      ],
    }],
  });
  const [a, , c, g] = doc.pages[0].shapes;
  assert.deepEqual([a.groupId, c.groupId], ['g', null]);
  assert.deepEqual([g.x, g.y, g.w, g.h], [0, 0, 100, 50], 'the group box is worked out from its members');
});

test('file name helpers', () => {
  assert.equal(Fm.baseName('C:\\Drawings\\Site.mdg'), 'Site.mdg');
  assert.equal(Fm.baseName('/home/me/site.mdg'), 'site.mdg');
  assert.equal(Fm.baseName(null), '');
  assert.equal(Fm.directoryOf('C:\\Drawings\\Site.mdg'), 'C:\\Drawings');
  assert.equal(Fm.directoryOf('/home/me/site.mdg'), '/home/me');
  assert.equal(Fm.directoryOf('site.mdg'), '');
  assert.equal(Fm.directoryOf('/site.mdg'), '', 'the root has no directory text');
  assert.equal(Fm.extensionOf('Drawing.MDG'), 'mdg');
  assert.equal(Fm.extensionOf('archive.tar.gz'), 'gz');
  assert.equal(Fm.extensionOf('dir.v2/noext'), '', 'a dot in a folder name is not an extension');
  assert.equal(Fm.stripExtension('a/b.c/site.mdg'), 'a/b.c/site');
  assert.equal(Fm.withExtension('site', 'mdg'), 'site.mdg');
  assert.equal(Fm.withExtension('site.MDG', 'mdg'), 'site.MDG', 'already right, whatever the case');
  assert.equal(Fm.withExtension('C:\\x\\site.json', 'mdgt'), 'C:\\x\\site.mdgt');
  for (const name of ['a.mdg', 'a.MDGT', 'a.json']) assert.ok(Fm.isDiagramFileName(name), name);
  for (const name of ['a.vsdx', 'a.mdg.bak', 'mdg']) assert.ok(!Fm.isDiagramFileName(name), name);
  assert.ok(Fm.isTemplateFileName('x.mdgt') && !Fm.isTemplateFileName('x.mdg'));
  for (const name of ['a.vsdx', 'A.VSTX', 'a.vssx']) assert.ok(Fm.isVsdxFileName(name), name);
  assert.ok(Fm.isOpenableFileName('a.vsdx') && Fm.isOpenableFileName('a.mdg') && !Fm.isOpenableFileName('a.png'));
  assert.ok(Fm.isSvgFileName('x.SVG'));
  for (const name of ['a.csv', 'a.tsv', 'a.txt']) assert.ok(Fm.isCsvFileName(name), name);
  for (const name of ['a.png', 'a.JPG', 'a.jpeg', 'a.svg', 'a.webp', 'a.avif']) assert.ok(Fm.isImageFileName(name), name);
  assert.ok(!Fm.isImageFileName('a.pdf'));
  assert.deepEqual([Fm.DRAWING_EXTENSION, Fm.TEMPLATE_EXTENSION], ['mdg', 'mdgt']);
});
