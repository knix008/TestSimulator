# MyImageViewer Multi-OS

다양한 이미지 형식을 지원하는 멀티 플랫폼 이미지 뷰어 및 편집기입니다.  
A multi-platform image viewer and editor built with **Tauri** and vanilla JavaScript.  
**Version 1.0.2** — Desktop (Windows / macOS / Linux) and **web browser** modes.

## Features / 기능

- **Multi-format support / 다양한 형식 지원**
  - Images: JPEG, PNG, GIF, BMP, WebP, AVIF, SVG, ICO, TIFF, HEIC/HEIF/HIF, DICOM (DCM)
  - DICOM: every common transfer syntax (uncompressed LE/BE, deflated, RLE, JPEG baseline / extended / lossless, JPEG-LS, JPEG 2000 / HTJ2K), MONOCHROME / RGB / YBR / PALETTE, 8–32-bit integer and 32/64-bit **float** pixel data, multi-frame and **enhanced multi-frame** (per-frame functional groups)
  - Video / Audio: MP4, WebM, MOV, MKV, AVI, MP3, WAV, FLAC, and more (playback)

- **Image Editing / 이미지 편집**
  - Rotate (90° steps), Flip H/V
  - Selection tools: Rectangle, Lasso, Polygon, Magic Wand
  - Selection outlines stay a **constant on-screen thickness** at any zoom / image size (visible even on very large images)
  - Background removal (algorithmic + **AI**), crop to selection
  - **Drawing & annotation**: brush, highlighter, eraser, line, arrow, rectangle, ellipse (outline / fill), text (font, size, bold, italic, background box)
  - **Retouching**: mosaic and blur brushes (hide faces, number plates), clone stamp (Alt+click source), spot healing, red-eye removal
  - **Crop tool** with ratios (free, original, 1:1, 4:3, 3:2, 16:9, portrait variants) and a rule-of-thirds frame; **straighten** by any angle (drag along the horizon), cropping the empty corners or growing the canvas; **canvas size** with anchor and fill
  - **Tone**: exposure, highlights, shadows sliders; **tone curve** (RGB / R / G / B) and **levels** with live preview; **auto enhance**; **white balance picker**
  - **Selection edits**: select all, invert, feather, grow / shrink, blur or mosaic the selection; **watermark** (one place or tiled)
  - **Live shapes & text**: a new shape / text keeps its handles — move, resize (resize cursors on the handles), restyle, double-click text to edit, drag the grip while typing; text outline and shadow
  - **Selections**: Shift adds, Alt subtracts, drag inside moves the outline, Ctrl+drag moves the pixels
  - **Saving** keeps the photo information (EXIF, orientation and size corrected; GPS removable); JPEG / BMP put transparency on white
  - **Vibrance** slider, **noise reduction**, **batch processing** (resize / convert / watermark many files into new files)
  - Undo keeps one copy per pixel change (effect steps share it) under a memory budget
  - **Save selection as image**: only the selected part (as shown, effects included) becomes a new file; the picture is unchanged. Also from right-click in the editor and "Select a region to save…" in the viewer
  - Every stroke, shape, retouch or dialog is **one undo step**; rotate / flip after a pixel edit keeps it; **Reset all** goes back to the file as opened
  - Undo / Redo (`Ctrl+Z` / `Ctrl+Y`) — pixels, effects, and transforms (up to 20 steps)
  - Edit window: **Cancel** discards the session; **Apply** commits — dirty/save prompt only after Apply with unsaved changes
  - Edit window has the same chrome as the main window: menu bar (file name, window buttons, File / Edit / View / Effects / Help) and toolbar with undo / redo
  - Long effects show an in-window progress popup; Save / Cancel / Apply are **icon-only** on the toolbar; the preset panel is wide enough for every effect label; category bars keep their accent colors
  - Presets (left) and Adjustments (right) **collapse to a rail** showing the panel icon and vertical title — from the panel header, two toolbar buttons, or View ▸ Left / Right panel; the layout is remembered
  - The **colour wheel** (tint + strength) sits at the top of Adjustments while editing; an **About** button sits right of Settings

- **Background removal / 배경 제거**
  - Algorithmic: corner/border flood, color key, chroma, brightness, selection-guided
  - **AI (rembg)**: `rembg1` (U2Net), `rembg2` (RMBG-2.0), `rembg3` (ISNet)
  - AI requires Python + `rembg`/`onnxruntime`. Missing packages are **auto-installed on demand** into your existing Python, with a **progress bar**; if no Python exists at all, an official Python is downloaded and installed as a last resort (Windows). See [rembg_worker.py](scripts/rembg_worker.py).
  - A missing AI model is **downloaded automatically** by the app (U2Net ~168 MB, ISNet ~170 MB, RMBG-2.0 ~977 MB) with MB progress and checksum check, into `~/.u2net`. It never waits forever (20 s without a response or 30 s without data = failure; a removal is stopped after 10 min); a failure says why and offers **Retry**, which downloads again from the start (partial files are never kept).
  - Rectangle / lasso / polygon selections: the "selection" method keeps exactly the selection; the other methods remove the background and keep what is inside the selection.

- **Effects & Adjustments / 효과 및 조정**
  - Brightness, Contrast, Saturation, Hue, Blur, Sharpen, Vignette, Warmth, Grayscale, Sepia, Invert, Grain, Posterize, Solarize
  - **Miniature** preset + **Diorama depth** (tilt-shift style shallow DOF)
  - ~122 curated presets grouped into **10 collapsible categories** (Color Film, Slide Film, B&W, Instant/Toy, Cinema, Cross/Experimental, Warm, Cool, Tonal, Creative). Expand/collapse state is remembered.
  - Live preview while dragging sliders; history commits on release
  - Wheel over sliders scrolls the panel (does not nudge values)
  - Presets: Vivid, Vintage, Dramatic, Noir, Golden Hour, Miniature, and many more

- **Border / caption / 테두리·여백 글**
  - Border thickness up to **480px** (values shown in **px**)
  - Caption font family, size (px), color (auto or custom)
  - Bold / italic / underline / strikethrough
  - Field tokens (`{file}`, `{date}`, `{gps}`, …) and editable template

- **Media playback / 미디어 재생**
  - Video **and audio** transport bar inside the viewer: Play / Pause / Stop, seek bar, time display, volume
  - Click the video or the audio screen (without drag) to play / pause / play again; `Space` for play/pause
  - Formats the webview cannot decode (AVI, WMV, FLV, MPEG-1/2, TS, VOB, RM, 3GP, OGV, WMA, AIFF …) are **converted once** by the host with ffmpeg (bundled `ffmpeg-static`, cached under the user-data folder) and the copy is played
  - On-screen cues: play/stop flash briefly; pause badge stays while paused
  - Animated GIF play / pause / stop via the same controls

- **Explorer / 탐색기**
  - Drive-rooted directory tree (e.g. `C:`, `D:` on Windows)
  - Drive buttons in the explorer title bar — click a drive to open it immediately
  - **Path bar with an Up button and clickable breadcrumbs** — jump to any ancestor in one click; `Backspace` or `Alt+↑` goes up one level
  - Opening a folder **keeps branches you opened on other paths expanded**, so several places stay reachable at once
  - **Start-up opens the last folder in folder view** (the last image selected, not opened); if that folder is gone, the newest recent folder that still exists
  - Previous / Next image in folder (`←` / `→`, `Page Up` / `Page Down`); explorer `↑` / `↓` moves the tree row and opens the image
  - **Double-clicking an image** leaves the thumbnail contact sheet and shows just that image
  - Flipping images only updates the selected row (no full tree redraw); the row scrolls into view if it is off-screen
  - Right-click: copy / move / print / **rename** / **delete** (delete is shown in red). Rename is not offered for drive roots
  - **Drag & drop** (desktop): thumbnails / files onto an explorer folder or folder tile **move** them (`Ctrl` = copy); drag past the window edge to hand them to Explorer, the desktop or another app (copy); files dropped in from outside land in the folder under the pointer or the open contact sheet (same drive = move, other drive = copy), anywhere else they open

- **Thumbnail browser / 썸네일 보기**
  - Contact sheet for one folder: subfolders first, then media; double-click to open
  - Three modes — **Thumbnails / List / Details**; `↑` toolbar button or `Backspace` goes to the parent folder
  - **Size stepper in the toolbar** (smaller · current size · larger); the number resets to the default when clicked, and `Ctrl`+wheel / `Ctrl` `+`/`-` work over the grid. The size also drives the row height in List and Details
  - **Details** mode lists Name · Type · Size · Dimensions · Date modified · Date created under a **sortable column header**
  - Selecting a file fills the **File Info** panel without opening the image
  - **Multi-select**: `Ctrl`+click toggles, `Shift`+click selects a range, mouse drag draws a selection box (auto-scrolls at the edges), `Ctrl+A` selects all; right-clicking inside the selection applies the context menu (open / copy / move / clipboard / delete) to every selected item
  - **Drag to the explorer**: drag tiles (the whole selection) onto a folder in the explorer tree to **move** them there; hold `Ctrl` to copy. The sheet stays in its folder and drops the moved tiles; a drag that starts on a tile moves files, a box selection starts from empty space
  - Thumbnails are made **in the background** and kept in a **per-directory thumbnail DB** under the app's user-data folder, so a folder seen before shows its thumbnails at once — only new or changed files are redone. On the desktop the app's host builds them natively (JPEG / PNG / WebP / GIF / TIFF) for every folder you open — and for recent folders at start-up — even after you move on; other formats (BMP / ICO / AVIF / SVG / HEIC / DICOM) are made in the page. Settings ▸ General shows the cache size and can clear it
  - Bottom **filmstrip** while viewing an image: always the image's own folder, `<` / `>` and `←` / `→` step through it
  - The thumbnail toolbar button reflects what is on screen: it turns off when you open an image and brings the sheet back when pressed again

- **File information / 파일 정보**
  - Images: name, size, dimensions, dates, color space, DPI; capture / GPS / full EXIF·IPTC·XMP
  - A/V: File / Media / Tags (container, codecs, duration, channels, estimated bitrate, …)
  - DICOM: patient / study / series / equipment / pixel-format summary plus an **All DICOM tags** listing
  - Explorer and info panels share equal height by default (splitter is resizable)
  - Every section is a **table** (label | value); **Details** (image / explorer context menu, File ▸ Details…, `Ctrl+I`) opens a larger dialog with the same tables plus an **image analysis** (histogram, mean colour, luminance mean ± σ and range, clipping) and **Copy all**

- **Side panels / 좌우 패널**
  - Left: Explorer over File Info. Right: **Color & Adjust** — RGB + luminance histogram, a circular **colour wheel** that tints the image (luminance kept, strength slider), and brightness / contrast / saturation / hue / warmth sliders; every change is one undo step and marks the file unsaved
  - Each panel title has an icon; one collapse button per side in the panel header and one per side on the toolbar; a collapsed panel stays as a thin rail showing its icons and vertical titles (click it to expand)

- **DICOM viewer / DICOM 뷰어**
  - Frame navigation + cine playback for multi-frame files (`PgUp` / `PgDn`, `Home` / `End`, `Space`) — speed from Frame Time (Vector) / Cine Rate / Recommended Display Frame Rate, adjustable **fps** box
  - Window centre / width: file windows (per frame in enhanced files), **VOI LUT** tables, auto, CT presets (brain, lung, bone, …), numeric input, **Ctrl+drag** / middle-drag, invert (`I`), reset (`W`); Modality LUT, VOI LUT Function (LINEAR / LINEAR_EXACT / SIGMOID) and Presentation LUT Shape are honoured
  - **Pseudo-colour maps** (`M`): hot iron, PET, hot metal blue, PET 20-step, jet, rainbow, bone
  - **Overlay planes** (60xx, embedded high-bit overlays too) with a toggle (`V`) and configurable colour
  - **Annotations** overlay (`O`): patient / study / series text, image geometry, window, orientation markers (R/L/A/P/H/F, follow rotation and flip)
  - **Rulers** (`G`): graduated scales down the full X and Y axes, zeroed on the image origin, in mm when the file has a pixel spacing and in pixels otherwise
  - **Scale bar** (`B`) on its own toggle — starts at the top-left and can be **dragged anywhere**; where you park it is remembered between sessions (reset from the context menu)
  - **Pixel probe** in the status bar: coordinates, stored value, rescaled value (HU …), RGB
  - **Measurements** on the image: ruler (`R`, mm via pixel spacing), angle (`A`), ellipse / rectangle ROI (`E` / `T`) with mean ± SD, min / max, area; delete one from its right-click menu or the Measure list, undo / redo with the toolbar buttons / `Ctrl+Z` / `Ctrl+Y`
  - **Export**: every frame as PNG, the tag listing as JSON / CSV / text, copy tags to the clipboard; the info panel lists nested sequences and has a tag filter box
  - Same decoder in desktop and web mode; codecs load on first use

- **Window chrome / 창 구성**
  - Theme · language · settings · about sit on the **menu bar, left of the minimise button** (main and edit window)
  - **About** shows icon, name, version and description on top, then aligned rows: version, image / video / audio formats (from the same lists the app opens files by), formats converted for playback, platform, copyright, contact
  - **Menu bar** (app icon · name · version · File / Edit / View / Window / Help · Home · current file · window buttons — every menu item with an icon and shortcut) and an icon toolbar
  - File menu: open file, open folder (browse **or** pick a recent folder — each removable, clear all), save as, **export** (PNG / JPEG / WebP / BMP / clipboard), **print** (`Ctrl+P`, also a toolbar button — opens a print preview: printer with the system default pre-selected, paper, orientation, margins, scale, copies, colour; prints directly to the chosen printer), file info, show in Explorer, delete, exit

- **Viewer / 뷰어**
  - Mouse-wheel zoom, pan, zoom input
  - **Display modes on the toolbar** for pictures and video: fit to window, fit width, fit height, original size (remembered, re-applied on resize / next file), centre, fullscreen
  - The bottom filmstrip is its own row under the viewer (divider line): the picture, the media bar and the arrows are never covered by it
  - Frameless window (minimize / maximize / close on the menu bar)
  - Fullscreen (`F11`)

- **UI**
  - 40 themes (20 dark, 20 light) — palette button steps to the next one, ▾ opens the full list; a list too tall for the screen flows into extra columns instead of being clipped
  - Settings **Theme** tab shows every palette as a **color-preview button** (dark 20 + light 20); the current theme is highlighted
  - Korean / English — language button shows the flag of the language you can switch **to**; the thumbnail-browser toolbar and the explorer path bar are relabelled with it
  - Settings dialog (gear button, tabs, no scroll — sized so all 40 theme tiles fit): **General** (language, startup restore, recent folders, default viewer), **Theme**, **Viewer & editing**, **DICOM**, **Media** — plus **Reset all settings**
  - Opening a file shows live progress on the **status bar** (not a modal popup); the last result stays until the next status change (`Loading Done.` when finished)
  - Context and menu-bar menus **can extend past the window edge** (desktop: drawn in a transparent overlay window that never takes the focus); **every row has an icon**, a checked row keeps its icon and shows a check at the right; the viewer context menu keeps everyday actions top-level (including Delete, in red) and groups the rest (Transform / Zoom / More tools, DICOM Frames / Window / Colour map / Measure / Export)
  - **Dialogs open in windows of their own** on the desktop (Settings, About, Print, Resize, Details, confirmations …) — drag them by the title anywhere on screen, past the main window; the main window waits behind them
  - Toolbar, custom app icon (`src/assets`)

- **Installer / 설치**
  - Windows NSIS installer in **Korean / English** (chosen at start); setup.exe, uninstaller, shortcuts and the running window all use the program icon
  - Start-menu shortcut optional (Start-menu page: "do not create shortcuts"), desktop shortcut optional (finish page)
  - On Install: asks whether to delete saved user data, then removes any previous MyImageViewer **and** the older Electron "Image Viewer" completely before installing; the uninstaller's "delete app data" box covers the same folders
  - The default image viewer can be registered from Settings ▸ General; double-clicking an associated file opens it in the app

- **Run modes / 실행 모드**
  - **Desktop**: Tauri (`npm start`)
  - **Web**: browser via local Express server (`npm run web`)

## Getting Started / 시작하기

### Prerequisites / 사전 요구사항

- [Node.js](https://nodejs.org/) v18 or higher
- npm
- *(Optional)* **Python 3** — only for **AI** background removal (`rembg1/2/3`). The app auto-installs the `rembg` / `onnxruntime` packages into your Python on first use; on Windows it can even download and install Python itself if none is found. Algorithmic background removal needs no Python.

### Installation / 설치

```bash
git clone <repository-url>
cd ImageViewerMutlOSV20
npm install
```

### Run — Desktop / 데스크톱 실행

```bash
npm start
```

`npm start` opens the Tauri window (`tauri dev`). The page comes from `src/`; file, thumbnail, conversion, metadata and background-removal work is done by the app's own host (`src-tauri/src/host/`, Rust). `scripts/vendor.js` runs first and copies the DICOM / HEIC / EXIF browser builds into `src/vendor/node_modules/`. Rust and the Tauri CLI are required; Node is only needed for `npm` itself — the installed app does not use it.

### Run — Web / 웹 실행

```bash
npm run web
```

Open **http://127.0.0.1:8080** in a browser.  
Use **Open File** / **Open Folder** (or drag-and-drop) to load images. The explorer uses a virtual **Local Files** root (no direct OS drive access in the browser).

### Build / 빌드

```bash
npm run build:win        # Windows NSIS installer (Tauri)
npm run build:mac        # macOS DMG
npm run build:linux      # Linux deb
```

Each `build:*` ends with `scripts/copy-installer.js`, which copies the new installer from `src-tauri/target/release/bundle/<kind>/` to the **project root** (root installers are gitignored).

Every `build:*` first runs `scripts/stamp-version.js`, which writes the build date (`YYYYMMDD`) as `buildNumber` into `package.json` and `src/version.json`, and copies the version into `src-tauri/tauri.conf.json`. The About dialog reads that build number.

On Windows, **Settings** can register MyImageViewer as the default app for JPEG, PNG, WebP, HEIC, TIFF, DICOM, and other supported images. The packaged app still needs Node on `PATH` so the host can run image decoding.

| Script | Description |
|--------|-------------|
| `npm start` | Tauri desktop app (`tauri dev`) |
| `npm test` | Feature tests (`tests/cases/`) — summary table, then every case with a 3-decimal execution time |
| `npm run web` | Web server (Express → `src/`) |
| `npm run create-icons` | Rebuild `src/assets` PNG / ICO from `icon.svg` |
| `npm run build:win` / `mac` / `linux` | Package with Tauri (`nsis` / `dmg` / `deb`) |
| `npm run stamp` | Refresh `buildNumber` and the Tauri version |

## Web mode notes / 웹 모드 안내

| Feature | Desktop | Web |
|---------|---------|-----|
| Open file / folder | Native dialogs | Browser picker / Directory Picker |
| Explorer drives | Real drives (`C:`, …) | Virtual **Local Files** root |
| Save As | Write to disk | Save picker or download |
| Show in Explorer / Rename / Delete | Yes | Not available |
| Drag file out to OS | Yes | Not available |
| Last folder restore | Yes | Folder must be re-opened each session |
| File metadata (EXIF / A/V) | Yes (`exifr` / `read-media-meta` in main) | File stats only |
| OS default-app registration | Installer | Not applicable |

## Optional Vendor Libraries / 선택적 외부 라이브러리

For enhanced TIFF and HEIC/HEIF support (especially in **web** mode), add libraries under `src/vendor/`:

| Format | Library | URL |
|--------|---------|-----|
| TIFF   | UTIF.js | https://github.com/photopea/UTIF.js |
| HEIC/HEIF | heic2any | https://github.com/alexcorvi/heic2any |

Uncomment the script tags in `src/index.html` after downloading.

> **Note:** On Windows desktop, HEIC may also work with [HEIF Image Extensions](https://apps.microsoft.com/store/detail/heif-image-extensions/9PMMSR1CGPWG). The desktop app decodes HEIC itself with **libheif** (its WebAssembly build, in a worker), TIFF with the host's `image` crate, and plays other video / audio through the bundled **ffmpeg**. EXIF and related tags are read with **exifr**.

## Keyboard Shortcuts / 단축키

| Action | Shortcut |
|--------|----------|
| Open File | `Ctrl+O` |
| Open Folder | `Ctrl+Shift+O` |
| Save As | `Ctrl+Shift+S` |
| Zoom In / Out | `Ctrl++` / `Ctrl+-` |
| Fit to Window | `Ctrl+0` |
| Actual Size | `Ctrl+1` |
| Rotate Left / Right | `Ctrl+[` / `Ctrl+]` |
| Previous / Next | `←` / `→` or `Page Up` / `Page Down` |
| Explorer row up / down (opens the image) | `↑` / `↓` |
| Explorer: go to the parent folder | `Backspace` or `Alt+↑` |
| Thumbnail browser: parent folder | `Backspace` |
| Thumbnail size smaller / larger | `Ctrl+-` / `Ctrl++` or `Ctrl`+wheel over the grid |
| DICOM: rulers on both axes / scale bar | `G` / `B` |
| Delete current file | `Delete` |
| Undo / Redo | `Ctrl+Z` / `Ctrl+Y` |
| Edit window | `Ctrl+E` |
| Play / Pause (video, audio, GIF) | `Space` |
| Copy | `Ctrl+C` |
| Clear Selection | `Esc` |
| Fullscreen | `F11` |

## Project Structure / 프로젝트 구조

```
MyImageViewer/
├── src-tauri/              # Tauri / Rust shell: main + dialog windows, menu overlay, drag-out, bundle
├── host/
│   ├── server.js           # Desktop host (static files + IPC)
│   ├── service.js          # File, image, DICOM, print, associations
│   └── electron-shim.js    # Node stand-in for the old main-process API
├── server.js               # Express static server (web mode)
├── package.json            # v1.0.2
├── doc/                    # Help (도움말.md, help.md)
├── scripts/
│   ├── stamp-version.js    # buildNumber = build date (runs before every build)
│   ├── create-icons.js     # icon.svg → PNG / ICO
│   └── rembg_worker.py     # Optional background-removal helper
├── src/
│   ├── index.html
│   ├── popup.html          # Menu overlay page (desktop: menus past the window edge)
│   ├── assets/             # App icons (icon.ico, icon.png, icon_512.png, …)
│   ├── styles/main.css
│   ├── js/
│   │   ├── app.js          # Orchestrator, chrome, info, media transport
│   │   ├── editor.js       # Canvas, effects, miniature DOF, border caption
│   │   ├── themes.js       # Theme registry (40 palettes + swatches)
│   │   ├── fileTree.js     # Drive-rooted explorer (Up / breadcrumbs, folders-only mode)
│   │   ├── browse.js       # Thumbnail contact sheet (grid / list / details)
│   │   ├── thumbs.js       # Background thumbnail cache
│   │   ├── fileDialog.js   # In-app open / save dialogs
│   │   ├── formatSupport.js
│   │   ├── dicomDecoder.js # DICOM session decoder (LUTs, overlays, enhanced multi-frame, probe / stats)
│   │   ├── fileRegistry.js # Virtual FS (web)
│   │   ├── tauriAPI.js     # Desktop electronAPI bridge (Tauri)
│   │   ├── webAPI.js       # electronAPI shim (web)
│   │   ├── contextMenu.js  # Menus (in the page, or in the overlay window on the desktop)
│   │   ├── popupMenu.js    # Menu overlay page driver
│   │   ├── dialogWindow.js # Desktop: dialogs moved into windows of their own
│   │   ├── dragdrop.js     # Desktop drag & drop (in → in, in → out, out → in)
│   │   ├── tooltip.js
│   │   ├── icons.js
│   │   └── i18n.js
│   ├── i18n/en.json, ko.json
│   └── vendor/             # Optional UTIF.js, heic2any
├── samples/                # Sample images / A/V (see samples/README.md)
├── tests/                  # Feature tests (`npm test` → results.html / results.json)
├── README.md
├── UsersGuide.md
├── Architecture.md
└── dist/                   # Build output (gitignored)
```

## Tests / 테스트

```bash
npm test              # 요약 + 각 케이스 내용 · 결과 · 실행 시간(소수점 3자리)
npm test -- --summary # 스위트 요약만
```

결과는 `tests/results.html` / `tests/results.json`에 기록됩니다. 스위트는 `tests/cases/`에 기능별로 나뉩니다.

## Documentation / 문서

- [UsersGuide.md](UsersGuide.md) — End-user guide (KO/EN)
- [Architecture.md](Architecture.md) — Technical architecture
- [samples/README.md](samples/README.md) — Sample media files

## License

MIT
