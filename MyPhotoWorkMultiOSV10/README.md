# My Photo Work V1.0

My Photo Work V1.0 is a professional-grade layered raster photo editor built with Vite, React, and Electron. The same codebase runs in the browser and as a desktop app on Windows, macOS, and Linux.

## Features

- Layer-based editing with visibility, lock, opacity, blend modes (including hue/saturation/color/luminosity), reorder, duplicate, merge down, flatten, **groups**, **adjustment layers**, **fill layers**, **live text layers**, **shape layers**, **layer masks**, and **layer styles**.
- Full tool strip with flyout groups: move/artboard, marquees, lassos, object/quick/wand, crop/slice/frame, sample tools, retouch (heal/remove/patch/clone), brushes, erasers, gradient/bucket, blur/sharpen/smudge, dodge/burn/sponge, pen/path, type, shapes, hand/rotate view/zoom.
- **Clipboard**: cut, copy, copy merged, paste and paste-into-selection, with the system clipboard used as well where the browser allows it. **Fill** and **Stroke** paint a selection or draw a line along its edge, inside, outside or centred.
- **Selection modifiers**: expand, contract, border, smooth, feather, grow, similar, colour range, and reselect.
- **Free transform** (Ctrl+T) with scale, rotate, mirror and numeric W/H/angle entry; flip the document or a single layer.
- **Curves and Levels** editors with per-channel control, a monotone spline, auto black/white points, and the option to apply destructively or as an adjustment layer.
- **Channel mixer, selective colour, gradient map, replace colour, equalize and auto colour**, plus rotate 180 and trim.
- **Clipping masks**: a layer, including an adjustment layer, can be confined to the shape of the one below it.
- **Smart objects and smart filters**: a layer can be placed from an untouched original, so scaling never loses anything, and filters sit on a stack that can be switched off, re-tuned or removed at any time.
- **Channels**: the three colour channels shown separately, plus saved selections as alpha channels that survive the project file and can be loaded back to replace, add to, subtract from or intersect the selection.
- **Transform**: skew, distort, perspective, warp (eleven preset shapes), puppet warp with pins, and content-aware scale by seam carving, which carves every layer with the same seams so they stay lined up.
- **Type**: paragraphs with line height, letter spacing, indents and paragraph spacing; type warped into the same eleven shapes; type set along a path.
- **Colour modes and management**: RGB, greyscale, CMYK and Lab; 8 or 16 bits per channel, with 16-bit TIFF written at full depth; four RGB working spaces that can be assigned or converted to, and ICC profiles read out of the files that carry them.
- **Actions**: record what you do, play it back, and run it over a folder of files. **Layer comps** remember an arrangement of the layers and restore it.
- **Timeline**: frame-by-frame animation, exported as an animated GIF written by the app itself, or recorded as video; video files can be imported as frames.
- **Patterns and brushes**: define a pattern from a selection and tile it; save brush tips with size, hardness, opacity, spacing, angle, roundness and scatter.
- **3D**: a layer extruded into a lit solid that can be turned in space, with adjustable depth, rotation, perspective and light direction.
- **Vector paths**: pen, freeform pen and curvature pen, with anchor/handle editing, stroke, fill, and path-to-selection.
- **Shape tools** (rectangle, rounded rectangle, ellipse, polygon, line, custom) that create editable shape layers.
- **Polygonal and magnetic lassos**, **patch** and **content-aware move**, **perspective crop**, **slices** (with per-slice export), **frames**, and a **ruler** that reports distance and angle.
- Adjustments and filters: Camera Raw-style develop, brightness/contrast, hue/saturation, invert, grayscale, auto levels, Gaussian/motion/box/radial blur, sharpen, unsharp mask, high pass, noise, median, dust and scratches, mosaic, crystallize, find edges, emboss, oil paint, solarize, clouds, vignette, lens flare, offset, minimum, maximum, twirl, ripple, wave, spherize, pinch, liquify, neural-style skin smooth.
- Local generative-job tools: content-aware / generative fill, generative expand, generative upscale, Harmonize, Select Subject, Remove Background, Find Distractions. These run on-device; no cloud service is contacted and no account is needed.
- Open PNG, JPG, GIF, WebP, AVIF, BMP, TIFF, **HEIC/HEIF** (`.heic`, `.heif`, `.hif` — decoded in-app with libheif, since no browser reads them), **DICOM** (`.dcm`, with rescale, windowing and MONOCHROME1 handled), and the native `.mpw` project format. Place extra images as new layers.
- Save layered projects (`.mpw` v2) and export PNG, JPG, WebP, AVIF, GIF, or TIFF, with a **transparent background** option for the formats that can store alpha.
- **Print** (Ctrl+P) in one window: the page on its sheet, the printer, the orientation and the number of copies together, then straight to the printer. In a browser the system print dialog is used instead, since nothing else can reach a printer there.
- **Image information** window: the file, the document, pixel statistics, and the header the file itself carried — EXIF for a photo, IHDR for a PNG, the tag set for a DICOM.
- Separate title bar, menu bar and icon toolbar; every menu dropdown and dialog opens as its own movable window that can overhang the app and is closed with it. Menus fold their groups into submenus that open beside the row; the toolbar stays on one line, which sets the window's minimum width (1280 px); the Filter Gallery is a tabbed, fixed-size window and Settings a preferences window with sections and a reset button.
- Drag images or `.mpw` projects onto the window from the desktop.
- Undo/redo, zoom/pan/rotate view, rulers graduated like a tape (numbered, half and fine ticks on both axes), quick mask, transparency checkerboard, optional grid, RGB histogram, Korean/English UI, 20 dark/light themes.
- Every failure opens a window naming the action and showing the full error, stack and environment, ready to copy.
- **Photoshop parity** (see [PhotoshopParity.md](PhotoshopParity.md) for the item-by-item status): the whole Photoshop menu set — File, Edit, Image, Layer, Type, Select, Filter, 3D, View and Window — with **several open documents in tabs**; **live preview** in every adjustment and filter window; **selection add/subtract/intersect** (Shift, Alt, Shift+Alt, or the option bar) with feather and anti-alias; **layer masks that can be painted**, disabled, inverted, applied and deleted; **layer styles** with all ten effects and their parameters (drop/inner shadow, outer/inner glow, bevel & emboss, satin, colour/gradient/pattern overlay, stroke) plus saved styles; **PSD open and save** (layers, groups, masks, blend modes, opacity, 8/16-bit RGB, greyscale, CMYK, indexed); the **History panel** with named snapshots and a history-brush source; **guides** (drag from the rulers, New Guide, layouts, lock, snap), pixel grid, notes, artboards, colour samplers with RGB readouts and a measurement log; **panels** for Properties, Navigator, Color, Swatches, Gradients, Patterns, Styles, Shapes, Brushes, Clone Source, Tool Presets, Character, Paragraph, Glyphs, Measurement Log and Notes; a **gradient editor** with any number of colour and opacity stops; **Select and Mask** (smooth, feather, contrast, shift edge, edge radius, decontaminate, four outputs), Transform Selection, Focus Area, Sky, Object Selection by dragging a box and a Quick Selection brush; **Colour Lookup** (built-in looks and `.cube` files), HDR Toning, Match Color, Desaturate, Auto Tone/Contrast, arbitrary rotation, Apply Image, Calculations, Duotone, Indexed Colour and Bitmap modes; **ninety more filters** — Surface/Lens/Smart/Shape Blur, the Blur Gallery (Field, Iris, Tilt-Shift, Path, Spin), Displace, Polar Coordinates, Shear, ZigZag, Ocean Ripple, Glass, Diffuse Glow, Despeckle, Reduce Noise, Colour Halftone, Facet, Fragment, Mezzotint, Pointillize, Difference Clouds, Fibers, Lighting Effects, Flame, Tree, Picture Frame, Sharpen More/Edges, Smart Sharpen, Shake Reduction, Diffuse, Extrude, Tiles, Trace Contour, Wind, De-Interlace, NTSC Colours, Custom kernel, HSB/HSA, Lens Correction, Adaptive Wide Angle, Vanishing Point (paste into a plane), Liquify as a real brush (forward warp, twirl, pucker, bloat, reconstruct, freeze/thaw) and all 46 Filter Gallery effects; the **Mixer, History, Art History, Pattern Stamp and Healing brushes** do what their names say; **the classical computer-vision commands are the real thing**, built on OpenCV (WebAssembly, loaded on first use) and two pieces of pure TypeScript: Photomerge and Auto-Align match features frame to frame and warp with a RANSAC homography (rotation and perspective, not just a shift), Auto-Blend fades each layer by its distance from its own edge, Merge to HDR is Mertens exposure fusion, Content-Aware Fill / Generative Fill / the Remove tool are PatchMatch inpainting seeded by Telea, Harmonize is Poisson seamless cloning, Object Selection and Select Subject are GrabCut, Crop & Straighten finds each print on the scanner bed and levels it into its own document, and the Clone Stamp inside a Vanishing Point plane clones along the plane's perspective; **local neural networks** (ONNX Runtime, WebAssembly on every core, WebGPU opt-in) for the commands Photoshop backs with models — Select Subject / Remove Background / Object Selection (U²-Net, Silueta, ISNet), Select Sky and Sky Replacement (SegFormer), Depth Blur (Depth Anything V2), Generative Fill and the Remove tool (LaMa), Super Zoom and Generative Upscale (Swin2SR) — with the weights fetched once from their public repositories through Edit ▸ Neural Models…, stored on this machine and never uploaded, and each command falling back to its classical method when a model is not downloaded; Load Files into Stack, Statistics, Contact Sheet, Fit Image and Image Processor; Fade, Paste in Place/Outside, Check Spelling, Find and Replace, Define Brush/Custom Shape, Sky Replacement, Perspective Warp, Purge, Keyboard Shortcuts (rebindable tool keys), Preferences; Proof Colours, Gamut Warning, screen modes, Extras, Pattern Preview; layer align/distribute/link, locks, matting, New Layer via Copy/Cut, Smart Object edit/replace/export contents, vector masks from paths; type to shape, work paths, glyphs, underline/strike/caps/baseline, anti-aliasing, type masks, orientation.
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

```bash
npm run verify:images
```

Walks the real open → composite → export → print pipeline over every photo in
`images/`, at full camera resolution, including the HEIC and the DICOM slice. It
asserts as it goes — a non-zero exit means a feature is broken — and leaves
everything it produced in **`out/`**: the composites, the exports in each
format, a transparent/opaque pair, the 3D, warp, carve, animation, 16-bit and
pattern results, and the print preview and page. `out/index.html` shows them
side by side, `out/report.md` lists what each file is evidence of, and
`out/verify-images.log` is the transcript. The directory is rebuilt on every run
and is committed: an assertion that passed is not the same as a result somebody
has looked at, and the seam-carving bug in Content-Aware Scale was found by
looking rather than by asserting.

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

The `dist:*` scripts package through `scripts/package-app.cjs` rather than
calling electron-builder directly. Packaging writes about a hundred megabytes of
`.exe`, `.dll` and archive into `release/` and then renames and deletes those
files moments later; on Windows, whatever scans new executables can still have
one open at that point, and the build dies with `EPERM: operation not permitted`
on a rename or `EBUSY: resource busy or locked` on a delete — on files nothing
else is using. The wrapper clears what an earlier run left behind, and retries a
lock three times with a growing wait. Any other failure is reported the first
time. `npm run clean:release` does the clearing on its own.

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
| `scripts/` | The launchers, the packaging wrapper, the icon and build-stamp generators and the image verification run |
| `test/` | The `node --test` suite and its DOM/canvas harness |
| `images/` | Sample photos, including a HEIC and a DICOM slice, used by `npm run verify:images` |
| `out/` | What that run produced, kept to be looked at: a gallery, a report and every file it wrote |

## Program Information

- Program: My Photo Work V1.0
- Version: 1.0.0
- Creator: SHKWON(knix008@naver.com)
- Licence: MIT
