# Architecture

## Overview

Image Viewer is a cross-platform image viewer and editor built with **Electron 28** and vanilla JavaScript. The same renderer (`src/`) runs in two modes:

1. **Desktop** — Electron main + preload IPC (`npm start`)
2. **Web** — Express static server + browser `electronAPI` shim (`npm run web`)

Desktop mode uses Electron’s security model (`contextIsolation: true`, `nodeIntegration: false`).

```
┌──────────────────────────────────────────────────────────────┐
│  Mode A: Electron Main (main.js)                             │
│  ─ BrowserWindow, native menu, dialogs, fs, sharp/heic       │
│  ─ lastOpenDir persistence, app icon, unsaved-close guard    │
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
│    ├─ Editor, FileTree (drive-rooted), FormatSupport          │
│    ├─ I18n, ContextMenu, Tooltip, Icons                       │
│    └─ fileRegistry / webAPI (web mode only)                   │
└──────────────────────────────────────────────────────────────┘
```

---

## Run Modes

| | Desktop | Web |
|--|---------|-----|
| Entry | `electron .` (`main.js`) | `node server.js` |
| API | `preload.js` | `src/js/webAPI.js` |
| FS | Real paths / drives | Virtual paths via `FileRegistry` |
| Icons | `src/assets` + rcedit on `electron.exe` (dev) | Favicon from `src/assets` |

Detection: if `window.electronAPI` is missing at page load, `webAPI.js` installs the shim and sets `platform: 'web'`.

---

## Module Descriptions

### `main.js` — Electron Main Process
- Creates `BrowserWindow` with `src/assets` app icon (`icon.ico` / PNG / ICNS fallbacks).
- Sets Windows `AppUserModelId`; persists `lastOpenDir` under userData for open/save dialogs.
- IPC: directory listing, **list-drives**, path helpers, file read/write, TIFF/HEIC via **sharp** / **heic-convert**, DICOM decode, dialogs, watchers, drag-out.
- Close intercept for unsaved changes.

### `preload.js` — Context Bridge
- Exposes `window.electronAPI` only (no raw Node APIs).
- Async `invoke` for request/response; event channels for `open-file`, `open-folder`, `menu-action`.

### `server.js` — Web Static Server
- Serves `src/` on `127.0.0.1` (default port **8080**, increments if busy).
- No conversion backend; decoding stays in the renderer / optional vendor scripts.

### `src/js/webAPI.js` + `fileRegistry.js` — Web Shim
- Implements the same `electronAPI` surface for the browser.
- `FileRegistry`: maps virtual paths (`/…`) to `File` / `FileSystemDirectoryHandle`.
- Open file → `<input type="file">`; open folder → `showDirectoryPicker()` or `webkitdirectory`.
- Save → `showSaveFilePicker()` or `<a download>`.
- No-ops / errors: `showItemInFolder`, `deleteFile`, `startDrag`, `fs.watch`.

### `src/js/app.js` — Orchestrator
- State: lang, theme, currentFile, fileList, zoom/pan, dirty flag, etc.
- Toolbar, viewer, edit window, dirty title (`●`), save-as MIME by extension.
- Desktop: restores last folder/file from `localStorage` + disk.
- Web: skips path restore; drag-drop registers `File` objects into `FileRegistry`.
- Hides Explorer/Delete context actions when `platform === 'web'`.

### `src/js/editor.js` — Canvas Editor
| Concern | Implementation |
|---|---|
| Effects | CSS filters + pixel convolution |
| Selection | Rect, lasso, polygon, magic wand (BFS) |
| Overlay | Yellow dashed selection on `#sel-canvas` |
| BG remove / crop | Mask-guided alpha / off-screen canvas |
| Undo/Redo | `ImageData` stack (max 20) |

### `src/js/formatSupport.js` — Format Loader
| Format | Desktop | Web |
|---|---|---|
| JPEG/PNG/GIF/BMP/WebP/SVG/ICO | data URL via IPC | `FileReader` data URL |
| TIFF / HEIC | sharp / heic-convert in main | Optional UTIF / heic2any; canvas fallback |
| DICOM | main-process decode | Client `parseDicom` + `decodeDicomBuffer` |
| Video/Audio | `file://` URL | `blob:` object URL |

### `src/js/fileTree.js` — Explorer
- Roots from `listDrives()` (Windows letters, macOS volumes, Linux mounts; web → **Local Files**).
- Lazy expand; `revealPath()` expands ancestors to a full absolute path.
- Path bar shows the focused full path.
- Drag-out to OS only when not in web mode.

### Other renderer modules
- `i18n.js` — `en.json` / `ko.json`, `localStorage` lang
- `icons.js` — inline SVG (includes drive icon)
- `contextMenu.js`, `tooltip.js`

### `scripts/patch-electron-icon.js`
- Windows: embeds `src/assets/icon.ico` into `node_modules/electron/dist/electron.exe` via **rcedit** (taskbar icon under `npm start`).
- Wired as `prestart` / `postinstall`; stamp file `.icon-patched` skips redundant work.

---

## IPC / API Surface

Shared contract (`preload` and `webAPI`):

| API | Purpose |
|---|---|
| `listDrives` / `readDirectory` / `pathAncestors` | Explorer |
| `getFileStats` / `getFileUrl` / `readFileBase64` | Load media |
| `convertToPng` / `decodeDicom` | Special formats |
| `openFileDialog` / `openFolderDialog` | Open |
| `showSaveDialog` / `writeFile` / `saveFile` | Save |
| `setLastOpenDir` / `getLastOpenDir` | Dialog default folder |
| `showMessageBox` / `updateMenu` | UI chrome |
| `showItemInFolder` / `deleteFile` / `startDrag` | Desktop-only |
| `watchDirectory` / `watchFile` | Desktop live reload |
| `onOpenFile` / `onOpenFolder` / `onMenuAction` | Events |
| `platform` | `'win32'` / `'darwin'` / `'linux'` / `'web'` |

---

## Assets & Branding

| File | Use |
|---|---|
| `src/assets/icon.ico` | Windows window, installer, electron.exe patch |
| `src/assets/icon.png` | About dialog, favicon, drag icon |
| `src/assets/icon_512.png` | macOS/Linux electron-builder icon source |
| `src/assets/icon.svg` | Source artwork |

Packaged builds use `package.json → build.win/mac/linux.icon`.

---

## Build & Distribution

**electron-builder** packages the app; `afterAllArtifactBuild` (`scripts/copy-dist.js`) copies installer files (`.exe`, `.dmg`, `.AppImage`, …) from `dist/` to the project root. `npm run build:win` also runs the copy step explicitly after packaging.

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
3. **Drive-rooted explorer** — Matches OS mental model; web approximates with a mountable virtual root.
4. **Dialog `defaultPath`** — Last opened directory persisted in main-process userData (and renderer `localStorage`).
5. **Dev icon via rcedit** — BrowserWindow `icon` alone does not change the Windows taskbar for `electron.exe`.
6. **Canvas editing** — Non-destructive effects until bake; undo tracks `ImageData`.
7. **`ELECTRON_RUN_AS_NODE`** — If set system-wide, unset it when launching Electron (e.g. `ELECTRON_RUN_AS_NODE= electron .`).
