# MyPaint 10.0

A paint program for Windows, macOS, Linux and the web, with readers for the picture formats
a desktop actually meets: ordinary images, TIFF, HEIC/HEIF, JPEG 2000, camera RAW files, and
DICOM medical images.

- Author: SHKWON (knix008@naver.com)
- Drawing file: `.mpaint`, registered with its own icon by the installer
- Languages: 한국어 and English, switchable while the program runs

## Run it

```sh
npm install
npm run icons          # draws the application and document icons
npm run vendor         # copies the decoders into src/vendor
npm start              # Electron
```

The web build is the same code with no Electron around it:

```sh
npm run build:web      # dist/web — open index.html from any web server
```

## Installers

```sh
npm run build:win      # NSIS setup .exe (Korean and English)
npm run build:linux    # deb, AppImage, tar.gz
npm run build:macos    # dmg, pkg, zip (only runs on macOS)
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

## What it does

Drawing: pencil, brush, eraser, line, rectangle, ellipse, text, fill and colour picker, with
a selection tool that moves shapes, a shape list, layer order, undo and redo, clipboard,
Ctrl+wheel zoom, and a grid over the picture. The grid is turned on from the toolbar and
keeps the same spacing on screen at every zoom. Shrinking the window to its minimum still
leaves every toolbar button visible. There is also a context menu, drag and drop from
outside, printing with a preview, a background image for the workspace, 41 themes, and a
settings window that remembers everything for the next run.

Pictures also come from a link: paste an address and MyPaint downloads it, showing how much
has arrived and letting you stop part way.

Pictures it reads: PNG, JPEG, GIF, WebP, BMP, ICO, AVIF, TIFF (every page, 8–16 bit),
HEIC/HEIF, JPEG 2000, and camera RAW from Canon, Nikon, Sony, Fujifilm, Olympus, Panasonic,
Pentax, Phase One, Hasselblad, Leica, Samsung, Sigma and Adobe DNG.

Pictures it writes: PNG, JPEG, WebP, BMP, TIFF, GIF, ICO, JPEG 2000 (`.jp2` and `.j2k`) and
DICOM. Export asks which one. There is no HEIC export: HEVC is patent-encumbered and no
browser or WebAssembly package on offer can encode it, so MyPaint reads HEIC but cannot
write it.

Medical images: DICOM files open with window centre and width, the CT presets, VOI LUTs and
window functions, colour maps, grey inversion, overlay planes, multi-frame playback, length
and region measurements in millimetres, a Hounsfield pixel probe, and a browser for every
tag in the file.

## Layout

| Path | What is in it |
|------|----------------|
| `electron/` | main process, preload, and the popup and menu windows |
| `src/` | the application: drawing engine, format readers, DICOM decoder, themes, i18n |
| `src/vendor/` | decoder bundles copied out of node_modules by `npm run vendor` |
| `style/` | one stylesheet, driven by theme variables |
| `build/` | installer scripts for Windows, Linux and macOS |
| `scripts/` | icons, fixtures, vendor, web build, test runner |
| `test/` | the test suites and the pictures they open |
| `samples/` | one picture per supported format, to try the readers by hand |
