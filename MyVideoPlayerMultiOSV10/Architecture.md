# MyVideoPlayer — Architecture

This document describes how MyVideoPlayer is structured across desktop (Tauri 2) and web.
The desktop build moved from Electron to Tauri on 2026-10-27; the renderer (`src/`) did not change.

---

## 1. Overview

```
┌─────────────────────────────────────────────────────────────┐
│                  Tauri app (Rust, src-tauri/)                │
│  lib.rs · server.rs · download.rs · subs.rs · rtsp.rs        │
│  · compat.rs · auth.rs · persist.rs · native.rs · tools.rs   │
│  • Frameless main window + spectrum / history windows        │
│  • Esc / caption minimize → group-minimize all app windows   │
│  • Local HTTP server (127.0.0.1) → serves the embedded src/  │
│  • /__media/<key>/<token> → Range streaming for local files  │
│  • FFmpeg compat convert (soft remux → H.264)                │
│  • Bundled yt-dlp + FFmpeg (vendor/ → bundle resources)      │
│  • One command `vp(channel, args)` with the old IPC names    │
└───────────────────────────┬─────────────────────────────────┘
                            │ bridge.js (initialization script)
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              Renderer / Web UI (src/)                         │
│  index.html + ES modules                                      │
│  • app.js orchestrates playback, settings, hotkeys, status    │
│  • <video> for local/RTSP · YouTube IFrame API for YT         │
│  • History window · video fit · compact mode · spectrum window │
│  • Open progress for YouTube/RTSP; non-blocking settings UI   │
└─────────────────────────────────────────────────────────────┘
```

On **web** (`npm run web`), there is no Rust side. The same `src/` UI runs in the browser with a reduced feature set (no native dialogs, no downloads, no FFmpeg compat, no window opacity/chrome).

---

## 2. Processes and boundaries

### 2.1 Rust side (`src-tauri/src/`)

| File | Responsibility |
|------|----------------|
| `lib.rs` | App start-up, windows, dialogs, single instance + file arguments, drag-drop of files, window drag/opacity/bounds, spectrum/history child windows, **group minimize/restore** (`Esc`), the `vp` command dispatcher |
| `bridge.js` | Injected into every app page; rebuilds Electron's `window.desktopAPI` (`invoke("vp", { channel, args })`, events keep the old IPC names) |
| `server.rs` | Localhost server: pages from the embedded `src/`, `/__media` Range handler, `/__rtsp` live stream, settings snapshot |
| `download.rs` | YouTube URL parse, metadata, download strategies through `yt-dlp`; Instagram/TikTok/other links; stop-and-keep |
| `subs.rs` | Subtitle files beside a video (`clip.srt`, `clip.<lang>.srt`), YouTube subtitle download |
| `auth.rs` | YouTube sign-in window → Netscape `cookies.txt` for restricted downloads |
| `rtsp.rs` | RTSP/RTSPS via FFmpeg → fMP4 over HTTP; MP4 record / stop / finalize |
| `compat.rs` | FFmpeg soft remux / full H.264 convert with cache under `<data>/compat-cache` |
| `persist.rs` | Key/value store in `<data>/persist.json`; copies the Electron build's file in once |
| `native.rs` | Whole-window opacity and the taskbar's big icon (no Tauri API for either) |
| `tools.rs` | Locating yt-dlp / ffmpeg / the JS runtime (bundled Deno, Node.js fall-back), running them without console windows, file helpers |

**Why a local HTTP server?**
Windows load `http://127.0.0.1:{port}/index.html` (not `tauri://`) so the YouTube IFrame API accepts the page origin, and so media stays same-origin for the Web Audio spectrum analyser. To Tauri this is a *remote* origin, so `capabilities/default.json` lists `http://127.0.0.1:*` and `build.rs` registers the `vp` command as an app permission (`allow-vp`). The pages' CSP allows `ipc:` / `http://ipc.localhost`.

**Why `/__media/<key>/<base64url-path>`?**
Desktop media paths are encoded into same-origin HTTP URLs served with `Accept-Ranges` / `Content-Range`. `<key>` is a per-run secret so other local programs cannot read files through the server.

**Settings at start-up**
`settings.js` / `recent.js` read settings synchronously while modules load. `bridge.js` fetches the snapshot with one synchronous XHR (`/__vp/<key>/persist`) before the page's scripts run; writes go to Rust asynchronously and `persist:changed` keeps the other windows' copies current.

**Bundled tools**
`scripts/ensure-tools.js` (Tauri's `beforeDevCommand` / `beforeBuildCommand`, also `postinstall`) fetches `vendor/yt-dlp/`, copies FFmpeg from `ffmpeg-static` into `vendor/ffmpeg/`, and downloads Deno into `vendor/deno/`. All three ship as bundle resources. yt-dlp gets `--js-runtimes deno:<resources/deno>` for YouTube's signature challenge, so users need no Node.js; an installed Node.js is used only when the bundled Deno is missing (`MYVIDEOPLAYER_JS_RUNTIME=deno|node` forces one; the tests force `deno`).

**Window drag**
The toolbar calls `beginWindowDrag` / `updateWindowDrag` / `endWindowDrag`; Rust moves the window after the real cursor in physical pixels (so DPI and the invisible resize border never enter the sums). The spectrum / history title bars use CSS `app-region: drag`, which WebView2 honours.

**Full screen**
WebView2 alone only fills the window on `requestFullscreen`; `bridge.js` turns `fullscreenchange` into `window:setFullscreen`.

### 2.2 `window.desktopAPI` — selected surface

| API | Purpose |
|-----|---------|
| `isElectron` / `isTauri` | Feature detection in renderer (`isElectron` stays `true` = "desktop") |
| `getAppInfo` | Name, version, platform |
| `minimize` / `maximizeToggle` / `close` / `isMaximized` / `onWindowState` | Window chrome (`minimize` group-minimizes main + spectrum + history) |
| `setMinimumSize` / `getBounds` / `setBounds` | Min size + bounds (compact mode shrink/restore; sender window) |
| `beginWindowDrag` / `updateWindowDrag` / `endWindowDrag` | Frameless move |
| `setWindowOpacity` / `getWindowOpacity` | Per-window opacity (sender window) |
| `openMedia` / `openMediaPath` / `openSubtitle` / `findSubtitle` / `listSubtitles` | File dialogs & path helpers (remember last dirs) |
| `makeMediaCompatible` / `onMediaCompatProgress` | FFmpeg compat pipeline |
| `onOpenMediaPaths` | Files from the command line, a second launch, or dropped on the window |
| `persistGetItem` / `persistSetItem` / `persistRemoveItem` | Sync persist bridge |
| `parseYouTube` / `getYouTubeInfo` / `downloadYouTube` / `stopYouTubeDownload` / `onYouTubeDownloadProgress` | YouTube desktop pipeline (`downloadYouTube({ url, title, subtitleLang })`) |
| `openRtsp` / `stopRtsp` / `startRtspRecord` / `stopRtspRecord` / `onRtspRecordProgress` / … | RTSP view + record |
| `openSpectrumWindow` / `sendSpectrumMessage` / … | Separate spectrum window |
| `openHistoryWindow` / `sendHistoryMessage` / … | Separate play-history window |

### 2.3 Renderer (`src/`)

Pure static UI: no bundler. Modules are loaded as native ES modules.

| Module | Role |
|--------|------|
| `js/app.js` | Application controller: modes, fit/history/compact UI, hotkeys, DnD, status snapshot + locale refresh |
| `js/settings.js` | Settings defaults + load/save via persist layer (`videoFit`, `videoRotation`, `showHistoryPanel`, `compactMode`, …) |
| `js/persist.js` | `localStorage` (web) or `desktopAPI.persist*` (desktop) |
| `js/themes.js` | Builtin + custom themes, CSS variables, overlay sync; toolbar menus use scheme-locked contrast |
| `js/i18n.js` | English / Korean dictionaries + `applyI18n` |
| `js/hotkeys.js` | Editable-target / modal helpers for shortcut gating |
| `js/recent.js` | Recent / history list (max 30; file / youtube / rtsp) |
| `js/spectrum.js` | `SpectrumAnalyzer` (Web Audio) + `SpectrumPainter` (styles) |
| `js/spectrum-bridge.js` / `spectrum-window-app.js` / `spectrum.html` | Separate spectrum window (or web popup) |
| `js/history-bridge.js` / `history-window-app.js` / `history.html` | Separate play-history window (or web popup) |
| `js/subtitles.js` | SMI/SRT/VTT parse + overlay renderer |
| `js/youtube-player.js` | YouTube ID helpers + IFrame player controller |
| `js/error-dialog.js` | Detailed error modal with copy |
| `js/tooltip.js` | Floating tooltips (`data-i18n-tooltip`) |
| `styles/main.css` | Layout & components (fit modes, compact chrome, spectrum layering) |
| `styles/history-window.css` / `spectrum-window.css` | Child-window chrome |
| `styles/themes.css` | Builtin theme tokens (`--bg-stage`, etc.) |

### 2.4 Scripts (`scripts/`)

| Script | Role |
|--------|------|
| `ensure-tools.js` | yt-dlp (via `ensure-yt-dlp.js`, `--latest` before builds) + FFmpeg copy into `vendor/` |
| `copy-installer-to-root.js` | Copy built installers from `src-tauri/target/release/bundle` to the repo root |
| `gen-themes-css.js` | Regenerate `styles/themes.css` from `themes.js` |

---

## 3. Playback modes

```
                ┌──────────────┐
   open file ──►│  Local mode  │──► <video src="http://127.0.0.1/__media/…">
                └──────┬───────┘
                       │ decode error (desktop)
                       ▼
                ┌──────────────┐
                │ Compat path  │──► soft remux → full H.264 → reload URL
                └──────────────┘
                ┌──────────────┐
   YouTube ───►│ YouTube mode │──► IFrame API (controls hidden)
                └──────────────┘
                ┌──────────────┐
   RTSP ──────►│  RTSP mode   │──► FFmpeg bridge → local HTTP → <video>
                └──────────────┘     (+ optional MP4 record)
```

- Only one primary presentation mode is active; entering YouTube hides local video presentation.
- Transport UI (seek, volume, rate, play/stop) is shared and routed to the active backend.
- Spectrum analysis attaches to the local `<video>` audio graph; it is disabled in YouTube mode.
- Spectrum UI is a **separate window** (`spectrum.html`) driven by IPC / BroadcastChannel frame streaming from the player. Title-bar opacity applies only to that window (`spectrumOpacity`).
- Play history is a **separate window** (`history.html`) driven by IPC / BroadcastChannel item sync from the player. Open state persisted as `showHistoryPanel`; title-bar opacity as `historyOpacity`.
- **Video fit** (`settings.videoFit`): `cover` | `contain` | `actual` — CSS classes on `#videoWrap` (`fit-*`); control-bar `#btnFit` menu.
- **Stage rotation**: `0` | `90` | `180` | `270` — `.is-rotated` + `.rot-*` on `#videoWrap`. Two levels: `settings.videoRotation` is the **persisted default** applied on every `loadMedia` of a new source (Settings ▸ Display); the module-level `videoRotation` is the **live** angle for the file playing now, moved by `#btnRotateLeft` / `#btnRotateRight` (and `#btnRotateReset`, which doubles as the angle readout), the stage context menu, and `R` / `Shift+R` — none of which persist. A quarter turn swaps `#media`'s layout box to `--stage-h x --stage-w` (published by a `ResizeObserver` on the stage) so `object-fit` still resolves against the axes the viewer sees. Overlays (subtitles, drop hint, progress) are siblings and stay upright. Disabled in YouTube mode — the iframe is not ours to transform. Compact chrome keeps both turn buttons and hides only the readout.
- **Group minimize / restore**: `desktopAPI.minimize` (toolbar ─ and `Esc` when no overlay) minimizes main + spectrum + history together. Restoring any one window (taskbar / second-instance) restores the whole group (resize-after-minimize check in `lib.rs`).
- **Chrome auto-hide** (`settings.autoHideChrome`): overlay toolbar + bottom chrome hide while playing; edge hover reveals them.
- **Compact mode** (`settings.compactMode`): `#app.is-compact` hides non-essential chrome; keeps **Open**, transport, volume, compact-restore, and window controls. Distinct enter (PIP) / exit (full layout) icons on `#btnCompact`. Desktop saves/restores window bounds via `getBounds` / `setBounds` and lowers `setMinimumSize` while compact. The separate spectrum and history windows stay open across compact toggle.
- **Subtitles**: on `loadMedia` the desktop build lists `clip.srt` / `clip.<lang>.srt` / `.smi` / `.vtt` (`listSubtitles`). With any of them the control bar shows `#subtitleTrackSelect`; the first shown is `settings.subtitleLang` ("auto" = UI language), then the same base language, the plain file, English. A YouTube download saves every uploaded language (or, if none, automatic captions in the preferred language / English / the original) and copies the preferred one to `clip.srt`. YouTube streaming passes `cc_load_policy` / `cc_lang_pref` from the same settings.
- Floating save/open progress (`#progressModal`) is non-modal so the stage stays visible. Opening YouTube/RTSP closes the URL modal first, shows staged progress, and blocks duplicate Play/Connect while in flight.
- Settings / About / theme editor use `dialog.show()` (non-blocking) so Chromium does not mark the page inert and pause media. URL/error dialogs may still use `showModal()`.

---

## 4. Data persistence

| Store | Content |
|-------|---------|
| `<data>/persist.json` | Settings, custom themes, recent list, `dialog.lastOpenDir` / `dialog.lastSaveDir` |
| `<data>/youtube-cookies.txt` | Cookies after a YouTube sign-in (never commit) |
| Web `localStorage` | Same logical keys via `persist.js` |
| Keys (examples) | `myvideoplayer.settings.v1`, custom themes, recent entries |
| Settings fields | locale, theme, rate, seekStep, autoplay, loop, showSpectrum, autoHideChrome, spectrumStyle, showSubtitles, subtitleLang, subSize, startVolume, windowOpacity, spectrumOpacity, historyOpacity, showHistoryPanel, videoFit, videoRotation, compactMode |
| Compat cache | `<data>/compat-cache/` (converted media) |

`<data>` is `%APPDATA%\com.shkwon.myvideoplayer` on Windows (the platform app-data folder elsewhere), or `MYVIDEOPLAYER_CONFIG_DIR` (data + WebView2 profile, for tests). On first start the Electron build's `persist.json` (`%APPDATA%\MyVideoPlayer` or `my-video-player-multios`) is copied in.

---

## 5. Theme system

1. Builtin themes (`dark`, `light`, `ocean`, `forest`) define CSS variables in `themes.css` and JS (`themes.js`).
2. Custom themes store variable maps and a light/dark scheme.
3. `applyThemeToDocument` sets `data-theme`, `data-color-scheme`, and mirrors variables onto `:root`.
4. Stage / video letterbox uses `--bg-stage` so the canvas background follows the theme.
5. `syncThemeToOverlays` copies variables onto dialogs/tooltips. Toolbar **popup/recent/fit menus** intentionally use scheme-locked `--menu-*` colors so labels stay readable over the stage.
6. The window theme (`set_theme`) follows the scheme for native chrome and dialogs (approximate light/dark only).
7. `applyTheme` also sets `data-scheme` on `<html>`. Control-bar buttons are white outlines with no fill (`--ctrl-outline`; the theme's `--text` under `data-scheme="light"`); only Stop is filled with the fixed `--ctrl-stop` red.

---

## 6. Internationalization

- Dictionaries in `i18n.js` (`en`, `ko`).
- Markup uses `data-i18n`, `data-i18n-tooltip`, `data-i18n-aria`, `data-i18n-html`.
- Toolbar locale button shows the **target** language label (`ENG` when UI is Korean, `한글` when English).
- Status bar keeps an i18n **snapshot** (`statusKey` / raw text) and `paintStatusBar()` re-resolves strings on `applyLocale`, so Idle/Playing/Speed/Theme labels switch with the UI language.

---

## 7. Error handling

- `error-dialog.js` shows a themed modal with summary + copyable technical report.
- Wired from media errors, YouTube/RTSP errors, download/record failures, and global `error` / `unhandledrejection` handlers in `app.js`.
- Media decode failures on desktop trigger the compat pipeline before/while showing user-facing errors.

---

## 8. Packaging

### Tauri bundler (`src-tauri/tauri.conf.json`)

| Command | Target | Artifact |
|---------|--------|----------|
| `npm run build:win` | Windows | NSIS x64 → `src-tauri/target/release/bundle/nsis/` (+ `MyVideoPlayer-Setup-{version}.exe` in repo root) |
| `npm run build:mac` | macOS | DMG |
| `npm run build:linux` | Linux | AppImage + deb |
| `npm run build` | Host defaults | All configured targets |

(`dist:*` scripts alias the same `build:*` commands.) `bundle.resources` ships `vendor/yt-dlp/` → `yt-dlp/` and `vendor/ffmpeg/` → `ffmpeg/`. `bundle.fileAssociations` registers the video and audio extensions.

### Icons (`asset/`)

| File | Use |
|------|-----|
| `icon.ico` | Windows app + NSIS installer/uninstaller |
| `icons/*.png` | Bundle icons |
| `icon.png` / `icon-256.png` | Runtime / favicon / toolbar brand |

### NSIS hooks (`src-tauri/windows/hooks.nsh`)

Before installing (not for `/UPDATE`): removes the Electron build's files, uninstall entry, "Open with" ProgIDs and Chromium caches. Its own uninstaller is not run, because it would delete `persist.json`, which this build migrates. Uninstall with "delete app data" also deletes the Electron data folders.

---

## 9. Security notes

- Pages get one app command (`vp`) plus event listening (`capabilities/default.json`); no Node or file APIs in the page
- The server rejects `..` paths, serves only embedded assets, and requires the per-run key for `/__media`, `/__rtsp`, `/__vp`
- CSP in the HTML pages restricts scripts, frames, and media origins (YouTube hosts allowlisted)
- YouTube cookies stay in the data folder; cookie dumps must not be committed (see `.gitignore`)

---

## 10. Extension points

| Goal | Where to start |
|------|----------------|
| New setting | `settings.js` defaults + Settings form in `index.html` + `app.js` apply path |
| New theme token | `THEME_EDIT_KEYS` / `BASE_VARS` in `themes.js` + `themes.css` |
| New hotkey | `bindKeyboard` in `app.js` + i18n tip strings |
| New spectrum style | `SPECTRUM_STYLES` + painter branch in `spectrum.js` + i18n labels |
| New fit mode | `normalizeVideoFit` + CSS `.fit-*` + control-bar menu in `index.html` |
| Rotation step | `normalizeVideoRotation` in `settings.js` + `applyVideoRotation` in `app.js` + CSS `.rot-*` in `main.css` |
| Compact chrome | `setCompactMode` in `app.js` + `.app.is-compact` rules in `main.css` |
| Group minimize | `minimize_all` / `restore_all` in `src-tauri/src/lib.rs` |
| New desktop call | `vp` channel in `lib.rs` + `bridge.js` method + renderer call site |
| Installer UX | `src-tauri/windows/hooks.nsh` + `tauri.conf.json` `bundle.windows.nsis` |
