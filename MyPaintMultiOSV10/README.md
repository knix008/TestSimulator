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

`npm test` (`scripts/run-tests.js`) writes the generated test pictures, starts a local server,
drives the real application in headless Edge or Chrome, and prints each test as it finishes. It
then stages the application, runs the Rust host's own tests (`npm run test:rust`), and ends with
one colour summary of every stage (`scripts/test-report.js`). A stage that ran no tests counts
as a failure.

## What it does

Drawing: 31 tools — pencil, brush, marker, spray, eraser, line, arrow, curve, free curve,
rectangle, rounded rectangle, ellipse, triangle, diamond, right triangle, pentagon, hexagon,
star, heart, block arrow, cross, speech bubble, cloud, rich text (font, size, bold, italic,
underline and strikethrough per character, or on the whole text), fill, colour picker, and five
selection tools — with a 40-colour palette, a shape list, layer order, undo and redo, clipboard,
Ctrl+wheel zoom, rulers and a grid. The grid lies under everything else; its cells are measured
on the picture and split or join by five as the zoom changes, so a cell stays between 6 and 30
pixels on screen.

Selection: eight handles resize a shape or text, a box picks the shapes wholly inside it,
Shift or Ctrl adds and removes, and a group moves together. Colour and width choices apply to
what is selected. Lines take round or angular corners and four line styles; arrows take a head
at each end in six forms and a head size.

Pixels: the pixel select tool picks single pixels, and any picked area can be painted in one
colour on a layer of its own, leaving the shapes underneath untouched.

Effects: eight looks, brightness, contrast, saturation, blur, a border per side and a shadow,
set with a round colour chooser. They apply to the selected shapes, the picked area, or the
whole picture, and reset the same way. The export window sets the picture's border and shadow too.
They reach exported pictures, printing, and SVG, where they are SVG filters and shapes stay vectors.

SVG: opening an `.svg` file shows its source in the right panel. Editing the text redraws the
picture, a mistake is reported while the last good picture stays, and Save writes the source back
with any shapes drawn on top after it.

Start screen: movable, resizable cards over twenty animated 3D backgrounds, with auto arrange,
shuffle, motion speed and card opacity.

Dropping a picture from outside always asks whether to open it as a new drawing, put it in the
one being edited, or use it as the window background. Both side panels have a separator that
sets their width. Shrinking the window to its minimum still leaves every toolbar button visible.
There is also a context menu, printing with a preview, a background image for the workspace,
41 themes, and a settings window that remembers everything for the next run. Help → How to use
opens the user's guide (`guide.html`) in a window of its own.

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
| `doc/` | the user's guide: `UsersGuide.md` (Korean), `UsersGuide.en.md` (English), and `images/`, the pictures the guide window (`guide.html`) shows, made by `node scripts/make-guide-images.js` |
| `src/vendor/` | decoder bundles copied out of node_modules by `npm run vendor` |
| `style/` | `styles.css` and the start screen's `start.css`, driven by theme variables |
| `build/` | installer scripts for Windows, Linux and macOS |
| `scripts/` | icons, fixtures, vendor, web build, test runner |
| `test/` | the test suites and the pictures they open |
| `samples/` | one picture per supported format, to try the readers by hand |
