# MyCircuit 10.0

회로도(Schematic) · PCB · 3D · 시뮬레이션을 하나로 묶은 KiCad 스타일의 전자 회로 설계 프로그램입니다.
같은 코드가 **웹 브라우저**와 **Windows / macOS / Linux 데스크톱 앱(Electron)** 에서 그대로 돌아갑니다.
번들러 없이 순수 브라우저 JavaScript ES 모듈로 작성되어 있습니다 (three.js 는 `src/vendor` 에 포함).

> **English summary** — MyCircuit is a KiCad-like electronics design app (schematic, PCB, 3D view,
> circuit simulation) written in plain browser ES modules with no bundler. The same files run as a web
> page and as an Electron desktop app. `npm start` runs the desktop app, `npm run serve` serves it for a
> browser at http://localhost:8642, `npm test` runs the unit tests, and `npm run dist:win` /
> `dist:mac` / `dist:linux` build installers into `release/`.

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
  한국어/영어 전환, 9개 탭의 고정 크기 설정 창(모든 숫자는 − / + 스테퍼), 오른쪽 속성 패널의 숫자 항목도 스테퍼,
  정보 창(아이콘 + 설명 + 빌드 정보), 14개 레슨 · 62단계 **대화형 튜토리얼**(보기 / 따라 하기)
- 도구 모음 버튼은 숨겨지지 않습니다: 창 최소 폭이 가장 넓은 도구 모음을 따르고, 화면이 좁으면 글자 버튼이 아이콘으로
  줄어들며, 그래도 넘치면 두 줄로 나뉩니다.

자세한 사용법은 [`USERSGUIDE.md`](USERSGUIDE.md) (요약), [`docs/TUTORIAL.ko.html`](docs/TUTORIAL.ko.html) (기능별 튜토리얼, 실제 화면 그림), [`docs/USERSGUIDE.ko.html`](docs/USERSGUIDE.ko.html) /
[`docs/USERSGUIDE.en.html`](docs/USERSGUIDE.en.html) (그림이 들어간 전체 설명서, 앱에서 `F1`) 을 보세요.

## 요구 사항

- Node.js 22 이상
- `npm install` (Electron, electron-builder, 아이콘 생성용 pngjs / png-to-ico)

## 실행

| 명령 | 설명 |
| --- | --- |
| `npm start` | 데스크톱 앱 실행 (`scripts/build-info.mjs` 로 빌드 정보를 쓴 뒤 `scripts/start.mjs` 가 `ELECTRON_RUN_AS_NODE` 를 지우고 Electron 을 띄움) |
| `npm run serve` | 프로젝트 폴더를 http://localhost:8642 로 서비스 → 브라우저에서 바로 개발 |
| `npm run serve -- dist/web` | 웹 빌드 결과물을 서비스 |
| `PORT=9000 npm run serve` | 다른 포트 사용 |

웹 버전은 ES 모듈을 쓰므로 `file://` 로 `index.html` 을 직접 열면 동작하지 않습니다. 반드시 HTTP 서버로 여세요.

> VS Code 같은 Electron 기반 터미널은 `ELECTRON_RUN_AS_NODE=1` 을 물려주는 경우가 있어
> `electron .` 을 직접 실행하면 앱이 조용히 종료됩니다. `npm start` 를 쓰면 이 문제가 없습니다.

## 테스트

```
npm test               # test/unit/*.test.mjs (약 189개 테스트) 를 파일별로 node --test 실행
npm test -- sim drc    # 이름에 sim 또는 drc 가 들어간 파일만
npm run smoke          # 실제 Electron 앱을 CDP 로 조작하는 약 173개의 GUI 검사
npm run i18n:check     # 한국어 사전(src/ui/i18n-ko.js)에 없는 t("…") 키 보고
```

`npm test` 는 테스트를 분류별(핵심 모델·연결, 회로도·PCB 편집, PCB 검사·배선, 시뮬레이션, 제조 출력, 3D, 가져오기,
예제, 도구·계산기, 지역화)로 묶어 각 테스트의 시간과 함께 보여 주고, 마지막에 색깔 있는 요약을 출력합니다.
`npm run smoke` 는 모든 명령·예제, 배선(밀어내기, 장애물에서 멈춤), 차동 쌍, 길이 맞춤, 화면 이동·그리드·눈금자·치수,
3D 단위, 설정 창 스테퍼와 고정 크기, 오른쪽 패널 스테퍼, 정보 창, 도구 모음(좁은 화면 포함), 튜토리얼을 실제
마우스·키보드 입력으로 검사해 단위 테스트로는 안 잡히는 렌더러 오류를 찾습니다.

## 빌드

| 명령 | 결과 |
| --- | --- |
| `npm run build:art` (= `build:icons`) | `scripts/render-art.mjs` 가 숨은 Electron 창에서 `scripts/art/art.js` (회로 기판을 위에서 똑바로 내려다본 3D 그림)를 그려 `assets/` 의 앱/문서 아이콘(icon.png 512, icon.ico, icon.icns, icons/NxN.png, file-icon.*), `assets/art/hero.png`, NSIS 사이드바/헤더 BMP 를 만듦 |
| `node scripts/build-info.mjs` | 버전·커밋·브랜치·빌드 날짜를 `src/buildinfo.js` 에 기록(정보 창에 표시). `npm start` 와 모든 빌드가 자동 실행, 저장소에는 넣지 않음 |
| `npm run build:installer` | `build/installer-associations.nsh`, `build/file-types.json` 생성 (NSIS 파일 연결) |
| `npm run build:web` | `dist/web/` 에 웹 버전 (index.html, style, src, assets, sample, docs 를 그대로 복사) |
| `npm run build:clean` | `release/` 의 오래된 `*-unpacked`, `*.tmp` 폴더 정리, 이 폴더에서 띄운 MyCircuit 프로세스 종료 |
| `npm run dist:win` | Windows NSIS 설치 프로그램 (x64) → `release/MyCircuit-Setup-10.0.0.exe` |
| `npm run dist:mac` | macOS dmg + zip (서명 없음, `identity: null`) — macOS 에서 실행 |
| `npm run dist:linux` | Linux AppImage + deb + tar.gz — Linux 에서 실행 |
| `npm run build:all` | 웹 빌드 + 세 OS 패키지 한 번에 (`-mwl`) |

완성된 설치 파일은 `release/` 에 만들어지고, 찾기 쉽도록 프로젝트 루트에도 복사됩니다
(`scripts/copy-installers.cjs`). Windows 에서 백신이 막 풀린 Electron 폴더를 잡고 있어 생기는
`EPERM` 은 `scripts/package.mjs` 가 정리 후 최대 3번까지 다시 시도합니다.

### Windows 설치 프로그램

- 설치 경로 선택 가능(one-click 아님), 바탕화면/시작 메뉴 바로 가기, 시작할 때 **한국어/영어** 선택.
- 이미 설치되어 있으면 “설치된 MyCircuit 을 찾았습니다… 완전히 제거합니다” 안내가 나오고, **확인** 을 누르면 이전
  설치를 조용히 완전히 제거한 뒤 설치합니다(같은 버전을 다시 설치해도 파일이 확실히 바뀜). **취소** 는 설치 중단.
- `%APPDATA%\MyCircuit` 에 이전 데이터(설정, 자동 저장)가 있으면 **삭제할지** 따로 묻습니다(예/아니요).
- `.mycircuit` 파일을 MyCircuit 에 연결합니다. 다른 형식을 연결하려면 `scripts/create-installer.mjs`
  의 `FILE_TYPES` 에 추가하면 설치 마법사에 "파일 형식 연결" 선택 페이지가 생깁니다.

## 데이터 위치

| OS | 설정 (`settings.json`) |
| --- | --- |
| Windows | `%APPDATA%\MyCircuit` |
| macOS | `~/Library/Application Support/MyCircuit` |
| Linux | `~/.config/MyCircuit` |

웹 버전은 브라우저 `localStorage` 에 저장합니다. 자동 저장은 두 버전 모두 `localStorage` 를 씁니다.

## 저장소에 넣지 않는 파일 (`.gitignore`)

`node_modules/`, 빌드 결과(`dist/`, `release/`, `*.blockmap`, 루트로 복사된 설치 파일), 빌드 때 생성되는
`src/buildinfo.js`, 테스트 출력과 로그(`test-results/`, `smoke-shots/`, `coverage/`, `*.log`, `npm-debug.log*`),
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
  ui/                 UI (platform.js 가 데스크톱/웹 차이를 감춤, themes.js 테마, tutorial*.js 튜토리얼)
  vendor/three/       three.js (번들에 포함)
sample/               예제 프로젝트 (index.json + *.mycircuit), 패키지에서는 resources/sample
assets/               아이콘·그림 (npm run build:art 로 생성)
docs/                 설명서 HTML (ko/en) 과 스크린샷 (docs/images/*.webp)
electron/
  main.cjs            Electron 메인 프로세스 (창, 파일 대화상자, 인쇄, 단일 인스턴스)
  preload.cjs         렌더러에 window.mycircuit API 노출
build/                NSIS 스크립트 (installer.nsh + 생성된 installer-associations.nsh)
scripts/              실행·빌드·테스트 스크립트 (scripts/art/ = 프로그램 아이콘 3D 그림)
test/unit/            단위 테스트 (node --test)
test/smoke/           GUI 스모크 테스트 (CDP)
```

## 데스크톱 API (`window.mycircuit`)

`electron/preload.cjs` 가 노출하고 `src/ui/platform.js` 가 감쌉니다. 웹에서는 `window.mycircuit` 이
없으므로 platform.js 가 브라우저 대체 동작(파일 선택/다운로드, `window.print()`, `localStorage`)을 씁니다.

`getVersion`, `loadSettings`, `saveSettings`, `openFile`, `readPath`, `saveFile` (`content` 또는
바이너리용 `contentBase64`), `writeFile`, `print`, `printToPDF`, `openExternal`, `onOpenPath`,
`onRequestClose` / `confirmClose`, `setMinSize`, `setTitleBar`, `listSamples`, `readSample`, `pathForFile`.
