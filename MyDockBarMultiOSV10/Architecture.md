# MyDockBar — Architecture

How the application is put together, and why the parts that are not obvious are
the way they are. For the feature list and build commands see
[README.md](README.md); for how to *use* the dock see
[UsersGuide.md](UsersGuide.md).

---

## 1. Process model

Electron, three JavaScript contexts:

```
┌─ main process ──────────────────────────────────────────────┐
│  lifecycle, windows, tray, native menus, filesystem,        │
│  process/window enumeration, settings on disk               │
└───────────┬──────────────────────────────┬──────────────────┘
            │ contextBridge (preload)      │
┌───────────▼──────────────┐  ┌────────────▼──────────────────┐
│ dock renderer            │  │ settings renderer             │
│ index.html + dock.js     │  │ settings.html + settings.js   │
│ layout, magnification,   │  │ eight tabs, paged lists,      │
│ input, theming           │  │ icon picker                   │
└──────────────────────────┘  └───────────────────────────────┘
```

Both renderers run with `contextIsolation: true` and `nodeIntegration: false`.
They reach the main process only through the object `src/preload/preload.js`
exposes as `window.dockApi` — there is no other channel. Adding a capability
means adding an IPC handler *and* a preload method, which keeps the surface
deliberate rather than accidental.

`src/shared/i18n.js` is a UMD module loaded by both sides: `require`d in the
main process, a `<script>` tag in the renderers. One translation table serves
the native menus and the settings window, so the two can never disagree.

---

## 2. Module map

### Main process (`src/main/`)

| Module | Responsibility |
| --- | --- |
| `main.js` | Lifecycle, single-instance lock, first-run seeding, wiring everything together |
| `config.js` | Settings: defaults, deep merge, atomic writes |
| `dock-window.js` | The transparent always-on-top window and where it sits |
| `pointer-watch.js` | Cursor polling → click-through toggling and auto-hide |
| `ipc.js` | Every IPC handler; the entire renderer-facing API |
| `settings-window.js` | The settings window and focusing it on a particular item |
| `tray.js` | Tray icon and its menu |
| `menu-icons.js` | `NativeImage` loader for the menu glyphs |
| `themes.js` | Theme discovery, `url()` rewriting, the `ui` palette |
| `icons.js` | Icon resolution and the on-disk cache |
| `pe-icons.js` | PE resource parser — every icon inside an `.exe`/`.dll` |
| `app-scanner.js` | Per-platform discovery of installed applications |
| `app-windows.js` | Listing and raising an application's open windows |
| `launcher.js` | Launching items, per platform |
| `running.js` | Process-table polling: running indicator and open applications |
| `trash.js` | Recycle bin state and emptying, per platform |
| `autostart.js` | Start at login |
| `seed.js` | What the dock contains the first time it runs |

### Renderers (`src/renderer/`)

| Module | Responsibility |
| --- | --- |
| `js/dock.js` | Layout, magnification, input, theming, drag and drop |
| `js/magnify.js` | The magnification maths — no DOM access at all |
| `js/glyphs.js` | Built-in icons for the dock's own entries and unresolvable targets |
| `js/settings.js` | The settings window controller |
| `css/dock.css` | Base dock styling; every themeable value is a custom property |
| `css/settings.css` | Settings window; fixed size, never scrolls |

`magnify.js` is deliberately DOM-free. It is the part most likely to be wrong
in a way that is hard to see, so it is the part that can be tested directly:
`test/magnify.test.js` loads it into a fake `window` and asserts its behaviour
numerically.

---

## 3. The IPC contract

Renderer → main, all through `dockApi`:

| Group | Channels |
| --- | --- |
| `config` | `config:get`, `config:patch`, `config:reset`, `config:export`, `config:import` |
| `items` | `items:get`, `items:set`, `items:add`, `items:add-paths`, `items:insert-paths`, `items:update`, `items:remove`, `items:move`, `items:launch`, `items:launch-path` |
| `dock` | `dock:content-size`, `dock:interactive-rect`, `dock:mouse-enter`, `dock:mouse-leave`, `dock:context-menu`, `dock:prefetch-windows` |
| `themes` | `themes:list`, `themes:variables`, `themes:open-folder` |
| `icons` | `icons:from-program`, `icons:pick-program`, `icons:use-file` |
| `dialog` | `dialog:add-app`, `dialog:add-folder`, `dialog:pick-icon`, `dialog:pick-target` |
| `system` | `system:displays`, `system:autostart`, `system:clear-icon-cache` |
| `trash` | `trash:state`, `trash:empty` |
| `settings` | `settings:open`, `settings:close`, `settings:ok` |
| `apps`, `app` | `apps:scan`, `app:quit`, `app:reload-dock` |

Main → renderer (broadcast):

| Channel | Carries |
| --- | --- |
| `config:changed` | A full snapshot, after any change from any source |
| `dock:hidden-changed` | Auto-hide state |
| `dock:running` | Executable names currently running |
| `dock:running-apps` | Open applications, decorated with icons |
| `settings:focus-item` | Open the settings window on this dock entry |

There is one snapshot shape (`ipc.js: snapshot()`) and one broadcast that
carries it. Every mutation ends with `pushConfig()`, so both renderers are
always looking at the same state and neither has to guess what changed.

---

## 4. Settings

`config.js` holds a plain object, written to `config.json` in Electron's
`userData` directory.

- **`defaults()`** is the single declaration of every setting. `merge()` deep-
  merges a saved file onto it, so a file written by an older version gains new
  keys instead of losing them, and arrays are replaced wholesale rather than
  merged element-wise.
- **Writes are atomic**: written to `config.json.tmp`, then renamed. An
  interrupted write can never leave a half-written settings file.
- **Slider drags are debounced** (250ms) because they fire continuously.
  **Item edits are not** — adding, removing or reordering an icon is a discrete
  act the user just performed, and a crash a quarter of a second later should
  not undo it.
- An unreadable file is renamed aside rather than silently overwritten.

Keys: `dock.*` (27 of them, covering position, size, magnification, auto-hide,
window behaviour and decoration) plus `theme`, `locale`, `items`, `iconMemory`,
`startWithOS`, `firstRun`.

---

## 5. The three hard parts

### 5.1 Click-through

The dock's window is a rectangle far larger than the visible bar — it has to be,
to leave room for magnified icons. Left alone it would swallow every click in
its empty corners.

`pointer-watch.js` polls the cursor (16ms when near the dock, 120ms when not)
and calls `setIgnoreMouseEvents` so the window only captures clicks over the
bar itself. The renderer tells it where the bar is via `dock:interactive-rect`.

Polling rather than `setIgnoreMouseEvents(true, { forward: true })` because
event forwarding is not supported on Linux.

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

`app.getFileIcon` returns only the one icon the shell picks, which is why an
application's icon sometimes comes out wrong or blank.

`pe-icons.js` walks the PE resource tree itself: DOS header → PE header →
section table → resource directory → `RT_GROUP_ICON`, then rebuilds each group
into a standalone `.ico` by pairing it with its `RT_ICON` entries. That is what
lets the picker offer all 300-odd icons a program like Notepad++ actually ships.
On Windows 10+ many system binaries are stubs whose resources live in a parallel
`.mun` file, so a file with no icons is retried there.

Resolution order for a dock entry: an explicit custom icon → the icon an
installed-application record supplies → extraction from the target → a built-in
glyph chosen by type. Extracted icons are cached to disk and invalidated when
the source binary is newer.

---

## 6. Raising an existing window

Windows only lets the process that currently owns the foreground hand it to
another, and the dock deliberately never takes focus. `WScript.Shell`'s
`AppActivate` therefore returns `False` and nothing happens.

`app-windows.js` uses the documented way round it: bracket `SetForegroundWindow`
with `AttachThreadInput` against the foreground thread, and un-minimise the
window first so restoring it afterwards cannot put it back behind something
else.

Two things keep this off the click path:

- the window list is **cached** (4s) and **prefetched** as soon as the pointer
  settles on an icon, so hovering — which always precedes clicking — pays the
  cost;
- a program that is not in the running-process set is never looked up at all.

macOS needs none of this: `open -a` activates a running application rather than
launching a second copy. Linux uses `wmctrl` when it is installed.

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
families are always the same size by construction.

---

## 8. Localisation

`src/shared/i18n.js` holds one table for English and Korean. `resolve()` turns
`auto` into a concrete locale from the OS. The settings window marks every
string with `data-i18n` and re-labels them on a locale change; the main process
translates menu labels at build-time of each menu.

`test/i18n.test.js` asserts that every English key has a Korean translation,
that no Korean string is still the English one, that placeholders match between
the two, and that every `data-i18n` key in `settings.html` and every `t('...')`
in the main process actually exists.

---

## 9. Build pipeline

```
scripts/make-icons.js  ──▶  build/       (app icon, tray, menu glyphs, installer art)
scripts/menu-glyphs.js ──┘
scripts/make-themes.js ──▶  themes/      (48 theme.json files)
electron-builder       ──▶  dist/        (installers)
```

Everything in `build/` except `installer.nsh` is generated and is not in version
control; `prestart`/`predev`/`pretest` run `scripts/ensure-icons.js`, which
rebuilds it when it is missing or older than the scripts that draw it.

The artwork is drawn as SVG with **gradients only — no SVG filters** — so every
rasteriser produces the same result. Installer bitmaps go through a small
24-bit BMP encoder, because sharp cannot write BMP.

`build/installer.nsh` adds the one question the stock NSIS installer does not
ask: whether to remove an already-installed copy. The removal itself is left to
electron-builder, whose install section already runs `uninstallOldVersion` —
doing it in `customInit` as well would uninstall twice, and clearing the
registry that early would make the licence and destination-folder pages, which
are meant to be skipped on an upgrade, appear again.

Each platform must be built on that platform: a Windows host cannot produce a
macOS `.dmg` or an AppImage (whose assembly step needs symlinks).
`.github/workflows/build.yml` builds all three on their own runners.

---

## 10. Testing

`npm test` runs `node --test` with the reporter in
`scripts/test-reporter.js`, which groups results under their `describe()` block
and closes with a summary. 100 tests in 23 groups, on plain Node — no Electron,
no browser.

What is covered, and why it is worth covering:

| Area | Guards against |
| --- | --- |
| `magnify` | The row changing length, the end icons drifting, distant icons moving on a pointer step, a gap ballooning |
| `config` | A settings migration losing keys, or `false`/`0` being treated as absent |
| `i18n` | An untranslated string, a missing key, mismatched placeholders |
| `themes` | Two themes that look alike, unreadable text, a malformed colour |
| `pe-icons` | The PE parser breaking on real binaries |
| `app-scanner` | `.desktop` parsing and command-line splitting |
| `running` | A system process appearing as a user application, or the dock listing itself |
| `menu-icons` | A menu entry added without an icon |

The rule the menu-icon test enforces is worth calling out: a menu entry is an
object literal pairing `label:` with one of `click:`, `submenu:` or `enabled:`.
`type:` is deliberately not in that list — a dock item has `type: 'app'` and a
label but is not a menu entry, and a `{ type: 'separator' }` menu entry has no
label to begin with.
