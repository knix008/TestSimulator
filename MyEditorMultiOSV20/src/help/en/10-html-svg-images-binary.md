# HTML · SVG · images · binary files

My Editor opens not just text but also web pages, vector graphics, photos · medical images, binary files, and audio · video. Each kind of file has its own editor pane layout and tools.

| File | Editor pane | What you can use |
|---|---|---|
| HTML (.html, .htm) | Source editor | Preview, run in the browser |
| SVG (.svg) | Source editor + picture preview | Toolbar row for inserting SVG elements |
| PNG · JPEG · GIF · WebP · BMP · ICO · AVIF | The picture fills the pane | Zoom · pan, Hexa |
| HEIC · HEIF | Picture (slider when there are several) | Zoom · pan, flipping through images, Hexa |
| DICOM (.dcm, .dicom) | Medical image (frame · series slider) | Window/level, presets, invert, HU values, info, Hexa |
| Audio · video | Player | Play · stop · position · volume |
| Other binary files | Hex view | Selecting bytes · copying as hex |

## HTML preview

In an HTML document, the **Preview** button on the toolbar (eye icon, Ctrl+Shift+M) or View › Preview draws the page to the right of the editor.

![HTML preview](images/html-preview.png)
*Figure: HTML source with the preview beside it*

- The preview is an **isolated page** inside the editor pane that holds the document. The page's scripts run separated from the editor.
- Local **pictures · CSS · script files** relative to the document's folder are loaded too.
- It updates **as you type**. You do not need to save.
- Drag the border between the editor and the preview to change the width (20% – 80%).
- Whether the preview is on is shared by all HTML documents and remembered.

## Running HTML

The **Run** button on the toolbar (play icon) or View › Run opens the HTML file in the **system's default browser**. The browser reads the file from disk, so if there are unsaved changes or it is a new document, it is **saved first** (a new document asks for a location). Once opened, the status bar shows "Opened in the browser: name". For documents that are not HTML, this button is disabled.

## SVG

SVG is a text (XML) document, so you edit the source in the editor and see the result in the **picture preview** on the right. The preview is on by default; turn it off and on with the Preview button on the toolbar (a picture icon for SVG) or Ctrl+Shift+M. It is redrawn as soon as you stop typing.

![SVG editing and preview](images/svg-preview.png)
*Figure: SVG source, the element toolbar row, and the picture preview*

In SVG documents, an **element toolbar row** appears below the tab bar. Pressing a button inserts a skeleton of that element at the cursor.

| Button | Inserts |
|---|---|
| Rectangle | `<rect>` |
| Circle | `<circle>` |
| Ellipse | `<ellipse>` |
| Line | `<line>` |
| Polyline | `<polyline>` |
| Polygon | `<polygon>` |
| Path (curve) | `<path>` |
| Text | `<text>` |
| Image | `<image>` |
| Group (wraps the selection) | `<g>` — wraps the selected elements |
| Gradient definition | `<linearGradient>` |
| Reuse (use) | `<use>` |
| Transform attribute (rotate / move) | `transform=` attribute |

In the preview, you zoom and pan the same way as with picture files (below).

## Viewing pictures

Opening PNG · JPEG · GIF · WebP · BMP · ICO · AVIF · HEIC · HEIF · DICOM files **fills the editor pane with the picture**. Picture files cannot be edited or saved here.

![Picture view](images/image-view.png)
*Figure: A picture file — hints and the Hexa button at the top, size and zoom at the bottom*

- At first it is shown **Fit to pane**.
- **Left click**: zoom in, **right click**: zoom out, **Ctrl+mouse wheel**: zoom in and out (5% – 1600%). The picture stays centred in the pane as you zoom.
- If the picture is larger than the pane, **drag to pan**.
- A checkerboard pattern lies behind transparent areas.
- The bottom row shows the file name, the **pixel size** (e.g. 1920 × 1080 px), and the current zoom or "fit".
- The toolbar row below the tab bar has usage hints and the **Hexa** button at its right end.

### HEIC · HEIF

HEIC · HEIF, used for iPhone photos and the like, are decoded and shown. If one file contains several images, a **slider** appears below the picture.

- Flip through the images with the ◀ ▶ buttons, by dragging the slider, or with **← → (or PgUp / PgDn)**. **Home / End** go to the first / last image.
- "n / total" shows the current image.

### DICOM

Medical DICOM (.dcm) files open with the following tools:

- Flip through files with several frames, or **.dcm files of the same series in the same folder**, with the slider (the keys are the same as for HEIC).
- The **Play** button (or Space) advances the frames automatically.
- The **WW · WL** sliders adjust window/level (window width · window centre).
- **Presets**: Default · Abdomen · Bone · Brain · Lung · Soft · Liver — pressing one sets the window/level suited to that body part.

| Preset | WW | WL |
|---|---|---|
| Abdomen | 400 | 40 |
| Bone | 1800 | 400 |
| Brain | 80 | 40 |
| Lung | 1500 | −600 |
| Soft | 350 | 50 |
| Liver | 150 | 30 |

- **Invert** button: inverts black and white.
- **DICOM info** button: expands tag information such as Patient · Study · Series · Modality · Bits.
- Moving the mouse over the image shows the **HU value** (CT and so on) or the pixel value at that point in the bottom row.

## Hexa (hex beside the picture)

For picture files, the **Hexa** button on the toolbar row, View › Hexa, Hexa in the tab's right-click menu, or the Hexa button in the pane header with split panes shows **the file's bytes as hex beside the picture**. Press it again or the × in the hex view header to close it.

## Hex view (binary files)

Opening a file that is not text (an executable, archive, PDF, unknown format and so on) reports "Binary file opened in the hex view" and opens it in the **hex view**. Even large files open at once, since only the visible part is read.

![Hex view](images/hex-view.png)
*Figure: The hex view with its three columns: offset · hex · ASCII*

- The header shows the file name and size ("binary · 1.2 MB (1,234,567 bytes)").
- The body has three columns: **Offset · hex bytes · ASCII**. Bytes that cannot be shown as characters appear as dots.
- **Clicking a byte** selects it (highlighted in both the hex and ASCII columns), and **Shift+click** extends the range. **Ctrl+A** selects everything.
- Even files of several GB scroll like small ones, since only the lines visible on screen are read, 64 KB at a time. Bytes that cannot be shown as characters appear as · in the ASCII column.
- The bottom row shows the offset at the cursor (hex and decimal), that byte's value and character, and the number of selected bytes.
- **Ctrl+C** copies the selected bytes as a hex string (up to 1 MB at a time).
- The hex view is **read-only**. You cannot edit, save or search.

## Audio · video

mp3 · wav · ogg · oga · flac · aac · m4a · opus · aiff · aif · wma (audio) and mp4 · m4v · webm · ogv · mov · mkv · avi (video) files open in the **player**.

- **Play / Pause** and **Stop** buttons
- The **Position** bar to jump to any point
- The **Mute / Unmute** button and the **Volume** bar
- Status: Loading · Playing · Paused · Stopped · Ended

If the codec cannot be played by the operating system's web engine, it shows "This format cannot be played here". Audio · video cannot be edited or saved.

> Tip: For pictures · binary files · audio · video, text tools such as the minimap · find · Format document are turned off. Binary files cannot be viewed as text; they always open in the hex view.
