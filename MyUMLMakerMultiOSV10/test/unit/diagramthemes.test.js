// The 40 colour schemes of the diagrams: complete, different, readable, drawn on every kind of diagram.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as M from '../../src/domain/model.js';
import { DIAGRAM_THEME_IDS, normalizeSettings } from '../../src/domain/settings.js';
import { DIAGRAM_THEME_LIST } from '../../src/render/diagram-themes.js';
import { DIAGRAM_THEMES, renderDiagramSvg } from '../../src/render/notation.js';
import { buildSample } from '../../src/domain/templates.js';
import { applyTheme, appDiagramPalette, contrast, diagramPaletteOf, THEMES } from '../../src/themes.js';

const HEX = /^#[0-9a-f]{6}$/i;

test('there are 40 schemes, 20 light and 20 dark, the settings accept every one', () => {
  assert.equal(DIAGRAM_THEME_LIST.length, 40);
  assert.deepEqual(DIAGRAM_THEME_LIST.map((t) => t.id), DIAGRAM_THEME_IDS, 'the same list in the same order');
  assert.deepEqual(Object.keys(DIAGRAM_THEMES), DIAGRAM_THEME_IDS);
  assert.equal(DIAGRAM_THEME_LIST.filter((t) => t.dark).length, 20);
  for (const id of DIAGRAM_THEME_IDS) assert.equal(normalizeSettings({ diagramTheme: id, diagramThemeRev: 2 }).diagramTheme, id);
  assert.equal(normalizeSettings({ diagramTheme: 'nope' }).diagramTheme, 'theme');
  for (const id of ['classic', 'pastel', 'blueprint', 'dark']) assert.ok(DIAGRAM_THEMES[id], `the old scheme ${id} stays`);
});

test('every scheme has its names, all colours, and differs from the others', () => {
  const looks = new Set();
  for (const theme of DIAGRAM_THEME_LIST) {
    assert.ok(theme.ko && theme.en, theme.id);
    for (const key of ['background', 'fill', 'line', 'color', 'grid', 'gridMajor']) assert.match(theme[key], HEX, `${theme.id}.${key}`);
    looks.add([theme.background, theme.fill, theme.line].join());
  }
  assert.equal(looks.size, 40);
  assert.equal(new Set(DIAGRAM_THEME_LIST.map((t) => t.ko)).size, 40);
  assert.equal(new Set(DIAGRAM_THEME_LIST.map((t) => t.en)).size, 40);
});

test('text and lines stay readable on every scheme', () => {
  for (const theme of DIAGRAM_THEME_LIST) {
    assert.ok(contrast(theme.color, theme.fill) >= 4.5, `${theme.id}: text on shapes ${contrast(theme.color, theme.fill).toFixed(1)}`);
    assert.ok(contrast(theme.color, theme.background) >= 4.5, `${theme.id}: text on paper`);
    assert.ok(contrast(theme.line, theme.background) >= 3, `${theme.id}: lines on paper ${contrast(theme.line, theme.background).toFixed(1)}`);
    for (const [family, fill] of Object.entries(theme.fills ?? {})) assert.ok(contrast(theme.color, fill) >= 4.5, `${theme.id}.${family}`);
    assert.equal(theme.dark, contrast('#000000', theme.background) < contrast('#ffffff', theme.background), `${theme.id}: dark means a dark paper`);
  }
});

test('every scheme draws all kinds of diagram', () => {
  const project = buildSample('en');
  const diagrams = M.allDiagrams(project);
  for (const { id, fill } of DIAGRAM_THEME_LIST) {
    for (const diagram of diagrams) {
      const errors = [];
      const { svg } = renderDiagramSvg(project, diagram, { theme: id, onError: (error) => errors.push(error.message) });
      assert.deepEqual(errors, [], `${id}/${diagram.name}`);
      assert.ok(!/NaN|undefined/.test(svg), `${id}/${diagram.name}`);
    }
    const classDiagram = diagrams.find((d) => d._type === 'UMLActivityDiagram');
    assert.ok(renderDiagramSvg(project, classDiagram, { theme: id, background: 'none' }).svg.length > 100, id);
    assert.match(fill, HEX);
  }
});

test('by default the diagrams follow the program theme, and the user can change that', () => {
  assert.equal(normalizeSettings({}).diagramTheme, 'theme');
  assert.equal(normalizeSettings({ diagramTheme: 'theme' }).diagramTheme, 'theme');
  // Settings saved before: 'classic' was only the old default. Chosen from now on, it stays.
  assert.equal(normalizeSettings({ diagramTheme: 'classic' }).diagramTheme, 'theme');
  const chosen = normalizeSettings(JSON.parse(JSON.stringify(normalizeSettings({ diagramTheme: 'theme' }))));
  assert.equal(normalizeSettings({ ...chosen, diagramTheme: 'classic' }).diagramTheme, 'classic', 'a choice of the user');
  assert.equal(normalizeSettings({ ...chosen, diagramTheme: 'neon' }).diagramTheme, 'neon');
  assert.ok(!Object.keys(DIAGRAM_THEMES).includes('theme'), 'it is not one of the 40');
});

test('following the theme: every program theme gives readable diagrams with its own paper', () => {
  const project = buildSample('en');
  const diagram = M.allDiagrams(project)[0];
  assert.equal(THEMES.length, 40);
  for (const theme of THEMES) {
    const palette = diagramPaletteOf(theme);
    assert.equal(palette.background, theme.colors.chart, theme.id);
    assert.ok(contrast(palette.color, palette.fill) >= 4.5, `${theme.id}: text on shapes ${contrast(palette.color, palette.fill).toFixed(1)}`);
    assert.ok(contrast(palette.color, palette.background) >= 4.5, `${theme.id}: text on paper`);
    assert.ok(contrast(palette.line, palette.background) >= 3, `${theme.id}: lines on paper ${contrast(palette.line, palette.background).toFixed(1)}`);
    applyTheme(theme, null);
    assert.equal(appDiagramPalette().background, palette.background);
    assert.equal(DIAGRAM_THEMES.theme.background, palette.background, 'the scheme reads the theme applied last');
    assert.ok(renderDiagramSvg(project, diagram, { theme: 'theme' }).svg.includes(palette.background), `${theme.id}: drawn on its paper`);
  }
});
