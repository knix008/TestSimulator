# MyPaint 10.0

A paint program for Windows, macOS, Linux and the web, with readers for the picture formats
a desktop actually meets: ordinary images, TIFF, HEIC/HEIF, JPEG 2000, camera RAW files, and
DICOM medical images.

- Author: SHKWON (knix008@naver.com)
- Drawing file: `.mypaint`, registered with its own icon by the installer (older `.mpaint`
  files still open)
- Desktop host: Tauri 2 (`src-tauri/`), on the system web view — WebView2, WKWebView or
  WebKitGTK
- Languages: 한국어 and English, switchable while the program runs

## Run it

```sh
npm install
npm run icons          # draws the application and document icons
npm run vendor         # copies the decoders into src/vendor
npm start              # the desktop app on the files as they are on disk (tauri dev)
```

`npm start` needs Rust (cargo) for the host. The web build is the same code with no host
around it:

```sh
npm run build:web      # dist/web — open index.html from any web server
```

## Installers

```sh
npm run build:win      # NSIS setup .exe (Korean and English), copied next to the project
npm run build:linux    # deb and AppImage (only runs on Linux)
npm run build:macos    # .app and dmg (only runs on macOS; --arm64 / --x64 pick the target)
npm run build          # icons, vendor, web, and every installer this machine can make
```

Each installer removes an older MyPaint completely before copying the new files, and asks
first if saved data is found.

## Tests

```sh
npm test
npm run samples      # writes samples/ — one picture per format it reads
npm run samples:heic # fetches the HEIC samples, the only ones that cannot be generated
```

The run writes the generated test pictures, starts a local server, drives the real
application in headless Edge or Chrome, and prints the result per suite with a summary.
It then runs the Rust host's own tests (`npm run test:rust`).

## What it does

Drawing: pencil, brush, marker, spray, eraser, line, arrow, curve, free curve, rectangle,
rounded rectangle, ellipse, triangle, rich text (font, size, bold, italic, underline and
strikethrough per character), fill and colour picker, with
a selection tool that moves shapes, a shape list, layer order, undo and redo, clipboard,
Ctrl+wheel zoom, rulers, and a grid over the picture. The grid is turned on from the toolbar;
its cells are measured on the picture, so they grow and shrink with the zoom, and every fifth
line is drawn stronger. Shrinking the window to its minimum still
leaves every toolbar button visible. There is also a context menu, drag and drop from
outside, printing with a preview, a background image for the workspace, 41 themes, and a
settings window that remembers everything for the next run. Help → How to use opens the
user's guide (`guide.html`) in a window of its own.

Pictures also come from a link: paste an address and MyPaint downloads it, showing how much
has arrived and letting you stop part way.

Pictures it reads: PNG, JPEG, GIF, WebP, BMP, ICO, AVIF, TIFF (every page, 8–16 bit),
HEIC/HEIF, JPEG 2000, TGA, Netpbm (PBM/PGM/PPM/PAM), QOI, PCX, SVG, and camera RAW from Canon, Nikon, Sony, Fujifilm, Olympus, Panasonic,
Pentax, Phase One, Hasselblad, Leica, Samsung, Sigma and Adobe DNG.

Pictures it writes: PNG, JPEG, WebP, BMP, TIFF, GIF, ICO, JPEG 2000 (`.jp2` and `.j2k`),
DICOM, TGA, PPM, PAM, QOI, PCX, AVIF and SVG (the shapes as vectors). Export asks which one.
WebP and AVIF are written by the web view itself; MyPaint checks at start-up which of them
this system can write and offers only those — Chromium-based WebView2 has no AVIF encoder. There is no HEIC export: HEVC is patent-encumbered and no
browser or WebAssembly package on offer can encode it, so MyPaint reads HEIC but cannot
write it.

Medical images: DICOM files open with window centre and width, the CT presets, VOI LUTs and
window functions, colour maps, grey inversion, overlay planes, multi-frame playback, length
and region measurements in millimetres, a Hounsfield pixel probe, and a browser for every
tag in the file.

## Layout

| Path | What is in it |
|------|----------------|
| `src-tauri/` | the Tauri host: windows, files, popup and menu windows, window places |
| `src/` | the application: drawing engine, format readers, DICOM decoder, themes, i18n |
| `src/host/` | the bridge that gives the pages `window.desktop`, and the popup and menu pages' client |
| `guide.html`, `guide/` | the user's guide window and its pictures |
| `src/vendor/` | decoder bundles copied out of node_modules by `npm run vendor` |
| `style/` | one stylesheet, driven by theme variables |
| `build/` | installer scripts for Windows, Linux and macOS |
| `scripts/` | icons, fixtures, vendor, web build, test runner |
| `test/` | the test suites and the pictures they open |
| `samples/` | one picture per supported format, to try the readers by hand |
