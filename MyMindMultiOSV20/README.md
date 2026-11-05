# MyMind

Cross-platform **mind map** and **fishbone** diagram editor for Windows, macOS, Linux and the web.

| | |
|---|---|
| **Version** | 2.0.0 |
| **Developer** | SHKWON (`knix008@naver.com`) |
| **Copyright** | Copyright © 2026 SHKWON |
| **Stack** | Tauri 2 · React · TypeScript · Vite |

Version 2 replaces Electron with Tauri. The installer is a few megabytes, and the program brings a start screen, 40 themes plus your own, and a settings window.

## Documentation

| Document | Description |
|----------|-------------|
| [Architecture.md](./Architecture.md) | System structure, modules, data flow |
| [doc/UsersGuide.md](./doc/UsersGuide.md) | User guide in Korean (also inside the app, F1) |
| [doc/UsersGuide.en.md](./doc/UsersGuide.en.md) | User guide in English |

## Features

- **Start screen**: 24 moving backgrounds in the theme's colours (mind maps, fishbones, neurons, 3D scenes), movable and resizable cards, shortcuts, recent files, samples, theme and background pickers
- **Themes**: 20 light and 20 dark, plus your own with every colour editable
- **Settings window**: General, Theme and Start tabs; a new diagram's mode, layout, shape and line; reopen the last file
- **Mind map** and **fishbone (Ishikawa)** modes sharing one node/edge model
- **Layouts**: Radial, Top→Bottom, Bottom→Top, Left→Right, Right→Left
- **12 node shapes**, with a live preview in the drop-down
- **Lines**: curve, straight, elbow, tree-root taper; solid, dashed, dotted, dash-dot; arrow, dot and diamond caps; a manual connection face
- **Text**: font family (presets and every installed font), size, color, bold, italic, underline, strike
- **Undo / Redo**, duplicate, copy and paste of a subtree, multi-select, per-shape memo, tree view of the nodes
- **Export** to PNG, JPEG, WebP or SVG, cropped to the diagram, with an optional transparent background
- **Korean and English**, for the program, the installer and the guide
- Dialogs as **windows of their own**, frameless main window with remembered position and size, a toolbar that drops to icons when narrow
- **Unsaved-work prompt** before closing or replacing a document
- `.mmap` JSON files (legacy `.mymind` still opens), `.mmap` file association, five bundled samples

## Requirements

- Node.js 20.19 or newer
- Rust (stable) and the [Tauri prerequisites](https://tauri.app/start/prerequisites/) for your system

## Quick start

```bash
npm install
npm start          # the desktop app with the current sources, on a free port
npm run dev:web    # only the page, in a browser
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Desktop app (Vite + Tauri dev) on a port nobody else uses |
| `npm run dev:web` | Page only, in a browser |
| `npm run build:win` | Windows NSIS installer, copied to the project root |
| `npm run build:mac` | macOS DMG, copied to the project root |
| `npm run build:linux` | AppImage and deb, copied to the project root |
| `npm test` | Model, layouts, settings, themes, translations, samples, types, Rust unit tests |
| `npm run test:gui` | The real program driven over the DevTools protocol, with its own settings and WebView2 folders |
| `npm run typecheck` | TypeScript check only |

Developer-only helpers:

| Command | Description |
|---------|-------------|
| `npm run icons` | Regenerates `assets/icon.*` and the file icon from the SVGs (needs `npm i -D sharp png-to-ico`) |
| `npm run samples` | Regenerates the sample `.mmap` files in `template/` |

## Project layout

```
MyMindMultiOSV20/
├── src-tauri/         # Rust shell: window, settings, files, popup windows, installer hooks
├── src/
│   ├── components/    # Toolbar, canvas, side panels, start screen, settings, dialogs, guide
│   ├── hooks/         # useAppState (all app state and actions), useSystemFonts
│   ├── store/         # document model (create / mutate / (de)serialize)
│   ├── layout/        # mind map and fishbone layout engine
│   ├── start/         # start screen backgrounds and card board
│   ├── styles/        # tokens, chrome, start screen, icons, fonts
│   ├── i18n/          # ko / en
│   ├── host.ts        # the only file that calls Tauri
│   ├── popout.ts      # dialogs in windows of their own
│   ├── settings.ts    # what is stored, limits, validation
│   └── themes.ts      # the 40 themes and user themes
├── assets/            # app and file icons
├── doc/               # user guide (shown in the app)
├── template/          # bundled samples and their list
├── scripts/           # dev server, installer copy, icon and sample generators, DevTools client
├── test/              # npm test, npm run test:gui, reporter
├── Architecture.md
└── package.json
```

## File format

Diagrams are saved as **`.mmap`** (UTF-8 JSON). Legacy `.mymind` files still open. The format has not changed from version 1. See [Architecture.md](./Architecture.md#12-file-format).

## License

UNLICENSED. All rights reserved.
Copyright © 2026 SHKWON (`knix008@naver.com`)
