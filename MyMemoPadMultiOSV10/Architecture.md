# MyMemoPad — Architecture

How MyMemoPad (sticky memo pad + list + settings) is structured across Electron desktop and the reduced web UI.

---

## 1. Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Electron Main Process                     │
│  electron/main.js · store.js                                  │
│  • Multiple frameless BrowserWindows (pads + one list)        │
│  • Tray, login auto-start, single-instance lock               │
│  • memos.json / editor_settings.json / memo_settings.json     │
└───────────────────────────┬─────────────────────────────────┘
                            │ preload (contextBridge)
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              Renderer / Web UI (src/)                         │
│  index.html + ES modules                                      │
│  • pad — contenteditable editor + toolbar                     │
│  • list — memo cards                                          │
│  • settings / confirm / error dialogs                         │
└─────────────────────────────────────────────────────────────┘
```

On **web** (`npm run web`) there is no main process: no tray, auto-start, or native chrome. Data lives in `localStorage`.

---

## 2. Processes and boundaries

### 2.1 Main process (`electron/`)

| File | Responsibility |
|------|----------------|
| `main.js` | Lifecycle, pad/list windows, tray, auto-start, IPC, file dialog |
| `preload.js` | Safe `window.desktopAPI` surface |
| `store.js` | JSON files under Electron `userData` |

**Windows**

| Window | Role |
|--------|------|
| Host pad | First pad. Caption close **hides** it (app stays in the tray). |
| Extra pads | Additional memos. Close destroys the window after auto-save. |
| List | Card list. Close only closes this window. |

**Tray**  
Caption **X** / host close → hide; **Exit** only from the tray menu (`메모 목록 열기` / `종료`).  
`--autostart` (login item) creates the host pad hidden.

**Auto-start**  
`app.setLoginItemSettings({ openAtLogin, openAsHidden, args: ['--autostart'] })`  
Windows Run key / macOS Login Items / Linux XDG autostart.

**Single instance**  
`requestSingleInstanceLock` (packaged builds never allow a second process). A second shortcut/launch focuses the existing host pad. `--list` / `--new` / `--open-index` / `--open-file` are forwarded to that process. `--autostart` on a running instance is ignored. `--multi` / `MyMemoPad_MULTI=1` work only when unpackaged. Windows login uses a single HKCU Run value `MyMemoPad`.

**Window drag**  
No `-webkit-app-region: drag` on the toolbar (breaks clicks on Windows). Empty toolbar chrome uses IPC `beginWindowDrag` / `updateWindowDrag` / `endWindowDrag`.

### 2.2 Preload API (`window.desktopAPI`)

| API | Purpose |
|-----|---------|
| `isElectron` / `getAppInfo` | Feature detection |
| `close` / `minimize` / `quitApp` | Window / tray |
| `beginWindowDrag` / `updateWindowDrag` / `endWindowDrag` | Frameless move |
| `setWindowOpacity` | 0.15–1.0 (transparency slider) |
| `getAutoStart` / `setAutoStart` | Login item |
| `getMemos` / `saveMemos` / `getSettings` / `saveSettings` | Store |
| `getLook` / `setLook` / `removeLook` | Per-memo font/color/opacity |
| `openNewMemo` / `openMemoIndex` / `openTextFile` / `showList` | Window orchestration |
| `onPadLoad` / `onMemosChanged` / `onSettingsChanged` / `onPreviewColor` | Live updates |

### 2.3 Renderer (`src/`)

| File | Role |
|------|------|
| `js/app.js` | Role routing (`pad` / `list` / `web`), store wiring |
| `js/pad.js` | Editor, auto-save, delete, shortcuts |
| `js/list.js` | Cards, keyboard, import |
| `js/settings.js` | Font, style, palette, opacity, language, auto-start |
| `js/shared.js` | Defaults, HTML/RTF helpers, save/delete rules |
| `js/persist.js` | `localStorage` for web |
| `js/i18n.js` | ko / en |
| `js/dialogs.js` | Alert / confirm / error report |
| `js/tooltip.js` | Custom tooltips |

`index.html?role=pad` and `?role=list` are the same document. Web mode switches `#view-list` / `#view-pad` in one page.

---

## 3. Data

Stored under Electron `userData` (web: `localStorage` keys `mymemopad.*`).

| File | Contents |
|------|----------|
| `memos.json` | Array of HTML strings (WinForms RTF is imported as plain text) |
| `editor_settings.json` | Global font, colors, language, default transparency |
| `memo_settings.json` | Per-index look (font, colors, transparency) |

Language and auto-start are global. Look (font/color/opacity) is per memo once saved.

Default pad color is `#F8E18C` (MemoPadV10 yellow).

---

## 4. Packaging

`electron-builder` via `npm run build:*`.

| Platform | Artifact |
|----------|----------|
| Windows | NSIS `MyMemoPad-Setup-{version}.exe` (unsigned). A previous install is fully removed (files, shortcuts, registry, app data) before the new copy is written. |
| macOS | DMG + zip |
| Linux | AppImage + deb |

Icons are generated from `asset/icon.svg` (`npm run icons`, also a `prebuild*` hook). Windows builds apply `asset/icon.ico` to `MyMemoPad.exe` in an `afterPack` rcedit step (`signAndEditExecutable` is off to avoid flaky in-place edits).
