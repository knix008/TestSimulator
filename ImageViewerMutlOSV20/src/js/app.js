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
    isDirty:      false,
    imageMeta:    null,
    dicomMeta:    null,
    metaForFile:  null,
  };

  function _isEditableImage() {
    return Editor.isLoaded() && !state.isVideo && !state.isAudio;
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
  const videoEl          = document.getElementById('video-player');
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
    onDirOpen: (p) => {
      localStorage.setItem('lastOpenedDir', p);
      window.electronAPI.setLastOpenDir(p);
      _watchDir(p);
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

  /* ─── Effects panel sliders ─── */
  let _ewEffectsBuilt = false;
  _buildEffectsPanel();

  /* ─── Sidebar / Info resize ─── */
  _initSidebarResize();
  _initVerticalResize();

  /* ─── Viewer pan / zoom ─── */
  _initViewerInteraction();

  /* ─── Keyboard shortcuts ─── */
  _initKeyboard();

  /* ─── Context menu ─── */
  viewerContainer.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    _showContextMenu(e.clientX, e.clientY);
  });
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
          await _openFile(p);
          await FileTree.refresh();
          FileTree.setSelected(p);
          return;
        }
      }
      if (files[0]) {
        const p = FileRegistry.registerFile(files[0], '/');
        await FileTree.loadDrives();
        await FileTree.revealPath('/');
        await _openFile(p);
        await FileTree.refresh();
        FileTree.setSelected(p);
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
        await _openFile(p);
        await FileTree.revealPath(dir);
        await FileTree.refresh();
        FileTree.setSelected(p);
        return;
      }
    }
    // Fallback: try the first file anyway
    if (files[0]) {
      const p = _dropPath(files[0]);
      if (!p) return;
      const dir = await window.electronAPI.pathDirname(p);
      await _openFile(p);
      await FileTree.revealPath(dir);
      await FileTree.refresh();
      FileTree.setSelected(p);
    }
  });

  /* ─── Electron IPC listeners ─── */
  window.electronAPI.onOpenFile(async (p) => {
    try {
      const dir = await window.electronAPI.pathDirname(p);
      await _openFile(p);
      await FileTree.revealPath(dir);
      await FileTree.refresh();
      FileTree.setSelected(p);
    } catch (_) {
      await _openFile(p);
      await FileTree.refresh();
      FileTree.setSelected(p);
    }
  });
  window.electronAPI.onOpenFolder(async (p) => {
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
        await _openFile(launchFile);
        await FileTree.revealPath(dir);
        await FileTree.refresh();
        FileTree.setSelected(launchFile);
      } catch (e) {
        await _openFile(launchFile);
      }
    } else {
      const lastDir = localStorage.getItem('lastOpenedDir');
      if (lastDir) {
        try {
          const stats = await window.electronAPI.getFileStats(lastDir);
          if (stats && !stats.error && stats.isDirectory) {
            await _openFolder(lastDir);
            const lastFile = localStorage.getItem('lastOpenedFile');
            if (lastFile) {
              const fileStats = await window.electronAPI.getFileStats(lastFile);
              if (fileStats && !fileStats.error && !fileStats.isDirectory) {
                await _openFile(lastFile);
              }
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
      { id:'btn-open-file',   icon:'openFile',   tip:'toolbar.openFile',   action: () => window.electronAPI.openFileDialog() },
      { id:'btn-open-folder', icon:'openFolder', tip:'toolbar.openFolder', action: () => window.electronAPI.openFolderDialog() },
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

      const btn = document.createElement('button');
      btn.className = 'toolbar-btn';
      btn.id = b.id;
      if (b.disabled) btn.disabled = true;

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

      btn.addEventListener('click', b.action);
      Tooltip.attach(btn, () => I18n.t(b.tip));
      toolbar.appendChild(btn);
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
    const kids = [...el.children];
    kids.forEach((child, i) => {
      if (growClass && child.classList.contains(growClass)) {
        w += parseFloat(getComputedStyle(child).minWidth) || 8;
      } else {
        w += child.getBoundingClientRect().width;
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
  function _syncWindowMinSize() {
    const mainW = _measureFlexContentWidth(toolbar, 'toolbar-spacer');
    const editW = _measureEditTitlebarWidth();
    const width = Math.max(mainW, editW, 1100);
    if (width === _appliedMinWidth) return;
    _appliedMinWidth = width;
    document.documentElement.style.minWidth = `${width}px`;
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
    closeBtn?.addEventListener('click', () => window.electronAPI.windowClose());
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

    const set = (id, on) => {
      const el = document.getElementById(id);
      if (el) el.disabled = !on;
    };

    const hasMedia = k !== 'none';
    const isImage = k === 'image';
    const canNav = hasMedia && state.fileList.length > 1;

    // Navigation / view (available for images; limited for A/V)
    set('btn-zoom-in', isImage || k === 'video');
    set('btn-zoom-out', isImage || k === 'video');
    set('btn-fit', isImage || k === 'video');
    set('btn-actual', isImage);
    set('btn-prev', canNav);
    set('btn-next', canNav);

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
    document.body.classList.toggle('media-av', k === 'video' || k === 'audio');
  }

  function _updateUndoRedoBtns() {
    const canUndo = Editor.canUndo();
    const canRedo = Editor.canRedo();
    const undoBtn = document.getElementById('btn-undo');
    const redoBtn = document.getElementById('btn-redo');
    if (undoBtn) undoBtn.disabled = !canUndo;
    if (redoBtn) redoBtn.disabled = !canRedo;
    const ewUndo = document.getElementById('ew-undo');
    const ewRedo = document.getElementById('ew-redo');
    if (ewUndo) ewUndo.disabled = !canUndo;
    if (ewRedo) ewRedo.disabled = !canRedo;
  }

  function _onHistoryChange() {
    _updateUndoRedoBtns();
    _syncSlidersFromEffects('eff');
    _syncSlidersFromEffects('ew-eff');
    if (_isEditableImage()) _updateStatus({ dims: true });
  }

  /* ════════════════════════════════════════════
     Open / Load
  ════════════════════════════════════════════ */
  async function _openFile(filePath) {
    if (!filePath) return;
    // Prevent overlapping opens (Windows fs.watch often fires when we read the file)
    if (_openingFile && _openingFile === filePath) return;
    _openingFile = filePath;
    _showLoading(true);

    try {
      const result = await FormatSupport.loadImageFile(filePath);

      if (result.type === 'error') {
        _showPlaceholder(true);
        _updateStatus({ msg: result.message });
        _showError(
          `${I18n.t('error.openFile') || 'Failed to open file'}: ${filePath.split(/[/\\]/).pop()}`,
          result.message
        );
        return;
      }

      state.currentFile = filePath;
      state.isVideo     = result.type === 'video';
      state.isAudio     = result.type === 'audio';
      localStorage.setItem('lastOpenedFile', filePath);
      FileTree.setSelected(filePath);

      // Build file list for prev/next
      const dir = await window.electronAPI.pathDirname(filePath);
      localStorage.setItem('lastOpenedDir', dir);
      window.electronAPI.setLastOpenDir(dir);
      _watchDir(dir);
      state.fileList  = await FileTree.getImageFilesInDir(dir);
      state.fileIndex = FileTree.indexOfPath
        ? FileTree.indexOfPath(state.fileList, filePath)
        : state.fileList.indexOf(filePath);

      if (state.isVideo) {
        _showAudioPlayer(null);
        _showVideoPlayer(filePath);
      } else if (state.isAudio) {
        _showVideoPlayer(null);
        _showAudioPlayer(filePath);
      } else {
        _showVideoPlayer(null);
        _showAudioPlayer(null);
        if (!result.dataUrl) {
          _showPlaceholder(true);
          _showError(
            `${I18n.t('error.openFile') || 'Failed to open file'}: ${filePath.split(/[/\\]/).pop()}`,
            'Empty image data'
          );
          return;
        }
        await _loadImageDataUrl(result.dataUrl, filePath, result.dicomMeta);
      }

      // Ignore spurious watch events caused by our own read
      _ignoreWatchUntil = Date.now() + 800;
      _watchCurrentFile(filePath);

      // Clear dirty AFTER loadImage so the render triggered by loadImage doesn't persist dirty
      _clearDirty();
      await _updateInfoPanel(filePath, result.dicomMeta ?? null);
      _updateNavButtons();
      if (state.isVideo) _updateToolbarForMedia('video');
      else if (state.isAudio) _updateToolbarForMedia('audio');
      else _updateToolbarForMedia('image');
      _prefetchConvertedNeighbors();
    } catch (e) {
      console.error('Error opening file:', e);
      _showError(
        `${I18n.t('error.openFile') || 'Failed to open file'}: ${filePath.split(/[/\\]/).pop()}`,
        e
      );
    } finally {
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

  function _showVideoPlayer(filePath) {
    if (filePath) {
      displayCanvas.style.display = 'none';
      selCanvas.style.display     = 'none';
      videoEl.style.display       = 'flex';
      imagePlaceholder.style.display = 'none';
      videoEl.src = '';
      videoEl.load();
      window.electronAPI.getFileUrl(filePath).then(url => {
        videoEl.src = url;
        videoEl.load();
      });
    } else {
      videoEl.style.display = 'none';
      videoEl.src = '';
    }
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

  async function _openFolder(dirPath) {
    state.currentFile = null;
    _showPlaceholder(true);
    _updateInfoPanel(null);
    _setToolbarEnabled(false);
    localStorage.setItem('lastOpenedDir', dirPath);
    window.electronAPI.setLastOpenDir(dirPath);
    if (window.electronAPI.platform === 'web') {
      await FileTree.loadDrives();
    }
    await FileTree.revealPath(dirPath);
    _watchDir(dirPath);
  }

  /* ════════════════════════════════════════════
     Zoom / Pan
  ════════════════════════════════════════════ */
  function _zoom(factor, cx, cy) {
    if (!Editor.isLoaded() && !state.isVideo) return;
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
    state.zoom = Math.min(Math.max(z, 0.02), 32);
    _applyTransform();
    _updateZoomDisplay();
    _updateStatus({ zoom: true });
  }

  function _fitToWindow() {
    if (!Editor.isLoaded() && !state.isVideo) return;
    const { w, h } = Editor.isLoaded() ? Editor.getDimensions()
      : { w: videoEl.videoWidth || 640, h: videoEl.videoHeight || 360 };
    const cw = viewerContainer.clientWidth  - 20;
    const ch = viewerContainer.clientHeight - 20;
    const z  = Math.min(cw / w, ch / h, 1);
    state.zoom = z; state.panX = 0; state.panY = 0;
    _applyTransform();
    _updateZoomDisplay();
    _updateStatus({ zoom: true });
  }

  function _actualSize() {
    if (!Editor.isLoaded() && !state.isVideo) return;
    state.zoom = 1; state.panX = 0; state.panY = 0;
    _applyTransform();
    _updateZoomDisplay();
    _updateStatus({ zoom: true });
  }

  function _applyTransform() {
    const dims = Editor.isLoaded()
      ? Editor.getDimensions()
      : { w: videoEl.videoWidth || 0, h: videoEl.videoHeight || 0 };

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

    imageWrapper.style.transform =
      `translate(calc(-50% + ${state.panX}px), calc(-50% + ${state.panY}px)) scale(${state.zoom})`;
  }

  function _updateZoomDisplay() {
    const pct = Math.round(state.zoom * 100);
    const zd = document.getElementById('zoom-display');
    if (zd) zd.value = `${pct}%`;
  }

  function _initViewerInteraction() {
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
      if (!Editor.isLoaded() && !state.isVideo) return;
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
    if (btn) btn.disabled = true;
    if (sel) sel.disabled = true;

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
      if (btn) btn.disabled = false;
      if (sel) sel.disabled = false;
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
  function _prevImage() {
    if (state.fileIndex > 0) {
      state.fileIndex--;
      _openFile(state.fileList[state.fileIndex]);
    }
  }

  function _nextImage() {
    if (state.fileIndex < state.fileList.length - 1) {
      state.fileIndex++;
      _openFile(state.fileList[state.fileIndex]);
    }
  }

  function _updateNavButtons() {
    const prevBtn = document.getElementById('btn-prev');
    const nextBtn = document.getElementById('btn-next');
    if (prevBtn) prevBtn.disabled = state.fileIndex <= 0;
    if (nextBtn) nextBtn.disabled = state.fileIndex >= state.fileList.length - 1;
  }

  /* ════════════════════════════════════════════
     Effects Panel
  ════════════════════════════════════════════ */
  function _buildEffectsPanel() {
    _buildEffectsPanelIn('effects-content', 'eff');
    if (document.getElementById('edit-effects-content')) {
      _buildEffectsPanelIn('edit-effects-content', 'ew-eff');
      _ewEffectsBuilt = true;
    }
  }

  function _buildEffectsPanelIn(containerId, idPrefix) {
    const content = document.getElementById(containerId);
    if (!content) return;

    const sliders = [
      { key:'brightness', label:'effects.brightness', min:0,   max:200, step:1,  def:100 },
      { key:'contrast',   label:'effects.contrast',   min:0,   max:200, step:1,  def:100 },
      { key:'saturation', label:'effects.saturation', min:0,   max:200, step:1,  def:100 },
      { key:'hue',        label:'effects.hue',        min:-180,max:180, step:1,  def:0 },
      { key:'blur',       label:'effects.blur',       min:0,   max:20,  step:0.5,def:0 },
      { key:'sharpen',    label:'effects.sharpen',    min:0,   max:100, step:1,  def:0 },
      { key:'vignette',   label:'effects.vignette',   min:0,   max:100, step:1,  def:0 },
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
    const activePreset = content.querySelector('.preset-btn.active')?.dataset?.preset || null;

    content.innerHTML = '';

    // Presets
    const presetsLabel = document.createElement('div');
    presetsLabel.style.cssText = 'font-size:11px;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;font-weight:700;';
    presetsLabel.setAttribute('data-i18n', 'effects.presets');
    presetsLabel.textContent = I18n.t('effects.presets');
    content.appendChild(presetsLabel);

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
      { id: 'polaroid',     label: 'effects.polaroid' },
      { id: 'lomo',         label: 'effects.lomo' },
      { id: 'dramatic',     label: 'effects.dramatic' },
      { id: 'warm',         label: 'effects.warmPreset' },
      { id: 'golden',       label: 'effects.golden' },
      { id: 'sunset',       label: 'effects.sunset' },
      { id: 'cool',         label: 'effects.cool' },
      { id: 'arctic',       label: 'effects.arctic' },
      { id: 'moonlight',    label: 'effects.moonlight' },
      { id: 'cyanotype',    label: 'effects.cyanotype' },
      { id: 'tealorange',   label: 'effects.tealorange' },
      { id: 'crossprocess', label: 'effects.crossprocess' },
      { id: 'neon',         label: 'effects.neon' },
      { id: 'soft',         label: 'effects.soft' },
      { id: 'haze',         label: 'effects.haze' },
      { id: 'crisp',        label: 'effects.crisp' },
      { id: 'clarity',      label: 'effects.clarity' },
      { id: 'bleach',       label: 'effects.bleach' },
      { id: 'highkey',      label: 'effects.highkey' },
      { id: 'lowkey',       label: 'effects.lowkey' },
      { id: 'documentary',  label: 'effects.documentary' },
      { id: 'emboss',       label: 'effects.emboss' },
      { id: 'edge',         label: 'effects.edge' },
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
        presetWrap.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        Editor.applyPreset(p.id);
        _syncSlidersFromEffects(idPrefix);
      });
      presetWrap.appendChild(btn);
    });
    content.appendChild(presetWrap);

    const divEl = document.createElement('hr');
    divEl.style.cssText = 'border:none;border-top:1px solid var(--border);margin:8px 0';
    content.appendChild(divEl);

    const efx = Editor.getEffects?.() || {};
    for (const s of sliders) {
      const group = document.createElement('div');
      group.className = 'effect-group';

      const row = document.createElement('div');
      row.className = 'effect-label-row';

      const lbl = document.createElement('span');
      lbl.className = 'effect-label';
      lbl.setAttribute('data-i18n', s.label);
      lbl.textContent = I18n.t(s.label);
      row.appendChild(lbl);

      const initial = prevValues[s.key] != null
        ? prevValues[s.key]
        : (efx[s.key] != null ? efx[s.key] : s.def);

      const valSpan = document.createElement('span');
      valSpan.className = 'effect-value';
      valSpan.id = `${idPrefix}-val-${s.key}`;
      valSpan.textContent = initial;
      row.appendChild(valSpan);

      const slider = document.createElement('input');
      slider.type  = 'range';
      slider.className = 'effect-slider';
      slider.id    = `${idPrefix}-${s.key}`;
      slider.min   = s.min; slider.max = s.max; slider.step = s.step;
      slider.value = initial;

      slider.addEventListener('input', () => {
        valSpan.textContent = parseFloat(slider.value);
      });
      slider.addEventListener('change', () => {
        const v = parseFloat(slider.value);
        valSpan.textContent = v;
        Editor.setEffect(s.key, v);
        presetWrap.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
      });

      group.appendChild(row);
      group.appendChild(slider);
      content.appendChild(group);
    }
  }

  function _syncSlidersFromEffects(idPrefix = 'eff') {
    const efx = Editor.getEffects();
    for (const key in efx) {
      const slider = document.getElementById(`${idPrefix}-${key}`);
      const valEl  = document.getElementById(`${idPrefix}-val-${key}`);
      if (slider) slider.value = efx[key];
      if (valEl)  valEl.textContent = efx[key];
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

  function _openEditWindow() {
    if (!_isEditableImage()) return;
    if (state.editMode) return;

    // Build the effects panel inside the edit window (first time)
    _buildEditEffectsPanel();

    // Move image-wrapper into edit canvas area
    editCanvasArea.appendChild(imageWrapper);

    editWindow.classList.add('visible');
    state.editMode = true;
    document.body.classList.add('edit-mode');
    document.getElementById('edit-window-title').textContent =
      (state.currentFile ? state.currentFile.split(/[/\\]/).pop() + ' — ' : '') +
      I18n.t('editWindow.title');

    Editor.clearSelection();
    _setTool('pointer');
    _ewSetTool('pointer');
    _ewUpdateSelBtns();
    _updateUndoRedoBtns();
    state._editDirtyAtOpen = state.isDirty;
    Editor.beginEditSession();

    // Wire icons on first open
    _initEditWindowOnce();

    // Fit image after layout is ready
    requestAnimationFrame(() => {
      _syncWindowMinSize();
      _ewFit();
    });
  }

  function _closeEditWindow(apply) {
    if (!state.editMode && !editWindow.classList.contains('visible')) {
      // still ensure wrapper is in viewer
      if (imageWrapper && !viewerContainer.contains(imageWrapper)) {
        viewerContainer.appendChild(imageWrapper);
      }
      return;
    }

    editWindow.classList.remove('visible');
    state.editMode = false;
    document.body.classList.remove('edit-mode');

    // Move image-wrapper back to main viewer container
    viewerContainer.appendChild(imageWrapper);

    if (apply) {
      Editor.commitEditSession();
    } else {
      Editor.revertEditSession();
      _syncSlidersFromEffects('eff');
      _syncSlidersFromEffects('ew-eff');
      document.getElementById('effects-content')?.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
      document.getElementById('edit-effects-content')?.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
      if (!state._editDirtyAtOpen) _clearDirty();
    }
    state._editDirtyAtOpen = undefined;

    Editor.clearSelection();
    _ewSetTool('pointer');
    _setTool('pointer');

    // Fit image in main viewer
    if (_isEditableImage()) _fitToWindow();
    _updateUndoRedoBtns();
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
      btn.addEventListener('click', action);
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
    document.getElementById('ew-save')?.addEventListener('click', () => { _saveEditedAs(); });
    Tooltip.attach(document.getElementById('ew-save'), () => I18n.t('context.saveEdited'));
    document.getElementById('ew-apply')?.addEventListener('click', () => _closeEditWindow(true));
    document.getElementById('ew-cancel')?.addEventListener('click', () => _closeEditWindow(false));

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
      const el = document.getElementById(id);
      if (el) el.disabled = !hasSel;
    });
  }

  function _ewFit() {
    const { w, h } = Editor.getDimensions();
    const cw = editCanvasArea.clientWidth  - 20;
    const ch = editCanvasArea.clientHeight - 20;
    _ewZoom = Math.min(cw / w, ch / h, 1);
    _ewPanX = 0; _ewPanY = 0;
    _ewApplyTransform();
  }

  function _ewZoomBy(factor) {
    _ewZoom = Math.min(Math.max(_ewZoom * factor, 0.02), 32);
    _ewApplyTransform();
  }

  function _ewApplyTransform() {
    const { w, h } = Editor.getDimensions();
    const cw = editCanvasArea.clientWidth, ch = editCanvasArea.clientHeight;
    const scaledW = w * _ewZoom, scaledH = h * _ewZoom;
    if (scaledW <= cw) _ewPanX = 0;
    else { const m=(scaledW-cw)/2; _ewPanX=Math.max(-m,Math.min(m,_ewPanX)); }
    if (scaledH <= ch) _ewPanY = 0;
    else { const m=(scaledH-ch)/2; _ewPanY=Math.max(-m,Math.min(m,_ewPanY)); }
    imageWrapper.style.transform =
      `translate(calc(-50% + ${_ewPanX}px), calc(-50% + ${_ewPanY}px)) scale(${_ewZoom})`;
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
      { icon: Icons.save,     label: t('context.saveEdited'), action: () => { _saveEditedAs(); } },
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
    _buildEffectsPanelIn('edit-effects-content', 'ew-eff');
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

    // Native save dialog — suggested name is editable by the user
    const dlgResult = await window.electronAPI.showSaveDialog({ defaultPath });
    if (!dlgResult || dlgResult.canceled) return false;

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

  function _collectInfoSections(filePath, stats, meta, dicomMeta) {
    const isDicom = FormatSupport.isDcm(filePath);
    const tags  = (!isDicom && meta && meta.tags) ? meta.tags : {};
    const basic = (!isDicom && meta && meta.basic) ? meta.basic : {};
    const ext   = FormatSupport.getExtension(filePath).toUpperCase();
    const name  = filePath.split(/[/\\]/).pop();
    const dims  = Editor.isLoaded() ? Editor.getDimensions() : { w: 0, h: 0 };
    const w = dims.w || basic.width;
    const h = dims.h || basic.height;

    const fileRows = [];
    _pushRow(fileRows, 'info.name', name);
    _pushRow(fileRows, 'info.size', stats && !stats.error
      ? `${FormatSupport.formatFileSize(stats.size)} (${stats.size.toLocaleString()} B)`
      : null);
    _pushRow(fileRows, 'info.dimensions', w && h ? `${w} × ${h} px` : null);
    _pushRow(fileRows, 'info.format', basic.format ? `${ext} (${basic.format})` : ext);
    _pushRow(fileRows, 'info.modified', stats && !stats.error ? FormatSupport.formatDate(stats.modified) : null);
    _pushRow(fileRows, 'info.created', stats && !stats.error ? FormatSupport.formatDate(stats.created) : null);
    _pushRow(fileRows, 'info.accessed', stats && !stats.error && stats.accessed ? FormatSupport.formatDate(stats.accessed) : null);
    _pushRow(fileRows, 'info.changed', stats && !stats.error && stats.changed ? FormatSupport.formatDate(stats.changed) : null);
    const colorSpace = _fmtMetaScalar(_pickTag(tags, ['ColorSpace'])) || basic.space || null;
    _pushRow(fileRows, 'info.colorSpace', colorSpace);
    const dpi = _pickTag(tags, ['XResolution', 'YResolution']);
    if (dpi) _pushRow(fileRows, 'info.dpi', _fmtMetaScalar(dpi));
    _pushRow(fileRows, 'info.channels', basic.channels != null ? String(basic.channels) : null);
    _pushRow(fileRows, 'info.depth', basic.depth || null);
    _pushRow(fileRows, 'info.alpha', basic.hasAlpha === true ? 'Yes' : null);
    _pushRow(fileRows, 'info.chroma', basic.chromaSubsampling || null);
    _pushRow(fileRows, 'info.compression', basic.compression || null);
    _pushRow(fileRows, 'info.pages', basic.pages != null && basic.pages > 1 ? String(basic.pages) : null);
    _pushRow(fileRows, 'info.profile', basic.hasProfile === true ? 'Yes' : null);

    const captureRows = [];
    const locRows = [];
    const otherRows = [];
    if (!isDicom) {
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
      _pushRow(captureRows, 'info.software', _fmtMetaScalar(_pickTag(tags, ['Software'])));
      _pushRow(captureRows, 'info.artist', _fmtMetaScalar(_pickTag(tags, ['Artist', 'Creator', 'OwnerName'])));
      _pushRow(captureRows, 'info.copyright', _fmtMetaScalar(_pickTag(tags, ['Copyright'])));
      _pushRow(captureRows, 'info.description', _fmtMetaScalar(_pickTag(tags, ['ImageDescription', 'Description', 'Caption', 'CaptionAbstract'])));
      _pushRow(captureRows, 'info.keywords', _fmtMetaScalar(_pickTag(tags, ['Keywords', 'Subject'])));

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

      const dump = (meta && meta.all && Object.keys(meta.all).length) ? meta.all : tags;
      for (const [key, raw] of Object.entries(dump)) {
        if (_skipDumpKey(key)) continue;
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
    if (state.isVideo || state.isAudio || FormatSupport.isDcm(filePath)) return null;
    if (!window.electronAPI.readImageMeta) return null;
    try {
      state.imageMeta = await window.electronAPI.readImageMeta(filePath);
    } catch {
      state.imageMeta = null;
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
    const sections = _collectInfoSections(filePath, stats, meta, state.dicomMeta);
    infoContent.innerHTML = _renderInfoSections(sections);
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
    displayCanvas.style.display  = show ? 'none' : 'block';
    selCanvas.style.display      = show ? 'none' : 'block';
    if (show) {
      _showVideoPlayer(null);
      _showAudioPlayer(null);
    }
  }

  function _showLoading(show) {
    loadingOverlay.style.display = show ? 'flex' : 'none';
    loadingOverlay.textContent   = I18n.t('status.loading');
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

    return { show, set, hide, startCreep, stopCreep, yieldFrame };
  })();

  // Expose globally so formatSupport.js and other modules can use it
  window._showAppError = _showError;

  /* ════════════════════════════════════════════
     File Tree Context Menu
  ════════════════════════════════════════════ */
  async function _exportSelectionToFolder(paths, mode) {
    const t = I18n.t.bind(I18n);
    if (!paths?.length) return;
    const picked = await window.electronAPI.pickDirectory({
      title: mode === 'move' ? t('dialog.moveToFolder') : t('dialog.copyToFolder'),
    });
    if (picked.canceled || !picked.path) return;

    const result = await window.electronAPI.transferIntoDir({
      sources: paths,
      destDir: picked.path,
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

    ContextMenu.show(x, y, [
      { icon: Icons.openFile,   label: t('context.openFile'),   action: () => window.electronAPI.openFileDialog() },
      { icon: Icons.openFolder, label: t('context.openFolder'), action: () => window.electronAPI.openFolderDialog() },
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
      (hasImg || state.isVideo) && { icon: Icons.zoomIn,    label: t('context.zoomIn'),    shortcut:'Ctrl++', action: () => _zoom(1.25) },
      (hasImg || state.isVideo) && { icon: Icons.zoomOut,   label: t('context.zoomOut'),   shortcut:'Ctrl+-', action: () => _zoom(0.8) },
      (hasImg || state.isVideo) && { icon: Icons.fitWindow, label: t('context.fitWindow'), shortcut:'Ctrl+0', action: _fitToWindow },
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
      const ctrl = e.ctrlKey || e.metaKey;

      if (ctrl && e.key === 'o') { e.preventDefault(); window.electronAPI.openFileDialog(); return; }
      if (ctrl && e.shiftKey && e.key === 'O') { e.preventDefault(); window.electronAPI.openFolderDialog(); return; }
      if (ctrl && (e.key === '=' || e.key === '+')) { e.preventDefault(); _zoom(1.25); return; }
      if (ctrl && e.key === '-') { e.preventDefault(); _zoom(0.8); return; }
      if (ctrl && e.key === '0') { e.preventDefault(); _fitToWindow(); return; }
      if (ctrl && e.key === '1') { e.preventDefault(); _actualSize(); return; }
      if (ctrl && e.key === '[') { e.preventDefault(); _rotate(-90); return; }
      if (ctrl && e.key === ']') { e.preventDefault(); _rotate(90); return; }
      if (ctrl && e.key === 'e') { e.preventDefault(); _openEditWindow(); return; }
      if (ctrl && e.key === 's') {
        e.preventDefault();
        if (state.editMode) _saveEditedAs();
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
      if (e.key === 'Escape') {
        if (state.editMode) {
          e.preventDefault();
          _closeEditWindow(false);
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
    if (el) { el.style.display = 'flex'; el.classList.add('visible'); }
  }

  function _hideDialog(id) {
    const el = document.getElementById(id);
    if (el) { el.style.display = 'none'; el.classList.remove('visible'); }
  }

  document.querySelectorAll('[data-close-dialog]').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.closest('.dialog-overlay');
      if (target) { target.style.display = 'none'; target.classList.remove('visible'); }
    });
  });

  document.querySelectorAll('.dialog-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) { overlay.style.display = 'none'; overlay.classList.remove('visible'); }
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

})();
