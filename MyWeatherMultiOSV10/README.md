# MyWeather 1.0.0

MyWeather shows daily, weekly, and monthly weather for a chosen country and city. Forecasts are gathered from ECMWF, NOAA GFS, JMA, MET Norway, and wttr.in. The app runs on the web, Windows, Linux, and macOS.

Author: SHKWON (knix008@naver.com)

## Languages

The window and the installer both offer Korean and English. The installer asks before it copies any files. The running app follows the language saved in Settings.

## Run

```bash
npm install
npm start
```

The web preview is `npm run start:web`, then open `src/index.html`.

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

electron-builder writes `dist/MyWeather-Setup-1.0.0.exe`. The same command copies that one file to the project root. The installer icon, the installed program icon, and both shortcuts are `assets/icon.ico`.

During setup the user can:

- choose Korean or English
- remove an existing installation completely before the new copy is written
- keep or delete saved settings and weather files
- create a desktop shortcut, a Start menu shortcut, both, or neither

Linux and macOS setup scripts in `installer/linux` and `installer/macos` ask the same questions and call `installer/cli.js`.

## Window

The window has no operating-system title bar. It does not place an icon on the Windows taskbar. A system-tray icon is shown instead. Click or right-click that icon to open the weather, file, and edit menus. Every entry has its own icon.
