# MyVideoPlayer — Architecture

This document describes how MyVideoPlayer is structured across desktop (Electron) and web.

---

## 1. Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Electron Main Process                     │
│  electron/main.js · youtube.js · media-compat.js              │
│  · persist-store.js                                           │
│  • BrowserWindow (frameless) + optional spectrum window       │
│  • Local HTTP UI server (127.0.0.1) → serves src/              │
│  • /__media/<token> → Range streaming for local files         │
│  • FFmpeg compat convert (soft remux → H.264)                 │
│  • IPC: dialogs, window drag/opacity, persist, YouTube        │
└───────────────────────────┬─────────────────────────────────┘
                            │ preload (contextBridge)
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              Renderer / Web UI (src/)                         │
│  index.html + ES modules                                      │
│  • app.js orchestrates playback, settings, hotkeys, status    │
│  • <video> for local media · YouTube IFrame API for YT        │
│  • In-player spectrum popup (SpectrumAnalyzer + Painter)      │
└─────────────────────────────────────────────────────────────┘
```

On **web** (`npm run web`), there is no main process. The same `src/` UI runs in the browser with a reduced feature set (no native dialogs, no YouTube save, no FFmpeg compat, no window opacity/chrome).

---

## 2. Processes and boundaries

### 2.1 Main process (`electron/`)

| File | Responsibility |
|------|----------------|
| `main.js` | App lifecycle, window, UI HTTP server, `/__media` Range handler, IPC, subtitle discovery, window drag/opacity, spectrum child window |
| `preload.js` | Exposes a safe `window.desktopAPI` to the renderer |
| `youtube.js` | YouTube URL parse, metadata, download (`yt-dlp` preferred, `youtubei.js` fallback) |
| `media-compat.js` | FFmpeg-based soft remux / full H.264 convert with cache under `userData/compat-cache` |
| `persist-store.js` | Synchronous key/value store in `userData/persist.json` (settings, recent, dialog dirs) |

**Why a local HTTP server?**  
The window loads `http://127.0.0.1:{port}/index.html` instead of `file://` so the YouTube IFrame API accepts the page origin, and so media can be served with proper HTTP Range semantics.

**Why `/__media/<base64url-path>`?**  
Desktop media paths are encoded into same-origin HTTP URLs. The UI server streams bytes with `Accept-Ranges` / `Content-Range`, which is more reliable for `<video>` seeking than a custom protocol alone. (`localmedia://` may still exist as a fallback path in older code paths.)

**Window drag**  
Frameless chrome does **not** use `-webkit-app-region: drag` on the toolbar (it breaks button clicks on Windows). Drag is implemented via IPC (`beginWindowDrag` / move / end) on the brand + spacer regions.

### 2.2 Preload API (`window.desktopAPI`) — selected surface

| API | Purpose |
|-----|---------|
| `isElectron` | Feature detection in renderer |
| `getAppInfo` | Name, version, platform |
| `minimize` / `maximizeToggle` / `close` / `isMaximized` / `onWindowState` | Window chrome |
| `beginWindowDrag` / `updateWindowDrag` / `endWindowDrag` | Frameless move |
| `setWindowOpacity` | Desktop opacity |
| `openMedia` / `openMediaPath` / `openSubtitle` / `findSubtitle` | File dialogs & path helpers (remember last dirs) |
| `makeMediaCompatible` / `onMediaCompatProgress` | FFmpeg compat pipeline |
| `getPathForFile` | Resolve dropped `File` → filesystem path |
| `persistGetItem` / `persistSetItem` / `persistRemoveItem` | Sync persist bridge |
| `parseYouTube` / `getYouTubeInfo` / `downloadYouTube` / `onYouTubeDownloadProgress` | YouTube desktop pipeline |
| `openSpectrumWindow` / `sendSpectrumMessage` / … | Optional separate spectrum window |

### 2.3 Renderer (`src/`)

Pure static UI: no bundler. Modules are loaded as native ES modules.

| Module | Role |
|--------|------|
| `js/app.js` | Application controller: modes, UI wiring, hotkeys, DnD, status snapshot + locale refresh |
| `js/settings.js` | Settings defaults + load/save via persist layer |
| `js/persist.js` | `localStorage` (web) or `desktopAPI.persist*` (Electron) |
| `js/themes.js` | Builtin + custom themes, CSS variables, overlay sync; toolbar menus use scheme-locked contrast |
| `js/i18n.js` | English / Korean dictionaries + `applyI18n` |
| `js/hotkeys.js` | Editable-target / modal helpers for shortcut gating |
| `js/recent.js` | Recent list (max 10) |
| `js/spectrum.js` | `SpectrumAnalyzer` (Web Audio) + `SpectrumPainter` (styles) |
| `js/spectrum-bridge.js` / `spectrum-window-app.js` / `spectrum.html` | Optional separate spectrum window |
| `js/subtitles.js` | SMI/SRT/VTT parse + overlay renderer |
| `js/youtube-player.js` | YouTube ID helpers + IFrame player controller |
| `js/error-dialog.js` | Detailed error modal with copy |
| `js/tooltip.js` | Floating tooltips (`data-i18n-tooltip`) |
| `styles/main.css` | Layout & components |
| `styles/themes.css` | Builtin theme tokens (`--bg-stage`, etc.) |

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
```

- Only one mode is active; entering YouTube hides local video presentation.
- Transport UI (seek, volume, rate, play/stop) is shared and routed to the active backend.
- Spectrum analysis attaches to the local `<video>` audio graph; it is disabled in YouTube mode.
- Spectrum UI is an in-player draggable popup (`#spectrumPopup`), not a side panel.

---

## 4. Data persistence

| Store | Content |
|-------|---------|
| Electron `userData/persist.json` | Settings, custom themes, recent list, `dialog.lastOpenDir` / `dialog.lastSaveDir` |
| Web `localStorage` | Same logical keys via `persist.js` |
| Keys (examples) | `myvideoplayer.settings.v1`, custom themes, recent entries |
| Settings fields | locale, theme, rate, seekStep, autoplay, loop, showSpectrum, spectrumStyle, showSubtitles, subSize, startVolume, windowOpacity |
| Compat cache | `userData/compat-cache/` (converted media; not in git) |

Settings live per-profile (browser / Electron userData), not inside the install directory.

---

## 5. Theme system

1. Builtin themes (`dark`, `light`, `ocean`, `forest`) define CSS variables in `themes.css` and JS (`themes.js`).
2. Custom themes store variable maps and a light/dark scheme.
3. `applyThemeToDocument` sets `data-theme`, `data-color-scheme`, and mirrors variables onto `:root`.
4. Stage / video letterbox uses `--bg-stage` so the canvas background follows the theme.
5. `syncThemeToOverlays` copies variables onto dialogs/tooltips. Toolbar **popup/recent menus** intentionally use scheme-locked `--menu-*` colors so labels stay readable over the stage.
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
- Wired from media errors, YouTube errors, download failures, and global `error` / `unhandledrejection` handlers in `app.js`.
- Media decode failures on desktop trigger the compat pipeline before/while showing user-facing errors.

---

## 8. Packaging

### electron-builder (`package.json` → `build`)

| Command | Target | Artifact |
|---------|--------|----------|
| `npm run build:win` | Windows | NSIS x64 → `dist/MyVideoPlayer-Setup-{version}.exe` |
| `npm run build:mac` | macOS | DMG + zip |
| `npm run build:linux` | Linux | AppImage + deb |
| `npm run build` | Host defaults | Per `package.json` `build` targets |

(`dist:*` scripts alias the same `build:*` commands.)

`ffmpeg-static` is unpacked from asar (`asarUnpack`) so the main process can spawn FFmpeg for compat conversion.

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

---

## 10. Extension points

| Goal | Where to start |
|------|----------------|
| New setting | `settings.js` defaults + Settings form in `index.html` + `app.js` apply path |
| New theme token | `THEME_EDIT_KEYS` / `BASE_VARS` in `themes.js` + `themes.css` |
| New hotkey | `bindKeyboard` in `app.js` + i18n tip strings |
| New spectrum style | `SPECTRUM_STYLES` + painter branch in `spectrum.js` + i18n labels |
| New IPC | `main.js` handler + `preload.js` + renderer call site |
| Installer UX | `build/installer.nsh` + `package.json` `build.nsis` |
