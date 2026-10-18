// The diagram editor: the endless canvas with its grid, the views (drawn by
// render/notation.js), and everything done with the mouse — selecting (click,
// Shift/Ctrl+click, area), moving (snapping to the grid; containers carry what
// is inside; dropping a view into a package moves its element), resizing,
// line bend points (drag a point, drag a segment's middle to add one,
// double-click to remove), reconnecting a line's end, moving a sequence
// message up and down, the toolbox tools (click or drag for a node, drag from
// one view to another for a line), in-place editing (names, notes, and the
// quick edit of a class: name, attributes and operations as text), the quick
// buttons under a selected class, zooming and panning, and the tabs of the
// working diagrams. Every edit goes through the app as one undo step.
import { backgroundLayers, createRenderContext, edgeRoute, elementOf, layoutDiagram, renderViews, shapeOfView, svgDefs, viewsInside, CONTAINER_SHAPES, DIAGRAM_THEMES, diagramBounds } from '../render/notation.js';
import { isEdgeView, refId } from '../domain/model.js';
import { typeDef, viewDef } from '../domain/meta.js';
import { CANVAS_ZOOM } from '../domain/settings.js';
import { relatedFor } from '../domain/edit.js';
import { DIAGRAM_TABS, diagramTabOf } from '../domain/toolbox.js';
import { escapeHtml, frameThrottle } from '../ui/dom.js';
import { icon } from '../icons.js';

const PAD_SCREENS = 1.5;
const MAX_STAGE = 4_000_000;
const HANDLE = 8;
const NS = 'http://www.w3.org/2000/svg';
const n = (v) => Math.round(v * 100) / 100;
const clone = (value) => JSON.parse(JSON.stringify(value));
const HANDLE_POINTS = [[0, 0], [0.5, 0], [1, 0], [1, 0.5], [1, 1], [0.5, 1], [0, 1], [0, 0.5]];
const CURSORS = ['nwse-resize', 'ns-resize', 'nesw-resize', 'ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize', 'ew-resize'];
const inBox = (b, p, pad = 0) => p.x >= b.x - pad && p.x <= b.x + b.w + pad && p.y >= b.y - pad && p.y <= b.y + b.h + pad;
const union = (list) => {
  const boxes = list.filter(Boolean);
  if (!boxes.length) return null;
  const x = Math.min(...boxes.map((b) => b.x)); const y = Math.min(...boxes.map((b) => b.y));
  return { x, y, w: Math.max(...boxes.map((b) => b.x + b.w)) - x, h: Math.max(...boxes.map((b) => b.y + b.h)) - y };
};

/** Canvas text measuring with a cache (the renderer asks for the same strings again and again). */
export function canvasMeasure() {
  const cache = new Map();
  const context = document.createElement('canvas').getContext('2d');
  return (text, style) => {
    const size = style.fontSize ?? 13;
    const font = `${style.italic ? 'italic ' : ''}${style.bold ? 700 : 400} ${size}px ${style.font ? `"${style.font}", ` : ''}"Segoe UI", "Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", Arial, sans-serif`;
    const key = `${font}\u0000${text}`;
    let width = cache.get(key);
    if (width === undefined) {
      context.font = font;
      width = context.measureText(String(text)).width;
      if (cache.size > 20000) cache.clear();
      cache.set(key, width);
    }
    return width;
  };
}

export class DiagramView {
  constructor(app, host) {
    this.app = app;
    this.host = host;
    this.drag = null;
    this.editing = null;
    this.hoverId = null;
    host.classList.add('canvas-host');
    host.innerHTML = `
      <div class="canvas-view">
        <div class="type-tabs">
          <div class="type-row"><div class="type-strip type-families" role="tablist" aria-label="${escapeHtml(app.t('typeTabs.families'))}"></div><span class="type-nav"><button class="type-scroll" data-type-scroll="-1" title="${escapeHtml(app.t('tabs.left'))}" aria-label="${escapeHtml(app.t('tabs.left'))}">${icon('chevronLeft')}</button><button class="type-scroll" data-type-scroll="1" title="${escapeHtml(app.t('tabs.right'))}" aria-label="${escapeHtml(app.t('tabs.right'))}">${icon('chevronRight')}</button></span></div>
          <div class="type-row types"><div class="type-strip type-list" role="tablist" aria-label="${escapeHtml(app.t('typeTabs.types'))}"></div><span class="type-nav"><button class="type-scroll" data-type-scroll="-1" title="${escapeHtml(app.t('tabs.left'))}" aria-label="${escapeHtml(app.t('tabs.left'))}">${icon('chevronLeft')}</button><button class="type-scroll" data-type-scroll="1" title="${escapeHtml(app.t('tabs.right'))}" aria-label="${escapeHtml(app.t('tabs.right'))}">${icon('chevronRight')}</button></span></div>
        </div>
        <div class="canvas-main">
          <div class="ruler-corner" title="${escapeHtml(app.t('canvas.rulerCorner'))}">${icon('rulers')}</div>
          <canvas class="ruler ruler-h" aria-hidden="true"></canvas>
          <canvas class="ruler ruler-v" aria-hidden="true"></canvas>
          <div class="canvas-scroll" tabindex="0" aria-label="${escapeHtml(app.t('view.diagram'))}">
            <div class="canvas-stage">
              <svg class="canvas-svg" xmlns="${NS}"><defs class="canvas-defs"></defs>
                <g class="viewport"><g class="bg-layer"></g><g class="grid-layer"></g><g class="content"></g></g>
              </svg>
              <svg class="canvas-overlay" xmlns="${NS}"></svg>
              <div class="quick-bar" hidden></div>
            </div>
          </div>
          <div class="minimap" hidden><svg class="minimap-svg"></svg><div class="minimap-view"></div></div>
          <div class="canvas-empty" hidden></div>
        </div>
        <div class="page-tabs diagram-tabs" role="tablist"></div>
      </div>`;
    this.root = host.querySelector('.canvas-view');
    this.scroll = host.querySelector('.canvas-scroll');
    this.stage = host.querySelector('.canvas-stage');
    this.svg = host.querySelector('.canvas-svg');
    this.defs = host.querySelector('.canvas-defs');
    this.viewport = host.querySelector('.viewport');
    this.gridLayer = host.querySelector('.grid-layer');
    this.bgLayer = host.querySelector('.bg-layer');
    this.content = host.querySelector('.content');
    this.overlay = host.querySelector('.canvas-overlay');
    this.quickBar = host.querySelector('.quick-bar');
    this.minimap = host.querySelector('.minimap');
    this.empty = host.querySelector('.canvas-empty');
    this.tabs = host.querySelector('.diagram-tabs');
    this.typeTabs = host.querySelector('.type-tabs');
    this.rulerH = host.querySelector('.ruler-h');
    this.rulerV = host.querySelector('.ruler-v');
    this.drawFrame = frameThrottle(() => this.drawLive());
    this.bind();
    // Mounted while hidden (no size yet): place the view once it has a size.
    this.resizeObserver = new ResizeObserver(() => {
      if (this.pendingScroll && this.scroll.clientWidth > 0 && this.diagram) { this.pendingScroll = false; this.world = null; this.update(); this.restoreScroll(); }
      this.growNearEdges();
      this.drawMinimap();
      this.drawRulers();
      this.updateTypeNav();
    });
    this.resizeObserver.observe(this.scroll);
  }

  get tab() { return this.app.tab(); }
  get diagram() { return this.app.diagram(); }
  get z() { const d = this.diagram; return (d ? this.tab?.view.zoom[d._id] ?? 100 : 100) / 100; }
  set zoomPercent(value) { if (this.diagram) this.tab.view.zoom[this.diagram._id] = value; }

  destroy() {
    this.finishEdit(true);
    this.resizeObserver.disconnect();
    this.host.innerHTML = '';
    this.host.classList.remove('canvas-host');
  }

  // ───────────────────────── coordinates

  toPage(clientX, clientY) {
    const r = this.stage.getBoundingClientRect();
    const w = this.world ?? { x: 0, y: 0 };
    return { x: (clientX - r.left) / this.z + w.x, y: (clientY - r.top) / this.z + w.y };
  }

  toStage(p) {
    const w = this.world ?? { x: 0, y: 0 };
    return { x: (p.x - w.x) * this.z, y: (p.y - w.y) * this.z };
  }

/** Grid size on the screen (Settings › Diagram › Grid size): the same at every zoom. */
  gridPixels() {
    const s = this.app.settings();
    return Math.max(1, Number(s.gridSize) || 10);
  }

  /**
   * Grid step in page units (an adaptive grid). At 100 % a cell is the grid size; zooming scales the grid
   * with the diagram until a cell is smaller than half the grid size or larger than 2.5 times it on the
   * screen — then the grid is redrawn one level coarser or finer (× 5, so the darker lines of one level
   * become the thin lines of the next and the 5 × 5 pattern carries on).
   */
  gridStep() {
    const base = this.gridPixels();
    const z = this.z;
    let step = base;
    while (step * z < base * 0.5) step *= 5;
    while (step * z > base * 2.5) step /= 5;
    return step;
  }

  /** Snaps to the visible grid lines (whole page units). */
  snap(v, event) {
    if (!this.app.settings().snapToGrid || event?.altKey) return Math.round(v);
    const g = this.gridStep();
    return Math.round(Math.round(v / g) * g);
  }

  // ───────────────────────── rendering

  context() {
    const s = this.app.settings();
    const tab = this.tab;
    return createRenderContext({ project: tab.project, index: tab.index, diagram: this.diagram, measure: this.app.measure, language: this.app.language(), lineStyle: s.defaultLineStyle, theme: s.diagramTheme, font: s.diagramFont, fontSize: s.diagramFontSize, showShadow: s.showShadow });
  }

  render() {
    const diagram = this.diagram;
    this.renderTabs();
    this.empty.hidden = Boolean(diagram);
    this.scroll.hidden = !diagram;
    if (!diagram) { this.empty.innerHTML = `<div>${icon('dgClass')}<p>${escapeHtml(this.app.t('canvas.noDiagram'))}</p><button class="button primary" data-command="addDiagram">${icon('plus')}<span>${escapeHtml(this.app.t('action.addDiagram'))}</span></button></div>`; return; }
    const fresh = this.shownDiagram !== diagram._id;
    this.shownDiagram = diagram._id;
    if (!this.scroll.clientWidth) this.pendingScroll = true;
    if (fresh) this.world = null;
    if (this.tab.view.zoom[diagram._id] == null) { this.zoomPercent = 100; this.update(); this.scrollToContent(); return; }
    this.update();
    if (fresh) this.restoreScroll();
  }

  /** The diagram changed: views, overlay, tabs, minimap. */
  update() {
    if (!this.diagram) return this.render();
    this.ctx = this.context();
    const svg = renderViews(this.ctx);
    this.layoutStage();
    this.defs.innerHTML = svgDefs(this.ctx);
    this.content.innerHTML = svg;
    this.drawGrid();
    this.renderOverlay();
    this.renderTabs();
    this.drawMinimap();
    return undefined;
  }

  selectionChanged() { this.renderOverlay(); }

  drawLive() {
    this.tab.touch();
    this.ctx = this.context();
    this.content.innerHTML = renderViews(this.ctx);
    this.renderOverlay();
  }

  contentBox() {
    if (!this.ctx) return { x: 0, y: 0, w: 0, h: 0 };
    return diagramBounds(this.ctx);
  }

  worldBox(include = null) {
    const z = this.z;
    const padX = ((this.scroll.clientWidth || 800) / z) * PAD_SCREENS;
    const padY = ((this.scroll.clientHeight || 600) / z) * PAD_SCREENS;
    const content = this.contentBox();
    const b = union([{ x: 0, y: 0, w: 1, h: 1 }, content.w ? content : null, include]);
    let world = { x: b.x - padX, y: b.y - padY, w: b.w + padX * 2, h: b.h + padY * 2 };
    if (this.world && this.worldZ === z) {
      const grown = union([world, this.world]);
      if (grown.w * z <= MAX_STAGE && grown.h * z <= MAX_STAGE) world = grown;
    }
    return world;
  }

  layoutStage(include = null) {
    const z = this.z;
    const before = this.world && this.worldZ === z ? this.world : null;
    const world = this.worldBox(include);
    this.world = world;
    this.worldZ = z;
    const w = Math.ceil(world.w * z); const h = Math.ceil(world.h * z);
    this.stage.style.width = `${w}px`;
    this.stage.style.height = `${h}px`;
    for (const svg of [this.svg, this.overlay]) { svg.setAttribute('width', w); svg.setAttribute('height', h); }
    this.viewport.setAttribute('transform', `translate(${n(-world.x * z)} ${n(-world.y * z)}) scale(${z})`);
    if (before) {
      const dx = (before.x - world.x) * z; const dy = (before.y - world.y) * z;
      this.growing = true;
      if (dx > 0.5) this.scroll.scrollLeft += dx;
      if (dy > 0.5) this.scroll.scrollTop += dy;
      this.growing = false;
    }
  }

  growNearEdges() {
    if (this.growing || !this.world || !this.diagram) return;
    const sc = this.scroll;
    const vw = sc.clientWidth; const vh = sc.clientHeight;
    const near = sc.scrollLeft < vw * 0.5 || sc.scrollTop < vh * 0.5 || sc.scrollLeft + vw > sc.scrollWidth - vw * 0.5 || sc.scrollTop + vh > sc.scrollHeight - vh * 0.5;
    if (!near) return;
    const z = this.z;
    const view = { x: this.world.x + sc.scrollLeft / z, y: this.world.y + sc.scrollTop / z, w: vw / z, h: vh / z };
    this.layoutStage({ x: view.x - view.w, y: view.y - view.h, w: view.w * 3, h: view.h * 3 });
    this.drawGrid();
  }

  saveScroll() {
    if (!this.diagram || !this.world) return;
    const z = this.z;
    this.tab.view.scroll[this.diagram._id] = { x: (this.scroll.scrollLeft / z) + this.world.x, y: (this.scroll.scrollTop / z) + this.world.y };
  }

  restoreScroll() {
    const saved = this.tab.view.scroll[this.diagram._id];
    if (!saved) { this.scrollToContent(); return; }
    this.scrollPageTo(saved, 0, 0);
  }

  scrollPageTo(p, x, y) {
    const z = this.z;
    const vw = this.scroll.clientWidth / z; const vh = this.scroll.clientHeight / z;
    this.layoutStage({ x: p.x - x / z, y: p.y - y / z, w: vw, h: vh });
    this.drawGrid();
    this.growing = true;
    this.scroll.scrollLeft = (p.x - this.world.x) * z - x;
    this.scroll.scrollTop = (p.y - this.world.y) * z - y;
    this.growing = false;
    this.saveScroll();
  }

  scrollToContent() {
    const b = this.contentBox();
    this.scrollPageTo({ x: Math.min(0, b.w ? b.x - 20 : 0), y: Math.min(0, b.h ? b.y - 20 : 0) }, 0, 0);
  }

  /** Grid lines: a thin line every grid step and a darker one every 5 steps (each major square is 5 × 5).
   * The grid zooms with the diagram and is redrawn a level finer or coarser past a threshold (gridStep). */
  drawGrid() {
    const s = this.app.settings();
    this.drawRulers();
    this.drawBackground();
    if (!s.showGrid || !this.world) { this.gridLayer.innerHTML = ''; return; }
    const z = this.z;
    const minor = this.gridStep();
    const major = minor * 5;
    let theme = DIAGRAM_THEMES[s.diagramTheme] ?? {};
    // A diagram with its own background colour gets grid colours that suit it (light ones on a dark
    // background, dark ones on a light one), not the colour scheme's.
    const d = this.diagram;
    const own = d && (d.backgroundKind === 'color' || d.backgroundKind === 'pattern') ? luminance(d.backgroundColor) : null;
    if (own !== null) theme = own > 0.45 ? DIAGRAM_THEMES.classic : DIAGRAM_THEMES.dark;
    const minorColor = theme.grid ?? '#e8ebf0';
    const majorColor = theme.gridMajor ?? '#cfd5de';
    const px = 1 / z; // one screen pixel in page units
    let lines = '';
    for (let k = 1; k < 5; k++) lines += `M${n(k * minor)} 0V${n(major)}M0 ${n(k * minor)}H${n(major)}`;
    const minorPath = lines ? `<path d="${lines}" stroke="${minorColor}" stroke-width="${n(px)}" fill="none"/>` : '';
    const w = this.world;
    this.gridLayer.innerHTML = `<defs><pattern id="grid-pattern" width="${n(major)}" height="${n(major)}" patternUnits="userSpaceOnUse" x="0" y="0">${minorPath}<path d="M0 0V${n(major)}M0 0H${n(major)}" stroke="${majorColor}" stroke-width="${n(px * 1.5)}" fill="none"/></pattern></defs><rect x="${n(w.x)}" y="${n(w.y)}" width="${n(w.w)}" height="${n(w.h)}" fill="url(#grid-pattern)" pointer-events="none"/>`;
  }

  /** The visible part of the page (page units). */
  visibleBox() {
    const z = this.z; const sc = this.scroll; const w = this.world ?? { x: 0, y: 0 };
    return { x: w.x + sc.scrollLeft / z, y: w.y + sc.scrollTop / z, w: (sc.clientWidth || 800) / z, h: (sc.clientHeight || 600) / z };
  }

  /**
   * The diagram's own background (render/notation.js backgroundLayers) under the grid and the views:
   * colour and pattern cover the whole world; a picture is tiled from page 0,0 or placed (fill, fit,
   * centre, stretch) over the visible part and follows scrolling. Without one the SVG gets the
   * scheme's background colour as before. Redrawn only when the background or the world changes.
   */
  drawBackground() {
    const bg = this.ctx?.backdrop ?? null;
    this.svg.style.background = bg ? 'transparent' : (this.ctx?.background ?? '');
    if (!bg || !this.world) { if (this.bgKey) { this.bgLayer.innerHTML = ''; this.bgKey = ''; } return; }
    const w = this.world;
    const key = JSON.stringify({ ...bg, image: `${bg.image.length}:${bg.image.slice(-80)}`, world: [w.x, w.y, w.w, w.h], id: this.diagram?._id });
    if (key !== this.bgKey) {
      this.bgKey = key;
      this.bgLayer.innerHTML = backgroundLayers(bg, w, { id: `cbg-${this.diagram?._id ?? ''}`, view: this.visibleBox() });
    }
    this.placeBackground();
  }

  /** A placed picture follows the visible part of the page (scrolling, resizing). */
  placeBackground() {
    const bg = this.ctx?.backdrop;
    if (!bg || bg.kind !== 'image' || bg.fit === 'tile' || !bg.image) return;
    const v = this.visibleBox();
    const set = (el, attrs) => { if (el) for (const [k, value] of Object.entries(attrs)) el.setAttribute(k, n(value)); };
    const layer = this.bgLayer.querySelector('.diagram-background');
    if (bg.fit === 'center') {
      const box = layer?.querySelector(':scope > svg');
      set(box, { x: v.x, y: v.y, width: v.w, height: v.h });
      set(box?.querySelector('image'), { x: (v.w - (bg.imageWidth || 256)) / 2, y: (v.h - (bg.imageHeight || 256)) / 2 });
    } else set(layer?.querySelector(':scope > image'), { x: v.x, y: v.y, width: v.w, height: v.h });
  }

  /** Rulers along the top and left edges: page coordinates, ticks on the grid, numbers on the major lines, the pointer marked. */
  drawRulers(pointer = this.rulerPointer) {
    const on = Boolean(this.app.settings().showRulers && this.diagram);
    this.root.classList.toggle('no-rulers', !on);
    if (!on || !this.world) return;
    this.rulerPointer = pointer;
    const z = this.z;
    const minor = this.gridStep();
    // Ticks on the grid lines (counted in minor steps, so fractional page steps stay exact);
    // numbers every major line, or every 2/4/… majors when they would crowd.
    let labelEvery = 5;
    while (labelEvery * minor * z < 50) labelEvery *= 2;
    const tickEvery = minor * z >= 4 ? 1 : 5;
    const css = getComputedStyle(this.root);
    const ink = css.getPropertyValue('--muted').trim() || '#6b7280';
    const accent = css.getPropertyValue('--accent').trim() || '#2f6fed';
    const font = `10px ${css.fontFamily || 'sans-serif'}`;
    const dpr = window.devicePixelRatio || 1;
    const sc = this.scroll;
    const draw = (canvas, horizontal) => {
      const length = horizontal ? sc.clientWidth : sc.clientHeight;
      const thick = 20;
      const cw = horizontal ? length : thick; const ch = horizontal ? thick : length;
      if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(ch * dpr)) { canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr); }
      canvas.style.width = `${cw}px`; canvas.style.height = `${ch}px`;
      const c = canvas.getContext('2d');
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.clearRect(0, 0, cw, ch);
      // Page coordinate at the first visible pixel.
      const start = (horizontal ? this.world.x + sc.scrollLeft / z : this.world.y + sc.scrollTop / z);
      const end = start + length / z;
      c.strokeStyle = ink; c.fillStyle = ink; c.lineWidth = 1; c.font = font;
      c.beginPath();
      const first = Math.floor(start / minor);
      const last = Math.ceil(end / minor);
      for (let k = Math.floor(first / tickEvery) * tickEvery; k <= last; k += tickEvery) {
        const at = Math.round((k * minor - start) * z) + 0.5;
        const size = k % 5 === 0 ? (k % labelEvery === 0 ? thick : 9) : 5;
        if (horizontal) { c.moveTo(at, thick); c.lineTo(at, thick - size); } else { c.moveTo(thick, at); c.lineTo(thick - size, at); }
      }
      c.stroke();
      c.textBaseline = 'top';
      for (let k = Math.floor(first / labelEvery) * labelEvery; k <= last; k += labelEvery) {
        const v = k * minor;
        const at = (v - start) * z;
        const text = String(Math.round(v));
        if (horizontal) c.fillText(text, at + 3, 2);
        else { c.save(); c.translate(2, at + 3); c.rotate(-Math.PI / 2); c.textAlign = 'right'; c.fillText(text, 0, 0); c.restore(); }
      }
      if (pointer) {
        const at = Math.round(((horizontal ? pointer.x : pointer.y) - start) * z) + 0.5;
        c.strokeStyle = accent; c.beginPath();
        if (horizontal) { c.moveTo(at, 0); c.lineTo(at, thick); } else { c.moveTo(0, at); c.lineTo(thick, at); }
        c.stroke();
      }
      c.strokeStyle = css.getPropertyValue('--border').trim() || '#d0d4da';
      c.beginPath();
      if (horizontal) { c.moveTo(0, thick - 0.5); c.lineTo(cw, thick - 0.5); } else { c.moveTo(thick - 0.5, 0); c.lineTo(thick - 0.5, ch); }
      c.stroke();
    };
    draw(this.rulerH, true);
    draw(this.rulerV, false);
  }

  // ───────────────────────── overlay (selection, handles, previews)

  boxOf(id) { return this.ctx?.boxes.get(id) ?? null; }
  viewById(id) { return (this.diagram?.ownedViews ?? []).find((v) => v._id === id) ?? null; }

  renderOverlay() {
    if (!this.ctx || !this.world) return;
    const z = this.z;
    const accent = getComputedStyle(this.host).getPropertyValue('--accent').trim() || '#2f6fed';
    const sel = this.app.selection().ids;
    let out = '';
    const S = (p) => this.toStage(p);
    for (const id of sel) {
      const view = this.viewById(id);
      if (!view) continue;
      if (isEdgeView(view)) {
        const route = this.ctx.routes.get(id);
        if (!route) continue;
        const pts = route.points.map(S);
        out += `<polyline points="${pts.map((p) => `${n(p.x)},${n(p.y)}`).join(' ')}" fill="none" stroke="${accent}" stroke-width="2" stroke-dasharray="5 3" pointer-events="none"/>`;
        if (sel.length === 1) {
          const ends = [['tail', pts[0]], ['head', pts.at(-1)]];
          for (const [end, p] of ends) out += `<rect class="handle end-handle" data-end="${end}" data-id="${id}" x="${n(p.x - 5)}" y="${n(p.y - 5)}" width="10" height="10" fill="#fff" stroke="${accent}" stroke-width="2" style="cursor:crosshair"/>`;
          if (view._type === 'UMLMessageView' && this.ctx.sequence) {
            const m = { x: (pts[0].x + pts.at(-1).x) / 2, y: pts[0].y };
            out += `<rect class="handle" data-message="${id}" x="${n(m.x - 6)}" y="${n(m.y - 6)}" width="12" height="12" rx="6" fill="${accent}" stroke="#fff" stroke-width="1.5" style="cursor:ns-resize"/>`;
          } else {
            (view.points ?? []).forEach((p, i) => { const q = S(p); out += `<rect class="handle" data-bend="${i}" data-id="${id}" x="${n(q.x - 5)}" y="${n(q.y - 5)}" width="10" height="10" rx="2" fill="${accent}" stroke="#fff" stroke-width="1.5" style="cursor:move"/>`; });
            for (let i = 1; i < pts.length; i += 1) {
              const a = pts[i - 1]; const b = pts[i];
              if (Math.hypot(b.x - a.x, b.y - a.y) < 30) continue;
              out += `<circle class="handle" data-insert="${i - 1}" data-id="${id}" cx="${n((a.x + b.x) / 2)}" cy="${n((a.y + b.y) / 2)}" r="4" fill="#fff" stroke="${accent}" stroke-width="1.5" style="cursor:copy"/>`;
            }
          }
        }
      } else {
        const b = this.boxOf(id);
        if (!b) continue;
        const p = S(b);
        out += `<rect x="${n(p.x - 1)}" y="${n(p.y - 1)}" width="${n(b.w * z + 2)}" height="${n(b.h * z + 2)}" fill="none" stroke="${accent}" stroke-width="1.5" pointer-events="none"/>`;
        if (sel.length === 1 && !this.locked(view)) {
          HANDLE_POINTS.forEach(([hx, hy], i) => {
            const x = p.x + b.w * z * hx; const y = p.y + b.h * z * hy;
            out += `<rect class="handle" data-resize="${i}" data-id="${id}" x="${n(x - HANDLE / 2)}" y="${n(y - HANDLE / 2)}" width="${HANDLE}" height="${HANDLE}" fill="#fff" stroke="${accent}" stroke-width="1.5" style="cursor:${CURSORS[i]}"/>`;
          });
        }
      }
    }
    if (this.hoverId && !sel.includes(this.hoverId)) {
      const view = this.viewById(this.hoverId);
      if (view && !isEdgeView(view)) { const b = this.boxOf(this.hoverId); if (b) { const p = S(b); out += `<rect x="${n(p.x - 2)}" y="${n(p.y - 2)}" width="${n(b.w * z + 4)}" height="${n(b.h * z + 4)}" fill="none" stroke="${this.hoverBad ? '#e5484d' : accent}" stroke-width="2" opacity="0.6" pointer-events="none"/>`; } }
    }
    const d = this.drag;
    if (d?.kind === 'marquee' && d.current) {
      const a = S(d.start); const b = S(d.current);
      out += `<rect x="${n(Math.min(a.x, b.x))}" y="${n(Math.min(a.y, b.y))}" width="${n(Math.abs(a.x - b.x))}" height="${n(Math.abs(a.y - b.y))}" fill="${accent}" fill-opacity="0.08" stroke="${accent}" stroke-dasharray="4 3" pointer-events="none"/>`;
    }
    if ((d?.kind === 'create-edge' || d?.kind === 'reconnect') && d.current) {
      const a = S(d.anchor); const b = S(d.current);
      out += `<line x1="${n(a.x)}" y1="${n(a.y)}" x2="${n(b.x)}" y2="${n(b.y)}" stroke="${accent}" stroke-width="2" stroke-dasharray="6 4" pointer-events="none"/>`;
    }
    if (d?.kind === 'create-node' && d.current) {
      const a = S(d.start); const b = S(d.current);
      out += `<rect x="${n(Math.min(a.x, b.x))}" y="${n(Math.min(a.y, b.y))}" width="${n(Math.abs(a.x - b.x))}" height="${n(Math.abs(a.y - b.y))}" fill="none" stroke="${accent}" stroke-dasharray="4 3" pointer-events="none"/>`;
    }
    out += this.problemBadges(S, z);
    this.overlay.innerHTML = out;
    this.renderQuickBar();
  }

  /** A red (error) or orange (warning) "!" at the top-right corner of each view whose element has a
   * problem (edges: at the middle of the line) while the Problems panel is open; its tooltip lists them. */
  problemBadges(S, z) {
    const marks = this.app.problemMarkers?.();
    if (!marks?.size) return '';
    const language = this.app.language();
    let out = '';
    for (const [viewId, entry] of marks) {
      const view = this.viewById(viewId);
      if (!view) continue;
      let x; let y;
      if (isEdgeView(view)) {
        const route = this.ctx.routes.get(viewId);
        if (!route?.points?.length) continue;
        const pts = route.points;
        const i = Math.max(1, Math.floor(pts.length / 2));
        const a = S(pts[i - 1]); const b = S(pts[i] ?? pts[i - 1]);
        x = (a.x + b.x) / 2 + 10; y = (a.y + b.y) / 2 - 10;
      } else {
        const box = this.boxOf(viewId);
        if (!box) continue;
        const p = S(box);
        x = p.x + box.w * z - 2; y = p.y + 2;
      }
      const color = entry.severity === 'error' ? '#e5484d' : '#f5a524';
      const tip = [this.app.t('problems.badgeTip', { count: entry.rows.length }), ...entry.rows.slice(0, 8).map((r) => `• ${r.message?.[language] ?? ''}`), entry.rows.length > 8 ? '…' : ''].filter(Boolean).join('\n');
      out += `<g class="problem-badge ${entry.severity}" data-problem-view="${escapeHtml(viewId)}" transform="translate(${n(x)},${n(y)})"><title>${escapeHtml(tip)}</title><circle r="8" fill="${color}" stroke="#fff" stroke-width="1.5"/><text y="4" text-anchor="middle" font-size="12" font-weight="700" font-family="Segoe UI, sans-serif" fill="#fff">!</text></g>`;
    }
    return out;
  }

  locked(view) { return Boolean(view?.locked) || Boolean(elementOf(this.ctx, view)?.isLocked); }

  /** Small buttons under a selected class (StarUML quick edit): +attribute, +operation, related … */
  renderQuickBar() {
    const sel = this.app.selection().ids;
    const view = sel.length === 1 ? this.viewById(sel[0]) : null;
    const element = view && !isEdgeView(view) ? elementOf(this.ctx, view) : null;
    if (!element || this.drag || this.editing || !this.app.settings().showQuickButtons) { this.quickBar.hidden = true; return; }
    const def = typeDef(element._type);
    const buttons = [];
    const t = this.app.t;
    const compartments = def?.compartments ?? [];
    if (compartments.includes('attributes')) buttons.push(['addAttribute', 'umlAttribute', t('quick.attribute')]);
    if (compartments.includes('operations')) buttons.push(['addOperation', 'umlOperation', t('quick.operation')]);
    if (compartments.includes('literals')) buttons.push(['addLiteral', 'umlLiteral', t('quick.literal')]);
    if (compartments.includes('columns')) buttons.push(['addColumn', 'erdColumn', t('quick.column')]);
    if (compartments.includes('slots')) buttons.push(['addSlot', 'umlSlot', t('quick.slot')]);
    if (element._type === 'UMLCombinedFragment') buttons.push(['addOperand', 'umlOperand', t('quick.operand')]);
    if (compartments.includes('timeSegments')) buttons.push(['addTimeSegment', 'umlTimeSegment', t('quick.timeSegment')]);
    if (relatedFor(element).length) buttons.push(['related', 'plus', t('quick.related')]);
    if (!buttons.length) { this.quickBar.hidden = true; return; }
    const b = this.boxOf(view._id);
    const p = this.toStage({ x: b.x, y: b.y + b.h });
    this.quickBar.hidden = false;
    this.quickBar.style.left = `${n(p.x)}px`;
    this.quickBar.style.top = `${n(p.y + 8 + (viewDef(view._type).nameOutside ? 22 : 0))}px`;
    this.quickBar.innerHTML = buttons.map(([id, glyph, label]) => `<button class="quick-button" data-quick="${id}" data-view="${view._id}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">${icon(glyph)}${id === 'related' ? icon('chevronDown', 'icon tiny') : ''}</button>`).join('');
  }

  // ───────────────────────── hit testing

  viewAt(event) {
    const g = event.target.closest?.('[data-view]');
    return g ? this.viewById(g.dataset.view) : null;
  }

  /** The node view under a page point (smallest box first), ignoring some ids. */
  nodeAt(p, exclude = new Set(), { edges = false } = {}) {
    const views = (this.diagram?.ownedViews ?? []).filter((v) => !exclude.has(v._id));
    if (edges) {
      for (const v of views) {
        if (!isEdgeView(v)) continue;
        const r = this.ctx.routes.get(v._id);
        if (r && distToPolyline(p, r.points) < 6 / this.z) return v;
      }
    }
    const hits = views.filter((v) => !isEdgeView(v) && this.boxOf(v._id) && inBox(this.boxOf(v._id), p, 2));
    hits.sort((a, b) => this.boxOf(a._id).w * this.boxOf(a._id).h - this.boxOf(b._id).w * this.boxOf(b._id).h);
    return hits[0] ?? null;
  }

  // ───────────────────────── events

  bind() {
    const sc = this.scroll;
    sc.addEventListener('pointerdown', (event) => this.onPointerDown(event));
    sc.addEventListener('pointermove', (event) => this.onHover(event));
    // No 'dblclick' listener: the press re-renders the view under the pointer and the drag captures
    // the pointer, so the browser never fires click/dblclick here. onPointerDown spots the second press.
    sc.addEventListener('contextmenu', (event) => this.onContextMenu(event));
    sc.addEventListener('scroll', () => { if (!this.growing) { this.growNearEdges(); this.saveScroll(); this.drawMinimapView(); } this.drawRulers(); this.placeBackground(); }, { passive: true });
    sc.addEventListener('wheel', (event) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      const steps = CANVAS_ZOOM.steps;
      const current = Math.round(this.z * 100);
      const next = event.deltaY < 0 ? steps.find((v) => v > current) ?? CANVAS_ZOOM.max : [...steps].reverse().find((v) => v < current) ?? CANVAS_ZOOM.min;
      this.zoomTo(next, event.clientX, event.clientY);
    }, { passive: false });
    this.quickBar.addEventListener('pointerdown', (event) => event.stopPropagation());
    this.quickBar.addEventListener('click', (event) => {
      const button = event.target.closest('[data-quick]');
      if (button) this.app.quickAction(button.dataset.quick, button.dataset.view, button);
    });
    this.tabs.addEventListener('click', (event) => {
      const close = event.target.closest('[data-diagram-close]');
      if (close) { event.stopPropagation(); this.app.closeDiagram(close.dataset.diagramClose); return; }
      if (event.target.closest('[data-diagram-add]')) { this.app.run('addDiagram', { anchor: this.app.anchorBelow(event.target.closest('[data-diagram-add]')) }); return; }
      const tab = event.target.closest('[data-diagram]');
      if (tab) this.app.openDiagram(tab.dataset.diagram);
    });
    this.typeTabs.addEventListener('click', (event) => {
      const group = event.target.closest('[data-type-group]');
      if (group) { this.typeGroup = group.dataset.typeGroup; this.renderTypeTabs(); return; }
      const type = event.target.closest('[data-diagram-type]');
      if (type) { this.app.openDiagramType(type.dataset.diagramType); return; }
      const add = event.target.closest('[data-type-add]');
      if (add) { this.app.addDiagram(add.dataset.typeAdd); return; }
      const scroll = event.target.closest('[data-type-scroll]');
      if (scroll) {
        const strip = scroll.closest('.type-row').querySelector('.type-strip');
        strip.scrollBy({ left: Number(scroll.dataset.typeScroll) * Math.max(120, strip.clientWidth * 0.6), behavior: 'instant' });
        this.updateTypeNav();
      }
    });
    // One line per row: the mouse wheel scrolls it sideways, and ‹ › follow the scroll position.
    for (const strip of this.typeTabs.querySelectorAll('.type-strip')) {
      strip.addEventListener('wheel', (event) => { if (strip.scrollWidth <= strip.clientWidth) return; event.preventDefault(); strip.scrollLeft += event.deltaY || event.deltaX; }, { passive: false });
      strip.addEventListener('scroll', () => this.updateTypeNav(), { passive: true });
    }
    this.tabs.addEventListener('dblclick', (event) => { const tab = event.target.closest('[data-diagram]'); if (tab) this.renameDiagramInline(tab); });
    this.tabs.addEventListener('contextmenu', (event) => { const tab = event.target.closest('[data-diagram]'); if (tab) { event.preventDefault(); this.app.openDiagram(tab.dataset.diagram); this.app.contextMenu(event, 'diagramTab', { id: tab.dataset.diagram }); } });
    this.minimap.addEventListener('pointerdown', (event) => this.onMinimapDown(event));
    // Drop from the Model Explorer (pointer-driven; the explorer starts it).
    this.scroll.addEventListener('explorer-drop', (event) => { const p = this.toPage(event.detail.x, event.detail.y); this.app.dropElements(event.detail.ids, p); });
  }

  onHover(event) {
    const p = this.toPage(event.clientX, event.clientY);
    this.app.pointerAt(p);
    this.drawRulers(p);
    if (this.drag) return;
    const tool = this.app.tool();
    const view = this.viewAt(event);
    const id = tool ? view?._id ?? null : null;
    if (id !== this.hoverId) { this.hoverId = id; this.hoverBad = false; this.renderOverlay(); }
  }

  onPointerDown(event) {
    if (event.button === 1 || (event.button === 0 && this.spaceDown)) return this.startPan(event);
    if (event.button !== 0) return undefined;
    const badge = event.target.closest?.('.problem-badge');
    if (badge) {
      // A problem badge: select the view and its first problem in the Problems panel.
      event.preventDefault();
      const id = badge.dataset.problemView;
      if (this.viewById(id)) this.app.select([id], { primary: id });
      this.app.problemBadge?.(id);
      return undefined;
    }
    if (this.isSecondPress(event)) { event.preventDefault(); return this.onDoubleClick(event); }
    if (this.editing) { this.finishEdit(); }
    const p = this.toPage(event.clientX, event.clientY);
    const tool = this.app.tool();
    const handle = event.target.closest?.('.handle');
    this.scroll.focus({ preventScroll: true });
    if (handle) return this.startHandle(handle, event, p);
    if (tool) {
      event.preventDefault();
      if (tool.kind === 'edge') {
        const from = this.viewAt(event) ?? this.nodeAt(p, new Set(), { edges: tool.type === 'UMLAssociationClassLink' || tool.type === 'UMLNoteLinkView' });
        if (!from) { this.app.notify('info', this.app.t('notice.edgeStart')); return undefined; }
        if (tool.onConnector) return this.app.addMessageOnConnector(from, p);
        const anchor = isEdgeView(from) ? p : this.centerOf(from._id, p);
        return this.beginDrag(event, { kind: 'create-edge', tool, from, anchor: tool.type === 'UMLMessage' ? { x: anchor.x, y: p.y } : anchor, y: p.y, current: null });
      }
      return this.beginDrag(event, { kind: 'create-node', tool, start: { x: this.snap(p.x, event), y: this.snap(p.y, event) }, current: null });
    }
    const view = this.viewAt(event);
    if (!view) {
      if (!event.shiftKey && !event.ctrlKey && !event.metaKey) this.app.select([]);
      return this.beginDrag(event, { kind: 'marquee', start: p, current: null, additive: event.shiftKey || event.ctrlKey || event.metaKey, before: [...this.app.selection().ids] });
    }
    const sel = this.app.selection().ids;
    if (event.shiftKey || event.ctrlKey || event.metaKey) {
      this.app.select(sel.includes(view._id) ? sel.filter((x) => x !== view._id) : [...sel, view._id], { primary: view._id });
      return undefined;
    }
    if (!sel.includes(view._id)) this.app.select([view._id], { primary: view._id });
    if (isEdgeView(view)) {
      if (view._type === 'UMLMessageView' && this.ctx.sequence) return this.beginDrag(event, { kind: 'message', ids: [view._id], start: p, snapshot: this.snapshot() });
      return undefined;
    }
    if (this.locked(view)) return undefined;
    return this.startMove(event, p);
  }

  /** True for the second press of a double click (same place, within the double-click time). */
  isSecondPress(event) {
    const now = performance.now();
    const last = this.lastPress;
    const second = Boolean(last && now - last.time < 500 && Math.hypot(event.clientX - last.x, event.clientY - last.y) < 6 && !event.shiftKey && !event.ctrlKey && !event.metaKey);
    this.lastPress = second ? null : { time: now, x: event.clientX, y: event.clientY };
    return second;
  }

  centerOf(id, fallback) { const b = this.boxOf(id); return b ? { x: b.x + b.w / 2, y: b.y + b.h / 2 } : fallback; }

  startPan(event) {
    event.preventDefault();
    const sc = this.scroll;
    const start = { x: event.clientX, y: event.clientY, left: sc.scrollLeft, top: sc.scrollTop };
    sc.setPointerCapture(event.pointerId);
    sc.style.cursor = 'grabbing';
    const move = (e) => { sc.scrollLeft = start.left - (e.clientX - start.x); sc.scrollTop = start.top - (e.clientY - start.y); };
    const up = () => { sc.removeEventListener('pointermove', move); sc.removeEventListener('pointerup', up); sc.style.cursor = ''; };
    sc.addEventListener('pointermove', move);
    sc.addEventListener('pointerup', up);
  }

  snapshot() { return JSON.stringify(this.diagram.ownedViews); }
  restoreSnapshot(d = this.drag) {
    if (d?.snapshot) { this.diagram.ownedViews = JSON.parse(d.snapshot); this.tab.touch(); }
  }

  startMove(event, p) {
    const sel = this.app.selection().ids;
    const ids = new Set(sel);
    // Containers carry the views inside them.
    for (const id of sel) {
      const view = this.viewById(id);
      if (view && !isEdgeView(view) && CONTAINER_SHAPES.has(shapeOfView(view))) for (const inner of viewsInside(this.ctx, view)) ids.add(inner._id);
    }
    // Lines between moved nodes move with them; messages of moved lifelines keep their y.
    const startBoxes = new Map([...ids].map((id) => [id, this.boxOf(id)]).filter(([, b]) => b));
    const lead = this.boxOf(sel[0]);
    return this.beginDrag(event, { kind: 'move', ids: [...ids], start: p, lead, startBoxes, snapshot: this.snapshot(), copy: event.altKey && false });
  }

  startHandle(handle, event, p) {
    event.preventDefault();
    const id = handle.dataset.id;
    if (handle.dataset.resize !== undefined) {
      const box = this.boxOf(id);
      return this.beginDrag(event, { kind: 'resize', id, handle: Number(handle.dataset.resize), box: { ...box }, start: p, snapshot: this.snapshot() });
    }
    if (handle.dataset.bend !== undefined) return this.beginDrag(event, { kind: 'bend', id, index: Number(handle.dataset.bend), snapshot: this.snapshot() });
    if (handle.dataset.insert !== undefined) {
      const view = this.viewById(id);
      const route = this.ctx.routes.get(id);
      // Points of the route between the ends become bend points (a straight line has none yet).
      const inner = route.points.slice(1, -1);
      const base = (view.points?.length ? view.points : inner).map((q) => ({ x: q.x, y: q.y }));
      const seg = Number(handle.dataset.insert);
      const at = Math.min(base.length, seg);
      return this.beginDrag(event, { kind: 'bend', id, index: at, insert: { base, at, p }, snapshot: this.snapshot() });
    }
    if (handle.dataset.end) {
      const view = this.viewById(id);
      const other = handle.dataset.end === 'tail' ? refId(view.head) : refId(view.tail);
      return this.beginDrag(event, { kind: 'reconnect', id, end: handle.dataset.end, anchor: this.centerOf(other, p), current: p, snapshot: this.snapshot() });
    }
    if (handle.dataset.message) return this.beginDrag(event, { kind: 'message', ids: [handle.dataset.message], start: p, snapshot: this.snapshot() });
    return undefined;
  }

  beginDrag(event, drag) {
    this.drag = { ...drag, moved: false, pointerId: event.pointerId, client: { x: event.clientX, y: event.clientY } };
    this.scroll.setPointerCapture?.(event.pointerId);
    const move = (e) => this.onDragMove(e);
    const up = (e) => {
      this.scroll.removeEventListener('pointermove', move);
      this.scroll.removeEventListener('pointerup', up);
      this.scroll.removeEventListener('pointercancel', up);
      this.onDragEnd(e);
    };
    this.scroll.addEventListener('pointermove', move);
    this.scroll.addEventListener('pointerup', up);
    this.scroll.addEventListener('pointercancel', up);
    this.renderQuickBar();
  }

  onDragMove(event) {
    const d = this.drag;
    if (!d) return;
    if (!d.moved && Math.hypot(event.clientX - d.client.x, event.clientY - d.client.y) < 3) return;
    d.moved = true;
    const p = this.toPage(event.clientX, event.clientY);
    this.app.pointerAt(p);
    this.autoScroll(event);
    switch (d.kind) {
      case 'marquee': d.current = p; this.renderOverlay(); break;
      case 'create-node': d.current = { x: this.snap(p.x, event), y: this.snap(p.y, event) }; this.renderOverlay(); break;
      case 'create-edge': case 'reconnect': {
        d.current = p;
        const exclude = new Set(d.kind === 'reconnect' ? [d.id] : []);
        const target = this.nodeAt(p, exclude, { edges: d.tool?.type === 'UMLAssociationClassLink' || d.tool?.type === 'UMLNoteLinkView' });
        this.hoverId = target?._id ?? null;
        this.hoverBad = Boolean(target) && d.kind === 'create-edge' && !this.app.canConnect(d.tool, d.from, target);
        this.renderOverlay();
        break;
      }
      case 'move': {
        this.restoreSnapshot();
        let dx = p.x - d.start.x; let dy = p.y - d.start.y;
        if (event.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
        if (d.lead) { dx = this.snap(d.lead.x + dx, event) - d.lead.x; dy = this.snap(d.lead.y + dy, event) - d.lead.y; }
        d.dx = dx; d.dy = dy;
        this.app.moveViewsLive(d.ids, dx, dy);
        this.drawFrame();
        break;
      }
      case 'resize': {
        this.restoreSnapshot();
        const view = this.viewById(d.id);
        const [hx, hy] = HANDLE_POINTS[d.handle];
        let { x, y, w, h } = d.box;
        const px = this.snap(p.x, event); const py = this.snap(p.y, event);
        if (hx === 0) { w = Math.max(8, x + w - px); x = x + d.box.w - w; } else if (hx === 1) w = Math.max(8, px - x);
        if (hy === 0) { h = Math.max(8, y + h - py); y = y + d.box.h - h; } else if (hy === 1) h = Math.max(8, py - y);
        Object.assign(view, { left: Math.round(x), top: Math.round(y), width: Math.round(w), height: Math.round(h), autoResize: false });
        this.drawFrame();
        break;
      }
      case 'bend': {
        this.restoreSnapshot();
        const view = this.viewById(d.id);
        if (d.insert) { view.points = [...d.insert.base]; view.points.splice(d.insert.at, 0, { x: p.x, y: p.y }); d.index = d.insert.at; }
        const pts = view.points ?? [];
        if (pts[d.index]) pts[d.index] = { x: this.snap(p.x, event), y: this.snap(p.y, event) };
        view.points = pts;
        this.drawFrame();
        break;
      }
      case 'message': {
        this.restoreSnapshot();
        for (const id of d.ids) { const v = this.viewById(id); v.y = Math.round((v.y ?? 0) + (p.y - d.start.y)); }
        this.drawFrame();
        break;
      }
      default: break;
    }
  }

  autoScroll(event) {
    const r = this.scroll.getBoundingClientRect();
    const margin = 24;
    const dx = event.clientX < r.left + margin ? -12 : event.clientX > r.right - margin ? 12 : 0;
    const dy = event.clientY < r.top + margin ? -12 : event.clientY > r.bottom - margin ? 12 : 0;
    if (dx || dy) { this.scroll.scrollLeft += dx; this.scroll.scrollTop += dy; }
  }

  onDragEnd(event) {
    const d = this.drag;
    if (!d) return;
    const p = this.toPage(event.clientX, event.clientY);
    // Put the diagram back as it was before the drag; the app records the change as one undo step.
    const finalViews = d.snapshot && d.moved ? clone(this.diagram.ownedViews) : null;
    this.restoreSnapshot(d);
    this.drag = null;
    this.hoverId = null;
    try {
      switch (d.kind) {
        case 'marquee': {
          if (!d.moved || !d.current) break;
          const box = { x: Math.min(d.start.x, d.current.x), y: Math.min(d.start.y, d.current.y), w: Math.abs(d.start.x - d.current.x), h: Math.abs(d.start.y - d.current.y) };
          const ids = [];
          for (const v of this.diagram.ownedViews) {
            if (isEdgeView(v)) { const r = this.ctx.routes.get(v._id); if (r && r.points.every((q) => inBox(box, q))) ids.push(v._id); continue; }
            const b = this.boxOf(v._id);
            if (b && b.x >= box.x && b.y >= box.y && b.x + b.w <= box.x + box.w && b.y + b.h <= box.y + box.h) ids.push(v._id);
          }
          this.app.select(d.additive ? [...new Set([...d.before, ...ids])] : ids);
          break;
        }
        case 'create-node': {
          const box = d.moved && d.current ? { x: Math.min(d.start.x, d.current.x), y: Math.min(d.start.y, d.current.y), w: Math.abs(d.start.x - d.current.x), h: Math.abs(d.start.y - d.current.y) } : { x: d.start.x, y: d.start.y, w: 0, h: 0 };
          if (box.w < 10 || box.h < 10) { box.w = 0; box.h = 0; }
          this.app.createNodeAt(d.tool, box, { keepTool: event.shiftKey });
          break;
        }
        case 'create-edge': {
          const target = this.nodeAt(p, new Set(), { edges: d.tool.type === 'UMLAssociationClassLink' || d.tool.type === 'UMLNoteLinkView' }) ?? (d.moved ? null : d.from);
          if (!target || (!d.moved && !['UMLMessage'].includes(d.tool.type))) { if (!target) this.app.notify('info', this.app.t('notice.edgeEnd')); break; }
          this.app.createEdgeBetween(d.tool, d.from._id, target._id, { y: d.y, keepTool: event.shiftKey });
          break;
        }
        case 'reconnect': {
          if (!d.moved) break;
          const target = this.nodeAt(p, new Set([d.id]));
          if (target) this.app.reconnect(d.id, d.end, target._id);
          break;
        }
        case 'move': case 'resize': case 'bend': case 'message':
          if (finalViews) this.app.commitViews(d.kind === 'move' ? 'op.move' : d.kind === 'resize' ? 'op.resize' : d.kind === 'bend' ? 'op.bend' : 'op.message', finalViews, d.kind === 'move' ? d.ids : []);
          break;
        default: break;
      }
    } finally {
      this.update();
    }
  }

  onDoubleClick(event) {
    const view = this.viewAt(event);
    const handle = event.target.closest?.('[data-bend]');
    if (handle) { this.app.removeBend(handle.dataset.id, Number(handle.dataset.bend)); return; }
    if (!view) { if (this.app.tool()) return; this.app.run('quickAddHere', { point: this.toPage(event.clientX, event.clientY) }); return; }
    this.startEdit(view._id);
  }

  onContextMenu(event) {
    event.preventDefault();
    const view = this.viewAt(event);
    const point = this.toPage(event.clientX, event.clientY);
    if (view && !this.app.selection().ids.includes(view._id)) this.app.select([view._id], { primary: view._id });
    if (!view) return this.app.contextMenu(event, 'canvas', { point });
    if (this.app.selection().ids.length > 1) return this.app.contextMenu(event, 'multi', { point });
    return this.app.contextMenu(event, isEdgeView(view) ? 'edge' : 'node', { id: view._id, point });
  }

  // ───────────────────────── in-place editing

  /** Edits a view's text in place: a class's quick edit, a note's text, an element's name, a line's name. */
  startEdit(viewId, initial = null) {
    const view = this.viewById(viewId);
    if (!view || this.locked(view)) return;
    const mode = this.app.editModeOf(view);
    if (!mode) return;
    this.finishEdit(true);
    const z = this.z;
    let box;
    if (isEdgeView(view)) {
      const r = this.ctx.routes.get(viewId);
      const mid = r ? r.points[Math.floor(r.points.length / 2) - (r.points.length % 2 === 0 ? 1 : 0)] : { x: 0, y: 0 };
      const m2 = r?.points.length ? { x: (r.points[0].x + r.points.at(-1).x) / 2, y: (r.points[0].y + r.points.at(-1).y) / 2 } : mid;
      box = { x: m2.x - 90, y: m2.y - 16, w: 180, h: 28 };
    } else box = this.boxOf(viewId);
    const multi = mode.multiline;
    const editor = document.createElement('textarea');
    editor.className = `text-editor ${multi ? 'multi' : ''}`;
    editor.value = initial ?? mode.text;
    editor.spellcheck = false;
    const p = this.toStage(box);
    const lines = String(editor.value).split('\n');
    const longest = Math.max(...lines.map((line) => line.length), 10);
    const w = multi ? Math.max(260, box.w * z, Math.min(560, longest * 8 + 30)) : Math.max(120, box.w * z);
    const h = multi ? Math.max(box.h * z, Math.min(420, lines.length * 18 + 30), 120) : Math.max(26, Math.min(box.h * z, 60));
    Object.assign(editor.style, { left: `${n(p.x)}px`, top: `${n(p.y + (multi ? 0 : Math.max(0, (box.h * z - h) / 2)))}px`, width: `${n(w)}px`, height: `${n(h)}px`, fontSize: `${n(13 * Math.max(0.8, Math.min(z, 1.6)))}px` });
    editor.title = this.app.t(multi ? 'canvas.quickEditTip' : 'canvas.editTip');
    this.stage.append(editor);
    this.editing = { viewId, editor, mode };
    this.quickBar.hidden = true;
    editor.focus();
    if (initial === null) editor.select(); else editor.setSelectionRange(editor.value.length, editor.value.length);
    editor.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'Escape') { event.preventDefault(); this.finishEdit(true); }
      else if (event.key === 'Enter' && (!multi || event.ctrlKey || event.metaKey)) { event.preventDefault(); this.finishEdit(); }
    });
    editor.addEventListener('blur', () => setTimeout(() => { if (this.editing?.editor === editor) this.finishEdit(); }, 0));
  }

  finishEdit(cancel = false) {
    const editing = this.editing;
    if (!editing) return;
    this.editing = null;
    const value = editing.editor.value;
    editing.editor.remove();
    if (!cancel && value !== editing.mode.text) this.app.commitEdit(editing.viewId, value, editing.mode);
    else this.renderQuickBar();
    this.scroll.focus({ preventScroll: true });
  }

  /** Compatibility name (app shortcuts). */
  finishTextEdit(cancel = false) { this.finishEdit(cancel); }
  startTextEdit(id, initial = null) { this.startEdit(id, initial); }

  // ───────────────────────── zoom

  zoomTo(percent, clientX = null, clientY = null) {
    const value = Math.max(CANVAS_ZOOM.min, Math.min(CANVAS_ZOOM.max, Math.round(percent)));
    const r = this.scroll.getBoundingClientRect();
    const cx = clientX ?? r.left + r.width / 2; const cy = clientY ?? r.top + r.height / 2;
    const anchor = this.toPage(cx, cy);
    this.zoomPercent = value;
    this.world = null;
    this.update();
    this.scrollPageTo(anchor, cx - r.left, cy - r.top);
    this.app.zoomChanged();
  }

  fitBox(box, { maxZoom = 200 } = {}) {
    if (!box || !box.w || !box.h) return;
    const vw = this.scroll.clientWidth - 40; const vh = this.scroll.clientHeight - 40;
    const z = Math.max(CANVAS_ZOOM.min, Math.min(maxZoom, Math.floor(Math.min(vw / box.w, vh / box.h) * 100)));
    this.zoomPercent = z;
    this.world = null;
    this.update();
    const s = z / 100;
    this.scrollPageTo({ x: box.x + box.w / 2, y: box.y + box.h / 2 }, this.scroll.clientWidth / 2, this.scroll.clientHeight / 2);
    void s;
    this.app.zoomChanged();
  }

  fitPage() { this.fitBox(this.contentBox(), { maxZoom: 100 }); }
  fitWidth() { const b = this.contentBox(); if (b.w) this.fitBox({ ...b, h: 1 }); }
  zoomSelection() { const b = union(this.app.selection().ids.map((id) => this.boxOf(id) ?? (this.ctx.routes.get(id) ? boundsOfPoints(this.ctx.routes.get(id).points) : null))); if (b) this.fitBox({ x: b.x - 20, y: b.y - 20, w: b.w + 40, h: b.h + 40 }); }

  /** Scrolls a view into sight. */
  reveal(id) {
    const b = this.boxOf(id) ?? (this.ctx?.routes.get(id) ? boundsOfPoints(this.ctx.routes.get(id).points) : null);
    if (!b) return;
    const z = this.z;
    const p = this.toStage(b);
    const sc = this.scroll;
    if (p.x < sc.scrollLeft || p.y < sc.scrollTop || p.x + b.w * z > sc.scrollLeft + sc.clientWidth || p.y + b.h * z > sc.scrollTop + sc.clientHeight) {
      this.scrollPageTo({ x: b.x + b.w / 2, y: b.y + b.h / 2 }, sc.clientWidth / 2, sc.clientHeight / 2);
    }
  }

  viewCenter() {
    const sc = this.scroll;
    const r = sc.getBoundingClientRect();
    return this.toPage(r.left + r.width / 2, r.top + r.height / 2);
  }

  // ───────────────────────── minimap

  drawMinimap() {
    const show = this.app.settings().showMinimap && Boolean(this.diagram);
    this.minimap.hidden = !show;
    if (!show || !this.ctx) return;
    const b = this.contentBox();
    this.miniContent = b.w ? { x: b.x - 20, y: b.y - 20, w: b.w + 40, h: b.h + 40 } : { x: 0, y: 0, w: 400, h: 300 };
    const svg = this.minimap.querySelector('svg');
    const bg = this.ctx.backdrop;
    svg.innerHTML = (bg ? backgroundLayers(bg, this.world ?? this.miniContent, { id: `mbg-${this.diagram._id}`, view: this.miniContent }) : '') + this.content.innerHTML;
    this.drawMinimapView();
  }

  drawMinimapView() {
    if (this.minimap.hidden || !this.miniContent || !this.world) return;
    const z = this.z;
    const vx = this.world.x + this.scroll.scrollLeft / z; const vy = this.world.y + this.scroll.scrollTop / z;
    const vw = this.scroll.clientWidth / z; const vh = this.scroll.clientHeight / z;
    // The minimap shows the drawing AND the visible part, so the view rectangle is always inside it and to scale.
    const c = this.miniContent;
    const x1 = Math.min(c.x, vx - 10); const y1 = Math.min(c.y, vy - 10);
    const box = this.miniFrozen ?? { x: x1, y: y1, w: Math.max(c.x + c.w, vx + vw + 10) - x1, h: Math.max(c.y + c.h, vy + vh + 10) - y1 };
    this.miniBox = box;
    this.minimap.querySelector('svg').setAttribute('viewBox', `${n(box.x)} ${n(box.y)} ${n(box.w)} ${n(box.h)}`);
    const rect = { width: this.minimap.clientWidth, height: this.minimap.clientHeight };
    const s = Math.min(rect.width / box.w, rect.height / box.h);
    const ox = (rect.width - box.w * s) / 2; const oy = (rect.height - box.h * s) / 2;
    const view = this.minimap.querySelector('.minimap-view');
    // The visible part, clamped inside the minimap: all four edges of the rectangle always show,
    // also when the view reaches past the drawing (scrolled to an edge, or zoomed far out).
    const W = this.minimap.clientWidth; const H = this.minimap.clientHeight;
    const MIN = 8;
    let left = ox + (vx - box.x) * s; let top = oy + (vy - box.y) * s;
    let right = left + vw * s; let bottom = top + vh * s;
    left = Math.max(0, Math.min(left, W - MIN)); top = Math.max(0, Math.min(top, H - MIN));
    right = Math.min(W, Math.max(right, left + MIN)); bottom = Math.min(H, Math.max(bottom, top + MIN));
    Object.assign(view.style, { left: `${n(left)}px`, top: `${n(top)}px`, width: `${n(right - left)}px`, height: `${n(bottom - top)}px` });
    this.miniScale = { s, ox, oy };
  }

  onMinimapDown(event) {
    event.preventDefault();
    const go = (e) => {
      // Measured from the inside of the frame, like the view rectangle.
      const rect = this.minimap.getBoundingClientRect();
      const left = rect.left + this.minimap.clientLeft; const top = rect.top + this.minimap.clientTop;
      const { s, ox, oy } = this.miniScale ?? { s: 1, ox: 0, oy: 0 };
      const p = { x: this.miniBox.x + (e.clientX - left - ox) / s, y: this.miniBox.y + (e.clientY - top - oy) / s };
      this.scrollPageTo(p, this.scroll.clientWidth / 2, this.scroll.clientHeight / 2);
      this.drawMinimapView();
    };
    // While dragging, the minimap keeps its framing (it would otherwise follow the view and slide under the pointer).
    this.miniFrozen = this.miniBox;
    go(event);
    const move = (e) => go(e);
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); this.miniFrozen = null; this.drawMinimapView(); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  // ───────────────────────── working diagram tabs

  /** Tabs per diagram type: a row of groups (UML structure, UML behavior, ER, …) and a row of the group's types. */
  renderTypeTabs() {
    const tab = this.tab;
    if (!tab) { this.typeTabs.hidden = true; return; }
    this.typeTabs.hidden = false;
    const ko = this.app.language() === 'ko';
    const currentType = this.diagram?._type ?? null;
    // The group follows the open diagram; a group tab the user picked stays until the diagram type changes.
    if (currentType !== this.typeTabsFor) { this.typeTabsFor = currentType; this.typeGroup = currentType ? diagramTabOf(currentType) : this.typeGroup ?? 'umlStructure'; }
    const counts = new Map();
    for (const e of tab.index.byId.values()) if (typeDef(e._type)?.diagram) counts.set(e._type, (counts.get(e._type) ?? 0) + 1);
    const short = (type) => {
      const def = typeDef(type);
      return (ko ? def.ko : def.en).replace(/ ?(다이어그램|Diagram)$/, '').replace(/^SysML /, '');
    };
    this.typeTabs.querySelector('.type-families').innerHTML = DIAGRAM_TABS.map(([id, groupKo, groupEn, types]) => {
      const active = id === this.typeGroup;
      const has = types.some((type) => counts.get(type));
      return `<button class="type-family ${active ? 'active' : ''} ${has ? 'has' : ''}" role="tab" aria-selected="${active}" data-type-group="${id}" title="${escapeHtml(ko ? groupKo : groupEn)}">${icon(typeDef(types[0]).icon ?? 'dgClass')}<span>${escapeHtml(ko ? groupKo : groupEn)}</span></button>`;
    }).join('');
    const types = DIAGRAM_TABS.find(([id]) => id === this.typeGroup)?.[3] ?? [];
    this.typeTabs.querySelector('.type-list').innerHTML = types.map((type) => {
      const def = typeDef(type);
      const count = counts.get(type) ?? 0;
      const active = type === currentType;
      const name = ko ? def.ko : def.en;
      const tip = count ? this.app.t('typeTabs.open', { name }) : this.app.t('typeTabs.create', { name });
      return `<button class="type-tab ${active ? 'active' : ''}" role="tab" aria-selected="${active}" data-diagram-type="${type}" title="${escapeHtml(tip)}">${icon(def.icon ?? 'dgClass')}<span>${escapeHtml(short(type))}</span>${count ? `<span class="type-count">${count}</span>` : ''}</button>`;
    }).join('') + (currentType && types.includes(currentType)
      ? `<button class="type-add" data-type-add="${currentType}" title="${escapeHtml(this.app.t('typeTabs.add', { name: ko ? typeDef(currentType).ko : typeDef(currentType).en }))}">${icon('plus')}</button>` : '');
    // The chosen group and type stay in view.
    for (const active of this.typeTabs.querySelectorAll('.type-family.active, .type-tab.active')) {
      const strip = active.parentElement;
      if (active.offsetLeft < strip.scrollLeft) strip.scrollLeft = active.offsetLeft - 4;
      else if (active.offsetLeft + active.offsetWidth > strip.scrollLeft + strip.clientWidth) strip.scrollLeft = active.offsetLeft + active.offsetWidth - strip.clientWidth + 4;
    }
    this.updateTypeNav();
  }

  /** ‹ › of each type-tab row: shown only when its tabs do not fit, disabled at either end. */
  updateTypeNav() {
    for (const row of this.typeTabs.querySelectorAll('.type-row')) {
      const strip = row.querySelector('.type-strip');
      row.classList.toggle('overflow', strip.scrollWidth > strip.clientWidth + 1);
      const [left, right] = row.querySelectorAll('.type-scroll');
      left.disabled = strip.scrollLeft <= 0;
      right.disabled = strip.scrollLeft + strip.clientWidth >= strip.scrollWidth - 1;
    }
  }

  /** The diagram tabs live in the app's tab bar above the canvas (one project, a tab per diagram); here only the type tabs. */
  renderTabs() {
    this.renderTypeTabs();
    this.tabs.hidden = true;
  }

  renderWorkingTabs() {
    const tab = this.tab;
    if (!tab) { this.tabs.innerHTML = ''; return; }
    const index = tab.index;
    const current = this.diagram?._id;
    this.tabs.innerHTML = `<div class="page-tab-list">${tab.view.open.map((id) => {
      const d = index.get(id);
      if (!d) return '';
      const def = typeDef(d._type);
      return `<div class="page-tab ${id === current ? 'active' : ''}" role="tab" aria-selected="${id === current}" data-diagram="${id}" title="${escapeHtml(`${d.name} (${this.app.language() === 'ko' ? def.ko : def.en})`)}">${icon(def.icon ?? 'dgClass')}<span>${escapeHtml(d.name || '—')}</span><button class="page-tab-close" data-diagram-close="${id}" title="${escapeHtml(this.app.t('tabs.closeDiagram'))}" aria-label="${escapeHtml(this.app.t('tabs.closeDiagram'))}">${icon('close')}</button></div>`;
    }).join('')}</div><button class="page-tab-add" data-diagram-add title="${escapeHtml(this.app.t('action.addDiagram'))}" aria-label="${escapeHtml(this.app.t('action.addDiagram'))}">${icon('plus')}</button>`;
  }

  renameDiagramInline(tabElement) {
    const id = tabElement.dataset.diagram ?? tabElement.dataset.diagramTab;
    const label = tabElement.querySelector('.tab-name') ?? tabElement.querySelector('span');
    const input = document.createElement('input');
    input.className = 'page-tab-input';
    input.value = label.textContent;
    label.replaceWith(input);
    input.focus();
    input.select();
    const done = (save) => { if (save && input.value.trim() && input.value.trim() !== label.textContent) this.app.renameElement(id, input.value.trim()); else if (input.isConnected) input.replaceWith(label); };
    input.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') done(true); if (e.key === 'Escape') done(false); });
    input.addEventListener('blur', () => done(true), { once: true });
  }
}

function distToPolyline(p, pts) {
  let best = Infinity;
  for (let i = 1; i < pts.length; i += 1) {
    const a = pts[i - 1]; const b = pts[i];
    const dx = b.x - a.x; const dy = b.y - a.y;
    const l = dx * dx + dy * dy;
    const t = l ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l)) : 0;
    best = Math.min(best, Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t)));
  }
  return best;
}

function boundsOfPoints(points) {
  const xs = points.map((p) => p.x); const ys = points.map((p) => p.y);
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs) || 1, h: Math.max(...ys) - Math.min(...ys) || 1 };
}

export { layoutDiagram as layoutRender };

/** Relative luminance (0 dark … 1 light) of a #rgb / #rrggbb colour; null when it is not one. */
function luminance(color) {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(color ?? '').trim());
  if (!m) return null;
  const hex = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
