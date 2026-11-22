// Sources at run time: each input of the collection gets one object that owns its media (a capture
// stream, a <video>, a picture, a canvas it draws on) and hands the compositor a drawable (`element`,
// `width`, `height`, `version`: bumped when the picture changed) and the mixer its sound (`audio`: a
// MediaStream or a media element). One runtime per source: a source shown in several scenes is drawn from
// the same picture.
//
// Files: a setting holds a desktop path, `asset:<id>` (a file the web build stored in IndexedDB),
// `sample:<name>` (pictures the app draws itself) or a URL — engine.resolve() turns it into a URL.
import { formatClock, formatDuration, textOf } from './textfmt.js';

const isVideoFrameReady = (v) => v && v.readyState >= 2 && v.videoWidth > 0;

export class SourceRuntime {
  constructor(engine, record) {
    this.engine = engine;
    this.id = record.id;
    this.type = record.type;
    this.settings = { ...record.settings };
    this.element = null;
    this.width = 0;
    this.height = 0;
    this.version = 0;
    this.audio = null;
    this.status = 'idle'; // idle | ready | waiting (needs a pick) | error | ended
    this.error = '';
    this.active = false; // shown in the program
    this.showing = false; // shown anywhere (program, preview, projector)
    this.runState = 'running';
    this.generation = 0;
  }
  /** The settings changed (properties form). */
  async update(settings) { this.settings = { ...settings }; }
  /** Called every frame before drawing (animations, clocks, video frames). */
  tick() {}
  setActive(active) { this.active = active; }
  setShowing(showing) { this.showing = showing; }
  /** Media sources: play | pause | stop | restart | next | previous | seek(ms). */
  control() {}
  mediaState() { return null; }
  dispose() {}
  async setRunState(state) {
    if (state === this.runState) return;
    const previous = this.runState;
    this.runState = state;
    if (state === 'stopped') this.generation++;
    try { await this.onRunState(previous, state); }
    finally { this.bump(); }
  }
  async onRunState() {}
  bump() { this.version++; this.engine?.sourceChanged?.(this); }
  info() { return { id: this.id, type: this.type, status: this.status, error: this.error, width: this.width, height: this.height }; }
}

// ───────────────────────── captures (screen, window, game, desktop and application audio)

function stopStream(stream) { for (const track of stream?.getTracks?.() ?? []) track.stop(); }

class VideoElementRuntime extends SourceRuntime {
  constructor(engine, record) {
    super(engine, record);
    this.video = document.createElement('video');
    this.video.muted = true; // sound goes through the mixer
    this.video.playsInline = true;
    this.video.crossOrigin = 'anonymous';
    this.element = this.video;
    this.lastFrame = -1;
    const onFrame = () => { this.version++; this.video.requestVideoFrameCallback?.(onFrame); };
    this.video.requestVideoFrameCallback?.(onFrame);
    this.usesFrameCallback = typeof this.video.requestVideoFrameCallback === 'function';
  }
  tick() {
    const v = this.video;
    if (!isVideoFrameReady(v)) { if (this.width) { this.width = 0; this.height = 0; } return; }
    if (v.videoWidth !== this.width || v.videoHeight !== this.height) { this.width = v.videoWidth; this.height = v.videoHeight; this.bump(); }
    if (!this.usesFrameCallback && v.currentTime !== this.lastFrame) { this.lastFrame = v.currentTime; this.version++; }
  }
}

export class CaptureRuntime extends VideoElementRuntime {
  constructor(engine, record) {
    super(engine, record);
    this.stream = null;
    this.status = 'waiting';
    this.label = '';
  }
  /** Asks the user what to capture (the browser's picker; needs a click). */
  async pick() {
    const s = this.settings;
    const video = this.type !== 'wasapi_output_capture' && this.type !== 'wasapi_process_output_capture';
    const surface = this.type === 'monitor_capture' ? 'monitor' : this.type === 'window_capture' || this.type === 'game_capture' ? 'window' : 'browser';
    const wantsAudio = !video || Boolean(s.capture_audio);
    const constraints = {
      video: { cursor: s.capture_cursor === false ? 'never' : 'always', displaySurface: surface, frameRate: { ideal: this.engine?.fps ?? 30 } },
      audio: wantsAudio ? { echoCancellation: false, noiseSuppression: false, autoGainControl: false, suppressLocalAudioPlayback: false } : false,
      selfBrowserSurface: 'exclude', surfaceSwitching: 'include', systemAudio: 'include', monitorTypeSurfaces: 'include',
    };
    if (!navigator.mediaDevices?.getDisplayMedia) throw new Error('capture-unsupported');
    const stream = await navigator.mediaDevices.getDisplayMedia(constraints);
    this.setStream(stream, video);
    return this.label;
  }
  setStream(stream, video = true) {
    stopStream(this.stream);
    this.stream = stream;
    const track = stream.getVideoTracks()[0];
    this.label = track?.label ?? stream.getAudioTracks()[0]?.label ?? '';
    if (video && track) {
      this.video.srcObject = new MediaStream([track]);
      this.video.play().catch(() => {});
      track.addEventListener('ended', () => { this.status = 'waiting'; this.width = 0; this.bump(); });
    } else if (!video && track) track.stop(); // an audio capture keeps only the sound
    const audioTracks = stream.getAudioTracks();
    this.audio = audioTracks.length ? new MediaStream(audioTracks) : null;
    this.status = 'ready';
    this.error = '';
    this.bump();
    this.engine?.audioChanged?.(this);
  }
  dispose() { stopStream(this.stream); this.video.srcObject = null; }
  info() { return { ...super.info(), label: this.label }; }
}

// ───────────────────────── camera, microphone

export class CameraRuntime extends VideoElementRuntime {
  constructor(engine, record) { super(engine, record); this.stream = null; this.starting = null; }
  async start() {
    const generation = this.generation;
    const s = this.settings;
    const [w, h] = String(s.resolution || '1280x720').split('x').map(Number);
    const video = { deviceId: s.video_device_id ? { exact: s.video_device_id } : undefined };
    if (s.res_type === 'custom') { video.width = { ideal: w }; video.height = { ideal: h }; if (s.frame_interval !== 'match') video.frameRate = { ideal: Number(s.frame_interval) }; }
    if (s.facing && s.facing !== 'any') video.facingMode = s.facing;
    const audio = s.audio_output_mode === 'capture' ? { deviceId: s.audio_device_id ? { exact: s.audio_device_id } : undefined, echoCancellation: false, noiseSuppression: false, autoGainControl: false } : false;
    stopStream(this.stream);
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video, audio });
    } catch (error) {
      // A camera without a microphone: try the picture alone.
      if (audio && generation === this.generation) stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
      else throw error;
    }
    if (generation !== this.generation || this.runState === 'stopped') { stopStream(stream); return; }
    this.stream = stream;
    this.video.srcObject = new MediaStream(this.stream.getVideoTracks());
    await this.video.play().catch(() => {});
    if (generation !== this.generation || this.runState === 'stopped') return;
    const at = this.stream.getAudioTracks();
    this.audio = at.length ? new MediaStream(at) : null;
    this.status = 'ready';
    this.error = '';
    this.bump();
    this.engine?.audioChanged?.(this);
  }
  async ensure() {
    if (this.runState === 'stopped') return;
    if (this.stream || this.starting) return this.starting;
    if (!navigator.mediaDevices?.getUserMedia) { this.status = 'error'; this.error = 'camera-unsupported'; return null; }
    const generation = this.generation;
    this.starting = this.start().catch((error) => { if (generation === this.generation) { this.status = 'error'; this.error = error.name || error.message; this.bump(); } }).finally(() => { this.starting = null; });
    return this.starting;
  }
  async update(settings) {
    const changed = ['video_device_id', 'res_type', 'resolution', 'frame_interval', 'facing', 'audio_output_mode', 'audio_device_id'].some((k) => settings[k] !== this.settings[k]);
    await super.update(settings);
    if (changed && this.stream) { stopStream(this.stream); this.stream = null; await this.ensure(); }
  }
  setShowing(showing) {
    super.setShowing(showing);
    if (this.runState !== 'running') return;
    if (showing) this.ensure();
    else if (this.settings.deactivate_when_not_showing && this.stream) { stopStream(this.stream); this.stream = null; this.video.srcObject = null; this.audio = null; this.status = 'idle'; this.engine?.audioChanged?.(this); }
  }
  async onRunState(previous, state) {
    if (state === 'stopped') {
      stopStream(this.stream); this.stream = null; this.video.srcObject = null; this.audio = null;
      this.engine?.audioChanged?.(this);
    } else if (previous === 'stopped') {
      if (this.starting) await this.starting;
      if (this.runState !== 'stopped') await this.ensure();
    }
  }
  dispose() { this.generation++; stopStream(this.stream); this.stream = null; this.video.srcObject = null; }
}

export class MicRuntime extends SourceRuntime {
  constructor(engine, record) { super(engine, record); this.stream = null; this.starting = null; }
  async start() {
    const generation = this.generation;
    const s = this.settings;
    stopStream(this.stream);
    const id = s.device_id && s.device_id !== 'default' ? { exact: s.device_id } : undefined;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: id, echoCancellation: Boolean(s.echo_cancellation), noiseSuppression: Boolean(s.noise_suppression), autoGainControl: Boolean(s.auto_gain), channelCount: { ideal: 2 } }, video: false });
    if (generation !== this.generation || this.runState === 'stopped') { stopStream(stream); return; }
    this.stream = stream;
    this.audio = this.stream;
    this.status = 'ready';
    this.error = '';
    this.engine?.audioChanged?.(this);
  }
  async ensure() {
    if (this.runState === 'stopped') return;
    if (this.stream || this.starting) return this.starting;
    if (!navigator.mediaDevices?.getUserMedia) { this.status = 'error'; this.error = 'mic-unsupported'; return; }
    const generation = this.generation;
    this.starting = this.start().catch((error) => { if (generation === this.generation) { this.status = 'error'; this.error = error.name || error.message; this.bump(); } }).finally(() => { this.starting = null; });
    return this.starting;
  }
  async update(settings) {
    const changed = ['device_id', 'echo_cancellation', 'noise_suppression', 'auto_gain'].some((k) => settings[k] !== this.settings[k]);
    await super.update(settings);
    if (changed && this.stream) { stopStream(this.stream); this.stream = null; await this.ensure(); }
  }
  async onRunState(previous, state) {
    if (state === 'stopped') {
      stopStream(this.stream); this.stream = null; this.audio = null;
      this.engine?.audioChanged?.(this);
    } else if (previous === 'stopped') {
      if (this.starting) await this.starting;
      if (this.runState !== 'stopped') await this.ensure();
    }
  }
  dispose() { this.generation++; stopStream(this.stream); this.stream = null; }
}

// ───────────────────────── pictures

export class ImageRuntime extends SourceRuntime {
  constructor(engine, record) { super(engine, record); this.image = null; this.load(); }
  async load() {
    const file = this.settings.file;
    if (!file) { this.element = null; this.width = this.height = 0; this.status = 'idle'; this.bump(); return; }
    try {
      const url = await this.engine.resolve(file);
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.decoding = 'async';
      img.src = url;
      await img.decode();
      this.image = img;
      this.element = img;
      this.width = img.naturalWidth || 1;
      this.height = img.naturalHeight || 1;
      this.status = 'ready';
      this.error = '';
      // An animated GIF / WebP keeps changing: redraw it every frame.
      this.animated = /\.(gif|webp|apng)(\?|$)/i.test(String(file));
    } catch (error) {
      this.element = null; this.width = this.height = 0; this.status = 'error'; this.error = error?.message || 'load';
    }
    this.bump();
  }
  tick() { if (this.animated && this.element) this.version++; }
  async update(settings) { const reload = settings.file !== this.settings.file; await super.update(settings); if (reload) await this.load(); }
}

export class SlideshowRuntime extends SourceRuntime {
  constructor(engine, record) {
    super(engine, record);
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.element = this.canvas;
    this.images = [];
    this.index = 0;
    this.prev = -1;
    this.changedAt = 0;
    this.paused = false;
    this.done = false;
    this.load();
  }
  async load() {
    const list = (this.settings.files ?? []).map((f) => (typeof f === 'object' ? f.value ?? f.path : f)).filter(Boolean);
    const loaded = [];
    for (const f of list) {
      try { const img = new Image(); img.crossOrigin = 'anonymous'; img.src = await this.engine.resolve(f); await img.decode(); loaded.push(img); } catch { /* missing file: Problems lists it */ }
    }
    this.order = loaded.map((_, i) => i);
    if (this.settings.randomize) this.order.sort(() => Math.random() - 0.5);
    this.images = loaded;
    this.index = 0; this.prev = -1; this.changedAt = performance.now(); this.done = false;
    const size = this.settings.use_custom_size && this.settings.use_custom_size !== 'auto' ? this.settings.use_custom_size.split('x').map(Number) : null;
    const w = size?.[0] ?? Math.max(1, ...loaded.map((i) => i.naturalWidth));
    const h = size?.[1] ?? Math.max(1, ...loaded.map((i) => i.naturalHeight));
    this.canvas.width = this.width = loaded.length ? w : 0;
    this.canvas.height = this.height = loaded.length ? h : 0;
    this.status = loaded.length ? 'ready' : 'idle';
    this.draw(1);
    this.bump();
  }
  async update(settings) { const reload = JSON.stringify(settings.files) !== JSON.stringify(this.settings.files) || settings.use_custom_size !== this.settings.use_custom_size || settings.randomize !== this.settings.randomize; await super.update(settings); if (reload) await this.load(); }
  current() { return this.images[this.order?.[this.index] ?? 0]; }
  fitDraw(img, alpha = 1, dx = 0, dy = 0) {
    if (!img) return;
    const { width: W, height: H } = this.canvas;
    const k = Math.min(W / img.naturalWidth, H / img.naturalHeight);
    const w = img.naturalWidth * k; const h = img.naturalHeight * k;
    this.ctx.globalAlpha = alpha;
    this.ctx.drawImage(img, (W - w) / 2 + dx, (H - h) / 2 + dy, w, h);
    this.ctx.globalAlpha = 1;
  }
  draw(p) {
    const ctx = this.ctx;
    const { width: W, height: H } = this.canvas;
    ctx.clearRect(0, 0, W, H);
    if (this.done && this.settings.hide) return;
    const now = this.current();
    const before = this.prev >= 0 ? this.images[this.order[this.prev]] : null;
    const kind = this.settings.transition;
    if (!before || p >= 1 || kind === 'cut') { this.fitDraw(now); return; }
    if (kind === 'fade') { this.fitDraw(before, 1 - p); this.fitDraw(now, p); return; }
    if (kind === 'slide') { this.fitDraw(before, 1, -W * p, 0); this.fitDraw(now, 1, W * (1 - p), 0); return; }
    this.fitDraw(before); this.fitDraw(now, 1, W * (1 - p), 0); // swipe
  }
  step(dir = 1) {
    if (!this.images.length) return;
    const last = this.images.length - 1;
    let next = this.index + dir;
    if (next > last) { if (!this.settings.loop) { this.done = true; this.draw(1); this.bump(); return; } next = 0; }
    if (next < 0) next = this.settings.loop ? last : 0;
    this.prev = this.index; this.index = next; this.changedAt = performance.now(); this.done = false;
  }
  tick(now = performance.now()) {
    if (!this.images.length) return;
    const s = this.settings;
    const behaviour = s.playback_behavior;
    const running = behaviour === 'always_play' || this.showing;
    if (!running) { if (behaviour === 'stop_restart' && this.index !== 0) { this.index = 0; this.prev = -1; this.draw(1); this.bump(); } this.changedAt = now - (this.pausedFor ?? 0); return; }
    const since = now - this.changedAt;
    const speed = Math.max(1, s.transition_speed);
    if (since < speed && this.prev >= 0) { this.draw(since / speed); this.version++; return; }
    if (this.prev >= 0) { this.prev = -1; this.draw(1); this.version++; }
    if (s.slide_mode === 'mode_auto' && !this.paused && !this.done && since >= s.slide_time + speed) this.step(1);
  }
  control(action) {
    if (action === 'next') this.step(1);
    else if (action === 'previous') this.step(-1);
    else if (action === 'pause') this.paused = true;
    else if (action === 'play') this.paused = false;
    else if (action === 'restart' || action === 'stop') { this.index = 0; this.prev = -1; this.changedAt = performance.now(); this.done = false; this.paused = action === 'stop'; this.draw(1); }
    this.bump();
  }
  mediaState() { return { kind: 'slides', index: this.index, count: this.images.length, paused: this.paused, done: this.done }; }
  async onRunState(previous, state) {
    if (state === 'paused' && previous === 'running') { this.resumePlayback = !this.paused; this.control('pause'); }
    if (state === 'stopped') { this.resumePlayback = true; this.control('stop'); }
    if (state === 'running' && this.resumePlayback) { this.changedAt = performance.now(); this.control('play'); }
  }
}

// ───────────────────────── media file / URL / playlist

let hlsModule = null;
const loadHls = () => (hlsModule ??= import('hls.js').then((m) => m.default));

export class MediaRuntime extends VideoElementRuntime {
  constructor(engine, record) {
    super(engine, record);
    this.list = [];
    this.position = 0;
    this.ended = false;
    this.hls = null;
    this.audio = this.video; // the mixer reads the element
    this.video.addEventListener('ended', () => this.onEnded());
    this.video.addEventListener('error', () => { this.status = 'error'; this.error = this.video.error?.message || 'media'; this.bump(); });
    this.video.addEventListener('playing', () => { this.status = 'ready'; this.ended = false; this.bump(); });
    this.load();
  }
  playlist() {
    if (this.type === 'vlc_source') return (this.settings.playlist ?? []).map((f) => (typeof f === 'object' ? f.value ?? f.path : f)).filter(Boolean);
    const s = this.settings;
    return [s.is_local_file === false ? s.input : s.local_file].filter(Boolean);
  }
  async load(autoplay = null) {
    this.list = this.playlist();
    if (this.type === 'vlc_source' && this.settings.shuffle) this.list.sort(() => Math.random() - 0.5);
    this.position = Math.min(this.position, Math.max(0, this.list.length - 1));
    await this.open(this.list[this.position], autoplay);
  }
  async open(file, autoplay = null) {
    const generation = this.generation;
    if (this.runState === 'stopped') return;
    this.hls?.destroy(); this.hls = null;
    if (!file) { this.video.removeAttribute('src'); this.video.load(); this.status = 'idle'; this.width = 0; this.bump(); return; }
    try {
      const url = await this.engine.resolve(file);
      if (generation !== this.generation || this.runState === 'stopped') return;
      const s = this.settings;
      this.video.loop = this.type === 'ffmpeg_source' ? Boolean(s.looping) : false;
      this.video.playbackRate = (s.speed_percent ?? 100) / 100;
      if (/\.m3u8(\?|$)/i.test(url) && !this.video.canPlayType('application/vnd.apple.mpegurl')) {
        const Hls = await loadHls();
        if (generation !== this.generation || this.runState === 'stopped') return;
        this.hls = new Hls();
        this.hls.loadSource(url);
        this.hls.attachMedia(this.video);
      } else this.video.src = url;
      this.ended = false;
      const play = autoplay ?? (this.type === 'ffmpeg_source' ? (s.restart_on_activate ? this.active || this.showing : true) : this.settings.playback_behavior === 'always_play' || this.showing);
      if (play && this.runState === 'running') await this.video.play().catch(() => {});
      if (generation !== this.generation || this.runState === 'stopped') return;
      if (this.runState === 'paused') this.video.pause();
      this.status = 'ready';
      this.error = '';
    } catch (error) { this.status = 'error'; this.error = error?.message || 'media'; }
    this.bump();
  }
  onEnded() {
    if (this.type === 'vlc_source' && this.list.length) {
      if (this.position < this.list.length - 1) { this.position++; this.open(this.list[this.position], true); return; }
      if (this.settings.loop) { this.position = 0; this.open(this.list[0], true); return; }
    }
    this.ended = true;
    this.status = 'ended';
    if (this.type === 'ffmpeg_source' && this.settings.clear_on_media_end) { this.width = 0; }
    this.bump();
    this.engine?.mediaEnded?.(this);
  }
  tick() { if (this.ended && this.type === 'ffmpeg_source' && this.settings.clear_on_media_end) { this.width = 0; return; } super.tick(); }
  async update(settings) {
    const before = this.settings;
    await super.update(settings);
    const reload = this.type === 'vlc_source' ? JSON.stringify(before.playlist) !== JSON.stringify(settings.playlist) || before.shuffle !== settings.shuffle : before.local_file !== settings.local_file || before.input !== settings.input || before.is_local_file !== settings.is_local_file;
    if (reload) { this.position = 0; if (this.runState !== 'stopped') await this.load(); return; }
    this.video.loop = this.type === 'ffmpeg_source' ? Boolean(settings.looping) : false;
    this.video.playbackRate = (settings.speed_percent ?? 100) / 100;
  }
  setActive(active) {
    const was = this.active;
    super.setActive(active);
    if (this.runState !== 'running') return;
    if (this.type === 'ffmpeg_source') {
      if (active && !was && this.settings.restart_on_activate) { this.video.currentTime = 0; this.ended = false; this.video.play().catch(() => {}); }
      if (!active && was && this.settings.close_when_inactive) this.video.pause();
    }
  }
  setShowing(showing) {
    const was = this.showing;
    super.setShowing(showing);
    if (this.runState !== 'running') return;
    if (this.type !== 'vlc_source') return;
    const b = this.settings.playback_behavior;
    if (showing && !was) { if (b === 'stop_restart') { this.position = 0; this.open(this.list[0], true); } else this.video.play().catch(() => {}); }
    if (!showing && was && b !== 'always_play') this.video.pause();
  }
  control(action, value) {
    const v = this.video;
    switch (action) {
      case 'play': if (this.ended) { v.currentTime = 0; this.ended = false; } v.play().catch(() => {}); break;
      case 'pause': v.pause(); break;
      case 'stop': v.pause(); v.currentTime = 0; this.ended = true; break;
      case 'restart': v.currentTime = 0; this.ended = false; v.play().catch(() => {}); break;
      case 'next': if (this.position < this.list.length - 1) { this.position++; this.open(this.list[this.position], true); } break;
      case 'previous': if (this.position > 0) { this.position--; this.open(this.list[this.position], true); } else v.currentTime = 0; break;
      case 'seek': if (Number.isFinite(value)) v.currentTime = Math.max(0, value / 1000); break;
      default: break;
    }
    this.bump();
  }
  mediaState() {
    const v = this.video;
    return { kind: 'media', playing: !v.paused && !v.ended, ended: this.ended, time: (v.currentTime || 0) * 1000, duration: Number.isFinite(v.duration) ? v.duration * 1000 : 0, index: this.position, count: this.list.length, name: String(this.list[this.position] ?? '').split(/[\\/]/).pop() };
  }
  async onRunState(previous, state) {
    const generation = this.generation;
    if (state === 'paused' && previous === 'running') { this.resumePlayback = Boolean(this.pendingRestart) || !this.video.paused; this.video.pause(); }
    if (state === 'stopped') {
      this.resumePlayback = true;
      this.position = 0;
      this.hls?.destroy(); this.hls = null;
      this.video.pause(); this.video.removeAttribute('src'); this.video.load();
    }
    if (previous === 'stopped' && state !== 'stopped') {
      const loading = this.load(false);
      this.pendingRestart = loading;
      try { await loading; } finally { if (this.pendingRestart === loading) this.pendingRestart = null; }
      if (state === 'running' && generation === this.generation && this.runState === 'running' && this.list.length && this.status !== 'error') await this.video.play();
    } else if (state === 'running' && this.resumePlayback) {
      if (this.pendingRestart) await this.pendingRestart;
      if (generation === this.generation && this.runState === 'running' && this.list.length && this.status !== 'error') await this.video.play();
    }
  }
  dispose() { this.generation++; this.hls?.destroy(); this.video.pause(); this.video.removeAttribute('src'); this.video.load(); }
}

// ───────────────────────── text (drawn on a canvas)

export class TextRuntime extends SourceRuntime {
  constructor(engine, record) {
    super(engine, record);
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.element = this.canvas;
    this.drawn = '';
    this.fileText = '';
    this.startedAt = performance.now();
    this.paused = false;
    this.pausedAt = 0;
    this.render();
    if (record.settings.read_from_file) this.readFile();
  }
  async readFile() {
    const s = this.settings;
    if (!s.read_from_file || !s.file) return;
    try { this.fileText = await this.engine.readText(s.file); } catch { this.fileText = ''; }
    this.render();
  }
  /** The text shown now (static, file, clock, date, countdown, stopwatch; chat log keeps the last lines). */
  content(now = Date.now()) {
    const s = this.settings;
    const elapsed = (this.paused ? this.pausedAt : performance.now()) - this.startedAt;
    return textOf(s, { now, elapsed, fileText: this.fileText });
  }
  render() {
    const s = this.settings;
    const body = this.content();
    const key = JSON.stringify([body, s]);
    if (key === this.drawn) return;
    this.drawn = key;
    drawText(this.ctx, this.canvas, body, s);
    this.width = this.canvas.width;
    this.height = this.canvas.height;
    this.status = 'ready';
    this.bump();
  }
  tick() {
    if (this.settings.text_mode !== 'static') this.render();
    // Read from file: checked about once a second .
    if (this.settings.read_from_file && performance.now() - (this.lastRead ?? 0) > 1000) { this.lastRead = performance.now(); this.readFile(); }
  }
  async update(settings) {
    const reset = settings.text_mode !== this.settings.text_mode || settings.countdown_seconds !== this.settings.countdown_seconds;
    await super.update(settings);
    if (reset) { this.startedAt = performance.now(); this.paused = this.runState !== 'running'; if (this.paused) this.pausedAt = this.startedAt; }
    if (settings.read_from_file) await this.readFile();
    this.render();
  }
  /** Countdown / stopwatch: play (resume), pause, restart / stop (reset). */
  control(action) {
    if (action === 'pause' && !this.paused) { this.paused = true; this.pausedAt = performance.now(); }
    else if (action === 'play' && this.paused) { this.startedAt += performance.now() - this.pausedAt; this.paused = false; }
    else if (action === 'restart' || action === 'stop') { this.startedAt = performance.now(); this.paused = action === 'stop'; this.pausedAt = this.startedAt; }
    this.drawn = '';
    this.render();
  }
  mediaState() { return ['countdown', 'stopwatch'].includes(this.settings.text_mode) ? { kind: 'timer', paused: this.paused } : null; }
  async onRunState(previous, state) {
    if (state === 'paused' && previous === 'running') { this.resumePlayback = !this.paused; this.control('pause'); }
    if (state === 'stopped') { this.resumePlayback = true; this.control('stop'); }
    if (state === 'running' && this.resumePlayback) this.control('play');
  }
}

const rgba = (hex, opacity = 100) => {
  const h = String(hex || '#000000').replace('#', '');
  const n = parseInt(h.slice(0, 6), 16) || 0;
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${Math.max(0, Math.min(100, opacity)) / 100})`;
};

/** Lays out and draws a text source's picture (exported for tests and the browser source fallback). */
export function drawText(ctx, canvas, body, s) {
  const font = s.font ?? {};
  const size = Math.max(4, Number(font.size) || 72);
  const css = `${font.italic ? 'italic ' : ''}${font.bold ? '700 ' : '400 '}${size}px ${JSON.stringify(font.face || 'Arial')}, sans-serif`;
  ctx.font = css;
  const pad = (s.outline ? s.outline_size : 0) + (s.drop_shadow ? s.shadow_offset : 0) + 2;
  const lineHeight = Math.round(size * 1.22);
  const maxWidth = s.extents && s.extents_wrap ? Math.max(1, s.extents_cx - pad * 2) : Infinity;
  const wrap = (line) => {
    if (!Number.isFinite(maxWidth) || ctx.measureText(line).width <= maxWidth) return [line];
    const out = [];
    let current = '';
    for (const word of line.split(/(\s+)/)) {
      const next = current + word;
      if (ctx.measureText(next).width > maxWidth && current.trim()) { out.push(current.trimEnd()); current = word.trimStart(); } else current = next;
    }
    if (current) out.push(current);
    return out;
  };
  let lines = String(body ?? '').split(/\r?\n/).flatMap(wrap);
  if (s.chatlog) lines = lines.slice(-Math.max(1, s.chatlog_lines));
  if (s.vertical) lines = [...String(body ?? '').replace(/\r?\n/g, '')].map((ch) => ch);
  const widths = lines.map((l) => ctx.measureText(l).width);
  const textW = Math.ceil(Math.max(1, ...widths));
  const textH = Math.max(lineHeight, lines.length * lineHeight);
  const W = s.extents ? Math.max(1, Math.round(s.extents_cx)) : textW + pad * 2;
  const H = s.extents ? Math.max(1, Math.round(s.extents_cy)) : textH + pad * 2;
  canvas.width = W;
  canvas.height = H;
  ctx.font = css;
  ctx.textBaseline = 'alphabetic';
  ctx.imageSmoothingEnabled = s.antialiasing !== false;
  if (s.bk_opacity > 0) { ctx.fillStyle = rgba(s.bk_color, s.bk_opacity); ctx.fillRect(0, 0, W, H); }
  const top = s.valign === 'bottom' ? H - pad - textH : s.valign === 'center' ? (H - textH) / 2 : pad;
  let fill = rgba(s.color, s.opacity);
  if (s.gradient) {
    const a = ((s.gradient_dir ?? 90) * Math.PI) / 180;
    const cx = W / 2; const cy = H / 2; const r = Math.max(W, H) / 2;
    const g = ctx.createLinearGradient(cx - Math.cos(a) * r, cy - Math.sin(a) * r, cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    g.addColorStop(0, rgba(s.color, s.opacity));
    g.addColorStop(1, rgba(s.gradient_color, s.gradient_opacity));
    fill = g;
  }
  lines.forEach((l, i) => {
    const w = widths[i];
    const x = s.align === 'right' ? W - pad - w : s.align === 'center' ? (W - w) / 2 : pad;
    const y = top + i * lineHeight + size * 0.95;
    if (s.drop_shadow) { ctx.fillStyle = rgba(s.shadow_color, 80); ctx.fillText(l, x + s.shadow_offset, y + s.shadow_offset); }
    if (s.outline) { ctx.lineJoin = 'round'; ctx.lineWidth = s.outline_size * 2; ctx.strokeStyle = rgba(s.outline_color, s.outline_opacity); ctx.strokeText(l, x, y); }
    ctx.fillStyle = fill;
    ctx.fillText(l, x, y);
    if (font.underline || font.strikeout) {
      ctx.fillRect(x, font.underline ? y + size * 0.1 : y - size * 0.3, w, Math.max(1, size / 16));
    }
  });
}

// ───────────────────────── browser source (HTML and CSS drawn through SVG)

export class BrowserRuntime extends SourceRuntime {
  constructor(engine, record) {
    super(engine, record);
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.element = this.canvas;
    this.drawnAt = 0;
    this.busy = false;
    this.page = '';
    this.loadPage();
  }
  /** The address the real page opens: the URL, the local file, or the HTML as a data: address. */
  async pageUrl() {
    const s = this.settings;
    if (s.mode === 'url') return /^https?:/.test(s.url) ? s.url : null;
    if (s.mode === 'local') return s.local_file ? this.engine.resolve(s.local_file) : null;
    return `data:text/html;charset=utf-8,${encodeURIComponent(s.html ?? '')}`;
  }
  /** Desktop (Windows): the page runs for real in a hidden WebView2 window; its frames come here. */
  async openRealPage(generation) {
    const pages = this.engine?.browserPages;
    if (!pages || !(await (this.engine.pagesSupported ??= pages.supported()))) return false;
    const url = await this.pageUrl();
    if (!url || generation !== this.generation || this.runState === 'stopped') return false;
    const s = this.settings;
    this.realPage = true;
    this.canvas.width = this.width = Math.max(1, s.width);
    this.canvas.height = this.height = Math.max(1, s.height);
    if (!this.engine.pageListener) {
      this.engine.pageListener = pages.onFrame((frame) => this.engine.pageFrames.get(frame.id)?.(frame.data));
    }
    this.engine.pageFrames.set(this.id, (data) => this.showFrame(data));
    await pages.open({ id: this.id, url, width: this.width, height: this.height, css: s.css ?? '', fps: s.fps_custom ? s.fps : 30 });
    if (generation !== this.generation || this.runState === 'stopped') { await pages.close(this.id); this.realPage = false; this.engine.pageFrames.delete(this.id); return false; }
    return true;
  }
  /** One PNG frame of the real page (a newer one waiting replaces an older one). */
  async showFrame(data) {
    if (this.decoding) { this.nextFrame = data; return; }
    this.decoding = true;
    try {
      const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
      const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.ctx.drawImage(bitmap, 0, 0, this.canvas.width, this.canvas.height);
      bitmap.close();
      this.version++;
      if (this.status !== 'ready') { this.status = 'ready'; this.error = ''; this.bump(); }
    } catch { /* a broken frame: keep the last one */ }
    this.decoding = false;
    if (this.nextFrame) { const next = this.nextFrame; this.nextFrame = null; this.showFrame(next); }
  }
  closeRealPage() {
    if (!this.realPage) return this.closingPage ?? Promise.resolve();
    this.realPage = false;
    this.engine.pageFrames.delete(this.id);
    const closing = this.engine.browserPages?.close(this.id) ?? Promise.resolve();
    this.closingPage = Promise.all([this.closingPage, closing]);
    return this.closingPage;
  }
  loadPage() {
    const generation = this.generation;
    const load = async () => {
      await this.closingPage;
      if (generation !== this.generation || this.runState === 'stopped') return;
      await this.loadPageNow(generation);
    };
    this.pageOperation = (this.pageOperation ?? Promise.resolve()).then(load, load);
    return this.pageOperation;
  }
  async loadPageNow(generation) {
    const s = this.settings;
    if (!(s.shutdown && !this.showing)) {
      try { if (await this.openRealPage(generation)) return; } catch (error) { this.realPage = false; this.engine.pageFrames?.delete(this.id); this.status = 'error'; this.error = error?.message || 'page'; }
    }
    if (generation !== this.generation || this.runState === 'stopped') return;
    try {
      if (s.mode === 'local' && s.local_file) this.page = await this.engine.readText(s.local_file);
      else if (s.mode === 'url' && /^https?:/.test(s.url)) this.page = await this.engine.fetchPage(s.url);
      else this.page = s.html ?? '';
      if (generation !== this.generation || this.runState === 'stopped') return;
      this.status = 'ready'; this.error = '';
    } catch (error) { this.page = ''; this.status = 'error'; this.error = error?.message || 'page'; }
    this.paint();
  }
  /** The page as an SVG picture (scripts do not run there; styles, fonts, inline pictures do). */
  svg() {
    const s = this.settings;
    const W = Math.max(1, s.width); const H = Math.max(1, s.height);
    const body = String(this.page).replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<\/?(html|head|body)[^>]*>/gi, '');
    const xhtml = new XMLSerializer().serializeToString(new DOMParser().parseFromString(`<div xmlns="http://www.w3.org/1999/xhtml" style="width:${W}px;height:${H}px;overflow:hidden"><style>${s.css ?? ''}</style>${body}</div>`, 'text/html').body.firstChild);
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><foreignObject width="100%" height="100%">${xhtml}</foreignObject></svg>`;
  }
  async paint() {
    if (this.busy) { this.again = true; return; }
    this.busy = true;
    const s = this.settings;
    this.canvas.width = this.width = Math.max(1, s.width);
    this.canvas.height = this.height = Math.max(1, s.height);
    try {
      const img = new Image();
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(this.svg())}`;
      await img.decode();
      this.ctx.clearRect(0, 0, this.width, this.height);
      this.ctx.drawImage(img, 0, 0);
    } catch { /* malformed markup: keep the last picture */ }
    this.drawnAt = performance.now();
    this.busy = false;
    this.bump();
    if (this.again) { this.again = false; this.paint(); }
  }
  tick(now = performance.now()) {
    const s = this.settings;
    if (this.realPage) return; // the page sends its own frames
    if (s.shutdown && !this.showing) return;
    if (s.fps_custom && now - this.drawnAt > 1000 / Math.max(1, s.fps)) this.paint();
  }
  setActive(active) { const was = this.active; super.setActive(active); if (this.runState !== 'stopped' && active && !was && this.settings.restart_when_active) this.refresh(); }
  /** "Shut down when not visible": the real page closes while nothing shows it, and opens again. */
  setShowing(showing) {
    const was = this.showing;
    super.setShowing(showing);
    if (this.runState === 'stopped') return;
    if (!this.settings.shutdown || was === showing) return;
    if (!showing) this.closeRealPage(); else if (!this.realPage) this.loadPage();
  }
  async update(settings) { const closing = this.closeRealPage(); await super.update(settings); await closing; await this.loadPage(); }
  refresh() { return this.realPage ? this.engine.browserPages.reload(this.id) : this.loadPage(); }
  /** Interact: pointer and keys to the real page (DevTools input events, page coordinates). */
  interact(method, params) { if (this.realPage) this.engine.browserPages.input(this.id, method, params); return this.realPage; }
  async onRunState(previous, state) {
    if (state === 'stopped') {
      const closing = this.closeRealPage();
      this.pageOperation = Promise.all([this.pageOperation, closing]);
      await this.pageOperation;
    }
    else if (previous === 'stopped') await this.loadPage();
  }
  dispose() { this.generation++; this.closeRealPage(); }
}

// ───────────────────────── colour

export class ColorRuntime extends SourceRuntime {
  constructor(engine, record) { super(engine, record); this.canvas = document.createElement('canvas'); this.element = this.canvas; this.paint(); }
  paint() {
    const s = this.settings;
    this.canvas.width = 8; this.canvas.height = 8;
    const ctx = this.canvas.getContext('2d');
    ctx.clearRect(0, 0, 8, 8);
    ctx.fillStyle = s.color?.length === 9 ? `#${s.color.slice(1, 7)}${s.color.slice(7)}` : s.color;
    ctx.fillRect(0, 0, 8, 8);
    this.width = Math.max(1, s.width); this.height = Math.max(1, s.height);
    this.status = 'ready';
    this.bump();
  }
  async update(settings) { await super.update(settings); this.paint(); }
}

/** A source with no picture (scene and group sources: the compositor draws their items). */
class EmptyRuntime extends SourceRuntime {}

export const RUNTIMES = {
  monitor_capture: CaptureRuntime, window_capture: CaptureRuntime, game_capture: CaptureRuntime,
  wasapi_output_capture: CaptureRuntime, wasapi_process_output_capture: CaptureRuntime,
  dshow_input: CameraRuntime, wasapi_input_capture: MicRuntime,
  image_source: ImageRuntime, slideshow: SlideshowRuntime, ffmpeg_source: MediaRuntime, vlc_source: MediaRuntime,
  browser_source: BrowserRuntime, text_gdiplus: TextRuntime, color_source_v3: ColorRuntime,
  scene: EmptyRuntime, group: EmptyRuntime,
};

export function createRuntime(engine, record) {
  const Kind = RUNTIMES[record.type] ?? EmptyRuntime;
  return new Kind(engine, record);
}

export { formatClock, formatDuration };
