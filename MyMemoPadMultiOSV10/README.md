# MyMemoPad

Sticky **memo pad** for **Windows**, **macOS**, **Linux**, and **Web** (Electron).

| | |
|---|---|
| **Version** | 1.0.0 |
| **Author** | SHKWON \<knix008@naver.com\> |
| **License** | MIT |
| **Stack** | Electron 33 · HTML/CSS/ES modules |

Port of [MemoPadV10](../MemoPadV10) (WinForms) to a single JavaScript codebase. Desktop builds keep the system tray and login auto-start; the browser build shares the same editor and list UI.

Details: [Architecture.md](Architecture.md) · End-user guide (KO): [UsersGuide.md](UsersGuide.md)

---

## Features

- **Sticky memo windows** — frameless yellow pads, drag the empty toolbar to move, resize from the edges
- **Memo list** — card previews, open on double-click, delete from the card
- **Rich text** — bold / italic / underline / strikethrough (`Ctrl+B/I/U`, `Ctrl+Shift+S`)
- **Per-memo look** — font, colors, and window transparency stored with each memo
- **System tray** — caption **X** hides to the tray; **Exit** only from the tray menu
- **Auto-start** — optional login item (`--autostart` starts hidden in the tray)
- **Korean / English** UI
- Installers via `npm run build:*` (NSIS / DMG / AppImage+deb)

---

## Quick start

```bash
npm install
npm run icons          # once, or automatically before build
npm start              # Electron desktop app
npm run web            # Browser UI at http://localhost:5173
```

### Build installers

```bash
npm run build:win      # Windows NSIS → dist/ + copy to project root
npm run build:mac      # macOS DMG + zip  (build on macOS)
npm run build:linux    # AppImage + deb   (build on Linux)
npm run pack           # Unpackaged app directory only
```

| Command | Target | Output |
|---------|--------|--------|
| `npm run build:win` | Windows x64 | `dist/MyMemoPad-Setup-{version}.exe` (+ repo root copy) |
| `npm run build:mac` | macOS | DMG + zip under `dist/` |
| `npm run build:linux` | Linux | AppImage + deb under `dist/` |

> macOS/Linux packages should be built on that OS (or CI). Web mode has no tray or auto-start.

---

## Documentation

| Document | Description |
|----------|-------------|
| [Architecture.md](Architecture.md) | Processes, windows, store, IPC, packaging |
| [UsersGuide.md](UsersGuide.md) | End-user manual (Korean) |
| [.gitignore](.gitignore) | Ignored paths |
