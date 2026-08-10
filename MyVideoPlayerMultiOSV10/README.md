# MyVideoPlayer

Cross-platform video/audio player for **Web**, **Windows**, **macOS**, and **Linux**.

| | |
|---|---|
| **Version** | 1.0.0 |
| **Author** | SHKWON \<knix008@naver.com\> |
| **License** | MIT |
| **Stack** | Electron 33 · HTML/CSS/ES modules · youtubei.js · ffmpeg-static |

멀티 OS 미디어 플레이어입니다. 로컬 파일 재생(HTTP Range), 호환 변환(FFmpeg), YouTube 재생/저장, 자막(SMI/SRT/VTT), 테마, 한글·영어 UI, 스펙트럼 팝업, 창 투명도, 단축키를 지원합니다.

---

## Features

- Local media playback with HTTP Range streaming (`/__media/…`)
- Automatic compatibility conversion (soft remux → H.264 re-encode via FFmpeg) when decode fails
- YouTube playback (IFrame API) and desktop download/save
- Auto subtitle load (SMI / SRT / VTT beside the media file)
- Recent plays (up to 10); last open/save folders remembered (desktop)
- Built-in themes (Dark, Light, Ocean, Forest) + custom theme editor; stage background follows theme
- UI language toggle: toolbar shows **ENG** / **한글** (target language); status bar re-translates on switch
- Draggable in-player spectrum popup with multiple styles
- Frameless desktop window: brand bar, JS drag, opacity slider, minimize / maximize / close
- Keyboard shortcuts (Space = play/pause, and more)
- Windows NSIS installer with clean reinstall

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
npm run dist:win     # Windows NSIS → dist/MyVideoPlayer-Setup-*.exe
npm run dist:mac     # macOS DMG + zip
npm run dist:linux   # AppImage + deb
npm run pack         # Unpackaged app directory only
```

Icons used for the app and installers live under [`asset/`](asset/).

---

## Documentation

| Document | Description |
|----------|-------------|
| [Architecture.md](Architecture.md) | System design, processes, modules, IPC |
| [UsersGuide.md](UsersGuide.md) | End-user manual (Korean) |

---

## Project layout

```
MyVideoPlayerMultiOSV10/
├── electron/          # Main process, preload, YouTube, media compat, persist
├── src/               # Renderer / web UI (HTML, CSS, JS modules)
├── asset/             # App & installer icons
├── build/             # electron-builder resources (NSIS script, icons)
├── video/             # Local sample media (gitignored)
├── Architecture.md
├── UsersGuide.md
└── package.json
```

---

## Platform notes

| Platform | Package | Notes |
|----------|---------|--------|
| Web | `npm run web` | Playback in browser; YouTube save, native reopen, opacity, and FFmpeg compat need desktop |
| Windows | NSIS x64 | Primary installer; clean reinstall on Setup |
| macOS | DMG / zip | |
| Linux | AppImage / deb | |

Optional: install [`yt-dlp`](https://github.com/yt-dlp/yt-dlp) on `PATH` for better YouTube downloads (falls back to `youtubei.js`).

---

## License

MIT © SHKWON
