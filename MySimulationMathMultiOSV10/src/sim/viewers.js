// 입력·출력 그래프 and which scope windows open on Run.
//
//   ioSignals(sys, block)              → ['blockId:port', …]: the sources of the block's input lines
//                                         (in port order), then its own output ports
//   findIoViewer(sys, signals)         → the Floating Scope already showing exactly those signals
//   ioViewerBlock(model, sys, block)   → a new Floating Scope beside the block (not added yet), or null
//   scopesToOpen(open, scopes)         → the scope windows on Run: the open ones still in the model,
//                                         plus every other scope (at most MAX_SCOPES)
import { connections, makeBlock } from '../../core/sim/model.js';
import { portsOf } from '../../core/sim/blocks/index.js';

export const MAX_SCOPES = 8;

export function ioSignals(sys, block) {
  const ins = connections(sys)
    .filter((c) => c.dst.block === block.id && typeof c.dst.port === 'number')
    .sort((a, b) => a.dst.port - b.dst.port)
    .map((c) => `${c.src.block}:${c.src.port}`);
  const nOut = portsOf(block).out || 0;
  const outs = Array.from({ length: nOut }, (_, i) => `${block.id}:${i + 1}`);
  return [...new Set([...ins, ...outs])];
}

export function findIoViewer(sys, signals) {
  const key = signals.join(',');
  return sys.blocks.find((b) => b.type === 'FloatingScope' && String(b.params.Signals || '') === key) || null;
}

export function ioViewerBlock(model, sys, block, { lang = 'ko' } = {}) {
  const signals = ioSignals(sys, block);
  if (!signals.length) return null;
  const title = lang === 'en' ? `${block.name}: inputs and outputs` : `${block.name}: 입력·출력`;
  return makeBlock(model, 'FloatingScope', {
    name: `${block.name} IO`,
    x: Math.round(block.x + block.w + 30), y: Math.round(block.y + block.h + 20),
    params: { Signals: signals.join(','), Title: title, Layout: 'separate' },
  }, sys);
}

export function scopesToOpen(open, scopes) {
  const alive = open.filter((id) => scopes.includes(id));
  const add = scopes.filter((id) => !alive.includes(id));
  return [...alive, ...add].slice(0, Math.max(alive.length, MAX_SCOPES));
}

/**
 * The scope legend's names, by input (index = port - 1): the line's name, else the source block's
 * name (with /port when it has several outputs). A Floating Scope names its Signals the same way.
 * An open input is null (the legend then says 입력 N).
 */
export function scopeLabels(sys, block) {
  if (!sys || !block) return [];
  const byId = new Map(sys.blocks.map((b) => [b.id, b]));
  const nameOf = (src, lineName) => {
    if (lineName) return String(lineName);
    const b = byId.get(src.block);
    if (!b) return null;
    return (portsOf(b).out || 0) > 1 ? `${b.name}/${src.port}` : b.name;
  };
  if (block.type === 'FloatingScope') {
    return String((block.params && block.params.Signals) || '').split(',').map((s) => s.trim()).filter(Boolean).map((s) => {
      const [id, port] = s.split(':');
      const line = connections(sys).find((c) => c.src.block === id && c.src.port === Number(port));
      return nameOf({ block: id, port: Number(port) }, line && line.name);
    });
  }
  const n = portsOf(block).in || 0;
  const out = Array.from({ length: n }, () => null);
  for (const c of connections(sys)) {
    if (c.dst.block !== block.id || typeof c.dst.port !== 'number' || c.dst.port < 1 || c.dst.port > n) continue;
    out[c.dst.port - 1] = nameOf(c.src, c.name);
  }
  return out;
}
