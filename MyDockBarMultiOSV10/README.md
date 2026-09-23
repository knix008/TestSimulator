# MyDockBar

A themeable application dock for **Windows, macOS and Linux**, built with Electron.
It takes its cues from RocketDock: a translucent bar pinned to a screen edge, icons
that magnify under the pointer, reflections, auto-hide, and drag-and-drop shortcuts.

![the dock](build/icon.png)

---

## Features

**Dock**
- Magnifying icons with a parabolic / cosine / linear falloff curve (or none)
- Icon reflections (always cast downwards, on every screen edge), hover labels,
  and a running-application indicator
- Bounce or pop animation on launch; a shake when a target is missing
- Any screen edge (bottom / top / left / right) with start / center / end alignment
- Icons always sit centred: the padding setting adjusts only the bar's thin
  sides, and the gap at the two ends stays fixed
- Separate dock and background opacity, plus an explicit background height
- Window priority (above everything / above normal windows / normal)
- Multi-monitor: pin to the primary display, a named display, or "wherever the
  pointer is", with a live monitor map in settings
- Auto-hide with independent show and hide delays and a peek sliver
- Optionally shows icons for applications that are currently open, alongside
  the pinned ones
- Drag files onto the dock — or onto the Dock Items tab — to add them. The
  landing position is shown by the icons **parting around a gap**, not by an
  outline drawn over the bar, and the same gap drives reordering.
- Lock / unlock the dock and toggle auto-hide from the tray menu or the dock's
  own context menu
- Clicking an application that is already open **raises its window** instead of
  starting a second copy; with several windows open it offers a chooser
- The Trash shows whether it is holding anything, and can be emptied from its
  context menu
- A custom icon is remembered per target: remove an entry, add it back later,
  and the icon you chose comes back with it
- Separators, folders, URLs and built-in actions (Home, Show Desktop, Trash,
  Settings). The built-in ones cannot be deleted.
- **Lock items** freezes the dock: no adding, removing or reordering, enforced
  in the main process rather than only in the UI
- The window is click-through everywhere except the dock plate itself, so it
  never swallows clicks meant for the desktop

**Theming**
- 36 built-in themes: 18 palettes, each in a **dark and a light** variant, so
  the two families are always the same size. Hues are spread around the wheel
  so no two cards in the picker read alike, and five of the palettes are reds
  (Ruby, Scarlet, Crimson, Ember, Rose)
- Themes change **shape as well as colour**, the way RocketDock skins do: nine
  forms — `bar`, `pill`, `slab`, `tray`, `shelf`, `notched`, `tile`, `slot` and
  `floating` — clip the plate differently and, for `tile` and `slot`, give every
  icon its own raised or recessed backing
- Four surface styles on top of that: glass, solid, neon and matte
- Choosing a theme re-skins the settings window too, not just the bar
- Every card previews the theme with its own colours and an accent stripe
- Themes are plain folders — drop your own in and it appears in the picker

**Icons**
- Extracts real application icons and caches them
- A RocketDock-style icon picker: choose from **every** icon stored inside a
  program file (`.exe` / `.dll`, including the `.mun` resource files Windows 10+
  splits system icons into), a built-in glyph, or any image on disk. This is the
  fix for an application whose icon comes out wrong or blank.

**Integration**
- Tray menu with theme / position / language / auto-hide shortcuts —
  every menu entry carries an icon
- English and Korean throughout, in the menus and the settings window
- Scans installed applications per platform (Start Menu shortcuts on Windows,
  `/Applications` bundles on macOS, `.desktop` entries on Linux)
- Start at login
- Import / export settings as JSON

**Settings window**
- Fixed size, and never scrolls: eight tabs, each laid out to fit, with the two
  unbounded lists (dock items, installed applications) paged rather than scrolled
- Every numeric setting has −/+ step buttons beside its slider, on one line
- OK and Reset buttons in a persistent action bar

**Running applications**
- Optionally shows an icon for every application that is currently open
- Restricted to what the signed-in user actually launched: processes in the
  services session, binaries inside the Windows directory, shell surfaces such
  as Explorer and the search host, and MyDockBar itself are all excluded

---

## Running from source

```bash
npm install
npm run icons     # generates the app artwork; required before the first run
npm start
```

> On Windows, if the app exits immediately with no window, check that
> `ELECTRON_RUN_AS_NODE` is not set in your shell — it makes the Electron binary
> behave as a plain Node runtime.

Run the tests with:

```bash
npm test          # grouped, colourised summary
npm run test:tap  # plain TAP, for CI log scraping
```

`npm test` uses the reporter in
[`scripts/test-reporter.js`](scripts/test-reporter.js): results are grouped
under the `describe()` block they belong to, timings are shown per test, and a
summary line closes with the totals. Colour is dropped automatically when the
output is not a terminal, or when `NO_COLOR` is set.

```
  MyDockBar - test suite

  dock layout
    ✔ leaves every icon at rest when the pointer is away       1.2ms
    ✔ magnifies the icon under the pointer the most            0.5ms
    ✔ keeps the hovered icon under the pointer                 0.3ms

  ──────────────────────────────────────────────────────────────
  groups 22  |  tests 92  |  passed 92  |  failed 0
```

The suite covers the magnification maths, settings merging, the translation
table (including that every string is translated and every `data-i18n` key
exists), the theme generator and its colour separation, PE icon extraction,
`.desktop` parsing, the first-run seed, running-process filtering, and menu
icon coverage.

---

## Building installers

```bash
npm run dist:win     # NSIS installer (.exe)
npm run dist:mac     # DMG + zip
npm run dist:linux   # AppImage + deb + rpm
```

Output lands in `dist/`.

**Each platform must be built on that platform.** A Windows host cannot produce a
macOS `.dmg` (it needs macOS tooling) or an AppImage (its assembly step needs
symlinks). `.github/workflows/build.yml` builds all three on their own runners;
run it with a `v*` tag or via *workflow_dispatch*.

### The Windows installer

`build/installer.nsh` customises electron-builder's NSIS installer:

- **Existing-installation prompt.** Before installing, the installer reads the
  uninstall registry key (per-user, then per-machine). If a previous MyDockBar
  is found it asks once, in English or Korean depending on the installer
  language: **Yes** removes the installed version and installs this one, **No**
  ends the installer leaving the existing version untouched. A silent `/S`
  install answers Yes automatically.

  The removal itself is left to electron-builder, whose install section already
  runs `uninstallOldVersion`. Doing it in `customInit` as well would uninstall
  twice, and clearing the registry that early would make the licence and
  destination-folder pages — which are meant to be skipped on an upgrade —
  appear again.
- **Shortcuts.** A desktop shortcut and a Start Menu shortcut are created and
  removed with the app, and Explorer is notified so they appear immediately.
- The installer lets the user choose the install directory, and offers an
  English / Korean language selector.

---

## Themes

A theme is a folder containing `theme.json`:

```json
{
  "id": "my-theme",
  "name": "My Theme",
  "description": "Shown in the theme picker",
  "dark": true,
  "css": "extra.css",
  "variables": {
    "--plate-bg": "linear-gradient(180deg, #333, #111)",
    "--plate-radius": "16px",
    "--icon-shadow": "0 6px 12px rgba(0,0,0,.5)"
  }
}
```

`variables` become CSS custom properties on the dock root — both the colours
above and the shape ones (`--plate-radius`, `--plate-clip`, `--item-bg`,
`--item-radius`, `--item-shadow`, `--item-inset`, `--icon-radius`). The optional
`ui` block is the palette the settings window paints itself with; `css` is an
optional extra stylesheet. `url(...)` references in either resolve against the theme
folder. Every variable has a sensible fallback in
[`src/renderer/css/dock.css`](src/renderer/css/dock.css), so a theme that sets
two or three of them still renders correctly.

Built-in themes live in [`themes/`](themes/) and are generated by
`npm run themes` from the palette table in
[`scripts/make-themes.js`](scripts/make-themes.js): add a hue there and both a
dark and a light theme appear. User themes go in the folder that
*Settings → Appearance → Open theme folder…* opens:

| Platform | Location |
| --- | --- |
| Windows | `%APPDATA%\MyDockBar\themes` |
| macOS | `~/Library/Application Support/MyDockBar/themes` |
| Linux | `~/.config/MyDockBar/themes` |

---

## Artwork

All artwork is generated from code by `npm run icons`
([`scripts/make-icons.js`](scripts/make-icons.js)):

- **Application icon** — an isometric scene (three glossy cubes on a glass shelf,
  with reflections, contact shadows and a bevelled rim) drawn as SVG with
  gradients only — no SVG filters — so every rasteriser produces the same result.
  Rendered to `icon.png` (1024²), a multi-size `icon.ico`, and a Linux icon set.
- **Menu glyphs** — every native menu item carries an icon
  ([`scripts/menu-glyphs.js`](scripts/menu-glyphs.js)), emitted at 16px and 32px
  (`@2x`). Because a menu item that owns an icon cannot also show a radio tick,
  the "currently selected" theme and position entries use a variant glyph with a
  check badge instead. `test/menu-icons.test.js` fails the build if a menu entry
  is ever added without one.
- **Installer artwork** — the NSIS header and sidebar bitmaps, written through a
  small 24-bit BMP encoder since sharp cannot emit BMP.

---

## How it is put together

```
src/shared/        i18n table, loaded by both the main process and the renderer
src/main/          Electron main process
  main.js            lifecycle, single-instance lock, first-run seeding
  config.js          JSON settings with atomic writes and defaults merging
  dock-window.js     the transparent, always-on-top dock window and its placement
  pointer-watch.js   cursor polling -> click-through toggling and auto-hide
  ipc.js             every IPC handler; the renderer talks only through these
  themes.js          theme discovery and url() rewriting
  icons.js           icon extraction and on-disk caching
  app-scanner.js     per-platform installed-application discovery
  launcher.js        launching items, per platform
  running.js         process-table polling: running indicator + open applications
  trash.js           recycle bin state and emptying, per platform
  app-windows.js     listing and raising an application's open windows
  pe-icons.js        PE resource parser - every icon inside an .exe/.dll
  tray.js            tray icon and its menu
  menu-icons.js      NativeImage loader for menu glyphs
src/preload/       the contextBridge API surface
src/renderer/      dock UI (index.html) and settings UI (settings.html)
  js/magnify.js      the magnification maths, kept DOM-free
themes/            built-in themes
scripts/           artwork generation
test/              tests that run on plain Node
```

Two details worth knowing:

- **Click-through.** The dock window is a rectangle far larger than the visible
  bar. `pointer-watch.js` polls the cursor and calls `setIgnoreMouseEvents` so
  the window only captures clicks over the plate. Polling is used rather than
  `forward: true` because event forwarding is not supported on Linux.
- **Magnification anchoring.** `magnify.js` maps a distance along the resting
  layout onto the magnified one, which keeps the icon under the pointer from
  sliding away as its neighbours grow. The plate resizes with the row so
  magnified icons never hang off its edge.
- **The bar is sized from the icons, not from the zoom.** At rest it is exactly
  the icons plus their end margins, with the row centred in it — reserving the
  magnification headroom up front left the row pinned against the left end of
  an over-wide bar. The bar grows into that headroom as the pointer arrives and
  shrinks again when it leaves, and its size depends on the hover intensity
  alone, never on where the pointer is, so travelling along the dock does not
  resize it. Measured: 622px at rest, 677px while hovering, identical at every
  pointer position, 12px of margin on each side throughout.

- **Only the icons near the pointer move.** The room the magnified row needs is
  *measured* from the actual set of icons (`peakSpread` sweeps the pointer
  across them), so a three-icon dock gets small end margins and a twenty-icon
  dock gets the full spread. While the pointer is over the dock the row is held
  at exactly that one length: whatever
  the magnification is not currently using is handed back as extra gap,
  weighted by the same falloff curve so it lands inside the magnified window
  and nowhere else.

  The effect is that the distance added across that window is the same at every
  pointer position, so icons outside it do not drift. Measured, a 4px pointer
  step moves the icons under the pointer 1–3px and every icon more than two
  away exactly 0px — where the earlier anchored layout translated *every* icon
  by ~0.5px per step and swung the bar's own ends by ~30px across a sweep.
- **Steady magnification.** The layout is a pure function of the pointer
  position and one global `intensity` that eases 0→1 on enter. An earlier
  version eased each icon's scale separately and then re-derived the row's
  anchor from those eased widths — which fed the animation back into its own
  input and made the row visibly swim under a stationary pointer. Positions are
  also snapped to whole pixels, since fractional ones make the browser resample
  every icon each frame.

  `test/magnify.test.js` pins all of this down: the row keeps one length, the
  first and last icons never move, and nothing more than three icons from the
  pointer shifts on a pointer step.
- **Icon extraction.** `app.getFileIcon` returns only the one icon the shell
  picks. `pe-icons.js` walks the PE resource tree itself and rebuilds each
  `RT_GROUP_ICON` into a standalone `.ico`, which is what lets the picker offer
  all 300-odd icons a program like Notepad++ actually ships.

---

## License

MIT — see [LICENSE.txt](LICENSE.txt).
