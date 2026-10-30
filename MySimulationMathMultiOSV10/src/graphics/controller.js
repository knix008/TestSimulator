// The figure area's state and its side of the engine protocol
// (core/graphics/PROTOCOL.md), without React: the GUI copy of the figure
// tree, per-axes view state (2D zoom / pan, 3D camera, lights), the
// interaction mode per figure, and the answers to the engine's blocking
// requests. FigureArea.jsx renders it; tests drive it with a fake engine.
//
//   const ctl = new FigureController(engine, deps); const detach = ctl.attach();
//   ctl.subscribe(() => rerender());
//
// deps (injected so the module stays DOM-free):
//   exportFigure(fig, req, paintOpts) → { bytes, mime, ext }   frame(fig, opts) → { width, height, rgba }
//   ask(opts) → Promise   chooseFile(opts) → Promise<path|null>   copyImage(bytes) → Promise
//   showFigures()   toBase64(bytes) → string   lang() → 'ko' | 'en'
import { emptyScene, reduceScene, axesOf, findNode, isAxes, applyToggles, anyShown, lightsOf } from './scene.js';
import { normalizeExport, orientedFigure } from './exportopts.js';

const DEFAULT_3D = [-37.5, 30];
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const is2dView = (v) => Array.isArray(v) && v[0] === 0 && v[1] === 90;

export class FigureController {
  constructor(engine, deps = {}) {
    this.engine = engine;
    this.deps = deps;
    this.scene = emptyScene();
    this.version = 0;
    this.active = null;
    this.modes = new Map();       // figId → 'none' | 'zoom' | 'pan' | 'rotate' | 'datacursor'
    this.grid = false;
    this.rulers = false;
    this.axesLines = true;        // 3D coordinate axes (X / Y / Z lines, tip labels, triad)
    this.edges = true;            // edge lines of filled surfaces / patches / bars (off = faces only)
    this.toggles = new Map();     // figId → { legend, colorbar } (null = as the engine sent)
    this.views2d = new Map();     // axId → { XLim, YLim } (GUI zoom / pan)
    this.home = new Map();        // axId → { XLim, YLim, XLimMode, YLimMode, View }
    this.posted = new Map();      // axId → last { XLim, YLim, View } the GUI sent
    this.last3d = new Map();      // axId → last 3D [az el] (for the 2D / 3D toggle)
    this.views3d = new Map();     // axId → Axes3DView of the shown figure
    this.state3d = new Map();     // axId → { zoomF, target } saved when a view is dropped
    this.selAxes = new Map();     // figId → axId
    this.tips = new Map();        // figId → [{ axId, point, label, is3d }]
    this.sizes = new Map();       // figId → { w, h } last reported
    this.layouts = new Map();     // figId → last painted layout
    this.ginput = null;           // { figId, n, points, resolve }
    this.uiwait = null;           // { figId, resolve, timer }
    this.dialog = null;           // { kind, ..., resolve }
    this.exportDlg = null;        // { picking: null | 'axes' | 'region' } while the export dialog is open
    this.exportRect = null;       // the region drawn for export (figure px)
    this.exportNotes = [];
    this.listeners = new Set();
    this.timers = new Map();
  }

  // ------------------------------------------------------------ plumbing

  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { this.version += 1; for (const fn of [...this.listeners]) { try { fn(this.version); } catch (e) { console.error(e); } } }
  post(msg) { if (this.engine) this.engine.post(msg); }
  set(handle, props) { if (handle == null || handle < 0) return; this.post({ type: 'graphics.set', handle, props }); }

  attach() {
    const e = this.engine;
    const offs = [
      e.on('graphics.scene', (m) => this.onMessage(m)),
      e.on('graphics.update', (m) => this.onMessage(m)),
      e.on('graphics.close', (m) => this.onMessage(m)),
      e.on('graphics.mode', (m) => this.onMessage(m)),
      e.on('graphics.dialog', (m) => this.onMessage(m)),
      e.on('graphics.uiresume', (m) => this.onMessage(m)),
      e.on('ready', () => { this.reset(); this.post({ type: 'graphics.sync' }); }),
      e.on('request.done', (m) => { if (m && m.interrupted) this.cancelPending(); }),
      e.onRequest('graphics.export', (m) => this.onExport(m)),
      e.onRequest('graphics.getframe', (m) => this.onGetframe(m)),
      e.onRequest('graphics.dialog', (m) => this.onDialog(m)),
      e.onRequest('graphics.ginput', (m) => this.onGinput(m)),
      e.onRequest('graphics.uiwait', (m) => this.onUiwait(m)),
    ];
    this.post({ type: 'graphics.sync' });
    return () => { offs.forEach((off) => off && off()); this.disposeViews(); };
  }

  /** The engine restarted: nothing of the old session is left. */
  reset() {
    if (!this.scene.figures.size) return;
    this.scene = emptyScene();
    this.active = null;
    this.views2d.clear(); this.home.clear(); this.posted.clear(); this.tips.clear(); this.layouts.clear();
    this.disposeViews();
    this.emit();
  }

  cancelPending() {
    if (this.ginput) { this.ginput = null; }
    if (this.uiwait) { clearTimeout(this.uiwait.timer); this.uiwait = null; }
    if (this.dialog) { this.dialog = null; }
    this.emit();
  }

  // ------------------------------------------------------------ engine → GUI

  onMessage(msg) {
    if (!msg) return;
    switch (msg.type) {
      case 'graphics.scene': case 'graphics.update': case 'graphics.close': {
        const r = reduceScene(this.scene, msg);
        if (r.state === this.scene) return;
        this.scene = r.state;
        for (const id of r.limitsChanged) {
          const ax = this.axesById(id);
          const sent = this.posted.get(id);
          if (ax && sent && same(sent.XLim, ax.props.XLim) && same(sent.YLim, ax.props.YLim) && (sent.View == null || same(sent.View, ax.props.View))) continue; // our own change
          this.views2d.delete(id);
          if (ax) this.home.set(id, homeOf(ax));
        }
        for (const id of r.changed) {
          const fig = this.scene.figures.get(id);
          for (const ax of axesOf(fig)) {
            if (!this.home.has(ax.id)) this.home.set(ax.id, homeOf(ax));
            if (ax.props.Is3D && !is2dView(ax.props.View)) this.last3d.set(ax.id, ax.props.View.slice());
          }
          const tg = this.toggles.get(id);
          if (tg) applyToggles(fig, tg);
        }
        for (const id of r.closed) { this.tips.delete(id); this.modes.delete(id); this.toggles.delete(id); this.layouts.delete(id); this.sizes.delete(id); if (this.uiwait && this.uiwait.figId === id) this.finishUiwait(); }
        if (r.activate != null) this.active = r.activate;
        if (this.active == null || !this.scene.figures.has(this.active)) this.active = this.visibleOrder().slice(-1)[0] ?? null;
        this.dropStaleViews();
        this.emit();
        return;
      }
      case 'graphics.mode':
        if (this.scene.figures.has(msg.figure)) { this.modes.set(msg.figure, msg.mode || 'none'); this.emit(); }
        return;
      case 'graphics.dialog': {
        const ask = this.deps.ask;
        if (!ask) return;
        const L = this.deps.lang ? this.deps.lang() : 'ko';
        const title = msg.title || ({ errordlg: L === 'en' ? 'Error' : '오류', warndlg: L === 'en' ? 'Warning' : '경고', helpdlg: L === 'en' ? 'Help' : '도움말' }[msg.kind] || (L === 'en' ? 'Message' : '메시지'));
        if (msg.kind === 'errordlg') ask({ kind: 'error', title, body: msg.message });
        else ask({ title, body: msg.message, icon: msg.kind === 'warndlg' ? 'alert' : msg.kind === 'helpdlg' ? 'info' : 'info', buttons: [{ id: 'ok', label: L === 'en' ? 'OK' : '확인', icon: 'check', primary: true }] });
        return;
      }
      case 'graphics.uiresume': this.finishUiwait(); return;
      default:
    }
  }

  visibleOrder() { return this.scene.order.filter((id) => { const f = this.scene.figures.get(id); return f && f.props.Visible !== false; }); }
  figure(id = this.active) { return id == null ? null : this.scene.figures.get(id) || null; }
  axesById(id) { for (const f of this.scene.figures.values()) { const n = findNode(f, id); if (n && isAxes(n)) return n; } return null; }
  figureOfAxes(id) { for (const f of this.scene.figures.values()) if (findNode(f, id)) return f; return null; }

  // ------------------------------------------------------------ figure tabs

  selectFigure(id) {
    if (!this.scene.figures.has(id)) return;
    if (this.active !== id) { this.saveViews(); this.active = id; }
    this.post({ type: 'graphics.current', id });
    this.emit();
  }

  closeFigure(id) {
    if (this.uiwait && this.uiwait.figId === id) this.finishUiwait();
    if (this.ginput && this.ginput.figId === id) this.finishGinput();
    const ready = !this.engine || !this.engine.state || this.engine.state === 'ready' || this.engine.state === 'busy';
    this.post({ type: 'graphics.close', id });
    if (!ready) this.onMessage({ type: 'graphics.close', id });
  }

  mode(figId = this.active) { return this.modes.get(figId) || 'none'; }
  setMode(mode, figId = this.active) {
    if (figId == null) return;
    this.modes.set(figId, this.mode(figId) === mode ? 'none' : mode);
    this.emit();
  }

  /** The axes the toolbar acts on: the last clicked, the figure's CurrentAxes, or the first. */
  targetAxes(figId = this.active) {
    const fig = this.figure(figId);
    if (!fig) return null;
    const all = axesOf(fig);
    const sel = this.selAxes.get(figId);
    return all.find((a) => a.id === sel) || all.find((a) => a.id === fig.props.CurrentAxes) || all[0] || null;
  }

  selectAxes(ax, figId = this.active) {
    if (!ax || this.selAxes.get(figId) === ax.id) return;
    this.selAxes.set(figId, ax.id);
    this.post({ type: 'graphics.currentAxes', id: ax.id });
    this.emit();
  }

  reportSize(figId, w, h) {
    w = Math.round(w); h = Math.round(h);
    if (!(w > 0 && h > 0)) return;
    const s = this.sizes.get(figId);
    if (s && s.w === w && s.h === h) return;
    this.sizes.set(figId, { w, h });
    clearTimeout(this.timers.get(`size${figId}`));
    this.timers.set(`size${figId}`, setTimeout(() => this.post({ type: 'graphics.resize', id: figId, width: w, height: h }), 120));
  }

  // ------------------------------------------------------------ toggles

  setGrid(on) { this.grid = !!on; this.emit(); }
  setRulers(on) { this.rulers = !!on; this.emit(); }
  setAxesLines(on) { this.axesLines = !!on; this.emit(); }
  setEdges(on) { this.edges = !!on; this.emit(); }
  isShown(prop, figId = this.active) { const f = this.figure(figId); return !!f && anyShown(f, prop); }
  toggleShown(which, figId = this.active) {
    const fig = this.figure(figId);
    if (!fig) return;
    const prop = which === 'legend' ? 'Legend' : 'Colorbar';
    const on = !anyShown(fig, prop);
    const tg = { ...(this.toggles.get(figId) || { legend: null, colorbar: null }), [which]: on };
    this.toggles.set(figId, tg);
    for (const s of applyToggles(fig, { [which]: on })) this.set(s.handle, s.props);
    this.emit();
  }

  // ------------------------------------------------------------ 2D view

  limits2d(ax) { const v = this.views2d.get(ax.id); return { XLim: (v && v.XLim) || ax.props.XLim, YLim: (v && v.YLim) || ax.props.YLim }; }

  setLimits2d(ax, XLim, YLim, { commit = 'later' } = {}) {
    if (![...XLim, ...YLim].every(Number.isFinite) || !(XLim[1] > XLim[0]) || !(YLim[1] > YLim[0])) return;
    this.views2d.set(ax.id, { XLim, YLim });
    if (commit === 'now') this.commit2d(ax);
    else if (commit === 'later') { clearTimeout(this.timers.get(ax.id)); this.timers.set(ax.id, setTimeout(() => this.commit2d(ax), 300)); }
    this.emit();
  }

  commit2d(ax) {
    clearTimeout(this.timers.get(ax.id));
    const v = this.views2d.get(ax.id);
    if (!v) return;
    this.posted.set(ax.id, { XLim: v.XLim.slice(), YLim: v.YLim.slice(), View: ax.props.View });
    this.set(ax.id, { XLim: v.XLim, YLim: v.YLim });
  }

  // ------------------------------------------------------------ 3D view

  /** The rotated camera of a 3D axes becomes its View (engine and local copy). */
  commitView3d(ax, view) {
    const v = [Number(view[0].toFixed(2)), Number(view[1].toFixed(2))];
    ax.props.View = v;
    const live = this.views3d.get(ax.id);
    if (live) live.setView(v[0], v[1]); // the shown camera follows (it keeps its own angles while rotating)
    ax.props.Is3D = !is2dView(v) && ax.props.Kind !== 'polar';
    if (ax.props.Is3D) this.last3d.set(ax.id, v.slice());
    const lim = this.limits2d(ax);
    this.posted.set(ax.id, { XLim: lim.XLim, YLim: lim.YLim, View: v });
    this.set(ax.id, { View: v });
    this.emit();
  }

  /** A 3D pan moved the camera target: it goes to the engine as CameraTarget (data units). */
  commitTarget3d(ax, target) {
    if (!ax || !Array.isArray(target) || !target.every(Number.isFinite)) return;
    const t = target.map((x) => Number(x.toPrecision(8)));
    ax.props.CameraTarget = t;
    this.set(ax.id, { CameraTarget: t });
    this.emit();
  }

  /** view(2) ⇄ view(3) (the last 3D angles) for the target axes. */
  toggle2d3d(figId = this.active) {
    const ax = this.targetAxes(figId);
    if (!ax || ax.props.Kind === 'polar') return;
    const to3d = !ax.props.Is3D;
    if (!to3d) this.last3d.set(ax.id, (ax.props.View || DEFAULT_3D).slice());
    const view = to3d ? (this.last3d.get(ax.id) || DEFAULT_3D).slice() : [0, 90];
    this.views2d.delete(ax.id);
    const v3 = this.views3d.get(ax.id);
    if (v3) { v3._node = null; v3.setView(view[0], view[1]); }
    this.commitView3d(ax, view);
  }

  is3d(figId = this.active) { const ax = this.targetAxes(figId); return !!(ax && ax.props.Is3D); }

  // ------------------------------------------------------------ zoom

  /** Zoom of the target axes in % (2D: home span / shown span; 3D: camera zoom). */
  zoomPercent(figId = this.active) {
    const ax = this.targetAxes(figId);
    if (!ax) return 100;
    if (ax.props.Is3D) { const v = this.views3d.get(ax.id); const z = v ? v.zoomF : (this.state3d.get(ax.id) || {}).zoomF || 1; return Math.round(z * 100); }
    const h = this.home.get(ax.id);
    const cur = this.limits2d(ax);
    if (!h || ax.props.XScale === 'log') return 100;
    const span = (L) => L[1] - L[0];
    return Math.max(1, Math.round((span(h.XLim) / span(cur.XLim)) * 100));
  }

  /** Sets the zoom (%) of the target axes about its centre. */
  setZoomPercent(pct, figId = this.active) {
    const cur = this.zoomPercent(figId);
    if (!(pct > 0) || !(cur > 0)) return;
    this.zoomBy(pct / cur, figId);
  }

  /** Zooms the target axes by factor (> 1 = in) about the view centre. */
  zoomBy(factor, figId = this.active) {
    const ax = this.targetAxes(figId);
    if (!ax || !(factor > 0)) return;
    if (ax.props.Is3D) {
      const v = this.views3d.get(ax.id);
      if (v) v.zoom(factor);
      else { const s = this.state3d.get(ax.id) || { zoomF: 1, target: null }; s.zoomF = Math.max(0.05, Math.min(200, (s.zoomF || 1) * factor)); this.state3d.set(ax.id, s); }
      this.emit();
      return;
    }
    const { XLim, YLim } = this.limits2d(ax);
    const zl = (L, scale) => {
      if (scale === 'log') { const a = Math.log10(L[0]), b = Math.log10(L[1]), c = (a + b) / 2, h = (b - a) / 2 / factor; return [10 ** (c - h), 10 ** (c + h)]; }
      const c = (L[0] + L[1]) / 2, h = (L[1] - L[0]) / 2 / factor; return [c - h, c + h];
    };
    this.setLimits2d(ax, zl(XLim, ax.props.XScale), zl(YLim, ax.props.YScale), { commit: 'later' });
  }

  /** Fit / reset: every axes of the figure back to its home limits and camera. */
  resetView(figId = this.active) {
    const fig = this.figure(figId);
    if (!fig) return;
    for (const ax of axesOf(fig)) {
      const h = this.home.get(ax.id);
      const had = this.views2d.has(ax.id);
      this.views2d.delete(ax.id);
      const v = this.views3d.get(ax.id);
      if (v) { v.zoomF = 1; v.target.set(0, 0, 0); }
      this.state3d.delete(ax.id);
      if (!h) continue;
      const props = {};
      if (had || !same(ax.props.XLim, h.XLim) || !same(ax.props.YLim, h.YLim)) {
        ax.props.XLim = h.XLim.slice(); ax.props.YLim = h.YLim.slice();
        if (h.XLimMode === 'auto') props.XLimMode = 'auto'; else props.XLim = h.XLim;
        if (h.YLimMode === 'auto') props.YLimMode = 'auto'; else props.YLim = h.YLim;
      }
      if (h.View && !same(ax.props.View, h.View)) {
        ax.props.View = h.View.slice();
        ax.props.Is3D = !is2dView(h.View) && ax.props.Kind !== 'polar';
        if (v) { v._node = null; v.setView(h.View[0], h.View[1]); }
        props.View = h.View;
      }
      if (Object.keys(props).length) { this.posted.set(ax.id, { XLim: h.XLim, YLim: h.YLim, View: ax.props.View }); this.set(ax.id, props); }
    }
    this.tips.delete(figId);
    this.emit();
  }

  // ------------------------------------------------------------ 3D views (WebGL contexts)

  saveViews() {
    for (const [id, v] of this.views3d) this.state3d.set(id, { zoomF: v.zoomF, target: v.target.toArray(), view: v.getView() });
    this.disposeViews();
  }
  disposeViews() { for (const v of this.views3d.values()) { try { v.dispose(); } catch { /* lost already */ } } this.views3d.clear(); }
  dropStaleViews() {
    const fig = this.figure();
    const keep = new Set(fig ? axesOf(fig).filter((a) => a.props.Is3D).map((a) => a.id) : []);
    for (const [id, v] of [...this.views3d]) if (!keep.has(id)) { this.state3d.set(id, { zoomF: v.zoomF, target: v.target.toArray(), view: v.getView() }); try { v.dispose(); } catch { /* lost */ } this.views3d.delete(id); }
  }

  // ------------------------------------------------------------ lights

  // ------------------------------------------------------------ data tips

  addTip(figId, tip, add) {
    const list = add ? (this.tips.get(figId) || []).slice() : [];
    list.push(tip);
    this.tips.set(figId, list);
    this.emit();
  }
  clearTips(figId = this.active) { if (this.tips.has(figId)) { this.tips.delete(figId); this.emit(); } }

  // ------------------------------------------------------------ export dialog

  /** The export options (normalised), from the settings the first time. */
  exportOpts() {
    if (!this._export) this._export = normalizeExport(this.deps.loadExportOpts ? this.deps.loadExportOpts() || {} : {}).opts;
    return this._export;
  }
  setExportOpts(patch) {
    const { opts, notes } = normalizeExport({ ...this.exportOpts(), ...patch });
    this._export = opts;
    this.exportNotes = notes;
    if (this.deps.saveExportOpts) this.deps.saveExportOpts(opts);
    this.emit();
  }
  openExport() {
    if (!this.figure()) return;
    const o = this.exportOpts();
    if (o.target === 'region' && !this.exportRect) this._export = { ...o, target: 'figure' };
    this.exportDlg = { picking: null };
    this.emit();
  }
  closeExport() { this.exportDlg = null; this.emit(); }
  /** Hides the dialog while the user clicks an axes ('axes') or drags a region ('region') on the figure. */
  startPick(kind) { if (!this.exportDlg) return; this.exportDlg = { picking: kind }; this.emit(); }
  finishPick(rect) {
    if (!this.exportDlg) return;
    const kind = this.exportDlg.picking;
    if (kind === 'region' && rect) { this.exportRect = rect; this._export = { ...this.exportOpts(), target: 'region' }; }
    if (kind === 'axes') this._export = { ...this.exportOpts(), target: 'axes' };
    this.exportDlg = { picking: null };
    this.emit();
  }

  /** The full export request for the shown figure (encodeExport input). */
  exportRequest(over = {}) {
    const fig = this.figure();
    if (!fig) return null;
    const o = { ...this.exportOpts(), ...over };
    const size = this.sizeOf(fig);
    const target0 = o.target === 'region' && !this.exportRect ? 'figure' : o.target;
    const { figW, figH } = target0 === 'figure' ? orientedFigure(size.width, size.height, o.orientation) : { figW: size.width, figH: size.height };
    const ax = this.targetAxes();
    return {
      ...o, figW, figH, axesId: ax ? ax.id : null, rect: this.exportRect || null,
      target: o.target === 'region' && !this.exportRect ? 'figure' : o.target,
      tipList: o.tips ? this.tips.get(fig.id) || [] : [],
    };
  }

  // ------------------------------------------------------------ ui components

  callback(node, event, props, data) {
    if (props && node) Object.assign(node.props, props);
    const msg = { type: 'graphics.callback', handle: node.id, event };
    if (props) msg.props = props;
    if (data) msg.data = data;
    this.post(msg);
    this.emit();
  }

  // ------------------------------------------------------------ engine requests

  paintOptions(fig) {
    const state3d = new Map(this.state3d);
    for (const [id, v] of this.views3d) state3d.set(id, { zoomF: v.zoomF, target: v.target.toArray(), view: v.getView() });
    return { views: this.views2d, grid5: this.grid, grid3d: this.grid, axesLines: this.axesLines, edges: this.edges, state3d, lightOpts: (ax) => lightOptionsFor(ax) };
  }

  sizeOf(fig, req = {}) {
    const s = this.sizes.get(fig.id);
    const pos = fig.props.Position || [0, 0, 560, 420];
    return { width: Math.round(req.width || (s && s.w) || pos[2] || 560), height: Math.round(req.height || (s && s.h) || pos[3] || 420) };
  }

  async onExport(req) {
    const fig = this.scene.figures.get(req.figure);
    if (!fig) return { error: `Figure ${req.figure} is not shown.` };
    const { width, height } = this.sizeOf(fig, req);
    const out = await this.deps.exportFigure(fig, { ...req, format: req.clipboard ? 'png' : req.format, width, height }, this.paintOptions(fig));
    if (req.clipboard) { await this.deps.copyImage(out.bytes); return { data: '' }; }
    return { data: this.deps.toBase64(out.bytes) };
  }

  onGetframe(req) {
    const fig = this.scene.figures.get(req.figure);
    if (!fig) return { error: `Figure ${req.figure} is not shown.` };
    const { width, height } = this.sizeOf(fig);
    return this.deps.frame(fig, { ...this.paintOptions(fig), width, height, axes: req.axes ?? null });
  }

  async onDialog(req) {
    const L = this.deps.lang ? this.deps.lang() : 'ko';
    if (req.kind === 'questdlg') {
      const buttons = (req.buttons || []).map((b) => ({ id: b, label: b, primary: b === req.default }));
      const r = await this.deps.ask({ title: req.title || (L === 'en' ? 'Question' : '질문'), body: req.message, icon: 'info', buttons });
      return { answer: r && r !== 'cancel' ? String(r) : '' };
    }
    if (req.kind === 'uigetfile' || req.kind === 'uiputfile') {
      const exts = (req.filter || []).flatMap((f) => String(f).split(';')).map((f) => f.trim().replace(/^\*/, '')).filter((e) => /^\.\w+$/.test(e));
      const path = await this.deps.chooseFile({ mode: req.kind === 'uigetfile' ? 'open' : 'save', title: req.title, start: req.cwd, name: req.defaultName || '', exts });
      if (!path) return { cancelled: true };
      const p = String(path).replace(/\\/g, '/');
      const i = p.lastIndexOf('/');
      return { file: p.slice(i + 1), path: i >= 0 ? p.slice(0, i + 1) : '' };
    }
    return new Promise((resolve) => {
      this.dialog = { ...req, resolve: (v) => { this.dialog = null; this.emit(); resolve(v); } };
      if (this.deps.showFigures) this.deps.showFigures();
      this.emit();
    });
  }

  onGinput(req) {
    if (!this.scene.figures.has(req.figure)) return { points: [] };
    return new Promise((resolve) => {
      this.active = req.figure;
      this.ginput = { figId: req.figure, n: req.n || 0, points: [], resolve };
      if (this.deps.showFigures) this.deps.showFigures();
      this.emit();
    });
  }
  addGinputPoint(x, y, button) {
    const g = this.ginput;
    if (!g) return;
    g.points.push([x, y, button]);
    if (g.n > 0 && g.points.length >= g.n) this.finishGinput();
    else this.emit();
  }
  finishGinput(key) {
    const g = this.ginput;
    if (!g) return;
    this.ginput = null;
    g.resolve(key ? { points: g.points, key } : { points: g.points });
    this.emit();
  }

  onUiwait(req) {
    if (!this.scene.figures.has(req.figure)) return null;
    return new Promise((resolve) => {
      if (this.uiwait) this.finishUiwait();
      const timer = Number.isFinite(req.timeout) && req.timeout > 0 ? setTimeout(() => this.finishUiwait(), req.timeout * 1000) : null;
      this.uiwait = { figId: req.figure, resolve, timer };
      this.emit();
    });
  }
  finishUiwait() {
    const w = this.uiwait;
    if (!w) return;
    clearTimeout(w.timer);
    this.uiwait = null;
    w.resolve({ ok: true });
    this.emit();
  }
}

function homeOf(ax) {
  const p = ax.props;
  return { XLim: (p.XLim || [0, 1]).slice(), YLim: (p.YLim || [0, 1]).slice(), XLimMode: p.XLimMode || 'auto', YLimMode: p.YLimMode || 'auto', View: Array.isArray(p.View) ? p.View.slice() : null };
}

/**
 * render3d light options: the axes' own light objects (light, camlight,
 * lightangle) switch lighting on; without any, surfaces are drawn unlit.
 */
export function lightOptionsFor(ax) {
  return lightsOf(ax).length ? { lighting: true, defaultLight: false } : { lighting: false, defaultLight: false };
}
