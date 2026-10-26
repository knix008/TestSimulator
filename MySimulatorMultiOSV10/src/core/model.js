// The pipeline document (.mysim): nodes with their parameters and their place
// on the canvas, links from an output to an input port, and settings. The
// engine reads the same JSON (ARCHITECTURE.md "Pipeline JSON").
import { nodeSpec, defaultParams, nodeName, portsOf } from './catalog.js';

export const EXTENSION = 'mysim';
export const FORMAT = 'mysim';

export function emptyModel(lang = 'ko') {
  return {
    format: FORMAT,
    version: 1,
    name: lang === 'en' ? 'Untitled pipeline' : '새 파이프라인',
    description: '',
    nodes: [],
    links: [],
    settings: { seed: 1 },
    view: null,
  };
}

/** A fresh id with the prefix that is not in `taken`. */
export function newId(prefix, taken) {
  const used = new Set(taken);
  let n = 1;
  while (used.has(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}

function num(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** Fills missing fields and drops links that point nowhere, so the editor can trust the shape. */
export function normalizeModel(raw) {
  const m = raw && typeof raw === 'object' ? raw : {};
  const nodes = (Array.isArray(m.nodes) ? m.nodes : []).filter((n) => n && typeof n === 'object' && n.id && n.type).map((n, i) => ({
    id: String(n.id),
    type: String(n.type),
    name: typeof n.name === 'string' && n.name ? n.name : String(n.id),
    x: num(n.x, 80 + (i % 5) * 220),
    y: num(n.y, 80 + Math.floor(i / 5) * 160),
    params: n.params && typeof n.params === 'object' ? n.params : {},
    disabled: Boolean(n.disabled),
    ...(n.note ? { note: String(n.note) } : {}),
  }));
  const ids = new Set(nodes.map((n) => n.id));
  const links = (Array.isArray(m.links) ? m.links : []).filter((l) => l && ids.has(l.from) && ids.has(l.to)).map((l, i) => ({
    id: l.id ? String(l.id) : `l${i + 1}`,
    from: String(l.from),
    fromPort: l.fromPort || 'out',
    to: String(l.to),
    toPort: l.toPort || 'in',
  }));
  return {
    format: FORMAT,
    version: 1,
    name: typeof m.name === 'string' ? m.name : '',
    description: typeof m.description === 'string' ? m.description : '',
    nodes,
    links,
    settings: { seed: num(m.settings?.seed, 1) },
    view: m.view ?? null,
    app: normalizeApp(m.app),
    matlab: normalizeMatlab(m.matlab),
  };
}

/** The MATLAB desktop's files (the Current Folder of this document). */
export function normalizeMatlab(x) {
  if (!x || typeof x !== 'object' || !Array.isArray(x.files)) return null;
  return { files: x.files.filter((f) => f && typeof f.name === 'string' && f.name).map((f) => ({ name: String(f.name), code: typeof f.code === 'string' ? f.code : '' })) };
}

/** The app (dashboard) section: the controls the dashboard shows, each one a node parameter. */
export function normalizeApp(a) {
  if (!a || typeof a !== 'object') return null;
  const fin = (v) => (v === '' || v == null || !Number.isFinite(Number(v)) ? undefined : Number(v));
  const controls = (Array.isArray(a.controls) ? a.controls : []).filter((c) => c && c.node && c.param).map((c) => {
    const out = { node: String(c.node), param: String(c.param) };
    if (typeof c.label === 'string' && c.label) out.label = c.label;
    for (const k of ['min', 'max', 'step']) if (fin(c[k]) !== undefined) out[k] = fin(c[k]);
    return out;
  });
  return { controls };
}

export function parseModel(text) {
  let raw;
  try {
    raw = JSON.parse(String(text).replace(/^﻿/, ''));
  } catch (error) {
    throw new Error(`JSON: ${error.message}`);
  }
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.nodes)) throw new Error('not a MySimulator pipeline (no "nodes")');
  return normalizeModel(raw);
}

export function serializeModel(model) {
  return `${JSON.stringify(normalizeModel(model), null, 2)}\n`;
}

/** What the engine needs (the canvas places and view state stay behind). */
export function engineModel(model) {
  return {
    format: FORMAT,
    version: 1,
    name: model.name,
    nodes: model.nodes.map((n) => ({ id: n.id, type: n.type, name: n.name, params: n.params, disabled: n.disabled })),
    links: model.links.map((l) => ({ from: l.from, fromPort: l.fromPort, to: l.to, toPort: l.toPort })),
    settings: model.settings,
  };
}

/** A new node of `type` at (x, y), named after its type (numbered when taken). */
export function createNode(model, type, x, y, lang = 'ko') {
  const spec = nodeSpec(type);
  const id = newId('n', model.nodes.map((n) => n.id));
  const base = spec ? nodeName(spec, lang) : type;
  const names = new Set(model.nodes.map((n) => n.name));
  let name = base;
  for (let k = 2; names.has(name); k++) name = `${base} ${k}`;
  return { id, type, name, x: Math.round(x), y: Math.round(y), params: defaultParams(type), disabled: false };
}

/** The ports a node accepts (its type's inputs). */
export function inputPorts(node) {
  const spec = nodeSpec(node.type);
  return spec ? portsOf(spec) : ['in'];
}

/** Adds (or replaces) the link into to.toPort; refuses a loop. Returns the new model or null. */
export function connect(model, from, to, toPort = 'in') {
  if (from === to) return null;
  if (reaches(model, to, from)) return null;
  const links = model.links.filter((l) => !(l.to === to && l.toPort === toPort));
  const id = newId('l', model.links.map((l) => l.id));
  return { ...model, links: [...links, { id, from, fromPort: 'out', to, toPort }] };
}

/** Is `target` downstream of `start`? */
export function reaches(model, start, target) {
  const seen = new Set();
  const stack = [start];
  while (stack.length) {
    const id = stack.pop();
    if (id === target) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const l of model.links) if (l.from === id) stack.push(l.to);
  }
  return false;
}

/** Ids of the nodes upstream of `id` (its inputs, their inputs …). */
export function upstream(model, id) {
  const out = new Set();
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop();
    for (const l of model.links) {
      if (l.to === cur && !out.has(l.from)) {
        out.add(l.from);
        stack.push(l.from);
      }
    }
  }
  return out;
}

/** Topological order (ties keep the node list order), or null when there is a loop. */
export function executionOrder(model) {
  const indeg = new Map(model.nodes.map((n) => [n.id, 0]));
  for (const l of model.links) indeg.set(l.to, (indeg.get(l.to) ?? 0) + 1);
  const order = [];
  const ready = model.nodes.filter((n) => indeg.get(n.id) === 0).map((n) => n.id);
  const pos = new Map(model.nodes.map((n, i) => [n.id, i]));
  while (ready.length) {
    ready.sort((a, b) => pos.get(a) - pos.get(b));
    const id = ready.shift();
    order.push(id);
    for (const l of model.links) {
      if (l.from !== id) continue;
      indeg.set(l.to, indeg.get(l.to) - 1);
      if (indeg.get(l.to) === 0) ready.push(l.to);
    }
  }
  return order.length === model.nodes.length ? order : null;
}

/** Problems found before running: { level, key, args, node }. */
export function checkModel(model) {
  const issues = [];
  if (!model.nodes.length) issues.push({ level: 'error', key: 'issueEmpty', args: {} });
  for (const n of model.nodes) {
    const spec = nodeSpec(n.type);
    if (!spec) {
      issues.push({ level: 'error', key: 'issueUnknownType', args: { name: n.name, type: n.type }, node: n.id });
      continue;
    }
    if (n.disabled) continue;
    for (const port of spec.inputs) {
      const linked = model.links.some((l) => l.to === n.id && l.toPort === port.port);
      if (!linked && !port.optional) issues.push({ level: 'error', key: 'issueInput', args: { name: n.name, port: port.port }, node: n.id });
    }
  }
  if (model.nodes.length && !executionOrder(model)) issues.push({ level: 'error', key: 'issueLoop', args: {} });
  const outputs = model.nodes.filter((n) => n.type === 'out.plot' || n.type === 'out.kpi');
  if (model.nodes.length && !outputs.length) issues.push({ level: 'info', key: 'issueNoOutput', args: {} });
  return issues;
}

/** Does the pipeline run programs on the computer (Python, a command)? */
export function externalNodes(model) {
  return model.nodes.filter((n) => !n.disabled && (n.type === 'io.python' || n.type === 'io.command'));
}

/** Bounding box of the nodes on the canvas (node size w × h). */
export function graphBounds(model, w = 180, h = 64) {
  if (!model.nodes.length) return { x0: 0, y0: 0, x1: 600, y1: 400 };
  const xs = model.nodes.map((n) => n.x);
  const ys = model.nodes.map((n) => n.y);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs) + w, y1: Math.max(...ys) + h };
}

/** Lays the nodes out in columns by their depth in the graph (auto arrange). */
export function autoLayout(model, dx = 240, dy = 120) {
  const depth = new Map();
  const order = executionOrder(model) ?? model.nodes.map((n) => n.id);
  for (const id of order) {
    const parents = model.links.filter((l) => l.to === id).map((l) => depth.get(l.from) ?? 0);
    depth.set(id, parents.length ? Math.max(...parents) + 1 : 0);
  }
  const rows = new Map();
  const nodes = model.nodes.map((n) => {
    const d = depth.get(n.id) ?? 0;
    const r = rows.get(d) ?? 0;
    rows.set(d, r + 1);
    return { ...n, x: 60 + d * dx, y: 60 + r * dy };
  });
  return { ...model, nodes };
}
