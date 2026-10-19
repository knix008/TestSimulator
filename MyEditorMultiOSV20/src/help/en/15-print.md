# Print

Printing always shows the **Print preview** first. You check how the pages will look on paper, try out options, choose the printer and number of copies, and then print.

## Starting to print

- **Ctrl+P**
- **File › Print…**
- The **Print** button on the toolbar
- The **Print…** card on the start page
- The Markdown preview's right-click menu › Print…

While the document is prepared for printing (long code takes time for syntax highlighting and page breaking), a small window with a progress bar appears. In the desktop app, the print preview opens in a separate window.

## What gets printed for each kind of document

| Document | Printed as |
|---|---|
| Code · plain text | A **listing** broken into pages on the chosen paper. Syntax highlighting · line numbers · header and so on follow the print settings |
| Markdown | The same **rendered result** as the preview (pictures included) |
| HTML | The rendered page (local pictures · CSS included) |
| Picture files · SVG | The picture as is |

The print settings (paper · header · syntax highlighting and so on) apply only to **code and plain text**. They do not apply to Markdown · HTML · pictures.

## The print preview window

![Print preview](images/print-preview.png)
*Figure: Print preview — zoom and options at the top, pages in the middle, printer settings on the right*

**Top row**

- The document name
- **Zoom out / zoom level / Zoom in**: steps through 50% · 75% · 100% · 125% · 150%. Ctrl+mouse wheel changes it too.
- **Fit**: sizes the page to fit the window.

**Options row** (code · text documents only) — checking a box updates the preview immediately and is also saved to the same item under Settings › Print.

| Check box | Meaning |
|---|---|
| File name / path | File name (path) and language at the top of the page |
| Line numbers | A line number column on the left |
| Page border | A border around each page |
| Page numbers | "n / total" at the bottom of the page |
| Print date | The print date in the header |
| Highlight | Keyword · string · comment colours (light colours suited to paper) |
| Colour | When off, black and white (only boldness kept) |
| Stripes | A light grey background on every other line |
| Gutter | A light background in the line number column |
| Wrap | Lines longer than the page width continue on the next line (cut off when off) |

**Middle** — the pages are shown one after another at actual paper size.

**Right column**

- **Printer**: the list of installed printers. If there is none, it says "No printer was found. The default printer will be used."
- **Copies**: 1 – 99
- **Paper size**: A4 · Letter · Legal · A5
- **Layout**: Portrait · Landscape
- **Colour**: Colour · Black and white

**Bottom** — **Cancel** closes the window, and **Print** (or Enter) prints. The desktop app sends the job straight to the chosen printer, showing "Printing…" while it does. If it fails, the reason appears at the bottom of the right column. The web version opens a new browser window and sends it to the browser's print function.

## Print settings

The Settings › **Print** tab sets the defaults for printing code · text. A two-page **Preview** sample on the right shows the effect of your changes immediately.

![Print settings](images/settings-print.png)
*Figure: Settings › Print*

| Group | Item | Default |
|---|---|---|
| Paper | Paper size (A4 · Letter · Legal · A5) | A4 |
| | Orientation (Portrait · Landscape) | Portrait |
| | Margins (6 – 25 mm) | 12 mm |
| Contents | File name / path | On |
| | Line numbers | On |
| | Page border | Off |
| | Page numbers | Off |
| | Print date | Off |
| Type | Type size (7 – 14 pt, in steps of 0.5) | 9.5 pt |
| | Line height (1.1 – 2.0) | 1.45 |
| | Wrap long lines | On |
| Look | Syntax highlighting (keywords, strings, comments) | On |
| | Print in colour (off: grayscale, bold kept) | On |
| | Striped rows (a light tint on every other line) | On |
| | Shaded line-number gutter | On |

Tab characters in indentation are expanded to the editor's tab size when printing. **Reset to defaults** in the Settings window also returns the print settings to the defaults above.

> Tip: To save paper for a code review, try landscape · 8 pt type · wrap on · stripes off. On a black-and-white printer, turning colour off distinguishes elements by boldness instead of grey, which is sharper.
