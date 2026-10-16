# Architecture

MyMoney 1.0.0 is a vanilla ES-module app. Tauri 2 hosts the same pages that the browser preview uses, in the system webview. There is no bundler step for the renderer: `scripts/stage-web.js` copies `src/` and `assets/icon.png` into `web-dist/`, and Tauri compiles that folder into the executable.

## Layout

- `src/core` holds settings, themes, documents, i18n, undo, and paths. `backgroundAlpha` maps transparency 0 to a fully opaque window and 100 to 25% opacity, so the window never disappears.
- `src/market` fetches the five sources and aggregates one board. `markets.js` is the catalog of exchanges and listings, `providers.js` the URLs and parsers, `aggregate.js` the averaging, `service.js` the fetch pass, `format.js` the money and percent strings, and `trend.js` the three directions a quote can take.
- `src/ui` draws the frameless window, the stocks, rates, and news popups, menus, and the tray menu model in `tray-menu.js`. `market-view.js` renders the scene and the three panels.
- `src/platform` is the seam between the pages and the host. `host.js` picks `desktop.js` when Tauri is present and `web.js` otherwise. `tauri-bridge.js` is the only file that calls Tauri: one function per Rust command, and listeners for the events Rust sends to this window.
- `src/index.html` is a market window, `popup-host.html` a dialog (panels, settings, about, print setup), `menu-host.html` a command menu or the tray menu, and `print-host.html` the window the system print dialog opens over.
- `src-tauri/src/lib.rs` owns the windows, the tray, file dialogs, settings.json and window.json, fetching, and every command. `placement.rs` (window placement, tray menu placement), `hub.rs` (one dialog per kind per window, waiting for answers), and `store.rs` (merging a window's save into settings.json) are plain Rust with unit tests.
- `installer/plan.js` is the shared install policy. `src-tauri/windows/hooks.nsh` is the same policy for Tauri's NSIS installer. `installer/cli.js` performs the same steps on Linux and macOS.
- `assets/icon.ico`, `assets/icon.png`, and `assets/icon.icns` are the program icon. `assets/file.ico` is only the `.mymoney` document icon. `assets/menu` holds the tray glyphs.
- `scripts/generate_icons.py` draws the program icon, the document icon, and the tray glyphs. `scripts/copy-installer.js` copies the single setup executable to the repository root.
- `test` loads the modules in jsdom and checks the parsers, the installer plan, the tray menu, the packaged icon paths, and the whole window. It also runs `cargo test` and drives the real executable (`test/e2e/harness.js`, `test/suites/desktop.js`).

## Resource use

The Electron build shipped its own Chromium and ran a browser, GPU, and utility process plus one renderer per window. The Tauri build keeps the Rust host small and shares the system WebView2 among all windows. Every window is created with the same WebView2 switches (`BROWSER_ARGS`):

- `--process-per-site --renderer-process-limit=1`: the market windows, panels, dialogs, and menus are small pages from one site, so one renderer serves them all.
- `--disable-gpu`: nothing animates, and the GPU process shrinks to a fraction. Transparent windows look the same with software compositing.

Window moves and resizes send at most one step per frame (`coalesceSteps` in `desktop.js`), and window.json is written once a move has been still for 400 ms instead of on every step. Requests go through Rust (`fetch_url`), so the quote, rate, and news services need no cross-origin headers.

## Data

A board is one market plus the symbols watched in it. `loadBoard` runs every enabled source in parallel: each watched symbol and the market index go to the quote sources, the base currency goes to the rate sources, and a query built from the market and the first watched names goes to the news source.

Quote sources return the same `{ days, currency, name }` shape, so `aggregateQuote` averages them by date and keeps each source's own series under `bySource`. Yahoo serves the chart API from two edge hosts; `yahoo` is `query1` and `yahoo2` is `query2`, so a board still fills when one host is unreachable. The display priority in Settings picks one of those series instead of the average; a priority whose source did not answer falls back to the average. Rate tables average the same way. Headlines are merged, de-duplicated by title, and sorted newest first.

A source that fails is recorded in `sources` and the rest of the board is still shown. Only a board with no usable quote at all raises an error. The news feeds return RSS, so `parseNewsFeed` strips the markup and decodes the entities itself; a headline is only ever inserted as escaped text, and a picture is kept only when the feed offers one through `media:content`, `media:thumbnail`, `enclosure` or an `img` in the summary, and only when its address is http(s).

The two news feeds carry the same story twice, because a search feed writes "Headline - Outlet" where a wire writes "Headline". `mergeNews` matches them on a stripped key and the surviving row takes the picture from whichever copy had one. The rate table is fetched for the chosen currencies plus the board's own currency, because converting a price needs that one too; `shownRateRows` then lists only what the reader asked for.

Any change to what is watched - a market swap, an added symbol, an added currency - calls `refreshSoon`, which forces a fetch even when a quiet one is already running and coalesces a burst of edits into a single pass. A fetch replaced by a newer one finishes silently; only a refresh the reader cancelled reports it.

Prices are shown in the listing's own currency, or converted to the base currency when Settings asks for that. The conversion uses the fetched rate table, which is quoted against one base, so a cross rate is one division. `quotePair` then flips each displayed pair to whichever side is at least one, so no row reads 0.000749.

## The two window views

`settings.sceneMode` picks what the main window draws. `single` is the large price, and the scene carries `data-scene-advance` so a click moves to the next symbol; because the same area is the window's drag handle, `noteSceneDrag` swallows the click that ends a drag. `rotateSeconds` arms an interval that calls the same move.

`all` draws the watchlist as rows and `syncBoardWindow` sets the window to `boardWindowSize(rows)`, which is the toolbar plus the header plus one `BOARD_ROW` per row. It only resizes when the row count actually changes, so it never fights a reader dragging the grip, and it remembers the size held before the mode was entered so leaving restores it. On the desktop the exact size goes through the `window_size` command; in the browser preview the shell is sized directly.

`toolbarMinWidth()` counts the icon and the buttons but not the program name, because below `titleTextMinWidth()` the name is hidden and only the icon stays. That is what lets the window be as narrow as it is; `applyTitleRoom` measures the window itself, not the shell, whose border would hide the name a pixel early.

## Window placement

`note_bounds` records every move and resize, and window.json is written once the window has been still for 400 ms, so the last placement survives even a kill. Exit writes the same rectangle into `settings.json`. On the next start `saved_window_placement` prefers the recorded rectangle, falls back to the settings copy, and `place_window` re-centres it when the display it belonged to is gone.

A size counts as worth saving when it clears `WINDOW_MIN`, not a round number: `isUsableSize` is the single rule used by `noteBounds`, `recordedWindowPlacement` and `stampWindowPlacement`. A fixed floor of 200 used to sit above the real minimum height, so a window shrunk all the way down came back at its old size.

## Settings window size

Settings pages differ a lot in length, so the popup is not one fixed box. `settingsWidth` adds up the tab labels - counting a Korean letter as a full em and a latin one as half - so every tab is on screen at once in either language and the arrows that would scroll them are hidden. `fitHeight` then measures the page on show with `popupFits` and sets the window to exactly that, bounded by `SETTINGS_MIN_HEIGHT` and `SETTINGS_MAX_HEIGHT`. The watchlist and currency blocks are two columns and take `listBlockHeight` for their own row count, so a three-symbol list is three rows tall rather than a fixed box. On the desktop the popup asks Rust for its new size through the `resize_popup` command.

## Window and tray

Market windows are frameless, transparent, have no shadow, and skip the taskbar. Each is created hidden and shown once its page has loaded. Popup, menu, and print windows also skip the taskbar.

On startup Rust creates the tray icon from the bundle icon. A click opens `menu-host.html` as a tray menu: that page reads settings.json and builds the items with `buildTrayMenu`, then asks Rust to size and place it next to the icon. Labels follow the language in `settings.json`. Every item, the Windows, Market and Edit parents and the window list included, has a colour glyph (`icons.js` `COLOR`, with a matching PNG in `assets/menu`). Show windows reveals every hidden window; Windows › New window and Windows › `window:<slot>` open or raise one; Exit calls `quit_app`. Any other item goes to the window used last as `menu-command`.

Events from Rust go to one window (`emit_to` with that window's label). The pages listen on their own window, because a global listener would also hear what other windows were sent. The shared Rust state is never held while a window is shown, hidden, moved, or destroyed, because those calls can report back through a window event that takes the same lock.

The close button never quits: a close request turns into `hide_money_window`, and the program ends only from Exit, which writes every window's rectangle and destroys all windows. There is no File menu and no unsaved state: boards and settings are written as they change.

## Single instance

The single-instance plugin guards the program. A second launch shows `msg.alreadyRunning` in a native message box, in the saved language, and exits with code 0; the running copy is left alone, since its windows may be hidden in the tray. `--multi` / `MYMONEY_MULTI` (debug builds only) skip the lock and move the copy to `MyMoney-pid-<pid>` for testing.

## Settings location

settings.json and window.json live where the Electron build kept them: `%APPDATA%\MyMoney`, `~/.config/MyMoney`, or `~/Library/Application Support/MyMoney`. `MYMONEY_CONFIG_DIR` moves them (the tests use this, and then WebView2 data goes there too). The login entry is only written by a release build that is not running under `MYMONEY_CONFIG_DIR`.

## Several windows

Every market window is a slot. The first is `main`: its board is `settings.defaultBoard` and its rectangle is the usual window placement. The others live in `settings.windows` as `{ id, board, bounds }` (`sanitizeWindowSlots`). The renderer never knows which slot it is: `read_settings` hands each window the shared settings with its own board and rectangle substituted, and `write_settings` from an extra window writes the shared part over the file and its board into its slot. Rust owns `settings.windows`; a renderer's copy is ignored, so two windows cannot undo each other's lists.

`WINDOW_FIELDS` (board, size, position, maximized) are per window; everything else is shared. After a write Rust sends `settings-changed` with `sharedSettings(...)` to the other windows, and `takeSharedSettings` applies it without writing back. Popups and menus are routed to the window that opened them; the hub (`hub.rs`) scopes its one-window keys by owner, so each window has its own Settings and panels.

## Settings session

Opening Settings snapshots the settings, the board and the undo stacks (`beginSettingsSession`). Every change in the form sends `settings-preview`, and `previewSettingsForm` applies it at once; `persist` is a no-op while the session is open. OK runs `applySettingsForm` against the snapshot, so one Undo takes back the whole visit; Cancel, the close button and Escape run `revertSettingsSession`, which also takes back symbols and currencies added while the window was open.

Fonts: `fontBold`, `fontItalic`, `fontUnderline` and `fontStrike` replace the older `fontStyle` (still written for compatibility, and read when the switches are missing). `applyFontFace` marks the quote area and every panel with `data-font-scope="stocks"`; the stylesheet draws bold and italic over the whole scope and the decoration on each leaf element, so a strike line crosses a 44px price at its own middle.

## Printing

One window, `type: "print"`, 980×700: `.preview-setup` on the left, `.preview-side` on the right. `buildPrintModel` returns one page per board and section (`PRINT_SECTIONS` = stocks, rates, news, plus a price history for a custom range), chunked so a long list runs onto more pages, as plain tables styled by `print-style.js`. Each change sends `print-setup`; `openPrint` rebuilds and returns `{ pages, pageSetup, html }`, and `paintPreviewPage` keeps the page in view. The preview lays the page out at its real size in CSS pixels (`PX_PER_MM`) and scales it into the stage, so line breaks match the paper. Paper, orientation and margins reach the printer through the `@page` rule.

## Installer

`planInstall` refuses to continue until the language is `ko` or `en`. When an older copy is detected it records an uninstall of the program directory and of any previous shortcuts, then an install. Saved data is deleted only when that step is explicitly requested. Desktop and Start menu shortcuts are separate steps and are omitted when declined. Both steps store the platform program-icon path.

On Windows, `hooks.nsh` runs before the welcome page and looks for the Electron build (its electron-builder uninstall key, per user or all users) and for an earlier Tauri install. If either is there it says the program will be removed completely and installed again, then asks whether to delete saved data. It runs the old uninstaller silently and removes the folder. Without a yes, settings.json and window.json stay and only the Electron build's Chromium caches are deleted. The next page offers desktop and Start menu shortcuts as two checkboxes; Tauri's own shortcuts are turned off and the chosen ones point at `$INSTDIR\icon.ico`, which is `assets/icon.ico`. `.mymoney` documents get `$INSTDIR\file.ico`.

`npm run build:win` builds `MyMoney_1.0.0_x64-setup.exe` and copies it to the root. `web-dist/`, `src-tauri/target/`, and that root installer stay gitignored.

## Themes and documents

Twenty light themes, twenty dark themes, and one custom theme live in `src/core/themes.js`. Only the window background follows the transparency slider. Text and solid controls stay opaque. Gains and losses use their own two variables so they stay readable in both modes. A document is JSON with the `.mymoney` extension and holds the boards, their watchlists, and the last fetched data. The document icon is separate from the program icon.
