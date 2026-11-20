// The studio: one object that owns the open scene collection and profile, the video engine, the audio
// mixer and the outputs, and the Undo history. The UI (app.js and studio/*.js) reads its state and calls
// its methods; it tells the UI what changed through `on(event, fn)`:
//   'changed' (collection edited) · 'program' · 'preview' · 'selection' · 'outputs' (live / rec / replay /
//   vcam state) · 'log' · 'profile' · 'collections' · 'error'.
import { FILTER_TYPES, SOURCE_TYPES, TRANSITION_TYPES, normalizeSettings, sourceDefaults } from '../bc/catalog.js';
import * as M from '../bc/model.js';
import * as T from '../bc/transform.js';
import { Engine } from '../bc/engine/compositor.js';
import { AudioMixer } from '../bc/engine/audio.js';
import { AudioEncoderHub, CONTAINER_CODECS, Recording, ReplayBuffer, StreamOutput, VideoEncoderHub, ffmetadata, formatFileName, ingestUrl, uniqueFile } from '../bc/engine/outputs.js';
import { ProjectorHost, WhipOutput } from '../bc/engine/whip.js';
import { ViewerHost, parseIceServers } from '../bc/engine/viewers.js';
import { checkStream, serviceById } from '../bc/services.js';
import { exportSceneJson, importSceneJson, isSceneJson } from '../bc/compat/scenejson.js';
import { sampleCollection } from '../bc/samples.js';
import { currentProfile, encodersOf, loadProfiles, normalizeProfile, storeProfiles, uniqueProfileName, videoOf } from './profile.js';
import { keyMap, pruneBindings } from './hotkeys.js';
import * as P from '../bc/platform.js';

export const COLLECTIONS_KEY = 'mybroadcasting.collections.v1';
const collectionKey = (name) => `mybroadcasting.collection.${name}`;
const HISTORY_LIMIT = 100;

export class Studio {
  constructor({ storage = globalThis.localStorage, t = (k) => k, platform = P } = {}) {
    this.storage = storage;
    this.t = t;
    this.platform = platform;
    this.listeners = new Map();
    this.logLines = [];
    this.undoStack = [];
    this.redoStack = [];
    this.selection = { items: new Set(), source: null };
    this.studioMode = false;
    this.outputs = { stream: null, recording: null, replay: null, vcam: false, streamStarted: 0, recordStarted: 0 };
    this.hubs = new Map();
    this.clipboard = null;
    this.profiles = loadProfiles(storage);
    this.collections = this.loadCollectionList();
    this.collection = this.localize(this.readCollection(this.collections.current) ?? M.createCollection(this.collections.current));
  }

  /** Built-in transitions made without a name carry their type id: they get the name in the UI language. */
  localize(c) {
    for (const tr of c.transitions) if (tr.name === tr.type) tr.name = this.t(`trn.${tr.type}`);
    return c;
  }

  on(event, fn) { if (!this.listeners.has(event)) this.listeners.set(event, new Set()); this.listeners.get(event).add(fn); return () => this.listeners.get(event).delete(fn); }
  emit(event, data) { for (const fn of this.listeners.get(event) ?? []) { try { fn(data); } catch (error) { console.error(error); } } }
  log(level, text, detail = '') {
    const line = { at: new Date(), level, text, detail };
    this.logLines.push(line);
    if (this.logLines.length > 5000) this.logLines.splice(0, 1000);
    this.emit('log', line);
  }

  get c() { return this.collection; }
  get profile() { return currentProfile(this.profiles); }

  // ───────────────────────── engine and mixer

  /** Starts the video engine (the WebGL canvas is kept off screen; displays copy from it). */
  start() {
    this.engine = new Engine({
      resolve: (v) => this.platform.resolve(v), readText: (v) => this.platform.readText(v), fetchPage: (u) => this.platform.fetchPage(u), browserPages: this.platform.browserPages ?? null,
      onEvent: (event, data) => this.onEngine(event, data),
    });
    this.engine.setVideo(videoOf(this.profile));
    this.engine.setCollection(this.c);
    this.engine.start();
    this.mixer = new AudioMixer({ sampleRate: this.profile.audio.sampleRate, channels: this.profile.audio.channels === 'mono' ? 1 : 2, onEvent: (e, d) => this.emit(e, d) });
    this.projectors = new ProjectorHost((which, id) => this.projectorStream(which, id));
    this.log('info', `engine started ${this.engine.video.baseW}×${this.engine.video.baseH} → ${this.engine.video.outW}×${this.engine.video.outH} @ ${this.engine.video.fps}`);
    this.ensureGlobalAudio();
    return this.engine;
  }

  /** The audio context needs a user gesture in browsers: called from the first click as well. */
  async startAudio() {
    if (!this.mixer) return;
    await this.mixer.init();
    await this.mixer.resume();
    if (this.mixerReady) return;
    this.mixerReady = true;
    this.mixer.setMonitorDevice(this.profile.audio.monitorDevice);
    for (const rt of this.engine.runtimes.values()) this.attachAudio(rt);
    this.syncAudioActivity();
    this.log('info', `audio ${this.mixer.ctx.sampleRate} Hz, ${this.mixer.channels} ch`);
  }

  onEngine(event, data) {
    switch (event) {
      case 'source-added': case 'audio-changed': this.attachAudio(data); if (event === 'source-added') data.ensure?.(); break;
      case 'source-removed': this.mixer?.detach(data); break;
      case 'activity': this.syncAudioActivity(); break;
      case 'program': this.emit('program', data); break;
      case 'transition-start': this.emit('transition', data); break;
      case 'transition-end': this.afterTransition(data); break;
      case 'stinger-audio': this.mixer?.playThrough(data); break;
      case 'render-error': this.log('error', `render: ${data?.message ?? data}`); break;
      case 'source-changed': this.emit('source-changed', data); break;
      case 'media-ended': this.emit('media', data); break;
      default: break;
    }
  }

  attachAudio(rt) {
    if (!this.mixerReady) return;
    const src = this.c.sources[rt.id];
    if (!src?.audio) return;
    const input = rt.audio ?? null;
    this.mixer.attach(src, input);
  }

  syncAudioActivity() {
    if (!this.mixerReady) return;
    this.mixer.setActive(this.engine.audibleProgram, Object.values(this.c.sources).filter((s) => s.audio));
  }

  /** Global audio devices (Settings › Audio): sources shown in the mixer whatever the scene. */
  ensureGlobalAudio() {
    const devices = this.profile.audio.devices;
    const want = [['desktop1', 'wasapi_output_capture'], ['desktop2', 'wasapi_output_capture'], ['mic1', 'wasapi_input_capture'], ['mic2', 'wasapi_input_capture'], ['mic3', 'wasapi_input_capture'], ['mic4', 'wasapi_input_capture']];
    let changed = false;
    for (const [slot, type] of want) {
      const existing = Object.values(this.c.sources).find((s) => s.global === slot);
      const device = devices[slot];
      if (!device && existing) { delete this.c.sources[existing.id]; changed = true; }
      if (device && !existing) {
        const s = M.createSource(this.c, type, this.t(`audio.global.${slot}`), { device_id: device });
        s.global = slot;
        changed = true;
      } else if (device && existing && existing.settings.device_id !== device) { existing.settings.device_id = device; changed = true; }
    }
    if (changed) { this.engine?.sync(); this.save(); this.emit('changed', { label: 'globalAudio' }); }
  }

  // ───────────────────────── changes, Undo / Redo

  snapshot() { return JSON.stringify({ c: this.c, sel: [...this.selection.items] }); }

  /** Every edit goes through here: one Undo step (coalesced when `coalesce` names the same ongoing gesture). */
  change(label, fn, { coalesce = null, quiet = false } = {}) {
    const before = this.snapshot();
    const last = this.undoStack.at(-1);
    let result;
    try { result = fn(this.c); } catch (error) { this.emit('error', error); throw error; }
    if (this.snapshot() === before) return result;
    if (!(coalesce && last?.coalesce === coalesce && Date.now() - last.at < 1500)) {
      this.undoStack.push({ label, state: before, coalesce, at: Date.now() });
      if (this.undoStack.length > HISTORY_LIMIT) this.undoStack.shift();
    } else last.at = Date.now();
    this.redoStack = [];
    this.applied(label, quiet);
    return result;
  }

  applied(label, quiet = false) {
    this.engine?.sync();
    if (this.mixerReady) for (const s of Object.values(this.c.sources)) if (s.audio) { if (this.engine.runtimes.get(s.id)) this.attachAudio(this.engine.runtimes.get(s.id)); this.mixer.rewire(s); }
    this.save();
    if (!quiet) this.emit('changed', { label });
  }

  /** Audio and filter values that change constantly (fader drags): no rewiring of the graph. */
  tweak(label, fn, { coalesce = label } = {}) {
    this.change(label, fn, { coalesce, quiet: true });
    this.emit('tweaked', { label });
  }

  /** A pointer gesture (dragging in the preview): edits happen live, one Undo step when it ends. */
  beginGesture(label) { this.gesture = { label, before: this.snapshot() }; }
  endGesture() {
    const g = this.gesture;
    this.gesture = null;
    if (!g || this.snapshot() === g.before) return false;
    this.undoStack.push({ label: g.label, state: g.before, at: Date.now() });
    if (this.undoStack.length > HISTORY_LIMIT) this.undoStack.shift();
    this.redoStack = [];
    this.applied(g.label);
    return true;
  }

  get canUndo() { return this.undoStack.length > 0; }
  get canRedo() { return this.redoStack.length > 0; }
  get undoLabel() { return this.undoStack.at(-1)?.label; }
  get redoLabel() { return this.redoStack.at(-1)?.label; }

  restore(state) {
    const { c, sel } = JSON.parse(state);
    const current = this.c.current;
    this.collection = M.normalizeCollection(c);
    // Undo never switches the live program under the broadcast.
    if (M.sceneById(this.collection, current)) this.collection.current = current;
    this.selection.items = new Set(sel ?? []);
    this.engine?.setCollection(this.collection);
    this.applied('undo');
  }
  undo() { const step = this.undoStack.pop(); if (!step) return null; this.redoStack.push({ label: step.label, state: this.snapshot() }); this.restore(step.state); return step.label; }
  redo() { const step = this.redoStack.pop(); if (!step) return null; this.undoStack.push({ label: step.label, state: this.snapshot(), at: 0 }); this.restore(step.state); return step.label; }

  // ───────────────────────── scenes

  /** The scene being edited: the preview in studio mode, else the program. */
  get editScene() { return M.sceneById(this.c, this.studioMode ? this.c.preview : this.c.current) ?? this.c.scenes[0]; }

  selectScene(id) {
    if (!M.sceneById(this.c, id)) return;
    this.selection.items.clear();
    if (this.studioMode) { this.c.preview = id; this.engine.updateActivity(); this.emit('preview', id); }
    else this.transitionTo(id);
    this.save();
    this.emit('selection');
  }

  /** Switches the program (with the scene's or the current transition). */
  transitionTo(id, options = {}) {
    if (!this.engine.transitionTo(id, options)) return false;
    this.log('info', `scene → ${M.sceneById(this.c, id)?.name}`);
    this.save();
    return true;
  }

  /** Studio mode: preview → program (the Transition button). Options of Settings › General. */
  studioTransition(options = {}) {
    if (!this.studioMode) return false;
    const from = this.c.current;
    let to = this.c.preview;
    const g = this.general ?? {};
    if (g.duplicateScene && to !== from) {
      // "Duplicate scene": the program gets a copy, so editing the preview never shows live.
      const copy = M.duplicateScene(this.c, to, `${M.sceneById(this.c, to).name} (program)`);
      copy.temporary = true;
      to = copy.id;
    }
    this.pendingSwap = g.swapScenes ? from : null;
    return this.transitionTo(to, options);
  }

  afterTransition(tr) {
    // Temporary program copies (duplicate scene) are removed when they leave the program.
    const leaving = M.sceneById(this.c, tr.from);
    if (leaving?.temporary) M.removeScene(this.c, leaving.id);
    if (this.studioMode && this.pendingSwap && M.sceneById(this.c, this.pendingSwap)) { this.c.preview = this.pendingSwap; this.emit('preview', this.c.preview); }
    this.pendingSwap = null;
    this.save();
    this.emit('program', this.c.current);
    this.emit('changed', { label: 'transition' });
  }

  setStudioMode(on) {
    this.studioMode = Boolean(on);
    this.engine.studio = this.studioMode;
    if (on) this.c.preview = this.c.current;
    this.engine.updateActivity();
    this.log('info', `studio mode ${on ? 'on' : 'off'}`);
    this.emit('studio', this.studioMode);
  }

  addScene(name) { return this.change('addScene', (c) => { const s = M.addScene(c, name ?? this.t('scene.default'), { after: this.editScene?.id }); return s; }); }
  duplicateScene(id, name) { return this.change('duplicateScene', (c) => M.duplicateScene(c, id, name)); }
  removeScene(id) { return this.change('removeScene', (c) => M.removeScene(c, id)); }
  renameScene(id, name) { return this.change('renameScene', (c) => M.renameScene(c, id, name)); }
  moveScene(id, to) { return this.change('moveScene', (c) => M.moveScene(c, id, to)); }

  // ───────────────────────── sources and items

  /** A new source of `type` placed in the edited scene (centred; big ones fitted to the canvas). */
  addSource(type, name, settings = {}, { sceneId = this.editScene.id, visible = true } = {}) {
    return this.change('addSource', (c) => {
      if (type === 'scene') return null;
      const src = M.createSource(c, type, name ?? this.t(`src.${type}`), settings);
      const item = M.addItem(c, sceneId, src.id);
      item.visible = visible;
      this.selection.items = new Set([item.id]);
      this.selection.source = src.id;
      return { source: src, item };
    });
  }

  /** "Add existing": the same source (a reference) or a scene, in the edited scene. */
  addExisting(sourceId, { sceneId = this.editScene.id } = {}) {
    return this.change('addExisting', (c) => { const item = M.addItem(c, sceneId, sourceId); if (item) this.selection.items = new Set([item.id]); return item; });
  }

  selectedItems(scene = this.editScene) { return M.allItems(scene).filter((it) => this.selection.items.has(it.id)); }
  select(ids, { add = false } = {}) {
    const next = add ? new Set([...this.selection.items, ...ids]) : new Set(ids);
    this.selection.items = next;
    const first = this.selectedItems()[0];
    this.selection.source = first?.source ?? this.selection.source;
    this.emit('selection');
  }

  removeItems(ids = [...this.selection.items]) {
    return this.change('removeItems', (c) => { const n = M.removeItems(c, this.editScene.id, ids); this.selection.items.clear(); return n; });
  }
  setItem(id, patch, label = 'editItem', coalesce = null) {
    return this.change(label, () => { const hit = M.findItem(this.editScene, id); if (hit) Object.assign(hit.item, typeof patch === 'function' ? patch(hit.item) : patch); }, { coalesce });
  }
  toggleVisible(id, visible = null, sceneId = this.editScene.id) {
    const scene = M.sceneById(this.c, sceneId);
    const hit = M.findItem(scene, id);
    if (!hit) return;
    const next = visible ?? !hit.item.visible;
    if (next === hit.item.visible) return;
    this.change(next ? 'showItem' : 'hideItem', () => { hit.item.visible = next; });
    this.engine.animateItem(hit.item, next);
  }
  orderItem(id, how) { return this.change('orderItem', (c) => M.orderItem(c, this.editScene.id, id, how)); }
  moveItemTo(id, groupId, index) { return this.change('moveItem', (c) => M.moveItemTo(c, this.editScene.id, id, groupId, index)); }
  duplicateItem(id) { return this.change('duplicateItem', (c) => M.duplicateItem(c, this.editScene.id, id)); }
  groupSelected(name) { return this.change('group', (c) => M.groupItems(c, this.editScene.id, [...this.selection.items], name ?? this.t('src.group'))); }
  ungroup(id) { return this.change('ungroup', (c) => M.ungroup(c, this.editScene.id, id)); }

  renameSource(id, name) { return this.change('renameSource', (c) => (c.sources[id] ? M.renameSource(c, id, name) : M.renameScene(c, id, name))); }
  updateSettings(sourceId, patch, coalesce = null) {
    return this.change('properties', (c) => {
      const src = c.sources[sourceId];
      if (!src) return;
      src.settings = normalizeSettings(SOURCE_TYPES[src.type].props, { ...src.settings, ...patch });
    }, { coalesce: coalesce ?? `props:${sourceId}` });
  }
  resetSettings(sourceId) { return this.change('resetProperties', (c) => { const s = c.sources[sourceId]; if (s) s.settings = sourceDefaults(s.type); }); }
  setAudio(sourceId, patch, coalesce = null) {
    const src = this.c.sources[sourceId];
    if (!src?.audio) return;
    this.tweak('audio', () => { Object.assign(src.audio, patch); }, { coalesce: coalesce ?? `audio:${sourceId}:${Object.keys(patch).join()}` });
    this.mixer?.configure(src);
  }

  /** Copy / paste of items (paste: the same source — or "paste (duplicate)": a copy of the source). */
  copyItems() { this.clipboard = { items: this.selectedItems().map((it) => JSON.parse(JSON.stringify(it))) }; return this.clipboard.items.length; }
  pasteItems({ duplicate = false } = {}) {
    const clip = this.clipboard?.items;
    if (!clip?.length) return 0;
    return this.change(duplicate ? 'pasteDuplicate' : 'pasteReference', (c) => {
      const made = [];
      for (const it of clip) {
        let source = it.source;
        if (duplicate && c.sources[source]) {
          const orig = c.sources[source];
          const copy = M.createSource(c, orig.type, `${orig.name}`, orig.settings);
          copy.filters = orig.filters.map((f) => ({ ...JSON.parse(JSON.stringify(f)), id: M.newId('f') }));
          if (orig.audio) copy.audio = { ...orig.audio, tracks: [...orig.audio.tracks] };
          source = copy.id;
        }
        const item = M.addItem(c, this.editScene.id, source, it.transform);
        if (item) { Object.assign(item, { visible: it.visible, blend: it.blend, scaleFilter: it.scaleFilter, show: it.show, hide: it.hide }); made.push(item.id); }
      }
      this.selection.items = new Set(made);
      return made.length;
    });
  }
  copyTransform(id) { const hit = M.findItem(this.editScene, id); if (hit) this.transformClip = JSON.parse(JSON.stringify(hit.item.transform)); return Boolean(hit); }
  pasteTransform(ids = [...this.selection.items]) { if (!this.transformClip) return; this.change('pasteTransform', () => { for (const id of ids) { const hit = M.findItem(this.editScene, id); if (hit) hit.item.transform = JSON.parse(JSON.stringify(this.transformClip)); } }); }

  /** Size of an item's source now (for transform commands). */
  sizeOf(item) {
    if (M.sceneById(this.c, item.source)) return [this.engine.video.baseW, this.engine.video.baseH];
    const g = this.engine.itemGeometry(this.editScene.id).find((x) => x.id === item.id);
    if (g?.w) return [g.w, g.h];
    const rt = this.engine.runtime(item.source);
    return [rt?.width || 1, rt?.height || 1];
  }

  /** Transform menu commands on the selected items. */
  transformSelected(command, arg) {
    const { baseW: W, baseH: H } = this.engine.video;
    this.change(`transform:${command}`, () => {
      for (const it of this.selectedItems()) {
        const [w, h] = this.sizeOf(it);
        const tr = it.transform;
        const fn = {
          fit: () => T.fitToScreen(tr, w, h, W, H), stretch: () => T.stretchToScreen(tr, w, h, W, H), center: () => T.centerOnScreen(tr, w, h, W, H), centerH: () => T.centerOnScreen(tr, w, h, W, H, 'h'), centerV: () => T.centerOnScreen(tr, w, h, W, H, 'v'),
          reset: () => T.resetTransform(tr), flipH: () => T.flipH(tr), flipV: () => T.flipV(tr), rotCW: () => T.rotateBy(tr, 90), rotCCW: () => T.rotateBy(tr, -90), rot180: () => T.rotateBy(tr, 180),
          align: () => T.alignTo(tr, w, h, W, H, arg), nudge: () => ({ ...tr, x: tr.x + arg[0], y: tr.y + arg[1] }),
          boundsFit: () => ({ ...tr, bounds: { ...tr.bounds, type: 'scale_inner', w: W, h: H } }),
        }[command];
        if (fn) it.transform = fn();
      }
    }, { coalesce: command === 'nudge' ? 'nudge' : null });
  }

  // ───────────────────────── filters

  addFilter(sourceId, type, name) { return this.change('addFilter', (c) => M.addFilter(c, sourceId, type, name ?? this.t(`flt.${type}`))); }
  removeFilter(sourceId, filterId) { return this.change('removeFilter', (c) => M.removeFilter(c, sourceId, filterId)); }
  moveFilter(sourceId, filterId, dir) { return this.change('moveFilter', (c) => M.moveFilter(c, sourceId, filterId, dir)); }
  filterOf(sourceId, filterId) { return (this.c.sources[sourceId] ?? M.sceneById(this.c, sourceId))?.filters?.find((f) => f.id === filterId) ?? null; }
  setFilter(sourceId, filterId, patch, coalesce = null) {
    const f = this.filterOf(sourceId, filterId);
    if (!f) return;
    const rewire = 'enabled' in patch || 'sidechain_source' in (patch.settings ?? {});
    this.change('filter', () => {
      if ('enabled' in patch) f.enabled = patch.enabled;
      if ('name' in patch) f.name = patch.name;
      if (patch.settings) f.settings = normalizeSettings(FILTER_TYPES[f.type].props, { ...f.settings, ...patch.settings });
    }, { coalesce: coalesce ?? `filter:${filterId}`, quiet: !rewire });
    // Audio filter settings go to the live node directly (no clicks in the sound).
    if (!rewire && FILTER_TYPES[f.type].kind === 'audio') this.mixer?.updateFilter(sourceId, f);
    this.emit('tweaked', { label: 'filter' });
  }
  copyFilters(sourceId) { this.filterClip = sourceId; }
  pasteFilters(toId) { if (!this.filterClip) return 0; return this.change('pasteFilters', (c) => M.pasteFilters(c, this.filterClip, toId)); }

  // ───────────────────────── transitions

  addTransition(type, name) { return this.change('addTransition', (c) => { const tr = M.addTransition(c, type, name ?? this.t(`trn.${type}`)); c.transition = tr.id; return tr; }); }
  removeTransition(id) { return this.change('removeTransition', (c) => M.removeTransition(c, id)); }
  setTransition(id) { this.change('setTransition', (c) => { if (M.transitionById(c, id)) c.transition = id; }); }
  setDuration(ms) { this.change('duration', (c) => { c.duration = Math.max(50, Math.min(20000, Math.round(ms))); }, { coalesce: 'duration' }); }
  setTransitionSettings(id, patch) { this.change('transitionSettings', (c) => { const tr = M.transitionById(c, id); if (tr) tr.settings = normalizeSettings(TRANSITION_TYPES[tr.type].props, { ...tr.settings, ...patch }); }, { coalesce: `tr:${id}` }); }
  renameTransition(id, name) { this.change('renameTransition', (c) => { const tr = M.transitionById(c, id); if (tr && name.trim()) tr.name = name.trim(); }); }
  addQuick(transitionId, duration) { this.change('addQuick', (c) => { c.quick.push({ id: M.newId('q'), transition: transitionId, duration }); }); }
  removeQuick(id) { this.change('removeQuick', (c) => { c.quick = c.quick.filter((q) => q.id !== id); }); }
  runQuick(id) {
    const q = this.c.quick.find((x) => x.id === id);
    if (!q) return false;
    const tr = M.transitionById(this.c, q.transition);
    if (this.studioMode) return this.studioTransition({ transition: tr, duration: q.duration });
    return false;
  }

  // ───────────────────────── collections

  loadCollectionList() {
    let raw = null;
    try { raw = JSON.parse(this.storage?.getItem(COLLECTIONS_KEY) ?? 'null'); } catch { raw = null; }
    const names = Array.isArray(raw?.names) && raw.names.length ? raw.names.map(String) : ['Untitled'];
    return { names: [...new Set(names)], current: names.includes(raw?.current) ? raw.current : names[0] };
  }
  storeCollectionList() { try { this.storage?.setItem(COLLECTIONS_KEY, JSON.stringify(this.collections)); } catch { /* full */ } }
  readCollection(name) {
    try { const raw = this.storage?.getItem(collectionKey(name)); return raw ? M.normalizeCollection(JSON.parse(raw)) : null; } catch { return null; }
  }
  save() {
    if (this.noSave) return;
    this.c.name = this.collections.current;
    // Temporary program copies (studio mode "duplicate scene") are not kept.
    const kept = { ...this.c, scenes: this.c.scenes.filter((s) => !s.temporary) };
    if (!kept.scenes.some((s) => s.id === kept.current)) kept.current = kept.scenes[0]?.id;
    try { this.storage?.setItem(collectionKey(this.collections.current), JSON.stringify(kept)); } catch (error) { this.log('warning', `save: ${error.message}`); }
  }
  setCollection(c, name) {
    this.collection = this.localize(M.normalizeCollection(c));
    this.collections.current = name;
    if (!this.collections.names.includes(name)) this.collections.names.push(name);
    this.storeCollectionList();
    this.undoStack = []; this.redoStack = [];
    this.selection = { items: new Set(), source: null };
    this.engine?.setCollection(this.collection);
    this.ensureGlobalAudio();
    this.save();
    this.emit('collections');
    this.emit('changed', { label: 'collection' });
  }
  uniqueCollectionName(base) {
    const names = new Set(this.collections.names);
    if (!names.has(base)) return base;
    for (let i = 2; ; i++) if (!names.has(`${base} ${i}`)) return `${base} ${i}`;
  }
  newCollection(name) { const n = this.uniqueCollectionName(name || this.t('collection.untitled')); this.setCollection(M.createCollection(n), n); return n; }
  duplicateCollection(name) { const n = this.uniqueCollectionName(name || `${this.collections.current} ${this.t('common.copySuffix')}`); this.setCollection(JSON.parse(JSON.stringify(this.c)), n); return n; }
  switchCollection(name) { if (!this.collections.names.includes(name)) return false; this.save(); this.setCollection(this.readCollection(name) ?? M.createCollection(name), name); return true; }
  renameCollection(name) {
    const clean = String(name || '').trim();
    if (!clean || this.collections.names.includes(clean)) return false;
    const old = this.collections.current;
    this.storage?.removeItem(collectionKey(old));
    this.collections.names = this.collections.names.map((n) => (n === old ? clean : n));
    this.collections.current = clean;
    this.storeCollectionList();
    this.save();
    this.emit('collections');
    return true;
  }
  removeCollection(name = this.collections.current) {
    if (this.collections.names.length <= 1) return false;
    this.storage?.removeItem(collectionKey(name));
    this.collections.names = this.collections.names.filter((n) => n !== name);
    if (this.collections.current === name) { this.collections.current = this.collections.names[0]; this.setCollection(this.readCollection(this.collections.current) ?? M.createCollection(), this.collections.current); }
    this.storeCollectionList();
    this.emit('collections');
    return true;
  }
  /** Imports one of ours (.mybc / .json) or a scene file in the common layout; returns { name, skipped }. */
  importCollection(text, fallbackName = 'Imported') {
    const json = JSON.parse(text);
    let c; let skipped = [];
    if (isSceneJson(json)) ({ collection: c, skipped } = importSceneJson(json));
    else c = M.normalizeCollection(json);
    const name = this.uniqueCollectionName(c.name || fallbackName);
    this.save();
    this.setCollection(c, name);
    this.log('info', `collection imported: ${name}${skipped.length ? ` (skipped ${skipped.join(', ')})` : ''}`);
    return { name, skipped };
  }
  exportCollection({ sceneJson = false } = {}) { return JSON.stringify(sceneJson ? exportSceneJson(this.c) : { ...this.c, format: 'mybroadcasting' }, null, 2); }
  loadSample(id) { const c = sampleCollection(id, this.t); const name = this.uniqueCollectionName(c.name); this.save(); this.setCollection(c, name); return name; }

  // ───────────────────────── profiles

  saveProfiles() { storeProfiles(this.storage, this.profiles); this.emit('profile'); }
  updateProfile(patch) {
    const p = this.profile;
    const next = normalizeProfile(typeof patch === 'function' ? patch(JSON.parse(JSON.stringify(p))) : { ...p, ...patch });
    this.profiles.list = this.profiles.list.map((x) => (x.name === p.name ? next : x));
    this.profiles.current = next.name;
    this.saveProfiles();
    this.profileChanged(p);
  }
  /** After a profile edit (here or in the settings window): the engine follows. */
  profileChanged(before = null) {
    const p = this.profile;
    const v = videoOf(p);
    const ev = this.engine?.video;
    if (ev && (ev.baseW !== v.baseW || ev.baseH !== v.baseH || ev.outW !== v.outW || ev.outH !== v.outH || ev.fps !== v.fps || ev.downscale !== v.downscale)) {
      if (this.isLive) this.log('warning', 'video settings change while an output runs: they apply to the next start');
      else this.engine.setVideo(v);
    }
    if (!before || JSON.stringify(before.audio.devices) !== JSON.stringify(p.audio.devices)) this.ensureGlobalAudio();
    if (before && before.audio.monitorDevice !== p.audio.monitorDevice) this.mixer?.setMonitorDevice(p.audio.monitorDevice);
    this.emit('profile');
  }
  reloadProfiles() { const before = this.profile; this.profiles = loadProfiles(this.storage); this.profileChanged(before); }
  newProfile(name, { copy = false } = {}) {
    const n = uniqueProfileName(this.profiles, name || this.t('profile.untitled'));
    const p = normalizeProfile(copy ? { ...JSON.parse(JSON.stringify(this.profile)), name: n } : { name: n });
    this.profiles.list.push(p);
    this.profiles.current = n;
    this.saveProfiles();
    this.profileChanged();
    return n;
  }
  switchProfile(name) { if (!this.profiles.list.some((p) => p.name === name) || this.isLive) return false; const before = this.profile; this.profiles.current = name; this.saveProfiles(); this.profileChanged(before); return true; }
  renameProfile(name) {
    const clean = String(name || '').trim();
    if (!clean || this.profiles.list.some((p) => p.name === clean)) return false;
    this.profile.name = clean;
    this.profiles.current = clean;
    this.saveProfiles();
    return true;
  }
  removeProfile() {
    if (this.profiles.list.length <= 1 || this.isLive) return false;
    this.profiles.list = this.profiles.list.filter((p) => p.name !== this.profiles.current);
    this.profiles.current = this.profiles.list[0].name;
    this.saveProfiles();
    this.profileChanged();
    return true;
  }
  importProfile(text) { const p = normalizeProfile(JSON.parse(text)); p.name = uniqueProfileName(this.profiles, p.name); this.profiles.list.push(p); this.profiles.current = p.name; this.saveProfiles(); this.profileChanged(); return p.name; }
  exportProfile() { return JSON.stringify({ ...this.profile, format: 'mybroadcasting-profile' }, null, 2); }

  // ───────────────────────── hotkeys

  get hotkeyBindings() { return pruneBindings(this.profile.hotkeys, this.c); }
  bindHotkey(action, combos) { this.updateProfile((p) => { p.hotkeys = { ...p.hotkeys, [action]: combos.filter(Boolean) }; if (!p.hotkeys[action].length) delete p.hotkeys[action]; return p; }); }
  keyMap() { return keyMap(this.hotkeyBindings); }

  /** Runs a hotkey action; `pressed` false is the key's release (push-to-talk). */
  runAction(action, pressed = true) {
    const [kind, a, b, c] = action.split(':');
    if (kind === 'source') {
      const src = this.c.sources[a];
      if (!src) return false;
      if (b === 'ptt' || b === 'ptm') { this.mixer?.push(b, src, pressed); return true; }
      if (!pressed) return false;
      if (b === 'mute' || b === 'unmute') { this.setAudio(a, { muted: b === 'mute' }); this.emit('changed', { label: 'mute' }); return true; }
      this.engine.runtime(a)?.control(b);
      return true;
    }
    if (!pressed) return false;
    if (kind === 'scene') { this.selectScene(a); return true; }
    if (kind === 'item') { const scene = M.sceneById(this.c, a); if (!scene) return false; this.toggleVisible(b, c === 'show', a); return true; }
    if (kind === 'quick') return this.runQuick(a);
    this.emit('action', action); // general actions: the app runs them (they may ask first)
    return true;
  }

  // ───────────────────────── outputs

  get isLive() { return Boolean(this.outputs.stream || this.outputs.recording || this.outputs.replay); }

  /** One encoder per distinct configuration (recording and stream share one when the settings match). */
  async videoHub(cfg) {
    const key = JSON.stringify(cfg);
    let entry = this.hubs.get(key);
    if (!entry) {
      entry = { hub: new VideoEncoderHub(this.engine, cfg), users: 0, key };
      await entry.hub.start();
      this.hubs.set(key, entry);
    }
    entry.users++;
    return entry.hub;
  }
  async audioHub(track, cfg) {
    const key = JSON.stringify({ track, cfg });
    let entry = this.hubs.get(key);
    if (!entry) {
      await this.startAudio();
      entry = { hub: new AudioEncoderHub(this.mixer, track, cfg), users: 0, key };
      await entry.hub.start(performance.now());
      this.hubs.set(key, entry);
    }
    entry.users++;
    return entry.hub;
  }
  async releaseHub(hub) {
    for (const [key, entry] of this.hubs) if (entry.hub === hub && --entry.users <= 0) { this.hubs.delete(key); await hub.stop(); }
  }

  /** A codec the browser can encode: the wanted one, else the first that works (logged). */
  async pickVideo(cfg, container) {
    const allowed = container ? CONTAINER_CODECS[container]?.video ?? ['avc'] : ['avc', 'hevc', 'av1', 'vp9', 'vp8'];
    const order = [cfg.codec, ...['avc', 'vp9', 'av1', 'hevc', 'vp8'].filter((c) => c !== cfg.codec)].filter((c) => allowed.includes(c));
    for (const codec of order) {
      for (const hardware of [cfg.hardware, 'no-preference']) {
        const tryCfg = { ...cfg, codec, hardware };
        if (await VideoEncoderHub.supported(tryCfg)) { if (codec !== cfg.codec) this.log('warning', `encoder ${cfg.codec} unavailable, using ${codec}`); return tryCfg; }
      }
    }
    throw new Error(this.t('error.noEncoder'));
  }
  async pickAudio(cfg, container) {
    const allowed = container ? CONTAINER_CODECS[container]?.audio ?? ['aac'] : ['aac', 'opus'];
    for (const codec of [cfg.codec, ...['aac', 'opus'].filter((c) => c !== cfg.codec)].filter((c) => allowed.includes(c))) {
      if (await AudioEncoderHub.supported({ ...cfg, codec })) return { ...cfg, codec };
    }
    return null;
  }

  async recordingFolder(path) {
    if (path) return path;
    return (await this.platform.defaultRecordingFolder()) || '';
  }

  async startRecording() {
    if (this.outputs.recording) return false;
    const p = this.profile;
    const enc = encodersOf(p);
    const container = enc.container;
    const vcfg = await this.pickVideo(enc.record, container);
    const acfg = await this.pickAudio(enc.audio.record, container);
    const video = await this.videoHub(vcfg);
    const audios = new Map();
    if (acfg) for (const track of enc.tracks) audios.set(track - 1, await this.audioHub(track - 1, acfg));
    const folder = await this.recordingFolder(enc.path);
    const existing = new Set(this.profile.advanced.overwrite ? [] : await this.platform.listNames(folder));
    const ext = container === 'fmp4' ? 'mp4' : container;
    const base = formatFileName(p.advanced.filenameFormat, new Date(), { fps: vcfg.fps, cres: p.video.base, ores: p.video.output, vf: ext });
    const files = this.platform.fileSinks(folder, { onDownload: (name) => this.log('info', `downloaded ${name}`) });
    const rec = new Recording({
      video, audios, files,
      cfg: { container, videoCodec: vcfg.codec, audioCodec: acfg?.codec ?? 'opus', tracks: acfg ? [...audios.keys()] : [], trackNames: [...audios.keys()].map((i) => p.audio.trackNames[i] || `Track ${i + 1}`), fps: vcfg.fps, split: enc.split, name: (i) => { const n = uniqueFile(i ? `${base} (${i + 1})` : base, ext, existing); existing.add(n); return n; } },
      emit: (event, data) => this.onRecordingEvent(event, data),
    });
    rec.hubs = [video, ...audios.values()];
    this.outputs.recording = rec;
    try { await rec.start(); } catch (error) { this.outputs.recording = null; for (const h of rec.hubs) await this.releaseHub(h); throw error; }
    this.outputs.recordStarted = Date.now();
    this.log('info', `recording started: ${rec.part.path} (${vcfg.codec} ${vcfg.bitrate} kbps ${vcfg.rateControl}, ${container})`);
    this.emit('outputs');
    return true;
  }
  onRecordingEvent(event, data) {
    if (event === 'file') { this.log('info', `recording file: ${data.path} (${(data.bytes / 1048576).toFixed(1)} MB, ${data.duration.toFixed(1)} s)`); this.lastRecording = data; this.afterRecordingFile(data); }
    else if (event === 'error') this.log('error', `recording: ${data?.message ?? data}`);
    else if (event === 'split') this.log('info', `recording split → ${data.path}`);
    else if (event === 'chapter') this.log('info', `chapter "${data.name}" at ${(data.time / 1000).toFixed(1)} s`);
    this.emit('outputs');
  }
  /** Automatic remux (Advanced) and chapters into the file, when FFmpeg is there (desktop). */
  async afterRecordingFile(info) {
    const adv = this.profile.advanced;
    const wantsRemux = adv.autoRemux && !info.path.toLowerCase().endsWith(`.${adv.remuxFormat}`);
    if (!wantsRemux && !info.chapters?.length) return;
    if (!(await this.platform.findFfmpeg(adv.ffmpegPath))) return;
    const target = wantsRemux ? info.path.replace(/\.[^.\\/]+$/, `.${adv.remuxFormat}`) : info.path.replace(/(\.[^.\\/]+)$/, '.chapters$1');
    let meta = null;
    if (info.chapters?.length) { meta = info.path.replace(/\.[^.\\/]+$/, '.ffmeta.txt'); await this.platform.fileSinks('').writeText?.(meta, ffmetadata(info.chapters, info.duration * 1000)).catch(() => { meta = null; }); }
    try { await this.platform.remux(info.path, target, { ffmpeg: adv.ffmpegPath, metadata: meta }); this.log('info', `remuxed → ${target}`); this.emit('remuxed', { from: info.path, to: target }); } catch (error) { this.log('error', `remux: ${error.message ?? error}`); }
  }
  async stopRecording() {
    const rec = this.outputs.recording;
    if (!rec) return null;
    this.outputs.recording = null;
    const paths = await rec.stop();
    for (const h of rec.hubs) await this.releaseHub(h);
    this.log('info', `recording stopped (${formatSeconds((Date.now() - this.outputs.recordStarted) / 1000)})`);
    this.emit('outputs');
    return paths;
  }
  pauseRecording() { const r = this.outputs.recording; const ok = r?.pause(); if (ok) this.log('info', 'recording paused'); this.emit('outputs'); return ok; }
  resumeRecording() { const r = this.outputs.recording; const ok = r?.resume(); if (ok) this.log('info', 'recording resumed'); this.emit('outputs'); return ok; }
  splitRecording() { this.outputs.recording?.split(); }
  addChapter(name) { return this.outputs.recording?.addChapter(name) ?? null; }

  /** The stream target from the profile: { url, protocol, service, problems }. */
  streamTarget() {
    const s = this.profile.stream;
    const enc = encodersOf(this.profile);
    const check = checkStream({ ...s, videoBitrate: enc.stream.bitrate, audioBitrate: enc.audio.stream.bitrate });
    const service = serviceById(s.service);
    const url = check.protocol === 'direct' ? '' : check.protocol === 'whip' ? check.server : ingestUrl(check.server, s.key, { bandwidthTest: s.bandwidthTest, service: service.id });
    return { ...check, url, service };
  }

  async startStream() {
    if (this.outputs.stream) return false;
    const target = this.streamTarget();
    const blocking = target.problems.filter((x) => ['noServer', 'badServer', 'noKey'].includes(x));
    if (blocking.length) throw Object.assign(new Error(this.t(`stream.problem.${blocking[0]}`)), { code: blocking[0] });
    const p = this.profile;
    const enc = encodersOf(p);
    const adv = p.advanced;
    if (target.protocol === 'direct') {
      await this.startAudio();
      const d = p.stream.direct;
      const fps = this.engine.video.fps;
      const stream = new MediaStream([...this.engine.canvas.captureStream(fps).getVideoTracks(), ...(this.mixer.trackStream(enc.streamTrack - 1)?.getAudioTracks() ?? [])]);
      const out = new ViewerHost({ transport: this.platform.viewerTransport({ port: d.port, server: d.server, log: (line) => this.log('warning', line) }), stream, title: d.title || this.c.name, code: d.code, maxViewers: d.maxViewers, iceServers: parseIceServers(d.stun), videoBitrate: enc.stream.bitrate, fps, codec: enc.stream.codec, emit: (e, data) => this.onViewerEvent(e, data) });
      out.ownTracks = stream.getVideoTracks();
      this.outputs.stream = out;
      try { await out.start(); } catch (error) {
        this.outputs.stream = null;
        out.ownTracks.forEach((track) => track.stop());
        if (error?.code === 'viewers-unreachable') throw Object.assign(new Error(this.t('direct.unreachable')), { code: error.code });
        if (/port-in-use/.test(String(error?.message ?? error))) throw Object.assign(new Error(this.t('direct.portInUse', { port: d.port })), { code: 'port-in-use' });
        throw error;
      }
    } else if (target.protocol === 'whip') {
      await this.startAudio();
      const out = new WhipOutput({ canvas: this.engine.canvas, audioStream: this.mixer.trackStream(enc.streamTrack - 1), fps: this.engine.video.fps, url: target.url, token: p.stream.whipToken || p.stream.key, videoBitrate: enc.stream.bitrate, audioBitrate: enc.audio.stream.bitrate, codec: enc.stream.codec, emit: (e, d) => this.onStreamEvent(e, d) });
      this.outputs.stream = out;
      try { await out.start(); } catch (error) { this.outputs.stream = null; throw error; }
    } else {
      const vcfg = await this.pickVideo(enc.stream, 'mkv');
      const acfg = await this.pickAudio(enc.audio.stream, 'mkv');
      const video = await this.videoHub(vcfg);
      const audios = new Map(acfg ? [[enc.streamTrack - 1, await this.audioHub(enc.streamTrack - 1, acfg)]] : []);
      const transport = this.platform.streamTransport({ ffmpeg: adv.ffmpegPath, relay: p.stream.relay, audioCodec: acfg?.codec ?? 'aac', onLog: (line) => { if (!/^(frame|fps|stream_|bitrate|total_size|out_time|dup_frames|drop_frames|speed|progress)=/.test(line)) this.log('ffmpeg', line); } });
      const out = new StreamOutput({ video, audios, transport, cfg: { url: target.url, videoCodec: vcfg.codec, audioCodec: acfg?.codec ?? 'aac', tracks: [...audios.keys()], fps: vcfg.fps, delay: adv.delay.enabled ? adv.delay.seconds : 0, preserveCutoff: adv.delay.preserve, reconnect: adv.reconnect }, emit: (e, d) => this.onStreamEvent(e, d) });
      out.hubs = [video, ...audios.values()];
      this.outputs.stream = out;
      try { await out.start(); } catch (error) { this.outputs.stream = null; for (const h of out.hubs) await this.releaseHub(h); throw error; }
    }
    this.outputs.streamStarted = Date.now();
    this.log('info', `stream started: ${target.service.name} (${target.protocol})${adv.delay.enabled ? `, delay ${adv.delay.seconds} s` : ''}`);
    this.emit('outputs');
    return true;
  }
  /** Direct viewing: addresses when it starts, viewers coming and going. */
  onViewerEvent(event, data) {
    if (event === 'started') this.log('info', `direct viewing on port ${data.port}: ${data.urls.join('  ')}`);
    else if (event === 'viewer' && data.joined != null) this.log('info', `viewer ${data.joined ? 'joined' : 'left'} (${data.watching} watching)`);
    else if (event === 'log') this.log('warning', data);
    this.emit('outputs');
  }
  onStreamEvent(event, data) {
    if (event === 'reconnecting') this.log('warning', `stream reconnecting (${data.attempt}/${data.of}) in ${data.delay} s`);
    else if (event === 'reconnected') this.log('info', 'stream reconnected');
    else if (event === 'error') { this.log('error', `stream: ${data?.message ?? data}`); this.emit('error', data); this.stopStream(); }
    this.emit('outputs');
  }
  async stopStream() {
    const out = this.outputs.stream;
    if (!out) return false;
    this.outputs.stream = null;
    await out.stop();
    out.ownTracks?.forEach((track) => track.stop());
    for (const h of out.hubs ?? []) await this.releaseHub(h);
    this.log('info', `stream stopped (${formatSeconds((Date.now() - this.outputs.streamStarted) / 1000)})`);
    this.emit('outputs');
    return true;
  }

  async startReplay() {
    if (this.outputs.replay) return false;
    const p = this.profile;
    const enc = encodersOf(p);
    const container = enc.container === 'webm' ? 'webm' : 'mp4';
    const vcfg = await this.pickVideo(enc.record, container);
    const acfg = await this.pickAudio(enc.audio.record, container);
    const video = await this.videoHub(vcfg);
    const audios = new Map();
    if (acfg) for (const track of enc.tracks) audios.set(track - 1, await this.audioHub(track - 1, acfg));
    const rb = new ReplayBuffer({ video, audios, cfg: { seconds: enc.replay.seconds, maxMB: enc.replay.maxMB, container, videoCodec: vcfg.codec, audioCodec: acfg?.codec ?? 'opus', fps: vcfg.fps }, emit: () => this.emit('outputs') });
    rb.hubs = [video, ...audios.values()];
    rb.ext = container;
    rb.start();
    this.outputs.replay = rb;
    this.log('info', `replay buffer started (${enc.replay.seconds} s, ${enc.replay.maxMB} MB)`);
    this.emit('outputs');
    return true;
  }
  async saveReplay() {
    const rb = this.outputs.replay;
    if (!rb) return null;
    const file = await rb.save();
    if (!file) return null;
    const p = this.profile;
    const enc = encodersOf(p);
    const folder = await this.recordingFolder(enc.path);
    const name = `${p.advanced.replayPrefix ? `${p.advanced.replayPrefix} ` : ''}${formatFileName(p.advanced.filenameFormat)}${p.advanced.replaySuffix ? ` ${p.advanced.replaySuffix}` : ''}.${rb.ext}`;
    const path = await this.platform.saveBytes(P.joinPath(folder, name), file.bytes, rb.ext === 'webm' ? 'video/webm' : 'video/mp4');
    this.log('info', `replay saved: ${path} (${file.seconds.toFixed(1)} s)`);
    this.emit('replay-saved', { path, seconds: file.seconds });
    return path;
  }
  async stopReplay() {
    const rb = this.outputs.replay;
    if (!rb) return false;
    this.outputs.replay = null;
    rb.stop();
    for (const h of rb.hubs) await this.releaseHub(h);
    this.log('info', 'replay buffer stopped');
    this.emit('outputs');
    return true;
  }

  /** The virtual camera: the clean program in its own window other programs can capture. */
/**
   * The virtual camera. `device`: the installed camera device (Windows) gets the program as JPEG frames at
   * the output size (at most 1920×1080, sides a multiple of 4); otherwise a window shows it (other
   * programs share that window).
   */
  async startVirtualCam({ device = false } = {}) {
    if (device) {
      const v = this.engine.video;
      const scale = Math.min(1, 1920 / v.outW, 1080 / v.outH);
      const w = Math.max(4, Math.round((v.outW * scale) / 4) * 4);
      const h = Math.max(4, Math.round((v.outH * scale) / 4) * 4);
      await this.platform.vcamDevice.start(w, h);
      const canvas = new OffscreenCanvas(w, h);
      const ctx = canvas.getContext('2d');
      const every = 1000 / Math.min(30, v.fps || 30);
      let busy = false;
      let last = 0;
      this.vcamDevice = { w, h, frames: 0, watching: false };
      this.vcamOff = this.engine.onFrame((gl, now) => {
        if (busy || now - last < every - 2) return;
        busy = true;
        last = now;
        ctx.drawImage(gl, 0, 0, w, h);
        canvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 })
          .then((blob) => blob.arrayBuffer())
          .then((buffer) => this.platform.vcamDevice.frame(new Uint8Array(buffer)))
          .then((watching) => { if (this.vcamDevice) { this.vcamDevice.frames++; this.vcamDevice.watching = watching; } })
          .catch((error) => this.log('warning', `virtual camera: ${error?.message ?? error}`))
          .finally(() => { busy = false; });
      });
    } else {
      await this.platform.openProjector({ label: 'projector-vcam', query: 'program&vcam=1', title: this.t('vcam.title') });
    }
    this.outputs.vcam = device ? 'device' : 'window';
    this.log('info', `virtual camera started (${device ? 'device' : 'window'})`);
    this.emit('outputs');
  }
  stopVirtualCam() {
    if (this.outputs.vcam === 'device') { this.vcamOff?.(); this.vcamOff = null; this.vcamDevice = null; this.platform.vcamDevice.stop(); } else this.projectors?.closeAll();
    this.outputs.vcam = false;
    this.log('info', 'virtual camera stopped');
    this.emit('outputs');
  }

  /** Screenshot of 'program' | 'preview' | 'scene:<id>' | 'source:<id>' as a PNG file. */
  async screenshot(which = 'program') {
    const blob = await this.engine.screenshot(which);
    if (!blob) return null;
    const folder = await this.recordingFolder(encodersOf(this.profile).path);
    const path = P.joinPath(folder, `Screenshot ${formatFileName(this.profile.advanced.filenameFormat)}.png`);
    const saved = await this.platform.saveBytes(path, new Uint8Array(await blob.arrayBuffer()), 'image/png');
    this.log('info', `screenshot: ${saved}`);
    return saved;
  }

  /** A projector window asks for its picture. */
  projectorStream(which) {
    if (which === 'program') return this.engine.canvas.captureStream(this.engine.video.fps);
    const canvas = document.createElement('canvas');
    canvas.width = which === 'multiview' ? 1920 : this.engine.video.baseW;
    canvas.height = which === 'multiview' ? 1080 : this.engine.video.baseH;
    this.engine.addDisplay(`projector:${which}:${Math.random()}`, canvas, which, { labels: { preview: this.t('studio.preview'), program: this.t('studio.program') } });
    return canvas.captureStream(this.engine.video.fps);
  }

  /** Numbers for the stats window and the status bar. */
  stats() {
    const e = this.engine;
    const st = this.outputs.stream;
    const rec = this.outputs.recording;
    const hubs = [...this.hubs.values()].map((x) => x.hub).filter((h) => h instanceof VideoEncoderHub);
    return {
      fps: e.stats.fps, target: e.video.fps, renderMs: e.stats.renderMs, lagged: e.stats.lagged, frames: e.stats.frames,
      encoded: hubs.reduce((n, h) => n + h.encoded, 0), skipped: hubs.reduce((n, h) => n + h.dropped, 0), skippedFrames: e.stats.skipped,
      stream: st ? { state: st.state, kbps: st.kbps ?? 0, bytes: st.sent ?? 0, dropped: (st.dropped ?? 0) + (st.conn?.dropped ?? 0), seconds: (Date.now() - this.outputs.streamStarted) / 1000, viewers: st.watching ?? null, urls: st.urls ?? null } : null,
      recording: rec ? { state: rec.state, bytes: rec.bytes, seconds: rec.duration, path: rec.part?.path, paused: rec.paused } : null,
      replay: this.outputs.replay ? { seconds: this.outputs.replay.seconds, bytes: this.outputs.replay.bytes } : null,
      vcam: this.outputs.vcam,
      sources: Object.keys(this.c.sources).length, scenes: this.c.scenes.length,
    };
  }
  resetStats() { const s = this.engine.stats; s.lagged = 0; s.skipped = 0; s.frames = 0; for (const { hub } of this.hubs.values()) if (hub instanceof VideoEncoderHub) { hub.dropped = 0; hub.encoded = 0; } }

  async stopAll() {
    await this.stopStream().catch(() => {});
    await this.stopRecording().catch(() => {});
    await this.stopReplay().catch(() => {});
  }
}

export function formatSeconds(s) {
  const t = Math.max(0, Math.floor(s));
  return `${String(Math.floor(t / 3600)).padStart(2, '0')}:${String(Math.floor((t % 3600) / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}
