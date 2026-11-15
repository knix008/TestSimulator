// The model document (.mpf, JSON): settings, blocks, links and dashboard
// charts. Pure functions only — no DOM — so the engine, the editor, the tests
// and the sample generator share them.
import { BLOCK_TYPES, baseOf, defaultProps, isSd, nameStem, portCount, TIME_UNITS } from './blocks.js';
import { compile, isIdentifier } from './expr.js';

export const FORMAT = 'myproductionflow';
export const FORMAT_VERSION = 1;

let counter = 0;
export const newId = (prefix = 'b') => `${prefix}${Date.now().toString(36)}${(counter++).toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;

export function defaultSettings() {
  return {
    timeUnit: 'min',
    duration: 480,
    warmup: 0,
    seed: 1,
    randomSeed: false,
    sdDt: 0.25,
    sdMethod: 'euler',
    agentDt: 0.25,
    sampleInterval: 0,
    speed: 4,
    floorWidth: 60,
    floorDepth: 40,
    costPerEntity: 0,
  };
}

export function createModel(name = '') {
  return { format: FORMAT, version: FORMAT_VERSION, name, description: '', settings: defaultSettings(), blocks: [], links: [], charts: [], experiments: [] };
}

/** Repairs a model read from a file (missing fields, unknown types, links to nothing). */
export function normalizeModel(raw) {
  const m = createModel();
  if (!raw || typeof raw !== 'object') return m;
  m.name = String(raw.name ?? '');
  m.description = String(raw.description ?? '');
  m.settings = { ...defaultSettings(), ...(raw.settings ?? {}) };
  if (!TIME_UNITS.includes(m.settings.timeUnit)) m.settings.timeUnit = 'min';
  for (const key of ['duration', 'warmup', 'seed', 'sdDt', 'agentDt', 'sampleInterval', 'speed', 'floorWidth', 'floorDepth', 'costPerEntity']) {
    const v = Number(m.settings[key]);
    m.settings[key] = Number.isFinite(v) ? v : defaultSettings()[key];
  }
  m.settings.duration = Math.max(1e-6, m.settings.duration);
  const names = new Set();
  for (const b of Array.isArray(raw.blocks) ? raw.blocks : []) {
    if (!BLOCK_TYPES[b?.type]) continue;
    const spec = BLOCK_TYPES[b.type];
    const block = {
      id: String(b.id || newId()), type: b.type, name: String(b.name || ''),
      x: Number(b.x) || 0, y: Number(b.y) || 0, rot: Number(b.rot) || 0,
      props: { ...defaultProps(b.type), ...(b.props ?? {}) },
    };
    if (spec.resizable || b.w != null) { block.w = Math.max(0.5, Number(b.w) || spec.w); block.h = Math.max(0.5, Number(b.h) || spec.h); }
    if (spec.path) block.points = Array.isArray(b.points) && b.points.length >= 2 ? b.points.map((q) => [Number(q[0]) || 0, Number(q[1]) || 0]) : structuredClone(spec.defaultPoints);
    if (!block.name || names.has(block.name)) block.name = uniqueName(m, block.type, names);
    names.add(block.name);
    m.blocks.push(block);
  }
  const ids = new Set(m.blocks.map((b) => b.id));
  for (const l of Array.isArray(raw.links) ? raw.links : []) {
    if (!ids.has(l?.from?.block) || !ids.has(l?.to?.block)) continue;
    m.links.push({ id: String(l.id || newId('l')), kind: l.kind === 'influence' ? 'influence' : 'flow', from: { block: l.from.block, port: Number(l.from.port) || 0 }, to: { block: l.to.block, port: Number(l.to.port) || 0 }, points: Array.isArray(l.points) ? l.points.map((q) => [Number(q[0]) || 0, Number(q[1]) || 0]) : [] });
  }
  m.charts = Array.isArray(raw.charts) ? raw.charts.filter((c) => c && Array.isArray(c.series)).map((c) => ({ id: String(c.id || newId('c')), title: String(c.title ?? ''), kind: ['line', 'bar', 'area'].includes(c.kind) ? c.kind : 'line', series: c.series.map(String) })) : [];
  m.experiments = Array.isArray(raw.experiments) ? raw.experiments : [];
  return m;
}

/** "Process3": the first free number for a type's stem (SD names stay valid identifiers). */
export function uniqueName(model, type, taken = null) {
  const used = taken ?? new Set(model.blocks.map((b) => b.name));
  const stem = nameStem(type);
  for (let i = 1; ; i++) if (!used.has(`${stem}${i}`)) return `${stem}${i}`;
}

export function makeBlock(model, type, x, y, extra = {}) {
  const spec = BLOCK_TYPES[type];
  const block = { id: newId(), type, name: uniqueName(model, type), x, y, rot: 0, props: defaultProps(type), ...extra };
  if (extra.props) block.props = { ...defaultProps(type), ...extra.props };
  if (spec.resizable && block.w == null) { block.w = spec.w; block.h = spec.h; }
  if (spec.path && !block.points) block.points = structuredClone(spec.defaultPoints);
  return block;
}

export const blockById = (model, id) => model.blocks.find((b) => b.id === id) ?? null;
export const blockByName = (model, name) => model.blocks.find((b) => b.name === name) ?? null;
export const linksOf = (model, id) => model.links.filter((l) => l.from.block === id || l.to.block === id);

/** Can `from` (block, out port) be linked to `to` (block, in port)? Returns a reason key or null. */
export function linkProblem(model, from, to, kind = 'flow') {
  if (from.block === to.block) return 'link.self';
  const a = blockById(model, from.block); const b = blockById(model, to.block);
  if (!a || !b) return 'link.missing';
  if (kind === 'influence') return isSd(b.type) || baseOf(b.type) === 'display' ? null : 'link.influenceTarget';
  const sdA = isSd(a.type); const sdB = isSd(b.type);
  if (sdA || sdB) {
    // Material links of system dynamics: stock → flow (drains) and flow → stock (fills).
    if (baseOf(a.type) === 'stock' && baseOf(b.type) === 'flow' && portCount(b, 'in') > 0) return null;
    if (baseOf(a.type) === 'flow' && baseOf(b.type) === 'stock' && portCount(a, 'out') > 0) return null;
    return 'link.sdMix';
  }
  if (from.port >= portCount(a, 'out') || to.port >= portCount(b, 'in')) return 'link.port';
  if (model.links.some((l) => l.kind === 'flow' && l.from.block === from.block && l.from.port === from.port && l.to.block === to.block && l.to.port === to.port)) return 'link.duplicate';
  return null;
}

export function addLink(model, from, to, kind = 'flow') {
  const link = { id: newId('l'), kind, from: { ...from }, to: { ...to }, points: [] };
  model.links.push(link);
  return link;
}

/** Removes blocks and every link that touches them. */
export function removeBlocks(model, ids) {
  const set = new Set(ids);
  model.blocks = model.blocks.filter((b) => !set.has(b.id));
  model.links = model.links.filter((l) => !set.has(l.from.block) && !set.has(l.to.block) && !set.has(l.id));
}

/** Renames a block and every expression that mentions it (equations, conditions, displays, charts). */
export function renameBlock(model, id, name) {
  const block = blockById(model, id);
  const clean = String(name ?? '').trim();
  if (!block || !clean || clean === block.name) return false;
  if (model.blocks.some((b) => b !== block && b.name === clean)) return false;
  if (isSd(block.type) && !isIdentifier(clean)) return false;
  const old = block.name;
  const re = new RegExp(`(^|[^A-Za-z0-9_.\\u00C0-\\uFFFF])${old.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[^A-Za-z0-9_\\u00C0-\\uFFFF])`, 'g');
  const swap = (text) => String(text).replace(re, (m, pre) => `${pre}${clean}`);
  for (const b of model.blocks) {
    for (const prop of BLOCK_TYPES[b.type].props) {
      const v = b.props[prop.key];
      if (prop.type === 'expr' && typeof v === 'string') b.props[prop.key] = swap(v);
      if ((prop.type === 'pool' || prop.type === 'ref') && v === old) b.props[prop.key] = clean;
      if (prop.type === 'dist' && v?.type === 'expression') v.expr = swap(v.expr);
      if (baseOf(b.type) === 'chart' && prop.key === 'series') b.props.series = swap(v);
    }
  }
  for (const chart of model.charts) chart.series = chart.series.map(swap);
  block.name = clean;
  return true;
}

/** Copies blocks (with the links among them) with fresh ids and names, moved by (dx, dy). Returns the new blocks. */
export function cloneBlocks(model, blocks, links, dx = 2, dy = 2) {
  const map = new Map();
  const out = [];
  const taken = new Set(model.blocks.map((b) => b.name));
  for (const b of blocks) {
    const copy = structuredClone(b);
    copy.id = newId();
    copy.name = taken.has(b.name) ? uniqueName(model, b.type, taken) : b.name;
    taken.add(copy.name);
    copy.x += dx; copy.y += dy;
    map.set(b.id, copy.id);
    model.blocks.push(copy);
    out.push(copy);
  }
  for (const l of links) {
    if (!map.has(l.from.block) || !map.has(l.to.block)) continue;
    model.links.push({ ...structuredClone(l), id: newId('l'), from: { ...l.from, block: map.get(l.from.block) }, to: { ...l.to, block: map.get(l.to.block) }, points: (l.points ?? []).map(([x, y]) => [x + dx, y + dy]) });
  }
  return out;
}

/** Bounds of the whole model (for "fit", the 3D floor and the minimap). */
export function modelBounds(model) {
  if (!model.blocks.length) return { x0: -10, y0: -10, x1: 10, y1: 10 };
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
  for (const b of model.blocks) {
    const spec = BLOCK_TYPES[b.type];
    const pts = spec.path ? b.points.map(([x, y]) => [b.x + x, b.y + y]) : [[b.x - (b.w ?? spec.w) / 2, b.y - (b.h ?? spec.h) / 2], [b.x + (b.w ?? spec.w) / 2, b.y + (b.h ?? spec.h) / 2]];
    for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  }
  return { x0, y0, x1, y1 };
}

// ───────────────────────── names an expression may use

/** Every name expressions can read, with what it is: SD elements, block metrics, population states. */
export function referenceNames(model) {
  const names = new Map([['time', 'time'], ['t', 'time']]);
  const metrics = {
    source: ['count'], sink: ['count', 'cycleTime', 'throughput'], queue: ['length', 'waitTime', 'count'], process: ['utilization', 'contents', 'count', 'busy'],
    resourcePool: ['utilization', 'busy', 'idle', 'capacity'], seize: ['count'], release: ['count'], select: ['count'], combine: ['count', 'contents'], batch: ['count', 'contents'], unbatch: ['count'],
    gate: ['open', 'count'], assign: ['count'], delay: ['contents', 'count'], conveyor: ['contents', 'count'], transporter: ['utilization', 'waiting', 'count'], robot: ['utilization', 'count'],
    rack: ['contents', 'count', 'fill'], dock: ['utilization', 'count'], road: ['contents', 'count'], signal: ['open', 'count'], parking: ['contents', 'count', 'fill'],
    display: ['value'], split: ['count'], match: ['count', 'contents'], restrictedStart: ['inside', 'count'], restrictedEnd: ['count'], timeStart: ['count'], timeEnd: ['time', 'count'],
    maintenance: ['count'], merge: ['count'],
  };
  for (const b of model.blocks) {
    if (isSd(b.type)) { names.set(b.name, baseOf(b.type)); continue; }
    for (const m of metrics[baseOf(b.type)] ?? []) names.set(`${b.name}.${m}`, 'metric');
    if (baseOf(b.type) === 'cellGrid') names.set(`${b.name}.generation`, 'metric');
    if (baseOf(b.type) === 'population' || baseOf(b.type) === 'cellGrid') {
      names.set(`${b.name}.count`, 'metric');
      for (const s of b.props.states ?? []) names.set(`${b.name}.${s.name}`, 'state');
    }
  }
  return names;
}

// ───────────────────────── model check (Problems panel)

/**
 * Problems of a model: [{ severity: 'error'|'warning'|'info', key, params, block?, link? }]. Messages are i18n keys
 * ("check.<key>") so the panel shows them in the UI language.
 */
export function checkModel(model) {
  const out = [];
  const add = (severity, key, params = {}, extra = {}) => out.push({ severity, key, params, ...extra });
  const s = model.settings;
  if (!(s.duration > 0)) add('error', 'duration');
  if (s.warmup >= s.duration) add('error', 'warmup');
  const names = referenceNames(model);
  const pools = new Set(model.blocks.filter((b) => baseOf(b.type) === 'resourcePool').map((b) => b.name));
  const outgoing = new Map(); const incoming = new Map();
  for (const l of model.links) {
    if (l.kind !== 'flow') continue;
    const k1 = `${l.from.block}:${l.from.port}`; outgoing.set(k1, (outgoing.get(k1) ?? 0) + 1);
    const k2 = `${l.to.block}:${l.to.port}`; incoming.set(k2, (incoming.get(k2) ?? 0) + 1);
  }
  const checkExpr = (b, text, field) => {
    const c = compile(text);
    if (!c.ok) { add('error', 'expr', { name: b.name, field, error: c.error }, { block: b.id }); return; }
    for (const ref of c.refs) if (!names.has(ref)) add('error', 'unknownRef', { name: b.name, field, ref }, { block: b.id });
  };
  for (const b of model.blocks) {
    const spec = BLOCK_TYPES[b.type];
    const base = baseOf(b.type);
    const sd = isSd(b.type);
    if (!sd && !['layout', 'agent', 'analysis'].includes(spec.cat) && base !== 'maintenance') {
      const outs = portCount(b, 'out');
      for (let i = 0; i < outs; i++) {
        if (outgoing.get(`${b.id}:${i}`)) continue;
        if (spec.optionalOuts?.includes(i)) continue;
        add(base === 'source' ? 'error' : 'warning', 'noOutput', { name: b.name, port: i + 1 }, { block: b.id });
      }
      const ins = portCount(b, 'in');
      for (let i = 0; i < ins; i++) if (!incoming.get(`${b.id}:${i}`)) add(base === 'combine' || base === 'match' ? 'warning' : 'info', 'noInput', { name: b.name, port: i + 1 }, { block: b.id });
    }
    for (const prop of spec.props) {
      if (prop.when && !prop.when(b.props)) continue;
      const v = b.props[prop.key];
      if (prop.type === 'expr' && String(v ?? '').trim() !== '') checkExpr(b, v, prop.key);
      if (prop.type === 'dist' && v?.type === 'expression') checkExpr(b, v.expr, prop.key);
      if (prop.type === 'pool' && v && !pools.has(v)) add('error', 'noPool', { name: b.name, pool: v }, { block: b.id });
      if (prop.type === 'ref') {
        const target = model.blocks.find((x) => x.name === v);
        if (!v || !target || baseOf(target.type) !== prop.refBase) add('error', 'noRef', { name: b.name, field: prop.key, ref: v || '—' }, { block: b.id });
      }
    }
    if (base === 'process' && b.props.pool === '' && b.props.units > 1) add('info', 'unitsNoPool', { name: b.name }, { block: b.id });
    if (base === 'seize' && !b.props.pool) add('error', 'seizeNoPool', { name: b.name }, { block: b.id });
    if ((base === 'conveyor' || base === 'road') && !(Number(b.props.speed) > 0)) add('error', 'speed', { name: b.name }, { block: b.id });
    if (spec.path && (b.points?.length ?? 0) < 2) add('error', 'path', { name: b.name }, { block: b.id });
    if (base === 'combine') {
      const q = String(b.props.quantities).split(/[,;\s]+/).filter(Boolean);
      if (q.length !== b.props.inputs) add('warning', 'quantities', { name: b.name, inputs: b.props.inputs, given: q.length }, { block: b.id });
    }
    if (base === 'select' && b.props.mode === 'probability') {
      const w = String(b.props.weights).split(/[,;\s]+/).filter(Boolean);
      if (w.length !== b.props.outputs) add('warning', 'weights', { name: b.name, outputs: b.props.outputs, given: w.length }, { block: b.id });
    }
    if (base === 'flow') {
      const inLinks = model.links.filter((l) => l.to.block === b.id && l.kind === 'flow');
      const outLinks = model.links.filter((l) => l.from.block === b.id && l.kind === 'flow');
      if (!inLinks.length && !outLinks.length) add('warning', 'flowFree', { name: b.name }, { block: b.id });
    }
    if (sd && !isIdentifier(b.name)) add('error', 'sdName', { name: b.name }, { block: b.id });
    if (base === 'population' || base === 'cellGrid') {
      const states = new Set((b.props.states ?? []).map((st) => st.name));
      if (!states.size) add('error', 'noStates', { name: b.name }, { block: b.id });
      for (const tr of b.props.transitions ?? []) {
        for (const key of ['from', 'to']) if (!states.has(tr[key])) add('error', 'badState', { name: b.name, state: tr[key] ?? '' }, { block: b.id });
        if (['contact', 'neighbors', 'neighborsOutside'].includes(tr.kind) && !states.has(tr.trigger)) add('error', 'badState', { name: b.name, state: tr.trigger ?? '' }, { block: b.id });
        if (tr.kind === 'condition') checkExpr(b, tr.value, 'transition');
      }
    }
    if (base === 'chart') for (const ref of String(b.props.series).split(/[,;]+/).map((x) => x.trim()).filter(Boolean)) if (!names.has(ref)) add('warning', 'chartRef', { name: b.name, ref }, { block: b.id });
  }
  for (const chart of model.charts) for (const ref of chart.series) if (!names.has(ref)) add('warning', 'chartRef', { name: chart.title || 'chart', ref });
  if (!model.blocks.length) add('info', 'empty');
  return out;
}

export const countBySeverity = (problems) => ({ error: problems.filter((x) => x.severity === 'error').length, warning: problems.filter((x) => x.severity === 'warning').length, info: problems.filter((x) => x.severity === 'info').length });

// ───────────────────────── undo / redo

export class History {
  constructor(model, limit = 200) { this.stack = [JSON.stringify(model)]; this.index = 0; this.limit = limit; this.labels = ['']; }
  get canUndo() { return this.index > 0; }
  get canRedo() { return this.index < this.stack.length - 1; }
  push(model, label = '') {
    const snap = JSON.stringify(model);
    if (snap === this.stack[this.index]) return false;
    this.stack = this.stack.slice(0, this.index + 1);
    this.labels = this.labels.slice(0, this.index + 1);
    this.stack.push(snap); this.labels.push(label);
    if (this.stack.length > this.limit) { this.stack.shift(); this.labels.shift(); }
    this.index = this.stack.length - 1;
    return true;
  }
  undo() { if (!this.canUndo) return null; this.index -= 1; return JSON.parse(this.stack[this.index]); }
  redo() { if (!this.canRedo) return null; this.index += 1; return JSON.parse(this.stack[this.index]); }
  get undoLabel() { return this.labels[this.index] ?? ''; }
  get redoLabel() { return this.labels[this.index + 1] ?? ''; }
}

// ───────────────────────── file

export function serializeModel(model) {
  return `${JSON.stringify({ ...model, format: FORMAT, version: FORMAT_VERSION, savedAt: new Date().toISOString() }, null, 1)}\n`;
}

export function parseModel(text) {
  const raw = JSON.parse(String(text).replace(/^﻿/, ''));
  if (raw?.format && raw.format !== FORMAT) throw Object.assign(new Error(`Not a MyProductionFlow model (${raw.format})`), { code: 'format' });
  return normalizeModel(raw);
}

/** Formats model time in its unit: "12.5 min", or h:mm:ss for long runs. */
export function formatTime(value, unit = 'min', digits = 1) {
  const v = Number(value) || 0;
  return `${v.toFixed(digits)} ${unit}`;
}

/** Clock text for the status bar and the run bar: model time → "1d 02:03:04" (assuming the unit). */
export function clockText(value, unit = 'min') {
  const seconds = (Number(value) || 0) * ({ s: 1, min: 60, h: 3600, day: 86400 }[unit] ?? 60);
  const d = Math.floor(seconds / 86400); const h = Math.floor((seconds % 86400) / 3600); const m = Math.floor((seconds % 3600) / 60); const s = Math.floor(seconds % 60);
  const hms = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return d ? `${d}d ${hms}` : hms;
}
