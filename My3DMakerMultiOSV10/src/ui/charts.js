// Small SVG charts for the bottom panel and reports: lines (linear or log axes), bars, a heat map.
import { factor, fmt, unitLabel } from '../sim/units.js';
import { cssColor } from '../view/simview.js';

const COLORS = ['#3e63dd', '#e5484d', '#30a46c', '#f08a24', '#8e4ec6', '#12a594', '#d6409f'];
const e = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function ticks(lo, hi, n = 5, log = false) {
  if (log) {
    const a = Math.floor(Math.log10(lo)); const b = Math.ceil(Math.log10(hi));
    const out = [];
    for (let k = a; k <= b; k++) out.push(10 ** k);
    return out.length > 1 ? out : [lo, hi];
  }
  const span = hi - lo || 1;
  const raw = span / n;
  const p = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * p).find((s) => s >= raw) ?? raw;
  const out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(Number(v.toPrecision(12)));
  return out;
}

/** chart: { titleKey, x, y (unit kinds), series: [{ name, x, y }], logX, logY, bar }. */
export function lineChart(chart, { t = (k) => k, units = 'mm', width = 640, height = 260 } = {}) {
  const fx = factor(chart.x, units); const fy = factor(chart.y, units);
  const series = chart.series.map((s) => ({ name: s.name, x: Array.from(s.x, (v) => v * fx), y: Array.from(s.y, (v) => v * fy) }));
  const all = (k) => series.flatMap((s) => s[k]).filter((v) => Number.isFinite(v) && (!(k === 'x' ? chart.logX : chart.logY) || v > 0));
  const xs = all('x'); const ys = all('y');
  if (!xs.length || !ys.length) return `<svg class="chart" viewBox="0 0 ${width} ${height}"><text x="${width / 2}" y="${height / 2}" text-anchor="middle">—</text></svg>`;
  let [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  let [y0, y1] = [Math.min(...ys), Math.max(...ys)];
  if (chart.bar || (!chart.logY && y0 > 0 && y0 < 0.3 * y1)) y0 = Math.min(0, y0);
  if (x1 === x0) x1 = x0 + 1;
  if (y1 === y0) y1 = y0 + (Math.abs(y0) || 1);
  const L = 64; const R = 14; const T = 26; const B = 40;
  const sx = (v) => L + ((chart.logX ? Math.log10(v) - Math.log10(x0) : v - x0) / (chart.logX ? Math.log10(x1) - Math.log10(x0) : x1 - x0)) * (width - L - R);
  const sy = (v) => height - B - ((chart.logY ? Math.log10(Math.max(v, y0)) - Math.log10(y0) : v - y0) / (chart.logY ? Math.log10(y1) - Math.log10(y0) : y1 - y0)) * (height - T - B);
  const grid = [];
  for (const v of ticks(x0, x1, 6, chart.logX)) { if (v < x0 || v > x1) continue; const x = sx(v); grid.push(`<line class="chart-grid" x1="${x}" y1="${T}" x2="${x}" y2="${height - B}"/><text class="chart-tick" x="${x}" y="${height - B + 14}" text-anchor="middle">${fmt(v, 3)}</text>`); }
  for (const v of ticks(y0, y1, 5, chart.logY)) { if (v < y0 || v > y1) continue; const y = sy(v); grid.push(`<line class="chart-grid" x1="${L}" y1="${y}" x2="${width - R}" y2="${y}"/><text class="chart-tick" x="${L - 6}" y="${y + 4}" text-anchor="end">${fmt(v, 3)}</text>`); }
  const lines = series.map((s, i) => {
    const c = COLORS[i % COLORS.length];
    if (chart.bar) {
      const bw = Math.max(3, ((width - L - R) / Math.max(1, s.x.length)) * 0.6);
      return s.x.map((x, k) => `<rect x="${sx(x) - bw / 2}" y="${Math.min(sy(s.y[k]), sy(0))}" width="${bw}" height="${Math.abs(sy(s.y[k]) - sy(Math.max(0, y0)))}" fill="${c}"><title>${fmt(x)}: ${fmt(s.y[k])}</title></rect>`).join('');
    }
    const pts = s.x.map((x, k) => (Number.isFinite(x) && Number.isFinite(s.y[k]) && (!chart.logY || s.y[k] > 0) && (!chart.logX || x > 0) ? `${sx(x).toFixed(1)},${sy(s.y[k]).toFixed(1)}` : null)).filter(Boolean);
    return `<polyline fill="none" stroke="${c}" stroke-width="1.8" points="${pts.join(' ')}"/>`;
  }).join('');
  const legend = series.length > 1 ? series.map((s, i) => `<g transform="translate(${L + 8 + i * 86},${T - 8})"><rect width="12" height="3" y="-2" fill="${COLORS[i % COLORS.length]}"/><text x="16" y="2" class="chart-legend">${e(s.name)}</text></g>`).join('') : '';
  const xl = `${t(`axis.${chart.x}`)}${unitLabel(chart.x, units) ? ` (${unitLabel(chart.x, units)})` : ''}`;
  const yl = `${t(`axis.${chart.y}`)}${unitLabel(chart.y, units) ? ` (${unitLabel(chart.y, units)})` : ''}`;
  return `<svg class="chart" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" role="img">
    <text class="chart-title" x="${width - R}" y="14" text-anchor="end">${e(t(chart.titleKey))}</text>
    ${grid.join('')}<rect class="chart-frame" x="${L}" y="${T}" width="${width - L - R}" height="${height - T - B}"/>
    ${lines}${legend}
    <text class="chart-axis" x="${(L + width - R) / 2}" y="${height - 6}" text-anchor="middle">${e(xl)}</text>
    <text class="chart-axis" transform="translate(14,${(T + height - B) / 2}) rotate(-90)" text-anchor="middle">${e(yl)}</text>
  </svg>`;
}

/** A heat map of a response surface (values row-major, size n×n over x/y ranges). */
export function heatMap(values, [nx, ny], { xLabel = '', yLabel = '', xr = [0, 1], yr = [0, 1], width = 360, height = 300, colormap = 'viridis' } = {}) {
  let lo = Infinity; let hi = -Infinity;
  for (const v of values) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  const L = 54; const B = 36; const T = 10; const R = 10;
  const cw = (width - L - R) / nx; const ch = (height - T - B) / ny;
  const cells = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const v = values[j * nx + i];
    cells.push(`<rect x="${(L + i * cw).toFixed(1)}" y="${(height - B - (j + 1) * ch).toFixed(1)}" width="${(cw + 0.5).toFixed(1)}" height="${(ch + 0.5).toFixed(1)}" fill="${cssColor((v - lo) / (hi - lo || 1), colormap, 0)}"><title>${fmt(v)}</title></rect>`);
  }
  return `<svg class="chart" viewBox="0 0 ${width} ${height}">${cells.join('')}
    <text class="chart-tick" x="${L}" y="${height - B + 14}">${fmt(xr[0], 3)}</text><text class="chart-tick" x="${width - R}" y="${height - B + 14}" text-anchor="end">${fmt(xr[1], 3)}</text>
    <text class="chart-tick" x="${L - 4}" y="${height - B}" text-anchor="end">${fmt(yr[0], 3)}</text><text class="chart-tick" x="${L - 4}" y="${T + 8}" text-anchor="end">${fmt(yr[1], 3)}</text>
    <text class="chart-axis" x="${(L + width) / 2}" y="${height - 6}" text-anchor="middle">${e(xLabel)}</text>
    <text class="chart-axis" transform="translate(12,${height / 2}) rotate(-90)" text-anchor="middle">${e(yLabel)}</text>
    <text class="chart-tick" x="${width - R}" y="${T + 8}" text-anchor="end">${fmt(lo, 3)} … ${fmt(hi, 3)}</text></svg>`;
}
