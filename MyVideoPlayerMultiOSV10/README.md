# MyVideoPlayer

Cross-platform video/audio player for **Web**, **Windows**, **macOS**, and **Linux**.

| | |
|---|---|
| **Version** | 1.0.0 |
| **Author** | SHKWON \<knix008@naver.com\> |
| **License** | MIT |
| **Stack** | Electron 33 · HTML/CSS/ES modules · youtubei.js · ffmpeg-static · bundled yt-dlp |

멀티 OS 미디어 플레이어입니다. 로컬 파일은 HTTP Range(`/__media/…`)로 스트리밍하고, 재생 실패 시 FFmpeg로 호환 변환(소프트 리먹스 → H.264)을 시도합니다. YouTube·RTSP 재생, YouTube/RTSP 저장(녹화), 자막(SMI/SRT/VTT), 테마, 한글·영어 UI, 화면 맞춤, **축소 모드**, 재생 목록·스펙트럼 **별도 창**, 창별 투명도, `Esc` 일괄 최소화, 단축키를 지원합니다.

자세한 구조·IPC·모듈 설명은 [Architecture.md](Architecture.md)를 참고하세요.

---

## Features

- Local media playback with same-origin HTTP Range streaming (`/__media/<token>`)
- Automatic compatibility conversion via FFmpeg (`media-compat.js`, cache under `userData/compat-cache`)
- YouTube playback (IFrame API) and desktop download/save (bundled `yt-dlp` preferred, `youtubei.js` fallback; optional sign-in cookies)
- RTSP / RTSPS live view and MP4 recording (desktop; stop keeps the file and can play it back)
- Auto subtitle load (SMI / SRT / VTT beside the media file)
- Recent plays (up to 30) + separate **play history** window (`Ctrl+L`); last open/save folders remembered (desktop)
- Display fit modes: fill screen / keep aspect ratio / original size (control-bar menu; persisted)
- **Compact mode**: shrink the window to essential controls (open, transport, volume, restore); distinct enter/exit icons; spectrum & history windows stay open; persisted
- Built-in themes (Dark, Light, Ocean, Forest) + custom theme editor; stage uses `--bg-stage`
- UI language toggle: toolbar shows **ENG** / **한글** (target language); status bar re-translates on switch
- Separate **spectrum** and **play history** windows (each with its own title-bar opacity; desktop)
- `Esc` on desktop minimizes **all** app windows together; restoring any one restores the group
- Optional auto-hide for toolbar / control bar / status bar while playing (edge hover to show)
- Staged open progress when connecting YouTube / RTSP (URL dialog closes so the floating progress is visible; duplicate clicks blocked)
- Settings / About / theme editor open as non-blocking dialogs so playback continues
- Frameless desktop window: brand bar, IPC drag (not `-webkit-app-region`), opacity, caption buttons
- Minimum window width keeps toolbar controls visible (lower floor in compact mode)
- Settings / recent / dialog dirs in Electron `userData/persist.json` (web: `localStorage`)
- Quiet Chromium console by default (`MYVIDEOPLAYER_VERBOSE=1` to enable debug logs)
- Keyboard shortcuts (Space = play/pause, `Ctrl+L` = history window, and more)
- Per-OS installers via `npm run build:*` (NSIS / DMG / AppImage+deb)

---

## Quick start

```bash
npm install
npm start          # Electron desktop app (also ensures vendor/yt-dlp)
npm run web        # Browser UI at http://localhost:5173
```

Run **one** Electron instance at a time (multiple instances can lock the Chromium disk cache).

Optional verbose Chromium logs:

```bash
# Windows PowerShell
$env:MYVIDEOPLAYER_VERBOSE=1; npm start
```

### Build installers

```bash
npm run build:win      # Windows NSIS → dist/ + copy to project root
npm run build:mac      # macOS DMG + zip  (build on macOS)
npm run build:linux    # AppImage + deb   (build on Linux)
npm run build          # Current host targets from package.json
npm run pack           # Unpackaged app directory only
npm run ensure:yt-dlp  # Re-fetch bundled yt-dlp only
```

| Command | Target | Output |
|---------|--------|--------|
| `npm run build:win` | Windows x64 | `dist/MyVideoPlayer-Setup-{version}.exe` (also copied to repo root) |
| `npm run build:mac` | macOS | DMG + zip under `dist/` |
| `npm run build:linux` | Linux | AppImage + deb under `dist/` |

> macOS/Linux packages should be built on that OS (or CI). `dist:*` scripts are aliases of `build:*`.  
> `ffmpeg-static` is unpacked from asar so the main process can spawn FFmpeg.  
> Bundled `yt-dlp` is fetched into `vendor/yt-dlp/` (`postinstall` / `npm start`) and shipped as `extraResources`.

Icons: [`asset/`](asset/) (`icon.ico`, `icon-1024.png`, `icons/`, `icon-256.png`).

---

## Documentation

| Document | Description |
|----------|-------------|
| [Architecture.md](Architecture.md) | Processes, `/__media`, RTSP, YouTube, child windows, compact mode, Esc minimize-all, persist, themes, IPC, packaging |
| [UsersGuide.md](UsersGuide.md) | End-user manual (Korean) |
| [.gitignore](.gitignore) | Ignored paths (see below) |

---

## Project layout

```
MyVideoPlayerMultiOSV10/
├── electron/          # main, preload, youtube(+auth), rtsp-stream, media-compat, persist-store
├── src/               # Renderer / web UI (no bundler; ES modules)
├── scripts/           # ensure-yt-dlp, Windows build helpers, installer copy
├── asset/             # App & installer icons
├── build/             # electron-builder resources (installer.nsh, …)
├── vendor/yt-dlp/     # Bundled yt-dlp binary (gitignored; fetched locally)
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
| `MyVideoPlayer-Setup-*.exe` (and other installers at repo root) | Copied build products |
| `video/`, `*.mp4`, `*.mkv`, …, `*.smi`/`*.srt`/`*.vtt` | Large local/sample media & sidecars |
| `*.part`, `*.ytdl`, `*.download` | Incomplete downloads |
| `vendor/yt-dlp/yt-dlp(.exe)` | Fetched binary (not committed) |
| `*cookies*.txt`, `.env*` | Secrets / session data |
| `.vscode/`, `.idea/`, `.cursor/`, `.DS_Store` | Editor / OS junk |
| `*.tmp`, `.cache/` | Temp files |

Put test videos under `video/` locally; they are not committed.

---

## Platform notes

| Platform | How to run / ship | Notes |
|----------|-------------------|--------|
| Web | `npm run web` | No native dialogs, YouTube/RTSP save, FFmpeg compat, or window opacity/chrome |
| Windows | `npm run build:win` → NSIS | Clean reinstall via `build/installer.nsh`; ships bundled yt-dlp |
| macOS | `npm run build:mac` | DMG + zip |
| Linux | `npm run build:linux` | AppImage + deb |

System `yt-dlp` on `PATH` is optional; the app prefers the bundled binary under `vendor/yt-dlp/` (or installer `resources/yt-dlp`).

---

## License

MIT © SHKWON
