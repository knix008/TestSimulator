# MyDockBar — Architecture

How the application is put together, and why the parts that are not obvious are
the way they are. For the feature list and build commands see
[README.md](README.md); for how to *use* the dock see
[UsersGuide.md](UsersGuide.md).

---

## 1. Process model

Tauri 2: one native process in Rust, and a system webview (WebView2 on Windows,
WKWebView on macOS, WebKitGTK on Linux) for each window.

```
┌─ Rust (src-tauri/src/) ─────────────────────────────────────┐
│  lifecycle, windows, tray, native menus, filesystem,        │
│  process/window enumeration, settings on disk               │
│  `dock-driver` thread: placement, auto-hide, pointer poll   │
└───────────┬──────────────────────────────┬──────────────────┘
            │ commands / notifications     │
            │ (src/bridge.js)              │
┌───────────▼──────────────┐  ┌────────────▼──────────────────┐
│ dock page                │  │ settings page                 │
│ index.html + dock.js     │  │ settings.html + settings.js   │
│ layout, magnification,   │  │ eight tabs, paged lists,      │
│ input, theming           │  │ icon picker                   │
└──────────────────────────┘  └───────────────────────────────┘
```

The pages reach the Rust side only through the object `src/bridge.js` sets up as
`window.dockApi` (plus `window.errorApi` for the error window). Every method on it
is one `#[tauri::command]` in `lib.rs`; every `on…()` hears a notification that
`bridge.rs` posts. There is no other channel. Adding a capability means adding a
command *and* a bridge method, which keeps the surface deliberate rather than
accidental.

`dockApi` has exactly the shape the Electron build's preload exposed, so the
page code came across nearly unchanged. The Electron build is gone, but where
the Rust code keeps a behaviour for its sake — the data folder, the `config.json`
key order, the installer removing the old copy — a comment says so.

`src/shared/i18n.js` is the one translation table. The settings page loads it
with a `<script>` tag; `i18n.rs` compiles the same file in and reads its table at
start-up, so the native menus and the settings window can never disagree.

---

## 2. Module map

### Rust (`src-tauri/src/`)

| Module | Responsibility |
| --- | --- |
| `lib.rs` | Lifecycle, single-instance, first-run seeding, the shared state and every command |
| `bridge.rs` | Main → page notifications, held until a page that is still loading starts listening |
| `config.rs` | Settings: defaults, deep merge, atomic writes |
| `dock.rs` | The transparent always-on-top window and the `dock-driver` thread that moves it |
| `geometry.rs` | Where the dock sits, and the auto-hide slide — no window access, so it is testable |
| `pointer.rs` | What to tell the page about the pointer once the window is click-through |
| `menus.rs` | Tray icon and its menu, and the dock's own popup menus |
| `i18n.rs` | Reads `src/shared/i18n.js` for the menus and the error window |
| `themes.rs` | Theme discovery, `url()` rewriting, the `ui` palette |
| `protocol.rs` | The `dock:` protocol that serves icons, theme images and glyphs to the pages |
| `icons.rs` | Icon resolution and the on-disk cache |
| `pe_icons.rs` | PE resource parser — every icon inside an `.exe`/`.dll` |
| `app_scanner.rs` | Per-platform discovery of installed applications |
| `app_windows.rs` | Listing and raising an application's open windows |
| `launcher.rs` | Launching items, per platform |
| `running.rs` | Running indicator and open applications |
| `trash.rs` | Recycle bin state, emptying and watching, per platform |
| `win.rs` | Win32 called directly: windows, processes, shortcuts, the shell |
| `dropped_files.rs` | Paths of files dropped on a page, on Windows |
| `error_report.rs` | The copyable error window for panics and page errors |
| `seed.rs` | What the dock contains the first time it runs |

Start at login is `tauri-plugin-autostart`; file dialogs are
`tauri-plugin-dialog`; a second launch hands over to the first through
`tauri-plugin-single-instance`.

### Pages (`src/`)

| Module | Responsibility |
| --- | --- |
| `bridge.js` | `window.dockApi` / `window.errorApi` — the whole page-facing API |
| `renderer/js/dock.js` | Layout, magnification, input, theming, drag and drop |
| `renderer/js/magnify.js` | The magnification maths — no DOM access at all |
| `renderer/js/glyphs.js` | Built-in icons for the dock's own entries and unresolvable targets |
| `renderer/js/settings.js` | The settings window controller |
| `renderer/css/dock.css` | Base dock styling; every themeable value is a custom property |
| `renderer/css/settings.css` | Settings window; fixed size, never scrolls |

`magnify.js` is deliberately DOM-free. It is the part most likely to be wrong
in a way that is hard to see, so it is the part that can be tested directly:
`test/magnify.test.js` loads it into a fake `window` and asserts its behaviour
numerically.

---

## 3. The command contract

Page → Rust, all through `dockApi`:

| Group | Commands |
| --- | --- |
| `config` | `config_get`, `config_patch`, `config_reset`, `config_export`, `config_import` |
| `items` | `items_get`, `items_set`, `items_add`, `items_add_paths`, `items_insert_paths`, `items_update`, `items_remove`, `items_move`, `items_launch`, `items_launch_path` |
| `dock` | `dock_content_size`, `dock_interactive_rect`, `dock_mouse_enter`, `dock_mouse_leave`, `dock_context_menu`, `dock_prefetch_windows` |
| `themes` | `themes_list`, `themes_variables`, `themes_open_folder` |
| `icons` | `icons_from_program`, `icons_pick_program`, `icons_use_file` |
| `dialog` | `dialog_add_app`, `dialog_add_folder`, `dialog_pick_icon`, `dialog_pick_target` |
| `system` | `system_displays`, `system_autostart`, `system_clear_icon_cache` |
| `trash` | `trash_state`, `trash_empty` |
| `settings` | `settings_open`, `settings_close` |
| `apps`, `app` | `apps_scan`, `app_quit`, `app_reload_dock`, `app_report_error` |
| — | `bridge_listen`: a page has started listening; hand it what was held |

Rust → page (notifications):

| Event | Carries |
| --- | --- |
| `config:changed` | A full snapshot, after any change from any source |
| `dock:hidden-changed` | Auto-hide state |
| `dock:pointer` | Where the pointer is, once the window can no longer see it (see 5.1) |
| `dock:running` | Executable names currently running |
| `dock:running-apps` | Open applications, decorated with icons |
| `dock:trash`, `dock:trash-emptied` | Whether the bin holds anything; the cue to play the emptying effect |
| `dock:file-paths` | Paths of files dropped on the page (Windows) |
| `settings:focus-item` | Open the settings window on this dock entry |
| `error:show` | The text for the error window |

There is one snapshot shape and one notification that carries it. Every
mutation ends by posting it, so both pages are always looking at the same state
and neither has to guess what changed.

A notification posted to a page that has not started listening yet would be
lost — which is how "open the settings window on this item" once opened it on
whatever tab it was on. So `bridge::post` delivers at once to a page that is
listening and keeps the rest until `bridge_listen` arrives.
`test/bridge.test.js` matches every command and event name between the two
sides, because a misspelt one fails silently: the call is rejected and the
dock simply does nothing.

---

## 4. Settings

`config.rs` holds a plain JSON object, written to `config.json` in the data
folder — `%APPDATA%\MyDockBar`, `~/Library/Application Support/MyDockBar` or
`~/.config/MyDockBar`. That is the folder the Electron build used, with the same
keys in the same order (`serde_json`'s `preserve_order`), so an existing dock
comes across untouched. `MYDOCKBAR_CONFIG_DIR` points a run at a throwaway
folder instead, webview profile included.

- **`defaults()`** is the single declaration of every setting
  (`src-tauri/data/defaults.json`). `merge()` deep-merges a saved file onto it,
  so a file written by an older version gains new keys instead of losing them,
  and arrays are replaced wholesale rather than merged element-wise.
- **Writes are atomic**: written to `config.json.tmp`, then renamed. An
  interrupted write can never leave a half-written settings file.
- **Slider drags are debounced** (250ms) because they fire continuously.
  **Item edits are not** — adding, removing or reordering an icon is a discrete
  act the user just performed, and a crash a quarter of a second later should
  not undo it.
- An unreadable file is renamed aside rather than silently overwritten.

Keys: `dock.*` (covering position, size, magnification, auto-hide, window
behaviour and decoration) plus `theme`, `locale`, `items`, `iconMemory`,
`startWithOS`, `firstRun`.

---

## 5. The three hard parts

### 5.1 Click-through

The dock's window is a rectangle far larger than the visible bar — it has to be,
to leave room for magnified icons. Left alone it would swallow every click in
its empty corners.

The `dock-driver` thread polls the cursor (16ms when near the dock, 120ms when
not) and calls `set_ignore_cursor_events` so the window only captures clicks
over the bar itself. The page tells it where the bar is via
`dock_interactive_rect`. That thread is the only thing that moves or reshapes
the window, so two moves can never arrive out of order, and it never holds the
state lock while it talks to the window: Tauri's getters wait on the main
thread, and the main thread may itself be waiting on that lock.

A click-through window is no longer sent mouse messages — including the
`mouseleave` the page was waiting for to shrink the icons back. So `pointer.rs`
tells the page outright with `dock:pointer`, and says it for several polls in a
row: the webview can deliver a move it coalesced earlier *after* the message,
and repeating it leaves the last word with the poll. While a popup menu holds
the mouse the page sees no moves at all, so for as long as one is open the
pointer is followed across the plate from here too.

### 5.2 Magnification

The layout is a pure function of two inputs: the pointer position and a single
global `intensity` that eases 0 → 1 on enter. That is what makes it steady —
holding the pointer still produces identical geometry every frame.

Three properties are held simultaneously, and each was a bug before it was a
property:

1. **The row keeps one length while the pointer is over it.** `spreadRange()`
   sweeps the pointer across the icons once per relayout and measures how much
   they actually expand; the row is held at the midpoint of that range.
   Whatever the magnification is not currently using is handed back as extra
   gap, shared evenly. Because the total never changes, the bar and the outer
   icons never move.

2. **The zoom is centred on the pointer.** The row is drawn from an origin
   shifted half a spread to the left so the expansion lands symmetrically
   around the pointer. The falloff curve is measured from a *separate*
   `restOrigin` — measuring it from the shifted one put the peak half a spread
   away from the pointer and made the growth look heavier on one side.

3. **Positions are whole pixels.** A fractional position makes the browser
   resample the icon every frame, which reads as shimmer even when the geometry
   underneath is perfectly steady.

The bar itself is sized from the icons, not from the zoom: at rest it is exactly
the icons plus their end margins, and it grows into the magnification headroom
as the pointer arrives. Its size depends on `intensity` alone, never on where
the pointer is, so travelling along the dock does not resize it.

### 5.3 Icons

The shell hands back only the one icon it picks, which is why an application's
icon sometimes comes out wrong or blank.

`pe_icons.rs` walks the PE resource tree itself: DOS header → PE header →
section table → resource directory → `RT_GROUP_ICON`, then rebuilds each group
into a standalone `.ico` by pairing it with its `RT_ICON` entries. That is what
lets the picker offer all 300-odd icons a program like Notepad++ actually ships.
On Windows 10+ many system binaries are stubs whose resources live in a parallel
`.mun` file, so a file with no icons is retried there.

Resolution order for a dock entry: an explicit custom icon → extraction from
the target → a built-in glyph chosen by type. Extracted icons are cached to disk
and invalidated when the source binary is newer.

A Tauri page cannot load `file://` URLs the way the Electron pages did, so
icons, theme images and the menu glyphs reach the pages through the `dock:`
protocol in `protocol.rs`, which serves pictures and nothing else.

---

## 6. Raising an existing window

Windows only lets the process that currently owns the foreground hand it to
another, and the dock deliberately never takes focus — so a plain
`SetForegroundWindow` from the dock does nothing.

`win.rs` uses the documented way round it: bracket `SetForegroundWindow` with
`AttachThreadInput` against the foreground thread, and un-minimise the window
first so restoring it afterwards cannot put it back behind something else.

Two things keep this off the click path:

- the window list is **cached** (4s) and **prefetched** as soon as the pointer
  settles on an icon, so hovering — which always precedes clicking — pays the
  cost;
- a program that is not in the running-process set is never looked up at all.

macOS needs none of this: `open -a` activates a running application rather than
launching a second copy. Linux uses `wmctrl` when it is installed.

The Electron build reached all of this — and the running indicator, the open
applications, the user's SID and emptying the bin — through child processes:
a PowerShell for every window lookup, `tasklist.exe` every five seconds. Each
was tens of megabytes and a few hundred milliseconds of CPU, which is most of
why the old dock was heavy while it sat doing nothing. `win.rs` makes the Win32
calls those processes made, in-process.

---

## 7. Theming

A theme is a folder containing `theme.json`:

- **`variables`** become CSS custom properties on the dock root. They cover both
  colour (`--plate-bg`, `--icon-shadow`, `--tooltip-*`) and **shape**
  (`--plate-radius`, `--plate-clip`, `--item-bg`, `--item-radius`,
  `--item-shadow`, `--item-inset`, `--icon-radius`).
- **`ui`** is the palette the settings window paints itself with, so choosing a
  dock theme re-skins the whole application.
- **`css`** is an optional extra stylesheet.

Every variable has a fallback in `dock.css`, so a theme that sets three of them
still renders correctly. `url(...)` references in either are rewritten to
resolve against the theme folder.

The 48 built-in themes are generated by `scripts/make-themes.js` from 24
palettes × {dark, light}, crossed with four surface styles (glass, solid, neon,
matte) and ten shapes (bar, pill, slab, tray, shelf, shelf3d, notched, tile,
slot, floating). Generating them rather than writing them means a change to how
glass highlights work applies to all of them at once, and the dark and light
families are always the same size by construction. They are bundled with the
app as a resource folder.

---

## 8. Localisation

`src/shared/i18n.js` holds one table for English and Korean. `resolve()` turns
`auto` into a concrete locale from the OS. The settings window marks every
string with `data-i18n` and re-labels them on a locale change; `menus.rs`
translates menu labels each time it builds a menu, from the same table.

`test/i18n.test.js` asserts that every English key has a Korean translation,
that no Korean string is still the English one, that placeholders match between
the two, and that every `data-i18n` key in `settings.html` and every key the
Rust side asks for actually exists.

---

## 9. Build pipeline

```
scripts/make-icons.js      ──▶  build/                    (app icon, tray, menu glyphs, installer art)
scripts/menu-glyphs.js     ──┘
scripts/make-themes.js     ──▶  themes/                   (48 theme.json files; committed)
tauri dev / tauri build    ──▶  src-tauri/target/         (the Rust build and the installers)
                           ──▶  src-tauri/gen/schemas/    (capability schemas)
scripts/copy-installer.js  ──▶  project root              (the installers, renamed)
```

`.gitignore` keeps that generated tree out of version control: `build/`,
`src-tauri/target/` (several GB) and `src-tauri/gen/`. `src-tauri/Cargo.lock`
is committed so the Rust dependency set stays pinned, and the installer hooks
in `src-tauri/windows/hooks.nsh` are hand-written and tracked. `tauri dev` /
`tauri build` (`beforeDevCommand` / `beforeBuildCommand`) and `pretest` run
`scripts/ensure-icons.js`, which rebuilds `build/` when it is missing or older
than the scripts that draw it. `tauri dev` and `tauri build` create
`src-tauri/target/` and `src-tauri/gen/` the first time they run. `npm run clean`
deletes both, plus any installers copied to the project root and any
Electron-era `dist/` or `out/` folder still sitting in the tree.

The artwork is drawn as SVG with **gradients only — no SVG filters** — so every
rasteriser produces the same result. Installer bitmaps go through a small
24-bit BMP encoder, because sharp cannot write BMP.

`src-tauri/windows/hooks.nsh` adds to Tauri's NSIS installer:

- a page before the welcome page that, when MyDockBar is already installed —
  this build or the Electron one — says it will be removed, and when user data
  is found asks whether to keep or delete it. There is no default: the wizard
  does not move on until one is picked. The old copy is removed when that page
  is left, so Tauri's own "keep it / remove it" page never has anything to ask
  about.
- the Electron build's leftovers: its "start at login" entry and its Chromium
  caches. The settings beside them stay unless the user chose to delete them.
- a silent `/S` install removes the old copy too, and keeps the data.

The hook file is read before Tauri defines `PRODUCTNAME` and friends, so names
are spelled out; `test/build-config.test.js` checks them against
`tauri.conf.json`.

Each platform must be built on that platform: a Windows host cannot produce a
macOS `.dmg` or an AppImage (whose assembly step needs symlinks).
`.github/workflows/build.yml` builds all three on their own runners.

---

## 10. Testing

`npm test` runs both suites:

- **`npm run test:js`** — `node --test` with the reporter in
  `scripts/test-reporter.js`, which groups results under their `describe()`
  block and closes with a summary. 157 tests in 35 groups, on plain Node — no
  webview, no browser.
- **`npm run test:rust`** — `cargo test`: 69 tests across the Rust modules,
  several of them against the real system (the process table, the recycle bin,
  real `.exe` files).

What is covered, and why it is worth covering:

| Area | Guards against |
| --- | --- |
| `magnify` | The row changing length, the end icons drifting, distant icons moving on a pointer step, a gap ballooning |
| `bridge` | A command or event spelt differently on the two sides |
| `config` (JS + Rust) | A settings migration losing keys, or `false`/`0` being treated as absent |
| `i18n` (JS + Rust) | An untranslated string, a missing key, mismatched placeholders, the Rust reader missing an entry |
| `themes` | Two themes that look alike, unreadable text, a malformed colour |
| `build-config` | `tauri.conf.json`, `package.json` and `hooks.nsh` disagreeing on names, versions or bundles |
| `geometry`, `pointer` | The auto-hide slide resting in the wrong place; the page left thinking the pointer is still there |
| `pe_icons` | The PE parser breaking on real binaries |
| `app_scanner` | `.desktop` parsing and command-line splitting |
| `running` | A system process appearing as a user application, or the dock listing itself |
| `trash` | A probe that is slow, or that misreads an empty bin |
| `menu-icons`, `menus` | A menu entry added without an icon |
