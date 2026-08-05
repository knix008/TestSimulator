# SVG Editor MultiOS

SVG Editor MultiOS is a Canvas-based SVG and raster image editor built with Vite, React, and Electron.

## Features

- Create and edit SVG shapes with selection, rectangle, ellipse, line, pen, text, and eraser tools.
- Read SVG, JPG, GIF, TIFF, PNG, WebP, and AVIF files.
- Edit selected shape properties from the right panel.
- Resize the left tool panel and right properties panel with separators.
- Toggle dark/light themes and Korean/English UI text.
- Show a grid on the canvas and zoom with the mouse wheel or toolbar controls.
- Use a right-click context menu on the canvas for duplicate, delete, and layer ordering.
- Export SVG, PNG, JPG, WebP, AVIF, GIF, and TIFF. The background removal option exports only the minimum bounds around the artwork.
- Package desktop apps and installers for Windows, macOS, and Linux from the same codebase.

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

- Program: SVG Editor MultiOS
- Version: 1.0.0
- Creator: SHKWON(knix008@naver.com)
