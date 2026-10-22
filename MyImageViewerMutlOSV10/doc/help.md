# MyImageViewer Help

MyImageViewer opens photos, drawings, video, audio and DICOM medical images, and edits still images. This page explains each part of the window.

## Home

Until you open a file or a folder, **Home** fills the window: cards on a landscape. Each card starts that task.

- **Open Folder** shows that folder in the explorer.
- **Open File** picks an image, video, audio file or DICOM study.
- **Recent folders** lists folders you opened before. Click a name to open it again.
- Cards that need a picture (edit, print, resize, background removal, details) ask you to open one first. The status bar says so when there is nothing to edit.

**Home** on the menu bar returns here at any time. The file you already opened stays loaded. If Settings says to reopen the last folder and file at startup, the next launch skips Home and opens that file. Double-clicking a file to start the app does the same.

## Window and menu bar

There is no title bar. What used to sit there is on the menu bar.

| Place | What you see |
|-------|----------------|
| Left | Icon, **MyImageViewer**, version (and build number when there is one) |
| Middle | **Home**, then **File · Edit · View · Window · Help** |
| File name | The open file. A ● means unsaved changes |
| Right | Minimise, maximise/restore, close |

Drag the empty menu bar or the program name to move the window. Buttons do not drag. `F11` toggles fullscreen. Closing with unsaved changes asks Save, Don't Save or Cancel.

The **Help** menu contains **Help**, **Keyboard Shortcuts** and **About**. Help opens this guide, and so does `F1`. Shortcuts and About each open their own window.

Menus and right-click menus may extend past the edge of the window, so nothing is cut off. Every menu item has an icon. A ticked item keeps its icon and shows ✓ at the right. Click outside a menu or press `Esc` to close it.

Dialogs (Settings, About, Print, Resize, Details, confirmations) open as windows of their own. Drag one by its title to move it anywhere on the screen, even past the main window. The main window waits behind it until you close the dialog.

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

## Explorer

The left side is the **explorer** and **file info**. Drive buttons (`C:`, `D:`, …) switch disks. A folder expands; an image opens in the viewer.

Each format has its own icon colour: JPEG orange, PNG green, GIF purple, DICOM red, and separate colours for video and audio. Folders are gold.

The collapse button on the panel title, or the left-panel button on the toolbar, folds the explorer into a vertical rail (icon and title). Drag the splitter to resize it.

**File info** under the tree shows size, format, modified time and, for a picture, pixel size. Camera, lens, exposure and GPS appear when the file has them.

In the browser (`npm run web`) you only see folders the browser was allowed to read. Rename, delete and Show in Explorer are desktop-only.

At startup the last folder you opened appears as a thumbnail sheet, with the last picture selected. When the start screen is set to show at startup, it comes first with its background scene and the folder waits behind it; when it is not, the folder shows straight away. With no saved settings, your home folder opens. Explorer, the first card of What you can do, goes to that main view. Several copies of the program can run at once. If that folder is gone, the newest recent folder that still exists opens instead. Settings › General can turn this off.

## Viewing images

The centre is the viewer. An empty viewer shows a short hint. An open picture is drawn on a canvas.

- **Zoom**: `Ctrl++`, `Ctrl+-`, the magnifier buttons, or the wheel over the picture. You can also type `100%` in the zoom box. The wheel step (5/10/25/50%) is in Settings.
- **Display modes** on the toolbar, for pictures and video alike: fit to window (`Ctrl+0`), fit width, fit height, actual size (`Ctrl+1`), centre, fullscreen (`F11`). The chosen mode is kept for the next file.
- **Pan**: drag with the pointer tool. The cursor is a hand.
- **Previous / next**: `Left` / `Right`, `Page Up` / `Page Down`, or the arrows at the edges. Order is the images, video and audio in the same folder.
- **Rotate** (`Ctrl+[`, `Ctrl+]`) and **flip** horizontal or vertical. Each step can be undone.
- A checkerboard can sit behind transparent PNG files. Turn it off in Settings for a flat background.
- **Smooth pixels when zoomed in** softens enlargement. Turn it off for medical images and pixel art so each pixel stays a square.

The right side is **colour**. It shows a histogram (red, green, blue and luminance), a colour wheel, and brightness, contrast, saturation, tint and temperature. A slider updates live and becomes one undo step when you release it. Double-click a slider to reset that one control. **Reset colour** clears every colour edit. DICOM uses its own window and level instead of this panel.

## Thumbnails

**Window › Folder thumbnails**, or the thumbnail card on Home, shows the folder as a grid. Click a cell to open that file and leave the sheet. Sort order and icon/list layout are on the sheet's own tools.

Thumbnails are built in the background for every folder you open, and for your recent folders at startup, and kept in a thumbnail database. The next visit shows them at once. Settings shows the cache size and can clear it.

While a picture is open, a filmstrip of its folder runs along the bottom. ‹ and › on its sides, or `Left` and `Right`, step through it.

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

Tools:

- **Pointer** pans and works with a selection.
- **Rectangle, lasso, polygon, magic wand** select a region. The wand groups similar colours. The tolerance number widens or narrows that match.
- **Cut / copy**, **crop to selection**, **clear selection**
- **Remove background** makes the background transparent. Pick the algorithm first. Separate methods suit a person in the frame and a product shot.
- Rotate, flip, resize, undo (`Ctrl+Z`), redo (`Ctrl+Y`)

Presets (grayscale, sepia, invert and others) are on the left. Brightness, contrast and the other adjustments are on the right, with the colour wheel at the top. Each panel title has an icon. The ‹ / › button on a title, the two panel buttons on the toolbar, or **View › Left / Right panel** fold a panel into a rail that keeps its icon and title; click the rail to open it again. The ⓘ button right of Settings shows About. **Apply** writes the edit back to the viewer and closes the window. **Cancel** (`Esc`) drops it. **Save as new file** leaves the original and suggests a name such as `name_변경.png`. A HEIC original is offered as JPEG.

Rotate, flip and colour changes made in the viewer share the same undo stack. **Reset all edits** reloads the file as it was opened.

## Resize

**Edit › Resize Image** (`Ctrl+Shift+R`) shows a preview next to the size.

- Method: percent, pixels, longest side, or fit inside a width and height
- Preset buttons, and lock aspect ratio
- Resample: high (smooth), medium, nearest neighbour (pixels)
- Folder, file name, format (PNG, JPEG, WebP, BMP), and JPEG/WebP quality
- **Also apply to the current image** changes the picture in the viewer as well as the saved file.

## Print

Print preview puts the page on the left and the settings on the right.

- Printer, paper (A4, Letter, Legal, A3, A5, Tabloid), margins (none, narrow, normal, wide)
- Orientation: auto, portrait, landscape
- Scale: fit to page, actual size, or a custom percent of fit
- Copies, colour or grayscale
- Header: file name, date, both, or your own text, aligned left, centre or right
- Page number: position and format (`1 / 1`, `1`, `Page 1`, `- 1 -`)

**Print** sends that page to the chosen printer.

## Window menu

- Collapse the left panel (explorer and file info) or the right panel (colour)
- Folder thumbnails
- Fullscreen, minimise, maximise/restore
- Settings

## Theme and language

The palette button jumps to the **next theme**. The small arrow beside it opens the full list. There are several dark themes and several light themes. The Theme tab in Settings shows the same list.

The language button switches between 한국어 and English. The flag is the language you will switch to. Menus, dialogs and this guide follow.

## Settings

- **General**: language, reopen the last folder and file, clear recent folders, clear the thumbnail cache, register as the Windows default app
- **Theme**: dark and light lists
- **Viewer & editing**: wheel zoom step, checkerboard, smooth zoomed pixels, background-removal algorithm
- **DICOM**: annotations, default cine speed, overlay colour
- **Media**: subtitles, preferred language, volume, mute

**Reset all settings** returns these values to their defaults. Recent folders are cleared separately on the General tab.

## Shortcuts

| Action | Keys |
|--------|------|
| Help | `F1` |
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
| Previous / next | `Left` `Page Up` / `Right` `Page Down` |
| Undo / redo | `Ctrl+Z` / `Ctrl+Y` |
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
