// Draws a chart as SVG text from a table and a chart description. Pure (no DOM): the same picture in the app, in
// every export (PNG, JPEG, WebP, GIF, AVIF through a canvas; SVG, PDF, HTML, Word, Markdown) and in the tests.
//
//   renderChart({ table, chart }, { width, height, theme, language, fontFamily, titles, animate })
//     → { svg, width, height, marks, legend: [{ name, color, hidden }], warnings: [] }
//
// chart = { type, title, subtitle, mapping: { category, values: [], x, y, size, label, group, open, high, low,
//           close, source, target }, options: { …defaultOptions() } }
// Marks carry data-s (series), data-r (row) and data-tip (hover text); legend items carry data-legend.
import { cellText, labelsOf, numberColumns, numbersOf, parseNumber, quantile, textColumns } from '../data/table.js';
import { autoMapping, BY_ROW, CARTESIAN, chartType, HORIZONTAL, PERCENT, STACKED } from './types.js';
import { chartTheme, darken, lighten, mix, rampColor, readableOn, seriesColor } from './palettes.js';
import { EXTRA_DRAW } from './render-extra.js';

/** Every option a chart has, with its default. */
export function defaultOptions() {
  return {
    chartTheme: 'classic', palette: 'vivid', colors: {}, background: 'theme', fontScale: 1, fontFamily: '',
    titleAlign: 'center', legend: 'bottom', hidden: [],
    dataLabels: false, labelPosition: 'auto', numberFormat: 'auto', decimals: -1, prefix: '', suffix: '',
    xTitle: '', yTitle: '', y2Title: '', yMin: '', yMax: '', yScale: 'linear', beginAtZero: true, gridLines: true, xGridLines: false,
    xLabelAngle: 'auto', sort: 'none', maxItems: 0,
    lineWidth: 2.5, markers: true, markerSize: 4, areaOpacity: 0.35,
    barRadius: 4, barGap: 0.28, innerRadius: 0.58, startAngle: 0, sliceGap: 1,
    bins: 0, trendline: false, secondAxis: false, waterfallTotal: true,
    ramp: 'blues', gaugeMin: '', gaugeMax: '', border: false, upColor: '#16a34a', downColor: '#dc2626',
    note: '', width: 1024, height: 640,
  };
}

/** A chart description with every gap filled (type, mapping that fits the table, options). */
export function normalizeChart(chart, table) {
  const type = chartType(chart?.type).id;
  const options = { ...defaultOptions(), ...(chart?.options ?? {}) };
  if (!Array.isArray(options.hidden)) options.hidden = [];
  if (!options.colors || typeof options.colors !== 'object') options.colors = {};
  const mapping = autoMapping(table, type, chart?.mapping ?? null);
  return { type, title: String(chart?.title ?? ''), subtitle: String(chart?.subtitle ?? ''), mapping, options };
}

// ───────────────────────── numbers and text

const CJK = /[ᄀ-ᇿ⺀-鿿가-힯豈-﫿＀-￯]/;
/** An estimate of the width of `text` at `size` px (no canvas under Node; close enough for layout). */
export function textWidth(text, size) {
  let w = 0;
  for (const ch of String(text ?? '')) {
    w += CJK.test(ch) ? size * 0.98 : /[il.,:;'|!·]/.test(ch) ? size * 0.3 : /[mwMW@%]/.test(ch) ? size * 0.86 : /[A-Z]/.test(ch) ? size * 0.66 : /\d/.test(ch) ? size * 0.57 : /\s/.test(ch) ? size * 0.3 : size * 0.54;
  }
  return w;
}

/** Shortens text to fit `width` px with an ellipsis. */
export function fitText(text, width, size) {
  const s = String(text ?? '');
  if (textWidth(s, size) <= width) return s;
  let out = '';
  for (const ch of s) {
    if (textWidth(`${out}${ch}…`, size) > width) break;
    out += ch;
  }
  return out ? `${out}…` : '';
}

const esc = (text) => String(text ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
const r2 = (n) => Math.round(n * 100) / 100;

/** A value as the chart shows it (labels, ticks, tips): number format, decimals, prefix and suffix. */
export function formatValue(value, options = {}, language = 'ko', { percent = false, tick = false } = {}) {
  if (value == null || !Number.isFinite(value)) return '';
  const locale = language === 'en' ? 'en-US' : 'ko-KR';
  const decimals = Number(options.decimals);
  const fixed = Number.isInteger(decimals) && decimals >= 0 ? { minimumFractionDigits: decimals, maximumFractionDigits: decimals } : null;
  const format = percent ? 'percent' : options.numberFormat ?? 'auto';
  let text;
  if (format === 'percent') text = new Intl.NumberFormat(locale, { style: 'percent', ...(fixed ?? { maximumFractionDigits: Math.abs(value) < 0.1 ? 1 : 0 }) }).format(value);
  else if (format === 'compact' || (format === 'auto' && tick && Math.abs(value) >= 10000)) text = new Intl.NumberFormat(locale, { notation: 'compact', ...(fixed ?? { maximumFractionDigits: 1 }) }).format(value);
  else if (format === 'scientific') text = value.toExponential(fixed ? decimals : 2);
  else if (format === 'plain') text = fixed ? value.toFixed(decimals) : String(Math.round(value * 1e8) / 1e8);
  else text = new Intl.NumberFormat(locale, fixed ?? { maximumFractionDigits: Math.abs(value) >= 100 ? 1 : Math.abs(value) >= 1 ? 2 : 4 }).format(value);
  return `${percent ? '' : options.prefix ?? ''}${text}${percent ? '' : options.suffix ?? ''}`;
}

/** Round tick values covering [min, max], about `count` of them. */
export function niceTicks(min, max, count = 5) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: 0, max: 1, step: 0.2, ticks: [0, 0.2, 0.4, 0.6, 0.8, 1] };
  if (min === max) { const pad = Math.abs(min) * 0.1 || 1; min -= pad; max += pad; }
  const raw = (max - min) / Math.max(1, count);
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * power).find((s) => s >= raw) ?? 10 * power;
  const lo = Math.floor(min / step + 1e-9) * step;
  const hi = Math.ceil(max / step - 1e-9) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.abs(v) < step * 1e-9 ? 0 : Number(v.toPrecision(12)));
  return { min: lo, max: hi, step, ticks };
}

function logTicks(min, max) {
  const lo = Math.floor(Math.log10(Math.max(min, 1e-12)));
  const hi = Math.ceil(Math.log10(Math.max(max, 1e-12)));
  const ticks = [];
  for (let p = lo; p <= hi; p++) ticks.push(10 ** p);
  return { min: 10 ** lo, max: 10 ** hi, ticks };
}

/** Smooth path through points (cardinal spline, gentle tension). */
function smoothPath(points) {
  if (points.length < 3) return points.map((p, i) => `${i ? 'L' : 'M'}${r2(p[0])},${r2(p[1])}`).join('');
  let d = `M${r2(points[0][0])},${r2(points[0][1])}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const k = 1 / 6;
    d += `C${r2(p1[0] + (p2[0] - p0[0]) * k)},${r2(p1[1] + (p2[1] - p0[1]) * k)} ${r2(p2[0] - (p3[0] - p1[0]) * k)},${r2(p2[1] - (p3[1] - p1[1]) * k)} ${r2(p2[0])},${r2(p2[1])}`;
  }
  return d;
}

const linePath = (points, mode) => {
  if (mode === 'smooth') return smoothPath(points);
  if (mode === 'step') return points.map((p, i) => (i ? `H${r2((points[i - 1][0] + p[0]) / 2)}V${r2(p[1])}H${r2(p[0])}` : `M${r2(p[0])},${r2(p[1])}`)).join('');
  return points.map((p, i) => `${i ? 'L' : 'M'}${r2(p[0])},${r2(p[1])}`).join('');
};

const polar = (cx, cy, r, angle) => [cx + r * Math.sin(angle), cy - r * Math.cos(angle)];

/** An annular sector (donut slice) from angle a0 to a1 (radians, 0 = up, clockwise). */
function arcPath(cx, cy, r0, r1, a0, a1) {
  const large = a1 - a0 > Math.PI ? 1 : 0;
  if (a1 - a0 >= Math.PI * 2 - 1e-6) {
    // A full ring: two halves.
    const mid = a0 + Math.PI;
    return `${arcPath(cx, cy, r0, r1, a0, mid)}${arcPath(cx, cy, r0, r1, mid, a1 - 1e-6)}`;
  }
  const [x0, y0] = polar(cx, cy, r1, a0);
  const [x1, y1] = polar(cx, cy, r1, a1);
  if (r0 <= 0.5) return `M${r2(cx)},${r2(cy)}L${r2(x0)},${r2(y0)}A${r2(r1)},${r2(r1)} 0 ${large} 1 ${r2(x1)},${r2(y1)}Z`;
  const [x2, y2] = polar(cx, cy, r0, a1);
  const [x3, y3] = polar(cx, cy, r0, a0);
  return `M${r2(x0)},${r2(y0)}A${r2(r1)},${r2(r1)} 0 ${large} 1 ${r2(x1)},${r2(y1)}L${r2(x2)},${r2(y2)}A${r2(r0)},${r2(r0)} 0 ${large} 0 ${r2(x3)},${r2(y3)}Z`;
}

/** Squarified treemap: items [{ value }] laid into rect → [{ x, y, w, h, item }]. */
export function squarify(items, x, y, w, h) {
  const total = items.reduce((a, it) => a + it.value, 0);
  if (!total || w <= 0 || h <= 0) return [];
  const scale = (w * h) / total;
  const nodes = items.map((it) => ({ item: it, area: it.value * scale })).filter((n) => n.area > 0).sort((a, b) => b.area - a.area);
  const out = [];
  let rect = { x, y, w, h };
  let row = [];
  const worst = (list, side) => {
    const sum = list.reduce((a, n) => a + n.area, 0);
    const max = Math.max(...list.map((n) => n.area));
    const min = Math.min(...list.map((n) => n.area));
    return Math.max((side * side * max) / (sum * sum), (sum * sum) / (side * side * min));
  };
  const layoutRow = (list) => {
    const sum = list.reduce((a, n) => a + n.area, 0);
    if (rect.w >= rect.h) {
      const width = sum / rect.h;
      let yy = rect.y;
      for (const n of list) { const hh = n.area / width; out.push({ x: rect.x, y: yy, w: width, h: hh, item: n.item }); yy += hh; }
      rect = { x: rect.x + width, y: rect.y, w: rect.w - width, h: rect.h };
    } else {
      const height = sum / rect.w;
      let xx = rect.x;
      for (const n of list) { const ww = n.area / height; out.push({ x: xx, y: rect.y, w: ww, h: height, item: n.item }); xx += ww; }
      rect = { x: rect.x, y: rect.y + height, w: rect.w, h: rect.h - height };
    }
  };
  for (const node of nodes) {
    const side = Math.min(rect.w, rect.h);
    if (!row.length || worst([...row, node], side) <= worst(row, side)) row.push(node);
    else { layoutRow(row); row = [node]; }
  }
  if (row.length) layoutRow(row);
  return out;
}

/** Least-squares line through points [[x, y]]: { slope, intercept, r2 }. */
export function linearFit(points) {
  const n = points.length;
  if (n < 2) return null;
  const sx = points.reduce((a, p) => a + p[0], 0);
  const sy = points.reduce((a, p) => a + p[1], 0);
  const sxx = points.reduce((a, p) => a + p[0] * p[0], 0);
  const sxy = points.reduce((a, p) => a + p[0] * p[1], 0);
  const den = n * sxx - sx * sx;
  if (!den) return null;
  const slope = (n * sxy - sx * sy) / den;
  const intercept = (sy - slope * sx) / n;
  const mean = sy / n;
  const ssTot = points.reduce((a, p) => a + (p[1] - mean) ** 2, 0);
  const ssRes = points.reduce((a, p) => a + (p[1] - (slope * p[0] + intercept)) ** 2, 0);
  return { slope, intercept, r2: ssTot ? 1 - ssRes / ssTot : 1 };
}

// ───────────────────────── the picture

/** Background options: the program's theme (default), the chart theme's own paper, white, none, or a colour. */
export const BACKGROUNDS = ['theme', 'chart', 'white', 'transparent'];
/** A stored background value as one of BACKGROUNDS or #rrggbb ('auto' of older files = the program's theme). */
export const normalizeBackground = (v) => (BACKGROUNDS.includes(v) ? v : /^#[0-9a-f]{6}$/i.test(String(v)) ? v : 'theme');

/**
 * Colours of the chart's background and text. The background follows the program's theme unless the chart asks
 * for its chart theme's paper, white, none or a colour; text, grid and axis colours always fit the background
 * actually used (the chart theme's own when its paper is as dark / light as it).
 */
export function chartColors(options, theme = {}) {
  const ct = chartTheme(options.chartTheme);
  const bgOption = normalizeBackground(options.background);
  const appBg = theme.surface ?? theme.bg ?? '#ffffff';
  const bg = bgOption === 'theme' ? appBg : bgOption === 'chart' ? ct.bg : bgOption === 'white' ? '#ffffff' : bgOption === 'transparent' ? 'none' : bgOption;
  const base = bg === 'none' ? appBg : bg;
  const dark = readableOn(base) === '#ffffff';
  const themeDark = readableOn(ct.bg) === '#ffffff';
  const own = bgOption === 'chart' || dark === themeDark;
  const appText = bgOption === 'theme' || bg === 'none' ? theme.text : null;
  const text = appText && (readableOn(appText) === '#ffffff') !== dark ? appText : own ? ct.text : dark ? '#e5e7eb' : '#1f2937';
  const muted = bgOption === 'theme' && theme.muted && (readableOn(theme.muted) === '#ffffff') !== dark ? theme.muted : own ? ct.muted : dark ? '#9ca3af' : '#6b7280';
  return {
    bg, base, text, dark, font: ct.font ?? '', gridDash: ct.gridDash ?? '', muted,
    grid: own ? ct.grid : dark ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.1)',
    axis: own ? ct.axis : dark ? 'rgba(255,255,255,0.35)' : 'rgba(15,23,42,0.35)',
  };
}

export function renderChart(doc, view = {}) {
  const table = doc.table;
  const chart = normalizeChart(doc.chart ?? {}, table);
  const width = Math.max(120, Math.round(view.width ?? 800));
  const height = Math.max(90, Math.round(view.height ?? 500));
  const def = chartType(chart.type);
  // A variant draws with the renderer it borrows (base) and the options that make it that variant (preset).
  const drawn = def.base || def.preset ? { ...chart, type: def.base ?? def.id, options: { ...chart.options, ...(def.preset ?? {}) } } : chart;
  const o = drawn.options;
  const lang = view.language === 'en' ? 'en' : 'ko';
  const colors = chartColors(o, view.theme);
  o._bg = colors.base;
  const fs = Math.max(0.5, Math.min(3, Number(o.fontScale) || 1)) * Math.max(0.75, Math.min(1.6, Math.sqrt((width * height) / (900 * 560))));
  const font = o.fontFamily || colors.font || view.fontFamily || "'Segoe UI', 'Malgun Gothic', 'Apple SD Gothic Neo', 'Noto Sans KR', system-ui, sans-serif";
  const ctx = { table, chart: drawn, def, o, lang, colors, fs, width, height, out: [], defs: [], titles: Boolean(view.titles), marks: 0, warnings: [], legend: [] };
  const out = ctx.out;
  if (colors.bg !== 'none') out.push(`<rect class="chart-bg" x="0" y="0" width="${width}" height="${height}" fill="${colors.bg}"/>`);
  if (o.border) out.push(`<rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" fill="none" stroke="${colors.axis}"/>`);
  // Title block.
  let top = 14 * fs;
  const align = o.titleAlign === 'left' ? 'start' : o.titleAlign === 'right' ? 'end' : 'middle';
  const tx = align === 'start' ? 20 * fs : align === 'end' ? width - 20 * fs : width / 2;
  if (chart.title) {
    const size = 20 * fs;
    top += size;
    out.push(`<text class="chart-title" x="${r2(tx)}" y="${r2(top)}" text-anchor="${align}" font-size="${r2(size)}" font-weight="700" fill="${colors.text}">${esc(fitText(chart.title, width - 40, size))}</text>`);
    top += 6 * fs;
  }
  if (chart.subtitle) {
    const size = 13 * fs;
    top += size;
    out.push(`<text class="chart-subtitle" x="${r2(tx)}" y="${r2(top)}" text-anchor="${align}" font-size="${r2(size)}" fill="${colors.muted}">${esc(fitText(chart.subtitle, width - 40, size))}</text>`);
    top += 6 * fs;
  }
  if (o.note) {
    const size = 11 * fs;
    out.push(`<text class="chart-note" x="${r2(width - 12 * fs)}" y="${r2(height - 8 * fs)}" text-anchor="end" font-size="${r2(size)}" fill="${colors.muted}">${esc(fitText(o.note, width - 30, size))}</text>`);
  }
  const area = { x: 16 * fs, y: top + 10 * fs, w: width - 32 * fs, h: height - top - 10 * fs - (o.note ? 26 : 14) * fs };
  let data;
  try {
    data = extract(ctx);
  } catch (error) {
    data = { error: error.message };
  }
  if (data.error) {
    out.push(`<text x="${width / 2}" y="${height / 2}" text-anchor="middle" font-size="${r2(14 * fs)}" fill="${colors.muted}">${esc(data.error)}</text>`);
  } else {
    const plot = placeLegend(ctx, area, data.legend);
    const draw = DRAW[drawn.type] ?? EXTRA_DRAW[drawn.type] ?? drawCartesian;
    draw(ctx, plot, data);
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" class="chart-svg${view.animate ? ' animate' : ''}" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="${esc(font)}" role="img" aria-label="${esc(chart.title || chartType(chart.type)[lang])}">${ctx.defs.length ? `<defs>${ctx.defs.join('')}</defs>` : ''}${out.join('')}</svg>`;
  return { svg, width, height, marks: ctx.marks, legend: ctx.legend, warnings: ctx.warnings, chart, error: data.error ?? null };
}

const L = (ctx, ko, en) => (ctx.lang === 'en' ? en : ko);

/** The rows and series the chart draws. */
function extract(ctx) {
  const { table, chart, o } = ctx;
  const m = chart.mapping;
  if (!table?.columns?.length || !table.rows?.length) return { error: L(ctx, '데이터가 없습니다. 아래 표에 값을 넣거나 파일을 가져오세요.', 'No data yet. Type values in the grid below or import a file.') };
  let order = table.rows.map((_, i) => i);
  const firstValues = m.values?.length ? numbersOf(table, m.values[0]) : null;
  if (o.sort !== 'none' && firstValues && !['candlestick', 'scatter', 'bubble', 'sankey', 'histogram', 'boxplot'].includes(chart.type)) {
    const dir = o.sort === 'asc' ? 1 : -1;
    if (o.sort === 'label') { const labels = labelsOf(table, m.category); const col = new Intl.Collator(ctx.lang, { numeric: true }); order.sort((a, b) => col.compare(labels[a], labels[b])); } else order.sort((a, b) => dir * ((firstValues[a] ?? -Infinity) - (firstValues[b] ?? -Infinity)));
  }
  const max = Number(o.maxItems) || 0;
  if (max > 0) order = order.slice(0, max);
  const pick = (list) => order.map((i) => list[i]);
  const categories = pick(labelsOf(table, m.category ?? null));
  const hidden = new Set(o.hidden.map(Number));
  const series = (m.values ?? []).map((c, i) => ({ index: i, column: c, name: table.columns[c]?.name ?? `#${i + 1}`, values: pick(numbersOf(table, c)), color: seriesColor(o, i), hidden: hidden.has(i) }));
  if (o.transform === 'cumulative') for (const s of series) { let run = 0; s.values = s.values.map((v) => (v == null ? null : (run += v))); }
  const type = chart.type;
  const byRow = BY_ROW.has(type) && type !== 'waterfall';
  if (ctx.def.roles.some((r) => r.id === 'values') && !series.length) {
    return { error: L(ctx, '숫자 열을 하나 이상 고르세요 (오른쪽 데이터 탭).', 'Choose at least one number column (Data tab on the right).') };
  }
  const data = { categories, series, order };
  const mode = ctx.def.legend;
  if (mode === 'none') data.legend = [];
  else if (mode === 'rows') data.legend = categories.map((name, i) => ({ name, color: seriesColor(o, i), hidden: hidden.has(i), index: i }));
  else if (mode === 'series') data.legend = series.map((s) => ({ name: s.name, color: s.color, hidden: s.hidden, index: s.index }));
  else if (byRow) {
    const values = series[0].values;
    data.legend = type === 'gauge' || type === 'treemap' || type === 'sunburst' ? [] : categories.map((name, i) => ({ name, color: seriesColor(o, i), hidden: hidden.has(i), index: i, value: values[i] }));
  } else if (type === 'heatmap' || type === 'candlestick' || type === 'sankey' || type === 'histogram' && series.length === 1 || type === 'boxplot') data.legend = [];
  else if (type === 'bubble') {
    const groups = m.group != null ? [...new Set(pick(labelsOf(table, m.group)))] : [];
    data.legend = groups.map((name, i) => ({ name, color: seriesColor(o, i), hidden: hidden.has(i), index: i }));
  } else if (type === 'waterfall') {
    data.legend = [
      { name: L(ctx, '증가', 'Increase'), color: o.upColor, index: 0, static: true },
      { name: L(ctx, '감소', 'Decrease'), color: o.downColor, index: 1, static: true },
      ...(o.waterfallTotal ? [{ name: L(ctx, '합계', 'Total'), color: seriesColor(o, 0), index: 2, static: true }] : []),
    ];
  } else data.legend = series.map((s) => ({ name: s.name, color: s.color, hidden: s.hidden, index: s.index }));
  return data;
}

/** Draws the legend in its place and returns the plot area left over. */
function placeLegend(ctx, area, items) {
  const { o, fs, colors, out } = ctx;
  ctx.legend = items.map((it) => ({ name: it.name, color: it.color, hidden: Boolean(it.hidden) }));
  if (!items.length || o.legend === 'none') return area;
  const size = 12 * fs;
  const sw = 12 * fs;
  const gap = 18 * fs;
  const itemWidth = (it) => sw + 6 * fs + Math.min(textWidth(it.name, size), 200 * fs);
  const rowH = size + 8 * fs;
  const draw = (it, x, y) => {
    const label = fitText(it.name, 200 * fs, size);
    out.push(`<g class="legend-item${it.hidden ? ' off' : ''}" data-legend="${it.static ? '' : it.index}" opacity="${it.hidden ? 0.4 : 1}" style="cursor:pointer"><rect x="${r2(x)}" y="${r2(y - sw + 2 * fs)}" width="${r2(sw)}" height="${r2(sw)}" rx="${r2(3 * fs)}" fill="${it.color}"/><text x="${r2(x + sw + 6 * fs)}" y="${r2(y)}" font-size="${r2(size)}" fill="${colors.text}"${it.hidden ? ' text-decoration="line-through"' : ''}>${esc(label)}</text></g>`);
  };
  if (o.legend === 'left' || o.legend === 'right') {
    const w = Math.min(area.w * 0.35, Math.max(...items.map(itemWidth)) + 10 * fs);
    const shown = Math.max(1, Math.floor(area.h / rowH));
    const list = items.slice(0, shown);
    const total = list.length * rowH;
    let y = area.y + Math.max(0, (area.h - total) / 2) + size;
    const x = o.legend === 'left' ? area.x : area.x + area.w - w;
    for (const it of list) { draw({ ...it, name: fitText(it.name, w - sw - 10 * fs, size) }, x, y); y += rowH; }
    return o.legend === 'left' ? { x: area.x + w + 10 * fs, y: area.y, w: area.w - w - 10 * fs, h: area.h } : { x: area.x, y: area.y, w: area.w - w - 10 * fs, h: area.h };
  }
  // Top / bottom: rows of items, centred, at most three rows.
  const rows = [[]];
  let lineW = 0;
  for (const it of items) {
    const w = itemWidth(it) + gap;
    if (lineW + w > area.w && rows[rows.length - 1].length) { if (rows.length === 3) break; rows.push([]); lineW = 0; }
    rows[rows.length - 1].push(it);
    lineW += w;
  }
  const blockH = rows.length * rowH + 6 * fs;
  let y = o.legend === 'top' ? area.y + size : area.y + area.h - blockH + size + 6 * fs;
  for (const row of rows) {
    const total = row.reduce((a, it) => a + itemWidth(it) + gap, -gap);
    let x = area.x + (area.w - total) / 2;
    for (const it of row) { draw(it, x, y); x += itemWidth(it) + gap; }
    y += rowH;
  }
  return o.legend === 'top' ? { x: area.x, y: area.y + blockH, w: area.w, h: area.h - blockH } : { x: area.x, y: area.y, w: area.w, h: area.h - blockH };
}

/** One mark: data attributes for the app (selection, tips), a <title> in exports. */
function mark(ctx, tag, attrs, tip, s, r) {
  ctx.marks++;
  const a = Object.entries(attrs).map(([k, v]) => `${k}="${typeof v === 'number' ? r2(v) : esc(v)}"`).join(' ');
  const data = `class="mark${attrs.class ? ` ${attrs.class}` : ''}" data-s="${s ?? ''}" data-r="${r ?? ''}" data-tip="${esc(tip)}"`;
  const body = ctx.titles && tip ? `<title>${esc(tip)}</title>` : '';
  return `<${tag} ${a.replace(/class="[^"]*"\s?/, '')} ${data}${body ? `>${body}</${tag}>` : '/>'}`;
}

function label(ctx, x, y, text, { anchor = 'middle', color = null, size = 11, weight = 500, baseline = '' } = {}) {
  if (text === '' || text == null) return;
  ctx.out.push(`<text class="data-label" x="${r2(x)}" y="${r2(y)}" text-anchor="${anchor}" font-size="${r2(size * ctx.fs)}" font-weight="${weight}" fill="${color ?? ctx.colors.text}"${baseline ? ` dominant-baseline="${baseline}"` : ''}>${esc(text)}</text>`);
}

// ───────────────────────── cartesian charts (axes)

/** A value scale: domain → pixels, with ticks; log when asked and every value is positive. */
function valueScale(ctx, min, max, from, to, { forceZero = true, axis = 'y' } = {}) {
  const o = ctx.o;
  const userMin = parseNumber(axis === 'y2' ? '' : o.yMin);
  const userMax = parseNumber(axis === 'y2' ? '' : o.yMax);
  let lo = userMin ?? min;
  let hi = userMax ?? max;
  if (forceZero && o.beginAtZero !== false && userMin == null) lo = Math.min(lo, 0);
  if (forceZero && o.beginAtZero !== false && userMax == null) hi = Math.max(hi, 0);
  const span = Math.abs(to - from);
  const count = Math.max(2, Math.min(10, Math.round(span / (axis === 'x' ? 90 : 46) / ctx.fs)));
  if (o.yScale === 'log' && axis !== 'x' && lo > 0) {
    const t = logTicks(lo, hi);
    const a = Math.log10(t.min);
    const b = Math.log10(t.max);
    return { min: t.min, max: t.max, ticks: t.ticks, log: true, map: (v) => from + ((Math.log10(Math.max(v, t.min)) - a) / (b - a || 1)) * (to - from), base: t.min };
  }
  const t = niceTicks(lo, hi, count);
  const a = userMin ?? t.min;
  const b = userMax ?? t.max;
  const ticks = t.ticks.filter((v) => v >= a - 1e-9 && v <= b + 1e-9);
  return { min: a, max: b, ticks, map: (v) => from + ((v - a) / (b - a || 1)) * (to - from), base: Math.max(a, Math.min(b, 0)) };
}

/** Category labels along an axis: rotated or thinned when they would overlap; returns the room they take. */
function categoryLabelRoom(ctx, labels, band, horizontal) {
  const size = 11.5 * ctx.fs;
  const widest = Math.max(0, ...labels.map((l) => textWidth(l, size)));
  if (horizontal) return { width: Math.min(widest, 180 * ctx.fs) + 10 * ctx.fs, angle: 0, every: 1, size };
  const angleOption = ctx.o.xLabelAngle;
  let angle = angleOption === 'auto' ? (widest + 6 > band ? (widest > band * 3 ? 90 : 45) : 0) : Number(angleOption) || 0;
  const maxLen = 140 * ctx.fs;
  const room = angle === 0 ? size + 8 * ctx.fs : Math.min(widest, maxLen) * Math.sin((angle * Math.PI) / 180) + size + 8 * ctx.fs;
  // Still crowded when rotated: show every n-th label.
  const need = angle === 0 ? widest + 6 : size * 1.4;
  const every = Math.max(1, Math.ceil(need / Math.max(1, band)));
  if (angleOption === 'auto' && angle === 90 && every === 1 && widest < band * 6) angle = 45;
  return { height: room, angle, every, size, maxLen };
}

function drawAxisTitle(ctx, text, x, y, rotate = 0) {
  if (!text) return;
  ctx.out.push(`<text class="axis-title" x="${r2(x)}" y="${r2(y)}" text-anchor="middle" font-size="${r2(12.5 * ctx.fs)}" font-weight="600" fill="${ctx.colors.muted}"${rotate ? ` transform="rotate(${rotate} ${r2(x)} ${r2(y)})"` : ''}>${esc(text)}</text>`);
}

/**
 * Lays out a cartesian plot: value axis (with ticks and grid), category axis (band per row), titles. Returns the
 * band scale and the value scale for the marks.
 */
function axes(ctx, plot, { categories, min, max, horizontal = false, forceZero = true, percent = false, y2 = null, numericX = null }) {
  const { fs, colors, o, out } = ctx;
  const tickSize = 11 * fs;
  const yTitle = o.yTitle;
  const xTitle = o.xTitle;
  let left = plot.x + (horizontal ? (xTitle ? 18 * fs : 0) : (yTitle ? 20 * fs : 0));
  let right = plot.x + plot.w - (y2 ? (o.y2Title ? 20 * fs : 0) : 6 * fs);
  let bottom = plot.y + plot.h - ((horizontal ? yTitle : xTitle) ? 22 * fs : 0);
  const topY = plot.y + 6 * fs;
  // Value axis labels' width (vertical charts) is known from the tick texts.
  const vs0 = valueScale(ctx, min, max, 0, 1, { forceZero });
  const tickText = (v, scale) => (percent ? formatValue(v, o, ctx.lang, { percent: true }) : formatValue(v, o, ctx.lang, { tick: true }));
  let catRoom;
  let xScale = null;
  if (numericX) {
    const xs0 = valueScale(ctx, numericX.min, numericX.max, 0, 1, { forceZero: false, axis: 'x' });
    const leftW = Math.max(...vs0.ticks.map((v) => textWidth(tickText(v), tickSize))) + 10 * fs;
    left += leftW;
    bottom -= tickSize + 10 * fs;
    xScale = valueScale(ctx, numericX.min, numericX.max, left, right, { forceZero: false, axis: 'x' });
    void xs0;
  } else if (!horizontal) {
    const leftW = Math.max(...vs0.ticks.map((v) => textWidth(tickText(v), tickSize))) + 10 * fs;
    left += leftW;
    if (y2) right -= Math.max(...valueScale(ctx, y2.min, y2.max, 0, 1, { axis: 'y2' }).ticks.map((v) => textWidth(formatValue(v, o, ctx.lang, { tick: true }), tickSize))) + 10 * fs;
    catRoom = categoryLabelRoom(ctx, categories, (right - left) / Math.max(1, categories.length), false);
    bottom -= catRoom.height;
  } else {
    catRoom = categoryLabelRoom(ctx, categories, 0, true);
    left += catRoom.width;
    bottom -= tickSize + 10 * fs;
  }
  const vs = numericX || !horizontal ? valueScale(ctx, min, max, bottom, topY, { forceZero }) : valueScale(ctx, min, max, left, right - 10 * fs, { forceZero, axis: 'x' });
  // Grid and value ticks.
  for (const v of vs.ticks) {
    const p = vs.map(v);
    if (!horizontal || numericX) {
      if (o.gridLines) out.push(`<line class="grid" x1="${r2(left)}" x2="${r2(right)}" y1="${r2(p)}" y2="${r2(p)}" stroke="${colors.grid}"${colors.gridDash ? ` stroke-dasharray="${colors.gridDash}"` : ''}/>`);
      out.push(`<text class="tick" x="${r2(left - 7 * fs)}" y="${r2(p + tickSize * 0.35)}" text-anchor="end" font-size="${r2(tickSize)}" fill="${colors.muted}">${esc(tickText(v))}</text>`);
    } else {
      if (o.gridLines) out.push(`<line class="grid" y1="${r2(topY)}" y2="${r2(bottom)}" x1="${r2(p)}" x2="${r2(p)}" stroke="${colors.grid}"${colors.gridDash ? ` stroke-dasharray="${colors.gridDash}"` : ''}/>`);
      out.push(`<text class="tick" x="${r2(p)}" y="${r2(bottom + tickSize + 6 * fs)}" text-anchor="middle" font-size="${r2(tickSize)}" fill="${colors.muted}">${esc(tickText(v))}</text>`);
    }
  }
  let band = null;
  if (xScale) {
    for (const v of xScale.ticks) {
      const p = xScale.map(v);
      if (o.xGridLines) out.push(`<line class="grid" y1="${r2(topY)}" y2="${r2(bottom)}" x1="${r2(p)}" x2="${r2(p)}" stroke="${colors.grid}"${colors.gridDash ? ` stroke-dasharray="${colors.gridDash}"` : ''}/>`);
      out.push(`<text class="tick" x="${r2(p)}" y="${r2(bottom + tickSize + 6 * fs)}" text-anchor="middle" font-size="${r2(tickSize)}" fill="${colors.muted}">${esc(formatValue(v, o, ctx.lang, { tick: true }))}</text>`);
    }
    out.push(`<line class="axis" x1="${r2(left)}" x2="${r2(right)}" y1="${r2(bottom)}" y2="${r2(bottom)}" stroke="${colors.axis}"/>`);
  } else {
    const n = Math.max(1, categories.length);
    const from = horizontal ? topY : left;
    const to = horizontal ? bottom : right;
    const step = (to - from) / n;
    band = { from, step, center: (i) => from + step * (i + 0.5), n };
    // Category labels.
    categories.forEach((name, i) => {
      if (i % catRoom.every) return;
      const c = band.center(i);
      if (o.xGridLines) out.push(horizontal ? `<line class="grid" x1="${r2(left)}" x2="${r2(right)}" y1="${r2(c)}" y2="${r2(c)}" stroke="${colors.grid}"${colors.gridDash ? ` stroke-dasharray="${colors.gridDash}"` : ''}/>` : `<line class="grid" y1="${r2(topY)}" y2="${r2(bottom)}" x1="${r2(c)}" x2="${r2(c)}" stroke="${colors.grid}"${colors.gridDash ? ` stroke-dasharray="${colors.gridDash}"` : ''}/>`);
      if (horizontal) {
        out.push(`<text class="cat" x="${r2(left - 8 * fs)}" y="${r2(c + catRoom.size * 0.35)}" text-anchor="end" font-size="${r2(catRoom.size)}" fill="${colors.text}">${esc(fitText(name, catRoom.width - 10 * fs, catRoom.size))}</text>`);
      } else if (catRoom.angle) {
        const y = bottom + 10 * fs;
        out.push(`<text class="cat" x="${r2(c)}" y="${r2(y)}" text-anchor="end" font-size="${r2(catRoom.size)}" fill="${colors.text}" transform="rotate(-${catRoom.angle} ${r2(c)} ${r2(y)})" dominant-baseline="middle">${esc(fitText(name, catRoom.maxLen, catRoom.size))}</text>`);
      } else {
        out.push(`<text class="cat" x="${r2(c)}" y="${r2(bottom + catRoom.size + 6 * fs)}" text-anchor="middle" font-size="${r2(catRoom.size)}" fill="${colors.text}">${esc(fitText(name, step * catRoom.every - 4, catRoom.size))}</text>`);
      }
    });
    out.push(horizontal ? `<line class="axis" x1="${r2(left)}" x2="${r2(left)}" y1="${r2(topY)}" y2="${r2(bottom)}" stroke="${colors.axis}"/>` : `<line class="axis" x1="${r2(left)}" x2="${r2(right)}" y1="${r2(bottom)}" y2="${r2(bottom)}" stroke="${colors.axis}"/>`);
  }
  // Zero line when the values cross zero.
  if (vs.min < 0 && vs.max > 0) {
    const z = vs.map(0);
    out.push(horizontal && !numericX ? `<line class="zero" y1="${r2(topY)}" y2="${r2(bottom)}" x1="${r2(z)}" x2="${r2(z)}" stroke="${colors.axis}"/>` : `<line class="zero" x1="${r2(left)}" x2="${r2(right)}" y1="${r2(z)}" y2="${r2(z)}" stroke="${colors.axis}"/>`);
  }
  // Secondary axis (combo lines).
  let vs2 = null;
  if (y2) {
    vs2 = valueScale(ctx, y2.min, y2.max, bottom, topY, { axis: 'y2' });
    for (const v of vs2.ticks) out.push(`<text class="tick" x="${r2(right + 7 * fs)}" y="${r2(vs2.map(v) + tickSize * 0.35)}" text-anchor="start" font-size="${r2(tickSize)}" fill="${colors.muted}">${esc(formatValue(v, o, ctx.lang, { tick: true }))}</text>`);
    drawAxisTitle(ctx, o.y2Title, plot.x + plot.w - 8 * fs, (topY + bottom) / 2, 90);
  }
  // Axis titles.
  if (horizontal && !numericX) {
    drawAxisTitle(ctx, xTitle, plot.x + 8 * fs, (topY + bottom) / 2, -90);
    drawAxisTitle(ctx, yTitle, (left + right) / 2, plot.y + plot.h - 4 * fs);
  } else {
    drawAxisTitle(ctx, yTitle, plot.x + 8 * fs, (topY + bottom) / 2, -90);
    drawAxisTitle(ctx, xTitle, (left + right) / 2, plot.y + plot.h - 4 * fs);
  }
  return { left, right, top: topY, bottom, band, vs, vs2, xScale };
}

const visible = (series) => series.filter((s) => !s.hidden);
const finite = (list) => list.filter((v) => v != null && Number.isFinite(v));
const tipOf = (ctx, s, cat, v, extra = '') => `${s ? `${s} · ` : ''}${cat}: ${formatValue(v, ctx.o, ctx.lang)}${extra}`;

/** Bars, lines, areas (grouped, stacked, 100 %), combo and lollipop. */
function drawCartesian(ctx, plot, data) {
  const { chart, o, fs, out } = ctx;
  const type = chart.type;
  const horizontal = HORIZONTAL.has(type) || Boolean(o.horizontal);
  const stacked = STACKED.has(type);
  const percent = PERCENT.has(type);
  const series = visible(data.series);
  const n = data.categories.length;
  if (!series.length) { label(ctx, plot.x + plot.w / 2, plot.y + plot.h / 2, L(ctx, '모든 계열이 숨겨져 있습니다', 'Every series is hidden'), { color: ctx.colors.muted, size: 13 }); return; }
  const totals = data.categories.map((_, i) => series.reduce((a, s) => a + Math.abs(s.values[i] ?? 0), 0));
  const valueAt = (s, i) => {
    const v = s.values[i];
    if (v == null) return null;
    return percent ? (totals[i] ? v / totals[i] : 0) : v;
  };
  // Domain.
  let min = Infinity;
  let max = -Infinity;
  const isLineSeries = (si) => ['line', 'spline', 'stepLine'].includes(type) || (type === 'combo' && si > 0);
  const secondary = type === 'combo' && o.secondAxis && series.length > 1;
  let y2 = null;
  if (stacked || percent) {
    for (let i = 0; i < n; i++) {
      let pos = 0;
      let neg = 0;
      for (const s of series) { const v = valueAt(s, i) ?? 0; if (v >= 0) pos += v; else neg += v; }
      max = Math.max(max, pos);
      min = Math.min(min, neg);
    }
  } else {
    for (const [si, s] of series.entries()) {
      if (secondary && si > 0) continue;
      for (const v of finite(s.values)) { min = Math.min(min, v); max = Math.max(max, v); }
    }
    if (secondary) {
      const vals = series.slice(1).flatMap((s) => finite(s.values));
      y2 = { min: Math.min(0, ...vals), max: Math.max(0, ...vals) };
    }
  }
  if (!Number.isFinite(min)) { min = 0; max = 1; }
  if (percent) { min = Math.min(0, min); max = 1; }
  const lineOnly = ['line', 'spline', 'stepLine'].includes(type);
  const ax = axes(ctx, plot, { categories: data.categories, min, max, horizontal, forceZero: !lineOnly || o.beginAtZero !== false, percent, y2 });
  const { band, vs } = ax;
  const base = vs.map(vs.log ? vs.min : vs.base);
  const fmt = (v) => (percent ? formatValue(v, o, ctx.lang, { percent: true }) : formatValue(v, o, ctx.lang));
  const radius = Math.max(0, Number(o.barRadius) || 0) * fs;
  const barSeries = type === 'combo' ? series.slice(0, 1) : ['line', 'spline', 'stepLine', 'area', 'stackedArea', 'percentArea'].includes(type) ? [] : series;
  // Bars.
  if (barSeries.length && type !== 'lollipop') {
    const inner = band.step * (1 - Math.max(0, Math.min(0.9, Number(o.barGap) || 0)));
    const groups = stacked || percent ? 1 : barSeries.length;
    const bw = inner / groups;
    for (let i = 0; i < n; i++) {
      let pos = 0;
      let neg = 0;
      barSeries.forEach((s, k) => {
        const v = valueAt(s, i);
        if (v == null) return;
        let a;
        let b;
        if (stacked || percent) { if (v >= 0) { a = pos; b = pos + v; pos = b; } else { a = neg; b = neg + v; neg = b; } } else { a = vs.log ? vs.min : 0; b = v; }
        const p0 = vs.map(a);
        const p1 = vs.map(b);
        const offset = band.from + band.step * i + (band.step - inner) / 2 + (groups > 1 ? k * bw : 0);
        const thick = Math.max(1, bw - (groups > 1 ? 2 * fs : 0));
        const rr = Math.min(radius, thick / 2, Math.abs(p1 - p0) / 2);
        const tip = tipOf(ctx, s.name, data.categories[i], s.values[i], percent ? ` (${fmt(v)})` : '');
        const rect = horizontal
          ? { x: Math.min(p0, p1), y: offset, width: Math.abs(p1 - p0), height: thick }
          : { x: offset, y: Math.min(p0, p1), width: thick, height: Math.abs(p1 - p0) };
        let fill = s.color;
        if (o.colorBySign) fill = (s.values[i] ?? 0) < 0 ? o.downColor : o.upColor;
        if (o.gradient) {
          const id = `grad-${s.index}-${fill.slice(1)}`;
          if (!ctx.defs.some((d) => d.includes(`id="${id}"`))) ctx.defs.push(`<linearGradient id="${id}" x1="0" y1="0" x2="${horizontal ? 1 : 0}" y2="${horizontal ? 0 : 1}"><stop offset="0" stop-color="${horizontal ? lighten(fill, 0.45) : fill}"/><stop offset="1" stop-color="${horizontal ? fill : lighten(fill, 0.45)}"/></linearGradient>`);
          fill = `url(#${id})`;
        }
        out.push(mark(ctx, 'rect', { ...rect, rx: rr, fill, class: 'bar' }, tip, s.index, data.order[i]));
        if (o.dataLabels) {
          const inside = stacked || percent;
          const txt = fmt(percent ? v : s.values[i]);
          if (horizontal) {
            const x = inside ? (p0 + p1) / 2 : p1 + (v >= 0 ? 4 : -4) * fs;
            if (!inside || Math.abs(p1 - p0) > textWidth(txt, 10.5 * fs) + 4) label(ctx, x, offset + thick / 2 + 4 * fs, txt, { anchor: inside ? 'middle' : v >= 0 ? 'start' : 'end', color: inside ? readableOn(s.color) : null, size: 10.5 });
          } else {
            const y = inside ? (p0 + p1) / 2 + 4 * fs : p1 + (v >= 0 ? -5 : 13) * fs;
            if (!inside || Math.abs(p1 - p0) > 14 * fs) label(ctx, offset + thick / 2, y, txt, { color: inside ? readableOn(s.color) : null, size: 10.5 });
          }
        }
      });
    }
  }
  // Lollipops.
  if (type === 'lollipop') {
    const groups = series.length;
    const inner = band.step * 0.7;
    series.forEach((s, k) => {
      for (let i = 0; i < n; i++) {
        const v = s.values[i];
        if (v == null) continue;
        const c = band.from + band.step * i + (band.step - inner) / 2 + (inner / groups) * (k + 0.5);
        const p = vs.map(v);
        const rr = Math.max(3, (Number(o.markerSize) || 4) * 1.6) * fs;
        if (o.stick !== false) out.push(horizontal ? `<line x1="${r2(base)}" x2="${r2(p)}" y1="${r2(c)}" y2="${r2(c)}" stroke="${s.color}" stroke-width="${r2(2 * fs)}"/>` : `<line x1="${r2(c)}" x2="${r2(c)}" y1="${r2(base)}" y2="${r2(p)}" stroke="${s.color}" stroke-width="${r2(2 * fs)}"/>`);
        out.push(mark(ctx, 'circle', { cx: horizontal ? p : c, cy: horizontal ? c : p, r: rr, fill: s.color, stroke: ctx.colors.bg === 'none' ? '#fff' : ctx.colors.bg, 'stroke-width': 1.5 * fs, class: 'dot' }, tipOf(ctx, s.name, data.categories[i], v), s.index, data.order[i]));
        if (o.dataLabels) label(ctx, horizontal ? p + rr + 4 * fs : c, horizontal ? c + 4 * fs : p - rr - 4 * fs, fmt(v), { anchor: horizontal ? 'start' : 'middle', size: 10.5 });
      }
    });
  }
  // Areas.
  if (['area', 'stackedArea', 'percentArea'].includes(type)) {
    const lower = Array(n).fill(0);
    const order = stacked || percent ? series : [...series].reverse();
    for (const s of order) {
      const top = [];
      const bottom = [];
      for (let i = 0; i < n; i++) {
        const v = valueAt(s, i) ?? 0;
        const a = stacked || percent ? lower[i] : 0;
        const b = a + v;
        top.push([band.center(i), vs.map(b)]);
        bottom.push([band.center(i), vs.map(vs.log ? Math.max(a, vs.min) : a)]);
        if (stacked || percent) lower[i] = b;
      }
      const areaMode = o.smooth ? 'smooth' : o.step ? 'step' : 'line';
      const d = `${linePath(top, areaMode)}L${bottom.reverse().map((p) => `${r2(p[0])},${r2(p[1])}`).join('L')}Z`;
      out.push(mark(ctx, 'path', { d, fill: s.color, 'fill-opacity': Number.isFinite(Number(o.areaOpacity)) ? Math.max(0, Math.min(1, Number(o.areaOpacity))) : 0.35, stroke: 'none', class: 'area' }, s.name, s.index, ''));
      out.push(`<path class="line" d="${linePath(top, areaMode)}" fill="none" stroke="${s.color}" stroke-width="${r2((Number(o.lineWidth) || 2) * fs)}" stroke-linejoin="round"/>`);
      if (o.markers) top.forEach((p, i) => out.push(mark(ctx, 'circle', { cx: p[0], cy: p[1], r: (Number(o.markerSize) || 4) * fs * 0.8, fill: s.color, class: 'dot' }, tipOf(ctx, s.name, data.categories[i], s.values[i]), s.index, data.order[i])));
      if (o.dataLabels) top.forEach((p, i) => label(ctx, p[0], p[1] - 7 * fs, fmt(percent ? valueAt(s, i) : s.values[i]), { size: 10 }));
    }
  }
  // Lines (line, spline, step, and the combo's lines).
  const lineSeries = type === 'combo' ? series.slice(1) : lineOnly ? series : [];
  const mode = type === 'spline' || (type !== 'stepLine' && o.smooth) ? 'smooth' : type === 'stepLine' ? 'step' : 'line';
  for (const s of lineSeries) {
    const scale = secondary ? ax.vs2 : vs;
    const runs = [[]];
    s.values.forEach((v, i) => { if (v == null) { if (runs[runs.length - 1].length) runs.push([]); } else runs[runs.length - 1].push([band.center(i), scale.map(v), i]); });
    for (const run of runs) if (run.length) out.push(`<path class="mark line" data-s="${s.index}" data-r="" data-tip="${esc(s.name)}" d="${linePath(run, mode)}" fill="none" stroke="${s.color}" stroke-width="${r2((Number.isFinite(Number(o.lineWidth)) ? Number(o.lineWidth) : 2.5) * fs)}"${o.dash ? ` stroke-dasharray="${r2(8 * fs)} ${r2(5 * fs)}"` : ''} stroke-linejoin="round" stroke-linecap="round"/>`);
    ctx.marks++;
    for (const run of runs) for (const [x, y, i] of run) {
      if (o.markers || run.length === 1) out.push(mark(ctx, 'circle', { cx: x, cy: y, r: (Number(o.markerSize) || 4) * fs, fill: ctx.colors.bg === 'none' ? '#ffffff' : ctx.colors.bg, stroke: s.color, 'stroke-width': 2 * fs, class: 'dot' }, tipOf(ctx, s.name, data.categories[i], s.values[i]), s.index, data.order[i]));
      else out.push(mark(ctx, 'circle', { cx: x, cy: y, r: 7 * fs, fill: 'transparent', class: 'hit' }, tipOf(ctx, s.name, data.categories[i], s.values[i]), s.index, data.order[i]));
      if (o.dataLabels) label(ctx, x, y - 9 * fs, fmt(s.values[i]), { size: 10.5 });
    }
    if (o.trendline) trend(ctx, s, s.values.map((v, i) => (v == null ? null : [i, v])).filter(Boolean), (i) => band.center(i), (v) => scale.map(v), [0, n - 1]);
    const w = Math.round(Number(o.movingAverage) || 0);
    if (w > 1) {
      const pts = s.values.map((v, i) => { const win = s.values.slice(Math.max(0, i - w + 1), i + 1).filter((x) => x != null); return i >= w - 1 && win.length ? [band.center(i), scale.map(win.reduce((a, b) => a + b, 0) / win.length)] : null; }).filter(Boolean);
      if (pts.length > 1) out.push(`<path class="ma" d="${linePath(pts, 'smooth')}" fill="none" stroke="${darken(s.color, 0.3)}" stroke-width="${r2(2 * fs)}" stroke-dasharray="${r2(3 * fs)} ${r2(3 * fs)}"><title>${esc(`${s.name} — ${w}`)}</title></path>`);
    }
  }
}

function trend(ctx, s, points, mapX, mapY, [x0, x1]) {
  const fit = linearFit(points);
  if (!fit) return;
  const a = [mapX(x0), mapY(fit.slope * x0 + fit.intercept)];
  const b = [mapX(x1), mapY(fit.slope * x1 + fit.intercept)];
  ctx.out.push(`<line class="trend" x1="${r2(a[0])}" y1="${r2(a[1])}" x2="${r2(b[0])}" y2="${r2(b[1])}" stroke="${s.color}" stroke-width="${r2(1.6 * ctx.fs)}" stroke-dasharray="${r2(6 * ctx.fs)} ${r2(4 * ctx.fs)}" opacity="0.85"><title>${esc(`${s.name}: y = ${formatValue(fit.slope, { decimals: 3 }, ctx.lang)}x + ${formatValue(fit.intercept, { decimals: 3 }, ctx.lang)} (R² ${fit.r2.toFixed(3)})`)}</title></line>`);
}

function drawWaterfall(ctx, plot, data) {
  const { o, out, fs } = ctx;
  const s = data.series[0];
  const cats = [...data.categories];
  const steps = [];
  let run = 0;
  s.values.forEach((v, i) => { const value = v ?? 0; steps.push({ a: run, b: run + value, v: value, kind: value >= 0 ? 'up' : 'down', cat: cats[i], row: data.order[i] }); run += value; });
  if (o.waterfallTotal) { steps.push({ a: 0, b: run, v: run, kind: 'total', cat: L(ctx, '합계', 'Total'), row: '' }); cats.push(L(ctx, '합계', 'Total')); }
  const all = steps.flatMap((x) => [x.a, x.b]);
  const ax = axes(ctx, plot, { categories: cats, min: Math.min(0, ...all), max: Math.max(0, ...all) });
  const { band, vs } = ax;
  const w = band.step * (1 - (Number(o.barGap) || 0.28));
  steps.forEach((st, i) => {
    const color = st.kind === 'total' ? seriesColor(o, 0) : st.kind === 'up' ? o.upColor : o.downColor;
    const y0 = vs.map(st.a);
    const y1 = vs.map(st.b);
    const x = band.from + band.step * i + (band.step - w) / 2;
    out.push(mark(ctx, 'rect', { x, y: Math.min(y0, y1), width: w, height: Math.max(1, Math.abs(y1 - y0)), rx: Math.min((Number(o.barRadius) || 0) * fs, w / 4), fill: color, class: 'bar' }, tipOf(ctx, s.name, st.cat, st.v), st.kind === 'total' ? '' : 0, st.row));
    if (i < steps.length - 1) out.push(`<line class="connector" x1="${r2(x + w)}" x2="${r2(x + band.step)}" y1="${r2(y1)}" y2="${r2(y1)}" stroke="${ctx.colors.axis}" stroke-dasharray="3 3"/>`);
    if (o.dataLabels) label(ctx, x + w / 2, Math.min(y0, y1) - 5 * fs, `${st.kind === 'up' && st.v > 0 ? '+' : ''}${formatValue(st.v, o, ctx.lang)}`, { size: 10.5 });
  });
}

/**
 * Open / high / low / close for a table without all four price columns, from the number columns it has: one column →
 * each row opens at the row before and closes at its own value; several → opens at the first, closes at the last,
 * high and low are the largest and smallest of the row. So every table draws as candles.
 */
function derivedOhlc(ctx, data) {
  const { table, chart } = ctx;
  const cols = numberColumns(table).filter((c) => c !== chart.mapping.category);
  const rows = data.order.map((i) => cols.map((c) => numbersOf(table, c)[i]).filter((v) => v != null));
  const open = [];
  const close = [];
  const high = [];
  const low = [];
  rows.forEach((vals, k) => {
    if (!vals.length) { open.push(null); close.push(null); high.push(null); low.push(null); return; }
    const o = vals.length === 1 ? (rows[k - 1]?.at(-1) ?? vals[0]) : vals[0];
    const c = vals.at(-1);
    open.push(o); close.push(c); high.push(Math.max(o, ...vals)); low.push(Math.min(o, ...vals));
  });
  return { open, high, low, close };
}

/** Flows for a table without source / target text columns: each row (its name) flows into each number column. */
function fallbackFlows(ctx, data) {
  const { table, chart } = ctx;
  const cols = numberColumns(table).filter((c) => c !== chart.mapping.category);
  const names = data.order.map((i) => (chart.mapping.category != null ? labelsOf(table, chart.mapping.category)[i] : textColumns(table).length ? labelsOf(table, textColumns(table)[0])[i] : `#${i + 1}`));
  const rows = data.order.map((i, k) => ({ i, name: names[k] || `#${i + 1}`, total: cols.reduce((a, c) => a + Math.max(0, numbersOf(table, c)[i] ?? 0), 0) }));
  // At most 30 rows (the largest) so the picture stays readable.
  const keep = new Set([...rows].sort((a, b) => b.total - a.total).slice(0, 30).map((r) => r.i));
  const links = [];
  for (const r of rows) if (keep.has(r.i)) for (const c of cols) { const v = numbersOf(table, c)[r.i]; const b = table.columns[c].name; if (v > 0 && r.name !== b) links.push({ a: r.name, b, v, row: r.i }); }
  return links;
}

function drawCandles(ctx, plot, data) {
  const { table, chart, o, out, fs } = ctx;
  const m = chart.mapping;
  const pick = (c) => data.order.map((i) => (c == null ? null : numbersOf(table, c)[i]));
  let [open, high, low, close] = ['open', 'high', 'low', 'close'].map((k) => pick(m[k]));
  // Fewer than four price columns: prices made from the numbers there are (see derivedOhlc).
  if (['open', 'high', 'low', 'close'].some((k) => m[k] == null)) ({ open, high, low, close } = derivedOhlc(ctx, data));
  if (o.heikinAshi) {
    const ha = { open: [], high: [], low: [], close: [] };
    open.forEach((_, i) => {
      if ([open[i], high[i], low[i], close[i]].some((v) => v == null)) { for (const k of Object.keys(ha)) ha[k].push(null); return; }
      const c = (open[i] + high[i] + low[i] + close[i]) / 4;
      const prevOpen = ha.open[i - 1];
      const op = prevOpen == null ? (open[i] + close[i]) / 2 : (prevOpen + ha.close[i - 1]) / 2;
      ha.open.push(op); ha.close.push(c); ha.high.push(Math.max(high[i], op, c)); ha.low.push(Math.min(low[i], op, c));
    });
    ({ open, high, low, close } = ha);
  }
  const all = finite([...high, ...low, ...open, ...close]);
  if (!all.length) { label(ctx, plot.x + plot.w / 2, plot.y + plot.h / 2, L(ctx, '시가·고가·저가·종가 열을 고르세요', 'Choose open, high, low and close columns'), { color: ctx.colors.muted, size: 13 }); return; }
  const ax = axes(ctx, plot, { categories: data.categories, min: Math.min(...all), max: Math.max(...all), forceZero: false });
  const { band, vs } = ax;
  const w = Math.max(2, band.step * 0.6);
  data.categories.forEach((cat, i) => {
    if ([open[i], high[i], low[i], close[i]].some((v) => v == null)) return;
    const up = close[i] >= open[i];
    const color = up ? o.upColor : o.downColor;
    const c = band.center(i);
    out.push(`<line x1="${r2(c)}" x2="${r2(c)}" y1="${r2(vs.map(high[i]))}" y2="${r2(vs.map(low[i]))}" stroke="${color}" stroke-width="${r2(1.4 * fs)}"/>`);
    const y0 = vs.map(open[i]);
    const y1 = vs.map(close[i]);
    const tip = `${cat}\n${L(ctx, '시가', 'Open')} ${formatValue(open[i], o, ctx.lang)} · ${L(ctx, '고가', 'High')} ${formatValue(high[i], o, ctx.lang)} · ${L(ctx, '저가', 'Low')} ${formatValue(low[i], o, ctx.lang)} · ${L(ctx, '종가', 'Close')} ${formatValue(close[i], o, ctx.lang)}`;
    if (o.ohlcBars) {
      out.push(`<line x1="${r2(c - w / 2)}" x2="${r2(c)}" y1="${r2(y0)}" y2="${r2(y0)}" stroke="${color}" stroke-width="${r2(1.6 * fs)}"/><line x1="${r2(c)}" x2="${r2(c + w / 2)}" y1="${r2(y1)}" y2="${r2(y1)}" stroke="${color}" stroke-width="${r2(1.6 * fs)}"/>`);
      out.push(mark(ctx, 'rect', { x: c - w / 2, y: vs.map(high[i]), width: w, height: Math.max(1, vs.map(low[i]) - vs.map(high[i])), fill: 'transparent', class: 'hit' }, tip, 0, data.order[i]));
    } else out.push(mark(ctx, 'rect', { x: c - w / 2, y: Math.min(y0, y1), width: w, height: Math.max(1, Math.abs(y1 - y0)), fill: up ? (ctx.colors.dark ? color : lighten(color, 0.15)) : color, stroke: color, class: 'bar' }, tip, 0, data.order[i]));
  });
}

function drawScatter(ctx, plot, data) {
  const { table, chart, o, out, fs } = ctx;
  const m = chart.mapping;
  // No number column left for X (a table with a single number column): the rows in order are the X values.
  const xs = m.x == null ? data.order.map((i) => i + 1) : data.order.map((i) => numbersOf(table, m.x)[i]);
  const labels = m.label != null ? data.order.map((i) => labelsOf(table, m.label)[i]) : null;
  const series = visible(data.series);
  const ys = series.flatMap((s) => finite(s.values));
  const xv = finite(xs);
  if (!xv.length || !ys.length) { label(ctx, plot.x + plot.w / 2, plot.y + plot.h / 2, L(ctx, '점으로 찍을 숫자가 없습니다', 'No numbers to plot'), { color: ctx.colors.muted, size: 13 }); return; }
  const ax = axes(ctx, plot, { categories: [], min: Math.min(...ys), max: Math.max(...ys), forceZero: false, numericX: { min: Math.min(...xv), max: Math.max(...xv) } });
  drawAxisTitleDefaults(ctx, ax, m.x == null ? L(ctx, '행 순서', 'Row') : table.columns[m.x]?.name);
  const r = (Number(o.markerSize) || 4) * 1.3 * fs;
  if (o.quadrant) {
    const mx = xv.reduce((a, b) => a + b, 0) / xv.length;
    const my = ys.reduce((a, b) => a + b, 0) / ys.length;
    const qx = ax.xScale.map(mx);
    const qy = ax.vs.map(my);
    const tints = [ctx.colors.dark ? '#14532d' : '#dcfce7', ctx.colors.dark ? '#1e3a8a' : '#dbeafe', ctx.colors.dark ? '#7c2d12' : '#ffedd5', ctx.colors.dark ? '#4c1d95' : '#ede9fe'];
    out.push(`<rect x="${r2(qx)}" y="${r2(ax.top)}" width="${r2(ax.right - qx)}" height="${r2(qy - ax.top)}" fill="${tints[0]}" opacity="0.5"/><rect x="${r2(ax.left)}" y="${r2(ax.top)}" width="${r2(qx - ax.left)}" height="${r2(qy - ax.top)}" fill="${tints[1]}" opacity="0.5"/><rect x="${r2(ax.left)}" y="${r2(qy)}" width="${r2(qx - ax.left)}" height="${r2(ax.bottom - qy)}" fill="${tints[2]}" opacity="0.5"/><rect x="${r2(qx)}" y="${r2(qy)}" width="${r2(ax.right - qx)}" height="${r2(ax.bottom - qy)}" fill="${tints[3]}" opacity="0.5"/>`);
    out.push(`<line class="quadrant" x1="${r2(qx)}" x2="${r2(qx)}" y1="${r2(ax.top)}" y2="${r2(ax.bottom)}" stroke="${ctx.colors.axis}" stroke-dasharray="5 4"/><line class="quadrant" x1="${r2(ax.left)}" x2="${r2(ax.right)}" y1="${r2(qy)}" y2="${r2(qy)}" stroke="${ctx.colors.axis}" stroke-dasharray="5 4"/>`);
  }
  for (const s of series) {
    if (o.connect) {
      const pts = s.values.map((y, i) => (y == null || xs[i] == null ? null : [ax.xScale.map(xs[i]), ax.vs.map(y)])).filter(Boolean);
      if (pts.length > 1) out.push(`<path class="connect" d="${linePath(pts, 'line')}" fill="none" stroke="${s.color}" stroke-width="${r2(1.8 * fs)}" stroke-opacity="0.7"/>`);
    }
    s.values.forEach((y, i) => {
      if (y == null || xs[i] == null) return;
      const cx = ax.xScale.map(xs[i]);
      const cy = ax.vs.map(y);
      const name = labels ? labels[i] : '';
      out.push(mark(ctx, 'circle', { cx, cy, r, fill: s.color, 'fill-opacity': 0.78, stroke: darken(s.color, 0.2), 'stroke-width': 1 * fs, class: 'dot' }, `${s.name}${name ? ` · ${name}` : ''}: (${formatValue(xs[i], o, ctx.lang)}, ${formatValue(y, o, ctx.lang)})`, s.index, data.order[i]));
      if (o.dataLabels && name) label(ctx, cx + r + 3 * fs, cy + 4 * fs, name, { anchor: 'start', size: 10 });
    });
    if (o.trendline) {
      const pts = s.values.map((y, i) => (y == null || xs[i] == null ? null : [xs[i], y])).filter(Boolean);
      trend(ctx, s, pts, (x) => ax.xScale.map(x), (v) => ax.vs.map(v), [Math.min(...xv), Math.max(...xv)]);
    }
  }
}

/** Scatter-like charts name their X axis after the X column unless the user wrote a title. */
function drawAxisTitleDefaults(ctx, ax, xName) {
  if (!ctx.o.xTitle && xName) drawAxisTitle(ctx, xName, (ax.left + ax.right) / 2, ax.bottom + 30 * ctx.fs);
}

function drawBubble(ctx, plot, data) {
  const { table, chart, o, out, fs } = ctx;
  const m = chart.mapping;
  const col = (c) => (c == null ? data.order.map(() => null) : data.order.map((i) => numbersOf(table, c)[i]));
  const xs = col(m.x);
  const ys = col(m.y);
  const ss = col(m.size);
  const labels = m.label != null ? data.order.map((i) => labelsOf(table, m.label)[i]) : null;
  const groups = m.group != null ? data.order.map((i) => labelsOf(table, m.group)[i]) : null;
  const groupNames = groups ? [...new Set(groups)] : [];
  const hidden = new Set(o.hidden.map(Number));
  const xv = finite(xs);
  const yv = finite(ys);
  if (!xv.length || !yv.length) { label(ctx, plot.x + plot.w / 2, plot.y + plot.h / 2, L(ctx, 'X·Y·크기 열을 고르세요', 'Choose X, Y and size columns'), { color: ctx.colors.muted, size: 13 }); return; }
  const pad = (a, b) => { const d = (b - a) * 0.08 || 1; return [a - d, b + d]; };
  const [x0, x1] = pad(Math.min(...xv), Math.max(...xv));
  const [y0, y1] = pad(Math.min(...yv), Math.max(...yv));
  const ax = axes(ctx, plot, { categories: [], min: y0, max: y1, forceZero: false, numericX: { min: x0, max: x1 } });
  drawAxisTitleDefaults(ctx, ax, table.columns[m.x]?.name);
  const smax = Math.max(1e-9, ...finite(ss).map(Math.abs));
  const rmax = Math.min(ax.right - ax.left, ax.bottom - ax.top) * 0.09;
  const items = xs.map((x, i) => ({ i, x, y: ys[i], s: ss[i] ?? smax * 0.3 })).filter((p) => p.x != null && p.y != null).sort((a, b) => Math.abs(b.s) - Math.abs(a.s));
  for (const p of items) {
    const g = groups ? groupNames.indexOf(groups[p.i]) : 0;
    if (groups && hidden.has(g)) continue;
    const color = seriesColor(o, g);
    const r = Math.max(2.5 * fs, Math.sqrt(Math.abs(p.s) / smax) * rmax);
    const cx = ax.xScale.map(p.x);
    const cy = ax.vs.map(p.y);
    const name = labels?.[p.i] ?? '';
    out.push(mark(ctx, 'circle', { cx, cy, r, fill: color, 'fill-opacity': 0.6, stroke: darken(color, 0.15), 'stroke-width': 1.2 * fs, class: 'dot' }, `${name ? `${name} · ` : ''}X ${formatValue(p.x, o, ctx.lang)}, Y ${formatValue(p.y, o, ctx.lang)}, ${table.columns[m.size]?.name ?? 'size'} ${formatValue(p.s, o, ctx.lang)}`, g, data.order[p.i]));
    if (o.dataLabels && name) label(ctx, cx, cy + 4 * fs, fitText(name, r * 2.2, 10 * fs), { size: 10, color: r > 14 * fs ? readableOn(color) : null });
  }
}

function drawHistogram(ctx, plot, data) {
  const { o, out, fs } = ctx;
  const series = visible(data.series);
  const all = series.flatMap((s) => finite(s.values));
  if (!all.length) { label(ctx, plot.x + plot.w / 2, plot.y + plot.h / 2, L(ctx, '숫자가 없습니다', 'No numbers'), { color: ctx.colors.muted, size: 13 }); return; }
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const count = Number(o.bins) > 0 ? Math.min(200, Number(o.bins)) : Math.max(4, Math.min(40, Math.ceil(Math.log2(all.length) + 1)));
  const t = niceTicks(lo, hi, count);
  const width = t.step;
  const edges = [];
  for (let v = t.min; v < t.max + width / 2; v += width) edges.push(Number(v.toPrecision(12)));
  if (edges.length < 2) edges.push(edges[0] + 1);
  const bins = edges.slice(0, -1);
  const counts = series.map((s) => bins.map((b, k) => finite(s.values).filter((v) => v >= b && (k === bins.length - 1 ? v <= edges[k + 1] : v < edges[k + 1])).length));
  // Cumulative histogram: each bar counts every value up to the end of its bin.
  if (o.cumulativeBins) for (const list of counts) for (let k = 1; k < list.length; k++) list[k] += list[k - 1];
  const cats = bins.map((b, k) => `${formatValue(b, o, ctx.lang)}–${formatValue(edges[k + 1], o, ctx.lang)}`);
  const ax = axes(ctx, plot, { categories: cats, min: 0, max: Math.max(1, ...counts.flat()) });
  const { band, vs } = ax;
  const inner = band.step * 0.98;
  if (o.polygon) {
    series.forEach((s, k) => {
      const pts = counts[k].map((c, i) => [band.center(i), vs.map(c)]);
      out.push(`<path class="mark line" data-s="${s.index}" data-r="" data-tip="${esc(s.name)}" d="${linePath(pts, 'line')}" fill="none" stroke="${s.color}" stroke-width="${r2(2.5 * fs)}"/>`);
      ctx.marks++;
      pts.forEach((p, i) => out.push(mark(ctx, 'circle', { cx: p[0], cy: p[1], r: 4 * fs, fill: s.color, class: 'dot' }, `${series.length > 1 ? `${s.name} · ` : ''}${cats[i]}: ${counts[k][i]}`, s.index, '')));
    });
    if (!o.yTitle) drawAxisTitle(ctx, L(ctx, '개수', 'Count'), plot.x + 8 * fs, (ax.top + ax.bottom) / 2, -90);
    return;
  }
  series.forEach((s, k) => {
    const bw = inner / series.length;
    counts[k].forEach((c, i) => {
      const x = band.from + band.step * i + (band.step - inner) / 2 + k * bw;
      const y = vs.map(c);
      out.push(mark(ctx, 'rect', { x, y, width: Math.max(1, bw - 0.5), height: Math.max(0, vs.map(0) - y), fill: s.color, 'fill-opacity': 0.9, class: 'bar' }, `${series.length > 1 ? `${s.name} · ` : ''}${cats[i]}: ${c}`, s.index, ''));
      if (o.dataLabels && c) label(ctx, x + bw / 2, y - 4 * fs, String(c), { size: 10 });
    });
  });
  if (!o.yTitle) drawAxisTitle(ctx, L(ctx, '개수', 'Count'), plot.x + 8 * fs, (ax.top + ax.bottom) / 2, -90);
}

function drawBoxplot(ctx, plot, data) {
  const { o, out, fs } = ctx;
  const series = visible(data.series);
  const stats = series.map((s) => {
    const v = finite(s.values).sort((a, b) => a - b);
    if (!v.length) return null;
    const q1 = quantile(v, 0.25);
    const q3 = quantile(v, 0.75);
    const iqr = q3 - q1;
    const lo = v.find((x) => x >= q1 - 1.5 * iqr) ?? v[0];
    const hi = [...v].reverse().find((x) => x <= q3 + 1.5 * iqr) ?? v[v.length - 1];
    return { s, q1, q3, med: quantile(v, 0.5), lo, hi, mean: v.reduce((a, b) => a + b, 0) / v.length, outliers: v.filter((x) => x < lo || x > hi), n: v.length };
  });
  const all = stats.filter(Boolean).flatMap((x) => [x.lo, x.hi, ...x.outliers]);
  if (!all.length) { label(ctx, plot.x + plot.w / 2, plot.y + plot.h / 2, L(ctx, '숫자가 없습니다', 'No numbers'), { color: ctx.colors.muted, size: 13 }); return; }
  const ax = axes(ctx, plot, { categories: series.map((s) => s.name), min: Math.min(...all), max: Math.max(...all), forceZero: false });
  const { band, vs } = ax;
  stats.forEach((st, i) => {
    if (!st) return;
    const c = band.center(i);
    const w = Math.min(band.step * 0.5, 90 * fs);
    const color = st.s.color;
    out.push(`<line x1="${r2(c)}" x2="${r2(c)}" y1="${r2(vs.map(st.lo))}" y2="${r2(vs.map(st.hi))}" stroke="${darken(color, 0.25)}" stroke-width="${r2(1.4 * fs)}"/>`);
    for (const v of [st.lo, st.hi]) out.push(`<line x1="${r2(c - w / 4)}" x2="${r2(c + w / 4)}" y1="${r2(vs.map(v))}" y2="${r2(vs.map(v))}" stroke="${darken(color, 0.25)}" stroke-width="${r2(1.4 * fs)}"/>`);
    const tip = `${st.s.name} (n=${st.n})\n${L(ctx, '최소', 'Min')} ${formatValue(st.lo, o, ctx.lang)} · Q1 ${formatValue(st.q1, o, ctx.lang)} · ${L(ctx, '중앙값', 'Median')} ${formatValue(st.med, o, ctx.lang)} · Q3 ${formatValue(st.q3, o, ctx.lang)} · ${L(ctx, '최대', 'Max')} ${formatValue(st.hi, o, ctx.lang)}`;
    out.push(mark(ctx, 'rect', { x: c - w / 2, y: vs.map(st.q3), width: w, height: Math.max(1, vs.map(st.q1) - vs.map(st.q3)), rx: 3 * fs, fill: lighten(color, 0.35), stroke: darken(color, 0.2), 'stroke-width': 1.4 * fs, class: 'bar' }, tip, st.s.index, ''));
    out.push(`<line x1="${r2(c - w / 2)}" x2="${r2(c + w / 2)}" y1="${r2(vs.map(st.med))}" y2="${r2(vs.map(st.med))}" stroke="${darken(color, 0.4)}" stroke-width="${r2(2.4 * fs)}"/>`);
    out.push(`<path d="M${r2(c)},${r2(vs.map(st.mean) - 4 * fs)}l${r2(4 * fs)},${r2(4 * fs)}l${r2(-4 * fs)},${r2(4 * fs)}l${r2(-4 * fs)},${r2(-4 * fs)}Z" fill="${darken(color, 0.4)}"/>`);
    for (const v of st.outliers) out.push(mark(ctx, 'circle', { cx: c, cy: vs.map(v), r: 3 * fs, fill: 'none', stroke: color, 'stroke-width': 1.4 * fs, class: 'dot' }, `${st.s.name}: ${formatValue(v, o, ctx.lang)}`, st.s.index, ''));
    if (o.dataLabels) label(ctx, c + w / 2 + 4 * fs, vs.map(st.med) + 4 * fs, formatValue(st.med, o, ctx.lang), { anchor: 'start', size: 10 });
  });
}

// ───────────────────────── radial charts

function pieSlices(ctx, data) {
  const s = data.series[0];
  const hidden = new Set(ctx.o.hidden.map(Number));
  return data.categories.map((name, i) => ({ name, value: s.values[i], i, color: seriesColor(ctx.o, i), hidden: hidden.has(i) })).filter((x) => x.value != null && x.value > 0 && !x.hidden);
}

function drawPie(ctx, plot, data) {
  const { chart, o, out, fs } = ctx;
  const half = chart.type === 'halfDonut';
  const slices = pieSlices(ctx, data);
  const total = slices.reduce((a, x) => a + x.value, 0);
  if (!total) { label(ctx, plot.x + plot.w / 2, plot.y + plot.h / 2, L(ctx, '양수 값이 없습니다', 'No positive values'), { color: ctx.colors.muted, size: 13 }); return; }
  const outsideLabels = o.dataLabels && o.labelPosition !== 'inside';
  const room = outsideLabels ? 70 * fs : 10 * fs;
  const cx = plot.x + plot.w / 2;
  const r = half ? Math.max(20, Math.min(plot.w / 2 - room, plot.h - room * 0.6 - 10 * fs)) : Math.max(20, Math.min(plot.w, plot.h) / 2 - room * 0.75);
  const cy = half ? plot.y + plot.h - 20 * fs - (plot.h - r - room * 0.6) / 2 : plot.y + plot.h / 2;
  const inner = chart.type === 'pie' ? 0 : r * Math.max(0, Math.min(0.9, Number.isFinite(Number(o.innerRadius)) ? Number(o.innerRadius) : 0.58));
  const explode = Math.max(0, Number(o.explode) || 0) * r;
  const span = half ? Math.PI : Math.PI * 2;
  let a = half ? -Math.PI / 2 : ((Number(o.startAngle) || 0) * Math.PI) / 180;
  const gap = Math.max(0, Number(o.sliceGap) || 0);
  for (const sl of slices) {
    const da = (sl.value / total) * span;
    const pct = sl.value / total;
    const tip = `${sl.name}: ${formatValue(sl.value, o, ctx.lang)} (${formatValue(pct, o, ctx.lang, { percent: true })})`;
    const [ex, ey] = explode ? polar(0, 0, explode, a + da / 2) : [0, 0];
    out.push(mark(ctx, 'path', { d: arcPath(cx + ex, cy + ey, inner, r, a, a + da), fill: sl.color, stroke: gap ? (ctx.colors.bg === 'none' ? '#ffffff' : ctx.colors.bg) : 'none', 'stroke-width': gap * 1.5 * fs, class: 'slice' }, tip, 0, data.order[sl.i]));
    if (o.dataLabels && pct >= 0.02) {
      const mid = a + da / 2;
      const text = o.numberFormat === 'percent' || o.labelPosition === 'percent' || o.numberFormat === 'auto' ? formatValue(pct, o, ctx.lang, { percent: true }) : formatValue(sl.value, o, ctx.lang);
      if (outsideLabels) {
        const [x1, y1] = polar(cx, cy, r + 4 * fs, mid);
        const [x2, y2] = polar(cx, cy, r + 16 * fs, mid);
        const right = Math.sin(mid) >= 0;
        out.push(`<polyline points="${r2(x1)},${r2(y1)} ${r2(x2)},${r2(y2)} ${r2(x2 + (right ? 8 : -8) * fs)},${r2(y2)}" fill="none" stroke="${ctx.colors.axis}"/>`);
        label(ctx, x2 + (right ? 11 : -11) * fs, y2 - 1 * fs, fitText(sl.name, 110 * fs, 10.5 * fs), { anchor: right ? 'start' : 'end', size: 10.5, weight: 600 });
        label(ctx, x2 + (right ? 11 : -11) * fs, y2 + 11 * fs, text, { anchor: right ? 'start' : 'end', size: 10, color: ctx.colors.muted });
      } else {
        const [x, y] = polar(cx, cy, inner ? (inner + r) / 2 : r * 0.62, mid);
        label(ctx, x, y + 4 * fs, text, { color: readableOn(sl.color), size: 11, weight: 700 });
      }
    }
    a += da;
  }
  if (inner > 30 * fs) {
    label(ctx, cx, cy - (half ? 22 : 4) * fs, formatValue(total, o, ctx.lang), { size: Math.min(26, inner / fs / 3.2), weight: 700 });
    label(ctx, cx, cy + (half ? -2 : 16) * fs, L(ctx, '합계', 'Total'), { size: 11, color: ctx.colors.muted });
  }
}

function drawPolarArea(ctx, plot, data) {
  const { o, out, fs } = ctx;
  const slices = pieSlices(ctx, data);
  const max = Math.max(1e-9, ...slices.map((x) => x.value));
  const cx = plot.x + plot.w / 2;
  const cy = plot.y + plot.h / 2;
  const R = Math.max(20, Math.min(plot.w, plot.h) / 2 - 24 * fs);
  const t = niceTicks(0, max, 4);
  for (const v of t.ticks.slice(1)) {
    const rr = Math.sqrt(v / t.max) * R;
    out.push(`<circle cx="${r2(cx)}" cy="${r2(cy)}" r="${r2(rr)}" fill="none" stroke="${ctx.colors.grid}"/>`);
    label(ctx, cx + 3 * fs, cy - rr - 2 * fs, formatValue(v, o, ctx.lang, { tick: true }), { anchor: 'start', size: 9.5, color: ctx.colors.muted });
  }
  const n = data.categories.length;
  const da = (Math.PI * 2) / Math.max(1, n);
  slices.forEach((sl) => {
    const a = ((Number(o.startAngle) || 0) * Math.PI) / 180 + sl.i * da;
    const rr = Math.sqrt(sl.value / t.max) * R;
    out.push(mark(ctx, 'path', { d: arcPath(cx, cy, 0, rr, a, a + da), fill: sl.color, 'fill-opacity': 0.82, stroke: ctx.colors.bg === 'none' ? '#fff' : ctx.colors.bg, 'stroke-width': 1.5 * fs, class: 'slice' }, `${sl.name}: ${formatValue(sl.value, o, ctx.lang)}`, 0, data.order[sl.i]));
    const [lx, ly] = polar(cx, cy, R + 12 * fs, a + da / 2);
    label(ctx, lx, ly + 4 * fs, fitText(sl.name, 90 * fs, 10.5 * fs), { size: 10.5, anchor: Math.abs(Math.sin(a + da / 2)) < 0.2 ? 'middle' : Math.sin(a + da / 2) > 0 ? 'start' : 'end' });
    if (o.dataLabels) { const [x, y] = polar(cx, cy, rr * 0.65, a + da / 2); label(ctx, x, y + 4 * fs, formatValue(sl.value, o, ctx.lang), { size: 10, color: readableOn(sl.color) }); }
  });
}

function drawRadar(ctx, plot, data) {
  const { o, out, fs } = ctx;
  // Fewer than three categories: with three or more series, the series are the axes; otherwise blank axes make three.
  if (data.categories.length < 3) {
    const shown = visible(data.series);
    if (shown.length >= 3) data = { categories: shown.map((x) => x.name), order: shown.map(() => ''), legend: data.legend, series: data.categories.map((c, i) => ({ index: i, column: null, name: c || String(i + 1), color: seriesColor(o, i), hidden: false, values: shown.map((x) => x.values[i]) })) };
    else data = { ...data, categories: [...data.categories, '', '', ''].slice(0, 3), order: [...data.order, '', '', ''].slice(0, 3), series: data.series.map((x) => ({ ...x, values: [...x.values, null, null, null].slice(0, 3) })) };
  }
  const series = visible(data.series);
  const n = data.categories.length;
  if (n < 3) { label(ctx, plot.x + plot.w / 2, plot.y + plot.h / 2, L(ctx, '방사형 차트는 항목이 3개 이상 필요합니다', 'A radar chart needs at least three categories'), { color: ctx.colors.muted, size: 13 }); return; }
  const all = series.flatMap((s) => finite(s.values));
  const t = niceTicks(Math.min(0, ...all), Math.max(1e-9, ...all), 4);
  const lo = parseNumber(o.yMin) ?? t.min;
  const hi = parseNumber(o.yMax) ?? t.max;
  const cx = plot.x + plot.w / 2;
  const cy = plot.y + plot.h / 2 + 4 * fs;
  const R = Math.max(20, Math.min(plot.w / 2 - 70 * fs, plot.h / 2 - 22 * fs));
  const at = (i, v) => polar(cx, cy, ((v - lo) / (hi - lo || 1)) * R, (i / n) * Math.PI * 2);
  for (const v of t.ticks) {
    if (v < lo || v > hi) continue;
    const pts = data.categories.map((_, i) => at(i, v));
    out.push(`<polygon class="grid" points="${pts.map((p) => `${r2(p[0])},${r2(p[1])}`).join(' ')}" fill="none" stroke="${ctx.colors.grid}"/>`);
    label(ctx, cx + 3 * fs, at(0, v)[1] - 2 * fs, formatValue(v, o, ctx.lang, { tick: true }), { anchor: 'start', size: 9.5, color: ctx.colors.muted });
  }
  data.categories.forEach((name, i) => {
    const [x, y] = at(i, hi);
    out.push(`<line class="grid" x1="${r2(cx)}" y1="${r2(cy)}" x2="${r2(x)}" y2="${r2(y)}" stroke="${ctx.colors.grid}"/>`);
    const a = (i / n) * Math.PI * 2;
    const [lx, ly] = polar(cx, cy, R + 12 * fs, a);
    label(ctx, lx, ly + 4 * fs, fitText(name, 110 * fs, 11 * fs), { size: 11, anchor: Math.abs(Math.sin(a)) < 0.2 ? 'middle' : Math.sin(a) > 0 ? 'start' : 'end' });
  });
  for (const s of series) {
    const pts = s.values.map((v, i) => at(i, v ?? lo));
    out.push(mark(ctx, 'polygon', { points: pts.map((p) => `${r2(p[0])},${r2(p[1])}`).join(' '), fill: s.color, 'fill-opacity': Math.min(0.6, Number(o.areaOpacity) || 0.25), stroke: s.color, 'stroke-width': (Number(o.lineWidth) || 2) * fs, 'stroke-linejoin': 'round', class: 'area' }, s.name, s.index, ''));
    pts.forEach((p, i) => {
      if (o.markers || (s.values[i] != null && s.values.filter((v) => v != null).length < 3)) out.push(mark(ctx, 'circle', { cx: p[0], cy: p[1], r: (Number(o.markerSize) || 4) * 0.9 * fs, fill: s.color, class: 'dot' }, tipOf(ctx, s.name, data.categories[i], s.values[i]), s.index, data.order[i]));
      if (o.dataLabels) label(ctx, p[0], p[1] - 7 * fs, formatValue(s.values[i], o, ctx.lang), { size: 10 });
    });
  }
}

function drawGauge(ctx, plot, data) {
  const { o, out, fs } = ctx;
  const s = data.series[0];
  const i = s.values.findIndex((v) => v != null);
  const value = i >= 0 ? s.values[i] : 0;
  const name = i >= 0 ? data.categories[i] : s.name;
  const min = parseNumber(o.gaugeMin) ?? parseNumber(o.yMin) ?? 0;
  const maxGuess = niceTicks(min, Math.max(value, ...finite(s.values)), 4).max;
  const max = parseNumber(o.gaugeMax) ?? parseNumber(o.yMax) ?? maxGuess;
  const cx = plot.x + plot.w / 2;
  const R = Math.max(30, Math.min(plot.w / 2 - 30 * fs, plot.h - 60 * fs));
  const cy = plot.y + (plot.h + R) / 2 - 6 * fs;
  const inner = R * 0.72;
  const t = Math.max(0, Math.min(1, (value - min) / (max - min || 1)));
  const a0 = -Math.PI / 2;
  // Bands: three zones from the palette's first colours (or green / amber / red).
  const zones = o.solid ? [[0, 1, ctx.colors.dark ? '#ffffff' : '#94a3b8']] : [[0, 0.6, o.upColor], [0.6, 0.85, '#f59e0b'], [0.85, 1, o.downColor]];
  for (const [z0, z1, color] of zones) out.push(`<path d="${arcPath(cx, cy, inner, R, a0 + z0 * Math.PI, a0 + z1 * Math.PI)}" fill="${color}" fill-opacity="0.18"/>`);
  out.push(mark(ctx, 'path', { d: arcPath(cx, cy, inner, R, a0, a0 + Math.max(0.002, t) * Math.PI), fill: seriesColor(o, 0), class: 'slice' }, `${name}: ${formatValue(value, o, ctx.lang)} (${formatValue(min, o, ctx.lang)}–${formatValue(max, o, ctx.lang)})`, 0, data.order[i] ?? ''));
  for (const v of niceTicks(min, max, 5).ticks.filter((x) => x >= min && x <= max)) {
    const a = a0 + ((v - min) / (max - min || 1)) * Math.PI;
    const [x1, y1] = polar(cx, cy, R + 2 * fs, a);
    const [x2, y2] = polar(cx, cy, R + 8 * fs, a);
    out.push(`<line x1="${r2(x1)}" y1="${r2(y1)}" x2="${r2(x2)}" y2="${r2(y2)}" stroke="${ctx.colors.axis}"/>`);
    const [lx, ly] = polar(cx, cy, R + 20 * fs, a);
    label(ctx, lx, ly + 4 * fs, formatValue(v, o, ctx.lang, { tick: true }), { size: 10, color: ctx.colors.muted });
  }
  const [nx, ny] = polar(cx, cy, R * 0.92, a0 + t * Math.PI);
  if (!o.solid) out.push(`<line class="needle" x1="${r2(cx)}" y1="${r2(cy)}" x2="${r2(nx)}" y2="${r2(ny)}" stroke="${ctx.colors.text}" stroke-width="${r2(3 * fs)}" stroke-linecap="round"/><circle cx="${r2(cx)}" cy="${r2(cy)}" r="${r2(7 * fs)}" fill="${ctx.colors.text}"/>`);
  label(ctx, cx, cy - inner * 0.35, formatValue(value, o, ctx.lang), { size: Math.max(14, Math.min(44, inner / fs / 3)), weight: 800 });
  label(ctx, cx, cy + 24 * fs, name, { size: 13, color: ctx.colors.muted, weight: 600 });
}

function drawFunnel(ctx, plot, data) {
  const { o, out, fs } = ctx;
  const slices = pieSlices(ctx, data);
  if (!slices.length) { label(ctx, plot.x + plot.w / 2, plot.y + plot.h / 2, L(ctx, '양수 값이 없습니다', 'No positive values'), { color: ctx.colors.muted, size: 13 }); return; }
  const max = Math.max(...slices.map((x) => x.value));
  const labelW = Math.min(plot.w * 0.3, Math.max(...slices.map((x) => textWidth(x.name, 12 * fs))) + 16 * fs);
  const area = { x: plot.x + labelW, w: plot.w - labelW * 2, y: plot.y + 4 * fs, h: plot.h - 8 * fs };
  const step = area.h / slices.length;
  const cx = area.x + area.w / 2;
  const first = slices[0].value;
  const total = slices.reduce((a, x) => a + x.value, 0);
  let acc = 0;
  slices.forEach((sl, k) => {
    let w0 = (sl.value / max) * area.w;
    let w1 = ((slices[k + 1]?.value ?? sl.value * 0.85) / max) * area.w;
    if (o.pyramid) { w0 = (acc / total) * area.w; acc += sl.value; w1 = (acc / total) * area.w; }
    const y = area.y + k * step;
    const h = step - 3 * fs;
    const bottomW = o.pyramid ? w1 : Math.max(w1, w0 * 0.3);
    const d = `M${r2(cx - w0 / 2)},${r2(y)}L${r2(cx + w0 / 2)},${r2(y)}L${r2(cx + bottomW / 2)},${r2(y + h)}L${r2(cx - bottomW / 2)},${r2(y + h)}Z`;
    out.push(mark(ctx, 'path', { d, fill: sl.color, class: 'slice' }, `${sl.name}: ${formatValue(sl.value, o, ctx.lang)} (${formatValue(sl.value / first, o, ctx.lang, { percent: true })})`, 0, data.order[sl.i]));
    label(ctx, cx, y + h / 2 + 4 * fs, formatValue(sl.value, o, ctx.lang), { color: readableOn(sl.color), size: 11.5, weight: 700 });
    label(ctx, area.x - 10 * fs, y + h / 2 + 4 * fs, fitText(sl.name, labelW - 14 * fs, 12 * fs), { anchor: 'end', size: 12 });
    label(ctx, area.x + area.w + 10 * fs, y + h / 2 + 4 * fs, formatValue(sl.value / (o.pyramid ? total : first), o, ctx.lang, { percent: true }), { anchor: 'start', size: 11, color: ctx.colors.muted });
  });
}

/** Rows grouped for the hierarchy charts: [{ name, value, children: [{ name, value, row }] }]. */
function hierarchy(ctx, data) {
  const { table, chart } = ctx;
  const m = chart.mapping;
  const s = data.series[0];
  const groups = m.group != null ? data.order.map((i) => labelsOf(table, m.group)[i]) : null;
  const map = new Map();
  data.categories.forEach((name, i) => {
    const v = s.values[i];
    if (v == null || v <= 0) return;
    const g = groups ? groups[i] || '—' : '';
    if (!map.has(g)) map.set(g, { name: g, value: 0, children: [] });
    const node = map.get(g);
    node.value += v;
    node.children.push({ name, value: v, row: data.order[i] });
  });
  return [...map.values()];
}

function drawTreemap(ctx, plot, data) {
  const { o, out, fs } = ctx;
  const groups = hierarchy(ctx, data);
  if (!groups.length) { label(ctx, plot.x + plot.w / 2, plot.y + plot.h / 2, L(ctx, '양수 값이 없습니다', 'No positive values'), { color: ctx.colors.muted, size: 13 }); return; }
  const total = groups.reduce((a, g) => a + g.value, 0);
  const grouped = groups.length > 1 || groups[0].name;
  const outer = squarify(groups, plot.x, plot.y, plot.w, plot.h);
  outer.forEach((cell, gi) => {
    const g = cell.item;
    const head = grouped && cell.h > 40 * fs ? 18 * fs : 0;
    const groupColor = seriesColor(o, gi);
    if (grouped) out.push(`<rect x="${r2(cell.x + 1)}" y="${r2(cell.y + 1)}" width="${r2(Math.max(0, cell.w - 2))}" height="${r2(Math.max(0, cell.h - 2))}" fill="${darken(groupColor, 0.15)}"/>`);
    if (head) label(ctx, cell.x + 6 * fs, cell.y + 13 * fs, fitText(`${g.name} · ${formatValue(g.value, o, ctx.lang)}`, cell.w - 10 * fs, 11.5 * fs), { anchor: 'start', size: 11.5, weight: 700, color: readableOn(darken(groupColor, 0.15)) });
    const inner = squarify(g.children, cell.x + 2, cell.y + 2 + head, cell.w - 4, cell.h - 4 - head);
    inner.forEach((c, k) => {
      const color = grouped ? mix(groupColor, k % 2 ? '#ffffff' : groupColor, 0.12 + (k % 3) * 0.06) : seriesColor(o, k);
      out.push(mark(ctx, 'rect', { x: c.x + 1, y: c.y + 1, width: Math.max(0, c.w - 2), height: Math.max(0, c.h - 2), rx: 2 * fs, fill: color, class: 'slice' }, `${grouped ? `${g.name} › ` : ''}${c.item.name}: ${formatValue(c.item.value, o, ctx.lang)} (${formatValue(c.item.value / total, o, ctx.lang, { percent: true })})`, 0, c.item.row));
      if (c.w > 34 * fs && c.h > 20 * fs) {
        const size = Math.max(9, Math.min(16, Math.sqrt(c.w * c.h) / 9 / fs));
        label(ctx, c.x + 6 * fs, c.y + size * fs + 4 * fs, fitText(c.item.name, c.w - 10 * fs, size * fs), { anchor: 'start', size, weight: 600, color: readableOn(color) });
        if (c.h > (size * 2 + 10) * fs) label(ctx, c.x + 6 * fs, c.y + size * 2 * fs + 7 * fs, formatValue(c.item.value, o, ctx.lang), { anchor: 'start', size: size * 0.85, color: readableOn(color) });
      }
    });
  });
}

function drawSunburst(ctx, plot, data) {
  const { o, out, fs } = ctx;
  const groups = hierarchy(ctx, data);
  const total = groups.reduce((a, g) => a + g.value, 0);
  if (!total) { label(ctx, plot.x + plot.w / 2, plot.y + plot.h / 2, L(ctx, '양수 값이 없습니다', 'No positive values'), { color: ctx.colors.muted, size: 13 }); return; }
  const cx = plot.x + plot.w / 2;
  const cy = plot.y + plot.h / 2;
  const R = Math.max(30, Math.min(plot.w, plot.h) / 2 - 8 * fs);
  const grouped = groups.length > 1 || groups[0].name;
  const r0 = R * 0.22;
  const r1 = grouped ? R * 0.58 : r0;
  const stroke = ctx.colors.bg === 'none' ? '#ffffff' : ctx.colors.bg;
  let a = ((Number(o.startAngle) || 0) * Math.PI) / 180;
  groups.forEach((g, gi) => {
    const da = (g.value / total) * Math.PI * 2;
    const color = seriesColor(o, gi);
    if (grouped) {
      out.push(mark(ctx, 'path', { d: arcPath(cx, cy, r0, r1, a, a + da), fill: color, stroke, 'stroke-width': 1.5 * fs, class: 'slice' }, `${g.name}: ${formatValue(g.value, o, ctx.lang)} (${formatValue(g.value / total, o, ctx.lang, { percent: true })})`, 0, ''));
      if (da * (r0 + r1) / 2 > 40 * fs) { const [x, y] = polar(cx, cy, (r0 + r1) / 2, a + da / 2); label(ctx, x, y + 4 * fs, fitText(g.name, (r1 - r0) * 1.6, 11 * fs), { size: 11, weight: 700, color: readableOn(color) }); }
    }
    let b = a;
    g.children.forEach((c, k) => {
      const db = (c.value / total) * Math.PI * 2;
      const shade = grouped ? lighten(color, 0.18 + (k % 4) * 0.1) : seriesColor(o, k);
      out.push(mark(ctx, 'path', { d: arcPath(cx, cy, r1, R, b, b + db), fill: shade, stroke, 'stroke-width': 1.5 * fs, class: 'slice' }, `${grouped ? `${g.name} › ` : ''}${c.name}: ${formatValue(c.value, o, ctx.lang)}`, 0, c.row));
      if (db * (r1 + R) / 2 > 34 * fs) { const [x, y] = polar(cx, cy, (r1 + R) / 2, b + db / 2); label(ctx, x, y + 4 * fs, fitText(c.name, (R - r1) * 1.3, 10 * fs), { size: 10, color: readableOn(shade) }); }
      b += db;
    });
    a += da;
  });
  label(ctx, cx, cy + 2 * fs, formatValue(total, o, ctx.lang), { size: Math.min(20, r0 / fs / 2.4), weight: 800 });
  label(ctx, cx, cy + 16 * fs, L(ctx, '합계', 'Total'), { size: 10, color: ctx.colors.muted });
}

function drawHeatmap(ctx, plot, data) {
  const { o, out, fs } = ctx;
  const series = visible(data.series);
  const all = series.flatMap((s) => finite(s.values));
  if (!all.length) { label(ctx, plot.x + plot.w / 2, plot.y + plot.h / 2, L(ctx, '숫자가 없습니다', 'No numbers'), { color: ctx.colors.muted, size: 13 }); return; }
  const lo = parseNumber(o.yMin) ?? Math.min(...all);
  const hi = parseNumber(o.yMax) ?? Math.max(...all);
  const size = 11 * fs;
  const leftW = Math.min(plot.w * 0.3, Math.max(...data.categories.map((c) => textWidth(c, size))) + 12 * fs);
  const topH = Math.min(120 * fs, Math.max(...series.map((s) => textWidth(s.name, size))) * (series.length > 6 ? 0.75 : 0) + size + 12 * fs);
  const scaleH = 26 * fs;
  const x0 = plot.x + leftW;
  const y0 = plot.y + topH;
  const cw = (plot.w - leftW) / Math.max(1, series.length);
  const ch = (plot.h - topH - scaleH) / Math.max(1, data.categories.length);
  series.forEach((s, k) => {
    const x = x0 + k * cw + cw / 2;
    if (series.length > 6) out.push(`<text x="${r2(x)}" y="${r2(y0 - 6 * fs)}" font-size="${r2(size)}" fill="${ctx.colors.text}" transform="rotate(-45 ${r2(x)} ${r2(y0 - 6 * fs)})">${esc(fitText(s.name, 110 * fs, size))}</text>`);
    else label(ctx, x, y0 - 8 * fs, fitText(s.name, cw - 4, size), { size: 11, weight: 600 });
  });
  data.categories.forEach((cat, i) => {
    label(ctx, x0 - 6 * fs, y0 + i * ch + ch / 2 + 4 * fs, fitText(cat, leftW - 10 * fs, size), { anchor: 'end', size: 11 });
    series.forEach((s, k) => {
      const v = s.values[i];
      const color = v == null ? (ctx.colors.dark ? '#374151' : '#f3f4f6') : rampColor(o.ramp, (v - lo) / (hi - lo || 1));
      out.push(mark(ctx, 'rect', { x: x0 + k * cw + 1, y: y0 + i * ch + 1, width: Math.max(0, cw - 2), height: Math.max(0, ch - 2), rx: 2 * fs, fill: color, class: 'cell' }, tipOf(ctx, s.name, cat, v), s.index, data.order[i]));
      if ((o.dataLabels || (cw > 36 * fs && ch > 16 * fs && series.length * data.categories.length <= 150)) && v != null) label(ctx, x0 + k * cw + cw / 2, y0 + i * ch + ch / 2 + 4 * fs, formatValue(v, o, ctx.lang, { tick: true }), { size: Math.min(11, ch / fs * 0.55), color: readableOn(color) });
    });
  });
  // Colour scale.
  const id = `ramp-${Math.round(lo)}-${Math.round(hi)}-${o.ramp}`.replace(/[^\w-]/g, '');
  const stops = Array.from({ length: 11 }, (_, k) => `<stop offset="${k * 10}%" stop-color="${rampColor(o.ramp, k / 10)}"/>`).join('');
  ctx.defs.push(`<linearGradient id="${id}" x1="0" x2="1" y1="0" y2="0">${stops}</linearGradient>`);
  const sx = x0;
  const sw = Math.min(260 * fs, plot.w - leftW);
  const sy = plot.y + plot.h - 14 * fs;
  out.push(`<rect x="${r2(sx)}" y="${r2(sy - 8 * fs)}" width="${r2(sw)}" height="${r2(8 * fs)}" rx="${r2(3 * fs)}" fill="url(#${id})"/>`);
  label(ctx, sx, sy + 12 * fs, formatValue(lo, o, ctx.lang, { tick: true }), { anchor: 'start', size: 10, color: ctx.colors.muted });
  label(ctx, sx + sw, sy + 12 * fs, formatValue(hi, o, ctx.lang, { tick: true }), { anchor: 'end', size: 10, color: ctx.colors.muted });
}

function drawSankey(ctx, plot, data) {
  const { table, chart, o, out, fs } = ctx;
  const m = chart.mapping;
  const s = data.series[0];
  const src = data.order.map((i) => labelsOf(table, m.source)[i]);
  const dst = data.order.map((i) => labelsOf(table, m.target)[i]);
  let links = src.map((a, i) => ({ a, b: dst[i], v: s?.values[i], row: data.order[i] })).filter((l) => l.a && l.b && l.a !== l.b && l.v > 0);
  if (!links.length) links = fallbackFlows(ctx, data);
  if (!links.length) { label(ctx, plot.x + plot.w / 2, plot.y + plot.h / 2, L(ctx, '출발·도착·값 열을 고르세요', 'Choose source, target and value columns'), { color: ctx.colors.muted, size: 13 }); return; }
  const names = [...new Set(links.flatMap((l) => [l.a, l.b]))];
  const nodes = new Map(names.map((name, i) => [name, { name, i, inV: 0, outV: 0, layer: 0, ins: [], outs: [] }]));
  for (const l of links) { const a = nodes.get(l.a); const b = nodes.get(l.b); a.outV += l.v; b.inV += l.v; a.outs.push(l); b.ins.push(l); }
  // Layers: longest path from a source (cycles stop after as many rounds as there are nodes).
  for (let round = 0; round < names.length; round++) {
    let moved = false;
    for (const l of links) { const a = nodes.get(l.a); const b = nodes.get(l.b); if (b.layer < a.layer + 1 && a.layer + 1 < names.length) { b.layer = a.layer + 1; moved = true; } }
    if (!moved) break;
  }
  const layers = Math.max(...[...nodes.values()].map((n) => n.layer)) + 1;
  const nodeW = 14 * fs;
  const labelRoom = 90 * fs;
  const colX = (k) => plot.x + labelRoom * 0 + (layers === 1 ? 0 : (k / (layers - 1)) * (plot.w - nodeW - labelRoom)) + (k === layers - 1 && layers > 1 ? 0 : 0);
  const byLayer = Array.from({ length: layers }, (_, k) => [...nodes.values()].filter((n) => n.layer === k));
  const gap = 10 * fs;
  const scale = Math.min(...byLayer.map((list) => (plot.h - gap * (list.length - 1)) / Math.max(1e-9, list.reduce((a, n) => a + Math.max(n.inV, n.outV), 0))));
  byLayer.forEach((list, k) => {
    const total = list.reduce((a, n) => a + Math.max(n.inV, n.outV) * scale, 0) + gap * (list.length - 1);
    let y = plot.y + (plot.h - total) / 2;
    for (const n of list) { n.x = colX(k); n.y = y; n.h = Math.max(2, Math.max(n.inV, n.outV) * scale); n.oy = n.y; n.iy = n.y; y += n.h + gap; }
  });
  links.sort((p, q) => nodes.get(p.b).y - nodes.get(q.b).y);
  for (const l of links) {
    const a = nodes.get(l.a);
    const b = nodes.get(l.b);
    const h = l.v * scale;
    const x0 = a.x + nodeW;
    const x1 = b.x;
    const y0 = a.oy + h / 2;
    const y1 = b.iy + h / 2;
    a.oy += h;
    b.iy += h;
    const mx = (x0 + x1) / 2;
    const color = seriesColor(o, a.i);
    out.push(mark(ctx, 'path', { d: `M${r2(x0)},${r2(y0)}C${r2(mx)},${r2(y0)} ${r2(mx)},${r2(y1)} ${r2(x1)},${r2(y1)}`, fill: 'none', stroke: color, 'stroke-opacity': 0.38, 'stroke-width': Math.max(1, h), class: 'link' }, `${l.a} → ${l.b}: ${formatValue(l.v, o, ctx.lang)}`, 0, l.row));
  }
  for (const n of nodes.values()) {
    const color = seriesColor(o, n.i);
    out.push(mark(ctx, 'rect', { x: n.x, y: n.y, width: nodeW, height: n.h, rx: 2 * fs, fill: color, class: 'node' }, `${n.name}: ${formatValue(Math.max(n.inV, n.outV), o, ctx.lang)}`, 0, ''));
    const last = n.layer === layers - 1 && layers > 1;
    label(ctx, last ? n.x - 6 * fs : n.x + nodeW + 6 * fs, n.y + n.h / 2 + 4 * fs, fitText(`${n.name}${o.dataLabels ? ` (${formatValue(Math.max(n.inV, n.outV), o, ctx.lang)})` : ''}`, labelRoom * 1.6, 11 * fs), { anchor: last ? 'end' : 'start', size: 11, weight: 600 });
  }
}

const DRAW = {
  pie: drawPie, donut: drawPie, halfDonut: drawPie, polarArea: drawPolarArea, radar: drawRadar, gauge: drawGauge, funnel: drawFunnel,
  treemap: drawTreemap, sunburst: drawSunburst, heatmap: drawHeatmap, sankey: drawSankey, waterfall: drawWaterfall, candlestick: drawCandles,
  scatter: drawScatter, bubble: drawBubble, histogram: drawHistogram, boxplot: drawBoxplot,
};

/** The chart's data as a small table (the export documents put it under the picture). */
export function chartDataTable(doc) {
  const chart = normalizeChart(doc.chart ?? {}, doc.table);
  const used = new Set([chart.mapping.category, chart.mapping.label, chart.mapping.group, chart.mapping.x, chart.mapping.y, chart.mapping.size, chart.mapping.open, chart.mapping.high, chart.mapping.low, chart.mapping.close, chart.mapping.source, chart.mapping.target, chart.mapping.start, chart.mapping.end, chart.mapping.goal, ...(chart.mapping.values ?? [])].filter((c) => c != null));
  const cols = [...used].sort((a, b) => a - b);
  return {
    columns: cols.map((c) => ({ label: doc.table.columns[c].name, num: doc.table.columns[c].type === 'number' })),
    rows: doc.table.rows.map((r) => ({ cells: cols.map((c) => cellText(r[c])) })),
  };
}

export { CARTESIAN };
/** The building blocks the extra renderers (render-extra.js) share with these. */
export const KIT = {
  get derivedOhlc() { return derivedOhlc; }, get fallbackFlows() { return fallbackFlows; },
  get axes() { return axes; }, get mark() { return mark; }, get label() { return label; }, get visible() { return visible; }, get finite() { return finite; },
  get tipOf() { return tipOf; }, get drawAxisTitle() { return drawAxisTitle; }, get L() { return L; }, get esc() { return esc; }, get r2() { return r2; },
  get arcPath() { return arcPath; }, get polar() { return polar; }, get linePath() { return linePath; }, get hierarchy() { return hierarchy; },
  get pieSlices() { return pieSlices; }, get drawCartesian() { return drawCartesian; }, get drawGauge() { return drawGauge; }, get valueScale() { return valueScale; },
};
