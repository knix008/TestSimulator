# MyPaint 10.0 User's Guide

> 한국어: [UsersGuide.md](UsersGuide.md)

## Installing

Run the setup file you downloaded. The installer speaks Korean and English; pick one on the
first screen. An older MyPaint is removed completely before the new one is copied, and if
saved settings or drawings are found the installer asks whether to delete them too. When it
finishes, `.mypaint` files (and older `.mpaint` ones) carry the MyPaint document icon and open in MyPaint.

## Drawing

The tools are at the top of the left panel. Pencil, brush, marker, spray and the eraser draw while you
drag; line, arrow, curve, rectangle, rounded rectangle, ellipse and triangle take their size
from the drag. The text tool lets you type where you click, and the right panel can
edit that text too. The toolbar sets the font and steps the size with −, the current
size and +. B, I, U and S turn on bold, italic, underline and strikethrough. The font and
size are also in the menu you get by right-clicking the text. Fill changes the colour of a shape or of the canvas, and the picker takes
the colour under the pointer.

Pick colours from the swatches, or set the line and fill colours directly. The pictures
below them set the line width. − and + step it by one, and the px field takes a number you type. With the eraser selected, the same controls set the eraser size. Both panels keep one width, and they fold and
open from the button beside the title. With the select tool, clicking a shape shows its
colour, width, opacity and position in the right panel, dragging moves it, and Delete
removes it.

## Picking an area and cutting it out

The rectangle, ellipse and free select tools pick part of the picture. The picked area is
outlined with a dashed line and the right panel names its shape and size.

- **Keep only the picked area** cuts everything else away. With an ellipse or a free outline,
  what falls outside stays transparent.
- **Erase the picked area** paints it with the canvas colour.
- Ctrl+C copies the picked area, Ctrl+X copies and clears it, Ctrl+V pastes it back.
- The copied area also goes onto the system clipboard as a PNG, so it can be pasted into any
  other program.

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

The grid button on the toolbar, also in the View menu, draws a grid over the picture. The
cells stay 32 pixels apart on screen, so zooming in or out does not make them larger or
denser. The grid sits on the picture only, and drawing or picking an area still works through
it. Whether it is on is remembered for the next run. The shape list button beside it shows
or hides the shape list in the left panel. Hiding the list leaves the shapes on the canvas,
and selecting or drawing them still works.

New drawing (Ctrl+N) asks for the width and height. The fields start with the size set in
Settings, and Create opens a blank drawing at the size you leave there.

Shrinking the window to its minimum does not cut off or overlap the toolbar buttons.

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

Drop an image file from outside the program onto the window and MyPaint asks whether to
open it as a new drawing, place it in the current one, or use it as the workspace background.
It reads:

- Common images: PNG, JPEG, GIF, WebP, BMP, ICO, AVIF
- TIFF: every page, 8–16 bit, LZW / PackBits / Deflate / JPEG
- HEIC/HEIF from recent phones. A file holding several pictures opens at the one it calls its
  primary image — the whole tiled photograph, or the turned or cropped version — and the rest
  are reached with `<` and `>`. An image sequence (`.heics`) cannot be opened, and MyPaint says so.
- JPEG 2000: `.jp2`, `.j2k`
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

## Saving in another format

"Convert to another format" in the File menu writes PNG, JPEG, WebP, BMP, TIFF, GIF, ICO,
JPEG 2000 (.jp2 / .j2k) or DICOM (.dcm), with a quality setting. Whatever is on screen — a
drawing, a photograph or a medical image — is what gets converted.

There is no HEIC or HEIF export. HEVC is patent-encumbered, and no browser and no WebAssembly
package available here can encode it. Reading HEIC works.

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

Save writes a `.mypaint` drawing. The export button asks for a format and a quality; "Export
straight to PNG" in the File menu writes a PNG without asking. Up to ten recent files
are kept and can be removed one at a time or all at once. The folders you opened and saved
into come back on the next run.

The print window puts the settings on the left and the preview on the right. The preview is
the sheet that will come out of the printer, with a dashed line marking the printable area
inside the margins.

The settings are the scope (all drawings, the current one, or a page range), the paper (A3,
A4, A5, B4, B5, Letter, Legal, Tabloid), the orientation, the top, bottom, left and right
margins, the scaling (fit to the paper, actual size, or a percentage), the vertical place on
the sheet, the number of copies, and whether the canvas colour is printed. The resulting
printable area is shown in millimetres. A drawing too large for one sheet is split over
several.

## Appearance

The settings button changes the language, theme, font, the size of new drawings, the workspace
background image and which panels are shown. There are twenty light themes, twenty dark ones
and one you define yourself. Ctrl and the mouse wheel zoom. Closing the window with unsaved
changes asks what to do with them.
