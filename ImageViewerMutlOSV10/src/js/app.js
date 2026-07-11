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
    isVideo:      false,
    isAudio:      false,
    isDirty:      false,
  };

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
    (hasSel) => _onSelectionChange(hasSel)
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

  /* ─── Effects panel sliders ─── */
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
      { id:'btn-undo',        icon:'reset',      tip:'toolbar.undo',       action: () => { Editor.undo(); _updateUndoRedoBtns(); }, disabled: true },
      { id:'btn-redo',        icon:'next',       tip:'toolbar.redo',       action: () => { Editor.redo(); _updateUndoRedoBtns(); }, disabled: true },
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
      { id:'btn-edit',        icon:'effects',    tip:'toolbar.edit',       action: _openEditWindow, disabled: true },
      { spacer: true },
      { id:'btn-info',        icon:'info',       tip:'menu.about',         action: () => _showDialog('about-overlay') },
      { separator: true },
      { id:'btn-theme',       icon: state.theme === 'dark' ? 'sun' : 'moon', tip:'toolbar.theme', action: _toggleTheme },
      { id:'btn-lang',        icon:null,         tip:'toolbar.lang',       action: _toggleLang, langBtn: true },
    ];

    // Keep zoom display element before clearing
    const zoomWrap = document.getElementById('zoom-input-wrap');
    toolbar.innerHTML = '';
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
        const span = document.createElement('span');
        span.className = 'lang-text';
        span.textContent = state.lang === 'ko' ? 'KO' : 'EN';
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

    _updateZoomDisplay();
  }

  function _setToolbarEnabled(enabled) {
    const ids = ['btn-save','btn-zoom-in','btn-zoom-out','btn-fit','btn-actual',
                 'btn-rotate-l','btn-rotate-r','btn-flip-h','btn-flip-v',
                 'btn-prev','btn-next','btn-edit'];
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.disabled = !enabled;
    });
    if (!enabled) {
      document.getElementById('btn-undo').disabled = true;
      document.getElementById('btn-redo').disabled = true;
    }
  }

  function _updateUndoRedoBtns() {
    const undoBtn = document.getElementById('btn-undo');
    const redoBtn = document.getElementById('btn-redo');
    if (undoBtn) undoBtn.disabled = !Editor.canUndo();
    if (redoBtn) redoBtn.disabled = !Editor.canRedo();
    // Also update edit-window buttons
    const ewUndo = document.getElementById('ew-undo');
    const ewRedo = document.getElementById('ew-redo');
    if (ewUndo) ewUndo.disabled = !Editor.canUndo();
    if (ewRedo) ewRedo.disabled = !Editor.canRedo();
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
      await _updateInfoPanel(filePath, result.dicomMeta);
      _updateNavButtons();
      _setToolbarEnabled(true);
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

  function _removeBackground() {
    if (!Editor.hasSelection()) return;
    Editor.removeBackground(false); // remove outside selection
    Editor.clearSelection();
  }

  /* ════════════════════════════════════════════
     Transform
  ════════════════════════════════════════════ */
  function _rotate(deg) {
    if (!Editor.isLoaded()) return;
    Editor.rotate(deg);
    _fitToWindow();
    _updateStatus({ dims: true });
  }

  function _flip(axis) {
    if (!Editor.isLoaded()) return;
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

    content.innerHTML = '';

    // Presets
    const presetsLabel = document.createElement('div');
    presetsLabel.style.cssText = 'font-size:11px;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;font-weight:700;';
    presetsLabel.textContent = I18n.t('effects.presets');
    content.appendChild(presetsLabel);

    const presets = [
      { id:'grayscale', label:'effects.grayscale' },
      { id:'sepia',     label:'effects.sepia' },
      { id:'invert',    label:'effects.invert' },
      { id:'vivid',     label:'effects.vivid' },
      { id:'fade',      label:'effects.fade' },
      { id:'vintage',   label:'effects.vintage' },
      { id:'dramatic',  label:'effects.dramatic' },
      { id:'warm',      label:'effects.warmPreset' },
      { id:'cool',      label:'effects.cool' },
      { id:'emboss',    label:'effects.emboss' },
    ];

    const presetWrap = document.createElement('div');
    presetWrap.className = 'effect-presets';
    presets.forEach(p => {
      const btn = document.createElement('button');
      btn.className = 'preset-btn';
      btn.textContent = I18n.t(p.label);
      btn.dataset.preset = p.id;
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

    for (const s of sliders) {
      const group = document.createElement('div');
      group.className = 'effect-group';

      const row = document.createElement('div');
      row.className = 'effect-label-row';

      const lbl = document.createElement('span');
      lbl.className = 'effect-label';
      lbl.textContent = I18n.t(s.label);
      row.appendChild(lbl);

      const valSpan = document.createElement('span');
      valSpan.className = 'effect-value';
      valSpan.id = `${idPrefix}-val-${s.key}`;
      valSpan.textContent = s.def;
      row.appendChild(valSpan);

      const slider = document.createElement('input');
      slider.type  = 'range';
      slider.className = 'effect-slider';
      slider.id    = `${idPrefix}-${s.key}`;
      slider.min   = s.min; slider.max = s.max; slider.step = s.step;
      slider.value = s.def;

      slider.addEventListener('input', () => {
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
    if (!Editor.isLoaded()) return;

    // Build the effects panel inside the edit window (first time)
    _buildEditEffectsPanel();

    // Move image-wrapper into edit canvas area
    editCanvasArea.appendChild(imageWrapper);

    editWindow.classList.add('visible');
    document.getElementById('edit-window-title').textContent =
      (state.currentFile ? state.currentFile.split(/[/\\]/).pop() + ' — ' : '') +
      I18n.t('editWindow.title');

    _ewSetTool('pointer');
    _updateUndoRedoBtns();

    // Wire icons on first open
    _initEditWindowOnce();

    // Fit image after layout is ready
    requestAnimationFrame(() => _ewFit());
  }

  function _closeEditWindow(apply) {
    editWindow.classList.remove('visible');

    // Move image-wrapper back to main viewer container
    viewerContainer.appendChild(imageWrapper);

    if (!apply) {
      // Cancel: undo all changes made during this edit session
      // (already tracked in history; user can undo manually)
    }

    Editor.clearSelection();
    _ewSetTool('pointer');
    _setTool('pointer');

    // Fit image in main viewer
    _fitToWindow();
    _updateUndoRedoBtns();
  }

  let _ewInitDone = false;
  let _ewZoom = 1, _ewPanX = 0, _ewPanY = 0;
  let _ewPanning = false, _ewPanStartX = 0, _ewPanStartY = 0, _ewPanOriginX = 0, _ewPanOriginY = 0;

  function _initEditWindowOnce() {
    if (_ewInitDone) return;
    _ewInitDone = true;

    const toolMap = [
      { id:'ew-tool-pointer', tool:'pointer',    icon:'pointer',    tip:'toolbar.toolPointer' },
      { id:'ew-tool-rect',    tool:'rect-select',icon:'rectSelect', tip:'toolbar.toolRect' },
      { id:'ew-tool-lasso',   tool:'lasso',      icon:'lasso',      tip:'toolbar.toolLasso' },
      { id:'ew-tool-polygon', tool:'polygon',    icon:'polygon',    tip:'toolbar.toolPolygon' },
      { id:'ew-tool-magic',   tool:'magic-wand', icon:'magicWand',  tip:'toolbar.toolMagic' },
    ];
    toolMap.forEach(({ id, tool, icon, tip }) => {
      const btn = document.getElementById(id);
      if (!btn) return;
      btn.innerHTML = Icons[icon] || '';
      btn.addEventListener('click', () => _ewSetTool(tool));
      Tooltip.attach(btn, () => I18n.t(tip));
    });

    // Set icons
    [
      ['ew-cut',       'cut',         'context.cut',          () => _ewCut()],
      ['ew-copy',      'copy',        'context.copy',         () => _ewCopy()],
      ['ew-bg-remove', 'bgRemove',    'toolbar.bgRemove',     () => { Editor.removeBackground(false); Editor.clearSelection(); _ewUpdateSelBtns(); _updateUndoRedoBtns(); }],
      ['ew-crop-sel',  'fitWindow',   'editWindow.cropSel',   () => { Editor.cropToSelection(); _ewUpdateSelBtns(); _updateUndoRedoBtns(); _ewFit(); }],
      ['ew-clear-sel', 'close',       'editWindow.clearSel',  () => { Editor.clearSelection(); _ewUpdateSelBtns(); }],
      ['ew-rotate-l',  'rotateLeft',  'toolbar.rotateLeft',   () => { Editor.rotate(-90); _ewFit(); _updateUndoRedoBtns(); }],
      ['ew-rotate-r',  'rotateRight', 'toolbar.rotateRight',  () => { Editor.rotate(90);  _ewFit(); _updateUndoRedoBtns(); }],
      ['ew-flip-h',    'flipH',       'toolbar.flipH',        () => { Editor.flip('h'); _updateUndoRedoBtns(); }],
      ['ew-flip-v',    'flipV',       'toolbar.flipV',        () => { Editor.flip('v'); _updateUndoRedoBtns(); }],
      ['ew-undo',      'reset',       'editWindow.undo',      () => { Editor.undo(); _updateUndoRedoBtns(); }],
      ['ew-redo',      'next',        'editWindow.redo',      () => { Editor.redo(); _updateUndoRedoBtns(); }],
      ['ew-zoom-in',   'zoomIn',      'toolbar.zoomIn',       () => _ewZoomBy(1.25)],
      ['ew-zoom-out',  'zoomOut',     'toolbar.zoomOut',      () => _ewZoomBy(0.8)],
      ['ew-fit',       'fitWindow',   'toolbar.fitWindow',    () => _ewFit()],
    ].forEach(([id, icon, tip, action]) => {
      const btn = document.getElementById(id);
      if (!btn) return;
      btn.innerHTML = Icons[icon] || '';
      btn.addEventListener('click', action);
      Tooltip.attach(btn, () => I18n.t(tip));
    });

    // Apply / Cancel
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
    ['ew-cut','ew-copy','ew-bg-remove','ew-crop-sel','ew-clear-sel'].forEach(id => {
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
      { icon: Icons.cut,      label: t('context.cut'),      disabled: !hasSel, action: _ewCut },
      { icon: Icons.copy,     label: t('context.copy'),     disabled: !hasSel, action: _ewCopy },
      { separator: true },
      { icon: Icons.bgRemove, label: t('toolbar.bgRemove'), disabled: !hasSel, action: () => { Editor.removeBackground(false); Editor.clearSelection(); _ewUpdateSelBtns(); _updateUndoRedoBtns(); } },
      { icon: Icons.fitWindow, label: t('editWindow.cropSel'), disabled: !hasSel, action: () => { Editor.cropToSelection(); _ewUpdateSelBtns(); _updateUndoRedoBtns(); _ewFit(); } },
      { icon: Icons.close,  label: t('editWindow.clearSel'),disabled: !hasSel, action: () => { Editor.clearSelection(); _ewUpdateSelBtns(); } },
      { separator: true },
      { icon: Icons.rotateLeft,  label: t('menu.rotateLeft'),  action: () => { Editor.rotate(-90); _ewFit(); _updateUndoRedoBtns(); } },
      { icon: Icons.rotateRight, label: t('menu.rotateRight'), action: () => { Editor.rotate(90);  _ewFit(); _updateUndoRedoBtns(); } },
      { icon: Icons.flipH,       label: t('menu.flipHorizontal'), action: () => Editor.flip('h') },
      { icon: Icons.flipV,       label: t('menu.flipVertical'),   action: () => Editor.flip('v') },
      { separator: true },
      { icon: Icons.reset, label: t('editWindow.undo'), disabled: !Editor.canUndo(), action: () => { Editor.undo(); _updateUndoRedoBtns(); } },
      { icon: Icons.next,  label: t('editWindow.redo'), disabled: !Editor.canRedo(), action: () => { Editor.redo(); _updateUndoRedoBtns(); } },
      { separator: true },
      { icon: Icons.effects, label: t('effects.reset'), action: () => { Editor.resetEffects(); _syncSlidersFromEffects('ew-eff'); document.getElementById('edit-effects-content')?.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active')); } },
    ]);
  }

  let _ewEffectsBuilt = false;
  function _buildEditEffectsPanel() {
    if (_ewEffectsBuilt) return;
    _ewEffectsBuilt = true;
    _buildEffectsPanelIn('edit-effects-content', 'ew-eff');
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

  async function _saveAs(andClose = false) {
    if (!Editor.isLoaded()) return false;

    const basename = state.currentFile
      ? state.currentFile.split(/[/\\]/).pop().replace(/\.[^.]+$/, '') + '.png'
      : 'image.png';

    // Show save dialog first to get path + format choice
    const dlgResult = await window.electronAPI.showSaveDialog({ defaultPath: basename });
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
  async function _updateInfoPanel(filePath, dicomMeta) {
    if (!infoContent) return;
    if (!filePath) {
      infoContent.innerHTML = `<div class="info-no-file" data-i18n="info.noFile">${I18n.t('info.noFile')}</div>`;
      return;
    }

    const stats = await window.electronAPI.getFileStats(filePath);
    const ext   = FormatSupport.getExtension(filePath).toUpperCase();
    const name  = filePath.split(/[/\\]/).pop();
    const dims  = Editor.isLoaded() ? Editor.getDimensions() : { w: 0, h: 0 };

    const rows = [
      { label: 'info.name',      value: name },
      { label: 'info.size',      value: stats && !stats.error ? FormatSupport.formatFileSize(stats.size) : '—' },
      { label: 'info.dimensions',value: dims.w && dims.h ? `${dims.w} × ${dims.h} px` : '—' },
      { label: 'info.format',    value: ext },
      { label: 'info.modified',  value: stats && !stats.error ? FormatSupport.formatDate(stats.modified) : '—' },
      { label: 'info.created',   value: stats && !stats.error ? FormatSupport.formatDate(stats.created) : '—' },
    ];

    if (dicomMeta) {
      if (dicomMeta.patientName) rows.push({ label: 'info.patient', value: dicomMeta.patientName });
      if (dicomMeta.modality)    rows.push({ label: 'info.modality',value: dicomMeta.modality });
      if (dicomMeta.studyDate)   rows.push({ label: 'info.studyDate',value: dicomMeta.studyDate });
    }

    infoContent.innerHTML = rows.map(r =>
      `<div class="info-row">
        <div class="info-label">${I18n.t(r.label)}</div>
        <div class="info-value" title="${r.value}">${r.value}</div>
      </div>`
    ).join('');
  }

  async function _showFileInfoDialog() {
    if (!state.currentFile) return;
    const filePath = state.currentFile;
    const stats = await window.electronAPI.getFileStats(filePath);
    const ext   = FormatSupport.getExtension(filePath).toUpperCase();
    const name  = filePath.split(/[/\\]/).pop();
    const dims  = Editor.isLoaded() ? Editor.getDimensions() : { w: 0, h: 0 };
    const t = I18n.t.bind(I18n);

    const rows = [
      { label: t('info.name'),       value: name },
      { label: t('info.format'),     value: ext },
      { label: t('info.dimensions'), value: dims.w && dims.h ? `${dims.w} × ${dims.h} px` : '—' },
      { label: t('info.size'),       value: stats && !stats.error ? FormatSupport.formatFileSize(stats.size) : '—' },
      { label: t('info.modified'),   value: stats && !stats.error ? FormatSupport.formatDate(stats.modified) : '—' },
      { label: t('info.created'),    value: stats && !stats.error ? FormatSupport.formatDate(stats.created) : '—' },
    ];

    const html = rows.map(r =>
      `<div class="info-row"><div class="info-label">${r.label}</div><div class="info-value" title="${r.value}">${r.value}</div></div>`
    ).join('');

    const pathRow = `<div class="info-row info-path-row"><div class="info-label">${t('info.path') || 'Path'}</div><div class="info-value info-path-val" title="${filePath}">${filePath}</div></div>`;

    await window.electronAPI.showMessageBox({
      type: 'info',
      title: t('info.title'),
      message: name,
      detail: rows.map(r => `${r.label}: ${r.value}`).join('\n') + `\nPath: ${filePath}`,
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

  // Expose globally so formatSupport.js and other modules can use it
  window._showAppError = _showError;

  /* ════════════════════════════════════════════
     File Tree Context Menu
  ════════════════════════════════════════════ */
  function _showTreeContextMenu(entry, x, y) {
    const t = I18n.t.bind(I18n);
    const isWeb = window.electronAPI.platform === 'web';
    const isDir  = entry.isDirectory;
    const isFile = !isDir;
    const ext = FormatSupport.getExtension(entry.name);
    const isSup = FormatSupport.IMAGE_EXTS.has(ext) || FormatSupport.VIDEO_EXTS.has(ext);

    // Check if multiple items are selected
    const multiPaths = FileTree.getSelectedPaths();
    const isMulti = multiPaths.length > 1;

    if (isMulti && isFile) {
      // Multi-selection context menu
      ContextMenu.show(x, y, [
        { icon: Icons.image, label: `${t('context.openFile')} (${multiPaths.length})`,
          action: async () => { for (const p of multiPaths) await _openFile(p); } },
        { separator: true },
        { icon: Icons.copy, label: t('tree.copyPath'),
          action: () => navigator.clipboard.writeText(multiPaths.join('\n')).catch(() => {}) },
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
    const hasImg = Editor.isLoaded();
    const hasSel = Editor.hasSelection();
    const t = I18n.t.bind(I18n);
    const isWeb = window.electronAPI.platform === 'web';

    ContextMenu.show(x, y, [
      { icon: Icons.openFile,   label: t('context.openFile'),   action: () => window.electronAPI.openFileDialog() },
      { icon: Icons.openFolder, label: t('context.openFolder'), action: () => window.electronAPI.openFolderDialog() },
      { separator: true },
      { icon: Icons.save,   label: t('context.saveAs'), disabled: !hasImg, action: _saveAs },
      { icon: Icons.cut,    label: t('context.cut'),    disabled: !hasSel, action: _cutToClipboard },
      { icon: Icons.copy,   label: t('context.copy'),   disabled: !hasImg, action: _copyToClipboard },
      { separator: true },
      { icon: Icons.rotateLeft,  label: t('context.rotateLeft'),  disabled: !hasImg, action: () => _rotate(-90) },
      { icon: Icons.rotateRight, label: t('context.rotateRight'), disabled: !hasImg, action: () => _rotate(90) },
      { icon: Icons.flipH,       label: t('context.flipH'),       disabled: !hasImg, action: () => _flip('h') },
      { icon: Icons.flipV,       label: t('context.flipV'),       disabled: !hasImg, action: () => _flip('v') },
      { separator: true },
      { icon: Icons.zoomIn,    label: t('context.zoomIn'),    shortcut:'Ctrl++', disabled: !hasImg, action: () => _zoom(1.25) },
      { icon: Icons.zoomOut,   label: t('context.zoomOut'),   shortcut:'Ctrl+-', disabled: !hasImg, action: () => _zoom(0.8) },
      { icon: Icons.fitWindow, label: t('context.fitWindow'), shortcut:'Ctrl+0', disabled: !hasImg, action: _fitToWindow },
      { icon: Icons.actualSize,label: t('context.actualSize'),shortcut:'Ctrl+1', disabled: !hasImg, action: _actualSize },
      { separator: true },
      { icon: Icons.bgRemove, label: t('context.bgRemove'), disabled: !hasSel, action: _removeBackground },
      { icon: Icons.reset,    label: t('context.resetAll'), disabled: !hasImg, action: _resetAll },
      { separator: true },
      { icon: Icons.effects, label: t('context.effects'), action: _toggleEffectsPanel },
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
    if (!Editor.isLoaded()) return;
    Editor.resetTransform();
    Editor.resetEffects();
    _syncSlidersFromEffects();
    _fitToWindow();
  }

  /* ════════════════════════════════════════════
     Theme / Language
  ════════════════════════════════════════════ */
  function _applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme === 'light' ? 'light' : '');
    state.theme = theme;
    localStorage.setItem('theme', theme);
    const btn = document.getElementById('btn-theme');
    if (btn) btn.innerHTML = Icons[theme === 'dark' ? 'sun' : 'moon'];
  }

  function _toggleTheme() {
    _applyTheme(state.theme === 'dark' ? 'light' : 'dark');
    _syncMenu();
  }

  async function _toggleLang() {
    state.lang = state.lang === 'en' ? 'ko' : 'en';
    localStorage.setItem('lang', state.lang);
    await I18n.loadLanguage(state.lang);
    I18n.applyToDOM();
    // Update dynamic text
    _buildEffectsPanel();
    _updateStatus();
    if (state.currentFile) await _updateInfoPanel(state.currentFile);
    const langBtn = document.getElementById('btn-lang');
    if (langBtn) {
      const span = langBtn.querySelector('.lang-text');
      if (span) span.textContent = state.lang === 'ko' ? 'KO' : 'EN';
    }
    _syncMenu();
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
      if (ctrl && e.shiftKey && e.key === 'S') { e.preventDefault(); _saveAs(); return; }
      if (ctrl && e.key === 'z') { e.preventDefault(); Editor.undo(); _updateUndoRedoBtns(); return; }
      if (ctrl && e.key === 'y') { e.preventDefault(); Editor.redo(); _updateUndoRedoBtns(); return; }
      if (ctrl && e.key === 'x') { e.preventDefault(); _cutToClipboard(); return; }
      if (ctrl && e.key === 'c') { e.preventDefault(); _copyToClipboard(); return; }

      if (e.key === 'ArrowLeft')  { e.preventDefault(); _prevImage(); return; }
      if (e.key === 'ArrowRight') { e.preventDefault(); _nextImage(); return; }
      if (e.key === 'Escape') {
        Editor.clearSelection();
        _setTool('pointer');
        return;
      }
      if (e.key === 'F11') { e.preventDefault(); return; } // handled by Electron
    });
  }

  /* ════════════════════════════════════════════
     Menu actions from main process
  ════════════════════════════════════════════ */
  async function _handleMenuAction(action) {
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
      'show-effects':  _toggleEffectsPanel,
      'effect-grayscale': () => Editor.applyPreset('grayscale'),
      'effect-sepia':     () => Editor.applyPreset('sepia'),
      'effect-invert':    () => Editor.applyPreset('invert'),
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
    _updateStatus();
    if (state.currentFile) await _updateInfoPanel(state.currentFile);
    const langBtn = document.getElementById('btn-lang');
    if (langBtn) { const s = langBtn.querySelector('.lang-text'); if (s) s.textContent = state.lang === 'ko' ? 'KO' : 'EN'; }
    _syncMenu();
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
    if (!handle) return;
    let startX, startW;
    handle.addEventListener('mousedown', (e) => {
      startX = e.clientX;
      startW = sidebar.offsetWidth;
      handle.classList.add('resizing');
      const onMove = (e) => {
        const w = Math.min(Math.max(startW + (e.clientX - startX), 140), 500);
        sidebar.style.width = `${w}px`;
      };
      const onUp = () => {
        handle.classList.remove('resizing');
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    });
  }

  function _initVerticalResize() {
    const handle = document.getElementById('sidebar-v-resize');
    if (!handle) return;
    const tree = document.getElementById('file-tree-panel');
    const info = document.getElementById('info-panel');
    let startY, startH;
    handle.addEventListener('mousedown', (e) => {
      startY = e.clientY;
      startH = tree.offsetHeight;
      handle.classList.add('resizing');
      const onMove = (e) => {
        const h = Math.min(Math.max(startH + (e.clientY - startY), 80), sidebar.offsetHeight - 100);
        tree.style.flex = 'none';
        tree.style.height = `${h}px`;
      };
      const onUp = () => {
        handle.classList.remove('resizing');
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    });
  }

})();
