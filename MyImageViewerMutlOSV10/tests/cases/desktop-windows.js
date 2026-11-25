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
      assertIncludes(rust, 'fn is_fixed_dialog', 'a dialog can be fixed size');
      assertIncludes(rust, 'label == "dialog-auto-improve-overlay"', 'auto improve cannot be resized');
      assertIncludes(rust, 'dialog.set_resizable(false)', 'the fitted window stays that size');
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
      for (const s of ['position: relative !important;', 'order: 1;', 'flex: 0 0 140px;', 'border-top: 2px solid', 'min-width: 0;']) assertIncludes(film, s, s);
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
      assertIncludes(host, 'let mut p = Progress { last: 0, channel: "rembg-progress" };', 'background removal progress');
      assertIncludes(host, 'emit(self.channel, json!({ "percent": self.last, "message": message }));', 'sent on its channel');
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
      for (const s of ['!define MUI_LANGDLL_ALWAYSSHOW', '!macro NSIS_HOOK_PREINSTALL', 'MessageBox MB_YESNO', '$LANGUAGE == 1042', 'ReadRegStr $R6 SHCTX "${MANUPRODUCTKEY}" ""',
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

    test('Theme ▾ opens a drop-down under the button, not a dialog window', () => {
      const body = app.slice(app.indexOf('function _openThemeMenu(btn)'), app.indexOf('function _openThemePicker()'));
      assertIncludes(body, 'ContextMenu.show(r.left, r.bottom + 2, _themeMenuItems()', 'drop-down below the button');
      // Custom theme… and Theme settings… on top, then Dark | Light as two columns (no flyouts)
      const custom = body.indexOf('action: () => _applyCustomTheme(_readCustomTheme())');
      const settings = body.indexOf('action: () => _openThemeSettings()');
      const cols = body.indexOf('{ columns: [');
      assert(custom > 0 && custom < settings && settings < cols, 'custom, settings, then the columns');
      assertIncludes(body, "{ title: t('menu.darkThemes'), items: kind('dark') }", 'dark column');
      assertIncludes(body, "{ title: t('menu.lightThemes'), items: kind('light') }", 'light column');
      assert(!body.includes('submenu:'), 'themes listed directly');
      assertIncludes(body, "_settingsSelectTab('theme');", 'settings open on the Theme tab');
      const menu = require('../helpers').read('src/js/contextMenu.js');
      const popup = require('../helpers').read('src/js/popupMenu.js');
      assertIncludes(menu, 'container.appendChild(_buildColumns(item.columns, level));', 'menu draws columns');
      assertIncludes(menu, "out.push({ columns });", 'columns reach the overlay window');
      assertIncludes(popup, 'if (Array.isArray(it.columns))', 'overlay wires column rows');
      assertIncludes(css, '.ctx-columns { display: flex;', 'side by side');
      assert(require('../helpers').read('src/i18n/ko.json').includes('"menu.themeSettings": "테마 설정"'), 'ko label');
      assert(app.split('function _themeMenuItems()').length === 2, 'one theme menu builder');
      assert(!app.includes("label: t('menu.theme'),    action: () => _openThemePicker()"), 'View menu: submenu too');
    });

    test('Custom theme has its own preset, applies from the drop-down and can go back to it', () => {
      assertIncludes(app, "const CUSTOM_THEME_DEFAULT = { bg: '#1f2433', text: '#dde3f0', accent: '#e8a33d' };", 'preset (not a copy of Dark)');
      assertIncludes(app, 'return { ...CUSTOM_THEME_DEFAULT };', 'used when nothing is saved');
      assertIncludes(app, '_applyCustomTheme(CUSTOM_THEME_DEFAULT);', 'Default button');
      assertIncludes(app, 'icon: _customThemeSwatch()', 'its colours in the menu');
      assert(html.split('data-custom-reset').length === 3, 'Default button in Settings and in the picker');
      assert(html.split('data-custom="bg" value="#1f2433"').length === 3, 'inputs start at the preset');
    });

    test('Bottom panel: menu bar button + Window menu hide the picture strip, remembered', () => {
      assertIncludes(html, '<button type="button" class="menubar-panel-btn" id="btn-panel-bottom"></button>', 'menu bar button');
      const at = (id) => html.indexOf(`id="${id}"`);
      assert(at('btn-panel-left') < at('btn-panel-bottom') && at('btn-panel-bottom') < at('btn-panel-right'), 'order: left, bottom, right');
      assertIncludes(app, "['btn-panel-bottom', 'panelBottom', _bottomPanelTip, () => _toggleBottomPanel()],", 'wired');
      assertIncludes(app, "label: t('menu.bottomPanel'), checked: _layout.bottom", 'Window menu');
      assertIncludes(app, "if (typeof saved.bottom === 'boolean') _layout.bottom = saved.bottom;", 'remembered');
      assertIncludes(app, "classList.toggle('film-collapsed', !_layout.bottom)", 'applied');
      assertIncludes(src.css, '#viewer-area.film-collapsed #browse-view.is-filmstrip { display: none !important; }', 'hidden');
      for (const k of ['menu.bottomPanel', 'toolbar.collapseBottom', 'toolbar.expandBottom']) assert(src.ko[k] && src.en[k], k);
    });

    test('Start backgrounds: 27 scenes (three full rows of 9), each with a 3D scene, name, icon and first-paint colours', () => {
      const list = (code) => [...code.slice(code.indexOf('START_SCENE_IDS = ['), code.indexOf('];', code.indexOf('START_SCENE_IDS = ['))).matchAll(/'([a-z]+)'/g)].map((m) => m[1]);
      const ids = list(app);
      assert(ids.length === 27 && new Set(ids).size === 27, String(ids.length));
      assert(JSON.stringify(list(h.read('src/js/startscenes.js'))) === JSON.stringify(ids), 'startscenes.js has the same list');
      const scenes = h.read('src/js/start3d/scenes.js');
      for (const id of ids) {
        assert(new RegExp(`\n  ${id}: \{`).test(scenes), `scene ${id}`);
        assert(src.ko[`start.scene.${id}`] && src.en[`start.scene.${id}`], `name ${id}`);
        const key = `scene${id[0].toUpperCase()}${id.slice(1)}`;
        assert(src.icons.includes(`  ${key}: \x60<svg`) && src.icons.includes(`${key}: '#`), `icon ${key}`);
      }
      for (const id of ['canyon', 'autumn', 'glacier', 'meadow', 'galaxy']) assertIncludes(src.css, `.start-bg[data-scene='${id}']`, id);
    });

    test('Start sample paintings: 24 pictures above Background, full rows only, each with a thumbnail, image and names', () => {
      const code = app.slice(app.indexOf('START_PAINTINGS = ['), app.indexOf('];', app.indexOf('START_PAINTINGS = [')));
      const ids = [...code.matchAll(/'([a-z-]+)'/g)].map((m) => m[1]);
      assert(ids.length === 24 && new Set(ids).size === 24, String(ids.length));
      for (const id of ids) {
        assert(h.exists(`src/gallery/${id}.jpg`), `thumbnail ${id}`);
        assert(h.exists(`samples/paintings/${id}.jpg`), `image ${id}`);
        for (const k of [`painting.${id}`, `painting.${id}.by`]) assert(src.ko[k] && src.en[k], k);
      }
      assert(app.indexOf("card('paintings'") > 0 && app.indexOf("card('paintings'") < app.indexOf("card('scenes'"), 'the card sits above Background');
      // every column count the grid can take divides 24
      const cols = [...src.css.matchAll(/\.start-paintings \{[^}]*repeat\((\d+),/g)].map((m) => Number(m[1]));
      assert(cols.length >= 4 && cols.every((c) => 24 % c === 0), `columns ${cols}`);
      assertIncludes(h.read('src-tauri/tauri.conf.json'), '"../samples/paintings/": "paintings/"', 'bundled');
      assertIncludes(h.read('src-tauri/src/host/system.rs'), '"galleryDir"', 'gallery folder');
    });

    test('Title bar stays draggable: page containers carry no inherited no-drag, and it shows no build number', () => {
      // Chromium does not clip app-region boxes to scroll boxes: an inherited no-drag let tree
      // rows and thumbnails scrolled out of sight cover the title bar (no move, no double-click)
      const rule = (sel) => {
        const at = src.css.indexOf(`\n${sel} {`);
        assert(at >= 0, `rule ${sel}`);
        return src.css.slice(at, src.css.indexOf('}', at));
      };
      for (const sel of ['html, body', '#app', '#main-area', '#edit-window-body']) {
        const body = rule(sel);
        assert(!/app-region:\s*no-drag/.test(body) && /\sapp-region: initial;/.test(body), `${sel} has no region`);
      }
      for (const sel of ['#menubar', '.app-brand', '.titlebar-file']) assert(/\sapp-region: drag;/.test(rule(sel)), `${sel} drags`);
      const label = app.slice(app.indexOf('function _versionLabel'), app.indexOf('}', app.indexOf('function _versionLabel')));
      assert(!label.includes('buildNumber') && label.includes('return `V$'), 'version only');
    });

    test('Prev / next buttons step inside the ruler band', () => {
      assertIncludes(app, "container.classList.toggle('has-ruler', show && rulerOn);", 'class');
      assertIncludes(src.css, '.has-ruler > .viewer-nav-prev { left: 36px; }', 'left');
      assertIncludes(src.css, '.has-ruler > .viewer-nav-next { right: 36px; }', 'right');
    });

    test('Every popup button has an icon before its label (static dialogs, confirm box, model manager)', () => {
      // each dialog / popup block of index.html
      const blocks = [];
      const open = /<div[^>]*class="[^"]*(dialog-overlay|progress-overlay)[^"]*"[^>]*>/g;
      let m;
      while ((m = open.exec(html))) {
        let depth = 0;
        const tag = /<\/?div\b[^>]*>/g;
        tag.lastIndex = m.index;
        let t;
        while ((t = tag.exec(html))) {
          depth += t[0][1] === '/' ? -1 : 1;
          if (depth === 0) { blocks.push(html.slice(m.index, tag.lastIndex)); open.lastIndex = tag.lastIndex; break; }
        }
      }
      assert(blocks.length >= 20, `found ${blocks.length} popups`);
      const bare = [];
      for (const b of blocks) {
        for (const [, attrs, inner] of b.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)) {
          const iconned = /<svg|data-icon=|settings-lang-flag/.test(inner) || /class="[^"]*(swatch|step|-tab\b|fd-nav-btn)/.test(attrs) || /id="fd-(up|home)"/.test(attrs);
          if (!iconned) bare.push((attrs.match(/id="([^"]+)"/) || [])[1] || inner.replace(/<[^>]+>/g, '').trim());
          // a label that comes from I18n must sit on its own span, or I18n would wipe the icon
          if (/class="btn-ico"/.test(inner)) assert(!/\sdata-i18n="/.test(attrs), `${attrs}: data-i18n on the button itself`);
        }
      }
      assert(!bare.length, `no icon: ${bare.join(', ')}`);
      for (const k of ['check', 'download']) assert(src.icons.includes(`  ${k}: \x60<svg`), `icon ${k}`);
      assertIncludes(app, "document.querySelectorAll('.btn-ico[data-icon], .ew-action-icon[data-icon]').forEach((el) => { el.innerHTML = Icons[el.dataset.icon] || ''; });", 'filled at start');
      assertIncludes(app, "ico.innerHTML = Icons[_confirmButtonIcon(label, i, cancelId, defaultId)] || '';", 'confirm box buttons');
      assertIncludes(h.read('src/js/tauriAPI.js'), "const name = window.buttonIconFor ? window.buttonIconFor(label, i, cancelId, defaultId) : '';", 'desktop message box buttons');
      assertIncludes(src.icons, 'window.buttonIconFor = (() => {', 'one rule for both boxes');
      assertIncludes(app, "_setButtonLabel(m.cancel, I18n.t('progress.stopping') || 'Stopping…');", 'Stop keeps its icon while stopping');
      const sr = h.read('src/js/superResUI.js');
      assert(sr.split('<span class="btn-ico">${_icon(').length === 3, 'model manager Download / Reinstall / Remove');
      assertIncludes(h.read('src/js/fileDialog.js'), "okIcon.innerHTML = Icons[mode === 'save' ? 'save' : 'folderOpen'] || '';", 'file dialog Open / Save');
      assertIncludes(src.css, 'button:has(> .btn-ico) { display: inline-flex;', 'icon and label side by side');
    });

    test('User guide: its own window with manual language, text size and Print; pictures in both languages', () => {
      // a window of its own, not modal (dialogWindow.js), following the main theme
      const dw = h.read('src/js/dialogWindow.js');
      assertIncludes(dw, "const STANDALONE = new Set(['help-overlay']);", 'standalone window');
      assertIncludes(dw, "attributeFilter: ['data-theme', 'data-theme-kind', 'lang', 'style']", 'theme changes reach it');
      // the tool row
      for (const k of ['data-help-lang="ko"', 'data-help-lang="en"', 'id="help-font-down"', 'id="help-font-val"', 'id="help-font-up"', 'id="help-font-reset"', 'id="help-print"']) assertIncludes(html, k, k);
      assert(html.indexOf('class="help-tools"') < html.indexOf('id="help-nav"'), 'tools above the contents');
      // language for the manual alone, size remembered, keys, print
      assertIncludes(app, "md = await window.electronAPI.readHelpDoc(_helpLang);", 'manual language');
      assertIncludes(app, "const file = _helpLang === 'ko' ? '도움말.md' : 'help.md';", 'web build too');
      assertIncludes(app, "const HELP_FONT = { min: 10, max: 24, normal: 13 };", 'size range');
      assertIncludes(app, "localStorage.setItem(HELP_FONT_KEY, String(_helpFont))", 'size remembered');
      assertIncludes(app, "if (k === '=' || k === '+') _setHelpFont(_helpFont + 1);", 'Ctrl++');
      assertIncludes(app, "else if (k.toLowerCase() === 'p') _printHelp();", 'Ctrl+P');
      assertIncludes(app, "const owner = overlay?.ownerDocument || document;", 'printed from the guide window');
      assertIncludes(app, '@page { size: A4;', 'A4 page');
      assertIncludes(app, 'html, body { margin: 0; background: #fff; color: #111; }', 'black on white');
      assertIncludes(app, "const pt = (_helpFont * 0.75).toFixed(1);", 'printed at the shown size');
      // every text size in the manual follows --help-font
      assertIncludes(src.css, '.help-doc { font-size: var(--help-font, 13px); }', 'one size');
      const docCss = src.css.slice(src.css.indexOf('.help-doc { font-size: var(--help-font'), src.css.indexOf('.help-status {'));
      assert(!/font-size:\s*\d+(\.\d+)?px/.test(docCss), 'no fixed px sizes inside the manual');
      for (const k of ['help.fontSize', 'help.fontDown', 'help.fontUp', 'help.fontReset', 'help.print', 'help.printTip', 'help.langKo', 'help.langEn']) assert(src.ko[k] && src.en[k], k);
      assert(src.ko['help.title'] === '사용 설명서' && src.en['help.title'] === 'User guide', 'title');
      // both manuals: same pictures, each one on disk
      const pics = (md) => [...md.matchAll(/!\[[^\]]*\]\((help\/[^)]+)\)/g)].map((m) => m[1]);
      const ko = pics(h.read('doc/도움말.md'));
      const en = pics(h.read('doc/help.md'));
      assert(ko.length >= 8 && JSON.stringify(ko) === JSON.stringify(en), `pictures ko ${ko.length} / en ${en.length}`);
      for (const p of ko) assert(h.exists(`src/${p}`), `missing src/${p}`);
      assert(/^# MyImageViewer 사용 설명서/m.test(h.read('doc/도움말.md')) && /^# MyImageViewer User Guide/m.test(h.read('doc/help.md')), 'titles');
      assert(h.read('doc/도움말.md').includes('## 사용 설명서 창') && h.read('doc/help.md').includes('## The guide window'), 'the window explains itself');
    });

    test('Most current picture formats: the host decodes what the webview cannot (JPEG XL, JPEG 2000, PSD, RAW …)', () => {
      const fmt = h.read('src/js/formatSupport.js');
      const host = h.read('src-tauri/src/host/formats.rs');
      const imaging = h.read('src-tauri/src/host/imaging.rs');
      const cargo = h.read('src-tauri/Cargo.toml');
      // the page knows them and sends them to the host
      for (const e of ['jxl', 'jp2', 'j2k', 'psd', 'pcx', 'icns', 'tga', 'dds', 'hdr', 'exr', 'pbm', 'pgm', 'ppm', 'qoi', 'dng', 'cr2', 'cr3', 'nef', 'arw', 'orf', 'rw2', 'raf']) {
        assert(new RegExp(`'${e}'`).test(fmt.slice(fmt.indexOf('const CONVERT_EXTS'), fmt.indexOf('const IMAGE_EXTS'))), `.${e} is converted by the host`);
      }
      assertIncludes(fmt, '...CONVERT_EXTS,', 'they count as images (explorer, thumbnails, stepping)');
      assertIncludes(fmt, 'if (isConverted(filePath)) {', 'routed to convertToPng');
      for (const e of ['jfif', 'jpe', 'apng', 'dib']) assert(fmt.includes(`'${e}'`), `.${e}`);
      // the host: one decoder for viewer, thumbnails, editor and info
      assertIncludes(imaging, 'if let Some(out) = super::formats::decode(path) {', 'decode_upright asks formats.rs first');
      assertIncludes(imaging, 'if super::formats::handles(path) {', 'file info for them too');
      for (const c of ['jxl-oxide', 'hayro-jpeg2000', 'psd', 'pcx', 'icns', 'image_dds']) assert(new RegExp(`^${c} = `, 'm').test(cargo), `crate ${c}`);
      for (const feat of ['"tga"', '"hdr"', '"exr"', '"pnm"', '"qoi"', '"ff"']) assertIncludes(cargo.slice(cargo.indexOf('image = {'), cargo.indexOf('\n', cargo.indexOf('image = {'))), feat, `image crate ${feat}`);
      assertIncludes(host, 'pub fn embedded_jpeg(bytes: &[u8])', 'camera RAW: the embedded full-size JPEG');
      assertIncludes(host, 'fn jpeg_xl_opens_pixel_exact()', 'round-trip tests in Rust');
      for (const L of ['ko', 'en']) assert(/JPEG XL, JPEG 2000/.test(src[L]['about.formats']), `about lists them (${L})`);
    });

    test('User guide window: only Close in its footer (no Shortcuts / About)', () => {
      const box = html.slice(html.indexOf('id="help-overlay"'), html.indexOf('</div>', html.indexOf('class="dialog-footer"', html.indexOf('id="help-overlay"'))));
      assert(!box.includes('help-shortcuts') && !box.includes('help-about'), 'no shortcut / about buttons');
      assertIncludes(box, 'data-i18n="about.close"', 'Close stays');
    });

    test('Window menu is greyed out on the start screen, except Settings', () => {
      const body = app.slice(app.indexOf('function _windowMenuItems()'), app.indexOf('function _helpMenuItems()'));
      assertIncludes(body, 'const home = _homeIsOpen();', 'start screen checked');
      assert(body.split('disabled: home').length - 1 === 7, 'three panels, browse, fullscreen, minimise, maximise');
      assert(/label: t\('menu\.settings'\), action:/.test(body), 'Settings stays enabled');
    });

    test('Start screen opens on the chosen scene at the first paint, not a stand-in', () => {
      const h2 = require('../helpers');
      const bg = h2.read('src/js/startbg.js');
      const gl = h2.read('src/js/start3d/gl.js');
      // index.html: theme and start page (scene colours + last picture) before any script runs
      assertIncludes(html, "document.documentElement.setAttribute('data-theme', theme)", 'saved theme at first paint');
      assertIncludes(html, 'localStorage.getItem(`startSnap:${scene}`)', 'last picture of the scene');
      assertIncludes(html, "document.getElementById('start-page').hidden = false;", 'start page at first paint');
      assertIncludes(css, ".start-bg[data-scene='valley']", 'scene colours when there is no picture yet');
      assertIncludes(css, ".start-bg[data-scene='grid']", 'every scene has colours');
      // startbg.js: same key, saved while the scene runs, preview removed after the fade-in
      assertIncludes(bg, 'const SNAP_KEY = (id) => `startSnap:${id}`;', 'same key as index.html');
      assertIncludes(bg, 'this.savePreview(this.kind)', 'picture saved');
      assertIncludes(bg, 'if (!this.kit.ready())', 'draws only once the shaders are linked');
      // Shaders compile in parallel off the main thread; the 3D module loads early
      assertIncludes(gl, "gl.getExtension('KHR_parallel_shader_compile')", 'parallel compile');
      assertIncludes(app, '_ensureStartBg().then((bg) => bg?.prewarm());', 'prewarmed during start-up');
      // Restoring the last folder happens under the start screen (no flash away and back)
      assertIncludes(app, 'if (!homeAtStart) _hideHome();', 'start screen kept');
      assertIncludes(app, 'keepHome: homeAtStart', 'folder opened underneath');
    });

    test('Start screen: Explorer is the first card of "What you can do" and opens the main view', () => {
      const tasks = app.slice(app.indexOf('const HOME_TASKS = ['), app.indexOf('const HOME_TASKS = [') + 600);
      assert(tasks.indexOf("title: 'home.explorer'") > 0 && tasks.indexOf("title: 'home.explorer'") < tasks.indexOf("title: 'menu.openFolder'"), 'first card');
      assert(!/title: 'home.explorer'[^\n]*primary: true/.test(tasks), 'not in the Start group');
      assertIncludes(app, 'async function _homeExplorer()', 'handler');
      assertIncludes(app, '_showFolderInCenter(dir);', 'main view with the folder sheet');
    });

    test('Start screen is a board of movable cards (MySketchBook layout); the move handle is a four-way arrow', () => {
      const vm = require('vm');
      const boardSrc = require('../helpers').read('src/js/startboard.js');
      const sandbox = { window: {}, document: {}, localStorage: { getItem: () => null, setItem() {} }, performance: { now: () => 0 } };
      vm.runInNewContext(boardSrc, sandbox);
      const SB = sandbox.window.StartBoard;
      assertIncludes(html, 'js/startboard.js', 'loaded');
      assert(html.indexOf('js/startboard.js') < html.indexOf('js/app.js'), 'before app.js');
      assertIncludes(SB.HANDLE_SVG, 'M12 3v18M3 12h18', 'four-way arrow');
      assertIncludes(css, '.card-handle svg { width: 16px; height: 16px; fill: none; stroke: currentColor;', 'handle drawn as strokes');
      assertIncludes(css, '  color: var(--start-handle);\r\n  cursor: grab;', 'handle in its own accent');
      assertIncludes(css, 'grid-template-columns: repeat(6, minmax(0, 1fr));\r\n  grid-auto-rows: 20px;', 'six columns, 20px rows');
      for (const id of ['hero', 'begin', 'tasks', 'recent', 'folders', 'scenes']) assertIncludes(app, `'${id}'`, id);
      assertIncludes(app, '_startBoard = StartBoard.start(board, { reduced });', 'board started');
      assertIncludes(app, "StartBoard.card('hero', { body: hero, bare: true, locked: true })", 'name card cannot be moved or resized');
      assertIncludes(app, "arrange.addEventListener('click', () => _startBoard?.arrange());", 'auto arrange');
      // Default layout: the name card, Start on a whole row, Recent & Favorites beside Recent folders, then a full row each
      const ids = ['hero', 'begin', 'recent', 'folders', 'tasks', 'scenes'];
      const cells = SB.cardsOf(null, ids, { hero: 6, begin: 14, tasks: 14, recent: 12, folders: 10, scenes: 12 });
      assert(cells.hero.row === 0 && cells.hero.w === 6, 'hero spans the top');
      assert(cells.begin.w === 6 && cells.begin.col === 0 && cells.begin.row === cells.hero.h, 'Start takes the whole row');
      assert(cells.recent.w === 3 && cells.folders.w === 3 && cells.recent.col === 0 && cells.folders.col === 3 && cells.recent.row === cells.begin.row + cells.begin.h && cells.folders.row === cells.recent.row, 'Recent & Favorites beside Recent folders, under Start');
      assert(cells.tasks.w === 6 && cells.tasks.row === cells.recent.row + cells.recent.h, 'What you can do on the next row');
      assert(cells.scenes.w === 6 && cells.scenes.row === cells.tasks.row + cells.tasks.h, 'Background below');
      // the two lists in their own cards; the folders card has no repeated sub-heading
      assertIncludes(app, "const recentHost = _homePlaces(['files', 'favorites']);", 'recent files + favorites');
      assertIncludes(app, "const foldersHost = _homePlaces(['dirs']);", 'recent folders');
      assertIncludes(app, "card('folders', 'folder', I18n.t('home.recentFolders'), foldersHost, foldersHost.clearBtn || null),", 'its own card, clear on the title row');
      assertIncludes(css, '.start-actions { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; }', 'Start: two rows of four');
      const order = app.slice(app.indexOf("card('begin'"), app.indexOf("card('scenes'"));
      assert(order.indexOf("card('recent'") > 0 && order.indexOf("card('recent'") < order.indexOf("card('folders'") && order.indexOf("card('folders'") < order.indexOf("card('tasks'"), 'card order is the default arrangement');
      assertIncludes(app, "tools.append(showLabel, startSettings, arrange);", 'start screen settings in the tools row');
      assertIncludes(app, "wrap.append(tools, tip, board, foot);", 'tip banner above the board');
      assertIncludes(app, "docs.className = 'start-docs';", 'hero button group');
      assertIncludes(app, "note(HOME_TASKS.length)", 'count on the title row');
      for (const a of ids) for (const b of ids) if (a < b) assert(!SB.overlaps(cells[a], cells[b]), `${a} / ${b} overlap`);
      // Moving a card pushes the others aside, never on top of each other
      const moved = SB.place(cells, 'scenes', { col: 0, row: 0 });
      assert(moved.hero.col === 0 && moved.hero.row === 0 && moved.hero.w === 6 && moved.hero.fit === true, 'name card stays across the top');
      assert(moved.scenes.row >= moved.hero.row + moved.hero.h, 'a card dropped on the name card goes below it');
      for (const a of ids) for (const b of ids) if (a < b) assert(!SB.overlaps(moved[a], moved[b]), `after move: ${a} / ${b} overlap`);
      const hijacked = SB.layoutValue(cells);
      hijacked.cards.hero = { col: 1, row: 8, w: 1, h: 4, fit: false };
      const restored = SB.cardsOf(hijacked, ids, { hero: 6 });
      assert(restored.hero.col === 0 && restored.hero.row === 0 && restored.hero.w === 6 && restored.hero.fit === true, 'a saved name-card position is put back');
      // A saved layout comes back; an old version starts over
      const saved = SB.layoutValue(moved);
      assert(SB.cardsOf(saved, ids, {}).scenes.row === moved.scenes.row, 'saved layout restored');
      assert(SB.cardsOf({ ...saved, version: 0 }, ids, {}).hero.row === 0, 'old layout ignored');
      for (const k of ['start.moveCard', 'start.resizeCard', 'start.arrange', 'start.arrangeTip']) {
        assert(src.ko[k] && src.en[k], `missing ${k}`);
      }
    });

    test('Opening a big picture does not block the UI: decode, read-back and undo copy run in a worker', () => {
      const fmt = require('../helpers').read('src/js/formatSupport.js');
      const worker = require('../helpers').read('src/js/imageWorker.js');
      const editor = require('../helpers').read('src/js/editor.js');
      // Bytes, not a base64 string; decoded in imageWorker.js; a newer open ends the older decode
      assertIncludes(app, 'FormatSupport.loadImageForView(filePath),', 'viewer uses the off-thread loader');
      assertIncludes(fmt, 'const bytes = await readFileBytes(filePath);', 'binary IPC');
      assertIncludes(fmt, "new Worker('./js/imageWorker.js')", 'decode worker');
      assertIncludes(fmt, 'err.superseded = true;', 'latest open wins');
      assertIncludes(worker, 'await createImageBitmap(blob,', 'decoded in the worker');
      assertIncludes(worker, 'ctx.getImageData(0, 0, w, h)', 'pixels read in the worker');
      assertIncludes(worker, 'transfer.push(data.buffer, copy.buffer)', 'pixels transferred, not copied');
      assertIncludes(app, 'const shown = await _loadImageBlob(result.blob, filePath, () => openGen === _openGen);', 'blob path');
      assertIncludes(app, 'const fallback = await FormatSupport.loadImageFile(filePath);', 'page decoder when the worker cannot');
      // The editor takes the prepared pixels (no getImageData / clone here) and draws the bitmap while untouched
      assertIncludes(editor, 'function loadImage(img, prepared = null) {', 'prepared pixels');
      assertIncludes(editor, '_histShare = { src: px, version: _pixVersion, copy };', 'first undo step reuses the worker copy');
      assertIncludes(editor, 'const pristine = _pristineImage();', 'untouched picture drawn as is');
      assertIncludes(editor, 'if (!blank) displayCtx.clearRect(0, 0, frame.outW, frame.outH);', 'no clear of a fresh canvas');
      // Animated GIF / WebP still found from the bytes
      const vm = require('vm');
      const sb = { window: {}, document: {} };
      vm.runInNewContext(fmt, sb);
      const anim = sb.window.FormatSupport.hasAnimationBytes;
      const bytes = (s) => Uint8Array.from(s, (c) => c.charCodeAt(0));
      assert(anim(bytes('GIF89a....\x21\xF9\x04....\x21\xF9\x04..')) === true, 'two-frame GIF');
      assert(anim(bytes('GIF89a....\x21\xF9\x04......')) === false, 'still GIF');
      assert(anim(bytes('RIFF....WEBPVP8 ........')) === false, 'still WebP');
      assert(anim(bytes('RIFF....WEBPVP8X\x00\x00\x00\x00\x02...')) === true, 'animated WebP flag');
    });

    test('Viewer ruler: on by default, toolbar / View menu ON-OFF, remembered, red pointer marker', () => {
      assertIncludes(app, "{ id:'btn-ruler',       icon:'ruler',      tip: () => _guideTip('ruler'), action: () => _toggleGuide('ruler') },", 'toolbar button');
      assertIncludes(app, "{ icon: Icons.ruler,      label: t('menu.ruler'),       checked: _guides.ruler, action: () => _toggleGuide('ruler') },", 'View menu');
      assertIncludes(app, "return { ruler: !saved || saved.ruler !== false, grid: false };", 'saved state read, default on');
      assertIncludes(app, "const red = '#ff3b30';", 'red marker');
      assertIncludes(app, "container.addEventListener('pointermove',", 'follows the mouse');
      assertIncludes(app, "&& !(container === viewerContainer && window.Browse?.isVisible?.() && !window.Browse?.isFilmstrip?.());", 'shown with the filmstrip');
      // Declared before the start-up code that paints the first ruler (no TDZ)
      const decl = app.indexOf('let _guideCursorCanvas = null;');
      const firstUse = app.indexOf('_applyTransform();');
      assert(decl > 0 && app.indexOf('const GUIDE_RULER = 22;') < firstUse && decl < firstUse, 'state declared at the top');
      for (const k of ['menu.ruler', 'toolbar.ruler', 'toolbar.rulerOff']) assert(src.ko[k] && src.en[k], `missing ${k}`);
    });

    test('Ruler: the picture extent on both axes is one faint theme accent colour', () => {
      assertIncludes(app, "const extentColor = cs.getPropertyValue('--accent').trim() || '#60a5fa';", 'theme accent');
      assert(!/RULER_[WH]_COLOR/.test(app), 'no separate width / height colours');
      for (const k of ['RULER_EXTENT_FILL = 0.12', 'RULER_EXTENT_EDGE = 0.5', 'RULER_EXTENT_LABEL = 0.8']) assertIncludes(app, k, k);
      assert(app.split('ctx.fillStyle = extentColor;').length === 4, 'band, width label and height label all use it');
    });

    test('Start screen first paint: a missing scene is "valley", not "undefined"; the 3D canvas is born full size', () => {
      const bg = require('../helpers').read('src/js/startbg.js');
      assertIncludes(html, "const scene = typeof saved.scene === 'string' && /^[a-z]+$/.test(saved.scene) ? saved.scene : 'valley';", 'scene default');
      assertIncludes(bg, 'canvas.width = Math.max(1, Math.floor(Math.max(1, this.host.clientWidth) * ratio));', 'no 300×150 → full-size realloc');
      assert(bg.indexOf('canvas.width = Math.max(1') < bg.indexOf("canvas.getContext('webgl'"), 'sized before the context');
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
