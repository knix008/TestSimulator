# Architecture

MyMoney 1.0.0 is a vanilla ES-module app. Electron hosts the same pages that the browser preview uses. There is no bundler step for the renderer.

## Layout

- `src/core` holds settings, themes, documents, i18n, undo, and paths. `backgroundAlpha` maps transparency 0 to a fully opaque window and 100 to 25% opacity, so the window never disappears.
- `src/market` fetches the five sources and aggregates one board. `markets.js` is the catalog of exchanges and listings, `providers.js` the URLs and parsers, `aggregate.js` the averaging, `service.js` the fetch pass, `format.js` the money and percent strings, and `trend.js` the three directions a quote can take.
- `src/ui` draws the frameless window, the stocks, rates, and news popups, menus, and the tray menu model in `tray-menu.js`. `market-view.js` renders the scene and the three panels.
- `src/platform` is the small seam between the browser and Electron. The renderer talks to `window.electronAPI` only through that seam.
- `electron/main.js` creates the transparent window, the tray, file dialogs, and popup windows. `preload.cjs` exposes the IPC bridge. `popup-hub.js` tracks panel and settings windows.
- `installer/plan.js` is the shared install policy. `installer/windows/installer.nsh` is the NSIS page for Windows. `installer/cli.js` performs the same steps on Linux and macOS.
- `assets/icon.ico`, `assets/icon.png`, and `assets/icon.icns` are the program icon. `assets/file.ico` is only the `.mymoney` document icon. `assets/menu` holds the tray glyphs.
- `scripts/generate_icons.py` draws the program icon, the document icon, and the tray glyphs. `scripts/copy-installer.js` copies the single setup executable to the repository root.
- `test` loads the modules in jsdom and checks the parsers, the installer plan, the tray menu, the packaged icon paths, and the whole window.

## Data

A board is one market plus the symbols watched in it. `loadBoard` runs every enabled source in parallel: each watched symbol and the market index go to the quote sources, the base currency goes to the rate sources, and a query built from the market and the first watched names goes to the news source.

Quote sources return the same `{ days, currency, name }` shape, so `aggregateQuote` averages them by date and keeps each source's own series under `bySource`. Yahoo serves the chart API from two edge hosts; `yahoo` is `query1` and `yahoo2` is `query2`, so a board still fills when one host is unreachable. The display priority in Settings picks one of those series instead of the average; a priority whose source did not answer falls back to the average. Rate tables average the same way. Headlines are merged, de-duplicated by title, and sorted newest first.

A source that fails is recorded in `sources` and the rest of the board is still shown. Only a board with no usable quote at all raises an error. Google News returns RSS, so `parseNewsFeed` strips the markup and decodes the entities itself; a headline is only ever inserted as escaped text.

Prices are shown in the listing's own currency, or converted to the base currency when Settings asks for that. The conversion uses the fetched rate table, which is quoted against one base, so a cross rate is one division.

## Window and tray

The main `BrowserWindow` is frameless, transparent, and created with `skipTaskbar: true`. `ready-to-show`, `show`, and `focus` call `setSkipTaskbar(true)` again so Windows does not put the program icon back on the taskbar. Popup and print windows also skip the taskbar.

On startup the main process creates a `Tray` from `assets/icon.ico` on Windows and `assets/icon.png` elsewhere. A click builds a native menu from `buildTrayMenu`. Labels follow the language in `settings.json`. Each item, including the Market, File, and Edit parents, has a PNG from `assets/menu`. The first item, Show window, only reveals the main window. Choosing any other item shows the main window and sends `menu-command` to the renderer, which runs the same actions as the in-window menu.

Closing the window still asks the renderer to save or discard. Quit destroys the tray.

## Installer

`planInstall` refuses to continue until the language is `ko` or `en`. When an older copy is detected it records an uninstall of the program directory and of any previous shortcuts, then an install. Saved data is deleted only when that step is explicitly requested. Desktop and Start menu shortcuts are separate steps and are omitted when declined. Both steps store the platform program-icon path.

The Windows package turns electron-builder's automatic shortcuts off. `installer.nsh` shows two checkboxes and creates `.lnk` files with `$INSTDIR\resources\icon.ico`. That file is `assets/icon.ico`, copied with `extraResources`, and it is also `build.win.icon`, `installerIcon`, and `uninstallerIcon`. If a previous install is found, the script deletes the old shortcuts, runs the old uninstaller, and removes the install directory before the new files are written. User data under `%APPDATA%\MyMoney` is removed only after Yes.

`npm run build:win` builds `MyMoney-Setup-1.0.0.exe` and copies it to the root. `dist/` and that root installer stay gitignored.

## Themes and documents

Twenty light themes, twenty dark themes, and one custom theme live in `src/core/themes.js`. Only the window background follows the transparency slider. Text and solid controls stay opaque. Gains and losses use their own two variables so they stay readable in both modes. A document is JSON with the `.mymoney` extension and holds the boards, their watchlists, and the last fetched data. The document icon is separate from the program icon.
