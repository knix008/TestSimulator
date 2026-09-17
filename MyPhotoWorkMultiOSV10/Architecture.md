# Architecture

My Photo Work V1.0 is a cross-platform raster photo editor. The same React app runs in the browser (Vite) and inside a desktop shell (Electron).

## Technology stack

| Layer      | Technology                                             |
| ---------- | ------------------------------------------------------ |
| UI         | React 19 + TypeScript                                  |
| Bundler    | Vite 8                                                 |
| Desktop    | Electron 43 (`electron/main.cjs`), packaged with electron-builder |
| Icons      | lucide-react                                           |
| TIFF codec | `utif`                                                 |

## Process / module layout

```
index.html
 └─ src/main.tsx            → mounts <App/>
     └─ src/App.tsx         → chrome, tools, file/layer commands
        ├─ src/i18n.ts
        └─ src/lib/*
electron/main.cjs           → window, native open/save, close confirm
electron/preload.cjs        → contextBridge file/window APIs
scripts/create-icons.cjs    → public/app-icon.svg → installer icons
```

## Data model

A document is a fixed-size canvas plus an ordered stack of raster layers. Pixel buffers live in a `Map<layerId, HTMLCanvasElement>` (not React state). React state holds only metadata:

```ts
type LayerMeta = { id, name, visible, opacity, blendMode, locked }
type PhotoDocument = { name, width, height, background, layers, activeLayerId, filePath? }
```

Index 0 is the bottom layer. The right-hand panel lists layers from top to bottom, matching Photoshop.

Selection is a rectangle, ellipse, or per-pixel mask. Brush, eraser, fill, gradient, text, and filters all clip to that selection.

## Rendering

1. Composite visible layers onto an offscreen canvas (`compositeDocument`) using each layer's opacity and Canvas blend mode.
2. Draw a checkerboard, then the composite, scaled by zoom and pan, onto the viewport canvas.
3. Overlay marching-ants / mask fill (`drawSelectionOverlay`) and live gradient previews.

The RGB histogram is computed from the active layer only.

## Tools

Pointer events convert screen coordinates to document space (`(client - pan) / zoom`).

- **Move** shifts the active layer's pixels.
- **Marquee / ellipse / lasso / wand** build a `Selection`.
- **Brush / eraser** stamp a hardness-aware radial stroke, then clip to the selection.
- **Fill** flood-fills by Chebyshev color distance.
- **Gradient** paints a linear gradient from drag start to end.
- **Text** rasterizes a string onto the active layer.
- **Crop** stores a draft box; Enter applies it to every layer and the document size.
- **Eyedropper** samples the composite.
- **Hand / zoom / wheel** pan and scale the view.

## History and files

Undo/redo snapshots clone document metadata and every layer canvas (capped at 30). The native project format `.mpw` is JSON with PNG data URLs per layer. Raster export flattens the composite; TIFF is encoded with `utif`.

In Electron, `files:open` / `files:save` / `files:write` use native dialogs. In the browser, `<input type=file>` and Blob downloads replace them. Closing a dirty document asks to save first (`window:close-request`).

## Desktop shell

`electron/main.cjs` creates a frameless window and exposes IPC over a `contextBridge` preload. Packaging uses electron-builder (NSIS / DMG+ZIP / AppImage+DEB+RPM). `scripts/create-icons.cjs` rasterizes `public/app-icon.svg` into `build/icon.png`, Linux `256x256/icon.png`, and a multi-resolution `build/icon.ico`.
