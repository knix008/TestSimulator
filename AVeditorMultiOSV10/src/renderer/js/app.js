import { I18n } from './i18n.js';
import { Icons } from './icons.js';
import { FileTree } from './fileTree.js';
import { FileInfo } from './fileInfo.js';
import { Preview } from './preview.js';
import { Timeline } from './timeline.js';
import { ContextMenu } from './contextMenu.js';
import { initDialog, showConfirm, showAlert, showSubtitleOptionsDialog, showSubtitleSaveFormatDialog } from './dialog.js';
import { showOllamaSettingsDialog, loadOllamaSettings, isLikelyVlmModel } from './ollamaSettings.js';
import { SceneAnalyzer } from './sceneAnalyzer.js';
import { showAnalysisViewer } from './analysisViewer.js';
import { generateSubtitlesFromPreview, cuesToSrt, cuesToSmi, parseSubtitleText } from './subtitleGenerator.js';
import { StreamLinks } from './streamLinks.js';

const STORAGE_THEME = 'av-editor-theme';
const STORAGE_LOCALE = 'av-editor-locale';
const STORAGE_TIMELINE_COLLAPSED = 'av-editor-timeline-collapsed';
const STORAGE_SIDEBAR_COLLAPSED = 'av-editor-sidebar-collapsed';
const STORAGE_SUBTITLE_SIDECAR_ORDER = 'av-editor-subtitle-sidecar-order';
const STORAGE_SUBTITLE_INPUT_LANG = 'av-editor-subtitle-input-language';
const STORAGE_SUBTITLE_OUTPUT_LANG = 'av-editor-subtitle-output-language';
const STORAGE_SUBTITLE_DUAL_MODE = 'av-editor-subtitle-dual-mode';
const STORAGE_SUBTITLE_DUAL_ORDER = 'av-editor-subtitle-dual-order';
const STORAGE_SUBTITLE_SAVE_MODE = 'av-editor-subtitle-save-mode';
const STORAGE_SUBTITLE_CONFIDENCE_PROFILE = 'av-editor-subtitle-confidence-profile';
const STORAGE_SUBTITLE_SUFFIX_SOURCE = 'av-editor-subtitle-suffix-source';
const STORAGE_SUBTITLE_SUFFIX_TARGET = 'av-editor-subtitle-suffix-target';
const STORAGE_SUBTITLE_SUFFIX_DUAL = 'av-editor-subtitle-suffix-dual';
const STORAGE_SUBTITLE_SUFFIX_LANGCODE = 'av-editor-subtitle-suffix-langcode';
const STORAGE_SUBTITLE_SUFFIX_LANGFORMAT = 'av-editor-subtitle-suffix-langformat';

class AVEditorApp {
  constructor() {
    this.i18n = new I18n();
    this.theme = localStorage.getItem(STORAGE_THEME) || 'dark';
    this._timelineCollapsed = localStorage.getItem(STORAGE_TIMELINE_COLLAPSED) === '1';
    this._sidebarCollapsed = localStorage.getItem(STORAGE_SIDEBAR_COLLAPSED) === '1';
    this._subtitleSidecarOrder = localStorage.getItem(STORAGE_SUBTITLE_SIDECAR_ORDER) === 'smi-first'
      ? 'smi-first'
      : 'srt-first';
    this.projectPath = null;
    this.isDirty = false;
    this.isPlaying = false;
  }

  async init() {
    // Apply saved theme immediately
    document.body.className = `theme-${this.theme}`;

    // Init i18n with saved locale
    const savedLocale = localStorage.getItem(STORAGE_LOCALE) || 'en';
    await this.i18n.init(savedLocale);
    initDialog(this.i18n);

    // Build UI
    this._buildToolbar();
    this._buildComponents();
    this._applySidebarCollapsed(this._sidebarCollapsed, { persist: false });
    this._applyTimelineCollapsed(this._timelineCollapsed, { persist: false });
    this._initSidebarResize();
    this._bindMenuActions();
    this._bindKeyboard();

    // Update all translatable DOM
    this.i18n._updateDOM();

    // Sync native application menu language
    this._syncMenuLocale(savedLocale);
  }

  // ── Toolbar ────────────────────────────────────────────────────────────────

  _buildToolbar() {
    const toolbar = document.getElementById('toolbar');
    toolbar.innerHTML = `
      <!-- File actions -->
      <div class="toolbar-group">
        <button class="toolbar-btn" id="btn-new"  data-i18n-tooltip="toolbar.new">${Icons.new}</button>
        <button class="toolbar-btn" id="btn-open" data-i18n-tooltip="toolbar.open">${Icons.open}</button>
        <button class="toolbar-btn" id="btn-save" data-i18n-tooltip="toolbar.save">${Icons.save}</button>
        <button class="toolbar-btn" id="btn-save-modified" data-i18n-tooltip="toolbar.saveModified">${Icons.save}</button>
      </div>
      <div class="toolbar-separator"></div>
      <!-- Media -->
      <div class="toolbar-group">
        <button class="toolbar-btn" id="btn-import" data-i18n-tooltip="toolbar.import">${Icons.import}</button>
        <button class="toolbar-btn" id="btn-add-url" data-i18n-tooltip="streamLinks.addUrl">${Icons.link}</button>
        <button class="toolbar-btn" id="btn-export" data-i18n-tooltip="toolbar.export">${Icons.export}</button>
      </div>
      <div class="toolbar-separator"></div>
      <!-- AI (needed especially on web — no native menu) -->
      <div class="toolbar-group toolbar-group-ai" role="group" aria-label="AI">
        <span class="toolbar-ai-badge" data-i18n-tooltip="toolbar.aiGroup">${Icons.ai}</span>
        <button class="toolbar-btn" id="btn-analyze" data-i18n-tooltip="toolbar.analyzeScenes">${Icons.sparkles}</button>
        <button class="toolbar-btn" id="btn-view-analysis" data-i18n-tooltip="toolbar.viewAnalysis">${Icons.list}</button>
        <button class="toolbar-btn" id="btn-subtitles" data-i18n-tooltip="toolbar.generateSubtitles">${Icons.subtitles}</button>
        <button class="toolbar-btn active" id="btn-toggle-subtitles" data-i18n-tooltip="toolbar.subtitlesHide" aria-pressed="true">${Icons.subtitlesToggle}</button>
        <button class="toolbar-btn" id="btn-ollama-settings" data-i18n-tooltip="toolbar.ollamaSettings">${Icons.settings}</button>
      </div>
      <div class="toolbar-separator"></div>
      <!-- Edit -->
      <div class="toolbar-group">
        <button class="toolbar-btn" id="btn-undo" data-i18n-tooltip="toolbar.undo">${Icons.undo}</button>
        <button class="toolbar-btn" id="btn-redo" data-i18n-tooltip="toolbar.redo">${Icons.redo}</button>
      </div>
      <div class="toolbar-separator"></div>
      <div class="toolbar-group">
        <button class="toolbar-btn" id="btn-cut"    data-i18n-tooltip="toolbar.cut">${Icons.cut}</button>
        <button class="toolbar-btn" id="btn-copy"   data-i18n-tooltip="toolbar.copy">${Icons.copy}</button>
        <button class="toolbar-btn" id="btn-paste"  data-i18n-tooltip="toolbar.paste">${Icons.paste}</button>
        <button class="toolbar-btn" id="btn-split"  data-i18n-tooltip="toolbar.split">${Icons.split}</button>
        <button class="toolbar-btn" id="btn-delete" data-i18n-tooltip="toolbar.delete">${Icons.trash}</button>
      </div>
      <div class="toolbar-separator"></div>
      <!-- Playback -->
      <div class="toolbar-group">
        <button class="toolbar-btn" id="btn-skip-back"    data-i18n-tooltip="toolbar.skipBack">${Icons.skipBack}</button>
        <button class="toolbar-btn" id="btn-rewind"       data-i18n-tooltip="toolbar.rewind">${Icons.rewind}</button>
        <button class="toolbar-btn play-btn" id="btn-play-pause" data-i18n-tooltip="toolbar.play">${Icons.play}</button>
        <button class="toolbar-btn stop-btn" id="btn-stop" data-i18n-tooltip="toolbar.stop">${Icons.stop}</button>
        <button class="toolbar-btn" id="btn-ff"           data-i18n-tooltip="toolbar.fastForward">${Icons.fastForward}</button>
        <button class="toolbar-btn" id="btn-skip-fwd"     data-i18n-tooltip="toolbar.skipForward">${Icons.skipForward}</button>
      </div>
      <div class="toolbar-separator"></div>
      <!-- Timeline zoom -->
      <div class="toolbar-group">
        <button class="toolbar-btn active" id="btn-toggle-sidebar" data-i18n-tooltip="toolbar.sidebarHide" aria-pressed="true">${Icons.panelLeft}</button>
        <button class="toolbar-btn" id="btn-zoom-out" data-i18n-tooltip="toolbar.zoomOut">${Icons.zoomOut}</button>
        <button class="toolbar-btn" id="btn-zoom-in"  data-i18n-tooltip="toolbar.zoomIn">${Icons.zoomIn}</button>
        <button class="toolbar-btn active" id="btn-toggle-timeline" data-i18n-tooltip="toolbar.timelineHide" aria-pressed="true">${Icons.panelBottom}</button>
      </div>
      <!-- Spacer -->
      <div class="toolbar-spacer"></div>
      <!-- Time display -->
      <span class="toolbar-time" id="toolbar-time">00:00:00</span>
      <div class="toolbar-separator"></div>
      <!-- Theme & Language -->
      <div class="toolbar-group">
        <button class="toolbar-btn" id="btn-theme" data-i18n-tooltip="toolbar.toggleTheme">${this.theme === 'dark' ? Icons.sun : Icons.moon}</button>
        <button class="toolbar-lang-btn" id="btn-lang" data-i18n-tooltip="toolbar.language">${this.i18n.getLocale() === 'en' ? 'KO' : 'EN'}</button>
      </div>
    `;

    this._applyTooltips();
    this._syncSubtitleToggleButton();
    this._syncSidebarToggleButton();
    this._applyTimelineCollapsed(this._timelineCollapsed, { persist: false });
    this._initToolbarFloatingTooltips();
    this._bindToolbarEvents();
  }

  _applyTooltips() {
    document.querySelectorAll('[data-i18n-tooltip]').forEach((el) => {
      const text = this.i18n.t(el.getAttribute('data-i18n-tooltip'));
      el.setAttribute('data-tooltip', text);
      el.setAttribute('aria-label', text);
      // Native title as fallback (e.g. touch-long-press); floating tip is primary on toolbar.
      el.setAttribute('title', text);
    });
  }

  /**
   * Fixed-position tooltips for #toolbar — CSS ::after is clipped/covered on web.
   */
  _initToolbarFloatingTooltips() {
    if (this._toolbarTipBound) return;
    this._toolbarTipBound = true;

    let tip = document.getElementById('av-floating-tooltip');
    if (!tip) {
      tip = document.createElement('div');
      tip.id = 'av-floating-tooltip';
      tip.setAttribute('role', 'tooltip');
      document.body.appendChild(tip);
    }

    let showTimer = null;
    let current = null;

    const hide = () => {
      clearTimeout(showTimer);
      showTimer = null;
      tip.classList.remove('visible');
      current = null;
    };

    const place = (el) => {
      const text = el.getAttribute('data-tooltip');
      if (!text) return;
      tip.textContent = text;
      tip.classList.add('visible');
      // Measure after visible so size is correct
      const r = el.getBoundingClientRect();
      const tipW = tip.offsetWidth;
      const tipH = tip.offsetHeight;
      let left = r.left + r.width / 2 - tipW / 2;
      left = Math.max(8, Math.min(left, window.innerWidth - tipW - 8));
      let top = r.bottom + 8;
      if (top + tipH > window.innerHeight - 8) {
        top = Math.max(8, r.top - tipH - 8);
      }
      tip.style.left = `${Math.round(left)}px`;
      tip.style.top = `${Math.round(top)}px`;
    };

    document.addEventListener('pointerover', (e) => {
      const el = e.target?.closest?.('#toolbar [data-tooltip]');
      if (!el) return;
      if (el === current) return;
      current = el;
      clearTimeout(showTimer);
      // Suppress native title while floating tip is active
      if (el.hasAttribute('title')) {
        el.dataset.nativeTitle = el.getAttribute('title');
        el.removeAttribute('title');
      }
      showTimer = setTimeout(() => place(el), 200);
    });

    document.addEventListener('pointerout', (e) => {
      const el = e.target?.closest?.('#toolbar [data-tooltip]');
      if (!el) return;
      const related = e.relatedTarget;
      if (related && el.contains(related)) return;
      if (el.dataset.nativeTitle) {
        el.setAttribute('title', el.dataset.nativeTitle);
        delete el.dataset.nativeTitle;
      }
      if (current === el) hide();
    });

    document.addEventListener('scroll', hide, true);
    window.addEventListener('blur', hide);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') hide();
    });
  }

  _bindToolbarEvents() {
    const $  = (id) => document.getElementById(id);

    $('btn-new').addEventListener('click', () => this._newProject());
    $('btn-open').addEventListener('click', () => this._openProject());
    $('btn-save').addEventListener('click', () => this._saveProject());
    $('btn-save-modified').addEventListener('click', () => this._saveProjectAsModified());
    $('btn-import').addEventListener('click', () => this._importMedia());
    $('btn-add-url').addEventListener('click', () => this.streamLinks?.promptAddUrl());
    $('btn-export').addEventListener('click', () => this._export());
    $('btn-analyze').addEventListener('click', () => this._analyzeScenes());
    $('btn-view-analysis').addEventListener('click', () => this._viewAnalysisResults());
    $('btn-subtitles').addEventListener('click', () => this._generateSubtitles());
    $('btn-toggle-subtitles').addEventListener('click', () => this._toggleSubtitlesVisible());
    $('btn-ollama-settings').addEventListener('click', () => this._openOllamaSettings());
    $('btn-undo').addEventListener('click', () => this._undo());
    $('btn-redo').addEventListener('click', () => this._redo());
    $('btn-split').addEventListener('click', () => this.timeline.splitSelectedClip());
    $('btn-delete').addEventListener('click', () => this.timeline.deleteSelectedClip());

    $('btn-skip-back').addEventListener('click', () => {
      this.preview.showTransportCue('skipBack');
      this._stopPlayback();
    });
    $('btn-rewind').addEventListener('click', () => {
      this.preview.showTransportCue('rewind');
      this._seekTimeline(Math.max(0, this.timeline.currentTime - 5));
    });
    $('btn-play-pause').addEventListener('click', () => this._togglePlay());
    $('btn-stop').addEventListener('click', () => {
      this.preview.showTransportCue('stop');
      this._stopPlayback();
    });
    $('btn-ff').addEventListener('click', () => {
      this.preview.showTransportCue('fastForward');
      const mediaDur = this.preview.duration || 0;
      const clip = this._clipForSync(this.timeline.currentTime);
      const offset = Number(clip?.startTime) || 0;
      const maxT = mediaDur > 0 ? offset + mediaDur : this.timeline.currentTime + 5;
      this._seekTimeline(Math.min(maxT, this.timeline.currentTime + 5));
    });
    $('btn-skip-fwd').addEventListener('click', () => {
      this.preview.showTransportCue('skipForward');
      const mediaDur = this.preview.duration || 0;
      const clip = this._clipForSync(this.timeline.currentTime);
      const offset = Number(clip?.startTime) || 0;
      this._seekTimeline(offset + (mediaDur || 0));
    });

    $('btn-zoom-in').addEventListener('click', () => this.timeline.zoomIn());
    $('btn-zoom-out').addEventListener('click', () => this.timeline.zoomOut());
    $('btn-toggle-sidebar').addEventListener('click', () => this._toggleSidebarPanel());
    $('btn-toggle-timeline').addEventListener('click', () => this._toggleTimelinePanel());

    $('btn-theme').addEventListener('click', () => this._toggleTheme());

    $('btn-lang').addEventListener('click', () => {
      const next = this.i18n.getLocale() === 'en' ? 'ko' : 'en';
      this._setLanguage(next);
    });
  }

  // ── Component initialization ──────────────────────────────────────────────

  _buildComponents() {
    this.streamLinks = new StreamLinks(
      document.getElementById('stream-links-panel'),
      {
        i18n: this.i18n,
        onSelect: (entry) => {
          if (entry?.isStream) this._onStreamEntrySelect(entry);
        },
        onContextMenu: () => {},
      }
    );

    this.fileTree = new FileTree(
      document.getElementById('file-tree-panel'),
      {
        i18n: this.i18n,
        onSelect: (entry) => this._onFileSelect(entry),
        onDblClick: (entry) => this._onFileDblClick(entry),
        onContextMenu: (entry, x, y) => this._showTreeContextMenu(entry, x, y),
      }
    );

    this.fileInfo = new FileInfo(
      document.getElementById('file-info-panel'),
      { i18n: this.i18n }
    );

    this.preview = new Preview(
      document.getElementById('preview-panel'),
      {
        i18n: this.i18n,
        onTimeUpdate: (mediaTime) => {
          // While the user drags the timeline playhead, don't fight their scrub position.
          if (this.timeline?._isDragging && this.timeline._dragging?.type === 'playhead') {
            return;
          }
          const playing = !!this.preview.isPlaying;
          this.timeline.followPlayhead = playing;
          if (playing !== this._lastPreviewPlaying) {
            this._lastPreviewPlaying = playing;
            this._updatePlayBtn(playing);
          }
          // Map media clock → timeline clock (clip.startTime offset).
          const clip = this._clipForSync(this.timeline.currentTime);
          const offset = Number(clip?.startTime) || 0;
          const timelineTime = offset + Math.max(0, Number(mediaTime) || 0);
          this.timeline.setCurrentTime(timelineTime, { force: !playing });
          this._updateTimeDisplay(timelineTime);
        },
        onEnded: () => {
          this._lastPreviewPlaying = false;
          this.timeline.followPlayhead = false;
          this._updatePlayBtn(false);
          this._setStatus('paused');
        },
        onDurationChange: (duration) => {
          const clip = this.preview.currentClip;
          if (!clip || !duration || !isFinite(duration) || duration <= 0) return;
          clip.file = { ...(clip.file || {}), duration };
          this.timeline.syncClipDuration(clip, { duration });
        },
        onContextMenu: (x, y, file) => this._showPreviewContextMenu(x, y, file),
        // Keep preview transport buttons on the same clock as the toolbar/timeline.
        onTransportPlayToggle: () => this._togglePlay(),
        onTransportStop: () => this._stopPlayback(),
        onTransportSeek: (mediaTime) => {
          const clip = this._clipForSync(this.timeline?.currentTime ?? 0);
          const offset = Number(clip?.startTime) || 0;
          this._seekTimeline(offset + Math.max(0, Number(mediaTime) || 0));
        },
      }
    );

    this.timeline = new Timeline(
      document.getElementById('timeline-section'),
      {
        i18n: this.i18n,
        onTimeChange: (timelineTime) => {
          this._seekTimeline(timelineTime, { fromTimeline: true });
        },
        onClipSelect: (clip) => {
          if (clip) this.preview.applyClipEffects(clip);
          else this.preview.currentClip = null;
        },
        onContextMenu: (x, y, clip) => this._showTimelineContextMenu(x, y, clip),
        onFit: (timelineTime) => this._onTimelineFit(timelineTime),
      }
    );

    this._setupExportOverlay();
    this._setupAnalyzeOverlay();
    this.sceneAnalyzer = new SceneAnalyzer({ preview: this.preview, i18n: this.i18n });
    this._initInfoPanelResize();
  }

  // ── Sidebar width resize ───────────────────────────────────────────────────

  _initInfoPanelResize() {
    const handle = document.getElementById('sidebar-info-resize-handle');
    const sidebar = document.getElementById('left-sidebar');
    if (!handle || !sidebar) return;

    const MIN_H = 100;
    const MAX_RATIO = 0.8;
    const STORAGE_KEY = 'av-editor-fileinfo-height';

    const applyHeight = (h) => {
      const max = Math.round(sidebar.clientHeight * MAX_RATIO);
      const clamped = Math.min(Math.max(Math.round(h), MIN_H), max);
      sidebar.style.setProperty('--fileinfo-height', `${clamped}px`);
      return clamped;
    };

    const saved = parseInt(localStorage.getItem(STORAGE_KEY) || '', 10);
    if (saved >= MIN_H) applyHeight(saved);

    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const startY = e.clientY;
      const startH = parseInt(sidebar.style.getPropertyValue('--fileinfo-height') || '240', 10);

      handle.classList.add('resizing');
      document.body.classList.add('resizing-row');

      const onMove = (ev) => {
        applyHeight(startH - (ev.clientY - startY));
      };
      const onUp = () => {
        handle.classList.remove('resizing');
        document.body.classList.remove('resizing-row');
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        const finalH = sidebar.style.getPropertyValue('--fileinfo-height');
        const v = parseInt(finalH, 10);
        if (v) localStorage.setItem(STORAGE_KEY, String(v));
      };

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    });
  }

  _initSidebarResize() {
    const handle = document.getElementById('sidebar-resize-handle');
    const layout = document.getElementById('main-layout');
    if (!handle || !layout) return;

    const MIN_W = 180;
    const MAX_W = 480;
    const STORAGE_KEY = 'av-editor-sidebar-width';

    const applyWidth = (w) => {
      const clamped = Math.min(Math.max(Math.round(w), MIN_W), MAX_W);
      layout.style.setProperty('--explorer-width', `${clamped}px`);
      return clamped;
    };

    const saved = parseInt(localStorage.getItem(STORAGE_KEY) || '', 10);
    if (saved >= MIN_W && saved <= MAX_W) applyWidth(saved);

    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startW = parseInt(getComputedStyle(layout).getPropertyValue('--explorer-width'), 10)
        || layout.querySelector('#left-sidebar')?.getBoundingClientRect().width
        || 280;

      handle.classList.add('resizing');
      document.body.classList.add('resizing-col');

      const onMove = (ev) => {
        applyWidth(startW + (ev.clientX - startX));
      };
      const onUp = () => {
        handle.classList.remove('resizing');
        document.body.classList.remove('resizing-col');
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        const finalW = parseInt(getComputedStyle(layout).getPropertyValue('--explorer-width'), 10);
        if (finalW) localStorage.setItem(STORAGE_KEY, String(finalW));
      };

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    });
  }

  // ── File actions ──────────────────────────────────────────────────────────

  async _newProject() {
    if (this.isDirty) {
      const confirmed = await showConfirm(this.i18n.t('dialog.newProjectConfirm'));
      if (!confirmed) return;
    }
    this.timeline.clips = [];
    this.timeline.draw();
    this.preview.showEmpty();
    this.projectPath = null;
    this.isDirty = false;
    this._setStatus('ready');
    this._setTitle('');
  }

  async _openProject() {
    if (!window.electronAPI) return;
    const filePath = await window.electronAPI.openProjectDialog();
    if (!filePath) return;
    const result = await window.electronAPI.loadProjectFile(filePath);
    if (!result.ok) { await showAlert('Failed to load project: ' + result.error); return; }
    this.timeline.loadState(result.data);
    this._applySubtitleProjectSettings(result.data?.subtitleSettings || null);
    this.projectPath = filePath;
    this.isDirty = false;
    this._setTitle(filePath.split(/[\\/]/).pop());
    this._setStatus('ready');
  }

  _buildModifiedSuggestedPath() {
    const suffix = this.i18n.getLocale() === 'ko' ? '_변경' : '_modified';
    if (this.projectPath) {
      const sep = this.projectPath.includes('\\') ? '\\' : '/';
      const parts = this.projectPath.split(sep);
      const filename = parts[parts.length - 1];
      const dotIdx = filename.lastIndexOf('.');
      const base = dotIdx >= 0 ? filename.slice(0, dotIdx) : filename;
      const ext  = dotIdx >= 0 ? filename.slice(dotIdx) : '.avp';
      parts[parts.length - 1] = `${base}${suffix}${ext}`;
      return parts.join(sep);
    }
    const firstClip = this.timeline?.clips?.[0];
    const baseName = firstClip?.name ? firstClip.name.replace(/\.[^.]+$/, '') : 'untitled';
    return `${baseName}${suffix}.avp`;
  }

  async _saveProjectAsModified() {
    if (!window.electronAPI) return;
    const suggested = this._buildModifiedSuggestedPath();
    const filePath = await window.electronAPI.saveProjectDialog(suggested);
    if (!filePath) return;
    const state = {
      ...this.timeline.getState(),
      subtitleSettings: this._getSubtitleProjectSettings(),
    };
    const result = await window.electronAPI.saveProjectFile(filePath, state);
    if (!result.ok) { await showAlert('Failed to save: ' + result.error); return; }
    this._setStatus('savedModified');
    this._setTitle(filePath.split(/[\\/]/).pop());
  }

  async _saveProject(forceDialog = false) {
    if (!window.electronAPI) return;
    let filePath = this.projectPath;
    if (!filePath || forceDialog) {
      filePath = await window.electronAPI.saveProjectDialog();
      if (!filePath) return;
    }
    const state = {
      ...this.timeline.getState(),
      subtitleSettings: this._getSubtitleProjectSettings(),
    };
    const result = await window.electronAPI.saveProjectFile(filePath, state);
    if (!result.ok) { await showAlert('Failed to save: ' + result.error); return; }
    this.projectPath = filePath;
    this.isDirty = false;
    this._setTitle(filePath.split(/[\\/]/).pop());
    this._setStatus('saved');
  }

  async _importMedia() {
    if (!window.electronAPI) return;
    const files = await window.electronAPI.openFileDialog();
    const AUDIO_EXT = new Set(['.mp3','.wav','.aac','.flac','.ogg','.m4a','.wma','.opus','.aiff']);
    for (const fp of files) {
      const ext = '.' + fp.split('.').pop().toLowerCase();
      const entry = { name: fp.split(/[\\/]/).pop(), path: fp, extension: ext, size: 0 };
      const isAudio = AUDIO_EXT.has(ext);
      const clip = this.timeline.addClip(entry, isAudio ? 'a1' : 'v1', 0);
      if (window.electronAPI.getMediaInfo) {
        window.electronAPI.getMediaInfo(fp).then(meta => {
          if (meta?.duration && isFinite(Number(meta.duration))) {
            this.timeline.syncClipDuration(clip, { duration: meta.duration });
          }
        }).catch(() => {});
      }
    }
    if (files.length) { this.isDirty = true; this._setStatus('ready'); }
  }

  async _export() {
    if (!window.electronAPI) return;
    const outPath = await window.electronAPI.exportDialog();
    if (!outPath) return;
    this._showExportOverlay();
    await window.electronAPI.exportMedia({ outPath, state: this.timeline.getState() });
  }

  // ── Edit actions ───────────────────────────────────────────────────────────

  _undo() { /* TODO: history stack */ }
  _redo() { /* TODO: history stack */ }

  // ── Playback ───────────────────────────────────────────────────────────────

  /** Resolve which clip defines the media↔timeline offset. */
  _clipForSync(timelineTime = this.timeline?.currentTime ?? 0) {
    if (this.timeline?.selectedClip) return this.timeline.selectedClip;
    if (this.preview?.currentClip) return this.preview.currentClip;
    const clips = this.timeline?.clips || [];
    const t = Number(timelineTime) || 0;
    const under = clips.find((c) => t >= c.startTime && t < c.startTime + c.duration);
    if (under) return under;
    return clips[0] || null;
  }

  /**
   * Seek both preview media and timeline to a timeline-clock position.
   * @param {number} timelineTime
   * @param {{ fromTimeline?: boolean }} [opts]
   */
  _seekTimeline(timelineTime, { fromTimeline = false } = {}) {
    const t = Math.max(0, Number(timelineTime) || 0);
    const clip = this._clipForSync(t);
    const offset = Number(clip?.startTime) || 0;
    const mediaDur = this.preview.duration || 0;
    let mediaTime = t - offset;
    if (mediaDur > 0) mediaTime = Math.min(Math.max(0, mediaTime), mediaDur);
    else mediaTime = Math.max(0, mediaTime);

    const syncedTimeline = offset + mediaTime;
    const wasPlaying = !!this.preview.isPlaying;
    this.timeline.followPlayhead = false;
    this.preview.seek(mediaTime);
    // Prefer the clamped/synced time so playhead never sits past media end.
    const finalT = fromTimeline && mediaDur <= 0 ? t : syncedTimeline;
    this.timeline.setCurrentTime(finalT, { force: true });
    this._updateTimeDisplay(finalT);
    // Keep auto-scroll engaged if media is still playing after the seek.
    this.timeline.followPlayhead = wasPlaying;
  }

  /** After timeline fit (⟷), realign media duration + clocks with the playhead. */
  _onTimelineFit(timelineTime) {
    const t = Math.max(0, Number(timelineTime) || this.timeline.currentTime || 0);
    const mediaDur = this.preview?.duration || 0;
    const clip = this._clipForSync(t);
    let needRefit = false;

    if (clip && mediaDur > 0 && isFinite(mediaDur)) {
      if (Math.abs((clip.duration || 0) - mediaDur) >= 0.001) {
        clip.duration = mediaDur;
        if (clip.file) clip.file.duration = mediaDur;
        needRefit = true;
      }
      this.timeline._updateDuration();
    } else if (!clip && mediaDur > 0 && isFinite(mediaDur)) {
      const need = mediaDur + Math.min(5, Math.max(1, mediaDur * 0.02));
      if (need > this.timeline.duration + 0.05) {
        this.timeline.duration = need;
        needRefit = true;
      }
    }

    if (needRefit && this.timeline._isFitted) {
      this.timeline.pixelsPerSecond = this.timeline._fitPixelsPerSecond();
      this.timeline._updateScrollWidth();
      if (this.timeline.wrapper) {
        this.timeline.wrapper.scrollLeft = 0;
        this.timeline.scrollX = 0;
      }
      this.timeline.currentTime = t;
      this.timeline.draw();
    }

    this._seekTimeline(t, { fromTimeline: true });
    this._updatePlayBtn(!!this.preview.isPlaying);
  }

  /** Stop playback and return to the media/clip start (original position). */
  _stopPlayback() {
    this.timeline.followPlayhead = false;
    this._lastPreviewPlaying = false;
    this.preview.stop(); // media clock → 0, emits onTimeUpdate

    const clip = this._clipForSync(this.timeline.currentTime);
    const start = Number(clip?.startTime) || 0;
    // Playhead rests at the clip's timeline start (= media t=0).
    this.timeline.setCurrentTime(start, { force: true });
    this.timeline.followPlayhead = true;
    this.timeline._ensurePlayheadVisible();
    this.timeline.followPlayhead = false;

    this._updateTimeDisplay(start);
    this._updatePlayBtn(false);
    this._setStatus('paused');
  }

  _togglePlay() {
    const willPause = !!this.preview.isPlaying;
    this.preview.showTransportCue(willPause ? 'pause' : 'play');
    this.preview.togglePlay();
    const playing = this.preview.isPlaying;
    this._lastPreviewPlaying = playing;
    this.timeline.followPlayhead = playing;
    this._updatePlayBtn(playing);
    this._setStatus(playing ? 'playing' : 'paused');
  }

  _updatePlayBtn(playing) {
    const btn = document.getElementById('btn-play-pause');
    if (!btn) return;
    btn.innerHTML = playing ? Icons.pause : Icons.play;
    btn.setAttribute('data-tooltip', this.i18n.t(playing ? 'toolbar.pause' : 'toolbar.play'));
  }

  _updateTimeDisplay(secs) {
    const el = document.getElementById('toolbar-time');
    if (el) el.textContent = this._fmtTime(secs);
    const statusTime = document.getElementById('status-time');
    if (statusTime) statusTime.textContent = this._fmtTime(secs);
  }

  _fmtTime(secs) {
    if (!isFinite(secs)) secs = 0;
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = Math.floor(secs % 60);
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }

  // ── Theme & Language ───────────────────────────────────────────────────────

  _toggleTheme() {
    this.theme = this.theme === 'dark' ? 'light' : 'dark';
    document.body.className = `theme-${this.theme}`;
    localStorage.setItem(STORAGE_THEME, this.theme);
    const btn = document.getElementById('btn-theme');
    if (btn) btn.innerHTML = this.theme === 'dark' ? Icons.sun : Icons.moon;
    this.timeline.draw();
  }

  _setLanguage(locale) {
    this.i18n.setLocale(locale);
    const langBtn = document.getElementById('btn-lang');
    if (langBtn) langBtn.textContent = locale === 'en' ? 'KO' : 'EN';
    this._applyTooltips();
    this._syncSubtitleToggleButton();
    this._syncSidebarToggleButton();
    this._syncTimelineToggleButton();
    this.fileTree.updateTranslations();
    this.fileInfo.updateTranslations();
    this.preview.updateTranslations();
    this.timeline.updateTranslations();
    this.streamLinks?.updateLocale();
    this._syncMenuLocale(locale);
  }

  _syncMenuLocale(locale) {
    window.electronAPI?.setMenuLocale?.(locale);
  }

  // ── Stream link events ─────────────────────────────────────────────────────

  _onStreamEntrySelect(entry) {
    this.preview.loadFile(entry);
    this.preview.clearSubtitles();
    this._syncSubtitleToggleButton();
    this._setStatus('ready');
  }

  // ── File events ────────────────────────────────────────────────────────────

  async _onFileSelect(entry) {
    const reqId = this.fileInfo.beginLoad(entry);
    this.preview.loadFile(entry);
    this.preview.clearSubtitles();
    this._syncSubtitleToggleButton();
    await this._autoLoadSidecarSubtitles(entry);
    this._setStatus('ready');

    try {
      const metaPromise = (entry?.path && window.electronAPI?.getMediaInfo)
        ? window.electronAPI.getMediaInfo(entry.path).catch((err) => {
          console.warn('[fileInfo] getMediaInfo failed:', err);
          return null;
        })
        : Promise.resolve(null);

      const [meta, previewMeta] = await Promise.all([
        metaPromise,
        this._waitPreviewMetadata(2500),
      ]);
      if (reqId !== this.fileInfo._requestId) return;

      const merged = this._mergeMediaMeta(meta, previewMeta);
      this.fileInfo.completeLoad(reqId, merged);
      if (merged?.duration && isFinite(merged.duration)) entry.duration = merged.duration;
      if (merged?.size) entry.size = merged.size;
      if (merged?.path) entry.displayPath = merged.path;
    } catch (err) {
      console.warn('[fileInfo] metadata failed:', err);
      if (reqId === this.fileInfo._requestId) {
        this.fileInfo.completeLoad(reqId, this._mergePreviewMediaMeta(null));
      }
    }
  }

  _waitPreviewMetadata(timeoutMs = 2000) {
    return new Promise((resolve) => {
      const el = this.preview?.mediaEl;
      if (!el) {
        resolve(null);
        return;
      }
      const read = () => {
        const dur = Number(el.duration);
        const info = {};
        if (Number.isFinite(dur) && dur > 0) info.duration = dur;
        if (el.videoWidth && el.videoHeight) {
          info.width = el.videoWidth;
          info.height = el.videoHeight;
          info.isVideo = true;
        }
        return Object.keys(info).length ? info : null;
      };
      if (read()) {
        resolve(read());
        return;
      }
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        el.removeEventListener('loadedmetadata', onMeta);
        el.removeEventListener('durationchange', onMeta);
        resolve(read());
      };
      const onMeta = () => finish();
      const timer = setTimeout(finish, timeoutMs);
      el.addEventListener('loadedmetadata', onMeta);
      el.addEventListener('durationchange', onMeta);
    });
  }

  _mergeMediaMeta(primary, secondary) {
    const out = {};
    if (secondary) Object.assign(out, secondary);
    if (primary) {
      for (const [key, value] of Object.entries(primary)) {
        if (value != null && value !== '') out[key] = value;
      }
    }
    return Object.keys(out).length ? out : null;
  }

  /** Fill gaps in probe results from the already-loading preview element. */
  _mergePreviewMediaMeta(meta) {
    const el = this.preview?.mediaEl;
    if (!el) return meta;
    const secondary = {};
    const dur = Number(el.duration);
    if (Number.isFinite(dur) && dur > 0) secondary.duration = dur;
    if (el.videoWidth && el.videoHeight) {
      secondary.width = el.videoWidth;
      secondary.height = el.videoHeight;
      secondary.isVideo = true;
    }
    return this._mergeMediaMeta(meta, secondary);
  }

  _onFileDblClick(entry) {
    this.preview.loadFile(entry);
    this.preview.clearSubtitles();
    this._syncSubtitleToggleButton();
    this._autoLoadSidecarSubtitles(entry);
    const AUDIO_EXT = new Set(['.mp3','.wav','.aac','.flac','.ogg','.m4a','.wma','.opus','.aiff']);
    const isAudio = AUDIO_EXT.has((entry.extension || '').toLowerCase());
    const clip = this.timeline.addClip(entry, isAudio ? 'a1' : 'v1');
    this.preview.applyClipEffects(clip);
    const mediaDur = this.preview.mediaEl?.duration;
    const syncDur = (mediaDur && isFinite(mediaDur) && mediaDur > 0) ? mediaDur : entry?.duration;
    if (syncDur) {
      this.timeline.syncClipDuration(clip, { duration: syncDur });
    } else if (this.preview.mediaEl) {
      const el = this.preview.mediaEl;
      const onDuration = () => {
        if (el.duration && isFinite(el.duration) && el.duration > 0) {
          this.timeline.syncClipDuration(clip, { duration: el.duration });
        }
        el.removeEventListener('durationchange', onDuration);
      };
      el.addEventListener('durationchange', onDuration);
    }
    if (window.electronAPI?.getMediaInfo && entry.path) {
      window.electronAPI.getMediaInfo(entry.path).then(meta => {
        if (meta?.duration && isFinite(Number(meta.duration)) && Number(meta.duration) > 0) {
          entry.duration = Number(meta.duration);
          this.timeline.syncClipDuration(clip, { duration: entry.duration });
        }
      }).catch(() => {});
    }
    this.isDirty = true;
  }

  // ── Context menus ──────────────────────────────────────────────────────────

  _t(key) { return this.i18n.t(key); }

  async _copyPath(p) {
    if (!p) return;
    try { await navigator.clipboard.writeText(p); } catch { /* ignore */ }
  }

  _showInExplorer(p) {
    if (!p || !window.electronAPI?.showItemInFolder) return;
    window.electronAPI.showItemInFolder(p);
  }

  _showTreeContextMenu(entry, x, y) {
    const t = (k) => this._t(k);
    const isWeb = !!window.electronAPI?.isWeb;

    if (!entry) {
      ContextMenu.show(x, y, [
        { icon: Icons.refresh, label: t('context.refresh'), action: () => this.fileTree.refresh() },
        { separator: true },
        {
          icon: isWeb ? Icons.import : Icons.open,
          label: isWeb ? t('fileExplorer.addMedia') : t('context.openFolder'),
          action: async () => {
            if (isWeb) {
              await this.fileTree.importMediaToLibrary?.();
              return;
            }
            const dir = await window.electronAPI.openFolderDialog?.();
            if (dir) this.fileTree.revealPath(dir);
          },
        },
      ]);
      return;
    }

    const isDir = !!entry.isDirectory || !!entry.isDrive;
    const isMedia = !!entry.isMedia
      || ['.mp4','.avi','.mov','.mkv','.webm','.flv','.wmv','.m4v','.ts','.mts',
          '.mp3','.wav','.aac','.flac','.ogg','.m4a','.wma','.opus','.aiff']
          .includes((entry.extension || '').toLowerCase());

    ContextMenu.show(x, y, [
      !isDir && isMedia && {
        icon: Icons.video,
        label: t('context.preview'),
        action: () => this._onFileSelect(entry),
      },
      !isDir && isMedia && {
        icon: Icons.plus,
        label: t('context.addToTimeline'),
        shortcut: 'Dbl-click',
        action: () => this._onFileDblClick(entry),
      },
      !isDir && isMedia && {
        icon: Icons.sparkles,
        label: t('context.analyzeScenes'),
        action: () => this._analyzeScenesFromEntry(entry),
      },
      !isDir && isMedia && {
        icon: Icons.subtitles,
        label: t('menu.generateSubtitles'),
        action: async () => {
          await this._onFileSelect(entry);
          await this._waitPreviewMetadata(8000);
          await this._generateSubtitles();
        },
      },
      isDir && {
        icon: Icons.folderOpen,
        label: t('context.revealInTree'),
        action: () => this.fileTree.revealPath(entry.path),
      },
      { separator: true },
      {
        icon: Icons.copy,
        label: t('context.copyPath'),
        action: () => this._copyPath(entry.path),
      },
      !isWeb && {
        icon: Icons.explorer,
        label: t('context.showInExplorer'),
        action: () => this._showInExplorer(entry.path),
      },
      !isDir && isMedia && {
        icon: Icons.trash,
        label: t('context.deleteFile'),
        danger: true,
        action: () => this._deleteTreeFile(entry),
      },
      { separator: true },
      { icon: Icons.refresh, label: t('context.refresh'), action: () => this.fileTree.refresh() },
    ]);
  }

  async _deleteTreeFile(entry) {
    if (!entry?.path || !window.electronAPI?.deleteMediaFile) return;

    const name = entry.name || entry.path.split(/[\\/]/).pop() || entry.path;
    const isWeb = !!window.electronAPI.isWeb;
    const confirmKey = isWeb ? 'context.deleteFileConfirmWeb' : 'context.deleteFileConfirm';
    const msg = this._t(confirmKey).replace('{name}', name);
    const confirmed = await showConfirm(msg);
    if (!confirmed) return;

    const result = await window.electronAPI.deleteMediaFile(entry.path);
    if (!result?.ok) {
      await showAlert(this._t('context.deleteFileFailed') + (result?.error ? `\n${result.error}` : ''));
      return;
    }

    if (this.fileTree.getSelected?.() === entry.path || this.fileTree._selectedPath === entry.path) {
      this.fileTree.setSelected(null);
    }
    if (this.preview?.currentFile?.path === entry.path) {
      this.preview.showEmpty();
    }
    this.fileInfo?.clear?.();
    await this.fileTree.refresh();
    this._setStatus('ready');
  }

  async _saveCurrentFile() {
    const file = this.preview?.currentFile;
    if (!file) return;
    if (file.isStream && file.urlType === 'youtube') {
      await this.streamLinks?._downloadYoutube?.({ originalUrl: file.originalUrl, id: '_preview' });
      return;
    }
    if (!file.path || !window.electronAPI?.saveMediaFileDialog) return;
    const result = await window.electronAPI.saveMediaFileDialog(file.path, file.name);
    if (result?.cancelled) return;
    if (result?.ok) {
      await showAlert(this._t('context.saveFileOk').replace('{path}', result.filePath));
    } else if (result?.error) {
      await showAlert(this._t('context.saveFileFailed').replace('{error}', result.error));
    }
  }

  _replaceFileExt(filePath, newExt) {
    const p = String(filePath || '');
    if (!p) return '';
    return p.replace(/\.[^./\\]+$/, '') + newExt;
  }

  _subtitleTextFor(format, cues) {
    const fmt = String(format || '').toLowerCase();
    if (fmt === 'smi') return cuesToSmi(cues);
    return cuesToSrt(cues);
  }

  _subtitleAutoLoadOrderLabelKey() {
    return this._subtitleSidecarOrder === 'smi-first'
      ? 'context.subtitleAutoLoadOrderSmiFirst'
      : 'context.subtitleAutoLoadOrderSrtFirst';
  }

  async _toggleSubtitleAutoLoadOrder() {
    this._subtitleSidecarOrder = this._subtitleSidecarOrder === 'smi-first'
      ? 'srt-first'
      : 'smi-first';
    localStorage.setItem(STORAGE_SUBTITLE_SIDECAR_ORDER, this._subtitleSidecarOrder);

    const current = this.preview?.currentFile;
    if (current?.path) {
      this.preview.clearSubtitles();
      this._syncSubtitleToggleButton();
      await this._autoLoadSidecarSubtitles(current);
    }
  }

  async _saveCurrentSubtitles(format = 'srt') {
    const fmt = String(format || 'srt').toLowerCase() === 'smi' ? 'smi' : 'srt';
    const cues = this.preview?.getSubtitles?.() || [];
    if (!cues.length) {
      await showAlert(this.i18n.t('subtitle.noneToToggle'));
      return;
    }

    const saveMode = await this._pickSubtitleSaveMode(cues, {
      defaultMode: localStorage.getItem(STORAGE_SUBTITLE_SAVE_MODE) || 'target',
      stem,
      format: fmt,
    });
    if (!saveMode) return;

    const hasTranslated = this._hasTranslatedSubtitlePairs(cues);
    const suffix = this._subtitleSaveSuffix(saveMode, hasTranslated, cues);
    const saveCues = this._buildCuesForSaveMode(cues, saveMode);

    const srcName = this.preview?.currentFile?.name || 'media';
    const stem = String(srcName).replace(/\.[^.]+$/, '') || 'media';
    const defaultName = `${stem}${suffix}.${fmt}`;
    const text = this._subtitleTextFor(fmt, saveCues);
    let outPath = null;

    const currentPath = this.preview?.currentFile?.path;
    if (currentPath && window.electronAPI?.writeTextFile) {
      outPath = this._replaceFileExt(currentPath, `${suffix}.${fmt}`);
      const result = await window.electronAPI.writeTextFile(outPath, text, { append: false });
      if (!result?.ok) {
        await showAlert(this.i18n.t('context.saveFileFailed').replace('{error}', result?.error || 'Unknown error'));
        return;
      }
      await showAlert(this.i18n.t('context.saveFileOk').replace('{path}', outPath));
      return;
    }

    if (window.electronAPI?.saveSubtitleDialog && window.electronAPI?.writeTextFile) {
      outPath = await window.electronAPI.saveSubtitleDialog(defaultName, fmt);
      if (!outPath) return;
      const result = await window.electronAPI.writeTextFile(outPath, text, { append: false });
      if (!result?.ok) {
        await showAlert(this.i18n.t('context.saveFileFailed').replace('{error}', result?.error || 'Unknown error'));
        return;
      }
      await showAlert(this.i18n.t('context.saveFileOk').replace('{path}', outPath));
      return;
    }

    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = defaultName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  async _autoLoadSidecarSubtitles(entry) {
    const mediaPath = entry?.path;
    if (!mediaPath || !window.electronAPI?.readTextFile) return;

    const exts = this._subtitleSidecarOrder === 'smi-first'
      ? ['.smi', '.srt']
      : ['.srt', '.smi'];
    const candidates = exts.map((ext) => ({
      ext,
      path: this._replaceFileExt(mediaPath, ext),
    }));

    for (const c of candidates) {
      try {
        const result = await window.electronAPI.readTextFile(c.path);
        if (!result?.ok || !result.text) continue;
        const cues = parseSubtitleText(result.text, c.ext);
        if (!cues.length) continue;
        this.preview.setSubtitles(cues);
        this._lastSubtitles = cues;
        this._syncSubtitleToggleButton();
        return;
      } catch {
        // Ignore missing files and parse failures; try next candidate.
      }
    }
  }

  _showPreviewContextMenu(x, y, file) {
    const t = (k) => this._t(k);
    const hasMedia = !!this.preview.mediaEl;
    const playing = !!this.preview.isPlaying;

    ContextMenu.show(x, y, [
      {
        icon: playing ? Icons.pause : Icons.play,
        label: playing ? t('toolbar.pause') : t('toolbar.play'),
        shortcut: 'Space',
        disabled: !hasMedia,
        action: () => this._togglePlay(),
      },
      {
        icon: Icons.stop,
        label: t('toolbar.stop'),
        disabled: !hasMedia,
        action: () => {
          this.preview.showTransportCue('stop');
          this._stopPlayback();
        },
      },
      {
        icon: (this.preview.isMuted || this.preview.volume <= 0) ? Icons.mute : Icons.volume,
        label: (this.preview.isMuted || this.preview.volume <= 0) ? t('preview.unmute') : t('preview.mute'),
        shortcut: 'M',
        action: () => this.preview.toggleMute(),
      },
      {
        icon: Icons.volume,
        label: `${t('preview.volume')} +`,
        shortcut: '↑',
        action: () => this.preview.adjustVolume(0.1),
      },
      {
        icon: Icons.volume,
        label: `${t('preview.volume')} −`,
        shortcut: '↓',
        action: () => this.preview.adjustVolume(-0.1),
      },
      {
        icon: Icons.fullscreen,
        label: t('preview.fullscreen'),
        disabled: !hasMedia,
        action: () => {
          document.getElementById('prev-fullscreen')?.click();
        },
      },
      { separator: true },
      {
        icon: Icons.fitWindow,
        label: t('preview.fitWindow'),
        disabled: !hasMedia,
        action: () => this.preview.setViewMode('fit'),
      },
      {
        icon: Icons.fillWindow,
        label: t('preview.fillWindow'),
        disabled: !hasMedia,
        action: () => this.preview.setViewMode('fill'),
      },
      {
        icon: Icons.actualSize,
        label: t('preview.actualSize'),
        shortcut: 'Ctrl+1',
        disabled: !hasMedia,
        action: () => this.preview.setViewMode('actual'),
      },
      { separator: true },
      {
        icon: Icons.sparkles,
        label: t('context.analyzeScenes'),
        disabled: !hasMedia,
        action: () => this._analyzeScenes(),
      },
      {
        icon: Icons.subtitles,
        label: t('menu.generateSubtitles'),
        disabled: !hasMedia,
        action: () => this._generateSubtitles(),
      },
      file && {
        icon: Icons.plus,
        label: t('context.addToTimeline'),
        action: () => {
          this.timeline.addClip(file, 'v1');
          this.isDirty = true;
        },
      },
      file && {
        icon: Icons.copy,
        label: t('context.copyPath'),
        action: () => this._copyPath(file.path),
      },
      file && !file.isStream && {
        icon: Icons.explorer,
        label: t('context.showInExplorer'),
        action: () => this._showInExplorer(file.path),
      },
      { separator: true },
      hasMedia && {
        icon: Icons.download,
        label: file?.isStream && file?.urlType === 'youtube'
          ? t('context.downloadStream')
          : t('context.saveFile'),
        disabled: !hasMedia || (file?.isStream && file?.urlType !== 'youtube'),
        action: () => this._saveCurrentFile(),
      },
      hasMedia && (() => {
        const hasSubs = this.preview?.hasSubtitles?.();
        const subOn = this.preview?.isSubtitlesVisible?.();
        return {
          icon: Icons.subtitlesToggle,
          label: subOn ? t('context.toggleSubtitlesOff') : t('context.toggleSubtitlesOn'),
          disabled: !hasSubs,
          action: () => this._toggleSubtitlesVisible(),
        };
      })(),
      hasMedia && {
        icon: Icons.download,
        label: t('context.saveSubtitlesSrt'),
        disabled: !this.preview?.hasSubtitles?.(),
        action: () => this._saveCurrentSubtitles('srt'),
      },
      hasMedia && {
        icon: Icons.download,
        label: t('context.saveSubtitlesSmi'),
        disabled: !this.preview?.hasSubtitles?.(),
        action: () => this._saveCurrentSubtitles('smi'),
      },
      hasMedia && {
        icon: Icons.subtitles,
        label: t(this._subtitleAutoLoadOrderLabelKey()),
        action: () => this._toggleSubtitleAutoLoadOrder(),
      },
      { separator: true },
      {
        icon: Icons.import,
        label: t('menu.importMedia'),
        shortcut: 'Ctrl+I',
        action: () => this._importMedia(),
      },
    ]);
  }

  _showTimelineContextMenu(x, y, clip) {
    const t = (k) => this._t(k);

    if (clip) {
      ContextMenu.show(x, y, [
        {
          icon: Icons.split,
          label: t('menu.splitClip'),
          shortcut: 'Ctrl+B',
          action: () => this.timeline.splitSelectedClip(),
        },
        {
          icon: Icons.trash,
          label: t('menu.deleteClip'),
          shortcut: 'Del',
          danger: true,
          action: () => {
            this.timeline.deleteSelectedClip();
            this.isDirty = true;
          },
        },
        { separator: true },
        {
          icon: Icons.copy,
          label: t('context.copyPath'),
          disabled: !clip.path,
          action: () => this._copyPath(clip.path),
        },
        {
          icon: Icons.explorer,
          label: t('context.showInExplorer'),
          disabled: !clip.path,
          action: () => this._showInExplorer(clip.path),
        },
        { separator: true },
        { icon: Icons.zoomIn, label: t('toolbar.zoomIn'), action: () => this.timeline.zoomIn() },
        { icon: Icons.zoomOut, label: t('toolbar.zoomOut'), action: () => this.timeline.zoomOut() },
      ]);
      return;
    }

    ContextMenu.show(x, y, [
      {
        icon: Icons.video,
        label: t('timeline.addVideoTrack'),
        action: () => this.timeline.addTrack('video'),
      },
      {
        icon: Icons.audio,
        label: t('timeline.addAudioTrack'),
        action: () => this.timeline.addTrack('audio'),
      },
      { separator: true },
      { icon: Icons.zoomIn, label: t('toolbar.zoomIn'), action: () => this.timeline.zoomIn() },
      { icon: Icons.zoomOut, label: t('toolbar.zoomOut'), action: () => this.timeline.zoomOut() },
      { separator: true },
      {
        icon: Icons.import,
        label: t('menu.importMedia'),
        shortcut: 'Ctrl+I',
        action: () => this._importMedia(),
      },
    ]);
  }

  // ── Status bar ─────────────────────────────────────────────────────────────

  _setStatus(key) {
    const el = document.getElementById('status-text');
    if (el) el.textContent = this.i18n.t(`status.${key}`);
    const dot = document.getElementById('status-dot');
    if (dot) {
      dot.className = 'status-dot' + (key === 'playing' ? ' playing' : key === 'error' ? ' error' : '');
    }
  }

  _setTitle(projectName) {
    const suffix = projectName ? ` — ${projectName}` : '';
    document.title = this.i18n.t('app.title') + suffix;
  }

  // ── Menu actions from main process ─────────────────────────────────────────

  _bindMenuActions() {
    if (!window.electronAPI) return;
    window.electronAPI.onMenuAction((action) => {
      switch (action) {
        case 'new-project':        this._newProject(); break;
        case 'open-project':       this._openProject(); break;
        case 'save-project':       this._saveProject(); break;
        case 'save-project-as':       this._saveProject(true); break;
        case 'save-project-modified': this._saveProjectAsModified(); break;
        case 'import-media':       this._importMedia(); break;
        case 'export':             this._export(); break;
        case 'analyze-scenes':     this._analyzeScenes(); break;
        case 'view-analysis':      this._viewAnalysisResults(); break;
        case 'generate-subtitles': this._generateSubtitles(); break;
        case 'toggle-subtitles':   this._toggleSubtitlesVisible(); break;
        case 'ollama-settings':    this._openOllamaSettings(); break;
        case 'undo':               this._undo(); break;
        case 'redo':               this._redo(); break;
        case 'split-clip':         this.timeline.splitSelectedClip(); break;
        case 'delete-clip':        this.timeline.deleteSelectedClip(); break;
        case 'toggle-theme':       this._toggleTheme(); break;
        case 'set-language-en':    this._setLanguage('en'); break;
        case 'set-language-ko':    this._setLanguage('ko'); break;
        case 'zoom-in':            this.timeline.zoomIn(); break;
        case 'zoom-out':           this.timeline.zoomOut(); break;
        case 'toggle-sidebar':     this._toggleSidebarPanel(); break;
        case 'toggle-timeline':    this._toggleTimelinePanel(); break;
      }
    });

    window.electronAPI.onExportProgress((progress) => {
      const fill = document.getElementById('export-progress-fill');
      const label = document.getElementById('export-progress-label');
      if (fill) fill.style.width = progress.percent + '%';
      if (label) label.textContent = progress.percent + '%';
      if (progress.status === 'done') {
        setTimeout(() => this._hideExportOverlay(), 600);
      }
    });
  }

  // ── Keyboard shortcuts ────────────────────────────────────────────────────

  _bindKeyboard() {
    document.addEventListener('keydown', (e) => {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if (e.code === 'Space') { e.preventDefault(); this._togglePlay(); }
      if (e.code === 'Delete' || e.code === 'Backspace') this.timeline.deleteSelectedClip();
      if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        this.preview.toggleMute();
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        this.preview.adjustVolume(0.05);
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        this.preview.adjustVolume(-0.05);
      }
      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case 'n': e.preventDefault(); this._newProject(); break;
          case 'o': e.preventDefault(); this._openProject(); break;
          case 's': e.preventDefault();
            if (e.altKey) this._saveProjectAsModified();
            else if (e.shiftKey) this._saveProject(true);
            else this._saveProject();
            break;
          case 'i': e.preventDefault(); this._importMedia(); break;
          case 'e': e.preventDefault(); this._export(); break;
          case 'A':
          case 'a':
            if (e.shiftKey) { e.preventDefault(); this._analyzeScenes(); }
            break;
          case 'V':
          case 'v':
            if (e.shiftKey) { e.preventDefault(); this._viewAnalysisResults(); }
            break;
          case 'T':
          case 't':
            if (e.shiftKey) { e.preventDefault(); this._generateSubtitles(); }
            break;
          case 'C':
          case 'c':
            if (e.shiftKey) { e.preventDefault(); this._toggleSubtitlesVisible(); }
            break;
          case 'L':
          case 'l':
            if (e.shiftKey) { e.preventDefault(); this._toggleTimelinePanel(); }
            break;
          case 'B':
          case 'b':
            if (e.shiftKey) { e.preventDefault(); this._toggleSidebarPanel(); }
            else { e.preventDefault(); this.timeline.splitSelectedClip(); }
            break;
          case 't': e.preventDefault(); this._toggleTheme(); break;
          case '=': case '+': this.timeline.zoomIn(); break;
          case '-': this.timeline.zoomOut(); break;
          case '0': e.preventDefault(); this.preview.setViewMode('fit'); break;
          case '1': e.preventDefault(); this.preview.setViewMode('actual'); break;
          case '2': e.preventDefault(); this.preview.setViewMode('fill'); break;
        }
      }
    });
  }

  // ── Export overlay ────────────────────────────────────────────────────────

  _setupExportOverlay() {
    const overlay = document.getElementById('export-overlay');
    if (!overlay) return;
    overlay.innerHTML = `
      <div class="export-card">
        <h3>${this.i18n.t('dialog.exportSettings')}</h3>
        <div class="export-progress-bar-track">
          <div class="export-progress-bar-fill" id="export-progress-fill" style="width:0%"></div>
        </div>
        <div id="export-progress-label" style="font-size:12px;color:var(--text-secondary)">0%</div>
        <button class="export-cancel-btn" id="export-cancel-btn">${Icons.close}<span>${this.i18n.t('dialog.cancel')}</span></button>
      </div>
    `;
    document.getElementById('export-cancel-btn')?.addEventListener('click', () => {
      window.electronAPI?.cancelExport();
      this._hideExportOverlay();
    });
  }

  _showExportOverlay() {
    const el = document.getElementById('export-overlay');
    if (el) el.classList.add('visible');
    const fill = document.getElementById('export-progress-fill');
    if (fill) fill.style.width = '0%';
  }

  _hideExportOverlay() {
    const el = document.getElementById('export-overlay');
    if (el) el.classList.remove('visible');
  }

  // ── Ollama scene analysis ─────────────────────────────────────────────────

  async _openOllamaSettings() {
    await showOllamaSettingsDialog(this.i18n);
  }

  _toggleSubtitlesVisible() {
    if (!this.preview) return;
    if (!this.preview.hasSubtitles()) {
      showAlert(this.i18n.t('subtitle.noneToToggle'));
      return;
    }
    this.preview.toggleSubtitlesVisible();
    this._syncSubtitleToggleButton();
  }

  _syncSubtitleToggleButton() {
    const btn = document.getElementById('btn-toggle-subtitles');
    if (!btn || !this.preview) return;
    const on = this.preview.isSubtitlesVisible();
    const has = this.preview.hasSubtitles();
    btn.classList.toggle('active', on && has);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    const key = on ? 'toolbar.subtitlesHide' : 'toolbar.subtitlesShow';
    btn.setAttribute('data-i18n-tooltip', key);
    const tip = this.i18n.t(key);
    btn.setAttribute('data-tooltip', tip);
    btn.setAttribute('aria-label', tip);
    btn.setAttribute('title', tip);
  }

  _toggleTimelinePanel() {
    this._applyTimelineCollapsed(!this._timelineCollapsed);
  }

  /**
   * @param {boolean} collapsed
   * @param {{ persist?: boolean }} [opts]
   */
  _applyTimelineCollapsed(collapsed, opts = {}) {
    this._timelineCollapsed = !!collapsed;
    const work = document.getElementById('work-area');
    work?.classList.toggle('timeline-collapsed', this._timelineCollapsed);
    if (opts.persist !== false) {
      localStorage.setItem(STORAGE_TIMELINE_COLLAPSED, this._timelineCollapsed ? '1' : '0');
    }
    this._syncTimelineToggleButton();
    // Let layout settle, then redraw preview/timeline
    requestAnimationFrame(() => {
      try { this.timeline?._resize?.(); } catch { /* ignore */ }
      try { this.preview?.mediaEl && this.preview._emitMediaTime?.(true); } catch { /* ignore */ }
    });
  }

  _syncTimelineToggleButton() {
    const btn = document.getElementById('btn-toggle-timeline');
    if (!btn) return;
    const expanded = !this._timelineCollapsed;
    btn.classList.toggle('active', expanded);
    btn.setAttribute('aria-pressed', expanded ? 'true' : 'false');
    const key = expanded ? 'toolbar.timelineHide' : 'toolbar.timelineShow';
    btn.setAttribute('data-i18n-tooltip', key);
    const tip = this.i18n.t(key);
    btn.setAttribute('data-tooltip', tip);
    btn.setAttribute('aria-label', tip);
    btn.setAttribute('title', tip);
  }

  _toggleSidebarPanel() {
    this._applySidebarCollapsed(!this._sidebarCollapsed);
  }

  /**
   * Collapse/expand file tree + file info together.
   * @param {boolean} collapsed
   * @param {{ persist?: boolean }} [opts]
   */
  _applySidebarCollapsed(collapsed, opts = {}) {
    this._sidebarCollapsed = !!collapsed;
    const layout = document.getElementById('main-layout');
    layout?.classList.toggle('sidebar-collapsed', this._sidebarCollapsed);
    if (opts.persist !== false) {
      localStorage.setItem(STORAGE_SIDEBAR_COLLAPSED, this._sidebarCollapsed ? '1' : '0');
    }
    this._syncSidebarToggleButton();
    requestAnimationFrame(() => {
      try { this.timeline?._resize?.(); } catch { /* ignore */ }
      try { this.preview?.mediaEl && this.preview._emitMediaTime?.(true); } catch { /* ignore */ }
    });
  }

  _syncSidebarToggleButton() {
    const btn = document.getElementById('btn-toggle-sidebar');
    if (!btn) return;
    const expanded = !this._sidebarCollapsed;
    btn.classList.toggle('active', expanded);
    btn.setAttribute('aria-pressed', expanded ? 'true' : 'false');
    const key = expanded ? 'toolbar.sidebarHide' : 'toolbar.sidebarShow';
    btn.setAttribute('data-i18n-tooltip', key);
    const tip = this.i18n.t(key);
    btn.setAttribute('data-tooltip', tip);
    btn.setAttribute('aria-label', tip);
    btn.setAttribute('title', tip);
  }

  async _generateSubtitles() {
    if (this._subtitleBusy) return;
    if (!this.preview?.mediaEl) {
      await showAlert(this.i18n.t('subtitle.noMedia'));
      return;
    }

    const options = await showSubtitleOptionsDialog({
      recognitionLanguage: localStorage.getItem(STORAGE_SUBTITLE_INPUT_LANG) || 'auto',
      outputLanguage: localStorage.getItem(STORAGE_SUBTITLE_OUTPUT_LANG) || 'source',
      dualMode: localStorage.getItem(STORAGE_SUBTITLE_DUAL_MODE) === '1',
      dualOrder: localStorage.getItem(STORAGE_SUBTITLE_DUAL_ORDER) || 'source-first',
      confidenceProfile: localStorage.getItem(STORAGE_SUBTITLE_CONFIDENCE_PROFILE) || 'balanced',
      suffixSource: localStorage.getItem(STORAGE_SUBTITLE_SUFFIX_SOURCE) || '.source',
      suffixTarget: localStorage.getItem(STORAGE_SUBTITLE_SUFFIX_TARGET) || '.target',
      suffixDual: localStorage.getItem(STORAGE_SUBTITLE_SUFFIX_DUAL) || '.dual',
      suffixLangCode: localStorage.getItem(STORAGE_SUBTITLE_SUFFIX_LANGCODE) === '1',
      suffixLangFormat: localStorage.getItem(STORAGE_SUBTITLE_SUFFIX_LANGFORMAT) || 'iso',
    });
    if (!options) return;

    const recognitionLanguage = String(options.recognitionLanguage || 'auto').trim().toLowerCase() || 'auto';
    const outputLanguage = String(options.outputLanguage || 'source').trim().toLowerCase() || 'source';
    const dualMode = !!options.dualMode;
    const dualOrder = String(options.dualOrder || 'source-first') === 'target-first'
      ? 'target-first'
      : 'source-first';
    const confidenceProfile = String(options.confidenceProfile || 'balanced').toLowerCase();
    const suffixSource = this._normalizeSubtitleSuffix(options.suffixSource, '.source');
    const suffixTarget = this._normalizeSubtitleSuffix(options.suffixTarget, '.target');
    const suffixDual = this._normalizeSubtitleSuffix(options.suffixDual, '.dual');
    const suffixLangCode = !!options.suffixLangCode;
    const suffixLangFormat = String(options.suffixLangFormat || 'iso') === 'model' ? 'model' : 'iso';
    localStorage.setItem(STORAGE_SUBTITLE_INPUT_LANG, recognitionLanguage);
    localStorage.setItem(STORAGE_SUBTITLE_OUTPUT_LANG, outputLanguage);
    localStorage.setItem(STORAGE_SUBTITLE_DUAL_MODE, dualMode ? '1' : '0');
    localStorage.setItem(STORAGE_SUBTITLE_DUAL_ORDER, dualOrder);
    localStorage.setItem(
      STORAGE_SUBTITLE_CONFIDENCE_PROFILE,
      confidenceProfile === 'strict' || confidenceProfile === 'lenient' ? confidenceProfile : 'balanced'
    );
    localStorage.setItem(STORAGE_SUBTITLE_SUFFIX_SOURCE, suffixSource);
    localStorage.setItem(STORAGE_SUBTITLE_SUFFIX_TARGET, suffixTarget);
    localStorage.setItem(STORAGE_SUBTITLE_SUFFIX_DUAL, suffixDual);
    localStorage.setItem(STORAGE_SUBTITLE_SUFFIX_LANGCODE, suffixLangCode ? '1' : '0');
    localStorage.setItem(STORAGE_SUBTITLE_SUFFIX_LANGFORMAT, suffixLangFormat);

    this._subtitleBusy = true;
    this._subtitleCancelled = false;
    this._setStatus('analyzing');
    this._showSubtitleOverlay();
    this._updateSubtitleDetectionInfo(null, null);

    try {
      const locale = this.i18n.getLocale() === 'ko' ? 'ko' : 'en';
      const result = await generateSubtitlesFromPreview(this.preview, {
        locale,
        languageMode: recognitionLanguage,
        confidenceProfile,
        cancelled: () => !!this._subtitleCancelled,
        onProgress: ({ percent, labelKey, labelParams }) => {
          const label = labelKey
            ? this.i18n.t(labelKey, labelParams || {})
            : this.i18n.t('subtitle.transcribing');
          this._updateSubtitleProgress(percent, label);
        },
      });

      if (result?.cancelled) {
        this._hideSubtitleOverlay();
        this._setStatus('ready');
        await showAlert(this.i18n.t('subtitle.cancelled'));
        return;
      }

      let cues = result?.cues || [];
      if (!cues.length) {
        this._hideSubtitleOverlay();
        this._setStatus('ready');
        await showAlert(this.i18n.t('subtitle.empty'));
        return;
      }

      const detectedLanguage = String(result?.detectedLanguage || locale).toLowerCase();
      this._updateSubtitleDetectionInfo(detectedLanguage, result?.detectionConfidence);
      if (outputLanguage !== 'source') {
        const sourceCues = cues.map((c) => ({ ...c }));
        const targetLabel = this._subtitleLanguageLabel(outputLanguage);
        this._updateSubtitleProgress(88, this.i18n.t('subtitle.translatingTo', { language: targetLabel }));
        const translatedCues = await this._translateSubtitlesWithOllama(cues, {
          sourceLanguage: detectedLanguage,
          targetLanguage: outputLanguage,
          cancelled: () => !!this._subtitleCancelled,
          onProgress: (percent) => {
            this._updateSubtitleProgress(percent, this.i18n.t('subtitle.translatingTo', { language: targetLabel }));
          },
        });

        cues = translatedCues.map((c, idx) => {
          const sourceText = String(sourceCues[idx]?.text || '').trim();
          const targetText = String(c?.text || '').trim();
          return {
            ...c,
            sourceText,
            targetText: targetText || sourceText,
            sourceLang: detectedLanguage,
            targetLang: outputLanguage,
            sourceLangModel: String(result?.usedLanguage || detectedLanguage || '').toLowerCase(),
            targetLangModel: String(outputLanguage || '').toLowerCase(),
            text: targetText || sourceText,
          };
        });

        if (dualMode) {
          cues = cues.map((c, idx) => {
            const sourceText = String(c?.sourceText || '').trim();
            const targetText = String(c?.targetText || '').trim();
            if (!sourceText) return c;
            if (!targetText || targetText === sourceText) return c;
            const top = dualOrder === 'target-first' ? targetText : sourceText;
            const bottom = dualOrder === 'target-first' ? sourceText : targetText;
            return {
              ...c,
              text: `${top}\n${bottom}`,
            };
          });
        }
      }

      if (this._subtitleCancelled) {
        this._hideSubtitleOverlay();
        this._setStatus('ready');
        await showAlert(this.i18n.t('subtitle.cancelled'));
        return;
      }

      this._hideSubtitleOverlay();
      this._setStatus('ready');

      this.preview.setSubtitles(cues);
      this._lastSubtitles = cues;
      this._syncSubtitleToggleButton();
      // Jump to first cue so the on-screen subtitle is visible immediately
      const t0 = Number(cues[0]?.start) || 0;
      try {
        this.preview.pause();
        this.preview.seek(t0);
        this._updatePlayBtn(false);
      } catch { /* ignore */ }
      const detectLabel = this._subtitleLanguageLabel(String(result?.detectedLanguage || locale).toLowerCase());
      const detectConf = this.i18n.t(`subtitle.confidence${this._toConfidenceSuffix(result?.detectionConfidence)}`);
      await showAlert(this.i18n.t('subtitle.appliedWithDetection', {
        count: cues.length,
        language: detectLabel,
        confidence: detectConf,
      }));

      const save = await showConfirm(this.i18n.t('subtitle.saveSrt'));
      if (save) {
        const saveMode = await this._pickSubtitleSaveMode(cues, {
          defaultMode: dualMode ? 'dual' : null,
          stem,
          format: 'srt',
        });
        if (!saveMode) return;
        const saveCues = this._buildCuesForSaveMode(cues, saveMode);
        const suffix = this._subtitleSaveSuffix(saveMode, this._hasTranslatedSubtitlePairs(cues), cues);
        const srcName = this.preview.currentFile?.name || 'media';
        const stem = String(srcName).replace(/\.[^.]+$/, '') || 'subtitles';
        const defaultName = `${stem}${suffix}.srt`;
        const outPath = await window.electronAPI?.saveSubtitleDialog?.(defaultName);
        if (outPath) {
          const srt = cuesToSrt(saveCues);
          if (window.electronAPI?.isWeb) {
            const blob = new Blob([srt], { type: 'text/plain;charset=utf-8' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = String(outPath).split(/[\\/:]/).pop() || defaultName;
            a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 2000);
          } else {
            await window.electronAPI.writeTextFile(outPath, srt, { append: false });
          }
        }
      }
    } catch (err) {
      console.error('[subtitle] generation failed', err);
      this._hideSubtitleOverlay();
      this._setStatus('error');
      await showAlert(this.i18n.t('subtitle.failed', {
        error: err?.message || String(err),
      }));
      this._setStatus('ready');
    } finally {
      this._subtitleBusy = false;
      this._subtitleCancelled = false;
    }
  }

  _subtitleLanguageLabel(code) {
    const key = String(code || '').trim().toLowerCase();
    const map = {
      en: 'English',
      ko: 'Korean',
      ja: 'Japanese',
      zh: 'Chinese',
      es: 'Spanish',
      fr: 'French',
      de: 'German',
      it: 'Italian',
      pt: 'Portuguese',
      ru: 'Russian',
      ar: 'Arabic',
      hi: 'Hindi',
      tr: 'Turkish',
      vi: 'Vietnamese',
      th: 'Thai',
      id: 'Indonesian',
      pl: 'Polish',
      nl: 'Dutch',
      sv: 'Swedish',
      no: 'Norwegian',
      da: 'Danish',
      fi: 'Finnish',
      cs: 'Czech',
      ro: 'Romanian',
      hu: 'Hungarian',
      uk: 'Ukrainian',
    };
    return map[key] || code;
  }

  _toConfidenceSuffix(level) {
    const v = String(level || '').toLowerCase();
    if (v === 'high') return 'High';
    if (v === 'medium') return 'Medium';
    return 'Low';
  }

  _hasTranslatedSubtitlePairs(cues) {
    return Array.isArray(cues) && cues.some((c) => {
      const source = String(c?.sourceText || '').trim();
      const target = String(c?.targetText || '').trim();
      return !!source && !!target && source !== target;
    });
  }

  _buildCuesForSaveMode(cues, mode = 'target') {
    const saveMode = String(mode || 'target').toLowerCase();
    return (Array.isArray(cues) ? cues : []).map((c) => {
      const source = String(c?.sourceText || c?.text || '').trim();
      const target = String(c?.targetText || c?.text || '').trim();
      let text = target;
      if (saveMode === 'source') {
        text = source || target;
      } else if (saveMode === 'dual') {
        text = source && target && source !== target
          ? `${source}\n${target}`
          : (source || target);
      }
      return {
        start: Number(c?.start) || 0,
        end: Number(c?.end) || 0,
        text,
      };
    }).filter((c) => c.text && c.end > c.start);
  }

  async _pickSubtitleSaveMode(cues, { defaultMode = 'target', stem = 'subtitles', format = 'srt' } = {}) {
    if (!this._hasTranslatedSubtitlePairs(cues)) return 'target';
    const preferred = this._recommendedSubtitleSaveMode(cues, defaultMode);
    const previewNames = {
      source: `${stem}${this._subtitleSaveSuffix('source', true, cues)}.${format}`,
      target: `${stem}${this._subtitleSaveSuffix('target', true, cues)}.${format}`,
      dual: `${stem}${this._subtitleSaveSuffix('dual', true, cues)}.${format}`,
    };
    const mediaPath = String(this.preview?.currentFile?.path || '');
    const dir = mediaPath ? mediaPath.replace(/[\\/][^\\/]*$/, '') : '';
    const previewPaths = {
      source: dir ? `${dir}${dir.endsWith('\\') || dir.endsWith('/') ? '' : '\\'}${previewNames.source}` : '',
      target: dir ? `${dir}${dir.endsWith('\\') || dir.endsWith('/') ? '' : '\\'}${previewNames.target}` : '',
      dual: dir ? `${dir}${dir.endsWith('\\') || dir.endsWith('/') ? '' : '\\'}${previewNames.dual}` : '',
    };
    const picked = await showSubtitleSaveFormatDialog({
      defaultMode: preferred,
      previewNames,
      previewPaths,
    });
    if (!picked) return null;
    localStorage.setItem(STORAGE_SUBTITLE_SAVE_MODE, picked);
    return picked;
  }

  _recommendedSubtitleSaveMode(cues, defaultMode = null) {
    const forced = String(defaultMode || '').toLowerCase();
    if (forced === 'source' || forced === 'target' || forced === 'dual') return forced;

    const last = String(localStorage.getItem(STORAGE_SUBTITLE_SAVE_MODE) || '').toLowerCase();
    const hasDualDisplay = (Array.isArray(cues) ? cues : []).some((c) => {
      const source = String(c?.sourceText || '').trim();
      const target = String(c?.targetText || '').trim();
      const text = String(c?.text || '').trim();
      return !!source && !!target && source !== target && text.includes('\n');
    });
    if (hasDualDisplay) return 'dual';
    if (last === 'source' || last === 'target' || last === 'dual') return last;
    return 'target';
  }

  _subtitleSaveSuffix(mode, hasTranslated = true, cues = []) {
    if (!hasTranslated) return '';
    const key = String(mode || 'target').toLowerCase();
    const source = this._normalizeSubtitleSuffix(localStorage.getItem(STORAGE_SUBTITLE_SUFFIX_SOURCE), '.source');
    const target = this._normalizeSubtitleSuffix(localStorage.getItem(STORAGE_SUBTITLE_SUFFIX_TARGET), '.target');
    const dual = this._normalizeSubtitleSuffix(localStorage.getItem(STORAGE_SUBTITLE_SUFFIX_DUAL), '.dual');
    const base = key === 'source' ? source : key === 'dual' ? dual : target;

    if (localStorage.getItem(STORAGE_SUBTITLE_SUFFIX_LANGCODE) !== '1') return base;

    const format = localStorage.getItem(STORAGE_SUBTITLE_SUFFIX_LANGFORMAT) === 'model' ? 'model' : 'iso';
    const { sourceCode, targetCode } = this._subtitleLanguageCodesFromCues(cues, format);
    if (key === 'source') return sourceCode ? `${base}.${sourceCode}` : base;
    if (key === 'target') return targetCode ? `${base}.${targetCode}` : base;
    if (sourceCode && targetCode && sourceCode !== targetCode) {
      return `${base}.${sourceCode}-${targetCode}`;
    }
    return sourceCode ? `${base}.${sourceCode}` : (targetCode ? `${base}.${targetCode}` : base);
  }

  _subtitleLanguageCodesFromCues(cues, format = 'iso') {
    const list = Array.isArray(cues) ? cues : [];
    for (const c of list) {
      const sourceRaw = format === 'model' ? c?.sourceLangModel : c?.sourceLang;
      const targetRaw = format === 'model' ? c?.targetLangModel : c?.targetLang;
      const source = this._normalizeLangCodeToken(sourceRaw);
      const target = this._normalizeLangCodeToken(targetRaw);
      if (source || target) {
        return { sourceCode: source, targetCode: target || source };
      }
    }
    return { sourceCode: '', targetCode: '' };
  }

  _normalizeLangCodeToken(code) {
    const raw = String(code || '').trim().toLowerCase();
    const cleaned = raw.replace(/[^a-z0-9-]/g, '');
    if (!cleaned) return '';
    return cleaned.slice(0, 8);
  }

  _getSubtitleProjectSettings() {
    return {
      inputLanguage: localStorage.getItem(STORAGE_SUBTITLE_INPUT_LANG) || 'auto',
      outputLanguage: localStorage.getItem(STORAGE_SUBTITLE_OUTPUT_LANG) || 'source',
      dualMode: localStorage.getItem(STORAGE_SUBTITLE_DUAL_MODE) === '1',
      dualOrder: localStorage.getItem(STORAGE_SUBTITLE_DUAL_ORDER) || 'source-first',
      confidenceProfile: localStorage.getItem(STORAGE_SUBTITLE_CONFIDENCE_PROFILE) || 'balanced',
      suffixSource: localStorage.getItem(STORAGE_SUBTITLE_SUFFIX_SOURCE) || '.source',
      suffixTarget: localStorage.getItem(STORAGE_SUBTITLE_SUFFIX_TARGET) || '.target',
      suffixDual: localStorage.getItem(STORAGE_SUBTITLE_SUFFIX_DUAL) || '.dual',
      suffixLangCode: localStorage.getItem(STORAGE_SUBTITLE_SUFFIX_LANGCODE) === '1',
      suffixLangFormat: localStorage.getItem(STORAGE_SUBTITLE_SUFFIX_LANGFORMAT) || 'iso',
      saveMode: localStorage.getItem(STORAGE_SUBTITLE_SAVE_MODE) || 'target',
    };
  }

  _applySubtitleProjectSettings(settings) {
    if (!settings || typeof settings !== 'object') return;
    if (settings.inputLanguage != null) localStorage.setItem(STORAGE_SUBTITLE_INPUT_LANG, String(settings.inputLanguage));
    if (settings.outputLanguage != null) localStorage.setItem(STORAGE_SUBTITLE_OUTPUT_LANG, String(settings.outputLanguage));
    if (settings.dualMode != null) localStorage.setItem(STORAGE_SUBTITLE_DUAL_MODE, settings.dualMode ? '1' : '0');
    if (settings.dualOrder != null) localStorage.setItem(STORAGE_SUBTITLE_DUAL_ORDER, String(settings.dualOrder));
    if (settings.confidenceProfile != null) localStorage.setItem(STORAGE_SUBTITLE_CONFIDENCE_PROFILE, String(settings.confidenceProfile));
    if (settings.suffixSource != null) localStorage.setItem(STORAGE_SUBTITLE_SUFFIX_SOURCE, this._normalizeSubtitleSuffix(settings.suffixSource, '.source'));
    if (settings.suffixTarget != null) localStorage.setItem(STORAGE_SUBTITLE_SUFFIX_TARGET, this._normalizeSubtitleSuffix(settings.suffixTarget, '.target'));
    if (settings.suffixDual != null) localStorage.setItem(STORAGE_SUBTITLE_SUFFIX_DUAL, this._normalizeSubtitleSuffix(settings.suffixDual, '.dual'));
    if (settings.suffixLangCode != null) localStorage.setItem(STORAGE_SUBTITLE_SUFFIX_LANGCODE, settings.suffixLangCode ? '1' : '0');
    if (settings.suffixLangFormat != null) localStorage.setItem(STORAGE_SUBTITLE_SUFFIX_LANGFORMAT, String(settings.suffixLangFormat) === 'model' ? 'model' : 'iso');
    if (settings.saveMode != null) localStorage.setItem(STORAGE_SUBTITLE_SAVE_MODE, String(settings.saveMode));
  }

  _normalizeSubtitleSuffix(raw, fallback) {
    const f = String(fallback || '.target');
    let s = String(raw || '').trim();
    if (!s) return f;
    s = s.replace(/[^a-zA-Z0-9_.-]/g, '');
    if (!s) return f;
    if (!s.startsWith('.')) s = `.${s}`;
    s = s.replace(/\.+/g, '.');
    return s.length > 32 ? s.slice(0, 32) : s;
  }

  _updateSubtitleDetectionInfo(languageCode, confidence) {
    const el = document.getElementById('subtitle-detect-info');
    if (!el) return;
    if (!languageCode) {
      el.hidden = true;
      el.textContent = '';
      delete el.dataset.kind;
      return;
    }
    const language = this._subtitleLanguageLabel(languageCode);
    const conf = this.i18n.t(`subtitle.confidence${this._toConfidenceSuffix(confidence)}`);
    const normalized = String(confidence || '').toLowerCase();
    el.dataset.kind = normalized === 'high' || normalized === 'medium' ? normalized : 'low';
    el.hidden = false;
    el.textContent = this.i18n.t('subtitle.detectedLabel', { language, confidence: conf });
  }

  async _translateSubtitlesWithOllama(cues, {
    sourceLanguage = 'auto',
    targetLanguage,
    cancelled = () => false,
    onProgress = null,
  } = {}) {
    const target = String(targetLanguage || '').trim().toLowerCase();
    if (!target || target === 'source') return cues;

    const api = window.electronAPI;
    if (!api?.ollamaChat) {
      throw new Error(this.i18n.t('subtitle.translateUnavailable'));
    }

    const cfg = loadOllamaSettings();
    if (!cfg?.model) {
      throw new Error(this.i18n.t('subtitle.translateModelRequired'));
    }

    const sourceName = this._subtitleLanguageLabel(sourceLanguage || 'auto');
    const targetName = this._subtitleLanguageLabel(target);
    const chunkSize = 14;
    const out = [];

    for (let i = 0; i < cues.length; i += chunkSize) {
      if (cancelled()) return cues;
      const group = cues.slice(i, i + chunkSize);
      const payload = group.map((c, idx) => ({
        id: idx,
        text: String(c?.text || ''),
      }));

      const prompt = [
        `Translate subtitle lines from ${sourceName} to ${targetName}.`,
        'Rules:',
        `1) Keep exactly the same number of lines (${payload.length}).`,
        '2) Return ONLY a JSON array string list in order.',
        '3) Do not include explanations, markdown, or code blocks.',
        '',
        JSON.stringify(payload),
      ].join('\n');

      const chat = await api.ollamaChat({
        baseUrl: cfg.baseUrl,
        model: cfg.model,
        system: 'You are a subtitle translator. Output strict JSON only.',
        prompt,
        timeoutMs: 180000,
      });

      if (!chat?.ok) {
        throw new Error(chat?.error || this.i18n.t('subtitle.translateFailed'));
      }

      const translated = this._parseTranslationJsonArray(chat.content);
      if (!Array.isArray(translated) || translated.length !== payload.length) {
        throw new Error(this.i18n.t('subtitle.invalidTranslationResponse'));
      }

      for (let j = 0; j < group.length; j += 1) {
        out.push({
          ...group[j],
          text: String(translated[j] || group[j].text || '').trim() || group[j].text,
        });
      }

      const pct = 88 + Math.round(((i + group.length) / Math.max(1, cues.length)) * 11);
      onProgress?.(Math.min(99, pct));
    }

    return out;
  }

  _parseTranslationJsonArray(content) {
    const raw = String(content || '').trim();
    if (!raw) return null;

    const direct = tryParseJsonArray(raw);
    if (direct) return direct;

    const fenced = raw.match(/\[[\s\S]*\]/);
    if (fenced) {
      const parsed = tryParseJsonArray(fenced[0]);
      if (parsed) return parsed;
    }
    return null;
  }

  _showSubtitleOverlay() {
    let overlay = document.getElementById('subtitle-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'subtitle-overlay';
      document.body.appendChild(overlay);
    }
    overlay.innerHTML = `
      <div class="export-card analyze-card">
        <h3>${this.i18n.t('subtitle.title')}</h3>
        <div class="export-progress-bar-track">
          <div class="export-progress-bar-fill" id="subtitle-progress-fill" style="width:0%"></div>
        </div>
        <div class="analyze-progress-meta">
          <span id="subtitle-progress-label">${this.i18n.t('subtitle.extractingAudio')}</span>
          <span id="subtitle-progress-pct">0%</span>
        </div>
        <div class="subtitle-detect-info" id="subtitle-detect-info" hidden></div>
        <button class="export-cancel-btn" id="subtitle-cancel-btn">${Icons.close}<span>${this.i18n.t('dialog.cancel')}</span></button>
      </div>
    `;
    document.getElementById('subtitle-cancel-btn')?.addEventListener('click', () => {
      this._subtitleCancelled = true;
    });
    overlay.classList.add('visible');
    this._updateSubtitleProgress(0, this.i18n.t('subtitle.extractingAudio'));
  }

  _updateSubtitleProgress(percent, label) {
    const pct = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
    const fill = document.getElementById('subtitle-progress-fill');
    const labelEl = document.getElementById('subtitle-progress-label');
    const pctEl = document.getElementById('subtitle-progress-pct');
    if (fill) fill.style.width = `${pct}%`;
    if (labelEl && label) labelEl.textContent = label;
    if (pctEl) pctEl.textContent = `${pct}%`;
  }

  _hideSubtitleOverlay() {
    document.getElementById('subtitle-overlay')?.classList.remove('visible');
  }

  async _viewAnalysisResults({ filePath = null, pickIfMissing = true } = {}) {
    let path = filePath || this._lastAnalysisPath || null;

    if (!path && pickIfMissing) {
      path = await window.electronAPI?.openAnalysisDialog?.();
      if (!path) return;
    }

    if (!path) {
      await showAlert(this.i18n.t('ollama.viewerNoFile'));
      return;
    }

    try {
      await showAnalysisViewer({
        i18n: this.i18n,
        filePath: path,
        onSeek: (start) => {
          if (!this.preview?.mediaEl) return;
          const offset = Number(this.preview.currentClip?.startTime) || 0;
          this._seekTimeline(offset + Math.max(0, Number(start) || 0));
        },
        onOpenOther: () => this._viewAnalysisResults({ filePath: null, pickIfMissing: true }),
      });
      this._lastAnalysisPath = path;
    } catch (err) {
      await showAlert(err?.message || this.i18n.t('ollama.viewerLoadFailed'));
    }
  }

  /**
   * Load a file-panel entry into preview (if needed), then run scene analysis.
   */
  async _analyzeScenesFromEntry(entry) {
    if (!entry || entry.isDirectory || entry.isDrive) return;
    if (this.sceneAnalyzer?.running) return;

    const same = this.preview?.currentFile?.path && entry.path
      && this.preview.currentFile.path === entry.path
      && this.preview.mediaEl;

    if (!same) {
      await this._onFileSelect(entry);
      await this._waitPreviewMetadata(8000);
    } else {
      await this._waitPreviewMetadata(2000);
    }

    if (!this.preview.mediaEl) {
      await showAlert(this.i18n.t('ollama.noMedia'));
      return;
    }

    const dur = Number(this.preview.mediaEl.duration);
    if (!Number.isFinite(dur) || dur <= 0) {
      await showAlert(this.i18n.t('ollama.noDuration'));
      return;
    }

    await this._analyzeScenes();
  }

  async _analyzeScenes() {
    if (this.sceneAnalyzer?.running) return;

    const settings = loadOllamaSettings();
    if (!settings.model) {
      await showAlert(this.i18n.t('ollama.modelRequired'));
      const saved = await showOllamaSettingsDialog(this.i18n);
      if (!saved?.model) return;
    } else if (!isLikelyVlmModel(settings.model)) {
      const go = await showConfirm(this.i18n.t('ollama.vlmRecommended'));
      if (!go) {
        await showOllamaSettingsDialog(this.i18n);
        return;
      }
    }

    if (!this.preview.mediaEl) {
      await showAlert(this.i18n.t('ollama.noMedia'));
      return;
    }

    const srcName = this.preview.currentFile?.name || 'media';
    const stem = String(srcName).replace(/\.[^.]+$/, '') || 'scene-analysis';
    const defaultName = `${stem}-scenes.jsonl`;
    const outPath = await window.electronAPI?.saveAnalysisDialog?.(defaultName);
    if (!outPath) return;

    this._setStatus('analyzing');
    this._showAnalyzeOverlay();

    try {
      const result = await this.sceneAnalyzer.run({
        outPath,
        settings: loadOllamaSettings(),
        sourceMeta: {
          name: this.preview.currentFile?.name || null,
          path: this.preview.currentFile?.path || null,
        },
        onProgress: ({ percent, label }) => this._updateAnalyzeProgress(percent, label),
      });

      this._hideAnalyzeOverlay();
      this._setStatus('ready');
      this._lastAnalysisPath = outPath;

      if (result?.cancelled || result?.ok) {
        await this._viewAnalysisResults({ filePath: outPath, pickIfMissing: false });
      }
    } catch (err) {
      this._hideAnalyzeOverlay();
      this._setStatus('error');
      await showAlert(this.i18n.t('ollama.failed', {
        error: err?.message || String(err),
      }));
      this._setStatus('ready');
    }
  }

  _setupAnalyzeOverlay() {
    let overlay = document.getElementById('analyze-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'analyze-overlay';
      document.body.appendChild(overlay);
    }
    overlay.innerHTML = `
      <div class="export-card analyze-card">
        <h3 id="analyze-title">${this.i18n.t('ollama.analyzingTitle')}</h3>
        <div class="export-progress-bar-track">
          <div class="export-progress-bar-fill" id="analyze-progress-fill" style="width:0%"></div>
        </div>
        <div class="analyze-progress-meta">
          <span id="analyze-progress-label">${this.i18n.t('status.analyzing')}</span>
          <span id="analyze-progress-pct">0%</span>
        </div>
        <button class="export-cancel-btn" id="analyze-cancel-btn">${Icons.close}<span>${this.i18n.t('dialog.cancel')}</span></button>
      </div>
    `;
    document.getElementById('analyze-cancel-btn')?.addEventListener('click', () => {
      this.sceneAnalyzer?.cancel();
    });
  }

  _showAnalyzeOverlay() {
    const el = document.getElementById('analyze-overlay');
    if (el) el.classList.add('visible');
    this._updateAnalyzeProgress(0, this.i18n.t('status.analyzing'));
  }

  _updateAnalyzeProgress(percent, label) {
    const pct = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
    const fill = document.getElementById('analyze-progress-fill');
    const labelEl = document.getElementById('analyze-progress-label');
    const pctEl = document.getElementById('analyze-progress-pct');
    if (fill) fill.style.width = `${pct}%`;
    if (labelEl && label) labelEl.textContent = label;
    if (pctEl) pctEl.textContent = `${pct}%`;
  }

  _hideAnalyzeOverlay() {
    const el = document.getElementById('analyze-overlay');
    if (el) el.classList.remove('visible');
  }
}

function tryParseJsonArray(text) {
  try {
    const parsed = JSON.parse(String(text || ''));
    if (!Array.isArray(parsed)) return null;
    return parsed.map((item) => String(item ?? ''));
  } catch {
    return null;
  }
}

// Boot
const app = new AVEditorApp();
app.init().catch(console.error);
