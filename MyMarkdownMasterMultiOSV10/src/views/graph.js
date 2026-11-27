// The graph view (Obsidian's graph, global and local): the vault's notes as nodes and their links as lines,
// laid out by a force simulation (graph-model.js) and drawn on a 2D canvas. Pan by dragging the background,
// zoom with the wheel, drag nodes, hover to highlight a node and its neighbours, click to open, double-click
// the background to fit. The settings panel (top right) holds Filters, Groups, Display and Forces.
import './graph.css';
import { registerTexts, t } from '../i18n.js';
import { icon } from '../icons.js';
import { escapeHtml, pointerDrag } from '../ui/dom.js';
import TEXTS from './graph-texts.js';
import {
  DEFAULT_OPTIONS, RANGES, normalizeOptions, buildGraph, carryPositions, Simulation, nodeRadius,
  labelAlpha, animationOrder, graphBounds, fitView,
} from './graph-model.js';

registerTexts(TEXTS);

const TOKENS = ['text', 'muted', 'border', 'accent', 'surface', 'bg', 'chart', 'tone-blue', 'tone-purple', 'tone-green', 'tone-orange', 'tone-red', 'tone-teal', 'tone-pink', 'tone-amber', 'tone-cyan', 'tone-indigo'];
const GROUP_TONES = ['tone-blue', 'tone-green', 'tone-orange', 'tone-purple', 'tone-red', 'tone-teal', 'tone-pink', 'tone-amber', 'tone-cyan', 'tone-indigo'];
const FILTER_KEYS = ['search', 'showTags', 'showAttachments', 'existingOnly', 'showOrphans', 'depth', 'incoming', 'outgoing', 'neighbors', 'groups'];
const FORCE_KEYS = ['centerStrength', 'repelStrength', 'linkStrength', 'linkDistance'];
const MIN_SCALE = 0.02;
const MAX_SCALE = 8;

const parseColor = (text) => {
  const m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?/i.exec(text ?? '');
  if (!m) return null;
  let a = m[4] == null ? 1 : parseFloat(m[4]);
  if (String(m[4]).endsWith('%')) a /= 100;
  return [Number(m[1]), Number(m[2]), Number(m[3]), a];
};
const rgba = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${Math.max(0, Math.min(1, a * (c[3] ?? 1))).toFixed(3)})`;
const toHex = (c) => `#${c.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
const hexColor = (hex) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16), 1];
const fmt = (v, step) => (step >= 1 ? String(Math.round(v)) : Number(v).toFixed(step >= 0.1 ? 1 : 2));

/**
 * host: the element to fill (the view takes 100% of it). api: { index, local, mode?, openFile, openTag?,
 * loadOptions, saveOptions, matchQuery?, getActivePath?, compact }.
 */
export function createGraphView(host, api = {}) {
  const stored = api.loadOptions?.();
  let opts = normalizeOptions(stored);
  if (api.compact) opts.collapsed = true;
  let localMode = api.mode ? api.mode === 'local' : api.local != null;
  let local = api.local ?? null;

  const root = document.createElement('div');
  root.className = `graph-view${api.compact ? ' compact' : ''}`;
  root.innerHTML = '<canvas class="graph-canvas"></canvas><div class="graph-empty" hidden></div><span class="graph-probe" aria-hidden="true"></span><div class="graph-controls"></div>';
  host.appendChild(root);
  const canvas = root.querySelector('.graph-canvas');
  const ctx = canvas.getContext('2d');
  const emptyEl = root.querySelector('.graph-empty');
  const probe = root.querySelector('.graph-probe');
  const controls = root.querySelector('.graph-controls');

  let width = 0; let height = 0; let dpr = 1;
  let scale = api.compact ? 0.6 : 1; let tx = 0; let ty = 0;
  let graph = { nodes: [], links: [], centre: -1 };
  let neighbours = [];
  const sim = new Simulation(graph, opts);
  sim.alpha = 0;
  let buildKey = '';
  let hover = -1; let dragNode = -1; let dragging = false;
  let autoFit = true; let userMoved = false;
  let anim = null; // { order, at }
  let raf = 0; let destroyed = false;
  let saveTimer = 0; let searchTimer = 0;
  let colors = {};
  let fontFamily = 'sans-serif';
  let lastBackgroundClick = { time: 0, x: 0, y: 0 };

  // ───────── colours (resolved through a probe so color-mix() and var() chains become rgb)
  function readColors() {
    const out = {};
    for (const token of TOKENS) {
      probe.style.color = `var(--${token}, ${token === 'chart' ? 'var(--bg, #fff)' : 'currentColor'})`;
      out[token] = parseColor(getComputedStyle(probe).color) ?? [128, 128, 128, 1];
    }
    probe.style.color = '';
    colors = out;
    fontFamily = getComputedStyle(root).fontFamily || 'sans-serif';
  }

  // ───────── building
  const keyOf = () => JSON.stringify([api.index?.version, local, localMode, FILTER_KEYS.map((k) => opts[k])]);

  function rebuild(force = false) {
    const key = keyOf();
    if (!force && key === buildKey) return false;
    buildKey = key;
    const index = api.index;
    const prev = graph.nodes;
    const next = !index || (localMode && !local) ? { nodes: [], links: [], centre: -1 }
      : buildGraph(index, opts, { local: localMode ? local : null, matchQuery: typeof api.matchQuery === 'function' ? (q, p) => api.matchQuery(q, p) : undefined });
    const fresh = carryPositions(prev, next);
    const removed = prev.length + fresh - next.nodes.length;
    graph = next;
    neighbours = next.nodes.map(() => []);
    for (const l of next.links) { neighbours[l.source].push(l.target); neighbours[l.target].push(l.source); }
    sim.setGraph(next);
    anim = null;
    hover = -1;
    if (dragNode >= 0) { dragNode = -1; sim.alphaTarget = 0; }
    if (fresh === next.nodes.length && fresh) {
      // A new layout: settle it a little before the first frame, then fit.
      sim.alpha = 1;
      const t0 = performance.now();
      for (let i = 0; i < 300 && performance.now() - t0 < 60; i += 1) sim.tick();
      autoFit = true; userMoved = false;
      applyFit(false);
    } else if (fresh || removed) sim.reheat(0.3);
    updateEmpty();
    updateStats();
    requestFrame();
    return true;
  }

  function updateEmpty() {
    const msg = localMode && !local ? t('graph.noLocal') : !graph.nodes.length ? t('graph.empty') : '';
    emptyEl.hidden = !msg;
    emptyEl.textContent = msg;
  }
  function updateStats() {
    const el = controls.querySelector('.graph-stats');
    if (el) el.textContent = t('graph.stats', { nodes: graph.nodes.length, links: graph.links.length });
  }

  // ───────── view transform
  const toWorld = (sx, sy) => ({ x: (sx - tx) / scale, y: (sy - ty) / scale });
  const localPoint = (e) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  function fitTarget() { return fitView(graphBounds(graph.nodes, opts.nodeSize), width, height, { padding: api.compact ? 24 : 48, maxScale: api.compact ? 1.2 : 2, minScale: MIN_SCALE }); }
  function applyFit(smooth) {
    if (!width || !height || !graph.nodes.length) return false;
    const f = fitTarget();
    if (!smooth) { scale = f.scale; tx = f.tx; ty = f.ty; return false; }
    const k = 0.18;
    const ds = f.scale - scale; const dx = f.tx - tx; const dy = f.ty - ty;
    scale += ds * k; tx += dx * k; ty += dy * k;
    return Math.abs(ds) / f.scale > 0.002 || Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5;
  }
  function zoomAt(sx, sy, factor) {
    const ns = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale * factor));
    tx = sx - (sx - tx) * (ns / scale);
    ty = sy - (sy - ty) * (ns / scale);
    scale = ns;
    autoFit = false; userMoved = true;
    requestFrame();
  }

  // ───────── frame loop
  function requestFrame() { if (!raf && !destroyed) raf = requestAnimationFrame(frame); }
  function frame() {
    raf = 0;
    if (destroyed) return;
    let more = false;
    if (anim) { stepAnimation(); more = true; }
    if (sim.active && graph.nodes.length) {
      sim.tick();
      if (graph.nodes.length < 400 && sim.active) sim.tick();
      more = true;
    }
    if (autoFit && !userMoved) {
      if (applyFit(true)) more = true;
      else if (!sim.active) autoFit = false;
    }
    draw();
    if (more) requestFrame();
  }

  function stepAnimation() {
    const { order } = anim;
    const k = Math.max(1, Math.ceil(order.length / 150));
    for (let s = 0; s < k && anim.at < order.length; s += 1) {
      const i = order[anim.at++];
      const n = graph.nodes[i];
      const near = neighbours[i].find((j) => !graph.nodes[j].hidden);
      const a = anim.at * 2.399963;
      const base = near != null ? graph.nodes[near] : { x: 0, y: 0 };
      n.x = base.x + Math.cos(a) * 15; n.y = base.y + Math.sin(a) * 15; n.vx = 0; n.vy = 0;
      n.hidden = false;
    }
    sim.reheat(0.4);
    if (anim.at >= order.length) anim = null;
  }
  function startAnimation() {
    if (!graph.nodes.length) return;
    for (const n of graph.nodes) n.hidden = true;
    anim = { order: animationOrder(graph.nodes), at: 0 };
    hover = -1;
    requestFrame();
  }

  // ───────── drawing
  function nodeColor(n, i, activePath) {
    if ((activePath && n.path === activePath) || i === graph.centre) return colors.accent;
    if (n.color) return hexColor(n.color);
    if (n.kind === 'tag') return colors['tone-green'];
    if (n.kind === 'attachment') return colors['tone-orange'];
    return colors.muted;
  }

  function draw() {
    if (!width || !height) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = rgba(colors.chart);
    ctx.fillRect(0, 0, width, height);
    const { nodes, links } = graph;
    if (!nodes.length) return;
    const activePath = api.getActivePath?.() ?? null;
    const focus = dragNode >= 0 ? dragNode : hover;
    const near = focus >= 0 ? new Set([focus, ...neighbours[focus]]) : null;
    const sx = (n) => tx + n.x * scale;
    const sy = (n) => ty + n.y * scale;
    const radius = (n) => Math.max(1.5, nodeRadius(n, opts.nodeSize) * scale);
    const margin = 40;
    const inView = (x, y, r) => x + r > -margin && x - r < width + margin && y + r > -margin && y - r < height + margin;

    // Links
    const lw = Math.max(0.4, opts.lineSize * Math.max(0.5, Math.min(2, scale)));
    const normal = new Path2D(); const lit = new Path2D();
    const arrowsNormal = new Path2D(); const arrowsLit = new Path2D();
    const showArrows = opts.arrows && scale > 0.25;
    for (const l of links) {
      const a = nodes[l.source]; const b = nodes[l.target];
      if (a.hidden || b.hidden) continue;
      const x1 = sx(a); const y1 = sy(a); const x2 = sx(b); const y2 = sy(b);
      if ((x1 < -margin && x2 < -margin) || (x1 > width + margin && x2 > width + margin) || (y1 < -margin && y2 < -margin) || (y1 > height + margin && y2 > height + margin)) continue;
      const isLit = focus >= 0 && (l.source === focus || l.target === focus);
      const path = isLit ? lit : normal;
      path.moveTo(x1, y1); path.lineTo(x2, y2);
      if (showArrows) {
        const dx = x2 - x1; const dy = y2 - y1; const d = Math.hypot(dx, dy);
        const rb = radius(b) + 1;
        if (d > rb + 4) {
          const ux = dx / d; const uy = dy / d;
          const size = Math.max(4, Math.min(10, 6 * Math.sqrt(scale))) * Math.max(0.6, Math.min(2, opts.lineSize));
          const px = x2 - ux * rb; const py = y2 - uy * rb;
          const ap = isLit ? arrowsLit : arrowsNormal;
          ap.moveTo(px, py);
          ap.lineTo(px - ux * size - uy * size * 0.5, py - uy * size + ux * size * 0.5);
          ap.lineTo(px - ux * size + uy * size * 0.5, py - uy * size - ux * size * 0.5);
          ap.closePath();
        }
      }
    }
    ctx.lineWidth = lw;
    ctx.strokeStyle = rgba(colors.muted, focus >= 0 ? 0.12 : 0.45);
    ctx.stroke(normal);
    ctx.fillStyle = rgba(colors.muted, focus >= 0 ? 0.12 : 0.6);
    ctx.fill(arrowsNormal);
    if (focus >= 0) {
      ctx.lineWidth = lw * 1.4;
      ctx.strokeStyle = rgba(colors.accent, 0.9);
      ctx.stroke(lit);
      ctx.fillStyle = rgba(colors.accent, 0.95);
      ctx.fill(arrowsLit);
    }

    // Nodes, batched by colour
    const batches = new Map();
    const rings = [];
    for (let i = 0; i < nodes.length; i += 1) {
      const n = nodes[i];
      if (n.hidden) continue;
      const x = sx(n); const y = sy(n); const r = radius(n);
      if (!inView(x, y, r)) continue;
      let alpha = n.kind === 'unresolved' ? 0.45 : 1;
      if (near && !near.has(i)) alpha *= 0.22;
      const fill = rgba(nodeColor(n, i, activePath), alpha);
      let path = batches.get(fill);
      if (!path) batches.set(fill, path = new Path2D());
      path.moveTo(x + r, y); path.arc(x, y, r, 0, Math.PI * 2);
      if ((activePath && n.path === activePath) || i === graph.centre || i === focus) rings.push([x, y, r]);
    }
    for (const [fill, path] of batches) { ctx.fillStyle = fill; ctx.fill(path); }
    if (rings.length) {
      ctx.lineWidth = 2;
      ctx.strokeStyle = rgba(colors.accent, 0.9);
      const ring = new Path2D();
      for (const [x, y, r] of rings) { ring.moveTo(x + r + 3, y); ring.arc(x, y, r + 3, 0, Math.PI * 2); }
      ctx.stroke(ring);
    }

    // Labels: past the text-fade zoom, and always for the hovered node and its neighbours.
    const la = labelAlpha(scale, opts.textFade);
    const fontSize = Math.round(Math.max(10, Math.min(16, 12 * Math.sqrt(scale))));
    const family = fontFamily;
    ctx.font = `${fontSize}px ${family}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    let drawn = 0;
    const label = (n, i, alpha, halo) => {
      const x = sx(n); const y = sy(n) + radius(n) + 3;
      const text = n.label.length > 48 ? `${n.label.slice(0, 47)}…` : n.label;
      if (halo) { ctx.lineWidth = 3; ctx.strokeStyle = rgba(colors.chart, 0.85 * alpha); ctx.strokeText(text, x, y); }
      ctx.fillStyle = rgba(n.kind === 'unresolved' ? colors.muted : colors.text, alpha);
      ctx.fillText(text, x, y);
      if (i === focus && n.kind === 'unresolved') {
        ctx.font = `${Math.max(10, fontSize - 2)}px ${family}`;
        ctx.fillStyle = rgba(colors.muted, alpha);
        ctx.fillText(t('graph.unresolved'), x, y + fontSize + 2);
        ctx.font = `${fontSize}px ${family}`;
      }
    };
    if (la > 0.02) {
      for (let i = 0; i < nodes.length && drawn < 800; i += 1) {
        const n = nodes[i];
        if (n.hidden || (near && near.has(i))) continue;
        const x = sx(n); const y = sy(n);
        if (!inView(x, y, 60)) continue;
        const alpha = near ? la * 0.2 : la;
        if (alpha < 0.02) continue;
        label(n, i, alpha, false);
        drawn += 1;
      }
    }
    if (near) for (const i of near) if (!nodes[i].hidden) label(nodes[i], i, 1, true);
  }

  // ───────── hit testing and pointer input
  function hit(px, py) {
    const { nodes } = graph;
    let best = -1; let bestD = Infinity;
    for (let i = nodes.length - 1; i >= 0; i -= 1) {
      const n = nodes[i];
      if (n.hidden) continue;
      const dx = tx + n.x * scale - px; const dy = ty + n.y * scale - py;
      const r = Math.max(5, nodeRadius(n, opts.nodeSize) * scale) + 2;
      const d = dx * dx + dy * dy;
      if (d <= r * r && d < bestD) { best = i; bestD = d; }
    }
    return best;
  }

  function open(n, e) {
    const newTab = !!(e?.ctrlKey || e?.metaKey);
    if (n.kind === 'unresolved') api.openFile?.(null, { create: n.name, newTab });
    else if (n.kind === 'tag') api.openTag?.(n.name);
    else if (n.path) api.openFile?.(n.path, { newTab });
  }

  function onPointerDown(e) {
    if (e.button !== 0) return;
    const p = localPoint(e);
    const i = hit(p.x, p.y);
    dragging = true;
    if (i >= 0) {
      const n = graph.nodes[i];
      dragNode = i;
      n.fx = n.x; n.fy = n.y;
      sim.alphaTarget = 0.3; sim.reheat(0.3);
      requestFrame();
      pointerDrag(e, {
        move: (dx, dy, ev) => { const q = localPoint(ev); const w = toWorld(q.x, q.y); n.fx = w.x; n.fy = w.y; userMoved = true; autoFit = false; requestFrame(); },
        end: (ev, moved) => {
          dragging = false;
          n.fx = null; n.fy = null; dragNode = -1; sim.alphaTarget = 0;
          if (!moved) open(n, ev);
          requestFrame();
        },
      });
      return;
    }
    const start = { tx, ty };
    pointerDrag(e, {
      cursor: 'grabbing',
      move: (dx, dy) => { tx = start.tx + dx; ty = start.ty + dy; userMoved = true; autoFit = false; requestFrame(); },
      end: (ev, moved) => {
        dragging = false;
        if (moved) return;
        const now = performance.now();
        const last = lastBackgroundClick;
        if (now - last.time < 400 && Math.hypot(ev.clientX - last.x, ev.clientY - last.y) < 8) {
          lastBackgroundClick = { time: 0, x: 0, y: 0 };
          fit();
        } else lastBackgroundClick = { time: now, x: ev.clientX, y: ev.clientY };
      },
    });
  }
  function onPointerMove(e) {
    if (dragging) return;
    const p = localPoint(e);
    const i = hit(p.x, p.y);
    if (i !== hover) {
      hover = i;
      canvas.style.cursor = i >= 0 ? 'pointer' : '';
      canvas.title = i >= 0 ? (graph.nodes[i].path ?? graph.nodes[i].label) : '';
      requestFrame();
    }
  }
  function onPointerLeave() { if (!dragging && hover >= 0) { hover = -1; canvas.style.cursor = ''; requestFrame(); } }
  function onWheel(e) {
    e.preventDefault();
    const p = localPoint(e);
    const unit = e.deltaMode === 1 ? 0.05 : e.deltaMode === 2 ? 1 : 0.0015;
    zoomAt(p.x, p.y, Math.exp(-e.deltaY * unit * (e.ctrlKey ? 2 : 1)));
  }
  function fit() { autoFit = true; userMoved = false; requestFrame(); }

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerleave', onPointerLeave);
  canvas.addEventListener('wheel', onWheel, { passive: false });

  // ───────── settings panel
  const sectionHead = (id, title, iconName) => `<button type="button" class="graph-section-head" data-section="${id}" aria-expanded="${opts.sections[id]}">${icon(opts.sections[id] ? 'chevronDown' : 'chevronRight', 'icon tiny')}${icon(iconName)}<span>${escapeHtml(title)}</span></button>`;
  const toggle = (key, title) => `<label class="graph-row"><span>${escapeHtml(title)}</span><span class="switch-wrap"><input type="checkbox" data-bool="${key}"${opts[key] ? ' checked' : ''}><span class="switch"></span></span></label>`;
  const range = (key, title) => {
    const [min, max, step] = RANGES[key];
    return `<label class="graph-range"><span class="graph-range-label"><span>${escapeHtml(title)}</span><output data-out="${key}">${fmt(opts[key], step)}</output></span><input type="range" min="${min}" max="${max}" step="${step}" value="${opts[key]}" data-range="${key}"></label>`;
  };

  function renderPanel() {
    const s = opts.sections;
    const groups = opts.groups.map((g, i) => `<div class="graph-group-row"><input type="color" value="${escapeHtml(g.color)}" data-group-color="${i}" title="${escapeHtml(t('graph.groupColor'))}"><input type="text" value="${escapeHtml(g.query)}" data-group-query="${i}" placeholder="${escapeHtml(t('graph.groupQuery'))}" spellcheck="false"><button type="button" class="icon-button danger" data-group-remove="${i}" title="${escapeHtml(t('graph.removeGroup'))}">${icon('trash')}</button></div>`).join('');
    controls.innerHTML = `
      <div class="graph-panel"${opts.collapsed ? ' hidden' : ''}>
        <div class="graph-panel-head">
          <span class="graph-panel-title">${escapeHtml(t(localMode ? 'graph.localTitle' : 'graph.title'))}</span>
          <span class="graph-stats"></span>
          <button type="button" class="icon-button" data-action="zoomOut" title="${escapeHtml(t('graph.zoomOut'))}">${icon('zoomOut')}</button>
          <button type="button" class="icon-button" data-action="zoomIn" title="${escapeHtml(t('graph.zoomIn'))}">${icon('zoomIn')}</button>
          <button type="button" class="icon-button" data-action="fit" title="${escapeHtml(t('graph.fit'))}">${icon('fitPage')}</button>
          <button type="button" class="icon-button" data-toggle-panel title="${escapeHtml(t('graph.collapse'))}">${icon('close')}</button>
        </div>
        <div class="graph-panel-body">
          <section class="graph-section">
            ${sectionHead('filters', t('graph.filters'), 'filter')}
            ${s.filters ? `<div class="graph-section-body">
              <div class="search-box">${icon('search')}<input type="text" data-search value="${escapeHtml(opts.search)}" placeholder="${escapeHtml(t('graph.search'))}" spellcheck="false"></div>
              ${localMode ? `${range('depth', t('graph.depth'))}${toggle('incoming', t('graph.incoming'))}${toggle('outgoing', t('graph.outgoing'))}${toggle('neighbors', t('graph.neighbors'))}<div class="graph-divider"></div>` : ''}
              ${toggle('showTags', t('graph.tags'))}${toggle('showAttachments', t('graph.attachments'))}${toggle('existingOnly', t('graph.existingOnly'))}${toggle('showOrphans', t('graph.orphans'))}
            </div>` : ''}
          </section>
          <section class="graph-section">
            ${sectionHead('groups', t('graph.groups'), 'palette')}
            ${s.groups ? `<div class="graph-section-body">
              ${groups || `<div class="graph-note">${escapeHtml(t('graph.noGroups'))}</div>`}
              <button type="button" class="graph-button" data-group-add>${icon('plus')}<span>${escapeHtml(t('graph.newGroup'))}</span></button>
            </div>` : ''}
          </section>
          <section class="graph-section">
            ${sectionHead('display', t('graph.display'), 'eye')}
            ${s.display ? `<div class="graph-section-body">
              ${toggle('arrows', t('graph.arrows'))}${range('textFade', t('graph.textFade'))}${range('nodeSize', t('graph.nodeSize'))}${range('lineSize', t('graph.lineSize'))}
              <button type="button" class="graph-button primary" data-action="animate">${icon('play')}<span>${escapeHtml(t('graph.animate'))}</span></button>
            </div>` : ''}
          </section>
          <section class="graph-section">
            ${sectionHead('forces', t('graph.forces'), 'speed')}
            ${s.forces ? `<div class="graph-section-body">
              ${range('centerStrength', t('graph.centerForce'))}${range('repelStrength', t('graph.repelForce'))}${range('linkStrength', t('graph.linkForce'))}${range('linkDistance', t('graph.linkDistance'))}
            </div>` : ''}
          </section>
          <div class="graph-panel-foot"><button type="button" class="graph-button" data-action="restore">${icon('refresh')}<span>${escapeHtml(t('graph.restore'))}</span></button></div>
        </div>
      </div>
      <button type="button" class="icon-button graph-gear"${opts.collapsed ? '' : ' hidden'} data-toggle-panel title="${escapeHtml(t('graph.settings'))}">${icon('gear')}</button>`;
    updateStats();
  }

  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flushSave, 400);
  }
  function flushSave() {
    clearTimeout(saveTimer);
    saveTimer = 0;
    try { api.saveOptions?.(JSON.parse(JSON.stringify(opts))); } catch { /* the app's store */ }
  }
  function changed(key) {
    if (FILTER_KEYS.includes(key)) rebuild();
    else if (FORCE_KEYS.includes(key)) { sim.setOptions(opts); sim.reheat(0.5); requestFrame(); } else requestFrame();
    save();
  }
  function defaultGroupColor() {
    const used = new Set(opts.groups.map((g) => g.color));
    const hexes = GROUP_TONES.map((k) => toHex(colors[k] ?? [100, 120, 200]));
    return hexes.find((h) => !used.has(h)) ?? hexes[opts.groups.length % hexes.length];
  }

  controls.addEventListener('click', (e) => {
    const el = e.target.closest('button');
    if (!el || !controls.contains(el)) return;
    if (el.hasAttribute('data-toggle-panel')) { opts.collapsed = !opts.collapsed; renderPanel(); save(); return; }
    if (el.dataset.section) { opts.sections[el.dataset.section] = !opts.sections[el.dataset.section]; renderPanel(); save(); return; }
    if (el.hasAttribute('data-group-add')) {
      if (!Object.keys(colors).length) readColors();
      opts.groups.push({ query: '', color: defaultGroupColor() });
      renderPanel(); save();
      controls.querySelector(`[data-group-query="${opts.groups.length - 1}"]`)?.focus();
      return;
    }
    if (el.dataset.groupRemove != null) { opts.groups.splice(Number(el.dataset.groupRemove), 1); renderPanel(); changed('groups'); return; }
    const action = el.dataset.action;
    if (action === 'zoomIn') zoomAt(width / 2, height / 2, 1.25);
    else if (action === 'zoomOut') zoomAt(width / 2, height / 2, 0.8);
    else if (action === 'fit') fit();
    else if (action === 'animate') startAnimation();
    else if (action === 'restore') {
      const keep = { collapsed: opts.collapsed, sections: opts.sections };
      opts = normalizeOptions({ ...DEFAULT_OPTIONS, ...keep });
      sim.setOptions(opts);
      renderPanel(); rebuild(true); sim.reheat(0.5); requestFrame(); save();
    }
  });
  controls.addEventListener('input', (e) => {
    const el = e.target;
    if (el.dataset.range) {
      const key = el.dataset.range;
      opts[key] = normalizeOptions({ [key]: el.value })[key];
      const out = controls.querySelector(`[data-out="${key}"]`);
      if (out) out.textContent = fmt(opts[key], RANGES[key][2]);
      changed(key);
    } else if (el.hasAttribute('data-search')) {
      opts.search = el.value;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => changed('search'), 200);
    } else if (el.dataset.groupQuery != null) {
      const g = opts.groups[Number(el.dataset.groupQuery)];
      if (!g) return;
      g.query = el.value;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => changed('groups'), 250);
    } else if (el.dataset.groupColor != null) {
      const g = opts.groups[Number(el.dataset.groupColor)];
      if (g) { g.color = el.value.toLowerCase(); changed('groups'); }
    }
  });
  controls.addEventListener('change', (e) => {
    const el = e.target;
    if (el.dataset.bool) { opts[el.dataset.bool] = el.checked; changed(el.dataset.bool); }
  });
  // Keys typed in the panel stay in the panel (the app's shortcuts must not fire while typing a query).
  controls.addEventListener('keydown', (e) => { if (e.target.matches('input[type="text"]')) e.stopPropagation(); });
  controls.addEventListener('pointerdown', (e) => e.stopPropagation());
  controls.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });

  // ───────── size and theme
  function resize() {
    const w = root.clientWidth; const h = root.clientHeight;
    const ratio = Math.max(1, Math.min(3, globalThis.devicePixelRatio || 1));
    if (w === width && h === height && ratio === dpr) { requestFrame(); return; }
    if (width && height) { tx += (w - width) / 2; ty += (h - height) / 2; } else { tx = w / 2; ty = h / 2; }
    width = w; height = h; dpr = ratio;
    canvas.width = Math.max(1, Math.round(w * ratio));
    canvas.height = Math.max(1, Math.round(h * ratio));
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    if (autoFit && !userMoved) applyFit(false);
    requestFrame();
  }
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => resize()) : null;
  ro?.observe(root);
  const mo = typeof MutationObserver === 'function' ? new MutationObserver(() => { readColors(); requestFrame(); }) : null;
  mo?.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style', 'data-theme', 'data-mode'] });
  if (document.body) mo?.observe(document.body, { attributes: true, attributeFilter: ['class', 'style', 'data-theme', 'data-mode'] });
  const mql = globalThis.matchMedia?.('(prefers-color-scheme: dark)');
  const onScheme = () => { readColors(); requestFrame(); };
  mql?.addEventListener?.('change', onScheme);

  renderPanel();
  readColors();
  resize();
  rebuild(true);

  return {
    /** The vault changed (or the theme/language): rebuilds when the index's version moved. */
    refresh() {
      if (destroyed) return;
      readColors();
      if (!rebuild()) requestFrame();
    },
    resize,
    /** The local graph's centre (null: no note open). */
    setLocal(path) {
      if (destroyed) return;
      const next = path || null;
      if (next && api.mode !== 'global' && !localMode) { localMode = true; renderPanel(); }
      if (next === local) { requestFrame(); return; }
      local = next;
      autoFit = true; userMoved = false;
      graph = { nodes: [], links: [], centre: -1 };
      rebuild(true);
    },
    /** Re-renders the settings panel's texts (after a language change). */
    relabel() { renderPanel(); updateEmpty(); },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      clearTimeout(searchTimer);
      if (saveTimer) flushSave();
      ro?.disconnect();
      mo?.disconnect();
      mql?.removeEventListener?.('change', onScheme);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      canvas.removeEventListener('wheel', onWheel);
      root.remove();
    },
  };
}
