# Users Guide — My Photo Work V1.0

## Starting

- Desktop: `npm start`
- Browser: `npm run dev`, then open http://127.0.0.1:5173

You begin on a 1280×720 transparent canvas. **파일 → 새로 만들기 / File → New** picks
another size or background.

You can also drag images or `.mpw` projects onto the window from the desktop. A
drop onto an untouched document opens it; a drop onto one you have edited places
the images as new layers.

## The window

Four rows sit above the canvas:

| Row | What it holds |
| --- | --- |
| Title bar | The app icon, the document name and size, and the window buttons |
| Menu bar | Every command, grouped: File, Edit, Image, Layer, Type, Select, Filter, 3D, View, Window — then the theme picker, the language switch, Settings, Help and About |
| Toolbar | The commands you reach for constantly, as icons, followed by Select subject / Remove background / Generative fill / Harmonize and the foreground–swap–background colours |
| Options bar | The current tool and its own settings, with a one-line reminder of what the tool does |

The tool strip runs down the left edge. Clicking a group that is already active
cycles through its tools, exactly like Photoshop's flyouts.

Menus and every dialog open as **separate windows**. They can be dragged
anywhere, a long menu can overhang the app, and they all close with it. Pressing
a button that opens a dialog raises the one that is already open rather than
making a second.

## Tools

### Selecting

| Key | Tool | What it does |
| --- | --- | --- |
| M / Shift+M | Marquee, ellipse | Drag a rectangular or elliptical selection |
| M | Row, column | Click to select a one-pixel row or column |
| L | Lasso | Drag a freehand outline |
| Shift+L | Polygonal lasso | Click corner to corner; Enter or a double-click closes it |
| L | Magnetic lasso | Trace an edge and the outline snaps to it; Edge width sets how far it looks |
| W | Magic wand, quick select | Click to take a similar-coloured area; Tolerance sets how similar |
| W | Object select | One click takes the subject |

Ctrl/Cmd+A selects everything, Ctrl/Cmd+D deselects, and **선택 / Select** can
invert the selection, find distractions, or remove the background.

### Painting and retouching

| Key | Tool | What it does |
| --- | --- | --- |
| B | Brush, pencil | Paint. `[` and `]` change the size; Hardness sets the edge |
| B | Colour replace | Repaints the clicked colour with the foreground |
| E | Eraser, background eraser, magic eraser | Erase by stroke, by colour, or a whole area at a click |
| S | Clone stamp | **Alt-click to set the source**, then drag to copy from it |
| J | Spot heal, heal, patch | Blend a blemish away; the patch tool drags a selection onto clean pixels |
| J | Content-aware move | Drag a selection somewhere else and the hole is filled in |
| O | Dodge, burn, sponge | Lighten, darken, or change saturation under the brush |
| — | Blur, sharpen, smudge | Soften, sharpen, or smear where you drag |
| G | Bucket, gradient | Flood-fill, or drag one of five gradient kinds |

### Shapes, paths and type

| Key | Tool | What it does |
| --- | --- | --- |
| P | Pen | Click for corners, drag for curves, Enter to close |
| Shift+P | Curvature pen | Click only; the curve is smoothed for you |
| P | Freeform pen | Draw a path freehand |
| A / Shift+A | Path select, direct select | Move a whole path, or drag its anchors and handles |
| U | Rectangle, rounded rectangle, ellipse, polygon, line, custom | Drag to draw; Shift keeps it regular. Each becomes an editable shape layer |
| T / Shift+T | Type, vertical type | Click, type, then OK |

With a path selected, the options bar can stroke it, fill it, turn it into a
selection, or delete it.

### Crop, measure and view

| Key | Tool | What it does |
| --- | --- | --- |
| C | Crop | Drag a box, Enter to apply, Esc to cancel |
| Shift+C | Perspective crop | Click four corners, Enter to straighten them |
| C | Slice | Drag a region you can export on its own |
| K | Frame | Drag a frame; the layer shows only inside it |
| I | Eyedropper, sampler | Sample a colour, or drop a marker |
| I | Ruler | Drag to measure; the distance and angle appear in the Info panel |
| I | Note, count | Leave a note or a numbered marker |
| H / Space | Hand | Pan |
| R | Rotate view | Drag to turn the view; double-click to straighten it |
| Z | Zoom | Click to zoom in, Alt-click to zoom out |
| X | Swap | Exchange the foreground and background colours |

Ctrl/Cmd+wheel zooms, the wheel or a Space-drag pans.

**보기 / View** turns on the grid and the rulers. The rulers read in document
pixels: a full-height rule at every number, a half-height mark between two of
them, and short marks every tenth.

## Transforming

Ctrl/Cmd+T starts a free transform on the active layer. Drag the corners to
scale, the grip above the box to rotate, or the box itself to move it.

- **Shift** on a corner keeps the aspect ratio; on the rotate grip it snaps to 15°
- **Alt** resizes around the centre
- Dragging a grip past the opposite edge mirrors the layer
- The options bar takes exact width, height and angle, and has its own flip buttons
- **Enter** applies, **Esc** cancels

**이미지 / Image** rotates or flips the whole document; **레이어 / Layer** flips a
single layer.

## Layers

The right-hand panel lists layers top to bottom.

- The eye and the padlock control visibility and editing
- Opacity, fill opacity and the blend mode apply while compositing
- **레이어 / Layer** adds, duplicates, deletes, merges, flattens, groups and ungroups
- Layer styles: drop shadow, stroke, colour overlay, inner and outer glow, bevel
- A layer mask hides part of a layer without deleting it

Beyond ordinary raster layers there are **adjustment**, **fill**, **live text**,
**shape** and **group** layers. An adjustment layer changes everything painted
beneath it and can be switched off at any time.

Dragging a layer out of frame and back does not clip it: the move always
replays from the layer's untouched pixels.

## Adjustments and filters

**이미지 / Image** holds brightness/contrast, hue/saturation, Camera Raw,
**Curves**, **Levels**, auto levels, invert and greyscale.

- **Curves** edits each channel on a 256×256 grid. Click to add a point, drag to
  move it, double-click to remove it.
- **Levels** sets the input black point, gamma and white point plus the output
  range, with an Auto button that reads them off the layer.

Either can be applied to the layer or added as an adjustment layer.

**필터 / Filter** holds the gallery — blur, motion blur, sharpen, high pass,
noise, mosaic, find edges, emboss, oil paint, solarize, clouds, vignette,
offset, liquify and skin smoothing.

The generative jobs — content-aware fill, generative expand, generative upscale,
Harmonize, Select Subject, Remove Background, Find Distractions — run on your own
machine. They do not use a cloud model.

**An active selection limits every one of these to the selected pixels of the
active layer.**

## Files

- **열기 / Open** replaces the document with an image or a `.mpw` project
- **이미지 가져오기 / Place** adds a file as a new layer
- **저장 / 다른 이름으로 저장** writes a layered `.mpw` project
- **내보내기 / Export** flattens to PNG, JPG, WebP, AVIF, GIF or TIFF
- **인쇄 / Print** previews the page, then sends it to your printer
- **이미지 정보 / Image information** lists everything known about what is open
- With the slice-select tool, a single slice can be exported on its own

Unsaved changes are confirmed before New, Open, Close, or quitting.

### Opening a photo

파일 ▸ 열기 (Ctrl/Cmd+O), the folder button on the toolbar, and dragging a file
onto the window all do the same thing. You can also drop several files at once:
onto an untouched document they open one after another, and onto a document you
have already edited they arrive as new layers.

The editor reads PNG, JPG, GIF, BMP, WebP, AVIF, TIFF, **HEIC / HEIF** and
**DICOM**, plus its own `.mpw` projects.

### HEIC and HEIF photos

Phones and mirrorless cameras save their full-quality stills as HEIF — `.heic`
on an iPhone, `.heif` elsewhere, `.hif` on Fujifilm bodies. No browser can show
those files, so the editor decodes them itself:

1. 파일 ▸ 열기, pick the `.heic` file, or drag it onto the window.
2. The first HEIC of a session takes a moment longer while the decoder loads —
   about two megabytes, fetched once and then kept for every file after it.
3. The photo opens as a normal raster layer at its full resolution. From there
   every tool, adjustment and filter works exactly as it does on a JPG.

A HEIC holding several frames — a burst, or the stills of a Live Photo — opens
at its **primary** frame, the one the camera shows in its gallery; the image
information window says how many frames the file held.

Saving back to HEIC is not offered: the format's encoder is patent-encumbered
and is not part of the app. Use 내보내기 to write the edited photo as PNG (no
quality loss), TIFF (no quality loss, larger) or JPG.

`images/test04.heic` in the project folder is a sample you can open to try this.
It comes from Nokia's public HEIF conformance set; replace it with a photo from
your own phone whenever you like.

### Exporting, and the transparent background

파일 ▸ 내보내기 (or the download button on the toolbar) opens a small window
with two controls:

- **형식 / Format** — PNG, JPG, WebP, AVIF, GIF or TIFF.
- **투명 배경 유지 / Keep transparent background** — whether the see-through
  parts of the picture stay see-through in the file.

Tick the box and erased areas, a document created on a transparent background
and any layer you have faded are written with their transparency intact. Clear
it and the same picture is laid on a white sheet first, which is what you want
for a photo that will be printed, emailed or put on a white page.

The box only applies to the formats that can actually store transparency: PNG,
WebP, AVIF, GIF and TIFF. Choose **JPG** and the box greys out with a line
explaining why — JPEG has no alpha channel at all, so a JPG is always written on
white, whatever the box says. Nothing about your document changes either way;
only the exported file differs.

Both choices are remembered and are also on the Settings window, where they
decide the format a single slice is exported with.

### Printing, and the print preview

파일 ▸ 인쇄, the printer button on the toolbar, or **Ctrl/Cmd+P**.

Nothing is sent to a printer straight away. A **인쇄 미리보기 / Print preview**
window opens first, showing the page exactly as it will come out:

1. The sheet is drawn to paper proportions with the same 10 mm margin the
   printed page uses, and the picture sits inside it, flattened onto white —
   transparency means nothing on paper.
2. **용지 방향 / Orientation** starts on the way round that suits the picture:
   landscape for a wide photo, portrait for a tall one. Change it and the sheet
   in the preview turns with it, as the paper will.
3. **인쇄 / Print** hands the page to your system's own print dialog, where you
   choose the printer, the paper size and the number of copies. **취소 / Cancel**
   closes the preview and prints nothing.

The image is scaled to fill the page inside the margin, keeping its proportions,
so nothing is cropped and nothing is stretched. Only the picture is printed: no
toolbar, no panels, no background.

Choosing **Save as PDF** (or **Microsoft Print to PDF**) in the system dialog is
the quickest way to get a PDF of the document.

### DICOM (.dcm) medical images

A CT, MR, ultrasound or X-ray study is stored as DICOM, one file per slice. Open
`.dcm` (or `.dicom`) the same way as any other image; files written without an
extension at all are recognised by their contents.

A DICOM file holds measurements rather than screen colours, so the editor does
what a viewer does before it can show anything:

- **Rescale** — the slope and intercept in the file turn stored values into real
  units, such as Hounsfield numbers on a CT.
- **Window** — the centre and width in the file pick the slice of that range the
  screen shows. Files that name no window are windowed from their own data, so
  the whole range is visible; from there, 이미지 ▸ 밝기/대비 or Levels adjusts it
  the way a radiologist's window control would.
- **MONOCHROME1** files, where zero means white, are inverted to match.

Uncompressed studies — implicit and explicit VR, little and big endian — and
baseline JPEG are read. A study compressed with JPEG 2000, JPEG-LS or RLE is
named in the error rather than opened as a blank image. Colour (RGB) images,
such as an ultrasound capture, keep their colour; multi-frame files open at
their first frame.

Everything the file says about the patient, the study and the equipment is in
the image information window, described below. `images/test05.dcm` is a sample
CT slice you can open to try this — one of the DICOM standard's own
"CompressedSamples" study files, as redistributed for conformance testing.

Saving back to DICOM is not offered — the editor is a photo editor, and a slice
you have painted on is no longer a record of anything. Export to PNG or TIFF
instead.

### Image information

이미지 ▸ 이미지 정보, or the ⓘ button on the toolbar, opens a window with four
blocks of facts about what is open:

- **파일 / File** — the name it was opened from, where it lives on disk, the
  format and the size of the file.
- **이미지 / Image** — the pixel size, the megapixel count, the aspect ratio,
  the colour mode, how many layers there are and what the background is.
- **픽셀 / Pixels** — measured from the flattened document as it stands now, not
  from the file: the mean R, G and B, the mean brightness, the range from the
  darkest pixel to the lightest, and how much of the picture is fully or partly
  see-through. Watching the range while you work is the quickest way to see
  whether an adjustment has crushed the blacks or blown the highlights.
- **상세 정보 / Details** — whatever the file's own header carried. A photo from
  a camera shows its EXIF: the camera and lens, the date it was taken, the
  exposure, aperture, ISO and focal length, the metering and white balance. A
  PNG shows its bit depth and colour type. A DICOM shows its tags — modality,
  study and series, the patient, the equipment, the slice thickness and pixel
  spacing, the transfer syntax and the window that was applied. A file that
  carries nothing says so rather than showing invented values.

**내용 복사 / Copy details** puts the whole window on the clipboard as plain
text, which is what to paste into a note or a bug report.

The window reads the document as it is at the moment it opens, so close and
reopen it after an edit to see the new numbers.

## Settings, Help and About

The right-hand end of the menu bar holds the theme picker, the language switch
(Korean / English) and the Settings, Help and About windows.

Settings covers the language, the theme, the grid and rulers, the default export
format and its transparent-background setting, the brush size and the colour
tolerance. Each number has a decrease and an increase button, and each says what
it controls.

About lists the version, build time, commit, author, licence, the Electron and
Chromium versions and the platform — and copies all of it in one click, which is
the quickest way to describe your setup in a bug report.

## When something goes wrong

Any failure opens a window naming what was being done and showing the full
detail: the error, its stack, the document, the tool and the environment. The
text is selectable, and **내용 복사 / Copy details** puts all of it on the
clipboard.

## Keyboard

| Keys | Action |
| --- | --- |
| Ctrl/Cmd+N / O / S / Shift+S | New, Open, Save, Save As |
| Ctrl/Cmd+P | Open the print preview |
| Ctrl/Cmd+Z / Shift+Z or Y | Undo, Redo |
| Ctrl/Cmd+A / D | Select all, Deselect |
| Ctrl/Cmd+T | Free transform |
| Delete / Backspace | Clear the selected pixels |
| Enter | Apply a crop, a transform, or close a path or lasso |
| Esc | Cancel whatever is in progress |
| `[` `]` | Brush size |
| X | Swap the foreground and background colours |
| Space | Pan with any tool held |
