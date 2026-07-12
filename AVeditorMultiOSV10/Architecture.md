# Architecture

## Overview

AV Editor is a cross-platform audio/video editor built with **Electron 26** and vanilla JavaScript (no bundler for the renderer). Desktop targets are Windows, macOS, and Linux via **electron-builder**.

Security model:

- `contextIsolation: true`
- `nodeIntegration: false`
- Renderer talks to the OS only through `preload.js` → `window.electronAPI`

```
┌──────────────────────────────────────────────────────────────┐
│  Main Process (src/main/)                                    │
│  main.js — BrowserWindow, IPC (fs, dialogs, export)          │
│  menu.js / menuIcons.js — localized native menu + icons      │
│  preload.js — contextBridge → window.electronAPI             │
└────────────────────────────┬─────────────────────────────────┘
                             │  ipcRenderer.invoke / on
┌────────────────────────────▼─────────────────────────────────┐
│  Renderer (src/renderer/)                                    │
│  index.html → js/app.js                                      │
│    ├─ fileTree.js      directory tree                        │
│    ├─ fileInfo.js      selected file metadata                │
│    ├─ preview.js       media player + view modes             │
│    ├─ timeline.js      canvas multi-track editor             │
│    ├─ contextMenu.js   floating context menus                │
│    ├─ i18n.js + locales/en.json, ko.json                     │
│    └─ icons.js, styles/main.css                              │
└──────────────────────────────────────────────────────────────┘
```

---

## Process Responsibilities

### Main (`src/main/main.js`)

- Creates the main `BrowserWindow` with app icon (`assets/icons`).
- Sets Windows `AppUserModelId` (`com.aveditor.app`).
- Registers IPC handlers: drives, directories, file info, dialogs, project I/O, export stubs.
- Loads application menu after `prepareMenuIcons()`.

### Menu (`src/main/menu.js`, `menuIcons.js`)

- Builds the native application menu from locale JSON (`en` / `ko`).
- Rebuilds on `set-menu-locale` from the renderer.
- Menu item icons: SVG → 16×16 PNG via **sharp** → `nativeImage`.

### Preload (`src/main/preload.js`)

Exposes a minimal API surface, for example:

| API | Purpose |
|-----|---------|
| `listDrives` / `readDirectory` | File tree |
| `pathAncestors` / `getPathSep` | Path navigation |
| `getFileInfo` / `getMediaInfo` | File info panel |
| `openFolderDialog` / project dialogs | OS dialogs |
| `showItemInFolder` | Reveal in Explorer/Finder |
| `setMenuLocale` | Sync native menu language |
| `onMenuAction` | Menu → renderer commands |

---

## Renderer Modules

### `app.js` — Orchestrator

- Builds toolbar, wires components, keyboard shortcuts, menu actions.
- Theme / locale persistence (`localStorage`).
- Sidebar width resize + persistence.
- Context menus for tree, preview, and timeline.

### `fileTree.js` — Explorer

- Lazy-loaded drive-rooted tree.
- Restores `av-editor-last-dir` on startup (falls back to home).
- Path bar + multi-drive `<select>`.
- Media-only leaves (video/audio extensions).

### `fileInfo.js` — Metadata panel

- Shows name, type, size, format, dates, path for the selected entry.
- Optional enrichment via `getMediaInfo`.

### `preview.js` — Player

- `<video>` / `<audio>` with `file://` sources in Electron.
- View modes: `fit` | `fill` | `actual` (CSS + inline size for 1:1).
- Control bar + fullscreen.

### `timeline.js` — Editor canvas

- Multi-track layout (default 2 video + 2 audio).
- Hit-testing for select / drag / trim.
- Split at playhead, delete, zoom.
- Drop target for media entries.

### `contextMenu.js` — UI menus

- Fixed-position floating menu with optional SVG icons, shortcuts, danger state.

### `i18n.js` + `locales/`

- Nested key lookup with English fallback.
- Updates `data-i18n` / `data-i18n-tooltip` DOM nodes.
- Same JSON files feed the **native** menu in the main process.

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

Critical detail: flexible rows use `minmax(0, 1fr)` so preview video cannot push the timeline/controls off-screen.

---

## Data & Persistence

| Key | Storage | Purpose |
|-----|---------|---------|
| `av-editor-last-dir` | localStorage | Last folder in file tree |
| `av-editor-theme` | localStorage | `dark` / `light` |
| `av-editor-locale` | localStorage | `en` / `ko` |
| `av-editor-sidebar-width` | localStorage | Left panel width (px) |
| `av-editor-preview-view` | localStorage | `fit` / `fill` / `actual` |
| Project `.avp` | filesystem | Timeline state JSON |

---

## Build Pipeline

```
npm run generate-icons
        │  sharp: icon.svg → PNG sizes + icon.ico
        ▼
electron-builder (--win / --mac / --linux)
        │  output → dist/
        │  Windows: NSIS + build/installer.nsh (shortcut checkboxes)
        ▼
npm run copy-artifacts
        │  copy *.exe / *.dmg / … from dist/ → project root
        ▼
Installer at repository root (e.g. AV Editor Setup 1.0.0.exe)
```

Configuration: `electron-builder.yml` (`appId: com.aveditor.app`).

### Windows installer customization

`build/installer.nsh` adds a page after the install directory step:

- Checkbox: desktop shortcut  
- Checkbox: Start Menu shortcut  

Defaults are checked; silent installs keep both. On upgrade the page is skipped so existing shortcuts remain.

---

## Supported Media (UI filter)

**Video:** `.mp4` `.avi` `.mov` `.mkv` `.webm` `.flv` `.wmv` `.m4v` `.ts` `.mts`  

**Audio:** `.mp3` `.wav` `.aac` `.flac` `.ogg` `.m4a` `.wma` `.opus` `.aiff`

Playback uses Chromium’s built-in media stack (`file://`). Export is scaffolded via IPC (`export-media`) and can be wired to FFmpeg later.

---

## Extension Points

| Area | How to extend |
|------|----------------|
| Locales | Add keys to `en.json` / `ko.json`; menu picks them up via `menu.js` |
| Menu icons | Add SVG entries in `menuIcons.js` |
| Toolbar | `app.js` `_buildToolbar` + `icons.js` |
| Tracks | `timeline.js` `addTrack` / default track setup |
| Export | Implement real encoder in `main.js` `export-media` handler |

---

## Related Docs

- [README.md](./README.md) — setup and scripts  
- [UsersGuide.md](./UsersGuide.md) — end-user documentation  
