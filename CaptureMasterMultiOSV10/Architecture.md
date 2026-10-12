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

공통 흐름(App.jsx `performCapture`): 지연 카운트다운 → (설정 시) 메인·다이얼로그 창 숨김 → 300–450 ms 대기(컴포지터) → 그랩 → 창 복원 → PNG 정규화 → 새 문서 탭 → 클립보드 → 자동 저장·기록(`recordCapture`) → 알림.

**자동 저장과 캡처 기록.** `recordCapture` 는 캡처를 설정의 이미지 형식으로 캡처 폴더(`paths.captureDir`, 비어 있으면 `내 사진/CaptureMaster`)에 `<문서 이름>.<확장자>` 로 쓴다(이름이 겹치면 ` (2)` …). PNG 는 캡처한 바이트를 그대로, 웹뷰가 못 만드는 형식은 데스크톱 쪽(`image_export`)에서 다시 인코딩한다. 저장된 경로는 문서의 `file` 에 두고 `savedPresent` 를 맞춰 손대지 않은 캡처는 "저장됨" 이 된다. 녹화는 이미 파일이므로 `recordRecording` 이 기록만 남긴다. 기록(`lib/captureHistory.js`)은 `{id, path, name, kind, source, width, height, bytes, time, thumb}` 의 목록(최신순, 최대 300개, 240px JPEG 썸네일)이며 설정과 따로 `userData/capture-history.json`(웹은 localStorage)에 저장한다. 기록에서 지우는 것은 목록 항목뿐이고 파일은 건드리지 않는다. 패널이 열릴 때 `fs_exists` 로 파일이 남아 있는지 확인해 없는 항목을 표시한다. 미디어 URL 은 다른 출처라 썸네일용 이미지·동영상은 `crossOrigin='anonymous'` 로 읽는다(그렇지 않으면 캔버스가 오염된다).

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
- **Tauri(WebView2) 의 화면·소리.** 화면 녹화는 `getDisplayMedia({video, audio: systemAudio})`, 창 녹화는 네이티브 창 프레임을 그린 캔버스 스트림에 시스템 소리만 따로(`getDisplayMedia` 의 오디오 트랙, 비디오 트랙은 바로 멈춤) 붙인다. WebView2 는 원래 이 요청마다 자체 화면 선택 창과 마이크 권한 창을 띄우므로, `lib.rs media_permissions()` 가 첫 웹뷰를 만들기 전에 `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` 에 `--use-fake-ui-for-media-stream`(선택 창 없이 허용: 화면 요청은 데스크톱 전체 + 시스템 소리)과 `--autoplay-policy=no-user-gesture-required`(소리를 섞는 AudioContext 가 사용자 클릭 없이도 돌도록)를 넣는다. 이 변수는 Tauri 가 넘기는 인자를 대신하므로 Tauri 의 기본 `--disable-features=…` 도 함께 넣는다. 앱은 자기 페이지만 열기 때문에 이 허용은 앱 자신의 요청에만 쓰인다. 데스크톱 전체가 여러 모니터에 걸치면 `monitorStream` 이 고른 모니터 영역(`list_sources` 의 물리 좌표 `bounds`)을 캔버스로 잘라 녹화한다. 시스템 소리를 얻지 못하면 소리 없이 다시 요청하고 `audioWarning` 으로 알린다.
- **시스템 소리 음량.** `video.systemAudioGain`(%) 을 `startRecording({systemAudioGain})` 이 시스템 소리 트랙마다 GainNode 로 적용한다(100% 이고 다른 소리가 없으면 트랙을 그대로 쓴다). 설정 창의 테스트는 `systemAudioStream` 으로 같은 소리를 받아 마이크 테스트와 같은 `useLevelMeter` 로 그린다.
- **마이크.** 설정의 `mic {deviceId, label, gain(%), echoCancellation, noiseSuppression, autoGainControl}` 을 `micOptions` 가 `startRecording` 의 `microphone` 옵션으로 바꾼다. `openMicrophone` 은 장치를 `deviceId: {ideal}` 로 요청해 빠진 장치는 기본 장치로 대신한다. 음량은 장치 제약이 아니라 AudioContext 의 GainNode 로 적용하므로, 마이크 하나뿐이어도 음량이 100% 가 아니면 믹스 경로를 탄다. 설정 창의 테스트는 같은 `openMicrophone` + GainNode + AnalyserNode 로 막대를 그리며, 장치·처리 옵션이 바뀌면 다시 열고 음량은 노드 값만 바꾼다. 장치 이름은 권한을 한 번 얻어야 보이므로 `listMicrophones` 가 이름이 비어 있으면 잠깐 마이크를 열었다 닫는다.
- **재생.** `VideoView` 는 브라우저 기본 컨트롤 대신 영상 아래 가운데의 `PlayerControls`(탐색 막대, 처음/−5초/재생/+5초/끝, 음량, 속도, 반복, 전체 화면)와 키보드 단축키를 쓴다. 단축키는 모달이 열려 있거나 입력 칸에 포커스가 있으면 무시한다.

## 6. 문서 모델과 편집

```
doc = { id, kind:'image'|'video', name, path, file, dir, source,
        history: { past:[], present:{ image:{dataUrl,width,height}, annotations:[] }, future:[] },
        savedPresent, zoom, autoFit, selection, selectedId, nextNumber }
```

- `path` 는 `.cmcap` 저장 위치, `file` 은 문서가 나온 그림 파일(자동 저장된 캡처, 디스크에서 연 그림)이다. 디스크에서 연 그림도 손대기 전에는 저장할 것이 없다.
- **창 맞춤 모드(`autoFit`).** 새 문서와 자르기 직후, `Ctrl+0` 에서 켜지며 켜져 있는 동안 `Editor` 가 ResizeObserver 로 보기 영역 크기에 맞춰 배율을 다시 계산한다(확대·축소 모두). 손으로 배율을 바꾸면(휠, `Ctrl+=`/`-`, `Ctrl+1`, 툴바) 꺼진다. 이미지와 동영상은 항상 보기 영역 가운데에 놓인다. 단추·메뉴로 바꾸는 배율은 `Editor.zoomTo` 가 보기 영역 가운데를, 휠은 커서 아래 점을 고정한다. 가운데 단추 드래그는 스크롤로 이동한다.

- **불변 상태 + 히스토리.** `present` 는 절대 변경하지 않고 새 객체를 `push` 한다. `isDirty = present !== savedPresent`. 이미지 dataURL 은 상태 간에 참조 공유되므로 100단계 히스토리도 가볍다(자르기만 새 이미지를 만든다).
- **한 제스처 = 한 히스토리 항목.** `Editor.jsx` 는 드래그 중에는 자기 ref 에만 미리보기를 두고 캔버스를 다시 그리며, pointerup 에서 한 번 `onCommit` 한다.
- **렌더러 하나.** `lib/render.js drawAnnotation / renderToCanvas` 를 편집 캔버스, 클립보드, 내보내기, 인쇄가 모두 쓴다. 모자이크는 원본 이미지에서 샘플링해 그리므로 비파괴적이다. 붙여 넣은 그림은 `image` 주석(`src` 에 PNG dataURL)이며, `renderToCanvas` 가 동기식이라 내보내기·인쇄·복사 전에 `preloadPictures` 로 디코딩을 기다린다.
- **클립보드.** 복사·잘라내기는 항상 그림(PNG + 비트맵)으로 시스템 클립보드에 넣어 다른 프로그램이 붙여 넣을 수 있게 한다. 주석을 복사하면 그 그림을 다시 읽은 값을 지문으로 `internalClip` 에 주석과 함께 기억하고, 붙여넣기 때 클립보드 그림이 지문과 같으면 편집 가능한 주석으로 되돌린다. 비트맵 형식은 알파가 없어서 완전 투명 픽셀은 흰색으로 써 둔다(`clipboard_write_image`).
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

툴바(`Toolbar.jsx`)는 두 행의 자식 폭 합(마진 포함, 오른쪽 정렬용 spacer 제외)을 재서 `win:setMinWidth` 로 보내고, 시작 화면(`Welcome`)은 스크롤 없이 다 보이는 데 필요한 높이를 `win:setMinHeight` 로 보낸다. 언어·글꼴이 바뀔 때마다 다시 잰다. main 은 프레임 여백을 더해 최소 크기를 정한다. 저장된 크기가 없으면 생성 후 4초 동안 그 최소 크기로 맞추고, 그 뒤로는 최소보다 좁아질 때만 넓힌다. 이동·크기 변경·종료 때 `window-state.json` 에 논리 픽셀 크기·위치·최대화를 남기고, 다음 실행은 창을 숨긴 채 그 값을 적용한 뒤 보여 준다. 최대화 중에는 화면 크기로 저장값을 덮어쓰지 않는다. 좌우 패널 접힘(`toolPanel.open`, `history.open`)은 바뀌는 즉시 `settings.json` 에 저장하고 종료 때 한 번 더 저장한다. 창은 그 설정을 읽어 패널을 그린 뒤에야 `win_show` 로 나타난다(4초 안에 오지 않으면 그대로 보여 준다).

편집 도구 버튼은 툴바가 아니라 왼쪽 도구 모음 패널(`ToolPanel.jsx`, `TOOLS`/`TOOL_KEYS`)에 있다. 펼침 상태와 폭은 설정의 `toolPanel: {open, width}` 에 저장되며, 오른쪽 캡처 기록은 `history: {open, width}` 다. 폭 한계 `TOOL_PANEL_WIDTH` 는 캡처 기록의 `HISTORY_WIDTH`(200–480px)와 같다. 접힌 상태(30px)에서도 아이콘 띠로 도구를 고를 수 있다. `Ctrl+B` 로 도구 모음을, `Ctrl+H` 로 캡처 기록을 접고 펼친다.

선택 영역은 `{x, y, w, h, shape}`(`shape`: `rect` · `round` · `ellipse`, 설정 `editor.selectionShape` 가 새 선택의 기본값)이다. `lib/selection.js` 의 `traceSelection` 이 윤곽을 그리고, `maskToSelection` 이 복사·자르기 결과를 모양 밖으로 투명하게 만들며, `eraseRect` 는 모양을 `destination-out` 으로 지운다. 둥근 사각형의 모서리 반지름은 짧은 변의 1/6 이다.

웹뷰 기본 컨텍스트 메뉴는 쓰지 않는다. `lib/contextMenu.js` 의 `installFallbackMenu` 가 창 단위 `contextmenu` 리스너로, 어떤 컴포넌트도 처리하지 않은(`preventDefault` 하지 않은) 우클릭에 대신 메뉴를 띄운다. 텍스트 입력란이면 편집 메뉴(메뉴가 열릴 때의 선택 범위를 기억했다가 포커스를 되돌린 뒤 `execCommand` 로 실행, 클립보드는 `platform.clipboard`), 선택한 글자면 복사, 메인 창의 나머지 곳은 일반 메뉴다. 메인 창은 네이티브 팝업으로, 대화상자 창은 창 안의 `ContextMenu` 로 띄운다. 자체 메뉴가 없는 컨트롤(확대/축소 막대, 플레이어 단추)은 `preventDefault` 와 `stopPropagation` 을 함께 호출한다.

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
- `scripts/copy-installer.mjs` 가 NSIS 설치 파일을 프로젝트 루트로 복사한다(`postbuild:win`).

## 13. 테스트

| 종류 | 명령 | 내용 |
|---|---|---|
| 단위 | `npm test` | history, settings 정규화/최근 목록, .cmcap 직렬화, 테마 토큰 무결성, ICO/ICNS 컨테이너 |
| 스모크 | `npm run smoke [이름]` | `scripts/smoke.mjs` 가 실제 Electron 을 별도 프로필로 띄우고 `test/smoke/*.js` 를 메인 창 안에서 실행(키/포인터 이벤트 합성). `--smoke-dialog-script` 는 다이얼로그 창 안에서 실행(영역 선택). 창마다 스크린샷을 `.smoke/` 에 남긴다 |

메인 프로세스의 스모크 훅(`--smoke-shot`, `--smoke-script`, `--smoke-dialog-script`, `--smoke-quit`)과 `window.__capturemaster` 개발 훅은 패키지된 빌드에서는 노출되지 않는다.
