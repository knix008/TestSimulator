// One open chart (a tab): its data table, its chart description, where it came from, and undo / redo.
// Saved as .mychart (JSON): { format: 'mychart', version: 1, data: table, chart, created, modified }.
import { cloneTable, createTable, inferTypes } from '../data/table.js';
import { CHART_IDS } from './types.js';
import { defaultOptions, normalizeChart } from './render.js';

let nextId = 1;
const UNDO_MAX = 200;

export class ChartDoc {
  constructor({ name = 'chart.mychart', path = null, handle = null, table, chart = {}, sample = null } = {}) {
    this.id = `chart-${nextId++}`;
    this.name = name;
    this.path = path;
    this.handle = handle;
    this.sample = sample;
    this.table = table ?? createTable(['Category', 'Value'], []);
    this.chart = normalizeChart(chart, this.table);
    this.dirty = false;
    this.undoStack = [];
    this.redoStack = [];
    this.selection = { row: 0, col: 0, series: null };
    this.created = new Date().toISOString();
  }

  snapshot() {
    return { table: cloneTable(this.table), chart: JSON.parse(JSON.stringify(this.chart)) };
  }

  /** Records the state before a change (call before changing). `merge`: a run of the same edit is one undo step. */
  remember(merge = null) {
    const now = Date.now();
    if (merge && this.lastMerge === merge && now - this.lastAt < 1200) { this.lastAt = now; return; }
    this.undoStack.push(this.snapshot());
    if (this.undoStack.length > UNDO_MAX) this.undoStack.shift();
    this.redoStack = [];
    this.lastMerge = merge;
    this.lastAt = now;
  }

  setTable(table, { merge = null } = {}) {
    this.remember(merge);
    this.table = table;
    // The mapping stays where it still fits the new columns.
    this.chart = normalizeChart(this.chart, this.table);
    this.dirty = true;
  }

  setChart(patch, { merge = null } = {}) {
    this.remember(merge);
    const options = patch.options ? { ...this.chart.options, ...patch.options } : this.chart.options;
    const mapping = patch.mapping ? { ...this.chart.mapping, ...patch.mapping } : this.chart.mapping;
    this.chart = normalizeChart({ ...this.chart, ...patch, options, mapping }, this.table);
    this.dirty = true;
  }

  /**
   * Which part of the table the chart reads (`dataRange`: { r0, r1, c0, c1 } or null) and how (`seriesIn`: 'columns'
   * or 'rows'). The column roles are found again for the new view; hidden series and mixed kinds start over.
   */
  setDataView(patch) {
    this.remember();
    const options = { ...this.chart.options, hidden: [], seriesTypes: {}, seriesAxis: {} };
    this.chart = normalizeChart({ ...this.chart, ...patch, mapping: null, options }, this.table);
    this.dirty = true;
  }

  /** Another chart type: the mapping is made again from the data (keeping what fits). */
  setType(type) {
    if (!CHART_IDS.includes(type) || type === this.chart.type) return false;
    this.remember();
    const keep = { category: this.chart.mapping.category, values: this.chart.mapping.values };
    this.chart = normalizeChart({ ...this.chart, type, mapping: keep, options: { ...this.chart.options, hidden: [] } }, this.table);
    this.dirty = true;
    return true;
  }

  canUndo() { return this.undoStack.length > 0; }
  canRedo() { return this.redoStack.length > 0; }

  undo() {
    const state = this.undoStack.pop();
    if (!state) return false;
    this.redoStack.push(this.snapshot());
    this.table = state.table;
    this.chart = state.chart;
    this.dirty = true;
    this.lastMerge = null;
    return true;
  }

  redo() {
    const state = this.redoStack.pop();
    if (!state) return false;
    this.undoStack.push(this.snapshot());
    this.table = state.table;
    this.chart = state.chart;
    this.dirty = true;
    this.lastMerge = null;
    return true;
  }

  toJSON() {
    return { format: 'mychart', version: 1, app: 'MyChartMaster', created: this.created, modified: new Date().toISOString(), chart: this.chart, data: this.table };
  }

  serialize() {
    return `${JSON.stringify(this.toJSON(), null, 1)}\n`;
  }

  static fromJSON(json, { name, path = null, handle = null } = {}) {
    const raw = typeof json === 'string' ? JSON.parse(json) : json;
    if (!raw || raw.format !== 'mychart' || !raw.data) throw new Error('import.notChart');
    const table = inferTypes(createTable(raw.data.columns ?? [], raw.data.rows ?? []));
    // The saved types win where they were set (a "number" column of codes the user wants as text…).
    (raw.data.columns ?? []).forEach((c, i) => { if (c?.type && table.columns[i]) table.columns[i].type = c.type; });
    const doc = new ChartDoc({ name, path, handle, table, chart: raw.chart ?? {} });
    if (raw.created) doc.created = raw.created;
    return doc;
  }
}

/** Options a chart gets when it is made new (Settings › Charts). */
export function newChartOptions(settings = {}) {
  return {
    ...defaultOptions(),
    chartTheme: settings.chartTheme ?? 'classic',
    palette: settings.chartPalette ?? 'vivid',
    background: settings.chartBackground ?? 'theme',
    legend: settings.chartLegend ?? 'bottom',
    dataLabels: Boolean(settings.chartDataLabels),
    barRadius: settings.chartRounded ?? 4,
    fontFamily: settings.chartFont ?? '',
    width: settings.chartWidth ?? 1024,
    height: settings.chartHeight ?? 640,
  };
}
