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
│  · IPC: window, dialogs, file I/O, app info, close flow │
│  · Single-instance + .mmap file-open handling           │
└───────────────────────┬─────────────────────────────────┘
                        │ contextBridge (preload)
┌───────────────────────▼─────────────────────────────────┐
│  Renderer (React + Vite)                                │
│  Toolbar · Canvas · SidePanels · ContextMenu · Dialogs  │
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
│   ├── main.ts          # App lifecycle, window, IPC, file-open, close flow
│   └── preload.ts       # Safe API exposed as window.mymind
├── src/
│   ├── App.tsx          # Shell composition
│   ├── main.tsx         # React entry
│   ├── types.ts         # Shared domain types
│   ├── components/      # Toolbar, Canvas, SidePanels, menus, dialogs, previews
│   ├── hooks/
│   │   ├── useAppState.ts   # All app state & actions (incl. undo/redo)
│   │   └── useSystemFonts.ts# Local Font Access enumeration
│   ├── store/
│   │   └── document.ts  # Document mutations + serialize/deserialize
│   ├── layout/
│   │   └── engine.ts    # Radial / TTB / BTT / LTR / RTL / nested Fishbone
│   ├── utils/
│   │   ├── exportImage.ts  # SVG → PNG/JPEG/WebP/SVG export
│   │   └── shapePath.ts    # Node shape path builder (shared, non-component)
│   ├── constants/
│   │   └── colors.ts    # Node palette + theme text color
│   ├── i18n/            # ko / en JSON catalogs
│   └── styles/
│       └── global.css   # Themes (CSS variables) + all styling
├── build/
│   ├── app-icon.svg     # Source for the app icon
│   ├── file-icon.svg    # Source for the .mmap document icon
│   ├── icon.png / icon.ico          # Generated app icons
│   ├── file-icon.png / file-icon.ico# Generated .mmap file icons (committed)
│   ├── icons/           # Linux icon sizes
│   └── installer.nsh    # NSIS: uninstall previous version
├── scripts/
│   ├── copy-installer.mjs
│   ├── gen-icons.mjs    # Rasterize SVG sources → PNG/ICO
│   ├── gen-samples.mjs  # Regenerate template/*.mmap
│   └── make-file-icon.mjs
├── template/            # Bundled sample .mmap diagrams (extraResources)
├── public/              # Vite public assets (icon.png used in-app)
└── package.json         # Scripts + electron-builder config
```

## 4. Process model (Electron)

### 4.1 Main process

- Creates a **frameless** `BrowserWindow`; disables the application menu
- Dev loads `http://localhost:5173`; production loads `dist/index.html`
- Grants the `local-fonts` permission so the renderer can enumerate system fonts
- **Single instance**: a second launch (e.g. double-clicking a `.mmap`) forwards the file to the running window
- **File association**: opens a `.mmap` passed on the command line / `open-file` (macOS) and sends it to the renderer
- **Close flow**: while the document is dirty, `close` is intercepted and the renderer shows a Save / Don't Save / Cancel prompt; `app:confirmClose` then `destroy()`s the window
- Handles IPC:
  - `window:minimize` / `maximize` / `close` / `isMaximized` / `setMinWidth`
  - `dialog:open` (starts in the templates folder; accepts `.mmap` / `.mymind`) / `dialog:save`
  - `dialog:saveImage` (filter derived from the chosen extension) / `file:write` / `file:writeBinary`
  - `shell:openExternal`
  - `app:getInfo` (name, version, author, email, copyright, platform, runtime versions, build date)
  - `app:setDirty` / `app:confirmClose` (close flow); sends `app:requestClose`, `file:opened`

### 4.2 Preload

`contextBridge.exposeInMainWorld('mymind', api)` exposes a typed API. The renderer never gets `nodeIntegration`.

### 4.3 Renderer

Pure React app; detects Electron via `window.mymind?.isElectron`. Without Electron, open/save use `<input type="file">` / blob downloads, and unsaved changes trigger the browser's `beforeunload` prompt.

## 5. UI composition

```
┌─ Toolbar (drag region + no-drag controls) ───────────────────┐
│ Brand · File▾ · Undo/Redo · Mode-toggle Layout▾ · View ·    │
│ Theme▾ · Lang · [right cluster: About · min/max/close]      │
├──────────────────────────────────────────────────────────────┤
│  DiagramCanvas (SVG): grid · pan/zoom · node & edge select   │
├─ StatusBar ──────────────────────────────────────────────────┤
│ Mode · Layout · Nodes · Zoom · Grid · File status            │
└──────────────────────────────────────────────────────────────┘
```

| Component | Responsibility |
|-----------|----------------|
| `Toolbar` | **File menu** (New/Open/Save/Export), Undo/Redo, **Mindmap⇄Fishbone toggle**, layout, view tools, theme, locale, About, window controls. Measures its content to keep the OS window from clipping any button. |
| `ToolbarMenu` | Action dropdown (File) rendered in a portal so it escapes toolbar clipping |
| `ToolbarDropdown` | Value dropdown (layout, theme, shape, font, line, connection side) in a portal; shows the selected option's icon/preview |
| `SidePanels` | Left: **Node List as a tree view**. Right: node/edge properties (text, memo, shape, font family/size, colors, line shape/pattern/caps, **connection side**) |
| `LinePreview` / `ShapePreview` | Small SVG previews of line styles / node shapes |
| `DiagramCanvas` | SVG rendering, pan, wheel zoom, node drag, **edge click-select**, marquee multi-select, grid, view fit |
| `ContextMenu` | Right-click actions (undo/redo, add/edit, duplicate/copy/paste, file & view actions, delete) with icons |
| `AboutDialog` / `ExportDialog` / `ConfirmCloseDialog` | About info; export format + transparency; unsaved-changes prompt |

## 6. Application state

Central hook: `useAppState` (`src/hooks/useAppState.ts`).

| State | Source | Persistence |
|-------|--------|-------------|
| `doc` | `DiagramDocument` | `.mmap` file on save |
| `settings` | locale, theme, showGrid | `localStorage` (`mymind.settings`) |
| `zoom` / `viewResetKey` | View | Session only |
| `editingId` / `contextMenu` / dialog flags | UI | Session only |
| Undo/redo history | `past` / `future` refs | Session only |

- **Undo/Redo**: a `useEffect` records the previous `doc` when its content arrays (nodes/edges/mode/layout/defaults) change by reference; selection-only changes are ignored. History resets on New / Open.
- Document mutations live in `src/store/document.ts` (pure functions): create, add child/sibling/free, delete (single/multi), move (single/group), duplicate & paste subtree, shape/color/note/text-style, edge line/pattern/color/caps/**connection side**, mode switch, layout, serialize/deserialize.

## 7. Domain model

```ts
DiagramDocument {
  version: 1
  mode: 'mindmap' | 'fishbone'
  layout: 'radial' | 'ltr' | 'rtl' | 'ttb' | 'btt'
  defaultShape, defaultLine, defaultLinePattern
  nodes: DiagramNode[]
  edges: DiagramEdge[]
  selectedId, selectedIds, selectedEdgeId, filePath, dirty  // runtime / UI
}
```

- **Nodes**: tree via `parentId`; 12 `shape` values; Fishbone `role` (`effect` | `category` | `cause`); optional `note`; `textStyle` = `{ fontFamily (preset or system font), fontSize, color ('auto' → black), bold, italic, underline, strike }`
- **Edges**: parent → child; `lineType`, `linePattern`, `color`, optional `startCap`/`endCap` (`none`|`arrow`|`dot`|`diamond`), and optional `fromSide`/`toSide` (`auto`|`top`|`bottom`|`left`|`right`) manual connection-face overrides
- **Selection**: `selectedId`/`selectedIds` (nodes) and `selectedEdgeId` (a single edge) are mutually exclusive; none are serialized
- Manual drag updates `x`/`y` without relayout (group drag moves the whole selection)

## 8. Layout engine

`src/layout/engine.ts`

| Mode / layout | Behavior |
|---------------|----------|
| Mindmap · radial | Recursive **sector (wedge)** layout: each node owns an angular slice split among children by leaf count, so branches never cross |
| Mindmap · ltr / rtl | Horizontal tree; connectors follow the layout axis |
| Mindmap · ttb / btt | Vertical tree top→bottom / bottom→top |
| Fishbone | Nested Ishikawa. Categories alternate above/below the spine, **balanced by subtree size**; each node fans its children up/down, each child in its own horizontal slot (dynamic spacing from subtree reach) so **nodes never overlap**. A per-side clamp keeps a branch on its side of the spine. Spacing is tuned to be compact. |

Layout runs on new document, mode switch, layout change, and Auto Align — re-fit (zoom-to-fit) to the real viewport — not on every resize or node drag. The canvas re-derives fishbone bones/axes from node positions using a fixed angle, so they follow dragged nodes.

## 9. Rendering

- SVG scene with pan (`translate`) and zoom (`scale`); wheel zoom 10%–400%, centered on the viewport; view-fit scales to show the whole diagram
- Shapes built by `src/utils/shapePath.ts` (12 shapes)
- Connectors attach at the **midpoint of the facing node surface** (per-shape insets keep the point on slanted/curved outlines); `fromSide`/`toSide` override the face. Curve/elbow arrive perpendicular to the face; caps use per-colour markers with explicit fills
- **root** line renders as a filled, depth-tapered ribbon; Fishbone skeleton (spine/sub-axes/bones) drawn as filled tapered shapes honouring edge colour/pattern
- Node label uses `text-anchor`/`dominant-baseline` **attributes** (not only CSS) so exports match the screen
- `note` shows a ✎ badge + `<title>` tooltip; selected node/edge highlighted with the accent colour
- Marquee select (left-drag on empty canvas); middle-button drag pans; left-drag pans when the grid is on
- Export clones the live SVG, strips pan/zoom + grid, resolves CSS variables, crops to content, and outputs SVG or rasterizes to PNG/JPEG/WebP (`src/utils/exportImage.ts`), with optional transparent background

## 10. Internationalization & theme

- Locales: `src/i18n/locales/ko.json`, `en.json`
- **6 themes** via `data-theme` on `<html>` (light, dark, midnight, forest, sunset, ocean); CSS variables in `global.css`
- Preferences stored in `localStorage`

## 11. Packaging & installer

Configured in `package.json` → `"build"` (electron-builder).

| Platform | Target |
|----------|--------|
| Windows | NSIS (`oneClick: false`, shortcut choices) |
| macOS | DMG |
| Linux | AppImage, deb |

`build/installer.nsh` `customInit` removes a previous install (silent uninstall + leftover cleanup) before installing.

- **App / installer icon**: `build/icon.ico` (win `icon` + NSIS `installerIcon`/`uninstallerIcon`/`installerHeaderIcon`).
- **File association**: `build.fileAssociations` registers `.mmap` with the `build/file-icon.ico` document icon; the app opens a double-clicked file.
- **Templates**: `build.extraResources` copies `template/` to `resources/template/` so the sample `.mmap` files ship with the installer (the Open dialog starts there). The NSIS `customInstall` macro also copies them to `Documents\MyMind Examples` as editable examples (`customUnInstall` removes them).
- Generated icon rasters and sample `.mmap` files are committed so packaging works without the icon dev tools.

App id: `com.shkwon.mymind` · Product name: `MyMind`

## 12. File format

Extension: **`.mmap`** (JSON, UTF-8). Legacy **`.mymind`** files still open.

Serialized fields (runtime UI fields such as `selectedId` / `selectedIds` / `selectedEdgeId` / `filePath` / `dirty` omitted):

```json
{
  "version": 1,
  "mode": "mindmap",
  "layout": "radial",
  "defaultShape": "rounded",
  "defaultLine": "curve",
  "defaultLinePattern": "solid",
  "nodes": [ /* id, parentId, text, x, y, width, height, shape, color, textStyle{fontFamily,fontSize,color,bold,italic,underline,strike}, note?, role? */ ],
  "edges": [ /* id, from, to, lineType, linePattern, color, startCap, endCap, fromSide, toSide */ ]
}
```

## 13. Security notes

- `contextIsolation: true`, `nodeIntegration: false`
- Preload whitelist only
- CSP in `index.html` restricts script/style/font/connect sources
- File paths for save/open come from Electron dialogs (desktop) or the user file picker (web)

## 14. Extension points

| Area | Where to change |
|------|-----------------|
| New shape | `types.ts`, `utils/shapePath.ts`, `SidePanels` (SHAPE_VALUES), i18n |
| New line style / cap | canvas path helpers + markers, `LinePreview`, `SidePanels`, i18n |
| New layout | `layout/engine.ts` + toolbar layout options + i18n |
| New theme | `global.css` `[data-theme]` block + `THEME_MODES` + i18n |
| Export formats | `src/utils/exportImage.ts` + `ExportDialog` |
| Undo granularity | `useAppState` history effect |
