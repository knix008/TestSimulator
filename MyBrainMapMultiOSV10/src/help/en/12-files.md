# Saving, importing, exporting, printing

## Saving and opening

Maps are saved as **.tmap** files (JSON). Pictures, notes and formats all go into the one file.

- `Ctrl+S` saves, `Ctrl+Shift+S` saves as, File › Save all. The **Save** and **Save as** buttons at the left of the toolbar do the same.
- Quitting (the window's ×, File › Exit) with unsaved maps asks: **Save all · Don't save · Cancel**. Closing one tab asks about that map (Settings › Ask to save when closing).
- `Ctrl+O` opens .tmap files and every format below. Recent files are in the File menu and on the start page.
- Drop files on the window to open them — .tmap and every format below (FreeMind, XMind, MindManager, OPML, Markdown, text), several at once if you like. The web version does the same. On the desktop a double-click on a .tmap file opens it too.
- A picture dropped on a topic becomes its picture; other files become attachments.
- When another program changes a map, it is read again as you come back to the window (you are asked if you changed it here).

## Importing

**File › Import** (or Open) reads the files of other mind-mapping programs.

| Format | What comes in |
| --- | --- |
| FreeMind / Freeplane `.mm` | Topics, notes, icons, folding, colours, links, clouds, arrows |
| XMind `.xmind` (2020 and later, XMind 8) | Topics, notes, markers, labels, links, pictures, floating topics, relationships |
| MindManager `.mmap` | Topics, notes, priority / progress / dates / resources, icons, tags, links, floating topics, relationships |
| OPML | Outline and notes |
| Markdown `.md` | Headings and lists become topics, other text becomes notes |
| Text `.txt` | One topic per line, indentation gives the levels |

The original file is never changed; saving an imported map makes a new .tmap file.

## Exporting

![Export](images/export.png)

*The export dialog: choose a format and its options.*

`Ctrl+E` (File › Export): pick the format and press **Export…** to choose where.

- **Pictures: PNG · JPEG · WebP · BMP · TIFF · SVG** — scale (1× – 4×; SVG is a vector picture and needs none).
  - **Transparent background**: offered only by the formats that can store one (PNG, WebP, TIFF, SVG); on, the picture has no map background. JPEG and BMP are always painted on the map's background.
  - **Size**: the picture is the area covered by every shape on the map (topics, lines, relationships, boundaries, summaries, shadows) plus the **margin** — 20px by default, or 0, 10, 40 or 80px (0: flush with the shapes).
  - WebP is listed only where it can be written (the Windows desktop app, Chrome, Edge).
- **PDF** — paper (A4, A3, A5, Letter, Legal or the map's size) and orientation.
- **Word** — the map picture first, then a heading outline with the notes.
- **HTML** — one web page with the map picture and a foldable outline.
- **Markdown · OPML · Text · FreeMind · XMind · CSV**.

**File › Copy map as picture** (`Ctrl+Shift+C`) puts the map on the clipboard to paste into documents and chats.

## Printing

![Print preview](images/print-preview.png)

*Print preview: paper, orientation and pages with the pages in view.*

`Ctrl+P` opens the print preview: paper, orientation, margin, **fit on one page** or **split over 2 · 4 · 6 · 9 pages** (a big map on several sheets to tape together), the title at the top, date and page number at the bottom, colour. The desktop app prints directly to the printer you choose; the web version opens the browser's print dialog.
