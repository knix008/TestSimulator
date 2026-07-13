# AV Editor Multi-OS

전문 오디오·비디오 편집기입니다.  
A multi-platform audio & video editor built with **Electron** and vanilla JavaScript.  
Runs as a **desktop app** (Windows, macOS, Linux) and in the **browser** (web mode).

## Features / 기능

- **Media browser / 미디어 탐색기**
  - Electron: drive-rooted directory tree, last folder restore, path bar, drag in/out
  - Web: session **Library** (`/library`) with sample media seeding and drag-drop import
  - File info panel (name, type, size, duration, codecs, resolution, path, …)

- **Preview / 미리보기**
  - Video & audio playback with seek, volume, mute, fullscreen
  - Fit / Fill / Actual size (1:1) view modes
  - Video & audio effect presets + brightness / contrast / saturation / bass / treble / speed
  - Transport cue overlay (play, pause, stop, seek) — **pause stays visible** until another transport action

- **Timeline / 타임라인**
  - Multi-track video & audio editing
  - Split, delete, zoom, drag media onto tracks

- **UI**
  - Dark / Light theme
  - Korean / English (UI, tooltips, native menus on desktop)
  - Toolbar, context menus with icons

- **Project / 프로젝트**
  - New / Open / Save project (`.avp` JSON)
  - Import media; export dialog (encode placeholder for now)

## Getting Started / 시작하기

### Prerequisites / 사전 요구사항

- [Node.js](https://nodejs.org/) v18 or higher
- npm

### Installation / 설치

```bash
git clone <repository-url>
cd AVeditorMultiOSV10
npm install
```

### Run / 실행

```bash
npm start          # Electron desktop app
npm run web        # Browser at http://127.0.0.1:4173/ (no build step)
npm run dev        # Electron with logging
```

### Build / 빌드

```bash
npm run build:win      # Windows NSIS installer → copied to project root
npm run build:mac      # macOS DMG / zip
npm run build:linux    # Linux package(s)
npm run build:web      # Static site → dist-web/
npm run build:all      # desktop platforms + web
npm run copy-artifacts # re-copy dist/ installers to project root
```

Windows installer (`AV Editor Setup x.y.z.exe`) is written to `dist/` and then copied to the **project root**.  
During installation you can choose **Desktop** and **Start Menu** shortcuts.

Web package: serve `dist-web/` with any static file server (e.g. `npx serve dist-web`).

## Project Structure / 프로젝트 구조

```
AVeditorMultiOSV10/
├── assets/icons/          # App icon (SVG source → PNG/ICO) + drag icon
├── build/installer.nsh    # NSIS shortcut choice page
├── samples/               # Sample media + manifest (web Library seed)
├── scripts/               # start, start-web, build-web, icons, copy-artifacts, …
├── src/
│   ├── main/              # Electron main + menu + preload
│   └── renderer/          # UI (HTML/CSS/JS) + locales + electron-api-shim
├── electron-builder.yml
├── package.json
├── README.md
├── UsersGuide.md
└── Architecture.md
```

## Scripts / 스크립트

| Command | Description |
|---------|-------------|
| `npm start` | Run the Electron app |
| `npm run web` / `npm run start:web` | Serve renderer in the browser |
| `npm run dev` | Electron with `--enable-logging` |
| `npm run generate-icons` | Build PNG/ICO from `assets/icons/icon.svg` |
| `npm run build:win` | Build Windows installer + copy to root |
| `npm run build:mac` | Build macOS package |
| `npm run build:linux` | Build Linux package(s) |
| `npm run build:web` | Build static web package → `dist-web/` |
| `npm run build:all` | Desktop packages + web build |
| `npm run copy-artifacts` | Copy `dist/` installers to project root |

## Documentation / 문서

- [UsersGuide.md](./UsersGuide.md) — 사용자 가이드
- [Architecture.md](./Architecture.md) — 아키텍처

## License / 라이선스

MIT License — Copyright © SHKWON
