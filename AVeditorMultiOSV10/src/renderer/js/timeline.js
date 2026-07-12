/**
 * Timeline — canvas-based multi-track editor
 */
export class Timeline {
  constructor(container, { i18n, onTimeChange, onClipSelect, onContextMenu }) {
    this.container = container;
    this.i18n = i18n;
    this.onTimeChange = onTimeChange;
    this.onClipSelect = onClipSelect;
    this.onContextMenu = onContextMenu;

    // State
    this.tracks = [];
    this.clips = [];
    this.selectedClip = null;
    this.currentTime = 0;
    this.duration = 120; // seconds (grows as clips are added)
    this.pixelsPerSecond = 60;
    this.scrollX = 0;

    // Layout constants
    this.LABEL_W = 110;
    this.HEADER_H = 28;
    this.TRACK_H = 52;

    // Interaction state
    this._dragging = null;    // { type:'playhead'|'clip'|'trim-left'|'trim-right', clip?, startX, startTime? }
    this._isDragging = false;

    this._theme = 'dark';

    this.render();
    this._setupDefaultTracks();
    this._startAnimLoop();
  }

  get colors() {
    const isDark = document.body.classList.contains('theme-dark');
    return {
      bg: isDark ? '#0f0f1a' : '#f0f0f7',
      panel: isDark ? '#16162a' : '#ffffff',
      border: isDark ? '#2a2a4a' : '#d0d0e8',
      text: isDark ? '#e8e8f0' : '#1a1a3a',
      textDim: isDark ? '#6060a0' : '#8080b0',
      trackEven: isDark ? '#1a1a30' : '#eaeaf5',
      trackOdd: isDark ? '#16162a' : '#f5f5fc',
      ruler: isDark ? '#12122a' : '#eaeaf5',
      rulerMark: isDark ? '#2a2a4a' : '#c0c0e0',
      playhead: '#ef4444',
      clipVideo1: isDark ? 'rgba(99,102,241,0.85)' : 'rgba(79,70,229,0.75)',
      clipVideo2: isDark ? 'rgba(124,58,237,0.85)' : 'rgba(109,40,217,0.75)',
      clipAudio1: isDark ? 'rgba(5,150,105,0.85)' : 'rgba(4,120,87,0.75)',
      clipAudio2: isDark ? 'rgba(8,145,178,0.85)' : 'rgba(7,89,133,0.75)',
    };
  }

  render() {
    this.container.innerHTML = `
      <div class="timeline-header">
        <span class="timeline-title" data-i18n="timeline.title"></span>
        <div class="timeline-controls">
          <button class="timeline-zoom-btn" id="tl-zoom-out" data-tooltip="−">−</button>
          <button class="timeline-zoom-btn" id="tl-zoom-in" data-tooltip="+">+</button>
          <button class="timeline-add-track-btn" id="tl-add-video">+ Video</button>
          <button class="timeline-add-track-btn" id="tl-add-audio">+ Audio</button>
        </div>
      </div>
      <div id="timeline-canvas-wrapper">
        <canvas id="timeline-canvas"></canvas>
        <div class="timeline-empty-msg" id="timeline-empty-msg"></div>
      </div>
      <div id="timeline-scroll">
        <div id="timeline-scroll-inner"></div>
      </div>
    `;

    this.canvas = this.container.querySelector('#timeline-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.wrapper = this.container.querySelector('#timeline-canvas-wrapper');
    this.emptyMsg = this.container.querySelector('#timeline-empty-msg');
    this.scrollEl = this.container.querySelector('#timeline-scroll');
    this.scrollInner = this.container.querySelector('#timeline-scroll-inner');

    this._updateEmptyMsg();
    this._bindControls();
    this._bindCanvasEvents();
    this._bindDropZone();
    this._bindScroll();

    const resizeObs = new ResizeObserver(() => this._resize());
    resizeObs.observe(this.wrapper);
    this._resize();
  }

  _setupDefaultTracks() {
    this.tracks = [
      { id: 'v1', type: 'video', label: () => this.i18n.t('timeline.videoTrack') + ' 1' },
      { id: 'v2', type: 'video', label: () => this.i18n.t('timeline.videoTrack') + ' 2' },
      { id: 'a1', type: 'audio', label: () => this.i18n.t('timeline.audioTrack') + ' 1' },
      { id: 'a2', type: 'audio', label: () => this.i18n.t('timeline.audioTrack') + ' 2' },
    ];
  }

  _resize() {
    const rect = this.wrapper.getBoundingClientRect();
    this.canvas.width = rect.width;
    this.canvas.height = Math.max(rect.height - 10, this.HEADER_H + this.tracks.length * this.TRACK_H);
    this._updateScrollWidth();
    this.draw();
  }

  _bindControls() {
    this.container.querySelector('#tl-zoom-in').addEventListener('click', () => {
      this.pixelsPerSecond = Math.min(300, this.pixelsPerSecond * 1.3);
      this._updateScrollWidth(); this.draw();
    });
    this.container.querySelector('#tl-zoom-out').addEventListener('click', () => {
      this.pixelsPerSecond = Math.max(10, this.pixelsPerSecond / 1.3);
      this._updateScrollWidth(); this.draw();
    });
    this.container.querySelector('#tl-add-video').addEventListener('click', () => this.addTrack('video'));
    this.container.querySelector('#tl-add-audio').addEventListener('click', () => this.addTrack('audio'));
  }

  _bindScroll() {
    this.scrollEl.addEventListener('scroll', () => {
      this.scrollX = this.scrollEl.scrollLeft;
      this.draw();
    });
  }

  _updateScrollWidth() {
    const totalW = this.LABEL_W + this.duration * this.pixelsPerSecond + 200;
    this.scrollInner.style.width = totalW + 'px';
  }

  _bindCanvasEvents() {
    this.canvas.addEventListener('mousedown', (e) => this._onMouseDown(e));
    this.canvas.addEventListener('mousemove', (e) => this._onMouseMove(e));
    this.canvas.addEventListener('mouseup', () => this._onMouseUp());
    this.canvas.addEventListener('mouseleave', () => this._onMouseUp());
    this.canvas.addEventListener('dblclick', (e) => this._onDblClick(e));
    this.canvas.addEventListener('contextmenu', (e) => this._onContextMenu(e));
    this.container.addEventListener('contextmenu', (e) => {
      if (e.target === this.canvas || this.canvas.contains(e.target)) return;
      if (e.target.closest('button, input, select, textarea')) return;
      e.preventDefault();
      e.stopPropagation();
      this.onContextMenu?.(e.clientX, e.clientY, null);
    });
  }

  _bindDropZone() {
    this.canvas.addEventListener('dragover', (e) => {
      e.preventDefault();
      this.canvas.style.outline = '2px dashed var(--accent)';
    });
    this.canvas.addEventListener('dragleave', () => { this.canvas.style.outline = ''; });
    this.canvas.addEventListener('drop', (e) => {
      e.preventDefault();
      this.canvas.style.outline = '';
      const data = e.dataTransfer.getData('application/av-editor-file');
      if (!data) return;
      try {
        const file = JSON.parse(data);
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left + this.scrollX;
        const dropTime = Math.max(0, (x - this.LABEL_W) / this.pixelsPerSecond);
        const trackIndex = Math.floor((e.clientY - rect.top - this.HEADER_H) / this.TRACK_H);
        const track = this.tracks[trackIndex] || this.tracks[0];
        if (track) this.addClip(file, track.id, dropTime);
      } catch { /* ignore */ }
    });
  }

  _posToTime(canvasX) {
    return (canvasX + this.scrollX - this.LABEL_W) / this.pixelsPerSecond;
  }

  _timeToX(t) {
    return this.LABEL_W + t * this.pixelsPerSecond - this.scrollX;
  }

  _getTrackY(index) {
    return this.HEADER_H + index * this.TRACK_H;
  }

  _hitTestPlayhead(cx) {
    const phX = this._timeToX(this.currentTime);
    return Math.abs(cx - phX) < 6;
  }

  _hitTestClip(cx, cy) {
    const trackIndex = Math.floor((cy - this.HEADER_H) / this.TRACK_H);
    if (trackIndex < 0 || trackIndex >= this.tracks.length) return null;
    const trackId = this.tracks[trackIndex].id;
    for (const clip of this.clips) {
      if (clip.trackId !== trackId) continue;
      const x1 = this._timeToX(clip.startTime);
      const x2 = this._timeToX(clip.startTime + clip.duration);
      if (cx >= x1 && cx <= x2) return { clip, trackIndex, x1, x2 };
    }
    return null;
  }

  _onMouseDown(e) {
    const rect = this.canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;

    // Click on ruler → seek
    if (cy <= this.HEADER_H) {
      const t = Math.max(0, this._posToTime(cx));
      this.currentTime = t;
      this.onTimeChange?.(t);
      this._dragging = { type: 'playhead', startX: cx };
      this._isDragging = true;
      return;
    }

    // Playhead drag
    if (this._hitTestPlayhead(cx)) {
      this._dragging = { type: 'playhead', startX: cx };
      this._isDragging = true;
      return;
    }

    // Clip interaction
    const hit = this._hitTestClip(cx, cy);
    if (hit) {
      const { clip, x1, x2 } = hit;
      this.selectedClip = clip;
      this.onClipSelect?.(clip);
      const TRIM = 8;
      if (cx - x1 < TRIM) {
        this._dragging = { type: 'trim-left', clip, startX: cx, origStart: clip.startTime, origDur: clip.duration };
      } else if (x2 - cx < TRIM) {
        this._dragging = { type: 'trim-right', clip, startX: cx, origDur: clip.duration };
      } else {
        this._dragging = { type: 'clip', clip, startX: cx, origStart: clip.startTime };
      }
      this._isDragging = true;
      this.draw();
      return;
    }

    // Deselect
    this.selectedClip = null;
    this.onClipSelect?.(null);
    this.draw();
  }

  _onMouseMove(e) {
    if (!this._isDragging || !this._dragging) return;
    const rect = this.canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const dx = cx - this._dragging.startX;
    const dt = dx / this.pixelsPerSecond;

    if (this._dragging.type === 'playhead') {
      this.currentTime = Math.max(0, this._posToTime(cx));
      this.onTimeChange?.(this.currentTime);
    } else if (this._dragging.type === 'clip') {
      const c = this._dragging.clip;
      c.startTime = Math.max(0, this._dragging.origStart + dt);
    } else if (this._dragging.type === 'trim-left') {
      const c = this._dragging.clip;
      const newStart = Math.max(0, this._dragging.origStart + dt);
      const delta = newStart - this._dragging.origStart;
      c.startTime = newStart;
      c.duration = Math.max(0.1, this._dragging.origDur - delta);
    } else if (this._dragging.type === 'trim-right') {
      const c = this._dragging.clip;
      c.duration = Math.max(0.1, this._dragging.origDur + dt);
    }
    this.draw();
  }

  _onMouseUp() {
    this._isDragging = false;
    this._dragging = null;
    this._updateDuration();
  }

  _onDblClick(e) {
    const rect = this.canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    if (cy > this.HEADER_H) {
      const hit = this._hitTestClip(cx, cy);
      if (hit) {
        this.onTimeChange?.(hit.clip.startTime);
      }
    }
  }

  _onContextMenu(e) {
    e.preventDefault();
    e.stopPropagation();
    const rect = this.canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;

    let clip = null;
    if (cy > this.HEADER_H) {
      const hit = this._hitTestClip(cx, cy);
      if (hit?.clip) {
        clip = hit.clip;
        this.selectedClip = clip;
        this.onClipSelect?.(clip);
        this.draw();
      }
    }

    if (this.onContextMenu) {
      this.onContextMenu(e.clientX, e.clientY, clip);
      return;
    }

    // Fallback if no external handler
    if (clip) this._showClipMenu(e);
  }

  _showClipMenu(e) {
    // Legacy fallback kept for safety; prefer ContextMenu via onContextMenu
    const existing = document.querySelector('.context-menu');
    if (existing) existing.remove();

    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';
    menu.innerHTML = `
      <div class="context-menu-item" id="ctx-split">${this.i18n.t('menu.splitClip')}</div>
      <div class="context-menu-separator"></div>
      <div class="context-menu-item danger" id="ctx-delete">${this.i18n.t('menu.deleteClip')}</div>
    `;
    document.body.appendChild(menu);

    menu.querySelector('#ctx-split').addEventListener('click', () => { this.splitSelectedClip(); menu.remove(); });
    menu.querySelector('#ctx-delete').addEventListener('click', () => { this.deleteSelectedClip(); menu.remove(); });

    const close = () => { menu.remove(); document.removeEventListener('click', close); };
    setTimeout(() => document.addEventListener('click', close), 50);
  }

  // ── Drawing ──────────────────────────────────────────────────────────────

  draw() {
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const C = this.colors;

    ctx.clearRect(0, 0, W, H);

    // Background
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);

    // Track backgrounds + labels
    this.tracks.forEach((track, i) => {
      const y = this._getTrackY(i);
      const isEven = i % 2 === 0;

      // Label area
      ctx.fillStyle = C.panel;
      ctx.fillRect(0, y, this.LABEL_W, this.TRACK_H);

      // Label text
      ctx.fillStyle = C.text;
      ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(track.label(), 10, y + this.TRACK_H / 2 + 4);

      // Color bar on label
      const barColor = this._trackColor(track, i);
      ctx.fillStyle = barColor;
      ctx.fillRect(0, y, 3, this.TRACK_H);

      // Content area
      ctx.fillStyle = isEven ? C.trackEven : C.trackOdd;
      ctx.fillRect(this.LABEL_W, y, W - this.LABEL_W, this.TRACK_H);

      // Track separator
      ctx.strokeStyle = C.border;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, y + this.TRACK_H);
      ctx.lineTo(W, y + this.TRACK_H);
      ctx.stroke();
    });

    // Label column right border
    ctx.strokeStyle = C.border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(this.LABEL_W, 0);
    ctx.lineTo(this.LABEL_W, H);
    ctx.stroke();

    // Draw ruler
    this._drawRuler(ctx, C);

    // Draw clips
    this.clips.forEach(clip => this._drawClip(ctx, clip, C));

    // Draw playhead
    this._drawPlayhead(ctx, C);

    // Empty state
    const hasClips = this.clips.length > 0;
    this.emptyMsg.style.display = hasClips ? 'none' : 'flex';
  }

  _drawRuler(ctx, C) {
    const W = this.canvas.width;
    ctx.fillStyle = C.ruler;
    ctx.fillRect(this.LABEL_W, 0, W - this.LABEL_W, this.HEADER_H);

    // Ruler bottom border
    ctx.strokeStyle = C.border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, this.HEADER_H);
    ctx.lineTo(W, this.HEADER_H);
    ctx.stroke();

    ctx.font = '10px -apple-system, "Segoe UI", monospace, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = C.textDim;

    // Determine tick interval based on zoom
    let tickSec = 1;
    if (this.pixelsPerSecond < 20) tickSec = 10;
    else if (this.pixelsPerSecond < 40) tickSec = 5;
    else if (this.pixelsPerSecond < 80) tickSec = 2;
    else if (this.pixelsPerSecond > 150) tickSec = 0.5;

    const startSec = Math.floor(this.scrollX / this.pixelsPerSecond);
    const endSec = startSec + Math.ceil(W / this.pixelsPerSecond) + tickSec * 2;

    for (let t = startSec - (startSec % tickSec); t <= endSec; t += tickSec) {
      const x = this._timeToX(t);
      if (x < this.LABEL_W || x > W) continue;

      const isMajor = Number.isInteger(t / (tickSec * 5)) || tickSec >= 5;
      ctx.strokeStyle = C.rulerMark;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, isMajor ? 0 : 14);
      ctx.lineTo(x, this.HEADER_H);
      ctx.stroke();

      if (isMajor || this.pixelsPerSecond > 60) {
        ctx.fillStyle = C.textDim;
        ctx.fillText(this._fmtTime(t), x + 3, 12);
      }
    }
  }

  _drawClip(ctx, clip, C) {
    const trackIndex = this.tracks.findIndex(t => t.id === clip.trackId);
    if (trackIndex === -1) return;
    const track = this.tracks[trackIndex];
    const y = this._getTrackY(trackIndex) + 4;
    const h = this.TRACK_H - 8;
    const x = this._timeToX(clip.startTime);
    const w = clip.duration * this.pixelsPerSecond;

    if (x + w < this.LABEL_W || x > this.canvas.width) return;

    const color = this._trackColor(track, trackIndex);
    const isSelected = clip === this.selectedClip;

    ctx.save();
    ctx.beginPath();
    this._roundRect(ctx, Math.max(x, this.LABEL_W), y, Math.min(w, this.canvas.width - Math.max(x, this.LABEL_W)), h, 4);
    ctx.clip();

    ctx.fillStyle = color;
    ctx.fillRect(Math.max(x, this.LABEL_W), y, Math.min(w, this.canvas.width - Math.max(x, this.LABEL_W)), h);

    // Waveform decoration (simple horizontal lines for audio)
    if (track.type === 'audio') {
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 5; i++) {
        const wy = y + h / 2 + (i - 2) * 5 + Math.sin(i * 1.2) * 3;
        ctx.beginPath();
        ctx.moveTo(Math.max(x, this.LABEL_W), wy);
        ctx.lineTo(Math.min(x + w, this.canvas.width), wy);
        ctx.stroke();
      }
    }

    // Clip label
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = 'bold 10px -apple-system, "Segoe UI", sans-serif';
    ctx.textAlign = 'left';
    const labelX = Math.max(x + 6, this.LABEL_W + 4);
    ctx.fillText(clip.name, labelX, y + h / 2 + 4);

    ctx.restore();

    // Border (selected)
    if (isSelected) {
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      this._roundRect(ctx, Math.max(x, this.LABEL_W), y, Math.min(w, this.canvas.width - Math.max(x, this.LABEL_W)), h, 4);
      ctx.stroke();

      // Trim handles
      ctx.fillStyle = 'white';
      ctx.fillRect(Math.max(x, this.LABEL_W), y + 2, 4, h - 4);
      ctx.fillRect(Math.min(x + w, this.canvas.width) - 4, y + 2, 4, h - 4);
    }
  }

  _drawPlayhead(ctx, C) {
    const x = this._timeToX(this.currentTime);
    if (x < this.LABEL_W || x > this.canvas.width) return;

    ctx.strokeStyle = C.playhead;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, this.canvas.height);
    ctx.stroke();

    // Triangle indicator
    ctx.fillStyle = C.playhead;
    ctx.beginPath();
    ctx.moveTo(x - 7, 0);
    ctx.lineTo(x + 7, 0);
    ctx.lineTo(x, 14);
    ctx.closePath();
    ctx.fill();
  }

  _trackColor(track, index) {
    const C = this.colors;
    const colorMap = { v1: C.clipVideo1, v2: C.clipVideo2, a1: C.clipAudio1, a2: C.clipAudio2 };
    if (colorMap[track.id]) return colorMap[track.id];
    return track.type === 'video' ? C.clipVideo1 : C.clipAudio1;
  }

  _roundRect(ctx, x, y, w, h, r) {
    if (w < 0) w = 0;
    if (h < 0) h = 0;
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  _fmtTime(secs) {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(Math.floor(s)).padStart(2,'0')}`;
    return `${String(m).padStart(2,'0')}:${String(s.toFixed(1)).padStart(4,'0')}`;
  }

  // ── Public API ───────────────────────────────────────────────────────────

  addClip(file, trackId, startTime = 0) {
    const ext = (file.extension || '').toLowerCase();
    const clip = {
      id: Date.now() + Math.random(),
      name: file.name,
      path: file.path,
      extension: ext,
      trackId,
      startTime,
      duration: 10, // default; updated if media metadata available
      file,
    };
    this.clips.push(clip);
    this._updateDuration();
    this.draw();
    this.emptyMsg.style.display = 'none';
    return clip;
  }

  addTrack(type) {
    const count = this.tracks.filter(t => t.type === type).length + 1;
    const id = `${type[0]}${this.tracks.length + 1}`;
    this.tracks.push({ id, type, label: () => `${this.i18n.t(`timeline.${type}Track`)} ${count}` });
    this._resize();
  }

  deleteSelectedClip() {
    if (!this.selectedClip) return;
    this.clips = this.clips.filter(c => c !== this.selectedClip);
    this.selectedClip = null;
    this.onClipSelect?.(null);
    this._updateDuration();
    this.draw();
  }

  splitSelectedClip() {
    if (!this.selectedClip) return;
    const clip = this.selectedClip;
    if (this.currentTime <= clip.startTime || this.currentTime >= clip.startTime + clip.duration) return;
    const newDur = this.currentTime - clip.startTime;
    const newClip = { ...clip, id: Date.now() + Math.random(), startTime: this.currentTime, duration: clip.duration - newDur };
    clip.duration = newDur;
    this.clips.push(newClip);
    this.draw();
  }

  setCurrentTime(t) {
    this.currentTime = t;
    this.draw();
  }

  _updateDuration() {
    let maxEnd = 60;
    this.clips.forEach(c => { const end = c.startTime + c.duration; if (end > maxEnd) maxEnd = end; });
    this.duration = maxEnd + 10;
    this._updateScrollWidth();
  }

  _updateEmptyMsg() {
    if (this.emptyMsg) this.emptyMsg.textContent = this.i18n.t('timeline.empty');
  }

  _startAnimLoop() {
    const loop = () => {
      if (this._needsRedraw) { this.draw(); this._needsRedraw = false; }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  zoomIn() { this.pixelsPerSecond = Math.min(300, this.pixelsPerSecond * 1.3); this._updateScrollWidth(); this.draw(); }
  zoomOut() { this.pixelsPerSecond = Math.max(10, this.pixelsPerSecond / 1.3); this._updateScrollWidth(); this.draw(); }

  updateTranslations() {
    this._updateEmptyMsg();
    this.draw();
  }

  getState() { return { tracks: this.tracks.map(t => ({ id: t.id, type: t.type })), clips: this.clips, duration: this.duration }; }
  loadState(state) {
    if (state.clips) this.clips = state.clips;
    if (state.duration) this.duration = state.duration;
    this._updateScrollWidth();
    this.draw();
  }
}
