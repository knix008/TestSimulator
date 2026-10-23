// The visual model editor (SVG): layers are cards, wires carry tensors from a
// card's output port (bottom) to another card's input port (top).
//   • drag a layer or block from the palette onto the canvas (onto a wire: it is
//     inserted there; onto a card: it is added after it)
//   • drag from an output port to a card to connect; click a wire and press Delete to cut it
//   • drag cards to move them (shift: add to the selection, shift-drag on the
//     background: select with a rectangle); drag the background to pan;
//     Ctrl + wheel zooms, the wheel scrolls
//   • top to bottom (the stored layout) or left to right: the same layout transposed, so
//     switching back and forth keeps the user's arrangement; a 5×5 grid (a major line every
//     five cells) can be shown under the cards
//   • the selected card shows quick buttons: insert above / below, duplicate,
//     replace, residual connection, delete — and +/− for its width
// After each snapshot the cards show their activations as a small strip.
import { LAYERS, layerSummary, shapeText } from '../domain/layers.js';
import { NODE_H, NODE_W, incoming, nodeById } from '../domain/graph.js';
import { icon } from '../icons.js';
import { escapeHtml } from './dom.js';
import { colorOf, range, rgb } from './charts.js';

const GROUP_COLORS = { io: '#64748b', core: '#4f6bed', conv: '#0e9f8e', seq: '#c26a1b', regular: '#8b5cf6', shape: '#6b7280', merge: '#d9467a' };
// Left to right: a model y becomes a view x (rows step NODE_W + 40 apart instead of NODE_H + 34) and back.
const ACROSS = (NODE_W + 40) / (NODE_H + 34);
export const ZOOM = { min: 0.05, max: 3 };
export const GRID = 20; // one grid cell; every fifth line is a major one
const svgIcon = (name) => icon(name).replace('<svg ', '<svg x="12" y="11" width="20" height="20" ');

export class GraphView {
  constructor(host, app) {
    this.host = host;
    this.app = app;
    this.zoom = 1;
    this.pan = { x: 0, y: 0 };
    this.selection = new Set();
    this.selectedEdge = null;
    this.drag = null;
    this.flowUntil = 0;
    host.innerHTML = `<div class="graph-wrap" tabindex="0" aria-label="${escapeHtml(app.t('tab.model'))}">
      <svg class="graph-svg" xmlns="http://www.w3.org/2000/svg"><defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" class="arrow-head"/></marker>
        <marker id="arrow-sel" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" class="arrow-head sel"/></marker>
        <pattern id="graph-grid" patternUnits="userSpaceOnUse"><path class="grid-minor"/><path class="grid-major"/></pattern>
      </defs><rect class="graph-grid" width="100%" height="100%" fill="url(#graph-grid)"/><g class="graph-layer"></g></svg>
      <div class="graph-quick" hidden></div>
      <div class="graph-empty" hidden></div>
    </div>`;
    this.wrap = host.querySelector('.graph-wrap');
    this.svg = host.querySelector('.graph-svg');
    this.layer = host.querySelector('.graph-layer');
    this.quick = host.querySelector('.graph-quick');
    this.empty = host.querySelector('.graph-empty');
    this.grid = host.querySelector('.graph-grid');
    this.pattern = host.querySelector('#graph-grid');
    this.bind();
  }

  get model() { return this.app.model(); }

  get horizontal() { return this.app.settings().graphDirection === 'horizontal'; }

  /** Where a card is drawn (view coordinates): the model position, or transposed for left to right. */
  at(node) { return this.horizontal ? { x: node.y * ACROSS, y: node.x / ACROSS } : { x: node.x, y: node.y }; }
  /** The model position of a card drawn at view (x, y). */
  fromView(x, y) { return this.horizontal ? { x: y * ACROSS, y: x / ACROSS } : { x, y }; }
  /** A card's input port (at `slot` of its side) and output port, in view coordinates. */
  ports(node, slot = 0.5) {
    const p = this.at(node);
    return this.horizontal
      ? { in: { x: p.x - 2, y: p.y + NODE_H * slot }, out: { x: p.x + NODE_W, y: p.y + NODE_H / 2 } }
      : { in: { x: p.x + NODE_W * slot, y: p.y - 2 }, out: { x: p.x + NODE_W / 2, y: p.y + NODE_H } };
  }
  /** Bounds of the drawn cards (view coordinates). */
  bounds() {
    if (!this.model.nodes.length) return { x: 0, y: 0, w: NODE_W, h: NODE_H };
    const ps = this.model.nodes.map((node) => this.at(node));
    const x = Math.min(...ps.map((p) => p.x)); const y = Math.min(...ps.map((p) => p.y));
    return { x, y, w: Math.max(...ps.map((p) => p.x)) + NODE_W - x, h: Math.max(...ps.map((p) => p.y)) + NODE_H - y };
  }

  toScreen(x, y) { return { x: x * this.zoom + this.pan.x, y: y * this.zoom + this.pan.y }; }
  /** Pointer → view coordinates. */
  toView(clientX, clientY) {
    const r = this.svg.getBoundingClientRect();
    return { x: (clientX - r.left - this.pan.x) / this.zoom, y: (clientY - r.top - this.pan.y) / this.zoom };
  }

  // ───────────────────────── drawing

  render() {
    const model = this.model;
    const shapes = this.app.shapes();
    const problems = new Map();
    for (const problem of this.app.problems()) if (problem.nodeId) problems.set(problem.nodeId, problem);
    const snapshot = this.app.snapshot();
    const t = this.app.t;
    this.layer.setAttribute('transform', `translate(${this.pan.x} ${this.pan.y}) scale(${this.zoom})`);
    this.grid.style.display = this.app.settings().showGrid === false ? 'none' : '';
    this.pattern.setAttribute('patternTransform', `translate(${this.pan.x} ${this.pan.y}) scale(${this.zoom})`);
    this.drawGrid();
    const horizontal = this.horizontal;
    const flowing = Date.now() < this.flowUntil;
    const edges = model.edges.map((edge) => {
      const a = nodeById(model, edge.from);
      const b = nodeById(model, edge.to);
      if (!a || !b) return '';
      const ins = incoming(model, b.id);
      const slot = ins.length > 1 ? (ins.indexOf(edge) + 1) / (ins.length + 1) : 0.5;
      const { x: x1, y: y1 } = this.ports(a).out;
      const { x: x2, y: y2 } = this.ports(b, slot).in;
      // f: along the flow (down, or right when left to right), c: across it.
      const [f1, c1, f2, c2] = horizontal ? [x1, y1, x2, y2] : [y1, x1, y2, x2];
      const half = Math.max(30, Math.abs(f2 - f1) / 2);
      const back = f2 < f1 + 10;
      const side = horizontal ? NODE_H : NODE_W;
      const pt = (f, c) => (horizontal ? `${f} ${c}` : `${c} ${f}`);
      const path = back
        ? `M${pt(f1, c1)} C${pt(f1 + 60, c1)} ${pt(f1 + 60, c1 + side * 0.75)} ${pt((f1 + f2) / 2, (c1 + c2) / 2 + side * 0.6)} S${pt(f2 - 60, c2)} ${pt(f2, c2)}`
        : `M${pt(f1, c1)} C${pt(f1 + half, c1)} ${pt(f2 - half, c2)} ${pt(f2, c2)}`;
      const selected = this.selectedEdge === edge.id;
      const shape = shapes.get(a.id)?.shape;
      const mx = (x1 + x2) / 2; const my = (y1 + y2) / 2;
      return `<g class="edge ${selected ? 'selected' : ''}" data-edge="${edge.id}">
        <path class="edge-hit" d="${path}"/>
        <path class="edge-line ${flowing ? 'flow' : ''}" d="${path}" marker-end="url(#${selected ? 'arrow-sel' : 'arrow'})"/>
        ${shape ? `<text class="edge-label" x="${mx + 6}" y="${my}">${escapeHtml(shapeText(shape))}</text>` : ''}
      </g>`;
    }).join('');
    const nodes = model.nodes.map((node) => {
      const def = LAYERS[node.type];
      const info = shapes.get(node.id);
      const problem = problems.get(node.id);
      const selected = this.selection.has(node.id);
      const color = GROUP_COLORS[def.group] ?? '#64748b';
      const strip = this.activationStrip(node, snapshot);
      const params = info?.params?.total ? `${info.params.total.toLocaleString()} ${t('graph.params')}` : '';
      const summary = layerSummary(node.type, node.params);
      const p = this.at(node);
      return `<g class="node ${selected ? 'selected' : ''} ${problem ? `has-${problem.level}` : ''}" data-node="${node.id}" transform="translate(${p.x} ${p.y})">
        <rect class="node-box" width="${NODE_W}" height="${NODE_H}" rx="10"/>
        <rect class="node-stripe" width="6" height="${NODE_H}" rx="3" fill="${color}"/>
        <g class="node-icon" style="color:${color}">${svgIcon(def.icon)}</g>
        <text class="node-name" x="40" y="20">${escapeHtml(node.name)}</text>
        <text class="node-type" x="40" y="36">${escapeHtml(t(`layer.${node.type}`))}${summary ? ` · ${escapeHtml(summary)}` : ''}</text>
        <text class="node-shape" x="40" y="${NODE_H - 9}">${info?.shape ? escapeHtml(shapeText(info.shape)) : '—'}</text>
        <text class="node-params" x="${NODE_W - 10}" y="${NODE_H - 9}" text-anchor="end">${escapeHtml(params)}</text>
        ${strip}
        ${problem ? `<g class="node-badge" transform="translate(${NODE_W - 22} 6)"><title>${escapeHtml(this.app.problemText(problem))}</title><circle cx="8" cy="8" r="8"/><text x="8" y="12" text-anchor="middle">!</text></g>` : ''}
        ${def.inputs !== 0 ? `<circle class="port port-in" cx="${horizontal ? 0 : NODE_W / 2}" cy="${horizontal ? NODE_H / 2 : 0}" r="5"/>` : ''}
        <circle class="port port-out" data-port="${node.id}" cx="${horizontal ? NODE_W : NODE_W / 2}" cy="${horizontal ? NODE_H / 2 : NODE_H}" r="6"><title>${escapeHtml(t('graph.dragToConnect'))}</title></circle>
      </g>`;
    }).join('');
    const temp = this.drag?.kind === 'connect' ? `<path class="edge-temp" d="M${this.drag.x1} ${this.drag.y1} L${this.drag.x2} ${this.drag.y2}"/>` : '';
    const band = this.drag?.kind === 'band' ? `<rect class="band" x="${Math.min(this.drag.x1, this.drag.x2)}" y="${Math.min(this.drag.y1, this.drag.y2)}" width="${Math.abs(this.drag.x2 - this.drag.x1)}" height="${Math.abs(this.drag.y2 - this.drag.y1)}"/>` : '';
    this.layer.innerHTML = `${edges}${nodes}${temp}${band}`;
    this.empty.hidden = model.nodes.length > 0;
    if (!model.nodes.length) this.empty.innerHTML = `${icon('tabModel')}<b>${escapeHtml(t('graph.emptyTitle'))}</b><span>${escapeHtml(t('graph.emptyHint'))}</span>`;
    this.renderQuick();
  }

  /**
   * The 5×5 grid: a cell of GRID · 5^k model units, k chosen so a cell stays 12 … 60 px on screen — zooming out
   * far enough, five cells become one and the grid is evenly spaced again (zooming in, the other way round).
   * The lines inside a block of 5×5 cells are lighter than the block's own.
   */
  drawGrid() {
    let cell = GRID;
    while (cell * this.zoom < 12) cell *= 5;
    while (cell * this.zoom > 60 && cell > GRID / 25) cell /= 5;
    if (cell !== this.gridCell) {
      this.gridCell = cell;
      const block = cell * 5;
      this.pattern.setAttribute('width', block);
      this.pattern.setAttribute('height', block);
      this.pattern.children[0].setAttribute('d', [1, 2, 3, 4].map((k) => `M${k * cell} 0V${block}M0 ${k * cell}H${block}`).join(''));
      this.pattern.children[1].setAttribute('d', `M0 0V${block}M0 0H${block}`);
    }
    // One screen pixel wide at any zoom (non-scaling-stroke does not apply inside a pattern).
    for (const line of this.pattern.children) line.setAttribute('stroke-width', String(1 / this.zoom));
  }

  /** A strip of coloured cells (units) inside a card, from the last snapshot. */
  activationStrip(node, snapshot) {
    const act = snapshot?.nodes?.[node.id]?.act;
    if (!act?.data) return '';
    const units = act.shape.at(-1) ?? act.data.length;
    const per = act.data.length / units;
    const values = new Float32Array(units);
    for (let u = 0; u < units; u++) {
      let s = 0;
      for (let i = 0; i < per; i++) s += Math.abs(act.data[i * units + u]);
      values[u] = per > 1 ? s / per : act.data[u];
    }
    const shown = Math.min(units, 32);
    const r = range(values);
    const w = (NODE_W - 50) / shown;
    const cells = [];
    for (let k = 0; k < shown; k++) {
      const u = Math.floor((k * units) / shown);
      const c = colorOf(values[u], r.min, r.max, per > 1 ? 'viridis' : this.app.settings().colorMap, this.app.dark());
      cells.push(`<rect x="${40 + k * w}" y="44" width="${Math.max(1, w - 0.6)}" height="6" rx="1" fill="${rgb(c)}"/>`);
    }
    return `<g class="node-strip">${cells.join('')}</g>`;
  }

  renderQuick() {
    const ids = [...this.selection];
    if (ids.length !== 1 || this.drag) { this.quick.hidden = true; return; }
    const node = nodeById(this.model, ids[0]);
    if (!node) { this.quick.hidden = true; return; }
    const t = this.app.t;
    const at = this.at(node);
    const p = this.toScreen(at.x, at.y);
    const button = (action, glyph, tip, disabled = false) => `<button class="quick-button" data-quick="${action}" title="${escapeHtml(tip)}" aria-label="${escapeHtml(tip)}" ${disabled ? 'disabled' : ''}>${icon(glyph)}</button>`;
    const widthKey = node.params.units !== undefined ? 'units' : node.params.filters !== undefined ? 'filters' : null;
    this.quick.innerHTML = [
      button('insertAbove', 'insertAbove', t('graph.insertAbove'), node.type === 'input'),
      button('insertBelow', 'insertBelow', t('graph.insertBelow')),
      widthKey ? button('widthDown', 'widthDown', t('graph.widthDown', { key: t(`param.${widthKey}`) })) : '',
      widthKey ? `<span class="quick-value" title="${escapeHtml(t(`param.${widthKey}`))}">${node.params[widthKey]}</span>` : '',
      widthKey ? button('widthUp', 'widthUp', t('graph.widthUp', { key: t(`param.${widthKey}`) })) : '',
      button('replace', 'replaceLayer', t('graph.replace'), node.type === 'input'),
      button('duplicate', 'duplicateLayer', t('graph.duplicate'), node.type === 'input'),
      button('residual', 'residual', t('graph.residual'), node.type === 'input'),
      button('delete', 'trash', t('graph.delete')),
    ].join('');
    this.quick.hidden = false;
    this.quick.style.left = `${Math.max(4, p.x)}px`;
    this.quick.style.top = `${Math.max(4, p.y - 40)}px`;
  }

  /** Wires light up for a moment (a snapshot arrived). */
  flow(ms = 900) {
    if (!this.app.settings().animateFlow) return;
    this.flowUntil = Date.now() + ms;
    this.render();
    clearTimeout(this.flowTimer);
    this.flowTimer = setTimeout(() => this.render(), ms + 30);
  }

  // ───────────────────────── view

  /** The whole model in view, centred both ways (a little room above for the quick buttons). */
  fit() {
    const b = this.bounds();
    const r = this.svg.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const zoom = Math.max(ZOOM.min, Math.min(1.4, Math.min((r.width - 80) / b.w, (r.height - 100) / b.h)));
    this.zoom = zoom;
    this.pan = { x: (r.width - b.w * zoom) / 2 - b.x * zoom, y: 10 + (r.height - b.h * zoom) / 2 - b.y * zoom };
    this.render();
    this.app.zoomChanged?.();
  }

  zoomBy(factor, at = null) {
    const r = this.svg.getBoundingClientRect();
    const cx = at?.x ?? r.width / 2;
    const cy = at?.y ?? r.height / 2;
    const next = Math.max(ZOOM.min, Math.min(ZOOM.max, this.zoom * factor));
    this.pan.x = cx - ((cx - this.pan.x) * next) / this.zoom;
    this.pan.y = cy - ((cy - this.pan.y) * next) / this.zoom;
    this.zoom = next;
    this.render();
    this.app.zoomChanged?.();
  }

  select(ids, { edge = null } = {}) {
    this.selection = new Set(ids);
    this.selectedEdge = edge;
    this.render();
    this.app.selectionChanged();
  }

  /** A node centred in view (search results, problem list). */
  reveal(id) {
    const node = nodeById(this.model, id);
    if (!node) return;
    const r = this.svg.getBoundingClientRect();
    const p = this.at(node);
    this.pan = { x: r.width / 2 - (p.x + NODE_W / 2) * this.zoom, y: r.height / 2 - (p.y + NODE_H / 2) * this.zoom };
    this.select([id]);
  }

  /** Where a dropped layer lands: on a wire (insert), on a card (after it), or empty canvas. */
  dropTarget(clientX, clientY) {
    const element = document.elementFromPoint(clientX, clientY);
    const edge = element?.closest?.('[data-edge]')?.dataset.edge;
    if (edge) return { edge };
    const node = element?.closest?.('[data-node]')?.dataset.node;
    if (node) return { node };
    const p = this.toView(clientX, clientY);
    const m = this.fromView(p.x - NODE_W / 2, p.y - NODE_H / 2);
    return { at: { x: Math.round(m.x / 10) * 10, y: Math.round(m.y / 10) * 10 } };
  }

  // ───────────────────────── input

  bind() {
    const svg = this.svg;
    svg.addEventListener('pointerdown', (event) => this.pointerDown(event));
    window.addEventListener('pointermove', (event) => this.pointerMove(event));
    window.addEventListener('pointerup', (event) => this.pointerUp(event));
    svg.addEventListener('wheel', (event) => {
      event.preventDefault();
      const r = svg.getBoundingClientRect();
      if (event.ctrlKey || event.metaKey) this.zoomBy(event.deltaY < 0 ? 1.12 : 1 / 1.12, { x: event.clientX - r.left, y: event.clientY - r.top });
      else {
        this.pan.x -= event.shiftKey ? event.deltaY : event.deltaX;
        this.pan.y -= event.shiftKey ? 0 : event.deltaY;
        this.render();
      }
    }, { passive: false });
    svg.addEventListener('dblclick', (event) => {
      const id = event.target.closest('[data-node]')?.dataset.node;
      if (id) this.app.focusInspector(id);
      else if (!event.target.closest('[data-edge]')) this.app.openLayerPicker({ x: event.clientX, y: event.clientY }, { at: this.dropTarget(event.clientX, event.clientY).at });
    });
    svg.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      const id = event.target.closest('[data-node]')?.dataset.node;
      const edge = event.target.closest('[data-edge]')?.dataset.edge;
      if (id && !this.selection.has(id)) this.select([id]);
      if (edge) this.select([], { edge });
      this.app.graphContextMenu({ x: event.clientX, y: event.clientY }, { node: id ?? null, edge: edge ?? null, at: this.dropTarget(event.clientX, event.clientY).at });
    });
    this.quick.addEventListener('click', (event) => {
      const button = event.target.closest('[data-quick]');
      if (!button || button.disabled) return;
      const id = [...this.selection][0];
      this.app.quickAction(button.dataset.quick, id, button.getBoundingClientRect());
    });
    // Palette drops
    this.wrap.addEventListener('dragover', (event) => {
      if (![...event.dataTransfer.types].includes('application/x-mytrainer')) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
      const target = this.dropTarget(event.clientX, event.clientY);
      for (const element of this.layer.querySelectorAll('.drop-hover')) element.classList.remove('drop-hover');
      const hover = target.edge ? this.layer.querySelector(`[data-edge="${target.edge}"]`) : target.node ? this.layer.querySelector(`[data-node="${target.node}"]`) : null;
      hover?.classList.add('drop-hover');
    });
    this.wrap.addEventListener('dragleave', () => { for (const element of this.layer.querySelectorAll('.drop-hover')) element.classList.remove('drop-hover'); });
    this.wrap.addEventListener('drop', (event) => {
      const raw = event.dataTransfer.getData('application/x-mytrainer');
      if (!raw) return;
      event.preventDefault();
      const item = JSON.parse(raw);
      this.app.dropItem(item, this.dropTarget(event.clientX, event.clientY));
    });
  }

  pointerDown(event) {
    if (event.button === 2) return;
    this.wrap.focus({ preventScroll: true });
    const port = event.target.closest('[data-port]')?.dataset.port;
    const nodeId = event.target.closest('[data-node]')?.dataset.node;
    const edgeId = event.target.closest('[data-edge]')?.dataset.edge;
    const p = this.toView(event.clientX, event.clientY);
    if (port) {
      const out = this.ports(nodeById(this.model, port)).out;
      this.drag = { kind: 'connect', from: port, x1: out.x, y1: out.y, x2: p.x, y2: p.y };
      event.preventDefault();
      return;
    }
    if (nodeId) {
      if (event.shiftKey || event.ctrlKey || event.metaKey) {
        const next = new Set(this.selection);
        if (next.has(nodeId)) next.delete(nodeId); else next.add(nodeId);
        this.select([...next]);
      } else if (!this.selection.has(nodeId)) this.select([nodeId]);
      const starts = new Map([...this.selection].map((id) => [id, this.at(nodeById(this.model, id))]));
      this.drag = { kind: 'move', start: p, starts, moved: false };
      event.preventDefault();
      return;
    }
    if (edgeId) {
      this.select([], { edge: edgeId });
      return;
    }
    if (event.shiftKey) {
      this.drag = { kind: 'band', x1: p.x, y1: p.y, x2: p.x, y2: p.y };
    } else {
      this.drag = { kind: 'pan', sx: event.clientX, sy: event.clientY, px: this.pan.x, py: this.pan.y, moved: false };
    }
  }

  pointerMove(event) {
    if (!this.drag) return;
    const p = this.toView(event.clientX, event.clientY);
    const d = this.drag;
    if (d.kind === 'pan') {
      this.pan = { x: d.px + event.clientX - d.sx, y: d.py + event.clientY - d.sy };
      d.moved ||= Math.abs(event.clientX - d.sx) + Math.abs(event.clientY - d.sy) > 3;
    } else if (d.kind === 'move') {
      const dx = p.x - d.start.x; const dy = p.y - d.start.y;
      if (Math.abs(dx) + Math.abs(dy) > 2) d.moved = true;
      for (const [id, start] of d.starts) {
        const node = nodeById(this.model, id);
        const m = this.fromView(start.x + dx, start.y + dy);
        node.x = Math.round(m.x / 10) * 10;
        node.y = Math.round(m.y / 10) * 10;
      }
    } else {
      d.x2 = p.x; d.y2 = p.y;
    }
    if (!this.frame) this.frame = requestAnimationFrame(() => { this.frame = null; this.render(); });
  }

  pointerUp(event) {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    if (d.kind === 'connect') {
      const target = document.elementFromPoint(event.clientX, event.clientY)?.closest?.('[data-node]')?.dataset.node;
      if (target && target !== d.from) this.app.connectNodes(d.from, target);
      else this.render();
    } else if (d.kind === 'move') {
      if (d.moved) this.app.commit('move');
      this.render();
    } else if (d.kind === 'band') {
      const x1 = Math.min(d.x1, d.x2); const x2 = Math.max(d.x1, d.x2); const y1 = Math.min(d.y1, d.y2); const y2 = Math.max(d.y1, d.y2);
      const ids = this.model.nodes.filter((node) => { const q = this.at(node); return q.x + NODE_W > x1 && q.x < x2 && q.y + NODE_H > y1 && q.y < y2; }).map((node) => node.id);
      this.select(ids);
    } else if (d.kind === 'pan') {
      if (!d.moved) this.select([]);
      else this.render();
    }
  }
}
