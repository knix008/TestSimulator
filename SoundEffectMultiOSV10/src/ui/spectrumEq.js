import {
  EQ_BANDS,
  EQ_GAIN_MIN,
  EQ_GAIN_MAX,
  clampEqGain,
  formatHz
} from '../audio/eq.js';

/**
 * Interactive spectrum + graphic EQ editor.
 * Drag band handles up/down (or use nudge buttons) like a DAW EQ.
 */
export class SpectrumEqView {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.gains = options.gains || Object.fromEntries(EQ_BANDS.map((b) => [b.id, 0]));
    this.onChange = options.onChange || null;
    this.analyser = null;
    this.dragIndex = -1;
    this.hoverIndex = -1;
    this._bins = null;

    this._onDown = this._onDown.bind(this);
    this._onMove = this._onMove.bind(this);
    this._onUp = this._onUp.bind(this);
    this._onLeave = this._onLeave.bind(this);

    canvas.addEventListener('pointerdown', this._onDown);
    canvas.addEventListener('pointermove', this._onMove);
    canvas.addEventListener('pointerup', this._onUp);
    canvas.addEventListener('pointerleave', this._onLeave);
    canvas.style.cursor = 'ns-resize';

    this._ro = new ResizeObserver(() => this.resize());
    this._ro.observe(canvas.parentElement || canvas);
    this.resize();
  }

  setAnalyser(analyser) {
    this.analyser = analyser;
  }

  setGains(gains) {
    this.gains = { ...this.gains, ...gains };
    this.draw();
  }

  getGains() {
    return { ...this.gains };
  }

  nudge(bandId, delta) {
    this.gains[bandId] = clampEqGain((this.gains[bandId] || 0) + delta);
    this.onChange?.(this.getGains(), bandId);
    this.draw();
  }

  reset() {
    for (const band of EQ_BANDS) this.gains[band.id] = 0;
    this.onChange?.(this.getGains(), null);
    this.draw();
  }

  resize() {
    const parent = this.canvas.parentElement || this.canvas;
    const dpr = window.devicePixelRatio || 1;
    const w = parent.clientWidth;
    const h = parent.clientHeight || 160;
    this.canvas.width = Math.max(1, Math.floor(w * dpr));
    this.canvas.height = Math.max(1, Math.floor(h * dpr));
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.draw();
  }

  _layout() {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    const padL = 36;
    const padR = 12;
    const padT = 18;
    const padB = 28;
    return {
      w,
      h,
      padL,
      padR,
      padT,
      padB,
      plotW: w - padL - padR,
      plotH: h - padT - padB,
      plotX: padL,
      plotY: padT
    };
  }

  _freqToX(freq, layout) {
    const minF = 40;
    const maxF = 20000;
    const t = (Math.log(freq) - Math.log(minF)) / (Math.log(maxF) - Math.log(minF));
    return layout.plotX + t * layout.plotW;
  }

  _gainToY(db, layout) {
    const t = (db - EQ_GAIN_MIN) / (EQ_GAIN_MAX - EQ_GAIN_MIN);
    return layout.plotY + layout.plotH * (1 - t);
  }

  _yToGain(y, layout) {
    const t = 1 - (y - layout.plotY) / layout.plotH;
    return clampEqGain(EQ_GAIN_MIN + t * (EQ_GAIN_MAX - EQ_GAIN_MIN));
  }

  _hitTest(x, y) {
    const layout = this._layout();
    let best = -1;
    let bestDist = 18;
    for (let i = 0; i < EQ_BANDS.length; i++) {
      const band = EQ_BANDS[i];
      const hx = this._freqToX(band.freq, layout);
      const hy = this._gainToY(this.gains[band.id] || 0, layout);
      const d = Math.hypot(x - hx, y - hy);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    // Also allow grabbing by vertical strip near band x
    if (best < 0) {
      for (let i = 0; i < EQ_BANDS.length; i++) {
        const band = EQ_BANDS[i];
        const hx = this._freqToX(band.freq, layout);
        if (Math.abs(x - hx) < 14 && y >= layout.plotY && y <= layout.plotY + layout.plotH) {
          return i;
        }
      }
    }
    return best;
  }

  _onDown(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const idx = this._hitTest(x, y);
    if (idx >= 0) {
      this.dragIndex = idx;
      this.canvas.setPointerCapture(e.pointerId);
      this._applyDrag(y);
    }
  }

  _onMove(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (this.dragIndex >= 0) {
      this._applyDrag(y);
      return;
    }
    this.hoverIndex = this._hitTest(x, y);
    this.canvas.style.cursor = this.hoverIndex >= 0 ? 'ns-resize' : 'default';
    this.draw();
  }

  _applyDrag(y) {
    if (this.dragIndex < 0) return;
    const layout = this._layout();
    const band = EQ_BANDS[this.dragIndex];
    const db = this._yToGain(y, layout);
    if (Math.abs((this.gains[band.id] || 0) - db) < 0.05) return;
    this.gains[band.id] = db;
    this.onChange?.(this.getGains(), band.id);
    this.draw();
  }

  _onUp(e) {
    if (this.dragIndex >= 0) {
      this.dragIndex = -1;
      try {
        this.canvas.releasePointerCapture(e.pointerId);
      } catch (_) {
        /* ignore */
      }
    }
  }

  _onLeave() {
    this.hoverIndex = -1;
    this.draw();
  }

  draw() {
    const ctx = this.ctx;
    const layout = this._layout();
    const { w, h, plotX, plotY, plotW, plotH } = layout;
    const styles = getComputedStyle(document.documentElement);
    const bg = styles.getPropertyValue('--wave-bg').trim() || '#0b0f15';
    const grid = styles.getPropertyValue('--wave-grid').trim() || '#243044';
    const accent = styles.getPropertyValue('--accent').trim() || '#4da3ff';
    const text = styles.getPropertyValue('--text-muted').trim() || '#8b95a8';
    const hot = styles.getPropertyValue('--accent-hot').trim() || '#ff6b4a';
    const panel = styles.getPropertyValue('--bg-panel').trim() || '#151b25';

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // plot frame
    ctx.fillStyle = panel;
    ctx.globalAlpha = 0.35;
    ctx.fillRect(plotX, plotY, plotW, plotH);
    ctx.globalAlpha = 1;

    // dB grid
    ctx.strokeStyle = grid;
    ctx.fillStyle = text;
    ctx.font = '10px "IBM Plex Mono", monospace';
    ctx.textAlign = 'right';
    for (const db of [-12, -6, 0, 6, 12]) {
      const y = this._gainToY(db, layout);
      ctx.beginPath();
      ctx.moveTo(plotX, y);
      ctx.lineTo(plotX + plotW, y);
      ctx.stroke();
      ctx.fillText(`${db}`, plotX - 6, y + 3);
    }

    // zero line emphasis
    const zeroY = this._gainToY(0, layout);
    ctx.strokeStyle = accent;
    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    ctx.moveTo(plotX, zeroY);
    ctx.lineTo(plotX + plotW, zeroY);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // live spectrum bars (behind curve)
    if (this.analyser) {
      const bins = this._bins || (this._bins = new Uint8Array(this.analyser.frequencyBinCount));
      this.analyser.getByteFrequencyData(bins);
      const barCount = Math.min(96, bins.length);
      const barW = plotW / barCount;
      ctx.fillStyle = accent;
      for (let i = 0; i < barCount; i++) {
        // log-ish pick
        const idx = Math.floor((i / barCount) ** 1.6 * (bins.length - 1));
        const v = bins[idx] / 255;
        const bh = v * plotH * 0.85;
        ctx.globalAlpha = 0.22;
        ctx.fillRect(plotX + i * barW, plotY + plotH - bh, Math.max(1, barW - 0.8), bh);
      }
      ctx.globalAlpha = 1;
    }

    // EQ curve
    ctx.beginPath();
    const steps = 120;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const freq = Math.exp(Math.log(40) + t * (Math.log(20000) - Math.log(40)));
      let db = 0;
      for (const band of EQ_BANDS) {
        const g = this.gains[band.id] || 0;
        if (!g) continue;
        const ratio = freq / band.freq;
        const oct = Math.log2(Math.max(1e-6, ratio));
        db += g * Math.exp(-0.5 * (oct / 0.55) ** 2);
      }
      const x = this._freqToX(freq, layout);
      const y = this._gainToY(clampEqGain(db), layout);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.stroke();

    // fill under curve to zero
    ctx.lineTo(plotX + plotW, zeroY);
    ctx.lineTo(plotX, zeroY);
    ctx.closePath();
    ctx.fillStyle = accent;
    ctx.globalAlpha = 0.1;
    ctx.fill();
    ctx.globalAlpha = 1;

    // band handles (vertical fader knobs)
    for (let i = 0; i < EQ_BANDS.length; i++) {
      const band = EQ_BANDS[i];
      const db = this.gains[band.id] || 0;
      const x = this._freqToX(band.freq, layout);
      const y = this._gainToY(db, layout);
      const active = i === this.dragIndex || i === this.hoverIndex;

      // vertical guide
      ctx.strokeStyle = grid;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(x, plotY);
      ctx.lineTo(x, plotY + plotH);
      ctx.stroke();
      ctx.setLineDash([]);

      // track capsule
      ctx.fillStyle = active ? accent : grid;
      ctx.globalAlpha = active ? 0.25 : 0.15;
      ctx.beginPath();
      ctx.roundRect?.(x - 5, plotY, 10, plotH, 5);
      if (!ctx.roundRect) {
        ctx.fillRect(x - 5, plotY, 10, plotH);
      } else {
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // handle button
      const hw = active ? 16 : 14;
      const hh = active ? 22 : 18;
      ctx.fillStyle = db > 0.1 ? accent : db < -0.1 ? hot : styles.getPropertyValue('--bg-module').trim() || '#1e2836';
      ctx.strokeStyle = active ? accent : styles.getPropertyValue('--border-strong').trim() || '#44556f';
      ctx.lineWidth = 2;
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(x - hw / 2, y - hh / 2, hw, hh, 6);
        ctx.fill();
        ctx.stroke();
      } else {
        ctx.fillRect(x - hw / 2, y - hh / 2, hw, hh);
        ctx.strokeRect(x - hw / 2, y - hh / 2, hw, hh);
      }

      // grip lines
      ctx.strokeStyle = '#fff';
      ctx.globalAlpha = 0.85;
      ctx.lineWidth = 1;
      for (let g = -1; g <= 1; g++) {
        ctx.beginPath();
        ctx.moveTo(x - 4, y + g * 4);
        ctx.lineTo(x + 4, y + g * 4);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // labels
      ctx.fillStyle = text;
      ctx.font = '10px "IBM Plex Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(band.label || formatHz(band.freq), x, plotY + plotH + 14);
      if (active || Math.abs(db) > 0.05) {
        ctx.fillStyle = accent;
        ctx.fillText(`${db >= 0 ? '+' : ''}${db.toFixed(1)}`, x, plotY - 4);
      }
    }
  }
}
