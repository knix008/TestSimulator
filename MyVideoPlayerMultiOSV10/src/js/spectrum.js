/** @typedef {'rainbow' | 'mirror' | 'wave' | 'radial' | 'particles' | 'neon' | 'ribbon'} SpectrumStyleId */

export const SPECTRUM_STYLES = [
  { id: 'rainbow', labelKey: 'spectrumStyleRainbow' },
  { id: 'mirror', labelKey: 'spectrumStyleMirror' },
  { id: 'wave', labelKey: 'spectrumStyleWave' },
  { id: 'radial', labelKey: 'spectrumStyleRadial' },
  { id: 'particles', labelKey: 'spectrumStyleParticles' },
  { id: 'neon', labelKey: 'spectrumStyleNeon' },
  { id: 'ribbon', labelKey: 'spectrumStyleRibbon' }
];

export function normalizeSpectrumStyle(id) {
  return SPECTRUM_STYLES.some((s) => s.id === id) ? id : 'rainbow';
}

function hsl(h, s, l, a = 1) {
  const hh = ((h % 360) + 360) % 360;
  return a >= 1 ? `hsl(${hh} ${s}% ${l}%)` : `hsla(${hh} ${s}% ${l}% / ${a})`;
}

function sampleBins(data, count) {
  const out = new Float32Array(count);
  const n = data.length;
  for (let i = 0; i < count; i++) {
    const start = Math.floor((i / count) * n);
    const end = Math.max(start + 1, Math.floor(((i + 1) / count) * n));
    let sum = 0;
    for (let j = start; j < end; j++) sum += data[j];
    out[i] = sum / ((end - start) * 255);
  }
  return out;
}

/** Renders colorful spectrum styles onto a canvas. */
export class SpectrumPainter {
  /** @param {HTMLCanvasElement} canvas */
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    /** @type {SpectrumStyleId} */
    this.style = 'rainbow';
    this.bg = '#12141a';
    this._hueShift = 0;
    this._particles = [];
    this._waveHistory = [];
  }

  /** @param {string} styleId */
  setStyle(styleId) {
    this.style = normalizeSpectrumStyle(styleId);
    if (this.style !== 'particles') this._particles = [];
    if (this.style !== 'wave') this._waveHistory = [];
  }

  setBackground(color) {
    if (color) this.bg = color;
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width * dpr));
    const h = Math.max(1, Math.floor(rect.height * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  clear() {
    this.resize();
    const { width, height } = this.canvas;
    this.ctx.clearRect(0, 0, width, height);
  }

  /** @param {Uint8Array|number[]} data */
  paint(data) {
    if (!this.ctx || !data?.length) return;
    this.resize();
    const { width, height } = this.canvas;
    const ctx = this.ctx;
    this._hueShift = (this._hueShift + 0.6) % 360;

    ctx.fillStyle = this.bg || '#12141a';
    ctx.fillRect(0, 0, width, height);

    switch (this.style) {
      case 'mirror':
        this._drawMirror(ctx, width, height, data);
        break;
      case 'wave':
        this._drawWave(ctx, width, height, data);
        break;
      case 'radial':
        this._drawRadial(ctx, width, height, data);
        break;
      case 'particles':
        this._drawParticles(ctx, width, height, data);
        break;
      case 'neon':
        this._drawNeon(ctx, width, height, data);
        break;
      case 'ribbon':
        this._drawRibbon(ctx, width, height, data);
        break;
      case 'rainbow':
      default:
        this._drawRainbow(ctx, width, height, data);
        break;
    }
  }

  _drawRainbow(ctx, width, height, data) {
    const bars = Math.min(56, data.length);
    const values = sampleBins(data, bars);
    const gap = 2 * (window.devicePixelRatio || 1);
    const barWidth = (width - gap * (bars + 1)) / bars;
    const pad = 8 * (window.devicePixelRatio || 1);

    for (let i = 0; i < bars; i++) {
      const value = values[i];
      const barHeight = Math.max(2, value * (height - pad * 2));
      const x = gap + i * (barWidth + gap);
      const y = height - barHeight - pad;
      const hue = (i / bars) * 320 + this._hueShift;
      const grad = ctx.createLinearGradient(x, y + barHeight, x, y);
      grad.addColorStop(0, hsl(hue, 90, 42));
      grad.addColorStop(0.55, hsl(hue + 20, 95, 58));
      grad.addColorStop(1, hsl(hue + 40, 100, 72));
      ctx.fillStyle = grad;
      ctx.shadowColor = hsl(hue, 100, 60, 0.55);
      ctx.shadowBlur = 10;
      ctx.fillRect(x, y, Math.max(1, barWidth), barHeight);
    }
    ctx.shadowBlur = 0;
  }

  _drawMirror(ctx, width, height, data) {
    const bars = Math.min(40, data.length);
    const values = sampleBins(data, bars);
    const gap = 2 * (window.devicePixelRatio || 1);
    const barWidth = (width - gap * (bars + 1)) / bars;
    const mid = height / 2;

    for (let i = 0; i < bars; i++) {
      const value = values[i];
      const barHeight = Math.max(2, value * (mid - 10));
      const x = gap + i * (barWidth + gap);
      const hue = (i / bars) * 280 + this._hueShift * 1.2;
      const grad = ctx.createLinearGradient(x, mid - barHeight, x, mid + barHeight);
      grad.addColorStop(0, hsl(hue, 95, 68));
      grad.addColorStop(0.5, hsl(hue + 30, 100, 55));
      grad.addColorStop(1, hsl(hue + 60, 95, 68));
      ctx.fillStyle = grad;
      ctx.shadowColor = hsl(hue, 100, 60, 0.45);
      ctx.shadowBlur = 12;
      ctx.fillRect(x, mid - barHeight, Math.max(1, barWidth), barHeight * 2);
    }
    ctx.shadowBlur = 0;
  }

  _drawWave(ctx, width, height, data) {
    const points = Math.min(96, data.length);
    const values = sampleBins(data, points);
    this._waveHistory.push(values);
    if (this._waveHistory.length > 18) this._waveHistory.shift();

    const pad = 10 * (window.devicePixelRatio || 1);
    const usable = height - pad * 2;

    for (let layer = 0; layer < this._waveHistory.length; layer++) {
      const hist = this._waveHistory[layer];
      const age = layer / this._waveHistory.length;
      const alpha = 0.12 + age * 0.55;
      const hueBase = this._hueShift + layer * 14;
      ctx.beginPath();
      for (let i = 0; i < points; i++) {
        const x = (i / (points - 1)) * width;
        const y = pad + (1 - hist[i]) * usable * 0.85 + usable * 0.08;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = hsl(hueBase, 95, 60, alpha);
      ctx.lineWidth = 1.5 + age * 2.5;
      ctx.shadowColor = hsl(hueBase, 100, 60, alpha * 0.8);
      ctx.shadowBlur = 8;
      ctx.stroke();
    }

    const latest = this._waveHistory[this._waveHistory.length - 1];
    if (latest) {
      const grad = ctx.createLinearGradient(0, 0, width, 0);
      grad.addColorStop(0, hsl(this._hueShift, 95, 55, 0.35));
      grad.addColorStop(0.5, hsl(this._hueShift + 120, 95, 58, 0.35));
      grad.addColorStop(1, hsl(this._hueShift + 240, 95, 58, 0.35));
      ctx.beginPath();
      ctx.moveTo(0, height);
      for (let i = 0; i < points; i++) {
        const x = (i / (points - 1)) * width;
        const y = pad + (1 - latest[i]) * usable * 0.85 + usable * 0.08;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(width, height);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.shadowBlur = 0;
      ctx.fill();
    }
    ctx.shadowBlur = 0;
  }

  _drawRadial(ctx, width, height, data) {
    const bars = Math.min(72, data.length);
    const values = sampleBins(data, bars);
    const cx = width / 2;
    const cy = height / 2;
    const maxR = Math.min(width, height) * 0.42;
    const minR = maxR * 0.28;

    ctx.beginPath();
    ctx.arc(cx, cy, minR * 0.7, 0, Math.PI * 2);
    const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, minR);
    core.addColorStop(0, hsl(this._hueShift, 90, 65, 0.55));
    core.addColorStop(1, hsl(this._hueShift + 80, 90, 40, 0.05));
    ctx.fillStyle = core;
    ctx.fill();

    for (let i = 0; i < bars; i++) {
      const value = values[i];
      const angle = (i / bars) * Math.PI * 2 - Math.PI / 2;
      const len = minR + value * (maxR - minR);
      const hue = (i / bars) * 360 + this._hueShift;
      const x1 = cx + Math.cos(angle) * minR;
      const y1 = cy + Math.sin(angle) * minR;
      const x2 = cx + Math.cos(angle) * len;
      const y2 = cy + Math.sin(angle) * len;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = hsl(hue, 95, 60);
      ctx.lineWidth = Math.max(2, (Math.PI * 2 * minR) / bars * 0.7);
      ctx.lineCap = 'round';
      ctx.shadowColor = hsl(hue, 100, 60, 0.65);
      ctx.shadowBlur = 10;
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
  }

  _drawParticles(ctx, width, height, data) {
    const bands = Math.min(36, data.length);
    const values = sampleBins(data, bands);
    const energy = values.reduce((a, b) => a + b, 0) / bands;

    for (let i = 0; i < bands; i++) {
      if (values[i] > 0.35 && Math.random() < values[i] * 0.55) {
        this._particles.push({
          x: (i / bands) * width + (Math.random() - 0.5) * 12,
          y: height - values[i] * height * 0.85,
          vx: (Math.random() - 0.5) * 1.6,
          vy: -1.5 - values[i] * 4 - Math.random() * 2,
          life: 1,
          size: 2 + values[i] * 6,
          hue: (i / bands) * 320 + this._hueShift
        });
      }
    }
    if (this._particles.length > 220) {
      this._particles.splice(0, this._particles.length - 220);
    }

    const ground = ctx.createLinearGradient(0, height * 0.55, 0, height);
    ground.addColorStop(0, hsl(this._hueShift, 90, 50, 0));
    ground.addColorStop(1, hsl(this._hueShift + 40, 95, 50, 0.18 + energy * 0.25));
    ctx.fillStyle = ground;
    ctx.fillRect(0, 0, width, height);

    for (let i = this._particles.length - 1; i >= 0; i--) {
      const p = this._particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.06;
      p.life -= 0.018;
      if (p.life <= 0 || p.y > height + 10) {
        this._particles.splice(i, 1);
        continue;
      }
      ctx.beginPath();
      ctx.fillStyle = hsl(p.hue, 95, 62, p.life);
      ctx.shadowColor = hsl(p.hue, 100, 60, p.life);
      ctx.shadowBlur = 12;
      ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
  }

  _drawNeon(ctx, width, height, data) {
    const bars = Math.min(32, data.length);
    const values = sampleBins(data, bars);
    const gap = 4 * (window.devicePixelRatio || 1);
    const barWidth = (width - gap * (bars + 1)) / bars;
    const pad = 10 * (window.devicePixelRatio || 1);

    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, 0, width, height);

    for (let i = 0; i < bars; i++) {
      const value = Math.pow(values[i], 0.85);
      const barHeight = Math.max(3, value * (height - pad * 2));
      const x = gap + i * (barWidth + gap);
      const y = height - barHeight - pad;
      const hue = (i / bars) * 300 + this._hueShift * 1.5;
      const w = Math.max(2, barWidth);

      ctx.shadowColor = hsl(hue, 100, 60, 0.95);
      ctx.shadowBlur = 22;
      ctx.fillStyle = hsl(hue, 100, 62);
      ctx.fillRect(x, y, w, barHeight);

      ctx.shadowBlur = 8;
      ctx.fillStyle = hsl(hue, 100, 85);
      ctx.fillRect(x + w * 0.28, y, Math.max(1, w * 0.44), barHeight);
    }
    ctx.shadowBlur = 0;
  }

  _drawRibbon(ctx, width, height, data) {
    const rows = 6;
    const cols = Math.min(48, data.length);
    const values = sampleBins(data, cols);
    const rowH = height / rows;
    const gap = 1.5 * (window.devicePixelRatio || 1);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const boost = 1 - r / rows;
        const v = Math.min(1, values[c] * (0.55 + boost * 0.9));
        if (v < 0.08) continue;
        const cellW = width / cols;
        const x = c * cellW + gap;
        const y = height - (r + 1) * rowH + gap;
        const w = Math.max(1, cellW - gap * 2);
        const h = Math.max(1, rowH - gap * 2);
        const hue = (c / cols) * 300 + r * 18 + this._hueShift;
        ctx.fillStyle = hsl(hue, 92, 45 + v * 30, 0.35 + v * 0.65);
        ctx.shadowColor = hsl(hue, 100, 60, 0.35);
        ctx.shadowBlur = 6;
        ctx.fillRect(x, y, w, h * (0.55 + v * 0.45));
      }
    }
    ctx.shadowBlur = 0;
  }
}

/** Captures frequency data from a media element (no local canvas required). */
export class SpectrumAnalyzer {
  /**
   * @param {HTMLMediaElement} mediaEl
   * @param {{ onFrame?: (bins: Uint8Array) => void }} [options]
   */
  constructor(mediaEl, options = {}) {
    this.media = mediaEl;
    this.onFrame = options.onFrame || null;
    this.audioCtx = null;
    this.analyser = null;
    this.source = null;
    this.raf = 0;
    this.active = false;
    this.hasAudio = false;
    this._connected = false;
    this._bins = null;
  }

  async ensureGraph() {
    if (this._connected) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;

    this.audioCtx = new AudioContext();
    this.analyser = this.audioCtx.createAnalyser();
    this.analyser.fftSize = 512;
    this.analyser.smoothingTimeConstant = 0.78;
    this.source = this.audioCtx.createMediaElementSource(this.media);
    this.source.connect(this.analyser);
    this.analyser.connect(this.audioCtx.destination);
    this._connected = true;
  }

  async start() {
    try {
      await this.ensureGraph();
      if (!this.audioCtx) return;
      if (this.audioCtx.state === 'suspended') await this.audioCtx.resume();
      this.active = true;
      this.hasAudio = true;
      this._tick();
    } catch {
      this.hasAudio = false;
    }
  }

  stop() {
    this.active = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  _tick = () => {
    if (!this.active || !this.analyser) return;
    const len = this.analyser.frequencyBinCount;
    if (!this._bins || this._bins.length !== len) {
      this._bins = new Uint8Array(len);
    }
    this.analyser.getByteFrequencyData(this._bins);
    try {
      this.onFrame?.(this._bins);
    } catch {
      /* ignore consumer errors */
    }
    this.raf = requestAnimationFrame(this._tick);
  };
}
