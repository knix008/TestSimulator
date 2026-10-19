// What a model costs to run, per layer: multiply-accumulates (MACs) for one input and the size of
// its output. Totals: weights as float32 and int8, the largest working set (a layer's inputs + output),
// as tools for embedded models (Edge Impulse, Netron) report it.
import { incoming, topoOrder, nodeById } from './graph.js';

const size = (shape) => (shape ? shape.reduce((a, b) => a * b, 1) : 0);

/** MACs of one node for one input (element-wise layers count one operation per value). */
export function macsOf(node, inShapes, out) {
  const p = node.params;
  const s = inShapes[0];
  if (!out || (!s && node.type !== 'input')) return 0;
  switch (node.type) {
    case 'dense': return (size(s) / s.at(-1)) * s.at(-1) * p.units;
    case 'conv2d': return out[0] * out[1] * out[2] * p.kernelSize * p.kernelSize * s[2];
    case 'depthwiseConv2d': return out[0] * out[1] * out[2] * p.kernelH * p.kernelW;
    case 'conv1d': return out[0] * out[1] * p.kernelSize * s[1];
    case 'simpleRnn': return s[0] * p.units * (s[1] + p.units);
    case 'lstm': return s[0] * 4 * p.units * (s[1] + p.units);
    case 'gru': return s[0] * 3 * p.units * (s[1] + p.units);
    case 'selfAttention': { const [L, D] = s; return 4 * L * D * D + 2 * L * L * D; }
    case 'maxPool2d': case 'avgPool2d': return size(out) * p.poolSize * p.poolSize;
    case 'maxPool1d': return size(out) * p.poolSize;
    case 'globalAvgPool2d': case 'globalAvgPool1d': case 'freqAvgPool': return size(s);
    case 'batchNorm': case 'layerNorm': return 2 * size(out);
    case 'activation': case 'leakyRelu': return size(out);
    case 'add': return size(out) * Math.max(0, inShapes.length - 1);
    default: return 0; // lookups, copies and reshapes
  }
}

/**
 * The budget of a model from its inferred shapes: { rows: [{ id, macs, outBytes }], macs, weightBytes32,
 * weightBytes8, peakBytes (the largest inputs + output of one layer, float32), activationBytes (all outputs) }.
 */
export function modelBudget(graph, shapes) {
  let order;
  try { order = topoOrder(graph); } catch { order = graph.nodes.map((n) => n.id); }
  const rows = [];
  let macs = 0; let params = 0; let peak = 0; let all = 0;
  for (const id of order) {
    const node = nodeById(graph, id);
    const info = shapes.get(id);
    const inShapes = incoming(graph, id).map((edge) => shapes.get(edge.from)?.shape).filter(Boolean);
    const m = info?.shape ? macsOf(node, inShapes, info.shape) : 0;
    const outBytes = size(info?.shape) * 4;
    const inBytes = inShapes.reduce((sum, shape) => sum + size(shape) * 4, 0);
    rows.push({ id, macs: m, outBytes });
    macs += m; params += info?.params?.total ?? 0; all += outBytes;
    peak = Math.max(peak, inBytes + outBytes);
  }
  return { rows, macs, weightBytes32: params * 4, weightBytes8: params, peakBytes: peak, activationBytes: all };
}

/** 1234567 → "1.23 M" (counts) */
export function shortCount(n) {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)} G`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)} M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)} K`;
  return String(Math.round(n));
}

/** bytes → "12.3 KB" */
export function shortBytes(n) {
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(2)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
}
