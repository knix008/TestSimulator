import { Icons } from './icons.js';

const VIEW_MODES = ['fit', 'fill', 'actual'];
const STORAGE_VIEW = 'av-editor-preview-view';
const STORAGE_VOLUME = 'av-editor-preview-volume';
const STORAGE_MUTED = 'av-editor-preview-muted';

export class Preview {
  constructor(container, { i18n, onTimeUpdate, onEnded, onDurationChange, onContextMenu }) {
    this.container = container;
    this.i18n = i18n;
    this.onTimeUpdate = onTimeUpdate;
    this.onEnded = onEnded;
    this.onDurationChange = onDurationChange;
    this.onContextMenu = onContextMenu;

    this.mediaEl = null;
    this.currentFile = null;
    this._rafId = null;
    this.viewMode = localStorage.getItem(STORAGE_VIEW) || 'fit';
    if (!VIEW_MODES.includes(this.viewMode)) this.viewMode = 'fit';

    const savedVol = parseFloat(localStorage.getItem(STORAGE_VOLUME) || '');
    this.volume = Number.isFinite(savedVol) ? Math.min(1, Math.max(0, savedVol)) : 1;
    this.isMuted = localStorage.getItem(STORAGE_MUTED) === '1';
    this._volumeBeforeMute = this.volume > 0 ? this.volume : 1;

    this.render();
  }

  render() {
    this.container.innerHTML = `
      <div class="preview-viewport view-fit" id="preview-viewport">
        <div class="preview-empty" id="preview-empty">
          ${Icons.video}
          <p id="preview-empty-text"></p>
        </div>
        <video id="preview-video" playsinline></video>
        <audio id="preview-audio" style="display:none;"></audio>
      </div>

      <div class="preview-controls">
        <button class="preview-ctrl-btn" id="prev-skip-back" data-i18n-tooltip="toolbar.skipBack">${Icons.skipBack}</button>
        <button class="preview-ctrl-btn" id="prev-rewind" data-i18n-tooltip="toolbar.rewind">${Icons.rewind}</button>
        <button class="preview-ctrl-btn play" id="prev-play-pause" data-i18n-tooltip="toolbar.play">${Icons.play}</button>
        <button class="preview-ctrl-btn" id="prev-stop" data-i18n-tooltip="toolbar.stop">${Icons.stop}</button>
        <button class="preview-ctrl-btn" id="prev-ff" data-i18n-tooltip="toolbar.fastForward">${Icons.fastForward}</button>
        <button class="preview-ctrl-btn" id="prev-skip-fwd" data-i18n-tooltip="toolbar.skipForward">${Icons.skipForward}</button>

        <input type="range" class="preview-seek-bar" id="prev-seek" min="0" max="1000" value="0" step="1"/>
        <span class="preview-time" id="prev-time">00:00:00 / 00:00:00</span>

        <div class="preview-volume" title="">
          <button class="preview-ctrl-btn" id="prev-mute" data-i18n-tooltip="preview.mute">${Icons.volume}</button>
          <input type="range" class="volume-slider" id="prev-vol" min="0" max="100" value="100" step="1" data-i18n-tooltip="preview.volume"/>
          <span class="volume-label" id="prev-vol-label">100%</span>
        </div>

        <div class="preview-view-modes" role="group">
          <button class="preview-ctrl-btn view-mode-btn" id="prev-view-fit" data-mode="fit" data-i18n-tooltip="preview.fitWindow">${Icons.fitWindow}</button>
          <button class="preview-ctrl-btn view-mode-btn" id="prev-view-fill" data-mode="fill" data-i18n-tooltip="preview.fillWindow">${Icons.fillWindow}</button>
          <button class="preview-ctrl-btn view-mode-btn" id="prev-view-actual" data-mode="actual" data-i18n-tooltip="preview.actualSize">${Icons.actualSize}</button>
        </div>

        <button class="preview-ctrl-btn" id="prev-fullscreen" data-i18n-tooltip="preview.fullscreen">${Icons.fullscreen}</button>
      </div>
    `;

    this.videoEl = this.container.querySelector('#preview-video');
    this.audioEl = this.container.querySelector('#preview-audio');
    this.emptyEl = this.container.querySelector('#preview-empty');
    this.emptyText = this.container.querySelector('#preview-empty-text');
    this.seekBar = this.container.querySelector('#prev-seek');
    this.timeDisplay = this.container.querySelector('#prev-time');
    this.playPauseBtn = this.container.querySelector('#prev-play-pause');
    this.muteBtn = this.container.querySelector('#prev-mute');
    this.volSlider = this.container.querySelector('#prev-vol');
    this.volLabel = this.container.querySelector('#prev-vol-label');
    this.viewport = this.container.querySelector('#preview-viewport');

    this.videoEl.style.display = 'none';

    this._updateEmptyText();
    this._bindControls();
    this._setupDropZone();
    this._bindContextMenu();
    this.setViewMode(this.viewMode, { persist: false });
    this._syncVolumeUI();
    this._applyVolume();

    this._resizeObs = new ResizeObserver(() => {
      if (this.viewMode === 'actual') this._applyActualSize();
    });
    this._resizeObs.observe(this.viewport);
  }

  _bindContextMenu() {
    this.container.addEventListener('contextmenu', (e) => {
      if (e.target.closest('input, button, select, textarea')) return;
      e.preventDefault();
      e.stopPropagation();
      this.onContextMenu?.(e.clientX, e.clientY, this.currentFile);
    });
  }

  _updateEmptyText() {
    if (this.emptyText) this.emptyText.textContent = this.i18n.t('preview.dropMedia');
  }

  _bindControls() {
    this.container.querySelector('#prev-skip-back').addEventListener('click', () => {
      if (this.mediaEl) { this.mediaEl.currentTime = 0; }
    });

    this.container.querySelector('#prev-rewind').addEventListener('click', () => {
      if (this.mediaEl) this.mediaEl.currentTime = Math.max(0, this.mediaEl.currentTime - 5);
    });

    this.playPauseBtn.addEventListener('click', () => this.togglePlay());

    this.container.querySelector('#prev-stop').addEventListener('click', () => {
      if (this.mediaEl) { this.mediaEl.pause(); this.mediaEl.currentTime = 0; this._updatePlayBtn(false); }
    });

    this.container.querySelector('#prev-ff').addEventListener('click', () => {
      if (this.mediaEl) {
        this.mediaEl.currentTime = Math.min(this.mediaEl.duration || 0, this.mediaEl.currentTime + 5);
      }
    });

    this.container.querySelector('#prev-skip-fwd').addEventListener('click', () => {
      if (this.mediaEl) this.mediaEl.currentTime = this.mediaEl.duration || 0;
    });

    this.seekBar.addEventListener('input', () => {
      if (this.mediaEl && this.mediaEl.duration) {
        this.mediaEl.currentTime = (this.seekBar.value / 1000) * this.mediaEl.duration;
      }
    });

    this.volSlider.addEventListener('input', (e) => {
      this.setVolume(Number(e.target.value) / 100);
    });

    this.muteBtn.addEventListener('click', () => this.toggleMute());

    this.container.querySelectorAll('.view-mode-btn').forEach((btn) => {
      btn.addEventListener('click', () => this.setViewMode(btn.dataset.mode));
    });

    this.container.querySelector('#prev-fullscreen').addEventListener('click', () => {
      if (!document.fullscreenElement) {
        this.viewport.requestFullscreen?.();
      } else {
        document.exitFullscreen?.();
      }
    });

    this.videoEl.addEventListener('loadedmetadata', () => {
      if (this.viewMode === 'actual') this._applyActualSize();
    });
  }

  /** @param {'fit'|'fill'|'actual'} mode */
  setViewMode(mode, { persist = true } = {}) {
    if (!VIEW_MODES.includes(mode)) mode = 'fit';
    this.viewMode = mode;
    if (persist) localStorage.setItem(STORAGE_VIEW, mode);

    this.viewport.classList.remove('view-fit', 'view-fill', 'view-actual');
    this.viewport.classList.add(`view-${mode}`);

    this.container.querySelectorAll('.view-mode-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    });

    // Clear inline size unless actual
    if (mode !== 'actual') {
      this.videoEl.style.width = '';
      this.videoEl.style.height = '';
    } else {
      this._applyActualSize();
    }
  }

  _applyActualSize() {
    if (this.viewMode !== 'actual' || this.videoEl.style.display === 'none') return;
    const w = this.videoEl.videoWidth || 0;
    const h = this.videoEl.videoHeight || 0;
    if (!w || !h) {
      this.videoEl.style.width = '';
      this.videoEl.style.height = '';
      return;
    }
    this.videoEl.style.width = `${w}px`;
    this.videoEl.style.height = `${h}px`;
  }

  cycleViewMode() {
    const idx = VIEW_MODES.indexOf(this.viewMode);
    this.setViewMode(VIEW_MODES[(idx + 1) % VIEW_MODES.length]);
  }

  _setupDropZone() {
    this.viewport.addEventListener('dragover', (e) => {
      e.preventDefault();
      this.viewport.classList.add('drag-over');
    });
    this.viewport.addEventListener('dragleave', () => this.viewport.classList.remove('drag-over'));
    this.viewport.addEventListener('drop', (e) => {
      e.preventDefault();
      this.viewport.classList.remove('drag-over');
      const data = e.dataTransfer.getData('application/av-editor-file');
      if (data) {
        try { this.loadFile(JSON.parse(data)); } catch { /* ignore */ }
      } else if (e.dataTransfer.files.length > 0) {
        const file = e.dataTransfer.files[0];
        this.loadBrowserFile(file);
      }
    });
  }

  _attachMediaEvents(el) {
    if (el._avEventsBound) return;
    el._avEventsBound = true;

    el.addEventListener('timeupdate', () => {
      const dur = el.duration || 0;
      const cur = el.currentTime || 0;
      if (dur > 0) this.seekBar.value = (cur / dur) * 1000;
      this.timeDisplay.textContent = `${this._fmt(cur)} / ${this._fmt(dur)}`;
      this.onTimeUpdate?.(cur, dur);
    });

    el.addEventListener('ended', () => {
      this._updatePlayBtn(false);
      this.onEnded?.();
    });

    el.addEventListener('durationchange', () => {
      this.onDurationChange?.(el.duration);
    });

    el.addEventListener('play', () => this._updatePlayBtn(true));
    el.addEventListener('pause', () => this._updatePlayBtn(false));
  }

  _updatePlayBtn(playing) {
    this.playPauseBtn.innerHTML = playing ? Icons.pause : Icons.play;
    this.playPauseBtn.setAttribute('data-tooltip', this.i18n.t(playing ? 'toolbar.pause' : 'toolbar.play'));
  }

  _fmt(secs) {
    if (!isFinite(secs)) secs = 0;
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = Math.floor(secs % 60);
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }

  loadFile(fileEntry) {
    this.currentFile = fileEntry;
    const ext = (fileEntry.extension || '').toLowerCase();
    const AUDIO = new Set(['.mp3','.wav','.aac','.flac','.ogg','.m4a','.wma','.opus','.aiff']);
    const isAudio = AUDIO.has(ext);

    this.videoEl.style.display = 'none';
    this.audioEl.style.display = 'none';
    this.emptyEl.style.display = 'none';

    if (isAudio) {
      this.mediaEl = this.audioEl;
      this.audioEl.style.display = 'block';
      const vp = this.viewport;
      const existing = vp.querySelector('.audio-placeholder');
      if (!existing) {
        const ph = document.createElement('div');
        ph.className = 'audio-placeholder';
        ph.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:12px;color:var(--text-secondary)';
        ph.innerHTML = `${Icons.audio}<div style="font-size:13px;max-width:200px;text-align:center;">${fileEntry.name}</div>`;
        vp.appendChild(ph);
      } else {
        existing.querySelector('div').textContent = fileEntry.name;
      }
    } else {
      this.mediaEl = this.videoEl;
      this.videoEl.style.display = 'block';
      const existing = this.viewport.querySelector('.audio-placeholder');
      if (existing) existing.remove();
    }

    if (typeof window.electronAPI !== 'undefined' && fileEntry.path) {
      this.mediaEl.src = `file://${fileEntry.path.replace(/\\/g, '/')}`;
    }

    this._attachMediaEvents(this.mediaEl);
    this._applyVolume();
    this.seekBar.value = 0;
    this.timeDisplay.textContent = '00:00:00 / 00:00:00';
    this._updatePlayBtn(false);
    this.setViewMode(this.viewMode, { persist: false });
  }

  loadBrowserFile(file) {
    const url = URL.createObjectURL(file);
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    const entry = { name: file.name, path: null, extension: ext, size: file.size };
    this.currentFile = entry;

    const AUDIO = new Set(['.mp3','.wav','.aac','.flac','.ogg','.m4a','.opus','.aiff']);
    const isAudio = AUDIO.has(ext);

    this.videoEl.style.display = 'none';
    this.audioEl.style.display = 'none';
    this.emptyEl.style.display = 'none';

    this.mediaEl = isAudio ? this.audioEl : this.videoEl;
    this.mediaEl.style.display = 'block';
    this.mediaEl.src = url;
    this._attachMediaEvents(this.mediaEl);
    this._applyVolume();
    this.seekBar.value = 0;
    this._updatePlayBtn(false);
    this.setViewMode(this.viewMode, { persist: false });
  }

  /** @param {number} level 0..1 */
  setVolume(level) {
    const v = Math.min(1, Math.max(0, Number(level) || 0));
    this.volume = v;
    if (v > 0) {
      this._volumeBeforeMute = v;
      this.isMuted = false;
    } else {
      this.isMuted = true;
    }
    localStorage.setItem(STORAGE_VOLUME, String(this.volume));
    localStorage.setItem(STORAGE_MUTED, this.isMuted ? '1' : '0');
    this._syncVolumeUI();
    this._applyVolume();
  }

  /** @param {number} delta -1..1 relative change */
  adjustVolume(delta) {
    this.setVolume(this.volume + delta);
  }

  toggleMute() {
    if (this.isMuted) {
      this.isMuted = false;
      if (this.volume <= 0) this.volume = this._volumeBeforeMute || 1;
    } else {
      this._volumeBeforeMute = this.volume > 0 ? this.volume : this._volumeBeforeMute || 1;
      this.isMuted = true;
    }
    localStorage.setItem(STORAGE_VOLUME, String(this.volume));
    localStorage.setItem(STORAGE_MUTED, this.isMuted ? '1' : '0');
    this._syncVolumeUI();
    this._applyVolume();
  }

  _applyVolume() {
    const level = this.isMuted ? 0 : this.volume;
    for (const el of [this.videoEl, this.audioEl]) {
      if (!el) continue;
      el.volume = this.volume;
      el.muted = this.isMuted || level <= 0;
    }
  }

  _syncVolumeUI() {
    if (this.volSlider) this.volSlider.value = String(Math.round(this.volume * 100));
    if (this.volLabel) this.volLabel.textContent = `${Math.round(this.volume * 100)}%`;
    if (this.muteBtn) {
      const silent = this.isMuted || this.volume <= 0;
      this.muteBtn.innerHTML = silent ? Icons.mute : Icons.volume;
      this.muteBtn.setAttribute(
        'data-tooltip',
        this.i18n.t(silent ? 'preview.unmute' : 'preview.mute')
      );
    }
  }

  togglePlay() {
    if (!this.mediaEl) return;
    if (this.mediaEl.paused) {
      this.mediaEl.play().catch(() => {});
    } else {
      this.mediaEl.pause();
    }
  }

  get isPlaying() { return this.mediaEl && !this.mediaEl.paused; }
  get currentTime() { return this.mediaEl?.currentTime ?? 0; }
  set currentTime(t) { if (this.mediaEl) this.mediaEl.currentTime = t; }
  get duration() { return this.mediaEl?.duration ?? 0; }

  showEmpty() {
    this.videoEl.style.display = 'none';
    this.audioEl.style.display = 'none';
    this.emptyEl.style.display = 'flex';
    const ph = this.viewport.querySelector('.audio-placeholder');
    if (ph) ph.remove();
    this.mediaEl = null;
    this.seekBar.value = 0;
    this.timeDisplay.textContent = '00:00:00 / 00:00:00';
  }

  updateTranslations() {
    this._updateEmptyText();
    this.container.querySelectorAll('[data-i18n-tooltip]').forEach(el => {
      if (el === this.muteBtn) return;
      el.setAttribute('data-tooltip', this.i18n.t(el.getAttribute('data-i18n-tooltip')));
    });
    this._syncVolumeUI();
  }
}
