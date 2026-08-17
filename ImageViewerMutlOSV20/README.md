# Image Viewer Multi-OS

다양한 이미지 형식을 지원하는 멀티 플랫폼 이미지 뷰어 및 편집기입니다.  
A multi-platform image viewer and editor built with **Electron** and vanilla JavaScript.  
**Version 1.0.2** — Desktop (Windows / macOS / Linux) and **web browser** modes.

## Features / 기능

- **Multi-format support / 다양한 형식 지원**
  - Images: JPEG, PNG, GIF, BMP, WebP, AVIF, SVG, ICO, TIFF, HEIC/HEIF/HIF, DICOM (DCM)
  - Video / Audio: MP4, WebM, MOV, MKV, AVI, MP3, WAV, FLAC, and more (playback)

- **Image Editing / 이미지 편집**
  - Rotate (90° steps), Flip H/V
  - Selection tools: Rectangle, Lasso, Polygon, Magic Wand
  - Background removal, crop to selection
  - Undo / Redo (`Ctrl+Z` / `Ctrl+Y`) — pixels, effects, and transforms (up to 20 steps)

- **Effects & Adjustments / 효과 및 조정**
  - Brightness, Contrast, Saturation, Hue, Blur, Sharpen, Vignette, Warmth, Grayscale, Sepia, Invert
  - Sliders apply when released (not while dragging)
  - Presets: Vivid, Vintage, Dramatic, Noir, Golden Hour, and more

- **Explorer / 탐색기**
  - Drive-rooted directory tree (e.g. `C:`, `D:` on Windows)
  - Full path display; last-opened folder remembered for open/save dialogs
  - Previous / Next image in folder
  - Copy / move by drag-and-drop

- **File information / 파일 정보**
  - Name, size, dimensions, dates, color space, DPI
  - Capture metadata: camera, lens, exposure, aperture, ISO, focal length, flash, GPS, and more
  - Full EXIF / IPTC / XMP / ICC dump when present
  - DICOM patient / modality / study date
  - Explorer and info panels share equal height by default (splitter is resizable)

- **Viewer / 뷰어**
  - Mouse-wheel zoom, pan, fit to window, actual size, zoom input
  - Frameless window with custom title bar (minimize / maximize / close)
  - Fullscreen (`F11`)

- **UI**
  - Dark / Light theme
  - Korean / English — language button shows the language you can switch **to** (`English` / `한글`)
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
| File metadata (EXIF) | Yes (`exifr` in main) | File stats only |
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
│   │   ├── app.js          # Orchestrator, chrome, info panel
│   │   ├── editor.js       # Canvas, effects, history
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
