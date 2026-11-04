# MyPaint 10.0 User's Guide

> 한국어: [UsersGuide.md](UsersGuide.md)

## Installing

Run the setup file you downloaded. The installer speaks Korean and English; pick one on the
first screen. An older MyPaint is removed completely before the new one is copied, and if
saved settings or drawings are found the installer asks whether to delete them too. When it
finishes, `.mypaint` files (and older `.mpaint` ones) carry the MyPaint document icon and open in MyPaint.

## The start screen

MyPaint opens on cards over a moving 3D background. The **Start** button at the far left of the
menu bar opens and closes this screen, and the View menu has the same command.

- **Get Started**: create a new drawing or open a file
- **Recent files** and **Open Drawings**: click one to open it
- **Theme**: twenty light themes, twenty dark themes and your custom one
- **Start Screen Background**: twenty backgrounds, Shuffle (a new one every 20 seconds), motion speed
  (0–300%) and card opacity (20–100%)

Drag a card by the dots at its top left to move it and by its bottom right corner to resize it.
Auto Arrange restores the default layout. The Start screen tab in Settings also decides whether this
screen appears when MyPaint opens.

## Drawing

The tools are at the top of the left panel, six to a row.

- Pencil, brush, marker, spray, eraser and free curve draw while you drag.
- Line, arrow and curve go from the start point to the end point.
- Rectangle, rounded rectangle, ellipse, triangle, diamond, right triangle, pentagon, hexagon, star,
  heart, block arrow, cross, speech bubble and cloud take their size from the drag. The ten from
  diamond to cloud are in the left panel only, not in the Draw menu.
- Fill changes the colour of a shape or of the canvas, and the picker takes the colour under the
  pointer.

The swatches hold twenty basic colours and twenty pastels, or set the line and fill colours directly.
The pictures below them set the line width. − and + step it by one, and the px field takes a number
you type. With the eraser selected, the same controls set the eraser size. With a drawing tool in
hand, the colour and width you choose are for the next shape you draw.

## Text

The text tool lets you type where you click, and the right panel can edit that text too. The toolbar
sets the font and steps the size with −, the current size and +. B, I, U and S turn on bold, italic,
underline and strikethrough. The font and size are also in the menu you get by right-clicking the text.

- While typing, a change applies from the caret onward, to what you type next.
- Drag over some characters first and it applies to those characters only.
- Select the whole text shape with the Select tool and B, I, U or S turns that one style on or off
  for all of it, leaving the others as they are. A button shows lit only when all of the text has
  that style.
- A style given to text stays with that text and does not change the default for the next one. Set
  the default in the Font tab of Settings.

## Selecting, moving and resizing shapes

With the Select tool, clicking a shape lets the right panel edit its colour, width, opacity, position
and size. Delete removes it. Pressing the Select tool button again clears both the selected shapes
and any picked area.

Select one shape or text and handles appear at its four corners and four sides. Drag a handle to
resize it and drag inside it to move it. Resizing text changes its font size with it. The Width and
Height fields in the right panel take numbers too.

To select several:

- Drag a box from an empty spot: only the shapes wholly inside it are selected.
- Hold Shift or Ctrl and click to add or remove one at a time.
- Drag inside the group's box to move them all. A click without dragging keeps only the one under the
  pointer, and a click on an empty spot clears the selection.

Selected shapes and text take a new colour at once from the swatches, the line and fill colours, no
fill, and the colours in the right panel. The line width controls on the left show and change the
width of the selection too. While typing, a colour applies at the caret or to the selected characters.
The "Color and line width" window only sets the values for the next shape.

## Line looks and arrows

Select a line or a shape with the Select tool and the right panel offers its looks as buttons.

| Item | For | Choices |
|------|-----|---------|
| Corners | line, curve, free curve, pencil, brush | Round, Angular, Angular with ends extended. The ends and the bends change together |
| Corners | closed shapes except the ellipse | Round, Sharp, Bevel |
| Line style | lines and closed shapes | Solid, Dashed, Dotted, Dash-dot |
| Start, End | arrow | None, Triangle, Open arrow, Diamond, Circle, Bar |
| Head size | arrow | 50–300% |

## Picking an area and cutting it out

The rectangle, ellipse, free and pixel select tools pick part of the picture. The picked area is
outlined with a dashed line and the right panel names its shape and size.

- **Keep only the picked area** cuts everything else away. With an ellipse or a free outline,
  what falls outside stays transparent.
- **Erase the picked area** paints it with the canvas colour.
- Ctrl+C copies the picked area, Ctrl+X copies and clears it, Ctrl+V pastes it back.
- The copied area also goes onto the system clipboard as a PNG, so it can be pasted into any
  other program.

## Changing pixels

Pixel select picks exactly one pixel with a click, and every pixel it touches with a drag. With no
shape selected, click a swatch or set Pixel color in the right panel and only those pixels change. An
area picked with the rectangle, ellipse or free select tool behaves the same way. The changed pixels
live on a layer of their own above the shapes, so the shapes underneath are untouched; the change can
be undone and is kept when you save.

## Effects

Effects sit below Properties in the right panel. The top of the section says where they apply.

| Selected | Applies to |
|----------|------------|
| Shapes or text | only the selected shapes and text |
| An area | only the pixels of that area |
| Nothing | the whole picture |

- Eight looks: None, Gray, Sepia, Invert, Warm, Cool, Vivid, Faded
- Adjustments: brightness, contrast, saturation, blur
- Border: a width for the top, bottom, left and right, and a colour
- Shadow: on or off, across, down, softness, strength, colour, backdrop, clear backdrop
- Pick a color: choose the border, shadow or backdrop, drag on the round wheel, and set the value beside it

**Reset effects** clears only what is selected: the selected shapes; for an area, the shapes it
touches and the pieces lifted out for effects; with nothing selected, only the effects of the whole
picture.

Effects show at once, can be undone and are kept in the `.mypaint` file. Exported pictures, SVG and
printing all have them as the screen shows them.

- Picture formats: the effects go into the pixels.
- SVG: the effects go in as SVG filters, so shapes stay vectors. A program that cannot draw filters may
  show the file without them.
- Printing: both the preview and the print have them. A border and shadow of the whole picture make it
  larger, and that larger picture is what is fitted to the paper or split. With the canvas colour not
  printed, the picture's background and the shadow's backdrop are left out while the border and shadow stay.

## Tabs

Several drawings stay open as tabs. The × on a tab closes that one, and a tab with unsaved
work asks first. When there are more tabs than fit, the `<` and `>` buttons on the right move
through them.

## Moving and zooming the picture

A picture smaller than the window sits in the middle. Dragging beside the picture shows a hand
and moves it. Zooming works from the middle of the view, so whatever you were looking at stays
where it was.

The zoom runs from 25% to 400% in thirty-seven steps. Each one changes the picture by about a
twelfth, so a click feels the same whether the picture is small or large, and 25, 50, 100, 200
and 400% are all steps of their own. Clicking the percentage in the toolbar goes back to 100%.

Ctrl and the wheel zoom by however far the wheel was turned: one notch of a mouse wheel matches
one click of the button, while a trackpad follows two fingers a per cent at a time.

New drawing (Ctrl+N) asks for the width and height. The fields start with the size set in
Settings, and Create opens a blank drawing at the size you leave there.

## Grid, rulers and panels

The grid button on the toolbar, also in the View menu, turns a faint grid on and off. It is drawn at
the very bottom, so it never covers shapes or pictures, and an opaque photograph hides it. It scales
with the zoom. When a cell reaches 30 pixels on screen it splits into another 5×5, and when it gets
smaller than 6 pixels five cells join into one. Whether it is on is remembered for the next run, and
it never goes into a saved picture.

The rulers show pixel marks along the top and left of the canvas, with the pointer position marked by
a red line.

The shape list button shows or hides the shape list in the left panel. Hiding the list leaves the
shapes on the canvas, and selecting or drawing them still works. Picking a shape in the list switches
to the Select tool.

Drag the separator beside the left or right panel to change its width; the width is remembered for
the next run. Double-click a separator to return to the minimum, or focus it and use the arrow keys.
The left panel goes down to 200 pixels and the right to 240, and both up to 480. The panels fold and
open from the button beside the title or the panel buttons on the toolbar.

Shrinking the window to its minimum does not cut off or overlap the toolbar buttons. Point at a button
and its name appears at once.

## Undo and the clipboard

Ctrl+Z undoes, Ctrl+Y redoes. Ctrl+C, Ctrl+V and Ctrl+X copy, paste and cut; Ctrl+A selects
everything. Ctrl+O opens, Ctrl+S saves, Ctrl+P prints, Ctrl++ and Ctrl+- zoom, and Ctrl+0
returns to 100%. The same keys work while a Korean input language is selected. The right
mouse button offers the same commands.

Copying and cutting put a picture on the system clipboard as well as the shapes MyPaint keeps
for itself, so what was copied can be pasted straight into another program — Paint, Word, a
chat window — while pasting inside MyPaint still brings the shapes back. With an ellipse or a
free outline, what falls outside the picked area is transparent.

## Photographs and image files

Drop an image file from outside the program onto the window and MyPaint always asks first how to use it.

- **Open it as a new drawing**: opens it in a new tab.
- **Put it into the picture being edited**: it goes into the current picture as an image shape.
  Dropped on the canvas, this choice is already marked and the picture lands where you dropped it. One
  larger than the canvas is shrunk to fit.
- **Use it as the window background**: makes it the background of the workspace.

A picture put in stays selected, ready to move or resize. Dropping several files at once asks once and
treats them all alike; put into the picture, each lands slightly offset from the one before.

It reads the formats below. Help → Supported formats has the full list.

- Common images: PNG, JPEG, GIF, WebP, BMP, ICO, AVIF
- TIFF: every page, 8–16 bit, LZW / PackBits / Deflate / JPEG
- HEIC/HEIF from recent phones. A file holding several pictures opens at the one it calls its
  primary image — the whole tiled photograph, or the turned or cropped version — and the rest
  are reached with `<` and `>`. An image sequence (`.heics`) cannot be opened, and MyPaint says so.
- JPEG 2000: `.jp2`, `.j2k`
- SVG: the source can be edited as text in the right panel (see Editing SVG).
- Camera RAW: Canon `.cr2` `.cr3`, Nikon `.nef` `.nrw`, Sony `.arw` `.sr2`, Fujifilm `.raf`,
  Olympus `.orf`, Panasonic `.rw2`, Pentax `.pef`, Samsung `.srw`, Sigma `.x3f`,
  Hasselblad `.3fr`, Phase One `.iiq`, Adobe `.dng` and more than thirty others. MyPaint
  shows the full-size picture the camera stored inside the file and lists the camera and
  lens in the right panel.
- DICOM medical images: `.dcm`, `.dicom`

A TIFF with several pages, and a HEIC holding more than one picture, step through them with the
`<` and `>` buttons in the right panel.

## Downloading from a link

"Download a picture from a link" in the File menu takes an address and opens what comes back.
While it downloads, the bar shows how much has arrived out of the total, and the cancel button
stops it part way. What was downloaded joins the recent list with its address.

## Exporting to another format

The export button, or Export in the File menu, asks for a format and a quality: PNG, JPEG, WebP, BMP,
TIFF, GIF, ICO, JPEG 2000 (.jp2 / .j2k), DICOM (.dcm), TGA, PPM, PAM, QOI, PCX, SVG and so on. Whatever
is on screen — a drawing, a photograph or a medical image — is what gets converted. "Export straight
to PNG" in the File menu writes a PNG without asking.

The same window sets the border per side and the shadow of the whole picture. These are the values
Effects in the right panel shows when nothing is selected, and the saved picture grows by them. With a
clear backdrop, formats that can show through outside the shadow; formats that cannot get the backdrop
colour.

SVG writes the shapes you drew as vectors, and photographs as images inside the file. A picture opened
from an SVG file gets the drawn shapes after its source. Effects go in as SVG filters.

There is no HEIC or HEIF export. HEVC is patent-encumbered, and no browser and no WebAssembly
package available here can encode it. Reading HEIC works.

## Editing SVG

Opening an `.svg` file draws it on the canvas, and the **SVG source** box below Properties in the right
panel shows the file as text, with its size, viewBox and element count above it.

- Edit colours, coordinates, text and so on in the box, and the canvas redraws when you pause typing.
  Changing `width` and `height` changes the canvas size too.
- If the source has an error, the panel says where above the box, and the last picture and source that
  drew are kept. Saving at that moment writes the source that drew.
- Save (Ctrl+S) writes the edited source back as an `.svg` file. Use Export for any other format.
- Inside the box, Ctrl+Z undoes your typing. Undo on the toolbar takes back all the edits of one stay in
  the box at once, and the picture comes back with them.
- The SVG picture itself cannot be selected or moved with the Select tool. Change it in the source.
- Shapes drawn on top stay MyPaint shapes and edit as usual. Saving as SVG adds them at the end of the
  source as a `mypaint-shapes` group, and they become part of the source when that file is opened again.
- Changing the canvas width or height in the right panel changes the size in the source too, and the
  picture scales through its viewBox.
- Keep only the picked area, Erase the picked area and Clear the drawing turn the picture into pixels, and the
  source box goes away. Undo brings it back.
- Saving as `.mypaint` keeps the source too, so you can open it again and keep editing.
- Saving as SVG with effects on the whole picture wraps the source in an outer `<svg>`. The source box you
  are editing does not change, but when that file is opened again the wrapped text is the source, with the
  effects inside it.

## Medical images (DICOM)

Opening a DICOM file adds a medical image panel on the right.

- **Frame**: files with several frames step with `<` and `>`, and the ▶ button plays them.
- **Preset**: CT files offer brain, subdural, stroke, soft tissue, liver, mediastinum, lung
  and bone. "From the file" uses the window written in the file and "Automatic" fits the
  window to the image.
- **Centre (WC) / Width (WW)**: typed in directly.
- **Colour map**: gray, hotiron, pet, hotmetalblue, pet20, jet, rainbow, bone.
- **Invert grey**, **Show overlays**, **VOI LUT**, **Window function** (LINEAR, LINEAR_EXACT,
  SIGMOID). A colour or palette scan has no window to set, so only the inversion is offered.
- **DICOM details**: the patient, study and image summary, and every tag in the file, paged
  with `<` and `>`.

Measuring uses the ordinary drawing tools. Draw a line and the right panel gives its length in
millimetres; draw a rectangle or an ellipse and it gives the mean, standard deviation,
minimum, maximum and area inside it. Moving the pointer over the image reads the value under
it in Hounsfield units.

## Saving and printing

Save writes a `.mypaint` drawing, with every shape kept as a shape for further editing. Up to ten
recent files are kept and can be removed one at a time or all at once. The folders you opened and
saved into come back on the next run.

The print window puts the settings on the left and the preview on the right. The preview is
the sheet that will come out of the printer, with a dashed line marking the printable area
inside the margins.

The settings are the scope (all drawings, the current one, or a page range), the paper (A3,
A4, A5, B4, B5, Letter, Legal, Tabloid), the orientation, the top, bottom, left and right
margins, the scaling (fit to the paper, actual size, or a percentage), the vertical place on
the sheet, the number of copies, and whether the canvas colour is printed. The resulting
printable area is shown in millimetres. A drawing too large for one sheet is split over
several. Effects print as the screen shows them.

## Appearance

The settings button changes the language, theme, font, the size of new drawings, the workspace
background image, which panels are shown, and the start screen. There are twenty light themes, twenty
dark ones and one you define yourself; the colour wheel button on the toolbar picks one directly.
Closing the window with unsaved changes asks what to do with them.
