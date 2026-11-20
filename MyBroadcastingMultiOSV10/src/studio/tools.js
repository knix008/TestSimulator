// Tools (the Tools menu): the output timer, the automatic scene switcher (rules on the window in front,
// a timed rotation), scripts (JavaScript with a small API) and captions (the platform's speech
// recognition writing into a text source). Their settings are kept in localStorage.
import * as M from '../bc/model.js';

export const TOOLS_KEY = 'mybroadcasting.tools.v1';

export function defaultTools() {
  return {
    timer: { stream: { enabled: false, h: 0, m: 30, s: 0 }, record: { enabled: false, h: 0, m: 30, s: 0 }, autoStart: false },
    switcher: { enabled: false, interval: 300, rules: [], noMatch: 'none', noMatchScene: '', rotation: { enabled: false, items: [] } },
    scripts: [],
    captions: { enabled: false, language: 'ko-KR', source: 'Captions', lines: 2 },
  };
}
export function loadTools(storage) {
  let raw = null;
  try { raw = JSON.parse(storage?.getItem(TOOLS_KEY) ?? 'null'); } catch { raw = null; }
  const d = defaultTools();
  const r = raw ?? {};
  return {
    timer: { stream: { ...d.timer.stream, ...r.timer?.stream }, record: { ...d.timer.record, ...r.timer?.record }, autoStart: Boolean(r.timer?.autoStart) },
    switcher: { ...d.switcher, ...r.switcher, rules: Array.isArray(r.switcher?.rules) ? r.switcher.rules : [], rotation: { ...d.switcher.rotation, ...r.switcher?.rotation, items: Array.isArray(r.switcher?.rotation?.items) ? r.switcher.rotation.items : [] } },
    scripts: Array.isArray(r.scripts) ? r.scripts.map((x) => ({ name: String(x.name ?? 'script'), code: String(x.code ?? ''), enabled: Boolean(x.enabled) })) : [],
    captions: { ...d.captions, ...r.captions },
  };
}
export const storeTools = (storage, tools) => { try { storage?.setItem(TOOLS_KEY, JSON.stringify(tools)); } catch { /* full */ } };

const ms = (x) => ((x.h || 0) * 3600 + (x.m || 0) * 60 + (x.s || 0)) * 1000;

/** The scene a switcher rule set picks for a window title (null: no change). Pure — tested. */
export function switcherPick(sw, title, scenes) {
  for (const rule of sw.rules) {
    if (!rule.window || !rule.scene) continue;
    const hit = rule.regex ? safeRegex(rule.window)?.test(title) : String(title).toLowerCase().includes(String(rule.window).toLowerCase());
    if (hit && scenes.some((s) => s.name === rule.scene)) return rule.scene;
  }
  if (sw.noMatch === 'switch' && scenes.some((s) => s.name === sw.noMatchScene)) return sw.noMatchScene;
  return null;
}
const safeRegex = (text) => { try { return new RegExp(text, 'i'); } catch { return null; } };

export class Tools {
  constructor(studio, { storage = globalThis.localStorage, platform, run, notify }) {
    this.studio = studio;
    this.storage = storage;
    this.platform = platform;
    this.run = run; // runs an app command (stopStream / stopRecording …)
    this.notify = notify;
    this.settings = loadTools(storage);
    this.timers = { stream: null, record: null };
    this.scripts = new Map();
    studio.on('outputs', () => this.followOutputs());
  }
  save() { storeTools(this.storage, this.settings); }
  update(patch) { this.settings = { ...this.settings, ...patch }; this.save(); this.apply(); }
  apply() { this.applySwitcher(); this.applyScripts(); this.applyCaptions(); }

  // ───────────────────────── output timer

  /** Starts a countdown that stops the stream / recording ('stream' | 'record'). */
  startTimer(kind) {
    const cfg = this.settings.timer[kind];
    this.stopTimer(kind);
    const total = ms(cfg);
    if (!total) return false;
    const end = Date.now() + total;
    this.timers[kind] = { end, timeout: setTimeout(() => { this.timers[kind] = null; this.run(kind === 'stream' ? 'stopStream' : 'stopRecording'); this.notify('info', kind); }, total) };
    return true;
  }
  stopTimer(kind) { if (this.timers[kind]) clearTimeout(this.timers[kind].timeout); this.timers[kind] = null; }
  remaining(kind) { const tm = this.timers[kind]; return tm ? Math.max(0, tm.end - Date.now()) : null; }
  followOutputs() {
    const o = this.studio.outputs;
    for (const [kind, live] of [['stream', Boolean(o.stream)], ['record', Boolean(o.recording)]]) {
      if (live && !this.timers[kind] && this.settings.timer.autoStart && this.settings.timer[kind].enabled) this.startTimer(kind);
      if (!live && this.timers[kind]) this.stopTimer(kind);
    }
  }

  // ───────────────────────── automatic scene switcher

  applySwitcher() {
    clearInterval(this.switchTimer);
    const sw = this.settings.switcher;
    if (!sw.enabled) return;
    let rotIndex = 0;
    let rotAt = Date.now();
    this.switchTimer = setInterval(async () => {
      const c = this.studio.c;
      const rot = sw.rotation;
      if (rot.enabled && rot.items.length) {
        const item = rot.items[rotIndex % rot.items.length];
        if (Date.now() - rotAt >= (item.seconds || 10) * 1000) {
          rotIndex = (rotIndex + 1) % rot.items.length;
          rotAt = Date.now();
          const next = c.scenes.find((s) => s.name === rot.items[rotIndex].scene);
          if (next && next.id !== c.current) this.studio.transitionTo(next.id);
        }
        return;
      }
      const title = await this.platform.foregroundTitle();
      const name = switcherPick(sw, title, c.scenes);
      const scene = name && c.scenes.find((s) => s.name === name);
      if (scene && scene.id !== c.current && !this.studio.engine.transition) this.studio.transitionTo(scene.id);
    }, Math.max(50, sw.interval || 300));
  }

  // ───────────────────────── scripts

  /** The API a script sees as `bc`. */
  api(name) {
    const studio = this.studio;
    const off = [];
    const timers = [];
    const find = (n) => Object.values(studio.c.sources).find((s) => s.name === n) ?? null;
    const sceneNamed = (n) => studio.c.scenes.find((s) => s.name === n) ?? null;
    const api = {
      log: (...args) => studio.log('info', `[${name}] ${args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')}`),
      scenes: () => studio.c.scenes.map((s) => s.name),
      sources: () => Object.values(studio.c.sources).map((s) => ({ name: s.name, type: s.type })),
      currentScene: () => M.sceneById(studio.c, studio.c.current)?.name ?? null,
      setScene: (n) => { const s = sceneNamed(n); if (s) studio.transitionTo(s.id); return Boolean(s); },
      setVisible: (sceneName, sourceName, visible) => { const s = sceneNamed(sceneName); const src = find(sourceName); const it = s && src && M.allItems(s).find((x) => x.source === src.id); if (it) studio.toggleVisible(it.id, Boolean(visible), s.id); return Boolean(it); },
      setText: (sourceName, text) => { const src = find(sourceName); if (src?.type === 'text_gdiplus') studio.updateSettings(src.id, { text: String(text) }, `script:${src.id}`); return Boolean(src); },
      setVolume: (sourceName, mul) => { const src = find(sourceName); if (src?.audio) studio.setAudio(src.id, { volume: Math.max(0, Math.min(20, Number(mul))) }); return Boolean(src?.audio); },
      setMuted: (sourceName, muted) => { const src = find(sourceName); if (src?.audio) studio.setAudio(src.id, { muted: Boolean(muted) }); return Boolean(src?.audio); },
      command: (id) => this.run(id),
      on: (event, fn) => { off.push(studio.on(event, (data) => { try { fn(data); } catch (error) { studio.log('error', `[${name}] ${error.message}`); } })); },
      every: (msec, fn) => { timers.push(setInterval(() => { try { fn(); } catch (error) { studio.log('error', `[${name}] ${error.message}`); } }, Math.max(50, msec))); },
      after: (msec, fn) => { timers.push(setTimeout(() => { try { fn(); } catch (error) { studio.log('error', `[${name}] ${error.message}`); } }, Math.max(0, msec))); },
    };
    return { api, cleanup: () => { off.forEach((f) => f()); timers.forEach((x) => { clearInterval(x); clearTimeout(x); }); } };
  }

  /** Runs enabled scripts (each in its own function; it may return a cleanup function). */
  applyScripts() {
    for (const [, s] of this.scripts) s.cleanup();
    this.scripts.clear();
    for (const script of this.settings.scripts) {
      if (!script.enabled || !script.code.trim()) continue;
      const { api, cleanup } = this.api(script.name);
      try {
        // eslint-disable-next-line no-new-func
        const ret = new Function('bc', `"use strict";\n${script.code}`)(api);
        this.scripts.set(script.name, { cleanup: () => { cleanup(); if (typeof ret === 'function') try { ret(); } catch { /* script's own */ } } });
        this.studio.log('info', `script "${script.name}" loaded`);
      } catch (error) {
        cleanup();
        this.studio.log('error', `script "${script.name}": ${error.message}`);
      }
    }
  }

  // ───────────────────────── captions

  get captionsAvailable() { return Boolean(globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition); }

  applyCaptions() {
    const cfg = this.settings.captions;
    this.recognition?.stop();
    this.recognition = null;
    if (!cfg.enabled) return;
    const Rec = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;
    if (!Rec) { this.studio.log('warning', 'captions: speech recognition is not available in this engine'); return; }
    const rec = new Rec();
    rec.lang = cfg.language;
    rec.continuous = true;
    rec.interimResults = true;
    const lines = [];
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) { lines.push(r[0].transcript.trim()); while (lines.length > cfg.lines) lines.shift(); } else interim += r[0].transcript;
      }
      this.writeCaption([...lines, interim.trim()].filter(Boolean).slice(-cfg.lines).join('\n'));
    };
    rec.onend = () => { if (this.recognition === rec) rec.start(); };
    rec.onerror = (e) => this.studio.log('warning', `captions: ${e.error}`);
    rec.start();
    this.recognition = rec;
  }
  writeCaption(text) {
    const name = this.settings.captions.source || 'Captions';
    let src = Object.values(this.studio.c.sources).find((s) => s.name === name && s.type === 'text_gdiplus');
    if (!src) {
      const made = this.studio.addSource('text_gdiplus', name, { text, font: { face: 'Arial', size: 48, bold: true }, outline: true, bk_opacity: 60, align: 'center' });
      src = made?.source;
      const item = made?.item;
      if (item) this.studio.setItem(item.id, (it) => ({ transform: { ...it.transform, x: this.studio.engine.video.baseW / 2, y: this.studio.engine.video.baseH - 60, align: 'bottom' } }));
    }
    if (src) this.studio.updateSettings(src.id, { text }, 'captions');
  }

  dispose() { clearInterval(this.switchTimer); for (const [, s] of this.scripts) s.cleanup(); this.recognition?.stop(); this.stopTimer('stream'); this.stopTimer('record'); }
}
