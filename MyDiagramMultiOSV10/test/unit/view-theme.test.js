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

test('every stencil picture stands out on the panel, in every program theme and drawing design', async () => {
  const { THEMES, contrast } = await import('../../src/themes.js');
  const { DESIGNS, panelDoc } = await import('../../src/domain/designs.js');
  const { MASTERS } = await import('../../src/domain/stencils.js');
  const { masterIcon } = await import('../../src/render/svg.js');
  const shown = MASTERS.filter((m) => m.cat);
  // The palest and the darkest panels of each kind, and one in between.
  const byPanel = (list) => [...list].sort((a, b) => contrast(a.colors.panel, '#000000') - contrast(b.colors.panel, '#000000'));
  const light = byPanel(THEMES.filter((x) => !x.dark));
  const dark = byPanel(THEMES.filter((x) => x.dark));
  const themes = [light[0], light[light.length - 1], dark[0], dark[dark.length - 1], dark[Math.floor(dark.length / 2)]];
  const faint = [];
  for (const theme of themes) {
    for (const design of DESIGNS) {
      const doc = panelDoc({ design: design.id, options: {} }, theme.dark, { panel: theme.colors.panel, text: theme.colors.text });
      for (const master of shown) {
        let best = 0;
        for (const [, color] of masterIcon(master.id, { size: 40, doc }).matchAll(/(?:stroke|fill)="(#[0-9a-f]{6}|#[0-9a-f]{3})"/gi)) best = Math.max(best, contrast(color.length === 4 ? `#${[...color.slice(1)].map((c) => c + c).join('')}` : color, theme.colors.panel));
        if (best < 2.5) faint.push(`${theme.id}/${design.id}/${master.id}: ${best.toFixed(2)}`);
      }
    }
  }
  assert.deepEqual(faint.slice(0, 12), [], `${faint.length} faint pictures`);
});

test('the drawing follows the program theme both ways on screen; a page colour chosen by hand stays', async () => {
  const { themedDoc, contrastRatio } = await import('../../src/domain/designs.js');
  const light = { dark: false, surface: '#ffffff', text: '#1d2433', muted: '#667085' };
  const dark = { dark: true, surface: '#1f232c', text: '#e6e9ef', muted: '#98a1b3' };
  for (const design of ['blueprint', 'midnight', 'chalkboard', 'graphite']) {
    const doc = { design, options: {} };
    const view = themedDoc(doc, { color: '' }, light);
    assert.equal(designOf(view).dark, false, `${design}: drawn light under a light theme`);
    assert.equal(pageColor(view, { color: '' }), '#ffffff', `${design}: on the theme's paper`);
    const box = createShape('rect', { x: 0, y: 0 });
    const line = resolveShapeStyle(view, box).line;
    assert.ok(contrastRatio(line, '#ffffff') >= 2.5, `${design}: outline ${line} shows on light paper`);
    assert.equal(pageColor(doc, { color: '' }), designOf(doc).page, `${design}: saved / printed / exported on its own paper`);
    assert.equal(themedDoc(doc, { color: '' }, dark), doc, `${design}: a dark design under a dark theme keeps its paper`);
  }
  assert.equal(themedDoc({ design: 'office', options: {} }, { color: '#fff3c4' }, dark).viewDark, undefined, 'a page colour chosen by hand stays');
  assert.equal(themedDoc({ design: 'chalkboard', options: {} }, { color: '#3a0000' }, light).viewLight, undefined, 'also on a light theme');
  assert.ok(themedDoc({ design: 'chalkboard', options: {} }, { color: '#24312b' }, light).viewLight, 'the design\'s own paper colour counts as no colour');
  assert.ok(themedDoc({ design: 'office', options: {} }, { color: '' }, dark).viewDark, 'a light design under a dark theme');
  assert.equal(themedDoc({ design: 'office', options: {} }, { color: '' }, light).viewDark, undefined, 'a light design under a light theme: as it is');
});
