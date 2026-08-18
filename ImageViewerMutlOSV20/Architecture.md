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
│    ├─ FileTree (drive-rooted), FormatSupport, DicomDecoder    │
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
- IPC: directory listing, **list-drives**, path helpers, file read/write, TIFF/HEIC via **sharp** / **heic-convert** / **heic-decode**, DICOM decode, **read-image-meta** (exifr + sharp), **read-media-meta** (A/V container/codecs/duration/bitrate), dialogs, watchers, drag-out, window min/max/close.
- Close intercept for unsaved changes (`window-close` vs force close).

### `preload.js` — Context Bridge
- Exposes `window.electronAPI` only (no raw Node APIs).
- Async `invoke` for request/response; event channels for `open-file`, `open-folder`, `menu-action`, `maximize-change`.

### `server.js` — Web Static Server
- Serves `src/` on `127.0.0.1` (default port **8080**, increments if busy).
- No conversion backend; decoding stays in the renderer / optional vendor scripts.

### `src/js/webAPI.js` + `fileRegistry.js` — Web Shim
- Implements the same `electronAPI` surface for the browser.
- `FileRegistry`: maps virtual paths (`/…`) to `File` / `FileSystemDirectoryHandle`.
- Open file → `<input type="file">`; open folder → `showDirectoryPicker()` or `webkitdirectory`.
- Save → `showSaveFilePicker()` or `<a download>`.
- No-ops / errors: `showItemInFolder`, `deleteFile`, `startDrag`, `fs.watch`, `readImageMeta`, `readMediaMeta`, `getLaunchFile`.

### `src/js/app.js` — Orchestrator
- State: lang, theme, currentFile, fileList, zoom/pan, dirty flag, cached `imageMeta` / `mediaMeta` / `dicomMeta`.
- Custom title bar (`#app-brand`, `#window-controls`); `-webkit-app-region: drag` on the toolbar with `no-drag` on controls.
- Language button label is the **target** language (`English` when UI is Korean, `한글` when UI is English).
- Toolbar, viewer, edit window, dirty title (`●`), save-as MIME by extension.
- **Edit session dirty**: previews inside the edit window do not mark the file dirty; **Cancel** / Esc discards with no Save dialog; **Apply** commits the session and marks dirty only if something changed.
- Info panel: images → file / capture / location / DICOM / all metadata; A/V → **File / Media / Tags** (HTML-escaped).
- **Media transport** (`#media-controls`): Play / Pause / Stop, seek + time for video; same play/pause/stop for animated GIF. Overlay cues (`#media-cue`): play/stop flash; pause badge persists only while actually paused (not on first open). Video click (without drag) toggles playback; context menu includes Play/Pause/Stop.
- Sidebar: explorer and info panels `flex: 1 1 0` (equal height); vertical splitter persists `sidebarTreeHeightV2`.
- Effect sliders: `input` → live preview (`setEffect(..., false)`); `change` → history commit. Wheel over a slider scrolls the panel.
- Border/caption UI: thickness (px, max 480), shadow, caption template tokens, font family/size/color, bold/italic/underline/strikethrough.
- Desktop: restores last folder/file unless a launch file was passed on the command line.
- Web: skips path restore; drag-drop registers `File` objects into `FileRegistry`.

### `src/js/editor.js` — Canvas Editor
| Concern | Implementation |
|---|---|
| Effects | CSS filters + pixel convolution + vignette / grain / posterize / solarize |
| Miniature | `_applyMiniatureDof` — soft horizontal shallow DOF + toy-model color grade (`tiltShift` / diorama depth) |
| Border | Mat pad up to 480px, shadow styles, caption with configurable typography |
| Selection | Rect, lasso, polygon, magic wand (BFS) |
| Overlay | Yellow dashed selection on `#sel-canvas` |
| BG remove / crop | Mask-guided alpha / off-screen canvas |
| Undo/Redo | Snapshots of pixels **and** effects / rotation / flip (`MAX_HISTORY` 20) |

### `src/js/formatSupport.js` — Format Loader
| Format | Desktop | Web |
|---|---|---|
| JPEG/PNG/GIF/BMP/WebP/SVG/ICO/AVIF | Native load; WebP/AVIF may fall back to `convertToPng` (sharp) | `FileReader` data URL |
| TIFF | sharp in main | Optional UTIF; canvas fallback |
| HEIC/HEIF/HIF | heic-convert / heic-decode | Optional heic2any |
| DICOM | `dicomDecoder.js` (Node) via `decode-dicom` | Same decoder in the renderer |
| Video/Audio | `file://` URL | `blob:` object URL |

### `src/js/dicomDecoder.js`
- Shared Node/browser decoder: preamble optional, implicit/explicit VR, encapsulated JPEG pixel data, basic tags (patient, modality, study date, rows/cols).

### `src/js/fileTree.js` — Explorer
- Roots from `listDrives()` (Windows letters, macOS volumes, Linux mounts; web → **Local Files**).
- Lazy expand; `revealPath()` expands ancestors to a full absolute path.
- Path bar shows the focused full path.
- Drag-out to OS only when not in web mode.

### Other renderer modules
- `i18n.js` — `en.json` / `ko.json`, `localStorage` lang
- `icons.js` — inline SVG (undo/redo, rotate, drive, window controls)
- `contextMenu.js`, `tooltip.js`

### `scripts/`
| Script | Role |
|---|---|
| `start-dev.js` | Windows: launch icon-patched Electron clone as `ImageViewer-*.exe` |
| `patch-electron-icon.js` | Embed `src/assets/icon.ico` via **rcedit** (`postinstall` / `patch:icon`) |
| `after-pack.js` | Embed the same ICO into packaged `Image Viewer.exe` |
| `copy-dist.js` | Copy installers from `dist/` to the project root |
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
| `readImageMeta` | EXIF / IPTC / XMP / sharp basic (desktop) |
| `readMediaMeta` | A/V container / codecs / duration / bitrate (desktop) |
| `getLaunchFile` | Path passed on process start |
| `convertToPng` / `decodeDicom` | Special formats |
| `openFileDialog` / `openFolderDialog` | Open |
| `showSaveDialog` / `writeFile` / `saveFile` | Save |
| `setLastOpenDir` / `getLastOpenDir` | Dialog default folder |
| `showMessageBox` / `updateMenu` | UI chrome |
| `windowMinimize` / `windowMaximize` / `windowClose` / `toggleFullscreen` | Frameless chrome |
| `showItemInFolder` / `deleteFile` / `startDrag` | Desktop-only |
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
| `src/assets/icon.svg` | Source artwork |

Packaged builds use `package.json → build.win/mac/linux.icon`. Toolbar shows **V1.0.2** next to the product name.

---

## Build & Distribution

**electron-builder** packages the app; `afterAllArtifactBuild` (`scripts/copy-dist.js`) copies installer files (`.exe`, `.dmg`, `.AppImage`, …) from `dist/` to the project root. `npm run build:win` also runs the copy step explicitly after packaging.

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
