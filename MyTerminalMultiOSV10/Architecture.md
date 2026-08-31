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
    myshell.js        # 자체 로컬 셸
    ssh-session.js    # ssh2 원격 세션
    prompt.js         # 프롬프트 템플릿/프리셋
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
      modals.js       # 팝업 뷰(설정/프롬프트/SSH/About)
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
  shared/             # 레거시/공유 복사본(일부 스크립트용)
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
- 프롬프트: `getPromptPresets` / `setPrompt`
- 배경: `pickBackgroundImage` / `listBackgroundImages` / `selectBackgroundImage` / `loadBackgroundImage` / `removeBackgroundImage` / `clearBackgroundImage`
- 팝업: `openPopup` / `closePopup` / `showPopup` / `fitPopup` / `popupSend`
- 앱 정보: `getAppInfo`(About의 버전·플랫폼·**빌드 정보**: Electron/Chromium/Node/OS/빌드 날짜)
- 세션: `detachSession` / `takeAdopt`

### 3.3 Renderer

- **SessionManager**: 탭·팬 생성/활성화/닫기/드래그 분리. `pty:exit` 시 탭 닫기(마지막이면 앱 종료)
- **TerminalPane**: `@xterm/xterm` + Fit / WebLinks / Serialize 애드온. 우클릭 컨텍스트 메뉴(아이콘 + 항목 + 단축키)
- **I18n**: JSON을 번들에 포함, DOM `data-i18n*` 갱신. 툴팁은 커스텀 툴팁 하나만 사용(네이티브 `title` 미설정 — 중복 방지)
- **테마·배경**: CSS 변수 + xterm theme + `--bg-image` / fit 모드. 창 투명도는 별도 `setWindowOpacity`
- **설정 모달**: 스크롤백, 상태바, 색상, 배경 이미지/표시 방식 — 변경 즉시 적용·저장
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

1. Renderer `ptyStart({ sessionId, cols, rows, promptTemplate })`
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
| `themeId` / `custom` | 테마 및 사용자 색상 |
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
| `promptTemplate` | 셸 프롬프트 |
| `ssh` | 최근 SSH 호스트 정보(비밀번호 제외) |

배경 표시 모드 정의: `src/renderer/js/background-fit.js`

> 배경 이미지는 CSS `background-image`(데이터 URL)로 그려지므로 **전용 GPU가 필요 없고**(내장 GPU·소프트웨어 렌더링에서도 표시), Windows/macOS/Linux에서 동일하게 동작합니다. 대용량·초고해상도 이미지는 표시용으로 긴 변 2560px까지 축소해 GPU 텍스처 한계와 과도한 데이터 URL 크기를 회피합니다.

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
