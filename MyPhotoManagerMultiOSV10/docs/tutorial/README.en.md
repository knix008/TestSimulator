# MyPhotoManager tutorial

This document follows the in-app **Tutorial** step by step, with a screenshot of each step taken from the real app (`node scripts/tutorial-capture.mjs docs` makes them again).

## Running the tutorial

- **Start page › Ways to begin › Tutorial**, or **Help › Tutorial**.
- In the card at the bottom right: **Next / Previous** one step at a time, **Auto play** to the end, the list at the top to jump to a chapter, **✕** to stop at any time.
- The tutorial works only in a sample folder, `tutorial-photos` in the app data folder. Your photos are not changed, and the theme, language and view settings it changes are put back when it ends.
- A recording of the whole tour: `MyPhotoManager-Tutorial.mp4` in the project root.

## Contents

1. [Start page](#ch-start)
2. [Managing photos](#ch-manage)
3. [Viewing](#ch-view)
4. [Editing](#ch-edit)
5. [Creating and tools](#ch-create)
6. [Dashboard and settings](#ch-settings)

<a id="ch-start"></a>

## 1. Start page

### 1. Welcome to MyPhotoManager

This tutorial works the app for you and shows its features one by one. It only uses a folder of sample photos made for the tutorial, so your own photos are never changed. Use Next for one step at a time, Auto play to watch it all, or the list above to jump to a chapter.

![Welcome to MyPhotoManager](images/01-welcome.jpg)

### 2. Ways to begin

Open a folder or files, import from a camera, phone or scanner, start a slideshow, change settings or look up shortcuts. Recently opened folders are listed below.

![Ways to begin](images/02-begin.jpg)

### 3. Task shortcuts

One click to the manage, view, edit and dashboard modes, search, calendar, people, map, print, compare, duplicates, panorama, GIF, PDF, HDR, batch rename and auto-organize.

![Task shortcuts](images/03-tasks.jpg)

<a id="ch-manage"></a>

## 2. Managing photos

### 4. A folder and its thumbnails

The tutorial folder is open: photos, a video, DICOM files and an animated GIF show as thumbnails. Thumbnails are made in the background and appear at once next time.

![A folder and its thumbnails](images/04-folder.jpg)

### 5. View styles

Thumbnails, tiles, list, details (sortable columns) and filmstrip — from the toolbar buttons or View › View style.

![View styles](images/05-viewStyles.jpg)

### 6. Select, rate, label, tag

A photo is selected and got 5 stars, a colour label and a tag. Keys 1–5, Ctrl+6–9 and Space do the same. These live in the catalogue and drive search and filters.

![Select, rate, label, tag](images/06-select.jpg)

### 7. Sort, group, filter

Sort by name, date, size or rating, group by date or type, and filter by rating, label or type — on the toolbar and in the View menu.

![Sort, group, filter](images/07-sortFilter.jpg)

### 8. Folder tree

The folder tree on the left moves between drives and folders. Drag and drop to copy or move, make new folders, rename.

![Folder tree](images/08-folders.jpg)

### 9. Catalogue and collections

Browse by rating, label, tag and keyword, and keep your own collections and smart collections that fill themselves by rules.

![Catalogue and collections](images/09-catalog.jpg)

### 10. Calendar

Find photos by the day they were taken; click a day to see just that day.

![Calendar](images/10-calendar.jpg)

### 11. People

Faces are found; name one and the same person is suggested on other photos. Photos can be gathered per person.

![People](images/11-people.jpg)

### 12. Search

Search by name, date range, camera, rating, label, keyword or auto-classification; save searches you use often.

![Search](images/12-search.jpg)

### 13. Properties and metadata

The right pane shows file details and EXIF (camera, exposure, GPS); values can be edited and written back to the file.

![Properties and metadata](images/13-properties.jpg)

### 14. Preview

A large preview of the selected photo, handy with the histogram for a quick exposure check.

![Preview](images/14-preview.jpg)

### 15. Map

Photos with GPS show on the map. Add locations by hand or match them from a GPX track.

![Map](images/15-map.jpg)

### 16. Basket

Gather photos from several folders in the basket, then copy, print or create from all of them at once.

![Basket](images/16-basket.jpg)

<a id="ch-view"></a>

## 3. Viewing

### 17. Viewing a photo

One photo, large. ← → for the previous and next photo, Esc back to managing. The toolbar has zoom, rotate, edit, slideshow and delete.

![Viewing a photo](images/17-viewer.jpg)

### 18. Zoom and navigator

Zoom with the wheel, + / − or a double click. Zoomed in, the navigator shows where you are; zoom lock (Z) keeps the zoom for the next photo.

![Zoom and navigator](images/18-zoom.jpg)

### 19. Information and histogram

Turn on the information pane (I) and the histogram (H) to see the shot details and the brightness spread. The loupe (L) magnifies one spot.

![Information and histogram](images/19-overlays.jpg)

### 20. Filmstrip

The filmstrip below picks any other photo of the folder; ◀ ▶ at its ends page through it.

![Filmstrip](images/20-filmstrip.jpg)

### 21. Animated GIF

Animated GIF, APNG and WebP play like a video: play / pause, stop (back to the start) and previous / next frame. Space plays and pauses too.

![Animated GIF](images/21-gif.jpg)

### 22. Video

Videos have the same buttons and show the time. Choose loop, sound, speed and fit, save the current frame as a photo, or trim the part you need.

![Video](images/22-video.jpg)

### 23. DICOM medical images

DICOM brings window / level, colour maps, invert, rulers, grid and scale bar, and distance, angle, Cobb angle, rectangle and ellipse measurements. Select a measurement and press Del or right-click to delete it.

![DICOM medical images](images/23-dicom.jpg)

### 24. DICOM cine

Multi-frame DICOM plays as a cine: loop, back and forth or once, frames per second, stop (back to the first frame). Measurements and rulers stay on top while it plays. Export as a video or as frames.

![DICOM cine](images/24-cine.jpg)

<a id="ch-edit"></a>

## 4. Editing

### 25. The editor

Edits are saved as settings next to a kept original, so a photo can be re-edited later without losing quality. Adjustments on the left, the preview in the middle, information on the right.

![The editor](images/25-editor.jpg)

### 26. Light

Exposure, brightness, contrast, highlights, shadows, whites, blacks and dehaze. Auto sets them in one go; double-click a slider to reset it.

![Light](images/26-light.jpg)

### 27. Colour

Temperature, tint, saturation, vibrance and hue. Pick white balance with the dropper; the colour wheels above tint shadows, midtones and highlights separately.

![Colour](images/27-color.jpg)

### 28. Effect presets

The Presets button on the toolbar opens 189 effect presets in 17 categories — film, black & white, portrait, landscape, colour grading … — each with a preview of this photo. One click applies it.

![Effect presets](images/28-looks.jpg)

### 29. Preset strength and fine-tuning

Change an applied preset's strength (0–150 %) and fine-tune every value it set with its own slider. Remove look resets only the preset's values and keeps your other edits.

![Preset strength and fine-tuning](images/29-lookTune.jpg)

### 30. Crop and rotate

Crop to a ratio, straighten, rotate by 90° and flip. Resize and canvas size are here too.

![Crop and rotate](images/30-geometry.jpg)

### 31. Effects

Basic effects like black & white or sepia, vignette, film grain, pixelate, a stack of special effects (oil paint, sketch, cartoon …) and tilt-shift miniature.

![Effects](images/31-effects.jpg)

### 32. Local adjustments

Change light and colour in part of the photo with gradient, radial, brush, lasso, magic wand and colour-range masks. Red-eye, heal, clone and erase are here as well.

![Local adjustments](images/32-local.jpg)

### 33. Text and drawing

Add text, a border or a watermark, and draw arrows, rectangles and free lines.

![Text and drawing](images/33-textDraw.jpg)

### 34. Layers

Put other photos on top as layers with blend modes, opacity and masks; adjustment layers correct only part of the picture.

![Layers](images/34-layers.jpg)

### 35. History

Every edit step is listed; click one to go back to it. Ctrl+Z / Ctrl+Y undo and redo.

![History](images/35-history.jpg)

### 36. Before / after

Before / after (B) switches between the original and the result.

![Before / after](images/36-beforeAfter.jpg)

### 37. Saving

Saving keeps the original aside and remembers the settings. Save as writes a new file in another format and quality — JPEG, PNG, WebP, AVIF, TIFF and more.

![Saving](images/37-save.jpg)

<a id="ch-create"></a>

## 5. Creating and tools

### 38. Slideshow

Pick transitions, timing and background music and watch; make a WebM video or an HTML file of it to share.

![Slideshow](images/38-slideshow.jpg)

### 39. Compare

Put similar photos side by side, zoom and pan them together, and pick the best one.

![Compare](images/39-compare.jpg)

### 40. Duplicates

Finds identical and near-identical photos, groups them, and lets you choose what to keep and what to delete.

![Duplicates](images/40-duplicates.jpg)

### 41. Create an animated GIF

Make an animated GIF of the selected photos; set the size, frame time, looping and colours.

![Create an animated GIF](images/41-createGif.jpg)

### 42. Create a PDF

Collect photos into a PDF, one or several per page, with paper size and margins.

![Create a PDF](images/42-createPdf.jpg)

### 43. Panorama and HDR

Stitch overlapping shots into a panorama, merge different exposures into HDR, and different focus points into a focus stack.

![Panorama and HDR](images/43-panorama.jpg)

### 44. Batch rename

Rename many files at once from numbers, dates, the old name and EXIF values, with a preview before anything changes.

![Batch rename](images/44-batch.jpg)

### 45. Batch resize and convert

Resize many photos or convert them to another format in one go. Auto adjust, rotate, fix dates and apply a preset to many photos work the same way.

![Batch resize and convert](images/45-resize.jpg)

### 46. Watermark

Put a text or logo watermark on many photos at the same place, size and opacity.

![Watermark](images/46-watermark.jpg)

### 47. Image analysis and auto-organize

Photos are analysed in the background and get categories like people, landscape, food or document; organize them into folders by category.

![Image analysis and auto-organize](images/47-analysis.jpg)

### 48. Print

Several photos per page, contact sheets, paper, margins and captions — preview, then print or save as PDF.

![Print](images/48-print.jpg)

<a id="ch-settings"></a>

## 6. Dashboard and settings

### 49. Dashboard

Charts of the folder: number of photos, dates taken, cameras and lenses, formats and ratings.

![Dashboard](images/49-dashboard.jpg)

### 50. Settings

Tabs for general, view, video, editing, thumbnails, themes and more. Saved settings apply at once.

![Settings](images/50-settings.jpg)

### 51. Themes

Choose from 20 light and 20 dark themes, follow the system, or make your own — top right. The start page landscape follows the theme colours.

![Themes](images/51-theme.jpg)

### 52. Language

The flag button switches between Korean and English; menus and dialogs follow at once.

![Language](images/52-language.jpg)

### 53. Shortcuts

F1 lists the shortcuts; Help › Customize shortcuts assigns your own keys.

![Shortcuts](images/53-shortcuts.jpg)

### 54. You finished the tutorial

Now open a folder of your own photos. The tutorial is always on the start page and in the Help menu, and can start from any chapter.

![You finished the tutorial](images/54-done.jpg)

