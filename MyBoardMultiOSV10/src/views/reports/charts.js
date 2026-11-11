// Small SVG charts of the reports view and the dashboard gadgets: stacked area (cumulative flow), scatter
// with rolling average and a ±1σ band (control chart), bars with an average line (throughput, workload),
// lines with the area between (created vs resolved, burn-up), and a donut (breakdown).
//
// Every function takes ({ width, height, colors, ... }) and returns { svg, tips } — `svg` a complete
// <svg> string with concrete colours (so it can be exported as a file), `tips` the hover texts the marks
// and hover bands point to with data-rp-tip="<index>". Colours come from palette() (the theme's text, grid
// and surface, and a categorical series order chosen for colour-vision safety, light and dark).
import { escapeHtml } from '../../ui/dom.js';
import { renderIconRef } from '../../ui/iconref.js';

// Categorical series colours (fixed order, never cycled): light and dark steps of the same hues.
const SERIES = {
  light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'],
  dark: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'],
};
const OTHER = { light: '#9a9892', dark: '#6f6e69' };

/** The colours for the current theme (read from the CSS variables the theme sets). */
export function palette(el = document.documentElement) {
  const css = getComputedStyle(el);
  const v = (name, fallback) => css.getPropertyValue(name).trim() || fallback;
  const dark = document.documentElement.dataset.mode === 'dark';
  return {
    dark,
    surface: v('--chart', v('--surface', dark ? '#1f232c' : '#ffffff')),
    text: v('--text', dark ? '#e8e8e8' : '#1b1f24'),
    muted: v('--muted', dark ? '#9aa0a6' : '#5f6670'),
    grid: v('--border', dark ? '#3a3f4a' : '#e3e6ea'),
    accent: v('--accent', '#3a6cf0'),
    good: v('--success', '#2f9e44'),
    bad: v('--danger', '#e03131'),
    series: SERIES[dark ? 'dark' : 'light'],
    other: OTHER[dark ? 'dark' : 'light'],
    font: (v('--font-family', '') || 'Segoe UI, sans-serif').replace(/"/g, "'"),
  };
}

/** Colours for paper (printing): always light, whatever the app's theme. */
export function printPalette() {
  return { dark: false, surface: '#ffffff', text: '#1b1f24', muted: '#5f6670', grid: '#dfe3e8', accent: '#3a6cf0', good: '#2f9e44', bad: '#e03131', series: SERIES.light, other: OTHER.light, font: 'Segoe UI, Malgun Gothic, sans-serif' };
}

export const seriesColor = (colors, i) => (i < colors.series.length ? colors.series[i] : colors.other);

const r1 = (n) => Math.round(n * 10) / 10;
const esc = escapeHtml;

/** "Nice" axis ticks from 0 (or min) to max. */
export function niceTicks(min, max, count = 5) {
  if (!Number.isFinite(max) || max <= min) max = min + 1;
  const span = max - min;
  const step0 = span / Math.max(1, count);
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0) ?? 10 * mag;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks = [];
  for (let x = lo; x <= hi + step / 2; x += step) ticks.push(Math.round(x * 1e6) / 1e6);
  return { ticks, min: lo, max: hi };
}

function frame({ width, height, colors, title = '' }, inner) {
  return `<svg xmlns="http://www.w3.org/2000/svg" class="rp-svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="${esc(colors.font)}" font-size="11" role="img" aria-label="${esc(title)}">`
    + `<rect class="rp-bg" x="0" y="0" width="${width}" height="${height}" fill="${colors.surface}"/>${inner}</svg>`;
}

/** Axes, gridlines and tick labels. x: { labels: [{ x, text }] }, y: { ticks, scale, format }. */
function axes({ colors, plot, xLabels, yTicks, yScale, yFormat = (v) => String(v), yTitle = '' }) {
  let out = '';
  for (const tk of yTicks) {
    const y = r1(yScale(tk));
    out += `<line x1="${plot.left}" x2="${plot.right}" y1="${y}" y2="${y}" stroke="${colors.grid}" stroke-width="1"${tk === yTicks[0] ? '' : ' stroke-dasharray="2 3"'}/>`;
    out += `<text x="${plot.left - 6}" y="${y + 3.5}" text-anchor="end" fill="${colors.muted}">${esc(yFormat(tk))}</text>`;
  }
  for (const l of xLabels) out += `<text x="${r1(l.x)}" y="${plot.bottom + 15}" text-anchor="middle" fill="${colors.muted}">${esc(l.text)}</text>`;
  out += `<line x1="${plot.left}" x2="${plot.right}" y1="${plot.bottom}" y2="${plot.bottom}" stroke="${colors.muted}" stroke-width="1"/>`;
  if (yTitle) out += `<text x="12" y="${plot.top + (plot.bottom - plot.top) / 2}" transform="rotate(-90 12 ${plot.top + (plot.bottom - plot.top) / 2})" text-anchor="middle" fill="${colors.muted}">${esc(yTitle)}</text>`;
  return out;
}

/** Up to `max` evenly spaced x labels (indexes). */
function labelIndexes(n, width, every = 70) {
  const max = Math.max(2, Math.floor(width / every));
  if (n <= max) return [...Array(n).keys()];
  const step = Math.ceil(n / max);
  const out = [];
  for (let i = 0; i < n; i += step) out.push(i);
  if (out.at(-1) !== n - 1 && n - 1 - out.at(-1) > step * 0.75) out.push(n - 1);
  return out;
}

function plotBox(width, height, { left = 44, right = 14, top = 12, bottom = 26 } = {}) {
  return { left, right: width - right, top, bottom: height - bottom, w: width - left - right, h: height - top - bottom };
}

/** Vertical hover bands, one per x index (crosshair + tooltip for line/area charts). */
function bands(plot, xs) {
  let out = '';
  for (let i = 0; i < xs.length; i++) {
    const a = i === 0 ? plot.left : (xs[i - 1] + xs[i]) / 2;
    const b = i === xs.length - 1 ? plot.right : (xs[i] + xs[i + 1]) / 2;
    out += `<rect class="rp-band" data-rp-tip="${i}" data-x="${r1(xs[i])}" x="${r1(a)}" y="${plot.top}" width="${r1(Math.max(1, b - a))}" height="${plot.h}" fill="transparent"/>`;
  }
  return out;
}

const pathOf = (pts) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${r1(x)},${r1(y)}`).join('');

/**
 * Stacked area: labels[] (x), series [{ name, values[], color }] bottom → top (first = bottom).
 * Returns { svg, tips, counts: { areas, points } }.
 */
export function stackedArea({ width, height, colors, labels, series, formatLabel = (s) => s, title = '' }) {
  const plot = plotBox(width, height);
  const n = labels.length;
  const totals = labels.map((_, i) => series.reduce((a, s) => a + (s.values[i] ?? 0), 0));
  const { ticks, max } = niceTicks(0, Math.max(1, ...totals));
  const x = (i) => plot.left + (n <= 1 ? plot.w / 2 : (i * plot.w) / (n - 1));
  const y = (v) => plot.bottom - (v / max) * plot.h;
  const xs = labels.map((_, i) => x(i));
  let body = axes({ colors, plot, xLabels: labelIndexes(n, plot.w).map((i) => ({ x: x(i), text: formatLabel(labels[i]) })), yTicks: ticks, yScale: y });
  const base = new Array(n).fill(0);
  series.forEach((s) => {
    const lower = base.map((v, i) => [x(i), y(v)]);
    for (let i = 0; i < n; i++) base[i] += s.values[i] ?? 0;
    const upper = base.map((v, i) => [x(i), y(v)]);
    body += `<path class="rp-area" data-series="${esc(s.name)}" d="${pathOf(upper)}${lower.reverse().map(([a, b]) => `L${r1(a)},${r1(b)}`).join('')}Z" fill="${s.color}" fill-opacity="0.82" stroke="${colors.surface}" stroke-width="1.5"/>`;
  });
  const tips = labels.map((l, i) => ({ title: formatLabel(l, true), rows: [...series].reverse().map((s) => ({ color: s.color, name: s.name, value: s.values[i] ?? 0 })), total: totals[i] }));
  body += `<line class="rp-cross" x1="0" x2="0" y1="${plot.top}" y2="${plot.bottom}" stroke="${colors.text}" stroke-width="1" stroke-dasharray="3 3" visibility="hidden"/>`;
  body += bands(plot, xs);
  return { svg: frame({ width, height, colors, title }, body), tips, counts: { areas: series.length, points: n } };
}

/**
 * Lines: labels[], series [{ name, values[], color, dash?, area? }], fillBetween?: [i, j] (shades the area between two series).
 */
export function lines({ width, height, colors, labels, series, fillBetween = null, formatLabel = (s) => s, yFormat, markers = false, extra = '', title = '', yMax = null }) {
  const plot = plotBox(width, height);
  const n = labels.length;
  const all = series.flatMap((s) => s.values.filter((v) => v != null));
  const { ticks, max } = niceTicks(0, Math.max(1, yMax ?? 0, ...all));
  const x = (i) => plot.left + (n <= 1 ? plot.w / 2 : (i * plot.w) / (n - 1));
  const y = (v) => plot.bottom - (v / max) * plot.h;
  let body = axes({ colors, plot, xLabels: labelIndexes(n, plot.w).map((i) => ({ x: x(i), text: formatLabel(labels[i]) })), yTicks: ticks, yScale: y, yFormat });
  if (fillBetween) {
    const [a, b] = fillBetween.map((k) => series[k]);
    // Shaded per segment: red where a > b (more created than resolved), green where below.
    for (let i = 0; i < n - 1; i++) {
      const up = (a.values[i] + a.values[i + 1]) / 2 >= (b.values[i] + b.values[i + 1]) / 2;
      body += `<path class="rp-between" d="M${r1(x(i))},${r1(y(a.values[i]))}L${r1(x(i + 1))},${r1(y(a.values[i + 1]))}L${r1(x(i + 1))},${r1(y(b.values[i + 1]))}L${r1(x(i))},${r1(y(b.values[i]))}Z" fill="${up ? colors.bad : colors.good}" fill-opacity="0.16"/>`;
    }
  }
  for (const s of series) {
    const pts = s.values.map((v, i) => (v == null ? null : [x(i), y(v)])).filter(Boolean);
    if (s.area) body += `<path d="${pathOf(pts)}L${r1(pts.at(-1)?.[0] ?? plot.left)},${plot.bottom}L${r1(pts[0]?.[0] ?? plot.left)},${plot.bottom}Z" fill="${s.color}" fill-opacity="0.14"/>`;
    body += `<path class="rp-line" data-series="${esc(s.name)}" d="${pathOf(pts)}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"${s.dash ? ' stroke-dasharray="6 4"' : ''}/>`;
    if (markers && pts.length <= 60) for (const [px, py] of pts) body += `<circle class="rp-dot" cx="${r1(px)}" cy="${r1(py)}" r="3" fill="${s.color}" stroke="${colors.surface}" stroke-width="1.5"/>`;
  }
  body += extra ? extra({ x, y, plot }) : '';
  body += `<line class="rp-cross" x1="0" x2="0" y1="${plot.top}" y2="${plot.bottom}" stroke="${colors.text}" stroke-width="1" stroke-dasharray="3 3" visibility="hidden"/>`;
  body += bands(plot, labels.map((_, i) => x(i)));
  const tips = labels.map((l, i) => ({ title: formatLabel(l, true), rows: series.filter((s) => !s.noTip).map((s) => ({ color: s.color, name: s.name, value: s.values[i] })) }));
  return { svg: frame({ width, height, colors, title }, body), tips, counts: { lines: series.length, points: n } };
}

/** Vertical bars: labels[], values[], average? (a dashed line), color. */
export function bars({ width, height, colors, labels, values, average = null, color, formatLabel = (s) => s, valueName = '', averageName = '', title = '', yFormat }) {
  const plot = plotBox(width, height);
  const n = labels.length;
  const { ticks, max } = niceTicks(0, Math.max(1, ...values, average ?? 0));
  const slot = plot.w / Math.max(1, n);
  const bw = Math.max(2, Math.min(42, slot * 0.72));
  const y = (v) => plot.bottom - (v / max) * plot.h;
  let body = axes({ colors, plot, xLabels: labelIndexes(n, plot.w, 64).map((i) => ({ x: plot.left + slot * (i + 0.5), text: formatLabel(labels[i]) })), yTicks: ticks, yScale: y, yFormat });
  const tips = [];
  values.forEach((v, i) => {
    const cx = plot.left + slot * (i + 0.5);
    const top = y(v);
    const h = plot.bottom - top;
    const rad = Math.min(4, bw / 2, h);
    tips.push({ title: formatLabel(labels[i], true), rows: [{ color, name: valueName, value: v }, ...(average != null ? [{ color: colors.text, name: averageName, value: Math.round(average * 10) / 10 }] : [])] });
    if (v > 0) body += `<path class="rp-bar" d="M${r1(cx - bw / 2)},${plot.bottom}V${r1(top + rad)}Q${r1(cx - bw / 2)},${r1(top)} ${r1(cx - bw / 2 + rad)},${r1(top)}H${r1(cx + bw / 2 - rad)}Q${r1(cx + bw / 2)},${r1(top)} ${r1(cx + bw / 2)},${r1(top + rad)}V${plot.bottom}Z" fill="${color}" data-value="${v}"/>`;
    body += `<rect class="rp-hit" data-rp-tip="${i}" x="${r1(plot.left + slot * i)}" y="${plot.top}" width="${r1(slot)}" height="${plot.h}" fill="transparent"/>`;
  });
  if (average != null) {
    const ay = r1(y(average));
    body += `<line class="rp-avg" x1="${plot.left}" x2="${plot.right}" y1="${ay}" y2="${ay}" stroke="${colors.text}" stroke-width="1.5" stroke-dasharray="6 4" pointer-events="none"/>`;
    body += `<text x="${plot.right - 2}" y="${ay - 5}" text-anchor="end" fill="${colors.text}" font-weight="600" pointer-events="none">${esc(averageName)} ${esc(String(Math.round(average * 10) / 10))}</text>`;
  }
  return { svg: frame({ width, height, colors, title }, body), tips, counts: { bars: values.filter((v) => v > 0).length, slots: n } };
}

/** Horizontal bars (one per row, e.g. assignee): rows [{ label, value, icon? }]. */
export function hbars({ width, colors, rows, color, valueName = '', format = (v) => String(v), title = '' }) {
  const rowH = 28;
  const labelW = Math.min(170, Math.max(90, width * 0.3));
  const height = Math.max(60, rows.length * rowH + 30);
  const plot = { left: labelW + 8, right: width - 46, top: 8, bottom: height - 22 };
  plot.w = plot.right - plot.left;
  const { ticks, max } = niceTicks(0, Math.max(1, ...rows.map((r) => r.value)));
  const x = (v) => plot.left + (v / max) * plot.w;
  let body = '';
  for (const tk of ticks) body += `<line x1="${r1(x(tk))}" x2="${r1(x(tk))}" y1="${plot.top}" y2="${plot.bottom}" stroke="${colors.grid}" stroke-dasharray="${tk ? '2 3' : ''}"/><text x="${r1(x(tk))}" y="${plot.bottom + 14}" text-anchor="middle" fill="${colors.muted}">${esc(format(tk))}</text>`;
  const tips = [];
  rows.forEach((row, i) => {
    const top = plot.top + i * rowH + 5;
    const bh = rowH - 10;
    const w = Math.max(0, x(row.value) - plot.left);
    tips.push({ title: row.label, rows: [{ color, name: valueName, value: format(row.value) }, ...(row.extra ?? [])] });
    const label = row.label.length > 24 ? `${row.label.slice(0, 23)}…` : row.label;
    body += `<text x="${labelW}" y="${top + bh / 2 + 4}" text-anchor="end" fill="${colors.text}">${esc(label)}</text>`;
    if (w > 0) body += `<path class="rp-bar" d="M${plot.left},${top}H${r1(plot.left + w - Math.min(4, w))}Q${r1(plot.left + w)},${top} ${r1(plot.left + w)},${top + Math.min(4, w)}V${top + bh - Math.min(4, w)}Q${r1(plot.left + w)},${top + bh} ${r1(plot.left + w - Math.min(4, w))},${top + bh}H${plot.left}Z" fill="${color}" data-value="${row.value}"/>`;
    body += `<text x="${r1(plot.left + w + 5)}" y="${top + bh / 2 + 4}" fill="${colors.muted}">${esc(format(row.value))}</text>`;
    body += `<rect class="rp-hit" data-rp-tip="${i}" x="0" y="${top - 5}" width="${width}" height="${rowH}" fill="transparent"/>`;
  });
  return { svg: frame({ width, height, colors, title }, body), tips, height, counts: { bars: rows.filter((r) => r.value > 0).length } };
}

/**
 * Scatter (control chart): points [{ x (ms), y (ms or days), key }], line [{ x, y }] (rolling average), band [{ x, lo, hi }], mean.
 */
export function scatter({ width, height, colors, points, line = [], band = [], mean = null, from, to, formatX, formatY, names, title = '' }) {
  const plot = plotBox(width, height, { left: 46 });
  const maxY = Math.max(1, ...points.map((p) => p.y), ...band.map((b) => b.hi));
  const { ticks, max } = niceTicks(0, maxY);
  const x0 = from ?? Math.min(...points.map((p) => p.x));
  const x1 = Math.max(to ?? Math.max(...points.map((p) => p.x)), x0 + 1);
  const x = (v) => plot.left + ((v - x0) / (x1 - x0)) * plot.w;
  const y = (v) => plot.bottom - (v / max) * plot.h;
  const days = Math.max(1, (x1 - x0) / 86400000);
  const xTicks = [];
  const nx = Math.max(2, Math.floor(plot.w / 80));
  for (let i = 0; i <= nx; i++) xTicks.push(x0 + ((x1 - x0) * i) / nx);
  let body = axes({ colors, plot, xLabels: xTicks.map((v) => ({ x: x(v), text: formatX(v) })), yTicks: ticks, yScale: y, yFormat: formatY });
  if (band.length > 1) {
    const upper = band.map((b) => [x(b.x), y(b.hi)]);
    const lower = band.map((b) => [x(b.x), y(Math.max(0, b.lo))]).reverse();
    body += `<path class="rp-band-sd" d="${pathOf(upper)}${lower.map(([a, b]) => `L${r1(a)},${r1(b)}`).join('')}Z" fill="${colors.series[0]}" fill-opacity="0.13"/>`;
  }
  if (mean != null) body += `<line class="rp-mean" x1="${plot.left}" x2="${plot.right}" y1="${r1(y(mean))}" y2="${r1(y(mean))}" stroke="${colors.muted}" stroke-width="1" stroke-dasharray="6 4"/>`;
  if (line.length > 1) body += `<path class="rp-rolling" d="${pathOf(line.map((p) => [x(p.x), y(p.y)]))}" fill="none" stroke="${colors.series[1]}" stroke-width="2" stroke-linejoin="round"/>`;
  const tips = [];
  points.forEach((p, i) => {
    tips.push({ title: p.key, rows: [{ color: colors.series[0], name: names.cycle, value: formatY(p.y, true) }, { name: names.done, value: formatX(p.x, true) }, ...(p.summary ? [{ name: '', value: p.summary }] : [])] });
    body += `<circle class="rp-point" data-rp-tip="${i}" cx="${r1(x(p.x))}" cy="${r1(y(p.y))}" r="4.5" fill="${colors.series[0]}" fill-opacity="0.85" stroke="${colors.surface}" stroke-width="2"/>`;
  });
  return { svg: frame({ width, height, colors, title }, body), tips, counts: { points: points.length, days } };
}

/** Donut with a legend: items [{ label, value, color }]. */
export function donut({ width, height, colors, items, total, centerLabel = '', title = '' }) {
  const legendW = width >= 380 ? Math.min(220, width * 0.45) : 0;
  const size = Math.max(60, Math.min(height - 10, width - legendW - 20));
  const cx = (width - legendW) / 2;
  const cy = height / 2;
  const R = size / 2 - 4;
  const r = R * 0.6;
  const sum = items.reduce((a, b) => a + b.value, 0) || 1;
  let a0 = -Math.PI / 2;
  let body = '';
  const tips = [];
  items.forEach((it, i) => {
    const frac = it.value / sum;
    const a1 = a0 + frac * Math.PI * 2;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const p = (rad, a) => `${r1(cx + rad * Math.cos(a))},${r1(cy + rad * Math.sin(a))}`;
    tips.push({ title: it.label, rows: [{ color: it.color, name: '', value: `${it.value} (${Math.round(frac * 1000) / 10}%)` }] });
    const d = frac >= 0.9999
      ? `M${p(R, -Math.PI / 2)}A${r1(R)},${r1(R)} 0 1 1 ${p(R, Math.PI * 1.5 - 0.0001)}L${p(r, Math.PI * 1.5 - 0.0001)}A${r1(r)},${r1(r)} 0 1 0 ${p(r, -Math.PI / 2)}Z`
      : `M${p(R, a0)}A${r1(R)},${r1(R)} 0 ${large} 1 ${p(R, a1)}L${p(r, a1)}A${r1(r)},${r1(r)} 0 ${large} 0 ${p(r, a0)}Z`;
    body += `<path class="rp-slice" data-rp-tip="${i}" d="${d}" fill="${it.color}" stroke="${colors.surface}" stroke-width="2"/>`;
    a0 = a1;
  });
  body += `<text x="${r1(cx)}" y="${r1(cy - 2)}" text-anchor="middle" font-size="${Math.max(14, Math.round(R / 3))}" font-weight="700" fill="${colors.text}">${esc(String(total ?? sum))}</text>`;
  if (centerLabel) body += `<text x="${r1(cx)}" y="${r1(cy + 15)}" text-anchor="middle" fill="${colors.muted}">${esc(centerLabel)}</text>`;
  if (legendW) {
    const lx = width - legendW;
    const rowH = 20;
    const shown = items.slice(0, Math.floor((height - 10) / rowH));
    const top = cy - (shown.length * rowH) / 2;
    shown.forEach((it, i) => {
      const yy = top + i * rowH + 12;
      const label = it.label.length > 22 ? `${it.label.slice(0, 21)}…` : it.label;
      body += `<rect x="${r1(lx)}" y="${r1(yy - 9)}" width="10" height="10" rx="2" fill="${it.color}"/><text x="${r1(lx + 16)}" y="${r1(yy)}" fill="${colors.text}">${esc(label)}</text><text x="${width - 6}" y="${r1(yy)}" text-anchor="end" fill="${colors.muted}">${it.value}</text>`;
      body += `<rect class="rp-hit" data-rp-tip="${i}" x="${r1(lx)}" y="${r1(yy - 13)}" width="${r1(legendW)}" height="${rowH}" fill="transparent"/>`;
    });
  }
  return { svg: frame({ width, height, colors, title }, body), tips, counts: { slices: items.filter((x) => x.value > 0).length } };
}

/** An HTML legend (identity is never colour alone: names next to swatches). */
export function legendHtml(series, { toggles = false, hidden = new Set() } = {}) {
  return `<div class="rp-legend">${series.map((s) => (toggles
    ? `<button class="rp-leg ${hidden.has(s.id) ? 'off' : ''}" data-toggle-series="${esc(s.id)}" aria-pressed="${!hidden.has(s.id)}" title="${esc(s.name)}"><i style="background:${s.color}"></i>${s.icon ? renderIconRef(s.icon, { size: 14 }) : ''}<span>${esc(s.name)}</span></button>`
    : `<span class="rp-leg"><i style="background:${s.color}${s.dash ? ';height:2px;border-radius:0' : ''}"></i>${s.icon ? renderIconRef(s.icon, { size: 14 }) : ''}<span>${esc(s.name)}</span></span>`)).join('')}</div>`;
}

/**
 * Hover tooltips for a chart host: marks with data-tip show `tips[i]`; a band also moves the crosshair.
 * Returns an unbind function.
 */
export function bindTooltip(host, getTips, format = (v) => (typeof v === 'number' ? String(Math.round(v * 10) / 10) : String(v))) {
  const tip = document.createElement('div');
  tip.className = 'rp-tip';
  tip.hidden = true;
  host.append(tip);
  const hide = () => { tip.hidden = true; const cross = host.querySelector('.rp-cross'); if (cross) cross.setAttribute('visibility', 'hidden'); host.querySelector('.rp-hover')?.classList.remove('rp-hover'); };
  const move = (event) => {
    const el = event.target.closest?.('[data-rp-tip]');
    const tips = getTips();
    if (!el || !tips || !host.contains(el)) { hide(); return; }
    const t = tips[Number(el.dataset.rpTip)];
    if (!t) { hide(); return; }
    host.querySelector('.rp-hover')?.classList.remove('rp-hover');
    el.classList.add('rp-hover');
    const cross = host.querySelector('.rp-cross');
    if (cross && el.dataset.x) { cross.setAttribute('x1', el.dataset.x); cross.setAttribute('x2', el.dataset.x); cross.setAttribute('visibility', 'visible'); }
    tip.innerHTML = `<b>${esc(t.title)}</b>${t.rows.filter((r) => r.value != null).map((r) => `<div>${r.color ? `<i style="background:${r.color}"></i>` : ''}<span>${esc(r.name)}</span><em>${esc(format(r.value))}</em></div>`).join('')}${t.total != null ? `<div class="rp-tip-total"><span>Σ</span><em>${esc(format(t.total))}</em></div>` : ''}`;
    tip.hidden = false;
    const box = host.getBoundingClientRect();
    const w = tip.offsetWidth;
    const h = tip.offsetHeight;
    let left = event.clientX - box.left + 14;
    if (left + w > box.width - 4) left = event.clientX - box.left - w - 14;
    let top = event.clientY - box.top - h - 10;
    if (top < 4) top = event.clientY - box.top + 16;
    tip.style.left = `${Math.max(4, left)}px`;
    tip.style.top = `${Math.max(4, Math.min(top, box.height - h - 4))}px`;
  };
  host.addEventListener('pointermove', move);
  host.addEventListener('pointerleave', hide);
  return () => { host.removeEventListener('pointermove', move); host.removeEventListener('pointerleave', hide); tip.remove(); };
}

/** The chart as an SVG file text (adds the XML declaration). */
export const svgFile = (svg) => `<?xml version="1.0" encoding="UTF-8"?>\n${svg}`;

/** The chart as a PNG blob (drawn at 2× for sharp text). */
export async function svgToPng(svg, width, height, scale = 2) {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.decoding = 'sync';
    await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = () => reject(new Error('SVG could not be drawn')); img.src = url; });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const g = canvas.getContext('2d');
    g.scale(scale, scale);
    g.drawImage(img, 0, 0, width, height);
    return await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}
