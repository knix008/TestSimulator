# MyVideoPhone

LAN **IP video phone** for **Windows**, **macOS**, and **Linux** (Electron). Optional RTSP camera view and local media helper remain available.

| | |
|---|---|
| **Version** | 1.0.0 |
| **Author** | SHKWON \<knix008@naver.com\> |
| **License** | MIT |
| **Stack** | Electron 33 · HTML/CSS/ES modules · ffmpeg-static |

Peer-to-peer video calls over the local network: enter the other person’s IP, accept/reject the ring, talk with mic + camera PIP, hang up from the large control button. Default phone port is **8765**.

Details: [Architecture.md](Architecture.md) · End-user guide (KO): [UsersGuide.md](UsersGuide.md)

---

## Features

- **IP video phone** — dial by IP, incoming Accept/Reject, hang up; LAN publish on port **8765**
- **Call control** — one large button: connect when idle, end call when live (`Ctrl+Y` / `Esc`)
- **Mic / camera** — toolbar mic mute and local camera PIP preview
- **System tray** — caption ✕ hides to tray (camera/mic released); Quit only from tray menu
- **Desktop notifications** — connected, ended, incoming call, recording
- Optional **RTSP/RTSPS** live view + MP4 call recording (desktop FFmpeg bridge)
- Local media helper with same-origin `/__media/<token>` Range streaming + FFmpeg compat convert
- Display fit modes, themes (+ custom editor), Korean/English UI
- Frameless window: IPC drag on empty toolbar chrome, opacity, min width from toolbar measure
- Settings / About as themed dialogs; error report with **Copy** (Electron clipboard IPC)
- App icon set in [`asset/`](asset/) — regenerate with `npm run icons`
- Installers via `npm run build:*` (NSIS / DMG / AppImage+deb)

---

## Quick start

```bash
npm install
npm start              # Electron desktop app
npm run start:multi    # Allow a second process (separate userData) for two-PC / two-instance tests
npm run web            # Browser UI helper at http://localhost:5173 (no phone/RTSP)
```

Verbose Chromium logs (optional):

```bash
# Windows PowerShell
$env:MyVideoPhone_VERBOSE=1; npm start
```

### Build installers

```bash
npm run build:win      # Windows NSIS → dist/ + copy to project root
npm run build:mac      # macOS DMG + zip  (build on macOS)
npm run build:linux    # AppImage + deb   (build on Linux)
npm run build          # Current host targets from package.json
npm run pack           # Unpackaged app directory only
npm run icons          # Rebuild icon.ico / PNGs / favicon from asset/icon.svg
```

| Command | Target | Output |
|---------|--------|--------|
| `npm run build:win` | Windows x64 | `dist/MyVideoPhone-Setup-{version}.exe` (+ repo root copy) |
| `npm run build:mac` | macOS | DMG + zip under `dist/` |
| `npm run build:linux` | Linux | AppImage + deb under `dist/` |

> macOS/Linux packages should be built on that OS (or CI). `dist:*` aliases `build:*`.  
> `ffmpeg-static` is unpacked from asar so the main process can spawn FFmpeg.

---

## Documentation

| Document | Description |
|----------|-------------|
| [Architecture.md](Architecture.md) | Processes, phone server, `/__phone/live` proxy, RTSP, IPC, packaging |
| [UsersGuide.md](UsersGuide.md) | End-user manual (Korean) |
| [.gitignore](.gitignore) | Ignored paths (summary below) |

---

## Project layout

```
MyVideoPhoneMultiOSV10/
├── electron/          # main, preload, phone-stream, rtsp-stream, media-compat, persist-store
├── src/               # Renderer / web UI (no bundler; ES modules)
├── scripts/           # Windows build helpers, icon generator, installer copy
├── asset/             # App & installer icons (icon.svg → ico/png)
├── build/             # electron-builder resources (installer.nsh)
├── video/             # Local sample media (gitignored)
├── dist/              # Build output (gitignored)
├── Architecture.md
├── UsersGuide.md
├── .gitignore
└── package.json
```

### What Git ignores (summary)

| Pattern | Why |
|---------|-----|
| `node_modules/`, `dist/`, `out/`, `*.asar` | Dependencies & build artifacts |
| `MyVideoPhone-Setup-*.exe` (and other installers at repo root) | Copied build products |
| `video/`, common media/subtitle extensions | Large local samples & recordings |
| `*.part`, `*.download` | Incomplete downloads |
| `.env*` | Secrets |
| `.vscode/`, `.idea/`, `.cursor/`, `.DS_Store` | Editor / OS junk |

---

## Platform notes

| Platform | How to run / ship | Notes |
|----------|-------------------|--------|
| Desktop | `npm start` / installers | Full IP phone, RTSP, tray, mic/camera |
| Web | `npm run web` | UI shell only — no LAN phone or RTSP |
| Windows | `npm run build:win` → NSIS | Clean reinstall via `build/installer.nsh` |
| macOS | `npm run build:mac` | DMG + zip |
| Linux | `npm run build:linux` | AppImage + deb |

**Webcam note:** On Windows a physical camera is usually exclusive to one process. Two apps (or two MyVideoPhone instances) often cannot open the same webcam at once; use two machines, a second camera, or a virtual camera for dual testing.

---

## License

MIT © SHKWON
