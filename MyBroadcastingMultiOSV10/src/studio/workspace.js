// The centre of the window: the preview (and in studio mode the program beside it, with the Transition
// button, the quick transitions and the T-bar between them) or the multiview. On the edited scene's
// display the items can be picked and changed with the pointer:
//   click: select (Ctrl: add / remove) · drag: move (snaps to edges, centre, other items; Ctrl: no snap)
//   handles: resize (corners keep the ratio; Shift: free) · Alt + handle: crop · round handle: rotate
//   (Shift: 15° steps) · double-click: properties · right-click: the item's menu.
import { TRANSITION_TYPES } from '../bc/catalog.js';
import * as M from '../bc/model.js';
import * as T from '../bc/transform.js';
import { icon } from '../icons.js';
import { t } from '../i18n.js';
import { escapeHtml as esc } from '../ui/dom.js';

const HANDLES = ['top-left', 'top', 'top-right', 'right', 'bottom-right', 'bottom', 'bottom-left', 'left'];
const HANDLE_AT = { 'top-left': [0, 0], top: [0.5, 0], 'top-right': [1, 0], right: [1, 0.5], 'bottom-right': [1, 1], bottom: [0.5, 1], 'bottom-left': [0, 1], left: [0, 0.5] };
const CURSORS = { 'top-left': 'nwse-resize', 'bottom-right': 'nwse-resize', 'top-right': 'nesw-resize', 'bottom-left': 'nesw-resize', top: 'ns-resize', bottom: 'ns-resize', left: 'ew-resize', right: 'ew-resize' };

export class Workspace {
  constructor(host, studio, app) {
    this.host = host;
    this.studio = studio;
    this.app = app; // { settings(), contextMenu(event, kind, payload), openProperties(sourceId), notify() }
    this.mode = null;
    this.guides = [];
    this.hover = null;
    this.drag = null;
    this.interacting = null; // item id whose browser page gets the pointer and keys
    this.resize = new ResizeObserver(() => this.layout());
    this.raf = 0;
  }

  get settings() { return this.app.settings(); }
  get engine() { return this.studio.engine; }

  /** Builds the panes for the current mode ('single' | 'studio' | 'multiview'). */
  render() {
    const mode = this.settings.multiview ? 'multiview' : this.studio.studioMode ? 'studio' : 'single';
    if (mode === this.mode && this.host.firstChild) { this.renderStudioBar(); this.updateEmptyHint(); return; }
    this.mode = mode;
    this.resize.disconnect();
    for (const name of ['main', 'program', 'multiview']) this.engine?.removeDisplay(name);
    const pane = (id, label, cls) => `<div class="ws-pane ${cls}" data-pane="${id}">
        <div class="ws-pane-head">${icon(id === 'program' ? 'program' : 'preview')}<span>${esc(label)}</span><span class="grow"></span><span class="ws-pane-scene" data-pane-scene="${id}"></span></div>
        <div class="ws-stage" data-stage="${id}"><canvas class="ws-display" data-display="${id}"></canvas><canvas class="ws-overlay" data-overlay="${id}"></canvas></div></div>`;
    if (mode === 'multiview') this.host.innerHTML = `<div class="ws-panes single">${pane('multiview', t('studio.multiview'), 'multiview')}</div>`;
    else if (mode === 'studio') this.host.innerHTML = `<div class="ws-panes studio">${pane('main', t('studio.preview'), 'preview')}<div class="ws-studio-bar" data-studio-bar></div>${pane('program', t('studio.program'), 'program')}</div>`;
    else this.host.innerHTML = `<div class="ws-panes single">${pane('main', this.settings.previewEnabled === false ? t('studio.previewDisabled') : t('studio.preview'), 'preview')}</div>`;
    for (const stage of this.host.querySelectorAll('[data-stage]')) {
      const id = stage.dataset.stage;
      const canvas = stage.querySelector('[data-display]');
      const which = id === 'multiview' ? 'multiview' : id === 'program' ? 'program' : 'preview';
      this.engine.addDisplay(id, canvas, which, { labels: { preview: t('studio.preview'), program: t('studio.program') }, paused: this.settings.previewEnabled === false && id === 'main' });
      this.resize.observe(stage);
    }
    this.bindPointer();
    this.layout();
    this.renderStudioBar();
    this.updateEmptyHint();
    cancelAnimationFrame(this.raf);
    const loop = () => { this.drawOverlay(); this.raf = requestAnimationFrame(loop); };
    this.raf = requestAnimationFrame(loop);
  }

  /** Over the preview: when the edited scene shows nothing, say so and offer the usual first sources. */
  updateEmptyHint() {
    const stage = this.host.querySelector('[data-stage="main"]');
    if (!stage) return;
    const c = this.studio.c;
    const empty = !M.showsPicture(c, this.studio.editScene.id);
    let hint = stage.querySelector('.ws-empty');
    if (!empty) { hint?.remove(); return; }
    if (hint) return;
    hint = document.createElement('div');
    hint.className = 'ws-empty';
    const add = (type, glyph, key) => `<button type="button" class="button" data-add-source="${type}">${icon(glyph)}<span>${esc(t(key))}</span></button>`;
    hint.innerHTML = `<div class="ws-empty-box">${icon('info', 'icon big')}<b>${esc(t('empty.title'))}</b><p>${esc(t('empty.text'))}</p>
      <div class="ws-empty-actions">${add('monitor_capture', 'srcDisplay', 'src.monitor_capture')}${add('dshow_input', 'srcCamera', 'src.dshow_input')}${add('image_source', 'srcImage', 'src.image_source')}${add('text_gdiplus', 'srcText', 'src.text_gdiplus')}
      <button type="button" class="button" data-command="addSourceMenu">${icon('plus')}<span>${esc(t('action.addSource'))}</span></button>
      <button type="button" class="button" data-start="sample" data-value="talk">${icon('samples')}<span>${esc(t('empty.sample'))}</span></button></div></div>`;
    stage.append(hint);
  }

  renderStudioBar() {
    const bar = this.host.querySelector('[data-studio-bar]');
    for (const el of this.host.querySelectorAll('[data-pane-scene]')) {
      const id = el.dataset.paneScene;
      const scene = M.sceneById(this.studio.c, id === 'program' || (id === 'main' && !this.studio.studioMode) ? this.studio.c.current : this.studio.c.preview);
      el.textContent = scene?.name ?? '';
    }
    if (!bar) return;
    const c = this.studio.c;
    const quick = c.quick.map((q) => { const tr = M.transitionById(c, q.transition); return `<button class="small-button" data-quick="${esc(q.id)}" title="${esc(t('studio.quickTip', { name: tr?.name ?? '', ms: q.duration }))}">${icon(TRANSITION_TYPES[tr?.type]?.icon ?? 'trCut')}<span>${esc(tr?.name ?? '?')} ${q.duration}ms</span></button>`; }).join('');
    const p = this.engine.transition?.manual ? this.engine.transition.p : 0;
    bar.innerHTML = `<button class="button primary studio-go" data-command="studioTransition" title="${esc(t('tip.studioTransition'))}">${icon('transitionGo')}<span>${esc(t('studio.transition'))}</span></button>
      <div class="studio-quick">${quick}<button class="icon-button" data-command="addQuick" title="${esc(t('studio.addQuick'))}" aria-label="${esc(t('studio.addQuick'))}">${icon('plus')}</button></div>
      <label class="studio-tbar" title="${esc(t('studio.tbar'))}">${icon('tbar')}<input type="range" min="0" max="1000" step="1" value="${Math.round(p * 1000)}" data-tbar orient="vertical" aria-label="${esc(t('studio.tbar'))}" /></label>`;
  }

  /** Canvas pixels follow the stage size (sharp on high-DPI screens). */
  layout() {
    const dpr = globalThis.devicePixelRatio || 1;
    for (const stage of this.host.querySelectorAll('[data-stage]')) {
      const r = stage.getBoundingClientRect();
      const w = Math.max(1, Math.round(r.width * dpr));
      const h = Math.max(1, Math.round(r.height * dpr));
      for (const c of stage.querySelectorAll('canvas')) { if (c.width !== w || c.height !== h) { c.width = w; c.height = h; } }
    }
  }

  destroy() { cancelAnimationFrame(this.raf); this.resize.disconnect(); for (const n of ['main', 'program', 'multiview']) this.engine?.removeDisplay(n); this.host.innerHTML = ''; this.mode = null; }

  // ───────────────────────── canvas ↔ screen

  display(id = 'main') { return this.engine.displays.get(id); }
  toCanvas(event, id = 'main') {
    const d = this.display(id);
    const stage = this.host.querySelector(`[data-stage="${id}"]`);
    if (!d?.rect || !stage) return null;
    const r = stage.getBoundingClientRect();
    const dpr = globalThis.devicePixelRatio || 1;
    return { x: ((event.clientX - r.left) * dpr - d.rect.x) / d.rect.scale, y: ((event.clientY - r.top) * dpr - d.rect.y) / d.rect.scale };
  }
  toScreen(p, id = 'main') { const d = this.display(id); return { x: d.rect.x + p.x * d.rect.scale, y: d.rect.y + p.y * d.rect.scale }; }

  geometry() { return this.engine.itemGeometry(this.studio.editScene.id); }
  /** The top-most selectable item under a canvas point. */
  pick(p) {
    const scene = this.studio.editScene;
    const geo = this.geometry();
    const items = M.allItems(scene);
    for (let i = geo.length - 1; i >= 0; i--) {
      const g = geo[i];
      const item = items.find((x) => x.id === g.id);
      if (!item?.visible || item.locked || g.group || !g.corners.length) continue;
      const parent = g.parent ? items.find((x) => x.id === g.parent) : null;
      if (parent && (!parent.visible || parent.locked)) continue;
      if (T.hitTest(item.transform, g.w, g.h, p.x, p.y, g.parentMatrix)) return parent && !this.selectingInGroup ? parent : item;
    }
    return null;
  }

  // ───────────────────────── pointer

  bindPointer() {
    const page = (type) => (e) => { if (this.interacting) this.interactPointer(e, type); };
    const overlay = this.host.querySelector('[data-overlay="main"]');
    const mv = this.host.querySelector('[data-overlay="multiview"]');
    if (mv) {
      mv.addEventListener('click', (e) => this.multiviewClick(e, false));
      mv.addEventListener('dblclick', (e) => this.multiviewClick(e, true));
      return;
    }
    if (!overlay) return;
    overlay.addEventListener('pointerdown', (e) => this.pointerDown(e));
    overlay.addEventListener('pointermove', (e) => (this.interacting ? page('mouseMoved')(e) : this.pointerMove(e)));
    overlay.addEventListener('pointerup', (e) => (this.interacting ? page('mouseReleased')(e) : this.pointerUp(e)));
    overlay.addEventListener('wheel', (e) => { if (!this.interacting) return; e.preventDefault(); const p = this.toCanvas(e); const at = p && this.pagePoint(p); if (at) this.runtimeOfInteract()?.interact('Input.dispatchMouseEvent', { type: 'mouseWheel', x: at.x, y: at.y, deltaX: e.deltaX, deltaY: e.deltaY }); }, { passive: false });
    overlay.addEventListener('pointercancel', (e) => this.pointerUp(e));
    overlay.addEventListener('dblclick', (e) => { const p = this.toCanvas(e); const item = p && this.pick(p); if (item) this.app.openProperties(item.source); });
    overlay.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const p = this.toCanvas(e);
      const item = p && this.pick(p);
      if (item && !this.studio.selection.items.has(item.id)) this.studio.select([item.id]);
      this.app.contextMenu(e, item ? 'item' : 'preview', { id: item?.id });
    });
    const program = this.host.querySelector('[data-overlay="program"]');
    program?.addEventListener('contextmenu', (e) => { e.preventDefault(); this.app.contextMenu(e, 'program', {}); });
  }

  /** A handle under the point (screen pixels), for a selected item: 'rotate' or a side / corner. */
  handleAt(event) {
    const stage = this.host.querySelector('[data-stage="main"]');
    const r = stage.getBoundingClientRect();
    const dpr = globalThis.devicePixelRatio || 1;
    const x = (event.clientX - r.left) * dpr; const y = (event.clientY - r.top) * dpr;
    const geo = this.geometry();
    const size = 7 * dpr;
    for (const g of geo) {
      if (!this.studio.selection.items.has(g.id) || !g.corners.length) continue;
      const item = M.findItem(this.studio.editScene, g.id)?.item;
      if (!item || item.locked) continue;
      const pts = this.handlePoints(g);
      if (Math.hypot(pts.rotate.x - x, pts.rotate.y - y) < size * 1.6) return { id: g.id, handle: 'rotate' };
      for (const h of HANDLES) if (Math.abs(pts[h].x - x) < size && Math.abs(pts[h].y - y) < size) return { id: g.id, handle: h };
    }
    return null;
  }

  handlePoints(g) {
    const c = g.corners.map((p) => this.toScreen(p));
    const lerp = (a, b, k) => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });
    const at = ([u, v]) => lerp(lerp(c[0], c[1], u), lerp(c[3], c[2], u), v);
    const out = Object.fromEntries(HANDLES.map((h) => [h, at(HANDLE_AT[h])]));
    const top = out.top; const centre = at([0.5, 0.5]);
    const len = Math.hypot(top.x - centre.x, top.y - centre.y) || 1;
    const dpr = globalThis.devicePixelRatio || 1;
    out.rotate = { x: top.x + ((top.x - centre.x) / len) * 22 * dpr, y: top.y + ((top.y - centre.y) / len) * 22 * dpr };
    out.centre = centre;
    return out;
  }

  /** Interact: a canvas point → the page's pixel in the item (null outside it). */
  pagePoint(p) {
    const g = this.geometry().find((x) => x.id === this.interacting);
    if (!g?.corners?.length) return null;
    const [c0, c1, , c3] = g.corners;
    const ux = c1.x - c0.x; const uy = c1.y - c0.y; const vx = c3.x - c0.x; const vy = c3.y - c0.y;
    const det = ux * vy - uy * vx;
    if (!det) return null;
    const dx = p.x - c0.x; const dy = p.y - c0.y;
    const a = (dx * vy - dy * vx) / det; const b = (ux * dy - uy * dx) / det;
    if (a < 0 || a > 1 || b < 0 || b > 1) return null;
    const item = M.findItem(this.studio.editScene, this.interacting)?.item;
    const s = this.studio.c.sources[item?.source]?.settings ?? {};
    return { x: Math.round(a * (s.width || g.w)), y: Math.round(b * (s.height || g.h)) };
  }
  runtimeOfInteract() { const item = M.findItem(this.studio.editScene, this.interacting)?.item; return item ? this.engine.runtime(item.source) : null; }
  /** Starts (an item id of a browser source) or ends (null) interacting. Returns whether it started. */
  setInteract(itemId) {
    this.interacting = itemId;
    if (!itemId) { this.app.notify?.('info', t('interact.ended')); return false; }
    const rt = this.runtimeOfInteract();
    if (!rt?.interact || !rt.realPage) { this.interacting = null; this.app.notify?.('warning', t('interact.unavailable')); return false; }
    this.app.notify?.('info', t('interact.started'));
    return true;
  }
  /** Pointer and wheel to the page (DevTools mouse events); outside the item ends interacting. */
  interactPointer(e, type) {
    const p = this.toCanvas(e);
    const at = p && this.pagePoint(p);
    if (!at) { if (type === 'mousePressed') this.setInteract(null); return; }
    const button = type === 'mouseMoved' ? (e.buttons & 1 ? 'left' : 'none') : ['left', 'middle', 'right'][e.button] ?? 'left';
    this.runtimeOfInteract()?.interact('Input.dispatchMouseEvent', { type, x: at.x, y: at.y, button, buttons: e.buttons, clickCount: type === 'mouseMoved' ? 0 : 1 });
  }
  /** A key to the page: true when it was taken (Esc ends interacting). */
  interactKey(e, down) {
    if (!this.interacting) return false;
    if (e.key === 'Escape') { if (down) this.setInteract(null); return true; }
    const rt = this.runtimeOfInteract();
    if (!rt) { this.interacting = null; return false; }
    const text = down && e.key.length === 1 ? e.key : undefined;
    rt.interact('Input.dispatchKeyEvent', { type: down ? (text ? 'keyDown' : 'rawKeyDown') : 'keyUp', key: e.key, code: e.code, text, windowsVirtualKeyCode: e.keyCode, nativeVirtualKeyCode: e.keyCode });
    return true;
  }

  pointerDown(e) {
    if (this.interacting) { if (e.button === 0) this.interactPointer(e, 'mousePressed'); return; }
    if (e.button !== 0) return;
    this.studio.startAudio();
    if (this.settings.previewLocked) { this.app.notify('info', t('notice.previewLocked')); return; }
    const p = this.toCanvas(e);
    if (!p) return;
    const overlay = e.currentTarget;
    const handle = this.handleAt(e);
    const scene = this.studio.editScene;
    let ids;
    if (handle) ids = [handle.id];
    else {
      const item = this.pick(p);
      if (!item) { if (!e.ctrlKey && !e.metaKey) this.studio.select([]); this.drag = { kind: 'marquee', start: p, now: p }; overlay.setPointerCapture?.(e.pointerId); return; }
      if (e.ctrlKey || e.metaKey) {
        const next = new Set(this.studio.selection.items);
        if (next.has(item.id)) next.delete(item.id); else next.add(item.id);
        this.studio.select([...next]);
        return;
      }
      if (!this.studio.selection.items.has(item.id)) this.studio.select([item.id]);
      ids = [...this.studio.selection.items];
    }
    const items = ids.map((id) => M.findItem(scene, id)?.item).filter((it) => it && !it.locked);
    if (!items.length) return;
    const geo = this.geometry();
    this.drag = {
      kind: handle ? (handle.handle === 'rotate' ? 'rotate' : e.altKey ? 'crop' : 'resize') : 'move',
      handle: handle?.handle, start: p, moved: false,
      items: items.map((it) => { const g = geo.find((x) => x.id === it.id) ?? {}; return { item: it, start: JSON.parse(JSON.stringify(it.transform)), w: g.w || this.studio.sizeOf(it)[0], h: g.h || this.studio.sizeOf(it)[1], parentMatrix: g.parentMatrix ?? null }; }),
    };
    if (this.drag.kind === 'rotate') { const it = this.drag.items[0]; const centre = T.boundsOf(T.corners(it.start, it.w, it.h, it.parentMatrix)); this.drag.centre = { x: centre.x + centre.w / 2, y: centre.y + centre.h / 2 }; this.drag.angle0 = Math.atan2(p.y - this.drag.centre.y, p.x - this.drag.centre.x); }
    this.studio.beginGesture({ move: 'moveItem', resize: 'resizeItem', crop: 'cropItem', rotate: 'rotateItem' }[this.drag.kind]);
    overlay.setPointerCapture?.(e.pointerId);
  }

  pointerMove(e) {
    const overlay = e.currentTarget;
    const p = this.toCanvas(e);
    if (!p) return;
    const d = this.drag;
    if (!d) {
      const h = this.handleAt(e);
      overlay.style.cursor = h ? (h.handle === 'rotate' ? 'grab' : CURSORS[h.handle]) : this.pick(p) ? 'move' : 'default';
      this.hover = this.pick(p)?.id ?? null;
      return;
    }
    if (d.kind === 'marquee') { d.now = p; return; }
    const dx = p.x - d.start.x; const dy = p.y - d.start.y;
    if (!d.moved && Math.hypot(dx, dy) * (this.display()?.rect?.scale ?? 1) < 2) return;
    d.moved = true;
    const { baseW: W, baseH: H } = this.engine.video;
    this.guides = [];
    if (d.kind === 'move') {
      let ox = dx; let oy = dy;
      const snap = this.settings.snap ?? {};
      if (snap.enabled !== false && !(e.ctrlKey || e.metaKey) && d.items.length) {
        const moving = new Set(d.items.map((x) => x.item.id));
        const union = T.boundsOf(d.items.flatMap((x) => T.corners({ ...x.start, x: x.start.x + dx, y: x.start.y + dy }, x.w, x.h, x.parentMatrix)));
        const others = snap.sources === false ? [] : this.geometry().filter((g) => !moving.has(g.id) && g.corners.length && !g.group).map((g) => T.boundsOf(g.corners));
        const s = T.snap(union, W, H, others, { distance: (snap.distance ?? 10) / (this.display()?.rect?.scale ?? 1) * (globalThis.devicePixelRatio || 1), edges: snap.edges !== false, center: snap.center !== false, items: snap.sources !== false });
        ox += s.dx; oy += s.dy; this.guides = s.guides;
      }
      for (const x of d.items) {
        const k = x.parentMatrix ? Math.hypot(x.parentMatrix[0], x.parentMatrix[1]) || 1 : 1;
        x.item.transform = { ...x.start, x: x.start.x + ox / k, y: x.start.y + oy / k };
      }
    } else if (d.kind === 'resize' || d.kind === 'crop') {
      const x = d.items[0];
      const box = T.itemBox(x.start, x.w, x.h);
      let m = T.itemMatrix(x.start, box);
      if (x.parentMatrix) m = T.multiply(x.parentMatrix, m);
      const local = T.apply(T.invert(m), p.x, p.y);
      x.item.transform = d.kind === 'crop' ? T.cropByHandle(x.start, x.w, x.h, d.handle, local, box) : T.resizeByHandle(x.start, x.w, x.h, d.handle, local, { keepAspect: !e.shiftKey, startBox: box });
    } else if (d.kind === 'rotate') {
      const x = d.items[0];
      const a = Math.atan2(p.y - d.centre.y, p.x - d.centre.x);
      let rot = x.start.rot + ((a - d.angle0) * 180) / Math.PI;
      if (e.shiftKey) rot = Math.round(rot / 15) * 15;
      rot = ((rot % 360) + 360) % 360;
      // Turn about the box centre: move the position so the centre stays.
      const before = T.boundsOf(T.corners(x.start, x.w, x.h));
      const next = { ...x.start, rot };
      const after = T.boundsOf(T.corners(next, x.w, x.h));
      x.item.transform = { ...next, x: next.x + (before.x + before.w / 2) - (after.x + after.w / 2), y: next.y + (before.y + before.h / 2) - (after.y + after.h / 2) };
    }
    this.app.transformLive?.();
  }

  pointerUp(e) {
    const d = this.drag;
    this.drag = null;
    this.guides = [];
    if (!d) return;
    if (d.kind === 'marquee') {
      const r = { x: Math.min(d.start.x, d.now.x), y: Math.min(d.start.y, d.now.y), w: Math.abs(d.now.x - d.start.x), h: Math.abs(d.now.y - d.start.y) };
      if (r.w > 4 && r.h > 4) {
        const ids = this.geometry().filter((g) => g.corners.length && !g.group && !g.parent).filter((g) => { const b = T.boundsOf(g.corners); return b.x >= r.x && b.y >= r.y && b.x + b.w <= r.x + r.w && b.y + b.h <= r.y + r.h; }).map((g) => g.id);
        this.studio.select(ids, { add: e.ctrlKey || e.metaKey });
      }
      return;
    }
    this.studio.endGesture();
  }

  multiviewClick(e, double) {
    const d = this.display('multiview');
    const stage = this.host.querySelector('[data-stage="multiview"]');
    if (!d?.tiles || !stage) return;
    const r = stage.getBoundingClientRect();
    const dpr = globalThis.devicePixelRatio || 1;
    const x = (e.clientX - r.left) * dpr; const y = (e.clientY - r.top) * dpr;
    const tile = d.tiles.find((tl) => tl.scene && x >= tl.x && y >= tl.y && x <= tl.x + tl.w && y <= tl.y + tl.h);
    if (!tile) return;
    if (this.studio.studioMode) { this.studio.selectScene(tile.scene); if (double || this.settings.multiviewClickTransition) this.studio.studioTransition(); }
    else this.studio.selectScene(tile.scene);
  }

  // ───────────────────────── overlay

  drawOverlay() {
    const cv = this.host.querySelector('[data-overlay="main"]');
    if (!cv) return;
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, cv.width, cv.height);
    const d = this.display();
    if (!d?.rect) return;
    const dpr = globalThis.devicePixelRatio || 1;
    const s = this.settings;
    const sel = s.selectionColor ?? '#ff3b3b';
    // Safe areas (action safe 93 %, title safe 90 %, 4:3 centre).
    if (s.safeAreas) {
      const { baseW: W, baseH: H } = this.engine.video;
      ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = dpr; ctx.setLineDash([6 * dpr, 4 * dpr]);
      for (const k of [0.035, 0.05]) { const a = this.toScreen({ x: W * k, y: H * k }); const b = this.toScreen({ x: W * (1 - k), y: H * (1 - k) }); ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y); }
      const w43 = (H * 4) / 3; const a = this.toScreen({ x: (W - w43) / 2, y: 0 }); const b = this.toScreen({ x: (W + w43) / 2, y: H });
      ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
      ctx.setLineDash([]);
    }
    const geo = this.geometry();
    const path = (pts) => { ctx.beginPath(); pts.forEach((pt, i) => { const q = this.toScreen(pt); if (i) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y); }); ctx.closePath(); };
    for (const g of geo) {
      if (!g.corners.length) continue;
      const selected = this.studio.selection.items.has(g.id);
      if (g.id === this.interacting) { path(g.corners); ctx.strokeStyle = '#22c55e'; ctx.lineWidth = 3 * dpr; ctx.setLineDash([]); ctx.stroke(); continue; }
      if (!selected && g.id !== this.hover) continue;
      path(g.corners);
      ctx.strokeStyle = selected ? sel : 'rgba(255,255,255,0.7)';
      ctx.lineWidth = (selected ? 2 : 1) * dpr;
      ctx.stroke();
      const item = M.findItem(this.studio.editScene, g.id)?.item;
      if (!selected || item?.locked || g.group) continue;
      const pts = this.handlePoints(g);
      ctx.fillStyle = sel;
      for (const h of HANDLES) { const q = pts[h]; ctx.fillRect(q.x - 4 * dpr, q.y - 4 * dpr, 8 * dpr, 8 * dpr); }
      ctx.beginPath(); ctx.moveTo(pts.top.x, pts.top.y); ctx.lineTo(pts.rotate.x, pts.rotate.y); ctx.stroke();
      ctx.beginPath(); ctx.arc(pts.rotate.x, pts.rotate.y, 5 * dpr, 0, Math.PI * 2); ctx.fill();
    }
    // Snapping guides.
    ctx.strokeStyle = '#ffd400'; ctx.lineWidth = dpr;
    for (const gd of this.guides) {
      const { baseW: W, baseH: H } = this.engine.video;
      const a = this.toScreen(gd.axis === 'x' ? { x: gd.at, y: 0 } : { x: 0, y: gd.at });
      const b = this.toScreen(gd.axis === 'x' ? { x: gd.at, y: H } : { x: W, y: gd.at });
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    if (this.drag?.kind === 'marquee') {
      const a = this.toScreen(this.drag.start); const b = this.toScreen(this.drag.now);
      ctx.strokeStyle = sel; ctx.setLineDash([4 * dpr, 3 * dpr]); ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y); ctx.setLineDash([]);
    }
    // The T-bar follows a transition that runs on its own.
    const tbar = this.host.querySelector('[data-tbar]');
    if (tbar && document.activeElement !== tbar) tbar.value = String(Math.round((this.engine.transition?.manual ? this.engine.transition.p : 0) * 1000));
  }
}
