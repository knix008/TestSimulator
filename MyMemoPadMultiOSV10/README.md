# MyMemoPad

Sticky **memo pad** for **Windows**, **macOS**, **Linux**, and **Web** (Tauri 2).

| | |
|---|---|
| **Version** | 1.0.0 |
| **Author** | SHKWON \<knix008@naver.com\> |
| **License** | MIT |
| **Stack** | Tauri 2 (Rust) · HTML/CSS/ES modules |

Port of [MemoPadV10](../MemoPadV10) (WinForms) to a single JavaScript UI with a small Rust host. Desktop builds keep the system tray and login auto-start; the browser build shares the same editor and list UI.

The installed app is a native executable with the UI inside it. **Users need neither Node.js nor Rust** — those are only needed to build it. Windows uses the WebView2 runtime that ships with Windows 10/11 (the installer downloads it if it is missing), macOS uses WKWebView, and Linux packages depend on WebKitGTK.

Details: [Architecture.md](Architecture.md) · End-user guide (KO): [UsersGuide.md](UsersGuide.md)

---

## Features

- **Sticky memo windows** — frameless yellow pads, drag the empty toolbar to move, resize from the edges
- **Memo list** — card previews and count, open on double-click, delete from the card
- **Rich text** — bold / italic / underline / strikethrough (`Ctrl+B/I/U`, `Ctrl+Shift+S`)
- **Colourful icons** everywhere — toolbars, buttons, the tray menu and right-click menus
- **Right-click menus** — editor (format, undo/redo, cut/copy/paste), memo cards, list, toolbars
- **Per-memo look** — font, colors, and window transparency stored with each memo
- **System tray** — caption **X** hides to the tray; tray menu: memo list, new memo, start-up on/off, **Exit**
- **Auto-start** — optional login item (`--autostart` starts hidden in the tray), in Settings, the tray menu and the installer
- **Korean / English** UI and installer
- Installers via `npm run build:*` (NSIS / DMG / AppImage+deb)

---

## Quick start (development)

Needs Node.js 18+ and Rust (stable) — for building only.

```bash
npm install
npm start              # tauri dev (desktop app)
npm run web            # Browser UI at http://localhost:5173
npm test               # Rust unit tests (store, arguments, opacity)
```

### Build installers

```bash
npm run build:win      # Windows NSIS (x64)
npm run build:mac      # macOS DMG      (build on macOS)
npm run build:linux    # AppImage + deb (build on Linux)
npm run pack           # Release executable only, no installer
```

| Command | Target | Output (copied to the project root) |
|---------|--------|--------|
| `npm run build:win` | Windows x64 | `MyMemoPad-Setup-{version}.exe` |
| `npm run build:mac` | macOS | `MyMemoPad-{version}.dmg` |
| `npm run build:linux` | Linux | `MyMemoPad-{version}.AppImage`, `MyMemoPad_{version}_amd64.deb` |

Bundles are built under `src-tauri/target/release/bundle/`. macOS/Linux packages must be built on that OS (or CI). Web mode has no tray or auto-start.

Icons are generated from `asset/icon.svg` and `src/icons/*.svg` (`npm run icons`; builds regenerate missing ones).

---

## Documentation

| Document | Description |
|----------|-------------|
| [Architecture.md](Architecture.md) | Processes, windows, store, commands, packaging |
| [UsersGuide.md](UsersGuide.md) | End-user manual (Korean) |
| [.gitignore](.gitignore) | Ignored paths |
