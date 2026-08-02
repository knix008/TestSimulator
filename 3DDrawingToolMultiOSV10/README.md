# 3D Drawing Tool

Cross-platform 3D drawing application for **Web**, **Windows**, **macOS**, and **Linux**.

| Item | Value |
|------|--------|
| Version | 1.0.0 |
| Author | SHKWON |
| Email | knix008@naver.com |
| License | MIT |

## Documentation

| Document | Description |
|----------|-------------|
| [Architecture.md](./Architecture.md) | System design, modules, data flow |
| [UsersGuide.md](./UsersGuide.md) | End-user manual (KO/EN UI) |

## Features

- Left tool palette: select, move, rotate, scale, primitives
- Center 3D viewport: orbit camera, grid, XYZ axes with labels, orientation gizmo
- Right properties panel: transform, material, lighting, viewport options
- Import 3D models / images: GLB, GLTF, OBJ, STL, FBX, PLY, PNG, JPG, WEBP
- Dark / Light themes
- Korean / English UI
- Project save & restore (`.3ddraw`)
- Frameless desktop window with custom toolbar
- About dialog with author information
- Installers with Desktop / Start Menu shortcut options

## Requirements

- Node.js 18+ (recommended: 20 or 22)
- npm 9+

## Quick Start (Windows desktop app)

```bash
npm install
npm start
```

`npm start` launches the **Electron Windows application** (Vite + Electron).

For browser-only development:

```bash
npm run dev
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Start **Windows/desktop app** (Electron) |
| `npm run electron:dev` | Alias of `npm start` |
| `npm run dev` | Web only (Vite, browser) |
| `npm run build` | Production web build → `dist/` |
| `npm run icons` | Generate PNG/ICO icons from SVG |
| `npm run electron:build:win` | Windows NSIS installer |
| `npm run electron:build:mac` | macOS DMG/ZIP |
| `npm run electron:build:linux` | Linux AppImage / deb |

## Desktop Installers

```bash
npm run electron:build:win    # Windows
npm run electron:build:mac    # macOS
npm run electron:build:linux  # Linux
```

Artifacts are written to `release/`.

Windows NSIS (`oneClick: false`) lets the user choose:

- Installation directory
- Create Desktop shortcut
- Create Start Menu shortcut

## Tech Stack

- React 19 + TypeScript + Vite
- Three.js / React Three Fiber / Drei
- Zustand (state), i18next (i18n)
- Electron + electron-builder

## Project Layout

```
3DDrawingToolMultiOSV10/
├── electron/          # Electron main & preload
├── src/               # React application
│   ├── components/    # UI & 3D viewport
│   ├── store/         # Zustand store
│   ├── i18n/          # KO / EN translations
│   ├── utils/         # Project & model I/O
│   └── styles/        # Global theme CSS
├── public/            # Static assets
├── build/             # Icon resources for installers
├── scripts/           # Icon generation
├── Architecture.md
├── UsersGuide.md
└── package.json
```

## Project File Format

Projects are saved as `.3ddraw` (JSON), including scene objects, imported asset data URLs, lighting, and viewport settings.

## License

MIT © SHKWON (knix008@naver.com)
