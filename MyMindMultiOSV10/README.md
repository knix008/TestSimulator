# MyMind

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
| [UsersGuide.md](./UsersGuide.md) | End-user manual (KO/EN features) |

## Features

- **Mindmap** and **Fishbone (Ishikawa)** diagram modes
  - Fishbone is a nested Ishikawa: a horizontal spine, diagonal category bones, and horizontal sub-axes with diagonal cause bones — bones stay pinned to their parent axis even when nodes are dragged
- Layouts (chosen from the left panel dropdown): radial, left‑to‑right, right‑to‑left, top‑to‑bottom
- Shapes, line shapes (curve / straight / elbow / **tree‑root taper**), line patterns, and **start/end caps** (arrow, dot, diamond) — every line dropdown shows a live preview of the style
- Editing: double‑click a shape to rename, per‑shape **memo/note** (shows a ✎ badge + tooltip)
- **Multi‑select**: drag a marquee to select several nodes, Shift‑click to toggle; move or delete them together; right‑click keeps the selection and opens a context menu
- Node drag (with a small threshold so clicks don't nudge), auto‑align, reset/center view
- **Zoom** 10%–400% with the plain mouse wheel, centered on the viewport
- **Export** the diagram to a PNG image
- Theme‑aware default text color (black), fully customizable per node
- Canvas grid toggle, Korean / English localization, Light / Dark theme
- Frameless desktop window with icon+label toolbar, status bar, About dialog
- `.mmap` JSON file save/open (legacy `.mymind` files still open), bundled sample templates
- Windows NSIS installer with `.mmap` file association; Start Menu / Desktop shortcut options

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
| `npm run make:file-icon` | Generate `build/file-icon.ico`/`.png` from `build/file-icon.svg` (needs `sharp` + `png-to-ico`) |

Installer files (`.exe`, `.dmg`, `.AppImage`, `.deb`) are copied to the **project root** after packaging. Intermediate build output remains in `release/`.

## Project layout

```
MyMindMultiOSV10/
├── electron/          # Electron main & preload (dialogs, file & image I/O, IPC)
├── src/
│   ├── components/    # Toolbar, canvas, side panels, dialogs, previews
│   ├── hooks/         # useAppState (all app state & actions)
│   ├── store/         # document model (create / mutate / (de)serialize)
│   ├── layout/        # mindmap & fishbone layout engine
│   ├── utils/         # PNG export
│   ├── constants/     # colors, theme text color
│   └── i18n/          # ko / en locales
├── build/             # App icons, file-type icon (file-icon.svg), NSIS script
├── scripts/           # installer copy, file-icon generator
├── template/          # bundled sample .mmap diagrams
├── Architecture.md
├── UsersGuide.md
└── package.json
```

## File format

Diagrams are saved as **`.mmap`** (UTF-8 JSON). Legacy `.mymind` files still open.
See [Architecture.md](./Architecture.md#file-format).

## License

UNLICENSED — All rights reserved.  
Copyright © 2026 SHKWON (`knix008@naver.com`)
