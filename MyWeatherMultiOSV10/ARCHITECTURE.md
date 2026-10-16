# Architecture

MyWeather 1.0.0 is a vanilla ES-module app. Tauri 2 hosts the same pages that the browser preview uses, in the system webview. There is no bundler step for the renderer: `scripts/stage-web.js` copies `src/` and `assets/icon.png` into `web-dist/`, and Tauri compiles that folder into the executable.

## Layout

- `src/core` holds settings, themes, documents, i18n, undo, and paths. `backgroundAlpha` maps transparency 0 to a fully opaque window and 100 to 25% opacity, so the window never disappears.
- `src/weather` fetches the five sources and aggregates one forecast.
- `src/ui` draws the frameless window, forecast popups, menus, and the tray menu model in `tray-menu.js`.
- `src/platform` is the seam between the pages and the host. `host.js` picks `desktop.js` when Tauri is present and `web.js` otherwise. `tauri-bridge.js` is the only file that calls Tauri: one function per Rust command, and listeners for the events Rust sends to this window.
- `src/index.html` is a weather window, `popup-host.html` a dialog (forecast, settings, about, print setup), `menu-host.html` a command menu or the tray menu, and `print-host.html` the window the system print dialog opens over.
- `src-tauri/src/lib.rs` owns the windows, the tray, file dialogs, settings.json and window.json, and every command. `placement.rs` (window placement, tray menu placement), `hub.rs` (one dialog per kind per window, waiting for answers), and `store.rs` (merging a window's save into settings.json) are plain Rust with unit tests.
- `src-tauri/windows/hooks.nsh` is the install policy for Tauri's NSIS installer. `installer/plan.js` is the same policy as data, used by `installer/cli.js` on Linux and macOS.
- `assets/icon.ico`, `assets/icon.png`, and `assets/icon.icns` are the program icon. `assets/file.ico` is only the `.myweather` document icon. `assets/menu` holds the tray glyphs.
- `scripts/generate_icons.py` draws the program icon, the document icon, and the tray glyphs. `scripts/copy-installer.js` copies the newest installer to the repository root.
- `test` loads the modules in jsdom, runs `cargo test`, and drives the real executable (`test/e2e/harness.js`, `test/suites/desktop.js`).

## Resource use

The Electron build shipped its own Chromium and ran a browser, GPU, and utility process plus one renderer per window. The Tauri build keeps the Rust host under 10 MB and shares the system WebView2 among all windows. Every window is created with the same WebView2 switches (`BROWSER_ARGS`):

- `--process-per-site --renderer-process-limit=1`: the weather windows, dialogs, and menus are small pages from one site, so one renderer serves them all. Without these each dialog and menu started its own renderer (about 35 MB each).
- `--disable-gpu`: nothing animates, and the GPU process shrinks from about 95 MB to about 22 MB. Transparent windows look the same with software compositing.

Other savings: window moves and resizes send at most one step per frame (`coalesceSteps` in `desktop.js`); window.json is written once a move has been still for 400 ms instead of on every step; the installed font list is gathered once per run; weather requests share one HTTP agent; and the tray icon is promoted through the registry directly instead of starting PowerShell up to seven times.

## Window and tray

Weather windows are frameless, transparent, have no shadow, and skip the taskbar. Each is created hidden and shown once its page has loaded. The first window's place comes from window.json and settings.json, checked against the current displays (`place_window`). Extra windows saved from a moved city reopen where they were, or step down and right from the first.

On startup Rust creates the tray icon from the bundle icon. A click opens `menu-host.html` as a tray menu: that page reads settings.json and builds the items with `buildTrayMenu` in the saved language and theme, then asks Rust to size and place it next to the icon. The first item, Show window, only reveals the main window. Any other item shows the main window and sends `menu-command` to it, which runs the same actions as the in-window menu.

Closing the first window hides it and closes its dialogs. Exit in the tray ends the program after saving the window's place. A second launch exits at once through the single-instance plugin; the running copy shows the "already running" message in the saved language.

Events from Rust go to one window (`emit_to` with that window's label). The pages listen on their own window, because a global listener would also hear what other windows were sent.

The shared Rust state is never held while a window is shown, hidden, moved, or destroyed, because those calls can report back through a window event that takes the same lock.

## Settings location

settings.json and window.json live where the Electron build kept them: `%APPDATA%\MyWeather`, `~/.config/MyWeather`, or `~/Library/Application Support/MyWeather`. `MYWEATHER_CONFIG_DIR` moves them (the tests use this, and then WebView2 data goes there too). A debug build started with `--multi` or `MYWEATHER_MULTI=1` uses `MyWeather-pid-<pid>` and skips the single-instance lock. The login entry is only written by a release build that is not running under `MYWEATHER_CONFIG_DIR`.

## Installer

The installer refuses to continue until the language is Korean or English. Before the welcome page it looks for the Electron build (its electron-builder uninstall key) and for an earlier Tauri install. If either is there it says the program will be removed completely and installed again, then asks whether to delete saved data. It runs the old uninstaller silently and removes the folder. Without a yes, settings.json and window.json stay and only the Electron build's Chromium caches are deleted. The next page offers desktop and Start menu shortcuts as two checkboxes; Tauri's own shortcuts are turned off and the chosen ones point at `$INSTDIR\icon.ico`. `.myweather` documents get `$INSTDIR\file.ico`.

`npm run build:win` builds `MyWeather_1.0.0_x64-setup.exe` and copies it to the root. `web-dist/`, `src-tauri/target/`, and that root installer stay gitignored.

## Themes and documents

Twenty light themes, twenty dark themes, and one custom theme live in `src/core/themes.js`. Only the window background follows the transparency slider. Text and solid controls stay opaque. A document is JSON with the `.myweather` extension. The document icon is separate from the program icon.
