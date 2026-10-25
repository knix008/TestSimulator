// The drawing view: the page with its grid, rulers, guides and page breaks,
// the shapes (drawn by render/svg.js), and everything done with the mouse —
// selecting (click, Shift/Ctrl+click, area), moving (snapping to the grid, to
// other shapes and to guides), resizing, rotating, the yellow control handles,
// connector ends (glue to points or shapes), connector bends, the drawing
// tools (rectangle, ellipse, line, freehand, polyline, text, connector),
// AutoConnect arrows, in-place text editing, zooming and panning, the Pan &
// Zoom window and the page tabs. Edits go through the app (one undo step each).
import { center, clamp, dist, pageToLocal, rectContains, rectInside, rotatePoint, shapeBounds, shapeContains, snap as snapTo, unionBounds, polylineDistance } from '../domain/geometry.js';
import { contentBounds, createConnector, createShape, drawingSize, findShape, formatLength, isConnector, isGroup, layerState, pagePoints, topLevel, withMembers, containedShapes } from '../domain/diagram.js';
import { glueTarget } from '../domain/routing.js';
import { masterById, shapeParams } from '../domain/stencils.js';
import { pageColor, designById } from '../domain/designs.js';
import { pageBody, renderPageSvg, DEFAULT_FONT } from '../render/svg.js';
import { CANVAS_ZOOM, GRID_SIZES } from '../domain/settings.js';
import { escapeHtml, frameThrottle } from '../ui/dom.js';
import { icon } from '../icons.js';

/** Empty canvas kept around the drawing on every side, in screens; scrolling near an edge adds more. */
const PAD_SCREENS = 1.5;
/** The stage never grows past this many pixels per side (browsers cap element sizes). */
const MAX_STAGE = 4_000_000;
const HANDLE = 8;
const ROT_OFFSET = 26;
const SNAP_PX = 7;
const NS = 'http://www.w3.org/2000/svg';
const n = (v) => Math.round(v * 100) / 100;

/** Canvas text measuring with a cache (the renderer asks for the same strings again and again). */
export function canvasMeasure() {
  const cache = new Map();
  const context = document.createElement('canvas').getContext('2d');
  return (text, style) => {
    const size = style.fontSize ?? 13;
    const font = `${style.italic ? 'italic ' : ''}${style.bold ? 700 : 400} ${size}px ${style.font ? `"${style.font}", ` : ''}${DEFAULT_FONT}`;
    const key = `${font}\u0000${text}`;
    let width = cache.get(key);
    if (width === undefined) {
      context.font = font;
      width = context.measureText(text).width;
      if (cache.size > 20000) cache.clear();
      cache.set(key, width);
    }
    return width;
  };
}

export class CanvasView {
  constructor(app, host) {
    this.app = app;
    this.host = host;
    this.measure = app.measure;
    this.drag = null;
    this.hover = null;
    this.glue = null;
    this.guidesShown = [];
    this.poly = null;
    this.editing = null;
    host.classList.add('canvas-host');
    host.innerHTML = `
      <div class="canvas-view">
        <div class="page-tabs" role="tablist"></div>
        <div class="canvas-main">
          <div class="ruler-corner" title="${escapeHtml(app.t('canvas.rulerCorner'))}">${icon('rulers', 'icon tiny')}</div>
          <canvas class="ruler ruler-h" title="${escapeHtml(app.t('canvas.rulerTip'))}"></canvas>
          <canvas class="ruler ruler-v" title="${escapeHtml(app.t('canvas.rulerTip'))}"></canvas>
          <div class="canvas-scroll" tabindex="0" aria-label="${escapeHtml(app.t('view.drawing'))}">
            <div class="canvas-stage">
              <svg class="canvas-svg" xmlns="${NS}"><defs class="canvas-defs"></defs>
                <g class="viewport">
                  <g class="page-under"></g>
                  <g class="content"></g>
                  <g class="page-over"></g>
                </g>
              </svg>
              <svg class="canvas-overlay" xmlns="${NS}"></svg>
            </div>
          </div>
          <div class="minimap" hidden><svg class="minimap-svg"></svg><div class="minimap-view"></div></div>
        </div>
      </div>`;
    this.root = host.querySelector('.canvas-view');
    this.scroll = host.querySelector('.canvas-scroll');
    this.stage = host.querySelector('.canvas-stage');
    this.svg = host.querySelector('.canvas-svg');
    this.defs = host.querySelector('.canvas-defs');
    this.viewport = host.querySelector('.viewport');
    this.under = host.querySelector('.page-under');
    this.content = host.querySelector('.content');
    this.over = host.querySelector('.page-over');
    this.overlay = host.querySelector('.canvas-overlay');
    this.rulerH = host.querySelector('.ruler-h');
    this.rulerV = host.querySelector('.ruler-v');
    this.minimap = host.querySelector('.minimap');
    this.tabs = host.querySelector('.page-tabs');
    this.drawFrame = frameThrottle(() => this.drawLive());
    this.bind();
    this.resizeObserver = new ResizeObserver(() => { this.drawRulers(); this.drawMinimap(); });
    this.resizeObserver.observe(this.scroll);
  }

  get doc() { return this.app.doc(); }
  get page() { return this.app.page(); }
  get z() { return (this.doc?.view.zoom ?? 100) / 100; }

  destroy() {
    this.finishTextEdit(true);
    this.resizeObserver.disconnect();
    window.removeEventListener('keyup', this.onKeyUp);
    this.host.innerHTML = '';
    this.host.classList.remove('canvas-host');
  }

  // ───────────────────────── coordinates

  /** Client (window) point → page point. */
  toPage(clientX, clientY) {
    const r = this.stage.getBoundingClientRect();
    const w = this.world ?? { x: 0, y: 0 };
    return { x: (clientX - r.left) / this.z + w.x, y: (clientY - r.top) / this.z + w.y };
  }

  /** Page point → stage px. */
  toStage(p) {
    const w = this.world ?? { x: 0, y: 0 };
    return { x: (p.x - w.x) * this.z, y: (p.y - w.y) * this.z };
  }

  gridStep() {
    const page = this.page;
    let step = page?.gridSize > 0 ? page.gridSize : GRID_SIZES[this.app.settings().gridSize] ?? 20;
    while (step * this.z < 8) step *= 2;
    while (step * this.z > 80 && step > 2.5) step /= 2;
    return step;
  }

  // ───────────────────────── rendering

  /** Full redraw: stage size, page, shapes, overlay, rulers, tabs, minimap. */
  render() {
    const doc = this.doc;
    if (!doc) return;
    if (doc.view.zoom == null) { this.layoutStage(); this.fitPage(); return; }
    this.layoutStage();
    this.renderContent();
    this.renderOverlay();
    this.renderTabs();
    this.drawRulers();
    this.drawMinimap();
    if (doc.view.scrollX != null) this.restoreScroll();
  }

  /** The drawing changed: shapes, overlay, tabs, minimap. */
  update() {
    this.layoutStage();
    this.renderContent();
    this.renderOverlay();
    this.renderTabs();
    this.drawMinimap();
    this.drawRulers();
  }

  selectionChanged() {
    this.renderOverlay();
    this.drawRulers();
  }

  routes() { return this.app.tab().routes(this.page); }

  size() {
    const routes = this.routes();
    return drawingSize(this.page, (shape) => routes.get(shape.id) ?? { points: [] });
  }

  /** The page area plus everything drawn (shapes may lie anywhere, also left of / above the page). */
  drawingBox(size = this.size()) {
    const routes = this.routes();
    const content = contentBounds(this.page, null, (shape) => routes.get(shape.id) ?? { points: [] });
    return unionBounds([{ x: 0, y: 0, w: size.width, h: size.height }, content]);
  }

  /**
   * The canvas is endless: the stage covers the drawing plus a screen and a half of empty grid
   * on every side, and `include` (a page box that must be reachable). While the same page is
   * shown it only grows, so the view never jumps.
   */
  worldBox(size, include = null) {
    const z = this.z;
    const padX = ((this.scroll.clientWidth || 800) / z) * PAD_SCREENS;
    const padY = ((this.scroll.clientHeight || 600) / z) * PAD_SCREENS;
    const b = unionBounds([this.drawingBox(size), include]);
    let world = { x: b.x - padX, y: b.y - padY, w: b.w + padX * 2, h: b.h + padY * 2 };
    if (this.world && this.worldPage === this.page.id) {
      const grown = unionBounds([world, this.world]);
      if (grown.w * z <= MAX_STAGE && grown.h * z <= MAX_STAGE) world = grown;
    }
    return world;
  }

  layoutStage(include = null) {
    const size = this.size();
    const z = this.z;
    const before = this.world && this.worldPage === this.page.id && this.worldZ === z ? this.world : null;
    const world = this.worldBox(size, include);
    this.world = world;
    this.worldPage = this.page.id;
    this.worldZ = z;
    const w = Math.ceil(world.w * z);
    const h = Math.ceil(world.h * z);
    this.stage.style.width = `${w}px`;
    this.stage.style.height = `${h}px`;
    for (const svg of [this.svg, this.overlay]) { svg.setAttribute('width', w); svg.setAttribute('height', h); }
    this.viewport.setAttribute('transform', `translate(${n(-world.x * z)} ${n(-world.y * z)}) scale(${z})`);
    // Grown to the left / top: scroll by as much, so the drawing stays where it was on screen.
    if (before) {
      const dx = (before.x - world.x) * z;
      const dy = (before.y - world.y) * z;
      this.growing = true;
      if (dx > 0.5) this.scroll.scrollLeft += dx;
      if (dy > 0.5) this.scroll.scrollTop += dy;
      this.growing = false;
    }
    this.drawPage(size);
  }

  /** Scrolled near an edge of the stage: add another stretch of empty canvas there. */
  growNearEdges() {
    if (this.growing || !this.world || !this.doc) return;
    const sc = this.scroll;
    const vw = sc.clientWidth; const vh = sc.clientHeight;
    const near = sc.scrollLeft < vw * 0.5 || sc.scrollTop < vh * 0.5 || sc.scrollLeft + vw > sc.scrollWidth - vw * 0.5 || sc.scrollTop + vh > sc.scrollHeight - vh * 0.5;
    if (!near) return;
    const z = this.z;
    const view = { x: this.world.x + sc.scrollLeft / z, y: this.world.y + sc.scrollTop / z, w: vw / z, h: vh / z };
    this.layoutStage({ x: view.x - view.w, y: view.y - view.h, w: view.w * 3, h: view.h * 3 });
  }

  /** Scroll position as page pixels at the current zoom (independent of how far the canvas has grown). */
  saveScroll() {
    if (!this.doc || !this.world) return;
    const z = this.z;
    this.doc.view.scrollX = this.scroll.scrollLeft + this.world.x * z;
    this.doc.view.scrollY = this.scroll.scrollTop + this.world.y * z;
  }

  restoreScroll() {
    const view = this.doc.view;
    const z = this.z;
    const vw = this.scroll.clientWidth / z; const vh = this.scroll.clientHeight / z;
    this.layoutStage({ x: view.scrollX / z, y: view.scrollY / z, w: vw, h: vh });
    this.growing = true;
    this.scroll.scrollLeft = view.scrollX - this.world.x * z;
    this.scroll.scrollTop = view.scrollY - this.world.y * z;
    this.growing = false;
  }

  /** Scrolls so the page point `p` is at (x, y) in the view, growing the canvas when needed. */
  scrollPageTo(p, x, y) {
    const z = this.z;
    const vw = this.scroll.clientWidth / z; const vh = this.scroll.clientHeight / z;
    this.layoutStage({ x: p.x - x / z, y: p.y - y / z, w: vw, h: vh });
    this.growing = true;
    this.scroll.scrollLeft = (p.x - this.world.x) * z - x;
    this.scroll.scrollTop = (p.y - this.world.y) * z - y;
    this.growing = false;
    this.saveScroll();
  }

  /** Page background, grid, page breaks (under the shapes) and guides (over them). */
  drawPage(size) {
    const page = this.page;
    const doc = this.doc.doc;
    const s = this.app.settings();
    const z = this.z;
    const fill = pageColor(doc, page);
    const dark = designById(doc.design).dark;
    const step = this.gridStep();
    const minor = dark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.07)';
    const major = dark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.14)';
    const gridOn = s.showGrid && page.grid !== false;
    const world = this.world ?? { x: 0, y: 0, w: size.width, h: size.height };
    // The whole canvas is drawing paper; the page shows only as the outline of what prints on one sheet.
    let html = `<rect class="page-bg" x="${n(world.x)}" y="${n(world.y)}" width="${n(world.w)}" height="${n(world.h)}" fill="${fill}"/>`;
    if (gridOn) {
      html += `<defs><pattern id="grid-minor" width="${step}" height="${step}" patternUnits="userSpaceOnUse"><path d="M${step} 0V${step}H0" fill="none" stroke="${minor}" stroke-width="${1 / z}"/></pattern>
        <pattern id="grid-major" width="${step * 5}" height="${step * 5}" patternUnits="userSpaceOnUse"><rect width="${step * 5}" height="${step * 5}" fill="url(#grid-minor)"/><path d="M${step * 5} 0V${step * 5}H0" fill="none" stroke="${major}" stroke-width="${1 / z}"/></pattern></defs>`;
      html += `<rect x="${n(world.x)}" y="${n(world.y)}" width="${n(world.w)}" height="${n(world.h)}" fill="url(#grid-major)"/>`;
    }
    if (s.showPageBreaks) {
      html += `<rect class="page-outline" x="0" y="0" width="${size.width}" height="${size.height}" fill="none" stroke="${major}" stroke-width="${1.5 / z}"/>`;
      let d = '';
      for (let i = 1; i < size.tilesX; i++) d += `M${i * page.width} 0V${size.height}`;
      for (let j = 1; j < size.tilesY; j++) d += `M0 ${j * page.height}H${size.width}`;
      html += `<path d="${d}" fill="none" stroke="#e5484d" stroke-opacity="0.55" stroke-width="${1.5 / z}" stroke-dasharray="${8 / z} ${5 / z}"/>`;
    }
    this.under.innerHTML = html;
    let guides = '';
    if (s.showGuides) {
      for (const g of page.guides ?? []) {
        const selected = this.app.state.guide === g.id;
        guides += g.orient === 'v'
          ? `<line class="guide" data-guide="${g.id}" x1="${g.pos}" y1="${n(world.y)}" x2="${g.pos}" y2="${n(world.y + world.h)}" stroke="${selected ? '#e5484d' : '#2f8cff'}" stroke-width="${(selected ? 2 : 1) / z}" stroke-dasharray="${6 / z} ${4 / z}"/>`
          : `<line class="guide" data-guide="${g.id}" x1="${n(world.x)}" y1="${g.pos}" x2="${n(world.x + world.w)}" y2="${g.pos}" stroke="${selected ? '#e5484d' : '#2f8cff'}" stroke-width="${(selected ? 2 : 1) / z}" stroke-dasharray="${6 / z} ${4 / z}"/>`;
      }
    }
    this.over.innerHTML = guides;
  }

  renderContent() {
    const tab = this.app.tab();
    const doc = tab.doc;
    const page = this.page;
    const index = doc.pages.indexOf(page);
    const { body, defs } = pageBody(doc, page, { measure: this.measure, routes: this.routes(), language: this.app.language() });
    void index;
    this.defs.innerHTML = defs.join('');
    this.content.innerHTML = body;
    // Shapes being dragged or edited are dimmed.
    if (this.editing) this.content.querySelector(`[data-id="${CSS.escape(this.editing.id)}"] .shape-text`)?.setAttribute('opacity', '0');
  }

  // ───────────────────────── overlay (handles)

  renderOverlay() {
    const z = this.z;
    const page = this.page;
    const sel = this.app.selection();
    const parts = [];
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#2f6fde';
    const routes = this.routes();
    const s = this.app.settings();
    const tool = this.app.tool();
    // Comment markers.
    for (const shape of page.shapes) {
      if (!shape.comments?.length || isConnector(shape) || isGroup(shape) || !layerState(page, shape).visible) continue;
      const b = shapeBounds(shape);
      const p = this.toStage({ x: b.x + b.w, y: b.y });
      parts.push(`<g class="comment-mark" data-comment="${escapeHtml(shape.id)}" transform="translate(${n(p.x - 2)} ${n(p.y - 16)})"><path d="M0 0h16v11H7l-4 4v-4H0z" fill="#ffd54f" stroke="#a37b00" stroke-width="1"/><text x="8" y="9" font-size="8" text-anchor="middle" fill="#5d4500">${shape.comments.length}</text></g>`);
    }
    // Hovered shape (connection points, glue target).
    const hoverId = this.glue?.id ?? this.hover?.id;
    const showPoints = s.showConnectionPoints && (tool === 'connector' || tool === 'line' || this.drag?.type === 'conEnd' || this.drag?.type === 'create' && ['connector', 'line'].includes(this.drag.tool) || this.drag?.type === 'autoDrag');
    if (hoverId) {
      const shape = findShape(page, hoverId);
      if (shape && !isConnector(shape) && !isGroup(shape)) {
        if (this.glue) parts.push(this.boxPath(shape, '#22a06b', 2.5, ''));
        if (showPoints || this.glue) {
          pagePoints(shape).forEach((pt, i) => {
            const q = this.toStage(pt);
            const active = this.glue?.pt === i;
            parts.push(`<path d="M${q.x - 4} ${q.y - 4}l8 8M${q.x + 4} ${q.y - 4}l-8 8" stroke="${active ? '#22a06b' : '#2f6fde'}" stroke-width="${active ? 3 : 1.6}"/>`);
          });
        }
      }
    }
    // Selection.
    const ids = sel.ids.filter((id) => findShape(page, id));
    const shapes = ids.map((id) => findShape(page, id));
    if (shapes.length === 1 && isConnector(shapes[0])) {
      parts.push(this.connectorHandles(shapes[0], routes.get(shapes[0].id), accent));
    } else if (shapes.length === 1) {
      parts.push(this.shapeHandles(shapes[0], accent));
    } else if (shapes.length > 1) {
      for (const shape of shapes) {
        if (isConnector(shape)) {
          const r = routes.get(shape.id);
          if (r) parts.push(`<polyline points="${r.points.map((p) => { const q = this.toStage(p); return `${n(q.x)},${n(q.y)}`; }).join(' ')}" fill="none" stroke="${accent}" stroke-width="3" stroke-opacity="0.45"/>`);
        } else parts.push(this.boxPath(shape, accent, shape.id === sel.primary ? 2 : 1, '4 3'));
      }
      const box = this.selectionBox(ids);
      if (box) parts.push(this.boxHandles(box, accent, true));
    }
    // AutoConnect arrows.
    if (this.auto) parts.push(this.autoArrows(this.auto, accent));
    // Live drawing feedback.
    if (this.drag?.preview) parts.push(this.drag.preview);
    if (this.poly?.points.length) {
      const pts = [...this.poly.points, this.poly.cursor].filter(Boolean).map((p) => this.toStage(p));
      parts.push(`<polyline points="${pts.map((q) => `${n(q.x)},${n(q.y)}`).join(' ')}" fill="none" stroke="${accent}" stroke-width="1.5" stroke-dasharray="5 3"/>`);
      parts.push(...pts.slice(0, -1).map((q) => `<circle cx="${q.x}" cy="${q.y}" r="3" fill="${accent}"/>`));
    }
    for (const g of this.guidesShown) {
      parts.push(g.orient === 'v' ? `<line x1="${this.toStage({ x: g.pos, y: 0 }).x}" y1="0" x2="${this.toStage({ x: g.pos, y: 0 }).x}" y2="${this.stage.offsetHeight}" stroke="#ff2d95" stroke-width="1" stroke-dasharray="4 3"/>`
        : `<line x1="0" y1="${this.toStage({ x: 0, y: g.pos }).y}" x2="${this.stage.offsetWidth}" y2="${this.toStage({ x: 0, y: g.pos }).y}" stroke="#ff2d95" stroke-width="1" stroke-dasharray="4 3"/>`);
    }
    this.overlay.innerHTML = parts.join('');
  }

  /** Outline of a (rotated) shape in stage px. */
  boxPath(shape, color, width, dash) {
    const c = center(shape);
    const pts = [[0, 0], [shape.w, 0], [shape.w, shape.h], [0, shape.h]].map(([x, y]) => this.toStage(rotatePoint({ x: shape.x + x, y: shape.y + y }, c, shape.angle ?? 0)));
    return `<polygon points="${pts.map((p) => `${n(p.x)},${n(p.y)}`).join(' ')}" fill="none" stroke="${color}" stroke-width="${width}" ${dash ? `stroke-dasharray="${dash}"` : ''}/>`;
  }

  selectionBox(ids) {
    const page = this.page;
    const routes = this.routes();
    return unionBounds(ids.map((id) => {
      const shape = findShape(page, id);
      if (!shape) return null;
      if (isConnector(shape)) { const r = routes.get(id); if (!r) return null; const xs = r.points.map((p) => p.x); const ys = r.points.map((p) => p.y); return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }; }
      return shapeBounds(shape);
    }));
  }

  /** Handles of one 2-D shape: 8 resize squares, the rotation dot, the yellow control diamonds. */
  shapeHandles(shape, accent) {
    const out = [this.boxPath(shape, accent, 1.5, '5 3')];
    const c = center(shape);
    const locked = shape.locked ?? {};
    const at = (lx, ly) => this.toStage(rotatePoint({ x: shape.x + lx, y: shape.y + ly }, c, shape.angle ?? 0));
    if (!locked.size) {
      HANDLE_POINTS.forEach(([hx, hy], i) => {
        const p = at(hx * shape.w, hy * shape.h);
        out.push(`<rect class="handle" data-handle="resize" data-index="${i}" x="${n(p.x - HANDLE / 2)}" y="${n(p.y - HANDLE / 2)}" width="${HANDLE}" height="${HANDLE}" fill="#ffffff" stroke="${accent}" stroke-width="1.5" style="cursor:${cursorFor(i, shape.angle ?? 0)}"/>`);
      });
    }
    if (!locked.rotate && !isGroup(shape) || (isGroup(shape) && !locked.rotate)) {
      const top = at(shape.w / 2, 0);
      const r = at(shape.w / 2, -ROT_OFFSET / this.z);
      out.push(`<line x1="${n(top.x)}" y1="${n(top.y)}" x2="${n(r.x)}" y2="${n(r.y)}" stroke="${accent}" stroke-width="1"/>`);
      out.push(`<circle class="handle" data-handle="rotate" cx="${n(r.x)}" cy="${n(r.y)}" r="5.5" fill="#ffffff" stroke="${accent}" stroke-width="1.6" style="cursor:grab"/>`);
    }
    if (!isGroup(shape)) {
      const master = masterById(shape.master);
      const params = shapeParams(shape, master);
      for (const [key, def] of Object.entries(master.params ?? {})) {
        if (typeof def.handle !== 'function') continue;
        let [lx, ly] = def.handle(shape.w, shape.h, params[key], params);
        if (shape.flipH) lx = shape.w - lx;
        if (shape.flipV) ly = shape.h - ly;
        const p = at(lx, ly);
        out.push(`<path class="handle" data-handle="control" data-key="${key}" d="M${n(p.x)} ${n(p.y - 6)}l6 6-6 6-6-6z" fill="#ffd000" stroke="#8a6d00" stroke-width="1" style="cursor:pointer"/>`);
      }
    }
    return out.join('');
  }

  /** Handles around a box of several shapes (axis-aligned). */
  boxHandles(box, accent, rotate) {
    const out = [];
    const tl = this.toStage({ x: box.x, y: box.y });
    const w = box.w * this.z;
    const h = box.h * this.z;
    out.push(`<rect x="${n(tl.x)}" y="${n(tl.y)}" width="${n(w)}" height="${n(h)}" fill="none" stroke="${accent}" stroke-width="1" stroke-dasharray="6 3"/>`);
    HANDLE_POINTS.forEach(([hx, hy], i) => {
      out.push(`<rect class="handle" data-handle="resize" data-index="${i}" x="${n(tl.x + hx * w - HANDLE / 2)}" y="${n(tl.y + hy * h - HANDLE / 2)}" width="${HANDLE}" height="${HANDLE}" fill="#ffffff" stroke="${accent}" stroke-width="1.5" style="cursor:${cursorFor(i, 0)}"/>`);
    });
    if (rotate) out.push(`<line x1="${n(tl.x + w / 2)}" y1="${n(tl.y)}" x2="${n(tl.x + w / 2)}" y2="${n(tl.y - ROT_OFFSET)}" stroke="${accent}"/><circle class="handle" data-handle="rotate" cx="${n(tl.x + w / 2)}" cy="${n(tl.y - ROT_OFFSET)}" r="5.5" fill="#fff" stroke="${accent}" stroke-width="1.6" style="cursor:grab"/>`);
    return out.join('');
  }

  /** Connector handles: the two ends, a square on each segment (to bend it), the bends, the label. */
  connectorHandles(connector, route, accent) {
    if (!route) return '';
    const pts = route.points.map((p) => this.toStage(p));
    const out = [`<polyline points="${pts.map((p) => `${n(p.x)},${n(p.y)}`).join(' ')}" fill="none" stroke="${accent}" stroke-width="5" stroke-opacity="0.25"/>`];
    if (!route.curve) {
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1]; const b = pts[i];
        if (dist(a, b) < 26) continue;
        out.push(`<rect class="handle" data-handle="segment" data-index="${i}" x="${n((a.x + b.x) / 2 - 4)}" y="${n((a.y + b.y) / 2 - 4)}" width="8" height="8" fill="#ffffff" stroke="${accent}" stroke-width="1.2" style="cursor:${Math.abs(a.x - b.x) < 0.5 ? 'ew-resize' : Math.abs(a.y - b.y) < 0.5 ? 'ns-resize' : 'move'}"/>`);
      }
    }
    (connector.waypoints ?? []).forEach((wp, i) => {
      const p = this.toStage(wp);
      out.push(`<path class="handle" data-handle="bend" data-index="${i}" d="M${n(p.x)} ${n(p.y - 6)}l6 6-6 6-6-6z" fill="${accent}" stroke="#ffffff" stroke-width="1.2" style="cursor:move"/>`);
    });
    for (const [key, p] of [['from', pts[0]], ['to', pts[pts.length - 1]]]) {
      const glued = Boolean(connector[key]?.id);
      out.push(`<circle class="handle" data-handle="end" data-end="${key}" cx="${n(p.x)}" cy="${n(p.y)}" r="6" fill="${glued ? '#22a06b' : '#ffffff'}" stroke="${glued ? '#0f6b43' : accent}" stroke-width="1.6" style="cursor:crosshair"/>`);
    }
    if (connector.text) {
      const p = this.toStage(route.label);
      out.push(`<path class="handle" data-handle="label" d="M${n(p.x)} ${n(p.y - 5)}l5 5-5 5-5-5z" fill="#ffd000" stroke="#8a6d00" stroke-width="1" style="cursor:move"/>`);
    }
    return out.join('');
  }

  autoArrows(id, accent) {
    const shape = findShape(this.page, id);
    if (!shape || isConnector(shape)) return '';
    const b = shapeBounds(shape);
    const tl = this.toStage({ x: b.x, y: b.y });
    const w = b.w * this.z;
    const h = b.h * this.z;
    const g = 16;
    const arrows = { top: [tl.x + w / 2, tl.y - g, 0], right: [tl.x + w + g, tl.y + h / 2, 90], bottom: [tl.x + w / 2, tl.y + h + g, 180], left: [tl.x - g, tl.y + h / 2, 270] };
    return Object.entries(arrows).map(([side, [x, y, a]]) => `<path class="handle auto-arrow" data-handle="auto" data-side="${side}" d="M0 -7L7 5H-7Z" transform="translate(${n(x)} ${n(y)}) rotate(${a})" fill="${accent}" fill-opacity="0.75" stroke="#ffffff" stroke-width="1" style="cursor:pointer"><title>${escapeHtml(this.app.t('canvas.autoConnect'))}</title></path>`).join('');
  }

  // ───────────────────────── hit testing

  /** What is under a page point: { id, top } (top = the outermost group, or the shape itself). */
  hitTest(p, { connectors = true, subselect = false } = {}) {
    const page = this.page;
    const routes = this.routes();
    const tol = Math.max(3, 6 / this.z);
    for (let i = page.shapes.length - 1; i >= 0; i--) {
      const shape = page.shapes[i];
      if (isGroup(shape)) continue;
      const layer = layerState(page, shape);
      if (!layer.visible || layer.locked) continue;
      if (isConnector(shape)) {
        if (!connectors) continue;
        const r = routes.get(shape.id);
        if (r && polylineDistance(p, r.points) <= tol + (shape.style?.lineWidth ?? 1.5) / 2) return this.pick(shape, subselect);
        continue;
      }
      const master = masterById(shape.master);
      if (master.kind === 'container' || master.id === 'room') {
        if (!shapeContains(shape, p, tol)) continue;
        const l = pageToLocal(shape, p.x, p.y);
        const band = master.header === 'left' ? l.x <= Math.min(36, shape.w) : master.header === 'top' ? l.y <= Math.min(34, shape.h) : false;
        const edge = l.x < tol || l.y < tol || l.x > shape.w - tol || l.y > shape.h - tol;
        if (band || edge) return this.pick(shape, subselect);
        continue;
      }
      if (shapeContains(shape, p, master.kind === 'lineShape' ? tol : 0)) return this.pick(shape, subselect);
    }
    return null;
  }

  pick(shape, subselect) {
    const top = topLevel(this.page, shape.id);
    const sel = this.app.selection().ids;
    // A click on a member of an already selected group selects the member (Visio subselection).
    if (subselect || (top && top.id !== shape.id && sel.length === 1 && (sel[0] === top.id || findShape(this.page, sel[0])?.groupId === shape.groupId))) return { id: shape.id, top: shape.id, shape };
    return { id: shape.id, top: top?.id ?? shape.id, shape };
  }

  // ───────────────────────── events

  bind() {
    this.scroll.addEventListener('scroll', () => {
      if (!this.growing) { this.growNearEdges(); this.saveScroll(); }
      this.drawRulers();
      this.drawMinimapView();
      if (this.editing) this.positionEditor();
    }, { passive: true });
    this.scroll.addEventListener('pointerdown', (event) => this.onPointerDown(event));
    this.scroll.addEventListener('pointermove', (event) => this.onHover(event));
    this.scroll.addEventListener('pointerleave', () => { if (!this.drag) { this.hover = null; if (this.auto && !this.drag) { this.auto = null; } this.renderOverlay(); } });
    this.scroll.addEventListener('dblclick', (event) => this.onDoubleClick(event));
    this.scroll.addEventListener('contextmenu', (event) => this.onContextMenu(event));
    this.scroll.addEventListener('wheel', (event) => {
      if (event.ctrlKey || event.metaKey || this.app.settings().wheelZoom) {
        event.preventDefault();
        const factor = Math.exp(-event.deltaY * 0.0015);
        this.zoomTo(this.z * 100 * factor, event.clientX, event.clientY);
      }
    }, { passive: false });
    this.scroll.addEventListener('dragover', (event) => {
      if ([...(event.dataTransfer?.types ?? [])].includes('application/x-mydiagram-master')) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; }
    });
    this.scroll.addEventListener('drop', (event) => {
      const id = event.dataTransfer?.getData('application/x-mydiagram-master');
      if (!id) return;
      event.preventDefault();
      event.stopPropagation();
      this.app.dropMaster(id, this.toPage(event.clientX, event.clientY));
    });
    // Rulers: drag into the page to make a guide.
    for (const [ruler, orient] of [[this.rulerH, 'h'], [this.rulerV, 'v']]) {
      ruler.addEventListener('pointerdown', (event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        this.drag = { type: 'guide', orient, id: null, start: this.toPage(event.clientX, event.clientY) };
        this.trackPointer(event);
      });
    }
    this.minimap.addEventListener('pointerdown', (event) => this.onMinimapDown(event));
    this.tabs.addEventListener('click', (event) => {
      const tab = event.target.closest('[data-page]');
      if (event.target.closest('[data-page-add]')) return this.app.run('pageNew');
      if (event.target.closest('[data-page-nav]')) return this.app.run(Number(event.target.closest('[data-page-nav]').dataset.pageNav) < 0 ? 'pagePrev' : 'pageNext');
      if (tab) return this.app.goToPage(tab.dataset.page);
      return undefined;
    });
    this.tabs.addEventListener('dblclick', (event) => {
      const tab = event.target.closest('[data-page]');
      if (tab) this.renamePageInline(tab);
    });
    this.tabs.addEventListener('contextmenu', (event) => {
      const tab = event.target.closest('[data-page]');
      event.preventDefault();
      event.stopPropagation();
      if (tab) this.app.goToPage(tab.dataset.page);
      this.app.contextMenu(event, 'pageTab', { pageId: tab?.dataset.page ?? null });
    });
    this.tabs.addEventListener('dragstart', (event) => {
      const tab = event.target.closest('[data-page]');
      if (!tab) return;
      event.dataTransfer.setData('application/x-mydiagram-page', tab.dataset.page);
      event.dataTransfer.effectAllowed = 'move';
    });
    this.tabs.addEventListener('dragover', (event) => { if ([...event.dataTransfer.types].includes('application/x-mydiagram-page')) event.preventDefault(); });
    this.tabs.addEventListener('drop', (event) => {
      const id = event.dataTransfer.getData('application/x-mydiagram-page');
      const tab = event.target.closest('[data-page]');
      if (!id || !tab || tab.dataset.page === id) return;
      event.preventDefault();
      this.app.movePageTo(id, this.doc.doc.pages.findIndex((page) => page.id === tab.dataset.page));
    });
    this.onKeyUp = (event) => { if (event.key === ' ') this.spaceDown = false; };
    window.addEventListener('keyup', this.onKeyUp);
  }

  onHover(event) {
    if (this.drag || this.editing) return;
    const p = this.toPage(event.clientX, event.clientY);
    this.app.pointerAt(p);
    const tool = this.app.tool();
    const hit = event.target.closest?.('[data-handle]') ? null : this.hitTest(p, { connectors: tool === 'pointer' });
    const id = hit?.id ?? null;
    const overArrow = event.target.closest?.('[data-handle="auto"]');
    let auto = this.auto;
    if (!overArrow) {
      const shape = hit ? findShape(this.page, hit.top) : null;
      auto = tool === 'pointer' && this.app.settings().autoConnect && shape && !isConnector(shape) && !isGroup(shape) && !['container', 'text', 'lineShape'].includes(masterById(shape.master).kind) ? shape.id : null;
    }
    const cursor = tool === 'pan' ? 'grab' : tool === 'pointer' ? (hit ? (event.ctrlKey && findShape(this.page, hit.top)?.hyperlink ? 'pointer' : 'move') : 'default') : tool === 'text' ? 'text' : 'crosshair';
    this.scroll.style.cursor = this.spaceDown ? 'grab' : cursor;
    if (id !== this.hover?.id || auto !== this.auto) {
      this.hover = id ? { id } : null;
      this.auto = auto;
      this.renderOverlay();
    }
  }

  onPointerDown(event) {
    if (this.editing && !event.target.closest('.text-editor')) this.finishTextEdit();
    if (event.target.closest('.text-editor')) return;
    this.scroll.focus({ preventScroll: true });
    const p = this.toPage(event.clientX, event.clientY);
    const tool = this.app.tool();
    // Pan: middle button, space + drag, the hand tool.
    if (event.button === 1 || (event.button === 0 && (this.spaceDown || tool === 'pan'))) {
      event.preventDefault();
      this.drag = { type: 'pan', x: event.clientX, y: event.clientY, sx: this.scroll.scrollLeft, sy: this.scroll.scrollTop };
      this.scroll.style.cursor = 'grabbing';
      this.trackPointer(event);
      return;
    }
    if (event.button !== 0) return;
    const handle = event.target.closest('[data-handle]');
    const comment = event.target.closest('[data-comment]');
    if (comment) { this.app.select([comment.dataset.comment]); this.app.showComments(); return; }
    const guide = this.hitGuide(p);
    if (handle) { event.preventDefault(); this.startHandle(handle, event, p); return; }
    if (this.app.formatPainter() && tool === 'pointer') {
      const hit = this.hitTest(p);
      if (hit) { this.app.paintFormat(hit.top); return; }
    }
    if (tool === 'pointer') {
      if (guide && !this.hitTest(p)) {
        this.app.state.guide = guide.id;
        this.drawPage(this.size());
        this.drag = { type: 'guide', orient: guide.orient, id: guide.id, start: p };
        this.trackPointer(event);
        return;
      }
      if (this.app.state.guide) { this.app.state.guide = null; this.drawPage(this.size()); }
      const hit = this.hitTest(p);
      if (hit) {
        const shape = findShape(this.page, hit.top);
        if (event.ctrlKey && shape?.hyperlink && !event.shiftKey) { this.app.followHyperlink(shape); return; }
        const sel = this.app.selection().ids;
        if (event.shiftKey || event.ctrlKey || event.metaKey) {
          if (sel.includes(hit.top) && !event.ctrlKey) { this.app.select(sel.filter((id) => id !== hit.top)); return; }
          if (!sel.includes(hit.top)) this.app.select([...sel, hit.top], { primary: sel[0] ?? hit.top });
        } else if (!sel.includes(hit.top)) this.app.select([hit.top]);
        this.startMove(event, p, { copy: event.ctrlKey && sel.includes(hit.top) });
        return;
      }
      if (!event.shiftKey && !event.ctrlKey) this.app.select([]);
      this.drag = { type: 'marquee', start: p, additive: event.shiftKey || event.ctrlKey, base: [...this.app.selection().ids] };
      this.trackPointer(event);
      return;
    }
    if (tool === 'polyline') { this.polylineClick(p, event); return; }
    if (tool === 'pencil') {
      this.drag = { type: 'pencil', points: [p] };
      this.trackPointer(event);
      return;
    }
    // Rectangle, ellipse, text, line, connector: drag a box or a line.
    const start = ['connector', 'line'].includes(tool) ? this.glueAt(p, new Set()) : null;
    this.drag = { type: 'create', tool, start: start ? { x: start.x ?? p.x, y: start.y ?? p.y } : this.snapPoint(p, event), glueFrom: start?.target ?? null };
    this.trackPointer(event);
  }

  /** Window-level move / up handling for the current drag. */
  trackPointer(event) {
    const move = (e) => { this.lastEvent = e; this.onDragMove(e); };
    const up = (e) => {
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', up, true);
      this.onDragEnd(e);
    };
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', up, true);
    this.dragStartClient = { x: event.clientX, y: event.clientY };
  }

  hitGuide(p) {
    if (!this.app.settings().showGuides) return null;
    const tol = 5 / this.z;
    return (this.page.guides ?? []).find((g) => Math.abs((g.orient === 'v' ? p.x : p.y) - g.pos) <= tol) ?? null;
  }

  // ───────────────────────── moving

  startMove(event, p, { copy = false } = {}) {
    const page = this.page;
    const sel = this.app.selection().ids.filter((id) => findShape(page, id));
    const locked = sel.some((id) => findShape(page, id)?.locked?.move);
    // Containers carry what lies inside them.
    const extra = [];
    for (const id of sel) extra.push(...containedShapes(page, id));
    const ids = [...new Set([...sel, ...extra])];
    const all = withMembers(page, ids);
    const snapshot = new Map();
    for (const id of all) snapshot.set(id, JSON.parse(JSON.stringify(findShape(page, id))));
    for (const shape of page.shapes) if (isConnector(shape) && shape.waypoints?.length && shape.from.id && shape.to.id && all.includes(shape.from.id) && all.includes(shape.to.id)) snapshot.set(shape.id, JSON.parse(JSON.stringify(shape)));
    this.drag = { type: 'move', start: p, ids, all, snapshot, copy, locked, box: this.selectionBox(sel), dx: 0, dy: 0 };
    this.trackPointer(event);
  }

  /** Puts the moving shapes at their start position + (dx, dy). */
  placeMoving(dx, dy) {
    const page = this.page;
    for (const [id, orig] of this.drag.snapshot) {
      const shape = findShape(page, id);
      if (!shape) continue;
      if (isConnector(shape)) {
        for (const key of ['from', 'to']) if (!orig[key].id && this.drag.all.includes(id)) { shape[key].x = orig[key].x + dx; shape[key].y = orig[key].y + dy; }
        shape.waypoints = (orig.waypoints ?? []).map((wp) => ({ x: wp.x + dx, y: wp.y + dy }));
      } else { shape.x = orig.x + dx; shape.y = orig.y + dy; }
    }
  }

  restoreSnapshot(d = this.drag) {
    const page = this.page;
    for (const [id, orig] of d.snapshot) {
      const index = page.shapes.findIndex((shape) => shape.id === id);
      if (index >= 0) page.shapes[index] = JSON.parse(JSON.stringify(orig));
    }
    this.app.tab().invalidateRoutes();
  }

  /** Snapping of a moving box: grid, other shapes (smart guides), page guides. Returns { dx, dy, guides }. */
  snapMove(box, dx, dy, event) {
    if (!box || event.altKey) return { dx, dy, guides: [] };
    const s = this.app.settings();
    const docOpts = this.doc.doc.options;
    const tol = SNAP_PX / this.z;
    const moved = { x: box.x + dx, y: box.y + dy, w: box.w, h: box.h };
    const xs = [moved.x, moved.x + moved.w / 2, moved.x + moved.w];
    const ys = [moved.y, moved.y + moved.h / 2, moved.y + moved.h];
    let bestX = null; let bestY = null;
    const guides = [];
    const consider = (axis, value, target, kind) => {
      const d = target - value;
      if (Math.abs(d) > tol) return;
      if (axis === 'x' && (!bestX || Math.abs(d) < Math.abs(bestX.d) - 0.01 || (kind !== 'grid' && bestX.kind === 'grid' && Math.abs(d) <= Math.abs(bestX.d) + 0.5))) bestX = { d, target, kind };
      if (axis === 'y' && (!bestY || Math.abs(d) < Math.abs(bestY.d) - 0.01 || (kind !== 'grid' && bestY.kind === 'grid' && Math.abs(d) <= Math.abs(bestY.d) + 0.5))) bestY = { d, target, kind };
    };
    if (s.showGuides && docOpts.snapGuides !== false) for (const g of this.page.guides ?? []) for (const v of g.orient === 'v' ? xs : ys) consider(g.orient === 'v' ? 'x' : 'y', v, g.pos, 'guide');
    if (s.smartGuides && s.snapToShapes && docOpts.snapShapes !== false) {
      const moving = new Set(this.drag.all);
      for (const shape of this.page.shapes) {
        if (moving.has(shape.id) || isConnector(shape) || isGroup(shape) || shape.groupId && moving.has(topLevel(this.page, shape.id)?.id)) continue;
        if (!layerState(this.page, shape).visible) continue;
        const b = shapeBounds(shape);
        for (const v of xs) for (const t of [b.x, b.x + b.w / 2, b.x + b.w]) consider('x', v, t, 'shape');
        for (const v of ys) for (const t of [b.y, b.y + b.h / 2, b.y + b.h]) consider('y', v, t, 'shape');
      }
    }
    if (s.snapToGrid && docOpts.snapGrid !== false) {
      const step = this.gridStep();
      for (const v of [xs[0], xs[1]]) consider('x', v, snapTo(v, step), 'grid');
      for (const v of [ys[0], ys[1]]) consider('y', v, snapTo(v, step), 'grid');
    }
    if (bestX) { dx += bestX.d; if (bestX.kind !== 'grid') guides.push({ orient: 'v', pos: bestX.target }); }
    if (bestY) { dy += bestY.d; if (bestY.kind !== 'grid') guides.push({ orient: 'h', pos: bestY.target }); }
    return { dx, dy, guides };
  }

  snapPoint(p, event) {
    const s = this.app.settings();
    if (event?.altKey || !s.snapToGrid || this.doc.doc.options.snapGrid === false) return p;
    const step = this.gridStep();
    return { x: snapTo(p.x, step), y: snapTo(p.y, step) };
  }

  // ───────────────────────── handles

  startHandle(handle, event, p) {
    const kind = handle.dataset.handle;
    const page = this.page;
    const sel = this.app.selection().ids.filter((id) => findShape(page, id));
    if (kind === 'auto') {
      const side = handle.dataset.side;
      this.drag = { type: 'autoDrag', id: this.auto, side, start: p, moved: false };
      this.trackPointer(event);
      return;
    }
    if (kind === 'resize' || kind === 'rotate') {
      const all = withMembers(page, sel);
      const snapshot = new Map(all.map((id) => [id, JSON.parse(JSON.stringify(findShape(page, id)))]));
      const box = sel.length === 1 && !isConnector(findShape(page, sel[0])) ? { ...findShape(page, sel[0]) } : this.selectionBox(sel);
      this.drag = { type: kind, index: Number(handle.dataset.index), ids: sel, all, snapshot, box, start: p, single: sel.length === 1 && !isConnector(findShape(page, sel[0])), center: center(box) };
      if (kind === 'rotate') this.drag.startAngle = Math.atan2(p.y - this.drag.center.y, p.x - this.drag.center.x);
      this.trackPointer(event);
      return;
    }
    const shape = findShape(page, sel[0]);
    if (!shape) return;
    const snapshot = new Map([[shape.id, JSON.parse(JSON.stringify(shape))]]);
    if (kind === 'control') this.drag = { type: 'control', id: shape.id, key: handle.dataset.key, snapshot };
    else if (kind === 'end') this.drag = { type: 'conEnd', id: shape.id, end: handle.dataset.end, snapshot };
    else if (kind === 'segment') {
      const route = this.routes().get(shape.id);
      this.drag = { type: 'segment', id: shape.id, index: Number(handle.dataset.index), snapshot, route: route.points.map((q) => ({ ...q })), start: p };
    } else if (kind === 'bend') this.drag = { type: 'bend', id: shape.id, index: Number(handle.dataset.index), snapshot, start: p };
    else if (kind === 'label') this.drag = { type: 'label', id: shape.id, snapshot };
    this.trackPointer(event);
  }

  /** Where a connector end would glue: { target, x, y }. */
  glueAt(p, exclude) {
    if (this.doc.doc.options.glue === false) return null;
    const target = glueTarget(this.page, p, { exclude, radius: 10 / this.z });
    if (!target) return null;
    if (target.pt !== 'auto') return { target: { id: target.id, pt: target.pt }, x: target.x, y: target.y };
    return { target: { id: target.id, pt: 'auto' } };
  }

  // ───────────────────────── drag

  onDragMove(event) {
    const d = this.drag;
    if (!d) return;
    const p = this.toPage(event.clientX, event.clientY);
    this.app.pointerAt(p);
    const page = this.page;
    const moved = Math.hypot(event.clientX - this.dragStartClient.x, event.clientY - this.dragStartClient.y) > 3;
    if (!moved && !d.moved) return;
    d.moved = true;
    switch (d.type) {
      case 'pan':
        this.scroll.scrollLeft = d.sx - (event.clientX - d.x);
        this.scroll.scrollTop = d.sy - (event.clientY - d.y);
        return;
      case 'move': {
        if (d.locked) return;
        let dx = p.x - d.start.x;
        let dy = p.y - d.start.y;
        if (event.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
        const snapped = this.snapMove(d.box, dx, dy, event);
        d.dx = snapped.dx; d.dy = snapped.dy;
        this.guidesShown = snapped.guides;
        this.placeMoving(d.dx, d.dy);
        break;
      }
      case 'resize': this.dragResize(p, event); break;
      case 'rotate': this.dragRotate(p, event); break;
      case 'control': {
        const shape = findShape(page, d.id);
        const master = masterById(shape.master);
        const def = master.params[d.key];
        const local = pageToLocal(shape, p.x, p.y);
        shape.params = { ...(d.snapshot.get(d.id).params ?? {}), [d.key]: def.from(shape.w, shape.h, local.x, local.y) };
        break;
      }
      case 'conEnd': {
        const shape = findShape(page, d.id);
        const exclude = new Set([d.id]);
        const g = event.altKey ? null : this.glueAt(p, exclude);
        this.glue = g?.target ?? null;
        shape[d.end] = g ? { ...g.target } : { x: p.x, y: p.y };
        break;
      }
      case 'segment': {
        const shape = findShape(page, d.id);
        const pts = d.route.map((q) => ({ ...q }));
        const i = d.index;
        const a = pts[i - 1]; const b = pts[i];
        const dx = p.x - d.start.x; const dy = p.y - d.start.y;
        if (shape.route === 'orthogonal' && Math.abs(a.x - b.x) < 0.5) { a.x += dx; b.x += dx; }
        else if (shape.route === 'orthogonal' && Math.abs(a.y - b.y) < 0.5) { a.y += dy; b.y += dy; }
        else { pts.splice(i, 0, { x: (a.x + b.x) / 2 + dx, y: (a.y + b.y) / 2 + dy }); }
        shape.waypoints = pts.slice(1, -1);
        break;
      }
      case 'bend': {
        const shape = findShape(page, d.id);
        const orig = d.snapshot.get(d.id).waypoints;
        shape.waypoints = orig.map((wp, i) => (i === d.index ? this.snapPoint(p, event) : wp));
        break;
      }
      case 'label': {
        const shape = findShape(page, d.id);
        const route = this.routes().get(d.id);
        if (route) {
          let best = 0.5; let bestD = Infinity;
          for (let k = 0; k <= 40; k++) { const t = k / 40; const q = pointAlongPts(route.points, t); const dd = dist(q, p); if (dd < bestD) { bestD = dd; best = t; } }
          shape.textPos = Math.round(best * 100) / 100;
        }
        break;
      }
      case 'marquee': {
        const a = this.toStage(d.start); const b = this.toStage(p);
        d.rect = { x: Math.min(d.start.x, p.x), y: Math.min(d.start.y, p.y), w: Math.abs(p.x - d.start.x), h: Math.abs(p.y - d.start.y) };
        d.preview = `<rect x="${Math.min(a.x, b.x)}" y="${Math.min(a.y, b.y)}" width="${Math.abs(a.x - b.x)}" height="${Math.abs(a.y - b.y)}" fill="rgba(47,111,222,0.08)" stroke="#2f6fde" stroke-dasharray="4 3"/>`;
        this.renderOverlay();
        return;
      }
      case 'create': this.dragCreate(p, event); return;
      case 'autoDrag': {
        const g = this.glueAt(p, new Set([d.id]));
        this.glue = g?.target ?? null;
        const from = this.toStage(center(findShape(page, d.id)));
        const to = this.toStage(g?.x != null ? g : p);
        d.preview = `<line x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" stroke="#2f6fde" stroke-width="1.6" stroke-dasharray="5 3"/>`;
        this.renderOverlay();
        return;
      }
      case 'pencil': {
        d.points.push(p);
        d.preview = `<polyline points="${d.points.map((q) => { const s = this.toStage(q); return `${n(s.x)},${n(s.y)}`; }).join(' ')}" fill="none" stroke="#2f6fde" stroke-width="2"/>`;
        this.renderOverlay();
        return;
      }
      case 'guide': {
        const pos = d.orient === 'h' ? p.y : p.x;
        d.pos = pos;
        if (d.id) {
          const g = page.guides.find((x) => x.id === d.id);
          if (g) g.pos = pos;
          this.drawPage(this.size());
        } else {
          this.guidesShown = [{ orient: d.orient === 'h' ? 'h' : 'v', pos }];
          this.renderOverlay();
        }
        return;
      }
      default: return;
    }
    this.app.tab().invalidateRoutes();
    this.drawFrame();
  }

  /** One live frame while dragging: shapes and handles. */
  drawLive() {
    this.renderContent();
    this.renderOverlay();
    this.drawRulers();
    this.app.liveStatus?.();
  }

  dragResize(p, event) {
    const d = this.drag;
    const page = this.page;
    const i = d.index;
    const [hx, hy] = HANDLE_POINTS[i];
    if (d.single) {
      const orig = d.snapshot.get(d.ids[0]);
      const master = isGroup(orig) ? null : masterById(orig.master);
      // In the shape's own frame.
      const local = pageToLocal({ ...orig, flipH: false, flipV: false }, p.x, p.y);
      let x0 = 0; let y0 = 0; let x1 = orig.w; let y1 = orig.h;
      const sp = this.snapLocal(local, orig, event);
      if (hx === 0) x0 = sp.x; if (hx === 1) x1 = sp.x;
      if (hy === 0) y0 = sp.y; if (hy === 1) y1 = sp.y;
      if (event.altKey) { if (hx === 0) x1 = orig.w - x0; if (hx === 1) x0 = orig.w - x1; if (hy === 0) y1 = orig.h - y0; if (hy === 1) y0 = orig.h - y1; }
      let w = Math.max(4, x1 - x0); let h = Math.max(4, y1 - y0);
      if (x1 < x0) { w = 4; }
      if (y1 < y0) { h = 4; }
      const keep = event.shiftKey || master?.aspect || orig.locked?.aspect;
      if (keep && hx !== 0.5 && hy !== 0.5) {
        const ratio = orig.w / orig.h;
        if (w / h > ratio) w = h * ratio; else h = w / ratio;
        if (hx === 0) x0 = x1 - w; else x1 = x0 + w;
        if (hy === 0) y0 = y1 - h; else y1 = y0 + h;
      } else if (keep && hx === 0.5) { w = h * (orig.w / orig.h); x0 = (orig.w - w) / 2; } else if (keep && hy === 0.5) { h = w / (orig.w / orig.h); y0 = (orig.h - h) / 2; }
      if (hx === 0 && !keep) x0 = x1 - w;
      if (hy === 0 && !keep) y0 = y1 - h;
      // New centre in page coordinates (the box keeps its rotation).
      const cLocal = { x: x0 + w / 2, y: y0 + h / 2 };
      const c = rotatePoint({ x: orig.x + cLocal.x, y: orig.y + cLocal.y }, center(orig), orig.angle ?? 0);
      this.restoreSnapshotOnly();
      this.app.setBoxLive(d.ids[0], { x: c.x - w / 2, y: c.y - h / 2, w, h });
    } else {
      const b = d.box;
      let x0 = b.x; let y0 = b.y; let x1 = b.x + b.w; let y1 = b.y + b.h;
      const sp = this.snapPoint(p, event);
      if (hx === 0) x0 = Math.min(sp.x, x1 - 4); if (hx === 1) x1 = Math.max(sp.x, x0 + 4);
      if (hy === 0) y0 = Math.min(sp.y, y1 - 4); if (hy === 1) y1 = Math.max(sp.y, y0 + 4);
      let sx = (x1 - x0) / (b.w || 1); let sy = (y1 - y0) / (b.h || 1);
      if (event.shiftKey) { const k = Math.max(sx, sy); sx = k; sy = k; if (hx === 0) x0 = x1 - b.w * k; if (hy === 0) y0 = y1 - b.h * k; }
      this.restoreSnapshotOnly();
      this.app.scaleLive(d.ids, b, { x: x0, y: y0 }, sx, sy);
    }
  }

  snapLocal(local, shape, event) {
    if (event.altKey || shape.angle) return local;
    const s = this.app.settings();
    if (!s.snapToGrid || this.doc.doc.options.snapGrid === false) return local;
    const step = this.gridStep();
    return { x: snapTo(shape.x + local.x, step) - shape.x, y: snapTo(shape.y + local.y, step) - shape.y };
  }

  restoreSnapshotOnly() {
    const page = this.page;
    for (const [id, orig] of this.drag.snapshot) {
      const shape = findShape(page, id);
      if (shape) Object.assign(shape, JSON.parse(JSON.stringify(orig)));
    }
  }

  dragRotate(p, event) {
    const d = this.drag;
    const angle = Math.atan2(p.y - d.center.y, p.x - d.center.x);
    let deg = ((angle - d.startAngle) * 180) / Math.PI;
    const base = d.single ? (d.snapshot.get(d.ids[0]).angle ?? 0) : 0;
    let target = base + deg;
    target = event.shiftKey ? Math.round(target / 15) * 15 : Math.round(target);
    deg = target - base;
    this.restoreSnapshotOnly();
    this.app.rotateLive(d.ids, deg, d.center);
    d.deg = deg;
  }

  dragCreate(p, event) {
    const d = this.drag;
    const tool = d.tool;
    let end = p;
    if (['connector', 'line'].includes(tool)) {
      const g = event.altKey ? null : this.glueAt(p, new Set());
      this.glue = g?.target ?? null;
      d.glueTo = g?.target ?? null;
      end = g?.x != null ? { x: g.x, y: g.y } : p;
      if (!g?.target && event.shiftKey) { const dx = end.x - d.start.x; const dy = end.y - d.start.y; if (Math.abs(dx) > Math.abs(dy)) end = { x: end.x, y: d.start.y }; else end = { x: d.start.x, y: end.y }; }
      const a = this.toStage(d.start); const b = this.toStage(end);
      d.end = end;
      d.preview = `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#2f6fde" stroke-width="1.6" ${tool === 'connector' ? 'stroke-dasharray="5 3"' : ''}/>`;
      this.renderOverlay();
      return;
    }
    end = this.snapPoint(p, event);
    let w = end.x - d.start.x; let h = end.y - d.start.y;
    if (event.shiftKey) { const k = Math.max(Math.abs(w), Math.abs(h)); w = Math.sign(w || 1) * k; h = Math.sign(h || 1) * k; }
    d.rect = { x: Math.min(d.start.x, d.start.x + w), y: Math.min(d.start.y, d.start.y + h), w: Math.abs(w), h: Math.abs(h) };
    const a = this.toStage({ x: d.rect.x, y: d.rect.y });
    const W = d.rect.w * this.z; const H = d.rect.h * this.z;
    d.preview = tool === 'ellipse' ? `<ellipse cx="${a.x + W / 2}" cy="${a.y + H / 2}" rx="${W / 2}" ry="${H / 2}" fill="rgba(47,111,222,0.1)" stroke="#2f6fde" stroke-dasharray="5 3"/>`
      : `<rect x="${a.x}" y="${a.y}" width="${W}" height="${H}" fill="rgba(47,111,222,0.1)" stroke="#2f6fde" stroke-dasharray="5 3"/>`;
    this.renderOverlay();
  }

  onDragEnd(event) {
    const d = this.drag;
    this.drag = null;
    this.guidesShown = [];
    const glue = this.glue;
    this.glue = null;
    if (!d) return;
    const page = this.page;
    const p = this.toPage(event.clientX, event.clientY);
    switch (d.type) {
      case 'pan': this.scroll.style.cursor = ''; break;
      case 'move': {
        if (!d.moved || (!d.dx && !d.dy)) { this.restoreSnapshot(d); break; }
        this.restoreSnapshot(d);
        if (d.copy) this.app.duplicateMoved(d.ids.filter((id) => this.app.selection().ids.includes(id)), d.dx, d.dy);
        else this.app.moveSelection(d.ids, d.dx, d.dy);
        return;
      }
      case 'resize': case 'rotate': {
        if (!d.moved) break;
        const after = new Map(d.all.map((id) => [id, JSON.parse(JSON.stringify(findShape(page, id)))]));
        this.restoreSnapshot(d);
        this.app.commitShapes(d.type === 'resize' ? 'op.resize' : 'op.rotate', after);
        return;
      }
      case 'control': case 'conEnd': case 'segment': case 'bend': case 'label': {
        if (!d.moved) break;
        const after = new Map([[d.id, JSON.parse(JSON.stringify(findShape(page, d.id)))]]);
        if (d.type === 'segment') after.get(d.id).waypoints = (after.get(d.id).waypoints ?? []).map((q) => ({ x: Math.round(q.x * 10) / 10, y: Math.round(q.y * 10) / 10 }));
        this.restoreSnapshot(d);
        this.app.commitShapes({ control: 'op.adjust', conEnd: 'op.glue', segment: 'op.bend', bend: 'op.bend', label: 'op.adjust' }[d.type], after);
        return;
      }
      case 'marquee': {
        if (d.rect && d.rect.w > 1 && d.rect.h > 1) {
          const inside = page.shapes.filter((shape) => !shape.groupId && layerState(page, shape).visible && !layerState(page, shape).locked && (() => {
            if (isConnector(shape)) { const r = this.routes().get(shape.id); return r && r.points.every((q) => rectContains(d.rect, q)); }
            return rectInside(shapeBounds(shape), d.rect);
          })()).map((shape) => shape.id);
          this.app.select(d.additive ? [...new Set([...d.base, ...inside])] : inside);
        }
        break;
      }
      case 'create': this.finishCreate(d, p, event); return;
      case 'autoDrag': {
        if (!d.moved) { this.app.autoConnect(d.id, d.side); return; }
        this.app.connectShapes({ id: d.id, pt: 'auto' }, glue ? { ...glue } : { x: p.x, y: p.y });
        return;
      }
      case 'pencil': {
        if (d.points.length > 2) this.app.addFreeform(simplifyPoints(d.points, 1.5 / this.z), false);
        break;
      }
      case 'guide': {
        const r = this.scroll.getBoundingClientRect();
        const outside = d.orient === 'h' ? (event.clientY < r.top || event.clientY > r.bottom) : (event.clientX < r.left || event.clientX > r.right);
        if (d.id) {
          const g = page.guides.find((x) => x.id === d.id);
          const startPos = d.orient === 'h' ? d.start.y : d.start.x;
          if (g) g.pos = startPos;
          if (d.moved) this.app.setGuide(d.id, outside ? null : d.pos);
        } else if (d.moved && d.pos != null && !outside) this.app.addGuide(d.orient === 'h' ? 'h' : 'v', d.pos);
        break;
      }
      default: break;
    }
    this.renderOverlay();
    this.drawPage(this.size());
  }

  finishCreate(d, p, event) {
    const tool = d.tool;
    if (['connector', 'line'].includes(tool)) {
      const end = d.end ?? p;
      if (!d.moved || dist(d.start, end) < 4 / this.z) { this.renderOverlay(); return; }
      const from = d.glueFrom ?? { x: d.start.x, y: d.start.y };
      const to = d.glueTo ?? { x: end.x, y: end.y };
      this.app.connectShapes(from, to, tool === 'line' ? { route: 'straight', style: { endArrow: 'none' } } : {});
      return;
    }
    let rect = d.rect;
    if (!d.moved || !rect || rect.w < 3 || rect.h < 3) {
      if (tool !== 'text') { this.renderOverlay(); return; }
      rect = { x: d.start.x, y: d.start.y - 14, w: 160, h: 32 };
    }
    const master = tool === 'ellipse' ? 'ellipse' : tool === 'text' ? 'textBox' : 'rect';
    const shape = this.app.addShapeAt(master, rect);
    if (tool === 'text' && shape) setTimeout(() => this.startTextEdit(shape.id), 30);
    void event;
  }

  polylineClick(p, event) {
    const q = this.snapPoint(p, event);
    if (!this.poly) this.poly = { points: [q], cursor: null };
    else {
      const first = this.poly.points[0];
      if (this.poly.points.length > 2 && dist(first, q) < 8 / this.z) { this.finishPolyline(true); return; }
      this.poly.points.push(q);
    }
    if (!this.polyMove) {
      this.polyMove = (e) => { if (this.poly) { this.poly.cursor = this.snapPoint(this.toPage(e.clientX, e.clientY), e); this.renderOverlay(); } };
      this.scroll.addEventListener('pointermove', this.polyMove);
    }
    this.renderOverlay();
  }

  finishPolyline(closed = false) {
    if (!this.poly) return;
    const points = this.poly.points;
    this.poly = null;
    if (this.polyMove) { this.scroll.removeEventListener('pointermove', this.polyMove); this.polyMove = null; }
    if (points.length >= 2) this.app.addFreeform(points, closed);
    this.renderOverlay();
  }

  cancelTool() {
    if (this.poly) { this.poly = null; if (this.polyMove) { this.scroll.removeEventListener('pointermove', this.polyMove); this.polyMove = null; } this.renderOverlay(); return true; }
    return false;
  }

  onDoubleClick(event) {
    const p = this.toPage(event.clientX, event.clientY);
    if (this.app.tool() === 'polyline' && this.poly) { this.finishPolyline(false); return; }
    const handle = event.target.closest('[data-handle="bend"]');
    if (handle) { this.app.removeBend(this.app.selection().ids[0], Number(handle.dataset.index)); return; }
    const guide = this.hitGuide(p);
    const hit = this.hitTest(p, { subselect: false });
    if (!hit && guide) { this.app.openGuide?.(guide.id); return; }
    if (!hit) return;
    const top = findShape(this.page, hit.top);
    // A group without text: edit the member under the pointer.
    const target = isGroup(top) && !top.text ? hit.id : hit.top;
    this.app.select([target]);
    this.startTextEdit(target);
  }

  onContextMenu(event) {
    event.preventDefault();
    event.stopPropagation();
    const p = this.toPage(event.clientX, event.clientY);
    if (this.app.tool() === 'polyline' && this.poly) { this.finishPolyline(false); return; }
    const hit = this.hitTest(p);
    const sel = this.app.selection().ids;
    if (hit && !sel.includes(hit.top)) this.app.select([hit.top]);
    // Right-clicking empty canvas lets go of the selection, like a left click there.
    if (!hit && sel.length) this.app.select([]);
    const ids = this.app.selection().ids;
    const kind = !hit && !ids.length ? 'canvas' : ids.length > 1 ? 'multi' : isConnector(findShape(this.page, ids[0])) ? 'connector' : 'shape';
    this.app.contextMenu(event, hit || ids.length ? kind : 'canvas', { id: ids[0] ?? null, point: p, guide: !hit ? this.hitGuide(p)?.id ?? null : null });
  }

  // ───────────────────────── text editing

  /** Edits the text of a shape or connector in place (Enter = new line, Ctrl+Enter / Esc / click outside = done). */
  startTextEdit(id, initial = null) {
    const page = this.page;
    const shape = findShape(page, id);
    if (!shape || shape.locked?.text) return;
    this.finishTextEdit();
    const editor = document.createElement('textarea');
    editor.className = 'text-editor';
    editor.spellcheck = true;
    editor.value = initial ?? shape.text ?? '';
    editor.setAttribute('aria-label', this.app.t('canvas.editText'));
    this.stage.append(editor);
    this.editing = { id, editor, original: shape.text ?? '' };
    this.positionEditor();
    this.renderContent();
    editor.focus();
    if (initial == null) editor.select(); else editor.setSelectionRange(editor.value.length, editor.value.length);
    editor.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'Escape') { event.preventDefault(); this.finishTextEdit(true); }
      else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); this.finishTextEdit(); }
      else if (event.key === 'Tab') { event.preventDefault(); this.finishTextEdit(); }
    });
    editor.addEventListener('input', () => this.positionEditor());
    editor.addEventListener('blur', () => setTimeout(() => { if (this.editing?.editor === editor) this.finishTextEdit(); }, 80));
  }

  positionEditor() {
    const ed = this.editing;
    if (!ed) return;
    const page = this.page;
    const shape = findShape(page, ed.id);
    if (!shape) return;
    const z = this.z;
    let box;
    let style;
    if (isConnector(shape)) {
      const route = this.routes().get(shape.id);
      const c = route?.label ?? { x: 0, y: 0 };
      box = { x: c.x - 90, y: c.y - 24, w: 180, h: 48 };
      style = { fontSize: shape.style?.fontSize ?? 12 };
    } else {
      const master = masterById(shape.master);
      const b = shapeBounds(shape);
      const [l, tt, r, bb] = master.textHeader ? (master.header === 'left' ? [0, 0, Math.min(36, shape.w) / shape.w, 1] : [0, 0, 1, Math.min(30, shape.h) / shape.h]) : master.text ?? [0, 0, 1, 1];
      box = shape.angle ? { x: b.x, y: b.y, w: b.w, h: b.h } : { x: shape.x + l * shape.w, y: shape.y + tt * shape.h, w: Math.max(60, (r - l) * shape.w), h: Math.max(28, (bb - tt) * shape.h) };
      if (master.compartments) box = { x: shape.x, y: shape.y, w: shape.w, h: shape.h };
      style = { fontSize: shape.style?.fontSize ?? master.style?.fontSize ?? 13, align: shape.style?.align ?? 'center' };
    }
    const tl = this.toStage({ x: box.x, y: box.y });
    Object.assign(ed.editor.style, { left: `${tl.x}px`, top: `${tl.y}px`, width: `${Math.max(80, box.w * z)}px`, minHeight: `${Math.max(30, box.h * z)}px`, fontSize: `${(style.fontSize ?? 13) * z}px`, textAlign: style.align ?? 'center' });
  }

  finishTextEdit(cancel = false) {
    const ed = this.editing;
    if (!ed) return;
    this.editing = null;
    const value = ed.editor.value;
    ed.editor.remove();
    if (!cancel && value !== ed.original) this.app.setShapeText(ed.id, value);
    else this.renderContent();
    this.scroll.focus({ preventScroll: true });
  }

  // ───────────────────────── zoom & scroll

  /** Zooms to `percent`, keeping the page point under (clientX, clientY) — or the view centre — in place. */
  zoomTo(percent, clientX = null, clientY = null) {
    const doc = this.doc;
    if (!doc) return;
    const z = clamp(percent, CANVAS_ZOOM.min, CANVAS_ZOOM.max) / 100;
    const rect = this.scroll.getBoundingClientRect();
    const cx = clientX ?? rect.left + rect.width / 2;
    const cy = clientY ?? rect.top + rect.height / 2;
    const anchor = this.toPage(cx, cy);
    doc.view.zoom = Math.round(z * 1000) / 10;
    this.scrollPageTo(anchor, cx - rect.left, cy - rect.top);
    this.renderContent();
    this.renderOverlay();
    this.drawRulers();
    this.drawMinimap();
    if (this.editing) this.positionEditor();
    this.app.zoomChanged();
  }

  /** Zooms so a page box fills the view (with a small border) and centres it. */
  fitBox(box, { maxZoom = 400 } = {}) {
    const doc = this.doc;
    const w = this.scroll.clientWidth || 800;
    const h = this.scroll.clientHeight || 600;
    const z = clamp(Math.min((w - 40) / Math.max(1, box.w), (h - 40) / Math.max(1, box.h)) * 100, CANVAS_ZOOM.min, maxZoom) / 100;
    doc.view.zoom = Math.round(z * 1000) / 10;
    this.scrollPageTo({ x: box.x + box.w / 2, y: box.y + box.h / 2 }, w / 2, h / 2);
    this.renderContent();
    this.renderTabs();
    this.renderOverlay();
    this.drawRulers();
    this.drawMinimap();
    this.app.zoomChanged();
  }

  /** Fits the page and everything drawn around it. */
  fitPage() {
    this.fitBox(this.drawingBox(), { maxZoom: 200 });
  }

  fitWidth() {
    const box = this.drawingBox();
    const w = this.scroll.clientWidth || 800;
    const z = clamp(((w - 40) / box.w) * 100, CANVAS_ZOOM.min, 400) / 100;
    this.doc.view.zoom = Math.round(z * 1000) / 10;
    this.scrollPageTo({ x: box.x, y: box.y }, 20, 20);
    this.renderContent();
    this.renderOverlay();
    this.drawRulers();
    this.drawMinimap();
    this.app.zoomChanged();
  }

  fitHeight() {
    const box = this.drawingBox();
    const h = this.scroll.clientHeight || 600;
    const z = clamp(((h - 40) / box.h) * 100, CANVAS_ZOOM.min, 400) / 100;
    this.doc.view.zoom = Math.round(z * 1000) / 10;
    this.scrollPageTo({ x: box.x, y: box.y }, 20, 20);
    this.renderContent();
    this.renderOverlay();
    this.drawRulers();
    this.drawMinimap();
    this.app.zoomChanged();
  }

  zoomSelection() {
    const box = this.selectionBox(this.app.selection().ids);
    if (box) this.fitBox({ x: box.x - 20, y: box.y - 20, w: box.w + 40, h: box.h + 40 });
  }

  /** Scrolls so a shape is in view (and keeps the zoom). */
  scrollToShape(id) {
    const shape = findShape(this.page, id);
    if (!shape) return;
    const b = isConnector(shape) ? this.selectionBox([id]) : shapeBounds(shape);
    if (!b) return;
    const z = this.z;
    const { x: left, y: top } = this.toStage(b);
    const vw = this.scroll.clientWidth; const vh = this.scroll.clientHeight;
    if (left < this.scroll.scrollLeft + 20 || left + b.w * z > this.scroll.scrollLeft + vw - 20) this.scroll.scrollLeft = left + (b.w * z) / 2 - vw / 2;
    if (top < this.scroll.scrollTop + 20 || top + b.h * z > this.scroll.scrollTop + vh - 20) this.scroll.scrollTop = top + (b.h * z) / 2 - vh / 2;
  }

  /** The page point at the centre of the view. */
  viewCenter() {
    const r = this.scroll.getBoundingClientRect();
    return this.toPage(r.left + r.width / 2, r.top + r.height / 2);
  }

  // ───────────────────────── rulers

  drawRulers() {
    const s = this.app.settings();
    this.root.classList.toggle('no-rulers', !s.showRulers);
    if (!s.showRulers || !this.doc) return;
    const dpr = window.devicePixelRatio || 1;
    const unit = this.doc.doc.units ?? 'mm';
    const z = this.z;
    const pxPer = { mm: 96 / 25.4, cm: 96 / 2.54, in: 96, pt: 96 / 72, px: 1 }[unit];
    const steps = unit === 'in' ? [0.0625, 0.125, 0.25, 0.5, 1, 2, 5, 10, 20] : unit === 'pt' || unit === 'px' ? [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000] : [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
    const major = steps.find((st) => st * pxPer * z >= 70) ?? steps[steps.length - 1];
    const minor = major / (unit === 'in' ? 8 : major >= 10 && String(major).startsWith('5') ? 5 : major >= 10 ? 10 : 5);
    const colors = getComputedStyle(document.documentElement);
    const bg = colors.getPropertyValue('--toolbar').trim() || '#f3f4f6';
    const text = colors.getPropertyValue('--muted').trim() || '#666';
    const accent = colors.getPropertyValue('--accent').trim() || '#2f6fde';
    const sel = this.selectionBox(this.app.selection().ids);
    const pointer = this.pointer;
    for (const [canvas, horizontal] of [[this.rulerH, true], [this.rulerV, false]]) {
      const w = horizontal ? this.scroll.clientWidth : 20;
      const h = horizontal ? 20 : this.scroll.clientHeight;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); canvas.style.width = `${w}px`; canvas.style.height = `${h}px`; }
      const c = canvas.getContext('2d');
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.fillStyle = bg; c.fillRect(0, 0, w, h);
      const origin = -(horizontal ? (this.world?.x ?? 0) : (this.world?.y ?? 0)) * z - (horizontal ? this.scroll.scrollLeft : this.scroll.scrollTop);
      const length = horizontal ? w : h;
      if (sel) {
        const a = origin + (horizontal ? sel.x : sel.y) * z; const b = a + (horizontal ? sel.w : sel.h) * z;
        c.fillStyle = `${accent}33`;
        if (horizontal) c.fillRect(a, 0, b - a, h); else c.fillRect(0, a, w, b - a);
      }
      c.strokeStyle = text; c.fillStyle = text; c.lineWidth = 1; c.font = '9px "Segoe UI", sans-serif';
      const first = Math.floor((-origin / z / pxPer) / minor) * minor;
      const last = ((length - origin) / z / pxPer);
      c.beginPath();
      for (let v = first; v <= last; v += minor) {
        const pos = Math.round(origin + v * pxPer * z) + 0.5;
        const isMajor = Math.abs(v / major - Math.round(v / major)) < 1e-6;
        const tick = isMajor ? 10 : Math.abs((v * 2) / major - Math.round((v * 2) / major)) < 1e-6 ? 6 : 3;
        if (horizontal) { c.moveTo(pos, h); c.lineTo(pos, h - tick); } else { c.moveTo(w, pos); c.lineTo(w - tick, pos); }
        if (isMajor) {
          const label = String(Math.round(v * 1000) / 1000);
          if (horizontal) c.fillText(label, pos + 2, 9);
          else { c.save(); c.translate(9, pos + 2); c.rotate(-Math.PI / 2); c.fillText(label, 0, 0); c.restore(); }
        }
      }
      c.stroke();
      if (pointer) {
        const pos = origin + (horizontal ? pointer.x : pointer.y) * z;
        c.strokeStyle = accent; c.beginPath();
        if (horizontal) { c.moveTo(pos, 0); c.lineTo(pos, h); } else { c.moveTo(0, pos); c.lineTo(w, pos); }
        c.stroke();
      }
      c.strokeStyle = colors.getPropertyValue('--border').trim() || '#ccc';
      c.beginPath();
      if (horizontal) { c.moveTo(0, h - 0.5); c.lineTo(w, h - 0.5); } else { c.moveTo(w - 0.5, 0); c.lineTo(w - 0.5, h); }
      c.stroke();
    }
  }

  setPointer(p) {
    this.pointer = p;
    if (this.app.settings().showRulers) this.drawRulersSoon();
  }

  drawRulersSoon() {
    if (this.rulerPending) return;
    this.rulerPending = true;
    requestAnimationFrame(() => { this.rulerPending = false; this.drawRulers(); });
  }

  // ───────────────────────── Pan & Zoom window

  drawMinimap() {
    const show = this.app.settings().showMinimap;
    this.minimap.hidden = !show;
    if (!show || !this.doc) return;
    const doc = this.doc.doc;
    const box = this.drawingBox();
    const { svg } = renderPageSvg(doc, this.page, { area: 'box', box, measure: this.measure, routes: this.routes(), language: this.app.language() });
    const holder = this.minimap.querySelector('.minimap-svg');
    holder.outerHTML = svg.replace('<svg ', '<svg class="minimap-svg" preserveAspectRatio="xMidYMid meet" ').replace(/ width="\d+" height="\d+"/, ' width="100%" height="100%"');
    this.drawMinimapView();
  }

  drawMinimapView() {
    if (this.minimap.hidden || !this.doc) return;
    const drawing = this.drawingBox();
    const box = this.minimap.getBoundingClientRect();
    const scale = Math.min(box.width / drawing.w, box.height / drawing.h);
    const ox = (box.width - drawing.w * scale) / 2 - drawing.x * scale;
    const oy = (box.height - drawing.h * scale) / 2 - drawing.y * scale;
    const z = this.z;
    const vx = this.world.x + this.scroll.scrollLeft / z; const vy = this.world.y + this.scroll.scrollTop / z;
    const vw = this.scroll.clientWidth / z; const vh = this.scroll.clientHeight / z;
    Object.assign(this.minimap.querySelector('.minimap-view').style, { left: `${ox + vx * scale}px`, top: `${oy + vy * scale}px`, width: `${vw * scale}px`, height: `${vh * scale}px` });
    this.minimapScale = { scale, ox, oy };
  }

  onMinimapDown(event) {
    event.preventDefault();
    event.stopPropagation();
    const move = (e) => {
      const box = this.minimap.getBoundingClientRect();
      const { scale, ox, oy } = this.minimapScale ?? { scale: 1, ox: 0, oy: 0 };
      const px = (e.clientX - box.left - ox) / scale;
      const py = (e.clientY - box.top - oy) / scale;
      this.scrollPageTo({ x: px, y: py }, this.scroll.clientWidth / 2, this.scroll.clientHeight / 2);
    };
    move(event);
    const up = () => { window.removeEventListener('pointermove', move, true); window.removeEventListener('pointerup', up, true); };
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', up, true);
  }

  // ───────────────────────── page tabs

  renderTabs() {
    const doc = this.doc?.doc;
    if (!doc) return;
    const current = this.page?.id;
    const t = this.app.t;
    const tab = (page) => `<button class="page-tab ${page.id === current ? 'active' : ''} ${page.background ? 'background' : ''}" role="tab" aria-selected="${page.id === current}" data-page="${escapeHtml(page.id)}" draggable="true" title="${escapeHtml(`${page.name}${page.background ? ` (${t('page.backgroundPage')})` : ''} · ${formatLength(page.width, doc.units)} × ${formatLength(page.height, doc.units)}`)}">${page.background ? icon('pageBg', 'icon tiny') : ''}<span>${escapeHtml(page.name)}</span></button>`;
    const fore = doc.pages.filter((page) => !page.background);
    const back = doc.pages.filter((page) => page.background);
    this.tabs.innerHTML = `
      <span class="page-nav">
        <button class="icon-button" data-page-nav="-1" title="${escapeHtml(t('action.pagePrev'))}" aria-label="${escapeHtml(t('action.pagePrev'))}">${icon('chevronLeft')}</button>
        <button class="icon-button" data-page-nav="1" title="${escapeHtml(t('action.pageNext'))}" aria-label="${escapeHtml(t('action.pageNext'))}">${icon('chevronRight')}</button>
      </span>
      <span class="page-tab-list">${fore.map(tab).join('')}${back.length ? `<span class="page-tab-sep" aria-hidden="true"></span>${back.map(tab).join('')}` : ''}</span>
      <button class="icon-button page-add" data-page-add title="${escapeHtml(t('action.pageNew'))}" aria-label="${escapeHtml(t('action.pageNew'))}">${icon('plus')}</button>`;
    this.tabs.querySelector('.page-tab.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  renamePageInline(tab) {
    const page = this.doc.doc.pages.find((p) => p.id === tab.dataset.page);
    if (!page) return;
    const input = document.createElement('input');
    input.className = 'page-rename';
    input.value = page.name;
    input.setAttribute('aria-label', this.app.t('action.pageRename'));
    tab.replaceChildren(input);
    input.focus();
    input.select();
    const done = (save) => { if (save && input.value.trim() && input.value.trim() !== page.name) this.app.renamePage(page.id, input.value.trim()); else this.renderTabs(); };
    input.addEventListener('keydown', (event) => { event.stopPropagation(); if (event.key === 'Enter') done(true); if (event.key === 'Escape') done(false); });
    input.addEventListener('blur', () => done(true), { once: true });
  }
}

/** Resize handle positions (normalized), clockwise from the top-left corner. */
export const HANDLE_POINTS = [[0, 0], [0.5, 0], [1, 0], [1, 0.5], [1, 1], [0.5, 1], [0, 1], [0, 0.5]];
const CURSORS = ['nwse-resize', 'ns-resize', 'nesw-resize', 'ew-resize'];
function cursorFor(index, angle) {
  const steps = Math.round(((angle % 180) + 180) % 180 / 45);
  return CURSORS[(index + steps) % 4];
}

function pointAlongPts(points, t) {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += dist(points[i - 1], points[i]);
  let target = t * total;
  for (let i = 1; i < points.length; i++) {
    const len = dist(points[i - 1], points[i]);
    if (target <= len) { const k = len ? target / len : 0; return { x: points[i - 1].x + (points[i].x - points[i - 1].x) * k, y: points[i - 1].y + (points[i].y - points[i - 1].y) * k }; }
    target -= len;
  }
  return points[points.length - 1];
}

/** Ramer–Douglas–Peucker: fewer points for a freehand line. */
export function simplifyPoints(points, epsilon = 1.5) {
  if (points.length < 3) return points;
  const segDist = (p, a, b) => {
    const dx = b.x - a.x; const dy = b.y - a.y;
    const len = dx * dx + dy * dy;
    const t = len ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len)) : 0;
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
  };
  let index = 0; let max = 0;
  for (let i = 1; i < points.length - 1; i++) { const d = segDist(points[i], points[0], points[points.length - 1]); if (d > max) { max = d; index = i; } }
  if (max <= epsilon) return [points[0], points[points.length - 1]];
  return [...simplifyPoints(points.slice(0, index + 1), epsilon).slice(0, -1), ...simplifyPoints(points.slice(index), epsilon)];
}

export { createShape, createConnector, contentBounds };
