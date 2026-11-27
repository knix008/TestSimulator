// ```chart blocks (Markdific / Obsidian Charts): a small YAML/JSON spec — or a Markdown table — turned into an
// inline SVG string. Pure (no DOM): parseChartSpec(text) → { ok, spec | error }, chartSvg(spec) → '<svg…>',
// chartHtml(text) → the block's HTML (the chart or an inline error). Colours are the app's tones (--tone-*),
// text and lines take the reading view's colours through CSS classes (reading.css: .md-chart …).
import { registerTexts, t } from '../i18n.js';
import TEXTS from './texts.js';

registerTexts(TEXTS);

export const CHART_TYPES = ['bar', 'line', 'area', 'scatter', 'pie', 'doughnut'];
const TYPE_ALIASES = { donut: 'doughnut', column: 'bar', bars: 'bar', lines: 'line', point: 'scatter', points: 'scatter' };
export const CHART_TONES = ['blue', 'orange', 'green', 'purple', 'red', 'teal', 'pink', 'yellow', 'indigo', 'cyan', 'brown', 'slate'];

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// ───────────────────────── a YAML subset (maps, lists, flow [..] / {..}, scalars) — enough for chart specs

class SpecError extends Error {
  constructor(line) { super(`line ${line}`); this.line = line; }
}

function scalar(text) {
  const s = text.trim();
  if (s === '') return null;
  if (/^(?:"(?:[^"\\]|\\.)*"|'(?:[^']|'')*')$/.test(s)) return s[0] === '"' ? JSON.parse(s) : s.slice(1, -1).replace(/''/g, "'");
  if (/^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?$/i.test(s)) return Number(s);
  if (/^(true|yes|on)$/i.test(s)) return true;
  if (/^(false|no|off)$/i.test(s)) return false;
  if (/^(null|~)$/i.test(s)) return null;
  return s;
}

/** Parses a flow value ([a, b], {k: v}, scalars) starting at text[pos]. Returns [value, nextPos]. */
function flow(text, pos, lineNo) {
  const skip = () => { while (pos < text.length && /\s/.test(text[pos])) pos += 1; };
  skip();
  const ch = text[pos];
  if (ch === '[' || ch === '{') {
    const close = ch === '[' ? ']' : '}';
    const out = ch === '[' ? [] : {};
    pos += 1;
    for (;;) {
      skip();
      if (pos >= text.length) throw new SpecError(lineNo);
      if (text[pos] === close) return [out, pos + 1];
      if (ch === '[') {
        const [value, next] = flow(text, pos, lineNo);
        out.push(value);
        pos = next;
      } else {
        const m = /^\s*("(?:[^"\\]|\\.)*"|'[^']*'|[^:,}]+?)\s*:/.exec(text.slice(pos));
        if (!m) throw new SpecError(lineNo);
        const key = String(scalar(m[1]));
        const [value, next] = flow(text, pos + m[0].length, lineNo);
        out[key] = value;
        pos = next;
      }
      skip();
      if (text[pos] === ',') { pos += 1; continue; }
      if (text[pos] === close) return [out, pos + 1];
      throw new SpecError(lineNo);
    }
  }
  if (ch === '"' || ch === "'") {
    const re = ch === '"' ? /^"(?:[^"\\]|\\.)*"/ : /^'(?:[^']|'')*'/;
    const m = re.exec(text.slice(pos));
    if (!m) throw new SpecError(lineNo);
    return [scalar(m[0]), pos + m[0].length];
  }
  // A plain scalar ends at , ] } (inside a flow) or at the end.
  let end = pos;
  while (end < text.length && !',]}'.includes(text[end])) end += 1;
  return [scalar(text.slice(pos, end)), end];
}

function value(text, lineNo) {
  const s = text.trim();
  if (s.startsWith('[') || s.startsWith('{')) {
    const [v, next] = flow(s, 0, lineNo);
    if (s.slice(next).trim()) throw new SpecError(lineNo);
    return v;
  }
  return scalar(s);
}

const stripComment = (line) => line.replace(/(^|\s)#(?![^"']*["']\s*$).*$/, '$1').replace(/\s+$/, '');

/** A small YAML subset: `key: value`, nested maps by indentation, `- item` lists (of scalars or maps), flow
 * values. Throws SpecError(line) on what it does not understand. */
export function parseYamlish(text) {
  const lines = [];
  String(text ?? '').split(/\r?\n/).forEach((raw, i) => {
    const line = stripComment(raw.replace(/\t/g, '  '));
    if (line.trim()) lines.push({ indent: line.length - line.trimStart().length, text: line.trim(), no: i + 1 });
  });
  let i = 0;
  function block(indent) {
    if (i >= lines.length) return null;
    if (lines[i].text.startsWith('- ') || lines[i].text === '-') {
      const list = [];
      while (i < lines.length && lines[i].indent === indent && (lines[i].text.startsWith('- ') || lines[i].text === '-')) {
        const line = lines[i];
        const rest = line.text.slice(1).trim();
        const inner = line.indent + (line.text.length - line.text.slice(1).trimStart().length);
        if (!rest) { i += 1; list.push(i < lines.length && lines[i].indent > indent ? block(lines[i].indent) : null); continue; }
        if (/^("[^"]*"|'[^']*'|[^\s[{"'][^:]*?)\s*:(\s|$)/.test(rest) && !/^[[{]/.test(rest)) {
          // A map item: its first key is on the dash line, the others below it, indented like it.
          lines[i] = { indent: inner, text: rest, no: line.no };
          list.push(map(inner));
        } else {
          list.push(value(rest, line.no));
          i += 1;
        }
      }
      return list;
    }
    return map(indent);
  }
  function map(indent) {
    const out = {};
    while (i < lines.length && lines[i].indent === indent) {
      const line = lines[i];
      if (line.text.startsWith('- ')) break;
      const m = /^("(?:[^"\\]|\\.)*"|'[^']*'|[^:]+?)\s*:(?:\s+(.*)|$)/.exec(line.text);
      if (!m) throw new SpecError(line.no);
      const key = String(scalar(m[1]));
      i += 1;
      if (m[2] != null && m[2].trim() !== '') out[key] = value(m[2], line.no);
      else if (i < lines.length && (lines[i].indent > indent || (lines[i].indent === indent && lines[i].text.startsWith('- ')))) out[key] = block(lines[i].indent);
      else out[key] = null;
    }
    if (i < lines.length && lines[i].indent > indent) throw new SpecError(lines[i].no);
    return out;
  }
  if (!lines.length) return {};
  const result = block(lines[0].indent);
  if (i < lines.length) throw new SpecError(lines[i].no);
  return result;
}

// ───────────────────────── Markdown table data

const splitRow = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));

/** Rows of a Markdown table: { header: [...], rows: [[...]] } or null. */
export function parseTable(lines) {
  const rows = lines.map((l) => l.trim()).filter((l) => l.startsWith('|'));
  if (rows.length < 2) return null;
  const header = splitRow(rows[0]);
  const body = rows.slice(1).filter((r) => !/^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?$/.test(r)).map(splitRow);
  return { header, rows: body };
}

const toNumber = (v) => {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[,\s]/g, '').replace(/%$/, ''));
  return Number.isFinite(n) ? n : null;
};

const COLOR_RE = /^(#[0-9a-f]{3,8}|[a-z]{3,20}|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%deg]+\))$/i;
function colorOf(value) {
  const s = String(value ?? '').trim();
  if (CHART_TONES.includes(s.toLowerCase())) return `var(--tone-${s.toLowerCase()})`;
  return COLOR_RE.test(s) ? s : null;
}

/** Spec text → { ok: true, spec } or { ok: false, error } (a localized message). */
export function parseChartSpec(text) {
  const source = String(text ?? '');
  const all = source.split(/\r?\n/);
  const tableLines = all.filter((l) => l.trim().startsWith('|'));
  const specText = all.filter((l) => !l.trim().startsWith('|')).join('\n');
  let raw;
  try {
    const trimmed = specText.trim();
    if (trimmed.startsWith('{')) {
      try { raw = JSON.parse(trimmed); } catch { raw = value(trimmed.replace(/\s*\n\s*/g, ' '), 1); }
    } else raw = parseYamlish(specText);
  } catch (error) {
    return { ok: false, error: t('render.chartParse', { line: error.line ?? 1 }) };
  }
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) raw = {};
  const typeName = String(raw.type ?? 'bar').trim().toLowerCase();
  let type = TYPE_ALIASES[typeName] ?? typeName;
  if (!CHART_TYPES.includes(type)) return { ok: false, error: t('render.chartBadType', { type: typeName }) };
  if (type === 'line' && raw.fill === true) type = 'area';

  let labels = Array.isArray(raw.labels) ? raw.labels.map((l) => String(l ?? '')) : null;
  let series = [];
  const rawSeries = Array.isArray(raw.series) ? raw.series : (raw.series && typeof raw.series === 'object' ? [raw.series] : []);
  rawSeries.forEach((s, n) => {
    const item = Array.isArray(s) ? { data: s } : (s && typeof s === 'object' ? s : { data: [s] });
    const data = Array.isArray(item.data) ? item.data : (item.data != null ? [item.data] : []);
    series.push({ title: String(item.title ?? item.name ?? item.label ?? t('render.chartSeries', { n: n + 1 })), data, color: colorOf(item.color) });
  });
  if (!series.length && Array.isArray(raw.data)) series.push({ title: String(raw.title ?? t('render.chartSeries', { n: 1 })), data: raw.data, color: null });

  // A Markdown table below the spec is the data: first column = labels, the others = series.
  const table = parseTable(tableLines);
  if (table && table.rows.length) {
    const columns = table.header.length;
    if (type === 'scatter') {
      // x | y1 | y2 …
      series = table.header.slice(1).map((title, c) => ({ title: title || t('render.chartSeries', { n: c + 1 }), data: table.rows.map((r) => [toNumber(r[0]), toNumber(r[c + 1])]), color: null }));
      labels = labels ?? [];
    } else {
      labels = table.rows.map((r) => r[0] ?? '');
      series = [];
      for (let c = 1; c < columns; c += 1) series.push({ title: table.header[c] || t('render.chartSeries', { n: c }), data: table.rows.map((r) => r[c]), color: null });
    }
  }

  if (type === 'scatter') {
    series = series.map((s) => ({ ...s, data: s.data.map((d, i) => {
      if (Array.isArray(d)) return { x: toNumber(d[0]), y: toNumber(d[1]) };
      if (d && typeof d === 'object') return { x: toNumber(d.x), y: toNumber(d.y) };
      return { x: i + 1, y: toNumber(d) };
    }).filter((p) => p.x != null && p.y != null) }));
  } else {
    series = series.map((s) => ({ ...s, data: s.data.map(toNumber) }));
  }
  series = series.filter((s) => s.data.length);
  if (!series.length) return { ok: false, error: t('render.chartNoData') };
  const longest = Math.max(...series.map((s) => s.data.length));
  if (type !== 'scatter') {
    labels = labels ?? Array.from({ length: longest }, (_, i) => String(i + 1));
    while (labels.length < longest) labels.push(String(labels.length + 1));
  }

  const width = raw.width;
  const widthNum = toNumber(String(width ?? '').replace(/px$/i, ''));
  const percent = typeof width === 'string' && /^\d{1,3}(\.\d+)?%$/.test(width.trim()) ? width.trim() : null;
  const height = toNumber(String(raw.height ?? '').replace(/px$/i, ''));
  const labelColors = Array.isArray(raw.labelColors) ? raw.labelColors.map(colorOf) : (Array.isArray(raw.colors) ? raw.colors.map(colorOf) : []);
  const spec = {
    type,
    // `title` names the chart unless it named the only series (`title` + `data` at the top).
    title: String(raw.chartTitle ?? ((rawSeries.length || table) ? raw.title : null) ?? ''),
    labels: labels ?? [],
    series,
    width: percent ? 640 : Math.min(2000, Math.max(200, widthNum ?? 640)),
    cssWidth: percent,
    height: Math.min(1600, Math.max(120, height ?? 300)),
    stacked: raw.stacked === true,
    legend: raw.legend !== false,
    beginAtZero: raw.beginAtZero !== false,
    colors: labelColors,
    xTitle: raw.xTitle != null ? String(raw.xTitle) : '',
    yTitle: raw.yTitle != null ? String(raw.yTitle) : '',
  };
  return { ok: true, spec };
}

// ───────────────────────── SVG

/** "Nice" axis ticks covering [min, max]. */
export function niceTicks(min, max, count = 5) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) { min = 0; max = 1; }
  if (min === max) { if (min === 0) { max = 1; } else { const pad = Math.abs(min) * 0.1; min -= pad; max += pad; } }
  const span = max - min;
  const rough = span / Math.max(1, count);
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * power).find((s) => s >= rough) ?? 10 * power;
  const lo = Math.floor(min / step + 1e-9) * step;
  const hi = Math.ceil(max / step - 1e-9) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.abs(v) < step / 1e6 ? 0 : Number(v.toPrecision(12)));
  return { min: lo, max: hi, step, ticks };
}

export function formatNumber(n) {
  if (n == null || !Number.isFinite(n)) return '';
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${Number((n / 1e9).toPrecision(3))}B`;
  if (abs >= 1e6) return `${Number((n / 1e6).toPrecision(3))}M`;
  if (abs >= 1e4) return `${Number((n / 1e3).toPrecision(3))}k`;
  return String(Number(n.toPrecision(6)));
}

/** Approximate text width in px at `size` (wide for CJK). */
export function textWidth(text, size = 12) {
  let w = 0;
  for (const ch of String(text)) w += ch.codePointAt(0) > 0x2e80 ? 1 : 0.58;
  return w * size;
}

const toneColor = (spec, i) => spec.colors[i] ?? `var(--tone-${CHART_TONES[i % CHART_TONES.length]})`;
const seriesColor = (spec, s, i) => s.color ?? toneColor(spec, i);
const r1 = (n) => Math.round(n * 10) / 10;
const truncate = (text, max) => (String(text).length > max ? `${String(text).slice(0, max - 1)}…` : String(text));

function legendSvg(items, width, y) {
  // items: [{ label, color }] laid out centred in rows.
  const rows = [[]];
  let rowW = 0;
  const itemW = (it) => 18 + textWidth(truncate(it.label, 28), 12) + 14;
  for (const it of items) {
    const w = itemW(it);
    if (rowW + w > width - 20 && rows.at(-1).length) { rows.push([]); rowW = 0; }
    rows.at(-1).push(it);
    rowW += w;
  }
  let out = '<g class="md-chart-legend">';
  rows.forEach((row, r) => {
    const total = row.reduce((s, it) => s + itemW(it), 0) - 14;
    let x = (width - total) / 2;
    const cy = y + r * 20;
    for (const it of row) {
      out += `<g><title>${esc(it.label)}</title><rect x="${r1(x)}" y="${r1(cy - 5)}" width="12" height="10" rx="2" style="fill:${it.color}"/><text class="md-chart-legend-text" x="${r1(x + 17)}" y="${r1(cy + 4)}">${esc(truncate(it.label, 28))}</text></g>`;
      x += itemW(it);
    }
  });
  return { svg: `${out}</g>`, height: rows.length * 20 };
}

/** The chart as an SVG string. */
export function chartSvg(spec) {
  const W = spec.width;
  const H = spec.height;
  let top = 12;
  let parts = '';
  if (spec.title) { parts += `<text class="md-chart-title" x="${W / 2}" y="22" text-anchor="middle">${esc(spec.title)}</text>`; top = 34; }
  const round = spec.type === 'pie' || spec.type === 'doughnut';
  const legendItems = round
    ? spec.labels.map((label, i) => ({ label, color: toneColor(spec, i) })).slice(0, spec.series[0].data.length)
    : spec.series.map((s, i) => ({ label: s.title, color: seriesColor(spec, s, i) }));
  if (spec.legend && (round || spec.series.length > 1 || spec.series[0].title)) {
    const legend = legendSvg(legendItems, W, top + 6);
    parts += legend.svg;
    top += legend.height + 8;
  }
  const body = round ? pieSvg(spec, W, H, top) : axesSvg(spec, W, H, top);
  const label = esc(spec.title || spec.series.map((s) => s.title).join(', '));
  const style = spec.cssWidth ? `width:${spec.cssWidth}` : `width:100%;max-width:${W}px`;
  return `<svg class="md-chart-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" style="${style}" role="img" aria-label="${label}" data-chart-type="${spec.type}">${parts}${body}</svg>`;
}

function pieSvg(spec, W, H, top) {
  const data = spec.series[0].data.map((v) => (v != null && v > 0 ? v : 0));
  const total = data.reduce((a, b) => a + b, 0);
  if (!total) return `<text class="md-chart-axis" x="${W / 2}" y="${(top + H) / 2}" text-anchor="middle">${esc(t('render.chartNoData'))}</text>`;
  const cx = W / 2;
  const cy = top + (H - top) / 2;
  const r = Math.max(20, Math.min(W / 2 - 16, (H - top) / 2 - 10));
  const inner = spec.type === 'doughnut' ? r * 0.56 : 0;
  let angle = -Math.PI / 2;
  let out = '<g class="md-chart-slices">';
  const point = (a, radius) => [cx + radius * Math.cos(a), cy + radius * Math.sin(a)];
  data.forEach((v, i) => {
    if (!v) return;
    const sweep = (v / total) * Math.PI * 2;
    const a0 = angle;
    const a1 = angle + sweep;
    angle = a1;
    const title = `${spec.labels[i] ?? i + 1}: ${formatNumber(v)} (${r1((v / total) * 100)}%)`;
    let d;
    if (sweep >= Math.PI * 2 - 1e-6) {
      d = `M${r1(cx - r)},${r1(cy)}a${r1(r)},${r1(r)} 0 1,0 ${r1(2 * r)},0a${r1(r)},${r1(r)} 0 1,0 ${r1(-2 * r)},0z`;
      if (inner) d += `M${r1(cx - inner)},${r1(cy)}a${r1(inner)},${r1(inner)} 0 1,1 ${r1(2 * inner)},0a${r1(inner)},${r1(inner)} 0 1,1 ${r1(-2 * inner)},0z`;
    } else {
      const large = sweep > Math.PI ? 1 : 0;
      const [x0, y0] = point(a0, r);
      const [x1, y1] = point(a1, r);
      if (inner) {
        const [x2, y2] = point(a1, inner);
        const [x3, y3] = point(a0, inner);
        d = `M${r1(x0)},${r1(y0)}A${r1(r)},${r1(r)} 0 ${large},1 ${r1(x1)},${r1(y1)}L${r1(x2)},${r1(y2)}A${r1(inner)},${r1(inner)} 0 ${large},0 ${r1(x3)},${r1(y3)}z`;
      } else {
        d = `M${r1(cx)},${r1(cy)}L${r1(x0)},${r1(y0)}A${r1(r)},${r1(r)} 0 ${large},1 ${r1(x1)},${r1(y1)}z`;
      }
    }
    out += `<path class="md-chart-slice" d="${d}" fill-rule="evenodd" style="fill:${toneColor(spec, i)}"><title>${esc(title)}</title></path>`;
    if (sweep > 0.32) {
      const [lx, ly] = point(a0 + sweep / 2, inner ? (r + inner) / 2 : r * 0.64);
      out += `<text class="md-chart-slice-label" x="${r1(lx)}" y="${r1(ly + 4)}" text-anchor="middle">${Math.round((v / total) * 100)}%</text>`;
    }
  });
  return `${out}</g>`;
}

function axesSvg(spec, W, H, top) {
  const scatter = spec.type === 'scatter';
  const stacked = spec.stacked && (spec.type === 'bar' || spec.type === 'area' || spec.type === 'line');
  const n = scatter ? 0 : spec.labels.length;
  // y range
  let ys = [];
  if (scatter) ys = spec.series.flatMap((s) => s.data.map((p) => p.y));
  else if (stacked) {
    for (let i = 0; i < n; i += 1) {
      let pos = 0; let neg = 0;
      for (const s of spec.series) { const v = s.data[i] ?? 0; if (v >= 0) pos += v; else neg += v; }
      ys.push(pos, neg);
    }
  } else ys = spec.series.flatMap((s) => s.data.filter((v) => v != null));
  if (!ys.length) ys = [0, 1];
  let yMin = Math.min(...ys);
  let yMax = Math.max(...ys);
  if (spec.beginAtZero || spec.type === 'bar' || spec.type === 'area') { yMin = Math.min(0, yMin); yMax = Math.max(0, yMax); }
  const yAxis = niceTicks(yMin, yMax, Math.max(2, Math.round((H - top) / 55)));
  const tickLabels = yAxis.ticks.map(formatNumber);
  const left = 14 + Math.max(...tickLabels.map((l) => textWidth(l, 11))) + (spec.yTitle ? 16 : 0);
  const right = 16;
  // x labels: rotate when they do not fit
  const plotW0 = W - left - right;
  const band0 = n ? plotW0 / n : plotW0;
  const maxLabel = n ? Math.max(...spec.labels.map((l) => textWidth(truncate(l, 18), 11))) : 0;
  const rotate = !scatter && maxLabel > band0 - 4;
  const bottom = (rotate ? Math.min(90, maxLabel * 0.72 + 14) : 24) + (spec.xTitle ? 16 : 0);
  const plotTop = top + 6;
  const plotH = Math.max(30, H - plotTop - bottom);
  const plotW = plotW0;
  const yOf = (v) => plotTop + plotH - ((v - yAxis.min) / (yAxis.max - yAxis.min)) * plotH;
  let out = '<g class="md-chart-grid">';
  yAxis.ticks.forEach((v, k) => {
    const y = r1(yOf(v));
    out += `<line class="${v === 0 ? 'md-chart-zero' : 'md-chart-gridline'}" x1="${r1(left)}" y1="${y}" x2="${r1(left + plotW)}" y2="${y}"/>`;
    out += `<text class="md-chart-axis" x="${r1(left - 6)}" y="${r1(y + 4)}" text-anchor="end">${esc(tickLabels[k])}</text>`;
  });
  out += `<line class="md-chart-axisline" x1="${r1(left)}" y1="${r1(plotTop + plotH)}" x2="${r1(left + plotW)}" y2="${r1(plotTop + plotH)}"/></g>`;
  if (spec.yTitle) out += `<text class="md-chart-axis-title" transform="translate(12 ${r1(plotTop + plotH / 2)}) rotate(-90)" text-anchor="middle">${esc(spec.yTitle)}</text>`;
  if (spec.xTitle) out += `<text class="md-chart-axis-title" x="${r1(left + plotW / 2)}" y="${H - 4}" text-anchor="middle">${esc(spec.xTitle)}</text>`;

  if (scatter) {
    const xs = spec.series.flatMap((s) => s.data.map((p) => p.x));
    const xAxis = niceTicks(Math.min(...xs), Math.max(...xs), Math.max(2, Math.round(plotW / 90)));
    const xOf = (v) => left + ((v - xAxis.min) / (xAxis.max - xAxis.min)) * plotW;
    out += '<g class="md-chart-grid">';
    for (const v of xAxis.ticks) out += `<line class="md-chart-gridline" x1="${r1(xOf(v))}" y1="${r1(plotTop)}" x2="${r1(xOf(v))}" y2="${r1(plotTop + plotH)}"/><text class="md-chart-axis" x="${r1(xOf(v))}" y="${r1(plotTop + plotH + 16)}" text-anchor="middle">${esc(formatNumber(v))}</text>`;
    out += '</g>';
    spec.series.forEach((s, si) => {
      out += `<g class="md-chart-series" style="fill:${seriesColor(spec, s, si)}">`;
      for (const p of s.data) out += `<circle class="md-chart-point" cx="${r1(xOf(p.x))}" cy="${r1(yOf(p.y))}" r="4.5"><title>${esc(`${s.title} — (${formatNumber(p.x)}, ${formatNumber(p.y)})`)}</title></circle>`;
      out += '</g>';
    });
    return out;
  }

  const band = plotW / Math.max(1, n);
  const xCenter = (i) => left + band * (i + 0.5);
  // x labels
  out += '<g class="md-chart-xlabels">';
  spec.labels.forEach((l, i) => {
    const x = r1(xCenter(i));
    const y = r1(plotTop + plotH + 15);
    const text = esc(truncate(l, 18));
    out += rotate
      ? `<text class="md-chart-axis" transform="translate(${x} ${r1(y - 4)}) rotate(-40)" text-anchor="end">${text}<title>${esc(l)}</title></text>`
      : `<text class="md-chart-axis" x="${x}" y="${y}" text-anchor="middle">${text}<title>${esc(l)}</title></text>`;
  });
  out += '</g>';

  if (spec.type === 'bar') {
    const inner = band * 0.72;
    const count = stacked ? 1 : spec.series.length;
    const barW = inner / count;
    const pos = new Array(n).fill(0);
    const neg = new Array(n).fill(0);
    spec.series.forEach((s, si) => {
      out += `<g class="md-chart-series" style="fill:${seriesColor(spec, s, si)}">`;
      for (let i = 0; i < n; i += 1) {
        const v = s.data[i];
        if (v == null) continue;
        let y0; let y1;
        if (stacked) {
          if (v >= 0) { y0 = pos[i]; y1 = pos[i] + v; pos[i] = y1; } else { y0 = neg[i]; y1 = neg[i] + v; neg[i] = y1; }
        } else { y0 = 0; y1 = v; }
        const x = xCenter(i) - inner / 2 + (stacked ? 0 : si * barW);
        const yTop = Math.min(yOf(y0), yOf(y1));
        const h = Math.max(v === 0 ? 0 : 1, Math.abs(yOf(y1) - yOf(y0)));
        out += `<rect class="md-chart-bar" x="${r1(x + 1)}" y="${r1(yTop)}" width="${r1(Math.max(1, barW - 2))}" height="${r1(h)}" rx="2"><title>${esc(`${s.title} — ${spec.labels[i]}: ${formatNumber(v)}`)}</title></rect>`;
      }
      out += '</g>';
    });
    return out;
  }

  // line / area
  const base = new Array(n).fill(0);
  const area = spec.type === 'area';
  const layers = spec.series.map((s) => {
    const pts = [];
    for (let i = 0; i < n; i += 1) {
      const v = s.data[i];
      if (v == null) { pts.push(null); continue; }
      const lo = stacked ? base[i] : 0;
      const hi = lo + v;
      if (stacked) base[i] = hi;
      pts.push({ i, v, lo, hi });
    }
    return pts;
  });
  spec.series.forEach((s, si) => {
    const color = seriesColor(spec, s, si);
    const pts = layers[si];
    // Runs of consecutive points (gaps break the line).
    const runs = [];
    let run = [];
    for (const p of pts) { if (p) run.push(p); else if (run.length) { runs.push(run); run = []; } }
    if (run.length) runs.push(run);
    out += `<g class="md-chart-series" style="color:${color}">`;
    for (const rn of runs) {
      const line = rn.map((p) => `${r1(xCenter(p.i))},${r1(yOf(p.hi))}`).join(' ');
      if (area || stacked) {
        const back = rn.slice().reverse().map((p) => `${r1(xCenter(p.i))},${r1(yOf(area || stacked ? p.lo : 0))}`).join(' ');
        if (area) out += `<polygon class="md-chart-area" points="${line} ${back}" style="fill:${color}"/>`;
      }
      out += `<polyline class="md-chart-line" points="${line}" style="stroke:${color}"/>`;
    }
    for (const p of pts) {
      if (!p) continue;
      out += `<circle class="md-chart-dot" cx="${r1(xCenter(p.i))}" cy="${r1(yOf(p.hi))}" r="3.2" style="fill:${color}"/><circle class="md-chart-hit" cx="${r1(xCenter(p.i))}" cy="${r1(yOf(p.hi))}" r="9"><title>${esc(`${s.title} — ${spec.labels[p.i]}: ${formatNumber(p.v)}`)}</title></circle>`;
    }
    out += '</g>';
  });
  return out;
}

/** The HTML of a chart block: the SVG inside .md-chart, or an inline error. */
export function chartHtml(text) {
  const parsed = parseChartSpec(text);
  if (!parsed.ok) return `<div class="md-chart md-chart-error" role="alert">${esc(parsed.error)}</div>`;
  try {
    return `<div class="md-chart" data-chart-type="${parsed.spec.type}">${chartSvg(parsed.spec)}</div>`;
  } catch (error) {
    return `<div class="md-chart md-chart-error" role="alert">${esc(t('render.chartError', { message: error?.message ?? String(error) }))}</div>`;
  }
}
