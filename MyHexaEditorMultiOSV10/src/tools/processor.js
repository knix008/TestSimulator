// The data processor (ImHex): a graph of nodes in a tool window. Each node takes bytes from its inputs, does one thing
// (an operation, a transform, a hash, a slice …) and passes bytes on; output nodes open a tab, write at the caret or
// show the result. Nodes are dragged by their title, wired by dragging from an output port (right) to an input port
// (left), and the graph is kept in this browser. "Run" sends the graph to the main window (tools/host.js evaluateGraph),
// which computes it with the Rust core and answers with a preview per node.
import { icon } from '../icons.js';
import { t } from '../i18n.js';

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const GRAPH_KEY = 'myhexa.processorGraph.v1';

/** Node kinds: inputs (number of input ports), parameters [key, type, default, options?]. */
export const NODE_KINDS = {
  selection: { group: 'input', inputs: 0, glyph: 'selectAll', params: [] },
  document: { group: 'input', inputs: 0, glyph: 'file', params: [] },
  constHex: { group: 'input', inputs: 0, glyph: 'hexCode', params: [['hex', 'text', 'DE AD BE EF']] },
  constText: { group: 'input', inputs: 0, glyph: 'editorText', params: [['text', 'text', 'Hello'], ['encoding', 'select', 'utf8', ['utf8', 'utf16le', 'utf16be', 'ascii', 'cp1252', 'euc-kr']]] },
  operation: { group: 'process', inputs: 1, glyph: 'operation', params: [['op', 'select', 'xor', ['xor', 'and', 'or', 'not', 'add', 'sub', 'mul', 'neg', 'shl', 'shr', 'rol', 'ror', 'swap', 'reverse', 'bitrev', 'nibble']], ['operand', 'text', '0xFF'], ['width', 'select', '1', ['1', '2', '4', '8']]] },
  transform: { group: 'process', inputs: 1, glyph: 'encrypt', params: [['kind', 'select', 'base64Encode', null], ['key', 'text', ''], ['iv', 'text', ''], ['mode', 'select', 'cbc', ['ecb', 'cbc', 'ctr']]] },
  slice: { group: 'process', inputs: 1, glyph: 'cut', params: [['offset', 'text', '0'], ['length', 'text', '16']] },
  concat: { group: 'process', inputs: 2, glyph: 'mergeDocs', params: [] },
  repeat: { group: 'process', inputs: 1, glyph: 'refresh', params: [['count', 'text', '2']] },
  xorWith: { group: 'process', inputs: 2, glyph: 'operation', params: [] },
  hash: { group: 'process', inputs: 1, glyph: 'hash', params: [['algorithm', 'select', 'sha256', null], ['as', 'select', 'bytes', ['bytes', 'text']]] },
  showHex: { group: 'output', inputs: 1, glyph: 'eye', params: [] },
  newTab: { group: 'output', inputs: 1, glyph: 'newTab', params: [['name', 'text', 'processed-data.bin']] },
  writeCaret: { group: 'output', inputs: 1, glyph: 'edit', params: [] },
};

let ctx = null;
let graph = null;
let drag = null;
let results = {};
let lists = { transforms: [], hashes: [] };
let bound = false;

const load = () => { try { return JSON.parse(localStorage.getItem(GRAPH_KEY)) ?? null; } catch { return null; } };
const save = () => { try { localStorage.setItem(GRAPH_KEY, JSON.stringify(graph)); } catch { /* full */ } };
const defaultGraph = () => ({ seq: 4, nodes: [
  { id: 'n1', kind: 'selection', x: 30, y: 40, params: {} },
  { id: 'n2', kind: 'operation', x: 290, y: 40, params: { op: 'xor', operand: '0xFF', width: '1' } },
  { id: 'n3', kind: 'transform', x: 560, y: 40, params: { kind: 'base64Encode', key: '', iv: '', mode: 'cbc' } },
  { id: 'n4', kind: 'showHex', x: 560, y: 280, params: {} },
], links: [{ from: 'n1', to: 'n2', port: 0 }, { from: 'n2', to: 'n3', port: 0 }, { from: 'n3', to: 'n4', port: 0 }] });

function paramControl(node, [key, type, def, options]) {
  const value = node.params[key] ?? def;
  if (type === 'select') {
    const opts = options ?? (key === 'kind' ? lists.transforms : key === 'algorithm' ? lists.hashes : []);
    return `<label class="pn-param"><span>${esc(t(`processor.param.${key}`))}</span><select data-pn-param="${node.id}:${key}">${opts.map((o) => `<option value="${esc(o)}" ${String(o) === String(value) ? 'selected' : ''}>${esc(t(`tr.${o}`, null, t(`op.${o}`, null, o)).replace(/…$/, ''))}</option>`).join('')}</select></label>`;
  }
  return `<label class="pn-param"><span>${esc(t(`processor.param.${key}`))}</span><input type="text" data-pn-param="${node.id}:${key}" value="${esc(value)}" spellcheck="false" /></label>`;
}

function nodeHtml(node) {
  const k = NODE_KINDS[node.kind];
  const r = results[node.id];
  const ins = Array.from({ length: k.inputs }, (_, i) => `<span class="pn-port in" data-pn-in="${node.id}:${i}" style="top:${44 + i * 22}px" title="${esc(t('processor.input'))}"></span>`).join('');
  const out = k.group === 'output' ? '' : `<span class="pn-port out" data-pn-out="${node.id}" title="${esc(t('processor.output'))}"></span>`;
  const preview = r ? (r.error ? `<div class="pn-preview err">${esc(r.error)}</div>` : `<div class="pn-preview"><b>${r.length.toLocaleString()} B</b> <code>${esc(r.text ?? r.hex)}</code></div>`) : '';
  return `<div class="pn-node pn-${k.group}" data-pn-node="${node.id}" style="left:${node.x}px;top:${node.y}px">
    <div class="pn-head" data-pn-drag="${node.id}">${icon(k.glyph)}<span>${esc(t(`processor.node.${node.kind}`))}</span><button class="icon-button" data-pn-remove="${node.id}" title="${esc(t('processor.remove'))}">${icon('close')}</button></div>
    ${ins}${out}<div class="pn-body">${k.params.map((p) => paramControl(node, p)).join('')}${preview}</div></div>`;
}

function linksSvg() {
  const port = (id, side, i = 0) => {
    const el = ctx.root.querySelector(side === 'out' ? `[data-pn-out="${id}"]` : `[data-pn-in="${id}:${i}"]`);
    const area = ctx.root.querySelector('.pn-area');
    if (!el || !area) return null;
    const a = area.getBoundingClientRect(); const b = el.getBoundingClientRect();
    return { x: b.left - a.left + b.width / 2 + area.scrollLeft, y: b.top - a.top + b.height / 2 + area.scrollTop };
  };
  const path = (p, q) => `M${p.x},${p.y} C${p.x + 70},${p.y} ${q.x - 70},${q.y} ${q.x},${q.y}`;
  const lines = graph.links.map((l) => { const p = port(l.from, 'out'); const q = port(l.to, 'in', l.port); return p && q ? `<path d="${path(p, q)}" data-pn-link="${graph.links.indexOf(l)}" />` : ''; });
  if (drag?.kind === 'wire') { const p = port(drag.from, 'out'); if (p) lines.push(`<path class="pending" d="${path(p, drag.at)}" />`); }
  const svg = ctx.root.querySelector('.pn-links');
  if (svg) svg.innerHTML = lines.join('');
}

export function processorBody() {
  graph ??= load() ?? defaultGraph();
  if (!lists.transforms.length) {
    ctx.call('core', { method: 'operations' }).then((r) => { lists.transforms = r.transforms.map((x) => x.id); return ctx.call('core', { method: 'hashList' }); })
      .then((h) => { lists.hashes = h.map((x) => x.id); ctx.redraw(); }).catch(() => {});
  }
  const palette = ['input', 'process', 'output'].map((g) => `<div class="pn-group"><h4>${esc(t(`processor.group.${g}`))}</h4>${Object.entries(NODE_KINDS).filter(([, k]) => k.group === g).map(([id, k]) => `<button class="pn-add" data-pn-add="${id}" title="${esc(t(`processor.node.${id}`))}">${icon(k.glyph)}<span>${esc(t(`processor.node.${id}`))}</span></button>`).join('')}</div>`).join('');
  const html = `<div class="pn-wrap"><aside class="pn-palette">${palette}</aside>
    <div class="pn-area"><svg class="pn-links"></svg>${graph.nodes.map(nodeHtml).join('')}</div></div>
    <div class="tw-line"><span class="muted">${esc(t('processor.hint'))}</span><span class="grow"></span>${ctx.btn('pn-reset', t('processor.reset'), 'refresh', 'small')}${ctx.btn('pn-run', t('processor.run'), 'play', 'primary')}</div>`;
  requestAnimationFrame(linksSvg);
  return { icon: 'operation', title: t('tool.processor'), html };
}

async function run() {
  save();
  results = {};
  const r = await ctx.guarded(() => ctx.call('evaluateGraph', { graph }));
  if (r) results = r.nodes;
  ctx.redraw();
}

export function bindProcessor(context) {
  ctx = context;
  if (bound) return;
  bound = true;
  const root = ctx.root;
  root.addEventListener('click', (event) => {
    if (ctx.kind !== 'processor') return;
    const add = event.target.closest('[data-pn-add]');
    if (add) {
      const kind = add.dataset.pnAdd;
      const area = root.querySelector('.pn-area');
      graph.seq += 1;
      graph.nodes.push({ id: `n${graph.seq}`, kind, x: 40 + (area?.scrollLeft ?? 0) + (graph.nodes.length % 5) * 30, y: 30 + (area?.scrollTop ?? 0) + (graph.nodes.length % 5) * 30, params: {} });
      save(); ctx.redraw(); return;
    }
    const rm = event.target.closest('[data-pn-remove]');
    if (rm) { const id = rm.dataset.pnRemove; graph.nodes = graph.nodes.filter((n) => n.id !== id); graph.links = graph.links.filter((l) => l.from !== id && l.to !== id); save(); ctx.redraw(); return; }
    const link = event.target.closest('[data-pn-link]');
    if (link) { graph.links.splice(Number(link.dataset.pnLink), 1); save(); ctx.redraw(); return; }
    const act = event.target.closest('[data-tw-act]');
    if (act?.dataset.twAct === 'pn-run') { event.stopImmediatePropagation(); run(); }
    if (act?.dataset.twAct === 'pn-reset') { event.stopImmediatePropagation(); graph = defaultGraph(); results = {}; save(); ctx.redraw(); }
  }, true);
  root.addEventListener('change', (event) => {
    const p = event.target.dataset?.pnParam;
    if (!p) return;
    const [id, key] = p.split(':');
    const node = graph.nodes.find((n) => n.id === id);
    if (node) { node.params[key] = event.target.value; save(); }
  });
  root.addEventListener('pointerdown', (event) => {
    if (ctx.kind !== 'processor') return;
    const area = root.querySelector('.pn-area');
    const head = event.target.closest('[data-pn-drag]');
    const out = event.target.closest('[data-pn-out]');
    if (!area || (!head && !out) || event.target.closest('button:not([data-pn-out])')) return;
    event.preventDefault();
    const box = area.getBoundingClientRect();
    const at = (e) => ({ x: e.clientX - box.left + area.scrollLeft, y: e.clientY - box.top + area.scrollTop });
    if (head) {
      const node = graph.nodes.find((n) => n.id === head.dataset.pnDrag);
      const start = at(event); const origin = { x: node.x, y: node.y };
      drag = { kind: 'node' };
      const el = head.closest('.pn-node');
      const move = (e) => { const p = at(e); node.x = Math.max(0, origin.x + p.x - start.x); node.y = Math.max(0, origin.y + p.y - start.y); el.style.left = `${node.x}px`; el.style.top = `${node.y}px`; linksSvg(); };
      const up = () => { drag = null; save(); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      return;
    }
    drag = { kind: 'wire', from: out.dataset.pnOut, at: at(event) };
    const move = (e) => { drag.at = at(e); linksSvg(); };
    const up = (e) => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
      const target = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-pn-in]');
      if (target) {
        const [to, port] = target.dataset.pnIn.split(':');
        if (to !== drag.from) { graph.links = graph.links.filter((l) => !(l.to === to && l.port === Number(port))); graph.links.push({ from: drag.from, to, port: Number(port) }); save(); }
      }
      drag = null; linksSvg();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  });
}
