# MyVideoPhone — Architecture

How MyVideoPhone (LAN IP video phone + optional RTSP helper) is structured across Electron desktop and the reduced web UI.

---

## 1. Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Electron Main Process                     │
│  electron/main.js · phone-stream.js · rtsp-stream.js          │
│  · media-compat.js · persist-store.js                         │
│  • BrowserWindow (frameless, not fullscreenable)              │
│  • UI HTTP server (127.0.0.1, ephemeral port) → src/           │
│  • /__media/<token> → Range streaming for local files         │
│  • /__rtsp/<id> → FFmpeg RTSP → fMP4 bridge                   │
│  • /__phone/live → same-origin proxy to peer/local /live      │
│  • Phone LAN server (0.0.0.0:8765) — /ring, /live, /status    │
│  • Tray, notifications, clipboard IPC, window drag/opacity    │
└───────────────────────────┬─────────────────────────────────┘
                            │ preload (contextBridge)
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              Renderer / Web UI (src/)                         │
│  index.html + ES modules                                      │
│  • app.js — connect/hangup, mic, PIP, hotkeys, status         │
│  • <video> for peer stream / RTSP / local media               │
│  • Incoming-call dialog · connect dialog · error report       │
└─────────────────────────────────────────────────────────────┘
```

On **web** (`npm run web`) there is no main process: no LAN phone, RTSP, tray, or native chrome.

---

## 2. Processes and boundaries

### 2.1 Main process (`electron/`)

| File | Responsibility |
|------|----------------|
| `main.js` | Lifecycle, window, UI HTTP server (`/__media`, `/__rtsp`, `/__phone/live`), IPC, tray, permissions, clipboard |
| `preload.js` | Safe `window.desktopAPI` surface |
| `phone-stream.js` | LAN phone HTTP: publish camera via FFmpeg, `/ring` hold-until-accept, token-gated `/live` |
| `rtsp-stream.js` | RTSP/RTSPS → local HTTP fMP4; optional MP4 record |
| `media-compat.js` | FFmpeg soft remux / H.264 convert + `userData/compat-cache` |
| `persist-store.js` | Sync key/value in `userData/persist.json` |

**Two HTTP ports**

| Server | Bind | Role |
|--------|------|------|
| UI server | `127.0.0.1:0` (ephemeral) | Serves `src/`, media/RTSP/phone **proxies** for `<video>` |
| Phone server | `0.0.0.0:8765` (fallback +1…) | Peer dialable `/ring` + `/live` |

**Why `/__phone/live` proxy?**  
The renderer loads from `http://127.0.0.1:{uiPort}`. Playing `http://localhost:8765/live` triggers Chromium “Media load rejected by URL safety check”. The UI server proxies allowed loopback/LAN targets so `<video>` stays same-origin.

**Window drag**  
No `-webkit-app-region: drag` on the toolbar (breaks clicks on Windows). Empty toolbar chrome uses IPC `beginWindowDrag` / `updateWindowDrag` / `endWindowDrag`.

**Tray**  
Caption close / Alt+F4 → hide to tray; publish + webcam stopped via `window:visibility`. Quit only from tray menu / `quitApp`.

**Logging**  
Unless `MyVideoPhone_VERBOSE=1`, Chromium logging is quieted and known ffmpeg noise is filtered.

### 2.2 Preload API (`window.desktopAPI`) — selected surface

| API | Purpose |
|-----|---------|
| `isElectron` / `getAppInfo` | Feature detection; includes `phonePort`, `peerHints`, `phoneLiveUrl`, `uiPort` |
| `minimize` / `maximizeToggle` / `close` / `showWindow` / `quitApp` | Window / tray |
| `beginWindowDrag` / `updateWindowDrag` / `endWindowDrag` | Frameless move |
| `setWindowOpacity` / `setMinimumSize` / `onWindowState` / `onWindowVisibility` | Chrome + tray restore |
| `copyText` | System clipboard (error dialog Copy) |
| `notify` | Desktop notification |
| `setPhonePublish` / `getPhoneInfo` / `phoneRing` / `phoneRespond` / `phoneClearSessions` / `onIncomingCall` | IP call signaling |
| `openRtsp` / `stopRtsp` / `startRtspRecord` / `stopRtspRecord` / … | RTSP view + record |
| `openMedia` / `openMediaPath` / `makeMediaCompatible` / `getPathForFile` | Local media helper |
| `persistGetItem` / `persistSetItem` / `persistRemoveItem` | Sync persist |

### 2.3 Renderer (`src/`)

No bundler — native ES modules.

| Module | Role |
|--------|------|
| `js/app.js` | Call flow, mic/camera, UI chrome, hotkeys, DnD, status |
| `js/settings.js` | Defaults + load/save (`locale`, `theme`, `videoFit`, `showLocalPreview`, …) |
| `js/persist.js` | `localStorage` (web) or `desktopAPI.persist*` |
| `js/themes.js` | Builtin + custom themes, overlay sync |
| `js/i18n.js` | `en` / `ko` dictionaries + `applyI18n` |
| `js/hotkeys.js` | Editable/modal gating helpers |
| `js/error-dialog.js` | Error modal + copy report |
| `js/tooltip.js` | Floating tooltips |
| `styles/main.css` / `styles/themes.css` | Layout & theme tokens |

### 2.4 Scripts (`scripts/`)

| Script | Role |
|--------|------|
| `generate-icons.js` | `asset/icon.svg` → ico/png/favicon (`npm run icons`) |
| `build-win.js` / `prepare-win-build.js` / `after-pack-win.js` / `win-rcedit.js` / … | Windows packaging |
| `copy-installer-to-root.js` | Copy installer to repo root |

---

## 3. Call flow (IP phone)

```
Caller                              Callee
  │                                    │
  │  POST /ring  { from, app }         │
  │───────────────────────────────────►│  UI: Accept / Reject (held ~45s)
  │                                    │
  │  JSON { accepted, token, … }       │
  │◄───────────────────────────────────│
  │                                    │
  │  GET /live?token=…  (via UI proxy) │
  │───────────────────────────────────►│  FFmpeg → MPEG-TS/MP4 stream
  │                                    │
  │  (callee may pull caller /live     │
  │   using callback allow-list)       │
```

- Remote `/live` requires accept **token** (or active callback allow-list while dialing).
- Loopback always allowed (local PIP / self-test).
- Large control button: idle → connect dialog; live/connecting → `hangUpCall`.
- Toolbar holds mic + local camera only (connect/hangup removed from toolbar).

### Playback modes (secondary)

```
  IP phone ──► peer /live (proxied) → <video>
  RTSP ──────► FFmpeg bridge /__rtsp/<id> → <video>  (+ optional record)
  Local file ► /__media/<token> → <video>  (+ compat convert on decode fail)
```

---

## 4. Data persistence

| Store | Content |
|-------|---------|
| Electron `userData/persist.json` | Settings, custom themes, dialog dirs |
| Web `localStorage` | Same logical keys via `persist.js` |
| Settings (examples) | `locale`, `theme`, `videoFit`, `showLocalPreview`, `windowOpacity`, `autoplay`, `startVolume`, … |
| Compat cache | `userData/compat-cache/` (not in git) |

Multi-instance test (`npm run start:multi` / `--multi`): separate `userData-pid-{pid}` so caches do not collide.

---

## 5. Theme & i18n

- Builtin themes: Dark, Light, Ocean, Forest + custom editor.
- Stage uses `--bg-stage`; dialogs get `syncThemeToOverlays`.
- Dictionaries in `i18n.js` (`en`, `ko`); markup uses `data-i18n*` attributes.
- Locale toolbar label shows the **target** language (`ENG` / `한글`).

---

## 6. Error handling

- `error-dialog.js` builds a copyable report (summary, detail, context, env).
- Desktop Copy uses `desktopAPI.copyText` → Electron `clipboard` (avoids Chromium permission denial inside modals).
- Media / phone / RTSP failures surface through `showAppError`.

---

## 7. Packaging

| Command | Target | Artifact |
|---------|--------|----------|
| `npm run build:win` | Windows | NSIS x64 → `MyVideoPhone-Setup-{version}.exe` |
| `npm run build:mac` | macOS | DMG + zip (`asset/icon-1024.png`) |
| `npm run build:linux` | Linux | AppImage + deb (`asset/icons/`) |
| `npm run icons` | — | Regenerate icon set from `asset/icon.svg` |

`ffmpeg-static` is `asarUnpack`’d for spawn.

### Icons (`asset/`)

| File | Use |
|------|-----|
| `icon.svg` | Source artwork |
| `icon.ico` | Windows app, tray, NSIS installer/uninstaller |
| `icon-1024.png` | macOS |
| `icons/*.png` | Linux |
| `icon.png` / `icon-256.png` / `src/favicon.png` | Runtime / toolbar brand |

### NSIS (`build/installer.nsh`)

Clean reinstall: close app → remove previous install → wipe app data → install (unless `--updated` upgrade path).

---

## 8. Security notes

- `contextIsolation: true`, `nodeIntegration: false`
- Fixed preload IPC surface
- UI server: no path traversal outside `src/`; `/__media` tokens map to real files
- `/__phone/live` proxy: loopback + private IPv4 only (SSRF guard)
- Phone `/live`: token or callback allow-list for non-loopback clients
- CSP in `index.html` restricts script/connect/media origins

---

## 9. Extension points

| Goal | Where to start |
|------|----------------|
| Phone port / ring timeout | `phone-stream.js` constants |
| Connect UI / hangup UX | `app.js` (`onControlCallClick`, `playPhoneFromInput`) |
| New setting | `settings.js` + Settings form in `index.html` |
| New IPC | `main.js` + `preload.js` + renderer |
| Icons | Edit `asset/icon.svg` → `npm run icons` |
| Installer UX | `build/installer.nsh` + `package.json` `build.nsis` |
