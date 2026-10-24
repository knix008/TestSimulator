// Line charts on a canvas: probe temperatures over time, values along a line
// cut, body maxima. Colours come from the theme; series get a fixed palette.
import { niceTicks, formatValue } from '../core/colormap.js';

export const SERIES_COLORS = ['#3ec1ff', '#ff7a59', '#7ddc6a', '#f5c542', '#c58cff', '#ff5fa2', '#4fd1c5', '#ffa94d', '#a0aec0', '#e57373'];

/**
 * Draws series [{ name, points: [[x, y], …], color? }] into the canvas.
 * opts: { xLabel, yLabel, marker (x of a vertical line), css (custom property reader) }.
 */
export function drawLineChart(canvas, series, opts = {}) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, rect.width);
  const height = Math.max(1, rect.height);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  const css = opts.css ?? ((name) => getComputedStyle(canvas).getPropertyValue(name).trim());
  const text = css('--text') || '#ddd';
  const muted = css('--muted') || '#999';
  const line = css('--line') || '#444';
  const all = series.flatMap((s) => s.points).filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
  if (!all.length) return;
  let x0 = Math.min(...all.map((p) => p[0]));
  let x1 = Math.max(...all.map((p) => p[0]));
  let y0 = Math.min(...all.map((p) => p[1]));
  let y1 = Math.max(...all.map((p) => p[1]));
  if (x1 - x0 < 1e-12) { x0 -= 0.5; x1 += 0.5; }
  if (y1 - y0 < 1e-9) { y0 -= 0.5; y1 += 0.5; }
  const pad = (y1 - y0) * 0.06;
  y0 -= pad;
  y1 += pad;
  const left = 56;
  const right = Math.min(180, Math.max(110, width * 0.18));
  const top = 10;
  const bottom = 30;
  const plotW = Math.max(10, width - left - right);
  const plotH = Math.max(10, height - top - bottom);
  const sx = (x) => left + ((x - x0) / (x1 - x0)) * plotW;
  const sy = (y) => top + plotH - ((y - y0) / (y1 - y0)) * plotH;
  ctx.font = '11px "Segoe UI", sans-serif';
  ctx.strokeStyle = line;
  ctx.fillStyle = muted;
  ctx.lineWidth = 1;
  for (const v of niceTicks(y0, y1, Math.max(3, Math.round(plotH / 34)))) {
    const y = Math.round(sy(v)) + 0.5;
    ctx.globalAlpha = 0.5;
    ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(left + plotW, y); ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.textAlign = 'right';
    ctx.fillText(formatValue(v), left - 6, y + 4);
  }
  for (const v of niceTicks(x0, x1, Math.max(3, Math.round(plotW / 90)))) {
    const x = Math.round(sx(v)) + 0.5;
    ctx.globalAlpha = 0.35;
    ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, top + plotH); ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    ctx.fillText(formatValue(v), x, top + plotH + 14);
  }
  ctx.strokeStyle = muted;
  ctx.strokeRect(left + 0.5, top + 0.5, plotW, plotH);
  ctx.textAlign = 'left';
  if (opts.xLabel) {
    ctx.fillStyle = muted;
    ctx.textAlign = 'right';
    ctx.fillText(opts.xLabel, left + plotW, top + plotH + 27);
  }
  if (opts.yLabel) {
    ctx.save();
    ctx.translate(12, top + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillStyle = muted;
    ctx.fillText(opts.yLabel, 0, 0);
    ctx.restore();
  }
  ctx.save();
  ctx.beginPath();
  ctx.rect(left, top, plotW, plotH);
  ctx.clip();
  series.forEach((s, index) => {
    const color = s.color ?? SERIES_COLORS[index % SERIES_COLORS.length];
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    let started = false;
    for (const [x, y] of s.points) {
      if (!Number.isFinite(x) || !Number.isFinite(y)) { started = false; continue; }
      if (!started) { ctx.moveTo(sx(x), sy(y)); started = true; } else ctx.lineTo(sx(x), sy(y));
    }
    ctx.stroke();
    if (s.points.length < 40) {
      ctx.fillStyle = color;
      for (const [x, y] of s.points) if (Number.isFinite(y)) { ctx.beginPath(); ctx.arc(sx(x), sy(y), 2.4, 0, Math.PI * 2); ctx.fill(); }
    }
  });
  if (opts.marker != null && Number.isFinite(opts.marker)) {
    ctx.strokeStyle = text;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(Math.round(sx(opts.marker)) + 0.5, top);
    ctx.lineTo(Math.round(sx(opts.marker)) + 0.5, top + plotH);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();
  // Legend on the right
  ctx.textAlign = 'left';
  series.slice(0, 12).forEach((s, index) => {
    const y = top + 8 + index * 16;
    ctx.fillStyle = s.color ?? SERIES_COLORS[index % SERIES_COLORS.length];
    ctx.fillRect(left + plotW + 10, y - 6, 12, 3);
    ctx.fillStyle = text;
    const last = s.points.length ? s.points[s.points.length - 1][1] : NaN;
    const label = `${s.name}${Number.isFinite(last) ? ` ${formatValue(last)}` : ''}`;
    ctx.fillText(label.length > 26 ? `${label.slice(0, 25)}…` : label, left + plotW + 26, y);
  });
}

/**
 * Horizontal bars [{ name, value }] — one value per probe or body of a steady study.
 * opts: { unit, css }.
 */
export function drawBarChart(canvas, bars, opts = {}) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, rect.width);
  const height = Math.max(1, rect.height);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  const css = opts.css ?? ((name) => getComputedStyle(canvas).getPropertyValue(name).trim());
  const text = css('--text') || '#ddd';
  const muted = css('--muted') || '#999';
  const line = css('--line') || '#444';
  const list = bars.filter((b) => Number.isFinite(b.value));
  if (!list.length) return;
  ctx.font = '11px "Segoe UI", sans-serif';
  const labelW = Math.min(220, Math.max(...list.map((b) => ctx.measureText(b.name).width)) + 16);
  const lo = Math.min(0, ...list.map((b) => b.value));
  const hi = Math.max(...list.map((b) => b.value));
  const ticks = niceTicks(lo, hi > lo ? hi : lo + 1, 6);
  const x0 = labelW;
  const x1 = width - 70;
  const top = 8;
  const bottom = height - 22;
  const rowH = Math.min(26, (bottom - top) / list.length);
  const sx = (v) => x0 + ((v - ticks[0]) / (ticks[ticks.length - 1] - ticks[0] || 1)) * (x1 - x0);
  ctx.strokeStyle = line;
  ctx.fillStyle = muted;
  ctx.textAlign = 'center';
  for (const v of ticks) {
    const x = Math.round(sx(v)) + 0.5;
    ctx.globalAlpha = 0.45;
    ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bottom); ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillText(formatValue(v), x, bottom + 14);
  }
  list.forEach((b, i) => {
    const y = top + i * rowH;
    const color = b.color ?? SERIES_COLORS[i % SERIES_COLORS.length];
    ctx.fillStyle = color;
    ctx.fillRect(sx(Math.max(lo, 0)), y + rowH * 0.18, Math.max(1, sx(b.value) - sx(Math.max(lo, 0))), rowH * 0.64);
    ctx.fillStyle = text;
    ctx.textAlign = 'right';
    ctx.fillText(b.name.length > 30 ? `${b.name.slice(0, 29)}…` : b.name, x0 - 8, y + rowH / 2 + 4);
    ctx.textAlign = 'left';
    ctx.fillText(`${formatValue(b.value)}${opts.unit ? ` ${opts.unit}` : ''}`, sx(b.value) + 6, y + rowH / 2 + 4);
  });
}
