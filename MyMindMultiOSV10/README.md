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

- Mindmap / Fishbone diagram modes
- Layouts: radial, left-to-right, right-to-left
- Shape types and line styles
- Node drag, auto-align, center view (reset)
- Canvas grid toggle
- Frameless desktop window with icon+label toolbar, status bar, context menu
- Korean / English localization
- Light / Dark theme
- About dialog (copyright & developer info)
- `.mymind` JSON file save/open
- Windows NSIS installer: Start Menu / Desktop shortcut options, previous version removed before install

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

Installer files (`.exe`, `.dmg`, `.AppImage`, `.deb`) are copied to the **project root** after packaging. Intermediate build output remains in `release/`.

## Project layout

```
MyMindMultiOSV10/
├── electron/          # Electron main & preload
├── src/               # React UI, canvas, i18n, layout
├── build/             # App icons, NSIS custom script
├── public/            # Static assets for Vite
├── Architecture.md
├── UsersGuide.md
└── package.json
```

## File format

Diagrams are saved as **`.mymind`** (UTF-8 JSON). See [Architecture.md](./Architecture.md#file-format).

## License

UNLICENSED — All rights reserved.  
Copyright © 2026 SHKWON (`knix008@naver.com`)
