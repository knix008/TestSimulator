# MyMemoPad — Architecture

How MyMemoPad (sticky memo pad + list + settings) is structured across the Tauri desktop app and the reduced web UI.

---

## 1. Overview

```
┌─────────────────────────────────────────────────────────────┐
│                  Tauri host (Rust, src-tauri/)                │
│  lib.rs · store.rs · native.rs                                │
│  • Frameless webview windows (pads + one list + settings)     │
│  • Tray with icon menu, login auto-start, single instance     │
│  • memos.json / editor_settings.json / memo_settings.json     │
└───────────────────────────┬─────────────────────────────────┘
                            │ commands + events (src/js/bridge.js)
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              Renderer / Web UI (src/)                         │
│  index.html + ES modules                                      │
│  • pad — contenteditable editor + toolbar                     │
│  • list — memo cards                                          │
│  • settings / confirm / error dialogs, context menus          │
└─────────────────────────────────────────────────────────────┘
```

The renderer is unchanged from the Electron build: `bridge.js` exposes the same `window.desktopAPI` the Electron preload did, backed by Tauri commands.

On **web** (`npm run web`) there is no host: no tray, auto-start, or native chrome. Data lives in `localStorage`.

**Runtime requirements:** the installed app is one native executable with the UI embedded. No Node.js or Rust is needed to run it. Windows uses the WebView2 runtime (part of Windows 10/11; the installer downloads it if missing), macOS WKWebView, Linux WebKitGTK (a dependency of the .deb; bundled in the AppImage).

---

## 2. Processes and boundaries

### 2.1 Host (`src-tauri/`)

| File | Responsibility |
|------|----------------|
| `src/lib.rs` | Lifecycle, pad/list/settings windows, tray menu, auto-start, single instance, commands, file dialog |
| `src/store.rs` | JSON files in the data folder (port of the Electron `store.js`; unit-tested) |
| `src/native.rs` | Window opacity (Win32 layered window / `NSWindow.alphaValue` / GTK opacity), taskbar icon, legacy Run-key cleanup |
| `tauri.conf.json` | Bundle, icons, NSIS options (language selector, hooks) |
| `capabilities/default.json` | Windows `pad-*`, `list`, `settings`; only event listening is opened — everything else is MyMemoPad's own commands |
| `windows/hooks.nsh` | Installer pages and clean-up (§4) |
| `icons/menu/*.png` | Tray menu icons, rasterised from `src/icons/*.svg` |

**Windows**

| Window | Label | Role |
|--------|-------|------|
| Host pad | `pad-1` (first) | Caption close **hides** it (app stays in the tray). |
| Extra pads | `pad-N` | Additional memos. Close destroys the window after auto-save. |
| List | `list` | Card list. Close only closes this window. |
| Settings | `settings` | Owned by the pad/list that opened it; height fits its content. |

Windows are created hidden; the page calls `windowReady` when it has booted, and the host then sends its first payload (`pad:load` etc.) and shows it. Events posted before a page listens are queued and handed over by `bridge_listen`, so nothing sent early is lost.

**Tray**
Caption **X** / host close → hide; **Exit** only from the tray menu. The tray menu has colourful icons: *Open memo list*, *New memo*, *Start with the system: On/Off*, *Exit*. Left click opens the list (macOS: click opens the menu).
`--autostart` (login item) creates the host pad hidden.

**Auto-start**
`tauri-plugin-autostart` (`--autostart` argument): Windows HKCU Run value `MyMemoPad`, macOS LaunchAgent, Linux XDG autostart. Release builds re-point an existing entry at the running executable on start and remove the Electron build's Run values (`com.shkwon.mymemopad`, `electron.app.*`, …).

**Single instance**
`tauri-plugin-single-instance`. A second launch focuses the existing host pad. `--list` / `--new` / `--open-index N` / `--open-file PATH` are forwarded to that process (and honoured on a first launch too). `--autostart` on a running instance is ignored. `--multi` / `MYMEMOPAD_MULTI=1` work only in debug builds and use a per-process data folder.

**Window drag**
The empty toolbar area (`data-drag`) calls `window_start_drag` on pointer-down; the OS moves the window (Aero snap included). Edge resizing of the frameless windows is Tauri's own.

**Quit**
`app.exit()` closes windows without close events, so every pad's last reported text is saved first.

### 2.2 Bridge API (`window.desktopAPI`, `src/js/bridge.js`)

| API | Purpose |
|-----|---------|
| `isDesktop` / `getAppInfo` / `windowReady` | Feature detection, boot hand-shake |
| `close` / `minimize` / `quitApp` | Window / tray |
| `beginWindowDrag` | Frameless move |
| `setWindowOpacity` | 0.15–1.0 (transparency slider) |
| `getAutoStart` / `setAutoStart` | Login item |
| `copyText` / `readText` | Clipboard (context menu paste without a permission prompt) |
| `getMemos` / `saveMemos` / `getSettings` / `saveSettings` | Store |
| `getLook` / `setLook` / `removeLook` | Per-memo font/color/opacity |
| `openNewMemo` / `openMemoIndex` / `openTextFile` / `showList` | Window orchestration |
| `openSettings` / `sendSettingsCommand` / `onSettingsLoad` / `onSettingsCommand` | Settings session |
| `onPadLoad` / `onMemosChanged` / `onSettingsChanged` / `onPreviewColor` / `onLanguageChanged` | Live updates |

### 2.3 Renderer (`src/`)

| File | Role |
|------|------|
| `js/bridge.js` | `window.desktopAPI` over Tauri (absent on the web) |
| `js/app.js` | Role routing (`pad` / `list` / `settings` / `web`), store wiring, context-menu contents |
| `js/pad.js` | Editor, auto-save, delete, shortcuts |
| `js/list.js` | Cards, keyboard, import |
| `js/settings.js` | Font, style, palette, opacity, language, auto-start |
| `js/contextmenu.js` | In-page right-click menus with icons (replaces the webview's own menu) |
| `js/shared.js` | Defaults, HTML/RTF helpers, save/delete rules |
| `js/persist.js` | `localStorage` for web |
| `js/i18n.js` | ko / en |
| `js/dialogs.js` | Alert / confirm / error report |
| `js/tooltip.js` | Custom tooltips |
| `icons/*.svg` | Colourful 24×24 icon set (toolbars, buttons, menus) |

`index.html?role=pad`, `?role=list` and `?role=settings` are the same document. Web mode switches `#view-list` / `#view-pad` in one page.

---

## 3. Data

| OS | Folder |
|----|--------|
| Windows | `%APPDATA%\MyMemoPad\` |
| macOS | `~/Library/Application Support/MyMemoPad/` |
| Linux | `~/.config/MyMemoPad/` |

This is the folder the packaged Electron build used, so existing memos carry over. On first start, if it has no `memos.json` but the Electron development folder `my-memopad-multios` does, its files are copied (the old folder is left alone). `MYMEMOPAD_CONFIG_DIR` points a test run at another folder (with its own webview profile). Web: `localStorage` keys `mymemopad.*`.

| File | Contents |
|------|----------|
| `memos.json` | Array of HTML strings (WinForms RTF is imported as plain text) |
| `editor_settings.json` | Global font, colors, language, default transparency |
| `memo_settings.json` | Per-index look (font, colors, transparency) |

Language and auto-start are global. Look (font/color/opacity) is per memo once saved.

Default pad color is `#F8E18C` (MemoPadV10 yellow).

---

## 4. Packaging

`tauri build` via `npm run build:*`; the result is copied to the project root.

| Platform | Artifact |
|----------|----------|
| Windows | NSIS `MyMemoPad-Setup-{version}.exe` (per-user, unsigned) |
| macOS | DMG |
| Linux | AppImage + deb |

**Windows installer** (`src-tauri/windows/hooks.nsh`):

1. **Language** — Korean / English selector first; every page follows it.
2. **Existing installation** (only when MyMemoPad — Electron or Tauri — is installed, or memos are on disk): *keep memos and upgrade* (default) or *remove everything and install fresh* (program, memos, settings, shortcuts, start-up entry).
3. **Options** — Desktop shortcut, Start Menu shortcut, *start automatically with the system* (all on by default).

The Electron build is removed before installing: its program folder, registry keys, Run values and Chromium caches. Its own uninstaller is deliberately not run, because it deletes `%APPDATA%\MyMemoPad` (the memos) unconditionally. Uninstalling with *delete app data* removes the memo folders too.

Icons are generated from `asset/icon.svg` and `src/icons/*.svg` (`npm run icons`; `--if-missing` runs before every build).

## 5. Tests

`npm test` runs the Rust unit tests: store behaviour (settings merge, WinForms ARGB colours, upsert rules, per-memo looks, migration), argument parsing and the opacity range. The UI was checked in the running app through the WebView2 DevTools protocol (`MYMEMOPAD_CONFIG_DIR` + `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=…`).
