# MyMoney 1.0.0

MyMoney shows stock quotes for a chosen market, today's exchange rates, and today's business headlines. Quotes come from Yahoo Finance (two hosts, the second as failover), rates from Frankfurter (ECB) and ExchangeRate-API, and headlines from Google News and a wire feed that carries pictures. The app runs on the web, Windows, Linux, and macOS.

The desktop app is built with [Tauri 2](https://tauri.app): a small Rust program hosts the pages in `src/` in the system webview (WebView2 on Windows). It replaced the earlier Electron build, which bundled its own Chromium.

Author: SHKWON (knix008@naver.com)

## Markets and symbols

The app opens on the Korea Exchange with a short watchlist. Settings offers sixteen markets, Korea and the United States first, then Japan, China, Hong Kong, Taiwan, the United Kingdom, Germany, France, the Netherlands, Switzerland, Canada, Australia, India, Brazil, and Singapore. Choose a market, choose one of its listed symbols, and press Add. A symbol that is not in the catalog can be found with Search, which queries Yahoo Finance and adds the result to the list for the session. The Watchlist page removes symbols one at a time.

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

The web preview is `npm run start:web`, then open `src/index.html`. In a browser the quote and rate services must allow cross-origin requests; the desktop app fetches through Rust and is not subject to that limit.

`npm start` runs `tauri dev` on a port that is free on both 127.0.0.1 and ::1 (`scripts/dev.js`), so it never shows another program's dev server. It copies `src/` into `web-dist/` (`scripts/stage-web.js`) and rebuilds the Rust program, so every run shows the latest code. The pages are compiled into the executable, so a running copy does not pick up later edits: start it again.

## Test

```bash
npm test
```

The command regenerates the icons and runs every category, then prints a summary:

- **Core, Market GUI, Settings, Installer, Icons** and the rest: the pages and shared modules in jsdom.
- **Rust**: `cargo test` for window placement, the dialog hub, and the settings merge (`npm run test:rust` runs only these).
- **Desktop (Tauri)**: builds the debug executable and drives the real windows through the DevTools protocol. Each run uses its own settings folder (`MYMONEY_CONFIG_DIR`) and a free debug port (`MYMONEY_DEBUG_PORT`), so an installed copy, its settings, and its login entry are never touched. These tests also hold the resource budget: one renderer process for every window and less than 180 MB private memory.

## Build the installers

```bash
npm run build:win     # NSIS installer, copied to the project root
npm run build:linux   # deb and AppImage
npm run build:mac     # dmg
```

`npm run build:win` writes `src-tauri/target/release/bundle/nsis/MyMoney_1.0.0_x64-setup.exe` and copies that one file to the project root. The installer icon, the installed program icon, and both shortcuts are `assets/icon.ico`.

During setup the user can:

- choose Korean or English
- remove an existing installation completely before the new copy is written, including the earlier Electron build
- keep or delete saved settings and market files (`%APPDATA%\MyMoney`, the same folder the Electron build used)
- create a desktop shortcut, a Start menu shortcut, both, or neither

Linux and macOS setup scripts in `installer/linux` and `installer/macos` ask the same questions and call `installer/cli.js`, which installs the binary from `npm run build`.

## Window

The window has no operating-system title bar. It does not place an icon on the Windows taskbar. A system-tray icon is shown instead. Click or right-click that icon to open the windows, market, and edit menus. Every entry has its own colour icon. The close button only hides a window; Exit in the tray ends the program. Only one copy runs at a time: a second launch says so and exits.

Several windows can be open at once, each with its own market and watchlist. Open one from the tray (Windows › New window) or the right-click menu. Every window's board and place, and all settings, are saved automatically to `settings.json` in the user data folder; there are no file commands.

The three toolbar buttons open the stocks, exchange-rate, and news windows beside the main window. The main window itself shows the selected symbol's price, its change, and its direction.

## Showing the watchlist

The window shows one symbol at a time or the whole watchlist, chosen on the Watchlist page of Settings.

- **One symbol.** Clicking the quote moves to the next watched symbol and wraps round at the end. The same move is on the right-click menu. Auto-advance can be set to every 3, 5, 10, 30 or 60 seconds, and is off by default.
- **The whole watchlist.** Every symbol is listed with the market index on top, and the window is made exactly as tall as the rows so nothing is cut off and nothing scrolls. Adding or removing a symbol resizes it again. Going back to one symbol restores the window's earlier size.

## Window

The window remembers where it was and how big it was, and opens there next time. Narrow it and the program name gives up its place to leave room for the buttons; widen it and the name comes back.

The settings window is wide enough to show every tab at once in either language, and only as tall as the page you are on.

## Currencies

The Currencies page of Settings holds the base currency and the list of currencies to show against it, picked from thirty-two. The rate window grows with that list. Each pair is quoted on the side that reads as a price, so against the won the dollar shows as `USD/KRW 1,335.11` rather than its reciprocal.
