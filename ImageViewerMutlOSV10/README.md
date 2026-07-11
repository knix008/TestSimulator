# Image Viewer Multi-OS

다양한 이미지 형식을 지원하는 멀티 플랫폼 이미지 뷰어 및 편집기입니다.  
A multi-platform image viewer and editor built with **Electron** and vanilla JavaScript.  
Desktop (Windows / macOS / Linux) and **web browser** modes are supported.

## Features / 기능

- **Multi-format support / 다양한 형식 지원**
  - Images: JPEG, PNG, GIF, BMP, WebP, SVG, ICO, TIFF, HEIC/HEIF, DICOM (DCM)
  - Video / Audio: MP4, WebM, MOV, MKV, AVI, MP3, WAV, FLAC, and more (playback)

- **Image Editing / 이미지 편집**
  - Rotate (90° steps), Flip H/V
  - Selection tools: Rectangle, Lasso, Polygon, Magic Wand
  - Background removal, crop to selection
  - Undo / Redo (`Ctrl+Z` / `Ctrl+Y`)

- **Effects & Adjustments / 효과 및 조정**
  - Brightness, Contrast, Saturation, Hue, Blur, Sharpen, Vignette, Warmth
  - Presets: Grayscale, Sepia, Vintage, Vivid, Dramatic, etc.

- **Explorer / 탐색기**
  - Drive-rooted directory tree (e.g. `C:`, `D:` on Windows)
  - Full path display; last-opened folder remembered for open/save dialogs
  - Previous / Next image in folder

- **Viewer / 뷰어**
  - Mouse-wheel zoom, pan, fit to window, actual size, zoom input

- **UI**
  - Dark / Light theme, Korean / English
  - Toolbar, context menus, custom app icon (`src/assets`)

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
cd ImageViewerMutlOSV10
npm install
```

### Run — Desktop / 데스크톱 실행

```bash
npm start
```

On Windows, `prestart` embeds `src/assets/icon.ico` into the development `electron.exe` so the taskbar shows the app icon.

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

| Script | Description |
|--------|-------------|
| `npm start` | Electron desktop app |
| `npm run web` | Web server (Express → `src/`) |
| `npm run patch:icon` | Re-apply Windows dev icon to `electron.exe` |
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

## Optional Vendor Libraries / 선택적 외부 라이브러리

For enhanced TIFF and HEIC/HEIF support (especially in **web** mode), add libraries under `src/vendor/`:

| Format | Library | URL |
|--------|---------|-----|
| TIFF   | UTIF.js | https://github.com/photopea/UTIF.js |
| HEIC/HEIF | heic2any | https://github.com/alexcorvi/heic2any |

Uncomment the script tags in `src/index.html` after downloading.

> **Note:** On Windows desktop, HEIC may also work with [HEIF Image Extensions](https://apps.microsoft.com/store/detail/heif-image-extensions/9PMMSR1CGPWG). Electron builds use `sharp` / `heic-convert` in the main process.

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
| Copy | `Ctrl+C` |
| Clear Selection | `Esc` |
| Fullscreen | `F11` |

## Project Structure / 프로젝트 구조

```
ImageViewerMutlOSV10/
├── main.js                 # Electron main process
├── preload.js              # contextBridge → window.electronAPI
├── server.js               # Express static server (web mode)
├── package.json
├── scripts/
│   ├── patch-electron-icon.js   # Embed icon into electron.exe (Windows)
│   └── copy-dist.js             # afterAllArtifactBuild: copy installers to root
├── src/
│   ├── index.html
│   ├── assets/             # App icons (icon.ico, icon.png, icon_512.png, …)
│   ├── styles/main.css
│   ├── js/
│   │   ├── app.js          # Orchestrator
│   │   ├── editor.js
│   │   ├── fileTree.js     # Drive-rooted explorer
│   │   ├── formatSupport.js
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
