// Charts on a canvas: lines, steps, areas, scatter (optionally coloured by a
// group), vertical bars on a numeric axis, horizontal bars for labelled values
// and heat maps of grids with a colour bar. Colours come from the theme;
// series get a fixed palette. Log axes are supported for x and y.
import { niceTicks, formatValue, lut } from '../core/colormap.js';

export const SERIES_COLORS = ['#3ec1ff', '#ff7a59', '#7ddc6a', '#f5c542', '#c58cff', '#ff5fa2', '#4fd1c5', '#ffa94d', '#a0aec0', '#e57373'];

function setup(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, rect.width);
  const height = Math.max(1, rect.height);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  return { ctx, width, height };
}

function palette(canvas, opts) {
  const css = opts.css ?? ((name) => getComputedStyle(canvas).getPropertyValue(name).trim());
  return { text: css('--text') || '#ddd', muted: css('--muted') || '#999', line: css('--line') || '#444', accent: css('--accent') || '#3ec1ff' };
}

/** Ticks of a log axis: the decades (and 2, 5 when there are few decades). */
function logTicks(lo, hi, room = 8) {
  const a = Math.floor(lo);
  const b = Math.ceil(hi);
  const step = Math.max(1, Math.ceil((b - a) / Math.max(2, room)));
  const out = [];
  for (let k = Math.ceil(a / step) * step; k <= b; k += step) {
    out.push(k);
    if (b - a <= 3) out.push(k + Math.log10(2), k + Math.log10(5));
  }
  return out.filter((v) => v >= lo - 1e-9 && v <= hi + 1e-9);
}

const logLabel = (v) => formatValue(10 ** v, 3);

/**
 * Draws series [{ name, points: [[x, y], …], color?, mode? }] into the canvas.
 * opts: { xLabel, yLabel, title, mode ('line' | 'scatter' | 'step' | 'area' | 'bar'), logX, logY, marker,
 *         legend (default true), compact (small margins), equal (same scale on both axes), css }.
 */
export function drawLineChart(canvas, series, opts = {}) {
  const { ctx, width, height } = setup(canvas);
  const c = palette(canvas, opts);
  const tx = (x) => (opts.logX ? (x > 0 ? Math.log10(x) : NaN) : x);
  const ty = (y) => (opts.logY ? (y > 0 ? Math.log10(y) : NaN) : y);
  let x0 = Infinity; let x1 = -Infinity; let y0 = Infinity; let y1 = -Infinity;
  for (const s of series) {
    for (const [px, py] of s.points) {
      const x = tx(px); const y = ty(py);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  if (!Number.isFinite(x0)) return false;
  const anyBar = series.some((s) => (s.mode ?? opts.mode) === 'bar');
  if (anyBar && !opts.logY) { y0 = Math.min(y0, 0); y1 = Math.max(y1, 0); }
  if (x1 - x0 < 1e-12) { x0 -= 0.5; x1 += 0.5; }
  if (y1 - y0 < 1e-12 * Math.max(1, Math.abs(y0))) { y0 -= 0.5; y1 += 0.5; }
  const pad = (y1 - y0) * 0.06;
  if (!(anyBar && y0 === 0)) y0 -= pad;
  y1 += pad;
  if (anyBar) {
    // Room for half a bar on both ends.
    const xs = series.flatMap((s) => s.points.map((p) => tx(p[0]))).filter(Number.isFinite).sort((a, b) => a - b);
    let dx = Infinity;
    for (let i = 1; i < xs.length; i++) if (xs[i] > xs[i - 1]) dx = Math.min(dx, xs[i] - xs[i - 1]);
    if (Number.isFinite(dx)) { x0 -= dx / 2; x1 += dx / 2; }
  }
  const legend = opts.legend !== false && series.length > 1;
  const compact = opts.compact || width < 260;
  const titleH = opts.title ? 18 : 0;
  const left = compact ? 40 : 58;
  const right = legend ? Math.min(170, Math.max(96, width * 0.2)) : 12;
  const top = 8 + titleH;
  const bottom = compact ? 22 : 32;
  const plotW = Math.max(10, width - left - right);
  const plotH = Math.max(10, height - top - bottom);
  if (opts.equal && !opts.logX && !opts.logY) {
    // One unit is as long on x as on y (maps, shapes, robot paths): widen the tighter axis.
    const k = Math.max((x1 - x0) / plotW, (y1 - y0) / plotH);
    const cx = (x0 + x1) / 2; const cy = (y0 + y1) / 2;
    x0 = cx - (k * plotW) / 2; x1 = cx + (k * plotW) / 2; y0 = cy - (k * plotH) / 2; y1 = cy + (k * plotH) / 2;
  }
  const sx = (x) => left + ((x - x0) / (x1 - x0)) * plotW;
  const sy = (y) => top + plotH - ((y - y0) / (y1 - y0)) * plotH;
  ctx.font = '11px "Segoe UI", sans-serif';
  if (opts.title) {
    ctx.fillStyle = c.text;
    ctx.textAlign = 'left';
    ctx.font = '600 12px "Segoe UI", sans-serif';
    ctx.fillText(opts.title, left, 14);
    ctx.font = '11px "Segoe UI", sans-serif';
  }
  ctx.strokeStyle = c.line;
  ctx.fillStyle = c.muted;
  ctx.lineWidth = 1;
  const yt = opts.logY ? logTicks(y0, y1, Math.round(plotH / 22)) : niceTicks(y0, y1, Math.max(3, Math.round(plotH / 34)));
  for (const v of yt) {
    const y = Math.round(sy(v)) + 0.5;
    if (y < top - 1 || y > top + plotH + 1) continue;
    if (opts.grid !== false) {
      ctx.globalAlpha = 0.45;
      ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(left + plotW, y); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.textAlign = 'right';
    ctx.fillText(opts.logY ? logLabel(v) : formatValue(v), left - 5, y + 4);
  }
  const xt = opts.logX ? logTicks(x0, x1, Math.round(plotW / 60)) : niceTicks(x0, x1, Math.max(3, Math.round(plotW / 90)));
  for (const v of xt) {
    const x = Math.round(sx(v)) + 0.5;
    if (x < left - 1 || x > left + plotW + 1) continue;
    if (opts.grid !== false) {
      ctx.globalAlpha = 0.3;
      ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, top + plotH); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.textAlign = 'center';
    ctx.fillText(opts.logX ? logLabel(v) : formatValue(v), x, top + plotH + 14);
  }
  ctx.strokeStyle = c.muted;
  ctx.strokeRect(left + 0.5, top + 0.5, plotW, plotH);
  if (opts.xLabel && !compact) {
    ctx.fillStyle = c.muted;
    ctx.textAlign = 'right';
    ctx.fillText(opts.xLabel, left + plotW, top + plotH + 27);
  }
  if (opts.yLabel && !compact) {
    ctx.save();
    ctx.translate(11, top + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillStyle = c.muted;
    ctx.fillText(opts.yLabel, 0, 0);
    ctx.restore();
  }
  ctx.save();
  ctx.beginPath();
  ctx.rect(left, top, plotW, plotH);
  ctx.clip();
  const barSeries = series.filter((s) => (s.mode ?? opts.mode) === 'bar');
  series.forEach((s, index) => {
    const color = s.color ?? SERIES_COLORS[index % SERIES_COLORS.length];
    const mode = s.mode ?? opts.mode ?? 'line';
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = s.width ?? 1.6;
    const pts = s.points;
    if (mode === 'scatter') {
      const r = pts.length > 4000 ? 1.2 : pts.length > 800 ? 1.8 : 2.6;
      ctx.globalAlpha = pts.length > 4000 ? 0.6 : 0.85;
      for (const [px, py] of pts) {
        const x = tx(px); const y = ty(py);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        ctx.beginPath(); ctx.arc(sx(x), sy(y), r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      return;
    }
    if (mode === 'bar') {
      const xs = pts.map((p) => tx(p[0])).filter(Number.isFinite).sort((a, b) => a - b);
      let dx = Infinity;
      for (let i = 1; i < xs.length; i++) if (xs[i] > xs[i - 1]) dx = Math.min(dx, xs[i] - xs[i - 1]);
      if (!Number.isFinite(dx)) dx = (x1 - x0) / 10;
      const k = barSeries.indexOf(s);
      const w = (sx(x0 + dx) - sx(x0)) * 0.84 / barSeries.length;
      const base = sy(opts.logY ? y0 : Math.max(y0, Math.min(0, y1)));
      ctx.globalAlpha = 0.85;
      for (const [px, py] of pts) {
        const x = tx(px); const y = ty(py);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        const cx = sx(x) - (w * barSeries.length) / 2 + k * w;
        ctx.fillRect(cx, Math.min(base, sy(y)), Math.max(1, w - 1), Math.abs(base - sy(y)));
      }
      ctx.globalAlpha = 1;
      return;
    }
    ctx.beginPath();
    let started = false;
    let last = null;
    let first = null;
    // Long series: draw at most a few points per pixel (min/max per column keeps the envelope).
    const step = pts.length > plotW * 4 ? Math.floor(pts.length / (plotW * 2)) : 1;
    for (let i = 0; i < pts.length; i += step) {
      let lo = null; let hi = null;
      const end = Math.min(pts.length, i + step);
      for (let j = i; j < end; j++) {
        const x = tx(pts[j][0]); const y = ty(pts[j][1]);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        if (!lo || y < lo[1]) lo = [x, y];
        if (!hi || y > hi[1]) hi = [x, y];
      }
      const group = step === 1 ? (lo ? [lo] : []) : [lo, hi].filter(Boolean).sort((a, b) => a[0] - b[0]);
      if (!group.length) { started = false; continue; }
      for (const [x, y] of group) {
        const X = sx(x); const Y = sy(y);
        if (!started) { ctx.moveTo(X, Y); started = true; first ??= [X, Y]; } else if (mode === 'step' && last) { ctx.lineTo(X, last[1]); ctx.lineTo(X, Y); } else ctx.lineTo(X, Y);
        last = [X, Y];
      }
    }
    if (mode === 'area' && first && last) {
      const base = sy(opts.logY ? y0 : Math.max(y0, Math.min(0, y1)));
      ctx.lineTo(last[0], base); ctx.lineTo(first[0], base); ctx.closePath();
      ctx.globalAlpha = 0.3; ctx.fill(); ctx.globalAlpha = 1;
    } else ctx.stroke();
    if (pts.length < 40 && mode === 'line') {
      for (const [px, py] of pts) {
        const x = tx(px); const y = ty(py);
        if (Number.isFinite(x) && Number.isFinite(y)) { ctx.beginPath(); ctx.arc(sx(x), sy(y), 2.4, 0, Math.PI * 2); ctx.fill(); }
      }
    }
  });
  if (opts.marker != null && Number.isFinite(opts.marker)) {
    ctx.strokeStyle = c.text;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(Math.round(sx(tx(opts.marker))) + 0.5, top);
    ctx.lineTo(Math.round(sx(tx(opts.marker))) + 0.5, top + plotH);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();
  if (legend) {
    ctx.textAlign = 'left';
    const rows = Math.max(1, Math.floor((plotH - 4) / 16));
    series.slice(0, rows).forEach((s, index) => {
      const y = top + 8 + index * 16;
      ctx.fillStyle = s.color ?? SERIES_COLORS[index % SERIES_COLORS.length];
      if ((s.mode ?? opts.mode) === 'scatter') { ctx.beginPath(); ctx.arc(left + plotW + 16, y - 4, 3, 0, Math.PI * 2); ctx.fill(); } else ctx.fillRect(left + plotW + 10, y - 6, 12, 3);
      ctx.fillStyle = c.text;
      const label = s.name ?? '';
      const max = Math.max(4, Math.floor((right - 30) / 6));
      ctx.fillText(label.length > max ? `${label.slice(0, max - 1)}…` : label, left + plotW + 26, y);
    });
  }
  // The mapping, for the hover read-out.
  canvas.chartMap = { left, top, plotW, plotH, x0, x1, y0, y1, logX: Boolean(opts.logX), logY: Boolean(opts.logY) };
  return true;
}

/** Horizontal bars [{ name, value, color? }] — one value per label. opts: { unit, title, css }. */
export function drawBarChart(canvas, bars, opts = {}) {
  const { ctx, width, height } = setup(canvas);
  const c = palette(canvas, opts);
  const list = bars.filter((b) => Number.isFinite(b.value)).slice(0, 200);
  if (!list.length) return false;
  ctx.font = '11px "Segoe UI", sans-serif';
  const titleH = opts.title ? 18 : 0;
  if (opts.title) {
    ctx.fillStyle = c.text;
    ctx.font = '600 12px "Segoe UI", sans-serif';
    ctx.fillText(opts.title, 8, 14);
    ctx.font = '11px "Segoe UI", sans-serif';
  }
  const labelW = Math.min(Math.max(80, width * 0.35), Math.max(...list.map((b) => ctx.measureText(b.name).width)) + 16);
  const lo = Math.min(0, ...list.map((b) => b.value));
  const hi = Math.max(0, ...list.map((b) => b.value));
  const ticks = niceTicks(lo, hi > lo ? hi : lo + 1, 6);
  const x0 = labelW;
  const x1 = width - 64;
  const top = 6 + titleH;
  const bottom = height - 20;
  const rowH = Math.min(24, (bottom - top) / list.length);
  const sx = (v) => x0 + ((v - ticks[0]) / (ticks[ticks.length - 1] - ticks[0] || 1)) * (x1 - x0);
  ctx.strokeStyle = c.line;
  ctx.fillStyle = c.muted;
  ctx.textAlign = 'center';
  for (const v of ticks) {
    const x = Math.round(sx(v)) + 0.5;
    if (opts.grid !== false) {
      ctx.globalAlpha = 0.45;
      ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bottom); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.fillText(formatValue(v), x, bottom + 13);
  }
  list.forEach((b, i) => {
    const y = top + i * rowH;
    ctx.fillStyle = b.color ?? SERIES_COLORS[i % SERIES_COLORS.length];
    const a = sx(0);
    const e = sx(b.value);
    ctx.fillRect(Math.min(a, e), y + rowH * 0.18, Math.max(1, Math.abs(e - a)), rowH * 0.64);
    if (rowH >= 9) {
      ctx.fillStyle = c.text;
      ctx.textAlign = 'right';
      ctx.fillText(b.name.length > 34 ? `${b.name.slice(0, 33)}…` : b.name, x0 - 6, y + rowH / 2 + 4);
      ctx.textAlign = 'left';
      ctx.fillText(`${formatValue(b.value)}${opts.unit ? ` ${opts.unit}` : ''}`, Math.max(a, e) + 5, y + rowH / 2 + 4);
    }
  });
  canvas.chartMap = null;
  return true;
}

/**
 * A heat map of grid { x, y, z (row-major ny × nx), xLabel, yLabel, zLabel, xNames?, yNames? }.
 * opts: { colormap, title, path: [[x, y], …] (a line drawn on top, e.g. an optimiser's path), css }.
 */
export function drawHeatmap(canvas, grid, opts = {}) {
  const { ctx, width, height } = setup(canvas);
  const c = palette(canvas, opts);
  const nx = grid.x.length;
  const ny = grid.y.length;
  if (!nx || !ny) return false;
  let lo = Infinity; let hi = -Infinity;
  for (const v of grid.z) if (Number.isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v; }
  if (!Number.isFinite(lo)) return false;
  if (hi - lo < 1e-300) { hi = lo + 1; }
  const named = Boolean(grid.xNames || grid.yNames);
  ctx.font = '11px "Segoe UI", sans-serif';
  const titleH = opts.title ? 18 : 0;
  const nameW = grid.yNames ? Math.min(140, Math.max(...grid.yNames.map((s) => ctx.measureText(s).width)) + 10) : 0;
  const left = (opts.compact ? 40 : 56) + nameW;
  const right = 64;
  const top = 8 + titleH;
  const bottom = grid.xNames ? 60 : opts.compact ? 22 : 32;
  const plotW = Math.max(10, width - left - right);
  const plotH = Math.max(10, height - top - bottom);
  if (opts.title) {
    ctx.fillStyle = c.text;
    ctx.font = '600 12px "Segoe UI", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(opts.title, left, 14);
    ctx.font = '11px "Segoe UI", sans-serif';
  }
  // Cells: an image of nx × ny pixels scaled up (nearest for small grids, smooth for big ones).
  const table = lut(opts.colormap ?? 'turbo', 0);
  const img = new ImageData(nx, ny);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const v = grid.z[j * nx + i];
      const at = ((ny - 1 - j) * nx + i) * 4;
      if (!Number.isFinite(v)) { img.data[at + 3] = 0; continue; }
      const k = Math.max(0, Math.min(255, Math.round(((v - lo) / (hi - lo)) * 255)));
      img.data[at] = table[k * 3]; img.data[at + 1] = table[k * 3 + 1]; img.data[at + 2] = table[k * 3 + 2]; img.data[at + 3] = 255;
    }
  }
  const off = document.createElement('canvas');
  off.width = nx; off.height = ny;
  off.getContext('2d').putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = !named && nx * ny > 400;
  ctx.drawImage(off, left, top, plotW, plotH);
  ctx.imageSmoothingEnabled = true;
  ctx.strokeStyle = c.muted;
  ctx.strokeRect(left + 0.5, top + 0.5, plotW, plotH);
  const gx0 = grid.x[0]; const gx1 = grid.x[nx - 1]; const gy0 = grid.y[0]; const gy1 = grid.y[ny - 1];
  const cellW = plotW / nx; const cellH = plotH / ny;
  // Axis positions of cell centres: uniform cells (the raster is drawn evenly).
  const sx = (x) => left + (nx > 1 ? ((x - gx0) / (gx1 - gx0)) * (plotW - cellW) + cellW / 2 : plotW / 2);
  const sy = (y) => top + plotH - (ny > 1 ? ((y - gy0) / (gy1 - gy0)) * (plotH - cellH) + cellH / 2 : plotH / 2);
  ctx.fillStyle = c.muted;
  if (grid.xNames) {
    ctx.save();
    grid.xNames.forEach((name, i) => {
      ctx.save();
      ctx.translate(left + (i + 0.5) * cellW, top + plotH + 6);
      ctx.rotate(-Math.PI / 4);
      ctx.textAlign = 'right';
      ctx.fillText(name.length > 14 ? `${name.slice(0, 13)}…` : name, 0, 4);
      ctx.restore();
    });
    ctx.restore();
  } else if (nx > 1) {
    ctx.textAlign = 'center';
    for (const v of niceTicks(gx0, gx1, Math.max(3, Math.round(plotW / 90)))) {
      if (v < Math.min(gx0, gx1) || v > Math.max(gx0, gx1)) continue;
      ctx.fillText(formatValue(v), sx(v), top + plotH + 14);
    }
  }
  if (grid.yNames) {
    ctx.textAlign = 'right';
    grid.yNames.forEach((name, j) => ctx.fillText(name.length > 18 ? `${name.slice(0, 17)}…` : name, left - 6, top + plotH - (j + 0.5) * cellH + 4));
  } else if (ny > 1) {
    ctx.textAlign = 'right';
    for (const v of niceTicks(gy0, gy1, Math.max(3, Math.round(plotH / 34)))) {
      if (v < Math.min(gy0, gy1) || v > Math.max(gy0, gy1)) continue;
      ctx.fillText(formatValue(v), left - 5, sy(v) + 4);
    }
  }
  if (!opts.compact) {
    if (grid.xLabel && !grid.xNames) { ctx.textAlign = 'right'; ctx.fillText(grid.xLabel, left + plotW, top + plotH + 27); }
    if (grid.yLabel && !grid.yNames) { ctx.save(); ctx.translate(11, top + plotH / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center'; ctx.fillText(grid.yLabel, 0, 0); ctx.restore(); }
  }
  // Values in the cells of a small labelled matrix (correlations, confusion).
  if (named && nx * ny <= 144 && cellW > 34 && cellH > 16) {
    ctx.textAlign = 'center';
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const v = grid.z[j * nx + i];
      if (!Number.isFinite(v)) continue;
      const k = Math.round(((v - lo) / (hi - lo)) * 255);
      const lum = 0.299 * table[k * 3] + 0.587 * table[k * 3 + 1] + 0.114 * table[k * 3 + 2];
      ctx.fillStyle = lum > 140 ? '#111' : '#fff';
      ctx.fillText(formatValue(v, 3), left + (i + 0.5) * cellW, top + plotH - (j + 0.5) * cellH + 4);
    }
  }
  if (opts.path?.length > 1 && !named) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(left, top, plotW, plotH);
    ctx.clip();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    opts.path.forEach(([x, y], i) => (i ? ctx.lineTo(sx(x), sy(y)) : ctx.moveTo(sx(x), sy(y))));
    ctx.stroke();
    const [ex, ey] = opts.path[opts.path.length - 1];
    ctx.fillStyle = '#ff3b6b';
    ctx.beginPath(); ctx.arc(sx(ex), sy(ey), 4.5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.stroke();
    ctx.restore();
  }
  // Colour bar.
  const bx = left + plotW + 14;
  for (let k = 0; k < plotH; k++) {
    const n = Math.round((1 - k / plotH) * 255);
    ctx.fillStyle = `rgb(${table[n * 3]},${table[n * 3 + 1]},${table[n * 3 + 2]})`;
    ctx.fillRect(bx, top + k, 12, 1);
  }
  ctx.strokeStyle = c.line;
  ctx.strokeRect(bx + 0.5, top + 0.5, 12, plotH);
  ctx.fillStyle = c.muted;
  ctx.textAlign = 'left';
  for (const v of niceTicks(lo, hi, 5)) {
    if (v < lo || v > hi) continue;
    ctx.fillText(formatValue(v, 3), bx + 16, top + plotH - ((v - lo) / (hi - lo)) * plotH + 4);
  }
  if (grid.zLabel) {
    ctx.save(); ctx.translate(width - 4, top + plotH / 2); ctx.rotate(Math.PI / 2); ctx.textAlign = 'center'; ctx.fillText(grid.zLabel, 0, 0); ctx.restore();
  }
  canvas.chartMap = { left, top, plotW, plotH, x0: gx0, x1: gx1, y0: gy0, y1: gy1, grid: true };
  return true;
}

/** The data coordinates under a mouse position (after a chart was drawn), or null outside the plot. */
export function chartValueAt(canvas, clientX, clientY) {
  const m = canvas.chartMap;
  if (!m) return null;
  const r = canvas.getBoundingClientRect();
  const px = clientX - r.left;
  const py = clientY - r.top;
  if (px < m.left || px > m.left + m.plotW || py < m.top || py > m.top + m.plotH) return null;
  let x = m.x0 + ((px - m.left) / m.plotW) * (m.x1 - m.x0);
  let y = m.y0 + ((m.top + m.plotH - py) / m.plotH) * (m.y1 - m.y0);
  if (m.logX) x = 10 ** x;
  if (m.logY) y = 10 ** y;
  return { x, y, px, py };
}
