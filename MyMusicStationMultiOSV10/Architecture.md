# Architecture

My Music Station V1.0.0 is a compact cross-platform music player built with React, Vite, TypeScript, and Tauri 2.

## Layers

- **React UI**: fixed-size player shell, custom toolbar, transport, spectrum canvas, playlist side panel, compact (mini) mode, language/theme/wallpaper controls.
- **Popup windows** (`src/popups/`): settings / convert / extract / about / alert / error / folder-progress dialogs each run in their own owned Tauri window (`popup-<kind>`, same bundle with `?popup=<kind>`). The main window holds all state and streams snapshots over Tauri events (`popup:state`); popups send intents back (`popup:action`). Rust emits `popup:closed` when a popup is destroyed and closes every `popup-*` window whenever the main window closes or hides. In a plain browser the same dialog components render inline as modals.
- **Themes** (`src/themes.ts`): 16 built-in themes defined as full CSS-variable sets (applied inline on `:root`), so popups and the settings colour picker can render them without stylesheet lookups; custom themes layer an accent on the Dark base.
- **Web Audio API**: HTML `<audio>` → `MediaElementSource → Analyser → Gain → destination` for playback and spectrum.
- **Metadata**: `music-metadata` for tags and embedded artwork on local files.
- **Tauri shell**: frameless window (**835×496** normal, **340×180** compact), status bar, optional system tray, single-instance, file associations, NSIS/DMG/AppImage packaging.
- **Tauri plugins**: `@tauri-apps/plugin-dialog`, `@tauri-apps/plugin-fs`.
- **Native helpers (Rust)**:
  - `convert_audio` — ffmpeg convert with format + quality
  - `extract_audio_from_url` — yt-dlp audio extract (format + quality)
  - `load_wallpaper_image` — wallpaper decode (incl. TIFF → PNG)
  - shell / UI settings persistence
  - pending open-file queue for OS file associations

## Runtime Flow

1. User opens a folder, audio files, a `.mplist`, a remote URL, or the OS launches the app with file arguments.
2. Local files are read into same-origin `blob:` URLs so Web Audio analysis works in WebView2.
3. **URL add**:
   - Direct audio URL → **stream** (`source` = HTTP URL).
   - Video/media page (YouTube, etc.) → **extract** audio via yt-dlp into the app cache (`appCacheDir/remote-audio/<url-hash>.m4a`), then play from that file.
4. Playlist is in memory. The working list is auto-saved on every change to `localStorage` **and** to `appConfigDir/session-playlist.json` (WebView2 can drop `localStorage` writes when the process exits from the tray; the file wins on restore). Last folder/playlist paths stay in `localStorage`.
5. **Restore of link tracks**: if the saved `filePath` or the cache entry for the URL still exists, the track is rebuilt from that file (`mode: 'extracted'`, no network). Otherwise it is listed as `mode: 'pending'` and re-downloaded on first play. Pending tracks are never handed to `<audio>` (the page URL would raise a media error) — the element's `src` is cleared until extraction finishes.
6. Removing a track: the removed track is silenced immediately (pause, clear `src`), the successor is selected in the same render batch, and playback continues with it only if the removed track was playing. A link track's cache file is deleted when it leaves the list.
7. Play resumes `AudioContext` and the media element together (user activation).
8. Spectrum styles and color direction are user-selectable.
9. Close hides to tray when enabled; otherwise exits. Tray Quit fully exits.

## URL / Save Pipeline

| Kind | Play | Save (toolbar convert or track context menu) |
| --- | --- | --- |
| Direct audio URL | Stream | Download/convert at chosen quality → replace track with local file |
| Media/video URL | yt-dlp extract → cache file play (reused across launches) | Re-extract (or convert) at chosen quality → replace track with local file |
| Local file | blob / path | Optional format convert via ffmpeg |

After a successful URL-track save, the playlist entry becomes `origin: 'local'` with `filePath` pointing at the saved file (no longer stream/pending).

## Playlist Format

`.mplist` is JSON:

- `format`: `my-music-station-playlist`
- `version`: `1`
- Local tracks: `filePath` (and path in `source`)
- Remote tracks: `remoteUrl` / `source`, plus `filePath` when an extracted file exists (restored from that file or the URL cache if present; otherwise stream / pending extract deferred until play)

## Track Context Menu

Right-click on a playlist row opens `.track-context-menu` (rendered as a direct child of `main.station-shell`, positioned relative to it). Items: Play, Save/Download (URL-added tracks only), Remove. The shell rule `.station-shell > :not(...) { position: relative }` explicitly excludes `.track-context-menu` — without that exclusion the menu falls into the flex flow and is clipped out of view.

## Title Toolbar Layout

`.title-toolbar` is a grid: `minmax(0, max-content) minmax(8px, 1fr) max-content auto` (brand · drag space · tool buttons · window buttons). The brand column is the only one allowed to shrink (its text ellipsizes) so the minimize/close buttons always stay inside the 835px window. The close button hover is solid red (`#e5484d`) in both normal and compact mode.

## Desktop Packaging

`scripts/build-desktop.mjs` is the release path for `npm start` rebuilds and installers. It:

1. Runs `scripts/fetch-ffmpeg.mjs` and `scripts/fetch-ytdlp.mjs`
2. Pins `CARGO_TARGET_DIR` to `src-tauri/target`
3. Builds the platform bundle (Windows **NSIS** by default)
4. Copies `ffmpeg` / `yt-dlp` beside the release EXE
5. Copies the preferred installer to the project root via `scripts/copy-installers.mjs`
6. Writes `src-tauri/target/release/build-manifest.json`

| Command | Result |
| --- | --- |
| `npm run build:web` | Vite bundle in `dist/` |
| `npm run build:win` | NSIS setup → root `*-setup.exe` |
| `npm run build:mac` | `.dmg` → root |
| `npm run build:linux` | AppImage → root |
| `npm start` | Launch release binary; rebuild if sources are newer |
| `npm start -- --no-build` | Launch existing binary only |

Windows NSIS hooks (`src-tauri/windows/nsis-hooks.nsh`):

- **PREINSTALL**: stop process; if a previous install is found, **ask** whether to remove it completely (settings/session included). Silent install defaults to Yes (full clean).
- **POSTINSTALL**: register `.mplist`; register as media client + Open with for audio types; **ask** whether to set as default player (silent install defaults to Yes).
- **PRE/POST UNINSTALL**: stop app and clean associations.

Release builds use `windows_subsystem = "windows"` (no console flash). Helpers spawn with `CREATE_NO_WINDOW` on Windows.

## Window & Tray

- Normal: **835×496**, non-resizable, undecorated; compact: **340×180** (app icon on mini title bar).
- Settings in `localStorage` (`myMusicStation.appSettings`) plus durable UI settings via Rust (`appConfigDir/app-settings.json`).
- Session playlist mirrored to `appConfigDir/session-playlist.json`; extracted link audio cached under `appCacheDir/remote-audio/` (both via `@tauri-apps/plugin-fs`, scope `$APPDATA`/`$HOME`).
- Tray optional: `get_shell_settings` / `set_use_system_tray` ↔ `shell-settings.json`.
- Single-instance: second launch focuses the window and forwards open-file args (`open-files` / `take_pending_open_files`).
- Tray: Show / Settings / Quit; left-click opens Settings.

## Key Paths

| Path | Role |
| --- | --- |
| `src/App.tsx` | Main UI and playback logic |
| `src-tauri/src/lib.rs` | App entry, tray, open-files |
| `src-tauri/src/audio_convert.rs` | ffmpeg convert |
| `src-tauri/src/audio_extract.rs` | yt-dlp extract |
| `src-tauri/src/wallpaper.rs` | Wallpaper load |
| `src-tauri/windows/nsis-hooks.nsh` | Installer associations |
| `scripts/build-desktop.mjs` | Desktop release build |
| `scripts/fetch-ffmpeg.mjs` / `fetch-ytdlp.mjs` | Bundle helpers |
