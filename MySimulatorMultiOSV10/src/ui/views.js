// How a node's output is shown: which chart (lines over x, x–y trajectory,
// scatter coloured by a group, bars, heat map) from the output and, for a chart
// node, from its settings; plus the table and result-value views.
import { h } from './dom.js';
import { drawLineChart, drawBarChart, drawHeatmap, SERIES_COLORS } from './charts.js';
import { findColumn, xColumn, valueColumns, labelColumn, numberText } from '../core/result.js';
import { formatValue } from '../core/colormap.js';

const MAX_SERIES = 10;

function pickTable(output, name) {
  if (!output?.tables.length) return null;
  if (name) {
    const byName = output.tables.find((t) => t.name === name) ?? output.tables.find((t) => t.name.toLowerCase() === String(name).toLowerCase());
    if (byName) return byName;
    const index = Number(name);
    if (Number.isInteger(index) && output.tables[index]) return output.tables[index];
  }
  return output.tables[0];
}

const list = (text) => String(text ?? '').split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);

function pairs(xs, ys) {
  const n = Math.min(xs.length, ys.length);
  const out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = [xs[i], ys[i]];
  return out;
}

const label = (c) => (c.unit ? `${c.name} (${c.unit})` : c.name);

/**
 * The chart for an output. params: a chart node's settings (chart, table, x, y, color, logX, logY, title) or {}.
 * Returns { kind: 'xy' | 'bars' | 'heatmap' | 'table' | 'none', … } for drawSpec().
 */
export function chartSpec(output, params = {}, nodeType = '') {
  if (!output || !output.ok) return { kind: 'none' };
  const chart = params.chart ?? '';
  const title = params.title || '';
  if (chart === 'table') return { kind: 'table', table: pickTable(output, params.table) };
  const wantsGrid = chart === 'heatmap' || (!chart && output.grids.length && (!output.tables.length || nodeType === 'signal.spectrogram' || nodeType === 'stat.correlation'));
  if (wantsGrid && output.grids.length) {
    const grid = output.grids.find((g) => g.name === params.table) ?? output.grids[0];
    // An optimiser's path over its objective map.
    let path = null;
    const hist = output.tables.find((t) => t.name === 'history');
    if (hist && grid.xLabel && grid.yLabel) {
      const hx = findColumn(hist, grid.xLabel);
      const hy = findColumn(hist, grid.yLabel);
      if (hx && hy) path = pairs(hx.values, hy.values);
    }
    return { kind: 'heatmap', grid, opts: { title, path } };
  }
  const table = pickTable(output, params.table);
  if (!table || !table.rows) {
    if (output.grids.length) return { kind: 'heatmap', grid: output.grids[0], opts: { title } };
    return { kind: 'none' };
  }
  const xName = params.x || '';
  const yNames = list(params.y);
  const labels = labelColumn(table);
  let xcol = xName ? findColumn(table, xName) : xColumn(table);
  let ycols = yNames.length ? yNames.map((n) => findColumn(table, n)).filter(Boolean) : valueColumns(table).filter((c) => c !== xcol);
  // Labelled rows (statistics, coefficients, sensitivities): horizontal bars.
  if ((chart === 'bar' && labels && !xName) || (!chart && labels && !xcol && ycols.length)) {
    const y = ycols[0];
    if (!y) return { kind: 'none' };
    return { kind: 'bars', bars: Array.from(labels.labels, (name, i) => ({ name, value: y.values[i] })), opts: { title: title || label(y), unit: y.unit } };
  }
  if (chart === 'xy' || (!chart && nodeType === 'ctrl.bode' && table.name === 'nyquist')) {
    // A trajectory: y against x in row order (phase portraits, Nyquist).
    if (!xcol) xcol = ycols[0];
    if (!yNames.length) ycols = ycols.filter((c) => c !== xcol).slice(0, 1);
    if (!xcol || !ycols.length) return { kind: 'none' };
    return {
      kind: 'xy',
      series: ycols.slice(0, MAX_SERIES).map((c) => ({ name: c.name, points: pairs(xcol.values, c.values) })),
      opts: { title, xLabel: label(xcol), yLabel: ycols.length === 1 ? label(ycols[0]) : '', mode: 'line', logX: params.logX, logY: params.logY, equal: params.equal },
    };
  }
  if (!xcol) {
    // No x axis: row number.
    const n = table.rows;
    xcol = { name: '#', unit: '', values: Float64Array.from({ length: n }, (_, i) => i + 1) };
  }
  ycols = ycols.filter((c) => c !== xcol && !c.labels);
  if (!ycols.length) return { kind: 'none' };
  // Coloured groups: scatter of y against x split by the values of a column (clusters, classes).
  const colorBy = params.color ? findColumn(table, params.color) : null;
  const mode = chart === 'scatter' ? 'scatter' : chart === 'bar' ? 'bar' : chart === 'area' ? 'area' : chart === 'step' ? 'step' : 'line';
  if (colorBy && mode === 'scatter') {
    const y = ycols[0];
    const groups = new Map();
    const keys = colorBy.labels ?? Array.from(colorBy.values, (v) => formatValue(v));
    for (let i = 0; i < table.rows; i++) {
      const key = keys[i];
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push([xcol.values[i], y.values[i]]);
    }
    const series = [...groups.entries()].slice(0, 24).map(([key, points], i) => ({ name: `${colorBy.name} ${key}`, points, color: SERIES_COLORS[i % SERIES_COLORS.length] }));
    return { kind: 'xy', series, opts: { title, xLabel: label(xcol), yLabel: label(y), mode, logX: params.logX, logY: params.logY } };
  }
  const autoLogX = !params.chart && nodeType === 'ctrl.bode' && table.name === 'bode';
  // Mixed scatter and line: with a "fit" column the data are points and the fit a line.
  const series = ycols.slice(0, MAX_SERIES).map((c) => ({
    name: c.unit && ycols.length > 1 ? `${c.name} (${c.unit})` : c.name,
    points: pairs(xcol.values, c.values),
    mode: (mode === 'scatter' || mode === 'bar') && /^(fit|prediction|normal fit|curve)$/i.test(c.name) ? 'line' : undefined,
  }));
  return {
    kind: 'xy',
    series,
    opts: { title, xLabel: label(xcol), yLabel: ycols.length === 1 ? label(ycols[0]) : '', mode, logX: params.logX || autoLogX, logY: params.logY, equal: params.equal },
  };
}

/** Draws a chart spec into the canvas; false when there is nothing to draw. */
export function drawSpec(canvas, spec, settings = {}) {
  if (!spec || spec.kind === 'none' || spec.kind === 'table') {
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    canvas.chartMap = null;
    return false;
  }
  const grid = settings.chartGrid !== false;
  if (spec.kind === 'heatmap') return drawHeatmap(canvas, spec.grid, { ...spec.opts, colormap: settings.colormap, compact: spec.compact });
  if (spec.kind === 'bars') return drawBarChart(canvas, spec.bars, { ...spec.opts, grid });
  return drawLineChart(canvas, spec.series, { ...spec.opts, compact: spec.compact, grid });
}

/** A table element of at most `max` rows (the rest is counted below). */
export function tableElement(table, max = 500) {
  if (!table) return h('p', { className: 'panel-hint' }, '—');
  const rows = Math.min(table.rows, max);
  const body = [];
  for (let r = 0; r < rows; r++) {
    body.push(h('tr', null, h('td', { className: 'row-index' }, String(r + 1)), ...table.columns.map((c) => (c.labels
      ? h('td', null, c.labels[r] ?? '')
      : h('td', { className: 'num' }, Number.isFinite(c.values[r]) ? formatValue(c.values[r], 6) : numberText(c.values[r]))))));
  }
  return h('div', { className: 'data-scroll' },
    h('table', { className: 'data-table result-data', dataset: { testid: 'result-table' } },
      h('thead', null, h('tr', null, h('th', null, '#'), ...table.columns.map((c, i) => h('th', { title: c.unit ? `${c.name} (${c.unit})` : c.name, className: i === table.x ? 'x-col' : null }, c.name, c.unit ? h('small', null, ` ${c.unit}`) : null)))),
      h('tbody', null, ...body)),
    table.rows > max ? h('p', { className: 'panel-hint' }, `… ${(table.rows - max).toLocaleString()} more rows (${table.rows.toLocaleString()})`) : null);
}

/** The result values as a two-column list. */
export function scalarRows(output) {
  return (output?.scalars ?? []).map((s) => [s.name, `${Number.isFinite(s.value) ? formatValue(s.value, 6) : '—'}${s.unit ? ` ${s.unit}` : ''}`]);
}

/** A tab-separated copy of a table (for the clipboard). */
export function tableTsv(table) {
  const head = table.columns.map((c) => c.name).join('\t');
  const lines = [head];
  for (let r = 0; r < table.rows; r++) lines.push(table.columns.map((c) => (c.labels ? c.labels[r] ?? '' : numberText(c.values[r]))).join('\t'));
  return lines.join('\n');
}
