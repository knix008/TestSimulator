/** @typedef {'rainbow' | 'mirror' | 'wave' | 'radial' | 'particles' | 'neon' | 'ribbon' | 'fire' | 'orbit' | 'tunnel' | 'stars' | 'pulse' | 'blocks' | 'spiral' | 'liquid'} SpectrumStyleId */

export const SPECTRUM_STYLES = [
  { id: 'rainbow', labelKey: 'spectrumStyleRainbow' },
  { id: 'mirror', labelKey: 'spectrumStyleMirror' },
  { id: 'wave', labelKey: 'spectrumStyleWave' },
  { id: 'radial', labelKey: 'spectrumStyleRadial' },
  { id: 'particles', labelKey: 'spectrumStyleParticles' },
  { id: 'neon', labelKey: 'spectrumStyleNeon' },
  { id: 'ribbon', labelKey: 'spectrumStyleRibbon' },
  { id: 'fire', labelKey: 'spectrumStyleFire' },
  { id: 'orbit', labelKey: 'spectrumStyleOrbit' },
  { id: 'tunnel', labelKey: 'spectrumStyleTunnel' },
  { id: 'stars', labelKey: 'spectrumStyleStars' },
  { id: 'pulse', labelKey: 'spectrumStylePulse' },
  { id: 'blocks', labelKey: 'spectrumStyleBlocks' },
  { id: 'spiral', labelKey: 'spectrumStyleSpiral' },
  { id: 'liquid', labelKey: 'spectrumStyleLiquid' }
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
    this._stars = [];
    this._pulses = [];
    this._orbitAngle = 0;
    this._tunnelZ = 0;
    this._spiralAngle = 0;
    this._peakHold = null;
  }

  /** @param {string} styleId */
  setStyle(styleId) {
    this.style = normalizeSpectrumStyle(styleId);
    if (this.style !== 'particles' && this.style !== 'fire') this._particles = [];
    if (this.style !== 'wave') this._waveHistory = [];
    if (this.style !== 'stars') this._stars = [];
    if (this.style !== 'pulse') this._pulses = [];
    if (this.style !== 'blocks') this._peakHold = null;
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
      case 'fire':
        this._drawFire(ctx, width, height, data);
        break;
      case 'orbit':
        this._drawOrbit(ctx, width, height, data);
        break;
      case 'tunnel':
        this._drawTunnel(ctx, width, height, data);
        break;
      case 'stars':
        this._drawStars(ctx, width, height, data);
        break;
      case 'pulse':
        this._drawPulse(ctx, width, height, data);
        break;
      case 'blocks':
        this._drawBlocks(ctx, width, height, data);
        break;
      case 'spiral':
        this._drawSpiral(ctx, width, height, data);
        break;
      case 'liquid':
        this._drawLiquid(ctx, width, height, data);
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

  _drawFire(ctx, width, height, data) {
    const bands = Math.min(40, data.length);
    const values = sampleBins(data, bands);
    const energy = values.reduce((a, b) => a + b, 0) / bands;

    for (let i = 0; i < bands; i++) {
      if (values[i] > 0.12 && Math.random() < 0.35 + values[i] * 0.55) {
        this._particles.push({
          x: ((i + 0.5) / bands) * width + (Math.random() - 0.5) * 8,
          y: height - 4,
          vx: (Math.random() - 0.5) * 1.2,
          vy: -2.2 - values[i] * 7 - Math.random() * 2,
          life: 0.7 + values[i] * 0.5,
          size: 3 + values[i] * 10,
          hue: 10 + values[i] * 45 + Math.random() * 15
        });
      }
    }
    if (this._particles.length > 280) {
      this._particles.splice(0, this._particles.length - 280);
    }

    const glow = ctx.createLinearGradient(0, height * 0.4, 0, height);
    glow.addColorStop(0, hsl(20, 100, 40, 0));
    glow.addColorStop(1, hsl(15, 100, 45, 0.12 + energy * 0.28));
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);

    for (let i = this._particles.length - 1; i >= 0; i--) {
      const p = this._particles[i];
      p.x += p.vx + Math.sin(p.y * 0.04 + this._hueShift) * 0.35;
      p.y += p.vy;
      p.vy *= 0.985;
      p.life -= 0.016;
      p.size *= 0.985;
      if (p.life <= 0 || p.y < -20) {
        this._particles.splice(i, 1);
        continue;
      }
      const t = 1 - p.life;
      const hue = p.hue + t * 40;
      ctx.beginPath();
      ctx.fillStyle = hsl(hue, 100, 55 + t * 20, p.life);
      ctx.shadowColor = hsl(hue, 100, 50, p.life * 0.9);
      ctx.shadowBlur = 14;
      ctx.arc(p.x, p.y, Math.max(1, p.size * p.life), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
  }

  _drawOrbit(ctx, width, height, data) {
    const rings = Math.min(8, Math.max(5, Math.floor(data.length / 24)));
    const values = sampleBins(data, rings * 12);
    const cx = width / 2;
    const cy = height / 2;
    const maxR = Math.min(width, height) * 0.46;
    this._orbitAngle += 0.018 + (values[0] || 0) * 0.04;

    for (let r = 0; r < rings; r++) {
      const base = (r + 1) / rings;
      const band = values.slice(r * 12, r * 12 + 12);
      const avg = band.length ? band.reduce((a, b) => a + b, 0) / band.length : 0;
      const radius = maxR * base * (0.72 + avg * 0.45);
      const hue = this._hueShift + r * 42;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.strokeStyle = hsl(hue, 90, 55, 0.2 + avg * 0.55);
      ctx.lineWidth = 1.5 + avg * 4;
      ctx.shadowColor = hsl(hue, 100, 60, 0.45);
      ctx.shadowBlur = 10;
      ctx.stroke();

      const dots = 10 + r * 2;
      for (let d = 0; d < dots; d++) {
        const a = this._orbitAngle * (1 + r * 0.15) + (d / dots) * Math.PI * 2 + r;
        const v = band[d % band.length] || avg;
        const rr = radius + v * 18;
        const x = cx + Math.cos(a) * rr;
        const y = cy + Math.sin(a) * rr;
        ctx.beginPath();
        ctx.fillStyle = hsl(hue + d * 8, 95, 62, 0.55 + v * 0.45);
        ctx.shadowBlur = 8;
        ctx.arc(x, y, 1.5 + v * 5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.shadowBlur = 0;
  }

  _drawTunnel(ctx, width, height, data) {
    const layers = 14;
    const values = sampleBins(data, layers);
    const cx = width / 2;
    const cy = height / 2;
    const energy = values.reduce((a, b) => a + b, 0) / layers;
    this._tunnelZ = (this._tunnelZ + 0.035 + energy * 0.08) % 1;

    for (let i = layers - 1; i >= 0; i--) {
      const depth = ((i / layers) + this._tunnelZ) % 1;
      const scale = 0.08 + depth * 0.92;
      const v = values[i];
      const rw = width * scale * (0.55 + v * 0.35);
      const rh = height * scale * (0.55 + v * 0.35);
      const hue = this._hueShift + i * 22 + depth * 80;
      const alpha = 0.15 + (1 - depth) * 0.55;
      ctx.strokeStyle = hsl(hue, 95, 55, alpha);
      ctx.lineWidth = 1.5 + v * 3;
      ctx.shadowColor = hsl(hue, 100, 60, alpha * 0.7);
      ctx.shadowBlur = 12;
      ctx.strokeRect(cx - rw / 2, cy - rh / 2, rw, rh);

      if (v > 0.35) {
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        const corner = (i % 4);
        const ox = corner === 0 || corner === 3 ? -rw / 2 : rw / 2;
        const oy = corner < 2 ? -rh / 2 : rh / 2;
        ctx.lineTo(cx + ox, cy + oy);
        ctx.strokeStyle = hsl(hue + 40, 100, 65, alpha * 0.45);
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
    ctx.shadowBlur = 0;
  }

  _drawStars(ctx, width, height, data) {
    const bands = Math.min(48, data.length);
    const values = sampleBins(data, bands);
    const energy = values.reduce((a, b) => a + b, 0) / bands;

    if (this._stars.length < 90) {
      while (this._stars.length < 90) {
        this._stars.push({
          x: Math.random() * width,
          y: Math.random() * height,
          z: 0.3 + Math.random() * 0.7,
          hue: Math.random() * 360,
          band: Math.floor(Math.random() * bands)
        });
      }
    }

    for (const s of this._stars) {
      const v = values[s.band % bands] || 0;
      s.x += (s.x - width / 2) * (0.002 + energy * 0.012);
      s.y += (s.y - height / 2) * (0.002 + energy * 0.012);
      if (s.x < -10 || s.x > width + 10 || s.y < -10 || s.y > height + 10) {
        s.x = width / 2 + (Math.random() - 0.5) * width * 0.2;
        s.y = height / 2 + (Math.random() - 0.5) * height * 0.2;
        s.z = 0.3 + Math.random() * 0.7;
        s.band = Math.floor(Math.random() * bands);
      }
      const size = (1 + v * 6) * s.z;
      const alpha = 0.25 + v * 0.75;
      ctx.beginPath();
      ctx.fillStyle = hsl(s.hue + this._hueShift * 0.3, 90, 70, alpha);
      ctx.shadowColor = hsl(s.hue, 100, 60, alpha);
      ctx.shadowBlur = 8 + v * 16;
      ctx.arc(s.x, s.y, size, 0, Math.PI * 2);
      ctx.fill();
    }

    // Soft nebula wash from low frequencies
    const bass = values.slice(0, 6).reduce((a, b) => a + b, 0) / 6;
    if (bass > 0.15) {
      const neb = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, Math.min(width, height) * 0.55);
      neb.addColorStop(0, hsl(this._hueShift + 200, 90, 55, bass * 0.22));
      neb.addColorStop(1, hsl(this._hueShift, 90, 40, 0));
      ctx.fillStyle = neb;
      ctx.shadowBlur = 0;
      ctx.fillRect(0, 0, width, height);
    }
    ctx.shadowBlur = 0;
  }

  _drawPulse(ctx, width, height, data) {
    const bands = Math.min(24, data.length);
    const values = sampleBins(data, bands);
    const bass = values.slice(0, 4).reduce((a, b) => a + b, 0) / 4;
    const mid = values.slice(4, 12).reduce((a, b) => a + b, 0) / 8;
    const cx = width / 2;
    const cy = height / 2;

    if (bass > 0.42 && (this._pulses.length === 0 || this._pulses[this._pulses.length - 1].r > 28)) {
      this._pulses.push({ r: 8, life: 1, hue: this._hueShift + mid * 120 });
    }
    if (this._pulses.length > 10) this._pulses.shift();

    for (let i = this._pulses.length - 1; i >= 0; i--) {
      const p = this._pulses[i];
      p.r += 3.5 + bass * 6;
      p.life -= 0.018;
      if (p.life <= 0) {
        this._pulses.splice(i, 1);
        continue;
      }
      ctx.beginPath();
      ctx.arc(cx, cy, p.r, 0, Math.PI * 2);
      ctx.strokeStyle = hsl(p.hue, 95, 60, p.life * 0.85);
      ctx.lineWidth = 2 + bass * 5;
      ctx.shadowColor = hsl(p.hue, 100, 55, p.life);
      ctx.shadowBlur = 16;
      ctx.stroke();
    }

    for (let i = 0; i < bands; i++) {
      const a0 = (i / bands) * Math.PI * 2 - Math.PI / 2;
      const a1 = ((i + 1) / bands) * Math.PI * 2 - Math.PI / 2;
      const v = values[i];
      const r0 = Math.min(width, height) * 0.12;
      const r1 = r0 + v * Math.min(width, height) * 0.32;
      ctx.beginPath();
      ctx.arc(cx, cy, r1, a0, a1);
      ctx.arc(cx, cy, r0, a1, a0, true);
      ctx.closePath();
      const hue = this._hueShift + (i / bands) * 300;
      ctx.fillStyle = hsl(hue, 92, 55, 0.35 + v * 0.55);
      ctx.shadowColor = hsl(hue, 100, 60, 0.4);
      ctx.shadowBlur = 8;
      ctx.fill();
    }
    ctx.shadowBlur = 0;
  }

  _drawBlocks(ctx, width, height, data) {
    const cols = Math.min(28, data.length);
    const rows = 16;
    const values = sampleBins(data, cols);
    if (!this._peakHold || this._peakHold.length !== cols) {
      this._peakHold = new Float32Array(cols);
    }
    const gap = 2 * (window.devicePixelRatio || 1);
    const cellW = (width - gap * (cols + 1)) / cols;
    const cellH = (height - gap * (rows + 1)) / rows;
    const pad = gap;

    for (let c = 0; c < cols; c++) {
      const v = values[c];
      this._peakHold[c] = Math.max(v, this._peakHold[c] - 0.012);
      const lit = Math.round(v * rows);
      const peakRow = Math.round(this._peakHold[c] * rows);
      for (let r = 0; r < rows; r++) {
        const on = r < lit;
        const isPeak = r === peakRow - 1;
        if (!on && !isPeak) continue;
        const x = pad + c * (cellW + gap);
        const y = height - pad - (r + 1) * (cellH + gap);
        const t = r / rows;
        const hue = isPeak ? this._hueShift + 40 : 110 - t * 90 + this._hueShift * 0.2;
        ctx.fillStyle = isPeak
          ? hsl(hue, 100, 70, 0.95)
          : hsl(hue, 90, 45 + t * 25, 0.75 + v * 0.25);
        ctx.shadowColor = hsl(hue, 100, 55, 0.35);
        ctx.shadowBlur = isPeak ? 10 : 4;
        ctx.fillRect(x, y, Math.max(1, cellW), Math.max(1, cellH));
      }
    }
    ctx.shadowBlur = 0;
  }

  _drawSpiral(ctx, width, height, data) {
    const points = Math.min(120, data.length);
    const values = sampleBins(data, points);
    const cx = width / 2;
    const cy = height / 2;
    const maxR = Math.min(width, height) * 0.48;
    this._spiralAngle += 0.04 + values[0] * 0.05;

    ctx.beginPath();
    for (let i = 0; i < points; i++) {
      const t = i / points;
      const a = this._spiralAngle + t * Math.PI * 6;
      const v = values[i];
      const r = t * maxR * (0.55 + v * 0.7);
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxR);
    grad.addColorStop(0, hsl(this._hueShift, 95, 65, 0.9));
    grad.addColorStop(0.5, hsl(this._hueShift + 120, 95, 55, 0.75));
    grad.addColorStop(1, hsl(this._hueShift + 240, 95, 50, 0.35));
    ctx.strokeStyle = grad;
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.shadowColor = hsl(this._hueShift + 80, 100, 60, 0.55);
    ctx.shadowBlur = 14;
    ctx.stroke();

    for (let i = 0; i < points; i += 3) {
      const t = i / points;
      const a = this._spiralAngle + t * Math.PI * 6;
      const v = values[i];
      const r = t * maxR * (0.55 + v * 0.7);
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      ctx.beginPath();
      ctx.fillStyle = hsl(this._hueShift + t * 300, 95, 62, 0.4 + v * 0.6);
      ctx.arc(x, y, 1.5 + v * 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
  }

  _drawLiquid(ctx, width, height, data) {
    const points = Math.min(64, data.length);
    const values = sampleBins(data, points);
    const pad = 8 * (window.devicePixelRatio || 1);
    const layers = 3;

    for (let layer = 0; layer < layers; layer++) {
      const phase = this._hueShift * 0.02 + layer * 1.1;
      const amp = 0.55 + layer * 0.18;
      const yBase = height * (0.55 + layer * 0.12);
      ctx.beginPath();
      ctx.moveTo(0, height);
      for (let i = 0; i < points; i++) {
        const x = (i / (points - 1)) * width;
        const wobble = Math.sin(i * 0.35 + phase) * 10 + Math.sin(i * 0.12 + phase * 1.7) * 6;
        const y = yBase - values[i] * (height - pad * 2) * amp - wobble;
        if (i === 0) ctx.lineTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.lineTo(width, height);
      ctx.closePath();
      const hue = this._hueShift + layer * 50;
      const grad = ctx.createLinearGradient(0, pad, 0, height);
      grad.addColorStop(0, hsl(hue, 90, 60, 0.15 + layer * 0.08));
      grad.addColorStop(0.55, hsl(hue + 40, 95, 50, 0.35 + layer * 0.1));
      grad.addColorStop(1, hsl(hue + 80, 90, 40, 0.55));
      ctx.fillStyle = grad;
      ctx.shadowColor = hsl(hue, 100, 55, 0.35);
      ctx.shadowBlur = 18;
      ctx.fill();
    }

    // Specular highlight line on top surface
    ctx.beginPath();
    for (let i = 0; i < points; i++) {
      const x = (i / (points - 1)) * width;
      const y = height * 0.55 - values[i] * (height - pad * 2) * 0.55
        - Math.sin(i * 0.35 + this._hueShift * 0.02) * 10;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = hsl(this._hueShift + 40, 100, 80, 0.55);
    ctx.lineWidth = 2;
    ctx.shadowBlur = 8;
    ctx.stroke();
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
    /** @type {GainNode | null} */
    this.gain = null;
    this.raf = 0;
    this.active = false;
    this.hasAudio = false;
    this._connected = false;
    this._bins = null;
    /** True after at least one live frame was painted (used to hold on pause). */
    this._hasFrame = false;
  }

  /** True once MediaElementSource owns output (volume must go through gain). */
  hasWebAudioOutput() {
    return Boolean(this._connected && this.gain);
  }

  /**
   * Playback loudness 0–1. Analyser stays pre-gain so spectrum is volume-independent.
   * @param {number} level01
   */
  setOutputLevel(level01) {
    if (!this.gain) return false;
    const v = Math.min(1, Math.max(0, Number(level01)));
    this.gain.gain.value = Number.isFinite(v) ? v : 0;
    return true;
  }

  getOutputLevel() {
    if (!this.gain) return null;
    return this.gain.gain.value;
  }

  /** Whether the display is holding the last live frame (pause / ended). */
  isHoldingFrame() {
    return Boolean(this._hasFrame && this.media && (this.media.paused || this.media.ended));
  }

  /** Re-paint the last bins (style / resize while paused). */
  repaintLast() {
    if (!this._hasFrame || !this._bins) return false;
    try {
      this.onFrame?.(this._bins);
      return true;
    } catch {
      return false;
    }
  }

  async ensureGraph() {
    if (this._connected) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;

    this.audioCtx = new AudioContext();
    this.analyser = this.audioCtx.createAnalyser();
    this.analyser.fftSize = 512;
    this.analyser.smoothingTimeConstant = 0.78;
    this.gain = this.audioCtx.createGain();

    // Capture current element volume into the gain node, then unlock the
    // element to unity so analysis is independent of the UI volume.
    const elVol = this.media.muted ? 0 : Math.min(1, Math.max(0, Number(this.media.volume) || 0));
    this.gain.gain.value = elVol;

    this.source = this.audioCtx.createMediaElementSource(this.media);
    // Parallel: full-level tap for spectrum, gain path for audible output.
    this.source.connect(this.analyser);
    this.source.connect(this.gain);
    this.gain.connect(this.audioCtx.destination);

    this.media.volume = 1;
    this.media.muted = false;
    this._connected = true;
  }

  async start() {
    try {
      await this.ensureGraph();
      if (!this.audioCtx) return;
      if (this.audioCtx.state === 'suspended') await this.audioCtx.resume();
      this.active = true;
      this.hasAudio = true;
      // Avoid stacking RAF loops when start() is called while already ticking.
      if (!this.raf) this._tick();
    } catch {
      this.hasAudio = false;
    }
  }

  stop() {
    this.active = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this._hasFrame = false;
  }

  _tick = () => {
    if (!this.active || !this.analyser) return;
    this.raf = 0;

    const hold = Boolean(this.media?.paused || this.media?.ended);
    // Keep the last painted frame while paused/stopped — do not sample silence decay.
    if (hold && this._hasFrame) return;

    const len = this.analyser.frequencyBinCount;
    if (!this._bins || this._bins.length !== len) {
      this._bins = new Uint8Array(len);
    }
    this.analyser.getByteFrequencyData(this._bins);
    this._hasFrame = true;
    try {
      this.onFrame?.(this._bins);
    } catch {
      /* ignore consumer errors */
    }

    if (hold) return;
    this.raf = requestAnimationFrame(this._tick);
  };
}
