// The 2D editor and animation: a canvas that draws the model to scale (metres)
// and lets the user build it with the mouse — drop blocks from the library,
// drag them, connect output ports to input ports, draw conveyors, roads and
// walls point by point, bend links, resize areas, pan and zoom. While the
// simulation runs it animates entities, vehicles, workers and agents on the
// same drawing and colours every block by its state.
//
// The canvas never changes the model itself: it calls the app (`api`) with
// what the user did, and the app records it as an undoable change.
import { BLOCK_TYPES, baseOf, blockBounds, isPathType, isSd, pathPoints, portsOf } from '../sim/blocks.js';
import { icon } from '../icons.js';

const TAU = Math.PI * 2;
const STATE_COLORS = { idle: '#eab308', busy: '#22c55e', blocked: '#f97316', failed: '#ef4444', setup: '#8b5cf6' };
const snapTo = (v, step) => (step > 0 ? Math.round(v / step) * step : v);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/** SVG icon → Image in a colour (cached), for drawing block glyphs on the canvas. */
const glyphs = new Map();
function glyph(name, color, onload) {
  const key = `${name}|${color}`;
  let img = glyphs.get(key);
  if (!img) {
    const svg = icon(name).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" ').replaceAll('currentColor', color);
    img = new Image();
    img.onload = () => onload?.();
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    glyphs.set(key, img);
  }
  return img;
}

function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax; const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  const t = l2 ? clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export class Canvas2D {
  constructor(host, api) {
    this.host = host;
    this.api = api;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'flow-canvas';
    this.canvas.tabIndex = 0;
    host.append(this.canvas);
    this.tip = document.createElement('div');
    this.tip.className = 'canvas-tip';
    this.tip.hidden = true;
    host.append(this.tip);
    this.ctx = this.canvas.getContext('2d');
    this.view = { cx: 0, cy: 0, scale: 18 };
    this.tool = 'select';
    this.placing = null; // { type, points: [] }
    this.drag = null;
    this.hover = null;
    this.mouse = { x: 0, y: 0, wx: 0, wy: 0, inside: false };
    this.options = { grid: true, snap: 0.5, ports: true, labels: true, heat: false, links: true };
    this.colors = {};
    this.dirty = true;
    this.spaceDown = false;
    this.sdMax = new Map();
    this.readTheme();
    this.bind();
    this.resize();
  }

  // ───────────── geometry
  get dpr() { return window.devicePixelRatio || 1; }
  toScreen(x, y) { return [(x - this.view.cx) * this.view.scale + this.width / 2, (y - this.view.cy) * this.view.scale + this.height / 2]; }
  toWorld(sx, sy) { return [(sx - this.width / 2) / this.view.scale + this.view.cx, (sy - this.height / 2) / this.view.scale + this.view.cy]; }
  eventPoint(e) { const r = this.canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
  snap(v) { return this.options.snap > 0 && !this.altDown ? snapTo(v, this.options.snap) : v; }

  resize() {
    const r = this.host.getBoundingClientRect();
    this.width = Math.max(10, r.width); this.height = Math.max(10, r.height);
    this.canvas.width = Math.round(this.width * this.dpr); this.canvas.height = Math.round(this.height * this.dpr);
    this.canvas.style.width = `${this.width}px`; this.canvas.style.height = `${this.height}px`;
    this.dirty = true;
  }

  readTheme() {
    const css = getComputedStyle(document.documentElement);
    const v = (name, fallback) => css.getPropertyValue(name).trim() || fallback;
    this.colors = {
      bg: v('--canvas-bg', v('--bg', '#f8fafc')), text: v('--text', '#0f172a'), muted: v('--muted', '#64748b'), border: v('--border', '#cbd5e1'),
      surface: v('--surface', '#ffffff'), accent: v('--accent', '#2563eb'), panel: v('--panel', '#f1f5f9'), danger: v('--danger', '#dc2626'),
      grid: v('--canvas-grid', 'rgba(100,116,139,0.13)'), gridMajor: v('--canvas-grid-major', 'rgba(100,116,139,0.26)'),
      dark: document.documentElement.dataset.dark === 'true' || css.colorScheme === 'dark',
    };
    this.dirty = true;
  }

  /** Fits the whole model (or `bounds`) in the view. */
  fit(bounds = null, padding = 40) {
    const model = this.api.model();
    if (!model) return;
    let b = bounds;
    if (!b) {
      if (!model.blocks.length) { this.view = { cx: 0, cy: 0, scale: 18 }; this.dirty = true; return; }
      b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
      for (const block of model.blocks) { const q = blockBounds(block); b.x0 = Math.min(b.x0, q.x0); b.y0 = Math.min(b.y0, q.y0); b.x1 = Math.max(b.x1, q.x1); b.y1 = Math.max(b.y1, q.y1); }
    }
    const w = Math.max(1, b.x1 - b.x0); const h = Math.max(1, b.y1 - b.y0);
    this.view.scale = clamp(Math.min((this.width - padding * 2) / w, (this.height - padding * 2) / h), 1, 200);
    this.view.cx = (b.x0 + b.x1) / 2; this.view.cy = (b.y0 + b.y1) / 2;
    this.dirty = true;
    this.api.onView?.();
  }

  zoomBy(factor, sx = this.width / 2, sy = this.height / 2) {
    const [wx, wy] = this.toWorld(sx, sy);
    this.view.scale = clamp(this.view.scale * factor, 0.5, 400);
    const [nx, ny] = this.toWorld(sx, sy);
    this.view.cx += wx - nx; this.view.cy += wy - ny;
    this.dirty = true;
    this.api.onView?.();
  }
  setZoomPercent(percent) { this.view.scale = clamp((18 * percent) / 100, 0.5, 400); this.dirty = true; this.api.onView?.(); }
  get zoomPercent() { return Math.round((this.view.scale / 18) * 100); }

  setTool(tool) { this.tool = tool; this.placing = tool === 'place' ? this.placing : null; this.canvas.dataset.tool = tool; this.dirty = true; }
  /** Starts placing a block type: click to drop it; path types take one click per point (double-click / Enter ends). */
  startPlace(type) { this.placing = { type, points: [] }; this.tool = 'place'; this.canvas.dataset.tool = 'place'; this.canvas.focus(); this.dirty = true; }
  cancelPlace() { if (!this.placing) return false; this.placing = null; this.tool = 'select'; this.canvas.dataset.tool = 'select'; this.dirty = true; this.api.onToolChange?.('select'); return true; }

  // ───────────── hit testing
  blockAt(wx, wy, { includeLayout = true } = {}) {
    const model = this.api.model();
    if (!model) return null;
    const tol = 6 / this.view.scale;
    const order = [...model.blocks].reverse();
    // Things above areas first: areas (zones, populations, charts) are picked last.
    const area = (b) => ['zone', 'population', 'chart', 'cellGrid'].includes(baseOf(b.type));
    for (const pass of [0, 1]) {
      for (const b of order) {
        if ((pass === 0) === area(b)) continue;
        if (!includeLayout && BLOCK_TYPES[b.type].cat === 'layout') continue;
        if (isPathType(b.type)) {
          const pts = pathPoints(b);
          const base = baseOf(b.type);
          const half = base === 'road' ? (Number(b.props.lanes) || 1) * 1.75 : base === 'wall' ? Math.max(0.15, Number(b.props.thickness) / 2) : (Number(b.props.width) || 0.8) / 2;
          for (let i = 1; i < pts.length; i++) if (distToSegment(wx, wy, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]) <= half + tol) return b;
          continue;
        }
        const w = b.w ?? BLOCK_TYPES[b.type].w; const h = b.h ?? BLOCK_TYPES[b.type].h;
        const r = -((b.rot ?? 0) * Math.PI) / 180;
        const dx = wx - b.x; const dy = wy - b.y;
        const lx = dx * Math.cos(r) - dy * Math.sin(r); const ly = dx * Math.sin(r) + dy * Math.cos(r);
        if (Math.abs(lx) <= w / 2 + tol && Math.abs(ly) <= h / 2 + tol) return b;
      }
    }
    return null;
  }

  portAt(wx, wy, side = 'out') {
    const model = this.api.model();
    const tol = Math.max(0.35, 8 / this.view.scale);
    let best = null;
    for (const b of model?.blocks ?? []) {
      const ports = portsOf(b)[side === 'out' ? 'outs' : 'ins'];
      ports.forEach((p, i) => { const d = Math.hypot(p.x - wx, p.y - wy); if (d <= tol && (!best || d < best.d)) best = { block: b, port: i, d, p }; });
    }
    return best;
  }

  linkPath(link) {
    const model = this.api.model();
    const a = model.blocks.find((b) => b.id === link.from.block); const b = model.blocks.find((x) => x.id === link.to.block);
    if (!a || !b) return null;
    const anchor = (block, port, side) => {
      if (port >= 0) { const list = portsOf(block)[side]; const p = list[port] ?? list[0]; if (p) return p; }
      return { x: block.x, y: block.y, nx: 0, ny: 0, body: true };
    };
    const sdBody = (blk) => isSd(blk.type) && (blk.type === 'stock' || link.kind === 'influence');
    let p0 = sdBody(a) || link.kind === 'influence' ? { x: a.x, y: a.y, nx: 0, ny: 0, body: true } : anchor(a, link.from.port, 'outs');
    let p1 = sdBody(b) || link.kind === 'influence' ? { x: b.x, y: b.y, nx: 0, ny: 0, body: true } : anchor(b, link.to.port, 'ins');
    // Body ends stop at the block's edge.
    const edge = (blk, from, to) => {
      const bb = blockBounds(blk); const hw = (bb.x1 - bb.x0) / 2; const hh = (bb.y1 - bb.y0) / 2;
      const dx = to.x - from.x; const dy = to.y - from.y;
      const t = Math.min(hw / (Math.abs(dx) || 1e-9), hh / (Math.abs(dy) || 1e-9), 1);
      return { x: from.x + dx * t, y: from.y + dy * t, nx: 0, ny: 0, body: true };
    };
    if (p0.body) p0 = edge(a, p0, link.points?.[0] ? { x: link.points[0][0], y: link.points[0][1] } : p1);
    if (p1.body) p1 = edge(b, p1, link.points?.length ? { x: link.points[link.points.length - 1][0], y: link.points[link.points.length - 1][1] } : p0);
    return { p0, p1, points: link.points ?? [] };
  }

  /** Points along a link (for drawing and picking): straight through bends, a smooth curve without. */
  linkPolyline(link) {
    const path = this.linkPath(link);
    if (!path) return [];
    const { p0, p1, points } = path;
    if (points.length) return [[p0.x, p0.y], ...points, [p1.x, p1.y]];
    if (link.kind === 'influence') {
      const mx = (p0.x + p1.x) / 2; const my = (p0.y + p1.y) / 2;
      const dx = p1.x - p0.x; const dy = p1.y - p0.y; const L = Math.hypot(dx, dy) || 1;
      const cx = mx - (dy / L) * L * 0.18; const cy = my + (dx / L) * L * 0.18;
      const out = [];
      for (let i = 0; i <= 16; i++) { const t = i / 16; out.push([(1 - t) ** 2 * p0.x + 2 * (1 - t) * t * cx + t * t * p1.x, (1 - t) ** 2 * p0.y + 2 * (1 - t) * t * cy + t * t * p1.y]); }
      return out;
    }
    const L = Math.hypot(p1.x - p0.x, p1.y - p0.y);
    const k = Math.min(L * 0.4, 6);
    const c0 = [p0.x + p0.nx * k, p0.y + p0.ny * k]; const c1 = [p1.x + p1.nx * k, p1.y + p1.ny * k];
    if (p0.body || p1.body || L < 0.01) return [[p0.x, p0.y], [p1.x, p1.y]];
    const out = [];
    for (let i = 0; i <= 20; i++) {
      const t = i / 20; const u = 1 - t;
      out.push([u ** 3 * p0.x + 3 * u * u * t * c0[0] + 3 * u * t * t * c1[0] + t ** 3 * p1.x, u ** 3 * p0.y + 3 * u * u * t * c0[1] + 3 * u * t * t * c1[1] + t ** 3 * p1.y]);
    }
    return out;
  }

  linkAt(wx, wy) {
    const model = this.api.model();
    const tol = 6 / this.view.scale;
    for (const l of [...(model?.links ?? [])].reverse()) {
      const pts = this.linkPolyline(l);
      for (let i = 1; i < pts.length; i++) if (distToSegment(wx, wy, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]) <= tol) return { link: l, segment: i - 1 };
    }
    return null;
  }

  /** Handles of the single selected block or link: path vertices, link bends, resize corners. */
  handleAt(wx, wy) {
    const sel = this.api.selection();
    if (sel.length !== 1) return null;
    const model = this.api.model();
    const tol = Math.max(0.25, 7 / this.view.scale);
    const block = model.blocks.find((b) => b.id === sel[0]);
    if (block) {
      if (isPathType(block.type)) {
        const pts = pathPoints(block);
        for (let i = 0; i < pts.length; i++) if (Math.hypot(pts[i][0] - wx, pts[i][1] - wy) <= tol) return { kind: 'vertex', block, index: i };
      } else if (BLOCK_TYPES[block.type].resizable) {
        const w = block.w; const h = block.h;
        for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) if (Math.hypot(block.x + (sx * w) / 2 - wx, block.y + (sy * h) / 2 - wy) <= tol) return { kind: 'resize', block, sx, sy };
      }
      return null;
    }
    const link = model.links.find((l) => l.id === sel[0]);
    if (link) for (let i = 0; i < (link.points ?? []).length; i++) if (Math.hypot(link.points[i][0] - wx, link.points[i][1] - wy) <= tol) return { kind: 'bend', link, index: i };
    return null;
  }

  // ───────────── events
  bind() {
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => this.onDown(e));
    c.addEventListener('pointermove', (e) => this.onMove(e));
    c.addEventListener('pointerup', (e) => this.onUp(e));
    c.addEventListener('pointercancel', () => { this.drag = null; this.dirty = true; });
    c.addEventListener('pointerleave', () => { this.mouse.inside = false; this.tip.hidden = true; this.setHover(null); this.dirty = true; });
    c.addEventListener('dblclick', (e) => this.onDouble(e));
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      const [sx, sy] = this.eventPoint(e);
      if (e.shiftKey && !e.ctrlKey) { this.view.cx += (e.deltaY / this.view.scale) * 0.6; this.dirty = true; return; }
      this.zoomBy(Math.exp(-e.deltaY * 0.0015), sx, sy);
    }, { passive: false });
    c.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (this.placing?.points.length >= 2) { this.finishPath(); return; }
      if (this.cancelPlace()) return;
      const [sx, sy] = this.eventPoint(e); const [wx, wy] = this.toWorld(sx, sy);
      const handle = this.handleAt(wx, wy);
      const block = this.blockAt(wx, wy); const link = block ? null : this.linkAt(wx, wy);
      this.api.onContext?.(e, { block, link: link?.link ?? null, handle, x: this.snap(wx), y: this.snap(wy) });
    });
    c.addEventListener('keydown', (e) => {
      if (e.key === ' ' && !this.spaceDown) { this.spaceDown = true; c.dataset.pan = 'true'; }
      if (e.key === 'Alt') this.altDown = true;
      if (e.key === 'Escape') { if (this.placing?.points.length >= 2) this.finishPath(); else if (this.cancelPlace() || this.drag) { this.drag = null; this.dirty = true; } }
      if (e.key === 'Enter' && this.placing?.points.length >= 2) this.finishPath();
    });
    c.addEventListener('keyup', (e) => { if (e.key === ' ') { this.spaceDown = false; delete c.dataset.pan; } if (e.key === 'Alt') this.altDown = false; });
    // Library cards are dragged in with HTML5 drag and drop.
    this.host.addEventListener('dragover', (e) => { if ([...(e.dataTransfer?.types ?? [])].includes('application/x-mpf-block')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; const [sx, sy] = this.eventPoint(e); [this.mouse.wx, this.mouse.wy] = this.toWorld(sx, sy); this.dropGhost = e.dataTransfer.types.includes('application/x-mpf-block') ? this.dropGhost ?? 'block' : null; this.dirty = true; } });
    this.host.addEventListener('dragleave', () => { this.dropGhost = null; this.dirty = true; });
    this.host.addEventListener('drop', (e) => {
      const type = e.dataTransfer?.getData('application/x-mpf-block');
      this.dropGhost = null;
      if (!type) return;
      e.preventDefault();
      const [sx, sy] = this.eventPoint(e); const [wx, wy] = this.toWorld(sx, sy);
      this.api.onDropType?.(type, this.snap(wx), this.snap(wy));
    });
    new ResizeObserver(() => this.resize()).observe(this.host);
  }

  setHover(id) { if (this.hover === id) return; this.hover = id; this.api.onHover?.(id); this.dirty = true; }

  onDown(e) {
    this.canvas.focus();
    const [sx, sy] = this.eventPoint(e); const [wx, wy] = this.toWorld(sx, sy);
    this.canvas.setPointerCapture(e.pointerId);
    const edit = this.api.canEdit();
    if (e.button === 1 || e.button === 2 || this.tool === 'pan' || this.spaceDown) {
      if (e.button === 2) return;
      this.drag = { kind: 'pan', sx, sy, cx: this.view.cx, cy: this.view.cy };
      return;
    }
    if (this.placing) {
      if (!edit) { this.api.notify?.('warning', 'notice.stopToEdit'); return; }
      const x = this.snap(wx); const y = this.snap(wy);
      if (isPathType(this.placing.type)) {
        const pts = this.placing.points;
        let px = x; let py = y;
        if (e.shiftKey && pts.length) { const [lx, ly] = pts[pts.length - 1]; if (Math.abs(px - lx) > Math.abs(py - ly)) py = ly; else px = lx; }
        pts.push([px, py]);
        this.dirty = true;
        return;
      }
      this.api.placeBlock?.(this.placing.type, x, y);
      if (!e.shiftKey) this.cancelPlace();
      return;
    }
    const handle = edit ? this.handleAt(wx, wy) : null;
    if (handle) {
      this.drag = { kind: handle.kind, handle, start: [wx, wy], moved: false };
      return;
    }
    // Connect: from an output port, or from any block with the connect tool.
    const port = edit && this.options.ports ? this.portAt(wx, wy, 'out') : null;
    const bodyConnect = edit && this.tool === 'connect' ? this.blockAt(wx, wy, { includeLayout: false }) : null;
    if (port || bodyConnect) {
      const from = port ? { block: port.block.id, port: port.port } : { block: bodyConnect.id, port: -1 };
      this.drag = { kind: 'connect', from, start: port ? [port.p.x, port.p.y] : [bodyConnect.x, bodyConnect.y], wx, wy };
      this.dirty = true;
      return;
    }
    const block = this.blockAt(wx, wy);
    if (block) {
      const sel = this.api.selection();
      if (e.ctrlKey || e.metaKey) { this.api.setSelection(sel.includes(block.id) ? sel.filter((id) => id !== block.id) : [...sel, block.id]); return; }
      if (e.shiftKey) { if (!sel.includes(block.id)) this.api.setSelection([...sel, block.id]); }
      else if (!sel.includes(block.id)) this.api.setSelection([block.id]);
      if (edit) {
        const ids = this.api.selection().filter((id) => this.api.model().blocks.some((b) => b.id === id));
        const origin = new Map(ids.map((id) => { const b = this.api.model().blocks.find((x) => x.id === id); return [id, [b.x, b.y]]; }));
        const bends = this.api.model().links.filter((l) => ids.includes(l.from.block) && ids.includes(l.to.block)).map((l) => [l, l.points.map((q) => [...q])]);
        this.drag = { kind: 'move', start: [wx, wy], origin, bends, moved: false, anchor: block };
      }
      return;
    }
    const link = this.linkAt(wx, wy);
    if (link) {
      this.api.setSelection([link.link.id]);
      if (edit) this.drag = { kind: 'linkBend', link: link.link, segment: link.segment, start: [wx, wy], moved: false };
      return;
    }
    if (!e.shiftKey && !e.ctrlKey) this.api.setSelection([]);
    this.drag = { kind: 'box', start: [wx, wy], wx, wy, add: e.shiftKey || e.ctrlKey, base: this.api.selection() };
  }

  onMove(e) {
    const [sx, sy] = this.eventPoint(e); const [wx, wy] = this.toWorld(sx, sy);
    Object.assign(this.mouse, { x: sx, y: sy, wx, wy, inside: true });
    this.api.onPointer?.(wx, wy);
    const d = this.drag;
    if (!d) {
      if (this.placing) { this.dirty = true; return; }
      const block = this.blockAt(wx, wy);
      this.setHover(block?.id ?? null);
      this.hoverPort = this.options.ports && this.api.canEdit() ? this.portAt(wx, wy, 'out') : null;
      this.canvas.style.cursor = this.hoverPort ? 'crosshair' : this.handleAt(wx, wy) ? 'move' : block ? (this.tool === 'connect' ? 'crosshair' : 'pointer') : '';
      this.showTip(block, sx, sy);
      this.dirty = true;
      return;
    }
    this.tip.hidden = true;
    if (d.kind === 'pan') { this.view.cx = d.cx - (sx - d.sx) / this.view.scale; this.view.cy = d.cy - (sy - d.sy) / this.view.scale; this.dirty = true; this.api.onView?.(); return; }
    if (d.kind === 'connect') { d.wx = wx; d.wy = wy; this.dirty = true; return; }
    if (d.kind === 'box') { d.wx = wx; d.wy = wy; this.dirty = true; return; }
    const dx = wx - d.start[0]; const dy = wy - d.start[1];
    if (!d.moved && Math.hypot(dx, dy) * this.view.scale < 3) return;
    d.moved = true;
    this.api.live?.((model) => {
      if (d.kind === 'move') {
        const a = d.origin.get(d.anchor.id);
        const ox = this.snap(a[0] + dx) - a[0]; const oy = this.snap(a[1] + dy) - a[1];
        for (const [id, [x, y]] of d.origin) { const b = model.blocks.find((q) => q.id === id); if (b) { b.x = x + ox; b.y = y + oy; } }
        for (const [l, pts] of d.bends) { const link = model.links.find((q) => q.id === l.id); if (link) link.points = pts.map(([x, y]) => [x + ox, y + oy]); }
      } else if (d.kind === 'vertex') {
        const b = model.blocks.find((q) => q.id === d.handle.block.id);
        if (b) b.points[d.handle.index] = [this.snap(wx) - b.x, this.snap(wy) - b.y];
      } else if (d.kind === 'resize') {
        const b = model.blocks.find((q) => q.id === d.handle.block.id);
        if (b) {
          const fx = b.x - (d.handle.sx * b.w) / 2; const fy = b.y - (d.handle.sy * b.h) / 2; // fixed corner
          const nx = this.snap(wx); const ny = this.snap(wy);
          b.w = Math.max(1, Math.abs(nx - fx)); b.h = Math.max(1, Math.abs(ny - fy));
          b.x = (fx + nx) / 2; b.y = (fy + ny) / 2;
        }
      } else if (d.kind === 'bend') {
        const l = model.links.find((q) => q.id === d.handle.link.id);
        if (l) l.points[d.handle.index] = [this.snap(wx), this.snap(wy)];
      } else if (d.kind === 'linkBend') {
        const l = model.links.find((q) => q.id === d.link.id);
        if (l) {
          if (d.index == null) { l.points = [...(l.points ?? [])]; d.index = Math.min(d.segment, l.points.length); l.points.splice(d.index, 0, [this.snap(wx), this.snap(wy)]); }
          else l.points[d.index] = [this.snap(wx), this.snap(wy)];
        }
      }
    });
    this.dirty = true;
  }

  onUp(e) {
    const d = this.drag;
    this.drag = null;
    if (!d) return;
    const [sx, sy] = this.eventPoint(e); const [wx, wy] = this.toWorld(sx, sy);
    if (d.kind === 'connect') {
      const target = this.portAt(wx, wy, 'in') ?? null;
      const block = target?.block ?? this.blockAt(wx, wy, { includeLayout: false });
      if (block && block.id !== d.from.block) this.api.connect?.(d.from, { block: block.id, port: target ? target.port : -1 });
      this.dirty = true;
      return;
    }
    if (d.kind === 'box') {
      const x0 = Math.min(d.start[0], d.wx); const x1 = Math.max(d.start[0], d.wx);
      const y0 = Math.min(d.start[1], d.wy); const y1 = Math.max(d.start[1], d.wy);
      if ((x1 - x0) * this.view.scale > 3 || (y1 - y0) * this.view.scale > 3) {
        // Left to right: blocks fully inside; right to left: blocks touched (as in CAD programs).
        const crossing = d.wx < d.start[0];
        const ids = this.api.model().blocks.filter((b) => {
          const q = blockBounds(b);
          return crossing ? q.x1 >= x0 && q.x0 <= x1 && q.y1 >= y0 && q.y0 <= y1 : q.x0 >= x0 && q.x1 <= x1 && q.y0 >= y0 && q.y1 <= y1;
        }).map((b) => b.id);
        this.api.setSelection(d.add ? [...new Set([...d.base, ...ids])] : ids);
      }
      this.dirty = true;
      return;
    }
    if (d.moved && d.kind !== 'pan') this.api.commit?.(d.kind === 'move' ? 'op.move' : d.kind === 'resize' ? 'op.resize' : 'op.reshape');
    this.dirty = true;
  }

  onDouble(e) {
    const [sx, sy] = this.eventPoint(e); const [wx, wy] = this.toWorld(sx, sy);
    if (this.placing && isPathType(this.placing.type)) {
      // The double click added the same point twice.
      const pts = this.placing.points;
      if (pts.length >= 2 && Math.hypot(pts[pts.length - 1][0] - pts[pts.length - 2][0], pts[pts.length - 1][1] - pts[pts.length - 2][1]) < 1e-6) pts.pop();
      this.finishPath();
      return;
    }
    const block = this.blockAt(wx, wy);
    if (block && isPathType(block.type) && this.api.canEdit() && this.api.selection().includes(block.id)) {
      // Double click on a segment of a selected path: a new point there.
      const pts = pathPoints(block);
      for (let i = 1; i < pts.length; i++) {
        if (distToSegment(wx, wy, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]) <= 8 / this.view.scale + 0.5) {
          this.api.change?.('op.reshape', (model) => { const b = model.blocks.find((q) => q.id === block.id); b.points.splice(i, 0, [this.snap(wx) - b.x, this.snap(wy) - b.y]); });
          return;
        }
      }
    }
    if (block) this.api.onDoubleClick?.(block);
  }

  finishPath() {
    const p = this.placing;
    if (!p || p.points.length < 2) { this.cancelPlace(); return; }
    const [x0, y0] = p.points[0];
    this.api.placeBlock?.(p.type, x0, y0, { points: p.points.map(([x, y]) => [x - x0, y - y0]) });
    this.cancelPlace();
  }

  showTip(block, sx, sy) {
    const text = block ? this.api.tipFor?.(block) : '';
    if (!text) { this.tip.hidden = true; return; }
    this.tip.innerHTML = text;
    this.tip.hidden = false;
    const r = this.tip.getBoundingClientRect();
    this.tip.style.left = `${Math.min(sx + 14, this.width - r.width - 6)}px`;
    this.tip.style.top = `${Math.min(sy + 16, this.height - r.height - 6)}px`;
  }

  // ───────────── drawing
  render(sim = null) {
    const ctx = this.ctx; const c = this.colors;
    const model = this.api.model();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = c.bg;
    ctx.fillRect(0, 0, this.width, this.height);
    if (!model) return;
    this.drawGrid(model);
    const s = this.view.scale;
    ctx.save();
    ctx.translate(this.width / 2, this.height / 2);
    ctx.scale(s, s);
    ctx.translate(-this.view.cx, -this.view.cy);
    const sel = new Set(this.api.selection());
    const order = { zone: 0, population: 1, cellGrid: 1, chart: 1, wall: 2, road: 3, parking: 3, conveyor: 4 };
    const rank = (b) => order[baseOf(b.type)] ?? 5;
    const blocks = [...model.blocks].sort((a, b) => rank(a) - rank(b));
    for (const b of blocks) if (rank(b) < 5) this.drawBlock(b, sel.has(b.id), sim);
    if (this.options.links) for (const l of model.links) this.drawLink(l, sel.has(l.id), sim);
    for (const b of blocks) if (rank(b) >= 5) this.drawBlock(b, sel.has(b.id), sim);
    if (sim) this.drawDynamic(sim);
    this.drawOverlay(model, sel);
    ctx.restore();
    this.dirty = false;
  }

  drawGrid(model) {
    const ctx = this.ctx; const s = this.view.scale;
    const [x0, y0] = this.toWorld(0, 0); const [x1, y1] = this.toWorld(this.width, this.height);
    // The floor of the model (settings: floor size), centred on the origin.
    const fw = model.settings.floorWidth; const fd = model.settings.floorDepth;
    const [fx, fy] = this.toScreen(-fw / 2, -fd / 2);
    ctx.fillStyle = this.colors.dark ? 'rgba(255,255,255,0.025)' : 'rgba(255,255,255,0.55)';
    ctx.fillRect(fx, fy, fw * s, fd * s);
    ctx.strokeStyle = this.colors.gridMajor; ctx.lineWidth = 1.2;
    ctx.strokeRect(fx, fy, fw * s, fd * s);
    if (!this.options.grid) return;
    for (const [step, color] of [[1, this.colors.grid], [5, this.colors.gridMajor]]) {
      if (step * s < 6) continue;
      ctx.beginPath();
      for (let x = Math.floor(x0 / step) * step; x <= x1; x += step) { const [px] = this.toScreen(x, 0); ctx.moveTo(Math.round(px) + 0.5, 0); ctx.lineTo(Math.round(px) + 0.5, this.height); }
      for (let y = Math.floor(y0 / step) * step; y <= y1; y += step) { const [, py] = this.toScreen(0, y); ctx.moveTo(0, Math.round(py) + 0.5); ctx.lineTo(this.width, Math.round(py) + 0.5); }
      ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.stroke();
    }
    // Origin axes.
    // The origin: a small x (red) / y (green) axis cross with a dot.
    const [ox, oy] = this.toScreen(0, 0);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(220,38,38,0.55)'; ctx.beginPath(); ctx.moveTo(ox - 6, oy); ctx.lineTo(ox + 22, oy); ctx.lineTo(ox + 17, oy - 3); ctx.moveTo(ox + 22, oy); ctx.lineTo(ox + 17, oy + 3); ctx.stroke();
    ctx.strokeStyle = 'rgba(22,163,74,0.55)'; ctx.beginPath(); ctx.moveTo(ox, oy - 6); ctx.lineTo(ox, oy + 22); ctx.lineTo(ox - 3, oy + 17); ctx.moveTo(ox, oy + 22); ctx.lineTo(ox + 3, oy + 17); ctx.stroke();
    ctx.fillStyle = 'rgba(100,116,139,0.7)'; ctx.beginPath(); ctx.arc(ox, oy, 2.5, 0, TAU); ctx.fill();
  }

  px(n) { return n / this.view.scale; }

  text(str, x, y, { size = 11, color = this.colors.text, align = 'center', baseline = 'middle', weight = 500, max = 0, bg = null } = {}) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1 / this.view.scale, 1 / this.view.scale);
    ctx.font = `${weight} ${size}px ${getComputedStyle(document.body).fontFamily || 'sans-serif'}`;
    ctx.textAlign = align; ctx.textBaseline = baseline;
    let s = String(str);
    if (max > 0) { while (s.length > 2 && ctx.measureText(s).width > max) s = s.slice(0, -2); if (s !== String(str)) s += '…'; }
    if (bg) {
      const w = ctx.measureText(s).width + 8;
      const ox = align === 'center' ? -w / 2 : align === 'right' ? -w : 0;
      ctx.fillStyle = bg; roundRect(ctx, ox, -size / 2 - 3, w, size + 6, 4); ctx.fill();
      ctx.fillStyle = color; ctx.fillText(s, ox + 4 + (align === 'center' ? w / 2 - 4 : align === 'right' ? w - 8 : 0), 0);
    } else { ctx.fillStyle = color; ctx.fillText(s, 0, 0); }
    ctx.restore();
  }

  drawBlock(b, selected, sim) {
    const ctx = this.ctx; const c = this.colors; const spec = BLOCK_TYPES[b.type];
    const live = sim ? sim.blockState(b.id) : null;
    const hovered = this.hover === b.id;
    const color = spec.color;
    if (isPathType(b.type)) { this.drawPath(b, selected, live); return; }
    const w = b.w ?? spec.w; const h = b.h ?? spec.h;
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(((b.rot ?? 0) * Math.PI) / 180);
    const lw = this.px(selected ? 2.4 : hovered ? 1.8 : 1.2);
    switch (baseOf(b.type)) {
      case 'zone': {
        ctx.globalAlpha = Number(b.props.opacity ?? 0.35);
        ctx.fillStyle = b.props.fill || '#cbd5e1'; ctx.fillRect(-w / 2, -h / 2, w, h);
        ctx.globalAlpha = 1;
        ctx.setLineDash([this.px(6), this.px(4)]); ctx.strokeStyle = selected ? c.accent : 'rgba(100,116,139,0.6)'; ctx.lineWidth = lw; ctx.strokeRect(-w / 2, -h / 2, w, h); ctx.setLineDash([]);
        if (this.view.scale > 4) this.text(b.name, -w / 2 + this.px(6), -h / 2 + this.px(10), { align: 'left', color: c.muted, size: 11, weight: 600 });
        break;
      }
      case 'population': {
        ctx.fillStyle = 'rgba(16,185,129,0.06)'; ctx.fillRect(-w / 2, -h / 2, w, h);
        ctx.strokeStyle = selected ? c.accent : 'rgba(5,150,105,0.65)'; ctx.lineWidth = lw; ctx.setLineDash([this.px(8), this.px(4)]); ctx.strokeRect(-w / 2, -h / 2, w, h); ctx.setLineDash([]);
        this.text(`${b.name} · ${b.props.count}`, -w / 2 + this.px(6), -h / 2 + this.px(10), { align: 'left', color: '#059669', size: 11, weight: 700 });
        if (!sim) {
          // A preview of the agents (seeded by the block id so it does not flicker).
          let seed = [...b.id].reduce((s, ch) => (s * 31 + ch.charCodeAt(0)) >>> 0, 7);
          const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
          const states = b.props.states ?? [];
          const n = Math.min(400, Number(b.props.count) || 0);
          for (let i = 0; i < n; i++) { ctx.fillStyle = states[0]?.color ?? '#3b82f6'; ctx.globalAlpha = 0.35; ctx.beginPath(); ctx.arc(-w / 2 + rnd() * w, -h / 2 + rnd() * h, this.px(2.2), 0, TAU); ctx.fill(); }
          ctx.globalAlpha = 1;
        } else if (live?.counts) {
          const states = live.states; const total = live.counts.reduce((a, q) => a + q, 0) || 1;
          let x = -w / 2;
          states.forEach((st, i) => { const ww = (w * live.counts[i]) / total; ctx.fillStyle = st.color; ctx.fillRect(x, h / 2 - this.px(5), ww, this.px(5)); x += ww; });
        }
        break;
      }
      case 'chart': {
        ctx.fillStyle = c.surface; ctx.strokeStyle = selected ? c.accent : c.border; ctx.lineWidth = lw;
        roundRect(ctx, -w / 2, -h / 2, w, h, this.px(6)); ctx.fill(); ctx.stroke();
        this.drawMiniChart(b, sim, -w / 2, -h / 2, w, h);
        break;
      }
      case 'cellGrid': this.drawCells(b, w, h, selected, live); break;
      case 'pillar': { ctx.fillStyle = '#9ca3af'; ctx.strokeStyle = selected ? c.accent : '#4b5563'; ctx.lineWidth = lw * 1.5; ctx.fillRect(-w / 2, -h / 2, w, h); ctx.strokeRect(-w / 2, -h / 2, w, h); break; }
      case 'tree': { ctx.fillStyle = 'rgba(22,163,74,0.55)'; ctx.strokeStyle = selected ? c.accent : '#166534'; ctx.lineWidth = lw * 1.5; ctx.beginPath(); ctx.arc(0, 0, Math.min(w, h) / 2, 0, TAU); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#78350f'; ctx.beginPath(); ctx.arc(0, 0, Math.min(w, h) * 0.08, 0, TAU); ctx.fill(); break; }
      case 'door': { ctx.strokeStyle = selected ? c.accent : '#57534e'; ctx.lineWidth = lw * 2; ctx.strokeRect(-w / 2, -h / 2, w, h); ctx.setLineDash([this.px(4), this.px(3)]); ctx.beginPath(); ctx.arc(-w / 2, h / 2, w, -Math.PI / 2, 0); ctx.stroke(); ctx.setLineDash([]); if (this.view.scale > 5) this.text(b.name, 0, h / 2 + this.px(10), { size: 10, color: c.muted }); break; }
      case 'label': {
        this.textWorld(b.props.text || b.name, 0, 0, Number(b.props.size) || 0.8, b.props.textColor || c.text);
        if (selected || hovered) { ctx.strokeStyle = c.accent; ctx.lineWidth = lw; ctx.setLineDash([this.px(4), this.px(3)]); ctx.strokeRect(-w / 2, -h / 2, w, h); ctx.setLineDash([]); }
        break;
      }
      case 'display': {
        ctx.fillStyle = '#0f172a'; ctx.strokeStyle = selected ? c.accent : '#0f766e'; ctx.lineWidth = lw * 1.4;
        roundRect(ctx, -w / 2, -h / 2, w, h, this.px(6)); ctx.fill(); ctx.stroke();
        const v = live?.value;
        const txt = v == null ? (b.props.expression || '—') : `${Number(v).toFixed(Number(b.props.digits) || 0)}${b.props.unitLabel ? ` ${b.props.unitLabel}` : ''}`;
        const lo = Number(b.props.min) || 0; const hi = Number(b.props.max) || 100;
        const f = v == null ? 0 : clamp((v - lo) / ((hi - lo) || 1), 0, 1);
        if (b.props.style === 'gauge') {
          const r = Math.min(w, h) * 0.38;
          ctx.lineWidth = r * 0.22; ctx.lineCap = 'round';
          ctx.strokeStyle = 'rgba(148,163,184,0.35)'; ctx.beginPath(); ctx.arc(0, h * 0.12, r, Math.PI * 0.8, Math.PI * 2.2); ctx.stroke();
          ctx.strokeStyle = heatColor(f); ctx.beginPath(); ctx.arc(0, h * 0.12, r, Math.PI * 0.8, Math.PI * (0.8 + 1.4 * f)); ctx.stroke(); ctx.lineCap = 'butt';
          this.textWorld(txt, 0, h * 0.14, r * 0.45, '#e2e8f0', 700);
        } else if (b.props.style === 'bar') {
          ctx.fillStyle = 'rgba(148,163,184,0.3)'; ctx.fillRect(-w / 2 + w * 0.06, -h * 0.12, w * 0.88, h * 0.34);
          ctx.fillStyle = heatColor(f); ctx.fillRect(-w / 2 + w * 0.06, -h * 0.12, w * 0.88 * f, h * 0.34);
          this.textWorld(txt, 0, h * 0.32, h * 0.22, '#e2e8f0', 700);
        } else this.textWorld(txt, 0, h * 0.08, Math.min(h * 0.42, (w / Math.max(4, txt.length)) * 1.5), b.props.style === 'counter' ? '#fbbf24' : '#5eead4', 700);
        if (h * this.view.scale > 44) this.text(b.name, 0, -h / 2 + this.px(9), { size: 9, color: '#94a3b8' });
        else if (this.options.labels && this.view.scale > 5) this.text(b.name, 0, h / 2 + this.px(10), { size: 11, weight: 600 });
        break;
      }
      case 'stock': this.drawStock(b, w, h, selected, hovered, live); break;
      case 'lookup': case 'smooth':
      case 'flow': {
        ctx.fillStyle = c.surface; ctx.strokeStyle = selected ? c.accent : color; ctx.lineWidth = lw * 1.4;
        ctx.beginPath(); ctx.moveTo(-w / 2 + 0.2, -h / 2 + 0.2); ctx.lineTo(w / 2 - 0.2, h / 2 - 0.2); ctx.lineTo(w / 2 - 0.2, -h / 2 + 0.2); ctx.lineTo(-w / 2 + 0.2, h / 2 - 0.2); ctx.closePath(); ctx.fill(); ctx.stroke();
        this.text(b.name, 0, h / 2 + this.px(10), { size: 11, weight: 600 });
        if (live) this.text(fmt(live.value), 0, -h / 2 - this.px(9), { size: 10, color: color, bg: c.surface });
        break;
      }
      case 'variable': case 'parameter': {
        ctx.fillStyle = c.surface; ctx.strokeStyle = selected ? c.accent : color; ctx.lineWidth = lw * 1.3;
        if (baseOf(b.type) !== 'parameter') { ctx.beginPath(); ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, TAU); ctx.fill(); ctx.stroke(); }
        else { roundRect(ctx, -w / 2, -h / 2, w, h, h / 2); ctx.fill(); ctx.stroke(); }
        // The name under the shape (SD names can be long), the value inside.
        this.text(b.name, 0, h / 2 + this.px(10), { size: 11, weight: 600 });
        const v = live ? live.value : baseOf(b.type) === 'parameter' ? Number(b.props.value) : null;
        if (v != null && this.view.scale > 4) this.text(fmt(v), 0, 0, { size: 10, color: color, weight: 700 });
        else if (baseOf(b.type) !== 'parameter' && this.view.scale > 8) this.text(baseOf(b.type) === 'lookup' ? '⌇' : baseOf(b.type) === 'smooth' ? '∿' : 'ƒ', 0, 0, { size: 12, color: color, weight: 700 });
        break;
      }
      default: this.drawStation(b, w, h, selected, hovered, live, color);
    }
    ctx.restore();
  }

  textWorld(str, x, y, size, color, weight = 600) {
    const ctx = this.ctx;
    ctx.save();
    const k = size * this.view.scale;
    ctx.translate(x, y); ctx.scale(1 / this.view.scale, 1 / this.view.scale);
    ctx.font = `${weight} ${Math.max(1, k)}px ${getComputedStyle(document.body).fontFamily || 'sans-serif'}`;
    ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(str), 0, 0);
    ctx.restore();
  }

  drawStock(b, w, h, selected, hovered, live) {
    const ctx = this.ctx; const c = this.colors;
    const color = BLOCK_TYPES[b.type].color;
    const tank = b.type !== 'stock';
    ctx.fillStyle = c.surface; ctx.strokeStyle = selected ? c.accent : color; ctx.lineWidth = this.px(selected ? 2.6 : 1.6);
    if (tank) { roundRect(ctx, -w / 2, -h / 2, w, h, Math.min(w, h) * 0.3); ctx.fill(); ctx.save(); ctx.clip(); } else ctx.fillRect(-w / 2, -h / 2, w, h);
    if (live) {
      const cap = Number(b.props.capacity) > 0 ? Number(b.props.capacity) : 0;
      const max = cap || Math.max(this.sdMax.get(b.id) ?? 0, Math.abs(live.value), 1e-9);
      this.sdMax.set(b.id, max);
      const f = clamp(live.value / max, 0, 1);
      ctx.fillStyle = live.full ? 'rgba(239,68,68,0.35)' : tank ? 'rgba(14,165,233,0.45)' : 'rgba(37,99,235,0.28)'; ctx.fillRect(-w / 2, h / 2 - h * f, w, h * f);
    }
    if (tank) { ctx.restore(); roundRect(ctx, -w / 2, -h / 2, w, h, Math.min(w, h) * 0.3); ctx.stroke(); } else ctx.strokeRect(-w / 2, -h / 2, w, h);
    this.text(b.name, 0, live ? -this.px(7) : 0, { size: 12, weight: 700, max: w * this.view.scale - 6 });
    if (live) this.text(fmt(live.value), 0, this.px(9), { size: 11, color: color, weight: 600 });
  }

  drawStation(b, w, h, selected, hovered, live, color) {
    const ctx = this.ctx; const c = this.colors;
    const r = this.px(7);
    let fill = c.surface;
    let state = live?.state;
    const base = baseOf(b.type);
    if (base === 'signal' || base === 'gate') state = null;
    if (this.options.heat && live?.utilization != null) fill = heatColor(live.utilization);
    ctx.fillStyle = fill;
    ctx.strokeStyle = selected ? c.accent : hovered ? color : mix(color, c.border, 0.45);
    ctx.lineWidth = this.px(selected ? 2.4 : 1.4);
    roundRect(ctx, -w / 2, -h / 2, w, h, r); ctx.fill();
    // Colour band of the type (top) and of the state while running.
    ctx.save(); roundRect(ctx, -w / 2, -h / 2, w, h, r); ctx.clip();
    ctx.fillStyle = state ? STATE_COLORS[state] ?? color : color;
    ctx.globalAlpha = state ? 0.9 : 0.85;
    ctx.fillRect(-w / 2, -h / 2, w, this.px(4));
    ctx.globalAlpha = 0.07; ctx.fillStyle = color; ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.restore();
    ctx.stroke();
    // Glyph.
    const g = Math.min(w, h) * 0.55;
    if (g * this.view.scale >= 8) {
      const img = glyph(BLOCK_TYPES[b.type].icon, color, () => { this.dirty = true; });
      if (img.complete && img.naturalWidth) ctx.drawImage(img, -g / 2, -g / 2 - (this.view.scale > 10 ? this.px(5) : 0), g, g);
    }
    // Signal lamps.
    if (base === 'signal') {
      const phase = live?.phase;
      ['red', 'yellow', 'green'].forEach((p, i) => {
        ctx.beginPath(); ctx.arc(0, -h / 3 + (i * h) / 3, Math.min(w, h / 3) * 0.32, 0, TAU);
        ctx.fillStyle = phase === p ? { red: '#ef4444', yellow: '#facc15', green: '#22c55e' }[p] : 'rgba(100,116,139,0.25)';
        ctx.fill();
      });
    }
    if (base === 'gate' && live) { ctx.fillStyle = live.open ? '#22c55e' : '#ef4444'; ctx.beginPath(); ctx.arc(w / 2 - this.px(7), -h / 2 + this.px(10), this.px(4), 0, TAU); ctx.fill(); }
    // Rack cells / parking spaces outline.
    if (base === 'rack') {
      const bays = Math.max(1, Number(b.props.bays) || 1);
      ctx.strokeStyle = mix(color, c.border, 0.5); ctx.lineWidth = this.px(1);
      for (let i = 1; i < bays; i++) { const x = -w / 2 + (w * i) / bays; ctx.beginPath(); ctx.moveTo(x, -h / 2 + this.px(4)); ctx.lineTo(x, h / 2); ctx.stroke(); }
    }
    if (base === 'queue') {
      ctx.strokeStyle = 'rgba(245,158,11,0.45)'; ctx.lineWidth = this.px(1); ctx.setLineDash([this.px(3), this.px(3)]);
      ctx.beginPath(); ctx.moveTo(-w / 2 + 0.2, 0); ctx.lineTo(w / 2 - 0.2, 0); ctx.stroke(); ctx.setLineDash([]);
    }
    // Name and live numbers.
    if (this.options.labels && this.view.scale > 5) this.text(b.name, 0, h / 2 + this.px(10), { size: 11, weight: 600, max: Math.max(80, w * this.view.scale + 40) });
    if (live) {
      const parts = [];
      if (live.contents != null && live.capacity != null) parts.push(`${live.contents}/${live.capacity === Infinity ? '∞' : live.capacity}`);
      else if (live.contents != null && base !== 'sink') parts.push(String(Math.round(live.contents)));
      if (live.count != null) parts.push(`✓${live.count}`);
      if (parts.length && this.view.scale > 6) this.text(parts.join(' · '), 0, -h / 2 - this.px(9), { size: 10, color: c.text, bg: mix(c.surface, color, 0.12) });
      if (live.utilization != null && this.view.scale > 6) {
        const u = clamp(live.utilization, 0, 1);
        ctx.fillStyle = 'rgba(100,116,139,0.25)'; ctx.fillRect(-w / 2 + this.px(5), h / 2 - this.px(7), w - this.px(10), this.px(3));
        ctx.fillStyle = heatColor(u); ctx.fillRect(-w / 2 + this.px(5), h / 2 - this.px(7), (w - this.px(10)) * u, this.px(3));
      }
      if (live.gauge != null) {
        ctx.fillStyle = 'rgba(100,116,139,0.25)'; ctx.fillRect(w / 2 - this.px(6), -h / 2 + this.px(6), this.px(3), h - this.px(12));
        const g2 = clamp(live.gauge, 0, 1);
        ctx.fillStyle = heatColor(g2); ctx.fillRect(w / 2 - this.px(6), h / 2 - this.px(6) - (h - this.px(12)) * g2, this.px(3), (h - this.px(12)) * g2);
      }
    }
    // Ports.
    if (this.options.ports && (selected || hovered || this.tool === 'connect' || this.drag?.kind === 'connect' || this.view.scale > 14)) this.drawPorts(b);
  }

  drawPorts(b) {
    const ctx = this.ctx; const c = this.colors;
    const { ins, outs } = portsOf(b);
    ctx.save();
    ctx.rotate(-((b.rot ?? 0) * Math.PI) / 180);
    ctx.translate(-b.x, -b.y);
    const r = this.px(4.2);
    for (const p of ins) { ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.fillStyle = c.surface; ctx.fill(); ctx.strokeStyle = c.muted; ctx.lineWidth = this.px(1.4); ctx.stroke(); }
    outs.forEach((p, i) => {
      const hot = this.hoverPort?.block.id === b.id && this.hoverPort.port === i;
      ctx.beginPath(); ctx.arc(p.x, p.y, hot ? r * 1.4 : r, 0, TAU);
      const optional = BLOCK_TYPES[b.type].optionalOuts?.includes(i);
      ctx.fillStyle = hot ? c.accent : optional ? '#f97316' : '#16a34a'; ctx.fill();
      ctx.strokeStyle = c.surface; ctx.lineWidth = this.px(1.2); ctx.stroke();
    });
    ctx.restore();
  }

  drawPath(b, selected, live) {
    const ctx = this.ctx; const c = this.colors;
    const pts = pathPoints(b);
    const line = () => { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); };
    ctx.lineJoin = 'round'; ctx.lineCap = 'butt';
    const base = baseOf(b.type);
    if (b.type === 'railTrack') {
      // Sleepers and two rails.
      ctx.strokeStyle = selected ? c.accent : '#78716c'; ctx.lineWidth = 2.4; line(); ctx.setLineDash([0.25, 0.45]); ctx.stroke(); ctx.setLineDash([]);
      ctx.strokeStyle = '#475569'; ctx.lineWidth = Math.max(this.px(1.5), 0.12);
      this.strokeOffset(pts, -0.72); this.strokeOffset(pts, 0.72);
    } else if (b.type === 'walkway' || b.type === 'escalator') {
      const width = Number(b.props.width) || 2;
      line(); ctx.strokeStyle = selected ? c.accent : b.type === 'escalator' ? '#6b7280' : '#cbd5e1'; ctx.lineWidth = width + this.px(selected ? 3 : 1.5); ctx.stroke();
      line(); ctx.strokeStyle = b.type === 'escalator' ? '#9ca3af' : c.dark ? '#475569' : '#e5e7eb'; ctx.lineWidth = width; ctx.stroke();
      if (b.type === 'escalator') { ctx.strokeStyle = 'rgba(55,65,81,0.6)'; ctx.lineWidth = this.px(1); ctx.setLineDash([0.08, 0.32]); line(); ctx.lineWidth = width * 0.9; ctx.stroke(); ctx.setLineDash([]); }
      const [ax, ay] = pts[pts.length - 2]; const [bx, by] = pts[pts.length - 1];
      this.arrow(ax, ay, bx, by, '#7c3aed', Math.max(0.6, width * 0.4));
    } else if (b.type === 'fence') {
      line(); ctx.strokeStyle = selected ? c.accent : '#9ca3af'; ctx.lineWidth = Math.max(this.px(2), 0.08); ctx.setLineDash([0.4, 0.15]); ctx.stroke(); ctx.setLineDash([]);
    } else if (b.type === 'floorMarking') {
      line(); ctx.strokeStyle = selected ? c.accent : '#facc15'; ctx.lineWidth = Math.max(Number(b.props.thickness) || 0.12, this.px(2)); ctx.setLineDash([0.6, 0.3]); ctx.stroke(); ctx.setLineDash([]);
    } else if (base === 'road') {
      const width = (Number(b.props.lanes) || 1) * 3.5;
      line(); ctx.strokeStyle = selected ? c.accent : '#475569'; ctx.lineWidth = width + this.px(selected ? 4 : 2); ctx.stroke();
      line(); ctx.strokeStyle = '#3f4652'; ctx.lineWidth = width; ctx.stroke();
      const lanes = Number(b.props.lanes) || 1;
      ctx.setLineDash([2, 2.5]); ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = Math.max(this.px(1), 0.12);
      for (let k = 1; k < lanes; k++) this.strokeOffset(pts, (k - lanes / 2) * 3.5);
      ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(250,204,21,0.8)'; ctx.lineWidth = Math.max(this.px(1), 0.1);
      this.strokeOffset(pts, -width / 2 + 0.2); this.strokeOffset(pts, width / 2 - 0.2);
    } else if (base === 'wall') {
      line(); ctx.strokeStyle = selected ? c.accent : '#64748b'; ctx.lineWidth = Math.max(Number(b.props.thickness) || 0.2, this.px(3)); ctx.lineCap = 'square'; ctx.stroke(); ctx.lineCap = 'butt';
    } else {
      const width = Number(b.props.width) || 0.8;
      line(); ctx.strokeStyle = selected ? c.accent : live?.blocked ? '#f97316' : '#52525b'; ctx.lineWidth = width + this.px(selected ? 4 : 2.5); ctx.stroke();
      line(); ctx.strokeStyle = c.dark ? '#27272a' : '#a1a1aa'; ctx.lineWidth = width; ctx.stroke();
      // Rollers.
      if (this.view.scale > 6) {
        ctx.strokeStyle = 'rgba(63,63,70,0.55)'; ctx.lineWidth = this.px(1);
        for (let i = 1; i < pts.length; i++) {
          const [x0, y0] = pts[i - 1]; const [x1, y1] = pts[i]; const L = Math.hypot(x1 - x0, y1 - y0); const nx = -(y1 - y0) / (L || 1); const ny = (x1 - x0) / (L || 1);
          for (let s = 0.4; s < L; s += 0.6) { const x = x0 + ((x1 - x0) * s) / L; const y = y0 + ((y1 - y0) * s) / L; ctx.beginPath(); ctx.moveTo(x - (nx * width) / 2, y - (ny * width) / 2); ctx.lineTo(x + (nx * width) / 2, y + (ny * width) / 2); ctx.stroke(); }
        }
      }
      // Direction arrow at the end.
      const [ax, ay] = pts[pts.length - 2]; const [bx, by] = pts[pts.length - 1];
      this.arrow(ax, ay, bx, by, '#16a34a', Math.max(0.5, width * 0.7));
    }
    if (this.options.labels && this.view.scale > 5 && base !== 'wall') {
      const mid = pts[Math.floor((pts.length - 1) / 2)]; const nxt = pts[Math.floor((pts.length - 1) / 2) + 1] ?? mid;
      const label = live ? `${b.name} · ${Math.round(live.contents ?? 0)}` : b.name;
      this.text(label, (mid[0] + nxt[0]) / 2, (mid[1] + nxt[1]) / 2 - (base === 'road' ? (Number(b.props.lanes) || 1) * 1.75 + this.px(9) : (Number(b.props.width) || 0.8) / 2 + this.px(9)), { size: 10, color: c.muted, weight: 600 });
    }
    if (this.options.ports && (selected || this.hover === b.id || this.tool === 'connect' || this.drag?.kind === 'connect')) {
      const { ins, outs } = portsOf(b);
      for (const p of ins) { ctx.beginPath(); ctx.arc(p.x, p.y, this.px(4), 0, TAU); ctx.fillStyle = c.surface; ctx.fill(); ctx.strokeStyle = c.muted; ctx.lineWidth = this.px(1.4); ctx.stroke(); }
      for (const p of outs) { ctx.beginPath(); ctx.arc(p.x, p.y, this.px(4), 0, TAU); ctx.fillStyle = '#16a34a'; ctx.fill(); }
    }
  }

  strokeOffset(pts, off) {
    const ctx = this.ctx;
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)]; const b = pts[Math.min(pts.length - 1, i + 1)];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const nx = -(b[1] - a[1]) / L; const ny = (b[0] - a[0]) / L;
      const x = pts[i][0] + nx * off; const y = pts[i][1] + ny * off;
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.stroke();
  }

  arrow(ax, ay, bx, by, color, size) {
    const ctx = this.ctx;
    const a = Math.atan2(by - ay, bx - ax);
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx - size * Math.cos(a - 0.45), by - size * Math.sin(a - 0.45)); ctx.lineTo(bx - size * Math.cos(a + 0.45), by - size * Math.sin(a + 0.45)); ctx.closePath(); ctx.fill();
  }

  drawLink(l, selected, sim) {
    const ctx = this.ctx; const c = this.colors;
    const pts = this.linkPolyline(l);
    if (pts.length < 2) return;
    const model = this.api.model();
    const a = model.blocks.find((b) => b.id === l.from.block); const b = model.blocks.find((b2) => b2.id === l.to.block);
    const sdMaterial = l.kind === 'flow' && a && b && isSd(a.type) && isSd(b.type);
    ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    if (sdMaterial) {
      // A pipe: a thick double line.
      ctx.strokeStyle = selected ? c.accent : '#0284c7'; ctx.lineWidth = this.px(7); ctx.stroke();
      ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.strokeStyle = c.bg; ctx.lineWidth = this.px(3.5); ctx.stroke();
    } else if (l.kind === 'influence') {
      ctx.setLineDash([this.px(5), this.px(4)]); ctx.strokeStyle = selected ? c.accent : 'rgba(139,92,246,0.75)'; ctx.lineWidth = this.px(selected ? 2.2 : 1.4); ctx.stroke(); ctx.setLineDash([]);
    } else {
      ctx.strokeStyle = selected ? c.accent : this.hover === l.id ? c.text : c.muted; ctx.lineWidth = this.px(selected ? 2.4 : 1.5); ctx.stroke();
    }
    const [x0, y0] = pts[pts.length - 2]; const [x1, y1] = pts[pts.length - 1];
    this.arrow(x0, y0, x1, y1, selected ? c.accent : sdMaterial ? '#0284c7' : l.kind === 'influence' ? 'rgba(139,92,246,0.85)' : c.muted, this.px(9));
    if (selected) for (const [x, y] of l.points ?? []) { ctx.fillStyle = c.surface; ctx.strokeStyle = c.accent; ctx.lineWidth = this.px(1.5); ctx.fillRect(x - this.px(4), y - this.px(4), this.px(8), this.px(8)); ctx.strokeRect(x - this.px(4), y - this.px(4), this.px(8), this.px(8)); }
    void sim;
  }

  drawMiniChart(b, sim, x, y, w, h) {
    const keys = String(b.props.series ?? '').split(/[,;]+/).map((k) => k.trim()).filter(Boolean);
    const c = this.colors;
    this.text(b.name, x + this.px(8), y + this.px(10), { align: 'left', size: 11, weight: 700 });
    if (!sim || !keys.length) { this.text(keys.join(', ') || '—', x + w / 2, y + h / 2, { color: c.muted, size: 10 }); return; }
    const ts = sim.series.t; if (ts.length < 2) return;
    const pad = this.px(8); const top = y + this.px(22);
    const iw = w - pad * 2; const ih = h - (top - y) - pad;
    let lo = Infinity; let hi = -Infinity;
    const series = keys.map((k) => sim.series.data.get(k) ?? []);
    for (const s of series) for (const v of s) { if (v < lo) lo = v; if (v > hi) hi = v; }
    if (!Number.isFinite(lo)) return;
    if (hi - lo < 1e-9) hi = lo + 1;
    const palette = ['#2563eb', '#ef4444', '#16a34a', '#f59e0b', '#8b5cf6', '#0891b2'];
    const t0 = ts[0]; const t1 = ts[ts.length - 1] || 1;
    const ctx = this.ctx;
    const kind = b.props.chartKind;
    const last = series.map((s2) => s2[s2.length - 1] ?? 0);
    if (kind === 'bar') {
      const peak = Math.max(1e-9, ...last.map(Math.abs)); const bw = iw / last.length; const room = ih - this.px(14);
      last.forEach((v, k) => {
        const bh = (Math.abs(v) / peak) * room; const bx = x + pad + k * bw;
        ctx.fillStyle = palette[k % palette.length]; ctx.fillRect(bx + bw * 0.15, top + room - bh, bw * 0.7, bh);
        this.text(fmt(v), bx + bw / 2, top + room - bh - this.px(7), { size: 9, color: palette[k % palette.length] });
        this.text(keys[k], bx + bw / 2, top + room + this.px(8), { size: 9, color: c.muted, max: bw * this.view.scale });
      });
      return;
    }
    if (kind === 'pie') {
      const total = last.reduce((a2, v) => a2 + Math.max(0, v), 0) || 1; let a0 = -Math.PI / 2;
      const r = Math.min(iw, ih) / 2.2; const cx = x + pad + r; const cy = top + ih / 2;
      last.forEach((v, k) => { const a1 = a0 + (Math.max(0, v) / total) * TAU; ctx.fillStyle = palette[k % palette.length]; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r, a0, a1); ctx.closePath(); ctx.fill(); a0 = a1; this.text(`${keys[k]}: ${fmt(v)}`, x + w - pad, top + this.px(6 + k * 13), { align: 'right', size: 10, color: palette[k % palette.length], weight: 600 }); });
      return;
    }
    if (kind === 'histogram') {
      const vals = series[0] ?? []; const bins = 16; const counts = new Array(bins).fill(0);
      for (const v of vals) counts[Math.min(bins - 1, Math.floor(((v - lo) / (hi - lo)) * bins))] += 1;
      const topC = Math.max(1, ...counts); const bw = iw / bins;
      ctx.fillStyle = palette[0];
      counts.forEach((n, k) => { const bh = (n / topC) * ih; ctx.fillRect(x + pad + k * bw + this.px(1), top + ih - bh, bw - this.px(2), bh); });
      this.text(keys[0], x + w - pad, top + this.px(6), { align: 'right', size: 10, color: palette[0], weight: 600 });
      return;
    }
    series.forEach((s, k) => {
      ctx.beginPath();
      s.forEach((v, i) => { const px = x + pad + ((ts[i] - t0) / (t1 - t0 || 1)) * iw; const py = top + ih - ((v - lo) / (hi - lo)) * ih; if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); });
      ctx.strokeStyle = palette[k % palette.length]; ctx.lineWidth = this.px(1.6); ctx.stroke();
      if (kind === 'area') { ctx.lineTo(x + pad + iw, top + ih); ctx.lineTo(x + pad, top + ih); ctx.closePath(); ctx.globalAlpha = 0.15; ctx.fillStyle = palette[k % palette.length]; ctx.fill(); ctx.globalAlpha = 1; }
      this.text(`${keys[k]}: ${fmt(s[s.length - 1])}`, x + w - pad, top + this.px(6 + k * 13), { align: 'right', size: 10, color: palette[k % palette.length], weight: 600 });
    });
  }

  /** A cellular grid: its cells while running (coloured by state), a preview of the first state otherwise. */
  drawCells(b, w, h, selected, live) {
    const ctx = this.ctx; const c = this.colors;
    const cols = Math.max(2, Number(b.props.cols) || 20); const rows = Math.max(2, Number(b.props.rows) || 20);
    const cw = w / cols; const ch = h / rows;
    const states = b.props.states ?? [];
    if (live?.cells) {
      for (let s2 = 0; s2 < states.length; s2++) {
        ctx.fillStyle = states[s2].color;
        ctx.beginPath();
        for (let i = 0; i < live.cells.length; i++) if (live.cells[i] === s2) ctx.rect(-w / 2 + (i % cols) * cw, -h / 2 + Math.floor(i / cols) * ch, cw + 0.01, ch + 0.01);
        ctx.fill();
      }
    } else {
      ctx.fillStyle = states[0]?.color ?? '#e2e8f0'; ctx.globalAlpha = 0.35; ctx.fillRect(-w / 2, -h / 2, w, h); ctx.globalAlpha = 1;
      if (cw * this.view.scale > 4) { ctx.strokeStyle = 'rgba(100,116,139,0.25)'; ctx.lineWidth = this.px(1); ctx.beginPath(); for (let i = 1; i < cols; i++) { ctx.moveTo(-w / 2 + i * cw, -h / 2); ctx.lineTo(-w / 2 + i * cw, h / 2); } for (let j = 1; j < rows; j++) { ctx.moveTo(-w / 2, -h / 2 + j * ch); ctx.lineTo(w / 2, -h / 2 + j * ch); } ctx.stroke(); }
    }
    ctx.strokeStyle = selected ? c.accent : '#15803d'; ctx.lineWidth = this.px(selected ? 2.4 : 1.4); ctx.strokeRect(-w / 2, -h / 2, w, h);
    this.text(`${b.name} · ${cols}×${rows}`, -w / 2 + this.px(6), -h / 2 - this.px(9), { align: 'left', color: '#15803d', size: 11, weight: 700 });
  }

  drawDynamic(sim) {
    const ctx = this.ctx;
    const k = this.view.scale;
    // Agents.
    for (const pop of sim.agentViews()) {
      const r = Math.max(this.px(1.6), pop.shape === 'dot' ? 0.18 : 0.25);
      const co = pop.coords;
      for (let s = 0; s < pop.states.length; s++) {
        ctx.fillStyle = pop.states[s].color;
        ctx.beginPath();
        for (let i = 0; i < co.length; i += 3) if (co[i + 2] === s) { ctx.moveTo(co[i] + r, co[i + 1]); ctx.arc(co[i], co[i + 1], r, 0, TAU); }
        ctx.fill();
      }
    }
    // Workers of resource pools.
    for (const w of sim.workerViews()) {
      if (w.off) continue;
      ctx.fillStyle = w.busy ? '#16a34a' : '#94a3b8';
      ctx.beginPath(); ctx.arc(w.x, w.y, 0.28, 0, TAU); ctx.fill();
      ctx.strokeStyle = this.colors.surface; ctx.lineWidth = this.px(1); ctx.stroke();
    }
    // Vehicles.
    for (const v of sim.vehicleViews()) {
      ctx.save(); ctx.translate(v.x, v.y); ctx.rotate(v.heading);
      const L = v.kind === 'forklift' ? 1.8 : v.kind === 'drone' ? 0.8 : 1.4; const W = v.kind === 'drone' ? 0.8 : 0.9;
      ctx.fillStyle = v.kind === 'forklift' ? '#f59e0b' : v.kind === 'drone' ? '#64748b' : '#ea580c';
      roundRect(ctx, -L / 2, -W / 2, L, W, 0.15); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(L / 2 - 0.25, -W / 2 + 0.1, 0.15, W - 0.2);
      ctx.restore();
    }
    // Entities.
    const size = clamp(0.45, this.px(3), 2);
    for (const { e, x, y, heading } of sim.entityViews()) {
      ctx.fillStyle = e.color;
      if (e.shape === 'car' || e.shape === 'truck' || e.shape === 'bus') {
        const L = e.shape === 'car' ? 4.2 : e.shape === 'truck' ? 7 : 10; const W = e.shape === 'car' ? 1.8 : 2.4;
        ctx.save(); ctx.translate(x, y); ctx.rotate(heading);
        roundRect(ctx, -L / 2, -W / 2, L, W, 0.4); ctx.fill();
        ctx.fillStyle = 'rgba(15,23,42,0.45)'; ctx.fillRect(L * 0.05, -W / 2 + 0.2, L * 0.22, W - 0.4);
        ctx.restore();
      } else if (e.shape === 'person' || e.shape === 'patient' || e.shape === 'part' || e.shape === 'bottle') {
        ctx.beginPath(); ctx.arc(x, y, size * 0.55, 0, TAU); ctx.fill();
        if (k > 10) { ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = this.px(1); ctx.stroke(); }
      } else if (e.shape === 'pallet') {
        ctx.fillRect(x - size * 0.75, y - size * 0.75, size * 1.5, size * 1.5);
        ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = this.px(1); ctx.strokeRect(x - size * 0.75, y - size * 0.75, size * 1.5, size * 1.5);
      } else {
        ctx.fillRect(x - size / 2, y - size / 2, size, size);
        if (k > 10) { ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = this.px(1); ctx.strokeRect(x - size / 2, y - size / 2, size, size); }
      }
    }
  }

  drawOverlay(model, sel) {
    const ctx = this.ctx; const c = this.colors;
    // Selection outlines and handles.
    for (const b of model.blocks) {
      if (!sel.has(b.id)) continue;
      if (isPathType(b.type)) {
        for (const [x, y] of pathPoints(b)) { ctx.fillStyle = c.surface; ctx.strokeStyle = c.accent; ctx.lineWidth = this.px(1.6); ctx.beginPath(); ctx.arc(x, y, this.px(5), 0, TAU); ctx.fill(); ctx.stroke(); }
        continue;
      }
      const q = blockBounds(b);
      ctx.strokeStyle = c.accent; ctx.lineWidth = this.px(1); ctx.setLineDash([this.px(4), this.px(3)]);
      ctx.strokeRect(q.x0 - this.px(4), q.y0 - this.px(4), q.x1 - q.x0 + this.px(8), q.y1 - q.y0 + this.px(8));
      ctx.setLineDash([]);
      if (BLOCK_TYPES[b.type].resizable && sel.size === 1) {
        for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const x = b.x + (sx * b.w) / 2; const y = b.y + (sy * b.h) / 2; ctx.fillStyle = c.surface; ctx.strokeStyle = c.accent; ctx.lineWidth = this.px(1.5); ctx.fillRect(x - this.px(4), y - this.px(4), this.px(8), this.px(8)); ctx.strokeRect(x - this.px(4), y - this.px(4), this.px(8), this.px(8)); }
      }
    }
    const d = this.drag;
    if (d?.kind === 'box') {
      const crossing = d.wx < d.start[0];
      ctx.fillStyle = crossing ? 'rgba(22,163,74,0.08)' : 'rgba(37,99,235,0.08)';
      ctx.strokeStyle = crossing ? '#16a34a' : c.accent; ctx.lineWidth = this.px(1);
      if (crossing) ctx.setLineDash([this.px(5), this.px(3)]);
      ctx.fillRect(d.start[0], d.start[1], d.wx - d.start[0], d.wy - d.start[1]);
      ctx.strokeRect(d.start[0], d.start[1], d.wx - d.start[0], d.wy - d.start[1]);
      ctx.setLineDash([]);
    }
    if (d?.kind === 'connect') {
      const target = this.portAt(d.wx, d.wy, 'in');
      const [tx, ty] = target ? [target.p.x, target.p.y] : [d.wx, d.wy];
      ctx.strokeStyle = c.accent; ctx.lineWidth = this.px(2); ctx.setLineDash([this.px(6), this.px(4)]);
      ctx.beginPath(); ctx.moveTo(d.start[0], d.start[1]); ctx.lineTo(tx, ty); ctx.stroke(); ctx.setLineDash([]);
      this.arrow(d.start[0], d.start[1], tx, ty, c.accent, this.px(10));
      if (target) { ctx.strokeStyle = c.accent; ctx.lineWidth = this.px(2); ctx.beginPath(); ctx.arc(tx, ty, this.px(8), 0, TAU); ctx.stroke(); }
    }
    // Placing: a ghost of the block (or the path so far) under the pointer.
    if (this.placing && this.mouse.inside) {
      const x = this.snap(this.mouse.wx); const y = this.snap(this.mouse.wy);
      const spec = BLOCK_TYPES[this.placing.type];
      ctx.globalAlpha = 0.55;
      if (spec.path) {
        const pts = [...this.placing.points, [x, y]];
        ctx.strokeStyle = spec.color; ctx.lineWidth = baseOf(this.placing.type) === 'road' ? 7 : baseOf(this.placing.type) === 'wall' ? 0.25 : 0.8; ctx.lineJoin = 'round';
        ctx.beginPath(); pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py))); ctx.stroke();
        let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
        ctx.globalAlpha = 1;
        this.text(`${L.toFixed(1)} m`, x, y - this.px(16), { size: 11, bg: c.surface, color: c.text });
      } else {
        ctx.fillStyle = spec.color; ctx.fillRect(x - spec.w / 2, y - spec.h / 2, spec.w, spec.h);
      }
      ctx.globalAlpha = 1;
      ctx.strokeStyle = c.accent; ctx.lineWidth = this.px(1);
      ctx.beginPath(); ctx.moveTo(x - this.px(8), y); ctx.lineTo(x + this.px(8), y); ctx.moveTo(x, y - this.px(8)); ctx.lineTo(x, y + this.px(8)); ctx.stroke();
    }
  }

  /** PNG of the drawing (File › Export picture). */
  snapshot(sim = null) { this.render(sim); return this.canvas.toDataURL('image/png'); }
}

export function fmt(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  const a = Math.abs(n);
  if (a >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (a >= 1e4) return `${(n / 1e3).toFixed(1)}k`;
  if (a >= 100) return n.toFixed(0);
  if (a >= 1) return n.toFixed(2).replace(/\.?0+$/, '');
  return n.toFixed(3).replace(/\.?0+$/, '') || '0';
}

/** Green → yellow → red for 0 → 1 (utilization, fill). */
export function heatColor(u) {
  const x = clamp(Number(u) || 0, 0, 1);
  const hue = 130 - 130 * x;
  return `hsl(${hue}, 72%, 48%)`;
}

function mix(a, b, f) {
  const pa = parse(a); const pb = parse(b);
  if (!pa || !pb) return a;
  return `rgb(${Math.round(pa[0] * (1 - f) + pb[0] * f)}, ${Math.round(pa[1] * (1 - f) + pb[1] * f)}, ${Math.round(pa[2] * (1 - f) + pb[2] * f)})`;
}
function parse(c) {
  const s = String(c).trim();
  let m = /^#([0-9a-f]{6})$/i.exec(s);
  if (m) return [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16)];
  m = /^#([0-9a-f]{3})$/i.exec(s);
  if (m) return m[1].split('').map((h) => parseInt(h + h, 16));
  m = /^rgba?\(([^)]+)\)$/i.exec(s);
  if (m) return m[1].split(',').slice(0, 3).map((x) => Number(x.trim()));
  return null;
}
