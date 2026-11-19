// Fine chart settings, mixed charts, the chart's view of its table (a data range chosen with the mouse, series in
// rows or columns) and the stepper used for every number.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTable } from '../../src/domain/data/table.js';
import { canMix, CHART_IDS, SERIES_KINDS } from '../../src/domain/chart/types.js';
import { chartTable, dataRangeOf, defaultOptions, normalizeChart, renderChart } from '../../src/domain/chart/render.js';
import { ChartDoc } from '../../src/domain/chart/doc.js';
import { clampStep } from '../../src/stepper.js';

const table = createTable(['Month', 'A', 'B', 'C'], [['Jan', 10, 20, 5], ['Feb', 12, 18, 7], ['Mar', 15, 25, 6], ['Apr', 11, 22, 9], ['May', 17, 19, 8]]);
const draw = (chart, view = {}) => renderChart({ table, chart: { type: 'column', ...chart } }, { width: 800, height: 500, ...view });
const count = (svg, re) => (svg.match(re) ?? []).length;

test('data range: only the chosen cells are drawn; ranges are clamped; the whole table is no range', () => {
  const svg = draw({ dataRange: { r0: 1, r1: 3, c0: 0, c1: 2 } }).svg;
  assert.equal(count(svg, /class="mark bar"/g), 6, '3 months × 2 series');
  assert.match(svg, />Feb</);
  assert.doesNotMatch(svg, />Jan</);
  assert.deepEqual(dataRangeOf(table, { r0: 9, r1: -3, c0: 0, c1: 99 }), { r0: 0, r1: 4, c0: 0, c1: 3 } && null, 'the whole table again is no range');
  assert.deepEqual(dataRangeOf(table, { r0: 3, r1: 1, c0: 2, c1: 0 }), { r0: 1, r1: 3, c0: 0, c1: 2 }, 'corners in any order');
  assert.equal(dataRangeOf(table, { r0: 'x' }), null);
  const view = chartTable(table, { dataRange: { r0: 1, r1: 3, c0: 1, c1: 3 } });
  assert.deepEqual(view.columns.map((c) => c.name), ['A', 'B', 'C']);
  assert.equal(chartTable(table, { dataRange: { r0: 1, r1: 3, c0: 1, c1: 3 } }), view, 'cached');
});

test('series in rows: the table is read across (first column names the series, the header gives the categories)', () => {
  const svg = draw({ seriesIn: 'rows' }).svg;
  assert.equal(count(svg, /class="mark bar"/g), 15, '3 categories × 5 series');
  for (const name of ['A', 'B', 'C']) assert.match(svg, new RegExp(`class="cat"[^>]*>${name}<`));
  assert.match(svg, />Jan</, 'the months are the series (legend)');
  const chart = normalizeChart({ type: 'column', seriesIn: 'rows' }, table);
  assert.equal(chart.seriesIn, 'rows');
  assert.equal(chart.mapping.values.length, 5);
  assert.equal(normalizeChart({ seriesIn: 'sideways' }, table).seriesIn, 'columns');
});

test('ChartDoc.setDataView finds the roles again and can be undone', () => {
  const doc = new ChartDoc({ table, chart: { type: 'line' } });
  doc.setDataView({ dataRange: { r0: 0, r1: 2, c0: 0, c1: 1 } });
  assert.deepEqual(doc.chart.mapping.values, [1]);
  doc.setDataView({ seriesIn: 'rows' });
  assert.equal(doc.chart.seriesIn, 'rows');
  doc.undo();
  doc.undo();
  assert.equal(doc.chart.dataRange, null);
  assert.deepEqual(doc.chart.mapping.values, [1, 2, 3]);
});

test('mixed charts: each series its own way (columns, lines, areas, points, lollipops), right axis', () => {
  assert.ok(canMix('column') && canMix('line') && canMix('combo') && canMix('roundedColumn'));
  assert.ok(!canMix('pie') && !canMix('stackedColumn') && !canMix('bar') && !canMix('lollipopBar'));
  const svg = draw({ options: { seriesTypes: { 1: 'line', 2: 'area' }, seriesAxis: { 2: 'right' } } }).svg;
  assert.equal(count(svg, /class="mark bar"/g), 5);
  assert.ok(count(svg, /class="mark line"/g) >= 1 && count(svg, /class="mark area"/g) === 1);
  assert.ok(count(svg, /class="tick"[^>]*text-anchor="start"/g) >= 3, 'right axis ticks');
  for (const kind of SERIES_KINDS) {
    const r = draw({ options: { seriesTypes: { 0: kind, 1: 'column' } } });
    assert.ok(r.marks > 0 && !/NaN|undefined/.test(r.svg), kind);
  }
  // A type that cannot mix ignores stored kinds.
  assert.equal(count(draw({ type: 'stackedColumn', options: { seriesTypes: { 1: 'line' } } }).svg, /class="mark line"/g), 0);
  assert.deepEqual(defaultOptions().seriesTypes, {});
});

test('fine settings: titles, legend spot and look, axes, grid, plot area, marks, text', () => {
  const svg = draw({ title: 'T', options: { titleColor: '#123456', titleSize: 30, titleBold: false, legend: 'custom', legendX: 25, legendY: 40, legendSwatch: 'line', legendColor: '#654321', axisColor: '#ff0000', axisWidth: 3, tickColor: '#00ff00', gridColor: '#0000ff', gridWidth: 2, gridStyle: 'dotted', plotBackground: '#eeeeee', plotBorder: true, markOpacity: 0.4, markStroke: 2, markStrokeColor: '#111111', yStep: 4, dataLabels: true, textColor: '#abcdef', yTitle: 'Y', axisTitleColor: '#aa0000' } }).svg;
  assert.match(svg, /class="chart-title"[^>]*font-weight="500" fill="#123456"/);
  assert.match(svg, /data-legend-place="custom"/);
  assert.match(svg, /<rect class="legend-box" x="200"/, 'legend at 25 % across');
  assert.match(svg, /fill="#654321"/);
  const tag = (cls) => svg.match(new RegExp(`<line class="${cls}"[^>]*>`))?.[0] ?? '';
  for (const part of ['stroke="#ff0000"', 'stroke-width="3"']) assert.ok(tag('axis').includes(part), `axis ${part}`);
  assert.match(svg, /class="tick"[^>]*fill="#00ff00"/);
  for (const part of ['stroke="#0000ff"', 'stroke-dasharray="1.5 3"', 'stroke-width="2"']) assert.ok(tag('grid').includes(part), `grid ${part}`);
  assert.match(svg, /class="plot-bg"[^>]*fill="#eeeeee"/);
  assert.match(svg, /class="plot-border"/);
  assert.match(svg, /opacity="0.4"[^>]*stroke="#111111"/);
  assert.match(svg, /class="data-label"[^>]*fill="#abcdef"/);
  assert.match(svg, /class="axis-title" data-axis="y"[^>]*fill="#aa0000"/);
  const ticks = [...svg.matchAll(/class="tick"[^>]*>([^<]+)</g)].map((m) => Number(m[1]));
  assert.ok(ticks.length > 3 && ticks.every((v) => v % 4 === 0), `ticks ${ticks}`);
  const hidden = draw({ options: { showXLabels: false, showYLabels: false, showAxisTitles: false, xTitle: 'X' } }).svg;
  assert.equal(count(hidden, /class="tick"/g) + count(hidden, /class="cat"/g) + count(hidden, /class="axis-title"/g), 0);
  // Every fine option draws well-formed pictures for every type.
  for (const type of CHART_IDS) {
    const r = renderChart({ table, chart: { type, options: { legend: 'custom', legendBox: true, markStroke: 1, markOpacity: 0.7, plotBorder: true, gridStyle: 'dashed', yStep: 5, textScale: 1.3 } } }, { width: 600, height: 400 });
    assert.doesNotMatch(r.svg, /NaN|undefined|Infinity/, type);
  }
});

test('steppers: typed values clamp, buttons round to the step', () => {
  assert.equal(clampStep(7.3, { min: 0, max: 10, step: 0.5 }), 7.5);
  assert.equal(clampStep(99, { min: 0, max: 10, step: 1 }), 10);
  assert.equal(clampStep(Number.NaN, { min: 2, max: 10, step: 1 }), 2);
});

test('install language: the installer\'s choice becomes the program\'s language, keeping the other settings', async () => {
  const { applyInstallLanguage, STORAGE_KEY } = await import('../../src/domain/settings.js');
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  store.set(STORAGE_KEY, JSON.stringify({ language: 'ko', theme: 'dark' }));
  assert.equal(applyInstallLanguage(storage, 'en'), true);
  assert.deepEqual(JSON.parse(store.get(STORAGE_KEY)), { language: 'en', theme: 'dark' });
  assert.equal(applyInstallLanguage(storage, 'fr'), false, 'only Korean and English');
  assert.equal(applyInstallLanguage(storage, undefined), false, 'no installer marker: nothing changes');
  assert.equal(JSON.parse(store.get(STORAGE_KEY)).language, 'en');
  const fresh = new Map();
  assert.equal(applyInstallLanguage({ getItem: (k) => fresh.get(k) ?? null, setItem: (k, v) => fresh.set(k, v) }, 'ko'), true, 'first start ever');
  assert.equal(JSON.parse(fresh.get(STORAGE_KEY)).language, 'ko');
});
