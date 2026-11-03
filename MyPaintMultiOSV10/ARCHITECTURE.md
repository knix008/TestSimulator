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
  src/themes.js       41 themes plus a custom one, as CSS variables
  src/i18n.js         the Korean and English strings
  src/icons.js        the SVG icon set and the two flags
  src/store.js        settings and the recent list in localStorage
  src/sample.js       the drawings the program starts with
  src/extra-formats.js TGA / Netpbm / QOI / PCX readers and writers, SVG sniffing (no DOM)
  src/colorpicker.js  MyPaint's own colour chooser (the native one outlived its window)
  src/richtext.js     the contenteditable text editor and its per-character runs
  src/svgdoc.js       a document written out as SVG elements
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

A document is `{ id, name, path, width, height, background, shapes[] }`. A shape is one of
`pencil`, `brush`, `marker`, `spray`, `eraser`, `freeCurve` (strokes, which carry points),
`line`, `arrow`, `curve`, `rect`, `roundRect`, `ellipse`, `triangle`, `text`, `image` (which
carry a box). A text shape may carry `runs`, one style per stretch of characters; the editor
over the canvas (`richtext.js`) is a contenteditable with one span per run, so a font change
with nothing selected applies from the caret onward and with characters selected applies to
exactly those. `paint.js` draws a document into any 2D context, so the canvas
on screen, the print pages and the exported file all come from one function.

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
| `svg` | the browser, through an `<img>` — drawn at the width / height the file asks for, else its viewBox, else 300 × 150; the source comes back as `svgText` |

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
`#popupLayer`, so the layout assertions keep one document to measure.

Popups are a fixed size from `metrics.POPUPS`, and the test suite asserts that nothing inside
them scrolls and that no row is taller than one line. Long lists page with `<` and `>` buttons
rather than scrolling — the print preview and the DICOM tag browser both do this.

## The grid

The grid is not part of the picture. `#canvasGrid` sits over the canvas and under the
selection overlay, with `pointer-events: none`, so drawing and picking still hit the canvas.
Its lines are repeating gradients measured on the picture: `--grid-cell` is
`settings.gridSize` picture pixels times the zoom and `--grid-major`, five cells, is drawn
stronger, so the grid grows and shrinks with the picture like the rulers do. White lines
with `mix-blend-mode: difference` stay visible on a light canvas and on a dark photograph.
`settings.showGrid` is saved with the other settings. The toolbar button and the View menu
both toggle it.

## Fitting the window

`metrics.MIN_WIDTH` (1180) is the smallest the host will make the window (`MIN_WIDTH` in
`lib.rs` must match). The page itself is
`width: 100%` and does not force a layout wider than the window, so the right-hand toolbar
buttons are not pushed off the edge when the view is narrower than that, or when the desktop
window is at its minimum. The buttons do not shrink. The spare space sits between the drawing
commands and the buttons grouped at the right end.

## Settings

`store.js` keeps everything in `localStorage` under one key: language, theme, custom colours,
font, zoom, whether the grid is on, tool, colours, line width, canvas defaults,
print setup, the last open and save folders, the opened folders, and the ten most recent
files. The workspace background image is too large for that, so it lives in IndexedDB.

## Tests

`scripts/browser.js` starts a static server and a headless Edge or Chrome and talks to it over
the DevTools protocol. `scripts/test.js` uses it to open `test/` and read the results;
`scripts/make-samples.js` uses it to write the formats only a browser can encode.

`test/cases.js` drives the real application through `window.MyPaint`, the API `app.js` exposes
for exactly this. Thirty-seven suites cover the
engine, every tool, selection, history, clipboard, layers, documents, the recent list,
settings, both languages, themes, the toolbar, menus, popups, tabs, the status bar, the
context menu, zoom, printing, drag and drop, picked areas, the format readers, camera files,
DICOM, conversion, the sample files, closing, fonts, the background image, progress, errors,
the installers, the icons, the window and the panels.
