# MyMarkDownMaker — Architecture

Tauri 2 (Rust) + vanilla JavaScript (Vite). The shell is MySketchBook's (through MyBoard's fork of it); the
Markdown engine is the earlier Electron/React version's `lib/markdown.js`, kept and extended.

## 1. Windows

One bundle (`src/main.js`) serves every window; the label or the URL picks the module:

| Window | Label / URL | Module |
| --- | --- | --- |
| Main | `main` | `src/app.js` |
| Popups (settings, about, confirm, error, progress, recent, menu, welcome, color, prompt, **print**) | `popup-<kind>` / `?popup=<kind>` (web: frames) | `src/popup.js` (+ `src/print/printwin.js`) |
| Help documents | `doc-<kind>` / `?viewer=` | `src/viewer.js` |
| Render window (PDF, direct printing, system-dialog printing) | `render` / `?render=1` | `src/render.js` |

The render window is created per job by `open_render_window` (lib.rs). For a PDF or a direct print it is *shown*
but placed off every screen (-30000, -30000) without a taskbar button: a hidden WebView2 window barely renders and
paged.js would crawl. It takes its job (`take_render_job`), replaces the page with the standalone HTML, runs paged.js,
fills the contents' page numbers and then: `print_pages_to_pdf` (WebView2 PrintToPdf), `print_direct` (WebView2
Print with printer name, copies, page ranges — no dialog) or `print_window` (system dialog). It answers with the
event `render-done`.

## 2. Source layout

```
src/app.js              main window: shell, document, panels, commands, menus, export, print, start page
src/popup.js            every popup page (settings tabs incl. merge / cover & contents / export font /
                        header & footer / logo; the print window)
src/print/printwin.js   print setup (papers, margins, ranges), page CSS, the preview layout in a frame
src/render.js           the render window
src/editor/editor.js    CodeMirror 6 editor behind a textarea-like handle (silent full-text replacements)
src/editor/images.js    pictures as inline widgets (atomic, resizable, context menu, drop)
src/lib/markdown.js     merge, numbering, outline, figures, cover / contents / figure index, standalone HTML
                        (paged.js @page margin boxes, logo, chapter breaks, heading sizes), Word MHT markup
src/lib/export.js       Markdown / HTML / PDF / Word exports, picture fitting, pictures as separate files
src/lib/paginate.js     paged.js in a frame (page map) and in the render window
src/lib/platform.js     where exports go (desktop dialogs + Rust, web downloads / print tab)
src/lib/images.js       embedded pictures as short mmm-img:N references
src/domain/             settings (+ docsettings: the document's merge / export settings), dochistory (Undo
                        snapshots), problems, samples, recent, helpdocs
src/ui/                 start page, start board, moving backgrounds (16 document scenes), tutorial, dropdowns
src/platform/           native.js (Tauri commands), popups.js (popup host)
src-tauri/src/          lib.rs (windows, popups, render window, commands), markdown.rs (folder scan, file infos,
                        picture embedding), printing.rs (WebView2 print / PDF), files.rs, window_state.rs
                        (place, install reset, install language), instance.rs, fonts.rs, i18n.rs
src-tauri/windows/hooks.nsh   installer: language selector, reinstall question, user data, shortcuts
```

## 3. The document

`state.doc = { files, text, savedText, path, edited, stale, sourceDir, exportName }`.

- `files` change (add, tick, order, sort, merge options) → merge again (`runMerge`), unless the text was edited by
  hand: then `stale` and the user decides (F5).
- The editor owns the text while it is shown; `doc.text` catches up when a line is finished (settle timers), so a
  keystroke costs a keystroke. The contents / figure index follow the headings 0.6 s later (`refreshGenerated`
  without renumbering); renumbering is an explicit command (F7) or happens at merge time.
- Undo / Redo (`domain/dochistory.js`) records snapshots `{ files, text, edited, stale }` before each change; typing
  bursts coalesce. Restoring a snapshot never re-merges.
- The generated parts live in the text between `<!-- mmm:cover -->`, `<!-- mmm:toc -->`, `<!-- mmm:figures -->`
  markers, so the editor shows exactly what the exports lay out.

## 4. Pages and page numbers

- Exports and printing use one standalone HTML (`toStandaloneHtml`): A4 `@page` with margin boxes for header,
  footer, page number and the logo (an SVG wrapper in millimetres around the picture, so it prints sharp at the
  size asked for). paged.js lays it out; contents rows are 3-cell tables (title · leader · page). The leader is a
  run of middle dots clipped to its cell; Word gets a dotted rule instead (it ignores the positioning).
- The preview asks for a page map in the background (`computePageMap`, paged.js in an opacity-0 frame of the main
  window) after the text settles, and shows the numbers when they arrive.
- The print window lays the same HTML out with the chosen paper / orientation / margins (`pageCss`, appended after
  the document's own `@page`) and sends the same CSS with the job.

## 5. Installer and first start

`hooks.nsh` wraps MUI pages (shortcuts page) and asks from `MUI_CUSTOMFUNCTION_GUIINIT`: remove an earlier
installation and install again? → delete user data? → close running copies? It writes the chosen language to
`%APPDATA%\com.shkwon.mymarkdownmaker\install-language`; `window_state.rs` hands it to the page once
(`__MYMARKDOWNMAKER_INSTALL_LANGUAGE__`), and `settings.applyInstallLanguage` sets it. An `install-reset` marker resets
preferences (not recent files or the session) after a reinstall.

## 6. Tests

`npm test` (scripts/test.mjs): unit (`test/unit/app.test.js`), texts (`scripts/i18n-check.mjs`), Rust
(`cargo test --lib`), web E2E (`test/e2e/web.suite.mjs`, headless Edge on free ports, every command), tutorial
(every step), desktop E2E with `--desktop`. Results in `test-results/`.
