'use strict';

/** Desktop (Tauri) windows and drag & drop: menus and dialogs past the window edge,
 *  file drags in / out / within, host-built thumbnails, start-up restore — plus the
 *  menu icon rule and the filmstrip scroll fix. Added 2026-10-22. */
module.exports = {
  name: 'Desktop windows & drag-drop',
  run({ test, src, h }) {
    const { html, app, css, browse, thumbs, contextMenu, fileDialog } = src;
    const { assert, assertIncludes } = h;
    const rust = h.read('src-tauri/src/main.rs');
    const conf = JSON.parse(h.read('src-tauri/tauri.conf.json'));
    const caps = JSON.parse(h.read('src-tauri/capabilities/default.json'));
    const bridge = h.read('src/js/tauriAPI.js');
    const host = h.readHost();
    const overlayPage = h.read('src/popup.html');
    const overlayJs = h.read('src/js/popupMenu.js');
    const dialogs = h.read('src/js/dialogWindow.js');
    const dnd = h.read('src/js/dragdrop.js');
    const tooltip = h.read('src/js/tooltip.js');

    /* ── Menus in the overlay window ── */

    test('Rust builds a non-focusable transparent menu overlay shown without activation', () => {
      for (const s of ['.transparent(true)', '.focusable(false)', 'SW_SHOWNOACTIVATE', 'popup_menu_show', 'popup_menu_hide', 'popup_menu_event']) {
        assertIncludes(rust, s, s);
      }
      assert(caps.windows.includes('menu-overlay'), 'overlay may listen to events');
    });

    test('The bridge turns contextMenu.js remote mode on (popupMenu + events)', () => {
      for (const s of ["popupMenu: (data) => invoke('popup_menu_show'", "popupMenuHide: () => invoke('popup_menu_hide')", "listen('popup-menu-event'"]) {
        assertIncludes(bridge, s, s);
      }
    });

    test('Overlay page reuses contextMenu.js and reports menu bar titles', () => {
      assertIncludes(overlayPage, 'js/contextMenu.js', 'same menu module');
      assertIncludes(overlayPage, 'js/popupMenu.js', 'overlay driver');
      assertIncludes(overlayJs, "send({ type: 'title', index: h.i, click: true })", 'title press');
      assertIncludes(contextMenu, "if (ev.type === 'title')", 'title event handled');
      assertIncludes(contextMenu, '_remoteBroken = true', 'in-page fallback when the overlay fails');
    });

    test('The webview’s own context menu is suppressed outside text fields', () => {
      assertIncludes(app, "document.addEventListener('contextmenu', (e) => {", 'global handler');
      assertIncludes(app, 'if (!editable) e.preventDefault();', 'text fields keep theirs');
    });

    /* ── Every menu row has an icon ── */

    test('Menu rows always show an icon; a checked row keeps it and adds a check', () => {
      assertIncludes(contextMenu, "else iconWrap.innerHTML = item.checked ? CHECK : DOT;", 'fallback glyph');
      assertIncludes(contextMenu, "mark.className = 'ctx-checkmark';", 'separate check mark');
      assertIncludes(css, '.ctx-item .ctx-checkmark', 'check mark style');
    });

    test('DICOM menu rows carry icons (frames, presets, colormaps)', () => {
      for (const s of ["icon: Icons.first, label: t('dicom.firstFrame')", "icon: Icons.last, label: t('dicom.lastFrame')",
        "icon: Icons.magicWand, label: t('dicom.preset.auto')", 'return { icon: Icons.palette, label: label && label !== key']) {
        assertIncludes(app, s, s);
      }
    });

    /* ── Dialogs in their own windows ── */

    test('Main window is built in Rust so window.open can create owned dialog windows', () => {
      assert(Array.isArray(conf.app.windows) && conf.app.windows.length === 0, 'no config window');
      for (const s of ['fn build_main_window', '.on_new_window(', 'fn dialog_window', 'NewWindowResponse::Create', 'fn fit_dialog', 'fn close_dialog']) {
        assertIncludes(rust, s, s);
      }
    });

    test('dialogWindow.js moves the dialog DOM into its window and back', () => {
      assertIncludes(html, 'js/dialogWindow.js', 'loaded');
      for (const s of ['doc.adoptNode(overlay)', 'document.adoptNode(overlay)', "invoke('fit_dialog'", "invoke('close_dialog'",
        "IN_PAGE = new Set(['progress-overlay'])", 'document.getElementById = (id)', "key: 'Escape'"]) {
        assertIncludes(dialogs, s, s);
      }
    });

    test('Dialog windows: title row drags the window, main window blocked meanwhile', () => {
      assertIncludes(css, 'html.dialog-window .dialog-overlay .dialog-header', 'drag region');
      assertIncludes(css, '#dialog-window-blocker', 'blocker');
    });

    test('Tooltips and the file dialog keys work inside a dialog window', () => {
      assertIncludes(tooltip, 'function _tipIn(doc)', 'tooltip per document');
      assertIncludes(fileDialog, '_overlay.ownerDocument !== document', 'keys on the moved overlay');
    });

    /* ── Drag & drop ── */

    test('Drag-out: start_file_drag hands the files to an OS drag (copy only)', () => {
      assertIncludes(rust, 'async fn start_file_drag', 'async command');
      assertIncludes(rust, 'drag::DragMode::Copy', 'copy, never move');
      assertIncludes(h.read('src-tauri/Cargo.toml'), 'drag = "2"', 'drag crate');
      assertIncludes(bridge, "startFileDrag: (paths) => invoke('start_file_drag'", 'bridge');
    });

    test('In-app drag uses pointer events; leaving the window becomes an OS drag', () => {
      assertIncludes(html, 'js/dragdrop.js', 'loaded');
      for (const s of ["addEventListener('pointerdown', _onDown, true)", 'function _dragOut()', "e.ctrlKey ? 'copy' : 'move'", "classList.add('dd-target')"]) {
        assertIncludes(dnd, s, s);
      }
      assertIncludes(app, "&& typeof window.electronAPI.startFileDrag !== 'function',", 'HTML5 tile drag off on the desktop');
    });

    test('Files dropped from outside go where they land (folder / sheet / open)', () => {
      assertIncludes(bridge, "new CustomEvent('native-dragdrop'", 'native drop forwarded');
      assertIncludes(app, "window.addEventListener('native-dragdrop'", 'handled');
      assertIncludes(app, 'function _dropMode(paths, destDir)', 'Explorer rule');
      assertIncludes(app, 'async function _openDroppedPaths(paths)', 'open fallback');
    });

    /* ── Thumbnail DB + start-up ── */

    test('Host builds thumbnails itself, per folder in the background', () => {
      for (const s of ['"thumb-make" =>', '"thumb-cache-build" =>', 'img.apply_orientation(orientation);', 'q.preempt = true;']) {
        assertIncludes(host, s, s);
      }
      assertIncludes(thumbs, 'await _api().thumbMake(path)', 'renderer asks the host first');
      assertIncludes(thumbs, "thumbCacheBuild(dirPath, { front: true })", 'folder open warms the DB');
    });

    test('Start-up: last folder in folder view, falling back to the newest recent one', () => {
      assertIncludes(app, 'getSavedLastOpenDir', 'host copy first');
      assertIncludes(host, '"get-saved-last-open-dir" =>', 'host channel');
      assertIncludes(app, "if (_normDirKey(p) !== _normDirKey(lastDir) && await isDir(p))", 'recent fallback');
      assertIncludes(app, 'Browse.select?.(lastFile);', 'last image selected, not opened');
      assertIncludes(app, 'Thumbs.warmDirs?.(', 'recent folders warmed');
    });

    /* ── Filmstrip ">" spam ── */

    test('Filmstrip scrolls only its own strip (no scrollIntoView on the page)', () => {
      assert(!browse.includes('scrollIntoView('), 'no scrollIntoView in browse.js');
      assertIncludes(browse, "_grid.scrollTo({ left: Math.max(0, left), behavior: 'smooth' });", 'strip scroll');
      const va = css.slice(css.indexOf('#viewer-area {'), css.indexOf('#viewer-area {') + 900);
      assertIncludes(va, 'overflow: clip;', 'viewer area cannot be scrolled from script');
    });

    /* ── Display modes (images and video) ── */

    test('Display-mode state is declared before the toolbar is built (no TDZ at start-up)', () => {
      const buildAt = app.indexOf('\n  _buildToolbar();');
      for (const decl of ['let _wantFit = true;', 'let _viewMode = ', "const VIEW_MODE_KEY = 'viewFitModeV1';"]) {
        const at = app.indexOf(decl);
        assert(at > 0 && at < buildAt, `${decl} before _buildToolbar()`);
      }
    });

    test('Toolbar has fit window / width / height, original size, centre and fullscreen', () => {
      for (const id of ['btn-fit', 'btn-fit-width', 'btn-fit-height', 'btn-actual', 'btn-center', 'btn-fullscreen']) {
        assertIncludes(app, `id:'${id}'`, id);
      }
      assertIncludes(app, 'function _setViewMode(mode)', 'modes');
      assertIncludes(app, 'function _centerView()', 'centre');
    });

    test('Video is placed by the same zoom / pan as pictures, with its own size', () => {
      assertIncludes(app, 'if (state.isVideo && videoEl && dims.w && dims.h) {', 'video placement');
      const dims = app.slice(app.indexOf('function _getViewerDims()'), app.indexOf('/* ─── Init ─── */'));
      assert(dims.indexOf('state.isVideo') < dims.indexOf('Editor.isLoaded()'), 'video dims before the editor’s last picture');
    });

    /* ── Media: every listed format plays; audio has the transport too ── */

    test('Undecodable media is converted by the host (ffmpeg) and the copy played', () => {
      assertIncludes(host, '"media-transcode" =>', 'host channel');
      assertIncludes(host, 'super::runtime_dir().map(|d| d.join(exe))', 'bundled ffmpeg');
      assertIncludes(h.read('scripts/stage-runtime.js'), "require('ffmpeg-static')", 'ffmpeg-static staged for the installer');
      assertIncludes(bridge, "transcodeMedia: (filePath, kind) => call('media-transcode', filePath, kind)", 'bridge');
      assertIncludes(app, 'function _needsTranscode(filePath)', 'known containers');
      assertIncludes(app, "videoEl?.addEventListener('error', () => _mediaFallback(videoEl, 'video'));", 'fallback on error');
    });

    test('Audio: transport bar, click the screen to play / pause, no MIDI promised', () => {
      assertIncludes(app, 'function _mediaEl()', 'video or audio element');
      assertIncludes(app, "if (state.editMode || !(state.isVideo || state.isAudio)) return;", 'click toggles audio too');
      assert(!/'mid'/.test(src.formatSupport), 'MIDI not listed (nothing can play it)');
      assert(!/<audio id="audio-player" controls/.test(html), 'no native audio controls (the app bar drives it)');
    });

    test('About: header (icon, name, version, description) over label | value rows built from FormatSupport', () => {
      assertIncludes(html, 'class="about-hero"', 'hero');
      assertIncludes(html, '<tbody id="about-rows"></tbody>', 'rows');
      assertIncludes(app, '[t(\'about.images\'), list(FormatSupport.IMAGE_EXTS)]', 'images from the real list');
    });

    test('Filmstrip is a row below the viewer (divider, no overlap, no widening)', () => {
      const film = css.slice(css.indexOf('#browse-view.is-filmstrip {'), css.indexOf('#browse-view.is-filmstrip {') + 900);
      for (const s of ['position: relative !important;', 'order: 1;', 'flex: 0 0 104px;', 'border-top: 2px solid', 'min-width: 0;']) assertIncludes(film, s, s);
    });

    /* ── Background removal ── */

    test('"Selection" background removal keeps the selection (the subject), clears the rest', () => {
      const fn = src.editor.slice(src.editor.indexOf('function removeBackground(removeInside = false)'), src.editor.indexOf('function listBgAlgorithms'));
      assertIncludes(fn, 'if (inside === removeInside) {', 'outside is cleared when removeInside is false');
    });

    test('AI models: provided by the host (download with timeouts, .part file, checksum), never by the worker', () => {
      for (const s of ['fn download(url: &str, dest: &Path', 'format!("{}.part", dest.to_string_lossy())',
        '.timeout_connect(Duration::from_secs(20))', '.timeout_read(Duration::from_secs(30))', '"checksum mismatch (damaged download)"',
        'fn ensure_model(m: &Model', 'hash_hex: "60024c5c889badc19c04ad937298a77b"', '"code": "MODEL_DOWNLOAD_FAILED", "retry": true',
        'const WORKER_LIMIT: Duration = Duration::from_secs(10 * 60);']) {
        assertIncludes(host, s, s);
      }
      const worker = h.read('scripts/rembg_worker.py');
      assertIncludes(worker, 'MYIMAGEVIEWER_MODEL_PATH', 'worker uses the given model');
      assertIncludes(worker, 'a silent, unbounded download here is exactly what must not happen', 'no worker download when run by the app');
    });

    test('A failed model download is reported with Retry (a fresh download) / Close', () => {
      assertIncludes(app, "if (result.code === 'MODEL_DOWNLOAD_FAILED') {", 'failure branch');
      assertIncludes(app, "buttons: [t('bgAlgo.retryDownload'), t('bgAlgo.close')],", 'Retry / Close');
      assertIncludes(app, 'if (retry) setTimeout(() => { _runRembg(algo); }, 0);', 'retry runs again (from finally)');
    });

    test('Host progress events reach the page (host-event)', () => {
      assertIncludes(host, 'app.emit_to("main", "host-event", json!({ "channel": channel, "payload": payload }))', 'host sends');
      assertIncludes(host, 'emit("rembg-progress"', 'background removal progress');
      assertIncludes(host, 'emit("open-progress"', 'open / convert progress');
      assertIncludes(bridge, "tauri.event.listen('host-event'", 'page listens');
    });

    /* ── Installer ── */

    test('Installer: Korean / English choice, same icon everywhere, optional shortcuts, hooks', () => {
      const nsis = conf.bundle.windows.nsis;
      assert(nsis.displayLanguageSelector === true && nsis.languages.join() === 'Korean,English', 'languages');
      assert(nsis.installerIcon === 'icons/icon.ico' && nsis.uninstallerIcon === 'icons/icon.ico', 'installer / uninstaller icon');
      assert(nsis.startMenuFolder === 'MyImageViewer', 'Start-menu page (with "do not create shortcuts")');
      assert(nsis.installerHooks === 'windows/hooks.nsh', 'hooks');
      assertIncludes(rust, 'window_icon::apply(&main);', 'taskbar icon from the exe');
    });

    test('Installer hooks: ask about user data, remove previous Tauri and Electron installs', () => {
      const raw = require('fs').readFileSync(require('path').join(h.ROOT, 'src-tauri', 'windows', 'hooks.nsh'));
      assert(raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf, 'UTF-8 with BOM (Korean text)');
      const nsh = raw.toString('utf8');
      for (const s of ['!macro NSIS_HOOK_PREINSTALL', 'MessageBox MB_YESNO', '$LANGUAGE == 1042', 'ReadRegStr $R6 SHCTX "${MANUPRODUCTKEY}" ""',
        '53fff549-80b5-525f-a34e-7d99abc7f4b6', 'ExecShellWait "open"', '!macro NSIS_HOOK_POSTUNINSTALL', '$DeleteAppDataCheckboxState = 1']) {
        assertIncludes(nsh, s, s);
      }
    });

    test('Edit window: Home button left of File', () => {
      const bar = html.slice(html.indexOf('<div id="ew-menubar"'), html.indexOf('<div id="ew-win-gutter">'));
      assert(bar.indexOf('id="ew-menubar-home"') > 0 && bar.indexOf('id="ew-menubar-home"') < bar.indexOf('id="ew-menubar-menus"'), 'Home before the menus');
      assertIncludes(app, "document.getElementById('ew-menubar-home')?.addEventListener('click', () => _goHome());", 'wired');
    });

    /* ── Start-up, start screen, several copies ── */

    test('Start-up honours "show this screen at startup"; no saved folder → the home folder', () => {
      assertIncludes(app, 'const homeAtStart = _startScreen().showOnStart;', 'setting read at start-up');
      assertIncludes(app, 'if (homeAtStart) showHome = true;', 'start screen on top of the restored folder');
      assertIncludes(host, '.unwrap_or_else(|| super::home_dir().to_string_lossy().into_owned())', 'default folder = home');
    });

    test('Start screen: Explorer is the first card of "What you can do" and opens the main view', () => {
      const tasks = app.slice(app.indexOf('const HOME_TASKS = ['), app.indexOf('const HOME_TASKS = [') + 600);
      assert(tasks.indexOf("title: 'home.explorer'") > 0 && tasks.indexOf("title: 'home.explorer'") < tasks.indexOf("title: 'menu.openFolder'"), 'first card');
      assert(!/title: 'home.explorer'[^\n]*primary: true/.test(tasks), 'not in the Start group');
      assertIncludes(app, 'async function _homeExplorer()', 'handler');
      assertIncludes(app, '_showFolderInCenter(dir);', 'main view with the folder sheet');
    });

    test('Several copies can run at once: each has its host inside itself', () => {
      assertIncludes(rust, 'host::ipc,', 'host is a command of this process');
      assertIncludes(bridge, "invoke('ipc', { channel, args: args.map(encodeArg) })", 'page calls it directly');
      assert(!/127\.0\.0\.1|EventSource|fetch\(/.test(bridge), 'no local server, port or HTTP');
      assert(!/single[-_]instance/i.test(rust + h.read('src-tauri/Cargo.toml')), 'no single-instance lock');
    });

    /* ── Edit window extras ── */

    test('Edit window: About button right of Settings, colour wheel at the top of Adjustments', () => {
      const settingsAt = html.indexOf('id="ew-settings"');
      const aboutAt = html.indexOf('id="ew-about"');
      assert(settingsAt > 0 && aboutAt > settingsAt, 'About after Settings');
      assertIncludes(app, "['ew-about',     'info',        'menu.about',", 'About wired');
      assert(html.indexOf('id="ew-color-host"') < html.indexOf('id="edit-adjust-content"'), 'wheel host above the sliders');
      assertIncludes(app, 'function _moveColorWheel(toEdit)', 'one wheel moves between windows');
      assertIncludes(app, 'function _canTintEdit()', 'wheel works in edit mode');
    });
  },
};
