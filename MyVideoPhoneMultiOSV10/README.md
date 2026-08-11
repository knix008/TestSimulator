# MyVideoPhone

RTSP-based **video phone** for **Windows**, **macOS**, and **Linux** (Electron). Web UI remains available for helper playback.

| | |
|---|---|
| **Version** | 1.0.0 |
| **Author** | SHKWON \<knix008@naver.com\> |
| **License** | MIT |
| **Stack** | Electron 33 · HTML/CSS/ES modules · ffmpeg-static |

RTSP/RTSPS 라이브 스트림에 연결하는 영상 전화 앱입니다. 통화 연결·끊기·녹화, 로컬 카메라 미리보기(PIP), 최근 통화를 중심으로 동작합니다. 로컬 파일 열기는 보조 기능입니다.

자세한 구조·IPC·모듈 설명은 [Architecture.md](Architecture.md)를 참고하세요.

---

## Features

- **RTSP / RTSPS video phone**: Connect / Hang up / Record call to MP4 (desktop FFmpeg bridge)
- **System tray**: close button hides to tray; quit only from the tray menu; desktop notifications
- Local camera PIP preview during idle & calls (permission required)
- Call badge + live-call chrome (seek/rate disabled while connected)
- Recent calls dropdown (`Ctrl+R`)
- Local media playback with same-origin HTTP Range streaming (`/__media/<token>`) — helper
- Automatic compatibility conversion via FFmpeg (`media-compat.js`)
- Optional subtitle load (SMI / SRT / VTT beside the media file)
- Display fit modes: fill screen / keep aspect ratio / original size (toolbar menu; persisted)
- Built-in themes (Dark, Light, Ocean, Forest) + custom theme editor; stage uses `--bg-stage`
- UI language toggle: toolbar shows **ENG** / **한글** (target language); status bar re-translates on switch
- Draggable in-player spectrum popup (Web Audio analyzer + multiple painter styles)
- Settings / About / theme editor open as non-blocking dialogs so playback continues
- Frameless desktop window: brand bar, IPC drag (not `-webkit-app-region`), opacity, caption buttons
- Minimum window width keeps toolbar controls visible
- Settings / recent / dialog dirs in Electron `userData/persist.json` (web: `localStorage`)
- Quiet Chromium console by default (`MyVideoPhone_VERBOSE=1` to enable debug logs)
- Keyboard shortcuts (Space = play/pause, and more)
- Per-OS installers via `npm run build:*` (NSIS / DMG / AppImage+deb)

---

## Quick start

```bash
npm install
npm start          # Electron desktop app
npm run web        # Browser UI at http://localhost:5173
```

Run **one** Electron instance at a time (multiple instances can lock the Chromium disk cache).

Optional verbose Chromium logs:

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
```

| Command | Target | Output |
|---------|--------|--------|
| `npm run build:win` | Windows x64 | `dist/MyVideoPhone-Setup-{version}.exe` (also copied to repo root) |
| `npm run build:mac` | macOS | DMG + zip under `dist/` |
| `npm run build:linux` | Linux | AppImage + deb under `dist/` |

> macOS/Linux packages should be built on that OS (or CI). `dist:*` scripts are aliases of `build:*`.  
> `ffmpeg-static` is unpacked from asar so the main process can spawn FFmpeg.

Icons: [`asset/`](asset/) (`icon.ico`, `icon-1024.png`, `icons/`, `icon-256.png`).

---

## Documentation

| Document | Description |
|----------|-------------|
| [Architecture.md](Architecture.md) | Processes, `/__media`, RTSP, persist, themes, IPC, packaging |
| [UsersGuide.md](UsersGuide.md) | End-user manual (Korean) |
| [.gitignore](.gitignore) | Ignored paths (see below) |

---

## Project layout

```
MyVideoPhoneMultiOSV10/
├── electron/          # main, preload, rtsp-stream, media-compat, persist-store
├── src/               # Renderer / web UI (no bundler; ES modules)
├── scripts/           # Windows build helpers, installer copy
├── asset/             # App & installer icons
├── build/             # electron-builder resources (installer.nsh, …)
├── video/             # Local sample media (gitignored)
├── dist/              # Build output (gitignored)
├── Architecture.md
├── UsersGuide.md
├── .gitignore
└── package.json
```

### What Git ignores (summary)

From [`.gitignore`](.gitignore):

| Pattern | Why |
|---------|-----|
| `node_modules/`, `dist/`, `out/`, `*.asar` | Dependencies & build artifacts |
| `MyVideoPhone-Setup-*.exe` (and other installers at repo root) | Copied build products |
| `video/`, `*.mp4`, `*.mkv`, …, `*.smi`/`*.srt`/`*.vtt` | Large local/sample media & sidecars |
| `*.part`, `*.ytdl`, `*.download` | Incomplete downloads |
| `*cookies*.txt`, `.env*` | Secrets / session data |
| `.vscode/`, `.idea/`, `.cursor/`, `.DS_Store` | Editor / OS junk |
| `*.tmp`, `.cache/` | Temp files |

Put test videos under `video/` locally; they are not committed.

---

## Platform notes

| Platform | How to run / ship | Notes |
|----------|-------------------|--------|
| Web | `npm run web` | No native dialogs, RTSP, FFmpeg compat, or window opacity/chrome |
| Windows | `npm run build:win` → NSIS | Clean reinstall via `build/installer.nsh` |
| macOS | `npm run build:mac` | DMG + zip |
| Linux | `npm run build:linux` | AppImage + deb |

---

## License

MIT © SHKWON
