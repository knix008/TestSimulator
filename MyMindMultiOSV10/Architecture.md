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
│   │   └── document.ts  # Document mutations (add/delete/move/…)
│   ├── layout/
│   │   └── engine.ts    # Radial / LTR / RTL / Fishbone layout
│   ├── i18n/            # ko / en JSON catalogs
│   └── styles/
│       └── global.css
├── build/
│   ├── icon.png         # App / installer icon
│   ├── icons/           # Linux icon sizes
│   └── installer.nsh    # NSIS: uninstall previous version
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
  - `dialog:open` / `dialog:save`
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
| `Toolbar` | Commands, dropdowns (layout/shape/line), theme, locale, about |
| `ToolbarDropdown` | Custom popup menus (replaces native `<select>`) |
| `DiagramCanvas` | SVG rendering, pan, zoom, node drag, grid, view reset |
| `StatusBar` | Live status + grid toggle |
| `ContextMenu` | Node/canvas right-click actions |
| `AboutDialog` | Copyright, developer, version, platform |

## 6. Application state

Central hook: `useAppState` (`src/hooks/useAppState.ts`).

| State | Source | Persistence |
|-------|--------|-------------|
| `doc` | `DiagramDocument` | `.mymind` file on save |
| `settings` | locale, theme, showGrid | `localStorage` (`mymind.settings`) |
| `zoom` / `viewResetKey` | View | Session only |
| `editingId` / `contextMenu` / `aboutOpen` | UI | Session only |

Document mutations live in `src/store/document.ts` (pure functions): create, add child/sibling, delete, move, shape/line, layout, serialize/deserialize.

## 7. Domain model

```ts
DiagramDocument {
  version: 1
  mode: 'mindmap' | 'fishbone'
  layout: 'radial' | 'ltr' | 'rtl'
  defaultShape, defaultLine
  nodes: DiagramNode[]
  edges: DiagramEdge[]
  selectedId, filePath, dirty   // runtime / UI fields
}
```

- **Nodes**: tree via `parentId`; Fishbone uses `role` (`effect` | `category` | `cause`)
- **Edges**: connect parent → child; carry `lineType` and color
- Manual drag updates `x`/`y` without full relayout
- **Auto Align** calls `relayout()` with current mode/layout
- **Center View** recenters pan/zoom on content bounds

## 8. Layout engine

`src/layout/engine.ts`

| Mode / layout | Behavior |
|---------------|----------|
| Mindmap · radial | Concentric rings around root |
| Mindmap · ltr | Horizontal tree left → right |
| Mindmap · rtl | Horizontal tree right → left |
| Fishbone | Effect on the right, categories on spine sides, causes branching |

Layout runs on new document, mode switch, layout change, and Auto Align — not on every resize or node drag.

## 9. Rendering

- SVG scene with pan (`translate`) and zoom (`scale`)
- Shapes: rounded, rect, ellipse, diamond, parallelogram (path builders)
- Lines: solid, dashed, dotted, curve (cubic Bezier); Fishbone uses orthogonal segments
- Optional screen-space grid via SVG `<pattern>`
- Double-click edits node text in an overlay `<input>`

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

App id: `com.shkwon.mymind`  
Product name: `MyMind`

## 12. File format

Extension: **`.mymind`** (JSON, UTF-8)

Serialized fields (runtime UI fields omitted):

```json
{
  "version": 1,
  "mode": "mindmap",
  "layout": "radial",
  "defaultShape": "rounded",
  "defaultLine": "curve",
  "nodes": [ /* id, parentId, text, x, y, width, height, shape, color, role? */ ],
  "edges": [ /* id, from, to, lineType, color */ ]
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
| New shape / line style | `types.ts`, canvas path helpers, i18n, toolbar options |
| New layout | `layout/engine.ts` + toolbar dropdown |
| Export PNG/SVG | New action in Toolbar + canvas snapshot helper |
| Collaboration / undo | Layer history in `useAppState` / document store |
