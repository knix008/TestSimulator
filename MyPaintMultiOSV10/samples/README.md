# samples/

One picture per format MyPaint reads. Drag any of them onto the window, or open them from the
File menu, to try a reader. `npm run samples` writes them again.

Every generated file holds the same scene — a sky gradient, a horizon, a yellow sun and three
colour bars — so a reader that swaps channels or loses a page is obvious at a glance.

## Common images

| File | What it exercises |
|------|-------------------|
| `scene.png` | 8-bit RGBA PNG |
| `scene.jpg` | baseline JPEG, quality 92 (libjpeg-turbo) |
| `scene.gif` | GIF89a with a 256-colour palette |
| `scene.bmp` | 24-bit BMP, bottom-up rows |
| `scene.ico` | Windows icon carrying 16, 32, 48 and 256 px |
| `scene.webp` | WebP, written by the headless browser |

## TIFF

| File | What it exercises |
|------|-------------------|
| `scene.tif` | uncompressed 8-bit RGB, 150 dpi |
| `scene-16bit.tif` | 16-bit greyscale, brought down to 8 bit on screen |
| `pages.tif` | three pages at 320×240, 160×120 and 80×60 — step through them with `<` and `>` in the right panel |

## JPEG 2000

| File | What it exercises |
|------|-------------------|
| `scene.j2k` | a bare codestream |
| `scene.jp2` | the same codestream inside a JP2 box structure |

## Camera RAW

Each of these is a maker's container holding the full-size JPEG a camera writes beside its
sensor data, with the Make and Model tags filled in — which is exactly the part MyPaint reads
out of a RAW file. They are built here rather than taken from a camera, so the repository
stays small; a real file from any of these cameras goes down the same path.

`canon-eos-r5.cr2`, `nikon-z9.nef`, `sony-a7iv.arw`, `adobe.dng`, `olympus-om1.orf`,
`panasonic-s5.rw2`, `pentax-k3.pef`, `samsung-nx1.srw`, `hasselblad.3fr`, `phaseone.iiq`,
`sigma.x3f`, `leica.rwl`, and `fujifilm-xt5.raf` — the Fujifilm one uses Fujifilm's own
header rather than a TIFF directory, so both readers are covered.

## DICOM

| File | What it exercises |
|------|-------------------|
| `ct-one-frame.dcm` | 16-bit CT, Hounsfield rescale, a window of C 600 / W 1600, 0.5 mm pixels |
| `ct-eight-frames.dcm` | the same with eight frames — step or play them |
| `colour-capture.dcm` | 8-bit RGB secondary capture |
| `CT_small.dcm` | a real CT from the [pydicom](https://github.com/pydicom/pydicom) test set (MIT, anonymised) |
| `SC_rgb_small_odd.dcm` | pydicom: RGB with odd dimensions |
| `JPEG2000.dcm` | pydicom: pixel data compressed with JPEG 2000 |

## MyPaint

| File | What it exercises |
|------|-------------------|
| `drawing.mpaint` | two drawings in one file: strokes, shapes and text |

## HEIC / HEIF

| File | Where it comes from |
|------|---------------------|
| `photo.heic` | Nokia's [HEIF sample page](https://nokiatech.github.io/heif/) — 1440x960 |
| `example.heif` | the [libheif](https://github.com/strukturag/libheif) example image — 1280x854 |
| `conformance.heic` | Nokia's [HEIF conformance](https://github.com/nokiatech/heif_conformance) file C003 — 1280x720 |

These three are downloaded rather than generated: nothing in this toolchain can write HEVC.
`npm run samples:heic` fetches them again (`--force` to replace what is already there), and
each file is decoded with libheif before it is kept, so a broken download is never written.

MyPaint reads HEIC and HEIF but cannot write them, for the same reason.

## index.json

A list of every picture in this folder and the reader each one should go through. The test run
reads it and opens every entry, so a file dropped in here is covered without editing a test.

`blank.html` is an empty page the sample writer loads to reach the browser's encoders. It is
not a picture.
