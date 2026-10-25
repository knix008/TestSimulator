// The pipeline editor: nodes on a pannable, zoomable canvas, joined by links
// from an output port (right) to an input port (left).
//   drag a node to move it (all selected nodes move together), Shift/Ctrl+click adds to the selection,
//   drag on empty space pans (hand cursor), Shift/Ctrl+drag on empty space draws a selection box,
//   the middle or right button (or Space held) also pans,
//   the wheel zooms at the cursor, drag from an output port to an input port links them,
//   drag a linked input port away to re-route or remove the link, click a link to select it,
//   double-click a node opens its results, double-click empty space opens the node library there.
// Double clicks are detected from the presses themselves: re-rendering under pointer capture means the
// browser never sends dblclick to a canvas.
import { nodeSpec, categoryOf, nodeName } from '../core/catalog.js';
import { getLanguage } from '../core/i18n.js';
import { chartSpec } from './views.js';
import { formatValue } from '../core/colormap.js';

export const NODE_W = 200;
const HEAD = 30;
const PORT_GAP = 22;
const PREVIEW_H = 44;
const FOOT = 18;
const PORT_R = 6;

export function nodeHeight(node, previews) {
  const spec = nodeSpec(node.type);
  const ports = Math.max(1, spec?.inputs.length ?? 1);
  return HEAD + ports * PORT_GAP + 6 + (previews ? PREVIEW_H : 0) + FOOT;
}

export class GraphEditor {
  constructor(host, callbacks) {
    this.host = host;
    this.cb = callbacks;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'view-canvas graph-canvas';
    this.canvas.dataset.testid = 'graph-canvas';
    this.canvas.tabIndex = 0;
    host.prepend(this.canvas);
    this.view = { ox: 40, oy: 40, scale: 1 };
    this.state = null;
    this.drag = null;
    this.hover = null;
    this.space = false;
    this.lastPress = { t: 0, x: 0, y: 0 };
    this.fitted = false;
    this.resize = new ResizeObserver(() => this.draw());
    this.resize.observe(host);
    this.bind();
  }

  destroy() {
    this.resize.disconnect();
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('keyup', this.onKeyUp);
    this.canvas.remove();
  }

  get scale() {
    return this.view.scale;
  }

  setState(state) {
    this.state = state;
    if (!this.fitted && state.model) {
      this.fitted = true;
      requestAnimationFrame(() => this.fit());
    }
    this.draw();
  }

  // ───────────────────────── coordinates
  toWorld(px, py) {
    return { x: (px - this.view.ox) / this.view.scale, y: (py - this.view.oy) / this.view.scale };
  }

  toScreen(x, y) {
    return { x: x * this.view.scale + this.view.ox, y: y * this.view.scale + this.view.oy };
  }

  local(event) {
    const r = this.canvas.getBoundingClientRect();
    return { px: event.clientX - r.left, py: event.clientY - r.top };
  }

  /** The middle of the visible area in world coordinates (where a new node goes). */
  center() {
    const r = this.canvas.getBoundingClientRect();
    return this.toWorld(r.width / 2, r.height / 2);
  }

  fit() {
    const model = this.state?.model;
    const r = this.canvas.getBoundingClientRect();
    if (!model || !r.width) return;
    if (!model.nodes.length) {
      this.view = { ox: 40, oy: 40, scale: 1 };
      this.draw();
      this.cb.onZoom?.();
      return;
    }
    const previews = this.state.settings.showPreviews;
    const x0 = Math.min(...model.nodes.map((n) => n.x));
    const y0 = Math.min(...model.nodes.map((n) => n.y));
    const x1 = Math.max(...model.nodes.map((n) => n.x + NODE_W));
    const y1 = Math.max(...model.nodes.map((n) => n.y + nodeHeight(n, previews)));
    const margin = 40;
    const scale = Math.min(1.4, Math.max(0.2, Math.min((r.width - margin * 2) / (x1 - x0), (r.height - margin * 2) / (y1 - y0))));
    this.view = { scale, ox: (r.width - (x1 - x0) * scale) / 2 - x0 * scale, oy: (r.height - (y1 - y0) * scale) / 2 - y0 * scale };
    this.draw();
    this.cb.onZoom?.();
  }

  resetView() {
    const r = this.canvas.getBoundingClientRect();
    const c = this.toWorld(r.width / 2, r.height / 2);
    this.view.scale = 1;
    this.view.ox = r.width / 2 - c.x;
    this.view.oy = r.height / 2 - c.y;
    this.draw();
    this.cb.onZoom?.();
  }

  zoomAt(factor, px = null, py = null) {
    const r = this.canvas.getBoundingClientRect();
    const x = px ?? r.width / 2;
    const y = py ?? r.height / 2;
    const before = this.toWorld(x, y);
    this.view.scale = Math.min(3, Math.max(0.15, this.view.scale * factor));
    this.view.ox = x - before.x * this.view.scale;
    this.view.oy = y - before.y * this.view.scale;
    this.draw();
    this.cb.onZoom?.();
  }

  /** Scrolls so the node is in view (selected from the tree). */
  reveal(id) {
    const n = this.state?.model.nodes.find((x) => x.id === id);
    if (!n) return;
    const r = this.canvas.getBoundingClientRect();
    const p = this.toScreen(n.x, n.y);
    const w = NODE_W * this.view.scale;
    if (p.x < 0 || p.y < 0 || p.x + w > r.width || p.y + 60 > r.height) {
      this.view.ox += r.width / 2 - (p.x + w / 2);
      this.view.oy += r.height / 2 - (p.y + 40);
      this.draw();
    }
  }

  // ───────────────────────── geometry and hit testing
  inPort(node, k) {
    return { x: node.x, y: node.y + HEAD + 12 + k * PORT_GAP };
  }

  outPort(node) {
    return { x: node.x + NODE_W, y: node.y + HEAD + 12 };
  }

  nodeAt(x, y) {
    const nodes = this.state?.model.nodes ?? [];
    const previews = this.state.settings.showPreviews;
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i];
      if (x >= n.x && x <= n.x + NODE_W && y >= n.y && y <= n.y + nodeHeight(n, previews)) return n;
    }
    return null;
  }

  portAt(x, y) {
    const tol = (PORT_R + 5) / this.view.scale;
    for (const n of [...(this.state?.model.nodes ?? [])].reverse()) {
      const o = this.outPort(n);
      if (Math.hypot(x - o.x, y - o.y) <= tol) return { node: n, kind: 'out' };
      const spec = nodeSpec(n.type);
      (spec?.inputs ?? []).forEach((p, k) => {
        const at = this.inPort(n, k);
        if (Math.hypot(x - at.x, y - at.y) <= tol) this._found = { node: n, kind: 'in', port: p.port, index: k };
      });
      if (this._found) {
        const f = this._found;
        this._found = null;
        return f;
      }
    }
    return null;
  }

  linkPath(link) {
    const nodes = this.state.model.nodes;
    const from = nodes.find((n) => n.id === link.from);
    const to = nodes.find((n) => n.id === link.to);
    if (!from || !to) return null;
    const spec = nodeSpec(to.type);
    const k = Math.max(0, spec?.inputs.findIndex((p) => p.port === link.toPort) ?? 0);
    const a = this.outPort(from);
    const b = this.inPort(to, k);
    return { a, b };
  }

  static bezier(a, b) {
    const dx = Math.max(40, Math.abs(b.x - a.x) * 0.5);
    return [a, { x: a.x + dx, y: a.y }, { x: b.x - dx, y: b.y }, b];
  }

  linkAt(x, y) {
    const tol = 6 / this.view.scale;
    for (const link of this.state?.model.links ?? []) {
      const path = this.linkPath(link);
      if (!path) continue;
      const [p0, p1, p2, p3] = GraphEditor.bezier(path.a, path.b);
      for (let i = 0; i <= 40; i++) {
        const t = i / 40;
        const u = 1 - t;
        const px = u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x;
        const py = u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y;
        if (Math.hypot(x - px, y - py) <= tol) return link;
      }
    }
    return null;
  }

  // ───────────────────────── input
  bind() {
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => this.down(e));
    c.addEventListener('pointermove', (e) => this.move(e));
    c.addEventListener('pointerup', (e) => this.up(e));
    c.addEventListener('pointercancel', () => { this.drag = null; this.draw(); });
    c.addEventListener('pointerleave', () => { if (!this.drag) { this.hover = null; this.cursor = null; this.draw(); } });
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      const { px, py } = this.local(e);
      if (e.ctrlKey || Math.abs(e.deltaY) >= Math.abs(e.deltaX)) this.zoomAt(Math.exp(-e.deltaY * 0.0015), px, py);
      else { this.view.ox -= e.deltaX; this.draw(); }
    }, { passive: false });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    // Nodes dragged in from the palette.
    c.addEventListener('dragover', (e) => {
      if ([...(e.dataTransfer?.types ?? [])].includes('application/x-mysim-node')) {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'copy';
      }
    });
    c.addEventListener('drop', (e) => {
      const type = e.dataTransfer?.getData('application/x-mysim-node');
      if (!type) return;
      e.preventDefault();
      e.stopPropagation();
      const { px, py } = this.local(e);
      const w = this.toWorld(px, py);
      this.cb.onDropNode?.(type, w.x - NODE_W / 2, w.y - 20);
    });
    this.onKey = (e) => { if (e.key === ' ' && document.activeElement === c) { this.space = true; e.preventDefault(); } };
    this.onKeyUp = (e) => { if (e.key === ' ') this.space = false; };
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('keyup', this.onKeyUp);
  }

  down(e) {
    if (!this.state?.model) return;
    this.canvas.focus({ preventScroll: true });
    const { px, py } = this.local(e);
    const w = this.toWorld(px, py);
    const now = performance.now();
    const double = e.button === 0 && now - this.lastPress.t < 380 && Math.hypot(px - this.lastPress.x, py - this.lastPress.y) < 6;
    this.lastPress = { t: double ? 0 : now, x: px, y: py };
    if (e.button === 1 || e.button === 2 || this.space) {
      this.drag = { kind: 'pan', sx: px, sy: py, ox: this.view.ox, oy: this.view.oy, moved: false, button: e.button, wx: w.x, wy: w.y };
      this.canvas.setPointerCapture(e.pointerId);
      return;
    }
    if (e.button !== 0) return;
    const port = this.portAt(w.x, w.y);
    if (port?.kind === 'out') {
      this.drag = { kind: 'link', from: port.node, x: w.x, y: w.y };
      this.canvas.setPointerCapture(e.pointerId);
      this.draw();
      return;
    }
    if (port?.kind === 'in') {
      const existing = this.state.model.links.find((l) => l.to === port.node.id && l.toPort === port.port);
      if (existing) {
        // Pick the link up from its input end: re-route it, or drop it on empty space to remove it.
        const from = this.state.model.nodes.find((n) => n.id === existing.from);
        this.drag = { kind: 'link', from, x: w.x, y: w.y, detached: existing };
        this.canvas.setPointerCapture(e.pointerId);
        this.draw();
        return;
      }
    }
    const node = this.nodeAt(w.x, w.y);
    if (node) {
      if (double) {
        this.cb.onOpenNode?.(node.id);
        return;
      }
      const sel = this.state.selection;
      const selected = sel?.kind === 'node' && sel.ids.includes(node.id);
      if (e.shiftKey || e.ctrlKey || e.metaKey) {
        this.cb.onSelect({ kind: 'node', ids: [node.id] }, true);
        return;
      }
      if (!selected) this.cb.onSelect({ kind: 'node', ids: [node.id] }, false);
      const ids = selected ? sel.ids : [node.id];
      this.drag = { kind: 'move', ids, sx: w.x, sy: w.y, dx: 0, dy: 0, moved: false };
      this.canvas.setPointerCapture(e.pointerId);
      return;
    }
    const link = this.linkAt(w.x, w.y);
    if (link) {
      this.cb.onSelect({ kind: 'link', ids: [link.id] }, false);
      return;
    }
    if (double) {
      this.cb.onAddAt?.(w.x - NODE_W / 2, w.y - 20, e.clientX, e.clientY);
      return;
    }
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      this.drag = { kind: 'box', x0: w.x, y0: w.y, x1: w.x, y1: w.y, additive: true };
    } else {
      // Empty space: grab the canvas and move it (a click without moving clears the selection).
      this.drag = { kind: 'pan', sx: px, sy: py, ox: this.view.ox, oy: this.view.oy, moved: false, button: 0, wx: w.x, wy: w.y };
      this.canvas.style.cursor = 'grabbing';
    }
    this.canvas.setPointerCapture(e.pointerId);
  }

  move(e) {
    if (!this.state?.model) return;
    const { px, py } = this.local(e);
    const w = this.toWorld(px, py);
    this.cb.onCursor?.(w);
    this.cursor = w;
    const d = this.drag;
    if (!d && this.state.settings.showRulers) requestAnimationFrame(() => this.draw());
    if (!d) {
      const port = this.portAt(w.x, w.y);
      const node = port ? null : this.nodeAt(w.x, w.y);
      const link = port || node ? null : this.linkAt(w.x, w.y);
      const hover = port ? `port:${port.node.id}:${port.kind}:${port.port ?? ''}` : node ? `node:${node.id}` : link ? `link:${link.id}` : null;
      this.canvas.style.cursor = port ? 'crosshair' : node ? 'move' : link ? 'pointer' : (e.shiftKey || e.ctrlKey || e.metaKey) && !this.space ? 'crosshair' : 'grab';
      if (hover !== this.hover) {
        this.hover = hover;
        this.draw();
      }
      return;
    }
    if (d.kind === 'pan') {
      if (Math.hypot(px - d.sx, py - d.sy) > 3) d.moved = true;
      this.view.ox = d.ox + (px - d.sx);
      this.view.oy = d.oy + (py - d.sy);
      this.canvas.style.cursor = 'grabbing';
      this.draw();
    } else if (d.kind === 'move') {
      let dx = w.x - d.sx;
      let dy = w.y - d.sy;
      if (this.state.settings.snap) {
        const g = this.gridMajor() / 5;
        const first = this.state.model.nodes.find((n) => n.id === d.ids[0]);
        if (first) {
          dx = Math.round((first.x + dx) / g) * g - first.x;
          dy = Math.round((first.y + dy) / g) * g - first.y;
        }
      }
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) d.moved = true;
      if (dx !== d.dx || dy !== d.dy) {
        d.dx = dx;
        d.dy = dy;
        this.canvas.style.cursor = 'grabbing';
        this.draw();
      }
    } else if (d.kind === 'link') {
      d.x = w.x;
      d.y = w.y;
      this.draw();
    } else if (d.kind === 'box') {
      d.x1 = w.x;
      d.y1 = w.y;
      this.draw();
    }
  }

  up(e) {
    const d = this.drag;
    this.drag = null;
    if (!d || !this.state?.model) return;
    const { px, py } = this.local(e);
    const w = this.toWorld(px, py);
    if (d.kind === 'pan') {
      if (!d.moved && d.button === 2) {
        // A right click (no drag): the context menu of what is under it.
        const node = this.nodeAt(d.wx, d.wy);
        const link = node ? null : this.linkAt(d.wx, d.wy);
        if (node) {
          const sel = this.state.selection;
          if (!(sel?.kind === 'node' && sel.ids.includes(node.id))) this.cb.onSelect({ kind: 'node', ids: [node.id] }, false);
          this.cb.onContext?.('node', e.clientX, e.clientY);
        } else if (link) {
          this.cb.onSelect({ kind: 'link', ids: [link.id] }, false);
          this.cb.onContext?.('link', e.clientX, e.clientY);
        } else this.cb.onContext?.('canvas', e.clientX, e.clientY, d.wx, d.wy);
      }
      if (!d.moved && d.button === 0) this.cb.onSelect(null, false);
      this.canvas.style.cursor = 'grab';
      this.cb.onZoom?.();
    } else if (d.kind === 'move') {
      if (d.moved) this.cb.onMoveNodes?.(d.ids, d.dx, d.dy);
      this.canvas.style.cursor = 'move';
    } else if (d.kind === 'link') {
      const port = this.portAt(w.x, w.y);
      let target = port?.kind === 'in' ? { node: port.node, port: port.port } : null;
      if (!target) {
        // Dropped on a node body: its first free input (or the first one).
        const node = this.nodeAt(w.x, w.y);
        const spec = node ? nodeSpec(node.type) : null;
        if (node && spec?.inputs.length && node.id !== d.from.id) {
          const free = spec.inputs.find((p) => !this.state.model.links.some((l) => l.to === node.id && l.toPort === p.port));
          target = { node, port: (free ?? spec.inputs[0]).port };
        }
      }
      if (target && target.node.id !== d.from.id) this.cb.onConnect?.(d.from.id, target.node.id, target.port, d.detached?.id ?? null);
      else if (d.detached) this.cb.onDisconnect?.(d.detached.id);
      else if (!target) this.cb.onLinkToEmpty?.(d.from.id, w.x, w.y, e.clientX, e.clientY);
    } else if (d.kind === 'box') {
      const x0 = Math.min(d.x0, d.x1); const x1 = Math.max(d.x0, d.x1);
      const y0 = Math.min(d.y0, d.y1); const y1 = Math.max(d.y0, d.y1);
      const previews = this.state.settings.showPreviews;
      const ids = this.state.model.nodes.filter((n) => n.x < x1 && n.x + NODE_W > x0 && n.y < y1 && n.y + nodeHeight(n, previews) > y0).map((n) => n.id);
      if (Math.abs(x1 - x0) < 3 && Math.abs(y1 - y0) < 3) this.cb.onSelect(null, false);
      else {
        // Shift/Ctrl + box adds the boxed nodes to the selection (no toggling off).
        const sel = this.state.selection;
        const all = d.additive && sel?.kind === 'node' ? [...new Set([...sel.ids, ...ids])] : ids;
        this.cb.onSelect(all.length ? { kind: 'node', ids: all } : null, false);
      }
    }
    this.draw();
  }

  // ───────────────────────── drawing
  colors() {
    const css = getComputedStyle(this.canvas);
    const v = (name, fallback) => css.getPropertyValue(name).trim() || fallback;
    return {
      bg: v('--bg', '#1e1e1e'), panel: v('--panel', '#2a2a2a'), alt: v('--panel-alt', '#252525'), line: v('--line', '#444'), text: v('--text', '#ddd'),
      muted: v('--muted', '#999'), accent: v('--accent', '#4fb3ff'), danger: v('--danger', '#ff6b6b'), a: v('--viewport-a', '#333'), b: v('--viewport-b', '#111'),
      gridMajor: v('--grid-major', '#555'), gridMinor: v('--grid-minor', '#333'),
    };
  }

  draw() {
    const canvas = this.canvas;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !this.state?.model) return;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(rect.width * dpr) || canvas.height !== Math.round(rect.height * dpr)) {
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const c = this.colors();
    const grad = ctx.createRadialGradient(rect.width / 2, rect.height / 2, 0, rect.width / 2, rect.height / 2, Math.hypot(rect.width, rect.height) / 1.6);
    grad.addColorStop(0, c.a);
    grad.addColorStop(1, c.b);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, rect.width, rect.height);
    const { scale, ox, oy } = this.view;
    if (this.state.settings.showGrid) {
      // A 5 × 5 grid: major lines, each cell split into 5 × 5 minor cells. The major spacing follows the zoom
      // (20, 50, 100, 200 … units) so a cell stays 80–200 px wide; the rulers use the same spacing.
      const major = this.gridMajor();
      const lines = (step, color, alpha, width) => {
        const px = step * scale;
        ctx.strokeStyle = color;
        ctx.globalAlpha = alpha;
        ctx.lineWidth = width;
        ctx.beginPath();
        for (let x = ((ox % px) + px) % px; x < rect.width; x += px) { ctx.moveTo(Math.round(x) + 0.5, 0); ctx.lineTo(Math.round(x) + 0.5, rect.height); }
        for (let y = ((oy % px) + px) % px; y < rect.height; y += px) { ctx.moveTo(0, Math.round(y) + 0.5); ctx.lineTo(rect.width, Math.round(y) + 0.5); }
        ctx.stroke();
      };
      lines(major / 5, c.gridMinor, 0.38, 1);
      lines(major, c.gridMajor, 0.6, 1);
      ctx.globalAlpha = 1;
    }
    ctx.save();
    ctx.translate(ox, oy);
    ctx.scale(scale, scale);
    const model = this.state.model;
    const d = this.drag;
    const moved = (n) => (d?.kind === 'move' && d.ids.includes(n.id) ? { ...n, x: n.x + d.dx, y: n.y + d.dy } : n);
    const nodes = model.nodes.map(moved);
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const sel = this.state.selection;
    // Links under the nodes.
    for (const link of model.links) {
      if (d?.kind === 'link' && d.detached?.id === link.id) continue;
      const from = byId.get(link.from);
      const to = byId.get(link.to);
      if (!from || !to) continue;
      const spec = nodeSpec(to.type);
      const k = Math.max(0, spec?.inputs.findIndex((p) => p.port === link.toPort) ?? 0);
      const a = this.outPort(from);
      const b = this.inPort(to, k);
      const selected = sel?.kind === 'link' && sel.ids.includes(link.id);
      const hot = this.hover === `link:${link.id}`;
      const out = this.state.results?.get(link.from);
      ctx.strokeStyle = selected ? c.accent : out && !out.ok ? c.danger : categoryOf(from.type).color;
      ctx.globalAlpha = selected || hot ? 1 : 0.75;
      ctx.lineWidth = (selected ? 3.2 : hot ? 2.6 : 2) / Math.max(0.6, scale);
      const [p0, p1, p2, p3] = GraphEditor.bezier(a, b);
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.bezierCurveTo(p1.x, p1.y, p2.x, p2.y, p3.x, p3.y);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (d?.kind === 'link') {
      const from = byId.get(d.from.id);
      const a = this.outPort(from);
      const [p0, p1, p2, p3] = GraphEditor.bezier(a, { x: d.x, y: d.y });
      ctx.strokeStyle = c.accent;
      ctx.setLineDash([6, 4]);
      ctx.lineWidth = 2 / Math.max(0.6, scale);
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.bezierCurveTo(p1.x, p1.y, p2.x, p2.y, p3.x, p3.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    for (const n of nodes) this.drawNode(ctx, n, c, sel?.kind === 'node' && sel.ids.includes(n.id));
    ctx.restore();
    if (this.state.settings.showRulers) this.drawRulers(ctx, rect, c);
    if (d?.kind === 'box') {
      const a = this.toScreen(Math.min(d.x0, d.x1), Math.min(d.y0, d.y1));
      const b = this.toScreen(Math.max(d.x0, d.x1), Math.max(d.y0, d.y1));
      ctx.fillStyle = c.accent;
      ctx.globalAlpha = 0.12;
      ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = c.accent;
      ctx.setLineDash([5, 4]);
      ctx.strokeRect(a.x + 0.5, a.y + 0.5, b.x - a.x, b.y - a.y);
      ctx.setLineDash([]);
    }
    if (!model.nodes.length) {
      ctx.fillStyle = c.muted;
      ctx.font = '14px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      const lines = this.cb.emptyHint?.() ?? [];
      lines.forEach((line, i) => ctx.fillText(line, rect.width / 2, rect.height / 2 - 10 + i * 22));
    }
  }

  /** The major grid spacing in canvas units: the smallest of 20, 50, 100, 200 … that is at least 80 px on screen. */
  gridMajor() {
    const steps = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000];
    return steps.find((s) => s * this.view.scale >= 80) ?? 20000;
  }

  /** Rulers along the top and the left edge in canvas units, with the cursor and the selection marked. */
  drawRulers(ctx, rect, c) {
    const T = 20;
    const { scale, ox, oy } = this.view;
    // The grid's spacing: a labelled tick on every major line, a small one on every minor line (5 per cell).
    const major = this.gridMajor();
    const minor = major / 5;
    ctx.save();
    ctx.fillStyle = c.panel;
    ctx.fillRect(0, 0, rect.width, T);
    ctx.fillRect(0, 0, T, rect.height);
    ctx.strokeStyle = c.line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, T + 0.5); ctx.lineTo(rect.width, T + 0.5);
    ctx.moveTo(T + 0.5, 0); ctx.lineTo(T + 0.5, rect.height);
    ctx.stroke();
    // The selected nodes' extent.
    const sel = this.state.selection;
    if (sel?.kind === 'node') {
      const nodes = this.state.model.nodes.filter((n) => sel.ids.includes(n.id));
      if (nodes.length) {
        const previews = this.state.settings.showPreviews;
        const a = this.toScreen(Math.min(...nodes.map((n) => n.x)), Math.min(...nodes.map((n) => n.y)));
        const b = this.toScreen(Math.max(...nodes.map((n) => n.x + NODE_W)), Math.max(...nodes.map((n) => n.y + nodeHeight(n, previews))));
        ctx.fillStyle = c.accent;
        ctx.globalAlpha = 0.22;
        ctx.fillRect(Math.max(T, a.x), 0, Math.max(0, b.x - Math.max(T, a.x)), T);
        ctx.fillRect(0, Math.max(T, a.y), T, Math.max(0, b.y - Math.max(T, a.y)));
        ctx.globalAlpha = 1;
      }
    }
    ctx.font = '9.5px "Segoe UI", sans-serif';
    ctx.fillStyle = c.muted;
    ctx.strokeStyle = c.muted;
    ctx.beginPath();
    const x0 = Math.floor((T - ox) / scale / minor) * minor;
    for (let w = x0; w * scale + ox < rect.width; w += minor) {
      const x = Math.round(w * scale + ox) + 0.5;
      if (x < T) continue;
      const isMajor = Math.abs(w / major - Math.round(w / major)) < 1e-9;
      ctx.moveTo(x, isMajor ? 6 : 14); ctx.lineTo(x, T);
      if (isMajor) { ctx.textAlign = 'left'; ctx.fillText(String(Math.round(w)), x + 2, 9); }
    }
    const y0 = Math.floor((T - oy) / scale / minor) * minor;
    for (let w = y0; w * scale + oy < rect.height; w += minor) {
      const y = Math.round(w * scale + oy) + 0.5;
      if (y < T) continue;
      const isMajor = Math.abs(w / major - Math.round(w / major)) < 1e-9;
      ctx.moveTo(isMajor ? 6 : 14, y); ctx.lineTo(T, y);
      if (isMajor) {
        ctx.save();
        ctx.translate(9, y + 2);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign = 'right';
        ctx.fillText(String(Math.round(w)), 0, 0);
        ctx.restore();
      }
    }
    ctx.stroke();
    // The cursor.
    if (this.cursor) {
      const p = this.toScreen(this.cursor.x, this.cursor.y);
      ctx.strokeStyle = c.accent;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      if (p.x > T) { ctx.moveTo(p.x, 0); ctx.lineTo(p.x, T); }
      if (p.y > T) { ctx.moveTo(0, p.y); ctx.lineTo(T, p.y); }
      ctx.stroke();
    }
    ctx.fillStyle = c.panel;
    ctx.fillRect(0, 0, T, T);
    ctx.restore();
  }

  drawNode(ctx, n, c, selected) {
    const spec = nodeSpec(n.type);
    const cat = categoryOf(n.type);
    const previews = this.state.settings.showPreviews;
    const hgt = nodeHeight(n, previews);
    const out = this.state.results?.get(n.id);
    const running = this.state.running?.has?.(n.id);
    const stale = this.state.stale?.has?.(n.id);
    const r = 8;
    ctx.save();
    ctx.globalAlpha = n.disabled ? 0.5 : 1;
    // Shadow, body, header strip.
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 3;
    ctx.fillStyle = c.panel;
    roundRect(ctx, n.x, n.y, NODE_W, hgt, r);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = cat.color;
    ctx.globalAlpha = (n.disabled ? 0.5 : 1) * 0.9;
    roundRect(ctx, n.x, n.y, NODE_W, HEAD, [r, r, 0, 0]);
    ctx.fill();
    ctx.globalAlpha = n.disabled ? 0.5 : 1;
    // Border: accent when selected, red on error.
    ctx.lineWidth = selected ? 2.5 : 1;
    ctx.strokeStyle = selected ? c.accent : out && !out.ok && !out.skipped ? c.danger : c.line;
    roundRect(ctx, n.x, n.y, NODE_W, hgt, r);
    ctx.stroke();
    // Header: icon and name.
    ctx.fillStyle = '#10141a';
    ctx.font = '600 13px "Segoe UI", "Malgun Gothic", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const icon = spec?.icon ?? '?';
    ctx.fillText(icon, n.x + 9, n.y + HEAD / 2 + 1);
    const name = n.name || (spec ? nodeName(spec, getLanguage()) : n.type);
    ctx.fillText(clip(ctx, name, NODE_W - 58), n.x + 30, n.y + HEAD / 2 + 1);
    // Status badge.
    const badge = running ? ['⟳', c.accent] : n.disabled ? ['⊘', c.muted] : !out ? (stale ? ['○', c.muted] : null) : out.ok ? (out.warnings.length ? ['⚠', '#f5c542'] : ['✓', '#2fb15a']) : out.skipped ? ['–', c.muted] : ['✕', c.danger];
    if (badge) {
      ctx.fillStyle = '#ffffffd0';
      ctx.beginPath();
      ctx.arc(n.x + NODE_W - 15, n.y + HEAD / 2, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = badge[1];
      ctx.font = '700 12px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(badge[0], n.x + NODE_W - 15, n.y + HEAD / 2 + 1);
    }
    // Input ports with labels, the output port.
    ctx.font = '11px "Segoe UI", "Malgun Gothic", sans-serif';
    const lang = getLanguage();
    (spec?.inputs ?? []).forEach((p, k) => {
      const at = this.inPort(n, k);
      const linked = this.state.model.links.some((l) => l.to === n.id && l.toPort === p.port);
      const hot = this.hover === `port:${n.id}:in:${p.port}`;
      ctx.beginPath();
      ctx.arc(at.x, at.y, hot ? PORT_R + 2 : PORT_R, 0, Math.PI * 2);
      ctx.fillStyle = linked ? cat.color : c.panel;
      ctx.fill();
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = p.optional && !linked ? c.muted : cat.color;
      ctx.stroke();
      ctx.fillStyle = c.muted;
      ctx.textAlign = 'left';
      ctx.fillText(clip(ctx, lang === 'en' ? p.en : p.ko, NODE_W / 2), at.x + 11, at.y);
    });
    const o = this.outPort(n);
    const hotOut = this.hover === `port:${n.id}:out:`;
    ctx.beginPath();
    ctx.arc(o.x, o.y, hotOut ? PORT_R + 2 : PORT_R, 0, Math.PI * 2);
    ctx.fillStyle = cat.color;
    ctx.fill();
    ctx.strokeStyle = c.panel;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // Preview: a sparkline of the first series, a heat map of a grid, or the first result value.
    const top = n.y + HEAD + Math.max(1, spec?.inputs.length ?? 1) * PORT_GAP + 4;
    if (previews) this.drawPreview(ctx, n, out, n.x + 8, top, NODE_W - 16, PREVIEW_H - 6, c, cat.color);
    // Footer: a summary of the result or the error.
    ctx.font = '10.5px "Segoe UI", "Malgun Gothic", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = out && !out.ok ? c.danger : c.muted;
    const foot = this.cb.footer?.(n, out) ?? '';
    ctx.fillText(clip(ctx, foot, NODE_W - 16), n.x + 8, n.y + hgt - FOOT / 2 - 1);
    ctx.restore();
  }

  drawPreview(ctx, node, out, x, y, w, hgt, c, color) {
    ctx.fillStyle = c.alt;
    roundRect(ctx, x, y, w, hgt, 4);
    ctx.fill();
    if (!out?.ok) return;
    const key = `${out.id}:${node.type}:${JSON.stringify(node.type === 'out.plot' ? node.params : {})}`;
    let spark = this.sparkCache?.get(out);
    if (!spark || spark.key !== key) {
      spark = { key, data: sparkData(out, node) };
      this.sparkCache ??= new WeakMap();
      this.sparkCache.set(out, spark);
    }
    const s = spark.data;
    if (s?.kind === 'line') {
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, w, hgt);
      ctx.clip();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      s.points.forEach(([px, py], i) => {
        const X = x + 2 + px * (w - 4);
        const Y = y + hgt - 3 - py * (hgt - 6);
        if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y);
      });
      ctx.stroke();
      ctx.restore();
    } else if (s?.kind === 'grid') {
      ctx.drawImage(s.image, x + 1, y + 1, w - 2, hgt - 2);
    } else if (s?.kind === 'value') {
      ctx.fillStyle = c.text;
      ctx.font = '600 15px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(clip(ctx, s.text, w - 8), x + w / 2, y + hgt / 2 - 6);
      ctx.font = '10px "Segoe UI", sans-serif';
      ctx.fillStyle = c.muted;
      ctx.fillText(clip(ctx, s.label, w - 8), x + w / 2, y + hgt - 8);
    }
  }

  toBlob() {
    return new Promise((resolve) => this.canvas.toBlob(resolve, 'image/png'));
  }
}

/** Normalised points (0…1) of an output's first series, a small image of its grid, or its first value. */
function sparkData(out, node) {
  if (node.type === 'out.kpi' || (!out.tables.length && !out.grids.length && out.scalars.length)) {
    const s = out.scalars[0];
    return s ? { kind: 'value', text: `${formatValue(s.value, 5)}${s.unit ? ` ${s.unit}` : ''}`, label: s.name } : null;
  }
  const spec = chartSpec(out, node.type === 'out.plot' ? node.params : {}, node.type);
  if (spec.kind === 'heatmap') {
    const g = spec.grid;
    const nx = g.x.length;
    const ny = g.y.length;
    const stepX = Math.max(1, Math.floor(nx / 80));
    const stepY = Math.max(1, Math.floor(ny / 30));
    const W = Math.ceil(nx / stepX);
    const H = Math.ceil(ny / stepY);
    let lo = Infinity; let hi = -Infinity;
    for (const v of g.z) if (Number.isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const img = canvas.getContext('2d').createImageData(W, H);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const v = g.z[(j * stepY) * nx + i * stepX];
      const t = Number.isFinite(v) ? (v - lo) / (hi - lo || 1) : 0;
      const at = ((H - 1 - j) * W + i) * 4;
      img.data[at] = Math.round(40 + 215 * t); img.data[at + 1] = Math.round(60 + 120 * Math.sin(Math.PI * t)); img.data[at + 2] = Math.round(200 - 170 * t); img.data[at + 3] = 255;
    }
    canvas.getContext('2d').putImageData(img, 0, 0);
    return { kind: 'grid', image: canvas };
  }
  if (spec.kind === 'bars') {
    const vals = spec.bars.map((b) => b.value).filter(Number.isFinite);
    if (!vals.length) return null;
    const lo = Math.min(0, ...vals); const hi = Math.max(...vals);
    return { kind: 'line', points: vals.map((v, i) => [vals.length > 1 ? i / (vals.length - 1) : 0.5, (v - lo) / (hi - lo || 1)]) };
  }
  if (spec.kind !== 'xy' || !spec.series.length) {
    const s = out.scalars[0];
    return s ? { kind: 'value', text: `${formatValue(s.value, 5)}${s.unit ? ` ${s.unit}` : ''}`, label: s.name } : null;
  }
  const pts = spec.series[0].points;
  const n = pts.length;
  const step = Math.max(1, Math.floor(n / 120));
  const sample = [];
  for (let i = 0; i < n; i += step) if (Number.isFinite(pts[i][0]) && Number.isFinite(pts[i][1])) sample.push(pts[i]);
  if (sample.length < 2) return null;
  let x0 = Infinity; let x1 = -Infinity; let y0 = Infinity; let y1 = -Infinity;
  for (const [x, y] of sample) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const ordered = spec.opts?.mode === 'scatter' ? sample : sample;
  return { kind: 'line', points: ordered.map(([x, y]) => [(x - x0) / (x1 - x0 || 1), (y - y0) / (y1 - y0 || 1)]) };
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

function clip(ctx, text, max) {
  const s = String(text ?? '');
  if (ctx.measureText(s).width <= max) return s;
  let lo = 0; let hi = s.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (ctx.measureText(`${s.slice(0, mid)}…`).width <= max) lo = mid; else hi = mid - 1;
  }
  return `${s.slice(0, lo)}…`;
}
