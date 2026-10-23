# MyCircuit V1.0

회로도(Schematic) · PCB · 3D · 시뮬레이션을 하나로 묶은 KiCad 스타일의 전자 회로 설계 프로그램입니다.
같은 코드가 **웹 브라우저**와 **Windows / macOS / Linux 데스크톱 앱(Tauri 2)** 에서 그대로 돌아갑니다.
번들러 없이 순수 브라우저 JavaScript ES 모듈로 작성되어 있습니다 (three.js 는 `src/vendor` 에 포함).

> **English summary** — MyCircuit is a KiCad-like electronics design app (schematic, PCB, 3D view,
> circuit simulation) written in plain browser ES modules with no bundler. The same files run as a web
> page and as a Tauri 2 desktop app (Rust host in `src-tauri/`, the system webview: WebView2 / WKWebView /
> WebKitGTK). `npm start` runs the desktop app (`tauri dev`), `npm run serve` serves it for a browser at
> <http://localhost:8642>, `npm test` runs the unit tests (JavaScript and Rust), `npm run smoke` and
> `npm run smoke:desktop` drive the real program, and `npm run build:win` / `build:mac` / `build:linux`
> build installers (copied to the project root).

## 주요 기능

- **회로도**: 여러 페이지, **계층 시트**(`S`, 블록을 더블클릭하면 그 페이지로; 핀은 계층 레이블 `H` 에 맞춰 자동 동기화),
  벡터 레이블 `D[0..7]`, **멀티 유닛 부품**(`LM358_DUAL`, `74HC00`), 측정 `M` · 치수선 `D`(“12.70 mm (500 mil)”), 실시간 ERC(14개 규칙)
- **PCB**: 2/4/6층, 45° 대화형 배선과 세 가지 **배선 모드**(충돌 표시 / 밀어내기 / 장애물에서 멈춤), **길이 맞춤**(미앤더),
  **차동 쌍 배선**, 구리 영역, 기판 크기 표시, DRC, A* 자동 배선기(바깥 층 또는 모든 구리 층, 격자 설정)
- **화면 이동**: 빈 캔버스 왼쪽 드래그 = 이동(설정으로 박스 선택 가능), `Shift`/`Ctrl`+드래그 = 박스 선택,
  가운데/오른쪽/`Space`+드래그 = 항상 이동, 손(이동) 도구(`Esc` 로 해제), 휠 확대 속도 설정
- **그리드와 눈금자**: 확대에 따라 ×5 로 간격이 바뀌는 5×5 선 그리드(또는 점), 위/왼쪽 mm·mil 눈금자와 커서 표시
- **3D**: 5×5 그리드, 눈금 달린 X/Y/Z 축, 방향 기즈모, W×D×H 기판 치수, cm/inch 전환, 회전/이동(`P`) 모드,
  방향키 회전 · `Shift`+방향키 이동 · `G` 그리드 · `A` 축, 시야각·회전 속도 설정
- **KiCad 가져오기**: 파일 → KiCad 프로젝트 가져오기…(`.kicad_sch`/`.kicad_pcb` 여러 개 선택, 데스크톱은 짝 파일과
  하위 시트를 자동으로 찾음; 계층 시트 → 블록 + 페이지; “가져오기 참고 사항” 대화 상자)
- **시뮬레이션**: 동작점 / 과도 / AC / DC 스윕, SPICE 넷리스트
- **제조 출력**: Gerber X2, Excellon, BOM, 픽앤플레이스, IPC-356, 거버 뷰어, 인쇄/PDF, STL/GLB
- **편의**: 40가지 테마(다크 20 + 라이트 20, 팔레트 버튼 = 무작위 테마, ▾ = 목록) + 사용자 테마 편집기, 국기 버튼으로
  한국어/영어 전환, 9개 탭의 설정 창(모든 숫자는 − / + 스테퍼), 좌우 패널 접기(아이콘 레일), 회로도 페이지마다 문서 탭,
  탭 줄 검색 칸(`Enter`·돋보기·`Ctrl+K`), 오른쪽 속성 패널의 숫자 항목도 스테퍼,
  정보 창(타이틀 바 ⓘ 또는 도움말 메뉴), 14개 레슨 · 62단계 **대화형 튜토리얼**(보기 / 따라 하기)
- 도구 모음 버튼은 숨겨지지 않습니다: 창 최소 폭이 가장 넓은 도구 모음을 따르고, 화면이 좁으면 글자 버튼이 아이콘으로
  줄어들며, 그래도 넘치면 두 줄로 나뉩니다.
- **데스크톱 창**: Windows·Linux 는 시스템 제목 표시줄 없이 프로그램이 그린 제목 표시줄(아이콘·메뉴·문서 이름·최소화/최대화/닫기)을
  씁니다. 빈 곳을 끌면 창이 움직이고 두 번 누르면 최대화되며, 창 가장자리를 끌어 크기를 바꿉니다. macOS 는 같은 막대 위에
  신호등 버튼이 놓입니다. 대화 상자는 메인 창에 딸린 **별도의 창**으로 열립니다.

자세한 사용법은 [`USERSGUIDE.md`](USERSGUIDE.md) (요약), [`docs/TUTORIAL.ko.html`](docs/TUTORIAL.ko.html) (기능별 튜토리얼, 실제 화면 그림), [`docs/USERSGUIDE.ko.html`](docs/USERSGUIDE.ko.html) /
[`docs/USERSGUIDE.en.html`](docs/USERSGUIDE.en.html) (그림이 들어간 전체 설명서, 앱에서 `F1`) 을 보세요.

## 요구 사항

- Node.js 22 이상, `npm install` (Tauri CLI `@tauri-apps/cli`, 아이콘 생성용 pngjs / png-to-ico)
- Rust stable 1.77 이상 (<https://rustup.rs>) — 데스크톱 앱을 빌드·실행할 때
- 운영 체제별 Tauri 준비물 (<https://tauri.app/start/prerequisites/>)
  - Windows 10/11: Microsoft C++ Build Tools, WebView2 런타임(Windows 11 에는 기본 포함; 설치 프로그램이 없으면 받아 설치)
  - macOS: Xcode Command Line Tools
  - Linux: `libwebkit2gtk-4.1-dev`, `libgtk-3-dev`, `librsvg2-dev`, `build-essential` 등
- 웹 버전만 쓸 때는 Node.js 만 있으면 됩니다.

## 실행

| 명령 | 설명 |
| --- | --- |
| `npm start` (= `npm run dev`) | 데스크톱 앱 개발 실행: 빌드 정보를 쓴 뒤 `tauri dev` 가 `scripts/dev-server.mjs` (프로젝트 폴더를 <http://localhost:5196> 로 서비스)를 띄우고 `src-tauri` 를 디버그로 빌드해 실행. 페이지 수정은 `Ctrl+R` 로 바로 반영, `src-tauri` 수정은 자동으로 다시 빌드 |
| `npm start -- <파일.mycircuit>` | 그 프로젝트를 열면서 시작 |
| `npm run serve` | 프로젝트 폴더를 <http://localhost:8642> 로 서비스 → 브라우저에서 바로 개발 |
| `npm run serve -- dist/web` | 웹 빌드 결과물을 서비스 |
| `PORT=9000 npm run serve` | 다른 포트 사용 |

웹 버전은 ES 모듈을 쓰므로 `file://` 로 `index.html` 을 직접 열면 동작하지 않습니다. 반드시 HTTP 서버로 여세요.

## 테스트

```
npm test                 # test/unit/*.test.mjs (192개) 를 파일별로 node --test, 이어서 src-tauri 의 cargo test (14개)
npm test -- sim drc      # 이름에 sim 또는 drc 가 들어간 파일만
npm test -- rust         # Rust 테스트만 (npm run test:rust 는 cargo 출력을 그대로 보여 줌)
npm run smoke            # 실제 데스크톱 앱을 CDP 로 조작하는 181개의 GUI 검사 (Windows)
npm run smoke:desktop    # 데스크톱 셸 검사 19개 (Windows)
npm run i18n:check       # 한국어 사전(src/ui/i18n-ko.js)에 없는 t("…") 키 보고
```

`npm test` 는 테스트를 분류별(핵심 모델·연결, 회로도·PCB 편집, PCB 검사·배선, 시뮬레이션, 제조 출력, 3D, 가져오기,
예제, 도구·계산기, 지역화, 데스크톱 셸(Rust))로 묶어 각 테스트의 시간과 함께 보여 주고, 마지막에 색깔 있는 요약을 출력합니다.

`npm run smoke` 는 모든 명령·예제, 배선(밀어내기, 장애물에서 멈춤), 차동 쌍, 길이 맞춤, 화면 이동·그리드·눈금자·치수,
3D 단위, 설정 창 스테퍼와 고정 크기, 오른쪽 패널 스테퍼, 정보 창, 도구 모음(좁은 화면 포함), 튜토리얼을 실제
마우스·키보드 입력으로 검사해 단위 테스트로는 안 잡히는 페이지 오류를 찾습니다. 이때 대화 상자는 메인 페이지 안에 띄웁니다
(`MYCIRCUIT_INLINE_DIALOGS=1`).

`npm run smoke:desktop` 은 사람이 쓰는 그대로 대화 상자를 별도 창으로 띄워 데스크톱 셸을 검사합니다: 대화 상자 창
(열기·크기·초점, 닫기 단추 / `Esc` / 시스템이 닫음), `settings.json`, 열기·다른 이름으로 저장·`Ctrl+S`·바이너리 내보내기,
PDF로 저장(A4 가로), 설명서 창, 화면 확대, 최소 창 크기, 최대화/복원 단추, 창에 끌어 놓은 파일, 명령줄의 파일,
저장하지 않은 변경이 있을 때 닫기.

두 스모크 테스트는 `src-tauri/target/debug/MyCircuit.exe` (페이지가 내장된 디버그 빌드, `npm run build:debug`) 를 씁니다.
없거나 소스보다 오래되었으면 먼저 다시 빌드합니다. 실행마다 임시 설정 폴더(`MYCIRCUIT_CONFIG_DIR`: 자기 웹뷰 프로필,
단일 실행 잠금 없음)와 WebView2 원격 디버깅 포트(`WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS`)를 쓰므로, 열어 둔 MyCircuit 와
사용자 설정에는 손대지 않습니다. 열기·저장 대화 상자는 `MYCIRCUIT_TEST_OPEN` / `MYCIRCUIT_TEST_SAVE_DIR` 로 답하므로
시스템 창이 뜨지 않고 임시 폴더 밖에는 아무것도 쓰지 않습니다. macOS·Linux 의 웹뷰에는 CDP 가 없어 스모크 테스트는
Windows 에서만 돕니다.

## 빌드

| 명령 | 결과 |
| --- | --- |
| `npm run build:win` | Windows NSIS 설치 프로그램 (x64) → `MyCircuit_1.0.0_x64-setup.exe` |
| `npm run build:mac` | macOS `MyCircuit.app` + `.dmg` (서명 없음) — macOS 에서 실행 |
| `npm run build:linux` | Linux AppImage + deb — Linux 에서 실행 |
| `npm run build:all` | 지금 운영 체제에서 만들 수 있는 설치 파일 모두 |
| `npm run build:debug` | 설치 파일 없이 `src-tauri/target/debug/MyCircuit.exe` (스모크 테스트용, 페이지 내장) |
| `npm run build:web` | `dist/web/` 에 웹 버전 (index.html, style, src, assets, sample, docs 를 그대로 복사) |
| `npm run build:art` (= `build:icons`) | `scripts/render-art.mjs` 가 헤드리스 Edge/Chrome 에서 `scripts/art/art.js` (정사각형 3D 블록 위에 회로 기판이 떠 있는 그림)를 그려 `assets/` 의 앱/문서 아이콘(icon.png 512, icon.ico, icon.icns, icons/NxN.png, file-icon.*), `assets/art/hero.png`, NSIS 사이드바/헤더 BMP(`build/`) 를 만듦. 브라우저는 `MYCIRCUIT_BROWSER` 로 지정 가능 |
| `node scripts/build-info.mjs` | 버전·커밋·브랜치·빌드 날짜를 `src/buildinfo.js` 에 기록(정보 창에 표시). `npm start` 와 모든 빌드가 자동 실행, 저장소에는 넣지 않음 |

`build:*` 는 `scripts/build.mjs` 가 `tauri build` 를 부릅니다. Tauri 는 `tauri.conf.json` 의 `beforeBuildCommand` 로
빌드 정보를 쓰고 페이지를 `dist/web` 으로 복사한 뒤 그것을 프로그램 안에 넣습니다. 설치 파일은
`src-tauri/target/release/bundle/` 에 만들어지고, 찾기 쉽도록 프로젝트 루트에도 복사됩니다(예전 버전의 설치 파일은 지움).
Tauri 는 지금 운영 체제의 설치 파일만 만들 수 있으므로 macOS·Linux 용은 그 운영 체제(또는 CI)에서 빌드합니다.

### Windows 설치 프로그램

- 사용자별 설치(관리자 권한 불필요), 설치 경로 선택, 시작할 때 **한국어/영어** 선택, 사이드바·헤더 그림.
- 이미 설치되어 있으면(예전 Electron 판이든 Tauri 판이든) “이미 설치된 MyCircuit 가 있습니다… 완전히 삭제합니다” 안내가
  나오고, **확인** 을 누르면 이전 설치를 조용히 완전히 지운 뒤 설치합니다. **취소** 는 설치 중단.
- 이전 데이터(`%APPDATA%\MyCircuit` 의 설정, `%LOCALAPPDATA%\com.shkwon.mycircuit` 의 자동 저장)가 있으면 **삭제할지**
  따로 묻습니다(예/아니요). 조용한 설치(`/S`)는 묻지 않고 데이터를 남깁니다.
- `.mycircuit` 파일을 MyCircuit 에 연결하고 문서 아이콘(`file-icon.ico`)을 붙입니다.
- 제거할 때 “앱 데이터 삭제” 를 고르면 `%APPDATA%\MyCircuit` 도 지웁니다.
- 동작은 `src-tauri/windows/hooks.nsh` (UTF-8 BOM 필수) 에 있습니다.

## 데이터 위치

| OS | 설정 (`settings.json`) | 웹뷰 저장소 (자동 저장) |
| --- | --- | --- |
| Windows | `%APPDATA%\MyCircuit` | `%LOCALAPPDATA%\com.shkwon.mycircuit` |
| macOS | `~/Library/Application Support/MyCircuit` | `~/Library/WebKit/com.shkwon.mycircuit` |
| Linux | `~/.config/MyCircuit` | `~/.local/share/com.shkwon.mycircuit` |

설정 폴더는 Electron 판과 같아서 설정이 그대로 이어집니다. 자동 저장(복구용 사본)은 웹뷰의 `localStorage` 에 있어
Electron 판에서 남긴 사본은 이어지지 않습니다. 웹 버전은 설정과 자동 저장 모두 브라우저 `localStorage` 에 저장합니다.

## 저장소에 넣지 않는 파일 (`.gitignore`)

`node_modules/`, 빌드 결과(`dist/`, `release/`, `src-tauri/target/`, `src-tauri/gen/schemas/`, 루트로 복사된 설치 파일),
빌드 때 생성되는 `src/buildinfo.js`, 테스트 출력과 로그(`test-results/`, `smoke-shots/`, `coverage/`, `*.log`, `npm-debug.log*`),
편집기/OS 파일(`.vscode/`, `.idea/`, `*.swp`, `.DS_Store`, `Thumbs.db`, `desktop.ini`).

## 프로젝트 구조

```
index.html            앱 진입점 (웹·데스크톱 공용)
style/app.css         스타일
src/
  core/               프로젝트 모델, 넷리스트(계층 시트·벡터 레이블·멀티 유닛 포함), 기하
  sch/                회로도 편집기·렌더러
  pcb/                PCB 편집기, DRC, 자동 배선, 존, 밀어내기(shove), 길이 맞춤(tuning), 차동 쌍(diffpair)
  io/                 KiCad 가져오기 (kicad.js, S-식 파서 sexpr.js)
  buildinfo.js        빌드 정보 (scripts/build-info.mjs 가 생성)
  view3d/             3D 보드 뷰어 (three.js)
  sim/                회로 시뮬레이터 (SPICE 스타일 엔진)
  fab/                제조 출력 (Gerber, Excellon, BOM, 픽앤플레이스, ZIP)
  lib/                심볼·풋프린트 라이브러리
  ui/                 UI (platform.js 가 데스크톱/웹 차이를 감춤, desktop-bridge.js 가 Tauri 명령으로 window.mycircuit 을
                      만듦, dialog-host.js 는 대화 상자 창 안에서 돎, themes.js 테마, tutorial*.js 튜토리얼)
  vendor/three/       three.js (번들에 포함)
sample/               예제 프로젝트 (index.json + *.mycircuit); 데스크톱도 프로그램에 내장된 이 파일을 읽음
assets/               아이콘·그림 (npm run build:art 로 생성)
docs/                 설명서 HTML (ko/en) 과 스크린샷 (docs/images/*.webp)
src-tauri/            Tauri 2 데스크톱 셸 (Rust)
  src/lib.rs          창(메인·대화 상자·설명서), 명령(파일·설정·인쇄·확대·창 크기), 단일 실행, 파일 연결
  src/files.rs        파일 읽기/쓰기 도우미, 명령줄의 .mycircuit
  src/pdf.rs          PDF로 저장 (WebView2 PrintToPdf, Windows)
  src/window_icon.rs  작업 표시줄·Alt+Tab 용 큰 아이콘
  tauri.conf.json     앱·번들 설정 (아이콘, 파일 연결, NSIS)
  capabilities/       메인 창 권한 (이벤트 수신만)
  windows/hooks.nsh   Windows 설치 프로그램 추가 동작
build/                NSIS 사이드바/헤더 BMP (npm run build:art 로 생성)
scripts/              실행·빌드·테스트 스크립트 (scripts/art/ = 프로그램 아이콘 3D 그림)
test/unit/            단위 테스트 (node --test)
test/smoke/           GUI 스모크 테스트 (CDP): gui-smoke.mjs, desktop-smoke.mjs, launch.mjs
```

## 데스크톱 API (`window.mycircuit`)

`src/ui/desktop-bridge.js` 가 Tauri 호스트의 명령(`src-tauri/src/lib.rs`)으로 만들고 `src/ui/platform.js` 가 감쌉니다.
웹에서는 `window.mycircuit` 이 없으므로 platform.js 가 브라우저 대체 동작(파일 선택/다운로드, `window.print()`,
`localStorage`)을 씁니다.

`getVersion`, `loadSettings`, `saveSettings`, `openFile`, `readPath`, `saveFile` (`content` 또는
바이너리용 `contentBase64`), `writeFile`, `print`, `printToPDF` (Windows 만), `openExternal`, `openManual`, `setZoom`,
`onOpenPath`, `onRequestClose` / `confirmClose`, `closeWindow`, `setMinSize`, `setTitleBar`,
대화 상자 창용 `fitDialog` / `closeDialog`, 창 단추용 `minimize` / `toggleMaximize` / `isMaximized` / `startDragging`.
예제는 웹과 같이 `fetch("sample/…")` 로 읽습니다.
