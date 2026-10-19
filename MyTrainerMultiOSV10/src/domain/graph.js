// The model as a graph: nodes are layers (type, name, params, x/y on the
// canvas), edges carry tensors from one node's output to another node's input.
// The order of a node's incoming edges is the order of its inputs (merge layers).
// Everything here is pure: the editor, the engines and the code generator share it.
import { BLOCKS, coerceParam, countParams, defaultParams, inferLayer, LAYERS, paramDef, ShapeError, shapeText } from './layers.js';

export const NODE_W = 196;
export const NODE_H = 74;
const GAP_Y = 34;

export const emptyModel = () => ({ nodes: [], edges: [] });

let counter = 0;
const uid = (prefix) => `${prefix}${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

/** A Python-safe name for a new node of `type` ("dense_3"), unique in the model. */
export function uniqueName(model, type) {
  const base = type.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`).replace(/[^a-z0-9_]/g, '_');
  const taken = new Set(model.nodes.map((node) => node.name));
  for (let n = 1; ; n++) if (!taken.has(`${base}_${n}`)) return `${base}_${n}`;
}

/** A name the user typed, made into a valid unique Python identifier. */
export function cleanName(model, value, selfId = null) {
  let name = String(value ?? '').trim().replace(/[^A-Za-z0-9_]/g, '_');
  if (!name) name = 'layer';
  if (/^[0-9]/.test(name)) name = `l_${name}`;
  if (PY_RESERVED.has(name)) name = `${name}_`;
  const taken = new Set(model.nodes.filter((node) => node.id !== selfId).map((node) => node.name));
  if (!taken.has(name)) return name;
  for (let n = 2; ; n++) if (!taken.has(`${name}_${n}`)) return `${name}_${n}`;
}

const PY_RESERVED = new Set(['False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await', 'break', 'class', 'continue', 'def', 'del', 'elif', 'else', 'except', 'finally', 'for', 'from', 'global', 'if', 'import', 'in', 'is', 'lambda', 'nonlocal', 'not', 'or', 'pass', 'raise', 'return', 'try', 'while', 'with', 'yield', 'x', 'self', 'model', 'torch', 'nn', 'F', 'mt', 'data', 'CONFIG']);

export const nodeById = (model, id) => model.nodes.find((node) => node.id === id) ?? null;
export const incoming = (model, id) => model.edges.filter((edge) => edge.to === id);
export const outgoing = (model, id) => model.edges.filter((edge) => edge.from === id);

export function addNode(model, type, params = {}, at = null, name = null) {
  if (!LAYERS[type]) throw new Error(`unknown layer type ${type}`);
  const node = {
    id: uid('n'),
    type,
    name: name ? cleanName(model, name) : uniqueName(model, type),
    params: defaultParams(type, params),
    x: at?.x ?? 40,
    y: at?.y ?? 40 + model.nodes.length * (NODE_H + GAP_Y),
  };
  model.nodes.push(node);
  return node;
}

/** Can an edge from → to be added? (no self loops, no duplicates, no cycles, single-input layers take one input) */
export function canConnect(model, from, to) {
  if (from === to) return { ok: false, code: 'edit.selfLoop' };
  const target = nodeById(model, to);
  const source = nodeById(model, from);
  if (!target || !source) return { ok: false, code: 'edit.missing' };
  if (LAYERS[target.type].inputs === 0) return { ok: false, code: 'edit.inputHasNoInput' };
  if (model.edges.some((edge) => edge.from === from && edge.to === to)) return { ok: false, code: 'edit.duplicateEdge' };
  if (reaches(model, to, from)) return { ok: false, code: 'edit.cycle' };
  return { ok: true };
}

/** Is `target` reachable from `start` along the edges? */
export function reaches(model, start, target) {
  const seen = new Set();
  const stack = [start];
  while (stack.length) {
    const id = stack.pop();
    if (id === target) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const edge of outgoing(model, id)) stack.push(edge.to);
  }
  return false;
}

/** Adds an edge. A single-input layer that already has an input gets it replaced. */
export function connect(model, from, to) {
  const check = canConnect(model, from, to);
  if (!check.ok) return check;
  const target = nodeById(model, to);
  if (LAYERS[target.type].inputs === 1) model.edges = model.edges.filter((edge) => edge.to !== to);
  const edge = { id: uid('e'), from, to };
  model.edges.push(edge);
  return { ok: true, edge };
}

export function removeEdge(model, id) {
  model.edges = model.edges.filter((edge) => edge.id !== id);
}

/** Removes nodes; a removed node in the middle of a chain is bridged (its input joins its outputs). */
export function removeNodes(model, ids, { bridge = true } = {}) {
  const gone = new Set(ids);
  for (const id of ids) {
    if (!bridge) continue;
    const ins = incoming(model, id).filter((edge) => !gone.has(edge.from));
    const outs = outgoing(model, id).filter((edge) => !gone.has(edge.to));
    if (ins.length === 1) {
      for (const out of outs) {
        if (!model.edges.some((edge) => edge.from === ins[0].from && edge.to === out.to)) model.edges.push({ id: uid('e'), from: ins[0].from, to: out.to });
      }
    }
  }
  model.nodes = model.nodes.filter((node) => !gone.has(node.id));
  model.edges = model.edges.filter((edge) => !gone.has(edge.from) && !gone.has(edge.to));
}

/** Sets one parameter (coerced to its kind). Returns true when it changed. */
export function setParam(model, id, key, value) {
  const node = nodeById(model, id);
  const def = node && paramDef(node.type, key);
  if (!def) return false;
  const next = coerceParam(def, value);
  if (node.params[key] === next) return false;
  node.params[key] = next;
  return true;
}

/**
 * Inserts a layer of `type` right after node `id`: it takes over that node's outgoing edges.
 * The nodes below move down to make room.
 */
export function insertAfter(model, id, type, params = {}) {
  const prev = nodeById(model, id);
  if (!prev) return null;
  const node = addNode(model, type, params, { x: prev.x, y: prev.y + NODE_H + GAP_Y });
  shiftBelow(model, prev.y + 1, NODE_H + GAP_Y, new Set([node.id]));
  for (const edge of outgoing(model, id)) edge.from = node.id;
  model.edges.push({ id: uid('e'), from: id, to: node.id });
  return node;
}

/** Inserts a layer before node `id` (between it and its single input). */
export function insertBefore(model, id, type, params = {}) {
  const next = nodeById(model, id);
  if (!next || LAYERS[next.type].inputs === 0) return null;
  const node = addNode(model, type, params, { x: next.x, y: next.y });
  shiftBelow(model, next.y - 1, NODE_H + GAP_Y, new Set([node.id]));
  for (const edge of incoming(model, id)) edge.to = node.id;
  model.edges.push({ id: uid('e'), from: node.id, to: id });
  return node;
}

function shiftBelow(model, y, dy, skip) {
  for (const node of model.nodes) if (!skip.has(node.id) && node.y > y) node.y += dy;
}

/** Changes a node's layer type, keeping the parameters both types share. */
export function replaceType(model, id, type) {
  const node = nodeById(model, id);
  if (!node || !LAYERS[type] || node.type === type) return false;
  const kept = Object.fromEntries(Object.entries(node.params).filter(([key]) => LAYERS[type].params.some((param) => param.key === key)));
  node.type = type;
  node.params = defaultParams(type, kept);
  node.name = cleanName(model, uniqueName(model, type), node.id);
  if (LAYERS[type].inputs === 0) model.edges = model.edges.filter((edge) => edge.to !== id);
  if (LAYERS[type].inputs === 1) {
    const ins = incoming(model, id);
    if (ins.length > 1) model.edges = model.edges.filter((edge) => edge.to !== id || edge === ins[0]);
  }
  return true;
}

/** Copies of nodes (and the edges between them), placed beside the originals. Returns the new nodes. */
export function duplicateNodes(model, ids, offset = { x: 36, y: 36 }) {
  const map = new Map();
  for (const id of ids) {
    const node = nodeById(model, id);
    if (!node || node.type === 'input') continue;
    const copy = addNode(model, node.type, structuredClone(node.params), { x: node.x + offset.x, y: node.y + offset.y });
    map.set(id, copy.id);
  }
  for (const edge of [...model.edges]) {
    if (map.has(edge.from) && map.has(edge.to)) model.edges.push({ id: uid('e'), from: map.get(edge.from), to: map.get(edge.to) });
  }
  // A single copied node in a chain stays wired in the chain (copy of its input → copy).
  if (map.size === 1) {
    const [[original, copy]] = map;
    const ins = incoming(model, original);
    if (ins.length === 1 && LAYERS[nodeById(model, copy).type].inputs !== 0) model.edges.push({ id: uid('e'), from: ins[0].from, to: copy });
  }
  return [...map.values()].map((id) => nodeById(model, id));
}

/**
 * Wraps the chain from `fromId` to `toId` in a residual connection: an Add node after `toId`
 * gets both the chain's output and the chain's input. Fails when the shapes differ.
 */
export function addResidual(model, fromId, toId, shapes) {
  const start = incoming(model, fromId)[0]?.from;
  if (!start) return { ok: false, code: 'edit.residualNoInput' };
  if (shapes && shapeText(shapes.get(start)?.shape) !== shapeText(shapes.get(toId)?.shape)) return { ok: false, code: 'edit.residualShape' };
  const add = insertAfter(model, toId, 'add');
  model.edges.push({ id: uid('e'), from: start, to: add.id });
  add.x += NODE_W / 2 + 30;
  return { ok: true, node: add };
}

/** Drops a block (BLOCKS) as a chain; wired after `afterId` when given. Returns the new nodes. */
export function addBlock(model, blockId, afterId = null, at = null) {
  const block = BLOCKS[blockId];
  if (!block) return [];
  const nodes = [];
  let prev = afterId;
  for (const [type, params] of block.layers) {
    const node = prev ? insertAfter(model, prev, type, params) : addNode(model, type, params, at ? { x: at.x, y: at.y + nodes.length * (NODE_H + GAP_Y) } : null);
    if (!prev && nodes.length) model.edges.push({ id: uid('e'), from: nodes.at(-1).id, to: node.id });
    nodes.push(node);
    prev = node.id;
  }
  return nodes;
}

/** Builds a chain model from [type, params] pairs (samples, tests). */
export function chain(layers) {
  const model = emptyModel();
  let prev = null;
  for (const [type, params, name] of layers) {
    const node = addNode(model, type, params, null, name);
    if (prev) model.edges.push({ id: uid('e'), from: prev.id, to: node.id });
    prev = node;
  }
  layoutModel(model);
  return model;
}

// ───────────────────────── order, shapes, problems

/** Node ids in an order where every node comes after its inputs; throws on a cycle. */
export function topoOrder(model) {
  const indegree = new Map(model.nodes.map((node) => [node.id, 0]));
  for (const edge of model.edges) if (indegree.has(edge.to)) indegree.set(edge.to, indegree.get(edge.to) + 1);
  // Stable: ties keep top-to-bottom, left-to-right order on the canvas.
  const byPlace = (a, b) => (a.y - b.y) || (a.x - b.x);
  const ready = model.nodes.filter((node) => indegree.get(node.id) === 0).sort(byPlace);
  const order = [];
  while (ready.length) {
    const node = ready.shift();
    order.push(node.id);
    for (const edge of outgoing(model, node.id)) {
      if (!indegree.has(edge.to)) continue;
      indegree.set(edge.to, indegree.get(edge.to) - 1);
      if (indegree.get(edge.to) === 0) {
        ready.push(nodeById(model, edge.to));
        ready.sort(byPlace);
      }
    }
  }
  if (order.length !== model.nodes.length) throw new ShapeError('graph.cycle');
  return order;
}

export const inputNodes = (model) => model.nodes.filter((node) => node.type === 'input');
/** Nodes nothing reads from (the model's outputs). */
export const outputNodes = (model) => model.nodes.filter((node) => node.type !== 'input' && !model.edges.some((edge) => edge.from === node.id));

/**
 * Shapes of every node: id → { shape, error: { code, params } | null, params: { total, trainable } }.
 * `inputShape` (from the dataset) replaces the input node's own shape when given.
 */
export function inferShapes(model, inputShape = null) {
  const out = new Map();
  let order;
  try {
    order = topoOrder(model);
  } catch {
    for (const node of model.nodes) out.set(node.id, { shape: null, error: { code: 'graph.cycle', params: {} }, params: { total: 0, trainable: 0 } });
    return out;
  }
  for (const id of order) {
    const node = nodeById(model, id);
    const ins = incoming(model, id).map((edge) => out.get(edge.from));
    const entry = { shape: null, error: null, params: { total: 0, trainable: 0 } };
    try {
      if (node.type === 'input') {
        entry.shape = inputShape ?? inferLayer('input', [], node.params);
      } else {
        if (!ins.length) throw new ShapeError('shape.noInput');
        if (ins.some((input) => !input?.shape)) throw new ShapeError('shape.inputBroken');
        const shapes = ins.map((input) => input.shape);
        entry.shape = inferLayer(node.type, shapes, node.params);
        entry.params = countParams(node.type, shapes, node.params);
      }
    } catch (error) {
      entry.error = { code: error.code ?? 'shape.unknown', params: error.params ?? { message: error.message } };
    }
    out.set(id, entry);
  }
  return out;
}

export function totalParams(shapes) {
  let total = 0;
  let trainable = 0;
  for (const entry of shapes.values()) {
    total += entry.params.total;
    trainable += entry.params.trainable;
  }
  return { total, trainable };
}

/**
 * Problems that keep the model from training: [{ nodeId|null, level: 'error'|'warning', code, params }].
 * `task` = { kind: 'classification'|'regression'|'reconstruction', classes, outputShape, inputShape }.
 */
export function validateModel(model, task = null, shapes = inferShapes(model, task?.inputShape ?? null)) {
  const problems = [];
  const add = (nodeId, level, code, params = {}) => problems.push({ nodeId, level, code, params });
  if (!model.nodes.length) add(null, 'error', 'valid.empty');
  const inputs = inputNodes(model);
  if (!inputs.length && model.nodes.length) add(null, 'error', 'valid.noInput');
  if (inputs.length > 1) for (const node of inputs.slice(1)) add(node.id, 'error', 'valid.manyInputs');
  const outputs = outputNodes(model);
  if (model.nodes.length && !outputs.length) add(null, 'error', 'valid.noOutput');
  if (outputs.length > 1) for (const node of outputs) add(node.id, 'error', 'valid.manyOutputs', { name: node.name });
  for (const node of model.nodes) {
    const entry = shapes.get(node.id);
    if (entry?.error && entry.error.code !== 'shape.inputBroken') add(node.id, 'error', entry.error.code, entry.error.params);
    if (node.type !== 'input' && inputs.length && !inputs.some((input) => reaches(model, input.id, node.id))) add(node.id, 'warning', 'valid.unreachable', { name: node.name });
  }
  if (task && outputs.length === 1) {
    const out = outputs[0];
    const shape = shapes.get(out.id)?.shape;
    const last = lastActivation(model, out);
    if (shape) {
      const want = expectedOutput(task);
      if (want && shapeText(shape) !== shapeText(want)) add(out.id, 'error', 'valid.outputShape', { got: shapeText(shape), want: shapeText(want) });
      if (task.kind === 'classification' && task.classes > 2 && last !== 'softmax') add(out.id, 'warning', 'valid.wantSoftmax');
      if (task.kind === 'classification' && task.classes === 2 && shape.at(-1) === 1 && last !== 'sigmoid') add(out.id, 'warning', 'valid.wantSigmoid');
      if (task.kind === 'regression' && ['softmax', 'sigmoid'].includes(last)) add(out.id, 'warning', 'valid.regressionActivation', { activation: last });
    }
  }
  return problems;
}

/** The activation the output passes through last (Dense/Conv activation or an Activation layer). */
export function lastActivation(model, node) {
  if (node.params?.activation) return node.params.activation;
  if (['dropout', 'flatten', 'reshape'].includes(node.type)) {
    const input = incoming(model, node.id)[0];
    return input ? lastActivation(model, nodeById(model, input.from)) : 'linear';
  }
  return 'linear';
}

/** The output shape the task wants. Binary classification accepts (1,) or (2,). */
export function expectedOutput(task) {
  if (task.kind === 'classification') return task.classes === 2 && task.binaryOutput === 1 ? [1] : [task.classes];
  if (task.kind === 'regression') return task.outputShape ?? [1];
  if (task.kind === 'reconstruction') return task.outputShape ?? task.inputShape;
  return null;
}

// ───────────────────────── layout

/** Arranges nodes in layers top to bottom (longest path from the inputs), centred in each row. */
export function layoutModel(model, { left = 60, top = 40 } = {}) {
  let order;
  try { order = topoOrder(model); } catch { return; }
  const depth = new Map();
  for (const id of order) {
    const ins = incoming(model, id);
    depth.set(id, ins.length ? Math.max(...ins.map((edge) => depth.get(edge.from) ?? 0)) + 1 : 0);
  }
  const rows = [];
  for (const id of order) (rows[depth.get(id)] ??= []).push(id);
  const widest = Math.max(1, ...rows.map((row) => row.length));
  rows.forEach((row, r) => {
    const offset = ((widest - row.length) * (NODE_W + 40)) / 2;
    row.forEach((id, i) => {
      const node = nodeById(model, id);
      node.x = left + offset + i * (NODE_W + 40);
      node.y = top + r * (NODE_H + GAP_Y);
    });
  });
}

/** Bounds of the drawn nodes (for "fit to window"). */
export function modelBounds(model) {
  if (!model.nodes.length) return { x: 0, y: 0, w: NODE_W, h: NODE_H };
  const xs = model.nodes.map((node) => node.x);
  const ys = model.nodes.map((node) => node.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) + NODE_W - x, h: Math.max(...ys) + NODE_H - y };
}

/** A deep copy that can be stored in the undo history or a file. */
export const cloneModel = (model) => structuredClone({ nodes: model.nodes, edges: model.edges });

/** Repairs a model read from a file: unknown layer types dropped, params coerced, dangling edges removed, names unique. */
export function normalizeModel(raw) {
  const model = emptyModel();
  if (!raw || !Array.isArray(raw.nodes)) return model;
  const ids = new Set();
  for (const item of raw.nodes) {
    if (!item || !LAYERS[item.type] || ids.has(item.id)) continue;
    const id = typeof item.id === 'string' && item.id ? item.id : uid('n');
    ids.add(id);
    model.nodes.push({ id, type: item.type, name: '', params: defaultParams(item.type, item.params ?? {}), x: Number(item.x) || 0, y: Number(item.y) || 0 });
    model.nodes.at(-1).name = cleanName(model, item.name ?? uniqueName(model, item.type), id);
  }
  for (const edge of Array.isArray(raw.edges) ? raw.edges : []) {
    if (!edge || !ids.has(edge.from) || !ids.has(edge.to) || edge.from === edge.to) continue;
    if (model.edges.some((other) => other.from === edge.from && other.to === edge.to)) continue;
    model.edges.push({ id: typeof edge.id === 'string' && edge.id ? edge.id : uid('e'), from: edge.from, to: edge.to });
  }
  return model;
}
