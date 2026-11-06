# MyMeeting Architecture

MyMeeting is a Tauri 2 application. A small Rust shell owns windows, files and printing; everything the user sees is a React 19 + TypeScript single-page app built by Vite. The Electron version was replaced because Tauri uses the system WebView: the installer is a few MB and the window appears almost immediately.

```
┌──────────────────────── Rust shell (src-tauri) ────────────────────────┐
│ main.rs   settings · drafts · files · fonts · print · close guard      │
│ popout.rs frameless child windows for dialogs                          │
└───────────────▲──────────────────────────────────────────▲─────────────┘
                │ invoke / events                           │ on_new_window
┌───────────────┴──────────── WebView (dist/) ─────────────┴─────────────┐
│ host.ts  ── the only module that talks to Tauri (falls back in browser) │
│ App.tsx  ── meeting state, commands, shortcuts, undo, autosave          │
│ components/ · editor/ · print/ · start/ · document.ts · themes.ts       │
└──────────────────────────────────────────────────────────────────────────┘
```

## Rust shell

`src-tauri/src/main.rs` registers these commands:

| Command | Purpose |
|---------|---------|
| `load_settings` / `save_settings` | JSON settings in the app config folder |
| `load_draft` / `save_draft` | autosaved meeting, restored on the next start |
| `startup_file` | file passed on the command line or opened by the OS (macOS `Opened`) |
| `read_text` / `write_text` | open and save `.mtg` files and exports |
| `system_fonts` | installed font families for the font picker |
| `app_info`, `open_external` | About dialog, links |
| `print_window` | native print of the WebView |
| `window_ready`, `close_guard_ready`, `main_close` | show the window after first paint; ask about unsaved changes before closing |
| `popout_*` | popup window management (below) |

File dialogs use `tauri-plugin-dialog`. The window stays hidden until React reports `window_ready`, so there is no white flash.

`tauri.conf.json` has no `devUrl` for release builds: `cargo run` embeds `dist/`, so run `npm run build:ui` first. `npm run dev` (`scripts/dev.mjs`) starts Vite and the app together.

## Frontend modules

| Module | Responsibility |
|--------|----------------|
| `host.ts` | wraps `invoke`; in a browser it uses `localStorage`, `<input type=file>` and downloads, so `npm run dev:web` works without Rust |
| `meeting.ts` | the `Meeting` model (details, attendees, agenda, body, decisions, action items), defaults, sample, normalisation of loaded files |
| `App.tsx` | state, commands, keyboard shortcuts, undo/redo history, autosave, recent files, screenshot mode |
| `components/MeetingForm.tsx` | the document: title, details, "+" lists, editor, decisions, action items |
| `components/controls.tsx` | list rows with add/move/delete, date and time inputs |
| `components/Panels.tsx` | outline and preview panes |
| `components/Toolbar.tsx`, `ToolbarMenu.tsx` | toolbar and menus |
| `components/StartScreen.tsx`, `start/` | start screen, card layout, animated backgrounds |
| `components/Preferences.tsx` | settings: general, document, theme, start screen |
| `components/PrintDialog.tsx`, `print/` | page setup, pagination, preview, print |
| `components/Guide.tsx` | user guide viewer for `doc/UsersGuide*.md` |
| `components/Tutorial.tsx`, `tutorials.ts` | tutorial chooser and step card |
| `components/dialogs.tsx`, `popout.ts` | dialogs that render into their own windows |
| `editor/` | WYSIWYG editor, HTML→Markdown, icon picker |
| `document.ts` | one meeting → HTML, Markdown, text, Word |
| `themes.ts` | 40 built-in themes and custom themes as CSS variables |
| `templates.ts` | loads `templates/*.json` with `import.meta.glob` |
| `i18n.ts`, `locales/` | Korean and English |

## Editor

The discussion is a `contentEditable` element (`editor/RichEditor.tsx`); there is no source tab. The model stores Markdown: `markdown.ts` renders it with `marked` and sanitises with DOMPurify, and `editor/htmlToMarkdown.ts` converts the edited DOM back. Markdown shortcuts (`# `, `- `, `1. `, `> `), tables with Tab navigation, pictures and video (embedded as data URLs, resizable) and pasted HTML are handled in the editor.

Icons (`editor/docIcons.ts`, `IconPicker.tsx`) are 135 coloured SVGs inserted as `<img src="data:image/svg+xml;base64,…" alt="icon:name">`. Because they are ordinary images, they survive the Markdown round trip and appear in the preview, print and every export without extra code.

Program icons (`icon-paths.ts`, `components/Icons.tsx`) are duotone SVG paths, each with a colour tone, 170 in total.

## Document pipeline

`document.ts` builds every output from the same `Meeting`:

- `meetingHtml` — the page body used by the preview, print and HTML export, with `DOC_CSS`
- `meetingMarkdown`, `meetingText`
- Word export — HTML with Office namespaces and `@page` size and margins, saved as `.doc`

## Printing

`print/pageSetup.ts` holds paper sizes, orientation, scale, margins, header and footer templates and the page range. `print/paginate.ts` lays the document out in an off-screen frame at the paper size and splits it into pages, filling `{title} {date} {time} {page} {pages}`. The print dialog shows those pages as the preview; printing writes the selected pages into a print frame and calls `print_window` (or `window.print()` in a browser). PDF goes through the system print dialog.

## Popup windows

Every dialog is a real OS window that can leave the main window:

1. `popout.ts` calls `window.open("about:blank#dialog-…")`.
2. Rust `on_new_window` (`popout.rs`) creates a frameless, transparent window owned by the main window and returns it to the WebView, so the opener keeps a `Window` handle on the same JS realm.
3. React renders the dialog into that window's `document.body` with `createPortal`; styles are copied over and kept in sync with the theme.

Label prefixes choose the behaviour: `dialog-` is modal (the main window is disabled), `dialog-free-` is resizable and large (print, user guide), `dialog-tool-` is a small non-modal tool window placed at the bottom right of the main window (tutorial card). The header has `data-window-drag`; `WindowButtons` provides minimise and a close button that turns red on hover.

Closing a window and opening the next one at the same time used to deadlock the UI thread, so closes are queued (`closePopout`) and `openPopoutSoon` waits for them. In a browser, in screenshot mode, or with `MYMEETING_INLINE_DIALOGS=1`, dialogs render inline instead.

## Undo, autosave and files

`App.tsx` keeps a bounded history of meeting snapshots; typing is grouped so one undo step covers a burst of edits. The current meeting is saved with `save_draft` shortly after each change and restored on start. Files are JSON (`.mtg`) and are normalised on load so older files open.

## Templates

`templates/*.json` each have `id`, `order`, `icon`, `name` and `description` in both languages and a `meeting` for `ko` and `en`. They are bundled at build time; adding a file adds a template.

## Themes

`themes.ts` defines 20 light and 20 dark themes as sets of CSS variables (background, panels, text, accent, borders). Custom themes are stored in settings, up to 24. The start screen background is rendered by `start/backgrounds.ts`.

## Tutorials and user guide

`tutorials.ts` defines the tutorials as steps with a target selector, a completion check and an optional "do it for me" action. The guide and tutorial images live in `doc/images/{ko,en}-NAME.webp`; `docImages.ts` picks the current language and falls back to the other one.

`scripts/screenshots.mjs` starts headless Edge against the dev server and opens `?shot=NAME&lang=…&theme=…`. `App.tsx` stages each shot (sample data, open dialogs) so the images are reproducible.

## Tests

`npm run typecheck` checks the frontend, `cargo test` in `src-tauri` checks the popup window rules, and `npm test` runs `test/run.mjs`.
