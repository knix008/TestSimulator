# Architecture

## Overview

MyImageViewer **v1.0.2** is a cross-platform image viewer and editor. The desktop shell is **Tauri 2** (Rust + the system webview). The same renderer (`src/`) runs in two modes:

1. **Desktop** — Tauri window; the host (files, thumbnails, conversions, metadata) is Rust in the same process (`npm start`)
2. **Web** — Express static server + browser `electronAPI` shim (`npm run web`)

On Windows/Linux the window is **frameless**; chrome (brand, menus, current file, window buttons) lives on the menu bar.

```
┌──────────────────────────────────────────────────────────────┐
│  Mode A: Tauri shell (src-tauri/src/main.rs)                 │
│  ─ Frameless main window (built in Rust), asset protocol     │
│  ─ Menu overlay window (menus past the window edge)          │
│  ─ Dialog windows (window.open → owned frameless windows)    │
│  ─ OS file drag-out (drag crate), native file drop events    │
│  ─ src/host/: fs, thumbnails (image crate), TIFF, ffmpeg,    │
│    rembg, dialogs, settings, file associations               │
└────────────────────┬─────────────────────────────────────────┘
                     │  src/js/tauriAPI.js → invoke('ipc', { channel, args })
                     │                      ← event 'host-event'
├────────────────────┼─────────────────────────────────────────┤
│  Mode B: Web       │  server.js (Express → src/)             │
│                    │  webAPI.js + fileRegistry.js            │
│                    │  (same electronAPI contract)            │
└────────────────────┼─────────────────────────────────────────┘
                     ▼
┌──────────────────────────────────────────────────────────────┐
│  Renderer (src/)                                              │
│  index.html → app.js                                          │
│    ├─ Editor (history = pixels + effects + transforms)        │
│    ├─ Media transport + cues (video / audio / animated GIF)   │
│    ├─ FileTree (drive-rooted), Browse + Thumbs (contact sheet)  │
│    ├─ FormatSupport, DicomDecoder + codecs                      │
│    ├─ Info panel (file / capture / media / tags / DICOM)      │
│    ├─ I18n, ContextMenu, Tooltip, Icons                       │
│    ├─ DialogWindows, DragDrop (desktop only)                  │
│    └─ fileRegistry / webAPI (web mode only)                   │
└──────────────────────────────────────────────────────────────┘
```

---

## Run Modes

| | Desktop | Web |
|--|---------|-----|
| Entry | `tauri dev` (page from `src/`, `scripts/vendor.js` first) | `node server.js` |
| API | `src/js/tauriAPI.js` | `src/js/webAPI.js` |
| FS | Real paths / drives | Virtual paths via `FileRegistry` |
| Icons | `src/assets` + rcedit / branded exe (dev) | Favicon from `src/assets` |
| Metadata | `read-image-meta` / `read-media-meta` | File stats only |

Detection: if `window.electronAPI` is missing at page load, `webAPI.js` installs the shim and sets `platform: 'web'`.

---

## Module Descriptions

### `src-tauri/src/host/` — Desktop host (Rust, in the app process)
Until 1.0.2 this was a Node process (`host/service.js`) the page reached over HTTP on a local port; it now runs inside the app, so the installer needs no Node. The page still calls the same channel names: `tauriAPI.js` sends them through one command, `ipc(channel, args)`, answered on the blocking thread pool (`spawn_blocking`) so neither the main thread nor the async runtime waits on files or child processes. What the host pushes (progress, folder / file changes, `open-file`, `menu-action`) goes out as the `host-event` event `{ channel, payload }`. Channels answer what the Node handlers answered, errors included (`{ error }`, not a rejected call). Large binary reads use their own command, `read_file_bytes(path, max?)`, which returns a raw `ArrayBuffer`.
- `mod.rs` — dispatcher and shared helpers: user data folder (`%APPDATA%\image-viewer-multios`, the same as before), Node-compatible path functions (`node_join / dirname / basename / resolve`, so paths the page compares come back in the same form), `hidden_command` (child processes with `CREATE_NO_WINDOW`), `runtime_dir()` (the installer's `runtime/` resources; `None` in a debug build).
- `files.rs` — listings (folders first, case-insensitive), drives, ancestors, stats (ISO dates like `Date.toISOString`), `read-file-base64`, write, **rename-path** (basename only, rejects `\/:*?"<>|`), **delete-file**, **transfer-into-dir** (copy / move, `name (1).ext` on clashes, cross-drive move = copy + delete), watchers (`notify`, 300 / 400 ms quiet time).
- `thumbs.rs` — the thumbnail cache (layout below, unchanged, so old caches stay valid) and `thumb-make` / `thumb-cache-build` with the `image` crate: EXIF orientation applied, fit in 256 × 256 without enlarging, flattened on white, JPEG 76. JPEG / PNG / WebP / GIF / TIFF here; other formats answer `{ unsupported }` and the page's decoders take them. One background thread builds whole folders; a folder just opened pre-empts the one being built.
- `imaging.rs` — TIFF → PNG (`convert-to-png`) and the `basic` part of `read-image-meta` (size, format, channels, depth, alpha, ICC, orientation, progressive JPEG).
- `media.rs` — **ffmpeg**: `media-transcode` (cached MP4 H.264 / AAC or M4A in `userData/MediaCache`, progress from ffmpeg's `time=`) and `read-media-meta` (read from `ffmpeg -i`: container, duration, bitrate, streams, codecs, size, fps, sample rate, channels, bit depth, tags). ffmpeg: `MYIMAGEVIEWER_FFMPEG` → `runtime/ffmpeg(.exe)` → `node_modules/ffmpeg-static` (source tree) → PATH.
- `rembg.rs` — **AI background removal** (`rembg-remove`): runs `rembg_worker.py` (`rembg1`=U2Net, `rembg2`=RMBG-2.0, `rembg3`=ISNet) and sends `rembg-progress`.
  - **Auto-provisioning**: prefers the machine's existing Python (`IMAGEVIEWER_PYTHON` → `python`/`py` → previously app-installed); pip-installs `rembg`/`onnxruntime` on demand into that interpreter. Only if **no** Python exists does it download the official installer (Windows, per-user, isolated under `userData/python`) — it never replaces or downgrades a system Python.
  - Models: found on the computer, or downloaded by the host (`.part` file, 20 s connect / 30 s stall timeouts, md5 / sha256 check) before the worker starts; a failure answers `MODEL_DOWNLOAD_FAILED` with `retry`.
  - Progress is **monotonic**: download → install → package install → the worker's own model/inference progress are remapped into an always-advancing bar.
- `system.rs` — native dialogs (`tauri-plugin-dialog`, owned by the main window), launch file, app info (version from the app, build number from `src/version.json` at compile time), help text (`doc/` compiled in), links / "show in folder" (`tauri-plugin-opener`), printers, per-user file associations (`winreg`).
- `config.rs` — `image-viewer-ui.json`: last opened folder and window bounds (dropped when no monitor shows them).

### `src-tauri/src/main.rs` — Tauri shell
- Builds the **main window in Rust** (`tauri.conf.json` has `"windows": []`) so it can carry an `on_new_window` hook: `window.open("about:blank#dialog-<id>")` from the page creates an owned, frameless, hidden **dialog window**; `fit_dialog` sizes it, centres it over the main window inside the work area and shows it; `close_dialog` destroys it.
- **Menu overlay** (`menu-overlay`, `src/popup.html`): transparent, borderless, `focusable(false)`, owned by the main window, sized to the monitor work area. Shown and hidden with Win32 `ShowWindow(SW_SHOWNOACTIVATE / SW_HIDE)` — `show()` would activate it, the main window's blur would close the menu at once, and tao's `hide()` does not see a native show (an invisible full-screen window would then swallow every click). Commands: `popup_menu_show / shown / hide / refresh / ready / event / visible`.
- **Drag-out**: `start_file_drag(paths)` runs `drag::start_drag` (DoDragDrop) on the main thread, offered as **copy** only.
- Starts the host (`host::init`, with the first command-line argument that is a file as the launch file), exits the app when the main window is destroyed (the overlay would keep it alive otherwise) and lets the host write pending thumbnail indexes on exit (`host::shutdown`). Several copies can run side by side; each has its own host.

### `src/js/tauriAPI.js` — Desktop bridge
- Installs `window.electronAPI` when `window.__TAURI__` is present.
- `invoke('ipc', { channel, args })` for request/response (`Uint8Array` arguments travel as `{ __bytes: base64 }`); the `host-event` event for `open-file`, `menu-action`, folder / file changes, progress.
- Done in the page itself: **HEIC / HEIF** → JPEG in `js/heicWorker.js` (libheif's wasm build — the decoder heic-convert used — first top-level image, kept for the last 8 files), **EXIF / XMP / IPTC / ICC** tags with exifr's browser build on the file's bytes (the first 16 MB of a bigger file; an asset URL cannot be fetched from the page), flattened exactly as the Node host did, and the **print page** HTML.
- Window chrome (minimize, maximize, close, fullscreen, size) uses the Tauri window API. File URLs are rewritten with `convertFileSrc` (asset protocol). Images drawn onto a canvas from those URLs must use `crossOrigin = 'anonymous'`, or the canvas is tainted.
- Other Tauri commands: `popupMenu*` / `onPopupMenuEvent` (menu overlay), `startFileDrag`.
- Native file drops: the window owns the webview's drop target, so HTML5 `dragover` / `drop` never reach the page. `onDragDropEvent` is forwarded as a `native-dragdrop` window event `{ type, paths, x, y }` (CSS px).

### `src/js/popupMenu.js` + `src/popup.html` — Menu overlay page
- Draws the serialised menu with the same `contextMenu.js`; row clicks go back by id (`action` / `remove`), a press outside closes it (`closed`), and the main window's menu bar titles are reported as `title` events so hover-switching File → Edit → View keeps working while the overlay covers the screen.

### `src/js/dialogWindow.js` — Dialogs in their own windows (desktop)
- A `MutationObserver` sees a `.dialog-overlay` become visible, opens its dialog window, **moves the overlay's DOM into that same-origin document** (listeners travel with the nodes), freezes the box at its in-page size (the CSS sizes ride `vw`/`vh`) and calls `fit_dialog`. Hiding the dialog moves the DOM back and closes the window. `progress-overlay` stays in the page.
- While a dialog is out: `document.getElementById / querySelector / querySelectorAll` also search the dialog windows (app.js looks dialog elements up on `document`), Esc pressed in a dialog is re-dispatched to the main document, the main window is blocked by `#dialog-window-blocker`, the title row is an `app-region: drag` (macOS/Linux: `dialog_start_dragging`), tooltips draw in the dialog's own document.

### `src/js/dragdrop.js` — Drag & drop (desktop)
- In-app drags use **pointer events** (not HTML5 DnD): thumbnails / explorer files → explorer folder rows or folder tiles (move; Ctrl = copy), with a ghost and a `dd-target` highlight. Leaving the window mid-drag hands the same files to `startFileDrag` (OS drag-out).
- `native-dragdrop` (files from Explorer / other apps) is routed by app.js: onto a folder row / tile → into that folder; onto the open contact sheet → into the folder it shows; else → open the folder / first media file. Mode follows Explorer: same drive = move, other drive = copy.

### `server.js` — Web Static Server
- Serves `src/` on `127.0.0.1` (default port **8080**, increments if busy).
- No conversion backend; decoding stays in the renderer / optional vendor scripts.
- Exposes only the DICOM vendor packages under `/node_modules/<pkg>/…` (`dicom-parser`, the four `@cornerstonejs/codec-*` packages, `jpeg-lossless-decoder-js`) so the page's `../node_modules/…` script URLs resolve in both modes.
- Menus are drawn in the page (`contextMenu.js`). On the desktop they are drawn by the menu overlay window instead (see `src-tauri/src/main.rs`), and fall back to the page if the overlay fails. The desktop page loads the same vendor builds from `src/vendor/node_modules/…`, copied there by `scripts/vendor.js` (run before `tauri dev` / `tauri build`; generated, not in git) — the DICOM codecs, libheif and exifr.

### `src/js/webAPI.js` + `fileRegistry.js` — Web Shim
- Implements the same `electronAPI` surface for the browser.
- `FileRegistry`: maps virtual paths (`/…`) to `File` / `FileSystemDirectoryHandle`.
- Open file → `<input type="file">`; open folder → `showDirectoryPicker()` or `webkitdirectory`.
- Save → `showSaveFilePicker()` or `<a download>`.
- No-ops / errors: `showItemInFolder`, `renamePath`, `deleteFile`, `startDrag`, `fs.watch`, `readImageMeta`, `readMediaMeta`, `getLaunchFile`.

### `src/js/app.js` — Orchestrator
- State: lang, theme, currentFile, fileList, zoom/pan, dirty flag, cached `imageMeta` / `mediaMeta` / `dicomMeta`.
- **Edit window chrome**: `#edit-window-titlebar` (32 px drag region: brand "Edit Image", file name, window-button gutter), `#ew-menubar` (built by `_buildMenubarInto()` from `_ewMenubarDefs()` — File / Edit / View reuse the editor actions, Effects / Help share the main items; button ids `menubar-ew-*`, `_menubarOpen` keys carry the prefix) and `#ew-toolbar-row` (tool / action / transform / undo-redo / zoom / theme groups, spacer, Save · Cancel · Apply). `_editMinWidth()` measures the toolbar row (`_measureFlexContentWidth` now counts margins) and sizes the window on open.
- **Preferences**: every persisted option is a `localStorage` key; `PREF_DEFAULTS` / `_pref()` / `_setPref()` / `PREF_KEYS` (app.js) back the Settings dialog (`_initSettingsDialog` — `min(900px, 100vw - 48px)` × `min(620px, 100vh - 48px)`, wide enough that all 40 theme tiles fit with the body still `overflow: hidden`; tabbed: General / **Theme** / Viewer & editing / DICOM / Media, `_syncSettingsDialog` refills it, `_resetAllSettings` clears `PREF_KEYS` and reloads). The sizing rule is `.dialog-box.settings-dialog-box` — two classes, because the generic `.dialog-box` rule is declared later in `main.css`. The Theme tab is filled by `_fillSettingsThemeButtons()` (one color-preview button per `Themes` entry; click → `_applyTheme`) into an `auto-fill` grid so the tiles reflow to the dialog width. Options: `restoreSession`, `zoomStep`, `viewerChecker`, `imageSmoothing` (`_applyViewerPrefs` → CSS classes), `dicomDefaultFps`, `dicomOverlayColor`, `dicomAnnotations`, plus the non-dialog toggles `dicomRulerAxes` / `dicomScaleBar` / `dicomScalePos`, `browseViewV1`, `panelLayoutV2` (`{ left, right }` expanded flags), and the older `theme`, `lang`, `bgRemoveAlgo`, `subtitlesEnabled`, `subtitleLanguage`, `mediaVolume` / `mediaMuted`.
- **Chrome** is three rows: `#titlebar` (brand = icon · name · version, centred current-file name, drag region, fixed `#window-controls` at the right — 32 px, 40 px while the edit window is open), `#menubar` (built by `_buildMenubar()`), `#toolbar` (icon buttons + zoom input, no drag).
- **Menu bar**: `_menubarDefs()` → File / Edit / View / Effects / Help; each menu is a `ContextMenu` dropdown built on open (`_fileMenuItems()` …) so enabled / checked state is always current. Every item has an icon (`icons.js`). `mousedown` on a menu button opens / toggles it (so the document click that closes menus cannot race), `mouseenter` on a sibling switches menus while one is open; `ContextMenu.show(x, y, items, { onHide })` clears the highlight. File menu: open file, open folder (click = browse; hover = **recent folders** flyout with per-row × via `item.remove` and `ContextMenu.refreshSubmenu()`), save as, **Export ▸** (`_exportAs(ext)` → `_saveAs(false, { ext })` presets the extension), **Print…** (`_printImage`), file info, show in Explorer, delete, exit (desktop only).
- **Print**: toolbar 🖨 / File ▸ Print… / `Ctrl+P` → `_openPrintPreview()` (`#print-overlay`). The renderer exports the current view as PNG (`Editor.exportAsDataUrl`, or a snapshot of the animated frame), lists printers via `getPrinters` IPC (`webContents.getPrintersAsync`, default first + selected), and computes the page geometry in mm (`_printLayout`: paper table, auto/portrait/landscape, margins, fit / actual (96 dpi) / custom %) — the preview paper is drawn to scale. **Print** → `printImage` IPC with `{ deviceName, pageSize, landscape, marginMm, imgWmm, imgHmm, copies, color }`; main renders the image at exactly that mm size in a hidden `BrowserWindow` and calls `webContents.print({ silent: true, deviceName, pageSize, landscape, margins: custom(px), copies, color })` — no system dialog. Without a printer (web) it falls back to the popup + `window.print()` with `@page { size; margin }`. Paper/margin/scale prefs persist in `localStorage.printPrefs`.
- **Themes**: `src/js/themes.js` is the registry (id, dark/light kind, name, swatch colours) used by the renderer (`window.Themes`). `main.css` defines per-theme `--t-*` base tokens under `[data-theme="<id>"]`; one shared `:root[data-theme]` block derives every other variable from them with `color-mix()`, and `:root[data-theme-kind="dark|light"]` holds the kind-only values (hover tints, shadows, tooltip). `_applyTheme(id)` sets both attributes, persists `theme`, and re-syncs toolbar / settings / native menu. Toolbar: palette button = `_nextTheme()` (wraps through the list), ▾ = `_openThemeMenu()` (ContextMenu with `Themes.swatchSvg`). Native menu actions are `theme:<id>`.
- Language button shows the flag (`Icons.flagKo` / `Icons.flagUs`) of the **target** language (US flag when UI is Korean, Korean flag when UI is English).
- **Settings dialog** (`#settings-overlay`, `_initSettingsDialog` / `_syncSettingsDialog`): Theme tab color buttons, language flag buttons, background-removal algorithm (mirrors `#ew-bg-algo` / `bgRemoveAlgo`), subtitles default. Opened by the gear toolbar button, File ▸ Settings…, or the `show-settings` menu action.
- **Status-bar progress**: file open / folder load paint `#status-progress` (and the edit-window twin) instead of a modal overlay on the main viewer. Edit-window long effects still use the modal `ProgressDialog`.
- **Explorer rename**: tree context **Rename** → `#rename-overlay` (`_promptRename`) → `renamePath` IPC → `FileTree.remapPath` + rewrite of `state.currentFile` / `fileList` / recent dirs / watches.
- Dialog headers use `.dialog-title` = `.dialog-title-icon[data-icon]` + label; icons are filled from `Icons` at init (the file dialog swaps `#fd-title-icon` per mode).
- Toolbar, viewer, edit window, dirty title (`●`), save-as MIME by extension.
- **Edit session dirty**: previews inside the edit window do not mark the file dirty; **Cancel** / Esc discards with no Save dialog; **Apply** commits the session and marks dirty only if something changed.
- Side panels: `#sidebar` (explorer over `#info-panel`, split by `#sidebar-v-resize`) and `#right-sidebar` (`#color-panel`). `_layout = { left, right }`; `_applyPanelLayout()` toggles a `.collapsed` class (never `hidden`) — CSS shrinks the side to a 30px rail that keeps each `.panel-header` (icon + `writing-mode: vertical-rl` title) with the single `.panel-collapse-btn` on top. Toolbar `btn-panel-left` / `btn-panel-right`, Window menu and native menu (`panel-left` / `panel-right`) call the same `_toggleLeftPanel` / `_toggleRightPanel`.
- Colour panel: `_initColorPanel` builds sliders with ids `cp-<effect>` (so `_syncSlidersFromEffects('cp')` refreshes them) and the wheel canvas `#cp-wheel` (HSV disc; commits on pointer-up through `Editor.setEffects({ tintColor, tintAmount })` → one history step). Editor effect `tintColor` / `tintAmount` is applied in `_composePhoto` by `_applyTint` (a `color`-blend layer clipped to the photo's alpha). `_queueColorPanelSync()` (rAF-coalesced) runs from the Editor render callback, `_onHistoryChange` and `_updateInfoPanel`; it redraws the histogram from `_imageStats(_colorSource())`. The panel constants and state (`CP_SLIDERS`, `_cpWheelDrag`, `_cpSyncQueued`) are declared at the top of app.js because `_initPanelLayout()` runs during module init (TDZ).
- Details dialog: `_showFileInfoDialog(path)` fills `#details-overlay` with `_renderInfoSections` (same tables as the panel, `_bindInfoTagFilter` on both), prepends `_analysisSection(_imageStats(..., 1024))` for the open file, and restores the open file's metadata caches when it reads another file.
- Info panel: images → file / capture / location / DICOM / all metadata; A/V → **File / Media / Tags** (HTML-escaped). DICOM shows the summary (`meta`, labelled through `info.<key>`) and an **All DICOM tags** section (`state.dicomTags`: nested sequence items indented by `depth`, `Item n` header rows, a filter `<input>` in the section header handled by `_initInfoTagFilter` through `data-search`).
- **Menus**: `ContextMenu.show()` (contextMenu.js) draws the menu in the page. The viewer context menu keeps everyday actions top-level and groups the rest into **Transform / Zoom / More tools** flyouts; DICOM adds compact **Frames / Window / Colour map / Annotations / Overlay planes / Measure / DICOM export** entries (`_dicomContextItems`, shared with the View menu).
- **DICOM bar** (`#dicom-controls`, same styling as the media bar): `state.dicom` holds the decoder session; `_dicomApply()` re-renders one request at a time (a request made while busy is coalesced), swaps the picture with `Editor.replaceSource()` (keeps rotation / flip / effects, drops pixel edits) and restores the previous dirty state — windowing never marks the file changed. Frames: buttons / slider / wheel / `PgUp` `PgDn` `Home` `End`, cine (`Space`; `setTimeout` chain using the Frame Time Vector, else the file's rate, else the `dicomDefaultFps` preference; `#dcm-fps` overrides). Window: preset select (per-frame file windows via `windowsFor()`, `lut:i` VOI LUT entries, auto, CT presets; `_dicomPresetId` detects the active one), C / W inputs (disabled while a LUT is active), invert (`I`), reset (`W` → `resetWindow: true`), colour map select (`M` cycles), overlay toggle (`V`, only when the file has overlay planes), annotations toggle (`O`), measurement tool buttons, **Ctrl+drag / middle-drag** (`_dicomBeginWindowDrag`, runs before the pan handler). The bar shows for every DICOM (frame / window groups only when applicable) and hides in edit mode.
- **DICOM overlay layer** (`#dcm-overlay`, a canvas covering the viewer, drawn in screen space so line widths / text never scale): `_dicomMapping()` converts image pixels ↔ viewer pixels through the display canvas rect, the border-frame padding and the Editor rotation / flip; `_dicomGeomValid()` disables the layer once a crop / resize changed the photo size or in edit mode. `_dicomOverlayDraw()` (requested via rAF from `_applyTransform`, `_dicomApply`, resize) draws the corner annotations (`_dicomDrawAnnotations`: patient / study / geometry / window text, orientation markers from `image.dirLabel()` of the screen axes mapped into image space), the **axis rulers**, the **scale bar** and the measurements (`_dicomDrawMeasurements`: ruler in mm / px, angle, ellipse / rectangle ROI with `image.stats()`); labels stay above the DICOM bar. Tools (`_dicomTool`, `_dicomMeas`, `_dicomDraft`) capture mouse events on the overlay while active (`is-tool`), `Esc` / `Delete` handled in `_dicomKeydown`. Measurement changes go through `_dicomMeasCommit()` (snapshot history `_dicomMeasHist`, 50 steps): `_dicomMeasAdd / Delete / DeleteLast / Clear / Undo / Redo`; `_undoEdit` / `_redoEdit` pick the measurement history or the Editor history by which changed last (`_actionSeq` vs `_editorSeq`), and `_updateUndoRedoBtns` enables the viewer buttons for either. `_dicomMeasHitTest(x, y)` finds the measurement under a right-click (segment distance / inside an ROI) for the context menu's "Delete measurement" entry; `_dicomMeasRows()` lists them with × buttons in the Measure flyout. The **pixel probe** (`_dicomProbeRefresh`, `#status-probe`) reads `image.valueAt()` on mouse move.
- **DICOM rulers and scale bar** are two independent toggles, each with its own button in the DICOM tools group, a shortcut (`G` / `B`) and a context-menu row. `_dicomScreenUnits(map)` turns the pixel spacing plus the current rotation / flip into physical units per *screen* pixel along each screen axis, and `_dicomTickStep` picks a round step at least ~64 px wide. `_dicomDrawRulerAxes` paints graduated bands down the full top (X) and left (Y) edges, zeroed on `toScreen(0, 0)`, in mm / cm when a spacing exists and in pixels otherwise. `_dicomDrawScaleBar` draws a horizontal bar at `_dicomScalePos` — a `{ x, y }` **fraction** of the viewer box, so it survives resizes — and records `_dicomScaleBox` for hit testing. `_initDicomScaleDrag` grabs it from `viewerContainer` in the capture phase (only when no measurement tool is active, so it cannot steal a drag from one), moves it live and persists the spot on drop under `dicomScalePos`; `_dicomResetScalePos` puts it back at the top-left.
- **Viewer chrome vs. the contact sheet**: `#browse-view` sits above the viewer, so `_dicomHasBar()` returns false while `Browse.isVisible()` — that hides the DICOM bar and the overlay in one place — and `_updateMediaControlsVisibility` does the same for the transport bar. `_syncBrowseChrome()` (fired by `Browse`'s `onVisibility`) re-runs all three whenever the sheet appears or disappears.
- **DICOM export**: `_dicomExportFrames` (pick a directory, render every frame through the session, `writeFile` PNGs, restore the frame), `_dicomExportTags` (in-app save dialog with `saveTypes` JSON / CSV / TXT → `_dicomTagsText`), `_dicomCopyTags` (clipboard).
- **Media transport** (`#media-controls`): Play / Pause / Stop, seek + time for video; same play/pause/stop for animated GIF. Overlay cues (`#media-cue`): play/stop flash; pause badge persists only while actually paused (not on first open). Video click (without drag) toggles playback; context menu includes Play/Pause/Stop.
- Sidebar: explorer and info panels `flex: 1 1 0` (equal height); vertical splitter persists `sidebarTreeHeightV2`.
- Effect sliders: `input` → live preview (`setEffect(..., false)`); `change` → history commit. Wheel over a slider scrolls the panel.
- Effect presets: `_buildEffectsPanelIn` groups presets into collapsible category sections (`.fx-cat`); any preset missing from a category falls into a **Misc** group so nothing can silently disappear. Category headers persist collapse state (`fxCat:*`).
- AI background removal: `rembgRemove` (IPC) with a progress dialog fed by `rembg-progress`; `_progressMessage` maps worker phase codes (incl. `downloading_python` / `installing_python` / `installing_deps`) to localized strings.
- Border/caption UI: thickness (px, max 480), shadow, caption template tokens, font family/size/color, bold/italic/underline/strikethrough.
- Desktop: restores last folder/file unless a launch file was passed on the command line.
- Web: skips path restore; drag-drop registers `File` objects into `FileRegistry`.

### `src/js/editor.js` — Canvas Editor
| Concern | Implementation |
|---|---|
| Effects | CSS filters + pixel convolution + vignette / grain / posterize / solarize |
| Presets | ~118 curated presets (`PRESETS` map) rendered as **collapsible categories**; per-category collapse state in `localStorage` (`fxCat:*`) |
| Miniature | `_applyMiniatureDof` — soft horizontal shallow DOF + toy-model color grade (`tiltShift` / diorama depth) |
| Border | Mat pad up to 480px, shadow styles, caption with configurable typography |
| Selection | Rect, lasso, polygon, magic wand (BFS) |
| Overlay | Yellow dashed selection on `#sel-canvas`; stroke width / dash / handles are divided by the canvas-to-display scale (`_selScale`) so outlines keep a constant on-screen thickness at any zoom or image size |
| BG remove / crop | Algorithmic (mask-guided alpha, flood/chroma) + AI (`rembg` via main-process worker); crop uses off-screen canvas |
| Undo/Redo | Snapshots of pixels **and** effects / rotation / flip (`MAX_HISTORY` 20) |
| Source swap | `replaceSource(img)` — new picture (DICOM window / frame) keeping transforms and effects; resets history |

### `src/js/formatSupport.js` — Format Loader
| Format | Desktop | Web |
|---|---|---|
| JPEG/PNG/GIF/BMP/WebP/SVG/ICO/AVIF | Native load (the webview decodes them) | `FileReader` data URL |
| TIFF | `convert-to-png` in the host (image crate) | Optional UTIF; canvas fallback |
| HEIC/HEIF/HIF | libheif (wasm) in `js/heicWorker.js` | Optional heic2any |
| DICOM | `dicomDecoder.js` in the renderer (`read-file-bytes` → `DicomDecoder.load`); no host decoder | Same decoder in the renderer |
| Video/Audio | `file://` URL | `blob:` object URL |

### `src/js/dicomDecoder.js` — DICOM session decoder
- Shared Node / browser UMD module. `DicomDecoder.load(bytes)` parses with **dicom-parser** and returns an *image session* that keeps the decoded samples per frame (cached) and re-renders on demand: `render({ frame, wc, ww, invert, voiLut, voiFunction, colormap, overlays, overlayColor, resetWindow })` → RGBA, `toCanvas()` / `toDataUrl()` in the browser.
- **Transfer syntaxes**: implicit / explicit LE, explicit BE, deflated (own RFC 1951 inflater — the browser's `DecompressionStream` aborts on trailing bytes), RLE (own PackBits-per-plane decoder), JPEG baseline / extended (**libjpeg-turbo** 8-bit and 12-bit builds, tried in turn), JPEG lossless (**jpeg-lossless-decoder-js**), JPEG-LS (**CharLS**), JPEG 2000 / HTJ2K (**OpenJPEG**).
- **Codec loading**: `vendor(kind)` — `require()` in Node; in the renderer a `<script>` tag from `../node_modules/…` (relative to `document.baseURI`, override with `setVendorBase()`). The pure-JS (`*_decode.js`) Emscripten builds are used so no `.wasm` fetch is needed on `file://`. The CommonJS lossless decoder is loaded through a temporary `window.module` shim. Each module loads once and is cached.
- **Frames**: uncompressed frames are sliced by size; encapsulated frames use the basic offset table, one-fragment-per-frame, a JPEG-marker–built table, or an even fragment split.
- **Pixels**: 1 / 8 / 12 (packed) / 16 / 32-bit, signed / unsigned, planar or interleaved; YBR → RGB (uncompressed only — JPEG codecs already return RGB); PALETTE COLOR LUTs; pixel padding value excluded from the auto range.
- **Values**: bits above High Bit are masked (sign-extended for signed data) so embedded overlay bits never reach the values; Rescale Slope / Intercept or a **Modality LUT Sequence** give the rescaled value (`valueFnFor(frame)`); pixel padding value / range excluded from ranges and statistics; **float pixel data** (7FE0,0008 / 0009) decoded as Float32 / Float64.
- **Window**: VOI = window centre / width with the file's **VOI LUT Function** (LINEAR per C.11.2.1.2.1, LINEAR_EXACT, SIGMOID) or a **VOI LUT Sequence** table (`voiLuts`, `state.voiLut`); integer data ≤ 16 bit goes through one 256 / 65536-entry lookup table per render. Default invert = MONOCHROME1 xor Presentation LUT Shape INVERSE. Windows follow each frame's own values (enhanced multi-frame `Frame VOI LUT`) until the caller sets one (`windowCustom`); `resetWindow` returns to them. `fileWindows` / `windowsFor(frame)`, `presets` (CT Hounsfield presets), `autoWindow()`, `defaultWindow(frame)`, `defaultInvert()`.
- **Colour maps**: `colormap` option (`COLORMAP_IDS`: gray, hotiron, pet, hotmetalblue, pet20, jet, rainbow, bone) applied to the 8-bit grey output; `DicomDecoder.colormap(id)` returns the 256 × RGB table.
- **Overlay planes**: `readOverlays()` scans groups 6000–601E (rows / cols / origin / frames / Image Frame Origin / label; packed 1-bit data, or an *embedded* overlay in an unused high bit of the samples) → `overlays`; `render({ overlays, overlayColor })` blends them after the grey / colour pass.
- **Enhanced multi-frame**: `readFunctionalGroups()` reads the Shared and Per-frame Functional Groups (Frame VOI LUT, Pixel Value Transformation, Plane Position / Orientation, Pixel Measures, Frame Content); `frameInfo(i)` merges top-level → shared → per-frame values (windows, slope / intercept, position, orientation, pixel spacing, slice thickness / location computed along the slice normal, stack / in-stack position).
- **Geometry / cine**: `geometry` (pixel spacing with its source tag, slice thickness, orientation, position, anatomical `markers`, aspect), `dirLabel(sx, sy)` (label of an image-space direction from the orientation cosines or Patient Orientation), `frameTimes` (Frame Time Vector) and `frameRate` (Recommended Display Frame Rate → Cine Rate → Frame Time), `units` (HU for CT rescale, Rescale Type, PET Units).
- **Probe / statistics**: `valueAt(x, y, frame)` (stored + rescaled value, units, padding flag, RGB for colour / palette), `stats({ x, y, w, h, shape })` (n, mean, std, min, max, area px / mm²), `histogram(bins)` — all synchronous on the cached frame.
- **Metadata**: `meta` (flat summary keyed like the `info.*` i18n labels — now also frame rate, image position / orientation, VOI LUTs, units, Presentation LUT, overlays) and `tags` (every element, sequence items nested with `depth` / `item` rows up to 4 levels, built-in name dictionary incl. overlay groups, VR-aware formatting, binary summarised).
- Partial datasets thrown by dicom-parser (`{ exception, dataSet }`) are used when they still carry pixel data (truncated files).
- `decode()` / `decodeToDisplay()` remain for the main-process fallback and old callers.

### `src/js/themes.js` — Theme registry
- Used by the renderer (`window.Themes`). 40 palettes (20 dark, 20 light) with `id`, `kind`, display name, `nameKey`, and a 3-color `swatch` used by menus and the Settings Theme tab.
- `normalize` / `kindOf` / `ofKind` / `next` / `label` / `swatchSvg`. Colours themselves live in `main.css` (`[data-theme="<id>"]`).
- Every registered id must have a matching `[data-theme]` block; `tests/cases/status-i18n-theme.js` checks that pairing.

### `src/js/fileTree.js` — Explorer
- Roots from `listDrives()` (Windows letters, macOS volumes, Linux mounts; web → **Local Files**).
- Drive buttons in the panel title (`#tree-drive-bar`) open that root immediately.
- Lazy expand; `revealPath()` expands ancestors to a full absolute path. It **merges** the chain into `_expandedDirs` rather than replacing it, so branches the user opened elsewhere survive a folder open; `_pruneExpanded` caps the set at `MAX_EXPANDED` (oldest first, never the live chain or a drive root) to keep `refresh` cheap.
- Path bar (`#tree-path-bar`) is a small toolbar: an **Up** button (`#tree-up-btn`, disabled at a root) plus clickable **breadcrumbs** (`#tree-crumbs`) built by `_pathCrumbs`. `_parentOf` stops at `C:\` and `/`. Both land in `navigateTo(dir)`, which expands the chain, focuses it, scrolls it into view and calls `onDirOpen(dir, { activate: false })`.
- `setSelected` only highlights the row (no tree rebuild); `scrollTop` moves the row into view if needed. `refresh({ force: true })` is the only structural rebuild — its signature walk (`_walkExpandedPaths`) applies the same folders-only filter as `_renderDir`, or a browse-mode switch would look like "nothing changed".
- `handleKey` / `_moveBy`: `ArrowUp` / `ArrowDown` move among visible rows and call `onSelect` for supported media (folders stay highlight-only); `Backspace` and `Alt+ArrowUp` call `goUp()`. Wired from `app.js` when not typing and not in edit mode.
- Double-clicking a media row calls `onActivate`, the explicit "show me only this image" gesture.
- `remapPath` / `forgetPath` keep expansion and selection consistent after rename / delete.
- `applyI18n()` re-labels the chrome this module builds in JS (the Up button title, crumbs) after a language switch.
- Drag-out to OS only when not in web mode.

### `src/js/browse.js` — Thumbnail contact sheet
- One folder at a time in `#browse-view` (z-index above the viewer). Subfolders first, then media, filtered by `FormatSupport.isSupportedFile`.
- Three modes — `grid` / `list` / `details` — plus sort key, direction and a single **size** value, all persisted under `browseViewV1`.
- Size moves along the `SIZES` ladder from the toolbar stepper (`#browse-size-dec` / `#browse-size-val` / `#browse-size-inc`), `Ctrl`+wheel and `Ctrl` `+`/`-`. It sets `--browse-tile` (grid) and a derived `--browse-row` (list / details row thumbnails), so one control scales every mode.
- `details` adds a header row (`#browse-head`) whose cells double as sort buttons, over columns Name · Type · Size · Dimensions · Modified · Created. Dimensions arrive from `Thumbs` as thumbnails finish; `Created` comes from `birthtimeMs` on `read-directory-detailed`.
- Callbacks: `onOpenFile` / `onOpenDir` / `onContextMenu`, plus `onSelect` (selection only — `app.js` fills the File Info panel without opening the file) and `onVisibility` (the toolbar button and the viewer chrome follow what is on screen).
- `applyI18n()` rebuilds the bar, because its labels are baked into the markup; the `thumb-ready` listener is bound once in `init` (`_bindThumbReady`) so rebuilds cannot stack copies.
- **Selection** is a set (`_sel`, keys = `_norm(path)`) plus a focus (`_selected`, the item last clicked — Enter / File Info) and an `_anchor` for Shift ranges over `_shownPaths()` (display order). Click / `Ctrl` (`_toggle`) / `Shift` (`_selectRange`) / `Ctrl+A` (`selectAll`). `_bindMarquee` starts a box after 5 px of pointer travel (shorter = a click), hit-tests tiles by `offsetLeft/Top` against `.browse-grid` (`position: relative`), auto-scrolls past the top / bottom edge and swallows the click that ends the drag (`_suppressClick`). Right-click inside the selection keeps it and calls `onContextMenu(entry, x, y, getSelectedPaths())`; `app.js` passes that as `{ paths }` to `_showTreeContextMenu`, which then uses it instead of the explorer's selection (folders included for copy / move / delete, files only for Open). `refresh()` re-reads the folder with `keepSelection`, and `_scheduleTreeRefresh` calls it on directory-change events.
- **Filmstrip scrolling** moves `#browse-grid` itself (`_grid.scrollTo`), never `scrollIntoView`: that scrolls every `overflow:hidden` ancestor too, and repeated `>` presses slid `#viewer-area` sideways (the parked effects drawer came into view, the `<` went under the sidebar). `#viewer-area` is `overflow: clip` for the same reason. `open()` drops a directory read superseded by a newer `open()` (`_openGen`) and keeps the selection when the same folder is re-read.
- **Drag to the explorer** (Tauri desktop: `dragdrop.js`, pointer events — the HTML5 path below is the Electron / browser one): tiles are `draggable` when `canDrag`; `dragstart` puts the selection in `application/x-imageviewer-paths` (JSON) with `effectAllowed = copyMove` and a count-badge ghost for several items. A press on a draggable tile therefore never starts the marquee. `fileTree.js` recognises that type in `dragover` (move unless `Ctrl`) and `drop`, and hands `{ paths, destDir, mode }` to `onInternalDrop` → `_transferPathsInto`, which refreshes the tree and the sheet in parallel. It deliberately does **not** use `webContents.startDrag`: on Windows that keeps the main process in the OS drag loop after a drop on our own window until the next click, so the move IPC stalled.

### `src/js/thumbs.js` — Thumbnail cache
- Bounded LRU (`MAX_CACHE`) with a small work queue (`CONCURRENCY`); `request(path, { front })` jumps the queue for a tile that just scrolled in, `prefetchDir` warms a folder in the background, and each finished thumbnail fires a `thumb-ready` window event.
- `_sourceFor` takes whatever the loader produced: a file URL for native formats, a data URL, or a **canvas** — which is how DICOM arrives, so `.dcm` files get thumbnails too.
- **Per-directory disk cache** (`src-tauri/src/host/thumbs.rs`, `thumb-cache-*` IPC): `<userData>/ThumbCache/<sha1(dir)>/index.json` (`{ v, dir, entries: { name: { size, mtimeMs, w, h, tw, th, file } } }`) plus `<sha1(name)>.jpg`. `thumb-cache-load` returns only entries whose source size + mtime still match (stale ones are deleted); `thumb-cache-put` writes the JPEG and batches index saves (1 s debounce, written on exit). Nothing is written into the user's folders. `request()` awaits `_ensureDir(dir)` (one load per directory per session) before queueing, so a known folder paints straight from `file://` URLs.
- **Host-built thumbnails (desktop)**: `thumb-make(file)` decodes and downsizes in the host with the **image** crate (JPEG / PNG / WebP / GIF / TIFF; EXIF-rotated, 256 px JPEG, same cache entry format), so no image bytes cross the IPC; `_generate()` asks the host first and only falls back to the page for formats it does not read (BMP / ICO / AVIF / SVG / HEIC / DICOM). `thumb-cache-build(dirs, { front })` builds whole folders in the background, one file at a time; a `front` request (the folder just opened) pre-empts the current folder, which is requeued and resumes cheaply. `prefetchDir` sends the opened folder as `front`; start-up sends the other recent folders (`Thumbs.warmDirs`).
- **Background generation (page)**: `jpg/png/gif/bmp/webp/ico/avif` bytes (`readFileBytes`) are transferred to `src/js/thumbWorker.js`, which decodes with `createImageBitmap` (EXIF orientation applied), downsizes on an `OffscreenCanvas` and returns JPEG bytes. TIFF / HEIC / DICOM / SVG still need the page's decoders, so `_generateOnMainThread` runs them after `requestIdleCallback`. If the worker cannot start, everything falls back to that path. Settings ▸ General shows the cache size (`thumbCacheStats`) and clears it (`Thumbs.clearDiskCache`).
- Opening a file adds `.is-switching` to `#viewer-container` (`_beginViewerSwitch`, which also pauses playing media) so the previous image never shows while the next decodes; only the newest open (`openGen === _openGen`) removes it.

### Other renderer modules
- `i18n.js` — `en.json` / `ko.json`, `localStorage` lang
- `icons.js` — inline SVG (undo/redo, rotate, drive, window controls)
- `contextMenu.js` — dropdown / context menus: rows with icon, label, detail, shortcut, `checked`, `danger`, `inline`, `remove`, and `submenu`. **Every row shows an icon**: a checked row keeps its icon and adds `.ctx-checkmark` at the right; a row without one gets a neutral dot (or the check). `_place()` calls `_fitColumns()` first: a list taller than the screen (the 40-palette theme picker) gets a fixed height and an `is-columns` class. On the desktop menus are serialised to the menu overlay window (`electronAPI.popupMenu`), with the in-page menu as fallback.
- `dragdrop.js`, `dialogWindow.js`, `popupMenu.js` — see above.
- `tauriAPI.js` — desktop `electronAPI`. `webAPI.js` is the browser counterpart.
- `tooltip.js`

### `scripts/`
| Script | Role |
|---|---|
| `create-icons.js` | Rebuild PNG / ICO from `src/assets/icon.svg` |
| `stamp-version.js` | Write the build date as `buildNumber` and sync `tauri.conf.json` |
| `rembg_worker.py` | Optional Python helper for background removal |

Packaged Windows: runtime `AppUserModelId` matches `build.appId`. Taskbar icon prefers an unpacked `.ico` or `process.execPath` (Shell cannot load icons from `app.asar`). Assets `icon.ico` / `icon.png` / `icon_512.png` are `asarUnpack`ed as a fallback.

---

## Image metadata pipeline

Desktop `read-image-meta`:

1. The host (`imaging.rs`) — width, height, format, space, channels, depth, alpha, ICC flag, orientation, progressive JPEG.
2. **exifr.parse** in the page (`tauriAPI.js`, exifr's browser build on the file's first 16 MB) — TIFF/EXIF, XMP, IPTC, ICC summary, JFIF, GPS (`mergeOutput: false`, flattened keys such as `exif.ISO`, `ifd0.Make`).
3. Binary blobs (thumbnails, MakerNote) are skipped or shown as `[binary N bytes]`; UserComment is decoded when it is ASCII/Unicode.

The renderer formats a **summary** (camera, exposure as `1/n s`, GPS decimal degrees) and lists **every remaining tag** under “All metadata”. Values are HTML-escaped. Cache key is the current file path so language switches re-render without re-parsing.

## A/V metadata pipeline

Desktop `read-media-meta` (used for video/audio info panel):

1. Probe container / tracks (avoid mislabeling video codec boxes as audio, e.g. `<avc1>` vs AAC).
2. Normalize codec pretty names and container labels (MP4, WebM, …).
3. Duration, channels (Mono/Stereo), sample/frame rates where available; **estimated bitrate** when not tagged; `lossless: false` unless known otherwise.
4. Renderer shows **File / Media / Tags** (not the photo Capture section).

---

## IPC / API Surface

Shared contract (`preload` and `webAPI`):

| API | Purpose |
|---|---|
| `listDrives` / `readDirectory` / `pathAncestors` | Explorer |
| `getFileStats` / `getFileUrl` / `readFileBase64` | Load media |
| `readFileBytes` | Raw file bytes as `Uint8Array` (DICOM decoding in the renderer) |
| `printImage` | Print a data-URL picture through the system dialog (desktop: hidden window; web: popup) |
| `readImageMeta` | EXIF / IPTC / XMP (exifr in the page) + header facts from the host (desktop) |
| `readMediaMeta` | A/V container / codecs / duration / bitrate, from `ffmpeg -i` (desktop) |
| `getLaunchFile` | Path passed on process start |
| `convertToPng` / `decodeDicom` | Special formats |
| `rembgRemove` + `onRembgProgress` | AI background removal (desktop) + progress events |
| `openFileDialog` / `openFolderDialog` | Open |
| `showSaveDialog` / `writeFile` / `saveFile` | Save |
| `setLastOpenDir` / `getLastOpenDir` | Dialog default folder |
| `getSavedLastOpenDir` | The folder really opened last (no Documents fallback) — start-up restore reads it first (desktop) |
| `thumbMake` / `thumbCacheBuild` | Host-built thumbnails: one file now / whole folders in the background (desktop) |
| `popupMenu` / `popupMenuHide` / `popupMenuRefresh` / `onPopupMenuEvent` | Menus in the overlay window (desktop, Tauri command) |
| `startFileDrag` | OS file drag-out of the given paths, copy only (desktop, Tauri command) |
| `showMessageBox` / `updateMenu` | UI chrome |
| `windowMinimize` / `windowMaximize` / `windowClose` / `toggleFullscreen` | Frameless chrome |
| `showItemInFolder` / `renamePath` / `deleteFile` / `startDrag` | Desktop-only |
| `watchDirectory` / `watchFile` | Desktop live reload |
| `onOpenFile` / `onOpenFolder` / `onMenuAction` / `onMaximizeChange` | Events |
| `platform` | `'win32'` / `'darwin'` / `'linux'` / `'web'` |

---

## Assets & Branding

| File | Use |
|---|---|
| `src/assets/icon.ico` | Windows window and file-type default icon |
| `src/assets/icon.png` | About dialog, favicon, toolbar brand |
| `src/assets/icon_512.png` | Large icon source |
| `src/assets/icon.svg` | Source artwork. `npm run create-icons` regenerates PNG / ICO. Tauri bundle icons live in `src-tauri/icons`. |

Packaged builds use `package.json → build.win/mac/linux.icon`. Toolbar shows **V1.0.2** next to the product name.

---

## Build & Distribution

**Tauri** packages the app (`npm run build:win` / `build:mac` / `build:linux`). `scripts/stamp-version.js` runs first and writes the build date into `buildNumber` (`package.json` and `src/version.json`) and the version into `src-tauri/tauri.conf.json`.

The installer needs no Node: the host is part of the app. Programs it runs beside itself go in as the `runtime/` resource, gathered by `scripts/stage-runtime.js` (run by every `build:*`) into `src-tauri/runtime/`: **ffmpeg** (from `ffmpeg-static`, the build of the OS the build runs on) and `rembg_worker.py`. The page's vendor builds (DICOM codecs, libheif, exifr) are copied into `src/vendor/` by `scripts/vendor.js` (`beforeBuildCommand`) and embedded with the page. Only `.gitkeep` of `src-tauri/runtime/` is tracked (tauri-build needs the folder to exist). The uninstaller stops a still-running `runtime\ffmpeg.exe` before deleting files. Windows installer: about 25 MB (the app 7 MB, ffmpeg the rest). File associations are registered from **Settings** inside the app (Windows registry), not by the installer page. Video and audio extensions are not associated.

| Platform | Output |
|---|---|
| Windows | NSIS |
| macOS | DMG |
| Linux | deb |

Web mode is not packaged as a separate installer; deploy by serving `src/` (or running `server.js`).

---

## Key Design Decisions

1. **Single renderer, dual host** — One UI; the Tauri bridge and the web shim share `electronAPI` names so `app.js` stays mostly mode-agnostic.
2. **No Node in the webview** — Privileged work goes through the desktop host or browser APIs.
3. **Frameless chrome** — Native frame is off; drag region + custom min/max/close. Menu accelerators on Windows/Linux are handled in the renderer (`Ctrl+Z`, `F11`, …).
4. **Single instance** — OS “Open with” / double-click should not spawn a second window.
5. **Drive-rooted explorer** — Matches OS mental model; web approximates with a mountable virtual root.
6. **Dialog `defaultPath` and start-up folder** — Last opened directory persisted in the host's userData config (written at once) and renderer `localStorage`. Start-up reads the host copy first (the webview may lose its newest `localStorage` writes on an abrupt close), falls back to the newest recent folder that still exists, and opens it in **folder view** with the last image selected — not opened.
7. **Equal sidebar split** — Tree and info use `flex: 1 1 0` so content-heavy metadata does not steal height; user split is stored as `sidebarTreeHeightV2`.
8. **History includes effects** — Undo restores pixels plus rotation/flip/effect values, not pixels alone.
9. **Effect sliders live on `input`** — Preview updates while dragging; history commits on `change` (release). No full-window progress dialog for interactive tweaks. Wheel scrolls the panel instead of nudging the range.
10. **Edit Apply vs Cancel** — Only Apply can leave the main viewer dirty; Cancel discards the edit session without a save prompt.
11. **Image associations only** — Default-app registration covers still images (including DICOM/HEIC), not video/audio.
12. **Media cues match state** — Pause overlay appears only when media is actually paused by the user (or after stop); opening a video does not show a pause badge.
13. **AI provisioning, non-destructive** — rembg runs in a Python worker. The app installs only the missing packages into the user's existing Python and never downgrades or replaces it; downloading a fresh Python is a Windows-only last resort into an isolated `userData/python`. Progress is streamed and kept monotonic across download/install/inference phases.
14. **Selection outlines are DPI/zoom-aware** — the selection canvas buffer matches the image's native pixels, so fixed-width strokes vanish on large images; widths are scaled by the display ratio (`_selScale`) to a constant on-screen thickness.
15. **Curated, categorized presets** — the preset set is trimmed of near-duplicates and grouped into collapsible categories to reduce clutter while keeping distinct looks.
16. **Status-bar progress for open** — a modal popup over the explorer caused flicker; load progress is painted on the status bar and left until the next status change.
17. **Settings Theme tab** — palettes are buttons with live swatches, not a dropdown on General.
18. **Menus and dialogs past the window edge** — a page cannot draw outside its window, so on the desktop menus go to a transparent, non-activating overlay window and dialogs to windows of their own. Both reuse the existing in-page code (menus: `contextMenu.js` on both sides; dialogs: their DOM is moved, not rebuilt), so web mode and the desktop stay one implementation.
19. **Drag & drop without HTML5 DnD on the desktop** — the Tauri window owns the OS drop target (real paths for dropped files), which keeps HTML5 drop events from the page; in-app drags use pointer events and hand over to an OS drag at the window edge.
20. **Init order** — `app.js` runs its init calls near the top of one IIFE: module state those calls read must be declared in the early block (a `let` declared further down threw a TDZ `ReferenceError` at start-up and silently skipped every later init — keyboard, navigation, open listeners).
21. **Feature tests** — `tests/run-feature-tests.js` loads every `tests/cases/*.js` suite, writes `tests/results.json` / `tests/results.html`, and prints a **summary** table then a **details** list (`# / result / name / execution time` to 3 decimal places, time right-aligned). `npm test -- --summary` prints the summary only.
