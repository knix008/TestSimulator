// The drawing on screen follows a dark program theme; what is saved, printed and exported does not.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { designOf, isWhitePaper, pageColor, pastelOf, resolveConnectorStyle, resolveShapeStyle } from '../../src/domain/designs.js';
import { createShape } from '../../src/domain/diagram.js';

const viewDark = { page: '#1f232c', text: '#e6e9ef', connector: '#98a1b3' };

test('a light design is drawn on the theme\'s dark paper with light text, only when the canvas asks', () => {
  const doc = { design: 'office', options: {} };
  const page = { color: '#ffffff' };
  const label = createShape('textBox', { x: 0, y: 0, text: 'Label' });
  assert.equal(pageColor(doc, page), '#ffffff', 'export and print: the real paper');
  assert.equal(resolveShapeStyle(doc, label).textColor, '#1f2937', 'export and print: dark text');
  const view = { ...doc, viewDark };
  assert.equal(pageColor(view, page), viewDark.page, 'on screen: the theme\'s paper');
  assert.equal(resolveShapeStyle(view, label).textColor, viewDark.text, 'on screen: light text outside shapes');
  assert.equal(resolveConnectorStyle(view, { style: {} }).line, viewDark.connector, 'on screen: lighter connectors');
  const box = createShape('rect', { x: 0, y: 0 });
  assert.equal(resolveShapeStyle(doc, box).fill, pastelOf('#4472c4'), 'quick style fill: the pastel tone of the accent');
  assert.equal(resolveShapeStyle(view, box).fill, pastelOf('#4472c4', true), 'on dark paper: a deeper pastel of the same accent');
});

test('a design that is already dark, and the plain-white check', () => {
  const doc = { design: 'midnight', options: {}, viewDark };
  assert.equal(designOf(doc).page, '#1a1b26', 'a dark design keeps its own paper');
  assert.equal(pageColor(doc, {}), '#1a1b26');
  for (const white of [null, '', '#fff', '#FFFFFF', 'ffffff', '#ffffffff']) assert.ok(isWhitePaper(white), String(white));
  for (const color of ['#fffff0', '#000000', '#f8fafc']) assert.ok(!isWhitePaper(color), color);
});

test('a file embedded by drag and drop is saved inside the drawing and read back', async () => {
  const { createDocument, addShape } = await import('../../src/domain/diagram.js');
  const { serialize, parseDiagram } = await import('../../src/domain/format.js');
  const doc = createDocument({ title: 'Embed' });
  const shape = addShape(doc.pages[0], createShape('icoDocument', { x: 10, y: 10, text: 'report.pdf' }));
  shape.attachment = { name: 'report.pdf', type: 'application/pdf', size: 4, data: 'JVBERg==' };
  const back = parseDiagram(serialize(doc)).doc.pages[0].shapes.find((s) => s.id === shape.id);
  assert.deepEqual(back.attachment, shape.attachment);
});

test('stencil pictures follow the program theme: light lines and text on Dark, dark ones on Light', async () => {
  const { panelDoc, readableOn } = await import('../../src/domain/designs.js');
  const { masterIcon } = await import('../../src/render/svg.js');
  const text = createShape('textBox', { x: 0, y: 0, text: 'A' });
  const line = { style: {} };
  // A light design in a dark panel: bright text and lines.
  const darkPanel = panelDoc({ design: 'office', options: {} }, true, { panel: '#1b1f27', text: '#e6e9ef' });
  assert.equal(resolveShapeStyle(darkPanel, text).textColor, '#e6e9ef');
  assert.equal(resolveConnectorStyle(darkPanel, line).line, '#e6e9ef');
  // A dark design in a light panel: dark text and lines on white.
  const lightPanel = panelDoc({ design: 'midnight', options: {} }, false);
  assert.equal(resolveShapeStyle(lightPanel, text).textColor, '#1f2937');
  assert.equal(resolveConnectorStyle(lightPanel, line).line, '#4b5563');
  assert.equal(pageColor(lightPanel, {}), '#ffffff');
  // Matching brightness: nothing changes.
  assert.equal(panelDoc({ design: 'office', options: {} }, false).viewDark, undefined);
  assert.equal(panelDoc({ design: 'midnight', options: {} }, true).viewLight, undefined);
  // The pictures themselves change with it.
  assert.notEqual(masterIcon('line', { doc: darkPanel }), masterIcon('line', { doc: { design: 'office', options: {} } }));
  void readableOn;
});
