// The video engine: every frame it draws the program scene (or the transition between two scenes) at the
// base (canvas) resolution, scales it to the output resolution in the WebGL canvas the encoders read, and
// copies what each display wants (preview, program, multiview, a scene or a source) into that display's
// 2D canvas. Sources come from engine/sources.js, filters and transitions are shader passes (engine/gl.js).
//
// Frames are driven by a worker timer at the output frame rate, so rendering (and recording) goes on while
// the window is in the background (requestAnimationFrame would stop).
import { FILTER_TYPES, TRANSITION_TYPES } from '../catalog.js';
import { activeSources, controlledSourceStates, sceneById, sourceOf, transitionFor, walkItems } from '../model.js';
import { boundsOf, corners, croppedSize, itemBox, itemMatrix, multiply } from '../transform.js';
import { GL } from './gl.js';
import { createRuntime } from './sources.js';
import { hexRgb, keyColor, lumaPixels, lutAtlas, parseCube, pngLutToCube } from './patterns.js';

const TICKER = `let timer = 0; onmessage = (e) => { clearInterval(timer); if (e.data > 0) timer = setInterval(() => postMessage(performance.now()), e.data); };`;
const ease = (p) => (p < 0.5 ? 2 * p * p : 1 - ((-2 * p + 2) ** 2) / 2);

export class Engine {
  constructor({ canvas = null, resolve, readText, fetchPage, browserPages = null, onEvent = () => {} } = {}) {
    this.browserPages = browserPages;
    this.pageFrames = new Map(); // source id → frame handler (real browser pages)
    this.canvas = canvas ?? document.createElement('canvas');
    this.gl = new GL(this.canvas);
    this.resolve = resolve ?? (async (v) => v);
    this.readText = readText ?? (async () => '');
    this.fetchPage = fetchPage ?? (async () => { throw new Error('url-pages-desktop-only'); });
    this.emit = onEvent;
    this.collection = null;
    this.runtimes = new Map();
    this.sourceControls = new Map();
    this.controlStates = new Map();
    this.textures = new Map(); // source id → uploaded texture
    this.filterState = new Map(); // filter id → per-filter state (delay buffers, LUTs, masks)
    this.assets = new Map(); // url → texture (LUTs, masks, luma patterns)
    this.video = { baseW: 1920, baseH: 1080, outW: 1920, outH: 1080, fps: 30, downscale: 'bicubic' };
    this.studio = false;
    this.transition = null; // { from, to, type, settings, duration, start, manual, p, stinger }
    this.tbar = null;
    this.itemAnims = new Map(); // item id → { visible, start, duration, type, settings }
    this.displays = new Map();
    this.frameListeners = new Set();
    this.frameIndex = 0;
    this.stats = { fps: 0, renderMs: 0, frames: 0, lagged: 0, skipped: 0, lastTick: 0 };
    this.fpsWindow = [];
    this.running = false;
    this.programTarget = null;
    this.previewTarget = null;
    this.lastProgram = null;
    this.audibleProgram = new Set();
    this.setVideo(this.video);
  }

  // ───────────────────────── configuration

  get fps() { return this.video.fps; }

  setVideo(v) {
    this.video = { ...this.video, ...v };
    const { outW, outH } = this.video;
    if (this.canvas.width !== outW || this.canvas.height !== outH) { this.canvas.width = outW; this.canvas.height = outH; }
    if (this.running) this.ticker.postMessage(1000 / this.video.fps);
    this.emit('video', this.video);
  }

  /** A new or changed collection: runtimes follow (created, updated, disposed). */
  setCollection(c) {
    this.collection = c;
    this.sync();
  }

  sync() {
    const c = this.collection;
    if (!c) return;
    const ids = new Set(Object.keys(c.sources));
    for (const [id, rt] of this.runtimes) if (!ids.has(id)) { rt.dispose(); this.runtimes.delete(id); this.gl.deleteTexture(this.textures.get(id)); this.textures.delete(id); this.emit('source-removed', id); }
    for (const src of Object.values(c.sources)) {
      const rt = this.runtimes.get(src.id);
      if (!rt) { const created = createRuntime(this, src); this.runtimes.set(src.id, created); this.emit('source-added', created); continue; }
      if (JSON.stringify(rt.settings) !== JSON.stringify(src.settings)) rt.update(src.settings);
    }
    this.syncSourceControls().catch((error) => this.emit('render-error', error));
    const liveFilters = new Set();
    for (const src of [...Object.values(c.sources), ...c.scenes]) for (const f of src.filters ?? []) liveFilters.add(f.id);
    for (const id of this.filterState.keys()) if (!liveFilters.has(id)) { this.disposeFilterState(id); }
    this.updateActivity();
  }

  runtime(id) { return this.runtimes.get(id) ?? null; }
  sourceControlState(id) { return this.controlStates.get(id) ?? 'running'; }
  async syncSourceControls() {
    const known = new Set([...Object.keys(this.collection.sources), ...this.collection.scenes.map((s) => s.id)]);
    for (const id of this.sourceControls.keys()) if (!known.has(id)) this.sourceControls.delete(id);
    this.controlStates = controlledSourceStates(this.collection, this.sourceControls);
    const pending = [];
    for (const [id, rt] of this.runtimes) pending.push(rt.setRunState(this.sourceControlState(id)));
    this.updateActivity();
    await Promise.all(pending);
  }
  async setSourceControl(id, state) {
    if (!this.controlStates.has(id) || !['running', 'paused', 'stopped'].includes(state)) throw new Error('invalid-source-control');
    if (state === 'running') this.sourceControls.delete(id); else this.sourceControls.set(id, state);
    await this.syncSourceControls();
  }
  sourceChanged(rt) { this.emit('source-changed', rt); }
  audioChanged(rt) { this.emit('audio-changed', rt); }
  mediaEnded(rt) { this.emit('media-ended', rt); }

  /** Which sources are in the program (audio, restart-on-activate) and on screen at all (preview, projectors). */
  updateActivity() {
    const c = this.collection;
    if (!c) return;
    const program = new Set(activeSources(c, c.current));
    if (this.transition) for (const id of activeSources(c, this.transition.to)) program.add(id);
    const showing = new Set(program);
    if (this.studio) for (const id of activeSources(c, c.preview)) showing.add(id);
    for (const d of this.displays.values()) {
      if (d.which?.startsWith('scene:')) for (const id of activeSources(c, d.which.slice(6))) showing.add(id);
      if (d.which?.startsWith('source:')) showing.add(d.which.slice(7));
      if (d.which === 'multiview') for (const s of c.scenes.slice(0, 8)) for (const id of activeSources(c, s.id)) showing.add(id);
    }
    for (const [id, rt] of this.runtimes) { rt.setActive(program.has(id)); rt.setShowing(showing.has(id)); }
    this.audibleProgram = new Set([...program].filter((id) => this.sourceControlState(id) === 'running'));
    this.emit('activity', { program, showing });
  }

  // ───────────────────────── running

  start() {
    if (this.running) return;
    this.running = true;
    const blob = new Blob([TICKER], { type: 'text/javascript' });
    this.ticker = new Worker(URL.createObjectURL(blob));
    this.ticker.onmessage = () => this.tick();
    this.ticker.postMessage(1000 / this.video.fps);
  }
  stop() { this.running = false; this.ticker?.postMessage(0); this.ticker?.terminate(); this.ticker = null; }

  tick(now = performance.now()) {
    const interval = 1000 / this.video.fps;
    if (this.stats.lastTick && now - this.stats.lastTick > interval * 1.8) this.stats.lagged += Math.max(0, Math.round((now - this.stats.lastTick) / interval) - 1);
    this.stats.lastTick = now;
    if (this.gl.lost || !this.collection) return;
    const t0 = performance.now();
    try { this.render(now); } catch (error) { this.emit('render-error', error); }
    const ms = performance.now() - t0;
    this.stats.renderMs = this.stats.renderMs * 0.9 + ms * 0.1;
    if (ms > interval) this.stats.skipped++;
    this.stats.frames++;
    this.fpsWindow.push(now);
    while (this.fpsWindow.length && now - this.fpsWindow[0] > 1000) this.fpsWindow.shift();
    this.stats.fps = this.fpsWindow.length;
  }

  onFrame(listener) { this.frameListeners.add(listener); return () => this.frameListeners.delete(listener); }

  /** A 2D canvas that shows `which`: 'program' | 'preview' | 'multiview' | 'scene:<id>' | 'source:<id>'. */
  addDisplay(name, canvas, which, options = {}) {
    this.displays.set(name, { canvas, ctx: canvas.getContext('2d'), which, ...options });
    this.updateActivity();
  }
  setDisplay(name, which) { const d = this.displays.get(name); if (d) { d.which = which; this.updateActivity(); } }
  removeDisplay(name) { this.displays.delete(name); this.updateActivity(); }

  // ───────────────────────── one frame

  render(now) {
    const gl = this.gl;
    const c = this.collection;
    const { baseW, baseH } = this.video;
    this.frameIndex++;
    this.frame = { id: this.frameIndex, now, scenes: new Map(), sources: new Map() };
    for (const rt of this.runtimes.values()) { try { rt.tick(now); } catch { /* a source's own trouble */ } }
    // Program (with the transition, if one runs).
    const program = gl.target(baseW, baseH);
    this.renderProgram(program, now);
    // Studio mode: the preview scene too.
    let preview = null;
    if (this.studio) { preview = gl.target(baseW, baseH); this.drawSceneInto(c.preview, preview); }
    // Displays: each copies its picture from the output canvas.
    for (const [, d] of this.displays) {
      if (d.paused) continue;
      const which = d.which === 'preview' ? (this.studio ? 'previewTex' : 'program') : d.which;
      if (which === 'multiview') { if (now - (d.drawnAt ?? 0) < 1000 / 15) continue; d.drawnAt = now; this.drawMultiview(d, program, preview); continue; }
      let tex = null;
      if (which === 'program') tex = program;
      else if (which === 'previewTex') tex = preview;
      else if (which.startsWith('scene:')) tex = this.sceneTexture(which.slice(6));
      else if (which.startsWith('source:')) tex = this.sourceTexture(which.slice(7));
      this.present(d, tex);
    }
    // The output: the program scaled to the output resolution (left in the canvas for the encoders).
    this.blit(program, this.canvas.width, this.canvas.height, this.video.downscale);
    for (const listener of this.frameListeners) { try { listener(this.canvas, now, this.frameIndex); } catch (error) { this.emit('frame-error', error); } }
    gl.release(this.lastProgram);
    this.lastProgram = program; // kept one frame: screenshots and tests read it
    gl.release(this.previewTarget);
    this.previewTarget = preview;
    for (const t of this.frame.scenes.values()) gl.release(t);
    for (const t of this.frame.sources.values()) if (t.pooled) gl.release(t.target);
  }

  /** Draws `tex` letterboxed into the default framebuffer region and copies it to the display's canvas. */
  present(d, tex) {
    const { canvas, ctx } = d;
    const W = canvas.width; const H = canvas.height;
    if (!W || !H) return;
    if (!tex) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); return; }
    const out = this.canvas;
    // Fit the picture into the display (and into the GL canvas it is drawn on first), then copy that part.
    const k = Math.min(W / tex.w, H / tex.h, out.width / tex.w, out.height / tex.h) || 1;
    const dw = Math.max(1, Math.round(tex.w * k));
    const dh = Math.max(1, Math.round(tex.h * k));
    this.gl.bind(null, [0, 0, 0, 1]);
    this.gl.drawItem(tex, [out.width, out.height], [1, 0, 0, 1, 0, 0], { x: 0, y: 0, w: Math.min(dw, out.width), h: Math.min(dh, out.height) }, [0, 0, 1, 1], { blend: 'none', sampling: 'bilinear' });
    const fit = Math.min(W / dw, H / dh);
    const w = dw * fit; const h = dh * fit;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    ctx.drawImage(out, 0, 0, Math.min(dw, out.width), Math.min(dh, out.height), (W - w) / 2, (H - h) / 2, w, h);
    d.rect = { x: (W - w) / 2, y: (H - h) / 2, w, h, scale: w / tex.w };
  }

  drawMultiview(d, program, preview) {
    const c = this.collection;
    const { canvas, ctx } = d;
    const W = canvas.width; const H = canvas.height;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    // Top: preview and program, half each; below: 8 scenes in two rows of four (the default layout).
    const big = { w: W / 2, h: H / 2 };
    const tiles = [{ tex: preview ?? program, x: 0, y: 0, w: big.w, h: big.h, label: 'preview', border: '#21c35a' }, { tex: program, x: big.w, y: 0, w: big.w, h: big.h, label: 'program', border: '#e5484d' }];
    c.scenes.slice(0, 8).forEach((s, i) => tiles.push({ scene: s.id, x: (i % 4) * (W / 4), y: H / 2 + Math.floor(i / 4) * (H / 4), w: W / 4, h: H / 4, label: s.name, border: s.id === c.current ? '#e5484d' : s.id === c.preview && this.studio ? '#21c35a' : '#555' }));
    d.tiles = [];
    for (const tile of tiles) {
      const tex = tile.tex ?? this.sceneTexture(tile.scene);
      const sub = { canvas: { width: Math.round(tile.w - 4), height: Math.round(tile.h - 4) } };
      if (!tex) continue;
      const out = this.canvas;
      const k = Math.min(sub.canvas.width / tex.w, sub.canvas.height / tex.h, out.width / tex.w, out.height / tex.h);
      const dw = Math.max(1, Math.round(tex.w * k)); const dh = Math.max(1, Math.round(tex.h * k));
      this.gl.bind(null, [0, 0, 0, 1]);
      this.gl.drawItem(tex, [out.width, out.height], [1, 0, 0, 1, 0, 0], { x: 0, y: 0, w: dw, h: dh }, [0, 0, 1, 1], { blend: 'none' });
      const fx = tile.x + 2 + (sub.canvas.width - dw) / 2; const fy = tile.y + 2 + (sub.canvas.height - dh) / 2;
      ctx.drawImage(out, 0, 0, dw, dh, fx, fy, dw, dh);
      ctx.strokeStyle = tile.border; ctx.lineWidth = 2; ctx.strokeRect(tile.x + 1, tile.y + 1, tile.w - 2, tile.h - 2);
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(tile.x + 2, tile.y + tile.h - 22, Math.min(tile.w - 4, 12 + ctx.measureText(tile.label).width), 20);
      ctx.fillStyle = '#fff'; ctx.font = '12px sans-serif'; ctx.fillText(d.labels?.[tile.label] ?? tile.label, tile.x + 8, tile.y + tile.h - 8);
      d.tiles.push({ ...tile, tex: undefined });
    }
  }

  /** Scales a target into the default framebuffer (the encoders' picture). */
  blit(tex, w, h, filter = 'bicubic') {
    this.gl.bind(null, [0, 0, 0, 1]);
    const sampling = tex.w === w && tex.h === h ? 'point' : filter === 'lanczos' ? 'lanczos' : filter === 'bicubic' ? 'bicubic' : filter === 'point' ? 'point' : 'bilinear';
    this.gl.drawItem(tex, [w, h], [1, 0, 0, 1, 0, 0], { x: 0, y: 0, w, h }, [0, 0, 1, 1], { blend: 'none', sampling });
  }

  // ───────────────────────── scenes

  /** A scene drawn at the canvas size (cached for the frame: nested scenes, multiview, projectors). */
  sceneTexture(sceneId, depth = 0) {
    if (this.sourceControlState(sceneId) !== 'running') return null;
    if (this.frame.scenes.has(sceneId)) return this.frame.scenes.get(sceneId);
    const scene = sceneById(this.collection, sceneId);
    if (!scene || depth > 8) return null;
    const t = this.gl.target(this.video.baseW, this.video.baseH);
    this.frame.scenes.set(sceneId, t); // set first: a scene that (wrongly) contains itself stops here
    this.drawScene(scene, t, depth);
    const filtered = this.applyFilters(scene.filters ?? [], t, sceneId);
    if (filtered !== t) { this.frame.scenes.set(sceneId, filtered); this.gl.release(t); }
    return this.frame.scenes.get(sceneId);
  }

  drawSceneInto(sceneId, target) {
    const tex = this.sceneTexture(sceneId);
    this.gl.bind(target, [0, 0, 0, 1]);
    if (tex) this.gl.drawItem(tex, [target.w, target.h], [1, 0, 0, 1, 0, 0], { x: 0, y: 0, w: target.w, h: target.h }, [0, 0, 1, 1], { sampling: 'point' });
  }

  drawScene(scene, target, depth = 0) {
    this.gl.bind(target, [0, 0, 0, 0]);
    this.drawItems(scene.items, target, null, depth, scene.id);
  }

  /** Items in drawing order (first is lowest). `parent`: a group's matrix. */
  drawItems(items, target, parent, depth, sceneId) {
    for (const item of items) {
      const anim = this.itemAnims.get(item.id);
      const p = anim ? Math.min(1, (this.frame.now - anim.start) / Math.max(1, anim.duration)) : 1;
      if (anim && p >= 1) this.itemAnims.delete(item.id);
      const showing = item.visible || (anim && p < 1);
      if (!showing) continue;
      let effect = null;
      if (anim && p < 1) effect = { p: anim.visible ? p : 1 - p, type: anim.type, settings: anim.settings };
      this.drawItem(item, target, parent, depth, sceneId, effect);
    }
  }

  drawItem(item, target, parent, depth, sceneId, effect) {
    if (this.sourceControlState(item.source) !== 'running') return;
    const gl = this.gl;
    const c = this.collection;
    const size = [target.w, target.h];
    const tr = item.transform;
    if (item.children) {
      // A group: its children in its own space, then the group's matrix.
      const r = (tr.rot * Math.PI) / 180;
      const gm = [Math.cos(r) * tr.sx, Math.sin(r) * tr.sx, -Math.sin(r) * tr.sy, Math.cos(r) * tr.sy, tr.x, tr.y];
      const m = parent ? multiply(parent, gm) : gm;
      const alpha = effect ? ease(effect.p) : 1;
      if (alpha >= 1 && !effect) { this.drawItems(item.children, target, m, depth, sceneId); return; }
      const layer = gl.target(target.w, target.h);
      gl.bind(layer, [0, 0, 0, 0]);
      this.drawItems(item.children, layer, m, depth, sceneId);
      gl.bind(target, null);
      gl.drawItem(layer, size, [1, 0, 0, 1, 0, 0], { x: 0, y: 0, w: target.w, h: target.h }, [0, 0, 1, 1], { alpha, sampling: 'point' });
      gl.release(layer);
      return;
    }
    const isScene = Boolean(sceneById(c, item.source));
    const tex = isScene ? this.sceneTexture(item.source, depth + 1) : this.sourceTexture(item.source);
    if (!tex || tex.w < 1 || tex.h < 1) return;
    const box = itemBox(tr, tex.w, tex.h);
    let m = itemMatrix(tr, box);
    let alpha = 1;
    if (effect) {
      const e = ease(effect.p);
      const dir = effect.settings?.direction ?? 'left';
      const off = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] }[dir] ?? [-1, 0];
      if (effect.type === 'slide_transition' || effect.type === 'swipe_transition') m = multiply([1, 0, 0, 1, off[0] * (1 - e) * box.w, off[1] * (1 - e) * box.h], m);
      else if (effect.type !== 'cut_transition') alpha = e;
    }
    if (parent) m = multiply(parent, m);
    // Crop (and flips) select the source part; the scale filter picks the sampling.
    const crop = tr.crop ?? {};
    const cs = croppedSize(tr, tex.w, tex.h);
    let u0 = (crop.l || 0) / tex.w; let v0 = (crop.t || 0) / tex.h;
    let u1 = u0 + cs.w / tex.w; let v1 = v0 + cs.h / tex.h;
    if (box.flipX) [u0, u1] = [u1, u0];
    if (box.flipY) [v0, v1] = [v1, v0];
    const sampling = item.scaleFilter === 'disable' ? 'bilinear' : item.scaleFilter === 'area' ? 'bilinear' : item.scaleFilter;
    gl.bind(target, null);
    if (box.clip) {
      // Bounding box with "crop to bounds": draw into a box-sized layer first.
      const layer = gl.target(Math.ceil(box.w), Math.ceil(box.h));
      gl.bind(layer, [0, 0, 0, 0]);
      gl.drawItem(tex, [layer.w, layer.h], [1, 0, 0, 1, 0, 0], box.content, [u0, v0, u1, v1], { sampling });
      gl.bind(target, null);
      gl.drawItem(layer, size, m, { x: 0, y: 0, w: box.w, h: box.h }, [0, 0, 1, 1], { alpha, blend: item.blend, sampling: 'bilinear' });
      gl.release(layer);
    } else gl.drawItem(tex, size, m, box.content, [u0, v0, u1, v1], { alpha, blend: item.blend, sampling });
  }

  // ───────────────────────── program and transitions

  renderProgram(out, now) {
    const c = this.collection;
    const tr = this.transition;
    if (!tr) { this.drawSceneInto(c.current, out); return; }
    let p = tr.manual ? tr.p : Math.min(1, (now - tr.start) / Math.max(1, tr.duration));
    if (tr.type === 'stinger_transition' && tr.stinger && !tr.manual) {
      const v = tr.stinger;
      const d = Number.isFinite(v.duration) && v.duration > 0 ? v.duration * 1000 : tr.duration;
      p = Math.min(1, (v.currentTime * 1000) / d);
      if (v.ended) p = 1;
    }
    tr.p = p;
    const A = this.sceneTexture(tr.from);
    const B = this.sceneTexture(tr.to);
    const gl = this.gl;
    const s = tr.settings ?? {};
    const size = [out.w, out.h];
    const full = { x: 0, y: 0, w: out.w, h: out.h };
    const draw = (tex, dx = 0, dy = 0) => { if (tex) gl.drawItem(tex, size, [1, 0, 0, 1, dx, dy], full, [0, 0, 1, 1], { sampling: 'point' }); };
    const e = ease(p);
    switch (tr.type) {
      case 'fade_transition': gl.pass('fade', A, out, { uTexB: B, uP: e }); break;
      case 'fade_to_color_transition': gl.pass('fadecolor', A, out, { uTexB: B, uP: p, uSwitch: (s.switch_point ?? 50) / 100, uColor: hexRgb(s.color) }); break;
      case 'wipe_transition': gl.pass('lumawipe', A, out, { uTexB: B, uLumaTex: this.lumaTexture(s.luma_image), uP: p, uSoft: s.luma_softness ?? 0.03, uInvert: Boolean(s.luma_invert) }); break;
      case 'swipe_transition':
      case 'slide_transition': {
        const off = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] }[s.direction ?? 'left'];
        gl.bind(out, [0, 0, 0, 1]);
        if (tr.type === 'slide_transition') { draw(A, off[0] * e * out.w, off[1] * e * out.h); draw(B, -off[0] * (1 - e) * out.w, -off[1] * (1 - e) * out.h); }
        else if (s.swipe_in) { draw(A); draw(B, -off[0] * (1 - e) * out.w, -off[1] * (1 - e) * out.h); }
        else { draw(B); draw(A, off[0] * e * out.w, off[1] * e * out.h); }
        break;
      }
      case 'stinger_transition': {
        const point = s.tp_type === 'frame' ? (s.transition_point / 30) * 1000 : s.transition_point;
        const v = tr.stinger;
        const durMs = v && Number.isFinite(v.duration) && v.duration > 0 ? v.duration * 1000 : tr.duration;
        const switched = p * durMs >= point;
        const stex = v ? this.uploadElement('stinger', v, v.videoWidth, v.videoHeight) : null;
        if (s.track_matte_enabled && stex) gl.pass('matte', A, out, { uTexB: B, uStinger: stex, uVertical: s.track_matte_layout === 'vertical' });
        else {
          gl.bind(out, [0, 0, 0, 1]);
          draw(switched ? B : A);
          if (stex) gl.drawItem(stex, size, [1, 0, 0, 1, 0, 0], full, [0, 0, 1, 1]);
        }
        if (switched && !tr.switched) { tr.switched = true; this.emit('stinger-switch', tr); }
        break;
      }
      default: gl.bind(out, [0, 0, 0, 1]); draw(B); // cut
    }
    if (p >= 1 && !tr.manual) this.finishTransition();
  }

  /**
   * Switches the program to `sceneId` with a transition (the scene's override, else the current one).
   * Returns false when a transition is already running (the click is ignored).
   */
  transitionTo(sceneId, { transition = null, duration = null } = {}) {
    const c = this.collection;
    if (!sceneById(c, sceneId)) return false;
    if (this.transition && !this.transition.manual) return false;
    const chosen = transition ? { transition, duration: duration ?? c.duration } : transitionFor(c, sceneId);
    const tr = chosen.transition;
    if (!tr || tr.type === 'cut_transition' || sceneId === c.current && !this.studio) {
      const from = c.current;
      c.current = sceneId;
      this.updateActivity();
      // A cut ends at once: the same end of transition (studio-mode swap, temporary copies) as the others.
      this.emit('transition-end', { from, to: sceneId, type: 'cut_transition' });
      this.emit('program', sceneId);
      return true;
    }
    this.transition = { from: c.current, to: sceneId, type: tr.type, settings: tr.settings, duration: Math.max(50, duration ?? chosen.duration), start: performance.now(), manual: false, p: 0 };
    if (tr.type === 'stinger_transition') this.startStinger(this.transition);
    this.updateActivity();
    this.emit('transition-start', this.transition);
    return true;
  }

  async startStinger(tr) {
    const path = tr.settings?.path;
    if (!path) return;
    const v = document.createElement('video');
    v.playsInline = true;
    v.crossOrigin = 'anonymous';
    v.src = await this.resolve(path);
    tr.stinger = v;
    v.addEventListener('ended', () => { if (this.transition === tr && !tr.manual) this.finishTransition(); });
    this.emit('stinger-audio', v);
    await v.play().catch(() => {});
  }

  finishTransition() {
    const tr = this.transition;
    if (!tr) return;
    this.transition = null;
    tr.stinger?.pause();
    this.collection.current = tr.to;
    this.updateActivity();
    this.emit('transition-end', tr);
    this.emit('program', tr.to);
  }

  /** T-bar (studio mode): 0…1 drives a transition by hand; reaching 1 completes it. */
  setTBar(value, sceneId) {
    const c = this.collection;
    const v = Math.max(0, Math.min(1, value));
    if (!this.transition) {
      if (v <= 0) return;
      const { transition } = transitionFor(c, sceneId);
      const type = transition?.type === 'cut_transition' || transition?.type === 'stinger_transition' ? 'fade_transition' : transition?.type ?? 'fade_transition';
      this.transition = { from: c.current, to: sceneId, type, settings: transition?.settings ?? {}, duration: c.duration, start: performance.now(), manual: true, p: v };
      this.updateActivity();
    }
    this.transition.p = v;
    if (v >= 1) { this.transition.manual = false; this.finishTransition(); }
    else if (v <= 0) { this.transition = null; this.updateActivity(); }
  }

  /** Show / hide an item with its own transition (item.show / item.hide). */
  animateItem(item, visible) {
    const ref = visible ? item.show : item.hide;
    if (!ref?.type || ref.type === 'cut_transition') { this.itemAnims.delete(item.id); return; }
    this.itemAnims.set(item.id, { visible, start: performance.now(), duration: Math.max(50, ref.duration ?? 300), type: ref.type, settings: ref.settings ?? TRANSITION_TYPES[ref.type] ? ref.settings ?? {} : {} });
  }

  // ───────────────────────── sources and their filters

  uploadElement(key, element, w, h) {
    if (!w || !h) return null;
    let t = this.textures.get(key);
    if (!t) { t = this.gl.texture(1, 1); this.textures.set(key, t); }
    this.gl.upload(t, element, w, h);
    return t;
  }

  /** A source's picture with its video filters applied (cached for the frame). */
  sourceTexture(sourceId) {
    if (this.sourceControlState(sourceId) !== 'running') return null;
    const cached = this.frame.sources.get(sourceId);
    if (cached) return cached.tex;
    const rt = this.runtimes.get(sourceId);
    const record = this.collection.sources[sourceId];
    if (!rt || !record || !rt.element || !rt.width || !rt.height) return null;
    let t = this.textures.get(sourceId);
    if (!t) { t = this.gl.texture(1, 1); t.version = -1; this.textures.set(sourceId, t); }
    if (t.version !== rt.version || t.w !== rt.width || t.h !== rt.height) {
      // Colour sources: an 8×8 swatch stretched to the source size.
      if (this.gl.upload(t, rt.element, rt.element.width && rt.type === 'color_source_v3' ? rt.element.width : rt.element.videoWidth || rt.element.naturalWidth || rt.element.width, rt.element.videoHeight || rt.element.naturalHeight || rt.element.height)) t.version = rt.version;
    }
    const shown = rt.type === 'color_source_v3' ? { ...t, w: rt.width, h: rt.height } : t;
    const out = this.applyFilters(record.filters, shown, sourceId);
    this.frame.sources.set(sourceId, { tex: out, target: out !== shown ? out : null, pooled: out !== shown });
    return out;
  }

  /** Runs a source's enabled video filters in order; returns the last picture (a pooled target or the input). */
  applyFilters(filters, input, ownerId) {
    let cur = input;
    const owned = [];
    for (const f of filters ?? []) {
      const info = FILTER_TYPES[f.type];
      if (!f.enabled || info?.kind !== 'video') continue;
      const next = this.runFilter(f, cur, ownerId);
      if (next && next !== cur) { if (owned.includes(cur)) this.gl.release(cur); owned.push(next); cur = next; }
    }
    return cur;
  }

  filterStateOf(id) { let st = this.filterState.get(id); if (!st) { st = {}; this.filterState.set(id, st); } return st; }
  disposeFilterState(id) {
    const st = this.filterState.get(id);
    for (const t of st?.ring ?? []) this.gl.destroyTarget(t.target);
    this.filterState.delete(id);
  }

  runFilter(f, input, ownerId) {
    const gl = this.gl;
    const s = f.settings;
    const out = () => gl.target(input.w, input.h);
    switch (f.type) {
      case 'color_filter_v2': return gl.pass('color', input, out(), { uGamma: s.gamma, uContrast: s.contrast, uBrightness: s.brightness, uSaturation: s.saturation, uHue: s.hue_shift, uOpacity: s.opacity, uMul: hexRgb(s.color_multiply), uAdd: hexRgb(s.color_add) });
      case 'chroma_key_filter_v2': return gl.pass('chroma', input, out(), { uKey: keyColor(s), uSim: s.similarity / 1000, uSmooth: Math.max(0.001, s.smoothness / 1000), uSpill: Math.max(0.001, s.spill / 1000), uOpacity: s.opacity, uContrast: s.contrast, uBrightness: s.brightness, uGamma: s.gamma });
      case 'color_key_filter_v2': return gl.pass('colorkey', input, out(), { uKey: keyColor(s), uSim: s.similarity / 1000, uSmooth: Math.max(0.001, s.smoothness / 1000), uOpacity: s.opacity, uContrast: s.contrast, uBrightness: s.brightness, uGamma: s.gamma });
      case 'luma_key_filter_v2': return gl.pass('lumakey', input, out(), { uMax: s.luma_max, uMaxSmooth: s.luma_max_smooth, uMin: s.luma_min, uMinSmooth: s.luma_min_smooth });
      case 'sharpness_filter_v2': return gl.pass('sharpen', input, out(), { uAmount: s.sharpness });
      case 'hdr_tonemap_filter': return gl.pass('tonemap', input, out(), { uMode: s.transform === 'maxrgb' ? 1 : 0, uExposure: s.exposure });
      case 'blur_filter': {
        const kind = s.blur_type === 'pixelate' ? 2 : s.blur_type === 'box' ? 1 : 0;
        if (kind === 2) return gl.pass('blur', input, out(), { uKind: 2, uRadius: s.size, uDir: [1, 0] });
        const a = gl.pass('blur', input, out(), { uKind: kind, uRadius: s.size, uDir: [1, 0] });
        const b = gl.pass('blur', a, out(), { uKind: kind, uRadius: s.size, uDir: [0, 1] });
        gl.release(a);
        return b;
      }
      case 'scroll_filter': {
        const st = this.filterStateOf(f.id);
        const now = this.frame.now;
        const dt = st.last ? (now - st.last) / 1000 : 0;
        st.last = now;
        st.x = ((st.x ?? 0) + (s.speed_x * dt) / input.w) % 1;
        st.y = ((st.y ?? 0) + (s.speed_y * dt) / input.h) % 1;
        const w = s.limit_cx ? s.cx : input.w; const h = s.limit_cy ? s.cy : input.h;
        return gl.pass('scroll', input, gl.target(w, h), { uOffset: [-st.x, -st.y], uLoop: s.loop !== false });
      }
      case 'crop_filter': {
        let l; let tp; let w; let h;
        if (s.relative) { l = s.left; tp = s.top; w = input.w - s.left - s.right; h = input.h - s.top - s.bottom; } else { l = s.left; tp = s.top; w = s.cx || input.w - s.left; h = s.cy || input.h - s.top; }
        w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
        const t = gl.target(w, h);
        gl.bind(t, [0, 0, 0, 0]);
        // Negative crop pads: the picture lands inside a bigger, transparent canvas.
        gl.drawItem(input, [w, h], [1, 0, 0, 1, -l, -tp], { x: 0, y: 0, w: input.w, h: input.h }, [0, 0, 1, 1], { blend: 'none', sampling: 'point' });
        return t;
      }
      case 'scale_filter': {
        let [w, h] = [input.w, input.h];
        const r = s.resolution;
        if (r === 'base') [w, h] = [this.video.baseW, this.video.baseH];
        else if (/^\d+x\d+$/.test(r)) [w, h] = r.split('x').map(Number);
        else if (/^\d+:\d+$/.test(r)) { const [a, b] = r.split(':').map(Number); w = Math.round(input.h * a / b); h = input.h; }
        if (w === input.w && h === input.h && s.sampling !== 'point') return input;
        const t = gl.target(w, h);
        gl.bind(t, [0, 0, 0, 0]);
        let content = { x: 0, y: 0, w, h };
        if (s.undistort) { const k = Math.min(w / input.w, h / input.h); content = { x: (w - input.w * k) / 2, y: (h - input.h * k) / 2, w: input.w * k, h: input.h * k }; }
        const sampling = s.sampling === 'disable' || s.sampling === 'area' ? 'bilinear' : s.sampling;
        gl.drawItem(input, [w, h], [1, 0, 0, 1, 0, 0], content, [0, 0, 1, 1], { blend: 'none', sampling });
        return t;
      }
      case 'gpu_delay':
      case 'async_delay_filter': {
        const st = this.filterStateOf(f.id);
        st.ring ??= [];
        const keep = gl.target(input.w, input.h);
        gl.pass('copy', input, keep);
        const destroyed = [];
        st.ring.push({ at: this.frame.now, target: keep });
        // Give back what is older than the delay (keeping the newest that is old enough).
        while (st.ring.length > 1 && this.frame.now - st.ring[1].at >= s.delay_ms) destroyed.push(st.ring.shift());
        for (const d of destroyed) gl.destroyTarget(d.target);
        if (st.ring.length > 600) gl.destroyTarget(st.ring.shift().target);
        const pick = st.ring[0];
        const t = gl.target(input.w, input.h);
        if (pick.target.w === input.w && pick.target.h === input.h) gl.pass('copy', pick.target, t); else gl.pass('copy', input, t);
        return t;
      }
      case 'clut_filter': {
        const lut = this.lutTexture(s.image_path);
        if (!lut) return input;
        return gl.pass('lut', input, out(), { uLut: lut.tex, uLutSize: lut.size, uLutCols: lut.cols, uAmount: s.clut_amount, uPassAlpha: s.passthrough_alpha });
      }
      case 'mask_filter_v2': {
        const mask = this.imageTexture(s.image_path);
        if (!mask) return input;
        const type = ['mask_alpha', 'mask_color', 'blend_mul', 'blend_add', 'blend_sub'].indexOf(s.type);
        // The mask picture is first fitted to the source (stretched, or drawn at its own size top-left).
        const fitted = gl.target(input.w, input.h);
        gl.bind(fitted, [0, 0, 0, 0]);
        gl.drawItem(mask, [input.w, input.h], [1, 0, 0, 1, 0, 0], s.stretch ? { x: 0, y: 0, w: input.w, h: input.h } : { x: (input.w - mask.w) / 2, y: (input.h - mask.h) / 2, w: mask.w, h: mask.h }, [0, 0, 1, 1], { blend: 'none' });
        const r = gl.pass('mask', input, out(), { uMask: { tex: fitted.tex }, uType: Math.max(0, type), uColor: hexRgb(s.color), uOpacity: s.opacity });
        gl.release(fitted);
        return r;
      }
      default: return input; // audio filters, VST
    }
  }

  lumaTexture(kind = 'linear-h') {
    const key = `luma:${kind}`;
    let t = this.assets.get(key);
    if (!t) { t = this.gl.texture(256, 144); this.gl.uploadPixels(t, lumaPixels(kind), 256, 144); this.assets.set(key, t); }
    return t;
  }

  /** A picture file as a texture (loaded once, null until ready). */
  imageTexture(path) {
    if (!path) return null;
    const key = `img:${path}`;
    const hit = this.assets.get(key);
    if (hit) return hit.ready ? hit : null;
    const entry = { ready: false };
    this.assets.set(key, entry);
    (async () => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = await this.resolve(path);
      await img.decode();
      const t = this.gl.texture(1, 1);
      this.gl.upload(t, img, img.naturalWidth, img.naturalHeight);
      Object.assign(entry, t, { ready: true });
    })().catch(() => { entry.failed = true; });
    return null;
  }

  /** A .cube or PNG LUT as an atlas texture (loaded once). */
  lutTexture(path) {
    if (!path) return null;
    const key = `lut:${path}`;
    const hit = this.assets.get(key);
    if (hit) return hit.ready ? hit : null;
    const entry = { ready: false };
    this.assets.set(key, entry);
    (async () => {
      let cube;
      if (/\.cube$/i.test(path) || String(path).startsWith('cube:')) cube = parseCube(await this.readText(path));
      else {
        const img = new Image(); img.crossOrigin = 'anonymous'; img.src = await this.resolve(path); await img.decode();
        const cv = document.createElement('canvas'); cv.width = img.naturalWidth; cv.height = img.naturalHeight;
        const ctx = cv.getContext('2d'); ctx.drawImage(img, 0, 0);
        cube = pngLutToCube(ctx.getImageData(0, 0, cv.width, cv.height).data, cv.width, cv.height);
      }
      const atlas = lutAtlas(cube);
      const t = this.gl.texture(atlas.width, atlas.height);
      this.gl.uploadPixels(t, atlas.pixels, atlas.width, atlas.height);
      Object.assign(entry, { tex: t, size: atlas.size, cols: atlas.cols, ready: true });
    })().catch(() => { entry.failed = true; });
    return null;
  }

  // ───────────────────────── reading pictures back

  /** RGBA pixels of 'program' | 'preview' | 'scene:<id>' | 'source:<id>' as ImageData-like { data, width, height }. */
  capture(which = 'program') {
    if (!this.frame) this.render(performance.now());
    const gl = this.gl;
    let tex = null;
    let temp = null;
    if (which === 'program') tex = this.lastProgram;
    else if (which === 'preview') tex = this.previewTarget ?? this.lastProgram;
    else {
      this.frame = { id: ++this.frameIndex, now: performance.now(), scenes: new Map(), sources: new Map() };
      tex = which.startsWith('scene:') ? this.sceneTexture(which.slice(6)) : this.sourceTexture(which.slice(7));
    }
    let pixels = null;
    if (tex) {
      if (!tex.fb) { temp = gl.target(tex.w, tex.h); gl.pass('copy', tex, temp); tex = temp; }
      pixels = gl.read(tex);
      if (temp) gl.release(temp);
    }
    if (which !== 'program' && which !== 'preview') { for (const t of this.frame.scenes.values()) gl.release(t); for (const t of this.frame.sources.values()) if (t.pooled) gl.release(t.target); this.frame.scenes.clear(); this.frame.sources.clear(); }
    return pixels;
  }

  /** A PNG of `which` (Blob). */
  async screenshot(which = 'program', type = 'image/png') {
    const px = this.capture(which);
    if (!px) return null;
    const cv = document.createElement('canvas');
    cv.width = px.width; cv.height = px.height;
    cv.getContext('2d').putImageData(new ImageData(px.data, px.width, px.height), 0, 0);
    return new Promise((resolve) => cv.toBlob(resolve, type, 0.95));
  }

  /** Canvas-space corners of every item of a scene (selection handles, hit tests). */
  itemGeometry(sceneId) {
    const c = this.collection;
    const scene = sceneById(c, sceneId);
    const out = [];
    if (!scene) return out;
    const sizeOf = (item) => {
      if (sceneById(c, item.source)) return [this.video.baseW, this.video.baseH];
      const tex = this.frame?.sources.get(item.source)?.tex;
      const rt = this.runtimes.get(item.source);
      return tex ? [tex.w, tex.h] : [rt?.width || 0, rt?.height || 0];
    };
    walkItems(scene.items, (item, parent) => {
      if (item.children) {
        const r = (item.transform.rot * Math.PI) / 180;
        const gm = [Math.cos(r) * item.transform.sx, Math.sin(r) * item.transform.sx, -Math.sin(r) * item.transform.sy, Math.cos(r) * item.transform.sy, item.transform.x, item.transform.y];
        const kids = item.children.map((k) => { const [w, h] = sizeOf(k); return corners(k.transform, w || 1, h || 1, gm); }).flat();
        out.push({ id: item.id, group: true, corners: kids.length ? cornersOfBounds(boundsOf(kids)) : [], matrix: gm, w: 0, h: 0, parent: null });
        return;
      }
      const [w, h] = sizeOf(item);
      let pm = null;
      if (parent) { const r = (parent.transform.rot * Math.PI) / 180; pm = [Math.cos(r) * parent.transform.sx, Math.sin(r) * parent.transform.sx, -Math.sin(r) * parent.transform.sy, Math.cos(r) * parent.transform.sy, parent.transform.x, parent.transform.y]; }
      out.push({ id: item.id, corners: w && h ? corners(item.transform, w, h, pm) : [], w, h, parent: parent?.id ?? null, parentMatrix: pm });
    });
    return out;
  }

  sourceInfo(id) { return this.runtimes.get(id)?.info() ?? null; }
  sourceOf(id) { return sourceOf(this.collection, id); }

  dispose() {
    this.stop();
    for (const rt of this.runtimes.values()) rt.dispose();
    this.runtimes.clear();
  }
}

const cornersOfBounds = (b) => [{ x: b.x, y: b.y }, { x: b.x + b.w, y: b.y }, { x: b.x + b.w, y: b.y + b.h }, { x: b.x, y: b.y + b.h }];
