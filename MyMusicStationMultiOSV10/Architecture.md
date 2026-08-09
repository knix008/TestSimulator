# Architecture

My Music Station is a compact cross-platform music player built with React, Vite, TypeScript, and Tauri 2.

## Layers

- **React UI**: fixed-size player shell, custom toolbar, transport controls, spectrum canvas, playlist side panel, language switcher, theme manager, about dialog.
- **Web Audio API**: HTML `<audio>` element connected through `MediaElementSource → Analyser → Gain → destination` for playback and spectrum bars.
- **Metadata**: `music-metadata` parses tags and embedded artwork when local files are loaded.
- **Tauri shell**: frameless 960×520 window, system tray, file associations, NSIS/MSI (and macOS/Linux) packaging.
- **Tauri plugins**: `@tauri-apps/plugin-dialog` and `@tauri-apps/plugin-fs` for native open/save dialogs and filesystem access.

## Runtime Flow

1. The user opens a music folder, audio files, a `.mplist` playlist, or a remote URL (native dialogs keep real filesystem paths).
2. Local files are read into same-origin `blob:` URLs so Web Audio analysis works in WebView2 (asset-protocol URLs alone would silence `createMediaElementSource`).
3. Tracks are held in an in-memory playlist; the last music folder path is stored in `localStorage`.
4. Play resumes `AudioContext` and the media element together so WebView2 keeps user activation.
5. Spectrum bars map frequency bins left→right as blue→red (`hue = 240 → 0`).
6. Closing the window hides it; the tray icon stays alive (managed in Rust state). Quit is only available from the tray menu.

## Playlist Format

`.mplist` is JSON:

- `format`: `my-music-station-playlist`
- `version`: `1`
- Local tracks store `filePath` (and path in `source`); remote tracks store the original URL (`remoteUrl` / `source`).

## Desktop Packaging

`scripts/build-desktop.mjs` is the single release path for both `npm start` and installers. It pins `CARGO_TARGET_DIR` to `src-tauri/target`, builds the chosen bundles, copies installers to the project root, and writes `src-tauri/target/release/build-manifest.json`.

| Command | Result |
| --- | --- |
| `npm run build:web` | Vite bundle in `dist/` |
| `npm run build:win` | Same desktop build: NSIS + MSI + root copy |
| `npm run build:mac` | Same desktop build: `.app` + `.dmg` + root copy |
| `npm run build:linux` | Same desktop build: AppImage + DEB + RPM + root copy |
| `npm run copy:installers` | Copy newest artifacts from `release/bundle` to root |
| `npm start` | Launch the local release binary; if sources are newer, runs the same desktop build as `build:win`/`mac`/`linux` first |

The Program Files (or Applications) install is updated only by running the newly produced installer.

Windows NSIS hooks (`src-tauri/windows/nsis-hooks.nsh`):

- **PREINSTALL**: kill running process, uninstall previous NSIS/MSI copies, remove leftovers and file-association keys.
- **POSTINSTALL**: register `.mplist` and audio associations / media client keys.
- **PRE/POST UNINSTALL**: stop the app and clean associations.

Release builds use `windows_subsystem = "windows"` so no extra console window appears.

## Window & Tray

- Fixed size: **960×520**, non-resizable, undecorated.
- Toolbar Settings dialog persists preferences in `localStorage` (`myMusicStation.appSettings`).
- System tray usage is optional; Rust commands `get_shell_settings` / `set_use_system_tray` sync tray visibility and close behavior (`shell-settings.json` under the app config dir).
- When tray is enabled, close hides the window; when disabled, close exits the app.
- Tray icon is built in `setup` and stored in managed state; left-click (and tray menu **Settings**) shows the window and emits `open-settings`; menu: Show / Settings / Quit.
