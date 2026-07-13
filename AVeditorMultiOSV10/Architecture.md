# Architecture

## Overview

AV Editor is a cross-platform audio/video editor built with **Electron 26** and vanilla JavaScript (no bundler for the renderer).  

- **Desktop:** Windows, macOS, Linux via **electron-builder**  
- **Web:** same renderer served in the browser; `electron-api-shim.js` provides `window.electronAPI`

Security model (Electron):

- `contextIsolation: true`
- `nodeIntegration: false`
- Renderer talks to the OS only through `preload.js` → `window.electronAPI`

```
┌──────────────────────────────────────────────────────────────┐
│  Main Process (src/main/)          [Electron only]           │
│  main.js — BrowserWindow, IPC (fs, dialogs, export, DnD)     │
│  menu.js / menuIcons.js — localized native menu + icons      │
│  preload.js — contextBridge → window.electronAPI             │
└────────────────────────────┬─────────────────────────────────┘
                             │  ipcRenderer.invoke / sendSync / on
┌────────────────────────────▼─────────────────────────────────┐
│  Renderer (src/renderer/)          [Electron + Web]          │
│  index.html → electron-api-shim.js (web) → js/app.js         │
│    ├─ fileTree.js      directory tree / Library              │
│    ├─ fileInfo.js      selected file metadata                │
│    ├─ preview.js       player, effects, transport cues       │
│    ├─ timeline.js      canvas multi-track editor             │
│    ├─ contextMenu.js   floating context menus                │
│    ├─ i18n.js + locales/en.json, ko.json                     │
│    └─ icons.js, styles/main.css                              │
└──────────────────────────────────────────────────────────────┘
```

---

## Dual runtime: Electron vs Web

| Concern | Electron | Web |
|---------|----------|-----|
| API bridge | `src/main/preload.js` | `src/renderer/js/electron-api-shim.js` |
| Flag | `electronAPI.isElectron` | `electronAPI.isWeb` |
| File tree | Real drives / folders | Virtual `/library` (in-memory `Map`) |
| Samples | Optional on disk | Auto-seed from `/samples/manifest.json` |
| Media URLs | `file://` or resolved paths | `blob:` / served sample URLs |
| MediaInfo | WASM via main process file read | WASM from `/mediainfo/` + HTML5 fallback |
| Project `.avp` | Disk read/write | File pick + download |
| Drag out | `start-drag` sync IPC (native) | DownloadURL / File drag |
| Drop into tree | Copy into focused directory | Add to Library |
| Export | Dialog + placeholder progress | Placeholder text download |
| Native menu | `menu.js` + locale sync | N/A (toolbar / shortcuts) |

`npm run web` (`scripts/start-web.js`) serves `src/renderer` plus `/samples/` and `/mediainfo/` with `Cache-Control: no-store` and Range support for media seeking.

`npm run build:web` copies the renderer into `dist-web/`, injects CSP for wasm/blob, copies samples and mediainfo.js, and marks `<body class="… is-web">`.

---

## Process Responsibilities

### Main (`src/main/main.js`)

- Creates the main `BrowserWindow` with app icon (`assets/icons`).
- Sets Windows `AppUserModelId` (`com.aveditor.app`).
- Registers IPC: drives, directories, file/media info, dialogs, project I/O, export stubs, delete, copy-into-dir, native drag-out.
- Loads application menu after `prepareMenuIcons()`.

### Menu (`src/main/menu.js`, `menuIcons.js`)

- Builds the native application menu from locale JSON (`en` / `ko`).
- Rebuilds on `set-menu-locale` from the renderer.
- Menu item icons: SVG → 16×16 PNG via **sharp** → `nativeImage`.

### Preload (`src/main/preload.js`)

Exposes `window.electronAPI`, including:

| API | Purpose |
|-----|---------|
| `listDrives` / `readDirectory` | File tree |
| `pathAncestors` / `getPathSep` | Path navigation |
| `getFileInfo` / `getMediaInfo` | File info panel |
| `openFolderDialog` / project dialogs | OS dialogs |
| `showItemInFolder` | Reveal in Explorer/Finder |
| `deleteMediaFile` / `copyFilesToDir` | Tree delete / drop-import |
| `startDrag` (sync) | Native drag-out from file panel |
| `setMenuLocale` | Sync native menu language |
| `onMenuAction` | Menu → renderer commands |

---

## Renderer Modules

### `app.js` — Orchestrator

- Builds toolbar, wires components, keyboard shortcuts, menu actions.
- Theme / locale persistence (`localStorage`).
- Sidebar width resize + persistence.
- Transport buttons share the same clock as preview (`_togglePlay`, `_stopPlayback`, seek helpers).
- Context menus for tree, preview, and timeline.

### `fileTree.js` — Explorer / Library

- Electron: lazy-loaded drive-rooted tree; restores `av-editor-last-dir`.
- Web: virtual Library with Add media, drop import, context delete.
- Path bar + (Electron) multi-drive `<select>`.
- Media-only leaves; drag to timeline / preview.

### `fileInfo.js` — Metadata panel

- Atomic render with loading state.
- Fields: name, type, size, format, duration, container, resolution, fps, codecs, sample rate, channels, bitrates, dates, path.
- Enrichment via `getMediaInfo` (and preview-side HTML5 probe merge).

### `preview.js` — Player

- `<video>` / `<audio>`; Electron `file://` or resolved URL; web `blob:` / HTTP samples.
- View modes: `fit` | `fill` | `actual`.
- Effect presets + CSS filters / Web Audio (bass/treble) / playback rate.
- **Transport cue overlay** (`#preview-transport-cue`):
  - Icons for play, pause, stop, rewind, fast-forward, skip±
  - Non-pause cues auto-hide after ~900 ms
  - **Pause is sticky** until another transport cue (or `clearTransportCue` on load/empty)
  - Stacked above video/audio placeholder for Chromium compositor safety

### `timeline.js` — Editor canvas

- Multi-track layout (default 2 video + 2 audio).
- Hit-testing for select / drag / trim.
- Split at playhead, delete, zoom.
- Drop target for media entries; `getState` / `loadState` for `.avp`.

### `electron-api-shim.js` — Web bridge

- No-ops or browser equivalents when `window.electronAPI` is not already provided by preload.
- In-memory Library, sample seeding, mediainfo.js load, project download, export placeholder.

### `contextMenu.js` / `i18n.js` / `icons.js`

- Floating menus with SVG icons; nested i18n keys with English fallback; shared icon set for toolbar/preview/cues.

---

## Layout Model

CSS Grid keeps panels visible under large media content:

```
#app
  toolbar
  #main-layout
    #left-sidebar          (minmax(0,1fr) + file info)
      #file-tree-panel
      #file-info-panel
      #sidebar-resize-handle
    #work-area             (minmax(0,1fr) | timeline | status)
      #preview-section
      #timeline-section
      #status-bar
```

Flexible rows use `minmax(0, 1fr)` so preview video cannot push the timeline/controls off-screen.

---

## Data & Persistence

| Key | Storage | Purpose |
|-----|---------|---------|
| `av-editor-last-dir` | localStorage | Last folder in file tree (Electron) |
| `av-editor-theme` | localStorage | `dark` / `light` |
| `av-editor-locale` | localStorage | `en` / `ko` |
| `av-editor-sidebar-width` | localStorage | Left panel width (px) |
| `av-editor-preview-view` | localStorage | `fit` / `fill` / `actual` |
| Project `.avp` | filesystem or download | Timeline JSON: `{ tracks, clips, duration }` |
| Web Library | memory | Session-only media `Map` under `/library` |

`.avp` is pretty-printed JSON from `timeline.getState()` (clips include path/blob refs and effect state). No schema version field yet.

---

## IPC surface (Electron)

**Invoke:** `get-drives`, `read-directory`, `path-ancestors`, `get-path-sep`, `get-file-info`, `get-media-info`, `get-home-dir`, `get-special-folders`, dialogs (`open-file`, `open-folder`, `save-project`, `open-project`, `export`), `show-message-box`, `save-project-file`, `load-project-file`, `export-media`, `cancel-export`, `show-item-in-folder`, `delete-media-file`, `copy-files-to-dir`, `set-menu-locale`, `get-menu-locale`

**Sync:** `start-drag`

**Main → renderer:** `menu-action`, `export-progress`

---

## Build Pipeline

### Desktop

```
npm run generate-icons
        │  sharp: icon.svg → PNG sizes + icon.ico
        ▼
electron-builder (--win / --mac / --linux)
        │  output → dist/
        │  Windows: NSIS + build/installer.nsh (shortcut checkboxes)
        ▼
npm run copy-artifacts
        │  copy installers from dist/ → project root
```

Configuration: `electron-builder.yml` (`appId: com.aveditor.app`).

### Web

```
npm run build:web
        │  copy src/renderer → dist-web/
        │  copy samples/ + mediainfo.js
        │  CSP + shim + is-web body class
        ▼
dist-web/  (static host or `npx serve dist-web`)
```

Dev without packaging: `npm run web` → `scripts/start-web.js`.

### Windows installer customization

`build/installer.nsh` adds a page after the install directory step (desktop / Start Menu shortcut checkboxes). Defaults are checked; silent installs keep both.

---

## Supported Media (UI filter)

**Video:** `.mp4` `.avi` `.mov` `.mkv` `.webm` `.flv` `.wmv` `.m4v` `.ts` `.mts`  

**Audio:** `.mp3` `.wav` `.aac` `.flac` `.ogg` `.m4a` `.wma` `.opus` `.aiff`

Playback uses Chromium’s media stack. Export is scaffolded (`export-media` / web placeholder) and can be wired to FFmpeg later.

---

## Extension Points

| Area | How to extend |
|------|----------------|
| Locales | Add keys to `en.json` / `ko.json`; menu picks them up via `menu.js` |
| Menu icons | Add SVG entries in `menuIcons.js` |
| Toolbar | `app.js` `_buildToolbar` + `icons.js` |
| Tracks | `timeline.js` `addTrack` / default track setup |
| Web API | Mirror new preload methods in `electron-api-shim.js` |
| Transport cues | `preview.js` `showTransportCue` + `icons.js` |
| Export | Implement real encoder in `main.js` `export-media` (and web counterpart) |

---

## Related Docs

- [README.md](./README.md) — setup and scripts  
- [UsersGuide.md](./UsersGuide.md) — end-user documentation  
