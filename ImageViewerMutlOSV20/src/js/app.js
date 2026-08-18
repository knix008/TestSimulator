/* Main application orchestrator */
(async () => {
  /* ─── State ─── */
  const state = {
    lang:         localStorage.getItem('lang')  || 'en',
    theme:        localStorage.getItem('theme') || 'dark',
    currentFile:  null,
    fileList:     [],   // all image/video files in current dir
    fileIndex:    -1,
    zoom:         1,
    panX:         0,
    panY:         0,
    isPanning:    false,
    panStartX:    0,
    panStartY:    0,
    panOriginX:   0,
    panOriginY:   0,
    currentTool:  'pointer',
    effectsPanelVisible: false,
    editMode:     false,  // true while image edit window is open
    isVideo:      false,
    isAudio:      false,
    isAnimated:   false,
    animatedDataUrl: null,
    animPlaying:  false,
    isDirty:      false,
    imageMeta:    null,
    dicomMeta:    null,
    metaForFile:  null,
  };

  function _isEditableImage() {
    return (Editor.isLoaded() || state.isAnimated) && !state.isVideo && !state.isAudio;
  }

  function _hasViewerVisual() {
    return Editor.isLoaded() || state.isAnimated || state.isVideo;
  }

  function _getViewerDims() {
    if (state.isAnimated) {
      if (animFreeze && animFreeze.style.display !== 'none' && animFreeze.width && animFreeze.height) {
        return { w: animFreeze.width, h: animFreeze.height };
      }
      if (animImg && (animImg.style.display !== 'none' || state.animatedDataUrl)) {
        const w = animImg.naturalWidth || 0;
        const h = animImg.naturalHeight || 0;
        if (w && h) return { w, h };
      }
    }
    if (Editor.isLoaded()) return Editor.getDimensions();
    if (state.isVideo) return { w: videoEl.videoWidth || 0, h: videoEl.videoHeight || 0 };
    return { w: 0, h: 0 };
  }

  /* ─── Init ─── */
  await I18n.loadLanguage(state.lang);
  _applyTheme(state.theme);
  I18n.applyToDOM();
  Tooltip.init();
  ContextMenu.init();
  _initErrorDialog();

  /* ─── DOM refs ─── */
  const app              = document.getElementById('app');
  const toolbar          = document.getElementById('toolbar');
  const sidebar          = document.getElementById('sidebar');
  const fileTreeScroll   = document.getElementById('file-tree-scroll');
  const infoContent      = document.getElementById('info-content');
  const viewerContainer  = document.getElementById('viewer-container');
  const imageWrapper     = document.getElementById('image-wrapper');
  const displayCanvas    = document.getElementById('display-canvas');
  const selCanvas        = document.getElementById('sel-canvas');
  const animImg          = document.getElementById('animated-image');
  const animFreeze       = document.getElementById('animated-freeze');
  const videoEl          = document.getElementById('video-player');
  const mediaControls    = document.getElementById('media-controls');
  const mcPlayBtn        = document.getElementById('mc-play');
  const mcPauseBtn       = document.getElementById('mc-pause');
  const mcStopBtn        = document.getElementById('mc-stop');
  const mcSeek           = document.getElementById('mc-seek');
  const mcTime           = document.getElementById('mc-time');
  const mediaCue         = document.getElementById('media-cue');
  const mediaCueBadge    = document.getElementById('media-cue-badge');
  const audioWrap        = document.getElementById('audio-player-wrap');
  const audioEl          = document.getElementById('audio-player');
  const audioLabel       = document.getElementById('audio-filename');
  const imagePlaceholder = document.getElementById('image-placeholder');
  const loadingOverlay   = document.getElementById('loading-overlay');
  const effectsPanel     = document.getElementById('effects-panel');
  const statusZoom       = document.getElementById('status-zoom');

  let _openingFile = null;       // path currently being opened (re-entrancy guard)
  let _ignoreWatchUntil = 0;     // ignore fs.watch noise right after open/watch
  let _watchedDir  = null;
  let _watchedFile = null;
  let _mediaCueTimer = null;
  let _mediaCueFollowup = null;
  const RECENT_DIRS_KEY = 'recentOpenedDirs';
  const RECENT_DIRS_MAX = 10;
  const statusDims       = document.getElementById('status-dims');
  const statusIdx        = document.getElementById('status-idx');
  const statusFmt        = document.getElementById('status-format');
  const statusMsg        = document.getElementById('status-msg');
  const zoomDisplay      = document.getElementById('zoom-display');
  const contextMenuEl    = document.getElementById('context-menu');
  const aboutOverlay     = document.getElementById('about-overlay');
  const shortcutsOverlay = document.getElementById('shortcuts-overlay');

  /* ─── Editor init ─── */
  Editor.init(displayCanvas, selCanvas);
  Editor.setCallbacks(
    () => _markDirty(),
    (hasSel) => _onSelectionChange(hasSel),
    () => _onHistoryChange()
  );

  /* ─── File Tree init ─── */
  FileTree.init(fileTreeScroll, {
    onSelect: (p) => _openFile(p),
    onDirOpen: (p, info = {}) => {
      _rememberRecentDir(p);
      _watchDir(p);
      if (info.activate !== false) {
        _openFirstInDir(p);
      }
    },
    onContextMenu: (entry, x, y) => _showTreeContextMenu(entry, x, y),
    onImport: (info) => {
      if (!info) return;
      if (info.error === 'noDest') {
        _updateStatus({ msg: I18n.t('status.dropNoDest') });
        return;
      }
      if (info.error) {
        _updateStatus({
          msg: (I18n.t('status.dropError') || 'Error: {msg}').replace('{msg}', info.error),
        });
        return;
      }
      const key = info.mode === 'move' ? 'status.moved' : 'status.copied';
      let msg = (I18n.t(key) || '{n}').replace('{n}', String(info.count ?? 0));
      if (info.errors?.length) {
        msg += ` (${info.errors.length} failed)`;
      }
      _updateStatus({ msg });
    },
  });

  let _refreshTimer = null;
  function _scheduleTreeRefresh() {
    clearTimeout(_refreshTimer);
    _refreshTimer = setTimeout(async () => {
      try {
        await FileTree.refresh();
        // Keep prev/next list in sync with disk after external changes / DnD
        if (state.currentFile) {
          const dir = await window.electronAPI.pathDirname(state.currentFile);
          state.fileList = await FileTree.getImageFilesInDir(dir);
          state.fileIndex = FileTree.indexOfPath
            ? FileTree.indexOfPath(state.fileList, state.currentFile)
            : state.fileList.indexOf(state.currentFile);
          _updateNavButtons();
        }
      } catch (e) {
        console.warn('tree refresh failed:', e);
      }
    }, 150);
  }

  /* ─── Tooltip: toolbar buttons ─── */
  _buildToolbar();
  _initWindowChrome();
  document.addEventListener('click', (e) => {
    const btn = e.target.closest?.('button.is-disabled, button[aria-disabled="true"]');
    if (!btn) return;
    if (btn.classList.contains('toolbar-btn') || btn.classList.contains('ew-btn')) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, true);

  /* ─── Effects panel sliders ─── */
  let _ewEffectsBuilt = false;
  _buildEffectsPanel();

  /* ─── Sidebar / Info resize ─── */
  _initSidebarResize();
  _initVerticalResize();
  _initEditEffectsResize();
  _initEditAdjustResize();

  /* ─── Viewer pan / zoom ─── */
  _initViewerInteraction();

  /* ─── Keyboard shortcuts ─── */
  _initKeyboard();
  _initMediaCues();

  /* ─── Context menu ─── */
  // Capture phase so Chromium's native <video> menu is suppressed
  viewerContainer.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    _showContextMenu(e.clientX, e.clientY);
  }, true);
  fileTreeScroll.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    // future: file-tree context menu
  });

  /* ─── Drag-and-drop ─── */
  function _dropPath(file) {
    if (!file) return '';
    try {
      if (window.electronAPI.getPathForFile) {
        return window.electronAPI.getPathForFile(file) || file.path || '';
      }
    } catch (_) {}
    return file.path || '';
  }

  app.addEventListener('dragover', (e) => { e.preventDefault(); app.classList.add('drag-over'); });
  app.addEventListener('dragleave', () => app.classList.remove('drag-over'));
  app.addEventListener('drop', async (e) => {
    e.preventDefault();
    app.classList.remove('drag-over');
    const files = Array.from(e.dataTransfer.files);
    if (!files.length) return;

    const isWeb = window.electronAPI.platform === 'web';

    if (isWeb) {
      // Try directory via File System Access API items
      const items = [...(e.dataTransfer.items || [])];
      for (const item of items) {
        if (item.kind === 'file' && item.getAsFileSystemHandle) {
          try {
            const handle = await item.getAsFileSystemHandle();
            if (handle.kind === 'directory') {
              FileRegistry.clear();
              const root = await FileRegistry.mountDirectoryHandle(handle, '/');
              localStorage.setItem('webRootLabel', handle.name || 'Local Files');
              await _openFolder(root);
              return;
            }
          } catch {}
        }
      }
      // Regular files
      for (const f of files) {
        const ext = FormatSupport.getExtension(f.name);
        if (FormatSupport.IMAGE_EXTS.has(ext) || FormatSupport.VIDEO_EXTS.has(ext) || FormatSupport.AUDIO_EXTS.has(ext)) {
          const p = FileRegistry.registerFile(f, '/');
          await FileTree.loadDrives();
          await FileTree.revealPath('/');
          await _openFile(p, { center: true });
          await FileTree.refresh();
          FileTree.setSelected(p, { center: true });
          return;
        }
      }
      if (files[0]) {
        const p = FileRegistry.registerFile(files[0], '/');
        await FileTree.loadDrives();
        await FileTree.revealPath('/');
        await _openFile(p, { center: true });
        await FileTree.refresh();
        FileTree.setSelected(p, { center: true });
      }
      return;
    }

    // Check if a folder was dropped (Electron)
    for (const f of files) {
      const p = _dropPath(f);
      if (!p) continue;
      const stats = await window.electronAPI.getFileStats(p);
      if (stats && !stats.error && stats.isDirectory) {
        await _openFolder(p);
        await FileTree.refresh();
        return;
      }
    }

    // Open first supported file and reveal its folder in the explorer
    for (const f of files) {
      const p = _dropPath(f);
      if (!p) continue;
      const ext = FormatSupport.getExtension(f.name);
      if (FormatSupport.IMAGE_EXTS.has(ext) || FormatSupport.VIDEO_EXTS.has(ext) || FormatSupport.AUDIO_EXTS.has(ext)) {
        const dir = await window.electronAPI.pathDirname(p);
        await _openFile(p, { center: true });
        await FileTree.revealPath(dir);
        await FileTree.refresh();
        FileTree.setSelected(p, { center: true });
        return;
      }
    }
    // Fallback: try the first file anyway
    if (files[0]) {
      const p = _dropPath(files[0]);
      if (!p) return;
      const dir = await window.electronAPI.pathDirname(p);
      await _openFile(p, { center: true });
      await FileTree.revealPath(dir);
      await FileTree.refresh();
      FileTree.setSelected(p, { center: true });
    }
  });

  /* ─── Electron IPC listeners ─── */
  window.electronAPI.onOpenFile(async (p) => {
    try {
      const dir = await window.electronAPI.pathDirname(p);
      await _openFile(p, { center: true });
      await FileTree.revealPath(dir);
      await FileTree.refresh();
      FileTree.setSelected(p, { center: true });
    } catch (_) {
      await _openFile(p, { center: true });
      await FileTree.refresh();
      FileTree.setSelected(p, { center: true });
    }
  });
  window.electronAPI.onOpenFolder(async (p) => {
    await _openFolder(p);
    await FileTree.refresh();
  });
  window.addEventListener('app-open-folder', async (e) => {
    const p = e.detail;
    if (!p) return;
    await _openFolder(p);
    await FileTree.refresh();
  });
  window.electronAPI.onMenuAction(async (action) => _handleMenuAction(action));

  /* ─── File / directory watching ─── */
  async function _watchDir(dirPath) {
    if (_watchedDir === dirPath) return;
    if (_watchedDir) await window.electronAPI.unwatchDirectory(_watchedDir);
    _watchedDir = dirPath;
    await window.electronAPI.watchDirectory(dirPath);
  }

  async function _watchCurrentFile(filePath) {
    if (_watchedFile === filePath) return;
    if (_watchedFile) await window.electronAPI.unwatchFile(_watchedFile);
    _watchedFile = filePath;
    if (filePath) await window.electronAPI.watchFile(filePath);
  }

  window.electronAPI.onDirectoryChanged((dirPath) => {
    if (Date.now() < _ignoreWatchUntil) return;
    // Any watched folder change → refresh explorer (path compare used to be too strict)
    _scheduleTreeRefresh();
  });

  window.electronAPI.onFileChanged(async (filePath) => {
    if (Date.now() < _ignoreWatchUntil) return;
    if (_openingFile) return;
    if (state.currentFile === filePath && !state.isDirty) {
      await _openFile(filePath);
    }
    _scheduleTreeRefresh();
  });

  /* ─── Initial viewer state ─── */
  _showPlaceholder(true);
  _showLoading(false);
  _setTool('pointer');
  viewerContainer.classList.add('drag-mode');
  selCanvas.style.cursor = 'grab';

  /* ─── Restore last opened folder ─── */
  await FileTree.loadDrives();
  // Web mode: virtual FS is empty until user opens files/folder — skip path restore
  if (window.electronAPI.platform !== 'web') {
    const launchFile = window.electronAPI.getLaunchFile
      ? await window.electronAPI.getLaunchFile()
      : null;
    if (launchFile) {
      try {
        const dir = await window.electronAPI.pathDirname(launchFile);
        await FileTree.revealPath(dir);
        await FileTree.refresh();
        FileTree.setSelected(launchFile, { center: true });
      } catch (_) { /* folder may be gone */ }
      _openFile(launchFile, { center: true }).catch(() => {});
    } else {
      const lastDir = localStorage.getItem('lastOpenedDir');
      if (lastDir) {
        try {
          const stats = await window.electronAPI.getFileStats(lastDir);
          if (stats && !stats.error && stats.isDirectory) {
            await _openFolder(lastDir, { openFirst: false });
            const lastFile = localStorage.getItem('lastOpenedFile');
            let restoredFile = false;
            if (lastFile) {
              const fileStats = await window.electronAPI.getFileStats(lastFile);
              if (fileStats && !fileStats.error && !fileStats.isDirectory) {
                restoredFile = true;
                _openFile(lastFile, { center: true }).catch(() => {});
              }
            }
            if (!restoredFile) {
              _openFirstInDir(lastDir).catch(() => {});
            }
          }
        } catch (e) {
          // If last dir no longer exists, ignore
        }
      }
    }
  }

  /* ─── Update menu with i18n ─── */
  _syncMenu();

  /* ════════════════════════════════════════════
     Toolbar
  ════════════════════════════════════════════ */
  function _buildToolbar() {
    const buttons = [
      { id:'btn-open-file',   icon:'openFile',   tip:'toolbar.openFile',   action: () => _pickOpenFile() },
      { id:'btn-open-folder', icon:'openFolder', tip:'toolbar.openFolder', action: (e) => { e?.stopPropagation?.(); _showRecentFoldersMenu(e?.currentTarget); } },
      { id:'btn-save',        icon:'save',       tip:'toolbar.save',       action: _saveAs, disabled: true },
      { separator: true },
      { id:'btn-undo',        icon:'undo',       tip:'toolbar.undo',       action: () => { Editor.undo(); _updateUndoRedoBtns(); }, disabled: true },
      { id:'btn-redo',        icon:'redo',       tip:'toolbar.redo',       action: () => { Editor.redo(); _updateUndoRedoBtns(); }, disabled: true },
      { separator: true },
      { id:'btn-zoom-in',     icon:'zoomIn',     tip:'toolbar.zoomIn',     action: () => _zoom(1.25), disabled: true },
      { id:'btn-zoom-out',    icon:'zoomOut',    tip:'toolbar.zoomOut',    action: () => _zoom(0.8),  disabled: true },
      { id:'btn-fit',         icon:'fitWindow',  tip:'toolbar.fitWindow',  action: _fitToWindow,      disabled: true },
      { id:'btn-actual',      icon:'actualSize', tip:'toolbar.actualSize', action: _actualSize,       disabled: true },
      { separator: true },
      { id:'btn-rotate-l',    icon:'rotateLeft', tip:'toolbar.rotateLeft', action: () => _rotate(-90), disabled: true },
      { id:'btn-rotate-r',    icon:'rotateRight',tip:'toolbar.rotateRight',action: () => _rotate(90),  disabled: true },
      { id:'btn-flip-h',      icon:'flipH',      tip:'toolbar.flipH',      action: () => _flip('h'),   disabled: true },
      { id:'btn-flip-v',      icon:'flipV',      tip:'toolbar.flipV',      action: () => _flip('v'),   disabled: true },
      { separator: true },
      { id:'btn-prev',        icon:'prev',       tip:'toolbar.prev',       action: _prevImage, disabled: true },
      { id:'btn-next',        icon:'next',       tip:'toolbar.next',       action: _nextImage, disabled: true },
      { separator: true },
      { id:'btn-edit',        icon:'edit',       tip:'toolbar.edit',       action: _openEditWindow, disabled: true },
      { spacer: true },
      { id:'btn-info',        icon:'info',       tip:'menu.about',         action: () => _showDialog('about-overlay') },
      { separator: true },
      { id:'btn-theme',       icon: state.theme === 'dark' ? 'sun' : 'moon', tip:'toolbar.theme', action: _toggleTheme },
      { id:'btn-lang',        icon:null,         tip:'toolbar.lang',       action: _toggleLang, langBtn: true },
    ];

    // Keep chrome elements before clearing
    const brand = document.getElementById('app-brand');
    const zoomWrap = document.getElementById('zoom-input-wrap');
    const gutter = document.getElementById('win-ctrl-gutter');
    toolbar.innerHTML = '';
    if (brand) toolbar.appendChild(brand);
    for (const b of buttons) {
      if (b.separator) {
        const sep = document.createElement('div');
        sep.className = 'toolbar-sep';
        toolbar.appendChild(sep);
        continue;
      }
      if (b.spacer) {
        const sp = document.createElement('div');
        sp.className = 'toolbar-spacer';
        toolbar.appendChild(sp);
        continue;
      }

      const hit = document.createElement('div');
      hit.className = 'toolbar-hit';

      const btn = document.createElement('button');
      btn.className = 'toolbar-btn';
      btn.id = b.id;
      if (b.disabled) _setChromeBtn(btn, false);

      if (b.langBtn) {
        btn.classList.add('lang-btn');
        const span = document.createElement('span');
        span.className = 'lang-text';
        span.textContent = _langSwitchLabel();
        btn.appendChild(span);
      } else {
        btn.innerHTML = Icons[b.icon] || '';
      }

      if (b.toggleGroup === 'tool') {
        if (b.id === 'btn-tool-pointer') btn.classList.add('active');
      }

      btn.addEventListener('click', (e) => {
        if (btn.classList.contains('is-disabled') || btn.getAttribute('aria-disabled') === 'true') {
          e.preventDefault();
          return;
        }
        b.action(e);
      });
      Tooltip.attach(btn, () => I18n.t(b.tip));
      hit.appendChild(btn);
      toolbar.appendChild(hit);
    }

    // Re-insert zoom display
    if (zoomWrap) {
      toolbar.appendChild(zoomWrap);
    } else {
      const zw = document.createElement('div');
      zw.id = 'zoom-input-wrap';
      const zi = document.createElement('input');
      zi.id = 'zoom-display'; zi.type = 'text'; zi.value = '100%';
      zw.appendChild(zi);
      toolbar.appendChild(zw);
    }
    if (gutter) toolbar.appendChild(gutter);

    _updateZoomDisplay();
    _lockBarScroll(toolbar);
    _updateToolbarForMedia();
    _updateNavButtons();
    requestAnimationFrame(() => _syncWindowMinSize());
  }

  function _lockBarScroll(el) {
    if (!el || el.dataset.scrollLocked) return;
    el.dataset.scrollLocked = '1';
    el.addEventListener('scroll', () => { el.scrollLeft = 0; });
    el.addEventListener('wheel', (e) => {
      if (e.deltaX) e.preventDefault();
    }, { passive: false });
  }

  function _measureFlexContentWidth(el, growClass) {
    if (!el) return 0;
    const style = getComputedStyle(el);
    const gap = parseFloat(style.columnGap || style.gap) || 0;
    let w = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
    const kids = [...el.children].filter((child) => {
      const cs = getComputedStyle(child);
      return cs.display !== 'none';
    });
    kids.forEach((child, i) => {
      if (growClass && child.classList.contains(growClass)) {
        w += parseFloat(getComputedStyle(child).minWidth) || 8;
      } else if (child.id === 'edit-window-title') {
        w += parseFloat(getComputedStyle(child).maxWidth) || 168;
      } else if (child.classList.contains('ew-toolbar') || child.classList.contains('ew-group')) {
        // Do not use the clipped box — sum the real button widths
        w += _measureFlexContentWidth(child);
      } else {
        const cs = getComputedStyle(child);
        const minW = parseFloat(cs.minWidth) || 0;
        const cssW = parseFloat(cs.width) || 0;
        w += Math.max(child.scrollWidth, child.getBoundingClientRect().width, minW, cssW);
      }
      if (i < kids.length - 1) w += gap;
    });
    return Math.ceil(w);
  }

  function _measureEditTitlebarWidth() {
    const win = document.getElementById('edit-window');
    const bar = document.getElementById('edit-window-titlebar');
    if (!win || !bar) return 0;

    const temp = !win.classList.contains('visible');
    if (temp) win.classList.add('measuring');
    const width = _measureFlexContentWidth(bar);
    if (temp) win.classList.remove('measuring');
    return width;
  }

  let _appliedMinWidth = 0;
  let _ewFitW = 0, _ewFitH = 0;
  let _savedMainBounds = null;

  function _mainMinWidth() {
    return Math.max(_measureFlexContentWidth(toolbar, 'toolbar-spacer'), 1100) + 12;
  }

  function _editMinWidth() {
    return Math.max(_measureEditTitlebarWidth(), 1100) + 12;
  }

  function _syncWindowMinSize(opts = {}) {
    const force = !!opts.force;
    const width = state.editMode ? _editMinWidth() : _mainMinWidth();
    if (!force && _appliedMinWidth && Math.abs(width - _appliedMinWidth) < 8) return;
    _appliedMinWidth = width;
    if (window.electronAPI.windowSetMinSize) {
      window.electronAPI.windowSetMinSize(width, 600);
    }
  }

  function _initWindowChrome() {
    const isWeb = window.electronAPI.platform === 'web';
    document.body.classList.toggle('frameless', !isWeb);
    document.body.classList.toggle('is-web', isWeb);
    if (isWeb) return;

    const minBtn = document.getElementById('win-min');
    const maxBtn = document.getElementById('win-max');
    const closeBtn = document.getElementById('win-close');
    minBtn?.addEventListener('click', () => window.electronAPI.windowMinimize());
    maxBtn?.addEventListener('click', () => {
      window.electronAPI.windowMaximize();
    });
    closeBtn?.addEventListener('click', () => {
      if (state.editMode) _requestCloseEditWindow(false);
      else window.electronAPI.windowClose();
    });
    window.electronAPI.onMaximizeChange?.((maximized) => _setMaximizedUi(!!maximized));
    window.electronAPI.windowIsMaximized?.().then((m) => _setMaximizedUi(!!m));
    requestAnimationFrame(() => _syncWindowMinSize());
  }

  function _setMaximizedUi(maximized) {
    document.body.classList.toggle('maximized', maximized);
    const maxBtn = document.getElementById('win-max');
    if (!maxBtn) return;
    maxBtn.title = maximized ? 'Restore' : 'Maximize';
    maxBtn.setAttribute('aria-label', maximized ? 'Restore' : 'Maximize');
  }

  /**
   * Do not use HTML disabled= inside a -webkit-app-region: drag bar.
   * Chromium ignores no-drag on disabled controls, so clicks become window-drag
   * and can block dialogs/overlays as well.
   */
  function _setChromeBtn(el, on) {
    if (!el) return;
    if (el.disabled) el.disabled = false;
    el.classList.toggle('is-disabled', !on);
    el.setAttribute('aria-disabled', on ? 'false' : 'true');
  }

  function _setToolbarEnabled(enabled) {
    // Legacy helper — prefer _updateToolbarForMedia()
    if (!enabled) {
      _updateToolbarForMedia('none');
      return;
    }
    _updateToolbarForMedia(_isEditableImage() ? 'image' : (state.isVideo ? 'video' : (state.isAudio ? 'audio' : 'none')));
  }

  /** Enable/disable chrome based on media type. Edit tools = images only. */
  function _updateToolbarForMedia(kind) {
    const k = kind || (
      _isEditableImage() ? 'image'
        : state.isVideo ? 'video'
          : state.isAudio ? 'audio'
            : 'none'
    );

    const set = (id, on) => _setChromeBtn(document.getElementById(id), on);

    const hasMedia = k !== 'none';
    const isImage = k === 'image';
    const canPrev = hasMedia && state.fileIndex > 0;
    const canNext = hasMedia && state.fileIndex >= 0 && state.fileIndex < state.fileList.length - 1;

    // Navigation / view (available for images; limited for A/V)
    set('btn-zoom-in', isImage || k === 'video' || state.isAnimated);
    set('btn-zoom-out', isImage || k === 'video' || state.isAnimated);
    set('btn-fit', isImage || k === 'video' || state.isAnimated);
    set('btn-actual', isImage || state.isAnimated);
    set('btn-prev', canPrev);
    set('btn-next', canNext);

    // Image editing only
    set('btn-save', isImage);
    set('btn-rotate-l', isImage);
    set('btn-rotate-r', isImage);
    set('btn-flip-h', isImage);
    set('btn-flip-v', isImage);
    set('btn-edit', isImage);
    if (!isImage) {
      set('btn-undo', false);
      set('btn-redo', false);
    } else {
      _updateUndoRedoBtns();
    }

    // Close edit mode if media is not an editable image
    if (!isImage && state.editMode) {
      _closeEditWindow(false);
    }

    document.body.classList.toggle('media-image', isImage);
    document.body.classList.toggle('media-av', k === 'video' || k === 'audio' || state.isAnimated);
    _updateMediaControlsVisibility();
  }

  function _updateUndoRedoBtns() {
    const canUndo = Editor.canUndo();
    const canRedo = Editor.canRedo();
    _setChromeBtn(document.getElementById('btn-undo'), canUndo);
    _setChromeBtn(document.getElementById('btn-redo'), canRedo);
    _setChromeBtn(document.getElementById('ew-undo'), canUndo);
    _setChromeBtn(document.getElementById('ew-redo'), canRedo);
  }

  function _onHistoryChange() {
    _updateUndoRedoBtns();
    _syncSlidersFromEffects('eff');
    _syncSlidersFromEffects('ew-eff');
    if (_isEditableImage()) _updateStatus({ dims: true });
    if (state.editMode) {
      const { w, h } = Editor.getDimensions();
      if (w !== _ewFitW || h !== _ewFitH) {
        requestAnimationFrame(() => _ewFit());
      } else {
        _ewApplyTransform();
      }
    } else {
      _applyTransform();
    }
  }

  /* ════════════════════════════════════════════
     Open / Load
  ════════════════════════════════════════════ */
  function _pd() {
    return window._ProgressDialog || null;
  }

  function _openProgressLabel(key, fileName) {
    if (key === 'opening') {
      return (I18n.t('progress.opening') || 'Opening {file}…').replace('{file}', fileName || '');
    }
    const mapped = I18n.t(`progress.${key}`);
    if (mapped && mapped !== `progress.${key}`) return mapped;
    return key || '';
  }

  function _isSlowOpen(filePath) {
    return !!(filePath && (
      FormatSupport.isHeic(filePath) || FormatSupport.isTiff(filePath) || FormatSupport.isDcm(filePath)
    ));
  }

  async function _openFile(filePath, { center = false } = {}) {
    if (!filePath) return;
    // Prevent overlapping opens (Windows fs.watch often fires when we read the file)
    if (_openingFile && _openingFile === filePath) return;
    if (state.editMode) {
      const same = state.currentFile &&
        String(state.currentFile).replace(/\\/g, '/').toLowerCase() ===
        String(filePath).replace(/\\/g, '/').toLowerCase();
      if (same) return;
      const closed = await _requestCloseEditWindow(false);
      if (!closed) return;
    }
    _openingFile = filePath;
    const fileName = filePath.split(/[/\\]/).pop();
    let progressShown = false;
    const showOpenProgress = (percent, messageKey) => {
      const dlg = _pd();
      if (!dlg) return;
      if (!progressShown) {
        progressShown = true;
        _showLoading(false);
        dlg.show({
          title: I18n.t('progress.openTitle') || I18n.t('progress.title') || 'Opening file',
          message: _openProgressLabel(messageKey || 'opening', fileName),
          percent: percent != null ? percent : 6,
        });
        dlg.startCreep(88);
        return;
      }
      dlg.set(percent != null ? percent : 0, _openProgressLabel(messageKey || 'opening', fileName));
      if (percent >= 90) dlg.stopCreep();
    };
    const progressTimer = setTimeout(
      () => showOpenProgress(8, 'opening'),
      _isSlowOpen(filePath) ? 50 : 400
    );
    const unsubProgress = window.electronAPI.onOpenProgress
      ? window.electronAPI.onOpenProgress(({ percent, message }) => {
          showOpenProgress(percent, message);
        })
      : null;

    try {
      const result = await _withTimeout(
        FormatSupport.loadImageFile(filePath),
        25000,
        I18n.t('error.openFile') || 'Opening this file took too long'
      );

      if (result.type === 'error') {
        _showPlaceholder(true);
        _updateStatus({ msg: result.message });
        _showError(
          `${I18n.t('error.openFile') || 'Failed to open file'}: ${fileName}`,
          result.message
        );
        return;
      }

      state.currentFile = filePath;
      state.isVideo     = result.type === 'video';
      state.isAudio     = result.type === 'audio';
      state.isAnimated  = result.type === 'animated';
      localStorage.setItem('lastOpenedFile', filePath);

      let mediaKind = 'none';
      if (state.isVideo) {
        _showAudioPlayer(null);
        _hideAnimatedImage();
        _showVideoPlayer(filePath);
        mediaKind = 'video';
      } else if (state.isAudio) {
        _showVideoPlayer(null);
        _hideAnimatedImage();
        _showAudioPlayer(filePath);
        mediaKind = 'audio';
      } else {
        _showVideoPlayer(null);
        _showAudioPlayer(null);
        if (!result.dataUrl) {
          _showPlaceholder(true);
          _updateToolbarForMedia('none');
          _showError(
            `${I18n.t('error.openFile') || 'Failed to open file'}: ${fileName}`,
            'Empty image data'
          );
          return;
        }
        if (progressShown) showOpenProgress(94, 'displaying');
        if (result.type === 'animated') {
          await _loadAnimatedImage(result.dataUrl, filePath);
          mediaKind = 'image';
        } else {
          state.isAnimated = false;
          await _loadImageDataUrl(result.dataUrl, filePath, result.dicomMeta);
          mediaKind = _isEditableImage() ? 'image' : 'none';
        }
      }

      _updateToolbarForMedia(mediaKind);
      _showLoading(false);
      if (progressShown) {
        const dlg = _pd();
        dlg?.stopCreep();
        dlg?.set(100, I18n.t('progress.done') || 'Done');
        await dlg?.yieldFrame(90);
      }

      FileTree.setSelected(filePath, { center });
      const dir = await window.electronAPI.pathDirname(filePath);
      _rememberRecentDir(dir);
      _watchDir(dir);
      state.fileList  = await FileTree.getImageFilesInDir(dir);
      state.fileIndex = FileTree.indexOfPath
        ? FileTree.indexOfPath(state.fileList, filePath)
        : state.fileList.indexOf(filePath);
      _updateNavButtons();

      _ignoreWatchUntil = Date.now() + 800;
      _watchCurrentFile(filePath);
      _clearDirty();
      try {
        await _updateInfoPanel(filePath, result.dicomMeta ?? null);
        _refreshBorderCaption();
      } catch (metaErr) {
        console.warn('Info panel after open failed:', metaErr);
      }
      _prefetchConvertedNeighbors();
    } catch (e) {
      console.error('Error opening file:', e);
      _showError(
        `${I18n.t('error.openFile') || 'Failed to open file'}: ${fileName}`,
        e
      );
    } finally {
      clearTimeout(progressTimer);
      if (typeof unsubProgress === 'function') unsubProgress();
      _pd()?.hide();
      if (_openingFile === filePath) _openingFile = null;
      _showLoading(false);
    }
  }

  function _prefetchConvertedNeighbors() {
    if (!window.electronAPI.convertToPng) return;
    const idx = state.fileIndex;
    const list = state.fileList || [];
    [list[idx + 1], list[idx - 1]].forEach((p) => {
      if (p && (FormatSupport.isHeic(p) || FormatSupport.isTiff(p))) {
        window.electronAPI.convertToPng(p).catch(() => {});
      }
    });
  }

  async function _loadImageDataUrl(dataUrl, filePath, dicomMeta) {
    return new Promise((resolve) => {
      if (!dataUrl) {
        _showPlaceholder(true);
        resolve();
        return;
      }
      const img = new Image();
      const done = () => resolve();
      // Safety: never leave the loading overlay waiting forever
      const timer = setTimeout(() => {
        _showPlaceholder(true);
        done();
      }, 15000);
      img.onload = () => {
        clearTimeout(timer);
        _showPlaceholder(false);
        _showVideoPlayer(null);
        _showAudioPlayer(null);
        _hideAnimatedImage();
        displayCanvas.style.display  = 'block';
        selCanvas.style.display      = 'block';
        videoEl.style.display        = 'none';
        Editor.loadImage(img);
        _fitToWindow();
        _updateStatus({ filePath, dicomMeta });
        done();
      };
      img.onerror = () => {
        clearTimeout(timer);
        _showPlaceholder(true);
        done();
      };
      img.src = dataUrl;
    });
  }

  function _hideAnimatedFreeze() {
    if (!animFreeze) return;
    animFreeze.style.display = 'none';
  }

  function _freezeAnimatedFrame() {
    if (!animImg || !animFreeze) return false;
    const w = animImg.naturalWidth || 0;
    const h = animImg.naturalHeight || 0;
    if (!w || !h) return false;
    if (animFreeze.width !== w) animFreeze.width = w;
    if (animFreeze.height !== h) animFreeze.height = h;
    try {
      const ctx = animFreeze.getContext('2d');
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(animImg, 0, 0);
    } catch {
      return false;
    }
    animFreeze.style.display = 'block';
    animImg.style.display = 'none';
    return true;
  }

  function _hideAnimatedImage() {
    if (!animImg) return;
    animImg.style.display = 'none';
    animImg.removeAttribute('src');
    _hideAnimatedFreeze();
    state.animatedDataUrl = null;
    state.animPlaying = false;
  }

  async function _loadAnimatedImage(dataUrl, filePath) {
    return new Promise((resolve) => {
      if (!animImg || !dataUrl) {
        _showPlaceholder(true);
        resolve();
        return;
      }
      const done = () => resolve();
      const timer = setTimeout(() => {
        _showPlaceholder(true);
        done();
      }, 15000);
      animImg.onload = () => {
        clearTimeout(timer);
        state.isAnimated = true;
        state.animatedDataUrl = dataUrl;
        state.animPlaying = true;
        _showPlaceholder(false);
        _showVideoPlayer(null);
        _showAudioPlayer(null);
        if (Editor.isLoaded()) Editor.clear();
        displayCanvas.style.display = 'none';
        selCanvas.style.display = 'none';
        videoEl.style.display = 'none';
        _hideAnimatedFreeze();
        animImg.style.display = 'block';
        _fitToWindow();
        _updateStatus({ filePath });
        _updateMediaControlsVisibility();
        _syncMediaTransportButtons();
        done();
      };
      animImg.onerror = () => {
        clearTimeout(timer);
        _showPlaceholder(true);
        done();
      };
      state.animatedDataUrl = dataUrl;
      animImg.src = dataUrl;
    });
  }

  /** Rasterize current animated frame into the canvas editor (for edit mode). */
  async function _rasterizeAnimatedToEditor() {
    const src = state.animatedDataUrl || animImg?.src;
    if (!state.isAnimated || !src) return false;
    if (state.animPlaying === false && animFreeze && animFreeze.style.display !== 'none') {
      // Prefer frozen pixels when paused
      try {
        const dataUrl = animFreeze.toDataURL('image/png');
        return new Promise((resolve) => {
          const img = new Image();
          img.onload = () => {
            Editor.loadImage(img);
            displayCanvas.style.display = 'block';
            selCanvas.style.display = 'block';
            if (animImg) animImg.style.display = 'none';
            _hideAnimatedFreeze();
            resolve(true);
          };
          img.onerror = () => resolve(false);
          img.src = dataUrl;
        });
      } catch {}
    }
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        Editor.loadImage(img);
        displayCanvas.style.display = 'block';
        selCanvas.style.display = 'block';
        if (animImg) animImg.style.display = 'none';
        _hideAnimatedFreeze();
        resolve(true);
      };
      img.onerror = () => resolve(false);
      img.src = src;
    });
  }

  function _restoreAnimatedView() {
    const src = state.animatedDataUrl || animImg?.src;
    if (!state.isAnimated || !src || !animImg) return;
    if (Editor.isLoaded()) Editor.clear();
    displayCanvas.style.display = 'none';
    selCanvas.style.display = 'none';
    _hideAnimatedFreeze();
    animImg.style.display = 'block';
    if (animImg.src !== src) animImg.src = src;
    state.animPlaying = true;
    _fitToWindow();
    _syncMediaTransportButtons();
  }

  function _activeMediaEl() {
    if (state.isVideo && videoEl && videoEl.style.display !== 'none') return videoEl;
    if (state.isAudio && audioEl && audioWrap && audioWrap.style.display !== 'none') return audioEl;
    return null;
  }

  function _isMediaPlaying() {
    if (state.isAnimated) return !!state.animPlaying;
    const el = _activeMediaEl();
    return !!(el && !el.paused && !el.ended);
  }

  function _fmtMediaTime(sec) {
    if (!Number.isFinite(sec) || sec < 0) sec = 0;
    const s = Math.floor(sec % 60);
    const m = Math.floor(sec / 60) % 60;
    const h = Math.floor(sec / 3600);
    const pad = (n) => String(n).padStart(2, '0');
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
  }

  function _updateMediaControlsVisibility() {
    if (!mediaControls) return;
    const show = !state.editMode && (state.isVideo || state.isAnimated);
    mediaControls.hidden = !show;
    mediaControls.style.display = show ? 'flex' : 'none';
    mediaControls.classList.toggle('is-on', show);
    mediaControls.classList.toggle('is-animated', !!state.isAnimated && !state.isVideo);
    if (show) _syncMediaTransportButtons();
  }

  function _setMediaCtrlEnabled(btn, on) {
    if (!btn) return;
    btn.disabled = !on;
    btn.setAttribute('aria-disabled', on ? 'false' : 'true');
  }

  function _syncMediaTransportButtons() {
    // Do not call _updateMediaControlsVisibility here — that would recurse.
    if (!mediaControls || mediaControls.hidden) return;

    const playing = _isMediaPlaying();
    // Play enabled when not playing; Pause only while playing; Stop always when media loaded
    _setMediaCtrlEnabled(mcPlayBtn, !playing);
    _setMediaCtrlEnabled(mcPauseBtn, playing);
    _setMediaCtrlEnabled(mcStopBtn, true);
    mcPlayBtn?.classList.toggle('is-active', !playing);
    mcPauseBtn?.classList.toggle('is-active', playing);
    mcStopBtn?.classList.toggle('is-active', false);

    if (state.isVideo && videoEl) {
      _syncMediaSeekUi();
    }
  }

  function _syncMediaSeekUi() {
    if (!mcSeek || !videoEl || !state.isVideo) return;
    const dur = videoEl.duration;
    const cur = videoEl.currentTime || 0;
    if (Number.isFinite(dur) && dur > 0) {
      mcSeek.max = '1000';
      if (!_mcSeekDragging) {
        mcSeek.value = String(Math.round((cur / dur) * 1000));
      }
      if (mcTime) mcTime.textContent = `${_fmtMediaTime(cur)} / ${_fmtMediaTime(dur)}`;
    } else if (mcTime) {
      mcTime.textContent = `${_fmtMediaTime(cur)} / --:--`;
    }
  }

  let _mcSeekDragging = false;

  function _playMedia() {
    if (state.isAnimated) {
      _playAnimated();
      return;
    }
    if (!state.isVideo || !videoEl) return;
    if (videoEl.ended) {
      try { videoEl.currentTime = 0; } catch {}
    }
    const p = videoEl.play();
    if (p && typeof p.catch === 'function') p.catch(() => {});
    _syncMediaTransportButtons();
  }

  function _pauseMedia() {
    if (state.isAnimated) {
      _pauseAnimated();
      return;
    }
    if (!state.isVideo || !videoEl || videoEl.paused) return;
    videoEl.pause();
    // Pause badge stays while paused (clickable to resume)
    _showMediaCue('pause', true);
    _syncMediaTransportButtons();
  }

  function _stopMedia() {
    if (state.isAnimated) {
      _stopAnimated();
      return;
    }
    if (!state.isVideo || !videoEl) return;
    videoEl.pause();
    try { videoEl.currentTime = 0; } catch {}
    // Stop is a brief flash, then leave the persistent pause badge
    _flashThenPauseCue('stop');
    _syncMediaTransportButtons();
    _syncMediaSeekUi();
  }

  function _toggleMediaPlayback() {
    if (_isMediaPlaying()) _pauseMedia();
    else _playMedia();
  }

  function _playAnimated() {
    if (!state.isAnimated || !animImg) return;
    const src = state.animatedDataUrl;
    _hideAnimatedFreeze();
    animImg.style.display = 'block';
    if (src && (!animImg.src || animImg.getAttribute('data-stopped') === '1')) {
      animImg.removeAttribute('data-stopped');
      animImg.src = src;
    }
    state.animPlaying = true;
    _showMediaCue('play', false); // brief
    _syncMediaTransportButtons();
  }

  function _pauseAnimated() {
    if (!state.isAnimated || !animImg) return;
    if (!state.animPlaying) return;
    if (animImg.style.display === 'none' && state.animatedDataUrl) {
      animImg.style.display = 'block';
    }
    if (_freezeAnimatedFrame()) {
      state.animPlaying = false;
      _showMediaCue('pause', true); // stays while paused
      _syncMediaTransportButtons();
    }
  }

  function _stopAnimated() {
    if (!state.isAnimated || !animImg) return;
    const src = state.animatedDataUrl;
    if (!src) return;
    const onReady = () => {
      animImg.removeEventListener('load', onReady);
      requestAnimationFrame(() => {
        _freezeAnimatedFrame();
        state.animPlaying = false;
        animImg.setAttribute('data-stopped', '1');
        _flashThenPauseCue('stop');
        _syncMediaTransportButtons();
      });
    };
    _hideAnimatedFreeze();
    animImg.style.display = 'block';
    animImg.addEventListener('load', onReady);
    animImg.src = '';
    animImg.src = src;
  }

  function _showVideoPlayer(filePath) {
    if (filePath) {
      displayCanvas.style.display = 'none';
      selCanvas.style.display     = 'none';
      _hideAnimatedImage();
      videoEl.style.display       = 'flex';
      imagePlaceholder.style.display = 'none';
      videoEl.src = '';
      videoEl.load();
      window.electronAPI.getFileUrl(filePath).then(url => {
        videoEl.src = url;
        videoEl.load();
        // Fresh load is idle (not user-paused) — don't show a pause badge
        _hideMediaCue();
        _updateMediaControlsVisibility();
        _syncMediaTransportButtons();
      });
    } else {
      _hideMediaCue();
      videoEl.pause?.();
      videoEl.style.display = 'none';
      videoEl.src = '';
      _updateMediaControlsVisibility();
      _syncMediaTransportButtons();
    }
  }

  function _videoCueActive() {
    return !!(state.isVideo && videoEl && videoEl.style.display !== 'none')
      || !!(state.isAnimated && !state.editMode);
  }

  /** Play / stop: brief flash only. Pause: stays while media is paused. */
  function _flashThenPauseCue(kind) {
    _showMediaCue(kind, false);
    // Replace auto-hide with a transition to the persistent pause badge
    clearTimeout(_mediaCueTimer);
    _mediaCueTimer = null;
    clearTimeout(_mediaCueFollowup);
    _mediaCueFollowup = setTimeout(() => {
      _mediaCueFollowup = null;
      if (!_videoCueActive() || _isMediaPlaying()) {
        _hideMediaCue();
        return;
      }
      _showMediaCue('pause', true);
    }, 900);
  }

  function _showMediaCue(kind, persist) {
    if (!mediaCue || !mediaCueBadge) return;
    const icons = { play: Icons.mediaPlay, pause: Icons.mediaPause, stop: Icons.mediaStop };
    // Only pause may persist; play/stop are always brief flashes
    if (kind !== 'pause') persist = false;
    mediaCueBadge.innerHTML = icons[kind] || icons.pause;
    mediaCue.classList.remove('is-on', 'is-flash', 'is-persist', 'is-play', 'is-pause', 'is-stop');
    void mediaCue.offsetWidth;
    mediaCue.classList.add('is-on', persist ? 'is-persist' : 'is-flash', `is-${kind}`);
    mediaCue.style.pointerEvents = 'none';
    mediaCueBadge.style.pointerEvents = persist ? 'auto' : 'none';
    mediaCueBadge.style.cursor = persist ? 'pointer' : '';
    mediaCue.setAttribute('aria-hidden', persist ? 'false' : 'true');
    clearTimeout(_mediaCueTimer);
    clearTimeout(_mediaCueFollowup);
    _mediaCueFollowup = null;
    if (persist) return;
    _mediaCueTimer = setTimeout(() => _hideMediaCue(), 900);
  }

  function _hideMediaCue() {
    clearTimeout(_mediaCueTimer);
    _mediaCueTimer = null;
    if (!mediaCue) return;
    mediaCue.classList.remove('is-on', 'is-flash', 'is-persist', 'is-play', 'is-pause', 'is-stop');
    mediaCue.style.pointerEvents = 'none';
    if (mediaCueBadge) {
      mediaCueBadge.style.pointerEvents = 'none';
      mediaCueBadge.style.cursor = '';
    }
    mediaCue.setAttribute('aria-hidden', 'true');
  }

  function _initMediaCues() {
    mcPlayBtn?.addEventListener('click', (e) => { e.stopPropagation(); _playMedia(); });
    mcPauseBtn?.addEventListener('click', (e) => { e.stopPropagation(); _pauseMedia(); });
    mcStopBtn?.addEventListener('click', (e) => { e.stopPropagation(); _stopMedia(); });

    mcSeek?.addEventListener('pointerdown', () => { _mcSeekDragging = true; });
    mcSeek?.addEventListener('pointerup', () => { _mcSeekDragging = false; _syncMediaSeekUi(); });
    mcSeek?.addEventListener('input', () => {
      if (!state.isVideo || !videoEl) return;
      const dur = videoEl.duration;
      if (!Number.isFinite(dur) || dur <= 0) return;
      const t = (Number(mcSeek.value) / 1000) * dur;
      try { videoEl.currentTime = t; } catch {}
      if (mcTime) mcTime.textContent = `${_fmtMediaTime(t)} / ${_fmtMediaTime(dur)}`;
    });

    if (videoEl) {
      // Suppress native Chromium video context menu; use app menu instead
      videoEl.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        _showContextMenu(e.clientX, e.clientY);
      });
      videoEl.addEventListener('play', () => {
        if (!_videoCueActive()) return;
        _showMediaCue('play', false);
        _syncMediaTransportButtons();
      });
      videoEl.addEventListener('pause', () => {
        _syncMediaTransportButtons();
      });
      videoEl.addEventListener('ended', () => {
        if (!(state.isVideo && videoEl.style.display !== 'none')) return;
        _flashThenPauseCue('stop');
        _syncMediaTransportButtons();
      });
      videoEl.addEventListener('timeupdate', () => {
        if (state.isVideo) _syncMediaSeekUi();
      });
      videoEl.addEventListener('loadedmetadata', () => {
        if (state.isVideo) {
          _syncMediaSeekUi();
          if (state.currentFile) _updateInfoPanel(state.currentFile).catch(() => {});
          const d = _getViewerDims();
          if (d.w && d.h && statusDims) {
            statusDims.textContent = `${d.w} × ${d.h} ${I18n.t('status.dimensions')}`;
          }
          if (_wantFit) _fitToWindow();
        }
      });
    }

    audioEl?.addEventListener('loadedmetadata', () => {
      if (state.isAudio && state.currentFile) {
        _updateInfoPanel(state.currentFile).catch(() => {});
      }
    });

    mediaCueBadge?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!_videoCueActive()) return;
      _toggleMediaPlayback();
    });

    _updateMediaControlsVisibility();
  }

  function _showAudioPlayer(filePath) {
    if (filePath) {
      displayCanvas.style.display = 'none';
      selCanvas.style.display     = 'none';
      videoEl.style.display       = 'none';
      imagePlaceholder.style.display = 'none';
      if (audioWrap) audioWrap.style.display = 'flex';
      if (audioEl) {
        audioEl.src = '';
        audioEl.load();
      }
      if (audioLabel) audioLabel.textContent = filePath.split(/[/\\]/).pop();
      window.electronAPI.getFileUrl(filePath).then(url => {
        if (audioEl) {
          audioEl.src = url;
          audioEl.load();
        }
      });
    } else {
      if (audioWrap) audioWrap.style.display = 'none';
      if (audioEl) { audioEl.src = ''; audioEl.pause(); }
    }
  }

  async function _openFirstInDir(dirPath) {
    if (!dirPath) return false;
    try {
      const files = await FileTree.getImageFilesInDir(dirPath);
      if (!files.length) return false;
      if (state.currentFile && FileTree.indexOfPath(files, state.currentFile) === 0) {
        return true;
      }
      await _openFile(files[0], { center: true });
      return true;
    } catch (e) {
      console.warn('open first in dir:', e);
      return false;
    }
  }

  function _normDirKey(p) {
    return String(p || '').replace(/[\\/]+$/, '').replace(/\\/g, '/').toLowerCase();
  }

  function _dirBaseName(p) {
    const cleaned = String(p || '').replace(/[\\/]+$/, '');
    const parts = cleaned.split(/[/\\]/).filter(Boolean);
    return parts.pop() || cleaned || p;
  }

  function _getRecentDirs() {
    const stored = localStorage.getItem(RECENT_DIRS_KEY);
    if (stored !== null) {
      try {
        const raw = JSON.parse(stored);
        return Array.isArray(raw) ? raw.filter(Boolean).slice(0, RECENT_DIRS_MAX) : [];
      } catch { return []; }
    }
    const last = localStorage.getItem('lastOpenedDir');
    return last ? [last] : [];
  }

  function _rememberRecentDir(dirPath) {
    if (!dirPath) return;
    const list = _getRecentDirs();
    const key = _normDirKey(dirPath);
    if (list.length && _normDirKey(list[0]) === key) {
      localStorage.setItem('lastOpenedDir', dirPath);
      window.electronAPI.setLastOpenDir(dirPath);
      return;
    }
    const next = [dirPath, ...list.filter((p) => _normDirKey(p) !== key)].slice(0, RECENT_DIRS_MAX);
    localStorage.setItem(RECENT_DIRS_KEY, JSON.stringify(next));
    localStorage.setItem('lastOpenedDir', dirPath);
    window.electronAPI.setLastOpenDir(dirPath);
  }

  async function _clearRecentFolderHistory() {
    const t = I18n.t.bind(I18n);
    const result = await window.electronAPI.showMessageBox({
      type: 'warning',
      title: t('toolbar.clearRecentFolders') || 'Clear recent folders',
      message: t('toolbar.clearRecentFoldersConfirm') || 'Delete all recent folder history?',
      buttons: [
        t('toolbar.clearRecentFoldersYes') || 'Clear',
        t('dialog.unsaved.cancel') || 'Cancel',
      ],
      defaultId: 1,
      cancelId: 1,
    });
    if (result.response !== 0) return;
    localStorage.setItem(RECENT_DIRS_KEY, '[]');
    localStorage.removeItem('lastOpenedDir');
    window.electronAPI.setLastOpenDir('');
  }

  async function _showRecentFoldersMenu(anchorEl) {
    const raw = _getRecentDirs();
    const existing = [];
    for (const p of raw) {
      try {
        const stats = await window.electronAPI.getFileStats(p);
        if (stats && !stats.error && stats.isDirectory) existing.push(p);
      } catch { /* gone */ }
    }
    if (existing.length !== raw.length) {
      localStorage.setItem(RECENT_DIRS_KEY, JSON.stringify(existing));
    }

    const items = existing.map((p) => ({
      icon: Icons.folder,
      label: _dirBaseName(p),
      detail: p,
      title: p,
      action: () => _openFolder(p),
    }));
    if (items.length) items.push({ separator: true });
    items.push({
      icon: Icons.openFolder,
      label: I18n.t('toolbar.openFolderBrowse') || I18n.t('menu.openFolder'),
      action: () => _pickOpenFolder(),
    });
    if (existing.length) {
      items.push({ separator: true });
      items.push({
        icon: Icons.delete,
        label: I18n.t('toolbar.clearRecentFolders') || 'Clear recent folders',
        danger: true,
        action: () => _clearRecentFolderHistory(),
      });
    }

    const el = anchorEl || document.getElementById('btn-open-folder');
    const r = el?.getBoundingClientRect?.();
    const x = r ? r.left : 8;
    const y = r ? r.bottom + 4 : 40;
    ContextMenu.show(x, y, items);
  }

  function _isFileDialogOpen() {
    const el = document.getElementById('file-dialog-overlay');
    return !!(el && (el.style.display === 'flex' || el.classList.contains('visible')));
  }

  async function _pickOpenFile() {
    if (!window.FileDialog) return;
    const r = await window.FileDialog.openFile();
    if (!r || r.canceled || !r.filePath) return;
    const p = r.filePath;
    try {
      const dir = await window.electronAPI.pathDirname(p);
      await _openFile(p, { center: true });
      await FileTree.revealPath(dir);
      await FileTree.refresh();
      FileTree.setSelected(p, { center: true });
    } catch (_) {
      await _openFile(p, { center: true });
    }
  }

  async function _pickOpenFolder() {
    if (!window.FileDialog) return;
    const r = await window.FileDialog.openFolder();
    if (!r || r.canceled || !r.filePath) return;
    await _openFolder(r.filePath);
    await FileTree.refresh();
  }

  async function _openFolder(dirPath, { openFirst = true } = {}) {
    _rememberRecentDir(dirPath);
    if (window.electronAPI.platform === 'web') {
      await FileTree.loadDrives();
    }
    await FileTree.revealPath(dirPath);
    _watchDir(dirPath);
    if (!openFirst) return;
    const opened = await _openFirstInDir(dirPath);
    if (!opened) {
      state.currentFile = null;
      _showPlaceholder(true);
      _updateInfoPanel(null);
      _setToolbarEnabled(false);
    }
  }

  /* ════════════════════════════════════════════
     Zoom / Pan
  ════════════════════════════════════════════ */
  function _zoom(factor, cx, cy) {
    if (!_hasViewerVisual()) return;
    _wantFit = false;
    const newZoom = Math.min(Math.max(state.zoom * factor, 0.02), 32);
    const ratio   = newZoom / state.zoom;

    // Zoom toward cursor position
    if (cx !== undefined && cy !== undefined) {
      state.panX = cx - (cx - state.panX) * ratio;
      state.panY = cy - (cy - state.panY) * ratio;
    }
    state.zoom = newZoom;
    _applyTransform();
    _updateZoomDisplay();
    _updateStatus({ zoom: true });
  }

  function _setZoom(z) {
    _wantFit = false;
    state.zoom = Math.min(Math.max(z, 0.02), 32);
    _applyTransform();
    _updateZoomDisplay();
    _updateStatus({ zoom: true });
  }

  let _wantFit = true;
  function _fitZoomFor(container, w, h) {
    if (!container || !w || !h) return 1;
    const cw = Math.max(1, container.clientWidth  - 16);
    const ch = Math.max(1, container.clientHeight - 16);
    const z = Math.min(cw / w, ch / h);
    if (!Number.isFinite(z) || z <= 0) return 1;
    return Math.min(Math.max(z, 0.02), 32);
  }

  function _fitToWindow() {
    if (!_hasViewerVisual()) return;
    if (state.editMode) {
      _ewFit();
      return;
    }
    const { w, h } = _getViewerDims();
    if (!w || !h) return;
    _wantFit = true;
    state.zoom = _fitZoomFor(viewerContainer, w, h);
    state.panX = 0; state.panY = 0;
    _applyTransform();
    _updateZoomDisplay();
    _updateStatus({ zoom: true });
  }

  function _actualSize() {
    if (!_hasViewerVisual()) return;
    _wantFit = false;
    state.zoom = 1; state.panX = 0; state.panY = 0;
    _applyTransform();
    _updateZoomDisplay();
    _updateStatus({ zoom: true });
  }

  function _placeImageWrapper(container, panX, panY, zoom, dims) {
    if (!imageWrapper || !container) return;
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    const w = dims.w || 0;
    const h = dims.h || 0;
    const left = Math.round(cw / 2 + panX - (w * zoom) / 2);
    const top = Math.round(ch / 2 + panY - (h * zoom) / 2);
    imageWrapper.style.left = `${left}px`;
    imageWrapper.style.top = `${top}px`;
    imageWrapper.style.transform = `scale(${zoom})`;
  }

  function _applyTransform() {
    const dims = _getViewerDims();

    if (dims.w && dims.h) {
      const scaledW = dims.w * state.zoom;
      const scaledH = dims.h * state.zoom;
      const cw = viewerContainer.clientWidth;
      const ch = viewerContainer.clientHeight;

      // If image fits inside the container → center it
      // If image is larger → clamp pan so no blank space shows at edges
      if (scaledW <= cw) {
        state.panX = 0;
      } else {
        const maxPanX = (scaledW - cw) / 2;
        state.panX = Math.max(-maxPanX, Math.min(maxPanX, state.panX));
      }

      if (scaledH <= ch) {
        state.panY = 0;
      } else {
        const maxPanY = (scaledH - ch) / 2;
        state.panY = Math.max(-maxPanY, Math.min(maxPanY, state.panY));
      }
    }

    _placeImageWrapper(viewerContainer, state.panX, state.panY, state.zoom, dims);
  }

  function _updateZoomDisplay() {
    const pct = Math.round(state.zoom * 100);
    const zd = document.getElementById('zoom-display');
    if (zd) zd.value = `${pct}%`;
  }

  function _initViewerInteraction() {
    let _panDidMove = false;
    let _panDownX = 0;
    let _panDownY = 0;
    const PAN_CLICK_SLOP = 6;

    // Wheel zoom
    viewerContainer.addEventListener('wheel', (e) => {
      e.preventDefault();
      const rect = viewerContainer.getBoundingClientRect();
      const cx = e.clientX - rect.left - rect.width  / 2 + state.panX;
      const cy = e.clientY - rect.top  - rect.height / 2 + state.panY;
      const factor = e.deltaY < 0 ? 1.1 : 0.9;
      _zoom(factor, cx, cy);
    }, { passive: false });

    // Pan
    viewerContainer.addEventListener('mousedown', (e) => {
      if (state.currentTool !== 'pointer') return;
      if (e.button !== 0 && e.button !== 1) return;
      // Don't start pan from transport controls
      if (e.target.closest?.('#media-controls')) return;
      if (!Editor.isLoaded() && !state.isVideo && !state.isAnimated) return;
      _panDidMove = false;
      _panDownX = e.clientX;
      _panDownY = e.clientY;
      state.isPanning  = true;
      state.panStartX  = e.clientX;
      state.panStartY  = e.clientY;
      state.panOriginX = state.panX;
      state.panOriginY = state.panY;
      viewerContainer.classList.add('dragging');
      selCanvas.style.cursor = 'grabbing';
    });

    window.addEventListener('mousemove', (e) => {
      if (!state.isPanning) return;
      if (!_panDidMove) {
        const dx = e.clientX - _panDownX;
        const dy = e.clientY - _panDownY;
        if ((dx * dx + dy * dy) > (PAN_CLICK_SLOP * PAN_CLICK_SLOP)) _panDidMove = true;
      }
      state.panX = state.panOriginX + (e.clientX - state.panStartX);
      state.panY = state.panOriginY + (e.clientY - state.panStartY);
      _applyTransform();
    });

    window.addEventListener('mouseup', () => {
      if (state.isPanning) {
        state.isPanning = false;
        viewerContainer.classList.remove('dragging');
        selCanvas.style.cursor = state.currentTool === 'pointer' ? 'grab' : 'crosshair';
      }
    });

    // Click video (without drag) → play / pause toggle
    viewerContainer.addEventListener('click', (e) => {
      if (state.editMode || !state.isVideo) return;
      if (e.button != null && e.button !== 0) return;
      if (_panDidMove) return;
      if (e.target.closest?.('#media-controls')) return;
      if (e.target.closest?.('#media-cue-badge')) return;
      e.preventDefault();
      _toggleMediaPlayback();
    });

    // Zoom display input – delegate via event listener on toolbar
    toolbar.addEventListener('change', (e) => {
      if (e.target.id === 'zoom-display') {
        const val = parseFloat(e.target.value);
        if (!isNaN(val) && val > 0) _setZoom(val / 100);
        else _updateZoomDisplay();
      }
    });
    toolbar.addEventListener('keydown', (e) => {
      if (e.target.id === 'zoom-display' && e.key === 'Enter') e.target.blur();
    });
  }

  /* ════════════════════════════════════════════
     Selection / Editing tools
  ════════════════════════════════════════════ */
  function _setTool(tool) {
    state.currentTool = tool;
    Editor.setTool(tool);

    // Update tool button active state
    const toolBtns = {
      'pointer':    'btn-tool-pointer',
      'rect-select':'btn-tool-rect',
      'lasso':      'btn-tool-lasso',
      'polygon':    'btn-tool-polygon',
      'magic-wand': 'btn-tool-magic',
    };
    Object.values(toolBtns).forEach(id => {
      document.getElementById(id)?.classList.remove('active');
    });
    if (toolBtns[tool]) {
      document.getElementById(toolBtns[tool])?.classList.add('active');
    }

    // Pan mode indicator and cursor
    if (tool === 'pointer') {
      viewerContainer.classList.add('drag-mode');
      viewerContainer.classList.remove('select-mode');
      selCanvas.style.cursor = 'grab';
    } else {
      viewerContainer.classList.remove('drag-mode');
      viewerContainer.classList.add('select-mode');
      selCanvas.style.cursor = 'crosshair';
    }
  }

  function _onSelectionChange(hasSel) {
    _ewUpdateSelBtns();
  }

  async function _removeBackground() {
    if (!_isEditableImage()) return;
    const algo = _getBgAlgo();
    if (algo === 'selection' && !Editor.hasSelection()) return;

    if (Editor.isRembgAlgorithm(algo)) {
      await _runRembg(algo);
      return;
    }

    const algoLabel = I18n.t(`bgAlgo.${algo}`) || algo;
    ProgressDialog.show({
      title: I18n.t('progress.title') || 'Progress',
      message: `${I18n.t('progress.bgRemove') || 'Removing background…'} (${algoLabel})`,
      percent: 5,
    });
    try {
      await ProgressDialog.yieldFrame();
      ProgressDialog.set(25, I18n.t('progress.running') || 'Running algorithm…');
      await ProgressDialog.yieldFrame();
      Editor.removeBackgroundAuto(algo);
      if (state.editMode) _ewFit();
      ProgressDialog.set(85, I18n.t('progress.applying') || 'Applying result…');
      await ProgressDialog.yieldFrame();
      ProgressDialog.set(100, I18n.t('progress.done') || 'Done');
      await ProgressDialog.yieldFrame(80);
      _updateUndoRedoBtns();
      _ewUpdateSelBtns();
      _updateStatus({ dims: true });
    } finally {
      ProgressDialog.hide();
    }
  }

  let _rembgBusy = false;

  async function _runRembg(algo) {
    if (_rembgBusy) return;
    if (!window.electronAPI?.rembgRemove) {
      _showError(I18n.t('bgAlgo.rembgUnavailable') || 'AI rembg is only available in the desktop app.');
      return;
    }
    const dataUrl = Editor.exportAsDataUrl('image/png');
    if (!dataUrl) return;

    // Capture selection bbox before rembg (applyFromDataUrl clears selection)
    const cropBounds = Editor.getSelectionBounds?.(1) || null;

    const algoLabel = I18n.t(`bgAlgo.${algo}`) || algo;
    const btn = document.getElementById('ew-bg-remove');
    const sel = document.getElementById('ew-bg-algo');
    _rembgBusy = true;
    _setChromeBtn(btn, false);
    _setChromeBtn(sel, false);

    ProgressDialog.show({
      title: I18n.t('progress.title') || 'Progress',
      message: `${I18n.t('bgAlgo.rembgRunning') || 'Removing background (AI)…'} (${algoLabel})`,
      percent: 0,
    });
    ProgressDialog.startCreep(88);

    const unsub = window.electronAPI.onRembgProgress
      ? window.electronAPI.onRembgProgress(({ percent, message }) => {
          ProgressDialog.set(percent, _progressMessage(message, algoLabel));
          if (percent >= 35 && percent < 90) ProgressDialog.startCreep(88);
          if (percent >= 90) ProgressDialog.stopCreep();
        })
      : null;

    try {
      const result = await window.electronAPI.rembgRemove({ dataUrl, model: algo });
      ProgressDialog.stopCreep();
      if (result?.error) {
        ProgressDialog.hide();
        _showError(
          I18n.t('bgAlgo.rembgFailed') || 'AI background removal failed',
          result.hint ? `${result.error}\n${result.hint}` : result.error
        );
        return;
      }
      if (!result?.dataUrl) {
        ProgressDialog.hide();
        return;
      }
      ProgressDialog.set(96, I18n.t('progress.applying') || 'Applying result…');
      await Editor.applyFromDataUrl(result.dataUrl);
      Editor.cropAfterBackgroundRemove(cropBounds);
      Editor.saveHistory();
      if (state.editMode) _ewFit();
      ProgressDialog.set(100, I18n.t('progress.done') || 'Done');
      await ProgressDialog.yieldFrame(120);
      _updateUndoRedoBtns();
      _ewUpdateSelBtns();
      _updateStatus({ dims: true });
    } catch (err) {
      ProgressDialog.stopCreep();
      ProgressDialog.hide();
      _showError(I18n.t('bgAlgo.rembgFailed') || 'AI background removal failed', err.message || String(err));
    } finally {
      if (typeof unsub === 'function') unsub();
      ProgressDialog.stopCreep();
      ProgressDialog.hide();
      _rembgBusy = false;
      _setChromeBtn(btn, true);
      _setChromeBtn(sel, true);
      _ewUpdateSelBtns();
    }
  }

  function _progressMessage(code, algoLabel) {
    const map = {
      preparing: 'progress.preparing',
      loading_model: 'progress.loadingModel',
      running: 'progress.running',
      writing: 'progress.applying',
      applying: 'progress.applying',
      done: 'progress.done',
    };
    const key = map[code];
    const base = key ? (I18n.t(key) || code) : (I18n.t('bgAlgo.rembgRunning') || 'Removing background (AI)…');
    return algoLabel ? `${base} (${algoLabel})` : base;
  }

  function _getBgAlgo() {
    const sel = document.getElementById('ew-bg-algo');
    if (sel && sel.value) return sel.value;
    return localStorage.getItem('bgRemoveAlgo') || 'rembg1';
  }

  function _populateBgAlgoSelect() {
    const sel = document.getElementById('ew-bg-algo');
    if (!sel) return;
    const algos = Editor.listBgAlgorithms();
    const current = localStorage.getItem('bgRemoveAlgo') || 'rembg1';
    sel.innerHTML = '';
    for (const id of algos) {
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = I18n.t(`bgAlgo.${id}`) || id;
      if (id === current) opt.selected = true;
      sel.appendChild(opt);
    }
    Tooltip.attach(sel, () => I18n.t('toolbar.bgAlgo'));
  }

  /* ════════════════════════════════════════════
     Transform
  ════════════════════════════════════════════ */
  function _rotate(deg) {
    if (!_isEditableImage()) return;
    Editor.rotate(deg);
    _fitToWindow();
    _updateStatus({ dims: true });
  }

  function _flip(axis) {
    if (!_isEditableImage()) return;
    Editor.flip(axis);
  }

  /* ════════════════════════════════════════════
     Navigation (prev / next)
  ════════════════════════════════════════════ */
  async function _prevImage() {
    if (state.fileIndex <= 0) return;
    if (state.editMode) {
      const closed = await _requestCloseEditWindow(false);
      if (!closed) return;
    }
    state.fileIndex--;
    _openFile(state.fileList[state.fileIndex]);
  }

  async function _nextImage() {
    if (state.fileIndex >= state.fileList.length - 1) return;
    if (state.editMode) {
      const closed = await _requestCloseEditWindow(false);
      if (!closed) return;
    }
    state.fileIndex++;
    _openFile(state.fileList[state.fileIndex]);
  }

  function _updateNavButtons() {
    _setChromeBtn(document.getElementById('btn-prev'), state.fileIndex > 0);
    _setChromeBtn(document.getElementById('btn-next'),
      state.fileIndex >= 0 && state.fileIndex < state.fileList.length - 1);
  }

  /* ════════════════════════════════════════════
     Effects Panel
  ════════════════════════════════════════════ */
  function _buildEffectsPanel() {
    _buildEffectsPanelIn('effects-content', 'eff');
    if (document.getElementById('edit-effects-content')) {
      _buildEffectsPanelIn('edit-effects-content', 'ew-eff', 'presets');
      _buildEffectsPanelIn('edit-adjust-content', 'ew-eff', 'adjust');
      _ewEffectsBuilt = true;
    }
  }

  function _presetRoot(idPrefix) {
    return document.getElementById(idPrefix === 'ew-eff' ? 'edit-effects-content' : 'effects-content');
  }

  function _clearPresetActive(idPrefix) {
    _presetRoot(idPrefix)?.querySelectorAll('.preset-btn').forEach((b) => b.classList.remove('active'));
  }

  function _buildEffectsPanelIn(containerId, idPrefix, mode = 'all') {
    const content = document.getElementById(containerId);
    if (!content) return;

    const sliders = [
      { key:'brightness', label:'effects.brightness', min:0,   max:200, step:1,  def:100 },
      { key:'contrast',   label:'effects.contrast',   min:0,   max:200, step:1,  def:100 },
      { key:'saturation', label:'effects.saturation', min:0,   max:200, step:1,  def:100 },
      { key:'hue',        label:'effects.hue',        min:-180,max:180, step:1,  def:0 },
      { key:'blur',       label:'effects.blur',       min:0,   max:20,  step:0.5,def:0 },
      { key:'tiltShift',  label:'effects.miniatureDepth',  min:0,   max:100, step:1,  def:0 },
      { key:'sharpen',    label:'effects.sharpen',    min:0,   max:100, step:1,  def:0 },
      { key:'vignette',   label:'effects.vignette',   min:0,   max:100, step:1,  def:0 },
      { key:'grain',      label:'effects.grain',      min:0,   max:100, step:1,  def:0 },
      { key:'posterize',  label:'effects.posterize',  min:0,   max:8,   step:1,  def:0 },
      { key:'solarize',   label:'effects.solarize',   min:0,   max:100, step:1,  def:0 },
      { key:'warmth',     label:'effects.warmth',     min:-100,max:100, step:1,  def:0 },
      { key:'grayscale',  label:'effects.grayscale',  min:0,   max:100, step:1,  def:0 },
      { key:'sepia',      label:'effects.sepia',      min:0,   max:100, step:1,  def:0 },
      { key:'invert',     label:'effects.invert',     min:0,   max:100, step:1,  def:0 },
    ];

    // Preserve current slider values across rebuild (e.g. language switch)
    const prevValues = {};
    for (const s of sliders) {
      const el = document.getElementById(`${idPrefix}-${s.key}`);
      if (el) prevValues[s.key] = el.value;
    }
    for (const key of [
      'borderWidth', 'borderShadow', 'borderShadowStyle', 'borderShadowDir',
      'borderCaptionText', 'borderCaptionFont', 'borderCaptionFontSize', 'borderCaptionColor',
    ]) {
      const el = document.getElementById(`${idPrefix}-${key}`);
      if (el) prevValues[key] = el.value;
    }
    const activePreset = content.querySelector('.preset-btn.active')?.dataset?.preset || null;

    content.innerHTML = '';

    if (mode === 'adjust') {
      _appendAdjustControls(content, idPrefix, sliders, prevValues);
      return;
    }

    // Presets
    if (mode !== 'presets') {
      const presetsLabel = document.createElement('div');
      presetsLabel.style.cssText = 'font-size:11px;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;font-weight:700;';
      presetsLabel.setAttribute('data-i18n', 'effects.presets');
      presetsLabel.textContent = I18n.t('effects.presets');
      content.appendChild(presetsLabel);
    }

    const presets = [
      { id: 'grayscale',    label: 'effects.grayscale' },
      { id: 'sepia',        label: 'effects.sepia' },
      { id: 'silver',       label: 'effects.silver' },
      { id: 'noir',         label: 'effects.noir' },
      { id: 'invert',       label: 'effects.invert' },
      { id: 'vivid',        label: 'effects.vivid' },
      { id: 'pop',          label: 'effects.pop' },
      { id: 'fade',         label: 'effects.fade' },
      { id: 'pastel',       label: 'effects.pastel' },
      { id: 'matte',        label: 'effects.matte' },
      { id: 'vintage',      label: 'effects.vintage' },
      { id: 'filmcamera',   label: 'effects.filmcamera' },
      { id: 'disposable',   label: 'effects.disposable' },
      /* Color negative */
      { id: 'portra',       label: 'effects.portra' },
      { id: 'portra160',    label: 'effects.portra160' },
      { id: 'portra400',    label: 'effects.portra400' },
      { id: 'portra800',    label: 'effects.portra800' },
      { id: 'ektar',        label: 'effects.ektar' },
      { id: 'gold200',      label: 'effects.gold200' },
      { id: 'ultramax',     label: 'effects.ultramax' },
      { id: 'colorplus',    label: 'effects.colorplus' },
      { id: 'fuji400h',     label: 'effects.fuji400h' },
      { id: 'pro400h',      label: 'effects.pro400h' },
      { id: 'superia',      label: 'effects.superia' },
      { id: 'agfacolor',    label: 'effects.agfacolor' },
      { id: 'lomochrome',   label: 'effects.lomochrome' },
      /* Slide */
      { id: 'kodachrome',   label: 'effects.kodachrome' },
      { id: 'kodachrome25', label: 'effects.kodachrome25' },
      { id: 'kodachrome64', label: 'effects.kodachrome64' },
      { id: 'ektachrome',   label: 'effects.ektachrome' },
      { id: 'velvia',       label: 'effects.velvia' },
      { id: 'velvia50',     label: 'effects.velvia50' },
      { id: 'velvia100',    label: 'effects.velvia100' },
      { id: 'provia',       label: 'effects.provia' },
      { id: 'sensia',       label: 'effects.sensia' },
      { id: 'astia',        label: 'effects.astia' },
      { id: 'slide',        label: 'effects.slide' },
      /* B&W */
      { id: 'trix',         label: 'effects.trix' },
      { id: 'trix400',      label: 'effects.trix400' },
      { id: 'hp5',          label: 'effects.hp5' },
      { id: 'delta100',     label: 'effects.delta100' },
      { id: 'delta3200',    label: 'effects.delta3200' },
      { id: 'panf',         label: 'effects.panf' },
      { id: 'neopan',       label: 'effects.neopan' },
      { id: 'tmax100',      label: 'effects.tmax100' },
      { id: 'tmax400',      label: 'effects.tmax400' },
      { id: 'xp2',          label: 'effects.xp2' },
      { id: 'plusx',        label: 'effects.plusx' },
      { id: 'fomapan',      label: 'effects.fomapan' },
      /* Instant / toy */
      { id: 'polaroid',     label: 'effects.polaroid' },
      { id: 'sx70',         label: 'effects.sx70' },
      { id: 'instax',       label: 'effects.instax' },
      { id: 'holga',        label: 'effects.holga' },
      { id: 'diana',        label: 'effects.diana' },
      { id: 'lomo',         label: 'effects.lomo' },
      { id: 'sprocket',     label: 'effects.sprocket' },
      /* Cinema */
      { id: 'cinestill',    label: 'effects.cinestill' },
      { id: 'cinestill800t', label: 'effects.cinestill800t' },
      { id: 'vision3500t',  label: 'effects.vision3500t' },
      { id: 'vision3250d',  label: 'effects.vision3250d' },
      /* Process */
      { id: 'expired',      label: 'effects.expired' },
      { id: 'expiredcool',  label: 'effects.expiredcool' },
      { id: 'redscale',     label: 'effects.redscale' },
      { id: 'crossprocess', label: 'effects.crossprocess' },
      { id: 'crossfuji',    label: 'effects.crossfuji' },
      { id: 'bleachbypass', label: 'effects.bleachbypass' },
      { id: 'filmPush2',    label: 'effects.filmPush2' },
      { id: 'filmPull1',    label: 'effects.filmPull1' },
      { id: 'nightflash',   label: 'effects.nightflash' },
      { id: 'halfFrame',    label: 'effects.halfFrame' },
      { id: 'doubleExp',    label: 'effects.doubleExp' },
      { id: 'dramatic',     label: 'effects.dramatic' },
      { id: 'warm',         label: 'effects.warmPreset' },
      { id: 'golden',       label: 'effects.golden' },
      { id: 'sunset',       label: 'effects.sunset' },
      { id: 'autumn',       label: 'effects.autumn' },
      { id: 'spring',       label: 'effects.spring' },
      { id: 'dusk',         label: 'effects.dusk' },
      { id: 'cool',         label: 'effects.cool' },
      { id: 'arctic',       label: 'effects.arctic' },
      { id: 'moonlight',    label: 'effects.moonlight' },
      { id: 'fog',          label: 'effects.fog' },
      { id: 'dream',        label: 'effects.dream' },
      { id: 'orton',        label: 'effects.orton' },
      { id: 'cyanotype',    label: 'effects.cyanotype' },
      { id: 'tealorange',   label: 'effects.tealorange' },
      { id: 'neon',         label: 'effects.neon' },
      { id: 'chrome',       label: 'effects.chrome' },
      { id: 'hdr',          label: 'effects.hdr' },
      { id: 'infrared',     label: 'effects.infrared' },
      { id: 'nightvision',  label: 'effects.nightvision' },
      { id: 'tungsten',     label: 'effects.tungsten' },
      { id: 'fluorescent',  label: 'effects.fluorescent' },
      { id: 'retro70',      label: 'effects.retro70' },
      { id: 'retro80',      label: 'effects.retro80' },
      { id: 'soft',         label: 'effects.soft' },
      { id: 'haze',         label: 'effects.haze' },
      { id: 'crisp',        label: 'effects.crisp' },
      { id: 'clarity',      label: 'effects.clarity' },
      { id: 'bleach',       label: 'effects.bleach' },
      { id: 'highkey',      label: 'effects.highkey' },
      { id: 'lowkey',       label: 'effects.lowkey' },
      { id: 'documentary',  label: 'effects.documentary' },
      { id: 'newspaper',    label: 'effects.newspaper' },
      { id: 'sketch',       label: 'effects.sketch' },
      { id: 'comic',        label: 'effects.comic' },
      { id: 'xray',         label: 'effects.xray' },
      { id: 'emboss',       label: 'effects.emboss' },
      { id: 'edge',         label: 'effects.edge' },
      { id: 'solarize',     label: 'effects.solarize' },
      { id: 'underwater',   label: 'effects.underwater' },
      { id: 'desert',       label: 'effects.desert' },
      { id: 'forest',       label: 'effects.forest' },
      { id: 'lavender',     label: 'effects.lavender' },
      { id: 'candy',        label: 'effects.candy' },
      { id: 'midnight',     label: 'effects.midnight' },
      { id: 'thermal',      label: 'effects.thermal' },
      { id: 'blueprint',    label: 'effects.blueprint' },
      { id: 'selenium',     label: 'effects.selenium' },
      { id: 'platinum',     label: 'effects.platinum' },
      { id: 'lith',         label: 'effects.lith' },
      { id: 'washout',      label: 'effects.washout' },
      { id: 'muted',        label: 'effects.muted' },
      { id: 'cyberpunk',    label: 'effects.cyberpunk' },
      { id: 'vaporwave',    label: 'effects.vaporwave' },
      { id: 'charcoal',     label: 'effects.charcoal' },
      { id: 'ink',          label: 'effects.ink' },
      { id: 'dayfornight',  label: 'effects.dayfornight' },
      { id: 'bloom',        label: 'effects.bloom' },
      { id: 'punch',        label: 'effects.punch' },
      { id: 'flat',         label: 'effects.flat' },
      { id: 'winter',       label: 'effects.winter' },
      { id: 'summer',       label: 'effects.summer' },
      { id: 'rainy',        label: 'effects.rainy' },
      { id: 'peach',        label: 'effects.peach' },
      { id: 'coral',        label: 'effects.coral' },
      { id: 'emerald',      label: 'effects.emerald' },
      { id: 'amethyst',     label: 'effects.amethyst' },
      { id: 'copper',       label: 'effects.copper' },
      { id: 'denim',        label: 'effects.denim' },
      { id: 'olive',        label: 'effects.olive' },
      { id: 'gothic',       label: 'effects.gothic' },
      { id: 'romance',      label: 'effects.romance' },
      { id: 'duotone',      label: 'effects.duotone' },
      { id: 'glitch',       label: 'effects.glitch' },
      { id: 'watercolor',   label: 'effects.watercolor' },
      { id: 'anime',        label: 'effects.anime' },
      { id: 'silhouette',   label: 'effects.silhouette' },
      { id: 'amber',        label: 'effects.amber' },
      { id: 'mint',         label: 'effects.mint' },
      { id: 'mustard',      label: 'effects.mustard' },
      { id: 'steel',        label: 'effects.steel' },
      { id: 'push',         label: 'effects.push' },
      { id: 'pull',         label: 'effects.pull' },
      { id: 'midcentury',   label: 'effects.midcentury' },
      { id: 'horror',       label: 'effects.horror' },
      { id: 'miniature',    label: 'effects.miniature' },
    ];

    const presetWrap = document.createElement('div');
    presetWrap.className = 'effect-presets';
    presets.forEach(p => {
      const btn = document.createElement('button');
      btn.className = 'preset-btn';
      btn.setAttribute('data-i18n', p.label);
      btn.textContent = I18n.t(p.label);
      btn.dataset.preset = p.id;
      if (activePreset === p.id) btn.classList.add('active');
      btn.addEventListener('click', () => {
        _clearPresetActive(idPrefix);
        btn.classList.add('active');
        Editor.applyPreset(p.id);
        _syncSlidersFromEffects(idPrefix);
      });
      presetWrap.appendChild(btn);
    });
    content.appendChild(presetWrap);

    if (mode === 'presets') return;

    const divEl = document.createElement('hr');
    divEl.style.cssText = 'border:none;border-top:1px solid var(--border);margin:8px 0';
    content.appendChild(divEl);

    _appendAdjustControls(content, idPrefix, sliders, prevValues);
  }

  function _appendAdjustControls(content, idPrefix, sliders, prevValues) {
    const efx = Editor.getEffects?.() || {};
    for (const s of sliders) {
      const group = document.createElement('div');
      group.className = 'effect-group';

      const lbl = document.createElement('span');
      lbl.className = 'effect-label';
      lbl.setAttribute('data-i18n', s.label);
      lbl.textContent = I18n.t(s.label);
      lbl.title = I18n.t(s.label);

      const initial = prevValues[s.key] != null
        ? prevValues[s.key]
        : (efx[s.key] != null ? efx[s.key] : s.def);

      const slider = document.createElement('input');
      slider.type  = 'range';
      slider.className = 'effect-slider';
      slider.id    = `${idPrefix}-${s.key}`;
      slider.min   = s.min; slider.max = s.max; slider.step = s.step;
      slider.value = initial;
      slider.setAttribute('aria-label', I18n.t(s.label));

      const valSpan = document.createElement('span');
      valSpan.className = 'effect-value';
      valSpan.id = `${idPrefix}-val-${s.key}`;
      valSpan.textContent = initial;

      // Live preview while dragging — image only, no progress overlay / history
      slider.addEventListener('input', () => {
        const v = parseFloat(slider.value);
        valSpan.textContent = v;
        Editor.setEffect(s.key, v, false);
      });
      // Commit history when the user releases the slider
      slider.addEventListener('change', () => {
        const v = parseFloat(slider.value);
        valSpan.textContent = v;
        Editor.setEffect(s.key, v, true);
        _clearPresetActive(idPrefix);
      });
      // Wheel over wide sliders should scroll the panel, not nudge the value
      _bindEffectSliderWheel(slider);

      group.appendChild(lbl);
      group.appendChild(slider);
      group.appendChild(valSpan);
      content.appendChild(group);
    }

    _appendBorderControls(content, idPrefix, efx, prevValues);
  }

  /** Prefer scrolling the effects panel over changing range values with the mouse wheel. */
  function _bindEffectSliderWheel(slider) {
    if (!slider) return;
    slider.addEventListener('wheel', (e) => {
      const scroller = slider.closest('#edit-adjust-content, #edit-effects-content, #effects-content');
      if (!scroller) return;
      e.preventDefault();
      e.stopPropagation();
      scroller.scrollTop += e.deltaY;
    }, { passive: false });
  }

  function _captionGps(tags) {
    const signedLat = _pickTag(tags, ['latitude', 'Latitude']);
    const signedLon = _pickTag(tags, ['longitude', 'Longitude']);
    const lat = signedLat != null
      ? _toDecimalGps(signedLat)
      : _toDecimalGps(_pickTag(tags, ['GPSLatitude']), _pickTag(tags, ['GPSLatitudeRef']));
    const lon = signedLon != null
      ? _toDecimalGps(signedLon)
      : _toDecimalGps(_pickTag(tags, ['GPSLongitude']), _pickTag(tags, ['GPSLongitudeRef']));
    return _fmtGps(lat, lon) || '';
  }

  function _borderCaptionValues() {
    const filePath = state.currentFile;
    const name = filePath ? filePath.split(/[/\\]/).pop() : '';
    const dims = Editor.getPhotoDimensions ? Editor.getPhotoDimensions() : Editor.getDimensions();
    const w = dims.w || 0;
    const h = dims.h || 0;
    const ext = filePath ? FormatSupport.getExtension(filePath).toUpperCase() : '';
    const tags = (state.imageMeta && state.imageMeta.tags) || {};
    const iso = _fmtIso(_pickTag(tags, ['PhotographicSensitivity', 'ISO', 'ISOSpeedRatings']));
    const exposure = _fmtExposureTime(_pickTag(tags, ['ExposureTime', 'ShutterSpeedValue'])) || '';
    const aperture = _fmtAperture(_pickTag(tags, ['FNumber', 'ApertureValue'])) || '';
    const isoText = iso ? `ISO ${iso}` : '';
    const shot = [exposure, aperture, isoText].filter(Boolean).join('  ');
    const city = _fmtMetaScalar(_pickTag(tags, ['City', 'Location', 'SubLocation'])) || '';
    const country = _fmtMetaScalar(_pickTag(tags, ['Country', 'CountryName', 'CountryCode'])) || '';
    const place = [city, country].filter(Boolean).join(', ');
    return {
      file: name,
      size: (w && h) ? `${w} × ${h}` : '',
      format: ext,
      date: _fmtMetaDate(_pickTag(tags, ['DateTimeOriginal', 'CreateDate', 'DateTime'])) || '',
      camera: _fmtCamera(tags) || '',
      lens: _fmtMetaScalar(_pickTag(tags, ['LensModel', 'LensMake', 'LensID', 'LensInfo'])) || '',
      exposure,
      aperture,
      iso: isoText,
      focal: _fmtFocalMm(_pickTag(tags, ['FocalLength'])) || '',
      shot,
      gps: _captionGps(tags),
      altitude: _fmtAltitude(_pickTag(tags, ['GPSAltitude'])) || '',
      city: place,
      flash: _fmtMetaScalar(_pickTag(tags, ['Flash'])) || '',
      artist: _fmtMetaScalar(_pickTag(tags, ['Artist', 'Creator', 'OwnerName'])) || '',
      copyright: _fmtMetaScalar(_pickTag(tags, ['Copyright'])) || '',
    };
  }

  function _defaultCaptionTemplate() {
    return '{file}  ·  {size}  ·  {format}  ·  {date}  ·  {camera}  ·  {shot}  ·  {gps}';
  }

  function _refreshBorderCaption() {
    const values = _borderCaptionValues();
    if (Editor.setCaptionValues) Editor.setCaptionValues(values);
    if (Editor.setCaptionLines) {
      Editor.setCaptionLines([values.file, values.size, values.format, values.date].filter(Boolean));
    }
    document.querySelectorAll('.effect-token[data-token]').forEach((btn) => {
      btn.disabled = !values[btn.dataset.token];
    });
  }

  function _captionFontGroupLabel(group) {
    const map = {
      kr: 'effects.fontGroup.kr',
      sans: 'effects.fontGroup.sans',
      serif: 'effects.fontGroup.serif',
      mono: 'effects.fontGroup.mono',
      display: 'effects.fontGroup.display',
      script: 'effects.fontGroup.script',
      system: 'effects.fontGroup.system',
    };
    const key = map[group];
    return key ? I18n.t(key) : group;
  }

  function _fillCaptionFontSelect(sel, selectedId) {
    if (!sel) return;
    const fonts = (typeof Editor !== 'undefined' && Editor.getCaptionFonts)
      ? Editor.getCaptionFonts()
      : [];
    const order = ['kr', 'sans', 'serif', 'mono', 'display', 'script', 'system'];
    const byGroup = new Map();
    fonts.forEach((f) => {
      const g = f.group || 'sans';
      if (!byGroup.has(g)) byGroup.set(g, []);
      byGroup.get(g).push(f);
    });
    sel.innerHTML = '';
    const want = String(selectedId || 'Segoe UI');
    let found = false;
    order.forEach((g) => {
      const list = byGroup.get(g);
      if (!list || !list.length) return;
      const og = document.createElement('optgroup');
      og.label = _captionFontGroupLabel(g);
      og.dataset.group = g;
      list.forEach((f) => {
        const opt = document.createElement('option');
        opt.value = f.id;
        opt.textContent = f.label || f.id;
        if (f.id === want) { opt.selected = true; found = true; }
        og.appendChild(opt);
      });
      sel.appendChild(og);
    });
    // Preserve a previously chosen system font not in the catalog yet
    if (!found && want) {
      let sys = sel.querySelector('optgroup[data-group="system"]');
      if (!sys) {
        sys = document.createElement('optgroup');
        sys.label = _captionFontGroupLabel('system');
        sys.dataset.group = 'system';
        sel.appendChild(sys);
      }
      const opt = document.createElement('option');
      opt.value = want;
      opt.textContent = want;
      opt.selected = true;
      sys.appendChild(opt);
    }
  }

  function _fontFamilyAvailable(name) {
    try {
      if (!document.fonts || typeof document.fonts.check !== 'function') return true;
      const q = `"${String(name).replace(/"/g, '')}"`;
      return document.fonts.check(`12px ${q}`) || document.fonts.check(`12px ${name}`);
    } catch {
      return true;
    }
  }

  async function _enrichCaptionFontSelect(sel, selectedId) {
    if (!sel) return;
    const existing = new Set([...sel.querySelectorAll('option')].map((o) => o.value));
    const extras = [];

    // Probe additional common Korean / CJK names
    [
      'HY견고딕', 'HY중고딕', 'HY궁서', 'HY그래픽', 'HY얕은샘물',
      '새굴림', '휴먼명조', '휴먼고딕', '함초롬돋움', '함초롬바탕',
      '본고딕', '본명조', 'Spoqa Han Sans Neo', 'KoPubWorldDotum', 'KoPubWorldBatang',
      'Apple SD Gothic Neo', 'AppleGothic', 'AppleMyungjo',
      'Hiragino Sans', 'Hiragino Mincho ProN', 'PingFang SC', 'PingFang TC',
    ].forEach((name) => {
      if (!existing.has(name) && _fontFamilyAvailable(name)) extras.push(name);
    });

    // Local font query (Chromium / Electron) when permitted
    try {
      if (typeof window.queryLocalFonts === 'function') {
        const local = await window.queryLocalFonts();
        const skip = /emoji|symbol|wingding|webding|marlett|mt extra|bookshel|segoe mdl2|fluent icons|math|noto color/i;
        for (const f of local) {
          const family = f.family;
          if (!family || existing.has(family) || skip.test(family)) continue;
          extras.push(family);
          existing.add(family);
        }
      }
    } catch {
      // Permission denied or unsupported — curated list is enough
    }

    // Unique + sort
    const uniq = [...new Set(extras)].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    if (!uniq.length) return;

    let sys = sel.querySelector('optgroup[data-group="system"]');
    if (!sys) {
      sys = document.createElement('optgroup');
      sys.label = _captionFontGroupLabel('system');
      sys.dataset.group = 'system';
      sel.appendChild(sys);
    }
    const want = String(selectedId || '');
    uniq.forEach((name) => {
      if ([...sys.querySelectorAll('option')].some((o) => o.value === name)) return;
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      if (name === want) opt.selected = true;
      sys.appendChild(opt);
    });
  }

  function _appendBorderControls(content, idPrefix, efx, prevValues) {
    const hr = document.createElement('hr');
    hr.style.cssText = 'border:none;border-top:1px solid var(--border);margin:10px 0 8px';
    content.appendChild(hr);

    const heading = document.createElement('div');
    heading.className = 'effect-section-title';
    heading.setAttribute('data-i18n', 'effects.border');
    heading.textContent = I18n.t('effects.border');
    content.appendChild(heading);

    const widthDef = prevValues.borderWidth != null ? prevValues.borderWidth : (efx.borderWidth ?? 0);
    const shadowDef = prevValues.borderShadow != null ? prevValues.borderShadow : (efx.borderShadow ?? 0);
    const styleDef = prevValues.borderShadowStyle || efx.borderShadowStyle || 'soft';
    const dirDef = prevValues.borderShadowDir || efx.borderShadowDir || 'br';
    const colorDef = efx.borderColor || '#ffffff';
    const capDef = !!efx.borderCaption;
    const posDef = efx.borderCaptionPos || 'bl';
    const textDef = prevValues.borderCaptionText != null
      ? prevValues.borderCaptionText
      : (efx.borderCaptionText || _defaultCaptionTemplate());
    const fontDef = prevValues.borderCaptionFont || efx.borderCaptionFont || 'Segoe UI';
    const fontSizeDef = prevValues.borderCaptionFontSize != null
      ? prevValues.borderCaptionFontSize
      : (efx.borderCaptionFontSize ?? 12);
    const fontColorDef = prevValues.borderCaptionColor != null
      ? prevValues.borderCaptionColor
      : (efx.borderCaptionColor || '');

    const fmtPx = (v) => `${v}px`;

    const addSlider = (key, labelKey, min, max, step, initial, { applyOnRelease = false, unit = '' } = {}) => {
      const group = document.createElement('div');
      group.className = 'effect-group';
      const lbl = document.createElement('span');
      lbl.className = 'effect-label';
      lbl.setAttribute('data-i18n', labelKey);
      lbl.textContent = I18n.t(labelKey);
      lbl.title = I18n.t(labelKey);
      const slider = document.createElement('input');
      slider.type = 'range';
      slider.className = 'effect-slider';
      slider.id = `${idPrefix}-${key}`;
      slider.min = min; slider.max = max; slider.step = step;
      slider.value = initial;
      slider.setAttribute('aria-label', I18n.t(labelKey));
      const valSpan = document.createElement('span');
      valSpan.className = 'effect-value';
      valSpan.id = `${idPrefix}-val-${key}`;
      valSpan.dataset.unit = unit;
      valSpan.textContent = unit === 'px' ? fmtPx(initial) : initial;
      slider.addEventListener('input', () => {
        const v = parseFloat(slider.value);
        valSpan.textContent = unit === 'px' ? fmtPx(v) : v;
        if (applyOnRelease) return;
        Editor.setEffect(key, v, false);
        _refreshBorderCaption();
      });
      slider.addEventListener('change', () => {
        const v = parseFloat(slider.value);
        valSpan.textContent = unit === 'px' ? fmtPx(v) : v;
        Editor.setEffect(key, v, true);
        _refreshBorderCaption();
        if (state.editMode) requestAnimationFrame(() => _ewFit());
      });
      _bindEffectSliderWheel(slider);
      group.appendChild(lbl);
      group.appendChild(slider);
      group.appendChild(valSpan);
      content.appendChild(group);
    };

    const addSelect = (key, labelKey, options, initial, onChange) => {
      const row = document.createElement('div');
      row.className = 'effect-label-row effect-extra-row';
      const lbl = document.createElement('span');
      lbl.className = 'effect-label';
      lbl.setAttribute('data-i18n', labelKey);
      lbl.textContent = I18n.t(labelKey);
      const sel = document.createElement('select');
      sel.className = 'effect-select';
      sel.id = `${idPrefix}-${key}`;
      options.forEach(([val, i18nKey, rawLabel]) => {
        const opt = document.createElement('option');
        opt.value = val;
        if (i18nKey) {
          opt.setAttribute('data-i18n', i18nKey);
          opt.textContent = I18n.t(i18nKey);
        } else {
          opt.textContent = rawLabel || val;
        }
        if (val === initial) opt.selected = true;
        sel.appendChild(opt);
      });
      sel.addEventListener('change', () => onChange(sel));
      row.appendChild(lbl);
      row.appendChild(sel);
      content.appendChild(row);
      return sel;
    };

    addSlider('borderWidth', 'effects.borderWidth', 0, 480, 1, widthDef, { applyOnRelease: true, unit: 'px' });

    const colorRow = document.createElement('div');
    colorRow.className = 'effect-label-row effect-extra-row';
    const colorLbl = document.createElement('span');
    colorLbl.className = 'effect-label';
    colorLbl.setAttribute('data-i18n', 'effects.borderColor');
    colorLbl.textContent = I18n.t('effects.borderColor');
    const colorInp = document.createElement('input');
    colorInp.type = 'color';
    colorInp.className = 'effect-color';
    colorInp.id = `${idPrefix}-borderColor`;
    colorInp.value = /^#[0-9a-f]{6}$/i.test(colorDef) ? colorDef : '#ffffff';
    colorInp.addEventListener('input', () => {
      Editor.setEffect('borderColor', colorInp.value);
    });
    colorRow.appendChild(colorLbl);
    colorRow.appendChild(colorInp);
    content.appendChild(colorRow);

    addSelect('borderShadowStyle', 'effects.borderShadowStyle', [
      ['soft', 'effects.shadow.soft'],
      ['inset', 'effects.shadow.inset'],
      ['raised', 'effects.shadow.raised'],
      ['bevel', 'effects.shadow.bevel'],
      ['groove', 'effects.shadow.groove'],
      ['line', 'effects.shadow.line'],
      ['glow', 'effects.shadow.glow'],
      ['double', 'effects.shadow.double'],
    ], styleDef, (sel) => {
      Editor.setEffect('borderShadowStyle', sel.value);
    });
    addSelect('borderShadowDir', 'effects.borderShadowDir', [
      ['br', 'effects.shadowDir.br'],
      ['b', 'effects.shadowDir.b'],
      ['bl', 'effects.shadowDir.bl'],
      ['r', 'effects.shadowDir.r'],
      ['l', 'effects.shadowDir.l'],
      ['tr', 'effects.shadowDir.tr'],
      ['t', 'effects.shadowDir.t'],
      ['tl', 'effects.shadowDir.tl'],
      ['c', 'effects.shadowDir.c'],
    ], dirDef, (sel) => {
      Editor.setEffect('borderShadowDir', sel.value);
    });
    addSlider('borderShadow', 'effects.borderShadow', 0, 48, 1, shadowDef, { applyOnRelease: true, unit: 'px' });

    const capRow = document.createElement('label');
    capRow.className = 'effect-check-row';
    const capInp = document.createElement('input');
    capInp.type = 'checkbox';
    capInp.id = `${idPrefix}-borderCaption`;
    capInp.checked = capDef;
    capInp.addEventListener('change', () => {
      _refreshBorderCaption();
      if (capInp.checked && !String(Editor.getEffects().borderCaptionText || '').trim()) {
        Editor.setEffect('borderCaptionText', _defaultCaptionTemplate(), false);
        const ta = document.getElementById(`${idPrefix}-borderCaptionText`);
        if (ta) ta.value = _defaultCaptionTemplate();
      }
      Editor.setEffect('borderCaption', capInp.checked);
      if (state.editMode) requestAnimationFrame(() => _ewFit());
    });
    const capLbl = document.createElement('span');
    capLbl.setAttribute('data-i18n', 'effects.borderCaption');
    capLbl.textContent = I18n.t('effects.borderCaption');
    capRow.appendChild(capInp);
    capRow.appendChild(capLbl);
    content.appendChild(capRow);

    addSelect('borderCaptionPos', 'effects.borderCaptionPos', [
      ['tl', 'effects.pos.tl'], ['tc', 'effects.pos.tc'], ['tr', 'effects.pos.tr'],
      ['l', 'effects.pos.l'], ['r', 'effects.pos.r'],
      ['bl', 'effects.pos.bl'], ['bc', 'effects.pos.bc'], ['br', 'effects.pos.br'],
    ], posDef, (sel) => {
      Editor.setEffect('borderCaptionPos', sel.value);
    });

    const fontHeading = document.createElement('div');
    fontHeading.className = 'effect-caption-hint';
    fontHeading.setAttribute('data-i18n', 'effects.borderCaptionFontSection');
    fontHeading.textContent = I18n.t('effects.borderCaptionFontSection');
    content.appendChild(fontHeading);

    const fontRow = document.createElement('div');
    fontRow.className = 'effect-label-row effect-extra-row';
    const fontLbl = document.createElement('span');
    fontLbl.className = 'effect-label';
    fontLbl.setAttribute('data-i18n', 'effects.borderCaptionFont');
    fontLbl.textContent = I18n.t('effects.borderCaptionFont');
    const fontSel = document.createElement('select');
    fontSel.className = 'effect-select effect-select-font';
    fontSel.id = `${idPrefix}-borderCaptionFont`;
    fontSel.setAttribute('aria-label', I18n.t('effects.borderCaptionFont'));
    _fillCaptionFontSelect(fontSel, fontDef);
    fontSel.addEventListener('change', () => {
      Editor.setEffect('borderCaptionFont', fontSel.value);
    });
    fontRow.appendChild(fontLbl);
    fontRow.appendChild(fontSel);
    content.appendChild(fontRow);
    _enrichCaptionFontSelect(fontSel, fontDef);

    addSlider('borderCaptionFontSize', 'effects.borderCaptionFontSize', 6, 120, 1, fontSizeDef, {
      unit: 'px',
    });

    const fontColorRow = document.createElement('div');
    fontColorRow.className = 'effect-label-row effect-extra-row';
    const fontColorLbl = document.createElement('span');
    fontColorLbl.className = 'effect-label';
    fontColorLbl.setAttribute('data-i18n', 'effects.borderCaptionColor');
    fontColorLbl.textContent = I18n.t('effects.borderCaptionColor');
    const fontColorWrap = document.createElement('div');
    fontColorWrap.className = 'effect-font-color-wrap';
    const fontColorAuto = document.createElement('label');
    fontColorAuto.className = 'effect-mini-check';
    const autoInp = document.createElement('input');
    autoInp.type = 'checkbox';
    autoInp.id = `${idPrefix}-borderCaptionColorAuto`;
    autoInp.checked = !/^#[0-9a-f]{6}$/i.test(fontColorDef);
    const autoTxt = document.createElement('span');
    autoTxt.setAttribute('data-i18n', 'effects.borderCaptionColorAuto');
    autoTxt.textContent = I18n.t('effects.borderCaptionColorAuto');
    fontColorAuto.appendChild(autoInp);
    fontColorAuto.appendChild(autoTxt);
    const fontColorInp = document.createElement('input');
    fontColorInp.type = 'color';
    fontColorInp.className = 'effect-color';
    fontColorInp.id = `${idPrefix}-borderCaptionColor`;
    fontColorInp.value = /^#[0-9a-f]{6}$/i.test(fontColorDef) ? fontColorDef : '#222222';
    fontColorInp.disabled = autoInp.checked;
    const applyFontColor = () => {
      if (autoInp.checked) {
        fontColorInp.disabled = true;
        Editor.setEffect('borderCaptionColor', '');
      } else {
        fontColorInp.disabled = false;
        Editor.setEffect('borderCaptionColor', fontColorInp.value);
      }
    };
    autoInp.addEventListener('change', applyFontColor);
    fontColorInp.addEventListener('input', () => {
      if (!autoInp.checked) Editor.setEffect('borderCaptionColor', fontColorInp.value);
    });
    fontColorWrap.appendChild(fontColorAuto);
    fontColorWrap.appendChild(fontColorInp);
    fontColorRow.appendChild(fontColorLbl);
    fontColorRow.appendChild(fontColorWrap);
    content.appendChild(fontColorRow);

    const styleRow = document.createElement('div');
    styleRow.className = 'effect-label-row effect-extra-row';
    const styleLbl = document.createElement('span');
    styleLbl.className = 'effect-label';
    styleLbl.setAttribute('data-i18n', 'effects.borderCaptionStyle');
    styleLbl.textContent = I18n.t('effects.borderCaptionStyle');
    const styleBtns = document.createElement('div');
    styleBtns.className = 'effect-font-style-row';
    [
      ['borderCaptionBold', 'B', 'effects.borderCaptionBold', 'font-weight:700'],
      ['borderCaptionItalic', 'I', 'effects.borderCaptionItalic', 'font-style:italic'],
      ['borderCaptionUnderline', 'U', 'effects.borderCaptionUnderline', 'text-decoration:underline'],
      ['borderCaptionStrike', 'S', 'effects.borderCaptionStrike', 'text-decoration:line-through'],
    ].forEach(([key, glyph, i18nKey, cssHint]) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'effect-font-style-btn';
      btn.id = `${idPrefix}-${key}`;
      btn.setAttribute('data-i18n-title', i18nKey);
      btn.title = I18n.t(i18nKey);
      btn.textContent = glyph;
      btn.style.cssText = cssHint;
      if (efx[key]) btn.classList.add('is-on');
      btn.addEventListener('click', () => {
        const on = !btn.classList.contains('is-on');
        btn.classList.toggle('is-on', on);
        Editor.setEffect(key, on);
      });
      styleBtns.appendChild(btn);
    });
    styleRow.appendChild(styleLbl);
    styleRow.appendChild(styleBtns);
    content.appendChild(styleRow);

    const fieldsLbl = document.createElement('div');
    fieldsLbl.className = 'effect-caption-hint';
    fieldsLbl.setAttribute('data-i18n', 'effects.borderCaptionFields');
    fieldsLbl.textContent = I18n.t('effects.borderCaptionFields');
    content.appendChild(fieldsLbl);

    const tokens = document.createElement('div');
    tokens.className = 'effect-token-row';
    const values = _borderCaptionValues();
    [
      ['file', 'effects.token.file'],
      ['size', 'effects.token.size'],
      ['format', 'effects.token.format'],
      ['date', 'effects.token.date'],
      ['camera', 'effects.token.camera'],
      ['lens', 'effects.token.lens'],
      ['shot', 'effects.token.shot'],
      ['exposure', 'effects.token.exposure'],
      ['aperture', 'effects.token.aperture'],
      ['iso', 'effects.token.iso'],
      ['focal', 'effects.token.focal'],
      ['gps', 'effects.token.gps'],
      ['altitude', 'effects.token.altitude'],
      ['city', 'effects.token.city'],
      ['flash', 'effects.token.flash'],
      ['artist', 'effects.token.artist'],
      ['copyright', 'effects.token.copyright'],
    ].forEach(([key, i18nKey]) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'effect-token';
      btn.setAttribute('data-i18n', i18nKey);
      btn.dataset.token = key;
      btn.textContent = I18n.t(i18nKey);
      btn.disabled = !values[key];
      btn.addEventListener('click', () => {
        const ta = document.getElementById(`${idPrefix}-borderCaptionText`);
        if (!ta) return;
        const insert = `{${key}}`;
        const start = ta.selectionStart ?? ta.value.length;
        const end = ta.selectionEnd ?? start;
        const before = ta.value.slice(0, start);
        const after = ta.value.slice(end);
        const needSep = before && !/\s$/.test(before) && !/·\s*$/.test(before);
        const chunk = `${needSep ? '  ·  ' : ''}${insert}`;
        ta.value = `${before}${chunk}${after}`;
        const caret = before.length + chunk.length;
        ta.focus();
        ta.setSelectionRange(caret, caret);
        Editor.setEffect('borderCaptionText', ta.value, false);
        Editor.setEffect('borderCaption', true, false);
        capInp.checked = true;
        _refreshBorderCaption();
      });
      tokens.appendChild(btn);
    });
    content.appendChild(tokens);

    const textLbl = document.createElement('div');
    textLbl.className = 'effect-caption-hint';
    textLbl.setAttribute('data-i18n', 'effects.borderCaptionText');
    textLbl.textContent = I18n.t('effects.borderCaptionText');
    content.appendChild(textLbl);

    const ta = document.createElement('textarea');
    ta.className = 'effect-caption-text';
    ta.id = `${idPrefix}-borderCaptionText`;
    ta.rows = 3;
    ta.value = textDef;
    ta.addEventListener('input', () => {
      Editor.setEffect('borderCaptionText', ta.value, false);
      if (ta.value.trim() && !capInp.checked) {
        capInp.checked = true;
        Editor.setEffect('borderCaption', true, false);
        if (state.editMode) requestAnimationFrame(() => _ewFit());
      }
      _refreshBorderCaption();
    });
    ta.addEventListener('change', () => {
      Editor.setEffect('borderCaptionText', ta.value);
    });
    content.appendChild(ta);
  }

  function _syncSlidersFromEffects(idPrefix = 'eff') {
    const efx = Editor.getEffects();
    const pxKeys = new Set(['borderWidth', 'borderShadow', 'borderCaptionFontSize']);
    for (const key in efx) {
      const slider = document.getElementById(`${idPrefix}-${key}`);
      const valEl  = document.getElementById(`${idPrefix}-val-${key}`);
      if (slider && slider.type === 'range') slider.value = efx[key];
      if (valEl) {
        const unit = valEl.dataset.unit || (pxKeys.has(key) ? 'px' : '');
        valEl.textContent = unit === 'px' ? `${efx[key]}px` : efx[key];
      }
    }
    const color = document.getElementById(`${idPrefix}-borderColor`);
    if (color && efx.borderColor) color.value = efx.borderColor;
    const style = document.getElementById(`${idPrefix}-borderShadowStyle`);
    if (style && efx.borderShadowStyle) style.value = efx.borderShadowStyle;
    const dir = document.getElementById(`${idPrefix}-borderShadowDir`);
    if (dir && efx.borderShadowDir) dir.value = efx.borderShadowDir;
    const cap = document.getElementById(`${idPrefix}-borderCaption`);
    if (cap) cap.checked = !!efx.borderCaption;
    const pos = document.getElementById(`${idPrefix}-borderCaptionPos`);
    if (pos && efx.borderCaptionPos) pos.value = efx.borderCaptionPos;
    const font = document.getElementById(`${idPrefix}-borderCaptionFont`);
    if (font && efx.borderCaptionFont) font.value = efx.borderCaptionFont;
    const fontColor = document.getElementById(`${idPrefix}-borderCaptionColor`);
    const fontColorAuto = document.getElementById(`${idPrefix}-borderCaptionColorAuto`);
    if (fontColorAuto) {
      const auto = !/^#[0-9a-f]{6}$/i.test(String(efx.borderCaptionColor || ''));
      fontColorAuto.checked = auto;
      if (fontColor) {
        fontColor.disabled = auto;
        if (!auto) fontColor.value = efx.borderCaptionColor;
      }
    }
    for (const key of ['borderCaptionBold', 'borderCaptionItalic', 'borderCaptionUnderline', 'borderCaptionStrike']) {
      const btn = document.getElementById(`${idPrefix}-${key}`);
      if (btn) btn.classList.toggle('is-on', !!efx[key]);
    }
    const text = document.getElementById(`${idPrefix}-borderCaptionText`);
    if (text && efx.borderCaptionText != null && document.activeElement !== text) {
      text.value = efx.borderCaptionText;
    }
  }

  function _resetEffects() {
    Editor.resetEffects();
    _syncSlidersFromEffects('eff');
    document.getElementById('effects-content')?.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
  }

  function _toggleEffectsPanel() {
    // Effects belong to image edit mode — open the editor instead of a side sheet for A/V
    if (!_isEditableImage()) return;
    if (!state.editMode) {
      _openEditWindow();
      return;
    }
    state.effectsPanelVisible = !state.effectsPanelVisible;
    if (state.effectsPanelVisible) {
      effectsPanel.classList.add('visible');
    } else {
      effectsPanel.classList.remove('visible');
    }
  }

  /* ════════════════════════════════════════════
     Edit Window
  ════════════════════════════════════════════ */
  const editWindow     = document.getElementById('edit-window');
  const editCanvasArea = document.getElementById('edit-canvas-area');

  async function _openEditWindow() {
    if (!_isEditableImage()) return;
    if (state.editMode) return;

    // Animated GIF/WebP: freeze current frame into the canvas editor
    if (state.isAnimated && !Editor.isLoaded()) {
      const ok = await _rasterizeAnimatedToEditor();
      if (!ok) return;
    }

    if (window.electronAPI.windowGetBounds) {
      try { _savedMainBounds = await window.electronAPI.windowGetBounds(); }
      catch { _savedMainBounds = null; }
    }

    // Build the effects panel inside the edit window (first time)
    _buildEditEffectsPanel();

    // Move image-wrapper into edit canvas area
    editCanvasArea.appendChild(imageWrapper);

    editWindow.classList.add('visible');
    state.editMode = true;
    document.body.classList.add('edit-mode');
    _updateMediaControlsVisibility();
    document.getElementById('edit-window-title').textContent =
      (state.currentFile ? state.currentFile.split(/[/\\]/).pop() + ' — ' : '') +
      I18n.t('editWindow.title');

    Editor.clearSelection();
    _setTool('pointer');
    _ewSetTool('pointer');
    _ewUpdateSelBtns();
    _updateUndoRedoBtns();
    _refreshBorderCaption();
    state._editDirtyAtOpen = state.isDirty;
    Editor.beginEditSession();

    // Wire icons on first open
    _initEditWindowOnce();

    requestAnimationFrame(() => {
      requestAnimationFrame(async () => {
        const minW = _editMinWidth();
        _appliedMinWidth = minW;
        try {
          const height = Math.max(600, _savedMainBounds?.height || 600);
          if (window.electronAPI.windowApplySize) {
            await window.electronAPI.windowApplySize({
              width: minW,
              height,
              minWidth: minW,
              minHeight: 600,
            });
          } else {
            window.electronAPI.windowSetMinSize?.(minW, 600);
          }
        } catch (e) {
          console.warn('edit window size:', e);
        }
        _ewFit();
      });
    });
  }

  async function _requestCloseEditWindow(apply) {
    if (!state.editMode && !editWindow.classList.contains('visible')) {
      _closeEditWindow(apply);
      return true;
    }
    // Cancel / Esc: discard the edit session quietly.
    // Apply: bake into the viewer; file-save prompt only happens later on app quit if still dirty.
    // (Unapplied edit previews are not treated as unsaved file changes.)
    _closeEditWindow(!!apply);
    return true;
  }

  function _closeEditWindow(apply) {
    if (!state.editMode && !editWindow.classList.contains('visible')) {
      // still ensure wrapper is in viewer
      if (imageWrapper && !viewerContainer.contains(imageWrapper)) {
        viewerContainer.appendChild(imageWrapper);
      }
      return;
    }

    const hadSessionChanges = !!(Editor.hasEditSessionChanges && Editor.hasEditSessionChanges());

    editWindow.classList.remove('visible');
    state.editMode = false;
    document.body.classList.remove('edit-mode');

    // Move image-wrapper back to main viewer container
    viewerContainer.appendChild(imageWrapper);

    if (apply) {
      Editor.commitEditSession();
      // Only now is the main image considered changed (prompt on app quit if not saved)
      if (hadSessionChanges) _markDirty();
      // Edits bake a still frame — stop treating as live animation
      if (state.isAnimated) {
        state.isAnimated = false;
        state.animatedDataUrl = null;
        _hideAnimatedImage();
        displayCanvas.style.display = 'block';
        selCanvas.style.display = 'block';
      }
    } else {
      Editor.revertEditSession();
      _syncSlidersFromEffects('eff');
      _syncSlidersFromEffects('ew-eff');
      document.getElementById('effects-content')?.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
      document.getElementById('edit-effects-content')?.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
      if (!state._editDirtyAtOpen) _clearDirty();
      if (state.isAnimated && FormatSupport.isAnimatedImage(state.currentFile || '')) {
        _restoreAnimatedView();
      }
    }
    state._editDirtyAtOpen = undefined;

    Editor.clearSelection();
    _ewSetTool('pointer');
    _setTool('pointer');

    // Fit image in main viewer
    if (_isEditableImage()) _fitToWindow();
    _updateToolbarForMedia();
    _updateNavButtons();
    _updateUndoRedoBtns();

    const saved = _savedMainBounds;
    _savedMainBounds = null;
    requestAnimationFrame(() => {
      const minW = _mainMinWidth();
      _appliedMinWidth = minW;
      if (saved && !saved.maximized && window.electronAPI.windowApplySize) {
        window.electronAPI.windowApplySize({
          width: saved.width,
          height: saved.height,
          minWidth: minW,
          minHeight: 600,
        });
      } else {
        window.electronAPI.windowSetMinSize?.(minW, 600);
      }
      if (_isEditableImage()) _fitToWindow();
    });
  }

  let _ewInitDone = false;
  let _ewZoom = 1, _ewPanX = 0, _ewPanY = 0;
  let _ewPanning = false, _ewPanStartX = 0, _ewPanStartY = 0, _ewPanOriginX = 0, _ewPanOriginY = 0;

  const _ewToolIconMap = [
    { id:'ew-tool-pointer', tool:'pointer',    icon:'pointer',    tip:'toolbar.toolPointer' },
    { id:'ew-tool-rect',    tool:'rect-select',icon:'rectSelect', tip:'toolbar.toolRect' },
    { id:'ew-tool-lasso',   tool:'lasso',      icon:'lasso',      tip:'toolbar.toolLasso' },
    { id:'ew-tool-polygon', tool:'polygon',    icon:'polygon',    tip:'toolbar.toolPolygon' },
    { id:'ew-tool-magic',   tool:'magic-wand', icon:'magicWand',  tip:'toolbar.toolMagic' },
  ];
  const _ewActionIconMap = [
    ['ew-cut',       'cut',         'context.cut',          () => _ewCut()],
    ['ew-copy',      'copy',        'context.copy',         () => _ewCopy()],
    ['ew-bg-remove', 'bgRemove',    'toolbar.bgRemove',     () => { _removeBackground(); }],
    ['ew-crop-sel',  'fitWindow',   'editWindow.cropSel',   () => { Editor.cropToSelection(); _ewUpdateSelBtns(); _updateUndoRedoBtns(); _ewFit(); }],
    ['ew-clear-sel', 'close',       'editWindow.clearSel',  () => { Editor.clearSelection(); _ewUpdateSelBtns(); }],
    ['ew-save-new',  'saveAs',      'editWindow.saveNew',   () => { _saveAsNewFile(); }],
    ['ew-rotate-l',  'rotateLeft',  'toolbar.rotateLeft',   () => { Editor.rotate(-90); _ewFit(); _updateUndoRedoBtns(); }],
    ['ew-rotate-r',  'rotateRight', 'toolbar.rotateRight',  () => { Editor.rotate(90);  _ewFit(); _updateUndoRedoBtns(); }],
    ['ew-flip-h',    'flipH',       'toolbar.flipH',        () => { Editor.flip('h'); _updateUndoRedoBtns(); }],
    ['ew-flip-v',    'flipV',       'toolbar.flipV',        () => { Editor.flip('v'); _updateUndoRedoBtns(); }],
    ['ew-undo',      'undo',        'editWindow.undo',      () => { Editor.undo(); _updateUndoRedoBtns(); }],
    ['ew-redo',      'redo',        'editWindow.redo',      () => { Editor.redo(); _updateUndoRedoBtns(); }],
    ['ew-zoom-in',   'zoomIn',      'toolbar.zoomIn',       () => _ewZoomBy(1.25)],
    ['ew-zoom-out',  'zoomOut',     'toolbar.zoomOut',      () => _ewZoomBy(0.8)],
    ['ew-fit',       'fitWindow',   'toolbar.fitWindow',    () => _ewFit()],
  ];

  function _applyEditWindowIcons() {
    _ewToolIconMap.forEach(({ id, icon }) => {
      const btn = document.getElementById(id);
      if (btn) btn.innerHTML = Icons[icon] || '';
    });
    _ewActionIconMap.forEach(([id, icon]) => {
      const btn = document.getElementById(id);
      if (btn) btn.innerHTML = Icons[icon] || '';
    });
  }

  function _initEditWindowOnce() {
    _applyEditWindowIcons();
    if (_ewInitDone) return;
    _ewInitDone = true;
    _lockBarScroll(document.getElementById('edit-window-titlebar'));

    _ewToolIconMap.forEach(({ id, tool, tip }) => {
      const btn = document.getElementById(id);
      if (!btn) return;
      btn.addEventListener('click', () => _ewSetTool(tool));
      Tooltip.attach(btn, () => I18n.t(tip));
    });

    _ewActionIconMap.forEach(([id, , tip, action]) => {
      const btn = document.getElementById(id);
      if (!btn) return;
      btn.addEventListener('click', (e) => {
        if (btn.classList.contains('is-disabled') || btn.getAttribute('aria-disabled') === 'true') {
          e.preventDefault();
          return;
        }
        action();
      });
      Tooltip.attach(btn, () => I18n.t(tip));
    });

    _syncEditThemeLangBtns();
    document.getElementById('ew-theme')?.addEventListener('click', () => { _toggleTheme(); });
    document.getElementById('ew-lang')?.addEventListener('click', () => { _toggleLang(); });
    Tooltip.attach(document.getElementById('ew-theme'), () => I18n.t('toolbar.theme'));
    Tooltip.attach(document.getElementById('ew-lang'), () => I18n.t('toolbar.lang'));

    _populateBgAlgoSelect();
    document.getElementById('ew-bg-algo')?.addEventListener('change', (e) => {
      localStorage.setItem('bgRemoveAlgo', e.target.value);
    });

    // Apply / Cancel
    document.getElementById('ew-save')?.addEventListener('click', () => { _saveAsNewFile(); });
    Tooltip.attach(document.getElementById('ew-save'), () => I18n.t('editWindow.saveNew'));
    document.getElementById('ew-apply')?.addEventListener('click', () => _requestCloseEditWindow(true));
    document.getElementById('ew-cancel')?.addEventListener('click', () => _requestCloseEditWindow(false));

    // Magic wand tolerance
    const tolInput = document.getElementById('ew-tolerance');
    tolInput?.addEventListener('input', () => Editor.setMagicTolerance(parseInt(tolInput.value) || 32));

    // Edit window canvas area pan/zoom
    editCanvasArea.addEventListener('wheel', (e) => {
      e.preventDefault();
      _ewZoomBy(e.deltaY < 0 ? 1.1 : 0.9);
    }, { passive: false });

    editCanvasArea.addEventListener('mousedown', (e) => {
      if (Editor.getTool() !== 'pointer') return;
      if (e.button !== 0 && e.button !== 1) return;
      _ewPanning = true;
      _ewPanStartX = e.clientX; _ewPanStartY = e.clientY;
      _ewPanOriginX = _ewPanX; _ewPanOriginY = _ewPanY;
      editCanvasArea.style.cursor = 'grabbing';
    });
    window.addEventListener('mousemove', (e) => {
      if (!_ewPanning) return;
      _ewPanX = _ewPanOriginX + (e.clientX - _ewPanStartX);
      _ewPanY = _ewPanOriginY + (e.clientY - _ewPanStartY);
      _ewApplyTransform();
    });
    window.addEventListener('mouseup', () => {
      if (_ewPanning) {
        _ewPanning = false;
        editCanvasArea.style.cursor = Editor.getTool() === 'pointer' ? 'grab' : 'crosshair';
      }
    });

    // Selection context menu in edit window
    editCanvasArea.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      _showEditContextMenu(e.clientX, e.clientY);
    });

    // Edit-window reset effects button
    document.getElementById('edit-effects-reset-btn')?.addEventListener('click', () => {
      Editor.resetEffects();
      _syncSlidersFromEffects('ew-eff');
      document.getElementById('edit-effects-content')?.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
    });
  }

  function _ewSetTool(tool) {
    Editor.setTool(tool);
    ['ew-tool-pointer','ew-tool-rect','ew-tool-lasso','ew-tool-polygon','ew-tool-magic'].forEach(id => {
      document.getElementById(id)?.classList.remove('active');
    });
    const toolBtnMap = { 'pointer':'ew-tool-pointer','rect-select':'ew-tool-rect','lasso':'ew-tool-lasso','polygon':'ew-tool-polygon','magic-wand':'ew-tool-magic' };
    document.getElementById(toolBtnMap[tool])?.classList.add('active');

    const tolWrap = document.getElementById('ew-tolerance-wrap');
    if (tolWrap) tolWrap.style.display = tool === 'magic-wand' ? 'flex' : 'none';

    editCanvasArea.classList.remove('drag-mode','select-mode');
    if (tool === 'pointer') {
      editCanvasArea.classList.add('drag-mode');
      editCanvasArea.style.cursor = 'grab';
      selCanvas.style.cursor = 'grab';
    } else {
      editCanvasArea.classList.add('select-mode');
      editCanvasArea.style.cursor = 'crosshair';
      selCanvas.style.cursor = 'crosshair';
    }
  }

  function _ewUpdateSelBtns() {
    const hasSel = Editor.hasSelection();
    ['ew-cut','ew-copy','ew-crop-sel','ew-clear-sel'].forEach(id => {
      _setChromeBtn(document.getElementById(id), hasSel);
    });
  }

  function _ewFit() {
    const { w, h } = Editor.getDimensions();
    if (!w || !h) return;
    _wantFit = true;
    _ewZoom = _fitZoomFor(editCanvasArea, w, h);
    state.zoom = _ewZoom;
    _ewPanX = 0; _ewPanY = 0;
    _ewFitW = w; _ewFitH = h;
    _ewApplyTransform();
    _updateZoomDisplay();
    _updateStatus({ zoom: true });
  }

  function _ewZoomBy(factor) {
    _wantFit = false;
    _ewZoom = Math.min(Math.max(_ewZoom * factor, 0.02), 32);
    state.zoom = _ewZoom;
    _ewApplyTransform();
    _updateZoomDisplay();
    _updateStatus({ zoom: true });
  }

  function _ewApplyTransform() {
    const dims = Editor.getDimensions();
    const { w, h } = dims;
    const cw = editCanvasArea.clientWidth, ch = editCanvasArea.clientHeight;
    const scaledW = w * _ewZoom, scaledH = h * _ewZoom;
    if (scaledW <= cw) _ewPanX = 0;
    else { const m=(scaledW-cw)/2; _ewPanX=Math.max(-m,Math.min(m,_ewPanX)); }
    if (scaledH <= ch) _ewPanY = 0;
    else { const m=(scaledH-ch)/2; _ewPanY=Math.max(-m,Math.min(m,_ewPanY)); }
    _placeImageWrapper(editCanvasArea, _ewPanX, _ewPanY, _ewZoom, dims);
  }

  if (typeof ResizeObserver !== 'undefined') {
    const _viewRo = new ResizeObserver(() => {
      if (_wantFit) {
        if (state.editMode) _ewFit();
        else _fitToWindow();
      } else if (state.editMode) {
        _ewApplyTransform();
      } else {
        _applyTransform();
      }
    });
    if (viewerContainer) _viewRo.observe(viewerContainer);
    if (editCanvasArea) _viewRo.observe(editCanvasArea);
  }

  async function _ewCut() {
    const dataUrl = Editor.cut();
    _ewUpdateSelBtns();
    _updateUndoRedoBtns();
    if (dataUrl) {
      try {
        const res = await fetch(dataUrl);
        const blob = await res.blob();
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      } catch(e) { _showError(I18n.t('error.clipboardCut') || 'Failed to cut to clipboard.', e); }
    }
  }

  async function _ewCopy() {
    const dataUrl = Editor.copySelection();
    if (dataUrl) {
      try {
        const res = await fetch(dataUrl);
        const blob = await res.blob();
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      } catch(e) { _showError(I18n.t('error.clipboardCopy') || 'Failed to copy to clipboard.', e); }
    }
  }

  function _showEditContextMenu(x, y) {
    const hasSel = Editor.hasSelection();
    const t = I18n.t.bind(I18n);
    ContextMenu.show(x, y, [
      { icon: Icons.saveAs || Icons.save, label: t('editWindow.saveNew'), action: () => { _saveAsNewFile(); } },
      { separator: true },
      { icon: Icons.cut,      label: t('context.cut'),      disabled: !hasSel, action: _ewCut },
      { icon: Icons.copy,     label: t('context.copy'),     disabled: !hasSel, action: _ewCopy },
      { separator: true },
      { icon: Icons.bgRemove, label: t('toolbar.bgRemove'), action: () => { _removeBackground(); } },
      { icon: Icons.fitWindow, label: t('editWindow.cropSel'), disabled: !hasSel, action: () => { Editor.cropToSelection(); _ewUpdateSelBtns(); _updateUndoRedoBtns(); _ewFit(); } },
      { icon: Icons.close,  label: t('editWindow.clearSel'),disabled: !hasSel, action: () => { Editor.clearSelection(); _ewUpdateSelBtns(); } },
      { separator: true },
      { icon: Icons.rotateLeft,  label: t('menu.rotateLeft'),  action: () => { Editor.rotate(-90); _ewFit(); _updateUndoRedoBtns(); } },
      { icon: Icons.rotateRight, label: t('menu.rotateRight'), action: () => { Editor.rotate(90);  _ewFit(); _updateUndoRedoBtns(); } },
      { icon: Icons.flipH,       label: t('menu.flipHorizontal'), action: () => Editor.flip('h') },
      { icon: Icons.flipV,       label: t('menu.flipVertical'),   action: () => Editor.flip('v') },
      { separator: true },
      { icon: Icons.undo, label: t('editWindow.undo'), disabled: !Editor.canUndo(), action: () => { Editor.undo(); _updateUndoRedoBtns(); } },
      { icon: Icons.redo,  label: t('editWindow.redo'), disabled: !Editor.canRedo(), action: () => { Editor.redo(); _updateUndoRedoBtns(); } },
      { separator: true },
      { icon: Icons.effects, label: t('effects.reset'), action: () => { Editor.resetEffects(); _syncSlidersFromEffects('ew-eff'); document.getElementById('edit-effects-content')?.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active')); } },
    ]);
  }

  function _buildEditEffectsPanel() {
    _buildEffectsPanelIn('edit-effects-content', 'ew-eff', 'presets');
    _buildEffectsPanelIn('edit-adjust-content', 'ew-eff', 'adjust');
    _ewEffectsBuilt = true;
  }

  /* Effects panel buttons */
  document.getElementById('effects-close-btn')?.addEventListener('click', _toggleEffectsPanel);
  document.getElementById('effects-reset-btn')?.addEventListener('click', _resetEffects);
  document.getElementById('effects-apply-btn')?.addEventListener('click', () => {
    // Effects are already live; "apply" bakes them into workingPixels
    // (optional enhancement)
    _toggleEffectsPanel();
  });

  /* ════════════════════════════════════════════
     Save As
  ════════════════════════════════════════════ */
  /* ════════════════════════════════════════════
     Dirty (unsaved changes) tracking
  ════════════════════════════════════════════ */
  function _markDirty() {
    // Edit-window previews are session-local until Apply — don't flag the file unsaved yet
    if (state.editMode) return;
    if (!state.isDirty) {
      state.isDirty = true;
      window.electronAPI.setUnsavedChanges(true);
      _updateTitleBar();
    }
  }

  function _clearDirty() {
    if (state.isDirty) {
      state.isDirty = false;
      window.electronAPI.setUnsavedChanges(false);
      _updateTitleBar();
    }
  }

  function _updateTitleBar() {
    const base = state.currentFile
      ? state.currentFile.split(/[/\\]/).pop()
      : I18n.t('app.title');
    document.title = state.isDirty ? `● ${base}` : base;
  }

  async function _saveEditedAs(andClose = false) {
    return _saveAs(andClose, { useChangedName: true });
  }

  async function _saveAsNewFile() {
    if (!_isEditableImage()) return false;
    if (Editor.hasSelection && Editor.hasSelection()) {
      Editor.cropToSelection();
      _ewUpdateSelBtns();
      _updateUndoRedoBtns();
      if (state.editMode) _ewFit();
    }
    return _saveAs(false, { useChangedName: true });
  }

  /**
   * Default save name for edited images: e.g. photo_변경.png
   * Suffix comes from i18n (`save.changedSuffix`, default "변경").
   * The Save dialog lets the user edit this name before confirming.
   */
  async function _getEditedSaveDefaultPath() {
    const suffix = (I18n.t('save.changedSuffix') || '변경').trim() || '변경';
    const srcPath = state.currentFile || '';
    const srcName = srcPath ? srcPath.split(/[/\\]/).pop() : '';
    const srcExt = srcName.includes('.') ? srcName.split('.').pop().toLowerCase() : '';
    const isHeicSrc = FormatSupport.isHeic(srcPath);

    let stem = srcName ? srcName.replace(/\.[^.]+$/, '') : 'image';
    const suffixRe = new RegExp(`[_-]${suffix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
    if (!suffixRe.test(stem)) {
      stem = `${stem}_${suffix}`;
    }
    const fileName = isHeicSrc ? `${stem}.jpg` : `${stem}.png`;

    if (srcPath && window.electronAPI?.pathDirname && window.electronAPI?.pathJoin) {
      try {
        const dir = await window.electronAPI.pathDirname(srcPath);
        if (dir) return await window.electronAPI.pathJoin(dir, fileName);
      } catch (_) { /* fall through */ }
    }
    return fileName;
  }

  async function _saveAs(andClose = false, opts = {}) {
    if (!_isEditableImage()) return false;

    const useChangedName = opts.useChangedName === true || state.editMode === true || state.isDirty === true;

    let defaultPath;
    if (useChangedName) {
      defaultPath = await _getEditedSaveDefaultPath();
    } else {
      const srcName = state.currentFile
        ? state.currentFile.split(/[/\\]/).pop()
        : '';
      const srcExt = srcName.includes('.') ? srcName.split('.').pop().toLowerCase() : '';
      const isHeicSrc = FormatSupport.isHeic(srcName);
      const stem = srcName ? srcName.replace(/\.[^.]+$/, '') : 'image';
      defaultPath = isHeicSrc ? `${stem}.jpg` : `${stem}.png`;
    }

    const dlgResult = await window.FileDialog.save({ defaultPath });
    if (!dlgResult || dlgResult.canceled || !dlgResult.filePath) return false;

    const savePath = dlgResult.filePath;
    const ext = savePath.split('.').pop().toLowerCase();
    const fmtMap = { jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', bmp: 'image/bmp' };
    const format  = fmtMap[ext] || 'image/png';
    const quality = (format === 'image/jpeg' || format === 'image/webp') ? 0.92 : undefined;

    const dataUrl = quality !== undefined
      ? Editor.exportAsDataUrl(format, quality)
      : Editor.exportAsDataUrl(format);

    if (!dataUrl) return false;

    const writeResult = await window.electronAPI.writeFile({ filePath: savePath, dataUrl });
    if (writeResult && writeResult.success) {
      _clearDirty();
      const msg = I18n.t('status.saved') || `Saved: ${savePath.split(/[/\\]/).pop()}`;
      _updateStatus({ msg });
      try { await FileTree.refresh(); } catch (_) { /* ignore */ }
      await window.electronAPI.showMessageBox({
        type: 'info',
        title: I18n.t('dialog.save.title') || 'Saved',
        message: I18n.t('dialog.save.success') || 'File saved successfully.',
        detail: savePath,
        buttons: ['OK'],
      });
      if (andClose) window.electronAPI.closeWindow();
      return true;
    } else {
      await _showError(
        I18n.t('dialog.save.error') || 'Could not save the file.',
        writeResult?.error || ''
      );
      return false;
    }
  }

  /* ════════════════════════════════════════════
     Info Panel
  ════════════════════════════════════════════ */
  function _escHtml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function _pickTag(tags, keys) {
    if (!tags) return null;
    for (const k of keys) {
      const v = tags[k];
      if (v == null || v === '') continue;
      if (Array.isArray(v) && !v.length) continue;
      return v;
    }
    return null;
  }

  function _fmtMetaScalar(v) {
    if (v == null) return '';
    if (typeof v === 'boolean') return v ? 'Yes' : 'No';
    if (typeof v === 'number') {
      if (!Number.isFinite(v)) return '';
      if (Number.isInteger(v)) return String(v);
      return String(Math.round(v * 10000) / 10000);
    }
    if (Array.isArray(v)) return v.map(_fmtMetaScalar).filter(Boolean).join(', ');
    if (typeof v === 'object') {
      return Object.entries(v)
        .map(([k, val]) => {
          const s = _fmtMetaScalar(val);
          return s ? `${k}: ${s}` : '';
        })
        .filter(Boolean)
        .join('; ');
    }
    const s = String(v).replace(/\0/g, '').trim();
    return s.length > 4000 ? `${s.slice(0, 3997)}…` : s;
  }

  function _fmtExposureTime(v) {
    if (v == null) return null;
    if (typeof v === 'string') {
      const s = v.trim();
      if (!s) return null;
      return /s\b/i.test(s) ? s : `${s} s`;
    }
    if (Array.isArray(v) && v.length >= 2 && Number(v[1])) {
      return _fmtExposureTime(Number(v[0]) / Number(v[1]));
    }
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) return _fmtMetaScalar(v) || null;
    if (n >= 1) return `${n % 1 === 0 ? n : n.toFixed(1)} s`;
    return `1/${Math.max(1, Math.round(1 / n))} s`;
  }

  function _fmtAperture(v) {
    if (v == null) return null;
    if (typeof v === 'string') {
      const s = v.trim();
      if (!s) return null;
      return /^f\/?/i.test(s) ? s.replace(/^f(?!\/)/i, 'f/') : `f/${s}`;
    }
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) return _fmtMetaScalar(v) || null;
    return `f/${n % 1 === 0 ? n : n.toFixed(1)}`;
  }

  function _fmtFocalMm(v) {
    if (v == null) return null;
    if (typeof v === 'string') return /mm\b/i.test(v) ? v : `${v} mm`;
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) return _fmtMetaScalar(v) || null;
    return `${n % 1 === 0 ? n : n.toFixed(1)} mm`;
  }

  function _fmtIso(v) {
    if (v == null) return null;
    if (Array.isArray(v)) v = v[0];
    const n = Number(v);
    if (Number.isFinite(n)) return String(Math.round(n));
    return _fmtMetaScalar(v) || null;
  }

  function _fmtBias(v) {
    if (v == null) return null;
    const n = Number(v);
    if (!Number.isFinite(n)) return _fmtMetaScalar(v) || null;
    if (n === 0) return '0 EV';
    return `${n > 0 ? '+' : ''}${n} EV`;
  }

  function _toDecimalGps(coord, ref) {
    if (coord == null) return null;
    if (typeof coord === 'number' && Number.isFinite(coord)) return coord;
    if (Array.isArray(coord) && coord.length >= 2) {
      const d = Number(coord[0]) || 0;
      const m = Number(coord[1]) || 0;
      const s = Number(coord[2]) || 0;
      let dec = d + m / 60 + s / 3600;
      const r = String(ref || '').toUpperCase();
      if (r === 'S' || r === 'W') dec = -Math.abs(dec);
      return dec;
    }
    const n = Number(coord);
    return Number.isFinite(n) ? n : null;
  }

  function _fmtGps(lat, lon) {
    if (lat == null || lon == null) return null;
    const la = Number(lat);
    const lo = Number(lon);
    if (!Number.isFinite(la) || !Number.isFinite(lo)) return `${_fmtMetaScalar(lat)}, ${_fmtMetaScalar(lon)}`;
    const ns = la >= 0 ? 'N' : 'S';
    const ew = lo >= 0 ? 'E' : 'W';
    return `${Math.abs(la).toFixed(6)}° ${ns}, ${Math.abs(lo).toFixed(6)}° ${ew}`;
  }

  function _fmtAltitude(v) {
    if (v == null) return null;
    const n = Number(v);
    if (!Number.isFinite(n)) return _fmtMetaScalar(v) || null;
    return `${n.toFixed(1)} m`;
  }

  /** Map sharp/libvips depth names (e.g. uchar) to bit size display. */
  function _fmtBitDepth(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number' && Number.isFinite(v)) return `${v} bit`;
    const key = String(v).trim().toLowerCase();
    const map = {
      uchar: 8, char: 8,
      ushort: 16, short: 16,
      uint: 32, int: 32, float: 32,
      double: 64, complex: 64,
      dpcomplex: 128,
    };
    if (map[key] != null) return `${map[key]} bit`;
    const m = key.match(/^(\d+)\s*-?\s*bit/);
    if (m) return `${m[1]} bit`;
    const n = Number(key);
    if (Number.isFinite(n) && n > 0) return `${n} bit`;
    return null;
  }

  function _fmtMetaDate(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'string') {
      const iso = v.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3').replace(' ', 'T');
      const d = new Date(iso);
      if (!Number.isNaN(d.getTime())) return FormatSupport.formatDate(d.toISOString());
      return v;
    }
    return _fmtMetaScalar(v) || null;
  }

  function _fmtCamera(tags) {
    const make  = _fmtMetaScalar(_pickTag(tags, ['Make']));
    const model = _fmtMetaScalar(_pickTag(tags, ['Model']));
    if (!make && !model) return null;
    if (make && model) {
      const m = model.toLowerCase();
      const k = make.toLowerCase();
      if (m.startsWith(k) || m.includes(k)) return model;
      return `${make} ${model}`;
    }
    return make || model;
  }

  function _humanizeTagKey(key) {
    return String(key)
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/[_-]+/g, ' ')
      .replace(/\bGps\b/gi, 'GPS')
      .replace(/\bIso\b/gi, 'ISO')
      .replace(/\bIptc\b/gi, 'IPTC')
      .replace(/\bXmp\b/gi, 'XMP')
      .replace(/\bIcc\b/gi, 'ICC')
      .replace(/\bJfif\b/gi, 'JFIF')
      .replace(/\bIfd0\b/gi, 'IFD0')
      .replace(/\bExif\b/gi, 'EXIF');
  }

  function _pushRow(rows, labelKey, value) {
    if (value == null || value === '') return;
    rows.push({ label: I18n.t(labelKey), value: String(value) });
  }

  function _isBinaryMeta(v) {
    return ArrayBuffer.isView(v)
      || (typeof Buffer !== 'undefined' && Buffer.isBuffer && Buffer.isBuffer(v));
  }

  function _sanitizeDicomMeta(meta) {
    if (!meta || typeof meta !== 'object') return null;
    const skip = new Set(['pixelData', 'pixelBytes', 'jpegBytes']);
    const out = {};
    for (const [k, v] of Object.entries(meta)) {
      if (skip.has(k) || _isBinaryMeta(v)) continue;
      if (v == null || v === '') continue;
      if (typeof v === 'number' && !Number.isFinite(v)) continue;
      out[k] = v;
    }
    return Object.keys(out).length ? out : null;
  }

  function _skipDumpKey(key) {
    return /^(Image\.|.*\.(ExifIFD|GpsIFD|InteropIFD)$|ExifIFD$|GpsIFD$|InteropIFD$|ThumbnailOffset$|ThumbnailLength$)/i.test(key);
  }

  function _dumpValue(raw) {
    if (raw == null || raw === '' || raw === false) return '';
    if (_isBinaryMeta(raw)) return '';
    return _fmtMetaScalar(raw);
  }

  function _fmtDuration(sec) {
    if (sec == null || sec === '') return null;
    const n = Number(sec);
    if (!Number.isFinite(n) || n < 0) return _fmtMetaScalar(sec);
    const total = Math.round(n);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const pad = (v) => String(v).padStart(2, '0');
    const base = h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
    return `${base} (${n.toFixed(n < 10 ? 2 : 1)} s)`;
  }

  function _fmtBitrate(bps, estimated) {
    if (bps == null || bps === '') return null;
    const n = Number(bps);
    if (!Number.isFinite(n) || n <= 0) return _fmtMetaScalar(bps);
    let s;
    if (n >= 1e6) s = `${(n / 1e6).toFixed(2)} Mbps`;
    else if (n >= 1e3) s = `${Math.round(n / 1e3)} kbps`;
    else s = `${Math.round(n)} bps`;
    return estimated ? `${s} (${I18n.t('info.estimated')})` : s;
  }

  function _fmtSampleRate(hz) {
    if (hz == null || hz === '') return null;
    const n = Number(hz);
    if (!Number.isFinite(n) || n <= 0) return _fmtMetaScalar(hz);
    if (n >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)} kHz`;
    return `${Math.round(n)} Hz`;
  }

  function _fmtFrameRate(fps) {
    if (fps == null || fps === '') return null;
    const n = Number(fps);
    if (!Number.isFinite(n) || n <= 0) return _fmtMetaScalar(fps);
    return `${Number.isInteger(n) ? n : n.toFixed(2)} fps`;
  }

  function _fmtAudioChannels(n) {
    if (n == null || n === '') return null;
    const c = Number(n);
    if (!Number.isFinite(c) || c <= 0) return _fmtMetaScalar(n);
    if (c === 1) return `1 (${I18n.t('info.mono')})`;
    if (c === 2) return `2 (${I18n.t('info.stereo')})`;
    if (c === 6) return '6 (5.1)';
    if (c === 8) return '8 (7.1)';
    return String(c);
  }

  function _fmtContainerLabel(ext, format) {
    if (!format) return ext;
    const f = String(format).trim();
    if (!f) return ext;
    if (f.toUpperCase() === String(ext).toUpperCase()) return ext;
    // Avoid "MP4 (MP4)" style after container cleanup
    if (f.replace(/\s+/g, '').toUpperCase() === String(ext).toUpperCase()) return ext;
    return `${ext} (${f})`;
  }

  function _yesNo(v) {
    if (v === true) return I18n.t('info.yes');
    if (v === false) return I18n.t('info.no');
    return null;
  }

  function _viewerInfoDims(basic) {
    if (Editor.isLoaded()) {
      const d = Editor.getDimensions();
      if (d.w && d.h) return d;
    }
    if (state.isAnimated) {
      const d = _getViewerDims();
      if (d.w && d.h) return d;
    }
    if (state.isVideo && videoEl) {
      const w = videoEl.videoWidth || 0;
      const h = videoEl.videoHeight || 0;
      if (w && h) return { w, h };
    }
    return {
      w: basic.width || 0,
      h: basic.height || 0,
    };
  }

  function _collectInfoSections(filePath, stats, meta, dicomMeta) {
    const isDicom = FormatSupport.isDcm(filePath);
    const isAv = !!(state.isVideo || state.isAudio || FormatSupport.isVideo(filePath) || FormatSupport.isAudio(filePath));
    const tags  = (!isDicom && meta && meta.tags) ? meta.tags : {};
    const basic = (!isDicom && meta && meta.basic) ? meta.basic : {};
    const ext   = FormatSupport.getExtension(filePath).toUpperCase();
    const name  = filePath.split(/[/\\]/).pop();
    const dims  = _viewerInfoDims(basic);
    const w = dims.w || basic.width;
    const h = dims.h || basic.height;
    const shownKeys = new Set(); // keys already presented — skip in "All metadata"

    const fileRows = [];
    _pushRow(fileRows, 'info.name', name);
    _pushRow(fileRows, 'info.size', stats && !stats.error
      ? `${FormatSupport.formatFileSize(stats.size)} (${stats.size.toLocaleString()} B)`
      : null);
    // Dimensions only for visual media (video / images), not pure audio
    const isAudioOnly = state.isAudio || (basic.mediaKind === 'audio' && !basic.hasVideo
      && !(basic.width && basic.height));
    if (!isAudioOnly) {
      _pushRow(fileRows, 'info.dimensions', w && h ? `${w} × ${h} px` : null);
    }
    _pushRow(fileRows, 'info.format', _fmtContainerLabel(ext, basic.format));
    _pushRow(fileRows, 'info.modified', stats && !stats.error ? FormatSupport.formatDate(stats.modified) : null);
    _pushRow(fileRows, 'info.created', stats && !stats.error ? FormatSupport.formatDate(stats.created) : null);
    _pushRow(fileRows, 'info.accessed', stats && !stats.error && stats.accessed ? FormatSupport.formatDate(stats.accessed) : null);
    _pushRow(fileRows, 'info.changed', stats && !stats.error && stats.changed ? FormatSupport.formatDate(stats.changed) : null);

    const mediaRows = [];
    const tagRows = [];
    if (isAv || basic.duration != null || basic.codec || basic.videoCodec || basic.audioCodec
      || basic.sampleRate != null || basic.bitsPerSample != null) {
      const duration = basic.duration != null
        ? basic.duration
        : (state.isVideo && videoEl && Number.isFinite(videoEl.duration) ? videoEl.duration
          : (state.isAudio && audioEl && Number.isFinite(audioEl.duration) ? audioEl.duration : null));
      let bitrate = basic.bitrate;
      let bitrateEst = !!basic.bitrateEstimated;
      if ((bitrate == null || !(Number(bitrate) > 0)) && duration > 0 && stats && !stats.error && stats.size > 0) {
        bitrate = (stats.size * 8) / duration;
        bitrateEst = true;
      }
      _pushRow(mediaRows, 'info.duration', _fmtDuration(duration));
      _pushRow(mediaRows, 'info.bitrate', _fmtBitrate(bitrate, bitrateEst));
      if (basic.hasVideo || basic.videoCodec || state.isVideo) {
        _pushRow(mediaRows, 'info.frameRate', _fmtFrameRate(basic.frameRate));
        _pushRow(mediaRows, 'info.videoCodec', basic.videoCodec || null);
      }
      _pushRow(mediaRows, 'info.audioCodec', basic.audioCodec || null);
      _pushRow(mediaRows, 'info.codec', (!basic.videoCodec && !basic.audioCodec) ? (basic.codec || null) : null);
      _pushRow(mediaRows, 'info.sampleRate', _fmtSampleRate(basic.sampleRate));
      _pushRow(mediaRows, 'info.audioChannels', _fmtAudioChannels(basic.channels));
      if (basic.bitsPerSample != null && Number(basic.bitsPerSample) > 0) {
        _pushRow(mediaRows, 'info.depth', `${basic.bitsPerSample} bit`);
      }
      _pushRow(mediaRows, 'info.lossless', _yesNo(basic.lossless));

      // Tags belong in their own section for A/V (not under photo Capture)
      _pushRow(tagRows, 'info.mediaTitle', _fmtMetaScalar(_pickTag(tags, ['title', 'Title'])));
      _pushRow(tagRows, 'info.mediaArtist', _fmtMetaScalar(_pickTag(tags, ['artist', 'Artist'])));
      _pushRow(tagRows, 'info.albumArtist', _fmtMetaScalar(_pickTag(tags, ['albumartist', 'AlbumArtist'])));
      _pushRow(tagRows, 'info.mediaAlbum', _fmtMetaScalar(_pickTag(tags, ['album', 'Album'])));
      _pushRow(tagRows, 'info.year', _fmtMetaScalar(_pickTag(tags, ['year', 'date', 'Year'])));
      _pushRow(tagRows, 'info.genre', _fmtMetaScalar(_pickTag(tags, ['genre', 'Genre'])));
      _pushRow(tagRows, 'info.trackNo', _fmtMetaScalar(_pickTag(tags, ['track', 'Track'])));
      _pushRow(tagRows, 'info.composer', _fmtMetaScalar(_pickTag(tags, ['composer', 'Composer'])));
      _pushRow(tagRows, 'info.software', _fmtMetaScalar(_pickTag(tags, ['encoder', 'Encoder', 'Software'])));
      _pushRow(tagRows, 'info.copyright', _fmtMetaScalar(_pickTag(tags, ['copyright', 'Copyright'])));
      _pushRow(tagRows, 'info.description', _fmtMetaScalar(_pickTag(tags, ['comment', 'description', 'Description'])));

      [
        'title', 'artist', 'album', 'albumartist', 'year', 'genre', 'track', 'disk',
        'composer', 'copyright', 'encoder', 'date', 'description', 'comment',
        'duration', 'bitrate', 'sampleRate', 'channels', 'bitsPerSample',
        'codec', 'videoCodec', 'audioCodec', 'frameRate', 'format', 'lossless',
        'width', 'height', 'mediaKind', 'hasAudio', 'hasVideo', 'bitrateEstimated',
        'numberOfSamples', 'blockAlign',
      ].forEach((k) => shownKeys.add(k.toLowerCase()));
    }

    if (!isAv) {
      const colorSpace = _fmtMetaScalar(_pickTag(tags, ['ColorSpace'])) || basic.space || null;
      _pushRow(fileRows, 'info.colorSpace', colorSpace);
      const dpi = _pickTag(tags, ['XResolution', 'YResolution']);
      if (dpi) _pushRow(fileRows, 'info.dpi', _fmtMetaScalar(dpi));
      _pushRow(fileRows, 'info.channels', basic.channels != null ? String(basic.channels) : null);
      _pushRow(fileRows, 'info.depth', _fmtBitDepth(basic.depth));
      _pushRow(fileRows, 'info.alpha', basic.hasAlpha === true ? 'Yes' : null);
      _pushRow(fileRows, 'info.chroma', basic.chromaSubsampling || null);
      _pushRow(fileRows, 'info.compression', basic.compression || null);
      _pushRow(fileRows, 'info.pages', basic.pages != null && basic.pages > 1 ? String(basic.pages) : null);
      _pushRow(fileRows, 'info.profile', basic.hasProfile === true ? 'Yes' : null);
    }

    const captureRows = [];
    const locRows = [];
    const otherRows = [];
    if (!isDicom) {
      if (!isAv) {
        _pushRow(captureRows, 'info.camera', _fmtCamera(tags));
        _pushRow(captureRows, 'info.lens', _fmtMetaScalar(_pickTag(tags, ['LensModel', 'LensMake', 'LensID', 'LensInfo'])));
        _pushRow(captureRows, 'info.taken', _fmtMetaDate(_pickTag(tags, ['DateTimeOriginal', 'CreateDate', 'DateTime'])));
        _pushRow(captureRows, 'info.exposure', _fmtExposureTime(_pickTag(tags, ['ExposureTime', 'ShutterSpeedValue'])));
        _pushRow(captureRows, 'info.aperture', _fmtAperture(_pickTag(tags, ['FNumber', 'ApertureValue'])));
        _pushRow(captureRows, 'info.iso', _fmtIso(_pickTag(tags, ['PhotographicSensitivity', 'ISO', 'ISOSpeedRatings'])));
        _pushRow(captureRows, 'info.focalLength', _fmtFocalMm(_pickTag(tags, ['FocalLength'])));
        _pushRow(captureRows, 'info.focal35', _fmtFocalMm(_pickTag(tags, ['FocalLengthIn35mmFormat', 'FocalLengthIn35mmFilm'])));
        _pushRow(captureRows, 'info.exposureBias', _fmtBias(_pickTag(tags, ['ExposureBiasValue', 'ExposureCompensation', 'ExposureBias'])));
        _pushRow(captureRows, 'info.exposureProgram', _fmtMetaScalar(_pickTag(tags, ['ExposureProgram', 'ExposureMode'])));
        _pushRow(captureRows, 'info.flash', _fmtMetaScalar(_pickTag(tags, ['Flash'])));
        _pushRow(captureRows, 'info.whiteBalance', _fmtMetaScalar(_pickTag(tags, ['WhiteBalance'])));
        _pushRow(captureRows, 'info.metering', _fmtMetaScalar(_pickTag(tags, ['MeteringMode'])));
        _pushRow(captureRows, 'info.orientation', _fmtMetaScalar(_pickTag(tags, ['Orientation'])));
        _pushRow(captureRows, 'info.software', _fmtMetaScalar(_pickTag(tags, ['Software', 'encoder', 'Encoder'])));
        _pushRow(captureRows, 'info.artist', _fmtMetaScalar(_pickTag(tags, ['Artist', 'Creator', 'OwnerName', 'artist'])));
        _pushRow(captureRows, 'info.copyright', _fmtMetaScalar(_pickTag(tags, ['Copyright', 'copyright'])));
        _pushRow(captureRows, 'info.description', _fmtMetaScalar(_pickTag(tags, ['ImageDescription', 'Description', 'Caption', 'CaptionAbstract', 'description', 'comment'])));
        _pushRow(captureRows, 'info.keywords', _fmtMetaScalar(_pickTag(tags, ['Keywords', 'Subject', 'genre'])));

        const signedLat = _pickTag(tags, ['latitude', 'Latitude']);
        const signedLon = _pickTag(tags, ['longitude', 'Longitude']);
        const lat = signedLat != null
          ? _toDecimalGps(signedLat)
          : _toDecimalGps(_pickTag(tags, ['GPSLatitude']), _pickTag(tags, ['GPSLatitudeRef']));
        const lon = signedLon != null
          ? _toDecimalGps(signedLon)
          : _toDecimalGps(_pickTag(tags, ['GPSLongitude']), _pickTag(tags, ['GPSLongitudeRef']));
        _pushRow(locRows, 'info.gps', _fmtGps(lat, lon));
        _pushRow(locRows, 'info.altitude', _fmtAltitude(_pickTag(tags, ['GPSAltitude'])));
        _pushRow(locRows, 'info.city', _fmtMetaScalar(_pickTag(tags, ['City', 'Location', 'SubLocation'])));
        _pushRow(locRows, 'info.country', _fmtMetaScalar(_pickTag(tags, ['Country', 'CountryName', 'CountryCode'])));
      }

      const dump = (meta && meta.all && Object.keys(meta.all).length) ? meta.all : tags;
      for (const [key, raw] of Object.entries(dump)) {
        if (_skipDumpKey(key)) continue;
        const short = key.includes('.') ? key.slice(key.lastIndexOf('.') + 1) : key;
        if (isAv && (shownKeys.has(key.toLowerCase()) || shownKeys.has(short.toLowerCase()))) continue;
        const value = _dumpValue(raw);
        if (!value) continue;
        otherRows.push({ label: key, value, full: true });
      }
      otherRows.sort((a, b) => a.label.localeCompare(b.label));
    }

    const dicomRows = [];
    const cleanDicom = isDicom ? _sanitizeDicomMeta(dicomMeta) : null;
    if (cleanDicom) {
      _pushRow(dicomRows, 'info.patient', cleanDicom.patientName);
      _pushRow(dicomRows, 'info.modality', cleanDicom.modality);
      _pushRow(dicomRows, 'info.studyDate', cleanDicom.studyDate);
      for (const [key, raw] of Object.entries(cleanDicom)) {
        if (['patientName', 'modality', 'studyDate'].includes(key)) continue;
        const value = _dumpValue(raw);
        if (!value) continue;
        dicomRows.push({ label: _humanizeTagKey(key), value, full: true });
      }
    }

    return [
      { titleKey: 'info.section.file',     rows: fileRows },
      { titleKey: 'info.section.media',    rows: mediaRows },
      { titleKey: 'info.section.tags',     rows: tagRows },
      { titleKey: 'info.section.capture',  rows: captureRows },
      { titleKey: 'info.section.location', rows: locRows },
      { titleKey: 'info.section.dicom',    rows: dicomRows },
      { titleKey: 'info.section.other',    rows: otherRows },
    ];
  }

  function _renderInfoSections(sections) {
    return sections.map((sec) => {
      if (!sec.rows.length) return '';
      const header = `<div class="info-section">${_escHtml(I18n.t(sec.titleKey))}</div>`;
      const rows = sec.rows.map((r) =>
        `<div class="info-row${r.full ? ' info-row-full' : ''}">
          <div class="info-label">${_escHtml(r.label)}</div>
          <div class="info-value" title="${_escHtml(r.value)}">${_escHtml(r.value)}</div>
        </div>`
      ).join('');
      return header + rows;
    }).join('');
  }

  async function _ensureImageMeta(filePath, dicomMeta) {
    const fileChanged = state.metaForFile !== filePath;
    if (fileChanged) {
      state.metaForFile = filePath;
      state.imageMeta = null;
      state.dicomMeta = null;
    }
    if (dicomMeta !== undefined) {
      state.dicomMeta = FormatSupport.isDcm(filePath) ? _sanitizeDicomMeta(dicomMeta) : null;
    } else if (!FormatSupport.isDcm(filePath)) {
      state.dicomMeta = null;
    }
    if (!fileChanged) return state.imageMeta;
    if (FormatSupport.isDcm(filePath)) return null;

    const isAv = state.isVideo || state.isAudio
      || FormatSupport.isVideo(filePath) || FormatSupport.isAudio(filePath);
    try {
      if (isAv) {
        if (!window.electronAPI.readMediaMeta) {
          state.imageMeta = null;
        } else {
          const mediaMeta = await window.electronAPI.readMediaMeta(filePath);
          // Drop parser error placeholders from basic
          if (mediaMeta?.basic?.error) {
            const { error, ...rest } = mediaMeta.basic;
            mediaMeta.basic = rest;
          }
          state.imageMeta = mediaMeta;
        }
      } else if (window.electronAPI.readImageMeta) {
        state.imageMeta = await window.electronAPI.readImageMeta(filePath);
      } else {
        state.imageMeta = null;
      }
    } catch {
      state.imageMeta = null;
    }

    // Merge live A/V element metrics when container tags lack them
    if (state.imageMeta) {
      const basic = state.imageMeta.basic || (state.imageMeta.basic = {});
      if (state.isVideo && videoEl) {
        if (!basic.width && videoEl.videoWidth) basic.width = videoEl.videoWidth;
        if (!basic.height && videoEl.videoHeight) basic.height = videoEl.videoHeight;
        if (basic.duration == null && Number.isFinite(videoEl.duration)) basic.duration = videoEl.duration;
      }
      if (state.isAudio && audioEl) {
        if (basic.duration == null && Number.isFinite(audioEl.duration) && audioEl.duration > 0) {
          basic.duration = audioEl.duration;
        }
      }
    }
    return state.imageMeta;
  }

  async function _updateInfoPanel(filePath, dicomMeta) {
    if (!infoContent) return;
    if (!filePath) {
      state.imageMeta = null;
      state.dicomMeta = null;
      state.metaForFile = null;
      infoContent.innerHTML = `<div class="info-no-file" data-i18n="info.noFile">${I18n.t('info.noFile')}</div>`;
      return;
    }

    const stats = await window.electronAPI.getFileStats(filePath);
    const meta = await _ensureImageMeta(filePath, dicomMeta);
    // Always overlay live player metrics for open A/V
    if (meta) {
      const basic = meta.basic || (meta.basic = {});
      if (state.isVideo && videoEl) {
        if (videoEl.videoWidth) basic.width = videoEl.videoWidth;
        if (videoEl.videoHeight) basic.height = videoEl.videoHeight;
        if (Number.isFinite(videoEl.duration) && videoEl.duration > 0) basic.duration = videoEl.duration;
      }
      if (state.isAudio && audioEl) {
        if (Number.isFinite(audioEl.duration) && audioEl.duration > 0) basic.duration = audioEl.duration;
      }
    }
    const sections = _collectInfoSections(filePath, stats, meta, state.dicomMeta);
    infoContent.innerHTML = _renderInfoSections(sections)
      || `<div class="info-no-file" data-i18n="info.noFile">${I18n.t('info.noFile')}</div>`;
  }

  async function _showFileInfoDialog() {
    if (!state.currentFile) return;
    const filePath = state.currentFile;
    const stats = await window.electronAPI.getFileStats(filePath);
    const meta = await _ensureImageMeta(filePath);
    const sections = _collectInfoSections(filePath, stats, meta, state.dicomMeta);
    const name = filePath.split(/[/\\]/).pop();
    const detail = sections
      .filter((sec) => sec.rows.length)
      .map((sec) => {
        const head = I18n.t(sec.titleKey);
        const body = sec.rows.map((r) => `${r.label}: ${r.value}`).join('\n');
        return `${head}\n${body}`;
      })
      .join('\n\n');

    await window.electronAPI.showMessageBox({
      type: 'info',
      title: I18n.t('info.title'),
      message: name,
      detail,
      buttons: ['OK'],
    });
  }

  /* ════════════════════════════════════════════
     Status Bar
  ════════════════════════════════════════════ */
  function _updateStatus({ filePath, zoom, dims, msg, dicomMeta } = {}) {
    const pct = Math.round(state.zoom * 100);
    if (statusZoom) statusZoom.textContent = `${I18n.t('status.zoom')}: ${pct}%`;

    if (Editor.isLoaded()) {
      const d = Editor.getDimensions();
      if (statusDims) statusDims.textContent = `${d.w} × ${d.h} ${I18n.t('status.dimensions')}`;
    } else if (state.isAnimated || state.isVideo) {
      const d = _getViewerDims();
      if (statusDims && d.w && d.h) statusDims.textContent = `${d.w} × ${d.h} ${I18n.t('status.dimensions')}`;
    }

    if (statusIdx && state.fileList.length > 0) {
      statusIdx.textContent =
        `${I18n.t('status.index')} ${state.fileIndex + 1} ${I18n.t('status.of')} ${state.fileList.length}`;
    }

    if (state.currentFile && statusFmt) {
      statusFmt.textContent = FormatSupport.getExtension(state.currentFile).toUpperCase();
    }

    if (msg && statusMsg) statusMsg.textContent = msg;
  }

  /* ════════════════════════════════════════════
     UI Helpers
  ════════════════════════════════════════════ */
  function _showPlaceholder(show) {
    imagePlaceholder.style.display = show ? 'flex' : 'none';
    if (show) {
      displayCanvas.style.display = 'none';
      selCanvas.style.display = 'none';
      _hideAnimatedImage();
      _showVideoPlayer(null);
      _showAudioPlayer(null);
      state.isAnimated = false;
      if (Editor.isLoaded()) Editor.clear();
      _updateMediaControlsVisibility();
      return;
    }
    if (state.isAnimated) {
      displayCanvas.style.display = 'none';
      selCanvas.style.display = 'none';
      if (state.animPlaying) {
        _hideAnimatedFreeze();
        if (animImg) animImg.style.display = 'block';
      } else if (animFreeze && animFreeze.width) {
        if (animImg) animImg.style.display = 'none';
        animFreeze.style.display = 'block';
      } else if (animImg) {
        animImg.style.display = 'block';
      }
    } else {
      displayCanvas.style.display = 'block';
      selCanvas.style.display = 'block';
      _hideAnimatedFreeze();
    }
  }

  function _showLoading(show) {
    if (!loadingOverlay) return;
    loadingOverlay.classList.toggle('is-on', !!show);
    loadingOverlay.style.display = show ? 'flex' : 'none';
    if (show) loadingOverlay.textContent = I18n.t('status.loading') || 'Loading...';
  }

  function _withTimeout(promise, ms, message) {
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message || 'Timed out')), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
  }

  /* ════════════════════════════════════════════
     Error Dialog
  ════════════════════════════════════════════ */
  let _errorResolve = null;

  function _initErrorDialog() {
    const overlay    = document.getElementById('error-overlay');
    const okBtn      = document.getElementById('error-ok-btn');
    const closeBtn   = document.getElementById('error-close-btn');
    const copyBtn    = document.getElementById('error-copy-btn');
    const detailEl   = document.getElementById('error-detail');

    function _close() {
      overlay.style.display = 'none';
      if (_errorResolve) { _errorResolve(); _errorResolve = null; }
    }

    okBtn?.addEventListener('click', _close);
    closeBtn?.addEventListener('click', _close);
    overlay?.addEventListener('click', (e) => { if (e.target === overlay) _close(); });

    copyBtn?.addEventListener('click', async () => {
      const text = detailEl?.value || '';
      try {
        await navigator.clipboard.writeText(text);
        const orig = copyBtn.querySelector('span');
        if (orig) {
          const prevText = orig.textContent;
          orig.textContent = I18n.t('error.copied');
          copyBtn.classList.add('copied');
          setTimeout(() => {
            orig.textContent = prevText;
            copyBtn.classList.remove('copied');
          }, 1500);
        }
      } catch (e) {
        // fallback: select text
        detailEl?.select();
      }
    });

    // Allow Ctrl+A to select all in the textarea
    detailEl?.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.stopPropagation();
      }
    });
  }

  /**
   * Show a styled error dialog.
   * @param {string} message - Short user-facing message
   * @param {string|Error|null} detail - Stack trace or detailed info (optional)
   * @param {string|null} title - Optional custom title
   */
  function _showError(message, detail, title) {
    const overlay    = document.getElementById('error-overlay');
    const titleEl    = document.getElementById('error-title');
    const msgEl      = document.getElementById('error-message');
    const detailWrap = document.getElementById('error-detail-wrap');
    const detailEl   = document.getElementById('error-detail');
    const copyBtn    = document.getElementById('error-copy-btn');

    if (!overlay) return;

    if (titleEl) titleEl.textContent = title || I18n.t('error.title');
    if (msgEl)   msgEl.textContent   = message || I18n.t('error.title');

    const detailText = detail instanceof Error
      ? `${detail.message}\n\n${detail.stack || ''}`
      : (detail || '');

    if (detailText.trim()) {
      if (detailEl)   detailEl.value       = detailText.trim();
      if (detailWrap) detailWrap.style.display = 'block';
      if (copyBtn)    copyBtn.style.display    = 'inline-flex';
    } else {
      if (detailWrap) detailWrap.style.display = 'none';
      if (copyBtn)    copyBtn.style.display    = 'none';
    }

    overlay.style.display = 'flex';
    document.getElementById('error-ok-btn')?.focus();

    return new Promise(resolve => { _errorResolve = resolve; });
  }

  /** Modal progress dialog with bar + percent (used by bg-remove algorithms). */
  const ProgressDialog = (() => {
    let _percent = 0;
    let _creepTimer = null;
    let _creepCap = 90;
    let _visible = false;

    function _els() {
      return {
        overlay: document.getElementById('progress-overlay'),
        title: document.getElementById('progress-title'),
        message: document.getElementById('progress-message'),
        fill: document.getElementById('progress-bar-fill'),
        bar: document.getElementById('progress-bar'),
        pct: document.getElementById('progress-percent'),
      };
    }

    function _paint(message) {
      const e = _els();
      const shown = Math.round(_percent);
      if (e.fill) e.fill.style.width = `${shown}%`;
      if (e.pct) e.pct.textContent = `${shown}%`;
      if (e.bar) e.bar.setAttribute('aria-valuenow', String(shown));
      if (message != null && e.message) e.message.textContent = message;
    }

    function show({ title, message, percent } = {}) {
      const e = _els();
      if (!e.overlay) return;
      stopCreep();
      _percent = 0;
      _visible = true;
      if (e.title) e.title.textContent = title || I18n.t('progress.title') || 'Progress';
      if (e.message) e.message.textContent = message || '';
      set(percent != null ? percent : 0, message, true);
      e.overlay.style.display = 'flex';
      e.overlay.classList.add('visible');
    }

    /** @param {boolean} [force] allow decreasing (reset) */
    function set(percent, message, force) {
      const raw = Math.max(0, Math.min(100, Number(percent) || 0));
      _percent = force ? raw : Math.max(_percent, raw);
      _paint(message);
    }

    function hide() {
      stopCreep();
      _visible = false;
      const e = _els();
      if (!e.overlay) return;
      e.overlay.classList.remove('visible');
      e.overlay.style.display = 'none';
      _percent = 0;
      _paint();
      if (e.fill) e.fill.style.width = '0%';
      if (e.pct) e.pct.textContent = '0%';
    }

    /** Slowly advance toward `cap` while inference runs (no true ORT %). */
    function startCreep(cap = 88) {
      stopCreep();
      _creepCap = cap;
      _creepTimer = setInterval(() => {
        if (_percent >= _creepCap) return;
        const step = _percent < 50 ? 1.2 : _percent < 75 ? 0.6 : 0.25;
        set(Math.min(_creepCap, _percent + step));
      }, 400);
    }

    function stopCreep() {
      if (_creepTimer) {
        clearInterval(_creepTimer);
        _creepTimer = null;
      }
    }

    function yieldFrame(ms = 0) {
      return new Promise((resolve) => {
        requestAnimationFrame(() => {
          if (ms > 0) setTimeout(resolve, ms);
          else resolve();
        });
      });
    }

    return { show, set, hide, startCreep, stopCreep, yieldFrame, isVisible: () => _visible };
  })();
  window._ProgressDialog = ProgressDialog;

  // Expose globally so formatSupport.js and other modules can use it
  window._showAppError = _showError;

  /* ════════════════════════════════════════════
     File Tree Context Menu
  ════════════════════════════════════════════ */
  async function _exportSelectionToFolder(paths, mode) {
    const t = I18n.t.bind(I18n);
    if (!paths?.length) return;
    const picked = await window.FileDialog.openFolder({
      title: mode === 'move' ? t('dialog.moveToFolder') : t('dialog.copyToFolder'),
    });
    if (!picked || picked.canceled || !picked.filePath) return;
    const destDir = picked.filePath;

    const result = await window.electronAPI.transferIntoDir({
      sources: paths,
      destDir,
      mode: mode === 'move' ? 'move' : 'copy',
    });

    if (result?.error && !result.results) {
      _updateStatus({
        msg: (t('status.dropError') || 'Error: {msg}').replace('{msg}', result.error),
      });
      return;
    }

    const done = (result.results || []).filter((r) => r.dest && !r.skipped);
    if (mode === 'move') {
      for (const r of done) {
        FileTree.forgetPath(r.src);
        const cur = state.currentFile;
        const src = r.src;
        if (cur && src &&
            cur.replace(/[\\/]+$/, '').toLowerCase() === src.replace(/[\\/]+$/, '').toLowerCase()) {
          state.currentFile = null;
          _showPlaceholder(true);
          _clearDirty();
        }
      }
    }

    await FileTree.refresh();
    const key = mode === 'move' ? 'status.moved' : 'status.copied';
    let msg = (t(key) || '{n}').replace('{n}', String(done.length));
    if (result.errors?.length) msg += ` (${result.errors.length} failed)`;
    _updateStatus({ msg });
  }

  function _showTreeContextMenu(entry, x, y) {
    const t = I18n.t.bind(I18n);
    const isWeb = window.electronAPI.platform === 'web';
    const isDir  = entry.isDirectory;
    const isFile = !isDir;
    const ext = FormatSupport.getExtension(entry.name);
    const isSup = FormatSupport.IMAGE_EXTS.has(ext) || FormatSupport.VIDEO_EXTS.has(ext) || FormatSupport.AUDIO_EXTS.has(ext);

    // Check if multiple items are selected
    const multiPaths = FileTree.getSelectedPaths();
    const isMulti = multiPaths.length > 1 && multiPaths.some((p) => {
      // treat as multi if right-clicked item is part of selection
      return p === entry.path || (entry.path && p.toLowerCase() === entry.path.toLowerCase());
    });
    const exportPaths = isMulti ? multiPaths : [entry.path];

    if (isMulti && isFile) {
      // Multi-selection context menu
      ContextMenu.show(x, y, [
        { icon: Icons.image, label: `${t('context.openFile')} (${multiPaths.length})`,
          action: async () => { for (const p of multiPaths) await _openFile(p); } },
        { separator: true },
        { icon: Icons.copy, label: t('tree.copyPath'),
          action: () => navigator.clipboard.writeText(multiPaths.join('\n')).catch(() => {}) },
        !isWeb && { icon: Icons.copy, label: `${t('context.copyToFolder')} (${multiPaths.length})`,
          action: () => _exportSelectionToFolder(multiPaths, 'copy') },
        !isWeb && { icon: Icons.cut, label: `${t('context.moveToFolder')} (${multiPaths.length})`,
          action: () => _exportSelectionToFolder(multiPaths, 'move') },
        !isWeb && { separator: true },
        !isWeb && { icon: Icons.delete, label: `${t('context.deleteFile')} (${multiPaths.length})`,
          action: async () => {
            const result = await window.electronAPI.showMessageBox({
              type: 'warning',
              title: t('dialog.delete.title'),
              message: `${multiPaths.length}개 파일을 삭제하시겠습니까?`,
              detail: t('dialog.delete.detail'),
              buttons: [t('dialog.delete.yes'), t('dialog.delete.no')],
              defaultId: 1, cancelId: 1,
            });
            if (result.response !== 0) return;
            for (const p of multiPaths) {
              await window.electronAPI.deleteFile(p);
              FileTree.forgetPath(p);
              if (state.currentFile === p) { state.currentFile = null; _showPlaceholder(true); _clearDirty(); }
            }
            await FileTree.refresh();
            if (state.currentFile) {
              const dir = await window.electronAPI.pathDirname(state.currentFile);
              state.fileList = await FileTree.getImageFilesInDir(dir);
              state.fileIndex = state.fileList.indexOf(state.currentFile);
              _updateNavButtons();
            } else {
              state.fileList = [];
              state.fileIndex = -1;
              _updateNavButtons();
            }
          }},
      ].filter(Boolean));
      return;
    }

    ContextMenu.show(x, y, [
      isFile && isSup && { icon: Icons.openFile,   label: t('context.openFile'),      action: () => _openFile(entry.path) },
      isDir  &&          { icon: Icons.openFolder, label: t('context.openFolder'),    action: () => _openFolder(entry.path) },
      { separator: true },
      isFile && isSup && { icon: Icons.save,       label: t('context.saveAs'),        action: async () => { await _openFile(entry.path); _saveAs(); } },
      isFile &&          { icon: Icons.copy,       label: t('tree.copyPath'), action: () => navigator.clipboard.writeText(entry.path).catch(() => {}) },
      !isWeb && { icon: Icons.copy, label: t('context.copyToFolder'),
        action: () => _exportSelectionToFolder(exportPaths, 'copy') },
      !isWeb && { icon: Icons.cut, label: t('context.moveToFolder'),
        action: () => _exportSelectionToFolder(exportPaths, 'move') },
      !isWeb && { separator: true },
      !isWeb && { icon: Icons.explorer, label: t('context.showInExplorer'), action: () => window.electronAPI.showItemInFolder(entry.path) },
      !isWeb && { separator: true },
      !isWeb && { icon: Icons.delete, label: isDir ? (t('context.deleteFolder') || t('context.deleteFile')) : t('context.deleteFile'),
        action: () => _deleteFile(entry.path) },
    ].filter(Boolean));
  }

  async function _deleteFile(filePath) {
    const name = filePath.split(/[/\\]/).pop();
    const t = I18n.t.bind(I18n);
    const stats = await window.electronAPI.getFileStats(filePath);
    const isDir = stats && !stats.error && stats.isDirectory;
    const result = await window.electronAPI.showMessageBox({
      type: 'warning',
      title: t('dialog.delete.title'),
      message: isDir
        ? `${t('dialog.delete.message')}\n${name}\n(${t('dialog.delete.folderHint') || 'Folder and all contents'})`
        : `${t('dialog.delete.message')}\n${name}`,
      detail: t('dialog.delete.detail'),
      buttons: [t('dialog.delete.yes'), t('dialog.delete.no')],
      defaultId: 1,
      cancelId: 1,
    });
    if (result.response !== 0) return;

    // Stop watching if we delete the watched path
    if (_watchedFile === filePath) {
      await window.electronAPI.unwatchFile(filePath);
      _watchedFile = null;
    }
    if (_watchedDir === filePath) {
      await window.electronAPI.unwatchDirectory(filePath);
      _watchedDir = null;
    }

    const res = await window.electronAPI.deleteFile(filePath);
    if (res && res.error) {
      _showError(t('context.deleteFile'), res.error);
      return;
    }

    FileTree.forgetPath(filePath);

    const underDeleted = (p) => {
      if (!p) return false;
      const a = p.replace(/[\\/]+$/, '').toLowerCase();
      const b = filePath.replace(/[\\/]+$/, '').toLowerCase();
      return a === b || a.startsWith(b + '\\') || a.startsWith(b + '/');
    };

    if (underDeleted(state.currentFile)) {
      state.currentFile = null;
      _showPlaceholder(true);
      _clearDirty();
      state.fileList = [];
      state.fileIndex = -1;
      _setToolbarEnabled(false);
      _updateNavButtons();
    } else if (state.currentFile) {
      const dir = await window.electronAPI.pathDirname(state.currentFile);
      state.fileList = await FileTree.getImageFilesInDir(dir);
      state.fileIndex = state.fileList.indexOf(state.currentFile);
      _updateNavButtons();
    }

    await FileTree.refresh();

    // Keep watching parent of deleted item
    try {
      const parent = await window.electronAPI.pathDirname(filePath);
      if (parent) _watchDir(parent);
    } catch {}
  }

  /* ════════════════════════════════════════════
     Context Menu
  ════════════════════════════════════════════ */
  function _showContextMenu(x, y) {
    const hasImg = _isEditableImage();
    const hasSel = hasImg && Editor.hasSelection();
    const t = I18n.t.bind(I18n);
    const isWeb = window.electronAPI.platform === 'web';
    const isAv = state.isVideo || state.isAudio;
    const isVideo = !!state.isVideo;
    const isAnim = !!state.isAnimated && !state.editMode;
    const canTransport = isVideo || isAnim;
    const playing = canTransport && _isMediaPlaying();

    ContextMenu.show(x, y, [
      canTransport && { icon: Icons.mediaPlay,  label: t('toolbar.play'),  disabled: playing,  shortcut: 'Space', action: () => _playMedia() },
      canTransport && { icon: Icons.mediaPause, label: t('toolbar.pause'), disabled: !playing, shortcut: 'Space', action: () => _pauseMedia() },
      canTransport && { icon: Icons.mediaStop,  label: t('toolbar.stop'),  action: () => _stopMedia() },
      canTransport && { separator: true },
      { icon: Icons.openFile,   label: t('context.openFile'),   action: () => _pickOpenFile() },
      { icon: Icons.openFolder, label: t('context.openFolder'), action: () => _pickOpenFolder() },
      { separator: true },
      hasImg && { icon: Icons.edit, label: t('toolbar.edit'), shortcut: 'Ctrl+E', action: _openEditWindow },
      hasImg && { icon: Icons.save,   label: t('context.saveAs'), action: _saveAs },
      hasImg && { icon: Icons.cut,    label: t('context.cut'),    disabled: !hasSel, action: _cutToClipboard },
      hasImg && { icon: Icons.copy,   label: t('context.copy'),   action: _copyToClipboard },
      hasImg && { separator: true },
      hasImg && { icon: Icons.rotateLeft,  label: t('context.rotateLeft'),  action: () => _rotate(-90) },
      hasImg && { icon: Icons.rotateRight, label: t('context.rotateRight'), action: () => _rotate(90) },
      hasImg && { icon: Icons.flipH,       label: t('context.flipH'),       action: () => _flip('h') },
      hasImg && { icon: Icons.flipV,       label: t('context.flipV'),       action: () => _flip('v') },
      hasImg && { separator: true },
      (hasImg || isVideo) && { icon: Icons.zoomIn,    label: t('context.zoomIn'),    shortcut:'Ctrl++', action: () => _zoom(1.25) },
      (hasImg || isVideo) && { icon: Icons.zoomOut,   label: t('context.zoomOut'),   shortcut:'Ctrl+-', action: () => _zoom(0.8) },
      (hasImg || isVideo) && { icon: Icons.fitWindow, label: t('context.fitWindow'), shortcut:'Ctrl+0', action: _fitToWindow },
      hasImg && { icon: Icons.actualSize,label: t('context.actualSize'),shortcut:'Ctrl+1', action: _actualSize },
      hasImg && { separator: true },
      hasImg && { icon: Icons.bgRemove, label: t('context.bgRemove'), action: _removeBackground },
      hasImg && { icon: Icons.reset,    label: t('context.resetAll'), action: _resetAll },
      !isAv && { separator: true },
      { icon: Icons.prev,    label: t('context.prev'), disabled: state.fileIndex <= 0,                           action: _prevImage },
      { icon: Icons.next,    label: t('context.next'), disabled: state.fileIndex >= state.fileList.length - 1,   action: _nextImage },
      !isWeb && { separator: true },
      !isWeb && { icon: Icons.explorer, label: t('context.showInExplorer'), disabled: !state.currentFile,
        action: () => state.currentFile && _showInExplorer() },
    ].filter(Boolean));
  }

  async function _showInExplorer() {
    if (!state.currentFile) return;
    await window.electronAPI.showItemInFolder(state.currentFile);
  }

  async function _copyToClipboard() {
    if (!Editor.isLoaded()) return;
    try {
      const dataUrl = Editor.exportAsDataUrl('image/png');
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    } catch (e) {
      _showError(I18n.t('error.clipboardCopy') || 'Failed to copy to clipboard.', e);
    }
  }

  async function _cutToClipboard() {
    if (!Editor.hasSelection()) return;
    const dataUrl = Editor.cut();
    _updateUndoRedoBtns();
    if (dataUrl) {
      try {
        const res = await fetch(dataUrl);
        const blob = await res.blob();
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      } catch (e) {
        _showError(I18n.t('error.clipboardCut') || 'Failed to cut to clipboard.', e);
      }
    }
  }

  function _resetAll() {
    if (!_isEditableImage()) return;
    Editor.resetTransform();
    Editor.resetEffects();
    _syncSlidersFromEffects();
    _fitToWindow();
  }

  /* ════════════════════════════════════════════
     Theme / Language
  ════════════════════════════════════════════ */
  function _langSwitchLabel() {
    return state.lang === 'ko' ? 'English' : '한글';
  }

  function _setLangButtonLabel(btn) {
    if (!btn) return;
    let span = btn.querySelector('.lang-text');
    if (!span) {
      span = document.createElement('span');
      span.className = 'lang-text';
      btn.textContent = '';
      btn.appendChild(span);
    }
    span.textContent = _langSwitchLabel();
  }

  function _syncEditThemeLangBtns() {
    const themeBtn = document.getElementById('ew-theme');
    if (themeBtn) {
      themeBtn.innerHTML = Icons[state.theme === 'dark' ? 'sun' : 'moon'] || '';
    }
    _setLangButtonLabel(document.getElementById('ew-lang'));
    _setLangButtonLabel(document.getElementById('btn-lang'));
  }

  function _applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme === 'light' ? 'light' : '');
    state.theme = theme;
    localStorage.setItem('theme', theme);
    const btn = document.getElementById('btn-theme');
    if (btn) btn.innerHTML = Icons[theme === 'dark' ? 'sun' : 'moon'];
    _syncEditThemeLangBtns();
  }

  function _toggleTheme() {
    _applyTheme(state.theme === 'dark' ? 'light' : 'dark');
    _syncMenu();
  }

  async function _toggleLang() {
    state.lang = state.lang === 'en' ? 'ko' : 'en';
    localStorage.setItem('lang', state.lang);
    await _refreshLang();
  }

  function _syncMenu() {
    window.electronAPI.updateMenu({
      lang: state.lang,
      theme: state.theme,
      translations: I18n.getAll(),
    });
  }

  /* ════════════════════════════════════════════
     Keyboard
  ════════════════════════════════════════════ */
  function _initKeyboard() {
    document.addEventListener('keydown', (e) => {
      if (_isFileDialogOpen()) return;
      const ctrl = e.ctrlKey || e.metaKey;

      if (ctrl && e.shiftKey && (e.key === 'o' || e.key === 'O')) { e.preventDefault(); _pickOpenFolder(); return; }
      if (ctrl && (e.key === 'o' || e.key === 'O')) { e.preventDefault(); _pickOpenFile(); return; }
      if (ctrl && (e.key === '=' || e.key === '+')) { e.preventDefault(); _zoom(1.25); return; }
      if (ctrl && e.key === '-') { e.preventDefault(); _zoom(0.8); return; }
      if (ctrl && e.key === '0') { e.preventDefault(); _fitToWindow(); return; }
      if (ctrl && e.key === '1') { e.preventDefault(); _actualSize(); return; }
      if (ctrl && e.key === '[') { e.preventDefault(); _rotate(-90); return; }
      if (ctrl && e.key === ']') { e.preventDefault(); _rotate(90); return; }
      if (ctrl && e.key === 'e') { e.preventDefault(); _openEditWindow(); return; }
      if (ctrl && e.key === 's') {
        e.preventDefault();
        if (state.editMode) _saveAsNewFile();
        return;
      }
      if (ctrl && e.shiftKey && e.key === 'S') { e.preventDefault(); _saveAs(); return; }
      if (ctrl && e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        if (_isEditableImage()) Editor.redo();
        return;
      }
      if (ctrl && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        if (_isEditableImage()) Editor.undo();
        return;
      }
      if (ctrl && (e.key === 'y' || e.key === 'Y')) {
        e.preventDefault();
        if (_isEditableImage()) Editor.redo();
        return;
      }
      if (ctrl && e.key === 'x') { e.preventDefault(); if (_isEditableImage()) _cutToClipboard(); return; }
      if (ctrl && e.key === 'c') { e.preventDefault(); if (_isEditableImage()) _copyToClipboard(); return; }

      if (e.key === 'ArrowLeft')  { e.preventDefault(); _prevImage(); return; }
      if (e.key === 'ArrowRight') { e.preventDefault(); _nextImage(); return; }
      if (e.key === ' ' || e.code === 'Space') {
        const tag = (e.target && e.target.tagName) || '';
        if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target?.isContentEditable) return;
        if (_activeMediaEl()) {
          e.preventDefault();
          _toggleMediaPlayback();
          return;
        }
      }
      if (e.key === 'Escape') {
        const openDlg = [...document.querySelectorAll('.dialog-overlay')].find((el) => {
          if (el.id === 'progress-overlay' || el.id === 'file-dialog-overlay') return false;
          return el.classList.contains('visible') || el.style.display === 'flex';
        });
        if (openDlg) {
          e.preventDefault();
          _hideDialogEl(openDlg);
          return;
        }
        if (state.editMode) {
          e.preventDefault();
          _requestCloseEditWindow(false);
          return;
        }
        Editor.clearSelection();
        _setTool('pointer');
        return;
      }
      if (e.key === 'F11') {
        e.preventDefault();
        window.electronAPI.toggleFullscreen?.();
        return;
      }
    });
  }

  /* ════════════════════════════════════════════
     Menu actions from main process
  ════════════════════════════════════════════ */
  async function _handleMenuAction(action) {
    const imageOnly = new Set([
      'actual-size', 'rotate-left', 'rotate-right', 'flip-h', 'flip-v',
      'reset-all', 'save-as', 'save-before-close', 'copy-clipboard',
      'show-effects', 'edit-image', 'undo', 'redo',
      'effect-grayscale', 'effect-sepia', 'effect-invert', 'effect-reset',
    ]);
    if (imageOnly.has(action) && !_isEditableImage()) return;

    const map = {
      'open-file':     _pickOpenFile,
      'open-folder':   _pickOpenFolder,
      'zoom-in':       () => _zoom(1.25),
      'zoom-out':      () => _zoom(0.8),
      'fit-window':    _fitToWindow,
      'actual-size':   _actualSize,
      'rotate-left':   () => _rotate(-90),
      'rotate-right':  () => _rotate(90),
      'flip-h':        () => _flip('h'),
      'flip-v':        () => _flip('v'),
      'reset-all':     _resetAll,
      'save-as':            _saveAs,
      'save-before-close':  () => _saveAs(true),
      'copy-clipboard':_copyToClipboard,
      'prev-image':    _prevImage,
      'next-image':    _nextImage,
      'edit-image':    _openEditWindow,
      'undo':          () => { Editor.undo(); },
      'redo':          () => { Editor.redo(); },
      'show-effects':  _toggleEffectsPanel,
      'effect-grayscale': () => { if (_isEditableImage()) { _openEditWindow(); Editor.applyPreset('grayscale'); } },
      'effect-sepia':     () => { if (_isEditableImage()) { _openEditWindow(); Editor.applyPreset('sepia'); } },
      'effect-invert':    () => { if (_isEditableImage()) { _openEditWindow(); Editor.applyPreset('invert'); } },
      'effect-reset':     _resetEffects,
      'theme-dark':    () => _applyTheme('dark'),
      'theme-light':   () => _applyTheme('light'),
      'lang-ko': async () => { state.lang = 'ko'; localStorage.setItem('lang','ko'); await _refreshLang(); },
      'lang-en': async () => { state.lang = 'en'; localStorage.setItem('lang','en'); await _refreshLang(); },
      'show-about':    () => _showDialog('about-overlay'),
      'show-shortcuts':() => _showDialog('shortcuts-overlay'),
    };
    if (map[action]) await map[action]();
  }

  async function _refreshLang() {
    await I18n.loadLanguage(state.lang);
    I18n.applyToDOM();
    _buildEffectsPanel();
    _populateBgAlgoSelect();
    _updateStatus();
    if (state.editMode) {
      document.getElementById('edit-window-title').textContent =
        (state.currentFile ? state.currentFile.split(/[/\\]/).pop() + ' — ' : '') +
        I18n.t('editWindow.title');
    }
    if (state.currentFile) await _updateInfoPanel(state.currentFile);
    _syncEditThemeLangBtns();
    _syncMenu();
    requestAnimationFrame(() => _syncWindowMinSize());
  }

  /* ════════════════════════════════════════════
     Dialogs
  ════════════════════════════════════════════ */
  function _showDialog(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.display = 'flex';
    el.classList.add('visible');
    if (id === 'about-overlay') _refreshAboutInfo();
  }

  let _appInfoCache = null;

  async function _loadAppInfo() {
    if (_appInfoCache) return _appInfoCache;
    try {
      if (window.electronAPI?.getAppInfo) {
        _appInfoCache = await window.electronAPI.getAppInfo();
      }
    } catch {}
    if (!_appInfoCache) {
      try {
        const res = await fetch('./version.json', { cache: 'no-store' });
        if (res.ok) _appInfoCache = await res.json();
      } catch {}
    }
    if (!_appInfoCache) _appInfoCache = { version: '1.0.2', buildNumber: '' };
    return _appInfoCache;
  }

  async function _refreshAboutInfo() {
    const info = await _loadAppInfo();
    const verEl = document.getElementById('about-version-num');
    const buildEl = document.getElementById('about-build-num');
    const brandVer = document.querySelector('.app-brand-ver');
    const version = String(info.version || '1.0.2');
    const build = String(info.buildNumber || '').trim();
    if (verEl) verEl.textContent = version;
    if (buildEl) buildEl.textContent = build || '—';
    if (brandVer) {
      brandVer.textContent = build ? `V${version} (${build})` : `V${version}`;
    }
  }

  // Fill version/build as soon as the UI is ready
  _refreshAboutInfo().catch(() => {});

  function _hideDialog(id) {
    const el = typeof id === 'string' ? document.getElementById(id) : id;
    if (!el) return;
    el.style.display = 'none';
    el.classList.remove('visible');
  }

  function _hideDialogEl(overlay) {
    if (!overlay) return;
    overlay.style.display = 'none';
    overlay.classList.remove('visible');
  }

  document.querySelectorAll('[data-close-dialog]').forEach(btn => {
    const close = (e) => {
      e.preventDefault();
      e.stopPropagation();
      _hideDialogEl(btn.closest('.dialog-overlay'));
    };
    btn.addEventListener('click', close);
    btn.addEventListener('pointerup', close);
  });

  document.querySelectorAll('.dialog-overlay').forEach(overlay => {
    if (overlay.id === 'progress-overlay' || overlay.id === 'file-dialog-overlay') return;
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) _hideDialogEl(overlay);
    });
    overlay.addEventListener('pointerup', (e) => {
      if (e.target === overlay) _hideDialogEl(overlay);
    });
  });

  /* ════════════════════════════════════════════
     Sidebar Resize
  ════════════════════════════════════════════ */
  function _initSidebarResize() {
    const handle = document.getElementById('sidebar-resize-handle');
    if (!handle || !sidebar) return;

    const MIN_W = 140;
    const MAX_W = 500;

    // Restore previous width
    const saved = parseInt(localStorage.getItem('sidebarWidth') || '', 10);
    if (saved >= MIN_W && saved <= MAX_W) {
      sidebar.style.width = `${saved}px`;
    }

    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startW = sidebar.getBoundingClientRect().width;
      handle.classList.add('resizing');
      document.body.classList.add('resizing-col');

      const onMove = (ev) => {
        const w = Math.min(Math.max(startW + (ev.clientX - startX), MIN_W), MAX_W);
        sidebar.style.width = `${Math.round(w)}px`;
      };
      const onUp = () => {
        handle.classList.remove('resizing');
        document.body.classList.remove('resizing-col');
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        localStorage.setItem('sidebarWidth', String(Math.round(sidebar.getBoundingClientRect().width)));
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    });
  }

  function _initVerticalResize() {
    const handle = document.getElementById('sidebar-v-resize');
    const tree = document.getElementById('file-tree-panel');
    const info = document.getElementById('info-panel');
    if (!handle || !tree || !info || !sidebar) return;

    const HANDLE_H = 5;
    const MIN_TREE = 80;
    const MIN_INFO = 100;

    function _applySplit(treeH) {
      const total = sidebar.getBoundingClientRect().height;
      const maxTree = Math.max(MIN_TREE, total - HANDLE_H - MIN_INFO);
      const h = Math.min(Math.max(treeH, MIN_TREE), maxTree);
      const infoH = Math.max(MIN_INFO, total - HANDLE_H - h);

      tree.style.flex = 'none';
      tree.style.height = `${Math.round(h)}px`;
      info.style.flex = 'none';
      info.style.height = `${Math.round(infoH)}px`;
      return h;
    }

    // Restore previous split, otherwise keep CSS 50/50 (equal tree and info heights)
    const savedTree = parseInt(localStorage.getItem('sidebarTreeHeightV2') || '', 10);
    if (savedTree >= MIN_TREE) {
      requestAnimationFrame(() => _applySplit(savedTree));
    }

    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      handle.classList.add('resizing');
      document.body.classList.add('resizing-row');

      const onMove = (ev) => {
        const rect = sidebar.getBoundingClientRect();
        // Pointer Y relative to sidebar top → tree height
        _applySplit(ev.clientY - rect.top);
      };
      const onUp = () => {
        handle.classList.remove('resizing');
        document.body.classList.remove('resizing-row');
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        const h = Math.round(tree.getBoundingClientRect().height);
        localStorage.setItem('sidebarTreeHeightV2', String(h));
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    });

    // Keep split valid when the window / sidebar height changes
    window.addEventListener('resize', () => {
      if (tree.style.flex === 'none' && tree.style.height) {
        _applySplit(parseInt(tree.style.height, 10) || tree.getBoundingClientRect().height);
      }
    });
  }

  function _initEditEffectsResize() {
    const panel = document.getElementById('edit-effects-panel');
    const handle = document.getElementById('edit-effects-resize');
    if (!panel || !handle) return;

    const MIN_W = 200;
    const MAX_W = 480;

    const saved = parseInt(localStorage.getItem('editEffectsPanelWidth') || '', 10);
    if (saved >= MIN_W && saved <= MAX_W) {
      panel.style.width = `${saved}px`;
    }

    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startW = panel.getBoundingClientRect().width;
      handle.classList.add('resizing');
      document.body.classList.add('resizing-col');

      const onMove = (ev) => {
        const w = Math.min(Math.max(startW + (ev.clientX - startX), MIN_W), MAX_W);
        panel.style.width = `${Math.round(w)}px`;
      };
      const onUp = () => {
        handle.classList.remove('resizing');
        document.body.classList.remove('resizing-col');
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        localStorage.setItem(
          'editEffectsPanelWidth',
          String(Math.round(panel.getBoundingClientRect().width))
        );
        if (state.editMode) _ewFit();
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    });
  }

  function _initEditAdjustResize() {
    const panel = document.getElementById('edit-adjust-panel');
    const handle = document.getElementById('edit-adjust-resize');
    if (!panel || !handle) return;

    const MIN_W = 200;
    const MAX_W = 480;

    const saved = parseInt(localStorage.getItem('editAdjustPanelWidth') || '', 10);
    if (saved >= MIN_W && saved <= MAX_W) {
      panel.style.width = `${saved}px`;
    }

    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startW = panel.getBoundingClientRect().width;
      handle.classList.add('resizing');
      document.body.classList.add('resizing-col');

      const onMove = (ev) => {
        const w = Math.min(Math.max(startW + (startX - ev.clientX), MIN_W), MAX_W);
        panel.style.width = `${Math.round(w)}px`;
      };
      const onUp = () => {
        handle.classList.remove('resizing');
        document.body.classList.remove('resizing-col');
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        localStorage.setItem(
          'editAdjustPanelWidth',
          String(Math.round(panel.getBoundingClientRect().width))
        );
        if (state.editMode) _ewFit();
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    });
  }

})();
