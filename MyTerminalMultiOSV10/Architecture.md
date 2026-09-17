# MyTerminal Architecture

이 문서는 MyTerminal(v1.0.0)의 런타임 구조, 주요 모듈, IPC 경계, 설정·세션 흐름을 설명합니다.

## 1. 개요

MyTerminal은 **Electron 멀티 프로세스** 앱입니다.

| 계층 | 역할 |
|------|------|
| Main (`src/main`) | 창 관리, 설정 I/O, MyShell/SSH 세션, 파일 다이얼로그 |
| Preload (`src/preload`) | `contextBridge`로 안전한 API 노출 |
| Renderer (`src/renderer`) | 툴바·탭·모달·xterm UI, 테마/i18n |

Web 모드에서는 Main/Preload 없이 Renderer + `WebShell`이 동작합니다.

```
┌─────────────────────────────────────────────┐
│                 Renderer                     │
│  Toolbar / Tabs / Modals / xterm panes       │
│              app.bundle.js                   │
└───────────────────┬─────────────────────────┘
                    │ preload (myTerminal.*)
┌───────────────────▼─────────────────────────┐
│                   Main                       │
│  BrowserWindow · settings · dialogs          │
│  pty-manager → MyShell / SSH sessions        │
└─────────────────────────────────────────────┘
```

## 2. 디렉터리 구조

```
src/
  main/
    main.js           # 앱 진입, BrowserWindow, IPC 핸들러
    pty-manager.js    # 세션 맵, 소유 창, adopt/detach
    myshell.js        # 자체 로컬 셸 (내장 명령 + 명령 셸 위임)
    shells.js         # 명령 셸 카탈로그(cmd/PowerShell/Git Bash/WSL/bash/zsh…) · spawn 규칙
    ssh-session.js    # ssh2 원격 세션
    prompt.js         # git status(porcelain v2) · 프롬프트 상태 · ANSI 렌더
  preload/
    preload.js        # window.myTerminal API
  renderer/
    index.html
    popup.html        # 분리형 팝업(설정/프롬프트/SSH/About) 셸
    css/main.css, css/popup.css
    js/
      app.js          # UI 부트스트랩·설정·툴바
      session-manager.js
      terminal.js     # TerminalPane (xterm)
      modals.js       # 팝업 뷰(설정/SSH/About)
      settings-view.js  # 설정 본문(탭·고정 레이아웃) — 팝업/웹 모달 공용
      prompt-editor.js  # 프롬프트 테마 편집기(프리셋·간단 설정·고급 마스터-디테일)
      popup-app.js    # 팝업 창 부트스트랩
      popup-host.js   # 소유 창 ↔ 팝업 메시지 브리지
      tooltip.js      # 커스텀 툴팁
      themes.js
      fonts.js
      i18n.js
      background-fit.js
      ls-colors.js
      web-shell.js    # Web 모드 셸
      app.bundle.js / popup.bundle.js   # esbuild 산출물(생성)
    shared/
      i18n/           # en.json, ko.json
      themes/         # themes.json
  shared/
    prompt-core.js    # 프롬프트 엔진(세그먼트·Go 템플릿·프리셋·ANSI/HTML 렌더) — main/renderer/테스트 공용
    i18n/, themes/    # 레거시 복사본(일부 스크립트용)
test/                 # node:test 단위 테스트 (npm test)
scripts/smoke-settings.js  # 설정 창 스모크(Electron 기동, 탭별 스크롤 없음 검증, 셸 전환·프롬프트 적용, 스크린샷)
scripts/
  build-renderer.js   # esbuild 번들
  serve-web.js / build-web.js
  prepare-icons.js
```

## 3. 프로세스별 책임

### 3.1 Main

- **단일 인스턴스**: `app.requestSingleInstanceLock()` — 두 번째 실행은 종료하고 기존 창을 포커스(`second-instance`). userData/GPU 캐시 경합 방지
- **GPU 캐시**: `disable-gpu-shader-disk-cache` 스위치로 Windows의 셰이더 캐시 접근 오류(0x5) 억제
- **창**: 프레임리스, 투명 배경(`transparent: true`), 최소 폭은 툴바 실측값으로 갱신
- **창 투명도**: `window:setOpacity` → `win.setOpacity()`로 창 전체 불투명도 조절(최소 0.2)
- **설정**: `userData/settings.json` 읽기/쓰기(머지 저장 — 창 상태 보존)
- **배경 이미지**: `userData/backgrounds/`에 원본 저장·로드·삭제 (`background:*` IPC). 크기 제한 없음. 표시용 데이터 URL은 `nativeImage`로 긴 변 2560px까지 축소(대용량 CSS 데이터 URL 미표시 문제 회피). TIFF는 PNG로 변환
- **세션**: `pty-manager`가 sessionId → 셸/SSH 인스턴스와 소유 `BrowserWindow`를 관리
- **탭 분리**: `session:detach` → 새 창 + `adopt` 쿼리로 세션 UI 이전
- **종료**: 마지막 터미널 종료 시 `app:quit`로 트레이 숨김을 무시하고 강제 종료(`setQuitting` + `win.destroy()` + `app.quit()`)
- **팝업 창**: 설정/프롬프트/SSH/About는 분리형 `BrowserWindow`로 열림 — 콘텐츠 마운트·측정 후 `popup:show`로 표시(열림 시 깜빡임 방지)

### 3.2 Preload

`window.myTerminal`에 다음을 노출합니다(요약).

- 창: `minimize` / `maximize` / `close` / `quitApp` / `setMinSize` / `setWindowOpacity` …
- 설정: `getSettings` / `setSettings`
- PTY: `ptyStart` / `ptyWrite` / `ptyResize` / `ptyKill` + 이벤트(`pty:data` / `pty:exit`)
- SSH: `sshConnect` / `sshDisconnect` / `sshStatus`
- 프롬프트: `getPromptPresets` / `setPrompt({ config, gitMode })`
- 명령 셸: `listShells` (설치된 셸 목록·기본값)
- 팝업 크기 고정: `setPopupResizable`
- 배경: `pickBackgroundImage` / `listBackgroundImages` / `selectBackgroundImage` / `loadBackgroundImage` / `removeBackgroundImage` / `clearBackgroundImage`
- 팝업: `openPopup` / `closePopup` / `showPopup` / `fitPopup` / `popupSend`
- 앱 정보: `getAppInfo`(About의 버전·플랫폼·**빌드 정보**: Electron/Chromium/Node/OS/빌드 날짜)
- 세션: `detachSession` / `takeAdopt`

### 3.3 Renderer

- **SessionManager**: 탭·팬 생성/활성화/닫기/드래그 분리. `pty:exit` 시 탭 닫기(마지막이면 앱 종료)
- **TerminalPane**: `@xterm/xterm` + Fit / WebLinks / Serialize 애드온. 우클릭 컨텍스트 메뉴(아이콘 + 항목 + 단축키)
- **I18n**: JSON을 번들에 포함, DOM `data-i18n*` 갱신. 툴팁은 커스텀 툴팁 하나만 사용(네이티브 `title` 미설정 — 중복 방지)
- **테마·배경**: CSS 변수 + xterm theme + `--bg-image` / fit 모드. 창 투명도는 별도 `setWindowOpacity`
- **설정 팝업**: 아홉 탭(일반·터미널·글꼴·테마·색상·배경·SSH·프롬프트·프롬프트 편집). 모든 탭 패널이 하나의 grid 셀을 공유해 본문 높이 = 가장 긴 탭 → 창을 한 번 맞춘 뒤 `setResizable(false)`로 고정, 내부 스크롤 없음. 배경 라이브러리는 페이지(10장), SSH/터미널 프로필·세그먼트 목록은 고정 높이 박스 — 변경 즉시 적용·저장. 팝업은 소유 창이 닫히거나(트레이로 숨김 포함) 앱이 종료될 때 함께 닫히고, 이미 열린 팝업의 툴바 버튼을 다시 누르면 앞으로 가져옴(`popup:focus`)
- **팝업(`popup-app.js`)**: 설정/프롬프트/SSH/About 공용 셸. 제목줄에 종류별 아이콘 + 제목, 콘텐츠 측정 후 표시(깜빡임 방지), 버튼 아래 여백 최소화

## 4. 세션 모델

```
SessionManager
  └─ Map<sessionId, TerminalPane>
        ├─ mode: 'local' | 'ssh'
        ├─ xterm Terminal
        └─ backend: MyShell (main) | SSH (main) | WebShell (renderer)
```

### 로컬 (Electron)

1. Renderer `ptyStart({ sessionId, cols, rows, promptConfig, promptGitMode })`
2. Main `createPty` → MyShell 인스턴스
3. 출력: Main `pty:data` → Renderer `term.write`
4. 입력: Renderer `ptyWrite` → MyShell
5. 종료: `exit`/`quit` → MyShell `pty:exit` → Renderer가 해당 탭을 닫음(`close()`). 마지막 탭이면 `quitApp`로 앱 종료. (`TerminalPane.dispose()`는 xterm 해제 예외에도 중단되지 않도록 각 단계를 격리)

### SSH

1. Renderer SSH 모달 → `sshConnect`
2. Main `ssh-session`이 해당 sessionId 백엔드를 원격 셸로 교체
3. 연결 해제 시 로컬 모드로 복귀

### Web

- Main PTY 없이 `WebShell`이 가상 파일시스템/명령 일부를 제공

### 창 분리 (Detach) / 합치기 (Merge)

1. **분리**: 탭을 창 밖으로 드래그 → `session:detach` → 새 창 + `?adopt=`
2. **합치기**: 탭을 다른 MyTerminal 창 위로 드래그 → 대상 탭 바에 가상 탭 미리보기 → `session:attach` → 대상 창에 `session:adopt` 탭 추가 (마지막 탭이면 원본 창 닫힘)

## 5. 설정·테마 데이터

설정 키(요약):

| 키 | 의미 |
|----|------|
| `themeId` | 40개 테마(다크 20 · 라이트 20, `kind`) 중 하나 (`src/renderer/shared/themes/themes.json`; `test/settings-view.test.mjs`가 배경·강조색 유사 여부를 검사) |
| `themeOverrides` | 테마별 사용자 색 `{ [themeId]: { background, accent, … } }` — 테마 원색과 다른 키만 저장, 초기화는 현재 테마 항목만 삭제 |
| `custom` | 현재 테마 + 오버라이드의 유효 색(팝업 테마·프롬프트 색 참조용, 파생값) |
| `sshProfiles` | SSH 호스트 프로필 `[{ id, name, host, port, username, privateKey }]` (비밀번호 없음) |
| `terminalProfiles` | 터미널 프로필 `[{ id, name, cols, rows, fontId, fontSize, scrollback, shellId }]` — 적용 시 `window:resizeBy`로 창을 셀 단위로 키워/줄여 열×행을 맞춤 |
| `termCols` / `termRows` | 기본 터미널 크기(120 × 25) — 첫 실행(`app:getInfo().firstLaunch`) 시 창을 맞춤 |
| `lang` | `en` \| `ko` |
| `fontSize` / `fontId` | 글꼴 |
| `scrollback` | 스크롤 기억 줄 수 (기본 10000) |
| `showStatusBar` | 상태바 표시 |
| `showTrayIcon` | 시스템 트레이 아이콘 (설치 시 `resources/installer-options.json`으로 시드 가능) |
| `bgTransparency` | **창 전체 투명도** 0–100 (`win.setOpacity`로 적용, 최소 불투명도 0.2) |
| `bgImageTransparency` | **배경 이미지** 투명도 0–100 (설정 창의 슬라이더, 창 투명도와 독립) |
| `backgroundImage` | Electron: `"file"`, Web: data URL |
| `backgroundImageId` / `backgroundLibrary` | 배경 이미지 라이브러리 선택/목록 |
| `backgroundFit` | `cover` \| `contain` \| `stretch` \| `center` \| `tile` \| `none` |
| `promptConfig` | 프롬프트 테마(세그먼트 설정; `shared/prompt-core.js` 형식) |
| `promptPresetId` | 수정하지 않은 프리셋이면 그 id, 아니면 빈 문자열 |
| `promptGitMode` | `off` \| `branch` \| `status` (툴바 Git 토글) |
| `promptTheme` | 프롬프트의 `accent`/`foreground`/`background` 색 참조용 테마 색 |
| `customPrompts` | 사용자 정의 프롬프트 `[{ id, label, config }]` |
| `shellId` / `shellCustomPath` | 명령 셸 (`cmd` \| `powershell` \| `pwsh` \| `gitbash` \| `wsl` \| `bash` … \| `custom`) |
| `ssh` | 최근 SSH 호스트 정보(비밀번호 제외) |

배경 표시 모드 정의: `src/renderer/js/background-fit.js`

> 배경 이미지는 CSS `background-image`(데이터 URL)로 그려지므로 **전용 GPU가 필요 없고**(내장 GPU·소프트웨어 렌더링에서도 표시), Windows/macOS/Linux에서 동일하게 동작합니다. 대용량·초고해상도 이미지는 표시용으로 긴 변 2560px까지 축소해 GPU 텍스처 한계와 과도한 데이터 URL 크기를 회피합니다.

### 5.1 프롬프트 파이프라인

```
settings › prompt (renderer)            main
  prompt-editor.js ── config ──▶ pty-manager.setPromptTemplate({ config, gitMode })
        │                             └▶ MyShell.setPromptConfig / setPromptGitMode
        ▼                                     └▶ prompt(): prompt.js promptState(cwd, git status, rc, ms …)
  renderPromptHtml (미리보기)                        └▶ prompt-core.renderPromptAnsi → xterm (24-bit 색, U+E0B0/E0B4/E0B6 글리프)
```

- `prompt-core.js`는 Command Center의 프롬프트 엔진을 이식한 것으로, 세그먼트 컨텍스트(`.Path`, `.Branch`, `.Working.Changed` …)와 Go 템플릿 부분집합을 구현합니다.
- git 상태는 `git status --porcelain=v2 --branch --show-stash` 한 번으로 얻고 1.5초 캐시합니다. **메인 프로세스를 막지 않도록** `gitStatus()`는 캐시만 돌려주고(없으면 `{ repo:false, pending:true }`) 백그라운드 `execFile`로 갱신하며, MyShell은 결과가 오면 프롬프트를 제자리에서 다시 그립니다(`armPromptRefresh`). 큰 저장소에서 새 탭이 느려지던 원인이었습니다.
- Web 모드의 `WebShell`도 같은 엔진으로 프롬프트를 그립니다(가상 FS라 git 세그먼트는 숨김).

### 5.2 명령 셸

`MyShell.cmdRun`은 내장 명령이 아닌 줄을 `shells.buildShellSpawn(shell, line)`으로 실행합니다 — cmd는 `/d /s /c "<line>"`(토큰 재인용), PowerShell은 `-NoProfile -Command <line>`, POSIX 셸은 `-c <line>`, WSL은 `-e sh -c <line>`. 셸 목록은 `shells.detectShells()`가 플랫폼별 후보 경로를 확인해 만들고, 설정(`shellId`)이 바뀌면 `pty-manager`가 기본 셸을 쓰는 로컬 세션에 즉시 반영합니다. 탭 바 `+ ▾` 메뉴로 연 탭은 `ptyStart({ shellId })`로 자기 셸을 지정하며(세션에 `shellId` 보관) 기본 셸 변경의 영향을 받지 않습니다.

### 5.3 오류 창

`src/shared/error-format.js`의 `describeError(err, { context })`가 `{ message, details }`(요약 + 스택/코드/경로)를 만들고, 렌더러의 `error-dialog.js`(`reportError`, `installGlobalErrorHandlers`)가 팝업(kind `error`) 또는 웹 모달로 보여 줍니다(복사 버튼 → 클립보드). 경로: 렌더러 `window.error`/`unhandledrejection` → 직접; 팝업 창의 예외 → `app:reportError` IPC → 소유 창 `app:error`; 메인 프로세스 `uncaughtException`/`unhandledRejection`과 MyShell의 셸 spawn 실패 → `app:error`; SSH 연결 실패·PTY 시작 실패·배경 이미지 실패 → 호출 지점에서 `reportError`. 같은 오류는 2초 안에 한 번만, 동시에 최대 3개.

### 5.3b 라이트 테마 가독성

`prompt-core.js`의 `ensureContrast(fg, bg, min)`(WCAG 대비비 계산, 색상은 유지하고 검정/흰색 쪽으로 섞음)을 `themes.js`의 `ensureReadableTheme`(ANSI 16색·강조색·전경색), `app.js`의 `effectiveLsColors`(ls 색), 프롬프트 렌더(배경 없는 세그먼트 글자색)에서 공통으로 씁니다. 밝은 배경에서는 xterm `fontWeight`를 600으로 올립니다.


### 5.3c 종료

마지막 터미널 창이 닫히면(`closed` 핸들러에서 `windows.size === 0` → `quitApp()`) 트레이 아이콘과 무관하게 종료합니다. `window-all-closed`에만 의존하지 않는 이유: 탭 분리(드래그) 중 만들어져 숨겨진 미리보기 창(`detach-preview.js`)이나 대화상자가 남아 있으면 그 이벤트가 영영 오지 않아 프로세스(와 `npm start`)가 남기 때문입니다. `quitApp()`은 트레이·팝업·미리보기 창을 지우고 `killPty()`로 셸을 정리한 뒤 `app.quit()`합니다. `MyShell.killChild()`는 Windows에서 `taskkill /t /f`를 **동기**로 실행합니다: 자식 프로세스(cmd → ping 등)가 Electron의 stdout 핸들을 상속받아 살아 있으면 `npm start`를 띄운 터미널이 앱 종료 후에도 프롬프트로 돌아오지 않기 때문입니다.


### 5.4 파워라인 화살표

xterm의 내장 파워라인 글리프(U+E0B0)는 한 셀 폭이라 끝이 짧습니다. `scripts/patch-xterm-powerline-aa.js`(prestart)가 xterm 애드온에 두 셀짜리 화살표 글리프 U+E0D0(왼쪽 절반) + U+E0D1(끝)을 추가하고, `prompt-core.renderPromptAnsi`가 세그먼트 끝에 이 쌍을 씁니다. 설정 미리보기의 화살표도 같은 폭(2ch)입니다.


## 6. UI 구성

```
#app
├── #toolbar          (브랜드, 액션, 창 전체 투명도, 배경 fit, 창 버튼)
├── #tab-bar
├── #terminal-panes   (배경색/이미지 레이어 + xterm panes)
└── #status-bar
```

- 드롭다운(글꼴/테마/언어/배경 fit)은 툴바 `overflow` 클리핑을 피하기 위해 열릴 때 `document.body`로 포털됩니다. 각 항목은 아이콘과 함께 표시됩니다(테마는 색상 스와치 + 글리프, 언어는 텍스트 배지).
- 창 최소 폭은 툴바 콘텐츠 폭을 측정해 `window:setMinSize`로 반영합니다.

## 7. 빌드 파이프라인

| 스크립트 | 결과 |
|----------|------|
| `scripts/build-renderer.js` | `app.js` → `app.bundle.js` (esbuild IIFE) |
| `scripts/prepare-icons.js` | `build/` 아이콘 |
| `npm run build:win` / `build:mac` / `build:linux` / `build:all` | `dist/` 플랫폼별 설치본 (선행: icons + renderer) |
| `scripts/build-web.js` | `web-dist/` 정적 사이트 |

`npm start` → `prestart` → renderer 번들 → Electron 기동.

## 8. 보안 경계

- `contextIsolation: true`, `nodeIntegration: false`
- Renderer는 preload API만 사용
- CSP: `default-src 'self'`, 인라인 스타일·data 이미지 허용
- `shell:openExternal`은 `http(s)`만 허용
- SSH 비밀번호는 설정 파일에 저장하지 않음

## 9. 확장 시 유의점

1. **새 툴바 액션**: `index.html` + `app.js` bind + i18n 키 + 최소 폭 재측정
2. **새 셸 명령**: `myshell.js` (및 Web이면 `web-shell.js`)
3. **새 설정 항목**: persist 키, 모달 UI, 즉시 적용 핸들러, boot 시 복원
4. **IPC 추가**: `main.js` handle → `preload.js` expose → Renderer 호출

## 10. 관련 문서

- [README.md](./README.md) — 설치·실행
- [UsersGuide.md](./UsersGuide.md) — 사용자 기능 설명
