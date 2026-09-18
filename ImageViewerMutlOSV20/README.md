# Image Viewer Multi-OS

다양한 이미지 형식을 지원하는 멀티 플랫폼 이미지 뷰어 및 편집기입니다.  
A multi-platform image viewer and editor built with **Electron** and vanilla JavaScript.  
**Version 1.0.2** — Desktop (Windows / macOS / Linux) and **web browser** modes.

## Features / 기능

- **Multi-format support / 다양한 형식 지원**
  - Images: JPEG, PNG, GIF, BMP, WebP, AVIF, SVG, ICO, TIFF, HEIC/HEIF/HIF, DICOM (DCM)
  - DICOM: every common transfer syntax (uncompressed LE/BE, deflated, RLE, JPEG baseline / extended / lossless, JPEG-LS, JPEG 2000 / HTJ2K), MONOCHROME / RGB / YBR / PALETTE, 8–32-bit, multi-frame
  - Video / Audio: MP4, WebM, MOV, MKV, AVI, MP3, WAV, FLAC, and more (playback)

- **Image Editing / 이미지 편집**
  - Rotate (90° steps), Flip H/V
  - Selection tools: Rectangle, Lasso, Polygon, Magic Wand
  - Selection outlines stay a **constant on-screen thickness** at any zoom / image size (visible even on very large images)
  - Background removal (algorithmic + **AI**), crop to selection
  - Undo / Redo (`Ctrl+Z` / `Ctrl+Y`) — pixels, effects, and transforms (up to 20 steps)
  - Edit window: **Cancel** discards the session; **Apply** commits — dirty/save prompt only after Apply with unsaved changes

- **Background removal / 배경 제거**
  - Algorithmic: corner/border flood, color key, chroma, brightness, selection-guided
  - **AI (rembg)**: `rembg1` (U2Net), `rembg2` (RMBG-2.0), `rembg3` (ISNet)
  - AI requires Python + `rembg`/`onnxruntime`. Missing packages are **auto-installed on demand** into your existing Python, with a **progress bar**; if no Python exists at all, an official Python is downloaded and installed as a last resort (Windows). See [rembg_worker.py](scripts/rembg_worker.py).
  - First AI run also downloads the model file (~170 MB) once, cached under `~/.u2net`.

- **Effects & Adjustments / 효과 및 조정**
  - Brightness, Contrast, Saturation, Hue, Blur, Sharpen, Vignette, Warmth, Grayscale, Sepia, Invert, Grain, Posterize, Solarize
  - **Miniature** preset + **Diorama depth** (tilt-shift style shallow DOF)
  - ~118 curated presets grouped into **10 collapsible categories** (Color Film, Slide Film, B&W, Instant/Toy, Cinema, Cross/Experimental, Warm, Cool, Tonal, Creative). Expand/collapse state is remembered.
  - Live preview while dragging sliders; history commits on release
  - Wheel over sliders scrolls the panel (does not nudge values)
  - Presets: Vivid, Vintage, Dramatic, Noir, Golden Hour, Miniature, and many more

- **Border / caption / 테두리·여백 글**
  - Border thickness up to **480px** (values shown in **px**)
  - Caption font family, size (px), color (auto or custom)
  - Bold / italic / underline / strikethrough
  - Field tokens (`{file}`, `{date}`, `{gps}`, …) and editable template

- **Media playback / 미디어 재생**
  - Video & audio transport: Play / Pause / Stop, seek bar, time display
  - Click video (without drag) to toggle play/pause; `Space` for play/pause
  - On-screen cues: play/stop flash briefly; pause badge stays while paused
  - Animated GIF play / pause / stop via the same controls

- **Explorer / 탐색기**
  - Drive-rooted directory tree (e.g. `C:`, `D:` on Windows)
  - Full path display; last-opened folder remembered for open/save dialogs
  - Previous / Next image in folder
  - Copy / move by drag-and-drop

- **File information / 파일 정보**
  - Images: name, size, dimensions, dates, color space, DPI; capture / GPS / full EXIF·IPTC·XMP
  - A/V: File / Media / Tags (container, codecs, duration, channels, estimated bitrate, …)
  - DICOM: patient / study / series / equipment / pixel-format summary plus an **All DICOM tags** listing
  - Explorer and info panels share equal height by default (splitter is resizable)

- **DICOM viewer / DICOM 뷰어**
  - Frame navigation + cine playback for multi-frame files (`PgUp` / `PgDn`, `Home` / `End`, `Space`)
  - Window centre / width: file windows, auto, CT presets (brain, lung, bone, …), numeric input, **Ctrl+drag** / middle-drag, invert (`I`), reset (`W`)
  - Same decoder in desktop and web mode; codecs load on first use

- **Window chrome / 창 구성**
  - Title bar (app icon · name · version · current file · window buttons), **menu bar** (File / Edit / View / Effects / Help — every item with an icon and shortcut) and an icon toolbar
  - File menu: open file, open folder (browse **or** pick a recent folder — each removable, clear all), save as, **export** (PNG / JPEG / WebP / BMP / clipboard), **print** (`Ctrl+P`), file info, show in Explorer, delete, exit

- **Viewer / 뷰어**
  - Mouse-wheel zoom, pan, fit to window, actual size, zoom input
  - Frameless window with custom title bar (minimize / maximize / close)
  - Fullscreen (`F11`)

- **UI**
  - 20 themes (10 dark, 10 light) — palette button steps to the next one, ▾ opens the full list
  - Korean / English — language button shows the flag of the language you can switch **to**
  - Settings dialog (gear button): theme, language, background-removal algorithm, subtitles
  - Toolbar, context menus, custom app icon (`src/assets`)

- **Installer / 설치**
  - Windows NSIS can register Image Viewer as the default app for supported **image** formats
  - Double-clicking an associated file opens it in a single app instance

- **Run modes / 실행 모드**
  - **Desktop**: Electron (`npm start`)
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

On Windows, `scripts/start-dev.js` launches a branded `ImageViewer-*.exe` (icon patched into Electron) so the taskbar shows the app icon. `postinstall` / `npm run patch:icon` refresh that icon.

### Run — Web / 웹 실행

```bash
npm run web
```

Open **http://127.0.0.1:8080** in a browser.  
Use **Open File** / **Open Folder** (or drag-and-drop) to load images. The explorer uses a virtual **Local Files** root (no direct OS drive access in the browser).

### Build / 빌드

```bash
npm run build:win      # Windows NSIS + portable → root에 설치 파일 복사
npm run copy-dist      # dist/ 설치 파일을 루트로 재복사
npm run build:mac      # macOS DMG
npm run build:linux    # AppImage + deb
npm run build:all      # all platforms
```

The Windows Setup wizard includes a **file associations** page (checked by default) so Image Viewer can be the default app for JPEG, PNG, WebP, HEIC, TIFF, DICOM, and other supported images.

| Script | Description |
|--------|-------------|
| `npm start` | Electron desktop app (`scripts/start-dev.js`) |
| `npm run web` | Web server (Express → `src/`) |
| `npm run patch:icon` | Re-apply Windows dev icon to Electron |
| `npm run build:win` / `mac` / `linux` | Package with electron-builder |

## Web mode notes / 웹 모드 안내

| Feature | Desktop | Web |
|---------|---------|-----|
| Open file / folder | Native dialogs | Browser picker / Directory Picker |
| Explorer drives | Real drives (`C:`, …) | Virtual **Local Files** root |
| Save As | Write to disk | Save picker or download |
| Show in Explorer / Delete | Yes | Not available |
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

> **Note:** On Windows desktop, HEIC may also work with [HEIF Image Extensions](https://apps.microsoft.com/store/detail/heif-image-extensions/9PMMSR1CGPWG). Electron builds use `sharp` / `heic-convert` / `heic-decode` in the main process. EXIF and related tags are read with **exifr**.

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
| Previous / Next | `←` / `→` |
| Undo / Redo | `Ctrl+Z` / `Ctrl+Y` |
| Edit window | `Ctrl+E` |
| Play / Pause (video, audio, GIF) | `Space` |
| Copy | `Ctrl+C` |
| Clear Selection | `Esc` |
| Fullscreen | `F11` |

## Project Structure / 프로젝트 구조

```
ImageViewerMutlOSV20/
├── main.js                 # Electron main process
├── preload.js              # contextBridge → window.electronAPI
├── server.js               # Express static server (web mode)
├── package.json            # v1.0.2, electron-builder, fileAssociations
├── build/
│   ├── installer.nsh       # NSIS: reinstall + file-association page
│   └── fileAssocPage.nsh
├── scripts/
│   ├── start-dev.js             # Branded Electron launch (Windows)
│   ├── patch-electron-icon.js   # Embed icon into electron.exe
│   ├── after-pack.js            # Packaged exe icon
│   ├── copy-dist.js             # Copy installers to project root
│   └── rembg_worker.py          # Optional background-removal helper
├── src/
│   ├── index.html
│   ├── assets/             # App icons (icon.ico, icon.png, icon_512.png, …)
│   ├── styles/main.css
│   ├── js/
│   │   ├── app.js          # Orchestrator, chrome, info, media transport
│   │   ├── editor.js       # Canvas, effects, miniature DOF, border caption
│   │   ├── fileTree.js     # Drive-rooted explorer
│   │   ├── formatSupport.js
│   │   ├── dicomDecoder.js
│   │   ├── fileRegistry.js # Virtual FS (web)
│   │   ├── webAPI.js       # electronAPI shim (web)
│   │   ├── contextMenu.js
│   │   ├── tooltip.js
│   │   ├── icons.js
│   │   └── i18n.js
│   ├── i18n/en.json, ko.json
│   └── vendor/             # Optional UTIF.js, heic2any
├── samples/                # Sample images / A/V (see samples/README.md)
├── README.md
├── UsersGuide.md
├── Architecture.md
└── dist/                   # Build output (gitignored)
```

## Documentation / 문서

- [UsersGuide.md](UsersGuide.md) — End-user guide (KO/EN)
- [Architecture.md](Architecture.md) — Technical architecture

## License

MIT
