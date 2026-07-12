# AV Editor Multi-OS

전문 오디오·비디오 편집기입니다.  
A multi-platform audio & video editor built with **Electron** and vanilla JavaScript.  
Supports **Windows**, **macOS**, and **Linux**.

## Features / 기능

- **Media browser / 미디어 탐색기**
  - Drive-rooted directory tree (e.g. `C:`, `D:` on Windows)
  - Last-opened folder restored on startup
  - Full path bar, drive selector, resizable sidebar
  - File info panel (name, type, size, dates, path)

- **Preview / 미리보기**
  - Video & audio playback
  - Fit / Fill / Actual size (1:1) view modes
  - Seek, volume, mute, fullscreen

- **Timeline / 타임라인**
  - Multi-track video & audio editing
  - Split, delete, zoom
  - Drag media onto tracks

- **UI**
  - Dark / Light theme
  - Korean / English (menus and UI)
  - Toolbar, context menus with icons
  - Custom app icon

- **Project / 프로젝트**
  - New / Open / Save project (`.avp`)
  - Import media, export dialog

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
npm start
```

### Build / 빌드

```bash
npm run build:win      # Windows NSIS installer → copied to project root
npm run build:mac      # macOS DMG / zip
npm run build:linux    # AppImage + deb
npm run build:all      # all platforms
npm run copy-artifacts # re-copy dist/ installers to project root
```

Windows installer (`AV Editor Setup x.y.z.exe`) is written to `dist/` and then copied to the **project root**.

During installation you can choose whether to create **Desktop** and **Start Menu** shortcuts.

## Project Structure / 프로젝트 구조

```
AVeditorMultiOSV10/
├── assets/icons/          # App icon (SVG source → PNG/ICO)
├── build/installer.nsh    # NSIS shortcut choice page
├── scripts/               # start, icons, copy-artifacts
├── src/
│   ├── main/              # Electron main + menu + preload
│   └── renderer/          # UI (HTML/CSS/JS) + locales
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
| `npm run generate-icons` | Build PNG/ICO from `assets/icons/icon.svg` |
| `npm run build:win` | Build Windows installer + copy to root |
| `npm run copy-artifacts` | Copy `dist/` installers to project root |

## Documentation / 문서

- [UsersGuide.md](./UsersGuide.md) — 사용자 가이드
- [Architecture.md](./Architecture.md) — 아키텍처

## License / 라이선스

MIT License — Copyright © SHKWON
