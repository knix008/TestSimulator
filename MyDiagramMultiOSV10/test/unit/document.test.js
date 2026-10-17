// An open drawing: undoable changes, undo / redo, the "unsaved changes" flag,
// cached connector routes and the saved text; and the drawing operations
// (shapes, groups, arranging, layers, pages, clipboard, find & replace).
import assert from 'node:assert/strict';
import test from 'node:test';
import { DiagramDocument } from '../../src/domain/document.js';
import { parseDiagram } from '../../src/domain/format.js';
import * as D from '../../src/domain/diagram.js';

function open() {
  const doc = D.createDocument({ title: 'Doc', language: 'ko' });
  const page = doc.pages[0];
  const a = D.addShape(page, D.createShape('rect', { x: 100, y: 100, w: 120, h: 60, text: 'A' }));
  const b = D.addShape(page, D.createShape('ellipse', { x: 400, y: 100, w: 120, h: 60, text: 'B' }));
  const c = D.addShape(page, D.createConnector({ id: a.id, pt: 'auto' }, { id: b.id, pt: 'auto' }));
  return { tab: new DiagramDocument(doc, { path: 'C:\\drawings\\doc.mdg', name: 'doc.mdg' }), a: a.id, b: b.id, c: c.id };
}
const shapeOf = (tab, id) => tab.page.shapes.find((shape) => shape.id === id);

test('a new document is clean, has no history and opens on its first page', () => {
  const { tab } = open();
  assert.equal(tab.dirty, false);
  assert.equal(tab.history.canUndo, false);
  assert.equal(tab.history.canRedo, false);
  assert.deepEqual([tab.path, tab.name, tab.fromTemplate], ['C:\\drawings\\doc.mdg', 'doc.mdg', false]);
  assert.equal(tab.view.id, 'drawing');
  assert.equal(tab.page, tab.doc.pages[0]);
  assert.ok(tab.id.startsWith('tab-'));
  assert.notEqual(new DiagramDocument(D.createDocument()).id, tab.id);
});

test('apply records one undo step, undo and redo restore the drawing', () => {
  const { tab, a } = open();
  const label = tab.apply('action.move', (doc) => D.moveShapes(doc.pages[0], [a], 50, 20));
  assert.equal(label, 1, 'apply returns what the change returned');
  assert.deepEqual([shapeOf(tab, a).x, shapeOf(tab, a).y], [150, 120]);
  assert.equal(tab.dirty, true);
  assert.equal(tab.history.canUndo, true);
  assert.equal(tab.undo(), 'action.move');
  assert.deepEqual([shapeOf(tab, a).x, shapeOf(tab, a).y], [100, 100]);
  assert.equal(tab.dirty, false, 'back to the saved drawing');
  assert.equal(tab.redo(), 'action.move');
  assert.equal(shapeOf(tab, a).x, 150);
  assert.equal(tab.redo(), null, 'nothing more to redo');
});

test('a change that changes nothing is not recorded; a failing change leaves no step', () => {
  const { tab, a } = open();
  tab.apply('action.move', (doc) => D.moveShapes(doc.pages[0], [a], 0, 0));
  assert.equal(tab.history.canUndo, false);
  assert.throws(() => tab.apply('action.move', () => { throw new Error('boom'); }), /boom/);
  assert.equal(tab.history.canUndo, false);
});

test('routes are cached per page and recomputed after a change', () => {
  const { tab, a, c } = open();
  const first = tab.routes();
  assert.equal(tab.routes(), first, 'the same map until the drawing changes');
  const route = first.get(c);
  assert.ok(route.points.length >= 2);
  assert.ok(route.length > 100);
  tab.apply('action.move', (doc) => D.moveShapes(doc.pages[0], [a], 0, 200));
  assert.notEqual(tab.routes(), first);
  assert.notDeepEqual(tab.routes().get(c).points, route.points, 'the connector follows the shape');
});

test('markSaved clears the dirty flag and the template mark; text() reads back', () => {
  const { tab, a } = open();
  tab.fromTemplate = true;
  tab.apply('action.text', (doc) => D.setText(doc.pages[0], a, 'Start'));
  tab.markSaved('C:\\drawings\\new.mdg');
  assert.deepEqual([tab.dirty, tab.fromTemplate, tab.path], [false, false, 'C:\\drawings\\new.mdg']);
  const { doc, template } = parseDiagram(tab.text());
  assert.equal(template, false);
  assert.equal(doc.pages[0].shapes.find((s) => s.id === a).text, 'Start');
  assert.equal(parseDiagram(tab.text({ template: true })).template, true);
});

test('lengths convert between units', () => {
  assert.equal(D.formatLength(96, 'in'), '1 in');
  assert.equal(D.formatLength(D.fromUnit(25, 'mm'), 'mm'), '25 mm');
  assert.equal(Math.round(D.parseLength('1in')), 96);
  assert.equal(Math.round(D.parseLength('2.54 cm')), 96);
  assert.equal(Math.round(D.parseLength('72pt')), 96);
  assert.equal(Math.round(D.parseLength('25,4', 'mm')), 96, 'a comma decimal in the default unit');
  assert.equal(D.parseLength('wide'), null);
});

test('a new document follows its language: paper, units, page name', () => {
  const ko = D.createDocument({ language: 'ko' });
  const en = D.createDocument({ language: 'en' });
  assert.deepEqual([ko.units, ko.pages[0].paper, ko.pages[0].name], ['mm', 'A4', '페이지-1']);
  assert.deepEqual([en.units, en.pages[0].paper, en.pages[0].name], ['in', 'Letter', 'Page-1']);
  assert.ok(ko.pages[0].width > ko.pages[0].height, 'landscape by default');
});

test('deleting a shape deletes the connectors glued to it', () => {
  const { tab, a, b, c } = open();
  const page = tab.page;
  assert.equal(D.deleteShapes(page, [a]), 2);
  assert.deepEqual(page.shapes.map((s) => s.id), [b]);
  assert.equal(page.shapes.some((s) => s.id === c), false);
});

test('grouping, moving a group and ungrouping', () => {
  const { tab, a, b } = open();
  const page = tab.page;
  const group = D.groupShapes(page, [a, b]);
  assert.ok(group);
  assert.deepEqual([group.x, group.y, group.w, group.h], [100, 100, 420, 60], 'the group box spans its members');
  D.moveShapes(page, [group.id], 10, 10);
  assert.deepEqual([shapeOf(tab, a).x, shapeOf(tab, b).x, group.x], [110, 410, 110]);
  D.setBox(page, group.id, { x: 110, y: 110, w: 840, h: 120 });
  assert.deepEqual([shapeOf(tab, b).x, shapeOf(tab, b).w], [710, 240], 'resizing a group scales its members');
  assert.deepEqual(D.ungroupShapes(page, [group.id]).sort(), [a, b].sort());
  assert.equal(page.shapes.some((s) => s.type === 'group'), false);
  assert.equal(shapeOf(tab, a).groupId, null);
  assert.equal(D.groupShapes(page, [a]), null, 'one shape is no group');
});

test('a group left with one member dissolves', () => {
  const { tab, a, b } = open();
  const page = tab.page;
  const group = D.groupShapes(page, [a, b]);
  D.deleteShapes(page, [b]);
  assert.equal(page.shapes.some((s) => s.id === group.id), false);
  assert.equal(shapeOf(tab, a).groupId, null);
});

test('align, distribute and same size', () => {
  const doc = D.createDocument();
  const page = doc.pages[0];
  const s1 = D.addShape(page, D.createShape('rect', { x: 0, y: 0, w: 100, h: 50 }));
  const s2 = D.addShape(page, D.createShape('rect', { x: 150, y: 80, w: 60, h: 40 }));
  const s3 = D.addShape(page, D.createShape('rect', { x: 600, y: 30, w: 80, h: 30 }));
  const ids = [s1.id, s2.id, s3.id];
  D.alignShapes(page, ids, 'top');
  assert.deepEqual(ids.map((id) => D.findShape(page, id).y), [0, 0, 0], 'aligned to the first shape');
  D.alignShapes(page, ids, 'middle');
  assert.deepEqual(ids.map((id) => { const s = D.findShape(page, id); return s.y + s.h / 2; }), [25, 25, 25]);
  D.distributeShapes(page, ids, 'h');
  const gap1 = s2.x - (s1.x + s1.w);
  const gap2 = s3.x - (s2.x + s2.w);
  assert.ok(Math.abs(gap1 - gap2) < 0.01, 'equal gaps');
  assert.deepEqual([s1.x, s3.x], [0, 600], 'the outer shapes stay');
  D.sameSize(page, ids, 'width');
  assert.deepEqual([s2.w, s3.w, s2.h], [100, 100, 40]);
});

test('rotate and flip', () => {
  const doc = D.createDocument();
  const page = doc.pages[0];
  const s = D.addShape(page, D.createShape('rect', { x: 0, y: 0, w: 100, h: 50 }));
  D.rotateShapes(page, [s.id], 90);
  assert.equal(s.angle, 90);
  assert.deepEqual([s.x, s.y], [0, 0], 'one shape turns around its own centre');
  D.rotateShapes(page, [s.id], 300);
  assert.equal(s.angle, 30, 'angles stay within 0…360');
  D.flipShapes(page, [s.id], 'h');
  assert.equal(s.flipH, true);
  D.flipShapes(page, [s.id], 'v');
  assert.equal(s.flipV, true);
});

test('z-order: front, back, forward, backward', () => {
  const doc = D.createDocument();
  const page = doc.pages[0];
  const [p, q, r] = ['rect', 'rect', 'rect'].map((m, i) => D.addShape(page, D.createShape(m, { x: i * 20, y: 0, w: 100, h: 100 })));
  const order = () => page.shapes.map((s) => s.id);
  D.reorder(page, [p.id], 'front');
  assert.deepEqual(order(), [q.id, r.id, p.id]);
  D.reorder(page, [p.id], 'back');
  assert.deepEqual(order(), [p.id, q.id, r.id]);
  D.reorder(page, [p.id], 'forward');
  assert.deepEqual(order(), [q.id, p.id, r.id]);
  D.reorder(page, [p.id], 'backward');
  assert.deepEqual(order(), [p.id, q.id, r.id]);
});

test('styles patch and reset; quick styles drop explicit colours', () => {
  const { tab, a } = open();
  const page = tab.page;
  D.setStyle(page, [a], { fill: '#ff0000', lineWidth: 3 });
  assert.deepEqual(shapeOf(tab, a).style, { fill: '#ff0000', lineWidth: 3 });
  D.setStyle(page, [a], { lineWidth: null });
  assert.deepEqual(shapeOf(tab, a).style, { fill: '#ff0000' });
  D.setQuickStyle(page, [a], { color: 3, variant: 'subtle' });
  assert.deepEqual([shapeOf(tab, a).qs, shapeOf(tab, a).style], [{ color: 3, variant: 'subtle' }, {}]);
  D.clearStyle(page, [a]);
  assert.deepEqual([shapeOf(tab, a).qs, shapeOf(tab, a).style], [{}, {}]);
});

test('shape data is cleaned and its keys are listed', () => {
  const data = D.normalizeData([{ key: 'Cost', type: 'currency', value: 12 }, { label: 'Owner', value: 'Kim' }, { key: ' ' }, null, { key: 'X', type: 'weird' }]);
  assert.deepEqual(data.map((f) => [f.key, f.type, f.value]), [['Cost', 'currency', '12'], ['Owner', 'text', 'Kim'], ['X', 'text', '']]);
  const doc = D.createDocument();
  D.addShape(doc.pages[0], D.createShape('rect', { data }));
  assert.deepEqual(D.dataKeys(doc.pages), ['Cost', 'Owner', 'X']);
  assert.equal(D.dataValue(doc.pages[0].shapes[0], 'Owner'), 'Kim');
});

test('layers: new shapes go on the active layer; deleting a layer frees or deletes its shapes', () => {
  const doc = D.createDocument();
  const page = doc.pages[0];
  const layer = D.addLayer(page, 'Notes');
  page.activeLayer = layer.id;
  const s = D.addShape(page, D.createShape('rect'));
  assert.deepEqual(s.layers, [layer.id]);
  const other = D.addLayer(page, 'Other');
  D.assignLayer(page, [s.id], other.id, 'add');
  assert.deepEqual(s.layers, [layer.id, other.id]);
  D.assignLayer(page, [s.id], layer.id, 'remove');
  assert.deepEqual(s.layers, [other.id]);
  D.deleteLayer(page, other.id);
  assert.deepEqual(s.layers, []);
  const t = D.addShape(page, D.createShape('rect'));
  D.deleteLayer(page, layer.id, { deleteShapes: true });
  assert.equal(page.shapes.some((x) => x.id === t.id), false, 'shapes only on that layer go with it');
  assert.equal(page.activeLayer, null);
});

test('pages: add, duplicate (new ids, glue kept), move, delete', () => {
  const { tab, a, c } = open();
  const doc = tab.doc;
  const second = D.addPage(doc, { name: '페이지-1' });
  assert.equal(second.name, '페이지-2', 'names stay unique');
  const copy = D.duplicatePage(doc, doc.pages[0].id);
  assert.equal(doc.pages[1], copy, 'the copy follows its source');
  assert.notEqual(copy.shapes[0].id, a);
  const con = copy.shapes.find((s) => s.type === 'connector');
  assert.notEqual(con.id, c);
  assert.ok(copy.shapes.some((s) => s.id === con.from.id), 'the connector is glued to the copied shapes');
  D.movePage(doc, second.id, 0);
  assert.equal(doc.pages[0], second);
  const bg = D.addPage(doc, { name: 'BG', background: true });
  second.backgroundId = bg.id;
  assert.equal(D.deletePage(doc, bg.id), true);
  assert.equal(second.backgroundId, null, 'pages lose a deleted background');
  while (doc.pages.length > 1) D.deletePage(doc, doc.pages[0].id);
  assert.equal(D.deletePage(doc, doc.pages[0].id), false, 'the last page stays');
});

test('copy and paste: new ids, connectors between copied shapes stay glued', () => {
  const { tab, a, b } = open();
  const page = tab.page;
  const clip = D.copyShapes(page, [a, b]);
  assert.equal(clip.mark, D.CLIP_MARK);
  assert.equal(clip.shapes.length, 3, 'the connector between them comes along');
  const ids = D.pasteShapes(page, clip);
  assert.equal(ids.length, 3);
  assert.equal(page.shapes.length, 6);
  const pasted = page.shapes.slice(3);
  const con = pasted.find((s) => s.type === 'connector');
  assert.ok(ids.includes(con.from.id) && ids.includes(con.to.id));
  assert.equal(pasted.find((s) => s.type === 'shape').x, 120, 'offset by 20');
  const single = D.copyShapes(page, [a]);
  assert.equal(single.shapes.length, 1, 'a connector to a shape left behind does not come');
  const placed = D.pasteShapes(page, single, { at: { x: 1000, y: 1000 } });
  const s = D.findShape(page, placed[0]);
  assert.deepEqual([s.x + s.w / 2, s.y + s.h / 2], [1000, 1000]);
});

test('find and replace across pages', () => {
  const { tab, a } = open();
  const doc = tab.doc;
  const page2 = D.addPage(doc);
  D.addShape(page2, D.createShape('rect', { text: 'Approve order', data: D.normalizeData([{ key: 'Owner', value: 'Order desk' }]) }));
  D.setText(doc.pages[0], a, 'order received');
  assert.equal(D.findMatches(doc, 'order').length, 2);
  assert.equal(D.findMatches(doc, 'Order', { matchCase: true }).length, 1, 'only the data value starts with a capital');
  assert.equal(D.findMatches(doc, 'desk').length, 1, 'data values are searched');
  assert.equal(D.findMatches(doc, 'desk', { data: false }).length, 0);
  assert.equal(D.findMatches(doc, 'ord', { whole: true }).length, 0);
  assert.equal(D.replaceText(doc, 'order', 'Order'), 2);
  assert.equal(D.findShape(doc.pages[0], a).text, 'Order received');
  assert.deepEqual(D.findMatches(doc, ''), [], 'an empty search finds nothing');
});

test('statistics and the connection graph', () => {
  const { tab, a, b } = open();
  const stats = D.statistics(tab.doc);
  assert.deepEqual([stats.pages, stats.shapes, stats.connectors, stats.groups, stats.texts], [1, 2, 1, 0, 2]);
  assert.equal(stats.byMaster.get('rect'), 1);
  assert.deepEqual(D.connectionGraph(tab.page).map((e) => [e.from, e.to]), [[a, b]]);
});
