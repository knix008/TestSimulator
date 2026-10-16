# MyWeather 1.0.0

MyWeather shows daily, weekly, and monthly weather for a chosen country and city. Forecasts are gathered from ECMWF, NOAA GFS, JMA, MET Norway, and wttr.in. The app runs on the web, Windows, Linux, and macOS.

The desktop app is built with [Tauri 2](https://tauri.app): a small Rust program hosts the pages in `src/` in the system webview (WebView2 on Windows). It replaced the earlier Electron build, which bundled its own Chromium.

| | Electron build | Tauri build |
| --- | --- | --- |
| Windows installer | 82 MB | 2 MB |
| Private memory, one window | about 240 MB | about 120 MB |
| Processes | 4 or more, one more per open window | the app and 6 WebView2 processes shared by every window, with one renderer |

Author: SHKWON (<knix008@naver.com>)

## Languages

The window and the installer both offer Korean and English. The installer asks before it copies any files. The running app follows the language saved in Settings.

## Requirements

- Node.js 20 or later and npm
- Rust (stable) with Cargo, for the desktop app
- Python 3, for `npm test` (it regenerates the icons first)
- Windows: WebView2, already present on Windows 10 and 11. Linux: the `webkit2gtk-4.1` development packages Tauri lists.

## Run

```bash
npm install
npm start
```

`npm start` runs `tauri dev` on a port that is free on both 127.0.0.1 and ::1 (`scripts/dev.js`), so it never shows another program's dev server. It copies `src/` into `web-dist/` (`scripts/stage-web.js`) and rebuilds the Rust program, so every run shows the latest code. The pages are compiled into the executable, so a running copy does not pick up later edits: start it again.

The web preview is `npm run start:web`, then open `src/index.html`.

## Test

```bash
npm test
```

The command regenerates the icons and runs every category, then prints a summary:

- **Core, GUI, Installer, Icons** and the rest: the pages and shared modules in jsdom.
- **Rust**: `cargo test` for window placement, the dialog hub, and the settings merge (`npm run test:rust` runs only these).
- **Desktop (Tauri)**: builds the debug executable and drives the real windows through the DevTools protocol. Each run uses its own settings folder (`MYWEATHER_CONFIG_DIR`) and a free debug port (`MYWEATHER_DEBUG_PORT`), so an installed copy, its settings, and its login entry are never touched. These tests also hold the resource budget: one renderer process for every window and less than 180 MB private memory.

## Build the installers

```bash
npm run build:win     # NSIS installer, copied to the project root
npm run build:linux   # deb and AppImage
npm run build:mac     # dmg
```

`npm run build:win` writes `src-tauri/target/release/bundle/nsis/MyWeather_1.0.0_x64-setup.exe` and copies that one file to the project root. The installer icon, the installed program icon, and both shortcuts are `assets/icon.ico`.

During setup the user can:

- choose Korean or English
- remove an existing installation completely before the new copy is written, including the earlier Electron build
- keep or delete saved settings and weather files (`%APPDATA%\MyWeather`, the same folder the Electron build used)
- create a desktop shortcut, a Start menu shortcut, both, or neither

Linux and macOS setup scripts in `installer/linux` and `installer/macos` ask the same questions and call `installer/cli.js`, which installs the binary from `npm run build`.

## Window

The window has no operating-system title bar. It does not place an icon on the Windows taskbar. A system-tray icon is shown instead. Click or right-click that icon to open the weather, file, and edit menus. Every entry has its own icon.
