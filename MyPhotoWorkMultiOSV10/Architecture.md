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

The window chrome is four stacked rows: a **title bar** (the window's drag
handle and its minimise/maximise/close buttons), a **menu bar**, an **icon
toolbar**, and the contextual **options bar**. The menu bar and the toolbar are
both generated from `src/commands.ts`, so the toolbar is simply the commands
flagged `toolbar`, still grouped by their menu category.

Popups are not rendered inside the app window. Each menu dropdown and each
dialog is a child `BrowserWindow` that loads this same bundle with a hash route
(`#menu=<id>` / `#dialog=<name>`), because a frameless window clips its own
HTML: the Layer menu is about thirty rows tall and could not otherwise be shown,
and an in-page dialog cannot be dragged out of the way. `electron/childwindows.cjs`
owns them — one window per dialog name (reopening raises the existing one), and
every popup is destroyed with the main window.

```
index.html
 └─ src/main.tsx            → routes on the hash: <App/> | <MenuHost/> | <DialogHost/>
     └─ src/App.tsx         → chrome, pointer dispatch, file/layer commands
        ├─ src/i18n.ts
        ├─ src/catalog.ts     → the tool strip's flyout groups
        ├─ src/commands.ts    → the menu bar and toolbar commands
        ├─ src/toolOptions.ts → what the contextual options bar shows per tool
        ├─ src/dialogs.tsx    → every popup body, shared by both renderings
        ├─ src/dialogMeta.ts  → popup names, icons and titles
        └─ src/lib/*
electron/main.cjs           → window, native open/save, close confirm
electron/childwindows.cjs   → menu popups and dialogs as separate windows
electron/preload.cjs        → contextBridge file/window APIs
scripts/create-icons.cjs    → public/app-icon.svg → installer icons
```

`src/lib` holds the platform-independent engine:

| Module | Responsibility |
| ------ | -------------- |
| `color` / `adjustments` / `curves` | colour maths, the Camera Raw sliders, real Curves and Levels tables |
| `selection` / `regions` | marquees, lassos, wand, flood fill; magnetic-lasso edge snapping, patch, content-aware move, perspective crop, slices, frames, ruler |
| `filters` / `effects` / `tools` / `ai` | the Filter menu, layer styles, the brush family, the on-device generative jobs |
| `paths` | vector paths: anchors, bezier handles, hit testing, stroke/fill, path→selection |
| `transform` | the free-transform box, its handles, and the resampling that commits it |
| `canvas` / `history` / `imageIO` | the document model, undo snapshots, `.mpw` and raster codecs |

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
`handlePointerDown` / `Move` / `Up` in `App.tsx` dispatch **every** tool in the
catalog; `test/wiring.test.mjs` fails if a tool is ever added to the strip
without a branch here.

The contextual options bar is generated from the `toolOptions` table rather than
from per-tool JSX, so each control renders and behaves identically wherever it
appears, and every tool is guaranteed a row with a one-line hint in both
languages.

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

## Tests

`npm test` runs `node --test` over `test/*.test.mjs`. There is no bundler and no
browser in the loop: `test/helpers/setup.mjs` is loaded through `--import` and
does two jobs before any test file is evaluated.

- `ts-hooks.mjs` registers a resolve hook. Node 24 strips the types from `.ts`
  files itself, but it never guesses extensions, so the hook re-adds the `.ts`
  the app's extensionless imports rely on. It also maps the bare `utif`
  specifier to a shim, because Node's CommonJS interop exposes fewer named
  exports for that package than Rollup does at build time.
- `dom.mjs` installs the browser globals the pixel code expects — `document`,
  `window`, `localStorage`, `Image`, `ImageData` — with
  `document.createElement('canvas')` returning a real Skia canvas from
  `@napi-rs/canvas`. Filters, blend modes, gradients, text and `ctx.filter`
  therefore run against a genuine 2D implementation rather than a stub.

`test/helpers/pixels.mjs` holds the shared vocabulary: canvas builders,
`px()`/`assertPixel()` readers, `meanDiff()`, and `withSeededRandom()` for the
filters that call `Math.random`.

| File | Covers |
| ---- | ------ |
| `harness.test.mjs` | the loader and canvas shim themselves |
| `color.test.mjs` | hex/RGB/HSV/HSL conversions and round trips |
| `selection.test.mjs` | marquee, ellipse, lasso, wand, flood fill, feather, invert, bucket |
| `adjustments.test.mjs` | each Camera Raw slider in isolation, plus auto levels |
| `filters.test.mjs` | every Filter menu entry, each also checked against a selection |
| `document.test.mjs` | layer order, opacity, blend modes, masks, adjustment/fill/text/shape layers, eyedropper |
| `tools.test.mjs` | brush, pencil, eraser, gradient, type, clone, heal, dodge/burn, sponge, red-eye, smudge |
| `effects.test.mjs` | layer styles and the text/shape rasterisers |
| `generative.test.mjs` | content-aware fill, expand, upscale, Harmonize, Select Subject, Find Distractions, Liquify |
| `history.test.mjs` | snapshot isolation and the 30-state cap |
| `settings.test.mjs` | localStorage validation and the theme table |
| `imageio.test.mjs` | `.mpw` round trip, v1 migration, TIFF, every export format |
| `i18n.test.mjs` | Korean/English coverage for every tool, blend mode, adjustment and filter |
| `paths.test.mjs` | the vector path model behind the pen and path-selection tools |
| `curves.test.mjs` | Curves and Levels lookup tables, the editors' point maths, auto levels |
| `transform.test.mjs` | free-transform box maths, handle hit testing, resampling, flips |
| `regions.test.mjs` | magnetic-lasso edge snapping, patch, content-aware move, perspective crop, slices, frames, ruler |
| `wiring.test.mjs` | that every catalogued tool has an options row and is reachable from the canvas dispatch |
| `commands.test.mjs` | that the menu bar and toolbar agree, and every command has a handler |
| `windows.test.mjs` | popup windows, the menu overhang, the viewport grid and rulers, drag & drop |
| `scripts.test.mjs` | the `npm start` launchers |
