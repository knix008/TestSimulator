# MyBroadcasting

> **한국어 요약** — MyBroadcasting 은 개인 방송 스튜디오입니다. 방송에 필요한 기능(장면과 소스, 영상·오디오 필터,
> 오디오 믹서, 전환 효과, 스튜디오 모드, 멀티뷰, 프로젝터, 녹화·방송·리플레이 버퍼, 가상 카메라, 단축키, 장면 모음과
> 프로필, 자동 구성·출력 타이머·자동 장면 전환·스크립트·자막·WebSocket 원격 제어)을 Windows · macOS · Linux
> (Tauri 2) 와 웹 브라우저에서 같은 화면으로 씁니다. 화면과 창 스타일은 MySketchBook 과 같고, 시작 화면 · 튜토리얼 ·
> 사용 설명서 · 보고서 인쇄(장면 구성표, 소스 목록, 오디오 구성, 단축키 표, 출력 설정서, 세션 기록, 기능 목록)가 있습니다.
> 다른 방송 프로그램의 장면 파일(.json)을 가져오고 내보냅니다. 모든 기능은 `src/bc/features.js` 에 목록으로 있고, 테스트가 기능마다
> 통과해야 `npm test` 가 성공합니다.

Personal broadcasting studio for Windows, macOS, Linux (Tauri 2) and the web: scenes and sources, video and
audio filters, an audio mixer, transitions, studio mode, multiview, projectors, recording, streaming (RTMP,
RTMPS, SRT, RIST, WHIP), direct viewing (viewers open this program's address in a browser; no service, no stream key), a replay buffer, a virtual camera window, hotkeys, scene collections and profiles,
tools (auto configuration, output timer, scene switcher, scripts, captions, WebSocket remote control) and
printed production reports. Scene files of other broadcasting programs (.json) import and export.

## Running

```bash
npm install
npm start            # the desktop app in development (Vite + tauri dev, a free port from 5660)
npm run dev          # the web version only (http://127.0.0.1:5660)
npm run relay        # the web version's stream relay (RTMP / SRT / RIST through FFmpeg)
npm run viewers      # the web version's direct viewing server (viewers open http://<this computer>:8790/)
```

FFmpeg (on the PATH, or set in Settings › Advanced) carries RTMP / RTMPS / SRT / RIST streams, remuxes
recordings and embeds chapters. Recording, the replay buffer and WHIP streaming need no FFmpeg.

## Building

```bash
npm run build:win    # Windows installer (NSIS) → MyBroadcasting-Setup-<version>.exe
npm run build:mac    # macOS (.dmg / .app)
npm run build:linux  # Linux (.deb / .rpm / .AppImage)
npm run build:web    # the web version → dist/
npm run build:docs   # the help pages → public/doc
npm run build:icons  # app and file icons from assets/*.svg
npm run build:vcam   # the Windows virtual camera device (native/vcam → src-tauri/resources/vcam; Visual Studio C++)
```

## Testing

```bash
npm test                  # unit · i18n · rust · web · tutorial · desktop · build · features
npm test -- --quick       # unit · i18n · rust · features (no browser)
npm test -- --only web    # one category (comma separated)
npm test -- --no-desktop  # everything but the desktop app
npm run test:features     # the feature coverage table from the last runs
```

The **build** category builds the web version as the installers ship it and opens its windows. Windows,
macOS and Linux desktop builds run on GitHub Actions (`.github/workflows/mybroadcasting.yml`, on push or by
hand).

Every feature is listed in `src/bc/features.js`. A test proves a feature by naming it — `[F:<id>]` in its
name — and the **features** stage fails for any feature without a passing test. The web E2E suite drives the
real app in headless Edge with fake camera and microphone devices and checks what comes out: the program's
pixels for sources, filters and transitions, meter levels for audio, the bytes of recordings and replays, an
FFmpeg RTMP server for streaming, frames in projector windows. The desktop suite drives the debug executable
over WebView2's DevTools port (native recording files, FFmpeg streaming and remux, global hotkeys, projector
windows, the WebSocket server). Results: `test-results/report.txt`, `test-results/results.json`.

Test media in `test/fixtures` is made by `node scripts/make-fixtures.mjs` (FFmpeg).

## Layout

| Path | What |
| --- | --- |
| `src/bc/` | the broadcasting core: catalogue of source / filter / transition types, the scene-collection model, item geometry, features list, scene-file import / export (`compat/`), services, samples, platform bridge |
| `src/bc/engine/` | the WebGL 2 compositor, shaders, source runtimes, the Web Audio mixer and worklets, encoders and outputs (recording, replay buffer, stream), WHIP and projector links |
| `src/studio/` | the studio controller, profiles, hotkeys, panels, workspace (preview editing), property forms, settings tabs, reports, tools, the WebSocket remote-control protocol |
| `src/` (rest) | the MySketchBook shell: app, popups, themes, icons, start page, tutorial, print window, viewer |
| `src-tauri/` | the desktop app (Rust): windows and popups, recording files, FFmpeg, system stats, the remote-control server, printing |
| `server/` | the web build's stream relay |
| `test/` | unit tests, E2E suites and fixtures |

See [ARCHITECTURE.md](ARCHITECTURE.md) for the design and [USERSGUIDE.md](USERSGUIDE.md) for the user's guide.
