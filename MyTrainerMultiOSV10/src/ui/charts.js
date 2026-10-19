// Canvas drawing shared by the views: colour maps, line charts, histograms,
// heat maps, picture tiles, scatter plots with decision boundaries, bar charts
// and confusion matrices. Colours come from the theme (CSS variables).

export const CLASS_COLORS = ['#4e79a7', '#f28e2b', '#59a14f', '#e15759', '#b07aa1', '#76b7b2', '#edc948', '#ff9da7', '#9c755f', '#bab0ac'];
export const SERIES = { train: '#4e79a7', val: '#f28e2b', lr: '#59a14f', test: '#e15759' };

export function theme() {
  const style = getComputedStyle(document.documentElement);
  const v = (name, fallback) => style.getPropertyValue(name).trim() || fallback;
  return {
    text: v('--text', '#1d2433'), muted: v('--muted', '#667085'), border: v('--border', '#d9dfea'), surface: v('--surface', '#ffffff'),
    bg: v('--bg', '#eef2f8'), accent: v('--accent', '#3a6cf0'), chart: v('--chart', '#ffffff'), dark: document.documentElement.style.colorScheme === 'dark',
  };
}

/** Sizes a canvas for the screen's pixel ratio; returns { ctx, width, height } in CSS pixels. */
export function setupCanvas(canvas, width = null, height = null) {
  const ratio = Math.min(3, globalThis.devicePixelRatio || 1);
  // A canvas drawn at a fixed height before and at its box's size now: give the box back first.
  if (height == null && canvas.dataset.fixedHeight) { delete canvas.dataset.fixedHeight; canvas.style.height = ''; canvas.style.flex = ''; }
  const w = Math.max(1, Math.round(width ?? canvas.clientWidth ?? 300));
  const h = Math.max(1, Math.round(height ?? canvas.clientHeight ?? 150));
  if (canvas.width !== Math.round(w * ratio) || canvas.height !== Math.round(h * ratio)) {
    canvas.width = Math.round(w * ratio);
    canvas.height = Math.round(h * ratio);
  }
  // A size given here is also the shown size, so the drawing is never stretched by CSS.
  if (height != null) { canvas.dataset.fixedHeight = '1'; canvas.style.flex = '0 0 auto'; if (canvas.style.height !== h + 'px') canvas.style.height = h + 'px'; }
  if (width != null && canvas.style.width !== w + 'px') canvas.style.width = w + 'px';
  const ctx = canvas.getContext('2d');
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, w, h);
  return { ctx, width: w, height: h };
}

// ───────────────────────── colour maps

const VIRIDIS = [[68, 1, 84], [72, 40, 120], [62, 74, 137], [49, 104, 142], [38, 130, 142], [31, 158, 137], [53, 183, 121], [110, 206, 88], [181, 222, 43], [253, 231, 37]];
const MAGMA = [[0, 0, 4], [28, 16, 68], [79, 18, 123], [129, 37, 129], [181, 54, 122], [229, 80, 100], [251, 135, 97], [254, 194, 135], [252, 253, 191]];

function ramp(stops, t) {
  const x = Math.min(1, Math.max(0, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  const f = x - i;
  return stops[i].map((v, k) => Math.round(v + (stops[i + 1][k] - v) * f));
}

/**
 * [r, g, b] for a value. 'diverging' maps negative → blue, 0 → neutral, positive → red (|max| scaled);
 * the others map min…max along a ramp.
 */
export function colorOf(value, min, max, map = 'diverging', dark = false) {
  if (!Number.isFinite(value)) return [128, 128, 128];
  if (map === 'diverging') {
    const limit = Math.max(Math.abs(min), Math.abs(max)) || 1;
    const t = Math.max(-1, Math.min(1, value / limit));
    const neutral = dark ? [40, 44, 54] : [246, 247, 250];
    const end = t < 0 ? [49, 112, 214] : [222, 70, 60];
    const a = Math.abs(t) ** 0.8;
    return neutral.map((v, k) => Math.round(v + (end[k] - v) * a));
  }
  const t = (value - min) / ((max - min) || 1);
  if (map === 'magma') return ramp(MAGMA, t);
  if (map === 'gray') { const g = Math.round(Math.min(1, Math.max(0, t)) * 255); return [g, g, g]; }
  return ramp(VIRIDIS, t);
}

export const rgb = ([r, g, b], a = 1) => (a === 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${a})`);

export function range(values) {
  let min = Infinity; let max = -Infinity;
  for (const v of values ?? []) { if (v < min) min = v; if (v > max) max = v; }
  return Number.isFinite(min) ? { min, max } : { min: 0, max: 0 };
}

export const fmt = (value, digits = 3) => {
  if (value == null || !Number.isFinite(value)) return '–';
  const a = Math.abs(value);
  if (a !== 0 && (a < 1e-3 || a >= 1e5)) return value.toExponential(2);
  return Number(value.toFixed(digits)).toString();
};

// ───────────────────────── heat maps and pictures

/** Draws a rows×cols grid of values (row-major) into a rectangle. */
export function drawHeatmap(ctx, values, rows, cols, x, y, w, h, { min = null, max = null, map = 'diverging', dark = false, smooth = false } = {}) {
  if (!values || !rows || !cols) return;
  const r = min == null || max == null ? range(values) : { min, max };
  const image = new ImageData(cols, rows);
  for (let i = 0; i < rows * cols; i++) {
    const [cr, cg, cb] = colorOf(values[i], r.min, r.max, map, dark);
    image.data[i * 4] = cr; image.data[i * 4 + 1] = cg; image.data[i * 4 + 2] = cb; image.data[i * 4 + 3] = 255;
  }
  const off = new OffscreenCanvas(cols, rows);
  off.getContext('2d').putImageData(image, 0, 0);
  ctx.save();
  ctx.imageSmoothingEnabled = smooth;
  ctx.drawImage(off, x, y, w, h);
  ctx.restore();
}

/** A picture (H×W×C channels-last values, 1 or 3 channels; 0…1 or auto-scaled). `channel` picks one channel of a multi-channel map. */
export function drawPicture(ctx, data, shape, x, y, w, h, { channel = null, map = 'gray', dark = false, autoscale = true } = {}) {
  if (!data) return;
  const [rows, cols, channels = 1] = shape;
  if (channels === 3 && channel == null) {
    const image = new ImageData(cols, rows);
    const r = autoscale ? range(data) : { min: 0, max: 1 };
    const scale = (v) => Math.round(Math.min(1, Math.max(0, (v - Math.min(0, r.min)) / ((Math.max(1, r.max) - Math.min(0, r.min)) || 1))) * 255);
    for (let i = 0; i < rows * cols; i++) {
      image.data[i * 4] = scale(data[i * 3]); image.data[i * 4 + 1] = scale(data[i * 3 + 1]); image.data[i * 4 + 2] = scale(data[i * 3 + 2]); image.data[i * 4 + 3] = 255;
    }
    const off = new OffscreenCanvas(cols, rows);
    off.getContext('2d').putImageData(image, 0, 0);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(off, x, y, w, h);
    ctx.restore();
    return;
  }
  const c = channel ?? 0;
  const values = new Float32Array(rows * cols);
  for (let i = 0; i < rows * cols; i++) values[i] = data[i * channels + c];
  const r = autoscale ? range(values) : { min: 0, max: 1 };
  drawHeatmap(ctx, values, rows, cols, x, y, w, h, { min: r.min, max: r.max, map, dark });
}

// ───────────────────────── charts

function axes(ctx, box, t, { xMin, xMax, yMin, yMax, xLabel = '', yLabel = '', xTicks = 5, yTicks = 4, xFormat = fmt, yFormat = fmt }) {
  ctx.save();
  ctx.strokeStyle = t.border;
  ctx.fillStyle = t.muted;
  ctx.font = '10px system-ui, sans-serif';
  ctx.lineWidth = 1;
  for (let i = 0; i <= yTicks; i++) {
    const v = yMin + ((yMax - yMin) * i) / yTicks;
    const py = box.y + box.h - (box.h * i) / yTicks;
    ctx.globalAlpha = 0.5;
    ctx.beginPath(); ctx.moveTo(box.x, Math.round(py) + 0.5); ctx.lineTo(box.x + box.w, Math.round(py) + 0.5); ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText(yFormat(v), box.x - 4, py);
  }
  for (let i = 0; i <= xTicks; i++) {
    const v = xMin + ((xMax - xMin) * i) / xTicks;
    const px = box.x + (box.w * i) / xTicks;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(xFormat(v), px, box.y + box.h + 3);
  }
  if (xLabel) { ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'; ctx.fillText(xLabel, box.x + box.w, box.y + box.h - 2); }
  if (yLabel) { ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText(yLabel, box.x + 3, box.y + 1); }
  ctx.restore();
}

/** series = [{ name, values: [y] or [[x, y]], color, dash }]. Missing values (null) break the line. */
export function lineChart(canvas, series, { title = '', xLabel = '', yLabel = '', yMin = null, yMax = null, legend = true, emptyText = '', width: w = null, height: h = null } = {}) {
  const { ctx, width, height } = setupCanvas(canvas, w, h);
  const t = theme();
  const box = { x: 44, y: title ? 22 : 10, w: width - 54, h: height - (title ? 22 : 10) - 22 };
  const points = series.map((s) => s.values.map((v, i) => (Array.isArray(v) ? v : [i + 1, v])).filter(([, y]) => y != null && Number.isFinite(y)));
  const all = points.flat();
  if (title) { ctx.fillStyle = t.text; ctx.font = '600 11px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText(title, 6, 4); }
  if (!all.length) {
    ctx.fillStyle = t.muted; ctx.font = '12px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(emptyText, width / 2, height / 2);
    return;
  }
  let xMin = Math.min(...all.map(([x]) => x)); let xMax = Math.max(...all.map(([x]) => x));
  let lo = yMin ?? Math.min(...all.map(([, y]) => y)); let hi = yMax ?? Math.max(...all.map(([, y]) => y));
  if (xMin === xMax) { xMin -= 1; xMax += 1; }
  if (lo === hi) { lo -= 0.5; hi += 0.5; }
  const pad = (hi - lo) * 0.06;
  if (yMin == null) lo -= pad;
  if (yMax == null) hi += pad;
  axes(ctx, box, t, { xMin, xMax, yMin: lo, yMax: hi, xLabel, yLabel, xFormat: (v) => (Math.abs(xMax - xMin) >= 5 ? String(Math.round(v)) : fmt(v, 2)) });
  const px = (x) => box.x + ((x - xMin) / (xMax - xMin)) * box.w;
  const py = (y) => box.y + box.h - ((y - lo) / (hi - lo)) * box.h;
  series.forEach((s, k) => {
    const list = points[k];
    if (!list.length) return;
    ctx.save();
    ctx.strokeStyle = s.color; ctx.lineWidth = s.width ?? 1.8; ctx.setLineDash(s.dash ?? []);
    ctx.beginPath();
    list.forEach(([x, y], i) => (i ? ctx.lineTo(px(x), py(y)) : ctx.moveTo(px(x), py(y))));
    ctx.stroke();
    if (list.length < 40 && s.dots !== false) {
      ctx.fillStyle = s.color;
      for (const [x, y] of list) { ctx.beginPath(); ctx.arc(px(x), py(y), 2, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.restore();
  });
  if (legend) {
    ctx.font = '10px system-ui, sans-serif'; ctx.textBaseline = 'middle';
    let lx = box.x + box.w;
    for (const s of [...series].reverse()) {
      if (!s.name) continue;
      const w = ctx.measureText(s.name).width;
      lx -= w + 22;
      ctx.fillStyle = s.color; ctx.fillRect(lx, (title ? 11 : 6) - 1, 12, 3);
      ctx.fillStyle = t.muted; ctx.textAlign = 'left'; ctx.fillText(s.name, lx + 15, title ? 11 : 6);
    }
  }
}

/** hist = { min, max, counts } */
export function histogramChart(canvas, hist, { color = null, title = '' } = {}) {
  const { ctx, width, height } = setupCanvas(canvas);
  const t = theme();
  if (!hist?.counts?.length) return;
  const box = { x: 4, y: title ? 16 : 4, w: width - 8, h: height - (title ? 16 : 4) - 14 };
  const top = Math.max(...hist.counts) || 1;
  const bw = box.w / hist.counts.length;
  ctx.fillStyle = color ?? t.accent;
  hist.counts.forEach((c, i) => {
    const h = (c / top) * box.h;
    ctx.globalAlpha = 0.85;
    ctx.fillRect(box.x + i * bw + 0.5, box.y + box.h - h, Math.max(1, bw - 1), h);
  });
  ctx.globalAlpha = 1;
  ctx.fillStyle = t.muted; ctx.font = '9px system-ui, sans-serif'; ctx.textBaseline = 'top';
  ctx.textAlign = 'left'; ctx.fillText(fmt(hist.min, 2), box.x, box.y + box.h + 2);
  ctx.textAlign = 'right'; ctx.fillText(fmt(hist.max, 2), box.x + box.w, box.y + box.h + 2);
  if (hist.min < 0 && hist.max > 0) {
    const zx = box.x + ((0 - hist.min) / (hist.max - hist.min)) * box.w;
    ctx.strokeStyle = t.text; ctx.globalAlpha = 0.4; ctx.beginPath(); ctx.moveTo(zx, box.y); ctx.lineTo(zx, box.y + box.h); ctx.stroke(); ctx.globalAlpha = 1;
  }
  if (title) { ctx.fillStyle = t.text; ctx.font = '600 10px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.fillText(title, 4, 2); }
}

/** Horizontal bars (class probabilities, contributions). items = [{ label, value, color?, highlight? }] */
export function barChart(canvas, items, { min = null, max = null, format = (v) => fmt(v, 3), labelWidth = 70 } = {}) {
  const rowH = 18;
  const { ctx, width } = setupCanvas(canvas, null, Math.max(24, items.length * rowH + 6));
  canvas.style.height = `${Math.max(24, items.length * rowH + 6)}px`;
  const t = theme();
  const lo = min ?? Math.min(0, ...items.map((i) => i.value));
  const hi = max ?? Math.max(0, ...items.map((i) => i.value));
  const valueW = 56;
  const plot = { x: labelWidth + 6, w: width - labelWidth - valueW - 12 };
  const zero = plot.x + ((0 - lo) / ((hi - lo) || 1)) * plot.w;
  ctx.font = '11px system-ui, sans-serif'; ctx.textBaseline = 'middle';
  items.forEach((item, i) => {
    const y = 3 + i * rowH;
    ctx.fillStyle = item.highlight ? t.text : t.muted;
    ctx.textAlign = 'right';
    ctx.fillText(String(item.label).slice(0, 14), labelWidth, y + rowH / 2);
    const x1 = plot.x + ((item.value - lo) / ((hi - lo) || 1)) * plot.w;
    ctx.fillStyle = item.color ?? (item.value < 0 ? '#3170d6' : t.accent);
    ctx.globalAlpha = item.highlight ? 1 : 0.75;
    ctx.fillRect(Math.min(zero, x1), y + 3, Math.max(1, Math.abs(x1 - zero)), rowH - 6);
    ctx.globalAlpha = 1;
    ctx.fillStyle = t.text; ctx.textAlign = 'left';
    ctx.fillText(format(item.value), plot.x + plot.w + 6, y + rowH / 2);
  });
}

/** Points in 2-D (x, y pairs), coloured by class or value; optional boundary = { grid, bounds, outputs, values }. */
export function scatterPlot(canvas, xs, labels, { classes = 2, boundary = null, task = 'classification', highlight = null, curve = null, ys = null, align = 'center' } = {}) {
  const { ctx, width, height } = setupCanvas(canvas);
  const t = theme();
  const n = labels.length;
  if (task === 'regression') {
    // function1d: x vs y with the fitted curve.
    let xMin = Infinity; let xMax = -Infinity; let yMin = Infinity; let yMax = -Infinity;
    for (let i = 0; i < n; i++) { xMin = Math.min(xMin, xs[i]); xMax = Math.max(xMax, xs[i]); yMin = Math.min(yMin, labels[i]); yMax = Math.max(yMax, labels[i]); }
    if (curve) for (const y of curve.ys) { yMin = Math.min(yMin, y); yMax = Math.max(yMax, y); }
    const pad = (yMax - yMin) * 0.08 || 1;
    yMin -= pad; yMax += pad;
    const box = { x: 40, y: 8, w: width - 48, h: height - 28 };
    axes(ctx, box, t, { xMin, xMax, yMin, yMax, xLabel: 'x', yLabel: 'y' });
    const px = (x) => box.x + ((x - xMin) / ((xMax - xMin) || 1)) * box.w;
    const py = (y) => box.y + box.h - ((y - yMin) / ((yMax - yMin) || 1)) * box.h;
    ctx.fillStyle = CLASS_COLORS[0]; ctx.globalAlpha = 0.6;
    for (let i = 0; i < n; i++) { ctx.beginPath(); ctx.arc(px(xs[i]), py(labels[i]), 2.4, 0, Math.PI * 2); ctx.fill(); }
    ctx.globalAlpha = 1;
    if (curve) {
      ctx.strokeStyle = CLASS_COLORS[1]; ctx.lineWidth = 2.5; ctx.beginPath();
      curve.xs.forEach((x, i) => (i ? ctx.lineTo(px(x), py(curve.ys[i])) : ctx.moveTo(px(x), py(curve.ys[i]))));
      ctx.stroke();
    }
    return;
  }
  let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity;
  for (let i = 0; i < n; i++) { minX = Math.min(minX, xs[i * 2]); maxX = Math.max(maxX, xs[i * 2]); minY = Math.min(minY, xs[i * 2 + 1]); maxY = Math.max(maxY, xs[i * 2 + 1]); }
  let bounds = boundary?.bounds ?? { minX: minX - (maxX - minX) * 0.1, maxX: maxX + (maxX - minX) * 0.1, minY: minY - (maxY - minY) * 0.1, maxY: maxY + (maxY - minY) * 0.1 };
  if (!Number.isFinite(bounds.minX)) bounds = { minX: -1, maxX: 1, minY: -1, maxY: 1 };
  // Left-aligned (Train tab): below the chart's title line.
  const size = align === 'left' ? Math.min(width - 8, height - 26) : Math.min(width, height) - 8;
  const box = align === 'left' ? { x: 4, y: 22, w: size, h: size } : { x: (width - size) / 2, y: (height - size) / 2, w: size, h: size };
  ctx.fillStyle = t.chart; ctx.fillRect(box.x, box.y, box.w, box.h);
  if (boundary?.values) {
    const { grid, outputs, values } = boundary;
    const image = new ImageData(grid, grid);
    for (let i = 0; i < grid * grid; i++) {
      let cls; let confidence;
      if (outputs === 1) { const p = values[i]; cls = p >= 0.5 ? 1 : 0; confidence = Math.abs(p - 0.5) * 2; } else {
        let best = 0;
        for (let k = 1; k < outputs; k++) if (values[i * outputs + k] > values[i * outputs + best]) best = k;
        cls = best; confidence = values[i * outputs + best];
      }
      const hex = CLASS_COLORS[cls % CLASS_COLORS.length];
      const c = [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16));
      const alpha = 0.18 + 0.45 * Math.min(1, confidence);
      const base = t.dark ? [30, 33, 40] : [255, 255, 255];
      image.data[i * 4] = Math.round(base[0] + (c[0] - base[0]) * alpha);
      image.data[i * 4 + 1] = Math.round(base[1] + (c[1] - base[1]) * alpha);
      image.data[i * 4 + 2] = Math.round(base[2] + (c[2] - base[2]) * alpha);
      image.data[i * 4 + 3] = 255;
    }
    const off = new OffscreenCanvas(grid, grid);
    off.getContext('2d').putImageData(image, 0, 0);
    ctx.save(); ctx.imageSmoothingEnabled = true; ctx.drawImage(off, box.x, box.y, box.w, box.h); ctx.restore();
  }
  const px = (x) => box.x + ((x - bounds.minX) / ((bounds.maxX - bounds.minX) || 1)) * box.w;
  const py = (y) => box.y + box.h - ((y - bounds.minY) / ((bounds.maxY - bounds.minY) || 1)) * box.h;
  for (let i = 0; i < n; i++) {
    ctx.beginPath();
    ctx.arc(px(xs[i * 2]), py(xs[i * 2 + 1]), i === highlight ? 6 : 3.2, 0, Math.PI * 2);
    ctx.fillStyle = CLASS_COLORS[labels[i] % CLASS_COLORS.length];
    ctx.fill();
    ctx.strokeStyle = i === highlight ? t.text : t.dark ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.9)';
    ctx.lineWidth = i === highlight ? 2 : 1;
    ctx.stroke();
  }
  ctx.strokeStyle = t.border; ctx.strokeRect(box.x + 0.5, box.y + 0.5, box.w - 1, box.h - 1);
  canvas.plotBox = { box, bounds };
  void classes;
}

/** matrix[actual][predicted] counts. */
export function confusionChart(canvas, matrix, labels) {
  const n = matrix.length;
  const { ctx, width, height } = setupCanvas(canvas);
  const t = theme();
  const label = 64;
  const size = Math.max(10, Math.min((width - label - 10) / n, (height - label - 10) / n));
  const ox = label; const oy = 10;
  const rowTotals = matrix.map((row) => row.reduce((a, b) => a + b, 0) || 1);
  ctx.font = `${Math.min(12, Math.max(8, size / 3.2))}px system-ui, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let a = 0; a < n; a++) for (let p = 0; p < n; p++) {
    const share = matrix[a][p] / rowTotals[a];
    const good = a === p;
    const base = good ? [89, 161, 79] : [225, 87, 89];
    const bg = t.dark ? [36, 40, 50] : [250, 250, 252];
    const c = bg.map((v, k) => Math.round(v + (base[k] - v) * Math.min(1, share * (good ? 1 : 2.5))));
    ctx.fillStyle = rgb(c);
    ctx.fillRect(ox + p * size, oy + a * size, size - 1, size - 1);
    if (size >= 16) { ctx.fillStyle = share > 0.55 ? '#fff' : t.text; ctx.fillText(String(matrix[a][p]), ox + p * size + size / 2, oy + a * size + size / 2); }
  }
  ctx.fillStyle = t.muted; ctx.font = '10px system-ui, sans-serif';
  for (let i = 0; i < n; i++) {
    ctx.textAlign = 'right'; ctx.fillText(String(labels?.[i] ?? i).slice(0, 9), ox - 4, oy + i * size + size / 2);
    ctx.save(); ctx.translate(ox + i * size + size / 2, oy + n * size + 4); ctx.rotate(-Math.PI / 4); ctx.textAlign = 'right'; ctx.fillText(String(labels?.[i] ?? i).slice(0, 9), 0, 0); ctx.restore();
  }
  canvas.cellBox = { ox, oy, size, n };
}

/** A sequence (L × C, channels-last) as lines, one per channel. */
export function sequenceChart(canvas, data, shape, { title = '', highlight = null, width = null, height = null } = {}) {
  const [steps, channels] = shape;
  const series = Array.from({ length: Math.min(channels, 8) }, (_, c) => ({
    name: channels > 1 ? `c${c}` : '', color: CLASS_COLORS[c % CLASS_COLORS.length],
    values: Array.from({ length: steps }, (__, s) => [s, data[s * channels + c]]),
  }));
  lineChart(canvas, series, { title, legend: channels > 1, width, height });
  void highlight;
}
