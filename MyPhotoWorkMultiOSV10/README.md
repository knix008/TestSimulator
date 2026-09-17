# My Photo Work V1.0

My Photo Work V1.0 is a Photoshop-style raster photo editor built with Vite, React, and Electron. The same codebase runs in the browser and as a desktop app on Windows, macOS, and Linux.

## Features

- Layer-based editing with visibility, lock, opacity, blend modes (including hue/saturation/color/luminosity), reorder, duplicate, merge down, flatten, **groups**, **adjustment layers**, **fill layers**, **live text layers**, **shape layers**, **layer masks**, and **layer styles**.
- Photoshop 2026-class tool strip with flyout groups: move/artboard, marquees, lassos, object/quick/wand, crop/slice/frame, sample tools, retouch (heal/remove/patch/clone), brushes, erasers, gradient/bucket, blur/sharpen/smudge, dodge/burn/sponge, pen/path, type, shapes, hand/rotate view/zoom.
- **Free transform** (Ctrl+T) with scale, rotate, mirror and numeric W/H/angle entry; flip the document or a single layer.
- **Curves and Levels** editors with per-channel control, a monotone spline, auto black/white points, and the option to apply destructively or as an adjustment layer.
- **Vector paths**: pen, freeform pen and curvature pen, with anchor/handle editing, stroke, fill, and path-to-selection.
- **Shape tools** (rectangle, rounded rectangle, ellipse, polygon, line, custom) that create editable shape layers.
- **Polygonal and magnetic lassos**, **patch** and **content-aware move**, **perspective crop**, **slices** (with per-slice export), **frames**, and a **ruler** that reports distance and angle.
- Adjustments and filters: Camera Raw-style develop, brightness/contrast, hue/saturation, invert, grayscale, auto levels, Gaussian/motion blur, sharpen, high pass, noise, mosaic, find edges, emboss, oil paint, solarize, clouds, vignette, offset, liquify, neural-style skin smooth.
- Local generative-job tools: content-aware / generative fill, generative expand, generative upscale, Harmonize, Select Subject, Remove Background, Find Distractions. These run on-device and do not use Adobe Firefly.
- Open PNG, JPG, GIF, WebP, AVIF, BMP, TIFF, and the native `.mpw` project format. Place extra images as new layers.
- Save layered projects (`.mpw` v2) and export PNG, JPG, WebP, AVIF, GIF, or TIFF.
- Separate title bar, menu bar and icon toolbar; every menu dropdown and dialog opens as its own movable window that can overhang the app and is closed with it.
- Drag images or `.mpw` projects onto the window from the desktop.
- Undo/redo, zoom/pan/rotate view, rulers with graduated ticks, quick mask, transparency checkerboard, optional grid, RGB histogram, Korean/English UI, 20 dark/light themes.
- Every failure opens a window naming the action and showing the full error, stack and environment, ready to copy.
- Desktop packaging for Windows (NSIS), macOS (DMG/ZIP), and Linux (AppImage/DEB/RPM) from the same codebase.

See [UsersGuide.md](UsersGuide.md) for how to use the editor and [Architecture.md](Architecture.md) for the internal design.

## Development

```bash
npm install
npm start
```

For the web-only Vite server during development:

```bash
npm run dev
```

## Tests

```bash
npm test
```

Runs the suite under `test/` with `node --test`. It exercises the editing engine
directly against a real 2D canvas — no browser and no bundler — covering colour
maths, selections, adjustments, filters, layer compositing, the painting tools,
paths, transforms, history, settings, the `.mpw` format, error reporting and the
Korean/English tables. A second group reads the source to check the wiring: that
every tool in the strip is reachable, that every menu command has a handler, and
that the popup windows, icons and launchers are configured as they should be.

`npm test` regenerates the build stamp and the icons first, so a fresh clone
passes without a build. See [Architecture.md](Architecture.md) for how the
harness works.

## Build

Web build:

```bash
npm run build:web
```

Windows installer (`build:win` is an alias of `dist:win`):

```bash
npm run build:win
```

macOS packages:

```bash
npm run dist:mac
```

Linux packages:

```bash
npm run dist:linux
```

Each `dist:*` script generates the icons and the build stamp, builds the web
bundle, packages with electron-builder, and then runs
`scripts/copy-installers.cjs`, which copies the freshly built installer into the
project root. Build output lives under `release/`.

Generated files are not committed. `scripts/create-icons.cjs` renders
`build/icon.ico`, `build/icon.png` and the Linux icon set from
`public/app-icon.svg` — one source for the executable, the installer, the
uninstaller, the taskbar and both shortcuts — and
`scripts/generate-build-info.cjs` writes `src/build-info.json` with the version,
build time and commit that the About window shows.

macOS packages should be built on macOS, and Linux packages should be built on Linux or a suitable CI runner.

## Repository layout

| Path | What is in it |
| ---- | ------------- |
| `src/lib/` | The platform-independent editing engine: colour, selections, filters, paths, transforms, the document model |
| `src/` | The React app, the command catalog, the popup bodies and the i18n tables |
| `electron/` | The desktop shell: the main window, native file dialogs and the popup windows |
| `scripts/` | The launchers and the icon and build-stamp generators |
| `test/` | The `node --test` suite and its DOM/canvas harness |

## Program Information

- Program: My Photo Work V1.0
- Version: 1.0.0
- Creator: SHKWON(knix008@naver.com)
- Licence: MIT
