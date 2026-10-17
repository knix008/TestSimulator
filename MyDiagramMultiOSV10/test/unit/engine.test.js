// The drawing engine: stencil masters, connector routing, automatic layout,
// Visio (.vsdx) export / import, CSV data link and org charts, the SVG
// renderer, templates and samples, and print sheets.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as D from '../../src/domain/diagram.js';
import { CATEGORIES, MASTERS, connectionPoints, masterById, mastersIn, searchMasters, shapeParams } from '../../src/domain/stencils.js';
import { orthogonalRoute, routeConnector, routePage, simplify } from '../../src/domain/routing.js';
import { LAYOUTS, layoutPage } from '../../src/domain/layout.js';
import { exportShapeDataCsv, exportVsdx, importVsdx, linkDataCsv, orgChartFromData, shapesFromText, unzip } from '../../src/domain/interop.js';
import { masterIcon, renderPageSvg, wrapText } from '../../src/render/svg.js';
import { SAMPLE_FILES, TEMPLATES, buildSample, buildTemplate } from '../../src/domain/templates.js';
import { renderPrintSheets, selectPages } from '../../src/print/render.js';
import { parseCsv, toCsv } from '../../src/domain/csv.js';
import { pathBounds, parsePath, scalePath } from '../../src/domain/path.js';

const NOW = new Date('2026-10-17T09:00:00Z');
const finite = (svg) => !/NaN|Infinity|undefined/.test(svg);

function twoBoxes({ gap = 300, obstacle = false } = {}) {
  const doc = D.createDocument();
  const page = doc.pages[0];
  const a = D.addShape(page, D.createShape('rect', { x: 100, y: 100, w: 100, h: 60 }));
  const b = D.addShape(page, D.createShape('rect', { x: 100 + gap, y: 100, w: 100, h: 60 }));
  const block = obstacle ? D.addShape(page, D.createShape('rect', { x: 100 + gap / 2 - 20, y: 60, w: 40, h: 140 })) : null;
  const c = D.addShape(page, D.createConnector({ id: a.id, pt: 'auto' }, { id: b.id, pt: 'auto' }));
  return { doc, page, a, b, c, block };
}

test('stencils: every category has masters, every master renders without NaN', () => {
  assert.equal(CATEGORIES.length, 15);
  for (const cat of CATEGORIES) assert.ok(mastersIn(cat.id).length >= 5, `${cat.id} has masters`);
  assert.ok(MASTERS.length >= 200, `${MASTERS.length} masters`);
  const ids = new Set();
  for (const master of MASTERS) {
    assert.ok(!ids.has(master.id), `unique id ${master.id}`);
    ids.add(master.id);
    assert.ok(master.name.ko && master.name.en, `${master.id} has names`);
    if (!master.cat) continue;
    const icon = masterIcon(master.id, { size: 40 });
    assert.match(icon, /^<svg/, master.id);
    assert.ok(finite(icon), `${master.id}: no NaN in the icon`);
  }
  assert.equal(masterById('nope').id, 'rect', 'unknown masters fall back to a rectangle');
});

test('stencils: connection points, parameters and search', () => {
  const shape = D.createShape('rect', { x: 0, y: 0, w: 200, h: 100 });
  const points = connectionPoints(shape);
  assert.ok(points.length >= 4);
  assert.ok(points.some((p) => p.x === 100 && p.y === 0), 'top middle');
  const withParams = MASTERS.find((m) => m.cat && Object.keys(m.params ?? {}).length);
  const s = D.createShape(withParams.id);
  const [key, def] = Object.entries(withParams.params)[0];
  assert.equal(shapeParams(s)[key], def.def, 'defaults');
  s.params[key] = 0.3;
  assert.equal(shapeParams(s)[key], 0.3);
  assert.ok(searchMasters('decision').some((m) => m.id === 'decision'));
  assert.ok(searchMasters('결정').length >= 1, 'Korean names are searched');
  assert.deepEqual(searchMasters('  '), []);
});

test('routing: orthogonal route between two shapes, simplified, with right angles only', () => {
  const { doc, page, c } = twoBoxes();
  const route = routeConnector(doc, page, c);
  assert.ok(route.points.length >= 2);
  for (let i = 1; i < route.points.length; i++) {
    const [p, q] = [route.points[i - 1], route.points[i]];
    assert.ok(Math.abs(p.x - q.x) < 0.01 || Math.abs(p.y - q.y) < 0.01, 'segments are horizontal or vertical');
  }
  assert.equal(route.points[0].x, 200, 'leaves from the right side of the first shape');
  assert.equal(route.points.at(-1).x, 400, 'arrives at the left side of the second');
  assert.ok(Math.abs(route.length - 200) < 1);
  assert.deepEqual(simplify([{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }]), [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }]);
});

test('routing: connectors go around shapes in the way; straight and curved routes', () => {
  const { doc, page, c, block } = twoBoxes({ obstacle: true });
  const route = routeConnector(doc, page, c);
  const box = { x: block.x, y: block.y, w: block.w, h: block.h };
  for (let i = 1; i < route.points.length; i++) {
    const [p, q] = [route.points[i - 1], route.points[i]];
    const midX = (p.x + q.x) / 2; const midY = (p.y + q.y) / 2;
    assert.ok(!(midX > box.x + 1 && midX < box.x + box.w - 1 && midY > box.y + 1 && midY < box.y + box.h - 1), 'no segment runs through the obstacle');
  }
  assert.ok(route.points.length >= 4, 'it bends around');
  c.route = 'straight';
  assert.equal(routeConnector(doc, page, c).points.length, 2);
  c.route = 'curved';
  assert.ok(routeConnector(doc, page, c).curve, 'a curved route has a curve path');
  const direct = orthogonalRoute({ x: 0, y: 0 }, 'right', { x: 100, y: 50 }, 'left');
  assert.ok(direct.length >= 3);
});

test('routing: crossing connectors get line jumps', () => {
  const doc = D.createDocument();
  const page = doc.pages[0];
  const l = D.addShape(page, D.createShape('rect', { x: 0, y: 200, w: 60, h: 40 }));
  const r = D.addShape(page, D.createShape('rect', { x: 400, y: 200, w: 60, h: 40 }));
  const t = D.addShape(page, D.createShape('rect', { x: 200, y: 0, w: 60, h: 40 }));
  const btm = D.addShape(page, D.createShape('rect', { x: 200, y: 400, w: 60, h: 40 }));
  D.addShape(page, D.createConnector({ id: t.id, pt: 'auto' }, { id: btm.id, pt: 'auto' }));
  const h = D.addShape(page, D.createConnector({ id: l.id, pt: 'auto' }, { id: r.id, pt: 'auto' }));
  const routes = routePage(doc, page);
  assert.ok(routes.get(h.id).jumps?.length || routes.get(h.id).path?.includes('A') || JSON.stringify(routes.get(h.id)).includes('jump'), 'the later connector jumps over the earlier one');
});

test('layout: every layout places connected shapes without overlaps', () => {
  for (const kind of LAYOUTS) {
    const doc = D.createDocument();
    const page = doc.pages[0];
    const ids = [];
    for (let i = 0; i < 7; i++) ids.push(D.addShape(page, D.createShape('process', { x: 50, y: 50, text: `N${i}` })).id);
    for (const [from, to] of [[0, 1], [0, 2], [1, 3], [1, 4], [2, 5], [2, 6]]) D.addShape(page, D.createConnector({ id: ids[from], pt: 'auto' }, { id: ids[to], pt: 'auto' }));
    assert.ok(layoutPage(page, { kind, spacing: 40 }) > 0, kind);
    const boxes = ids.map((id) => D.findShape(page, id));
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const [p, q] = [boxes[i], boxes[j]];
        const overlap = p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h;
        assert.ok(!overlap, `${kind}: N${i} and N${j} do not overlap`);
      }
    }
    if (kind === 'treeTB' || kind === 'flowTB') assert.ok(boxes[3].y > boxes[1].y && boxes[1].y > boxes[0].y, `${kind}: levels go down`);
    if (kind === 'treeLR' || kind === 'flowLR') assert.ok(boxes[3].x > boxes[1].x && boxes[1].x > boxes[0].x, `${kind}: levels go right`);
  }
});

test('Visio: export → import keeps pages, shapes, text, glue, rotation and data', async () => {
  const doc = buildSample('ko');
  const bytes = exportVsdx(doc, { now: NOW });
  assert.equal(String.fromCharCode(bytes[0], bytes[1]), 'PK', 'a zip file');
  const files = await unzip(bytes);
  const names = files.names;
  for (const name of ['[Content_Types].xml', 'visio/document.xml', 'visio/pages/pages.xml', 'visio/pages/page1.xml']) assert.ok(names.includes(name), name);
  const back = await importVsdx(bytes, { language: 'ko', title: 'round' });
  assert.equal(back.pages.length, doc.pages.length);
  for (let i = 0; i < doc.pages.length; i++) {
    const [p, q] = [doc.pages[i], back.pages[i]];
    assert.equal(q.name, p.name);
    assert.equal(q.background, p.background, `${p.name}: background page`);
    const shapes = (page) => page.shapes.filter((s) => s.type === 'shape');
    const cons = (page) => page.shapes.filter((s) => s.type === 'connector');
    assert.equal(shapes(q).length, shapes(p).length, `${p.name}: shapes`);
    assert.equal(cons(q).length, cons(p).length, `${p.name}: connectors`);
    assert.deepEqual(shapes(q).map((s) => s.text).sort(), shapes(p).map((s) => s.text).sort(), `${p.name}: texts`);
    assert.ok(cons(q).filter((c) => c.from.id && c.to.id).length === cons(p).filter((c) => c.from.id && c.to.id).length, `${p.name}: glue`);
  }
  const dataOf = (d) => d.pages.flatMap((p) => p.shapes).filter((s) => s.data?.length).length;
  assert.equal(dataOf(back), dataOf(doc), 'shape data');
});

test('CSV: shape data export, data link and org chart from data', () => {
  const doc = buildSample('en');
  const csv = exportShapeDataCsv(doc, { language: 'en' });
  const rows = parseCsv(csv.replace(/^﻿/, ''));
  assert.ok(rows.length > 5 && rows[0].length >= 4);
  const page = D.createDocument().pages[0];
  D.addShape(page, D.createShape('process', { text: 'Pack' }));
  const linked = linkDataCsv(null, page, 'Text,Owner,Hours\nPack,Kim,4\nShip,Lee,2\n', { createMissing: true });
  assert.deepEqual(linked, { matched: 2, rows: 2, created: 1 });
  assert.equal(D.dataValue(page.shapes[0], 'Owner'), 'Kim');
  assert.equal(page.shapes[1].text, 'Ship');
  assert.equal(page.shapes[0].data.find((f) => f.key === 'Hours').type, 'number');
  const org = D.createDocument().pages[0];
  const result = orgChartFromData(org, '이름,직함,상사,부서\n김대표,대표,,경영\n이부장,부장,김대표,영업\n박과장,과장,이부장,영업\n최대리,대리,이부장,영업\n');
  assert.deepEqual(result, { count: 4, roots: 1 });
  assert.equal(org.shapes.filter((s) => s.type === 'connector').length, 3);
  const top = org.shapes.find((s) => s.name === '김대표');
  assert.equal(top.master, 'orgExecutive');
  assert.ok(org.shapes.filter((s) => s.type === 'shape').every((s) => s === top || s.y > top.y), 'the boss is on top');
  assert.equal(D.dataValue(org.shapes.find((s) => s.name === '박과장'), '부서'), '영업');
  const list = D.createDocument().pages[0];
  assert.equal(shapesFromText(list, 'one\ntwo\nthree').length, 3);
  assert.equal(list.shapes.filter((s) => s.type === 'connector').length, 2, 'a list becomes a connected flow');
  assert.equal(toCsv([['a', 'b,c']]), '﻿a,"b,c"\r\n');
});

test('render: pages, content and selection areas; fields; print-only layers', () => {
  const doc = buildSample('ko');
  const page = doc.pages[0];
  const full = renderPageSvg(doc, page, { now: NOW });
  assert.ok(finite(full.svg));
  assert.equal(Math.round(full.width), Math.round(D.drawingSize(page).width));
  const content = renderPageSvg(doc, page, { area: 'content', now: NOW });
  assert.ok(content.width <= full.width + 1);
  const one = page.shapes.find((s) => s.type === 'shape' && s.text && s.w < 200);
  const sel = renderPageSvg(doc, page, { area: 'selection', ids: [one.id], now: NOW });
  assert.ok(sel.width < content.width);
  assert.ok(sel.svg.includes(one.text.split('\n')[0].slice(0, 4)));
  // The background page's title block shows the foreground page's name and number.
  const fg = doc.pages.find((p) => p.backgroundId);
  if (fg) {
    const withBg = renderPageSvg(doc, fg, { now: NOW, pageNumber: 1, pageCount: 3 });
    assert.ok(withBg.svg.includes(fg.name.replace(/&/g, '&amp;')), 'the {pageName} field is the foreground page');
  }
  const lines = wrapText('가나다라마바사아자차카타파하 가나다라마바사', 80, { fontSize: 12 });
  assert.ok(lines.length >= 2, 'long text wraps');
});

test('templates and samples build and render in both languages', () => {
  assert.ok(TEMPLATES.length >= 12);
  for (const { id } of TEMPLATES) {
    for (const language of ['ko', 'en']) {
      const doc = buildTemplate(id, { language });
      assert.equal(doc.language, language);
      assert.ok(Array.isArray(doc.stencils) && doc.stencils.length, `${id}: opens its stencils`);
      for (const page of doc.pages) assert.ok(finite(renderPageSvg(doc, page, { now: NOW }).svg), `${id}/${page.name}`);
      if (id !== 'blank') assert.ok(doc.pages[0].shapes.length > 0, `${id} has a starting drawing`);
    }
  }
  for (const [name, build] of Object.entries(SAMPLE_FILES)) {
    const doc = build('en');
    assert.ok(doc.pages.some((p) => p.shapes.length > 3), name);
  }
  const sample = buildSample('ko');
  assert.ok(sample.pages.length >= 4 && sample.pages.some((p) => p.background), 'the sample has a background page');
});

test('print: page ranges, fit to one sheet, tiles at 100 %', () => {
  const doc = buildSample('ko');
  const foreground = doc.pages.filter((p) => !p.background);
  assert.equal(selectPages(doc, { range: 'all' }).length, foreground.length);
  assert.deepEqual(selectPages(doc, { range: 'current' }, foreground[1].id).map((p) => p.id), [foreground[1].id]);
  assert.equal(selectPages(doc, { range: 'custom', from: 2, to: 2 })[0].id, foreground[1].id);
  const fit = renderPrintSheets(doc, { fit: 'fit', range: 'all' }, { now: NOW });
  assert.equal(fit.count, foreground.length, 'one sheet per page when fitted');
  assert.ok(fit.pages.every((sheet) => finite(sheet.svg) && sheet.width > sheet.height), 'landscape sheets');
  const tiled = renderPrintSheets(doc, { fit: 'percent', scale: 300, range: 'current' }, { currentPageId: foreground[0].id, now: NOW });
  assert.ok(tiled.count > 1, `300 % needs several sheets (${tiled.count})`);
});

test('paths: parse, scale and bounds', () => {
  const d = 'M0 0 L10 0 L10 20 Z';
  assert.ok(parsePath(d).length >= 3);
  const b = pathBounds(scalePath(d, 2, 3));
  assert.deepEqual([b.x, b.y, b.w, b.h].map(Math.round), [0, 0, 20, 60]);
  const arc = pathBounds('M0 0 A10 10 0 0 1 20 0');
  assert.ok(arc.h > 5, 'arcs are converted to curves with their bulge');
});
