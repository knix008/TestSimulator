# CaptureMaster 아키텍처

## 1. 개요

CaptureMaster 는 Electron 위에서 도는 React 애플리케이션입니다. 코드는 세 층으로 나뉩니다.

```
┌──────────────────────────── main process (electron/) ────────────────────────────┐
│ main.js      창 생명주기, cm-media:// 프로토콜, 종료 흐름, 재설치 감지, 오류 전달   │
│ ipc.js       파일 I/O(진행률), 네이티브 대화상자, 클립보드, 인쇄, 녹화 싱크, 창 제어 │
│ dialogs.js   독립 다이얼로그 창의 생성·페이로드·결과 라우팅                        │
│ capture.js   desktopCapturer: 소스 목록, 화면 스틸(물리 해상도), 디스플레이 정보    │
│ preload.js   contextBridge → window.electronAPI (renderer 가 보는 유일한 API)      │
└────────────────────────────────────────┬─────────────────────────────────────────┘
                                         │ IPC (invoke / send)
┌────────────────────────────────────────┴─────────────────────────────────────────┐
│ renderer (src/)                                                                   │
│  main.jsx ─┬─ App.jsx        메인 창: 상태·문서·캡처·녹화·파일·클립보드·단축키     │
│            └─ DialogHost.jsx  #dialog=<name> 로 열린 창: 다이얼로그 하나만 렌더     │
│  lib/platform.js  Electron 이면 electronAPI, 아니면 웹 API 로 같은 인터페이스 제공  │
│  lib/*            순수 로직(문서 모델, 히스토리, 렌더링, 설정, 캡처 스트림)          │
│  components/, dialogs/   UI                                                       │
└──────────────────────────────────────────────────────────────────────────────────┘
```

원칙:

- **renderer 는 Node 를 모른다.** `contextIsolation: true`, `nodeIntegration: false`. 필요한 동작은 모두 `preload.js` 의 좁은 함수로 노출되고, `lib/platform.js` 가 그것을 감싼다. 브라우저에서 `npm run web` 으로 열면 같은 UI 가 웹 API(getDisplayMedia, localStorage, 다운로드, 페이지 내 모달)로 동작한다.
- **한 번들, 두 역할.** `dist/index.html` 을 해시 없이 열면 App, `#dialog=settings` 처럼 열면 DialogHost 가 뜬다. 다이얼로그 컴포넌트는 자기가 별도 창인지 페이지 내 모달인지 `standalone` 프롭으로만 안다.
- **순수 로직은 DOM 없이 테스트된다.** `lib/document.js`, `history.js`, `settings.js`, `themes.js`, `ico.mjs` 는 `node --test` 로 검증한다.

## 2. 프로세스 간 통신

`preload.js` 는 채널 이름을 그대로 노출하지 않고 의미 있는 함수로 묶는다(`electronAPI.fs.readBinary`, `electronAPI.dialogs.open` …). 모든 요청은 `ipcRenderer.invoke`(Promise) 이고, 주 → 렌더러 방향의 알림은 다섯 개뿐이다.

| 채널 (main → renderer) | 의미 |
|---|---|
| `task:progress {id, done, total}` | 긴 읽기/쓰기/다운로드의 진행 틱 |
| `app:closeRequested` | 창을 닫으려 함 — 렌더러가 저장 여부를 물은 뒤 `app:quit` 로 응답 |
| `app:openPath` | 셸(파일 연결, 두 번째 인스턴스, macOS open-file)에서 넘어온 파일 |
| `app:mainError` | 메인 프로세스의 uncaughtException / unhandledRejection |
| `dialog:result / closed / payload / appearance` | 다이얼로그 창 라우팅 (3절) |

긴 작업의 진행률: 주 프로세스가 스트림 단위로 `task:progress` 를 보내고, 렌더러의 `withProgress()`(App.jsx) 가 250 ms 이상 걸릴 때만 진행률 창을 열어 갱신한다. 렌더러 안에서 도는 작업(인쇄용 렌더링)은 `emitProgress()` 로 같은 경로에 틱을 넣는다.

## 3. 독립 다이얼로그 창

요구사항 "팝업은 메인 창과 독립적이되, 메인 창을 닫으면 함께 종료" 를 위해 모든 팝업은 `BrowserWindow` 다.

```
renderer(App)                    main(dialogs.js)                   renderer(DialogHost)
ask('print', payload) ──invoke──▶ dialog:openWindow
                                  new BrowserWindow(parent=main,      loadFile(index.html#dialog=print)
                                    frame:false, show:false)  ─────▶ getPayload() ─▶ applyAppearance, render
                                                              ◀───── dialog:ready  (첫 프레임 그려짐)
                                  win.setOpacity(0); show(); 50ms 뒤 opacity 1   ← Windows 의 흰 프레임 회피
                                                              ◀───── dialog:submit {name, data}
   ◀── dialog:result {name,data} ─┘
   (창이 그냥 닫히면 data:null 로 result + closed)
```

- `name` 은 `error#3` 처럼 `#접미사` 로 여러 인스턴스를 구분한다. 접미사 앞부분이 크기 스펙(`DIALOG_SPECS`)과 컴포넌트를 고른다.
- `keepOpen` 결과: 설정 창은 값이 바뀔 때마다, 녹화 컨트롤 창은 버튼마다 결과를 보내고 열린 채로 있다. App.jsx 의 `handlers.current.settingsMessage / recorderAction` 이 받는다.
- `dialog:update` 로 여는 쪽이 새 페이로드를 밀어 넣는다(진행률, 녹화 경과 시간, 설정 초기화).
- `dialog:broadcastAppearance` 로 테마·언어·글꼴 변경이 열린 모든 창에 즉시 반영된다.
- 메인 창의 `closed` 에서 `closeAllDialogWindows()`. `parent` 를 준 창은 Electron 이 함께 파괴하지만, 녹화 컨트롤(`detached`)과 영역 오버레이(`overlay`)는 부모 없이 만들므로 명시적으로 닫는다.
- 영역 오버레이는 디스플레이 하나를 정확히 덮는 always-on-top(`screen-saver`) 창이다. 스크린샷 dataURL 을 페이로드로 받고, `<img>` 가 로드된 뒤에야 `dialog:ready` 를 보내므로 검은 화면이 먼저 보이지 않는다.

웹 폴백: `lib/dialogBus.js` 가 같은 open/update/submit/close/result 이벤트를 페이지 안에서 흉내 내고, `InPageDialogs`(DialogHost.jsx) 가 모달로 그린다.

## 4. 캡처 파이프라인

| 종류 | 경로 | 이유 |
|---|---|---|
| 화면 | main `capture.js grabScreen` → `desktopCapturer.getSources({thumbnailSize: 디스플레이 물리 크기})` | 요청 크기와 같은 크기의 썸네일은 1:1 스크린샷이다 |
| 창 | renderer `lib/capture.js grabSourceFrame` → `getUserMedia({chromeMediaSourceId})` → `<video>` 첫 프레임 → canvas | desktopCapturer 는 작은 창을 요청 크기로 **늘려** 버리지만, 스트림 프레임은 창의 실제 픽셀 크기로 온다 |
| 영역 | 화면 스틸 → `region` 오버레이 창 → 좌표(이미지 픽셀) → renderer `cropImage` | |

공통 흐름(App.jsx `performCapture`): 지연 카운트다운 → (설정 시) 메인·다이얼로그 창 숨김 → 300–450 ms 대기(컴포지터) → 그랩 → 창 복원 → PNG 정규화 → 새 문서 탭 → 알림/클립보드.

Linux Wayland 는 `WebRTCPipeWireCapturer` 를 켜 두어 포털을 통해 같은 API 가 동작한다.

## 5. 녹화 파이프라인

```
getUserMedia(desktop video [+ desktop audio(Win)])  ─┐
getUserMedia(mic)  ──────────────────────────────────┴─▶ AudioContext 로 믹스 ─▶ MediaRecorder(1 s timeslice)
        chunk(Blob) ─▶ arrayBuffer ─▶ rec:append(sinkId, bytes) ─▶ fs.WriteStream   (main, ipc.js)
stop ─▶ recorder.stop() ─▶ 큐 drain ─▶ rec:close ─▶ 동영상 문서 탭 (cm-media:// 로 재생)
```

- 파일 경로는 첫 프레임 전에 정한다(설정: 저장 위치 묻기 / 녹화 폴더 / 내 비디오).
- `cm-media://local/<encoded path>` 프로토콜(main.js)이 Range 요청을 지원해 `<video>` 탐색이 된다. MediaRecorder 가 만든 WebM 은 길이 메타데이터가 없어서 `VideoView` 가 첫 로드에서 끝까지 seek 해 길이를 채운다.
- 형식은 `MediaRecorder.isTypeSupported` 로 탐색한 것 중에서 고른다(자동 = WebM/VP9 우선).

## 6. 문서 모델과 편집

```
doc = { id, kind:'image'|'video', name, path, dir, source,
        history: { past:[], present:{ image:{dataUrl,width,height}, annotations:[] }, future:[] },
        savedPresent, zoom, fitRequested, selection, selectedId, nextNumber }
```

- **불변 상태 + 히스토리.** `present` 는 절대 변경하지 않고 새 객체를 `push` 한다. `isDirty = present !== savedPresent`. 이미지 dataURL 은 상태 간에 참조 공유되므로 100단계 히스토리도 가볍다(자르기만 새 이미지를 만든다).
- **한 제스처 = 한 히스토리 항목.** `Editor.jsx` 는 드래그 중에는 자기 ref 에만 미리보기를 두고 캔버스를 다시 그리며, pointerup 에서 한 번 `onCommit` 한다.
- **렌더러 하나.** `lib/render.js drawAnnotation / renderToCanvas` 를 편집 캔버스, 클립보드, 내보내기, 인쇄가 모두 쓴다. 모자이크는 원본 이미지에서 샘플링해 그리므로 비파괴적이다.
- 히트 테스트는 선/펜은 거리, 상자형은 경계(채우지 않은 상자는 테두리만)로 한다.
- 큰 이미지의 고배율 확대는 백킹 스토어를 16k px / 1.2e8 px 로 클램프한다(`backingScale`).
- `.cmcap` = JSON `{format:'capturemaster-capture', version, image, annotations, …}`. `parseCapture` 가 형식·버전·이미지 유무를 검사하고 사람이 읽을 수 있는 오류를 낸다.

## 7. 설정과 지속성

- 설정은 하나의 객체(`lib/settings.js DEFAULT_SETTINGS`)로, `normalizeSettings` 가 어떤 입력(옛 버전, 손으로 고친 파일, null)도 필드 단위로 안전하게 만든다.
- 저장 위치: Electron 은 `userData/settings.json`(원자적 쓰기: tmp → rename), 웹은 localStorage. 변경 300 ms 후 자동 저장.
- 창 위치/크기/최대화는 `window-state.json`(main.js), 연결된 모니터 안에 있을 때만 복원.
- 재설치 감지(macOS/Linux): `install-stamp.json` 에 실행 파일 경로·mtime·버전을 기록해 두고, 달라졌는데 settings.json 이 있으면 렌더러가 삭제 여부를 묻는다. Windows 는 `build/installer.nsh` 가 설치 시점에 묻는다.
- `CM_USER_DATA` 환경 변수(개발 실행 전용)는 프로필 폴더를 바꿔 준다 — smoke 테스트가 실행 중인 앱과 충돌하지 않는 이유.

## 8. 테마 · 폰트 · 언어

- 테마는 `themes.js` 의 토큰 맵 16개. `applyTheme` 이 `:root` 의 CSS 변수를 바꾸므로 컴포넌트는 테마를 모른다. 다이얼로그 창은 페이로드의 `appearance`(theme, bg, language, font)로 첫 렌더부터 같은 모습이며, `BrowserWindow.backgroundColor` 도 테마 배경색으로 만든다.
- UI 폰트는 `--ui-font*` 변수. 설치된 글꼴 목록은 `queryLocalFonts()`(main.js 가 `local-fonts` 권한 허용), 실패하면 `FALLBACK_FONTS`.
- 언어는 i18next(`src/i18n.js`, ko/en). 툴바 🌐 버튼과 설정 모두 `settings.language` 를 바꾸고, 효과에서 `i18n.changeLanguage` + `<html lang>` + 다이얼로그 브로드캐스트가 일어난다.

## 9. 창 크기와 툴바

툴바(`Toolbar.jsx`)는 두 행의 자식 폭 합(마진 포함, 오른쪽 정렬용 spacer 제외)을 재서 `win:setMinWidth` 로 보내고, 시작 화면(`Welcome`)은 스크롤 없이 다 보이는 데 필요한 높이를 `win:setMinHeight` 로 보낸다. 언어·글꼴이 바뀔 때마다 다시 잰다. main 은 프레임 여백을 더해 최소 크기를 정하고, 창은 항상 최소 크기로 시작한다(생성 후 4초 동안은 측정값을 그대로 따라가고, 그 뒤로는 좁아질 때만 넓힌다). 그래서 어떤 설정에서도 버튼이 가려지지 않는다.

## 10. 종료 흐름

```
사용자 ✕ / Alt+F4 / Cmd+Q ─▶ main: close 이벤트 preventDefault ─▶ app:closeRequested
renderer: 녹화 중이면 취소 확인 ─▶ 수정된 문서가 있으면 저장/저장 안 함/취소 ─▶ 저장 ─▶ app:quit
main: state.quitting = true ─▶ 다이얼로그 창 모두 파괴 ─▶ win.close() ─▶ app.quit()
```

렌더러가 죽어 응답할 수 없으면(`isCrashed`) 묻지 않고 닫는다. 같은 요청이 겹치면(확인 창이 떠 있는데 다시 ✕) 두 번째는 무시한다.

## 11. 오류 처리

- 렌더러: 모든 사용자 동작은 try/catch 후 `reportError(err, 문맥)` → `error#<id>` 창. `window.onerror`, `unhandledrejection` 도 같은 곳으로. 렌더 자체가 실패하면 `ErrorBoundary` 가 복사 버튼이 있는 대체 화면을 그린다.
- 메인: `process.on('uncaughtException'/'unhandledRejection')` → `app:mainError` → 같은 창.
- 오류 창은 메시지·문맥·스택·버전·플랫폼을 보여 주고 "오류 내용 복사" 로 클립보드에 넣는다(`lib/errors.js errorToText`).

## 12. 빌드와 배포

- `scripts/generate-icons.mjs`: SVG → sharp 로 래스터 → 자체 ICO/ICNS 인코더(`src/lib/ico.mjs`). 앱 아이콘과 문서 아이콘 두 세트.
- `scripts/generate-build-info.mjs`: 버전·빌드 시각·커밋을 `src/build-info.json` 에 기록(정보 창이 표시). 패키지에는 `extraResources` 로도 들어간다.
- electron-builder 설정은 `package.json build`. `fileAssociations` 로 `.cmcap` 을 등록하고, Windows 는 `build/installer.nsh` 가 아이콘·동사·바로가기·데이터 질문을 보강한다. Linux `.deb` 는 `build/linux/after-install.sh` 로 shared-mime-info 와 아이콘을 등록한다.
- `scripts/copy-installer.js` 가 결과물을 프로젝트 루트로 복사한다.

## 13. 테스트

| 종류 | 명령 | 내용 |
|---|---|---|
| 단위 | `npm test` | history, settings 정규화/최근 목록, .cmcap 직렬화, 테마 토큰 무결성, ICO/ICNS 컨테이너 |
| 스모크 | `npm run smoke [이름]` | `scripts/smoke.mjs` 가 실제 Electron 을 별도 프로필로 띄우고 `test/smoke/*.js` 를 메인 창 안에서 실행(키/포인터 이벤트 합성). `--smoke-dialog-script` 는 다이얼로그 창 안에서 실행(영역 선택). 창마다 스크린샷을 `.smoke/` 에 남긴다 |

메인 프로세스의 스모크 훅(`--smoke-shot`, `--smoke-script`, `--smoke-dialog-script`, `--smoke-quit`)과 `window.__capturemaster` 개발 훅은 패키지된 빌드에서는 노출되지 않는다.
