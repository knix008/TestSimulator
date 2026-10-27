# MyVideoPlayer

Cross-platform video/audio player for **Web**, **Windows**, **macOS**, and **Linux**.

| | |
|---|---|
| **Version** | 1.0.0 |
| **Author** | SHKWON \<knix008@naver.com\> |
| **License** | MIT |
| **Stack** | Tauri 2 (Rust) · HTML/CSS/ES modules · bundled yt-dlp · bundled FFmpeg |

멀티 OS 미디어 플레이어입니다. 로컬 파일은 앱 내장 HTTP 서버의 Range 요청(`/__media/…`)으로 스트리밍하고, 재생 실패 시 FFmpeg로 호환 변환(소프트 리먹스 → H.264)을 시도합니다. YouTube·RTSP 재생, YouTube/Instagram/TikTok 저장, RTSP 녹화, 자막(SMI/SRT/VTT, **YouTube 자막 다운로드**·언어 선택), 테마, 한글·영어 UI, 화면 맞춤, **화면 회전**(90° 단위), **축소 모드**, 재생 목록·스펙트럼 **별도 창**, 창별 투명도, `Esc` 일괄 최소화, 단축키를 지원합니다.

2026-10-27 Electron 에서 Tauri 2 로 옮겼습니다. 화면(`src/`)은 그대로이고, `src-tauri/src/bridge.js` 가 예전 `window.desktopAPI` 를 다시 만들어 모든 호출을 Rust 의 `vp` 명령 하나로 보냅니다. 자세한 구조는 [Architecture.md](Architecture.md)를 참고하세요.

---

## Features

- Local media playback with same-origin HTTP Range streaming (`/__media/<key>/<token>`)
- Automatic compatibility conversion via FFmpeg (cache under `<data>/compat-cache`)
- YouTube playback (IFrame API) and desktop download/save through the bundled `yt-dlp` (sign-in window for age-gated videos; "멈춤" keeps what was downloaded so far)
- **YouTube subtitles**: every uploaded subtitle language is saved next to the video as `name.<lang>.srt`, and the default language also as `name.srt` (falls back to YouTube's automatic captions when none were uploaded)
- **Subtitle language picker** in the control bar when a file has several subtitle files; **default subtitle language** in Settings ▸ Playback (also used for YouTube's in-player captions)
- Instagram / TikTok / other links through yt-dlp
- RTSP / RTSPS live view and MP4 recording (desktop; stop keeps the file and can play it back)
- Auto subtitle load (SMI / SRT / VTT beside the media file; toggle in Settings)
- Recent plays (up to 30) + separate **play history** window (`Ctrl+L`); last open/save folders remembered (desktop)
- Display fit modes, stage rotation in 90° steps, **compact mode**
- Built-in themes + custom theme editor; control-bar buttons are white outlines (theme text colour in light themes), Stop stays red
- UI language toggle: **ENG** / **한글**
- Separate **spectrum** and **play history** windows (each with its own opacity; desktop)
- `Esc` on desktop minimizes **all** app windows together; restoring any one restores the group
- Frameless desktop window: brand bar, toolbar drag, opacity, caption buttons
- File associations, "Open with", drag-and-drop of files onto the window, single instance
- Keyboard shortcuts (Space = play/pause, `Ctrl+L` = history window, and more)

---

## Quick start

Building needs Node.js 22+ and Rust (stable). **The installed app needs neither**: yt-dlp solves YouTube's signature challenge with the Deno runtime shipped in the installer (`vendor/deno` → `resources/deno`); an installed Node.js is only a fall-back if that copy is missing.

```bash
npm install        # also fetches vendor/yt-dlp and copies FFmpeg into vendor/ffmpeg
npm start          # tauri dev
npm run web        # Browser UI at http://localhost:5173
npm test           # full test suite (see Testing)
```

### Testing

`npm test` runs `test/run.mjs`: one aligned, coloured line per test with its run time, grouped by category, then a summary table per category.

| Category | What it checks |
|----------|----------------|
| Project | versions, bundled yt-dlp/FFmpeg, bundle resources, file associations, capability + CSP for the localhost pages, NSIS hooks, bridge ↔ renderer API, i18n key parity, no Electron leftovers |
| Rust | every `cargo test` unit test, run one by one |
| Renderer | subtitle parsers, YouTube ids, settings, recent list, themes, i18n (Node, no browser) |
| Setup → UI | the debug app in an isolated profile, driven over CDP: App, Server (Range, 403/404/416), Playback, Subtitles (auto-load, picker, default language), Windows (spectrum / play list), Window (bounds, opacity, maximize, full screen, group minimize), Compat (FFmpeg conversion), Remote (link via a local HTTP server), RTSP (preview + recording from `test/lib/rtsp-server.mjs`), UI (button colours, language, compact mode, about) |
| YouTube | real network: info, download with subtitles, stop-and-keep, cancel, in-app captions — skipped when offline |

```bash
npm test                          # everything (~90 s with network)
npm run test:offline              # without the YouTube network tests
node test/run.mjs --only rust,ui  # groups: project, rust, renderer, desktop, youtube
node test/run.mjs --keep          # keep the temp folder (fixtures, app data, downloads)
npm run test:rust                 # cargo test only
```

The desktop tests start only their own app process (own data folder, DevTools port and save folder under `%TEMP%`), so they never touch your settings or another running MyVideoPlayer.

### Build installers

```bash
npm run build:win      # Windows NSIS → src-tauri/target/release/bundle/nsis + copy to project root
npm run build:mac      # macOS DMG       (build on macOS)
npm run build:linux    # AppImage + deb  (build on Linux)
npm run build          # Current host targets
npm run pack           # Release binary only, no installer
npm run ensure:tools   # Re-fetch yt-dlp / re-copy FFmpeg only (ensure:tools:latest updates yt-dlp)
```

The build updates `vendor/yt-dlp` to the latest release first (`beforeBuildCommand`). Both helpers ship as bundle resources (`resources/yt-dlp`, `resources/ffmpeg`).

> **YouTube downloads failing?** Check that `vendor/yt-dlp/yt-dlp.exe` exists (`npm run ensure:tools:latest`). A missing binary was the cause of "YouTube link download does not work" in the Electron build.

Icons: [`asset/`](asset/) (`icon.ico`, `icons/`).

---

## Project layout

```
MyVideoPlayerMultiOSV10/
├── src/               # Renderer / web UI (no bundler; ES modules) — unchanged from the Electron build
├── src-tauri/         # Tauri app
│   ├── src/lib.rs        # windows, dialogs, the `vp` command (old IPC channel names)
│   ├── src/bridge.js     # window.desktopAPI on Tauri (injected into every page)
│   ├── src/server.rs     # localhost server: pages, /__media, /__rtsp, settings snapshot
│   ├── src/download.rs   # YouTube / remote downloads (yt-dlp)
│   ├── src/subs.rs       # subtitle files beside a video, YouTube subtitle download
│   ├── src/rtsp.rs       # RTSP preview + recording (ffmpeg)
│   ├── src/compat.rs     # FFmpeg compatibility conversion
│   ├── src/auth.rs       # YouTube sign-in → cookies.txt
│   ├── src/persist.rs    # persist.json (migrated from the Electron build once)
│   └── windows/hooks.nsh # removes the Electron install before installing
├── scripts/           # ensure-tools / ensure-yt-dlp, installer copy, theme CSS generator
├── asset/             # App & installer icons
├── vendor/            # yt-dlp, ffmpeg (gitignored; fetched locally)
├── Architecture.md
├── UsersGuide.md
└── package.json
```

### Data

Settings, recent list and dialog folders live in `%APPDATA%\com.shkwon.myvideoplayer\persist.json` (macOS/Linux: the platform app-data folder; web: `localStorage`). On first start the Electron build's `persist.json` is copied in. `MYVIDEOPLAYER_CONFIG_DIR` points data and the WebView2 profile elsewhere (tests).

---

## Platform notes

| Platform | How to run / ship | Notes |
|----------|-------------------|--------|
| Web | `npm run web` | No native dialogs, downloads, FFmpeg compat, or window opacity/chrome |
| Windows | `npm run build:win` → NSIS | Per-user install; removes the Electron build first (keeps settings) |
| macOS | `npm run build:mac` | DMG |
| Linux | `npm run build:linux` | AppImage + deb |

---

## License

MIT © SHKWON
