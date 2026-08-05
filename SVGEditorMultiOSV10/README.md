# SVG Editor V1.0

SVG Editor V1.0 is a Canvas-based SVG and raster image editor built with Vite, React, and Electron.

## Features

- Draw with a rich tool set: triangle, rectangle, rounded rectangle, ellipse, polygons (diamond, pentagon, hexagon, octagon, star, trapezoid, parallelogram, chevron, cross), curve, line, connector, freehand pen, **bezier pen**, and text.
- **Bezier pen tool** — click to drop anchor points, drag to pull curve handles, and finish by clicking the start point (closed), double-clicking, or pressing Enter (open). Produces a true vector path.
- **High-fidelity SVG import** — `<path>` elements keep their original geometry, so curves stay smooth and compound sub-paths (holes) keep their fill rule instead of being flattened into faceted polygons.
- **Node editing** — drag individual anchor points and bezier handles on any path, add points by double-clicking a segment, and delete points. Primitives (ellipse, rectangle, polygons, line, curve) are auto-converted to editable paths on first click, so they get editable points too. Precise editing beyond just move/resize.
- **In-app color picker** — a saturation/value box, hue slider, hex input, pastel preset swatches, and a **No fill / transparent** option, for fill, border, and shadow colors.
- **Reflected-light / 3D effects** — per-shape lighting presets (glossy, spotlight, metallic) with a selectable light position, plus 3D drop-shadow presets.
- Read SVG, JPG, GIF, TIFF, PNG, WebP, and AVIF files. Open replaces the document; Add appends to it. Imported images are embedded so they survive save/restore.
- Edit the selected shape from the right panel: name, position/size, fill, border color/width, opacity, lighting, 3D shadow, and text styling (font family, size, weight, style, alignment). Text scales its glyphs when resized and its selection box tracks the visible text.
- Move, resize (corner handles), duplicate, delete, and reorder shapes; multi-select with a marquee. Full undo/redo history.
- **File menu** grouping New / Open / Add / Save / Save as / Export. **Ctrl+S** saves to the current file (native save dialog on first save in the desktop app) and shows a "Saved" note in the status bar.
- **Session restore** — first launch starts with an empty canvas; later launches automatically reopen the last document.
- Resize the left tool panel and right properties panel with separators.
- Toggle dark/light themes and Korean/English UI text.
- Show a grid on the canvas and zoom (centered on the viewport, 5%–400%) with the mouse wheel or toolbar controls.
- Use a right-click context menu on the canvas for duplicate, delete, and layer ordering.
- Export SVG, PNG, JPG, WebP, AVIF, GIF, TIFF, and **ICO** (multi-resolution icon). The background removal option exports only the minimum bounds around the artwork.
- Package desktop apps and installers for Windows, macOS, and Linux from the same codebase.

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

## Build

Web build:

```bash
npm run build:web
```

Generate icons:

```bash
npm run build:icons
```

Windows installer (`build:win` is an alias of `dist:win`):

```bash
npm run build:win
# or
npm run dist:win
```

macOS packages:

```bash
npm run dist:mac
```

Linux packages:

```bash
npm run dist:linux
```

Each `dist:*` script generates icons, builds the web bundle, packages with electron-builder, and then runs `scripts/copy-installers.cjs`, which copies the freshly built installer into the project root for convenience (these root copies are git-ignored). Build output lives under `release/`.

The Windows NSIS installer is configured as a guided installer with optional desktop and Start Menu shortcut creation. macOS packages should be built on macOS, and Linux packages should be built on Linux or a suitable CI runner.

> If a Windows build fails with `EPERM: ... rename release\win-unpacked.tmp -> release\win-unpacked`, close any running instance of the app and delete `release\win-unpacked` / `release\win-unpacked.tmp`, then rebuild (antivirus or a held file handle can lock the folder).

## Program Information

- Program: SVG Editor V1.0
- Version: 1.0.0
- Creator: SHKWON(knix008@naver.com)
