// The audio mixer (in Web Audio):
//
//   source → sync offset (delay) → audio filters (in order) → volume → balance → mono → mute · PTT · activity
//          → meter (post-fader peak / RMS per channel) → tracks 1…6 → encoders (tap) and track 1 → stream
//                                                     → monitoring (headphones), as the source's monitor type says
//
// Sources: MediaStreams (captures, camera, microphone) and media elements (files). Only sources in the
// program (or global sources) reach the tracks; during a transition both scenes are heard.
import { FILTER_TYPES, SOURCE_TYPES } from '../catalog.js';
import { TRACKS } from '../model.js';
import { WORKLET_SOURCE, dbToMul } from './worklets.js';

/** The volume slider: 0…1 position → multiplier (cubic, -∞ at 0, 0 dB at 1). */
export const faderToMul = (pos) => Math.max(0, Math.min(1, pos)) ** 3;
export const mulToFader = (mul) => Math.max(0, Math.min(1, Math.cbrt(Math.max(0, mul))));
export const mulToDb = (m) => (m <= 0 ? -Infinity : 20 * Math.log10(m));
export const dbToFader = (db) => mulToFader(dbToMul(db));

/** Peak and RMS (dB) of interleaved or planar samples (tests use this too). */
export function levels(samples) {
  let peak = 0; let sum = 0;
  for (let i = 0; i < samples.length; i++) { const v = Math.abs(samples[i]); if (v > peak) peak = v; sum += v * v; }
  const rms = Math.sqrt(sum / Math.max(1, samples.length));
  return { peak: mulToDb(peak), rms: mulToDb(rms) };
}

export class AudioMixer {
  constructor({ sampleRate = 48000, channels = 2, onEvent = () => {} } = {}) {
    this.sampleRate = sampleRate;
    this.channels = channels;
    this.emit = onEvent;
    this.ctx = null;
    this.channelsById = new Map();
    this.elementSources = new WeakMap();
    this.pushed = new Set();
    this.active = new Set();
    this.ready = null;
  }

  /** Starts the audio context (a click is needed first in browsers). */
  async init() {
    if (this.ready) return this.ready;
    this.ready = (async () => {
      const Ctx = globalThis.AudioContext ?? globalThis.webkitAudioContext;
      this.ctx = new Ctx({ sampleRate: this.sampleRate, latencyHint: 'interactive' });
      const url = URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: 'text/javascript' }));
      this.worklets = await this.ctx.audioWorklet.addModule(url).then(() => true, () => false);
      this.tracks = Array.from({ length: TRACKS }, () => { const g = this.ctx.createGain(); g.channelCount = this.channels; g.channelCountMode = 'explicit'; return g; });
      this.monitorBus = this.ctx.createGain();
      this.monitorBus.connect(this.ctx.destination);
      this.master = this.ctx.createGain(); // track meters + tests
      this.tracks[0].connect(this.master);
      this.masterAnalyser = this.ctx.createAnalyser();
      this.masterAnalyser.fftSize = 2048;
      this.master.connect(this.masterAnalyser);
      return true;
    })();
    return this.ready;
  }

  resume() { return this.ctx?.state === 'suspended' ? this.ctx.resume() : Promise.resolve(); }

  /** The monitoring device (Settings › Audio › Monitoring device) where setSinkId exists. */
  async setMonitorDevice(id) { if (this.ctx?.setSinkId) await this.ctx.setSinkId(id && id !== 'default' ? id : '').catch(() => {}); }

  // ───────────────────────── channels (one per source with sound)

  /** Builds or rebuilds a source's chain. `input` is a MediaStream, a media element or null. */
  attach(source, input) {
    if (!this.ctx || !SOURCE_TYPES[source.type]?.audio || !source.audio) return null;
    let ch = this.channelsById.get(source.id);
    if (ch && ch.input === input) { this.configure(source); return ch; }
    if (ch) this.detach(source.id);
    const ctx = this.ctx;
    let node = null;
    if (input instanceof MediaStream && input.getAudioTracks().length) node = ctx.createMediaStreamSource(input);
    else if (input instanceof HTMLMediaElement) {
      // An element can be wired to one AudioContext node only, ever: reuse it.
      node = this.elementSources.get(input);
      if (!node) { node = ctx.createMediaElementSource(input); this.elementSources.set(input, node); }
      input.muted = false;
    }
    ch = { id: source.id, input, node, filters: [], meterL: ctx.createAnalyser(), meterR: ctx.createAnalyser(), sends: [], reduction: 0 };
    ch.delay = ctx.createDelay(20);
    ch.volume = ctx.createGain();
    ch.pan = ctx.createStereoPanner();
    ch.monoIn = ctx.createGain();
    ch.mute = ctx.createGain();
    ch.split = ctx.createChannelSplitter(2);
    ch.post = ctx.createGain();
    ch.monitor = ctx.createGain();
    ch.meterL.fftSize = ch.meterR.fftSize = 1024;
    ch.post.connect(ch.split);
    ch.split.connect(ch.meterL, 0);
    ch.split.connect(ch.meterR, 1);
    ch.trackGains = this.tracks.map((bus) => { const g = ctx.createGain(); ch.post.connect(g); g.connect(bus); return g; });
    ch.monitor.connect(this.monitorBus);
    this.channelsById.set(source.id, ch);
    this.rewire(source);
    return ch;
  }

  detach(id) {
    const ch = this.channelsById.get(id);
    if (!ch) return;
    for (const n of [ch.node, ch.delay, ...ch.filters.flatMap((f) => f.nodes), ch.volume, ch.pan, ch.monoIn, ch.mute, ch.post, ch.monitor, ...ch.trackGains]) { try { n?.disconnect(); } catch { /* gone */ } }
    if (ch.input instanceof HTMLMediaElement) ch.input.muted = true;
    this.channelsById.delete(id);
  }

  /** Filters changed (added, removed, reordered, toggled): the chain is wired again. */
  rewire(source) {
    const ch = this.channelsById.get(source.id);
    if (!ch) return;
    for (const n of [ch.node, ch.delay, ...ch.filters.flatMap((f) => f.nodes), ch.volume, ch.pan, ch.monoIn, ch.mute]) { try { n?.disconnect(); } catch { /* fresh */ } }
    ch.filters = (source.filters ?? []).filter((f) => f.enabled && FILTER_TYPES[f.type]?.kind === 'audio').map((f) => this.makeFilter(f));
    const chain = [ch.node, ch.delay, ...ch.filters.flatMap((f) => [f.first, f.last]), ch.volume, ch.pan, ch.monoIn, ch.mute].filter(Boolean);
    // Pairs of [first, last] for filters: connect last of one to the first of the next.
    let prev = ch.node;
    const link = (to) => { if (prev && to && prev !== to) prev.connect(to); prev = to; };
    if (!prev) { this.configure(source); return; }
    link(ch.delay);
    for (const f of ch.filters) { link(f.first); prev = f.last; }
    link(ch.volume); link(ch.pan); link(ch.monoIn); link(ch.mute);
    ch.mute.connect(ch.post);
    ch.mute.connect(ch.monitor);
    void chain;
    this.configure(source);
  }

  /** One audio filter as Web Audio nodes { first, last, nodes, update(settings) }. */
  makeFilter(f) {
    const ctx = this.ctx;
    const s = f.settings;
    const single = (node) => ({ id: f.id, type: f.type, first: node, last: node, nodes: [node] });
    switch (f.type) {
      case 'gain_filter': { const g = ctx.createGain(); g.gain.value = dbToMul(s.db); return { ...single(g), update: (x) => { g.gain.value = dbToMul(x.db); } }; }
      case 'invert_polarity_filter': { const g = ctx.createGain(); g.gain.value = -1; return single(g); }
      case 'basic_eq_filter': {
        const low = ctx.createBiquadFilter(); low.type = 'lowshelf'; low.frequency.value = 400;
        const mid = ctx.createBiquadFilter(); mid.type = 'peaking'; mid.frequency.value = 1500; mid.Q.value = 0.7;
        const high = ctx.createBiquadFilter(); high.type = 'highshelf'; high.frequency.value = 4000;
        low.connect(mid); mid.connect(high);
        const update = (x) => { low.gain.value = x.low; mid.gain.value = x.mid; high.gain.value = x.high; };
        update(s);
        return { id: f.id, type: f.type, first: low, last: high, nodes: [low, mid, high], update };
      }
      case 'noise_suppress_filter_v2': {
        if (!this.worklets) return single(ctx.createGain());
        const node = new AudioWorkletNode(ctx, 'mybc-denoise', { outputChannelCount: [this.channels], processorOptions: { level: s.suppress_level } });
        return { ...single(node), update: (x) => node.port.postMessage({ level: x.suppress_level }) };
      }
      case 'compressor_filter': case 'limiter_filter': case 'expander_filter': case 'noise_gate_filter': case 'upward_compressor_filter': {
        if (!this.worklets) return single(ctx.createDynamicsCompressor());
        const params = dynamicsParams(f.type, s);
        const node = new AudioWorkletNode(ctx, 'mybc-dynamics', { numberOfInputs: 2, outputChannelCount: [this.channels], processorOptions: params });
        node.port.onmessage = (e) => { const ch = [...this.channelsById.values()].find((c) => c.filters.some((x) => x.id === f.id)); if (ch) ch.reduction = e.data.reduction; };
        const entry = { ...single(node), update: (x) => node.port.postMessage(dynamicsParams(f.type, x)) };
        // Side-chain (ducking): another source's post-fader sound feeds input 1.
        if (f.type === 'compressor_filter' && s.sidechain_source) {
          const other = this.channelsById.get(s.sidechain_source);
          if (other) { other.post.connect(node, 0, 1); entry.sidechain = other; }
        }
        return entry;
      }
      default: return single(ctx.createGain()); // VST: passes the sound unchanged (see catalog: unsupported)
    }
  }

  /** Settings of a filter changed (no rewiring needed). */
  updateFilter(sourceId, filter) {
    const ch = this.channelsById.get(sourceId);
    const live = ch?.filters.find((f) => f.id === filter.id);
    if (live?.update) live.update(filter.settings);
    return Boolean(live);
  }

  /** Volume, mute, balance, mono, sync offset, monitoring, tracks, PTT / PTM and program activity. */
  configure(source) {
    const ch = this.channelsById.get(source.id);
    if (!ch || !source.audio) return;
    const a = source.audio;
    const t = this.ctx.currentTime;
    ch.delay.delayTime.setTargetAtTime(Math.max(0, Math.min(20, (a.sync || 0) / 1000)), t, 0.01);
    ch.volume.gain.setTargetAtTime(a.volume, t, 0.01);
    ch.pan.pan.value = Math.max(-1, Math.min(1, (a.balance - 0.5) * 2));
    ch.monoIn.channelCount = a.mono ? 1 : 2;
    ch.monoIn.channelCountMode = 'explicit';
    ch.monoIn.channelInterpretation = 'speakers';
    const audible = this.isAudible(source);
    ch.mute.gain.setTargetAtTime(audible ? 1 : 0, t, 0.01);
    const toOutput = a.monitor !== 'monitorOnly';
    const active = this.active.has(source.id) || source.global;
    // Tracks and monitoring switch at once; the routing is kept for the meters and tests.
    ch.routing = { tracks: a.tracks.map((on) => Boolean(toOutput && active && on)), monitor: a.monitor !== 'off' };
    ch.trackGains.forEach((g, i) => { g.gain.cancelScheduledValues(t); g.gain.value = ch.routing.tracks[i] ? 1 : 0; });
    ch.monitor.gain.cancelScheduledValues(t);
    ch.monitor.gain.value = ch.routing.monitor ? 1 : 0;
  }

  isAudible(source) {
    const a = source.audio;
    if (a.ptt?.enabled) return !a.muted && this.pushed.has(`ptt:${source.id}`);
    if (a.ptm?.enabled && this.pushed.has(`ptm:${source.id}`)) return false;
    return !a.muted;
  }

  /** Push-to-talk / push-to-mute keys: pressed now, released after the source's delay. */
  push(kind, source, pressed) {
    const key = `${kind}:${source.id}`;
    clearTimeout(this[`t${key}`]);
    if (pressed) { this.pushed.add(key); this.configure(source); return; }
    this[`t${key}`] = setTimeout(() => { this.pushed.delete(key); this.configure(source); }, source.audio[kind]?.delay ?? 200);
  }

  /** The sources in the program (and global ones) reach the tracks; the others only their meters. */
  setActive(ids, sources) {
    this.active = new Set(ids);
    for (const s of sources) this.configure(s);
  }

  // ───────────────────────── meters

  /** Post-fader levels of a source: { peak: [L, R], rms: [L, R], reduction } in dB. */
  meter(id) {
    const ch = this.channelsById.get(id);
    if (!ch) return null;
    const buf = this.meterBuf ??= new Float32Array(1024);
    const read = (an) => { an.getFloatTimeDomainData(buf); return levels(buf); };
    const l = read(ch.meterL); const r = read(ch.meterR);
    return { peak: [l.peak, r.peak], rms: [l.rms, r.rms], reduction: ch.reduction ?? 0 };
  }

  masterLevel() {
    if (!this.masterAnalyser) return null;
    const buf = this.masterBuf ??= new Float32Array(2048);
    this.masterAnalyser.getFloatTimeDomainData(buf);
    return levels(buf);
  }

  // ───────────────────────── outputs

  /** A tap on track `index` (0…5) → callback(Float32Array interleaved, frames, time). */
  async tap(index, onData) {
    await this.init();
    if (!this.worklets) throw new Error('audio-worklet-unavailable');
    const node = new AudioWorkletNode(this.ctx, 'mybc-tap', { processorOptions: { channels: this.channels }, numberOfOutputs: 0 });
    this.tracks[index].connect(node);
    node.port.onmessage = (e) => onData(e.data.data, e.data.frames, e.data.time);
    node.port.postMessage({ on: true });
    return () => { node.port.postMessage({ on: false }); try { this.tracks[index].disconnect(node); } catch { /* gone */ } };
  }

  /** A MediaStream of track `index` (WebRTC / WHIP, MediaRecorder fallback). */
  trackStream(index = 0) {
    const dest = this.ctx.createMediaStreamDestination();
    dest.channelCount = this.channels;
    this.tracks[index].connect(dest);
    return dest.stream;
  }

  /** A stinger transition's own sound goes to the output (and the monitor). */
  playThrough(element) {
    if (!this.ctx) return;
    let node = this.elementSources.get(element);
    if (!node) { node = this.ctx.createMediaElementSource(element); this.elementSources.set(element, node); }
    node.connect(this.tracks[0]);
    node.connect(this.monitorBus);
  }

  close() { for (const id of [...this.channelsById.keys()]) this.detach(id); this.ctx?.close().catch(() => {}); }
}

/** A dynamics filter's settings as the worklet's parameters. */
export function dynamicsParams(type, s) {
  switch (type) {
    case 'compressor_filter': return { mode: 'compressor', ratio: s.ratio, threshold: s.threshold, attack: s.attack_time, release: s.release_time, output: s.output_gain };
    case 'limiter_filter': return { mode: 'limiter', threshold: s.threshold, attack: 0.1, release: s.release_time, output: 0 };
    case 'expander_filter': return { mode: 'expander', ratio: s.presets === 'gate' ? 10 : s.ratio, threshold: s.threshold, attack: s.attack_time, release: s.release_time, output: s.output_gain, detector: s.detector === 'peak' ? 'peak' : 'rms' };
    case 'upward_compressor_filter': return { mode: 'upward', ratio: s.ratio, threshold: s.threshold, attack: s.attack_time, release: s.release_time, output: s.output_gain, knee: s.knee_width };
    case 'noise_gate_filter': return { mode: 'gate', open: s.open_threshold, close: s.close_threshold, attack: s.attack_time, hold: s.hold_time, release: s.release_time };
    default: return { mode: 'compressor', ratio: 1, threshold: 0 };
  }
}
