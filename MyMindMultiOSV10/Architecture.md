# MyMind Architecture

**Product:** MyMind 1.0.0  
**Author:** SHKWON (`knix008@naver.com`)  
**Copyright:** Copyright © 2026 SHKWON

## 1. Overview

MyMind is a cross-platform diagram editor that runs as:

1. **Desktop app** — Electron (Windows / macOS / Linux)
2. **Web app** — same React UI served by Vite (file dialogs fall back to browser APIs)

The UI is frameless on desktop (no native title bar). Window controls, toolbar, canvas, and status bar are rendered in the renderer process.

```
┌─────────────────────────────────────────────────────────┐
│  Electron Main (electron/main.ts)                       │
│  · BrowserWindow (frame: false)                         │
│  · IPC: window, dialogs, file I/O, app info             │
└───────────────────────┬─────────────────────────────────┘
                        │ contextBridge (preload)
┌───────────────────────▼─────────────────────────────────┐
│  Renderer (React + Vite)                                │
│  Toolbar · Canvas · StatusBar · ContextMenu · About     │
│  useAppState · document store · layout engine · i18n    │
└─────────────────────────────────────────────────────────┘
```

## 2. Technology stack

| Layer | Choice |
|-------|--------|
| Desktop shell | Electron 37 |
| UI | React 19 + TypeScript |
| Bundler | Vite 7 |
| i18n | i18next / react-i18next |
| Packaging | electron-builder (NSIS / DMG / AppImage / deb) |
| IDs | uuid |

## 3. Directory structure

```
MyMindMultiOSV10/
├── electron/
│   ├── main.ts          # App lifecycle, window, IPC handlers
│   └── preload.ts       # Safe API exposed as window.mymind
├── src/
│   ├── App.tsx          # Shell composition
│   ├── main.tsx         # React entry
│   ├── types.ts         # Shared domain types
│   ├── components/      # Toolbar, Canvas, menus, dialogs
│   ├── hooks/
│   │   └── useAppState.ts
│   ├── store/
│   │   └── document.ts  # Document mutations (add/delete/move/caps/…)
│   ├── layout/
│   │   └── engine.ts    # Radial / LTR / RTL / TTB / nested Fishbone layout
│   ├── utils/
│   │   └── exportImage.ts  # SVG → PNG export
│   ├── constants/
│   │   └── colors.ts    # Node palette + theme text color
│   ├── i18n/            # ko / en JSON catalogs
│   └── styles/
│       └── global.css
├── build/
│   ├── icon.png         # App / installer icon
│   ├── icons/           # Linux icon sizes
│   ├── file-icon.svg    # Source for the .mmap file-type icon (document + app icon)
│   └── installer.nsh    # NSIS: uninstall previous version
├── scripts/
│   ├── copy-installer.mjs
│   └── make-file-icon.mjs  # Rasterize file-icon.svg → .png/.ico
├── template/            # Bundled sample .mmap diagrams
├── public/              # Vite public assets
└── package.json         # Scripts + electron-builder config
```

## 4. Process model (Electron)

### 4.1 Main process

- Creates a **frameless** `BrowserWindow`
- Disables the application menu
- In development loads `http://localhost:5173`
- In production loads `dist/index.html`
- Handles IPC:
  - `window:minimize` / `maximize` / `close` / `isMaximized`
  - `dialog:open` (starts in the bundled templates folder; accepts `.mmap` and `.mymind`) / `dialog:save`
  - `dialog:saveImage` (PNG) / `file:writeBinary` (base64 → file)
  - `file:write`
  - `shell:openExternal`
  - `app:getInfo` (name, version, author, email, copyright, platform)

### 4.2 Preload

`contextBridge.exposeInMainWorld('mymind', api)` exposes a typed API.  
Renderer never gets `nodeIntegration`.

### 4.3 Renderer

Pure React app. Detects Electron via `window.mymind?.isElectron`.  
Without Electron, open/save use `<input type="file">` and download blobs.

## 5. UI composition

```
┌─ Toolbar (drag region + no-drag controls) ──────────────┐
│ Brand · File · Mode · Edit · Dropdowns · View · Window │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  DiagramCanvas (SVG)                                    │
│  · Grid pattern (optional)                              │
│  · Pan / zoom · Node drag · Context menu                │
│                                                         │
├─ StatusBar ─────────────────────────────────────────────┤
│ Mode · Layout · Nodes · Zoom · Grid · File status       │
└─────────────────────────────────────────────────────────┘
```

| Component | Responsibility |
|-----------|----------------|
| `Toolbar` | File (incl. **Export**), mode, view, theme, locale, about |
| `SidePanels` | Left: document info + **layout dropdown** + node list. Right: node/edge properties (text, memo, shape, line shape/pattern/**caps**, colors) |
| `ToolbarDropdown` | Custom popup menus (replaces native `<select>`); shows the selected option's icon |
| `LinePreview` | Small SVG previews of line shape / pattern / caps |
| `DiagramCanvas` | SVG rendering, pan, wheel zoom, node drag, **marquee multi-select**, grid, view reset |
| `StatusBar` | Live status + grid toggle |
| `ContextMenu` | Node/canvas right-click actions (multi-selection aware) |
| `AboutDialog` | Copyright, developer, version, platform |

## 6. Application state

Central hook: `useAppState` (`src/hooks/useAppState.ts`).

| State | Source | Persistence |
|-------|--------|-------------|
| `doc` | `DiagramDocument` | `.mmap` file on save |
| `settings` | locale, theme, showGrid | `localStorage` (`mymind.settings`) |
| `zoom` / `viewResetKey` | View | Session only |
| `editingId` / `contextMenu` / `aboutOpen` | UI | Session only |

Document mutations live in `src/store/document.ts` (pure functions): create, add child/sibling, delete (single **or multi**), move (single or **group by delta**), shape/color/note, line shape/pattern/color/**caps**, layout, serialize/deserialize.

## 7. Domain model

```ts
DiagramDocument {
  version: 1
  mode: 'mindmap' | 'fishbone'
  layout: 'radial' | 'ltr' | 'rtl' | 'ttb'
  defaultShape, defaultLine, defaultLinePattern
  nodes: DiagramNode[]
  edges: DiagramEdge[]
  selectedId, selectedIds, filePath, dirty   // runtime / UI fields
}
```

- **Nodes**: tree via `parentId`; Fishbone uses `role` (`effect` | `category` | `cause`); optional `note`; `textStyle.color` may be `'auto'` (resolves to black)
- **Edges**: connect parent → child; carry `lineType`, `linePattern`, `color`, and optional `startCap` / `endCap` (`none` | `arrow` | `dot` | `diamond`)
- **Selection**: `selectedId` is the primary (drives the properties panel); `selectedIds` is the full multi-selection (marquee / Shift-click). Neither is serialized.
- Manual drag updates `x`/`y` without full relayout (group drag moves every selected node)
- **Auto Align** calls `relayout()` with current mode/layout
- **Center View** recenters pan/zoom on content bounds

## 8. Layout engine

`src/layout/engine.ts`

| Mode / layout | Behavior |
|---------------|----------|
| Mindmap · radial | Concentric rings around root; ring radius grows with sibling count so nodes never crowd |
| Mindmap · ltr / rtl | Horizontal tree left → right / right → left |
| Mindmap · ttb | Vertical tree top → bottom |
| Fishbone | Nested Ishikawa: a horizontal spine, diagonal category bones at a fixed angle (alternating above/below), each category owns a horizontal sub-axis with diagonal cause bones. The canvas re-derives every bone's attach point from node positions using the same angle, clamped onto the parent's drawn axis, so bones stay connected when nodes are dragged. |

Layout runs on new document, mode switch, layout change (re-fit to the real viewport), and Auto Align — not on every resize or node drag.

## 9. Rendering

- SVG scene with pan (`translate`) and zoom (`scale`); wheel zoom is 10%–400%, multiplicative, centered on the viewport
- Shapes: rounded, rect, ellipse, diamond, parallelogram (path builders)
- Lines: curve / straight / elbow (stroked, with `linePattern` dashes and `start`/`end` cap markers using `context-stroke`); **root** renders as a filled, depth-tapered ribbon
- Fishbone skeleton (spine / sub-axes / bones) drawn as filled tapered shapes, thicker near the root
- `note` shows a ✎ badge and a `<title>` tooltip; default text color resolves via `resolveTextColor`
- **Marquee**: left-drag on empty canvas draws a selection rect (middle-button drag pans); a small movement threshold prevents accidental node nudging
- Optional screen-space grid via SVG `<pattern>`
- Double-click edits node text in an overlay `<input>`
- Export clones the live SVG, strips pan/zoom + grid, resolves CSS variables, and rasterizes to PNG (`src/utils/exportImage.ts`)

## 10. Internationalization & theme

- Locales: `src/i18n/locales/ko.json`, `en.json`
- Theme: `data-theme="light|dark"` on `<html>`, CSS variables in `global.css`
- Preference stored in `localStorage`

## 11. Packaging & installer

Configured in `package.json` → `"build"` (electron-builder).

| Platform | Target |
|----------|--------|
| Windows | NSIS (`oneClick: false`, shortcut choices) |
| macOS | DMG |
| Linux | AppImage, deb |

`build/installer.nsh` `customInit` looks up a previous uninstall registry key, runs silent uninstall, and removes leftover shortcuts/directories before install.

- **File association**: `build.fileAssociations` registers the `.mmap` extension with MyMind.
- **File-type icon**: `build/file-icon.svg` is the source for a document icon with the app icon composited on it. Run `npm run make:file-icon` (needs `sharp` + `png-to-ico`) to produce `build/file-icon.png` / `.ico`, then add `"icon": "build/file-icon"` to the `fileAssociations` entry.
- **Templates**: `build.extraResources` copies `template/` next to the app so the sample `.mmap` files ship with the installer.

App id: `com.shkwon.mymind`  
Product name: `MyMind`

## 12. File format

Extension: **`.mmap`** (JSON, UTF-8). Legacy **`.mymind`** files still open.

Serialized fields (runtime UI fields such as `selectedId` / `selectedIds` / `filePath` / `dirty` omitted):

```json
{
  "version": 1,
  "mode": "mindmap",
  "layout": "radial",
  "defaultShape": "rounded",
  "defaultLine": "curve",
  "defaultLinePattern": "solid",
  "nodes": [ /* id, parentId, text, x, y, width, height, shape, color, textStyle, note?, role? */ ],
  "edges": [ /* id, from, to, lineType, linePattern, color, startCap, endCap */ ]
}
```

## 13. Security notes

- `contextIsolation: true`, `nodeIntegration: false`
- Preload whitelist only
- CSP in `index.html` restricts script/style/font/connect sources
- File paths for save/open come from Electron dialogs (desktop) or user file picker (web)

## 14. Extension points

| Area | Where to change |
|------|-----------------|
| New shape / line style / cap | `types.ts`, canvas path helpers + markers, `LinePreview`, `SidePanels` options, i18n |
| New layout | `layout/engine.ts` + `SidePanels` layout dropdown |
| Export formats (SVG/JPEG) | `src/utils/exportImage.ts` + `useAppState.exportImage` |
| Collaboration / undo | Layer history in `useAppState` / document store |
