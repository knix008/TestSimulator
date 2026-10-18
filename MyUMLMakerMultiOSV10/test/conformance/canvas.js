// Shared helper of the conformance tests: draws a diagram the way a user does
// (toolbox tool → createNode / createEdge, at a point, inside a host when the
// point is inside one), renders it, and gives the SVG of the whole diagram and
// of each view so a test can check the notation of one element or line.
import assert from 'node:assert/strict';
import * as M from '../../src/domain/model.js';
import * as E from '../../src/domain/edit.js';
import { toolById } from '../../src/domain/toolbox.js';
import { createRenderContext, layoutDiagram, nodeBox, renderDiagramSvg, renderViews } from '../../src/render/notation.js';

/** Plain text of every <text> in an SVG fragment (entities decoded). */
export function texts(svg) {
  return [...String(svg).matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)].map((m) => m[1].replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&'));
}

/** End marks of an edge SVG, recognised from their geometry (see endMark in render/notation.js). */
export function marks(svg) {
  const out = [];
  for (const m of String(svg).matchAll(/<(polygon|polyline|circle|path)\b([^>]*)\/?>/g)) {
    const [, tag, attrs] = m;
    if (/class="hit"/.test(attrs)) continue;
    const fill = /fill="([^"]*)"/.exec(attrs)?.[1] ?? '';
    const stroke = /stroke="([^"]*)"/.exec(attrs)?.[1] ?? '';
    if (tag === 'polyline') out.push('open');
    else if (tag === 'polygon') {
      const n = (/points="([^"]*)"/.exec(attrs)?.[1] ?? '').trim().split(/\s+/).length;
      const solid = fill && fill === stroke;
      out.push(n === 4 ? (solid ? 'composite' : 'shared') : solid ? 'filled' : 'triangle');
    } else if (tag === 'circle') out.push(fill && fill === stroke ? 'dot' : 'circle');
  }
  return out;
}

/** A fresh project with one diagram of `type`, and drawing helpers. */
export function canvas(type, { language = 'en' } = {}) {
  const project = M.createProject({ name: 'Conformance', language, diagram: null });
  const diagram = M.addDiagram(project, project.ownedElements[0]._id, type, { language });
  const boxes = new Map();
  const tool = (id) => {
    const found = toolById(type, id);
    assert.ok(found, `${type}: the toolbox has "${id}"`);
    return found;
  };
  /** Draws a node tool at (x, y) (size w × h, 0 = the tool's size) and sets fields on its element. */
  const node = (id, x, y, fields = {}, size = {}) => {
    const t = typeof id === 'string' ? tool(id) : id;
    const box = { x, y, w: size.w ?? 0, h: size.h ?? 0 };
    const result = E.createNode(project, diagram, t, box, { language, boxes });
    assert.ok(result?.view, `${type}: "${t.en}" draws at ${x},${y}`);
    if (result.element) Object.assign(result.element, fields);
    else Object.assign(result.view, fields);
    // The box the renderer gives it (later drops inside it find it as their host).
    boxes.set(result.view._id, nodeBox(createRenderContext({ project, diagram, language }), result.view));
    return result;
  };
  /** Draws an edge tool between two drawn things ({ view } or a view) and sets fields (end1/end2 are merged). */
  const edge = (id, from, to, fields = {}, options = {}) => {
    const t = typeof id === 'string' ? tool(id) : id;
    const a = from.view ?? from; const b = to.view ?? to;
    assert.ok(E.canConnect(project, diagram, t, a, b, M.buildIndex(project)), `${type}: "${t.en}" connects`);
    const result = E.createEdge(project, diagram, t, a, b, { language, y: options.y ?? null });
    assert.ok(result?.view, `${type}: "${t.en}" draws a line`);
    if (result.element) {
      const { end1, end2, ...rest } = fields;
      Object.assign(result.element, rest);
      if (end1) Object.assign(result.element.end1, end1);
      if (end2) Object.assign(result.element.end2, end2);
    }
    return result;
  };
  /** Adds a feature (attribute, operation, literal, column, pin …) to an element. */
  const add = (owner, featureType, fields = {}) => {
    const element = M.addElement(project, (owner.element ?? owner)._id, featureType, fields, { language });
    assert.ok(element, `${featureType} can be added to ${(owner.element ?? owner)._type}`);
    return element;
  };
  /** Renders: { svg, of(view) → SVG of that view, text, errors }. Fails on render errors and broken numbers. */
  const render = (options = {}) => {
    const errors = [];
    const { svg } = renderDiagramSvg(project, diagram, { language, ...options, onError: (error, view) => errors.push(`${view._type}: ${error.message}`) });
    assert.deepEqual(errors, [], `${type}: render errors`);
    assert.ok(!/NaN|undefined/.test(svg), `${type}: no broken numbers or text in the drawing`);
    const ctx = layoutDiagram(createRenderContext({ project, diagram, language, ...options }));
    const of = (thing) => renderViews(ctx, { ids: new Set([(thing.view ?? thing)._id]), tag: false });
    return { svg, of, text: texts(svg), ctx };
  };
  return { project, diagram, boxes, tool, node, edge, add, render, index: () => M.buildIndex(project) };
}

/** Asserts every expected string is one of the texts (or a part of one). */
export function hasTexts(svgOrTexts, expected, message = '') {
  const list = Array.isArray(svgOrTexts) ? svgOrTexts : texts(svgOrTexts);
  const missing = expected.filter((want) => !list.some((t) => (want instanceof RegExp ? want.test(t) : t.includes(want))));
  assert.deepEqual(missing, [], `${message} missing texts (have: ${JSON.stringify(list).slice(0, 600)})`);
}
