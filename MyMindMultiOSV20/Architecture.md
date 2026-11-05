# MyMind Architecture

**Product:** MyMind 2.0.0  
**Author:** SHKWON (`knix008@naver.com`)  
**Copyright:** Copyright © 2026 SHKWON

## 1. Overview

MyMind is a cross-platform diagram editor that runs as:

1. **Desktop app**: Tauri 2 (Windows / macOS / Linux), using the system's WebView
2. **Web app**: the same page in a browser (`npm run dev:web`), with downloads instead of file access

```
┌─ MyMind process ──────────────────────────────────────────┐
│  ┌─ WebView ───────────────────────────────────────────┐  │
│  │  UI (React): App, Toolbar, StartScreen, Preferences,│  │
│  │              SidePanels, DiagramCanvas, dialogs     │  │
│  │      │ useAppState                                  │  │
│  │      ▼                                              │  │
│  │  Model (no UI): store/document, layout/engine,      │  │
│  │                 settings, themes, start/layout      │  │
│  │      │                                              │  │
│  │      ▼                                              │  │
│  │  host.ts (the only door to the desktop)             │  │
│  └──────┬─────────────────────────────▲────────────────┘  │
│         │ invoke                      │ events            │
│  ┌──────▼─────────────────────────────┴────────────────┐  │
│  │  Rust shell: main.rs (window, settings, files,      │  │
│  │              fonts, close guard), popout.rs         │  │
│  └─────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────┘
```

## 2. Technology stack

| Layer | Technology |
|-------|------------|
| UI | React 19, TypeScript, Vite 7 |
| Desktop shell | Tauri 2 (Rust) with the dialog and single-instance plugins |
| Fonts | fontdb lists the installed families; Outfit and Noto Sans KR ship with the app |
| i18n | i18next, react-i18next (ko, en) |
| Packaging | Tauri bundler (NSIS / DMG / AppImage / deb) |
| Tests | Node with esbuild (`npm test`), the real program over the DevTools protocol (`npm run test:gui`), `cargo test` |

## 3. Directory structure

```
MyMindMultiOSV20/
├── src-tauri/
│   ├── src/main.rs        # Window, settings.json, file commands, close guard, file arguments
│   ├── src/popout.rs      # Frameless windows for dialogs
│   ├── tauri.conf.json    # Product, bundles, resources, file association
│   ├── capabilities/      # What the page may call
│   ├── windows/hooks.nsh  # Installer: language, file icon, clean uninstall
│   └── linux/             # MIME type and post-install script for the deb
├── src/
│   ├── main.tsx           # Reads settings, applies the theme, renders, shows the window
│   ├── App.tsx            # Composes everything
│   ├── host.ts            # Every call to Tauri
│   ├── popout.ts          # Dialog windows: mirrors styles into them, sizes them
│   ├── settings.ts        # What is stored, limits, validation (pure)
│   ├── diagramThemes.ts   # Mind map themes (pure)
│   ├── nodeIcons.ts       # Icons a shape can carry (pure)
│   ├── memo.ts            # Memo defaults, validation, text wrapping (pure)
│   ├── lineThemes.ts      # Line themes (pure)
│   ├── tutorials.ts       # Tutorial steps (pure)
│   ├── canvasGrid.ts      # Grid and ruler lines (pure)
│   ├── themes.ts          # 40 themes, user themes, readability rules (pure except applyTheme)
│   ├── minsize.ts         # Toolbar form (labels or icons) and the window's minimum width
│   ├── markdown.ts        # Enough Markdown for the guide; builds data, never HTML
│   ├── tooltips.ts        # Every button gets a tooltip
│   ├── icon-paths.ts      # Icon drawings
│   ├── components/        # Toolbar, StartScreen, Preferences, Guide, dialogs, controls,
│   │                      # SidePanels, DiagramCanvas, ContextMenu, StatusBar, previews
│   ├── hooks/             # useAppState, useSystemFonts
│   ├── store/document.ts  # Document model (pure)
│   ├── layout/engine.ts   # Mind map and fishbone layouts (pure)
│   ├── start/             # backgrounds.ts (24 canvas drawings), layout.ts (card board)
│   ├── styles/            # global, chrome, start, icons, fonts
│   ├── utils/             # exportImage, shapePath
│   └── i18n/              # ko.json, en.json
├── assets/                # App and file icons, with their SVG sources
├── doc/                   # UsersGuide.md, UsersGuide.en.md (bundled into the app)
├── template/              # Sample diagrams and index.json, shipped as a resource
├── scripts/               # dev, free-port, build-e2e, cdp, copy-installer, gen-icons, gen-samples
└── test/                  # run.mjs, gui.mjs, reporter.mjs
```

## 4. Process model

### 4.1 Rust shell

- Builds the main window **hidden**, at the saved position and size. The page shows it (`window_ready`) once its theme is applied, so the wrong colour never flashes; a timer shows it after 5 s whatever happens.
- Keeps `settings.json` in `%APPDATA%/com.shkwon.mymind` (`MYMIND_SETTINGS_DIR` moves it). `save_settings` merges, so the page never overwrites the saved window bounds.
- **Close guard**: once the page has said `close_guard_ready`, a close request (Alt+F4, the taskbar) is held and `close-requested` is sent to the page. The window really closes through `main_close`.
- **Files**: `read_text`, `write_text`, `write_base64`. A `.mmap` on the command line comes from `startup_file`; a second start passes its file to the first through the single-instance plugin (`open-file`). macOS delivers it as an event, handled the same way.
- **Minimum size**: the page reports what its top rows need (`window_min_size`). Windows applies a minimum only to sizing with the mouse, so `Resized` enforces it as well.

### 4.2 Dialog windows

`window.open("about:blank#dialog-<name>-<n>")` reaches `on_new_window`, which builds a frameless window owned by the main one. The document belongs to the page, so React renders into it with a **portal**: same state, same handlers. `popout.ts` copies the stylesheets and the `<html>` attributes and keeps copying them, so a theme change reaches an open dialog. The window stays hidden until the content has been measured; the main window takes no input meanwhile. The guide is the exception (`standsFree`): no owner, its own taskbar button, resizable, and the main window keeps working.

In that document, use `ownerDocument.defaultView` for window events and never `instanceof Element` (it is another realm). In the browser, and with `MYMIND_INLINE_DIALOGS` in the tests, dialogs stay inside the page.

### 4.3 Page

Only `host.ts` knows Tauri. `isDesktop` decides between the host and the browser's file input and downloads. Reading the settings comes first in `main.tsx`, since the theme and the language depend on them.

## 5. UI composition

```
┌─ Title row (moves the window) ──────────────────────────────┐
│ Icon MyMind 2.0.0 [Start] File▾ Edit▾ View▾ Help▾ name  ─ □ ✕│
├─ Toolbar ───────────────────────────────────────────────────┤
│ New Open Save Export │ Undo Redo │ Mind map Fishbone Layout▾│
│ │ Center Align Grid          Theme▾ Language Settings About │
├─ Workspace ─────────────────────────────────────────────────┤
│ Node tree │ DiagramCanvas (SVG)            │ Properties     │
│           │   StartScreen lies over all of this when shown  │
├─ StatusBar ─────────────────────────────────────────── grip ┤
```

| Component | Responsibility |
|-----------|----------------|
| `Toolbar` | Title row, menus, toolbar, theme list, window buttons, reports the minimum width |
| `StartScreen` | Moving background, card board (move, resize, arrange), shortcuts, recent files, samples, theme and background pickers |
| `Preferences` | Settings window: General, Theme (with the user theme editor), Start |
| `Guide` | The user guide, in a free window, with its own language and text size |
| `dialogs` | `Dialog` (window or inline), Unsaved, Confirm, Message, Input, Export, About |
| `controls` | `IconSelect`, `Stepper`, `RangeStepper`, `ColorField`, `Toggle`, `GripDots` |
| `ToolbarMenu` / `ToolbarDropdown` | Action and value drop-downs in a portal |
| `SidePanels` | Left: node list as a tree. Right: node and edge properties. Each has a title row and folds to a strip (`--left`, `--right` on the workspace) |
| `LinePreview` / `ShapePreview` | Small SVG previews |
| `DiagramCanvas` | SVG rendering, pan, wheel zoom, node drag, edge select, marquee, grid, view fit |
| `ContextMenu` | Right-click actions |

The start screen lies **over** the workspace rather than replacing it: a diagram opened from it must be fitted to the real canvas, which has no size when hidden. Keyboard editing is off while it shows.

## 6. Application state

Central hook: `useAppState` (`src/hooks/useAppState.ts`).

| State | Source | Persistence |
|-------|--------|-------------|
| `doc` | `DiagramDocument` | `.mmap` file on save |
| `settings` | `AppSettings` (`settings.ts`) | `settings.json`, each change as a patch; `localStorage` in the browser |
| `showStart`, dialog flags, `zoom`, `editingId` | UI | Session only |
| Undo/redo history | `past` / `future` refs | Session only |

- **Undo/Redo**: a `useEffect` records the previous `doc` when its content changes by reference; selection-only changes are not recorded.
- **Unsaved work**: `guardUnsaved(next)` runs `next` at once or after the Save / Don't Save / Cancel dialog. New, Open, recent files, samples and closing all go through it.
- **Samples** open with no file path, so saving asks for a name and the shipped file stays as it is.
- Anything read from `settings.json` goes through `sanitizeSettings`.

## 7. Domain model

```ts
DiagramDocument {
  version: 1
  mode: 'mindmap' | 'fishbone'
  layout: 'radial' | 'ltr' | 'rtl' | 'ttb' | 'btt'
  defaultShape, defaultLine, defaultLinePattern
  nodes: DiagramNode[]
  edges: DiagramEdge[]
  selectedId, selectedIds, selectedEdgeId, filePath, dirty  // runtime / UI
}
```

- **Nodes**: tree via `parentId`; 12 `shape` values; Fishbone `role` (`effect` | `category` | `cause`); optional `note`; `textStyle` = `{ fontFamily (preset or system font), fontSize, color ('auto' → black), bold, italic, underline, strike }`
- **Edges**: parent → child; `lineType`, `linePattern`, `color`, optional `startCap`/`endCap` (`none`|`arrow`|`dot`|`diamond`), and optional `fromSide`/`toSide` (`auto`|`top`|`bottom`|`left`|`right`) manual connection-face overrides
- **Selection**: `selectedId`/`selectedIds` (nodes) and `selectedEdgeId` (a single edge) are mutually exclusive; none are serialized
- Manual drag updates `x`/`y` without relayout (group drag moves the whole selection)

## 8. Layout engine

`src/layout/engine.ts`

| Mode / layout | Behavior |
|---------------|----------|
| Mindmap · radial | Recursive **sector (wedge)** layout: each node owns an angular slice split among children by leaf count, so branches never cross |
| Mindmap · ltr / rtl | Horizontal tree; connectors follow the layout axis |
| Mindmap · ttb / btt | Vertical tree top→bottom / bottom→top |
| Fishbone | Nested Ishikawa. Categories alternate above/below the spine, **balanced by subtree size**; each node fans its children up/down, each child in its own horizontal slot (dynamic spacing from subtree reach) so **nodes never overlap**. A per-side clamp keeps a branch on its side of the spine. Spacing is tuned to be compact. |

Layout runs on new document, mode switch, layout change, and Auto Align — re-fit (zoom-to-fit) to the real viewport — not on every resize or node drag. The canvas re-derives fishbone bones/axes from node positions using a fixed angle, so they follow dragged nodes.

## 9. Rendering

- SVG scene with pan (`translate`) and zoom (`scale`); wheel zoom 10%–400%, centered on the viewport; view-fit scales to show the whole diagram
- Shapes built by `src/utils/shapePath.ts` (12 shapes)
- Connectors attach at the **midpoint of the facing node surface** (per-shape insets keep the point on slanted/curved outlines); `fromSide`/`toSide` override the face. Curve/elbow arrive perpendicular to the face; caps use per-colour markers with explicit fills
- **root** line renders as a filled, depth-tapered ribbon; Fishbone skeleton (spine/sub-axes/bones) drawn as filled tapered shapes honouring edge colour/pattern
- Node label uses `text-anchor`/`dominant-baseline` **attributes** (not only CSS) so exports match the screen
- `note` shows a ✎ badge + `<title>` tooltip; selected node/edge highlighted with the accent colour
- Marquee select (left-drag on empty canvas); middle-button drag pans; left-drag pans when the grid is on
- Export clones the live SVG, strips pan/zoom + grid, resolves CSS variables, crops to content, and outputs SVG or rasterizes to PNG/JPEG/WebP (`src/utils/exportImage.ts`), with optional transparent background

## 10. Internationalization, themes and the start screen

- Locales: `src/i18n/locales/ko.json`, `en.json`. `npm test` checks that both have the same keys and that every `t('...')` exists.
- **Themes**: `themes.ts` builds 40 themes (and the user's) from ten colours into CSS variables on `:root[data-theme]`. `global.css` derives the names the panels use (`--text`, `--border`, `--bg-canvas`). Readability is enforced when a theme is built: text is settled against the panel, other surfaces move toward the panel, and `npm test` checks the contrast of all 40.
- The variables an exported SVG takes (`--spine`, `--node-stroke`, `--grid-line`, ...) are plain colours, not `color-mix()`: an SVG must stand alone.
- **Backgrounds**: `start/backgrounds.ts` draws each as a pure function of time, in the theme's colours. The picker's chips are the same drawing at a small size. The clock lives outside React.
- **Grid and rulers**: `canvasGrid.ts` computes the lines for both, so ruler ticks sit on grid lines. They are drawn in screen pixels from the current pan and zoom (one crisp pixel wide), and a cell keeps 10 to 50 pixels by changing level by a factor of five. The grid has no `transform`: the export takes the first transformed group as the diagram, and removes `.canvas-grid`.
- **Mind map themes**: `diagramThemes.ts`, a diagram's dress: node colours by branch, shapes, text and a line theme. `applyDiagramTheme` stores `diagramTheme` in the file, and new shapes follow. The canvas always takes the program theme's colours.
- **Line themes**: `lineThemes.ts`, separate from the colour themes. `applyLineTheme` styles every edge (colours by branch) and is stored in the file as `lineTheme`, so new edges follow it. Individual edges can still be changed afterwards.
- **Tutorials**: `tutorials.ts` is pure: each step has `done(doc)` and `apply(doc)`, and `npm test` walks every step in both languages. The card only reads the document.
- **Printing**: `PrintDialog` is a window of its own with the page setup (`pageSetup.ts`, pure) and a preview. `utils/print.ts` draws the sheets as HTML with their margins and headings on the sheet itself (`@page { margin: 0 }`), the same for the preview and for paper, and spreads a diagram over several sheets by viewBox. The main window prints them with the system's dialog: on Windows `ICoreWebView2_16::ShowPrintUI` with the system kind, as WebView2's default opens inside the window.
- **Export**: the page encodes PNG, JPEG, WebP and SVG; `write_converted` in `main.rs` encodes the rest (AVIF, GIF, BMP, TIFF, TGA, ICO, PPM, QOI, Farbfeld, EXR, HDR) from a PNG.
- **Card board**: `start/layout.ts` keeps cards on three columns and 20 px rows without overlaps; a card fits its content until resized by hand.

## 11. Packaging and installer

`src-tauri/tauri.conf.json`, with `npm run build:win`, `build:mac` or `build:linux`. The installers are copied to the project root.

| OS | Output |
|----|--------|
| Windows | NSIS, per user, Korean or English |
| macOS | DMG |
| Linux | AppImage, deb |

- **Installer hooks** (`windows/hooks.nsh`, UTF-8 with BOM): ask the language at every install and leave it in `install-language.txt`, which is the program's first language; give `.mmap` its own icon; clean the registry on uninstall.
- **Resources**: `template/` and `file-icon.ico`.
- The template's "delete app data" option on uninstall covers the settings, as their folder is named after the identifier.
- Version 1 was an Electron program with its own uninstall entry. The two can be installed side by side; the file association goes to whichever was installed last.

## 12. File format

Extension: **`.mmap`** (JSON, UTF-8). Legacy **`.mymind`** files still open.

Serialized fields (runtime UI fields such as `selectedId` / `selectedIds` / `selectedEdgeId` / `filePath` / `dirty` omitted):

```json
{
  "version": 1,
  "mode": "mindmap",
  "layout": "radial",
  "defaultShape": "rounded",
  "defaultLine": "curve",
  "defaultLinePattern": "solid",
  "nodes": [ /* id, parentId, text, x, y, width, height, shape, color, textStyle{fontFamily,fontSize,color,bold,italic,underline,strike}, note?, role? */ ],
  "edges": [ /* id, from, to, lineType, linePattern, color, startCap, endCap, fromSide, toSide */ ]
}
```

## 13. Security notes

- The page can call only the commands in `generate_handler!` and the permissions in `capabilities/default.json`.
- `open_external` accepts only `mailto:` and `https://` addresses.
- The guide's Markdown becomes React elements, never HTML. Icons are the only `dangerouslySetInnerHTML`, and they come from the source.
- Dialog window labels are checked in `popout.rs`; anything else asked of `window.open` is refused.

## 14. Extension points

| Area | Where to change |
|------|-----------------|
| New shape | `types.ts`, `settings.ts` (SHAPES), `utils/shapePath.ts`, `SidePanels` (SHAPE_VALUES), i18n |
| New line style / cap | canvas path helpers and markers, `LinePreview`, `SidePanels`, `settings.ts`, i18n |
| New layout | `layout/engine.ts`, toolbar options, `settings.ts`, i18n |
| New theme | one line in `themes.ts` (the tests check its contrast) |
| New background | one function in `start/backgrounds.ts`, its name in both locales |
| New setting | `settings.ts` with its sanitizer and a test, `Preferences`, i18n |
| New desktop feature | a command in `main.rs`, one line in `host.ts`, and a browser fallback |
| Export formats | `utils/exportImage.ts`, `ExportDialog` |
| Undo granularity | `useAppState` history effect |
