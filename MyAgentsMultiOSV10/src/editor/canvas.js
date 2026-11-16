// The workflow canvas: node cards and curved edges on a pannable, zoomable grid (ARCHITECTURE.md §10).
//
// The canvas draws the document it is given and reports what the user does (move, connect, select, delete
// …) through callbacks; the editor changes the document (with Undo) and calls render() again.
// Run state is drawn on top: markNode(id, state) colours a card (running · succeeded · failed · waiting ·
// skipped), flow(edge) sends a dot along an edge, and the minimap shows where everything is.
import { nodeDef, outputPorts, categoryOf, label as L } from '../../core/nodes/defs.js';
import { NODE_W } from '../../core/layout.js';
import { icon } from '../icons.js';
import { escapeHtml } from '../ui/dom.js';

export const HEAD = 36;
export const PORT_GAP = 24;
const GRID = 20;
const MIN_ZOOM = 0.2;

/** The on-screen grid step (px) at a zoom: GRID × zoom, times or divided by 5 until it lies in 9…45 px. */
export function gridStep(zoom) {
  let g = GRID * zoom;
  while (g < 9) g *= 5;
  while (g > 45) g /= 5;
  return g;
}
const MAX_ZOOM = 2.5;

/** A node's size from its type and ports. */
export function nodeBox(node) {
  const def = nodeDef(node.type);
  if (def?.note) return { w: node.w || 240, h: node.h || 140 };
  const n = outputPorts(node).length;
  return { w: NODE_W, h: Math.max(76, 46 + n * PORT_GAP + 6) };
}

/** Where a port is, in world coordinates. side: 'in' | 'out' | 'tools'. */
export function portPoint(node, side, port = 'out') {
  const { w, h } = nodeBox(node);
  if (side === 'in') return { x: node.x, y: node.y + h / 2 };
  if (side === 'tools') return { x: node.x + w / 2, y: node.y + h };
  const ports = outputPorts(node);
  const i = Math.max(0, ports.indexOf(port));
  return { x: node.x + w, y: node.y + (ports.length === 1 ? h / 2 : 46 + i * PORT_GAP + PORT_GAP / 2) };
}

export function edgePath(a, b, tools = false) {
  if (tools) {
    const dy = Math.max(50, Math.abs(b.y - a.y) / 2);
    return `M${a.x},${a.y} C${a.x},${a.y + dy} ${b.x - 70},${b.y} ${b.x},${b.y}`;
  }
  const dx = Math.max(50, Math.abs(b.x - a.x) / 2);
  return `M${a.x},${a.y} C${a.x + dx},${a.y} ${b.x - dx},${b.y} ${b.x},${b.y}`;
}

const short = (s, n = 42) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n)}…` : t; };

/** One line under the node's name: what it is set to do. */
export function nodeSummary(node, lang, extra = {}) {
  const c = node.config ?? {};
  const def = nodeDef(node.type);
  const modelText = () => (c.model ? c.model.replace(/^[^:]+:/, '') : extra.defaultModelText ?? '');
  switch (node.type) {
    case 'ai.agent': return `${modelText()} · ${(c.tools ?? []).length + (extra.toolCount ?? 0)} ${lang === 'ko' ? '도구' : 'tools'}`;
    case 'ai.llm': return `${modelText()}${c.json ? ' · JSON' : ''}`;
    case 'ai.classify': return (c.categories ?? []).join(' · ');
    case 'ai.extract': return (c.fields ?? []).map((f) => f.key).join(', ');
    case 'tool.http': return `${c.method} ${short(c.url, 34)}`;
    case 'tool.web': return short(c.url);
    case 'tool.shell': return `$ ${short(c.command, 36)}`;
    case 'tool.file': return `${c.op} ${short(c.path, 30)}`;
    case 'logic.if': return `${(c.conditions ?? []).length} ${lang === 'ko' ? '조건' : 'condition(s)'} · ${String(c.combine ?? 'and').toUpperCase()}`;
    case 'logic.switch': return short(c.value);
    case 'logic.loop': return short(c.items);
    case 'logic.code': return short(String(c.code ?? '').split('\n').find((l) => l.trim() && !l.trim().startsWith('//')) ?? '');
    case 'logic.template': return short(c.template);
    case 'logic.wait': return `${c.seconds ?? 0} s`;
    case 'logic.set': return (c.values ?? []).map((v) => v.key).join(', ');
    case 'kb.search': return `${(c.kbs ?? []).length} KB · top ${c.topK}`;
    case 'trigger.schedule': return c.mode === 'interval' ? `${c.minutes} min` : c.mode === 'cron' ? c.cron : `${c.mode} ${c.time ?? ''}`;
    case 'trigger.webhook': return c.method;
    case 'human.approval': case 'human.input': case 'human.notify': return short(c.message);
    case 'out.respond': return short(c.value);
    case 'tool.subagent': case 'trigger.agent': return extra.agentName?.(c.agent) ?? '';
    case 'io.read': return `${c.source === 'file' ? short(c.path, 26) : c.source === 'url' ? short(c.url, 26) : c.source} · ${c.format}`;
    case 'io.write': return `${String(c.format ?? '').toUpperCase()} → ${c.target === 'output' ? (lang === 'ko' ? '다음 단계' : 'next step') : short(c.path, 24)}`;
    case 'data.convert': return `${c.from} → ${c.to}`;
    case 'data.math': return `${c.field} = ${short(c.formula, 28)}`;
    case 'data.pick': return short(c.fields, 34);
    case 'trigger.form': return (c.fields ?? []).join(', ');
    case 'trigger.file': return `${c.folder}/${c.pattern}`;
    case 'logic.random': return `a ${c.percentA}% · b ${100 - Number(c.percentA ?? 50)}%`;
    case 'logic.assert': return `${short(c.left, 16)} ${c.op} ${short(c.right, 12)}`;
    case 'dev.lint': case 'dev.build': return `$ ${short(c.command, 34)}`;
    case 'kb.answer': return `${(c.kbs ?? []).length} KB · top ${c.topK}`;
    default: return L(def?.desc, lang);
  }
}

export function createCanvas(host, opts) {
  host.classList.add('canvas-host');
  host.tabIndex = 0;
  host.innerHTML = `
    <div class="canvas-grid"></div>
    <div class="canvas-world">
      <svg class="canvas-edges" width="1" height="1" overflow="visible"><g class="edges-layer"></g><path class="edge-temp" hidden/><g class="packets-layer"></g></svg>
      <div class="canvas-nodes"></div>
    </div>
    <div class="canvas-box" hidden></div>
    <div class="canvas-empty" hidden></div>
    <canvas class="canvas-minimap" width="180" height="120"></canvas>
    <div class="canvas-track-top" aria-hidden="true"><i></i><b></b></div>
    <div class="canvas-track-left" aria-hidden="true"><i></i><b></b></div>`;
  const world = host.querySelector('.canvas-world');
  const grid = host.querySelector('.canvas-grid');
  const edgesLayer = host.querySelector('.edges-layer');
  const packets = host.querySelector('.packets-layer');
  const temp = host.querySelector('.edge-temp');
  const nodesLayer = host.querySelector('.canvas-nodes');
  const box = host.querySelector('.canvas-box');
  const empty = host.querySelector('.canvas-empty');
  const minimap = host.querySelector('.canvas-minimap');
  const trackTop = host.querySelector('.canvas-track-top');
  const trackLeft = host.querySelector('.canvas-track-left');

  // Every listener on the host goes when the canvas is destroyed (the host element may get a new canvas).
  const life = new AbortController();
  const on = (type, fn, options = {}) => host.addEventListener(type, fn, { ...options, signal: life.signal });
  const view = { x: 0, y: 0, zoom: 1 };
  const run = new Map(); // nodeId → { status, count, ms, note }
  const edgeRun = new Map(); // edgeId → { count, active }
  let doc = null;
  let selection = new Set();
  let selectedEdge = null;
  let destroyed = false;

  const lang = () => opts.lang();
  const nodeById = (id) => doc?.nodes.find((n) => n.id === id) ?? null;

  // ───────────── viewport

  function applyView() {
    world.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`;
    // A 5 × 5 grid of faint lines (a stronger line every fifth): its step follows the zoom in powers of five, so
    // the lines are redrawn finer or coarser when they would get too dense or too sparse. The rulers use the same step.
    const g = gridStep(view.zoom);
    const big = g * 5;
    grid.style.backgroundSize = `${big}px ${big}px, ${big}px ${big}px, ${g}px ${g}px, ${g}px ${g}px`;
    grid.style.backgroundPosition = Array(4).fill(`${view.x}px ${view.y}px`).join(', ');
    host.dataset.gridStep = String(Math.round(g * 100) / 100);
    host.style.setProperty('--zoom', String(view.zoom));
    // rulers: ticks every grid step, a long tick every five, moving with the view
    host.style.setProperty('--rs', `${g}px`);
    host.style.setProperty('--rx', `${view.x}px`);
    host.style.setProperty('--ry', `${view.y}px`);
    drawMinimap();
    opts.onViewport?.({ ...view });
  }

  function toWorld(clientX, clientY) {
    const r = host.getBoundingClientRect();
    return { x: (clientX - r.left - view.x) / view.zoom, y: (clientY - r.top - view.y) / view.zoom };
  }

  function zoomAt(factor, clientX, clientY) {
    const r = host.getBoundingClientRect();
    const cx = clientX ?? r.left + r.width / 2;
    const cy = clientY ?? r.top + r.height / 2;
    const before = toWorld(cx, cy);
    view.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, view.zoom * factor));
    view.x = cx - r.left - before.x * view.zoom;
    view.y = cy - r.top - before.y * view.zoom;
    applyView();
  }

  function bounds(nodes = doc?.nodes ?? []) {
    if (!nodes.length) return null;
    let x1 = Infinity; let y1 = Infinity; let x2 = -Infinity; let y2 = -Infinity;
    for (const n of nodes) { const b = nodeBox(n); x1 = Math.min(x1, n.x); y1 = Math.min(y1, n.y); x2 = Math.max(x2, n.x + b.w); y2 = Math.max(y2, n.y + b.h); }
    return { x1, y1, x2, y2 };
  }

  /** Fits the nodes (all of them by default) and centres them both ways. all: the Fit command — everything in view,
   *  however small; otherwise (opening a document) a wide graph keeps a readable size and starts at its left end. */
  function fit(nodes, { all = false } = {}) {
    const b = bounds(nodes);
    const r = host.getBoundingClientRect();
    if (!b || !r.width) { view.x = 60; view.y = 60; view.zoom = 1; applyView(); return; }
    const pad = 60;
    const want = Math.min((r.width - pad * 2) / (b.x2 - b.x1 || 1), (r.height - pad * 2) / (b.y2 - b.y1 || 1));
    // Readable first: a wide graph is not shrunk below 70 % — it starts at its left end and pans from there.
    const zoom = Math.min(1.1, Math.max(nodes || all ? MIN_ZOOM : 0.5, want));
    view.zoom = zoom;
    const w = (b.x2 - b.x1) * zoom;
    const h = (b.y2 - b.y1) * zoom;
    view.x = w <= r.width - pad * 2 ? (r.width - w) / 2 - b.x1 * zoom : pad - b.x1 * zoom;
    view.y = h <= r.height - pad * 2 ? (r.height - h) / 2 - b.y1 * zoom : pad - b.y1 * zoom;
    applyView();
  }

  // ───────────── drawing

  function nodeHtml(node) {
    const def = nodeDef(node.type);
    const cat = categoryOf(def?.category);
    const { w, h } = nodeBox(node);
    const st = run.get(node.id);
    const cls = ['node', `cat-${def?.category ?? 'unknown'}`, selection.has(node.id) ? 'selected' : '', node.disabled ? 'disabled' : '', st ? `st-${st.status}` : '', def?.note ? `note note-${node.config?.color ?? 'yellow'}` : '', def?.trigger ? 'is-trigger' : '', node.pinned != null ? 'pinned' : ''].filter(Boolean).join(' ');
    const style = `left:${node.x}px;top:${node.y}px;width:${w}px;height:${h}px;--cat:${cat.color}`;
    if (def?.note) {
      return `<div class="${cls}" data-node="${escapeHtml(node.id)}" style="${style}"><div class="note-text">${escapeHtml(node.config?.text ?? '')}</div><span class="note-resize" data-note-resize="${escapeHtml(node.id)}"></span></div>`;
    }
    const ports = outputPorts(node);
    const outs = ports.map((p, i) => {
      const y = ports.length === 1 ? h / 2 : 46 + i * PORT_GAP + PORT_GAP / 2;
      const labelText = ports.length > 1 || p === 'error' ? `<i class="port-label">${escapeHtml(p)}</i>` : '';
      const count = st?.ports?.[p];
      return `<span class="port out ${p === 'error' ? 'port-error' : ''} ${count ? 'port-used' : ''}" data-port="${escapeHtml(p)}" style="top:${y}px" title="${escapeHtml(p)}">${labelText}${count ? `<b class="port-count">${count}</b>` : ''}</span>`;
    }).join('');
    const statusIcon = !st ? '' : { running: 'hourglass', succeeded: 'check', failed: 'error', waiting: 'hourglass', skipped: 'powerOff', cancelled: 'stop' }[st.status] ?? 'dot';
    const badge = st ? `<span class="node-status" title="${escapeHtml(st.title ?? st.status)}">${icon(statusIcon)}${st.count > 1 ? `<b>×${st.count}</b>` : ''}${st.ms != null && st.status !== 'running' ? `<small>${st.ms < 1000 ? `${st.ms} ms` : `${(st.ms / 1000).toFixed(1)} s`}</small>` : ''}</span>` : '';
    const extra = opts.summaryExtra?.(node) ?? {};
    return `<div class="${cls}" data-node="${escapeHtml(node.id)}" style="${style}" title="${escapeHtml(node.description || L(def?.desc, lang()))}">
      ${def?.inputs ? '<span class="port in" data-port="in"></span>' : ''}
      <div class="node-head"><span class="node-icon">${icon(def?.icon ?? 'dot')}</span><span class="node-name">${escapeHtml(node.name)}</span>${node.pinned != null ? `<span class="node-pin" title="pinned">${icon('pin')}</span>` : ''}${badge}</div>
      <div class="node-sub">${escapeHtml(def ? nodeSummary(node, lang(), extra) || L(def.label, lang()) : node.type)}</div>
      ${st?.note ? `<div class="node-note ${st.status}">${escapeHtml(st.note)}</div>` : ''}
      ${outs}
      ${def?.toolPort ? `<span class="port tools" data-port="tools" title="${escapeHtml(lang() === 'ko' ? '도구 연결' : 'Tools')}"><i class="port-label">${escapeHtml(lang() === 'ko' ? '도구' : 'tools')}</i></span>` : ''}
      ${st?.status === 'running' ? '<span class="node-progress"></span>' : ''}
    </div>`;
  }

  function edgeHtml(edge) {
    const a = nodeById(edge.from);
    const b = nodeById(edge.to);
    if (!a || !b) return '';
    const tools = edge.fromPort === 'tools';
    const d = edgePath(portPoint(a, tools ? 'tools' : 'out', edge.fromPort), portPoint(b, 'in'), tools);
    const er = edgeRun.get(edge.id);
    const cls = ['edge', tools ? 'edge-tools' : '', edge.fromPort === 'error' ? 'edge-error' : '', selectedEdge === edge.id ? 'selected' : '', er ? 'ran' : '', er?.active ? 'flowing' : ''].filter(Boolean).join(' ');
    return `<g class="${cls}" data-edge="${escapeHtml(edge.id)}"><path class="edge-hit" d="${d}"/><path class="edge-line" d="${d}"/>${er?.count > 1 ? (() => { const m = midpoint(a, b, edge); return `<text class="edge-count" x="${m.x}" y="${m.y - 6}">${er.count}</text>`; })() : ''}</g>`;
  }

  function midpoint(a, b, edge) {
    const p = portPoint(a, edge.fromPort === 'tools' ? 'tools' : 'out', edge.fromPort);
    const q = portPoint(b, 'in');
    return { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
  }

  function render(nextDoc = doc) {
    doc = nextDoc;
    if (!doc) { nodesLayer.innerHTML = ''; edgesLayer.innerHTML = ''; return; }
    for (const id of [...selection]) if (!nodeById(id)) selection.delete(id);
    nodesLayer.innerHTML = doc.nodes.map(nodeHtml).join('');
    edgesLayer.innerHTML = doc.edges.map(edgeHtml).join('');
    const isEmpty = !doc.nodes.length;
    empty.hidden = !isEmpty;
    if (isEmpty) empty.innerHTML = opts.emptyHtml?.() ?? '';
    drawMinimap();
  }

  function renderNode(id) {
    const node = nodeById(id);
    const el = nodesLayer.querySelector(`[data-node="${CSS.escape(id)}"]`);
    if (!node || !el) return;
    el.outerHTML = nodeHtml(node);
  }

  function renderEdgesOf(ids) {
    const set = new Set(ids);
    for (const e of doc.edges) {
      if (!set.has(e.from) && !set.has(e.to)) continue;
      const g = edgesLayer.querySelector(`[data-edge="${CSS.escape(e.id)}"]`);
      if (g) g.outerHTML = edgeHtml(e);
    }
  }

  // ───────────── minimap

  function drawMinimap() {
    if (!doc || opts.minimap?.() === false) { minimap.hidden = true; return; }
    minimap.hidden = !doc.nodes.length;
    if (minimap.hidden) return;
    const ctx = minimap.getContext('2d');
    const W = minimap.width;
    const H = minimap.height;
    const r = host.getBoundingClientRect();
    const vis = { x1: -view.x / view.zoom, y1: -view.y / view.zoom, x2: (r.width - view.x) / view.zoom, y2: (r.height - view.y) / view.zoom };
    const b = bounds();
    const all = { x1: Math.min(b.x1, vis.x1), y1: Math.min(b.y1, vis.y1), x2: Math.max(b.x2, vis.x2), y2: Math.max(b.y2, vis.y2) };
    const s = Math.min((W - 10) / (all.x2 - all.x1 || 1), (H - 10) / (all.y2 - all.y1 || 1));
    const ox = 5 - all.x1 * s + ((W - 10) - (all.x2 - all.x1) * s) / 2;
    const oy = 5 - all.y1 * s + ((H - 10) - (all.y2 - all.y1) * s) / 2;
    minimap.dataset.scale = String(s);
    minimap.dataset.ox = String(ox);
    minimap.dataset.oy = String(oy);
    ctx.clearRect(0, 0, W, H);
    const css = getComputedStyle(host);
    for (const n of doc.nodes) {
      const box2 = nodeBox(n);
      const st = run.get(n.id)?.status;
      ctx.fillStyle = st === 'failed' ? '#e5484d' : st === 'running' || st === 'waiting' ? '#f08c00' : st === 'succeeded' ? '#2f9e44' : categoryOf(nodeDef(n.type)?.category).color;
      ctx.globalAlpha = selection.has(n.id) ? 1 : 0.75;
      ctx.fillRect(ox + n.x * s, oy + n.y * s, Math.max(3, box2.w * s), Math.max(2, box2.h * s));
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = css.getPropertyValue('--accent').trim() || '#4c6ef5';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(ox + vis.x1 * s, oy + vis.y1 * s, (vis.x2 - vis.x1) * s, (vis.y2 - vis.y1) * s);
  }

  minimap.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const r = host.getBoundingClientRect();
    const move = (e) => {
      const m = minimap.getBoundingClientRect();
      const s = Number(minimap.dataset.scale) || 1;
      const wx = (e.clientX - m.left - Number(minimap.dataset.ox)) / s;
      const wy = (e.clientY - m.top - Number(minimap.dataset.oy)) / s;
      view.x = r.width / 2 - wx * view.zoom;
      view.y = r.height / 2 - wy * view.zoom;
      applyView();
    };
    move(event);
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  });

  // ───────────── selection

  function setSelection(ids, { edge = null, quiet = false } = {}) {
    selection = new Set(ids);
    selectedEdge = edge;
    for (const el of nodesLayer.querySelectorAll('.node')) el.classList.toggle('selected', selection.has(el.dataset.node));
    for (const el of edgesLayer.querySelectorAll('.edge')) el.classList.toggle('selected', el.dataset.edge === selectedEdge);
    drawMinimap();
    if (!quiet) opts.onSelect?.({ nodes: [...selection], edge: selectedEdge });
  }

  // ───────────── pointer interaction

  let gesture = null;

  // The pointer's position, marked in red on the top and left edges (world coordinates as labels).
  function trackPointer(clientX, clientY) {
    const r = host.getBoundingClientRect();
    const w = toWorld(clientX, clientY);
    trackTop.style.setProperty('--x', `${clientX - r.left}px`);
    trackLeft.style.setProperty('--y', `${clientY - r.top}px`);
    trackTop.querySelector('b').textContent = String(Math.round(w.x));
    trackLeft.querySelector('b').textContent = String(Math.round(w.y));
    host.classList.add('tracking');
  }
  on('pointermove', (event) => { if (opts.track?.() !== false) trackPointer(event.clientX, event.clientY); });
  on('pointerleave', () => host.classList.remove('tracking'));

  on('pointerdown', (event) => {
    if (event.button === 1 || (event.button === 0 && event.target === host)) { /* fall through to pan */ }
    if (event.button !== 0 && event.button !== 1) return;
    host.focus({ preventScroll: true });
    const portEl = event.target.closest('.port.out, .port.tools');
    const nodeEl = event.target.closest('.node');
    const edgeEl = event.target.closest('.edge');
    const resizeEl = event.target.closest('[data-note-resize]');
    if (event.button === 0 && resizeEl) { startNoteResize(event, resizeEl.dataset.noteResize); return; }
    if (event.button === 0 && portEl && nodeEl && !opts.readOnly?.()) { startConnect(event, nodeEl.dataset.node, portEl.dataset.port, portEl.classList.contains('tools')); return; }
    if (event.button === 0 && nodeEl) { startMove(event, nodeEl.dataset.node); return; }
    if (event.button === 0 && edgeEl) { setSelection([], { edge: edgeEl.dataset.edge }); return; }
    if (event.button === 0 && (event.shiftKey || event.ctrlKey || event.metaKey)) { startBox(event); return; }
    startPan(event);
  });

  function track(event, move, end) {
    event.preventDefault();
    const pointerId = event.pointerId;
    try { host.setPointerCapture(pointerId); } catch { /* synthetic */ }
    const onMove = (e) => { if (e.pointerId === pointerId) move(e); };
    const onUp = (e) => {
      if (e.pointerId !== pointerId) return;
      host.removeEventListener('pointermove', onMove);
      host.removeEventListener('pointerup', onUp);
      host.removeEventListener('pointercancel', onUp);
      try { host.releasePointerCapture(pointerId); } catch { /* synthetic */ }
      end(e);
    };
    host.addEventListener('pointermove', onMove);
    host.addEventListener('pointerup', onUp);
    host.addEventListener('pointercancel', onUp);
  }

  function startPan(event) {
    const start = { x: event.clientX, y: event.clientY, vx: view.x, vy: view.y };
    let moved = false;
    host.classList.add('panning');
    track(event, (e) => {
      if (Math.abs(e.clientX - start.x) + Math.abs(e.clientY - start.y) > 3) moved = true;
      view.x = start.vx + e.clientX - start.x;
      view.y = start.vy + e.clientY - start.y;
      applyView();
    }, () => {
      host.classList.remove('panning');
      if (!moved) setSelection([]);
    });
  }

  function startBox(event) {
    const r = host.getBoundingClientRect();
    const start = { x: event.clientX - r.left, y: event.clientY - r.top };
    const base = event.shiftKey || event.ctrlKey || event.metaKey ? new Set(selection) : new Set();
    box.hidden = false;
    track(event, (e) => {
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      const x1 = Math.min(x, start.x); const y1 = Math.min(y, start.y);
      Object.assign(box.style, { left: `${x1}px`, top: `${y1}px`, width: `${Math.abs(x - start.x)}px`, height: `${Math.abs(y - start.y)}px` });
      const w1 = { x: (x1 - view.x) / view.zoom, y: (y1 - view.y) / view.zoom };
      const w2 = { x: (Math.max(x, start.x) - view.x) / view.zoom, y: (Math.max(y, start.y) - view.y) / view.zoom };
      const hit = doc.nodes.filter((n) => { const b = nodeBox(n); return n.x < w2.x && n.x + b.w > w1.x && n.y < w2.y && n.y + b.h > w1.y; }).map((n) => n.id);
      setSelection([...base, ...hit], { quiet: true });
    }, () => { box.hidden = true; opts.onSelect?.({ nodes: [...selection], edge: null }); });
  }

  function startMove(event, id) {
    const additive = event.shiftKey || event.ctrlKey || event.metaKey;
    if (additive) { const next = new Set(selection); if (next.has(id)) next.delete(id); else next.add(id); setSelection([...next]); return; }
    if (!selection.has(id)) setSelection([id]);
    if (opts.readOnly?.()) return;
    const start = toWorld(event.clientX, event.clientY);
    const moving = doc.nodes.filter((n) => selection.has(n.id)).map((n) => ({ n, x: n.x, y: n.y, el: nodesLayer.querySelector(`[data-node="${CSS.escape(n.id)}"]`) }));
    let moved = false;
    const snap = (v) => (opts.snap?.() === false ? Math.round(v) : Math.round(v / 10) * 10);
    track(event, (e) => {
      const p = toWorld(e.clientX, e.clientY);
      const dx = p.x - start.x;
      const dy = p.y - start.y;
      if (!moved && Math.abs(dx) + Math.abs(dy) < 3 / view.zoom) return;
      moved = true;
      host.classList.add('moving');
      for (const m of moving) { m.n.x = snap(m.x + dx); m.n.y = snap(m.y + dy); if (m.el) { m.el.style.left = `${m.n.x}px`; m.el.style.top = `${m.n.y}px`; } }
      renderEdgesOf(moving.map((m) => m.n.id));
    }, () => {
      host.classList.remove('moving');
      if (!moved) return;
      const to = moving.map((m) => ({ id: m.n.id, x: m.n.x, y: m.n.y }));
      for (const m of moving) { m.n.x = m.x; m.n.y = m.y; }
      opts.onChange('move', (d) => { for (const p of to) { const n = d.nodes.find((x) => x.id === p.id); if (n) { n.x = p.x; n.y = p.y; } } });
    });
  }

  function startNoteResize(event, id) {
    const node = nodeById(id);
    if (!node || opts.readOnly?.()) return;
    const start = toWorld(event.clientX, event.clientY);
    const b0 = nodeBox(node);
    const el = nodesLayer.querySelector(`[data-node="${CSS.escape(id)}"]`);
    let size = b0;
    track(event, (e) => {
      const p = toWorld(e.clientX, e.clientY);
      size = { w: Math.max(140, Math.round(b0.w + p.x - start.x)), h: Math.max(70, Math.round(b0.h + p.y - start.y)) };
      el.style.width = `${size.w}px`;
      el.style.height = `${size.h}px`;
    }, () => opts.onChange('resize', (d) => { const n = d.nodes.find((x) => x.id === id); if (n) { n.w = size.w; n.h = size.h; } }));
  }

  function startConnect(event, fromId, port, tools) {
    const from = nodeById(fromId);
    const a = portPoint(from, tools ? 'tools' : 'out', port);
    temp.hidden = false;
    host.classList.add('connecting');
    let target = null;
    track(event, (e) => {
      const p = toWorld(e.clientX, e.clientY);
      const under = document.elementFromPoint(e.clientX, e.clientY)?.closest('.node');
      for (const el of nodesLayer.querySelectorAll('.drop-target')) el.classList.remove('drop-target');
      target = null;
      if (under && under.dataset.node !== fromId && nodeDef(nodeById(under.dataset.node)?.type)?.inputs) { target = under.dataset.node; under.classList.add('drop-target'); }
      const b = target ? portPoint(nodeById(target), 'in') : p;
      temp.setAttribute('d', edgePath(a, b, tools));
    }, (e) => {
      temp.hidden = true;
      host.classList.remove('connecting');
      for (const el of nodesLayer.querySelectorAll('.drop-target')) el.classList.remove('drop-target');
      if (target) {
        opts.onChange('connect', (d) => {
          if (d.edges.some((x) => x.from === fromId && x.fromPort === port && x.to === target)) return;
          d.edges.push({ id: `e${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, from: fromId, fromPort: port, to: target, toPort: 'in' });
        });
      } else {
        const p = toWorld(e.clientX, e.clientY);
        const r = host.getBoundingClientRect();
        if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) opts.onQuickAdd?.(p, { from: fromId, port }, { clientX: e.clientX, clientY: e.clientY });
      }
    });
  }

  on('wheel', (event) => {
    event.preventDefault();
    if (event.shiftKey && !event.ctrlKey) { view.x -= event.deltaY; applyView(); return; }
    const delta = event.deltaMode === 1 ? event.deltaY * 33 : event.deltaY;
    zoomAt(Math.pow(1.0015, -delta), event.clientX, event.clientY);
  }, { passive: false });

  on('dblclick', (event) => {
    const nodeEl = event.target.closest('.node');
    if (nodeEl) { opts.onOpenNode?.(nodeEl.dataset.node); return; }
    if (event.target.closest('.canvas-minimap')) return;
    opts.onQuickAdd?.(toWorld(event.clientX, event.clientY), null, { clientX: event.clientX, clientY: event.clientY });
  });

  on('contextmenu', (event) => {
    const nodeEl = event.target.closest('.node');
    const edgeEl = event.target.closest('.edge');
    event.preventDefault();
    if (nodeEl) { if (!selection.has(nodeEl.dataset.node)) setSelection([nodeEl.dataset.node]); opts.onContextMenu?.('node', event, { id: nodeEl.dataset.node }); return; }
    if (edgeEl) { setSelection([], { edge: edgeEl.dataset.edge }); opts.onContextMenu?.('edge', event, { id: edgeEl.dataset.edge }); return; }
    opts.onContextMenu?.('canvas', event, { point: toWorld(event.clientX, event.clientY) });
  });

  on('dragover', (event) => {
    if (![...(event.dataTransfer?.types ?? [])].includes('application/x-myagents-node')) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    host.classList.add('drop-hover');
  });
  on('dragleave', () => host.classList.remove('drop-hover'));
  on('drop', (event) => {
    const type = event.dataTransfer?.getData('application/x-myagents-node');
    host.classList.remove('drop-hover');
    if (!type) return;
    event.preventDefault();
    const p = toWorld(event.clientX, event.clientY);
    opts.onDropType?.(type, { x: p.x - NODE_W / 2, y: p.y - 30 });
  });

  const resize = new ResizeObserver(() => drawMinimap());
  resize.observe(host);

  // ───────────── run state

  function markNode(id, state) {
    if (state === null) run.delete(id); else run.set(id, { ...(run.get(id) ?? {}), ...state });
    renderNode(id);
    drawMinimap();
  }

  function markEdge(id, state) {
    edgeRun.set(id, { ...(edgeRun.get(id) ?? { count: 0 }), ...state });
    const e = doc?.edges.find((x) => x.id === id);
    if (!e) return;
    const g = edgesLayer.querySelector(`[data-edge="${CSS.escape(id)}"]`);
    if (g) g.outerHTML = edgeHtml(e);
  }

  /** A dot runs along the edge (from → to); the edge stays lit as "ran". */
  function flow(edgeOrMatch) {
    const e = typeof edgeOrMatch === 'string' ? doc?.edges.find((x) => x.id === edgeOrMatch) : doc?.edges.find((x) => x.from === edgeOrMatch.from && x.to === edgeOrMatch.to && (edgeOrMatch.port == null || x.fromPort === edgeOrMatch.port));
    if (!e) return;
    const er = edgeRun.get(e.id) ?? { count: 0 };
    markEdge(e.id, { count: er.count + 1, active: true });
    clearTimeout(er.timer);
    const timer = setTimeout(() => { if (!destroyed) markEdge(e.id, { active: false }); }, 900);
    edgeRun.get(e.id).timer = timer;
    if (opts.animate?.() === false) return;
    const path = edgesLayer.querySelector(`[data-edge="${CSS.escape(e.id)}"] .edge-line`);
    if (!path) return;
    const total = path.getTotalLength();
    const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    dot.setAttribute('r', '5');
    dot.setAttribute('class', `packet ${e.fromPort === 'tools' ? 'packet-tool' : e.fromPort === 'error' ? 'packet-error' : ''}`);
    packets.append(dot);
    const t0 = performance.now();
    const dur = Math.min(900, Math.max(350, total * 1.4));
    const step = (now) => {
      if (destroyed) return;
      const k = Math.min(1, (now - t0) / dur);
      const ease = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
      const p = path.getPointAtLength(total * ease);
      dot.setAttribute('cx', String(p.x));
      dot.setAttribute('cy', String(p.y));
      if (k < 1) requestAnimationFrame(step); else dot.remove();
    };
    requestAnimationFrame(step);
  }

  function clearRun() {
    run.clear();
    for (const v of edgeRun.values()) clearTimeout(v.timer);
    edgeRun.clear();
    packets.innerHTML = '';
    render();
  }

  /** Puts the canvas so that a node is in sight (centred when it is not). */
  function reveal(id) {
    const n = nodeById(id);
    if (!n) return;
    const r = host.getBoundingClientRect();
    const b = nodeBox(n);
    const sx = n.x * view.zoom + view.x;
    const sy = n.y * view.zoom + view.y;
    if (sx > 20 && sy > 20 && sx + b.w * view.zoom < r.width - 20 && sy + b.h * view.zoom < r.height - 20) return;
    view.x = r.width / 2 - (n.x + b.w / 2) * view.zoom;
    view.y = r.height / 2 - (n.y + b.h / 2) * view.zoom;
    applyView();
  }

  applyView();
  return {
    render, renderNode, fit, reveal, zoomAt, toWorld, applyView,
    setViewport(v) { Object.assign(view, v); applyView(); },
    viewport: () => ({ ...view }),
    center: () => { const r = host.getBoundingClientRect(); return toWorld(r.left + r.width / 2, r.top + r.height / 2); },
    selection: () => [...selection],
    selectedEdge: () => selectedEdge,
    setSelection,
    markNode, markEdge, flow, clearRun,
    runState: (id) => run.get(id) ?? null,
    destroy() { destroyed = true; life.abort(); resize.disconnect(); host.innerHTML = ''; host.classList.remove('canvas-host'); },
  };
}
