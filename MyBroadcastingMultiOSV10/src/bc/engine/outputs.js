// Outputs: the encoders (WebCodecs) and what their packets feed — the recording (MP4 · MOV · MKV · WebM ·
// fragmented MP4, with pause, automatic split, chapters and up to six audio tracks), the replay buffer
// and the stream (Matroska bytes to a transport: the desktop app's FFmpeg or the web relay; WHIP goes
// through WebRTC, see engine/whip.js). One encoder serves every output with the same settings
// ("same as stream"); different settings get their own encoder.
//
// Platform details (writing files, the stream transport) come in as plain objects so the logic runs the
// same on the desktop, in the browser and in the tests (test/unit/outputs.test.js feeds fake packets).
import { BufferTarget, EncodedAudioPacketSource, EncodedPacket, EncodedVideoPacketSource, MkvOutputFormat, MovOutputFormat, Mp4OutputFormat, Output, StreamTarget, WebMOutputFormat } from 'mediabunny';

export const CONTAINERS = ['mp4', 'fmp4', 'mov', 'mkv', 'webm'];
export const VIDEO_CODECS = ['avc', 'hevc', 'av1', 'vp9', 'vp8'];
export const AUDIO_CODECS = ['aac', 'opus'];
export const RATE_CONTROLS = ['CBR', 'VBR', 'CQP'];
/** Which codecs each container takes (WebM: VP8 · VP9 · AV1 with Opus). */
export const CONTAINER_CODECS = {
  mp4: { video: ['avc', 'hevc', 'av1', 'vp9'], audio: ['aac', 'opus'] },
  fmp4: { video: ['avc', 'hevc', 'av1', 'vp9'], audio: ['aac', 'opus'] },
  mov: { video: ['avc', 'hevc'], audio: ['aac'] },
  mkv: { video: ['avc', 'hevc', 'av1', 'vp9', 'vp8'], audio: ['aac', 'opus'] },
  webm: { video: ['vp8', 'vp9', 'av1'], audio: ['opus'] },
};

/** The WebCodecs codec string for a codec at a size and rate (levels high enough for it). */
export function codecString(codec, width, height, fps) {
  const pixels = width * height * fps;
  switch (codec) {
    case 'avc': return pixels > 1920 * 1080 * 60 ? 'avc1.640033' : pixels > 1920 * 1080 * 30 ? 'avc1.64002A' : 'avc1.640028';
    case 'hevc': return pixels > 1920 * 1080 * 60 ? 'hvc1.1.6.L153.B0' : 'hvc1.1.6.L123.B0';
    case 'av1': return pixels > 1920 * 1080 * 60 ? 'av01.0.12M.08' : 'av01.0.08M.08';
    case 'vp9': return 'vp09.00.41.08';
    case 'vp8': return 'vp8';
    case 'aac': return 'mp4a.40.2';
    case 'opus': return 'opus';
    default: return codec;
  }
}

/** Expands the file name format: %CCYY %YY %MM %DD %hh %mm %ss %FPS %CRES %ORES %VF and the strftime-like %Y-%m-%d %H-%M-%S. */
export function formatFileName(pattern, date = new Date(), info = {}) {
  const p = (n) => String(n).padStart(2, '0');
  const map = {
    '%CCYY': date.getFullYear(), '%YY': p(date.getFullYear() % 100), '%MM': p(date.getMonth() + 1), '%DD': p(date.getDate()),
    '%hh': p(date.getHours()), '%mm': p(date.getMinutes()), '%ss': p(date.getSeconds()),
    '%Y': date.getFullYear(), '%m': p(date.getMonth() + 1), '%d': p(date.getDate()), '%H': p(date.getHours()), '%M': p(date.getMinutes()), '%S': p(date.getSeconds()),
    '%FPS': info.fps ?? '', '%CRES': info.cres ?? '', '%ORES': info.ores ?? '', '%VF': info.vf ?? '',
  };
  const keys = Object.keys(map).sort((a, b) => b.length - a.length);
  let out = String(pattern || '%CCYY-%MM-%DD %hh-%mm-%ss');
  for (const k of keys) out = out.split(k).join(String(map[k]));
  return out.replace(/[\\/:*?"<>|]/g, '_').trim() || 'recording';
}

/** A name not in `existing` ("name", "name (2)", …) — "overwrite if file exists" off. */
export function uniqueFile(base, ext, existing) {
  const has = (n) => existing.has(`${n}.${ext}`);
  if (!has(base)) return `${base}.${ext}`;
  for (let i = 2; ; i++) if (!has(`${base} (${i})`)) return `${base} (${i}).${ext}`;
}

/** OGM chapter text (the sidecar of a recording; FFmpeg embeds it on remux). */
export function chapterText(chapters) {
  const t = (ms) => { const s = ms / 1000; const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${(s % 60).toFixed(3).padStart(6, '0')}`; };
  return chapters.map((c, i) => `CHAPTER${String(i + 1).padStart(2, '0')}=${t(c.time)}\nCHAPTER${String(i + 1).padStart(2, '0')}NAME=${c.name}`).join('\n') + '\n';
}

/** FFmpeg metadata with chapters (for -map_chapters on remux). */
export function ffmetadata(chapters, durationMs) {
  let out = ';FFMETADATA1\n';
  chapters.forEach((c, i) => { const end = chapters[i + 1]?.time ?? durationMs; out += `\n[CHAPTER]\nTIMEBASE=1/1000\nSTART=${Math.round(c.time)}\nEND=${Math.round(Math.max(c.time + 1, end))}\ntitle=${String(c.name).replace(/[=;#\\\n]/g, ' ')}\n`; });
  return out;
}

// ───────────────────────── encoders

export class VideoEncoderHub {
  constructor(engine, cfg) {
    this.engine = engine;
    this.cfg = cfg; // { codec, width, height, fps, bitrate (kbps), rateControl, cqp, keyint (s), hardware, latency }
    this.sinks = new Set();
    this.frames = 0;
    this.dropped = 0;
    this.encoded = 0;
    this.bytes = 0;
    this.forceKey = false;
    this.started = 0;
    this.decoderConfig = null;
  }
  static async supported(cfg) {
    if (typeof VideoEncoder === 'undefined') return false;
    try { return (await VideoEncoder.isConfigSupported(VideoEncoderHub.config(cfg))).supported === true; } catch { return false; }
  }
  static config(cfg) {
    const c = {
      codec: codecString(cfg.codec, cfg.width, cfg.height, cfg.fps), width: cfg.width, height: cfg.height, framerate: cfg.fps,
      bitrate: Math.max(100, cfg.bitrate) * 1000, bitrateMode: cfg.rateControl === 'CBR' ? 'constant' : cfg.rateControl === 'CQP' ? 'quantizer' : 'variable',
      hardwareAcceleration: cfg.hardware ?? 'no-preference', latencyMode: cfg.latency ?? 'quality', alpha: 'discard',
    };
    if (cfg.codec === 'avc') c.avc = { format: 'avc' };
    if (cfg.codec === 'hevc') c.hevc = { format: 'hevc' };
    if (c.bitrateMode === 'quantizer') delete c.bitrate;
    return c;
  }
  async start() {
    this.encoder = new VideoEncoder({
      output: (chunk, meta) => {
        if (meta?.decoderConfig) this.decoderConfig = meta.decoderConfig;
        this.encoded++;
        this.bytes += chunk.byteLength;
        const packet = EncodedPacket.fromEncodedChunk(chunk);
        for (const sink of this.sinks) sink.video(packet, meta, chunk.type === 'key');
      },
      error: (error) => { this.error = error; for (const sink of this.sinks) sink.fail?.(error); },
    });
    this.encoder.configure(VideoEncoderHub.config(this.cfg));
    this.started = performance.now();
    this.off = this.engine.onFrame((canvas, now) => this.onFrame(canvas, now));
  }
  /** One output frame (called by the compositor right after drawing it). */
  onFrame(canvas, now) {
    if (!this.encoder || this.encoder.state !== 'configured') return;
    this.frames++;
    // Encoding lag: more than half a second queued → skip the frame ("skipped due to encoding lag").
    if (this.encoder.encodeQueueSize > Math.max(2, this.cfg.fps / 2)) { this.dropped++; return; }
    const timestamp = Math.round((now - this.started) * 1000);
    let frame;
    try { frame = new VideoFrame(canvas, { timestamp, duration: Math.round(1e6 / this.cfg.fps), alpha: 'discard' }); } catch { this.dropped++; return; }
    const keyEvery = Math.max(1, Math.round((this.cfg.keyint || 2) * this.cfg.fps));
    const key = this.forceKey || this.frames % keyEvery === 1;
    this.forceKey = false;
    const options = { keyFrame: key };
    if (this.cfg.rateControl === 'CQP') { const q = Math.max(0, Math.min(51, this.cfg.cqp ?? 23)); options[this.cfg.codec] = { quantizer: q }; }
    try { this.encoder.encode(frame, options); } catch { this.dropped++; }
    frame.close();
  }
  requestKeyframe() { this.forceKey = true; }
  /** Waits for the frames already given to the encoder (a stopping output keeps its last packets). */
  async flush() { try { await this.encoder?.flush(); } catch { /* closed */ } }
  add(sink) { this.sinks.add(sink); if (this.decoderConfig) this.requestKeyframe(); }
  remove(sink) { this.sinks.delete(sink); }
  async stop() {
    this.off?.();
    try { await this.encoder?.flush(); } catch { /* closed */ }
    try { this.encoder?.close(); } catch { /* closed */ }
    this.encoder = null;
  }
}

export class AudioEncoderHub {
  constructor(mixer, track, cfg) {
    this.mixer = mixer;
    this.track = track;
    this.cfg = cfg; // { codec, bitrate (kbps), sampleRate, channels }
    this.sinks = new Set();
    this.decoderConfig = null;
    this.bytes = 0;
  }
  static async supported(cfg) {
    if (typeof AudioEncoder === 'undefined') return false;
    try { return (await AudioEncoder.isConfigSupported(AudioEncoderHub.config(cfg))).supported === true; } catch { return false; }
  }
  static config(cfg) { return { codec: codecString(cfg.codec), sampleRate: cfg.sampleRate, numberOfChannels: cfg.channels, bitrate: cfg.bitrate * 1000 }; }
  async start(startedAt) {
    this.encoder = new AudioEncoder({
      output: (chunk, meta) => {
        if (meta?.decoderConfig) this.decoderConfig = meta.decoderConfig;
        this.bytes += chunk.byteLength;
        const packet = EncodedPacket.fromEncodedChunk(chunk);
        for (const sink of this.sinks) sink.audio(this.track, packet, meta);
      },
      error: (error) => { this.error = error; for (const sink of this.sinks) sink.fail?.(error); },
    });
    this.encoder.configure(AudioEncoderHub.config(this.cfg));
    this.samples = 0;
    this.started = startedAt;
    this.untap = await this.mixer.tap(this.track, (data, frames) => {
      if (!this.encoder || this.encoder.state !== 'configured') return;
      const timestamp = Math.round((this.samples / this.cfg.sampleRate) * 1e6);
      this.samples += frames;
      const audio = new AudioData({ format: 'f32', sampleRate: this.cfg.sampleRate, numberOfFrames: frames, numberOfChannels: this.cfg.channels, timestamp, data });
      try { this.encoder.encode(audio); } catch { /* closed */ }
      audio.close();
    });
  }
  add(sink) { this.sinks.add(sink); }
  remove(sink) { this.sinks.delete(sink); }
  async flush() { try { await this.encoder?.flush(); } catch { /* closed */ } }
  async stop() {
    this.untap?.();
    try { await this.encoder?.flush(); } catch { /* closed */ }
    try { this.encoder?.close(); } catch { /* closed */ }
    this.encoder = null;
  }
}

// ───────────────────────── muxing

function formatOf(container, { live = false } = {}) {
  switch (container) {
    case 'mov': return new MovOutputFormat({ fastStart: false });
    case 'fmp4': return new Mp4OutputFormat({ fastStart: 'fragmented', minimumFragmentDuration: 1 });
    case 'mkv': return new MkvOutputFormat({ appendOnly: live, minimumClusterDuration: live ? 0.5 : 1 });
    case 'webm': return new WebMOutputFormat({ appendOnly: live, minimumClusterDuration: 1 });
    default: return new Mp4OutputFormat({ fastStart: false });
  }
}

/** A writable for mediabunny that hands { data, position } to a file sink: { write(data, position), close() }. */
function writableFor(sink) {
  return new WritableStream({
    write: (chunk) => sink.write(chunk.data, chunk.position),
    close: () => sink.close?.(),
    abort: () => sink.abort?.(),
  });
}

/**
 * One muxed file or stream: video + audio tracks fed with packets, timestamps moved so the first written
 * packet (a keyframe) starts at 0, minus any paused time.
 */
export class Muxer {
  constructor({ container, videoCodec, audioCodec, tracks = [0], target, frameRate = 30, live = false, names = [] }) {
    this.output = new Output({ format: formatOf(container, { live }), target });
    this.video = new EncodedVideoPacketSource(videoCodec);
    this.output.addVideoTrack(this.video, { frameRate });
    this.audio = new Map();
    for (const [i, track] of tracks.entries()) {
      const src = new EncodedAudioPacketSource(audioCodec);
      this.output.addAudioTrack(src, { name: names[i] ?? `Track ${track + 1}`, disposition: { default: i === 0 } });
      this.audio.set(track, src);
    }
    this.base = null;
    // Encoders give decoderConfig only with their first output: a file that joins a running encoder takes it
    // from these (set by the owner) for its first packet of each track.
    this.videoConfig = null; // () => VideoDecoderConfig
    this.audioConfig = null; // (track) => AudioDecoderConfig
    this.metaSent = new Set();
    this.chain = Promise.resolve();
    this.started = false;
    this.lastVideo = 0;
    this.bytes = 0;
  }
  async start() { await this.output.start(); this.started = true; }
  /** Adds a packet; waits for the first keyframe. `offset` (µs) is subtracted (pauses). */
  addVideo(packet, meta, key, offset = 0) {
    if (this.base == null) { if (!key) return false; this.base = packet.timestamp; }
    const ts = packet.timestamp - this.base - offset / 1e6;
    if (ts < 0) return false;
    this.lastVideo = ts;
    const p = packet.clone({ timestamp: ts });
    this.bytes += packet.byteLength;
    meta = this.firstMeta('video', meta, () => this.videoConfig?.());
    this.chain = this.chain.then(() => this.video.add(p, meta)).catch((error) => { this.error ??= error; });
    return true;
  }
  addAudio(track, packet, meta, offset = 0) {
    const src = this.audio.get(track);
    if (!src || this.base == null) return false;
    const ts = packet.timestamp - this.base - offset / 1e6;
    if (ts < 0) return false;
    this.bytes += packet.byteLength;
    const p = packet.clone({ timestamp: ts });
    meta = this.firstMeta(track, meta, () => this.audioConfig?.(track));
    this.chain = this.chain.then(() => src.add(p, meta)).catch((error) => { this.error ??= error; });
    return true;
  }
  firstMeta(key, meta, fallback) {
    if (this.metaSent.has(key)) return meta;
    this.metaSent.add(key);
    if (meta?.decoderConfig) return meta;
    const decoderConfig = fallback();
    return decoderConfig ? { ...meta, decoderConfig } : meta;
  }
  async finish() {
    await this.chain;
    if (this.base == null) { await this.output.cancel().catch(() => {}); return false; }
    await this.output.finalize();
    return true;
  }
  async cancel() { await this.chain.catch(() => {}); await this.output.cancel().catch(() => {}); }
}

// ───────────────────────── recording

/**
 * The recording: one file (or one after another when splitting). `files` opens file sinks:
 *   files.open(name) → { write(data, position), close(), path }.
 * Events: 'started', 'file' ({ path, bytes, duration }), 'stopped', 'error'.
 */
export class Recording {
  constructor({ video, audios, cfg, files, emit = () => {} }) {
    this.videoHub = video;
    this.audioHubs = audios; // Map track → AudioEncoderHub
    this.cfg = cfg; // { container, videoCodec, audioCodec, tracks, fps, split: { mode: 'off'|'time'|'size', minutes, mb }, name }
    this.files = files;
    this.emit = emit;
    this.paused = false;
    this.pausedAt = 0;
    this.pausedTotal = 0; // µs
    this.chapters = [];
    this.parts = [];
    this.splitDue = false;
    this.state = 'idle';
    this.startedWall = 0;
  }
  async start() {
    this.state = 'starting';
    await this.openPart();
    this.videoHub.add(this);
    for (const hub of this.audioHubs.values()) hub.add(this);
    this.videoHub.requestKeyframe();
    this.startedWall = Date.now();
    this.state = 'recording';
    this.emit('started', { path: this.part.path });
  }
  async openPart() {
    const index = this.parts.length;
    const name = this.cfg.name(index);
    const sink = await this.files.open(name);
    const target = new StreamTarget(writableFor(sink), { chunked: true, chunkSize: 4 * 1024 * 1024 });
    this.part = { path: sink.path ?? name, sink, muxer: new Muxer({ container: this.cfg.container, videoCodec: this.cfg.videoCodec, audioCodec: this.cfg.audioCodec, tracks: this.cfg.tracks, target, frameRate: this.cfg.fps, names: this.cfg.trackNames }), startedWall: Date.now(), chapters: [] };
    this.part.muxer.videoConfig = () => this.videoHub.decoderConfig;
    this.part.muxer.audioConfig = (track) => this.audioHubs.get(track)?.decoderConfig;
    await this.part.muxer.start();
    this.parts.push(this.part);
  }
  /** Seconds of picture in the current file (pauses excluded). */
  get duration() { return this.part?.muxer.lastVideo ?? 0; }
  get bytes() { return this.parts.reduce((n, p) => n + p.muxer.bytes, 0); }

  video(packet, meta, key) {
    if (this.state !== 'recording' && this.state !== 'paused') return;
    if (this.paused) return;
    const part = this.part;
    if (key && this.splitDue && part.muxer.base != null) { this.splitDue = false; this.rotate(packet, meta); return; }
    part.muxer.addVideo(packet, meta, key, this.pausedTotal - (part.offset ?? 0));
    const s = this.cfg.split;
    if (s?.mode === 'time' && this.duration >= s.minutes * 60 && !this.splitDue) { this.splitDue = true; this.videoHub.requestKeyframe(); }
    if (s?.mode === 'size' && part.muxer.bytes >= s.mb * 1024 * 1024 && !this.splitDue) { this.splitDue = true; this.videoHub.requestKeyframe(); }
  }
  audio(track, packet, meta) {
    if (this.paused || !this.part) return;
    this.part.muxer.addAudio(track, packet, meta, this.pausedTotal - (this.part.offset ?? 0));
  }
  /** Starts the next file at this keyframe (automatic or manual split). */
  async rotate(packet, meta) {
    const old = this.part;
    this.closing = (this.closing ?? Promise.resolve()).then(() => this.closePart(old));
    await this.openPart();
    this.part.offset = this.pausedTotal;
    this.part.muxer.addVideo(packet, meta, true, 0);
    this.emit('split', { path: this.part.path });
  }
  /** Manual split (the "Split recording file" hotkey). */
  split() { if (this.state === 'recording') { this.splitDue = true; this.videoHub.requestKeyframe(); } }
  pause() {
    if (this.state !== 'recording') return false;
    this.paused = true; this.state = 'paused'; this.pausedAt = performance.now();
    this.emit('paused');
    return true;
  }
  resume() {
    if (this.state !== 'paused') return false;
    this.pausedTotal += Math.round((performance.now() - this.pausedAt) * 1000);
    this.paused = false; this.state = 'recording';
    this.videoHub.requestKeyframe();
    this.emit('resumed');
    return true;
  }
  /** A chapter mark at the current position (shown in players that read chapters). */
  addChapter(name) {
    const time = Math.round(this.duration * 1000);
    const chapter = { time, name: name || `Chapter ${this.part.chapters.length + 1}` };
    this.part.chapters.push(chapter);
    this.chapters.push({ ...chapter, file: this.part.path });
    this.emit('chapter', chapter);
    return chapter;
  }
  async closePart(part) {
    const ok = await part.muxer.finish().catch((error) => { this.emit('error', error); return false; });
    await part.sink.close?.();
    const info = { path: part.path, bytes: part.muxer.bytes, duration: part.muxer.lastVideo, chapters: part.chapters, ok };
    if (part.chapters.length && this.files.writeText) await this.files.writeText(`${part.path.replace(/\.[^.\\/]+$/, '')}.chapters.txt`, chapterText(part.chapters)).catch(() => {});
    this.emit('file', info);
    return info;
  }
  async stop() {
    if (this.state === 'idle' || this.state === 'stopped') return [];
    this.state = 'stopping';
    await Promise.all([this.videoHub.flush?.(), ...[...this.audioHubs.values()].map((h) => h.flush?.())]);
    this.videoHub.remove(this);
    for (const hub of this.audioHubs.values()) hub.remove(this);
    await this.closing;
    const last = await this.closePart(this.part);
    this.state = 'stopped';
    this.emit('stopped', last);
    return this.parts.map((p) => p.path);
  }
}

// ───────────────────────── replay buffer

/**
 * Keeps the last `seconds` (and at most `maxMB`) of encoded packets, always starting at a keyframe.
 * save() muxes them into a file.
 */
export class ReplayBuffer {
  constructor({ video, audios, cfg, emit = () => {} }) {
    this.videoHub = video;
    this.audioHubs = audios;
    this.cfg = cfg; // { seconds, maxMB, container, videoCodec, audioCodec, tracks, fps }
    this.emit = emit;
    this.videoPackets = [];
    this.audioPackets = new Map();
    this.bytes = 0;
    this.on = false;
  }
  start() { this.on = true; this.videoHub.add(this); for (const hub of this.audioHubs.values()) hub.add(this); this.videoHub.requestKeyframe(); this.emit('started'); }
  stop() { this.on = false; this.videoHub.remove(this); for (const hub of this.audioHubs.values()) hub.remove(this); this.videoPackets = []; this.audioPackets.clear(); this.bytes = 0; this.emit('stopped'); }
  video(packet, meta, key) {
    if (!this.on) return;
    if (!this.videoPackets.length && !key) return;
    this.videoPackets.push({ packet, meta: meta?.decoderConfig ? meta : (this.videoMeta ? undefined : meta), key });
    if (meta?.decoderConfig) this.videoMeta = meta;
    this.bytes += packet.byteLength;
    this.trim();
  }
  audio(track, packet, meta) {
    if (!this.on || !this.videoPackets.length) return;
    if (meta?.decoderConfig) (this.audioMeta ??= new Map()).set(track, meta);
    let list = this.audioPackets.get(track);
    if (!list) { list = []; this.audioPackets.set(track, list); }
    list.push(packet);
    this.bytes += packet.byteLength;
  }
  /** Drops the oldest group of pictures while the buffer is too long or too big. */
  trim() {
    const v = this.videoPackets;
    const newest = v[v.length - 1].packet.timestamp;
    const tooLong = () => newest - v[0].packet.timestamp > this.cfg.seconds;
    const tooBig = () => this.bytes > this.cfg.maxMB * 1024 * 1024;
    while ((tooLong() || tooBig()) && v.length > 1) {
      // The next keyframe after the first one: everything before it goes.
      const next = v.findIndex((x, i) => i > 0 && x.key);
      if (next <= 0) break;
      if (!tooBig() && newest - v[next].packet.timestamp < this.cfg.seconds * 0.98 && newest - v[0].packet.timestamp <= this.cfg.seconds * 1.6) break;
      for (const x of v.splice(0, next)) this.bytes -= x.packet.byteLength;
      const from = v[0].packet.timestamp;
      for (const list of this.audioPackets.values()) { while (list.length && list[0].timestamp < from) this.bytes -= list.shift().byteLength; }
    }
  }
  get seconds() { const v = this.videoPackets; return v.length ? v[v.length - 1].packet.timestamp - v[0].packet.timestamp : 0; }
  /** The buffer as a file: { bytes: Uint8Array, seconds }. */
  async save() {
    if (!this.videoPackets.length) return null;
    const packets = this.videoPackets.slice();
    const audio = new Map([...this.audioPackets].map(([k, list]) => [k, list.slice()]));
    const target = new BufferTarget();
    const muxer = new Muxer({ container: this.cfg.container === 'fmp4' ? 'mp4' : this.cfg.container, videoCodec: this.cfg.videoCodec, audioCodec: this.cfg.audioCodec, tracks: [...audio.keys()], target, frameRate: this.cfg.fps });
    muxer.videoConfig = () => this.videoHub?.decoderConfig;
    muxer.audioConfig = (track) => this.audioHubs?.get(track)?.decoderConfig;
    await muxer.start();
    packets.forEach((x, i) => muxer.addVideo(x.packet, i === 0 ? this.videoMeta : undefined, x.key));
    for (const [track, list] of audio) list.forEach((p, i) => muxer.addAudio(track, p, i === 0 ? this.audioMeta?.get(track) : undefined));
    await muxer.finish();
    const seconds = this.seconds;
    this.emit('saved', { seconds });
    return { bytes: new Uint8Array(target.buffer), seconds };
  }
}

// ───────────────────────── streaming

/**
 * The stream: Matroska bytes (live, append-only) to a transport — transport.open(info) → { write(bytes), close() },
 * failing writes throw. Stream delay holds packets back `delay` seconds; reconnect retries.
 */
export class StreamOutput {
  constructor({ video, audios, cfg, transport, emit = () => {} }) {
    this.videoHub = video;
    this.audioHubs = audios;
    this.cfg = cfg; // { url, key, videoCodec, audioCodec, tracks: [0], fps, delay, preserveCutoff, reconnect: { enabled, delay, retries } }
    this.transport = transport;
    this.emit = emit;
    this.queue = [];
    this.state = 'idle';
    this.retries = 0;
    this.sent = 0;
    this.dropped = 0;
    this.startedAt = 0;
  }
  async start() {
    this.state = 'connecting';
    this.emit('connecting');
    await this.connect();
    this.videoHub.add(this);
    for (const hub of this.audioHubs.values()) hub.add(this);
    this.videoHub.requestKeyframe();
    this.startedAt = Date.now();
    this.timer = setInterval(() => this.flush(), 50);
    this.state = 'live';
    this.emit('started');
  }
  async connect() {
    this.conn = await this.transport.open({ url: this.cfg.url, key: this.cfg.key, container: 'mkv' });
    const conn = this.conn;
    const sink = { write: (data) => { if (this.conn !== conn) return; this.sent += data.byteLength; return conn.write(data); }, close: () => {} };
    const target = new StreamTarget(writableFor(sink));
    this.muxer = new Muxer({ container: 'mkv', videoCodec: this.cfg.videoCodec, audioCodec: this.cfg.audioCodec, tracks: this.cfg.tracks ?? [0], target, frameRate: this.cfg.fps, live: true });
    // Encoders that ran before this stream began give no decoderConfig any more: take theirs.
    this.muxer.videoConfig = () => this.videoHub.decoderConfig;
    this.muxer.audioConfig = (track) => this.audioHubs.get(track)?.decoderConfig;
    await this.muxer.start();
    conn.onClose = (error) => this.onLost(error);
    this.videoMetaSent = false;
    this.audioMetaSent = new Set();
  }
  video(packet, meta, key) {
    if (meta?.decoderConfig) this.videoMeta = meta;
    this.queue.push({ kind: 'v', packet, meta, key, at: performance.now() });
    if (!this.cfg.delay) this.flush();
  }
  audio(track, packet, meta) {
    if (meta?.decoderConfig) (this.audioMeta ??= new Map()).set(track, meta);
    this.queue.push({ kind: 'a', track, packet, meta, at: performance.now() });
  }
  /** Sends what has waited the stream delay (all of it when there is none). */
  flush() {
    if (this.state !== 'live' && this.state !== 'connecting') return;
    const wait = (this.cfg.delay || 0) * 1000;
    const now = performance.now();
    // Too much waiting (a stalled connection): drop to the next keyframe.
    if (!wait && this.queue.length > (this.cfg.fps || 30) * 4) {
      const k = this.queue.findIndex((x, i) => i > 0 && x.kind === 'v' && x.key);
      if (k > 0) { this.dropped += this.queue.slice(0, k).filter((x) => x.kind === 'v').length; this.queue.splice(0, k); }
    }
    while (this.queue.length && now - this.queue[0].at >= wait) {
      if (!this.muxer || this.state === 'reconnecting') break;
      const x = this.queue.shift();
      if (x.kind === 'v') {
        const meta = !this.videoMetaSent ? this.videoMeta ?? x.meta : x.meta;
        if (this.muxer.addVideo(x.packet, meta, x.key)) this.videoMetaSent = true;
      } else {
        const meta = !this.audioMetaSent.has(x.track) ? this.audioMeta?.get(x.track) ?? x.meta : undefined;
        if (this.muxer.addAudio(x.track, x.packet, meta)) this.audioMetaSent.add(x.track);
      }
    }
  }
  async onLost(error) {
    if (this.state !== 'live') return;
    const r = this.cfg.reconnect ?? { enabled: true, delay: 2, retries: 25 };
    this.muxer?.cancel();
    this.muxer = null;
    if (!r.enabled || this.retries >= r.retries) { this.state = 'failed'; this.emit('error', error ?? new Error('disconnected')); await this.stop(); return; }
    this.state = 'reconnecting';
    this.retries++;
    this.emit('reconnecting', { attempt: this.retries, of: r.retries, delay: r.delay });
    if (!this.cfg.preserveCutoff) this.queue = [];
    await new Promise((res) => setTimeout(res, r.delay * 1000));
    try {
      await this.connect();
      this.state = 'live';
      // A reconnected stream starts at a keyframe.
      const k = this.queue.findIndex((x) => x.kind === 'v' && x.key);
      this.queue = k >= 0 ? this.queue.slice(k) : [];
      this.videoHub.requestKeyframe();
      this.emit('reconnected', { attempt: this.retries });
      this.retries = 0;
    } catch (e) { this.state = 'live'; this.onLost(e); }
  }
  get kbps() {
    const now = performance.now();
    const last = this.lastRate ?? { at: now, sent: this.sent, kbps: 0 };
    if (now - last.at >= 1000) { this.lastRate = { at: now, sent: this.sent, kbps: ((this.sent - last.sent) * 8) / (now - last.at) }; return this.lastRate.kbps; }
    this.lastRate = last;
    return last.kbps;
  }
  async stop() {
    clearInterval(this.timer);
    this.videoHub.remove(this);
    for (const hub of this.audioHubs.values()) hub.remove(this);
    const wasLive = this.state !== 'idle' && this.state !== 'stopped';
    this.state = 'stopping';
    if (this.muxer) { this.flush(); await this.muxer.finish().catch(() => {}); }
    await this.conn?.close?.();
    this.conn = null;
    this.state = 'stopped';
    if (wasLive) this.emit('stopped');
  }
}

/** The ingest URL a service and its key give (with Twitch's bandwidth test switch). */
export function ingestUrl(server, key, { bandwidthTest = false, service = '' } = {}) {
  const base = String(server || '').replace(/\/+$/, '');
  if (/^(srt|rist):/i.test(base)) return key ? `${base}${base.includes('?') ? '&' : '?'}streamid=${encodeURIComponent(key)}` : base;
  const k = bandwidthTest && /twitch/i.test(service) ? `${key}?bandwidthtest=true` : key;
  return k ? `${base}/${k}` : base;
}
