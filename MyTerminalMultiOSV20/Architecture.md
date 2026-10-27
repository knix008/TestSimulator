# MyTerminal Architecture

이 문서는 MyTerminal(v1.0.0)의 런타임 구조, 주요 모듈, 프로세스 경계, 설정·세션 흐름을 설명합니다.

## 1. 개요

MyTerminal은 **Tauri 2** 데스크톱 앱입니다. 세 부분으로 나뉩니다.

| 계층 | 위치 | 역할 |
|------|------|------|
| Tauri 프로그램 (Rust) | `src-tauri` | 창(터미널·팝업·드롭다운·분리 미리보기), 트레이, 단일 인스턴스, 대화상자, 클립보드, 링크/파일 열기, **가상 터미널(ConPTY/pty)**, 배경 이미지 축소 |
| Node 호스트 | `src/host` | 설정 I/O, 배경 이미지 라이브러리, MyShell/SSH 세션과 세션의 소유 창, 프롬프트·명령 셸 설정 |
| Renderer | `src/renderer` | 툴바·탭·모달·xterm UI, 테마/i18n (Electron 판과 같은 코드) |

Electron 판의 Main 프로세스가 하던 일 중 창·OS 기능은 Rust로, 나머지(MyShell·`ssh2`·프롬프트 엔진·설정)는 **같은 JS 코드를 Node 호스트**에서 그대로 실행합니다. Renderer는 `window.myTerminal`(Electron preload와 같은 API)만 사용하므로 바뀌지 않았습니다.

Web 모드에서는 Tauri/Node 없이 Renderer + `WebShell`이 동작합니다.

```
┌─────────────────────────────────────────────┐
│                 Renderer                     │
│  Toolbar / Tabs / Modals / xterm panes       │
│  app.bundle.js · tauri-bridge.js (주입)       │
└───────────────────┬─────────────────────────┘
                    │ invoke('mt', {ch, a}) / 이벤트 `mt:<창 label>`
┌───────────────────▼─────────────────────────┐
│           Tauri 프로그램 (Rust)               │
│  창·팝업·드롭다운·트레이·대화상자·클립보드      │
│  pty.rs (ConPTY / openpty) · images.rs       │
└───────────────────┬─────────────────────────┘
                    │ stdin/stdout JSON 한 줄씩 (host.rs ↔ rpc.js)
┌───────────────────▼─────────────────────────┐
│              Node 호스트                      │
│  settings · backgrounds · pty-manager        │
│  → MyShell / SSH sessions                    │
└─────────────────────────────────────────────┘
```

## 2. 디렉터리 구조

```
src/
  host/               # Node 호스트 (Tauri 프로그램이 띄움)
    host.js           # 진입점: 요청 처리(채널 이름 = Electron IPC 채널), 부트스트랩
    rpc.js            # Tauri ↔ 호스트 줄 단위 JSON 프로토콜
    windows.js        # 세션이 쓰는 `win` 대역(창 label → 이벤트)
    settings.js       # settings.json 읽기/머지 저장/정리
    backgrounds.js    # 배경 이미지 라이브러리 (축소·TIFF 변환은 Rust에 요청)
    pty-process.js    # Rust 가상 터미널로 실행되는 자식 프로세스(ChildProcess 모양)
    pty-manager.js    # 세션 맵, 소유 창, adopt/detach
    myshell.js        # 자체 로컬 셸 (내장 명령 + 명령 셸 위임)
    shells.js         # 명령 셸 카탈로그(cmd/PowerShell/Git Bash/WSL/bash/zsh…) · spawn 규칙
    ssh-session.js    # ssh2 원격 세션
    prompt.js         # git status(porcelain v2) · 프롬프트 상태 · ANSI 렌더
    shell-memory.js   # 마지막 폴더·최근 경로·명령 기록
    paths.js          # 사용자 데이터 폴더
  renderer/
    index.html
    popup.html        # 분리형 팝업(설정/프롬프트/SSH/About) 셸
    dropdown.html     # 툴바 드롭다운 창
    detach-preview.html
    css/main.css, css/popup.css
    js/
      tauri-bridge.js # window.myTerminal (Tauri가 모든 창에 초기화 스크립트로 주입)
      app.js          # UI 부트스트랩·설정·툴바
      session-manager.js
      terminal.js     # TerminalPane (xterm)
      modals.js       # 팝업 뷰(설정/SSH/About)
      settings-view.js  # 설정 본문(탭·고정 레이아웃) — 팝업/웹 모달 공용
      prompt-editor.js  # 프롬프트 테마 편집기
      popup-app.js    # 팝업 창 부트스트랩
      dropdown-app.js # 툴바 드롭다운
      popup-host.js   # 소유 창 ↔ 팝업 메시지 브리지
      tooltip.js, themes.js, fonts.js, i18n.js, background-fit.js, ls-colors.js
      web-shell.js    # Web 모드 셸
      app.bundle.js / popup.bundle.js   # esbuild 산출물(생성)
    shared/
      i18n/           # en.json, ko.json
      themes/         # themes.json
  shared/
    prompt-core.js    # 프롬프트 엔진 — host/renderer/테스트 공용
    error-format.js
src-tauri/
  src/lib.rs          # 창·팝업·드롭다운·미리보기·트레이·세션 이동·`mt` 명령
  src/host.rs         # Node 호스트 프로세스와 줄 프로토콜
  src/pty.rs          # 가상 터미널 (Windows ConPTY 직접 구현 / Unix portable-pty)
  src/images.rs       # 배경 이미지 축소, RGBA → PNG
  src/window_icon.rs  # 작업 표시줄 큰 아이콘, 활성화 없이 보이기
  windows/hooks.nsh   # NSIS 설치 프로그램 추가 동작
  tauri.conf.json, capabilities/default.json
test/                 # node:test 단위 테스트
scripts/
  build-renderer.js   # esbuild 번들
  build-tauri-web.js  # dist/web(페이지) + dist/sidecar(호스트 번들[+ Node 런타임])
  build.js            # build:win / mac / linux / all / debug
  smoke.js            # 데스크톱 스모크(디버그 빌드를 CDP로 조작)
  test.js             # npm test (JS + Rust)
  serve-web.js / build-web.js
  patch-xterm-powerline-aa.js
```

## 3. 부분별 책임

### 3.1 Tauri 프로그램 (Rust)

- **단일 인스턴스**: `tauri-plugin-single-instance` — 두 번째 실행은 종료하고 기존 창을 앞으로. `MYTERMINAL_CONFIG_DIR`(테스트)이면 잠금 없음
- **Node 호스트 시작**: 릴리스는 번들된 `resources/sidecar/node(.exe)` + `host.js`, 디버그는 PATH의 `node` + `src/host/host.js`. `ELECTRON_RUN_AS_NODE`는 지운 환경으로 띄움(MyTerminal에서 실행한 Electron 앱이 망가지지 않도록). 호스트가 `ready`를 보내면 첫 창을 엽니다
- **창**: 프레임리스·투명(`transparent`), 라벨 `main-<n>`(렌더러가 쓰는 창 id = n). 페이지 로드가 끝나면 표시(빈 투명 창이 먼저 보이지 않게). 최소 폭은 툴바 실측값으로 갱신. Windows는 CSS `app-region: drag`로 창 이동(WebView2 비클라이언트 영역), macOS/Linux는 브리지가 `start_dragging`을 요청
- **창 투명도**: 창이 투명하므로 브리지가 `body`의 불투명도(최소 0.2)로 처리 — Electron `setOpacity`와 같은 결과
- **창 위치 기억**: 이동/크기 변경 250ms 뒤 호스트의 `settings:update`로 저장(최대화면 `windowMaximized`만)
- **팝업 창**: 설정/프롬프트/SSH/About/오류는 `popup-<n>` 창(`popup.html?id=&kind=`) — 콘텐츠 마운트·측정 후 `popup:show`로 표시, 2.5초 안전 타이머
- **드롭다운 창**: 미리 만들어 둔 숨김 창 `dropdown` 하나를 재사용(새 웹뷰 생성 지연 제거). 열 때 HTML·색을 보내고, 포커스를 잃으면 닫힘
- **탭 분리 미리보기**: 미리 만든 투명·클릭 통과·포커스 불가 창 `detach-preview`. Windows는 활성화 없이 표시/숨김(`SW_SHOWNOACTIVATE`/`SW_HIDE`)
- **가상 터미널**(`pty.rs`): MyShell이 실행하는 외부 프로그램용. Windows는 ConPTY를 직접 만들어 호스트가 만든 **명령줄 그대로** `CreateProcessW`(cmd의 `/d /s /c "…"` 보존), `PSEUDOCONSOLE_INHERIT_CURSOR`로 화면을 지우지 않고 현재 커서 위치부터 그립니다. 프로그램이 끝나면 출력이 잠잠해질 때까지(최대 0.6초) 기다린 뒤 콘솔을 닫아 마지막 출력을 잃지 않습니다
- **트레이**: 호스트가 설정 변경 때 `tray.apply`로 알림 → 열기/설정/종료 메뉴, 클릭하면 설정 열기
- **종료**: 마지막 터미널 창이 닫히면 `quit_app()` — 트레이 제거, 보조 창 정리, 호스트 `host:quit`(셸 정리) 후 Node 종료, `app.exit(0)`

### 3.2 Renderer ↔ 프로그램 (`tauri-bridge.js`)

모든 창에 초기화 스크립트로 주입되며(`window.__MYTERMINAL_BOOT__ = { platform, label }` 다음), Electron preload와 같은 `window.myTerminal`을 만듭니다(`isElectron: true`는 "데스크톱" 표시로 유지).

- 호출: `invoke('mt', { ch, a })` — `ch`는 Electron IPC 채널 이름. 창·대화상자·클립보드·팝업·드롭다운·세션 이동 채널은 Rust가 처리하고, 나머지는 Node 호스트로 전달(호출한 창 label 포함)
- 이벤트: Rust가 `mt:<label>` 이벤트로 `{ ch, p }`를 보내면 채널별 리스너로 분배
- 리스너를 등록한 뒤의 호출은 등록이 끝난 다음 나갑니다(팝업이 init 메시지를 놓치지 않도록)
- 숨겨진 웹뷰에서는 애니메이션 프레임이 돌지 않으므로, 숨김 상태에서 예약된 `requestAnimationFrame`은 타이머로도 실행(팝업·드롭다운 측정)

노출 API(요약): 창(`minimize`/`maximize`/`close`/`quitApp`/`setMinSize`/`resizeWindowBy`/`setWindowOpacity`…), 설정(`getSettings`/`setSettings`), PTY(`ptyStart`/`ptyWrite`/`ptyResize`/`ptyKill` + `pty:data`/`pty:exit`), SSH, 프롬프트, 명령 셸 목록, 배경 이미지, 팝업, 드롭다운, 앱 정보(`getAppInfo`: 버전·플랫폼·Tauri·웹뷰·Node.js·OS·빌드 날짜), 세션 분리/합치기.

### 3.3 Node 호스트

- 줄 프로토콜(`rpc.js`): 요청 `{t:'req', id, win, m, a}` → 응답 `{t:'res', …}`; 창 이벤트 `{t:'emit', win, ch, p}`; 프로그램에 요청 `{t:'call', m, a}`(가상 터미널·이미지·트레이·파일 열기·오류 표시); 가상 터미널 출력 `{t:'pty', id, ev:'data'|'exit'}`
- 세션 코드(MyShell·SshSession·pty-manager)는 Electron 판 그대로이며, `win`은 `windows.js`의 대역(`isDestroyed()`, `webContents.send()` → `emit`)
- 창이 닫히면 프로그램이 `win-closed`를 보내 그 창의 세션을 정리
- stdout은 프로토콜 전용(`console.log`는 stderr로)

### 3.4 Renderer

- **SessionManager**: 탭·팬 생성/활성화/닫기/드래그 분리. `pty:exit` 시 탭 닫기(마지막이면 앱 종료)
- **TerminalPane**: `@xterm/xterm` + Fit / WebLinks / Serialize 애드온. 우클릭 컨텍스트 메뉴(복사·전체 복사·붙여넣기·모두 선택·지우기·글꼴·스크롤) — 툴바에는 지우기/복사/붙여넣기 버튼이 없습니다
- **툴바**: 원격·프롬프트(설정)·프롬프트 순환·Git 표시·글꼴·글자색·투명도·배경 표시 | (오른쪽 정렬) 테마 순환·테마 선택·언어·설정·About·창 버튼
- **I18n**: JSON을 번들에 포함, DOM `data-i18n*` 갱신
- **테마·배경**: CSS 변수 + xterm theme + `--bg-image` / fit 모드
- **설정 팝업**: 아홉 탭. 모든 탭 패널이 하나의 grid 셀을 공유해 본문 높이 = 가장 긴 탭 → 창을 한 번 맞춘 뒤 고정, 내부 스크롤 없음

## 4. 세션 모델

```
SessionManager
  └─ Map<sessionId, TerminalPane>
        ├─ mode: 'local' | 'ssh'
        ├─ xterm Terminal
        └─ backend: MyShell (host) | SSH (host) | WebShell (renderer)
```

### 로컬

1. Renderer `ptyStart({ sessionId, cols, rows, promptConfig, promptGitMode })`
2. 호스트 `createPty` → MyShell 인스턴스(소유 창 = 호출한 창 label)
3. 출력: MyShell `pty:data` → 프로그램 → 창 → `term.write`
4. 입력: `ptyWrite` → MyShell. 외부 프로그램 실행 중이면 입력은 그 프로그램의 가상 터미널로(Ctrl+C 제외)
5. 종료: `exit`/`quit` → `pty:exit` → 탭 닫기. 마지막 탭이면 `quitApp`

### 외부 프로그램 (가상 터미널)

`MyShell.cmdRun` → `buildShellSpawn(shell, line)` → `pty-process.spawnPty` → 프로그램 `pty.spawn`(Windows는 Node와 같은 규칙으로 만든 명령줄) → 출력은 UTF-8 그대로(진행 막대·커서 이동 포함) 전달, 종료 코드는 `[exit N]`. Ctrl+C는 `taskkill /t /f`(Unix: 프로세스 그룹 SIGTERM)로 트리를 끝내고 바로 프롬프트를 그리며, 그 뒤 도착하는 출력은 버립니다. 자식 환경에는 `TERM=xterm-256color`, `COLORTERM=truecolor`가 없으면 넣습니다.

### SSH

1. Renderer SSH 모달 → `sshConnect`
2. 호스트 `ssh-session`이 해당 sessionId 백엔드를 원격 셸로 교체
3. 연결 해제 시 로컬 모드로 복귀

### Web

- 호스트 없이 `WebShell`이 가상 파일시스템/명령 일부를 제공

### 창 분리 (Detach) / 합치기 (Merge)

1. **분리**: 탭을 창 밖으로 드래그 → `session:detach` → 호스트 `session:stashAdopt` → 새 창(`?adopt=`) → 호스트 `session:reattach`(세션 소유 창 변경) → 원래 창에 `session:detached`
2. **합치기**: 탭을 다른 창 위로 드래그 → `window:findAtPoint`(커서 위치의 다른 창, 최근 포커스 순) → 대상 탭 바에 가상 탭 미리보기 → `session:attach` → 대상 창에 `session:adopt`. 원래 창에 세션이 남지 않으면 그 창을 닫음

## 5. 설정·테마 데이터

설정 파일: 사용자 데이터 폴더(`%APPDATA%\MyTerminal`, `~/Library/Application Support/MyTerminal`, `~/.config/MyTerminal` — Electron 판과 같은 위치)의 `settings.json`. 호스트만 쓰며(임시 파일 후 이름 바꾸기), 렌더러 저장은 머지됩니다.

| 키 | 의미 |
|----|------|
| `themeId` | 내장 40개 테마(다크 20 · 라이트 20) 또는 사용자 정의 테마(`user-…`) 중 하나 |
| `themeOverrides` | 내장 테마별 사용자 색 `{ [themeId]: { background, accent, … } }` — 테마 원색과 다른 키만 저장 |
| `customThemes` | **사용자 정의 테마** `[{ id: 'user-…', name, kind: 'dark'\|'light', base, colors }]` (최대 40개). `withCustomThemes`가 내장 테마 맵 뒤에 붙여 렌더러·팝업이 같은 맵을 씁니다(`userTheme: true`, 메뉴 이름 = `name`). 색상 탭 편집은 오버라이드가 아니라 그 테마의 `colors`를 바꿉니다. 삭제하면 `base` 테마로 돌아감 |
| `custom` | 현재 테마 + 오버라이드의 유효 색(팝업 테마·프롬프트 색 참조용, 파생값) |
| `sshProfiles` | SSH 호스트 프로필 `[{ id, name, host, port, username, privateKey }]` (비밀번호 없음) |
| `terminalProfiles` | 터미널 프로필 `[{ id, name, cols, rows, fontId, fontSize, scrollback, shellId }]` |
| `termCols` / `termRows` | 기본 터미널 크기(120 × 25) — 첫 실행(`firstLaunch`) 시 창을 맞춤 |
| `lang` | `en` \| `ko` |
| `fontSize` / `fontId` | 글꼴 |
| `scrollback` | 스크롤 기억 줄 수 (기본 10000) |
| `showStatusBar` | 상태바 표시 |
| `showTrayIcon` | 시스템 트레이 아이콘 (설치 프로그램의 질문 → 프로그램 폴더의 `installer-options.json`으로 첫 실행 때 시드) |
| `bgTransparency` | **창 전체 투명도** 0–100 (최소 불투명도 0.2) |
| `bgImageTransparency` | **배경 이미지** 투명도 0–100 |
| `backgroundImage` / `backgroundImageId` / `backgroundLibrary` / `backgroundFit` | 배경 이미지와 표시 방식 |
| `promptConfig` / `promptPresetId` / `promptGitMode` / `promptTheme` / `customPrompts` | 프롬프트 |
| `shellId` / `shellCustomPath` | 명령 셸 |
| `windowBounds` / `windowMaximized` | 창 위치·크기 (프로그램이 저장) |
| `ssh` | 최근 SSH 호스트 정보(비밀번호 제외) |

배경 이미지는 CSS `background-image`(데이터 URL)로 그려집니다. 긴 변 2560px를 넘는 PNG/JPEG/WebP/BMP는 Rust(`images.rs`)가 표시용으로 축소(PNG는 PNG, 나머지는 JPEG 85)하고, GIF·SVG·AVIF·ICO는 그대로 둡니다. TIFF는 가져올 때 `utif`로 풀어 Rust가 PNG로 저장합니다.

### 5.1 프롬프트 파이프라인

```
settings › prompt (renderer)            host
  prompt-editor.js ── config ──▶ pty-manager.setPromptTemplate({ config, gitMode })
        │                             └▶ MyShell.setPromptConfig / setPromptGitMode
        ▼                                     └▶ prompt(): prompt.js promptState(cwd, git status, rc, ms …)
  renderPromptHtml (미리보기)                        └▶ prompt-core.renderPromptAnsi → xterm
```

- git 상태는 `git status --porcelain=v2 --branch --show-stash` 한 번으로 얻고 1.5초 캐시합니다. 호스트를 막지 않도록 `gitStatus()`는 캐시만 돌려주고 백그라운드로 갱신하며, MyShell은 결과가 오면 프롬프트를 제자리에서 다시 그립니다. 캐시 키는 `path.resolve`한 경로입니다.

### 5.2 명령 셸

`MyShell.cmdRun`은 내장 명령이 아닌 줄을 `shells.buildShellSpawn(shell, line)`으로 실행합니다 — cmd는 `/d /s /c "<line>"`(토큰 재인용, 명령줄 그대로), PowerShell은 `-NoProfile -Command <line>`, POSIX 셸은 `-c <line>`, WSL은 `-e sh -c <line>`. 탭 바 `+ ▾`로 연 탭은 자기 셸을 유지합니다.

### 5.3 오류 창

`src/shared/error-format.js`의 `describeError`가 `{ message, details }`를 만들고, 렌더러의 `error-dialog.js`가 팝업(kind `error`)으로 보여 줍니다. 경로: 렌더러 예외 → 직접; 팝업 예외 → `app:reportError` → 소유 창 `app:error`; 호스트 예외·셸 실행 실패 → 프로그램 `reportError` → 포커스된 창 `app:error`; 호스트 프로세스가 갑자기 끝나면 모든 창에 오류 표시.

### 5.4 파워라인 화살표

`scripts/patch-xterm-powerline-aa.js`가 xterm 애드온에 두 셀짜리 화살표 글리프(U+E0D0/U+E0D1)를 추가합니다(`build-tauri-web.js`가 실행).

## 6. UI 구성

```
#app
├── #toolbar          (브랜드, 액션 | 스페이서 | 테마, 언어, 설정, About, 창 버튼)
├── #tab-bar
├── #terminal-panes   (배경색/이미지 레이어 + xterm panes)
└── #status-bar
```

- 드롭다운(글꼴/테마/배경 fit/셸)은 데스크톱에서 별도 창으로 열려 메인 창 밖으로 나갈 수 있습니다. 테마 드롭다운: 내장 테마 → "사용자 정의 테마" 그룹 → **사용자 정의 테마 만들기…**(현재 색으로 새 테마를 만들고 설정의 색상 탭을 엶) · **테마 설정…**(설정의 테마 탭). 항목의 `data-action`은 드롭다운 창에서 그대로 소유 창으로 돌아옵니다.
- 설정 › 테마 탭: 다크/라이트 상자(한 줄 7개) + 사용자 정의 상자(한 줄, 넘치면 상자 안 스크롤) + 이름·새 테마·이름 바꾸기·삭제 줄. 창 높이는 그대로입니다.
- 창 최소 폭은 툴바 콘텐츠 폭을 측정해 `window:setMinSize`로 반영합니다.

## 7. 빌드 파이프라인

| 스크립트 | 결과 |
|----------|------|
| `scripts/build-renderer.js` | `app.js` → `app.bundle.js`, `popup-app.js` → `popup.bundle.js` (esbuild IIFE) |
| `scripts/build-tauri-web.js` | `dist/web`(페이지; `node_modules` 대신 `vendor/xterm.css`), `dist/sidecar/host.js`(esbuild로 호스트 + ssh2 + utif 한 파일), `--release`면 Node 런타임 복사 |
| `npm start` | `tauri dev` |
| `npm run build:debug` | `src-tauri/target/debug/MyTerminal.exe` (페이지 내장, `src/host` 사용) — 스모크용 |
| `npm run build:win` / `build:mac` / `build:linux` / `build:all` | 설치 파일 → 프로젝트 루트로 복사 |
| `scripts/build-web.js` | `web-dist/` 정적 사이트 |

## 8. 보안 경계

- Renderer는 `mt` 명령과 이벤트 수신(`core:event:default`)만 사용 (`capabilities/default.json`)
- 페이지 CSP: `default-src 'self'`(+ IPC용 `connect-src ipc:`), 인라인 스타일·data 이미지 허용
- 창 안 이동은 앱 페이지만 허용, 다른 http(s) 링크는 기본 브라우저로
- `shell:openExternal`은 `http(s)`만 허용
- SSH 비밀번호는 설정 파일에 저장하지 않음

## 9. 확장 시 유의점

1. **새 툴바 액션**: `index.html` + `app.js` bind + i18n 키 + 최소 폭 재측정
2. **새 셸 명령**: `src/host/myshell.js` (및 Web이면 `web-shell.js`)
3. **새 설정 항목**: persist 키, 설정 UI, 즉시 적용 핸들러, boot 시 복원 (호스트 `settings.js`의 정리 규칙)
4. **새 채널**: 창·OS 기능이면 `lib.rs`의 `mt` match, 아니면 `host.js`의 `rpc.handle` → `tauri-bridge.js`에 노출
5. **확인**: `npm test`(JS + Rust), `npm run build:debug && npm run smoke`

## 10. 관련 문서

- [README.md](./README.md) — 설치·실행
- [UsersGuide.md](./UsersGuide.md) — 사용자 기능 설명
