# MyVideoPlayer

Cross-platform video/audio player for **Web**, **Windows**, **macOS**, and **Linux**.

| | |
|---|---|
| **Version** | 1.0.0 |
| **Author** | SHKWON \<knix008@naver.com\> |
| **License** | MIT |
| **Stack** | Electron 33 · HTML/CSS/ES modules · youtubei.js · ffmpeg-static |

멀티 OS 미디어 플레이어입니다. 로컬 파일은 HTTP Range(`/__media/…`)로 스트리밍하고, 재생 실패 시 FFmpeg로 호환 변환(소프트 리먹스 → H.264)을 시도합니다. YouTube 재생·저장, 자막(SMI/SRT/VTT), 테마, 한글·영어 UI, 스펙트럼 팝업, 창 투명도, 단축키를 지원합니다.

자세한 구조·IPC·모듈 설명은 [Architecture.md](Architecture.md)를 참고하세요.

---

## Features

- Local media playback with same-origin HTTP Range streaming (`/__media/<token>`)
- Automatic compatibility conversion via FFmpeg (`media-compat.js`, cache under `userData/compat-cache`)
- YouTube playback (IFrame API) and desktop download/save (`yt-dlp` preferred, `youtubei.js` fallback)
- Auto subtitle load (SMI / SRT / VTT beside the media file)
- Recent plays (up to 10); last open/save folders remembered (desktop)
- Built-in themes (Dark, Light, Ocean, Forest) + custom theme editor; stage uses `--bg-stage`
- UI language toggle: toolbar shows **ENG** / **한글** (target language); status bar re-translates on switch
- Draggable in-player spectrum popup (Web Audio analyzer + multiple painter styles)
- Frameless desktop window: brand bar, IPC drag (not `-webkit-app-region`), opacity, caption buttons
- Minimum window width keeps toolbar controls visible
- Settings / recent / dialog dirs in Electron `userData/persist.json` (web: `localStorage`)
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

### Build installers

```bash
npm run build:win      # Windows NSIS → dist/MyVideoPlayer-Setup-*.exe
npm run build:mac      # macOS DMG + zip  (build on macOS)
npm run build:linux    # AppImage + deb   (build on Linux)
npm run build          # Current host targets from package.json
npm run pack           # Unpackaged app directory only
```

| Command | Target | Output |
|---------|--------|--------|
| `npm run build:win` | Windows x64 | `dist/MyVideoPlayer-Setup-{version}.exe` |
| `npm run build:mac` | macOS | DMG + zip under `dist/` |
| `npm run build:linux` | Linux | AppImage + deb under `dist/` |

> macOS/Linux packages should be built on that OS (or CI). `dist:*` scripts are aliases of `build:*`.  
> `ffmpeg-static` is unpacked from asar so the main process can spawn FFmpeg.

Icons: [`asset/`](asset/) (`icon.ico`, `icon-1024.png`, `icons/`, `icon-256.png`).

---

## Documentation

| Document | Description |
|----------|-------------|
| [Architecture.md](Architecture.md) | Processes, `/__media`, persist, themes, IPC, packaging |
| [UsersGuide.md](UsersGuide.md) | End-user manual (Korean) |
| [.gitignore](.gitignore) | Ignored paths (see below) |

---

## Project layout

```
MyVideoPlayerMultiOSV10/
├── electron/          # main, preload, youtube, media-compat, persist-store
├── src/               # Renderer / web UI (no bundler; ES modules)
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
| `video/`, `*.mp4`, `*.mkv`, …, `*.smi`/`*.srt`/`*.vtt` | Large local/sample media & sidecars |
| `.vscode/`, `.idea/`, `.cursor/`, `.DS_Store` | Editor / OS junk |
| `.env`, `.env.*` | Secrets |
| `*.tmp`, `.cache/` | Temp files |

Put test videos under `video/` locally; they are not committed.

---

## Platform notes

| Platform | How to run / ship | Notes |
|----------|-------------------|--------|
| Web | `npm run web` | No native dialogs, YouTube save, FFmpeg compat, or window opacity/chrome |
| Windows | `npm run build:win` → NSIS | Clean reinstall via `build/installer.nsh` |
| macOS | `npm run build:mac` | DMG + zip |
| Linux | `npm run build:linux` | AppImage + deb |

Optional: install [`yt-dlp`](https://github.com/yt-dlp/yt-dlp) on `PATH` for better YouTube downloads.

---

## License

MIT © SHKWON
