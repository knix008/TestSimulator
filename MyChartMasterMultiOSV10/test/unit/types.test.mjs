// The 108 chart types: each one's own starter data draws real marks (no "choose a column" note, no NaN), the
// variants borrow a renderer with their preset, every type and group has its own icon, the chart themes stand
// apart from the program's theme, the background follows the program's theme by default and series colours keep
// their contrast on dark paper.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTable } from '../../src/domain/data/table.js';
import { baseType, CHART_GROUPS, CHART_IDS, CHART_TYPES, chartType } from '../../src/domain/chart/types.js';
import { chartColors, normalizeBackground, renderChart } from '../../src/domain/chart/render.js';
import { EXTRA_DRAW } from '../../src/domain/chart/render-extra.js';
import { CHART_THEME_IDS, CHART_THEMES, chartTheme, contrastRatio, palette, seriesColor, visibleOn } from '../../src/domain/chart/palettes.js';
import { blankTable, starterFor } from '../../src/domain/chart/samples.js';
import { STARTERS } from '../../src/domain/chart/starters.js';
import { newChartOptions } from '../../src/domain/chart/doc.js';
import { normalizeSettings } from '../../src/domain/settings.js';
import { CHART_ICONS } from '../../src/icons-chart.js';
import { CHART_ICONS_MORE } from '../../src/icons-chart-more.js';
import { DARK_THEMES, LIGHT_THEMES, resolveTheme } from '../../src/themes.js';

const NOTE = /고르세요|Choose |양수 값이 없습니다|No positive values|숫자가 없습니다|No numbers/;
const ICONS = { ...CHART_ICONS, ...CHART_ICONS_MORE };

test('every one of the types draws its starter data with marks and no note, in both languages', () => {
  assert.ok(CHART_TYPES.length >= 100);
  for (const type of CHART_TYPES) {
    for (const language of ['ko', 'en']) {
      const starter = starterFor(type.id, language);
      assert.equal(starter.chart.type, type.id, `${type.id}: the starter keeps the type`);
      const r = renderChart(starter, { width: 900, height: 560, language });
      assert.equal(r.error, null, `${type.id}: ${r.error}`);
      assert.ok(r.marks > 0, `${type.id} (${language}) draws no marks`);
      assert.doesNotMatch(r.svg, NOTE, `${type.id} (${language}) asks for columns instead of drawing`);
      assert.doesNotMatch(r.svg, /NaN|undefined|Infinity/, `${type.id} (${language})`);
    }
  }
});

test('every type copes with odd tables: blank, one row, negatives, zeros, text only', () => {
  const tables = [
    blankTable('ko'), createTable(['Item', 'A'], [['x', 5]]),
    createTable(['Item', 'A', 'B'], [['x', -3, 2], ['y', -7, -1], ['z', 0, 0]]),
    createTable(['Item', 'A', 'B'], [['x', 0, 0], ['y', 0, 0]]), createTable(['a', 'b'], [['x', 'y'], ['p', 'q']]),
  ];
  for (const id of CHART_IDS) for (const table of tables) {
    const r = renderChart({ table, chart: { type: id } }, { width: 600, height: 400 });
    assert.doesNotMatch(r.svg, /NaN|undefined|Infinity/, id);
  }
});

test('a variant draws with its base renderer and preset; every renderer exists', () => {
  const builtIn = new Set(CHART_TYPES.filter((c) => !c.base).map((c) => c.id));
  for (const type of CHART_TYPES) {
    if (type.base) {
      assert.ok(builtIn.has(type.base), `${type.id} borrows ${type.base}`);
      assert.ok(type.preset && Object.keys(type.preset).length, `${type.id} has a preset`);
      assert.equal(baseType(type.id), type.base);
    }
  }
  for (const id of Object.keys(EXTRA_DRAW)) assert.ok(CHART_IDS.includes(id), `${id} is a type`);
  // A preset changes the picture: a dashed line has a dash, a rounded column round corners, a pyramid no funnel.
  const lineDoc = starterFor('line');
  assert.match(renderChart({ ...lineDoc, chart: { ...lineDoc.chart, type: 'dashedLine' } }).svg, /stroke-dasharray/);
  assert.notEqual(renderChart({ ...lineDoc, chart: { ...lineDoc.chart, type: 'dashedLine' } }).svg, renderChart(lineDoc).svg);
});

test('every type and group has its own picture, and no two types share one', () => {
  for (const type of CHART_TYPES) assert.ok(ICONS[type.icon], `${type.id}: ${type.icon}`);
  for (const g of CHART_GROUPS) assert.ok(ICONS[g.icon], g.icon);
  const bodies = CHART_TYPES.map((c) => ICONS[c.icon]);
  assert.equal(new Set(bodies).size, bodies.length, 'two types draw the same icon');
});

test('the roles of the new kinds are found by themselves', () => {
  const gantt = starterFor('gantt');
  const m = renderChart(gantt).svg;
  assert.ok((m.match(/class="mark bar"/g) ?? []).length >= 5, 'one bar per task');
  const bullet = renderChart(starterFor('bullet')).svg;
  assert.ok((bullet.match(/class="target"/g) ?? []).length >= 4, 'the goal column draws target lines');
  const flows = renderChart(starterFor('chord')).svg;
  assert.ok((flows.match(/class="mark link"/g) ?? []).length >= 8, 'one ribbon per flow');
  assert.equal(chartType('bullet').roles.at(-1).id, 'goal');
});

test('chart themes: 42 of them, each draws every kind; the theme sets font, grid dash and palette', () => {
  assert.ok(CHART_THEMES.length >= 42);
  for (const id of CHART_THEME_IDS) {
    const ct = chartTheme(id);
    assert.ok(palette(ct.palette).colors.length >= 6, id);
    for (const type of ['column', 'pie', 'scatter', 'heatmap', 'gantt', 'bigNumber']) {
      const doc = starterFor(type);
      doc.chart.options = { ...doc.chart.options, chartTheme: id, palette: ct.palette, background: 'chart' };
      const r = renderChart(doc, { width: 640, height: 400 });
      assert.ok(r.marks > 0, `${id} ${type}`);
      assert.ok(r.svg.includes(ct.bg), `${id}: the chart theme's paper`);
    }
  }
  const paper = starterFor('line');
  paper.chart.options = { ...paper.chart.options, chartTheme: 'paper', background: 'chart' };
  assert.match(renderChart(paper).svg, /Georgia/);
  assert.equal(chartTheme('nope').id, 'classic');
});

test('the background follows the program theme by default, light or dark, apart from the chart theme', () => {
  assert.equal(newChartOptions({}).background, 'theme');
  assert.equal(normalizeBackground('auto'), 'theme');
  assert.equal(normalizeBackground('#123456'), '#123456');
  for (const theme of [LIGHT_THEMES[0], DARK_THEMES[0], DARK_THEMES.at(-1)]) {
    const colors = resolveTheme(theme.id, theme.dark).colors;
    const c = chartColors({ chartTheme: 'classic', background: 'theme' }, colors);
    assert.equal(c.bg, colors.surface, theme.id);
    assert.equal(c.dark, theme.dark, `${theme.id}: dark text on light paper, light text on dark`);
    assert.ok(contrastRatio(c.text, c.base) >= 4.5, `${theme.id}: text reads on the background`);
    // The chart theme keeps its own paper when asked, whatever the program's theme.
    assert.equal(chartColors({ chartTheme: 'midnight', background: 'chart' }, colors).bg, chartTheme('midnight').bg);
  }
});

test('series colours keep at least 3:1 contrast with the paper (dark program theme, dark palettes)', () => {
  const dark = resolveTheme(DARK_THEMES[0].id, true).colors;
  for (const p of ['corporate', 'office', 'gray', 'vivid']) {
    for (let i = 0; i < 10; i++) {
      const color = seriesColor({ palette: p, _bg: dark.surface }, i);
      assert.ok(contrastRatio(color, dark.surface) >= 2.99, `${p}[${i}] ${color} on ${dark.surface}`);
    }
  }
  assert.equal(visibleOn('#3b82f6', '#ffffff'), '#3b82f6', 'a colour that already stands out is kept');
  assert.equal(seriesColor({ palette: 'vivid', colors: { 0: '#000001' }, _bg: '#000000' }, 0), '#000001', 'the user\'s own colour is kept');
  const doc = starterFor('column');
  doc.chart.options = { ...doc.chart.options, palette: 'corporate' };
  const svg = renderChart(doc, { theme: dark }).svg;
  assert.ok(svg.includes(dark.surface));
});

test('settings: the default chart theme and background, and older settings move to the program theme', () => {
  const s = normalizeSettings({});
  assert.equal(s.chartTheme, 'classic');
  assert.equal(s.chartBackground, 'theme');
  assert.equal(normalizeSettings({ chartBackground: 'white' }).chartBackground, 'theme', 'older default');
  assert.equal(normalizeSettings({ chartBackground: 'white', chartTheme: 'paper' }).chartBackground, 'white', 'a choice is kept');
  assert.equal(normalizeSettings({ chartTheme: 'nope' }).chartTheme, 'classic');
  assert.equal(newChartOptions({ chartTheme: 'ocean' }).chartTheme, 'ocean');
});

test('the starters cover every kind of table the types need', () => {
  for (const type of CHART_TYPES) {
    if (['lh', 'cvt', 'gantt', 'cl', 'stv', 'gv'].includes(type.roleSet) && !type.base) assert.ok(STARTERS[type.id] || STARTERS[baseType(type.id)] || ['sankey', 'treemap', 'sunburst'].includes(type.id), type.id);
  }
});

test('every sample switched to every type (as the right panel does) draws marks — nothing comes out blank', async () => {
  const { SAMPLES } = await import('../../src/domain/chart/samples.js');
  const { ChartDoc } = await import('../../src/domain/chart/doc.js');
  const blank = [];
  for (const sample of SAMPLES) {
    for (const language of ['ko', 'en']) {
      const built = sample.build(language);
      for (const type of CHART_IDS) {
        const doc = new ChartDoc({ name: 'x', table: built.table, chart: built.chart });
        doc.setType(type);
        const r = renderChart(doc, { width: 800, height: 500, language });
        if (r.error || !r.marks || /NaN|undefined|Infinity/.test(r.svg)) blank.push(`${sample.id} → ${type}${r.error ? ` (${r.error})` : ''}`);
      }
    }
  }
  assert.deepEqual(blank, [], `${blank.length} blank: ${blank.slice(0, 12).join(', ')}`);
});

test('types switched one after another on one chart keep drawing (series come back after single-value types)', async () => {
  const { SAMPLES } = await import('../../src/domain/chart/samples.js');
  const { ChartDoc } = await import('../../src/domain/chart/doc.js');
  for (const id of ['monthly-sales', 'market-share', 'exam-histogram', 'stock-candles']) {
    const sample = SAMPLES.find((s) => s.id === id) ?? SAMPLES[0];
    const built = sample.build('en');
    const doc = new ChartDoc({ name: 'x', table: built.table, chart: built.chart });
    for (const type of [...CHART_IDS, ...[...CHART_IDS].reverse()]) {
      doc.setType(type);
      const r = renderChart(doc, { width: 640, height: 400 });
      assert.ok(r.marks > 0 && !r.error, `${sample.id}: … → ${type} draws nothing`);
    }
  }
});
