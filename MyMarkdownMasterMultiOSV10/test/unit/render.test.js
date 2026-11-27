// The reading view's pure parts (src/render): chart specs and SVG, slide splitting, callout types, reading
// presentation preferences, the texts. The DOM part (preview.js) is checked in a browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chartHtml, chartSvg, niceTicks, parseChartSpec, parseTable, parseYamlish, formatNumber } from '../../src/render/chart.js';
import { normalizeReadingPrefs, READING_DEFAULTS, splitSlides } from '../../src/render/slides.js';
import { alertType, CALLOUT_ICON_PATHS, CALLOUT_TONES, CALLOUT_TYPES, calloutIconSvg, calloutType } from '../../src/render/callouts.js';
import { ko, en } from '../../src/render/texts.js';
import { setLanguage } from '../../src/i18n.js';

setLanguage('en');

test('YAML subset: maps, lists of maps, flow values, comments', () => {
  const spec = parseYamlish([
    'type: bar  # a comment',
    'labels: [Mon, "Tue, late", \'Wed\']',
    'series:',
    '  - title: Visits',
    '    data: [3, 5, 2]',
    '  - title: "Sales #1"',
    '    data:',
    '      - 1',
    '      - 4.5',
    'stacked: true',
    'size: { w: 10, h: [1, [2, 3]] }',
  ].join('\n'));
  assert.deepEqual(spec, {
    type: 'bar', labels: ['Mon', 'Tue, late', 'Wed'],
    series: [{ title: 'Visits', data: [3, 5, 2] }, { title: 'Sales #1', data: [1, 4.5] }],
    stacked: true, size: { w: 10, h: [1, [2, 3]] },
  });
  assert.throws(() => parseYamlish('labels: [a, b'), /line 1/);
});

test('chart spec: YAML, JSON, defaults and errors', () => {
  const r = parseChartSpec('type: line\nlabels: [a, b, c]\nseries:\n  - title: S\n    data: [1, null, 3]\nwidth: 80%\nheight: 200');
  assert.equal(r.ok, true);
  assert.equal(r.spec.type, 'line');
  assert.deepEqual(r.spec.series[0].data, [1, null, 3]);
  assert.equal(r.spec.cssWidth, '80%');
  assert.equal(r.spec.height, 200);
  const j = parseChartSpec('{"type": "donut", "labels": ["x", "y"], "series": [{"title": "T", "data": [1, 2]}]}');
  assert.equal(j.spec.type, 'doughnut');
  const filled = parseChartSpec('type: line\nfill: true\nseries:\n  - data: [1, 2]');
  assert.equal(filled.spec.type, 'area');
  assert.deepEqual(filled.spec.labels, ['1', '2'], 'labels default to 1…n');
  assert.equal(filled.spec.series[0].title, 'Series 1');
  assert.deepEqual(parseChartSpec('type: radar\nseries:\n  - data: [1]'), { ok: false, error: 'Unknown chart type: radar' });
  assert.deepEqual(parseChartSpec('type: bar'), { ok: false, error: 'The chart has no data' });
  assert.equal(parseChartSpec('type: bar\nlabels: [a\nx: 1').error, 'Could not read the chart spec (line 2)');
});

test('chart spec: a Markdown table under the spec is the data', () => {
  const table = parseTable(['| Month | Sales | Costs |', '| --- | ---: | --- |', '| Jan | 10 | 7 |', '| Feb | 1,400 | 8 |']);
  assert.deepEqual(table.header, ['Month', 'Sales', 'Costs']);
  assert.equal(table.rows.length, 2);
  const r = parseChartSpec('type: bar\nstacked: true\n| Month | Sales | Costs |\n| --- | --- | --- |\n| Jan | 10 | 7 |\n| Feb | 1,400 | 8 |');
  assert.deepEqual(r.spec.labels, ['Jan', 'Feb']);
  assert.deepEqual(r.spec.series.map((s) => s.title), ['Sales', 'Costs']);
  assert.deepEqual(r.spec.series[0].data, [10, 1400]);
  assert.equal(r.spec.stacked, true);
  const s = parseChartSpec('type: scatter\n| x | y |\n|---|---|\n| 1 | 2 |\n| 3 | 5 |');
  assert.deepEqual(s.spec.series[0].data, [{ x: 1, y: 2 }, { x: 3, y: 5 }]);
});

test('nice ticks and numbers', () => {
  assert.deepEqual(niceTicks(0, 7, 5).ticks, [0, 2, 4, 6, 8]);
  assert.deepEqual(niceTicks(-3, 9, 4).ticks, [-5, 0, 5, 10]);
  assert.deepEqual(niceTicks(5, 5).ticks.length > 1, true);
  assert.equal(formatNumber(12500), '12.5k');
  assert.equal(formatNumber(0.1 + 0.2), '0.3');
});

test('chart SVG: bars, lines, pies with legend, tooltips and theme colours', () => {
  const bar = chartSvg(parseChartSpec('type: bar\nlabels: [A, B]\nseries:\n  - title: One\n    data: [3, 5]\n  - title: Two\n    data: [1, -2]').spec);
  assert.match(bar, /^<svg class="md-chart-svg"/);
  assert.equal((bar.match(/class="md-chart-bar"/g) ?? []).length, 4);
  assert.match(bar, /<title>Two — B: -2<\/title>/);
  assert.match(bar, /fill:var\(--tone-blue\)/);
  assert.match(bar, /fill:var\(--tone-orange\)/);
  assert.match(bar, /md-chart-legend/);
  assert.match(bar, /class="md-chart-zero"/, 'negative values draw a zero line');
  const line = chartSvg(parseChartSpec('type: area\nlabels: [a, b, c]\nseries:\n  - title: S\n    data: [1, 2, 3]').spec);
  assert.match(line, /<polygon class="md-chart-area"/);
  assert.match(line, /<polyline class="md-chart-line"/);
  assert.equal((line.match(/md-chart-hit/g) ?? []).length, 3);
  const pie = chartSvg(parseChartSpec('type: doughnut\nlabels: [x, y, z]\nseries:\n  - data: [1, 1, 2]').spec);
  assert.equal((pie.match(/class="md-chart-slice"/g) ?? []).length, 3);
  assert.match(pie, /<title>z: 2 \(50%\)<\/title>/);
  const whole = chartSvg(parseChartSpec('type: pie\nlabels: [only]\nseries:\n  - data: [5]').spec);
  assert.match(whole, /a[\d.]+,[\d.]+ 0 1,0/, 'a single 100% slice is a full circle');
  const scatter = chartSvg(parseChartSpec('type: scatter\nseries:\n  - title: P\n    data: [[1, 2], [3, 4]]').spec);
  assert.equal((scatter.match(/md-chart-point/g) ?? []).length, 2);
});

test('chart HTML escapes text and shows errors inline', () => {
  const html = chartHtml('type: bar\nlabels: ["<b>x</b>"]\nseries:\n  - title: "a&b"\n    data: [1]');
  assert.doesNotMatch(html, /<b>x<\/b>/);
  assert.match(html, /&lt;b&gt;x&lt;\/b&gt;/);
  assert.match(html, /a&amp;b/);
  assert.match(chartHtml('type: nope'), /class="md-chart md-chart-error" role="alert">Unknown chart type: nope</);
  // colours from the spec are tones or plain CSS colours only
  const colored = parseChartSpec('type: bar\nseries:\n  - title: A\n    color: red\n    data: [1]\n  - title: B\n    color: "url(javascript:x)"\n    data: [2]');
  assert.equal(colored.spec.series[0].color, 'var(--tone-red)');
  assert.equal(colored.spec.series[1].color, null);
});

test('slides split at top-level <hr> only', () => {
  const html = '<h1 data-line="0">One</h1>\n<hr data-line="2" />\n<p>Two</p><blockquote><p>q</p><hr></blockquote>\n<hr>\n<div class="callout"><div><hr/></div></div><!--/embed-->\n<hr data-line="9" />\n';
  const slides = splitSlides(html);
  assert.equal(slides.length, 3);
  assert.match(slides[0], /One/);
  assert.match(slides[1], /<blockquote><p>q<\/p><hr><\/blockquote>/, 'an <hr> inside a quote stays');
  assert.match(slides[2], /callout/);
  assert.deepEqual(splitSlides(''), []);
  assert.deepEqual(splitSlides('<p>a</p>'), ['<p>a</p>']);
  assert.equal(splitSlides('<pre><code>&lt;hr&gt;</code></pre><img src="x"><br><hr><p>b</p>').length, 2, 'void elements do not nest');
  assert.equal(splitSlides('<p title="a>b">x</p><hr><p>y</p>').length, 2, '> inside attribute values');
});

test('callout types: aliases, unknown types, tones and icons', () => {
  assert.equal(calloutType('note'), 'note');
  assert.equal(calloutType('TLDR'), 'abstract');
  assert.equal(calloutType('hint'), 'tip');
  assert.equal(calloutType('important'), 'tip');
  assert.equal(calloutType('done'), 'success');
  assert.equal(calloutType('faq'), 'question');
  assert.equal(calloutType('attention'), 'warning');
  assert.equal(calloutType('missing'), 'failure');
  assert.equal(calloutType('error'), 'danger');
  assert.equal(calloutType('cite'), 'quote');
  assert.equal(calloutType('custom-thing'), 'note');
  assert.equal(calloutType(undefined), 'note');
  for (const type of CALLOUT_TYPES) {
    assert.ok(CALLOUT_ICON_PATHS[type], `icon for ${type}`);
    assert.ok(CALLOUT_TONES[type], `tone for ${type}`);
  }
  assert.match(calloutIconSvg('bug'), /^<svg class="callout-svg"/);
  assert.equal(calloutIconSvg('whatever'), calloutIconSvg('note'));
  assert.equal(alertType('markdown-alert markdown-alert-caution'), 'caution');
  assert.equal(alertType('markdown-alert'), 'note');
});

test('reading presentation preferences are clamped and completed', () => {
  assert.deepEqual(normalizeReadingPrefs(null), { ...READING_DEFAULTS });
  const p = normalizeReadingPrefs({ fontSize: 500, lineHeight: '1.234', width: 10, contrast: 'high', theme: 'nope', speed: -1 });
  assert.equal(p.fontSize, 72);
  assert.equal(p.lineHeight, 1.2);
  assert.equal(p.width, 480);
  assert.equal(p.contrast, 'high');
  assert.equal(p.theme, 'app');
  assert.equal(p.speed, 5);
  assert.equal(normalizeReadingPrefs({ theme: 'solarized' }).theme, 'solarized');
});

test('render texts: same keys in Korean and English, all prefixed render.', () => {
  assert.deepEqual(Object.keys(ko).sort(), Object.keys(en).sort());
  for (const key of Object.keys(ko)) {
    assert.match(key, /^render\.[A-Za-z0-9]+$/);
    assert.ok(ko[key].trim() && en[key].trim(), key);
  }
});
