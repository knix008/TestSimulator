import { I18n } from './i18n.js';
import { Icons } from './icons.js';
import { FileTree } from './fileTree.js';
import { FileInfo } from './fileInfo.js';
import { Preview } from './preview.js';
import { Timeline } from './timeline.js';
import { ContextMenu } from './contextMenu.js';

const STORAGE_THEME = 'av-editor-theme';
const STORAGE_LOCALE = 'av-editor-locale';

class AVEditorApp {
  constructor() {
    this.i18n = new I18n();
    this.theme = localStorage.getItem(STORAGE_THEME) || 'dark';
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

    // Build UI
    this._buildToolbar();
    this._buildComponents();
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
      </div>
      <div class="toolbar-separator"></div>
      <!-- Media -->
      <div class="toolbar-group">
        <button class="toolbar-btn" id="btn-import" data-i18n-tooltip="toolbar.import">${Icons.import}</button>
        <button class="toolbar-btn" id="btn-export" data-i18n-tooltip="toolbar.export">${Icons.export}</button>
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
        <button class="toolbar-btn" id="btn-zoom-out" data-i18n-tooltip="toolbar.zoomOut">${Icons.zoomOut}</button>
        <button class="toolbar-btn" id="btn-zoom-in"  data-i18n-tooltip="toolbar.zoomIn">${Icons.zoomIn}</button>
      </div>
      <!-- Spacer -->
      <div class="toolbar-spacer"></div>
      <!-- Time display -->
      <span class="toolbar-time" id="toolbar-time">00:00:00</span>
      <div class="toolbar-separator"></div>
      <!-- Theme & Language -->
      <div class="toolbar-group">
        <button class="toolbar-btn" id="btn-theme" data-i18n-tooltip="toolbar.toggleTheme">${this.theme === 'dark' ? Icons.sun : Icons.moon}</button>
        <button class="toolbar-lang-btn" id="btn-lang">${this.i18n.getLocale().toUpperCase()}</button>
      </div>
    `;

    this._applyTooltips();
    this._bindToolbarEvents();
  }

  _applyTooltips() {
    document.querySelectorAll('[data-i18n-tooltip]').forEach(el => {
      el.setAttribute('data-tooltip', this.i18n.t(el.getAttribute('data-i18n-tooltip')));
    });
  }

  _bindToolbarEvents() {
    const $  = (id) => document.getElementById(id);

    $('btn-new').addEventListener('click', () => this._newProject());
    $('btn-open').addEventListener('click', () => this._openProject());
    $('btn-save').addEventListener('click', () => this._saveProject());
    $('btn-import').addEventListener('click', () => this._importMedia());
    $('btn-export').addEventListener('click', () => this._export());
    $('btn-undo').addEventListener('click', () => this._undo());
    $('btn-redo').addEventListener('click', () => this._redo());
    $('btn-split').addEventListener('click', () => this.timeline.splitSelectedClip());
    $('btn-delete').addEventListener('click', () => this.timeline.deleteSelectedClip());

    $('btn-skip-back').addEventListener('click', () => {
      this.preview.currentTime = 0;
      this.timeline.setCurrentTime(0);
      this._updateTimeDisplay(0);
    });
    $('btn-rewind').addEventListener('click', () => {
      const t = Math.max(0, this.preview.currentTime - 5);
      this.preview.currentTime = t;
      this.timeline.setCurrentTime(t);
    });
    $('btn-play-pause').addEventListener('click', () => this._togglePlay());
    $('btn-stop').addEventListener('click', () => {
      this.preview.currentTime = 0;
      this.preview.togglePlay();  // ensure paused
      if (this.preview.isPlaying) this.preview.togglePlay();
      this.timeline.setCurrentTime(0);
      this._updateTimeDisplay(0);
      this._updatePlayBtn(false);
    });
    $('btn-ff').addEventListener('click', () => {
      const t = this.preview.currentTime + 5;
      this.preview.currentTime = t;
      this.timeline.setCurrentTime(t);
    });
    $('btn-skip-fwd').addEventListener('click', () => {
      const t = this.preview.duration;
      this.preview.currentTime = t;
      this.timeline.setCurrentTime(t);
    });

    $('btn-zoom-in').addEventListener('click', () => this.timeline.zoomIn());
    $('btn-zoom-out').addEventListener('click', () => this.timeline.zoomOut());

    $('btn-theme').addEventListener('click', () => this._toggleTheme());

    $('btn-lang').addEventListener('click', () => {
      const next = this.i18n.getLocale() === 'en' ? 'ko' : 'en';
      this._setLanguage(next);
    });
  }

  // ── Component initialization ──────────────────────────────────────────────

  _buildComponents() {
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
        onTimeUpdate: (cur) => {
          this.timeline.setCurrentTime(cur);
          this._updateTimeDisplay(cur);
        },
        onEnded: () => this._updatePlayBtn(false),
        onDurationChange: () => {},
        onContextMenu: (x, y, file) => this._showPreviewContextMenu(x, y, file),
      }
    );

    this.timeline = new Timeline(
      document.getElementById('timeline-section'),
      {
        i18n: this.i18n,
        onTimeChange: (t) => {
          this.preview.currentTime = t;
          this._updateTimeDisplay(t);
        },
        onClipSelect: () => {},
        onContextMenu: (x, y, clip) => this._showTimelineContextMenu(x, y, clip),
      }
    );

    this._setupExportOverlay();
  }

  // ── Sidebar width resize ───────────────────────────────────────────────────

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
      const confirmed = confirm(this.i18n.t('dialog.newProjectConfirm'));
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
    if (!result.ok) { alert('Failed to load project: ' + result.error); return; }
    this.timeline.loadState(result.data);
    this.projectPath = filePath;
    this.isDirty = false;
    this._setTitle(filePath.split(/[\\/]/).pop());
    this._setStatus('ready');
  }

  async _saveProject(forceDialog = false) {
    if (!window.electronAPI) return;
    let filePath = this.projectPath;
    if (!filePath || forceDialog) {
      filePath = await window.electronAPI.saveProjectDialog();
      if (!filePath) return;
    }
    const state = this.timeline.getState();
    const result = await window.electronAPI.saveProjectFile(filePath, state);
    if (!result.ok) { alert('Failed to save: ' + result.error); return; }
    this.projectPath = filePath;
    this.isDirty = false;
    this._setTitle(filePath.split(/[\\/]/).pop());
    this._setStatus('saved');
  }

  async _importMedia() {
    if (!window.electronAPI) return;
    const files = await window.electronAPI.openFileDialog();
    files.forEach(fp => {
      const ext = '.' + fp.split('.').pop().toLowerCase();
      const entry = { name: fp.split(/[\\/]/).pop(), path: fp, extension: ext, size: 0 };
      this.timeline.addClip(entry, 'v1', 0);
    });
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

  _togglePlay() {
    this.preview.togglePlay();
    this._updatePlayBtn(this.preview.isPlaying);
    this._setStatus(this.preview.isPlaying ? 'playing' : 'paused');
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
    if (langBtn) langBtn.textContent = locale.toUpperCase();
    this._applyTooltips();
    this.fileTree.updateTranslations();
    this.fileInfo.updateTranslations();
    this.preview.updateTranslations();
    this.timeline.updateTranslations();
    this._syncMenuLocale(locale);
  }

  _syncMenuLocale(locale) {
    window.electronAPI?.setMenuLocale?.(locale);
  }

  // ── File events ────────────────────────────────────────────────────────────

  async _onFileSelect(entry) {
    this.fileInfo.show(entry);
    this.preview.loadFile(entry);
    this._setStatus('ready');

    // Enrich with media metadata when available
    try {
      const meta = await window.electronAPI.getMediaInfo?.(entry.path);
      if (meta) this.fileInfo.showMediaMetadata(meta);
    } catch { /* ignore */ }
  }

  _onFileDblClick(entry) {
    this.preview.loadFile(entry);
    this.timeline.addClip(entry, 'v1');
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

    if (!entry) {
      ContextMenu.show(x, y, [
        { icon: Icons.refresh, label: t('context.refresh'), action: () => this.fileTree.refresh() },
        { separator: true },
        { icon: Icons.open, label: t('context.openFolder'), action: async () => {
          const dir = await window.electronAPI.openFolderDialog?.();
          if (dir) this.fileTree.revealPath(dir);
        }},
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
      {
        icon: Icons.explorer,
        label: t('context.showInExplorer'),
        action: () => this._showInExplorer(entry.path),
      },
      { separator: true },
      { icon: Icons.refresh, label: t('context.refresh'), action: () => this.fileTree.refresh() },
    ]);
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
          this.preview.currentTime = 0;
          if (this.preview.isPlaying) this.preview.togglePlay();
          this.timeline.setCurrentTime(0);
          this._updateTimeDisplay(0);
          this._updatePlayBtn(false);
        },
      },
      {
        icon: this.preview.isMuted ? Icons.mute : Icons.volume,
        label: this.preview.isMuted ? t('preview.unmute') : t('preview.mute'),
        disabled: !hasMedia,
        action: () => {
          document.getElementById('prev-mute')?.click();
        },
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
      file && {
        icon: Icons.explorer,
        label: t('context.showInExplorer'),
        action: () => this._showInExplorer(file.path),
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
        case 'save-project-as':    this._saveProject(true); break;
        case 'import-media':       this._importMedia(); break;
        case 'export':             this._export(); break;
        case 'undo':               this._undo(); break;
        case 'redo':               this._redo(); break;
        case 'split-clip':         this.timeline.splitSelectedClip(); break;
        case 'delete-clip':        this.timeline.deleteSelectedClip(); break;
        case 'toggle-theme':       this._toggleTheme(); break;
        case 'set-language-en':    this._setLanguage('en'); break;
        case 'set-language-ko':    this._setLanguage('ko'); break;
        case 'zoom-in':            this.timeline.zoomIn(); break;
        case 'zoom-out':           this.timeline.zoomOut(); break;
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
      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case 'n': e.preventDefault(); this._newProject(); break;
          case 'o': e.preventDefault(); this._openProject(); break;
          case 's': e.preventDefault(); e.shiftKey ? this._saveProject(true) : this._saveProject(); break;
          case 'i': e.preventDefault(); this._importMedia(); break;
          case 'e': e.preventDefault(); this._export(); break;
          case 'b': e.preventDefault(); this.timeline.splitSelectedClip(); break;
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
        <button class="export-cancel-btn" id="export-cancel-btn">${this.i18n.t('dialog.cancel')}</button>
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
}

// Boot
const app = new AVEditorApp();
app.init().catch(console.error);
