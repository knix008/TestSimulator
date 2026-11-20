// The renderers of the chart types added on top of render.js's: bars (dumbbell, range, bullet, progress, butterfly,
// Pareto, Marimekko, radial, small multiples, mean ± error), lines (streamgraph, range area, slope, bump,
// sparklines), part of whole (nested donut, icicle, packed circles, waffle, parliament, word cloud, activity rings),
// distribution (violin, strip / beeswarm / rug, density, ECDF, punch card, correlation, scatter matrix, calendar),
// relations (chord, arc diagram, network, tree), finance and time (price band, Bollinger, Gantt, timeline) and
// indicators (gauge grid, linear gauge, KPI cards). Pure SVG text like render.js; the shared pieces come from KIT.
import { KIT, fitText, formatValue, linearFit, niceTicks, squarify, textWidth } from './render.js';
import { labelsOf, maxOf, minOf, numbersOf, parseDate, parseNumber, quantile } from '../data/table.js';
import { darken, lighten, mix, rampColor, readableOn, seriesColor } from './palettes.js';

const fmt = (ctx, v, opts) => formatValue(v, ctx.o, ctx.lang, opts);
const fin = (list) => list.filter((v) => v != null && Number.isFinite(v));
const mean = (list) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : 0);
const stdev = (list) => { const m = mean(list); return list.length > 1 ? Math.sqrt(list.reduce((a, v) => a + (v - m) ** 2, 0) / (list.length - 1)) : 0; };
const hashOf = (a, b = 0) => { const v = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return v - Math.floor(v); };
const bg = (ctx) => (ctx.colors.bg === 'none' ? ctx.colors.base : ctx.colors.bg);

function none(ctx, plot, ko, en) {
  KIT.label(ctx, plot.x + plot.w / 2, plot.y + plot.h / 2, KIT.L(ctx, ko, en), { color: ctx.colors.muted, size: 13 });
}
const needSeries = (ctx, plot, series, n = 1) => {
  if (series.length >= n) return true;
  none(ctx, plot, n > 1 ? `숫자 열을 ${n}개 이상 고르세요` : '숫자 열을 고르세요', n > 1 ? `Choose at least ${n} number columns` : 'Choose a number column');
  return false;
};

/** A column of a role as numbers, in the drawn row order. */
const roleNumbers = (ctx, data, role) => { const c = ctx.chart.mapping[role]; return data.order.map((i) => (c == null ? null : numbersOf(ctx.table, c)[i])); };
/** Low and high of a range chart; with only one number column the range runs from 0 to its value. */
function lowHigh(ctx, data) {
  let low = roleNumbers(ctx, data, 'low');
  let high = roleNumbers(ctx, data, 'high');
  if (!fin(high).length && fin(low).length) { high = low; low = low.map((v) => (v == null ? null : Math.min(0, v))); }
  else if (!fin(low).length && fin(high).length) low = high.map((v) => (v == null ? null : Math.min(0, v)));
  return { low, high };
}
const roleLabels = (ctx, data, role) => { const c = ctx.chart.mapping[role]; return data.order.map((i) => (c == null ? '' : labelsOf(ctx.table, c)[i])); };

/** Gaussian kernel density of `values` at `points` (Silverman's bandwidth). */
function kde(values, points) {
  const n = values.length;
  const sd = stdev(values) || 1;
  const h = 1.06 * sd * n ** -0.2 || 1;
  return points.map((x) => values.reduce((a, v) => a + Math.exp(-0.5 * ((x - v) / h) ** 2), 0) / (n * h * Math.sqrt(2 * Math.PI)));
}

// ───────────────────────── bars

function drawDumbbell(ctx, plot, data) {
  const { out, fs, r2 } = { ...ctx, r2: KIT.r2 };
  const series = KIT.visible(data.series);
  if (!needSeries(ctx, plot, series)) return;
  const all = series.flatMap((s) => fin(s.values));
  const ax = KIT.axes(ctx, plot, { categories: data.categories, min: minOf([...all]), max: maxOf([...all]), horizontal: true, forceZero: false });
  data.categories.forEach((cat, i) => {
    const vals = series.map((s) => s.values[i]).filter((v) => v != null);
    if (!vals.length) return;
    const y = ax.band.center(i);
    out.push(`<line x1="${r2(ax.vs.map(minOf([...vals])))}" x2="${r2(ax.vs.map(maxOf([...vals])))}" y1="${r2(y)}" y2="${r2(y)}" stroke="${ctx.colors.axis}" stroke-width="${r2(3 * fs)}" stroke-linecap="round"/>`);
    for (const s of series) if (s.values[i] != null) out.push(KIT.mark(ctx, 'circle', { cx: ax.vs.map(s.values[i]), cy: y, r: 6 * fs, fill: s.color, stroke: bg(ctx), 'stroke-width': 1.5 * fs, class: 'dot' }, KIT.tipOf(ctx, s.name, cat, s.values[i]), s.index, data.order[i]));
    if (ctx.o.dataLabels && vals.length > 1) KIT.label(ctx, ax.vs.map(maxOf([...vals])) + 10 * fs, y + 4 * fs, `Δ ${fmt(ctx, maxOf([...vals]) - minOf([...vals]))}`, { anchor: 'start', size: 10, color: ctx.colors.muted });
  });
}

function drawRangeColumn(ctx, plot, data) {
  const { out, fs, o } = ctx;
  const r2 = KIT.r2;
  const { low, high } = lowHigh(ctx, data);
  const all = fin([...low, ...high]);
  if (!all.length) return none(ctx, plot, '최솟값·최댓값 열을 고르세요', 'Choose low and high columns');
  const horizontal = Boolean(o.horizontal);
  const ax = KIT.axes(ctx, plot, { categories: data.categories, min: minOf([...all]), max: maxOf([...all]), horizontal, forceZero: false });
  const w = ax.band.step * (1 - (Number(o.barGap) || 0.28));
  const color = seriesColor(o, 0);
  data.categories.forEach((cat, i) => {
    if (low[i] == null || high[i] == null) return;
    const p0 = ax.vs.map(Math.min(low[i], high[i]));
    const p1 = ax.vs.map(Math.max(low[i], high[i]));
    const off = ax.band.from + ax.band.step * i + (ax.band.step - w) / 2;
    const rect = horizontal ? { x: p0, y: off, width: Math.max(1, p1 - p0), height: w } : { x: off, y: p1, width: w, height: Math.max(1, p0 - p1) };
    out.push(KIT.mark(ctx, 'rect', { ...rect, rx: Math.min((Number(o.barRadius) || 0) * fs, w / 2), fill: color, class: 'bar' }, `${cat}: ${fmt(ctx, low[i])} – ${fmt(ctx, high[i])}`, 0, data.order[i]));
    if (o.dataLabels) {
      if (horizontal) { KIT.label(ctx, p0 - 4 * fs, off + w / 2 + 4 * fs, fmt(ctx, low[i]), { anchor: 'end', size: 10 }); KIT.label(ctx, p1 + 4 * fs, off + w / 2 + 4 * fs, fmt(ctx, high[i]), { anchor: 'start', size: 10 }); }
      else { KIT.label(ctx, off + w / 2, p1 - 4 * fs, fmt(ctx, high[i]), { size: 10 }); KIT.label(ctx, off + w / 2, p0 + 12 * fs, fmt(ctx, low[i]), { size: 10 }); }
    }
  });
  void r2;
}

function drawBullet(ctx, plot, data) {
  const { out, fs, o } = ctx;
  const r2 = KIT.r2;
  const s = data.series[0];
  const target = roleNumbers(ctx, data, 'goal');
  const max = maxOf([...fin(s.values), ...fin(target), 1]) * 1.1;
  const ax = KIT.axes(ctx, plot, { categories: data.categories, min: 0, max, horizontal: true });
  const shades = ctx.colors.dark ? ['#334155', '#3f4b5f', '#4b5870'] : ['#e5e7eb', '#d1d5db', '#bfc5cd'];
  data.categories.forEach((cat, i) => {
    const y = ax.band.from + ax.band.step * i + ax.band.step * 0.15;
    const h = ax.band.step * 0.7;
    [[1, shades[0]], [0.8, shades[1]], [0.6, shades[2]]].forEach(([f, color]) => out.push(`<rect x="${r2(ax.vs.map(0))}" y="${r2(y)}" width="${r2(ax.vs.map(max * f / 1.1) - ax.vs.map(0))}" height="${r2(h)}" fill="${color}"/>`));
    const v = s.values[i];
    if (v != null) out.push(KIT.mark(ctx, 'rect', { x: ax.vs.map(0), y: y + h * 0.33, width: Math.max(1, ax.vs.map(v) - ax.vs.map(0)), height: h * 0.34, fill: seriesColor(o, 0), class: 'bar' }, `${cat}: ${fmt(ctx, v)}${target[i] != null ? ` / ${KIT.L(ctx, '목표', 'target')} ${fmt(ctx, target[i])}` : ''}`, 0, data.order[i]));
    if (target[i] != null) out.push(`<line class="target" x1="${r2(ax.vs.map(target[i]))}" x2="${r2(ax.vs.map(target[i]))}" y1="${r2(y + h * 0.12)}" y2="${r2(y + h * 0.88)}" stroke="${ctx.colors.text}" stroke-width="${r2(3 * fs)}"/>`);
    if (o.dataLabels && v != null) KIT.label(ctx, ax.vs.map(v) + 5 * fs, y + h / 2 + 4 * fs, fmt(ctx, v), { anchor: 'start', size: 10 });
  });
}

function drawProgressBars(ctx, plot, data) {
  const { out, fs, o } = ctx;
  const r2 = KIT.r2;
  const s = data.series[0];
  const vals = fin(s.values);
  const max = parseNumber(o.gaugeMax) ?? (vals.every((v) => v <= 100) ? 100 : maxOf([...vals]));
  const n = data.categories.length;
  const rowH = Math.min(46 * fs, plot.h / Math.max(1, n));
  const labelW = Math.min(plot.w * 0.3, maxOf([...data.categories.map((c) => textWidth(c, 12 * fs))]) + 12 * fs);
  const trackW = plot.w - labelW - 70 * fs;
  data.categories.forEach((cat, i) => {
    const y = plot.y + (plot.h - rowH * n) / 2 + i * rowH;
    const h = Math.max(6, rowH * 0.42);
    const v = s.values[i] ?? 0;
    const t = Math.max(0, Math.min(1, v / (max || 1)));
    const color = seriesColor(o, i);
    KIT.label(ctx, plot.x + labelW - 8 * fs, y + rowH / 2 + 4 * fs, fitText(cat, labelW - 10 * fs, 12 * fs), { anchor: 'end', size: 12 });
    out.push(`<rect x="${r2(plot.x + labelW)}" y="${r2(y + (rowH - h) / 2)}" width="${r2(trackW)}" height="${r2(h)}" rx="${r2(h / 2)}" fill="${ctx.colors.grid}"/>`);
    out.push(KIT.mark(ctx, 'rect', { x: plot.x + labelW, y: y + (rowH - h) / 2, width: Math.max(h, trackW * t), height: h, rx: h / 2, fill: color, class: 'bar' }, `${cat}: ${fmt(ctx, v)} / ${fmt(ctx, max)}`, 0, data.order[i]));
    KIT.label(ctx, plot.x + labelW + trackW + 8 * fs, y + rowH / 2 + 4 * fs, fmt(ctx, t, { percent: true }), { anchor: 'start', size: 12, weight: 700 });
  });
}

function drawButterfly(ctx, plot, data) {
  const { out, fs, o } = ctx;
  const series = KIT.visible(data.series);
  if (!needSeries(ctx, plot, series)) return;
  const a = series[0];
  // One number column: its bars on the left; a second column fills the right side.
  const b = series[1] ?? { ...a, index: '', name: '', values: a.values.map(() => null), color: ctx.colors.grid };
  const max = maxOf([...fin(a.values).map(Math.abs), ...fin(b.values).map(Math.abs), 1]);
  const labelW = Math.min(plot.w * 0.22, maxOf([...data.categories.map((c) => textWidth(c, 11.5 * fs))]) + 16 * fs);
  const half = (plot.w - labelW) / 2;
  const cx = plot.x + half;
  const n = data.categories.length;
  const step = (plot.h - 24 * fs) / Math.max(1, n);
  const top = plot.y + 18 * fs;
  KIT.label(ctx, cx - half / 2, plot.y + 10 * fs, a.name, { size: 12, weight: 700, color: a.color });
  KIT.label(ctx, cx + labelW + half / 2, plot.y + 10 * fs, b.name, { size: 12, weight: 700, color: b.color });
  data.categories.forEach((cat, i) => {
    const y = top + i * step + step * 0.12;
    const h = step * 0.76;
    const wa = (Math.abs(a.values[i] ?? 0) / max) * (half - 8 * fs);
    const wb = (Math.abs(b.values[i] ?? 0) / max) * (half - 8 * fs);
    out.push(KIT.mark(ctx, 'rect', { x: cx - wa, y, width: wa, height: h, rx: Math.min(3 * fs, h / 3), fill: a.color, class: 'bar' }, KIT.tipOf(ctx, a.name, cat, a.values[i]), a.index, data.order[i]));
    if (b.values[i] != null) out.push(KIT.mark(ctx, 'rect', { x: cx + labelW, y, width: wb, height: h, rx: Math.min(3 * fs, h / 3), fill: b.color, class: 'bar' }, KIT.tipOf(ctx, b.name, cat, b.values[i]), b.index, data.order[i]));
    KIT.label(ctx, cx + labelW / 2, y + h / 2 + 4 * fs, fitText(cat, labelW - 8 * fs, 11.5 * fs), { size: 11.5 });
    if (o.dataLabels) {
      KIT.label(ctx, cx - wa - 4 * fs, y + h / 2 + 4 * fs, fmt(ctx, a.values[i]), { anchor: 'end', size: 10 });
      if (b.values[i] != null) KIT.label(ctx, cx + labelW + wb + 4 * fs, y + h / 2 + 4 * fs, fmt(ctx, b.values[i]), { anchor: 'start', size: 10 });
    }
  });
}

function drawPareto(ctx, plot, data) {
  const { out, fs, o } = ctx;
  const r2 = KIT.r2;
  const s = data.series[0];
  const rows = data.categories.map((c, i) => ({ c, v: s.values[i] ?? 0, row: data.order[i] })).sort((x, y) => y.v - x.v);
  const total = rows.reduce((a, r) => a + r.v, 0) || 1;
  const ax = KIT.axes(ctx, plot, { categories: rows.map((r) => r.c), min: 0, max: maxOf([...rows.map((r) => r.v), 1]), y2: { min: 0, max: 100 } });
  const w = ax.band.step * (1 - (Number(o.barGap) || 0.28));
  let run = 0;
  const pts = [];
  rows.forEach((r, i) => {
    const x = ax.band.from + ax.band.step * i + (ax.band.step - w) / 2;
    const y = ax.vs.map(r.v);
    out.push(KIT.mark(ctx, 'rect', { x, y, width: w, height: Math.max(0, ax.vs.map(0) - y), rx: Math.min((Number(o.barRadius) || 0) * fs, w / 4), fill: seriesColor(o, 0), class: 'bar' }, KIT.tipOf(ctx, s.name, r.c, r.v), 0, r.row));
    run += r.v;
    pts.push([ax.band.center(i), ax.vs2.map((run / total) * 100), run / total]);
  });
  const lineColor = seriesColor(o, 1);
  out.push(`<path class="mark line" data-s="1" data-r="" data-tip="${KIT.esc(KIT.L(ctx, '누적 비율', 'Cumulative share'))}" d="${KIT.linePath(pts, 'line')}" fill="none" stroke="${lineColor}" stroke-width="${r2(2.5 * fs)}"/>`);
  ctx.marks++;
  pts.forEach(([x, y, p], i) => { out.push(KIT.mark(ctx, 'circle', { cx: x, cy: y, r: 4 * fs, fill: lineColor, class: 'dot' }, `${rows[i].c}: ${fmt(ctx, p, { percent: true })}`, 1, rows[i].row)); if (o.dataLabels) KIT.label(ctx, x, y - 8 * fs, fmt(ctx, p, { percent: true }), { size: 10 }); });
  const y80 = ax.vs2.map(80);
  out.push(`<line class="pareto80" x1="${r2(ax.left)}" x2="${r2(ax.right)}" y1="${r2(y80)}" y2="${r2(y80)}" stroke="${lineColor}" stroke-dasharray="4 4" opacity="0.6"/>`);
  KIT.drawAxisTitle(ctx, KIT.L(ctx, '누적 %', 'Cumulative %'), plot.x + plot.w - 8 * fs, (ax.top + ax.bottom) / 2, 90);
}

function drawMarimekko(ctx, plot, data) {
  const { out, fs, o } = ctx;
  const series = KIT.visible(data.series);
  if (!needSeries(ctx, plot, series)) return;
  const totals = data.categories.map((_, i) => series.reduce((a, s) => a + Math.max(0, s.values[i] ?? 0), 0));
  const grand = totals.reduce((a, b) => a + b, 0) || 1;
  const left = plot.x + 40 * fs;
  const width = plot.w - 44 * fs;
  const top = plot.y + 4 * fs;
  const height = plot.h - 26 * fs;
  for (const p of [0, 0.25, 0.5, 0.75, 1]) KIT.label(ctx, left - 6 * fs, top + height * (1 - p) + 4 * fs, fmt(ctx, p, { percent: true }), { anchor: 'end', size: 10, color: ctx.colors.muted });
  let x = left;
  data.categories.forEach((cat, i) => {
    const w = (totals[i] / grand) * width;
    let y = top + height;
    series.forEach((s) => {
      const v = Math.max(0, s.values[i] ?? 0);
      const h = totals[i] ? (v / totals[i]) * height : 0;
      y -= h;
      out.push(KIT.mark(ctx, 'rect', { x: x + 1, y, width: Math.max(0, w - 2), height: Math.max(0, h - 1), fill: s.color, class: 'bar' }, `${s.name} · ${cat}: ${fmt(ctx, v)} (${fmt(ctx, totals[i] ? v / totals[i] : 0, { percent: true })})`, s.index, data.order[i]));
      if (o.dataLabels && w > 34 * fs && h > 14 * fs) KIT.label(ctx, x + w / 2, y + h / 2 + 4 * fs, fmt(ctx, totals[i] ? v / totals[i] : 0, { percent: true }), { size: 10, color: readableOn(s.color) });
    });
    KIT.label(ctx, x + w / 2, top + height + 16 * fs, fitText(cat, Math.max(10, w - 4), 11 * fs), { size: 11 });
    x += w;
  });
}

function drawRadialBar(ctx, plot, data) {
  const { out, fs, o } = ctx;
  const s = data.series[0];
  const vals = fin(s.values);
  const max = parseNumber(o.gaugeMax) ?? maxOf([...vals, 1]);
  const n = data.categories.length;
  const cx = plot.x + plot.w / 2;
  const cy = plot.y + plot.h / 2;
  const R = Math.min(plot.w, plot.h) / 2 - 6 * fs;
  const inner = R * 0.25;
  const ring = (R - inner) / Math.max(1, n);
  const sweep = Math.PI * 1.5;
  data.categories.forEach((cat, i) => {
    const r1 = R - i * ring;
    const r0 = r1 - ring * 0.72;
    const v = s.values[i] ?? 0;
    out.push(`<path d="${KIT.arcPath(cx, cy, r0, r1, 0, sweep)}" fill="${ctx.colors.grid}"/>`);
    out.push(KIT.mark(ctx, 'path', { d: KIT.arcPath(cx, cy, r0, r1, 0, Math.max(0.01, (v / max) * sweep)), fill: seriesColor(o, i), class: 'slice' }, `${cat}: ${fmt(ctx, v)}`, 0, data.order[i]));
    KIT.label(ctx, cx - 6 * fs, cy - (r0 + r1) / 2 + 4 * fs, fitText(`${cat}${o.dataLabels ? ` ${fmt(ctx, v)}` : ''}`, R * 0.9, 10.5 * fs), { anchor: 'end', size: 10.5 });
  });
}

function drawRadialColumn(ctx, plot, data) {
  const { out, fs } = ctx;
  const series = KIT.visible(data.series);
  if (!needSeries(ctx, plot, series)) return;
  const n = data.categories.length;
  const totals = data.categories.map((_, i) => series.reduce((a, s) => a + Math.max(0, s.values[i] ?? 0), 0));
  const max = maxOf([...totals, 1]);
  const cx = plot.x + plot.w / 2;
  const cy = plot.y + plot.h / 2;
  const R = Math.min(plot.w, plot.h) / 2 - 26 * fs;
  const inner = R * 0.28;
  const da = (Math.PI * 2) / Math.max(1, n);
  out.push(`<circle cx="${KIT.r2(cx)}" cy="${KIT.r2(cy)}" r="${KIT.r2(inner)}" fill="none" stroke="${ctx.colors.grid}"/>`);
  data.categories.forEach((cat, i) => {
    const a0 = i * da + da * 0.1;
    const a1 = (i + 1) * da - da * 0.1;
    let r = inner;
    series.forEach((s) => {
      const v = Math.max(0, s.values[i] ?? 0);
      const r1 = r + (v / max) * (R - inner);
      out.push(KIT.mark(ctx, 'path', { d: KIT.arcPath(cx, cy, r, r1, a0, a1), fill: s.color, class: 'slice' }, KIT.tipOf(ctx, s.name, cat, v), s.index, data.order[i]));
      r = r1;
    });
    const [lx, ly] = KIT.polar(cx, cy, R + 12 * fs, (a0 + a1) / 2);
    KIT.label(ctx, lx, ly + 4 * fs, fitText(cat, 80 * fs, 10 * fs), { size: 10, anchor: Math.abs(Math.sin((a0 + a1) / 2)) < 0.2 ? 'middle' : Math.sin((a0 + a1) / 2) > 0 ? 'start' : 'end' });
  });
}

function drawSmallMultiples(ctx, plot, data) {
  const { out, fs, o } = ctx;
  const r2 = KIT.r2;
  const series = KIT.visible(data.series);
  if (!needSeries(ctx, plot, series)) return;
  const cols = Math.ceil(Math.sqrt(series.length * (plot.w / plot.h)));
  const rows = Math.ceil(series.length / cols);
  const cw = plot.w / cols;
  const ch = plot.h / rows;
  const all = series.flatMap((s) => fin(s.values));
  const t = niceTicks(minOf([0, ...all]), maxOf([0, ...all]), 3);
  series.forEach((s, k) => {
    const x0 = plot.x + (k % cols) * cw + 8 * fs;
    const y0 = plot.y + Math.floor(k / cols) * ch + 18 * fs;
    const w = cw - 16 * fs;
    const h = ch - 30 * fs;
    KIT.label(ctx, x0, y0 - 6 * fs, fitText(s.name, w, 12 * fs), { anchor: 'start', size: 12, weight: 700 });
    out.push(`<rect x="${r2(x0)}" y="${r2(y0)}" width="${r2(w)}" height="${r2(h)}" fill="none" stroke="${ctx.colors.grid}"/>`);
    const map = (v) => y0 + h * (1 - (v - t.min) / (t.max - t.min || 1));
    const n = data.categories.length;
    const bw = w / Math.max(1, n);
    s.values.forEach((v, i) => {
      if (v == null) return;
      const y = map(v);
      const z = map(0);
      out.push(KIT.mark(ctx, 'rect', { x: x0 + i * bw + bw * 0.15, y: Math.min(y, z), width: bw * 0.7, height: Math.max(1, Math.abs(z - y)), fill: s.color, class: 'bar' }, KIT.tipOf(ctx, s.name, data.categories[i], v), s.index, data.order[i]));
    });
    KIT.label(ctx, x0 + w - 2, y0 + 12 * fs, fmt(ctx, t.max, { tick: true }), { anchor: 'end', size: 9, color: ctx.colors.muted });
    if (o.dataLabels) KIT.label(ctx, x0 + w, y0 - 6 * fs, fmt(ctx, fin(s.values).reduce((a, b) => a + b, 0)), { anchor: 'end', size: 10, color: ctx.colors.muted });
  });
}

function drawMeanError(ctx, plot, data) {
  const { out, fs, o } = ctx;
  const r2 = KIT.r2;
  const series = KIT.visible(data.series);
  if (!needSeries(ctx, plot, series)) return;
  const stats = series.map((s) => { const v = fin(s.values); return { s, m: mean(v), sd: stdev(v), n: v.length }; });
  const ax = KIT.axes(ctx, plot, { categories: series.map((s) => s.name), min: minOf([0, ...stats.map((x) => x.m - x.sd)]), max: maxOf([...stats.map((x) => x.m + x.sd), 1]) });
  const w = ax.band.step * 0.5;
  stats.forEach((st, i) => {
    const x = ax.band.center(i);
    const y = ax.vs.map(st.m);
    out.push(KIT.mark(ctx, 'rect', { x: x - w / 2, y: Math.min(y, ax.vs.map(0)), width: w, height: Math.abs(ax.vs.map(0) - y), rx: Math.min((Number(o.barRadius) || 0) * fs, w / 4), fill: st.s.color, 'fill-opacity': 0.85, class: 'bar' }, `${st.s.name}: ${KIT.L(ctx, '평균', 'mean')} ${fmt(ctx, st.m)} ± ${fmt(ctx, st.sd)} (n=${st.n})`, st.s.index, ''));
    const yHi = ax.vs.map(st.m + st.sd);
    const yLo = ax.vs.map(st.m - st.sd);
    out.push(`<path class="error" d="M${r2(x)},${r2(yHi)}V${r2(yLo)}M${r2(x - w / 4)},${r2(yHi)}H${r2(x + w / 4)}M${r2(x - w / 4)},${r2(yLo)}H${r2(x + w / 4)}" stroke="${ctx.colors.text}" stroke-width="${r2(1.6 * fs)}" fill="none"/>`);
    if (o.dataLabels) KIT.label(ctx, x + w / 2 + 4 * fs, y + 4 * fs, fmt(ctx, st.m), { anchor: 'start', size: 10 });
  });
}

// ───────────────────────── lines and areas

function drawStreamgraph(ctx, plot, data) {
  const { out, fs } = ctx;
  const series = KIT.visible(data.series);
  if (!needSeries(ctx, plot, series)) return;
  const n = data.categories.length;
  const totals = data.categories.map((_, i) => series.reduce((a, s) => a + Math.max(0, s.values[i] ?? 0), 0));
  const half = maxOf([...totals, 1]) / 2;
  const ax = KIT.axes(ctx, plot, { categories: data.categories, min: -half, max: half, forceZero: false });
  const lower = totals.map((t) => -t / 2);
  for (const s of series) {
    const top = [];
    const bottom = [];
    for (let i = 0; i < n; i++) {
      const v = Math.max(0, s.values[i] ?? 0);
      bottom.push([ax.band.center(i), ax.vs.map(lower[i])]);
      lower[i] += v;
      top.push([ax.band.center(i), ax.vs.map(lower[i])]);
    }
    const d = `${KIT.linePath(top, 'smooth')}L${KIT.linePath([...bottom].reverse(), 'smooth').slice(1)}Z`;
    out.push(KIT.mark(ctx, 'path', { d, fill: s.color, 'fill-opacity': 0.85, stroke: bg(ctx), 'stroke-width': 0.8 * fs, class: 'area' }, s.name, s.index, ''));
  }
}

function drawRangeArea(ctx, plot, data) {
  const { out, fs, o } = ctx;
  const r2 = KIT.r2;
  const { low, high } = lowHigh(ctx, data);
  const all = fin([...low, ...high]);
  if (!all.length) return none(ctx, plot, '최솟값·최댓값 열을 고르세요', 'Choose low and high columns');
  const ax = KIT.axes(ctx, plot, { categories: data.categories, min: minOf([...all]), max: maxOf([...all]), forceZero: false });
  const color = seriesColor(o, 0);
  const top = high.map((v, i) => [ax.band.center(i), ax.vs.map(v ?? 0)]);
  const bottom = low.map((v, i) => [ax.band.center(i), ax.vs.map(v ?? 0)]);
  out.push(KIT.mark(ctx, 'path', { d: `${KIT.linePath(top, 'smooth')}L${KIT.linePath([...bottom].reverse(), 'smooth').slice(1)}Z`, fill: color, 'fill-opacity': 0.3, stroke: 'none', class: 'area' }, KIT.L(ctx, '범위', 'Range'), 0, ''));
  for (const [pts, name] of [[top, 'high'], [bottom, 'low']]) out.push(`<path class="line" d="${KIT.linePath(pts, 'smooth')}" fill="none" stroke="${color}" stroke-width="${r2(2 * fs)}"/>`);
  const mid = top.map((p, i) => [p[0], (p[1] + bottom[i][1]) / 2]);
  out.push(`<path class="line mid" d="${KIT.linePath(mid, 'smooth')}" fill="none" stroke="${darken(color, 0.3)}" stroke-width="${r2(1.4 * fs)}" stroke-dasharray="4 4"/>`);
  data.categories.forEach((cat, i) => { if (low[i] != null && high[i] != null) out.push(KIT.mark(ctx, 'circle', { cx: top[i][0], cy: (top[i][1] + bottom[i][1]) / 2, r: 6 * fs, fill: 'transparent', class: 'hit' }, `${cat}: ${fmt(ctx, low[i])} – ${fmt(ctx, high[i])}`, 0, data.order[i])); });
}

function drawSlope(ctx, plot, data) {
  const { out, fs, o } = ctx;
  const r2 = KIT.r2;
  const series = KIT.visible(data.series);
  if (!needSeries(ctx, plot, series)) return;
  const a = series[0];
  // One number column: each item runs from its value to the average of all of them.
  const avg = mean(fin(a.values));
  const b = series.length > 1 ? series[series.length - 1] : { ...a, name: KIT.L(ctx, '평균', 'Average'), values: a.values.map((v) => (v == null ? null : avg)) };
  const all = fin([...a.values, ...b.values]);
  const t = niceTicks(minOf([...all]), maxOf([...all]), 5);
  const labelW = Math.min(plot.w * 0.28, maxOf([...data.categories.map((c) => textWidth(c, 11 * fs))]) + 60 * fs);
  const x0 = plot.x + labelW;
  const x1 = plot.x + plot.w - labelW;
  const top = plot.y + 24 * fs;
  const bottom = plot.y + plot.h - 8 * fs;
  const map = (v) => bottom - ((v - t.min) / (t.max - t.min || 1)) * (bottom - top);
  for (const [x, s] of [[x0, a], [x1, b]]) { out.push(`<line x1="${r2(x)}" x2="${r2(x)}" y1="${r2(top)}" y2="${r2(bottom)}" stroke="${ctx.colors.axis}"/>`); KIT.label(ctx, x, plot.y + 12 * fs, s.name, { size: 12, weight: 700 }); }
  data.categories.forEach((cat, i) => {
    const va = a.values[i];
    const vb = b.values[i];
    if (va == null || vb == null) return;
    const color = seriesColor(o, i);
    out.push(KIT.mark(ctx, 'line', { x1: x0, x2: x1, y1: map(va), y2: map(vb), stroke: color, 'stroke-width': 2.5 * fs, class: 'line' }, `${cat}: ${fmt(ctx, va)} → ${fmt(ctx, vb)}`, 0, data.order[i]));
    out.push(`<circle cx="${r2(x0)}" cy="${r2(map(va))}" r="${r2(4 * fs)}" fill="${color}"/><circle cx="${r2(x1)}" cy="${r2(map(vb))}" r="${r2(4 * fs)}" fill="${color}"/>`);
    KIT.label(ctx, x0 - 8 * fs, map(va) + 4 * fs, `${fitText(cat, labelW - 60 * fs, 11 * fs)} ${fmt(ctx, va)}`, { anchor: 'end', size: 11 });
    if (series.length > 1) KIT.label(ctx, x1 + 8 * fs, map(vb) + 4 * fs, `${fmt(ctx, vb)} ${fitText(cat, labelW - 60 * fs, 11 * fs)}`, { anchor: 'start', size: 11 });
  });
  // One series: a single label for the average all the lines meet at.
  if (series.length === 1 && fin(a.values).length) KIT.label(ctx, x1 + 8 * fs, map(avg) + 4 * fs, `${KIT.L(ctx, '평균', 'Average')} ${fmt(ctx, avg)}`, { anchor: 'start', size: 11, weight: 700 });
}

function drawBump(ctx, plot, data) {
  const { out, fs } = ctx;
  const r2 = KIT.r2;
  let series = KIT.visible(data.series);
  if (!needSeries(ctx, plot, series)) return;
  // One number column: the rows become the ranked items (one point each, ranked by value).
  if (series.length === 1) {
    const one = series[0];
    const rows = data.categories.map((c, i) => ({ c, v: one.values[i], i })).filter((x) => x.v != null).slice(0, 12);
    if (!rows.length) return none(ctx, plot, '숫자가 없습니다', 'No numbers');
    series = rows.map((x, k) => ({ index: one.index, column: one.column, name: x.c || String(x.i + 1), color: seriesColor(ctx.o, k), hidden: false, values: [x.v] }));
    data = { ...data, categories: [one.name], order: [''] };
  }
  const n = data.categories.length;
  const ranks = series.map(() => []);
  for (let i = 0; i < n; i++) {
    const order = series.map((s, k) => ({ k, v: s.values[i] ?? -Infinity })).sort((x, y) => y.v - x.v);
    order.forEach((e, r) => { ranks[e.k][i] = r + 1; });
  }
  const nameW = maxOf([...series.map((s) => textWidth(s.name, 11 * fs))]) + 16 * fs;
  const area = { ...plot, w: plot.w - nameW };
  const left = area.x + 26 * fs;
  const right = area.x + area.w;
  const top = area.y + 10 * fs;
  const bottom = area.y + area.h - 26 * fs;
  const xs = (i) => left + (n > 1 ? (i / (n - 1)) * (right - left) : (right - left) / 2);
  const ys = (r) => top + ((r - 1) / Math.max(1, series.length - 1)) * (bottom - top);
  for (let r = 1; r <= series.length; r++) { out.push(`<line class="grid" x1="${r2(left)}" x2="${r2(right)}" y1="${r2(ys(r))}" y2="${r2(ys(r))}" stroke="${ctx.colors.grid}"/>`); KIT.label(ctx, left - 10 * fs, ys(r) + 4 * fs, `#${r}`, { anchor: 'end', size: 10, color: ctx.colors.muted }); }
  data.categories.forEach((c, i) => KIT.label(ctx, xs(i), bottom + 18 * fs, fitText(c, (right - left) / Math.max(1, n), 10.5 * fs), { size: 10.5 }));
  series.forEach((s, k) => {
    const pts = ranks[k].map((r, i) => [xs(i), ys(r)]);
    out.push(`<path class="mark line" data-s="${s.index}" data-r="" data-tip="${KIT.esc(s.name)}" d="${KIT.linePath(pts, 'smooth')}" fill="none" stroke="${s.color}" stroke-width="${r2(3.5 * fs)}" stroke-linecap="round"/>`);
    ctx.marks++;
    pts.forEach(([x, y], i) => { out.push(KIT.mark(ctx, 'circle', { cx: x, cy: y, r: 7 * fs, fill: s.color, class: 'dot' }, `${s.name} · ${data.categories[i]}: #${ranks[k][i]} (${fmt(ctx, s.values[i])})`, s.index, data.order[i])); KIT.label(ctx, x, y + 3.5 * fs, String(ranks[k][i]), { size: 9, weight: 700, color: readableOn(s.color) }); });
    KIT.label(ctx, right + 12 * fs, pts[pts.length - 1][1] + 4 * fs, s.name, { anchor: 'start', size: 11, weight: 600, color: s.color });
  });
}

function drawSparklines(ctx, plot, data) {
  const { out, fs } = ctx;
  const r2 = KIT.r2;
  const series = KIT.visible(data.series);
  if (!needSeries(ctx, plot, series)) return;
  const rowH = Math.min(60 * fs, plot.h / series.length);
  const nameW = Math.min(plot.w * 0.25, maxOf([...series.map((s) => textWidth(s.name, 12 * fs))]) + 12 * fs);
  const valW = 90 * fs;
  series.forEach((s, k) => {
    const y = plot.y + (plot.h - rowH * series.length) / 2 + k * rowH;
    const vals = fin(s.values);
    const lo = minOf([...vals]);
    const hi = maxOf([...vals]);
    const x0 = plot.x + nameW;
    const w = plot.w - nameW - valW;
    const map = (v) => y + rowH * 0.8 - ((v - lo) / (hi - lo || 1)) * rowH * 0.6;
    const pts = s.values.map((v, i) => (v == null ? null : [x0 + (i / Math.max(1, s.values.length - 1)) * w, map(v), i])).filter(Boolean);
    KIT.label(ctx, plot.x + nameW - 10 * fs, y + rowH / 2 + 4 * fs, fitText(s.name, nameW - 12 * fs, 12 * fs), { anchor: 'end', size: 12, weight: 600 });
    out.push(`<line x1="${r2(x0)}" x2="${r2(x0 + w)}" y1="${r2(y + rowH - 2)}" y2="${r2(y + rowH - 2)}" stroke="${ctx.colors.grid}"/>`);
    out.push(`<path class="mark line" data-s="${s.index}" data-r="" data-tip="${KIT.esc(s.name)}" d="${KIT.linePath(pts, 'line')}" fill="none" stroke="${s.color}" stroke-width="${r2(2 * fs)}"/>`);
    ctx.marks++;
    for (const [x, py, i] of pts) {
      const special = s.values[i] === hi ? '#16a34a' : s.values[i] === lo ? '#dc2626' : null;
      out.push(KIT.mark(ctx, 'circle', { cx: x, cy: py, r: (special ? 3.5 : 6) * fs, fill: special ?? 'transparent', class: special ? 'dot' : 'hit' }, KIT.tipOf(ctx, s.name, data.categories[i], s.values[i]), s.index, data.order[i]));
    }
    const last = vals[vals.length - 1];
    KIT.label(ctx, plot.x + plot.w - 4 * fs, y + rowH / 2 + 4 * fs, fmt(ctx, last), { anchor: 'end', size: 13, weight: 700 });
  });
}

// ───────────────────────── part of whole

function drawNestedDonut(ctx, plot, data) {
  const { out, fs } = ctx;
  const series = KIT.visible(data.series);
  if (!needSeries(ctx, plot, series)) return;
  const cx = plot.x + plot.w / 2;
  const cy = plot.y + plot.h / 2;
  const R = Math.min(plot.w, plot.h) / 2 - 6 * fs;
  const inner = R * 0.3;
  const ring = (R - inner) / series.length;
  const hidden = new Set(ctx.o.hidden.map(Number));
  series.forEach((s, k) => {
    const r1 = R - k * ring;
    const r0 = r1 - ring * 0.9;
    const total = data.categories.reduce((a, _, i) => a + (hidden.has(i) ? 0 : Math.max(0, s.values[i] ?? 0)), 0) || 1;
    let a = 0;
    data.categories.forEach((cat, i) => {
      if (hidden.has(i)) return;
      const v = Math.max(0, s.values[i] ?? 0);
      const da = (v / total) * Math.PI * 2;
      if (da > 0) out.push(KIT.mark(ctx, 'path', { d: KIT.arcPath(cx, cy, r0, r1, a, a + da), fill: seriesColor(ctx.o, i), stroke: bg(ctx), 'stroke-width': 1.2 * fs, class: 'slice' }, `${s.name} · ${cat}: ${fmt(ctx, v)} (${fmt(ctx, v / total, { percent: true })})`, s.index, data.order[i]));
      a += da;
    });
    KIT.label(ctx, cx, cy - (r0 + r1) / 2 + 4 * fs, fitText(s.name, ring * 4, 10 * fs), { size: 10, weight: 700, color: ctx.colors.text });
  });
}

function drawIcicle(ctx, plot, data) {
  const { out, fs, o } = ctx;
  const groups = KIT.hierarchy(ctx, data);
  const total = groups.reduce((a, g) => a + g.value, 0);
  if (!total) return none(ctx, plot, '양수 값이 없습니다', 'No positive values');
  const grouped = groups.length > 1 || groups[0].name;
  const layers = grouped ? 2 : 1;
  const h = plot.h / (layers + 0.6);
  out.push(KIT.mark(ctx, 'rect', { x: plot.x, y: plot.y, width: plot.w, height: h * 0.6 - 2, fill: ctx.colors.dark ? '#334155' : '#e2e8f0', class: 'node' }, `${KIT.L(ctx, '합계', 'Total')}: ${fmt(ctx, total)}`, '', ''));
  KIT.label(ctx, plot.x + 8 * fs, plot.y + h * 0.3 + 4 * fs, `${KIT.L(ctx, '합계', 'Total')} ${fmt(ctx, total)}`, { anchor: 'start', size: 12, weight: 700 });
  let x = plot.x;
  groups.forEach((g, gi) => {
    const w = (g.value / total) * plot.w;
    const color = seriesColor(o, gi);
    let y = plot.y + h * 0.6;
    if (grouped) {
      out.push(KIT.mark(ctx, 'rect', { x: x + 1, y, width: Math.max(0, w - 2), height: h - 2, fill: color, class: 'node' }, `${g.name}: ${fmt(ctx, g.value)}`, 0, ''));
      if (w > 30 * fs) KIT.label(ctx, x + 6 * fs, y + 16 * fs, fitText(g.name, w - 10 * fs, 12 * fs), { anchor: 'start', size: 12, weight: 700, color: readableOn(color) });
      y += h;
    }
    let cx = x;
    g.children.forEach((c, k) => {
      const cw = (c.value / total) * plot.w;
      const shade = grouped ? lighten(color, 0.2 + (k % 3) * 0.12) : seriesColor(o, k);
      out.push(KIT.mark(ctx, 'rect', { x: cx + 1, y, width: Math.max(0, cw - 2), height: h - 2, fill: shade, class: 'slice' }, `${grouped ? `${g.name} › ` : ''}${c.name}: ${fmt(ctx, c.value)}`, 0, c.row));
      if (cw > 30 * fs) { KIT.label(ctx, cx + 6 * fs, y + 16 * fs, fitText(c.name, cw - 10 * fs, 11 * fs), { anchor: 'start', size: 11, color: readableOn(shade) }); KIT.label(ctx, cx + 6 * fs, y + 30 * fs, fmt(ctx, c.value), { anchor: 'start', size: 10, color: readableOn(shade) }); }
      cx += cw;
    });
    x += w;
  });
}

function drawPackedCircles(ctx, plot, data) {
  const { out, fs, o } = ctx;
  const groups = KIT.hierarchy(ctx, data);
  const items = groups.flatMap((g, gi) => g.children.map((c) => ({ ...c, group: g.name, gi })));
  if (!items.length) return none(ctx, plot, '양수 값이 없습니다', 'No positive values');
  const total = items.reduce((a, c) => a + c.value, 0);
  const scale = Math.sqrt((plot.w * plot.h * 0.5) / (Math.PI * total));
  const placed = [];
  const cx = plot.x + plot.w / 2;
  const cy = plot.y + plot.h / 2;
  for (const it of [...items].sort((a, b) => b.value - a.value)) {
    const r = Math.max(3, Math.sqrt(it.value) * scale);
    let pos = [cx, cy];
    for (let t = 0; t < 4000; t++) {
      const a = t * 0.35;
      const d = t * 0.9 * fs;
      const p = [cx + d * Math.cos(a), cy + d * Math.sin(a) * 0.8];
      if (placed.every((q) => Math.hypot(q.x - p[0], q.y - p[1]) >= q.r + r + 1.5)) { pos = p; break; }
    }
    placed.push({ x: pos[0], y: pos[1], r, it });
  }
  // Fit the cloud into the plot.
  const minX = minOf([...placed.map((p) => p.x - p.r)]);
  const maxX = maxOf([...placed.map((p) => p.x + p.r)]);
  const minY = minOf([...placed.map((p) => p.y - p.r)]);
  const maxY = maxOf([...placed.map((p) => p.y + p.r)]);
  const k = Math.min(plot.w / (maxX - minX || 1), plot.h / (maxY - minY || 1), 1.6);
  for (const p of placed) {
    const x = plot.x + plot.w / 2 + (p.x - (minX + maxX) / 2) * k;
    const y = plot.y + plot.h / 2 + (p.y - (minY + maxY) / 2) * k;
    const r = p.r * k;
    const color = seriesColor(o, groups.length > 1 || groups[0].name ? p.it.gi : placed.indexOf(p));
    out.push(KIT.mark(ctx, 'circle', { cx: x, cy: y, r, fill: color, 'fill-opacity': 0.85, stroke: bg(ctx), 'stroke-width': 1 * fs, class: 'dot' }, `${p.it.group ? `${p.it.group} › ` : ''}${p.it.name}: ${fmt(ctx, p.it.value)}`, 0, p.it.row));
    if (r > 16 * fs) { const size = Math.min(14, r / fs / 3); KIT.label(ctx, x, y + size * fs * 0.35, fitText(p.it.name, r * 1.8, size * fs), { size, weight: 600, color: readableOn(color) }); }
  }
}

/** Whole units out of `total` for each value (largest remainder), e.g. 100 waffle cells. */
function apportion(values, total) {
  const sum = values.reduce((a, b) => a + b, 0) || 1;
  const exact = values.map((v) => (v / sum) * total);
  const out = exact.map(Math.floor);
  let left = total - out.reduce((a, b) => a + b, 0);
  exact.map((v, i) => [v - Math.floor(v), i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (left > 0) { out[i]++; left--; } });
  return out;
}

function drawWaffle(ctx, plot, data) {
  const { out, fs, o } = ctx;
  const slices = KIT.pieSlices(ctx, data);
  if (!slices.length) return none(ctx, plot, '양수 값이 없습니다', 'No positive values');
  const counts = apportion(slices.map((s) => s.value), 100);
  const total = slices.reduce((a, s) => a + s.value, 0);
  const size = Math.min(plot.w, plot.h) / 10.4;
  const x0 = plot.x + (plot.w - size * 10) / 2;
  const y0 = plot.y + (plot.h - size * 10) / 2;
  let cell = 0;
  slices.forEach((sl, k) => {
    for (let c = 0; c < counts[k]; c++, cell++) {
      const col = cell % 10;
      const row = 9 - Math.floor(cell / 10);
      const x = x0 + col * size;
      const y = y0 + row * size;
      const tip = `${sl.name}: ${fmt(ctx, sl.value)} (${fmt(ctx, sl.value / total, { percent: true })})`;
      out.push(o.dots ? KIT.mark(ctx, 'circle', { cx: x + size / 2, cy: y + size / 2, r: size * 0.4, fill: sl.color, class: 'dot' }, tip, 0, data.order[sl.i]) : KIT.mark(ctx, 'rect', { x: x + size * 0.06, y: y + size * 0.06, width: size * 0.88, height: size * 0.88, rx: size * 0.12, fill: sl.color, class: 'cell' }, tip, 0, data.order[sl.i]));
    }
  });
}

function drawParliament(ctx, plot, data) {
  const { out, fs } = ctx;
  const slices = KIT.pieSlices(ctx, data);
  if (!slices.length) return none(ctx, plot, '양수 값이 없습니다', 'No positive values');
  const raw = slices.reduce((a, s) => a + s.value, 0);
  const seats = Math.max(10, Math.min(600, Math.round(raw)));
  const counts = apportion(slices.map((s) => s.value), seats);
  const R = Math.min(plot.w / 2, plot.h - 20 * fs) - 4 * fs;
  const cx = plot.x + plot.w / 2;
  const cy = plot.y + plot.h - 20 * fs;
  const r0 = R * 0.4;
  let rows = 1;
  while (rows < 40) {
    const cap = Array.from({ length: rows }, (_, k) => Math.floor((Math.PI * (r0 + ((R - r0) * (k + 0.5)) / rows)) / ((R - r0) / rows))).reduce((a, b) => a + b, 0);
    if (cap >= seats) break;
    rows++;
  }
  const rowRadii = Array.from({ length: rows }, (_, k) => r0 + ((R - r0) * (k + 0.5)) / rows);
  const caps = rowRadii.map((r) => Math.floor((Math.PI * r) / ((R - r0) / rows)));
  const capTotal = caps.reduce((a, b) => a + b, 0);
  const perRow = apportion(caps, seats).map((v, k) => Math.min(v, caps[k]));
  const spots = [];
  rowRadii.forEach((r, k) => { const n = perRow[k]; for (let j = 0; j < n; j++) { const a = Math.PI * (n > 1 ? j / (n - 1) : 0.5); spots.push({ a, x: cx - r * Math.cos(a), y: cy - r * Math.sin(a) }); } });
  spots.sort((p, q) => p.a - q.a);
  const dot = ((R - r0) / rows) * 0.38;
  let s = 0;
  slices.forEach((sl, k) => { for (let c = 0; c < counts[k] && s < spots.length; c++, s++) out.push(KIT.mark(ctx, 'circle', { cx: spots[s].x, cy: spots[s].y, r: dot, fill: sl.color, class: 'dot' }, `${sl.name}: ${counts[k]} (${fmt(ctx, sl.value)})`, 0, data.order[sl.i])); });
  KIT.label(ctx, cx, cy - 4 * fs, String(seats), { size: Math.min(30, r0 / fs / 2.2), weight: 800 });
  void capTotal;
}

function drawWordCloud(ctx, plot, data) {
  const { out, fs, o } = ctx;
  const slices = KIT.pieSlices(ctx, data).sort((a, b) => b.value - a.value).slice(0, 120);
  if (!slices.length) return none(ctx, plot, '양수 값이 없습니다', 'No positive values');
  const max = slices[0].value;
  const min = slices[slices.length - 1].value;
  const boxes = [];
  const cx = plot.x + plot.w / 2;
  const cy = plot.y + plot.h / 2;
  const big = Math.min(64, plot.h / 5 / fs);
  for (const sl of slices) {
    const size = (12 + (big - 12) * Math.sqrt((sl.value - min) / (max - min || 1))) * fs;
    const w = textWidth(sl.name, size) + 4;
    const h = size * 1.05;
    let spot = null;
    for (let t = 0; t < 3000 && !spot; t++) {
      const a = t * 0.3;
      const d = t * 1.1 * fs;
      const x = cx + d * Math.cos(a) * 1.4 - w / 2;
      const y = cy + d * Math.sin(a) * 0.8 - h / 2;
      if (x < plot.x || y < plot.y || x + w > plot.x + plot.w || y + h > plot.y + plot.h) continue;
      if (boxes.every((b) => x + w < b.x || b.x + b.w < x || y + h < b.y || b.y + b.h < y)) spot = { x, y };
    }
    if (!spot) continue;
    boxes.push({ ...spot, w, h });
    ctx.marks++;
    out.push(`<text class="mark word" data-s="0" data-r="${data.order[sl.i]}" data-tip="${KIT.esc(`${sl.name}: ${fmt(ctx, sl.value)}`)}" x="${KIT.r2(spot.x + w / 2)}" y="${KIT.r2(spot.y + h * 0.82)}" text-anchor="middle" font-size="${KIT.r2(size)}" font-weight="${size > 30 * fs ? 800 : 600}" fill="${sl.color}">${ctx.titles ? `<title>${KIT.esc(`${sl.name}: ${fmt(ctx, sl.value)}`)}</title>` : ''}${KIT.esc(sl.name)}</text>`);
  }
  void o;
}

function drawActivityRings(ctx, plot, data) {
  const { out, fs, o } = ctx;
  const s = data.series[0];
  const max = parseNumber(o.gaugeMax) ?? 100;
  const rows = data.categories.map((c, i) => ({ c, v: s.values[i] ?? 0, i })).slice(0, 8);
  const cx = plot.x + plot.w / 2;
  const cy = plot.y + plot.h / 2;
  const R = Math.min(plot.w, plot.h) / 2 - 6 * fs;
  const ring = (R * 0.75) / Math.max(1, rows.length);
  rows.forEach((r, k) => {
    const r1 = R - k * ring;
    const r0 = r1 - ring * 0.8;
    const color = seriesColor(o, r.i);
    out.push(`<path d="${KIT.arcPath(cx, cy, r0, r1, 0, Math.PI * 2)}" fill="${color}" fill-opacity="0.18"/>`);
    const t = Math.max(0.001, Math.min(1, r.v / (max || 1)));
    out.push(KIT.mark(ctx, 'path', { d: KIT.arcPath(cx, cy, r0, r1, 0, t * Math.PI * 2 - 0.0001), fill: color, class: 'slice' }, `${r.c}: ${fmt(ctx, r.v)} / ${fmt(ctx, max)} (${fmt(ctx, r.v / (max || 1), { percent: true })})`, 0, data.order[r.i]));
  });
  if (rows.length) KIT.label(ctx, cx, cy + 6 * fs, fmt(ctx, rows[0].v / (max || 1), { percent: true }), { size: Math.min(28, (R - rows.length * ring) / fs / 1.8), weight: 800 });
}

// ───────────────────────── distribution

/** Series names on a category axis, values on the value axis: the frame of violin and strip plots. */
function seriesAxes(ctx, plot, series) {
  const all = series.flatMap((s) => fin(s.values));
  const pad = (maxOf([...all]) - minOf([...all])) * 0.05 || 1;
  return KIT.axes(ctx, plot, { categories: series.map((s) => s.name), min: minOf([...all]) - pad, max: maxOf([...all]) + pad, forceZero: false });
}

function drawViolin(ctx, plot, data) {
  const { out, fs } = ctx;
  const r2 = KIT.r2;
  const series = KIT.visible(data.series).filter((s) => fin(s.values).length);
  if (!needSeries(ctx, plot, series)) return;
  const ax = seriesAxes(ctx, plot, series);
  series.forEach((s, k) => {
    const v = fin(s.values).sort((a, b) => a - b);
    const grid = Array.from({ length: 50 }, (_, i) => ax.vs.min + ((ax.vs.max - ax.vs.min) * i) / 49);
    const dens = kde(v, grid);
    const dmax = maxOf([...dens]) || 1;
    const half = ax.band.step * 0.42;
    const cx = ax.band.center(k);
    const right = grid.map((y, i) => [cx + (dens[i] / dmax) * half, ax.vs.map(y)]);
    const left = grid.map((y, i) => [cx - (dens[i] / dmax) * half, ax.vs.map(y)]).reverse();
    out.push(KIT.mark(ctx, 'path', { d: `${KIT.linePath(right, 'smooth')}L${KIT.linePath(left, 'smooth').slice(1)}Z`, fill: s.color, 'fill-opacity': 0.55, stroke: darken(s.color, 0.2), 'stroke-width': 1.2 * fs, class: 'area' }, `${s.name}: ${KIT.L(ctx, '중앙값', 'median')} ${fmt(ctx, quantile(v, 0.5))} (n=${v.length})`, s.index, ''));
    const q1 = ax.vs.map(quantile(v, 0.25));
    const q3 = ax.vs.map(quantile(v, 0.75));
    out.push(`<rect x="${r2(cx - 4 * fs)}" y="${r2(q3)}" width="${r2(8 * fs)}" height="${r2(Math.max(1, q1 - q3))}" fill="${darken(s.color, 0.45)}"/><circle cx="${r2(cx)}" cy="${r2(ax.vs.map(quantile(v, 0.5)))}" r="${r2(3.5 * fs)}" fill="#ffffff"/>`);
  });
}

function drawStripPlot(ctx, plot, data) {
  const { out, fs, o } = ctx;
  const r2 = KIT.r2;
  const series = KIT.visible(data.series);
  if (!needSeries(ctx, plot, series)) return;
  const ax = seriesAxes(ctx, plot, series);
  const r = Math.max(2, (Number(o.markerSize) || 4)) * fs;
  series.forEach((s, k) => {
    const cx = ax.band.center(k);
    const half = ax.band.step * 0.35;
    const placed = [];
    s.values.forEach((v, i) => {
      if (v == null) return;
      const y = ax.vs.map(v);
      let x = cx;
      if (o.rug) {
        out.push(KIT.mark(ctx, 'line', { x1: cx - half * 0.6, x2: cx + half * 0.6, y1: y, y2: y, stroke: s.color, 'stroke-width': 1.5 * fs, 'stroke-opacity': 0.7, class: 'line' }, KIT.tipOf(ctx, s.name, data.categories[i] || String(i + 1), v), s.index, data.order[i]));
        return;
      }
      if (o.swarm) {
        for (let step = 0; step < 200; step++) {
          const off = (step % 2 ? 1 : -1) * Math.ceil(step / 2) * r * 1.05;
          if (placed.every((p) => Math.hypot(p[0] - (cx + off), p[1] - y) >= r * 2)) { x = cx + off; break; }
        }
        x = Math.max(cx - half, Math.min(cx + half, x));
      } else x = cx + (hashOf(i, k) - 0.5) * half * 1.4;
      placed.push([x, y]);
      out.push(KIT.mark(ctx, 'circle', { cx: x, cy: y, r, fill: s.color, 'fill-opacity': 0.7, class: 'dot' }, KIT.tipOf(ctx, s.name, data.categories[i] || String(i + 1), v), s.index, data.order[i]));
    });
    const m = mean(fin(s.values));
    out.push(`<line class="mean" x1="${r2(cx - half)}" x2="${r2(cx + half)}" y1="${r2(ax.vs.map(m))}" y2="${r2(ax.vs.map(m))}" stroke="${ctx.colors.text}" stroke-width="${r2(2 * fs)}"/>`);
  });
}

function drawDensity(ctx, plot, data) {
  const { out, fs } = ctx;
  const series = KIT.visible(data.series).filter((s) => fin(s.values).length);
  if (!needSeries(ctx, plot, series)) return;
  const all = series.flatMap((s) => fin(s.values));
  const lo = minOf([...all]);
  const hi = maxOf([...all]);
  const pad = (hi - lo) * 0.15 || 1;
  const grid = Array.from({ length: 80 }, (_, i) => lo - pad + ((hi - lo + 2 * pad) * i) / 79);
  const curves = series.map((s) => kde(fin(s.values), grid));
  const ax = KIT.axes(ctx, plot, { categories: [], min: 0, max: maxOf([...curves.flat()]), numericX: { min: lo - pad, max: hi + pad } });
  series.forEach((s, k) => {
    const pts = grid.map((x, i) => [ax.xScale.map(x), ax.vs.map(curves[k][i])]);
    out.push(KIT.mark(ctx, 'path', { d: `${KIT.linePath(pts, 'smooth')}L${KIT.r2(pts[pts.length - 1][0])},${KIT.r2(ax.vs.map(0))}L${KIT.r2(pts[0][0])},${KIT.r2(ax.vs.map(0))}Z`, fill: s.color, 'fill-opacity': 0.3, stroke: s.color, 'stroke-width': 2 * fs, class: 'area' }, `${s.name}: ${KIT.L(ctx, '평균', 'mean')} ${fmt(ctx, mean(fin(s.values)))}`, s.index, ''));
  });
  if (!ctx.o.yTitle) KIT.drawAxisTitle(ctx, KIT.L(ctx, '밀도', 'Density'), plot.x + 8 * fs, (ax.top + ax.bottom) / 2, -90);
}

function drawEcdf(ctx, plot, data) {
  const { out, fs } = ctx;
  const series = KIT.visible(data.series).filter((s) => fin(s.values).length);
  if (!needSeries(ctx, plot, series)) return;
  const all = series.flatMap((s) => fin(s.values));
  const ax = KIT.axes(ctx, plot, { categories: [], min: 0, max: 1, percent: true, numericX: { min: minOf([...all]), max: maxOf([...all]) } });
  series.forEach((s) => {
    const v = fin(s.values).sort((a, b) => a - b);
    const pts = v.map((x, i) => [ax.xScale.map(x), ax.vs.map((i + 1) / v.length)]);
    pts.unshift([ax.xScale.map(v[0]), ax.vs.map(0)]);
    out.push(`<path class="mark line" data-s="${s.index}" data-r="" data-tip="${KIT.esc(s.name)}" d="${KIT.linePath(pts, 'step')}" fill="none" stroke="${s.color}" stroke-width="${KIT.r2(2.2 * fs)}"/>`);
    ctx.marks++;
    for (const p of [0.25, 0.5, 0.75]) { const x = quantile(v, p); out.push(KIT.mark(ctx, 'circle', { cx: ax.xScale.map(x), cy: ax.vs.map(p), r: 4 * fs, fill: s.color, class: 'dot' }, `${s.name}: ${fmt(ctx, p, { percent: true })} ≤ ${fmt(ctx, x)}`, s.index, '')); }
  });
}

/** Bins of the values of all series (nice edges, like the histogram's). */
function binsOf(ctx, all) {
  const lo = minOf([...all]);
  const hi = maxOf([...all]);
  const count = Number(ctx.o.bins) > 0 ? Math.min(60, Number(ctx.o.bins)) : Math.max(4, Math.min(24, Math.ceil(Math.log2(all.length) + 1)));
  const t = niceTicks(lo, hi, count);
  const edges = [];
  for (let v = t.min; v < t.max + t.step / 2; v += t.step) edges.push(Number(v.toPrecision(12)));
  if (edges.length < 2) edges.push(edges[0] + 1);
  return { edges, index: (v) => Math.min(edges.length - 2, Math.max(0, Math.floor((v - edges[0]) / t.step))) };
}

function drawDotHistogram(ctx, plot, data) {
  const { out, fs } = ctx;
  const series = KIT.visible(data.series).filter((s) => fin(s.values).length);
  if (!needSeries(ctx, plot, series)) return;
  const all = series.flatMap((s) => fin(s.values));
  const { edges, index } = binsOf(ctx, all);
  const n = edges.length - 1;
  const stacks = Array.from({ length: n }, () => []);
  series.forEach((s) => s.values.forEach((v, i) => { if (v != null && Number.isFinite(v)) stacks[index(v)].push({ s, v, row: data.order[i], cat: data.categories[i] }); }));
  const most = maxOf([1, ...stacks.map((x) => x.length)]);
  const cats = edges.slice(0, -1).map((b, k) => `${fmt(ctx, b)}–${fmt(ctx, edges[k + 1])}`);
  const ax = KIT.axes(ctx, plot, { categories: cats, min: 0, max: most });
  const r = Math.max(1.5, Math.min(ax.band.step * 0.42, (ax.vs.map(0) - ax.vs.map(1)) * 0.45));
  stacks.forEach((list, k) => list.forEach((d, j) => out.push(KIT.mark(ctx, 'circle', { cx: ax.band.center(k), cy: ax.vs.map(j + 0.5), r, fill: d.s.color, 'fill-opacity': 0.85, class: 'dot' }, `${series.length > 1 ? `${d.s.name} · ` : ''}${cats[k]}: ${fmt(ctx, d.v)}`, d.s.index, d.row))));
  if (!ctx.o.yTitle) KIT.drawAxisTitle(ctx, KIT.L(ctx, '개수', 'Count'), plot.x + 8 * fs, (ax.top + ax.bottom) / 2, -90);
}

function drawRidgeline(ctx, plot, data) {
  const { out, fs } = ctx;
  const r2 = KIT.r2;
  const series = KIT.visible(data.series).filter((s) => fin(s.values).length);
  if (!needSeries(ctx, plot, series)) return;
  const all = series.flatMap((s) => fin(s.values));
  const lo = minOf([...all]);
  const hi = maxOf([...all]);
  const pad = (hi - lo) * 0.1 || 1;
  const t = niceTicks(lo - pad, hi + pad, Math.max(3, Math.round(plot.w / (110 * fs))));
  const grid = Array.from({ length: 90 }, (_, i) => t.min + ((t.max - t.min) * i) / 89);
  const curves = series.map((s) => kde(fin(s.values), grid));
  const peak = maxOf([...curves.flat()]) || 1;
  const nameW = Math.min(plot.w * 0.22, maxOf([...series.map((s) => textWidth(s.name, 12 * fs))]) + 14 * fs);
  const x0 = plot.x + nameW;
  const x1 = plot.x + plot.w - 8 * fs;
  const bottom = plot.y + plot.h - 22 * fs;
  const top = plot.y + 8 * fs;
  const step = (bottom - top) / (series.length + 0.8);
  const height = step * 1.8;
  const mapX = (v) => x0 + ((v - t.min) / (t.max - t.min || 1)) * (x1 - x0);
  for (const v of t.ticks) {
    out.push(`<line class="grid" x1="${r2(mapX(v))}" x2="${r2(mapX(v))}" y1="${r2(top)}" y2="${r2(bottom)}" stroke="${ctx.colors.grid}"${ctx.colors.gridDash ? ` stroke-dasharray="${ctx.colors.gridDash}"` : ''}/>`);
    KIT.label(ctx, mapX(v), bottom + 15 * fs, fmt(ctx, v, { tick: true }), { size: 10.5, color: ctx.colors.muted });
  }
  // Back to front: the first series is the top ridge, drawn last so it stays on top of the one below.
  series.map((s, k) => ({ s, k })).reverse().forEach(({ s, k }) => {
    const base = top + step * (k + 1.4);
    const pts = grid.map((x, i) => [mapX(x), base - (curves[k][i] / peak) * height]);
    const d = `M${r2(pts[0][0])},${r2(base)}L${KIT.linePath(pts, 'smooth').slice(1)}L${r2(pts[pts.length - 1][0])},${r2(base)}Z`;
    out.push(KIT.mark(ctx, 'path', { d, fill: s.color, 'fill-opacity': 0.75, stroke: bg(ctx), 'stroke-width': 1.5 * fs, class: 'area' }, `${s.name}: ${KIT.L(ctx, '평균', 'mean')} ${fmt(ctx, mean(fin(s.values)))} (n=${fin(s.values).length})`, s.index, ''));
    out.push(`<line x1="${r2(x0)}" x2="${r2(x1)}" y1="${r2(base)}" y2="${r2(base)}" stroke="${ctx.colors.axis}" stroke-width="${r2(0.8 * fs)}"/>`);
    KIT.label(ctx, x0 - 8 * fs, base - 3 * fs, fitText(s.name, nameW - 10 * fs, 12 * fs), { anchor: 'end', size: 12, weight: 600 });
  });
}

function drawPunchCard(ctx, plot, data) {
  const { out, fs } = ctx;
  const series = KIT.visible(data.series);
  if (!needSeries(ctx, plot, series)) return;
  const all = fin(series.flatMap((s) => s.values)).map(Math.abs);
  const max = maxOf([...all, 1e-9]);
  const leftW = Math.min(plot.w * 0.25, maxOf([...data.categories.map((c) => textWidth(c, 11 * fs))]) + 12 * fs);
  const topH = 22 * fs;
  const cw = (plot.w - leftW) / series.length;
  const ch = (plot.h - topH) / Math.max(1, data.categories.length);
  const rmax = Math.min(cw, ch) * 0.45;
  series.forEach((s, k) => KIT.label(ctx, plot.x + leftW + k * cw + cw / 2, plot.y + 14 * fs, fitText(s.name, cw - 4, 11 * fs), { size: 11, weight: 600 }));
  data.categories.forEach((cat, i) => {
    const y = plot.y + topH + i * ch + ch / 2;
    KIT.label(ctx, plot.x + leftW - 8 * fs, y + 4 * fs, fitText(cat, leftW - 10 * fs, 11 * fs), { anchor: 'end', size: 11 });
    out.push(`<line class="grid" x1="${KIT.r2(plot.x + leftW)}" x2="${KIT.r2(plot.x + plot.w)}" y1="${KIT.r2(y)}" y2="${KIT.r2(y)}" stroke="${ctx.colors.grid}"/>`);
    series.forEach((s, k) => {
      const v = s.values[i];
      if (v == null) return;
      out.push(KIT.mark(ctx, 'circle', { cx: plot.x + leftW + k * cw + cw / 2, cy: y, r: Math.max(1.5, Math.sqrt(Math.abs(v) / max) * rmax), fill: s.color, 'fill-opacity': 0.8, class: 'dot' }, KIT.tipOf(ctx, s.name, cat, v), s.index, data.order[i]));
    });
  });
}

function pearson(a, b) {
  const pairs = a.map((v, i) => [v, b[i]]).filter(([x, y]) => x != null && y != null);
  if (pairs.length < 2) return null;
  const mx = mean(pairs.map((p) => p[0]));
  const my = mean(pairs.map((p) => p[1]));
  let sxy = 0; let sxx = 0; let syy = 0;
  for (const [x, y] of pairs) { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; syy += (y - my) ** 2; }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null;
}

function drawCorrelation(ctx, plot, data) {
  const { out, fs } = ctx;
  const series = KIT.visible(data.series);
  if (!needSeries(ctx, plot, series)) return;
  const n = series.length;
  const labelW = Math.min(plot.w * 0.25, maxOf([...series.map((s) => textWidth(s.name, 11 * fs))]) + 12 * fs);
  const size = Math.min((plot.w - labelW) / n, (plot.h - labelW * 0.6) / n);
  const x0 = plot.x + labelW;
  const y0 = plot.y + Math.min(labelW * 0.6, 60 * fs);
  series.forEach((s, k) => {
    KIT.label(ctx, x0 - 6 * fs, y0 + k * size + size / 2 + 4 * fs, fitText(s.name, labelW - 8 * fs, 11 * fs), { anchor: 'end', size: 11 });
    KIT.label(ctx, x0 + k * size + size / 2, y0 - 6 * fs, fitText(s.name, size - 2, 10 * fs), { size: 10 });
  });
  series.forEach((a, i) => series.forEach((b, j) => {
    const r = i === j ? 1 : pearson(a.values, b.values);
    const color = r == null ? ctx.colors.grid : rampColor('diverging', (r + 1) / 2);
    out.push(KIT.mark(ctx, 'rect', { x: x0 + j * size + 1, y: y0 + i * size + 1, width: size - 2, height: size - 2, rx: 2 * fs, fill: color, class: 'cell' }, `${a.name} × ${b.name}: r = ${r == null ? '—' : r.toFixed(3)}`, i, ''));
    if (r != null && size > 26 * fs) KIT.label(ctx, x0 + j * size + size / 2, y0 + i * size + size / 2 + 4 * fs, r.toFixed(2), { size: Math.min(13, size / fs / 3.5), color: readableOn(color), weight: 600 });
  }));
}

function drawScatterMatrix(ctx, plot, data) {
  const { out, fs, o } = ctx;
  const r2 = KIT.r2;
  const series = KIT.visible(data.series).slice(0, 6);
  if (!needSeries(ctx, plot, series)) return;
  const n = series.length;
  const size = Math.min(plot.w, plot.h) / n;
  const x0 = plot.x + (plot.w - size * n) / 2;
  const y0 = plot.y + (plot.h - size * n) / 2;
  const ranges = series.map((s) => { const v = fin(s.values); return [minOf([...v]), maxOf([...v])]; });
  series.forEach((a, i) => series.forEach((b, j) => {
    const x = x0 + j * size;
    const y = y0 + i * size;
    out.push(`<rect x="${r2(x + 2)}" y="${r2(y + 2)}" width="${r2(size - 4)}" height="${r2(size - 4)}" fill="none" stroke="${ctx.colors.grid}"/>`);
    if (i === j) {
      KIT.label(ctx, x + size / 2, y + 18 * fs, fitText(a.name, size - 8, 12 * fs), { size: 12, weight: 700 });
      // The diagonal: the variable's own values as a strip of dots (row order across, value up).
      const vals = a.values.map((v, k) => [v, k]).filter(([v]) => v != null);
      vals.forEach(([v, k]) => out.push(KIT.mark(ctx, 'circle', { cx: x + 8 + (k / Math.max(1, a.values.length - 1)) * (size - 16), cy: y + size - 8 - ((v - ranges[i][0]) / (ranges[i][1] - ranges[i][0] || 1)) * (size - 36 * fs), r: Math.max(1.5, 2.2 * fs), fill: seriesColor(o, i), 'fill-opacity': 0.5, class: 'dot' }, `${a.name}: ${fmt(ctx, v)}`, i, data.order[k])));
      return;
    }
    const mapX = (v) => x + 6 + ((v - ranges[j][0]) / (ranges[j][1] - ranges[j][0] || 1)) * (size - 12);
    const mapY = (v) => y + size - 6 - ((v - ranges[i][0]) / (ranges[i][1] - ranges[i][0] || 1)) * (size - 12);
    b.values.forEach((bv, k) => { const av = a.values[k]; if (av == null || bv == null) return; out.push(KIT.mark(ctx, 'circle', { cx: mapX(bv), cy: mapY(av), r: Math.max(1.5, 2.4 * fs), fill: seriesColor(o, i), 'fill-opacity': 0.65, class: 'dot' }, `${b.name} ${fmt(ctx, bv)} · ${a.name} ${fmt(ctx, av)}`, i, data.order[k])); });
    const fit = linearFit(b.values.map((bv, k) => (bv == null || a.values[k] == null ? null : [bv, a.values[k]])).filter(Boolean));
    if (fit) out.push(`<line class="trend" x1="${r2(mapX(ranges[j][0]))}" y1="${r2(mapY(fit.slope * ranges[j][0] + fit.intercept))}" x2="${r2(mapX(ranges[j][1]))}" y2="${r2(mapY(fit.slope * ranges[j][1] + fit.intercept))}" stroke="${ctx.colors.axis}" stroke-dasharray="4 3"/>`);
  }));
}

/** A calendar of a table without dates: one cell per row in row order, seven to a column, coloured by value. */
function drawRowCalendar(ctx, plot, data) {
  const { out, fs, o } = ctx;
  const s = data.series[0];
  const rows = data.categories.map((c, i) => ({ c, v: s?.values[i], row: data.order[i] })).filter((d) => d.v != null);
  if (!rows.length) return none(ctx, plot, '숫자가 없습니다', 'No numbers');
  const cols = Math.ceil(rows.length / 7);
  const size = Math.min((plot.w - 40 * fs) / cols, (plot.h - 40 * fs) / 7, 46 * fs);
  const x0 = plot.x + (plot.w - cols * size) / 2;
  const y0 = plot.y + (plot.h - 7 * size) / 2;
  const vals = rows.map((d) => d.v);
  const lo = minOf([...vals]);
  const hi = maxOf([...vals]);
  rows.forEach((d, k) => {
    const tv = (d.v - lo) / (hi - lo || 1);
    const color = ctx.colors.dark ? mix(lighten(ctx.colors.base, 0.08), rampColor(o.ramp || 'greens', 0.75), 0.12 + 0.88 * tv) : rampColor(o.ramp || 'greens', tv);
    out.push(KIT.mark(ctx, 'rect', { x: x0 + Math.floor(k / 7) * size + 1, y: y0 + (k % 7) * size + 1, width: size - 2, height: size - 2, rx: Math.min(3 * fs, size / 4), fill: color, class: 'cell' }, `${d.c}: ${fmt(ctx, d.v)}`, 0, d.row));
    if (size > 34 * fs) KIT.label(ctx, x0 + Math.floor(k / 7) * size + size / 2, y0 + (k % 7) * size + size / 2 + 4 * fs, fitText(d.c, size - 6, 9.5 * fs), { size: 9.5, color: readableOn(color) });
  });
  KIT.label(ctx, plot.x + plot.w / 2, y0 + 7 * size + 16 * fs, KIT.L(ctx, '날짜 열이 없어 행 순서대로 칸을 놓았습니다', 'No date column: one cell per row, in row order'), { size: 10.5, color: ctx.colors.muted });
}

function drawCalendarHeatmap(ctx, plot, data) {
  const { out, fs, o } = ctx;
  const s = data.series[0];
  const days = data.categories.map((c, i) => ({ t: (/^\d{5}(\.\d+)?$/.test(c) ? (Number(c) - 25569) * 86400000 : parseDate(c)), v: s.values[i], row: data.order[i], c })).filter((d) => d.t != null && d.v != null);
  if (!days.length) return drawRowCalendar(ctx, plot, data);
  const day = 86400000;
  const first = minOf([...days.map((d) => d.t)]);
  const last = maxOf([...days.map((d) => d.t)]);
  const start = first - new Date(first).getUTCDay() * day;
  const weeks = Math.floor((last - start) / day / 7) + 1;
  const left = 30 * fs;
  const size = Math.min((plot.w - left) / weeks, (plot.h - 40 * fs) / 7, 40 * fs);
  const top = Math.max(20 * fs, (plot.h - 7 * size) / 2);
  const vals = days.map((d) => d.v);
  const lo = minOf([...vals]);
  const hi = maxOf([...vals]);
  const names = ctx.lang === 'en' ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] : ['일', '월', '화', '수', '목', '금', '토'];
  [1, 3, 5].forEach((d) => KIT.label(ctx, plot.x + left - 6 * fs, plot.y + top + d * size + size * 0.7, names[d], { anchor: 'end', size: 10, color: ctx.colors.muted }));
  let lastMonth = -1;
  for (const d of days) {
    const idx = Math.round((d.t - start) / day);
    const w = Math.floor(idx / 7);
    const dow = idx % 7;
    const x = plot.x + left + w * size;
    const y = plot.y + top + dow * size;
    const tv = (d.v - lo) / (hi - lo || 1);
    // On dark paper the empty end of the ramp fades into the background instead of glaring white.
    const color = ctx.colors.dark ? mix(lighten(ctx.colors.base, 0.08), rampColor(o.ramp || 'greens', 0.75), 0.12 + 0.88 * tv) : rampColor(o.ramp || 'greens', tv);
    out.push(KIT.mark(ctx, 'rect', { x: x + 1, y: y + 1, width: size - 2, height: size - 2, rx: Math.min(3 * fs, size / 4), fill: color, class: 'cell' }, `${new Date(d.t).toISOString().slice(0, 10)}: ${fmt(ctx, d.v)}`, 0, d.row));
    const month = new Date(d.t).getUTCMonth();
    if (month !== lastMonth && dow < 3) { lastMonth = month; KIT.label(ctx, x, plot.y + top - 8 * fs, ctx.lang === 'en' ? ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][month] : `${month + 1}월`, { anchor: 'start', size: 10, color: ctx.colors.muted }); }
  }
}

// ───────────────────────── relations and flows

/** Links of a flow table: { nodes: [name], links: [{ a, b, v, row }] } (positive values, two different nodes). */
function flows(ctx, data) {
  const src = roleLabels(ctx, data, 'source');
  const dst = roleLabels(ctx, data, 'target');
  const s = data.series[0];
  let links = src.map((a, i) => ({ a, b: dst[i], v: s?.values[i], row: data.order[i] })).filter((l) => l.a && l.b && l.a !== l.b && l.v > 0);
  if (!links.length) links = KIT.fallbackFlows(ctx, data);
  const nodes = [...new Set(links.flatMap((l) => [l.a, l.b]))];
  return { nodes, links };
}

function drawChord(ctx, plot, data) {
  const { out, fs, o } = ctx;
  const r2 = KIT.r2;
  const { nodes, links } = flows(ctx, data);
  if (!links.length) return none(ctx, plot, '출발·도착·값 열을 고르세요', 'Choose source, target and value columns');
  const weight = nodes.map((n) => links.reduce((a, l) => a + (l.a === n || l.b === n ? l.v : 0), 0));
  const total = weight.reduce((a, b) => a + b, 0);
  const gap = 0.04;
  const cx = plot.x + plot.w / 2;
  const cy = plot.y + plot.h / 2;
  const R = Math.min(plot.w, plot.h) / 2 - 40 * fs;
  const span = Math.PI * 2 - gap * nodes.length;
  let a = 0;
  const arcs = nodes.map((n, i) => { const da = (weight[i] / total) * span; const arc = { a0: a, a1: a + da, used: a }; a += da + gap; return arc; });
  for (const l of links) {
    const ia = nodes.indexOf(l.a);
    const ib = nodes.indexOf(l.b);
    const wa = (l.v / total) * span;
    const pa = [arcs[ia].used, arcs[ia].used + wa]; arcs[ia].used += wa;
    const pb = [arcs[ib].used, arcs[ib].used + wa]; arcs[ib].used += wa;
    const [ax0, ay0] = KIT.polar(cx, cy, R, pa[0]); const [ax1, ay1] = KIT.polar(cx, cy, R, pa[1]);
    const [bx0, by0] = KIT.polar(cx, cy, R, pb[0]); const [bx1, by1] = KIT.polar(cx, cy, R, pb[1]);
    const d = `M${r2(ax0)},${r2(ay0)}A${r2(R)},${r2(R)} 0 0 1 ${r2(ax1)},${r2(ay1)}Q${r2(cx)},${r2(cy)} ${r2(bx0)},${r2(by0)}A${r2(R)},${r2(R)} 0 0 1 ${r2(bx1)},${r2(by1)}Q${r2(cx)},${r2(cy)} ${r2(ax0)},${r2(ay0)}Z`;
    out.push(KIT.mark(ctx, 'path', { d, fill: seriesColor(o, ia), 'fill-opacity': 0.55, stroke: 'none', class: 'link' }, `${l.a} → ${l.b}: ${fmt(ctx, l.v)}`, 0, l.row));
  }
  nodes.forEach((n, i) => {
    out.push(KIT.mark(ctx, 'path', { d: KIT.arcPath(cx, cy, R + 2 * fs, R + 12 * fs, arcs[i].a0, arcs[i].a1), fill: seriesColor(o, i), class: 'node' }, `${n}: ${fmt(ctx, weight[i])}`, 0, ''));
    const mid = (arcs[i].a0 + arcs[i].a1) / 2;
    const [lx, ly] = KIT.polar(cx, cy, R + 20 * fs, mid);
    KIT.label(ctx, lx, ly + 4 * fs, fitText(n, 90 * fs, 11 * fs), { size: 11, weight: 600, anchor: Math.abs(Math.sin(mid)) < 0.2 ? 'middle' : Math.sin(mid) > 0 ? 'start' : 'end' });
  });
}

function drawArcDiagram(ctx, plot, data) {
  const { out, fs, o } = ctx;
  const r2 = KIT.r2;
  const { nodes, links } = flows(ctx, data);
  if (!links.length) return none(ctx, plot, '출발·도착·값 열을 고르세요', 'Choose source, target and value columns');
  const max = maxOf([...links.map((l) => l.v)]);
  const y = plot.y + plot.h * 0.75;
  const x = (i) => plot.x + 20 * fs + (i / Math.max(1, nodes.length - 1)) * (plot.w - 40 * fs);
  for (const l of links) {
    const xa = x(nodes.indexOf(l.a));
    const xb = x(nodes.indexOf(l.b));
    const h = Math.min(plot.h * 0.7, Math.abs(xb - xa) / 2);
    out.push(KIT.mark(ctx, 'path', { d: `M${r2(xa)},${r2(y)}C${r2(xa)},${r2(y - h * 1.33)} ${r2(xb)},${r2(y - h * 1.33)} ${r2(xb)},${r2(y)}`, fill: 'none', stroke: seriesColor(o, nodes.indexOf(l.a)), 'stroke-opacity': 0.55, 'stroke-width': Math.max(1, (l.v / max) * 10 * fs), class: 'link' }, `${l.a} → ${l.b}: ${fmt(ctx, l.v)}`, 0, l.row));
  }
  nodes.forEach((n, i) => {
    out.push(KIT.mark(ctx, 'circle', { cx: x(i), cy: y, r: 6 * fs, fill: seriesColor(o, i), class: 'node' }, n, 0, ''));
    out.push(`<text x="${r2(x(i))}" y="${r2(y + 14 * fs)}" font-size="${r2(11 * fs)}" fill="${ctx.colors.text}" text-anchor="end" transform="rotate(-40 ${r2(x(i))} ${r2(y + 14 * fs)})">${KIT.esc(fitText(n, 120 * fs, 11 * fs))}</text>`);
  });
}

function drawNetwork(ctx, plot, data) {
  const { out, fs, o } = ctx;
  const { nodes, links } = flows(ctx, data);
  if (!links.length) return none(ctx, plot, '출발·도착·값 열을 고르세요', 'Choose source, target and value columns');
  const n = nodes.length;
  const pos = nodes.map((_, i) => ({ x: Math.cos((i / n) * Math.PI * 2), y: Math.sin((i / n) * Math.PI * 2) }));
  const idx = links.map((l) => [nodes.indexOf(l.a), nodes.indexOf(l.b)]);
  // A few hundred steps of a simple force layout (repulsion, springs), deterministic from the circle.
  for (let it = 0; it < 300; it++) {
    const f = pos.map(() => ({ x: 0, y: 0 }));
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { const dx = pos[i].x - pos[j].x; const dy = pos[i].y - pos[j].y; const d2 = Math.max(0.01, dx * dx + dy * dy); const k = 0.02 / d2; f[i].x += dx * k; f[i].y += dy * k; f[j].x -= dx * k; f[j].y -= dy * k; }
    for (const [a, b] of idx) { const dx = pos[b].x - pos[a].x; const dy = pos[b].y - pos[a].y; const d = Math.hypot(dx, dy) || 0.01; const k = (d - 0.5) * 0.05; f[a].x += (dx / d) * k; f[a].y += (dy / d) * k; f[b].x -= (dx / d) * k; f[b].y -= (dy / d) * k; }
    pos.forEach((p, i) => { p.x += f[i].x - p.x * 0.005; p.y += f[i].y - p.y * 0.005; });
  }
  const xs = pos.map((p) => p.x);
  const ys = pos.map((p) => p.y);
  const sx = (v) => plot.x + 40 * fs + ((v - minOf([...xs])) / (maxOf([...xs]) - minOf([...xs]) || 1)) * (plot.w - 80 * fs);
  const sy = (v) => plot.y + 20 * fs + ((v - minOf([...ys])) / (maxOf([...ys]) - minOf([...ys]) || 1)) * (plot.h - 40 * fs);
  const max = maxOf([...links.map((l) => l.v)]);
  const weight = nodes.map((nm) => links.reduce((a, l) => a + (l.a === nm || l.b === nm ? l.v : 0), 0));
  const wmax = maxOf([...weight]);
  links.forEach((l, k) => { const [a, b] = idx[k]; out.push(KIT.mark(ctx, 'line', { x1: sx(pos[a].x), y1: sy(pos[a].y), x2: sx(pos[b].x), y2: sy(pos[b].y), stroke: ctx.colors.axis, 'stroke-opacity': 0.6, 'stroke-width': Math.max(1, (l.v / max) * 6 * fs), class: 'link' }, `${l.a} — ${l.b}: ${fmt(ctx, l.v)}`, 0, l.row)); });
  nodes.forEach((nm, i) => {
    const r = (6 + 12 * Math.sqrt(weight[i] / wmax)) * fs;
    out.push(KIT.mark(ctx, 'circle', { cx: sx(pos[i].x), cy: sy(pos[i].y), r, fill: seriesColor(o, i), stroke: bg(ctx), 'stroke-width': 2 * fs, class: 'node' }, `${nm}: ${fmt(ctx, weight[i])}`, 0, ''));
    KIT.label(ctx, sx(pos[i].x), sy(pos[i].y) + r + 12 * fs, fitText(nm, 110 * fs, 11 * fs), { size: 11, weight: 600 });
  });
}

function drawTree(ctx, plot, data) {
  const { out, fs, o } = ctx;
  const r2 = KIT.r2;
  const groups = KIT.hierarchy(ctx, data);
  const leaves = groups.flatMap((g, gi) => g.children.map((c) => ({ ...c, g, gi })));
  if (!leaves.length) return none(ctx, plot, '양수 값이 없습니다', 'No positive values');
  const grouped = groups.length > 1 || groups[0].name;
  const cols = grouped ? [plot.x + 20 * fs, plot.x + plot.w * 0.38, plot.x + plot.w * 0.7] : [plot.x + 20 * fs, plot.x + plot.w * 0.55];
  const step = plot.h / leaves.length;
  const leafY = (k) => plot.y + step * (k + 0.5);
  const rootY = plot.y + plot.h / 2;
  const total = groups.reduce((a, g) => a + g.value, 0);
  const curve = (x1, y1, x2, y2) => `M${r2(x1)},${r2(y1)}C${r2((x1 + x2) / 2)},${r2(y1)} ${r2((x1 + x2) / 2)},${r2(y2)} ${r2(x2)},${r2(y2)}`;
  let k = 0;
  groups.forEach((g, gi) => {
    const first = k;
    const color = seriesColor(o, gi);
    const gy = (leafY(first) + leafY(first + g.children.length - 1)) / 2;
    const parentX = grouped ? cols[1] : cols[0];
    if (grouped) out.push(`<path d="${curve(cols[0], rootY, cols[1], gy)}" fill="none" stroke="${ctx.colors.axis}" stroke-width="${r2(1.5 * fs)}"/>`);
    g.children.forEach((c) => {
      const y = leafY(k++);
      const lx = grouped ? cols[2] : cols[1];
      out.push(`<path d="${curve(parentX, grouped ? gy : rootY, lx, y)}" fill="none" stroke="${lighten(color, 0.2)}" stroke-width="${r2(1.5 * fs)}"/>`);
      out.push(KIT.mark(ctx, 'circle', { cx: lx, cy: y, r: 5 * fs, fill: color, class: 'node' }, `${grouped ? `${g.name} › ` : ''}${c.name}: ${fmt(ctx, c.value)}`, 0, c.row));
      KIT.label(ctx, lx + 10 * fs, y + 4 * fs, `${fitText(c.name, plot.x + plot.w - lx - 70 * fs, 11 * fs)}${o.dataLabels ? ` (${fmt(ctx, c.value)})` : ''}`, { anchor: 'start', size: 11 });
    });
    if (grouped) { out.push(KIT.mark(ctx, 'circle', { cx: cols[1], cy: gy, r: 7 * fs, fill: color, class: 'node' }, `${g.name}: ${fmt(ctx, g.value)}`, 0, '')); KIT.label(ctx, cols[1], gy - 11 * fs, fitText(g.name, plot.w * 0.25, 11.5 * fs), { size: 11.5, weight: 700 }); }
  });
  out.push(`<circle cx="${r2(cols[0])}" cy="${r2(rootY)}" r="${r2(8 * fs)}" fill="${ctx.colors.text}"/>`);
  KIT.label(ctx, cols[0], rootY - 13 * fs, fmt(ctx, total), { size: 11, weight: 700, anchor: 'start' });
}

// ───────────────────────── finance and time

function drawPriceBand(ctx, plot, data) {
  const { out, fs, o } = ctx;
  const m = ctx.chart.mapping;
  const own = m.high != null && m.low != null && m.close != null;
  const derived = own ? null : KIT.derivedOhlc(ctx, data);
  const high = own ? roleNumbers(ctx, data, 'high') : derived.high;
  const low = own ? roleNumbers(ctx, data, 'low') : derived.low;
  const close = own ? roleNumbers(ctx, data, 'close') : derived.close;
  const all = fin([...high, ...low, ...close]);
  if (!all.length) return none(ctx, plot, '고가·저가·종가 열을 고르세요', 'Choose high, low and close columns');
  const ax = KIT.axes(ctx, plot, { categories: data.categories, min: minOf([...all]), max: maxOf([...all]), forceZero: false });
  const color = seriesColor(o, 0);
  const top = high.map((v, i) => [ax.band.center(i), ax.vs.map(v ?? 0)]);
  const bottom = low.map((v, i) => [ax.band.center(i), ax.vs.map(v ?? 0)]).reverse();
  out.push(KIT.mark(ctx, 'path', { d: `${KIT.linePath(top, 'line')}L${KIT.linePath(bottom, 'line').slice(1)}Z`, fill: color, 'fill-opacity': 0.22, stroke: 'none', class: 'area' }, KIT.L(ctx, '고가–저가', 'High–low'), 0, ''));
  const pts = close.map((v, i) => (v == null ? null : [ax.band.center(i), ax.vs.map(v), i])).filter(Boolean);
  out.push(`<path class="mark line" data-s="0" data-r="" data-tip="${KIT.esc(KIT.L(ctx, '종가', 'Close'))}" d="${KIT.linePath(pts, 'line')}" fill="none" stroke="${darken(color, 0.2)}" stroke-width="${KIT.r2(2.2 * fs)}"/>`);
  ctx.marks++;
  for (const [x, y, i] of pts) out.push(KIT.mark(ctx, 'circle', { cx: x, cy: y, r: 6 * fs, fill: 'transparent', class: 'hit' }, `${data.categories[i]}: ${KIT.L(ctx, '종가', 'close')} ${fmt(ctx, close[i])} (${fmt(ctx, low[i])}–${fmt(ctx, high[i])})`, 0, data.order[i]));
}

function drawBollinger(ctx, plot, data) {
  const { out, fs, o } = ctx;
  const s = data.series[0];
  const w = Math.max(2, Math.round(Number(o.movingAverage) || 5));
  const bands = s.values.map((_, i) => { const win = fin(s.values.slice(Math.max(0, i - w + 1), i + 1)); if (i < w - 1 || win.length < 2) return null; const m = mean(win); const sd = stdev(win); return { m, hi: m + 2 * sd, lo: m - 2 * sd }; });
  const all = fin([...s.values, ...bands.flatMap((b) => (b ? [b.hi, b.lo] : []))]);
  if (!all.length) return none(ctx, plot, '숫자가 없습니다', 'No numbers');
  const ax = KIT.axes(ctx, plot, { categories: data.categories, min: minOf([...all]), max: maxOf([...all]), forceZero: false });
  const color = seriesColor(o, 0);
  const idx = bands.map((b, i) => (b ? i : -1)).filter((i) => i >= 0);
  if (idx.length > 1) {
    const top = idx.map((i) => [ax.band.center(i), ax.vs.map(bands[i].hi)]);
    const bottom = idx.map((i) => [ax.band.center(i), ax.vs.map(bands[i].lo)]).reverse();
    out.push(`<path class="band" d="${KIT.linePath(top, 'smooth')}L${KIT.linePath(bottom, 'smooth').slice(1)}Z" fill="${color}" fill-opacity="0.15"/>`);
    out.push(`<path class="ma" d="${KIT.linePath(idx.map((i) => [ax.band.center(i), ax.vs.map(bands[i].m)]), 'smooth')}" fill="none" stroke="${seriesColor(o, 1)}" stroke-width="${KIT.r2(1.6 * fs)}" stroke-dasharray="5 4"/>`);
  }
  const pts = s.values.map((v, i) => (v == null ? null : [ax.band.center(i), ax.vs.map(v), i])).filter(Boolean);
  out.push(`<path class="mark line" data-s="0" data-r="" data-tip="${KIT.esc(s.name)}" d="${KIT.linePath(pts, 'line')}" fill="none" stroke="${color}" stroke-width="${KIT.r2(2.2 * fs)}"/>`);
  ctx.marks++;
  for (const [x, y, i] of pts) {
    const outside = bands[i] && (s.values[i] > bands[i].hi || s.values[i] < bands[i].lo);
    out.push(KIT.mark(ctx, 'circle', { cx: x, cy: y, r: (outside ? 4.5 : 6) * fs, fill: outside ? o.downColor : 'transparent', class: outside ? 'dot' : 'hit' }, KIT.tipOf(ctx, s.name, data.categories[i], s.values[i]), 0, data.order[i]));
  }
}

/** A cell as a time stamp: a number as it is, a date as ms, an Excel serial as a date. */
const timeOf = (v) => { if (v == null || v === '') return null; if (typeof v === 'number') return v; const d = parseDate(v); if (d != null) return d; const n = parseNumber(v); return n; };

function drawGantt(ctx, plot, data) {
  const { out, fs, o } = ctx;
  const r2 = KIT.r2;
  const m = ctx.chart.mapping;
  const cells = (c) => data.order.map((i) => (c == null ? null : timeOf(ctx.table.rows[i][c])));
  let start = cells(m.start);
  let end = cells(m.end);
  let isDate = data.order.some((i) => parseDate(ctx.table.rows[i]?.[m.start]) != null);
  if (!fin(start).length || !fin(end).length) {
    // One number column (or none): each task lasts its value (or one unit) and starts when the one before ends.
    const lengths = (fin(start).length ? start : fin(end).length ? end : start.map(() => 1)).map((v) => (v == null ? 0 : Math.abs(v)));
    let at = 0;
    start = lengths.map((d) => { const a = at; at += d; return a; });
    end = start.map((a, i) => a + lengths[i]);
    isDate = false;
  }
  const groups = roleLabels(ctx, data, 'group');
  const groupNames = [...new Set(groups.filter(Boolean))];
  const all = fin([...start, ...end]);
  if (!all.length) return none(ctx, plot, '시작·끝 열(날짜 또는 숫자)을 고르세요', 'Choose start and end columns (dates or numbers)');
  const lo = minOf([...all]);
  const hi = maxOf([...all]);
  const labelW = Math.min(plot.w * 0.3, maxOf([...data.categories.map((c) => textWidth(c, 11.5 * fs))]) + 14 * fs);
  const x0 = plot.x + labelW;
  const x1 = plot.x + plot.w - 10 * fs;
  const top = plot.y + 22 * fs;
  const n = data.categories.length;
  const step = (plot.y + plot.h - top) / Math.max(1, n);
  const map = (v) => x0 + ((v - lo) / (hi - lo || 1)) * (x1 - x0);
  const ticks = niceTicks(lo, hi, Math.max(2, Math.round((x1 - x0) / (110 * fs)))).ticks.filter((t) => t >= lo && t <= hi);
  for (const t of ticks) {
    out.push(`<line class="grid" x1="${r2(map(t))}" x2="${r2(map(t))}" y1="${r2(top)}" y2="${r2(plot.y + plot.h)}" stroke="${ctx.colors.grid}"/>`);
    KIT.label(ctx, map(t), plot.y + 12 * fs, isDate ? new Date(t).toISOString().slice(5, 10) : fmt(ctx, t, { tick: true }), { size: 10, color: ctx.colors.muted });
  }
  data.categories.forEach((cat, i) => {
    const y = top + i * step;
    KIT.label(ctx, x0 - 8 * fs, y + step / 2 + 4 * fs, fitText(cat, labelW - 10 * fs, 11.5 * fs), { anchor: 'end', size: 11.5 });
    if (start[i] == null || end[i] == null) return;
    const a = Math.min(start[i], end[i]);
    const b = Math.max(start[i], end[i]);
    const color = seriesColor(o, groups[i] ? groupNames.indexOf(groups[i]) : i);
    const text = (v) => (isDate ? new Date(v).toISOString().slice(0, 10) : fmt(ctx, v));
    out.push(KIT.mark(ctx, 'rect', { x: map(a), y: y + step * 0.18, width: Math.max(3, map(b) - map(a)), height: step * 0.64, rx: Math.min(5 * fs, step / 4), fill: color, class: 'bar' }, `${cat}: ${text(a)} → ${text(b)}${isDate ? ` (${Math.round((b - a) / 86400000)}${KIT.L(ctx, '일', ' days')})` : ''}`, 0, data.order[i]));
  });
}

function drawTimeline(ctx, plot, data) {
  const { out, fs, o } = ctx;
  const r2 = KIT.r2;
  const labels = roleLabels(ctx, data, 'label');
  const events = data.categories.map((c, i) => ({ c, t: timeOf(c), label: labels[i], row: data.order[i], i })).filter((e) => e.c);
  if (!events.length) return none(ctx, plot, '날짜(항목)와 사건 열을 고르세요', 'Choose a date (category) and an event column');
  const timed = events.every((e) => e.t != null);
  if (timed) events.sort((a, b) => a.t - b.t);
  const y = plot.y + plot.h / 2;
  const x0 = plot.x + 30 * fs;
  const x1 = plot.x + plot.w - 30 * fs;
  const lo = timed ? events[0].t : 0;
  const hi = timed ? events[events.length - 1].t : events.length - 1;
  const xOf = (e, k) => x0 + ((timed ? e.t - lo : k) / (hi - lo || 1)) * (x1 - x0);
  out.push(`<line x1="${r2(x0)}" x2="${r2(x1)}" y1="${r2(y)}" y2="${r2(y)}" stroke="${ctx.colors.axis}" stroke-width="${r2(3 * fs)}" stroke-linecap="round"/>`);
  events.forEach((e, k) => {
    const x = xOf(e, k);
    const up = k % 2 === 0;
    const len = (40 + (k % 4) * 22) * fs;
    const color = seriesColor(o, k);
    out.push(`<line x1="${r2(x)}" x2="${r2(x)}" y1="${r2(y)}" y2="${r2(up ? y - len : y + len)}" stroke="${color}" stroke-width="${r2(1.5 * fs)}"/>`);
    out.push(KIT.mark(ctx, 'circle', { cx: x, cy: y, r: 7 * fs, fill: color, stroke: bg(ctx), 'stroke-width': 2 * fs, class: 'dot' }, `${e.c}: ${e.label}`, 0, e.row));
    KIT.label(ctx, x, up ? y - len - 18 * fs : y + len + 14 * fs, fitText(e.c, 130 * fs, 10.5 * fs), { size: 10.5, color: ctx.colors.muted });
    KIT.label(ctx, x, up ? y - len - 5 * fs : y + len + 28 * fs, fitText(e.label, 150 * fs, 12 * fs), { size: 12, weight: 700 });
  });
}

// ───────────────────────── indicators

function drawGaugeGrid(ctx, plot, data) {
  const s = data.series[0];
  const rows = data.categories.map((c, i) => ({ c, v: s.values[i], i })).filter((r) => r.v != null).slice(0, 12);
  if (!rows.length) return none(ctx, plot, '숫자가 없습니다', 'No numbers');
  const cols = Math.ceil(Math.sqrt(rows.length * (plot.w / plot.h) / 1.4));
  const lines = Math.ceil(rows.length / cols);
  const w = plot.w / cols;
  const h = plot.h / lines;
  const max = parseNumber(ctx.o.gaugeMax) ?? niceTicks(0, maxOf([...rows.map((r) => r.v)]), 4).max;
  const saved = ctx.o;
  const savedFs = ctx.fs;
  ctx.o = { ...saved, gaugeMax: max };
  ctx.fs = savedFs * Math.max(0.55, Math.min(1, Math.sqrt((w * h) / (plot.w * plot.h)) * 1.4));
  rows.forEach((r, k) => {
    const sub = { x: plot.x + (k % cols) * w + 6, y: plot.y + Math.floor(k / cols) * h + 4, w: w - 12, h: h - 8 };
    KIT.drawGauge(ctx, sub, { categories: [r.c], series: [{ ...s, values: [r.v] }], order: [data.order[r.i]] });
  });
  ctx.o = saved;
  ctx.fs = savedFs;
}

function drawLinearGauge(ctx, plot, data) {
  const { out, fs, o } = ctx;
  const r2 = KIT.r2;
  const s = data.series[0];
  const rows = data.categories.map((c, i) => ({ c, v: s.values[i], i })).filter((r) => r.v != null).slice(0, 10);
  if (!rows.length) return none(ctx, plot, '숫자가 없습니다', 'No numbers');
  const min = parseNumber(o.gaugeMin) ?? 0;
  const max = parseNumber(o.gaugeMax) ?? niceTicks(min, maxOf([...rows.map((r) => r.v)]), 4).max;
  const labelW = Math.min(plot.w * 0.25, maxOf([...rows.map((r) => textWidth(r.c, 12 * fs))]) + 12 * fs);
  const x0 = plot.x + labelW;
  const x1 = plot.x + plot.w - 70 * fs;
  const rowH = Math.min(70 * fs, plot.h / rows.length);
  const map = (v) => x0 + ((Math.max(min, Math.min(max, v)) - min) / (max - min || 1)) * (x1 - x0);
  const ticks = niceTicks(min, max, 5).ticks.filter((t) => t >= min && t <= max);
  rows.forEach((r, k) => {
    const y = plot.y + (plot.h - rowH * rows.length) / 2 + k * rowH + rowH * 0.35;
    const h = rowH * 0.28;
    const zones = [[min, min + (max - min) * 0.6, o.upColor], [min + (max - min) * 0.6, min + (max - min) * 0.85, '#f59e0b'], [min + (max - min) * 0.85, max, o.downColor]];
    for (const [a, b, color] of zones) out.push(`<rect x="${r2(map(a))}" y="${r2(y)}" width="${r2(map(b) - map(a))}" height="${r2(h)}" fill="${color}" fill-opacity="0.25"/>`);
    out.push(KIT.mark(ctx, 'rect', { x: map(min), y: y + h * 0.3, width: Math.max(1, map(r.v) - map(min)), height: h * 0.4, fill: seriesColor(o, r.i), class: 'bar' }, `${r.c}: ${fmt(ctx, r.v)} (${fmt(ctx, min)}–${fmt(ctx, max)})`, 0, data.order[r.i]));
    const px = map(r.v);
    out.push(`<path d="M${r2(px)},${r2(y - 2)}l${r2(-6 * fs)},${r2(-9 * fs)}h${r2(12 * fs)}Z" fill="${ctx.colors.text}"/>`);
    for (const t of ticks) { out.push(`<line x1="${r2(map(t))}" x2="${r2(map(t))}" y1="${r2(y + h)}" y2="${r2(y + h + 5 * fs)}" stroke="${ctx.colors.axis}"/>`); KIT.label(ctx, map(t), y + h + 16 * fs, fmt(ctx, t, { tick: true }), { size: 9.5, color: ctx.colors.muted }); }
    KIT.label(ctx, x0 - 10 * fs, y + h / 2 + 4 * fs, fitText(r.c, labelW - 12 * fs, 12 * fs), { anchor: 'end', size: 12, weight: 600 });
    KIT.label(ctx, x1 + 10 * fs, y + h / 2 + 5 * fs, fmt(ctx, r.v), { anchor: 'start', size: 14, weight: 800 });
  });
}

function drawBigNumber(ctx, plot, data) {
  const { out, fs, o } = ctx;
  const r2 = KIT.r2;
  const s = data.series[0];
  const rows = data.categories.map((c, i) => ({ c, v: s.values[i], prev: i > 0 ? s.values[i - 1] : null, i })).filter((r) => r.v != null).slice(-12);
  if (!rows.length) return none(ctx, plot, '숫자가 없습니다', 'No numbers');
  const cols = Math.min(rows.length, Math.max(1, Math.round(Math.sqrt(rows.length * (plot.w / plot.h) / 1.6))));
  const lines = Math.ceil(rows.length / cols);
  const w = plot.w / cols;
  const h = plot.h / lines;
  rows.forEach((r, k) => {
    const x = plot.x + (k % cols) * w + 6 * fs;
    const y = plot.y + Math.floor(k / cols) * h + 6 * fs;
    const cw = w - 12 * fs;
    const ch = h - 12 * fs;
    const color = seriesColor(o, r.i);
    out.push(KIT.mark(ctx, 'rect', { x, y, width: cw, height: ch, rx: 10 * fs, fill: ctx.colors.dark ? lighten(ctx.colors.base, 0.06) : mix(color, '#ffffff', 0.9), stroke: mix(color, ctx.colors.base, 0.5), class: 'cell' }, `${r.c}: ${fmt(ctx, r.v)}`, 0, data.order[r.i]));
    out.push(`<rect x="${r2(x)}" y="${r2(y)}" width="${r2(5 * fs)}" height="${r2(ch)}" rx="${r2(2 * fs)}" fill="${color}"/>`);
    const size = Math.max(14, Math.min(48, Math.min(ch / 2.6, cw / Math.max(4, fmt(ctx, r.v).length) * 1.6) / fs));
    KIT.label(ctx, x + 16 * fs, y + 22 * fs, fitText(r.c, cw - 24 * fs, 12 * fs), { anchor: 'start', size: 12, color: ctx.colors.muted, weight: 600 });
    KIT.label(ctx, x + 16 * fs, y + 22 * fs + size * fs * 1.1, fmt(ctx, r.v), { anchor: 'start', size, weight: 800 });
    if (r.prev != null && r.prev !== 0) {
      const d = (r.v - r.prev) / Math.abs(r.prev);
      KIT.label(ctx, x + 16 * fs, Math.min(y + ch - 10 * fs, y + 22 * fs + size * fs * 1.1 + 22 * fs), `${d >= 0 ? '▲' : '▼'} ${fmt(ctx, Math.abs(d), { percent: true })}`, { anchor: 'start', size: 12, weight: 700, color: d >= 0 ? o.upColor : o.downColor });
    }
  });
}

/** Renderer of each added type (by id; variants reach them through their `base`). */
export const EXTRA_DRAW = {
  dumbbell: drawDumbbell, rangeColumn: drawRangeColumn, bullet: drawBullet, progressBars: drawProgressBars, butterfly: drawButterfly, pareto: drawPareto,
  marimekko: drawMarimekko, radialBar: drawRadialBar, radialColumn: drawRadialColumn, smallMultiples: drawSmallMultiples, meanError: drawMeanError,
  streamgraph: drawStreamgraph, rangeArea: drawRangeArea, slope: drawSlope, bump: drawBump, sparklines: drawSparklines,
  nestedDonut: drawNestedDonut, icicle: drawIcicle, packedCircles: drawPackedCircles, waffle: drawWaffle, parliament: drawParliament, wordCloud: drawWordCloud, activityRings: drawActivityRings,
  violin: drawViolin, stripPlot: drawStripPlot, dotHistogram: drawDotHistogram, ridgeline: drawRidgeline, density: drawDensity, ecdf: drawEcdf, punchCard: drawPunchCard, correlation: drawCorrelation, scatterMatrix: drawScatterMatrix, calendarHeatmap: drawCalendarHeatmap,
  chord: drawChord, arcDiagram: drawArcDiagram, network: drawNetwork, tree: drawTree,
  priceBand: drawPriceBand, bollinger: drawBollinger, gantt: drawGantt, timeline: drawTimeline,
  gaugeGrid: drawGaugeGrid, linearGauge: drawLinearGauge, bigNumber: drawBigNumber,
};
