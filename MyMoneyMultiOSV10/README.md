# MyMoney 1.0.0

MyMoney shows stock quotes for a chosen market, today's exchange rates, and today's business headlines. Quotes come from Yahoo Finance (two hosts, the second as failover), rates from Frankfurter (ECB) and ExchangeRate-API, and headlines from Google News and a wire feed that carries pictures. The app runs on the web, Windows, Linux, and macOS.

Author: SHKWON (knix008@naver.com)

## Markets and symbols

The app opens on the Korea Exchange with a short watchlist. Settings offers sixteen markets, Korea and the United States first, then Japan, China, Hong Kong, Taiwan, the United Kingdom, Germany, France, the Netherlands, Switzerland, Canada, Australia, India, Brazil, and Singapore. Choose a market, choose one of its listed symbols, and press Add. A symbol that is not in the catalog can be found with Search, which queries Yahoo Finance and adds the result to the list for the session. The Watchlist page removes symbols one at a time.

## Languages

The window and the installer both offer Korean and English. The installer asks before it copies any files. The running app follows the language saved in Settings.

## Run

```bash
npm install
npm start
```

The web preview is `npm run start:web`, then open `src/index.html`. In a browser the quote and rate services must allow cross-origin requests; the Electron window fetches from the main process and is not subject to that limit.

`npm start` launches the Electron window. Restart it after changing Electron or installer code. Windows can keep the previous taskbar icon in its icon cache until the process is started again.

## Test

```bash
npm test
```

The command regenerates the icons and runs the full suite. The summary at the end lists every category.

## Build the Windows installer

```bash
npm run build:win
```

electron-builder writes `dist/MyMoney-Setup-1.0.0.exe`. The same command copies that one file to the project root. The installer icon, the installed program icon, and both shortcuts are `assets/icon.ico`.

During setup the user can:

- choose Korean or English
- remove an existing installation completely before the new copy is written
- keep or delete saved settings and market files
- create a desktop shortcut, a Start menu shortcut, both, or neither

Linux and macOS setup scripts in `installer/linux` and `installer/macos` ask the same questions and call `installer/cli.js`.

## Window

The window has no operating-system title bar. It does not place an icon on the Windows taskbar. A system-tray icon is shown instead. Click or right-click that icon to open the market, file, and edit menus. Every entry has its own icon.

The three toolbar buttons open the stocks, exchange-rate, and news windows beside the main window. The main window itself shows the selected symbol's price, its change, and its direction.

## Showing the watchlist

The window shows one symbol at a time or the whole watchlist, chosen on the Watchlist page of Settings.

- **One symbol.** Clicking the quote moves to the next watched symbol and wraps round at the end. The same move is on the right-click menu. Auto-advance can be set to every 3, 5, 10, 30 or 60 seconds, and is off by default.
- **The whole watchlist.** Every symbol is listed with the market index on top, and the window is made exactly as tall as the rows so nothing is cut off and nothing scrolls. Adding or removing a symbol resizes it again. Going back to one symbol restores the window's earlier size.

## Currencies

The Currencies page of Settings holds the base currency and the list of currencies to show against it, picked from thirty-two. The rate window grows with that list. Each pair is quoted on the side that reads as a price, so against the won the dollar shows as `USD/KRW 1,335.11` rather than its reciprocal.
