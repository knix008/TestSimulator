# MyCapture 아키텍처

## 1. 개요

MyCapture 는 **Tauri 2** 데스크톱 앱입니다. 화면을 읽고 파일을 쓰는 일은 Rust, 화면 구성과 녹화 인코딩은 웹뷰(JavaScript)가 맡습니다.

```text
┌──────────────────────────── Rust (src-tauri/src) ─────────────────────────────┐
│ lib.rs          명령(command) 등록, 창 생성(메인·오버레이·녹화 제어판), 상태     │
│ capture.rs      xcap 으로 모니터·창·영역 캡처, 합성, 자르기, 6개 형식 인코딩     │
│ webm.rs         MediaRecorder WebM 에 Duration 기록 (EBML 재작성)               │
│ files.rs        파일 이름 정리, 겹치지 않는 이름, 탐색기 열기                    │
│ i18n.rs         tr!("한국어", "English") — 백엔드 메시지 언어                   │
│ permissions.rs  WebView2 마이크 권한 자동 허용 (Windows)                         │
└───────────────────────────────────┬───────────────────────────────────────────┘
                                    │ invoke (JSON / 원시 바이트) · 이벤트
┌───────────────────────────────────┴───────────────────────────────────────────┐
│ 웹뷰 (src/) — 한 번들, 창 레이블에 따라 세 역할                                 │
│  main.js ─┬─ app.js      "main"       메인 창 (상태 · 렌더링 · 동작)            │
│           ├─ overlay.js  "overlay-*"  영역 선택 (얼린 화면 위 드래그)           │
│           └─ recbar.js   "recbar"     전체 화면 녹화 제어판                      │
│  platform/native.js      Rust 명령을 감싼 유일한 경계                            │
│  platform/recorder.js    MediaRecorder 녹화 파이프라인 (두 엔진)                 │
│  platform/microphone.js  마이크 장치 · 게인 · 레벨 · 테스트 녹음                  │
│  domain/*                순수 로직 (세션 상태, 이름, 좌표, 설정) — DOM 없음       │
│  i18n.js · flags.js · icons.js                                                  │
└───────────────────────────────────────────────────────────────────────────────┘
```

원칙:

- **UI 는 Rust 를 `platform/native.js` 로만 부른다.** 브라우저(`npm run dev`)에서 열면 같은 UI 가 뜨고, 네이티브 기능은 "데스크톱 앱에서만" 오류로 막힌다.
- **무거운 명령은 async + `spawn_blocking`.** 동기 명령은 메인 스레드에서 돌기 때문에 캡처 중 UI 가 멈춘다. 창을 만드는 명령은 반드시 async (동기 명령에서 창을 만들면 Windows 에서 교착).
- **순수 로직은 DOM 없이 테스트한다.** `domain/*`, `i18n.js`, `microphone.js` 의 계산 함수는 `node --test` 로 검증한다.

## 2. MyCapture 가 캡처에 찍히지 않는 방법

두 겹으로 막는다.

1. **이미지 캡처**: `grab` 명령이 메인 창을 숨기고(`hide`) 260 ms 기다린 뒤 화면을 읽고 다시 보인다(`show` + `set_focus`). 모든 OS 에서 동작한다.
2. **녹화 · 미리보기**: 메인 창과 녹화 제어판은 `content_protected(true)` 로 만든다. Windows 10 2004+ 는 `SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE)`, macOS 는 `NSWindowSharingType::None`. 창은 사용자에게 보이지만 BitBlt · DXGI · WGC · getDisplayMedia 어디에도 찍히지 않는다. Linux 에는 같은 장치가 없어 녹화 시작 시 창을 최소화한다.

E2E 테스트가 `GetWindowDisplayAffinity == 0x11` 을 확인한다.

## 3. 이미지 캡처 흐름

```text
[📷] → grab(source) ──Rust──▶ 창 숨김 → xcap 캡처 → 창 표시 → pending 에 보관 → 썸네일 반환
       │
       ├─ 클립보드 복사 켜짐 → copy_pending (arboard)
       └─ chooseOutput()  저장 대화상자 또는 폴더 자동 이름
            └─ save_pending(output, format, quality) → 인코딩 후 한 번에 쓰기 (부분 파일 없음)
```

- 화면을 **먼저** 읽고 저장 위치는 나중에 묻는다. 대화상자가 떠 있는 동안의 화면이 찍히지 않게.
- `Source` = `monitor{id}` · `allMonitors` · `window{id}` · `region{monitorId,x,y,width,height}`. 좌표는 모두 물리 픽셀.
- `allMonitors` 는 각 모니터를 가상 데스크톱 위치에 합성한다(빈 곳은 검정).
- 형식: JPG(품질) · PNG(빠른 압축) · GIF(NeuQuant 256색, speed 10) · TIFF · BMP(RGB) · WEBP(무손실, 순수 Rust 인코더는 무손실만 지원).

### 영역 선택

```text
begin_region_select ─▶ 메인 숨김 → 모든 모니터 캡처(frozen) → 모니터마다 "overlay-<회차>-<i>" 창
overlay.js          ─▶ overlay_frame (원시 RGBA, 헤더 8바이트) → 캔버스 → overlay_ready (표시 + 포커스)
드래그 / 클릭 / Esc  ─▶ finish_region_select(rect|null) → 오버레이 닫기 → 메인 표시
                        → frozen 이미지에서 잘라 pending 에 → "region-selected" 이벤트
```

- 사용자가 본 바로 그 화면(얼린 이미지)을 자르므로, 선택하는 동안 화면이 바뀌어도 결과는 본 그대로다.
- 오버레이 좌표 = CSS 좌표 × (이미지 폭 / 창 폭). 창이 모니터와 똑같은 물리 크기라 배율과 무관하다.
- 오버레이 창은 `set_position` 다음 `set_size` (다른 DPI 모니터로 옮겨지며 크기가 바뀔 수 있어서), `overlay_ready` 에서 한 번 더 맞춘다.

## 4. 녹화 파이프라인

```text
           ┌ display 엔진: getDisplayMedia (OS 선택 창, 포인터, 시스템 오디오)
비디오 ────┤                └ 영역이면 <video> → 캔버스로 잘라 captureStream
           └ native 엔진 : grab_frame 을 워커 타이머로 반복 → 캔버스 → captureStream
오디오 ──── 마이크 체인(장치 → 게인 → 출력) + 시스템 오디오를 같은 AudioContext 에서 섞음
                │
          MediaRecorder (MP4: H.264+AAC, 정지 때 한 번에 / WebM: VP9+Opus, 1초 조각)
                │ dataavailable
          recording_write (원시 바디 + x-recording-id 헤더) ──Rust──▶ 열린 파일에 append
                │ 정지
          recording_finish(durationMs) ─▶ WebM 이면 Info/Duration 기록 (webm.rs)
```

주의할 점과 그 이유:

- **워커 타이머**: 창이 최소화되면 페이지 타이머가 느려진다. 프레임 펌프와 자르기는 Worker 의 `setInterval` 로 돌리고, WebView2 에 `--disable-background-timer-throttling` 등을 준다(`BROWSER_ARGS`). WebView2 는 같은 프로필의 웹뷰가 모두 같은 인자를 써야 하므로 메인·오버레이·제어판 모두 같은 상수를 쓴다.
- **native 엔진 처리량**: 1920×1200 RGBA 한 장은 9 MB 이고 IPC 가 캡처보다 오래 걸린다. 요청을 최대 4개 겹쳐 보내고(순번으로 오래된 프레임은 버림) 10 → 약 20 fps 로 올렸다.
- **H.264 인코더 시작 지연**: Chromium 의 H.264 인코더는 프로세스에서 처음 쓸 때 5초 가량 걸리고, 그 전에 정지한 MP4 는 비거나 1프레임이 된다. 실험 결과: (a) MediaRecorder 에 시간 조각(timeslice)을 주면 MP4 인코더 시작이 불안정해지고, (b) 일시정지 상태에서는 인코더가 시작되지 않으며, (c) "첫 데이터" 이벤트는 준비 완료의 믿을 만한 신호가 아니다. 그래서 MP4 는 조각 없이 녹화하고(어차피 먹서가 정지 때 한 번에 넘김), 앱 시작 즉시 64×64 캔버스로 한 번 인코딩해 두며(`warmUpEncoder`), 그 준비가 끝나기 전에 시작한 MP4 녹화는 준비가 끝날 때까지 "녹화 준비 중" 으로 기다린다(`encoderWarm`).
- **MP4 마지막 조각**: MP4 먹서는 정지할 때 파일 전체를 넘기고, 그 조각이 stop 이벤트 직후에 올 수 있어 마지막 `dataavailable` 을 기다린다.
- **WebM 길이**: 실시간 WebM 에는 Duration 이 없어 플레이어가 길이를 모르고 탐색이 안 된다. 정지 후 Info 요소만 다시 써서 Duration(일시정지 제외 시간)을 넣는다. Cluster 는 그대로 복사한다.
- **짝수 크기**: 인코더 요구로 캔버스는 짝수 픽셀. 창 크기가 녹화 중 바뀌면 고정 크기에 레터박스로 맞춘다.
- **세션 상태**: `domain/session.js` 의 리듀서 `idle → starting → recording ⇄ paused → stopping → idle`. 실패는 어느 단계에서든 idle + 메시지.

### 전체 화면 녹화 제어판

화면 전체(native 의 monitor, 또는 display 에서 `displaySurface === 'monitor'` 이고 영역이 아닐 때)를 녹화하면 `show_recording_panel` 이 "recbar" 창(항상 위, 작업 표시줄 없음, 캡처 제외)을 녹화 중인 모니터 위쪽 가운데에 띄우고 메인 창을 최소화한다.
메인 창이 녹화를 소유하고, 제어판은 상태를 비춰 보기만 한다.

```text
main  ── emit("recording-state", session) ──▶ recbar (시계 · 일시정지 표시)
main ◀── emit("recbar-command", {command}) ── recbar (pause · resume · stop · show · ready)
```

## 5. 캡처 기록

- `domain/gallery.js`: 최신 순으로 저장(최대 300개, 같은 경로는 교체)하고, 패널은 거꾸로(오래된 것 위 → 새것 아래) 그린다, localStorage `mycapture.gallery.v1` 에 240px JPEG 썸네일과 함께 저장. 불러올 때 깨진 항목 · 중복 · `data:image/` 가 아닌 썸네일을 버린다.
- 이미지는 `save_pending` 성공 뒤, 동영상은 `recording_finish` 성공 뒤(정지 직전 미리보기 프레임을 썸네일로) 추가된다.
- 삭제(개별 · 전체)는 목록에서만 지운다. 저장된 파일은 절대 건드리지 않는다(E2E 가 파일이 남아 있는지 확인).
- 시작할 때 `paths_exist` 로 사라진 파일을 표시한다.
- **보기**(`src/viewer.js`, `MediaViewer`): 항목을 고르면 미리보기 자리에 띄운다. 파일은 Tauri asset 프로토콜로 읽는다(`protocol-asset` 기능, HTTP range 지원이라 큰 동영상도 스트리밍). asset 범위는 비어 있고, `allow_preview` 가 사용자가 연 파일 하나씩만 허용한다. 이미지는 `translate + scale` 변환(맞춤 · 100 % · 커서 중심 휠 확대 · 드래그 이동, 계산은 `fitScale` / `zoomAround` / `centred` 로 단위 테스트), 동영상은 `<video>` + 자체 버튼(정지 = 일시정지 + 처음으로).

## 6. 창과 크롬

- OS 제목 표시줄 없음(`decorations(false)`). 상단 막대 전체가 `data-tauri-drag-region`, 오른쪽에 최소화·최대화·닫기. 상태 바 오른쪽 아래 ◢ 는 `startResizeDragging('SouthEast')`.
- 본문은 `왼쪽 패널 | 막대 | 미리보기 | 막대 | 오른쪽 패널` 5열 그리드. 막대를 끌면 폭이 바뀌고(`leftWidth` · `rightWidth` 저장), 왼쪽 패널의 최소 폭은 탭 버튼들의 실제 글자 폭으로 계산한다(`leftMinWidth`, 언어가 바뀌면 다시 계산). 접힌 패널은 52px 띠(아이콘 + 세로 제목).
- 최소 크기 860 × 600 에서도 모든 버튼이 창 안에 있고 다른 요소에 가리지 않는다(E2E 가 모든 모드·대상·설정 탭에서 `elementFromPoint` 로 확인). 패널은 목록만 스크롤되고 머리와 탭은 항상 보인다.
- 창 위치 · 크기 · 최대화는 `window_state.rs` 가 `%APPDATA%\com.shkwon.mycapture\window-state.json` 에 저장한다. 이동 · 크기 변경마다 기록하고 마지막 변경 0.5초 뒤 쓰기(강제 종료돼도 남음). 다음 실행 때 그 자리가 연결된 모니터 위에 있으면 **창 빌더**에 위치 · 크기를 넘긴다(숨긴 프레임 없는 창을 나중에 set_size 하면 Windows 가 제목 표시줄 높이 30px 를 더함). 테스트는 `MYCAPTURE_CONFIG_DIR` 로 다른 폴더를 쓴다.
- 상단 막대와 OS 창 제목은 `MyCapture v<major>.<minor>` (package.json / Cargo 버전에서).
- **팝업 창**: 설정 · 프로그램 정보 · 확인 · 테마 목록은 각각 OS 창(`popup-<kind>`, `src/popup.js`)이다. `open_popup` 이 메인 창을 owner(`parent`)로 만들어 메인 위에 있고 함께 최소화되며, 메인 창 밖으로 나가거나 옮겨질 수 있다. 캡처 제외(content protection)도 메인과 같다. 페이지가 그려지면 `popup_ready` 로 보여 깜박임이 없다.
- 창 사이 통신은 localStorage: 설정(`mycapture.settings.v1`) · 캡처 기록 · 녹화 상태(`mycapture.session`) · 팝업 여는 값(`mycapture.popup.<kind>`)을 쓰면 다른 창이 `storage` 이벤트로 받아 다시 그린다. 상태 바 알림만 Tauri 이벤트(`mycapture-notice`).
- 설정 창은 720 × 650 고정(크기 조절 불가), 6개 탭 모두 스크롤 없이 들어간다(E2E 가 두 언어로 확인). 마이크 탭이 보일 때만 마이크를 연다. 프로그램 정보 창은 내용 높이에 맞춰 줄어든다. 테마 목록은 포커스를 잃으면 닫힌다.
- **오른쪽 클릭 메뉴**도 팝업 창(`menu`)이다. 메인이 클릭한 곳에 맞는 항목(`{ command, icon, label }`)을 만들어 `mycapture.popup.menu` 로 넘기고, 메뉴는 고른 명령을 `mycapture-menu` 이벤트로 돌려준다. 화면 가장자리에서는 위 · 왼쪽으로 펼친다. 브라우저 기본 메뉴는 모든 창에서 막고(검색 칸 제외), 경로 복사는 포커스가 다른 창에 있어도 되도록 Rust(`copy_text`, arboard)로 한다.
- 메인 창이 없어지면(`WindowEvent::Destroyed`) `app.exit(0)` — 팝업 · 오버레이 · 녹화 제어판이 남아 프로세스를 붙잡지 않는다.

## 7. 다국어

- `i18n.js` 의 `messages.ko` / `messages.en` (키 동일, 자리표시자 `{name}` 동일 — 단위 테스트가 확인), `t(key, values)`.
- 언어를 바꾸면 `set_language` 명령으로 백엔드도 바뀐다. Rust 메시지는 `tr!("한국어 {x}", "English {x}")` 매크로.
- 국기 버튼은 **바꿀 언어**의 국기: 한국어 화면 → 영국, 영어 화면 → 태극기 (`flags.js`, 인라인 SVG).
- 첫 실행은 시스템 언어(ko* → 한국어, 그 밖 → 영어).

## 8. 테마

- `src/themes.js`: 밝은 20 · 어두운 20 팔레트(다른 My* 앱과 같은 색), 사용자 정의, `system`(OS 의 밝은/어두운 설정을 따름 — `matchMedia` 변경도 따라감).
- 테마 하나 = `<html>` 에 넣는 CSS 변수 묶음(`--bg`, `--panel`, `--text`, `--accent`, `--rec` …). 보조 색(hover · 경고 · 성공 · 미리보기 배경)은 기본 색에서 계산한다. 강조 버튼 글자색은 흰색 / 거의 검정 가운데 WCAG 대비가 큰 쪽.
- `main.js` 가 첫 화면을 그리기 전에 적용한다(잘못된 색으로 깜박이지 않음).
- 단위 테스트가 40개 모두 글자 대비 7:1 이상, 보조 글자 3:1 이상, 강조 버튼 글자 3:1 이상인지 확인한다.

## 9. 설정과 데이터

- 설정은 웹뷰 localStorage `mycapture.settings.v1` 에 JSON 으로. 읽을 때마다 `sanitizeSettings` 가 모든 필드를 검증한다(손상되거나 옛 형식이어도 기본값으로).
- 위치: Windows `%LOCALAPPDATA%\com.shkwon.mycapture\EBWebView`. 설치 프로그램이 이 폴더를 지울지 묻는다.

## 10. 테스트

`npm test` (`scripts/test.mjs`) 가 네 분류를 차례로 돌리고 결과를 분류별 · 실패 우선 · 느린 순으로 정렬해 보여 준다. `test-results/results.json` 에도 남긴다.

| 분류 | 위치 | 내용 |
| --- | --- | --- |
| JS 단위 | `test/unit/*.test.js` | 세션 상태, 파일 이름, 좌표, 설정 검증, 번역 키 완전성, 마이크 레벨 계산, MIME 선택 |
| Rust 단위 | `src-tauri/src/*.rs` 의 `#[cfg(test)]` | 6개 형식 인코딩·복원, WebM Duration, 자르기·합성, 경로 |
| Rust 통합 | `test/capture_integration.rs` | 실제 모니터 · 모든 화면 · 영역 · 창 캡처와 저장 |
| E2E | `test/e2e/harness.mjs`, `suite.mjs` | 실제 앱을 띄워 CDP 로 조작: 6개 형식 저장, 창·영역(오버레이 드래그·Esc), 녹화 4종(ffprobe 검증), 제어판, 마이크 탭, 설정 탭 스크롤 없음, 언어 전환, 패널 접기, 최소 크기, 캡처 제외 |

E2E 는 자기만의 WebView2 프로필(`WEBVIEW2_USER_DATA_FOLDER`)과 임시 저장 폴더를 써서 사용자의 설정이나 파일을 건드리지 않는다. 가짜 미디어 플래그로 화면 선택 창을 자동 수락하고 테스트 마이크를 쓴다.

## 11. 빌드와 설치 파일

`npm run build:win | build:mac | build:linux | build:all` → `scripts/build.mjs` → `tauri build --bundles …` → `release/` 와 프로젝트 루트에 `MyCapture-Setup-<버전>.exe` 등.

- Windows NSIS: 현재 사용자 설치, 한국어/영어 선택, 헤더·사이드바 이미지(`src-tauri/windows/*.bmp`), 기존 설치 처리(Tauri 재설치 페이지), `hooks.nsh` 의 사용자 데이터 삭제 질문(UTF-8 BOM 필수).
- MSI 는 만들지 않는다(같은 버전 재설치 시 파일이 교체되지 않는 문제).
- 아이콘: `assets/icon.svg` 가 원본. `npm run build:icons` 가 헤드리스 Edge/Chrome 으로 래스터화해 `assets/icon.png|ico|icns`, `src-tauri/icons/*`, 설치 프로그램 BMP 를 만든다.
- Tauri 는 교차 빌드를 하지 않으므로 각 OS 에서 그 OS 의 설치 파일을 만든다.
