// Charts: every type draws its samples and its starter data, the scales, formats and layouts behind them, the
// document model (undo, redo, types, save / open) and the samples on disk.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createTable } from '../../src/domain/data/table.js';
import { CHART_GROUPS, CHART_IDS, CHART_TYPES, autoMapping, chartType } from '../../src/domain/chart/types.js';
import { chartColors, chartDataTable, defaultOptions, fitText, formatValue, linearFit, niceTicks, normalizeChart, renderChart, squarify, textWidth } from '../../src/domain/chart/render.js';
import { PALETTES, rampColor, readableOn, seriesColor } from '../../src/domain/chart/palettes.js';
import { SAMPLE_GROUPS, SAMPLES, blankTable, starterFor } from '../../src/domain/chart/samples.js';
import { ChartDoc } from '../../src/domain/chart/doc.js';
import { parseXml } from '../../src/domain/data/xml.js';

const root = path.resolve(import.meta.dirname, '..', '..');

/** A drawn chart is well-formed: one <svg>, every tag closed, no NaN or undefined in it. */
function wellFormed(svg) {
  assert.ok(svg.startsWith('<svg') && svg.endsWith('</svg>'));
  assert.ok(!/NaN|undefined|Infinity/.test(svg), 'NaN / undefined in the picture');
  const tree = parseXml(svg);
  assert.equal(tree.children.filter((c) => c.name).length, 1);
  const opens = (svg.match(/<(?!\/)[a-zA-Z]+[^>]*[^/]>/g) ?? []).length;
  const closes = (svg.match(/<\/[a-zA-Z]+>/g) ?? []).length;
  assert.equal(opens, closes, 'unbalanced tags');
}

test('at least 100 chart types in 9 groups of 12, each with roles and its own icon', () => {
  assert.ok(CHART_TYPES.length >= 100, `${CHART_TYPES.length} types`);
  assert.equal(new Set(CHART_IDS).size, CHART_TYPES.length);
  assert.equal(CHART_GROUPS.length, 9);
  for (const g of CHART_GROUPS) assert.equal(CHART_TYPES.filter((c) => c.group === g.id).length, 12, `${g.id}: 12 types, so the start page rows are full`);
  assert.equal(new Set(CHART_TYPES.map((c) => c.icon)).size, CHART_TYPES.length, 'no two types share an icon');
  for (const g of CHART_GROUPS) assert.ok(CHART_TYPES.some((c) => c.group === g.id), g.id);
  for (const type of CHART_TYPES) {
    assert.ok(CHART_GROUPS.some((g) => g.id === type.group), type.id);
    assert.ok(type.roles.length >= 1 && type.ko && type.en && type.koDesc && type.enDesc, type.id);
    assert.match(type.icon, /^chart[A-Z]/);
  }
  assert.equal(chartType('nope').id, 'column');
});

test('every sample draws without error, with marks, in both languages and sizes', () => {
  assert.equal(SAMPLES.length, 31);
  for (const s of SAMPLES) assert.ok(CHART_IDS.includes(s.type), s.id);
  for (const s of SAMPLES) {
    assert.ok(SAMPLE_GROUPS.some((g) => g.id === s.group), s.id);
    for (const language of ['ko', 'en']) {
      const built = s.build(language);
      for (const [width, height] of [[1024, 640], [420, 300], [1920, 1080]]) {
        const r = renderChart({ table: built.table, chart: built.chart }, { width, height, language, titles: true });
        assert.equal(r.error, null, `${s.id}: ${r.error}`);
        assert.ok(r.marks > 0, `${s.id} draws no marks`);
        wellFormed(r.svg);
      }
    }
  }
});

test('every type draws the starter data and an empty grid without crashing', () => {
  for (const id of CHART_IDS) {
    const starter = starterFor(id, 'en');
    const r = renderChart({ table: starter.table, chart: { ...starter.chart, type: id } }, { width: 800, height: 500 });
    assert.equal(r.error, null, id);
    wellFormed(r.svg);
    const blank = renderChart({ table: blankTable('ko'), chart: { type: id } }, { width: 600, height: 400 });
    wellFormed(blank.svg);
    const empty = renderChart({ table: createTable(['a'], []), chart: { type: id } }, { width: 600, height: 400 });
    assert.ok(empty.error, `${id}: an empty table says so`);
  }
});

test('the same table drawn as every type (type changes keep working)', () => {
  const table = createTable(['Item', 'A', 'B', 'C'], [['x', 3, 5, 2], ['y', 7, 1, 4], ['z', 2, 6, 8], ['w', 5, 3, 1]]);
  for (const id of CHART_IDS) {
    const chart = normalizeChart({ type: id }, table);
    const r = renderChart({ table, chart }, { width: 800, height: 500 });
    wellFormed(r.svg);
  }
});

test('auto mapping: category from text, values from numbers, special roles', () => {
  const t = createTable(['Name', 'X', 'Y', 'Size', 'Group'], [['a', 1, 2, 3, 'g'], ['b', 4, 5, 6, 'h']]);
  assert.deepEqual(autoMapping(t, 'column'), { category: 0, values: [1, 2, 3] });
  assert.deepEqual(autoMapping(t, 'pie').values, [1]);
  const bubble = autoMapping(t, 'bubble');
  assert.deepEqual([bubble.x, bubble.y, bubble.size], [1, 2, 3]);
  const scatter = autoMapping(createTable(['h', 'w'], [[1, 2], [3, 4]]), 'scatter');
  assert.deepEqual([scatter.x, scatter.values], [0, [1]]);
  const box = autoMapping(createTable(['a', 'b', 'c'], [[1, 2, 3]]), 'boxplot');
  assert.deepEqual(box.values, [0, 1, 2], 'no category eats a column');
  const candle = autoMapping(createTable(['Date', 'Open', 'High', 'Low', 'Close'], [['d', 1, 2, 0, 1]]), 'candlestick');
  assert.deepEqual([candle.open, candle.high, candle.low, candle.close], [1, 2, 3, 4]);
  const tree = autoMapping(createTable(['Class', 'Item', 'V'], [['a', 'b', 1]]), 'treemap');
  assert.deepEqual([tree.group, tree.category, tree.values], [0, 1, [2]]);
  // A previous mapping is kept where it fits.
  assert.deepEqual(autoMapping(t, 'line', { category: 4, values: [3] }), { category: 4, values: [3] });
});

test('scales: nice ticks cover the data with round steps', () => {
  assert.deepEqual(niceTicks(0, 97, 5).ticks, [0, 20, 40, 60, 80, 100]);
  assert.deepEqual(niceTicks(-3, 7, 5).ticks, [-4, -2, 0, 2, 4, 6, 8]);
  const small = niceTicks(0.001, 0.0093, 4);
  assert.ok(small.ticks.every((v) => Number.isFinite(v)) && small.max >= 0.0093);
  assert.ok(niceTicks(5, 5).ticks.length >= 2, 'a flat range still has ticks');
});

test('number formats: auto, compact, percent, decimals, prefix and suffix', () => {
  assert.equal(formatValue(1234.5, {}, 'en'), '1,234.5');
  assert.equal(formatValue(0.256, { numberFormat: 'percent' }, 'en'), '26%');
  assert.equal(formatValue(1500000, { numberFormat: 'compact' }, 'en'), '1.5M');
  assert.equal(formatValue(3, { decimals: 2, prefix: '$', suffix: ' each' }, 'en'), '$3.00 each');
  assert.equal(formatValue(12000, {}, 'ko', { tick: true }), '1.2만');
  assert.equal(formatValue(null), '');
});

test('layout helpers: text width, fitting, squarified treemap, linear fit, colours', () => {
  assert.ok(textWidth('가나다', 10) > textWidth('abc', 10));
  assert.equal(fitText('short', 500, 12), 'short');
  assert.ok(fitText('a very long category label indeed', 60, 12).endsWith('…'));
  const cells = squarify([{ value: 6 }, { value: 3 }, { value: 1 }], 0, 0, 100, 50);
  assert.equal(cells.length, 3);
  const area = cells.reduce((a, c) => a + c.w * c.h, 0);
  assert.ok(Math.abs(area - 5000) < 1e-6);
  for (const c of cells) assert.ok(c.x >= -1e-9 && c.y >= -1e-9 && c.x + c.w <= 100 + 1e-9 && c.y + c.h <= 50 + 1e-9);
  const fit = linearFit([[0, 1], [1, 3], [2, 5]]);
  assert.ok(Math.abs(fit.slope - 2) < 1e-9 && Math.abs(fit.intercept - 1) < 1e-9 && Math.abs(fit.r2 - 1) < 1e-9);
  assert.equal(readableOn('#ffffff'), '#111827');
  assert.equal(readableOn('#000000'), '#ffffff');
  assert.equal(rampColor('blues', 0), '#eff6ff');
  assert.equal(PALETTES.length, 20);
  assert.equal(seriesColor({ palette: 'office' }, 0), '#4472c4');
  assert.equal(seriesColor({ palette: 'office', colors: { 0: '#123456' } }, 0), '#123456');
  assert.equal(chartColors({ background: 'transparent' }, { bg: '#000000' }).bg, 'none');
});

test('options change the picture: legend, labels, hidden series, background, titles', () => {
  const s = SAMPLES.find((x) => x.id === 'monthly-sales').build('en');
  const draw = (options, extra = {}) => renderChart({ table: s.table, chart: { ...s.chart, ...extra, options: { ...s.chart.options, ...options } } }, { width: 900, height: 500, titles: true });
  const base = draw({});
  assert.equal(base.legend.length, 3);
  assert.ok(base.svg.includes('Monthly sales 2025'));
  assert.ok(!draw({ legend: 'none' }).svg.includes('legend-item'));
  assert.ok(draw({ dataLabels: true }).svg.includes('data-label'));
  const hidden = draw({ hidden: [1] });
  assert.ok(hidden.marks < base.marks);
  assert.equal(hidden.legend[1].hidden, true);
  assert.ok(!draw({ background: 'transparent' }).svg.includes('chart-bg'));
  assert.ok(draw({ background: '#102030' }).svg.includes('#102030'));
  assert.ok(draw({}, { title: 'A & <B>' }).svg.includes('A &amp; &lt;B&gt;'));
  assert.ok(draw({ yScale: 'log' }).svg.includes('class="tick"'));
  assert.ok(draw({ trendline: true }, { type: 'line' }).svg.includes('class="trend"'));
  assert.ok(draw({ sort: 'desc', maxItems: 3 }).marks <= 9 + 3);
  assert.ok(base.svg.includes('<title>'), 'exports carry hover titles');
  assert.ok(!renderChart({ table: s.table, chart: s.chart }, { width: 900, height: 500 }).svg.includes('<title>'), 'the app has its own tips');
});

test('the chart data table names the used columns', () => {
  const s = SAMPLES.find((x) => x.id === 'countries-bubble').build('en');
  const t = chartDataTable({ table: s.table, chart: s.chart });
  assert.equal(t.columns.length, 5);
  assert.equal(t.rows.length, s.table.rows.length);
});

test('ChartDoc: undo, redo, merged edits, type changes, save and open', () => {
  const s = SAMPLES[0].build('en');
  const doc = new ChartDoc({ name: 'a.mychart', table: s.table, chart: s.chart });
  assert.equal(doc.dirty, false);
  doc.setChart({ title: 'One' });
  doc.setChart({ options: { palette: 'neon' } });
  assert.equal(doc.chart.options.palette, 'neon');
  assert.equal(doc.chart.title, 'One');
  doc.undo();
  assert.equal(doc.chart.options.palette, defaultOptions().palette === 'vivid' ? s.chart.options.palette ?? 'vivid' : 'vivid');
  doc.redo();
  assert.equal(doc.chart.options.palette, 'neon');
  // Typing into one field is one undo step.
  const steps = doc.undoStack.length;
  for (const ch of 'Hello') doc.setChart({ title: ch }, { merge: 'chart:title' });
  assert.equal(doc.undoStack.length, steps + 1);
  assert.ok(doc.setType('pie'));
  assert.equal(doc.chart.type, 'pie');
  assert.equal(doc.chart.mapping.values.length, 1);
  assert.ok(!doc.setType('pie'), 'the same type is no change');
  assert.ok(!doc.setType('nope'));
  const json = doc.serialize();
  const back = ChartDoc.fromJSON(json, { name: 'b.mychart' });
  assert.equal(back.chart.type, 'pie');
  assert.deepEqual(back.table.rows, doc.table.rows);
  assert.deepEqual(back.table.columns, doc.table.columns);
  assert.throws(() => ChartDoc.fromJSON('{"format":"other"}'), /import.notChart/);
});

test('samples/ holds every sample as written by npm run samples', () => {
  for (const s of SAMPLES) {
    const file = path.join(root, 'samples', `${s.id}.mychart`);
    assert.ok(fs.existsSync(file), `${s.id}.mychart missing (run npm run samples)`);
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    const built = s.build('ko');
    assert.equal(saved.chart.type, s.type);
    assert.deepEqual(saved.data.rows, built.table.rows, `${s.id}.mychart is out of date (run npm run samples)`);
  }
  for (const f of ['csv', 'tsv', 'json', 'md', 'html', 'xml', 'xlsx']) assert.ok(fs.existsSync(path.join(root, 'samples', 'data', `monthly-sales.${f}`)), f);
});
