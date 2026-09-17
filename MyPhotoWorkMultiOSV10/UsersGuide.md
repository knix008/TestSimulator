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
- With the slice-select tool, a single slice can be exported on its own

Unsaved changes are confirmed before New, Open, Close, or quitting.

## Settings, Help and About

The right-hand end of the menu bar holds the theme picker, the language switch
(Korean / English) and the Settings, Help and About windows.

Settings covers the language, the theme, the grid and rulers, the default export
format, the brush size and the colour tolerance. Each number has a decrease and
an increase button, and each says what it controls.

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
| Ctrl/Cmd+Z / Shift+Z or Y | Undo, Redo |
| Ctrl/Cmd+A / D | Select all, Deselect |
| Ctrl/Cmd+T | Free transform |
| Delete / Backspace | Clear the selected pixels |
| Enter | Apply a crop, a transform, or close a path or lasso |
| Esc | Cancel whatever is in progress |
| `[` `]` | Brush size |
| X | Swap the foreground and background colours |
| Space | Pan with any tool held |
