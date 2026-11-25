# MyImageViewer User Guide

MyImageViewer opens photos, drawings, video, audio and DICOM medical images, and edits still images. This page explains each part of the window.

## The guide window

This guide opens in a window of its own from **Help › User guide** (`F1`). It moves separately from the main window, and you can keep using the program while it is open. It can be minimised, maximised and resized; the text follows the window.

![The guide window](help/guide.jpg)

- Click a title in the **contents** on the left to jump to that section.
- **한국어 / English**: shows the guide alone in the other language; the program's language stays. The window starts in the program's language each time it opens.
- **Text size − / +**: from 10 to 24 px; ↺ is the normal size. `Ctrl+−` / `Ctrl++` / `Ctrl+0` and `Ctrl`+wheel work too. The size is remembered.
- **Print** (`Ctrl+P`): prints the guide on A4 in the language and text size shown, pictures included, black on white.
- Its colours follow the main window's theme. Change the theme there and an open guide window changes with it.

## Home

Until you open a file or a folder, **Home** fills the window: cards on a landscape. Each card starts that task.

![Home](help/home.jpg)

- **Open Folder** shows that folder in the explorer.
- **Open File** picks an image, video, audio file or DICOM study.
- **Start** takes a whole row; under it **Recent & Favorites** (recent files and favorites) and **Recent folders** share one row. Click a name to open it again.
- Clearing: the **×** at the right of an entry forgets that entry, the 🗑 on a list title clears that list, the 🗑 on a card title clears the whole card (Recent & Favorites asks once, then clears recent files and favorites together). The folders and files themselves are never deleted.
- Cards that need a picture (edit, print, resize, background removal, details) ask you to open one first. The status bar says so when there is nothing to edit.

The program-name card stays across the top and cannot be moved or resized. The other cards can. Drag a card by the **three lines (☰)** left of its title to move it; the other cards make room. Drag its bottom-right corner to resize it, and double-click that corner to fit it to its content again. **Auto arrange** (top right) puts every card back. Your layout is kept for next time. The background starts as the chosen scene's last picture and changes to the live 3D scene once it is ready.

The **Background** card picks one of 27 3D scenes (valley, ocean, aurora, stars, rain, snow, dusk, forest, dunes, city, nebula, bokeh, grid, ribbons, embers, lake, sunrise, fireflies, geometry, ink, petals, mountains, canyon, autumn, glacier, meadow, galaxy). Each button shows its icon and name on one line. One row under them holds, from the left:

- **Change the background automatically**: when on, the next scene follows every so many seconds (5–3600).
- **Background transparency**: how far the scene fades (0–100 %).
- **Overall speed**: how fast the camera, objects and sky move (0 holds still).

The same values are in **Settings › General**, and the two stay in step.

**Home** on the menu bar returns here at any time. The file you already opened stays loaded. If Settings says to reopen the last folder and file at startup, the next launch skips Home and opens that file. Double-clicking a file to start the app does the same.

## Window and menu bar

There is no title bar. What used to sit there is on the menu bar.

| Place | What you see |
|-------|----------------|
| Left | Icon, **MyImageViewer**, version (and build number when there is one) |
| Middle | **Home**, then **File · Edit · View · Window · Help** |
| File name | The open file. A ● means unsaved changes |
| Right | Three panel buttons (fold / unfold the left, bottom and right panels), minimise, maximise/restore, close |

The panel buttons sit just left of minimise, in the order **left panel · bottom panel · right panel**. The bottom panel is the strip of the folder's pictures (the filmstrip) under the picture you are viewing; fold it and the picture gets that room. All three are remembered.

Drag the empty menu bar or the program name to move the window. Buttons do not drag. `F11` toggles fullscreen. Closing with unsaved changes asks Save, Don't Save or Cancel.

The **Help** menu contains **User guide**, **Keyboard Shortcuts** and **About**. User guide opens this guide in its own window, and so does `F1`. Shortcuts and About each open their own window.

Menus and right-click menus may extend past the edge of the window, so nothing is cut off. Every menu item has an icon. A ticked item keeps its icon and shows ✓ at the right. Click outside a menu or press `Esc` to close it.

Dialogs (Settings, About, Print, Resize, Details, Keyboard Shortcuts, confirmations) open as windows of their own. Drag one by its title to move it anywhere on the screen, even past the main window. The main window waits behind it until you close the dialog. The **×** at the top right turns red under the mouse. Keyboard Shortcuts lists its keys in two columns, so all of them show without scrolling. Every dialog button has an icon before its label (OK ✓, Cancel ✕, Browse 📂, Default ↺, Delete 🗑 …); a button that cannot act right now is shown faded.

## File menu

- **Open File** (`Ctrl+O`) picks one file and points the explorer and previous/next list at its folder.
- **Open Folder** (`Ctrl+Shift+O`) picks a folder. Hovering the command shows recent folders. × on a row forgets that one folder.
- **Save As** (`Ctrl+Shift+S`) writes the edited picture to a new file. JPEG and WebP ask for a quality.
- **Export** writes the picture you see (rotation, colour, DICOM window) as PNG, JPEG, WebP or BMP.
- **Print** (`Ctrl+P`) opens print preview. It stays off for video, audio and the contact sheet.
- **Details** (`Ctrl+I`) tables the name, path, size, format, pixel size, EXIF and DICOM tags. Copy all copies the tables.
- **Show in Explorer** and **Delete** exist on the desktop app. Delete asks first, then removes the file.
- **Exit** closes the window.

You can also drop a file or folder onto the window. A folder opens; a file opens in the viewer. Dropped onto a folder in the explorer, or onto the thumbnail sheet, the files go into that folder instead: the same drive moves them, another drive copies them.

### Supported formats

- **Shown as they are**: JPEG (.jpg .jpeg .jpe .jfif), PNG / APNG, GIF (animated too), BMP, WebP, AVIF, SVG, ICO
- **Converted by the program** (desktop): TIFF, HEIC / HEIF, **JPEG XL** (.jxl), **JPEG 2000** (.jp2 .j2k .jpf .jpx), **Photoshop** (.psd, the merged picture), TGA, DDS (compressed BC1–BC7 textures too), Radiance HDR, OpenEXR, Netpbm (.pbm .pgm .ppm .pnm .pam), QOI, Farbfeld, PCX, Apple icons (.icns)
- **Camera RAW**: DNG, CR2, CR3, CRW, NEF, NRW, ARW, SRF, SR2, ORF, RW2, RAF, PEF, SRW, X3F, 3FR, IIQ, MOS, MRW, ERF, KDC, DCR, RWL — shows the **full-size preview (JPEG)** the camera stores inside the file; the raw data is not developed.
- **Medical**: DICOM (.dcm .dicom)

All of them work the same in the explorer, thumbnails, previous / next, file information, the edit window and printing.

## Explorer

The left side is the **explorer** and **file info**. Drive buttons (`C:`, `D:`, …) switch disks. A folder expands; an image opens in the viewer.

Each format has its own icon colour: JPEG orange, PNG green, GIF purple, DICOM red, and separate colours for video and audio. Folders are gold.

The collapse button on the panel title, or the left-panel button on the toolbar, folds the explorer into a vertical rail (icon and title). Drag the splitter to resize it.

**File info** under the tree shows size, format, modified time and, for a picture, pixel size. Camera, lens, exposure and GPS appear when the file has them.

In the browser (`npm run web`) you only see folders the browser was allowed to read. Rename, delete and Show in Explorer are desktop-only.

At startup the last folder you opened appears as a thumbnail sheet, with the last picture selected. When the start screen is set to show at startup, it comes first with its background scene and the folder waits behind it; when it is not, the folder shows straight away. With no saved settings, your home folder opens. Explorer, the first card of What you can do, goes to that main view. Several copies of the program can run at once. If that folder is gone, the newest recent folder that still exists opens instead. Settings › General can turn this off.

## Viewing images

The centre is the viewer. An empty viewer shows a short hint. An open picture is drawn on a canvas.

![Viewing images](help/viewer.jpg)

- **Zoom**: `Ctrl++`, `Ctrl+-`, the magnifier buttons, or the wheel over the picture. You can also type `100%` in the zoom box. The wheel step (5/10/25/50%) is in Settings.
- **Display modes** on the toolbar, for pictures and video alike: fit to window (`Ctrl+0`), fit width, fit height, actual size (`Ctrl+1`), centre, fullscreen (`F11`). The chosen mode is kept for the next file.
- **Pan**: drag with the pointer tool. The cursor is a hand.
- **Previous / next**: `Left` / `Right`, `Page Up` / `Page Down`, or the arrows at the edges. Order is the images, video and audio in the same folder. With the ruler on, the edge arrows sit inside it so they never cover the scale.
- **Rotate** (`Ctrl+[`, `Ctrl+]`) and **flip** horizontal or vertical. Each step can be undone.
- A checkerboard can sit behind transparent PNG files. Turn it off in Settings for a flat background.
- **Smooth pixels when zoomed in** softens enlargement. Turn it off for medical images and pixel art so each pixel stays a square.
- **Ruler**: pixel scales run along the top and left of the viewer. The ruler button on the toolbar or **View ▸ Ruler** turns them on and off, and the choice is remembered. The picture's extent is shaded in a light tint of the theme's accent colour on both rulers — width along the top, height down the left — with its size at the end (`W 400`, `H 540`). The mouse position shows on both rulers as a **red line with the pixel coordinate**.
- **Big pictures**: even a photo of about 100 megapixels opens without freezing the window. Reading and decoding happen in the background; moving on to the next picture before one has opened cancels it.

The right side is **colour**. It shows a histogram (red, green, blue and luminance), a colour wheel, and brightness, contrast, saturation, tint and temperature. A slider updates live and becomes one undo step when you release it. Double-click a slider to reset that one control. **Reset colour** clears every colour edit. DICOM uses its own window and level instead of this panel.

## Thumbnails

**Window › Folder thumbnails**, or the thumbnail card on Home, shows the folder as a grid. Click a cell to open that file and leave the sheet. Sort order and the view are also on the sheet's own bar.

![Thumbnails](help/thumbs.jpg)

Six **view buttons** on the toolbar show the folder the way you want. Pressed while a picture is open, they bring the folder back in that view. The button of the current view is lit.

| Button | Looks like |
|--------|------------|
| Large icons | 240 px thumbnails |
| Medium icons | 160 px thumbnails |
| Small icons | 96 px thumbnails |
| Tiles | a 64 px picture with its name, size, pixels, type and date beside it |
| List | small icons and names in columns |
| Details | name · type · size · dimensions · modified · created columns (click a column title to sort) |

![Tiles view](help/tiles.jpg)

The − / slider / + on the sheet's bar also set any thumbnail size from 64 to 380 px.

Thumbnails are built in the background for every folder you open, and for your recent folders at startup, and kept in a thumbnail database. The next visit shows them at once. Settings shows the cache size and can clear it.

While a picture is open, a filmstrip of its folder runs along the bottom. ‹ and › on its sides, or `Left` and `Right`, step through it. Its first tile, **Parent folder**, goes one folder up. Hide the strip with the **bottom panel** button on the menu bar (or **Window › Bottom panel**).

**Drag and drop**: drag a thumbnail (or the whole selection) onto a folder in the explorer or a folder cell to move it there. Hold `Ctrl` to copy. `Esc` cancels. Keep dragging past the window edge to drop the files on Explorer, the desktop or another program; that always copies.

## Video and audio

MP4, WebM, MOV, MKV, AVI and similar files grow a transport under the picture.

- Play, pause (`Space`), stop
- A seek bar and current time / duration
- Volume and mute. The level is remembered in Settings.
- When subtitles exist, the caption button shows or hides them. The file button picks an `.srt` (and similar) file, and the list picks a language. “Show subtitles when available” and the preferred language are in Settings.

Audio files show a note icon and a player. Video and audio are not rotated or colour-corrected.

## DICOM

Opening `.dcm` or `.dicom` shows two DICOM rows.

**Top row — how the image is displayed**

- Window presets (lung, bone, brain, and any presets stored in the file)
- **C** window centre, **W** window width. Type a number or `Ctrl`+drag on the image.
- Invert (`I`), reset window (`W`), colour map (`M`)
- Stored value range and VOI function

**Bottom row — what you look at and measure**

- Frame slider, previous/next frame (`Ctrl+Page Up` / `Ctrl+Page Down`), first/last (`Home` / `End`)
- Cine play (`Space`) and frames per second. If the file has no rate, Settings supplies the default.
- Overlay planes (`V`), annotations (`O`), rulers (`G`), scale bar (`B`)
- Measurements: ruler (`R`), angle (`A`), ellipse ROI (`E`), rectangle ROI (`T`), and clear.

Corner text, orientation markers and the scale bar are drawn on top of the image. Annotation visibility and the overlay colour are in Settings. Exporting DICOM to PNG (or another still format) saves the windowed image you see.

## Edit window

**Edit › Edit Image**, or `Ctrl+E`. The edit window's menu bar shows the icon, “Edit Image” and the file name.

![Edit window](help/edit.jpg)

Tools:

- **Pointer** pans and works with a selection.
- **Rectangle, lasso, polygon, magic wand** select a region. The wand groups similar colours. The tolerance number widens or narrows that match.
- **Cut / copy**, **crop to selection**, **clear selection**
- **Remove background** makes the background transparent. Pick the algorithm first. Separate methods suit a person in the frame and a product shot.
- Rotate, flip, resize, undo (`Ctrl+Z`), redo (`Ctrl+Y`)

Presets (grayscale, sepia, invert and others) are on the left. **Auto improve** at the top of that panel looks at the picture, then opens a settings window. Choose a kind such as a portrait, a landscape or a night shot, and move brightness, contrast, colour and sharpness: the large preview shows every setting together, and the small photo beside each control shows that setting alone. **Apply** writes the result onto the picture. When the look takes a while, a progress popup shows how far it has got. Brightness, contrast and the other adjustments are on the right, with the colour wheel at the top. Each panel title has an icon. The ‹ / › button on a title, the left / right panel buttons at the right of the menu bar (left of minimise), or **View › Left / Right panel** fold a panel into a rail that keeps its icon and title; click the rail to open it again. The ⓘ button right of Settings shows About. **Apply** writes the edit back to the viewer and closes the window. **Cancel** (`Esc`) drops it. **Save as new file** leaves the original and suggests a name such as `name_변경.png`. A HEIC original is offered as JPEG.

Rotate, flip and colour changes made in the viewer share the same undo stack. **Reset all edits** reloads the file as it was opened.

In the edit window the rulers along the top and left are **always** shown, even when the viewer's ruler is off. The picture's width and height are shaded in the theme's accent colour, as in the viewer.

### Drawing and retouch tools

The second toolbar row holds the tools; the options of the one you pick (colour, size, opacity …) appear to its right and are remembered per tool. Each stroke, shape or retouch is one undo step.

- **Brush** `B`, **highlighter** `H`, **eraser** `E` (erases to transparent, save as PNG)
- **Line** `L`, **arrow** `A`, **rectangle** `R`, **ellipse** `O` — `Shift` snaps to 45° / squares / circles; **Fill** paints the inside
- **Text** `T` — click, type, `Ctrl+Enter` (or click elsewhere) to place, `Esc` to cancel
- **Mosaic** `M` and **blur** `U` brushes hide faces or number plates
- **Clone stamp** `S` — `Alt`+click the source, then paint; **spot healing** `J`; **red-eye** `Y` — click each pupil
- **Crop** `C` with a ratio, then `Enter` or double-click; **straighten** `K` — drag along the horizon or set the angle, `Enter`
- **White balance picker** `W` — click something white or grey

A shape or text you just made stays **live** with handles: drag it to move, drag a handle to resize (the pointer shows ↔ ↕ ⤡ over a handle), change its colour, width or font, double-click text to type in it again; while typing, drag the ✥ grip at the box's top-left to move it. It goes into the picture when you start the next one or do anything else. `Enter` places it, `Delete` removes it, arrow keys nudge it, `Ctrl+Z` before it is placed drops it. Text has **B · I · outline · shadow** toggles.

Selections: `Shift` adds, `Alt` subtracts, dragging inside moves the outline, `Ctrl`+drag moves the selected pixels.

`[` / `]` change the brush size. `Esc` switches the tool off (a second `Esc` closes the editor). `Space`+drag or the middle button moves the picture with any tool.

The **Image** menu has Canvas size, Auto enhance, Tone curve & levels (live preview, OK = one undo step), Reset tone, Reduce noise and Watermark. **Exposure, highlights, shadows and vibrance** are in the Adjustments panel.

Saving keeps the photo information (date taken, camera, GPS — Settings can drop GPS or keep nothing); JPEG puts transparent areas on white. **File › Batch processing…** resizes, converts or watermarks many pictures at once into new files (originals untouched, never overwritten). To save only part of a picture: right-click the viewer › **Select a region to save…** (the editor opens with the rectangle tool), drag over the part, then right-click › **Save selection as image…**. It saves what you see (effects included) as a new file; the picture itself does not change, and outside a lasso / wand shape is transparent. The **Select** menu (also under right-click › Select) has the selection tools, Save selection as image, Select all `Ctrl+A`, Invert `Ctrl+Shift+I`, Clear `Ctrl+D`, Feather, Grow, Shrink, and Blur / Mosaic selection.

## Resize

**Edit › Resize Image** (`Ctrl+Shift+R`) shows a preview next to the size.

- Method: percent, pixels, longest side, or fit inside a width and height
- Preset buttons, and lock aspect ratio
- Resample: high (smooth), medium, nearest neighbour (pixels)
- Folder, file name, format (PNG, JPEG, WebP, BMP), and JPEG/WebP quality
- **Also apply to the current image** changes the picture in the viewer as well as the saved file.

## Super-resolution

**Image › Super-resolution…** in the edit window (toolbar button next to Resize, `Ctrl+Shift+U`) makes the picture bigger without the blur of plain resizing.

![Super-resolution](help/superres.jpg)

- **Built-in** (no download): nearest neighbour (pixel art), bilinear, bicubic (sharpness a), Lanczos (2–4 lobes); scale ×1.5 to ×8, optional sharpening after
- **AI models**: Real-ESRGAN x4plus (photos, the default), x4plus Anime (illustrations), AnimeVideo v3; Real-CUGAN SE and Pro; waifu2x CUnet, UpConv7 Photo and UpConv7 Anime; **SwinIR** (classical, real-world M / L, lightweight), **EDSR**, **AuraSR v2** (best on uncompressed pictures: it also enlarges JPEG blocks) and **ESPCN**. Choose one in the drop-down next to the toolbar button or in the popup.
- SwinIR, EDSR, AuraSR and ESPCN run in the app's own PyTorch environment, installed automatically: the CUDA build for an NVIDIA GPU, else the CPU build. Device **Automatic** uses the GPU when there is one, else the CPU.
- Each one shows its own parameters: scale, denoise level, tile sync, tile size, device (GPU, or CPU for Real-CUGAN and waifu2x), TTA, sharpening. SwinIR and EDSR also have **tile overlap** (fewer seams) and **precision** (FP32 / FP16: on a GPU FP16 is faster and needs half the memory); AuraSR has **pieces per batch** and **seams** (two overlapping passes = clean, one pass = about twice as fast). The result size is shown as you change them; **Default values** resets this algorithm, **All defaults** resets everything (first run: Real-ESRGAN x4plus ×4 on the desktop, Lanczos ×2 with 20 % sharpening in a browser; JPG 92).
- **Scale**: buttons at the top of the parameters (**2x, 3x, 4x …**), up to the largest scale the model supports (shown as `Up to Nx`: built-in 8x, Real-ESRGAN and Real-CUGAN SE 4x, Real-CUGAN Pro 3x, waifu2x 32x).
- **Result**: the **file name** is made for you (`original_SR_algorithm_xScale`, following the algorithm and scale) and can be edited; **↺** brings the automatic name back. Choose the format, **JPG (default)**, PNG, WEBP, AVIF, GIF or BMP, with a quality for JPG / WEBP / AVIF, and the **folder** (the original's; **Browse…** changes it). The file is saved there at once, never over an existing one (` (2)` is added). The picture in the editor changes too (one undo step).
- An AI model that is not installed yet is **downloaded and installed automatically** first (about 34–44 MB), with progress in a popup and a **Stop** button. While upscaling, the popup shows the percent, the sizes, the elapsed time and the time left. **Settings › Super-resolution** sets the default algorithm, format and quality (**All defaults** resets them) and downloads, reinstalls or removes each engine.
- AI models run in the desktop app only and need a Vulkan graphics device (Real-CUGAN and waifu2x can also run on the CPU).

## Print

The print window has the **printer and page setup** on the left and the **preview** on the right. The preview follows every change at once.

![Print](help/print.jpg)

- **Printer**: the printers of this PC, the default one chosen at first.
- **Paper**: A4, Letter, Legal, A3, A5, Tabloid, B4, B5, A6, postcard, photo 4 × 6 · 5 × 7 · 8 × 10 in
- **Margins**: none / narrow / normal / wide, or **Custom…** with top, bottom, left and right in mm
- **Picture position on the page**: centre, top or bottom centre, middle left or right, the four corners
- Orientation: auto, portrait, landscape
- Scale: fit to page, actual size, or a custom percent of fit
- Copies, colour or grayscale (the printer is told grayscale too)
- Header: file name, date, both, or your own text, aligned left, centre or right
- Page number: position and format (`1 / 1`, `1`, `Page 1`, `- 1 -`)

**Print** prints **straight away** on the chosen printer — no Windows print dialog — and closes the window, with the paper, margins and position of the preview. A printer that writes a file, such as **Microsoft Print to PDF**, asks where to save and writes a PDF. In a web browser, and on systems other than Windows, the browser's or system's print dialog opens instead.

## Window menu

- Collapse the left panel (explorer and file info), the bottom panel (filmstrip) or the right panel (colour)
- Folder thumbnails
- Fullscreen, minimise, maximise/restore
- Settings

## Theme and language

The palette button jumps to the **next theme**. The small arrow beside it opens the full list. There are several dark themes and several light themes. The Theme tab in Settings shows the same list.

The language button switches between 한국어 and English. The flag is the language you will switch to. Menus, dialogs and this guide follow (the guide window can also show the guide alone in the other language).

## Settings

![Settings](help/settings.jpg)

- **General**: language, reopen the last folder and file, start screen (automatic background change, transparency, speed), clear recent folders, clear the thumbnail cache, register as the Windows default app
- **Theme**: dark and light lists
- **Viewer & editing**: wheel zoom step, checkerboard, smooth zoomed pixels, background-removal algorithm
- **DICOM**: annotations, default cine speed, overlay colour
- **Media**: subtitles, preferred language, volume, mute
- **Super-resolution**: default algorithm, format and quality; install state of each AI engine, with Download / Reinstall / Remove (Remove is faded for an engine that is not installed)

**Reset all settings** returns these values to their defaults. Recent folders are cleared separately on the General tab.

## Shortcuts

| Action | Keys |
|--------|------|
| User guide | `F1` |
| Guide text smaller / larger / normal (guide window) | `Ctrl+−` / `Ctrl++` / `Ctrl+0` |
| Print the guide (guide window) | `Ctrl+P` |
| Open file | `Ctrl+O` |
| Open folder | `Ctrl+Shift+O` |
| Save as | `Ctrl+Shift+S` |
| Print | `Ctrl+P` |
| Details | `Ctrl+I` |
| Edit image | `Ctrl+E` |
| Zoom in / out | `Ctrl++` / `Ctrl+-` |
| Fit / actual size | `Ctrl+0` / `Ctrl+1` |
| Rotate left / right | `Ctrl+[` / `Ctrl+]` |
| Resize | `Ctrl+Shift+R` |
| Super-resolution (edit window) | `Ctrl+Shift+U` |
| Previous / next | `Left` `Page Up` / `Right` `Page Down` |
| Undo / redo | `Ctrl+Z` / `Ctrl+Y` |
| Edit tools | `B` `H` `E` `L` `A` `R` `O` `T` `M` `U` `S` `J` `Y` `C` `K` `W`, size `[` / `]` |
| Select all / invert / clear (edit window) | `Ctrl+A` / `Ctrl+Shift+I` / `Ctrl+D` |
| Copy | `Ctrl+C` |
| Clear selection / close | `Esc` |
| Fullscreen | `F11` |
| DICOM frames | `Ctrl+Page Up` / `Ctrl+Page Down`, `Home` / `End` |
| DICOM cine | `Space` |
| DICOM invert / reset window | `I` / `W` |
| DICOM window drag | `Ctrl`+drag |

With the explorer focused, `Ctrl+C` / `Ctrl+X` / `Ctrl+V` copy, cut and paste files, and `Ctrl+P` pastes too. Everywhere else `Ctrl+P` prints.

## Running in a browser

The desktop app is `npm start`. The browser build is `npm run web`. The browser cannot show the whole disk, and it has no last-folder restore, delete, Show in Explorer, window buttons or the fuller metadata. Viewing, zoom, rotate, edit and print preview follow the same steps.

The Korean guide is `doc/도움말.md`.
