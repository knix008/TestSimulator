// The SVG renderer: every element shape draws without errors, sizes fit their
// text, lines meet the outlines of their ends with the right adornments,
// sequence diagrams get activations, numbers and created/destroyed lifelines,
// and whole diagrams export as standalone SVG; plus printing sheets.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as M from '../../src/domain/model.js';
import * as E from '../../src/domain/edit.js';
import { TYPES, VIEW_ONLY } from '../../src/domain/meta.js';
import { toolById } from '../../src/domain/toolbox.js';
import { buildSample } from '../../src/domain/templates.js';
import { createRenderContext, edgeRoute, layoutDiagram, nodeBox, renderDiagramSvg, routePath, DIAGRAM_THEMES } from '../../src/render/notation.js';
import { SHAPES } from '../../src/render/shapes.js';
import { renderPrintSheets } from '../../src/print/render.js';

const fresh = (type = 'UMLClassDiagram') => {
  const project = M.createProject({ name: 'P', language: 'en', diagram: null });
  return { project, diagram: M.addDiagram(project, project.ownedElements[0]._id, type) };
};

test('every shape of every element type and annotation draws', () => {
  const { project, diagram } = fresh();
  const model = project.ownedElements[0];
  let i = 0;
  for (const [type, def] of Object.entries(TYPES)) {
    if (!def.shape || def.edge || def.diagram) continue;
    assert.ok(SHAPES[def.shape], `${type}: shape ${def.shape} exists`);
    const el = M.addElement(project, model._id, type, { name: type });
    if (el) M.showElement(project, diagram, el._id, { x: (i % 10) * 220, y: Math.floor(i / 10) * 220 });
    i += 1;
  }
  for (const type of Object.keys(VIEW_ONLY)) if (!VIEW_ONLY[type].edge) M.addView(diagram, M.createNodeView(type, null, { x: i * 10, y: 3000, w: 0, h: 0 }, { text: 'note text' }));
  const errors = [];
  const { svg } = renderDiagramSvg(project, diagram, { onError: (error, view) => errors.push(`${view._type}: ${error.message}`) });
  assert.deepEqual(errors, []);
  assert.ok(svg.startsWith('<svg') && svg.endsWith('</svg>'));
  assert.ok(!/NaN|undefined/.test(svg), 'no broken numbers or text');
});

test('a class box fits its members and grows with them', () => {
  const { project, diagram } = fresh();
  const cls = M.addElement(project, project.ownedElements[0]._id, 'UMLClass', { name: 'Order' });
  const view = M.showElement(project, diagram, cls._id, { x: 0, y: 0 });
  const before = nodeBox(createRenderContext({ project, diagram }), view);
  M.addElement(project, cls._id, 'UMLAttribute', { name: 'aVeryLongAttributeNameIndeed', type: 'String' });
  M.addElement(project, cls._id, 'UMLOperation', { name: 'cancel' });
  const after = nodeBox(createRenderContext({ project, diagram }), view);
  assert.ok(after.w > before.w && after.h > before.h);
  view.width = 600; view.height = 400;
  assert.deepEqual([nodeBox(createRenderContext({ project, diagram }), view).w, nodeBox(createRenderContext({ project, diagram }), view).h], [600, 400], 'a bigger user size wins');
  view.autoResize = true;
  assert.equal(nodeBox(createRenderContext({ project, diagram }), view).w, after.w, 'auto resize fits exactly');
});

test('lines start and end on the outlines, in every line style', () => {
  const { project, diagram } = fresh();
  const t = (id) => toolById('UMLClassDiagram', id);
  const a = E.createNode(project, diagram, t('UMLClass'), { x: 0, y: 0, w: 100, h: 60 });
  const b = E.createNode(project, diagram, t('UMLClass'), { x: 300, y: 200, w: 100, h: 60 });
  const edge = E.createEdge(project, diagram, t('UMLGeneralization'), a.view, b.view).view;
  for (const style of ['rectilinear', 'oblique', 'roundRect', 'curve']) {
    edge.lineStyle = style;
    const ctx = layoutDiagram(createRenderContext({ project, diagram }));
    const { points } = edgeRoute(ctx, edge);
    const onEdge = (p, box) => Math.abs(p.x - box.x) < 1 || Math.abs(p.x - (box.x + box.w)) < 1 || Math.abs(p.y - box.y) < 1 || Math.abs(p.y - (box.y + box.h)) < 1;
    assert.ok(onEdge(points[0], ctx.boxes.get(a.view._id)), `${style} starts on a`);
    assert.ok(onEdge(points.at(-1), ctx.boxes.get(b.view._id)), `${style} ends on b`);
    if (style === 'rectilinear') for (let i = 1; i < points.length; i += 1) assert.ok(points[i].x === points[i - 1].x || points[i].y === points[i - 1].y, 'right angles');
    assert.match(routePath(points, style), /^M/);
  }
  edge.lineStyle = 'oblique';
  edge.points = [{ x: 150, y: 250 }];
  const ctx = layoutDiagram(createRenderContext({ project, diagram }));
  assert.ok(edgeRoute(ctx, edge).points.some((p) => p.x === 150 && p.y === 250), 'bend points are kept');
});

test('relationship adornments: triangles, diamonds, crow\'s feet', () => {
  const { project, diagram } = fresh();
  const t = (id) => toolById('UMLClassDiagram', id);
  const a = E.createNode(project, diagram, t('UMLClass'), { x: 0, y: 0, w: 0, h: 0 });
  const b = E.createNode(project, diagram, t('UMLClass'), { x: 300, y: 0, w: 0, h: 0 });
  E.createEdge(project, diagram, t('composition'), a.view, b.view);
  E.createEdge(project, diagram, t('UMLRealization'), b.view, a.view);
  const { svg } = renderDiagramSvg(project, diagram);
  assert.match(svg, /stroke-dasharray="6 4"/, 'realization is dashed');
  assert.ok((svg.match(/<polygon/g) ?? []).length >= 2, 'diamond and triangle');
  const erd = fresh('ERDDiagram');
  const e1 = E.createNode(erd.project, erd.diagram, toolById('ERDDiagram', 'ERDEntity'), { x: 0, y: 0, w: 0, h: 0 });
  const e2 = E.createNode(erd.project, erd.diagram, toolById('ERDDiagram', 'ERDEntity'), { x: 300, y: 0, w: 0, h: 0 });
  E.createEdge(erd.project, erd.diagram, toolById('ERDDiagram', 'erd:1:0..*'), e1.view, e2.view);
  assert.match(renderDiagramSvg(erd.project, erd.diagram).svg, /<circle/, 'the "zero" of 0..* is a circle');
});

test('sequence diagrams: numbers, activations, created and destroyed lifelines', () => {
  const { project, diagram } = fresh('UMLSequenceDiagram');
  const t = (id) => toolById('UMLSequenceDiagram', id);
  const a = E.createNode(project, diagram, t('UMLLifeline'), { x: 0, y: 0, w: 0, h: 0 });
  const b = E.createNode(project, diagram, t('UMLLifeline'), { x: 250, y: 0, w: 0, h: 0 });
  const c = E.createNode(project, diagram, t('UMLLifeline'), { x: 500, y: 0, w: 0, h: 0 });
  E.createEdge(project, diagram, t('message:synchCall'), a.view, b.view, { y: 100 });
  E.createEdge(project, diagram, t('message:reply'), b.view, a.view, { y: 160 });
  E.createEdge(project, diagram, t('message:createMessage'), a.view, c.view, { y: 200 });
  E.createEdge(project, diagram, t('message:deleteMessage'), a.view, c.view, { y: 260 });
  const ctx = layoutDiagram(createRenderContext({ project, diagram }));
  const seq = ctx.sequence;
  assert.deepEqual([...seq.numbers.values()], [1, 2, 3, 4]);
  assert.deepEqual(seq.lifelines.get(b.view._id).activations.map((x) => [x.y1, x.y2]), [[100, 160]], 'active until the reply');
  const created = seq.lifelines.get(c.view._id);
  assert.ok(created.headTop > 150, 'the created lifeline starts at its create message');
  assert.equal(created.end, 260);
  assert.equal(created.destroyed, true);
  const { svg } = renderDiagramSvg(project, diagram);
  assert.ok(svg.includes('1 : ') && svg.includes('4 : '));
});

test('every diagram theme renders and the sample exports', () => {
  const project = buildSample('en');
  for (const theme of Object.keys(DIAGRAM_THEMES)) {
    for (const diagram of M.allDiagrams(project)) {
      const { svg, width, height } = renderDiagramSvg(project, diagram, { theme });
      assert.ok(width > 100 && height > 60, `${diagram.name} has a size`);
      assert.ok(!svg.includes('NaN'), diagram.name);
    }
  }
});

test('print sheets: one per diagram when fitted, tiles at actual size', () => {
  const project = buildSample('ko');
  const count = M.allDiagrams(project).length;
  const fitted = renderPrintSheets(project, { range: 'all', fit: 'fit' }, {});
  assert.equal(fitted.count, count);
  const current = renderPrintSheets(project, { range: 'current' }, { currentPageId: M.allDiagrams(project)[1]._id });
  assert.equal(current.count, 1);
  const actual = renderPrintSheets(project, { range: 'all', fit: 'percent', scale: 300 }, {});
  assert.ok(actual.count > count, 'large scales tile');
  assert.ok(fitted.pages.every((p) => p.svg.startsWith('<svg')));
});
