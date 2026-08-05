# SVG Editor V1.0

SVG Editor V1.0 is a Canvas-based SVG and raster image editor built with Vite, React, and Electron.

## Features

- Draw with a rich tool set: rectangle, square, rounded rectangle, ellipse, circle, polygons (triangle, diamond, pentagon, hexagon, octagon, star, trapezoid, parallelogram, chevron, cross), curve, line, connector, freehand pen, **bezier pen**, and text.
- **Bezier pen tool** — click to drop anchor points, drag to pull curve handles, and finish by clicking the start point (closed), double-clicking, or pressing Enter (open). Produces a true vector path.
- **High-fidelity SVG import** — `<path>` elements keep their original geometry, so curves stay smooth and compound sub-paths (holes) keep their fill rule instead of being flattened into faceted polygons.
- **Node editing** — drag individual anchor points and bezier handles on any path, add points by double-clicking a segment, and delete points. Primitives (circle, ellipse, rectangle, polygons, line, curve) are auto-converted to editable paths on first click, so they get editable points too. Precise editing beyond just move/resize.
- Read SVG, JPG, GIF, TIFF, PNG, WebP, and AVIF files. Open replaces the document; Add appends to it.
- Edit the selected shape from the right panel: name, position/size, fill (with a **No fill / transparent** toggle), border color and width, opacity, 3D shadow presets, and text styling.
- Move, resize (corner handles), duplicate, delete, and reorder shapes; multi-select with a marquee. Full undo/redo history.
- Resize the left tool panel and right properties panel with separators.
- Toggle dark/light themes and Korean/English UI text.
- Show a grid on the canvas and zoom with the mouse wheel or toolbar controls.
- Use a right-click context menu on the canvas for duplicate, delete, and layer ordering.
- Export SVG, PNG, JPG, WebP, AVIF, GIF, and TIFF. The background removal option exports only the minimum bounds around the artwork.
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

Windows installer:

```bash
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

The Windows NSIS installer is configured as a guided installer with optional desktop and Start Menu shortcut creation. macOS packages should be built on macOS, and Linux packages should be built on Linux or a suitable CI runner.

## Program Information

- Program: SVG Editor V1.0
- Version: 1.0.0
- Creator: SHKWON(knix008@naver.com)
