# Architecture

SVG Editor V1.0 is a cross-platform vector/raster editor. The same React app runs in the browser (Vite) and inside a desktop shell (Electron).

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
 └─ src/main.tsx          → mounts <App/>
     └─ src/App.tsx       → the entire editor (state, geometry, rendering, UI)
electron/main.cjs         → Electron main process, window + native controls
src/types/*.d.ts          → ambient types (utif, electron file/window API)
scripts/create-icons.cjs  → generates app icons for packaging
```

Almost all logic lives in `src/App.tsx`. It is organized as: pure module-level helpers (geometry, parsing, rendering) followed by the `App` React component (state, event handlers, JSX).

## Data model

Everything on the canvas is either a `Shape` or a `RasterLayer`, held in React state (`shapes`, `rasters`).

```ts
type Shape = {
  id, type, name, x, y, width, height,     // bounding box in canvas units
  fill, stroke, strokeWidth, opacity,
  points?,                                  // pen / polyline / polygon vertices
  text?, fontFamily?, fontSize?, ...,       // text shapes
  fromId?, toId?, lineStyle?, ...Marker?,   // connectors
  shadow*?,                                 // 3D drop-shadow effect
  lightEffect?, lightDirection?,            // reflected-light / 3D lighting effect
  // real vector paths:
  d?, fillRule?, matrix?, pathBounds?
}
```

`type ShapeType = ... | 'path'`. Drawing tools map to shape types; `bezierPen` is a *drawing mode* that produces a `path` shape (there is no `bezierPen` shape).

### Path shapes (the key design point)

A `path` shape stores the **original SVG `d` string untouched** plus a 2×3 affine `matrix`, its untransformed local bounds (`pathBounds`), and a `fillRule`. This is what makes complex-SVG editing lossless:

- **Rendering** applies the matrix to the canvas/context (or emits `transform="matrix(...)"` in SVG) and draws `Path2D(d)`. Curves stay mathematically exact — no polyline flattening, no faceting — and compound sub-paths keep their holes via the fill rule.
- **Editing** never rewrites `d`. Move/resize/geometry edits compose a new world-space matrix onto the existing one (`applyMatrixToPath`) and recompute the cached bounding box. Stroke width is stored in world units and divided by the matrix scale at render time, so scaling a path does not thicken its outline.

Helper functions: `matrixScale`, `getPathBounds`, `pathWorldBounds`, `applyMatrixToPath`, `pathShape`, and the matrix primitives `identityMatrix` / `multiplyMatrix` / `transformPoint`.

## SVG import pipeline (`parseSvgShapes`)

1. Parse text with `DOMParser` (`image/svg+xml`).
2. Collect CSS class rules from `<style>` (`parseSvgStyleRules`); `svgAttribute` resolves each property by walking the element chain and checking inline `style`, presentation attributes, and matched classes. `fill:none` / `stroke:none` (and absent stroke) normalize to `transparent`.
3. For each `rect / ellipse / circle / line / text / polyline / polygon / path`, build a shape and bake the accumulated `transform` chain (`elementMatrix` → `transformShape`).
   - `path` is kept whole as a real `path` shape (curves + holes preserved) rather than split into per-sub-path polygons.
4. `fitImportedContentToCanvas` scales/centers the imported artwork into the visible canvas; path shapes are fitted by composing the fit matrix instead of scaling raw coordinates.

Path `d` flattening (`parsePathSubpaths`) still exists but is now used only for **bounds estimation** and for the freehand `pen`/`curve` tools — never to destroy imported path geometry. It handles `M/L/H/V/C/S/Q/T/Z` (relative and absolute).

## Rendering

There are two independent renderers driven from the same `Shape[]`:

- **Interactive canvas** — a `useEffect` clears the `<canvas>`, honors `devicePixelRatio` and the current view/zoom, draws rasters then every shape via `drawShape`, then overlays selection handles, the marquee, the live **bezier pen preview** (`drawPenDraft`), and the **node-edit overlay** (`drawNodeOverlay`).
- **SVG export** — `buildSvg` / `shapeToSvg` produce standalone SVG markup (used by the read-only source panel, clipboard, and the `.svg` export). Each shape that has a shadow and/or lighting gets one combined per-shape `<filter>` (`effectFilterDefs`): a `feSpecularLighting` pass composited under an optional `feDropShadow`. Connectors resolve markers.

**Effects.** The reflected-light effect (`lightEffect`, presets in `lightPresets`) renders as an SVG specular filter on export and as a clipped gloss gradient on the interactive canvas (`applyCanvasLight` clips to `shapeFillPath` and paints a light-direction gradient). The 3D shadow renders via `feDropShadow` (SVG) and `applyCanvasShadow` (canvas).

Raster export (PNG/JPG/WebP/AVIF/GIF/TIFF) renders the scene to an offscreen canvas (`renderSceneToCanvas`) and encodes it; TIFF is encoded with `utif`. **ICO** export (`exportIco`) renders the scene into several square canvases (16–256 px), PNG-encodes each, and assembles a PNG-in-ICO container (`buildIcoFile`).

The **in-app color picker** (`ColorField`) is a self-contained saturation/value + hue + hex + swatch popover, portaled to `document.body` so it is never clipped by the panel; HSV↔RGB↔hex conversions live alongside it. **Text** shapes measure their rendered size (`measureTextSize`, an offscreen 2D context) so the selection box and hit-test track the visible glyphs as font size changes.

## Interaction model

`handlePointerDown/Move/Up` on the canvas dispatch by the active `tool`:

- **select / eraser** — hit-test top-most shape, drive drag (`moveShape` + `clampMoveDelta`) or corner resize (`resizeShape`), marquee-select, or erase.
- **shape tools** — create a shape and live-update it while dragging (`drawingRef`).
- **connector** — click two shapes to link them; the connector re-routes from live shape centers.
- **bezierPen** — a small state machine over `penDraft: PenAnchor[]`: click adds an anchor, dragging pulls symmetric curve handles, and the path is committed (`commitPenDraft`) on start-point click (closed), double-click / Enter (open), or when switching tools. `penAnchorsToPath` serializes anchors to a `d` string.
- **nodeEdit** — point-level editing of a `path` shape. `parsePathToAnchors` turns the path's `d` into editable sub-paths of anchors with cubic handles (M/L/H/V/C/S/Q/T/A/Z; arcs convert via `arcToCubics`, quadratics elevate to cubics). Anchors are hit-tested/dragged in world space and mapped back to local space with `invertMatrix`; edits re-serialize through `anchorsToPathData` and `updatePathData`. Double-click inserts a point (De Casteljau `splitCubic` keeps curve shape) or deletes one; `drawNodeOverlay` renders anchors and handles.

Keyboard: `Esc` cancels the current gesture/pen draft and returns to Select; `Delete` removes the selection (or the selected node in node-edit mode); `Ctrl/Cmd+Z` / `Shift+Z` / `Ctrl+Y` undo/redo; `Ctrl/Cmd+S` saves; `Enter` finishes an open pen path.

## Cross-cutting state

- **Undo/redo** — `undoStackRef` / `redoStackRef` snapshot `Shape[]` (deep-cloned, capped at 50). `updateShapes` records history and marks the document dirty.
- **Canvas sizing** — `stageSize` (viewport) and `canvasSize` (document) grow to fit content (`growCanvasToFit`); `computeCanvasView` derives the drawn view for a zoom level.
- **Settings persistence** — language, theme, zoom (centered, clamped 5%–400%), grid, panel widths, export format, background removal, and expanded tool groups are saved to `localStorage` under `svg-editor-v1-settings` and restored on load.
- **Document persistence** — the shapes/rasters/canvas size are auto-saved (debounced) to `localStorage` under `svg-editor-v1-document`. First launch starts empty; later launches restore the last document (`loadDocument`). Imported images are stored as data URLs so they survive the round-trip.
- **Saving** — `Ctrl/Cmd+S` (and the File menu) saves the document. In the desktop app it writes to the current file via the Electron `files:write` IPC, or opens a native Save dialog on first save (`files:save`); in the browser it downloads. A transient "Saved" note appears in the status bar. **Dirty tracking** prompts to save before replacing/closing the document.

## Desktop shell (Electron)

`electron/main.cjs` creates a frameless window and exposes IPC over a `contextBridge` preload:

- `files:open` — native open dialog; returns file text (SVG) or data URLs (images).
- `files:save` — native Save dialog; writes the chosen path.
- `files:write` — writes to a known path without a dialog (used by `Ctrl+S` re-saves).
- `window:minimize` / `window:toggle-maximize` / `window:close` — custom title-bar controls.

Packaging uses electron-builder (NSIS / DMG+ZIP / AppImage+DEB+RPM). `scripts/create-icons.cjs` rasterizes the single source SVG `public/app-icon.svg` (via `@resvg/resvg-js`) into every app/installer icon (`build/icon.png`, `build/icons/256x256/icon.png`, and a multi-resolution `build/icon.ico`) so the in-app, window, and installer icons all match. `scripts/copy-installers.cjs` copies the newest built installer from `release/` to the project root.
