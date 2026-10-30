/* Main application orchestrator */
(async () => {
  /* ─── State ─── */
  const state = {
    lang:         localStorage.getItem('lang')  || 'en',
    theme:        localStorage.getItem('theme') === 'custom' ? 'custom' : Themes.normalize(localStorage.getItem('theme')),
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
    subtitles:    [],
    subtitlesEnabled: localStorage.getItem('subtitlesEnabled') !== '0',
    subtitleLang: localStorage.getItem('subtitleLanguage') || '',
    isDirty:      false,
    imageMeta:    null,
    dicomMeta:    null,
    dicomTags:    null,
    dicom:        null,   // decoded DICOM session (frames / window) — see _setDicomSession
    metaForFile:  null,
  };

  // Declared before the first await: rAF callbacks below may run before later lets initialise
  // Custom theme: read by _applyTheme('custom') during init, long before its section below
  const CUSTOM_THEME_KEY = 'customThemeV1';
  // The custom theme's preset until the user picks colours (not a copy of Dark)
  const CUSTOM_THEME_DEFAULT = { bg: '#1f2433', text: '#dde3f0', accent: '#e8a33d' };
  let _appliedMinWidth = 0;
  let _ewFitW = 0, _ewFitH = 0;
  let _settingsReady = false;   // _syncSettingsDialog() is a no-op until _initSettingsDialog() ran

  // Read by the init calls further down (_initPrintDialog, _syncWindowMinSize,
  // _initEditEffectsResize), which run before the bodies below are evaluated.
  const APP_MIN_HEIGHT = 600;
  const _print = { dataUrl: null, imgW: 0, imgH: 0, printers: [], printersCache: null, printersCacheAt: 0, busy: false };
  let _editEffectsMinW = 200;

  // Panel layout: the left panel (explorer over file info) and the right panel
  // (histogram, colour wheel, adjustments), each expanded or collapsed to a rail.
  // _buildToolbar() and _initPanelLayout() read these while the module is still
  // initialising, so they have to be declared before the init calls below.
  const LAYOUT_KEY = 'panelLayoutV2';
  const _layout = { left: true, right: true };
  // Edit window: Presets (left) and Adjustments (right), each expanded or collapsed to a rail
  const EW_LAYOUT_KEY = 'editPanelLayoutV1';
  const _ewLayout = { left: true, right: true };
  const CP_SLIDERS = [
    { key:'brightness', label:'effects.brightness', min:0,    max:200, def:100 },
    { key:'contrast',   label:'effects.contrast',   min:0,    max:200, def:100 },
    { key:'saturation', label:'effects.saturation', min:0,    max:200, def:100 },
    { key:'hue',        label:'effects.hue',        min:-180, max:180, def:0 },
    { key:'warmth',     label:'effects.warmth',     min:-100, max:100, def:0 },
  ];
  const CP_TINT_DEFAULT = 35;

  let _cpWheelImage = null;     // the wheel's pixels, drawn once
  let _cpWheelDrag = null;      // { h, s } while the pointer is down on the wheel
  let _cpSyncQueued = false;
  let _detailsSections = null;  // what the Details dialog shows — "Copy all" copies it

  // Browse mode (ACDSee-style): the explorer lists folders only and the
  // selected folder is shown as a thumbnail contact sheet.
  const BROWSE_KEY = 'browseModeV1';
  let _browseMode = localStorage.getItem(BROWSE_KEY) === '1';
  // After opening a file from the contact sheet, keep the sheet from covering the
  // viewer until the user explicitly asks for it again.
  let _browseSheetHeld = false;
  // Display mode for images and video: 'window' | 'width' | 'height' | 'actual'. Re-applied on
  // open and resize while _wantFit is on; a manual zoom turns that off until a mode is picked.
  let _wantFit = true;   // re-apply the display mode on open / resize (off after a manual zoom)
  const VIEW_MODE_KEY = 'viewFitModeV1';
  let _viewMode = (() => {
    try { const v = localStorage.getItem(VIEW_MODE_KEY); return ['window', 'width', 'height', 'actual'].includes(v) ? v : 'window'; }
    catch { return 'window'; }
  })();
  // Selection preview (File Info + histogram). _initBrowse() → _syncBrowseChrome()
  // → _previewFileInfo() reads these during init.
  let _previewInfoTimer = null;
  let _histPreviewGen = 0;
  let _histPreview = null;   // { path, src, w, h } for a selected file not in the editor
  let _appInfoCache = null;
  // Ruler / grid overlays were removed from the UI; keep the paint path inert.
  const GUIDE_KEY = 'viewGuidesV1';
  let _guides = { ruler: false, grid: false };

  function _isEditableImage() {
    return (Editor.isLoaded() || state.isAnimated) && !state.isVideo && !state.isAudio;
  }

  /** Image path selected in the contact sheet (click), ready to open for edit. */
  function _browseSelectedImagePath() {
    if (!window.Browse?.isVisible?.()) return '';
    const p = Browse.getSelected?.() || '';
    if (!p || !FormatSupport.isImage(p)) return '';
    if (FormatSupport.isVideo(p) || FormatSupport.isAudio(p)) return '';
    return p;
  }

  /** Edit is allowed for the open image, or a still selected in the contact sheet. */
  function _canStartEdit() {
    return _isEditableImage() || !!_browseSelectedImagePath();
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
    // Video first: the editor still holds the last picture while a video is open
    if (state.isVideo) return { w: videoEl.videoWidth || 0, h: videoEl.videoHeight || 0 };
    if (Editor.isLoaded()) return Editor.getDimensions();
    return { w: 0, h: 0 };
  }

  /* ─── Init ─── */
  await I18n.loadLanguage(state.lang);
  _applyTheme(state.theme);
  I18n.applyToDOM();
  Tooltip.init();
  ContextMenu.init();
  _initErrorDialog();
  _initPrintDialog();
  // Popup title bars: icon + label (static dialogs; the file dialog swaps its own per mode)
  document.querySelectorAll('.dialog-title-icon[data-icon]').forEach((el) => { el.innerHTML = Icons[el.dataset.icon] || ''; });

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
  const menubarEl        = document.getElementById('menubar');
  let _menubarOpen = null;   // id of the open menu bar menu, or null
  const dicomBar       = document.getElementById('dicom-controls');
  const dcmFramesWrap  = document.getElementById('dcm-frames-wrap');
  const dcmWindowWrap  = document.getElementById('dcm-window-wrap');
  const dcmFrameSeek   = document.getElementById('dcm-frame');
  const dcmFrameLabel  = document.getElementById('dcm-frame-label');
  const dcmPreset      = document.getElementById('dcm-preset');
  const dcmWc          = document.getElementById('dcm-wc');
  const dcmWw          = document.getElementById('dcm-ww');
  const dcmInvertBtn   = document.getElementById('dcm-invert');
  const dcmPlayBtn     = document.getElementById('dcm-play');
  const dcmRange       = document.getElementById('dcm-range');
  const dcmFps         = document.getElementById('dcm-fps');
  const dcmColormap    = document.getElementById('dcm-colormap');
  const dcmOverlaysBtn = document.getElementById('dcm-overlays');
  const dcmAnnotBtn    = document.getElementById('dcm-annot');
  const dcmRulerBtn    = document.getElementById('dcm-ruler-axes');
  const dcmScaleBtn    = document.getElementById('dcm-scale');
  const dcmToolsWrap   = document.getElementById('dcm-tools-wrap');
  const dcmOverlay     = document.getElementById('dcm-overlay');
  const statusProbe    = document.getElementById('status-probe');
  const statusProbeSep = document.getElementById('status-probe-sep');
  let _dicomBusy = false;
  let _dicomNext = null;
  let _dicomCineTimer = null;
  let _dicomCineFps = null;   // user override of the cine speed (null → the file's frame timing)
  let _dicomSeriesTimer = null;   // playing the folder's single-frame DICOM files as one cine
  let _dicomSeriesFps = null;     // its speed (a new slice is a new session, which forgets _dicomCineFps)
  // Cine repeat: 'loop' (back to the first), 'bounce' (back and forth), 'once' (stop at the end)
  let _dicomCineMode = (() => { try { const v = localStorage.getItem('dicomCineMode'); return ['loop', 'bounce', 'once'].includes(v) ? v : 'loop'; } catch { return 'loop'; } })();
  let _dicomCineDir = 1;          // bounce: the way it is going
  let _dicomAnnotOn = localStorage.getItem('dicomAnnotations') !== '0';   // corner annotations / markers / scale bar
  let _dicomRulerOn = localStorage.getItem('dicomRulerAxes') !== '0';     // graduated rulers down both axes (on unless turned off)
  let _dicomGridOn = localStorage.getItem('dicomGrid') !== '0';           // 5 × 5 grid over the image
  let _dicomCrossOn = localStorage.getItem('dicomCrosshair') === '1';     // crosshair through the pointer
  let _dicomCursor = null;    // pointer in viewer coordinates (ruler markers, crosshair); null → outside
  const DCM_SCREEN_MM_PER_PX = 25.4 / 96;   // one CSS pixel in millimetres (the 1:1 physical-size zoom)
  let _dicomScaleOn = localStorage.getItem('dicomScaleBar') !== '0';      // the movable scale bar
  const DCM_SCALE_PAD = 14;   // default: top-left corner, this many px clear of the edges
  let _dicomScalePos = _loadDicomScalePos();     // where the user parked it; null → the default corner
  let _dicomScaleBox = null;  // last drawn scale-bar rect, for hit testing
  let _dicomTlBottom = 0;     // lower edge of the top-left (patient) text, for the scale bar's default spot
  let _dicomScaleDrag = null; // { dx, dy } while dragging it
  let _dicomTool = null;      // active measurement tool: null | 'ruler' | 'angle' | 'cobb' | 'ellipse' | 'rect'
  let _dicomMeas = [];        // measurements [{ type, frame, pts: [{ x, y }] }] in image pixels
  let _dicomDraft = null;     // the measurement being drawn
  let _dicomProbePt = null;   // image pixel under the cursor (pixel probe)
  let _dicomOverlayRaf = 0;
  const _dicomMeasHist = { undo: [], redo: [], seq: 0 };   // measurement history (snapshots of _dicomMeas)
  let _actionSeq = 0;         // ordering between measurement actions and Editor history changes
  let _editorSeq = 0;
  const mcPlayBtn        = document.getElementById('mc-play');
  const mcPauseBtn       = document.getElementById('mc-pause');
  const mcStopBtn        = document.getElementById('mc-stop');
  const mcSeek           = document.getElementById('mc-seek');
  const mcTime           = document.getElementById('mc-time');
  const mcVolWrap        = document.getElementById('mc-vol-wrap');
  const mcMuteBtn        = document.getElementById('mc-mute');
  const mcVolume         = document.getElementById('mc-volume');
  const mcVolLabel       = document.getElementById('mc-vol-label');
  const mcSubtitleWrap   = document.getElementById('mc-subtitle-wrap');
  const mcSubtitleBtn    = document.getElementById('mc-subtitle');
  const mcSubtitleFileBtn = document.getElementById('mc-subtitle-file');
  const mcSubtitleLang   = document.getElementById('mc-subtitle-lang');
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
  let _openGen = 0;              // drop stale results when arrow-keying through files
  let _ignoreWatchUntil = 0;     // ignore fs.watch noise right after open/watch
  let _watchedDir  = null;
  let _watchedFile = null;
  let _mediaCueTimer = null;
  let _mediaCueFromUser = null; // 'pause' | 'stop' | null
  let _subtitleLoadToken = 0;
  const MEDIA_VOL_KEY = 'mediaVolume';
  const MEDIA_MUTE_KEY = 'mediaMuted';
  let _mediaVolume = (() => {
    try {
      const v = parseFloat(localStorage.getItem(MEDIA_VOL_KEY));
      return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 1;
    } catch { return 1; }
  })();
  let _mediaMuted = (() => {
    try { return localStorage.getItem(MEDIA_MUTE_KEY) === '1'; } catch { return false; }
  })();
  const RECENT_DIRS_KEY = 'recentOpenedDirs';
  const RECENT_DIRS_MAX = 10;
  const RECENT_FILES_KEY = 'recentOpenedFiles';
  const RECENT_FILES_MAX = 10;
  // Explorer › Recent / Favorites tabs (see "Places" below); declared up here because the
  // start-up code reads them before that part of the file runs
  const TREE_TAB_KEY = 'explorerTab';
  const HOME_PLACES_TAB_KEY = 'homePlacesTab';
  let _treeTab = 'explorer';
  let _favorites = [];         // mirror of favorites.db: [{ path, kind: 'dir' | 'file', addedAt }]
  let _placesGen = 0;
  let _placesSections = new Map();
  let _placesHold = false;     // opened from the list: keep its rows still until the pointer leaves
  let _placesPending = false;
  let _placesSelected = '';
  const START_SCENE_IDS = [
    'valley', 'ocean', 'aurora', 'stars', 'rain', 'snow', 'dusk', 'forest', 'dunes', 'city',
    'nebula', 'bokeh', 'grid', 'ribbons', 'embers', 'lake', 'sunrise', 'fireflies', 'geometry', 'ink',
    'petals', 'mountains',
  ];
  const START_SPEED_ROWS = [
    ['transparency', 'start.transparency', 100, 5],
    ['motion', 'start.motion', 100, 5],
  ];
  const START_SCREEN_DEFAULT = {
    scene: 'valley', transparency: 0, motion: 20, showOnStart: true,
  };
  let _startBg = null;
  let _startBgLoading = null;
  let _startSyncing = false;
  let _batchReady = false;
  // The start page opens later in this init: load the 3D module and queue its shaders now.
  if (_startScreen().showOnStart) _ensureStartBg().then((bg) => bg?.prewarm());
  const HOME_TASKS = [
    // Explorer (first of "What you can do"): straight to the main view — explorer on the left,
    // the folder's images in the middle
    { icon: 'explorer', title: 'home.explorer', desc: 'home.desc.explorer', run: () => _homeExplorer() },
    { icon: 'openFolder', title: 'menu.openFolder', desc: 'home.desc.openFolder', primary: true, run: () => _pickOpenFolder() },
    { icon: 'openFile', title: 'menu.openFile', desc: 'home.desc.openFile', run: () => _pickOpenFile() },
    { icon: 'viewGrid', title: 'menu.browseMode', desc: 'home.desc.browse', run: () => _homeBrowse() },
    { icon: 'edit', title: 'menu.editImage', desc: 'home.desc.edit', run: () => _homeNeedImage(_openEditWindow) },
    { icon: 'print', title: 'menu.print', desc: 'home.desc.print', run: () => _homeNeedImage(_openPrintPreview) },
    { icon: 'resize', title: 'menu.resize', desc: 'home.desc.resize', run: () => _homeNeedImage(_openResizeDialog) },
    { icon: 'bgRemove', title: 'toolbar.bgRemove', desc: 'home.desc.bg', run: () => _homeNeedImage(_removeBackground) },
    { icon: 'fmtDcm', title: 'home.dicom', desc: 'home.desc.dicom', run: () => _pickOpenFile() },
    { icon: 'fileInfo', title: 'menu.fileInfo', desc: 'home.desc.info', run: () => _homeNeedImage(_showFileInfoDialog) },
    { icon: 'palette', title: 'menu.theme', desc: 'home.desc.theme', run: () => { _hideHome(); _nextTheme(); } },
    { icon: 'settings', title: 'menu.settings', desc: 'home.desc.settings', run: () => _openSettings() },
    { icon: 'keyboard', title: 'menu.shortcuts', desc: 'home.desc.shortcuts', run: () => _showDialog('shortcuts-overlay') },
    { icon: 'help', title: 'menu.help', desc: 'home.desc.help', run: () => _openHelp() },
    { icon: 'fullscreen', title: 'menu.fullscreen', desc: 'home.desc.fullscreen', run: () => window.electronAPI.toggleFullscreen?.() },
  ];
  /* ─── Preferences (Settings dialog) — every persisted option lives in localStorage under these keys ─── */
  const PREF_DEFAULTS = {
    restoreSession: '1',        // reopen the last folder / file at startup
    zoomStep: '10',             // mouse-wheel zoom step (%)
    viewerChecker: '1',         // checkerboard behind transparent images
    imageSmoothing: '1',        // smooth pixels when zoomed in
    dicomDefaultFps: '10',      // cine speed when the file has none
    dicomOverlayColor: '#00ff80',
    keepExif: '1',              // saving keeps the photo information (date taken, camera …)
    stripGps: '0',              // … without the location
  };
  const PREF_KEYS = [
    'theme', 'lang', 'bgRemoveAlgo', 'subtitlesEnabled', 'subtitleLanguage', MEDIA_VOL_KEY, MEDIA_MUTE_KEY,
    'dicomAnnotations', 'sidebarWidth', 'sidebarTreeHeightV2', 'editEffectsPanelWidth', 'editAdjustPanelWidth',
    // Panel layout is a setting like any other: which panels are expanded, every
    // panel width, the explorer / file-info split, and the browse view.
    LAYOUT_KEY, EW_LAYOUT_KEY, BROWSE_KEY, 'browseViewV1', 'rightSidebarWidth',
    'dicomRulerAxes', 'dicomScaleBar', 'dicomScalePos', 'dicomGrid', 'dicomCrosshair', 'dicomCineMode',
    ...Object.keys(PREF_DEFAULTS),
  ];
  function _pref(key) {
    try { const v = localStorage.getItem(key); return v == null ? PREF_DEFAULTS[key] : v; } catch { return PREF_DEFAULTS[key]; }
  }
  function _setPref(key, value) {
    try { localStorage.setItem(key, String(value)); } catch { /* ignore */ }
  }
  const _prefOn = (key) => _pref(key) !== '0';
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
    () => { _markDirty(); _queueColorPanelSync(); },
    (hasSel) => _onSelectionChange(hasSel),
    () => _onHistoryChange()
  );

  /* ─── File Tree init ─── */
  FileTree.init(fileTreeScroll, {
    onSelect: (p) => _openFile(p),
    // Double-click is the explicit "just show me this image" gesture: it always
    // leaves the contact sheet behind, whatever the browse mode says.
    onActivate: (p) => { _browseSheetHeld = true; _openFile(p, { center: true }); },
    onDirOpen: (p, info = {}) => {
      _rememberRecentDir(p);
      _watchDir(p);
      // Opening a folder always warms the thumbnail cache in the background
      Thumbs.prefetchDir(p);
      if (_openingFile) return;

      // Tree folder selected (activate: true) → show that folder's images in the
      // centre contact sheet. Arrow-only expand uses activate: false and only
      // updates the sheet when nothing is holding it down.
      if (info.activate === true) {
        _showFolderInCenter(p);
        return;
      }

      if (_browseMode) {
        // Incidental tree reveals must not cover an open image / filmstrip.
        if (_browseSheetHeld || Browse.isFilmstrip?.()) return;
        Browse.show(p);
        Browse.open(p);
        return;
      }
      if (info.activate !== false) {
        _openFirstInDir(p);
      }
    },
    onDriveSelect: async (p) => { _openFolder(await _recentDirOnDrive(p), { instant: true }); },
    onContextMenu: (entry, x, y) => _showTreeContextMenu(entry, x, y),
    // Thumbnails dragged onto a folder in the explorer (move; Ctrl = copy)
    onInternalDrop: ({ paths, destDir, mode }) => _transferPathsInto(paths, destDir, mode),
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
  function _normWatchPath(p) {
    return String(p || '').replace(/\//g, '\\').replace(/[\\/]+$/, '').toLowerCase();
  }
  function _cancelTreeRefresh() {
    if (_refreshTimer) {
      clearTimeout(_refreshTimer);
      _refreshTimer = null;
    }
  }
  function _scheduleTreeRefresh() {
    clearTimeout(_refreshTimer);
    _refreshTimer = setTimeout(async () => {
      if (_openingFile || Date.now() < _ignoreWatchUntil) return;
      // Keep prev/next in sync only. Do not rebuild the explorer DOM.
      _ignoreWatchUntil = Date.now() + 2500;
      // The contact sheet re-reads its folder (keeping the selection that still exists)
      if (Browse.isVisible?.()) Browse.refresh();
      try {
        if (state.currentFile) {
          const dir = await window.electronAPI.pathDirname(state.currentFile);
          state.fileList = await FileTree.getImageFilesInDir(dir);
          state.fileIndex = FileTree.indexOfPath
            ? FileTree.indexOfPath(state.fileList, state.currentFile)
            : state.fileList.indexOf(state.currentFile);
          _updateNavButtons();
        }
      } catch (e) {
        console.warn('file list sync failed:', e);
      }
      }, 400);
  }

  /* ─── Tooltip: toolbar buttons ─── */
  _buildToolbar();
  _buildMenubar();
  _initHome();
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
  _initPanelLayout();
  _initPlaces();
  _initBrowse();
  _initDesktopDragDrop();
  _initEditEffectsResize();
  _initEditAdjustResize();

  /* ─── Viewer pan / zoom ─── */
  _initViewerInteraction();

  /* ─── Keyboard shortcuts ─── */
  _initKeyboard();
  _initViewerNavButtons();
  _initMediaCues();
  _initDicomBar();
  _initDicomOverlay();
  _initSettingsDialog();   // after the DOM refs / preference constants above
  _initInfoTagFilter();

  /* ─── Context menu ─── */
  // The webview's own menu (Back / Refresh / Save as / Inspect) is never the app's menu:
  // suppress it everywhere except text fields, which keep their cut / copy / paste menu.
  document.addEventListener('contextmenu', (e) => {
    const t = e.target;
    const editable = t && (t.isContentEditable
      || (t.tagName === 'TEXTAREA')
      || (t.tagName === 'INPUT' && !/^(range|checkbox|radio|button|color|file)$/i.test(t.type || '')));
    if (!editable) e.preventDefault();
  });
  // Capture phase so Chromium's native <video> menu is suppressed
  viewerContainer.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    _showContextMenu(e.clientX, e.clientY);
  }, true);
  // Right-click on empty space in the tree: paste into the folder in view
  fileTreeScroll.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (e.target?.closest?.('.tree-item')) return;   // rows post their own menu
    _showTreeBlankContextMenu(e.clientX, e.clientY);
  });

  // Ctrl+C / Ctrl+X / Ctrl+V act on files while the tree is the active pane,
  // and on the image otherwise.
  fileTreeScroll.addEventListener('mousedown', () => { state.activePane = 'tree'; }, true);
  fileTreeScroll.addEventListener('focusin', () => { state.activePane = 'tree'; });
  viewerContainer.addEventListener('mousedown', () => { state.activePane = 'viewer'; }, true);

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
          await FileTree.refresh({ force: true });
          FileTree.setSelected(p, { center: true });
          return;
        }
      }
      if (files[0]) {
        const p = FileRegistry.registerFile(files[0], '/');
        await FileTree.loadDrives();
        await FileTree.revealPath('/');
        await _openFile(p, { center: true });
        await FileTree.refresh({ force: true });
        FileTree.setSelected(p, { center: true });
      }
      return;
    }

    await _openDroppedPaths(files.map(_dropPath).filter(Boolean));
  });

  /** Dropped paths that do not land in a folder: open a dropped folder, else the first media file. */
  async function _openDroppedPaths(paths) {
    for (const p of paths) {
      const stats = await window.electronAPI.getFileStats(p);
      if (stats && !stats.error && stats.isDirectory) {
        await _openFolder(p);
        await FileTree.refresh({ force: true });
        return;
      }
    }
    const isMedia = (p) => {
      const ext = FormatSupport.getExtension(p);
      return FormatSupport.IMAGE_EXTS.has(ext) || FormatSupport.VIDEO_EXTS.has(ext) || FormatSupport.AUDIO_EXTS.has(ext);
    };
    // The first supported file (else the first file anyway), with its folder revealed
    const p = paths.find(isMedia) || paths[0];
    if (!p) return;
    const dir = await window.electronAPI.pathDirname(p);
    await _openFile(p, { center: true });
    await FileTree.revealPath(dir);
    await FileTree.refresh({ force: true });
    FileTree.setSelected(p, { center: true });
  }

  /* ─── Desktop drag & drop (dragdrop.js): in → in, in → out, out → in ─── */
  /** The drop folder an element stands for: an explorer folder row or a folder tile. */
  function _dropFolderOf(el) {
    const row = el?.closest?.('#file-tree-scroll .tree-item[data-path]');
    if (row && row.dataset.isDir === '1') return { el: row, dir: row.dataset.path };
    const tile = el?.closest?.('#browse-view .browse-tile.is-dir');
    if (tile) return { el: tile, dir: tile.dataset.path };
    // Anywhere else on the full contact sheet: the folder it shows
    const sheet = el?.closest?.('#browse-view');
    if (sheet && Browse.isVisible?.() && !Browse.isFilmstrip?.() && Browse.getDir?.()) {
      return { el: sheet, dir: Browse.getDir() };
    }
    return null;
  }

  /** Explorer's rule for files coming from elsewhere: same drive → move, other drive → copy. */
  function _dropMode(paths, destDir) {
    const drive = (p) => (/^([a-z]):/i.exec(String(p || '')) || [])[1]?.toLowerCase() || (String(p).startsWith('/') ? '/' : '');
    const d = drive(destDir);
    return paths.every((p) => drive(p) === d) ? 'move' : 'copy';
  }

  function _initDesktopDragDrop() {
    if (!window.DragDrop || typeof window.electronAPI.startFileDrag !== 'function') return;
    DragDrop.init({
      pathsFor(el) {
        const tile = el?.closest?.('#browse-view .browse-tile.is-file');
        if (tile) {
          const sel = Browse.getSelectedPaths?.() || [];
          return sel.some((p) => _normWatchPath(p) === _normWatchPath(tile.dataset.path)) ? sel : [tile.dataset.path];
        }
        const row = el?.closest?.('#file-tree-scroll .tree-item[data-path]');
        if (row && row.dataset.isDir !== '1' && !row.dataset.isDrive) return FileTree.pathsForDrag?.(row.dataset.path) || [row.dataset.path];
        return null;
      },
      folderAt: _dropFolderOf,
      ghostImage: (el) => el?.closest?.('.browse-tile')?.querySelector('.browse-thumb img')?.src || '',
      onDropInto: (paths, dir, mode) => _transferPathsInto(paths, dir, mode),
    });
    // Files dragged in from Explorer / the desktop / another app (or our own drag-out coming back)
    window.addEventListener('native-dragdrop', async (e) => {
      const { type, paths = [], x, y } = e.detail || {};
      if (type === 'enter' || type === 'over') { DragDrop.hoverAt(x, y); return; }
      DragDrop.hoverAt(null);
      if (type !== 'drop' || !paths.length) return;
      const hit = x == null ? null : DragDrop.folderAt(x, y);
      // Into a folder — unless they are already there (then it is just "open")
      if (hit && !paths.every((p) => _normWatchPath(_parentDir(p)) === _normWatchPath(hit.dir))) {
        await _transferPathsInto(paths.filter((p) => _normWatchPath(p) !== _normWatchPath(hit.dir)), hit.dir, _dropMode(paths, hit.dir));
        return;
      }
      await _openDroppedPaths(paths);
    });
  }

  function _parentDir(p) {
    const s = String(p || '').replace(/[\\/]+$/, '');
    const i = Math.max(s.lastIndexOf('\\'), s.lastIndexOf('/'));
    return i > 0 ? s.slice(0, i) : s;
  }

  /* ─── Electron IPC listeners ─── */
  window.electronAPI.onOpenFile(async (p) => {
    try {
      const dir = await window.electronAPI.pathDirname(p);
      await _openFile(p, { center: true });
      await FileTree.revealPath(dir);
      await FileTree.refresh({ force: true });
      FileTree.setSelected(p, { center: true });
    } catch (_) {
      await _openFile(p, { center: true });
      await FileTree.refresh({ force: true });
      FileTree.setSelected(p, { center: true });
    }
  });
  window.electronAPI.onOpenFolder(async (p) => {
    await _openFolder(p);
    await FileTree.refresh({ force: true });
  });
  window.addEventListener('app-open-folder', async (e) => {
    const p = e.detail;
    if (!p) return;
    await _openFolder(p);
    await FileTree.refresh({ force: true });
  });
  window.addEventListener('app-open-file', async (e) => {
    const p = e.detail;
    if (!p) return;
    await _openFile(p, { center: true });
    FileTree.setSelected(p, { center: true });
  });
  window.electronAPI.onMenuAction(async (action) => _handleMenuAction(action));

  /* ─── File / directory watching ─── */
  async function _watchDir(dirPath) {
    if (!dirPath) return;
    if (_normWatchPath(_watchedDir) === _normWatchPath(dirPath)) return;
    if (_watchedDir) await window.electronAPI.unwatchDirectory(_watchedDir);
    _watchedDir = dirPath;
    await window.electronAPI.watchDirectory(dirPath);
  }

  async function _watchCurrentFile(filePath) {
    if (_normWatchPath(_watchedFile) === _normWatchPath(filePath)) return;
    if (_watchedFile) await window.electronAPI.unwatchFile(_watchedFile);
    _watchedFile = filePath;
    if (filePath) await window.electronAPI.watchFile(filePath);
  }

  window.electronAPI.onDirectoryChanged(() => {
    if (_openingFile || Date.now() < _ignoreWatchUntil) return;
    _scheduleTreeRefresh();
  });

  window.electronAPI.onFileChanged(async (filePath) => {
    if (_openingFile || Date.now() < _ignoreWatchUntil) return;
    // Content change only — do not rebuild the folder tree.
    if (state.currentFile && _normWatchPath(state.currentFile) === _normWatchPath(filePath) && !state.isDirty) {
      await _openFile(filePath);
    }
  });

  /* ─── Initial viewer state ─── */
  _showPlaceholder(true);
  _showLoading(false);
  _setTool('pointer');
  viewerContainer.classList.add('drag-mode');
  selCanvas.style.cursor = 'grab';

  /* ─── Restore last opened folder ─── */
  // "Show this screen at startup" decides what the user sees first: on → the start screen
  // with the chosen background scene (the last folder is still restored underneath, so Home
  // goes straight to it); off → the restored folder. A file the app was opened with wins.
  const homeAtStart = _startScreen().showOnStart;
  if (homeAtStart) _showHome();
  await FileTree.loadDrives();
  // Web mode: virtual FS is empty until user opens files/folder — skip path restore
  let showHome = true;
  if (window.electronAPI.platform !== 'web') {
    const launchFile = window.electronAPI.getLaunchFile
      ? await window.electronAPI.getLaunchFile()
      : null;
    if (launchFile) {
      showHome = false;
      try {
        const dir = await window.electronAPI.pathDirname(launchFile);
        await FileTree.revealPath(dir);
        await FileTree.refresh({ force: true });
        FileTree.setSelected(launchFile, { center: true });
      } catch (_) { /* folder may be gone */ }
      _openFile(launchFile, { center: true }).catch(() => {});
    } else if (_prefOn('restoreSession')) {
      // Prefer the host's copy: it is written to disk on every folder open, while the
      // webview can lose its newest localStorage writes when the app is closed abruptly.
      let lastDir = '';
      if (window.electronAPI.getSavedLastOpenDir) {
        try { lastDir = (await window.electronAPI.getSavedLastOpenDir()) || ''; } catch { lastDir = ''; }
      }
      if (!lastDir) lastDir = localStorage.getItem('lastOpenedDir') || '';
      if (!lastDir && window.electronAPI.getLastOpenDir) {
        try { lastDir = (await window.electronAPI.getLastOpenDir()) || ''; } catch { lastDir = ''; }
      }
      const isDir = async (p) => {
        if (!p) return false;
        try {
          const stats = await window.electronAPI.getFileStats(p);
          return !!(stats && !stats.error && stats.isDirectory);
        } catch { return false; }
      };
      let lastDirOk = await isDir(lastDir);
      // The last folder was deleted / renamed / on a removed drive: the newest recent one that still exists
      if (!lastDirOk) {
        for (const p of _getRecentDirs()) {
          if (_normDirKey(p) !== _normDirKey(lastDir) && await isDir(p)) { lastDir = p; lastDirOk = true; break; }
        }
      }
      if (lastDirOk) {
        // Reopen the last folder (contact sheet). With the start screen on, it opens
        // underneath it, so the start screen does not flash away and back.
        showHome = false;
        if (!homeAtStart) _hideHome();
        if (!_browseMode) {
          _browseMode = true;
          try { localStorage.setItem(BROWSE_KEY, '1'); } catch { /* ignore */ }
          FileTree.setFoldersOnly?.(true);
        }
        try {
          await _openFolder(lastDir, { openFirst: false, instant: true, keepHome: homeAtStart });
        } catch {
          try {
            await FileTree.revealPath(lastDir);
            _watchDir(lastDir);
            Thumbs.prefetchDir(lastDir);
            Browse.show(lastDir);
            await Browse.open(lastDir);
          } catch { /* folder may be gone */ }
        }
        // Start in folder view: the last image is selected in the sheet (File Info shows
        // it), not opened — reopening it turned the sheet into a filmstrip at once.
        const lastFile = localStorage.getItem('lastOpenedFile');
        if (lastFile && _normWatchPath(await window.electronAPI.pathDirname(lastFile).catch(() => '')) === _normWatchPath(lastDir)) {
          Browse.select?.(lastFile);
        }
        // Warm the other recent folders' thumbnail DB in the background (host side)
        Thumbs.warmDirs?.(_getRecentDirs().filter((d) => _normDirKey(d) !== _normDirKey(lastDir)));
        // Opening the folder closed the start screen; the setting asks for it on top
        if (homeAtStart) showHome = true;
      }
    }
  }
  /* Home is drawn after HOME_TASKS exists. Calling it here threw and skipped the rest of startup. */

  /* ─── Update menu with i18n ─── */
  _syncMenu();

  /* ════════════════════════════════════════════
     Toolbar
  ════════════════════════════════════════════ */
  function _buildToolbar() {
    // File / folder / save / export / print live in the menu bar's File menu (see _buildMenubar)
    const buttons = [
      { id:'btn-open-file',   icon:'openFile',   tip:'toolbar.openFile',   action: () => _pickOpenFile() },
      { id:'btn-save',        icon:'save',       tip:'toolbar.save',       action: () => _save(), disabled: true },
      { id:'btn-open-folder', icon:'openFolder', tip:'toolbar.openFolder', action: () => _pickOpenFolder() },
      { id:'btn-print',      icon:'print',      tip:'toolbar.print',      action: _openPrintPreview, disabled: true },
      { separator: true },
      { id:'btn-undo',        icon:'undo',       tip:'toolbar.undo',       action: () => { _undoEdit(); }, disabled: true },
      { id:'btn-redo',        icon:'redo',       tip:'toolbar.redo',       action: () => { _redoEdit(); }, disabled: true },
      { separator: true },
      { id:'btn-fit',         icon:'fitWindow',  tip:'toolbar.fitWindow',  action: () => _setViewMode('window'), disabled: true },
      { id:'btn-fit-width',   icon:'fitWidth',   tip:'toolbar.fitWidth',   action: () => _setViewMode('width'),  disabled: true },
      { id:'btn-fit-height',  icon:'fitHeight',  tip:'toolbar.fitHeight',  action: () => _setViewMode('height'), disabled: true },
      { id:'btn-actual',      icon:'actualSize', tip:'toolbar.actualSize', action: _actualSize,       disabled: true },
      { id:'btn-center',      icon:'center',     tip:'toolbar.center',     action: _centerView,       disabled: true },
      { id:'btn-fullscreen',  icon:'fullscreen', tip:'toolbar.fullscreen', action: () => window.electronAPI.toggleFullscreen?.() },
      { separator: true },
      { id:'btn-rotate-l',    icon:'rotateLeft', tip:'toolbar.rotateLeft', action: () => _rotate(-90), disabled: true },
      { id:'btn-rotate-r',    icon:'rotateRight',tip:'toolbar.rotateRight',action: () => _rotate(90),  disabled: true },
      { id:'btn-flip-h',      icon:'flipH',      tip:'toolbar.flipH',      action: () => _flip('h'),   disabled: true },
      { id:'btn-flip-v',      icon:'flipV',      tip:'toolbar.flipV',      action: () => _flip('v'),   disabled: true },
      { id:'btn-resize',      icon:'resize',     tip:'toolbar.resize',     action: () => _openResizeDialog(), disabled: true },
      { separator: true },
      { id:'btn-prev',        icon:'prev',       tip:'toolbar.prev',       action: _prevImage, disabled: true },
      { id:'btn-next',        icon:'next',       tip:'toolbar.next',       action: _nextImage, disabled: true },
      { separator: true },
      // Zoom: [−] [100%] [+] — the percentage box sits between the two buttons
      { id:'btn-zoom-out',    icon:'zoomOut',    tip:'toolbar.zoomOut',    action: () => _zoom(0.8),  disabled: true },
      { zoomDisplay: true },
      { id:'btn-zoom-in',     icon:'zoomIn',     tip:'toolbar.zoomIn',     action: () => _zoom(1.25), disabled: true },
      { separator: true },
      // Panels: collapse / expand the left (explorer + file info) and right (colour) panels
      { id:'btn-browse',      icon:'viewGrid',   tip: _browseTip,          action: () => _toggleBrowseMode() },
      { id:'btn-panel-left',  icon:'panelLeft',  tip: _leftPanelTip,       action: () => _toggleLeftPanel() },
      { id:'btn-panel-right', icon:'panelRight', tip: _rightPanelTip,      action: () => _toggleRightPanel() },
      { separator: true },
      { id:'btn-edit',        icon:'edit',       tip:'toolbar.edit',       action: _openEditWindow, disabled: true },
      { spacer: true },
      // Theme: palette = jump to the next theme, ▾ = pick one from the list
      { id:'btn-theme',       icon:'palette',    tip: _themeButtonTip,     action: _nextTheme },
      { id:'btn-theme-menu',  icon:'caretDown',  tip:'toolbar.themeMenu',  action: null, caretBtn: true, openMenu: (btn) => _openThemeMenu(btn) },
      { id:'btn-lang',        icon:null,         tip:'toolbar.lang',       action: _toggleLang, langBtn: true },
      { id:'btn-settings',    icon:'settings',   tip:'toolbar.settings',   action: _openSettings },
      { id:'btn-info',        icon:'info',       tip:'menu.about',         action: () => _showDialog('about-overlay') },
    ];

    // Keep the zoom input before clearing
    const zoomWrap = document.getElementById('zoom-input-wrap') || (() => {
      const zw = document.createElement('div');
      zw.id = 'zoom-input-wrap';
      const zi = document.createElement('input');
      zi.id = 'zoom-display'; zi.type = 'text'; zi.value = '100%';
      zw.appendChild(zi);
      return zw;
    })();
    toolbar.innerHTML = '';
    // What follows the spacer (theme · language · settings · about) lives on the menu bar,
    // left of the window buttons; without that host it stays at the toolbar's right end.
    const chrome = document.getElementById('menubar-chrome');
    if (chrome) chrome.innerHTML = '';
    let target = toolbar;
    for (const b of buttons) {
      if (b.separator) {
        const sep = document.createElement('div');
        sep.className = 'toolbar-sep';
        target.appendChild(sep);
        continue;
      }
      if (b.spacer) {
        if (chrome) { target = chrome; continue; }
        const sp = document.createElement('div');
        sp.className = 'toolbar-spacer';
        toolbar.appendChild(sp);
        continue;
      }
      if (b.zoomDisplay) {
        toolbar.appendChild(zoomWrap);
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
        _setLangButtonLabel(btn);
      } else if (b.caretBtn) {
        // Dropdown opener: mousedown (not click) so the document-level click that closes menus cannot race us
        btn.classList.add('caret-btn');
        btn.innerHTML = Icons[b.icon] || '';
        btn.setAttribute('aria-haspopup', 'menu');
        btn.addEventListener('mousedown', (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (btn.classList.contains('is-open')) ContextMenu.hide();
          else b.openMenu(btn);
        });
      } else if (b.menuBtn) {
        btn.classList.add('menu-btn');
        btn.innerHTML = Icons[b.icon] || '';
        const span = document.createElement('span');
        span.className = 'menu-text';
        span.setAttribute('data-i18n', b.menuBtn);
        span.textContent = I18n.t(b.menuBtn);
        btn.appendChild(span);
        const caret = document.createElement('span');
        caret.className = 'menu-caret';
        caret.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 10l5 5 5-5z"/></svg>';
        btn.appendChild(caret);
        btn.setAttribute('aria-haspopup', 'menu');
      } else {
        btn.innerHTML = Icons[b.icon] || '';
      }

      if (b.toggleGroup === 'tool') {
        if (b.id === 'btn-tool-pointer') btn.classList.add('active');
      }

      btn.addEventListener('click', (e) => {
        if (b.caretBtn) e.stopPropagation();   // keep the document-level "click closes menus" from undoing mousedown
        if (btn.classList.contains('is-disabled') || btn.getAttribute('aria-disabled') === 'true') {
          e.preventDefault();
          return;
        }
        if (b.action) b.action(e);
      });
      Tooltip.attach(btn, typeof b.tip === 'function' ? b.tip : () => I18n.t(b.tip));
      hit.appendChild(btn);
      target.appendChild(hit);
    }

    _updateZoomDisplay();
    _syncGuideButtons();
    _lockBarScroll(toolbar);
    _updateToolbarForMedia();
    _updateNavButtons();
    requestAnimationFrame(() => _syncWindowMinSize());
  }

  /* ════════════════════════════════════════════
     Menu bar (File · Edit · View · Window · Help)
     Each menu is a ContextMenu dropdown; every item carries an icon.
     The viewer has no Effects menu: adjustments and filters belong to the edit
     window. That slot is Window, which gathers the panel layout and the window
     itself — until now reachable only through the toolbar buttons.
  ════════════════════════════════════════════ */
  function _menubarDefs() {
    return [
    { id: 'file',    labelKey: 'menu.file',    icon: 'file',      items: () => _fileMenuItems() },
    { id: 'edit',    labelKey: 'menu.edit',    icon: 'edit',      items: () => _editMenuItems() },
    { id: 'view',    labelKey: 'menu.view',    icon: 'image',     items: () => _viewMenuItems() },
    { id: 'window',  labelKey: 'menu.window',  icon: 'panelLeft', items: () => _windowMenuItems() },
    { id: 'help',    labelKey: 'menu.help',    icon: 'help',      items: () => _helpMenuItems() },
    ];
  }

  // Edit-window menu bar: the same five menus with the editor's own actions
  function _ewMenubarDefs() {
    return [
      { id: 'file',    labelKey: 'menu.file',    icon: 'file',    prefix: 'ew-', items: () => _ewFileMenuItems() },
      { id: 'edit',    labelKey: 'menu.edit',    icon: 'edit',    prefix: 'ew-', items: () => _ewEditMenuItems() },
      { id: 'view',    labelKey: 'menu.view',    icon: 'image',   prefix: 'ew-', items: () => _ewViewMenuItems() },
      { id: 'image',   labelKey: 'menu.image',   icon: 'toneCurve', prefix: 'ew-', items: () => EditTools.imageMenuItems() },
      { id: 'select',  labelKey: 'menu.select',  icon: 'rectSelect', prefix: 'ew-', items: () => _ewSelectMenuItems() },
      { id: 'effects', labelKey: 'menu.effects', icon: 'effects', prefix: 'ew-', items: () => _effectsMenuItems() },
      { id: 'help',    labelKey: 'menu.help',    icon: 'help',    prefix: 'ew-', items: () => _helpMenuItems() },
    ];
  }

  function _buildMenubar() {
    _buildMenubarInto(document.getElementById('menubar-menus'), _menubarDefs());
    _buildMenubarInto(document.getElementById('ew-menubar-menus'), _ewMenubarDefs());
  }

  function _buildMenubarInto(container, defs) {
    if (!container) return;
    container.innerHTML = '';
    for (const m of defs) {
      const key = (m.prefix || '') + m.id;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'menubar-btn';
      btn.id = `menubar-${key}`;
      if (m.items) btn.setAttribute('aria-haspopup', 'menu');
      btn.innerHTML = Icons[m.icon] || '';
      const span = document.createElement('span');
      span.setAttribute('data-i18n', m.labelKey);
      span.textContent = I18n.t(m.labelKey);
      btn.appendChild(span);
      // mousedown (not click) so the document-level click that closes menus cannot race us
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (m.action) {
          ContextMenu.hide();
          m.action();
          return;
        }
        if (_menubarOpen === key) ContextMenu.hide();
        else _openMenubarMenu(m, container);
      });
      btn.addEventListener('click', (e) => e.stopPropagation());
      btn.addEventListener('mouseenter', () => {
        if (!m.items) {
          if (_menubarOpen) ContextMenu.hide();
          return;
        }
        if (_menubarOpen && _menubarOpen !== key) _openMenubarMenu(m, container);
      });
      container.appendChild(btn);
    }
  }

  function _openMenubarMenu(m, container = menubarEl) {
    const key = (m.prefix || '') + m.id;
    const btn = document.getElementById(`menubar-${key}`);
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    container?.querySelectorAll('.menubar-btn.is-open').forEach((b) => b.classList.remove('is-open'));
    btn.classList.add('is-open');
    _menubarOpen = key;
    ContextMenu.show(r.left, r.bottom + 2, m.items(), {
      onHide: () => {
        if (_menubarOpen === key) _menubarOpen = null;
        btn.classList.remove('is-open');
      },
    });
  }

  function _ewFileMenuItems() {
    const t = I18n.t.bind(I18n);
    return [
      { icon: Icons.save,    label: t('menu.save'),          shortcut: 'Ctrl+S', action: () => _save() },
      { icon: Icons.saveAs,  label: t('menu.saveAs'),        shortcut: 'Ctrl+Shift+S', action: () => _saveAsNewFile() },
      { icon: Icons.print,   label: t('menu.print'),         shortcut: 'Ctrl+P', action: () => _openPrintPreview() },
      { icon: Icons.copy,    label: t('menu.copyToClipboard'), shortcut: 'Ctrl+C', action: () => _ewCopy() },
      { separator: true },
      { icon: Icons.fileInfo, label: t('menu.fileInfo'),     shortcut: 'Ctrl+I', disabled: !state.currentFile, action: () => _showFileInfoDialog() },
      { icon: Icons.settings, label: t('menu.settings'),     action: () => _openSettings() },
      { separator: true },
      { icon: Icons.edit,    label: t('editWindow.apply'),   action: () => _requestCloseEditWindow(true) },
      { icon: Icons.close,   label: t('editWindow.cancel'),  shortcut: 'Esc', action: () => _requestCloseEditWindow(false) },
    ];
  }

  function _ewEditMenuItems() {
    const t = I18n.t.bind(I18n);
    const hasSel = Editor.hasSelection();
    return [
      { icon: Icons.undo,  label: t('menu.undo'), shortcut: 'Ctrl+Z', disabled: !Editor.canUndo(), action: () => _undoEdit() },
      { icon: Icons.redo,  label: t('menu.redo'), shortcut: 'Ctrl+Y', disabled: !Editor.canRedo(), action: () => _redoEdit() },
      { separator: true },
      { icon: Icons.cut,   label: t('context.cut'),  shortcut: 'Ctrl+X', disabled: !hasSel, action: () => _ewCut() },
      { icon: Icons.copy,  label: t('context.copy'), shortcut: 'Ctrl+C', action: () => _ewCopy() },
      { icon: Icons.crop,  label: t('editWindow.cropSel'),  disabled: !hasSel, action: () => _cropToSelection() },
      { icon: Icons.close, label: t('editWindow.clearSel'), disabled: !hasSel, action: () => { Editor.clearSelection(); _ewUpdateSelBtns(); } },
      { separator: true },
      { icon: Icons.rotateLeft,  label: t('menu.rotateLeft'),     shortcut: 'Ctrl+[', action: () => _rotate(-90) },
      { icon: Icons.rotateRight, label: t('menu.rotateRight'),    shortcut: 'Ctrl+]', action: () => _rotate(90) },
      { icon: Icons.flipH,       label: t('menu.flipHorizontal'), action: () => _flip('h') },
      { icon: Icons.flipV,       label: t('menu.flipVertical'),   action: () => _flip('v') },
      { icon: Icons.resize,      label: t('menu.resize'),         shortcut: 'Ctrl+Shift+R', action: () => _openResizeDialog() },
      { separator: true },
      { icon: Icons.bgRemove,    label: t('context.bgRemove'),    action: () => _removeBackground() },
      { icon: Icons.reset,       label: t('menu.resetEdits'),     action: () => _resetAll() },
    ];
  }

  function _ewViewMenuItems() {
    const t = I18n.t.bind(I18n);
    return [
      { icon: Icons.zoomIn,     label: t('menu.zoomIn'),      shortcut: 'Ctrl++', action: () => _ewZoomBy(1.25) },
      { icon: Icons.zoomOut,    label: t('menu.zoomOut'),     shortcut: 'Ctrl+-', action: () => _ewZoomBy(0.8) },
      { icon: Icons.fitWindow,  label: t('menu.fitToWindow'), shortcut: 'Ctrl+0', action: () => _ewFit() },
      { icon: Icons.actualSize, label: t('menu.actualSize'),  shortcut: 'Ctrl+1', action: () => _ewZoomTo(1) },
      { separator: true },
      { icon: Icons.panelLeft,  label: t('menu.ewLeftPanel'),  checked: _ewLayout.left,  action: () => _toggleEwLeftPanel() },
      { icon: Icons.panelRight, label: t('menu.ewRightPanel'), checked: _ewLayout.right, action: () => _toggleEwRightPanel() },
      { separator: true },
      !_isWeb() && { icon: Icons.fullscreen, label: t('menu.fullscreen'), shortcut: 'F11', action: () => window.electronAPI.toggleFullscreen?.() },
      !_isWeb() && { separator: true },
      { icon: Icons.palette,  label: t('menu.theme'),    submenu: () => _themeMenuItems() },
      { icon: Icons.language, label: t('menu.language'), submenu: () => _langMenuItems() },
    ].filter(Boolean);
  }

  function _isWeb() { return window.electronAPI.platform === 'web'; }

  function _fileMenuItems() {
    const t = I18n.t.bind(I18n);
    const hasImg = _isEditableImage();
    const hasFile = !!state.currentFile;
    const isWeb = _isWeb();
    return [
      { icon: Icons.openFile,   label: t('menu.openFile'),   shortcut: 'Ctrl+O',       action: () => _pickOpenFile() },
      { icon: Icons.openFolder, label: t('menu.openFolder'), shortcut: 'Ctrl+Shift+O', action: () => _pickOpenFolder() },
      // The last ${RECENT_DIRS_MAX} folders, each with its own ×, and "clear all" under them
      { icon: Icons.recent,     label: t('menu.recentFolders'), submenu: () => _recentFolderItems() },
      { separator: true },
      { icon: Icons.save,       label: t('menu.save'),       shortcut: 'Ctrl+S',       disabled: !hasImg, action: () => _save() },
      { icon: Icons.saveAs,     label: t('menu.saveAs'),     shortcut: 'Ctrl+Shift+S', disabled: !hasImg, action: () => _saveAs() },
      { icon: Icons.export,     label: t('menu.export'),     disabled: !hasImg, submenu: () => _exportMenuItems() },
      { icon: Icons.print,      label: t('menu.print'),      shortcut: 'Ctrl+P',       disabled: !_canPrint(), action: () => _openPrintPreview() },
      { icon: Icons.batch,      label: `${t('batch.title')}…`, action: () => _openBatch() },
      { separator: true },
      { icon: Icons.fileInfo,   label: t('menu.fileInfo'),   shortcut: 'Ctrl+I',       disabled: !hasFile, action: () => _showFileInfoDialog() },
      !isWeb && { icon: Icons.explorer, label: t('context.showInExplorer'), disabled: !hasFile, action: () => _showInExplorer() },
      !isWeb && { icon: Icons.delete,   label: t('context.deleteFile'), danger: true, disabled: !hasFile, action: () => state.currentFile && _deleteFile(state.currentFile) },
      !isWeb && { separator: true },
      !isWeb && { icon: Icons.exit,     label: t('menu.exit'), shortcut: 'Alt+F4', action: () => { _persistSessionFolder(); window.electronAPI.windowClose(); } },
    ].filter(Boolean);
  }

  async function _recentFolderItems() {
    const t = I18n.t.bind(I18n);
    const raw = _getRecentDirs();
    const existing = [];
    for (const p of raw) {
      try {
        const stats = await window.electronAPI.getFileStats(p);
        if (stats && !stats.error && stats.isDirectory) existing.push(p);
      } catch { /* gone */ }
    }
    if (existing.length !== raw.length) localStorage.setItem(RECENT_DIRS_KEY, JSON.stringify(existing));

    const items = [];
    if (!existing.length) {
      items.push({ icon: Icons.recent, label: t('places.noRecentFolders'), disabled: true });
    } else {
      for (const p of existing) {
        items.push({
          icon: Icons.recent,
          inline: true,
          label: _dirBaseName(p),
          detail: p,
          title: p,
          action: () => _openFolder(p),
          remove: {
            title: t('toolbar.removeRecentFolder') || 'Remove from history',
            action: () => { _removeRecentDir(p); ContextMenu.refreshSubmenu(0); },
          },
        });
      }
      items.push({ separator: true });
      items.push({
        icon: Icons.delete,
        danger: true,
        label: `${t('toolbar.clearRecentFolders') || 'Clear recent folders'} (${existing.length})`,
        action: () => _clearRecentFolderHistory(),
      });
    }
    return items;
  }

  function _exportMenuItems() {
    const t = I18n.t.bind(I18n);
    const hasImg = _isEditableImage();
    return [
      { icon: Icons.fmtPng,  label: t('menu.exportPng'),  disabled: !hasImg, action: () => _exportAs('png') },
      { icon: Icons.fmtJpg,  label: t('menu.exportJpeg'), disabled: !hasImg, action: () => _exportAs('jpg') },
      { icon: Icons.fmtWebp, label: t('menu.exportWebp'), disabled: !hasImg, action: () => _exportAs('webp') },
      { icon: Icons.fmtBmp,  label: t('menu.exportBmp'),  disabled: !hasImg, action: () => _exportAs('bmp') },
      { separator: true },
      { icon: Icons.copy,    label: t('menu.copyToClipboard'), shortcut: 'Ctrl+C', disabled: !hasImg, action: () => _copyToClipboard() },
    ];
  }

  function _editMenuItems() {
    const t = I18n.t.bind(I18n);
    const hasImg = _isEditableImage();
    const canEdit = _canStartEdit();
    const hasSel = hasImg && Editor.hasSelection();
    return [
      { icon: Icons.undo,  label: t('menu.undo'), shortcut: 'Ctrl+Z', disabled: !(hasImg && Editor.canUndo()), action: () => _undoEdit() },
      { icon: Icons.redo,  label: t('menu.redo'), shortcut: 'Ctrl+Y', disabled: !(hasImg && Editor.canRedo()), action: () => _redoEdit() },
      { separator: true },
      { icon: Icons.cut,   label: t('context.cut'),  shortcut: 'Ctrl+X', disabled: !hasSel, action: () => _cutToClipboard() },
      { icon: Icons.copy,  label: t('context.copy'), shortcut: 'Ctrl+C', disabled: !hasImg, action: () => _copyToClipboard() },
      { separator: true },
      { icon: Icons.rotateLeft,  label: t('menu.rotateLeft'),     shortcut: 'Ctrl+[', disabled: !hasImg, action: () => _rotate(-90) },
      { icon: Icons.rotateRight, label: t('menu.rotateRight'),    shortcut: 'Ctrl+]', disabled: !hasImg, action: () => _rotate(90) },
      { icon: Icons.flipH,       label: t('menu.flipHorizontal'), disabled: !hasImg, action: () => _flip('h') },
      { icon: Icons.flipV,       label: t('menu.flipVertical'),   disabled: !hasImg, action: () => _flip('v') },
      { icon: Icons.resize,      label: t('menu.resize'),         shortcut: 'Ctrl+Shift+R', disabled: !hasImg, action: () => _openResizeDialog() },
      { separator: true },
      { icon: Icons.bgRemove,    label: t('context.bgRemove'),    disabled: !hasImg, action: () => _removeBackground() },
      { icon: Icons.reset,       label: t('menu.resetEdits'),     disabled: !hasImg, action: () => _resetAll() },
      { separator: true },
      { icon: Icons.edit,        label: t('menu.editImage'),      shortcut: 'Ctrl+E', disabled: !canEdit, action: () => _openEditWindow() },
    ];
  }

  function _viewMenuItems() {
    const t = I18n.t.bind(I18n);
    const hasVisual = _hasViewerVisual();
    const hasImg = _isEditableImage();
    const canPrev = state.fileIndex > 0;
    const canNext = state.fileIndex >= 0 && state.fileIndex < state.fileList.length - 1;
    return [
      { icon: Icons.zoomIn,     label: t('menu.zoomIn'),      shortcut: 'Ctrl++', disabled: !hasVisual, action: () => _zoom(1.25) },
      { icon: Icons.zoomOut,    label: t('menu.zoomOut'),     shortcut: 'Ctrl+-', disabled: !hasVisual, action: () => _zoom(0.8) },
      { icon: Icons.fitWindow,  label: t('menu.fitToWindow'), shortcut: 'Ctrl+0', disabled: !hasVisual, checked: _wantFit && _viewMode === 'window', action: () => _setViewMode('window') },
      { icon: Icons.fitWidth,   label: t('toolbar.fitWidth'),  disabled: !hasVisual, checked: _wantFit && _viewMode === 'width', action: () => _setViewMode('width') },
      { icon: Icons.fitHeight,  label: t('toolbar.fitHeight'), disabled: !hasVisual, checked: _wantFit && _viewMode === 'height', action: () => _setViewMode('height') },
      { icon: Icons.center,     label: t('toolbar.center'),    disabled: !hasVisual, action: () => _centerView() },
      { icon: Icons.actualSize, label: t('menu.actualSize'),  shortcut: 'Ctrl+1', disabled: !hasImg,    action: () => _actualSize() },
      { separator: true },
      { icon: Icons.prev, label: t('menu.previousImage'), shortcut: '← / Page Up', disabled: !canPrev, action: () => _prevImage() },
      { icon: Icons.next, label: t('menu.nextImage'),     shortcut: '→ / Page Down', disabled: !canNext, action: () => _nextImage() },
      { separator: true },
      ..._dicomContextItems(),
      { icon: Icons.palette, label: t('menu.theme'), submenu: () => _themeMenuItems() },
      { separator: true },
      { icon: Icons.language, label: t('menu.language'), submenu: () => _langMenuItems() },
      { separator: true },
      { icon: Icons.settings, label: t('menu.settings'), action: () => _openSettings() },
    ].filter(Boolean);
  }

  function _langMenuItems() {
    return [
      { icon: Icons.flagUs, label: 'English', checked: state.lang === 'en', action: () => _handleMenuAction('lang-en') },
      { icon: Icons.flagKo, label: '한국어',  checked: state.lang === 'ko', action: () => _handleMenuAction('lang-ko') },
    ];
  }

  function _effectsMenuItems() {
    const t = I18n.t.bind(I18n);
    const hasImg = _isEditableImage();
    return [
      { icon: Icons.sliders,      label: t('menu.adjustments'), disabled: !hasImg, action: () => _handleMenuAction('show-effects') },
      { separator: true },
      { icon: Icons.grayscale,    label: t('menu.grayscale'),   disabled: !hasImg, action: () => _handleMenuAction('effect-grayscale') },
      { icon: Icons.sepia,        label: t('menu.sepia'),       disabled: !hasImg, action: () => _handleMenuAction('effect-sepia') },
      { icon: Icons.invertColors, label: t('menu.invert'),      disabled: !hasImg, action: () => _handleMenuAction('effect-invert') },
      { separator: true },
      { icon: Icons.reset,        label: t('menu.resetEffects'), disabled: !hasImg, action: () => _resetEffects() },
    ];
  }

  /**
   * Window menu: the panel layout and the window itself — the one part of the app
   * that applies whatever file is open, and had no keyboard-reachable home before.
   */
  function _windowMenuItems() {
    const t = I18n.t.bind(I18n);
    const web = _isWeb();
    // On the start screen everything here is greyed out except Settings
    const home = _homeIsOpen();
    return [
      { icon: Icons.panelLeft,  label: t('menu.leftPanel'),  checked: _layout.left,  disabled: home, action: () => _toggleLeftPanel() },
      { icon: Icons.panelRight, label: t('menu.rightPanel'), checked: _layout.right, disabled: home, action: () => _toggleRightPanel() },
      { separator: true },
      { icon: Icons.viewGrid, label: t('menu.browseMode'), checked: _browseMode, disabled: home, action: () => _toggleBrowseMode() },
      { separator: true },
      !web && { icon: Icons.fullscreen, label: t('menu.fullscreen'), shortcut: 'F11', disabled: home, action: () => window.electronAPI.toggleFullscreen?.() },
      !web && { icon: Icons.panelRight, label: t('menu.minimize'), disabled: home, action: () => window.electronAPI.windowMinimize?.() },
      !web && { icon: Icons.fitWindow, label: t('menu.maximize'), disabled: home, action: () => window.electronAPI.windowMaximize?.() },
      !web && { separator: true },
      { icon: Icons.settings, label: t('menu.settings'), action: () => _openSettings() },
    ].filter(Boolean);
  }

  function _helpMenuItems() {
    const t = I18n.t.bind(I18n);
    return [
      { icon: Icons.help,     label: t('help.title'),     action: () => _openHelp() },
      { icon: Icons.keyboard, label: t('menu.shortcuts'), action: () => _showDialog('shortcuts-overlay') },
      { separator: true },
      { icon: Icons.info,     label: t('menu.about'),     action: () => _showDialog('about-overlay') },
    ];
  }

  /* ════════════════════════════════════════════
     Home (start page) and the feature guide
  ════════════════════════════════════════════ */
  function _initHome() {
    for (const id of ['menubar-home-icon', 'ew-menubar-home-icon']) {
      const icon = document.getElementById(id);
      if (icon) icon.innerHTML = Icons.home || '';
    }
    document.getElementById('menubar-home')?.addEventListener('click', () => _goHome());
    // Edit window: the same Home — _goHome closes the editor first (unsaved edits are asked about)
    document.getElementById('ew-menubar-home')?.addEventListener('click', () => _goHome());
    document.getElementById('help-shortcuts')?.addEventListener('click', () => _showDialog('shortcuts-overlay'));
    document.getElementById('help-about')?.addEventListener('click', () => _showDialog('about-overlay'));
  }

  function _showHome() {
    const page = document.getElementById('start-page');
    if (!page) return;
    page.hidden = false;
    document.body.classList.add('home-open');
    const btn = document.getElementById('menubar-home');
    btn?.classList.add('is-on');
    btn?.setAttribute('aria-pressed', 'true');
    _renderHome();
    _ensureStartBg().then((bg) => bg?.show());
  }

  function _hideHome() {
    const page = document.getElementById('start-page');
    if (page) page.hidden = true;
    document.body.classList.remove('home-open');
    const btn = document.getElementById('menubar-home');
    btn?.classList.remove('is-on');
    btn?.setAttribute('aria-pressed', 'false');
    _startBg?.hide();
    if (page) requestAnimationFrame(() => FileTree.ensureSelectedVisible?.());
  }

  function _homeIsOpen() {
    const page = document.getElementById('start-page');
    return !!(page && !page.hidden);
  }

  async function _goHome() {
    if (_homeIsOpen()) {
      _hideHome();
      return;
    }
    if (state.editMode) {
      const closed = await _requestCloseEditWindow(false);
      if (!closed) return;
    }
    _showHome();
  }

  function _homeNeedImage(fn) {
    return () => {
      if (!state.currentFile || state.isVideo || state.isAudio) {
        if (statusMsg) statusMsg.textContent = I18n.t('home.needImage');
        return;
      }
      _hideHome();
      fn();
    };
  }

  /**
   * Start screen ▸ Explorer: the main view with the explorer open and the current folder's
   * images as thumbnails — the folder already shown, else the last one, else the home folder.
   */
  async function _homeExplorer() {
    _hideHome();
    if (!_layout.left) _toggleLeftPanel(true);
    let dir = Browse.getDir?.() || '';
    if (!dir && state.currentFile) dir = (await window.electronAPI.pathDirname(state.currentFile).catch(() => '')) || '';
    if (!dir) dir = localStorage.getItem('lastOpenedDir') || '';
    if (!dir && window.electronAPI.getLastOpenDir) dir = (await window.electronAPI.getLastOpenDir().catch(() => '')) || '';
    if (!dir) { _pickOpenFolder(); return; }
    await FileTree.revealPath?.(dir).catch?.(() => {});
    _showFolderInCenter(dir);
  }

  async function _homeBrowse() {
    _hideHome();
    const dir = state.currentFile
      ? await window.electronAPI.pathDirname(state.currentFile).catch(() => null)
      : localStorage.getItem('lastOpenedDir');
    if (!dir) { _pickOpenFolder(); return; }
    if (!_browseMode) _toggleBrowseMode();
  }

  function _homeCard(task) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'task-card';
    btn.innerHTML = `<span class="task-icon">${Icons[task.icon] || ''}</span>`
      + `<span class="${task.primary ? 'action-text' : 'task-text'}"><b></b><small></small></span>`;
    btn.querySelector('b').textContent = I18n.t(task.title);
    btn.querySelector('small').textContent = I18n.t(task.desc);
    btn.addEventListener('click', () => task.run());
    return btn;
  }

  function _startScreen() {
    try {
      const raw = JSON.parse(localStorage.getItem('startScreen') || '');
      const saved = raw && typeof raw === 'object' ? raw : {};
      const scene = START_SCENE_IDS.includes(saved.scene) ? saved.scene : START_SCREEN_DEFAULT.scene;
      const num = (key, max, fallback) => {
        const n = Math.round(Number(saved[key]));
        return Number.isFinite(n) ? Math.max(0, Math.min(max, n)) : fallback;
      };
      return {
        scene,
        transparency: num('transparency', 100, 0),
        motion: num('motion', 100, 20),
        showOnStart: saved.showOnStart !== false,
      };
    } catch {
      return { ...START_SCREEN_DEFAULT };
    }
  }

  function _saveStartScreen(patch) {
    const next = { ..._startScreen(), ...patch };
    try { localStorage.setItem('startScreen', JSON.stringify(next)); } catch { /* ignore */ }
    _startBg?.refresh?.();
    _syncStartScreenControls();
  }

  function _syncStartScreenControls() {
    if (_startSyncing) return;
    _startSyncing = true;
    try {
      const screen = _startScreen();
      const show = document.getElementById('start-show-on-start');
      const showSettings = document.getElementById('settings-show-home');
      if (show) show.checked = screen.showOnStart;
      if (showSettings) showSettings.checked = screen.showOnStart;
      document.querySelectorAll('.start-scene').forEach((btn) => {
        const on = btn.dataset.scene === screen.scene;
        btn.classList.toggle('on', on);
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      const sel = document.getElementById('settings-start-scene');
      if (sel && [...sel.options].some((opt) => opt.value === screen.scene)) sel.value = screen.scene;
      for (const el of document.querySelectorAll('[data-start-key]')) {
        const key = el.dataset.startKey;
        if (screen[key] == null || el.value === String(screen[key])) continue;
        el.value = String(screen[key]);
        el.dispatchEvent(new Event('sync-label'));
      }
    } finally {
      _startSyncing = false;
    }
  }

  function _ensureStartBg() {
    if (_startBg) return Promise.resolve(_startBg);
    if (_startBgLoading) return _startBgLoading;
    const host = document.querySelector('#start-page .start-bg');
    if (!host) return Promise.resolve(null);
    const src = document.querySelector('script[src*="app.js"]')?.src || 'js/app.js';
    _startBgLoading = import(new URL('startbg.js', src).href).then(({ StartBackground }) => {
      _startBg = new StartBackground(host, _startScreen);
      return _startBg;
    }).catch((err) => {
      console.error(err);
      _startBgLoading = null;
      return null;
    });
    return _startBgLoading;
  }

  function _nudgeStartRange(range, dir) {
    const step = Number(range.step) || 1;
    const min = Number(range.min) || 0;
    const max = Number(range.max);
    const next = Math.max(min, Math.min(max, Number(range.value) + dir * step));
    if (String(next) === String(range.value)) return;
    range.value = String(next);
    range.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function _startStepButton(dir, range) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'start-step';
    btn.textContent = dir < 0 ? '−' : '+';
    btn.title = I18n.t(dir < 0 ? 'start.speedDown' : 'start.speedUp');
    btn.addEventListener('click', () => _nudgeStartRange(range, dir));
    return btn;
  }

  function _startRange(key, labelKey, max, step, value) {
    const row = document.createElement('div');
    row.className = 'start-speed';
    const name = document.createElement('span');
    name.className = 'start-speed-name';
    name.textContent = I18n.t(labelKey);
    const range = document.createElement('input');
    range.type = 'range';
    range.min = '0';
    range.max = String(max);
    range.step = String(step);
    range.value = String(value);
    range.dataset.startKey = key;
    const val = document.createElement('span');
    val.className = 'start-speed-val';
    const paint = () => { val.textContent = `${range.value}%`; };
    range.addEventListener('sync-label', paint);
    range.addEventListener('input', () => {
      paint();
      if (_startSyncing) return;
      _saveStartScreen({ [key]: Number(range.value) });
    });
    paint();
    const ctrl = document.createElement('div');
    ctrl.className = 'start-speed-ctrl';
    ctrl.append(_startStepButton(-1, range), range, val, _startStepButton(1, range));
    row.append(name, ctrl);
    return row;
  }

  function _renderHome() {
    const scroll = document.getElementById('start-scroll');
    if (!scroll) return;
    try {
    _renderHomeBody(scroll);
    } catch (err) {
      console.error(err);
    }
  }

  /**
   * Start screen: recent folders · recent files · favorites, as tabs (the same lists as
   * the explorer's Recent and Favorites tabs). A click opens the entry and leaves the screen.
   */
  function _homePlaces() {
    const t = I18n.t.bind(I18n);
    const host = document.createElement('div');
    host.className = 'home-places';
    let tab = 'dirs';
    try { tab = localStorage.getItem(HOME_PLACES_TAB_KEY) || 'dirs'; } catch { /* ignore */ }
    const lists = {
      dirs: {
        label: t('home.tab.recentFolders'), icon: 'folder',
        entries: () => _getRecentDirs().map((p) => ({ path: p, kind: 'dir' })),
        empty: t('home.noRecent'),
        removeTitle: t('toolbar.removeRecentFolder'), remove: (p) => _removeRecentDir(p),
        clearLabel: t('toolbar.clearRecentFolders'), clear: () => _clearRecentFolderHistory(),
      },
      files: {
        label: t('home.tab.recentFiles'), icon: 'image',
        entries: () => _getRecentFiles().map((p) => ({ path: p, kind: 'file' })),
        empty: t('places.noRecentFiles'),
        removeTitle: t('places.removeRecentFile'), remove: (p) => _removeRecentFile(p),
        clearLabel: t('places.clearRecentFiles'), clear: () => _clearRecentFiles(),
      },
      favorites: {
        label: t('tree.tab.favorites'), icon: 'star',
        entries: () => _favorites.map((f) => ({ path: f.path, kind: f.kind })),
        empty: t('places.noFavorites'),
        removeTitle: t('context.removeFavorite'), remove: (p) => _removeFavorite(p),
        clearLabel: t('places.clearFavorites'), clear: () => _clearFavorites(),
      },
    };
    if (!lists[tab]) tab = 'dirs';

    const bar = document.createElement('div');
    bar.className = 'home-places-tabs';
    bar.setAttribute('role', 'tablist');
    const body = document.createElement('div');
    const fill = () => {
      const L = lists[tab];
      bar.querySelectorAll('button').forEach((b) => {
        const on = b.dataset.tab === tab;
        b.classList.toggle('on', on);
        b.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      body.replaceChildren();
      const entries = L.entries();
      if (!entries.length) {
        const p = document.createElement('p');
        p.className = 'start-muted';
        p.textContent = L.empty;
        body.appendChild(p);
        return;
      }
      const ul = document.createElement('ul');
      ul.className = 'recent-list';
      for (const e of entries) {
        const li = document.createElement('li');
        li.className = 'recent-item';
        li.title = e.path;
        const openBtn = document.createElement('button');
        openBtn.type = 'button';
        openBtn.className = 'recent-open';
        const ic = _placeIconHtml(e.path, e.kind);
        openBtn.innerHTML = (ic.html || '') + `<span class="recent-name">${_escHtml(_dirBaseName(e.path))}</span>`;
        openBtn.addEventListener('click', () => {
          _hideHome();
          _openPlace(e.path, e.kind).catch((err) => console.error(err));
        });
        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'recent-remove';
        removeBtn.title = L.removeTitle;
        removeBtn.setAttribute('aria-label', L.removeTitle);
        removeBtn.innerHTML = Icons.close || '×';
        removeBtn.addEventListener('click', (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          L.remove(e.path);
        });
        li.append(openBtn, removeBtn);
        ul.appendChild(li);
      }
      body.appendChild(ul);
      const clearAll = document.createElement('button');
      clearAll.type = 'button';
      clearAll.className = 'recent-clear';
      clearAll.textContent = L.clearLabel;
      clearAll.addEventListener('click', () => { L.clear(); });
      body.appendChild(clearAll);
    };
    for (const [id, L] of Object.entries(lists)) {
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.dataset.tab = id;
      b.innerHTML = `${Icons[L.icon] || ''}<span></span>`;
      b.querySelector('span').textContent = L.label;
      b.addEventListener('click', () => {
        tab = id;
        try { localStorage.setItem(HOME_PLACES_TAB_KEY, id); } catch { /* ignore */ }
        fill();
      });
      bar.appendChild(b);
    }
    host.append(bar, body);
    fill();
    return host;
  }

  function _renderHomeBody(scroll) {
    const begin = document.createElement('div');
    begin.className = 'start-actions';
    for (const task of HOME_TASKS.filter((t) => t.primary || t.icon === 'openFile' || t.icon === 'help' || t.icon === 'settings')) {
      const card = _homeCard(task);
      card.className = 'action-card';
      card.querySelector('span').className = 'action-icon';
      const text = card.querySelector('span:last-child');
      if (text) text.className = 'action-text';
      begin.appendChild(card);
    }
    const tasks = document.createElement('div');
    tasks.className = 'task-grid';
    for (const task of HOME_TASKS) tasks.appendChild(_homeCard(task));

    const recentHost = _homePlaces();

    const tipIndex = Math.floor(Date.now() / 86400000) % 4;
    const more = document.createElement('p');
    more.className = 'start-tip-more';
    more.hidden = true;
    more.textContent = I18n.t(`home.tip.${tipIndex}.more`);
    const label = document.createElement('span');
    label.className = 'start-tip-more-label';
    label.textContent = I18n.t('home.tipMore');
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'start-tip-toggle';
    toggle.innerHTML = `<span class="start-tip-icon">${Icons.sun || ''}</span><span class="start-tip-text"></span>`;
    toggle.querySelector('.start-tip-text').textContent = `${I18n.t('home.tip')}  ${I18n.t(`home.tip.${tipIndex}`)}`;
    toggle.appendChild(label);
    toggle.addEventListener('click', () => {
      more.hidden = !more.hidden;
      label.textContent = I18n.t(more.hidden ? 'home.tipMore' : 'home.tipLess');
    });
    const tip = document.createElement('div');
    tip.className = 'start-tip';
    tip.append(toggle, more);

    const group = (id, glyph, title, node) => {
      const sec = document.createElement('section');
      sec.className = 'start-group';
      sec.dataset.group = id;
      const h = document.createElement('h2');
      h.innerHTML = `${Icons[glyph] || ''}<span></span>`;
      h.querySelector('span').textContent = title;
      sec.append(h, node);
      return sec;
    };
    const screen = _startScreen();
    const showLabel = document.createElement('label');
    showLabel.className = 'start-show';
    const showBox = document.createElement('input');
    showBox.type = 'checkbox';
    showBox.id = 'start-show-on-start';
    showBox.checked = screen.showOnStart;
    showBox.addEventListener('change', () => _saveStartScreen({ showOnStart: showBox.checked }));
    const showText = document.createElement('span');
    showText.textContent = I18n.t('home.showOnStart');
    showLabel.append(showBox, showText);
    const scenes = document.createElement('div');
    scenes.className = 'start-scenes';
    for (const id of START_SCENE_IDS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'start-scene';
      btn.dataset.scene = id;
      const iconKey = `scene${id.charAt(0).toUpperCase()}${id.slice(1)}`;
      const icon = document.createElement('span');
      icon.className = 'start-scene-icon';
      icon.innerHTML = Icons[iconKey] || '';
      const name = document.createElement('span');
      name.className = 'start-scene-name';
      name.textContent = I18n.t(`start.scene.${id}`);
      btn.append(icon, name);
      btn.addEventListener('click', () => _saveStartScreen({ scene: id }));
      scenes.appendChild(btn);
    }
    const speeds = document.createElement('div');
    speeds.className = 'start-speeds';
    for (const [key, label, max, step] of START_SPEED_ROWS) {
      speeds.appendChild(_startRange(key, label, max, step, screen[key]));
    }
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'start-speed-reset';
    reset.textContent = I18n.t('start.speedReset');
    reset.addEventListener('click', () => _saveStartScreen({
      transparency: 0, motion: 20,
    }));
    speeds.appendChild(reset);
    const sceneBody = document.createElement('div');
    sceneBody.append(scenes, speeds);

    const board = document.createElement('div');
    board.className = 'start-board';
    board.append(
      group('begin', 'home', I18n.t('home.begin'), begin),
      group('tasks', 'viewGrid', I18n.t('home.tasks'), tasks),
      group('recent', 'recent', I18n.t('home.places'), recentHost),
      group('scenes', 'image', I18n.t('home.background'), sceneBody),
    );
    recentHost.appendChild(tip);

    scroll.replaceChildren();
    const wrap = document.createElement('div');
    wrap.className = 'start';
    const head = document.createElement('header');
    head.className = 'start-head';
    head.innerHTML = `<span class="start-logo"><img src="./assets/icon.png" alt=""></span><div><h1>MyImageViewer <span class="start-version"></span></h1><p></p></div>`;
    const startVer = head.querySelector('.start-version');
    if (startVer) startVer.textContent = _appInfoCache ? _versionLabel(_appInfoCache) : (document.querySelector('.app-brand-ver')?.textContent || 'V1.0.2');
    head.querySelector('p').textContent = I18n.t('home.lead');
    // "Show this screen at startup" sits at the top right of the header
    head.appendChild(showLabel);
    wrap.append(head, board);
    scroll.appendChild(wrap);
    _syncStartScreenControls();
  }

  if (showHome && !document.body.classList.contains('home-open')) _showHome();

  function _openHelp() {
    _showDialog('help-overlay');
    _fillHelpDoc();
  }

  function _helpDocUrl() {
    const file = state.lang === 'ko' ? '도움말.md' : 'help.md';
    const name = encodeURIComponent(file);
    if (location.protocol === 'file:') return `../doc/${name}`;
    return `/doc/${name}`;
  }

  let _helpDocKey = '';
  async function _fillHelpDoc() {
    const doc = document.getElementById('help-doc');
    const nav = document.getElementById('help-nav');
    if (!doc || !nav) return;
    const key = state.lang || 'en';
    if (_helpDocKey === key && doc.querySelector('h1')) return;
    doc.innerHTML = `<p class="help-status">${I18n.t('help.loading')}</p>`;
    nav.innerHTML = '';
    try {
      let md = '';
      if (window.electronAPI?.readHelpDoc && window.electronAPI.platform !== 'web') {
        md = await window.electronAPI.readHelpDoc(state.lang);
      }
      if (!md) {
        const res = await fetch(_helpDocUrl(), { cache: 'no-store' });
        if (!res.ok) throw new Error(String(res.status));
        md = await res.text();
      }
      doc.innerHTML = _markdownToHtml(md);
      _helpDocKey = key;
      nav.innerHTML = '';
      doc.querySelectorAll('h2').forEach((h, i) => {
        if (!h.id) h.id = `help-sec-${i}`;
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = h.textContent;
        b.addEventListener('click', () => {
          nav.querySelectorAll('button').forEach((x) => x.classList.remove('is-on'));
          b.classList.add('is-on');
          h.scrollIntoView({ block: 'start' });
        });
        nav.appendChild(b);
      });
    } catch (err) {
      _helpDocKey = '';
      doc.innerHTML = `<p class="help-status">${I18n.t('help.failed')}</p>`;
      console.warn('help doc', err);
    }
  }

  function _markdownToHtml(src) {
    const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const inline = (s) => esc(s)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    const lines = String(src).replace(/\r\n/g, '\n').split('\n');
    const out = [];
    let i = 0;
    const flushList = (items, ordered) => {
      if (!items.length) return;
      const tag = ordered ? 'ol' : 'ul';
      out.push(`<${tag}>${items.map((it) => `<li>${inline(it)}</li>`).join('')}</${tag}>`);
      items.length = 0;
    };
    let list = [];
    let ordered = false;
    while (i < lines.length) {
      const line = lines[i];
      if (/^\s*\|/.test(line) && i + 1 < lines.length && /^\s*\|?\s*-{3,}/.test(lines[i + 1])) {
        flushList(list, ordered);
        const rows = [];
        const split = (row) => row.split('|').slice(1, -1).map((c) => c.trim());
        rows.push(split(line));
        i += 2;
        while (i < lines.length && /^\s*\|/.test(lines[i])) { rows.push(split(lines[i])); i++; }
        const head = rows[0].map((c) => `<th>${inline(c)}</th>`).join('');
        const body = rows.slice(1).map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('');
        out.push(`<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`);
        continue;
      }
      const ul = /^\s*[-*]\s+(.*)$/.exec(line);
      const ol = /^\s*\d+\.\s+(.*)$/.exec(line);
      if (ul || ol) {
        const nextOrdered = !!ol;
        if (list.length && nextOrdered !== ordered) flushList(list, ordered);
        ordered = nextOrdered;
        list.push((ul || ol)[1]);
        i++;
        continue;
      }
      flushList(list, ordered);
      if (!line.trim()) { i++; continue; }
      if (line.trim() === '---') { out.push('<hr>'); i++; continue; }
      const h = /^(#{1,3})\s+(.*)$/.exec(line);
      if (h) {
        const level = h[1].length;
        out.push(`<h${level}>${inline(h[2])}</h${level}>`);
        i++;
        continue;
      }
      out.push(`<p>${inline(line)}</p>`);
      i++;
    }
    flushList(list, ordered);
    return out.join('');
  }

  /* ─── Export (Save As with a preset format) ─── */
  function _exportAs(ext) {
    return _saveAs(false, { ext });
  }

  /* ─── Print ─── */
  /** Only ever true while an image is the thing on screen — the single source of
   *  truth for the Print button, the File menu row and Ctrl+P. */
  function _canPrint() {
    if (_browseShowing()) return false;   // the contact sheet covers the viewer
    return !state.isVideo && !state.isAudio && (Editor.isLoaded() || !!state.isAnimated);
  }

  /** Canvas / image already on screen — no PNG encode. Used for instant preview. */
  function _printSource() {
    if (Editor.isLoaded() && displayCanvas && displayCanvas.width) return displayCanvas;
    if (displayCanvas && displayCanvas.width) return displayCanvas;
    if (state.isAnimated) {
      if (animFreeze && animFreeze.style.display !== 'none' && animFreeze.width) return animFreeze;
      if (animImg && animImg.naturalWidth) return animImg;
    }
    return null;
  }

  function _printableDataUrl() {
    const src = _printSource();
    if (src && src.toDataURL) {
      try { return src.toDataURL('image/png'); } catch { /* fall through */ }
    }
    if (src && src.naturalWidth) {
      try {
        const c = document.createElement('canvas');
        c.width = src.naturalWidth;
        c.height = src.naturalHeight;
        c.getContext('2d').drawImage(src, 0, 0);
        return c.toDataURL('image/png');
      } catch { /* fall through */ }
    }
    return state.animatedDataUrl || null;
  }

  function _blitPrintPreview(src) {
    const dest = document.getElementById('print-preview-img');
    if (!dest || !src) return;
    const sw = src.naturalWidth || src.width || 0;
    const sh = src.naturalHeight || src.height || 0;
    if (!sw || !sh) return;
    const max = 1600;
    const s = Math.min(1, max / sw, max / sh);
    dest.width = Math.max(1, Math.round(sw * s));
    dest.height = Math.max(1, Math.round(sh * s));
    const ctx = dest.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'medium';
    ctx.drawImage(src, 0, 0, dest.width, dest.height);
  }

  /* Print preview: paper / orientation / margins / scale are chosen here, the page is
   * drawn to scale, and "Print" sends the picture straight to the selected printer
   * (the system default is pre-selected). */
  const PRINT_PAPERS = { A4: [210, 297], Letter: [215.9, 279.4], Legal: [215.9, 355.6], A3: [297, 420], A5: [148, 210], Tabloid: [279.4, 431.8] };
  const PRINT_PREFS_KEY = 'printPrefs';   // _print itself is declared at the top of the module

  function _loadPrintPrefs() {
    try { return JSON.parse(localStorage.getItem(PRINT_PREFS_KEY) || '{}') || {}; } catch { return {}; }
  }

  function _readPrintForm() {
    const q = (id) => document.getElementById(id);
    const radio = (name) => document.querySelector(`input[name="${name}"]:checked`)?.value;
    const headerKind = ['filename', 'date', 'both', 'custom'].includes(q('print-header-kind')?.value)
      ? q('print-header-kind').value : 'filename';
    const headerAlign = radio('print-header-align') || 'center';
    const pageNoPos = q('print-pageno-pos')?.value || 'footer-center';
    const pageNoFmt = q('print-pageno-fmt')?.value || 'nOfN';
    return {
      printer:  q('print-printer')?.value || '',
      paper:    PRINT_PAPERS[q('print-paper-size')?.value] ? q('print-paper-size').value : 'A4',
      orient:   radio('print-orient') || 'auto',
      marginMm: Math.max(0, parseFloat(q('print-margins')?.value) || 0),
      scale:    radio('print-scale') || 'fit',
      scalePct: Math.min(400, Math.max(5, parseFloat(q('print-scale-pct')?.value) || 100)),
      copies:   Math.min(99, Math.max(1, parseInt(q('print-copies')?.value, 10) || 1)),
      color:    q('print-color')?.value === 'gray' ? 'gray' : 'color',
      headerOn:    !!q('print-header-on')?.checked,
      headerKind,
      headerAlign: ['left', 'center', 'right'].includes(headerAlign) ? headerAlign : 'center',
      headerText:  q('print-header-text')?.value || '',
      pageNoOn:    !!q('print-pageno-on')?.checked,
      pageNoPos:   /^(header|footer)-(left|center|right)$/.test(pageNoPos) ? pageNoPos : 'footer-center',
      pageNoFmt:   ['n', 'nOfN', 'pageN', 'dash'].includes(pageNoFmt) ? pageNoFmt : 'nOfN',
    };
  }

  function _writePrintForm(f) {
    const q = (id) => document.getElementById(id);
    if (q('print-paper-size') && PRINT_PAPERS[f.paper]) q('print-paper-size').value = f.paper;
    const orient = document.querySelector(`input[name="print-orient"][value="${f.orient}"]`);
    if (orient) orient.checked = true;
    if (q('print-margins')) q('print-margins').value = String(f.marginMm);
    const scale = document.querySelector(`input[name="print-scale"][value="${f.scale}"]`);
    if (scale) scale.checked = true;
    if (q('print-scale-pct')) q('print-scale-pct').value = String(f.scalePct);
    if (q('print-copies')) q('print-copies').value = String(f.copies);
    if (q('print-color')) q('print-color').value = f.color;
    if (q('print-header-on')) q('print-header-on').checked = f.headerOn !== false;
    if (q('print-header-kind') && f.headerKind) q('print-header-kind').value = f.headerKind;
    const halign = document.querySelector(`input[name="print-header-align"][value="${f.headerAlign || 'center'}"]`);
    if (halign) halign.checked = true;
    if (q('print-header-text') && f.headerText != null) q('print-header-text').value = f.headerText;
    if (q('print-pageno-on')) q('print-pageno-on').checked = f.pageNoOn !== false;
    if (q('print-pageno-pos') && f.pageNoPos) q('print-pageno-pos').value = f.pageNoPos;
    if (q('print-pageno-fmt') && f.pageNoFmt) q('print-pageno-fmt').value = f.pageNoFmt;
  }

  const PRINT_BAND_MM = 7;

  function _printFileName() {
    return state.currentFile ? state.currentFile.split(/[/\\]/).pop() : (I18n.t('app.title') || 'Image');
  }

  function _printHeadingText(f) {
    if (!f.headerOn) return '';
    const name = _printFileName();
    const date = new Date().toLocaleDateString(state.lang === 'ko' ? 'ko-KR' : undefined);
    if (f.headerKind === 'date') return date;
    if (f.headerKind === 'both') return `${name}  ·  ${date}`;
    if (f.headerKind === 'custom') return String(f.headerText || '').trim();
    return name;
  }

  function _printPageNumberText(f, page = 1, total = 1) {
    if (!f.pageNoOn) return '';
    const t = I18n.t.bind(I18n);
    if (f.pageNoFmt === 'n') return String(page);
    if (f.pageNoFmt === 'pageN') return (t('print.pageN') || 'Page {n}').replace('{n}', String(page));
    if (f.pageNoFmt === 'dash') return `- ${page} -`;
    return (t('print.nOfN') || '{n} / {total}').replace('{n}', String(page)).replace('{total}', String(total));
  }

  function _putPrintSlot(band, align, text) {
    if (!text) return;
    if (band[align]) band[align] = `${band[align]}  ·  ${text}`;
    else band[align] = text;
  }

  /** Header / footer slot text for the current form (page 1 of 1 for a single image). */
  function _printChrome(f) {
    const header = { left: '', center: '', right: '' };
    const footer = { left: '', center: '', right: '' };
    const heading = _printHeadingText(f);
    if (heading) _putPrintSlot(header, f.headerAlign || 'center', heading);
    const pageNo = _printPageNumberText(f);
    if (pageNo) {
      const [band, align] = String(f.pageNoPos || 'footer-center').split('-');
      _putPrintSlot(band === 'header' ? header : footer, align || 'center', pageNo);
    }
    const headerOn = !!(header.left || header.center || header.right);
    const footerOn = !!(footer.left || footer.center || footer.right);
    return {
      header,
      footer,
      headerMm: headerOn ? PRINT_BAND_MM : 0,
      footerMm: footerOn ? PRINT_BAND_MM : 0,
    };
  }

  /** Page geometry (mm) for the current form: paper, orientation and the image box. */
  function _printLayout(f) {
    const [pw0, ph0] = PRINT_PAPERS[f.paper] || PRINT_PAPERS.A4;
    const imgLandscape = _print.imgW > _print.imgH;
    const landscape = f.orient === 'landscape' || (f.orient === 'auto' && imgLandscape);
    const pw = landscape ? ph0 : pw0;
    const ph = landscape ? pw0 : ph0;
    const chrome = _printChrome(f);
    const cw = Math.max(1, pw - 2 * f.marginMm);
    const ch = Math.max(1, ph - 2 * f.marginMm - chrome.headerMm - chrome.footerMm);
    let iw = 0, ih = 0;
    if (_print.imgW && _print.imgH) {
      const fit = Math.min(cw / _print.imgW, ch / _print.imgH);
      let k = fit;
      if (f.scale === 'actual') k = 25.4 / 96;              // CSS px → mm (100 % on screen)
      else if (f.scale === 'custom') k = fit * f.scalePct / 100;
      iw = _print.imgW * k;
      ih = _print.imgH * k;
    }
    return { pw, ph, cw, ch, iw, ih, landscape, ...chrome };
  }

  function _renderPrintPreview() {
    const f = _readPrintForm();
    const L = _printLayout(f);
    const stage = document.getElementById('print-preview-stage');
    const paper = document.getElementById('print-paper');
    const content = document.getElementById('print-content');
    const img = document.getElementById('print-preview-img');
    if (!stage || !paper || !content || !img) return;

    const sw = Math.max(40, (stage.clientWidth || stage.offsetWidth || 520) - 32);
    const sh = Math.max(40, (stage.clientHeight || stage.offsetHeight || 460) - 32);
    const k = Math.max(0.01, Math.min(sw / L.pw, sh / L.ph));      // mm → preview px
    paper.style.width = `${L.pw * k}px`;
    paper.style.height = `${L.ph * k}px`;
    paper.classList.toggle('gray', f.color === 'gray');
    content.style.left = `${f.marginMm * k}px`;
    content.style.top = `${(f.marginMm + L.headerMm) * k}px`;
    content.style.width = `${L.cw * k}px`;
    content.style.height = `${L.ch * k}px`;
    img.style.width = `${L.iw * k}px`;
    img.style.height = `${L.ih * k}px`;

    const fontPx = Math.max(7, 3.2 * k);
    const fillBand = (id, slots, mm, top) => {
      const el = document.getElementById(id);
      if (!el) return;
      const on = mm > 0;
      el.hidden = !on;
      if (!on) return;
      el.style.left = el.style.right = `${f.marginMm * k}px`;
      if (top) el.style.top = `${f.marginMm * k}px`;
      else el.style.bottom = `${f.marginMm * k}px`;
      el.style.height = `${mm * k}px`;
      el.style.fontSize = `${fontPx}px`;
      const set = (side, text) => {
        const s = document.getElementById(`${id}-${side === 'center' ? 'c' : side[0]}`);
        if (s) s.textContent = text || '';
      };
      set('left', slots.left);
      set('center', slots.center);
      set('right', slots.right);
    };
    fillBand('print-header', L.header, L.headerMm, true);
    fillBand('print-footer', L.footer, L.footerMm, false);

    document.getElementById('print-scale-custom-wrap')?.toggleAttribute('hidden', f.scale !== 'custom');
    document.getElementById('print-header-custom-wrap')?.toggleAttribute('hidden', !f.headerOn || f.headerKind !== 'custom');
    document.getElementById('print-header-opts')?.toggleAttribute('hidden', !f.headerOn);
    document.getElementById('print-pageno-opts')?.toggleAttribute('hidden', !f.pageNoOn);
    const info = document.getElementById('print-page-info');
    if (info) {
      const t = I18n.t.bind(I18n);
      info.textContent = (t('print.pageInfo') || '')
        .replace('{paper}', f.paper)
        .replace('{orient}', t(L.landscape ? 'print.landscape' : 'print.portrait'))
        .replace('{pw}', Math.round(L.pw)).replace('{ph}', Math.round(L.ph))
        .replace('{iw}', Math.round(L.iw)).replace('{ih}', Math.round(L.ih));
    }
    try { localStorage.setItem(PRINT_PREFS_KEY, JSON.stringify({ ...f, printer: undefined })); } catch {}
  }

  function _applyPrinters(printers) {
    const sel = document.getElementById('print-printer');
    if (!sel) return;
    const t = I18n.t.bind(I18n);
    const prev = sel.value;
    sel.innerHTML = '';
    _print.printers = printers;
    if (!printers.length) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = _isWeb() ? t('print.browserPrinter') : t('print.noPrinters');
      sel.appendChild(opt);
      return;
    }
    printers = [...printers].sort((a, b) => (b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0));
    for (const pr of printers) {
      const opt = document.createElement('option');
      opt.value = pr.name;
      opt.textContent = pr.displayName + (pr.isDefault ? ` ${t('print.default')}` : '');
      if (pr.isDefault) opt.selected = true;
      sel.appendChild(opt);
    }
    if (prev && [...sel.options].some((o) => o.value === prev)) sel.value = prev;
    else if (!printers.some((pr) => pr.isDefault)) sel.selectedIndex = 0;
  }

  async function _fillPrinterList() {
    if (_print.printersCache && (Date.now() - _print.printersCacheAt < 60000)) {
      _applyPrinters(_print.printersCache);
      return;
    }
    let printers = [];
    try { printers = (await window.electronAPI.getPrinters?.()) || []; } catch { printers = []; }
    _print.printersCache = printers;
    _print.printersCacheAt = Date.now();
    _applyPrinters(printers);
  }

  function _initPrintDialog() {
    const overlay = document.getElementById('print-overlay');
    if (!overlay) return;
    overlay.querySelectorAll('select, input').forEach((el) => {
      el.addEventListener('change', _renderPrintPreview);
      if (el.type === 'number' || el.type === 'text') el.addEventListener('input', _renderPrintPreview);
    });
    document.getElementById('print-go')?.addEventListener('click', () => _printImage());
    window.addEventListener('resize', () => { if (overlay.classList.contains('visible')) _renderPrintPreview(); });
    _fillPrinterList();
  }

  async function _openPrintPreview() {
    if (!_canPrint()) return;
    const src = _printSource();
    if (!src) return;
    _print.dataUrl = null;
    _print.imgW = src.naturalWidth || src.width || 0;
    _print.imgH = src.naturalHeight || src.height || 0;
    _writePrintForm({
      paper: 'A4', orient: 'auto', marginMm: 10, scale: 'fit', scalePct: 100, copies: 1, color: 'color',
      headerOn: true, headerKind: 'filename', headerAlign: 'center', headerText: '',
      pageNoOn: true, pageNoPos: 'footer-center', pageNoFmt: 'nOfN',
      ..._loadPrintPrefs(),
    });
    _showDialog('print-overlay');
    _blitPrintPreview(src);
    const stage = document.getElementById('print-preview-stage');
    if (stage) void stage.offsetHeight;
    _renderPrintPreview();
    requestAnimationFrame(_renderPrintPreview);
    _fillPrinterList();
  }

  /** "Print" in the preview: send to the selected printer without another dialog. */
  async function _printImage() {
    if (_print.busy) return;
    const f = _readPrintForm();
    const L = _printLayout(f);
    const title = _printFileName();
    const goBtn = document.getElementById('print-go');
    _print.busy = true;
    if (goBtn) { goBtn.disabled = true; goBtn.querySelector('span').textContent = I18n.t('print.printing'); }
    try {
      const dataUrl = _print.dataUrl || _printableDataUrl();
      if (!dataUrl) {
        _showError(I18n.t('error.print') || 'Could not print the image.', '');
        return;
      }
      _print.dataUrl = dataUrl;
      const res = await window.electronAPI.printImage({
        dataUrl,
        title,
        deviceName: f.printer || undefined,
        copies: f.copies,
        landscape: L.landscape,
        pageSize: f.paper,
        marginMm: f.marginMm,
        imgWmm: Math.round(L.iw * 100) / 100,
        imgHmm: Math.round(L.ih * 100) / 100,
        color: f.color,
        header: L.header,
        footer: L.footer,
        headerMm: L.headerMm,
        footerMm: L.footerMm,
      });
      if (res && res.error && res.error !== 'cancelled') {
        _showError(I18n.t('error.print') || 'Could not print the image.', res.error);
      } else if (!res || !res.error) {
        _hideDialog('print-overlay');
        const pr = _print.printers.find((x) => x.name === f.printer);
        if (pr) _updateStatus({ msg: (I18n.t('print.sent') || 'Sent to {printer}').replace('{printer}', pr.displayName) });
      }
    } catch (e) {
      _showError(I18n.t('error.print') || 'Could not print the image.', e);
    } finally {
      _print.busy = false;
      if (goBtn) { goBtn.disabled = false; goBtn.querySelector('span').textContent = I18n.t('print.print'); }
    }
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
      } else if (child.classList.contains('ew-toolbar') || child.classList.contains('ew-group') || child.classList.contains('ew-actions')) {
        // Do not use the clipped box — sum the real button widths
        w += _measureFlexContentWidth(child);
      } else {
        const cs = getComputedStyle(child);
        const minW = parseFloat(cs.minWidth) || 0;
        const cssW = parseFloat(cs.width) || 0;
        w += Math.max(child.scrollWidth, child.getBoundingClientRect().width, minW, cssW);
      }
      // Horizontal margins (separators, action groups) take room too
      const mcs = getComputedStyle(child);
      w += (parseFloat(mcs.marginLeft) || 0) + (parseFloat(mcs.marginRight) || 0);
      if (i < kids.length - 1) w += gap;
    });
    return Math.ceil(w);
  }

  function _measureEditTitlebarWidth() {
    const win = document.getElementById('edit-window');
    const bar = document.getElementById('ew-toolbar-row');
    if (!win || !bar) return 0;

    const temp = !win.classList.contains('visible');
    if (temp) win.classList.add('measuring');
    const tolWrap = document.getElementById('ew-tolerance-wrap');
    const tolWas = tolWrap ? tolWrap.style.display : '';
    if (tolWrap) tolWrap.style.display = 'flex';
    const width = _measureFlexContentWidth(bar, 'ew-spacer');
    if (tolWrap) tolWrap.style.display = tolWas;
    if (temp) win.classList.remove('measuring');
    return width;
  }

  function _mainMinWidth() {
    return Math.max(_measureFlexContentWidth(toolbar, 'toolbar-spacer') + 12, 1200);
  }

  function _editMinWidth() {
    return Math.max(_measureEditTitlebarWidth() + 12, 1200);
  }

  function _appMinWidth() {
    return Math.max(_mainMinWidth(), _editMinWidth());
  }

  function _syncWindowMinSize(opts = {}) {
    const force = !!opts.force;
    const width = _appMinWidth();
    if (!force && _appliedMinWidth && Math.abs(width - _appliedMinWidth) < 8) return width;
    _appliedMinWidth = width;
    window.electronAPI.windowSetMinSize?.(width, APP_MIN_HEIGHT);
    return width;
  }

  function _syncEditChromeMinSize() {
    _syncWindowMinSize({ force: true });
  }

  function _initWindowChrome() {
    const isWeb = window.electronAPI.platform === 'web';
    document.body.classList.toggle('frameless', !isWeb);
    document.body.classList.toggle('is-web', isWeb);
    _initResizeGrips();
    if (isWeb) return;

    const minBtn = document.getElementById('win-min');
    const maxBtn = document.getElementById('win-max');
    const closeBtn = document.getElementById('win-close');
    minBtn?.addEventListener('click', () => window.electronAPI.windowMinimize());
    maxBtn?.addEventListener('click', () => {
      window.electronAPI.windowMaximize();
    });
    closeBtn?.addEventListener('click', async () => {
      if (state.editMode) {
        await _requestCloseEditWindow(false);
        return;
      }
      _persistSessionFolder();
      window.electronAPI.windowClose();
    });
    // Quit / refresh also keeps the last folder for the next launch.
    window.addEventListener('pagehide', () => { _persistSessionFolder(); });
    window.addEventListener('beforeunload', () => { _persistSessionFolder(); });
    window.electronAPI.onMaximizeChange?.((maximized) => _setMaximizedUi(!!maximized));
    window.electronAPI.windowIsMaximized?.().then((m) => _setMaximizedUi(!!m));
    requestAnimationFrame(() => _syncWindowMinSize());
  }

  function _initResizeGrips() {
    const grips = [...document.querySelectorAll('.win-resize-grip')];
    const tip = () => I18n.t('window.resize') || 'Resize';
    grips.forEach((el) => {
      el.title = tip();
      Tooltip.attach?.(el, tip);
    });
    if (!window.electronAPI.windowGetBounds || !window.electronAPI.windowSetSize) return;
    if (window.electronAPI.platform === 'web') return;

    let drag = null;
    let raf = 0;
    const apply = () => {
      raf = 0;
      if (!drag) return;
      window.electronAPI.windowSetSize(drag.w, drag.h);
    };
    const onMove = (e) => {
      if (!drag) return;
      drag.w = drag.startW + (e.screenX - drag.x);
      drag.h = drag.startH + (e.screenY - drag.y);
      if (!raf) raf = requestAnimationFrame(apply);
    };
    const onUp = () => {
      if (!drag) return;
      drag = null;
      document.body.classList.remove('resizing-se');
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    grips.forEach((el) => {
      el.addEventListener('pointerdown', async (e) => {
        if (e.button !== 0 || document.body.classList.contains('maximized')) return;
        e.preventDefault();
        const b = await window.electronAPI.windowGetBounds();
        if (!b || b.maximized) return;
        drag = { x: e.screenX, y: e.screenY, startW: b.width, startH: b.height, w: b.width, h: b.height };
        document.body.classList.add('resizing-se');
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
      });
    });
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

    const isImage = k === 'image';

    // Navigation / view (available for images; limited for A/V)
    set('btn-zoom-in', isImage || k === 'video' || state.isAnimated);
    set('btn-zoom-out', isImage || k === 'video' || state.isAnimated);
    // Display modes work for pictures and video alike
    const visual = isImage || k === 'video' || state.isAnimated;
    for (const id of ['btn-fit', 'btn-fit-width', 'btn-fit-height', 'btn-actual', 'btn-center']) set(id, visual);
    _syncViewModeButtons();
    const zd = document.getElementById('zoom-display');
    if (zd) zd.disabled = !(isImage || k === 'video' || state.isAnimated);
    _updateNavButtons();

    // Image editing only
    set('btn-save', isImage);
    set('btn-rotate-l', isImage);
    set('btn-rotate-r', isImage);
    set('btn-flip-h', isImage);
    set('btn-flip-v', isImage);
    set('btn-resize', isImage);
    set('btn-edit', isImage || !!_browseSelectedImagePath());
    set('btn-print', _canPrint());
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
    const canUndo = Editor.canUndo() || (!state.editMode && _dicomMeasCanUndo());
    const canRedo = Editor.canRedo() || (!state.editMode && _dicomMeasCanRedo());
    _setChromeBtn(document.getElementById('btn-undo'), canUndo);
    _setChromeBtn(document.getElementById('btn-redo'), canRedo);
    _setChromeBtn(document.getElementById('ew-undo'), Editor.canUndo());
    _setChromeBtn(document.getElementById('ew-redo'), Editor.canRedo());
  }

  function _onHistoryChange() {
    _editorSeq = ++_actionSeq;
    _updateUndoRedoBtns();
    if (state.editMode) window.EditTools?.refresh();
    _syncSlidersFromEffects('eff');
    _syncSlidersFromEffects('ew-eff');
    _queueColorPanelSync();
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

  async function _runOpWithProgress(work, {
    titleKey = 'progress.title',
    messageKey = 'progress.applying',
    force = false,
    delayMs = 0,
    kind = null,
  } = {}) {
    const dlg = _pd();
    const nested = !!(dlg && typeof dlg.isVisible === 'function' && dlg.isVisible());
    if (nested) return await Promise.resolve(work(dlg));

    const predicted = !!(force || (kind && Editor.shouldShowOpProgress && Editor.shouldShowOpProgress(kind)));
    let shown = false;
    let timer = null;

    const showNow = (percent, msg) => {
      if (!dlg) return;
      if (!shown) {
        shown = true;
        dlg.show({
          title: I18n.t(titleKey) || I18n.t('progress.title') || 'Progress',
          message: msg || I18n.t(messageKey) || '',
          percent: percent != null ? percent : 8,
          modal: !!document.getElementById('edit-window')?.classList.contains('visible'),
        });
        dlg.startCreep(90);
      } else {
        dlg.set(percent != null ? percent : 0, msg);
      }
    };

    try {
      if (predicted && dlg) {
        showNow(8, I18n.t(messageKey));
      } else if (dlg && delayMs > 0) {
        timer = setTimeout(() => showNow(8, I18n.t(messageKey)), delayMs);
      }
      const result = await Promise.resolve(work(dlg));
      if (timer) { clearTimeout(timer); timer = null; }
      return result;
    } finally {
      if (timer) clearTimeout(timer);
      if (shown) dlg.hide();
    }
  }

  function _openProgressLabel(key, fileName) {
    if (key === 'opening') {
      return (I18n.t('progress.opening') || 'Opening {file}…').replace('{file}', fileName || '');
    }
    const mapped = I18n.t(`progress.${key}`);
    if (mapped && mapped !== `progress.${key}`) return mapped;
    return key || '';
  }

  function _fileAlreadyInList(filePath) {
    if (!filePath || !state.fileList?.length) return false;
    if (FileTree.indexOfPath) return FileTree.indexOfPath(state.fileList, filePath) >= 0;
    return state.fileList.indexOf(filePath) >= 0;
  }

  /** Bottom filmstrip of the same folder while an image is on screen. */
  async function _showFilmstripFor(filePath) {
    if (!filePath || !window.Browse?.setFilmstrip) {
      if (Browse.isVisible?.() && !Browse.isFilmstrip?.()) Browse.hide();
      return;
    }
    try {
      // The strip is always the image's own folder — not whatever folder the sheet
      // showed last, or prev / next would walk a list the image is not in.
      let dir = '';
      if (window.electronAPI?.pathDirname) {
        dir = (await window.electronAPI.pathDirname(filePath)) || '';
      }
      if (!dir) dir = Browse.getDir?.() || '';
      if (!dir) {
        if (Browse.isVisible?.()) Browse.hide();
        return;
      }
      // Switch to filmstrip FIRST so the full sheet stops covering the viewer,
      // then refresh folder contents if needed.
      Browse.setFilmstrip(true);
      if (_normWatchPath(Browse.getDir?.() || '') !== _normWatchPath(dir)) {
        await Browse.open(dir);
        Browse.setFilmstrip(true); // open() must not leave us in full-sheet mode
      }
      Browse.select?.(filePath, { notify: false });
    } catch {
      if (Browse.isVisible?.() && !Browse.isFilmstrip?.()) Browse.hide();
      else if (Browse.isVisible?.()) Browse.setFilmstrip?.(true);
    }
  }

  // `seamless`: stepping through a DICOM series — the old slice stays up until the new one
  // is ready and no progress is shown, so playback does not flicker.
  async function _openFile(filePath, { center = false, seamless = false } = {}) {
    if (!filePath) return;
    _hideHome();
    // Opening a file: contact sheet becomes a bottom filmstrip so the image can show.
    _browseSheetHeld = true;
    // Panels stay as the user left them — stepping through images must not
    // expand a collapsed side panel.
    // Collapse the old slide-in effects drawer if it was left open.
    if (effectsPanel?.classList.contains('visible')) {
      effectsPanel.classList.remove('visible');
      state.effectsPanelVisible = false;
    }
    await _showFilmstripFor(filePath);
    // Prevent overlapping opens (Windows fs.watch often fires when we read the file)
    if (_openingFile && _openingFile === filePath) return;
    // Reading the file/dir on Windows trips fs.watch — keep the explorer still.
    _cancelTreeRefresh();
    _ignoreWatchUntil = Date.now() + 4000;
    if (state.editMode) {
      const same = state.currentFile &&
        String(state.currentFile).replace(/\\/g, '/').toLowerCase() ===
        String(filePath).replace(/\\/g, '/').toLowerCase();
      if (same) return;
      const closed = await _requestCloseEditWindow(false);
      if (!closed) return;
    }
    _openingFile = filePath;
    const openGen = ++_openGen;
    _updateInfoPanel(filePath);
    // The previous image must not linger (and then get repainted) while this one decodes
    if (!seamless) _beginViewerSwitch();
    const fileName = filePath.split(/[/\\]/).pop();
    let progressShown = false;
    let openSettled = false;
    const openTitle = I18n.t('progress.openTitle') || I18n.t('progress.title') || 'Opening file';
    const showOpenProgress = (percent, messageKey) => {
      if (openSettled || seamless) return;
      const dlg = _pd();
      if (!dlg) return;
      if (!progressShown) {
        progressShown = true;
        _showLoading(false);
        dlg.show({
          title: openTitle,
          message: _openProgressLabel(messageKey || 'opening', fileName),
          percent: percent != null ? percent : 6,
          modal: !!state.editMode,
        });
        dlg.startCreep(88);
        return;
      }
      dlg.set(percent != null ? percent : 0, _openProgressLabel(messageKey || 'opening', fileName));
      if (percent >= 90) dlg.stopCreep();
    };
    const unsubProgress = window.electronAPI.onOpenProgress
      ? window.electronAPI.onOpenProgress(({ percent, message }) => {
          showOpenProgress(percent, message);
        })
      : null;
    showOpenProgress(6, 'opening');

    try {
      const result = await _withTimeout(
        FormatSupport.loadImageFile(filePath),
        25000,
        I18n.t('error.openFile') || 'Opening this file took too long'
      );

      if (openGen !== _openGen) return;

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
      state.dicomTags   = result.dicomTags || null;
      _setDicomSession(result.dicom || null);
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
        if (!result.dataUrl && !result.canvas) {
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
          await _loadImageDataUrl(result.canvas || result.dataUrl, filePath, result.dicomMeta);
          mediaKind = _isEditableImage() ? 'image' : 'none';
        }
      }

      _updateToolbarForMedia(mediaKind);
      _showLoading(false);

      FileTree.setSelected(filePath, { center });
      const dir = await window.electronAPI.pathDirname(filePath);
      _rememberRecentDir(dir);
      if (!seamless) _rememberRecentFile(filePath);   // a played series is not "opened" slice by slice
      _watchDir(dir);
      if (!_fileAlreadyInList(filePath)) {
        state.fileList = await FileTree.getImageFilesInDir(dir);
      }
      state.fileIndex = FileTree.indexOfPath
        ? FileTree.indexOfPath(state.fileList, filePath)
        : state.fileList.indexOf(filePath);
      _updateNavButtons();
      // The folder's list decides whether a single-frame DICOM gets the series controls
      if (state.dicom) _dicomSyncBar();

      _ignoreWatchUntil = Date.now() + 4000;
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
      openSettled = true;
      if (typeof unsubProgress === 'function') unsubProgress();
      if (progressShown) _pd()?.hide();
      if (_openingFile === filePath) _openingFile = null;
      _ignoreWatchUntil = Math.max(_ignoreWatchUntil, Date.now() + 2500);
      _showLoading(false);
      // Only the newest open reveals the viewer — a superseded one leaves it blank
      if (openGen === _openGen) _endViewerSwitch();
      if (openGen === _openGen) {
        _browseSheetHeld = true;
        // Always convert the covering contact sheet into a bottom filmstrip —
        // never Browse.hide() alone, which left the viewer empty for the user.
        const shown = state.currentFile || filePath;
        if (shown) _showFilmstripFor(shown).catch(() => {});
        else if (Browse.isVisible?.() && !Browse.isFilmstrip?.()) Browse.hide();
        _revealOpenedImage();
        _wantFit = true;
        requestAnimationFrame(() => {
          if (openGen !== _openGen) return;
          _fitToWindow();
          // Layout can settle one frame later (sheet hide / home close).
          requestAnimationFrame(() => {
            if (openGen !== _openGen) return;
            if (_wantFit) _fitToWindow();
          });
        });
      }
    }
  }

  /** Make sure a just-opened still image is actually on screen (sheet down, canvas up). */
  function _revealOpenedImage() {
    const shown = state.currentFile || _openingFile;
    // Full contact sheet must never cover the viewer after an open.
    if (Browse.isVisible?.() && !Browse.isFilmstrip?.()) {
      if (shown && Browse.setFilmstrip) {
        Browse.setFilmstrip(true);
        Browse.select?.(shown, { notify: false });
      } else {
        Browse.hide();
      }
    }
    viewerContainer?.classList.remove('is-switching');
    document.getElementById('viewer-area')?.classList.add('has-filmstrip');
    if (state.isVideo || state.isAudio) return;
    if (state.isAnimated) {
      if (imagePlaceholder) imagePlaceholder.style.display = 'none';
      return;
    }
    if (!Editor.isLoaded?.()) return;
    if (imagePlaceholder) imagePlaceholder.style.display = 'none';
    if (displayCanvas) displayCanvas.style.display = 'block';
    if (selCanvas) selCanvas.style.display = 'block';
    if (imageWrapper) imageWrapper.style.visibility = 'visible';
  }

  /** Blank the viewer for the length of an open: no old frame, no old sound. */
  function _beginViewerSwitch() {
    viewerContainer?.classList.add('is-switching');
    try { if (videoEl && !videoEl.paused) videoEl.pause(); } catch { /* ignore */ }
    try { if (audioEl && !audioEl.paused) audioEl.pause(); } catch { /* ignore */ }
  }

  function _endViewerSwitch() {
    viewerContainer?.classList.remove('is-switching');
  }

  function _prefetchConvertedNeighbors() {
    if (!window.electronAPI.convertToPng) return;
    const idx = state.fileIndex;
    const list = state.fileList || [];
    [list[idx + 1], list[idx - 1]].forEach((p) => {
      if (p && (FormatSupport.isHeic(p) || FormatSupport.isTiff(p))) {
        _ignoreWatchUntil = Date.now() + 4000;
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
      const show = (source) => {
        _showPlaceholder(false);
        _showVideoPlayer(null);
        _showAudioPlayer(null);
        _hideAnimatedImage();
        displayCanvas.style.display  = 'block';
        selCanvas.style.display      = 'block';
        videoEl.style.display        = 'none';
        Editor.loadImage(source);
        _fitToWindow();
        _updateStatus({ filePath, dicomMeta });
        _dicomSyncBar();
      };
      // A ready canvas (DICOM rendering) needs no decoding round-trip
      if (typeof dataUrl !== 'string' && dataUrl.getContext) {
        show(dataUrl);
        resolve();
        return;
      }
      const img = new Image();
      // Desktop file URLs are another origin (asset protocol); without CORS the
      // editor canvas is tainted and getImageData / export throw.
      img.crossOrigin = 'anonymous';
      const done = () => resolve();
      // Safety: never leave the loading overlay waiting forever
      const timer = setTimeout(() => {
        _showPlaceholder(true);
        done();
      }, 15000);
      img.onload = () => {
        clearTimeout(timer);
        show(img);
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

  /* ════════════════════════════════════════════
     DICOM: frames + window (centre / width)
     The decoded session (state.dicom) keeps the raw samples; a window or
     frame change re-renders in the renderer and swaps the Editor source
     without touching the file or marking it dirty.
  ════════════════════════════════════════════ */

  function _setDicomSession(image) {
    if (state.dicom && state.dicom !== image) {
      try { state.dicom.release?.(); } catch { /* ignore */ }
    }
    _dicomStopCine();
    state.dicom = image || null;
    _dicomBusy = false;
    _dicomNext = null;
    _dicomCineFps = null;
    _dicomMeasReset();
    _dicomSyncBar();
    _dicomOverlayRequest();
    // Overlay planes take the colour chosen in Settings (the first render used the decoder default)
    if (image && image.overlays && image.overlays.length) {
      const rgb = _dicomOverlayRgb();
      const cur = image.state.overlayColor || [];
      if (rgb.some((c, i) => c !== cur[i])) _dicomApply({ overlayColor: rgb });
    }
  }

  function _dicomHasBar() {
    const d = state.dicom;
    // The contact sheet covers the viewer: its DICOM bar and overlay would sit on top.
    // The filmstrip under an open image does not — the image and its tools stay.
    if (window.Browse?.isVisible?.() && !window.Browse?.isFilmstrip?.()) return false;
    return !!(d && Editor.isLoaded() && !state.isVideo && !state.isAudio && !state.editMode);
  }

  function _dicomFmt(v) {
    if (!Number.isFinite(v)) return '';
    return Math.abs(v) >= 100 || Math.abs(v - Math.round(v)) < 0.05 ? String(Math.round(v)) : v.toFixed(1);
  }

  // The windows that apply to the frame on screen (enhanced multi-frame files carry them per frame)
  function _dicomFrameWindows(d) {
    if (!d) return [];
    try { return d.windowsFor ? d.windowsFor(d.state.frame) : d.fileWindows; } catch { return d.fileWindows || []; }
  }

  function _dicomPresetId() {
    const d = state.dicom;
    if (!d) return '';
    if (d.state.voiLut >= 0) return `lut:${d.state.voiLut}`;
    const same = (a, b) => Math.abs(a - b) < 0.5;
    const fi = _dicomFrameWindows(d).findIndex((w) => same(w.wc, d.state.wc) && same(w.ww, d.state.ww));
    if (fi >= 0) return `file:${fi}`;
    const p = (d.presets || []).find((x) => same(x.wc, d.state.wc) && same(x.ww, d.state.ww));
    if (p) return p.id;
    const auto = d.autoWindow?.();
    if (auto && same(auto.wc, d.state.wc) && same(auto.ww, d.state.ww)) return 'auto';
    return '';
  }

  function _dicomBuildPresetOptions() {
    const d = state.dicom;
    if (!d || !dcmPreset) return;
    const t = I18n.t.bind(I18n);
    const opts = [];
    opts.push(`<option value="" disabled>${_escHtml(t('dicom.preset.custom'))}</option>`);
    const wins = _dicomFrameWindows(d);
    wins.forEach((w, i) => {
      const label = w.label ? ` — ${w.label}` : (wins.length > 1 ? ` ${i + 1}` : '');
      opts.push(`<option value="file:${i}">${_escHtml(`${t('dicom.preset.file')}${label} (C ${_dicomFmt(w.wc)} / W ${_dicomFmt(w.ww)})`)}</option>`);
    });
    (d.voiLuts || []).forEach((l, i) => {
      opts.push(`<option value="lut:${i}">${_escHtml(`${t('dicom.preset.lut')} — ${l.label}`)}</option>`);
    });
    opts.push(`<option value="auto">${_escHtml(t('dicom.preset.auto'))}</option>`);
    (d.presets || []).forEach((p) => {
      opts.push(`<option value="${p.id}">${_escHtml(`${t(`dicom.preset.${p.id}`)} (C ${p.wc} / W ${p.ww})`)}</option>`);
    });
    dcmPreset.innerHTML = opts.join('');
    dcmPreset.dataset.frame = String(d.state.frame);
  }

  function _dicomBuildColormapOptions() {
    const d = state.dicom;
    if (!d || !dcmColormap) return;
    const t = I18n.t.bind(I18n);
    dcmColormap.innerHTML = (d.colormaps || ['gray']).map((id) => {
      const key = `dicom.cm.${id}`;
      const label = t(key);
      return `<option value="${id}">${_escHtml(label && label !== key ? label : id)}</option>`;
    }).join('');
    dcmColormap.dataset.lang = state.lang;
  }

  function _dicomSyncBar() {
    if (!dicomBar) return;
    const d = state.dicom;
    const on = _dicomHasBar();
    dicomBar.hidden = !on;
    dicomBar.style.display = on ? 'flex' : 'none';
    dicomBar.classList.toggle('is-on', on);
    if (!on) {
      _dicomStopCine();
      _dicomProbeShow(null);
      return;
    }
    const st = d.state;
    // Frames
    const multi = d.frames > 1;
    const series = !multi && _dicomSeriesMode();
    if (dcmFramesWrap) dcmFramesWrap.hidden = !(multi || series);
    const cineMode = document.getElementById('dcm-cine-mode');
    if (cineMode && cineMode.value !== _dicomCineMode) cineMode.value = _dicomCineMode;
    if (series) {
      const files = _dicomSeriesFiles();
      const idx = _dicomSeriesIndex(files);
      if (dcmFrameSeek) {
        dcmFrameSeek.max = String(files.length - 1);
        if (document.activeElement !== dcmFrameSeek) dcmFrameSeek.value = String(idx);
      }
      if (dcmFrameLabel) dcmFrameLabel.textContent = `${I18n.t('dicom.series')} ${idx + 1} / ${files.length}`;
      document.getElementById('dcm-prev-frame')?.toggleAttribute('disabled', idx <= 0);
      document.getElementById('dcm-next-frame')?.toggleAttribute('disabled', idx >= files.length - 1);
      dcmPlayBtn?.classList.toggle('is-active', !!_dicomSeriesTimer);
      dcmPlayBtn?.setAttribute('aria-pressed', _dicomSeriesTimer ? 'true' : 'false');
      if (dcmFps && document.activeElement !== dcmFps) dcmFps.value = String(Math.round(_dicomSeriesRate()));
      const sep = document.getElementById('dcm-frames-sep');
      if (sep) sep.hidden = false;
    }
    if (multi) {
      if (dcmFrameSeek) {
        dcmFrameSeek.max = String(d.frames - 1);
        if (document.activeElement !== dcmFrameSeek) dcmFrameSeek.value = String(st.frame);
      }
      if (dcmFrameLabel) dcmFrameLabel.textContent = `${I18n.t('dicom.frame')} ${st.frame + 1} / ${d.frames}`;
      document.getElementById('dcm-prev-frame')?.toggleAttribute('disabled', st.frame <= 0);
      document.getElementById('dcm-next-frame')?.toggleAttribute('disabled', st.frame >= d.frames - 1);
      dcmPlayBtn?.classList.toggle('is-active', !!_dicomCineTimer);
      dcmPlayBtn?.setAttribute('aria-pressed', _dicomCineTimer ? 'true' : 'false');
      if (dcmFps && document.activeElement !== dcmFps) dcmFps.value = String(Math.round(_dicomCineRate()));
      const sep = document.getElementById('dcm-frames-sep');
      if (sep) sep.hidden = false;   // frames and tools always share the bottom row
    }
    // Window (the whole top row is display-only, so it goes with it)
    if (dcmWindowWrap) dcmWindowWrap.hidden = !d.gray;
    document.getElementById('dcm-row-display')?.toggleAttribute('hidden', !d.gray);
    if (d.gray) {
      if (dcmPreset && (!dcmPreset.options.length || dcmPreset.dataset.for !== state.currentFile
          || (d.enhanced && dcmPreset.dataset.frame !== String(st.frame)))) {
        _dicomBuildPresetOptions();
        dcmPreset.dataset.for = state.currentFile || '';
      }
      if (dcmPreset) dcmPreset.value = _dicomPresetId();
      const lutOn = st.voiLut >= 0;
      if (dcmWc && document.activeElement !== dcmWc) dcmWc.value = lutOn ? '' : _dicomFmt(st.wc);
      if (dcmWw && document.activeElement !== dcmWw) dcmWw.value = lutOn ? '' : _dicomFmt(st.ww);
      dcmWc?.toggleAttribute('disabled', lutOn);
      dcmWw?.toggleAttribute('disabled', lutOn);
      dcmInvertBtn?.classList.toggle('is-active', !!st.invert);
      dcmInvertBtn?.setAttribute('aria-pressed', st.invert ? 'true' : 'false');
      if (dcmColormap) {
        if (!dcmColormap.options.length || dcmColormap.dataset.lang !== state.lang) _dicomBuildColormapOptions();
        dcmColormap.value = st.colormap || 'gray';
      }
      // Both readouts carry their own label, so the numbers are never bare.
      if (dcmRange) {
        dcmRange.textContent = d.range
          ? `${_dicomFmt(d.range.min)} … ${_dicomFmt(d.range.max)}${d.units ? ` ${d.units}` : ''}`
          : '';
      }
      document.getElementById('dcm-range-wrap')?.toggleAttribute('hidden', !d.range);
      const voiFn = st.voiFunction && st.voiFunction !== 'LINEAR' ? st.voiFunction : '';
      const dcmVoi = document.getElementById('dcm-voi');
      if (dcmVoi) dcmVoi.textContent = voiFn;
      document.getElementById('dcm-voi-wrap')?.toggleAttribute('hidden', !voiFn);
    }
    // Tools: overlay planes, annotations, measurement tools
    if (dcmOverlaysBtn) {
      const has = !!(d.overlays && d.overlays.length);
      dcmOverlaysBtn.hidden = !has;
      dcmOverlaysBtn.classList.toggle('is-active', has && !!st.overlays);
      dcmOverlaysBtn.setAttribute('aria-pressed', has && st.overlays ? 'true' : 'false');
    }
    if (dcmAnnotBtn) {
      dcmAnnotBtn.classList.toggle('is-active', _dicomAnnotOn);
      dcmAnnotBtn.setAttribute('aria-pressed', _dicomAnnotOn ? 'true' : 'false');
    }
    if (dcmRulerBtn) {
      dcmRulerBtn.classList.toggle('is-active', _dicomRulerOn);
      dcmRulerBtn.setAttribute('aria-pressed', _dicomRulerOn ? 'true' : 'false');
    }
    for (const [id, on] of [['dcm-grid', _dicomGridOn], ['dcm-cross', _dicomCrossOn]]) {
      const b = document.getElementById(id);
      if (!b) continue;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    const physBtn = document.getElementById('dcm-physical');
    if (physBtn) physBtn.disabled = !(_dicomSpacing()?.[1] > 0) || !_dicomGeomValid();
    if (dcmScaleBtn) {
      dcmScaleBtn.classList.toggle('is-active', _dicomScaleOn);
      dcmScaleBtn.setAttribute('aria-pressed', _dicomScaleOn ? 'true' : 'false');
    }
    const toolsOk = _dicomGeomValid();
    dcmToolsWrap?.querySelectorAll('.dcm-tool').forEach((b) => {
      b.toggleAttribute('disabled', !toolsOk);
      b.classList.toggle('is-active', toolsOk && b.dataset.tool === _dicomTool);
      b.setAttribute('aria-pressed', toolsOk && b.dataset.tool === _dicomTool ? 'true' : 'false');
    });
    document.getElementById('dcm-meas-clear')?.toggleAttribute('disabled', !_dicomMeas.length);
    _dicomBarLayout();
    _updateStatus({});
  }

  /**
   * One line while every group fits, two rows when it does not. Measured, not
   * guessed: the one-line layout lets the bar overflow (nothing shrinks), so
   * `scrollWidth > clientWidth` is exactly the question "does it still fit?".
   */
  function _dicomBarLayout() {
    if (!dicomBar || dicomBar.hidden) return;
    const was = dicomBar.classList.contains('is-stacked');
    dicomBar.classList.remove('is-stacked');
    const overflows = dicomBar.scrollWidth > dicomBar.clientWidth + 1;
    dicomBar.classList.toggle('is-stacked', overflows);
    // A row more or less moves the bar's top edge, which the overlay draws around.
    if (overflows !== was) _dicomOverlayRequest();
  }

  // Re-render (another frame / window). One at a time: a request made while one is
  // being drawn is kept and applied afterwards, so dragging never queues up.
  function _dicomApply(opts) {
    const d = state.dicom;
    if (!d || !Editor.isLoaded()) return;
    if (_dicomBusy) { _dicomNext = { ...(_dicomNext || {}), ...opts }; return; }
    _dicomBusy = true;
    d.toCanvas(opts).then(({ canvas }) => {
      if (state.dicom !== d) return;
      // Windowing is a view setting, not an edit: keep the file's dirty state as it was
      const wasDirty = state.isDirty;
      Editor.replaceSource(canvas);
      if (!wasDirty) _clearDirty();
      _updateUndoRedoBtns();
      _dicomSyncBar();
      _dicomOverlayRequest();
      _dicomProbeRefresh();
    }).catch((e) => {
      console.error('DICOM re-render failed:', e);
      _updateStatus({ msg: e && e.message ? e.message : String(e) });
    }).finally(() => {
      _dicomBusy = false;
      const next = _dicomNext;
      _dicomNext = null;
      if (next && state.dicom === d) _dicomApply(next);
    });
  }

  function _dicomFrame(i) {
    const d = state.dicom;
    if (!d || d.frames <= 1) return;
    const frame = Math.max(0, Math.min(d.frames - 1, i));
    if (frame === d.state.frame) return;
    _dicomApply({ frame });
  }

  function _dicomWindow(wc, ww) {
    const d = state.dicom;
    if (!d || !d.gray) return;
    _dicomApply({ wc, ww: Math.max(1, ww) });
  }

  function _dicomPresetApply(id) {
    const d = state.dicom;
    if (!d || !id) return;
    if (id === 'auto') {
      const a = d.autoWindow?.();
      if (a) _dicomWindow(a.wc, a.ww);
      return;
    }
    if (id.startsWith('file:')) {
      const w = _dicomFrameWindows(d)[Number(id.slice(5))];
      if (w) _dicomWindow(w.wc, w.ww);
      return;
    }
    if (id.startsWith('lut:')) {
      _dicomApply({ voiLut: Number(id.slice(4)) });
      return;
    }
    const p = (d.presets || []).find((x) => x.id === id);
    if (p) _dicomWindow(p.wc, p.ww);
  }

  function _dicomResetWindow() {
    const d = state.dicom;
    if (!d) return;
    const invert = d.defaultInvert ? d.defaultInvert() : d.photometric === 'MONOCHROME1';
    _dicomApply({ resetWindow: true, invert, colormap: 'gray' });
  }

  function _dicomSetColormap(id) {
    const d = state.dicom;
    if (!d || !d.gray || !(d.colormaps || []).includes(id)) return;
    _dicomApply({ colormap: id });
  }

  function _dicomCycleColormap() {
    const d = state.dicom;
    if (!d || !d.gray) return;
    const list = d.colormaps || ['gray'];
    _dicomSetColormap(list[(list.indexOf(d.state.colormap) + 1) % list.length]);
  }

  function _dicomToggleOverlays() {
    const d = state.dicom;
    if (!d || !(d.overlays && d.overlays.length)) return;
    _dicomApply({ overlays: !d.state.overlays });
  }

  function _dicomToggleInvert() {
    const d = state.dicom;
    if (!d) return;
    _dicomApply({ invert: !d.state.invert });
  }

  function _dicomStopCine() {
    if (_dicomCineTimer) {
      clearTimeout(_dicomCineTimer);
      _dicomCineTimer = null;
      dcmPlayBtn?.classList.remove('is-active');
      dcmPlayBtn?.setAttribute('aria-pressed', 'false');
    }
  }

  // Cine speed in fps: the user's override, else the file's Recommended Display Frame Rate /
  // Cine Rate / Frame Time (Vector), else 10 fps.
  function _dicomCineRate() {
    if (Number.isFinite(_dicomCineFps) && _dicomCineFps > 0) return _dicomCineFps;
    const d = state.dicom;
    if (d && Number.isFinite(d.frameRate) && d.frameRate > 0) return d.frameRate;
    const def = parseFloat(_pref('dicomDefaultFps'));
    return Number.isFinite(def) && def > 0 ? Math.min(120, def) : 10;
  }

  function _dicomOverlayRgb() {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(_pref('dicomOverlayColor') || '').trim());
    if (!m) return [0, 255, 128];
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function _dicomSetCineFps(fps) {
    _dicomCineFps = Number.isFinite(fps) && fps > 0 ? Math.min(120, fps) : null;
    if (_dicomSeriesTimer || _dicomSeriesMode()) _dicomSeriesFps = _dicomCineFps;
    if (_dicomCineTimer) { _dicomStopCine(); _dicomToggleCine(); }
    _dicomSyncBar();
  }

  /** The frame / slice after `cur` of `n` under the repeat mode; -1 → stop here. */
  function _dicomCineNext(cur, n) {
    if (n < 2) return -1;
    if (_dicomCineMode === 'once') return cur + 1 < n ? cur + 1 : -1;
    if (_dicomCineMode === 'bounce') {
      if (cur + _dicomCineDir >= n || cur + _dicomCineDir < 0) _dicomCineDir = -_dicomCineDir;
      return cur + _dicomCineDir;
    }
    return (cur + 1) % n;
  }

  function _dicomSetCineMode(mode) {
    if (!['loop', 'bounce', 'once'].includes(mode)) return;
    _dicomCineMode = mode;
    _dicomCineDir = 1;
    try { localStorage.setItem('dicomCineMode', mode); } catch { /* ignore */ }
    _dicomSyncBar();
  }

  /* ── Series: a folder of single-frame DICOM files (one file per slice) steps and plays
     like the frames of one file — the slider, ◀ ▶ and Play walk through the files. ── */

  function _dicomSeriesFiles() {
    const list = Array.isArray(state.fileList) ? state.fileList : [];
    return list.filter((p) => /\.(dcm|dicom)$/i.test(p));
  }

  function _dicomSeriesIndex(files) {
    const key = _normDirKey(state.currentFile || '');
    return files.findIndex((p) => _normDirKey(p) === key);
  }

  function _dicomSeriesMode() {
    const d = state.dicom;
    if (!d || d.frames > 1) return false;
    const files = _dicomSeriesFiles();
    return files.length > 1 && _dicomSeriesIndex(files) >= 0;
  }

  function _dicomSeriesRate() {
    return Number.isFinite(_dicomSeriesFps) && _dicomSeriesFps > 0 ? _dicomSeriesFps : _dicomCineRate();
  }

  /** Show slice `i` of the series; the window / colour the user set carries over. */
  async function _dicomSeriesGo(i) {
    const files = _dicomSeriesFiles();
    if (files.length < 2 || i < 0 || i >= files.length) return;
    const prev = state.dicom;
    const keep = prev && prev.gray
      ? { wc: prev.state.wc, ww: prev.state.ww, invert: prev.state.invert, colormap: prev.state.colormap }
      : null;
    await _openFile(files[i], { seamless: true });
    const d = state.dicom;
    if (keep && d && d !== prev && d.gray && Number.isFinite(keep.wc)
      && (d.state.wc !== keep.wc || d.state.ww !== keep.ww || d.state.invert !== keep.invert || d.state.colormap !== keep.colormap)) {
      _dicomApply(keep);
    }
    _dicomSyncBar();
  }

  function _dicomStopSeriesCine() {
    if (!_dicomSeriesTimer) return;
    clearTimeout(_dicomSeriesTimer);
    _dicomSeriesTimer = null;
    _dicomSyncBar();
  }

  function _dicomToggleSeriesCine() {
    if (_dicomSeriesTimer) { _dicomStopSeriesCine(); return; }
    if (!_dicomSeriesMode()) return;
    const tick = async () => {
      if (!_dicomSeriesTimer) return;
      const files = _dicomSeriesFiles();
      const cur = _dicomSeriesIndex(files);
      if (files.length < 2 || cur < 0 || !state.dicom || !_dicomHasBar()) { _dicomStopSeriesCine(); return; }
      // same repeat mode as frame cine; "once" from the last slice starts over first
      const next = restart ? 0 : _dicomCineNext(cur, files.length);
      restart = false;
      if (next < 0) { _dicomStopSeriesCine(); return; }
      const t0 = performance.now();
      await _dicomSeriesGo(next);
      if (!_dicomSeriesTimer) return;
      _dicomSeriesTimer = setTimeout(tick, Math.max(0, 1000 / _dicomSeriesRate() - (performance.now() - t0)));
    };
    _dicomCineDir = 1;
    const files0 = _dicomSeriesFiles();
    let restart = _dicomCineMode === 'once' && _dicomSeriesIndex(files0) >= files0.length - 1;
    _dicomSeriesTimer = setTimeout(tick, 1000 / _dicomSeriesRate());
    _dicomSyncBar();
  }

  // The frame controls: frames of this file, or the files of its series
  function _dicomStep(delta) {
    if (_dicomSeriesMode()) {
      _dicomStopSeriesCine();
      const files = _dicomSeriesFiles();
      _dicomSeriesGo(_dicomSeriesIndex(files) + delta);
      return;
    }
    _dicomFrame((state.dicom?.state.frame ?? 0) + delta);
  }

  function _dicomTogglePlay() {
    if (_dicomSeriesTimer || _dicomSeriesMode()) _dicomToggleSeriesCine();
    else _dicomToggleCine();
  }

  function _dicomToggleCine() {
    const d = state.dicom;
    if (!d || d.frames <= 1) return;
    if (_dicomCineTimer) { _dicomStopCine(); return; }
    // Delay before showing frame i: the Frame Time Vector entry when the file has one and
    // the speed is not overridden, otherwise 1000 / fps.
    const delayFor = (frame) => {
      if (_dicomCineFps == null && d.frameTimes && d.frameTimes[frame] > 0) return Math.max(20, d.frameTimes[frame]);
      return Math.max(1000 / 120, 1000 / _dicomCineRate());
    };
    const tick = () => {
      const cur = state.dicom;
      if (!cur || cur !== d || !_dicomHasBar()) { _dicomStopCine(); return; }
      // "Once" from the last frame starts over from the first
      const next = restart ? 0 : _dicomCineNext(cur.state.frame, cur.frames);
      restart = false;
      if (next < 0) { _dicomStopCine(); _dicomSyncBar(); return; }
      if (!_dicomBusy) _dicomApply({ frame: next });
      _dicomCineTimer = setTimeout(tick, delayFor(next));
    };
    let restart = _dicomCineMode === 'once' && d.state.frame >= d.frames - 1;
    _dicomCineDir = 1;
    _dicomCineTimer = setTimeout(tick, delayFor((d.state.frame + 1) % d.frames));
    dcmPlayBtn?.classList.add('is-active');
    dcmPlayBtn?.setAttribute('aria-pressed', 'true');
  }

  // Ctrl+drag (or the middle button) on a grey DICOM: left/right = width, up/down = centre.
  function _dicomBeginWindowDrag(e) {
    const d = state.dicom;
    if (!d || !d.gray || !_dicomHasBar()) return false;
    const wantsDrag = (e.button === 0 && (e.ctrlKey || e.metaKey)) || e.button === 1;
    if (!wantsDrag) return false;
    e.preventDefault();
    const wc0 = d.state.wc, ww0 = d.state.ww, x0 = e.clientX, y0 = e.clientY;
    const span = d.range ? d.range.max - d.range.min : ww0;
    const k = Math.max(0.05, (span || 256) / 400);   // units per pixel
    viewerContainer.classList.add('dicom-windowing');
    const move = (ev) => _dicomWindow(wc0 + (ev.clientY - y0) * k, ww0 + (ev.clientX - x0) * k);
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      viewerContainer.classList.remove('dicom-windowing');
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return true;
  }

  function _initDicomBar() {
    if (!dicomBar) return;
    document.getElementById('dcm-prev-frame')?.addEventListener('click', () => _dicomStep(-1));
    document.getElementById('dcm-next-frame')?.addEventListener('click', () => _dicomStep(1));
    dcmFrameSeek?.addEventListener('input', () => {
      if (_dicomSeriesMode()) { _dicomStopSeriesCine(); _dicomSeriesGo(Number(dcmFrameSeek.value)); }
      else _dicomFrame(Number(dcmFrameSeek.value));
    });
    dcmPlayBtn?.addEventListener('click', _dicomTogglePlay);
    document.getElementById('dcm-cine-mode')?.addEventListener('change', (e) => _dicomSetCineMode(e.target.value));
    document.getElementById('dcm-save-video')?.addEventListener('click', () => _dicomSaveVideo());
    dcmPreset?.addEventListener('change', () => _dicomPresetApply(dcmPreset.value));
    const commitWl = () => {
      const d = state.dicom;
      if (!d) return;
      const wc = parseFloat(dcmWc?.value);
      const ww = parseFloat(dcmWw?.value);
      _dicomWindow(Number.isFinite(wc) ? wc : d.state.wc, Number.isFinite(ww) ? ww : d.state.ww);
    };
    dcmWc?.addEventListener('change', commitWl);
    dcmWw?.addEventListener('change', commitWl);
    [dcmWc, dcmWw].forEach((el) => el?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); el.blur(); }
      e.stopPropagation();
    }));
    dcmInvertBtn?.addEventListener('click', _dicomToggleInvert);
    document.getElementById('dcm-reset')?.addEventListener('click', _dicomResetWindow);
    dcmColormap?.addEventListener('change', () => _dicomSetColormap(dcmColormap.value));
    dcmFps?.addEventListener('change', () => _dicomSetCineFps(parseFloat(dcmFps.value)));
    dcmFps?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); dcmFps.blur(); }
      e.stopPropagation();
    });
    dcmOverlaysBtn?.addEventListener('click', _dicomToggleOverlays);
    dcmAnnotBtn?.addEventListener('click', _dicomToggleAnnotations);
    dcmRulerBtn?.addEventListener('click', _dicomToggleRulerAxes);
    dcmScaleBtn?.addEventListener('click', _dicomToggleScaleBar);
    document.getElementById('dcm-grid')?.addEventListener('click', _dicomToggleGrid);
    document.getElementById('dcm-cross')?.addEventListener('click', _dicomToggleCrosshair);
    document.getElementById('dcm-physical')?.addEventListener('click', _dicomPhysicalSize);
    dcmToolsWrap?.querySelectorAll('.dcm-tool').forEach((b) => {
      b.addEventListener('click', () => _dicomSetTool(_dicomTool === b.dataset.tool ? null : b.dataset.tool));
    });
    document.getElementById('dcm-meas-clear')?.addEventListener('click', () => _dicomMeasClear());
    // Wheel over the frame slider steps frames instead of zooming the viewer
    dcmFramesWrap?.addEventListener('wheel', (e) => {
      if (!state.dicom || state.dicom.frames <= 1) return;
      e.preventDefault();
      e.stopPropagation();
      _dicomFrame(state.dicom.state.frame + (e.deltaY > 0 ? 1 : -1));
    }, { passive: false });
    dicomBar.addEventListener('mousedown', (e) => e.stopPropagation());
  }

  /* ════════════════════════════════════════════
     DICOM overlay layer
     Corner annotations, orientation markers, scale bar, measurements
     (ruler / angle / ellipse / rectangle ROI) and the pixel probe.
     Drawn in screen space on #dcm-overlay (covers the viewer) so text and
     line widths stay constant while the image zooms; redrawn on every
     transform change (_applyTransform) and DICOM re-render (_dicomApply).
  ════════════════════════════════════════════ */
  function _dicomMeasReset() {
    _dicomMeas = [];
    _dicomDraft = null;
    _dicomTool = null;
    _dicomProbePt = null;
    _dicomMeasHist.undo = [];
    _dicomMeasHist.redo = [];
    _dicomMeasHist.seq = 0;
    dcmOverlay?.classList.remove('is-tool');
  }

  /* ── Measurement history (add / delete / clear are undoable — Ctrl+Z / Ctrl+Y, toolbar, context menu) ── */
  function _dicomMeasSnapshot() {
    return _dicomMeas.map((m) => ({ ...m, pts: m.pts.map((pt) => ({ ...pt })) }));
  }
  function _dicomMeasCommit(next) {
    _dicomMeasHist.undo.push(_dicomMeasSnapshot());
    if (_dicomMeasHist.undo.length > 50) _dicomMeasHist.undo.shift();
    _dicomMeasHist.redo = [];
    _dicomMeasHist.seq = ++_actionSeq;
    _dicomMeas = next;
    _dicomSyncBar();
    _dicomOverlayRequest();
    _updateUndoRedoBtns();
  }
  function _dicomMeasCanUndo() { return !!(state.dicom && _dicomMeasHist.undo.length); }
  function _dicomMeasCanRedo() { return !!(state.dicom && _dicomMeasHist.redo.length); }
  function _dicomMeasUndo() {
    if (!_dicomMeasCanUndo()) return false;
    _dicomMeasHist.redo.push(_dicomMeasSnapshot());
    _dicomMeas = _dicomMeasHist.undo.pop();
    _dicomMeasHist.seq = ++_actionSeq;
    _dicomDraft = null;
    _dicomSyncBar();
    _dicomOverlayRequest();
    _updateUndoRedoBtns();
    return true;
  }
  function _dicomMeasRedo() {
    if (!_dicomMeasCanRedo()) return false;
    _dicomMeasHist.undo.push(_dicomMeasSnapshot());
    _dicomMeas = _dicomMeasHist.redo.pop();
    _dicomMeasHist.seq = ++_actionSeq;
    _dicomDraft = null;
    _dicomSyncBar();
    _dicomOverlayRequest();
    _updateUndoRedoBtns();
    return true;
  }
  function _dicomMeasAdd(m) { _dicomMeasCommit([..._dicomMeas, m]); }
  function _dicomMeasDelete(index) {
    if (index < 0 || index >= _dicomMeas.length) return;
    _dicomMeasCommit(_dicomMeas.filter((_, i) => i !== index));
  }
  function _dicomMeasDeleteLast() {
    if (_dicomDraft) { _dicomDraft = null; _dicomOverlayRequest(); return; }
    if (_dicomMeas.length) _dicomMeasDelete(_dicomMeas.length - 1);
  }

  /**
   * Cobb angle: the angle between two drawn lines (pts 0–1 and 2–3), in physical space,
   * folded to 0…90° the way it is read on a spine film. null until both lines exist.
   */
  function _dicomCobbDeg(pts) {
    if (!pts || pts.length < 4) return null;
    const sp = _dicomSpacing() || [1, 1];
    const ax = (pts[1].x - pts[0].x) * sp[1], ay = (pts[1].y - pts[0].y) * sp[0];
    const bx = (pts[3].x - pts[2].x) * sp[1], by = (pts[3].y - pts[2].y) * sp[0];
    const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
    if (!la || !lb) return null;
    return Math.acos(Math.min(1, Math.abs(ax * bx + ay * by) / (la * lb))) * 180 / Math.PI;
  }

  // Short description of a measurement for menus ("Ruler 32.0 mm", "Angle 43.4°" …)
  function _dicomMeasLabel(m) {
    const t = I18n.t.bind(I18n);
    const name = (t(`dicom.tool.${m.type}`) || m.type).replace(/\s*\(.*\)$/, '');
    if (m.type === 'ruler') return `${name} ${_dicomFmtLen(_dicomDist(m.pts[0], m.pts[1]))}`;
    if (m.type === 'angle') {
      const sp = _dicomSpacing() || [1, 1];
      const ax = (m.pts[0].x - m.pts[1].x) * sp[1], ay = (m.pts[0].y - m.pts[1].y) * sp[0];
      const bx = (m.pts[2].x - m.pts[1].x) * sp[1], by = (m.pts[2].y - m.pts[1].y) * sp[0];
      const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
      const deg = la && lb ? Math.acos(Math.max(-1, Math.min(1, (ax * bx + ay * by) / (la * lb)))) * 180 / Math.PI : 0;
      return `${name} ${deg.toFixed(1)}°`;
    }
    if (m.type === 'cobb') {
      const deg = _dicomCobbDeg(m.pts);
      return deg == null ? name : `${name} ${deg.toFixed(1)}°`;
    }
    const w = Math.abs(m.pts[1].x - m.pts[0].x), h = Math.abs(m.pts[1].y - m.pts[0].y);
    return `${name} ${_dicomFmtLen(_dicomDist({ x: 0, y: 0 }, { x: w, y: 0 }))} × ${_dicomFmtLen(_dicomDist({ x: 0, y: 0 }, { x: 0, y: h }))}`;
  }

  // Index of the measurement under a viewer point (within ~12 px of its outline, or inside an ROI), else -1
  function _dicomMeasHitTest(clientX, clientY) {
    const d = state.dicom;
    const map = _dicomMapping();
    if (!d || !map) return -1;
    const vr = viewerContainer.getBoundingClientRect();
    const px = clientX - vr.left, py = clientY - vr.top;
    const ip = map.toImage(px, py);
    const segDist = (a, b) => {
      const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy;
      const u = L2 ? Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / L2)) : 0;
      return Math.hypot(px - (a.x + u * dx), py - (a.y + u * dy));
    };
    let best = -1, bestD = 12;
    _dicomMeas.forEach((m, i) => {
      if (m.frame !== d.state.frame) return;
      const S = m.pts.map((pt) => map.toScreen(pt.x, pt.y));
      let dist = Infinity;
      if (m.type === 'ruler' || m.type === 'angle') {
        for (let k = 0; k + 1 < S.length; k++) dist = Math.min(dist, segDist(S[k], S[k + 1]));
      } else if (m.type === 'cobb') {
        // two separate lines — not the gap between them
        for (let k = 0; k + 1 < S.length; k += 2) dist = Math.min(dist, segDist(S[k], S[k + 1]));
      } else {
        const x0 = Math.min(m.pts[0].x, m.pts[1].x), y0 = Math.min(m.pts[0].y, m.pts[1].y);
        const w = Math.abs(m.pts[1].x - m.pts[0].x), h = Math.abs(m.pts[1].y - m.pts[0].y);
        let inside;
        if (m.type === 'ellipse') {
          const nx = (ip.x - (x0 + w / 2)) / (w / 2 || 1e-6), ny = (ip.y - (y0 + h / 2)) / (h / 2 || 1e-6);
          inside = nx * nx + ny * ny <= 1;
        } else {
          inside = ip.x >= x0 && ip.x <= x0 + w && ip.y >= y0 && ip.y <= y0 + h;
        }
        if (inside) dist = 0;
        else {
          const c = [[x0, y0], [x0 + w, y0], [x0 + w, y0 + h], [x0, y0 + h]].map(([x, y]) => map.toScreen(x, y));
          for (let k = 0; k < 4; k++) dist = Math.min(dist, segDist(c[k], c[(k + 1) % 4]));
        }
      }
      if (dist < bestD) { bestD = dist; best = i; }
    });
    return best;
  }

  // The overlay geometry is only meaningful while the Editor shows the DICOM frame unchanged
  // (rotation / flip are fine; a crop or resize is not) and the viewer is not in edit mode.
  function _dicomGeomValid() {
    const d = state.dicom;
    if (!d || !Editor.isLoaded() || state.editMode || state.isVideo || state.isAudio) return false;
    const rot = Editor.getRotation();
    const p = Editor.getPhotoDimensions();
    const swap = rot === 90 || rot === 270;
    return p.w === (swap ? d.height : d.width) && p.h === (swap ? d.width : d.height);
  }

  // Mapping between image pixels and overlay (viewer) pixels — follows zoom, pan, rotation, flip
  // and a border frame around the photo.
  function _dicomMapping() {
    const d = state.dicom;
    if (!d || !_dicomGeomValid()) return null;
    const r = displayCanvas.getBoundingClientRect();
    const vr = viewerContainer.getBoundingClientRect();
    if (!r.width || !displayCanvas.width) return null;
    const scale = r.width / displayCanvas.width;
    const photo = Editor.getPhotoDimensions();
    const padX = (displayCanvas.width - photo.w) / 2, padY = (displayCanvas.height - photo.h) / 2;
    const rot = Editor.getRotation() * Math.PI / 180;
    const { flipH, flipV } = Editor.getFlipState();
    const cos = Math.cos(rot), sin = Math.sin(rot);
    const ox = r.left - vr.left, oy = r.top - vr.top;
    const nW = d.width, nH = d.height;
    const toScreen = (sx, sy) => {
      let px = sx - nW / 2, py = sy - nH / 2;
      if (flipH) px = -px;
      if (flipV) py = -py;
      const cx = px * cos - py * sin + photo.w / 2;
      const cy = px * sin + py * cos + photo.h / 2;
      return { x: ox + (padX + cx) * scale, y: oy + (padY + cy) * scale };
    };
    const toImage = (X, Y) => {
      const cx = (X - ox) / scale - padX - photo.w / 2;
      const cy = (Y - oy) / scale - padY - photo.h / 2;
      let px = cx * cos + cy * sin;
      let py = -cx * sin + cy * cos;
      if (flipH) px = -px;
      if (flipV) py = -py;
      return { x: px + nW / 2, y: py + nH / 2 };
    };
    // A screen direction as an image-space direction (no translation)
    const dirToImage = (dx, dy) => {
      let px = dx * cos + dy * sin, py = -dx * sin + dy * cos;
      if (flipH) px = -px;
      if (flipV) py = -py;
      return { x: px, y: py };
    };
    return {
      scale, toScreen, toImage, dirToImage,
      imageRect: { x: ox + padX * scale, y: oy + padY * scale, w: photo.w * scale, h: photo.h * scale },
      view: { w: vr.width, h: vr.height },
    };
  }

  function _dicomSpacing() {
    const d = state.dicom;
    if (!d) return null;
    try { const fi = d.frameInfo ? d.frameInfo(d.state.frame) : null; if (fi && fi.pixelSpacing) return fi.pixelSpacing; } catch { /* ignore */ }
    return (d.geometry && d.geometry.pixelSpacing) || null;
  }

  // Distance between two image points: pixels, and millimetres when the file has a pixel spacing
  function _dicomDist(a, b) {
    const sp = _dicomSpacing();
    const dx = b.x - a.x, dy = b.y - a.y;
    return { px: Math.hypot(dx, dy), mm: sp ? Math.hypot(dx * sp[1], dy * sp[0]) : null };
  }

  function _dicomFmtLen(len) {
    if (len.mm != null) return `${len.mm >= 100 ? len.mm.toFixed(0) : len.mm >= 10 ? len.mm.toFixed(1) : len.mm.toFixed(2)} mm`;
    return `${len.px.toFixed(1)} px`;
  }

  function _dicomFmtVal(v) {
    if (!Number.isFinite(v)) return '';
    if (Math.abs(v) >= 100 || Number.isInteger(v)) return String(Math.round(v));
    return String(+v.toFixed(Math.abs(v) >= 10 ? 1 : 3));
  }

  function _dicomToggleAnnotations() {
    _dicomAnnotOn = !_dicomAnnotOn;
    localStorage.setItem('dicomAnnotations', _dicomAnnotOn ? '1' : '0');
    _dicomSyncBar();
    _dicomOverlayRequest();
  }

  function _dicomToggleRulerAxes() {
    _dicomRulerOn = !_dicomRulerOn;
    localStorage.setItem('dicomRulerAxes', _dicomRulerOn ? '1' : '0');
    _dicomSyncBar();
    _dicomOverlayRequest();
  }

  function _dicomToggleScaleBar() {
    _dicomScaleOn = !_dicomScaleOn;
    localStorage.setItem('dicomScaleBar', _dicomScaleOn ? '1' : '0');
    _dicomSyncBar();
    _dicomOverlayRequest();
  }

  function _dicomToggleGrid() {
    _dicomGridOn = !_dicomGridOn;
    localStorage.setItem('dicomGrid', _dicomGridOn ? '1' : '0');
    _dicomSyncBar();
    _dicomOverlayRequest();
  }

  function _dicomToggleCrosshair() {
    _dicomCrossOn = !_dicomCrossOn;
    localStorage.setItem('dicomCrosshair', _dicomCrossOn ? '1' : '0');
    _dicomSyncBar();
    _dicomOverlayRequest();
  }

  /** Zoom so a millimetre of the patient is a millimetre on the screen (needs a pixel spacing). */
  function _dicomPhysicalSize() {
    const sp = _dicomSpacing();
    if (!sp || !(sp[1] > 0)) { _updateStatus({ msg: I18n.t('dicom.noSpacingPhysical') }); return; }
    _setZoom(sp[1] / DCM_SCREEN_MM_PER_PX);
  }

  /** "1 px = 0.14 mm · on screen 1:2.3" — what one image pixel is, and the on-screen ratio. */
  function _dicomScaleText(map) {
    const sp = _dicomSpacing();
    if (!sp || !(sp[1] > 0) || !map) return '';
    const ratio = sp[1] / (map.scale * DCM_SCREEN_MM_PER_PX);
    const r = ratio >= 1
      ? `1:${+ratio.toFixed(ratio >= 10 ? 0 : 1)}`
      : `${+(1 / ratio).toFixed(1 / ratio >= 10 ? 0 : 1)}:1`;
    return `1 px = ${_dicomFmtVal(sp[1])} mm · ${I18n.t('dicom.screenRatio')} ${r}`;
  }

  /* ── Scale bar: parked wherever the user dropped it, remembered across sessions ── */

  function _loadDicomScalePos() {
    try {
      const v = JSON.parse(localStorage.getItem('dicomScalePos') || 'null');
      if (v && Number.isFinite(v.x) && Number.isFinite(v.y)) {
        return { x: Math.min(1, Math.max(0, v.x)), y: Math.min(1, Math.max(0, v.y)) };
      }
    } catch { /* fall back to the default corner */ }
    return null;   // never dragged → the default top-left corner
  }

  function _saveDicomScalePos() {
    try {
      if (_dicomScalePos) localStorage.setItem('dicomScalePos', JSON.stringify(_dicomScalePos));
      else localStorage.removeItem('dicomScalePos');
    } catch { /* ignore */ }
  }

  function _dicomResetScalePos() {
    _dicomScalePos = null;
    _saveDicomScalePos();
    _dicomOverlayRequest();
  }

  /** Physical units per screen pixel along each screen axis (null → plain pixels). */
  function _dicomScreenUnits(map) {
    const sp = _dicomSpacing();
    const ux = map.dirToImage(1, 0);
    const uy = map.dirToImage(0, 1);
    if (sp && sp[0] > 0 && sp[1] > 0) {
      return {
        mm: true,
        x: Math.hypot(ux.x * sp[1], ux.y * sp[0]) / map.scale,
        y: Math.hypot(uy.x * sp[1], uy.y * sp[0]) / map.scale,
      };
    }
    return { mm: false, x: Math.hypot(ux.x, ux.y) / map.scale, y: Math.hypot(uy.x, uy.y) / map.scale };
  }

  /** A round tick step whose on-screen size is at least `minPx`. */
  function _dicomTickStep(perPx, minPx) {
    const steps = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000];
    return steps.find((s) => s / perPx >= minPx) || steps[steps.length - 1];
  }

  function _dicomUnitLabel(v, mm) {
    if (!mm) return String(Math.round(v));
    if (v >= 10) return `${+(v / 10).toFixed(v % 10 ? 1 : 0)} cm`;
    return `${+v.toFixed(v < 1 ? 1 : 0)} mm`;
  }

  function _dicomSetTool(tool) {
    if (tool && !_dicomGeomValid()) tool = null;
    _dicomTool = tool;
    _dicomDraft = null;
    dcmOverlay?.classList.toggle('is-tool', !!tool);
    _dicomSyncBar();
    _dicomOverlayRequest();
    if (tool) _updateStatus({ msg: I18n.t(`dicom.toolHint.${tool}`) });
    else if (statusMsg && /Esc/.test(statusMsg.textContent || '')) statusMsg.textContent = '';
  }

  function _dicomMeasClear() {
    _dicomDraft = null;
    if (_dicomMeas.length) _dicomMeasCommit([]);
    else { _dicomSyncBar(); _dicomOverlayRequest(); }
  }

  function _dicomOverlayRequest() {
    if (_dicomOverlayRaf) return;
    _dicomOverlayRaf = requestAnimationFrame(() => { _dicomOverlayRaf = 0; _dicomOverlayDraw(); });
  }

  function _dicomOverlayDraw() {
    if (!dcmOverlay) return;
    const d = state.dicom;
    const map = _dicomMapping();
    const on = !!(d && map && _dicomHasBar()
      && (_dicomAnnotOn || _dicomRulerOn || _dicomScaleOn || _dicomGridOn || _dicomCrossOn
        || _dicomMeas.length || _dicomDraft || _dicomTool));
    dcmOverlay.classList.toggle('is-on', on);
    if (!on) return;
    const dpr = window.devicePixelRatio || 1;
    const W = viewerContainer.clientWidth, H = viewerContainer.clientHeight;
    const pw = Math.max(1, Math.round(W * dpr)), ph = Math.max(1, Math.round(H * dpr));
    if (dcmOverlay.width !== pw || dcmOverlay.height !== ph) { dcmOverlay.width = pw; dcmOverlay.height = ph; }
    const ctx = dcmOverlay.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.font = '12px system-ui, "Segoe UI", sans-serif';
    ctx.textBaseline = 'top';
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    // Keep clear of the DICOM bar at the bottom
    let bottom = H - 10;
    // (the DICOM toolbar is docked above the viewer now; this only matters if it sits inside)
    if (dicomBar && !dicomBar.hidden && viewerContainer.contains(dicomBar)) {
      const br = dicomBar.getBoundingClientRect(), vr = viewerContainer.getBoundingClientRect();
      if (br.height) bottom = Math.min(bottom, br.top - vr.top - 8);
    }
    if (_dicomGridOn) _dicomDrawGrid(ctx, d, map);
    if (_dicomCrossOn) _dicomDrawCrosshair(ctx, d, map, W, bottom);
    if (_dicomRulerOn) _dicomDrawRulerAxes(ctx, map, W, H, bottom);
    if (_dicomAnnotOn) _dicomDrawAnnotations(ctx, d, map, W, H, bottom);
    if (_dicomScaleOn) _dicomDrawScaleBar(ctx, map, W, bottom);
    else _dicomScaleBox = null;
    _dicomDrawMeasurements(ctx, d, map, W, bottom);
  }

  /* 5 × 5 grid over the image, drawn in image space so it turns and flips with it. */
  function _dicomDrawGrid(ctx, d, map) {
    const nW = d.width, nH = d.height;
    const seg = (x0, y0, x1, y1) => {
      const a = map.toScreen(x0, y0), b = map.toScreen(x1, y1);
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
    };
    ctx.save();
    for (const [width, colour] of [[3, 'rgba(0, 0, 0, 0.35)'], [1, 'rgba(255, 255, 255, 0.5)']]) {
      ctx.lineWidth = width;
      ctx.strokeStyle = colour;
      ctx.beginPath();
      for (let i = 1; i < 5; i++) {
        seg((nW * i) / 5, 0, (nW * i) / 5, nH);
        seg(0, (nH * i) / 5, nW, (nH * i) / 5);
      }
      seg(0, 0, nW, 0); seg(nW, 0, nW, nH); seg(nW, nH, 0, nH); seg(0, nH, 0, 0);
      ctx.stroke();
    }
    ctx.restore();
  }

  /* Crosshair through the pointer while it is over the image. */
  function _dicomDrawCrosshair(ctx, d, map, W, bottom) {
    const c = _dicomCursor;
    if (!c) return;
    const p = map.toImage(c.x, c.y);
    if (p.x < 0 || p.y < 0 || p.x > d.width || p.y > d.height) return;
    const top = _dicomRulerOn ? DCM_RULER_BAND : 0;
    const left = _dicomRulerOn ? DCM_RULER_BAND : 0;
    ctx.save();
    ctx.setLineDash([6, 4]);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255, 80, 80, 0.85)';
    ctx.beginPath();
    ctx.moveTo(left, Math.round(c.y) + 0.5); ctx.lineTo(W, Math.round(c.y) + 0.5);
    ctx.moveTo(Math.round(c.x) + 0.5, top); ctx.lineTo(Math.round(c.x) + 0.5, bottom);
    ctx.stroke();
    ctx.restore();
  }

  /* Graduated rulers down the whole X and Y axes, zeroed on the image origin. */
  const DCM_RULER_BAND = 22;

  function _dicomDrawRulerAxes(ctx, map, W, H, bottom) {
    const u = _dicomScreenUnits(map);
    if (!(u.x > 0) || !(u.y > 0)) return;
    const origin = map.toScreen(0, 0);
    const band = DCM_RULER_BAND;

    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.fillRect(0, 0, W, band);
    ctx.fillRect(0, band, band, bottom - band);
    // Where the image lies along each ruler
    const corners = [map.toScreen(0, 0), map.toScreen(state.dicom.width, 0),
      map.toScreen(0, state.dicom.height), map.toScreen(state.dicom.width, state.dicom.height)];
    const xs = corners.map((p) => p.x), ys = corners.map((p) => p.y);
    const ex0 = Math.max(band, Math.min(...xs)), ex1 = Math.min(W, Math.max(...xs));
    const ey0 = Math.max(band, Math.min(...ys)), ey1 = Math.min(bottom, Math.max(...ys));
    ctx.fillStyle = 'rgba(76, 141, 255, 0.30)';
    if (ex1 > ex0) ctx.fillRect(ex0, 0, ex1 - ex0, band);
    if (ey1 > ey0) ctx.fillRect(0, ey0, band, ey1 - ey0);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, band + 0.5); ctx.lineTo(W, band + 0.5);
    ctx.moveTo(band + 0.5, band); ctx.lineTo(band + 0.5, bottom);
    ctx.stroke();
    // The corner where the rulers meet names their unit
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(0, 0, band, band);
    ctx.font = 'bold 9px system-ui, "Segoe UI", sans-serif';
    ctx.fillStyle = '#ffe08a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(u.mm ? 'mm' : 'px', band / 2, band / 2 + 0.5);

    ctx.font = '10px system-ui, "Segoe UI", sans-serif';
    ctx.strokeStyle = '#d7e9ff';
    ctx.fillStyle = '#d7e9ff';
    ctx.lineWidth = 1;

    // X axis along the top edge
    const stepX = _dicomTickStep(u.x, 64);
    const pxX = stepX / u.x;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    for (let k = Math.ceil((0 - origin.x) / pxX) - 1; ; k++) {
      const x = origin.x + k * pxX;
      if (x > W + pxX) break;
      for (let s = 0; s < 5; s++) {
        const mx = x + (s * pxX) / 5;
        if (mx < 0 || mx > W) continue;
        const len = s === 0 ? 10 : 5;
        ctx.beginPath(); ctx.moveTo(Math.round(mx) + 0.5, band - len); ctx.lineTo(Math.round(mx) + 0.5, band); ctx.stroke();
      }
      if (x >= 0 && x <= W - 4) ctx.fillText(_dicomUnitLabel(k * stepX, u.mm), x + 3, 2);
    }

    // Y axis down the left edge
    const stepY = _dicomTickStep(u.y, 64);
    const pxY = stepY / u.y;
    for (let k = Math.ceil((band - origin.y) / pxY) - 1; ; k++) {
      const y = origin.y + k * pxY;
      if (y > bottom + pxY) break;
      for (let s = 0; s < 5; s++) {
        const my = y + (s * pxY) / 5;
        if (my < band || my > bottom) continue;
        const len = s === 0 ? 10 : 5;
        ctx.beginPath(); ctx.moveTo(band - len, Math.round(my) + 0.5); ctx.lineTo(band, Math.round(my) + 0.5); ctx.stroke();
      }
      if (y >= band && y <= bottom - 4) {
        ctx.save();
        ctx.translate(2, y + 3);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign = 'right';
        ctx.textBaseline = 'top';
        ctx.fillText(_dicomUnitLabel(k * stepY, u.mm), 0, 0);
        ctx.restore();
      }
    }
    // The pointer's place on both rulers
    const c = _dicomCursor;
    if (c && c.x >= band && c.x <= W && c.y >= band && c.y <= bottom) {
      ctx.strokeStyle = '#ff5050';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(Math.round(c.x) + 0.5, 0); ctx.lineTo(Math.round(c.x) + 0.5, band);
      ctx.moveTo(0, Math.round(c.y) + 0.5); ctx.lineTo(band, Math.round(c.y) + 0.5);
      ctx.stroke();
    }
    ctx.restore();
  }

  function _dcmText(ctx, text, x, y, align = 'left', color = '#fff') {
    if (!text) return;
    ctx.textAlign = align;
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }

  // A block of text lines on a translucent box (measurement labels); kept inside the view
  function _dcmLabel(ctx, lines, x, y, W, H) {
    lines = lines.filter(Boolean);
    if (!lines.length) return;
    const lh = 15, padX = 6, padY = 4;
    ctx.textAlign = 'left';
    const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + padX * 2;
    const h = lines.length * lh + padY * 2;
    x = Math.max(4, Math.min(W - w - 4, x));
    y = Math.max(4, Math.min(H - h - 4, y));
    ctx.fillStyle = 'rgba(0, 0, 0, 0.62)';
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x, y, w, h, 5) : ctx.rect(x, y, w, h);
    ctx.fill();
    ctx.fillStyle = '#ffe08a';
    lines.forEach((l, i) => ctx.fillText(l, x + padX, y + padY + i * lh));
  }

  function _dicomDrawAnnotations(ctx, d, map, W, H, bottom) {
    const m = d.meta || {};
    const st = d.state;
    const t = I18n.t.bind(I18n);
    let fi = null;
    try { fi = d.frameInfo ? d.frameInfo(st.frame) : null; } catch { fi = null; }
    const lh = 15, margin = 10;
    // The ruler bands own the top and left edges; text there starts inside them
    const inset = _dicomRulerOn ? DCM_RULER_BAND : 0;
    const inLeft = margin + inset, inTop = margin + inset;
    // Top-left: patient
    const tl = [
      m.patientName,
      m.patientId,
      [m.patientSex, m.patientAge || m.patientBirthDate].filter(Boolean).join(' · '),
    ].filter(Boolean);
    tl.forEach((s, i) => _dcmText(ctx, s, inLeft, inTop + i * lh));
    _dicomTlBottom = tl.length ? inTop + tl.length * lh : 0;
    // Top-right: study / series / equipment
    const tr = [
      m.institution,
      [m.studyDate, m.studyTime].filter(Boolean).join(' '),
      [d.modality, m.sopClass && m.sopClass !== d.modality ? m.sopClass : ''].filter(Boolean).join(' · '),
      m.studyDescription,
      m.seriesDescription,
      [m.seriesNumber ? `Se ${m.seriesNumber}` : '', m.instanceNumber ? `Im ${m.instanceNumber}` : ''].filter(Boolean).join(' · '),
    ].filter(Boolean);
    tr.forEach((s, i) => _dcmText(ctx, s, W - margin, inTop + i * lh, 'right'));
    // Bottom-left: image geometry
    const sp = _dicomSpacing();
    const bl = [
      `${d.width} × ${d.height}${d.frames > 1 ? `  ·  ${t('dicom.frame')} ${st.frame + 1} / ${d.frames}` : ''}`,
      [fi && Number.isFinite(fi.sliceLocation) ? `SL ${_dicomFmtVal(fi.sliceLocation)}` : '',
       fi && Number.isFinite(fi.sliceThickness) ? `Th ${_dicomFmtVal(fi.sliceThickness)} mm` : ''].filter(Boolean).join('  ·  '),
      sp ? `${_dicomFmtVal(sp[1])} × ${_dicomFmtVal(sp[0])} mm/px` : '',
      m.bitDepth || '',
    ].filter(Boolean);
    bl.forEach((s, i) => _dcmText(ctx, s, inLeft, bottom - bl.length * lh + i * lh));
    // Bottom-right: window / LUT / colour map / zoom
    const br = [];
    if (d.gray) {
      if (st.voiLut >= 0 && d.voiLuts && d.voiLuts[st.voiLut]) br.push(`LUT ${d.voiLuts[st.voiLut].label}`);
      else if (Number.isFinite(st.wc)) br.push(`C ${_dicomFmt(st.wc)} / W ${_dicomFmt(st.ww)}${st.voiFunction && st.voiFunction !== 'LINEAR' ? ` (${st.voiFunction})` : ''}`);
      if (st.colormap && st.colormap !== 'gray') { const key = `dicom.cm.${st.colormap}`; const l = t(key); br.push(l && l !== key ? l : st.colormap); }
      if (st.invert !== (d.defaultInvert ? d.defaultInvert() : d.photometric === 'MONOCHROME1')) br.push(t('dicom.invert').replace(/\s*\(.*\)$/, ''));
    }
    const scaleText = _dicomScaleText(map);
    if (scaleText) br.push(scaleText);
    br.push(`${Math.round(state.zoom * 100)}%`);
    br.forEach((s, i) => _dcmText(ctx, s, W - margin, bottom - br.length * lh + i * lh, 'right'));
    // Orientation markers at the middle of each edge
    if (d.dirLabel) {
      ctx.font = 'bold 15px system-ui, "Segoe UI", sans-serif';
      const mk = (dx, dy) => { const v = map.dirToImage(dx, dy); try { return d.dirLabel(v.x, v.y) || ''; } catch { return ''; } };
      const right = mk(1, 0), left = mk(-1, 0), down = mk(0, 1), up = mk(0, -1);
      const cy = (bottom + inTop) / 2;
      ctx.textBaseline = 'middle';
      _dcmText(ctx, left, inLeft + 4, cy, 'left', '#9be7ff');
      _dcmText(ctx, right, W - margin - 4, cy, 'right', '#9be7ff');
      ctx.textBaseline = 'top';
      _dcmText(ctx, up, W / 2, inTop, 'center', '#9be7ff');
      _dcmText(ctx, down, W / 2, bottom - 16, 'center', '#9be7ff');
      ctx.font = '12px system-ui, "Segoe UI", sans-serif';
    }
  }

  /**
   * Scale bar — horizontal, parked at the top-left until the user drags it
   * somewhere else; `_dicomScaleBox` is what the drag hit-tests against.
   */
  function _dicomDrawScaleBar(ctx, map, W, bottom) {
    _dicomScaleBox = null;
    const u = _dicomScreenUnits(map);
    if (!(u.x > 0)) return;
    const step = _dicomTickStep(u.x, 80);
    const len = step / u.x;
    const label = _dicomUnitLabel(step, u.mm);
    const h = 26;
    const topLimit = _dicomRulerOn ? DCM_RULER_BAND + 4 : 6;
    const leftLimit = _dicomRulerOn ? DCM_RULER_BAND + 4 : 6;
    if (len > W - leftLimit - 6) return;   // too wide to place anywhere sensible

    // No stored spot → park it in the top-left corner, a little clear of the edges —
    // and below the patient lines there, so it never sits on top of them.
    const tlClear = _dicomAnnotOn ? _dicomTlBottom : 0;
    let x = _dicomScalePos ? _dicomScalePos.x * W : leftLimit + DCM_SCALE_PAD;
    let y = _dicomScalePos ? _dicomScalePos.y * bottom : Math.max(topLimit + DCM_SCALE_PAD, tlClear + 8);
    x = Math.max(leftLimit, Math.min(W - len - 6, x));
    y = Math.max(topLimit, Math.min(bottom - h - 6, y));
    _dicomScaleBox = { x: x - 8, y: y - 6, w: len + 16, h: h + 10 };

    const yBar = y + h - 8;
    ctx.save();
    if (_dicomScaleDrag) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.10)';
      ctx.fillRect(_dicomScaleBox.x, _dicomScaleBox.y, _dicomScaleBox.w, _dicomScaleBox.h);
    }
    for (const [width, colour] of [[3.5, 'rgba(0, 0, 0, 0.8)'], [1.5, '#fff']]) {
      ctx.lineWidth = width;
      ctx.strokeStyle = colour;
      ctx.beginPath();
      ctx.moveTo(x, yBar); ctx.lineTo(x + len, yBar);
      ctx.moveTo(x, yBar - 6); ctx.lineTo(x, yBar + 6);
      ctx.moveTo(x + len, yBar - 6); ctx.lineTo(x + len, yBar + 6);
      ctx.moveTo(x + len / 2, yBar - 4); ctx.lineTo(x + len / 2, yBar + 4);
      ctx.stroke();
    }
    ctx.restore();
    ctx.textBaseline = 'top';
    _dcmText(ctx, label, x + len / 2, y - 2, 'center');
  }

  function _dicomScaleHitTest(clientX, clientY) {
    const b = _dicomScaleBox;
    if (!b || !_dicomScaleOn || !viewerContainer) return false;
    const r = viewerContainer.getBoundingClientRect();
    const x = clientX - r.left, y = clientY - r.top;
    return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
  }

  function _dicomDrawMeasurements(ctx, d, map, W, H) {
    const frame = d.state.frame;
    const items = _dicomMeas.filter((m) => m.frame === frame);
    if (_dicomDraft && _dicomDraft.frame === frame) items.push(_dicomDraft);
    const units = d.units || '';
    for (const m of items) {
      const draft = m === _dicomDraft;
      ctx.setLineDash(draft ? [6, 4] : []);
      ctx.lineWidth = 2;
      ctx.strokeStyle = draft ? '#ffd166' : '#ffb703';
      ctx.fillStyle = ctx.strokeStyle;
      const S = m.pts.map((p) => map.toScreen(p.x, p.y));
      if (m.type === 'ruler') {
        const [a, b] = S;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1;
        const nx = -dy / L * 6, ny = dx / L * 6;
        ctx.beginPath();
        ctx.moveTo(a.x - nx, a.y - ny); ctx.lineTo(a.x + nx, a.y + ny);
        ctx.moveTo(b.x - nx, b.y - ny); ctx.lineTo(b.x + nx, b.y + ny);
        ctx.stroke();
        _dcmLabel(ctx, [_dicomFmtLen(_dicomDist(m.pts[0], m.pts[1]))], (a.x + b.x) / 2 + 8, (a.y + b.y) / 2 + 8, W, H);
      } else if (m.type === 'angle') {
        if (S.length < 2) continue;
        const v = S[1];
        ctx.beginPath(); ctx.moveTo(S[0].x, S[0].y); ctx.lineTo(v.x, v.y);
        if (S[2]) ctx.lineTo(S[2].x, S[2].y);
        ctx.stroke();
        if (S[2]) {
          const sp = _dicomSpacing() || [1, 1];
          const ax = (m.pts[0].x - m.pts[1].x) * sp[1], ay = (m.pts[0].y - m.pts[1].y) * sp[0];
          const bx = (m.pts[2].x - m.pts[1].x) * sp[1], by = (m.pts[2].y - m.pts[1].y) * sp[0];
          const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
          if (la > 0 && lb > 0) {
            const deg = Math.acos(Math.max(-1, Math.min(1, (ax * bx + ay * by) / (la * lb)))) * 180 / Math.PI;
            const a0 = Math.atan2(S[0].y - v.y, S[0].x - v.x), a1 = Math.atan2(S[2].y - v.y, S[2].x - v.x);
            let sweep = a1 - a0;
            while (sweep > Math.PI) sweep -= 2 * Math.PI;
            while (sweep < -Math.PI) sweep += 2 * Math.PI;
            ctx.beginPath(); ctx.arc(v.x, v.y, 18, a0, a0 + sweep, sweep < 0); ctx.stroke();
            _dcmLabel(ctx, [`${deg.toFixed(1)}°`], v.x + 22, v.y + 6, W, H);
          }
        }
      } else if (m.type === 'cobb') {
        // Two lines, each with end ticks; the angle between them labelled at the second
        for (let k = 0; k + 1 < S.length; k += 2) {
          const a = S[k], b = S[k + 1];
          const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1;
          const nx = -dy / L * 5, ny = dx / L * 5;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
          ctx.moveTo(a.x - nx, a.y - ny); ctx.lineTo(a.x + nx, a.y + ny);
          ctx.moveTo(b.x - nx, b.y - ny); ctx.lineTo(b.x + nx, b.y + ny);
          ctx.stroke();
        }
        const deg = _dicomCobbDeg(m.pts);
        if (deg != null) {
          const a = S[2], b = S[3];
          _dcmLabel(ctx, [`${I18n.t('dicom.cobbShort')} ${deg.toFixed(1)}°`], Math.max(a.x, b.x) + 10, (a.y + b.y) / 2 - 10, W, H);
        }
      } else {
        const x0 = Math.min(m.pts[0].x, m.pts[1].x), y0 = Math.min(m.pts[0].y, m.pts[1].y);
        const w = Math.abs(m.pts[1].x - m.pts[0].x), h = Math.abs(m.pts[1].y - m.pts[0].y);
        ctx.beginPath();
        if (m.type === 'ellipse') {
          const cx = x0 + w / 2, cy = y0 + h / 2, N = 64;
          for (let i = 0; i <= N; i++) {
            const a = i / N * Math.PI * 2;
            const p = map.toScreen(cx + Math.cos(a) * w / 2, cy + Math.sin(a) * h / 2);
            if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
          }
        } else {
          const c = [[x0, y0], [x0 + w, y0], [x0 + w, y0 + h], [x0, y0 + h]].map(([x, y]) => map.toScreen(x, y));
          ctx.moveTo(c[0].x, c[0].y); c.slice(1).forEach((p) => ctx.lineTo(p.x, p.y)); ctx.closePath();
        }
        ctx.stroke();
        const lines = [];
        const sp = _dicomSpacing();
        if (d.gray && w >= 1 && h >= 1) {
          const s = d.stats ? d.stats({ x: x0, y: y0, w, h, shape: m.type }) : null;
          if (s && s.n) {
            lines.push(`${I18n.t('dicom.mean')} ${_dicomFmtVal(s.mean)} ± ${_dicomFmtVal(s.std)}${units ? ' ' + units : ''}`);
            lines.push(`${_dicomFmtVal(s.min)} … ${_dicomFmtVal(s.max)}  ·  n ${s.n}`);
          }
        }
        const areaPx = m.type === 'ellipse' ? Math.PI * (w / 2) * (h / 2) : w * h;
        lines.push(`${I18n.t('dicom.area')} ${sp ? `${_dicomFmtVal(areaPx * sp[0] * sp[1])} mm²` : `${Math.round(areaPx)} px²`}`
          + `  ·  ${_dicomFmtLen(_dicomDist({ x: 0, y: 0 }, { x: w, y: 0 }))} × ${_dicomFmtLen(_dicomDist({ x: 0, y: 0 }, { x: 0, y: h }))}`);
        const ys = [[x0, y0], [x0 + w, y0], [x0 + w, y0 + h], [x0, y0 + h]].map(([x, y]) => map.toScreen(x, y));
        const maxY = Math.max(...ys.map((p) => p.y)), minX = Math.min(...ys.map((p) => p.x));
        _dcmLabel(ctx, lines, minX, maxY + 6, W, H);
      }
    }
    ctx.setLineDash([]);
  }

  // One row per measurement on the current frame (× deletes it; the row itself deletes too)
  function _dicomMeasRows() {
    const d = state.dicom;
    if (!d) return [];
    const t = I18n.t.bind(I18n);
    const rows = [];
    _dicomMeas.forEach((m, i) => {
      if (m.frame !== d.state.frame) return;
      const icon = m.type === 'ruler' ? Icons.ruler : (m.type === 'angle' || m.type === 'cobb') ? Icons.angle : m.type === 'ellipse' ? Icons.ellipse : Icons.rectRoi;
      rows.push({
        icon, inline: true, label: `${rows.length + 1}. ${_dicomMeasLabel(m)}`, detail: '', title: t('dicom.deleteMeasurement'),
        action: () => _dicomMeasDelete(i),
        remove: { title: t('dicom.deleteMeasurement'), action: () => { _dicomMeasDelete(i); ContextMenu.refreshSubmenu(0); } },
      });
    });
    if (rows.length) rows.unshift({ separator: true });
    return rows;
  }

  function _dicomEventPoint(e, map) {
    const vr = viewerContainer.getBoundingClientRect();
    return map.toImage(e.clientX - vr.left, e.clientY - vr.top);
  }

  /* Pixel probe: coordinates + stored / rescaled value under the cursor in the status bar */
  function _dicomProbeRefresh() {
    const d = state.dicom;
    if (!d || !_dicomProbePt || !_dicomHasBar()) { _dicomProbeShow(null); return; }
    const x = Math.floor(_dicomProbePt.x), y = Math.floor(_dicomProbePt.y);
    if (x < 0 || y < 0 || x >= d.width || y >= d.height) { _dicomProbeShow(null); return; }
    let v = null;
    try { v = d.valueAt(x, y); } catch { v = null; }
    if (!v) { _dicomProbeShow(null); return; }
    let text;
    if (v.value !== undefined) {
      text = `${_dicomFmtVal(v.value)}${v.units ? ' ' + v.units : ''}`;
      if (v.raw !== v.value) text += ` (${_dicomFmtVal(v.raw)})`;
      if (v.padding) text += ' · pad';
      if (v.r !== undefined) text += ` · RGB ${v.r}, ${v.g}, ${v.b}`;
    } else {
      text = `RGB ${v.r}, ${v.g}, ${v.b}`;
    }
    _dicomProbeShow(`(${x}, ${y})  ${text}`);
  }

  function _dicomProbeShow(text) {
    if (!statusProbe) return;
    const on = !!text;
    statusProbe.hidden = !on;
    if (statusProbeSep) statusProbeSep.hidden = !on;
    statusProbe.textContent = on ? `${I18n.t('dicom.probe')} ${text}` : '';
  }

  /** Dragging the scale bar around the viewer; the spot is remembered on drop. */
  function _initDicomScaleDrag() {
    if (!viewerContainer) return;
    viewerContainer.addEventListener('mousedown', (e) => {
      if (e.button !== 0 || e.ctrlKey || e.metaKey || _dicomTool) return;
      if (!state.dicom || !_dicomHasBar()) return;
      if (!_dicomScaleHitTest(e.clientX, e.clientY)) return;
      e.preventDefault();
      e.stopPropagation();
      const r = viewerContainer.getBoundingClientRect();
      const box = _dicomScaleBox;   // where it is actually drawn (box.x = x - 8, box.y = y - 6)
      _dicomScaleDrag = {
        dx: (e.clientX - r.left) - (box.x + 8),
        dy: (e.clientY - r.top) - (box.y + 6),
      };
      _dicomOverlayRequest();
    }, true);

    window.addEventListener('mousemove', (e) => {
      if (!_dicomScaleDrag) return;
      const r = viewerContainer.getBoundingClientRect();
      if (!r.width || !r.height) return;
      _dicomScalePos = {
        x: Math.min(1, Math.max(0, ((e.clientX - r.left) - _dicomScaleDrag.dx) / r.width)),
        y: Math.min(1, Math.max(0, ((e.clientY - r.top) - _dicomScaleDrag.dy) / r.height)),
      };
      _dicomOverlayRequest();
    });

    window.addEventListener('mouseup', () => {
      if (!_dicomScaleDrag) return;
      _dicomScaleDrag = null;
      _saveDicomScalePos();
      _dicomOverlayRequest();
    });

    // Hovering it says "you can move this"
    viewerContainer.addEventListener('mousemove', (e) => {
      if (_dicomScaleDrag) return;
      const on = !_dicomTool && !!state.dicom && _dicomHasBar() && _dicomScaleHitTest(e.clientX, e.clientY);
      viewerContainer.classList.toggle('dcm-scale-grab', on);
    });
    viewerContainer.addEventListener('mouseleave', () => {
      viewerContainer.classList.remove('dcm-scale-grab');
    });
    // Double-click on the scale bar: back to its default corner
    viewerContainer.addEventListener('dblclick', (e) => {
      if (_dicomTool || !state.dicom || !_dicomHasBar() || !_dicomScaleHitTest(e.clientX, e.clientY)) return;
      e.preventDefault();
      e.stopPropagation();
      _dicomResetScalePos();
    }, true);

    // The pointer, for the ruler markers and the crosshair
    viewerContainer.addEventListener('mousemove', (e) => {
      if (!state.dicom || !(_dicomRulerOn || _dicomCrossOn)) { _dicomCursor = null; return; }
      const r = viewerContainer.getBoundingClientRect();
      _dicomCursor = { x: e.clientX - r.left, y: e.clientY - r.top };
      _dicomOverlayRequest();
    });
    viewerContainer.addEventListener('mouseleave', () => {
      if (!_dicomCursor) return;
      _dicomCursor = null;
      _dicomOverlayRequest();
    });
  }

  function _initDicomOverlay() {
    if (!dcmOverlay) return;
    _initDicomScaleDrag();
    // Measurement tools draw on the overlay while a tool is active (left button only —
    // Ctrl+drag / middle button keep their windowing / pan meaning)
    dcmOverlay.addEventListener('mousedown', (e) => {
      if (!_dicomTool || e.button !== 0 || e.ctrlKey || e.metaKey) return;
      const map = _dicomMapping();
      if (!map) return;
      e.preventDefault();
      e.stopPropagation();
      const p = _dicomEventPoint(e, map);
      const frame = state.dicom.state.frame;
      if (_dicomTool === 'angle') {
        if (!_dicomDraft) _dicomDraft = { type: 'angle', frame, pts: [p, p] };
        else if (_dicomDraft.pts.length === 2) _dicomDraft.pts = [_dicomDraft.pts[0], p, p];
        else { _dicomDraft.pts[2] = p; const done = _dicomDraft; _dicomDraft = null; _dicomMeasAdd(done); }
        _dicomOverlayRequest();
        return;
      }
      // Cobb: the first line is drawn, the second drag adds the other one
      if (_dicomTool === 'cobb' && _dicomDraft && _dicomDraft.type === 'cobb' && _dicomDraft.pts.length === 2) {
        _dicomDraft.pts.push(p, p);
        _dicomDraft.dragging = true;
        _dicomOverlayRequest();
        return;
      }
      _dicomDraft = { type: _dicomTool, frame, pts: [p, p], dragging: true };
      _dicomOverlayRequest();
    });
    window.addEventListener('mousemove', (e) => {
      if (!_dicomDraft) return;
      const map = _dicomMapping();
      if (!map) return;
      const p = _dicomEventPoint(e, map);
      if (_dicomDraft.type === 'angle') _dicomDraft.pts[_dicomDraft.pts.length - 1] = p;
      else if (_dicomDraft.dragging) _dicomDraft.pts[_dicomDraft.pts.length - 1] = p;
      _dicomOverlayRequest();
    });
    window.addEventListener('mouseup', (e) => {
      if (!_dicomDraft || !_dicomDraft.dragging) return;
      const map = _dicomMapping();
      const n = _dicomDraft.pts.length;
      if (map) _dicomDraft.pts[n - 1] = _dicomEventPoint(e, map);
      const a = map && map.toScreen(_dicomDraft.pts[n - 2].x, _dicomDraft.pts[n - 2].y);
      const b = map && map.toScreen(_dicomDraft.pts[n - 1].x, _dicomDraft.pts[n - 1].y);
      const long = !!(a && b && Math.hypot(b.x - a.x, b.y - a.y) >= 3);
      if (_dicomDraft.type === 'cobb' && n === 2) {
        // First Cobb line done: wait for the second one (a click without a drag starts over)
        if (long) _dicomDraft.dragging = false;
        else _dicomDraft = null;
        _dicomOverlayRequest();
        return;
      }
      const done = _dicomDraft;
      _dicomDraft = null;
      if (long) {
        delete done.dragging;
        _dicomMeasAdd(done);
      }
      _dicomSyncBar();
      _dicomOverlayRequest();
    });
    // Pixel probe (any DICOM, whatever the tool)
    viewerContainer.addEventListener('mousemove', (e) => {
      if (!state.dicom || !_dicomHasBar()) return;
      if (e.target.closest?.('#dicom-controls, #media-controls')) { _dicomProbePt = null; _dicomProbeShow(null); return; }
      const map = _dicomMapping();
      if (!map) { _dicomProbePt = null; _dicomProbeShow(null); return; }
      _dicomProbePt = _dicomEventPoint(e, map);
      _dicomProbeRefresh();
    });
    viewerContainer.addEventListener('mouseleave', () => { _dicomProbePt = null; _dicomProbeShow(null); });
    window.addEventListener('resize', () => _dicomOverlayRequest());
  }

  /* ── DICOM export: every frame as PNG, the tag listing as JSON / CSV / text ── */
  function _dicomStem() {
    const name = state.currentFile ? state.currentFile.split(/[/\\]/).pop() : 'dicom';
    return name.replace(/\.[^.]+$/, '') || 'dicom';
  }

  async function _dicomExportFrames() {
    const d = state.dicom;
    if (!d || d.frames <= 1) return;
    _dicomStopCine();
    // Name and type once (PNG / JPEG / WebP); every frame lands next to it as <name>_f01.<ext>
    let dir = null, ext = 'png', stem = _dicomStem();
    if (!_isWeb()) {
      const t = I18n.t.bind(I18n);
      const r = await window.FileDialog.save({
        defaultPath: `${stem}.png`,
        title: t('dicom.exportFrames').replace(/…$/, ''),
        saveTypes: [['png', t('fd.filterPng')], ['jpg', t('fd.filterJpeg')], ['webp', t('fd.filterWebp')]],
      });
      if (!r || r.canceled || !r.filePath) return;
      dir = await window.electronAPI.pathDirname(r.filePath);
      const base = r.filePath.split(/[/\\]/).pop();
      const e = (base.split('.').pop() || '').toLowerCase();
      ext = e === 'jpeg' ? 'jpg' : ['png', 'jpg', 'webp'].includes(e) ? e : 'png';
      stem = base.replace(/\.[^.]+$/, '') || stem;
    }
    const mime = ext === 'jpg' ? 'image/jpeg' : ext === 'webp' ? 'image/webp' : 'image/png';
    const pad = String(d.frames).length;
    const startFrame = d.state.frame;
    let written = 0;
    let failure = null;
    await _runOpWithProgress(async (dlg) => {
      dlg?.set(2, `0 / ${d.frames}`);
      for (let i = 0; i < d.frames; i++) {
        if (state.dicom !== d) break;
        const { canvas } = await d.toCanvas({ frame: i });
        const name = `${stem}_f${String(i + 1).padStart(pad, '0')}.${ext}`;
        const filePath = dir ? await window.electronAPI.pathJoin(dir, name) : name;
        const wr = await window.electronAPI.writeFile({ filePath, dataUrl: canvas.toDataURL(mime, 0.95) });
        if (!wr || !wr.success) { failure = (wr && wr.error) || name; break; }
        written++;
        dlg?.set(Math.round(2 + (i + 1) / d.frames * 95), `${i + 1} / ${d.frames}`);
      }
      // Back to the frame on screen (the Editor still shows it; only the session state moved)
      if (state.dicom === d) await d.render({ frame: startFrame });
    }, { messageKey: 'dicom.exportingFrames', force: true });
    if (failure) {
      await _showError(I18n.t('dialog.save.error') || 'Could not save the file.', failure);
      return;
    }
    try { await FileTree.refresh({ force: true }); } catch { /* ignore */ }
    _updateStatus({ msg: `${written} ${I18n.t('dicom.framesExported')}` });
    await window.electronAPI.showMessageBox({
      type: 'info',
      title: I18n.t('dicom.exportFrames').replace(/…$/, ''),
      message: `${written} ${I18n.t('dicom.framesExported')}`,
      detail: dir || '',
      buttons: ['OK'],
    });
  }

  /**
   * The cine as a WebM video: the frames of this file, or the slices of its series, at the
   * cine speed and with the window / colour on screen. Recorded in real time from a canvas
   * (captureStream + MediaRecorder), so a frame lasts exactly as long as it does on screen.
   */
  async function _dicomSaveVideo() {
    const d = state.dicom;
    if (!d || !_dicomHasBar()) return;
    const t = I18n.t.bind(I18n);
    const series = d.frames <= 1 && _dicomSeriesMode();
    if (d.frames <= 1 && !series) return;
    const mime = typeof MediaRecorder === 'undefined' ? null
      : ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m));
    if (!mime) { await _showError(t('dicom.videoUnsupported')); return; }
    _dicomStopCine();
    _dicomStopSeriesCine();
    const dlgSave = await window.FileDialog.save({
      defaultPath: `${_dicomStem()}${series ? '_series' : '_cine'}.webm`,
      title: t('dicom.saveVideo').replace(/…$/, ''),
      saveTypes: [['webm', t('fd.filterWebm')]],
    });
    if (!dlgSave || dlgSave.canceled || !dlgSave.filePath) return;

    const fps = series ? _dicomSeriesRate() : _dicomCineRate();
    const st = d.state;
    const look = d.gray ? { wc: st.wc, ww: st.ww, invert: st.invert, colormap: st.colormap } : {};
    const files = series ? _dicomSeriesFiles() : null;
    const count = series ? files.length : d.frames;
    const startFrame = st.frame;
    // A slice's canvas belongs to its decoder, and release() empties it: keep a copy
    const copyOf = (src) => {
      if (!src || !src.width || !src.height) return null;
      const c = document.createElement('canvas');
      c.width = src.width; c.height = src.height;
      c.getContext('2d').drawImage(src, 0, 0);
      return c;
    };
    const frameAt = async (i) => {
      if (!series) return (await d.toCanvas({ ...look, frame: i })).canvas;
      const r = await FormatSupport.loadImageFile(files[i]);
      if (!r || r.type === 'error') return null;
      try {
        if (r.dicom && r.dicom.gray && Number.isFinite(look.wc)) return copyOf((await r.dicom.toCanvas(look)).canvas);
        return copyOf(r.canvas);
      } finally {
        try { r.dicom?.release?.(); } catch { /* ignore */ }
      }
    };
    const wait = (ms) => new Promise((res) => setTimeout(res, ms));
    let failure = null;
    let blob = null;
    await _runOpWithProgress(async (dlg) => {
      dlg?.set(2, `0 / ${count}`);
      const first = await frameAt(0);
      if (!first) { failure = 'no frame'; return; }
      // Even dimensions (what the encoders want), at most 1024 px on the long side so a long
      // series fits in memory; every frame is fitted, letterboxed
      const k = Math.min(1, 1024 / Math.max(first.width, first.height));
      const even = (v) => Math.max(2, Math.round(v * k) - (Math.round(v * k) % 2));
      const W = even(first.width), H = even(first.height);
      const fit = (c) => {
        const out = document.createElement('canvas');
        out.width = W; out.height = H;
        const g = out.getContext('2d');
        g.fillStyle = '#000';
        g.fillRect(0, 0, W, H);
        const s = Math.min(W / c.width, H / c.height);
        const w = c.width * s, h = c.height * s;
        g.drawImage(c, (W - w) / 2, (H - h) / 2, w, h);
        return out;
      };
      // 1) Decode every frame first: recording runs on the clock, and a slow slice (a
      //    codec loading on first use) would otherwise freeze the video for seconds
      const frames = [fit(first)];
      for (let i = 1; i < count; i++) {
        const c = await frameAt(i);
        frames.push(c ? fit(c) : null);
        dlg?.set(Math.round(2 + (i + 1) / count * 48), `${i + 1} / ${count}`);
      }
      // 2) Record them at the cine speed
      const rec = document.createElement('canvas');
      rec.width = W; rec.height = H;
      const ctx = rec.getContext('2d');
      const draw = (c) => ctx.drawImage(c, 0, 0);
      draw(frames[0]);
      const stream = rec.captureStream(0);
      const track = stream.getVideoTracks()[0];
      const chunks = [];
      const mr = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 });
      mr.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
      const stopped = new Promise((res) => { mr.onstop = res; });
      mr.start();
      const start = performance.now();
      for (let i = 0; i < count; i++) {
        if (frames[i]) { draw(frames[i]); track.requestFrame?.(); }
        dlg?.set(Math.round(50 + (i + 1) / count * 47), `${i + 1} / ${count}`);
        // against the start, so small timer delays do not add up
        await wait(Math.max(0, start + ((i + 1) * 1000) / fps - performance.now()));
      }
      track.requestFrame?.();
      // Stop only once the encoder has caught up: frames wait in its queue, and a stop
      // before it has written them loses them all. Ask for what it has until the output
      // holds real frames and stops growing (or 8 s pass).
      const total = () => chunks.reduce((s, b) => s + b.size, 0);
      const deadline = performance.now() + 8000;
      let last = -1;
      while (performance.now() < deadline) {
        await wait(150);
        const got = new Promise((res) => mr.addEventListener('dataavailable', res, { once: true }));
        mr.requestData();
        await got;
        const size = total();
        if (size > 300 && size === last) break;
        last = size;
      }
      mr.stop();
      await stopped;
      track.stop();
      blob = new Blob(chunks, { type: 'video/webm' });
    }, { messageKey: 'dicom.savingVideo', force: true });
    // Back to the frame on screen (the session's state moved while frames were rendered)
    if (!series && state.dicom === d) { try { await d.render({ frame: startFrame }); } catch { /* ignore */ } }
    if (failure || !blob || !blob.size) {
      await _showError(t('dialog.save.error') || 'Could not save the file.', failure || 'empty video');
      return;
    }
    const dataUrl = await new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result);
      fr.onerror = () => rej(fr.error);
      fr.readAsDataURL(blob);
    });
    const wr = await window.electronAPI.writeFile({ filePath: dlgSave.filePath, dataUrl });
    if (wr && wr.success) {
      try { await FileTree.refresh({ force: true }); } catch { /* ignore */ }
      _updateStatus({ msg: `${t('dicom.videoSaved')}: ${dlgSave.filePath.split(/[/\\]/).pop()}` });
    } else {
      await _showError(t('dialog.save.error') || 'Could not save the file.', (wr && wr.error) || '');
    }
  }

  function _dicomTagsText(format) {
    const d = state.dicom;
    const tags = Array.isArray(state.dicomTags) ? state.dicomTags : (d && d.tags) || [];
    const name = state.currentFile ? state.currentFile.split(/[/\\]/).pop() : '';
    if (format === 'json') {
      return JSON.stringify({
        file: name,
        summary: d ? d.meta : (state.dicomMeta || {}),
        tags: tags.map((t) => ({ tag: t.tag, name: t.name, vr: t.vr, value: t.value, depth: t.depth || 0 })),
      }, null, 2);
    }
    if (format === 'csv') {
      const q = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
      return ['tag,name,vr,depth,value', ...tags.map((t) => [t.tag, t.name, t.vr, t.depth || 0, t.value].map(q).join(','))].join('\r\n');
    }
    return [name, '', ...tags.map((t) => `${'  '.repeat(t.depth || 0)}${t.tag ? `${t.tag} ` : ''}${t.name}${t.vr ? ` [${t.vr}]` : ''}${t.value ? ` = ${t.value}` : ''}`)].join('\n');
  }

  function _dicomTextDataUrl(text, mime) {
    const bytes = new TextEncoder().encode(text);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return `data:${mime};base64,${btoa(bin)}`;
  }

  async function _dicomExportTags() {
    if (!state.dicom && !Array.isArray(state.dicomTags)) return;
    const t = I18n.t.bind(I18n);
    const dlg = await window.FileDialog.save({
      defaultPath: `${_dicomStem()}_tags.json`,
      title: t('dicom.exportTags').replace(/…$/, ''),
      saveTypes: [['json', t('fd.filterJson')], ['csv', t('fd.filterCsv')], ['txt', t('fd.filterTxt')]],
    });
    if (!dlg || dlg.canceled || !dlg.filePath) return;
    const ext = (dlg.filePath.split('.').pop() || 'json').toLowerCase();
    const format = ext === 'csv' ? 'csv' : ext === 'txt' ? 'txt' : 'json';
    const mime = format === 'json' ? 'application/json' : format === 'csv' ? 'text/csv' : 'text/plain';
    const wr = await window.electronAPI.writeFile({ filePath: dlg.filePath, dataUrl: _dicomTextDataUrl(_dicomTagsText(format), mime) });
    if (wr && wr.success) {
      try { await FileTree.refresh({ force: true }); } catch { /* ignore */ }
      _updateStatus({ msg: t('dicom.tagsExported') });
    } else {
      await _showError(t('dialog.save.error') || 'Could not save the file.', (wr && wr.error) || '');
    }
  }

  async function _dicomCopyTags() {
    if (!state.dicom && !Array.isArray(state.dicomTags)) return;
    try {
      await navigator.clipboard.writeText(_dicomTagsText('txt'));
      _updateStatus({ msg: I18n.t('dicom.tagsCopied') });
    } catch (e) {
      _showError(I18n.t('dicom.copyTags'), e);
    }
  }

  function _dicomKeydown(e) {
    const d = state.dicom;
    if (!d || !_dicomHasBar() || state.editMode) return false;
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target?.isContentEditable) return false;
    if ((e.ctrlKey || e.metaKey) && (e.key === 'PageUp' || e.key === 'PageDown') && (d.frames > 1 || _dicomSeriesMode())) {
      _dicomStep(e.key === 'PageUp' ? -1 : 1);
      return true;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return false;
    // Measurement tool in progress: Esc leaves it (before the viewer's own Esc handling)
    if (e.key === 'Escape' && (_dicomTool || _dicomDraft)) { _dicomSetTool(null); return true; }
    if (d.frames > 1) {
      if (e.key === 'Home')     { _dicomFrame(0); return true; }
      if (e.key === 'End')      { _dicomFrame(d.frames - 1); return true; }
      if (e.key === ' ' || e.code === 'Space') { _dicomToggleCine(); return true; }
    } else if (_dicomSeriesMode()) {
      // A series plays like frames; ← → still step image by image as everywhere else
      if (e.key === ' ' || e.code === 'Space') { _dicomToggleSeriesCine(); return true; }
    }
    if (d.gray) {
      if (e.key === 'i' || e.key === 'I') { _dicomToggleInvert(); return true; }
      if (e.key === 'w' || e.key === 'W') { _dicomResetWindow(); return true; }
      if (e.key === 'm' || e.key === 'M') { _dicomCycleColormap(); return true; }
    }
    if (e.key === 'o' || e.key === 'O') { _dicomToggleAnnotations(); return true; }
    if (e.key === 'g' || e.key === 'G') { _dicomToggleRulerAxes(); return true; }
    if (e.key === 'b' || e.key === 'B') { _dicomToggleScaleBar(); return true; }
    if (e.key === 'd' || e.key === 'D') { _dicomToggleGrid(); return true; }
    if (e.key === 'x' || e.key === 'X') { _dicomToggleCrosshair(); return true; }
    if ((e.key === 'v' || e.key === 'V') && d.overlays && d.overlays.length) { _dicomToggleOverlays(); return true; }
    if (_dicomGeomValid()) {
      const tools = { r: 'ruler', a: 'angle', c: 'cobb', e: 'ellipse', t: 'rect' };
      const tool = tools[e.key.toLowerCase()];
      if (tool && e.key.length === 1) { _dicomSetTool(_dicomTool === tool ? null : tool); return true; }
      if ((e.key === 'Delete' || e.key === 'Backspace') && (_dicomMeas.length || _dicomDraft)) {
        _dicomMeasDeleteLast();
        return true;
      }
    }
    return false;
  }

  // Compact DICOM entries for the context / View menu: one row per feature group,
  // the long lists (presets, tools, frames …) live in flyouts.
  function _dicomContextItems() {
    const d = state.dicom;
    if (!d || !_dicomHasBar()) return [];
    const t = I18n.t.bind(I18n);
    const items = [];
    if (d.frames > 1) {
      items.push({ icon: Icons.mediaPlay, label: t('dicom.frames'), submenu: () => [
        { icon: Icons.prev, label: t('dicom.prevFrame'), shortcut: 'Ctrl+PgUp', disabled: d.state.frame <= 0, action: () => _dicomFrame(d.state.frame - 1) },
        { icon: Icons.next, label: t('dicom.nextFrame'), shortcut: 'Ctrl+PgDn', disabled: d.state.frame >= d.frames - 1, action: () => _dicomFrame(d.state.frame + 1) },
        { icon: Icons.first, label: t('dicom.firstFrame'), shortcut: 'Home', disabled: d.state.frame <= 0, action: () => _dicomFrame(0) },
        { icon: Icons.last, label: t('dicom.lastFrame'), shortcut: 'End', disabled: d.state.frame >= d.frames - 1, action: () => _dicomFrame(d.frames - 1) },
        { separator: true },
        { icon: _dicomCineTimer ? Icons.mediaPause : Icons.mediaPlay, label: t(_dicomCineTimer ? 'dicom.cineStop' : 'dicom.cine'), shortcut: 'Space', action: _dicomToggleCine },
      ] });
    } else if (_dicomSeriesMode()) {
      items.push({ icon: _dicomSeriesTimer ? Icons.mediaPause : Icons.mediaPlay, label: t(_dicomSeriesTimer ? 'dicom.seriesStop' : 'dicom.seriesPlay'),
        shortcut: 'Space', action: _dicomToggleSeriesCine });
    }
    if (d.gray) {
      items.push({ icon: Icons.sliders, label: t('dicom.window'), submenu: () => {
        const cur = _dicomPresetId();
        const sub = [
          { icon: Icons.effects, label: t('dicom.invert'), shortcut: 'I', checked: !!d.state.invert, action: _dicomToggleInvert },
          { icon: Icons.reset, label: t('dicom.resetWindow'), shortcut: 'W', action: _dicomResetWindow },
          { separator: true },
        ];
        _dicomFrameWindows(d).forEach((w, i) => {
          sub.push({ icon: Icons.fileInfo, label: `${t('dicom.preset.file')}${w.label ? ` — ${w.label}` : ''}  (C ${_dicomFmt(w.wc)} / W ${_dicomFmt(w.ww)})`, checked: cur === `file:${i}`, action: () => _dicomPresetApply(`file:${i}`) });
        });
        (d.voiLuts || []).forEach((l, i) => {
          sub.push({ icon: Icons.layers, label: `${t('dicom.preset.lut')} — ${l.label}`, checked: cur === `lut:${i}`, action: () => _dicomPresetApply(`lut:${i}`) });
        });
        sub.push({ icon: Icons.magicWand, label: t('dicom.preset.auto'), checked: cur === 'auto', action: () => _dicomPresetApply('auto') });
        (d.presets || []).forEach((p) => {
          sub.push({ icon: Icons.sliders, label: `${t(`dicom.preset.${p.id}`)}  (C ${p.wc} / W ${p.ww})`, checked: cur === p.id, action: () => _dicomPresetApply(p.id) });
        });
        return sub;
      } });
      items.push({ icon: Icons.palette, label: t('dicom.colormap'), shortcut: 'M', submenu: () => (d.colormaps || ['gray']).map((id) => {
        const key = `dicom.cm.${id}`;
        const label = t(key);
        return { icon: Icons.palette, label: label && label !== key ? label : id, checked: (d.state.colormap || 'gray') === id, action: () => _dicomSetColormap(id) };
      }) });
    }
    items.push({ icon: Icons.annotations, label: t('dicom.annotations'), shortcut: 'O', checked: _dicomAnnotOn, action: _dicomToggleAnnotations });
    items.push({ icon: Icons.ruler, label: t('dicom.rulerAxes'), shortcut: 'G', checked: _dicomRulerOn, action: _dicomToggleRulerAxes });
    items.push({ icon: Icons.resize, label: t('dicom.scaleBar'), shortcut: 'B', checked: _dicomScaleOn, action: _dicomToggleScaleBar });
    items.push({ icon: Icons.reset, label: t('dicom.scaleReset'), action: _dicomResetScalePos });
    items.push({ icon: Icons.guideGrid, label: t('dicom.grid'), shortcut: 'D', checked: _dicomGridOn, action: _dicomToggleGrid });
    items.push({ icon: Icons.pointer, label: t('dicom.crosshair'), shortcut: 'X', checked: _dicomCrossOn, action: _dicomToggleCrosshair });
    items.push({ icon: Icons.actualSize, label: t('dicom.physicalSize'),
      disabled: !(_dicomSpacing()?.[1] > 0) || !_dicomGeomValid(), action: _dicomPhysicalSize });
    if (d.overlays && d.overlays.length) {
      items.push({ icon: Icons.layers, label: t('dicom.overlays'), shortcut: 'V', checked: !!d.state.overlays, action: _dicomToggleOverlays });
    }
    if (_dicomGeomValid()) {
      items.push({ icon: Icons.ruler, label: t('dicom.tools'), submenu: () => [
        { icon: Icons.pointer, label: t('dicom.tool.off'),     shortcut: 'Esc', checked: !_dicomTool,            action: () => _dicomSetTool(null) },
        { icon: Icons.ruler,   label: t('dicom.tool.ruler'),   shortcut: 'R',   checked: _dicomTool === 'ruler',   action: () => _dicomSetTool('ruler') },
        { icon: Icons.angle,   label: t('dicom.tool.angle'),   shortcut: 'A',   checked: _dicomTool === 'angle',   action: () => _dicomSetTool('angle') },
        { icon: Icons.angle,   label: t('dicom.tool.cobb'),    shortcut: 'C',   checked: _dicomTool === 'cobb',    action: () => _dicomSetTool('cobb') },
        { icon: Icons.ellipse, label: t('dicom.tool.ellipse'), shortcut: 'E',   checked: _dicomTool === 'ellipse', action: () => _dicomSetTool('ellipse') },
        { icon: Icons.rectRoi, label: t('dicom.tool.rect'),    shortcut: 'T',   checked: _dicomTool === 'rect',    action: () => _dicomSetTool('rect') },
        { separator: true },
        { icon: Icons.undo,    label: t('dicom.undoMeasurement'), shortcut: 'Ctrl+Z', disabled: !_dicomMeasCanUndo(), action: () => _dicomMeasUndo() },
        { icon: Icons.redo,    label: t('dicom.redoMeasurement'), shortcut: 'Ctrl+Y', disabled: !_dicomMeasCanRedo(), action: () => _dicomMeasRedo() },
        { icon: Icons.delete,  label: t('dicom.removeLastMeasurement'), shortcut: 'Del', disabled: !_dicomMeas.length, action: () => _dicomMeasDeleteLast() },
        { icon: Icons.delete,  label: t('dicom.clearMeasurements'), danger: true, disabled: !_dicomMeas.length, action: () => _dicomMeasClear() },
        ..._dicomMeasRows(),
      ] });
    }
    items.push({ icon: Icons.export, label: t('dicom.export'), submenu: () => [
      d.frames > 1 && { icon: Icons.fmtPng, label: t('dicom.exportFrames'), action: () => _dicomExportFrames() },
      (d.frames > 1 || _dicomSeriesMode()) && { icon: Icons.fmtVideo, label: t('dicom.saveVideo'), action: () => _dicomSaveVideo() },
      { icon: Icons.saveAs, label: t('dicom.exportTags'), action: () => _dicomExportTags() },
      { icon: Icons.copy,   label: t('dicom.copyTags'),   action: () => _dicomCopyTags() },
    ].filter(Boolean) });
    items.push({ separator: true });
    return items;
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

  /** The element the transport bar drives (loaded media, shown or not). */
  function _mediaEl() {
    if (state.isVideo && videoEl) return videoEl;
    if (state.isAudio && audioEl) return audioEl;
    return null;
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
    // Video, audio and animated images get the bar. Only the full contact sheet hides it —
    // the bottom filmstrip sits below the viewer, not over it.
    const sheetUp = !!window.Browse?.isVisible?.() && !window.Browse?.isFilmstrip?.();
    const show = !state.editMode && (state.isVideo || state.isAudio || state.isAnimated) && !sheetUp;
    mediaControls.hidden = !show;
    mediaControls.style.display = show ? 'flex' : 'none';
    mediaControls.classList.toggle('is-on', show);
    mediaControls.classList.toggle('is-animated', !!state.isAnimated && !state.isVideo);
    mediaControls.classList.toggle('is-audio', !!state.isAudio && !state.isVideo);
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

    if (_mediaEl()) {
      _applyMediaVolume();
      _syncMediaSeekUi();
      _syncMediaVolumeUi();
      if (state.isVideo) _syncSubtitleControls();
    }
  }

  function _applyMediaVolume() {
    for (const el of [videoEl, audioEl]) {
      if (!el) continue;
      el.volume = _mediaVolume;
      el.muted = _mediaMuted || _mediaVolume <= 0;
    }
  }

  function _persistMediaVolume() {
    try {
      localStorage.setItem(MEDIA_VOL_KEY, String(_mediaVolume));
      localStorage.setItem(MEDIA_MUTE_KEY, _mediaMuted ? '1' : '0');
    } catch {}
  }

  function _syncMediaVolumeUi() {
    const pct = Math.round(_mediaVolume * 100);
    if (mcVolume) mcVolume.value = String(pct);
    if (mcVolLabel) mcVolLabel.textContent = `${pct}%`;
    const muted = _mediaMuted || _mediaVolume <= 0;
    mcMuteBtn?.classList.toggle('is-muted', muted);
    mcMuteBtn?.setAttribute('aria-pressed', muted ? 'true' : 'false');
    if (mcMuteBtn) {
      mcMuteBtn.title = I18n.t(muted ? 'toolbar.unmute' : 'toolbar.mute');
      mcMuteBtn.setAttribute('data-i18n-title', muted ? 'toolbar.unmute' : 'toolbar.mute');
    }
    if (mcVolume) mcVolume.title = I18n.t('toolbar.volume');
  }

  function _setMediaVolume(pct) {
    const n = Math.min(100, Math.max(0, Math.round(Number(pct) || 0)));
    _mediaVolume = n / 100;
    // Moving slider away from 0 unmutes; 0 mutes
    _mediaMuted = _mediaVolume <= 0;
    _applyMediaVolume();
    _persistMediaVolume();
    _syncMediaVolumeUi();
  }

  function _toggleMediaMute() {
    if (_mediaMuted || _mediaVolume <= 0) {
      _mediaMuted = false;
      if (_mediaVolume <= 0) _mediaVolume = 1;
    } else {
      _mediaMuted = true;
    }
    _applyMediaVolume();
    _persistMediaVolume();
    _syncMediaVolumeUi();
  }

  function _syncMediaSeekUi() {
    const el = _mediaEl();
    if (!mcSeek || !el) return;
    const dur = el.duration;
    const cur = el.currentTime || 0;
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
    const el = _mediaEl();
    if (!el) return;
    if (el.ended) {
      try { el.currentTime = 0; } catch {}
    }
    const p = el.play();
    if (p && typeof p.catch === 'function') p.catch(() => {});
    // Cue comes from the 'play' event so we don't double-flash
    _syncMediaTransportButtons();
  }

  function _pauseMedia() {
    if (state.isAnimated) {
      _pauseAnimated();
      return;
    }
    const el = _mediaEl();
    if (!el || el.paused) return;
    _mediaCueFromUser = 'pause';
    el.pause();
    // Keep pause cue visible until play / stop
    _showMediaCue('pause', true);
    _syncMediaTransportButtons();
  }

  function _stopMedia() {
    if (state.isAnimated) {
      _stopAnimated();
      return;
    }
    const el = _mediaEl();
    if (!el) return;
    _mediaCueFromUser = 'stop';
    el.pause();
    try { el.currentTime = 0; } catch {}
    // Brief stop flash, then clear
    _showMediaCue('stop', false);
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
    _showMediaCue('play', false);
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
      _showMediaCue('pause', true);
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
        _showMediaCue('stop', false);
        _syncMediaTransportButtons();
      });
    };
    _hideAnimatedFreeze();
    animImg.style.display = 'block';
    animImg.addEventListener('load', onReady);
    animImg.src = '';
    animImg.src = src;
  }

  function _clearSubtitleTracks() {
    state.subtitles.forEach((sub) => {
      if (sub.url) {
        try { URL.revokeObjectURL(sub.url); } catch {}
      }
    });
    state.subtitles = [];
    if (videoEl) {
      videoEl.querySelectorAll('track[data-app-subtitle="1"]').forEach((track) => track.remove());
    }
    _syncSubtitleControls();
  }

  function _stripExt(filePath) {
    return String(filePath || '').replace(/\.[^./\\]+$/, '');
  }

  function _extOf(filePath) {
    const m = String(filePath || '').match(/\.([^./\\]+)$/);
    return m ? m[1].toLowerCase() : '';
  }

  function _subtitleLangFromName(filePath, videoPath, fallback = '') {
    const subBase = _stripExt(String(filePath || '').split(/[/\\]/).pop() || '');
    const vidBase = _stripExt(String(videoPath || '').split(/[/\\]/).pop() || '');
    const suffix = subBase.toLowerCase().startsWith(`${vidBase.toLowerCase()}.`)
      ? subBase.slice(vidBase.length + 1)
      : '';
    const token = (suffix || fallback || '').split(/[._-]/).filter(Boolean).pop() || '';
    return token ? token.toLowerCase() : 'und';
  }

  function _subtitleLabel(filePath, lang, fallback = '') {
    const name = String(filePath || '').split(/[/\\]/).pop() || 'Subtitle';
    const language = lang && lang !== 'und' ? lang.toUpperCase() : (fallback || I18n.t('toolbar.subtitles'));
    return `${language} - ${name}`;
  }

  function _htmlToSubtitleText(html) {
    const div = document.createElement('div');
    div.innerHTML = String(html || '')
      .replace(/<br\s*\/?\s*>/gi, '\n')
      .replace(/&nbsp;/gi, ' ');
    return (div.textContent || '').replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();
  }

  function _vttTime(ms) {
    const n = Math.max(0, Math.round(Number(ms) || 0));
    const h = Math.floor(n / 3600000);
    const m = Math.floor((n % 3600000) / 60000);
    const s = Math.floor((n % 60000) / 1000);
    const z = n % 1000;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(z).padStart(3, '0')}`;
  }

  function _srtToVtt(text) {
    let body = String(text || '').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    body = body.replace(/(\d{1,2}:\d{2}:\d{2}),([0-9]{1,3})/g, (_m, t, ms) => `${t}.${ms.padEnd(3, '0')}`);
    body = body.replace(/\{\\[^}]+\}/g, '').replace(/<\/?font[^>]*>/gi, '');
    return `WEBVTT\n\n${body.trim()}\n`;
  }

  function _smiToTracks(text, filePath, videoPath) {
    const source = String(text || '').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const syncRe = /<sync\s+start\s*=\s*["']?(\d+)["']?[^>]*>([\s\S]*?)(?=<sync\s+start\s*=|<\/body>|<\/sami>|$)/gi;
    const rows = [];
    let match;
    while ((match = syncRe.exec(source))) {
      const start = Number(match[1]);
      if (!Number.isFinite(start)) continue;
      const chunk = match[2] || '';
      const pRe = /<p\b([^>]*)>([\s\S]*?)(?=<p\b|$)/gi;
      let pMatch;
      while ((pMatch = pRe.exec(chunk))) {
        const attrs = pMatch[1] || '';
        const classMatch = attrs.match(/class\s*=\s*["']?([^\s"'>]+)/i);
        const klass = (classMatch ? classMatch[1] : 'default').toLowerCase();
        const textValue = _htmlToSubtitleText(pMatch[2]);
        if (!textValue || textValue === '&nbsp;') continue;
        rows.push({ start, klass, text: textValue });
      }
    }
    const byClass = new Map();
    rows.forEach((row) => {
      if (!byClass.has(row.klass)) byClass.set(row.klass, []);
      byClass.get(row.klass).push(row);
    });
    return Array.from(byClass.entries()).map(([klass, items]) => {
      items.sort((a, b) => a.start - b.start);
      const cues = items.map((item, idx) => {
        const next = items[idx + 1];
        const end = next ? Math.max(item.start + 1, next.start - 1) : item.start + 4000;
        return `${_vttTime(item.start)} --> ${_vttTime(end)}\n${item.text}`;
      }).join('\n\n');
      const lang = _subtitleLangFromName(filePath, videoPath, klass.replace(/cc$/i, ''));
      return {
        lang,
        label: _subtitleLabel(filePath, lang, klass.toUpperCase()),
        vtt: `WEBVTT\n\n${cues}\n`,
      };
    });
  }

  async function _readSubtitleText(filePath) {
    const dataUrl = await window.electronAPI.readFileBase64(filePath);
    if (!dataUrl || dataUrl.error || typeof dataUrl !== 'string') return '';
    const raw = dataUrl.includes(',') ? dataUrl.split(',')[1] : '';
    if (!raw) return '';
    const bin = atob(raw);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
    catch {}
    try { return new TextDecoder('euc-kr', { fatal: false }).decode(bytes); }
    catch { return new TextDecoder('utf-8', { fatal: false }).decode(bytes); }
  }

  async function _subtitleFileToTracks(filePath, videoPath) {
    const text = await _readSubtitleText(filePath);
    if (!text) return [];
    const ext = _extOf(filePath);
    if (ext === 'smi') return _smiToTracks(text, filePath, videoPath);
    if (ext === 'srt') {
      const lang = _subtitleLangFromName(filePath, videoPath);
      return [{ lang, label: _subtitleLabel(filePath, lang), vtt: _srtToVtt(text) }];
    }
    return [];
  }

  async function _findAutoSubtitleFiles(videoPath) {
    const dir = await window.electronAPI.pathDirname(videoPath);
    const videoName = await window.electronAPI.pathBasename(videoPath);
    const stem = _stripExt(videoName);
    const entries = await window.electronAPI.readDirectory(dir);
    if (!Array.isArray(entries)) return [];
    const stemLower = stem.toLowerCase();
    return entries
      .filter((entry) => !entry.isDirectory)
      .filter((entry) => {
        const name = String(entry.name || '').toLowerCase();
        const ext = _extOf(name);
        if (ext !== 'srt' && ext !== 'smi') return false;
        const base = _stripExt(name);
        return base === stemLower || base.startsWith(`${stemLower}.`);
      })
      .map((entry) => entry.path);
  }

  async function _loadSubtitleFiles(paths, videoPath, { replace = true } = {}) {
    const token = ++_subtitleLoadToken;
    if (replace) _clearSubtitleTracks();
    const loaded = [];
    for (const filePath of paths) {
      try {
        const tracks = await _subtitleFileToTracks(filePath, videoPath);
        tracks.forEach((track) => loaded.push({ ...track, filePath }));
      } catch (e) {
        console.warn('Subtitle load failed:', filePath, e);
      }
    }
    if (token !== _subtitleLoadToken || !videoEl) return [];
    loaded.forEach((sub, index) => {
      const blob = new Blob([sub.vtt], { type: 'text/vtt' });
      const track = document.createElement('track');
      sub.id = `${Date.now()}-${index}-${Math.random().toString(36).slice(2)}`;
      sub.url = URL.createObjectURL(blob);
      track.kind = 'subtitles';
      track.label = sub.label;
      track.srclang = sub.lang || 'und';
      track.src = sub.url;
      track.dataset.appSubtitle = '1';
      track.dataset.subtitleId = sub.id;
      track.addEventListener('load', () => _applySubtitleTrackMode());
      videoEl.appendChild(track);
      state.subtitles.push(sub);
    });
    _selectInitialSubtitle();
    _syncSubtitleControls();
    return loaded;
  }

  async function _loadAutoSubtitles(videoPath) {
    try {
      const files = await _findAutoSubtitleFiles(videoPath);
      await _loadSubtitleFiles(files, videoPath, { replace: true });
    } catch (e) {
      console.warn('Auto subtitle search failed:', e);
      _clearSubtitleTracks();
    }
  }

  function _selectInitialSubtitle() {
    if (!state.subtitles.length) return;
    if (state.subtitleLang && state.subtitles.some((sub) => sub.lang === state.subtitleLang)) return;
    state.subtitleLang = state.subtitles[0].lang || 'und';
    try { localStorage.setItem('subtitleLanguage', state.subtitleLang); } catch {}
  }

  function _syncSubtitleControls() {
    const show = state.isVideo && videoEl && videoEl.style.display !== 'none';
    const hasTracks = show && state.subtitles.length > 0;
    if (mcSubtitleWrap) {
      mcSubtitleWrap.hidden = !show;
      mcSubtitleWrap.style.display = show ? 'flex' : 'none';
    }
    if (mcSubtitleBtn) {
      mcSubtitleBtn.disabled = !hasTracks;
      mcSubtitleBtn.classList.toggle('is-active', hasTracks && state.subtitlesEnabled);
      mcSubtitleBtn.setAttribute('aria-pressed', hasTracks && state.subtitlesEnabled ? 'true' : 'false');
      mcSubtitleBtn.title = I18n.t(state.subtitlesEnabled ? 'toolbar.subtitlesOff' : 'toolbar.subtitlesOn');
    }
    if (mcSubtitleFileBtn) mcSubtitleFileBtn.disabled = !show;
    if (mcSubtitleLang) {
      const prev = mcSubtitleLang.value;
      mcSubtitleLang.innerHTML = '';
      state.subtitles.forEach((sub) => {
        const opt = document.createElement('option');
        opt.value = sub.lang || 'und';
        opt.textContent = sub.label;
        mcSubtitleLang.appendChild(opt);
      });
      mcSubtitleLang.value = state.subtitles.some((sub) => sub.lang === state.subtitleLang) ? state.subtitleLang : prev;
      mcSubtitleLang.disabled = !hasTracks || !state.subtitlesEnabled;
      mcSubtitleLang.style.display = hasTracks ? 'block' : 'none';
    }
    _applySubtitleTrackMode();
  }

  function _applySubtitleTrackMode() {
    if (!videoEl) return;
    const wanted = state.subtitlesEnabled ? state.subtitleLang : '';
    Array.from(videoEl.textTracks || []).forEach((track) => {
      const el = Array.from(videoEl.querySelectorAll('track[data-app-subtitle="1"]')).find((node) => node.track === track);
      track.mode = el && wanted && el.srclang === wanted ? 'showing' : 'disabled';
    });
  }

  function _toggleSubtitles() {
    if (!state.subtitles.length) return;
    state.subtitlesEnabled = !state.subtitlesEnabled;
    try { localStorage.setItem('subtitlesEnabled', state.subtitlesEnabled ? '1' : '0'); } catch {}
    _syncSubtitleControls();
  }

  function _setSubtitleLanguage(lang) {
    if (!lang || !state.subtitles.some((sub) => sub.lang === lang)) return;
    state.subtitleLang = lang;
    state.subtitlesEnabled = true;
    try {
      localStorage.setItem('subtitleLanguage', lang);
      localStorage.setItem('subtitlesEnabled', '1');
    } catch {}
    _syncSubtitleControls();
  }

  async function _chooseSubtitleFile() {
    if (!state.isVideo || !state.currentFile || !window.electronAPI.openSubtitleDialog) return;
    const wasPlaying = _isMediaPlaying();
    if (wasPlaying && videoEl) videoEl.pause();
    const result = await window.electronAPI.openSubtitleDialog(state.currentFile);
    if (result && !result.canceled && result.filePath) {
      await _loadSubtitleFiles([result.filePath], state.currentFile, { replace: true });
      state.subtitlesEnabled = state.subtitles.length > 0;
      try { localStorage.setItem('subtitlesEnabled', state.subtitlesEnabled ? '1' : '0'); } catch {}
      _syncSubtitleControls();
    }
    if (wasPlaying && videoEl) {
      const p = videoEl.play();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    }
  }

  /* ── Media the webview cannot decode is converted by the host (ffmpeg) and the copy is
     played. Known containers go straight to conversion; anything else converts only when
     the webview reports it cannot play it (or shows no picture). Function-local data on
     purpose: a launch file can be opened before the code further down has run (TDZ). ── */
  function _needsTranscode(filePath) {
    return /\.(avi|wmv|asf|flv|f4v|mpe?g|m2v|ts|mts|m2ts|vob|rm|rmvb|3gp|3g2|ogv|divx|xvid|wma|aiff?|aifc|ac3|amr|ape|wv|dts)$/i.test(String(filePath || ''));
  }

  async function _convertForPlayback(filePath, kind) {
    if (typeof window.electronAPI.transcodeMedia !== 'function') return null;
    const name = String(filePath).split(/[/\\]/).pop();
    _updateStatus({ msg: I18n.t('progress.converting') || 'Converting for playback…' });
    const r = await window.electronAPI.transcodeMedia(filePath, kind).catch((err) => ({ error: err.message }));
    if (r && r.url) {
      _updateStatus({ msg: I18n.t('progress.done') || 'Loading Done.' });
      return r.url;
    }
    if (state.currentFile === filePath) {
      _showError(`${I18n.t('error.openFile') || 'Failed to open file'}: ${name}`, r?.error || 'convert failed');
    }
    return null;
  }

  /** URL to give the <video> / <audio> element for `filePath`. */
  async function _mediaSourceUrl(filePath, kind, el) {
    if (_needsTranscode(filePath)) {
      if (el) el.dataset.convertedFor = filePath;   // no second conversion from the error fallback
      const conv = await _convertForPlayback(filePath, kind);
      if (conv) return conv;
    }
    return window.electronAPI.getFileUrl(filePath);
  }

  /** The webview could not play it after all: convert once and play the copy. */
  async function _mediaFallback(el, kind) {
    const p = state.currentFile;
    if (!p || !el.getAttribute('src') || el.dataset.convertedFor === p) return;
    if ((kind === 'video' && !state.isVideo) || (kind === 'audio' && !state.isAudio)) return;
    el.dataset.convertedFor = p;
    const url = await _convertForPlayback(p, kind);
    if (url && state.currentFile === p) {
      el.src = url;
      el.load();
    }
  }

  function _showVideoPlayer(filePath) {
    if (filePath) {
      displayCanvas.style.display = 'none';
      selCanvas.style.display     = 'none';
      _hideAnimatedImage();
      videoEl.style.display       = 'flex';
      imagePlaceholder.style.display = 'none';
      _clearSubtitleTracks();
      videoEl.src = '';
      videoEl.load();
      delete videoEl.dataset.convertedFor;
      _mediaSourceUrl(filePath, 'video', videoEl).then(url => {
        if (!url || state.currentFile !== filePath) return;
        videoEl.src = url;
        videoEl.load();
        _applyMediaVolume();
        _mediaCueFromUser = null;
        _hideMediaCue();
        _updateMediaControlsVisibility();
        _syncMediaTransportButtons();
        _syncMediaVolumeUi();
        _loadAutoSubtitles(filePath);
      });
    } else {
      _hideMediaCue();
      videoEl.pause?.();
      videoEl.style.display = 'none';
      videoEl.src = '';
      _clearSubtitleTracks();
      _updateMediaControlsVisibility();
      _syncMediaTransportButtons();
    }
  }

  function _videoCueActive() {
    return !!(state.isVideo && videoEl && videoEl.style.display !== 'none')
      || !!(state.isAudio && audioEl && audioWrap && audioWrap.style.display !== 'none')
      || !!(state.isAnimated && !state.editMode);
  }

  /**
   * @param {'play'|'pause'|'stop'} kind
   * @param {boolean} persist  true = keep visible (pause while paused)
   */
  function _showMediaCue(kind, persist) {
    if (!mediaCue || !mediaCueBadge) return;
    const icons = { play: Icons.mediaPlay, pause: Icons.mediaPause, stop: Icons.mediaStop };
    // Only pause stays on screen; play/stop are brief flashes
    if (persist && kind !== 'pause') persist = false;
    if (kind !== 'pause' && kind !== 'play' && kind !== 'stop') kind = 'pause';

    clearTimeout(_mediaCueTimer);
    _mediaCueTimer = null;

    mediaCueBadge.innerHTML = icons[kind] || icons.pause;
    mediaCue.classList.remove('is-on', 'is-flash', 'is-persist', 'is-play', 'is-pause', 'is-stop');
    // Restart CSS animation cleanly for flashes
    void mediaCue.offsetWidth;
    mediaCue.classList.add('is-on', persist ? 'is-persist' : 'is-flash', `is-${kind}`);
    mediaCue.style.pointerEvents = 'none';
    mediaCueBadge.style.pointerEvents = persist ? 'auto' : 'none';
    mediaCueBadge.style.cursor = persist ? 'pointer' : '';
    mediaCueBadge.title = persist ? I18n.t('toolbar.play') : '';
    mediaCue.setAttribute('aria-hidden', persist ? 'false' : 'true');

    if (persist) return;
    _mediaCueTimer = setTimeout(() => _hideMediaCue(), 700);
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
      mediaCueBadge.title = '';
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
      const el = _mediaEl();
      if (!el) return;
      const dur = el.duration;
      if (!Number.isFinite(dur) || dur <= 0) return;
      const t = (Number(mcSeek.value) / 1000) * dur;
      try { el.currentTime = t; } catch {}
      if (mcTime) mcTime.textContent = `${_fmtMediaTime(t)} / ${_fmtMediaTime(dur)}`;
    });

    mcVolume?.addEventListener('pointerdown', (e) => e.stopPropagation());
    mcVolume?.addEventListener('click', (e) => e.stopPropagation());
    mcVolume?.addEventListener('input', (e) => {
      e.stopPropagation();
      if (!_mediaEl()) return;
      _setMediaVolume(mcVolume.value);
    });
    mcMuteBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!_mediaEl()) return;
      _toggleMediaMute();
    });
    mcSubtitleBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!state.isVideo) return;
      _toggleSubtitles();
    });
    mcSubtitleFileBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      _chooseSubtitleFile();
    });
    mcSubtitleLang?.addEventListener('change', (e) => {
      e.stopPropagation();
      if (!state.isVideo) return;
      _setSubtitleLanguage(mcSubtitleLang.value);
    });
    _syncMediaVolumeUi();
    _syncSubtitleControls();

    if (videoEl) {
      // Suppress native Chromium video context menu; use app menu instead
      videoEl.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        _showContextMenu(e.clientX, e.clientY);
      });
      videoEl.addEventListener('play', () => {
        if (!_videoCueActive()) return;
        _mediaCueFromUser = null;
        // Single brief play cue (driven only from this event — not from _playMedia)
        _showMediaCue('play', false);
        _syncMediaTransportButtons();
      });
      videoEl.addEventListener('pause', () => {
        _syncMediaTransportButtons();
        // User-driven pause/stop already showed the right cue
        if (_mediaCueFromUser === 'pause' || _mediaCueFromUser === 'stop') {
          _mediaCueFromUser = null;
          return;
        }
      });
      videoEl.addEventListener('ended', () => {
        if (!(state.isVideo && videoEl.style.display !== 'none')) return;
        _mediaCueFromUser = 'stop';
        _showMediaCue('stop', false);
        _syncMediaTransportButtons();
      });
      videoEl.addEventListener('timeupdate', () => {
        if (state.isVideo) _syncMediaSeekUi();
      });
      videoEl.addEventListener('loadedmetadata', () => {
        if (state.isVideo) {
          _syncMediaSeekUi();
          if (state.currentFile) _updateInfoQueue(state.currentFile).catch(() => {});
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
        _updateInfoQueue(state.currentFile).catch(() => {});
      }
      if (state.isAudio) _syncMediaSeekUi();
    });
    audioEl?.addEventListener('play', () => {
      if (!state.isAudio) return;
      _mediaCueFromUser = null;
      _showMediaCue('play', false);
      _syncMediaTransportButtons();
    });
    audioEl?.addEventListener('pause', () => {
      if (!state.isAudio) return;
      _syncMediaTransportButtons();
      if (_mediaCueFromUser === 'pause' || _mediaCueFromUser === 'stop') { _mediaCueFromUser = null; return; }
    });
    audioEl?.addEventListener('ended', () => {
      if (!state.isAudio) return;
      _mediaCueFromUser = 'stop';
      _showMediaCue('stop', false);
      _syncMediaTransportButtons();
    });
    audioEl?.addEventListener('timeupdate', () => { if (state.isAudio) _syncMediaSeekUi(); });
    // Not playable here (codec / container): convert once with the host's ffmpeg
    audioEl?.addEventListener('error', () => _mediaFallback(audioEl, 'audio'));
    videoEl?.addEventListener('error', () => _mediaFallback(videoEl, 'video'));
    // Sound but no picture (e.g. H.263 in 3GP, Theora in OGV): the video codec is missing
    videoEl?.addEventListener('loadedmetadata', () => {
      if (state.isVideo && videoEl.readyState >= 1 && !videoEl.videoWidth) _mediaFallback(videoEl, 'video');
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
      if (statusDims) statusDims.textContent = '—';   // no picture: not the last image's size
      if (statusFmt) statusFmt.textContent = (String(filePath).split('.').pop() || '').toUpperCase();
      if (audioEl) delete audioEl.dataset.convertedFor;
      _mediaSourceUrl(filePath, 'audio', audioEl).then(url => {
        if (!url || state.currentFile !== filePath) return;
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
      window.electronAPI.setLastOpenDir?.(dirPath);
      return;
    }
    const next = [dirPath, ...list.filter((p) => _normDirKey(p) !== key)].slice(0, RECENT_DIRS_MAX);
    localStorage.setItem(RECENT_DIRS_KEY, JSON.stringify(next));
    localStorage.setItem('lastOpenedDir', dirPath);
    window.electronAPI.setLastOpenDir?.(dirPath);
    _renderPlaces();
  }

  /**
   * Flush the folder currently on screen (browse / open file) so the next launch
   * can reopen it. Safe to call from close / beforeunload.
   */
  function _persistSessionFolder() {
    const fromBrowse = Browse.getDir?.() || '';
    if (fromBrowse) {
      _rememberRecentDir(fromBrowse);
      return;
    }
    const file = state.currentFile || _openingFile || '';
    if (!file) return;
    const cleaned = String(file).replace(/[\\/]+$/, '');
    const cut = Math.max(cleaned.lastIndexOf('/'), cleaned.lastIndexOf('\\'));
    if (cut > 0) _rememberRecentDir(cleaned.slice(0, cut));
  }

  /**
   * Switching drives lands on the folder last opened on that drive, not its bare
   * root — the most recent entry still on disk wins, the root is the fallback.
   */
  async function _recentDirOnDrive(drivePath) {
    const root = _normDirKey(drivePath);
    if (!root) return drivePath;
    for (const dir of _getRecentDirs()) {
      const key = _normDirKey(dir);
      if (key === root) return drivePath;            // the root itself is the freshest
      if (!key.startsWith(`${root}/`)) continue;     // another drive
      try {
        const stats = await window.electronAPI.getFileStats(dir);
        if (stats && !stats.error && stats.isDirectory) return dir;
      } catch { /* gone — try the next one */ }
    }
    return drivePath;
  }

  /** Folder history is remembered silently — clear it without a confirm prompt. */
  async function _clearRecentFolderHistory() {
    localStorage.setItem(RECENT_DIRS_KEY, '[]');
    localStorage.removeItem('lastOpenedDir');
    window.electronAPI.setLastOpenDir('');
    _refreshRecentFolderUi();
  }

  function _removeRecentDir(dirPath) {
    const key = _normDirKey(dirPath);
    const next = _getRecentDirs().filter((p) => _normDirKey(p) !== key);
    localStorage.setItem(RECENT_DIRS_KEY, JSON.stringify(next));
    if (_normDirKey(localStorage.getItem('lastOpenedDir') || '') === key) {
      const first = next[0] || '';
      if (first) localStorage.setItem('lastOpenedDir', first);
      else localStorage.removeItem('lastOpenedDir');
      window.electronAPI.setLastOpenDir(first);
    }
    _refreshRecentFolderUi();
  }

  function _refreshRecentFolderUi() {
    _placesChanged();
    const recentCount = document.getElementById('settings-recent-count');
    if (recentCount) {
      const n = _getRecentDirs().length;
      const tmpl = I18n.t('settings.recentCount') || '{n}';
      recentCount.textContent = tmpl.replace('{n}', String(n));
    }
    document.getElementById('settings-clear-recent')?.toggleAttribute('disabled', !_getRecentDirs().length);
  }

  /* ════════════════════════════════════════════
     Places: recent folders, recent files and favorites.
     The explorer's Recent and Favorites tabs, the start screen and the File menu's
     Recent Folders all read from here. One click (or ↑ / ↓) opens an entry at once:
     a file in the viewer, a folder as a contact sheet in the centre.
     Recent lists live in localStorage (10 each); favorites in favorites.db (SQLite,
     host side) — IndexedDB in web mode — and are mirrored in _favorites.
  ════════════════════════════════════════════ */

  function _getRecentFiles() {
    try {
      const raw = JSON.parse(localStorage.getItem(RECENT_FILES_KEY) || '[]');
      return Array.isArray(raw) ? raw.filter(Boolean).slice(0, RECENT_FILES_MAX) : [];
    } catch { return []; }
  }

  function _setRecentFiles(list) {
    try { localStorage.setItem(RECENT_FILES_KEY, JSON.stringify(list.slice(0, RECENT_FILES_MAX))); } catch { /* ignore */ }
  }

  function _rememberRecentFile(filePath) {
    if (!filePath) return;
    const key = _normDirKey(filePath);
    const list = _getRecentFiles();
    if (!list.length || _normDirKey(list[0]) !== key) {
      _setRecentFiles([filePath, ...list.filter((p) => _normDirKey(p) !== key)]);
    }
    _placesChanged();
  }

  function _removeRecentFile(filePath) {
    const key = _normDirKey(filePath);
    _setRecentFiles(_getRecentFiles().filter((p) => _normDirKey(p) !== key));
    _placesChanged();
  }

  function _clearRecentFiles() {
    _setRecentFiles([]);
    _placesChanged();
  }

  /* ── favorites ── */

  async function _loadFavorites() {
    _applyFavorites(await window.electronAPI.favoritesList?.());
  }

  /** Every favorites call answers the whole list (or { error }). */
  function _applyFavorites(res) {
    if (Array.isArray(res)) {
      _favorites = res;
      _placesChanged();
    } else if (res && res.error) {
      console.warn('favorites:', res.error);
      _updateStatus({ msg: `${I18n.t('places.favoriteError')}: ${res.error}` });
    }
  }

  function _isFavorite(p) {
    const key = _normDirKey(p);
    return !!key && _favorites.some((f) => _normDirKey(f.path) === key);
  }

  async function _addFavorites(entries) {
    let res = null;
    for (const { path, kind } of entries) {
      if (path && !_isFavorite(path)) res = await window.electronAPI.favoritesAdd?.(path, kind);
    }
    if (res) _applyFavorites(res);
  }

  async function _removeFavorite(p) {
    _applyFavorites(await window.electronAPI.favoritesRemove?.(p));
  }

  async function _clearFavorites() {
    if (!_favorites.length) return;
    const t = I18n.t.bind(I18n);
    const r = await window.electronAPI.showMessageBox({
      type: 'warning',
      title: t('tree.tab.favorites'),
      message: t('places.clearFavoritesConfirm'),
      buttons: [t('places.clearFavoritesYes'), t('dialog.delete.no')],
      defaultId: 1, cancelId: 1,
    });
    if (r?.response !== 0) return;
    _applyFavorites(await window.electronAPI.favoritesClear?.());
  }

  /** "Add to Favorites" / "Remove from Favorites" for one folder or file. */
  function _favoriteMenuItem(p, isDir) {
    if (!p) return null;
    const t = I18n.t.bind(I18n);
    return _isFavorite(p)
      ? { icon: Icons.starOutline, label: t('context.removeFavorite'), action: () => _removeFavorite(p) }
      : { icon: Icons.star, label: t('context.addFavorite'), action: () => _addFavorites([{ path: p, kind: isDir ? 'dir' : 'file' }]) };
  }

  /** The same for a multi-selection: adds the ones not starred yet. */
  function _favoriteMenuItemMulti(paths) {
    const todo = (paths || []).filter((p) => !_isFavorite(p));
    if (!todo.length) return null;
    return {
      icon: Icons.star,
      label: `${I18n.t('context.addFavorite')} (${todo.length})`,
      action: async () => {
        const entries = [];
        for (const p of todo) {
          let kind = '';
          try { kind = (await window.electronAPI.getFileStats(p))?.isDirectory ? 'dir' : 'file'; } catch { /* host decides */ }
          entries.push({ path: p, kind });
        }
        await _addFavorites(entries);
      },
    };
  }

  /* ── shared ── */

  function _placesChanged() {
    if (document.body.classList.contains('home-open')) _renderHome();
    _renderPlaces();
  }

  /** Paths still on disk; the ones gone are dropped from that recent list too. */
  async function _existingPaths(list, wantDir) {
    const ok = [];
    const gone = new Set();
    await Promise.all(list.map(async (p) => {
      try {
        const st = await window.electronAPI.getFileStats(p);
        if (st && !st.error && !!st.isDirectory === wantDir) return;
      } catch { /* gone */ }
      gone.add(p);
    }));
    for (const p of list) if (!gone.has(p)) ok.push(p);
    return { ok, gone };
  }

  async function _prunedRecent(key, list, wantDir) {
    const { ok, gone } = await _existingPaths(list, wantDir);
    if (gone.size) {
      // Re-read: the list may have changed while the disk was asked
      const fresh = key === RECENT_DIRS_KEY ? _getRecentDirs() : _getRecentFiles();
      try { localStorage.setItem(key, JSON.stringify(fresh.filter((p) => !gone.has(p)))); } catch { /* ignore */ }
    }
    return ok;
  }

  /** Open a recent / favorite entry: a file in the viewer, a folder as the centre contact sheet. */
  async function _openPlace(path, kind) {
    if (!path) return;
    if (kind === 'dir') {
      _showFolderInCenter(path);
      _rememberRecentDir(path);
      _watchDir(path);
      Thumbs.prefetchDir(path);
      try { await FileTree.revealPath(path); } catch { /* the sheet is what counts */ }
      return;
    }
    await _openFileRevealed(path);
  }

  function _parentLabel(p) {
    const cleaned = String(p || '').replace(/[\\/]+$/, '');
    const cut = Math.max(cleaned.lastIndexOf('/'), cleaned.lastIndexOf('\\'));
    return cut > 0 ? cleaned.slice(0, cut) : cleaned;
  }

  function _placeIconHtml(path, kind) {
    if (kind === 'dir') return { html: Icons.folder || '', className: 'dir-icon' };
    const ext = FormatSupport.getExtension(String(path).split(/[/\\]/).pop() || '');
    return Icons.forExtension ? Icons.forExtension(ext) : { html: Icons.file || '', className: 'file-icon' };
  }

  /* ── Explorer tabs ── */

  function _initPlaces() {
    const tabs = document.getElementById('tree-tabs');
    const view = document.getElementById('places-view');
    if (!tabs || !view) return;
    tabs.querySelectorAll('.tree-tab-icon[data-icon]').forEach((el) => { el.innerHTML = Icons[el.dataset.icon] || ''; });
    tabs.addEventListener('click', (e) => {
      const btn = e.target.closest('.tree-tab');
      if (btn) _setTreeTab(btn.dataset.treeTab);
    });

    view.addEventListener('click', (e) => {
      const clear = e.target.closest('.pv-clear');
      if (clear) { _placesSections.get(clear.dataset.section)?.clear(); return; }
      const row = e.target.closest('.pv-item');
      if (!row) return;
      if (e.target.closest('.pv-remove')) {
        _placesSections.get(row.dataset.section)?.remove(row.dataset.path);
        return;
      }
      _selectPlaceRow(row, { open: true });
    });
    view.addEventListener('contextmenu', (e) => {
      const row = e.target.closest('.pv-item');
      if (!row) return;
      e.preventDefault();
      e.stopPropagation();
      _selectPlaceRow(row, { open: false });
      _showPlaceMenu(row, e.clientX, e.clientY);
    });
    view.addEventListener('keydown', (e) => {
      const rows = [...view.querySelectorAll('.pv-item')];
      if (!rows.length) return;
      const cur = rows.findIndex((r) => r.classList.contains('selected'));
      let next = -1;
      if (e.key === 'ArrowDown') next = Math.min(rows.length - 1, cur + 1);
      else if (e.key === 'ArrowUp') next = Math.max(0, cur < 0 ? 0 : cur - 1);
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = rows.length - 1;
      else if (e.key === 'Enter' && cur >= 0) next = cur;
      else if (e.key === 'Delete' && cur >= 0) {
        // Takes the entry off this list — never deletes the file itself
        e.preventDefault();
        e.stopPropagation();
        const row = rows[cur];
        _placesSections.get(row.dataset.section)?.remove(row.dataset.path);
        return;
      } else if (e.key === 'ContextMenu' && cur >= 0) {
        e.preventDefault();
        e.stopPropagation();
        const r = rows[cur].getBoundingClientRect();
        _showPlaceMenu(rows[cur], r.left + 24, r.bottom);
        return;
      } else return;
      e.preventDefault();
      e.stopPropagation();
      if (next >= 0 && (next !== cur || e.key === 'Enter')) _selectPlaceRow(rows[next], { open: true });
    });
    // Rows keep still while the user steps through them; reorder once they move away
    const release = () => {
      if (!_placesHold) return;
      _placesHold = false;
      if (_placesPending) _renderPlaces();
    };
    view.addEventListener('pointerleave', release);
    view.addEventListener('focusout', (e) => { if (!view.contains(e.relatedTarget)) release(); });

    let saved = '';
    try { saved = localStorage.getItem(TREE_TAB_KEY) || ''; } catch { /* ignore */ }
    _setTreeTab(['explorer', 'recent', 'favorites'].includes(saved) ? saved : 'explorer');
    _loadFavorites();
  }

  function _setTreeTab(tab) {
    if (!['explorer', 'recent', 'favorites'].includes(tab)) return;
    const changed = tab !== _treeTab;
    _treeTab = tab;
    try { localStorage.setItem(TREE_TAB_KEY, tab); } catch { /* ignore */ }
    document.querySelectorAll('#tree-tabs .tree-tab').forEach((b) => {
      const on = b.dataset.treeTab === tab;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    const places = tab !== 'explorer';
    document.getElementById('file-tree-panel')?.classList.toggle('places-mode', places);
    const view = document.getElementById('places-view');
    if (view) view.hidden = !places;
    _placesHold = false;
    if (places) {
      if (changed) { _placesSelected = ''; if (view) view.scrollTop = 0; }
      _renderPlaces();
      // Another window may have changed favorites.db meanwhile
      if (tab === 'favorites') _loadFavorites();
    } else if (changed && state.currentFile) {
      FileTree.setSelected(state.currentFile, { center: true });
    }
  }

  function _selectPlaceRow(row, { open }) {
    const view = document.getElementById('places-view');
    view?.querySelectorAll('.pv-item.selected').forEach((r) => r.classList.remove('selected'));
    row.classList.add('selected');
    row.scrollIntoView({ block: 'nearest' });
    view?.focus({ preventScroll: true });
    _placesSelected = `${row.dataset.section}|${row.dataset.path}`;
    if (!open) return;
    if (row.classList.contains('missing')) {
      _updateStatus({ msg: `${I18n.t('places.missing')}: ${row.dataset.path}` });
      return;
    }
    _placesHold = true;
    _openPlace(row.dataset.path, row.dataset.kind).catch((err) => console.error(err));
  }

  function _showPlaceMenu(row, x, y) {
    const t = I18n.t.bind(I18n);
    const { path, kind } = row.dataset;
    const sec = _placesSections.get(row.dataset.section);
    const isWeb = _isWeb();
    const missing = row.classList.contains('missing');
    ContextMenu.show(x, y, [
      { icon: kind === 'dir' ? Icons.openFolder : Icons.openFile, label: t('places.open'), disabled: missing,
        action: () => _selectPlaceRow(row, { open: true }) },
      { separator: true },
      _favoriteMenuItem(path, kind === 'dir'),
      sec && sec.listKind === 'recent' && { icon: Icons.close, label: sec.removeTitle, action: () => sec.remove(path) },
      { separator: true },
      { icon: Icons.copy, label: t('tree.copyPath'), action: () => navigator.clipboard.writeText(path).catch(() => {}) },
      !isWeb && { icon: Icons.explorer, label: t('context.showInExplorer'), disabled: missing,
        action: () => window.electronAPI.showItemInFolder(path) },
    ].filter(Boolean));
  }

  /** Mark the row of the file on screen (keeps the rows where they are). */
  function _markPlacesCurrent() {
    const view = document.getElementById('places-view');
    if (!view) return;
    const cur = _normDirKey(state.currentFile || '');
    view.querySelectorAll('.pv-item').forEach((r) => {
      r.classList.toggle('current', r.dataset.kind === 'file' && !!cur && _normDirKey(r.dataset.path) === cur);
    });
  }

  async function _renderPlaces() {
    const view = document.getElementById('places-view');
    if (!view || _treeTab === 'explorer') return;
    if (_placesHold) { _placesPending = true; _markPlacesCurrent(); return; }
    _placesPending = false;
    const gen = ++_placesGen;
    const t = I18n.t.bind(I18n);
    let sections;
    if (_treeTab === 'recent') {
      const [dirs, files] = await Promise.all([
        _prunedRecent(RECENT_DIRS_KEY, _getRecentDirs(), true),
        _prunedRecent(RECENT_FILES_KEY, _getRecentFiles(), false),
      ]);
      sections = [
        { id: 'recent-dirs', listKind: 'recent', icon: 'folder', title: t('places.folders'),
          entries: dirs.map((p) => ({ path: p, kind: 'dir' })), empty: t('places.noRecentFolders'),
          clearTitle: t('toolbar.clearRecentFolders'), clear: () => _clearRecentFolderHistory(),
          removeTitle: t('toolbar.removeRecentFolder'), remove: (p) => _removeRecentDir(p) },
        { id: 'recent-files', listKind: 'recent', icon: 'image', title: t('places.files'),
          entries: files.map((p) => ({ path: p, kind: 'file' })), empty: t('places.noRecentFiles'),
          clearTitle: t('places.clearRecentFiles'), clear: () => _clearRecentFiles(),
          removeTitle: t('places.removeRecentFile'), remove: (p) => _removeRecentFile(p) },
      ];
    } else {
      // Favorites are never dropped silently: a missing one stays, dimmed
      const favs = _favorites.slice();
      const missing = new Set();
      await Promise.all(favs.map(async (f) => {
        try {
          const st = await window.electronAPI.getFileStats(f.path);
          if (st && !st.error) return;
        } catch { /* missing */ }
        missing.add(f.path);
      }));
      const fav = (kind) => favs.filter((f) => f.kind === kind).map((f) => ({ path: f.path, kind, missing: missing.has(f.path) }));
      const common = { listKind: 'favorites', clearTitle: t('places.clearFavorites'), clear: () => _clearFavorites(),
        removeTitle: t('context.removeFavorite'), remove: (p) => _removeFavorite(p) };
      sections = [
        { id: 'fav-dirs', icon: 'folder', title: t('places.folders'), entries: fav('dir'), empty: t('places.noFavorites'), ...common },
        { id: 'fav-files', icon: 'image', title: t('places.files'), entries: fav('file'), empty: t('places.noFavoriteFiles'), ...common },
      ];
    }
    if (gen !== _placesGen || _treeTab === 'explorer') return;

    const scrollTop = view.scrollTop;
    const hadFocus = view.contains(document.activeElement);
    _placesSections = new Map(sections.map((s) => [s.id, s]));
    const frag = document.createDocumentFragment();
    for (const s of sections) {
      const sec = document.createElement('section');
      sec.className = 'pv-section';
      sec.dataset.section = s.id;
      const head = document.createElement('div');
      head.className = 'pv-head';
      head.innerHTML = `<span class="pv-icon">${Icons[s.icon] || ''}</span><span class="pv-title"></span>`
        + `<span class="pv-count"></span><span class="pv-spacer"></span>`;
      head.querySelector('.pv-title').textContent = s.title;
      head.querySelector('.pv-count').textContent = s.entries.length ? String(s.entries.length) : '';
      if (s.entries.length) {
        const clear = document.createElement('button');
        clear.type = 'button';
        clear.className = 'pv-clear';
        clear.dataset.section = s.id;
        clear.title = s.clearTitle;
        clear.setAttribute('aria-label', s.clearTitle);
        clear.innerHTML = Icons.delete || '';
        head.appendChild(clear);
      }
      sec.appendChild(head);
      if (!s.entries.length) {
        const empty = document.createElement('div');
        empty.className = 'pv-empty';
        empty.textContent = s.empty;
        sec.appendChild(empty);
      }
      for (const e of s.entries) {
        const row = document.createElement('div');
        row.className = `pv-item${e.missing ? ' missing' : ''}`;
        row.setAttribute('role', 'option');
        row.dataset.section = s.id;
        row.dataset.path = e.path;
        row.dataset.kind = e.kind;
        row.title = e.missing ? `${e.path}\n${t('places.missing')}` : e.path;
        if (_placesSelected === `${s.id}|${e.path}`) row.classList.add('selected');
        const ic = _placeIconHtml(e.path, e.kind);
        const icon = document.createElement('span');
        icon.className = `pv-icon ${ic.className || ''}`;
        icon.innerHTML = ic.html || '';
        const text = document.createElement('span');
        text.className = 'pv-text';
        const name = document.createElement('span');
        name.className = 'pv-name';
        name.textContent = _dirBaseName(e.path);
        const where = document.createElement('span');
        where.className = 'pv-path';
        where.textContent = _parentLabel(e.path);
        text.append(name, where);
        const rm = document.createElement('button');
        rm.type = 'button';
        rm.className = 'pv-remove';
        rm.tabIndex = -1;
        rm.title = s.removeTitle;
        rm.setAttribute('aria-label', s.removeTitle);
        rm.innerHTML = Icons.close || '×';
        row.append(icon, text, rm);
        sec.appendChild(row);
      }
      frag.appendChild(sec);
    }
    view.replaceChildren(frag);
    view.scrollTop = scrollTop;
    _markPlacesCurrent();
    if (hadFocus) view.focus({ preventScroll: true });
  }

  function _isFileDialogOpen() {
    const el = document.getElementById('file-dialog-overlay');
    return !!(el && (el.style.display === 'flex' || el.classList.contains('visible')));
  }

  async function _pickOpenFile() {
    if (!window.FileDialog) return;
    const r = await window.FileDialog.openFile();
    if (!r || r.canceled || !r.filePath) return;
    await _openFileRevealed(r.filePath);
  }

  /** Open a file from anywhere (dialog, Recent, Favorites) and show it in the explorer. */
  async function _openFileRevealed(p) {
    try {
      const dir = await window.electronAPI.pathDirname(p);
      await _openFile(p, { center: true });
      await FileTree.revealPath(dir);
      await FileTree.refresh({ force: true });
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
    await FileTree.refresh({ force: true });
  }

  /**
   * Left-panel folder selection: put that directory's images in the centre
   * contact sheet (browse mode on, filmstrip off, home closed).
   */
  function _showFolderInCenter(dirPath) {
    if (!dirPath) return;
    _hideHome();
    _browseSheetHeld = false;
    if (!_browseMode) {
      _browseMode = true;
      try { localStorage.setItem(BROWSE_KEY, '1'); } catch { /* ignore */ }
      FileTree.setFoldersOnly?.(true);
    }
    Browse.setFilmstrip?.(false);
    Browse.show(dirPath);
    Browse.open(dirPath);
    _syncBrowseChrome();
  }

  async function _openFolder(dirPath, { openFirst = true, instant = false, keepHome = false } = {}) {
    if (!keepHome) _hideHome();
    const work = async () => {
      _rememberRecentDir(dirPath);
      if (window.electronAPI.platform === 'web') {
        await FileTree.loadDrives();
      }
      await FileTree.revealPath(dirPath);
      _watchDir(dirPath);
    };
    if (instant) {
      await work();
    } else {
      await _runOpWithProgress(work, {
        titleKey: 'progress.openTitle',
        messageKey: 'progress.openingFolder',
        delayMs: 280,
      });
    }
    // Every folder open warms the thumbnail cache; in browse mode it also fills the grid
    Thumbs.prefetchDir(dirPath);
    if (_browseMode) {
      // An explicit folder open shows that folder's sheet, not a strip under the old image.
      _browseSheetHeld = false;
      Browse.setFilmstrip?.(false);
      Browse.show(dirPath);
      await Browse.open(dirPath);
      _syncBrowseChrome();
      return;
    }
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
    _syncViewModeButtons();
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
    if (state.editMode) {
      _ewZoomTo(Math.min(Math.max(z, 0.02), 32));
      return;
    }
    _wantFit = false;
    state.zoom = Math.min(Math.max(z, 0.02), 32);
    _applyTransform();
    _updateZoomDisplay();
    _updateStatus({ zoom: true });
  }

  // (_wantFit is declared in the early block — the toolbar build at init reads it)
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
    // Always remember that fit is wanted — a first pass can run before the
    // canvas or the viewer box has a size; the open finally-block refits then.
    _wantFit = true;
    _syncViewModeButtons();
    const { w, h } = _getViewerDims();
    if (!w || !h) return;
    if (!viewerContainer || !(viewerContainer.clientWidth > 0) || !(viewerContainer.clientHeight > 0)) return;
    const cw = Math.max(1, viewerContainer.clientWidth - 16), ch = Math.max(1, viewerContainer.clientHeight - 16);
    const z = { window: _fitZoomFor(viewerContainer, w, h), width: cw / w, height: ch / h, actual: 1 }[_viewMode] || _fitZoomFor(viewerContainer, w, h);
    state.zoom = Math.min(Math.max(z, 0.02), 32);
    state.panX = 0; state.panY = 0;
    // Fit width starts at the top of a tall picture, fit height at the left of a wide one
    if (_viewMode === 'width') state.panY = Math.max(0, (h * state.zoom - viewerContainer.clientHeight) / 2);
    if (_viewMode === 'height') state.panX = Math.max(0, (w * state.zoom - viewerContainer.clientWidth) / 2);
    _applyTransform();
    _updateZoomDisplay();
    _updateStatus({ zoom: true });
  }

  /** Pick a display mode (remembered) and apply it now. */
  function _setViewMode(mode) {
    if (!['window', 'width', 'height', 'actual'].includes(mode)) return;
    _viewMode = mode;
    try { localStorage.setItem(VIEW_MODE_KEY, mode); } catch { /* ignore */ }
    if (state.editMode) { if (mode === 'actual') _ewZoomTo(1); else _ewFit(); return; }
    _fitToWindow();
  }

  /** Back to the middle, same zoom. */
  function _centerView() {
    if (!_hasViewerVisual()) return;
    state.panX = 0; state.panY = 0;
    _applyTransform();
  }

  /** The mode buttons show the mode in force; none while the zoom is the user's own. */
  function _syncViewModeButtons() {
    const ids = { window: 'btn-fit', width: 'btn-fit-width', height: 'btn-fit-height', actual: 'btn-actual' };
    for (const [mode, id] of Object.entries(ids)) {
      document.getElementById(id)?.classList.toggle('active', !!_wantFit && _viewMode === mode && !state.editMode);
    }
  }

  function _actualSize() {
    if (!_hasViewerVisual()) return;
    _setViewMode('actual');
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
    _paintGuides(container, left, top, zoom, w, h);
  }

  /* Ruler (px) and a 5×5 grid over the image. The grid stays on those fifths
     while a cell is a readable size on screen; past that it follows the ruler's
     tick spacing so the lines and the numbers stay on the same pixels. */
  const GUIDE_RULER = 22;
  const GUIDE_CELL_MIN = 36;
  const GUIDE_CELL_MAX = 170;
  let _guideCanvas = null;

  function _guideTip(which) {
    if (which === 'ruler') return I18n.t(_guides.ruler ? 'toolbar.rulerOff' : 'toolbar.ruler');
    return I18n.t(_guides.grid ? 'toolbar.gridOff' : 'toolbar.grid');
  }

  function _syncGuideButtons() {
    const on = (id, pressed) => {
      const btn = document.getElementById(id);
      if (!btn) return;
      btn.classList.toggle('active', pressed);
      btn.setAttribute('aria-pressed', pressed ? 'true' : 'false');
    };
    on('btn-ruler', _guides.ruler);
    on('btn-grid', _guides.grid);
    on('ew-ruler', _guides.ruler);
    on('ew-grid', _guides.grid);
  }

  function _toggleGuide(which) {
    _guides[which] = !_guides[which];
    try { localStorage.setItem(GUIDE_KEY, JSON.stringify(_guides)); } catch { /* ignore */ }
    _syncGuideButtons();
    _syncMenu();
    if (state.editMode) _ewApplyTransform();
    else _applyTransform();
  }

  function _niceGuideStep(zoom) {
    const bases = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000, 10000, 20000];
    let best = bases[0];
    let bestDist = Infinity;
    for (const step of bases) {
      const screen = step * zoom;
      const dist = Math.abs(screen - 80);
      const inBand = screen >= 28 && screen <= 150;
      if (inBand && dist < bestDist) { best = step; bestDist = dist; }
    }
    if (bestDist === Infinity) {
      for (const step of bases) {
        const dist = Math.abs(step * zoom - 80);
        if (dist < bestDist) { best = step; bestDist = dist; }
      }
    }
    return best;
  }

  function _fifthTicks(size) {
    const ticks = [];
    for (let i = 0; i <= 5; i++) ticks.push(Math.round((i * size) / 5));
    return ticks;
  }

  function _guidePlan(w, h, zoom) {
    const cellW = (w / 5) * zoom;
    const cellH = (h / 5) * zoom;
    if (cellW >= GUIDE_CELL_MIN && cellW <= GUIDE_CELL_MAX
        && cellH >= GUIDE_CELL_MIN && cellH <= GUIDE_CELL_MAX) {
      return { fifth: true, xs: _fifthTicks(w), ys: _fifthTicks(h) };
    }
    const step = _niceGuideStep(zoom);
    return { fifth: false, step };
  }

  function _paintGuides(container, left, top, zoom, w, h) {
    const show = (_guides.ruler || _guides.grid) && w > 0 && h > 0 && zoom > 0
      && !(container === viewerContainer && window.Browse?.isVisible?.());
    if (!show) {
      if (_guideCanvas) _guideCanvas.hidden = true;
      return;
    }
    if (!_guideCanvas) {
      _guideCanvas = document.createElement('canvas');
      _guideCanvas.id = 'view-guides';
      _guideCanvas.className = 'view-guides';
    }
    if (_guideCanvas.parentElement !== container) container.appendChild(_guideCanvas);
    _guideCanvas.hidden = false;

    const cw = container.clientWidth;
    const ch = container.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    _guideCanvas.width = Math.max(1, Math.round(cw * dpr));
    _guideCanvas.height = Math.max(1, Math.round(ch * dpr));
    _guideCanvas.style.width = `${cw}px`;
    _guideCanvas.style.height = `${ch}px`;
    const ctx = _guideCanvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);

    const plan = _guidePlan(w, h, zoom);
    const ruler = GUIDE_RULER;
    const originX = _guides.ruler ? ruler : 0;
    const originY = _guides.ruler ? ruler : 0;
    const imgRight = left + w * zoom;
    const imgBottom = top + h * zoom;
    const cs = getComputedStyle(document.body);
    const bar = cs.getPropertyValue('--bg-secondary').trim() || '#1e2430';
    const ink = cs.getPropertyValue('--text-primary').trim() || '#e8eef8';

    if (_guides.grid) {
      ctx.save();
      ctx.beginPath();
      const gx0 = Math.max(originX, left);
      const gy0 = Math.max(originY, top);
      const gx1 = Math.min(cw, imgRight);
      const gy1 = Math.min(ch, imgBottom);
      ctx.rect(gx0, gy0, Math.max(0, gx1 - gx0), Math.max(0, gy1 - gy0));
      ctx.clip();
      ctx.strokeStyle = 'rgba(186, 214, 255, 0.55)';
      ctx.lineWidth = 1;
      const vLines = plan.fifth ? plan.xs : null;
      const hLines = plan.fifth ? plan.ys : null;
      const drawV = (px) => {
        const sx = Math.round(left + px * zoom) + 0.5;
        ctx.beginPath();
        ctx.moveTo(sx, Math.max(originY, top));
        ctx.lineTo(sx, Math.min(ch, imgBottom));
        ctx.stroke();
      };
      const drawH = (py) => {
        const sy = Math.round(top + py * zoom) + 0.5;
        ctx.beginPath();
        ctx.moveTo(Math.max(originX, left), sy);
        ctx.lineTo(Math.min(cw, imgRight), sy);
        ctx.stroke();
      };
      if (plan.fifth) {
        vLines.forEach(drawV);
        hLines.forEach(drawH);
      } else {
        const step = plan.step;
        const xStart = Math.max(0, Math.floor((originX - left) / zoom / step) * step);
        const yStart = Math.max(0, Math.floor((originY - top) / zoom / step) * step);
        const xEnd = Math.min(w, Math.ceil((cw - left) / zoom / step) * step);
        const yEnd = Math.min(h, Math.ceil((ch - top) / zoom / step) * step);
        for (let px = xStart; px <= xEnd + 0.01; px += step) drawV(px);
        for (let py = yStart; py <= yEnd + 0.01; py += step) drawH(py);
      }
      ctx.restore();
    }

    if (!_guides.ruler) return;

    ctx.fillStyle = bar;
    ctx.fillRect(0, 0, cw, ruler);
    ctx.fillRect(0, 0, ruler, ch);
    ctx.fillStyle = ink;
    ctx.font = '10px sans-serif';
    ctx.textBaseline = 'top';
    ctx.fillText('px', 4, 6);
    ctx.strokeStyle = ink;
    ctx.fillStyle = ink;
    ctx.lineWidth = 1;

    const drawAxis = (horizontal) => {
      const size = horizontal ? w : h;
      const origin = horizontal ? left : top;
      const span = horizontal ? cw : ch;
      const majors = plan.fifth
        ? (horizontal ? plan.xs : plan.ys)
        : null;
      const step = plan.fifth ? 0 : plan.step;
      const ticks = [];
      if (majors) {
        for (const value of majors) ticks.push({ value, major: true });
        for (let i = 0; i < majors.length - 1; i++) {
          const gap = majors[i + 1] - majors[i];
          if (gap <= 0 || (gap * zoom) / 5 < 8) continue;
          for (let k = 1; k < 5; k++) ticks.push({ value: majors[i] + (gap * k) / 5, major: false });
        }
      } else {
        const minor = step % 5 === 0 ? step / 5 : (step % 2 === 0 ? step / 2 : 0);
        const viewStart = Math.max(0, (ruler - origin) / zoom);
        const viewEnd = Math.min(size, (span - origin) / zoom);
        const first = Math.floor(viewStart / step) * step;
        const last = Math.ceil(viewEnd / step) * step;
        for (let value = Math.max(0, first); value <= last + 0.01; value += step) {
          ticks.push({ value, major: true });
          if (minor > 0 && minor * zoom >= 6) {
            for (let k = 1; k < step / minor; k++) ticks.push({ value: value + minor * k, major: false });
          }
        }
      }
      let lastLabel = -Infinity;
      for (const tick of ticks) {
        if (tick.value < -0.5 || tick.value > size + 0.5) continue;
        const pos = Math.round(origin + tick.value * zoom) + 0.5;
        if (pos < ruler || pos > span) continue;
        const len = tick.major ? 8 : 4;
        ctx.beginPath();
        if (horizontal) { ctx.moveTo(pos, ruler); ctx.lineTo(pos, ruler - len); }
        else { ctx.moveTo(ruler, pos); ctx.lineTo(ruler - len, pos); }
        ctx.stroke();
        if (!tick.major) continue;
        const label = String(Math.round(tick.value));
        const width = ctx.measureText(label).width;
        if (horizontal) {
          if (pos + 2 < lastLabel) continue;
          ctx.fillText(label, pos + 2, 3);
          lastLabel = pos + 2 + width + 4;
        } else if (pos + 2 > lastLabel) {
          ctx.save();
          ctx.translate(3, pos + 2);
          ctx.rotate(Math.PI / 2);
          ctx.fillText(label, 0, 0);
          ctx.restore();
          lastLabel = pos + width + 8;
        }
      }
    };
    drawAxis(true);
    drawAxis(false);
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
    if (state.isVideo && videoEl && dims.w && dims.h) {
      const vw = dims.w * state.zoom, vh = dims.h * state.zoom;
      Object.assign(videoEl.style, {
        width: `${Math.round(vw)}px`, height: `${Math.round(vh)}px`,
        left: `${Math.round(viewerContainer.clientWidth / 2 + state.panX - vw / 2)}px`,
        top: `${Math.round(viewerContainer.clientHeight / 2 + state.panY - vh / 2)}px`,
      });
    }
    if (state.dicom) _dicomOverlayRequest();
  }

  function _updateZoomDisplay() {
    const pct = `${Math.round(state.zoom * 100)}%`;
    const zd = document.getElementById('zoom-display');
    const ezd = document.getElementById('ew-zoom-display');
    if (zd) zd.value = pct;
    if (ezd) ezd.value = pct;
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
      const step = Math.max(1, Math.min(100, parseFloat(_pref('zoomStep')) || 10)) / 100;
      const factor = e.deltaY < 0 ? 1 + step : 1 / (1 + step);
      _zoom(factor, cx, cy);
    }, { passive: false });

    // Pan
    viewerContainer.addEventListener('mousedown', (e) => {
      if (state.currentTool !== 'pointer') return;
      if (e.button !== 0 && e.button !== 1) return;
      // Don't start pan from transport controls
      if (e.target.closest?.('#media-controls') || e.target.closest?.('#dicom-controls')) return;
      // Ctrl+drag / middle button on a grey DICOM adjusts the window instead of panning
      if (_dicomBeginWindowDrag(e)) return;
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

    // Click the video / the audio screen (without drag) → play / pause / play again
    viewerContainer.addEventListener('click', (e) => {
      if (state.editMode || !(state.isVideo || state.isAudio)) return;
      if (e.button != null && e.button !== 0) return;
      if (_panDidMove) return;
      if (e.target.closest?.('#media-controls')) return;
      if (e.target.closest?.('#media-cue-badge')) return;
      if (e.target.closest?.('.viewer-nav-btn')) return;   // ‹ / › go to the neighbour file
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
      modal: !!state.editMode,
    });
    try {
      await ProgressDialog.yieldFrame();
      ProgressDialog.set(25, I18n.t('progress.running') || 'Running algorithm…');
      await ProgressDialog.yieldFrame();
      Editor.removeBackgroundAuto(algo);
      if (state.editMode) _ewFit();
      ProgressDialog.set(85, I18n.t('progress.applying') || 'Applying result…');
      await ProgressDialog.yieldFrame();
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
    const algoLabel = I18n.t(`bgAlgo.${algo}`) || algo;
    // Capture selection bbox before rembg (applyFromDataUrl clears selection)
    const cropBounds = Editor.getSelectionBounds?.(1) || null;
    const btn = document.getElementById('ew-bg-remove');
    const sel = document.getElementById('ew-bg-algo');
    _rembgBusy = true;
    _setChromeBtn(btn, false);
    _setChromeBtn(sel, false);

    ProgressDialog.show({
      title: I18n.t('progress.title') || 'Progress',
      message: `${I18n.t('bgAlgo.rembgRunning') || 'Removing background (AI)…'} (${algoLabel})`,
      percent: 0,
      modal: !!state.editMode,
    });
    ProgressDialog.startCreep(88);
    await ProgressDialog.yieldFrame();

    let retry = false;   // "Retry" after a failed model download → run again (fresh download)
    const dataUrl = Editor.exportAsDataUrl('image/png');
    if (!dataUrl) {
      ProgressDialog.hide();
      _rembgBusy = false;
      _setChromeBtn(btn, true);
      _setChromeBtn(sel, true);
      return;
    }

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
        if (result.code === 'MODEL_DOWNLOAD_FAILED') {
          // Tell the user, and let them try again — a retry downloads from the start
          const t = I18n.t.bind(I18n);
          const answer = await window.electronAPI.showMessageBox({
            type: 'error',
            title: t('bgAlgo.modelDownloadFailed'),
            message: t('bgAlgo.modelDownloadFailed'),
            detail: `${result.error}\n\n${t('bgAlgo.modelDownloadHint')}`,
            buttons: [t('bgAlgo.retryDownload'), t('bgAlgo.close')],
            defaultId: 0,
            cancelId: 1,
          });
          if (answer && answer.response === 0) retry = true;
          return;
        }
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
      // (in finally: the failure branch above returns from inside the try)
      if (retry) setTimeout(() => { _runRembg(algo); }, 0);
    }
  }

  function _progressMessage(code, algoLabel) {
    // "downloading_model|<got MB>|<total MB>"
    const [kind, got, total] = String(code || '').split('|');
    if (kind === 'downloading_model') {
      const base = I18n.t('progress.downloadingModel') || 'Downloading the AI model…';
      const size = got != null && total ? `  ${got} / ${total} MB` : '';
      return `${base}${size}${algoLabel ? ` (${algoLabel})` : ''}`;
    }
    const map = {
      preparing: 'progress.preparing',
      downloading_python: 'progress.downloadingPython',
      installing_python: 'progress.installingPython',
      installing_deps: 'progress.installingDeps',
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
  async function _rotate(deg) {
    if (!_isEditableImage()) return;
    await Editor.rotate(deg);
    if (state.editMode) _ewFit();
    else _fitToWindow();
    _updateStatus({ dims: true });
    _updateUndoRedoBtns();
  }

  async function _flip(axis) {
    if (!_isEditableImage()) return;
    await Editor.flip(axis);
    _updateUndoRedoBtns();
  }

  // Undo / redo cover the Editor history and, in the viewer, the DICOM measurements:
  // whichever changed more recently goes first.
  async function _undoEdit() {
    if (!state.editMode && _dicomMeasCanUndo() && (!Editor.canUndo() || _dicomMeasHist.seq > _editorSeq)) { _dicomMeasUndo(); return; }
    if (!_isEditableImage()) return;
    await Editor.undo();
    _updateUndoRedoBtns();
  }

  async function _redoEdit() {
    if (!state.editMode && _dicomMeasCanRedo() && (!Editor.canRedo() || _dicomMeasHist.seq > _editorSeq)) { _dicomMeasRedo(); return; }
    if (!_isEditableImage()) return;
    await Editor.redo();
    _updateUndoRedoBtns();
  }

  async function _cropToSelection() {
    if (!_isEditableImage() || !Editor.hasSelection()) return;
    await Editor.cropToSelection();
    _ewUpdateSelBtns();
    _updateUndoRedoBtns();
    if (state.editMode) _ewFit();
    _updateStatus({ dims: true });
  }

  /* ════════════════════════════════════════════
     Resize dialog
  ════════════════════════════════════════════ */
  const _RESIZE_MAX = 16384;
  const _RESIZE_PRESETS = {
    percent: [25, 50, 75, 100, 150, 200].map(v => ({ label: `${v}%`, value: v })),
    pixels:  [640, 800, 1280, 1920, 2560].map(v => ({ label: `${v}px`, value: v })),
    longest: [640, 1280, 1920, 2560, 3840].map(v => ({ label: `${v}px`, value: v })),
    fit:     [640, 1280, 1920, 2560].map(v => ({ label: `${v}px`, value: v })),
  };
  let _resizeCtx = { srcW: 0, srcH: 0 };
  let _resizeBound = false;

  function _resizeExtFor(fmt) {
    return fmt === 'jpg' ? 'jpg' : (fmt === 'webp' ? 'webp' : (fmt === 'bmp' ? 'bmp' : 'png'));
  }

  function _resizeDefaultFormat() {
    const ext = state.currentFile ? FormatSupport.getExtension(state.currentFile) : '';
    if (ext === 'jpg' || ext === 'jpeg') return 'jpg';
    if (ext === 'webp') return 'webp';
    if (ext === 'bmp') return 'bmp';
    return 'png';
  }

  function _resizeMode() {
    return document.querySelector('input[name="resize-mode"]:checked')?.value || 'percent';
  }

  function _resizeComputeTarget() {
    const { srcW, srcH } = _resizeCtx;
    let w = srcW, h = srcH;
    if (!srcW || !srcH) return { w: 1, h: 1 };
    const num = (id, dflt) => {
      const v = Number(document.getElementById(id)?.value);
      return Number.isFinite(v) && v > 0 ? v : dflt;
    };
    switch (_resizeMode()) {
      case 'pixels': {
        w = num('resize-width', srcW);
        h = num('resize-height', srcH);
        break;
      }
      case 'longest': {
        const L = num('resize-longest', Math.max(srcW, srcH));
        const s = L / Math.max(srcW, srcH);
        w = srcW * s; h = srcH * s;
        break;
      }
      case 'fit': {
        const mw = num('resize-max-w', srcW);
        const mh = num('resize-max-h', srcH);
        const s = Math.min(mw / srcW, mh / srcH);
        w = srcW * s; h = srcH * s;
        break;
      }
      default: { // percent
        const p = num('resize-percent', 100);
        w = srcW * p / 100; h = srcH * p / 100;
      }
    }
    w = Math.min(_RESIZE_MAX, Math.max(1, Math.round(w)));
    h = Math.min(_RESIZE_MAX, Math.max(1, Math.round(h)));
    return { w, h };
  }

  function _resizeSyncLockedField(changed) {
    if (_resizeMode() !== 'pixels') return;
    const lock = document.getElementById('resize-lock');
    if (!lock || !lock.checked) return;
    const { srcW, srcH } = _resizeCtx;
    if (!srcW || !srcH) return;
    const wEl = document.getElementById('resize-width');
    const hEl = document.getElementById('resize-height');
    if (!wEl || !hEl) return;
    if (changed === 'height') {
      const hv = Math.max(1, Number(hEl.value) || 0);
      if (hv) wEl.value = Math.min(_RESIZE_MAX, Math.max(1, Math.round(hv * srcW / srcH)));
    } else {
      const wv = Math.max(1, Number(wEl.value) || 0);
      if (wv) hEl.value = Math.min(_RESIZE_MAX, Math.max(1, Math.round(wv * srcH / srcW)));
    }
  }

  function _resizeApplyPreset(mode, value) {
    if (mode === 'percent') {
      const el = document.getElementById('resize-percent'); if (el) el.value = value;
    } else if (mode === 'pixels') {
      const el = document.getElementById('resize-width'); if (el) el.value = value;
      _resizeSyncLockedField('width');
    } else if (mode === 'longest') {
      const el = document.getElementById('resize-longest'); if (el) el.value = value;
    } else if (mode === 'fit') {
      const mw = document.getElementById('resize-max-w'); if (mw) mw.value = value;
      const mh = document.getElementById('resize-max-h'); if (mh) mh.value = value;
    }
  }

  function _resizeRenderPresets() {
    const cont = document.getElementById('resize-presets');
    if (!cont) return;
    const mode = _resizeMode();
    cont.innerHTML = '';
    (_RESIZE_PRESETS[mode] || []).forEach(p => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'resize-preset-btn';
      btn.textContent = p.label;
      btn.addEventListener('click', () => { _resizeApplyPreset(mode, p.value); _resizeUpdatePreview(); });
      cont.appendChild(btn);
    });
  }

  function _resizeRefreshQualityVisibility() {
    const fmt = document.getElementById('resize-format')?.value;
    const wrap = document.getElementById('resize-file-quality-wrap');
    if (wrap) wrap.style.visibility = (fmt === 'jpg' || fmt === 'webp') ? 'visible' : 'hidden';
  }

  function _resizeUpdatePreview() {
    const { w, h } = _resizeComputeTarget();
    const { srcW, srcH } = _resizeCtx;
    // Remember the effective target so a mode switch can carry it over.
    _resizeCtx.curW = w;
    _resizeCtx.curH = h;
    const summaryEl = document.getElementById('resize-summary');
    if (summaryEl) {
      const mp = ((w * h) / 1e6).toFixed(1);
      summaryEl.textContent = (I18n.t('resize.summary')
        || '{srcW} × {srcH} → {dstW} × {dstH}  ({mp} MP)')
        .replace('{srcW}', srcW).replace('{srcH}', srcH)
        .replace('{dstW}', w).replace('{dstH}', h)
        .replace('{mp}', mp);
    }
    const cv = document.getElementById('resize-preview');
    const srcCanvas = Editor.getCanvasElement && Editor.getCanvasElement();
    if (!cv || !srcCanvas) return;
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, cv.width, cv.height);
    const targetAspect = w / h;
    let dw = cv.width, dh = cv.width / targetAspect;
    if (dh > cv.height) { dh = cv.height; dw = cv.height * targetAspect; }
    const dx = (cv.width - dw) / 2;
    const dy = (cv.height - dh) / 2;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    try { ctx.drawImage(srcCanvas, dx, dy, dw, dh); } catch (_) { /* ignore */ }
  }

  // Fill the given mode's input fields so they represent the target
  // dimensions (w × h) — used to carry values across a mode switch.
  function _resizePopulateMode(mode, w, h) {
    const { srcW, srcH } = _resizeCtx;
    if (!srcW || !srcH || !Number.isFinite(w) || !Number.isFinite(h) || w < 1 || h < 1) return;
    const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
    if (mode === 'percent') {
      setVal('resize-percent', Math.max(1, Math.round((w / srcW) * 100)));
    } else if (mode === 'pixels') {
      setVal('resize-width', w);
      setVal('resize-height', h);
    } else if (mode === 'longest') {
      setVal('resize-longest', Math.max(w, h));
    } else if (mode === 'fit') {
      setVal('resize-max-w', w);
      setVal('resize-max-h', h);
    }
  }

  function _resizeRefreshFields() {
    const mode = _resizeMode();
    // Carry the current target dims (computed under the previous mode) into
    // the fields of the newly-active mode so the values stay consistent.
    _resizePopulateMode(mode, _resizeCtx.curW, _resizeCtx.curH);
    const setHidden = (id, hidden) => { const el = document.getElementById(id); if (el) el.hidden = hidden; };
    setHidden('resize-fields-percent', mode !== 'percent');
    setHidden('resize-fields-pixels',  mode !== 'pixels');
    setHidden('resize-fields-longest', mode !== 'longest');
    setHidden('resize-fields-fit',     mode !== 'fit');
    const lockWrap = document.getElementById('resize-lock-wrap');
    if (lockWrap) lockWrap.style.display = mode === 'pixels' ? '' : 'none';
    _resizeRenderPresets();
    _resizeUpdatePreview();
  }

  async function _resizeConfirm() {
    const { w, h } = _resizeComputeTarget();
    if (w < 1 || h < 1) { await _showError(I18n.t('resize.invalidSize')); return; }

    const apply = !!document.getElementById('resize-apply')?.checked;
    const dir = (document.getElementById('resize-dir')?.value || '').trim();
    const rawName = (document.getElementById('resize-name')?.value || '').trim();
    const fmt = document.getElementById('resize-format')?.value || 'png';
    const interp = document.getElementById('resize-interp')?.value || 'high';
    const hasPath = !!(dir && rawName && window.electronAPI?.writeFile);

    if (!hasPath && !apply) { await _showError(I18n.t('resize.needPath')); return; }

    const mimeMap = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', bmp: 'image/bmp' };
    const mime = mimeMap[fmt] || 'image/png';
    const useQ = (mime === 'image/jpeg' || mime === 'image/webp');
    const fileQ = useQ ? Math.min(1, Math.max(0.4, (Number(document.getElementById('resize-file-quality')?.value) || 92) / 100)) : 0.92;

    let saved = false;
    let savePath = '';

    // Save resized copy (exported from the current image, before any in-place apply).
    if (hasPath) {
      const extName = _resizeExtFor(fmt);
      const stem = rawName.replace(/\.[^.]+$/, '') || 'image';
      const fname = `${stem}.${extName}`;
      savePath = window.electronAPI?.pathJoin
        ? await window.electronAPI.pathJoin(dir, fname)
        : `${dir.replace(/[\\/]+$/, '')}/${fname}`;

      const writeResult = await _runOpWithProgress(async (dlg) => {
        const exported = Editor.exportResizedDataUrl(w, h, mime, fileQ, interp);
        if (!exported) return { success: false, error: 'export' };
        const dataUrl = await _withPhotoInfo(exported, { w, h });
        dlg?.set(55, I18n.t('progress.saving') || 'Saving…');
        return await window.electronAPI.writeFile({ filePath: savePath, dataUrl });
      }, { messageKey: 'progress.saving', kind: 'encode' });

      if (!writeResult || !writeResult.success) {
        await _showError(I18n.t('dialog.save.error') || 'Could not save the file.', writeResult?.error || '');
        return;
      }
      saved = true;
    }

    // Optionally apply the resize to the on-screen image.
    if (apply) {
      await Editor.resizeTo(w, h, { quality: interp });
      if (state.editMode) _ewFit(); else _fitToWindow();
      _updateStatus({ dims: true });
      _updateUndoRedoBtns();
      _markDirty();
    }

    _hideDialog('resize-overlay');

    if (saved) {
      try { await FileTree.refresh({ force: true }); } catch (_) { /* ignore */ }
      _updateStatus({ msg: I18n.t('status.saved') || 'Saved' });
      await _saveRelatedPrompt({
        title: I18n.t('dialog.save.title') || 'Saved',
        message: I18n.t('dialog.save.success') || 'File saved successfully.',
        detail: savePath,
        buttons: [I18n.t('error.ok') || 'OK'],
        defaultId: 0,
        cancelId: 0,
        icon: 'save',
      });
    }
  }

  function _resizeBindOnce() {
    if (_resizeBound) return;
    _resizeBound = true;
    document.querySelectorAll('input[name="resize-mode"]').forEach(r =>
      r.addEventListener('change', _resizeRefreshFields));
    const bindInput = (id, fn) => { document.getElementById(id)?.addEventListener('input', fn); };
    bindInput('resize-percent', _resizeUpdatePreview);
    bindInput('resize-longest', _resizeUpdatePreview);
    bindInput('resize-max-w', _resizeUpdatePreview);
    bindInput('resize-max-h', _resizeUpdatePreview);
    bindInput('resize-width', () => { _resizeSyncLockedField('width'); _resizeUpdatePreview(); });
    bindInput('resize-height', () => { _resizeSyncLockedField('height'); _resizeUpdatePreview(); });
    document.getElementById('resize-lock')?.addEventListener('change', () => { _resizeSyncLockedField('width'); _resizeUpdatePreview(); });
    document.getElementById('resize-format')?.addEventListener('change', _resizeRefreshQualityVisibility);
    const fq = document.getElementById('resize-file-quality');
    fq?.addEventListener('input', () => {
      const v = document.getElementById('resize-file-quality-val');
      if (v) v.textContent = fq.value;
    });
    document.getElementById('resize-browse-dir')?.addEventListener('click', async () => {
      const r = await window.FileDialog?.openFolder();
      if (r && !r.canceled && r.filePath) {
        const el = document.getElementById('resize-dir');
        if (el) el.value = r.filePath;
      }
    });
    document.getElementById('resize-ok')?.addEventListener('click', _resizeConfirm);
    document.getElementById('resize-cancel')?.addEventListener('click', () => _hideDialog('resize-overlay'));
  }

  async function _openResizeDialog() {
    if (!_isEditableImage()) return;
    if (Editor.hasSelection && Editor.hasSelection()) Editor.clearSelection?.();
    const { w, h } = _getViewerDims();
    if (!w || !h) return;
    _resizeCtx = { srcW: w, srcH: h, curW: w, curH: h };
    _resizeBindOnce();

    const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
    const setChecked = (id, v) => { const el = document.getElementById(id); if (el) el.checked = v; };

    const percentRadio = document.querySelector('input[name="resize-mode"][value="percent"]');
    if (percentRadio) percentRadio.checked = true;
    setVal('resize-percent', 100);
    setVal('resize-width', w);
    setVal('resize-height', h);
    setVal('resize-longest', Math.max(w, h));
    setVal('resize-max-w', w);
    setVal('resize-max-h', h);
    setChecked('resize-lock', true);
    setChecked('resize-apply', true);
    setVal('resize-interp', 'high');

    const fmt = _resizeDefaultFormat();
    setVal('resize-format', fmt);
    setVal('resize-file-quality', 92);
    const fqLabel = document.getElementById('resize-file-quality-val');
    if (fqLabel) fqLabel.textContent = '92';

    const suffix = (I18n.t('save.resizedSuffix') || 'resized').trim() || 'resized';
    let stem = 'image';
    let dir = '';
    if (state.currentFile) {
      const base = state.currentFile.split(/[/\\]/).pop();
      stem = base.replace(/\.[^.]+$/, '') || 'image';
      if (window.electronAPI?.pathDirname) {
        try { dir = (await window.electronAPI.pathDirname(state.currentFile)) || ''; } catch (_) { /* ignore */ }
      }
    }
    setVal('resize-name', `${stem}_${suffix}`);
    setVal('resize-dir', dir);

    _resizeRefreshQualityVisibility();
    _resizeRefreshFields();
    _showDialog('resize-overlay');
  }

  /* ════════════════════════════════════════════
     Navigation (prev / next)
  ════════════════════════════════════════════ */
  async function _prevImage() {
    // Filmstrip order matches the contact-sheet sort — prefer that when visible.
    if (Browse.isFilmstrip?.() && Browse.stepFilm?.(-1)) return;
    if (state.fileIndex <= 0) return;
    if (state.editMode) {
      const closed = await _requestCloseEditWindow(false);
      if (!closed) return;
    }
    state.fileIndex--;
    _openFile(state.fileList[state.fileIndex]);
  }

  async function _nextImage() {
    if (Browse.isFilmstrip?.() && Browse.stepFilm?.(1)) return;
    if (state.fileIndex >= state.fileList.length - 1) return;
    if (state.editMode) {
      const closed = await _requestCloseEditWindow(false);
      if (!closed) return;
    }
    state.fileIndex++;
    _openFile(state.fileList[state.fileIndex]);
  }

  function _updateNavButtons() {
    const canPrev = state.fileIndex > 0;
    const canNext = state.fileIndex >= 0 && state.fileIndex < state.fileList.length - 1;
    const show = !!state.currentFile;
    _setChromeBtn(document.getElementById('btn-prev'), canPrev);
    _setChromeBtn(document.getElementById('btn-next'), canNext);
    document.querySelectorAll('.viewer-nav-prev').forEach((el) => {
      el.hidden = !show;
      _setChromeBtn(el, canPrev);
    });
    document.querySelectorAll('.viewer-nav-next').forEach((el) => {
      el.hidden = !show;
      _setChromeBtn(el, canNext);
    });
  }

  function _initViewerNavButtons() {
    document.querySelectorAll('.viewer-nav-prev').forEach((el) => {
      el.addEventListener('mousedown', (e) => { e.stopPropagation(); e.preventDefault(); });
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        if (el.classList.contains('is-disabled')) return;
        _prevImage();
      });
    });
    document.querySelectorAll('.viewer-nav-next').forEach((el) => {
      el.addEventListener('mousedown', (e) => { e.stopPropagation(); e.preventDefault(); });
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        if (el.classList.contains('is-disabled')) return;
        _nextImage();
      });
    });
  }

  /* ════════════════════════════════════════════
     Effects Panel   (_editEffectsMinW is declared at the top of the module)
  ════════════════════════════════════════════ */

  function _withEditWindowMeasured(fn) {
    const win = document.getElementById('edit-window');
    if (!win) return fn();
    const temp = !win.classList.contains('visible') && !win.classList.contains('measuring');
    if (temp) win.classList.add('measuring');
    try { return fn(); }
    finally { if (temp) win.classList.remove('measuring'); }
  }

  function _presetPanelMinWidth() {
    const root = document.getElementById('edit-effects-content');
    if (!root) return 260;
    return _withEditWindowMeasured(() => {
      let maxBtn = 0;
      root.querySelectorAll('.preset-btn').forEach((btn) => {
        const label = btn.querySelector('.preset-label');
        const icon = btn.querySelector('.preset-icon');
        const cs = getComputedStyle(btn);
        const pad = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
        const gap = parseFloat(cs.columnGap || cs.gap) || 0;
        const iconW = icon ? Math.max(icon.getBoundingClientRect().width, 16) : 0;
        const labW = label ? Math.max(label.scrollWidth, 0) : 0;
        maxBtn = Math.max(maxBtn, pad + iconW + gap + labW);
      });
      if (!maxBtn) return 260;
      const contentCs = getComputedStyle(root);
      const contentPad = (parseFloat(contentCs.paddingLeft) || 0) + (parseFloat(contentCs.paddingRight) || 0);
      const presets = root.querySelector('.effect-presets');
      const pcs = presets ? getComputedStyle(presets) : null;
      const catPad = pcs ? (parseFloat(pcs.paddingLeft) || 0) + (parseFloat(pcs.paddingRight) || 0) : 12;
      const gridGap = pcs ? (parseFloat(pcs.columnGap || pcs.gap) || 6) : 6;
      return Math.ceil(contentPad + catPad + gridGap + 2 * maxBtn + 16);
    });
  }

  function _applyPresetPanelMinWidth() {
    const panel = document.getElementById('edit-effects-panel');
    if (!panel) return;
    _editEffectsMinW = Math.max(240, _presetPanelMinWidth());
    panel.style.minWidth = `${_editEffectsMinW}px`;
    const saved = parseInt(localStorage.getItem('editEffectsPanelWidth') || '', 10);
    const next = saved >= _editEffectsMinW ? saved : _editEffectsMinW;
    panel.style.width = `${next}px`;
  }

  function _buildEffectsPanel() {
    _buildEffectsPanelIn('effects-content', 'eff');
    if (document.getElementById('edit-effects-content')) {
      _buildEffectsPanelIn('edit-effects-content', 'ew-eff', 'presets');
      _buildEffectsPanelIn('edit-adjust-content', 'ew-eff', 'adjust');
      _ewEffectsBuilt = true;
      requestAnimationFrame(() => _applyPresetPanelMinWidth());
    }
  }

  function _presetRoot(idPrefix) {
    return document.getElementById(idPrefix === 'ew-eff' ? 'edit-effects-content' : 'effects-content');
  }

  function _clearPresetActive(idPrefix) {
    _presetRoot(idPrefix)?.querySelectorAll('.preset-btn').forEach((b) => b.classList.remove('active'));
  }

  async function _applyEffectPreset(id, btn, idPrefix) {
    _clearPresetActive(idPrefix);
    if (btn) btn.classList.add('active');
    const name = I18n.t(`effects.${id}`) || id;
    const msg = (I18n.t('progress.effectNamed') || 'Applying {name}…').replace('{name}', name);
    ProgressDialog.show({
      title: I18n.t('progress.effectTitle') || 'Applying effect',
      message: msg,
      percent: 8,
      modal: true,
    });
    ProgressDialog.startCreep(88);
    await ProgressDialog.yieldFrame();
    await ProgressDialog.yieldFrame();
    try {
      await Editor.applyPreset(id);
      _syncSlidersFromEffects(idPrefix);
      ProgressDialog.set(96);
      await ProgressDialog.yieldFrame();
    } finally {
      ProgressDialog.hide(I18n.t('progress.effectDone') || 'Effect applied.');
    }
  }

  function _buildEffectsPanelIn(containerId, idPrefix, mode = 'all') {
    const content = document.getElementById(containerId);
    if (!content) return;

    const sliders = [
      { key:'exposure',   label:'effects.exposure',   min:-100,max:100, step:1,  def:0 },
      { key:'brightness', label:'effects.brightness', min:0,   max:200, step:1,  def:100 },
      { key:'contrast',   label:'effects.contrast',   min:0,   max:200, step:1,  def:100 },
      { key:'highlights', label:'effects.highlights', min:-100,max:100, step:1,  def:0 },
      { key:'shadows',    label:'effects.shadows',    min:-100,max:100, step:1,  def:0 },
      { key:'saturation', label:'effects.saturation', min:0,   max:200, step:1,  def:100 },
      { key:'vibrance',   label:'effects.vibrance',   min:-100,max:100, step:1,  def:0 },
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
      { id: 'silver',       label: 'effects.silver' },
      { id: 'noir',         label: 'effects.noir' },
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
      { id: 'ektar',        label: 'effects.ektar' },
      { id: 'fuji400h',     label: 'effects.fuji400h' },
      { id: 'superia',      label: 'effects.superia' },
      { id: 'lomochrome',   label: 'effects.lomochrome' },
      /* Slide */
      { id: 'kodachrome',   label: 'effects.kodachrome' },
      { id: 'velvia',       label: 'effects.velvia' },
      { id: 'provia',       label: 'effects.provia' },
      { id: 'slide',        label: 'effects.slide' },
      /* B&W */
      { id: 'trix',         label: 'effects.trix' },
      { id: 'delta3200',    label: 'effects.delta3200' },
      { id: 'tmax100',      label: 'effects.tmax100' },
      /* Instant / toy */
      { id: 'polaroid',     label: 'effects.polaroid' },
      { id: 'sx70',         label: 'effects.sx70' },
      { id: 'instax',       label: 'effects.instax' },
      { id: 'holga',        label: 'effects.holga' },
      { id: 'lomo',         label: 'effects.lomo' },
      { id: 'sprocket',     label: 'effects.sprocket' },
      /* Cinema */
      { id: 'cinestill',    label: 'effects.cinestill' },
      { id: 'vision3500t',  label: 'effects.vision3500t' },
      /* Process */
      { id: 'expired',      label: 'effects.expired' },
      { id: 'expiredcool',  label: 'effects.expiredcool' },
      { id: 'redscale',     label: 'effects.redscale' },
      { id: 'crossprocess', label: 'effects.crossprocess' },
      { id: 'crossfuji',    label: 'effects.crossfuji' },
      { id: 'bleachbypass', label: 'effects.bleachbypass' },
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
      { id: 'amethyst',     label: 'effects.amethyst' },
      { id: 'copper',       label: 'effects.copper' },
      { id: 'denim',        label: 'effects.denim' },
      { id: 'gothic',       label: 'effects.gothic' },
      { id: 'romance',      label: 'effects.romance' },
      { id: 'duotone',      label: 'effects.duotone' },
      { id: 'glitch',       label: 'effects.glitch' },
      { id: 'watercolor',   label: 'effects.watercolor' },
      { id: 'anime',        label: 'effects.anime' },
      { id: 'silhouette',   label: 'effects.silhouette' },
      { id: 'amber',        label: 'effects.amber' },
      { id: 'steel',        label: 'effects.steel' },
      { id: 'push',         label: 'effects.push' },
      { id: 'pull',         label: 'effects.pull' },
      { id: 'midcentury',   label: 'effects.midcentury' },
      { id: 'horror',       label: 'effects.horror' },
      { id: 'miniature',    label: 'effects.miniature' },
      { id: 'gold200',      label: 'effects.gold200' },
      { id: 'diana',        label: 'effects.diana' },
      { id: 'technicolor',  label: 'effects.technicolor' },
      { id: 'overexposed',  label: 'effects.overexposed' },
    ];

    // Group presets into collapsible categories. The flat `presets` array
    // above stays the source of truth for id→label; categories only order and
    // group them. Anything not listed in a category falls into a Misc group so
    // no preset can silently disappear.
    const _labelOf = {};
    presets.forEach((p) => { _labelOf[p.id] = p.label; });

    const PRESET_CATS = [
      { key: 'catFilmColor', ids: ['filmcamera', 'disposable', 'portra', 'ektar', 'fuji400h', 'superia', 'lomochrome', 'gold200'] },
      { key: 'catSlide',     ids: ['kodachrome', 'velvia', 'provia', 'slide'] },
      { key: 'catBW',        ids: ['silver', 'noir', 'trix', 'delta3200', 'tmax100', 'newspaper', 'charcoal', 'ink', 'selenium', 'platinum', 'lith', 'silhouette', 'steel', 'sketch'] },
      { key: 'catInstant',   ids: ['vintage', 'polaroid', 'sx70', 'instax', 'holga', 'lomo', 'sprocket', 'diana'] },
      { key: 'catCinema',    ids: ['cinestill', 'vision3500t', 'tealorange', 'dayfornight', 'horror', 'technicolor'] },
      { key: 'catProcess',   ids: ['expired', 'expiredcool', 'redscale', 'crossprocess', 'crossfuji', 'bleachbypass', 'nightflash', 'halfFrame', 'doubleExp', 'dramatic', 'glitch', 'push', 'pull', 'overexposed'] },
      { key: 'catWarm',      ids: ['warm', 'golden', 'sunset', 'autumn', 'dusk', 'tungsten', 'retro70', 'desert', 'candy', 'summer', 'peach', 'coral', 'copper', 'amber', 'romance', 'midcentury'] },
      { key: 'catCool',      ids: ['cool', 'arctic', 'moonlight', 'fog', 'spring', 'fluorescent', 'retro80', 'underwater', 'forest', 'lavender', 'midnight', 'winter', 'rainy', 'denim', 'amethyst', 'gothic', 'cyberpunk', 'vaporwave'] },
      { key: 'catBasic',     ids: ['vivid', 'pop', 'fade', 'pastel', 'matte', 'soft', 'crisp', 'clarity', 'bleach', 'highkey', 'lowkey', 'muted', 'flat', 'bloom', 'punch', 'documentary'] },
      { key: 'catCreative',  ids: ['neon', 'chrome', 'hdr', 'infrared', 'nightvision', 'thermal', 'dream', 'orton', 'cyanotype', 'watercolor', 'anime', 'comic', 'xray', 'emboss', 'edge', 'duotone', 'blueprint', 'miniature'] },
    ];

    const FX_CAT_ICON = {
      catFilmColor: '<svg viewBox="0 0 24 24"><path d="M18 3H6c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM8 19H6v-2h2v2zm0-4H6v-2h2v2zm0-4H6V9h2v2zm0-4H6V5h2v2zm10 12h-2v-2h2v2zm0-4h-2v-2h2v2zm0-4h-2V9h2v2zm0-4h-2V5h2v2z"/></svg>',
      catSlide:     '<svg viewBox="0 0 24 24"><path d="M1 5h4v14H1V5zm18 0h4v14h-4V5zM7 3h10c1.1 0 2 .9 2 2v14c0 1.1-.9 2-2 2H7c-1.1 0-2-.9-2-2V5c0-1.1.9-2 2-2zm1 3v12l9-6-9-6z"/></svg>',
      catBW:        '<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 18V4a8 8 0 0 1 0 16z"/></svg>',
      catInstant:   '<svg viewBox="0 0 24 24"><path d="M6 3h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5c0-1.1.9-2 2-2zm1 3v8h10V6H7zm2 10h3v2H9v-2z"/></svg>',
      catCinema:    '<svg viewBox="0 0 24 24"><path d="M18 4 20 8h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z"/></svg>',
      catProcess:   '<svg viewBox="0 0 24 24"><path d="M6 2v2h1v3.17A7.002 7.002 0 0 0 5 14c0 3.87 3.13 7 7 7s7-3.13 7-7a7 7 0 0 0-2-4.83V4h1V2H6zm4 2h4v2.1A6.97 6.97 0 0 0 12 6c-.7 0-1.37.1-2 .28V4z"/></svg>',
      catWarm:      '<svg viewBox="0 0 24 24"><path d="M6.76 4.84 5 3.07 3.58 4.5 5.35 6.26l1.41-1.42zM4 10.5H1v2h3v-2zm9-9.95h-2V3.5h2V.55zm7.45 3.91-1.41-1.41-1.79 1.79 1.41 1.41 1.79-1.79zM20 10.5v2h3v-2h-3zm-8-5c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6z"/></svg>',
      catCool:      '<svg viewBox="0 0 24 24"><path d="M12 2 10.5 6H8l2.5 2.2L9.2 12 12 9.8 14.8 12l-1.3-3.8L16 6h-2.5L12 2zm-7 9 1.8 1.2L6 15l3.8-1.3L12 17l2.2-3.3L18 15l-.8-2.8L19 11h-5l-2 3-2-3H5z"/></svg>',
      catBasic:     '<svg viewBox="0 0 24 24"><path d="M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z"/></svg>',
      catCreative:  '<svg viewBox="0 0 24 24"><path d="M12 3a9 9 0 0 0 0 18c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01A1.49 1.49 0 0 1 14.22 16H16a5 5 0 0 0 5-5c0-4.42-4.03-8-9-8zM6.5 12a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm3-4a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm5 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z"/></svg>',
      catMisc:      '<svg viewBox="0 0 24 24"><path d="M12 2 9.2 8.6 2 9.2l5.5 4.8L5.8 21 12 17.3 18.2 21l-1.7-7L22 9.2l-7.2-.6z"/></svg>',
    };

    const _makePresetBtn = (id, catKey) => {
      const label = _labelOf[id] || `effects.${id}`;
      const btn = document.createElement('button');
      btn.className = 'preset-btn';
      btn.dataset.preset = id;
      btn.title = I18n.t(label);
      const icon = document.createElement('span');
      icon.className = 'preset-icon';
      icon.innerHTML = FX_CAT_ICON[catKey] || FX_CAT_ICON.catMisc;
      const lab = document.createElement('span');
      lab.className = 'preset-label';
      lab.setAttribute('data-i18n', label);
      lab.textContent = I18n.t(label);
      btn.appendChild(icon);
      btn.appendChild(lab);
      if (activePreset === id) btn.classList.add('active');
      btn.addEventListener('click', () => { _applyEffectPreset(id, btn, idPrefix); });
      return btn;
    };

    const _addCatSection = (catKey, ids, persist) => {
      if (!ids.length) return;
      const section = document.createElement('div');
      section.className = 'fx-cat';
      section.dataset.cat = catKey;
      if (persist && localStorage.getItem(`fxCat:${catKey}`) === '1') section.classList.add('collapsed');

      const header = document.createElement('button');
      header.type = 'button';
      header.className = 'fx-cat-header';
      header.innerHTML = '<span class="fx-cat-chevron">▾</span>';
      const title = document.createElement('span');
      title.className = 'fx-cat-title';
      title.setAttribute('data-i18n', `effects.${catKey}`);
      title.textContent = I18n.t(`effects.${catKey}`);
      const count = document.createElement('span');
      count.className = 'fx-cat-count';
      count.textContent = ids.length;
      header.appendChild(title);
      header.appendChild(count);
      header.addEventListener('click', () => {
        const collapsed = section.classList.toggle('collapsed');
        if (persist) localStorage.setItem(`fxCat:${catKey}`, collapsed ? '1' : '0');
      });

      const body = document.createElement('div');
      body.className = 'fx-cat-body effect-presets';
      ids.forEach((id) => body.appendChild(_makePresetBtn(id, catKey)));

      section.appendChild(header);
      section.appendChild(body);
      content.appendChild(section);
    };

    const _seen = new Set();
    PRESET_CATS.forEach((cat) => {
      const ids = cat.ids.filter((id) => _labelOf[id]);
      ids.forEach((id) => _seen.add(id));
      _addCatSection(cat.key, ids, true);
    });
    const _rest = presets.filter((p) => !_seen.has(p.id)).map((p) => p.id);
    _addCatSection('catMisc', _rest, false);

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

      slider.addEventListener('input', () => {
        valSpan.textContent = parseFloat(slider.value);
      });
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
      const scroller = slider.closest('#edit-adjust-content, #edit-effects-content, #effects-content, #color-content');
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
      : (efx.borderCaptionFontSize ?? 16);
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
    colorInp.addEventListener('change', () => {
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
      applyOnRelease: true,
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
    fontColorInp.addEventListener('change', () => {
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
    // Contact-sheet selection: open that file first, then enter edit.
    if (!_isEditableImage()) {
      const selected = _browseSelectedImagePath();
      if (!selected) return;
      await _openFile(selected);
      if (!_isEditableImage() && !state.isAnimated) return;
    }
    if (state.editMode) return;

    // Animated GIF/WebP: freeze current frame into the canvas editor
    if (state.isAnimated && !Editor.isLoaded()) {
      const ok = await _rasterizeAnimatedToEditor();
      if (!ok) return;
    }

    // Build the effects panel inside the edit window (first time)
    _buildEditEffectsPanel();

    // Move image-wrapper into edit canvas area
    editCanvasArea.appendChild(imageWrapper);
    // …and the colour wheel to the top of the Adjustments panel
    _moveColorWheel(true);

    editWindow.classList.add('visible');
    state.editMode = true;
    document.body.classList.add('edit-mode');
    _updateMediaControlsVisibility();
    _dicomSyncBar();
    _ewSyncTitle();
    _updateStatus({ zoom: true, dims: true });

    Editor.clearSelection();
    _setTool('pointer');
    _ewSetTool('pointer');
    _ewUpdateSelBtns();
    _updateUndoRedoBtns();
    _refreshBorderCaption();
    // Drop a false "dirty" left by display refreshes so quit / close prompts stay honest.
    if (typeof Editor.canUndo === 'function' && !Editor.canUndo()) _clearDirty();
    state._editDirtyAtOpen = state.isDirty;
    Editor.beginEditSession();

    // Wire icons on first open
    _initEditWindowOnce();

    requestAnimationFrame(() => {
      _syncWindowMinSize({ force: true });
      _ewFit();
    });
  }

  function _editWindowOpen() {
    return !!document.getElementById('edit-window')?.classList.contains('visible');
  }

  let _confirmFinish = null;

  function _appConfirm({
    title = '',
    message = '',
    detail = '',
    buttons = ['OK'],
    defaultId = 0,
    cancelId = buttons.length - 1,
    icon = 'save',
  } = {}) {
    return new Promise((resolve) => {
      const overlay = document.getElementById('confirm-overlay');
      const titleEl = document.getElementById('confirm-title');
      const iconEl = document.getElementById('confirm-title-icon');
      const msgEl = document.getElementById('confirm-message');
      const detailEl = document.getElementById('confirm-detail');
      const footer = document.getElementById('confirm-footer');
      const closeBtn = document.getElementById('confirm-close');
      if (!overlay || !footer) {
        resolve({ response: cancelId, canceled: true });
        return;
      }

      if (titleEl) titleEl.textContent = title;
      if (iconEl) {
        iconEl.dataset.icon = icon;
        iconEl.innerHTML = (window.Icons && Icons[icon]) || iconEl.innerHTML || '';
      }
      if (msgEl) msgEl.textContent = message;
      if (detailEl) {
        const text = String(detail || '').trim();
        detailEl.hidden = !text;
        detailEl.textContent = text;
      }

      footer.replaceChildren();
      let settled = false;
      const finish = (response, canceled) => {
        if (settled) return;
        settled = true;
        _confirmFinish = null;
        overlay.style.display = 'none';
        overlay.classList.remove('visible');
        resolve({ response, canceled: !!canceled });
      };
      _confirmFinish = () => finish(cancelId, true);

      buttons.forEach((label, i) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = label;
        if (i === defaultId) btn.classList.add('primary');
        btn.addEventListener('click', () => finish(i, i === cancelId));
        footer.appendChild(btn);
      });
      closeBtn?.addEventListener('click', _confirmFinish, { once: true });

      overlay.style.display = 'flex';
      overlay.classList.add('visible');
      _resetDialogPos(overlay);
      footer.querySelector('.primary')?.focus();
    });
  }

  async function _saveRelatedPrompt(opts) {
    if (_editWindowOpen() || !window.electronAPI?.showMessageBox) {
      return _appConfirm(opts);
    }
    return window.electronAPI.showMessageBox(opts);
  }

  let _unsavedFinish = null;

  function _fillDataIcons(root) {
    (root || document).querySelectorAll('[data-icon]').forEach((el) => {
      const name = el.dataset.icon;
      if (name && window.Icons && Icons[name] && !el.querySelector('svg')) {
        el.innerHTML = Icons[name];
      }
    });
  }

  function _unsavedPrompt() {
    return new Promise((resolve) => {
      const overlay = document.getElementById('unsaved-overlay');
      if (!overlay) {
        resolve({ response: 2, canceled: true });
        return;
      }
      _fillDataIcons(overlay);
      let settled = false;
      const finish = (response, canceled) => {
        if (settled) return;
        settled = true;
        _unsavedFinish = null;
        overlay.style.display = 'none';
        overlay.classList.remove('visible');
        resolve({ response, canceled: !!canceled });
      };
      _unsavedFinish = () => finish(2, true);
      const bind = (id, response, canceled) => {
        const el = document.getElementById(id);
        if (el) el.onclick = () => finish(response, canceled);
      };
      bind('unsaved-save', 0, false);
      bind('unsaved-dont', 1, false);
      bind('unsaved-cancel', 2, true);
      bind('unsaved-close', 2, true);
      overlay.style.display = 'flex';
      overlay.classList.add('visible');
      _resetDialogPos(overlay);
      document.getElementById('unsaved-save')?.focus();
    });
  }

  let _editClosePrompting = false;

  async function _requestCloseEditWindow(apply) {
    if (!state.editMode && !editWindow.classList.contains('visible')) {
      _closeEditWindow(apply);
      return true;
    }
    if (apply) {
      _closeEditWindow(true);
      return true;
    }
    const changed = !!(Editor.hasEditSessionChanges && Editor.hasEditSessionChanges());
    if (!changed) {
      _closeEditWindow(false);
      return true;
    }
    if (_editClosePrompting) return false;
    _editClosePrompting = true;
    try {
      const result = await _unsavedPrompt();
      if (result.response === 2 || result.canceled) return false;
      if (result.response === 0) {
        const saved = await _saveAs(false, { useChangedName: true });
        if (!saved) return false;
        _closeEditWindow(true);
        return true;
      }
      // "Don't Save" — discard the session; do not prompt again for these edits.
      _closeEditWindow(false);
      return true;
    } finally {
      _editClosePrompting = false;
    }
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
    const dirtyBefore = !!state._editDirtyAtOpen;

    editWindow.classList.remove('visible');
    state.editMode = false;
    document.body.classList.remove('edit-mode');

    // Move image-wrapper back to main viewer container
    viewerContainer.appendChild(imageWrapper);
    _moveColorWheel(false);

    if (apply) {
      Editor.commitEditSession();
      // Only now is the main image considered changed (prompt on app quit if not saved)
      if (hadSessionChanges) _markDirty(true);
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
      // Keep quit-prompt dirty only if the file was already unsaved before this session.
      if (!dirtyBefore) _clearDirty();
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
    _dicomSyncBar();

    requestAnimationFrame(() => {
      _syncWindowMinSize({ force: true });
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
    ['ew-cut',       'cut',         'context.cut',          () => { _ewCut(); }],
    ['ew-copy',      'copy',        'context.copy',         () => { _ewCopy(); }],
    ['ew-bg-remove', 'bgRemove',    'toolbar.bgRemove',     () => { _removeBackground(); }],
    ['ew-crop-sel',  'crop',        'editWindow.cropSel',   () => { _cropToSelection(); }],
    ['ew-clear-sel', 'close',       'editWindow.clearSel',  () => { Editor.clearSelection(); _ewUpdateSelBtns(); }],
    ['ew-rotate-l',  'rotateLeft',  'toolbar.rotateLeft',   () => { _rotate(-90); }],
    ['ew-rotate-r',  'rotateRight', 'toolbar.rotateRight',  () => { _rotate(90); }],
    ['ew-flip-h',    'flipH',       'toolbar.flipH',        () => { _flip('h'); }],
    ['ew-flip-v',    'flipV',       'toolbar.flipV',        () => { _flip('v'); }],
    ['ew-resize',    'resize',      'toolbar.resize',       () => { _openResizeDialog(); }],
    ['ew-print',     'print',       'toolbar.print',        () => { _openPrintPreview(); }],
    ['ew-undo',      'undo',        'editWindow.undo',      () => { _undoEdit(); }],
    ['ew-redo',      'redo',        'editWindow.redo',      () => { _redoEdit(); }],
    ['ew-zoom-in',   'zoomIn',      'toolbar.zoomIn',       () => _ewZoomBy(1.25)],
    ['ew-zoom-out',  'zoomOut',     'toolbar.zoomOut',      () => _ewZoomBy(0.8)],
    ['ew-fit',       'fitWindow',   'toolbar.fitWindow',    () => _ewFit()],
    ['ew-panel-left',  'panelLeft',  _ewLeftPanelTip,       () => _toggleEwLeftPanel()],
    ['ew-panel-right', 'panelRight', _ewRightPanelTip,      () => _toggleEwRightPanel()],
    ['ew-about',     'info',        'menu.about',           () => _showDialog('about-overlay')],
  ];

  function _ewSyncTitle() {
    const el = document.getElementById('edit-window-title');
    if (!el) return;
    const name = state.currentFile ? state.currentFile.split(/[/\\]/).pop() : '';
    el.textContent = name;
    el.title = state.currentFile || '';
  }

  function _applyEditWindowIcons() {
    _ewToolIconMap.forEach(({ id, icon }) => {
      const btn = document.getElementById(id);
      if (btn) btn.innerHTML = Icons[icon] || '';
    });
    _ewActionIconMap.forEach(([id, icon]) => {
      const btn = document.getElementById(id);
      if (btn) btn.innerHTML = Icons[icon] || '';
    });
    document.querySelectorAll('#ew-save .ew-action-icon, #ew-cancel .ew-action-icon, #ew-apply .ew-action-icon').forEach((el) => {
      const name = el.dataset.icon;
      if (name && Icons[name]) el.innerHTML = Icons[name];
    });
    const effectsIcon = document.getElementById('edit-effects-icon');
    if (effectsIcon) effectsIcon.innerHTML = Icons.layers || '';   // not 'effects': it is the same glyph as Adjustments' sliders
    const adjustIcon = document.getElementById('edit-adjust-icon');
    if (adjustIcon) adjustIcon.innerHTML = Icons.sliders || '';
    _applyEwPanelLayout();
  }

  /* ─── Edit window side panels: Presets (left) / Adjustments (right) ─── */
  function _loadEwLayout() {
    try {
      const saved = JSON.parse(localStorage.getItem(EW_LAYOUT_KEY) || '{}');
      if (typeof saved.left === 'boolean') _ewLayout.left = saved.left;
      if (typeof saved.right === 'boolean') _ewLayout.right = saved.right;
    } catch { /* defaults */ }
  }

  function _ewLeftPanelTip()  { return I18n.t(_ewLayout.left ? 'toolbar.collapseLeft' : 'toolbar.expandLeft'); }
  function _ewRightPanelTip() { return I18n.t(_ewLayout.right ? 'toolbar.collapseRight' : 'toolbar.expandRight'); }

  /** Same rule as the viewer: a collapsed panel is a rail with its icon and title, never gone. */
  function _applyEwPanelLayout() {
    document.getElementById('edit-effects-panel')?.classList.toggle('collapsed', !_ewLayout.left);
    document.getElementById('edit-adjust-panel')?.classList.toggle('collapsed', !_ewLayout.right);
    const leftBtn = document.getElementById('ew-effects-collapse-btn');
    if (leftBtn) {
      leftBtn.innerHTML = Icons[_ewLayout.left ? 'chevronLeft' : 'chevronRight'] || '';
      leftBtn.setAttribute('aria-expanded', String(_ewLayout.left));
    }
    const rightBtn = document.getElementById('ew-adjust-collapse-btn');
    if (rightBtn) {
      rightBtn.innerHTML = Icons[_ewLayout.right ? 'chevronRight' : 'chevronLeft'] || '';
      rightBtn.setAttribute('aria-expanded', String(_ewLayout.right));
    }
    document.getElementById('ew-panel-left')?.classList.toggle('active', _ewLayout.left);
    document.getElementById('ew-panel-right')?.classList.toggle('active', _ewLayout.right);
  }

  function _toggleEwLeftPanel(force) {
    _ewLayout.left = typeof force === 'boolean' ? force : !_ewLayout.left;
    try { localStorage.setItem(EW_LAYOUT_KEY, JSON.stringify(_ewLayout)); } catch { /* ignore */ }
    _applyEwPanelLayout();
  }

  function _toggleEwRightPanel(force) {
    _ewLayout.right = typeof force === 'boolean' ? force : !_ewLayout.right;
    try { localStorage.setItem(EW_LAYOUT_KEY, JSON.stringify(_ewLayout)); } catch { /* ignore */ }
    _applyEwPanelLayout();
  }

  function _initEwPanelLayout() {
    _loadEwLayout();
    const leftBtn = document.getElementById('ew-effects-collapse-btn');
    if (leftBtn) {
      Tooltip.attach(leftBtn, _ewLeftPanelTip);
      leftBtn.addEventListener('click', (e) => { e.stopPropagation(); _toggleEwLeftPanel(); });
    }
    const rightBtn = document.getElementById('ew-adjust-collapse-btn');
    if (rightBtn) {
      Tooltip.attach(rightBtn, _ewRightPanelTip);
      rightBtn.addEventListener('click', (e) => { e.stopPropagation(); _toggleEwRightPanel(); });
    }
    // A collapsed rail is one big target: clicking anywhere on it expands the panel
    document.getElementById('edit-effects-panel')
      ?.addEventListener('click', () => { if (!_ewLayout.left) _toggleEwLeftPanel(true); });
    document.getElementById('edit-adjust-panel')
      ?.addEventListener('click', () => { if (!_ewLayout.right) _toggleEwRightPanel(true); });
    _applyEwPanelLayout();
  }

  function _initEditWindowOnce() {
    _applyEditWindowIcons();
    if (_ewInitDone) return;
    _ewInitDone = true;
    _initEditTools();
    _initEwPanelLayout();
    _lockBarScroll(document.getElementById('ew-menubar'));
    _lockBarScroll(document.getElementById('ew-toolbar-row'));

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
      Tooltip.attach(btn, typeof tip === 'function' ? tip : () => I18n.t(tip));
    });

    _syncGuideButtons();
    _syncEditThemeLangBtns();
    const ewZoom = document.getElementById('ew-zoom-display');
    ewZoom?.addEventListener('change', () => {
      const val = parseFloat(ewZoom.value);
      if (!isNaN(val) && val > 0) _ewZoomTo(val / 100);
      else _updateZoomDisplay();
    });
    ewZoom?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') ewZoom.blur();
    });

    document.getElementById('ew-theme')?.addEventListener('click', () => { _nextTheme(); });
    document.getElementById('ew-lang')?.addEventListener('click', () => { _toggleLang(); });
    document.getElementById('ew-settings')?.addEventListener('click', () => { _openSettings(); });
    const ewThemeMenu = document.getElementById('ew-theme-menu');
    if (ewThemeMenu) {
      ewThemeMenu.innerHTML = Icons.caretDown;
      ewThemeMenu.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (ewThemeMenu.classList.contains('is-open')) ContextMenu.hide();
        else _openThemeMenu(ewThemeMenu);
      });
      ewThemeMenu.addEventListener('click', (e) => e.stopPropagation());
    }
    Tooltip.attach(document.getElementById('ew-theme'), _themeButtonTip);
    Tooltip.attach(ewThemeMenu, () => I18n.t('toolbar.themeMenu'));
    Tooltip.attach(document.getElementById('ew-lang'), () => I18n.t('toolbar.lang'));
    Tooltip.attach(document.getElementById('ew-settings'), () => I18n.t('toolbar.settings'));

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
      // Any tool: middle button or Space + drag pans; the pointer tool pans with the left button too
      const panAnyTool = e.button === 1 || (e.button === 0 && window.EditTools?.isSpaceHeld());
      if (Editor.getTool() !== 'pointer' && !panAnyTool) return;
      if (e.button !== 0 && e.button !== 1) return;
      if (e.button === 1) e.preventDefault();
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
        if (window.EditTools?.getActive()) EditTools.refresh();
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

  /** Drawing / retouch tools, crop & straighten, tone / canvas / watermark dialogs (editTools.js). */
  function _initEditTools() {
    if (!window.EditTools) return;
    const statusEl = document.getElementById('ew-status-msg');
    EditTools.init({
      t: (k) => I18n.t(k),
      status: (msg) => { if (statusEl) statusEl.textContent = msg || ''; },
      showDialog: (id) => _showDialog(id),
      dialogOpen: () => [...document.querySelectorAll('.dialog-overlay')].some((el) => el.classList.contains('visible') || el.style.display === 'flex'),
      onToolChange: (id) => {
        ['ew-tool-pointer', 'ew-tool-rect', 'ew-tool-lasso', 'ew-tool-polygon', 'ew-tool-magic'].forEach((bid) => {
          document.getElementById(bid)?.classList.toggle('active', !id && bid === 'ew-tool-pointer');
        });
        const tolWrap = document.getElementById('ew-tolerance-wrap');
        if (tolWrap && id) tolWrap.style.display = 'none';
        editCanvasArea.classList.remove('drag-mode', 'select-mode');
        if (id) {
          editCanvasArea.classList.add('select-mode');
          editCanvasArea.style.cursor = 'default';
        } else {
          editCanvasArea.classList.add('drag-mode');
          editCanvasArea.style.cursor = 'grab';
          selCanvas.style.cursor = 'grab';
        }
        requestAnimationFrame(() => _syncEditChromeMinSize());
      },
      onPixelsChanged: () => { _ewUpdateSelBtns(); _updateUndoRedoBtns(); _updateStatus({ dims: true }); },
      onEffectsChanged: () => { _syncSlidersFromEffects('eff'); _syncSlidersFromEffects('ew-eff'); },
      onSelectionChanged: () => _ewUpdateSelBtns(),
    });
  }

  function _ewSetTool(tool) {
    if (window.EditTools?.getActive()) EditTools.deactivate();
    Editor.setTool(tool);
    ['ew-tool-pointer','ew-tool-rect','ew-tool-lasso','ew-tool-polygon','ew-tool-magic'].forEach(id => {
      document.getElementById(id)?.classList.remove('active');
    });
    const toolBtnMap = { 'pointer':'ew-tool-pointer','rect-select':'ew-tool-rect','lasso':'ew-tool-lasso','polygon':'ew-tool-polygon','magic-wand':'ew-tool-magic' };
    document.getElementById(toolBtnMap[tool])?.classList.add('active');

    const tolWrap = document.getElementById('ew-tolerance-wrap');
    if (tolWrap) tolWrap.style.display = tool === 'magic-wand' ? 'flex' : 'none';
    requestAnimationFrame(() => { _syncEditChromeMinSize(); });

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

  function _ewZoomTo(zoom) {
    _ewZoomBy(zoom / (_ewZoom || 1));
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
      _dicomBarLayout();
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
    try {
      await _runOpWithProgress(async () => {
        const dataUrl = await Editor.cut();
        _ewUpdateSelBtns();
        _updateUndoRedoBtns();
        if (dataUrl) {
          const res = await fetch(dataUrl);
          const blob = await res.blob();
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        }
      }, { messageKey: 'progress.copying', kind: 'clipboard' });
    } catch (e) {
      _showError(I18n.t('error.clipboardCut') || 'Failed to cut to clipboard.', e);
    }
  }

  async function _ewCopy() {
    try {
      await _runOpWithProgress(async () => {
        const dataUrl = await Editor.copySelection();
        if (dataUrl) {
          const res = await fetch(dataUrl);
          const blob = await res.blob();
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        }
      }, { messageKey: 'progress.copying', kind: 'clipboard' });
    } catch (e) {
      _showError(I18n.t('error.clipboardCopy') || 'Failed to copy to clipboard.', e);
    }
  }

  function _showEditContextMenu(x, y) {
    const hasSel = Editor.hasSelection();
    const t = I18n.t.bind(I18n);
    ContextMenu.show(x, y, [
      { icon: Icons.save, label: t('context.save'), shortcut: 'Ctrl+S', action: () => { _save(); } },
      { icon: Icons.saveAs, label: t('context.saveAs'), shortcut: 'Ctrl+Shift+S', action: () => { _saveAsNewFile(); } },
      { separator: true },
      { icon: Icons.rectSelect, label: t('menu.select'), submenu: () => _ewSelectMenuItems() },
      { icon: Icons.saveAs,   label: `${t('sel.saveAs')}…`, disabled: !hasSel, action: () => _saveSelectionAs() },
      { icon: Icons.cut,      label: t('context.cut'),      disabled: !hasSel, action: _ewCut },
      { icon: Icons.copy,     label: t('context.copy'),     disabled: !hasSel, action: _ewCopy },
      { separator: true },
      { icon: Icons.bgRemove, label: t('toolbar.bgRemove'), action: () => { _removeBackground(); } },
      { icon: Icons.fitWindow, label: t('editWindow.cropSel'), disabled: !hasSel, action: () => { _cropToSelection(); } },
      { icon: Icons.close,  label: t('editWindow.clearSel'),disabled: !hasSel, action: () => { Editor.clearSelection(); _ewUpdateSelBtns(); } },
      { separator: true },
      { icon: Icons.rotateLeft,  label: t('menu.rotateLeft'),  action: () => { _rotate(-90); } },
      { icon: Icons.rotateRight, label: t('menu.rotateRight'), action: () => { _rotate(90); } },
      { icon: Icons.flipH,       label: t('menu.flipHorizontal'), action: () => { _flip('h'); } },
      { icon: Icons.flipV,       label: t('menu.flipVertical'),   action: () => { _flip('v'); } },
      { icon: Icons.resize,      label: t('context.resize'),      action: () => { _openResizeDialog(); } },
      { icon: Icons.print,       label: t('menu.print'),          shortcut: 'Ctrl+P', action: () => { _openPrintPreview(); } },
      { separator: true },
      { icon: Icons.undo, label: t('editWindow.undo'), disabled: !Editor.canUndo(), action: () => { _undoEdit(); } },
      { icon: Icons.redo,  label: t('editWindow.redo'), disabled: !Editor.canRedo(), action: () => { _redoEdit(); } },
      { separator: true },
      { icon: Icons.effects, label: t('effects.reset'), action: () => { Editor.resetEffects(); _syncSlidersFromEffects('ew-eff'); document.getElementById('edit-effects-content')?.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active')); } },
      ..._imageFileOsMenuItems(),
    ].filter(Boolean));
  }

  function _buildEditEffectsPanel() {
    _buildEffectsPanelIn('edit-effects-content', 'ew-eff', 'presets');
    _buildEffectsPanelIn('edit-adjust-content', 'ew-eff', 'adjust');
    _ewEffectsBuilt = true;
    requestAnimationFrame(() => _applyPresetPanelMinWidth());
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
  function _markDirty(force) {
    // Edit-window previews are session-local until Apply — don't flag the file unsaved yet
    if (state.editMode && force !== true) return;
    // Editor._render() also hits this callback on load / view refresh. Those are not
    // unsaved edits — only undoable history (or an explicit force after Apply) counts.
    if (force !== true && typeof Editor.canUndo === 'function' && !Editor.canUndo()) return;
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
    const tf = document.getElementById('titlebar-file');
    if (tf) {
      tf.textContent = state.currentFile ? (state.isDirty ? `● ${base}` : base) : '';
      tf.title = state.currentFile || '';
    }
  }

  async function _saveEditedAs(andClose = false) {
    return _saveAs(andClose, { useChangedName: true });
  }

  async function _saveAsNewFile() {
    if (!_isEditableImage()) return false;
    if (Editor.hasSelection && Editor.hasSelection()) {
      await _cropToSelection();
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

  // Formats Editor.exportAsDataUrl can write back in place
  const SAVE_IN_PLACE = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', bmp: 'image/bmp' };

  /** Save (Ctrl+S): overwrite the open file in its own format; anything else goes to Save As. */
  async function _save() {
    if (!_isEditableImage()) return false;
    const filePath = state.currentFile || '';
    const ext = filePath.includes('.') ? filePath.split('.').pop().toLowerCase() : '';
    const format = SAVE_IN_PLACE[ext];
    if (!filePath || !format || state.isAnimated || _isWeb()) return state.editMode ? _saveAsNewFile() : _saveAs();

    const writeResult = await _runOpWithProgress(async (dlg) => {
      const exported = (format === 'image/jpeg' || format === 'image/webp')
        ? Editor.exportAsDataUrl(format, 0.92)
        : Editor.exportAsDataUrl(format);
      if (!exported) return { success: false, error: 'export' };
      const dataUrl = await _withPhotoInfo(exported, Editor.getDimensions());
      dlg?.set(55, I18n.t('progress.saving') || 'Saving…');
      // Our own write must not reload the file (that would drop the edit history)
      _ignoreWatchUntil = Date.now() + 2000;
      const wr = await window.electronAPI.writeFile({ filePath, dataUrl });
      _ignoreWatchUntil = Date.now() + 1000;
      return wr;
    }, {
      messageKey: 'progress.saving',
      kind: 'encode',
      force: _editWindowOpen(),
    });

    if (!writeResult || writeResult.error === 'export') return false;
    if (writeResult.success) {
      _clearDirty();
      _updateStatus({ msg: `${I18n.t('status.saved') || 'Saved'}: ${filePath.split(/[/\\]/).pop()}` });
      return true;
    }
    await _showError(I18n.t('dialog.save.error') || 'Could not save the file.', writeResult.error || '');
    return false;
  }

  /**
   * Edit window ▸ Select menu (and the right-click flyout): the selection tools, saving or
   * copying the selected part, then the selection edits from editTools.js.
   */
  function _ewSelectMenuItems() {
    const t = I18n.t.bind(I18n);
    const has = Editor.isLoaded();
    const hasSel = has && Editor.hasSelection();
    const tool = Editor.getTool();
    const pickTool = (id) => () => _ewSetTool(id);
    return [
      { icon: Icons.rectSelect, label: t('toolbar.toolRect'),    checked: tool === 'rect-select', disabled: !has, action: pickTool('rect-select') },
      { icon: Icons.lasso,      label: t('toolbar.toolLasso'),   checked: tool === 'lasso',       disabled: !has, action: pickTool('lasso') },
      { icon: Icons.polygon,    label: t('toolbar.toolPolygon'), checked: tool === 'polygon',     disabled: !has, action: pickTool('polygon') },
      { icon: Icons.magicWand,  label: t('toolbar.toolMagic'),   checked: tool === 'magic-wand',  disabled: !has, action: pickTool('magic-wand') },
      { separator: true },
      { icon: Icons.saveAs, label: `${t('sel.saveAs')}…`, disabled: !hasSel, action: () => _saveSelectionAs() },
      { icon: Icons.copy,   label: t('context.copy'), shortcut: 'Ctrl+C', disabled: !hasSel, action: () => _ewCopy() },
      { icon: Icons.crop,   label: t('editWindow.cropSel'), disabled: !hasSel, action: () => _cropToSelection() },
      { separator: true },
      ...EditTools.selectMenuItems(),
    ];
  }

  /** File ▸ Batch processing: the selected thumbnails, or every picture in the folder in view. */
  async function _openBatch(paths = null) {
    if (!window.Batch) return;
    if (!_batchReady) {
      _batchReady = true;
      Batch.init({
        t: (k) => I18n.t(k),
        runWithProgress: (fn, opts) => _runOpWithProgress(fn, opts),
        withPhotoInfo: (dataUrl, dims, src) => _withPhotoInfo(dataUrl, dims, src),
        folderImages: async (dir) => (await FileTree.getImageFilesInDir(dir)).filter((p) => FormatSupport.isImage(p) && !FormatSupport.isVideo(p) && !FormatSupport.isAudio(p)),
        drawWatermark: (c, W, H, o) => EditTools.drawWatermark(c, W, H, o),
        showDialog: (id) => _showDialog(id),
        status: (msg) => _updateStatus({ msg }),
        refreshTree: () => FileTree.refresh({ force: true }).catch(() => {}),
        report: (done, failed, dir) => _saveRelatedPrompt({
          title: I18n.t('batch.title'),
          message: `${I18n.t('batch.done')}: ${done.length}${failed.length ? ` · ${I18n.t('batch.failed')}: ${failed.length}` : ''}`,
          detail: failed.length ? failed.slice(0, 12).join('\n') : dir,
          buttons: [I18n.t('error.ok') || 'OK'], defaultId: 0, cancelId: 0, icon: 'save',
        }),
      });
    }
    const selected = paths || (Browse.isVisible?.() ? Browse.getSelectedPaths?.() : []) || [];
    let folder = Browse.getDir?.() || '';
    if (!folder && state.currentFile) folder = await window.electronAPI.pathDirname(state.currentFile).catch(() => '');
    if (!folder && !selected.length) { _updateStatus({ msg: I18n.t('batch.noFolder') }); return; }
    await Batch.open({ selected: selected.length ? selected : (state.currentFile ? [state.currentFile] : []), folder });
  }

  /** Viewer ▸ right-click: open the editor with the rectangle tool, ready to pick the part to save. */
  async function _selectRegionToSave() {
    if (!state.editMode) await _openEditWindow();
    if (!state.editMode) return;
    _ewSetTool('rect-select');
    const msg = document.getElementById('ew-status-msg');
    if (msg) msg.textContent = I18n.t('sel.pickRegionHint');
  }

  /**
   * Save only the selected part as a new file (the picture itself is not changed): what is
   * on screen inside the selection's bounding box, transparent outside a lasso / wand shape.
   */
  async function _saveSelectionAs() {
    if (!Editor.hasSelection?.()) {
      const msg = document.getElementById('ew-status-msg');
      if (msg) msg.textContent = I18n.t('sel.none');
      return false;
    }
    const suffix = (I18n.t('save.selectionSuffix') || 'selection').trim() || 'selection';
    const srcPath = state.currentFile || '';
    const stem = (srcPath.split(/[/\\]/).pop() || 'image').replace(/\.[^.]+$/, '');
    let defaultPath = `${stem}_${suffix}.png`;
    if (srcPath && window.electronAPI?.pathDirname && window.electronAPI?.pathJoin) {
      try {
        const dir = await window.electronAPI.pathDirname(srcPath);
        if (dir) defaultPath = await window.electronAPI.pathJoin(dir, defaultPath);
      } catch (_) { /* name only */ }
    }
    const dlgResult = await window.FileDialog.save({ defaultPath });
    if (!dlgResult || dlgResult.canceled || !dlgResult.filePath) return false;
    const savePath = dlgResult.filePath;
    const ext = savePath.split('.').pop().toLowerCase();
    const format = { jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', bmp: 'image/bmp' }[ext] || 'image/png';
    const quality = (format === 'image/jpeg' || format === 'image/webp')
      ? (Number.isFinite(dlgResult.quality) ? dlgResult.quality : 0.92) : undefined;
    const writeResult = await _runOpWithProgress(async (dlg) => {
      const exported = Editor.exportSelection(format, quality);
      if (!exported) return { success: false, error: 'export' };
      const box = Editor.getSelectionBounds();
      const dataUrl = await _withPhotoInfo(exported, box ? { w: box.w, h: box.h } : {});
      dlg?.set(55, I18n.t('progress.saving') || 'Saving…');
      const wr = await window.electronAPI.writeFile({ filePath: savePath, dataUrl });
      if (wr && wr.success) {
        try { await FileTree.refresh({ force: true }); } catch (_) { /* ignore */ }
      }
      return wr;
    }, { messageKey: 'progress.saving', kind: 'encode', force: _editWindowOpen() });
    if (!writeResult || writeResult.error === 'export') return false;
    if (!writeResult.success) {
      await _showError(I18n.t('dialog.save.error') || 'Could not save the file.', writeResult.error || '');
      return false;
    }
    const name = savePath.split(/[/\\]/).pop();
    _updateStatus({ msg: `${I18n.t('sel.saved')}: ${name}` });
    const msg = document.getElementById('ew-status-msg');
    if (msg) msg.textContent = `${I18n.t('sel.saved')}: ${name}`;
    return true;
  }

  /**
   * The photo information (EXIF: date taken, camera, exposure, GPS …) of the open file,
   * carried into a JPEG / PNG about to be written (a canvas encodes pixels only). The
   * orientation becomes "upright" and the size the saved one; Settings can drop the GPS
   * part or keep nothing. Any problem leaves the image as it was.
   */
  async function _withPhotoInfo(dataUrl, { w, h } = {}, srcPath = state.currentFile) {
    if (!_prefOn('keepExif') || !window.ExifCarry || !srcPath) return dataUrl;
    const m = /^data:(image\/(?:jpeg|png));base64,/.exec(dataUrl || '');
    if (!m) return dataUrl;
    try {
      const src = await window.electronAPI.readFileBytes(srcPath);
      if (!src || src.error) return dataUrl;
      const bin = atob(dataUrl.slice(m[0].length));
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      const res = ExifCarry.carry(out, src instanceof Uint8Array ? src : new Uint8Array(src), {
        width: w, height: h, stripGps: _pref('stripGps') === '1',
      });
      if (res === out) return dataUrl;
      let text = '';
      for (let i = 0; i < res.length; i += 0x8000) text += String.fromCharCode.apply(null, res.subarray(i, i + 0x8000));
      return `data:${m[1]};base64,${btoa(text)}`;
    } catch {
      return dataUrl;
    }
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
    // Export: force the chosen format's extension on the suggested name
    if (opts.ext) defaultPath = defaultPath.replace(/\.[^./\\]+$/, '') + '.' + String(opts.ext).replace(/^\./, '');

    const dlgResult = await window.FileDialog.save({ defaultPath });
    if (!dlgResult || dlgResult.canceled || !dlgResult.filePath) return false;

    const savePath = dlgResult.filePath;
    const ext = savePath.split('.').pop().toLowerCase();
    const fmtMap = { jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', bmp: 'image/bmp' };
    const format  = fmtMap[ext] || 'image/png';
    const quality = (format === 'image/jpeg' || format === 'image/webp')
      ? (Number.isFinite(dlgResult.quality) ? dlgResult.quality : 0.92)
      : undefined;

    const writeResult = await _runOpWithProgress(async (dlg) => {
      const exported = quality !== undefined
        ? Editor.exportAsDataUrl(format, quality)
        : Editor.exportAsDataUrl(format);
      if (!exported) return { success: false, error: 'export' };
      const dataUrl = await _withPhotoInfo(exported, Editor.getDimensions());
      dlg?.set(55, I18n.t('progress.saving') || 'Saving…');
      const wr = await window.electronAPI.writeFile({ filePath: savePath, dataUrl });
      if (wr && wr.success) {
        dlg?.set(90);
        try { await FileTree.refresh({ force: true }); } catch (_) { /* ignore */ }
      }
      return wr;
    }, {
      messageKey: 'progress.saving',
      kind: 'encode',
      force: _editWindowOpen(),
    });

    if (!writeResult || writeResult.error === 'export') return false;
    if (writeResult && writeResult.success) {
      _clearDirty();
      const msg = I18n.t('status.saved') || `Saved: ${savePath.split(/[/\\]/).pop()}`;
      _updateStatus({ msg });
      await _saveRelatedPrompt({
        title: I18n.t('dialog.save.title') || 'Saved',
        message: I18n.t('dialog.save.success') || 'File saved successfully.',
        detail: savePath,
        buttons: [I18n.t('error.ok') || 'OK'],
        defaultId: 0,
        cancelId: 0,
        icon: 'save',
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
    // A video's own size — the editor may still hold the last picture
    if (state.isVideo) {
      const d = _getViewerDims();
      if (d.w && d.h) return d;
    }
    if (Editor.isLoaded() && !state.isVideo && !state.isAudio) {
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

  function _collectInfoSections(filePath, stats, meta, dicomMeta, isOpenFile = false) {
    const isDicom = FormatSupport.isDcm(filePath);
    const fileIsAv = FormatSupport.isVideo(filePath) || FormatSupport.isAudio(filePath);
    const isAv = isOpenFile ? !!(state.isVideo || state.isAudio || fileIsAv) : fileIsAv;
    const tags  = (!isDicom && meta && meta.tags) ? meta.tags : {};
    const basic = (!isDicom && meta && meta.basic) ? meta.basic : {};
    const ext   = FormatSupport.getExtension(filePath).toUpperCase();
    const name  = filePath.split(/[/\\]/).pop();
    const dims  = isOpenFile ? _viewerInfoDims(basic) : { w: Number(basic.width) || 0, h: Number(basic.height) || 0 };
    const w = dims.w || basic.width;
    const h = dims.h || basic.height;
    const shownKeys = new Set(); // keys already presented — skip in "All metadata"

    const fileRows = [];
    _pushRow(fileRows, 'info.name', name);
    _pushRow(fileRows, 'info.size', stats && !stats.error
      ? `${FormatSupport.formatFileSize(stats.size)} (${stats.size.toLocaleString()} B)`
      : null);
    // Dimensions only for visual media (video / images), not pure audio
    const isAudioOnly = (isOpenFile && state.isAudio) || (basic.mediaKind === 'audio' && !basic.hasVideo
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
        : (isOpenFile && state.isVideo && videoEl && Number.isFinite(videoEl.duration) ? videoEl.duration
          : (isOpenFile && state.isAudio && audioEl && Number.isFinite(audioEl.duration) ? audioEl.duration : null));
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
      // Summary keys in display order; each maps to an info.* label (see dicomDecoder buildMeta)
      const ORDER = [
        'patientName', 'patientId', 'patientSex', 'patientBirthDate', 'patientAge',
        'modality', 'sopClass', 'bodyPart', 'studyDate', 'studyTime', 'studyDescription', 'seriesDescription',
        'seriesNumber', 'instanceNumber', 'accessionNumber', 'protocolName', 'patientPosition',
        'manufacturer', 'institution', 'stationName',
        'imageSize', 'frames', 'frameRate', 'photometric', 'bitDepth', 'pixelSpacing', 'sliceThickness', 'sliceLocation',
        'imagePosition', 'imageOrientation', 'window', 'voiLut', 'rescale', 'units', 'presentationLut', 'overlays',
        'transferSyntax', 'lossyCompression',
        'studyInstanceUid', 'seriesInstanceUid', 'sopInstanceUid',
      ];
      const LABEL = { patientName: 'info.patient' };
      const WIDE = new Set(['transferSyntax', 'studyInstanceUid', 'seriesInstanceUid', 'sopInstanceUid', 'voiLut', 'overlays', 'window']);
      const seen = new Set();
      const push = (key) => {
        if (seen.has(key)) return;
        seen.add(key);
        const value = _dumpValue(cleanDicom[key]);
        if (!value) return;
        const labelKey = LABEL[key] || `info.${key}`;
        const label = I18n.t(labelKey);
        dicomRows.push({ label: label && label !== labelKey ? label : _humanizeTagKey(key), value, full: WIDE.has(key) });
      };
      ORDER.forEach(push);
      Object.keys(cleanDicom).forEach(push);
    }

    const dicomTagRows = [];
    if (isDicom && Array.isArray(state.dicomTags)) {
      for (const t of state.dicomTags) {
        if (!t) continue;
        // Sequence items are headers for the nested rows that follow; empty leaf values are skipped
        if (t.item) { dicomTagRows.push({ label: t.name, value: '', full: true, indent: t.depth || 0, item: true }); continue; }
        if (!t.value) continue;
        dicomTagRows.push({ label: `${t.tag} ${t.name}${t.vr ? ` [${t.vr}]` : ''}`, value: t.value, full: true, indent: t.depth || 0 });
      }
    }

    return [
      { titleKey: 'info.section.file',      rows: fileRows },
      { titleKey: 'info.section.media',     rows: mediaRows },
      { titleKey: 'info.section.tags',      rows: tagRows },
      { titleKey: 'info.section.capture',   rows: captureRows },
      { titleKey: 'info.section.location',  rows: locRows },
      { titleKey: 'info.section.dicom',     rows: dicomRows },
      { titleKey: 'info.section.dicomTags', rows: dicomTagRows },
      { titleKey: 'info.section.other',     rows: otherRows },
    ];
  }

  function _renderInfoSections(sections) {
    return sections.map((sec) => {
      if (!sec.rows.length) return '';
      const filterable = sec.titleKey === 'info.section.dicomTags';
      const header = filterable
        ? `<div class="info-section info-section-tags"><span>${_escHtml(I18n.t(sec.titleKey))}</span>
            <input type="search" class="info-filter" placeholder="${_escHtml(I18n.t('info.filterTags'))}" aria-label="${_escHtml(I18n.t('info.filterTags'))}" spellcheck="false"></div>`
        : `<div class="info-section">${_escHtml(I18n.t(sec.titleKey))}</div>`;
      const rows = sec.rows.map((r) =>
        `<tr class="info-row${r.full ? ' info-row-full' : ''}${r.item ? ' info-row-item' : ''}"${filterable ? ` data-search="${_escHtml(`${r.label} ${r.value}`.toLowerCase())}"` : ''}>
          <th class="info-label" scope="row"${r.indent ? ` style="padding-left:${6 + r.indent * 14}px"` : ''}>${_escHtml(r.label)}</th>
          <td class="info-value" title="${_escHtml(r.value)}">${_escHtml(r.value)}</td>
        </tr>`
      ).join('');
      return header + `<table class="info-table${filterable ? ' info-tag-rows' : ''}"><tbody>${rows}</tbody></table>`;
    }).join('');
  }

  // Filter box in the "All DICOM tags" section: hides rows that do not contain the text
  function _initInfoTagFilter() {
    for (const root of [infoContent, document.getElementById('details-content')]) _bindInfoTagFilter(root);
  }

  function _bindInfoTagFilter(root) {
    if (!root) return;
    root.addEventListener('input', (e) => {
      const input = e.target;
      if (!input.classList || !input.classList.contains('info-filter')) return;
      const q = (input.value || '').trim().toLowerCase();
      const wrap = input.closest('.info-section')?.nextElementSibling;
      if (!wrap || !wrap.classList.contains('info-tag-rows')) return;
      wrap.querySelectorAll('.info-row').forEach((row) => {
        row.classList.toggle('is-filtered', !!q && !(row.dataset.search || '').includes(q));
      });
    });
    root.addEventListener('keydown', (e) => {
      if (e.target.classList?.contains('info-filter')) e.stopPropagation();
    });
  }

  async function _readFileMeta(filePath) {
    if (!filePath || FormatSupport.isDcm(filePath)) return null;
    const isAv = FormatSupport.isVideo(filePath) || FormatSupport.isAudio(filePath);
    try {
      if (isAv) {
        if (!window.electronAPI.readMediaMeta) return null;
        const mediaMeta = await window.electronAPI.readMediaMeta(filePath);
        if (mediaMeta?.basic?.error) {
          const { error, ...rest } = mediaMeta.basic;
          mediaMeta.basic = rest;
        }
        return mediaMeta;
      }
      if (window.electronAPI.readImageMeta) return await window.electronAPI.readImageMeta(filePath);
    } catch { /* unreadable */ }
    return null;
  }

  let _metaFlight = null;
  let _metaFlightPath = '';

  async function _ensureImageMeta(filePath, dicomMeta) {
    const fileChanged = state.metaForFile !== filePath;
    if (fileChanged) {
      state.metaForFile = filePath;
      state.imageMeta = null;
      state.dicomMeta = null;
      _metaFlight = null;
    }
    if (dicomMeta !== undefined) {
      state.dicomMeta = FormatSupport.isDcm(filePath) ? _sanitizeDicomMeta(dicomMeta) : null;
    } else if (!FormatSupport.isDcm(filePath)) {
      state.dicomMeta = null;
    }
    if (!fileChanged && state.imageMeta) return state.imageMeta;
    if (!fileChanged && _metaFlight && _metaFlightPath === filePath) {
      await _metaFlight;
      return state.metaForFile === filePath ? state.imageMeta : null;
    }
    const read = _readFileMeta(filePath);
    _metaFlight = read;
    _metaFlightPath = filePath;
    const meta = await read;
    if (_metaFlight === read) _metaFlight = null;
    if (state.metaForFile !== filePath) return meta;
    state.imageMeta = meta;

    const open = !!state.currentFile && _normWatchPath(state.currentFile) === _normWatchPath(filePath);
    if (open && state.imageMeta) {
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

  // Serialised info-panel refresh for media 'loadedmetadata' events (they may fire in bursts)
  let _infoQueue = Promise.resolve();
  let _infoGen = 0;
  function _updateInfoQueue(filePath) {
    _infoQueue = _infoQueue
      .then(() => (state.currentFile === filePath ? _updateInfoPanel(filePath) : undefined))
      .catch((e) => console.warn('Info panel refresh failed:', e));
    return _infoQueue;
  }

  async function _updateInfoPanel(filePath, dicomMeta) {
    const gen = ++_infoGen;
    _queueColorPanelSync();   // a file opened / closed: the right panel follows it
    if (!infoContent) return;
    if (!filePath) {
      if (gen !== _infoGen) return;
      state.imageMeta = null;
      state.dicomMeta = null;
      state.metaForFile = null;
      _histPreview = null;
      infoContent.innerHTML = `<div class="info-no-file" data-i18n="info.noFile">${I18n.t('info.noFile')}</div>`;
      return;
    }
    _loadHistPreview(filePath);

    // Show the file name at once so a contact-sheet click never leaves "no file".
    {
      const name = String(filePath).split(/[/\\]/).pop() || filePath;
      const label = I18n.t('info.name') || 'Name';
      const section = I18n.t('info.section.file') || 'File';
      infoContent.innerHTML =
        `<div class="info-section">${_escHtml(section)}</div>`
        + `<table class="info-table"><tbody>`
        + `<tr class="info-row"><th class="info-label" scope="row">${_escHtml(label)}</th>`
        + `<td class="info-value">${_escHtml(name)}</td></tr>`
        + `</tbody></table>`;
    }

    const isOpenFile = !!state.currentFile &&
      _normWatchPath(state.currentFile) === _normWatchPath(filePath);
    const stats = await window.electronAPI.getFileStats(filePath);
    if (gen !== _infoGen) return;
    const meta = isOpenFile
      ? await _ensureImageMeta(filePath, dicomMeta)
      : await _readFileMeta(filePath);
    if (gen !== _infoGen) return;
    // Overlay live player metrics — but only for the file the player actually holds
    // (the contact sheet previews other files through this same function).
    if (meta && isOpenFile) {
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
    const sections = _collectInfoSections(filePath, stats, meta,
      isOpenFile ? state.dicomMeta : null, isOpenFile);
    if (gen !== _infoGen) return;
    infoContent.innerHTML = _renderInfoSections(sections)
      || `<div class="info-no-file" data-i18n="info.noFile">${I18n.t('info.noFile')}</div>`;
    _reflowInfoPanel();
  }

  function _reflowInfoPanel() {
    if (!infoContent) return;
    requestAnimationFrame(() => {
      const y = infoContent.scrollTop;
      infoContent.scrollTop = y + 1;
      infoContent.scrollTop = y;
    });
  }

  /**
   * Details dialog (context menu "Details", File ▸ File Info, Ctrl+I): every info
   * section as a table, plus a pixel analysis when the file is the one on screen.
   */
  async function _showFileInfoDialog(filePath = state.currentFile) {
    if (!filePath) return;
    const overlay = document.getElementById('details-overlay');
    const content = document.getElementById('details-content');
    if (!overlay || !content) return;

    const isOpenFile = !!state.currentFile &&
      _normWatchPath(state.currentFile) === _normWatchPath(filePath);
    // Reading another file's metadata must not clobber the open file's caches
    const saved = isOpenFile ? null
      : { metaForFile: state.metaForFile, imageMeta: state.imageMeta, dicomMeta: state.dicomMeta };
    let sections;
    try {
      const stats = await window.electronAPI.getFileStats(filePath);
      const meta = isOpenFile ? await _ensureImageMeta(filePath) : await _readFileMeta(filePath);
      sections = _collectInfoSections(filePath, stats, meta, isOpenFile ? state.dicomMeta : null, isOpenFile);
    } finally {
      if (saved) Object.assign(state, saved);
    }

    const analysis = isOpenFile ? _imageStats(_colorSource(), 1024) : null;
    if (analysis) sections = [_analysisSection(analysis), ...sections];
    _detailsSections = sections;

    document.getElementById('details-name').textContent = filePath.split(/[/\\]/).pop();
    document.getElementById('details-path').textContent = filePath;
    content.innerHTML = _renderInfoSections(sections)
      || `<div class="info-no-file">${_escHtml(I18n.t('info.noFile'))}</div>`;

    _fillDataIcons(overlay);
    _showDialog('details-overlay');
    const histWrap = document.getElementById('details-analysis');
    if (histWrap) histWrap.hidden = !analysis;
    // Paint after the dialog has a size, so the canvas matches its CSS box
    if (analysis) requestAnimationFrame(() => _paintHistogram(document.getElementById('details-hist'), analysis));
  }

  function _analysisSection(a) {
    const t = I18n.t.bind(I18n);
    const pct = (n) => `${(n / a.count * 100).toFixed(2)}%`;
    const r = Math.round(a.mean[0]), g = Math.round(a.mean[1]), b = Math.round(a.mean[2]);
    const hex = '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();
    const rows = [
      { label: t('details.meanColor'), value: `R ${r} · G ${g} · B ${b}  (${hex})` },
      { label: t('details.luminance'), value: `${a.mean[3].toFixed(1)} ± ${a.stdY.toFixed(1)}` },
      { label: t('details.lumaRange'), value: `${a.minY} – ${a.maxY}` },
      { label: t('details.clipped'), value: `${pct(a.bins[3][0])} / ${pct(a.bins[3][255])}` },
      { label: t('details.sample'), value: `${a.sampleW} × ${a.sampleH} px` },
    ];
    if (a.transparent) {
      rows.push({ label: t('details.transparent'), value: `${(a.transparent / (a.count + a.transparent) * 100).toFixed(2)}%` });
    }
    return { titleKey: 'details.analysis', rows };
  }

  document.getElementById('details-copy')?.addEventListener('click', () => {
    const name = document.getElementById('details-path')?.textContent || '';
    const text = [name, ...(_detailsSections || []).filter((sec) => sec.rows.length).map((sec) =>
      `${I18n.t(sec.titleKey)}\n${sec.rows.map((r) => `${r.label}: ${r.value}`).join('\n')}`)].join('\n\n');
    navigator.clipboard.writeText(text).catch(() => {});
  });

  /* ════════════════════════════════════════════
     Status Bar
  ════════════════════════════════════════════ */
  function _updateStatus({ filePath, zoom, dims, msg, dicomMeta } = {}) {
    const pct = Math.round(state.zoom * 100);
    const zoomText = `${I18n.t('status.zoom')}: ${pct}%`;
    if (statusZoom) statusZoom.textContent = zoomText;
    const ewZoom = document.getElementById('ew-status-zoom');
    if (ewZoom) ewZoom.textContent = zoomText;

    let dimText = null;
    if (Editor.isLoaded() && !state.isVideo && !state.isAudio) {
      const d = Editor.getDimensions();
      dimText = `${d.w} × ${d.h} ${I18n.t('status.dimensions')}`;
    } else if (state.isAnimated || state.isVideo) {
      const d = _getViewerDims();
      if (d.w && d.h) dimText = `${d.w} × ${d.h} ${I18n.t('status.dimensions')}`;
    }
    if (dimText) {
      if (statusDims) statusDims.textContent = dimText;
      const ewDims = document.getElementById('ew-status-dims');
      if (ewDims) ewDims.textContent = dimText;
    }

    if (statusIdx && state.fileList.length > 0) {
      statusIdx.textContent =
        `${I18n.t('status.index')} ${state.fileIndex + 1} ${I18n.t('status.of')} ${state.fileList.length}`;
    }

    if (state.currentFile) {
      let fmt = FormatSupport.getExtension(state.currentFile).toUpperCase();
      const d = state.dicom;
      if (d) {
        const bits = [];
        if (d.modality) bits.push(d.modality);
        if (d.frames > 1) bits.push(`${I18n.t('dicom.frame')} ${d.state.frame + 1}/${d.frames}`);
        if (d.gray && d.state.voiLut >= 0 && d.voiLuts && d.voiLuts[d.state.voiLut]) bits.push(`LUT ${d.voiLuts[d.state.voiLut].label}`);
        else if (d.gray && Number.isFinite(d.state.wc)) bits.push(`C ${_dicomFmt(d.state.wc)} / W ${_dicomFmt(d.state.ww)}`);
        if (bits.length) fmt += ` · ${bits.join(' · ')}`;
      }
      if (statusFmt) statusFmt.textContent = fmt;
      const ewFmt = document.getElementById('ew-status-format');
      if (ewFmt) ewFmt.textContent = fmt;
    }

    if (msg) {
      if (statusMsg) statusMsg.textContent = msg;
      const ewMsg = document.getElementById('ew-status-msg');
      if (ewMsg) ewMsg.textContent = msg;
    }
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
      _setDicomSession(null);
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
    _resetDialogPos(overlay);
    document.getElementById('error-ok-btn')?.focus();

    return new Promise(resolve => { _errorResolve = resolve; });
  }

  /** Status-bar progress; optional modal for long edit-window work. */
  const ProgressDialog = (() => {
    let _percent = 0;
    let _creepTimer = null;
    let _creepCap = 90;
    let _visible = false;
    let _active = false;
    let _message = '';
    let _modal = false;
    let _doneTimer = null; // leftover timer from a previous finish, if any

    function _elsList() {
      return [
        {
          wrap: document.getElementById('status-progress'),
          message: document.getElementById('status-progress-msg'),
          fill: document.getElementById('status-progress-fill'),
          bar: document.getElementById('status-progress-bar'),
          pct: document.getElementById('status-progress-pct'),
        },
        {
          wrap: document.getElementById('ew-status-progress'),
          message: document.getElementById('ew-status-progress-msg'),
          fill: document.getElementById('ew-status-progress-fill'),
          bar: document.getElementById('ew-status-progress-bar'),
          pct: document.getElementById('ew-status-progress-pct'),
        },
      ].filter((e) => e.wrap);
    }

    function _modalEls() {
      return {
        overlay: document.getElementById('progress-overlay'),
        title: document.getElementById('progress-title'),
        message: document.getElementById('progress-message'),
        fill: document.getElementById('progress-bar-fill'),
        bar: document.getElementById('progress-bar'),
        pct: document.getElementById('progress-percent'),
      };
    }

    function _setModalVisible(on, title) {
      const m = _modalEls();
      if (!m.overlay) return;
      if (on) {
        if (m.title && title) m.title.textContent = title;
        m.overlay.style.display = 'flex';
        m.overlay.classList.add('visible');
        _resetDialogPos(m.overlay);
      } else {
        m.overlay.style.display = 'none';
        m.overlay.classList.remove('visible');
      }
    }

    function _paint(message) {
      const shown = Math.round(_percent);
      if (message != null) _message = message;
      for (const e of _elsList()) {
        if (e.fill) e.fill.style.width = `${shown}%`;
        if (e.pct) e.pct.textContent = `${shown}%`;
        if (e.bar) e.bar.setAttribute('aria-valuenow', String(shown));
        if (e.message) e.message.textContent = _message;
      }
      if (!_modal) return;
      const m = _modalEls();
      if (m.fill) m.fill.style.width = `${shown}%`;
      if (m.pct) m.pct.textContent = `${shown}%`;
      if (m.bar) m.bar.setAttribute('aria-valuenow', String(shown));
      if (m.message) m.message.textContent = _message;
    }

    function _setDoneUi(on) {
      for (const e of _elsList()) e.wrap.classList.toggle('is-done', !!on);
    }

    function _cancelDoneTimer() {
      if (_doneTimer) {
        clearTimeout(_doneTimer);
        _doneTimer = null;
      }
    }

    function _snapFill(widthPct) {
      const fills = _elsList().map((e) => e.fill).filter(Boolean);
      if (_modal) {
        const m = _modalEls();
        if (m.fill) fills.push(m.fill);
      }
      for (const fill of fills) {
        fill.style.transition = 'none';
        fill.style.width = `${widthPct}%`;
        void fill.offsetWidth;
        fill.style.transition = '';
      }
    }

    function dismissModal() {
      _modal = false;
      _setModalVisible(false);
    }

    function enableModal(title) {
      if (_modal) return;
      _modal = true;
      _setModalVisible(true, title || '');
      _paint();
    }

    function show({ title, message, percent, modal } = {}) {
      _cancelDoneTimer();
      stopCreep();
      _percent = 0;
      _active = true;
      _visible = true;
      _modal = !!modal;
      for (const e of _elsList()) {
        e.wrap.hidden = false;
        e.wrap.classList.remove('is-done');
      }
      _setModalVisible(_modal, title || '');
      _snapFill(0);
      set(percent != null ? percent : 0, message || title || '', true);
    }

    /** @param {boolean} [force] allow decreasing (reset) */
    function set(percent, message, force) {
      if (!_active) return;
      _visible = true;
      for (const e of _elsList()) e.wrap.hidden = false;
      const raw = Math.max(0, Math.min(100, Number(percent) || 0));
      _percent = force ? raw : Math.max(_percent, raw);
      _paint(message);
    }

    function hide(resultMessage) {
      stopCreep();
      const list = _elsList();
      const wasShown = _active || _modal || list.some((e) => !e.wrap.hidden);
      _active = false;
      _visible = false;
      if (!wasShown) return;
      const done = resultMessage != null ? resultMessage : (I18n.t('progress.done') || 'Loading Done.');
      _percent = 100;
      _paint(done);
      _setDoneUi(true);
      for (const e of list) e.wrap.hidden = false;
      if (_modal) _setModalVisible(false);
      _modal = false;
    }

    /** Slowly advance toward `cap` while inference runs (no true ORT %). */
    function startCreep(cap = 88) {
      stopCreep();
      _creepCap = cap;
      _creepTimer = setInterval(() => {
        if (!_active || _percent >= _creepCap) return;
        const step = _percent < 50 ? 2.4 : _percent < 75 ? 1.2 : 0.5;
        set(Math.min(_creepCap, _percent + step));
      }, 200);
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

    return { show, set, hide, dismissModal, startCreep, stopCreep, yieldFrame, enableModal, isVisible: () => _visible };
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
    await _transferPathsInto(paths, picked.filePath, mode);
  }

  /** Copy or move the given paths into destDir, refresh the tree and report the outcome. */
  async function _transferPathsInto(paths, destDir, mode) {
    const t = I18n.t.bind(I18n);
    if (!paths?.length || !destDir) return false;
    const isMove = mode === 'move' || mode === 'cut';

    const result = await _runOpWithProgress(async (dlg) => {
      const transfer = await window.electronAPI.transferIntoDir({
        sources: paths,
        destDir,
        mode: isMove ? 'move' : 'copy',
      });
      dlg?.set(88, I18n.t('progress.applying') || 'Applying result…');
      // The contact sheet drops what was moved away / shows what arrived. It is what
      // the user is looking at, so it does not wait for the (slower) tree rebuild.
      await Promise.all([
        FileTree.refresh({ force: true }),
        Browse.isVisible?.() ? Browse.refresh() : null,
      ]);
      return transfer;
    }, {
      messageKey: isMove ? 'progress.moving' : 'progress.copyingFiles',
      delayMs: 200,
      force: paths.length >= 5,
    });

    if (result?.error && !result.results) {
      _updateStatus({
        msg: (t('status.dropError') || 'Error: {msg}').replace('{msg}', result.error),
      });
      return false;
    }

    const done = (result.results || []).filter((r) => r.dest && !r.skipped);
    if (isMove) {
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

    const key = isMove ? 'status.moved' : 'status.copied';
    let msg = (t(key) || '{n}').replace('{n}', String(done.length));
    if (result.errors?.length) msg += ` (${result.errors.length} failed)`;
    _updateStatus({ msg });
    return true;
  }

  /* ─── File clipboard: Explorer-style copy / cut / paste inside the tree ─── */
  let _fileClipboard = { paths: [], mode: 'copy' };

  function _clipboardHasFiles() {
    return _fileClipboard.paths.length > 0;
  }

  function _clipboardSetFiles(paths, mode) {
    const list = (paths || []).filter(Boolean);
    if (!list.length) return;
    _fileClipboard = { paths: list, mode: mode === 'cut' ? 'cut' : 'copy' };
    const key = mode === 'cut' ? 'tree.clipCut' : 'tree.clipCopied';
    _updateStatus({ msg: (I18n.t(key) || '{n}').replace('{n}', String(list.length)) });
  }

  /** Folder a paste lands in: the entry itself when it is a folder, else its parent. */
  async function _pasteTargetDir(entry) {
    if (!entry || !entry.path) return FileTree.getRoot();
    if (entry.isDirectory) return entry.path;
    try { return await window.electronAPI.pathDirname(entry.path); } catch { return FileTree.getRoot(); }
  }

  async function _pasteFilesInto(destDir) {
    if (!destDir || !_clipboardHasFiles()) return;
    const { paths, mode } = _fileClipboard;
    const ok = await _transferPathsInto(paths, destDir, mode);
    if (ok && mode === 'cut') _fileClipboard = { paths: [], mode: 'copy' };
  }

  /** Clipboard items for the tree menus (Explorer order: copy · cut · paste). */
  function _treeClipboardItems(paths, entry) {
    const t = I18n.t.bind(I18n);
    if (window.electronAPI.platform === 'web') return [];
    const n = paths.length;
    const count = n > 1 ? ` (${n})` : '';
    return [
      { separator: true },
      { icon: Icons.copy, label: t('context.copy') + count, shortcut: 'Ctrl+C',
        disabled: !n, action: () => _clipboardSetFiles(paths, 'copy') },
      { icon: Icons.cut, label: t('context.cut') + count, shortcut: 'Ctrl+X',
        disabled: !n, action: () => _clipboardSetFiles(paths, 'cut') },
      { icon: Icons.paste, label: t('context.paste'), shortcut: 'Ctrl+V',
        disabled: !_clipboardHasFiles(),
        action: async () => _pasteFilesInto(await _pasteTargetDir(entry)) },
    ];
  }

  /** Menu for empty space in the tree — paste into the folder currently in view. */
  function _showTreeBlankContextMenu(x, y) {
    const t = I18n.t.bind(I18n);
    const root = FileTree.getRoot();
    const isWeb = window.electronAPI.platform === 'web';
    ContextMenu.show(x, y, [
      { icon: Icons.openFolder, label: t('context.openFolder'), action: () => _pickOpenFolder() },
      !isWeb && { separator: true },
      !isWeb && { icon: Icons.paste, label: t('context.paste'), shortcut: 'Ctrl+V',
        disabled: !_clipboardHasFiles() || !root,
        action: () => _pasteFilesInto(root) },
    ].filter(Boolean));
  }

  /** `paths`: the caller's own selection (the thumbnail view); the explorer's otherwise. */
  function _showTreeContextMenu(entry, x, y, { paths = null } = {}) {
    const t = I18n.t.bind(I18n);
    const isWeb = window.electronAPI.platform === 'web';
    const isDir  = entry.isDirectory;
    const isFile = !isDir;
    const ext = FormatSupport.getExtension(entry.name);
    const isSup = FormatSupport.IMAGE_EXTS.has(ext) || FormatSupport.VIDEO_EXTS.has(ext) || FormatSupport.AUDIO_EXTS.has(ext);

    // Check if multiple items are selected
    const fromBrowse = Array.isArray(paths);
    const multiPaths = fromBrowse ? paths : FileTree.getSelectedPaths();
    const isMulti = multiPaths.length > 1 && multiPaths.some((p) => {
      // treat as multi if right-clicked item is part of selection
      return p === entry.path || (entry.path && p.toLowerCase() === entry.path.toLowerCase());
    });
    // Only files can be opened; folders still go along for copy / move / delete
    const multiFiles = multiPaths.filter((p) => FormatSupport.isSupportedFile(p));
    const exportPaths = isMulti ? multiPaths : [entry.path];
    const printables = (isMulti ? multiPaths : [entry.path]).filter((p) => FormatSupport.isImage?.(p));

    if (isMulti && (isFile || fromBrowse)) {
      // Multi-selection context menu
      ContextMenu.show(x, y, [
        multiFiles.length && { icon: Icons.image, label: `${t('context.openFile')} (${multiFiles.length})`,
          action: async () => { for (const p of multiFiles) await _openFile(p); } },
        _favoriteMenuItemMulti(multiPaths),
        { separator: true },
        { icon: Icons.copy, label: t('tree.copyPath'),
          action: () => navigator.clipboard.writeText(multiPaths.join('\n')).catch(() => {}) },
        !isWeb && { icon: Icons.copy, label: `${t('context.copyToFolder')} (${multiPaths.length})`,
          action: () => _exportSelectionToFolder(multiPaths, 'copy') },
        !isWeb && { icon: Icons.cut, label: `${t('context.moveToFolder')} (${multiPaths.length})`,
          action: () => _exportSelectionToFolder(multiPaths, 'move') },
        ..._treeClipboardItems(multiPaths, entry),
        printables.length && { icon: Icons.print, label: t('menu.print'), shortcut: 'Ctrl+P',
          action: () => _printPath(printables[0]) },
        printables.length && { icon: Icons.batch, label: `${t('batch.title')}… (${printables.length})`,
          action: () => _openBatch(printables) },
        !isWeb && { separator: true },
        !isWeb && { icon: Icons.delete, label: `${t('context.deleteFile')} (${multiPaths.length})`,
          danger: true,
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
            await FileTree.refresh({ force: true });
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
      _favoriteMenuItem(entry.path, isDir),
      { separator: true },
      isFile && isSup && { icon: Icons.save,       label: t('context.saveAs'),        action: async () => { await _openFile(entry.path); _saveAs(); } },
      isFile && FormatSupport.isImage?.(entry.path) && { icon: Icons.print, label: t('menu.print'), shortcut: 'Ctrl+P',
        action: () => _printPath(entry.path) },
      isFile &&          { icon: Icons.copy,       label: t('tree.copyPath'), action: () => navigator.clipboard.writeText(entry.path).catch(() => {}) },
      !isWeb && { icon: Icons.copy, label: t('context.copyToFolder'),
        action: () => _exportSelectionToFolder(exportPaths, 'copy') },
      !isWeb && { icon: Icons.cut, label: t('context.moveToFolder'),
        action: () => _exportSelectionToFolder(exportPaths, 'move') },
      ..._treeClipboardItems(exportPaths, entry),
      !isWeb && { separator: true },
      !isWeb && { icon: Icons.explorer, label: t('context.showInExplorer'), action: () => window.electronAPI.showItemInFolder(entry.path) },
      isFile && { icon: Icons.fileInfo, label: t('context.details'), action: () => _showFileInfoDialog(entry.path) },
      !isWeb && { separator: true },
      !isWeb && !entry.isDrive && { icon: Icons.edit, label: t('context.rename'),
        action: () => _renameEntry(entry.path, isDir) },
      !isWeb && { icon: Icons.delete, label: isDir ? (t('context.deleteFolder') || t('context.deleteFile')) : t('context.deleteFile'),
        danger: true, action: () => _deleteFile(entry.path) },
    ].filter(Boolean));
  }

  async function _printPath(filePath) {
    if (!filePath) return;
    const same = state.currentFile &&
      String(state.currentFile).replace(/\\/g, '/').toLowerCase() ===
      String(filePath).replace(/\\/g, '/').toLowerCase();
    if (!same) await _openFile(filePath);
    _openPrintPreview();
  }

  function _rewriteChildPath(p, fromPath, toPath) {
    if (!p || !fromPath || !toPath) return p;
    const sep = /\\/.test(fromPath) ? '\\' : '/';
    const norm = (s) => String(s).replace(/[/\\]+/g, sep).replace(/[\\/]+$/, '');
    const np = norm(p);
    const nf = norm(fromPath);
    const nt = norm(toPath);
    if (np.toLowerCase() === nf.toLowerCase()) return toPath;
    if (np.toLowerCase().startsWith((nf + sep).toLowerCase())) return nt + np.slice(nf.length);
    return p;
  }

  let _renameFinish = null;

  function _promptRename(currentName, isDir) {
    const t = I18n.t.bind(I18n);
    return new Promise((resolve) => {
      const overlay = document.getElementById('rename-overlay');
      const input = document.getElementById('rename-input');
      const errEl = document.getElementById('rename-error');
      const label = document.getElementById('rename-label');
      const title = document.getElementById('rename-title');
      const iconEl = document.getElementById('rename-title-icon');
      const okBtn = document.getElementById('rename-ok');
      const cancelBtn = document.getElementById('rename-cancel');
      const closeBtn = document.getElementById('rename-close');
      if (!overlay || !input) {
        resolve(null);
        return;
      }
      if (title) title.textContent = t('context.rename');
      if (label) label.textContent = t(isDir ? 'dialog.rename.folder' : 'dialog.rename.file');
      if (iconEl) {
        iconEl.dataset.icon = 'edit';
        iconEl.innerHTML = (window.Icons && Icons.edit) || '';
      }
      if (errEl) { errEl.hidden = true; errEl.textContent = ''; }
      input.value = currentName || '';
      let settled = false;
      const onKey = (e) => {
        if (e.key === 'Enter') { e.preventDefault(); submit(); }
        if (e.key === 'Escape') { e.preventDefault(); finish(null); }
      };
      const cleanup = () => {
        okBtn?.removeEventListener('click', submit);
        cancelBtn?.removeEventListener('click', onCancel);
        closeBtn?.removeEventListener('click', onCancel);
        input.removeEventListener('keydown', onKey);
      };
      const finish = (value) => {
        if (settled) return;
        settled = true;
        cleanup();
        _renameFinish = null;
        overlay.style.display = 'none';
        overlay.classList.remove('visible');
        resolve(value);
      };
      const onCancel = () => finish(null);
      const submit = () => {
        const name = String(input.value || '').trim();
        if (!name || name === '.' || name === '..' || /[\\/:*?"<>|]/.test(name)) {
          if (errEl) {
            errEl.hidden = false;
            errEl.textContent = t('dialog.rename.invalid');
          }
          input.focus();
          input.select();
          return;
        }
        finish(name);
      };
      _renameFinish = onCancel;
      okBtn?.addEventListener('click', submit);
      cancelBtn?.addEventListener('click', onCancel);
      closeBtn?.addEventListener('click', onCancel);
      input.addEventListener('keydown', onKey);
      overlay.style.display = 'flex';
      overlay.classList.add('visible');
      _resetDialogPos(overlay);
      requestAnimationFrame(() => { input.focus(); input.select(); });
    });
  }

  async function _renameEntry(filePath, isDir) {
    if (!filePath || window.electronAPI.platform === 'web') return;
    const t = I18n.t.bind(I18n);
    const currentName = filePath.split(/[/\\]/).pop();
    const nextName = await _promptRename(currentName, isDir);
    if (!nextName || nextName === currentName) return;
    const res = await window.electronAPI.renamePath(filePath, nextName);
    if (!res || res.error) {
      const msg = res?.error === 'exists' ? t('dialog.rename.exists')
        : res?.error === 'Invalid name' ? t('dialog.rename.invalid')
        : (t('dialog.rename.error') + (res?.error ? `\n${res.error}` : ''));
      _showError(msg, null, t('context.rename'));
      return;
    }
    const dest = res.path || filePath;
    FileTree.remapPath?.(filePath, dest);
    if (state.currentFile) state.currentFile = _rewriteChildPath(state.currentFile, filePath, dest);
    if (Array.isArray(state.fileList)) {
      state.fileList = state.fileList.map((p) => _rewriteChildPath(p, filePath, dest));
      state.fileIndex = state.currentFile ? state.fileList.indexOf(state.currentFile) : -1;
    }
    const recents = _getRecentDirs().map((p) => _rewriteChildPath(p, filePath, dest));
    try { localStorage.setItem(RECENT_DIRS_KEY, JSON.stringify(recents)); } catch {}
    _setRecentFiles(_getRecentFiles().map((p) => _rewriteChildPath(p, filePath, dest)));
    _applyFavorites(await window.electronAPI.favoritesRemap?.(filePath, dest));
    const last = localStorage.getItem('lastOpenedDir');
    if (last) {
      const nextLast = _rewriteChildPath(last, filePath, dest);
      localStorage.setItem('lastOpenedDir', nextLast);
      window.electronAPI.setLastOpenDir?.(nextLast);
    }
    if (_watchedDir) {
      const nextWatch = _rewriteChildPath(_watchedDir, filePath, dest);
      if (nextWatch !== _watchedDir) await _watchDir(nextWatch);
    }
    if (_watchedFile) {
      const nextFile = _rewriteChildPath(_watchedFile, filePath, dest);
      if (nextFile !== _watchedFile) await _watchCurrentFile(nextFile);
    }
    await FileTree.refresh({ force: true });
    FileTree.setSelected?.(state.currentFile || dest);
    _updateStatus();
    if (state.currentFile) _updateInfoPanel(state.currentFile);
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

    if (state.editMode) _closeEditWindow(false);

    try {
      await _runOpWithProgress(async () => {
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
        throw new Error(res.error);
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

      await FileTree.refresh({ force: true });

      try {
        const parent = await window.electronAPI.pathDirname(filePath);
        if (parent) _watchDir(parent);
      } catch {}
    }, { messageKey: 'progress.deleting', delayMs: 180 });
    } catch (err) {
      _showError(t('context.deleteFile'), err);
    }
  }

  /* ════════════════════════════════════════════
     Context Menu
  ════════════════════════════════════════════ */
  function _showContextMenu(x, y) {
    const hasImg = _isEditableImage();
    const hasSel = hasImg && Editor.hasSelection();
    const t = I18n.t.bind(I18n);
    const isAv = state.isVideo || state.isAudio;
    const isVideo = !!state.isVideo;
    const isAnim = !!state.isAnimated && !state.editMode;
    const canTransport = isVideo || isAnim;
    const playing = canTransport && _isMediaPlaying();

    const hitMeas = state.dicom && !state.editMode ? _dicomMeasHitTest(x, y) : -1;

    ContextMenu.show(x, y, [
      hitMeas >= 0 && { icon: Icons.delete, label: `${t('dicom.deleteMeasurement')} — ${_dicomMeasLabel(_dicomMeas[hitMeas])}`, danger: true, action: () => _dicomMeasDelete(hitMeas) },
      hitMeas >= 0 && { separator: true },
      canTransport && { icon: Icons.mediaPlay,  label: t('toolbar.play'),  disabled: playing,  shortcut: 'Space', action: () => _playMedia() },
      canTransport && { icon: Icons.mediaPause, label: t('toolbar.pause'), disabled: !playing, shortcut: 'Space', action: () => _pauseMedia() },
      canTransport && { icon: Icons.mediaStop,  label: t('toolbar.stop'),  action: () => _stopMedia() },
      canTransport && { separator: true },
      ..._dicomContextItems(),
      { icon: Icons.openFile,   label: t('context.openFile'),   action: () => _pickOpenFile() },
      { icon: Icons.openFolder, label: t('context.openFolder'), action: () => _pickOpenFolder() },
      ..._imageFileOsMenuItems(),
      state.currentFile && { icon: Icons.fileInfo, label: t('context.details'), shortcut: 'Ctrl+I', action: () => _showFileInfoDialog() },
      { separator: true },
      // Everyday actions stay top-level; transforms, zoom and the rest are grouped in flyouts
      _canStartEdit() && { icon: Icons.edit, label: t('toolbar.edit'), shortcut: 'Ctrl+E', action: _openEditWindow },
      hasImg && { icon: Icons.save,   label: t('context.save'),   shortcut: 'Ctrl+S',       action: () => _save() },
      hasImg && { icon: Icons.saveAs, label: t('context.saveAs'), shortcut: 'Ctrl+Shift+S', action: () => _saveAs() },
      { icon: Icons.print, label: t('menu.print'), shortcut: 'Ctrl+P', disabled: !_canPrint(), action: () => _openPrintPreview() },
      hasImg && { icon: Icons.copy,   label: t('context.copy'),   shortcut: 'Ctrl+C', action: _copyToClipboard },
      hasImg && !isAv && { icon: Icons.rectSelect, label: `${t('sel.pickRegion')}…`, action: () => _selectRegionToSave() },
      hasImg && { icon: Icons.rotateRight, label: t('context.transform'), submenu: () => [
        { icon: Icons.rotateLeft,  label: t('context.rotateLeft'),  shortcut: 'Ctrl+[', action: () => _rotate(-90) },
        { icon: Icons.rotateRight, label: t('context.rotateRight'), shortcut: 'Ctrl+]', action: () => _rotate(90) },
        { icon: Icons.flipH,       label: t('context.flipH'),       action: () => _flip('h') },
        { icon: Icons.flipV,       label: t('context.flipV'),       action: () => _flip('v') },
        { separator: true },
        { icon: Icons.resize,      label: t('context.resize'),      shortcut: 'Ctrl+Shift+R', action: () => _openResizeDialog() },
      ] },
      (hasImg || isVideo) && { icon: Icons.zoomIn, label: t('context.zoomMenu'), submenu: () => [
        { icon: Icons.zoomIn,    label: t('context.zoomIn'),    shortcut: 'Ctrl++', action: () => _zoom(1.25) },
        { icon: Icons.zoomOut,   label: t('context.zoomOut'),   shortcut: 'Ctrl+-', action: () => _zoom(0.8) },
        { icon: Icons.fitWindow, label: t('context.fitWindow'), shortcut: 'Ctrl+0', action: _fitToWindow },
        hasImg && { icon: Icons.actualSize, label: t('context.actualSize'), shortcut: 'Ctrl+1', action: _actualSize },
      ].filter(Boolean) },
      hasImg && { icon: Icons.sliders, label: t('context.more'), submenu: () => [
        { icon: Icons.cut,      label: t('context.cut'),      shortcut: 'Ctrl+X', disabled: !hasSel, action: _cutToClipboard },
        { icon: Icons.bgRemove, label: t('context.bgRemove'), action: _removeBackground },
        { separator: true },
        { icon: Icons.reset,    label: t('context.resetAll'), action: _resetAll },
      ] },
      !isAv && { separator: true },
      { icon: Icons.prev,    label: t('context.prev'), shortcut: '← / Page Up', disabled: state.fileIndex <= 0,                         action: _prevImage },
      { icon: Icons.next,    label: t('context.next'), shortcut: '→ / Page Down', disabled: state.fileIndex >= state.fileList.length - 1, action: _nextImage },
    ].filter(Boolean));
  }

  function _imageFileOsMenuItems() {
    if (window.electronAPI.platform === 'web') return [];
    const t = I18n.t.bind(I18n);
    const hasFile = !!state.currentFile;
    return [
      hasFile && _favoriteMenuItem(state.currentFile, false),
      { icon: Icons.explorer, label: t('context.showInExplorer'), disabled: !hasFile,
        action: () => hasFile && _showInExplorer() },
      { icon: Icons.delete, label: t('context.deleteFile'), danger: true, disabled: !hasFile, shortcut: 'Del',
        action: () => hasFile && _deleteFile(state.currentFile) },
    ];
  }

  async function _showInExplorer() {
    if (!state.currentFile) return;
    await window.electronAPI.showItemInFolder(state.currentFile);
  }

  async function _copyToClipboard() {
    if (!Editor.isLoaded()) return;
    try {
      await _runOpWithProgress(async () => {
        const dataUrl = Editor.exportAsDataUrl('image/png');
        const res = await fetch(dataUrl);
        const blob = await res.blob();
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      }, { messageKey: 'progress.copying', kind: 'clipboard' });
    } catch (e) {
      _showError(I18n.t('error.clipboardCopy') || 'Failed to copy to clipboard.', e);
    }
  }

  async function _cutToClipboard() {
    if (!Editor.hasSelection()) return;
    try {
      await _runOpWithProgress(async () => {
        const dataUrl = await Editor.cut();
        _updateUndoRedoBtns();
        if (dataUrl) {
          const res = await fetch(dataUrl);
          const blob = await res.blob();
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        }
      }, { messageKey: 'progress.copying', kind: 'clipboard' });
    } catch (e) {
      _showError(I18n.t('error.clipboardCut') || 'Failed to cut to clipboard.', e);
    }
  }

  async function _resetAll() {
    if (!_isEditableImage()) return;
    if (Editor.resetAll) await Editor.resetAll();
    else {
      await Editor.resetTransform();
      Editor.resetEffects();
    }
    _syncSlidersFromEffects();
    _syncSlidersFromEffects('ew-eff');
    document.getElementById('effects-content')?.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('edit-effects-content')?.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
    if (state.editMode) _ewFit();
    else _fitToWindow();
  }

  /* ════════════════════════════════════════════
     Theme / Language
  ════════════════════════════════════════════ */
  /** The language button shows the flag of the language it switches TO. */
  function _setLangButtonLabel(btn) {
    if (!btn) return;
    btn.innerHTML = state.lang === 'ko' ? Icons.flagUs : Icons.flagKo;
  }

  function _syncEditThemeLangBtns() {
    for (const id of ['btn-theme', 'ew-theme']) {
      const btn = document.getElementById(id);
      if (btn) btn.innerHTML = Icons.palette;
    }
    const ewSettings = document.getElementById('ew-settings');
    if (ewSettings) ewSettings.innerHTML = Icons.settings;
    _setLangButtonLabel(document.getElementById('ew-lang'));
    _setLangButtonLabel(document.getElementById('btn-lang'));
    _syncSettingsDialog();
  }

  function _themeButtonTip() {
    return `${I18n.t('toolbar.theme')} (${I18n.t('toolbar.themeCurrent')}: ${Themes.label(state.theme, I18n.t.bind(I18n))})`;
  }

  function _applyTheme(theme) {
    if (theme === 'custom') {
      _applyCustomTheme(_readCustomTheme());
      return;
    }
    const id = Themes.normalize(theme);
    document.documentElement.setAttribute('data-theme', id);
    document.documentElement.setAttribute('data-theme-kind', Themes.kindOf(id));
    state.theme = id;
    localStorage.setItem('theme', id);
    _syncEditThemeLangBtns();
    _syncMenu();
    _syncSettingsThemeButtons();
    _syncThemePickerButtons();
  }


  function _readCustomTheme() {
    try {
      const o = JSON.parse(localStorage.getItem(CUSTOM_THEME_KEY) || '');
      if (o && /^#[0-9a-fA-F]{6}$/.test(o.bg) && /^#[0-9a-fA-F]{6}$/.test(o.text) && /^#[0-9a-fA-F]{6}$/.test(o.accent)) {
        return { bg: o.bg, text: o.text, accent: o.accent };
      }
    } catch { /* defaults */ }
    return { ...CUSTOM_THEME_DEFAULT };
  }

  function _hexRgb(hex) {
    const n = parseInt(String(hex).slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function _rgbHex(r, g, b) {
    const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
    return `#${c(r)}${c(g)}${c(b)}`;
  }

  function _mixHex(a, b, t) {
    const A = _hexRgb(a);
    const B = _hexRgb(b);
    return _rgbHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
  }

  function _lum(hex) {
    const [r, g, b] = _hexRgb(hex);
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  }

  function _writeCustomThemeStyle(colors) {
    const { bg, text, accent } = colors;
    const light = _lum(bg) > 0.62;
    const bg1 = _mixHex(bg, text, light ? 0.03 : 0.06);
    const bg2 = _mixHex(bg, text, light ? 0.08 : 0.12);
    const bar = _mixHex(bg, text, light ? 0.05 : 0.16);
    const side = _mixHex(bg, text, light ? 0.02 : 0.04);
    const border = _mixHex(bg, text, light ? 0.18 : 0.22);
    const text2 = _mixHex(text, bg, 0.28);
    const muted = _mixHex(text, bg, 0.5);
    const selected = _mixHex(bg, accent, light ? 0.22 : 0.35);
    const selectedOff = _mixHex(bg, text, light ? 0.08 : 0.1);
    const viewer = _mixHex(bg, '#000000', light ? 0.04 : 0.15);
    const checker1 = _mixHex(viewer, text, 0.08);
    const checker2 = _mixHex(viewer, text, 0.14);
    let style = document.getElementById('custom-theme-style');
    if (!style) {
      style = document.createElement('style');
      style.id = 'custom-theme-style';
      document.head.appendChild(style);
    }
    style.textContent = `[data-theme="custom"]{--t-bg0:${bg};--t-bg1:${bg1};--t-bg2:${bg2};--t-bar:${bar};--t-side:${side};--t-border:${border};--t-text:${text};--t-text2:${text2};--t-muted:${muted};--t-accent:${accent};--t-link:${accent};--t-selected:${selected};--t-selected-inactive:${selectedOff};--t-status:${accent};--t-img-icon:${accent};--t-dir-icon:${_mixHex(accent, '#e8b84a', 0.4)};--t-danger:#e05a5a;--t-success:#3ecf8e;--t-viewer:${viewer};--t-checker1:${checker1};--t-checker2:${checker2};}`;
  }

  function _applyCustomTheme(colors) {
    const next = {
      bg: colors?.bg || CUSTOM_THEME_DEFAULT.bg,
      text: colors?.text || CUSTOM_THEME_DEFAULT.text,
      accent: colors?.accent || CUSTOM_THEME_DEFAULT.accent,
    };
    try { localStorage.setItem(CUSTOM_THEME_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    _writeCustomThemeStyle(next);
    document.documentElement.setAttribute('data-theme', 'custom');
    document.documentElement.setAttribute('data-theme-kind', _lum(next.bg) > 0.62 ? 'light' : 'dark');
    state.theme = 'custom';
    try { localStorage.setItem('theme', 'custom'); } catch { /* ignore */ }
    _syncEditThemeLangBtns();
    _syncMenu();
    _syncSettingsThemeButtons();
    _syncThemePickerButtons();
    _syncCustomThemeInputs();
  }

  function _customFrom(root) {
    const read = (key) => root?.querySelector?.(`[data-custom="${key}"]`)?.value;
    return { bg: read('bg'), text: read('text'), accent: read('accent') };
  }

  function _syncCustomThemeInputs() {
    const colors = _readCustomTheme();
    document.querySelectorAll('[data-custom="bg"]').forEach((el) => { el.value = colors.bg; });
    document.querySelectorAll('[data-custom="text"]').forEach((el) => { el.value = colors.text; });
    document.querySelectorAll('[data-custom="accent"]').forEach((el) => { el.value = colors.accent; });
  }

  function _bindCustomTheme(root) {
    root?.querySelector('[data-custom-apply]')?.addEventListener('click', () => {
      _applyCustomTheme(_customFrom(root));
    });
    root?.querySelector('[data-custom-reset]')?.addEventListener('click', () => {
      _applyCustomTheme(CUSTOM_THEME_DEFAULT);
    });
  }

  /** Palette button: step to the next theme in the list (10 dark, then 10 light, wrapping). */
  function _nextTheme() {
    if (state.theme === 'custom') {
      _applyTheme(Themes.default);
      return;
    }
    _applyTheme(Themes.next(state.theme));
  }

  /** ▾ button: the themes as a drop-down under the button (drawn by the menu overlay, so not clipped by the window). */
  function _openThemeMenu(btn) {
    if (!btn) { _openThemePicker(); return; }
    const r = btn.getBoundingClientRect();
    btn.classList.add('is-open');
    ContextMenu.show(r.left, r.bottom + 2, _themeMenuItems(), {
      onHide: () => btn.classList.remove('is-open'),
    });
  }

  /** Custom theme… and Theme settings… on top, then the Dark and Light themes side by side. */
  function _themeMenuItems() {
    const t = I18n.t.bind(I18n);
    const kind = (k) => Themes.ofKind(k).map((th) => ({
      icon: Themes.swatchSvg(th.id),
      label: Themes.label(th.id, t),
      checked: state.theme === th.id,
      action: () => _applyTheme(th.id),
    }));
    return [
      // Applied at once: the saved colours, or the preset; Theme settings… edits them
      { icon: _customThemeSwatch(), label: t('theme.custom'), checked: state.theme === 'custom', action: () => _applyCustomTheme(_readCustomTheme()) },
      { icon: Icons.settings, label: `${t('menu.themeSettings')}…`, action: () => _openThemeSettings() },
      { separator: true },
      { columns: [
        { title: t('menu.darkThemes'), items: kind('dark') },
        { title: t('menu.lightThemes'), items: kind('light') },
      ] },
    ];
  }

  /** The menu swatch of the custom theme, drawn like Themes.swatchSvg. */
  function _customThemeSwatch() {
    const { bg, text, accent } = _readCustomTheme();
    const bar = _mixHex(bg, text, _lum(bg) > 0.62 ? 0.05 : 0.16);
    return `<svg viewBox="0 0 16 16" class="theme-swatch"><rect x="1" y="2" width="14" height="12" rx="2" fill="${bg}"/>`
      + `<rect x="1" y="2" width="14" height="4" rx="2" fill="${bar}"/><rect x="1" y="5" width="14" height="1" fill="${bar}"/>`
      + `<circle cx="11.5" cy="10.5" r="2" fill="${accent}"/>`
      + `<rect x="1.5" y="2.5" width="13" height="11" rx="1.5" fill="none" stroke="rgba(128,128,128,.6)" stroke-width="1"/></svg>`;
  }

  /** Settings, opened on its Theme tab. */
  function _openThemeSettings() {
    _openSettings();
    _settingsSelectTab('theme');
  }

  function _openThemePicker() {
    _fillThemePicker();
    _syncCustomThemeInputs();
    _syncThemePickerButtons();
    _showDialog('theme-picker-overlay');
  }

  function _fillThemeHost(host, kind) {
    if (!host || host.childElementCount) return;
    const t = I18n.t.bind(I18n);
    for (const th of Themes.ofKind(kind)) {
      const [bg, bar, accent] = th.swatch;
      const name = Themes.label(th.id, t);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = host.id.startsWith('theme-picker') ? 'theme-picker-item' : 'settings-theme-btn';
      btn.dataset.theme = th.id;
      btn.title = name;
      const preview = document.createElement('span');
      preview.className = host.id.startsWith('theme-picker') ? 'theme-picker-swatch' : 'settings-theme-preview';
      preview.style.setProperty('--sw-bg', bg);
      preview.style.setProperty('--sw-bar', bar);
      preview.style.setProperty('--sw-accent', accent);
      const label = document.createElement('span');
      label.className = host.id.startsWith('theme-picker') ? 'theme-picker-name' : 'settings-theme-name';
      label.textContent = name;
      btn.append(preview, label);
      btn.addEventListener('click', () => _applyTheme(th.id));
      host.appendChild(btn);
    }
  }

  function _fillThemePicker() {
    _fillThemeHost(document.getElementById('theme-picker-dark'), 'dark');
    _fillThemeHost(document.getElementById('theme-picker-light'), 'light');
    const t = I18n.t.bind(I18n);
    for (const id of ['theme-picker-dark', 'theme-picker-light']) {
      document.getElementById(id)?.querySelectorAll('[data-theme]').forEach((btn) => {
        const name = Themes.label(btn.dataset.theme, t);
        btn.title = name;
        const label = btn.querySelector('.theme-picker-name');
        if (label) label.textContent = name;
      });
    }
  }

  function _syncThemePickerButtons() {
    document.querySelectorAll('#theme-picker-overlay [data-theme]').forEach((btn) => {
      btn.classList.toggle('is-on', btn.dataset.theme === state.theme);
    });
  }

  async function _toggleLang() {
    state.lang = state.lang === 'en' ? 'ko' : 'en';
    localStorage.setItem('lang', state.lang);
    await _refreshLang();
  }

  async function _setLang(lang) {
    if (lang !== 'ko' && lang !== 'en') return;
    if (state.lang === lang) return;
    state.lang = lang;
    localStorage.setItem('lang', lang);
    await _refreshLang();
  }

  /* ─── Settings dialog (theme · language · bg-removal algorithm · subtitles) ─── */
  function _initSettingsDialog() {
    document.querySelectorAll('#settings-overlay .settings-lang-btn').forEach((btn) => {
      const flag = btn.querySelector('.settings-lang-flag');
      if (flag) flag.innerHTML = btn.dataset.lang === 'ko' ? Icons.flagKo : Icons.flagUs;
      btn.addEventListener('click', () => _setLang(btn.dataset.lang));
    });
    const algoSel = document.getElementById('settings-bg-algo');
    if (algoSel) {
      algoSel.addEventListener('change', () => {
        localStorage.setItem('bgRemoveAlgo', algoSel.value);
        const ewSel = document.getElementById('ew-bg-algo');
        if (ewSel) ewSel.value = algoSel.value;
      });
    }
    const subs = document.getElementById('settings-subtitles');
    if (subs) {
      subs.addEventListener('change', () => {
        state.subtitlesEnabled = subs.checked;
        try { localStorage.setItem('subtitlesEnabled', subs.checked ? '1' : '0'); } catch {}
        _syncSubtitleControls();
      });
    }
    const subLang = document.getElementById('settings-subtitle-lang');
    if (subLang) {
      subLang.addEventListener('change', () => {
        state.subtitleLang = subLang.value;
        try { localStorage.setItem('subtitleLanguage', subLang.value); } catch {}
        if (subLang.value && state.subtitles.some((sub) => sub.lang === subLang.value)) _setSubtitleLanguage(subLang.value);
      });
    }
    const vol = document.getElementById('settings-volume');
    const volLabel = document.getElementById('settings-volume-label');
    const mute = document.getElementById('settings-mute');
    vol?.addEventListener('input', () => {
      _setMediaVolume(vol.value);
      if (volLabel) volLabel.textContent = `${vol.value}%`;
      if (mute) mute.checked = _mediaMuted || _mediaVolume <= 0;
    });
    mute?.addEventListener('change', () => {
      if (mute.checked !== (_mediaMuted || _mediaVolume <= 0)) _toggleMediaMute();
      _syncSettingsDialog();
    });
    // Startup & history
    const restore = document.getElementById('settings-restore-session');
    restore?.addEventListener('change', () => _setPref('restoreSession', restore.checked ? '1' : '0'));
    document.getElementById('settings-show-home')?.addEventListener('change', (e) => {
      _saveStartScreen({ showOnStart: e.target.checked });
    });
    document.getElementById('settings-start-scene')?.addEventListener('change', (e) => {
      _saveStartScreen({ scene: e.target.value });
    });
    document.querySelectorAll('#settings-overlay [data-start-key]').forEach((el) => {
      const val = document.getElementById(`${el.id}-val`);
      const paint = () => { if (val) val.textContent = `${el.value}%`; };
      el.addEventListener('sync-label', paint);
      el.addEventListener('input', () => {
        paint();
        if (_startSyncing) return;
        _saveStartScreen({ [el.dataset.startKey]: Number(el.value) });
      });
      el.closest('.settings-start-ctrl')?.querySelectorAll('[data-start-step]').forEach((btn) => {
        btn.addEventListener('click', () => _nudgeStartRange(el, Number(btn.dataset.startStep)));
      });
    });
    document.getElementById('settings-clear-recent')?.addEventListener('click', async () => {
      await _clearRecentFolderHistory();
      _syncSettingsDialog();
    });
    document.getElementById('settings-clear-thumbs')?.addEventListener('click', async () => {
      await Thumbs.clearDiskCache();
      _refreshThumbCacheSize();
      // The open folder starts filling again in the background
      const dir = Browse.getDir?.() || FileTree.getRoot?.();
      if (dir) Thumbs.prefetchDir(dir);
    });
    document.getElementById('settings-set-default')?.addEventListener('click', () => _setAsDefaultImageViewer());
    document.getElementById('settings-open-default-apps')?.addEventListener('click', async () => {
      if (window.electronAPI.openDefaultAppsSettings) {
        await window.electronAPI.openDefaultAppsSettings();
      }
    });
    // Viewer
    const zoomStep = document.getElementById('settings-zoom-step');
    zoomStep?.addEventListener('change', () => _setPref('zoomStep', zoomStep.value));
    const checker = document.getElementById('settings-checker');
    checker?.addEventListener('change', () => { _setPref('viewerChecker', checker.checked ? '1' : '0'); _applyViewerPrefs(); });
    const smoothing = document.getElementById('settings-smoothing');
    smoothing?.addEventListener('change', () => { _setPref('imageSmoothing', smoothing.checked ? '1' : '0'); _applyViewerPrefs(); });
    const keepExif = document.getElementById('settings-keep-exif');
    const stripGps = document.getElementById('settings-strip-gps');
    keepExif?.addEventListener('change', () => { _setPref('keepExif', keepExif.checked ? '1' : '0'); if (stripGps) stripGps.disabled = !keepExif.checked; });
    stripGps?.addEventListener('change', () => _setPref('stripGps', stripGps.checked ? '1' : '0'));
    // DICOM
    const annot = document.getElementById('settings-dicom-annot');
    annot?.addEventListener('change', () => { if (annot.checked !== _dicomAnnotOn) _dicomToggleAnnotations(); });
    const fps = document.getElementById('settings-dicom-fps');
    fps?.addEventListener('change', () => {
      const v = Math.max(1, Math.min(120, parseInt(fps.value, 10) || 10));
      fps.value = String(v);
      _setPref('dicomDefaultFps', v);
      _dicomSyncBar();
    });
    const ovColor = document.getElementById('settings-dicom-overlay-color');
    const applyOverlayColor = (value) => {
      _setPref('dicomOverlayColor', value);
      if (ovColor) ovColor.value = value;
      if (state.dicom && state.dicom.overlays && state.dicom.overlays.length) _dicomApply({ overlayColor: _dicomOverlayRgb() });
    };
    ovColor?.addEventListener('change', () => applyOverlayColor(ovColor.value));
    document.getElementById('settings-dicom-overlay-reset')?.addEventListener('click', () => applyOverlayColor(PREF_DEFAULTS.dicomOverlayColor));
    document.getElementById('settings-reset')?.addEventListener('click', _resetAllSettings);
    _bindCustomTheme(document.getElementById('settings-custom-theme'));
    _bindCustomTheme(document.getElementById('theme-picker-custom'));
    _syncCustomThemeInputs();
    // Tabs: one panel at a time (the dialog is fixed-size and never scrolls)
    document.querySelectorAll('#settings-overlay .settings-tab').forEach((tab) => {
      tab.addEventListener('click', () => _settingsSelectTab(tab.dataset.tab));
    });
    _applyViewerPrefs();
    _settingsReady = true;
    _syncSettingsDialog();
  }

  function _settingsSelectTab(id) {
    document.querySelectorAll('#settings-overlay .settings-tab').forEach((tab) => {
      const on = tab.dataset.tab === id;
      tab.classList.toggle('active', on);
      tab.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    document.querySelectorAll('#settings-overlay .settings-panel').forEach((panel) => panel.classList.toggle('active', panel.dataset.panel === id));
  }

  /** Viewer options that are plain CSS switches. */
  function _applyViewerPrefs() {
    viewerContainer?.classList.toggle('no-checker', !_prefOn('viewerChecker'));
    imageWrapper?.classList.toggle('pixelated', !_prefOn('imageSmoothing'));
  }

  async function _resetAllSettings() {
    const t = I18n.t.bind(I18n);
    const result = await window.electronAPI.showMessageBox({
      type: 'warning',
      title: t('settings.resetAll'),
      message: t('settings.resetConfirm'),
      buttons: [t('settings.resetYes'), t('dialog.unsaved.cancel') || 'Cancel'],
      defaultId: 1,
      cancelId: 1,
    });
    if (!result || result.response !== 0) return;
    for (const key of PREF_KEYS) { try { localStorage.removeItem(key); } catch { /* ignore */ } }
    window.location.reload();
  }

  /** Build / refresh the Theme tab color buttons (one per registered theme). */
  function _fillSettingsThemeButtons() {
    const t = I18n.t.bind(I18n);
    for (const kind of ['dark', 'light']) {
      const host = document.getElementById(`settings-theme-${kind}`);
      if (!host) continue;
      host.setAttribute('role', 'radiogroup');
      host.setAttribute('aria-label', t(kind === 'dark' ? 'menu.darkThemes' : 'menu.lightThemes'));
      if (!host.childElementCount) {
        for (const th of Themes.ofKind(kind)) {
          const [bg, bar, accent] = th.swatch;
          const name = Themes.label(th.id, t);
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'settings-theme-btn';
          btn.dataset.theme = th.id;
          btn.title = name;
          btn.setAttribute('role', 'radio');
          btn.setAttribute('aria-checked', th.id === state.theme ? 'true' : 'false');
          const preview = document.createElement('span');
          preview.className = 'settings-theme-preview';
          preview.style.setProperty('--sw-bg', bg);
          preview.style.setProperty('--sw-bar', bar);
          preview.style.setProperty('--sw-accent', accent);
          const label = document.createElement('span');
          label.className = 'settings-theme-name';
          label.textContent = name;
          btn.append(preview, label);
          btn.addEventListener('click', () => _applyTheme(th.id));
          host.appendChild(btn);
        }
      } else {
        host.querySelectorAll('.settings-theme-btn').forEach((btn) => {
          const name = Themes.label(btn.dataset.theme, t);
          btn.title = name;
          const label = btn.querySelector('.settings-theme-name');
          if (label) label.textContent = name;
        });
      }
    }
    _syncSettingsThemeButtons();
  }

  function _syncSettingsThemeButtons() {
    document.querySelectorAll('#settings-overlay .settings-theme-btn').forEach((btn) => {
      const on = btn.dataset.theme === state.theme;
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-checked', on ? 'true' : 'false');
    });
  }

  /** Refill the settings controls from the current state (called on open, theme/lang change). */
  /** Settings ▸ General: how much the per-directory thumbnail cache holds. */
  async function _refreshThumbCacheSize() {
    const row = document.getElementById('settings-thumb-cache-row');
    const out = document.getElementById('settings-thumb-cache-size');
    if (!row || !out) return;
    const st = await Thumbs.diskStats();
    row.hidden = !st;   // web mode keeps thumbnails in memory only
    if (!st || st.error) return;
    const mb = st.bytes / (1024 * 1024);
    out.textContent = (I18n.t('settings.thumbCacheSize') || '{n} thumbnails · {folders} folders · {size}')
      .replace('{n}', String(st.files))
      .replace('{folders}', String(st.folders))
      .replace('{size}', mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.round(st.bytes / 1024)} KB`);
    document.getElementById('settings-clear-thumbs')?.toggleAttribute('disabled', !st.files);
  }

  function _syncSettingsDialog() {
    if (!_settingsReady) return;
    const t = I18n.t.bind(I18n);
    _fillSettingsThemeButtons();
    _fillThemePicker();
    _syncCustomThemeInputs();

    document.querySelectorAll('#settings-overlay .settings-lang-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.lang === state.lang);
    });

    const algoSel = document.getElementById('settings-bg-algo');
    if (algoSel) {
      const current = localStorage.getItem('bgRemoveAlgo') || 'rembg1';
      algoSel.innerHTML = '';
      for (const id of Editor.listBgAlgorithms()) {
        const opt = document.createElement('option');
        opt.value = id;
        opt.textContent = t(`bgAlgo.${id}`) || id;
        if (id === current) opt.selected = true;
        algoSel.appendChild(opt);
      }
    }
    const subs = document.getElementById('settings-subtitles');
    if (subs) subs.checked = !!state.subtitlesEnabled;
    const subLang = document.getElementById('settings-subtitle-lang');
    if (subLang) {
      const langs = [['', t('settings.subtitleLangAuto')], ['ko', '한국어'], ['en', 'English'], ['ja', '日本語'], ['zh', '中文'], ['es', 'Español'], ['fr', 'Français'], ['de', 'Deutsch']];
      const cur = state.subtitleLang || '';
      if (cur && !langs.some(([c]) => c === cur)) langs.push([cur, cur]);
      subLang.innerHTML = langs.map(([c, l]) => `<option value="${_escHtml(c)}"${c === cur ? ' selected' : ''}>${_escHtml(l)}</option>`).join('');
    }
    const vol = document.getElementById('settings-volume');
    if (vol) vol.value = String(Math.round(_mediaVolume * 100));
    const volLabel = document.getElementById('settings-volume-label');
    if (volLabel) volLabel.textContent = `${Math.round(_mediaVolume * 100)}%`;
    const mute = document.getElementById('settings-mute');
    if (mute) mute.checked = _mediaMuted || _mediaVolume <= 0;
    // Startup & history
    const restore = document.getElementById('settings-restore-session');
    if (restore) restore.checked = _prefOn('restoreSession');
    const startScene = document.getElementById('settings-start-scene');
    if (startScene) {
      const lang = state.lang || 'en';
      if (startScene.dataset.lang !== lang) {
        startScene.innerHTML = START_SCENE_IDS.map((id) => `<option value="${id}">${_escHtml(t(`start.scene.${id}`))}</option>`).join('');
        startScene.dataset.lang = lang;
      }
    }
    _syncStartScreenControls();
    const recentCount = document.getElementById('settings-recent-count');
    if (recentCount) {
      const n = _getRecentDirs().length;
      recentCount.textContent = (t('settings.recentCount') || '{n}').replace('{n}', String(n));
    }
    document.getElementById('settings-clear-recent')?.toggleAttribute('disabled', !_getRecentDirs().length);
    _refreshThumbCacheSize();
    _refreshAssocStatus();
    // Viewer
    const zoomStep = document.getElementById('settings-zoom-step');
    if (zoomStep) zoomStep.value = String(parseInt(_pref('zoomStep'), 10) || 10);
    const checker = document.getElementById('settings-checker');
    if (checker) checker.checked = _prefOn('viewerChecker');
    const smoothing = document.getElementById('settings-smoothing');
    if (smoothing) smoothing.checked = _prefOn('imageSmoothing');
    const keepExif = document.getElementById('settings-keep-exif');
    if (keepExif) keepExif.checked = _prefOn('keepExif');
    const stripGps = document.getElementById('settings-strip-gps');
    if (stripGps) { stripGps.checked = _pref('stripGps') === '1'; stripGps.disabled = !_prefOn('keepExif'); }
    // DICOM
    const annot = document.getElementById('settings-dicom-annot');
    if (annot) annot.checked = _dicomAnnotOn;
    const fps = document.getElementById('settings-dicom-fps');
    if (fps) fps.value = String(parseInt(_pref('dicomDefaultFps'), 10) || 10);
    const ovColor = document.getElementById('settings-dicom-overlay-color');
    if (ovColor) ovColor.value = /^#[0-9a-f]{6}$/i.test(_pref('dicomOverlayColor')) ? _pref('dicomOverlayColor').toLowerCase() : PREF_DEFAULTS.dicomOverlayColor;
  }

  function _openSettings() {
    _syncSettingsDialog();
    _showDialog('settings-overlay');
  }

  function _assocChipLabels() {
    return ['JPG', 'PNG', 'GIF', 'BMP', 'WEBP', 'AVIF', 'SVG', 'ICO', 'TIFF', 'HEIC', 'DICOM'];
  }

  function _assocChipExts(label) {
    const map = {
      JPG: ['jpg', 'jpeg'],
      PNG: ['png'],
      GIF: ['gif'],
      BMP: ['bmp'],
      WEBP: ['webp'],
      AVIF: ['avif'],
      SVG: ['svg'],
      ICO: ['ico'],
      TIFF: ['tif', 'tiff'],
      HEIC: ['heic', 'heif', 'hif'],
      DICOM: ['dcm', 'dicom'],
    };
    return map[label] || [];
  }

  function _paintAssocStatus(status, extraMsg) {
    const t = I18n.t.bind(I18n);
    const chips = document.getElementById('settings-assoc-exts');
    const statusEl = document.getElementById('settings-assoc-status');
    const setBtn = document.getElementById('settings-set-default');
    const openBtn = document.getElementById('settings-open-default-apps');
    const items = status && Array.isArray(status.items) ? status.items : [];
    const isDefault = (ext) => items.some((it) => it.ext === ext && it.isDefault);
    if (chips) {
      chips.innerHTML = _assocChipLabels().map((label) => {
        const on = _assocChipExts(label).some(isDefault);
        return `<span class="settings-ext-chip${on ? ' is-default' : ''}">${label}</span>`;
      }).join('');
    }
    const supported = !!(status && status.supported);
    const isWeb = window.electronAPI.platform === 'web';
    if (setBtn) setBtn.disabled = isWeb || !supported;
    if (openBtn) openBtn.hidden = isWeb || window.electronAPI.platform !== 'win32';
    if (!statusEl) return;
    if (extraMsg) {
      statusEl.textContent = extraMsg;
      return;
    }
    if (isWeb) {
      statusEl.textContent = t('settings.assocWeb');
      return;
    }
    if (!supported) {
      statusEl.textContent = t('settings.assocUnsupported');
      return;
    }
    const n = items.filter((it) => it.isDefault).length;
    const total = items.length || 0;
    if (n >= total && total > 0) statusEl.textContent = t('settings.assocAll');
    else if (n > 0) statusEl.textContent = (t('settings.assocSome') || '{n} / {total}').replace('{n}', String(n)).replace('{total}', String(total));
    else statusEl.textContent = t('settings.assocNone');
  }

  async function _refreshAssocStatus() {
    if (!window.electronAPI.getFileAssocStatus) {
      _paintAssocStatus({ supported: false, items: [] });
      return;
    }
    try {
      const status = await window.electronAPI.getFileAssocStatus();
      _paintAssocStatus(status);
    } catch {
      _paintAssocStatus({ supported: false, items: [] });
    }
  }

  async function _setAsDefaultImageViewer() {
    const t = I18n.t.bind(I18n);
    const setBtn = document.getElementById('settings-set-default');
    if (setBtn) setBtn.disabled = true;
    try {
      if (!window.electronAPI.setDefaultImageViewer) {
        _paintAssocStatus({ supported: false, items: [] }, t('settings.assocUnsupported'));
        return;
      }
      const result = await window.electronAPI.setDefaultImageViewer();
      const status = result && result.status ? result.status : await window.electronAPI.getFileAssocStatus?.();
      if (!result || result.unsupported) {
        _paintAssocStatus(status || { supported: false, items: [] }, t('settings.assocUnsupported'));
        return;
      }
      if (!result.ok) {
        _paintAssocStatus(status || { supported: true, items: [] }, t('settings.assocError'));
        return;
      }
      const n = status?.items?.filter((it) => it.isDefault).length || 0;
      const total = status?.items?.length || 0;
      const all = total > 0 && n >= total;
      _paintAssocStatus(status, all ? t('settings.assocDone') : t('settings.assocRegistered'));
      if (!all && window.electronAPI.openDefaultAppsSettings) {
        await window.electronAPI.openDefaultAppsSettings();
      }
    } catch {
      _paintAssocStatus({ supported: true, items: [] }, t('settings.assocError'));
    } finally {
      if (setBtn) setBtn.disabled = false;
    }
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
  function _treeIsActivePane() { return state.activePane === 'tree'; }

  /** Tree paths a Ctrl+C / Ctrl+X should act on (empty → the shortcut means the image). */
  function _treeSelectionForShortcut() {
    if (window.electronAPI.platform === 'web' || !_treeIsActivePane()) return [];
    return FileTree.getSelectedPaths();
  }

  async function _pasteShortcut() {
    if (!_clipboardHasFiles()) return;
    const sel = FileTree.getSelectedPaths();
    let dest = FileTree.getRoot();
    if (_treeIsActivePane() && sel.length === 1) {
      try {
        const stats = await window.electronAPI.getFileStats(sel[0]);
        dest = (stats && !stats.error && stats.isDirectory)
          ? sel[0]
          : await window.electronAPI.pathDirname(sel[0]);
      } catch { /* keep the tree root */ }
    }
    await _pasteFilesInto(dest);
  }

  function _initKeyboard() {
    document.addEventListener('keydown', (e) => {
      if (_isFileDialogOpen()) return;
      if (state.editMode && window.EditTools?.handleKey(e)) return;
      const ctrl = e.ctrlKey || e.metaKey;

      if (ctrl && e.shiftKey && (e.key === 'o' || e.key === 'O')) { e.preventDefault(); _pickOpenFolder(); return; }
      if (ctrl && (e.key === 'o' || e.key === 'O')) { e.preventDefault(); _pickOpenFile(); return; }
      if (ctrl && (e.key === '=' || e.key === '+')) { e.preventDefault(); _zoom(1.25); return; }
      if (ctrl && e.key === '-') { e.preventDefault(); _zoom(0.8); return; }
      if (ctrl && e.key === '0') { e.preventDefault(); _setViewMode('window'); return; }
      if (ctrl && e.key === '1') { e.preventDefault(); _actualSize(); return; }
      if (ctrl && e.key === '[') { e.preventDefault(); _rotate(-90); return; }
      if (ctrl && e.key === ']') { e.preventDefault(); _rotate(90); return; }
      if (ctrl && e.shiftKey && (e.key === 'r' || e.key === 'R')) { e.preventDefault(); if (_isEditableImage()) _openResizeDialog(); return; }
      if (ctrl && e.key === 'e') { e.preventDefault(); _openEditWindow(); return; }
      // Ctrl+S save, Ctrl+Shift+S save as (by e.code so Caps Lock does not turn one into the other)
      if (ctrl && !e.altKey && (e.code === 'KeyS' || e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        if (e.shiftKey) { if (state.editMode) _saveAsNewFile(); else _saveAs(); }
        else _save();
        return;
      }
      if (ctrl && (e.key === 'v' || e.key === 'V')) { e.preventDefault(); _pasteShortcut(); return; }
      if (ctrl && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        // In the tree, Ctrl+P pastes (user request); everywhere else it still prints.
        if (_treeIsActivePane() && _clipboardHasFiles()) _pasteShortcut();
        else _openPrintPreview();
        return;
      }
      if (ctrl && (e.key === 'i' || e.key === 'I')) { e.preventDefault(); if (state.currentFile) _showFileInfoDialog(); return; }
      if (ctrl && e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        _redoEdit();
        return;
      }
      if (ctrl && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        _undoEdit();
        return;
      }
      if (ctrl && (e.key === 'y' || e.key === 'Y')) {
        e.preventDefault();
        _redoEdit();
        return;
      }
      if (ctrl && (e.key === 'x' || e.key === 'X')) {
        e.preventDefault();
        if (_treeSelectionForShortcut().length) _clipboardSetFiles(_treeSelectionForShortcut(), 'cut');
        else if (_isEditableImage()) _cutToClipboard();
        return;
      }
      if (ctrl && (e.key === 'c' || e.key === 'C')) {
        e.preventDefault();
        if (_treeSelectionForShortcut().length) _clipboardSetFiles(_treeSelectionForShortcut(), 'copy');
        else if (_isEditableImage()) _copyToClipboard();
        return;
      }

      // DICOM: PgUp / PgDn / Home / End = frames, Space = cine, I = invert, W = reset window
      if (_dicomKeydown(e)) { e.preventDefault(); return; }

      // Arrow keys inside a text / number field or a select (Settings, DICOM bar …) edit that field
      const tagName = (e.target && e.target.tagName) || '';
      const typing = tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT' || e.target?.isContentEditable;
      if (!typing && !state.editMode && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && FileTree.handleKey?.(e)) return;
      if (!typing && !state.editMode && e.key === 'Delete' && state.currentFile && window.electronAPI.platform !== 'web') {
        e.preventDefault();
        _deleteFile(state.currentFile);
        return;
      }
      // Image prev/next: ← / → / PageUp / PageDown (also wired on the filmstrip sides).
      if ((e.key === 'ArrowLeft' || e.key === 'PageUp') && !typing && !ctrl) {
        e.preventDefault();
        _prevImage();
        return;
      }
      if ((e.key === 'ArrowRight' || e.key === 'PageDown') && !typing && !ctrl) {
        e.preventDefault();
        _nextImage();
        return;
      }
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
        if (_unsavedFinish) {
          e.preventDefault();
          _unsavedFinish();
          return;
        }
        if (_confirmFinish) {
          e.preventDefault();
          _confirmFinish();
          return;
        }
        const openDlg = [...document.querySelectorAll('.dialog-overlay')].find((el) => {
          if (el.id === 'progress-overlay' || el.id === 'file-dialog-overlay' || el.id === 'confirm-overlay' || el.id === 'unsaved-overlay') return false;
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
        // Only once no dialog / edit window claims Esc: back to the contact sheet.
        if (!ctrl && _browseBack()) { e.preventDefault(); return; }
        Editor.clearSelection();
        _setTool('pointer');
        return;
      }
      if (e.key === 'F1') {
        e.preventDefault();
        _openHelp();
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
      'fit-window':    () => _setViewMode('window'),
      'actual-size':   _actualSize,
      'rotate-left':   () => _rotate(-90),
      'rotate-right':  () => _rotate(90),
      'flip-h':        () => _flip('h'),
      'flip-v':        () => _flip('v'),
      'reset-all':     _resetAll,
      'save':               _save,
      'save-as':            () => _saveAs(),
      'save-before-close':  () => _saveAs(true),
      'copy-clipboard':_copyToClipboard,
      'prev-image':    _prevImage,
      'next-image':    _nextImage,
      'edit-image':    _openEditWindow,
      'undo':          _undoEdit,
      'redo':          _redoEdit,
      'show-effects':  _toggleEffectsPanel,
      'effect-grayscale': () => { if (_isEditableImage()) { _openEditWindow(); Editor.applyPreset('grayscale'); } },
      'effect-sepia':     () => { if (_isEditableImage()) { _openEditWindow(); Editor.applyPreset('sepia'); } },
      'effect-invert':    () => { if (_isEditableImage()) { _openEditWindow(); Editor.applyPreset('invert'); } },
      'effect-reset':     _resetEffects,
      'theme-dark':    () => _applyTheme('dark'),
      'theme-light':   () => _applyTheme('light'),
      'theme-next':    _nextTheme,
      'print':         _openPrintPreview,
      'show-settings': _openSettings,
      'lang-ko': async () => { state.lang = 'ko'; localStorage.setItem('lang','ko'); await _refreshLang(); },
      'lang-en': async () => { state.lang = 'en'; localStorage.setItem('lang','en'); await _refreshLang(); },
      'show-about':    () => _showDialog('about-overlay'),
      'show-shortcuts':() => _showDialog('shortcuts-overlay'),
      'show-help':     () => _openHelp(),
      'show-home':     () => _goHome(),
      'panel-left':       () => _toggleLeftPanel(),
      'panel-right':      () => _toggleRightPanel(),
      'toggle-browse':    () => _toggleBrowseMode(),
    };
    if (action.startsWith('theme:')) { _applyTheme(action.slice(6)); return; }
    if (map[action]) await map[action]();
  }

  async function _refreshLang() {
    await I18n.loadLanguage(state.lang);
    I18n.applyToDOM();
    window.EditTools?.applyI18n();
    _buildEffectsPanel();
    _populateBgAlgoSelect();
    _updateStatus();
    if (state.editMode) _ewSyncTitle();
    _buildMenubar();
    _helpDocKey = '';
    if (document.body.classList.contains('home-open')) _renderHome();
    _renderPlaces();
    if (document.getElementById('help-overlay')?.classList.contains('visible')) _fillHelpDoc();
    if (state.currentFile) await _updateInfoPanel(state.currentFile);
    // DICOM bar option labels are built per language
    if (dcmPreset) dcmPreset.dataset.for = '';
    if (dcmColormap) dcmColormap.dataset.lang = '';
    _dicomSyncBar();
    _dicomOverlayRequest();
    // Chrome built in JS (not via data-i18n) has to be rebuilt by hand
    window.Browse?.applyI18n?.();
    window.FileTree?.applyI18n?.();
    _fillSettingsThemeButtons();   // theme names are translated too
    _syncBrowseChrome();
    _syncEditThemeLangBtns();
    _syncMenu();
    requestAnimationFrame(() => _syncWindowMinSize());
  }

  /* ════════════════════════════════════════════
     Dialogs
  ════════════════════════════════════════════ */
  function _resetDialogPos(overlay) {
    const box = overlay?.querySelector?.('.dialog-box');
    if (!box) return;
    box.classList.remove('is-moved');
    box.style.left = '';
    box.style.top = '';
  }

  function _showDialog(id) {
    const el = document.getElementById(id);
    if (!el) return;
    _resetDialogPos(el);
    el.style.display = 'flex';
    el.classList.add('visible');
    if (id === 'about-overlay') _refreshAboutInfo();
  }

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

  function _versionLabel(info) {
    const version = String(info?.version || '1.0.2');
    const build = String(info?.buildNumber || '').trim();
    return build ? `V${version} (${build})` : `V${version}`;
  }

  async function _refreshAboutInfo() {
    const info = await _loadAppInfo();
    const verEl = document.getElementById('about-version-num');
    const buildEl = document.getElementById('about-build-num');
    const brandVer = document.querySelector('.app-brand-ver');
    const label = _versionLabel(info);
    if (verEl) verEl.textContent = String(info.version || '1.0.2');
    if (buildEl) buildEl.textContent = String(info.buildNumber || '').trim() || '—';
    _fillAboutRows(info);
    if (brandVer) brandVer.textContent = label;
    const startVer = document.querySelector('.start-version');
    if (startVer) startVer.textContent = label;
  }

  /**
   * About ▸ the rows under the header: label | value. The format rows are built from the
   * same lists FormatSupport opens files by, so they cannot drift from what really opens.
   */
  function _fillAboutRows(info) {
    const host = document.getElementById('about-rows');
    if (!host) return;
    const t = I18n.t.bind(I18n);
    const list = (set) => [...set].map((e) => e.toUpperCase()).join(', ');
    // Played from a copy converted by ffmpeg (the webview has no decoder for them)
    const converted = [...FormatSupport.VIDEO_EXTS, ...FormatSupport.AUDIO_EXTS].filter((e) => _needsTranscode(`x.${e}`));
    const desktop = window.electronAPI.platform !== 'web';
    const rows = [
      [t('about.version'), `${info.version || '1.0.2'}${String(info.buildNumber || '').trim() ? ` (${t('about.build')} ${String(info.buildNumber).trim()})` : ''}`],
      [t('about.images'), list(FormatSupport.IMAGE_EXTS)],
      [t('about.video'), list(FormatSupport.VIDEO_EXTS)],
      [t('about.audio'), list(FormatSupport.AUDIO_EXTS)],
      desktop && [t('about.converted'), converted.map((e) => e.toUpperCase()).join(', ')],
      [t('about.platform'), desktop ? `${t('about.platformDesktop')} · ${window.electronAPI.platform}` : t('about.platformWeb')],
      [t('about.copyrightLabel'), t('about.copyright')],
      [t('about.contactLabel'), null],
    ].filter(Boolean);
    host.innerHTML = '';
    for (const [label, value] of rows) {
      const tr = document.createElement('tr');
      const th = document.createElement('th');
      th.scope = 'row';
      th.textContent = label;
      const td = document.createElement('td');
      if (value == null) {
        // contact: a mail link (opens the mail app)
        const a = document.createElement('a');
        a.href = '#';
        a.id = 'about-email-link';
        a.textContent = t('about.contact');
        a.addEventListener('click', (e) => {
          e.preventDefault();
          const mail = `mailto:${t('about.contact')}`;
          if (window.electronAPI.openExternal) window.electronAPI.openExternal(mail);
          else location.href = mail;
        });
        td.appendChild(a);
      } else {
        td.textContent = value;
      }
      tr.append(th, td);
      host.appendChild(tr);
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

  document.getElementById('progress-close')?.addEventListener('click', () => {
    window._ProgressDialog?.dismissModal?.();
  });

  document.addEventListener('pointerdown', (e) => {
    const header = e.target.closest?.('.dialog-overlay .dialog-header');
    if (!header || e.button !== 0) return;
    if (e.target.closest('button, a, input, select, textarea, label')) return;
    const box = header.closest('.dialog-box');
    const overlay = box?.closest('.dialog-overlay');
    if (!box || !overlay) return;
    const orect = overlay.getBoundingClientRect();
    const rect = box.getBoundingClientRect();
    const ox = e.clientX - rect.left;
    const oy = e.clientY - rect.top;
    box.classList.add('is-moved');
    const move = (ev) => {
      const w = overlay.clientWidth;
      const h = overlay.clientHeight;
      let left = ev.clientX - orect.left - ox;
      let top = ev.clientY - orect.top - oy;
      const minLeft = Math.min(0, 64 - box.offsetWidth);
      const maxLeft = Math.max(0, w - 64);
      const maxTop = Math.max(0, h - 32);
      left = Math.min(maxLeft, Math.max(minLeft, left));
      top = Math.min(maxTop, Math.max(0, top));
      box.style.left = `${left}px`;
      box.style.top = `${top}px`;
    };
    move(e);
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    e.preventDefault();
  });

  document.getElementById('confirm-overlay')?.addEventListener('click', (e) => {
    if (e.target && e.target.id === 'confirm-overlay') _confirmFinish?.();
  });
  document.getElementById('rename-overlay')?.addEventListener('click', (e) => {
    if (e.target && e.target.id === 'rename-overlay') _renameFinish?.();
  });
  document.getElementById('unsaved-overlay')?.addEventListener('click', (e) => {
    if (e.target && e.target.id === 'unsaved-overlay') _unsavedFinish?.();
  });

  document.querySelectorAll('.dialog-overlay').forEach(overlay => {
    if (overlay.id === 'progress-overlay' || overlay.id === 'file-dialog-overlay' || overlay.id === 'confirm-overlay' || overlay.id === 'unsaved-overlay' || overlay.id === 'rename-overlay') return;
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) _hideDialogEl(overlay);
    });
    overlay.addEventListener('pointerup', (e) => {
      if (e.target === overlay) _hideDialogEl(overlay);
    });
  });

  /* ════════════════════════════════════════════
     Panel layout — explorer / file info: shown, hidden, docked left or right
  ════════════════════════════════════════════ */
  function _loadLayout() {
    try {
      const saved = JSON.parse(localStorage.getItem(LAYOUT_KEY) || '{}');
      if (typeof saved.left === 'boolean') _layout.left = saved.left;
      if (typeof saved.right === 'boolean') _layout.right = saved.right;
    } catch { /* defaults */ }
  }

  function _saveLayout() {
    try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(_layout)); } catch { /* ignore */ }
  }

  function _leftPanelTip()  { return I18n.t(_layout.left ? 'toolbar.collapseLeft' : 'toolbar.expandLeft'); }
  function _rightPanelTip() { return I18n.t(_layout.right ? 'toolbar.collapseRight' : 'toolbar.expandRight'); }

  /**
   * Collapsing never hides a panel: it shrinks to a rail that still shows the
   * panel's icons and titles, with the same header button to expand it again.
   */
  function _applyPanelLayout() {
    const right = document.getElementById('right-sidebar');
    if (!sidebar || !right) return;

    sidebar.classList.toggle('collapsed', !_layout.left);
    right.classList.toggle('collapsed', !_layout.right);

    // The header button's chevron points the way a click moves the panel's edge
    const leftBtn = document.getElementById('tree-collapse-btn');
    if (leftBtn) {
      leftBtn.innerHTML = Icons[_layout.left ? 'chevronLeft' : 'chevronRight'] || '';
      leftBtn.setAttribute('aria-expanded', String(_layout.left));
    }
    const rightBtn = document.getElementById('color-collapse-btn');
    if (rightBtn) {
      rightBtn.innerHTML = Icons[_layout.right ? 'chevronRight' : 'chevronLeft'] || '';
      rightBtn.setAttribute('aria-expanded', String(_layout.right));
    }

    document.getElementById('btn-panel-left')?.classList.toggle('active', _layout.left);
    document.getElementById('btn-panel-right')?.classList.toggle('active', _layout.right);
  }

  function _toggleLeftPanel(force) {
    _layout.left = typeof force === 'boolean' ? force : !_layout.left;
    _saveLayout();
    _applyPanelLayout();
  }

  function _toggleRightPanel(force) {
    _layout.right = typeof force === 'boolean' ? force : !_layout.right;
    _saveLayout();
    _applyPanelLayout();
    if (_layout.right) _queueColorPanelSync();   // the histogram is not drawn while collapsed
  }

  /** True only while the full contact sheet (not the bottom filmstrip) is on screen. */
  function _browseShowing() {
    return _browseMode && !!Browse.isVisible?.() && !Browse.isFilmstrip?.();
  }

  /**
   * Selecting (not opening) a file fills File Info + histogram. An empty
   * selection clears those panels back to the default / disabled state.
   * Debounced because clicking down a row of thumbnails would otherwise queue
   * a read each time. (State is declared at the top — init reads it.)
   */
  function _clearSelectionPanels() {
    clearTimeout(_previewInfoTimer);
    _histPreviewGen++;
    _histPreview = null;
    if (infoContent) {
      delete infoContent.dataset.previewing;
      infoContent.innerHTML =
        `<div class="info-no-file" data-i18n="info.noFile">${I18n.t('info.noFile')}</div>`;
    }
    _setChromeBtn(document.getElementById('btn-edit'), _canStartEdit());
    _queueColorPanelSync();
  }

  /** Decode a thumbnail (or the open canvas) so the histogram follows selection. */
  async function _loadHistPreview(filePath) {
    const gen = ++_histPreviewGen;
    if (!filePath) {
      _histPreview = null;
      _queueColorPanelSync();
      return;
    }
    // Open file already has pixels in the editor / player — use those.
    if (state.currentFile &&
        _normWatchPath(state.currentFile) === _normWatchPath(filePath)) {
      _histPreview = null;
      _queueColorPanelSync();
      return;
    }
    if (!FormatSupport.isImage?.(filePath) || FormatSupport.isVideo?.(filePath)
        || FormatSupport.isAudio?.(filePath)) {
      _histPreview = null;
      _queueColorPanelSync();
      return;
    }
    let thumb = window.Thumbs?.get?.(filePath) || null;
    if (!thumb && window.Thumbs?.canThumbnail?.(filePath) && window.Thumbs?.request) {
      try { thumb = await Thumbs.request(filePath, { front: true }); } catch { thumb = null; }
    }
    if (gen !== _histPreviewGen) return;
    if (!thumb?.url) {
      _histPreview = null;
      _queueColorPanelSync();
      return;
    }
    const img = new Image();
    img.decoding = 'async';
    img.crossOrigin = 'anonymous';   // asset-protocol thumbs would taint the histogram canvas
    img.src = thumb.url;
    try {
      if (img.decode) await img.decode();
      else await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });
    } catch {
      if (gen !== _histPreviewGen) return;
      _histPreview = null;
      _queueColorPanelSync();
      return;
    }
    if (gen !== _histPreviewGen) return;
    _histPreview = {
      path: filePath,
      src: img,
      w: img.naturalWidth || thumb.w || 0,
      h: img.naturalHeight || thumb.h || 0,
    };
    _queueColorPanelSync();
  }

  function _previewFileInfo(filePath) {
    clearTimeout(_previewInfoTimer);
    _setChromeBtn(document.getElementById('btn-edit'), _canStartEdit());
    // Full contact sheet: empty selection clears panels. Filmstrip / plain viewer:
    // the open file is still the selection for File Info + histogram.
    const inFullSheet = !!Browse.isVisible?.() && !Browse.isFilmstrip?.();
    let target = filePath || null;
    if (!target && !inFullSheet) {
      target = state.currentFile || _openingFile || null;
    }
    if (!target) {
      if (_openingFile) {
        _updateInfoPanel(_openingFile).catch(() => {});
        return;
      }
      _clearSelectionPanels();
      return;
    }
    // Selection fills File Info (left); both panels stay as the user left them.
    if (infoContent) {
      const name = String(target).split(/[/\\]/).pop() || target;
      infoContent.dataset.previewing = target;
      const label = I18n.t('info.name') || 'Name';
      const section = I18n.t('info.section.file') || 'File';
      infoContent.innerHTML =
        `<div class="info-section">${_escHtml(section)}</div>`
        + `<table class="info-table"><tbody>`
        + `<tr class="info-row"><th class="info-label" scope="row">${_escHtml(label)}</th>`
        + `<td class="info-value">${_escHtml(name)}</td></tr>`
        + `</tbody></table>`;
    }
    _loadHistPreview(target);
    _previewInfoTimer = setTimeout(() => {
      const inSheet = !!Browse.isVisible?.() && !Browse.isFilmstrip?.();
      let path = filePath || null;
      if (!path && !inSheet) path = state.currentFile || _openingFile || null;
      if (!path) {
        if (infoContent) delete infoContent.dataset.previewing;
        if (_openingFile) _updateInfoPanel(_openingFile).catch(() => {});
        else _clearSelectionPanels();
        return;
      }
      // Previewing another file would clobber the open file's cached metadata.
      const other = state.currentFile &&
        _normWatchPath(path) !== _normWatchPath(state.currentFile);
      const saved = other
        ? { metaForFile: state.metaForFile, imageMeta: state.imageMeta, dicomMeta: state.dicomMeta }
        : null;
      _updateInfoPanel(path)
        .catch(() => { /* unreadable file */ })
        .then(() => {
          if (infoContent && infoContent.dataset.previewing === path) {
            delete infoContent.dataset.previewing;
          }
          if (saved) Object.assign(state, saved);
        });
    }, 40);
  }

  function _browseTip() { return I18n.t(_browseShowing() ? 'toolbar.browseOff' : 'toolbar.browseOn'); }

  /** The toolbar button tracks what is on screen, not just the stored mode. */
  function _syncBrowseChrome() {
    document.getElementById('btn-browse')?.classList.toggle('active', _browseShowing());
    // Print follows what is actually on screen, sheet included
    _setChromeBtn(document.getElementById('btn-print'), _canPrint());
    // Edit is available for the open image or a still selected in the sheet
    _setChromeBtn(document.getElementById('btn-edit'), _canStartEdit());
    // Viewer chrome (DICOM bar / overlay, media transport) hides behind the sheet
    _dicomSyncBar();
    _dicomOverlayRequest();
    _updateMediaControlsVisibility();
    if (Browse.isVisible?.()) {
      const sel = Browse.getSelected?.() || '';
      _previewFileInfo(sel);
    } else if (_openingFile) {
      _previewFileInfo(_openingFile);
    } else if (state.currentFile) {
      _previewFileInfo(state.currentFile);
    } else {
      _previewFileInfo('');
    }
  }

  function _initBrowse() {
    const host = document.getElementById('browse-view');
    if (!host) return;
    Browse.init(host, {
      onOpenFile: (p) => {
        _browseSheetHeld = true;
        Browse.setFilmstrip?.(true);
        _openFile(p);
      },
      onOpenDir: (p) => {
        _browseSheetHeld = false;
        Browse.setFilmstrip?.(false);
        _rememberRecentDir(p);
        _watchDir(p);
        FileTree.revealPath?.(p);
      },
      onContextMenu: (entry, x, y, paths) => _showTreeContextMenu(entry, x, y, { paths }),
      onSelect: (p) => _previewFileInfo(p),
      onVisibility: () => _syncBrowseChrome(),
      // Desktop: tiles can be dragged onto a folder in the explorer (move; Ctrl = copy)
      // (HTML5 drag; on the Tauri desktop dragdrop.js drags with pointer events instead)
      canDrag: window.electronAPI.platform !== 'web' && typeof window.electronAPI.transferIntoDir === 'function'
        && typeof window.electronAPI.startFileDrag !== 'function',
    });
    _applyBrowseMode({ initial: true });
  }

  function _applyBrowseMode({ initial = false } = {}) {
    FileTree.setFoldersOnly?.(_browseMode);
    if (!_browseMode) {
      _browseSheetHeld = false;
      // Keep a bottom filmstrip if an image is open; otherwise hide the sheet.
      if (state.currentFile && Browse.setFilmstrip) {
        _showFilmstripFor(state.currentFile).catch(() => Browse.hide());
      } else {
        Browse.hide();
      }
      _syncBrowseChrome();
      return;
    }
    // Showing the sheet again is an explicit user request — release the hold.
    if (!initial) _browseSheetHeld = false;
    Browse.setFilmstrip?.(false);
    const dir = Browse.getDir() || FileTree.getRoot();
    if (dir) {
      Browse.show(dir);
      if (!initial || !Browse.getDir()) Browse.open(dir);
    } else {
      Browse.show();
    }
    _syncBrowseChrome();
  }

  function _toggleBrowseMode(force) {
    if (typeof force === 'boolean') {
      _browseMode = force;
    } else if (_browseMode && (!Browse.isVisible?.() || Browse.isFilmstrip?.())) {
      // Mode is on but an image (or filmstrip) is showing — back to the full sheet.
      _browseSheetHeld = false;
      Browse.setFilmstrip?.(false);
      _applyBrowseMode();
      return;
    } else {
      _browseMode = !_browseMode;
    }
    try { localStorage.setItem(BROWSE_KEY, _browseMode ? '1' : '0'); } catch { /* ignore */ }
    _applyBrowseMode();
  }

  /** In browse mode, Esc goes from the opened image / filmstrip back to the contact sheet. */
  function _browseBack() {
    if (!_browseMode) return false;
    if (Browse.isFilmstrip?.()) {
      _browseSheetHeld = false;
      Browse.setFilmstrip(false);
      Browse.show(Browse.getDir() || FileTree.getRoot());
      _syncBrowseChrome();
      return true;
    }
    if (Browse.isVisible()) return false;
    _browseSheetHeld = false;
    Browse.show(Browse.getDir() || FileTree.getRoot());
    return true;
  }

  function _initPanelLayout() {
    _loadLayout();
    const icons = { 'tree-panel-icon': 'folderTree', 'info-panel-icon': 'fileInfo', 'color-panel-icon': 'palette' };
    for (const [id, icon] of Object.entries(icons)) {
      const el = document.getElementById(id);
      if (el) el.innerHTML = Icons[icon] || '';
    }

    // One button per side panel: collapse when expanded, expand when collapsed
    const leftBtn = document.getElementById('tree-collapse-btn');
    if (leftBtn) {
      Tooltip.attach(leftBtn, _leftPanelTip);
      leftBtn.addEventListener('click', (e) => { e.stopPropagation(); _toggleLeftPanel(); });
    }
    const rightBtn = document.getElementById('color-collapse-btn');
    if (rightBtn) {
      Tooltip.attach(rightBtn, _rightPanelTip);
      rightBtn.addEventListener('click', (e) => { e.stopPropagation(); _toggleRightPanel(); });
    }
    // A collapsed rail is one big target: clicking anywhere on it expands the panel
    sidebar?.addEventListener('click', () => { if (!_layout.left) _toggleLeftPanel(true); });
    document.getElementById('right-sidebar')
      ?.addEventListener('click', () => { if (!_layout.right) _toggleRightPanel(true); });

    _applyPanelLayout();
    _initRightSidebarResize();
    _initColorPanel();
  }

  /* ════════════════════════════════════════════
     Right panel — histogram, colour wheel, colour adjustments.
     Every control goes through Editor.setEffect(s), so undo / redo, the unsaved
     flag and Save behave exactly like rotate / flip in the viewer.
  ════════════════════════════════════════════ */
  /** Colour edits need a still image in the viewer (DICOM has its own window / level). */
  function _canColorEdit() {
    return Editor.isLoaded() && !state.isVideo && !state.isAudio && !state.editMode && !state.dicom;
  }

  /** The colour wheel also works in the edit window, where it sits at the top of Adjustments. */
  function _canTintEdit() {
    return Editor.isLoaded() && !state.isVideo && !state.isAudio && !state.dicom
      && (!state.editMode || _wheelInEditWindow());
  }

  function _wheelInEditWindow() {
    return !!document.getElementById('ew-color-host')?.contains(document.getElementById('cp-wheel-block'));
  }

  /**
   * One colour wheel for both windows: while the edit window is open its block (wheel,
   * swatch, hex, No tint, tint strength) moves to the top of Adjustments, and back after.
   * Both drive the same Editor tint effect, so undo / Save / Cancel see one history.
   */
  function _moveColorWheel(toEdit) {
    const block = document.getElementById('cp-wheel-block');
    const host = document.getElementById('ew-color-host');
    const home = document.getElementById('color-content');
    if (!block || !host || !home) return;
    if (toEdit) {
      if (!host.contains(block)) host.appendChild(block);
    } else if (!home.contains(block)) {
      // back to its place: after the histogram legend, before ADJUST
      const legend = document.getElementById('cp-hist-legend');
      if (legend && legend.parentNode === home) legend.after(block);
      else home.prepend(block);
    }
    _syncColorWheelControls();
    _queueColorPanelSync();
  }

  /** Enable / disable the wheel block wherever it is (the viewer panel's sync skips it in the edit window). */
  function _syncColorWheelControls() {
    const block = document.getElementById('cp-wheel-block');
    if (!block) return;
    const can = _canTintEdit();
    block.classList.toggle('is-disabled', !can);
    block.querySelectorAll('input, button, #cp-wheel').forEach((el) => {
      if (el.id === 'cp-wheel') el.setAttribute('aria-disabled', String(!can));
      else el.disabled = !can;
    });
  }

  function _cpSlider(host, s, can = _canColorEdit) {
    const group = document.createElement('div');
    group.className = 'effect-group';
    const lbl = document.createElement('span');
    lbl.className = 'effect-label';
    lbl.setAttribute('data-i18n', s.label);
    lbl.textContent = I18n.t(s.label);
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.className = 'effect-slider';
    slider.id = `cp-${s.key}`;
    slider.min = s.min; slider.max = s.max; slider.step = 1;
    slider.value = s.def;
    slider.setAttribute('aria-label', I18n.t(s.label));
    const val = document.createElement('span');
    val.className = 'effect-value';
    val.id = `cp-val-${s.key}`;
    val.textContent = s.def;
    slider.addEventListener('input', () => { val.textContent = slider.value; });
    slider.addEventListener('change', () => {
      if (!can()) return;
      Editor.setEffect(s.key, parseFloat(slider.value), true);
    });
    // Double-click a slider to put it back to its default
    slider.addEventListener('dblclick', () => {
      if (!can()) return;
      slider.value = s.def; val.textContent = s.def;
      Editor.setEffect(s.key, s.def, true);
    });
    _bindEffectSliderWheel(slider);
    group.append(lbl, slider, val);
    host.appendChild(group);
  }

  function _initColorPanel() {
    const adjust = document.getElementById('cp-adjust');
    if (adjust) for (const s of CP_SLIDERS) _cpSlider(adjust, s);
    const amountRow = document.getElementById('cp-tint-amount-row');
    if (amountRow) {
      _cpSlider(amountRow, { key:'tintAmount', label:'color.tintAmount', min:0, max:100, def:0 }, _canTintEdit);
      // Strength without a colour does nothing — pick one first
      document.getElementById('cp-tintAmount')?.addEventListener('change', (e) => {
        if (!Editor.getEffects().tintColor) e.target.value = 0;
      });
    }

    document.getElementById('cp-tint-clear')?.addEventListener('click', () => {
      if (_canTintEdit()) Editor.setEffects({ tintColor: '', tintAmount: 0 });
    });
    document.getElementById('cp-reset')?.addEventListener('click', () => {
      if (!_canColorEdit()) return;
      const reset = { tintColor: '', tintAmount: 0 };
      for (const s of CP_SLIDERS) reset[s.key] = s.def;
      Editor.setEffects(reset);
    });

    _initColorWheel();
    if (window.ResizeObserver) {
      const host = document.getElementById('color-content');
      if (host) new ResizeObserver(() => _queueColorPanelSync()).observe(host);
    }
    _queueColorPanelSync();
  }

  /* ── Colour wheel: hue around the rim, saturation out from the centre ── */
  function _hsvToHex(h, s, v = 1) {
    const f = (n) => {
      const k = (n + h / 60) % 6;
      return Math.round(255 * (v - v * s * Math.max(0, Math.min(k, 4 - k, 1))));
    };
    return '#' + [f(5), f(3), f(1)].map((c) => c.toString(16).padStart(2, '0')).join('');
  }

  function _hexToHs(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return null;
    const n = parseInt(m[1], 16);
    const r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
    const max = Math.max(r, g, b), d = max - Math.min(r, g, b);
    let h = 0;
    if (d) {
      if (max === r) h = 60 * (((g - b) / d) % 6);
      else if (max === g) h = 60 * ((b - r) / d + 2);
      else h = 60 * ((r - g) / d + 4);
    }
    return { h: (h + 360) % 360, s: max ? d / max : 0 };
  }

  function _drawColorWheel() {
    const cv = document.getElementById('cp-wheel');
    if (!cv) return;
    const size = cv.width, r = size / 2;
    const ctx = cv.getContext('2d');
    if (!_cpWheelImage) {
      const img = ctx.createImageData(size, size);
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const dx = x + 0.5 - r, dy = y + 0.5 - r;
          const dist = Math.hypot(dx, dy);
          if (dist > r) continue;
          const hex = _hsvToHex((Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360, Math.min(1, dist / (r - 1)));
          const n = parseInt(hex.slice(1), 16);
          const i = (y * size + x) * 4;
          img.data[i] = n >> 16 & 255; img.data[i + 1] = n >> 8 & 255; img.data[i + 2] = n & 255;
          img.data[i + 3] = dist > r - 1 ? Math.round(255 * (r - dist)) : 255;   // soft rim
        }
      }
      _cpWheelImage = img;
    }
    ctx.putImageData(_cpWheelImage, 0, 0);

    // Marker on the picked colour (or the live drag position)
    const hs = _cpWheelDrag || _hexToHs(Editor.getEffects?.().tintColor);
    if (hs) {
      const a = hs.h * Math.PI / 180, d = hs.s * (r - 1);
      const x = r + Math.cos(a) * d, y = r + Math.sin(a) * d;
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#000';
      ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = '#fff';
      ctx.beginPath(); ctx.arc(x, y, 5.5, 0, Math.PI * 2); ctx.stroke();
    }
  }

  function _initColorWheel() {
    const cv = document.getElementById('cp-wheel');
    if (!cv) return;
    const pick = (e) => {
      const rect = cv.getBoundingClientRect();
      const r = rect.width / 2;
      const dx = e.clientX - rect.left - r, dy = e.clientY - rect.top - r;
      return { h: (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360, s: Math.min(1, Math.hypot(dx, dy) / r) };
    };
    const commit = (hs) => {
      const efx = Editor.getEffects();
      const next = { tintColor: _hsvToHex(hs.h, hs.s) };
      if (!(efx.tintAmount > 0)) next.tintAmount = CP_TINT_DEFAULT;   // a pick should show at once
      Editor.setEffects(next);
    };
    cv.addEventListener('pointerdown', (e) => {
      if (!_canTintEdit() || e.button !== 0) return;
      e.preventDefault();
      cv.setPointerCapture(e.pointerId);
      _cpWheelDrag = pick(e);
      _syncColorPick();
    });
    cv.addEventListener('pointermove', (e) => {
      if (!_cpWheelDrag) return;
      _cpWheelDrag = pick(e);
      _syncColorPick();
    });
    const end = () => {
      if (!_cpWheelDrag) return;
      const hs = _cpWheelDrag;
      _cpWheelDrag = null;
      commit(hs);   // one history step per pick, not one per pointer move
    };
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', () => { _cpWheelDrag = null; _syncColorPick(); });
    // Keyboard: ←/→ turn the hue, ↑/↓ change the saturation
    cv.addEventListener('keydown', (e) => {
      if (!_canTintEdit()) return;
      const cur = _hexToHs(Editor.getEffects().tintColor) || { h: 0, s: 0.5 };
      const step = { ArrowLeft: [-5, 0], ArrowRight: [5, 0], ArrowUp: [0, 0.05], ArrowDown: [0, -0.05] }[e.key];
      if (!step) return;
      e.preventDefault();
      e.stopPropagation();
      commit({ h: (cur.h + step[0] + 360) % 360, s: Math.max(0, Math.min(1, cur.s + step[1])) });
    });
  }

  /** Swatch, hex code and wheel marker follow the picked tint. */
  function _syncColorPick() {
    const hex = _cpWheelDrag ? _hsvToHex(_cpWheelDrag.h, _cpWheelDrag.s) : (Editor.getEffects?.().tintColor || '');
    const sw = document.getElementById('cp-swatch');
    if (sw) {
      sw.style.background = hex || '';
      sw.classList.toggle('is-empty', !hex);
    }
    const hx = document.getElementById('cp-hex');
    if (hx) hx.textContent = hex ? hex.toUpperCase() : '—';
    _drawColorWheel();
  }

  /* ── Histogram: R / G / B areas plus the luminance line, from what is on screen ── */

  /** Path that currently owns File Info / histogram (selection or open file). */
  function _panelSelectionPath() {
    if (Browse.isVisible?.()) {
      const sel = Browse.getSelected?.() || '';
      if (sel) return sel;
      // Full sheet with nothing selected → no panel owner.
      if (!Browse.isFilmstrip?.()) return '';
    }
    return state.currentFile || _openingFile || '';
  }

  /**
   * Pixels for the histogram: the open image when it is the selection, otherwise
   * a thumbnail loaded for the contact-sheet / filmstrip selection.
   */
  function _colorSource() {
    const sel = _panelSelectionPath();
    if (!sel) return null;

    const selNorm = _normWatchPath(sel);
    const openNorm = state.currentFile ? _normWatchPath(state.currentFile) : '';
    if (openNorm && selNorm === openNorm) {
      let src = null;
      if (Editor.isLoaded() && !state.isVideo && !state.isAudio) src = Editor.getCanvasElement?.();
      else if (state.isAnimated && animImg?.naturalWidth) src = animImg;
      const w = src?.naturalWidth || src?.width, h = src?.naturalHeight || src?.height;
      if (src && w && h) return { src, w, h };
    }

    if (_histPreview?.src && _histPreview.w && _histPreview.h
        && _normWatchPath(_histPreview.path) === selNorm) {
      return { src: _histPreview.src, w: _histPreview.w, h: _histPreview.h };
    }
    return null;
  }

  /**
   * Per-channel histograms and luminance statistics of a downscaled copy (maxSide px
   * on the long edge) — plenty for 256 bins, and cheap on big photos.
   */
  function _imageStats(source, maxSide = 512) {
    if (!source) return null;
    const scale = Math.min(1, maxSide / Math.max(source.w, source.h));
    const w = Math.max(1, Math.round(source.w * scale)), h = Math.max(1, Math.round(source.h * scale));
    const tmp = document.createElement('canvas');
    tmp.width = w; tmp.height = h;
    const tc = tmp.getContext('2d', { willReadFrequently: true });
    tc.drawImage(source.src, 0, 0, w, h);
    const px = tc.getImageData(0, 0, w, h).data;
    const bins = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)];
    const sum = [0, 0, 0, 0];
    let count = 0, sumSqY = 0, transparent = 0;
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3] < 8) { transparent++; continue; }   // ignore transparent pixels
      const r = px[i], g = px[i + 1], b = px[i + 2];
      const y = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
      bins[0][r]++; bins[1][g]++; bins[2][b]++; bins[3][y]++;
      sum[0] += r; sum[1] += g; sum[2] += b; sum[3] += y;
      sumSqY += y * y;
      count++;
    }
    if (!count) return null;
    let minY = 0, maxY = 255;
    while (minY < 255 && !bins[3][minY]) minY++;
    while (maxY > 0 && !bins[3][maxY]) maxY--;
    const meanY = sum[3] / count;
    return {
      bins, count, sampleW: w, sampleH: h, transparent,
      mean: sum.map((v) => v / count),
      stdY: Math.sqrt(Math.max(0, sumSqY / count - meanY * meanY)),
      minY, maxY,
    };
  }

  function _paintHistogram(cv, stats) {
    const dpr = window.devicePixelRatio || 1;
    const cssW = Math.max(120, Math.round(cv.clientWidth || 256));
    const cssH = Math.max(60, Math.round(cv.clientHeight || 96));
    if (cv.width !== Math.round(cssW * dpr)) cv.width = Math.round(cssW * dpr);
    if (cv.height !== Math.round(cssH * dpr)) cv.height = Math.round(cssH * dpr);
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    if (!stats) return;
    const { bins } = stats;
    // Scale to the tallest bin, ignoring the two clipped ends so they do not flatten the rest
    let peak = 1;
    for (const ch of bins) for (let v = 1; v < 255; v++) peak = Math.max(peak, ch[v]);
    const yOf = (n) => cssH - Math.min(1, n / peak) * (cssH - 2);
    const xOf = (v) => (v / 255) * cssW;

    ctx.globalCompositeOperation = 'lighter';
    const colors = ['rgba(255,70,70,0.55)', 'rgba(70,220,90,0.55)', 'rgba(80,140,255,0.6)'];
    for (let c = 0; c < 3; c++) {
      ctx.fillStyle = colors[c];
      ctx.beginPath();
      ctx.moveTo(0, cssH);
      for (let v = 0; v < 256; v++) ctx.lineTo(xOf(v), yOf(bins[c][v]));
      ctx.lineTo(cssW, cssH);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--text-primary').trim() || '#ddd';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let v = 0; v < 256; v++) {
      const x = xOf(v), y = yOf(bins[3][v]);
      if (v) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.stroke();
  }

  function _drawHistogram() {
    const cv = document.getElementById('cp-histogram');
    if (!cv) return;
    const stats = _imageStats(_colorSource());
    _paintHistogram(cv, stats);
    const legend = document.getElementById('cp-hist-legend');
    if (!legend) return;
    if (!stats) { legend.textContent = I18n.t('color.noImage'); return; }
    const pct = (n) => `${(n / stats.count * 100).toFixed(1)}%`;
    legend.textContent = `${I18n.t('color.mean')} ${Math.round(stats.mean[3])}  ·  `
      + `${I18n.t('color.shadows')} ${pct(stats.bins[3][0])}  ·  ${I18n.t('color.highlights')} ${pct(stats.bins[3][255])}`;
  }

  /** Coalesces every "the picture changed" signal into one redraw per frame. */
  function _queueColorPanelSync() {
    if (_cpSyncQueued) return;
    _cpSyncQueued = true;
    requestAnimationFrame(() => {
      _cpSyncQueued = false;
      _syncColorPanel();
    });
  }

  function _syncColorPanel() {
    const content = document.getElementById('color-content');
    if (!content) return;
    const can = _canColorEdit();
    const hasSel = !!_panelSelectionPath();
    content.classList.toggle('is-disabled', !can || !hasSel);
    content.classList.toggle('is-empty', !hasSel);
    content.querySelectorAll('input, button, #cp-wheel').forEach((el) => {
      if (el.id === 'cp-wheel') el.setAttribute('aria-disabled', String(!can));
      else el.disabled = !can;
    });
    if (Editor.isLoaded() && hasSel) _syncSlidersFromEffects('cp');
    else {
      for (const s of CP_SLIDERS) {
        const sl = document.getElementById(`cp-${s.key}`), v = document.getElementById(`cp-val-${s.key}`);
        if (sl) sl.value = s.def;
        if (v) v.textContent = s.def;
      }
    }
    if (_wheelInEditWindow()) _syncColorWheelControls();
    _syncColorPick();
    // Histogram follows the selection (or stays blank when nothing is selected).
    if (_layout.right || hasSel) _drawHistogram();
  }

  function _initRightSidebarResize() {
    const handle = document.getElementById('right-sidebar-resize-handle');
    const right = document.getElementById('right-sidebar');
    if (!handle || !right) return;

    const MIN_W = 280;
    const MAX_W = 560;
    const saved = parseInt(localStorage.getItem('rightSidebarWidth') || '', 10);
    if (saved >= MIN_W && saved <= MAX_W) right.style.width = `${saved}px`;

    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startW = right.getBoundingClientRect().width;
      handle.classList.add('resizing');
      document.body.classList.add('resizing-col');

      const onMove = (ev) => {
        const w = Math.min(Math.max(startW - (ev.clientX - startX), MIN_W), MAX_W);
        right.style.width = `${Math.round(w)}px`;
      };
      const onUp = () => {
        handle.classList.remove('resizing');
        document.body.classList.remove('resizing-col');
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        localStorage.setItem('rightSidebarWidth', String(Math.round(right.getBoundingClientRect().width)));
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    });
  }

  /* ════════════════════════════════════════════
     Sidebar Resize
  ════════════════════════════════════════════ */
  function _initSidebarResize() {
    const handle = document.getElementById('sidebar-resize-handle');
    if (!handle || !sidebar) return;

    const MIN_W = 280;
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
    const MIN_TREE = 160;
    const MIN_INFO = 160;

    function _applySplit(treeH) {
      const total = sidebar.getBoundingClientRect().height;
      if (total < MIN_TREE + HANDLE_H + MIN_INFO) return 0;
      const maxTree = Math.max(MIN_TREE, total - HANDLE_H - MIN_INFO);
      const h = Math.min(Math.max(treeH, MIN_TREE), maxTree);
      const infoH = Math.max(MIN_INFO, total - HANDLE_H - h);

      tree.style.flex = 'none';
      tree.style.height = `${Math.round(h)}px`;
      info.style.flex = 'none';
      info.style.height = `${Math.round(infoH)}px`;
      info.style.minHeight = `${MIN_INFO}px`;
      return h;
    }

    // Restore previous split after the sidebar has a real height
    const savedTree = parseInt(localStorage.getItem('sidebarTreeHeightV2') || '', 10);
    if (savedTree >= MIN_TREE) {
      let tries = 0;
      const restore = () => {
        if (_applySplit(savedTree) || tries++ >= 12) return;
        requestAnimationFrame(restore);
      };
      requestAnimationFrame(restore);
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

    const MAX_W = 560;

    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startW = panel.getBoundingClientRect().width;
      handle.classList.add('resizing');
      document.body.classList.add('resizing-col');

      const onMove = (ev) => {
        const w = Math.min(Math.max(startW + (ev.clientX - startX), _editEffectsMinW), MAX_W);
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
