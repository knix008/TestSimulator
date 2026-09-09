# MyVideoPlayer — Architecture

This document describes how MyVideoPlayer is structured across desktop (Electron) and web.

---

## 1. Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Electron Main Process                     │
│  electron/main.js · youtube.js · youtube-auth.js              │
│  · rtsp-stream.js · media-compat.js · persist-store.js        │
│  • BrowserWindow (frameless) + spectrum / history windows     │
│  • Esc / caption minimize → group-minimize all app windows    │
│  • Local HTTP UI server (127.0.0.1) → serves src/              │
│  • /__media/<token> → Range streaming for local files         │
│  • FFmpeg compat convert (soft remux → H.264)                 │
│  • Bundled yt-dlp (vendor/ → extraResources)                  │
│  • IPC: dialogs, window drag/opacity/bounds, persist, YT, RTSP │
│  • Quiet Chromium logs by default (MYVIDEOPLAYER_VERBOSE)     │
└───────────────────────────┬─────────────────────────────────┘
                            │ preload (contextBridge)
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

On **web** (`npm run web`), there is no main process. The same `src/` UI runs in the browser with a reduced feature set (no native dialogs, no YouTube/RTSP save, no FFmpeg compat, no window opacity/chrome).

---

## 2. Processes and boundaries

### 2.1 Main process (`electron/`)

| File | Responsibility |
|------|----------------|
| `main.js` | App lifecycle, windows, UI HTTP server, `/__media` Range handler, IPC, subtitle discovery, window drag/opacity/bounds, spectrum/history child windows, **group minimize/restore** (`Esc`), Chromium log quieting |
| `preload.js` | Exposes a safe `window.desktopAPI` to the renderer |
| `youtube.js` | YouTube URL parse, metadata, download (bundled/system `yt-dlp` preferred, `youtubei.js` fallback) |
| `youtube-auth.js` | Optional Electron sign-in session → cookies file for restricted downloads |
| `rtsp-stream.js` | RTSP/RTSPS open via FFmpeg → local HTTP media; MP4 record / stop / finalize |
| `media-compat.js` | FFmpeg-based soft remux / full H.264 convert with cache under `userData/compat-cache` |
| `persist-store.js` | Synchronous key/value store in `userData/persist.json` (settings, recent, dialog dirs) |

**Why a local HTTP server?**  
The window loads `http://127.0.0.1:{port}/index.html` instead of `file://` so the YouTube IFrame API accepts the page origin, and so media can be served with proper HTTP Range semantics.

**Why `/__media/<base64url-path>`?**  
Desktop media paths are encoded into same-origin HTTP URLs. The UI server streams bytes with `Accept-Ranges` / `Content-Range`, which is more reliable for `<video>` seeking than a custom protocol alone. (`localmedia://` may still exist as a fallback path.)

**Bundled yt-dlp**  
`scripts/ensure-yt-dlp.js` downloads a platform binary into `vendor/yt-dlp/` on `postinstall` / `npm start`. Installers copy it via `extraResources` (`resources/yt-dlp`). Binaries are gitignored.

**Window drag**  
Frameless chrome does **not** use `-webkit-app-region: drag` on the toolbar (it breaks button clicks on Windows). Drag is implemented via IPC (`beginWindowDrag` / move / end) on the brand + spacer regions.

**Logging**  
Unless `MYVIDEOPLAYER_VERBOSE=1`, main process sets Chromium `disable-logging` / `log-level=3` and filters known benign stderr noise (e.g. `Unsupported pixel format: -1`).

### 2.2 Preload API (`window.desktopAPI`) — selected surface

| API | Purpose |
|-----|---------|
| `isElectron` | Feature detection in renderer |
| `getAppInfo` | Name, version, platform |
| `minimize` / `maximizeToggle` / `close` / `isMaximized` / `onWindowState` | Window chrome (`minimize` group-minimizes main + spectrum + history) |
| `setMinimumSize` / `getBounds` / `setBounds` | Min size + bounds (compact mode shrink/restore; sender window) |
| `beginWindowDrag` / `updateWindowDrag` / `endWindowDrag` | Frameless move |
| `setWindowOpacity` / `getWindowOpacity` | Per-window opacity (sender BrowserWindow) |
| `openMedia` / `openMediaPath` / `openSubtitle` / `findSubtitle` | File dialogs & path helpers (remember last dirs) |
| `makeMediaCompatible` / `onMediaCompatProgress` | FFmpeg compat pipeline |
| `getPathForFile` | Resolve dropped `File` → filesystem path |
| `persistGetItem` / `persistSetItem` / `persistRemoveItem` | Sync persist bridge |
| `parseYouTube` / `getYouTubeInfo` / `downloadYouTube` / `stopYouTubeDownload` / `onYouTubeDownloadProgress` | YouTube desktop pipeline |
| `openRtsp` / `stopRtsp` / `startRtspRecord` / `stopRtspRecord` / `onRtspRecordProgress` / … | RTSP view + record |
| `openSpectrumWindow` / `sendSpectrumMessage` / … | Optional separate spectrum window |
| `openHistoryWindow` / `sendHistoryMessage` / … | Optional separate play-history window |

### 2.3 Renderer (`src/`)

Pure static UI: no bundler. Modules are loaded as native ES modules.

| Module | Role |
|--------|------|
| `js/app.js` | Application controller: modes, fit/history/compact UI, hotkeys, DnD, status snapshot + locale refresh |
| `js/settings.js` | Settings defaults + load/save via persist layer (`videoFit`, `videoRotation`, `showHistoryPanel`, `compactMode`, …) |
| `js/persist.js` | `localStorage` (web) or `desktopAPI.persist*` (Electron) |
| `js/themes.js` | Builtin + custom themes, CSS variables, overlay sync; toolbar menus use scheme-locked contrast |
| `js/i18n.js` | English / Korean dictionaries + `applyI18n` |
| `js/hotkeys.js` | Editable-target / modal helpers for shortcut gating |
| `js/recent.js` | Recent / history list (max 30; file / youtube / rtsp) |
| `js/spectrum.js` | `SpectrumAnalyzer` (Web Audio) + `SpectrumPainter` (styles) |
| `js/spectrum-bridge.js` / `spectrum-window-app.js` / `spectrum.html` | Separate spectrum BrowserWindow (or web popup) |
| `js/history-bridge.js` / `history-window-app.js` / `history.html` | Separate play-history BrowserWindow (or web popup) |
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
| `ensure-yt-dlp.js` | Fetch/skip bundled yt-dlp into `vendor/yt-dlp/` |
| `build-win.js` / `prepare-win-build.js` / `after-pack-win.js` / … | Windows packaging helpers |
| `copy-installer-to-root.js` | Copy built installer to repo root |

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
- **Group minimize / restore**: `desktopAPI.minimize` (toolbar ─ and `Esc` when no overlay) minimizes main + spectrum + history together. Restoring any one window (taskbar / second-instance) restores the whole group via `restore` listeners in `main.js`.
- **Chrome auto-hide** (`settings.autoHideChrome`): overlay toolbar + bottom chrome hide while playing; edge hover reveals them.
- **Compact mode** (`settings.compactMode`): `#app.is-compact` hides non-essential chrome; keeps **Open**, transport, volume, compact-restore, and window controls. Distinct enter (PIP) / exit (full layout) icons on `#btnCompact`. Desktop saves/restores window bounds via `getBounds` / `setBounds` and lowers `setMinimumSize` while compact. The separate spectrum and history windows stay open across compact toggle.
- Floating save/open progress (`#progressModal`) is non-modal so the stage stays visible. Opening YouTube/RTSP closes the URL modal first, shows staged progress, and blocks duplicate Play/Connect while in flight.
- Settings / About / theme editor use `dialog.show()` (non-blocking) so Chromium does not mark the page inert and pause media. URL/error dialogs may still use `showModal()`.

---

## 4. Data persistence

| Store | Content |
|-------|---------|
| Electron `userData/persist.json` | Settings, custom themes, recent list, `dialog.lastOpenDir` / `dialog.lastSaveDir` |
| Web `localStorage` | Same logical keys via `persist.js` |
| Keys (examples) | `myvideoplayer.settings.v1`, custom themes, recent entries |
| Settings fields | locale, theme, rate, seekStep, autoplay, loop, showSpectrum, autoHideChrome, spectrumStyle, showSubtitles, subSize, startVolume, windowOpacity, spectrumOpacity, historyOpacity, showHistoryPanel, videoFit, videoRotation, compactMode |
| Compat cache | `userData/compat-cache/` (converted media; not in git) |

Settings live per-profile (browser / Electron userData), not inside the install directory.

---

## 5. Theme system

1. Builtin themes (`dark`, `light`, `ocean`, `forest`) define CSS variables in `themes.css` and JS (`themes.js`).
2. Custom themes store variable maps and a light/dark scheme.
3. `applyThemeToDocument` sets `data-theme`, `data-color-scheme`, and mirrors variables onto `:root`.
4. Stage / video letterbox uses `--bg-stage` so the canvas background follows the theme.
5. `syncThemeToOverlays` copies variables onto dialogs/tooltips. Toolbar **popup/recent/fit menus** intentionally use scheme-locked `--menu-*` colors so labels stay readable over the stage.
6. Electron `nativeTheme.themeSource` follows the scheme for native dialogs (approximate light/dark only).

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

### electron-builder (`package.json` → `build`)

| Command | Target | Artifact |
|---------|--------|----------|
| `npm run build:win` | Windows | NSIS x64 → `dist/MyVideoPlayer-Setup-{version}.exe` (+ copy to repo root) |
| `npm run build:mac` | macOS | DMG + zip |
| `npm run build:linux` | Linux | AppImage + deb |
| `npm run build` | Host defaults | Per `package.json` `build` targets |

(`dist:*` scripts alias the same `build:*` commands.)

`ffmpeg-static` is unpacked from asar (`asarUnpack`) so the main process can spawn FFmpeg for compat conversion and RTSP.

Bundled `yt-dlp` is included via `extraResources` from `vendor/yt-dlp/`.

### Icons (`asset/`)

| File | Use |
|------|-----|
| `icon.ico` | Windows app + NSIS installer/uninstaller |
| `icon-1024.png` | macOS |
| `icons/*.png` | Linux |
| `icon.png` / `icon-256.png` | Runtime / favicon / toolbar brand |

### NSIS custom script (`build/installer.nsh`)

On a normal Setup run (not an in-app `--updated` upgrade):

1. Close a running instance  
2. Uninstall previous per-user and per-machine installs  
3. Remove leftovers (folder, shortcuts, registry)  
4. Wipe app data under `%APPDATA%` / `%LOCALAPPDATA%`  
5. Install the new version  

This keeps reinstalls clean while preserving auto-update behavior when `--updated` is passed.

---

## 9. Security notes

- `contextIsolation: true`, `nodeIntegration: false`
- Preload exposes a fixed IPC surface only
- UI server rejects path traversal outside `src/` and validates `/__media` tokens to real files
- CSP in `index.html` restricts scripts, frames, and media origins (YouTube hosts allowlisted)
- Cookie / auth material for YouTube stays under Electron userData; cookie dumps must not be committed (see `.gitignore`)

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
| Group minimize | `minimizeAllAppWindows` / `restoreAllAppWindows` in `main.js` |
| New IPC | `main.js` handler + `preload.js` + renderer call site |
| Installer UX | `build/installer.nsh` + `package.json` `build.nsis` |
