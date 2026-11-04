# MyPaint 10.0 — how it is put together

Written for: someone about to change this code.

## Shape of the program

The whole application is plain scripts loaded by `index.html`, in dependency order, each one
a UMD module that works in the browser and under `require()` in Node. There is no bundler and
no framework, so the same files run as the web build, inside the Tauri host, and inside the
tests.

```
index.html
  src/build-info.js   name, version, build stamp, author
  src/metrics.js      window minimums, popup sizes, menu row height, limits
  src/paint.js        the drawing engine (no DOM)
  src/dicom.js        the DICOM decoder (no DOM)
  src/encoders.js     BMP / TIFF / GIF / PNG / ICO / JP2 / DICOM writers (no DOM)
  src/formats.js      which reader a file needs, and the readers themselves
  src/fonts.js        system font name cleanup
  src/print.js        paper sizes and page splitting
  src/color-wheel.js  the round colour chooser: the disc, hue and saturation from a point
  src/effects.js      a document's look, border and shadow: CSS for the preview, pixels for a saved picture
  src/themes.js       41 themes plus a custom one, as CSS variables
  src/i18n.js         the Korean and English strings
  src/icons.js        the SVG icon set and the two flags
  src/store.js        settings and the recent list in localStorage
  src/sample.js       the drawings the program starts with
  src/extra-formats.js TGA / Netpbm / QOI / PCX readers and writers, SVG sniffing (no DOM)
  src/colorpicker.js  MyPaint's own colour chooser (the native one outlived its window)
  src/richtext.js     the contenteditable text editor and its per-character runs
  src/svgdoc.js       a document written out as SVG elements
  src/start-layout.js the start screen's card board: grid cells, compaction (no DOM)
  src/range-stepper.js the [-] [bar] [n %] [+] control, delegated so it also works in a dialog window
  src/start-background.js twenty 3D scenes on a 2D canvas, coloured from the theme tokens
  src/start-screen.js the start screen's cards and their dragging; app.js gives it what it needs
  src/app.js          everything with a DOM in it
```

The desktop host is Tauri 2. `src-tauri/src/lib.rs` owns the windows and the file system and
exposes them as commands; `src/host/tauri-bridge.js` turns those into `window.desktop` (and
`window.popupHost` in the child windows), the only bridge the page uses. In a browser there is
no `window.__TAURI__` and the bridge does nothing, so `app.js` falls back to the web APIs.
`popup.html` / `menu.html` are the separate windows every popup and menu is drawn into so they
can leave the main window; `src/host/popup-client.js` and `menu-client.js` run inside them.
`window_state.rs` remembers where every window was, `launch.rs` hands over files the program
was started with, `fonts.rs` lists the system fonts and `download.rs` fetches pictures from a
link.

`npm start` (`scripts/dev.js`) serves the project folder on a free port and runs `tauri dev`
against it, so every window shows the files as they are on disk. `npm run stage` copies what
the installer embeds into `dist/app`.

## The drawing model

A document is `{ id, name, path, width, height, background, shapes[], effects }`. A shape is one
of `pencil`, `brush`, `marker`, `spray`, `eraser`, `freeCurve` (strokes, which carry points),
`line`, `arrow`, `curve`, `rect`, `roundRect`, `ellipse`, `triangle`, `diamond`, `rightTriangle`,
`pentagon`, `hexagon`, `star`, `heart`, `blockArrow`, `cross`, `bubble`, `cloud`, `text`, `image`
(which carry a box). The last ten outline shapes before `text` are `panelOnly` in `TOOLS`: in the
left panel, not in the Draw menu.

A text shape may carry `runs`, one style per stretch of characters; the editor
over the canvas (`richtext.js`) is a contenteditable with one span per run, so a font change
with nothing selected applies from the caret onward and with characters selected applies to
exactly those. A face chosen with the whole text shape selected goes on every run and leaves the
other faces alone. Styles given to text never reach the defaults in the settings
(`fontDefaultsClean` clears, once, what older versions leaked there).

Optional fields change how a shape is drawn: `lineCap`, `lineJoin`, `lineDash` on lines and closed
shapes, `arrowStart`, `arrowEnd`, `headSize` on arrows. On an open line one choice sets `lineCap`
and `lineJoin` together (`setLineLook`). The default arrow is one outline (`arrowOutline`), so no
line end shows through its head; other heads are separate parts (`arrowParts`). `svgdoc.js` writes
the same forms. `paint.js` draws a document into any 2D context, so the canvas on screen, the print
pages and the exported file all come from one set of drawing functions.

`Paint.resizedBox` and `Paint.resizeShape` are the eight handles of a single selection; resizing
text scales its font size. `Paint.boxContains` decides a band selection on the shape's core box,
without its line width, so a shape counts as inside by its geometry. Colour goes through
`colorTargets()` and width through `widthTargets()`: with the select tool those are the selected
shapes, and with a drawing tool in hand a colour reaches only text being edited, so the shape just
drawn does not recolour.

Undo is a JSON snapshot of every document. That is why anything that cannot be serialised —
the decoded picture, the DICOM decoder, the reader details — lives in `extras`, a `Map` keyed
by document id in `app.js`, and is re-attached after a snapshot is restored.

A picture that came from a file keeps its pixels in the `images` cache under the key
`frame:<document id>`, and the document holds a single `image` shape pointing at that key.
Changing the DICOM window or frame only replaces the cached canvas; nothing else moves.
Saving flattens those keys into real data URLs first (`flattenFrames`).

## Picked areas

A *region* is not a shape. It marks the part of the picture that a crop, a copy or an erase
works on, and it is a rectangle, an ellipse or the outline the pointer drew. `paint.js` keeps
the geometry (`makeRegion`, `growRegion`, `regionHas`, `clipRegion`, `regionOutline`) and
`app.js` keeps the one that is live, draws it as an SVG marquee over the canvas, and turns it
into pixels: cropping rasterises the document through the region's clip path and replaces the
document with the result, erasing paints the region with the canvas colour, and copying puts
the cropped pixels on MyPaint's own clipboard as an image shape and on the system clipboard as
a PNG — through the host's `clipboard_write_image` command (arboard), or the asynchronous
clipboard API in a browser — so another program can paste it. Nothing is ever written to the
system clipboard as text: MyPaint's own shape list would be gibberish anywhere else.

The `selectPixel` tool makes a rectangular region snapped to whole pixels, inclusive of both
ends and clamped to the picture. With a region and nothing selected, a colour goes through
`paintRegion`, which paints those pixels into the document's `pixelLayer`: an image shape kept
above the others that hit-testing, boxes and select-all all skip. The shapes below stay whole.
Effects on a region use `liftRegion`, which rasterises it into an image shape marked `lifted: true`,
so a later reset can take the piece away again.

## Effects

`src/effects.js` holds looks, adjustments, border and shadow. There are two kinds, and both use the
same fields and the same right-panel section (`fxSection` in `app.js`):

- `shape.effects` on a selected shape or a lifted piece. `drawWithEffects` in `paint.js` draws the
  shape through a layer, inside `Paint.render` for the canvas and saved pictures and called directly
  by the print pages.
- `doc.effects` when nothing is selected. On screen it is only CSS on the board, so the drawing is
  not rasterised while it changes. `Effects.apply` burns it into a saved picture, which grows by
  the border and shadow. The export window edits this one.

Printing a document with `doc.effects` goes through `printView`: the finished picture becomes a
stand-in document of one image at the larger size, and `Print.selectPages` splits that. A document
with none prints as itself. Views are kept per document until its JSON, the print-background setting
or its frame changes, because every print setting asks for the pages again. With the background off,
`Effects.apply` gets `clearBehind`, since it paints the frame's colour across the whole rectangle and a
see-through picture would otherwise show it.

SVG uses filter primitives rather than CSS filter functions, so other programs can read them.
`colourPrimitives` writes the matrices `Effects.matrixOf` computes, in sRGB to match the canvas, and
`feDropShadow` takes half of the canvas `shadowBlur`. Regions are `userSpaceOnUse`, as a straight line's
own box is empty and a filter measured on it draws nothing. `shapeWithEffects` and `framedDoc` follow the
drawing order of `applyLayer` and `apply`. A document's effects wrap everything in a larger root, nesting
an SVG source with `nestedSource`; without them an untouched source stays word for word. Filter ids
start past those already in the source, since a saved file can be opened and saved again. Tests compare
the rasterised SVG with the exported picture pixel by pixel.

Reset follows the same choice (`fxResetTargets`): the selection; for a region, the shapes it
touches, with lifted pieces removed and the document left alone; with nothing selected, the
document only. `color-wheel.js` is the disc; the value slider beside it is ordinary.

## SVG documents

A document opened from an `.svg` file keeps its source in `doc.svg`, and its picture is an image
shape marked `svgFrame`, with the rasterised pixels in `images` under the frame key like any other
picture. `Paint.isBackdrop` (`svgFrame` or `pixelLayer`) keeps that shape out of clicks, boxes and
select-all, and the shape list and the shape count leave it out too.

`doc.svg` is always a source that drew. What is being typed sits in `extras` as `svgDraft`, and
`applySvgSource` moves it over only after `SvgDoc.inspect` and `SvgDoc.rasterize` both succeed, so
saving during a mistake writes a good file. `svgToken` drops a redraw that a newer one has overtaken.
The facts above the box change in place (`showSvgState`), because rebuilding the panel would reset the
box's own undo. A rebuild that cannot be avoided, when typing changes the canvas size, restores the
focus and caret; the text goes in through `.value`, since HTML parsing would lose a first line break.

Undo keeps the source in its snapshot but not the pixels: `restore` compares `doc.svg` with `extras`'
`svgDrawn` and draws the frame again where they differ. A `.mypaint` file stores the source and an empty
frame `src`; the document gets a new id on opening, so `attachSvgFrame` points the frame at the new key
and draws it. Changing the canvas size calls `svgFollowCanvas`, which writes the size into the source
(`SvgDoc.setSize`, which returns the text untouched when the size is the same). Cropping, erasing and
clearing call `dropSvgSource`: from then on the picture is pixels. `SvgDoc.fromDoc` writes the source
followed by the shapes drawn on top in a `mypaint-shapes` group, without the frame.

## The start screen

`start-screen.js` draws the cards and handles dragging; `app.js` hands it what it needs, so it
touches no application state directly. `start-layout.js` is the card board without a DOM: grid
cells and compaction. Its node list leaves out `.start-ghost`, the copy that follows a drag, which
otherwise counts as a card. `start-background.js` paints twenty 3D scenes on a 2D canvas from the
theme tokens. `range-stepper.js` is delegated from the document so the same control works in a
dialog window. The values live in `settings.startScreen`.

## Dropped files

A drop always asks (`drop` popup). The stage notes the point in `pendingDropAt` and preselects
"put it in the picture"; the picture is placed at that point, fitted to the canvas, selected, with
24 pixels between several. One answer serves every file of the drop. The answer's radios all carry
`data-field="role"`: the dialog window sends back only `[data-field]` values, so a radio without
one is lost in the real window even though it works in the inline test popup.

## Reading a picture

`formats.js` decides what a file is from its extension first and its first bytes second, then
hands it to one reader:

| Kind | Reader |
|------|--------|
| `native` | `createImageBitmap` — PNG, JPEG, GIF, WebP, BMP, ICO, AVIF |
| `tiff` | UTIF, every page, LZW / PackBits / Deflate / JPEG, 8–16 bit |
| `heif` | the platform first, then libheif compiled to WebAssembly — the file's primary image, with every other image it holds as a further page |
| `j2k` | OpenJPEG |
| `raw` | the full-size JPEG the camera wrote into the file |
| `dicom` | `dicom.js` |
| `extra` | `extra-formats.js` — TGA, Netpbm (PBM / PGM / PPM / PNM / PAM), QOI, PCX; pure JavaScript, no DOM |
| `svg` | the browser, through an `<img>` — drawn at the width / height the file asks for, else its viewBox, else 300 × 150; the source comes back as `svgText` and becomes `doc.svg` |

Writing goes the other way: the browser's own encoder for PNG, JPEG, WebP and AVIF,
`encoders.js` for BMP, TIFF, GIF, ICO and DICOM, `extra-formats.js` for TGA, PPM, PAM, QOI and
PCX, and OpenJPEG for JPEG 2000. Not every web view can write WebP and AVIF (WebView2 has no
AVIF encoder, older WebKit no WebP one), so `Formats.probeWriters()` tries each once on a
one-pixel canvas at start-up and `Formats.writableFormats()` is what the save and convert
choices list; `SAVE_FORMATS` stays the full list. A blob of another type is still refused, in
case a probe was wrong. SVG is written by `svgdoc.js`: every shape as an SVG element and a
picture as an embedded PNG `<image>`. HEIC has no encoder anywhere in
reach — HEVC is patent-encumbered — so it is read but never written.

Camera RAW is not demosaiced. Every camera writes a full-size JPEG rendering beside the sensor
data, so the reader walks the TIFF directories for `JPEGInterchangeFormat`, falls back to the
Fujifilm header, and finally scans the file for the largest JPEG between `FFD8FF` and `FFD9`.
That one path covers every maker without a maker-specific decoder.

The decoders are large WebAssembly bundles. `npm run vendor` copies them from `node_modules`
into `src/vendor/`, each one a single self-contained script with its WebAssembly embedded as
base64, so a `<script>` tag is enough and the packaged application needs no `node_modules`.
`dicom.js` loads them on first use and caches them.

## DICOM

`src/dicom.js` is the decoder: transfer syntaxes from implicit little endian through RLE,
deflate, JPEG, JPEG-LS, JPEG 2000 and HTJ2K; modality rescale and LUTs; VOI windows, VOI LUTs
and window functions; colour maps; overlay planes; enhanced multi-frame groups. A file saved
without the Part 10 preamble is read as well, taking its transfer syntax from the file meta
group when that is present and guessing it from the first element when it is not. `image.render()`
returns RGBA for one frame, `image.stats()` and `image.valueAt()` answer measurements, and
`image.tags` is the whole file.

`app.js` wires that to the right panel: the window, presets, colour map, inversion, overlays,
frames and playback. Measurements reuse the paint tools — a line gives its length in
millimetres, a rectangle or ellipse gives mean, spread and area — so there is no second
drawing model for annotations.

## Windows that leave the main window

Menus and popups are real operating-system windows (`src-tauri/src/popups.rs`), owned by the
main window so they close with it. Each is created hidden once and then only shown and
hidden, and is shown only after its page reports that it rendered the current HTML. The renderer sends the finished HTML plus
the theme as CSS variables; the child sends back one action. In the web build a popup is also
its own window: `window.open("popup.html")` receives the same HTML and posts each action back.
Menus stay in `#menuLayer` there. The test page (`?test=1`) still mounts popup HTML in
`#popupLayer`, so the layout assertions keep one document to measure. That also means the tests
cannot catch what only happens between two windows, such as a dialog's answer not coming back
or a popup left open.

A popup opened as another closes must not be confused with it. Each open takes a generation
(`popupGen` in JS, `popup_gen` in `Inner`): `open()` accepts it under one lock, and `close_popup`
and `refresh_popup` carry the generation they mean, so a late close cannot take down a newer popup.
Showing and hiding are turned over to the main thread, which checks the wanted state before acting.
A popup is raised with an always-on-top toggle, so it comes forward without staying above other
programs. `KEEP_POPUP` lists the actions that leave a popup open, such as a settings tab.

Popups are a fixed size from `metrics.POPUPS`, and the test suite asserts that nothing inside
them scrolls and that no row is taller than one line. Long lists page with `<` and `>` buttons
rather than scrolling — the print preview and the DICOM tag browser both do this.

## The grid

The grid is not part of the picture. `#canvasGrid` (`z-index: 0`) lies under `#board`
(`z-index: 1`), so shapes and pictures cover it. While the grid is on, the board is rendered with
`noBackground` and the document's background colour moves onto the grid element; an opaque picture
hides the grid, and so does an eraser stroke. The ink follows the background's
luminance (`--grid-ink`), at alpha .14 for major lines and .06 for minor ones.

`gridSpacing()` keeps a cell between `GRID_MIN_CELL` (6) and `GRID_MAX_CELL` (30) pixels on screen,
splitting or joining by five as the zoom changes. Its lines are repeating gradients measured on the
picture, so they move with it like the rulers do. `settings.showGrid` is saved with the other
settings, and nothing of the grid goes into a saved file. The toolbar button and the View menu both
toggle it.

## Panels

`#splitLeft` and `#splitRight` are separators that take a drag or the arrow keys; a double-click
returns to the minimum. Widths are stored in `settings.layout`. The minimums are `TOOL_PANEL` (200)
and `PROP_PANEL` (240), the maximum `PANEL_MAX` (480). The right panel's content scrolls in
`.right-scroll`, and its scroll position survives the panel being redrawn.

## Fitting the window

`metrics.MIN_WIDTH` (1210) is the smallest the host will make the window (`MIN_WIDTH` in
`lib.rs` must match). The page itself is
`width: 100%` and does not force a layout wider than the window, so the right-hand toolbar
buttons are not pushed off the edge when the view is narrower than that, or when the desktop
window is at its minimum. The buttons do not shrink. The spare space sits between the drawing
commands and the buttons grouped at the right end.

## Settings

`store.js` keeps everything in `localStorage` under one key: language, theme, custom colours,
font, zoom, whether the grid is on, tool, colours, line width, canvas defaults, panel widths
(`layout`), the start screen (`startScreen`: show, background, speed, shuffle, card opacity, card
layout), print setup, the last open and save folders, the opened folders, and the ten most recent
files. The workspace background image is too large for that, so it lives in IndexedDB.

## Tests

`scripts/browser.js` starts a static server and a headless Edge or Chrome and talks to it over
the DevTools protocol. `npm test` is `scripts/run-tests.js`: it runs every stage (vendor, fixtures,
web tests, stage app, Rust tests) and ends with one summary of the whole run
(`scripts/test-report.js`), where a stage that ran no tests is a failure.
`scripts/test.js` uses the browser to open `test/`, list each test as it finishes and read the results;
`scripts/make-samples.js` uses it to write the formats only a browser can encode.

`test/cases.js` drives the real application through `window.MyPaint`, the API `app.js` exposes
for exactly this. Fifty-three suites cover the
engine, every tool, selection and moving several shapes, resizing, history, clipboard, layers,
documents, the recent list, the start screen, text styles, line looks, arrows, the grid, pixels,
effects and where they reach, the SVG source, settings, both languages, themes, the toolbar, menus, popups, tabs, the status bar, the
context menu, zoom, printing, drag and drop, picked areas, the format readers, camera files,
DICOM, conversion, the sample files, closing, fonts, the background image, progress, errors,
the installers, the icons, the window and the panels.

`scripts/make-guide-images.js` takes the pictures of the guide from the same page, each shot
setting up its state through `window.MyPaint`. A shot whose setup fails is reported and skipped,
leaving the picture on disk.
