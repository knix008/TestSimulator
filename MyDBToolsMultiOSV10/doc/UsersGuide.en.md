# DBTools User Guide

DBTools designs database schemas as ER diagrams. It runs the same way in a **web browser, on
Windows, macOS and Linux**; the desktop edition runs in a **Tauri** shell (Rust + the operating
system's web view).

> New to DBTools? Work through the [Tutorial](Tutorial.en.md) first. It opens an example, adds
> tables and relationships, runs the analysis, prints, and changes the theme, one step at a time.

---

## Contents

1. [Getting started](#1-getting-started)
2. [The window](#2-the-window)
3. [Projects](#3-projects)
4. [Importing database files](#4-importing-database-files)
5. [Editing a schema](#5-editing-a-schema)
6. [Target databases](#6-target-databases)
7. [Export and print](#7-export-and-print)
8. [Normalization analysis](#8-normalization-analysis)
9. [Index advisor](#9-index-advisor)
10. [Start screen and examples](#10-start-screen-and-examples)
11. [Settings and themes](#11-settings-and-themes)
12. [Keyboard shortcuts](#12-keyboard-shortcuts)
13. [FAQ](#13-faq)

---

## 1. Getting started

### In a browser

Host the `dist/` folder built by `npm run build:web` on any static server, or run `npm run web`
during development and open <http://127.0.0.1:5174>. Files are opened and saved through the
browser's own file dialogs.

### On the desktop

- **Installed**: start **DBTools** from the Start menu or the desktop shortcut. Double-clicking a
  `.mdprj` file opens it too; if DBTools is already running, the running window comes forward and
  opens the file in a new tab.
- **From source**: `npm start` starts the Vite dev server (port 5174, or the next free one) and
  then `tauri dev`. Rust (`cargo`) must be installed.

The window is frameless and **draws its own title bar**: drag it to move the window, double-click
it to maximize, and use the minimize / maximize / close buttons at its right end. The window's
position and size are restored on the next start.

### Building the installers

```bash
npm run build:win      # Windows — DBTools_1.0.1_x64-setup.exe (NSIS)
npm run build:mac      # macOS   — DBTools_1.0.1_*.dmg
npm run build:linux    # Linux   — DBTools_1.0.1_amd64.deb, .AppImage
```

Run each on its own operating system. The finished installer of this version is **copied to the
project root**, and older versions there are removed. The installer, the program and its window
all use the 3D database icon in `assets/`; `.mdprj` documents get the page-shaped document icon.

### A new project

**File → New** (Ctrl+N) opens an empty schema in a new tab, targeting the default database from
Settings (SQLite at first).

---

## 2. The window

```
┌──────────────────────────────────────────────────────────────────────┐
│  Title bar (icon · DBTools v1.0.1 · document · ─ □ ✕)                  │
├──────────────────────────────────────────────────────────────────────┤
│  Menu bar (Home | File | Edit | View | Analyze | Help …… Theme ▾ 🏳 ⚙ ⓘ) │
├──────────────────────────────────────────────────────────────────────┤
│  Toolbar                                                              │
├──────────────────────────────────────────────────────────────────────┤
│  Document tabs                                                   < >  │
├──────────┬───────────────────────────────────────┬───────────────────┤
│ Tools    │          ER diagram canvas             │ Schema panel    › │
│          │     (rulers · tables · relationships)  │ Structure /       │
│          │                                        │ Analysis / Index  │
│          ├────────────────────────────────────────┤───────────────────│
│          │ Output (Problems · Log · Info)       ˅ │ Properties        │
├──────────┴───────────────────────────────────────┴───────────────────┤
│  Status bar                                                           │
└──────────────────────────────────────────────────────────────────────┘
```

**Title bar** — the program name and version (`DBTools v1.0.1`) and the current document. A `●`
after the document name means unsaved changes. The taskbar shows `document — DBTools v1.0.1`.

**Menu bar** — the **Home** button at the front opens and closes the
[start screen](#10-start-screen-and-examples). At the right end are the **theme drop-down,
language switch, Settings and About**.

**Toolbar** — file buttons (with **Print** right after **Save as**), undo, export, tables and
relationships, zoom, grid, auto-arrange, analysis, report, target database and sample buttons on one
row, with **two panel toggles (bottom, right)** at the far right; an open panel's button is highlighted. The window's minimum width follows the toolbar, so no button is ever cut off.

Icons are coloured by meaning (open is amber, save is blue, delete is red, new is green, …); dark
themes use the lighter shade of each colour.

### Folding and resizing panels

The **Schema panel** (right) and the **Output** panel (under the canvas) work the same way; the
**Tools** panel on the left is a narrow fixed panel that does not fold.

- The title bar shows the panel's icon and title on the left and a **fold button at its right end**.
- Folded, a panel shrinks to a slim bar that **still shows its icon and title** (upright on the side
  panels); click the bar to open it again.
- Drag the **splitter** between a panel and the canvas to resize it. The right panel's width is kept
  in the settings; the other sizes and the folded state come back on the next start.
- The two toolbar buttons and the **View** menu fold and unfold them too.
- The Output panel sits **between the side panels, right under the canvas**.

### Output panel (bottom)

| Tab | Contents |
|-----|----------|
| Problems | Normalization findings and required indexes; click one to jump to the table |
| Log | Every status message and error with its time (newest first); the tab counts errors |
| Info | Schema, database, file, table / column / relationship counts, open tabs, theme, zoom, version |

**Copy** puts the current tab on the clipboard as text; **Clear** (Log tab) empties the log.

### Tools (left)

| Tool | What it does |
|------|--------------|
| Select | Select and move tables and relationships |
| Table | Click the canvas to place a new table |
| 1:1 / 1:N / N:M | Pick a relationship type, then drag from one table to another |
| Zoom in / out / fit | Change the view |

### Right panel

- **Structure** — the schema tree (tables, columns, relationships) with a name filter
- **Normalization** — 1NF–5NF findings; choose the levels with the chips
- **Index advisor** — index suggestions per column with `CREATE INDEX` statements
- **Properties** — the selected item's properties, by category or alphabetically

Fold it with its title bar button, the toolbar button or **View → Fold / unfold the right panel**.

---

## 3. Projects

### Project files (.mdprj)

UTF-8 JSON holding the schema name, target database, tables, columns, relationships and the
diagram layout. Fully compatible with files made by DBToolsWinV10.

| Action | Shortcut |
|--------|----------|
| Open project | Ctrl+O |
| Save | Ctrl+S |
| Save as | Ctrl+Shift+S |

Unsaved changes show a `●` in the title bar, the tab and the status bar; closing a tab or the app
asks first — only when something really changed.

### Recent files

**File → Recent files** and the start screen's **Recent files** card (desktop only: a browser
cannot reopen a path). The list length is set in Settings (10 by default).

### Workspaces

**File → Save workspace** stores **every open tab** in one `.mdwsp` file — each tab's schema,
the file it came from, and which tab was in front. **File → Open workspace** brings it all back.

---

## 4. Importing database files

**File → Open database** (Ctrl+Shift+O)

| Format | Extensions | Notes |
|--------|------------|-------|
| SQLite | `.db`, `.sqlite`, `.sqlite3`, `.db3` | Tables, columns, PK, UNIQUE, foreign keys |
| SQL DDL | `.sql` | `CREATE TABLE` / `ALTER TABLE … FOREIGN KEY` |
| Vector index | `.faiss`, `.findex`, `.hnsw`, `.index` | Faiss and hnswlib metadata |
| Project | `.mdprj`, `.json` | DBTools project |

Imported schemas are auto-arranged and are not tied to a project file until you save them.
Access (`.mdb`/`.accdb`), SQL Server (`.mdf`) and encrypted SQLite are not supported; export a
`.sql` script from those tools and import that instead.

---

## 5. Editing a schema

### Tables

| How | Where it lands |
|-----|----------------|
| **Edit → Add table** (Ctrl+T) | Right of the existing tables |
| **Table** tool, then click the canvas | Where you click |
| Right-click empty canvas → **Add table here** | Where you click |

A new table starts with an auto-increment primary key `id`.

### Columns

- Select a table, then **Edit → Add column** (Ctrl+L)
- Double-click a table to add, edit, delete and reorder columns
- Double-click a column row to edit that column
- Edit directly in the **Properties** panel

Column properties: name, data type, length, precision, scale, PK, auto increment, nullable,
unique, foreign key, default, comment.

### Relationships

1. Pick **1:1**, **1:N** or **N:M** in the tool panel.
2. Drag **from the parent table to the child table**.

The parent's primary key is linked to the child's `<parent>_id`-style column. To choose the exact
columns use **Edit → Add relationship** (Ctrl+R) or double-click the relationship line.

Relationship lines can be **straight**, **curved** (drag the diamond handles) or **orthogonal**
(drag the square handles; **Add bend** / **Reset route** in the context menu). Dragging a bend
brings its neighbouring bends along, so every turn stays a right angle, and two ends that are
almost level are joined by a straight line rather than a tiny jog.

The pointer shows what a drag will do:

| Pointer | Over | Dragging |
|---------|------|----------|
| Four-way arrow | A table | Moves the table (all selected tables together) |
| Up-down arrow | A horizontal piece of an orthogonal line | Moves that piece up or down |
| Left-right arrow | An upright piece of an orthogonal line | Moves that piece left or right |
| Cross | A bend or a curve's control point | Places that point exactly |
| Hand | An unselected relationship line | (click to select it) |

**Line bridges**: where two relationship lines cross, one hops over the other in a small half
circle, so a crossing never reads as a join. The flatter of the two lines hops (the later one when
they are equally steep), and crossings right next to a bend or a table end are left alone. Turn
them on or off with the **bridge** toolbar button or **View → Line bridges** (on by default); the
screen, image export and print all follow the setting.

### Tabs, multi-selection, auto-arrange

- New, Open and Open database always open a **new tab**; selection, zoom and undo history are
  kept per tab. **‹ ›** at the ends of the tab row scroll hidden tabs.
- **Ctrl/Shift+click** adds or removes tables from the selection; Ctrl/Shift+drag on empty canvas
  selects with a rectangle; dragging a selected table moves the whole selection.
- **Auto-arrange** lays tables out in layers by relationship (referenced tables left, referencing
  tables right) and shows the result at 100%.

### Canvas

| Action | How |
|--------|-----|
| Pan | Drag empty canvas, middle-drag, or Space+drag |
| Zoom | Mouse wheel (5% per notch, around the cursor), Ctrl + `+`/`-` |
| Fit all | Ctrl+0 |
| Back to 100% | Click the zoom (%) button |
| Select tool | Esc |

The canvas context menu always starts with **Undo / Redo** and ends with **Export diagram** and
**Write analysis report**.

### Delete, undo

**Edit → Delete selected** (Delete); deleting tables or columns also removes their relationships.
**Undo / Redo** (Ctrl+Z / Ctrl+Y) keeps 50 steps.

---

## 6. Target databases

PostgreSQL, MySQL, MariaDB, SQLite, SQL Server and Vector DB — chosen from the toolbar drop-down
or **View → Database type**. Each has its own header colour on the diagram and its own data type
list. Changing the target does not convert existing column types.

---

## 7. Export and print

**File → Export** or the toolbar **Export** drop-down.

| Group | Formats |
|-------|---------|
| Design report | Markdown, Excel, Word, PDF, HTML |
| Analysis report | Markdown, Word, PDF, HTML |
| Diagram image | PNG, JPEG, WebP, GIF (transparent background optional) |
| Data | JSON |
| SQL | Current target, SQLite `.db`, PostgreSQL, MySQL, MariaDB, SQL Server |

Reports follow the [report settings](#report-settings) (cover, fonts, numbering, header, footer).
Desktop PDFs are made by the web view's print engine (WebView2 on Windows); when the report has a
running header, footer or page numbers, the web view's own header (date, report title) and footer
(`page/total`) are printed on every page.

With several tabs open, exports first ask **which schemas** to include; choosing several writes
them all into one folder.

### Printing (a window of its own)

**File → Print…** (Ctrl+P) or the toolbar printer button opens a **separate print window**. The
main window stays usable; the print window can be resized and maximized.

| Control | What it does |
|---------|--------------|
| Diagram / Schema report / Analysis report | What to print; the preview follows at once |
| Portrait / Landscape | A4 orientation (diagram: landscape, reports: portrait by default) |
| Colour (diagram) | **White paper** (light colours) or **current theme colours** |
| Printer · Copies | Windows desktop: prints straight to the chosen printer, no second dialog |
| Save as PDF | Asks where, then saves the preview as a PDF |
| Print | Prints (Ctrl+P works inside the window too) |

The diagram is scaled to one page under a line with the schema name, target database, table and
relationship counts and the time. Choosing a file-only printer such as "Microsoft Print to PDF"
saves through DBTools' own save dialog instead of the driver's. In a browser and on macOS / Linux,
**Print** opens the system print dialog.

---

## 8. Normalization analysis

The **Normalization** tab checks the schema against the chosen normal forms (1NF–5NF) as you edit.
**Analyze → Run analysis** (F5) brings the tab forward. Click a finding to select the table and
highlight the affected columns. Severity is Error, Warning or Info, each with a suggestion.

---

## 9. Index advisor

The **Index advisor** tab suggests indexes for foreign keys, frequently filtered columns and
unique candidates — Required, Recommended or Consider — each with a ready `CREATE INDEX`
statement. Columns already covered are listed as Already indexed.

---

## 10. Start screen and examples

When DBTools starts, the **start screen** covers the editor. Reopen it any time with **Home** on
the menu bar, **File → Start screen** or **Help → Start screen**; close it with **Go to the
editor** or Esc. Untick **Show the start screen when the app starts** (also in Settings →
Appearance) to go straight to the editor.

| Card | Contents |
|------|----------|
| Title | Icon, name, version, **Arrange cards** and **Go to the editor**. **Fixed in place and size** |
| Get started | New · Open project · Open database · Open workspace |
| Recent files | The last 10 files (desktop) |
| Help | User guide · Tutorial · Theme settings |
| Examples (20) | A picture of each diagram in the current theme, name, description, database, table count |
| Moving background | 20 backgrounds · Shuffle · Speed · Card opacity · Random on start · Auto change |

#### Moving and resizing cards

Every card except the title card can be rearranged:

- Drag the **⠿ handle** left of a card's title: a see-through copy follows the pointer; drop it on
  another card to move it there.
- Drag a card's **bottom-right corner** to change its width (1–3 columns) and height; **double-click**
  the corner to fit it again.
- **Arrange cards** on the title card puts every card back.
- The arrangement is saved with the settings.

#### Moving background

Behind the start screen runs a moving background in **the current theme's colours**.

| Setting | What it does |
|---------|--------------|
| 20 backgrounds | Aurora · Waves · Particles · Constellation · Bubbles · Flowing grid · Flowchart · Star field · Rain · Snow · Fireflies · Ripples · Code rain · Hexagons · Orbits · Lava lamp · Spiral galaxy · Confetti · Node network · Ribbons — each button has its own coloured icon |
| Animate | Off leaves the background as a still picture |
| Shuffle | Picks another background at random |
| Speed | 0–300 % (− / + step 10 %), 100 % by default |
| Card opacity | 20–100 % — lower lets more of the background show through the cards |
| Random on start | A different background every time the app starts |
| Auto change | Off · every 15 s · 30 s · 1 min · 2 min · 5 min while the start screen is open |

Drawing stops while the window is hidden, and the background stands still when the system asks
for reduced motion.

### The 20 examples

Click a card — or use **File → Examples** — to open that schema in a **new tab**, fitted to the
window. Each example uses the data types of its own database.

| Example | Database | Contents |
|---------|----------|----------|
| Online Shop | PostgreSQL | Users, categories, products, orders, order items |
| Library | SQLite | Books, authors, members, loans, holds |
| Hospital | PostgreSQL | Patients, doctors, departments, visits, prescriptions |
| School | MySQL | Students, professors, courses, enrolments, grades |
| Human Resources | SQL Server | Departments, employees, positions, payroll, leave |
| Blog | MariaDB | Users, posts, comments, tags, likes |
| Hotel Booking | PostgreSQL | Hotels, rooms, guests, bookings, payments |
| Airline | SQL Server | Airports, flights, seats, passengers, tickets |
| Bank | PostgreSQL | Customers, accounts, transactions, cards, loans |
| Inventory | MySQL | Warehouses, items, suppliers, stock movements |
| Restaurant | SQLite | Menu, tables, orders, order lines |
| Social Network | PostgreSQL | Profiles, follows, posts, messages |
| Video Streaming | MariaDB | Plans, titles, episodes, watch history |
| Real Estate | MySQL | Listings, agents, viewings, contracts |
| Car Rental | SQLite | Branches, cars, customers, rentals, maintenance |
| Event Ticketing | PostgreSQL | Venues, shows, performances, seats, bookings |
| Project Management | SQL Server | Projects, tasks, assignees, time logs |
| Fitness Club | SQLite | Memberships, members, classes, attendance |
| IoT Sensors | MariaDB | Sites, devices, sensors, readings, alerts |
| Vector Search (RAG) | Vector DB | Documents, chunks, embeddings, query log |

Examples never change: edits stay in the tab, and the next time the example opens fresh. Use
**Save as** to keep your version.

**File → Create sample** loads the OnlineShop example; **File → Create all samples…** writes its
project, report, per-database SQL scripts and a SQLite database into a folder.

---

## 11. Settings and themes

**File → Settings** or the gear button on the menu bar.

| Group | Items |
|-------|-------|
| Appearance | Language, theme (20 light · 20 dark · custom), canvas backdrop, start screen, **Theme settings…** |
| Defaults | Database type and relationship line style for new schemas |
| Canvas | Show grid, snap to grid, grid size (5–100) |
| Normalization | Normal forms to check |
| Image export | Transparent background (on by default) |
| Report | Cover page, font and size, heading numbers, header, footer, page numbers |
| Files | Number of recent files (1–50) |

Language and theme apply at once.

### Report settings

The same settings shape every report format. Header and footer text may use `{schema}`, `{db}`,
`{title}`, `{date}` and `{path}`; page numbers use `{page}` and `{total}`. Fonts apply to HTML,
PDF, Word and Excel (Markdown carries no formatting).

### Themes (20 light · 20 dark · custom)

| Light (20) | Dark (20) |
|------------|-----------|
| Light (default) | Dark |
| Paper | Midnight |
| Solarized Light | Solarized Dark |
| Nord Light | Nord |
| Rose | Dracula |
| Forest | One Dark |
| Ocean | Gruvbox |
| High Contrast Light | High Contrast Dark |
| Sky | Monokai |
| Mint | Tokyo Night |
| Lavender | Abyss |
| Sand | Plum |
| Peach | Moss |
| Lemon | Cobalt |
| Sage | Crimson |
| Coffee | Teal |
| Cloud | Bronze |
| Aqua | Carbon |
| Lilac | Neon |
| Pearl | Slate |

Four ways to choose:

- The **theme drop-down** on the menu bar — the button with the palette and the theme's name opens
  **Light 20 | Dark 20** in two columns with your custom themes below; at the top left, **Theme
  settings…** opens the theme window and **Next theme** steps to the next theme.
- **View → Theme**
- **Settings → Appearance**
- The **Theme settings** window (below)

The theme colours the UI **and the ER canvas** (canvas background, grid, table rows,
relationship lines, PK/FK text), the start screen, dialogs, the print window and the user guide
window, and image exports.

#### The theme settings window

Open it from **View → Theme → Theme settings…**, the button in Settings, or the start screen.
Every choice applies to the main window at once, so you can watch the result with the window open.

- **Light 20 / Dark 20** — each tile previews that theme's canvas, panel and accent.
- **Canvas backdrop** — the pattern behind the diagram, always in the theme's canvas colours:

  | Backdrop | Looks like |
  |----------|------------|
  | Solid | One canvas colour |
  | Dots (default) | A dot every 24 px |
  | Grid | Fine grid lines |
  | Gradient | Canvas colour to row colour, diagonally |
  | Blueprint | A grid over an accent-tinted gradient |

  The pattern is fixed to the diagram, so it moves when you pan or zoom. **View → Show grid**
  (the snap grid) is drawn on top of it.
- **Custom themes** — choose five colours (window background, panels, canvas, accent, text), light
  or dark, and a name; the other 40-odd colours (borders, secondary text, row stripes,
  relationship lines, rulers …) are derived. The preview shows the window, canvas and a table.
  - **Start from the current theme** copies the colours on screen.
  - **Save as theme** adds it and applies it. Click a custom theme to edit it again, then **Save
    changes**; the bin button deletes it (deleting the theme in use falls back to Light).
  - Custom themes are stored with the settings (`settings.json`).

### Dialogs are windows of their own

Every dialog (table, column, relationship, settings, themes, about …) opens as a separate
frameless window: drag it by its title bar, close it with the red ✕ or Esc. It sizes itself to its
content, so it never scrolls, and follows the theme. While a dialog is open the main window does
not take input (the print window is the exception). In a browser with pop-ups blocked, dialogs
open inside the page instead.

### Help menu

| Item | What it does |
|------|--------------|
| User guide (F1) | Opens this guide in a window of its own, with contents, language switch and print |
| Tutorial | The hands-on tutorial, in the same window |
| Start screen | Opens the start screen |
| About | Version and licence |

The guide window follows the app's theme and can sit beside the main window. In the web edition
it opens in a new browser tab.

---

## 12. Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| Ctrl+N | New schema |
| Ctrl+O | Open project |
| Ctrl+Shift+O | Open database |
| Ctrl+S / Ctrl+Shift+S | Save / Save as |
| Ctrl+P | Print window |
| Ctrl+Z / Ctrl+Y | Undo / Redo |
| Ctrl+T / Ctrl+L / Ctrl+R | Add table / column / relationship |
| F2 | Edit selected |
| Delete | Delete selected |
| Esc | Select tool, clear selection, close the start screen |
| Ctrl++ / Ctrl+- / Ctrl+0 | Zoom in / out / fit all |
| F5 | Run normalization analysis |
| Ctrl+Shift+R | Save analysis report (Markdown) |
| F1 | User guide |

---

## 13. FAQ

### Can I open `.mdprj` files from DBToolsWinV10?

Yes; the format is the same in both directions.

### `npm start` says port 5174 is in use.

It leaves that port alone and uses the next free one; the terminal shows which.

### Where are settings and recent files kept?

| OS | Folder |
|----|--------|
| Windows | `%APPDATA%\DBTools` |
| macOS | `~/Library/Application Support/DBTools` |
| Linux | `~/.config/DBTools` |

`settings.json` (settings and custom themes), `recent.json` and `window.json` (window place). It is
the same folder the earlier Electron edition used, so settings carry over. The web edition keeps
them in browser storage.

### I pressed Print and no dialog appeared.

On Windows the desktop edition sends the job **straight to the chosen printer**. "Sent to …" in
the print window's status line means it is in the printer queue.

### AVIF export is not offered.

Browsers and web views can decode AVIF but have no encoder.
