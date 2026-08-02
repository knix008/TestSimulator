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
| `npm run build:win` | Windows installer → root + `release/` |
| `npm run build:mac` | macOS installer → root + `release/` |
| `npm run build:linux` | Linux installer → root + `release/` |
| `npm run build:all` | All platform installers → root + `release/` |
| `npm run icons` | Generate PNG/ICO icons from SVG |

## Desktop Installers

```bash
npm run build:win      # Windows (.exe)
npm run build:mac      # macOS (.dmg / .zip)
npm run build:linux    # Linux (.AppImage / .deb)
npm run build:all      # All platforms (host OS may limit cross-build)
```

Build output:

1. Intermediate / full artifacts in `release/`
2. Installer files are **copied to the project root**

Examples at root:

- `3D Drawing Tool-Setup-1.0.0.exe`
- `3D Drawing Tool-1.0.0-mac.dmg`
- `3D Drawing Tool-1.0.0-linux.AppImage`

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
├── template/          # Starter .3ddraw scene templates
├── public/            # Static assets (+ synced templates)
├── build/             # Icon resources for installers
├── scripts/           # Icons / template sync
├── Architecture.md
├── UsersGuide.md
└── package.json
```

## Templates

Starter scenes live in [`template/`](./template/). Open them in the app via the **Templates** toolbar button, or load a `.3ddraw` file manually.

## Project File Format

Projects are saved as `.3ddraw` (JSON), including scene objects, imported asset data URLs, lighting, and viewport settings.

## License

MIT © SHKWON (knix008@naver.com)
