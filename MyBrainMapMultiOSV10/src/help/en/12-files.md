# Saving, importing, exporting, printing

## Saving and opening

Maps are saved as **.tmap** files (JSON). Pictures, notes and formats all go into the one file.

- `Ctrl+S` saves, `Ctrl+Shift+S` saves as, File › Save all.
- `Ctrl+O` opens .tmap files and every format below. Recent files are in the File menu and on the start page.
- On the desktop, drop files on the window or double-click a .tmap file.
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

- **PNG · JPEG** — scale (1× – 4×), margin, a transparent background for PNG.
- **SVG** — a vector picture, sharp at any size.
- **PDF** — paper (A4, A3, A5, Letter, Legal or the map's size) and orientation.
- **Word** — the map picture first, then a heading outline with the notes.
- **HTML** — one web page with the map picture and a foldable outline.
- **Markdown · OPML · Text · FreeMind · XMind · CSV**.

**File › Copy map as picture** (`Ctrl+Shift+C`) puts the map on the clipboard to paste into documents and chats.

## Printing

![Print preview](images/print-preview.png)

*Print preview: paper, orientation and pages with the pages in view.*

`Ctrl+P` opens the print preview: paper, orientation, margin, **fit on one page** or **split over 2 · 4 · 6 · 9 pages** (a big map on several sheets to tape together), the title at the top, date and page number at the bottom, colour. The desktop app prints directly to the printer you choose; the web version opens the browser's print dialog.
