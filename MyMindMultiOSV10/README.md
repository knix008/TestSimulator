# MyMind v1.0

Cross-platform **Mindmap** and **Fishbone** diagram editor for Web, Windows, macOS, and Linux.

| | |
|---|---|
| **Version** | 1.0.0 |
| **Developer** | SHKWON (`knix008@naver.com`) |
| **Copyright** | Copyright © 2026 SHKWON |
| **Stack** | Electron · React · TypeScript · Vite |

## Documentation

| Document | Description |
|----------|-------------|
| [Architecture.md](./Architecture.md) | System structure, modules, data flow |
| [UsersGuide.md](./UsersGuide.md) | End-user manual (KO/EN) |

## Features

- **Mindmap** and **Fishbone (Ishikawa)** modes sharing one node/edge model — the **Mindmap ⇄ Fishbone toggle** just re-renders the same content
  - Fishbone is a nested Ishikawa: a horizontal spine, diagonal category bones alternating above/below (balanced by subtree size), and nested cause bones that also fan up/down — bones stay pinned to their parent axis even when nodes are dragged, with dynamic, overlap-free spacing
- **Layouts** (toolbar dropdown): Radial, Top→Bottom, Bottom→Top, Left→Right, Right→Left
- **12 node shapes**: rounded, rectangle, ellipse, diamond, parallelogram, stadium, hexagon, octagon, cylinder, trapezoid, chevron, note — the shape dropdown shows a live preview of each
- **Lines**: curve / straight / elbow / **tree-root taper**; patterns (solid, dashed, dotted, dash-dot); **start/end caps** (arrow, dot, diamond) — connectors attach at the **midpoint of the facing node surface**
- **Select a line** on its own to edit it; **manually override the connection face** (start/end: auto/top/bottom/left/right)
- **Text**: font family (presets + **all installed system fonts**), **font size**, color, bold/italic/underline/strike
- **Undo / Redo** (toolbar, context menu, Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z)
- Editing: double-click to rename, per-shape **memo/note** (✎ badge + tooltip), **duplicate / copy / paste** of a node and its subtree
- **Multi-select** (marquee / Shift-click), group move/delete; node drag with a click threshold
- Node list as a **tree view** with parent/child connector lines; selecting a node highlights it on the canvas
- **Auto Align**, **Center View**, and **zoom-to-fit** when opening a file
- **Zoom** 10%–400% with the mouse wheel; pan with the middle button (or left-drag when the grid is on)
- **Export** to **PNG / JPEG / WebP / SVG**, cropped to the diagram's minimum size, with an optional **transparent background**
- **6 themes**: Light, Dark, Midnight, Forest, Sunset, Ocean · Korean / English localization
- Frameless desktop window; toolbar with a **File menu**, mode toggle, undo/redo, layout, view tools, theme, language, About
- **About** shows version, developer, build date, and runtime versions
- **Unsaved-changes prompt** on close (Save / Don't Save / Cancel)
- `.mmap` JSON save/open (legacy `.mymind` still opens), bundled **sample templates**
- Windows NSIS installer with **`.mmap` file association** (double-click opens in MyMind) and Start Menu / Desktop shortcut options

## Requirements

- Node.js 20+ (recommended)
- npm 10+

## Quick start

```bash
npm install
npm start              # Desktop (Electron + Vite)
npm run electron:dev   # same as npm start
npm run dev            # Web only → http://localhost:5173
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Start desktop app (Electron + Vite) |
| `npm run dev` | Vite web dev server |
| `npm run electron:dev` | Same as `npm start` |
| `npm run build` | Production web build + Electron compile |
| `npm run build:win` | Windows NSIS installer → `release/` then copy to project root |
| `npm run build:mac` | macOS DMG → `release/` then copy to project root |
| `npm run build:linux` | AppImage + deb → `release/` then copy to project root |
| `npm run electron:build` | Package for current OS |
| `npm run copy:installer` | Copy installer artifacts from `release/` to project root |

Developer-only helper scripts (need `npm i -D sharp png-to-ico`, run manually):

| Command | Description |
|---------|-------------|
| `node scripts/gen-icons.mjs` | Regenerate app + `.mmap` icons from `build/app-icon.svg` / `build/file-icon.svg` |
| `node scripts/gen-samples.mjs` | Regenerate the bundled sample `.mmap` files in `template/` |

Installer files (`.exe`, `.dmg`, `.AppImage`, `.deb`) are copied to the **project root** after packaging. Intermediate build output remains in `release/`.

## Project layout

```
MyMindMultiOSV10/
├── electron/          # Electron main & preload (dialogs, file & image I/O, IPC)
├── src/
│   ├── components/    # Toolbar, canvas, side panels, menus, dialogs, previews
│   ├── hooks/         # useAppState (all app state & actions), useSystemFonts
│   ├── store/         # document model (create / mutate / (de)serialize)
│   ├── layout/        # mindmap & fishbone layout engine
│   ├── utils/         # image export, shape paths
│   ├── constants/     # colors, theme text color
│   └── i18n/          # ko / en locales
├── build/             # App & file icons (SVG sources + generated PNG/ICO), NSIS script
├── scripts/           # installer copy, icon + sample generators
├── template/          # bundled sample .mmap diagrams (shipped with the installer)
├── Architecture.md
├── UsersGuide.md
└── package.json
```

## File format

Diagrams are saved as **`.mmap`** (UTF-8 JSON). Legacy `.mymind` files still open.
See [Architecture.md](./Architecture.md#12-file-format).

## License

UNLICENSED — All rights reserved.  
Copyright © 2026 SHKWON (`knix008@naver.com`)
