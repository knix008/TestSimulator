export class WaveformView {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.buffer = null;
    this.zoom = 1;
    this.scroll = 0;
    this.playhead = 0;
    this.selection = null;
    this.peaks = null;
    this.onSeek = options.onSeek || null;
    this.onSelect = options.onSelect || null;
    this.dragging = null;

    this._bind();
    this._resizeObserver = new ResizeObserver(() => this.resize());
    this._resizeObserver.observe(canvas.parentElement || canvas);
    this.resize();
  }

  _bind() {
    this.canvas.addEventListener('pointerdown', (e) => this._onDown(e));
    this.canvas.addEventListener('pointermove', (e) => this._onMove(e));
    this.canvas.addEventListener('pointerup', (e) => this._onUp(e));
    this.canvas.addEventListener('pointerleave', (e) => this._onUp(e));
    this.canvas.addEventListener('wheel', (e) => this._onWheel(e), { passive: false });
  }

  setBuffer(buffer) {
    this.buffer = buffer;
    this.zoom = 1;
    this.scroll = 0;
    this.selection = null;
    this.peaks = buffer ? this._computePeaks(buffer, 4096) : null;
    this.draw();
  }

  setPlayhead(time) {
    this.playhead = time;
    this.draw();
  }

  setSelection(sel) {
    this.selection = sel;
    this.draw();
  }

  zoomIn() {
    this.zoom = Math.min(64, this.zoom * 1.5);
    this.draw();
  }

  zoomOut() {
    this.zoom = Math.max(1, this.zoom / 1.5);
    this.scroll = Math.min(this.scroll, Math.max(0, 1 - 1 / this.zoom));
    this.draw();
  }

  resize() {
    const parent = this.canvas.parentElement || this.canvas;
    const dpr = window.devicePixelRatio || 1;
    const w = parent.clientWidth;
    const h = parent.clientHeight;
    this.canvas.width = Math.max(1, Math.floor(w * dpr));
    this.canvas.height = Math.max(1, Math.floor(h * dpr));
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.draw();
  }

  _computePeaks(buffer, buckets) {
    const channels = Math.min(2, buffer.numberOfChannels);
    const result = [];
    for (let c = 0; c < channels; c++) {
      const channel = buffer.getChannelData(c);
      const block = Math.floor(channel.length / buckets) || 1;
      const mins = new Float32Array(buckets);
      const maxs = new Float32Array(buckets);
      for (let i = 0; i < buckets; i++) {
        let min = 1;
        let max = -1;
        const start = i * block;
        const end = Math.min(channel.length, start + block);
        for (let j = start; j < end; j++) {
          const v = channel[j];
          if (v < min) min = v;
          if (v > max) max = v;
        }
        mins[i] = min;
        maxs[i] = max;
      }
      result.push({ mins, maxs });
    }
    return { channels: result, duration: buffer.duration };
  }

  _timeAtX(x) {
    if (!this.buffer) return 0;
    const width = this.canvas.clientWidth;
    const visible = this.buffer.duration / this.zoom;
    const start = this.scroll * this.buffer.duration;
    return start + (x / width) * visible;
  }

  _xAtTime(t) {
    if (!this.buffer) return 0;
    const width = this.canvas.clientWidth;
    const visible = this.buffer.duration / this.zoom;
    const start = this.scroll * this.buffer.duration;
    return ((t - start) / visible) * width;
  }

  _onDown(e) {
    if (!this.buffer) return;
    this.canvas.setPointerCapture(e.pointerId);
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const time = this._timeAtX(x);
    if (e.shiftKey) {
      this.dragging = { type: 'select', start: time, end: time };
    } else {
      this.dragging = { type: 'seek' };
      this.onSeek?.(time);
    }
  }

  _onMove(e) {
    if (!this.dragging || !this.buffer) return;
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const time = this._timeAtX(x);
    if (this.dragging.type === 'select') {
      this.dragging.end = time;
      const start = Math.min(this.dragging.start, this.dragging.end);
      const end = Math.max(this.dragging.start, this.dragging.end);
      this.selection = { start, end };
      this.draw();
    } else if (this.dragging.type === 'seek') {
      this.onSeek?.(time);
    }
  }

  _onUp(e) {
    if (!this.dragging) return;
    if (this.dragging.type === 'select' && this.selection) {
      if (Math.abs(this.selection.end - this.selection.start) < 0.02) {
        this.selection = null;
      }
      this.onSelect?.(this.selection);
    }
    this.dragging = null;
    try {
      this.canvas.releasePointerCapture(e.pointerId);
    } catch (_) {
      /* ignore */
    }
  }

  _onWheel(e) {
    if (!this.buffer) return;
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      this.zoom = Math.min(64, Math.max(1, this.zoom * factor));
    } else {
      this.scroll += (e.deltaY > 0 ? 0.02 : -0.02) / this.zoom;
      this.scroll = Math.max(0, Math.min(1 - 1 / this.zoom, this.scroll));
    }
    this.draw();
  }

  draw() {
    const ctx = this.ctx;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    const styles = getComputedStyle(document.documentElement);
    const bg = styles.getPropertyValue('--wave-bg').trim() || '#0e1117';
    const wave = styles.getPropertyValue('--wave-color').trim() || '#3d9cf0';
    const grid = styles.getPropertyValue('--wave-grid').trim() || '#243044';
    const sel = styles.getPropertyValue('--wave-selection').trim() || 'rgba(61,156,240,0.2)';
    const play = styles.getPropertyValue('--wave-playhead').trim() || '#ff6b4a';
    const text = styles.getPropertyValue('--text-muted').trim() || '#8b95a8';

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    if (!this.buffer || !this.peaks) {
      ctx.fillStyle = text;
      ctx.font = '13px "DM Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('—', w / 2, h / 2 + 4);
      return;
    }

    const duration = this.buffer.duration;
    const visible = duration / this.zoom;
    const startTime = this.scroll * duration;
    const endTime = startTime + visible;
    const channelPeaks = this.peaks.channels;
    const laneCount = channelPeaks.length;
    const rulerH = 22;
    const laneGap = 2;
    const laneH = (h - rulerH - laneGap * (laneCount - 1)) / laneCount;

    // ruler background
    ctx.fillStyle = styles.getPropertyValue('--bg-panel').trim() || bg;
    ctx.fillRect(0, 0, w, rulerH);
    ctx.strokeStyle = grid;
    ctx.beginPath();
    ctx.moveTo(0, rulerH);
    ctx.lineTo(w, rulerH);
    ctx.stroke();

    if (this.selection) {
      const x1 = this._xAtTime(this.selection.start);
      const x2 = this._xAtTime(this.selection.end);
      ctx.fillStyle = sel;
      ctx.fillRect(Math.min(x1, x2), rulerH, Math.abs(x2 - x1), h - rulerH);
    }

    for (let c = 0; c < laneCount; c++) {
      const top = rulerH + c * (laneH + laneGap);
      const mid = top + laneH / 2;
      const amp = laneH * 0.42;
      const { mins, maxs } = channelPeaks[c];
      const total = mins.length;
      const startBucket = Math.floor((startTime / duration) * total);
      const endBucket = Math.ceil((endTime / duration) * total);

      ctx.strokeStyle = grid;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, mid);
      ctx.lineTo(w, mid);
      ctx.stroke();

      ctx.fillStyle = text;
      ctx.font = '10px "IBM Plex Mono", monospace';
      ctx.textAlign = 'left';
      ctx.fillText(laneCount > 1 ? (c === 0 ? 'L' : 'R') : 'M', 8, top + 14);

      ctx.strokeStyle = wave;
      ctx.globalAlpha = c === 0 ? 1 : 0.9;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = startBucket; i < endBucket; i++) {
        const t = (i / total) * duration;
        const x = this._xAtTime(t);
        ctx.moveTo(x, mid - maxs[i] * amp);
        ctx.lineTo(x, mid - mins[i] * amp);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;

      if (c < laneCount - 1) {
        ctx.fillStyle = grid;
        ctx.fillRect(0, top + laneH, w, laneGap);
      }
    }

    const px = this._xAtTime(this.playhead);
    if (px >= 0 && px <= w) {
      ctx.strokeStyle = play;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, h);
      ctx.stroke();
      ctx.fillStyle = play;
      ctx.beginPath();
      ctx.moveTo(px - 5, 0);
      ctx.lineTo(px + 5, 0);
      ctx.lineTo(px, 7);
      ctx.closePath();
      ctx.fill();
    }

    ctx.fillStyle = text;
    ctx.font = '11px "IBM Plex Mono", "Consolas", monospace';
    ctx.textAlign = 'left';
    const step = niceStep(visible / 8);
    const first = Math.ceil(startTime / step) * step;
    for (let t = first; t <= endTime; t += step) {
      const x = this._xAtTime(t);
      ctx.fillText(formatTime(t), x + 4, 15);
      ctx.strokeStyle = grid;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, rulerH);
      ctx.stroke();
    }
  }
}

function niceStep(raw) {
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / pow;
  if (n < 1.5) return pow;
  if (n < 3.5) return 2 * pow;
  if (n < 7.5) return 5 * pow;
  return 10 * pow;
}

export function formatTime(sec) {
  if (!Number.isFinite(sec)) return '0:00.000';
  const sign = sec < 0 ? '-' : '';
  sec = Math.abs(sec);
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.floor((sec % 1) * 1000);
  return `${sign}${m}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}
