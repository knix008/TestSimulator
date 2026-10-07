# Architecture

MyWeather 1.0.0 is a vanilla ES-module app. Electron hosts the same pages that the browser preview uses. There is no bundler step for the renderer.

## Layout

- `src/core` holds settings, themes, documents, i18n, undo, and paths. `backgroundAlpha` maps transparency 0 to a fully opaque window and 100 to 25% opacity, so the window never disappears.
- `src/weather` fetches the five sources and aggregates one forecast.
- `src/ui` draws the frameless window, forecast popups, menus, and the tray menu model in `tray-menu.js`.
- `src/platform` is the small seam between the browser and Electron. The renderer talks to `window.electronAPI` only through that seam.
- `electron/main.js` creates the transparent window, the tray, file dialogs, and popup windows. `preload.cjs` exposes the IPC bridge. `popup-hub.js` tracks forecast and settings windows.
- `installer/plan.js` is the shared install policy. `installer/windows/installer.nsh` is the NSIS page for Windows. `installer/cli.js` performs the same steps on Linux and macOS.
- `assets/icon.ico`, `assets/icon.png`, and `assets/icon.icns` are the program icon. `assets/file.ico` is only the `.myweather` document icon. `assets/menu` holds the tray glyphs.
- `scripts/generate_icons.py` draws the program icon, the document icon, and the tray glyphs. `scripts/copy-installer.js` copies the single setup executable to the repository root.
- `test` loads the modules in jsdom and checks the installer plan, the tray menu, and the packaged icon paths.

## Window and tray

The main `BrowserWindow` is frameless, transparent, and created with `skipTaskbar: true`. `ready-to-show`, `show`, and `focus` call `setSkipTaskbar(true)` again so Windows does not put the program icon back on the taskbar. Popup and print windows also skip the taskbar.

On startup the main process creates a `Tray` from `assets/icon.ico` on Windows and `assets/icon.png` elsewhere. A click builds a native menu from `buildTrayMenu`. Labels follow the language in `settings.json`. Each item, including the Weather, File, and Edit parents, has a PNG from `assets/menu`. Choosing an item shows the main window and sends `menu-command` to the renderer, which runs the same actions as the in-window menu.

Closing the window still asks the renderer to save or discard. Quit destroys the tray.

## Installer

`planInstall` refuses to continue until the language is `ko` or `en`. When an older copy is detected it records an uninstall of the program directory and of any previous shortcuts, then an install. Saved data is deleted only when that step is explicitly requested. Desktop and Start menu shortcuts are separate steps and are omitted when declined. Both steps store the platform program-icon path.

The Windows package turns electron-builder's automatic shortcuts off. `installer.nsh` shows two checkboxes and creates `.lnk` files with `$INSTDIR\resources\icon.ico`. That file is `assets/icon.ico`, copied with `extraResources`, and it is also `build.win.icon`, `installerIcon`, and `uninstallerIcon`. If a previous install is found, the script deletes the old shortcuts, runs the old uninstaller, and removes the install directory before the new files are written. User data under `%APPDATA%\MyWeather` is removed only after Yes.

`npm run dist:win` builds `MyWeather-Setup-1.0.0.exe` and copies it to the root. `dist/` stays gitignored.

## Themes and documents

Twenty light themes, twenty dark themes, and one custom theme live in `src/core/themes.js`. Only the window background follows the transparency slider. Text and solid controls stay opaque. A document is JSON with the `.myweather` extension. The document icon is separate from the program icon.
