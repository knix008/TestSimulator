# Architecture

## Overview

Image Viewer **v1.0.2** is a cross-platform image viewer and editor built with **Electron 28** and vanilla JavaScript. The same renderer (`src/`) runs in two modes:

1. **Desktop** — Electron main + preload IPC (`npm start`)
2. **Web** — Express static server + browser `electronAPI` shim (`npm run web`)

Desktop mode uses Electron’s security model (`contextIsolation: true`, `nodeIntegration: false`). On Windows/Linux the window is **frameless**; chrome (brand, zoom, language, window buttons) lives in the renderer.

```
┌──────────────────────────────────────────────────────────────┐
│  Mode A: Electron Main (main.js)                             │
│  ─ Frameless BrowserWindow, IPC dialogs, fs, sharp/heic      │
│  ─ Single-instance lock, argv / open-file, lastOpenDir       │
│  ─ Image metadata (exifr + sharp), media meta, DICOM decode, rembg       │
└────────────────────┬─────────────────────────────────────────┘
                     │  preload.js → window.electronAPI
┌────────────────────┼─────────────────────────────────────────┐
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
│    └─ fileRegistry / webAPI (web mode only)                   │
└──────────────────────────────────────────────────────────────┘
```

---

## Run Modes

| | Desktop | Web |
|--|---------|-----|
| Entry | `scripts/start-dev.js` → Electron (`main.js`) | `node server.js` |
| API | `preload.js` | `src/js/webAPI.js` |
| FS | Real paths / drives | Virtual paths via `FileRegistry` |
| Icons | `src/assets` + rcedit / branded exe (dev) | Favicon from `src/assets` |
| Metadata | `read-image-meta` / `read-media-meta` | File stats only |

Detection: if `window.electronAPI` is missing at page load, `webAPI.js` installs the shim and sets `platform: 'web'`.

---

## Module Descriptions

### `main.js` — Electron Main Process
- Frameless `BrowserWindow` (`frame: false`); Windows/Linux application menu is cleared so accelerators are handled in the renderer.
- Sets Windows `AppUserModelId` (`com.shkwon.imageviewer` when packaged; a hashed `.dev.*` id while unpackaged).
- **Single-instance lock**: a second launch with a file path focuses the existing window and sends `open-file`.
- Startup file from `process.argv` (Windows/Linux) or `open-file` (macOS); renderer reads it via `get-launch-file`.
- Persists `lastOpenDir` under userData for open/save dialogs.
- IPC: directory listing, **list-drives**, path helpers, file read/write (`read-file-base64`, `read-file-bytes` → raw `Uint8Array` for renderer-side decoders), TIFF/HEIC via **sharp** / **heic-convert** / **heic-decode**, DICOM decode (fallback only — the renderer decodes DICOM itself), **read-image-meta** (exifr + sharp), **read-media-meta** (A/V container/codecs/duration/bitrate), dialogs, watchers, drag-out, **rename-path** (basename-only, rejects `\/:*?"<>|`), **delete-file**, window min/max/close.
- Close intercept for unsaved changes (`window-close` vs force close).
- **AI background removal** (`rembg-remove`): spawns `scripts/rembg_worker.py` (`rembg1`=U2Net, `rembg2`=RMBG-2.0, `rembg3`=ISNet) and streams `rembg-progress` events.
  - **Auto-provisioning**: `_resolvePython` prefers the machine's existing Python (env override → `python`/`py` → previously app-installed); `_ensureRembgPackages` pip-installs `rembg`/`onnxruntime` on demand into that interpreter. Only if **no** Python exists does `_installManagedPython` download the official installer (Windows, per-user, isolated under `userData/python`) — it never replaces or downgrades a system Python.
  - Progress is **monotonic**: download → install → package install → the worker's own model/inference progress are remapped into an always-advancing bar.

### `preload.js` — Context Bridge
- Exposes `window.electronAPI` only (no raw Node APIs).
- Async `invoke` for request/response; event channels for `open-file`, `open-folder`, `menu-action`, `maximize-change`.

### `server.js` — Web Static Server
- Serves `src/` on `127.0.0.1` (default port **8080**, increments if busy).
- No conversion backend; decoding stays in the renderer / optional vendor scripts.
- Exposes only the DICOM vendor packages under `/node_modules/<pkg>/…` (`dicom-parser`, the four `@cornerstonejs/codec-*` packages, `jpeg-lossless-decoder-js`) so the page's `../node_modules/…` script URLs resolve in both modes.
- **Detached menus** (desktop only): `popup-menu` / `popup-menu-hide` / `popup-menu-refresh` IPC show the serialized menu in `popupWindow` — a transparent, frameless, non-focusable child `BrowserWindow` (`popupPreload.js` → `src/popup.html` + `src/js/popupMenu.js`) sized to the work area of the display under the cursor, so a menu can extend past the app window. Mouse events outside the rows pass through (`setIgnoreMouseEvents(true, { forward: true })`, toggled by the popup page). Clicks come back as `popup-event` `{ type: 'action' | 'remove' | 'closed', id, seq }` and are forwarded to the renderer; `seq` (the menu's sequence number) makes a stale `closed` from a menu that was just replaced harmless. The popup hides on main-window move / minimise / blur and is destroyed with it.

### `src/js/webAPI.js` + `fileRegistry.js` — Web Shim
- Implements the same `electronAPI` surface for the browser.
- `FileRegistry`: maps virtual paths (`/…`) to `File` / `FileSystemDirectoryHandle`.
- Open file → `<input type="file">`; open folder → `showDirectoryPicker()` or `webkitdirectory`.
- Save → `showSaveFilePicker()` or `<a download>`.
- No-ops / errors: `showItemInFolder`, `renamePath`, `deleteFile`, `startDrag`, `fs.watch`, `readImageMeta`, `readMediaMeta`, `getLaunchFile`.

### `src/js/app.js` — Orchestrator
- State: lang, theme, currentFile, fileList, zoom/pan, dirty flag, cached `imageMeta` / `mediaMeta` / `dicomMeta`.
- **Edit window chrome**: `#edit-window-titlebar` (32 px drag region: brand "Edit Image", file name, window-button gutter), `#ew-menubar` (built by `_buildMenubarInto()` from `_ewMenubarDefs()` — File / Edit / View reuse the editor actions, Effects / Help share the main items; button ids `menubar-ew-*`, `_menubarOpen` keys carry the prefix) and `#ew-toolbar-row` (tool / action / transform / undo-redo / zoom / theme groups, spacer, Save · Cancel · Apply). `_editMinWidth()` measures the toolbar row (`_measureFlexContentWidth` now counts margins) and sizes the window on open.
- **Preferences**: every persisted option is a `localStorage` key; `PREF_DEFAULTS` / `_pref()` / `_setPref()` / `PREF_KEYS` (app.js) back the Settings dialog (`_initSettingsDialog` — `min(900px, 100vw - 48px)` × `min(620px, 100vh - 48px)`, wide enough that all 40 theme tiles fit with the body still `overflow: hidden`; tabbed: General / **Theme** / Viewer & editing / DICOM / Media, `_syncSettingsDialog` refills it, `_resetAllSettings` clears `PREF_KEYS` and reloads). The sizing rule is `.dialog-box.settings-dialog-box` — two classes, because the generic `.dialog-box` rule is declared later in `main.css`. The Theme tab is filled by `_fillSettingsThemeButtons()` (one color-preview button per `Themes` entry; click → `_applyTheme`) into an `auto-fill` grid so the tiles reflow to the dialog width. Options: `restoreSession`, `zoomStep`, `viewerChecker`, `imageSmoothing` (`_applyViewerPrefs` → CSS classes), `dicomDefaultFps`, `dicomOverlayColor`, `dicomAnnotations`, plus the non-dialog toggles `dicomRulerAxes` / `dicomScaleBar` / `dicomScalePos`, `browseViewV1`, `panelLayoutV1`, and the older `theme`, `lang`, `bgRemoveAlgo`, `subtitlesEnabled`, `subtitleLanguage`, `mediaVolume` / `mediaMuted`.
- **Chrome** is three rows: `#titlebar` (brand = icon · name · version, centred current-file name, drag region, fixed `#window-controls` at the right — 32 px, 40 px while the edit window is open), `#menubar` (built by `_buildMenubar()`), `#toolbar` (icon buttons + zoom input, no drag).
- **Menu bar**: `_menubarDefs()` → File / Edit / View / Effects / Help; each menu is a `ContextMenu` dropdown built on open (`_fileMenuItems()` …) so enabled / checked state is always current. Every item has an icon (`icons.js`). `mousedown` on a menu button opens / toggles it (so the document click that closes menus cannot race), `mouseenter` on a sibling switches menus while one is open; `ContextMenu.show(x, y, items, { onHide })` clears the highlight. File menu: open file, open folder (click = browse; hover = **recent folders** flyout with per-row × via `item.remove` and `ContextMenu.refreshSubmenu()`), save as, **Export ▸** (`_exportAs(ext)` → `_saveAs(false, { ext })` presets the extension), **Print…** (`_printImage`), file info, show in Explorer, delete, exit (desktop only).
- **Print**: toolbar 🖨 / File ▸ Print… / `Ctrl+P` → `_openPrintPreview()` (`#print-overlay`). The renderer exports the current view as PNG (`Editor.exportAsDataUrl`, or a snapshot of the animated frame), lists printers via `getPrinters` IPC (`webContents.getPrintersAsync`, default first + selected), and computes the page geometry in mm (`_printLayout`: paper table, auto/portrait/landscape, margins, fit / actual (96 dpi) / custom %) — the preview paper is drawn to scale. **Print** → `printImage` IPC with `{ deviceName, pageSize, landscape, marginMm, imgWmm, imgHmm, copies, color }`; main renders the image at exactly that mm size in a hidden `BrowserWindow` and calls `webContents.print({ silent: true, deviceName, pageSize, landscape, margins: custom(px), copies, color })` — no system dialog. Without a printer (web) it falls back to the popup + `window.print()` with `@page { size; margin }`. Paper/margin/scale prefs persist in `localStorage.printPrefs`.
- **Themes**: `src/js/themes.js` is the registry (id, dark/light kind, name, swatch colours) shared by the renderer (`window.Themes`) and `main.js` (`require`). `main.css` defines per-theme `--t-*` base tokens under `[data-theme="<id>"]`; one shared `:root[data-theme]` block derives every other variable from them with `color-mix()`, and `:root[data-theme-kind="dark|light"]` holds the kind-only values (hover tints, shadows, tooltip). `_applyTheme(id)` sets both attributes, persists `theme`, and re-syncs toolbar / settings / native menu. Toolbar: palette button = `_nextTheme()` (wraps through the list), ▾ = `_openThemeMenu()` (ContextMenu with `Themes.swatchSvg`). Native menu actions are `theme:<id>`.
- Language button shows the flag (`Icons.flagKo` / `Icons.flagUs`) of the **target** language (US flag when UI is Korean, Korean flag when UI is English).
- **Settings dialog** (`#settings-overlay`, `_initSettingsDialog` / `_syncSettingsDialog`): Theme tab color buttons, language flag buttons, background-removal algorithm (mirrors `#ew-bg-algo` / `bgRemoveAlgo`), subtitles default. Opened by the gear toolbar button, File ▸ Settings…, or the `show-settings` menu action.
- **Status-bar progress**: file open / folder load paint `#status-progress` (and the edit-window twin) instead of a modal overlay on the main viewer. Edit-window long effects still use the modal `ProgressDialog`.
- **Explorer rename**: tree context **Rename** → `#rename-overlay` (`_promptRename`) → `renamePath` IPC → `FileTree.remapPath` + rewrite of `state.currentFile` / `fileList` / recent dirs / watches.
- Dialog headers use `.dialog-title` = `.dialog-title-icon[data-icon]` + label; icons are filled from `Icons` at init (the file dialog swaps `#fd-title-icon` per mode).
- Toolbar, viewer, edit window, dirty title (`●`), save-as MIME by extension.
- **Edit session dirty**: previews inside the edit window do not mark the file dirty; **Cancel** / Esc discards with no Save dialog; **Apply** commits the session and marks dirty only if something changed.
- Info panel: images → file / capture / location / DICOM / all metadata; A/V → **File / Media / Tags** (HTML-escaped). DICOM shows the summary (`meta`, labelled through `info.<key>`) and an **All DICOM tags** section (`state.dicomTags`: nested sequence items indented by `depth`, `Item n` header rows, a filter `<input>` in the section header handled by `_initInfoTagFilter` through `data-search`).
- **Menus**: `ContextMenu.show()` (contextMenu.js) draws the in-page menu in web mode and inside the popup page; in Electron it serialises the items (actions kept in a Map by id, function / async submenus resolved first) and sends them to the detached popup window (see main.js). The viewer context menu keeps everyday actions top-level and groups the rest into **Transform / Zoom / More tools** flyouts; DICOM adds compact **Frames / Window / Colour map / Annotations / Overlay planes / Measure / DICOM export** entries (`_dicomContextItems`, shared with the View menu).
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
| JPEG/PNG/GIF/BMP/WebP/SVG/ICO/AVIF | Native load; WebP/AVIF may fall back to `convertToPng` (sharp) | `FileReader` data URL |
| TIFF | sharp in main | Optional UTIF; canvas fallback |
| HEIC/HEIF/HIF | heic-convert / heic-decode | Optional heic2any |
| DICOM | `dicomDecoder.js` in the renderer (`read-file-bytes` → `DicomDecoder.load`); `decode-dicom` (main) only as fallback | Same decoder in the renderer |
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
- Shared by the renderer (`window.Themes`) and `main.js` (`require`). 40 palettes (20 dark, 20 light) with `id`, `kind`, display name, `nameKey`, and a 3-color `swatch` used by menus and the Settings Theme tab.
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

### `src/js/thumbs.js` — Thumbnail cache
- Bounded LRU (`MAX_CACHE`) with a small work queue (`CONCURRENCY`); `request(path, { front })` jumps the queue for a tile that just scrolled in, `prefetchDir` warms a folder in the background, and each finished thumbnail fires a `thumb-ready` window event.
- `_sourceFor` takes whatever the loader produced: a file URL for native formats, a data URL, or a **canvas** — which is how DICOM arrives, so `.dcm` files get thumbnails too.

### Other renderer modules
- `i18n.js` — `en.json` / `ko.json`, `localStorage` lang
- `icons.js` — inline SVG (undo/redo, rotate, drive, window controls)
- `contextMenu.js` — dropdown / context menus: rows with icon, label, detail, shortcut, `checked`, `danger`, `inline` (one-line label + detail), `remove` (× button), and `submenu` (array or (async) function → flyout appended to `body`, opened on hover / click, closed with a short delay); `show(x, y, items | () => items, { onHide })`, `hide()`, `refreshSubmenu(level)`, `replaceItems(items)` (popup page). In Electron `show()` serialises the items and hands them to the detached popup window; `hide()` closes it. `_place()` calls `_fitColumns()` first: a list taller than the screen (the 40-palette theme picker) gets a fixed height and an `is-columns` class, so CSS multi-column flows it into extra columns instead of letting it run off the bottom.
- `popupMenu.js` + `src/popup.html` + `popupPreload.js` — the popup-window side: receives `popup-show` / `popup-refresh` / `popup-hide`, applies the app theme attributes, draws with `contextMenu.js`, reports `popup-event` `{ type, id, seq }` and toggles mouse pass-through (`popup-ignore-mouse`) depending on whether the cursor is over a menu row.
- `tooltip.js`

### `scripts/`
| Script | Role |
|---|---|
| `start-dev.js` | Windows: launch icon-patched Electron clone as `ImageViewer-*.exe` |
| `patch-electron-icon.js` | Embed `src/assets/icon.ico` via **rcedit** (`postinstall` / `patch:icon`) |
| `after-pack.js` | Embed the same ICO into packaged `Image Viewer.exe` |
| `copy-dist.js` | Copy installers from `dist/` to the project root |
| `stamp-version.js` | Write the build date as `buildNumber` before a build |
| `build-report.js` | Size report of the last Windows build (`npm run build:report`) |
| `rembg_worker.py` | Optional Python helper for background removal |

Packaged Windows: runtime `AppUserModelId` matches `build.appId`. Taskbar icon prefers an unpacked `.ico` or `process.execPath` (Shell cannot load icons from `app.asar`). Assets `icon.ico` / `icon.png` / `icon_512.png` are `asarUnpack`ed as a fallback.

---

## Image metadata pipeline

Desktop `read-image-meta`:

1. **sharp** `.metadata()` — width, height, format, space, channels, density, alpha, ICC flag, chroma, etc.
2. **exifr.parse** — TIFF/EXIF, XMP, IPTC, ICC summary, JFIF, GPS (`mergeOutput: false`, flattened keys such as `exif.ISO`, `ifd0.Make`).
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
| `readImageMeta` | EXIF / IPTC / XMP / sharp basic (desktop) |
| `readMediaMeta` | A/V container / codecs / duration / bitrate (desktop) |
| `getLaunchFile` | Path passed on process start |
| `convertToPng` / `decodeDicom` | Special formats |
| `rembgRemove` + `onRembgProgress` | AI background removal (desktop) + progress events |
| `openFileDialog` / `openFolderDialog` | Open |
| `showSaveDialog` / `writeFile` / `saveFile` | Save |
| `setLastOpenDir` / `getLastOpenDir` | Dialog default folder |
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
| `src/assets/icon.ico` | Windows window, installer, electron.exe patch, file-type default icon |
| `src/assets/icon.png` | About dialog, favicon, toolbar brand, drag icon |
| `src/assets/icon_512.png` | macOS/Linux electron-builder icon source |
| `src/assets/icon.svg` | Source artwork — 3D glass tile (thickness, bevel, drop shadow), top-left specular reflection, tilted photo card, glossy lens. `npm run create-icons` regenerates PNG / ICO; `npm run patch:icon` re-brands the dev exe; the installer, portable exe and shortcuts pick the ICO up at `npm run build:win` |

Packaged builds use `package.json → build.win/mac/linux.icon`. Toolbar shows **V1.0.2** next to the product name.

---

## Build & Distribution

**electron-builder** packages the app; `afterAllArtifactBuild` (`scripts/copy-dist.js`) copies installer files (`.exe`, `.dmg`, `.AppImage`, …) from `dist/` to the project root. `npm run build:win` also runs the copy step explicitly after packaging; `build:win:setup` builds the NSIS installer only.

Package size / speed (`package.json` → `build`):
- `files`: the app sources plus negative globs that drop `.map` / `.d.ts` / tests / docs, the unused **exifr** bundles (only `dist/full.umd.js` is required), the asm.js **libheif** build and `.mjs` duplicate, the **cornerstone** codec `.wasm` variants and full (encoder) builds — the app only loads the pure-JS `*_decode.js` files in both Node and the renderer — plus sharp's C++ sources and pngjs's browser bundle.
- `electronLanguages: ["en-US", "ko"]` keeps two Chromium locale packs instead of 55 (~35 MB uncompressed).
- `npmRebuild: false` — sharp / codecs are prebuilt, so electron-builder skips the native rebuild step.
- `compression: "maximum"` for the NSIS / 7z payload (slower packaging, smaller installer).
- `scripts/stamp-version.js` runs before every build and writes the build date into `buildNumber` (package.json + `src/version.json`); `scripts/build-report.js` (`npm run build:report`) prints installer sizes and a breakdown of `dist/win-unpacked` and `app.asar` so regressions after a dependency update are easy to spot.

Windows NSIS (`build/installer.nsh` + `fileAssocPage.nsh`):

- Kills any running instance, removes the previous install directory and userData, then installs fresh.
- `perMachine: true` so file associations can be written to HKLM.
- `fileAssociations` in `package.json` register JPEG, PNG, GIF, BMP, WebP, AVIF, SVG, ICO, TIFF, HEIC/HEIF/HIF, DICOM.
- Custom page (default **checked**): “Set Image Viewer as the default app for supported image files.” Unchecking runs `APP_UNASSOCIATE` after electron-builder’s register step. Silent installs keep associations.
- Capabilities are written under `Software\com.shkwon.imageviewer\Capabilities` and `RegisteredApplications` so the app appears in Windows **Default apps**.
- Video/audio extensions are **not** associated, so media players are not replaced.

macOS uses the same `fileAssociations` as `CFBundleDocumentTypes`. Linux uses `mimeTypes` on the desktop/AppImage/deb.

| Platform | Output |
|---|---|
| Windows | NSIS + portable `.exe` |
| macOS | DMG (x64 + arm64) |
| Linux | AppImage + `.deb` |

Web mode is not packaged as a separate installer; deploy by serving `src/` (or running `server.js`).

---

## Key Design Decisions

1. **Single renderer, dual host** — One UI; Electron IPC vs web shim share `electronAPI` names so `app.js` stays mostly mode-agnostic.
2. **No `nodeIntegration`** — All privileged work goes through IPC (desktop) or browser APIs (web).
3. **Frameless chrome** — Native frame is off; drag region + custom min/max/close. Menu accelerators on Windows/Linux are handled in the renderer (`Ctrl+Z`, `F11`, …).
4. **Single instance** — OS “Open with” / double-click should not spawn a second window.
5. **Drive-rooted explorer** — Matches OS mental model; web approximates with a mountable virtual root.
6. **Dialog `defaultPath`** — Last opened directory persisted in main-process userData (and renderer `localStorage`).
7. **Equal sidebar split** — Tree and info use `flex: 1 1 0` so content-heavy metadata does not steal height; user split is stored as `sidebarTreeHeightV2`.
8. **History includes effects** — Undo restores pixels plus rotation/flip/effect values, not pixels alone.
9. **Effect sliders live on `input`** — Preview updates while dragging; history commits on `change` (release). No full-window progress dialog for interactive tweaks. Wheel scrolls the panel instead of nudging the range.
10. **Edit Apply vs Cancel** — Only Apply can leave the main viewer dirty; Cancel discards the edit session without a save prompt.
11. **Image associations only** — Default-app registration covers still images (including DICOM/HEIC), not video/audio.
12. **Dev icon via rcedit / branded exe** — BrowserWindow `icon` alone does not change the Windows taskbar for stock `electron.exe`.
13. **`ELECTRON_RUN_AS_NODE`** — If set system-wide, `start-dev.js` unsets it when launching Electron.
14. **Media cues match state** — Pause overlay appears only when media is actually paused by the user (or after stop); opening a video does not show a pause badge.
15. **AI provisioning, non-destructive** — rembg runs in a Python worker. The app installs only the missing packages into the user's existing Python and never downgrades or replaces it; downloading a fresh Python is a Windows-only last resort into an isolated `userData/python`. Progress is streamed and kept monotonic across download/install/inference phases.
16. **Selection outlines are DPI/zoom-aware** — the selection canvas buffer matches the image's native pixels, so fixed-width strokes vanish on large images; widths are scaled by the display ratio (`_selScale`) to a constant on-screen thickness.
17. **Curated, categorized presets** — the preset set is trimmed of near-duplicates and grouped into collapsible categories to reduce clutter while keeping distinct looks.
18. **Status-bar progress for open** — a modal popup over the explorer caused flicker; load progress is painted on the status bar and left until the next status change.
19. **Settings Theme tab** — palettes are buttons with live swatches, not a dropdown on General.
20. **Feature tests** — `tests/run-feature-tests.js` loads every `tests/cases/*.js` suite, writes `tests/results.json` / `tests/results.html`, and prints a **summary** table then a **details** list (`# / result / name / execution time` to 3 decimal places, time right-aligned). `npm test -- --summary` prints the summary only.
