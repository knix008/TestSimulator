import { Icons } from './icons.js';

const VIEW_MODES = ['fit', 'fill', 'actual'];
const STORAGE_VIEW = 'av-editor-preview-view';
const STORAGE_VOLUME = 'av-editor-preview-volume';
const STORAGE_MUTED = 'av-editor-preview-muted';
const VIDEO_EFFECT_PRESETS = {
  normal: { brightness: 100, contrast: 100, saturation: 100, speed: 1 },
  vivid: { brightness: 110, contrast: 112, saturation: 140, speed: 1 },
  cinematic: { brightness: 94, contrast: 126, saturation: 96, speed: 0.95 },
  noir: { brightness: 88, contrast: 118, saturation: 46, speed: 1 },
  warm: { brightness: 106, contrast: 112, saturation: 118, speed: 1 },
};
const AUDIO_EFFECT_PRESETS = {
  clean: { bass: 100, treble: 100, speed: 1 },
  voice: { bass: 96, treble: 108, speed: 1 },
  punch: { bass: 118, treble: 104, speed: 1 },
  mellow: { bass: 90, treble: 92, speed: 0.95 },
  radio: { bass: 108, treble: 112, speed: 1 },
};
const AUDIO_EXT = new Set(['.mp3','.wav','.aac','.flac','.ogg','.m4a','.wma','.opus','.aiff']);

export class Preview {
  constructor(container, {
    i18n,
    onTimeUpdate,
    onEnded,
    onDurationChange,
    onContextMenu,
    onTransportPlayToggle,
    onTransportStop,
    onTransportSeek,
  }) {
    this.container = container;
    this.i18n = i18n;
    this.onTimeUpdate = onTimeUpdate;
    this.onEnded = onEnded;
    this.onDurationChange = onDurationChange;
    this.onContextMenu = onContextMenu;
    this.onTransportPlayToggle = onTransportPlayToggle;
    this.onTransportStop = onTransportStop;
    this.onTransportSeek = onTransportSeek;

    this.mediaEl = null;
    this.currentFile = null;
    this.currentClip = null;
    this.currentMediaType = 'video';
    this.audioContext = null;
    this.audioSourceNode = null;
    this.audioLowShelf = null;
    this.audioHighShelf = null;
    this._rafId = null;
    this._lastEmittedTime = 0;
    this._scrubbing = false;
    this._ignoreSeekUntil = 0;
    this._transportLock = false;
    this.viewMode = localStorage.getItem(STORAGE_VIEW) || 'fit';
    if (!VIEW_MODES.includes(this.viewMode)) this.viewMode = 'fit';

    this.effectState = { preset: 'normal', ...VIDEO_EFFECT_PRESETS.normal, bass: 100, treble: 100 };

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
        <div class="preview-transport-cue" id="preview-transport-cue" hidden aria-hidden="true">
          <div class="preview-transport-cue-icon" id="preview-transport-cue-icon"></div>
        </div>
        <div class="preview-subtitle" id="preview-subtitle" hidden aria-live="polite"></div>
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

      <div class="preview-effects-panel" id="preview-effects-panel">
        <div class="preview-effect-group">
          <span class="preview-effect-label" data-i18n="preview.effectsLabel">Effects</span>
          <div class="preview-effect-presets" data-effect-group="video">
            <button class="preview-effect-btn active" data-preset="normal" data-i18n="preview.effectNormal">Normal</button>
            <button class="preview-effect-btn" data-preset="vivid" data-i18n="preview.effectVivid">Vivid</button>
            <button class="preview-effect-btn" data-preset="cinematic" data-i18n="preview.effectCinematic">Cinematic</button>
            <button class="preview-effect-btn" data-preset="noir" data-i18n="preview.effectNoir">Noir</button>
            <button class="preview-effect-btn" data-preset="warm" data-i18n="preview.effectWarm">Warm</button>
          </div>
          <div class="preview-effect-presets" data-effect-group="audio" style="display:none;">
            <button class="preview-effect-btn active" data-preset="clean" data-i18n="preview.effectClean">Clean</button>
            <button class="preview-effect-btn" data-preset="voice" data-i18n="preview.effectVoice">Voice</button>
            <button class="preview-effect-btn" data-preset="punch" data-i18n="preview.effectPunch">Punch</button>
            <button class="preview-effect-btn" data-preset="mellow" data-i18n="preview.effectMellow">Mellow</button>
            <button class="preview-effect-btn" data-preset="radio" data-i18n="preview.effectRadio">Radio</button>
          </div>
        </div>

        <div class="preview-effect-slider" data-effect-group="video">
          <span data-i18n="preview.effectBrightness">Bri.</span>
          <input type="range" id="prev-brightness" min="60" max="160" value="100" step="1"/>
        </div>
        <div class="preview-effect-slider" data-effect-group="video">
          <span data-i18n="preview.effectContrast">Con.</span>
          <input type="range" id="prev-contrast" min="60" max="160" value="100" step="1"/>
        </div>
        <div class="preview-effect-slider" data-effect-group="video">
          <span data-i18n="preview.effectSaturation">Sat.</span>
          <input type="range" id="prev-saturation" min="0" max="200" value="100" step="1"/>
        </div>
        <div class="preview-effect-slider" data-effect-group="audio" style="display:none;">
          <span data-i18n="preview.effectBass">Bass</span>
          <input type="range" id="prev-bass" min="60" max="160" value="100" step="1"/>
        </div>
        <div class="preview-effect-slider" data-effect-group="audio" style="display:none;">
          <span data-i18n="preview.effectTreble">Treble</span>
          <input type="range" id="prev-treble" min="60" max="160" value="100" step="1"/>
        </div>
        <div class="preview-effect-slider">
          <span data-i18n="preview.effectSpeed">Speed</span>
          <input type="range" id="prev-speed" min="50" max="200" value="100" step="5"/>
        </div>
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
    this.transportCue = this.container.querySelector('#preview-transport-cue');
    this.transportCueIcon = this.container.querySelector('#preview-transport-cue-icon');
    this.subtitleEl = this.container.querySelector('#preview-subtitle');
    this._subtitles = [];
    this._subtitlesVisible = true;
    this._activeSubtitleIndex = -1;
    this._cueSticky = false;
    this._cueTimer = null;
    this.effectPresetButtons = this.container.querySelectorAll('.preview-effect-btn');
    this.effectGroups = this.container.querySelectorAll('[data-effect-group]');
    this.brightnessSlider = this.container.querySelector('#prev-brightness');
    this.contrastSlider = this.container.querySelector('#prev-contrast');
    this.saturationSlider = this.container.querySelector('#prev-saturation');
    this.bassSlider = this.container.querySelector('#prev-bass');
    this.trebleSlider = this.container.querySelector('#prev-treble');
    this.speedSlider = this.container.querySelector('#prev-speed');

    this.videoEl.style.display = 'none';

    this._updateEmptyText();
    this._bindControls();
    this._bindEffectControls();
    this._setupDropZone();
    this._bindContextMenu();
    this.setViewMode(this.viewMode, { persist: false });
    this._syncVolumeUI();
    this._updateEffectGroupVisibility();
    this._syncEffectUI();
    this._applyVolume();
    this._applyEffectState();

    this._resizeObs = new ResizeObserver(() => {
      this._applyCurrentViewSizing();
    });
    this._resizeObs.observe(this.viewport);

    // Tooltips are applied after mount (i18n runs before components are built).
    this.container.querySelectorAll('[data-i18n-tooltip]').forEach((el) => {
      el.setAttribute('data-tooltip', this.i18n.t(el.getAttribute('data-i18n-tooltip')));
    });
    this._syncVolumeUI();
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
    // Click preview surface → play/pause (pause cue stays until next transport action)
    this.viewport.addEventListener('click', (e) => this._onViewportClick(e));

    this.playPauseBtn.addEventListener('click', () => {
      // Cue is shown inside _togglePlay / local toggle below.
      if (this.onTransportPlayToggle) this.onTransportPlayToggle();
      else {
        const willPause = !!this.isPlaying;
        this.showTransportCue(willPause ? 'pause' : 'play');
        this.togglePlay();
      }
    });

    this.container.querySelector('#prev-stop').addEventListener('click', () => {
      if (this.onTransportStop) {
        this.showTransportCue('stop');
        this.onTransportStop();
      } else {
        this.showTransportCue('stop');
        this.stop();
      }
    });

    this.container.querySelector('#prev-skip-back').addEventListener('click', () => {
      this.showTransportCue('skipBack');
      if (this.onTransportStop) this.onTransportStop();
      else this.stop();
    });

    this.container.querySelector('#prev-rewind').addEventListener('click', () => {
      this.showTransportCue('rewind');
      const mediaTime = Math.max(0, (this.mediaEl?.currentTime || 0) - 5);
      if (this.onTransportSeek) this.onTransportSeek(mediaTime);
      else this.seek(mediaTime);
    });

    this.container.querySelector('#prev-ff').addEventListener('click', () => {
      this.showTransportCue('fastForward');
      const dur = this.mediaEl?.duration || 0;
      const cur = this.mediaEl?.currentTime || 0;
      const mediaTime = dur > 0 ? Math.min(dur, cur + 5) : cur + 5;
      if (this.onTransportSeek) this.onTransportSeek(mediaTime);
      else this.seek(mediaTime);
    });

    this.container.querySelector('#prev-skip-fwd').addEventListener('click', () => {
      this.showTransportCue('skipForward');
      const mediaTime = this.mediaEl?.duration || 0;
      if (this.onTransportSeek) this.onTransportSeek(mediaTime);
      else this.seek(mediaTime);
    });

    this.seekBar.addEventListener('pointerdown', () => { this._scrubbing = true; });
    this.seekBar.addEventListener('pointerup', () => { this._scrubbing = false; this._emitMediaTime(true); });
    this.seekBar.addEventListener('pointercancel', () => { this._scrubbing = false; });
    this.seekBar.addEventListener('input', () => {
      if (this.mediaEl && this.mediaEl.duration) {
        this._scrubbing = true;
        const mediaTime = (this.seekBar.value / 1000) * this.mediaEl.duration;
        if (this.onTransportSeek) this.onTransportSeek(mediaTime);
        else this.seek(mediaTime);
      }
    });
    this.seekBar.addEventListener('change', () => {
      this._scrubbing = false;
      this._emitMediaTime(true);
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
      this._applyCurrentViewSizing();
    });
  }

  /** Click on video/audio preview surface toggles play/pause (same as transport button). */
  _onViewportClick(e) {
    if (!this.mediaEl || !this.currentFile) return;
    // Ignore interactive controls if any ever sit inside the viewport
    if (e.target.closest?.('button, input, select, textarea, a, label')) return;
    // Don't toggle when user is selecting text in overlays
    if (window.getSelection?.()?.type === 'Range') return;

    e.preventDefault();
    if (this.onTransportPlayToggle) {
      this.onTransportPlayToggle();
    } else {
      const willPause = !!this.isPlaying;
      this.showTransportCue(willPause ? 'pause' : 'play');
      this.togglePlay();
    }
  }

  /**
   * Flash a transport icon on the preview surface.
   * Pause stays visible until another transport cue is shown.
   * @param {'play'|'pause'|'stop'|'rewind'|'fastForward'|'skipBack'|'skipForward'} action
   */
  showTransportCue(action) {
    if (!this.transportCue || !this.transportCueIcon) return;

    const iconMap = {
      play: Icons.play,
      pause: Icons.pause,
      stop: Icons.stop,
      rewind: Icons.rewind,
      fastForward: Icons.fastForward,
      skipBack: Icons.skipBack,
      skipForward: Icons.skipForward,
    };
    const svg = iconMap[action];
    if (!svg) return;

    if (this._cueTimer != null) {
      clearTimeout(this._cueTimer);
      this._cueTimer = null;
    }

    // Keep cue above video / audio placeholder (browser compositor + DOM order).
    if (this.viewport && this.transportCue.parentElement === this.viewport) {
      this.viewport.appendChild(this.transportCue);
    }

    this._cueSticky = action === 'pause';
    this.transportCueIcon.innerHTML = svg;
    this.transportCue.hidden = false;
    this.transportCue.removeAttribute('hidden');
    this.transportCue.setAttribute('aria-hidden', 'false');
    this.transportCue.dataset.action = action;
    this.transportCue.classList.remove('is-pop');
    // Restart CSS pop animation
    void this.transportCue.offsetWidth;
    this.transportCue.classList.add('is-visible', 'is-pop');

    if (!this._cueSticky) {
      this._cueTimer = setTimeout(() => this._hideTransportCue(), 900);
    }
  }

  _hideTransportCue() {
    if (!this.transportCue) return;
    if (this._cueSticky) return;
    this.transportCue.classList.remove('is-visible', 'is-pop');
    this.transportCue.hidden = true;
    this.transportCue.setAttribute('aria-hidden', 'true');
  }

  clearTransportCue() {
    this._cueSticky = false;
    if (this._cueTimer != null) {
      clearTimeout(this._cueTimer);
      this._cueTimer = null;
    }
    this._hideTransportCue();
  }

  _bindEffectControls() {
    this.effectPresetButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        this.applyPreset(btn.dataset.preset);
      });
    });

    this.brightnessSlider?.addEventListener('input', (e) => {
      this.effectState.preset = 'custom';
      this.effectState.brightness = Number(e.target.value);
      this._syncEffectUI();
      this._applyEffectState();
    });
    this.contrastSlider?.addEventListener('input', (e) => {
      this.effectState.preset = 'custom';
      this.effectState.contrast = Number(e.target.value);
      this._syncEffectUI();
      this._applyEffectState();
    });
    this.saturationSlider?.addEventListener('input', (e) => {
      this.effectState.preset = 'custom';
      this.effectState.saturation = Number(e.target.value);
      this._syncEffectUI();
      this._applyEffectState();
    });
    this.bassSlider?.addEventListener('input', (e) => {
      this.effectState.preset = 'custom';
      this.effectState.bass = Number(e.target.value);
      this._syncEffectUI();
      this._applyEffectState();
    });
    this.trebleSlider?.addEventListener('input', (e) => {
      this.effectState.preset = 'custom';
      this.effectState.treble = Number(e.target.value);
      this._syncEffectUI();
      this._applyEffectState();
    });
    this.speedSlider?.addEventListener('input', (e) => {
      this.effectState.preset = 'custom';
      this.effectState.speed = Number(e.target.value) / 100;
      this._syncEffectUI();
      this._applyEffectState();
    });
  }

  _getPresetMap() {
    return this.currentMediaType === 'audio' ? AUDIO_EFFECT_PRESETS : VIDEO_EFFECT_PRESETS;
  }

  _getDefaultEffectState() {
    const presetMap = this._getPresetMap();
    const defaultPreset = this.currentMediaType === 'audio' ? AUDIO_EFFECT_PRESETS.clean : VIDEO_EFFECT_PRESETS.normal;
    return {
      preset: this.currentMediaType === 'audio' ? 'clean' : 'normal',
      brightness: VIDEO_EFFECT_PRESETS.normal.brightness,
      contrast: VIDEO_EFFECT_PRESETS.normal.contrast,
      saturation: VIDEO_EFFECT_PRESETS.normal.saturation,
      bass: AUDIO_EFFECT_PRESETS.clean.bass,
      treble: AUDIO_EFFECT_PRESETS.clean.treble,
      speed: 1,
      ...defaultPreset,
    };
  }

  applyPreset(presetKey) {
    const presetMap = this._getPresetMap();
    const preset = presetMap[presetKey] || presetMap.normal;
    this.effectState = {
      ...this._getDefaultEffectState(),
      preset: presetKey,
      ...preset,
    };
    this._syncEffectUI();
    this._applyEffectState();
  }

  applyClipEffects(clip) {
    this.currentClip = clip;
    const defaults = this._getDefaultEffectState();
    if (!clip) {
      this.effectState = { ...defaults };
      this._syncEffectUI();
      this._applyEffectState();
      return;
    }

    const next = clip?.effects || {};
    this.effectState = {
      ...defaults,
      preset: next.preset || defaults.preset,
      brightness: Number(next.brightness ?? defaults.brightness),
      contrast: Number(next.contrast ?? defaults.contrast),
      saturation: Number(next.saturation ?? defaults.saturation),
      bass: Number(next.bass ?? defaults.bass),
      treble: Number(next.treble ?? defaults.treble),
      speed: Number(next.speed ?? defaults.speed),
    };
    this._syncEffectUI();
    this._applyEffectState();
  }

  _applyEffectState() {
    const brightness = Number(this.effectState.brightness ?? VIDEO_EFFECT_PRESETS.normal.brightness);
    const contrast = Number(this.effectState.contrast ?? VIDEO_EFFECT_PRESETS.normal.contrast);
    const saturation = Number(this.effectState.saturation ?? VIDEO_EFFECT_PRESETS.normal.saturation);
    const filter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)`;
    if (this.videoEl) this.videoEl.style.filter = this.currentMediaType === 'video' ? filter : 'none';
    if (this.audioEl) this.audioEl.style.filter = 'none';

    if (this.mediaEl) {
      this.mediaEl.playbackRate = Math.max(0.5, Math.min(2, Number(this.effectState.speed ?? 1)));
    }

    if (this.currentMediaType === 'audio' && this.audioLowShelf && this.audioHighShelf) {
      const bass = Number(this.effectState.bass ?? AUDIO_EFFECT_PRESETS.clean.bass);
      const treble = Number(this.effectState.treble ?? AUDIO_EFFECT_PRESETS.clean.treble);
      this.audioLowShelf.gain.value = (bass - 100) * 0.8;
      this.audioHighShelf.gain.value = (treble - 100) * 0.8;
    }

    if (this.currentClip) {
      this.currentClip.effects = {
        ...(this.currentClip.effects || {}),
        preset: this.effectState.preset,
        brightness,
        contrast,
        saturation,
        bass: Number(this.effectState.bass ?? AUDIO_EFFECT_PRESETS.clean.bass),
        treble: Number(this.effectState.treble ?? AUDIO_EFFECT_PRESETS.clean.treble),
        speed: Number(this.effectState.speed ?? 1),
      };
    }
  }

  _syncEffectUI() {
    this.brightnessSlider?.setAttribute('value', String(this.effectState.brightness ?? VIDEO_EFFECT_PRESETS.normal.brightness));
    this.contrastSlider?.setAttribute('value', String(this.effectState.contrast ?? VIDEO_EFFECT_PRESETS.normal.contrast));
    this.saturationSlider?.setAttribute('value', String(this.effectState.saturation ?? VIDEO_EFFECT_PRESETS.normal.saturation));
    this.bassSlider?.setAttribute('value', String(this.effectState.bass ?? AUDIO_EFFECT_PRESETS.clean.bass));
    this.trebleSlider?.setAttribute('value', String(this.effectState.treble ?? AUDIO_EFFECT_PRESETS.clean.treble));
    this.speedSlider?.setAttribute('value', String(Math.round((this.effectState.speed ?? 1) * 100)));

    this.effectPresetButtons.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.preset === this.effectState.preset);
    });
  }

  _updateEffectGroupVisibility() {
    const isAudio = this.currentMediaType === 'audio';
    this.container.querySelectorAll('[data-effect-group]').forEach((el) => {
      el.style.display = el.dataset.effectGroup === this.currentMediaType ? '' : 'none';
    });
    this.container.querySelectorAll('.preview-effect-presets').forEach((group) => {
      group.style.display = group.dataset.effectGroup === this.currentMediaType ? '' : 'none';
    });
    if (!isAudio) {
      this.audioEl.style.filter = this.videoEl.style.filter;
    }
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

    this._applyCurrentViewSizing();
  }

  _applyCurrentViewSizing() {
    if (this.videoEl?.style.display === 'none') return;
    if (this.viewMode === 'actual') {
      this._applyActualSize();
    } else if (this.viewMode === 'fill') {
      this._applyFillSize();
    } else {
      this._applyFitSize();
    }
  }

  _applyFitSize() {
    const w = this.videoEl.videoWidth || 0;
    const h = this.videoEl.videoHeight || 0;
    const viewportW = Math.max(1, this.viewport.clientWidth || 0);
    const viewportH = Math.max(1, this.viewport.clientHeight || 0);
    if (!w || !h) return;

    const scale = Math.min(viewportW / w, viewportH / h);
    const nextW = Math.max(1, Math.round(w * scale));
    const nextH = Math.max(1, Math.round(h * scale));

    this.videoEl.style.width = `${nextW}px`;
    this.videoEl.style.height = `${nextH}px`;
    this.videoEl.style.maxWidth = 'none';
    this.videoEl.style.maxHeight = 'none';
    this.videoEl.style.objectFit = 'contain';
  }

  _applyFillSize() {
    const w = this.videoEl.videoWidth || 0;
    const h = this.videoEl.videoHeight || 0;
    const viewportW = Math.max(1, this.viewport.clientWidth || 0);
    const viewportH = Math.max(1, this.viewport.clientHeight || 0);
    if (!w || !h) return;

    const scale = Math.max(viewportW / w, viewportH / h);
    const nextW = Math.max(1, Math.round(w * scale));
    const nextH = Math.max(1, Math.round(h * scale));

    this.videoEl.style.width = `${nextW}px`;
    this.videoEl.style.height = `${nextH}px`;
    this.videoEl.style.maxWidth = 'none';
    this.videoEl.style.maxHeight = 'none';
    this.videoEl.style.objectFit = 'cover';
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
    this.videoEl.style.maxWidth = 'none';
    this.videoEl.style.maxHeight = 'none';
    this.videoEl.style.objectFit = 'none';
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
        return;
      }
      if (window.__avEditorDragEntry) {
        try { this.loadFile({ ...window.__avEditorDragEntry }); } catch { /* ignore */ }
        return;
      }
      if (e.dataTransfer.files.length > 0) {
        const file = e.dataTransfer.files[0];
        this.loadBrowserFile(file);
      }
    });
  }

  _attachMediaEvents(el) {
    if (el._avEventsBound) return;
    el._avEventsBound = true;

    el.addEventListener('timeupdate', () => {
      // Only the active media element may drive the UI. Inactive video/audio
      // elements (still at t=0) previously caused the playhead to snap back.
      if (el !== this.mediaEl) return;
      if (el.seeking || this._scrubbing) return;
      this._emitMediaTime(false);
    });

    el.addEventListener('seeking', () => {
      if (el !== this.mediaEl) return;
      this._ignoreSeekUntil = performance.now() + 50;
    });

    el.addEventListener('seeked', () => {
      if (el !== this.mediaEl) return;
      this._ignoreSeekUntil = 0;
      this._emitMediaTime(true);
    });

    el.addEventListener('ended', () => {
      if (el !== this.mediaEl) return;
      this._stopPlayheadLoop();
      this._updatePlayBtn(false);
      this._emitMediaTime(true);
      this.onEnded?.();
    });

    el.addEventListener('durationchange', () => {
      if (el !== this.mediaEl) return;
      this.onDurationChange?.(el.duration);
    });

    el.addEventListener('play', () => {
      if (el !== this.mediaEl) return;
      this._updatePlayBtn(true);
      this._startPlayheadLoop();
    });

    el.addEventListener('pause', () => {
      if (el !== this.mediaEl) return;
      this._stopPlayheadLoop();
      this._updatePlayBtn(false);
      // Skip emit while stop/seek transport is driving the clock (avoids stomping t→0).
      if (!this._transportLock) this._emitMediaTime(true);
    });
  }

  /**
   * Seek media clock and optionally notify listeners.
   * @param {number} time
   * @param {{ emit?: boolean }} [opts]
   */
  seek(time, { emit = true } = {}) {
    if (!this.mediaEl) {
      if (emit) this.onTimeUpdate?.(0, 0);
      return 0;
    }
    this._transportLock = true;
    const next = this._seekMedia(time, { force: true });
    this._lastEmittedTime = next;
    this._ignoreSeekUntil = 0;
    this._transportLock = false;
    if (emit) this._emitMediaTime(true);
    return next;
  }

  /** Pause and return media/timeline clock to the start. */
  stop() {
    this._transportLock = true;
    this._stopPlayheadLoop();
    if (this.mediaEl) {
      this.mediaEl.pause();
      this.mediaEl.currentTime = 0;
    }
    this._lastEmittedTime = 0;
    this._ignoreSeekUntil = 0;
    this._scrubbing = false;
    this._transportLock = false;
    this._updatePlayBtn(false);
    this._emitMediaTime(true);
    return 0;
  }

  /** Seek without re-triggering when already at the target (avoids seek flicker). */
  _seekMedia(time, { force = false } = {}) {
    if (!this.mediaEl) return 0;
    const dur = this.mediaEl.duration;
    let next = Number(time);
    if (!Number.isFinite(next)) next = 0;
    next = Math.max(0, next);
    if (dur > 0 && Number.isFinite(dur)) next = Math.min(next, dur);
    const cur = this.mediaEl.currentTime || 0;
    if (!force && Math.abs(cur - next) < 0.04) return cur;
    this.mediaEl.currentTime = next;
    return next;
  }

  /**
   * Push current media time to seek bar / external listeners.
   * @param {boolean} force  Skip monotonic / debounce filters (user seek, pause, etc.)
   */
  _emitMediaTime(force = false) {
    if (!this.mediaEl) {
      this.seekBar.value = '0';
      this.timeDisplay.textContent = '00:00:00 / 00:00:00';
      this.onTimeUpdate?.(0, 0);
      return;
    }
    if (!force && performance.now() < this._ignoreSeekUntil) return;

    const dur = Number(this.mediaEl.duration);
    const cur = Number(this.mediaEl.currentTime);
    if (!Number.isFinite(cur)) return;

    // While playing, ignore large backwards jumps (common Chromium glitch → t=0 flicker).
    if (!force && !this.mediaEl.paused && !this._scrubbing) {
      if (cur + 0.35 < this._lastEmittedTime && this._lastEmittedTime > 0.5) {
        return;
      }
    }

    this._lastEmittedTime = cur;

    if (!this._scrubbing && Number.isFinite(dur) && dur > 0) {
      this.seekBar.value = String(Math.round((cur / dur) * 1000));
    } else if (!this._scrubbing && (!Number.isFinite(dur) || dur <= 0) && cur === 0) {
      this.seekBar.value = '0';
    }
    this.timeDisplay.textContent = `${this._fmt(cur)} / ${this._fmt(Number.isFinite(dur) ? dur : 0)}`;
    this._updateSubtitleDisplay(cur);
    this.onTimeUpdate?.(cur, Number.isFinite(dur) ? dur : 0);
  }

  /**
   * @param {Array<{start:number,end:number,text:string}>} cues
   */
  setSubtitles(cues) {
    this._subtitles = Array.isArray(cues) ? cues.slice() : [];
    this._activeSubtitleIndex = -1;
    if (this._subtitles.length) this._subtitlesVisible = true;
    if (this.subtitleEl) {
      // Keep above video / pause cue in the stacking order
      if (this.viewport && this.subtitleEl.parentElement === this.viewport) {
        this.viewport.appendChild(this.subtitleEl);
      }
    }
    this._updateSubtitleDisplay(this.mediaEl?.currentTime || 0);
  }

  getSubtitles() {
    return this._subtitles.slice();
  }

  isSubtitlesVisible() {
    return !!this._subtitlesVisible;
  }

  hasSubtitles() {
    return Array.isArray(this._subtitles) && this._subtitles.length > 0;
  }

  setSubtitlesVisible(visible) {
    this._subtitlesVisible = !!visible;
    this._activeSubtitleIndex = -1;
    this._updateSubtitleDisplay(this.mediaEl?.currentTime || 0);
    return this._subtitlesVisible;
  }

  toggleSubtitlesVisible() {
    return this.setSubtitlesVisible(!this._subtitlesVisible);
  }

  clearSubtitles() {
    this.setSubtitles([]);
  }

  _updateSubtitleDisplay(mediaTime) {
    if (!this.subtitleEl) return;
    const cues = this._subtitles;
    if (!this._subtitlesVisible || !cues.length) {
      this.subtitleEl.hidden = true;
      this.subtitleEl.textContent = '';
      this._activeSubtitleIndex = -1;
      return;
    }
    const t = Number(mediaTime) || 0;
    let idx = -1;
    for (let i = 0; i < cues.length; i += 1) {
      const c = cues[i];
      if (t >= c.start && t < c.end) {
        idx = i;
        break;
      }
    }
    if (idx === this._activeSubtitleIndex) return;
    this._activeSubtitleIndex = idx;
    if (idx < 0) {
      this.subtitleEl.hidden = true;
      this.subtitleEl.textContent = '';
      return;
    }
    this.subtitleEl.hidden = false;
    this.subtitleEl.textContent = cues[idx].text;
  }

  _startPlayheadLoop() {
    if (this._rafId != null) return;
    const tick = () => {
      this._rafId = null;
      if (!this.mediaEl || this.mediaEl.paused) return;
      this._emitMediaTime(false);
      this._rafId = requestAnimationFrame(tick);
    };
    this._rafId = requestAnimationFrame(tick);
  }

  _stopPlayheadLoop() {
    if (this._rafId != null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  _clearInactiveMedia(activeEl) {
    for (const el of [this.videoEl, this.audioEl]) {
      if (!el || el === activeEl) continue;
      try {
        el.pause();
        el.removeAttribute('src');
        el.load();
      } catch { /* ignore */ }
    }
  }

  _ensureAudioGraph() {
    if (!this.audioEl || this.audioContext) return;

    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) return;

    try {
      this.audioContext = new AudioContextCtor();
      this.audioSourceNode = this.audioContext.createMediaElementSource(this.audioEl);

      this.audioLowShelf = this.audioContext.createBiquadFilter();
      this.audioLowShelf.type = 'lowshelf';
      this.audioLowShelf.frequency.value = 200;
      this.audioLowShelf.gain.value = 0;

      this.audioHighShelf = this.audioContext.createBiquadFilter();
      this.audioHighShelf.type = 'highshelf';
      this.audioHighShelf.frequency.value = 2000;
      this.audioHighShelf.gain.value = 0;

      this.audioSourceNode.connect(this.audioLowShelf);
      this.audioLowShelf.connect(this.audioHighShelf);
      this.audioHighShelf.connect(this.audioContext.destination);
    } catch (err) {
      console.warn('[preview] Failed to create audio graph:', err);
      this.audioContext = null;
      this.audioSourceNode = null;
      this.audioLowShelf = null;
      this.audioHighShelf = null;
    }
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
    this.clearTransportCue();
    this.clearSubtitles();
    this._stopPlayheadLoop();
    this.currentFile = fileEntry;
    const ext = (fileEntry.extension || '').toLowerCase();
    const isAudio = AUDIO_EXT.has(ext);
    this.currentMediaType = isAudio ? 'audio' : 'video';
    this._updateEffectGroupVisibility();

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
        ph.innerHTML = `${Icons.audio}<div style="font-size:13px;max-width:200px;text-align:center;">${fileEntry.name}</div>`;
        // Insert under the transport cue so cues remain visible on web/Electron.
        if (this.transportCue?.parentElement === vp) {
          vp.insertBefore(ph, this.transportCue);
        } else {
          vp.appendChild(ph);
        }
      } else {
        const nameEl = existing.querySelector('div');
        if (nameEl) nameEl.textContent = fileEntry.name;
      }
    } else {
      this.mediaEl = this.videoEl;
      this.videoEl.style.display = 'block';
      const existing = this.viewport.querySelector('.audio-placeholder');
      if (existing) existing.remove();
    }

    this._clearInactiveMedia(this.mediaEl);

    const blobSrc = fileEntry.blobUrl || fileEntry.url
      || (fileEntry.path && window.electronAPI?.resolveMediaUrlSync?.(fileEntry.path))
      || null;
    if (blobSrc) {
      this.mediaEl.src = blobSrc;
    } else if (fileEntry.file instanceof File) {
      this.mediaEl.src = URL.createObjectURL(fileEntry.file);
    } else if (window.electronAPI?.isElectron && fileEntry.path) {
      this.mediaEl.src = `file://${fileEntry.path.replace(/\\/g, '/')}`;
    } else if (window.electronAPI?.resolveMediaUrl && fileEntry.path) {
      window.electronAPI.resolveMediaUrl(fileEntry.path).then((url) => {
        if (url && this.mediaEl) this.mediaEl.src = url;
      }).catch(() => {});
    }

    if (isAudio) {
      this._ensureAudioGraph();
      if (this.audioContext?.state === 'suspended') this.audioContext.resume().catch(() => {});
    }

    this._attachMediaEvents(this.mediaEl);
    this._applyVolume();
    this._applyEffectState();
    this._lastEmittedTime = 0;
    this.seekBar.value = '0';
    this.timeDisplay.textContent = '00:00:00 / 00:00:00';
    this._updatePlayBtn(false);
    this.setViewMode(this.viewMode, { persist: false });
  }

  loadBrowserFile(file) {
    this._stopPlayheadLoop();
    const ext = '.' + (file.name.split('.').pop() || '').toLowerCase();
    let diskPath = null;
    try {
      diskPath = window.electronAPI?.getPathForFile?.(file) || file.path || null;
    } catch {
      diskPath = file.path || null;
    }

    const entry = {
      name: file.name,
      path: diskPath,
      extension: ext,
      size: file.size,
      file: diskPath ? undefined : file,
    };
    this.currentFile = entry;

    const isAudio = AUDIO_EXT.has(ext);
    this.currentMediaType = isAudio ? 'audio' : 'video';
    this._updateEffectGroupVisibility();

    this.videoEl.style.display = 'none';
    this.audioEl.style.display = 'none';
    this.emptyEl.style.display = 'none';

    this.mediaEl = isAudio ? this.audioEl : this.videoEl;
    this.mediaEl.style.display = 'block';
    this._clearInactiveMedia(this.mediaEl);

    if (diskPath && window.electronAPI?.isElectron) {
      this.mediaEl.src = `file://${diskPath.replace(/\\/g, '/')}`;
    } else {
      this.mediaEl.src = URL.createObjectURL(file);
    }

    if (isAudio) {
      this._ensureAudioGraph();
      if (this.audioContext?.state === 'suspended') this.audioContext.resume().catch(() => {});
    }
    this._attachMediaEvents(this.mediaEl);
    this._applyVolume();
    this._applyEffectState();
    this._lastEmittedTime = 0;
    this.seekBar.value = '0';
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

  pause() {
    if (!this.mediaEl) return;
    this._transportLock = true;
    this.mediaEl.pause();
    this._stopPlayheadLoop();
    this._updatePlayBtn(false);
    this._transportLock = false;
  }

  get isPlaying() { return this.mediaEl && !this.mediaEl.paused; }
  get currentTime() { return this.mediaEl?.currentTime ?? 0; }
  set currentTime(t) { this.seek(t); }
  get duration() { return this.mediaEl?.duration ?? 0; }

  /**
   * Seek to mediaTime, draw one JPEG frame, return base64 (no data: prefix).
   * Caller should discard the string promptly to limit memory use.
   */
  async captureFrameBase64(mediaTime, { maxWidth = 768, quality = 0.72 } = {}) {
    const video = this.videoEl;
    const media = this.mediaEl;
    if (!media) throw new Error('No media');

    if (media === this.audioEl || this.currentMediaType === 'audio') {
      return null;
    }
    if (!video || video.readyState < 1) throw new Error('Video not ready');

    await this._seekAndWait(mediaTime);

    const vw = video.videoWidth || 0;
    const vh = video.videoHeight || 0;
    if (vw < 2 || vh < 2) throw new Error('Invalid frame size');

    let tw = vw;
    let th = vh;
    if (tw > maxWidth) {
      const scale = maxWidth / tw;
      tw = Math.max(1, Math.round(tw * scale));
      th = Math.max(1, Math.round(vh * scale));
    }

    const canvas = document.createElement('canvas');
    canvas.width = tw;
    canvas.height = th;
    const ctx = canvas.getContext('2d', { willReadFrequently: false });
    if (!ctx) throw new Error('Canvas unavailable');
    ctx.drawImage(video, 0, 0, tw, th);
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    canvas.width = 0;
    canvas.height = 0;
    const comma = dataUrl.indexOf(',');
    return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  }

  _seekAndWait(mediaTime) {
    const media = this.mediaEl;
    if (!media) return Promise.reject(new Error('No media'));

    const target = Math.max(0, Number(mediaTime) || 0);
    const dur = Number(media.duration);
    const clamped = Number.isFinite(dur) && dur > 0
      ? Math.min(target, Math.max(0, dur - 0.05))
      : target;

    return new Promise((resolve, reject) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        cleanup();
        requestAnimationFrame(() => requestAnimationFrame(resolve));
      };
      const fail = (err) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(err);
      };
      const onSeeked = () => done();
      const onError = () => fail(new Error('Seek failed'));
      const cleanup = () => {
        media.removeEventListener('seeked', onSeeked);
        media.removeEventListener('error', onError);
        clearTimeout(timer);
      };
      const timer = setTimeout(() => done(), 2500);
      media.addEventListener('seeked', onSeeked);
      media.addEventListener('error', onError);
      if (Math.abs((media.currentTime || 0) - clamped) < 0.04) {
        done();
        return;
      }
      try {
        media.currentTime = clamped;
      } catch (e) {
        fail(e);
      }
    });
  }

  showEmpty() {
    this.clearTransportCue();
    this.clearSubtitles();
    this._stopPlayheadLoop();
    this.videoEl.style.display = 'none';
    this.audioEl.style.display = 'none';
    this.emptyEl.style.display = 'flex';
    const ph = this.viewport.querySelector('.audio-placeholder');
    if (ph) ph.remove();
    this._clearInactiveMedia(null);
    this.mediaEl = null;
    this.currentClip = null;
    this.currentMediaType = 'video';
    this.effectState = { ...this._getDefaultEffectState() };
    this._updateEffectGroupVisibility();
    this._syncEffectUI();
    this.videoEl.style.filter = 'none';
    this.audioEl.style.filter = 'none';
    this._lastEmittedTime = 0;
    this.seekBar.value = '0';
    this.timeDisplay.textContent = '00:00:00 / 00:00:00';
  }

  updateTranslations() {
    this._updateEmptyText();
    this.container.querySelectorAll('[data-i18n]').forEach((el) => {
      el.textContent = this.i18n.t(el.getAttribute('data-i18n'));
    });
    this.container.querySelectorAll('[data-i18n-tooltip]').forEach(el => {
      if (el === this.muteBtn) return;
      el.setAttribute('data-tooltip', this.i18n.t(el.getAttribute('data-i18n-tooltip')));
    });
    this._syncEffectUI();
    this._updateEffectGroupVisibility();
    this._syncVolumeUI();
  }
}
