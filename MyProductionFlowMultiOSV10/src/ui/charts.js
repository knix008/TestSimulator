// Charts as SVG strings (no library): time series, horizontal bars, histograms
// and state timelines. The bottom panel, the report and the experiment window
// use them; colours come from the theme through CSS variables.
import { escapeHtml } from './dom.js';

export const PALETTE = ['#2563eb', '#ef4444', '#16a34a', '#f59e0b', '#8b5cf6', '#0891b2', '#db2777', '#65a30d', '#ea580c', '#475569'];

export function fmtNum(v, digits = 2) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  const a = Math.abs(n);
  if (a >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (a >= 1e4) return `${(n / 1e3).toFixed(1)}k`;
  if (a >= 100) return n.toFixed(0);
  if (a >= 10) return n.toFixed(1);
  return n.toFixed(digits).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
}
export const pct = (v) => (Number.isFinite(Number(v)) ? `${(Number(v) * 100).toFixed(1)}%` : '—');

/** Nice axis ticks between lo and hi. */
function ticks(lo, hi, n = 5) {
  if (!(hi > lo)) return [lo];
  const span = hi - lo; const step0 = span / n;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((s) => span / s <= n) ?? mag * 10;
  const out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(+v.toFixed(10));
  return out;
}

/**
 * A line chart. series: [{ name, values, color? }] over `times`. Options: width, height, area, step, yMin, title, xLabel.
 * The SVG scales to its box (viewBox) so it fits panels of any width.
 */
export function lineChart(times, series, { width = 560, height = 200, area = false, yMin = null, yMax = null, xLabel = '', title = '', legend = true } = {}) {
  const pad = { l: 46, r: 12, t: title ? 22 : 10, b: 24 + (legend ? 16 : 0) };
  const iw = width - pad.l - pad.r; const ih = height - pad.t - pad.b;
  if (!times?.length || !series.length) return emptyChart(width, height, title);
  let lo = Infinity; let hi = -Infinity;
  for (const s of series) for (const v of s.values) if (Number.isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v; }
  if (!Number.isFinite(lo)) return emptyChart(width, height, title);
  if (yMin != null) lo = Math.min(lo, yMin); else if (lo > 0 && lo < hi * 0.5) lo = 0;
  if (yMax != null) hi = Math.max(hi, yMax);
  if (hi - lo < 1e-9) { hi = lo + 1; }
  const t0 = times[0]; const t1 = times[times.length - 1];
  const X = (t) => pad.l + ((t - t0) / ((t1 - t0) || 1)) * iw;
  const Y = (v) => pad.t + ih - ((v - lo) / (hi - lo)) * ih;
  const yt = ticks(lo, hi, 4); const xt = ticks(t0, t1, 6);
  const grid = yt.map((v) => `<line x1="${pad.l}" x2="${pad.l + iw}" y1="${Y(v)}" y2="${Y(v)}" class="ch-grid"/><text x="${pad.l - 6}" y="${Y(v) + 3.5}" class="ch-tick" text-anchor="end">${fmtNum(v)}</text>`).join('')
    + xt.map((v) => `<text x="${X(v)}" y="${pad.t + ih + 14}" class="ch-tick" text-anchor="middle">${fmtNum(v)}</text>`).join('');
  // At most ~600 points per line (min/max per bucket keeps peaks).
  const decimate = (values) => {
    const n = values.length; const buckets = Math.min(n, 600);
    if (n <= buckets) return values.map((v, i) => [times[i], v]);
    const out = [];
    for (let b = 0; b < buckets; b++) {
      const i0 = Math.floor((b * n) / buckets); const i1 = Math.floor(((b + 1) * n) / buckets);
      let mn = i0; let mx = i0;
      for (let i = i0; i < i1; i++) { if (values[i] < values[mn]) mn = i; if (values[i] > values[mx]) mx = i; }
      for (const i of mn < mx ? [mn, mx] : [mx, mn]) out.push([times[i], values[i]]);
    }
    return out;
  };
  const lines = series.map((s, k) => {
    const color = s.color ?? PALETTE[k % PALETTE.length];
    const pts = decimate(s.values).filter(([, v]) => Number.isFinite(v));
    if (!pts.length) return '';
    const d = pts.map(([t, v], i) => `${i ? 'L' : 'M'}${X(t).toFixed(1)},${Y(v).toFixed(1)}`).join('');
    const fill = area ? `<path d="${d}L${X(pts[pts.length - 1][0]).toFixed(1)},${Y(lo)}L${X(pts[0][0]).toFixed(1)},${Y(lo)}Z" fill="${color}" opacity="0.12"/>` : '';
    return `${fill}<path d="${d}" fill="none" stroke="${color}" stroke-width="1.8" stroke-linejoin="round"/>`;
  }).join('');
  const leg = legend ? `<g class="ch-legend">${series.map((s, k) => `<g transform="translate(${pad.l + k * Math.min(170, iw / series.length)}, ${height - 8})"><rect width="10" height="3" y="-4" fill="${s.color ?? PALETTE[k % PALETTE.length]}"/><text x="14" y="0" class="ch-tick">${escapeHtml(s.name)}: ${fmtNum(s.values[s.values.length - 1])}</text></g>`).join('')}</g>` : '';
  return `<svg class="chart-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="${escapeHtml(title)}">
    ${title ? `<text x="${pad.l}" y="14" class="ch-title">${escapeHtml(title)}</text>` : ''}
    ${grid}<line x1="${pad.l}" x2="${pad.l}" y1="${pad.t}" y2="${pad.t + ih}" class="ch-axis"/><line x1="${pad.l}" x2="${pad.l + iw}" y1="${pad.t + ih}" y2="${pad.t + ih}" class="ch-axis"/>
    ${lines}${leg}${xLabel ? `<text x="${pad.l + iw}" y="${pad.t + ih - 4}" class="ch-tick" text-anchor="end">${escapeHtml(xLabel)}</text>` : ''}
  </svg>`;
}

function emptyChart(width, height, title) {
  return `<svg class="chart-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">${title ? `<text x="10" y="14" class="ch-title">${escapeHtml(title)}</text>` : ''}<text x="${width / 2}" y="${height / 2}" class="ch-tick" text-anchor="middle">—</text></svg>`;
}

/** Horizontal bars (utilization …): rows [{ label, value, max?, color?, text? }]. */
export function barRows(rows, { max = null, format = pct } = {}) {
  const top = max ?? Math.max(1e-9, ...rows.map((r) => r.value));
  return `<div class="hbars">${rows.map((r) => {
    const w = Math.max(0, Math.min(100, (r.value / top) * 100));
    return `<div class="hbar-row" title="${escapeHtml(`${r.label}: ${r.text ?? format(r.value)}`)}"><span class="hbar-label">${escapeHtml(r.label)}</span><span class="hbar-track"><i style="width:${w}%;background:${r.color ?? heat(r.value / (max ?? 1))}"></i></span><span class="hbar-value">${escapeHtml(r.text ?? format(r.value))}</span></div>`;
  }).join('')}</div>`;
}

/** Stacked bars of shares (busy / blocked / failed / idle) per block. rows: [{ label, parts: [{ value, color, name }] }]. */
export function stackRows(rows) {
  return `<div class="hbars">${rows.map((r) => `<div class="hbar-row" title="${escapeHtml(`${r.label}: ${r.parts.map((p) => `${p.name} ${pct(p.value)}`).join(', ')}`)}"><span class="hbar-label">${escapeHtml(r.label)}</span><span class="hbar-track stack">${r.parts.map((p) => `<i style="width:${Math.max(0, p.value * 100)}%;background:${p.color}"></i>`).join('')}</span><span class="hbar-value">${pct(r.parts[0]?.value ?? 0)}</span></div>`).join('')}</div>`;
}

/** A histogram of values (Monte Carlo results, cycle times). */
export function histogramChart(values, { width = 420, height = 170, bins = 20, title = '', color = '#2563eb' } = {}) {
  const v = values.filter(Number.isFinite);
  if (!v.length) return emptyChart(width, height, title);
  let lo = Math.min(...v); let hi = Math.max(...v);
  if (hi - lo < 1e-9) { lo -= 0.5; hi += 0.5; }
  const counts = new Array(bins).fill(0);
  for (const x of v) counts[Math.min(bins - 1, Math.floor(((x - lo) / (hi - lo)) * bins))] += 1;
  const pad = { l: 34, r: 8, t: title ? 22 : 8, b: 22 };
  const iw = width - pad.l - pad.r; const ih = height - pad.t - pad.b;
  const top = Math.max(...counts);
  const bw = iw / bins;
  const bars = counts.map((c, i) => `<rect x="${(pad.l + i * bw + 1).toFixed(1)}" y="${(pad.t + ih - (c / top) * ih).toFixed(1)}" width="${Math.max(1, bw - 2).toFixed(1)}" height="${((c / top) * ih).toFixed(1)}" fill="${color}" opacity="0.8" rx="1.5"><title>${fmtNum(lo + i * ((hi - lo) / bins))}–${fmtNum(lo + (i + 1) * ((hi - lo) / bins))}: ${c}</title></rect>`).join('');
  const xt = ticks(lo, hi, 5).map((x) => `<text x="${pad.l + ((x - lo) / (hi - lo)) * iw}" y="${height - 6}" class="ch-tick" text-anchor="middle">${fmtNum(x)}</text>`).join('');
  return `<svg class="chart-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">${title ? `<text x="${pad.l}" y="14" class="ch-title">${escapeHtml(title)}</text>` : ''}<line x1="${pad.l}" x2="${pad.l + iw}" y1="${pad.t + ih}" y2="${pad.t + ih}" class="ch-axis"/>${bars}${xt}<text x="${pad.l - 4}" y="${pad.t + 8}" class="ch-tick" text-anchor="end">${top}</text></svg>`;
}

/** State timeline (Gantt) of blocks: rows [{ label, segments: [[t0, state]] }] up to `end`. */
export function timelineChart(rows, end, { width = 640, rowHeight = 18, colors = {}, title = '' } = {}) {
  const pad = { l: 120, r: 10, t: title ? 22 : 6, b: 20 };
  const height = pad.t + pad.b + rows.length * rowHeight;
  const iw = width - pad.l - pad.r;
  const start = 0; const X = (t) => pad.l + ((t - start) / ((end - start) || 1)) * iw;
  const body = rows.map((r, i) => {
    const y = pad.t + i * rowHeight;
    const segs = r.segments.map(([t, s], k) => { const t1 = r.segments[k + 1]?.[0] ?? end; const w = Math.max(0.5, X(t1) - X(t)); return `<rect x="${X(t).toFixed(1)}" y="${y + 3}" width="${w.toFixed(1)}" height="${rowHeight - 6}" fill="${colors[s] ?? '#94a3b8'}"><title>${escapeHtml(`${r.label}: ${s} ${fmtNum(t)}–${fmtNum(t1)}`)}</title></rect>`; }).join('');
    return `<text x="${pad.l - 6}" y="${y + rowHeight / 2 + 4}" class="ch-tick" text-anchor="end">${escapeHtml(r.label)}</text>${segs}`;
  }).join('');
  const xt = ticks(start, end, 6).map((t) => `<text x="${X(t)}" y="${height - 6}" class="ch-tick" text-anchor="middle">${fmtNum(t)}</text>`).join('');
  return `<svg class="chart-svg" viewBox="0 0 ${width} ${height}" style="height:${height}px">${title ? `<text x="10" y="14" class="ch-title">${escapeHtml(title)}</text>` : ''}${body}${xt}</svg>`;
}

export function heat(u) {
  const x = Math.min(1, Math.max(0, Number(u) || 0));
  return `hsl(${130 - 130 * x}, 70%, 46%)`;
}
