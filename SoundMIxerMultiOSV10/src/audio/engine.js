import { createEffectChain, defaultEffectSettings, dbToGain } from './effects.js';

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.chain = null;
    this.settings = defaultEffectSettings();
    this.buffer = null;
    this.source = null;
    this.isPlaying = false;
    this.isPaused = false;
    this.loop = false;
    this.startOffset = 0;
    this.pausedAt = 0;
    this.startedAt = 0;
    this.selection = null; // { start, end } in seconds
    this.onEnded = null;
    this.masterGain = null;
  }

  async ensureContext() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.masterGain = this.ctx.createGain();
      this.masterGain.connect(this.ctx.destination);
      this.chain = createEffectChain(this.ctx, this.settings);
      this.chain.output.connect(this.masterGain);
    }
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
    return this.ctx;
  }

  getAnalyser() {
    return this.chain?.analyser || null;
  }

  setBuffer(buffer) {
    this.stop();
    this.buffer = buffer;
    this.startOffset = 0;
    this.pausedAt = 0;
    this.selection = null;
  }

  setSettings(partial) {
    this.settings = { ...this.settings, ...partial };
    if (this.chain) this.chain.apply(this.settings);
    if (this.source && this.isPlaying) {
      try {
        this.source.playbackRate.setTargetAtTime(
          this.settings.playbackRate,
          this.ctx.currentTime,
          0.01
        );
      } catch (_) {
        /* ignore */
      }
    }
  }

  resetSettings() {
    this.settings = defaultEffectSettings();
    if (this.chain) this.chain.apply(this.settings);
  }

  setLoop(loop) {
    this.loop = loop;
    if (this.source) this.source.loop = loop;
  }

  setSelection(sel) {
    this.selection = sel;
  }

  getCurrentTime() {
    if (!this.ctx || !this.isPlaying) return this.pausedAt;
    const rate = this.settings.playbackRate || 1;
    return this.startOffset + (this.ctx.currentTime - this.startedAt) * rate;
  }

  getDuration() {
    return this.buffer?.duration || 0;
  }

  async play(fromTime) {
    await this.ensureContext();
    if (!this.buffer) return;

    this.stopSourceOnly();

    const rate = this.settings.playbackRate || 1;
    let offset = fromTime ?? this.pausedAt ?? 0;
    let duration;

    if (this.selection) {
      offset = Math.max(this.selection.start, Math.min(offset, this.selection.end));
      duration = Math.max(0.01, this.selection.end - offset);
    } else {
      offset = Math.max(0, Math.min(offset, this.buffer.duration));
      duration = undefined;
    }

    const source = this.ctx.createBufferSource();
    source.buffer = this.buffer;
    source.playbackRate.value = rate;
    source.loop = this.loop && !this.selection;
    if (this.loop && this.selection) {
      source.loop = true;
      source.loopStart = this.selection.start;
      source.loopEnd = this.selection.end;
    }

    source.connect(this.chain.input);
    source.onended = () => {
      if (this.source !== source) return;
      this.isPlaying = false;
      this.isPaused = false;
      this.pausedAt = this.selection ? this.selection.start : 0;
      this.source = null;
      this.onEnded?.();
    };

    if (duration !== undefined && !(this.loop && this.selection)) {
      source.start(0, offset, duration);
    } else {
      source.start(0, offset);
    }

    this.source = source;
    this.startOffset = offset;
    this.startedAt = this.ctx.currentTime;
    this.isPlaying = true;
    this.isPaused = false;
  }

  pause() {
    if (!this.isPlaying) return;
    this.pausedAt = this.getCurrentTime();
    this.stopSourceOnly();
    this.isPlaying = false;
    this.isPaused = true;
  }

  stop() {
    this.stopSourceOnly();
    this.isPlaying = false;
    this.isPaused = false;
    this.pausedAt = this.selection ? this.selection.start : 0;
    this.startOffset = this.pausedAt;
  }

  stopSourceOnly() {
    if (this.source) {
      try {
        this.source.onended = null;
        this.source.stop();
      } catch (_) {
        /* already stopped */
      }
      this.source.disconnect();
      this.source = null;
    }
  }

  seek(time) {
    const wasPlaying = this.isPlaying;
    this.pausedAt = Math.max(0, Math.min(time, this.getDuration()));
    if (wasPlaying) this.play(this.pausedAt);
  }

  async decodeArrayBuffer(arrayBuffer, fileName = '') {
    await this.ensureContext();
    if (!arrayBuffer || !(arrayBuffer.byteLength > 0)) {
      throw new Error(`Empty audio data${fileName ? `: ${fileName}` : ''}`);
    }
    const copy = arrayBuffer.slice(0);
    try {
      return await this.ctx.decodeAudioData(copy);
    } catch (err) {
      const detail = err?.message || String(err);
      throw new Error(
        `Unsupported or corrupted audio${fileName ? ` (${fileName})` : ''}: ${detail}`
      );
    }
  }

  async generateTone({ type = 'sine', frequency = 440, duration = 2 }) {
    await this.ensureContext();
    const sampleRate = this.ctx.sampleRate;
    const length = Math.floor(sampleRate * duration);
    const buffer = this.ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);

    if (type === 'noise') {
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    } else {
      const omega = (2 * Math.PI * frequency) / sampleRate;
      for (let i = 0; i < length; i++) {
        const t = i;
        let sample = 0;
        switch (type) {
          case 'square':
            sample = Math.sin(omega * t) >= 0 ? 1 : -1;
            break;
          case 'sawtooth':
            sample = 2 * ((frequency * t) / sampleRate - Math.floor(0.5 + (frequency * t) / sampleRate));
            break;
          case 'triangle':
            sample = Math.asin(Math.sin(omega * t)) * (2 / Math.PI);
            break;
          default:
            sample = Math.sin(omega * t);
        }
        const attack = Math.min(1, i / (sampleRate * 0.01));
        const release = Math.min(1, (length - i) / (sampleRate * 0.05));
        data[i] = sample * 0.35 * attack * release;
      }
    }

    this.setBuffer(buffer);
    return buffer;
  }

  /**
   * Offline-render buffer through the current effect settings.
   */
  async renderOffline() {
    if (!this.buffer) return null;
    const rate = this.settings.playbackRate || 1;
    const duration = this.buffer.duration / rate + Math.max(this.settings.reverbDecay || 0, this.settings.delayTime * 4);
    const sampleRate = this.buffer.sampleRate;
    const offline = new OfflineAudioContext(
      this.buffer.numberOfChannels,
      Math.ceil(duration * sampleRate),
      sampleRate
    );

    const chain = createEffectChain(offline, this.settings);
    chain.output.connect(offline.destination);

    const source = offline.createBufferSource();
    source.buffer = this.buffer;
    source.playbackRate.value = rate;
    source.connect(chain.input);
    source.start(0);

    return offline.startRendering();
  }

  getPeakLevel() {
    const analyser = this.getAnalyser();
    if (!analyser) return 0;
    const data = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(data);
    let peak = 0;
    for (let i = 0; i < data.length; i++) {
      const v = Math.abs(data[i] - 128) / 128;
      if (v > peak) peak = v;
    }
    return peak;
  }
}

export { dbToGain, defaultEffectSettings };
