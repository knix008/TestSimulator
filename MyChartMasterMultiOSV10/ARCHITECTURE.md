# MyChartMaster — architecture

MyChartMaster makes charts from tables for **Web, Windows, macOS and Linux** (Tauri 2). The window chrome, themes,
icons, start page (card board with a fixed program card), popup windows, settings, tutorial and documents follow
`../MyNetManagerMultiOSV10` (itself styled after MyUMLMaker): frameless window, brand + Home + menus in the title
row, coloured icon toolbar never clipped, tabs, status bar, popups as OS windows on the desktop and frames on the web.

Product name `MyChartMaster`, identifier `com.shkwon.mychartmaster`, package `mychartmaster`, localStorage prefix
`mychartmaster.`, env prefix `MYCHARTMASTER_`, dev server port **1476**, file type `.mychart`.

## Folders

```text
src/
  main.js app.js popup.js viewer.js styles.css chart.css themes.js icons.js icons-net.js icons-chart.js icons-chart-more.js
  icon-tones.js i18n.js i18n/{ko,en,chart-ko,chart-en}.js popups-chart.js stepper.js flags.js
  ui/        shell helpers (dom, tooltip, dropdown, startboard, startlayout, startpage, background, tutorial)
  views/     chartview.js (gallery + stage + panels), datagrid.js (virtual grid), inspector.js (five tabs)
  platform/  native.js (Tauri / web boundary), popups.js (popup windows), idb.js (web file handles)
  domain/
    settings.js recent.js helpdocs.js
    data/      table.js importers.js exporters.js zip.js xml.js
    chart/     types.js render.js palettes.js doc.js samples.js
    export/    chartexport.js docexport.js images.js
src-tauri/   Rust: windows, popups, files, printing, fonts, instances, AVIF (ravif)
test/        unit (node:test), e2e (CDP: web.harness/suite, desktop.harness/suite, features.mjs)
doc/         Tutorial.md, Tutorial.en.md, UserGuide.md, UserGuide.en.md, images/{ko,en}
samples/     generated .mychart samples and data files (npm run samples)
```

All domain modules are plain ES modules without DOM (except `chartexport.js`'s raster path, which needs a canvas),
runnable under Node 22 (`node --test`).

## Contracts between modules

### Table — `src/domain/data/table.js`

```js
Table = { columns: [{ name: string, type: 'number' | 'text' | 'date' }], rows: Cell[][] }   // every row as long as columns
Cell  = number | string | null

createTable(names | [{ name, type }], rows) → Table      // pads rows, infers types
fromMatrix(rows, { header: 'auto'|'yes'|'no', decimal: 'auto'|'.'|',', maxRows }) → Table   // header detection, numbers coerced
parseNumber(text, { decimal }) → number | null           // "1,234.5", "1.234,5", "12%", "$3", "₩1,000", "(42)", "1.2k"
parseDate(text) → ms | null                              // ISO, slashes, "2024년 3월 1일"
inferTypes(table) / coerceNumbers(table)                 // in place
setCell, renameColumn, insertRow, deleteRows, insertColumn, deleteColumns, moveColumn, sortRows, transpose → new Table
matchingRows(table, text) → row indices; columnStats(table, c) → { count, numbers, empty, distinct, sum, mean, median, … }
```

Edits never change their input; `ChartDoc.setTable` keeps the old one for undo.

### Importers and exporters — `src/domain/data/importers.js`, `exporters.js`

```js
importData(bytes | string, name, { header, delimiter, encoding, decimal, sheet, maxRows, format? })
  → Promise<{ format, table, sheets?, sheet?, delimiter?, document? /* .mychart JSON */ }>
importPasted(text, options) → same   // tab-separated, CSV, Markdown, HTML or JSON as it looks
detectFormat(name, bytes) → 'mychart'|'csv'|'tsv'|'text'|'json'|'xlsx'|'ods'|'xml'|'html'|'markdown'
decodeText(bytes, 'auto' | encoding)  // BOM, UTF-8 (fatal), EUC-KR, Windows-1252
exportData(table, 'csv'|'tsv'|'json'|'markdown'|'html', { title }) → string;  toXlsx(table) → Promise<Uint8Array>
```

Errors are thrown as `new Error('import.empty')` etc.; the app shows `t('error.<code>')`.
`zip.js` reads stored / deflated entries (DecompressionStream `deflate-raw`) and writes archives; `xml.js` is a
forgiving XML / HTML reader (`parseXml(text, { html })`, `findAll`, `textOf`, `attr`).

### Charts — `src/domain/chart/`

```js
CHART_TYPES: [{ id, group, ko, en, koDesc, enDesc, roles: [{ id, kind: 'any'|'number', multi?, optional? }], icon }]
autoMapping(table, type, previous?) → mapping       // keeps what still fits; category from text, values from numbers
Chart = { type, title, subtitle, mapping: { category, values[], x, y, size, label, group, open, high, low, close,
          source, target }, options: defaultOptions() }   // mapping numbers are column positions

renderChart({ table, chart }, { width, height, language, theme, titles, animate })
  → { svg, width, height, marks, legend: [{ name, color, hidden }], warnings, chart /* normalized */, error }
```

`render.js` is pure: text widths are estimated (CJK wider), scales use `niceTicks` (or log decades), category labels
rotate or thin out when crowded. Marks are `class="mark …" data-s data-r data-tip`; legend items `data-legend`.
With `titles: true` (exports) each mark also gets an SVG `<title>`. A chart that cannot be drawn (no rows, no number
column) returns `error` and an SVG with the message. `palettes.js` has 20 categorical palettes, 8 ramps and colour
helpers (`seriesColor` honours `options.colors[i]`).

`ChartDoc` (doc.js): `{ id, name, path, handle, table, chart, dirty, undoStack, redoStack, selection, source? }`;
`setTable`, `setChart(patch, { merge })` (a run of edits with the same merge key within 1.2 s is one undo step),
`setType`, `undo`, `redo`, `toJSON` / `serialize` / `ChartDoc.fromJSON`. `.mychart` = `{ format: 'mychart', version: 1,
app, created, modified, chart, data }`.

`starters.js`: `STARTERS`, the starter table of each type that has no sample (low/high, flows, tasks, dates, raw
measurements …); `starterFor(type)` takes the type's sample, else its starter, else its base type's sample.
`samples.js`: `SAMPLES` (31; `build(language)` → `{ name, table, chart }`), `SAMPLE_GROUPS`,
`starterFor(type)` (the data a new chart of a type opens with), `blankTable()`.

### Exports — `src/domain/export/chartexport.js`

`exportChart(doc, format, { width, height, scale, background, includeData, language, theme, paper, orientation,
quality, avif })` → `{ content, ext, mime }` for png, jpg, webp, gif, avif (`images.js`, AVIF through the Rust
`encode_avif` command on the desktop), svg, pdf (`chartPdf`: JPEG picture page + monospaced data pages with the
reader's Korean CID font), html (`chartHtml`: inline SVG with a tooltip script and the data table), docx and markdown
(`docexport.js` with the picture and `chartDataTable`).

### App, views and popups

- `app.js` holds the tabs (`state.docs`), the command table (menus, toolbar, shortcuts, context menus and the
  tutorial all run commands by id), file I/O through `platform/native.js`, and the popup message handlers.
- `views/chartview.js` mounts once per active tab and is refreshed on changes (`update({ inspector, grid })`); the
  inspector is not re-rendered while the user is typing in it (live `input` events), only on `change`.
- `views/datagrid.js` draws only the visible rows; edits go back through the app (`changeTable`) so they are undoable.
  An edit in progress belongs to the tab it started in (switching tabs drops it).
- `popups-chart.js` (export, import, print, palette, datastats + Settings tabs Layout, Charts, Data) asks the main
  window for data with actions (`chart-preview`, `import-preview`, `print-request`, `stats-request`) and gets
  `{ type: … }` messages back. Popup kinds must match `POPUP_KINDS` in `src-tauri/src/lib.rs` (a unit test checks).
- `sheet.js` (+ `sheet.css`, `icons-sheet.js`, `i18n/sheet-{ko,en}.js`) is the **data editor window**: the active chart's table as an
  Excel-like sheet in a window of its own (desktop `doc-sheet` through `open_doc_window`; web `index.html?viewer=sheet&ch=…`).
  The main window owns the data and the undo history: it sends `{ type: 'doc' | 'state' | 'none' | 'close' | 'ping' }`
  (Tauri event `sheet-to-window` / BroadcastChannel `mychartmaster-sheet-<ch>`), the window answers with `edit`, `undo`,
  `redo`, `activate`, `make-chart`, `chart-range`, `open-data`, `open-chart`, `print`, `dock`, `closed` (`sheet-to-main`).
  `domain/data/formula.js` (parser, ~110 functions, reference moves, number formats) and `domain/data/sheet.js`
  (sheet rows = header row + table rows; formulas / formats / widths in `doc.sheet`, saved in .mychart and .xlsx).
- `ui/background.js` draws the twenty chart animations on a canvas (30 fps, paused while hidden).

### Tests — `scripts/test.mjs`

The same runner and look as the other projects (MyMarkDownMaker): a live line per test (`[elapsed] N ✔ group › name
(time)` with a spinner), then per category a table (failures first, slowest first, time bars), a boxed summary
(Category / Pass / Fail / Skip / Total / Time), the failed list, `test-results/results.json` and `report.txt`.

| Category | What runs |
| --- | --- |
| `unit` | node:test over `test/unit/*.test.mjs` (data, charts, the 108 types and their starters, chart themes, documents, settings, texts) |
| `i18n` | `scripts/i18n-check.mjs` as four checks |
| `rust` | `cargo test --lib` (own target folder `src-tauri/target/test`) |
| `web` | `test/e2e/web.suite.mjs` on `web.harness.mjs` (build in `test-results/web/dist`, own headless Edge): every feature of `features.mjs` must have a passing case; `commandCases()` adds one case per chart-type, chart-theme, palette, background and legend command |
| `tutorial` | every tutorial step in the web build, clicked through the card's own Next button |
| `desktop` | `test/e2e/desktop.suite.mjs` on `desktop.harness.mjs` (Windows: the debug build over WebView2 CDP, own profile and data folders, closes only its own process; nothing is printed). Skipped when there is no debug build; `MYCHARTMASTER_E2E_EXE` points at a build of its own, e.g. one built with `CARGO_TARGET_DIR=src-tauri/target/e2e` while `npm start` holds `target/debug` |
