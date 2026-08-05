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
  shadow*?,                                 // 3D shadow effect
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

- **Interactive canvas** — a `useEffect` clears the `<canvas>`, honors `devicePixelRatio` and the current view/zoom, draws rasters then every shape via `drawShape`, then overlays selection handles, the marquee, and the live **bezier pen preview** (`drawPenDraft`).
- **SVG export** — `buildSvg` / `shapeToSvg` produce standalone SVG markup (used by the read-only source panel, clipboard, and the `.svg` export). Shadows become `<filter><feDropShadow>` defs; connectors resolve markers.

Raster export (PNG/JPG/WebP/AVIF/GIF/TIFF) renders the scene to an offscreen canvas (`renderSceneToCanvas`) and encodes it; TIFF is encoded with `utif`.

## Interaction model

`handlePointerDown/Move/Up` on the canvas dispatch by the active `tool`:

- **select / eraser** — hit-test top-most shape, drive drag (`moveShape` + `clampMoveDelta`) or corner resize (`resizeShape`), marquee-select, or erase.
- **shape tools** — create a shape and live-update it while dragging (`drawingRef`).
- **connector** — click two shapes to link them; the connector re-routes from live shape centers.
- **bezierPen** — a small state machine over `penDraft: PenAnchor[]`: click adds an anchor, dragging pulls symmetric curve handles, and the path is committed (`commitPenDraft`) on start-point click (closed), double-click / Enter (open), or when switching tools. `penAnchorsToPath` serializes anchors to a `d` string.
- **nodeEdit** — point-level editing of a `path` shape. `parsePathToAnchors` turns the path's `d` into editable sub-paths of anchors with cubic handles (M/L/H/V/C/S/Q/T/A/Z; arcs convert via `arcToCubics`, quadratics elevate to cubics). Anchors are hit-tested/dragged in world space and mapped back to local space with `invertMatrix`; edits re-serialize through `anchorsToPathData` and `updatePathData`. Double-click inserts a point (De Casteljau `splitCubic` keeps curve shape) or deletes one; `drawNodeOverlay` renders anchors and handles.

Keyboard: `Esc` cancels the current gesture/pen draft and returns to Select; `Delete` removes the selection; `Ctrl/Cmd+Z` / `Shift+Z` / `Ctrl+Y` undo/redo; `Enter` finishes an open pen path.

## Cross-cutting state

- **Undo/redo** — `undoStackRef` / `redoStackRef` snapshot `Shape[]` (deep-cloned, capped at 50). `updateShapes` records history and marks the document dirty.
- **Canvas sizing** — `stageSize` (viewport) and `canvasSize` (document) grow to fit content (`growCanvasToFit`); `computeCanvasView` derives the drawn view for a zoom level.
- **Settings persistence** — language, theme, zoom, grid, panel widths, export format, background removal, and expanded tool groups are saved to `localStorage` under `svg-editor-v1-settings` and restored on load.
- **Dirty tracking** — replacing or closing the document prompts to save unsaved changes.
